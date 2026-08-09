'use strict';
/* ------------------------------------------------------------------
   player.js — shared character state: Quake-style movement (so
   counter-strafing and air-strafing work), inventory, hitboxes and the
   procedural body model used for every player in the world.
   ------------------------------------------------------------------ */

const MOVE = {
  maxSpeed: 4.85,
  walkMult: 0.52,
  crouchMult: 0.34,
  accel: 6.2,
  airAccel: 14,
  airWishCap: 0.62,
  friction: 5.4,
  stopSpeed: 1.6,
  gravity: 15.24,
  jumpVel: 5.75,
};

let NEXT_ENTITY_ID = 1;

class Character {
  constructor(team, name, isBot) {
    this.id = NEXT_ENTITY_ID++;
    this.team = team;               // 'T' | 'CT'
    this.name = name;
    this.isBot = !!isBot;
    this.pos = [0, 0, 0];
    this.vel = [0, 0, 0];
    this.yaw = 0;
    this.pitch = 0;
    this.alive = true;
    this.health = 100;
    this.armor = 0;
    this.helmet = false;
    this.defuser = false;
    this.money = 800;
    this.kills = 0;
    this.deaths = 0;
    this.assists = 0;
    this.damageDealt = 0;
    this.score = 0;
    this.mvps = 0;

    this.ducking = false;
    this.duckAmount = 0;
    this.onGround = true;
    this.walking = false;
    this.height = PLAYER_HEIGHT;

    this.inventory = { primary: null, secondary: null, knife: 'knife' };
    this.grenades = [];
    this.hasBomb = false;
    this.slot = 'secondary';
    this.ammo = {};                 // key -> { mag, reserve }
    this.nextFire = 0;
    this.reloading = 0;
    this.deploying = 0;
    this.sprayIndex = 0;
    this.lastShot = -99;
    this.shotSpread = 0;
    this.zoomLevel = 0;
    this.recoil = [0, 0];           // accumulated aim offset (deg)
    this.punch = [0, 0];            // view punch (deg), springs back
    this.punchVel = [0, 0];

    this.flashAmount = 0;
    this.stepPhase = 0;
    this.lastStep = 0;
    this.animTime = 0;
    this.deathTime = 0;
    this.deathYaw = 0;
    this.lastAttacker = null;
    this.recentDamagers = new Map();
    this.footstepTimer = 0;
    this.blindUntil = 0;
    this.plantProgress = 0;
    this.defuseProgress = 0;
  }

  /* ------------------------------- state ------------------------------- */

  get eyeHeight() {
    return this.currentHeight() - EYE_OFFSET;
  }

  currentHeight() {
    return lerp(PLAYER_HEIGHT, CROUCH_HEIGHT, this.duckAmount);
  }

  eyePos(out = [0, 0, 0]) {
    out[0] = this.pos[0];
    out[1] = this.pos[1] + this.eyeHeight;
    out[2] = this.pos[2];
    return out;
  }

  get weaponKey() {
    if (this.slot === 'bomb') return 'c4';
    if (this.slot === 'grenade') return this.grenades[this.grenadeIndex || 0] || null;
    return this.inventory[this.slot];
  }

  get weapon() {
    const k = this.weaponKey;
    return k && WEAPONS[k] ? WEAPONS[k] : null;
  }

  speedMultiplier() {
    const w = this.weapon;
    let m = w ? w.speed : 1;
    if (this.zoomLevel > 0) m *= 0.42;
    return m;
  }

  ammoFor(key) {
    if (!this.ammo[key]) {
      const w = WEAPONS[key];
      this.ammo[key] = w ? { mag: w.mag, reserve: w.reserve } : { mag: 0, reserve: 0 };
    }
    return this.ammo[key];
  }

  giveWeapon(key) {
    const w = WEAPONS[key];
    if (!w) return;
    if (w.slot === SLOT.PRIMARY) this.inventory.primary = key;
    else if (w.slot === SLOT.SECONDARY) this.inventory.secondary = key;
    this.ammo[key] = { mag: w.mag, reserve: w.reserve };
    this.selectSlot(w.slot === SLOT.PRIMARY ? 'primary' : 'secondary');
  }

  selectSlot(slot) {
    if (slot === 'primary' && !this.inventory.primary) return false;
    if (slot === 'secondary' && !this.inventory.secondary) return false;
    if (slot === 'grenade' && !this.grenades.length) return false;
    if (slot === 'bomb' && !this.hasBomb) return false;
    if (this.slot === slot) return false;
    this.slot = slot;
    this.reloading = 0;
    this.zoomLevel = 0;
    this.sprayIndex = 0;
    this.deploying = slot === 'knife' ? 0.35 : 0.6;
    return true;
  }

  nextGrenade() {
    if (!this.grenades.length) return false;
    if (this.slot !== 'grenade') return this.selectSlot('grenade');
    this.grenadeIndex = ((this.grenadeIndex || 0) + 1) % this.grenades.length;
    this.deploying = 0.5;
    return true;
  }

  /* ----------------------------- movement ----------------------------- */

  /**
   * @param cmd { forward, side, jump, duck, walk } — forward/side in [-1,1]
   */
  move(map, cmd, dt) {
    if (!this.alive) return;

    // Duck transition, but only stand up when there is room.
    const wantDuck = !!cmd.duck;
    const target = wantDuck ? 1 : 0;
    if (target > this.duckAmount) {
      this.duckAmount = Math.min(1, this.duckAmount + dt * 6.5);
    } else if (target < this.duckAmount) {
      const probe = Math.max(0, this.duckAmount - dt * 6.5);
      const h = lerp(PLAYER_HEIGHT, CROUCH_HEIGHT, probe);
      if (!map.overlaps(this.pos, PLAYER_RADIUS, h)) this.duckAmount = probe;
    }
    this.ducking = this.duckAmount > 0.5;
    const height = this.currentHeight();
    this.height = height;

    // Desired direction in world space.
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fwd = [-sy, 0, -cy];
    const right = [cy, 0, -sy];
    let wish = [
      fwd[0] * cmd.forward + right[0] * cmd.side,
      0,
      fwd[2] * cmd.forward + right[2] * cmd.side,
    ];
    const wishLen = Math.hypot(wish[0], wish[2]);
    if (wishLen > 0.001) { wish[0] /= wishLen; wish[2] /= wishLen; }

    let maxSpeed = MOVE.maxSpeed * this.speedMultiplier();
    if (cmd.walk) maxSpeed *= MOVE.walkMult;
    if (this.duckAmount > 0.5) maxSpeed *= MOVE.crouchMult;
    this.walking = !!cmd.walk;
    let wishSpeed = Math.min(wishLen, 1) * maxSpeed;

    if (this.onGround) {
      this._friction(dt);
      this._accelerate(wish, wishSpeed, MOVE.accel, dt);
      this.vel[1] = 0;
      if (cmd.jump && this.jumpCooldown <= 0) {
        this.vel[1] = MOVE.jumpVel;
        this.onGround = false;
        this.jumpCooldown = 0.12;
        this.justJumped = true;
      }
    } else {
      this._accelerate(wish, Math.min(wishSpeed, MOVE.airWishCap), MOVE.airAccel, dt);
      this.vel[1] -= MOVE.gravity * dt;
    }
    this.jumpCooldown = Math.max(0, (this.jumpCooldown || 0) - dt);

    const delta = [this.vel[0] * dt, this.vel[1] * dt, this.vel[2] * dt];
    const wasGround = this.onGround;
    const res = map.moveBox(this.pos, delta, PLAYER_RADIUS, height);

    // Ground probe: a little tolerance keeps us glued to steps.
    if (!res.onGround && this.vel[1] <= 0.001) {
      const floor = map.floorAt2(this.pos, PLAYER_RADIUS, this.pos[1] + 0.02);
      if (this.pos[1] - floor < 0.12) {
        this.pos[1] = floor;
        res.onGround = true;
      }
    }
    if (res.onGround) {
      if (!wasGround) {
        this.landSpeed = -this.vel[1];
        this.justLanded = true;
      }
      this.vel[1] = 0;
    }
    this.onGround = res.onGround;
    if (res.hitWall) {
      // Bleed a little speed on wall contact so surfing walls is not free.
      this.vel[0] *= 0.86;
      this.vel[2] *= 0.86;
    }
    if (this.pos[1] < -12) { this.pos[1] = 0; this.vel[1] = 0; }

    this.speed = Math.hypot(this.vel[0], this.vel[2]);
    this.animTime += dt;
  }

  _friction(dt) {
    const speed = Math.hypot(this.vel[0], this.vel[2]);
    if (speed < 0.02) { this.vel[0] = 0; this.vel[2] = 0; return; }
    const control = Math.max(speed, MOVE.stopSpeed);
    const drop = control * MOVE.friction * dt;
    const newSpeed = Math.max(0, speed - drop) / speed;
    this.vel[0] *= newSpeed;
    this.vel[2] *= newSpeed;
  }

  _accelerate(wishDir, wishSpeed, accel, dt) {
    const current = this.vel[0] * wishDir[0] + this.vel[2] * wishDir[2];
    const add = wishSpeed - current;
    if (add <= 0) return;
    let accelSpeed = accel * wishSpeed * dt;
    if (accelSpeed > add) accelSpeed = add;
    this.vel[0] += accelSpeed * wishDir[0];
    this.vel[2] += accelSpeed * wishDir[2];
  }

  /* ----------------------------- combat ----------------------------- */

  /** Local-space hitboxes, scaled for the current stance. */
  hitboxes() {
    const h = this.currentHeight();
    const s = h / PLAYER_HEIGHT;
    const crouchLean = (1 - s) * 0.10;
    return [
      { group: HITGROUP.HEAD, min: [-0.115, h - 0.255, -0.125 - crouchLean], max: [0.115, h - 0.01, 0.115 - crouchLean] },
      { group: HITGROUP.CHEST, min: [-0.215, h * 0.60, -0.15], max: [0.215, h - 0.26, 0.16] },
      { group: HITGROUP.ARM, min: [-0.38, h * 0.60, -0.14], max: [0.38, h * 0.86, 0.15] },
      { group: HITGROUP.STOMACH, min: [-0.20, h * 0.44, -0.14], max: [0.20, h * 0.60, 0.15] },
      { group: HITGROUP.LEG, min: [-0.22, 0.0, -0.14], max: [0.22, h * 0.44, 0.14] },
    ];
  }

  /**
   * Ray vs this character. Ray is in world space; we rotate it into the
   * character's yaw frame so the boxes stay axis-aligned.
   * Returns { t, group, point } or null.
   */
  rayHit(origin, dir, maxDist) {
    if (!this.alive) return null;
    // Quick reject against a bounding sphere.
    const h = this.currentHeight();
    const c = [this.pos[0], this.pos[1] + h * 0.5, this.pos[2]];
    const oc = V.sub(c, origin);
    const proj = V.dot(oc, dir);
    if (proj < -1.2 || proj > maxDist + 1.2) return null;
    const perp2 = V.len2(oc) - proj * proj;
    if (perp2 > 1.4) return null;

    const cy = Math.cos(-this.yaw), sy = Math.sin(-this.yaw);
    const rx = origin[0] - this.pos[0], rz = origin[2] - this.pos[2];
    const lo = [rx * cy - rz * sy, origin[1] - this.pos[1], rx * sy + rz * cy];
    const ld = [dir[0] * cy - dir[2] * sy, dir[1], dir[0] * sy + dir[2] * cy];

    let bestT = maxDist, bestGroup = null;
    for (const box of this.hitboxes()) {
      const t = rayAABB(lo, ld, box.min, box.max, bestT);
      if (t >= 0 && t < bestT) { bestT = t; bestGroup = box.group; }
    }
    if (!bestGroup) return null;
    return { t: bestT, group: bestGroup, point: V.mad(origin, dir, bestT), entity: this };
  }

  takeDamage(amount, armorPen, attacker, group) {
    const res = applyArmor(amount, this.armor, armorPen);
    let hpDamage = res.hp;
    if (group === HITGROUP.HEAD && this.helmet && this.armor > 0) {
      // helmet already factored into computeDamage; armor still absorbs
    }
    this.armor = Math.max(0, this.armor - res.armor);
    const applied = Math.min(this.health, Math.round(hpDamage));
    this.health -= Math.round(hpDamage);
    if (attacker && attacker !== this) {
      this.lastAttacker = attacker;
      this.recentDamagers.set(attacker.id, (this.recentDamagers.get(attacker.id) || 0) + applied);
    }
    return applied;
  }

  resetForRound(spawn, yaw) {
    this.pos = [spawn[0], spawn[1], spawn[2]];
    this.vel = [0, 0, 0];
    this.yaw = yaw;
    this.pitch = 0;
    this.alive = true;
    this.health = 100;
    this.ducking = false;
    this.duckAmount = 0;
    this.onGround = true;
    this.recoil = [0, 0];
    this.punch = [0, 0];
    this.punchVel = [0, 0];
    this.sprayIndex = 0;
    this.shotSpread = 0;
    this.zoomLevel = 0;
    this.reloading = 0;
    this.deploying = 0.5;
    this.flashAmount = 0;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.recentDamagers.clear();
    this.deathTime = 0;
    for (const key of [this.inventory.primary, this.inventory.secondary]) {
      if (!key) continue;
      const w = WEAPONS[key];
      this.ammo[key] = { mag: w.mag, reserve: w.reserve };
    }
    this.slot = this.inventory.primary ? 'primary' : (this.inventory.secondary ? 'secondary' : 'knife');
  }
}

/* --------------------------- character model --------------------------- */

/** Build the per-part meshes once; parts pivot around their joint. */
function buildCharacterParts(renderer, team) {
  const cloth = team === 'T' ? MAT.CLOTH_T : MAT.CLOTH_CT;
  const vestTint = team === 'T' ? [0.85, 0.78, 0.6] : [0.62, 0.68, 0.82];
  const parts = {};
  const mk = (fn) => {
    const b = new MeshBuilder();
    fn(b);
    return renderer.createMesh(b);
  };

  parts.torso = mk(b => {
    b.box([-0.20, 0, -0.13], [0.20, 0.42, 0.13], cloth, { uvScale: 2.2 });
    // plate carrier
    b.box([-0.21, 0.06, -0.155], [0.21, 0.34, 0.155], MAT.GUNPOLY, { uvScale: 3, tint: vestTint });
    b.box([-0.09, 0.30, -0.17], [0.09, 0.40, 0.17], MAT.GUNPOLY, { uvScale: 3, tint: vestTint });
    // shoulders
    b.box([-0.27, 0.30, -0.11], [-0.19, 0.42, 0.11], cloth, { uvScale: 3 });
    b.box([0.19, 0.30, -0.11], [0.27, 0.42, 0.11], cloth, { uvScale: 3 });
  });

  parts.pelvis = mk(b => {
    b.box([-0.17, 0, -0.12], [0.17, 0.22, 0.12], cloth, { uvScale: 2.4 });
    b.box([-0.19, 0.14, -0.13], [0.19, 0.20, 0.13], MAT.GUNPOLY, { uvScale: 4, tint: [0.3, 0.28, 0.26] }); // belt
  });

  parts.head = mk(b => {
    b.box([-0.095, 0, -0.10], [0.095, 0.20, 0.10], MAT.SKIN, { uvScale: 4 });
    b.box([-0.10, 0.11, -0.115], [0.10, 0.21, 0.10], cloth, { uvScale: 5 });      // cap / balaclava
    b.box([-0.07, 0.04, -0.125], [0.07, 0.10, -0.095], MAT.GUNPOLY, { uvScale: 6, tint: [0.15, 0.15, 0.18] }); // goggles
  });

  parts.helmet = mk(b => {
    b.box([-0.115, 0.09, -0.125], [0.115, 0.235, 0.115], MAT.GUNPOLY, { uvScale: 4, tint: vestTint });
  });

  parts.upperArm = mk(b => b.box([-0.055, -0.24, -0.055], [0.055, 0.02, 0.055], cloth, { uvScale: 5 }));
  parts.foreArm = mk(b => {
    b.box([-0.05, -0.22, -0.05], [0.05, 0.01, 0.05], cloth, { uvScale: 5 });
    b.box([-0.055, -0.28, -0.055], [0.055, -0.20, 0.055], MAT.SKIN, { uvScale: 6 });
  });
  parts.thigh = mk(b => b.box([-0.075, -0.44, -0.075], [0.075, 0.02, 0.075], cloth, { uvScale: 4 }));
  parts.shin = mk(b => {
    b.box([-0.065, -0.38, -0.065], [0.065, 0.01, 0.065], cloth, { uvScale: 4 });
    b.box([-0.07, -0.44, -0.11], [0.07, -0.36, 0.07], MAT.GUNPOLY, { uvScale: 5, tint: [0.22, 0.2, 0.19] }); // boot
  });
  return parts;
}

/** Scratch matrices — one per joint so nothing aliases mid-chain. */
const _mm = {
  root: M4.create(), tmp: M4.create(), tmp2: M4.create(),
  hipL: M4.create(), hipR: M4.create(), shinL: M4.create(), shinR: M4.create(),
  pelvis: M4.create(), chest: M4.create(), head: M4.create(),
  armRU: M4.create(), armRL: M4.create(), armLU: M4.create(), armLL: M4.create(),
  hand: M4.create(),
};

/**
 * Draw one character. `pass` is 'shadow' or 'world'.
 * Handles walk cycle, crouch, aim pitch and the death topple.
 */
function drawCharacter(renderer, ent, assets, pass, time) {
  const parts = assets.parts[ent.team];
  const draw = (mesh, mat, tint) => {
    if (pass === 'shadow') renderer.drawShadow(mesh, mat);
    else renderer.drawMesh(mesh, mat, tint);
  };

  const h = ent.currentHeight();
  const scale = h / PLAYER_HEIGHT;
  const crouch = 1 - scale;
  const speed = Math.hypot(ent.vel[0], ent.vel[2]);
  const moving = speed > 0.35;
  const cycleSpeed = clamp(speed / 4.6, 0, 1.4);
  const phase = ent.animTime * (6.2 * Math.max(0.4, cycleSpeed));
  const swing = moving ? Math.sin(phase) * (0.42 * clamp(speed / 4.6, 0.25, 1)) : Math.sin(time * 1.4) * 0.02;
  const bob = moving ? Math.abs(Math.sin(phase)) * 0.035 * cycleSpeed : 0;

  // Death: topple sideways and sink slightly.
  let deathRoll = 0, deathDrop = 0;
  if (!ent.alive) {
    const t = clamp((time - ent.deathTime) / 0.55, 0, 1);
    deathRoll = smoothstep(t) * (Math.PI / 2) * (ent.deathSide || 1);
    deathDrop = smoothstep(t) * 0.02;
  }

  const base = [ent.pos[0], ent.pos[1] - deathDrop, ent.pos[2]];
  const root = M4.compose(base, ent.yaw, 0, deathRoll, 1, _mm.root);

  /** child = root * translate(x,y,z) * rotX(pitch) * rotY(yaw) */
  const joint = (parent, x, y, z, pitch, yaw, out) => {
    M4.compose([x, y, z], yaw || 0, pitch || 0, 0, 1, _mm.tmp);
    return M4.mul(parent, _mm.tmp, out);
  };

  const hipY = (0.86 - crouch * 0.30) + bob;
  const chestY = hipY + 0.20;

  // legs
  const legLift = crouch * 0.55;
  const thighLen = 0.44;
  joint(root, -0.10, hipY, 0, swing * 0.9 - legLift, 0, _mm.hipL);
  joint(root, 0.10, hipY, 0, -swing * 0.9 - legLift, 0, _mm.hipR);
  joint(_mm.hipL, 0, -thighLen, 0, Math.max(0, -swing * 0.5) + legLift * 1.7, 0, _mm.shinL);
  joint(_mm.hipR, 0, -thighLen, 0, Math.max(0, swing * 0.5) + legLift * 1.7, 0, _mm.shinR);
  draw(parts.thigh, _mm.hipL);
  draw(parts.thigh, _mm.hipR);
  draw(parts.shin, _mm.shinL);
  draw(parts.shin, _mm.shinR);

  // torso leans forward while running and while crouched
  const lean = crouch * 0.32 + clamp(speed / 4.6, 0, 1) * 0.12;
  joint(root, 0, hipY, 0, 0, 0, _mm.pelvis);
  draw(parts.pelvis, _mm.pelvis);
  joint(root, 0, chestY, 0, lean, 0, _mm.chest);
  draw(parts.torso, _mm.chest);

  // head follows aim pitch
  joint(_mm.chest, 0, 0.44 - lean * 0.1, 0, -ent.pitch * 0.75 - lean, 0, _mm.head);
  draw(parts.head, _mm.head);
  if (ent.helmet) draw(parts.helmet, _mm.head);

  // arms: the right arm holds the weapon, the left supports it
  const aimPitch = -ent.pitch;
  const armSwing = moving ? -swing * 0.5 : 0;
  joint(_mm.chest, 0.22, 0.36, 0, aimPitch - 1.15 + armSwing * 0.3, 0, _mm.armRU);
  joint(_mm.armRU, 0, -0.24, 0, 0.95, 0, _mm.armRL);
  joint(_mm.chest, -0.22, 0.36, 0, aimPitch - 1.25 + armSwing * 0.3, 0.25, _mm.armLU);
  joint(_mm.armLU, 0, -0.24, 0, 1.15, -0.3, _mm.armLL);
  draw(parts.upperArm, _mm.armRU);
  draw(parts.foreArm, _mm.armRL);
  draw(parts.upperArm, _mm.armLU);
  draw(parts.foreArm, _mm.armLL);

  // weapon in hand
  const key = ent.weaponKey;
  const modelKind = key === 'c4' ? 'c4'
    : (key && WEAPONS[key] ? WEAPONS[key].model : (ent.slot === 'grenade' ? 'grenade' : 'knife'));
  const mesh = assets.worldGuns[modelKind];
  if (mesh && ent.alive) {
    joint(_mm.chest, 0.20, 0.30, -0.26, aimPitch, 0, _mm.hand);
    draw(mesh, _mm.hand, key && WEAPONS[key] ? WEAPONS[key].tint : null);
    ent.muzzleWorld = M4.transformPoint(_mm.hand, MUZZLE_OFFSET[modelKind] || [0, 0, -0.3]);
  }
}
