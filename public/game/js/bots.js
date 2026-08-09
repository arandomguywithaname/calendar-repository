'use strict';
/* ------------------------------------------------------------------
   bots.js — bot AI: perception (FOV + line of sight + smoke), reaction
   delay, converging aim with human-ish error, spray control, path
   following on the nav grid and bomb-scenario decision making.
   ------------------------------------------------------------------ */

const DIFFICULTY = {
  easy: {
    label: 'Easy', reaction: [0.42, 0.72], aimSpeed: 5.0, aimError: 5.5, settle: 1.6,
    fov: 105, spray: 0.25, hearing: 16, burstSkill: 0.35, moveSkill: 0.4, accuracyBoost: 0.75,
  },
  normal: {
    label: 'Normal', reaction: [0.26, 0.46], aimSpeed: 8.5, aimError: 3.2, settle: 1.0,
    fov: 120, spray: 0.5, hearing: 24, burstSkill: 0.6, moveSkill: 0.65, accuracyBoost: 0.9,
  },
  hard: {
    label: 'Hard', reaction: [0.17, 0.30], aimSpeed: 13.0, aimError: 1.9, settle: 0.62,
    fov: 135, spray: 0.72, hearing: 32, burstSkill: 0.8, moveSkill: 0.85, accuracyBoost: 1.0,
  },
  expert: {
    label: 'Expert', reaction: [0.10, 0.19], aimSpeed: 19.0, aimError: 1.05, settle: 0.38,
    fov: 150, spray: 0.9, hearing: 40, burstSkill: 0.95, moveSkill: 1.0, accuracyBoost: 1.05,
  },
};

const BOT_NAMES = [
  'Vex', 'Rook', 'Cinder', 'Havoc', 'Sable', 'Quill', 'Onyx', 'Drift', 'Nomad', 'Pike',
  'Wraith', 'Cobalt', 'Juno', 'Slate', 'Torque', 'Ash', 'Ember', 'Kestrel', 'Ravel', 'Volt',
];

class Bot extends Character {
  constructor(team, name, difficulty) {
    super(team, name, true);
    this.diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.difficultyKey = difficulty;
    // Per-bot personality so a team does not feel like one mind.
    this.skill = rand(0.82, 1.18);
    this.aggression = rand(0.3, 0.9);
    this.patience = rand(0.5, 1.5);

    this.target = null;
    this.targetSeenAt = -99;
    this.lastSeenPos = null;
    this.reactTimer = 0;
    this.aimError = [0, 0];
    this.aimErrorTarget = [0, 0];
    this.path = null;
    this.pathIndex = 0;
    this.pathGoal = null;
    this.repathTimer = 0;
    this.stuckTimer = 0;
    this.lastPos = [0, 0, 0];
    this.state = 'idle';
    this.goalSite = null;
    this.holdSpot = null;
    this.strafeDir = pick([-1, 1]);
    this.strafeTimer = 0;
    this.burstTimer = 0;
    this.burstShots = 0;
    this.investigate = null;
    this.investigateTimer = 0;
    this.decisionTimer = rand(0, 0.4);
    this.wantJump = false;
    this.crouchTimer = 0;
  }

  /* ------------------------------ senses ------------------------------ */

  canSee(game, other) {
    if (!other.alive) return false;
    const eye = this.eyePos();
    const d = V.sub(other.pos, eye);
    const dist = Math.hypot(d[0], d[1], d[2]);
    if (dist > 70) return false;
    // field of view
    const fwd = angleVector(this.yaw, this.pitch);
    const dn = V.mul(d, 1 / Math.max(dist, 0.001));
    const dot = V.dot(fwd, dn);
    const fovCos = Math.cos((this.diff.fov / 2) * DEG);
    if (dot < fovCos && dist > 3.5) return false;
    // blindness / smoke
    if (this.flashAmount > 0.6) return false;
    const targets = [
      [other.pos[0], other.pos[1] + other.currentHeight() * 0.75, other.pos[2]],
      [other.pos[0], other.pos[1] + other.currentHeight() * 0.35, other.pos[2]],
    ];
    for (const tp of targets) {
      if (!game.map.visible(eye, tp)) continue;
      if (game.smokeBlocks(eye, tp)) continue;
      return true;
    }
    return false;
  }

  pickTarget(game) {
    let best = null, bestScore = -1e9;
    for (const e of game.entities) {
      if (!e.alive || e.team === this.team) continue;
      if (!this.canSee(game, e)) continue;
      const dist = V.dist(this.pos, e.pos);
      let score = 100 - dist;
      if (e === this.target) score += 18;          // stickiness
      if (e.health < 40) score += 12;
      const fwd = angleVector(this.yaw, 0);
      const to = V.norm(V.sub(e.pos, this.pos));
      score += V.dot(fwd, to) * 10;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  /** Called when a nearby noise happens (shot, footstep, plant). */
  hear(pos, loudness) {
    const dist = V.dist(this.pos, pos);
    if (dist > this.diff.hearing * loudness) return;
    if (this.target) return;
    this.investigate = [pos[0], pos[1], pos[2]];
    this.investigateTimer = rand(3, 6);
  }

  /* ------------------------------ thinking ------------------------------ */

  think(game, dt, time) {
    if (!this.alive) return;
    this.decisionTimer -= dt;
    this.repathTimer -= dt;
    this.investigateTimer -= dt;
    this.strafeTimer -= dt;
    this.crouchTimer -= dt;

    const prevTarget = this.target;
    const seen = this.pickTarget(game);
    if (seen) {
      if (!prevTarget || prevTarget !== seen) {
        this.reactTimer = rand(this.diff.reaction[0], this.diff.reaction[1]) / this.skill;
        this._scrambleAim(2.2);
      }
      this.target = seen;
      this.targetSeenAt = time;
      this.lastSeenPos = [seen.pos[0], seen.pos[1], seen.pos[2]];
    } else if (this.target && time - this.targetSeenAt > 1.4) {
      this.target = null;
    }
    this.reactTimer = Math.max(0, this.reactTimer - dt);

    const cmd = { forward: 0, side: 0, jump: false, duck: false, walk: false };
    this._objective(game, time);
    if (this.target && this.reactTimer <= 0) this._fight(game, cmd, dt, time);
    else this._navigate(game, cmd, dt, time);

    // teammate separation so bots do not clump in doorways
    for (const e of game.entities) {
      if (e === this || !e.alive || e.team !== this.team) continue;
      const dx = this.pos[0] - e.pos[0], dz = this.pos[2] - e.pos[2];
      const d2 = dx * dx + dz * dz;
      if (d2 < 1.2 && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (1.2 - d) * 0.9;
        const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
        const fwdDot = (-sy * dx + -cy * dz) / d;
        const rightDot = (cy * dx + -sy * dz) / d;
        cmd.forward += fwdDot * push;
        cmd.side += rightDot * push;
      }
    }

    cmd.forward = clamp(cmd.forward, -1, 1);
    cmd.side = clamp(cmd.side, -1, 1);
    if (this.crouchTimer > 0) cmd.duck = true;
    this.move(game.map, cmd, dt);
    this._unstick(dt);
  }

  _scrambleAim(scale) {
    const e = this.diff.aimError * scale / this.skill;
    this.aimErrorTarget = [rand(-e, e) * DEG, rand(-e, e) * DEG * 0.6];
    this.aimError = [this.aimErrorTarget[0], this.aimErrorTarget[1]];
  }

  /* ------------------------------ combat ------------------------------ */

  _fight(game, cmd, dt, time) {
    const t = this.target;
    const dist = V.dist(this.pos, t.pos);
    const weapon = this.weapon;

    // Aim at a point that drifts toward the head as the bot settles.
    const settleT = clamp((time - this.targetSeenAt) / this.diff.settle, 0, 1);
    const aimHeight = lerp(t.currentHeight() * 0.62, t.currentHeight() - 0.16, settleT * 0.85);
    const lead = 0.06 * (1 - this.diff.moveSkill * 0.5);
    const aimPoint = [
      t.pos[0] + t.vel[0] * lead,
      t.pos[1] + aimHeight,
      t.pos[2] + t.vel[2] * lead,
    ];
    const eye = this.eyePos();
    const d = V.sub(aimPoint, eye);
    const wantYaw = Math.atan2(-d[0], -d[2]);
    const wantPitch = Math.atan2(d[1], Math.hypot(d[0], d[2]));

    // Error shrinks while the bot keeps tracking the same target.
    const decay = Math.exp(-dt / (this.diff.settle * 0.6));
    this.aimError[0] *= decay;
    this.aimError[1] *= decay;
    if (Math.random() < dt * 1.6) {
      const e = this.diff.aimError * 0.35 / this.skill * DEG;
      this.aimError[0] += rand(-e, e);
      this.aimError[1] += rand(-e, e) * 0.6;
    }

    // Counteract the accumulated spray, as well as the bot's skill allows.
    const comp = this.diff.spray * clamp(this.skill, 0.6, 1.2);
    const recoilYaw = -this.recoil[0] * DEG * comp;
    const recoilPitch = -this.recoil[1] * DEG * comp;

    const targetYaw = wantYaw + this.aimError[0] + recoilYaw;
    const targetPitch = clamp(wantPitch + this.aimError[1] + recoilPitch, -1.4, 1.4);

    const speed = this.diff.aimSpeed * this.skill;
    const k = 1 - Math.exp(-speed * dt);
    this.yaw += angleDiff(this.yaw, targetYaw) * k;
    this.pitch += (targetPitch - this.pitch) * k;

    const aimOff = Math.abs(angleDiff(this.yaw, wantYaw)) + Math.abs(this.pitch - wantPitch);

    // Movement while fighting: strafe, close distance, or hold.
    const preferred = weapon && weapon.zoom ? 22 : (weapon && weapon.slot === SLOT.PRIMARY ? 12 : 7);
    if (this.strafeTimer <= 0) {
      this.strafeTimer = rand(0.35, 1.1);
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    }
    const wantsToPeek = this.diff.moveSkill > 0.5;
    if (dist > preferred * 1.5) cmd.forward = 0.9;
    else if (dist < preferred * 0.45) cmd.forward = -0.7;
    else if (wantsToPeek) cmd.side = this.strafeDir * (0.55 + this.aggression * 0.45);

    if (dist > 18 && Math.random() < dt * 0.7 && this.diff.moveSkill > 0.6) this.crouchTimer = rand(0.4, 1.2);

    // Stop moving right before firing — accuracy demands it.
    const wantFire = aimOff < (dist > 25 ? 0.028 : 0.075) && this.reactTimer <= 0;
    if (wantFire && weapon && !weapon.melee) {
      const stopping = this.diff.burstSkill > Math.random() ? 1 : 0;
      if (stopping && Math.hypot(this.vel[0], this.vel[2]) > 1.2) {
        cmd.forward = 0; cmd.side = 0;
        // counter-strafe to kill momentum quickly
        const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
        const vf = -sy * this.vel[0] + -cy * this.vel[2];
        const vs = cy * this.vel[0] + -sy * this.vel[2];
        cmd.forward = clamp(-vf, -1, 1);
        cmd.side = clamp(-vs, -1, 1);
      }
    }

    const ammo = this.ammoFor(this.weaponKey || 'knife');
    if (weapon && !weapon.melee && ammo.mag <= 0) {
      if (ammo.reserve > 0) game.startReload(this);
      else if (this.inventory.secondary && this.slot !== 'secondary') this.selectSlot('secondary');
      else this.selectSlot('knife');
      return;
    }
    if (weapon && weapon.melee && dist > 2.2) {
      // knife out but far away — get the gun back if we have one
      if (this.inventory.primary) this.selectSlot('primary');
      else if (this.inventory.secondary) this.selectSlot('secondary');
    }

    // Scoped weapons: zoom at range.
    if (weapon && weapon.zoom && dist > 14 && this.zoomLevel === 0 && Math.hypot(this.vel[0], this.vel[2]) < 1.5) {
      game.toggleZoom(this);
    } else if (weapon && weapon.zoom && dist < 8 && this.zoomLevel > 0) {
      game.toggleZoom(this);
    }

    if (!wantFire) return;
    if (weapon && weapon.melee) {
      if (dist < 1.8) game.tryFire(this, false);
      return;
    }
    // Burst discipline: long range gets taps, close range gets a hose.
    const burstCap = dist > 30 ? 1 : (dist > 18 ? 3 : (dist > 9 ? 6 : 30));
    const skillCap = Math.round(lerp(burstCap * 2.2, burstCap, this.diff.burstSkill));
    if (this.burstTimer > 0) { this.burstTimer -= dt; return; }
    if (this.sprayIndex >= skillCap && weapon.auto) {
      this.burstTimer = rand(0.16, 0.34) * (2 - this.diff.burstSkill);
      return;
    }
    game.tryFire(this, false);
  }

  /* ---------------------------- objectives ---------------------------- */

  _objective(game, time) {
    if (this.decisionTimer > 0) return;
    this.decisionTimer = rand(0.5, 1.2);
    const map = game.map;
    const bomb = game.bomb;

    if (this.team === 'T') {
      if (bomb.planted) {
        // Defend the bomb from cover near the site.
        this.state = 'defend';
        if (!this.holdSpot || this.holdSpot.site !== bomb.site) {
          const spots = map.holdSpots[bomb.site];
          this.holdSpot = { site: bomb.site, ...pick(spots) };
        }
        this._setGoal(this.holdSpot.pos);
        return;
      }
      if (this.hasBomb) {
        this.state = 'plant';
        const site = map.sites[this.goalSite || 'A'];
        if (map.inSite(this.pos, this.goalSite) && !game.enemyNearby(this, 9)) {
          this._setGoal(this.pos);
          game.startPlant(this);
        } else {
          this._setGoal(this._sitePushPoint(game, this.goalSite));
        }
        return;
      }
      this.state = 'push';
      this._setGoal(this._sitePushPoint(game, this.goalSite));
      return;
    }

    // CT
    if (bomb.planted) {
      this.state = 'retake';
      const site = map.sites[bomb.site];
      const near = V.distXZ(this.pos, bomb.pos) < 2.0;
      if (near && !game.enemyNearby(this, 7)) {
        game.startDefuse(this);
        this._setGoal(this.pos);
      } else {
        this._setGoal(bomb.pos);
      }
      void site;
      return;
    }
    if (game.bombCarrierSeen && game.bombCarrierSeen.site && Math.random() < 0.8) {
      this.state = 'rotate';
      this.goalSite = game.bombCarrierSeen.site;
      this.holdSpot = null;
    }
    this.state = this.state === 'rotate' ? 'rotate' : 'hold';
    if (!this.holdSpot || this.holdSpot.site !== this.goalSite) {
      const spots = map.holdSpots[this.goalSite] || map.holdSpots.A;
      this.holdSpot = { site: this.goalSite, ...pick(spots) };
    }
    this._setGoal(this.holdSpot.pos);
  }

  /** Walk the T-side approach points in order, so pushes look deliberate. */
  _sitePushPoint(game, site) {
    const list = game.map.pushSpots[site] || game.map.pushSpots.A;
    if (this._pushIndex === undefined) this._pushIndex = 0;
    const goal = list[Math.min(this._pushIndex, list.length - 1)];
    if (V.distXZ(this.pos, goal) < 3.2 && this._pushIndex < list.length - 1) this._pushIndex++;
    return list[Math.min(this._pushIndex, list.length - 1)];
  }

  _setGoal(pos) {
    if (!pos) return;
    if (this.pathGoal && V.distXZ(this.pathGoal, pos) < 1.0 && this.path) return;
    this.pathGoal = [pos[0], pos[1], pos[2]];
    this.repathTimer = 0;
  }

  /* ---------------------------- navigation ---------------------------- */

  _navigate(game, cmd, dt, time) {
    // Look toward danger while walking: either a noise or the hold angle.
    let lookTarget = null;
    if (this.investigateTimer > 0 && this.investigate) lookTarget = this.investigate;
    else if (this.lastSeenPos && time - this.targetSeenAt < 4) lookTarget = this.lastSeenPos;

    let goal = this.pathGoal;
    if (this.investigateTimer > 0 && this.investigate && this.state !== 'plant' && this.state !== 'retake') {
      if (V.distXZ(this.pos, this.investigate) > 3) goal = this.investigate;
    }

    if (goal && (this.repathTimer <= 0 || !this.path)) {
      this.repathTimer = rand(0.8, 1.6);
      const path = game.map.findPath(this.pos, goal);
      if (path && path.length) { this.path = path; this.pathIndex = 0; }
    }

    let moveDir = null;
    if (this.path && this.pathIndex < this.path.length) {
      let wp = this.path[this.pathIndex];
      while (this.pathIndex < this.path.length - 1 && V.distXZ(this.pos, wp) < 0.9) {
        this.pathIndex++;
        wp = this.path[this.pathIndex];
      }
      const dx = wp[0] - this.pos[0], dz = wp[2] - this.pos[2];
      const dist = Math.hypot(dx, dz);
      if (dist < 0.7 && this.pathIndex >= this.path.length - 1) {
        this.path = null;
        // Arrived: face the hold angle.
        if (this.holdSpot && this.holdSpot.yaw !== undefined && !lookTarget) {
          this.yaw += angleDiff(this.yaw, this.holdSpot.yaw) * Math.min(1, dt * 3.5);
          this.pitch += (0 - this.pitch) * Math.min(1, dt * 3);
        }
      } else {
        moveDir = [dx / dist, 0, dz / dist];
      }
    }

    if (moveDir) {
      const desiredYaw = Math.atan2(-moveDir[0], -moveDir[2]);
      const faceYaw = lookTarget
        ? Math.atan2(-(lookTarget[0] - this.pos[0]), -(lookTarget[2] - this.pos[2]))
        : desiredYaw;
      this.yaw += angleDiff(this.yaw, faceYaw) * Math.min(1, dt * 6);
      if (lookTarget) {
        const dy = lookTarget[1] + 1.2 - (this.pos[1] + this.eyeHeight);
        const flat = Math.max(0.5, V.distXZ(this.pos, lookTarget));
        this.pitch += (clamp(Math.atan2(dy, flat), -0.5, 0.5) - this.pitch) * Math.min(1, dt * 4);
      } else {
        this.pitch += (0 - this.pitch) * Math.min(1, dt * 3);
      }
      // Convert world direction into local forward/side.
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      cmd.forward = -sy * moveDir[0] + -cy * moveDir[2];
      cmd.side = cy * moveDir[0] + -sy * moveDir[2];
      const len = Math.hypot(cmd.forward, cmd.side) || 1;
      cmd.forward /= len; cmd.side /= len;
      // Sneak when close to where enemies are expected.
      if (this.state === 'hold' || (this.investigateTimer > 0 && V.distXZ(this.pos, this.investigate || this.pos) < 8)) {
        cmd.walk = true;
      }
    } else if (lookTarget) {
      const faceYaw = Math.atan2(-(lookTarget[0] - this.pos[0]), -(lookTarget[2] - this.pos[2]));
      this.yaw += angleDiff(this.yaw, faceYaw) * Math.min(1, dt * 4);
    } else if (this.holdSpot && this.holdSpot.yaw !== undefined) {
      // idle scanning
      const scan = this.holdSpot.yaw + Math.sin(time * 0.5 + this.id) * 0.35;
      this.yaw += angleDiff(this.yaw, scan) * Math.min(1, dt * 2);
      this.pitch += (0 - this.pitch) * Math.min(1, dt * 2);
    }

    // Reload during downtime.
    const w = this.weapon;
    if (w && !w.melee && !this.reloading) {
      const ammo = this.ammoFor(this.weaponKey);
      if (ammo.mag < w.mag * 0.45 && ammo.reserve > 0 && !this.target) game.startReload(this);
    }
    if (this.zoomLevel > 0 && !this.target) game.toggleZoom(this);
  }

  _unstick(dt) {
    const moved = V.distXZ(this.pos, this.lastPos);
    this.lastPos = [this.pos[0], this.pos[1], this.pos[2]];
    if (moved < 0.02 * 60 * dt && !this.target) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.8) {
        this.stuckTimer = 0;
        this.path = null;
        this.repathTimer = 0;
        this.yaw += rand(-1.2, 1.2);
      }
    } else {
      this.stuckTimer = Math.max(0, this.stuckTimer - dt);
    }
  }

  /* ------------------------------- buying ------------------------------- */

  buy(game) {
    const money = this.money;
    const isT = this.team === 'T';
    const round = game.roundNumber;
    const buy = (key) => {
      const w = WEAPONS[key];
      if (!w || this.money < w.price) return false;
      this.money -= w.price;
      this.giveWeapon(key);
      return true;
    };

    // Save round: keep money if we cannot afford a real setup.
    const canFullBuy = money >= 4000;
    const eco = money < 2200 && round > 2;

    if (!this.inventory.secondary) this.giveWeapon(isT ? 'glock' : 'usp');

    if (canFullBuy) {
      if (this.armor < 100) { this.money -= 1000; this.armor = 100; this.helmet = true; }
      const roll = Math.random();
      if (roll < 0.12 && this.money >= 4750) buy('awp');
      else if (roll < 0.75) buy(isT ? 'ak47' : (Math.random() < 0.5 ? 'm4a4' : 'm4a1s'));
      else buy(isT ? 'galil' : 'famas');
      if (this.money >= 300 && Math.random() < 0.7) this.grenades.push('he');
      if (this.money >= 300 && Math.random() < 0.5) { this.money -= 300; this.grenades.push('smoke'); }
      if (this.money >= 200 && Math.random() < 0.45) { this.money -= 200; this.grenades.push('flash'); }
      if (!isT && this.money >= 400 && Math.random() < 0.6) { this.money -= 400; this.defuser = true; }
    } else if (!eco && money >= 2200) {
      if (this.armor < 100 && this.money >= 650) { this.money -= 650; this.armor = 100; }
      buy(isT ? 'galil' : 'famas') || buy('ump') || buy('mp9');
      if (this.money >= 300 && Math.random() < 0.4) { this.money -= 300; this.grenades.push('he'); }
    } else if (money >= 1000 && !eco) {
      if (Math.random() < 0.5) buy('ump'); else buy('mp9');
    } else if (money >= 900 && Math.random() < 0.35) {
      buy('deagle');
      if (this.money >= 650) { this.money -= 650; this.armor = 100; }
    } else if (money >= 650 && Math.random() < 0.4) {
      this.money -= 650; this.armor = 100;
    }
    this.money = Math.max(0, this.money);
    if (this.grenades.length > 3) this.grenades.length = 3;
  }
}
