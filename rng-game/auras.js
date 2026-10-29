/* auras.js — generates the 847 auras of Aura Realms deterministically: 784 generated ones (Common at 1 in 2
   up to Fury of Darkness at 1 in 1,000,000,000), 20 hand-made Forbidden auras beyond it (up to Null Dominion at
   1 in 80,000,000,000), 42 Administrative auras and, alone in the last rank (Chosen), The Chosen One at
   1 in 1,000,000,000,000,000. Rarity is expressed as "1 in N". */
(function (global) {
  "use strict";

  var GENERATED = 784; /* the original generated set; later auras are appended after it so no ID changes */

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
    { key: "forbidden",    name: "Forbidden",    max: 1e11,     color: "#ef4444", cutscene: 5 },
    { key: "administrative", name: "Administrative", max: 1e15,  color: "#22d3ee", cutscene: 6 },
    { key: "chosen",       name: "Chosen",       max: Infinity, color: "#ffd700", cutscene: 7 }
  ];

  var TIER_COIN_BONUS = {
    common: 0, uncommon: 0, rare: 10, epic: 40, legendary: 200,
    cosmic: 1000, divine: 5000, transcendent: 25000, forbidden: 250000, administrative: 2500000, chosen: 25000000
  };

  /* Battle power grows with rarity; every aura gets twice the base curve. */
  function powerFor(rarity) { return 2 * Math.round(10 + 8 * Math.pow(Math.log2(rarity), 1.7)); }

  function tierOf(aura) {
    for (var i = 0; i < TIERS.length; i++) if (aura.rarity < TIERS[i].max) return TIERS[i];
    return TIERS[TIERS.length - 1];
  }

  /* Hand-made low tier auras: name, rarity, colour palette. */
  var BASE = [
    ["Common",   2,   ["#c7c7c7", "#5f5f5f"]],
    ["Uncommon", 3,   ["#86efac", "#15803d", "#d9f99d"]],
    ["Good",     5,   ["#a7f3d0", "#0f766e", "#5eead4"]],
    ["Natural",  8,   ["#bef264", "#4d7c0f", "#fef08a"]],
    ["Breeze",   13,  ["#bae6fd", "#0284c7", "#e0f2fe", "#7dd3fc"]],
    ["Ember",    20,  ["#fdba74", "#c2410c", "#fef3c7", "#ef4444"]],
    ["Frost",    32,  ["#e0f2fe", "#38bdf8", "#ffffff", "#a5f3fc"]],
    ["Tide",     50,  ["#67e8f9", "#155e75", "#a5f3fc", "#0ea5e9"]],
    ["Stone",    80,  ["#d6d3d1", "#44403c", "#a8a29e", "#78716c"]],
    ["Thunder",  125, ["#fef08a", "#ca8a04", "#ffffff", "#facc15"]],
    ["Crystal",  200, ["#f5d0fe", "#86198f", "#e0e7ff", "#c084fc"]],
    ["Ruby",     320, ["#fca5a5", "#991b1b", "#fecaca", "#ef4444"]],
    ["Sapphire", 500, ["#93c5fd", "#1e3a8a", "#dbeafe", "#3b82f6"]],
    ["Emerald",  800, ["#6ee7b7", "#065f46", "#d1fae5", "#10b981"]]
  ];

  /* Named specials that replace the generated aura nearest to their rarity. */
  var SPECIAL = [
    ["Jackpot",          7777,       ["#fde68a", "#b45309", "#fff7ed", "#f59e0b", "#fbbf24"], null],
    ["Starfall",         50000,      ["#c7d2fe", "#3730a3", "#ffffff", "#818cf8", "#e0e7ff"], null],
    ["Eclipse",          100000,     ["#fbbf24", "#0f0f1a", "#fde68a", "#1e1b4b", "#f59e0b"], null],
    ["Abyss",            500000,     ["#3b82f6", "#020617", "#1d4ed8", "#0f172a", "#60a5fa"], null],
    ["Cosmic Veil",      2000000,    ["#c4b5fd", "#2e1065", "#f0abfc", "#312e81", "#e9d5ff"], "cosmic"],
    ["Genesis Bloom",    10000000,   ["#fef9c3", "#db2777", "#fbcfe8", "#fde68a", "#f472b6"], null],
    ["Overseer",         100000000,  ["#f8fafc", "#6d28d9", "#e2e8f0", "#a78bfa", "#ffffff"], null],
    ["Fury of Darkness", 1000000000, ["#ff1a1a", "#000000", "#7f1d1d", "#ff6a00", "#1a0000"], "fury"]
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
      list.push({ name: b[0], rarity: b[1], colors: b[2], special: null, fixed: true });
    });

    /* Generated rarities: log-spaced from 1,000 up to exactly 1,000,000,000. */
    var gen = GENERATED - BASE.length;
    var prev = BASE[BASE.length - 1][1];
    for (i = 0; i < gen; i++) {
      var r = roundSig(1000 * Math.pow(1e6, i / (gen - 1)), 3);
      if (r <= prev) r = prev + 1;
      prev = r;
      list.push({ name: null, rarity: r, colors: null, special: null, fixed: false });
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
      list[best].colors = s[2];
      list[best].special = s[3];
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
      if (!a.colors) {
        /* Palette size grows with tier: 2 colours for common, 5 for the rarest. */
        var tierIdx = TIERS.indexOf(tier);
        var n = Math.min(5, 2 + Math.floor(tierIdx / 2) + (tierIdx >= 4 ? 1 : 0));
        var hue = Math.floor(rng() * 360);
        var sat = 60 + tierIdx * 4;
        var offsets = [0, 35 + Math.floor(rng() * 40), 180 + Math.floor(rng() * 40), 90 + Math.floor(rng() * 60), 300 + Math.floor(rng() * 40)];
        var lights = [70, 42, 62, 35, 78];
        a.colors = [];
        for (var ci = 0; ci < n; ci++) {
          a.colors.push("hsl(" + ((hue + offsets[ci]) % 360) + ", " + sat + "%, " + lights[ci] + "%)");
        }
      }
      a.c1 = a.colors[0];
      a.c2 = a.colors[1];
      a.power = powerFor(a.rarity);
      a.coins = Math.max(1, Math.floor(2 * Math.log2(a.rarity))) + TIER_COIN_BONUS[tier.key];
      a.cutscene = tier.cutscene;
      a.id = idx;
    });

    return list;
  }

  var list = build();

  /* Hand-made auras beyond Fury of Darkness: name, rarity, palette, shiny multiplier (0 = no shiny form) and,
     for the Administrative rank, a fixed power. They take IDs 784 and up in this order, so no ID ever changes. */
  var EXTRA_AURAS = [
    ["Abyssal Crown",       1250000000,  ["#a855f7", "#05000d", "#f0abfc", "#3b0764", "#c084fc"], 3],
    ["Void Sovereign",      1500000000,  ["#38bdf8", "#00040d", "#0c4a6e", "#e0f2fe", "#0369a1"], 2],
    ["Shattered Infinity",  2000000000,  ["#e2e8f0", "#0b0b12", "#94a3b8", "#f8fafc", "#475569"], 4],
    ["Crimson Apocalypse",  2500000000,  ["#dc2626", "#120000", "#fb923c", "#450a0a", "#fecaca"], 0],
    ["Nightmare Engine",    3000000000,  ["#22c55e", "#020a04", "#14532d", "#bbf7d0", "#065f46"], 5],
    ["Bleeding Cosmos",     4000000000,  ["#f43f5e", "#0a0010", "#7e22ce", "#fda4af", "#4c0519"], 3],
    ["Forsaken Genesis",    5000000000,  ["#fde047", "#0d0a00", "#ca8a04", "#fef9c3", "#713f12"], 2],
    ["Wrath of the Unmade", 6500000000,  ["#f97316", "#0a0300", "#7c2d12", "#ffedd5", "#ea580c"], 0],
    ["Eternal Damnation",   8000000000,  ["#ef4444", "#000000", "#991b1b", "#f87171", "#1f0000"], 4],
    ["Final Silence",       10000000000, ["#ffffff", "#000000", "#525252", "#e5e5e5", "#171717"], 5],
    ["Obsidian Requiem",    12500000000, ["#a3a3a3", "#020202", "#3f3f46", "#e4e4e7", "#18181b"], 2],
    ["Hellfire Monarch",    15000000000, ["#ff4500", "#140000", "#fbbf24", "#7f1d1d", "#fed7aa"], 3],
    ["Ruined Eternity",     18000000000, ["#c4b5fd", "#07031a", "#6d28d9", "#ede9fe", "#2e1065"], 4],
    ["Doomsday Pulse",      22000000000, ["#f43f5e", "#0f0005", "#fda4af", "#881337", "#ffe4e6"], 5],
    ["Cursed Singularity",  27000000000, ["#8b5cf6", "#000000", "#22d3ee", "#1e1b4b", "#c4b5fd"], 2],
    ["Phantom Armageddon",  33000000000, ["#94a3b8", "#05070a", "#f97316", "#1e293b", "#e2e8f0"], 3],
    ["Drowned Leviathan",   40000000000, ["#0ea5e9", "#00030a", "#082f49", "#7dd3fc", "#0c4a6e"], 4],
    ["Endless Torment",     50000000000, ["#dc2626", "#050000", "#a855f7", "#450a0a", "#fca5a5"], 5],
    ["Chaos Incarnate",     65000000000, ["#facc15", "#0a0014", "#ec4899", "#3b0764", "#fef08a"], 3],
    ["Null Dominion",       80000000000, ["#e5e7eb", "#000000", "#ef4444", "#111827", "#ffffff"], 4],
    /* Administrative: the last rank, with only these two auras. */
    ["Root Access",         500000000000,  ["#22d3ee", "#001014", "#a5f3fc", "#0e7490", "#ecfeff"], 0, 10000],
    ["Absolute Authority",  1000000000000, ["#fde68a", "#050505", "#22d3ee", "#ffffff", "#f59e0b"], 0, 12000]
  ];
  /* 40 more Administrative auras between Absolute Authority (1 in a trillion) and The Chosen One (1 in a
     quadrillion): odds spread evenly on a log scale and rounded to two digits, power rising 500 at a time from
     12,500 to 32,000. Every fifth one has no shiny form, so 32 of the 40 do. */
  var ADMIN_NAMES = [
    "Kernel Panic", "Firewall Sentinel", "System Override", "Admin Overlord", "Master Key",
    "Sudo Command", "Debug Mode", "Server Throne", "Source Code", "Data Sovereign",
    "Binary Emperor", "Cipher King", "Protocol Zero", "Prime Directive", "Root Warden",
    "Mainframe Titan", "Quantum Admin", "Code Architect", "Neural Monarch", "Network Deity",
    "Glitch Emperor", "Bytecore Sage", "Console Deity", "Encrypted Crown", "Logic Tyrant",
    "Server Seraph", "Admin Ascendant", "Hotfix Herald", "Backdoor Phantom", "Overclock Wraith",
    "Infinite Loop", "Null Pointer", "Stack Overflow", "Recursion Lord", "Supreme Moderator",
    "Command Nexus", "Omega Protocol", "Genesis Compiler", "Celestial Admin", "Eternal Operator"
  ];
  var adminShiny = 0;
  ADMIN_NAMES.forEach(function (name, i) {
    var exact = 1e12 * Math.pow(10, 3 * (i + 1) / (ADMIN_NAMES.length + 1));
    var step = Math.pow(10, Math.floor(Math.log10(exact)) - 1);
    var prng = mulberry32(9001 + i), hue = 165 + Math.floor(prng() * 60), gold = 38 + Math.floor(prng() * 14);
    var colors = ["hsl(" + hue + ", 95%, 62%)", "hsl(" + hue + ", 80%, 6%)", "hsl(" + gold + ", 95%, 65%)", "hsl(" + ((hue + 30) % 360) + ", 90%, 80%)", "#ffffff"];
    EXTRA_AURAS.push([name, Math.round(exact / step) * step, colors, i % 5 === 4 ? 0 : 2 + (adminShiny++ % 4), 12500 + i * 500]);
  });
  /* The last aura of all, the only one of the Chosen rank: one of a kind, no shiny form. */
  EXTRA_AURAS.push(["The Chosen One", 1e15, ["#fff7cc", "#0b0700", "#fde047", "#ffffff", "#f59e0b"], 0, 50000]);
  EXTRA_AURAS.forEach(function (e) {
    var a = { name: e[0], rarity: e[1], colors: e[2], special: null, fixed: true };
    var tier = tierOf(a);
    a.tier = tier.key;
    a.c1 = a.colors[0];
    a.c2 = a.colors[1];
    a.power = e[4] || powerFor(a.rarity);
    a.fixedPower = !!e[4];
    a.coins = Math.max(1, Math.floor(2 * Math.log2(a.rarity))) + TIER_COIN_BONUS[tier.key];
    a.cutscene = tier.cutscene;
    a.id = list.length;
    a.extraShiny = e[3];
    list.push(a);
  });
  var TOTAL = list.length;

  /* Shiny forms: 78.5% of auras get one (615 of the 784 generated ones, 18 of the 20 extra Forbidden ones and
     32 of the 40 later Administrative ones; Root Access, Absolute Authority and The Chosen One have none: 665 of 847). Each is fixed at x2, x3, x4 or x5, the multipliers spread evenly. Rolling that aura has a
     1-in-multiplier chance of being shiny, so a shiny's true odds are its normal odds times the multiplier. */
  var SHINY_SHARE = 0.785;
  /* Hand-picked shiny multipliers that override the even x2-x5 spread. */
  var SHINY_OVERRIDES = { "Fury of Darkness": 10 };
  (function () {
    var setShiny = function (a, k) {
      a.shiny = k;
      a.shinyRarity = a.rarity * k;
      /* An aura with a hand-set power gets +10% per shiny multiplier step instead of the rarity curve. */
      a.shinyPower = a.fixedPower ? Math.round(a.power * (1 + 0.1 * k)) : powerFor(a.shinyRarity);
      a.shinyCoins = a.coins * k;
    };
    var rng = mulberry32(785), order = list.slice(0, GENERATED).map(function (a) { return a.id; }), i;
    for (i = order.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), tmp = order[i]; order[i] = order[j]; order[j] = tmp; }
    list.forEach(function (a) { a.shiny = 0; });
    for (i = 0; i < Math.round(GENERATED * SHINY_SHARE); i++) {
      var a = list[order[i]];
      setShiny(a, SHINY_OVERRIDES[a.name] || 2 + (i % 4));
    }
    list.slice(GENERATED).forEach(function (a) { if (a.extraShiny) setShiny(a, a.extraShiny); delete a.extraShiny; });
  })();
  var SHINY_COUNT = list.filter(function (a) { return a.shiny; }).length;
  var byRarityDesc = list.slice().sort(function (a, b) { return b.rarity - a.rarity; });

  var API = {
    TOTAL: TOTAL,
    SHINY_COUNT: SHINY_COUNT,
    powerFor: powerFor,
    list: list,
    byRarityDesc: byRarityDesc,
    TIERS: TIERS,
    tierOf: tierOf,
    byId: function (id) { return list[id]; },
    byName: function (name) { for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i]; return null; },
    formatOdds: function (r) { return "1 in " + r.toLocaleString("en-US"); }
  };

  /* Frozen so the browser console can't rewrite an aura's power, odds or coins mid-game. */
  list.forEach(function (a) { Object.freeze(a.colors); Object.freeze(a); });
  TIERS.forEach(Object.freeze);
  [list, byRarityDesc, TIERS, API].forEach(Object.freeze);
  global.AURAS = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
