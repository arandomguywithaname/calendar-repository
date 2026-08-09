'use strict';
/* ------------------------------------------------------------------
   game.js — match flow, combat, grenades, the bomb, input and the
   render loop. Offline play runs entirely here; in PvP the room host
   runs this same logic and broadcasts the authoritative events.
   ------------------------------------------------------------------ */

const PHASE = { WARMUP: 'warmup', FREEZE: 'freeze', LIVE: 'live', END: 'end', MATCHEND: 'matchend' };

const RULES = {
  freezeTime: 12,
  buyTime: 20,
  roundTime: 115,
  bombTime: 40,
  endTime: 5,
  plantTime: 3.2,
  defuseTime: 10,
  defuseTimeKit: 5,
  startMoney: 800,
  maxMoney: 16000,
  winReward: 3250,
  defuseReward: 3500,
  detonateReward: 3500,
  plantBonus: 300,
  lossBonus: [1400, 1750, 2100, 2450, 2900],
  bombPlantTeamBonus: 800,
};

class Game {
  constructor() {
    this.canvas = document.getElementById('view');
    this.renderer = null;
    this.map = null;
    this.sound = new SoundSystem();
    this.net = new NetClient();
    this.entities = [];
    this.localPlayer = null;
    this.spectateIndex = 0;
    this.time = 0;
    this.phase = PHASE.WARMUP;
    this.phaseTime = 0;
    this.roundNumber = 0;
    this.score = { T: 0, CT: 0 };
    this.lossStreak = { T: 0, CT: 0 };
    this.mode = 'offline';
    this.running = false;
    this.paused = false;
    this.shopOpen = false;
    this.spotted = new Set();
    this.smokes = [];
    this.fires = [];
    this.grenades = [];
    this.tracers = [];
    this.particles = [];
    this.droppedWeapons = [];
    this.bomb = {
      planted: false, dropped: false, carrier: null, pos: [0, 0, 0],
      timer: 0, site: null, defusing: null, defuseTime: 0, exploded: false,
    };
    this.bombCarrierSeen = null;
    this.keys = new Set();
    this.mouse = { left: false, right: false };
    this.lastWeaponSlot = 'secondary';
    this.viewmodelCache = {};
    this.assets = { parts: {}, worldGuns: {} };
    this.pendingHits = [];
    this.frameCount = 0;
    this.fps = 0;
    this.matchTarget = 13;
  }

  /* ============================== boot ============================== */

  async init() {
    const loading = document.getElementById('loading');
    loading.classList.remove('hidden');
    document.getElementById('loadText').textContent = 'Compiling shaders…';
    await frame();

    try {
      this.renderer = new Renderer(this.canvas);
    } catch (err) {
      loading.classList.add('hidden');
      this.fatal(err.message);
      throw err;
    }

    document.getElementById('loadText').textContent = 'Building the map…';
    await frame();
    this.map = new GameMap();
    const mb = new MeshBuilder();
    this.map.buildMesh(mb);
    this.worldMesh = this.renderer.createMesh(mb);

    document.getElementById('loadText').textContent = 'Preparing models…';
    await frame();
    this.assets.parts.T = buildCharacterParts(this.renderer, 'T');
    this.assets.parts.CT = buildCharacterParts(this.renderer, 'CT');
    for (const kind of Object.keys(GUN_PARTS)) {
      const b = new MeshBuilder();
      buildGunMesh(b, kind, [1, 1, 1]);
      this.assets.worldGuns[kind] = this.renderer.createMesh(b);
    }
    const bombBuilder = new MeshBuilder();
    bombBuilder.box([-0.16, 0, -0.11], [0.16, 0.1, 0.11], MAT.BOMB, { uvScale: 3 });
    bombBuilder.box([-0.07, 0.1, -0.05], [0.07, 0.16, 0.05], MAT.GUNMETAL, { uvScale: 6, tint: [0.5, 0.5, 0.5] });
    this.bombMesh = this.renderer.createMesh(bombBuilder);

    this.hud = new HUD(this);
    this.hud.buildRadarMap(this.map);
    this.applySettings();
    this.bindInput();
    this.bindMenus();

    loading.classList.add('hidden');
    this.loop = this.loop.bind(this);
    this.lastFrame = performance.now();
    requestAnimationFrame(this.loop);
  }

  fatal(msg) {
    document.getElementById('fatalMsg').textContent = msg;
    document.getElementById('fatal').classList.remove('hidden');
  }

  applySettings() {
    const s = this.hud ? this.hud.settings : DEFAULT_SETTINGS;
    this.renderer.renderScale = s.renderScale;
    this.renderer.resize();
    this.sound.setVolume(s.volume);
    this.settings = s;
  }

  /* ============================ match setup ============================ */

  startMatch(opts) {
    const s = this.hud.settings;
    this.mode = opts.mode || 'offline';
    this.difficulty = opts.difficulty || 'normal';
    this.teamSize = opts.teamSize || 5;
    this.matchTarget = this.teamSize >= 5 ? 13 : 8;
    this.entities = [];
    this.score = { T: 0, CT: 0 };
    this.lossStreak = { T: 0, CT: 0 };
    this.roundNumber = 0;
    this.sideSwapped = false;

    let myTeam = opts.team;
    if (!myTeam || myTeam === 'random') myTeam = Math.random() < 0.5 ? 'T' : 'CT';

    this.localPlayer = new Character(myTeam, (s.name || 'player').slice(0, 14), false);
    this.localPlayer.isLocal = true;
    this.entities.push(this.localPlayer);

    // Remote humans first, then bots to fill.
    if (this.mode === 'pvp') {
      for (const p of this.net.players.values()) {
        if (p.id === this.net.id) { p.entity = this.localPlayer; continue; }
        const ent = new Character(p.team, p.name, false);
        ent.netId = p.id;
        ent.isRemote = true;
        p.entity = ent;
        this.entities.push(ent);
      }
    }

    if (this.mode !== 'pvp' || opts.fillBots) {
      const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
      let n = 0;
      for (const team of ['T', 'CT']) {
        const have = this.entities.filter(e => e.team === team).length;
        for (let i = have; i < this.teamSize; i++) {
          this.entities.push(new Bot(team, names[n++ % names.length], this.difficulty));
        }
      }
    }

    for (const e of this.entities) {
      e.money = this.mode === 'practice' ? RULES.maxMoney : RULES.startMoney;
      e.kills = e.deaths = e.assists = 0;
      e.damageDealt = 0;
      e.inventory.primary = null;
      e.inventory.secondary = null;
      e.grenades = [];
      e.armor = 0; e.helmet = false; e.defuser = false;
      e.giveWeapon(e.team === 'T' ? 'glock' : 'usp');
    }

    this.running = true;
    this.paused = false;
    document.getElementById('hud').classList.remove('hidden');
    this.hud.lastMoney = this.localPlayer.money;
    this.sound.init();

    if (this.mode === 'practice') {
      this.phase = PHASE.WARMUP;
      this.phaseTime = 9999;
      this.roundNumber = 1;
      this.setupRound(true);
    } else {
      this.startRound();
    }
    // The buy menu grabs the cursor first; only lock the mouse when it is closed.
    if (!this.shopOpen) this.requestPointerLock();
  }

  isHost() { return this.mode !== 'pvp' || this.net.host; }

  startRound() {
    this.roundNumber++;
    // Side swap at the halfway point, like a real competitive match.
    if (!this.sideSwapped && this.roundNumber === this.matchTarget) {
      this.sideSwapped = true;
      for (const e of this.entities) e.team = e.team === 'T' ? 'CT' : 'T';
      const t = this.score.T; this.score.T = this.score.CT; this.score.CT = t;
      const ls = this.lossStreak.T; this.lossStreak.T = this.lossStreak.CT; this.lossStreak.CT = ls;
      for (const e of this.entities) {
        e.money = RULES.startMoney;
        e.inventory.primary = null;
        e.inventory.secondary = null;
        e.grenades = []; e.armor = 0; e.helmet = false; e.defuser = false;
        e.giveWeapon(e.team === 'T' ? 'glock' : 'usp');
      }
      this.hud.centerMessage('SIDES SWAPPED', 'Second half');
    }
    this.phase = PHASE.FREEZE;
    this.phaseTime = RULES.freezeTime;
    this.setupRound(false);
    this.sound.play('roundstart');
    this.hud.centerMessage(`ROUND ${this.roundNumber}`, 'Buy your equipment — press B');
    setTimeout(() => this.hud.centerMessage(''), 2600);
    if (this.localPlayer.alive && this.mode !== 'practice') this.openShop(true);
  }

  setupRound(practice) {
    const map = this.map;
    this.bomb = {
      planted: false, dropped: false, carrier: null, pos: [0, 0, 0],
      timer: RULES.bombTime, site: null, defusing: null, defuseTime: 0, exploded: false,
    };
    this.smokes = [];
    this.fires = [];
    this.grenades = [];
    this.tracers = [];
    this.particles = [];
    this.droppedWeapons = [];
    this.bombCarrierSeen = null;
    this.renderer.clearDecals();

    const spawnCounts = { T: 0, CT: 0 };
    const ts = this.entities.filter(e => e.team === 'T');
    for (const e of this.entities) {
      // Anyone who died last round loses their kit, exactly like CS.
      if (!practice && e.survived === false) {
        e.inventory.primary = null;
        e.inventory.secondary = null;
        e.grenades = [];
        e.armor = 0;
        e.helmet = false;
        e.defuser = false;
        e.giveWeapon(e.team === 'T' ? 'glock' : 'usp');
      }
      e.survived = true;
      const list = map.spawns[e.team];
      const spawn = list[spawnCounts[e.team]++ % list.length];
      e.resetForRound(spawn, map.spawnYaw[e.team] + rand(-0.25, 0.25));
      e.hasBomb = false;
      if (!e.inventory.secondary && !e.inventory.primary) {
        e.giveWeapon(e.team === 'T' ? 'glock' : 'usp');
      }
      if (e.isBot && !practice) {
        e.holdSpot = null;
        e._pushIndex = 0;
        e.target = null;
        e.path = null;
      }
      if (practice) { e.money = RULES.maxMoney; e.armor = 100; e.helmet = true; }
    }

    // Give one T the bomb.
    if (ts.length) {
      const carrier = pick(ts);
      carrier.hasBomb = true;
      this.bomb.carrier = carrier;
    }

    // Bots plan the round: T's pick a site, CT's split between the two.
    if (this.isHost()) {
      const attackSite = Math.random() < 0.5 ? 'A' : 'B';
      let ctIndex = 0;
      for (const e of this.entities) {
        if (!e.isBot) continue;
        if (e.team === 'T') {
          e.goalSite = Math.random() < 0.78 ? attackSite : (attackSite === 'A' ? 'B' : 'A');
          if (e.hasBomb) e.goalSite = attackSite;
        } else {
          e.goalSite = ctIndex++ % 2 === 0 ? 'A' : 'B';
          if (Math.random() < 0.18) e.goalSite = 'MID';
        }
        if (!practice) e.buy(this);
      }
    }
    this.hud.renderShop();
  }

  /* ============================== economy ============================== */

  canBuy(ent) {
    if (this.mode === 'practice') return true;
    if (!ent.alive) return false;
    if (this.phase === PHASE.FREEZE) return true;
    if (this.phase === PHASE.LIVE) {
      const elapsed = RULES.roundTime - this.phaseTime;
      return elapsed < RULES.buyTime - RULES.freezeTime && this.inSpawnArea(ent);
    }
    return false;
  }

  inSpawnArea(ent) {
    const spawns = this.map.spawns[ent.team];
    return spawns.some(s => V.distXZ(s, ent.pos) < 12);
  }

  ownsItem(p, item) {
    if (item.kind === 'weapon') {
      const w = item.weapon || WEAPONS[item.key];
      if (!w) return false;
      if (w.slot === SLOT.PRIMARY) return p.inventory.primary === item.key;
      return p.inventory.secondary === item.key;
    }
    if (item.kind === 'grenade') {
      const g = GRENADES[item.key];
      const max = g.max || 1;
      return p.grenades.filter(x => x === item.key).length >= max || p.grenades.length >= 4;
    }
    if (item.key === 'kevlar') return p.armor > 0;
    if (item.key === 'kevlarhelm') return p.armor > 0 && p.helmet;
    if (item.key === 'defuser') return p.defuser;
    return false;
  }

  buyItem(item) {
    const p = this.localPlayer;
    if (!this.canBuy(p)) { this.sound.play('error'); return; }
    if (this.ownsItem(p, item)) { this.sound.play('error'); return; }
    if (p.money < item.price) { this.sound.play('error'); return; }
    if (item.kind === 'gear' && item.key === 'defuser' && p.team !== 'CT') { this.sound.play('error'); return; }

    p.money -= item.price;
    if (item.kind === 'weapon') {
      // The Zeus occupies the pistol slot, so remember what it displaced.
      if (item.key === 'zeus') p.zeusPrev = p.inventory.secondary;
      p.giveWeapon(item.key);
    } else if (item.kind === 'grenade') {
      if (p.grenades.length >= 4) { p.money += item.price; this.sound.play('error'); return; }
      p.grenades.push(item.key);
    } else if (item.key === 'kevlar') {
      p.armor = 100;
    } else if (item.key === 'kevlarhelm') {
      p.armor = 100; p.helmet = true;
    } else if (item.key === 'defuser') {
      p.defuser = true;
    }
    this.sound.play('buy');
    this.hud.renderShop();
  }

  awardMoney(ent, amount) {
    ent.money = clamp(ent.money + amount, 0, RULES.maxMoney);
  }

  /* ============================== combat ============================== */

  /** Fire (or start a melee swing / grenade throw) for any character. */
  tryFire(ent, secondary) {
    if (!ent.alive || this.phase === PHASE.FREEZE || this.phase === PHASE.END) return;
    if (ent.deploying > 0 || ent.reloading > 0) return;
    if (this.time < ent.nextFire) return;

    if (ent.slot === 'grenade') { this.throwGrenade(ent, secondary); return; }
    if (ent.slot === 'bomb') return;

    const w = ent.weapon;
    if (!w) return;

    if (w.melee) {
      ent.nextFire = this.time + (secondary ? 1.0 : 1 / w.fireRate);
      this.meleeAttack(ent, secondary);
      return;
    }

    const ammo = ent.ammoFor(ent.weaponKey);
    if (ammo.mag <= 0) {
      ent.nextFire = this.time + 0.25;
      if (ent === this.localPlayer) this.sound.play('dryfire');
      if (ammo.reserve > 0) this.startReload(ent);
      return;
    }
    if (w.taser) {
      this.taserAttack(ent);
      ammo.mag = 0;
      ent.nextFire = this.time + 1.2;
      return;
    }

    ammo.mag--;
    ent.nextFire = this.time + 1 / w.fireRate + (w.boltTime && ammo.mag > 0 ? w.boltTime : 0);
    ent.lastShot = this.time;

    const pattern = w.pattern || [[0, 0]];
    // sprayIndex decays fractionally between bursts, so floor it before indexing.
    const idx = clamp(Math.floor(ent.sprayIndex), 0, pattern.length - 1);
    const rec = pattern[idx];
    ent.sprayIndex++;
    ent.recoil = [rec[0], rec[1]];
    ent.shotSpread = Math.min(ent.shotSpread + w.recoil * 0.35, w.recoil * 3.2);

    const state = {
      speed: Math.hypot(ent.vel[0], ent.vel[2]), onGround: ent.onGround,
      crouching: ent.ducking, zoomed: ent.zoomLevel > 0, shotSpread: ent.shotSpread,
    };
    const cone = weaponInaccuracy(w, state);

    // Bullets follow the recoil offset; the view punch shows the same climb.
    const baseYaw = ent.yaw - rec[0] * DEG;
    const basePitch = clamp(ent.pitch + rec[1] * DEG, -1.55, 1.55);
    const origin = ent.eyePos();
    const pellets = w.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const spreadAngle = Math.random() * TAU;
      const spreadMag = Math.sqrt(Math.random()) * cone;
      const dir = angleVector(
        baseYaw + Math.cos(spreadAngle) * spreadMag,
        basePitch + Math.sin(spreadAngle) * spreadMag * 0.9
      );
      this.fireBullet(ent, origin, dir, w);
    }

    // view punch
    ent.punch[0] = -rec[0] * 0.75;
    ent.punch[1] = rec[1] * 0.75;
    if (ent === this.localPlayer) {
      this.shakeAmount = Math.min(0.5, (this.shakeAmount || 0) + w.recoil * 0.02);
      this.renderer.muzzleLight = 1;
      this.vmKick = Math.min(1.5, (this.vmKick || 0) + 0.5 + w.recoil * 0.08);
    }

    this.spawnMuzzleFlash(ent, w);
    this.sound.play(w.sound || 'rifle', ent === this.localPlayer ? null : ent.eyePos(),
      ent === this.localPlayer ? { refDist: 2 } : {});
    this.notifyNoise(ent.pos, w.silenced ? 0.45 : 1.35);

    if (this.mode === 'pvp' && ent === this.localPlayer) {
      this.net.send({
        t: 'shot', o: origin.map(v => Math.round(v * 100) / 100),
        d: [Math.round(baseYaw * 1000) / 1000, Math.round(basePitch * 1000) / 1000],
        w: ent.weaponKey,
      });
    }
  }

  /** Trace one bullet, applying wall penetration and damage. */
  fireBullet(shooter, origin, dir, weapon, depth = 0, damageScale = 1) {
    const maxDist = 200;
    const mapHit = this.map.raycast(origin, dir, maxDist);
    let best = null;
    const limit = mapHit ? mapHit.t : maxDist;

    for (const e of this.entities) {
      if (e === shooter || !e.alive) continue;
      if (this.mode !== 'practice' && e.team === shooter.team) continue;
      const hit = e.rayHit(origin, dir, limit);
      if (hit && (!best || hit.t < best.t)) best = hit;
    }

    if (best) {
      const dist = best.t;
      let dmg = computeDamage(weapon, dist, best.group, best.entity.helmet) * damageScale;
      this.applyDamage(best.entity, shooter, dmg, weapon, best.group, best.point, depth > 0);
      this.spawnBloodEffect(best.point, dir);
      // Rifles can over-penetrate a body.
      if (weapon.penetration >= 3 && depth === 0 && Math.random() < 0.4) {
        this.fireBullet(shooter, V.mad(best.point, dir, 0.4), dir, weapon, depth + 1, damageScale * 0.5);
      }
      return;
    }

    if (!mapHit) return;
    this.spawnImpact(mapHit, dir, shooter === this.localPlayer);

    // Wall penetration: exit the solid and keep going with reduced damage.
    if (weapon.penetration > 0 && depth < 2) {
      const s = mapHit.solid;
      const enter = mapHit.point;
      const inside = V.mad(enter, dir, 0.02);
      const exitT = exitDistance(inside, dir, s.min, s.max);
      const thickness = exitT;
      const maxThickness = weapon.penetration * 0.5;
      if (thickness > 0 && thickness < maxThickness) {
        const exitPoint = V.mad(inside, dir, exitT + 0.02);
        const loss = 0.42 + 0.30 * (thickness / maxThickness);
        this.spawnImpact({ point: exitPoint, normal: V.mul(dir, -1) }, dir, false);
        this.fireBullet(shooter, exitPoint, dir, weapon, depth + 1, damageScale * (1 - loss));
      }
    }

    // Tracer + whiz-by for anyone standing near the line of fire.
    if (shooter !== this.localPlayer && this.localPlayer.alive) {
      const eye = this.localPlayer.eyePos();
      const toEye = V.sub(eye, origin);
      const along = V.dot(toEye, dir);
      if (along > 0 && along < mapHit.t) {
        const perp = V.len(V.sub(toEye, V.mul(dir, along)));
        if (perp < 1.6) this.sound.play('whiz', V.mad(origin, dir, along), { refDist: 3 });
      }
    }
  }

  applyDamage(victim, attacker, damage, weapon, group, point, penetrated) {
    if (!victim.alive) return;
    const applied = victim.takeDamage(damage, weapon.armorPen, attacker, group);
    if (attacker) attacker.damageDealt += applied;

    const headshot = group === HITGROUP.HEAD;
    if (attacker === this.localPlayer) {
      this.sound.play(headshot ? 'headshot' : 'hitmarker');
      this.hud.hitmarker(victim.health <= 0);
    }
    this.sound.play('hit', point, { refDist: 4 });

    if (victim === this.localPlayer) {
      this.hud.damageFlash(applied);
      if (attacker) {
        const a = Math.atan2(attacker.pos[0] - victim.pos[0], -(attacker.pos[2] - victim.pos[2]));
        this.hud.damageDirection(-(a - victim.yaw) + Math.PI);
      }
      this.shakeAmount = Math.min(0.9, (this.shakeAmount || 0) + applied * 0.006);
    }
    if (victim.isBot && attacker) {
      // Getting shot from an unseen angle makes bots spin and look.
      if (!victim.target) {
        victim.investigate = [attacker.pos[0], attacker.pos[1], attacker.pos[2]];
        victim.investigateTimer = 4;
      }
    }

    if (victim.health <= 0) this.killPlayer(victim, attacker, weapon, headshot, penetrated);
  }

  killPlayer(victim, attacker, weapon, headshot, penetrated) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.health = 0;
    victim.deaths++;
    victim.deathTime = this.time;
    victim.deathSide = Math.random() < 0.5 ? -1 : 1;
    victim.zoomLevel = 0;
    this.sound.play('death', victim.pos);

    if (attacker && attacker !== victim) {
      attacker.kills++;
      const reward = weapon && weapon.killReward !== undefined ? weapon.killReward : 300;
      if (this.mode !== 'practice') this.awardMoney(attacker, reward);
      // assists
      for (const [id, dmg] of victim.recentDamagers) {
        if (id === attacker.id || dmg < 40) continue;
        const helper = this.entities.find(e => e.id === id);
        if (helper) helper.assists++;
      }
    } else if (attacker === victim) {
      victim.kills--;
    }

    this.hud.addKill(attacker, victim, weapon ? (weapon.key || keyOfWeapon(weapon)) : 'grenade',
      headshot, penetrated, this.localPlayer);

    // Drop the bomb where they fell.
    if (victim.hasBomb) {
      victim.hasBomb = false;
      this.bomb.dropped = true;
      this.bomb.carrier = null;
      this.bomb.pos = [victim.pos[0], victim.pos[1] + 0.05, victim.pos[2]];
    }
    // Drop the primary so teammates can pick it up.
    if (victim.inventory.primary) {
      this.droppedWeapons.push({
        key: victim.inventory.primary, pos: [victim.pos[0], victim.pos[1] + 0.3, victim.pos[2]],
        ammo: Object.assign({}, victim.ammoFor(victim.inventory.primary)),
        yaw: victim.yaw, life: 60,
      });
    }

    if (victim === this.localPlayer) {
      this.spectateIndex = 0;
      this.hud.centerMessage('YOU WERE ELIMINATED',
        attacker ? `${attacker.name} · ${weapon ? weapon.name : 'explosion'}` : '');
      setTimeout(() => this.hud.centerMessage(''), 2600);
      this.openShop(false);
      if (this.mode === 'practice') setTimeout(() => this.respawnLocal(), 1800);
    }
    if (this.mode === 'practice' && victim.isBot) {
      setTimeout(() => {
        const spawn = pick(this.map.spawns[victim.team]);
        victim.resetForRound(spawn, this.map.spawnYaw[victim.team]);
        victim.armor = 100; victim.helmet = true;
      }, 2500);
    }
    this.notifyNoise(victim.pos, 0.8);
    this.checkRoundEnd();
  }

  respawnLocal() {
    const spawn = pick(this.map.spawns[this.localPlayer.team]);
    this.localPlayer.resetForRound(spawn, this.map.spawnYaw[this.localPlayer.team]);
    this.localPlayer.armor = 100;
    this.localPlayer.helmet = true;
  }

  meleeAttack(ent, heavy) {
    const w = WEAPONS.knife;
    const origin = ent.eyePos();
    const dir = angleVector(ent.yaw, ent.pitch);
    this.sound.play('knife', ent === this.localPlayer ? null : origin);
    if (ent === this.localPlayer) this.vmKick = 1.4;
    let best = null;
    for (const e of this.entities) {
      if (e === ent || !e.alive) continue;
      if (this.mode !== 'practice' && e.team === ent.team) continue;
      const hit = e.rayHit(origin, dir, w.range);
      if (hit && (!best || hit.t < best.t)) best = hit;
    }
    if (!best) return;
    // Behind the target? That is a backstab.
    const facing = angleVector(best.entity.yaw, 0);
    const toVictim = V.norm(V.sub(best.entity.pos, ent.pos));
    const behind = V.dot(facing, toVictim) > 0.55;
    const dmg = behind ? w.backstab : (heavy ? w.damage * 1.8 : w.damage);
    this.sound.play('knife_hit', best.point);
    this.applyDamage(best.entity, ent, dmg, w, best.group, best.point, false);
  }

  taserAttack(ent) {
    const w = WEAPONS.zeus;
    const origin = ent.eyePos();
    const dir = angleVector(ent.yaw, ent.pitch);
    this.sound.play('smg', origin);
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        pos: V.mad(origin, dir, 0.4 + i * 0.3), vel: [rand(-1, 1), rand(-1, 1), rand(-1, 1)],
        life: 0.2, maxLife: 0.2, size: 0.2, layer: SPR.SPARK, color: [0.6, 0.8, 1, 1], mode: 'add', gravity: 0,
      });
    }
    let best = null;
    for (const e of this.entities) {
      if (e === ent || !e.alive || e.team === ent.team) continue;
      const hit = e.rayHit(origin, dir, w.range);
      if (hit && (!best || hit.t < best.t)) best = hit;
    }
    if (best) this.applyDamage(best.entity, ent, w.damage, w, best.group, best.point, false);
    // Spent: hand the pistol it displaced back.
    if (ent.inventory.secondary === 'zeus') ent.inventory.secondary = ent.zeusPrev || null;
    ent.zeusPrev = null;
    ent.selectSlot(ent.inventory.secondary ? 'secondary' : (ent.inventory.primary ? 'primary' : 'knife'));
  }

  startReload(ent) {
    const w = ent.weapon;
    if (!w || w.melee || ent.reloading > 0) return;
    const ammo = ent.ammoFor(ent.weaponKey);
    if (ammo.mag >= w.mag || ammo.reserve <= 0) return;
    ent.reloading = w.reloadTime;
    ent.reloadTotal = w.reloadTime;
    ent.zoomLevel = 0;
    ent.sprayIndex = 0;
    this.sound.play('reload_out', ent === this.localPlayer ? null : ent.pos);
    setTimeout(() => {
      if (ent.reloading > 0) this.sound.play('reload_in', ent === this.localPlayer ? null : ent.pos);
    }, w.reloadTime * 500);
  }

  finishReload(ent) {
    const w = ent.weapon;
    if (!w) return;
    const ammo = ent.ammoFor(ent.weaponKey);
    const need = w.mag - ammo.mag;
    const take = Math.min(need, ammo.reserve);
    ammo.mag += take;
    ammo.reserve -= take;
    this.sound.play('reload_done', ent === this.localPlayer ? null : ent.pos);
  }

  toggleZoom(ent) {
    const w = ent.weapon;
    if (!w || !w.zoom) return;
    ent.zoomLevel = (ent.zoomLevel + 1) % (w.zoom.length + 1);
    this.sound.play('switch', ent === this.localPlayer ? null : ent.pos);
  }

  /* ============================= grenades ============================= */

  throwGrenade(ent, weak) {
    const key = ent.grenades[ent.grenadeIndex || 0];
    if (!key) return;
    const g = GRENADES[key];
    ent.grenades.splice(ent.grenadeIndex || 0, 1);
    ent.grenadeIndex = 0;
    ent.nextFire = this.time + 0.8;

    const dir = angleVector(ent.yaw, ent.pitch + 0.06);
    const speed = weak ? 8 : 19;
    const origin = V.mad(ent.eyePos(), dir, 0.4);
    this.grenades.push({
      key, kind: g, pos: origin,
      vel: [dir[0] * speed + ent.vel[0] * 0.5, dir[1] * speed + 2 + ent.vel[1] * 0.3, dir[2] * speed + ent.vel[2] * 0.5],
      fuse: g.fuse, owner: ent, spin: rand(4, 9), angle: 0,
    });
    this.sound.play('pin', ent === this.localPlayer ? null : ent.pos);
    if (!ent.grenades.length) ent.selectSlot(ent.inventory.primary ? 'primary' : 'secondary');
  }

  updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const n = this.grenades[i];
      n.fuse -= dt;
      n.angle += n.spin * dt;
      n.vel[1] -= MOVE.gravity * dt;
      const step = V.mul(n.vel, dt);
      const dist = V.len(step);
      if (dist > 0.0001) {
        const dir = V.mul(step, 1 / dist);
        const hit = this.map.raycast(n.pos, dir, dist + 0.08);
        if (hit) {
          n.pos = V.mad(hit.point, hit.normal, 0.06);
          const vn = V.dot(n.vel, hit.normal);
          n.vel = V.sub(n.vel, V.mul(hit.normal, vn * 1.5));
          V.mul(n.vel, 0.55, n.vel);
          n.spin *= 0.6;
          if (V.len(n.vel) > 1.5) this.sound.play('bounce', n.pos);
          if (n.kind.dps && V.len(n.vel) < 6 && hit.normal[1] > 0.5) n.fuse = Math.min(n.fuse, 0.05);
        } else {
          n.pos = V.add(n.pos, step);
        }
      }
      if (n.fuse <= 0) {
        this.detonate(n);
        this.grenades.splice(i, 1);
      }
    }

    // smoke volumes
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.life -= dt;
      s.radius = Math.min(s.maxRadius, s.radius + dt * 4.5);
      if (s.life <= 0) this.smokes.splice(i, 1);
      else if (this.frameCount % 2 === 0) {
        // puffs
        const fade = clamp(s.life / 2, 0, 1) * clamp((s.maxLife - s.life) / 0.7, 0, 1);
        for (let k = 0; k < 6; k++) {
          const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * s.radius;
          this.renderer.sprite(
            [s.pos[0] + Math.cos(a) * r, s.pos[1] + rand(-0.2, 1) * (s.radius * 0.55), s.pos[2] + Math.sin(a) * r],
            s.radius * 1.5, SPR.SMOKE, [0.82, 0.83, 0.85, 0.5 * fade], 'alpha', a);
        }
      }
    }

    // fire (molotov / incendiary)
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.life -= dt;
      if (f.life <= 0) { this.fires.splice(i, 1); continue; }
      for (const e of this.entities) {
        if (!e.alive) continue;
        if (V.distXZ(e.pos, f.pos) < f.radius && Math.abs(e.pos[1] - f.pos[1]) < 2.2) {
          this.applyDamage(e, f.owner, f.dps * dt, { armorPen: 1.0, name: 'Fire', killReward: 300 },
            HITGROUP.LEG, e.pos, false);
        }
      }
      for (let k = 0; k < 3; k++) {
        const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * f.radius;
        this.particles.push({
          pos: [f.pos[0] + Math.cos(a) * r, f.pos[1] + 0.05, f.pos[2] + Math.sin(a) * r],
          vel: [rand(-0.2, 0.2), rand(1.2, 2.4), rand(-0.2, 0.2)],
          life: rand(0.4, 0.9), maxLife: 0.9, size: rand(0.5, 1.1), layer: SPR.SPARK,
          color: [1, 0.55, 0.2, 0.9], mode: 'add', gravity: -1,
        });
      }
    }
  }

  detonate(n) {
    const g = n.kind;
    const pos = n.pos;
    if (n.key === 'he') {
      this.sound.play('explode', pos, { refDist: 12 });
      this.explosionEffect(pos, 1);
      for (const e of this.entities) {
        if (!e.alive) continue;
        const d = V.dist(e.pos, pos);
        if (d > g.radius) continue;
        if (!this.map.visible(V.mad(pos, [0, 1, 0], 0.2), [e.pos[0], e.pos[1] + 0.9, e.pos[2]])) continue;
        const falloff = Math.pow(1 - d / g.radius, 1.6);
        this.applyDamage(e, n.owner, g.maxDamage * falloff,
          { armorPen: 0.5, name: 'HE Grenade', killReward: 300 }, HITGROUP.CHEST, e.pos, false);
      }
      this.shake(0.6 / Math.max(1, V.dist(this.localPlayer.pos, pos) * 0.25));
      this.notifyNoise(pos, 2.5);
    } else if (n.key === 'flash') {
      this.sound.play('flash', pos, { refDist: 16 });
      this.flashEffect(pos);
      for (const e of this.entities) {
        if (!e.alive) continue;
        const d = V.dist(e.eyePos(), pos);
        if (d > g.radius * 2.4) continue;
        if (!this.map.visible(pos, e.eyePos())) continue;
        const toFlash = V.norm(V.sub(pos, e.eyePos()));
        const look = angleVector(e.yaw, e.pitch);
        const facing = clamp(V.dot(look, toFlash), -1, 1);
        if (facing < 0.1) continue;
        const distFactor = clamp(1 - d / (g.radius * 2.4), 0, 1);
        const amount = Math.pow(facing, 1.5) * distFactor;
        e.flashAmount = Math.max(e.flashAmount, amount * 2.6);
        if (e === this.localPlayer && amount > 0.25) this.sound.ring(amount * 3.4);
      }
      this.notifyNoise(pos, 1.5);
    } else if (n.key === 'smoke') {
      this.sound.play('smoke', pos);
      this.smokes.push({
        pos: [pos[0], pos[1] + 0.9, pos[2]], radius: 0.6, maxRadius: g.radius,
        life: g.duration, maxLife: g.duration,
      });
    } else if (n.key === 'molotov' || n.key === 'incendiary') {
      this.sound.play('explode', pos, { refDist: 8 });
      this.fires.push({
        pos: [pos[0], pos[1], pos[2]], radius: g.radius, life: g.duration,
        dps: g.dps, owner: n.owner,
      });
      this.notifyNoise(pos, 1.2);
    } else if (n.key === 'decoy') {
      this.decoys = this.decoys || [];
      this.decoys.push({ pos: [pos[0], pos[1], pos[2]], life: g.duration, next: 0, owner: n.owner });
    }
  }

  /* =============================== bomb =============================== */

  startPlant(ent) {
    if (this.bomb.planted || !ent.hasBomb || !ent.onGround) return;
    const site = this.map.whichSite(ent.pos);
    if (!site) return;
    ent.planting = true;
  }

  startDefuse(ent) {
    if (!this.bomb.planted || ent.team !== 'CT') return;
    if (V.distXZ(ent.pos, this.bomb.pos) > 2.0) return;
    ent.defusing = true;
  }

  updateBomb(dt) {
    // planting
    for (const e of this.entities) {
      if (!e.alive) { e.planting = false; e.defusing = false; e.plantProgress = 0; e.defuseProgress = 0; continue; }
      if (e.planting && !this.bomb.planted) {
        const stillValid = e.hasBomb && this.map.whichSite(e.pos) && Math.hypot(e.vel[0], e.vel[2]) < 0.6;
        if (!stillValid) { e.planting = false; e.plantProgress = 0; continue; }
        e.plantProgress += dt;
        if (Math.floor(e.plantProgress * 6) !== Math.floor((e.plantProgress - dt) * 6)) {
          this.sound.play('plant_tick', e.pos);
        }
        if (e.plantProgress >= RULES.plantTime) {
          this.plantBomb(e);
        }
      } else if (!e.planting) {
        e.plantProgress = Math.max(0, e.plantProgress - dt * 2);
      }

      if (e.defusing && this.bomb.planted) {
        const stillValid = V.distXZ(e.pos, this.bomb.pos) < 2.0 && Math.hypot(e.vel[0], e.vel[2]) < 0.6;
        if (!stillValid) { e.defusing = false; e.defuseProgress = 0; continue; }
        e.defuseProgress += dt;
        if (Math.floor(e.defuseProgress * 4) !== Math.floor((e.defuseProgress - dt) * 4)) {
          this.sound.play('defuse', e.pos);
        }
        const need = e.defuser ? RULES.defuseTimeKit : RULES.defuseTime;
        if (e.defuseProgress >= need) this.defuseBomb(e);
      } else if (!e.defusing) {
        e.defuseProgress = Math.max(0, e.defuseProgress - dt * 2);
      }
    }

    if (this.bomb.planted && !this.bomb.exploded) {
      this.bomb.timer -= dt;
      const beepGap = this.bomb.timer < 5 ? 0.14 : (this.bomb.timer < 15 ? 0.35 : 0.75);
      this.bomb.beep = (this.bomb.beep || 0) - dt;
      if (this.bomb.beep <= 0) {
        this.bomb.beep = beepGap;
        this.sound.play('beep', this.bomb.pos, { freq: this.bomb.timer < 5 ? 3000 : 2400, refDist: 8 });
      }
      if (this.bomb.timer <= 0) this.explodeBomb();
    }

    // dropped bomb pickup
    if (this.bomb.dropped) {
      for (const e of this.entities) {
        if (!e.alive || e.team !== 'T') continue;
        if (V.distXZ(e.pos, this.bomb.pos) < 1.0 && Math.abs(e.pos[1] - this.bomb.pos[1]) < 1.6) {
          this.bomb.dropped = false;
          this.bomb.carrier = e;
          e.hasBomb = true;
          if (e === this.localPlayer) this.hud.centerMessage('', 'You picked up the bomb');
          break;
        }
      }
    }
  }

  plantBomb(ent) {
    this.bomb.planted = true;
    this.bomb.site = this.map.whichSite(ent.pos);
    this.bomb.pos = [ent.pos[0], ent.pos[1] + 0.05, ent.pos[2]];
    this.bomb.timer = RULES.bombTime;
    this.bomb.carrier = null;
    ent.hasBomb = false;
    ent.planting = false;
    ent.plantProgress = 0;
    ent.selectSlot(ent.inventory.primary ? 'primary' : 'secondary');
    this.awardMoney(ent, RULES.plantBonus);
    this.phaseTime = Math.max(this.phaseTime, 0);
    this.sound.play('planted', this.bomb.pos);
    this.hud.centerMessage('BOMB PLANTED', `Site ${this.bomb.site}`);
    setTimeout(() => this.hud.centerMessage(''), 2400);
    this.notifyNoise(this.bomb.pos, 3);
    for (const e of this.entities) if (e.isBot) { e.holdSpot = null; e.decisionTimer = 0; e.path = null; }
  }

  defuseBomb(ent) {
    this.bomb.planted = false;
    this.bomb.defused = true;
    ent.defusing = false;
    ent.defuseProgress = 0;
    this.awardMoney(ent, RULES.defuseReward - RULES.winReward);
    this.sound.play('defused', this.bomb.pos);
    this.endRound('CT', 'Bomb defused');
  }

  explodeBomb() {
    this.bomb.exploded = true;
    this.bomb.planted = false;
    const pos = this.bomb.pos;
    this.sound.play('explode', pos, { refDist: 40 });
    this.explosionEffect(pos, 3.5);
    this.shake(1.2);
    for (const e of this.entities) {
      if (!e.alive) continue;
      const d = V.dist(e.pos, pos);
      if (d < 22) {
        this.applyDamage(e, null, 500 * Math.pow(1 - d / 22, 1.2),
          { armorPen: 1, name: 'C4', killReward: 0 }, HITGROUP.CHEST, e.pos, false);
      }
    }
    this.endRound('T', 'Bomb detonated');
  }

  /* ============================ round flow ============================ */

  checkRoundEnd() {
    if (this.phase !== PHASE.LIVE || this.mode === 'practice') return;
    const tAlive = this.entities.filter(e => e.team === 'T' && e.alive).length;
    const ctAlive = this.entities.filter(e => e.team === 'CT' && e.alive).length;
    if (tAlive === 0 && !this.bomb.planted) this.endRound('CT', 'Terrorists eliminated');
    else if (ctAlive === 0) this.endRound('T', 'Counter-Terrorists eliminated');
  }

  endRound(winner, reason) {
    if (this.phase === PHASE.END || this.phase === PHASE.MATCHEND) return;
    this.phase = PHASE.END;
    this.phaseTime = RULES.endTime;
    this.score[winner]++;
    for (const e of this.entities) e.survived = e.alive;
    const loser = winner === 'T' ? 'CT' : 'T';
    this.lossStreak[loser] = Math.min(4, this.lossStreak[loser] + 1);
    this.lossStreak[winner] = 0;

    for (const e of this.entities) {
      if (e.team === winner) {
        this.awardMoney(e, this.bomb.defused && e.team === 'CT' ? RULES.defuseReward : RULES.winReward);
      } else {
        this.awardMoney(e, RULES.lossBonus[this.lossStreak[loser] - 1] || RULES.lossBonus[0]);
        if (e.team === 'T' && (this.bomb.planted || this.bomb.exploded)) {
          this.awardMoney(e, RULES.bombPlantTeamBonus);
        }
      }
    }

    const won = this.localPlayer.team === winner;
    this.hud.centerMessage(
      winner === 'T' ? 'TERRORISTS WIN' : 'COUNTER-TERRORISTS WIN', reason);
    this.sound.play(won ? 'win' : 'lose');
    this.openShop(false);

    if (this.score[winner] >= this.matchTarget) {
      setTimeout(() => this.endMatch(winner), 2600);
    }
  }

  endMatch(winner) {
    this.phase = PHASE.MATCHEND;
    this.exitPointerLock();
    const won = this.localPlayer.team === winner;
    const el = document.getElementById('matchEnd');
    document.getElementById('endResult').textContent = won ? 'VICTORY' : 'DEFEAT';
    document.getElementById('endResult').className = 'end-result ' + (won ? 'win' : 'lose');
    document.getElementById('endScore').textContent =
      `${this.score[this.localPlayer.team]} : ${this.score[this.localPlayer.team === 'T' ? 'CT' : 'T']}`;
    const p = this.localPlayer;
    document.getElementById('endStats').innerHTML = `
      <div>KILLS<b>${p.kills}</b></div><div>DEATHS<b>${p.deaths}</b></div>
      <div>ASSISTS<b>${p.assists}</b></div>
      <div>ADR<b>${Math.round(p.damageDealt / Math.max(1, this.roundNumber))}</b></div>`;
    el.classList.remove('hidden');
    this.hud.centerMessage('');
  }

  updatePhase(dt) {
    if (this.mode === 'practice') return;
    this.phaseTime -= dt;
    if (this.phase === PHASE.FREEZE) {
      const buyLeft = Math.max(0, this.phaseTime);
      this.hud.setShopTimer(`0:${String(Math.floor(buyLeft)).padStart(2, '0')}`);
      if (this.phaseTime <= 0) {
        this.phase = PHASE.LIVE;
        this.phaseTime = RULES.roundTime;
        this.openShop(false);
        this.hud.centerMessage('');
      }
    } else if (this.phase === PHASE.LIVE) {
      if (this.phaseTime <= 10.05 && this.phaseTime > 10 - dt && !this.bomb.planted) {
        this.sound.play('tenseconds');
      }
      if (this.phaseTime <= 0 && !this.bomb.planted) {
        this.endRound('CT', 'Time expired');
      }
    } else if (this.phase === PHASE.END) {
      if (this.phaseTime <= 0 && this.score.T < this.matchTarget && this.score.CT < this.matchTarget) {
        this.startRound();
      }
    }
  }

  /* ============================ perception ============================ */

  /** Which enemies the local team can see — drives the radar. */
  updateSpotting() {
    this.spotted.clear();
    const myTeam = this.localPlayer.team;
    const observers = this.entities.filter(e => e.alive && e.team === myTeam);
    for (const enemy of this.entities) {
      if (!enemy.alive || enemy.team === myTeam) continue;
      for (const o of observers) {
        const eye = o.eyePos();
        const target = [enemy.pos[0], enemy.pos[1] + 1.2, enemy.pos[2]];
        if (V.dist(eye, target) > 55) continue;
        const fwd = angleVector(o.yaw, o.pitch);
        const to = V.norm(V.sub(target, eye));
        if (V.dot(fwd, to) < 0.35) continue;
        if (!this.map.visible(eye, target)) continue;
        if (this.smokeBlocks(eye, target)) continue;
        this.spotted.add(enemy.id);
        if (enemy.hasBomb) {
          this.bombCarrierSeen = { pos: enemy.pos.slice(), site: this.map.whichSite(enemy.pos), at: this.time };
        }
        break;
      }
    }
  }

  isSpotted(e) { return this.spotted.has(e.id); }

  /** True when a smoke cloud sits between two points. */
  smokeBlocks(a, b) {
    if (!this.smokes.length) return false;
    const d = V.sub(b, a);
    const len = V.len(d);
    if (len < 0.001) return false;
    const dir = V.mul(d, 1 / len);
    for (const s of this.smokes) {
      if (s.radius < 1.2) continue;
      const oc = V.sub(s.pos, a);
      const t = clamp(V.dot(oc, dir), 0, len);
      const closest = V.mad(a, dir, t);
      const dist = V.dist(closest, s.pos);
      if (dist < s.radius * 0.92) return true;
    }
    return false;
  }

  enemyNearby(ent, radius) {
    for (const e of this.entities) {
      if (!e.alive || e.team === ent.team) continue;
      if (V.dist(e.pos, ent.pos) < radius) return true;
    }
    return false;
  }

  notifyNoise(pos, loudness) {
    for (const e of this.entities) {
      if (e.isBot && e.alive) e.hear(pos, loudness);
    }
  }

  /* ============================== effects ============================== */

  spawnMuzzleFlash(ent, w) {
    const kind = w.model;
    let origin;
    if (ent === this.localPlayer) {
      const dir = angleVector(ent.yaw + ent.punch[0] * DEG, ent.pitch + ent.punch[1] * DEG);
      origin = V.mad(ent.eyePos(), dir, 0.55);
    } else {
      origin = ent.muzzleWorld || V.mad(ent.eyePos(), angleVector(ent.yaw, ent.pitch), 0.6);
    }
    if (w.silenced) {
      this.renderer.sprite(origin, 0.18, SPR.GLOW, [1, 0.85, 0.6, 0.35], 'add', Math.random() * TAU);
      return;
    }
    this.renderer.sprite(origin, rand(0.42, 0.62), SPR.FLASH, [1, 0.92, 0.7, 0.95], 'add', Math.random() * TAU);
    const dir = angleVector(ent.yaw, ent.pitch);
    for (let i = 0; i < 3; i++) {
      this.particles.push({
        pos: V.copy(origin),
        vel: [dir[0] * rand(3, 7) + rand(-2, 2), dir[1] * rand(3, 7) + rand(-1, 2), dir[2] * rand(3, 7) + rand(-2, 2)],
        life: rand(0.08, 0.2), maxLife: 0.2, size: 0.09, layer: SPR.SPARK,
        color: [1, 0.8, 0.4, 1], mode: 'add', gravity: 6,
      });
    }
    // ejected casing
    const right = [Math.cos(ent.yaw), 0, -Math.sin(ent.yaw)];
    this.particles.push({
      pos: V.mad(origin, right, 0.05),
      vel: [right[0] * rand(1.5, 3) + rand(-0.4, 0.4), rand(1.5, 3), right[2] * rand(1.5, 3)],
      life: 1.1, maxLife: 1.1, size: 0.045, layer: SPR.SPARK,
      color: [1, 0.85, 0.4, 0.9], mode: 'add', gravity: 12,
    });
  }

  spawnImpact(hit, dir, mine) {
    const n = hit.normal;
    this.renderer.addDecal(hit.point, n, rand(0.11, 0.17), SPR.HOLE, [1, 1, 1, 0.85], 40);
    for (let i = 0; i < 5; i++) {
      const v = V.mad(V.mul(n, rand(1.4, 3.4)), [rand(-1, 1), rand(-1, 1), rand(-1, 1)], 2.2);
      this.particles.push({
        pos: V.mad(hit.point, n, 0.02), vel: v,
        life: rand(0.15, 0.4), maxLife: 0.4, size: rand(0.03, 0.07), layer: SPR.SPARK,
        color: [1, 0.75, 0.35, 1], mode: 'add', gravity: 9,
      });
    }
    this.renderer.sprite(V.mad(hit.point, n, 0.05), rand(0.3, 0.5), SPR.DUST,
      [0.85, 0.8, 0.68, 0.5], 'alpha', Math.random() * TAU);
    this.sound.play('impact', hit.point, { refDist: 3 });
    if (!mine && Math.random() < 0.3) this.sound.play('ricochet', hit.point);
  }

  spawnBloodEffect(point, dir) {
    for (let i = 0; i < 7; i++) {
      this.particles.push({
        pos: V.copy(point),
        vel: [dir[0] * rand(1, 3) + rand(-1.6, 1.6), rand(0.5, 2.4), dir[2] * rand(1, 3) + rand(-1.6, 1.6)],
        life: rand(0.25, 0.6), maxLife: 0.6, size: rand(0.07, 0.16), layer: SPR.BLOOD,
        color: [0.75, 0.06, 0.06, 0.95], mode: 'alpha', gravity: 11,
      });
    }
    const ground = this.map.floorAt(point[0], point[2], point[1]);
    if (point[1] - ground < 2.4) {
      this.renderer.addDecal([point[0] + rand(-0.3, 0.3), ground + 0.01, point[2] + rand(-0.3, 0.3)],
        [0, 1, 0], rand(0.3, 0.6), SPR.BLOOD, [0.6, 0.05, 0.05, 0.8], 30);
    }
  }

  explosionEffect(pos, scale) {
    for (let i = 0; i < 26 * scale; i++) {
      const a = Math.random() * TAU, e = Math.random() * 1.2;
      const sp = rand(4, 16) * scale;
      this.particles.push({
        pos: V.copy(pos),
        vel: [Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp],
        life: rand(0.3, 0.9), maxLife: 0.9, size: rand(0.2, 0.7) * scale, layer: SPR.SPARK,
        color: [1, 0.7, 0.3, 1], mode: 'add', gravity: 8,
      });
    }
    for (let i = 0; i < 14 * scale; i++) {
      this.particles.push({
        pos: V.mad(pos, [rand(-1, 1), rand(0, 1), rand(-1, 1)], scale),
        vel: [rand(-2, 2), rand(0.5, 3), rand(-2, 2)],
        life: rand(0.8, 1.8), maxLife: 1.8, size: rand(1, 2.4) * scale, layer: SPR.SMOKE,
        color: [0.25, 0.23, 0.2, 0.7], mode: 'alpha', gravity: -0.6,
      });
    }
    this.renderer.addDecal([pos[0], this.map.floorAt(pos[0], pos[2], pos[1]) + 0.01, pos[2]],
      [0, 1, 0], 2.4 * scale, SPR.BLOOD, [0.1, 0.09, 0.08, 0.7], 30);
  }

  flashEffect(pos) {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * TAU, e = rand(-1, 1);
      this.particles.push({
        pos: V.copy(pos),
        vel: [Math.cos(a) * rand(5, 14), e * 8, Math.sin(a) * rand(5, 14)],
        life: rand(0.1, 0.3), maxLife: 0.3, size: 0.3, layer: SPR.SPARK,
        color: [1, 1, 0.95, 1], mode: 'add', gravity: 0,
      });
    }
    this.renderer.sprite(pos, 4, SPR.GLOW, [1, 1, 1, 1], 'add');
  }

  shake(amount) { this.shakeAmount = Math.min(1.4, (this.shakeAmount || 0) + amount); }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vel[1] -= (p.gravity || 0) * dt;
      p.pos[0] += p.vel[0] * dt;
      p.pos[1] += p.vel[1] * dt;
      p.pos[2] += p.vel[2] * dt;
      const fade = clamp(p.life / p.maxLife, 0, 1);
      this.renderer.sprite(p.pos, p.size * (p.mode === 'alpha' ? (2 - fade) : 1), p.layer,
        [p.color[0], p.color[1], p.color[2], p.color[3] * fade], p.mode, 0);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) { this.tracers.splice(i, 1); continue; }
      const frac = 1 - t.life / t.maxLife;
      const p = V.lerp(t.from, t.to, frac);
      this.renderer.sprite(p, 0.09, SPR.SPARK, [1, 0.9, 0.6, 0.8], 'add');
    }
    if (this.decoys) {
      for (let i = this.decoys.length - 1; i >= 0; i--) {
        const d = this.decoys[i];
        d.life -= dt;
        d.next -= dt;
        if (d.life <= 0) { this.decoys.splice(i, 1); continue; }
        if (d.next <= 0) {
          d.next = rand(0.35, 1.1);
          this.sound.play('pistol', d.pos);
          this.notifyNoise(d.pos, 1.1);
        }
      }
    }
  }

  /* ============================== input ============================== */

  bindInput() {
    const canvas = this.canvas;
    canvas.addEventListener('click', () => {
      if (this.running && !this.shopOpen && !this.paused) this.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked && this.running && !this.shopOpen && this.phase !== PHASE.MATCHEND) {
        this.setPaused(true);
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.running || this.paused) return;
      const p = this.localPlayer;
      if (!p.alive) return;
      const s = this.hud.settings;
      const zoomScale = p.zoomLevel > 0 ? (p.weapon.zoom[p.zoomLevel - 1] / s.fov) : 1;
      const sens = s.sens * 0.00022 * zoomScale;
      p.yaw -= e.movementX * sens;
      p.pitch -= e.movementY * sens * (s.invertY ? -1 : 1);
      p.pitch = clamp(p.pitch, -1.55, 1.55);
      p.yaw = ((p.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
    });

    document.addEventListener('mousedown', (e) => {
      if (!this.running || this.paused) return;
      if (this.shopOpen) return;
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) {
        this.mouse.right = true;
        this.altFire();
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('wheel', (e) => {
      if (!this.locked || !this.running) return;
      this.cycleWeapon(e.deltaY > 0 ? 1 : -1);
    }, { passive: true });

    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Tab') { this.hud.showScoreboard(false); e.preventDefault(); }
    });
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = false; });
  }

  onKeyDown(e) {
    if (e.code === 'Tab') e.preventDefault();
    if (!this.running) return;
    if (e.repeat) { this.keys.add(e.code); return; }
    this.keys.add(e.code);
    const p = this.localPlayer;

    // While the shop is open the number keys belong to the shop, not the loadout.
    if (this.shopOpen) {
      if (e.code === 'Escape' || e.code === 'KeyB') this.openShop(false);
      else this.shopKey(e);
      return;
    }

    switch (e.code) {
      case 'Escape':
        this.setPaused(!this.paused);
        break;
      case 'KeyB':
        if (this.canBuy(p)) this.openShop(true);
        else this.sound.play('error');
        break;
      case 'Tab': this.hud.showScoreboard(true); break;
      case 'Digit1': this.selectSlot('primary'); break;
      case 'Digit2': this.selectSlot('secondary'); break;
      case 'Digit3': this.selectSlot('knife'); break;
      case 'Digit4': if (p.alive) { p.nextGrenade(); this.sound.play('switch'); } break;
      case 'Digit5': this.selectSlot('bomb'); break;
      case 'KeyQ': this.selectSlot(this.lastWeaponSlot); break;
      case 'KeyR': if (p.alive) this.startReload(p); break;
      case 'KeyE': if (p.alive) this.useAction(); break;
      case 'KeyG': this.dropWeapon(); break;
      case 'Space':
        if (!p.alive && this.phase !== PHASE.MATCHEND) this.cycleSpectate();
        break;
      default: break;
    }
  }

  shopKey(e) {
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      const i = SHOP_CATEGORIES.findIndex(c => c.key === this.hud.shopCategory);
      const next = (i + (e.code === 'ArrowRight' ? 1 : -1) + SHOP_CATEGORIES.length) % SHOP_CATEGORIES.length;
      this.hud.setShopCategory(SHOP_CATEGORIES[next].key);
      return;
    }
    // Read the physical digit so Shift+1 still reads as "1".
    const m = /^Digit([1-9])$/.exec(e.code) || /^Numpad([1-9])$/.exec(e.code);
    if (!m) return;
    const n = parseInt(m[1], 10);
    if (e.shiftKey) {
      const cat = SHOP_CATEGORIES[n - 1];
      if (cat) this.hud.setShopCategory(cat.key);
      return;
    }
    const items = this.hud.currentShopItems || [];
    if (n >= 1 && n <= items.length) {
      this.hud.selectShopItem(items[n - 1]);
      this.buyItem(items[n - 1]);
    }
  }

  selectSlot(slot) {
    const p = this.localPlayer;
    if (!p.alive) return;
    const prev = p.slot;
    if (p.selectSlot(slot)) {
      this.lastWeaponSlot = prev;
      this.sound.play('switch');
    }
  }

  cycleWeapon(dir) {
    const p = this.localPlayer;
    const order = ['primary', 'secondary', 'knife', 'grenade', 'bomb'].filter(s => {
      if (s === 'primary') return !!p.inventory.primary;
      if (s === 'secondary') return !!p.inventory.secondary;
      if (s === 'grenade') return p.grenades.length > 0;
      if (s === 'bomb') return p.hasBomb;
      return true;
    });
    const i = order.indexOf(p.slot);
    this.selectSlot(order[(i + dir + order.length) % order.length]);
  }

  altFire() {
    const p = this.localPlayer;
    if (!p.alive) return;
    const w = p.weapon;
    if (!w) return;
    if (w.zoom) { this.toggleZoom(p); return; }
    if (w.melee) { this.tryFire(p, true); return; }
    if (w.burst) {
      p.burstMode = !p.burstMode;
      this.sound.play('switch');
    }
  }

  useAction() {
    const p = this.localPlayer;
    // pick up a dropped weapon
    for (let i = 0; i < this.droppedWeapons.length; i++) {
      const d = this.droppedWeapons[i];
      if (V.distXZ(d.pos, p.pos) < 1.4 && Math.abs(d.pos[1] - p.pos[1]) < 1.6) {
        p.giveWeapon(d.key);
        p.ammo[d.key] = d.ammo;
        this.droppedWeapons.splice(i, 1);
        this.sound.play('switch');
        return;
      }
    }
    if (p.team === 'T' && p.hasBomb && this.map.whichSite(p.pos) && !this.bomb.planted) {
      p.planting = true;
      p.selectSlot('bomb');
      return;
    }
    if (p.team === 'CT' && this.bomb.planted && V.distXZ(p.pos, this.bomb.pos) < 2.0) {
      p.defusing = true;
    }
  }

  dropWeapon() {
    const p = this.localPlayer;
    if (!p.alive || !p.inventory.primary || p.slot !== 'primary') return;
    const dir = angleVector(p.yaw, 0);
    this.droppedWeapons.push({
      key: p.inventory.primary, pos: V.mad(p.eyePos(), dir, 0.8),
      ammo: Object.assign({}, p.ammoFor(p.inventory.primary)), yaw: p.yaw, life: 60,
    });
    p.inventory.primary = null;
    p.selectSlot(p.inventory.secondary ? 'secondary' : 'knife');
    this.sound.play('switch');
  }

  requestPointerLock() {
    if (this.canvas.requestPointerLock) {
      const res = this.canvas.requestPointerLock();
      if (res && res.catch) res.catch(() => { /* user gesture required */ });
    }
  }

  exitPointerLock() {
    if (document.exitPointerLock) document.exitPointerLock();
  }

  setPaused(v) {
    if (this.phase === PHASE.MATCHEND) return;
    this.paused = v;
    document.getElementById('pause').classList.toggle('hidden', !v);
    if (v) this.exitPointerLock();
    else this.requestPointerLock();
  }

  openShop(open) {
    if (open && !this.canBuy(this.localPlayer)) return;
    this.shopOpen = open;
    this.hud.openShop(open);
    if (open) { this.exitPointerLock(); this.hud.renderShop(); }
    else if (this.running && !this.paused) this.requestPointerLock();
  }

  /* ============================== update ============================== */

  update(dt) {
    this.time += dt;
    this.frameCount++;
    const p = this.localPlayer;

    if (this.mode === 'pvp') {
      this.net.tick(dt, p);
      this.net.applyInterpolation(this.time);
    }

    // local input → movement
    const cmd = { forward: 0, side: 0, jump: false, duck: false, walk: false };
    if (!this.shopOpen && !this.paused && p.alive) {
      if (this.keys.has('KeyW')) cmd.forward += 1;
      if (this.keys.has('KeyS')) cmd.forward -= 1;
      if (this.keys.has('KeyD')) cmd.side += 1;
      if (this.keys.has('KeyA')) cmd.side -= 1;
      cmd.jump = this.keys.has('Space');
      cmd.duck = this.keys.has('ControlLeft') || this.keys.has('KeyC');
      cmd.walk = this.keys.has('ShiftLeft');
      if (this.phase === PHASE.FREEZE) { cmd.forward = 0; cmd.side = 0; cmd.jump = false; }
    }
    if (p.alive) {
      p.move(this.map, cmd, dt);
      this.footsteps(p, dt);
      if (p.justLanded) {
        p.justLanded = false;
        this.sound.play('land', null, { refDist: 2 });
        if (p.landSpeed > 9) {
          const dmg = (p.landSpeed - 9) * 8;
          this.applyDamage(p, null, dmg, { armorPen: 1, name: 'Fall', killReward: 0 }, HITGROUP.LEG, p.pos, false);
        }
        this.vmKick = Math.min(1.2, (this.vmKick || 0) + p.landSpeed * 0.05);
      }
      if (p.justJumped) { p.justJumped = false; this.sound.play('jump', null, { refDist: 2 }); }
      if (this.mouse.left && !this.shopOpen && !this.paused) {
        const w = p.weapon;
        if (w && (w.auto && !p.burstMode)) this.tryFire(p, false);
        else if (!this.firedThisClick) { this.tryFire(p, false); this.firedThisClick = true; }
      } else {
        this.firedThisClick = false;
      }
      if (this.keys.has('KeyE')) {
        if (p.team === 'T' && p.hasBomb && this.map.whichSite(p.pos) && !this.bomb.planted) p.planting = true;
        if (p.team === 'CT' && this.bomb.planted && V.distXZ(p.pos, this.bomb.pos) < 2.0) p.defusing = true;
      } else {
        p.planting = false;
        p.defusing = false;
      }
    }

    // bots + remote characters
    for (const e of this.entities) {
      if (e === p) continue;
      if (e.isBot && this.isHost() && this.phase !== PHASE.END && this.phase !== PHASE.MATCHEND) {
        if (this.phase === PHASE.FREEZE) {
          e.pitch *= 0.9;
          e.animTime += dt;
        } else {
          e.think(this, dt, this.time);
          this.footsteps(e, dt);
        }
      }
      // weapon timers tick for everyone so animations stay in sync
      this.tickWeapon(e, dt);
    }
    this.tickWeapon(p, dt);

    this.updateGrenades(dt);
    this.updateParticles(dt);
    this.updateBomb(dt);
    this.renderer.updateDecals(dt);
    if (this.frameCount % 6 === 0) this.updateSpotting();
    this.updatePhase(dt);

    // flash fade
    for (const e of this.entities) {
      if (e.flashAmount > 0) e.flashAmount = Math.max(0, e.flashAmount - dt * (0.55 + e.flashAmount * 0.15));
    }
    this.hud.setFlash(clamp(p.flashAmount, 0, 1));

    // camera shake decay
    this.shakeAmount = Math.max(0, (this.shakeAmount || 0) - dt * 2.4);
    this.renderer.muzzleLight = Math.max(0, this.renderer.muzzleLight - dt * 9);
    this.vmKick = Math.max(0, (this.vmKick || 0) - dt * 7);

    // dropped weapons decay
    for (let i = this.droppedWeapons.length - 1; i >= 0; i--) {
      this.droppedWeapons[i].life -= dt;
      if (this.droppedWeapons[i].life <= 0) this.droppedWeapons.splice(i, 1);
    }

    // planting / defusing UI
    if (p.planting && !this.bomb.planted) {
      this.hud.progress('PLANTING', clamp(p.plantProgress / RULES.plantTime, 0, 1));
    } else if (p.defusing && this.bomb.planted) {
      const need = p.defuser ? RULES.defuseTimeKit : RULES.defuseTime;
      this.hud.progress(p.defuser ? 'DEFUSING (KIT)' : 'DEFUSING', clamp(p.defuseProgress / need, 0, 1));
    } else if (p.reloading > 0) {
      this.hud.progress('RELOADING', 1 - clamp(p.reloading / (p.reloadTotal || 1), 0, 1));
    } else {
      this.hud.progress(null, null);
    }

    if (this.shopOpen && !this.canBuy(p)) this.openShop(false);
  }

  tickWeapon(ent, dt) {
    if (ent.deploying > 0) ent.deploying = Math.max(0, ent.deploying - dt);
    if (ent.reloading > 0) {
      ent.reloading -= dt;
      if (ent.reloading <= 0) { ent.reloading = 0; this.finishReload(ent); }
    }
    // recoil recovery
    const sinceShot = this.time - ent.lastShot;
    if (sinceShot > 0.28) {
      ent.sprayIndex = Math.max(0, ent.sprayIndex - dt * 14);
      ent.recoil[0] = approach(ent.recoil[0], 0, dt * 22);
      ent.recoil[1] = approach(ent.recoil[1], 0, dt * 22);
    }
    ent.shotSpread = Math.max(0, ent.shotSpread - dt * 6);
    // view punch springs toward the current recoil offset then home
    const targetX = -ent.recoil[0] * 0.8, targetY = ent.recoil[1] * 0.8;
    ent.punch[0] += (targetX - ent.punch[0]) * Math.min(1, dt * 16);
    ent.punch[1] += (targetY - ent.punch[1]) * Math.min(1, dt * 16);
  }

  footsteps(ent, dt) {
    if (!ent.alive || !ent.onGround) return;
    const speed = Math.hypot(ent.vel[0], ent.vel[2]);
    if (speed < 1.1 || ent.walking || ent.ducking) return;
    ent.footstepTimer -= dt;
    if (ent.footstepTimer > 0) return;
    ent.footstepTimer = clamp(2.4 / Math.max(speed, 0.5), 0.28, 0.7);
    const vol = clamp(speed / 5, 0.3, 1);
    this.sound.play('step', ent === this.localPlayer ? null : ent.pos,
      { volume: ent === this.localPlayer ? 0.3 : vol * 0.7, refDist: 4 });
    if (ent !== this.localPlayer) this.notifyNoise(ent.pos, 0.5);
  }

  /* ============================ view + render ============================ */

  /** Whose eyes we are looking through (self, or a teammate when dead). */
  viewTarget() {
    const p = this.localPlayer;
    if (p.alive || this.mode === 'practice') return p;
    const mates = this.entities.filter(e => e.alive && e.team === p.team);
    if (!mates.length) return p;
    return mates[this.spectateIndex % mates.length];
  }

  cycleSpectate() {
    this.spectateIndex++;
    this.sound.play('switch');
  }

  render(dt) {
    const r = this.renderer;
    const view = this.viewTarget();
    const s = this.hud.settings;

    // camera
    const shake = this.shakeAmount || 0;
    const bobT = view.animTime * 9;
    const speed = Math.hypot(view.vel[0], view.vel[2]);
    const bobAmt = view.onGround ? clamp(speed / 4.8, 0, 1) * 0.022 : 0;
    const eye = view.eyePos();
    eye[1] += Math.sin(bobT) * bobAmt;
    eye[0] += Math.cos(bobT * 0.5) * bobAmt * 0.4 * Math.cos(view.yaw);
    eye[2] += Math.cos(bobT * 0.5) * bobAmt * 0.4 * -Math.sin(view.yaw);
    if (shake > 0) {
      eye[0] += rand(-shake, shake) * 0.05;
      eye[1] += rand(-shake, shake) * 0.05;
      eye[2] += rand(-shake, shake) * 0.05;
    }
    const camYaw = view.yaw + view.punch[0] * DEG;
    const camPitch = clamp(view.pitch + view.punch[1] * DEG, -1.56, 1.56);
    const roll = clamp(-view.vel[0] * Math.cos(view.yaw) - view.vel[2] * -Math.sin(view.yaw), -4, 4) * 0.0035
      + (view.alive ? 0 : 0.5);
    let fov = s.fov;
    if (view.zoomLevel > 0 && view.weapon && view.weapon.zoom) {
      fov = view.weapon.zoom[view.zoomLevel - 1];
    }
    fov += clamp(speed / 4.8, 0, 1) * 2.5;
    r.setCamera(eye, camYaw, camPitch, roll, fov);
    this.sound.setListener(eye, angleVector(camYaw, camPitch));

    // shadow pass
    if (s.shadows) {
      r.updateSun([eye[0], 0, eye[2]], 34);
      r.beginShadowPass();
      r.drawShadow(this.worldMesh, null);
      for (const e of this.entities) {
        if (!e.alive && this.time - e.deathTime > 6) continue;
        if (V.distXZ(e.pos, eye) > 45) continue;
        drawCharacter(r, e, this.assets, 'shadow', this.time);
      }
      r.endShadowPass();
    } else {
      r.updateSun([eye[0], 0, eye[2]], 34);
      r.beginShadowPass();
      r.endShadowPass();
    }

    // world pass
    r.beginWorldPass();
    r.drawMesh(this.worldMesh, null);
    for (const e of this.entities) {
      if (e === view && e.alive) continue;         // do not draw our own body
      if (!e.alive && this.time - e.deathTime > 25) continue;
      drawCharacter(r, e, this.assets, 'world', this.time);
    }

    // bomb, dropped weapons
    if (this.bomb.planted || this.bomb.dropped) {
      const m = M4.compose(this.bomb.pos, this.time * (this.bomb.dropped ? 0.6 : 0), 0, 0, 1);
      const blink = this.bomb.planted ? (Math.sin(this.time * 8) * 0.5 + 0.5) : 0;
      r.drawMesh(this.bombMesh, m, [1, 1, 1], blink * 0.6);
      if (this.bomb.planted) {
        r.sprite([this.bomb.pos[0], this.bomb.pos[1] + 0.2, this.bomb.pos[2]],
          0.25 + blink * 0.1, SPR.GLOW, [1, 0.2, 0.15, 0.5 + blink * 0.5], 'add');
      }
    }
    for (const d of this.droppedWeapons) {
      const kind = WEAPONS[d.key] ? WEAPONS[d.key].model : 'pistol';
      const mesh = this.assets.worldGuns[kind];
      const floor = this.map.floorAt(d.pos[0], d.pos[2], d.pos[1]);
      const m = M4.compose([d.pos[0], floor + 0.08, d.pos[2]], d.yaw, 0, Math.PI / 2 * 0.95, 1);
      r.drawMesh(mesh, m, WEAPONS[d.key] ? WEAPONS[d.key].tint : null);
    }

    r.flushSprites();

    // viewmodel
    if (s.viewmodel && view === this.localPlayer && view.alive) this.renderViewmodel(dt, view);

    r.endViewmodelPass();
  }

  renderViewmodel(dt, p) {
    const r = this.renderer;
    const key = p.slot === 'bomb' ? 'c4' : (p.slot === 'grenade' ? 'grenade' : p.weaponKey);
    const w = WEAPONS[key];
    const kind = key === 'c4' ? 'c4' : (p.slot === 'grenade' ? 'grenade' : (w ? w.model : 'knife'));
    if (!this.viewmodelCache[kind]) {
      const b = new MeshBuilder();
      buildGunMesh(b, kind, [1, 1, 1]);
      this.viewmodelCache[kind] = r.createMesh(b);
    }
    const mesh = this.viewmodelCache[kind];
    const pose = viewmodelPose(kind);

    // sway follows mouse movement, bob follows footsteps
    const speed = Math.hypot(p.vel[0], p.vel[2]);
    const t = p.animTime;
    const bob = clamp(speed / 4.8, 0, 1);
    const swayX = Math.sin(t * 9) * 0.008 * bob;
    const swayY = Math.abs(Math.cos(t * 9)) * 0.006 * bob;
    this.smoothYaw = this.smoothYaw === undefined ? p.yaw : this.smoothYaw;
    this.smoothPitch = this.smoothPitch === undefined ? p.pitch : this.smoothPitch;
    const dYaw = clamp(angleDiff(this.smoothYaw, p.yaw), -0.25, 0.25);
    const dPitch = clamp(p.pitch - this.smoothPitch, -0.25, 0.25);
    this.smoothYaw += dYaw * Math.min(1, dt * 14);
    this.smoothPitch += dPitch * Math.min(1, dt * 14);

    const kick = this.vmKick || 0;
    const deploy = p.deploying > 0 ? p.deploying / 0.6 : 0;
    const reload = p.reloading > 0 ? Math.sin(clamp(1 - p.reloading / (p.reloadTotal || 1), 0, 1) * Math.PI) : 0;

    let zoomBlend = 0;
    if (p.zoomLevel > 0) zoomBlend = 1;
    this.zoomLerp = lerp(this.zoomLerp || 0, zoomBlend, Math.min(1, dt * 18));

    const px = lerp(pose.pos[0] + swayX - dYaw * 0.35, 0.0, this.zoomLerp);
    const py = lerp(pose.pos[1] + swayY - dPitch * 0.22 - deploy * 0.14 - reload * 0.09, -0.06, this.zoomLerp);
    const pz = lerp(pose.pos[2] + kick * 0.035, pose.pos[2] - 0.08, this.zoomLerp);
    const rotX = pose.rot[0] + dPitch * 0.5 - kick * 0.14 + deploy * 0.7 + reload * 0.55;
    const rotY = pose.rot[1] - dYaw * 0.9;
    const rotZ = pose.rot[2] + reload * 0.4;

    const model = M4.compose([px, py, pz], rotY, rotX, rotZ, 1);
    r.beginViewmodelPass();
    if (this.zoomLerp < 0.85) {
      r.drawMesh(mesh, model, w ? w.tint : [1, 1, 1]);
    }
  }

  /* =============================== loop =============================== */

  loop(now) {
    requestAnimationFrame(this.loop);
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (dt > 0.1) dt = 0.1;
    this.fps = lerp(this.fps || 60, 1 / Math.max(dt, 0.0001), 0.05);

    if (this.running && !this.paused) {
      this.update(dt);
      this.render(dt);
      this.hud.update(this, dt);
    } else if (this.running) {
      this.render(dt);
    }
    if (this.hud) this.hud.tickPreview(dt);
  }

  /* ============================== menus ============================== */

  bindMenus() {
    const show = (id) => {
      for (const el of ['mainMenu', 'matchmaking', 'pvpLobby', 'settings', 'pause', 'matchEnd']) {
        document.getElementById(el).classList.toggle('hidden', el !== id);
      }
      if (!id) {
        for (const el of ['mainMenu', 'matchmaking', 'pvpLobby', 'settings', 'pause', 'matchEnd']) {
          document.getElementById(el).classList.add('hidden');
        }
      }
    };
    this.showScreen = show;

    document.getElementById('btnFindMatch').addEventListener('click', () => {
      this.sound.init();
      this.startMatchmaking();
    });
    document.getElementById('btnPractice').addEventListener('click', () => {
      this.sound.init();
      show(null);
      this.startMatch({
        mode: 'practice',
        difficulty: document.getElementById('optDifficulty').value,
        teamSize: parseInt(document.getElementById('optTeamSize').value, 10),
        team: document.getElementById('optSide').value,
      });
    });
    document.getElementById('btnSettings').addEventListener('click', () => show('settings'));
    document.getElementById('setClose').addEventListener('click', () =>
      show(this.running ? 'pause' : 'mainMenu'));
    document.getElementById('btnHostPvp').addEventListener('click', () => {
      this.sound.init();
      document.getElementById('pvpName').value = this.hud.settings.name || 'player';
      document.getElementById('pvpServer').value = this.hud.settings.server || NetClient.defaultUrl();
      document.getElementById('pvpRoom').value = this.hud.settings.room || 'DUNE1';
      show('pvpLobby');
    });

    document.getElementById('mmCancel').addEventListener('click', () => {
      clearInterval(this.mmTimer);
      show('mainMenu');
    });
    document.getElementById('pvpBack').addEventListener('click', () => {
      this.net.disconnect();
      show('mainMenu');
    });
    document.getElementById('pauseResume').addEventListener('click', () => this.setPaused(false));
    document.getElementById('pauseSettings').addEventListener('click', () => show('settings'));
    document.getElementById('pauseQuit').addEventListener('click', () => {
      this.running = false;
      this.net.disconnect();
      document.getElementById('hud').classList.add('hidden');
      show('mainMenu');
    });
    document.getElementById('endAgain').addEventListener('click', () => {
      document.getElementById('matchEnd').classList.add('hidden');
      this.startMatch({
        mode: this.mode, difficulty: this.difficulty, teamSize: this.teamSize,
        team: this.localPlayer.team, fillBots: true,
      });
    });
    document.getElementById('endMenu').addEventListener('click', () => {
      this.running = false;
      this.net.disconnect();
      document.getElementById('hud').classList.add('hidden');
      show('mainMenu');
    });

    this.bindPvpLobby();
  }

  /** Fake matchmaking: fills the lobby with the bots you are about to play. */
  startMatchmaking() {
    this.showScreen('matchmaking');
    const teamSize = parseInt(document.getElementById('optTeamSize').value, 10);
    const side = document.getElementById('optSide').value;
    const difficulty = document.getElementById('optDifficulty').value;
    const myTeam = side === 'random' ? (Math.random() < 0.5 ? 'T' : 'CT') : side;

    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    const slots = [];
    for (let i = 0; i < teamSize * 2; i++) {
      const team = i < teamSize ? 'T' : 'CT';
      slots.push({ team, name: null });
    }
    const mySlot = slots.findIndex(s => s.team === myTeam);
    slots[mySlot].name = this.hud.settings.name || 'you';
    slots[mySlot].me = true;

    const slotsEl = document.getElementById('mmSlots');
    const render = () => {
      slotsEl.innerHTML = slots.map(s =>
        `<div class="mm-slot ${s.team.toLowerCase()} ${s.name ? 'filled' : ''}">
           ${s.name ? escapeHtml(s.name) : 'searching…'}
           <span class="rank">${s.name ? (s.me ? 'you' : 'Silver ' + randi(1, 4)) : ''}</span>
         </div>`).join('');
    };
    render();

    const start = performance.now();
    let filled = 1;
    document.getElementById('mmAccept').classList.add('hidden');
    document.getElementById('mmStatus').textContent = 'SEARCHING FOR PLAYERS';
    clearInterval(this.mmTimer);
    this.mmTimer = setInterval(() => {
      const el = (performance.now() - start) / 1000;
      document.getElementById('mmElapsed').textContent =
        `0:${String(Math.floor(el)).padStart(2, '0')}`;
      if (filled < slots.length && Math.random() < 0.55) {
        const empty = slots.filter(s => !s.name);
        const s = pick(empty);
        s.name = names[filled % names.length];
        filled++;
        render();
        this.sound.play('buy');
      }
      if (filled >= slots.length) {
        clearInterval(this.mmTimer);
        document.getElementById('mmStatus').textContent = 'MATCH FOUND';
        document.getElementById('mmAccept').classList.remove('hidden');
        document.getElementById('mmEta').textContent = '0:00';
        this.sound.play('roundstart');
        const accept = document.getElementById('mmAccept');
        accept.onclick = () => {
          this.showScreen(null);
          this.startMatch({ mode: 'offline', difficulty, teamSize, team: myTeam });
        };
      }
    }, 320);
  }

  /* ------------------------------- PvP ------------------------------- */

  bindPvpLobby() {
    const statusEl = document.getElementById('pvpStatus');
    const rosterEl = document.getElementById('pvpRoster');
    const startBtn = document.getElementById('pvpStart');

    const renderRoster = () => {
      const list = [...this.net.players.values()];
      rosterEl.innerHTML = list.map(p =>
        `<span class="p ${p.team.toLowerCase()}">${escapeHtml(p.name)}${p.id === this.net.id ? ' (you)' : ''}</span>`
      ).join('');
      startBtn.disabled = !this.net.host;
      statusEl.textContent = this.net.host
        ? `Connected to ${this.net.room} · you are the host · ${list.length} player(s)`
        : `Connected to ${this.net.room} · waiting for the host to start`;
      statusEl.className = 'pvp-status ok';
    };

    document.getElementById('pvpConnect').addEventListener('click', async () => {
      const name = (document.getElementById('pvpName').value || 'player').slice(0, 14);
      const url = document.getElementById('pvpServer').value || NetClient.defaultUrl();
      const room = (document.getElementById('pvpRoom').value || 'DUNE1').toUpperCase();
      const team = document.getElementById('pvpTeam').value;
      this.hud.settings.name = name;
      this.hud.settings.server = url;
      this.hud.settings.room = room;
      saveSettings(this.hud.settings);
      statusEl.textContent = 'Connecting…';
      statusEl.className = 'pvp-status';
      try {
        await this.net.connect(url, name, room, team, document.getElementById('pvpFillBots').checked);
        renderRoster();
      } catch (err) {
        statusEl.textContent = err.message + ' Start it with "npm run game" and use the address it prints.';
        statusEl.className = 'pvp-status err';
      }
    });

    this.net.on('roster', renderRoster);
    this.net.on('close', () => {
      statusEl.textContent = 'Disconnected from the server.';
      statusEl.className = 'pvp-status err';
      startBtn.disabled = true;
    });

    startBtn.addEventListener('click', () => {
      this.net.send({ t: 'start', teamSize: Math.max(2, Math.ceil(this.net.players.size / 2)) });
    });

    this.net.on('start', (msg) => {
      this.showScreen(null);
      const me = this.net.players.get(this.net.id);
      this.startMatch({
        mode: 'pvp', difficulty: document.getElementById('optDifficulty').value,
        teamSize: msg.teamSize || 5, team: me ? me.team : 'T',
        fillBots: msg.fillBots,
      });
    });

    // remote state + events
    this.net.on('s', (msg) => this.net.pushSnapshot(msg.id, msg, this.time));
    this.net.on('shot', (msg) => {
      const p = this.net.players.get(msg.id);
      if (!p || !p.entity) return;
      const w = WEAPONS[msg.w];
      if (!w) return;
      this.sound.play(w.sound || 'rifle', p.entity.eyePos());
      this.spawnMuzzleFlash(p.entity, w);
      // The host resolves damage; everyone else just plays the effects.
      if (this.isHost()) {
        const dir = angleVector(msg.d[0], msg.d[1]);
        this.fireBullet(p.entity, msg.o, dir, w);
      }
      this.notifyNoise(p.entity.pos, w.silenced ? 0.45 : 1.35);
    });
    this.net.on('ev', (msg) => this.applyNetEvent(msg));
    this.net.on('left', (msg) => {
      const p = this.net.players.get(msg.id);
      if (p && p.entity) {
        p.entity.alive = false;
        this.entities = this.entities.filter(e => e !== p.entity);
      }
      this.net.players.delete(msg.id);
    });
  }

  /** Authoritative events pushed by the host. */
  applyNetEvent(msg) {
    if (this.isHost()) return;
    switch (msg.k) {
      case 'round':
        this.phase = msg.phase;
        this.phaseTime = msg.time;
        this.roundNumber = msg.n;
        this.score = msg.score;
        break;
      case 'hp': {
        const ent = this.entityByNet(msg.id);
        if (ent) { ent.health = msg.hp; ent.armor = msg.ar; }
        break;
      }
      case 'kill': {
        const victim = this.entityByNet(msg.v);
        const attacker = this.entityByNet(msg.a);
        if (victim) {
          victim.alive = false;
          victim.deathTime = this.time;
          this.hud.addKill(attacker, victim, msg.w, msg.hs, false, this.localPlayer);
        }
        break;
      }
      default: break;
    }
  }

  entityByNet(id) {
    if (id === undefined || id === null) return null;
    if (id === this.net.id) return this.localPlayer;
    const p = this.net.players.get(id);
    return p ? p.entity : this.entities.find(e => e.id === id) || null;
  }
}

/* ------------------------------ helpers ------------------------------ */

function frame() {
  return new Promise(r => requestAnimationFrame(() => r()));
}

/** How far a ray inside an AABB travels before it exits (wall thickness). */
function exitDistance(origin, dir, min, max) {
  let t = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dir[i]) < 1e-8) continue;
    const target = dir[i] > 0 ? max[i] : min[i];
    const d = (target - origin[i]) / dir[i];
    if (d > 0 && d < t) t = d;
  }
  return t === Infinity ? 0 : t;
}

function keyOfWeapon(w) {
  for (const [k, v] of Object.entries(WEAPONS)) if (v === w) return k;
  return 'grenade';
}

/* ------------------------------- boot -------------------------------- */

const game = new Game();
window.game = game;
game.init().catch(err => {
  console.error(err);
});
