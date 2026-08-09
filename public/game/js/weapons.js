'use strict';
/* ------------------------------------------------------------------
   weapons.js — the full CS2-style arsenal.

   Gun geometry lives in GUN_PARTS as plain data so the same boxes drive
   three things: the world model, the first-person viewmodel, and the
   silhouette preview drawn in the shop.
   ------------------------------------------------------------------ */

const SLOT = { PRIMARY: 0, SECONDARY: 1, KNIFE: 2, GRENADE: 3, BOMB: 4 };
const HITGROUP = { HEAD: 'head', CHEST: 'chest', STOMACH: 'stomach', ARM: 'arm', LEG: 'leg' };
const HITGROUP_MULT = { head: 4.0, chest: 1.0, stomach: 1.25, arm: 1.0, leg: 0.75 };

/**
 * Recoil pattern shaped like a real spray: climb, pull left, sweep right.
 * Deterministic per weapon so the pattern can be learned.
 */
function makePattern(seed, count, up, side, jitter) {
  const rng = makeRng(seed);
  const pts = [];
  let x = 0, y = 0;
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const targetY = up * (1 - Math.exp(-t * 4.2));
    let targetX;
    if (t < 0.28) targetX = 0;
    else if (t < 0.58) targetX = -side * smoothstep((t - 0.28) / 0.30);
    else targetX = lerp(-side, side * 0.85, smoothstep((t - 0.58) / 0.42));
    y = lerp(y, targetY, 0.62) + (rng() - 0.5) * jitter * 0.5;
    x = lerp(x, targetX, 0.55) + (rng() - 0.5) * jitter;
    pts.push([x, y]);
  }
  return pts;
}

function randomPattern(seed, count, up, spread) {
  const rng = makeRng(seed);
  const pts = [];
  for (let i = 0; i < count; i++) {
    const t = Math.min(1, i / 6);
    pts.push([(rng() - 0.5) * spread * (0.4 + t), up * t + (rng() - 0.5) * spread * 0.4]);
  }
  return pts;
}

/* ------------------------------ arsenal ------------------------------ */
/*
   damage / armorPen / fireRate / mag / price follow CS2 tuning.
   team: 'T' | 'CT' | 'both'.  cat: shop category.
*/
const WEAPONS = {
  /* ------------------------------ knife ------------------------------ */
  knife: {
    name: 'Knife', slot: SLOT.KNIFE, cat: null, team: 'both', price: 0, killReward: 1500,
    damage: 42, backstab: 180, armorPen: 0.85, fireRate: 2.4, mag: 0, reserve: 0,
    reloadTime: 0, speed: 1.0, melee: true, range: 1.6, model: 'knife',
    auto: false, recoil: 0, inaccuracy: [0, 0, 0, 0], rangeMod: 1, sound: 'knife',
  },

  /* ----------------------------- pistols ----------------------------- */
  glock: {
    name: 'Glock-18', slot: SLOT.SECONDARY, cat: 'pistol', team: 'T', price: 200, killReward: 300,
    damage: 30, armorPen: 0.47, fireRate: 400 / 60, mag: 20, reserve: 120, reloadTime: 2.2,
    speed: 0.98, rangeMod: 0.75, penetration: 1, inaccuracy: [0.28, 3.6, 12.0, 0.20],
    recoil: 1.35, model: 'pistol', pattern: randomPattern(11, 20, 2.0, 1.6), auto: false,
    sound: 'pistol', tint: [0.5, 0.5, 0.54], burst: 3,
    desc: 'Cheap, high capacity, low stopping power. Burst fire with right click.',
  },
  usp: {
    name: 'USP-S', slot: SLOT.SECONDARY, cat: 'pistol', team: 'CT', price: 200, killReward: 300,
    damage: 35, armorPen: 0.505, fireRate: 352 / 60, mag: 12, reserve: 24, reloadTime: 2.2,
    speed: 0.98, rangeMod: 0.79, penetration: 1, inaccuracy: [0.22, 3.2, 11.0, 0.16],
    recoil: 1.2, model: 'pistol_s', pattern: randomPattern(12, 12, 1.7, 1.2), auto: false,
    silenced: true, sound: 'pistol_s', tint: [0.4, 0.41, 0.44],
    desc: 'Suppressed and accurate. Rewards a steady trigger finger.',
  },
  p2000: {
    name: 'P2000', slot: SLOT.SECONDARY, cat: 'pistol', team: 'CT', price: 200, killReward: 300,
    damage: 35, armorPen: 0.505, fireRate: 353 / 60, mag: 13, reserve: 52, reloadTime: 2.2,
    speed: 0.98, rangeMod: 0.79, penetration: 1, inaccuracy: [0.24, 3.3, 11.2, 0.17],
    recoil: 1.25, model: 'pistol', pattern: randomPattern(15, 13, 1.8, 1.3), auto: false,
    sound: 'pistol', tint: [0.44, 0.44, 0.47],
    desc: 'Reliable sidearm with a deep reserve of ammunition.',
  },
  dualies: {
    name: 'Dual Berettas', slot: SLOT.SECONDARY, cat: 'pistol', team: 'both', price: 300, killReward: 300,
    damage: 38, armorPen: 0.475, fireRate: 500 / 60, mag: 30, reserve: 120, reloadTime: 3.8,
    speed: 1.0, rangeMod: 0.72, penetration: 1, inaccuracy: [1.4, 5.0, 16.0, 1.2],
    recoil: 1.5, model: 'dual', pattern: randomPattern(16, 30, 2.6, 2.6), auto: false,
    sound: 'pistol', tint: [0.62, 0.62, 0.66], akimbo: true,
    desc: 'Two barrels, thirty rounds, very little discipline.',
  },
  p250: {
    name: 'P250', slot: SLOT.SECONDARY, cat: 'pistol', team: 'both', price: 300, killReward: 300,
    damage: 38, armorPen: 0.645, fireRate: 400 / 60, mag: 13, reserve: 26, reloadTime: 2.2,
    speed: 0.98, rangeMod: 0.72, penetration: 1, inaccuracy: [0.26, 3.4, 11.5, 0.19],
    recoil: 1.4, model: 'pistol', pattern: randomPattern(13, 13, 2.1, 1.5), auto: false,
    sound: 'pistol', tint: [0.48, 0.48, 0.51],
    desc: 'The eco-round answer to armour. Punishes helmets at close range.',
  },
  fiveseven: {
    name: 'Five-SeveN', slot: SLOT.SECONDARY, cat: 'pistol', team: 'CT', price: 500, killReward: 300,
    damage: 32, armorPen: 0.685, fireRate: 400 / 60, mag: 20, reserve: 100, reloadTime: 2.7,
    speed: 0.98, rangeMod: 0.885, penetration: 1, inaccuracy: [0.25, 3.2, 11.0, 0.18],
    recoil: 1.3, model: 'pistol', pattern: randomPattern(17, 20, 2.0, 1.4), auto: false,
    sound: 'pistol', tint: [0.55, 0.53, 0.5],
    desc: 'Armour-piercing rounds and a forgiving magazine.',
  },
  tec9: {
    name: 'Tec-9', slot: SLOT.SECONDARY, cat: 'pistol', team: 'T', price: 500, killReward: 300,
    damage: 33, armorPen: 0.905, fireRate: 500 / 60, mag: 18, reserve: 90, reloadTime: 2.0,
    speed: 1.0, rangeMod: 0.81, penetration: 1, inaccuracy: [0.9, 5.5, 18.0, 0.8],
    recoil: 1.6, model: 'tec9', pattern: randomPattern(18, 18, 2.8, 2.4), auto: false,
    sound: 'pistol', tint: [0.36, 0.36, 0.38],
    desc: 'Run-and-gun pistol that chews through armour up close.',
  },
  cz75: {
    name: 'CZ75-Auto', slot: SLOT.SECONDARY, cat: 'pistol', team: 'both', price: 500, killReward: 100,
    damage: 33, armorPen: 0.79, fireRate: 600 / 60, mag: 12, reserve: 12, reloadTime: 2.7,
    speed: 0.98, rangeMod: 0.75, penetration: 1, inaccuracy: [0.4, 4.4, 14.0, 0.3],
    recoil: 1.9, model: 'pistol', pattern: makePattern(19, 12, 4.5, 1.8, 0.5), auto: true,
    sound: 'pistol', tint: [0.42, 0.42, 0.45],
    desc: 'Fully automatic machine pistol. Twelve rounds, no spares.',
  },
  deagle: {
    name: 'Desert Eagle', slot: SLOT.SECONDARY, cat: 'pistol', team: 'both', price: 700, killReward: 300,
    damage: 63, armorPen: 0.93, fireRate: 267 / 60, mag: 7, reserve: 35, reloadTime: 2.3,
    speed: 0.96, rangeMod: 0.81, penetration: 2, inaccuracy: [0.30, 6.5, 22.0, 0.22],
    recoil: 3.4, model: 'deagle', pattern: randomPattern(14, 7, 4.0, 2.4), auto: false,
    sound: 'deagle', tint: [0.72, 0.68, 0.55],
    desc: 'One tap to the head from any range, if you can hold it still.',
  },
  revolver: {
    name: 'R8 Revolver', slot: SLOT.SECONDARY, cat: 'pistol', team: 'both', price: 600, killReward: 300,
    damage: 86, armorPen: 0.93, fireRate: 158 / 60, mag: 8, reserve: 8, reloadTime: 2.5,
    speed: 0.96, rangeMod: 0.87, penetration: 3, inaccuracy: [0.25, 8.0, 26.0, 0.2],
    recoil: 4.2, model: 'revolver', pattern: randomPattern(20, 8, 5.0, 2.0), auto: false,
    sound: 'deagle', tint: [0.38, 0.38, 0.4], drawDelay: 0.25,
    desc: 'Hits like a rifle. The hammer takes a moment to fall.',
  },

  /* ------------------------------ SMGs ------------------------------- */
  mac10: {
    name: 'MAC-10', slot: SLOT.PRIMARY, cat: 'smg', team: 'T', price: 1050, killReward: 600,
    damage: 29, armorPen: 0.575, fireRate: 800 / 60, mag: 30, reserve: 100, reloadTime: 2.7,
    speed: 1.0, rangeMod: 0.65, penetration: 1, inaccuracy: [0.75, 4.2, 17.0, 0.6],
    recoil: 1.3, model: 'mac10', pattern: makePattern(25, 30, 6.0, 2.6, 0.7), auto: true,
    sound: 'smg', tint: [0.3, 0.3, 0.32],
    desc: 'Cheap, fast and mobile. Made for rushing sites on a bad economy.',
  },
  mp9: {
    name: 'MP9', slot: SLOT.PRIMARY, cat: 'smg', team: 'CT', price: 1250, killReward: 600,
    damage: 26, armorPen: 0.60, fireRate: 857 / 60, mag: 30, reserve: 120, reloadTime: 2.1,
    speed: 1.0, rangeMod: 0.68, penetration: 1, inaccuracy: [0.55, 3.9, 16.0, 0.42],
    recoil: 1.15, model: 'smg', pattern: makePattern(21, 30, 5.2, 2.0, 0.55), auto: true,
    sound: 'smg', tint: [0.35, 0.36, 0.38],
    desc: 'The fastest rate of fire on the CT side. Excellent while moving.',
  },
  mp7: {
    name: 'MP7', slot: SLOT.PRIMARY, cat: 'smg', team: 'both', price: 1500, killReward: 600,
    damage: 29, armorPen: 0.625, fireRate: 750 / 60, mag: 30, reserve: 120, reloadTime: 3.1,
    speed: 0.99, rangeMod: 0.72, penetration: 1, inaccuracy: [0.52, 3.8, 15.5, 0.4],
    recoil: 1.2, model: 'smg', pattern: makePattern(26, 30, 5.0, 1.9, 0.5), auto: true,
    sound: 'smg', tint: [0.32, 0.33, 0.35],
    desc: 'Balanced submachine gun with usable damage past close range.',
  },
  mp5: {
    name: 'MP5-SD', slot: SLOT.PRIMARY, cat: 'smg', team: 'both', price: 1500, killReward: 600,
    damage: 27, armorPen: 0.585, fireRate: 750 / 60, mag: 30, reserve: 120, reloadTime: 2.7,
    speed: 0.99, rangeMod: 0.72, penetration: 1, inaccuracy: [0.48, 3.4, 15.0, 0.36],
    recoil: 1.05, model: 'mp5', pattern: makePattern(22, 30, 4.6, 1.7, 0.45), auto: true,
    silenced: true, sound: 'smg_s', tint: [0.3, 0.31, 0.33],
    desc: 'Suppressed: quiet shots and no tracer to give your angle away.',
  },
  ump: {
    name: 'UMP-45', slot: SLOT.PRIMARY, cat: 'smg', team: 'both', price: 1200, killReward: 600,
    damage: 35, armorPen: 0.65, fireRate: 666 / 60, mag: 25, reserve: 100, reloadTime: 2.6,
    speed: 0.98, rangeMod: 0.61, penetration: 1, inaccuracy: [0.60, 4.4, 17.0, 0.45],
    recoil: 1.5, model: 'ump', pattern: makePattern(23, 25, 5.8, 2.4, 0.6), auto: true,
    sound: 'smg', tint: [0.33, 0.32, 0.3],
    desc: 'Heavy hitting SMG. Two body shots and a bit at close range.',
  },
  p90: {
    name: 'P90', slot: SLOT.PRIMARY, cat: 'smg', team: 'both', price: 2350, killReward: 300,
    damage: 26, armorPen: 0.69, fireRate: 857 / 60, mag: 50, reserve: 100, reloadTime: 3.4,
    speed: 0.99, rangeMod: 0.84, penetration: 1, inaccuracy: [0.62, 4.0, 16.5, 0.5],
    recoil: 1.25, model: 'p90', pattern: makePattern(27, 50, 6.4, 2.8, 0.6), auto: true,
    sound: 'smg', tint: [0.28, 0.29, 0.3],
    desc: 'Fifty rounds of armour-piercing spray. Forgiving to hold down.',
  },
  bizon: {
    name: 'PP-Bizon', slot: SLOT.PRIMARY, cat: 'smg', team: 'both', price: 1400, killReward: 600,
    damage: 27, armorPen: 0.60, fireRate: 750 / 60, mag: 64, reserve: 120, reloadTime: 2.4,
    speed: 0.99, rangeMod: 0.68, penetration: 1, inaccuracy: [0.58, 4.1, 16.0, 0.46],
    recoil: 1.1, model: 'bizon', pattern: makePattern(28, 64, 5.4, 2.2, 0.5), auto: true,
    sound: 'smg', tint: [0.31, 0.31, 0.33],
    desc: 'Sixty-four round helical magazine and a very flat spray.',
  },

  /* ----------------------------- heavy ------------------------------- */
  nova: {
    name: 'Nova', slot: SLOT.PRIMARY, cat: 'heavy', team: 'both', price: 1050, killReward: 900,
    damage: 26, pellets: 9, armorPen: 0.50, fireRate: 68 / 60, mag: 8, reserve: 32,
    reloadTime: 0.55, shellReload: true, speed: 0.97, rangeMod: 0.7, penetration: 0,
    inaccuracy: [3.2, 6.0, 20.0, 2.8], recoil: 5.5, model: 'shotgun',
    pattern: randomPattern(24, 8, 5.0, 2.0), auto: false, sound: 'shotgun', tint: [0.4, 0.34, 0.28],
    desc: 'Pump shotgun. Devastating inside ten metres, useless beyond it.',
  },
  xm1014: {
    name: 'XM1014', slot: SLOT.PRIMARY, cat: 'heavy', team: 'both', price: 2000, killReward: 900,
    damage: 20, pellets: 8, armorPen: 0.80, fireRate: 171 / 60, mag: 7, reserve: 32,
    reloadTime: 0.5, shellReload: true, speed: 0.98, rangeMod: 0.7, penetration: 0,
    inaccuracy: [3.6, 7.0, 22.0, 3.2], recoil: 4.5, model: 'autoshotgun',
    pattern: randomPattern(29, 7, 5.5, 2.4), auto: true, sound: 'shotgun', tint: [0.32, 0.3, 0.3],
    desc: 'Automatic shotgun. Hold the trigger and walk through a doorway.',
  },
  sawedoff: {
    name: 'Sawed-Off', slot: SLOT.PRIMARY, cat: 'heavy', team: 'T', price: 1100, killReward: 900,
    damage: 32, pellets: 8, armorPen: 0.55, fireRate: 68 / 60, mag: 7, reserve: 32,
    reloadTime: 0.55, shellReload: true, speed: 0.97, rangeMod: 0.55, penetration: 0,
    inaccuracy: [5.0, 8.5, 24.0, 4.4], recoil: 6.0, model: 'sawedoff',
    pattern: randomPattern(30, 7, 5.5, 2.6), auto: false, sound: 'shotgun', tint: [0.42, 0.3, 0.22],
    desc: 'Wide spread, brutal damage, effectively point blank only.',
  },
  mag7: {
    name: 'MAG-7', slot: SLOT.PRIMARY, cat: 'heavy', team: 'CT', price: 1300, killReward: 900,
    damage: 30, pellets: 8, armorPen: 0.60, fireRate: 96 / 60, mag: 5, reserve: 32,
    reloadTime: 2.7, speed: 0.97, rangeMod: 0.6, penetration: 0,
    inaccuracy: [3.4, 6.5, 21.0, 3.0], recoil: 5.0, model: 'mag7',
    pattern: randomPattern(33, 5, 5.2, 2.2), auto: false, sound: 'shotgun', tint: [0.3, 0.31, 0.33],
    desc: 'Compact magazine-fed shotgun with a tight, hard-hitting spread.',
  },
  negev: {
    name: 'Negev', slot: SLOT.PRIMARY, cat: 'heavy', team: 'both', price: 1700, killReward: 300,
    damage: 35, armorPen: 0.75, fireRate: 800 / 60, mag: 150, reserve: 150, reloadTime: 5.7,
    speed: 0.86, rangeMod: 0.81, penetration: 2, inaccuracy: [4.5, 12.0, 30.0, 4.0],
    recoil: 2.6, model: 'lmg', pattern: makePattern(34, 150, 11.0, 5.0, 1.4), auto: true,
    sound: 'rifle_heavy', tint: [0.3, 0.32, 0.28], spinUp: 0.9,
    desc: 'Wildly inaccurate until it settles, then it does not stop.',
  },
  m249: {
    name: 'M249', slot: SLOT.PRIMARY, cat: 'heavy', team: 'both', price: 5200, killReward: 300,
    damage: 32, armorPen: 0.80, fireRate: 750 / 60, mag: 100, reserve: 200, reloadTime: 5.7,
    speed: 0.84, rangeMod: 0.97, penetration: 3, inaccuracy: [1.2, 10.0, 28.0, 0.9],
    recoil: 2.4, model: 'lmg', pattern: makePattern(35, 100, 10.0, 4.4, 1.1), auto: true,
    sound: 'rifle_heavy', tint: [0.28, 0.3, 0.28],
    desc: 'A hundred rounds of belt-fed suppression. Heavy and slow.',
  },

  /* ----------------------------- rifles ------------------------------ */
  galil: {
    name: 'Galil AR', slot: SLOT.PRIMARY, cat: 'rifle', team: 'T', price: 1800, killReward: 300,
    damage: 30, armorPen: 0.775, fireRate: 666 / 60, mag: 35, reserve: 90, reloadTime: 3.0,
    speed: 0.96, rangeMod: 0.98, penetration: 2, inaccuracy: [0.40, 8.5, 26.0, 0.30],
    recoil: 1.9, model: 'galil', pattern: makePattern(31, 35, 8.5, 3.4, 0.7), auto: true,
    sound: 'rifle', tint: [0.42, 0.4, 0.36],
    desc: 'Budget rifle. Thirty-five rounds and a manageable first burst.',
  },
  famas: {
    name: 'FAMAS', slot: SLOT.PRIMARY, cat: 'rifle', team: 'CT', price: 2050, killReward: 300,
    damage: 30, armorPen: 0.70, fireRate: 666 / 60, mag: 25, reserve: 90, reloadTime: 3.3,
    speed: 0.96, rangeMod: 0.97, penetration: 2, inaccuracy: [0.38, 8.0, 25.0, 0.28],
    recoil: 1.8, model: 'famas', pattern: makePattern(32, 25, 8.0, 3.0, 0.65), auto: true,
    sound: 'rifle', tint: [0.3, 0.3, 0.32], burst: 3,
    desc: 'Force-buy rifle with a three-round burst on right click.',
  },
  ak47: {
    name: 'AK-47', slot: SLOT.PRIMARY, cat: 'rifle', team: 'T', price: 2700, killReward: 300,
    damage: 36, armorPen: 0.775, fireRate: 600 / 60, mag: 30, reserve: 90, reloadTime: 2.5,
    speed: 0.94, rangeMod: 0.98, penetration: 2, inaccuracy: [0.36, 9.5, 28.0, 0.27],
    recoil: 2.35, model: 'ak', pattern: makePattern(41, 30, 10.5, 4.2, 0.75), auto: true,
    sound: 'rifle_heavy', tint: [1, 1, 1],
    desc: 'One shot to the head through a helmet at any range. The standard.',
  },
  m4a4: {
    name: 'M4A4', slot: SLOT.PRIMARY, cat: 'rifle', team: 'CT', price: 3100, killReward: 300,
    damage: 33, armorPen: 0.70, fireRate: 666 / 60, mag: 30, reserve: 90, reloadTime: 3.1,
    speed: 0.95, rangeMod: 0.97, penetration: 2, inaccuracy: [0.33, 8.8, 26.0, 0.25],
    recoil: 1.95, model: 'rifle', pattern: makePattern(42, 30, 8.8, 3.2, 0.6), auto: true,
    sound: 'rifle', tint: [0.28, 0.29, 0.3],
    desc: 'Thirty rounds and a controllable pattern. The CT workhorse.',
  },
  m4a1s: {
    name: 'M4A1-S', slot: SLOT.PRIMARY, cat: 'rifle', team: 'CT', price: 2900, killReward: 300,
    damage: 38, armorPen: 0.70, fireRate: 600 / 60, mag: 20, reserve: 60, reloadTime: 3.1,
    speed: 0.95, rangeMod: 0.99, penetration: 2, inaccuracy: [0.30, 8.4, 25.0, 0.22],
    recoil: 1.7, model: 'm4a1s', pattern: makePattern(43, 20, 7.2, 2.6, 0.5), auto: true,
    silenced: true, sound: 'rifle_s', tint: [0.26, 0.27, 0.28],
    desc: 'Suppressed, precise, and short on ammunition. Make them count.',
  },
  sg553: {
    name: 'SG 553', slot: SLOT.PRIMARY, cat: 'rifle', team: 'T', price: 3000, killReward: 300,
    damage: 30, armorPen: 1.0, fireRate: 545 / 60, mag: 30, reserve: 90, reloadTime: 3.0,
    speed: 0.93, rangeMod: 0.98, penetration: 3, inaccuracy: [0.42, 9.8, 28.0, 0.32],
    recoil: 2.1, model: 'scopedrifle', pattern: makePattern(44, 30, 9.2, 3.6, 0.7), auto: true,
    sound: 'rifle', tint: [0.3, 0.32, 0.3], zoom: [55], scopedAccuracy: true,
    desc: 'Scoped rifle that ignores armour entirely. Slow but lethal.',
  },
  aug: {
    name: 'AUG', slot: SLOT.PRIMARY, cat: 'rifle', team: 'CT', price: 3300, killReward: 300,
    damage: 28, armorPen: 0.90, fireRate: 666 / 60, mag: 30, reserve: 90, reloadTime: 3.8,
    speed: 0.94, rangeMod: 0.98, penetration: 3, inaccuracy: [0.36, 9.0, 26.0, 0.28],
    recoil: 1.85, model: 'scopedrifle', pattern: makePattern(45, 30, 8.4, 3.0, 0.6), auto: true,
    sound: 'rifle', tint: [0.34, 0.33, 0.3], zoom: [55], scopedAccuracy: true,
    desc: 'Scoped and accurate while zoomed. Holds long angles comfortably.',
  },
  ssg08: {
    name: 'SSG 08', slot: SLOT.PRIMARY, cat: 'rifle', team: 'both', price: 1700, killReward: 300,
    damage: 88, armorPen: 0.85, fireRate: 48 / 60, mag: 10, reserve: 90, reloadTime: 3.7,
    speed: 0.99, rangeMod: 0.98, penetration: 3, inaccuracy: [0.20, 30.0, 45.0, 0.10],
    recoil: 4.0, model: 'sniper', pattern: randomPattern(51, 10, 5.0, 1.5), auto: false,
    sound: 'sniper', zoom: [40, 15], boltTime: 0.55, tint: [0.32, 0.33, 0.3],
    desc: 'The scout. Fast, cheap, mobile — one shot to the head or chest.',
  },
  awp: {
    name: 'AWP', slot: SLOT.PRIMARY, cat: 'rifle', team: 'both', price: 4750, killReward: 100,
    damage: 115, armorPen: 0.975, fireRate: 41 / 60, mag: 10, reserve: 30, reloadTime: 3.7,
    speed: 0.86, rangeMod: 0.99, penetration: 3, inaccuracy: [0.20, 35.0, 55.0, 0.10],
    recoil: 5.5, model: 'awp', pattern: randomPattern(52, 10, 6.0, 1.8), auto: false,
    sound: 'awp', zoom: [40, 10], boltTime: 1.25, tint: [0.22, 0.28, 0.24],
    desc: 'One shot, one kill anywhere but the legs. Slow to move, slow to re-aim.',
  },
  g3sg1: {
    name: 'G3SG1', slot: SLOT.PRIMARY, cat: 'rifle', team: 'T', price: 5000, killReward: 300,
    damage: 80, armorPen: 0.825, fireRate: 240 / 60, mag: 20, reserve: 90, reloadTime: 4.7,
    speed: 0.86, rangeMod: 0.98, penetration: 3, inaccuracy: [0.30, 25.0, 40.0, 0.18],
    recoil: 3.2, model: 'autosniper', pattern: randomPattern(53, 20, 8.0, 2.6), auto: true,
    sound: 'sniper', zoom: [40, 15], tint: [0.3, 0.3, 0.28],
    desc: 'Automatic sniper rifle. Expensive, but forgiving of a missed shot.',
  },
  scar20: {
    name: 'SCAR-20', slot: SLOT.PRIMARY, cat: 'rifle', team: 'CT', price: 5000, killReward: 300,
    damage: 80, armorPen: 0.825, fireRate: 240 / 60, mag: 20, reserve: 90, reloadTime: 4.7,
    speed: 0.86, rangeMod: 0.98, penetration: 3, inaccuracy: [0.30, 25.0, 40.0, 0.18],
    recoil: 3.2, model: 'autosniper', pattern: randomPattern(54, 20, 8.0, 2.6), auto: true,
    sound: 'sniper', zoom: [40, 15], tint: [0.28, 0.3, 0.3],
    desc: 'The CT automatic sniper. Holds a lane on its own.',
  },
  zeus: {
    name: 'Zeus x27', slot: SLOT.SECONDARY, cat: 'gear', team: 'both', price: 200, killReward: 0,
    damage: 500, armorPen: 1.0, fireRate: 0.7, mag: 1, reserve: 0, reloadTime: 0,
    speed: 0.98, rangeMod: 1.0, penetration: 0, inaccuracy: [0, 0, 0, 0], range: 3.2,
    recoil: 0, model: 'zeus', pattern: [[0, 0]], auto: false, sound: 'zeus', tint: [0.5, 0.6, 0.8],
    taser: true, desc: 'One charge, three metres, guaranteed kill. Then it is gone.',
  },
};

/** Grenades. */
const GRENADES = {
  he: {
    key: 'he', name: 'HE Grenade', price: 300, killReward: 300, radius: 6.2, maxDamage: 98,
    fuse: 1.6, tint: [0.35, 0.42, 0.32], desc: 'Up to 98 damage at the centre of the blast.',
  },
  flash: {
    key: 'flash', name: 'Flashbang', price: 200, killReward: 300, radius: 9.0, fuse: 1.5,
    tint: [0.55, 0.55, 0.6], max: 2, desc: 'Blinds anyone looking at it. Carry two.',
  },
  smoke: {
    key: 'smoke', name: 'Smoke Grenade', price: 300, killReward: 300, radius: 4.6, fuse: 1.6,
    duration: 15, tint: [0.72, 0.72, 0.72], desc: 'Blocks sight for 15 seconds.',
  },
  molotov: {
    key: 'molotov', name: 'Molotov', price: 400, killReward: 300, radius: 3.6, fuse: 0.9,
    duration: 7, dps: 22, team: 'T', tint: [0.7, 0.4, 0.2], desc: 'Denies ground with fire for seven seconds.',
  },
  incendiary: {
    key: 'incendiary', name: 'Incendiary Grenade', price: 600, killReward: 300, radius: 3.6, fuse: 0.9,
    duration: 7, dps: 22, team: 'CT', tint: [0.75, 0.45, 0.2], desc: 'The CT firebomb. Flushes players out of cover.',
  },
  decoy: {
    key: 'decoy', name: 'Decoy Grenade', price: 50, killReward: 300, radius: 1, fuse: 1.4,
    duration: 12, tint: [0.5, 0.6, 0.5], desc: 'Fakes gunfire on the radar and in the world.',
  },
};

const EQUIPMENT = {
  kevlar: { key: 'kevlar', name: 'Kevlar Vest', price: 650, desc: 'Reduces incoming body damage.' },
  kevlarhelm: { key: 'kevlarhelm', name: 'Kevlar + Helmet', price: 1000, desc: 'Body armour plus protection from weaker headshots.' },
  defuser: { key: 'defuser', name: 'Defuse Kit', price: 400, team: 'CT', desc: 'Cuts bomb defusal from 10 seconds to 5.' },
};

/** Shop layout — categories in the order CS2 shows them. */
const SHOP_CATEGORIES = [
  { key: 'pistol', name: 'Pistols' },
  { key: 'smg', name: 'Mid-Tier' },
  { key: 'heavy', name: 'Heavy' },
  { key: 'rifle', name: 'Rifles' },
  { key: 'gear', name: 'Equipment' },
  { key: 'grenade', name: 'Grenades' },
];

/** All buyable entries for a team, grouped by category. */
function shopItemsFor(team, category) {
  const out = [];
  if (category === 'grenade') {
    for (const g of Object.values(GRENADES)) {
      if (g.team && g.team !== team) continue;
      out.push({ kind: 'grenade', key: g.key, name: g.name, price: g.price, desc: g.desc, model: 'grenade' });
    }
    return out;
  }
  if (category === 'gear') {
    for (const e of Object.values(EQUIPMENT)) {
      if (e.team && e.team !== team) continue;
      out.push({ kind: 'gear', key: e.key, name: e.name, price: e.price, desc: e.desc, model: e.key === 'defuser' ? 'defuser' : 'armor' });
    }
    out.push({
      kind: 'weapon', key: 'zeus', name: WEAPONS.zeus.name, price: WEAPONS.zeus.price,
      desc: WEAPONS.zeus.desc, model: WEAPONS.zeus.model, weapon: WEAPONS.zeus,
    });
    return out;
  }
  for (const [key, w] of Object.entries(WEAPONS)) {
    if (w.cat !== category) continue;
    if (w.team !== 'both' && w.team !== team) continue;
    out.push({ kind: 'weapon', key, name: w.name, price: w.price, desc: w.desc, model: w.model, weapon: w });
  }
  out.sort((a, b) => a.price - b.price);
  return out;
}

/* ----------------------------- damage ----------------------------- */

/** CS-style armour mitigation. Returns damage dealt to each pool. */
function applyArmor(damage, armor, armorPen) {
  if (armor <= 0) return { hp: damage, armor: 0 };
  let hpDamage = damage * armorPen;
  let armorDamage = (damage - hpDamage) * 0.5;
  if (armorDamage > armor) {
    hpDamage = damage - armor * 2;
    armorDamage = armor;
  }
  return { hp: Math.max(0, hpDamage), armor: armorDamage };
}

/** Damage after range falloff and hitgroup multiplier. */
function computeDamage(weapon, distance, hitgroup, hasHelmet) {
  let dmg = weapon.damage;
  dmg *= Math.pow(weapon.rangeMod, distance / 9.5);
  if (hitgroup === HITGROUP.HEAD) {
    dmg *= HITGROUP_MULT.head;
    if (hasHelmet) dmg *= 0.55;
  } else {
    dmg *= HITGROUP_MULT[hitgroup] || 1;
  }
  return dmg;
}

/** Current cone of inaccuracy (radians) for the given movement state. */
function weaponInaccuracy(weapon, state) {
  const [stand, move, air, crouch] = weapon.inaccuracy;
  let base = state.crouching ? crouch : stand;
  const speedFrac = clamp(state.speed / 4.4, 0, 1);
  base = lerp(base, move, speedFrac * speedFrac);
  if (!state.onGround) base = Math.max(base, air * 0.85);
  if (state.zoomed) base *= weapon.scopedAccuracy ? 0.25 : 0.06;
  return (base + state.shotSpread) * DEG;
}

/* ---------------------------- gun geometry ---------------------------- */
/*
   Boxes in gun space: +X right, +Y up, -Z forward (toward the muzzle).
   Each entry: [x0,y0,z0, x1,y1,z1, materialKey, tintKey]
   tintKey picks a palette slot so a single model can be recoloured.
*/
const TK = { METAL: 'metal', POLY: 'poly', WOOD: 'wood', DARK: 'dark', BRIGHT: 'bright' };

const GUN_PARTS = {
  knife: [
    [-0.010, -0.012, -0.30, 0.010, 0.030, -0.05, 'GUNMETAL', TK.BRIGHT],
    [-0.014, -0.020, -0.06, 0.014, 0.026, 0.02, 'GUNMETAL', TK.METAL],
    [-0.016, -0.030, 0.00, 0.016, 0.020, 0.11, 'GUNPOLY', TK.POLY],
  ],
  pistol: [
    [-0.021, -0.010, -0.20, 0.021, 0.045, 0.05, 'GUNMETAL', TK.METAL],
    [-0.018, -0.030, -0.14, 0.018, -0.008, 0.02, 'GUNMETAL', TK.METAL],
    [-0.017, -0.150, -0.02, 0.017, -0.025, 0.06, 'GUNPOLY', TK.POLY],
    [-0.010, -0.052, -0.05, 0.010, -0.030, -0.02, 'GUNMETAL', TK.METAL],
    [-0.006, 0.045, -0.19, 0.006, 0.052, -0.17, 'GUNMETAL', TK.METAL],
  ],
  pistol_s: [
    [-0.021, -0.010, -0.20, 0.021, 0.045, 0.05, 'GUNMETAL', TK.METAL],
    [-0.018, -0.030, -0.14, 0.018, -0.008, 0.02, 'GUNMETAL', TK.METAL],
    [-0.017, -0.150, -0.02, 0.017, -0.025, 0.06, 'GUNPOLY', TK.POLY],
    [-0.024, 0.000, -0.34, 0.024, 0.040, -0.19, 'GUNMETAL', TK.DARK],   // suppressor
    [-0.006, 0.045, -0.18, 0.006, 0.052, -0.16, 'GUNMETAL', TK.METAL],
  ],
  tec9: [
    [-0.020, -0.006, -0.30, 0.020, 0.050, 0.06, 'GUNMETAL', TK.METAL],
    [-0.014, 0.004, -0.36, 0.014, 0.030, -0.28, 'GUNMETAL', TK.DARK],
    [-0.017, -0.150, -0.02, 0.017, -0.004, 0.06, 'GUNPOLY', TK.POLY],
    [-0.016, -0.230, -0.12, 0.016, -0.030, -0.02, 'GUNPOLY', TK.DARK], // long mag
  ],
  dual: [
    [-0.085, -0.010, -0.19, -0.043, 0.042, 0.05, 'GUNMETAL', TK.METAL],
    [-0.081, -0.140, -0.02, -0.047, -0.026, 0.06, 'GUNPOLY', TK.POLY],
    [0.043, -0.010, -0.19, 0.085, 0.042, 0.05, 'GUNMETAL', TK.METAL],
    [0.047, -0.140, -0.02, 0.081, -0.026, 0.06, 'GUNPOLY', TK.POLY],
  ],
  deagle: [
    [-0.024, -0.008, -0.26, 0.024, 0.055, 0.06, 'GUNMETAL', TK.METAL],
    [-0.020, -0.034, -0.18, 0.020, -0.006, 0.03, 'GUNMETAL', TK.METAL],
    [-0.019, -0.165, -0.01, 0.019, -0.028, 0.08, 'GUNPOLY', TK.POLY],
    [-0.010, 0.055, -0.24, 0.010, 0.062, -0.05, 'GUNMETAL', TK.METAL],
  ],
  revolver: [
    [-0.018, 0.010, -0.30, 0.018, 0.050, 0.02, 'GUNMETAL', TK.DARK],   // barrel
    [-0.030, -0.014, -0.09, 0.030, 0.044, 0.02, 'GUNMETAL', TK.METAL], // cylinder
    [-0.016, -0.170, 0.00, 0.016, -0.010, 0.10, 'WOOD', TK.WOOD],      // grip
    [-0.008, -0.050, -0.05, 0.008, -0.014, 0.00, 'GUNMETAL', TK.METAL],
  ],
  smg: [
    [-0.026, -0.020, -0.30, 0.026, 0.048, 0.10, 'GUNPOLY', TK.POLY],
    [-0.011, 0.000, -0.44, 0.011, 0.022, -0.28, 'GUNMETAL', TK.METAL],
    [-0.018, -0.190, -0.10, 0.018, -0.018, -0.02, 'GUNPOLY', TK.POLY],
    [-0.020, -0.130, 0.02, 0.020, -0.018, 0.10, 'GUNPOLY', TK.POLY],
    [-0.014, 0.005, 0.10, 0.014, 0.040, 0.30, 'GUNPOLY', TK.DARK],
    [-0.008, 0.048, -0.30, 0.008, 0.062, 0.02, 'GUNMETAL', TK.METAL],
  ],
  mp5: [
    [-0.026, -0.020, -0.32, 0.026, 0.048, 0.10, 'GUNPOLY', TK.POLY],
    [-0.024, -0.004, -0.52, 0.024, 0.034, -0.30, 'GUNMETAL', TK.DARK],  // fat suppressor
    [-0.018, -0.200, -0.10, 0.018, -0.018, 0.00, 'GUNPOLY', TK.POLY],
    [-0.020, -0.130, 0.02, 0.020, -0.018, 0.10, 'GUNPOLY', TK.POLY],
    [-0.014, 0.000, 0.10, 0.014, 0.040, 0.32, 'GUNPOLY', TK.DARK],
    [-0.009, 0.048, -0.28, 0.009, 0.070, -0.22, 'GUNMETAL', TK.METAL],
  ],
  mac10: [
    [-0.024, -0.014, -0.24, 0.024, 0.052, 0.12, 'GUNMETAL', TK.DARK],
    [-0.011, 0.004, -0.34, 0.011, 0.026, -0.22, 'GUNMETAL', TK.METAL],
    [-0.017, -0.220, -0.08, 0.017, -0.012, 0.00, 'GUNPOLY', TK.POLY],
    [-0.016, 0.010, 0.12, 0.016, 0.030, 0.30, 'GUNMETAL', TK.METAL],   // wire stock
  ],
  ump: [
    [-0.027, -0.018, -0.28, 0.027, 0.046, 0.12, 'GUNPOLY', TK.POLY],
    [-0.012, 0.000, -0.42, 0.012, 0.024, -0.26, 'GUNMETAL', TK.METAL],
    [-0.019, -0.190, -0.10, 0.019, -0.016, -0.01, 'GUNPOLY', TK.POLY],
    [-0.020, -0.130, 0.03, 0.020, -0.016, 0.11, 'GUNPOLY', TK.POLY],
    [-0.015, -0.006, 0.12, 0.015, 0.042, 0.30, 'GUNPOLY', TK.DARK],
  ],
  p90: [
    [-0.030, -0.022, -0.34, 0.030, 0.030, 0.14, 'GUNPOLY', TK.POLY],   // bullpup shell
    [-0.032, 0.030, -0.26, 0.032, 0.060, 0.02, 'GUNPOLY', TK.DARK],    // top magazine
    [-0.010, -0.006, -0.44, 0.010, 0.014, -0.32, 'GUNMETAL', TK.METAL],
    [-0.020, -0.130, -0.16, 0.020, -0.020, -0.06, 'GUNPOLY', TK.POLY], // front grip
    [-0.020, -0.120, 0.00, 0.020, -0.020, 0.08, 'GUNPOLY', TK.POLY],
    [-0.012, 0.060, -0.16, 0.012, 0.076, -0.04, 'GUNMETAL', TK.METAL], // sight
  ],
  bizon: [
    [-0.026, -0.016, -0.30, 0.026, 0.048, 0.12, 'GUNPOLY', TK.POLY],
    [-0.011, 0.002, -0.40, 0.011, 0.024, -0.28, 'GUNMETAL', TK.METAL],
    [-0.030, -0.090, -0.28, 0.030, -0.014, -0.04, 'GUNPOLY', TK.DARK], // helical drum
    [-0.020, -0.130, 0.02, 0.020, -0.016, 0.10, 'GUNPOLY', TK.POLY],
    [-0.014, 0.002, 0.12, 0.014, 0.040, 0.30, 'GUNPOLY', TK.DARK],
  ],
  rifle: [
    [-0.028, -0.018, -0.38, 0.028, 0.050, 0.12, 'GUNPOLY', TK.POLY],
    [-0.012, 0.002, -0.60, 0.012, 0.026, -0.36, 'GUNMETAL', TK.METAL],
    [-0.022, -0.026, -0.52, 0.022, 0.036, -0.34, 'GUNPOLY', TK.POLY],
    [-0.019, -0.215, -0.10, 0.019, -0.016, 0.00, 'GUNPOLY', TK.POLY],
    [-0.021, -0.145, 0.04, 0.021, -0.016, 0.12, 'GUNPOLY', TK.POLY],
    [-0.016, -0.010, 0.12, 0.016, 0.046, 0.34, 'GUNPOLY', TK.POLY],
    [-0.009, 0.050, -0.40, 0.009, 0.066, 0.06, 'GUNMETAL', TK.METAL],
    [-0.007, 0.066, -0.36, 0.007, 0.086, -0.30, 'GUNMETAL', TK.METAL],
  ],
  m4a1s: [
    [-0.028, -0.018, -0.36, 0.028, 0.050, 0.12, 'GUNPOLY', TK.POLY],
    [-0.024, 0.000, -0.66, 0.024, 0.036, -0.44, 'GUNMETAL', TK.DARK],  // suppressor
    [-0.022, -0.026, -0.44, 0.022, 0.036, -0.32, 'GUNPOLY', TK.POLY],
    [-0.019, -0.200, -0.10, 0.019, -0.016, 0.00, 'GUNPOLY', TK.POLY],
    [-0.021, -0.145, 0.04, 0.021, -0.016, 0.12, 'GUNPOLY', TK.POLY],
    [-0.016, -0.010, 0.12, 0.016, 0.046, 0.34, 'GUNPOLY', TK.POLY],
    [-0.009, 0.050, -0.36, 0.009, 0.066, 0.06, 'GUNMETAL', TK.METAL],
  ],
  famas: [
    [-0.026, -0.018, -0.30, 0.026, 0.052, 0.28, 'GUNPOLY', TK.POLY],   // bullpup
    [-0.011, 0.004, -0.52, 0.011, 0.026, -0.28, 'GUNMETAL', TK.METAL],
    [-0.019, -0.190, -0.02, 0.019, -0.016, 0.08, 'GUNPOLY', TK.POLY],
    [-0.021, -0.140, -0.20, 0.021, -0.016, -0.12, 'GUNPOLY', TK.POLY], // fore grip
    [-0.010, 0.052, -0.28, 0.010, 0.100, -0.16, 'GUNMETAL', TK.DARK],  // carry handle
    [-0.010, 0.052, 0.00, 0.010, 0.090, 0.10, 'GUNMETAL', TK.DARK],
  ],
  galil: [
    [-0.028, -0.020, -0.34, 0.028, 0.050, 0.10, 'GUNMETAL', TK.METAL],
    [-0.012, 0.002, -0.58, 0.012, 0.026, -0.32, 'GUNMETAL', TK.DARK],
    [-0.022, -0.028, -0.50, 0.022, 0.032, -0.32, 'GUNPOLY', TK.POLY],
    [-0.018, -0.150, -0.12, 0.018, -0.018, -0.02, 'GUNMETAL', TK.METAL],
    [-0.018, -0.210, -0.16, 0.018, -0.140, -0.06, 'GUNMETAL', TK.METAL],
    [-0.021, -0.145, 0.03, 0.021, -0.018, 0.11, 'GUNPOLY', TK.POLY],
    [-0.014, 0.004, 0.10, 0.014, 0.044, 0.30, 'GUNMETAL', TK.METAL],
  ],
  ak: [
    [-0.028, -0.020, -0.34, 0.028, 0.052, 0.10, 'GUNMETAL', TK.DARK],
    [-0.012, 0.004, -0.62, 0.012, 0.028, -0.32, 'GUNMETAL', TK.DARK],
    [-0.024, -0.030, -0.52, 0.024, 0.030, -0.33, 'WOOD', TK.WOOD],
    [-0.022, -0.014, 0.10, 0.022, 0.052, 0.36, 'WOOD', TK.WOOD],
    [-0.021, -0.150, 0.03, 0.021, -0.018, 0.11, 'WOOD', TK.WOOD],
    [-0.018, -0.130, -0.12, 0.018, -0.018, -0.02, 'GUNMETAL', TK.METAL],
    [-0.018, -0.195, -0.17, 0.018, -0.120, -0.06, 'GUNMETAL', TK.METAL],
    [-0.010, 0.052, -0.33, 0.010, 0.070, -0.26, 'GUNMETAL', TK.METAL],
  ],
  scopedrifle: [
    [-0.027, -0.018, -0.34, 0.027, 0.048, 0.20, 'GUNPOLY', TK.POLY],
    [-0.012, 0.002, -0.56, 0.012, 0.026, -0.32, 'GUNMETAL', TK.METAL],
    [-0.022, -0.026, -0.48, 0.022, 0.034, -0.32, 'GUNPOLY', TK.POLY],
    [-0.019, -0.200, -0.08, 0.019, -0.016, 0.02, 'GUNPOLY', TK.POLY],
    [-0.021, -0.145, 0.06, 0.021, -0.016, 0.14, 'GUNPOLY', TK.POLY],
    [-0.026, 0.048, -0.26, 0.026, 0.058, 0.04, 'GUNMETAL', TK.METAL],
    [-0.021, 0.058, -0.22, 0.021, 0.096, 0.00, 'GUNMETAL', TK.DARK],   // low-power scope
  ],
  sniper: [
    [-0.026, -0.016, -0.42, 0.026, 0.044, 0.16, 'GUNPOLY', TK.POLY],
    [-0.011, 0.000, -0.86, 0.011, 0.024, -0.40, 'GUNMETAL', TK.METAL],
    [-0.014, 0.004, -0.92, 0.014, 0.028, -0.84, 'GUNMETAL', TK.DARK],
    [-0.030, 0.044, -0.30, 0.030, 0.056, 0.06, 'GUNMETAL', TK.METAL],
    [-0.024, 0.056, -0.26, 0.024, 0.100, 0.02, 'GUNMETAL', TK.DARK],
    [-0.018, -0.150, -0.06, 0.018, -0.014, 0.04, 'GUNPOLY', TK.POLY],
    [-0.020, -0.140, 0.06, 0.020, -0.014, 0.15, 'GUNPOLY', TK.POLY],
    [-0.018, -0.030, 0.16, 0.018, 0.046, 0.42, 'GUNPOLY', TK.POLY],
  ],
  awp: [
    [-0.026, -0.016, -0.46, 0.026, 0.044, 0.18, 'GUNPOLY', TK.POLY],
    [-0.011, 0.000, -0.98, 0.011, 0.024, -0.44, 'GUNMETAL', TK.METAL],
    [-0.015, 0.002, -1.04, 0.015, 0.030, -0.96, 'GUNMETAL', TK.DARK],
    [-0.032, 0.044, -0.34, 0.032, 0.056, 0.06, 'GUNMETAL', TK.METAL],
    [-0.026, 0.056, -0.30, 0.026, 0.106, 0.04, 'GUNMETAL', TK.DARK],
    [-0.018, -0.150, -0.10, 0.018, -0.014, 0.02, 'GUNPOLY', TK.POLY],
    [-0.020, -0.140, 0.06, 0.020, -0.014, 0.16, 'GUNPOLY', TK.POLY],
    [-0.019, -0.040, 0.18, 0.019, 0.046, 0.46, 'GUNPOLY', TK.POLY],
    [-0.014, -0.086, -0.62, 0.014, -0.020, -0.52, 'GUNMETAL', TK.METAL], // bipod stub
  ],
  autosniper: [
    [-0.028, -0.018, -0.40, 0.028, 0.048, 0.24, 'GUNPOLY', TK.POLY],
    [-0.012, 0.000, -0.78, 0.012, 0.026, -0.38, 'GUNMETAL', TK.METAL],
    [-0.022, -0.028, -0.56, 0.022, 0.034, -0.36, 'GUNPOLY', TK.POLY],
    [-0.020, -0.210, -0.10, 0.020, -0.016, 0.02, 'GUNPOLY', TK.DARK],
    [-0.021, -0.150, 0.08, 0.021, -0.016, 0.16, 'GUNPOLY', TK.POLY],
    [-0.030, 0.048, -0.28, 0.030, 0.058, 0.08, 'GUNMETAL', TK.METAL],
    [-0.024, 0.058, -0.24, 0.024, 0.104, 0.06, 'GUNMETAL', TK.DARK],
    [-0.018, -0.020, 0.24, 0.018, 0.046, 0.44, 'GUNPOLY', TK.POLY],
  ],
  shotgun: [
    [-0.026, -0.016, -0.36, 0.026, 0.046, 0.12, 'WOOD', TK.WOOD],
    [-0.014, 0.008, -0.76, 0.014, 0.036, -0.34, 'GUNMETAL', TK.METAL],
    [-0.014, -0.020, -0.74, 0.014, 0.004, -0.30, 'GUNMETAL', TK.METAL],
    [-0.020, -0.026, -0.56, 0.020, 0.006, -0.44, 'WOOD', TK.WOOD],
    [-0.020, -0.040, 0.12, 0.020, 0.050, 0.38, 'WOOD', TK.WOOD],
  ],
  autoshotgun: [
    [-0.028, -0.018, -0.34, 0.028, 0.050, 0.14, 'GUNMETAL', TK.DARK],
    [-0.016, 0.008, -0.80, 0.016, 0.038, -0.32, 'GUNMETAL', TK.METAL],
    [-0.016, -0.022, -0.78, 0.016, 0.004, -0.30, 'GUNMETAL', TK.METAL],
    [-0.022, -0.030, -0.60, 0.022, 0.006, -0.46, 'GUNPOLY', TK.POLY],
    [-0.021, -0.150, 0.06, 0.021, -0.016, 0.14, 'GUNPOLY', TK.POLY],
    [-0.018, -0.020, 0.14, 0.018, 0.048, 0.38, 'GUNPOLY', TK.POLY],
  ],
  sawedoff: [
    [-0.030, -0.020, -0.28, 0.030, 0.048, 0.10, 'WOOD', TK.WOOD],
    [-0.020, 0.004, -0.44, 0.020, 0.040, -0.26, 'GUNMETAL', TK.METAL],  // stubby double barrel
    [-0.022, -0.140, 0.02, 0.022, -0.016, 0.12, 'WOOD', TK.WOOD],
  ],
  mag7: [
    [-0.028, -0.018, -0.30, 0.028, 0.050, 0.14, 'GUNPOLY', TK.POLY],
    [-0.015, 0.006, -0.58, 0.015, 0.034, -0.28, 'GUNMETAL', TK.METAL],
    [-0.026, -0.150, -0.24, 0.026, -0.016, -0.10, 'GUNPOLY', TK.DARK],  // front magazine
    [-0.021, -0.140, 0.04, 0.021, -0.016, 0.12, 'GUNPOLY', TK.POLY],
    [-0.017, -0.010, 0.14, 0.017, 0.046, 0.34, 'GUNPOLY', TK.POLY],
  ],
  lmg: [
    [-0.034, -0.022, -0.44, 0.034, 0.054, 0.16, 'GUNPOLY', TK.POLY],
    [-0.013, 0.002, -0.78, 0.013, 0.028, -0.42, 'GUNMETAL', TK.METAL],
    [-0.040, -0.170, -0.20, 0.040, -0.020, 0.02, 'GUNPOLY', TK.DARK],   // ammo box
    [-0.022, -0.150, 0.06, 0.022, -0.020, 0.14, 'GUNPOLY', TK.POLY],
    [-0.020, -0.012, 0.16, 0.020, 0.050, 0.40, 'GUNPOLY', TK.POLY],
    [-0.012, 0.054, -0.40, 0.012, 0.072, 0.02, 'GUNMETAL', TK.METAL],
    [-0.030, -0.130, -0.44, 0.030, -0.030, -0.36, 'GUNMETAL', TK.METAL], // bipod
  ],
  zeus: [
    [-0.022, -0.010, -0.18, 0.022, 0.042, 0.04, 'GUNPOLY', TK.POLY],
    [-0.010, 0.008, -0.26, -0.004, 0.028, -0.16, 'GUNMETAL', TK.BRIGHT],
    [0.004, 0.008, -0.26, 0.010, 0.028, -0.16, 'GUNMETAL', TK.BRIGHT],
    [-0.017, -0.140, -0.02, 0.017, -0.008, 0.06, 'GUNPOLY', TK.POLY],
  ],
  c4: [
    [-0.09, -0.05, -0.13, 0.09, 0.05, 0.13, 'BOMB', TK.POLY],
    [-0.05, 0.05, -0.06, 0.05, 0.07, 0.06, 'GUNMETAL', TK.METAL],
  ],
  grenade: [
    [-0.045, -0.055, -0.045, 0.045, 0.045, 0.045, 'GUNMETAL', TK.BRIGHT],
    [-0.018, 0.045, -0.018, 0.018, 0.072, 0.018, 'GUNMETAL', TK.METAL],
  ],
  defuser: [
    [-0.07, -0.03, -0.05, 0.07, 0.03, 0.05, 'GUNPOLY', TK.BRIGHT],
    [-0.03, 0.03, -0.02, 0.03, 0.05, 0.02, 'GUNMETAL', TK.METAL],
  ],
  armor: [
    [-0.10, -0.12, -0.05, 0.10, 0.12, 0.05, 'GUNPOLY', TK.POLY],
    [-0.12, 0.02, -0.06, 0.12, 0.10, 0.06, 'GUNPOLY', TK.BRIGHT],
  ],
};

const TINT_PALETTE = {
  [TK.METAL]: [1.0, 1.0, 1.0],
  [TK.POLY]: [0.85, 0.85, 0.88],
  [TK.WOOD]: [1.0, 0.92, 0.8],
  [TK.DARK]: [0.55, 0.56, 0.6],
  [TK.BRIGHT]: [1.3, 1.32, 1.36],
};

/** Build a gun mesh from the shared part data. */
function buildGunMesh(builder, kind, tint) {
  const parts = GUN_PARTS[kind] || GUN_PARTS.pistol;
  const base = tint || [1, 1, 1];
  for (const [x0, y0, z0, x1, y1, z1, matKey, tk] of parts) {
    const pal = TINT_PALETTE[tk] || [1, 1, 1];
    const isWood = matKey === 'WOOD';
    const t = isWood ? pal : [base[0] * pal[0], base[1] * pal[1], base[2] * pal[2]];
    builder.box([x0, y0, z0], [x1, y1, z1], MAT[matKey], { uvScale: 6, tint: t });
  }
  return builder;
}

/** Where the muzzle sits in gun space, for flashes and tracer origins. */
const MUZZLE_OFFSET = {
  knife: [0, 0.01, -0.30], pistol: [0, 0.018, -0.21], pistol_s: [0, 0.018, -0.35],
  tec9: [0, 0.018, -0.37], dual: [-0.064, 0.016, -0.20], deagle: [0, 0.024, -0.27],
  revolver: [0, 0.03, -0.31], smg: [0, 0.010, -0.45], mp5: [0, 0.014, -0.53],
  mac10: [0, 0.014, -0.35], ump: [0, 0.012, -0.43], p90: [0, 0.004, -0.45],
  bizon: [0, 0.012, -0.41], rifle: [0, 0.014, -0.61], m4a1s: [0, 0.018, -0.67],
  famas: [0, 0.014, -0.53], galil: [0, 0.014, -0.59], ak: [0, 0.016, -0.63],
  scopedrifle: [0, 0.014, -0.57], sniper: [0, 0.012, -0.93], awp: [0, 0.012, -1.05],
  autosniper: [0, 0.012, -0.79], shotgun: [0, 0.022, -0.77], autoshotgun: [0, 0.022, -0.81],
  sawedoff: [0, 0.022, -0.45], mag7: [0, 0.020, -0.59], lmg: [0, 0.014, -0.79],
  zeus: [0, 0.018, -0.27],
};

/** Resting position/rotation of each model in view space. */
const VIEWMODEL_POSE = {
  knife: { pos: [0.145, -0.135, -0.26], rot: [0.05, -0.18, 0.10] },
  dual: { pos: [0.075, -0.130, -0.24], rot: [0.02, 0, 0] },
  sniper: { pos: [0.125, -0.140, -0.14], rot: [0.02, -0.035, 0] },
  awp: { pos: [0.125, -0.140, -0.12], rot: [0.02, -0.035, 0] },
  autosniper: { pos: [0.125, -0.140, -0.16], rot: [0.02, -0.035, 0] },
  lmg: { pos: [0.130, -0.150, -0.18], rot: [0.02, -0.04, 0] },
  c4: { pos: [0.10, -0.16, -0.30], rot: [0.1, -0.2, 0] },
  grenade: { pos: [0.13, -0.16, -0.28], rot: [0.1, -0.2, 0] },
  defuser: { pos: [0.10, -0.16, -0.30], rot: [0.1, -0.2, 0] },
  DEFAULT: { pos: [0.120, -0.138, -0.21], rot: [0.02, -0.04, 0] },
};

function viewmodelPose(kind) {
  return VIEWMODEL_POSE[kind] || VIEWMODEL_POSE.DEFAULT;
}

/* --------------------- 2D silhouette for the shop --------------------- */

/**
 * Draw a weapon silhouette by projecting its boxes onto the ZY plane —
 * the same data the 3D model uses, so the shop art always matches.
 */
function drawWeaponIcon(ctx, kind, w, h, color = '#e8eaee') {
  const parts = GUN_PARTS[kind] || GUN_PARTS.pistol;
  let minZ = 1e9, maxZ = -1e9, minY = 1e9, maxY = -1e9;
  for (const p of parts) {
    minZ = Math.min(minZ, p[2], p[5]); maxZ = Math.max(maxZ, p[2], p[5]);
    minY = Math.min(minY, p[1], p[4]); maxY = Math.max(maxY, p[1], p[4]);
  }
  const gw = maxZ - minZ, gh = maxY - minY;
  const pad = 0.10;
  const scale = Math.min((w * (1 - pad * 2)) / gw, (h * (1 - pad * 2)) / gh);
  const ox = w / 2 + ((minZ + maxZ) / 2) * scale;   // note: -Z is forward, so flip
  const oy = h / 2 + ((minY + maxY) / 2) * scale;
  ctx.save();
  ctx.fillStyle = color;
  for (const p of parts) {
    const z0 = Math.min(p[2], p[5]), z1 = Math.max(p[2], p[5]);
    const y0 = Math.min(p[1], p[4]), y1 = Math.max(p[1], p[4]);
    const x = ox - z1 * scale;
    const y = oy - y1 * scale;
    ctx.fillRect(x, y, (z1 - z0) * scale, (y1 - y0) * scale);
  }
  ctx.restore();
}
