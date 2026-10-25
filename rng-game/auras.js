/* auras.js — generates the 784 auras of Aura Realms deterministically.
   Rarity is expressed as "1 in N". Common is 1 in 2, Fury of Darkness is 1 in 1,000,000,000. */
(function (global) {
  "use strict";

  var TOTAL = 784;

  /* Small seeded PRNG so names/colours are identical for every player. */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function roundSig(n, sig) {
    var mag = Math.pow(10, sig - 1 - Math.floor(Math.log10(Math.abs(n))));
    return Math.round(n * mag) / mag;
  }

  var TIERS = [
    { key: "common",       name: "Common",       max: 10,       color: "#b4b4b4", cutscene: 0 },
    { key: "uncommon",     name: "Uncommon",     max: 1000,     color: "#4ade80", cutscene: 0 },
    { key: "rare",         name: "Rare",         max: 1e4,      color: "#60a5fa", cutscene: 0 },
    { key: "epic",         name: "Epic",         max: 1e5,      color: "#c084fc", cutscene: 0 },
    { key: "legendary",    name: "Legendary",    max: 1e6,      color: "#fb923c", cutscene: 1 },
    { key: "cosmic",       name: "Cosmic",       max: 1e7,      color: "#e879f9", cutscene: 2 },
    { key: "divine",       name: "Divine",       max: 1e8,      color: "#fde047", cutscene: 3 },
    { key: "transcendent", name: "Transcendent", max: 1e9,      color: "#f472b6", cutscene: 4 },
    { key: "forbidden",    name: "Forbidden",    max: Infinity, color: "#ef4444", cutscene: 5 }
  ];

  var TIER_COIN_BONUS = {
    common: 0, uncommon: 0, rare: 10, epic: 40, legendary: 200,
    cosmic: 1000, divine: 5000, transcendent: 25000, forbidden: 250000
  };

  function tierOf(aura) {
    for (var i = 0; i < TIERS.length; i++) if (aura.rarity < TIERS[i].max) return TIERS[i];
    return TIERS[TIERS.length - 1];
  }

  /* Hand-made low tier auras: name, rarity, colour A, colour B. */
  var BASE = [
    ["Common",   2,   "#c7c7c7", "#5f5f5f"],
    ["Uncommon", 3,   "#86efac", "#15803d"],
    ["Good",     5,   "#a7f3d0", "#0f766e"],
    ["Natural",  8,   "#bef264", "#4d7c0f"],
    ["Breeze",   13,  "#bae6fd", "#0284c7"],
    ["Ember",    20,  "#fdba74", "#c2410c"],
    ["Frost",    32,  "#e0f2fe", "#38bdf8"],
    ["Tide",     50,  "#67e8f9", "#155e75"],
    ["Stone",    80,  "#d6d3d1", "#44403c"],
    ["Thunder",  125, "#fef08a", "#ca8a04"],
    ["Crystal",  200, "#f5d0fe", "#86198f"],
    ["Ruby",     320, "#fca5a5", "#991b1b"],
    ["Sapphire", 500, "#93c5fd", "#1e3a8a"],
    ["Emerald",  800, "#6ee7b7", "#065f46"]
  ];

  /* Named specials that replace the generated aura nearest to their rarity. */
  var SPECIAL = [
    ["Jackpot",          7777,       "#fde68a", "#b45309", null],
    ["Starfall",         50000,      "#c7d2fe", "#3730a3", null],
    ["Eclipse",          100000,     "#fbbf24", "#0f0f1a", null],
    ["Abyss",            500000,     "#3b82f6", "#020617", null],
    ["Cosmic Veil",      2000000,    "#c4b5fd", "#2e1065", "cosmic"],
    ["Genesis Bloom",    10000000,   "#fef9c3", "#db2777", null],
    ["Overseer",         100000000,  "#f8fafc", "#6d28d9", null],
    ["Fury of Darkness", 1000000000, "#ff1a1a", "#000000", "fury"]
  ];

  /* Name pools per tier. Each tier has 20 x 20 = 400 combinations, far more than needed. */
  var POOLS = {
    rare: {
      a: ["Frosted", "Ember", "Gale", "Tidal", "Mossy", "Amber", "Dusk", "Dawn", "Stony", "Iron",
          "Copper", "Silver", "Misty", "Storm", "Coral", "Jade", "Ashen", "Ivory", "Onyx", "Lunar"],
      b: ["Shard", "Spark", "Wind", "Bloom", "Wave", "Flame", "Pulse", "Drift", "Glow", "Echo",
          "Petal", "Stream", "Mist", "Wisp", "Ripple", "Glint", "Haze", "Crest", "Fang", "Thorn"]
    },
    epic: {
      a: ["Crimson", "Azure", "Verdant", "Obsidian", "Prismatic", "Molten", "Spectral", "Radiant", "Arcane", "Phantom",
          "Gilded", "Astral", "Volcanic", "Glacial", "Electric", "Sanguine", "Twilight", "Shadow", "Golden", "Royal"],
      b: ["Warden", "Sentinel", "Reaper", "Tempest", "Oracle", "Specter", "Phoenix", "Serpent", "Wraith", "Knight",
          "Colossus", "Harbinger", "Monarch", "Revenant", "Titan", "Zephyr", "Griffin", "Leviathan", "Hydra", "Chimera"]
    },
    legendary: {
      a: ["Eternal", "Infernal", "Celestial", "Abyssal", "Primordial", "Sovereign", "Immortal", "Heavenly", "Forsaken", "Mythic",
          "Ancient", "Boundless", "Hallowed", "Cursed", "Blessed", "Stellar", "Nebular", "Solar", "Void", "Omega"],
      b: ["Dominion", "Ascension", "Requiem", "Apotheosis", "Genesis", "Oblivion", "Eclipse", "Paragon", "Zenith", "Nexus",
          "Cataclysm", "Pantheon", "Exodus", "Aurora", "Singularity", "Covenant", "Judgement", "Overlord", "Seraph", "Archon"]
    },
    cosmic: {
      a: ["Heart", "Crown", "Eye", "Breath", "Song", "Wrath", "Dream", "Soul", "Grace", "Voice",
          "Hand", "Fall", "Rise", "Light", "Shadow", "Tear", "Flame", "Mirror", "Gate", "Throne"],
      b: ["the Cosmos", "Infinity", "the Void", "Creation", "Eternity", "the Stars", "Oblivion", "the Abyss", "the Nebulae", "the Ancients",
          "the Galaxies", "Time", "Entropy", "the Horizon", "Silence", "Starlight", "the Unknown", "the Supernova", "the Deep", "First Dawn"],
      join: " of "
    },
    divine: {
      a: ["Divine", "Transcendent", "Omnipotent", "Ethereal", "Supreme", "Absolute", "Exalted", "Ineffable", "Sacred", "Ultimate",
          "Paramount", "Infinite", "Almighty", "Resplendent", "Immaculate", "Primeval", "Unbound", "Celestine", "Empyrean", "Luminous"],
      b: ["Eminence", "Ascendancy", "Majesty", "Providence", "Revelation", "Omniscience", "Serenity", "Benediction", "Radiance", "Sanctum",
          "Firmament", "Elysium", "Halo", "Transcendence", "Godhead", "Luminance", "Dominance", "Glory", "Rapture", "Sovereignty"]
    },
    transcendent: {
      a: ["Alpha", "Omega", "Zero", "Null", "Prime", "Apex", "Ultra", "Hyper", "Meta", "Terminal",
          "Final", "Last", "First", "Beyond", "Outer", "Inner", "Lost", "Hidden", "Forgotten", "Unspoken"],
      b: ["Truth", "Paradox", "Axiom", "Horizon", "Reality", "Existence", "Chaos", "Order", "Fate", "Destiny",
          "Enigma", "Mystery", "Essence", "Absolution", "Awakening", "Dawn", "Dusk", "Eternity", "Nothingness", "Everything"]
    }
  };
  POOLS.forbidden = POOLS.transcendent;

  function build() {
    var rng = mulberry32(784);
    var list = [];
    var i, j;

    BASE.forEach(function (b) {
      list.push({ name: b[0], rarity: b[1], c1: b[2], c2: b[3], special: null, fixed: true });
    });

    /* Generated rarities: log-spaced from 1,000 up to exactly 1,000,000,000. */
    var gen = TOTAL - BASE.length;
    var prev = BASE[BASE.length - 1][1];
    for (i = 0; i < gen; i++) {
      var r = roundSig(1000 * Math.pow(1e6, i / (gen - 1)), 3);
      if (r <= prev) r = prev + 1;
      prev = r;
      list.push({ name: null, rarity: r, c1: null, c2: null, special: null, fixed: false });
    }

    /* Drop the named specials onto the closest generated slot (log distance). */
    SPECIAL.forEach(function (s) {
      var best = -1, bestD = Infinity;
      for (j = BASE.length; j < list.length; j++) {
        if (list[j].fixed) continue;
        var d = Math.abs(Math.log(list[j].rarity / s[1]));
        if (d < bestD) { bestD = d; best = j; }
      }
      list[best].name = s[0];
      list[best].rarity = s[1];
      list[best].c1 = s[2];
      list[best].c2 = s[3];
      list[best].special = s[4];
      list[best].fixed = true;
    });

    list.sort(function (a, b) { return a.rarity - b.rarity; });
    for (i = 1; i < list.length; i++) {
      if (list[i].rarity <= list[i - 1].rarity) {
        if (list[i].fixed) list[i - 1].rarity = list[i].rarity - 1;
        else list[i].rarity = list[i - 1].rarity + 1;
      }
    }

    var used = {};
    list.forEach(function (a) { if (a.name) used[a.name] = true; });

    list.forEach(function (a, idx) {
      var tier = tierOf(a);
      a.tier = tier.key;
      if (!a.name) {
        var pool = POOLS[tier.key];
        var name, tries = 0;
        do {
          var p = pool.a[Math.floor(rng() * pool.a.length)];
          var c = pool.b[Math.floor(rng() * pool.b.length)];
          name = p + (pool.join || " ") + c;
          tries++;
        } while (used[name] && tries < 10000);
        used[name] = true;
        a.name = name;
      }
      if (!a.c1) {
        var hue = Math.floor(rng() * 360);
        var hue2 = (hue + 30 + Math.floor(rng() * 90)) % 360;
        var sat = 55 + TIERS.indexOf(tier) * 5;
        a.c1 = "hsl(" + hue + ", " + sat + "%, 70%)";
        a.c2 = "hsl(" + hue2 + ", " + sat + "%, 30%)";
      }
      a.power = Math.round(10 + 8 * Math.pow(Math.log2(a.rarity), 1.7));
      a.coins = Math.max(1, Math.floor(2 * Math.log2(a.rarity))) + TIER_COIN_BONUS[tier.key];
      a.cutscene = tier.cutscene;
      a.id = idx;
    });

    return list;
  }

  var list = build();
  var byRarityDesc = list.slice().sort(function (a, b) { return b.rarity - a.rarity; });

  var API = {
    TOTAL: TOTAL,
    list: list,
    byRarityDesc: byRarityDesc,
    TIERS: TIERS,
    tierOf: tierOf,
    byId: function (id) { return list[id]; },
    byName: function (name) { for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i]; return null; },
    formatOdds: function (r) { return "1 in " + r.toLocaleString("en-US"); }
  };

  global.AURAS = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
