/* game.js — Aura Realms RNG: rolling, coins, potions, abilities, turn-based battles, PvP, cutscenes. */
(function () {
  "use strict";

  var A = window.AURAS;
  var K = window.KITS;
  var $ = function (s) { return document.querySelector(s); };
  var SAVE_BASE = "aura-realms-save-v2";
  var ACCOUNTS_KEY = "aura-realms-accounts-v2";
  var OLD_ACCOUNTS_KEY = "aura-realms-accounts";
  var SESSION_KEY = "aura-realms-session-v2";
  var TAB_KEY = "aura-realms-tab";
  var CLOUD_URL = "/.netlify/functions/account";
  /* Error codes shown to players. */
  var ERR = { DUAL: 145, NETWORK: 404, POTION_BUY: 435, POTION_USE: 102, ACCOUNT: 98, CHAT_WIFI: 981, CHAT_CODE: 523, CHAT_MUTED: 108, SWEAR: 451 };
  var currentUser = null; /* the 7-digit ID of the logged-in player, or null for guest */
  function saveKey() { return currentUser ? SAVE_BASE + ":" + currentUser : SAVE_BASE; }
  var ROLL_COOLDOWN = 1000;
  var PEER_PREFIX = "aura-realms-v1-";
  var fmt = function (n) { return Math.floor(n).toLocaleString("en-US"); };
  /* Coin amounts too big to ever have (many training levels at once) read as words, not 100 digits. */
  var fmtCost = function (n) { return n < 1e15 ? fmt(n) : "more than 1,000,000,000,000,000"; };

  /* ---------- Data ---------- */

  var POTIONS = {
    /* Luck */
    lucky:     { name: "Lucky Potion",      icon: "🍀", cost: 150,     group: "luck",   kind: "luck", mult: 2,     rolls: 20, desc: "x2 luck for 20 rolls" },
    clover:    { name: "Clover Brew",       icon: "☘️", cost: 500,     group: "luck",   kind: "luck", mult: 3,     rolls: 50, desc: "x3 luck for 50 rolls" },
    fortune:   { name: "Fortune Potion",    icon: "🧪", cost: 600,     group: "luck",   kind: "luck", mult: 5,     rolls: 15, desc: "x5 luck for 15 rolls" },
    heavenly:  { name: "Heavenly Potion",   icon: "✨", cost: 3000,    group: "luck",   kind: "luck", mult: 25,    rolls: 10, desc: "x25 luck for 10 rolls" },
    rainbow:   { name: "Rainbow Potion",    icon: "🌈", cost: 6000,    group: "luck",   kind: "luck", mult: 10,    rolls: 100, desc: "x10 luck for 100 rolls" },
    starlight: { name: "Starlight Elixir",  icon: "🌟", cost: 8000,    group: "luck",   kind: "luck", mult: 60,    rolls: 8,  desc: "x60 luck for 8 rolls" },
    godly:     { name: "Godly Potion",      icon: "👑", cost: 20000,   group: "luck",   kind: "luck", mult: 200,   rolls: 5,  desc: "x200 luck for 5 rolls" },
    voidess:   { name: "Void Essence",      icon: "🕳️", cost: 45000,   group: "luck",   kind: "luck", mult: 500,   rolls: 4,  desc: "x500 luck for 4 rolls" },
    zenith:    { name: "Zenith Potion",     icon: "🌌", cost: 100000,  group: "luck",   kind: "luck", mult: 1000,  rolls: 3,  desc: "x1000 luck for 3 rolls" },
    oblivion:  { name: "Oblivion Draught",  icon: "🌑", cost: 400000,  group: "luck",   kind: "luck", mult: 5000,  rolls: 2,  desc: "x5000 luck for 2 rolls" },
    infinity:  { name: "Infinity Serum",    icon: "♾️", cost: 2000000, group: "luck",   kind: "luck", mult: 25000, rolls: 1,  desc: "x25000 luck for a single roll" },
    celestial: { name: "Celestial Nectar",  icon: "🪐", cost: 10000000, group: "luck",  kind: "luck", mult: 100000, rolls: 2, desc: "x100,000 luck for 2 rolls" },
    destiny:   { name: "Potion of Destiny", icon: "🌠", cost: 100000000, group: "luck", kind: "luck", mult: 10000000, rolls: 1, desc: "x10,000,000 luck for a single roll. The best potion money can buy." },
    blessing:  { name: "Daily Blessing",    icon: "🎁", cost: 0,       group: "luck",   kind: "luck", mult: 50,    rolls: 1,  desc: "x50 luck for one roll. Only from the daily gift.", daily: true },
    secret:    { name: "Elixir of the Million", icon: "🗝️", cost: 1000000, group: "luck", kind: "luck", mult: 1000000, rolls: 1, desc: "x1,000,000 luck for a single roll. The shop never advertised this.", secret: true },
    everything:{ name: "Potion of Everything", icon: "⚗️", cost: 5000000, group: "luck", kind: "everything", mult: 50000, rolls: 3, collector: true,
                 desc: "Every kind of potion in one bottle: x50,000 luck, always shiny, Epic or better and x100 coins for 3 rolls, Time Warp speed, and a Godslayer Tonic, Steel Wall and Phoenix Feather for your next bot fight." },
    /* Magnets and shiny */
    magnet:    { name: "Rarity Magnet",     icon: "🧲", cost: 2500,    group: "special", kind: "floor", min: 1000,  rolls: 5,  desc: "Your next 5 rolls can't be Common or Uncommon" },
    epicmagnet:{ name: "Epic Magnet",       icon: "🧿", cost: 15000,   group: "special", kind: "floor", min: 10000, rolls: 3,  desc: "Your next 3 rolls are Epic or better" },
    lure:      { name: "Legend Lure",       icon: "🪝", cost: 150000,  group: "special", kind: "floor", min: 100000, rolls: 2, desc: "Your next 2 rolls are Legendary or better" },
    shimmer:   { name: "Shimmer Potion",    icon: "💫", cost: 2000,    group: "special", kind: "shiny", mult: 2,  rolls: 10, desc: "x2 shiny chance for 10 rolls" },
    prism:     { name: "Prism Potion",      icon: "💠", cost: 25000,   group: "special", kind: "shiny", mult: 10, rolls: 5,  desc: "Your next 5 rolls are shiny whenever the aura has a shiny form" },
    /* Coins and speed */
    gold:      { name: "Gold Potion",       icon: "💰", cost: 250,     group: "coins",  kind: "gold", mult: 2,  rolls: 30, desc: "x2 coins from rolls for 30 rolls" },
    midas:     { name: "Midas Tonic",       icon: "🏆", cost: 1200,    group: "coins",  kind: "gold", mult: 5,  rolls: 20, desc: "x5 coins from rolls for 20 rolls" },
    rush:      { name: "Golden Rush",       icon: "💎", cost: 3000,    group: "coins",  kind: "gold", mult: 10, rolls: 10, desc: "x10 coins from rolls for 10 rolls" },
    treasure:  { name: "Treasure Tonic",    icon: "🪙", cost: 8000,    group: "coins",  kind: "gold", mult: 25, rolls: 10, desc: "x25 coins from rolls for 10 rolls" },
    hoard:     { name: "Dragon's Hoard",    icon: "🐉", cost: 40000,   group: "coins",  kind: "gold", mult: 100, rolls: 5, desc: "x100 coins from rolls for 5 rolls" },
    monstrous: { name: "Monstrous Potion",  icon: "👹", cost: 0,        group: "coins",  kind: "gold", mult: 2000, rolls: 1, doubloon: true, desc: "x2,000 coins from a single roll. Only from the Doubloon shop." },
    haste:     { name: "Haste Potion",      icon: "⚡", cost: 200,     group: "coins",  kind: "haste", div: 2, seconds: 60,  desc: "Roll cooldown halved for 60 seconds" },
    blitz:     { name: "Blitz Potion",      icon: "🌀", cost: 800,     group: "coins",  kind: "haste", div: 4, seconds: 120, desc: "Roll cooldown quartered for 2 minutes" },
    timewarp:  { name: "Time Warp",         icon: "⏳", cost: 5000,    group: "coins",  kind: "haste", div: 8, seconds: 90,  desc: "Roll cooldown cut to 1/8 for 90 seconds" },
    mystery:   { name: "Mystery Potion",    icon: "❓", cost: 1000,    group: "coins",  kind: "mystery", maxCost: 2000000, desc: "Turns into a random potion. Usually cheap, sometimes amazing." },
    megamystery:{ name: "Mega Mystery Potion", icon: "🎲", cost: 10000, group: "coins", kind: "mystery", minCost: 1000, maxCost: 10000000, desc: "Turns into a random potion worth at least 1,000 coins. It might even be a Celestial Nectar!" },
    /* Battle */
    heal:      { name: "Healing Potion",    icon: "❤️", cost: 100,     group: "battle", kind: "heal", pct: 0.4,  desc: "Restore 40% HP during a bot fight" },
    greatheal: { name: "Greater Healing",   icon: "💖", cost: 300,     group: "battle", kind: "heal", pct: 0.8,  desc: "Restore 80% HP during a bot fight" },
    fullheal:  { name: "Full Restore",      icon: "💝", cost: 1000,    group: "battle", kind: "heal", pct: 1,    desc: "Restore all your HP during a bot fight" },
    strength:  { name: "Strength Potion",   icon: "💪", cost: 150,     group: "battle", kind: "strength", mult: 1.5, desc: "+50% damage in your next bot fight" },
    titan:     { name: "Titan's Brew",      icon: "🦾", cost: 500,     group: "battle", kind: "strength", mult: 2,   desc: "+100% damage in your next bot fight" },
    rage:      { name: "Rage Potion",       icon: "😡", cost: 2000,    group: "battle", kind: "strength", mult: 3,   desc: "+200% damage in your next bot fight" },
    godslayer: { name: "Godslayer Tonic",   icon: "☄️", cost: 10000,   group: "battle", kind: "strength", mult: 5,   desc: "+400% damage in your next bot fight" },
    ironskin:  { name: "Iron Skin",         icon: "🛡️", cost: 400,     group: "battle", kind: "shield", pct: 0.3, desc: "Start your next bot fight with a shield worth 30% of your HP" },
    steelwall: { name: "Steel Wall",        icon: "🧱", cost: 1500,    group: "battle", kind: "shield", pct: 0.6, desc: "Start your next bot fight with a shield worth 60% of your HP" },
    secondwind:{ name: "Second Wind",       icon: "🕊️", cost: 1500,    group: "battle", kind: "revive", pct: 0.4, desc: "Survive a killing blow once in your next bot fight and come back at 40% HP" },
    phoenix:   { name: "Phoenix Feather",   icon: "🪶", cost: 6000,    group: "battle", kind: "revive", pct: 1,   desc: "Survive a killing blow once in your next bot fight and come back at full HP" }
  };
  var POTION_ORDER = Object.keys(POTIONS);
  /* The shop's "Buy amount" choices. Max buys as many as the coins cover. */
  var BUY_AMOUNTS = [1, 2, 5, 10, 100, 1000, "max"];
  /* How many potions one click uses (the quickbar/shop "Use" buttons). */
  var USE_AMOUNTS = [1, 2, 5, 10, 50, 100, 1000, 10000, 100000, "max"];
  /* Healing potions (Healing, Greater Healing and Full Restore together) a player can carry. */
  var MAX_HEALS = 3;
  var POTION_GROUPS = [["luck", "Luck potions"], ["special", "Magnets and shiny potions"], ["coins", "Coins and speed"], ["battle", "Battle potions"]];

  /* Daily gift ladder: day 1..7 of a streak. Coins scale up with every completed week. */
  var DAILY_COOLDOWN_MS = 20 * 60 * 60 * 1000;
  var DAILY_STREAK_WINDOW_MS = 48 * 60 * 60 * 1000;
  var DAILY_LADDER = [
    { coins: 300,  potions: { blessing: 1 } },
    { coins: 500,  potions: { blessing: 1, clover: 1 } },
    { coins: 800,  potions: { blessing: 1, gold: 1 } },
    { coins: 1200, potions: { blessing: 1, fortune: 1 } },
    { coins: 1800, potions: { blessing: 1, haste: 1, greatheal: 1 } },
    { coins: 2500, potions: { blessing: 1, heavenly: 1 } },
    { coins: 5000, potions: { blessing: 2, godly: 1, mystery: 1 } }
  ];

  var LOADOUT_SIZE = 4;
  var DEFAULT_LOADOUT = [0, 1, 2, 3];

  var BOTS = [
    { id: "dummy",     name: "Training Dummy", icon: "🪵", power: 15,   reward: 25 },
    { id: "rookie",    name: "Rookie Bot",     icon: "🤖", power: 45,   reward: 60 },
    { id: "guard",     name: "Guard Bot",      icon: "🛡️", power: 120,  reward: 150 },
    { id: "knight",    name: "Knight Bot",     icon: "⚔️", power: 300,  reward: 400 },
    { id: "warlord",   name: "Warlord Bot",    icon: "👹", power: 600,  reward: 900 },
    { id: "titan",     name: "Titan Bot",      icon: "🗿", power: 1000, reward: 1800 },
    { id: "celestial", name: "Celestial Bot",  icon: "👼", power: 1500, reward: 3500 },
    { id: "void",      name: "Void Bot",       icon: "🕳️", power: 2200, reward: 7000 },
    { id: "omega",     name: "Omega Bot",      icon: "💀", power: 3000, reward: 15000, boss: true },
    { id: "inferno",   name: "Inferno Bot",    icon: "🔥", power: 4000,  reward: 25000 },
    { id: "glacier",   name: "Glacier Bot",    icon: "🧊", power: 5000,  reward: 40000 },
    { id: "tempest",   name: "Tempest Bot",    icon: "⛈️", power: 6500,  reward: 65000 },
    { id: "phantom",   name: "Phantom Bot",    icon: "👻", power: 8000,  reward: 100000 },
    { id: "dragon",    name: "Dragon Bot",     icon: "🐉", power: 10000, reward: 160000, boss: true },
    { id: "eternity",  name: "Eternity Bot",   icon: "♾️", power: 13000, reward: 250000, boss: true },
    { id: "nova",      name: "Nova Bot",       icon: "✴️", power: 16000,  reward: 300000 },
    { id: "kraken",    name: "Kraken Bot",     icon: "🦑", power: 19000,  reward: 400000 },
    { id: "sentinel",  name: "Sentinel Prime", icon: "🛰️", power: 22000,  reward: 500000 },
    { id: "hydra",     name: "Cyber Hydra",    icon: "🐍", power: 25000,  reward: 650000 },
    { id: "grim",      name: "Grim Bot",       icon: "⚰️", power: 28000,  reward: 800000 },
    { id: "colossus",  name: "Colossus Bot",   icon: "⛰️", power: 31000,  reward: 1000000 },
    { id: "stormtitan",name: "Storm Titan",    icon: "🌪️", power: 35000,  reward: 1250000 },
    { id: "abyss",     name: "Abyss Lord",     icon: "🦇", power: 39000,  reward: 1500000, boss: true },
    { id: "solar",     name: "Solar Bot",      icon: "☀️", power: 43000,  reward: 2000000 },
    { id: "lunar",     name: "Lunar Bot",      icon: "🌙", power: 48000,  reward: 2500000 },
    { id: "galaxy",    name: "Galaxy Bot",     icon: "🌌", power: 53000,  reward: 3000000 },
    { id: "chrono",    name: "Chrono Bot",     icon: "⏳", power: 58000,  reward: 4000000 },
    { id: "quantum",   name: "Quantum Bot",    icon: "⚛️", power: 64000,  reward: 5000000 },
    { id: "overlord",  name: "Overlord Bot",   icon: "👁️", power: 72000,  reward: 7000000, boss: true },
    { id: "creator",   name: "Creator Bot",    icon: "✨", power: 120000, reward: 10000000, boss: true }
  ];

  /* ---------- The Tower: 120 floors of bots fought with your equipped aura, paying doubloons. First clear of a
     floor each 3-day cycle pays big; later clears pay 1/100 as much. ---------- */
  var TOWER_FLOORS = 120;
  var TOWER_CYCLE_MS = 3 * 24 * 60 * 60 * 1000;
  var TOWER_BAND_NAMES = ["Initiate", "Sentry", "Warrior", "Knight", "Champion", "Warlord", "Overlord", "Archon", "Celestial", "Void", "Cosmic", "Eternal"];
  var TOWER_ICONS = ["🗿", "🤺", "🛡️", "⚔️", "🏹", "🪓", "👹", "👺", "🐲", "👾", "🌑", "🌌", "☄️", "⚡", "🔥", "❄️", "🦾", "💀", "🧿", "⭐"];
  function towerBand(floor) { return Math.min(12, Math.max(1, Math.ceil(floor / 10))); }
  /* Repeat reward grows by band: 12, 23, 34, … 133. First clear pays 100× that: 1,200, 2,300, … 13,300. */
  function towerRepeat(floor) { return 11 * towerBand(floor) + 1; }
  function towerFirst(floor) { return 100 * towerRepeat(floor); }
  function towerPower(floor) { return Math.round(24 * Math.pow(1.076, floor)); }
  var TOWER = (function () {
    var kits = BOTS.map(function (b) { return b.id; }), out = [];
    for (var f = 1; f <= TOWER_FLOORS; f++) {
      out.push({ floor: f, name: "Floor " + f + " · " + TOWER_BAND_NAMES[towerBand(f) - 1], icon: TOWER_ICONS[(f - 1) % TOWER_ICONS.length], power: towerPower(f), kitId: kits[(f - 1) % kits.length] });
    }
    return out;
  })();

  /* Start a new 3-day cycle if the last one has run out (keeps `best` so you don't re-climb from 1). Returns
     true if a reset just happened. */
  function towerCheckReset() {
    var now = Date.now();
    if (!S.tower.cycleStart) { S.tower.cycleStart = now; return false; }
    if (now - S.tower.cycleStart >= TOWER_CYCLE_MS) {
      S.tower.cycleStart += Math.floor((now - S.tower.cycleStart) / TOWER_CYCLE_MS) * TOWER_CYCLE_MS;
      S.tower.cleared = {};
      return true;
    }
    return false;
  }
  function towerResetIn() { return Math.max(0, (S.tower.cycleStart || Date.now()) + TOWER_CYCLE_MS - Date.now()); }
  /* The ONE floor you may fight right now: the next one up from your unbroken run of clears this cycle
     (floor 1 right after a reset). You climb strictly in order — first, then second, then third — one at a
     time; a floor you've already cleared this cycle is locked until the 3-day reset re-opens the whole Tower. */
  function towerReachable() {
    var n = 0;
    while (n < TOWER_FLOORS && S.tower.cleared[n + 1]) n++;
    return Math.min(TOWER_FLOORS, n + 1);
  }

  var AUTO_UNLOCK_COST = 1000;
  var PVP_WIN_REWARD = 500;
  var PVP_LOSS_REWARD = 100;
  function trainingCost(level) { return Math.floor(50 * Math.pow(1.35, level)); }
  /* Levels one Train click buys with the shop's Buy amount, and what they cost together (Max: as many as
     the coins cover). */
  function trainingPlan() {
    var amt = S.settings.buyAmount, want = amt === "max" ? 10000 : amt, levels = 0, cost = 0;
    while (levels < want) {
      var next = trainingCost(S.training + levels);
      if (amt === "max" && cost + next > S.coins) break;
      cost += next;
      levels++;
    }
    return { levels: levels, cost: cost };
  }
  function secretUnlocked() { return !!S.secretUnlocked || S.coins >= 1000000; }

  /* The collector's potion (Potion of Everything) appears once every other shop potion has been bought at
     least once, apart from these three. */
  var COLLECTION_SKIP = ["celestial", "destiny", "secret"];
  function collectionKeys() {
    return POTION_ORDER.filter(function (k) { return !POTIONS[k].daily && !POTIONS[k].collector && !POTIONS[k].doubloon && COLLECTION_SKIP.indexOf(k) < 0; });
  }
  function collectionMissing() { return collectionKeys().filter(function (k) { return !(S.bought[k] > 0); }); }
  function collectionDone() { return collectionMissing().length === 0; }

  /* ---------- State ---------- */

  function defaultState() {
    return {
      coins: 100,
      rolls: 0,
      inventory: {},
      shinyInventory: {},
      equipped: null,
      equippedShiny: false,
      lastRoll: null,
      lastShiny: false,
      potions: {},
      bought: {},
      giftsOpened: [],
      luckEffects: [],
      goldEffects: [],
      floorEffects: [],
      shinyEffects: [],
      hasteUntil: 0,
      hasteDiv: 2,
      strengthMult: 1,
      shieldReady: 0,
      reviveReady: 0,
      daily: { last: 0, streak: 0, claims: 0 },
      training: 0,
      autoUnlocked: false,
      secretUnlocked: false,
      loadouts: {},
      playerName: "",
      botWins: {},
      doubloons: 0,
      tower: { best: 0, cleared: {}, cycleStart: 0 },
      aurasLockedUntil: 0,
      history: [],
      stats: { best: null, bestShiny: false, shinies: 0, won: 0, lost: 0, pvpWon: 0, pvpLost: 0, earned: 0, streak: 0, bestStreak: 0, cutscenes: 0, giftsSent: 0, giftsReceived: 0, towerWins: 0 },
      settings: { sound: true, skipCutscenes: false, skipAnims: false, buyAmount: 1, useAmount: 1 }
    };
  }

  try {
    var startupAccounts = readAccounts(); /* also migrates accounts from the password version */
    currentUser = localStorage.getItem(SESSION_KEY) || null;
    if (currentUser && !startupAccounts[currentUser]) currentUser = null;
  } catch (e) { currentUser = null; }
  var S = load();

  function load() {
    var base = defaultState();
    try {
      var raw = localStorage.getItem(saveKey()) || (!currentUser ? localStorage.getItem("aura-realms-save-v1") : null);
      if (!raw) return base;
      return hydrate(JSON.parse(raw));
    } catch (e) {
      return base;
    }
  }

  function hydrate(saved) {
    var base = defaultState();
    try {
      if (!saved || typeof saved !== "object") return base;
      var merged = Object.assign(base, saved);
      merged.stats = Object.assign(defaultState().stats, saved.stats || {});
      merged.settings = Object.assign(defaultState().settings, saved.settings || {});
      if (BUY_AMOUNTS.indexOf(merged.settings.buyAmount) < 0) merged.settings.buyAmount = 1;
      if (USE_AMOUNTS.indexOf(merged.settings.useAmount) < 0) merged.settings.useAmount = 1;
      if (!merged.loadouts || typeof merged.loadouts !== "object") merged.loadouts = {};
      merged.daily = Object.assign(defaultState().daily, saved.daily || {});
      if (!Array.isArray(merged.goldEffects)) merged.goldEffects = [];
      if (saved.goldRolls > 0) merged.goldEffects.push({ mult: 2, rolls: saved.goldRolls });
      if (!Array.isArray(merged.floorEffects)) merged.floorEffects = [];
      if (!Array.isArray(merged.shinyEffects)) merged.shinyEffects = [];
      /* Rarity Magnet rolls used to be a bare count, always with a Rare floor. */
      if (saved.floorRolls > 0) merged.floorEffects.push({ min: 1000, rolls: saved.floorRolls });
      if (saved.strengthReady) merged.strengthMult = Math.max(merged.strengthMult || 1, 1.5);
      if (!merged.shinyInventory || typeof merged.shinyInventory !== "object") merged.shinyInventory = {};
      if (!merged.bought || typeof merged.bought !== "object") merged.bought = {};
      if (!Array.isArray(merged.giftsOpened)) merged.giftsOpened = [];
      if (typeof merged.doubloons !== "number" || !(merged.doubloons >= 0)) merged.doubloons = Math.max(0, Math.floor(Number(merged.doubloons) || 0));
      if (!merged.tower || typeof merged.tower !== "object") merged.tower = { best: 0, cleared: {}, cycleStart: 0 };
      if (!merged.tower.cleared || typeof merged.tower.cleared !== "object") merged.tower.cleared = {};
      merged.tower.best = Math.max(0, Math.min(TOWER_FLOORS, Math.floor(Number(merged.tower.best) || 0)));
      merged.tower.cycleStart = Math.floor(Number(merged.tower.cycleStart) || 0);
      merged.aurasLockedUntil = Math.max(0, Math.floor(Number(merged.aurasLockedUntil) || 0));
      trimHeals(merged);
      /* History entries used to be bare ids; they are now { id, shiny }. */
      merged.history = (Array.isArray(merged.history) ? merged.history : []).map(function (h) { return typeof h === "number" ? { id: h, shiny: false } : h; }).filter(function (h) { return h && A.byId(h.id); });
      delete merged.goldRolls;
      delete merged.floorRolls;
      delete merged.strengthReady;
      return merged;
    } catch (e) {
      return base;
    }
  }

  /* Saves from before the healing potion limit can carry more than MAX_HEALS: keep the strongest ones and
     turn the rest back into the coins they cost. */
  function trimHeals(st) {
    if (!st.potions || typeof st.potions !== "object") return;
    var keys = POTION_ORDER.filter(function (k) { return POTIONS[k].kind === "heal"; }).sort(function (a, b) { return POTIONS[b].pct - POTIONS[a].pct; });
    var left = MAX_HEALS, refund = 0, removed = 0;
    keys.forEach(function (k) {
      var n = Math.max(0, Math.floor(Number(st.potions[k]) || 0)), keep = Math.min(n, left);
      left -= keep;
      if (n > keep) { refund += (n - keep) * POTIONS[k].cost; removed += n - keep; }
      if (st.potions[k] !== undefined) st.potions[k] = keep;
    });
    if (!removed) return;
    st.coins = (Number(st.coins) || 0) + refund;
    setTimeout(function () { toast("❤️ You can carry " + MAX_HEALS + " healing potions now, so " + fmt(removed) + " extra were turned back into " + fmt(refund) + " coins.", "gold", 8000); }, 1200);
  }

  function healsOwned() { return healKeys().reduce(function (n, k) { return n + (S.potions[k] || 0); }, 0); }
  /* Room for more of a potion: healing potions are capped at MAX_HEALS together, everything else is unlimited. */
  function potionRoom(key) { return POTIONS[key].kind === "heal" ? Math.max(0, MAX_HEALS - healsOwned()) : Infinity; }
  /* Add up to `n` of a potion, as many as there is room for. Returns how many were added. */
  function addPotion(key, n) {
    var k = Math.min(n, potionRoom(key));
    if (k > 0) S.potions[key] = (S.potions[key] || 0) + k;
    return Math.max(0, k);
  }

  function save() {
    saveLocal();
    cloudChanged();
  }

  /* Write the save to this browser only, without queueing an upload. */
  function saveLocal() {
    try { localStorage.setItem(saveKey(), JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
  }

  /* ---------- Helpers ---------- */

  function toast(msg, cls, ms) {
    var el = document.createElement("div");
    el.className = "toast" + (cls ? " " + cls : "");
    el.textContent = msg;
    $("#toasts").appendChild(el);
    setTimeout(function () { el.remove(); }, ms || 2900);
  }

  /* A red toast carrying one of the game's error codes (see ERR). */
  function errorToast(code, msg) {
    toast("⚠️ Error " + code + ": " + msg, "err", 5000);
  }

  function currentLuck() {
    var luck = 1;
    S.luckEffects.forEach(function (e) { if (e.mult > luck) luck = e.mult; });
    return luck;
  }

  function hasteActive() { return Date.now() < S.hasteUntil; }
  function rollCooldown() { return hasteActive() ? ROLL_COOLDOWN / (S.hasteDiv || 2) : ROLL_COOLDOWN; }

  function currentGoldMult() {
    var m = 1;
    S.goldEffects.forEach(function (e) { if (e.mult > m) m = e.mult; });
    return m;
  }

  function currentShinyMult() {
    var m = 1;
    S.shinyEffects.forEach(function (e) { if (e.mult > m) m = e.mult; });
    return m;
  }

  /* The lowest rarity a magnet potion allows right now (0 when none is active). The strongest magnet wins. */
  function currentFloor() {
    var min = 0;
    S.floorEffects.forEach(function (e) { if (e.min > min) min = e.min; });
    return min;
  }

  /* One roll passes for a list of roll-counted effects; finished ones drop off. */
  function countDown(list) {
    list.forEach(function (e) { e.rolls--; });
    return list.filter(function (e) { return e.rolls > 0; });
  }

  /* The potion of a kind whose `field` matches a stored value, e.g. which shield potion set shieldReady. */
  function potionMatching(kind, field, value) {
    for (var i = 0; i < POTION_ORDER.length; i++) {
      var p = POTIONS[POTION_ORDER[i]];
      if (p.kind === kind && p[field] === value) return p;
    }
    return null;
  }

  /* ---------- Shiny helpers ---------- */
  function owns(id, shiny) { return ((shiny ? S.shinyInventory : S.inventory)[id] || 0) > 0; }
  function ownsAny(id) { return owns(id, false) || owns(id, true); }
  function isShiny(aura, shiny) { return !!(shiny && aura && aura.shiny); }
  function effRarity(aura, shiny) { return isShiny(aura, shiny) ? aura.shinyRarity : aura.rarity; }
  function auraPower(aura, shiny) { return isShiny(aura, shiny) ? aura.shinyPower : aura.power; }
  function auraCoins(aura, shiny) { return isShiny(aura, shiny) ? aura.shinyCoins : aura.coins; }
  function auraLabel(aura, shiny) { return (isShiny(aura, shiny) ? "✨ Shiny " : "") + aura.name; }
  function oddsText(aura, shiny) { return A.formatOdds(effRarity(aura, shiny)) + (isShiny(aura, shiny) ? " · ✨×" + aura.shiny : ""); }
  /* A shiny-capable aura rolls shiny 1 time in its multiplier, so a shiny's true odds are its normal odds × the multiplier. */
  function rollShiny(aura) { return !!aura.shiny && Math.random() < Math.min(1, currentShinyMult() / aura.shiny); }

  function equippedAura() {
    if (S.equipped === null || S.equipped === undefined) return null;
    if (!owns(S.equipped, !!S.equippedShiny)) return null;
    return A.byId(S.equipped);
  }
  function equippedShiny() { return isShiny(equippedAura(), S.equippedShiny); }

  function playerPower() {
    var aura = equippedAura();
    return (aura ? auraPower(aura, S.equippedShiny) : 0) + S.training * 10;
  }

  function recordBest(aura, shiny) {
    var best = S.stats.best !== null ? A.byId(S.stats.best) : null;
    if (!best || effRarity(best, S.stats.bestShiny) < effRarity(aura, shiny)) { S.stats.best = aura.id; S.stats.bestShiny = isShiny(aura, shiny); }
  }

  /* Slot indices (0-5, or 0-6 for an aura with an extra move) of the chosen abilities for an aura. */
  function loadoutFor(aura) {
    var raw = S.loadouts[aura.id], size = K.kitFor(aura).length;
    var clean = Array.isArray(raw) ? raw.filter(function (i, pos) { return Number.isInteger(i) && i >= 0 && i < size && raw.indexOf(i) === pos; }).slice(0, LOADOUT_SIZE) : [];
    return clean.length ? clean : DEFAULT_LOADOUT.slice();
  }

  function kitAbility(fighter, id) {
    for (var i = 0; i < fighter.kit.length; i++) if (fighter.kit[i].id === id) return fighter.kit[i];
    return null;
  }

  function addCoins(n) {
    S.coins += n;
    S.stats.earned += n;
  }

  function tierName(aura) { return A.tierOf(aura).name; }

  function shineLevel(aura) {
    var t = A.TIERS.indexOf(A.tierOf(aura));
    if (t >= 8) return 3;
    if (t >= 4) return 2;
    if (t >= 2) return 1;
    return 0;
  }

  function conicOf(colors) {
    return "conic-gradient(from 0deg, " + colors.concat([colors[0]]).join(", ") + ")";
  }

  function fillStyle(aura) {
    var c = aura.colors;
    var layers = [];
    if (c.length > 2) layers.push("radial-gradient(circle at 70% 72%, " + c[2] + " 0%, transparent 45%)");
    if (c.length > 3) layers.push("radial-gradient(circle at 28% 68%, " + c[3] + " 0%, transparent 40%)");
    if (c.length > 4) layers.push("radial-gradient(circle at 62% 28%, " + c[4] + " 0%, transparent 35%)");
    layers.push(conicOf(c));
    return layers.join(", ");
  }

  function setOrb(el, aura, shiny) {
    el.classList.toggle("is-shiny", isShiny(aura, shiny));
    el.style.setProperty("--c1", aura.c1);
    el.style.setProperty("--c2", aura.c2);
    var paint = el.querySelector(".orb-paint");
    if (paint) paint.style.background = fillStyle(aura);
    el.className = el.className.replace(/\b(tier|shine)-\S+/g, "").replace(/\s+/g, " ").trim() + " tier-" + aura.tier + " shine-" + shineLevel(aura);
    if (!el.querySelector(".orb-sparkle")) { var sp = document.createElement("div"); sp.className = "orb-sparkle"; el.appendChild(sp); }
  }

  function makeOrb(aura, cls, shiny) {
    var el = document.createElement("div");
    el.className = "orb " + (cls || "");
    el.innerHTML = "<div class=\"orb-fill\"><div class=\"orb-paint\"></div></div><div class=\"orb-core\"></div><div class=\"orb-gloss\"></div><div class=\"orb-sparkle\"></div>";
    setOrb(el, aura, shiny);
    return el;
  }

  function makeSwatch(aura) {
    var sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.setProperty("--c1", aura.c1);
    sw.style.setProperty("--c2", aura.c2);
    sw.style.background = conicOf(aura.colors);
    return sw;
  }

  function setNameStyle(el, aura, shiny) {
    el.className = "roll-name t-" + aura.tier;
    el.style.backgroundImage = "";
    if (isShiny(aura, shiny)) { el.classList.add("shiny-name"); return; }
    if (shineLevel(aura) >= 2) {
      el.classList.add("shine");
      el.style.backgroundImage = "linear-gradient(90deg, " + aura.colors.concat([aura.colors[0]]).join(", ") + ")";
    }
  }

  /* ---------- Sound ---------- */

  var Sound = {
    ctx: null,
    get: function () {
      if (!S.settings.sound) return null;
      try {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === "suspended") this.ctx.resume();
        return this.ctx;
      } catch (e) { return null; }
    },
    tone: function (freq, start, dur, type, vol) {
      var c = this.get();
      if (!c) return;
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = type || "sine";
      o.frequency.value = freq;
      var t0 = c.currentTime + start;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.08, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    },
    roll: function () { this.tone(520, 0, 0.07, "square", 0.025); },
    shiny: function () { var s = this; [1568, 2093, 2637, 3136, 2637, 3520].forEach(function (f, i) { s.tone(f, i * 0.07, 0.35, "sine", 0.045); }); },
    tick: function (freq) { this.tone(freq, 0, 0.05, "square", 0.02); },
    boom: function (level) { this.tone(60, 0, 0.6, "sawtooth", 0.06 + level * 0.02); this.tone(90, 0.02, 0.4, "square", 0.04); },
    rare: function (level) {
      var self = this;
      [523, 659, 784, 1047, 1319, 1568].slice(0, 2 + level).forEach(function (f, i) { self.tone(f, i * 0.09, 0.6, "triangle", 0.07); });
    },
    cosmic: function () {
      var self = this;
      [196, 247, 294, 392, 494, 587].forEach(function (f, i) { self.tone(f, 0.3 + i * 0.2, 4.5, "sine", 0.045); });
      [1047, 1319, 1568, 2093, 2637].forEach(function (f, i) { self.tone(f, 3.2 + i * 0.1, 1.8, "triangle", 0.06); });
    },
    fury: function () {
      var self = this;
      this.tone(55, 0, 6, "sawtooth", 0.07);
      this.tone(58, 0, 6, "sawtooth", 0.04);
      [110, 82, 65, 55].forEach(function (f, i) { self.tone(f, 2.9 + i * 0.18, 1.6, "square", 0.08); });
    },
    win: function () { var s = this; [523, 659, 784, 1047].forEach(function (f, i) { s.tone(f, i * 0.09, 0.35, "triangle", 0.07); }); },
    lose: function () { var s = this; [300, 250, 200].forEach(function (f, i) { s.tone(f, i * 0.15, 0.4, "sawtooth", 0.05); }); },
    hit: function (crit) { this.tone(crit ? 220 : 150, 0, 0.1, "square", 0.04); },
    /* A soft falling hiss while a snapped fighter turns to dust. */
    dust: function (seconds) { for (var i = 0; i < 8; i++) this.tone(1100 - i * 110, i * seconds / 8, 0.3, "triangle", 0.02); },
    heal: function () { this.tone(660, 0, 0.2, "sine", 0.05); this.tone(990, 0.12, 0.25, "sine", 0.05); },
    ability: function (arch) {
      var s = this;
      switch (arch) {
        case "strike": s.tone(900, 0, 0.08, "sawtooth", 0.03); s.tone(600, 0.06, 0.1, "sawtooth", 0.03); break;
        case "heavy": s.tone(80, 0.25, 0.4, "square", 0.07); s.tone(50, 0.3, 0.5, "sawtooth", 0.06); break;
        case "guard": s.tone(440, 0, 0.3, "triangle", 0.05); s.tone(660, 0.1, 0.3, "triangle", 0.04); break;
        case "heal": s.tone(660, 0, 0.3, "sine", 0.05); s.tone(880, 0.15, 0.3, "sine", 0.05); s.tone(1320, 0.3, 0.4, "sine", 0.04); break;
        case "precision": s.tone(1200, 0, 0.3, "sine", 0.03); s.tone(1800, 0.42, 0.15, "square", 0.05); break;
        case "drain": s.tone(220, 0, 0.6, "sawtooth", 0.04); s.tone(165, 0.2, 0.5, "sawtooth", 0.04); break;
        case "focus": [330, 415, 523, 659].forEach(function (f, i) { s.tone(f, i * 0.12, 0.35, "triangle", 0.04); }); break;
        case "poison": s.tone(300, 0, 0.3, "square", 0.03); s.tone(180, 0.4, 0.4, "sawtooth", 0.04); break;
        case "weaken": s.tone(400, 0, 0.6, "sine", 0.05); s.tone(300, 0.2, 0.6, "sine", 0.05); s.tone(200, 0.4, 0.6, "sine", 0.05); break;
        case "stun": s.tone(2000, 0.18, 0.08, "square", 0.05); s.tone(100, 0.2, 0.4, "sawtooth", 0.07); break;
        case "reflect": s.tone(1500, 0, 0.2, "sine", 0.04); s.tone(2200, 0.1, 0.3, "sine", 0.03); break;
        case "burst": s.tone(60, 0.3, 0.8, "sawtooth", 0.09); s.tone(1000, 0.3, 0.2, "square", 0.04); break;
        case "barrage": [0, 0.2, 0.4].forEach(function (d) { s.tone(700, d, 0.08, "square", 0.03); s.tone(250, d + 0.25, 0.12, "sawtooth", 0.04); }); break;
        case "execute": s.tone(1400, 0, 0.3, "sawtooth", 0.03); s.tone(70, 0.35, 0.6, "square", 0.08); break;
        case "shield": s.tone(523, 0, 0.4, "triangle", 0.04); s.tone(784, 0.15, 0.4, "triangle", 0.04); break;
        case "snap": s.tone(2600, 0, 0.04, "square", 0.08); s.tone(1300, 0.02, 0.06, "square", 0.05); s.tone(45, 0.3, 1.3, "sawtooth", 0.1); s.tone(90, 0.32, 1, "square", 0.06); break;
        case "destiny": [523, 659, 784, 1047].forEach(function (f, i) { s.tone(f, i * 0.08, 0.5, "triangle", 0.06); }); s.tone(40, 0.4, 1.6, "sawtooth", 0.11); s.tone(80, 0.42, 1.3, "square", 0.07); break;
        default: s.tone(600, 0, 0.1, "square", 0.03);
      }
    },
    buy: function () { this.tone(880, 0, 0.1, "triangle", 0.06); this.tone(1320, 0.08, 0.15, "triangle", 0.06); }
  };

  /* ---------- HUD and shared renders ---------- */

  function renderHUD() {
    $("#hud-coins").textContent = fmt(S.coins);
    $("#hud-luck").textContent = "x" + fmt(currentLuck());
    $("#hud-rolls").textContent = fmt(S.rolls);
    $("#hud-power").textContent = fmt(playerPower());
    $("#hud-doubloons").textContent = fmt(S.doubloons || 0);
  }

  function renderEffects() {
    var box = $("#active-effects");
    box.innerHTML = "";
    if (aurasLocked()) {
      var lk = document.createElement("span");
      lk.className = "effect locked-effect";
      lk.textContent = "🚫🔒 Auras locked (swearing) · " + aurasLockText();
      box.appendChild(lk);
    }
    S.luckEffects.forEach(function (e) {
      var el = document.createElement("span");
      el.className = "effect";
      el.textContent = "🍀 x" + fmt(e.mult) + " luck · " + e.rolls + " roll" + (e.rolls === 1 ? "" : "s");
      box.appendChild(el);
    });
    S.goldEffects.forEach(function (e) {
      var g = document.createElement("span");
      g.className = "effect gold";
      g.textContent = "💰 x" + e.mult + " coins · " + e.rolls + " roll" + (e.rolls === 1 ? "" : "s");
      box.appendChild(g);
    });
    S.shinyEffects.forEach(function (e) {
      var sp = potionMatching("shiny", "mult", e.mult);
      var el = document.createElement("span");
      el.className = "effect";
      el.textContent = (sp ? sp.icon : "💫") + " x" + fmt(e.mult) + " shiny chance · " + e.rolls + " roll" + (e.rolls === 1 ? "" : "s");
      box.appendChild(el);
    });
    S.floorEffects.forEach(function (e) {
      var fp = potionMatching("floor", "min", e.min);
      var fl = document.createElement("span");
      fl.className = "effect";
      fl.textContent = (fp ? fp.icon : "🧲") + " " + tierName({ rarity: e.min }) + " or better · " + e.rolls + " roll" + (e.rolls === 1 ? "" : "s");
      box.appendChild(fl);
    });
    if (hasteActive()) {
      var hp = potionMatching("haste", "div", S.hasteDiv);
      var h = document.createElement("span");
      h.className = "effect haste";
      h.textContent = (hp ? hp.icon + " " + hp.name.replace(/ Potion$/, "") : "⚡ Haste") + " · " + Math.ceil((S.hasteUntil - Date.now()) / 1000) + "s";
      box.appendChild(h);
    }
    if (S.strengthMult > 1) {
      var st = document.createElement("span");
      st.className = "effect strength";
      st.textContent = "💪 +" + Math.round((S.strengthMult - 1) * 100) + "% damage next fight";
      box.appendChild(st);
    }
    if (S.shieldReady > 0) {
      var sh = document.createElement("span");
      sh.className = "effect strength";
      sh.textContent = readyLabel("shield", S.shieldReady, "🛡️ Iron Skin") + " ready";
      box.appendChild(sh);
    }
    if (S.reviveReady > 0) {
      var rv = document.createElement("span");
      rv.className = "effect strength";
      rv.textContent = readyLabel("revive", S.reviveReady, "🕊️ Second Wind") + " ready";
      box.appendChild(rv);
    }
  }

  /* Icon and name of the shield or revive potion waiting for the next fight. */
  function readyLabel(kind, pct, fallback) {
    var p = potionMatching(kind, "pct", pct);
    return p ? p.icon + " " + p.name : fallback;
  }
  function waitingName(kind, pct) {
    var p = potionMatching(kind, "pct", pct);
    return p ? p.name : "A stronger potion";
  }

  function renderQuickbar() {
    var bar = $("#quickbar");
    bar.innerHTML = "";
    document.querySelectorAll("#use-amount [data-qty]").forEach(function (b) { b.classList.toggle("active", b.dataset.qty === String(S.settings.useAmount)); });
    var any = false;
    POTION_ORDER.forEach(function (key) {
      var n = S.potions[key] || 0;
      if (!n) return;
      any = true;
      var p = POTIONS[key];
      var el = document.createElement("button");
      el.className = "qp";
      el.title = p.desc;
      el.innerHTML = "<span>" + p.icon + "</span><span>" + p.name + "</span><span class=\"count\">x" + n + "</span>";
      el.addEventListener("click", function () { usePotion(key); });
      bar.appendChild(el);
    });
    if (!any) bar.innerHTML = "<div class=\"empty\">No potions yet. Visit the Shop.</div>";
    $("#use-amount").classList.toggle("hidden", !any);
  }

  function renderHistory() {
    var ul = $("#history");
    ul.innerHTML = "";
    S.history.forEach(function (h) {
      var a = A.byId(h.id), sh = isShiny(a, h.shiny);
      var li = document.createElement("li");
      if (sh) li.classList.add("shiny-row");
      var name = document.createElement("span");
      name.textContent = auraLabel(a, sh);
      var tier = document.createElement("span");
      tier.className = "tierlabel t-" + a.tier;
      tier.textContent = tierName(a);
      var odds = document.createElement("span");
      odds.className = "odds";
      odds.textContent = oddsText(a, sh);
      li.appendChild(makeSwatch(a)); li.appendChild(name); li.appendChild(tier); li.appendChild(odds);
      ul.appendChild(li);
    });
  }

  /* A redraw rebuilds the cards and their buttons, and auto roll redraws after every roll. While a mouse
     button or finger is down the redraw waits until the click has gone through; otherwise the press would
     land on a button that was just replaced and the click would be lost. */
  var press = 0, pressedAt = 0, redrawPending = false;
  function pressSettled(id) {
    if (id !== press) return;
    pressedAt = 0;
    if (redrawPending) renderAll();
  }
  document.addEventListener("pointerdown", function () { press++; pressedAt = Date.now(); }, true);
  document.addEventListener("click", function () { var id = press; setTimeout(function () { pressSettled(id); }, 0); }, true);
  document.addEventListener("pointercancel", function () { var id = press; setTimeout(function () { pressSettled(id); }, 0); }, true);
  document.addEventListener("pointerup", function () { var id = press; setTimeout(function () { pressSettled(id); }, 350); }, true);

  function renderAll() {
    if (pressedAt && Date.now() - pressedAt < 1500) { redrawPending = true; return; }
    redrawPending = false;
    renderHUD();
    renderEffects();
    renderQuickbar();
    renderDaily();
    renderHistory();
    renderInventory();
    renderAbilities();
    renderShop();
    renderBots();
    renderPvpPanel();
    updateIndex();
    renderStats();
    $("#btn-auto").textContent = "Auto Roll: " + (autoOn ? "On" : "Off");
    $("#btn-auto").classList.toggle("on", autoOn);
  }

  /* ---------- Rolling ---------- */

  var busy = false;
  var cooldownUntil = 0;
  var autoOn = false;
  var spinTimer = null;

  var floorLists = {};
  /* `floor` is the lowest rarity allowed (0 for none). If nothing at or above it hits, one of the auras
     just above the floor is picked. */
  function pickAura(luck, floor) {
    var list = A.byRarityDesc;
    for (var i = 0; i < list.length; i++) {
      if (floor && list[i].rarity < floor) break;
      var p = Math.min(1, luck / list[i].rarity);
      if (Math.random() < p) return list[i];
    }
    if (floor) {
      if (!floorLists[floor]) floorLists[floor] = A.list.filter(function (a) { return a.rarity >= floor && a.rarity < floor * 2; });
      return floorLists[floor][Math.floor(Math.random() * floorLists[floor].length)];
    }
    return A.list[0];
  }

  function canRoll() { return !busy && Date.now() >= cooldownUntil && !battle && !CS.running && !aurasLocked(); }

  function showAura(aura, shiny) {
    var orb = $("#orb");
    setOrb(orb, aura, shiny);
    orb.classList.remove("spinning", "pop");
    void orb.offsetWidth;
    orb.classList.add("pop");
    var nameEl = $("#roll-name");
    nameEl.textContent = auraLabel(aura, shiny);
    setNameStyle(nameEl, aura, shiny);
    $("#roll-tier").textContent = (isShiny(aura, shiny) ? "Shiny · " : "") + tierName(aura) + " · " + fmt(auraPower(aura, shiny)) + " power";
    $("#roll-odds").textContent = oddsText(aura, shiny);
    $("#btn-equip-last").disabled = false;
  }

  /* ---------- Roll stage effects (particles, beams, flashes) ---------- */

  var FX = (function () {
    var canvas = $("#stage-fx");
    var ctx = canvas.getContext("2d");
    var stage = $("#roll-stage");
    var parts = [], orbit = [], beams = { on: false, colors: [], level: 0 }, raf = 0, running = false, last = 0;

    var cachedCenter = null, lastLayout = 0;
    function resize() {
      var r = stage.getBoundingClientRect();
      if (r.width && (canvas.width !== Math.round(r.width) || canvas.height !== Math.round(r.height))) {
        canvas.width = Math.round(r.width);
        canvas.height = Math.round(r.height);
      }
      cachedCenter = null;
    }
    /* Layout reads are throttled: the orb only moves on resize or tab switches. */
    function center() {
      var now = performance.now();
      if (!cachedCenter || now - lastLayout > 400) {
        var o = $("#orb").getBoundingClientRect(), r = stage.getBoundingClientRect();
        cachedCenter = { x: o.left - r.left + o.width / 2, y: o.top - r.top + o.height / 2, r: o.width / 2 };
        lastLayout = now;
      }
      return cachedCenter;
    }
    function start() { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } }
    function burst(colors, n, power) {
      resize();
      var c = center();
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2, sp = (120 + Math.random() * 380) * power;
        parts.push({ x: c.x + Math.cos(a) * c.r * 0.6, y: c.y + Math.sin(a) * c.r * 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60 * power,
          life: 1, decay: 0.45 + Math.random() * 0.7, size: 1.5 + Math.random() * 3 * power, color: colors[Math.floor(Math.random() * colors.length)], spark: Math.random() < 0.3 });
      }
      start();
    }
    function ring(color, power) {
      resize();
      var c = center();
      parts.push({ ring: true, x: c.x, y: c.y, rad: c.r, vr: 500 * power, life: 1, decay: 1.1, color: color, width: 6 * power });
      start();
    }
    function ambient(aura, tierIdx) {
      resize();
      orbit = [];
      beams.on = tierIdx >= 4;
      beams.colors = aura.colors;
      beams.level = tierIdx;
      if (tierIdx >= 3) {
        var n = tierIdx >= 7 ? 70 : tierIdx >= 4 ? 44 : 18;
        for (var i = 0; i < n; i++) {
          orbit.push({ a: Math.random() * Math.PI * 2, dist: 1.2 + Math.random() * 0.7, tilt: 0.35 + Math.random() * 0.5, speed: (0.25 + Math.random() * 0.5) * (Math.random() < 0.5 ? 1 : -1),
            size: 1 + Math.random() * 2, color: aura.colors[Math.floor(Math.random() * aura.colors.length)], phase: Math.random() * 6 });
        }
      }
      if (orbit.length || beams.on) start();
    }
    function clear() {
      parts = []; orbit = []; beams.on = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    function frame(now) {
      /* rAF timestamps can be slightly earlier than the moment start() ran, so never step backwards. */
      var dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = Math.max(last, now);
      try { draw(now, dt); } catch (e) { parts = []; }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      if (parts.length || orbit.length || beams.on) raf = requestAnimationFrame(frame);
      else { running = false; ctx.clearRect(0, 0, canvas.width, canvas.height); }
    }
    function draw(now, dt) {
      if (now - lastLayout > 400) resize();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var c = center();
      if (beams.on) {
        var n = beams.level >= 7 ? 18 : 12;
        var len = Math.max(canvas.width, canvas.height);
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.globalCompositeOperation = "lighter";
        for (var k = 0; k < n; k++) {
          var ang = now / (beams.level >= 7 ? 2500 : 4500) * Math.PI * 2 * (k % 2 ? 1 : -1) + k * Math.PI * 2 / n;
          var col = beams.colors[k % beams.colors.length];
          var g = ctx.createLinearGradient(0, 0, Math.cos(ang) * len, Math.sin(ang) * len);
          g.addColorStop(0, col);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.globalAlpha = 0.16 + 0.08 * Math.sin(now / 300 + k);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(ang - 0.05) * len, Math.sin(ang - 0.05) * len);
          ctx.lineTo(Math.cos(ang + 0.05) * len, Math.sin(ang + 0.05) * len);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = "lighter";
      orbit.forEach(function (o) {
        o.a += o.speed * dt;
        var x = c.x + Math.cos(o.a) * o.dist * c.r, y = c.y + Math.sin(o.a) * o.dist * c.r * o.tilt;
        var tw = 0.45 + 0.55 * Math.sin(now / 180 + o.phase);
        ctx.fillStyle = o.color;
        ctx.globalAlpha = tw * 0.25;
        ctx.beginPath();
        ctx.arc(x, y, o.size * 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = tw;
        ctx.beginPath();
        ctx.arc(x, y, o.size, 0, Math.PI * 2);
        ctx.fill();
      });
      parts = parts.filter(function (p) { return p.life > 0; });
      parts.forEach(function (p) {
        p.life -= p.decay * dt;
        if (p.ring) {
          p.rad += p.vr * dt;
          ctx.globalAlpha = Math.max(0, p.life) * 0.8;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.width * p.life;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0, p.rad), 0, Math.PI * 2);
          ctx.stroke();
          return;
        }
        p.vy += 160 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.985;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.spark ? "#fff" : p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0, p.size * (0.4 + p.life * 0.6)), 0, Math.PI * 2);
        ctx.fill();
      });
    }
    window.addEventListener("resize", resize);
    return { burst: burst, ring: ring, ambient: ambient, clear: clear, resize: resize };
  })();

  function tierIndex(aura) { return A.TIERS.indexOf(A.tierOf(aura)); }

  function screenFlash(aura, power) {
    var el = $("#stage-flash");
    el.style.background = "radial-gradient(circle at 50% 40%, rgba(255,255,255," + (0.9 * power) + ") 0%, " + aura.c1 + " 25%, " + aura.c2 + " 55%, rgba(0,0,0,0) 80%)";
    el.classList.remove("go");
    void el.offsetWidth;
    el.classList.add("go");
  }

  /* Shake the game content and overlays — never document.body, because a transform on body (or any ancestor of
     a position:fixed element) re-anchors the full-screen cinematic to the page instead of the viewport, which
     made it jump by the scroll offset mid-animation. */
  var SHAKE_SELECTORS = ["main", "header"];
  function shakeTargets() { return SHAKE_SELECTORS.map(function (sel) { return document.querySelector(sel); }).filter(Boolean); }
  function shake(level) {
    if (!level) return;
    var els = shakeTargets();
    els.forEach(function (el) { el.classList.remove("shake-1", "shake-2", "shake-3"); });
    void document.body.offsetWidth;
    els.forEach(function (el) { el.classList.add("shake-" + level); });
    setTimeout(function () { shakeTargets().forEach(function (el) { el.classList.remove("shake-" + level); }); }, 1000);
  }

  function showBanner(aura, ti, shiny) {
    var b = $("#roll-banner");
    b.className = "roll-banner";
    var sh = isShiny(aura, shiny);
    if (ti < 2 && !sh) { b.textContent = ""; return; }
    b.textContent = sh ? "✨ Shiny " + tierName(aura) + " ✨" : "✦ " + tierName(aura) + " ✦";
    b.classList.add("t-" + aura.tier);
    if (sh) b.classList.add("shiny-banner");
    void b.offsetWidth;
    b.classList.add(ti >= 4 ? "big" : "go");
  }

  function setGlow(aura, ti) {
    var g = $("#stage-glow");
    g.classList.remove("pulse");
    if (!aura || ti < 3) { g.style.setProperty("--glow", "0"); return; }
    g.style.background = "radial-gradient(ellipse at 50% 32%, " + aura.c1 + " 0%, " + aura.c2 + " 28%, rgba(0,0,0,0) 62%)";
    g.style.setProperty("--glow", ti >= 7 ? "0.6" : ti >= 4 ? "0.5" : "0.32");
    if (ti >= 4) g.classList.add("pulse");
  }

  /* Persistent look of the stage for the aura currently shown (used after a reveal and on load). */
  function stageAmbient(aura, shiny) {
    var ti = tierIndex(aura), sh = isShiny(aura, shiny);
    setGlow(aura, ti);
    FX.ambient(aura, ti);
    var b = $("#roll-banner");
    b.className = "roll-banner";
    if (ti >= 2 || sh) { b.textContent = sh ? "✨ Shiny " + tierName(aura) + " ✨" : "✦ " + tierName(aura) + " ✦"; b.classList.add("t-" + aura.tier, ti >= 4 ? "big" : "go"); if (sh) b.classList.add("shiny-banner"); }
    else b.textContent = "";
  }

  var tierPools = {};
  function spinPool(ti) {
    if (!tierPools[ti]) {
      var keys = [A.TIERS[ti].key, A.TIERS[Math.max(0, ti - 1)].key];
      tierPools[ti] = A.list.filter(function (a) { return keys.indexOf(a.tier) >= 0; });
    }
    return tierPools[ti];
  }

  /* Cycle random aura names on the orb. Rare and above slow down like a slot machine and
     drift toward the rolled tier near the end, so the player can feel it coming. */
  function runSpin(aura, ti, duration, done) {
    var orb = $("#orb"), nameEl = $("#roll-name"), paint = orb.querySelector(".orb-paint");
    var slow = ti >= 2;
    orb.classList.add("spinning");
    var start = performance.now();
    function tick() {
      var p = Math.min(1, (performance.now() - start) / duration);
      if (p >= 1) { stopSpin(); done(); return; }
      var a = (slow && p > 0.6) ? spinPool(ti)[Math.floor(Math.random() * spinPool(ti).length)] : A.list[Math.floor(Math.random() * A.list.length)];
      nameEl.textContent = a.name;
      nameEl.className = "roll-name t-" + a.tier;
      nameEl.style.backgroundImage = "";
      orb.style.setProperty("--c1", a.c1);
      paint.style.background = fillStyle(a);
      if (slow) Sound.tick(220 + p * p * 700);
      spinTimer = setTimeout(tick, slow ? 45 + Math.pow(p, 2.2) * 330 : 55);
    }
    tick();
  }

  function stopSpin() {
    clearTimeout(spinTimer);
    spinTimer = null;
    $("#orb").classList.remove("spinning");
  }

  var RAINBOW = ["#ff6b6b", "#ffd93d", "#6bff95", "#6bd8ff", "#b06bff"];
  function revealEffects(aura, ti, shiny) {
    if (S.settings.skipAnims) { if (ti >= 2) { showBanner(aura, ti, shiny); setGlow(aura, ti); } return; }
    if (isShiny(aura, shiny)) {
      FX.burst(RAINBOW.concat(["#ffffff"]), 140, 0.9);
      FX.ring("#ffd93d", 0.8);
      setTimeout(function () { FX.ring("#6bd8ff", 0.6); }, 140);
      Sound.shiny();
      if (ti < 2) { showBanner(aura, ti, true); return; }
    }
    if (ti < 2) return;
    var power = ti === 2 ? 0.5 : ti === 3 ? 0.8 : ti >= 7 ? 1.4 : 1.1;
    screenFlash(aura, power);
    FX.burst(aura.colors, ti === 2 ? 50 : ti === 3 ? 130 : ti >= 7 ? 420 : 260, power);
    FX.ring(aura.c1, power);
    if (ti >= 4) { FX.ring(aura.colors[2] || aura.c2, power * 0.7); setTimeout(function () { FX.ring("#ffffff", power * 0.5); }, 180); }
    showBanner(aura, ti, shiny);
    setGlow(aura, ti);
    FX.ambient(aura, ti);
    shake(ti === 3 ? 1 : ti >= 7 ? 3 : ti >= 4 ? 2 : 0);
    if (ti >= 4) Sound.boom(ti - 4);
    else Sound.rare(ti - 2);
  }

  function doRoll(forced, forcedShiny) {
    if (!canRoll()) return;
    busy = true;
    $("#btn-roll").disabled = true;
    Sound.roll();

    var aura = forced || pickAura(currentLuck(), currentFloor());
    var ti = tierIndex(aura);
    var shiny = forcedShiny === undefined ? rollShiny(aura) : isShiny(aura, forcedShiny);

    S.rolls++;
    if (!forced) {
      S.luckEffects = countDown(S.luckEffects);
      S.floorEffects = countDown(S.floorEffects);
      S.shinyEffects = countDown(S.shinyEffects);
    }
    var mult = currentGoldMult();
    S.goldEffects = countDown(S.goldEffects);
    var coins = auraCoins(aura, shiny) * mult;
    addCoins(coins);
    var bag = shiny ? S.shinyInventory : S.inventory;
    bag[aura.id] = (bag[aura.id] || 0) + 1;
    if (shiny) S.stats.shinies = (S.stats.shinies || 0) + 1;
    S.lastRoll = aura.id;
    S.lastShiny = shiny;
    S.history.unshift({ id: aura.id, shiny: shiny });
    if (S.history.length > 12) S.history.length = 12;
    recordBest(aura, shiny);
    if (equippedAura() === null) { S.equipped = aura.id; S.equippedShiny = shiny; }
    var cutscene = ti >= 3 && !S.settings.skipCutscenes && !S.settings.skipAnims;
    if (cutscene) S.stats.cutscenes++;
    save();

    FX.clear();
    setGlow(null, 0);
    $("#roll-banner").className = "roll-banner";
    var spinMs = S.settings.skipAnims ? 120 : ti <= 1 ? (hasteActive() ? 250 : 450) : ti === 2 ? 1100 : ti === 3 ? 1600 : 2200;
    var stage = $("#roll-stage");
    runSpin(aura, ti, spinMs, function () {
      var finish = function () {
        stage.classList.remove("suspense");
        showAura(aura, shiny);
        revealEffects(aura, ti, shiny);
        toast((shiny ? "✨ SHINY ×" + aura.shiny + "! " : "") + "+" + fmt(coins) + " coins", "gold");
        renderAll();
        busy = false;
        cooldownUntil = Date.now() + rollCooldown();
        setTimeout(function () { $("#btn-roll").disabled = false; }, Math.max(0, cooldownUntil - Date.now()));
      };
      if (cutscene) {
        /* Epic and rarer: a beat of suspense, then the screen is taken over. */
        stage.classList.add("suspense");
        $("#roll-name").textContent = "…";
        $("#roll-name").className = "roll-name";
        setTimeout(function () { playCutscene(aura, false, shiny).then(finish); }, 650);
      } else {
        finish();
      }
    });
  }

  setInterval(function () {
    if (autoOn && canRoll()) requestRoll();
  }, 200);

  setInterval(function () {
    if (hasteActive() || $("#active-effects").querySelector(".haste")) renderEffects();
  }, 1000);

  /* ---------- Daily gift ---------- */

  function dailyReady() { return Date.now() - (S.daily.last || 0) >= DAILY_COOLDOWN_MS; }

  function formatWait(ms) {
    var h = Math.floor(ms / 3600000), m = Math.ceil((ms % 3600000) / 60000);
    if (m === 60) { h++; m = 0; }
    return h > 0 ? h + "h " + m + "m" : m + "m";
  }

  function dailyReward(streak) {
    var day = ((Math.max(1, streak) - 1) % DAILY_LADDER.length);
    var weeks = Math.floor((Math.max(1, streak) - 1) / DAILY_LADDER.length);
    var base = DAILY_LADDER[day];
    return { day: day + 1, coins: Math.round(base.coins * (1 + weeks * 0.5)), potions: base.potions };
  }

  function renderDaily() {
    var sub = $("#daily-sub"), btn = $("#btn-daily");
    var nextStreak = (Date.now() - (S.daily.last || 0) <= DAILY_STREAK_WINDOW_MS) ? S.daily.streak + 1 : 1;
    var r = dailyReward(nextStreak);
    var list = Object.keys(r.potions).map(function (k) { return POTIONS[k].icon + " " + POTIONS[k].name + (r.potions[k] > 1 ? " x" + r.potions[k] : ""); }).join(" + ");
    if (dailyReady()) {
      sub.textContent = "Day " + r.day + " of 7 · " + fmt(r.coins) + " coins + " + list;
      btn.disabled = false;
      btn.textContent = "Claim";
      $("#daily-card").classList.add("ready");
    } else {
      sub.textContent = "Next gift in " + formatWait(S.daily.last + DAILY_COOLDOWN_MS - Date.now()) + " · streak " + S.daily.streak + " · tomorrow: " + fmt(r.coins) + " coins + " + list;
      btn.disabled = true;
      btn.textContent = "Claimed";
      $("#daily-card").classList.remove("ready");
    }
  }

  function claimDaily() {
    if (!dailyReady()) { toast("Come back in " + formatWait(S.daily.last + DAILY_COOLDOWN_MS - Date.now()), "bad"); return; }
    var now = Date.now();
    S.daily.streak = (now - (S.daily.last || 0) <= DAILY_STREAK_WINDOW_MS) ? S.daily.streak + 1 : 1;
    S.daily.last = now;
    S.daily.claims = (S.daily.claims || 0) + 1;
    var r = dailyReward(S.daily.streak);
    addCoins(r.coins);
    var lines = ["+" + fmt(r.coins) + " coins"];
    Object.keys(r.potions).forEach(function (k) {
      var got = addPotion(k, r.potions[k]);
      if (got) lines.push(POTIONS[k].icon + " " + POTIONS[k].name + (got > 1 ? " x" + got : ""));
      else lines.push(POTIONS[k].icon + " no " + POTIONS[k].name + " (you already carry " + MAX_HEALS + " healing potions)");
    });
    Sound.win();
    toast("🎁 Daily gift day " + r.day + ": " + lines.join(" · "), "gold");
    FX.burst(["#fde68a", "#f59e0b", "#fff7ed", "#a78bfa"], 90, 0.7);
    save();
    renderAll();
  }

  setInterval(function () { if (!dailyReady()) renderDaily(); }, 30000);

  /* ---------- Potions ---------- */

  /* Kinds where using more than one at once gives no benefit (only the strongest waiting one applies), so the
     Use amount is ignored and one is used. */
  var ONE_SHOT_KINDS = { strength: 1, shield: 1, revive: 1, everything: 1 };

  function usePotion(key) {
    var p = POTIONS[key];
    if (!p) return;
    var owned = S.potions[key] || 0;
    if (!owned) { errorToast(ERR.POTION_USE, "You have no " + p.name + " left."); return; }

    /* Healing potions are drunk during a fight, one at a time; the Use amount doesn't apply. */
    if (p.kind === "heal") {
      if (!battle || battle.over || view.pvp) { errorToast(ERR.POTION_USE, "Healing potions are used during a bot fight."); return; }
      healInBattle(key);
      return;
    }

    var useAmt = S.settings.useAmount;
    var want = useAmt === "max" ? owned : (USE_AMOUNTS.indexOf(useAmt) >= 0 ? useAmt : 1);
    var n = ONE_SHOT_KINDS[p.kind] ? 1 : Math.min(want, owned);

    if (p.kind === "luck") {
      S.luckEffects.push({ mult: p.mult, rolls: p.rolls * n });
    } else if (p.kind === "floor") {
      S.floorEffects.push({ min: p.min, rolls: p.rolls * n });
    } else if (p.kind === "shiny") {
      S.shinyEffects.push({ mult: p.mult, rolls: p.rolls * n });
    } else if (p.kind === "gold") {
      S.goldEffects.push({ mult: p.mult, rolls: p.rolls * n });
    } else if (p.kind === "haste") {
      var active = hasteActive();
      if (active && p.div < S.hasteDiv) { errorToast(ERR.POTION_USE, "A stronger speed potion is already active."); return; }
      S.hasteUntil = (active && p.div === S.hasteDiv ? S.hasteUntil : Date.now()) + p.seconds * 1000 * n;
      S.hasteDiv = p.div;
    } else if (p.kind === "strength") {
      if (S.strengthMult >= p.mult) { errorToast(ERR.POTION_USE, "An equal or stronger damage boost is already waiting."); return; }
      S.strengthMult = p.mult;
    } else if (p.kind === "shield") {
      /* A stronger shield replaces a weaker one that is waiting; an equal or stronger one blocks it. */
      if (S.shieldReady >= p.pct) { errorToast(ERR.POTION_USE, waitingName("shield", S.shieldReady) + " is already waiting for your next fight."); return; }
      S.shieldReady = p.pct;
    } else if (p.kind === "revive") {
      if (S.reviveReady >= p.pct) { errorToast(ERR.POTION_USE, waitingName("revive", S.reviveReady) + " is already waiting for your next fight."); return; }
      S.reviveReady = p.pct;
    } else if (p.kind === "everything") {
      /* The best of each kind at once; anything already stronger stays as it is. */
      S.luckEffects.push({ mult: p.mult, rolls: p.rolls });
      S.shinyEffects.push({ mult: POTIONS.prism.mult, rolls: p.rolls });
      S.floorEffects.push({ min: POTIONS.epicmagnet.min, rolls: p.rolls });
      S.goldEffects.push({ mult: POTIONS.hoard.mult, rolls: p.rolls });
      var warp = POTIONS.timewarp;
      S.hasteUntil = (hasteActive() && S.hasteDiv === warp.div ? S.hasteUntil : Date.now()) + warp.seconds * 1000;
      S.hasteDiv = Math.max(S.hasteDiv, warp.div);
      S.strengthMult = Math.max(S.strengthMult, POTIONS.godslayer.mult);
      S.shieldReady = Math.max(S.shieldReady, POTIONS.steelwall.pct);
      S.reviveReady = Math.max(S.reviveReady, POTIONS.phoenix.pct);
    } else if (p.kind === "mystery") {
      var tally = {}, distinct = 0;
      for (var i = 0; i < n; i++) { var won = rollMysteryPotion(p); if (addPotion(won, 1)) { if (!tally[won]) distinct++; tally[won] = (tally[won] || 0) + 1; } }
      S.potions[key] -= n;
      Sound.buy();
      if (n === 1) {
        var only = Object.keys(tally)[0];
        toast(p.icon + " The " + p.name + " became " + (only ? POTIONS[only].icon + " " + POTIONS[only].name : "nothing") + "!", "gold", 5000);
      } else if (distinct <= 4) {
        var list = Object.keys(tally).map(function (k) { return POTIONS[k].icon + " " + fmt(tally[k]) + " " + POTIONS[k].name; }).join(", ");
        toast(p.icon + " Opened " + fmt(n) + " " + p.name + "s: " + list, "gold", 7000);
      } else {
        toast(p.icon + " Opened " + fmt(n) + " " + p.name + "s into " + fmt(distinct) + " kinds of potion! Check your potions.", "gold", 7000);
      }
      save();
      renderAll();
      return;
    }

    S.potions[key] -= n;
    Sound.buy();
    toast(p.icon + " " + (n > 1 ? "Used " + fmt(n) + " x " + p.name : p.name + " used"));
    save();
    renderAll();
  }

  /* Mystery potion odds: mostly cheap potions, with a small shot at the great ones. The mystery potion's
     `minCost` and `maxCost` bound which potions it can become. */
  function rollMysteryPotion(m) {
    /* never a healing potion when there's no room to carry it */
    var pool = POTION_ORDER.filter(function (k) { var q = POTIONS[k]; return q.kind !== "mystery" && !q.daily && !q.secret && !q.collector && !q.doubloon && q.cost >= (m.minCost || 0) && q.cost <= (m.maxCost || Infinity) && potionRoom(k) > 0; });
    var weights = pool.map(function (k) { return 1 / Math.sqrt(POTIONS[k].cost + 100); });
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
    return pool[0];
  }

  /* How many of a potion one Buy click gets: the chosen Buy amount, or for Max as many as the coins cover. */
  function buyCount(p, key) {
    var amt = S.settings.buyAmount, n;
    if (amt === "max") n = p.cost > 0 ? Math.floor(S.coins / p.cost) : 1;
    else n = BUY_AMOUNTS.indexOf(amt) >= 0 ? amt : 1;
    return Math.min(n, potionRoom(key));
  }

  function buyPotion(key) {
    var p = POTIONS[key];
    if (!p) return;
    if (p.collector && !collectionDone()) return;
    if (potionRoom(key) < 1) { errorToast(ERR.POTION_BUY, "You can only carry " + MAX_HEALS + " healing potions. Use one in a bot fight first."); return; }
    var n = buyCount(p, key), total = n * p.cost;
    if (n < 1 || S.coins < total) { errorToast(ERR.POTION_BUY, "Not enough coins for " + (n > 1 ? fmt(n) + " x " : "") + p.name + " (" + fmt(n > 1 ? total : p.cost) + " needed)."); return; }
    var wasDone = collectionDone();
    S.coins -= total;
    addPotion(key, n);
    S.bought[key] = (S.bought[key] || 0) + n;
    Sound.buy();
    var capped = p.kind === "heal" && typeof S.settings.buyAmount === "number" && S.settings.buyAmount > n;
    toast("Bought " + (n > 1 ? fmt(n) + " x " + p.name + " for " + fmt(total) + " coins" : p.name) + (capped ? " (you can carry " + MAX_HEALS + " healing potions)" : ""));
    if (!wasDone && collectionDone()) {
      var ev = POTIONS.everything;
      toast(ev.icon + " You bought every potion! A new one appeared in the shop: " + ev.name, "gold", 7000);
      Sound.rare(1);
    }
    save();
    renderAll();
  }

  function renderShop() {
    document.querySelectorAll("#buy-amount [data-qty]").forEach(function (b) { b.classList.toggle("active", b.dataset.qty === String(S.settings.buyAmount)); });
    var shop = $("#shop-grid");
    shop.innerHTML = "";
    POTION_GROUPS.forEach(function (gr) {
      var h = document.createElement("h3");
      h.className = "section-title sub";
      h.textContent = gr[1];
      shop.appendChild(h);
      var grid = document.createElement("div");
      grid.className = "card-grid";
      grid.id = "shop-" + gr[0];
      shop.appendChild(grid);
    });
    POTION_ORDER.forEach(function (key) {
      var p = POTIONS[key];
      if (p.daily || p.doubloon) return; /* doubloon-only potions are sold in the Tower's Doubloon shop, not here */
      var grid = $("#shop-" + p.group);
      var card = document.createElement("div");
      card.className = "card";
      if (p.secret && !secretUnlocked()) {
        card.className = "card secret";
        card.innerHTML = "<div class=\"row\"><div class=\"big-icon\">❔</div><div><div class=\"card-title\">? ? ?</div><div class=\"card-sub\">A potion the shop keeps under the counter. Rumour says it shows itself to anyone holding a million coins, or anyone who knows the right word.</div></div></div>";
        grid.appendChild(card);
        return;
      }
      if (p.collector && !collectionDone()) {
        var need = collectionKeys(), missing = collectionMissing();
        card.className = "card secret";
        card.innerHTML = "<div class=\"row\"><div class=\"big-icon\">🔒</div><div><div class=\"card-title\">? ? ?</div><div class=\"card-sub\">A potion only true collectors ever see. Buy every potion in the shop at least once to make it appear (Celestial Nectar, Potion of Destiny and the Elixir of the Million don't count).</div></div></div>" +
          "<div class=\"collect-progress\"><div class=\"card-sub\"><b>Bought " + (need.length - missing.length) + " of " + need.length + "</b> · still to buy:</div><div class=\"collect-missing\">" +
          missing.map(function (k) { return "<span title=\"" + POTIONS[k].name + "\">" + POTIONS[k].icon + "</span>"; }).join("") + "</div></div>";
        grid.appendChild(card);
        return;
      }
      card.innerHTML =
        "<div class=\"row\"><div class=\"big-icon\">" + p.icon + "</div><div><div class=\"card-title\">" + p.name + "</div><div class=\"card-sub\">" + p.desc + "</div></div></div>" +
        "<div class=\"row\"><span class=\"price\">" + fmt(p.cost) + " coins</span><span class=\"card-sub\">owned: " + fmt(S.potions[key] || 0) + "</span></div>";
      var n = buyCount(p, key), full = p.kind === "heal" && potionRoom(key) < 1;
      if (p.kind === "heal") {
        var carry = document.createElement("div");
        carry.className = "card-sub";
        carry.textContent = "Carrying " + healsOwned() + " / " + MAX_HEALS + " healing potions";
        card.appendChild(carry);
      }
      if (S.settings.buyAmount !== 1 && !full) {
        var total = document.createElement("div");
        total.className = "card-sub buy-total";
        total.textContent = n > 0 ? "x" + fmt(n) + " = " + fmt(n * p.cost) + " coins" : "Not enough coins for one yet";
        card.appendChild(total);
      }
      var actions = document.createElement("div");
      actions.className = "actions";
      var buy = document.createElement("button");
      buy.className = "btn small primary" + (full || n < 1 || S.coins < n * p.cost ? " cant-afford" : "");
      buy.textContent = full ? "Full" : S.settings.buyAmount === 1 ? "Buy" : S.settings.buyAmount === "max" && n < 1 ? "Buy max" : "Buy x" + fmt(n);
      buy.addEventListener("click", function () { buyPotion(key); });
      actions.appendChild(buy);
      if (S.potions[key]) {
        var use = document.createElement("button");
        use.className = "btn small";
        use.textContent = "Use";
        use.addEventListener("click", function () { usePotion(key); });
        actions.appendChild(use);
      }
      card.appendChild(actions);
      grid.appendChild(card);
    });

    var ug = $("#upgrade-grid");
    ug.innerHTML = "";

    var tc = trainingCost(S.training), plan = trainingPlan();
    var train = document.createElement("div");
    train.className = "card";
    train.innerHTML =
      "<div class=\"row\"><div class=\"big-icon\">🏋️</div><div><div class=\"card-title\">Training · Lv " + fmt(S.training) + "</div><div class=\"card-sub\">+10 power per level, applied to any equipped aura</div></div></div>" +
      "<div class=\"row\"><span class=\"price\">" + fmtCost(tc) + " coins</span><span class=\"card-sub\">bonus: +" + fmt(S.training * 10) + "</span></div>";
    if (S.settings.buyAmount !== 1) {
      var ttotal = document.createElement("div");
      ttotal.className = "card-sub buy-total";
      ttotal.textContent = plan.levels > 0 ? "x" + fmt(plan.levels) + " levels = " + fmtCost(plan.cost) + " coins" : "Not enough coins for one level yet";
      train.appendChild(ttotal);
    }
    var ta = document.createElement("div");
    ta.className = "actions";
    var tb = document.createElement("button");
    tb.className = "btn small primary" + (plan.levels < 1 || S.coins < plan.cost ? " cant-afford" : "");
    tb.textContent = S.settings.buyAmount === 1 ? "Train" : S.settings.buyAmount === "max" && plan.levels < 1 ? "Train max" : "Train x" + fmt(plan.levels);
    tb.addEventListener("click", function () {
      var pl = trainingPlan();
      if (pl.levels < 1 || S.coins < pl.cost) {
        errorToast(ERR.POTION_BUY, "Not enough coins to train" + (pl.levels > 1 ? " " + fmt(pl.levels) + " levels" : "") + " (" + fmtCost(pl.levels > 1 ? pl.cost : trainingCost(S.training)) + " needed).");
        return;
      }
      S.coins -= pl.cost;
      S.training += pl.levels;
      Sound.buy();
      toast(pl.levels > 1 ? "Trained " + fmt(pl.levels) + " levels for " + fmt(pl.cost) + " coins: level " + fmt(S.training) + " (+" + fmt(S.training * 10) + " power)" : "Training level " + fmt(S.training) + " (+" + fmt(S.training * 10) + " power)");
      save();
      renderAll();
    });
    ta.appendChild(tb);
    train.appendChild(ta);
    ug.appendChild(train);

    var auto = document.createElement("div");
    auto.className = "card";
    auto.innerHTML =
      "<div class=\"row\"><div class=\"big-icon\">🔁</div><div><div class=\"card-title\">Auto Roll</div><div class=\"card-sub\">Rolls automatically whenever the cooldown ends</div></div></div>" +
      "<div class=\"row\"><span class=\"price\">" + (S.autoUnlocked ? "Unlocked" : fmt(AUTO_UNLOCK_COST) + " coins") + "</span></div>";
    if (!S.autoUnlocked) {
      var aa = document.createElement("div");
      aa.className = "actions";
      var ab = document.createElement("button");
      ab.className = "btn small primary" + (S.coins < AUTO_UNLOCK_COST ? " cant-afford" : "");
      ab.textContent = "Unlock";
      ab.addEventListener("click", function () {
        if (S.coins < AUTO_UNLOCK_COST) { errorToast(ERR.POTION_BUY, "Not enough coins for Auto Roll (" + fmt(AUTO_UNLOCK_COST) + " needed)."); return; }
        S.coins -= AUTO_UNLOCK_COST;
        S.autoUnlocked = true;
        Sound.buy();
        toast("Auto Roll unlocked");
        save();
        renderAll();
      });
      aa.appendChild(ab);
      auto.appendChild(aa);
    }
    ug.appendChild(auto);
  }

  /* ---------- Inventory ---------- */

  function ownedIds() {
    var ids = {};
    [S.inventory, S.shinyInventory].forEach(function (bag) { Object.keys(bag).forEach(function (id) { if (bag[id] > 0) ids[id] = true; }); });
    return Object.keys(ids).map(Number).filter(function (id) { return !!A.byId(id); });
  }

  /* A collection can hold well over a thousand auras, each with an animated orb, and building them all on
     every redraw froze phones. So the inventory is only built while its tab is open, rarest first, one page
     at a time, with a search box to find the rest. */
  var INVENTORY_PAGE = 48;
  var inventoryShown = INVENTORY_PAGE;

  function renderInventory() {
    if (!$("#tab-inventory").classList.contains("active")) return;
    var grid = $("#inventory-grid");
    grid.innerHTML = "";
    $("#inv-more").classList.add("hidden");
    if (aurasLocked()) {
      $("#inv-count").textContent = "";
      var lock = document.createElement("div");
      lock.className = "lock-card";
      lock.innerHTML = "<div class=\"lock-emoji\">🚫🔒</div>" +
        "<div class=\"lock-title\">Your auras are locked</div>" +
        "<div class=\"lock-sub\">You swore in chat, so all your auras are gone for now. They come back in <b>" + aurasLockText() + "</b>.</div>" +
        "<div class=\"card-sub\">While they're locked you can't roll, equip, sell, gift, battle, or climb the Tower. Keep the chat clean!</div>";
      grid.appendChild(lock);
      return;
    }
    var entries = [];
    ownedIds().forEach(function (id) {
      if (owns(id, false)) entries.push({ id: id, shiny: false, n: S.inventory[id] });
      if (owns(id, true)) entries.push({ id: id, shiny: true, n: S.shinyInventory[id] });
    });
    var total = entries.length, query = $("#inv-search").value.trim().toLowerCase();
    if (query) entries = entries.filter(function (en) { return auraLabel(A.byId(en.id), en.shiny).toLowerCase().indexOf(query) >= 0; });
    $("#inv-count").textContent = !total ? "" : query ? fmt(entries.length) + " of " + fmt(total) + " match" : fmt(total) + " aura" + (total === 1 ? "" : "s");
    var more = $("#inv-more");
    more.classList.toggle("hidden", entries.length <= inventoryShown);
    more.textContent = "Show more (" + fmt(Math.max(0, entries.length - inventoryShown)) + " left)";
    if (!entries.length) {
      grid.innerHTML = "<div class=\"empty-note\"></div>";
      grid.firstChild.textContent = total ? "No auras match \"" + query + "\"." : "Nothing yet. Roll to discover auras.";
      return;
    }
    entries.sort(function (x, y) { return effRarity(A.byId(y.id), y.shiny) - effRarity(A.byId(x.id), x.shiny); });
    var eq = equippedAura(), eqShiny = equippedShiny();
    entries.slice(0, inventoryShown).forEach(function (en) {
      var a = A.byId(en.id), sh = isShiny(a, en.shiny);
      var isEq = !!(eq && eq.id === en.id && eqShiny === sh);
      var card = document.createElement("div");
      card.className = "card" + (isEq ? " equipped" : "") + (sh ? " shiny-card" : "");
      var badge = document.createElement("div");
      badge.className = "count-badge" + (sh ? " shiny-badge" : "");
      badge.textContent = (sh ? "✨ ×" + a.shiny + " · " : "") + "x" + en.n;
      card.appendChild(badge);
      var row = document.createElement("div");
      row.className = "row";
      row.appendChild(makeOrb(a, "", sh));
      var info = document.createElement("div");
      var title = document.createElement("div");
      title.className = "card-title";
      title.textContent = auraLabel(a, sh);
      var tier = document.createElement("div");
      tier.className = "tierlabel t-" + a.tier;
      tier.textContent = (sh ? "Shiny " : "") + tierName(a);
      var sub = document.createElement("div");
      sub.className = "card-sub";
      sub.textContent = A.formatOdds(effRarity(a, sh)) + " · " + fmt(auraPower(a, sh)) + " power";
      info.appendChild(title); info.appendChild(tier); info.appendChild(sub);
      row.appendChild(info);
      card.appendChild(row);
      var actions = document.createElement("div");
      actions.className = "actions";
      var btn = document.createElement("button");
      btn.className = "btn small" + (isEq ? "" : " primary");
      btn.textContent = isEq ? "Equipped" : "Equip";
      btn.disabled = isEq;
      btn.addEventListener("click", function () { equip(en.id, sh); });
      actions.appendChild(btn);
      var gb = document.createElement("button");
      gb.className = "btn small";
      gb.textContent = "🎁 Gift";
      gb.addEventListener("click", function () { openGift(en.id, sh); });
      actions.appendChild(gb);
      var selb = document.createElement("button");
      selb.className = "btn small";
      selb.textContent = "💰 Sell " + fmt(sellValue(a, sh));
      selb.title = "Sell one for coins (based on its rarity)";
      selb.addEventListener("click", function () { sellAura(en.id, sh); });
      actions.appendChild(selb);
      card.appendChild(actions);
      grid.appendChild(card);
    });
  }

  /* What an aura sells for: based on its rarity (the square root of its odds), so a 1-in-a-million sells for
     ~1,000 and a 1-in-a-quadrillion for ~31 million. A shiny is worth more because its effective rarity is. */
  function sellValue(aura, shiny) { return Math.max(5, Math.round(Math.sqrt(effRarity(aura, shiny)))); }

  /* Sell one of an aura for coins. Rare or equipped-last-copy sales ask first so nothing precious goes by a slip. */
  function sellAura(id, shiny) {
    if (aurasLocked()) { toast("Your auras are locked for " + aurasLockText(), "bad"); return; }
    var a = A.byId(id); if (!a) return;
    var sh = isShiny(a, shiny), bag = sh ? S.shinyInventory : S.inventory;
    if (!(bag[id] > 0)) return;
    var val = sellValue(a, sh), eq = equippedAura();
    var isEq = !!(eq && eq.id === id && equippedShiny() === sh), lastCopy = bag[id] === 1;
    if ((val >= 1000 || (isEq && lastCopy)) &&
        !confirm("Sell " + auraLabel(a, sh) + " for " + fmt(val) + " coins?" + (isEq && lastCopy ? " It's equipped and your only one — this unequips it." : " This can't be undone."))) return;
    bag[id]--;
    if (!bag[id]) delete bag[id];
    if (isEq && !owns(id, sh)) { S.equipped = null; S.equippedShiny = false; }
    addCoins(val);
    S.stats.sold = (S.stats.sold || 0) + 1;
    Sound.buy();
    toast("💰 Sold " + auraLabel(a, sh) + " for " + fmt(val) + " coins", "gold");
    save();
    renderAll();
  }

  /* Sell every spare copy at once: keep exactly one of each aura (and one of each shiny) and sell the rest for
     coins. Keeping one means your equipped aura is never lost. Asks once, showing the total before anything sells. */
  function sellAllDuplicates() {
    if (aurasLocked()) { toast("Your auras are locked right now", "bad"); return; }
    var plan = [], coins = 0, copies = 0;
    function scan(bag, shiny) {
      Object.keys(bag).forEach(function (id) {
        var n = bag[id]; if (!(n >= 2)) return;
        var a = A.byId(id); if (!a) return;
        var extra = n - 1, val = sellValue(a, shiny) * extra;
        plan.push({ id: id, shiny: shiny, extra: extra });
        coins += val; copies += extra;
      });
    }
    scan(S.inventory, false);
    scan(S.shinyInventory, true);
    if (!plan.length) { toast("No duplicates to sell — you have one of each", "bad"); return; }
    if (!confirm("Sell " + fmt(copies) + " duplicate aura" + (copies === 1 ? "" : "s") + " for " + fmt(coins) + " coins? One of every aura is kept (so nothing you own disappears). This can't be undone.")) return;
    plan.forEach(function (p) {
      var bag = p.shiny ? S.shinyInventory : S.inventory;
      bag[p.id] = 1; /* keep exactly one */
    });
    addCoins(coins);
    S.stats.sold = (S.stats.sold || 0) + copies;
    Sound.buy();
    toast("💰 Sold " + fmt(copies) + " duplicate" + (copies === 1 ? "" : "s") + " for " + fmt(coins) + " coins", "gold");
    save();
    renderAll();
  }

  function equip(id, shiny) {
    if (aurasLocked()) { toast("Your auras are locked for " + aurasLockText(), "bad"); return; }
    if (battle && !battle.over) { toast("Finish the fight first", "bad"); return; }
    var a = A.byId(id), sh = isShiny(a, shiny) && owns(id, true);
    if (!owns(id, sh)) return;
    S.equipped = id;
    S.equippedShiny = sh;
    abilitiesViewAura = id;
    toast("Equipped " + auraLabel(a, sh));
    save();
    renderAll();
  }

  /* ---------- Abilities tab: each aura has its own kit of 6, pick 4 ---------- */

  var abilitiesViewAura = null;

  function renderAbilities() {
    var grid = $("#ability-grid");
    var sel = $("#ability-aura");
    grid.innerHTML = "";
    var ids = ownedIds();
    ids.sort(function (a, b) { return A.byId(b).rarity - A.byId(a).rarity; });
    var eq = equippedAura();
    if (abilitiesViewAura === null || !ownsAny(abilitiesViewAura)) abilitiesViewAura = eq ? eq.id : (ids.length ? ids[0] : null);
    sel.innerHTML = "";
    ids.forEach(function (id) {
      var a = A.byId(id);
      var o = document.createElement("option");
      o.value = id;
      o.textContent = a.name + " · " + tierName(a) + (eq && eq.id === id ? " (equipped)" : "");
      sel.appendChild(o);
    });
    if (abilitiesViewAura === null) {
      $("#loadout-count").textContent = "";
      grid.innerHTML = "<div class=\"empty-note\">Roll an aura first. Every aura comes with its own signature abilities.</div>";
      return;
    }
    sel.value = String(abilitiesViewAura);
    var aura = A.byId(abilitiesViewAura);
    var kit = K.kitFor(aura);
    var loadout = loadoutFor(aura);
    $("#loadout-count").textContent = loadout.length + " / " + LOADOUT_SIZE + " chosen";
    var head = $("#ability-aura-head");
    head.innerHTML = "";
    var headShiny = !!(eq && eq.id === aura.id && equippedShiny()) || (!owns(aura.id, false) && owns(aura.id, true));
    head.appendChild(makeOrb(aura, "small", headShiny));
    var ht = document.createElement("div");
    var hn = document.createElement("div"); hn.className = "card-title"; hn.textContent = auraLabel(aura, headShiny) + "'s kit";
    var hs = document.createElement("div"); hs.className = "card-sub"; hs.textContent = tierName(aura) + " · " + fmt(auraPower(aura, headShiny)) + " power" + (eq && eq.id === aura.id ? " · equipped" : " · not equipped");
    ht.appendChild(hn); ht.appendChild(hs);
    head.appendChild(ht);
    kit.forEach(function (ab, idx) {
      var slot = loadout.indexOf(idx);
      var card = document.createElement("div");
      card.className = "card" + (slot >= 0 ? " selected" : "");
      if (slot >= 0) {
        var sl = document.createElement("div");
        sl.className = "slot";
        sl.textContent = "SLOT " + (slot + 1);
        card.appendChild(sl);
      }
      var stat = ab.flat ? fmt(ab.flat) + " damage" : ab.mult > 0 ? fmt(Math.round(ab.mult * 100)) + "% power" + (ab.hits ? " x" + ab.hits : "") : "support";
      var row = document.createElement("div");
      row.className = "row";
      row.innerHTML = "<div class=\"big-icon\">" + ab.icon + "</div>";
      var info = document.createElement("div");
      var t = document.createElement("div"); t.className = "card-title"; t.textContent = ab.name;
      var sub = document.createElement("div"); sub.className = "card-sub"; sub.textContent = stat + " · " + (ab.cd ? ab.cd + " turn cooldown" : "no cooldown");
      info.appendChild(t); info.appendChild(sub);
      row.appendChild(info);
      card.appendChild(row);
      var d = document.createElement("div"); d.className = "card-sub"; d.textContent = ab.desc;
      card.appendChild(d);
      var actions = document.createElement("div");
      actions.className = "actions";
      var btn = document.createElement("button");
      btn.className = "btn small" + (slot >= 0 ? " danger" : " primary");
      btn.textContent = slot >= 0 ? "Remove" : "Choose";
      btn.addEventListener("click", function () { toggleLoadout(aura, idx); });
      actions.appendChild(btn);
      card.appendChild(actions);
      grid.appendChild(card);
    });
  }

  function toggleLoadout(aura, idx) {
    if (battle && !battle.over) { toast("Finish the fight first", "bad"); return; }
    var loadout = loadoutFor(aura);
    var i = loadout.indexOf(idx);
    if (i >= 0) {
      if (loadout.length === 1) { toast("Keep at least one ability", "bad"); return; }
      loadout.splice(i, 1);
    } else {
      if (loadout.length >= LOADOUT_SIZE) { toast("Loadout is full. Remove an ability first.", "bad"); return; }
      loadout.push(idx);
    }
    S.loadouts[aura.id] = loadout;
    save();
    renderAbilities();
  }

  /* ---------- Battle engine (pure, used for bots and PvP) ---------- */

  var Engine = {
    makeFighter: function (o) {
      return {
        name: o.name, power: o.power, maxHp: o.power * 12, hp: o.power * 12,
        kit: o.kit, abilities: o.abilities.slice(), cooldowns: {},
        guard: false, focus: false, reflect: false, stunned: false, skip: false, shield: 0, revive: 0,
        poison: null, weaken: 0, dmgMult: o.dmgMult || 1,
        auraId: o.auraId === undefined ? null : o.auraId, shiny: !!o.shiny, icon: o.icon || null, isBot: !!o.isBot
      };
    },
    create: function (a, b, first) {
      return { a: a, b: b, turn: first, round: 1, over: false, winner: null };
    },
    other: function (w) { return w === "a" ? "b" : "a"; },
    canUse: function (b, who, id) {
      var f = b[who];
      return !b.over && b.turn === who && !!kitAbility(f, id) && f.abilities.indexOf(id) >= 0 && !(f.cooldowns[id] > 0);
    },
    snapshot: function (b) {
      return {
        a: b.a, b: b.b, turn: b.turn, round: b.round, over: b.over, winner: b.winner
      };
    },
    /* True if the fighter is dead. A pending Second Wind brings them back instead. */
    dead: function (b, who, ev) {
      var f = b[who];
      if (f.hp > 0) return false;
      if (f.revive > 0) {
        f.hp = Math.round(f.maxHp * f.revive);
        f.revive = 0;
        ev.push({ type: "revive", who: who, hpA: b.a.hp, hpB: b.b.hp });
        return false;
      }
      return true;
    },
    /* Start-of-turn upkeep for the fighter whose turn it is. */
    beginTurn: function (b, who, ev) {
      var f = b[who];
      Object.keys(f.cooldowns).forEach(function (k) { if (f.cooldowns[k] > 0) f.cooldowns[k]--; });
      if (f.poison) {
        f.hp -= f.poison.dmg;
        f.poison.turns--;
        ev.push({ type: "poison", who: who, amount: f.poison.dmg, hpA: b.a.hp, hpB: b.b.hp });
        if (f.poison.turns <= 0) f.poison = null;
        if (Engine.dead(b, who, ev)) { b.over = true; b.winner = Engine.other(who); ev.push({ type: "end", winner: b.winner }); return; }
      }
      if (f.stunned) {
        f.stunned = false;
        f.skip = true;
        ev.push({ type: "stunned", who: who });
      }
    },
    /* Advance to the next fighter, skipping stunned turns. */
    advance: function (b, ev) {
      for (var guard = 0; guard < 4; guard++) {
        b.turn = Engine.other(b.turn);
        if (b.turn === "a") b.round++;
        Engine.beginTurn(b, b.turn, ev);
        if (b.over) return;
        if (b[b.turn].skip) { b[b.turn].skip = false; continue; }
        return;
      }
    },
    /* Resolve one ability use. Returns a list of events for animation. */
    act: function (b, who, id, rng) {
      rng = rng || Math.random;
      var ev = [];
      if (!Engine.canUse(b, who, id)) return ev;
      var ab = kitAbility(b[who], id);
      var me = b[who], them = b[Engine.other(who)], other = Engine.other(who);
      me.cooldowns[id] = ab.cd + 1;
      ev.push({ type: "use", who: who, ability: id, name: ab.name, icon: ab.icon });

      if (ab.effect === "heal") {
        var amt = Math.round(me.maxHp * ab.pct);
        me.hp = Math.min(me.maxHp, me.hp + amt);
        ev.push({ type: "heal", who: who, amount: amt, hpA: b.a.hp, hpB: b.b.hp });
      } else if (ab.effect === "shield") {
        me.shield = Math.round(me.maxHp * ab.shieldPct);
        ev.push({ type: "buff", who: who, effect: "shield", amount: me.shield });
      } else if (ab.effect === "guard" || ab.effect === "focus" || ab.effect === "reflect") {
        me[ab.effect] = true;
        ev.push({ type: "buff", who: who, effect: ab.effect });
      }

      if (ab.flat) {
        /* Snap, Destiny Unbound: a fixed amount of damage that guards, shields, reflects, crits and boosts don't touch. */
        them.hp -= ab.flat;
        ev.push({ type: "damage", who: who, target: other, amount: ab.flat, absorbed: 0, crit: false, blocked: false, executed: false, flat: true, flatName: ab.name, flatIcon: ab.icon, flatArch: ab.arch, hpA: b.a.hp, hpB: b.b.hp });
      }

      if (ab.mult > 0) {
        var hits = ab.hits || 1;
        for (var h = 0; h < hits && them.hp > 0 && me.hp > 0; h++) {
          var crit = ab.alwaysCrit || rng() < 0.1;
          var dmg = me.power * ab.mult * me.dmgMult * (0.85 + rng() * 0.3) * (crit ? 2 : 1);
          if (me.focus) { dmg *= 1.8; me.focus = false; ev.push({ type: "consume", who: who, effect: "focus" }); }
          if (me.weaken > 0) dmg *= 0.7;
          var executed = false;
          if (ab.executeBelow && them.hp / them.maxHp < ab.executeBelow) { dmg *= 2; executed = true; }
          var blocked = false;
          if (them.guard) { dmg *= 0.4; them.guard = false; blocked = true; }
          dmg = Math.max(1, Math.round(dmg));
          var absorbed = 0;
          if (them.shield > 0) { absorbed = Math.min(them.shield, dmg); them.shield -= absorbed; dmg -= absorbed; }
          them.hp -= dmg;
          ev.push({ type: "damage", who: who, target: other, amount: dmg, absorbed: absorbed, crit: crit, blocked: blocked, executed: executed, hpA: b.a.hp, hpB: b.b.hp });
          if (ab.lifesteal && dmg > 0) {
            var heal = Math.round(dmg * ab.lifesteal);
            me.hp = Math.min(me.maxHp, me.hp + heal);
            ev.push({ type: "heal", who: who, amount: heal, hpA: b.a.hp, hpB: b.b.hp });
          }
          if (them.reflect) {
            var back = Math.max(1, Math.round((dmg + absorbed) * 0.6));
            them.reflect = false;
            me.hp -= back;
            ev.push({ type: "reflect", who: other, target: who, amount: back, hpA: b.a.hp, hpB: b.b.hp });
          }
        }
        if (them.hp > 0) {
          if (ab.poison) { them.poison = { turns: ab.poison.turns, dmg: Math.max(1, Math.round(me.power * ab.poison.mult)) }; ev.push({ type: "debuff", who: other, effect: "poison" }); }
          if (ab.weaken) { them.weaken = ab.weaken; ev.push({ type: "debuff", who: other, effect: "weaken" }); }
          if (ab.stunChance && rng() < ab.stunChance) { them.stunned = true; ev.push({ type: "debuff", who: other, effect: "stunned" }); }
        }
      }

      if (Engine.dead(b, other, ev)) { b.over = true; b.winner = who; ev.push({ type: "end", winner: who }); return ev; }
      if (Engine.dead(b, who, ev)) { b.over = true; b.winner = other; ev.push({ type: "end", winner: other }); return ev; }

      if (me.weaken > 0) me.weaken--;
      Engine.advance(b, ev);
      return ev;
    },
    /* Simple bot brain. */
    botChoose: function (b, who, rng) {
      rng = rng || Math.random;
      var f = b[who];
      var avail = f.abilities.filter(function (id) { return Engine.canUse(b, who, id); });
      if (!avail.length) return null;
      var hpPct = f.hp / f.maxHp;
      var byArch = function (arch) { return avail.filter(function (id) { return kitAbility(f, id).arch === arch; })[0]; };
      if (hpPct < 0.35 && byArch("heal") && rng() < 0.8) return byArch("heal");
      if (!f.focus && byArch("focus") && rng() < 0.4) return byArch("focus");
      if (!f.reflect && byArch("reflect") && rng() < 0.35) return byArch("reflect");
      if (!f.shield && byArch("shield") && hpPct < 0.7 && rng() < 0.4) return byArch("shield");
      if (!f.guard && byArch("guard") && hpPct < 0.6 && rng() < 0.35) return byArch("guard");
      var weight = function (id) { var ab = kitAbility(f, id); return ab.mult * (ab.hits || 1) * (ab.executeBelow && b[Engine.other(who)].hp / b[Engine.other(who)].maxHp < ab.executeBelow ? 2 : 1); };
      var attacks = avail.filter(function (id) { return kitAbility(f, id).mult > 0; });
      if (!attacks.length) return avail[Math.floor(rng() * avail.length)];
      var total = 0;
      attacks.forEach(function (id) { total += weight(id); });
      var r = rng() * total;
      for (var i = 0; i < attacks.length; i++) { r -= weight(attacks[i]); if (r <= 0) return attacks[i]; }
      return attacks[attacks.length - 1];
    }
  };

  /* ---------- Battle ability animations (canvas over the arena) ---------- */

  var EMOJI_FONT = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
  /* The snapping hand. 🫰 is newer than some phones; those draw it as an empty box, so they get 👌 instead. */
  var snapHandGlyph = null;
  function snapHand() {
    if (snapHandGlyph) return snapHandGlyph;
    snapHandGlyph = "🫰";
    try {
      var c = document.createElement("canvas"); c.width = c.height = 32;
      var x = c.getContext("2d"); x.font = "28px " + EMOJI_FONT; x.textBaseline = "top"; x.fillText("🫰", 0, 0);
      var d = x.getImageData(0, 0, 32, 32).data, colour = false;
      for (var i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && (Math.abs(d[i] - d[i + 1]) > 20 || Math.abs(d[i + 1] - d[i + 2]) > 20)) { colour = true; break; }
      if (!colour) snapHandGlyph = "👌";
    } catch (e) { /* keep 🫰 */ }
    return snapHandGlyph;
  }

  var BFX = (function () {
    var canvas = $("#arena-fx");
    var ctx = canvas.getContext("2d");
    var arena = $("#arena");
    var anims = [], raf = 0, running = false;
    var TAU = Math.PI * 2;

    function rectOf(side) {
      var a = arena.getBoundingClientRect(), v = $("#visual-" + side).getBoundingClientRect();
      return { x: v.left - a.left + v.width / 2, y: v.top - a.top + v.height / 2, r: Math.max(40, Math.min(v.width, v.height) / 2) };
    }
    function resize() {
      var r = arena.getBoundingClientRect();
      canvas.width = Math.round(r.width);
      canvas.height = Math.round(r.height);
    }
    function ease(p) { return 1 - Math.pow(1 - p, 3); }
    function lerp(a, b, p) { return a + (b - a) * p; }
    function rnd(a, b) { return a + Math.random() * (b - a); }
    function glowLine(x1, y1, x2, y2, color, width, blur) {
      ctx.shadowColor = color; ctx.shadowBlur = blur || 18;
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1, width * 0.35);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    function spark(x, y, r, color, alpha) {
      ctx.globalAlpha = alpha; ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    function ringAt(x, y, r, color, width, alpha) {
      ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    function makeParts(n, fn) { var out = []; for (var i = 0; i < n; i++) out.push(fn(i)); return out; }
    /* A snapped fighter crumbling: specks leave it from the side facing the snapper first, ride a breeze away
       from them and fade, in the snapper's aura colours mixed with ash. */
    function dustFx(n, dur) {
      return { dur: dur, parts: function (e) {
          var t = e.to, dx = t.x - e.from.x, dy = t.y - e.from.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
          return makeParts(n, function () {
            var ox, oy;
            if (t.w) {
              /* the whole fighter: specks everywhere in its box, thicker where the picture is */
              ox = (Math.random() - 0.5) * t.w * 0.9;
              oy = Math.random() < 0.55 ? -t.h * 0.18 + (Math.random() - 0.5) * t.h * 0.5 : (Math.random() - 0.5) * t.h;
            } else {
              var a = Math.random() * TAU, d = Math.sqrt(Math.random()) * t.r * 1.05;
              ox = Math.cos(a) * d; oy = Math.sin(a) * d;
            }
            var reach = t.w ? Math.abs(ux) * t.w / 2 + Math.abs(uy) * t.h / 2 : t.r;
            var order = ((ox * ux + oy * uy) / reach + 1) / 2; /* 0 on the side facing the snapper */
            return { x: t.x + ox, y: t.y + oy, start: Math.max(0, Math.min(1, order)) * 0.6 + Math.random() * 0.08,
              vx: ux * rnd(60, 200) + rnd(-30, 30), vy: uy * rnd(60, 200) - rnd(40, 110), r: rnd(1.4, 4.2), ph: Math.random() * TAU, c: Math.floor(Math.random() * 4) };
          });
        },
        draw: function (p, e, ps) {
          var cols = [e.c1, e.c2, "#d8c9b3", "#8c8276"];
          ps.forEach(function (s) {
            var q = (p - s.start) / (1 - s.start);
            if (q <= 0) return;
            q = Math.min(1, q);
            var x = s.x + s.vx * q * 1.8 + Math.sin(s.ph + q * 7) * 12 * q, y = s.y + s.vy * q * 1.8 - 30 * q * q;
            spark(x, y, s.r * (1 - q * 0.5), cols[s.c], (1 - q) * 0.95);
          });
        } };
    }

    /* A fixed-damage hit (Snap, Destiny Unbound): white flash, a ring and cracks bursting from the target. */
    function flatHitFx(ringCol, sparkCol, crackCol) {
      return { dur: 900, parts: function () { return makeParts(40, function () { return { a: rnd(0, Math.PI * 2), s: rnd(40, 200), r: rnd(2, 4) }; }); },
        draw: function (p, e, parts) {
          var t = e.to;
          if (p < 0.2) { ctx.fillStyle = "#fff"; ctx.globalAlpha = (0.2 - p) * 4; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.globalAlpha = 1; }
          ringAt(t.x, t.y, t.r * (0.5 + ease(p) * 2.5), ringCol, 5 * (1 - p) + 1, 1 - p);
          for (var k = 0; k < 6; k++) { var a = k / 6 * Math.PI * 2 + 0.3, L = t.r * 1.8 * Math.min(1, p * 3); glowLine(t.x, t.y, t.x + Math.cos(a) * L, t.y + Math.sin(a) * L, crackCol, 2, 10); }
          parts.forEach(function (s) { var d = s.s * ease(p); spark(t.x + Math.cos(s.a) * d, t.y + Math.sin(s.a) * d, s.r, sparkCol, 1 - p); });
        } };
    }

    /* Each entry: duration in ms and a draw(p, env) where p runs 0..1. env = { from, to, c1, c2 }. */
    var LIB = {
      strike: { dur: 520, draw: function (p, e) {
        var t = e.to, len = t.r * 1.9;
        for (var k = 0; k < 2; k++) {
          var sp = Math.max(0, Math.min(1, (p - k * 0.18) / 0.5));
          if (sp <= 0) continue;
          var ang = k === 0 ? -0.7 : 0.7;
          var x0 = t.x - Math.cos(ang) * len, y0 = t.y - Math.sin(ang) * len;
          var x1 = lerp(x0, t.x + Math.cos(ang) * len, ease(sp)), y1 = lerp(y0, t.y + Math.sin(ang) * len, ease(sp));
          ctx.globalAlpha = 1 - Math.max(0, sp - 0.6) / 0.4;
          glowLine(lerp(x0, x1, Math.max(0, sp - 0.35)), lerp(y0, y1, Math.max(0, sp - 0.35)), x1, y1, e.c1, 10, 26);
          ctx.globalAlpha = 1;
        }
        if (p > 0.3) makeParts(8, function (i) { var a = i / 8 * TAU, d = (p - 0.3) * 90; spark(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, 3, "#fff", 1 - p); });
      } },
      heavy: { dur: 700, draw: function (p, e) {
        var t = e.to;
        if (p < 0.45) {
          var q = ease(p / 0.45), y = lerp(t.y - 260, t.y - t.r * 0.4, q), x = t.x;
          ctx.save(); ctx.translate(x, y); ctx.rotate(-0.4 + q * 0.4);
          ctx.shadowColor = e.c1; ctx.shadowBlur = 20;
          ctx.fillStyle = "#cbd5e1"; ctx.fillRect(-34, -22, 68, 44);
          ctx.fillStyle = e.c1; ctx.fillRect(-6, 22, 12, 70);
          ctx.restore(); ctx.shadowBlur = 0;
        } else {
          var q2 = (p - 0.45) / 0.55;
          ringAt(t.x, t.y, 20 + q2 * t.r * 2.4, e.c1, 10 * (1 - q2), 1 - q2);
          ringAt(t.x, t.y, 10 + q2 * t.r * 1.6, "#fff", 4 * (1 - q2), 1 - q2);
          ctx.strokeStyle = e.c1; ctx.lineWidth = 3; ctx.globalAlpha = 1 - q2;
          for (var i = 0; i < 7; i++) {
            var a = i / 7 * TAU + 0.3, L = (30 + i * 9) * Math.min(1, q2 * 2);
            ctx.beginPath(); ctx.moveTo(t.x, t.y);
            ctx.lineTo(t.x + Math.cos(a) * L * 0.5 + 6, t.y + Math.sin(a) * L * 0.5 - 4);
            ctx.lineTo(t.x + Math.cos(a) * L, t.y + Math.sin(a) * L); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
      }, shake: 1 },
      guard: { dur: 700, draw: function (p, e) {
        var f = e.from, R = f.r * 1.35 * Math.min(1, p * 3), col = "#60a5fa";
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(p * 1.2);
        ctx.globalAlpha = p < 0.8 ? 1 : (1 - p) / 0.2;
        ctx.shadowColor = col; ctx.shadowBlur = 20; ctx.strokeStyle = col; ctx.lineWidth = 4;
        ctx.beginPath();
        for (var i = 0; i < 6; i++) { var a = i / 6 * TAU; ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); }
        ctx.closePath(); ctx.stroke();
        ctx.fillStyle = "rgba(96,165,250,.18)"; ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.globalAlpha *= 0.6;
        ctx.beginPath(); ctx.arc(0, 0, R * 0.7, 0, TAU); ctx.stroke();
        ctx.restore(); ctx.globalAlpha = 1;
      } },
      heal: { dur: 800, parts: function (e) { return makeParts(26, function () { return { a: rnd(0, TAU), d: rnd(0.2, 1.1), s: rnd(1.5, 4), o: rnd(0, 0.6), plus: Math.random() < 0.3 }; }); },
        draw: function (p, e, parts) {
          var f = e.from;
          ctx.fillStyle = "#4ade80"; ctx.shadowColor = "#4ade80"; ctx.shadowBlur = 12;
          parts.forEach(function (q) {
            var lp = (p + q.o) % 1;
            var x = f.x + Math.cos(q.a) * f.r * q.d, y = f.y + f.r * 0.8 - lp * f.r * 2.4;
            ctx.globalAlpha = Math.sin(lp * Math.PI);
            if (q.plus) { ctx.fillRect(x - q.s * 1.5, y - q.s * 0.5, q.s * 3, q.s); ctx.fillRect(x - q.s * 0.5, y - q.s * 1.5, q.s, q.s * 3); }
            else { ctx.beginPath(); ctx.arc(x, y, q.s, 0, TAU); ctx.fill(); }
          });
          ctx.shadowBlur = 0; ctx.globalAlpha = 1;
          ringAt(f.x, f.y, f.r * (0.6 + p * 0.9), "#86efac", 3, (1 - p) * 0.8);
        } },
      precision: { dur: 750, draw: function (p, e) {
        var t = e.to, f = e.from, col = "#f87171";
        if (p < 0.55) {
          var q = ease(p / 0.55), R = lerp(t.r * 2.6, t.r * 0.9, q);
          ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(q * 2);
          ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.shadowColor = col; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
          for (var i = 0; i < 4; i++) { var a = i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6); ctx.lineTo(Math.cos(a) * R * 1.25, Math.sin(a) * R * 1.25); ctx.stroke(); }
          ctx.restore(); ctx.shadowBlur = 0;
        } else {
          var q2 = (p - 0.55) / 0.45;
          ctx.globalAlpha = 1 - q2;
          glowLine(f.x, f.y, t.x, t.y, col, 3, 24);
          ctx.globalAlpha = 1;
          ringAt(t.x, t.y, 6 + q2 * 60, "#fff", 3, 1 - q2);
          makeParts(10, function (i) { var a = i / 10 * TAU; spark(t.x + Math.cos(a) * q2 * 70, t.y + Math.sin(a) * q2 * 70, 2.5, col, 1 - q2); });
        }
      } },
      drain: { dur: 850, parts: function () { return makeParts(22, function () { return { o: rnd(0, 1), w: rnd(-40, 40), s: rnd(2, 4.5) }; }); },
        draw: function (p, e, parts) {
          var f = e.from, t = e.to, col = "#ef4444";
          var mx = (f.x + t.x) / 2, my = (f.y + t.y) / 2 - 60;
          ctx.strokeStyle = "rgba(127,29,29,.6)"; ctx.lineWidth = 10; ctx.shadowColor = col; ctx.shadowBlur = 16;
          ctx.globalAlpha = Math.sin(p * Math.PI);
          ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.quadraticCurveTo(mx, my, f.x, f.y); ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.fillStyle = col;
          parts.forEach(function (q) {
            var lp = (p * 1.6 + q.o) % 1;
            var x = (1 - lp) * (1 - lp) * t.x + 2 * (1 - lp) * lp * (mx + q.w) + lp * lp * f.x;
            var y = (1 - lp) * (1 - lp) * t.y + 2 * (1 - lp) * lp * (my + q.w) + lp * lp * f.y;
            ctx.globalAlpha = Math.sin(p * Math.PI);
            ctx.beginPath(); ctx.arc(x, y, q.s, 0, TAU); ctx.fill();
          });
          ctx.globalAlpha = 1;
          ringAt(f.x, f.y, f.r * (1.1 - p * 0.3), "#fca5a5", 3, p > 0.5 ? (1 - p) * 1.6 : 0);
        } },
      focus: { dur: 800, draw: function (p, e) {
        var f = e.from, col = "#c084fc";
        for (var i = 0; i < 4; i++) {
          var q = (p + i * 0.25) % 1;
          ringAt(f.x, f.y, f.r * (2.2 - q * 1.5), col, 3, q);
        }
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        var g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 1.4);
        g.addColorStop(0, "rgba(192,132,252," + (0.6 * Math.sin(p * Math.PI)) + ")"); g.addColorStop(1, "rgba(192,132,252,0)");
        ctx.fillStyle = g; ctx.fillRect(f.x - f.r * 2, f.y - f.r * 2, f.r * 4, f.r * 4);
        ctx.restore();
        makeParts(12, function (i) { var a = i / 12 * TAU + p * 4, d = f.r * (1.6 - p * 0.9); spark(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.6, 2.5, "#e9d5ff", 1); });
      } },
      poison: { dur: 800, draw: function (p, e) {
        var f = e.from, t = e.to, col = "#22c55e";
        if (p < 0.5) {
          var q = p / 0.5;
          for (var i = 0; i < 3; i++) {
            var qq = Math.max(0, Math.min(1, q - i * 0.12)) ;
            var x = lerp(f.x, t.x, qq), y = lerp(f.y, t.y, qq) - Math.sin(qq * Math.PI) * 120 - i * 10;
            ctx.shadowColor = col; ctx.shadowBlur = 14; spark(x, y, 9 - i * 2, col, 1); ctx.shadowBlur = 0;
          }
        } else {
          var q2 = (p - 0.5) / 0.5;
          makeParts(14, function (i) { var a = i / 14 * TAU, d = q2 * 70; spark(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d - q2 * 40, 5 * (1 - q2) + 2, i % 2 ? col : "#86efac", 1 - q2); });
          ctx.font = "bold " + Math.round(28 + q2 * 10) + "px sans-serif"; ctx.textAlign = "center"; ctx.globalAlpha = 1 - q2;
          ctx.fillText("☠", t.x, t.y - q2 * 50); ctx.globalAlpha = 1;
        }
      } },
      weaken: { dur: 850, draw: function (p, e) {
        var t = e.to, col = "#a78bfa";
        ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.shadowColor = col; ctx.shadowBlur = 14;
        ctx.globalAlpha = p < 0.75 ? 1 : (1 - p) / 0.25;
        for (var k = 0; k < 2; k++) {
          ctx.beginPath();
          var turns = ease(Math.min(1, p / 0.7)) * 3;
          for (var i = 0; i <= 60; i++) {
            var q = i / 60 * turns, a = q * TAU + k * Math.PI, y = t.y - t.r * 1.2 + q / 3 * t.r * 2.4, x = t.x + Math.cos(a) * t.r * 1.1;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        var g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r * 1.3);
        g.addColorStop(0, "rgba(76,29,149,0)"); g.addColorStop(1, "rgba(76,29,149," + (0.5 * Math.sin(p * Math.PI)) + ")");
        ctx.fillStyle = g; ctx.fillRect(t.x - t.r * 1.3, t.y - t.r * 1.3, t.r * 2.6, t.r * 2.6);
      } },
      stun: { dur: 700, parts: function (e) {
        var t = e.to, pts = [[t.x + rnd(-40, 40), -10]], steps = 9;
        for (var i = 1; i <= steps; i++) pts.push([lerp(pts[0][0], t.x, i / steps) + (i < steps ? rnd(-35, 35) : 0), lerp(-10, t.y, i / steps)]);
        return pts;
      }, draw: function (p, e, pts) {
        var t = e.to, col = "#fde047";
        if (p < 0.6) {
          var n = Math.min(pts.length, Math.ceil(p / 0.3 * pts.length));
          ctx.globalAlpha = p < 0.3 ? 1 : 1 - (p - 0.3) / 0.3;
          ctx.shadowColor = col; ctx.shadowBlur = 24; ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.lineJoin = "round";
          ctx.beginPath(); for (var i = 0; i < n; i++) { if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]); else ctx.lineTo(pts[i][0], pts[i][1]); } ctx.stroke();
          ctx.shadowBlur = 0; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
          if (p > 0.25 && p < 0.4) { ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.35; ctx.fillRect(0, 0, canvas.width, canvas.height); }
          ctx.globalAlpha = 1;
        }
        if (p > 0.3) {
          var q = (p - 0.3) / 0.7;
          ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = col; ctx.globalAlpha = 1 - q;
          for (var k = 0; k < 4; k++) { var a = q * 6 + k * Math.PI / 2; ctx.fillText("★", t.x + Math.cos(a) * t.r * 1.1, t.y - t.r * 0.9 + Math.sin(a) * 12); }
          ctx.globalAlpha = 1;
        }
      }, shake: 1 },
      reflect: { dur: 800, draw: function (p, e) {
        var f = e.from, dir = e.to.x >= f.x ? 1 : -1, w = 22, h = f.r * 2.6, x = f.x + dir * f.r * 1.4 - w / 2, y = f.y - h / 2;
        var a = p < 0.8 ? Math.min(1, p * 4) : (1 - p) / 0.2;
        ctx.globalAlpha = a;
        var g = ctx.createLinearGradient(x, y, x + w, y + h);
        g.addColorStop(0, "rgba(255,255,255,.95)"); g.addColorStop(0.5, "rgba(186,230,253,.45)"); g.addColorStop(1, "rgba(255,255,255,.9)");
        ctx.fillStyle = g; ctx.shadowColor = "#bae6fd"; ctx.shadowBlur = 20;
        ctx.fillRect(x, y, w, h); ctx.shadowBlur = 0;
        var gy = y + ((p * 2) % 1) * h;
        ctx.fillStyle = "#fff"; ctx.fillRect(x - 4, gy - 6, w + 8, 12);
        ctx.globalAlpha = 1;
      } },
      snap: { dur: 1100, draw: function (p, e) {
        /* A hand over the snapper; at the snap a flash and a ring burst from its fingers. */
        var f = e.from, size = f.r * 1.4, y = f.y - f.r * 1.2 - 20 * ease(Math.min(1, p * 3));
        ctx.globalAlpha = Math.min(1, p * 4) * (1 - Math.max(0, p - 0.8) / 0.2);
        ctx.font = size + "px " + EMOJI_FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.shadowColor = e.c1; ctx.shadowBlur = 24;
        ctx.fillText(snapHand(), f.x + (p < 0.45 ? (Math.random() - 0.5) * 3 : 0), y);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        if (p > 0.45) {
          var q = (p - 0.45) / 0.55;
          if (q < 0.15) { ctx.fillStyle = "#fff"; ctx.globalAlpha = (0.15 - q) * 5; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.globalAlpha = 1; }
          ringAt(f.x - size * 0.12, y - size * 0.25, 10 + q * f.r * 3, e.c1, 4 * (1 - q) + 1, 1 - q);
          makeParts(10, function (i) { var a = i / 10 * TAU, d = q * f.r * 1.6; spark(f.x - size * 0.12 + Math.cos(a) * d, y - size * 0.25 + Math.sin(a) * d, 2.5, "#fff", 1 - q); });
        }
      } },
      dust: dustFx(420, 3000),
      dustMax: dustFx(700, 3600),
      destiny: flatHitFx("#f59e0b", "#fde68a", "#fffbeb"),
      burst: { dur: 950, parts: function () { return makeParts(70, function () { return { a: rnd(0, TAU), s: rnd(60, 260), r: rnd(2, 5) }; }); },
        draw: function (p, e, parts) {
          var t = e.to;
          if (p < 0.3) {
            var q = p / 0.3;
            ringAt(t.x, t.y, t.r * 2.5 * (1 - q) + 6, e.c1, 4, q);
            makeParts(10, function (i) { var a = i / 10 * TAU + q * 3, d = t.r * 2.2 * (1 - q); spark(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, 4, "#fff", 1); });
          } else {
            var q2 = (p - 0.3) / 0.7;
            if (q2 < 0.25) { ctx.fillStyle = "#fff"; ctx.globalAlpha = (0.25 - q2) * 3; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.globalAlpha = 1; }
            ctx.save(); ctx.globalCompositeOperation = "lighter";
            var g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r * 3 * q2 + 10);
            g.addColorStop(0, "rgba(255,255,255," + (1 - q2) + ")"); g.addColorStop(0.4, e.c1); g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.globalAlpha = 1 - q2; ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
            parts.forEach(function (q) { var d = q.s * ease(q2); spark(t.x + Math.cos(q.a) * d, t.y + Math.sin(q.a) * d, q.r * (1 - q2 * 0.5), Math.random() < 0.5 ? e.c1 : e.c2, 1 - q2); });
            ctx.restore(); ctx.globalAlpha = 1;
            ringAt(t.x, t.y, q2 * t.r * 4, "#fff", 6 * (1 - q2), 1 - q2);
            ringAt(t.x, t.y, q2 * t.r * 3, e.c1, 10 * (1 - q2), 1 - q2);
          }
        }, shake: 2 },
      barrage: { dur: 900, draw: function (p, e) {
        var f = e.from, t = e.to;
        for (var i = 0; i < 3; i++) {
          var q = Math.max(0, Math.min(1, (p - i * 0.22) / 0.4));
          if (q <= 0) continue;
          var off = (i - 1) * 50;
          var x = lerp(f.x, t.x, q), y = lerp(f.y, t.y, q) + Math.sin(q * Math.PI) * off;
          if (q < 1) {
            var tx = lerp(f.x, t.x, Math.max(0, q - 0.18)), ty = lerp(f.y, t.y, Math.max(0, q - 0.18)) + Math.sin(Math.max(0, q - 0.18) * Math.PI) * off;
            glowLine(tx, ty, x, y, e.c1, 8, 20);
            spark(x, y, 7, "#fff", 1);
          } else {
            var iq = Math.min(1, (p - i * 0.22 - 0.4) / 0.3);
            ringAt(t.x + off * 0.2, t.y, 8 + iq * 50, e.c1, 4 * (1 - iq), 1 - iq);
            makeParts(6, function (k) { var a = k / 6 * TAU; spark(t.x + Math.cos(a) * iq * 40, t.y + Math.sin(a) * iq * 40, 3, "#fff", 1 - iq); });
          }
        }
      }, shake: 1 },
      execute: { dur: 850, draw: function (p, e) {
        var t = e.to, col = "#ef4444";
        if (p < 0.4) {
          var q = ease(p / 0.4), y = lerp(-80, t.y + t.r * 0.3, q);
          ctx.save(); ctx.translate(t.x, y);
          ctx.shadowColor = col; ctx.shadowBlur = 22;
          ctx.fillStyle = "#e2e8f0"; ctx.beginPath(); ctx.moveTo(-18, -110); ctx.lineTo(18, -110); ctx.lineTo(26, 0); ctx.lineTo(0, 26); ctx.lineTo(-26, 0); ctx.closePath(); ctx.fill();
          ctx.fillStyle = col; ctx.fillRect(-8, -150, 16, 42);
          ctx.restore(); ctx.shadowBlur = 0;
        } else {
          var q2 = (p - 0.4) / 0.6;
          if (q2 < 0.2) { ctx.fillStyle = col; ctx.globalAlpha = (0.2 - q2) * 2.5; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.globalAlpha = 1; }
          ctx.globalAlpha = 1 - q2;
          glowLine(t.x - t.r * 1.5, t.y - t.r * 1.5, t.x + t.r * 1.5, t.y + t.r * 1.5, col, 9, 26);
          glowLine(t.x + t.r * 1.5, t.y - t.r * 1.5, t.x - t.r * 1.5, t.y + t.r * 1.5, col, 9, 26);
          ctx.globalAlpha = 1;
          makeParts(16, function (i) { var a = i / 16 * TAU; spark(t.x + Math.cos(a) * q2 * 110, t.y + Math.sin(a) * q2 * 110, 3.5, i % 2 ? col : "#fff", 1 - q2); });
        }
      }, shake: 2 },
      shield: { dur: 800, draw: function (p, e) {
        var f = e.from, col = "#38bdf8", R = f.r * 1.5 * Math.min(1, ease(p * 2.5));
        ctx.globalAlpha = p < 0.8 ? 1 : (1 - p) / 0.2;
        var g = ctx.createRadialGradient(f.x, f.y, R * 0.5, f.x, f.y, R);
        g.addColorStop(0, "rgba(56,189,248,0)"); g.addColorStop(0.85, "rgba(56,189,248,.25)"); g.addColorStop(1, "rgba(224,242,254,.9)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, TAU); ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, TAU); ctx.clip();
        ctx.strokeStyle = "rgba(224,242,254,.5)"; ctx.lineWidth = 1.5;
        var hs = 22;
        for (var yy = f.y - R; yy < f.y + R; yy += hs * 0.87) for (var xx = f.x - R; xx < f.x + R; xx += hs * 1.5) {
          var ox = ((Math.round((yy - f.y) / (hs * 0.87)) % 2) ? hs * 0.75 : 0) + xx;
          ctx.beginPath(); for (var k = 0; k < 6; k++) { var a = k / 6 * TAU + Math.PI / 6; ctx.lineTo(ox + Math.cos(a) * hs / 2, yy + Math.sin(a) * hs / 2); } ctx.closePath(); ctx.stroke();
        }
        ctx.restore();
        var gy = f.y - R + ((p * 1.5) % 1) * R * 2;
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.shadowColor = col; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(f.x - R, gy); ctx.lineTo(f.x + R, gy); ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      } }
    };

    /* The whole fighter's box (picture, name and health bar), for effects that cover all of it. */
    function boxOf(side) {
      var a = arena.getBoundingClientRect(), v = $("#fighter-" + side).getBoundingClientRect();
      return { x: v.left - a.left + v.width / 2, y: v.top - a.top + v.height / 2, r: Math.max(v.width, v.height) / 2, left: v.left - a.left, top: v.top - a.top, w: v.width, h: v.height };
    }
    function play(arch, fromSide, toSide, c1, c2, wide) {
      var def = LIB[arch] || LIB.strike;
      resize();
      var env = { from: rectOf(fromSide), to: wide ? boxOf(toSide) : rectOf(toSide), c1: c1 || "#f8fafc", c2: c2 || "#a78bfa" };
      var anim = { def: def, env: env, start: performance.now(), parts: def.parts ? def.parts(env) : null };
      anims.push(anim);
      if (!running) { running = true; raf = requestAnimationFrame(frame); }
      return def.dur;
    }
    function frame(now) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      anims = anims.filter(function (a) { return now - a.start < a.def.dur; });
      anims.forEach(function (a) {
        var p = Math.max(0, Math.min(1, (now - a.start) / a.def.dur));
        ctx.save();
        try { a.def.draw(p, a.env, a.parts); } catch (e) { /* never let an effect break a fight */ }
        ctx.restore();
      });
      if (anims.length) raf = requestAnimationFrame(frame);
      else { running = false; ctx.clearRect(0, 0, canvas.width, canvas.height); }
    }
    function clear() { anims = []; ctx.clearRect(0, 0, canvas.width, canvas.height); }
    return { play: play, clear: clear, LIB: LIB };
  })();

  /* ---------- Full-screen ability layer: Legendary+ auras fill the whole screen ---------- */

  var UFX = (function () {
    var el = $("#ult"), canvas = $("#ult-canvas"), ctx = canvas.getContext("2d");
    var callout = $("#ult-callout"), nameEl = $("#ult-name"), userEl = $("#ult-user");
    var anim = null, raf = 0, drawingEnv = null;
    var TAU = Math.PI * 2;
    function ease(p) { return 1 - Math.pow(1 - p, 3); }
    function lerp(a, b, p) { return a + (b - a) * p; }
    function rnd(a, b) { return a + Math.random() * (b - a); }
    function dim(p, amt) { ctx.fillStyle = "rgba(0,0,0," + (amt * Math.sin(Math.min(1, p) * Math.PI)) + ")"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    function flash(amount, color) { if (amount <= 0) return; ctx.fillStyle = color || "#fff"; ctx.globalAlpha = Math.min(1, amount); ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.globalAlpha = 1; }
    function glowLine(x1, y1, x2, y2, color, width, blur) {
      ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1, width * 0.3); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    function spark(x, y, r, color, a) { ctx.globalAlpha = a; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    function ring(x, y, r, color, width, a) { ctx.globalAlpha = a; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
    function parts(n, fn) { var o = []; for (var i = 0; i < n; i++) o.push(fn(i)); return o; }
    function seg(p, a, b) { return Math.max(0, Math.min(1, (p - a) / (b - a))); }
    /* Full-screen fixed-damage hit: a point of light charges, then a flash, a shockwave across the screen
       and reality cracking. Colours: main, light, crack rgb, glitch rgb. */
    function flatUltFx(main, light, crackRgb, glitchRgb) {
      return { dur: 1800, parts: function () { return parts(140, function () { return { a: Math.random() * TAU, s: rnd(0.3, 1.2), r: rnd(1.5, 4.5) }; }); },
        draw: function (p, e, ps) {
          var R = Math.hypot(e.w, e.h) / 2;
          ctx.fillStyle = "rgba(0,0,0," + (0.85 * Math.min(1, p / 0.15) * (1 - seg(p, 0.85, 1))) + ")"; ctx.fillRect(0, 0, e.w, e.h);
          if (p < 0.3) {
            var q = p / 0.3;
            spark(e.cx, e.cy, 4 + q * 18, "#fff", 0.6 + q * 0.4);
            for (var k = 0; k < 6; k++) { var a = k / 6 * TAU + q * 2; glowLine(e.cx, e.cy, e.cx + Math.cos(a) * 60 * q, e.cy + Math.sin(a) * 60 * q, main, 2, 12); }
          } else {
            var q2 = seg(p, 0.3, 1);
            flash((0.42 - p) * 6, "#ffffff");
            ring(e.cx, e.cy, R * ease(q2), light, 10 * (1 - q2) + 1, 1 - q2);
            ring(e.cx, e.cy, R * 0.7 * ease(q2), "#ffffff", 4, (1 - q2) * 0.8);
            ps.forEach(function (s) { var d = R * s.s * ease(q2); spark(e.cx + Math.cos(s.a) * d, e.cy + Math.sin(s.a) * d, s.r, s.s > 0.8 ? main : "#fff", 1 - q2); });
            if (q2 < 0.5) for (var g = 0; g < 8; g++) { ctx.fillStyle = g % 2 ? "rgba(" + glitchRgb + ",.35)" : "rgba(255,255,255,.25)"; ctx.fillRect(0, Math.random() * e.h, e.w, 2 + Math.random() * 10); }
            for (var c = 0; c < 7; c++) { var ca = c / 7 * TAU + 0.4, L = R * Math.min(1, q2 * 2); glowLine(e.cx, e.cy, e.cx + Math.cos(ca) * L, e.cy + Math.sin(ca) * L, "rgba(" + crackRgb + "," + (1 - q2) + ")", 2, 10); }
          }
        } };
    }

    /* A drawn hand doing a real finger snap. Origin = wrist, S = hand height, `t` 0 = middle finger pressed on
       the thumb, 1 = snapped (the finger has slid off the thumb and slapped into the palm), `press` bends it
       harder just before. `gold` draws the golden gauntlet with six stones. Returns where the fingers met. */
    var HAND_A = { thumb: [[-0.17, -0.30], [-0.27, -0.47], [-0.31, -0.64]], middle: [[-0.03, -0.62], [-0.15, -0.80], [-0.29, -0.70]],
      index: [[-0.14, -0.60], [-0.23, -0.82], [-0.28, -0.99]], ring: [[0.07, -0.60], [0.14, -0.73], [0.10, -0.60]], pinky: [[0.17, -0.53], [0.23, -0.63], [0.19, -0.52]] };
    var HAND_B = { thumb: [[-0.17, -0.30], [-0.30, -0.45], [-0.40, -0.58]], middle: [[-0.03, -0.62], [-0.11, -0.50], [-0.02, -0.39]],
      index: [[-0.14, -0.60], [-0.24, -0.81], [-0.30, -0.97]], ring: [[0.07, -0.60], [0.14, -0.73], [0.10, -0.60]], pinky: [[0.17, -0.53], [0.23, -0.63], [0.19, -0.52]] };
    var STONES = ["#a855f7", "#3b82f6", "#ef4444", "#f97316", "#22c55e", "#facc15"];
    function drawHand(x, y, S, t, press, gold, glow, stonesLit) {
      var skin = gold ? ["#d4a017", "#ffe58a", "#5c3d00"] : ["#f2c094", "#ffe3c7", "#7a4a26"];
      var W = { thumb: 0.12, index: 0.1, middle: 0.105, ring: 0.095, pinky: 0.085 };
      var pt = function (name, i) {
        var a = HAND_A[name][i], b = HAND_B[name][i], k = name === "middle" && i > 0 && t <= 0 ? press * 0.03 : 0;
        return [x + (a[0] + (b[0] - a[0]) * t - k) * S, y + (a[1] + (b[1] - a[1]) * t + k) * S];
      };
      var limb = function (pts, w) {
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        [[w + 0.035, skin[2]], [w, skin[0]]].forEach(function (L) {
          ctx.strokeStyle = L[1]; ctx.lineWidth = L[0] * S; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
          for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
        });
        ctx.strokeStyle = skin[1]; ctx.globalAlpha *= 0.8; ctx.lineWidth = w * 0.3 * S; ctx.beginPath();
        ctx.moveTo(pts[0][0] - 0.015 * S, pts[0][1]); for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0] - 0.015 * S, pts[j][1]); ctx.stroke();
        ctx.globalAlpha /= 0.8;
      };
      ctx.save();
      ctx.shadowColor = glow; ctx.shadowBlur = 40;
      /* forearm and palm */
      ctx.fillStyle = skin[2]; ctx.beginPath(); ctx.moveTo(x - 0.19 * S, y + 0.6 * S); ctx.lineTo(x - 0.17 * S, y - 0.2 * S); ctx.lineTo(x + 0.19 * S, y - 0.2 * S); ctx.lineTo(x + 0.21 * S, y + 0.6 * S); ctx.fill();
      ctx.fillStyle = skin[0]; ctx.beginPath(); ctx.moveTo(x - 0.16 * S, y + 0.6 * S); ctx.lineTo(x - 0.145 * S, y - 0.2 * S); ctx.lineTo(x + 0.165 * S, y - 0.2 * S); ctx.lineTo(x + 0.18 * S, y + 0.6 * S); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = skin[2]; ctx.beginPath(); ctx.ellipse(x, y - 0.41 * S, 0.245 * S, 0.27 * S, 0.08, 0, TAU); ctx.fill();
      ctx.fillStyle = skin[0]; ctx.beginPath(); ctx.ellipse(x, y - 0.41 * S, 0.225 * S, 0.25 * S, 0.08, 0, TAU); ctx.fill();
      if (gold) { ctx.strokeStyle = skin[1]; ctx.lineWidth = 0.012 * S; ctx.beginPath(); ctx.ellipse(x, y - 0.41 * S, 0.17 * S, 0.19 * S, 0.08, 0, TAU); ctx.stroke(); }
      ["ring", "pinky"].forEach(function (n) { limb([pt(n, 0), pt(n, 1), pt(n, 2)], W[n]); });
      limb([pt("index", 0), pt("index", 1), pt("index", 2)], W.index);
      limb([pt("thumb", 0), pt("thumb", 1), pt("thumb", 2)], W.thumb);
      limb([pt("middle", 0), pt("middle", 1), pt("middle", 2)], W.middle);
      if (gold) {
        /* the six stones: one big one on the back of the hand, one on each finger */
        var spots = [[0, -0.41, 0.075], ["thumb", 0.045], ["index", 0.038], ["middle", 0.04], ["ring", 0.036], ["pinky", 0.032]];
        spots.forEach(function (sp, i) {
          var lit = stonesLit[i] || 0, px, py, r;
          if (typeof sp[0] === "number") { px = x + sp[0] * S; py = y + sp[1] * S; r = sp[2] * S; }
          else { var a = pt(sp[0], 0), b = pt(sp[0], 1); px = (a[0] + b[0]) / 2; py = (a[1] + b[1]) / 2; r = sp[1] * S; }
          ctx.fillStyle = "#2a1d00"; ctx.beginPath(); ctx.arc(px, py, r * 1.25, 0, TAU); ctx.fill();
          ctx.shadowColor = STONES[i]; ctx.shadowBlur = 10 + 40 * lit;
          ctx.globalAlpha = 0.35 + 0.65 * lit; ctx.fillStyle = STONES[i]; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
          ctx.globalAlpha = 0.9 * lit; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(px - r * 0.3, py - r * 0.3, r * 0.3, 0, TAU); ctx.fill();
          ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        });
      }
      ctx.restore();
      var c = HAND_A.thumb[2];
      return [x + c[0] * S, y + c[1] * S];
    }

    /* Snap: the screen goes dark and a hand rises and presses its middle finger on its thumb, trembling as it
       builds up; then the finger slides off and slaps the palm with a crack and a spark where they met. `max`
       (auras rarer than 1 in 3,000,000) makes it a golden gauntlet: cinema bars, its six stones lighting up one
       by one with energy crackling around it, and a heavier snap. The target turning to dust comes with the
       hit (snapHit). `snapAt` is when the fingers snap, so the sound and shake land on it. */
    function snapFx(max) {
      var AT = max ? 0.62 : 0.5;
      return { dur: max ? 3400 : 2400, snapAt: AT,
        parts: function () {
          return {
            motes: parts(max ? 90 : 40, function () { return { x: Math.random(), y: Math.random(), r: rnd(0.5, 1.8), v: rnd(0.05, 0.25) }; }),
            sparks: parts(max ? 70 : 40, function () { return { a: rnd(-Math.PI, Math.PI), s: rnd(0.2, 1), r: rnd(1, 3) }; }),
            arcs: parts(10, function () { return { a: Math.random() * TAU, l: rnd(0.3, 0.6), ph: Math.random() * TAU }; })
          };
        },
        draw: function (p, e, ps) {
          var s = Math.min(e.w, e.h), S = s * (max ? 0.62 : 0.55);
          var fade = 1 - seg(p, 0.86, 1), build = seg(p, AT - (max ? 0.2 : 0.15), AT), post = seg(p, AT, 1);
          ctx.fillStyle = "rgba(3,2,10," + (0.94 * Math.min(1, p / 0.08) * fade) + ")"; ctx.fillRect(0, 0, e.w, e.h);
          ps.motes.forEach(function (m) { var y = ((m.y - p * m.v) % 1 + 1) % 1; spark(m.x * e.w, y * e.h, m.r, "#fff", 0.35 * fade); });
          if (max) { var bar = e.h * 0.12 * ease(Math.min(1, p / 0.1)) * fade; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, e.w, bar); ctx.fillRect(0, e.h - bar, e.w, bar); }
          var rise = ease(seg(p, 0.03, max ? 0.34 : 0.3)), sink = seg(p, 0.8, 1);
          var hx = e.cx + S * 0.08, hy = lerp(e.h + S * 1.1, e.cy + S * 0.55, rise) + ease(sink) * S * 0.6;
          var zoom = 1 + 0.12 * build - 0.05 * Math.min(1, post * 4);
          var trem = p < AT ? build * build * S * 0.012 : 0;
          var t = p < AT ? 0 : Math.min(1.12, seg(p, AT, AT + 0.03) * 1.12) - Math.max(0, seg(p, AT + 0.03, AT + 0.07)) * 0.12;
          var lit = STONES.map(function (c, i) { return max ? seg(p, 0.12 + i * 0.05, 0.16 + i * 0.05) * (1 - 0.5 * post) : 0; });
          /* light behind the hand, stronger as the snap builds */
          var gl = ctx.createRadialGradient(hx - S * 0.2, hy - S * 0.65, 0, hx - S * 0.2, hy - S * 0.65, S * (0.6 + build * 0.6));
          gl.addColorStop(0, max ? "#ffe58a" : e.c1); gl.addColorStop(1, "rgba(0,0,0,0)");
          ctx.globalAlpha = (0.2 + 0.5 * build) * rise * (1 - post) * fade; ctx.fillStyle = gl; ctx.fillRect(0, 0, e.w, e.h); ctx.globalAlpha = 1;
          ctx.save();
          ctx.translate(hx, hy); ctx.scale(zoom, zoom); ctx.translate(-hx, -hy);
          ctx.globalAlpha = Math.min(1, rise * 1.4) * (1 - ease(sink));
          var tip = drawHand(hx + (Math.random() - 0.5) * trem, hy + (Math.random() - 0.5) * trem, S, t, build, max, max ? "#facc15" : e.c1, lit);
          ctx.globalAlpha = 1;
          /* energy crackling around the gauntlet as it builds */
          if (max && p < AT && build > 0) ps.arcs.forEach(function (a, i) {
            if (Math.random() > 0.35 + build * 0.6) return;
            var r0 = S * 0.3, r1 = S * (0.3 + a.l * build), x0 = tip[0] + Math.cos(a.a + p * 9) * r0 * 0.5, y0 = tip[1] + Math.sin(a.a + p * 9) * r0 * 0.5;
            ctx.strokeStyle = STONES[i % 6]; ctx.shadowColor = STONES[i % 6]; ctx.shadowBlur = 12; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0);
            for (var k = 1; k <= 5; k++) { var d = r0 * 0.5 + (r1 - r0 * 0.5) * k / 5; ctx.lineTo(tip[0] + Math.cos(a.a + p * 9) * d + rnd(-8, 8), tip[1] + Math.sin(a.a + p * 9) * d + rnd(-8, 8)); }
            ctx.stroke(); ctx.shadowBlur = 0;
          });
          /* motion streaks of the middle finger flying down */
          if (p >= AT && post < 0.12) for (var m = 0; m < 5; m++) {
            ctx.globalAlpha = (1 - post / 0.12) * (0.6 - m * 0.1); ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.02 * S;
            ctx.beginPath(); ctx.arc(hx - 0.03 * S, hy - 0.62 * S, (0.15 + m * 0.03) * S, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke(); ctx.globalAlpha = 1;
          }
          ctx.restore();
          if (p < AT) return;
          /* the crack: a sharp star of light where the fingers met, a flash and a puff of sparks */
          var c = Math.max(0, 1 - post * 5);
          flash((0.06 - post) * 12, "#ffffff");
          ctx.save(); ctx.translate(tip[0], tip[1]); ctx.rotate(0.3);
          for (var r = 0; r < 8; r++) { ctx.rotate(TAU / 8); ctx.globalAlpha = c; ctx.fillStyle = "#fff"; ctx.shadowColor = max ? "#facc15" : e.c1; ctx.shadowBlur = 25; ctx.beginPath(); ctx.moveTo(0, -S * (r % 2 ? 0.12 : 0.28)); ctx.lineTo(S * 0.018, 0); ctx.lineTo(0, S * 0.018); ctx.lineTo(-S * 0.018, 0); ctx.fill(); }
          ctx.restore(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
          ps.sparks.forEach(function (sp, i) { var d = S * 0.5 * sp.s * ease(Math.min(1, post * 3)); spark(tip[0] + Math.cos(sp.a) * d, tip[1] + Math.sin(sp.a) * d - post * S * 0.1, sp.r, max ? STONES[i % 6] : (i % 2 ? "#fff" : e.c1), (1 - post) * fade); });
          ring(tip[0], tip[1], S * 0.05 + post * S * 0.6, "#ffffff", 2, (1 - post) * 0.35 * fade);
          /* SNAP */
          var ta = Math.min(1, post * 10) * (1 - seg(post, 0.55, 0.85)) * fade, fs = s * 0.075 * (1 + 0.4 * Math.exp(-post * 12));
          ctx.save(); ctx.font = "900 " + fs + "px 'Cinzel', serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.globalAlpha = ta; ctx.fillStyle = "#fff"; ctx.shadowColor = max ? "#facc15" : e.c1; ctx.shadowBlur = 24;
          ctx.fillText("SNAP", tip[0] - S * 0.35, tip[1] - S * 0.22); ctx.restore();
        } };
    }

    /* Destiny Unbound: the sky opens over the target and a pillar of golden light slams down, then floods the
       screen with sunlight and rising embers. */
    function destinyFx() {
      return { dur: 2000, parts: function () { return parts(90, function () { return { x: rnd(-1, 1), v: rnd(0.3, 1), r: rnd(1, 3.5), d: Math.random() }; }); },
        draw: function (p, e, ps) {
          dim(Math.min(1, p * 1.2), 0.85);
          var x = e.to.x, w = Math.min(e.w, e.h) * 0.18, land = seg(p, 0.25, 0.42), after = seg(p, 0.42, 1);
          var top = -20, bottom = lerp(top, e.h, ease(land));
          if (p < 0.25) { var q = p / 0.25; ctx.globalAlpha = q; ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.ellipse(x, 0, w * 1.5 * q, w * 0.25 * q, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
          if (p >= 0.25) {
            var pw = w * (0.4 + 0.6 * ease(land)) * (1 + 0.4 * Math.sin(Math.min(1, after * 2) * Math.PI)) * (1 - seg(p, 0.85, 1));
            var g = ctx.createLinearGradient(x - pw, 0, x + pw, 0);
            g.addColorStop(0, "rgba(251,191,36,0)"); g.addColorStop(0.3, "rgba(251,191,36,.7)"); g.addColorStop(0.5, "#fffbeb"); g.addColorStop(0.7, "rgba(251,191,36,.7)"); g.addColorStop(1, "rgba(251,191,36,0)");
            ctx.fillStyle = g; ctx.shadowColor = "#f59e0b"; ctx.shadowBlur = 40; ctx.fillRect(x - pw, top, pw * 2, bottom - top); ctx.shadowBlur = 0;
          }
          if (land >= 1) {
            flash((0.12 - after) * 7, "#fffbeb");
            ctx.save(); ctx.translate(x, e.to.y); ctx.rotate(p);
            for (var i = 0; i < 16; i++) { ctx.rotate(TAU / 16); ctx.globalAlpha = 0.25 * (1 - after); ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(e.w, -20); ctx.lineTo(e.w, 20); ctx.fill(); }
            ctx.restore(); ctx.globalAlpha = 1;
            ps.forEach(function (m) { var y = e.to.y - after * m.v * e.h * 0.8; spark(x + m.x * w * 2.2, y, m.r, m.d > 0.5 ? "#fde68a" : "#fff", (1 - after) * 0.9); });
          }
        } };
    }

    /* Auras rarer than 1 in 3,000,000 turn every move into a cinematic: cinema bars, the screen dropping to
       black, rays of light and a giant spinning rune circle in the aura's colours, anime speed lines rushing in,
       the move itself bigger, an impact frame (one beat of inverted colours with black speed lines), and embers
       drifting up afterwards. `impact` is when the hit lands, for the shake and the boom. */
    var RUNES = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ";
    function epicFx(base) {
      var IN = 0.24, OUT = 0.95, BI = base.impact || 0.45;
      return { dur: Math.round(base.dur / (OUT - IN)), impact: IN + BI * (OUT - IN),
        parts: function (e) {
          return { base: base.parts ? base.parts(e) : null,
            embers: parts(80, function () { return { x: Math.random(), y: rnd(0.7, 1.2), v: rnd(0.2, 0.6), r: rnd(1, 3), w: Math.random() * TAU }; }),
            lines: parts(80, function () { return { a: Math.random() * TAU, l: rnd(0.3, 0.7), o: Math.random() }; }) };
        },
        draw: function (p, e, ps) {
          var fade = 1 - seg(p, 0.92, 1), intro = ease(seg(p, 0, IN)), q = seg(p, IN, OUT), R = Math.hypot(e.w, e.h) / 2, s = Math.min(e.w, e.h);
          var hit = Math.sin(seg(q, BI - 0.05, BI + 0.1) * Math.PI), after = seg(q, BI + 0.03, 1);
          ctx.fillStyle = "rgba(2,1,8," + (0.9 * Math.min(1, p / 0.06) * fade) + ")"; ctx.fillRect(0, 0, e.w, e.h);
          /* the aura's own signature, big and bold */
          if (e.sig) drawSig(e, p, true, fade);
          /* speed lines rushing in during the intro, out at the impact */
          ps.lines.forEach(function (l) {
            var inward = p < IN, k = inward ? ((intro * 1.6 + l.o) % 1) : after;
            var r0 = inward ? R * (1.1 - k * 0.6) : R * (0.25 + k * 0.9), r1 = r0 + R * l.l * 0.3;
            ctx.globalAlpha = (inward ? 0.35 * intro : 0.5 * (1 - after)) * fade; ctx.strokeStyle = inward ? "#ffffff" : e.c1; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(e.cx + Math.cos(l.a) * r0, e.cy + Math.sin(l.a) * r0); ctx.lineTo(e.cx + Math.cos(l.a) * r1, e.cy + Math.sin(l.a) * r1); ctx.stroke();
          });
          ctx.globalAlpha = 1;
          /* the move itself, a little bigger */
          if (p >= IN) {
            ctx.save(); var z = 1.06 + 0.08 * hit; ctx.translate(e.cx, e.cy); ctx.scale(z, z); ctx.translate(-e.cx, -e.cy);
            e.skipSig = true; base.draw(q, e, ps.base); e.skipSig = false; ctx.restore();
          }
          /* impact frame */
          if (q > BI - 0.01 && q < BI + 0.04) {
            ctx.save(); ctx.globalCompositeOperation = "difference"; ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, e.w, e.h); ctx.restore();
            ctx.strokeStyle = "#000"; ctx.lineWidth = 3;
            for (var b = 0; b < 40; b++) { var ba = b / 40 * TAU + Math.random() * 0.1; ctx.beginPath(); ctx.moveTo(e.cx + Math.cos(ba) * s * 0.12, e.cy + Math.sin(ba) * s * 0.12); ctx.lineTo(e.cx + Math.cos(ba) * R, e.cy + Math.sin(ba) * R); ctx.stroke(); }
          }
          /* embers */
          if (q > BI) ps.embers.forEach(function (m) {
            var y = (m.y - after * m.v) * e.h, x = m.x * e.w + Math.sin(m.w + p * 6) * 14;
            spark(x, y, m.r, Math.random() < 0.5 ? e.c1 : "#fde68a", Math.min(1, after * 3) * (1 - after) * fade);
          });
          var bar = e.h * 0.11 * ease(Math.min(1, p / 0.07)) * fade; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, e.w, bar); ctx.fillRect(0, e.h - bar, e.w, bar);
        } };
    }

    /* Every entry: dur in ms, draw(p, e). e = { w, h, cx, cy, from, to, c1, c2, colors }. */
    var LIB = {
      strike: { dur: 1100, draw: function (p, e) {
        dim(p, 0.6);
        for (var k = 0; k < 3; k++) {
          var sp = seg(p, 0.15 + k * 0.12, 0.45 + k * 0.12); if (sp <= 0) continue;
          var ang = [-0.55, 0.6, -0.1][k], L = Math.max(e.w, e.h);
          var x0 = e.cx - Math.cos(ang) * L, y0 = e.cy - Math.sin(ang) * L, x1 = lerp(x0, e.cx + Math.cos(ang) * L, ease(sp)), y1 = lerp(y0, e.cy + Math.sin(ang) * L, ease(sp));
          ctx.globalAlpha = 1 - Math.max(0, sp - 0.7) / 0.3;
          glowLine(lerp(x0, x1, Math.max(0, sp - 0.4)), lerp(y0, y1, Math.max(0, sp - 0.4)), x1, y1, e.c1, 18, 40);
          ctx.globalAlpha = 1;
          if (sp > 0.5 && sp < 0.7) flash((0.7 - sp) * 2, e.c1);
        }
        if (p > 0.5) parts(40, function (i) { var a = i / 40 * TAU, d = (p - 0.5) * e.w * 0.8; spark(e.cx + Math.cos(a) * d, e.cy + Math.sin(a) * d * 0.6, 4, i % 2 ? "#fff" : e.c1, 1 - p); });
      } },
      heavy: { dur: 1300, draw: function (p, e) {
        dim(p, 0.7);
        if (p < 0.4) {
          var q = Math.pow(p / 0.4, 2.2), y = lerp(-e.h * 0.4, e.cy - 40, q), s = e.w * 0.08;
          ctx.save(); ctx.translate(e.cx, y); ctx.rotate(-0.5 + q * 0.5); ctx.shadowColor = e.c1; ctx.shadowBlur = 40;
          ctx.fillStyle = "#e2e8f0"; ctx.fillRect(-s * 1.6, -s, s * 3.2, s * 2); ctx.fillStyle = e.c1; ctx.fillRect(-s * 0.3, s, s * 0.6, s * 4);
          ctx.restore(); ctx.shadowBlur = 0;
        } else {
          var q2 = (p - 0.4) / 0.6;
          flash((0.25 - q2) * 3, "#fff");
          ring(e.cx, e.cy, q2 * e.w * 0.9, e.c1, 40 * (1 - q2), 1 - q2);
          ring(e.cx, e.cy, q2 * e.w * 0.6, "#fff", 12 * (1 - q2), 1 - q2);
          ctx.strokeStyle = e.c1; ctx.lineWidth = 6; ctx.shadowColor = e.c1; ctx.shadowBlur = 24; ctx.globalAlpha = 1 - q2 * 0.7;
          for (var i = 0; i < 12; i++) {
            var a = i / 12 * TAU + 0.2, L = Math.max(e.w, e.h) * Math.min(1, q2 * 2.5);
            ctx.beginPath(); ctx.moveTo(e.cx, e.cy);
            for (var s2 = 1; s2 <= 6; s2++) ctx.lineTo(e.cx + Math.cos(a) * L * s2 / 6 + Math.sin(s2 * 7 + i) * 30, e.cy + Math.sin(a) * L * s2 / 6 + Math.cos(s2 * 5 + i) * 30);
            ctx.stroke();
          }
          ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        }
      } },
      guard: { dur: 1100, draw: function (p, e) {
        dim(p, 0.55);
        var col = "#60a5fa", hs = 70, q = ease(seg(p, 0, 0.5)), a = p < 0.8 ? 1 : (1 - p) / 0.2;
        ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.shadowColor = col; ctx.shadowBlur = 14;
        for (var y = -hs; y < e.h + hs; y += hs * 0.87) for (var x = -hs; x < e.w + hs; x += hs * 1.5) {
          var ox = ((Math.round(y / (hs * 0.87)) % 2) ? hs * 0.75 : 0) + x, d = Math.hypot(ox - e.cx, y - e.cy) / Math.hypot(e.cx, e.cy);
          if (d > q) continue;
          ctx.beginPath(); for (var k = 0; k < 6; k++) { var an = k / 6 * TAU + Math.PI / 6; ctx.lineTo(ox + Math.cos(an) * hs / 2, y + Math.sin(an) * hs / 2); } ctx.closePath(); ctx.stroke();
        }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        ring(e.cx, e.cy, q * Math.hypot(e.cx, e.cy), "#fff", 6, a * 0.8);
        var g = ctx.createRadialGradient(e.cx, e.cy, 0, e.cx, e.cy, e.w * 0.5); g.addColorStop(0, "rgba(96,165,250," + 0.35 * a + ")"); g.addColorStop(1, "rgba(96,165,250,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, e.w, e.h);
      } },
      heal: { dur: 1200, parts: function (e) { return parts(160, function () { return { x: Math.random(), y: Math.random(), s: rnd(2, 6), o: Math.random(), plus: Math.random() < 0.3 }; }); },
        draw: function (p, e, ps) {
          dim(p, 0.5);
          var g = ctx.createLinearGradient(0, e.h, 0, 0); g.addColorStop(0, "rgba(74,222,128," + 0.5 * Math.sin(p * Math.PI) + ")"); g.addColorStop(1, "rgba(74,222,128,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, e.w, e.h);
          ctx.fillStyle = "#86efac"; ctx.shadowColor = "#4ade80"; ctx.shadowBlur = 16;
          ps.forEach(function (q) { var lp = (p * 1.2 + q.o) % 1, x = q.x * e.w, y = e.h - lp * e.h * 1.2; ctx.globalAlpha = Math.sin(lp * Math.PI); if (q.plus) { ctx.fillRect(x - q.s * 1.5, y - q.s * 0.5, q.s * 3, q.s); ctx.fillRect(x - q.s * 0.5, y - q.s * 1.5, q.s, q.s * 3); } else { ctx.beginPath(); ctx.arc(x, y, q.s * 0.6, 0, TAU); ctx.fill(); } });
          ctx.shadowBlur = 0; ctx.globalAlpha = 1;
          ring(e.cx, e.cy, ease(p) * e.w * 0.7, "#86efac", 10 * (1 - p), 1 - p);
        } },
      precision: { dur: 1200, draw: function (p, e) {
        dim(p, 0.7);
        var col = "#f87171";
        if (p < 0.55) {
          var q = ease(p / 0.55), R = lerp(Math.max(e.w, e.h) * 0.7, 90, q);
          ctx.save(); ctx.translate(e.cx, e.cy); ctx.rotate(q * 3); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.shadowColor = col; ctx.shadowBlur = 20;
          ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, R * 0.6, 0, TAU); ctx.stroke();
          for (var i = 0; i < 4; i++) { var a = i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5); ctx.lineTo(Math.cos(a) * R * 1.3, Math.sin(a) * R * 1.3); ctx.stroke(); }
          ctx.restore(); ctx.shadowBlur = 0;
          ctx.font = "700 22px Rajdhani, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = col; ctx.fillText("LOCKING " + Math.round(q * 100) + "%", e.cx, e.cy + R + 36);
        } else {
          var q2 = (p - 0.55) / 0.45;
          flash((0.2 - q2) * 4, "#fff");
          ctx.globalAlpha = 1 - q2; glowLine(-50, e.cy + (e.cy - e.h * 0.5), e.w + 50, e.cy, col, 10, 40); glowLine(e.cx, -50, e.cx, e.h + 50, col, 4, 30); ctx.globalAlpha = 1;
          ring(e.cx, e.cy, q2 * e.w * 0.5, "#fff", 6, 1 - q2);
          parts(24, function (i) { var a = i / 24 * TAU; spark(e.cx + Math.cos(a) * q2 * e.w * 0.4, e.cy + Math.sin(a) * q2 * e.w * 0.4, 4, col, 1 - q2); });
        }
      } },
      drain: { dur: 1300, parts: function (e) { return parts(60, function () { return { a: Math.random() * TAU, o: Math.random(), s: rnd(3, 7) }; }); },
        draw: function (p, e, ps) {
          dim(p, 0.75);
          var col = "#ef4444", R = Math.max(e.w, e.h);
          var g = ctx.createRadialGradient(e.cx, e.cy, 0, e.cx, e.cy, R * 0.8); g.addColorStop(0, "rgba(127,29,29,0)"); g.addColorStop(1, "rgba(127,29,29," + 0.8 * Math.sin(p * Math.PI) + ")"); ctx.fillStyle = g; ctx.fillRect(0, 0, e.w, e.h);
          ctx.strokeStyle = "rgba(220,38,38,.7)"; ctx.lineWidth = 8; ctx.shadowColor = col; ctx.shadowBlur = 20; ctx.globalAlpha = Math.sin(p * Math.PI);
          for (var i = 0; i < 10; i++) { var a = i / 10 * TAU + p * 0.5, q = seg(p, 0.05, 0.5); ctx.beginPath(); ctx.moveTo(e.cx + Math.cos(a) * R, e.cy + Math.sin(a) * R); ctx.quadraticCurveTo(e.cx + Math.cos(a + 0.6) * R * 0.5, e.cy + Math.sin(a + 0.6) * R * 0.5, lerp(e.cx + Math.cos(a) * R, e.cx, q), lerp(e.cy + Math.sin(a) * R, e.cy, q)); ctx.stroke(); }
          ctx.shadowBlur = 0;
          ctx.fillStyle = col; ps.forEach(function (q) { var lp = (p * 1.5 + q.o) % 1, d = (1 - lp) * R * 0.7; ctx.beginPath(); ctx.arc(e.cx + Math.cos(q.a + lp) * d, e.cy + Math.sin(q.a + lp) * d, q.s * (1 - lp * 0.5), 0, TAU); ctx.fill(); });
          ctx.globalAlpha = 1;
          if (p > 0.5) { var hg = ctx.createRadialGradient(e.cx, e.cy, 0, e.cx, e.cy, 220); hg.addColorStop(0, "rgba(252,165,165," + (1 - p) + ")"); hg.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = hg; ctx.fillRect(0, 0, e.w, e.h); }
        } },
      focus: { dur: 1200, draw: function (p, e) {
        dim(p, 0.6);
        var col = "#c084fc", R = Math.max(e.w, e.h) * 0.8;
        for (var i = 0; i < 6; i++) { var q = (p * 1.2 + i / 6) % 1; ring(e.cx, e.cy, R * (1 - q), i % 2 ? col : "#fff", 4 + q * 8, q * 0.9); }
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        var g = ctx.createRadialGradient(e.cx, e.cy, 0, e.cx, e.cy, R * 0.4); g.addColorStop(0, "rgba(233,213,255," + 0.8 * Math.sin(p * Math.PI) + ")"); g.addColorStop(1, "rgba(192,132,252,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, e.w, e.h);
        ctx.restore();
        parts(36, function (i) { var a = i / 36 * TAU + p * 5, d = R * 0.5 * (1 - ease(p)) + 60; spark(e.cx + Math.cos(a) * d, e.cy + Math.sin(a) * d * 0.6, 4, "#e9d5ff", 1); });
        if (p > 0.85) flash((p - 0.85) * 4, col);
      } },
      poison: { dur: 1300, parts: function (e) { return parts(90, function () { return { x: Math.random(), y: Math.random(), s: rnd(6, 26), o: Math.random() }; }); },
        draw: function (p, e, ps) {
          dim(p, 0.65);
          var col = "#22c55e";
          var g = ctx.createRadialGradient(e.cx, e.cy, e.w * 0.1, e.cx, e.cy, Math.max(e.w, e.h) * 0.8); g.addColorStop(0, "rgba(34,197,94,0)"); g.addColorStop(1, "rgba(22,101,52," + 0.85 * seg(p, 0, 0.4) * (p < 0.85 ? 1 : (1 - p) / 0.15) + ")"); ctx.fillStyle = g; ctx.fillRect(0, 0, e.w, e.h);
          ctx.fillStyle = "rgba(134,239,172,.55)"; ctx.shadowColor = col; ctx.shadowBlur = 16;
          ps.forEach(function (q) { var lp = (p + q.o) % 1; ctx.globalAlpha = Math.sin(lp * Math.PI) * 0.7; ctx.beginPath(); ctx.arc(q.x * e.w, e.h * 1.1 - lp * e.h * 1.3, q.s * lp, 0, TAU); ctx.fill(); });
          ctx.shadowBlur = 0; ctx.globalAlpha = 1;
          var sq = seg(p, 0.3, 0.6);
          ctx.font = "900 " + Math.round(120 + sq * 120) + "px sans-serif"; ctx.textAlign = "center"; ctx.globalAlpha = Math.sin(seg(p, 0.3, 1) * Math.PI); ctx.shadowColor = col; ctx.shadowBlur = 40; ctx.fillStyle = "#bbf7d0"; ctx.fillText("☠", e.cx, e.cy + 80); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        } },
      weaken: { dur: 1300, draw: function (p, e) {
        dim(p, 0.75);
        var col = "#a78bfa", R = Math.max(e.w, e.h) * 0.55;
        ctx.strokeStyle = col; ctx.lineWidth = 7; ctx.shadowColor = col; ctx.shadowBlur = 22; ctx.globalAlpha = p < 0.8 ? 1 : (1 - p) / 0.2;
        for (var k = 0; k < 3; k++) {
          ctx.beginPath(); var turns = ease(seg(p, 0, 0.7)) * 4;
          for (var i = 0; i <= 120; i++) { var q = i / 120 * turns, a = q * TAU + k * TAU / 3, r = R * (1 - q / 4.4), x = e.cx + Math.cos(a) * r, y = e.cy + Math.sin(a) * r * 0.75; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
          ctx.stroke();
        }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        var g = ctx.createRadialGradient(e.cx, e.cy, 0, e.cx, e.cy, R); g.addColorStop(0, "rgba(76,29,149,0)"); g.addColorStop(1, "rgba(46,16,101," + 0.7 * Math.sin(p * Math.PI) + ")"); ctx.fillStyle = g; ctx.fillRect(0, 0, e.w, e.h);
        for (var j = 0; j < 8; j++) { var ca = j / 8 * TAU + p, L = Math.max(e.w, e.h); ctx.strokeStyle = "rgba(167,139,250," + 0.5 * seg(p, 0.4, 0.7) * (1 - seg(p, 0.85, 1)) + ")"; ctx.lineWidth = 3; ctx.setLineDash([14, 10]); ctx.beginPath(); ctx.moveTo(e.cx + Math.cos(ca) * L, e.cy + Math.sin(ca) * L); ctx.lineTo(e.cx, e.cy); ctx.stroke(); ctx.setLineDash([]); }
      } },
      stun: { dur: 1200, parts: function (e) {
        var bolts = [];
        for (var b = 0; b < 4; b++) { var x0 = e.w * (0.2 + Math.random() * 0.6), pts = [[x0, -20]], n = 12; for (var i = 1; i <= n; i++) pts.push([lerp(x0, e.cx, i / n) + (i < n ? rnd(-e.w * 0.08, e.w * 0.08) : 0), lerp(-20, e.cy, i / n)]); bolts.push({ pts: pts, at: b * 0.08 }); }
        return bolts;
      }, draw: function (p, e, bolts) {
        dim(p, 0.8);
        var col = "#fde047";
        bolts.forEach(function (b) {
          var q = seg(p, b.at, b.at + 0.3), n = Math.ceil(q * b.pts.length); if (n < 2) return;
          ctx.globalAlpha = p < 0.5 ? 1 : (1 - seg(p, 0.5, 0.8)); ctx.strokeStyle = col; ctx.lineWidth = 9; ctx.lineJoin = "round"; ctx.shadowColor = col; ctx.shadowBlur = 40;
          ctx.beginPath(); for (var i = 0; i < n; i++) { if (i === 0) ctx.moveTo(b.pts[i][0], b.pts[i][1]); else ctx.lineTo(b.pts[i][0], b.pts[i][1]); } ctx.stroke();
          ctx.shadowBlur = 0; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.stroke();
          for (var k = 2; k < n - 1; k += 3) { var P = b.pts[k]; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.globalAlpha *= 0.8; ctx.beginPath(); ctx.moveTo(P[0], P[1]); ctx.lineTo(P[0] + rnd(-90, 90), P[1] + rnd(20, 90)); ctx.stroke(); }
          ctx.globalAlpha = 1;
        });
        if (p > 0.25 && p < 0.45) flash((0.45 - p) * 4, "#fff");
        if (p > 0.3) { var r = seg(p, 0.3, 1); ring(e.cx, e.cy, r * e.w * 0.6, col, 10 * (1 - r), 1 - r); parts(30, function (i) { var a = i / 30 * TAU; spark(e.cx + Math.cos(a) * r * e.w * 0.5, e.cy + Math.sin(a) * r * e.w * 0.5, 5, i % 2 ? "#fff" : col, 1 - r); }); }
      } },
      reflect: { dur: 1200, draw: function (p, e) {
        dim(p, 0.6);
        var a = p < 0.8 ? ease(seg(p, 0, 0.3)) : (1 - p) / 0.2, n = 7;
        for (var i = 0; i < n; i++) {
          var x = e.w * (i + 0.5) / n, wdt = e.w / n * 0.6, h = e.h * 0.8 * a, y = e.cy - h / 2;
          ctx.save(); ctx.translate(x, e.cy); ctx.rotate((i - n / 2) * 0.06); ctx.translate(-x, -e.cy);
          var g = ctx.createLinearGradient(x - wdt / 2, y, x + wdt / 2, y + h); g.addColorStop(0, "rgba(255,255,255," + 0.9 * a + ")"); g.addColorStop(0.5, "rgba(186,230,253," + 0.35 * a + ")"); g.addColorStop(1, "rgba(255,255,255," + 0.85 * a + ")");
          ctx.fillStyle = g; ctx.shadowColor = "#bae6fd"; ctx.shadowBlur = 30; ctx.fillRect(x - wdt / 2, y, wdt, h); ctx.shadowBlur = 0;
          var gy = y + ((p * 2 + i * 0.15) % 1) * h; ctx.fillStyle = "rgba(255,255,255," + a + ")"; ctx.fillRect(x - wdt / 2 - 6, gy - 8, wdt + 12, 16);
          ctx.restore();
        }
        if (p > 0.3 && p < 0.4) flash((0.4 - p) * 4, "#e0f2fe");
      } },
      snap: snapFx(false),
      snapMax: snapFx(true),
      destiny: destinyFx(),
      burst: { dur: 1500, parts: function (e) { return parts(160, function () { return { a: Math.random() * TAU, s: rnd(0.2, 1), r: rnd(3, 8) }; }); },
        draw: function (p, e, ps) {
          dim(p, 0.8);
          var R = Math.max(e.w, e.h);
          if (p < 0.3) {
            var q = p / 0.3;
            ring(e.cx, e.cy, R * 0.5 * (1 - q) + 10, e.c1, 6, q);
            parts(20, function (i) { var a = i / 20 * TAU + q * 4, d = R * 0.45 * (1 - q); spark(e.cx + Math.cos(a) * d, e.cy + Math.sin(a) * d, 6, "#fff", 1); });
            var g0 = ctx.createRadialGradient(e.cx, e.cy, 0, e.cx, e.cy, 80 + q * 60); g0.addColorStop(0, "#fff"); g0.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = g0; ctx.fillRect(0, 0, e.w, e.h);
          } else {
            var q2 = (p - 0.3) / 0.7;
            flash((0.3 - q2) * 3.4, "#fff");
            ctx.save(); ctx.globalCompositeOperation = "lighter";
            var g = ctx.createRadialGradient(e.cx, e.cy, 0, e.cx, e.cy, R * q2 + 10); g.addColorStop(0, "rgba(255,255,255," + (1 - q2) + ")"); g.addColorStop(0.35, e.c1); g.addColorStop(0.7, e.c2); g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.globalAlpha = 1 - q2; ctx.fillStyle = g; ctx.fillRect(0, 0, e.w, e.h);
            ps.forEach(function (q) { var d = R * q.s * ease(q2); spark(e.cx + Math.cos(q.a) * d, e.cy + Math.sin(q.a) * d, q.r * (1 - q2 * 0.6), Math.random() < 0.5 ? e.c1 : "#fff", 1 - q2); });
            ctx.restore(); ctx.globalAlpha = 1;
            ring(e.cx, e.cy, q2 * R, "#fff", 14 * (1 - q2), 1 - q2); ring(e.cx, e.cy, q2 * R * 0.8, e.c1, 24 * (1 - q2), 1 - q2); ring(e.cx, e.cy, q2 * R * 0.55, e.c2, 30 * (1 - q2), 1 - q2);
          }
        } },
      barrage: { dur: 1400, parts: function (e) { return parts(26, function (i) { return { y: Math.random(), at: i * 0.025, sp: rnd(1.4, 2.2), len: rnd(160, 360), col: e.colors[i % e.colors.length], dir: e.from.x < e.to.x ? 1 : -1 }; }); },
        draw: function (p, e, ps) {
          dim(p, 0.7);
          ctx.lineCap = "round";
          ps.forEach(function (m) {
            var q = seg(p, m.at, m.at + 0.5); if (q <= 0) return;
            var x = m.dir > 0 ? -m.len + q * (e.w + m.len * 2) * m.sp / 1.8 : e.w + m.len - q * (e.w + m.len * 2) * m.sp / 1.8, y = m.y * e.h * 0.9 + e.h * 0.05 + Math.sin(q * 8) * 10;
            var g = ctx.createLinearGradient(x, y, x - m.dir * m.len, y); g.addColorStop(0, "#fff"); g.addColorStop(0.3, m.col); g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.strokeStyle = g; ctx.lineWidth = 10; ctx.shadowColor = m.col; ctx.shadowBlur = 24; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - m.dir * m.len, y); ctx.stroke(); ctx.shadowBlur = 0;
            spark(x, y, 9, "#fff", 1);
          });
          if (p > 0.5) { var r = seg(p, 0.5, 1); for (var k = 0; k < 5; k++) { var rk = (r + k * 0.2) % 1; ring(e.to.x, e.to.y, rk * e.w * 0.35, e.c1, 8 * (1 - rk), (1 - rk) * (1 - r)); } }
        } },
      execute: { dur: 1400, draw: function (p, e) {
        dim(p, 0.85);
        var col = "#ef4444";
        if (p < 0.4) {
          var q = Math.pow(p / 0.4, 2.5), y = lerp(-e.h * 0.6, e.cy + 60, q), bw = e.w * 0.07;
          ctx.save(); ctx.translate(e.cx, y); ctx.shadowColor = col; ctx.shadowBlur = 50;
          ctx.fillStyle = "#e2e8f0"; ctx.beginPath(); ctx.moveTo(-bw, -e.h * 0.6); ctx.lineTo(bw, -e.h * 0.6); ctx.lineTo(bw * 1.4, 0); ctx.lineTo(0, bw * 1.4); ctx.lineTo(-bw * 1.4, 0); ctx.closePath(); ctx.fill();
          ctx.fillStyle = col; ctx.fillRect(-bw * 0.4, -e.h * 0.8, bw * 0.8, e.h * 0.2);
          ctx.restore(); ctx.shadowBlur = 0;
          ctx.fillStyle = "rgba(239,68,68," + 0.25 * q + ")"; ctx.fillRect(0, 0, e.w, e.h);
        } else {
          var q2 = (p - 0.4) / 0.6;
          flash((0.2 - q2) * 4, col);
          var L = Math.max(e.w, e.h);
          ctx.globalAlpha = 1 - q2 * 0.8;
          glowLine(e.cx - L, e.cy - L, e.cx + L, e.cy + L, col, 26, 50); glowLine(e.cx + L, e.cy - L, e.cx - L, e.cy + L, col, 26, 50);
          ctx.globalAlpha = 1;
          ctx.font = "900 " + Math.round(80 + q2 * 40) + "px Cinzel, serif"; ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.shadowColor = col; ctx.shadowBlur = 40; ctx.globalAlpha = 1 - q2; ctx.fillText("EXECUTE", e.cx, e.cy + e.h * 0.3); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
          parts(40, function (i) { var a = i / 40 * TAU; spark(e.cx + Math.cos(a) * q2 * L * 0.6, e.cy + Math.sin(a) * q2 * L * 0.6, 5, i % 2 ? col : "#fff", 1 - q2); });
        }
      } },
      shield: { dur: 1200, draw: function (p, e) {
        dim(p, 0.55);
        var col = "#38bdf8", R = Math.max(e.w, e.h) * 0.62 * ease(seg(p, 0, 0.45)), a = p < 0.8 ? 1 : (1 - p) / 0.2;
        ctx.globalAlpha = a;
        var g = ctx.createRadialGradient(e.cx, e.cy, R * 0.6, e.cx, e.cy, R); g.addColorStop(0, "rgba(56,189,248,0)"); g.addColorStop(0.85, "rgba(56,189,248,.3)"); g.addColorStop(1, "rgba(224,242,254,.95)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.cx, e.cy, R, 0, TAU); ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.arc(e.cx, e.cy, R, 0, TAU); ctx.clip(); ctx.strokeStyle = "rgba(224,242,254,.45)"; ctx.lineWidth = 2; var hs = 56;
        for (var yy = e.cy - R; yy < e.cy + R; yy += hs * 0.87) for (var xx = e.cx - R; xx < e.cx + R; xx += hs * 1.5) { var ox = ((Math.round((yy - e.cy) / (hs * 0.87)) % 2) ? hs * 0.75 : 0) + xx; ctx.beginPath(); for (var k = 0; k < 6; k++) { var an = k / 6 * TAU + Math.PI / 6; ctx.lineTo(ox + Math.cos(an) * hs / 2, yy + Math.sin(an) * hs / 2); } ctx.closePath(); ctx.stroke(); }
        ctx.restore();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 5; ctx.shadowColor = col; ctx.shadowBlur = 30; ctx.beginPath(); ctx.arc(e.cx, e.cy, R, 0, TAU); ctx.stroke();
        var gy = e.cy - R + ((p * 1.5) % 1) * R * 2; ctx.beginPath(); ctx.moveTo(e.cx - R, gy); ctx.lineTo(e.cx + R, gy); ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        if (p > 0.4 && p < 0.5) flash((0.5 - p) * 3, "#e0f2fe");
      } }
    };

    /* ---------- Cinematics: every move is a little scene, like the snap. Something is drawn doing an action
       (a sword swings, a hammer slams down, a scope locks on...), builds up, pays off with an impact, and fades.
       `impact` is when it lands: the shake, the boom and the target's reaction in the arena happen then. ---------- */
    function cineDark(p) {
      var e = drawingEnv, fade = 1 - seg(p, 0.86, 1);
      if (e && e.skipSig) return fade; /* a wrapper (epic) already painted the backdrop and sigil */
      ctx.fillStyle = "rgba(3,2,10," + (0.9 * Math.min(1, p / 0.08) * fade) + ")"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (e && e.sig) drawSig(e, p, false, fade);
      return fade;
    }
    function moteParts(n) { return parts(n, function () { return { x: Math.random(), y: Math.random(), r: rnd(0.5, 1.8), v: rnd(0.05, 0.25) }; }); }

    /* ---------- Per-aura signature: every aura gets its own magic circle, glyphs, particles and backdrop,
       derived from its id, so its abilities look unlike any other aura's (the archetype action still plays on
       top so you can tell a strike from a smash). ---------- */
    function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
    var GLYPHSETS = [
      "\u16A0\u16A2\u16A6\u16A8\u16B1\u16B2\u16B7\u16B9\u16BA\u16BE\u16C1\u16C3\u16C7\u16C8\u16C9\u16CA\u16CF\u16D2\u16D6\u16D7\u16DA\u16DC\u16DE\u16DF",
      "\u03B1\u03B2\u03B3\u03B4\u03B5\u03B6\u03B7\u03B8\u03BB\u03BC\u03BE\u03C0\u03C1\u03C3\u03C6\u03C8\u03C9",
      "\u2600\u263D\u263F\u2640\u2642\u2643\u2644\u2605\u2606\u2735\u2726\u2727\u269B\u2638",
      "\u25C7\u25C6\u25CB\u25CF\u25A1\u25A0\u25B3\u25BD\u25C8\u2756\u273B\u273D\u2742",
      "\u2648\u2649\u264A\u264B\u264C\u264D\u264E\u264F\u2650\u2651\u2652\u2653",
      "\u16C6\u16B7\u25A0\u2726\u25B2\u16D7\u2605\u25C6\u2742\u16BE\u25CF\u273F"
    ];
    var SIG_PARTICLES = ["embers", "petals", "snow", "sparks", "bubbles", "motes", "shards", "ash"];
    var SIG_BACKDROPS = ["rays", "nebula", "starfield", "aurora", "rain", "voidrings", "grid"];
    var SIG_CORES = ["dot", "poly", "ring", "eye", "cross", "sun", "diamond"];

    /* A deterministic bundle of look settings for one aura. */
    function auraSig(aura) {
      var id = aura && aura.id != null ? aura.id : 0, rng = mulberry32((id + 1) * 2654435761 >>> 0);
      var sig = {
        sides: 3 + Math.floor(rng() * 7),           /* 3..9 */
        star: rng() < 0.5,                          /* pointed star vs flat polygon */
        rings: 1 + Math.floor(rng() * 3),           /* 1..3 concentric rings */
        spin: rng() < 0.5 ? 1 : -1,
        spd: 1 + rng() * 2.4,
        glyph: Math.floor(rng() * GLYPHSETS.length),
        glyphN: 10 + Math.floor(rng() * 16),
        ticks: rng() < 0.6,
        inner: rng() < 0.6,
        innerStar: rng() < 0.5,
        innerSides: 3 + Math.floor(rng() * 5),
        particle: Math.floor(rng() * SIG_PARTICLES.length),
        backdrop: Math.floor(rng() * SIG_BACKDROPS.length),
        core: Math.floor(rng() * SIG_CORES.length),
        wob: rng() * TAU
      };
      /* stable particle seeds so nothing jitters frame to frame */
      sig.pp = parts(70, function () { return { x: rng(), y: rng(), a: rng() * TAU, d: rng(), v: 0.2 + rng() * 1.1, r: 0.6 + rng() * 2.8, ph: rng() * TAU, o: rng() }; });
      /* stable backdrop seeds */
      sig.bb = parts(60, function () { return { x: rng(), y: rng(), r: 0.05 + rng() * 0.2, a: rng() * TAU, l: rng(), o: rng(), tw: rng() * TAU }; });
      return sig;
    }

    function sigPoly(n, r, star, inner) {
      ctx.beginPath();
      var pts = star ? n * 2 : n;
      for (var i = 0; i < pts; i++) { var a = i / pts * TAU - Math.PI / 2, rr = star && i % 2 ? r * (inner || 0.5) : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath();
    }

    /* Draw an aura's signature: backdrop, then a rotating magic circle with glyphs, then drifting particles.
       `big` makes it the bold centrepiece (for the rarest auras); otherwise it sits softly behind the move. */
    function drawSig(e, p, big, fade) {
      var sig = e.sig, s = Math.min(e.w, e.h), R = Math.hypot(e.w, e.h) / 2, cx = e.cx, cy = e.cy;
      fade = fade == null ? 1 : fade;
      var intro = ease(seg(p, 0, big ? 0.22 : 0.3)), base = (big ? 0.95 : 0.5) * intro * fade;
      var col = e.colors && e.colors.length ? e.colors : [e.c1, e.c2];
      var pick = function (i) { return col[i % col.length]; };

      /* ---- backdrop ---- */
      var bd = SIG_BACKDROPS[sig.backdrop];
      if (bd === "rays") {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(p * 0.6 * sig.spin);
        for (var i = 0; i < 16; i++) { ctx.rotate(TAU / 16); var g = ctx.createLinearGradient(0, 0, R, 0); g.addColorStop(0, pick(i)); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.globalAlpha = 0.12 * base; ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R, -R * 0.05); ctx.lineTo(R, R * 0.05); ctx.fill(); }
        ctx.restore();
      } else if (bd === "nebula") {
        sig.bb.slice(0, 8).forEach(function (b, i) { var x = b.x * e.w, y = b.y * e.h, rr = s * (0.15 + b.r); var g = ctx.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, pick(i)); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.globalAlpha = 0.18 * base; ctx.fillStyle = g; ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2); });
      } else if (bd === "starfield") {
        sig.bb.forEach(function (b) { ctx.globalAlpha = (0.3 + 0.5 * Math.abs(Math.sin(b.tw + p * 6))) * base; spark(b.x * e.w, b.y * e.h, b.o * 1.8 + 0.4, "#fff", ctx.globalAlpha); });
      } else if (bd === "aurora") {
        for (var k = 0; k < 4; k++) { ctx.globalAlpha = 0.1 * base; ctx.strokeStyle = pick(k); ctx.lineWidth = s * 0.08; ctx.beginPath(); for (var x = 0; x <= e.w; x += 30) ctx.lineTo(x, e.h * (0.2 + k * 0.2) + Math.sin(x * 0.01 + p * 3 + k) * s * 0.06); ctx.stroke(); }
      } else if (bd === "rain") {
        ctx.globalAlpha = 0.25 * base; ctx.strokeStyle = pick(0); ctx.lineWidth = 1.5;
        sig.bb.forEach(function (b) { var y = ((b.y + p * b.l * 2) % 1) * e.h; ctx.beginPath(); ctx.moveTo(b.x * e.w, y); ctx.lineTo(b.x * e.w + s * 0.03, y + s * 0.07); ctx.stroke(); });
      } else if (bd === "voidrings") {
        for (var vr = 0; vr < 5; vr++) { var q = ((p * 0.6 + vr / 5) % 1); ctx.globalAlpha = (1 - q) * 0.2 * base; ring(cx, cy, R * q, pick(vr), 2, ctx.globalAlpha); }
      } else { /* grid */
        ctx.globalAlpha = 0.1 * base; ctx.strokeStyle = pick(0); ctx.lineWidth = 1; var gs = s * 0.08, off = (p * gs) % gs;
        for (var gx = -off; gx < e.w; gx += gs) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, e.h); ctx.stroke(); }
        for (var gy = -off; gy < e.h; gy += gs) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(e.w, gy); ctx.stroke(); }
      }
      ctx.globalAlpha = 1;

      /* ---- the magic circle ---- */
      var rr = s * (big ? 0.38 : 0.3) * (0.6 + 0.4 * intro);
      ctx.save(); ctx.translate(cx, cy);
      ctx.globalAlpha = (big ? 0.9 : 0.5) * intro * fade;
      ctx.shadowColor = e.c1; ctx.shadowBlur = big ? 22 : 12; ctx.lineWidth = big ? 3 : 2;
      ctx.save(); ctx.rotate(p * sig.spd * sig.spin);
      for (var ri = 0; ri < sig.rings; ri++) { ctx.strokeStyle = pick(ri); ctx.beginPath(); ctx.arc(0, 0, rr * (1 - ri * 0.14), 0, TAU); ctx.stroke(); }
      ctx.strokeStyle = e.c1; sigPoly(sig.sides, rr * 0.86, sig.star, 0.52); ctx.stroke();
      if (sig.ticks) { for (var t2 = 0; t2 < sig.glyphN; t2++) { var ta = t2 / sig.glyphN * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(ta) * rr, Math.sin(ta) * rr); ctx.lineTo(Math.cos(ta) * rr * 1.06, Math.sin(ta) * rr * 1.06); ctx.stroke(); } }
      ctx.restore();
      /* glyph ring, counter-spin */
      ctx.save(); ctx.rotate(-p * sig.spd * 0.7 * sig.spin);
      ctx.fillStyle = e.c1; ctx.font = Math.round(rr * 0.12) + "px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      var gl = GLYPHSETS[sig.glyph];
      for (var gi = 0; gi < sig.glyphN; gi++) { var ga = gi / sig.glyphN * TAU; ctx.save(); ctx.rotate(ga); ctx.fillText(gl.charAt(gi % gl.length), 0, -rr * 0.93); ctx.restore(); }
      ctx.restore();
      /* inner shape */
      if (sig.inner) { ctx.save(); ctx.rotate(p * sig.spd * 1.5 * sig.spin + sig.wob); ctx.strokeStyle = e.c2; ctx.shadowColor = e.c2; sigPoly(sig.innerSides, rr * 0.6, sig.innerStar, 0.5); ctx.stroke(); ctx.restore(); }
      /* core emblem */
      ctx.rotate(-p * sig.spd * sig.spin); ctx.fillStyle = e.c1; ctx.strokeStyle = e.c1; ctx.shadowColor = e.c1; ctx.shadowBlur = big ? 26 : 14;
      var cr = rr * 0.22, core = SIG_CORES[sig.core];
      if (core === "dot") { spark(0, 0, cr * 0.5, e.c1, ctx.globalAlpha); }
      else if (core === "poly") { sigPoly(sig.sides, cr, false, 0); ctx.fill(); }
      else if (core === "ring") { ctx.lineWidth = big ? 4 : 2; ctx.beginPath(); ctx.arc(0, 0, cr * 0.7, 0, TAU); ctx.stroke(); }
      else if (core === "eye") { ctx.save(); ctx.scale(1, 0.6); ctx.beginPath(); ctx.arc(0, 0, cr, 0, TAU); ctx.fill(); ctx.restore(); ctx.fillStyle = "#0b0a12"; spark(0, 0, cr * 0.4, "#0b0a12", ctx.globalAlpha); }
      else if (core === "cross") { ctx.fillRect(-cr * 0.18, -cr, cr * 0.36, cr * 2); ctx.fillRect(-cr, -cr * 0.18, cr * 2, cr * 0.36); }
      else if (core === "sun") { for (var sp = 0; sp < 12; sp++) { var sa = sp / 12 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(sa) * cr * 0.5, Math.sin(sa) * cr * 0.5); ctx.lineTo(Math.cos(sa) * cr * 1.1, Math.sin(sa) * cr * 1.1); ctx.lineWidth = 2; ctx.stroke(); } spark(0, 0, cr * 0.5, e.c1, ctx.globalAlpha); }
      else { ctx.save(); ctx.rotate(Math.PI / 4); ctx.fillRect(-cr * 0.5, -cr * 0.5, cr, cr); ctx.restore(); }
      ctx.restore(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;

      /* ---- particles ---- */
      var kind = SIG_PARTICLES[sig.particle], pa = base * (big ? 1 : 0.8);
      sig.pp.forEach(function (q, i) {
        var c = i % 3 === 0 ? "#fff" : pick(i), x, y, a2 = pa;
        if (kind === "embers" || kind === "bubbles" || kind === "ash") { var t = ((q.y + p * q.v * (kind === "ash" ? 0.4 : 0.7)) % 1); x = q.x * e.w + Math.sin(q.ph + p * 4) * 16; y = (1 - t) * e.h; a2 *= t; if (kind === "ash") c = i % 2 ? "#8c8276" : pick(i); }
        else if (kind === "petals" || kind === "snow") { var t2 = ((q.y + p * q.v * 0.6) % 1); x = q.x * e.w + Math.sin(q.ph + p * (kind === "petals" ? 5 : 2)) * (kind === "petals" ? 34 : 14); y = t2 * e.h; a2 *= 0.9; if (kind === "snow") c = "#eef"; }
        else if (kind === "sparks" || kind === "shards") { var t3 = (p * q.v * 1.6 + q.o) % 1; var d = R * (0.1 + t3 * 0.9); x = cx + Math.cos(q.a) * d; y = cy + Math.sin(q.a) * d; a2 *= (1 - t3); }
        else { var t4 = ((q.y + p * q.v * 0.25) % 1); x = q.x * e.w; y = t4 * e.h; a2 *= 0.6; }
        if (kind === "shards") { ctx.save(); ctx.translate(x, y); ctx.rotate(q.a + p * 6); ctx.globalAlpha = a2; ctx.fillStyle = c; ctx.fillRect(-q.r, -q.r * 0.4, q.r * 2, q.r * 0.8); ctx.restore(); }
        else if (kind === "petals") { ctx.save(); ctx.translate(x, y); ctx.rotate(q.ph + p * 5); ctx.globalAlpha = a2; ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 0, q.r * 1.6, q.r * 0.7, 0, 0, TAU); ctx.fill(); ctx.restore(); }
        else spark(x, y, q.r * (big ? 1 : 0.8), c, a2);
      });
      ctx.globalAlpha = 1;
    }
    function motes(e, ms, p, fade, col) { ms.forEach(function (m) { spark(m.x * e.w, ((m.y - p * m.v) % 1 + 1) % 1 * e.h, m.r, col || "#fff", 0.35 * fade); }); }
    function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }
    function bolt(x1, y1, x2, y2, jag, col, width, depth) {
      var pts = [[x1, y1]], n = 12;
      for (var i = 1; i < n; i++) { var t = i / n; pts.push([lerp(x1, x2, t) + rnd(-jag, jag), lerp(y1, y2, t) + rnd(-jag * 0.3, jag * 0.3)]); }
      pts.push([x2, y2]);
      [[width * 3, col, 30], [width, "#ffffff", 10]].forEach(function (L) {
        ctx.strokeStyle = L[1]; ctx.lineWidth = L[0]; ctx.shadowColor = col; ctx.shadowBlur = L[2]; ctx.lineJoin = "round";
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); pts.forEach(function (q) { ctx.lineTo(q[0], q[1]); }); ctx.stroke();
      });
      ctx.shadowBlur = 0;
      if (depth > 0) for (var b = 0; b < 3; b++) { var k = 3 + Math.floor(Math.random() * 7), q = pts[k]; bolt(q[0], q[1], q[0] + rnd(-1, 1) * jag * 4, q[1] + rnd(0.3, 1) * jag * 4, jag * 0.5, col, width * 0.45, depth - 1); }
    }
    /* A sword along +x from its grip (0,0), length L. */
    function drawBlade(L, col, glow) {
      var w = L * 0.065;
      ctx.shadowColor = col; ctx.shadowBlur = glow;
      var g = ctx.createLinearGradient(0, -w, 0, w); g.addColorStop(0, "#ffffff"); g.addColorStop(0.45, "#cbd5e1"); g.addColorStop(0.55, "#64748b"); g.addColorStop(1, "#e2e8f0");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(L * 0.2, -w * 0.5); ctx.lineTo(L * 0.9, -w * 0.42); ctx.lineTo(L, 0); ctx.lineTo(L * 0.9, w * 0.42); ctx.lineTo(L * 0.2, w * 0.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = w * 0.2; ctx.beginPath(); ctx.moveTo(L * 0.24, 0); ctx.lineTo(L * 0.84, 0); ctx.stroke();
      ctx.shadowBlur = glow * 0.5; ctx.fillStyle = "#facc15"; rrect(L * 0.16, -w * 1.7, L * 0.04, w * 3.4, w * 0.3); ctx.fill();
      ctx.fillStyle = "#3f2a14"; ctx.fillRect(L * 0.03, -w * 0.32, L * 0.13, w * 0.64);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(L * 0.025, 0, w * 0.55, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    }
    /* A war hammer along -y from its handle end (0,0), size S. */
    function drawHammer(S, col, glow) {
      ctx.shadowColor = col; ctx.shadowBlur = glow;
      ctx.fillStyle = "#4a2f17"; rrect(-S * 0.035, -S * 0.75, S * 0.07, S * 0.75, S * 0.02); ctx.fill();
      var g = ctx.createLinearGradient(0, -S * 1.02, 0, -S * 0.72); g.addColorStop(0, "#e2e8f0"); g.addColorStop(0.5, "#94a3b8"); g.addColorStop(1, "#475569");
      ctx.fillStyle = g; rrect(-S * 0.3, -S * 1.02, S * 0.6, S * 0.3, S * 0.05); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = S * 0.018; rrect(-S * 0.26, -S * 0.98, S * 0.52, S * 0.22, S * 0.04); ctx.stroke();
      ctx.fillStyle = col; ctx.font = Math.round(S * 0.14) + "px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("ᚦ", 0, -S * 0.87);
      ctx.shadowBlur = 0;
    }
    function drawShieldShape(S) { ctx.beginPath(); ctx.moveTo(0, -S * 0.55); ctx.quadraticCurveTo(S * 0.45, -S * 0.5, S * 0.42, -S * 0.1); ctx.quadraticCurveTo(S * 0.36, S * 0.35, 0, S * 0.6); ctx.quadraticCurveTo(-S * 0.36, S * 0.35, -S * 0.42, -S * 0.1); ctx.quadraticCurveTo(-S * 0.45, -S * 0.5, 0, -S * 0.55); ctx.closePath(); }
    function drawEye(x, y, S, open, iris, pupil, rot) {
      ctx.save(); ctx.translate(x, y);
      ctx.beginPath(); ctx.moveTo(-S, 0); ctx.quadraticCurveTo(0, -S * 0.75 * open, S, 0); ctx.quadraticCurveTo(0, S * 0.75 * open, -S, 0); ctx.closePath();
      ctx.save(); ctx.clip();
      ctx.fillStyle = "#f1f5f9"; ctx.fillRect(-S, -S, S * 2, S * 2);
      var g = ctx.createRadialGradient(0, 0, S * 0.05, 0, 0, S * 0.42); g.addColorStop(0, "#fff"); g.addColorStop(0.35, iris); g.addColorStop(1, "#000");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, S * 0.42, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 2; ctx.rotate(rot);
      for (var i = 0; i < 18; i++) { ctx.rotate(TAU / 18); ctx.beginPath(); ctx.moveTo(S * 0.12, 0); ctx.lineTo(S * 0.38, S * 0.05); ctx.stroke(); }
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(0, 0, S * 0.07 * pupil, S * 0.2 * pupil, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-S * 0.12, -S * 0.12, S * 0.05, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = iris; ctx.shadowColor = iris; ctx.shadowBlur = 25; ctx.lineWidth = S * 0.04;
      ctx.beginPath(); ctx.moveTo(-S, 0); ctx.quadraticCurveTo(0, -S * 0.75 * open, S, 0); ctx.quadraticCurveTo(0, S * 0.75 * open, -S, 0); ctx.stroke();
      ctx.shadowBlur = 0; ctx.restore();
    }
    function drawSkull(x, y, S, col, a) {
      ctx.save(); ctx.translate(x, y); ctx.globalAlpha = a; ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 30;
      ctx.beginPath(); ctx.arc(0, -S * 0.1, S * 0.5, Math.PI * 0.85, Math.PI * 2.15); ctx.lineTo(S * 0.3, S * 0.45); ctx.lineTo(-S * 0.3, S * 0.45); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.globalCompositeOperation = "destination-out";
      [[-0.2, -0.05], [0.2, -0.05]].forEach(function (o) { ctx.beginPath(); ctx.ellipse(o[0] * S, o[1] * S, S * 0.13, S * 0.16, 0, 0, TAU); ctx.fill(); });
      ctx.beginPath(); ctx.moveTo(0, S * 0.12); ctx.lineTo(-S * 0.06, S * 0.24); ctx.lineTo(S * 0.06, S * 0.24); ctx.fill();
      for (var t = -2; t <= 2; t++) ctx.fillRect(t * S * 0.09 - S * 0.025, S * 0.32, S * 0.05, S * 0.12);
      ctx.restore();
    }
    function chainLinks(x1, y1, x2, y2, reach, col, size) {
      var L = Math.hypot(x2 - x1, y2 - y1), n = Math.floor(L * reach / (size * 1.5)), a = Math.atan2(y2 - y1, x2 - x1);
      for (var i = 0; i < n; i++) {
        var t = i * size * 1.5 / L, x = lerp(x1, x2, t), y = lerp(y1, y2, t);
        ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.strokeStyle = i % 2 ? "#cbd5e1" : col; ctx.shadowColor = col; ctx.shadowBlur = 10; ctx.lineWidth = size * 0.28;
        ctx.beginPath(); if (i % 2) ctx.ellipse(0, 0, size, size * 0.45, 0, 0, TAU); else ctx.ellipse(0, 0, size, size * 0.12, 0, 0, TAU); ctx.stroke(); ctx.restore();
      }
      ctx.shadowBlur = 0;
    }
    function hexAt(x, y, r) { ctx.beginPath(); for (var i = 0; i < 6; i++) { var a = i / 6 * TAU + Math.PI / 6; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); }

    var CINE = {
      /* A giant sword forms out of light, winds back, and swings in one huge arc; the screen is cut in two. */
      strike: { dur: 1900, impact: 0.53, parts: function () { return { m: moteParts(50), sp: parts(60, function () { return { t: rnd(-1, 1), v: rnd(40, 220), a: rnd(-0.4, 0.4), r: rnd(1, 3) }; }) }; },
        draw: function (p, e, ps) {
          var fade = cineDark(p), s = Math.min(e.w, e.h), R = Math.hypot(e.w, e.h), L = s * 0.9;
          motes(e, ps.m, p, fade);
          var form = ease(seg(p, 0.04, 0.3)), wind = seg(p, 0.3, 0.46), swing = seg(p, 0.46, 0.56), after = seg(p, 0.56, 1);
          var px = e.cx - s * 0.1, py = e.cy + s * 0.42, a0 = -2.75, a1 = 0.55;
          var ang = swing > 0 ? lerp(a0, a1, ease(swing)) : lerp(-2.25, a0, ease(wind));
          var trem = wind > 0.6 && swing === 0 ? rnd(-3, 3) : 0;
          if (swing > 0 && after < 0.3) {
            ctx.save(); ctx.globalAlpha = (1 - after / 0.3) * 0.85 * fade; ctx.strokeStyle = e.c1; ctx.shadowColor = e.c1; ctx.shadowBlur = 35; ctx.lineCap = "round";
            ctx.lineWidth = s * 0.05; ctx.beginPath(); ctx.arc(px, py, L * 0.88, a0, ang); ctx.stroke();
            ctx.strokeStyle = "#fff"; ctx.lineWidth = s * 0.015; ctx.beginPath(); ctx.arc(px, py, L * 0.88, a0, ang); ctx.stroke(); ctx.restore();
            for (var k = 1; k <= 5; k++) { ctx.save(); ctx.translate(px, py); ctx.rotate(lerp(a0, a1, ease(Math.max(0, swing - k * 0.06)))); ctx.globalAlpha = 0.2 * (1 - k / 6) * fade; drawBlade(L, e.c1, 0); ctx.restore(); }
          }
          if (after < 1) {
            ctx.save(); ctx.translate(px + trem, py); ctx.rotate(ang); ctx.globalAlpha = form * (1 - after) * fade;
            drawBlade(L * (0.5 + 0.5 * form), e.c1, 20 + 40 * wind); ctx.restore();
          }
          if (form < 1) for (var f = 0; f < 30; f++) { var q = f / 30, fx = px + Math.cos(-2.25) * L * q, fy = py + Math.sin(-2.25) * L * q; spark(fx + rnd(-40, 40) * (1 - form), fy + rnd(-40, 40) * (1 - form), 2, e.c1, (1 - form) * fade); }
          if (p >= 0.53) {
            var c = seg(p, 0.53, 0.95);
            flash((0.06 - (p - 0.53)) * 12, "#ffffff");
            ctx.save(); ctx.translate(e.cx, e.cy); ctx.rotate(-0.45);
            ctx.globalAlpha = (1 - c) * fade; ctx.fillStyle = "#fff"; ctx.shadowColor = e.c1; ctx.shadowBlur = 40;
            var gw = s * 0.03 * Math.sin(Math.min(1, c * 3) * Math.PI / 2) * (1 - c) + 2; ctx.fillRect(-R, -gw / 2, 2 * R, gw);
            ps.sp.forEach(function (sp) { spark(sp.t * R * 0.6, Math.sin(sp.a) * sp.v * c, sp.r, sp.t > 0 ? "#fff" : e.c1, (1 - c)); });
            ctx.restore(); ctx.shadowBlur = 0;
          }
        } },
      /* A colossal hammer is hauled up high, trembling, then slams down; the ground cracks and rocks fly. */
      heavy: { dur: 2000, impact: 0.5, parts: function () { return { m: moteParts(40), rocks: parts(40, function () { return { a: rnd(-Math.PI * 0.95, -Math.PI * 0.05), v: rnd(0.3, 1), r: rnd(3, 9), spin: rnd(-6, 6) }; }), cracks: parts(9, function (i) { var pts = [], d = 0; while (d < 1) { d += rnd(0.08, 0.2); pts.push({ d: d, j: rnd(-0.15, 0.15) }); } return { a: Math.PI * (0.05 + 0.9 * i / 8) + rnd(-0.1, 0.1), pts: pts }; }) }; },
        draw: function (p, e, ps) {
          var fade = cineDark(p), s = Math.min(e.w, e.h), S;
          motes(e, ps.m, p, fade);
          var lift = ease(seg(p, 0.03, 0.36)), hold = seg(p, 0.36, 0.44), drop = seg(p, 0.44, 0.5), after = seg(p, 0.5, 1);
          var gx = e.cx, gy = e.h * 0.8; S = s * 0.58;
          /* head-down overhead slam: it rises into view tilted back, trembles, then drives straight down */
          var up = -S * 0.2, down = gy - S * 1.02;
          var gripY = drop > 0 ? lerp(up, down, drop * drop) : lerp(-S * 1.4, up, lift);
          var tilt = drop > 0 ? lerp(0.35, 0, drop) : 0.35 * lift;
          var trem = hold > 0 && drop === 0 ? rnd(-3, 3) * hold : 0;
          if (after < 0.8) {
            if (drop > 0 && drop < 1) for (var k = 1; k <= 4; k++) { ctx.save(); ctx.translate(gx, lerp(up, down, Math.pow(Math.max(0, drop - k * 0.15), 2))); ctx.rotate(Math.PI + tilt); ctx.globalAlpha = 0.16 * fade; drawHammer(S, e.c1, 0); ctx.restore(); }
            ctx.save(); ctx.translate(gx + trem, gripY + (after > 0 ? -after * S * 0.15 : 0)); ctx.rotate(Math.PI + tilt); ctx.globalAlpha = Math.min(1, lift * 2) * (1 - after / 0.8) * fade;
            drawHammer(S, e.c1, 20 + 50 * hold); ctx.restore();
          }
          if (p >= 0.5) {
            var c = ease(Math.min(1, after * 1.4));
            flash((0.05 - (p - 0.5)) * 14, "#ffffff");
            ctx.save(); ctx.globalAlpha = (1 - after) * fade; ctx.strokeStyle = e.c1; ctx.shadowColor = e.c1; ctx.shadowBlur = 20; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(gx, gy, s * 0.9 * c, s * 0.12 * c, 0, 0, TAU); ctx.stroke(); ctx.restore();
            ps.cracks.forEach(function (cr) {
              ctx.save(); ctx.globalAlpha = (1 - seg(after, 0.5, 1)) * fade; ctx.strokeStyle = "#fff"; ctx.shadowColor = e.c1; ctx.shadowBlur = 14; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(gx, gy);
              cr.pts.forEach(function (pt) { if (pt.d > Math.min(1, after * 4)) return; var d = pt.d * s * 0.8; ctx.lineTo(gx + Math.cos(cr.a) * d - Math.sin(cr.a) * pt.j * d, gy + Math.sin(cr.a) * d * 0.35); });
              ctx.stroke(); ctx.restore();
            });
            ps.rocks.forEach(function (r) {
              var t = after * 1.6, x = gx + Math.cos(r.a) * r.v * s * 0.7 * t, y = gy + Math.sin(r.a) * r.v * s * 1.1 * t + s * 0.9 * t * t;
              ctx.save(); ctx.translate(x, y); ctx.rotate(r.spin * t); ctx.globalAlpha = (1 - after) * fade; ctx.fillStyle = "#57534e"; ctx.strokeStyle = e.c1; ctx.lineWidth = 1.5; ctx.fillRect(-r.r, -r.r, r.r * 2, r.r * 2); ctx.strokeRect(-r.r, -r.r, r.r * 2, r.r * 2); ctx.restore();
            });
            for (var d = 0; d < 5; d++) { var dx = gx + (d - 2) * s * 0.18 * c, g = ctx.createRadialGradient(dx, gy, 0, dx, gy, s * 0.2 * c + 1); g.addColorStop(0, "rgba(214,211,209," + 0.35 * (1 - after) * fade + ")"); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, e.w, e.h); }
          }
        } },
      /* A great shield drops and plants itself, its rune ring lights up, a gleam runs across it and it unfolds
         into a wall of hexagons. */
      guard: { dur: 1800, impact: 0.42, parts: function () { return { m: moteParts(40) }; },
        draw: function (p, e, ps) {
          var fade = cineDark(p), s = Math.min(e.w, e.h), S = s * 0.6;
          motes(e, ps.m, p, fade);
          var fall = seg(p, 0.05, 0.4), after = seg(p, 0.42, 1);
          var y = lerp(-S, e.cy, fall * fall);
          ctx.save(); ctx.translate(e.cx, y); ctx.globalAlpha = fade * (1 - seg(after, 0.6, 1));
          ctx.shadowColor = e.c1; ctx.shadowBlur = 40;
          drawShieldShape(S); var g = ctx.createLinearGradient(-S * 0.4, 0, S * 0.4, 0); g.addColorStop(0, "#334155"); g.addColorStop(0.5, "#94a3b8"); g.addColorStop(1, "#1e293b"); ctx.fillStyle = g; ctx.fill();
          ctx.lineWidth = S * 0.04; ctx.strokeStyle = "#facc15"; ctx.stroke();
          ctx.shadowBlur = 0; ctx.save(); ctx.scale(0.72, 0.72); drawShieldShape(S); ctx.strokeStyle = e.c1; ctx.lineWidth = S * 0.025; ctx.stroke(); ctx.restore();
          ctx.fillStyle = e.c1; ctx.shadowColor = e.c1; ctx.shadowBlur = 30 * (0.5 + after); ctx.beginPath(); ctx.arc(0, -S * 0.05, S * 0.1, 0, TAU); ctx.fill();
          if (after > 0) { ctx.save(); drawShieldShape(S); ctx.clip(); var gx = lerp(-S, S, seg(after, 0, 0.4)); var gg = ctx.createLinearGradient(gx - S * 0.2, 0, gx + S * 0.2, 0); gg.addColorStop(0, "rgba(255,255,255,0)"); gg.addColorStop(0.5, "rgba(255,255,255,.8)"); gg.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = gg; ctx.fillRect(-S, -S, S * 2, S * 2); ctx.restore(); }
          ctx.restore(); ctx.shadowBlur = 0;
          if (p >= 0.42) {
            flash((0.04 - (p - 0.42)) * 12, e.c1);
            var hr = s * 0.07;
            for (var row = -4; row <= 4; row++) for (var col = -7; col <= 7; col++) {
              var hx = e.cx + col * hr * 1.75 + (row % 2 ? hr * 0.87 : 0), hy = e.cy + row * hr * 1.5, d = Math.hypot(hx - e.cx, hy - e.cy) / (s * 0.9);
              var on = seg(after, d * 0.5, d * 0.5 + 0.15) * (1 - seg(after, 0.6 + d * 0.3, 0.9 + d * 0.1));
              if (on <= 0) continue; ctx.globalAlpha = on * 0.8 * fade; ctx.strokeStyle = e.c1; ctx.shadowColor = e.c1; ctx.shadowBlur = 12; ctx.lineWidth = 2; hexAt(hx, hy, hr * 0.92); ctx.stroke();
              ctx.globalAlpha = on * 0.12 * fade; ctx.fillStyle = e.c1; ctx.fill();
            }
            ctx.globalAlpha = 1; ctx.shadowBlur = 0;
          }
        } },
      /* Wings of light unfurl, feathers drift down and a spiral of healing light rises with a glowing cross. */
      heal: { dur: 2000, impact: 0.5, parts: function () { return { m: moteParts(40), fe: parts(26, function () { return { x: rnd(-0.5, 0.5), y: rnd(-0.6, 0), v: rnd(0.2, 0.6), sp: rnd(-3, 3), s: rnd(0.6, 1.2) }; }), sp: parts(60, function () { return { a: Math.random() * TAU, r: rnd(0.1, 0.5), v: rnd(0.3, 1) }; }) }; },
        draw: function (p, e, ps) {
          var fade = cineDark(p), s = Math.min(e.w, e.h), open = ease(seg(p, 0.08, 0.5)), after = seg(p, 0.5, 1);
          var g = ctx.createLinearGradient(0, 0, 0, e.h); g.addColorStop(0, "rgba(253,230,138," + 0.35 * open * fade + ")"); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, e.w, e.h);
          motes(e, ps.m, p, fade, "#bbf7d0");
          [-1, 1].forEach(function (side) {
            for (var f = 0; f < 9; f++) {
              var a = (-0.35 - f * 0.13) * open - 0.2, L = s * (0.55 - f * 0.03);
              ctx.save(); ctx.translate(e.cx + side * s * 0.04, e.cy - s * 0.05); ctx.scale(side, 1); ctx.rotate(a);
              ctx.globalAlpha = (0.85 - f * 0.05) * fade * (1 - seg(after, 0.6, 1)); ctx.fillStyle = f % 2 ? "#ffffff" : "#fef9c3"; ctx.shadowColor = "#fde68a"; ctx.shadowBlur = 20;
              ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.5, -s * 0.06, L, 0); ctx.quadraticCurveTo(L * 0.5, s * 0.03, 0, 0); ctx.fill(); ctx.restore();
            }
          });
          ctx.shadowBlur = 0;
          ps.fe.forEach(function (f) { var y = e.cy + (f.y + p * f.v) * s, x = e.cx + f.x * s + Math.sin(p * 6 + f.sp) * 20; ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(p * 5 + f.sp) * 0.8); ctx.globalAlpha = open * 0.8 * fade; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(0, 0, 10 * f.s, 3 * f.s, 0, 0, TAU); ctx.fill(); ctx.restore(); });
          ps.sp.forEach(function (sp) { var t = (p * sp.v * 1.5) % 1, a = sp.a + t * 8, r = s * sp.r * (1 - t * 0.5); spark(e.cx + Math.cos(a) * r, e.cy + s * 0.4 - t * s * 0.9, 2.5, "#4ade80", open * (1 - t) * fade); });
          if (p >= 0.5) {
            var pulse = Math.sin(Math.min(1, after * 2) * Math.PI), cs = s * 0.16 * (1 + 0.3 * pulse);
            flash((0.05 - (p - 0.5)) * 8, "#dcfce7");
            ctx.save(); ctx.translate(e.cx, e.cy); ctx.globalAlpha = (1 - after) * fade; ctx.fillStyle = "#4ade80"; ctx.shadowColor = "#22c55e"; ctx.shadowBlur = 40;
            ctx.fillRect(-cs * 0.2, -cs, cs * 0.4, cs * 2); ctx.fillRect(-cs, -cs * 0.2, cs * 2, cs * 0.4); ctx.restore();
            ring(e.cx, e.cy, s * 0.1 + after * s * 0.6, "#86efac", 4 * (1 - after), (1 - after) * fade);
          }
        } },
      /* Sniper scope: the world goes into a scope, the crosshair hunts, locks on, and one shot cracks the glass. */
      precision: { dur: 2000, impact: 0.62, parts: function () { return { m: moteParts(20), cracks: parts(11, function (i) { var pts = [], d = 0; while (d < 1) { d += rnd(0.1, 0.25); pts.push({ d: d, j: rnd(-0.2, 0.2) }); } return { a: i / 11 * TAU + rnd(-0.2, 0.2), pts: pts }; }) }; },
        draw: function (p, e, ps) {
          var fade = 1 - seg(p, 0.86, 1), s = Math.min(e.w, e.h), R = s * 0.42, appear = ease(seg(p, 0, 0.12)), lock = seg(p, 0.3, 0.55), after = seg(p, 0.62, 1);
          var wob = (1 - lock) * s * 0.12, cx = e.cx + Math.sin(p * 13) * wob + Math.cos(p * 7) * wob * 0.6, cy = e.cy + Math.cos(p * 11) * wob * 0.7;
          ctx.save(); ctx.globalAlpha = fade; ctx.fillStyle = "rgba(0,0,0,.96)"; ctx.beginPath(); ctx.rect(0, 0, e.w, e.h); ctx.arc(cx, cy, R * appear, 0, TAU, true); ctx.fill();
          var vg = ctx.createRadialGradient(cx, cy, R * 0.6 * appear, cx, cy, R * appear + 1); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.8)"); ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(cx, cy, R * appear, 0, TAU); ctx.fill();
          ctx.strokeStyle = lock >= 1 ? "#ef4444" : "#e2e8f0"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx - R * 0.1, cy); ctx.moveTo(cx + R * 0.1, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy - R * 0.1); ctx.moveTo(cx, cy + R * 0.1); ctx.lineTo(cx, cy + R); ctx.stroke();
          for (var t = 1; t < 5; t++) { ctx.beginPath(); ctx.moveTo(cx - 6, cy + t * R * 0.18); ctx.lineTo(cx + 6, cy + t * R * 0.18); ctx.moveTo(cx + t * R * 0.18, cy - 6); ctx.lineTo(cx + t * R * 0.18, cy + 6); ctx.stroke(); }
          ring(cx, cy, R * (0.35 - 0.15 * lock), lock >= 1 ? "#ef4444" : e.c1, 2, appear * fade);
          ring(cx, cy, R * appear, "#475569", 6, fade);
          if (lock >= 1 && p < 0.62) { ctx.fillStyle = "#ef4444"; ctx.font = "700 " + Math.round(s * 0.03) + "px sans-serif"; ctx.textAlign = "center"; ctx.globalAlpha = (Math.sin(p * 80) > 0 ? 1 : 0.4) * fade; ctx.fillText("LOCKED", cx, cy + R * 0.6); }
          ctx.restore();
          if (p >= 0.62) {
            flash((0.05 - (p - 0.62)) * 14, "#ffffff");
            ctx.save(); ctx.globalAlpha = (1 - after) * fade; glowLine(0, e.h * 0.85, cx, cy, e.c1, 6 * (1 - after) + 1, 30); ctx.restore();
            ps.cracks.forEach(function (cr) { ctx.save(); ctx.globalAlpha = 0.9 * (1 - seg(after, 0.4, 1)) * fade; ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx, cy); cr.pts.forEach(function (pt) { if (pt.d > Math.min(1, after * 5)) return; var d = pt.d * R; ctx.lineTo(cx + Math.cos(cr.a + pt.j) * d, cy + Math.sin(cr.a + pt.j) * d); }); ctx.stroke(); ctx.restore(); });
            for (var r = 0; r < 3; r++) ring(cx, cy, R * (0.15 + r * 0.12) * Math.min(1, after * 4), "#e2e8f0", 1.2, (1 - after) * 0.8 * fade);
            ctx.save(); ctx.font = "900 " + Math.round(s * 0.07) + "px 'Cinzel', serif"; ctx.textAlign = "center"; ctx.fillStyle = "#facc15"; ctx.shadowColor = "#ef4444"; ctx.shadowBlur = 25; ctx.globalAlpha = Math.min(1, after * 8) * (1 - seg(after, 0.6, 1)) * fade; ctx.fillText("CRITICAL", cx, cy - R * 0.55); ctx.restore();
          }
        } },
      /* Crimson tendrils claw out of the dark at the target and drag its life back as glowing orbs. */
      drain: { dur: 2000, impact: 0.45, parts: function () { return { m: moteParts(30), tn: parts(7, function (i) { return { x: (i + 0.5) / 7, ph: Math.random() * TAU, w: rnd(0.7, 1.2) }; }), orbs: parts(26, function () { return { d: Math.random(), o: rnd(-1, 1), r: rnd(3, 8) }; }) }; },
        draw: function (p, e, ps) {
          var fade = cineDark(p), s = Math.min(e.w, e.h), reach = ease(seg(p, 0.06, 0.45)), pull = seg(p, 0.45, 0.95);
          var vg = ctx.createRadialGradient(e.cx, e.cy, s * 0.3, e.cx, e.cy, Math.hypot(e.w, e.h) / 2); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(127,29,29," + (0.5 + 0.3 * Math.sin(p * 30)) * fade + ")"); ctx.fillStyle = vg; ctx.fillRect(0, 0, e.w, e.h);
          motes(e, ps.m, p, fade, "#fca5a5");
          var tx = e.to.x, ty = e.to.y;
          ps.tn.forEach(function (t) {
            var bx = t.x * e.w, by = e.h + 20, ex = lerp(bx, tx + (t.x - 0.5) * s * 0.3, reach * (1 - pull * 0.6)), ey = lerp(by, ty + s * 0.05, reach * (1 - pull * 0.6));
            ctx.save(); ctx.globalAlpha = fade * (1 - seg(pull, 0.6, 1)); ctx.strokeStyle = "#7f1d1d"; ctx.shadowColor = "#ef4444"; ctx.shadowBlur = 18; ctx.lineCap = "round";
            for (var layer = 0; layer < 2; layer++) {
              ctx.lineWidth = (layer ? 3 : 14) * t.w; if (layer) ctx.strokeStyle = "#fca5a5";
              ctx.beginPath(); ctx.moveTo(bx, by);
              for (var k = 1; k <= 20; k++) { var q = k / 20; ctx.lineTo(lerp(bx, ex, q) + Math.sin(q * 9 + p * 12 + t.ph) * 30 * (1 - q * 0.5), lerp(by, ey, q)); }
              ctx.stroke();
            }
            ctx.fillStyle = "#fecaca"; for (var c = -1; c <= 1; c++) { ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + c * 14 + 4, ey - 26); ctx.lineTo(ex + c * 14 - 4, ey - 22); ctx.fill(); }
            ctx.restore();
          });
          if (pull > 0) ps.orbs.forEach(function (o) {
            var q = seg(pull, o.d * 0.5, o.d * 0.5 + 0.5), x = lerp(tx, e.from.x, ease(q)) + Math.sin(q * Math.PI) * o.o * s * 0.2, y = lerp(ty, e.from.y, ease(q)) - Math.sin(q * Math.PI) * s * 0.15;
            if (q > 0 && q < 1) { ctx.shadowColor = "#ef4444"; ctx.shadowBlur = 20; spark(x, y, o.r, "#f87171", fade); ctx.shadowBlur = 0; }
          });
          if (p > 0.45 && p < 0.5) flash((0.5 - p) * 8, "#7f1d1d");
        } },
      /* A giant eye opens in the dark, its iris swirls, rings rush in and the pupil snaps tight. */
      focus: { dur: 1900, impact: 0.5, parts: function () { return { m: moteParts(50) }; },
        draw: function (p, e, ps) {
          var fade = cineDark(p), s = Math.min(e.w, e.h), open = ease(seg(p, 0.08, 0.4)) * (1 - seg(p, 0.82, 0.95)), snap = seg(p, 0.48, 0.55);
          motes(e, ps.m, p, fade, e.c1);
          for (var r = 0; r < 6; r++) { var q = ((p * 1.4 + r / 6) % 1); ring(e.cx, e.cy, s * (0.9 - q * 0.8), e.c1, 2, q * 0.5 * fade); }
          drawEye(e.cx, e.cy, s * 0.42, Math.max(0.02, open), e.c1, 1.4 - snap * 0.9, p * 4);
          if (p >= 0.5) { flash((0.04 - (p - 0.5)) * 10, e.c1); for (var k = 0; k < 24; k++) { var a = k / 24 * TAU, a2 = seg(p, 0.5, 0.8); ctx.globalAlpha = (1 - a2) * fade; glowLine(e.cx + Math.cos(a) * s * 0.45, e.cy + Math.sin(a) * s * 0.45, e.cx + Math.cos(a) * s * (0.45 + a2 * 0.5), e.cy + Math.sin(a) * s * (0.45 + a2 * 0.5), e.c1, 2, 12); ctx.globalAlpha = 1; } }
        } },
      /* A flask of venom tumbles down and shatters; a toxic cloud billows into a skull, bubbling and dripping. */
      poison: { dur: 2000, impact: 0.42, parts: function () { return { shards: parts(22, function () { return { a: rnd(-Math.PI, 0), v: rnd(0.3, 1), r: rnd(4, 10), spin: rnd(-8, 8) }; }), puffs: parts(40, function () { return { a: Math.random() * TAU, d: rnd(0.2, 1), r: rnd(0.1, 0.25) }; }), bub: parts(40, function () { return { x: rnd(-0.5, 0.5), v: rnd(0.3, 1), r: rnd(3, 9), o: Math.random() }; }) }; },
        draw: function (p, e, ps) {
          var fade = cineDark(p), s = Math.min(e.w, e.h), fall = seg(p, 0.05, 0.42), after = seg(p, 0.42, 1);
          var y = lerp(-s * 0.2, e.cy, fall * fall), G = "#4ade80";
          if (p < 0.42) {
            ctx.save(); ctx.translate(e.cx, y); ctx.rotate(fall * 7); ctx.shadowColor = G; ctx.shadowBlur = 25;
            ctx.fillStyle = "rgba(34,197,94,.85)"; ctx.beginPath(); ctx.arc(0, s * 0.03, s * 0.08, 0, TAU); ctx.fill();
            ctx.fillStyle = "rgba(226,232,240,.5)"; ctx.fillRect(-s * 0.025, -s * 0.11, s * 0.05, s * 0.07);
            ctx.fillStyle = "#78350f"; ctx.fillRect(-s * 0.03, -s * 0.13, s * 0.06, s * 0.03);
            ctx.restore(); ctx.shadowBlur = 0;
          } else {
            flash((0.04 - (p - 0.42)) * 10, "#bbf7d0");
            ps.puffs.forEach(function (pf) { var d = s * 0.45 * pf.d * ease(Math.min(1, after * 2)), x = e.cx + Math.cos(pf.a) * d, y2 = e.cy + Math.sin(pf.a) * d * 0.7 - after * s * 0.1; var g = ctx.createRadialGradient(x, y2, 0, x, y2, s * pf.r); g.addColorStop(0, "rgba(74,222,128," + 0.35 * (1 - after) * fade + ")"); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(x - s * pf.r, y2 - s * pf.r, s * pf.r * 2, s * pf.r * 2); });
            drawSkull(e.cx, e.cy - s * 0.05, s * 0.32 * (0.8 + 0.2 * ease(Math.min(1, after * 3))), "#86efac", Math.sin(Math.min(1, after * 1.4) * Math.PI) * 0.85 * fade);
            ps.shards.forEach(function (sh) { var t = after * 1.3, x = e.cx + Math.cos(sh.a) * sh.v * s * 0.6 * t, y2 = e.cy + Math.sin(sh.a) * sh.v * s * 0.7 * t + s * 0.7 * t * t; ctx.save(); ctx.translate(x, y2); ctx.rotate(sh.spin * t); ctx.globalAlpha = (1 - after) * fade; ctx.fillStyle = "rgba(226,232,240,.8)"; ctx.beginPath(); ctx.moveTo(0, -sh.r); ctx.lineTo(sh.r * 0.6, sh.r); ctx.lineTo(-sh.r * 0.6, sh.r * 0.4); ctx.fill(); ctx.restore(); });
            ps.bub.forEach(function (b) { var t = (after * b.v * 2 + b.o) % 1; ctx.globalAlpha = (1 - t) * (1 - after) * fade; ctx.strokeStyle = G; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.cx + b.x * s, e.cy + s * 0.3 - t * s * 0.6, b.r, 0, TAU); ctx.stroke(); });
            ctx.globalAlpha = 1;
          }
        } },
      /* Chains whip out of the corners, wrap the target and a curse sigil burns under it as they pull tight. */
      weaken: { dur: 2000, impact: 0.55, parts: function () { return { m: moteParts(30) }; },
        draw: function (p, e, ps) {
          var fade = cineDark(p), s = Math.min(e.w, e.h), shoot = ease(seg(p, 0.06, 0.4)), tight = seg(p, 0.5, 0.58), after = seg(p, 0.58, 1), P = "#a855f7";
          motes(e, ps.m, p, fade, "#d8b4fe");
          var sig = ease(seg(p, 0.2, 0.5));
          ctx.save(); ctx.translate(e.cx, e.cy + s * 0.05); ctx.scale(1, 0.45); ctx.rotate(p * 1.5); ctx.globalAlpha = sig * fade * (1 - seg(after, 0.5, 1)); ctx.strokeStyle = P; ctx.shadowColor = P; ctx.shadowBlur = 25; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(0, 0, s * 0.42, 0, TAU); ctx.stroke(); ctx.beginPath(); for (var v = 0; v <= 5; v++) { var a = v * 4 * Math.PI / 5 - Math.PI / 2; ctx.lineTo(Math.cos(a) * s * 0.4, Math.sin(a) * s * 0.4); } ctx.stroke(); ctx.restore(); ctx.shadowBlur = 0;
          var corners = [[0, 0], [e.w, 0], [0, e.h], [e.w, e.h], [e.w / 2, -20], [e.w / 2, e.h + 20]];
          corners.forEach(function (c) { var tx = e.cx + (c[0] - e.cx) * 0.08 * (1 - tight), ty = e.cy + (c[1] - e.cy) * 0.08 * (1 - tight); ctx.globalAlpha = fade * (1 - seg(after, 0.6, 1)); chainLinks(c[0], c[1], tx, ty, shoot, P, s * 0.025 * (1 + tight * 0.3)); });
          ctx.globalAlpha = 1;
          if (p >= 0.55) { flash((0.04 - (p - 0.55)) * 10, "#581c87"); ring(e.cx, e.cy, s * 0.3 * (1 - after * 0.6), P, 6 * (1 - after), (1 - after) * fade); }
        } },
      /* Storm clouds roll in and flicker, then a forked bolt of lightning splits the sky onto the target. */
      stun: { dur: 1900, impact: 0.5, parts: function () { return { clouds: parts(14, function (i) { return { x: i / 13, r: rnd(0.12, 0.22), y: rnd(0, 0.12) }; }) }; },
        draw: function (p, e, ps) {
          var fade = cineDark(p), s = Math.min(e.w, e.h), roll = ease(seg(p, 0, 0.3)), after = seg(p, 0.5, 1), Y = "#facc15";
          ps.clouds.forEach(function (c) { var x = lerp(-0.3, c.x, roll) * e.w, y = c.y * e.h; var g = ctx.createRadialGradient(x, y, 0, x, y, s * c.r * 1.6); g.addColorStop(0, "rgba(71,85,105," + 0.9 * fade + ")"); g.addColorStop(1, "rgba(15,23,42,0)"); ctx.fillStyle = g; ctx.fillRect(x - s * c.r * 2, y - s * c.r * 2, s * c.r * 4, s * c.r * 4); });
          if (p > 0.2 && p < 0.5 && Math.random() < 0.25) { ctx.globalAlpha = 0.3 * fade; ctx.fillStyle = "#e0f2fe"; ctx.fillRect(0, 0, e.w, e.h * 0.3); ctx.globalAlpha = 1; }
          if (p > 0.3 && p < 0.5 && Math.random() < 0.3) bolt(rnd(0, e.w), 0, rnd(0, e.w), e.h * 0.25, 18, "#93c5fd", 1.5, 0);
          if (p >= 0.5) {
            var flick = after < 0.25 ? (Math.floor(after * 40) % 2) : 0;
            flash(flick ? 0.6 * (1 - after * 3) : (0.04 - (p - 0.5)) * 12, "#e0f2fe");
            if (after < 0.45) { ctx.globalAlpha = (1 - after / 0.45) * fade; bolt(e.cx + rnd(-30, 30), 0, e.cx, e.cy + s * 0.1, s * 0.05, Y, s * 0.012, 2); ctx.globalAlpha = 1; }
            ring(e.cx, e.cy + s * 0.1, s * 0.05 + after * s * 0.5, Y, 4 * (1 - after), (1 - after) * fade);
            for (var a = 0; a < 6; a++) { var aa = a / 6 * TAU + p * 6; ctx.globalAlpha = (1 - after) * fade; bolt(e.cx, e.cy + s * 0.1, e.cx + Math.cos(aa) * s * 0.25, e.cy + s * 0.1 + Math.sin(aa) * s * 0.12, 10, "#93c5fd", 1.2, 0); }
            ctx.globalAlpha = 1;
          }
        } },
      /* A tall mirror spins in, catches the light in a gleam and throws back a fan of reflected beams. */
      reflect: { dur: 1800, impact: 0.5, parts: function () { return { m: moteParts(40), beams: parts(9, function (i) { return { a: -0.6 + i * 0.15 }; }) }; },
        draw: function (p, e, ps) {
          var fade = cineDark(p), s = Math.min(e.w, e.h), spin = seg(p, 0.05, 0.45), after = seg(p, 0.5, 1), W = s * 0.32, H = s * 0.7;
          motes(e, ps.m, p, fade, "#e0f2fe");
          var sx = Math.cos((1 - ease(spin)) * Math.PI * 4);
          ctx.save(); ctx.translate(e.cx, e.cy); ctx.scale(Math.max(0.03, Math.abs(sx)), 1); ctx.globalAlpha = fade * (1 - seg(after, 0.6, 1));
          ctx.shadowColor = e.c1; ctx.shadowBlur = 30; ctx.fillStyle = "#facc15"; rrect(-W / 2 - 10, -H / 2 - 10, W + 20, H + 20, 14); ctx.fill();
          var g = ctx.createLinearGradient(-W / 2, -H / 2, W / 2, H / 2); g.addColorStop(0, "#e0f2fe"); g.addColorStop(0.5, "#93c5fd"); g.addColorStop(1, "#1e3a8a"); ctx.fillStyle = g; rrect(-W / 2, -H / 2, W, H, 10); ctx.fill();
          ctx.shadowBlur = 0; ctx.save(); rrect(-W / 2, -H / 2, W, H, 10); ctx.clip(); var gx = lerp(-W, W, seg(p, 0.42, 0.62)); var gg = ctx.createLinearGradient(gx - W * 0.3, -H / 2, gx + W * 0.3, H / 2); gg.addColorStop(0, "rgba(255,255,255,0)"); gg.addColorStop(0.5, "rgba(255,255,255,.95)"); gg.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = gg; ctx.fillRect(-W, -H, W * 2, H * 2); ctx.restore();
          ctx.restore();
          if (p < 0.5 && spin > 0.3) for (var k = 0; k < 4; k++) { var q = (p * 3 + k / 4) % 1; ctx.globalAlpha = 0.7 * fade; glowLine(e.w * (1 - q * 0.5), e.cy - s * 0.3 + k * s * 0.18, e.w * (1 - q * 0.5) + 60, e.cy - s * 0.3 + k * s * 0.18, e.c2, 3, 14); ctx.globalAlpha = 1; }
          if (p >= 0.5) { flash((0.04 - (p - 0.5)) * 10, "#ffffff"); ps.beams.forEach(function (b) { ctx.globalAlpha = (1 - after) * fade; var L = e.w * ease(Math.min(1, after * 2)); glowLine(e.cx, e.cy, e.cx + Math.cos(Math.PI + b.a) * L, e.cy + Math.sin(Math.PI + b.a) * L, e.c1, 4, 20); ctx.globalAlpha = 1; }); }
        } },
      /* Energy spirals into a sphere that grows and crackles, then fires one enormous beam at the target. */
      burst: { dur: 2100, impact: 0.5, parts: function () { return { m: moteParts(30), in: parts(80, function () { return { a: Math.random() * TAU, d: rnd(0.4, 1.2), v: rnd(0.6, 1.4) }; }), deb: parts(50, function () { return { a: Math.random() * TAU, v: rnd(0.2, 1), r: rnd(2, 5) }; }) }; },
        draw: function (p, e, ps) {
          var fade = cineDark(p), s = Math.min(e.w, e.h), charge = seg(p, 0.05, 0.48), fire = seg(p, 0.48, 0.8), after = seg(p, 0.5, 1);
          var ox = Math.min(e.from.x, e.w * 0.25) + s * 0.05, oy = e.cy, tx = e.w + 40;
          motes(e, ps.m, p, fade);
          var R0 = s * 0.03 + s * 0.15 * ease(charge) * (1 - fire * 0.6);
          if (p < 0.5) ps.in.forEach(function (q) { var t = (charge * q.v * 2) % 1, d = s * q.d * (1 - t); spark(ox + Math.cos(q.a + t * 3) * d, oy + Math.sin(q.a + t * 3) * d, 2, q.v > 1 ? "#fff" : e.c1, t * fade); });
          var g = ctx.createRadialGradient(ox, oy, 0, ox, oy, R0 * 1.8); g.addColorStop(0, "#ffffff"); g.addColorStop(0.4, e.c1); g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.globalAlpha = fade * (1 - seg(p, 0.8, 0.95)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox + (p < 0.48 ? rnd(-2, 2) * charge : 0), oy, R0 * 1.8, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
          if (charge > 0.4 && p < 0.5) for (var c = 0; c < 3; c++) { var a = Math.random() * TAU; ctx.globalAlpha = fade; glowLine(ox, oy, ox + Math.cos(a) * R0 * 2, oy + Math.sin(a) * R0 * 2, e.c1, 1.5, 10); ctx.globalAlpha = 1; }
          if (p >= 0.48 && fire < 1) {
            var bw = s * 0.16 * Math.sin(Math.min(1, fire * 1.3) * Math.PI) + 2, len = (tx - ox) * Math.min(1, fire * 6);
            var bg = ctx.createLinearGradient(0, oy - bw, 0, oy + bw); bg.addColorStop(0, "rgba(0,0,0,0)"); bg.addColorStop(0.3, e.c1); bg.addColorStop(0.5, "#ffffff"); bg.addColorStop(0.7, e.c1); bg.addColorStop(1, "rgba(0,0,0,0)");
            ctx.globalAlpha = fade; ctx.shadowColor = e.c1; ctx.shadowBlur = 40; ctx.fillStyle = bg; ctx.fillRect(ox, oy - bw, len, bw * 2); ctx.shadowBlur = 0;
            for (var w = 0; w < 6; w++) { var wx = ox + ((fire * 3 + w / 6) % 1) * len; ring(wx, oy, bw * 0.9, "#ffffff", 2, 0.4 * fade); }
            ctx.globalAlpha = 1;
          }
          if (p >= 0.5) { flash((0.04 - (p - 0.5)) * 10, "#ffffff"); ps.deb.forEach(function (d) { var t = after; spark(e.to.x + Math.cos(d.a) * d.v * s * 0.5 * t, e.to.y + Math.sin(d.a) * d.v * s * 0.5 * t, d.r, d.v > 0.6 ? e.c1 : "#fff", (1 - t) * fade); }); }
        } },
      /* The sky fills with blazing meteors that rain down on the target in waves, ending with a giant one. */
      barrage: { dur: 2200, impact: 0.5, parts: function () { return { met: parts(26, function (i) { return { t: 0.1 + i / 26 * 0.55, ox: rnd(-0.35, 0.35), oy: rnd(-0.15, 0.15), r: rnd(0.012, 0.03) }; }), m: moteParts(30) }; },
        draw: function (p, e, ps) {
          var fade = cineDark(p), s = Math.min(e.w, e.h), O = "#f97316";
          var sky = ctx.createLinearGradient(0, 0, 0, e.h); sky.addColorStop(0, "rgba(124,45,18," + 0.4 * Math.min(1, p * 5) * fade + ")"); sky.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = sky; ctx.fillRect(0, 0, e.w, e.h);
          motes(e, ps.m, p, fade, "#fed7aa");
          var drawMet = function (q, tx, ty, r) {
            var sx = tx + s * 0.9, sy = ty - s * 1.1, x = lerp(sx, tx, q), y = lerp(sy, ty, q);
            var g = ctx.createLinearGradient(x, y, x + s * 0.35, y - s * 0.42); g.addColorStop(0, "rgba(253,186,116,.95)"); g.addColorStop(1, "rgba(249,115,22,0)");
            ctx.strokeStyle = g; ctx.lineWidth = r * 1.6; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s * 0.35, y - s * 0.42); ctx.stroke();
            ctx.fillStyle = "#fff7ed"; ctx.shadowColor = O; ctx.shadowBlur = 25; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
          };
          ps.met.forEach(function (m) {
            var q = seg(p, m.t - 0.1, m.t), tx = e.cx + m.ox * s, ty = e.cy + s * 0.15 + m.oy * s;
            if (q > 0 && q < 1) { ctx.globalAlpha = fade; drawMet(q, tx, ty, s * m.r); ctx.globalAlpha = 1; }
            var b = seg(p, m.t, m.t + 0.12); if (b > 0 && b < 1) { ring(tx, ty, s * 0.02 + b * s * 0.09, O, 3 * (1 - b), (1 - b) * fade); spark(tx, ty, s * 0.03 * (1 - b), "#fff7ed", (1 - b) * fade); }
          });
          var big = seg(p, 0.62, 0.74);
          if (big > 0 && big < 1) { ctx.globalAlpha = fade; drawMet(big, e.cx, e.cy + s * 0.15, s * 0.08); ctx.globalAlpha = 1; }
          if (p >= 0.74) { var a = seg(p, 0.74, 1); flash((0.04 - (p - 0.74)) * 12, "#fff7ed"); ring(e.cx, e.cy + s * 0.15, s * 0.05 + a * s * 0.7, O, 8 * (1 - a), (1 - a) * fade); ring(e.cx, e.cy + s * 0.15, s * 0.03 + a * s * 0.45, "#fff", 3 * (1 - a), (1 - a) * fade); }
        } },
      /* The screen bleeds red, a reaper's scythe rises behind the target and sweeps once: EXECUTE. */
      execute: { dur: 2100, impact: 0.55, parts: function () { return { m: moteParts(30) }; },
        draw: function (p, e, ps) {
          var fade = cineDark(p), s = Math.min(e.w, e.h), rise = ease(seg(p, 0.05, 0.42)), sweep = seg(p, 0.46, 0.56), after = seg(p, 0.56, 1), RED = "#dc2626";
          var vg = ctx.createRadialGradient(e.cx, e.cy, s * 0.2, e.cx, e.cy, Math.hypot(e.w, e.h) / 2); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(127,29,29," + 0.7 * rise * fade + ")"); ctx.fillStyle = vg; ctx.fillRect(0, 0, e.w, e.h);
          motes(e, ps.m, p, fade, "#fca5a5");
          var px = e.cx + s * 0.25, py = e.cy + s * 0.4, ang = sweep > 0 ? lerp(-2.3, -0.2, ease(sweep)) : lerp(-1.6, -2.3, rise);
          var drawScythe = function (a, alpha) {
            ctx.save(); ctx.translate(px, py); ctx.rotate(a); ctx.globalAlpha = alpha;
            ctx.strokeStyle = "#292524"; ctx.lineWidth = s * 0.022; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.8, 0); ctx.stroke();
            ctx.shadowColor = RED; ctx.shadowBlur = 30; var g = ctx.createLinearGradient(s * 0.8, 0, s * 0.8, s * 0.5); g.addColorStop(0, "#f1f5f9"); g.addColorStop(1, "#64748b"); ctx.fillStyle = g;
            ctx.beginPath(); ctx.moveTo(s * 0.78, -s * 0.02); ctx.quadraticCurveTo(s * 0.62, s * 0.3, s * 0.2, s * 0.42); ctx.quadraticCurveTo(s * 0.56, s * 0.2, s * 0.82, s * 0.03); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); ctx.shadowBlur = 0;
          };
          if (sweep > 0 && sweep < 1) for (var k = 1; k <= 4; k++) drawScythe(lerp(-2.3, -0.2, ease(Math.max(0, sweep - k * 0.08))), 0.15 * fade);
          if (after < 0.7) drawScythe(ang, Math.min(1, rise * 1.5) * (1 - after / 0.7) * fade);
          if (p >= 0.55) {
            var c = seg(p, 0.55, 0.95);
            flash((0.05 - (p - 0.55)) * 12, RED);
            ctx.save(); ctx.translate(e.cx, e.cy); ctx.rotate(0.35); ctx.globalAlpha = (1 - c) * fade; ctx.fillStyle = "#fecaca"; ctx.shadowColor = RED; ctx.shadowBlur = 40; var gw = s * 0.025 * (1 - c) + 2; ctx.fillRect(-e.w, -gw / 2, e.w * 2, gw); ctx.restore();
            ctx.save(); ctx.font = "900 " + Math.round(s * 0.11) + "px 'Cinzel', serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.globalAlpha = Math.min(1, c * 8) * (1 - seg(c, 0.6, 1)) * fade;
            ctx.fillStyle = "#7f1d1d"; ctx.fillText("EXECUTE", e.cx + 4, e.cy - s * 0.28 + 4); ctx.fillStyle = "#fecaca"; ctx.shadowColor = RED; ctx.shadowBlur = 30; ctx.fillText("EXECUTE", e.cx, e.cy - s * 0.28); ctx.restore();
          }
        } },
      /* A dome of hexagons builds up cell by cell around the caster, then flares as it seals. */
      shield: { dur: 1900, impact: 0.55, parts: function () { var cells = []; for (var row = 0; row < 7; row++) for (var col = -6; col <= 6; col++) cells.push({ row: row, col: col, o: Math.random() }); return { cells: cells, m: moteParts(40) }; },
        draw: function (p, e, ps) {
          var fade = cineDark(p), s = Math.min(e.w, e.h), build = seg(p, 0.08, 0.55), after = seg(p, 0.55, 1), R = s * 0.45, hr = s * 0.045, cx = e.cx, cy = e.cy + R * 0.55;
          motes(e, ps.m, p, fade, e.c1);
          ps.cells.forEach(function (c) {
            var el = c.row * 0.21, x = cx + Math.sin(c.col * 0.2) * R * Math.cos(el), y = cy - Math.sin(el) * R * 1.1;
            var on = seg(build, c.row / 7 * 0.7 + c.o * 0.2, c.row / 7 * 0.7 + c.o * 0.2 + 0.2);
            if (on <= 0 || Math.abs(Math.sin(c.col * 0.2)) * Math.cos(el) > 0.98) return;
            ctx.globalAlpha = on * fade * (1 - seg(after, 0.6, 1)) * (0.6 + 0.4 * Math.sin(p * 20 + c.o * 6)); ctx.strokeStyle = e.c1; ctx.shadowColor = e.c1; ctx.shadowBlur = 14; ctx.lineWidth = 2;
            hexAt(x, y, hr * Math.cos(el) * 0.95 + hr * 0.3); ctx.stroke(); ctx.globalAlpha *= 0.25; ctx.fillStyle = e.c1; ctx.fill();
          });
          ctx.globalAlpha = 1; ctx.shadowBlur = 0;
          if (p >= 0.55) { flash((0.04 - (p - 0.55)) * 10, e.c1); ctx.save(); ctx.globalAlpha = (1 - after) * 0.6 * fade; ctx.strokeStyle = "#ffffff"; ctx.shadowColor = e.c1; ctx.shadowBlur = 30; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(cx, cy - R * 0.5, R * 1.05 * (1 + after * 0.2), R * 1.05 * (1 + after * 0.2), 0, Math.PI, TAU); ctx.stroke(); ctx.restore(); }
        } }
    };
    Object.keys(CINE).forEach(function (k) { LIB[k] = CINE[k]; });

    Object.keys(LIB).forEach(function (k) { if (k !== "snap" && k !== "snapMax") LIB[k + "Epic"] = epicFx(LIB[k]); });

    function play(arch, fromEl, toEl, aura, abilityName, userName) {
      var def = LIB[arch] || LIB.strike;
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      var fr = fromEl.getBoundingClientRect(), tr = toEl.getBoundingClientRect();
      var env = { w: canvas.width, h: canvas.height, cx: canvas.width / 2, cy: canvas.height / 2,
        from: { x: fr.left + fr.width / 2, y: fr.top + fr.height / 2 }, to: { x: tr.left + tr.width / 2, y: tr.top + tr.height / 2 },
        c1: aura.c1, c2: aura.c2, colors: aura.colors, sig: auraSig(aura) };
      anim = { def: def, env: env, start: performance.now(), parts: def.parts ? def.parts(env) : null };
      el.style.setProperty("--c1", aura.c1); el.style.setProperty("--c2", aura.c2);
      nameEl.textContent = abilityName; userEl.textContent = userName;
      callout.classList.remove("go"); void callout.offsetWidth; callout.classList.add("go");
      el.classList.remove("hidden");
      cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
      return def.dur;
    }
    function frame(now) {
      if (!anim) return;
      var p = Math.min(1, (now - anim.start) / anim.def.dur);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawingEnv = anim.env; anim.env.skipSig = false;
      ctx.save(); try { anim.def.draw(p, anim.env, anim.parts); } catch (e) { p = 1; } ctx.restore();
      if (p >= 1) { anim = null; el.classList.add("hidden"); ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
      raf = requestAnimationFrame(frame);
    }
    function clear() { anim = null; cancelAnimationFrame(raf); el.classList.add("hidden"); }

    /* Finisher cinematic for a kill with a very rare aura (1 in a billion or rarer): the screen caves in, the
       foe is shattered, and a huge word slams in over the aura's own signature. */
    var KILL = {
      dur: 2900,
      parts: function (e) { return {
        m: moteParts(50),
        rays: parts(70, function () { return { a: Math.random() * TAU, o: Math.random(), l: rnd(0.2, 0.6) }; }),
        shards: parts(90, function () { return { a: Math.random() * TAU, v: rnd(0.3, 1.3), r: rnd(3, 11), spin: rnd(-8, 8), tri: Math.random() < 0.5 }; }),
        deb: parts(70, function () { return { x: Math.random(), y: rnd(0.6, 1.1), v: rnd(0.2, 0.7), r: rnd(1, 3), w: Math.random() * TAU }; })
      }; },
      draw: function (p, e, ps) {
        var s = Math.min(e.w, e.h), R = Math.hypot(e.w, e.h) / 2, cx = e.cx, cy = e.cy, fade = 1 - seg(p, 0.9, 1);
        var HIT = 0.36, charge = seg(p, 0.04, HIT), after = seg(p, HIT, 1), slam = seg(p, HIT, HIT + 0.12);
        ctx.fillStyle = "rgba(2,1,8," + (0.96 * Math.min(1, p / 0.05) * fade) + ")"; ctx.fillRect(0, 0, e.w, e.h);
        if (e.sig) drawSig(e, p, true, fade * (1 - after * 0.5));
        motes(e, ps.m, p, fade);
        /* speed lines rushing inward as it builds */
        if (p < HIT) ps.rays.forEach(function (l) { var k = (charge * 1.4 + l.o) % 1, r0 = R * (1.15 - k * 0.8), r1 = r0 - R * l.l * 0.3; ctx.globalAlpha = 0.45 * charge * fade; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx + Math.cos(l.a) * r0, cy + Math.sin(l.a) * r0); ctx.lineTo(cx + Math.cos(l.a) * r1, cy + Math.sin(l.a) * r1); ctx.stroke(); });
        var cr = s * 0.04 + s * 0.1 * ease(charge);
        if (p < HIT + 0.1) { var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr * 2.4); g.addColorStop(0, "#fff"); g.addColorStop(0.4, e.c1); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.globalAlpha = (0.6 + 0.4 * charge) * fade; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, cr * 2.4, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
        ctx.globalAlpha = 1;
        if (p >= HIT) {
          flash((0.09 - (p - HIT)) * 11, "#ffffff");
          [e.c1, "#ffffff", e.c2].forEach(function (c, i) { var w = seg(after, i * 0.05, 1); ring(cx, cy, R * 1.25 * ease(w), c, (e.big ? 9 : 7) * (1 - w) + 1, (1 - w) * fade); });
          /* the foe blown to shards */
          ps.shards.forEach(function (sh) { var t = after, d = R * sh.v * ease(t), x = cx + Math.cos(sh.a) * d, y = cy + Math.sin(sh.a) * d; ctx.save(); ctx.translate(x, y); ctx.rotate(sh.a + t * sh.spin); ctx.globalAlpha = (1 - t) * fade; ctx.fillStyle = sh.a % 2 ? e.c1 : "#e2e8f0"; ctx.shadowColor = e.c1; ctx.shadowBlur = 8; if (sh.tri) { ctx.beginPath(); ctx.moveTo(0, -sh.r); ctx.lineTo(sh.r * 0.7, sh.r); ctx.lineTo(-sh.r * 0.7, sh.r); ctx.fill(); } else ctx.fillRect(-sh.r, -sh.r * 0.5, sh.r * 2, sh.r); ctx.restore(); });
          ctx.shadowBlur = 0;
          if (e.big && slam < 0.5) for (var gl = 0; gl < 12; gl++) { ctx.fillStyle = ["rgba(239,68,68,.3)", "rgba(34,211,238,.3)", "rgba(255,255,255,.22)"][gl % 3]; ctx.fillRect(0, Math.random() * e.h, e.w, 2 + Math.random() * 12); }
          /* the word slams in with a chromatic edge */
          var tp = seg(after, 0.04, 0.6), fs = s * (e.big ? 0.15 : 0.12) * (1 + 0.7 * Math.exp(-tp * 9));
          var ta = Math.min(1, tp * 5) * (1 - seg(after, 0.78, 1)) * fade, ty = cy - s * 0.02;
          ctx.save(); ctx.font = "900 " + fs + "px 'Cinzel', serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          var off = (1 - tp) * 10 + 3;
          ctx.globalAlpha = ta * 0.85; ctx.fillStyle = e.c1; ctx.fillText(e.word, cx - off, ty); ctx.fillStyle = e.c2; ctx.fillText(e.word, cx + off, ty);
          ctx.globalAlpha = ta; ctx.fillStyle = "#ffffff"; ctx.shadowColor = e.c1; ctx.shadowBlur = 30; ctx.fillText(e.word, cx, ty);
          ctx.restore();
          /* the aura's name beneath */
          var na = Math.min(1, seg(after, 0.2, 0.4)) * (1 - seg(after, 0.8, 1)) * fade;
          ctx.save(); ctx.globalAlpha = na; ctx.fillStyle = "#e9e6ff"; ctx.shadowColor = e.c1; ctx.shadowBlur = 14; ctx.font = "700 " + Math.round(s * 0.035) + "px 'Cinzel', serif"; ctx.textAlign = "center"; ctx.fillText("by " + (e.auraName || ""), cx, ty + fs * 0.55); ctx.restore();
          /* drifting debris */
          ps.deb.forEach(function (d) { var y = (d.y - after * d.v) * e.h, x = d.x * e.w + Math.sin(d.w + p * 5) * 14; spark(x, y, d.r, Math.random() < 0.5 ? e.c1 : "#fde68a", Math.min(1, after * 3) * (1 - after) * fade); });
        }
        var bar = e.h * 0.12 * ease(Math.min(1, p / 0.08)) * fade; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, e.w, bar); ctx.fillRect(0, e.h - bar, e.w, bar);
      }
    };
    function playKill(aura, word, big) {
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      var env = { w: canvas.width, h: canvas.height, cx: canvas.width / 2, cy: canvas.height / 2,
        c1: aura.c1, c2: aura.c2, colors: aura.colors, sig: auraSig(aura), word: word, big: !!big, auraName: aura.name };
      anim = { def: KILL, env: env, start: performance.now(), parts: KILL.parts(env) };
      el.style.setProperty("--c1", aura.c1); el.style.setProperty("--c2", aura.c2);
      nameEl.textContent = ""; userEl.textContent = "";
      el.classList.remove("hidden");
      cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
      return KILL.dur;
    }
    return { play: play, clear: clear, kill: playKill, LIB: LIB };
  })();

  var SELF_ARCHS = { guard: 1, heal: 1, focus: 1, reflect: 1, shield: 1 };

  function fighterPose(side, cls) {
    var el = $("#fighter-" + side);
    el.classList.remove("lunge-left", "lunge-right", "cast", "slam");
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function abilityLabel(side, ab, c1) {
    var target = $("#fighter-" + side);
    var r = target.getBoundingClientRect();
    var lab = document.createElement("div");
    lab.className = "ab-label";
    lab.textContent = ab.icon + " " + ab.name;
    lab.style.setProperty("--c1", c1);
    lab.style.left = (r.left + r.width / 2) + "px";
    lab.style.top = (r.top + window.scrollY - 6) + "px";
    document.body.appendChild(lab);
    setTimeout(function () { lab.remove(); }, 900);
  }

  /* Play the visual for an ability use; returns how long the event player should wait.
     Legendary and rarer auras take over the whole screen; everything else plays in the arena. */
  function abilityVisual(who, ab) {
    if (!battle || !ab) return 250;
    if (S.settings.skipAnims) { Sound.ability(ab.arch); return 110; }
    var target = Engine.other(who);
    var f = battle[who];
    var aura = f.auraId !== null && f.auraId !== undefined ? A.byId(f.auraId) : null;
    var c1 = aura ? aura.c1 : "#f87171", c2 = aura ? aura.c2 : "#7f1d1d";
    var self = SELF_ARCHS[ab.arch];
    var pose = self || ab.arch === "snap" ? "cast" : (ab.arch === "heavy" || ab.arch === "execute" ? "slam" : (who === "a" ? "lunge-right" : "lunge-left"));
    fighterPose(who, pose);
    $("#fighter-" + who).style.setProperty("--c1", c1);
    $("#fighter-" + who).classList.remove("flare"); void $("#fighter-" + who).offsetWidth; $("#fighter-" + who).classList.add("flare");
    abilityLabel(who, ab, c1);
    var ultimate = aura && tierIndex(aura) >= 4;
    if (ab.arch === "snap" && ultimate) {
      /* The full-screen snap; the crack, the shake and the boom land when the fingers snap. */
      var sfx = isEpicAura(f) ? "snapMax" : "snap";
      var sdur = UFX.play(sfx, $("#visual-" + who), $("#visual-" + target), aura, ab.name, f.name === "You" ? "You unleash" : f.name + " unleashes");
      setTimeout(function () { Sound.ability("snap"); shake(sfx === "snapMax" ? 3 : 2); if (sfx === "snapMax") Sound.boom(3); }, sdur * UFX.LIB[sfx].snapAt);
      return sdur + 120;
    }
    Sound.ability(ab.arch);
    if (ultimate && isEpicAura(f) && UFX.LIB[ab.arch + "Epic"]) {
      /* Rarer than 1 in 3,000,000: the cinematic version, with the shake and boom on the impact. */
      var edef = UFX.LIB[ab.arch + "Epic"];
      var edur = UFX.play(ab.arch + "Epic", $("#visual-" + who), $("#visual-" + (self ? who : target)), aura, ab.name, f.name === "You" ? "You unleash" : f.name + " unleashes");
      setTimeout(function () { shake(self ? 1 : 3); Sound.boom(self ? 1 : 3); react(self ? who : target, ab.arch); }, edur * edef.impact);
      setTimeout(function () { BFX.play(ab.arch, who, self ? who : target, c1, c2); }, edur * (edef.impact + 0.05));
      return edur + 120;
    }
    if (ultimate) {
      var udur = UFX.play(ab.arch, $("#visual-" + who), $("#visual-" + (self ? who : target)), aura, ab.name, f.name === "You" ? "You unleash" : f.name + " unleashes");
      var udef = UFX.LIB[ab.arch], hitAt = udef && udef.impact ? udef.impact : 0.45;
      var ushake = ab.arch === "burst" || ab.arch === "execute" ? 3 : (ab.arch === "heavy" || ab.arch === "stun" || ab.arch === "barrage" ? 2 : 1);
      setTimeout(function () { shake(ushake); react(self ? who : target, ab.arch); if (ab.arch === "burst" || ab.arch === "execute" || ab.arch === "heavy") Sound.boom(2); }, udur * hitAt);
      setTimeout(function () { BFX.play(ab.arch, who, self ? who : target, c1, c2); }, udur * Math.min(0.9, hitAt + 0.05));
      return udur + 120;
    }
    var dur = BFX.play(ab.arch, who, self ? who : target, c1, c2);
    var def = BFX.LIB[ab.arch];
    if (def && def.shake) setTimeout(function () { shake(def.shake); }, dur * 0.45);
    setTimeout(function () { react(self ? who : target, ab.arch); }, dur * 0.45);
    return dur + 80;
  }

  /* ---------- Battle UI ---------- */

  var battle = null;
  var view = { me: "a", pvp: false, animating: false, bot: null };
  var botTimer = null;

  /* ---------- Doubloon shop: potions bought with tower doubloons ---------- */
  var DOUBLOON_SHOP = [
    ["monstrous", 20000],
    ["fortune", 250], ["heavenly", 1200], ["starlight", 2500], ["godly", 6000], ["voidess", 12000],
    ["rush", 1500], ["treasure", 4000], ["hoard", 9000],
    ["magnet", 400], ["epicmagnet", 2000], ["lure", 8000], ["prism", 5000],
    ["titan", 300], ["rage", 1200], ["godslayer", 5000], ["steelwall", 1200], ["phoenix", 4000],
    ["fullheal", 800], ["megamystery", 3500]
  ];
  function openDoubloonShop() { $("#doubloon-modal").classList.remove("hidden"); renderDoubloonShop(); }
  function closeDoubloonShop() { $("#doubloon-modal").classList.add("hidden"); }
  function renderDoubloonShop() {
    $("#doubloon-balance").textContent = fmt(S.doubloons || 0);
    var grid = $("#doubloon-grid");
    grid.innerHTML = "";
    DOUBLOON_SHOP.forEach(function (row) {
      var key = row[0], cost = row[1], pot = POTIONS[key];
      if (!pot) return;
      var full = pot.kind === "heal" && potionRoom(key) < 1;
      var card = document.createElement("div");
      card.className = "card";
      card.innerHTML =
        "<div class=\"row\"><div class=\"big-icon\">" + pot.icon + "</div><div><div class=\"card-title\">" + pot.name + "</div><div class=\"card-sub\">" + pot.desc + "</div></div></div>" +
        "<div class=\"row\"><span class=\"price\">🪙 " + fmt(cost) + "</span><span class=\"card-sub\">owned: " + fmt(S.potions[key] || 0) + "</span></div>";
      var actions = document.createElement("div");
      actions.className = "actions";
      var buy = document.createElement("button");
      buy.className = "btn small primary" + (full || (S.doubloons || 0) < cost ? " cant-afford" : "");
      buy.textContent = full ? "Full" : "Buy";
      buy.addEventListener("click", function () { buyDoubloonPotion(key, cost); });
      actions.appendChild(buy);
      card.appendChild(actions);
      grid.appendChild(card);
    });
  }
  function buyDoubloonPotion(key, cost) {
    var pot = POTIONS[key];
    if (!pot) return;
    if (potionRoom(key) < 1) { errorToast(ERR.POTION_BUY, "You can only carry " + MAX_HEALS + " healing potions. Use one in a bot fight first."); return; }
    if ((S.doubloons || 0) < cost) { errorToast(ERR.POTION_BUY, "Not enough doubloons for " + pot.name + " (" + fmt(cost) + " needed). Win floors in the Tower."); return; }
    S.doubloons -= cost;
    addPotion(key, 1);
    Sound.buy();
    toast("🪙 Bought " + pot.name + " for " + fmt(cost) + " doubloons", "gold");
    save();
    renderAll();
    renderDoubloonShop();
  }

  /* Pretty "2d 4h" style countdown. */
  function fmtDuration(ms) {
    var s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    if (d > 0) return d + "d " + h + "h";
    if (h > 0) return h + "h " + m + "m";
    if (m > 0) return m + "m";
    return Math.max(1, s) + "s";
  }

  /* Auras are locked (a swearing punishment from chat) until S.aurasLockedUntil. While locked your auras are
     "gone": you can't roll, equip, battle, climb the Tower, sell or gift until the timer runs out. */
  function aurasLocked() { return (S.aurasLockedUntil || 0) > Date.now(); }
  function aurasLockText() { return fmtDuration(Math.max(0, (S.aurasLockedUntil || 0) - Date.now())); }
  /* Called when the server (or a save from another device) tells us the lock time. Saves if it changed. */
  function setAuraLock(until) {
    until = Math.max(0, Math.floor(Number(until) || 0));
    if (until === (S.aurasLockedUntil || 0)) return;
    var wasLocked = aurasLocked();
    S.aurasLockedUntil = until;
    saveLocal();
    if (aurasLocked() && !wasLocked) toast("🚫 Your auras are locked for " + aurasLockText() + " for swearing in chat.", "bad", 8000);
    renderAll();
  }

  function renderTower() {
    if (!$("#tab-tower").classList.contains("active")) return;
    towerCheckReset();
    renderHUD();
    var reach = towerReachable(), eq = equippedAura(), pp = playerPower();
    var st = $("#tower-status");
    st.innerHTML =
      "<div class=\"tower-top\">" +
        "<div class=\"tower-stat\"><span class=\"hud-label\">Doubloons</span><span class=\"tower-doub\">🪙 " + fmt(S.doubloons || 0) + "</span></div>" +
        "<div class=\"tower-stat\"><span class=\"hud-label\">Highest floor</span><span>" + fmt(S.tower.best || 0) + " / " + TOWER_FLOORS + "</span></div>" +
        "<div class=\"tower-stat\"><span class=\"hud-label\">Resets in</span><span>" + fmtDuration(towerResetIn()) + "</span></div>" +
      "</div>" +
      "<div class=\"tower-top2\">" +
        "<span class=\"card-sub\">Fighting with: " + (eq ? auraLabel(eq, equippedShiny()) + " · Power " + fmt(pp) : "<b>no aura equipped — equip one in your Inventory</b>") + "</span>" +
        "<button type=\"button\" class=\"btn small primary\" id=\"tower-shop-open\">🪙 Doubloon shop</button>" +
      "</div>";
    $("#tower-shop-open").addEventListener("click", openDoubloonShop);

    var box = $("#tower-floors");
    box.innerHTML = "";
    var canFight = !(battle && !battle.over) && PvP.status !== "connected" && !!eq;
    TOWER.forEach(function (fb) {
      var floor = fb.floor, done = !!S.tower.cleared[floor], isNext = floor === reach, locked = floor > reach;
      var reward = towerFirst(floor);
      var ratio = pp / fb.power, verdict = ratio >= 1.3 ? "Easy" : ratio >= 1 ? "Fair" : ratio >= 0.75 ? "Hard" : "Deadly";
      var vcls = ratio >= 1 ? "t-uncommon" : ratio >= 0.75 ? "t-legendary" : "t-forbidden";
      var row = document.createElement("div");
      row.className = "tower-row" + (locked ? " locked" : "") + (isNext ? " next" : "") + (done ? " done" : "");
      row.innerHTML =
        "<span class=\"tower-ic\">" + (done ? "✅" : locked ? "🔒" : fb.icon) + "</span>" +
        "<span class=\"tower-name\"><b>" + fb.name + "</b><span class=\"card-sub\">Power " + fmt(fb.power) +
          (done ? " · <span class=\"t-uncommon\">cleared</span>" : locked ? " · locked" : " · <span class=\"" + vcls + "\">" + verdict + "</span>") + "</span></span>" +
        "<span class=\"tower-reward\">🪙 " + fmt(reward) + (isNext ? " <span class=\"first\">next</span>" : "") + "</span>";
      var btn = document.createElement("button");
      btn.className = "btn small" + (isNext ? " primary" : "");
      btn.textContent = done ? "✓ Cleared" : isNext ? "Fight" : "Locked";
      btn.disabled = !isNext || !canFight;
      if (isNext) btn.addEventListener("click", function () { startTowerFight(floor); });
      row.appendChild(btn);
      box.appendChild(row);
    });
  }

  /* Fight a tower floor with the equipped aura (same engine as a bot fight; the win pays doubloons). */
  function startTowerFight(floor) {
    if (battle && !battle.over) return;
    if (aurasLocked()) { toast("Your auras are locked for " + aurasLockText(), "bad"); return; }
    if (PvP.status === "connected") { toast("Leave the PvP room first", "bad"); return; }
    if (floor !== towerReachable()) { toast("Fight the floors in order — one at a time", "bad"); return; }
    var aura = equippedAura();
    if (!aura) { toast("Equip an aura first", "bad"); return; }
    var fb = TOWER[floor - 1];
    var spec = myFighterSpec();
    spec.dmgMult = S.strengthMult > 1 ? S.strengthMult : 1;
    var me = fighterFromSpec(spec);
    if (S.shieldReady > 0) me.shield = Math.round(me.maxHp * S.shieldReady);
    if (S.reviveReady > 0) { var rp = potionMatching("revive", "pct", S.reviveReady); me.revive = S.reviveReady; if (rp) { me.reviveName = rp.name; me.reviveIcon = rp.icon; } }
    var bkit = K.botKit(fb.kitId);
    var them = Engine.makeFighter({ name: fb.name, power: fb.power, kit: bkit, abilities: bkit.map(function (ab) { return ab.id; }), icon: fb.icon, isBot: true });
    battle = Engine.create(me, them, "a");
    view = { me: "a", pvp: false, animating: false, bot: { id: "tower-" + floor, name: fb.name, icon: fb.icon, power: fb.power }, tower: { floor: floor } };
    openArena();
    $("#arena-banner").textContent = "🗼 Tower · Floor " + floor;
    if (S.strengthMult > 1) { logLine("💪 +" + Math.round((S.strengthMult - 1) * 100) + "% damage this fight", "you"); S.strengthMult = 1; }
    if (S.shieldReady > 0) { logLine(readyLabel("shield", S.shieldReady, "🛡️ Iron Skin") + ": you start with a " + fmt(me.shield) + " shield", "you"); S.shieldReady = 0; }
    if (S.reviveReady > 0) { logLine(readyLabel("revive", S.reviveReady, "🕊️ Second Wind") + " is ready to save you once", "you"); S.reviveReady = 0; }
    logLine("🗼 Floor " + floor + " — " + fb.name + " (Power " + fmt(fb.power) + ") challenges you!", "");
    save();
    renderArena();
    renderAll();
  }

  function renderBots() {
    var grid = $("#bot-grid");
    grid.innerHTML = "";
    var pp = playerPower();
    BOTS.forEach(function (bot) {
      var card = document.createElement("div");
      card.className = "card" + (bot.boss ? " boss" : "");
      var wins = S.botWins[bot.id] || 0;
      var ratio = pp / bot.power;
      var verdict = ratio >= 1.3 ? "Easy" : ratio >= 1 ? "Fair" : ratio >= 0.75 ? "Hard" : "Deadly";
      var vcls = ratio >= 1 ? "t-uncommon" : ratio >= 0.75 ? "t-legendary" : "t-forbidden";
      var abil = K.botKit(bot.id).map(function (ab) { return ab.icon + " " + ab.name; }).join(" · ");
      card.innerHTML =
        "<div class=\"row\"><div class=\"big-icon\">" + bot.icon + "</div><div><div class=\"card-title\">" + bot.name + "</div><div class=\"card-sub\">Power " + fmt(bot.power) + " · <span class=\"" + vcls + "\">" + verdict + "</span></div><div class=\"card-sub\">Abilities: " + abil + "</div></div></div>" +
        "<div class=\"row\"><span class=\"price\">+" + fmt(bot.reward) + " coins</span><span class=\"card-sub\">wins: " + wins + "</span></div>";
      var actions = document.createElement("div");
      actions.className = "actions";
      var btn = document.createElement("button");
      btn.className = "btn small primary";
      btn.textContent = "Fight";
      btn.disabled = (!!battle && !battle.over) || PvP.status === "connected";
      btn.addEventListener("click", function () { startBotFight(bot); });
      actions.appendChild(btn);
      card.appendChild(actions);
      grid.appendChild(card);
    });
  }

  function myFighterSpec() {
    var aura = equippedAura();
    return { name: (S.playerName || "You"), power: playerPower(), auraId: aura ? aura.id : null, shiny: equippedShiny(), loadout: aura ? loadoutFor(aura) : DEFAULT_LOADOUT.slice(), isBot: false };
  }

  /* Build a fighter from a spec: its kit comes from the aura, its abilities from the loadout slots. */
  function fighterFromSpec(spec) {
    var aura = spec.auraId !== null && spec.auraId !== undefined ? A.byId(spec.auraId) : null;
    var kit = aura ? K.kitFor(aura) : K.botKit("dummy");
    var slots = Array.isArray(spec.loadout) && spec.loadout.length ? spec.loadout : DEFAULT_LOADOUT;
    var abilities = slots.filter(function (i) { return kit[i]; }).map(function (i) { return kit[i].id; });
    if (!abilities.length) abilities = [kit[0].id];
    return Engine.makeFighter({ name: spec.name, power: spec.power, kit: kit, abilities: abilities, auraId: aura ? aura.id : null, shiny: isShiny(aura, spec.shiny), dmgMult: spec.dmgMult || 1, isBot: false });
  }

  function startBotFight(bot) {
    if (battle && !battle.over) return;
    if (aurasLocked()) { toast("Your auras are locked for " + aurasLockText(), "bad"); return; }
    if (PvP.status === "connected") { toast("Leave the PvP room to fight bots", "bad"); return; }
    var aura = equippedAura();
    if (!aura) { toast("Equip an aura first", "bad"); return; }
    var spec = myFighterSpec();
    spec.dmgMult = S.strengthMult > 1 ? S.strengthMult : 1;
    var me = fighterFromSpec(spec);
    if (S.shieldReady > 0) { me.shield = Math.round(me.maxHp * S.shieldReady); }
    if (S.reviveReady > 0) {
      var rp = potionMatching("revive", "pct", S.reviveReady);
      me.revive = S.reviveReady;
      if (rp) { me.reviveName = rp.name; me.reviveIcon = rp.icon; }
    }
    var bkit = K.botKit(bot.id);
    var them = Engine.makeFighter({ name: bot.name, power: bot.power, kit: bkit, abilities: bkit.map(function (ab) { return ab.id; }), icon: bot.icon, isBot: true });
    battle = Engine.create(me, them, "a");
    view = { me: "a", pvp: false, animating: false, bot: bot };
    openArena();
    $("#arena-banner").textContent = "Bot fight";
    if (S.strengthMult > 1) { logLine("💪 +" + Math.round((S.strengthMult - 1) * 100) + "% damage this fight", "you"); S.strengthMult = 1; }
    if (S.shieldReady > 0) { logLine(readyLabel("shield", S.shieldReady, "🛡️ Iron Skin") + ": you start with a " + fmt(me.shield) + " shield", "you"); S.shieldReady = 0; }
    if (S.reviveReady > 0) { logLine(readyLabel("revive", S.reviveReady, "🕊️ Second Wind") + " is ready to save you once", "you"); S.reviveReady = 0; }
    logLine("⚔️ " + bot.name + " challenges you!", "");
    /* Saved now so the potions this fight used up stay used up even if the page is reloaded mid-fight. */
    save();
    renderArena();
    renderAll();
  }

  function openArena() {
    BFX.clear();
    UFX.clear();
    unsnap("a", false);
    unsnap("b", false);
    $("#fighter-a").classList.remove("killed");
    $("#fighter-b").classList.remove("killed");
    var arena = $("#arena");
    arena.classList.remove("hidden");
    $("#battle-result").classList.add("hidden");
    $("#battle-log").innerHTML = "";
    $("#post-battle").innerHTML = "";
    switchTab("battle");
    arena.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function fighterVisual(f, el) {
    el.innerHTML = "";
    if (f.auraId !== null && f.auraId !== undefined && A.byId(f.auraId)) {
      el.appendChild(makeOrb(A.byId(f.auraId), "small", f.shiny));
    } else {
      var ic = document.createElement("div");
      ic.className = "fighter-icon";
      ic.textContent = f.icon || "🤖";
      el.appendChild(ic);
    }
  }

  function statusChips(f) {
    var chips = [];
    if (f.guard) chips.push(["🛡️ Guard", "good"]);
    if (f.focus) chips.push(["🔮 Focus", "good"]);
    if (f.reflect) chips.push(["🪞 Mirror", "good"]);
    if (f.shield > 0) chips.push(["🔰 Shield " + fmt(f.shield), "good"]);
    if (f.revive > 0) chips.push([(f.reviveIcon || "🕊️") + " " + (f.reviveName || "Second Wind"), "good"]);
    if (f.poison) chips.push(["☠️ Poison " + f.poison.turns, "bad"]);
    if (f.weaken > 0) chips.push(["🌀 Weak " + f.weaken, "bad"]);
    if (f.stunned) chips.push(["⚡ Stunned", "bad"]);
    return chips;
  }

  function renderArena() {
    if (!battle) return;
    ["a", "b"].forEach(function (side) {
      var f = battle[side];
      fighterVisual(f, $("#visual-" + side));
      $("#name-" + side).textContent = f.name + " (" + fmt(f.power) + ")";
      /* While a turn is being played out, the HP bars move with each hit (setHP), not ahead of them. */
      if (!view.animating) {
        $("#hp-" + side).style.width = Math.max(0, f.hp / f.maxHp * 100) + "%";
        $("#hptext-" + side).textContent = fmt(Math.max(0, f.hp)) + " / " + fmt(f.maxHp);
      }
      var row = $("#status-" + side);
      row.innerHTML = "";
      statusChips(f).forEach(function (c) {
        var s = document.createElement("span");
        s.className = "status " + c[1];
        s.textContent = c[0];
        row.appendChild(s);
      });
      $("#fighter-" + side).classList.toggle("active-turn", battle.turn === side && !battle.over);
    });
    ["a", "b"].forEach(function (side) {
      $("#hp-" + side).classList.toggle("player", view.me === side);
      $("#hp-" + side).classList.toggle("bot", view.me !== side);
    });
    $("#arena-round").textContent = "Round " + battle.round;

    var myTurn = battle.turn === view.me && !battle.over && !view.animating;
    var ti = $("#turn-indicator");
    if (battle.over) ti.textContent = "";
    else if (view.animating) ti.textContent = "…";
    else ti.textContent = myTurn ? "Your turn — choose an ability" : (view.pvp ? "Waiting for opponent…" : battle.b.name + " is thinking…");

    var bar = $("#ability-bar");
    bar.innerHTML = "";
    var me = battle[view.me];
    me.abilities.forEach(function (id) {
      var ab = kitAbility(me, id);
      if (!ab) return;
      var btn = document.createElement("button");
      btn.className = "ability-btn";
      var cdLeft = me.cooldowns[id] || 0;
      btn.disabled = !myTurn || cdLeft > 0;
      btn.title = ab.desc;
      var sub = ab.flat ? fmt(ab.flat) + " dmg" : ab.mult > 0 ? "~" + fmt(Math.round(me.power * ab.mult * me.dmgMult)) + " dmg" + (ab.hits ? " x" + ab.hits : "") : "support";
      btn.innerHTML = "<span class=\"ab-icon\">" + ab.icon + "</span><span class=\"ab-name\">" + ab.name + "</span><span class=\"ab-sub\">" + sub + "</span>" + (cdLeft > 0 ? "<span class=\"cd\">" + cdLeft + "</span>" : "");
      btn.addEventListener("click", function () { chooseAbility(id); });
      bar.appendChild(btn);
    });

    $("#btn-heal").classList.toggle("hidden", view.pvp);
    var heals = healKeys().reduce(function (n, k) { return n + (S.potions[k] || 0); }, 0);
    $("#btn-heal").textContent = "❤️ Heal potion (" + heals + ")";
    $("#btn-heal").disabled = !(heals > 0) || battle.over || !myTurn;
    $("#btn-flee").disabled = battle.over;
  }

  function logLine(text, cls) {
    var log = $("#battle-log");
    var d = document.createElement("div");
    d.className = cls || "";
    d.textContent = text;
    log.insertBefore(d, log.firstChild);
  }

  function floatText(side, text, cls) {
    var target = $("#fighter-" + side);
    var el = document.createElement("div");
    el.className = "dmg-float " + (cls || "");
    el.textContent = text;
    var rect = target.getBoundingClientRect();
    el.style.left = (rect.left + rect.width / 2 - 20 + (Math.random() - 0.5) * 40) + "px";
    el.style.top = (rect.top + window.scrollY + 10) + "px";
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 900);
  }

  function flash(side, cls) {
    var el = $("#fighter-" + side);
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function sideName(side) { return battle[side].name; }
  function isMe(side) { return side === view.me; }

  /* Play a list of engine events with small delays, then call done(). */
  function playEvents(events, done) {
    view.animating = true;
    renderArena();
    var i = 0;
    function step() {
      if (!battle) { view.animating = false; return; }
      if (i >= events.length) {
        view.animating = false;
        renderArena();
        if (done) done();
        return;
      }
      var e = events[i++];
      var delay = 420;
      switch (e.type) {
        case "use":
          logLine((isMe(e.who) ? "You use " : sideName(e.who) + " uses ") + e.icon + " " + e.name, isMe(e.who) ? "you" : "them");
          delay = abilityVisual(e.who, kitAbility(battle[e.who], e.ability));
          break;
        case "damage":
          if (e.flat && e.flatArch === "snap") { delay = snapHit(e); break; }
          flash(e.target, "hit");
          var flatTag = e.flat ? String(e.flatIcon || "").slice(0, 4) : "";
          floatText(e.target, "-" + fmt(e.amount) + (e.flat ? " " + flatTag : e.crit ? "!" : ""), e.flat ? "t-chosen" : e.crit ? "t-divine" : "t-forbidden");
          Sound.hit(e.crit);
          logLine((e.flat ? flatTag + " " + String(e.flatName || "").slice(0, 30).toUpperCase() + "! " : "") + (e.crit ? "💥 CRIT! " : "") + (e.executed ? "EXECUTE! " : "") + (isMe(e.who) ? "You hit " + sideName(e.target) : sideName(e.who) + " hits " + (isMe(e.target) ? "you" : sideName(e.target))) + " for " + fmt(e.amount) + (e.absorbed ? " (" + fmt(e.absorbed) + " absorbed)" : "") + (e.blocked ? " (blocked 60%)" : ""), e.crit || e.executed ? "crit" : (isMe(e.who) ? "you" : "them"));
          setHP(e);
          break;
        case "heal":
          flash(e.who, "healed");
          floatText(e.who, "+" + fmt(e.amount), "heal");
          Sound.heal();
          logLine((isMe(e.who) ? "You heal" : sideName(e.who) + " heals") + " for " + fmt(e.amount), isMe(e.who) ? "you" : "them");
          setHP(e);
          break;
        case "poison":
          flash(e.who, "hit");
          floatText(e.who, "-" + fmt(e.amount) + " ☠️", "t-uncommon");
          logLine("☠️ " + (isMe(e.who) ? "You take" : sideName(e.who) + " takes") + " " + fmt(e.amount) + " poison damage", isMe(e.who) ? "them" : "you");
          setHP(e);
          break;
        case "reflect":
          flash(e.target, "hit");
          floatText(e.target, "-" + fmt(e.amount) + " 🪞", "t-cosmic");
          logLine("🪞 " + (isMe(e.who) ? "Your mirror reflects " : sideName(e.who) + "'s mirror reflects ") + fmt(e.amount) + " damage", isMe(e.who) ? "you" : "them");
          setHP(e);
          break;
        case "buff":
          logLine((isMe(e.who) ? "You gain " : sideName(e.who) + " gains ") + (e.effect === "shield" ? "a shield of " + fmt(e.amount) : e.effect), isMe(e.who) ? "you" : "them");
          delay = 250;
          break;
        case "debuff":
          logLine((isMe(e.who) ? "You are " : sideName(e.who) + " is ") + (e.effect === "poison" ? "poisoned" : e.effect === "weaken" ? "weakened" : "stunned") + "!", isMe(e.who) ? "them" : "you");
          break;
        case "consume":
          delay = 100;
          break;
        case "stunned":
          logLine("⚡ " + (isMe(e.who) ? "You are stunned and skip a turn" : sideName(e.who) + " is stunned and skips a turn"), isMe(e.who) ? "them" : "you");
          break;
        case "revive":
          unsnap(e.who, true);
          flash(e.who, "healed");
          var rf = battle[e.who];
          floatText(e.who, (rf.reviveName || "Second Wind").toUpperCase(), "heal");
          Sound.heal();
          logLine((rf.reviveIcon || "🕊️") + " " + (isMe(e.who) ? (rf.reviveName || "Second Wind") + " saves you!" : sideName(e.who) + " refuses to fall!"), isMe(e.who) ? "you" : "them");
          setHP(e);
          delay = 700;
          break;
        case "end":
          var wf = battle[e.winner], loserSide = Engine.other(e.winner);
          var ka = wf && wf.auraId !== null && wf.auraId !== undefined ? A.byId(wf.auraId) : null;
          delay = ka && effRarity(ka, wf.shiny) >= 1e9 ? killScene(loserSide, ka, wf.shiny) : 200;
          break;
      }
      setTimeout(step, delay);
    }
    step();
  }

  /* A finisher cinematic when a kill is landed with a 1-in-a-billion-or-rarer aura: the loser is shattered and
     a full-screen scene plays. Returns how long to wait before the result shows. */
  function killScene(loser, aura, shiny) {
    if (!battle || S.settings.skipAnims) return 200;
    var host = $("#fighter-" + loser);
    /* A snap kill already plays the snap finisher (the foe turns to dust), so don't stack a kill scene on it. */
    if (host.classList.contains("snapped")) return 200;
    var r = effRarity(aura, shiny);
    var word = r >= 1e15 ? "ERASED" : r >= 1e11 ? "ANNIHILATED" : "ELIMINATED", big = r >= 1e11;
    host.classList.remove("killed", "reform"); void host.offsetWidth; host.classList.add("killed");
    var dur = UFX.kill(aura, word, big);
    Sound.boom(3); shake(3);
    setTimeout(function () { shake(big ? 3 : 2); if (big) Sound.boom(3); }, dur * (big ? 0.62 : 0.56));
    logLine("💀 " + word + "! " + sideName(loser) + " was wiped out by " + auraLabel(aura, shiny) + ".", "crit");
    return dur + 150;
  }

  /* How a fighter reacts in the arena when a move lands on them (or, for moves on yourself, on the caster). */
  var REACT = { strike: "slashed", heavy: "smashed", precision: "pierced", drain: "drained", poison: "poisoned", weaken: "weakened", stun: "zapped", burst: "blasted", barrage: "pelted", execute: "executed", guard: "warded", heal: "blessed", focus: "focused", reflect: "mirrored", shield: "warded" };
  var REACT_CLASSES = Object.keys(REACT).map(function (k) { return "re-" + REACT[k]; });
  function react(side, arch) {
    var kind = REACT[arch], host = $("#fighter-" + side);
    if (!kind || !battle || host.classList.contains("snapped")) return;
    if (kind === "slashed") { sliceFighter(side); return; }
    REACT_CLASSES.forEach(function (c) { host.classList.remove(c); });
    void host.offsetWidth;
    host.classList.add("re-" + kind);
    host.style.setProperty("--away", side === "a" ? "-1" : "1");
    setTimeout(function () { host.classList.remove("re-" + kind); }, 1300);
  }
  /* Cut in two: two copies of the fighter's picture, each showing one half, slide apart along a diagonal and
     come back together. */
  function sliceFighter(side) {
    var vis = $("#visual-" + side), host = $("#fighter-" + side), r = vis.getBoundingClientRect(), hr = host.getBoundingClientRect();
    ["hi", "lo"].forEach(function (half) {
      var c = vis.cloneNode(true);
      c.removeAttribute("id");
      c.classList.add("slice", "slice-" + half);
      c.style.left = (r.left - hr.left) + "px"; c.style.top = (r.top - hr.top) + "px"; c.style.width = r.width + "px"; c.style.height = r.height + "px";
      host.appendChild(c);
      setTimeout(function () { c.remove(); }, 950);
    });
    vis.classList.add("sliced");
    setTimeout(function () { vis.classList.remove("sliced"); }, 950);
  }

  /* Fighters whose aura is rarer than 1 in 3,000,000 get the cinematic versions of their moves. */
  function isEpicAura(f) {
    var aura = f && f.auraId !== null && f.auraId !== undefined ? A.byId(f.auraId) : null;
    return !!aura && effRarity(aura, f.shiny) > 3e6;
  }

  /* The Snap lands: the target crumbles into dust from the side facing the snapper while its HP drains slowly
     and the number counts down. If it survives, it pulls itself back together. Returns how long to wait. */
  function snapHit(e) {
    var side = e.target;
    if (S.settings.skipAnims) {
      floatText(side, "-" + fmt(e.amount) + " 🫰", "t-chosen");
      logLine("🫰 SNAP! " + (isMe(e.who) ? "You snap " + sideName(side) : sideName(e.who) + " snaps " + (isMe(side) ? "you" : sideName(side))) + " for " + fmt(e.amount), "crit");
      setHP(e);
      return 250;
    }
    var max = isEpicAura(battle[e.who]), ms = max ? 3600 : 3000;
    var vis = $("#fighter-" + side), bar = $("#hp-" + side), txt = $("#hptext-" + side);
    var a = vis.getBoundingClientRect(), b = $("#visual-" + e.who).getBoundingClientRect();
    var dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    var dir = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "from-left" : "from-right") : (dy < 0 ? "from-top" : "from-bottom");
    unsnap(side, false);
    void vis.offsetWidth;
    vis.style.setProperty("--snap-ms", ms + "ms");
    vis.classList.add("snapped", dir);
    var aura = battle[e.who].auraId !== null && battle[e.who].auraId !== undefined ? A.byId(battle[e.who].auraId) : null;
    BFX.play(max ? "dustMax" : "dust", e.who, side, aura ? aura.c1 : "#e2e8f0", aura ? aura.c2 : "#94a3b8", true);
    floatText(side, "-" + fmt(e.amount) + " 🫰", "t-chosen");
    Sound.dust(ms / 1000);
    logLine("🫰 SNAP! " + (isMe(e.who) ? "You snap " + sideName(side) : sideName(e.who) + " snaps " + (isMe(side) ? "you" : sideName(side))) + " for " + fmt(e.amount), "crit");
    /* the HP bar slides down slowly while the number counts down */
    var from = parseInt(txt.textContent.replace(/,/g, ""), 10), to = Math.max(0, side === "a" ? e.hpA : e.hpB), max0 = battle[side].maxHp;
    /* the bar empties a little before the fighter is fully gone */
    bar.style.setProperty("--snap-ms", Math.round(ms * 0.7) + "ms");
    bar.classList.add("drain-slow");
    setHP(e);
    if (isFinite(from) && from > to) {
      var t0 = performance.now();
      var tick = function (now) {
        var q = Math.max(0, Math.min(1, (now - t0) / (ms * 0.7))), v = Math.round(from + (to - from) * (1 - Math.pow(1 - q, 2)));
        txt.textContent = fmt(v) + " / " + fmt(max0);
        if (q < 1 && battle) requestAnimationFrame(tick);
      };
      txt.textContent = fmt(from) + " / " + fmt(max0);
      requestAnimationFrame(tick);
    }
    var survives = battle[side].hp > 0;
    setTimeout(function () {
      bar.classList.remove("drain-slow");
      if (battle && battle[side].hp > 0) unsnap(side, true);
    }, ms + 150);
    return survives ? ms + 1150 : ms + 250;
  }

  /* Undo the dust: straight away, or with the fighter pulling itself back together (`reform`). */
  function unsnap(side, reform) {
    var vis = $("#fighter-" + side);
    if (!vis.classList.contains("snapped")) { if (!reform) vis.classList.remove("reform"); return; }
    vis.classList.remove("snapped", "from-left", "from-right", "from-top", "from-bottom", "reform");
    if (reform) { void vis.offsetWidth; vis.classList.add("reform"); }
  }

  function setHP(e) {
    if (!battle) return;
    $("#hp-a").style.width = Math.max(0, e.hpA / battle.a.maxHp * 100) + "%";
    $("#hp-b").style.width = Math.max(0, e.hpB / battle.b.maxHp * 100) + "%";
    $("#hptext-a").textContent = fmt(Math.max(0, e.hpA)) + " / " + fmt(battle.a.maxHp);
    $("#hptext-b").textContent = fmt(Math.max(0, e.hpB)) + " / " + fmt(battle.b.maxHp);
  }

  function chooseAbility(id) {
    if (!battle || battle.over || view.animating) return;
    if (battle.turn !== view.me) return;
    if (view.pvp) {
      if (PvP.role === "host") {
        var ev = Engine.act(battle, "a", id);
        if (!ev.length) return;
        pvpSend({ t: "events", events: ev, state: Engine.snapshot(battle) });
        playEvents(ev, afterTurn);
      } else {
        if (!Engine.canUse(battle, "b", id)) return;
        pvpSend({ t: "action", ability: id });
        view.animating = true;
        renderArena();
      }
      return;
    }
    var events = Engine.act(battle, "a", id);
    if (!events.length) return;
    playEvents(events, afterTurn);
  }

  function afterTurn() {
    if (!battle) return;
    if (battle.over) { finishBattle(); return; }
    renderArena();
    if (view.pvp && PvP.role === "host" && PvP.pendingAction) {
      var pending = PvP.pendingAction;
      PvP.pendingAction = null;
      hostResolveGuestAction(pending);
      return;
    }
    if (!view.pvp && battle.turn === "b") {
      botTimer = setTimeout(function () {
        if (!battle || battle.over) return;
        var id = Engine.botChoose(battle, "b");
        if (!id) { var ev = []; Engine.advance(battle, ev); playEvents(ev, afterTurn); return; }
        playEvents(Engine.act(battle, "b", id), afterTurn);
      }, 900);
    }
  }

  /* Every healing potion, weakest first (the order the Heal button uses them up). */
  function healKeys() { return POTION_ORDER.filter(function (k) { return POTIONS[k].kind === "heal"; }); }

  function healInBattle(key) {
    key = key || healKeys().filter(function (k) { return S.potions[k] > 0; })[0];
    if (!battle || battle.over || view.pvp || !(S.potions[key] > 0)) return;
    if (battle.turn !== view.me || view.animating) { errorToast(ERR.POTION_USE, "Wait for your turn to drink a potion."); return; }
    S.potions[key]--;
    var me = battle.a;
    var amount = Math.round(me.maxHp * POTIONS[key].pct);
    me.hp = Math.min(me.maxHp, me.hp + amount);
    flash("a", "healed");
    floatText("a", "+" + fmt(amount), "heal");
    logLine(POTIONS[key].icon + " " + POTIONS[key].name + " restores " + fmt(amount) + " HP", "you");
    Sound.heal();
    save();
    renderArena();
    renderQuickbar();
  }

  function forfeit() {
    if (!battle || battle.over) return;
    if (view.pvp) {
      pvpSend({ t: "forfeit" });
      battle.over = true;
      battle.winner = Engine.other(view.me);
      finishBattle(true);
      return;
    }
    battle.over = true;
    battle.winner = "b";
    finishBattle(true);
  }

  function finishBattle(fled) {
    clearTimeout(botTimer);
    view.animating = false;
    var won = battle.winner === view.me;
    var res = $("#battle-result");
    res.classList.remove("hidden", "win", "lose");
    var oppName = battle[Engine.other(view.me)].name;
    if (view.tower) {
      var tfloor = view.tower.floor;
      if (won) {
        var reward = towerFirst(tfloor);
        S.doubloons = (S.doubloons || 0) + reward;
        S.tower.cleared[tfloor] = true;
        if (tfloor > (S.tower.best || 0)) S.tower.best = tfloor;
        S.stats.towerWins = (S.stats.towerWins || 0) + 1;
        S.stats.streak = (S.stats.streak || 0) + 1;
        if (S.stats.streak > S.stats.bestStreak) S.stats.bestStreak = S.stats.streak;
        res.classList.add("win");
        res.textContent = "🗼 Floor " + tfloor + " cleared! +" + fmt(reward) + " 🪙 doubloons" + (tfloor === TOWER_FLOORS ? " — you conquered the Tower!" : " — Floor " + (tfloor + 1) + " is open!");
        Sound.win();
        logLine("🏆 Floor " + tfloor + " cleared! +" + fmt(reward) + " 🪙 doubloons", "crit");
      } else {
        S.stats.streak = 0;
        res.classList.add("lose");
        res.textContent = fled ? "You left Floor " + tfloor + "." : "Floor " + tfloor + " defeated you — no doubloons.";
        if (!fled) { Sound.lose(); logLine("💀 You were defeated on Floor " + tfloor + ".", "them"); }
      }
      renderArena();
      save();
      var finishedT = battle;
      setTimeout(function () { if (battle === finishedT) battle = null; renderAll(); renderTower(); }, 500);
      return;
    }
    if (view.pvp) {
      if (won) {
        addCoins(PVP_WIN_REWARD);
        S.stats.pvpWon++;
        res.classList.add("win");
        res.textContent = "Victory over " + oppName + "! +" + fmt(PVP_WIN_REWARD) + " coins";
        Sound.win();
      } else {
        addCoins(PVP_LOSS_REWARD);
        S.stats.pvpLost++;
        res.classList.add("lose");
        res.textContent = (fled ? "You forfeited. " : "Defeated by " + oppName + ". ") + "+" + fmt(PVP_LOSS_REWARD) + " coins";
        Sound.lose();
      }
      var post = $("#post-battle");
      post.innerHTML = "";
      if (PvP.status === "connected") {
        var rm = document.createElement("button");
        rm.className = "btn small primary";
        rm.textContent = "Rematch";
        rm.addEventListener("click", function () { pvpRequestRematch(); rm.disabled = true; rm.textContent = "Waiting for opponent…"; });
        post.appendChild(rm);
      }
    } else if (fled) {
      res.classList.add("lose");
      res.textContent = "You forfeited.";
      S.stats.streak = 0;
    } else if (won) {
      var reward = view.bot.reward;
      addCoins(reward);
      S.botWins[view.bot.id] = (S.botWins[view.bot.id] || 0) + 1;
      S.stats.won++;
      S.stats.streak++;
      if (S.stats.streak > S.stats.bestStreak) S.stats.bestStreak = S.stats.streak;
      res.classList.add("win");
      res.textContent = "Victory! +" + fmt(reward) + " coins";
      Sound.win();
      logLine("🏆 " + oppName + " defeated! +" + fmt(reward) + " coins", "crit");
    } else {
      S.stats.lost++;
      S.stats.streak = 0;
      res.classList.add("lose");
      res.textContent = "Defeated by " + oppName + "…";
      Sound.lose();
      logLine("💀 You were defeated.", "them");
    }
    renderArena();
    save();
    var finished = battle;
    setTimeout(function () { if (battle === finished) battle = null; renderAll(); }, 500);
  }

  /* ---------- PvP (PeerJS data channel, 4-digit room codes) ---------- */

  var PvP = { peer: null, conn: null, role: null, code: null, status: "idle", opp: null, hello: null, rematch: { me: false, them: false } };

  function pvpSetStatus(text, cls) {
    PvP.statusText = text;
    PvP.statusCls = cls || "";
    renderPvpPanel();
  }

  function renderPvpPanel() {
    var st = $("#pvp-status");
    st.textContent = PvP.statusText || "Not connected.";
    st.className = "pvp-status " + (PvP.statusCls || "");
    var codeEl = $("#pvp-code-display");
    if (PvP.role === "host" && PvP.code && PvP.status !== "idle") {
      codeEl.textContent = PvP.code;
      codeEl.classList.remove("hidden");
    } else {
      codeEl.classList.add("hidden");
    }
    var idle = PvP.status === "idle";
    $("#btn-pvp-host").disabled = !idle;
    $("#btn-pvp-join").disabled = !idle;
    $("#pvp-code").disabled = !idle;
    $("#btn-pvp-leave").classList.toggle("hidden", idle);
    if (document.activeElement !== $("#pvp-name")) $("#pvp-name").value = S.playerName;
  }

  function pvpTransportAvailable() {
    return typeof window.Peer === "function";
  }

  function pvpCleanup() {
    try { if (PvP.conn) PvP.conn.close(); } catch (e) { /* ignore */ }
    try { if (PvP.peer) PvP.peer.destroy(); } catch (e) { /* ignore */ }
    PvP.conn = null; PvP.peer = null; PvP.role = null; PvP.code = null; PvP.opp = null; PvP.hello = null;
    PvP.status = "idle";
    PvP.pendingAction = null;
    PvP.rematch = { me: false, them: false };
  }

  function pvpLeave(silent) {
    if (battle && view.pvp && !battle.over) {
      battle.over = true;
      battle.winner = Engine.other(view.me);
      finishBattle(true);
    }
    pvpCleanup();
    if (!silent) pvpSetStatus("Left the room.");
    renderAll();
  }

  function pvpHost() {
    if (!pvpTransportAvailable()) { pvpSetStatus("PvP needs the PeerJS library, which failed to load. Check your connection and reload.", "err"); return; }
    if (aurasLocked()) { toast("Your auras are locked for " + aurasLockText(), "bad"); return; }
    if (!equippedAura()) { toast("Equip an aura first", "bad"); return; }
    pvpCleanup();
    var code = String(Math.floor(1000 + Math.random() * 9000));
    PvP.role = "host";
    PvP.code = code;
    PvP.status = "hosting";
    pvpSetStatus("Creating room…");
    var peer = new window.Peer(PEER_PREFIX + code, { debug: 0 });
    PvP.peer = peer;
    peer.on("open", function () {
      if (PvP.peer !== peer) return;
      pvpSetStatus("Room " + code + " is open. Waiting for a friend to join…", "ok");
    });
    peer.on("connection", function (conn) {
      if (PvP.peer !== peer) return;
      if (PvP.conn) { try { conn.close(); } catch (e) { /* ignore */ } return; }
      pvpAttach(conn);
    });
    peer.on("error", function (err) {
      if (PvP.peer !== peer) return;
      if (err && err.type === "unavailable-id") { pvpHost(); return; }
      pvpSetStatus("Connection error: " + (err && err.type ? err.type : err), "err");
      pvpCleanup();
      renderPvpPanel();
    });
    peer.on("disconnected", function () { if (PvP.peer === peer && PvP.status !== "connected") try { peer.reconnect(); } catch (e) { /* ignore */ } });
  }

  function pvpJoin(code) {
    if (!pvpTransportAvailable()) { pvpSetStatus("PvP needs the PeerJS library, which failed to load. Check your connection and reload.", "err"); return; }
    if (!/^\d{4}$/.test(code)) { pvpSetStatus("Enter the 4-digit room code.", "err"); return; }
    if (aurasLocked()) { toast("Your auras are locked for " + aurasLockText(), "bad"); return; }
    if (!equippedAura()) { toast("Equip an aura first", "bad"); return; }
    pvpCleanup();
    PvP.role = "guest";
    PvP.code = code;
    PvP.status = "joining";
    pvpSetStatus("Joining room " + code + "…");
    var peer = new window.Peer({ debug: 0 });
    PvP.peer = peer;
    var joinTimer = setTimeout(function () {
      if (PvP.peer === peer && PvP.status === "joining") { pvpSetStatus("Could not reach room " + code + ". Check the code and try again.", "err"); pvpCleanup(); renderPvpPanel(); }
    }, 15000);
    peer.on("open", function () {
      if (PvP.peer !== peer) return;
      pvpAttach(peer.connect(PEER_PREFIX + code, { reliable: true }));
    });
    peer.on("error", function (err) {
      if (PvP.peer !== peer) return;
      clearTimeout(joinTimer);
      var t = err && err.type;
      pvpSetStatus(t === "peer-unavailable" ? "No open room with code " + code + "." : "Connection error: " + (t || err), "err");
      pvpCleanup();
      renderPvpPanel();
    });
    peer.on("disconnected", function () { if (PvP.peer === peer && PvP.status !== "connected") try { peer.reconnect(); } catch (e) { /* ignore */ } });
    PvP.joinTimer = joinTimer;
  }

  function pvpAttach(conn) {
    PvP.conn = conn;
    var opened = false;
    var onOpen = function () {
      if (PvP.conn !== conn || opened) return;
      opened = true;
      clearTimeout(PvP.joinTimer);
      PvP.status = "connected";
      pvpSetStatus("Connected! Exchanging loadouts…", "ok");
      PvP.hello = myFighterSpec();
      pvpSend({ t: "hello", spec: PvP.hello });
      renderAll();
    };
    conn.on("open", onOpen);
    if (conn.open) onOpen();
    conn.on("data", function (data) { if (PvP.conn === conn) onPvpMessage(data); });
    conn.on("close", function () {
      if (PvP.conn !== conn) return;
      var wasBattle = battle && view.pvp && !battle.over;
      if (wasBattle) { battle.over = true; battle.winner = view.me; finishBattle(false); logLine("Opponent disconnected.", "them"); }
      pvpCleanup();
      pvpSetStatus("Opponent disconnected.", "err");
      renderAll();
    });
    conn.on("error", function () {
      if (PvP.conn !== conn) return;
      pvpCleanup();
      pvpSetStatus("Connection lost.", "err");
      renderAll();
    });
  }

  function pvpSend(msg) {
    if (!PvP.conn) return;
    try { PvP.conn.send(msg); } catch (e) { /* ignore */ }
  }

  function sanitizeSpec(spec) {
    if (!spec || typeof spec !== "object") return null;
    var name = String(spec.name || "Opponent").slice(0, 16).replace(/[<>]/g, "") || "Opponent";
    var power = Math.max(1, Math.min(1e7, Math.floor(Number(spec.power) || 1)));
    var auraId = Number.isInteger(spec.auraId) && A.byId(spec.auraId) ? spec.auraId : null;
    var raw = Array.isArray(spec.loadout) ? spec.loadout : [];
    var size = auraId !== null ? K.kitFor(A.byId(auraId)).length : K.KIT_SIZE;
    var loadout = raw.filter(function (i, pos) { return Number.isInteger(i) && i >= 0 && i < size && raw.indexOf(i) === pos; }).slice(0, LOADOUT_SIZE);
    if (!loadout.length) loadout = DEFAULT_LOADOUT.slice();
    return { name: name, power: power, auraId: auraId, shiny: auraId !== null && isShiny(A.byId(auraId), spec.shiny === true), loadout: loadout, isBot: false };
  }

  function pvpStartBattle() {
    /* Host builds the battle: host is "a", guest is "b". */
    var me = fighterFromSpec(PvP.hello);
    var them = fighterFromSpec(PvP.opp);
    var first = Math.random() < 0.5 ? "a" : "b";
    battle = Engine.create(me, them, first);
    view = { me: "a", pvp: true, animating: false, bot: null };
    PvP.pendingAction = null;
    PvP.rematch = { me: false, them: false };
    pvpSend({ t: "start", state: Engine.snapshot(battle) });
    openArena();
    $("#arena-banner").textContent = "PvP · room " + PvP.code;
    logLine("⚔️ " + them.name + " joins the arena! " + (first === "a" ? "You go first." : them.name + " goes first."), "");
    renderArena();
    renderAll();
  }

  /* Host resolves an ability chosen by the guest and streams the events back. */
  function hostResolveGuestAction(id) {
    if (!battle || battle.over || battle.turn !== "b") return;
    var ev = Engine.act(battle, "b", id);
    if (!ev.length) { pvpSend({ t: "events", events: [], state: Engine.snapshot(battle) }); return; }
    pvpSend({ t: "events", events: ev, state: Engine.snapshot(battle) });
    playEvents(ev, afterTurn);
  }

  function pvpRequestRematch() {
    PvP.rematch.me = true;
    pvpSend({ t: "rematch" });
    if (PvP.role === "host" && PvP.rematch.them) pvpStartBattle();
  }

  function onPvpMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    switch (msg.t) {
      case "hello": {
        PvP.opp = sanitizeSpec(msg.spec);
        if (!PvP.opp) return;
        if (!PvP.hello) PvP.hello = myFighterSpec();
        pvpSetStatus("Fighting " + PvP.opp.name + " (" + fmt(PvP.opp.power) + " power)", "ok");
        if (PvP.role === "host") pvpStartBattle();
        break;
      }
      case "start": {
        if (PvP.role !== "guest") return;
        battle = msg.state;
        if (!battle || !battle.a || !battle.b) { battle = null; return; }
        view = { me: "b", pvp: true, animating: false, bot: null };
        PvP.rematch = { me: false, them: false };
        openArena();
        $("#arena-banner").textContent = "PvP · room " + PvP.code;
        logLine("⚔️ " + battle.a.name + " joins the arena! " + (battle.turn === "b" ? "You go first." : battle.a.name + " goes first."), "");
        renderArena();
        renderAll();
        break;
      }
      case "action": {
        if (PvP.role !== "host" || !battle || battle.over) return;
        if (view.animating) { PvP.pendingAction = String(msg.ability); return; }
        hostResolveGuestAction(String(msg.ability));
        break;
      }
      case "events": {
        if (PvP.role !== "guest" || !battle) return;
        var state = msg.state;
        var events = Array.isArray(msg.events) ? msg.events : [];
        playEvents(events, function () {
          if (!battle) return;
          battle.a = state.a; battle.b = state.b; battle.turn = state.turn; battle.round = state.round; battle.over = state.over; battle.winner = state.winner;
          afterTurn();
        });
        break;
      }
      case "forfeit": {
        if (battle && view.pvp && !battle.over) {
          battle.over = true;
          battle.winner = view.me;
          logLine("Opponent forfeited.", "them");
          finishBattle(false);
        }
        break;
      }
      case "rematch": {
        PvP.rematch.them = true;
        if (PvP.role === "host" && PvP.rematch.me) pvpStartBattle();
        else if (!PvP.rematch.me) toast(PvP.opp ? PvP.opp.name + " wants a rematch" : "Opponent wants a rematch");
        break;
      }
    }
  }

  /* ---------- Index ---------- */

  var indexRows = [];

  function buildIndex() {
    var list = $("#index-list");
    var sel = $("#index-tier");
    A.TIERS.forEach(function (t) {
      var o = document.createElement("option");
      o.value = t.key;
      o.textContent = t.name;
      sel.appendChild(o);
    });
    var frag = document.createDocumentFragment();
    A.list.slice().sort(function (a, b) { return b.rarity - a.rarity; }).forEach(function (a) {
      var row = document.createElement("div");
      row.className = "idx-row";
      var name = document.createElement("span");
      name.className = "name";
      name.textContent = a.name;
      if (a.shiny) { var tag = document.createElement("span"); tag.className = "shiny-tag"; tag.textContent = "✨×" + a.shiny; tag.title = "Shiny form: 1 in " + fmt(a.shinyRarity); name.appendChild(tag); }
      var tier = document.createElement("span");
      tier.className = "tierlabel t-" + a.tier;
      tier.textContent = tierName(a);
      var odds = document.createElement("span");
      odds.className = "odds";
      odds.textContent = A.formatOdds(a.rarity);
      var cnt = document.createElement("span");
      cnt.className = "cnt";
      row.appendChild(makeSwatch(a)); row.appendChild(name); row.appendChild(tier); row.appendChild(odds); row.appendChild(cnt);
      var wrap = document.createElement("span");
      wrap.className = "pv-wrap";
      if (a.rarity >= 10000) {
        var pv = document.createElement("button");
        pv.className = "btn small";
        pv.textContent = "▶ Preview";
        pv.title = "Preview this aura's cutscene";
        pv.addEventListener("click", function () { if (!busy) playCutscene(a, true, false); });
        wrap.appendChild(pv);
        if (a.shiny) {
          var ps = document.createElement("button");
          ps.className = "btn small shiny-btn";
          ps.textContent = "✨";
          ps.title = "Preview the shiny cutscene";
          ps.addEventListener("click", function () { if (!busy) playCutscene(a, true, true); });
          wrap.appendChild(ps);
        }
      }
      row.appendChild(wrap);
      indexRows.push({ aura: a, row: row, cnt: cnt });
      frag.appendChild(row);
    });
    list.appendChild(frag);
    $("#index-search").addEventListener("input", filterIndex);
    $("#index-tier").addEventListener("change", filterIndex);
    $("#index-found").addEventListener("change", filterIndex);
  }

  function updateIndex() {
    var found = 0, shinyFound = 0;
    indexRows.forEach(function (r) {
      var n = S.inventory[r.aura.id] || 0, ns = S.shinyInventory[r.aura.id] || 0;
      if (n || ns) found++;
      if (ns) shinyFound++;
      r.row.classList.toggle("undiscovered", !(n || ns));
      r.cnt.textContent = (n ? "x" + n : "") + (ns ? (n ? " " : "") + "✨" + ns : "");
    });
    $("#index-progress").textContent = found + " / " + A.TOTAL + " · ✨ " + shinyFound + " / " + A.SHINY_COUNT;
    filterIndex();
  }

  function filterIndex() {
    var q = $("#index-search").value.trim().toLowerCase();
    var tier = $("#index-tier").value;
    var foundOnly = $("#index-found").checked;
    indexRows.forEach(function (r) {
      var ok = true;
      if (q && r.aura.name.toLowerCase().indexOf(q) === -1) ok = false;
      if (tier && r.aura.tier !== tier) ok = false;
      if (foundOnly && !ownsAny(r.aura.id)) ok = false;
      r.row.style.display = ok ? "" : "none";
    });
  }

  /* ---------- Stats ---------- */

  function renderStats() {
    var grid = $("#stats-grid");
    var found = ownedIds().length;
    var shinyFound = Object.keys(S.shinyInventory).filter(function (id) { return S.shinyInventory[id] > 0; }).length;
    var best = S.stats.best !== null ? A.byId(S.stats.best) : null;
    var items = [
      ["Total rolls", fmt(S.rolls)],
      ["Auras found", found + " / " + A.TOTAL],
      ["Shinies found", shinyFound + " / " + A.SHINY_COUNT + " (" + fmt(S.stats.shinies || 0) + " rolled)"],
      ["Best aura", best ? auraLabel(best, S.stats.bestShiny) + " (" + A.formatOdds(effRarity(best, S.stats.bestShiny)) + ")" : "—"],
      ["Coins earned", fmt(S.stats.earned)],
      ["Bot fights", fmt(S.stats.won) + " won · " + fmt(S.stats.lost) + " lost"],
      ["PvP record", fmt(S.stats.pvpWon) + " won · " + fmt(S.stats.pvpLost) + " lost"],
      ["Win streak", fmt(S.stats.streak) + " (best " + fmt(S.stats.bestStreak) + ")"],
      ["Reveals played", fmt(S.stats.cutscenes)],
      ["Training level", fmt(S.training)],
      ["Gifts", fmt(S.stats.giftsSent || 0) + " auras sent · " + fmt(S.stats.giftsReceived || 0) + " received"],
      ["Coins gifted", fmt(S.stats.coinsGifted || 0) + " sent · " + fmt(S.stats.coinsReceived || 0) + " received"],
      ["Auras sold", fmt(S.stats.sold || 0)],
      ["Daily gifts", fmt(S.daily.claims || 0) + " claimed · streak " + fmt(S.daily.streak)],
      ["Equipped kit", equippedAura() ? loadoutFor(equippedAura()).map(function (i) { return K.kitFor(equippedAura())[i].name; }).join(", ") : "—"]
    ];
    grid.innerHTML = "";
    items.forEach(function (it) {
      var d = document.createElement("div");
      d.className = "stat";
      var l = document.createElement("div"); l.className = "label"; l.textContent = it[0];
      var v = document.createElement("div"); v.className = "value"; v.textContent = it[1];
      d.appendChild(l); d.appendChild(v);
      grid.appendChild(d);
    });
    $("#set-sound").checked = !!S.settings.sound;
    $("#set-skip").checked = !!S.settings.skipCutscenes;
    $("#set-skipanims").checked = !!S.settings.skipAnims;
  }

  /* ---------- Admin console ---------- */

  function adminPrint(text, isCmd) {
    var out = $("#admin-out");
    var line = document.createElement("div");
    if (isCmd) { line.innerHTML = "<b>&gt; </b>"; line.appendChild(document.createTextNode(text)); }
    else line.textContent = text;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  }

  function findAura(query) {
    query = query.trim().toLowerCase();
    if (!query) return null;
    var exact = A.list.filter(function (a) { return a.name.toLowerCase() === query; })[0];
    if (exact) return exact;
    var idNum = Number(query);
    if (Number.isInteger(idNum) && A.byId(idNum)) return A.byId(idNum);
    return A.list.filter(function (a) { return a.name.toLowerCase().indexOf(query) >= 0; })[0] || null;
  }

  var ADMIN_HELP = [
    "help                      show this list",
    "luck <mult> [rolls]       add a luck boost, e.g. luck 1000 10",
    "coins <amount>            add coins (negative to remove)",
    "give <aura name|id> [shiny]  add an aura (or its shiny form) to your inventory",
    "roll <aura name|id> [shiny]  force your next roll to be that aura (plays its reveal)",
    "potion <key> [count]      add potions: " + POTION_ORDER.join(", "),
    "training <level>          set training level",
    "unlockauto                unlock Auto Roll",
    "daily reset               make the daily gift claimable again",
    "clearluck                 remove all luck boosts",
    "reset                     wipe the save"
  ];

  function runAdmin(line) {
    if (!adminUnlocked) return; /* the console only works after the admin password */
    adminTouched();
    var parts = line.trim().replace(/^\//, "").split(/\s+/);
    var cmd = (parts.shift() || "").toLowerCase();
    var rest = parts.join(" ");
    if (!cmd) return;
    adminPrint(line, true);
    switch (cmd) {
      case "help":
        ADMIN_HELP.forEach(function (l) { adminPrint(l); });
        break;
      case "luck": {
        var mult = Number(parts[0]);
        var rolls = parts[1] !== undefined ? Number(parts[1]) : 10;
        if (!(mult > 0) || !(rolls > 0)) { adminPrint("Usage: luck <mult> [rolls]"); break; }
        S.luckEffects.push({ mult: Math.floor(mult), rolls: Math.floor(rolls) });
        adminPrint("Luck x" + fmt(mult) + " for " + fmt(rolls) + " rolls.");
        break;
      }
      case "coins": {
        var n = Number(parts[0]);
        if (!isFinite(n)) { adminPrint("Usage: coins <amount>"); break; }
        S.coins = Math.max(0, S.coins + Math.floor(n));
        adminPrint("Coins: " + fmt(S.coins));
        break;
      }
      case "give": {
        var wantShiny = /\bshiny\b/i.test(rest), a = findAura(rest.replace(/\bshiny\b/ig, "").trim());
        if (!a) { adminPrint("No aura matches \"" + rest + "\"."); break; }
        if (wantShiny && !a.shiny) { adminPrint(a.name + " has no shiny form."); break; }
        var bag = wantShiny ? S.shinyInventory : S.inventory;
        bag[a.id] = (bag[a.id] || 0) + 1;
        recordBest(a, wantShiny);
        if (!equippedAura()) { S.equipped = a.id; S.equippedShiny = wantShiny; }
        adminPrint("Added " + auraLabel(a, wantShiny) + " (" + oddsText(a, wantShiny) + ").");
        break;
      }
      case "roll": {
        var rollShinyWord = /\bshiny\b/i.test(rest), ra = findAura(rest.replace(/\bshiny\b/ig, "").trim());
        if (!ra) { adminPrint("No aura matches \"" + rest + "\"."); break; }
        if (rollShinyWord && !ra.shiny) { adminPrint(ra.name + " has no shiny form."); break; }
        if (!canRoll()) { adminPrint("Can't roll right now (busy, cooling down or in a fight)."); break; }
        adminPrint("Rolling " + auraLabel(ra, rollShinyWord) + "…");
        switchTab("roll");
        requestRoll(ra, rollShinyWord);
        break;
      }
      case "potion": {
        var key = (parts[0] || "").toLowerCase();
        var cnt = parts[1] !== undefined ? Math.floor(Number(parts[1])) : 1;
        if (!POTIONS[key] || !(cnt > 0)) { adminPrint("Usage: potion <" + POTION_ORDER.join("|") + "> [count]"); break; }
        var added = addPotion(key, cnt);
        adminPrint("Added " + added + " x " + POTIONS[key].name + "." + (added < cnt ? " (Healing potions are capped at " + MAX_HEALS + " in total.)" : ""));
        break;
      }
      case "training": {
        var lv = Math.floor(Number(parts[0]));
        if (!(lv >= 0)) { adminPrint("Usage: training <level>"); break; }
        S.training = lv;
        adminPrint("Training level " + lv + " (+" + fmt(lv * 10) + " power).");
        break;
      }
      case "unlockauto":
        S.autoUnlocked = true;
        adminPrint("Auto Roll unlocked.");
        break;
      case "daily":
        S.daily.last = 0;
        adminPrint("Daily gift reset. Streak stays at " + S.daily.streak + ".");
        break;
      case "secret":
        S.secretUnlocked = true;
        adminPrint("The shop whispers. Check the Luck potions.");
        break;
      case "clearluck":
        S.luckEffects = [];
        S.floorEffects = [];
        S.shinyEffects = [];
        adminPrint("Luck boosts cleared.");
        break;
      case "reset":
        resetSave();
        adminPrint("Save wiped.");
        break;
      default:
        adminPrint("Unknown command \"" + cmd + "\". Type help.");
    }
    save();
    renderAll();
  }

  function resetSave() {
    pvpLeave(true);
    clearTimeout(botTimer);
    battle = null;
    $("#arena").classList.add("hidden");
    S = defaultState();
    save();
    autoOn = false;
    resetRollDisplay();
    renderAll();
  }

  /* ---------- Cutscenes: the screen is covered, the name fades in, then the odds, then it fades out after ~6s. ---------- */

  var CS = {
    el: $("#cutscene"), canvas: $("#cs-canvas"), overlay: $("#cs-overlay"), text: $("#cs-text"), pre: $("#cs-pre"), title: $("#cs-title"), odds: $("#cs-odds"), hint: $("#cs-hint"),
    running: false, resolve: null, raf: 0, start: 0, draw: null, timers: [], endAt: 6, t: 0, cancelTitle: null
  };
  var CUTSCENE_FADE = 0.7;

  function csTimer(ms, fn) { CS.timers.push(setTimeout(fn, ms)); }

  /* Reveal pacing by tier: how long the scene builds, how long the name takes to spell out,
     and how long the finished name and odds stay fully on screen before the fade. */
  var REVEAL_PACE = {
    3: { scene: 4.4, spell: 0.9, hold: 1.4 },  /* Epic */
    4: { scene: 5.6, spell: 1.4, hold: 2.2 },  /* Legendary */
    5: { scene: 6.6, spell: 1.8, hold: 3.0 },  /* Cosmic */
    6: { scene: 7.6, spell: 2.2, hold: 3.5 },  /* Divine */
    7: { scene: 8.6, spell: 2.6, hold: 4.0 },  /* Transcendent */
    8: { scene: 8.6, spell: 2.6, hold: 4.5 },  /* Forbidden */
    9: { scene: 9.6, spell: 3.0, hold: 5.0 },  /* Administrative */
    10: { scene: 10.6, spell: 3.4, hold: 5.5 } /* Chosen */
  };
  /* Cosmic and rarer stay up until the player taps; this is only a safety net so Auto Roll never stalls. */
  var REVEAL_WAIT_MAX = 30;

  /* Work out the whole reveal timeline up front, in seconds, so the fade can never start
     before the name has spelled out and the odds have appeared and been on screen for `hold`. */
  function revealTimeline(aura, shiny) {
    var text, sceneDur, titleAt, style, step, oddsFloor, hold, r = null;
    if (aura.special === "cosmic") {
      text = aura.name.toUpperCase(); sceneDur = 6; titleAt = 3.3; style = "stagger"; step = 0.09; oddsFloor = 4.6; hold = 3.5;
    } else if (aura.special === "fury") {
      text = aura.name.toUpperCase(); sceneDur = 6; titleAt = 3.1; style = "glitch"; step = 0.08; oddsFloor = 4.6; hold = 4.5;
    } else {
      var pace = REVEAL_PACE[Math.max(3, Math.min(10, tierIndex(aura)))];
      r = REVEALS.assign(aura) || { scene: "pulse", title: "blur", overlay: "none" };
      var scene = REVEALS.SCENES[r.scene];
      text = aura.name; sceneDur = pace.scene; style = r.title; hold = pace.hold;
      titleAt = scene.titleAt * sceneDur; oddsFloor = scene.oddsAt * sceneDur;
      step = Math.min(0.16, Math.max(0.045, pace.spell / Math.max(1, text.length)));
    }
    if (isShiny(aura, shiny)) hold += 0.6;
    var lettersIn = titleAt + text.length * step + Math.min(REVEALS.titleAnim(style), 0.6);
    var oddsAt = Math.max(oddsFloor, lettersIn - 0.2);
    /* 1s covers the odds fading in, with margin for slower devices. */
    var end = Math.max(sceneDur + 0.4, oddsAt + 1.0 + hold) + CUTSCENE_FADE;
    /* Taps can't skip until the whole name and the odds are on screen. */
    var skipAt = Math.max(lettersIn, oddsAt + 0.8);
    var wait = tierIndex(aura) >= 5;
    if (wait) end = Math.max(end, REVEAL_WAIT_MAX);
    return { text: text, sceneDur: sceneDur, titleAt: titleAt, style: style, step: step, oddsAt: oddsAt, lettersIn: lettersIn, hold: hold, end: end, skipAt: skipAt, wait: wait, reveal: r };
  }

  function scheduleTitle(tl) {
    csTimer(tl.titleAt * 1000, function () {
      var res = REVEALS.applyTitle(CS.title, tl.text, tl.style, tl.step);
      CS.cancelTitle = res.cancel;
      CS.title.classList.add("show");
    });
    csTimer(tl.oddsAt * 1000, function () { CS.odds.classList.add("show"); });
  }

  function playCutscene(aura, preview, shiny) {
    return new Promise(function (resolve) {
      if (CS.running || S.settings.skipAnims) { resolve(); return; }
      var kind = aura.special || "generic";
      var level = aura.cutscene;
      var sh = isShiny(aura, shiny);
      var tl = revealTimeline(aura, sh);
      CS.running = true;
      CS.resolve = resolve;
      CS.el.className = "cutscene kind-" + kind + " tier-" + aura.tier;
      CS.el.style.opacity = "";
      CS.el.style.setProperty("--c1", aura.c1);
      CS.el.style.setProperty("--c2", aura.c2);
      CS.overlay.className = "cs-overlay";
      CS.text.style.setProperty("--ty", "0.5");
      CS.pre.className = "cs-pre"; CS.title.className = "cs-title"; CS.odds.className = "cs-odds"; CS.hint.className = "cs-hint";
      CS.pre.textContent = (preview ? "Preview · " : "") + (sh ? "✨ Shiny " : "") + tierName(aura) + (preview ? "" : " aura");
      CS.title.textContent = "";
      if (sh) CS.title.classList.add("shiny");
      CS.odds.textContent = oddsText(aura, sh);
      CS.endAt = tl.end;
      CS.skipAt = tl.skipAt;
      CS.hint.textContent = tl.wait ? "tap anywhere to continue" : "tap to continue";

      var ctx = CS.canvas.getContext("2d");
      function resize() {
        CS.canvas.width = window.innerWidth;
        CS.canvas.height = window.innerHeight;
      }
      resize();
      CS.onResize = resize;
      window.addEventListener("resize", resize);

      var env = { aura: aura, colors: aura.colors, c1: aura.c1, c2: aura.c2, name: aura.name, rarity: effRarity(aura, sh), dur: tl.sceneDur, level: level, shiny: sh, tierName: (sh ? "Shiny " : "") + tierName(aura), rng: REVEALS.mulberry32(aura.id * 31 + 7) };
      if (kind === "cosmic") {
        CS.draw = drawCosmic();
        Sound.cosmic();
        csTimer(3300, function () { CS.pre.classList.add("show"); });
        scheduleTitle(tl);
      } else if (kind === "fury") {
        CS.draw = drawFury();
        Sound.fury();
        scheduleTitle(tl);
        csTimer(3900, function () { CS.pre.classList.add("show"); });
      } else {
        var r = tl.reveal;
        var scene = REVEALS.SCENES[r.scene];
        var base = scene.make(env), accent = r.accent && REVEALS.ACCENTS[r.accent] ? REVEALS.ACCENTS[r.accent](env) : null;
        CS.draw = accent ? function (ctx, t, w, h) { ctx.save(); base(ctx, t, w, h); ctx.restore(); ctx.save(); accent(ctx, t, w, h); ctx.restore(); } : base;
        CS.overlay.classList.add("ov-" + r.overlay);
        CS.text.style.setProperty("--ty", String(scene.textY || 0.5));
        Sound.rare(Math.max(0, level));
        csTimer(Math.max(0, tl.titleAt * 1000 - 300), function () { CS.pre.classList.add("show"); });
        scheduleTitle(tl);
      }
      if (sh) {
        var under = CS.draw, shinyLayer = REVEALS.makeShinyLayer(env);
        CS.draw = function (ctx, t, w, h) { ctx.save(); under(ctx, t, w, h); ctx.restore(); ctx.save(); shinyLayer(ctx, t, w, h); ctx.restore(); };
        csTimer(Math.max(0, tl.titleAt * 1000 - 200), function () { Sound.shiny(); });
      }
      csTimer(tl.skipAt * 1000, function () { CS.hint.classList.add("show"); if (tl.wait) CS.hint.classList.add("wait"); });
      csTimer((CS.endAt - CUTSCENE_FADE) * 1000, function () { CS.el.style.opacity = "0"; });

      CS.el.classList.remove("hidden");
      CS.start = performance.now();
      function frame(now) {
        var t = Math.max(0, (now - CS.start) / 1000);
        CS.t = t;
        try {
          CS.draw(ctx, t, CS.canvas.width, CS.canvas.height);
        } catch (e) {
          /* A drawing error must never lock the game behind the overlay. */
          endCutscene();
          return;
        }
        if (t >= CS.endAt) { endCutscene(); return; }
        CS.raf = requestAnimationFrame(frame);
      }
      CS.raf = requestAnimationFrame(frame);
    });
  }

  function endCutscene() {
    if (!CS.running) return;
    cancelAnimationFrame(CS.raf);
    CS.timers.forEach(clearTimeout);
    CS.timers = [];
    if (CS.cancelTitle) { CS.cancelTitle(); CS.cancelTitle = null; }
    window.removeEventListener("resize", CS.onResize);
    CS.el.classList.add("hidden");
    CS.el.style.opacity = "";
    CS.running = false;
    var r = CS.resolve;
    CS.resolve = null;
    if (r) r();
  }

  /* A tap only skips once the name and odds are fully shown, so quick taps on Roll can't eat a rare reveal. */
  CS.el.addEventListener("click", function () { if (CS.running && (performance.now() - CS.start) / 1000 >= CS.skipAt) endCutscene(); });

  /* Stop every animation that is playing right now: reveal cutscene, roll effects, battle cinematics, the snap
     and kill scenes, and the screen shake. The game carries on at the state it was in. */
  function cancelAnimations() {
    try { if (CS.running) endCutscene(); } catch (e) { /* ignore */ }
    try { FX.clear(); } catch (e) { /* ignore */ }
    try { UFX.clear(); } catch (e) { /* ignore */ }
    try { BFX.clear(); } catch (e) { /* ignore */ }
    ["a", "b"].forEach(function (side) {
      $("#fighter-" + side).classList.remove("snapped", "killed", "reform", "flare", "from-left", "from-right", "from-top", "from-bottom");
      REACT_CLASSES.forEach(function (c) { $("#fighter-" + side).classList.remove(c); });
      var v = $("#visual-" + side); if (v) v.classList.remove("sliced");
      $("#fighter-" + side + " .slice") && document.querySelectorAll("#fighter-" + side + " .slice").forEach(function (n) { n.remove(); });
    });
    document.body.classList.remove("shake-1", "shake-2", "shake-3");
    shakeTargets().forEach(function (el) { el.classList.remove("shake-1", "shake-2", "shake-3"); });
    $("#ult").classList.add("hidden");
    if (battle) renderArena();
  }

  function renderSkipAnimBtn() {
    var on = !!S.settings.skipAnims;
    var btn = $("#btn-skip-anim");
    btn.textContent = on ? "▶️ Animations: OFF" : "⏩ Skip animations";
    btn.classList.toggle("on", on);
    $("#set-skipanims").checked = on;
  }
  function setSkipAnims(on) {
    S.settings.skipAnims = !!on;
    cancelAnimations();
    renderSkipAnimBtn();
    save();
  }

  function drawCosmic() {
    var FLASH = 3.1;
    var stars = [];
    for (var i = 0; i < 520; i++) stars.push({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random() });
    var hues = [265, 285, 300, 230, 320, 250, 275];
    var nebulae = hues.map(function (hue) { return { x: Math.random(), y: Math.random(), r: 0.25 + Math.random() * 0.35, hue: hue, ph: Math.random() * 6 }; });
    var sparks = null;
    return function (ctx, t, w, h) {
      var cx = w / 2, cy = h / 2, m = Math.max(w, h);
      ctx.fillStyle = "#05010f";
      ctx.fillRect(0, 0, w, h);
      var shakeAmp = 0;
      if (t > 1.6 && t < FLASH) shakeAmp = (t - 1.6) * 9;
      else if (t >= FLASH && t < FLASH + 0.6) shakeAmp = (FLASH + 0.6 - t) * 25;
      ctx.save();
      ctx.translate((Math.random() - 0.5) * shakeAmp, (Math.random() - 0.5) * shakeAmp);

      ctx.globalCompositeOperation = "lighter";
      var nebAlpha = Math.min(1, Math.max(0, (t - 0.4) / 1.2)) * 0.5;
      nebulae.forEach(function (n) {
        var x = (n.x + Math.sin(t * 0.2 + n.ph) * 0.05) * w;
        var y = (n.y + Math.cos(t * 0.17 + n.ph) * 0.05) * h;
        var r = n.r * m;
        var g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, "hsla(" + n.hue + ",90%,60%," + nebAlpha + ")");
        g.addColorStop(1, "hsla(" + n.hue + ",90%,60%,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      });

      var speed = t < FLASH ? 0.002 + Math.pow(t / FLASH, 3) * 0.08 : 0.003;
      ctx.strokeStyle = "#fff";
      ctx.lineCap = "round";
      stars.forEach(function (s) {
        var pz = s.z;
        s.z -= speed;
        if (s.z <= 0.02) { s.z = 1; s.x = (Math.random() - 0.5) * 2; s.y = (Math.random() - 0.5) * 2; return; }
        ctx.globalAlpha = Math.min(1, (1 - s.z) * 1.5);
        ctx.lineWidth = (1 - s.z) * 2.5 + 0.5;
        ctx.beginPath();
        ctx.moveTo(cx + s.x / pz * cx, cy + s.y / pz * cy);
        ctx.lineTo(cx + s.x / s.z * cx, cy + s.y / s.z * cy);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      if (t > 1.2 && t < FLASH + 1.0) {
        var prog = (t - 1.2) / 2.0;
        var veilY = -h * 0.3 + prog * h * 1.6;
        for (var layer = 0; layer < 3; layer++) {
          ctx.beginPath();
          ctx.moveTo(0, -h);
          for (var x = 0; x <= w + 12; x += 12) {
            var y = veilY - layer * 70 + Math.sin(x * 0.012 + t * 3 + layer) * 28 + Math.sin(x * 0.03 - t * 5) * 12;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, -h);
          ctx.closePath();
          var vg = ctx.createLinearGradient(0, veilY - 400, 0, veilY + 40);
          vg.addColorStop(0, "rgba(120,60,220,0)");
          vg.addColorStop(0.7, "rgba(167,139,250," + (0.22 - layer * 0.05) + ")");
          vg.addColorStop(1, "rgba(236,210,255," + (0.6 - layer * 0.15) + ")");
          ctx.fillStyle = vg;
          ctx.fill();
          ctx.strokeStyle = "rgba(240,225,255," + (0.7 - layer * 0.2) + ")";
          ctx.lineWidth = 2;
          ctx.shadowColor = "#c4b5fd";
          ctx.shadowBlur = 30;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      if (t > FLASH) {
        if (!sparks) {
          sparks = [];
          for (var k = 0; k < 320; k++) sparks.push({ a: Math.random() * Math.PI * 2, s: 80 + Math.random() * 500, r: Math.random() * 2.5 + 0.8, hue: 250 + Math.random() * 70, spin: Math.random() * 2 });
        }
        var bt = t - FLASH;
        ctx.globalCompositeOperation = "lighter";
        sparks.forEach(function (p) {
          var d = p.s * (1 - Math.exp(-bt * 1.4));
          var ang = p.a + bt * p.spin * 0.3;
          ctx.globalAlpha = Math.max(0, 1 - bt / 5);
          ctx.fillStyle = "hsl(" + p.hue + ",90%,75%)";
          ctx.beginPath();
          ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, p.r, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        var pulse = 0.45 + 0.1 * Math.sin(bt * 3);
        var cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, m * 0.35);
        cg.addColorStop(0, "rgba(216,180,254," + pulse + ")");
        cg.addColorStop(0.4, "rgba(124,58,237," + pulse * 0.5 + ")");
        cg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = cg;
        ctx.fillRect(0, 0, w, h);
      }

      if (t > FLASH - 0.1 && t < FLASH + 0.6) {
        ctx.fillStyle = "#fff";
        ctx.globalAlpha = Math.max(0, 1 - (t - FLASH + 0.1) / 0.7);
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      if (t < 0.6) {
        ctx.fillStyle = "#000";
        ctx.globalAlpha = 1 - t / 0.6;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }
    };
  }

  function drawFury() {
    var BOOM = 2.9;
    var cracks = [];
    for (var i = 0; i < 14; i++) {
      var edge = Math.floor(Math.random() * 4);
      var sx = edge === 0 ? Math.random() : edge === 1 ? 1 : edge === 2 ? Math.random() : 0;
      var sy = edge === 0 ? 0 : edge === 1 ? Math.random() : edge === 2 ? 1 : Math.random();
      var pts = [[sx, sy]];
      var steps = 14;
      for (var s = 1; s <= steps; s++) {
        var f = s / steps;
        var tx = sx + (0.5 - sx) * f, ty = sy + (0.5 - sy) * f;
        var dx = 0.5 - sx, dy = 0.5 - sy, len = Math.hypot(dx, dy) || 1;
        var jit = (Math.random() - 0.5) * 0.08;
        pts.push([tx + (-dy / len) * jit, ty + (dx / len) * jit]);
      }
      cracks.push({ pts: pts, delay: Math.random() * 1.0 });
    }
    var embers = [];
    for (var e = 0; e < 170; e++) embers.push({ x: Math.random(), y: Math.random(), s: 0.02 + Math.random() * 0.06, r: Math.random() * 2.5 + 1, ph: Math.random() * 6 });
    var flashes = [BOOM, BOOM + 0.18, 4.3, 5.3];
    return function (ctx, t, w, h) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      var beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 1.6)), 8);
      var intensity = Math.min(1, t / BOOM);
      var shakeAmp = t < BOOM ? intensity * intensity * 10 : (t < BOOM + 0.6 ? 28 : 3 + beat * 6);
      ctx.save();
      ctx.translate((Math.random() - 0.5) * shakeAmp, (Math.random() - 0.5) * shakeAmp);

      var g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(" + Math.round(120 + beat * 120) + ",0,0," + (0.35 + intensity * 0.4 + beat * 0.25) + ")");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      cracks.forEach(function (c) {
        var prog = Math.max(0, Math.min(1, (t - 0.3 - c.delay) / 1.8));
        if (prog <= 0) return;
        var n = Math.floor(prog * (c.pts.length - 1));
        var frac = prog * (c.pts.length - 1) - n;
        ctx.beginPath();
        ctx.moveTo(c.pts[0][0] * w, c.pts[0][1] * h);
        for (var k = 1; k <= n; k++) ctx.lineTo(c.pts[k][0] * w, c.pts[k][1] * h);
        if (n < c.pts.length - 1) {
          var a = c.pts[n], b = c.pts[n + 1];
          ctx.lineTo((a[0] + (b[0] - a[0]) * frac) * w, (a[1] + (b[1] - a[1]) * frac) * h);
        }
        ctx.shadowColor = "#ff2a00";
        ctx.shadowBlur = 25 + beat * 30;
        ctx.strokeStyle = "rgba(255," + Math.round(40 + beat * 80) + ",0,0.95)";
        ctx.lineWidth = 3 + beat * 2;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#fff5e0";
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.6;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      ctx.globalCompositeOperation = "lighter";
      embers.forEach(function (em) {
        var y = ((em.y - t * em.s) % 1 + 1) % 1;
        var x = em.x + Math.sin(t * 2 + em.ph) * 0.01;
        var fl = 0.5 + 0.5 * Math.sin(t * 9 + em.ph);
        ctx.fillStyle = "rgba(255," + Math.round(80 + fl * 100) + ",0," + ((0.3 + fl * 0.6) * intensity) + ")";
        ctx.beginPath();
        ctx.arc(x * w, y * h, em.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalCompositeOperation = "source-over";

      if (t > BOOM) {
        var bt = t - BOOM;
        var er = Math.min(1, bt * 2) * Math.min(w, h) * 0.18;
        var eg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, er * 2.5 + 1);
        eg.addColorStop(0, "rgba(255,30,0,0.9)");
        eg.addColorStop(0.3, "rgba(120,0,0,0.6)");
        eg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = eg;
        ctx.fillRect(0, 0, w, h);
      }

      flashes.forEach(function (f) {
        if (t > f && t < f + 0.25) {
          ctx.fillStyle = "#ff3b1f";
          ctx.globalAlpha = (1 - (t - f) / 0.25) * 0.85;
          ctx.fillRect(0, 0, w, h);
          ctx.globalAlpha = 1;
        }
      });
      ctx.restore();
      if (t < 0.8) {
        ctx.fillStyle = "#000";
        ctx.globalAlpha = 1 - t / 0.8;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }
    };
  }

  /* ---------- Accounts: a name creates a random 7-digit ID; the ID logs you back in ---------- */

  function readAccounts() {
    var acc;
    try { acc = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "{}") || {}; } catch (e) { acc = {}; }
    migrateOldAccounts(acc);
    return acc;
  }
  function writeAccounts(acc) {
    try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(acc)); } catch (e) { /* ignore */ }
  }

  /* Password accounts from the previous version become ID accounts and keep their saves. */
  function migrateOldAccounts(acc) {
    var raw;
    try { raw = localStorage.getItem(OLD_ACCOUNTS_KEY); } catch (e) { return; }
    if (!raw) return;
    try {
      var old = JSON.parse(raw) || {};
      var oldSession = localStorage.getItem("aura-realms-session");
      Object.keys(old).forEach(function (key) {
        var rec = old[key];
        var name = (rec && rec.name) || key;
        var id = newAccountId(acc);
        acc[id] = { id: id, name: name, created: (rec && rec.created) || Date.now() };
        var saved = localStorage.getItem(SAVE_BASE + ":" + name);
        if (saved) { localStorage.setItem(SAVE_BASE + ":" + id, saved); localStorage.removeItem(SAVE_BASE + ":" + name); }
        if (oldSession && oldSession === name) localStorage.setItem(SESSION_KEY, id);
      });
      writeAccounts(acc);
      localStorage.removeItem(OLD_ACCOUNTS_KEY);
      localStorage.removeItem("aura-realms-session");
    } catch (e) { /* ignore */ }
  }

  function newAccountId(acc) {
    var id;
    do {
      var buf = new Uint32Array(1);
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(buf);
      else buf[0] = Math.floor(Math.random() * 4294967296);
      id = String(1000000 + (buf[0] % 9000000));
    } while (acc[id]);
    return id;
  }

  function accountName(id) {
    var acc = readAccounts();
    return acc[id] ? acc[id].name : null;
  }

  var loginMode = "new";

  function openLogin() {
    $("#login-modal").classList.remove("hidden");
    $("#login-error").textContent = "";
    $("#login-name").value = "";
    $("#login-id").value = "";
    $("#save-code").value = "";
    setLoginMode(currentUser ? "account" : "new");
    renderKnownAccounts();
  }
  function closeLogin() { $("#login-modal").classList.add("hidden"); }

  function setLoginMode(mode) {
    loginMode = mode;
    var loggedIn = mode === "account";
    $("#login-title").textContent = loggedIn ? "Logged in as " + (accountName(currentUser) || "player") : (mode === "returning" ? "Welcome back" : "New player");
    $("#login-help").classList.toggle("hidden", loggedIn);
    $(".mode-switch").classList.toggle("hidden", loggedIn);
    $("#mode-new").classList.toggle("on", mode === "new");
    $("#mode-returning").classList.toggle("on", mode === "returning");
    $("#login-name").classList.toggle("hidden", mode !== "new");
    $("#login-id").classList.toggle("hidden", mode !== "returning");
    $("#login-submit").classList.toggle("hidden", loggedIn);
    $("#login-submit").textContent = mode === "returning" ? "Log in" : "Create my ID";
    $("#btn-logout").classList.toggle("hidden", !loggedIn);
    $("#login-current").classList.toggle("hidden", !loggedIn);
    if (loggedIn) $("#login-current-id").textContent = currentUser;
    $("#login-known").classList.toggle("hidden", loggedIn);
  }

  function renderKnownAccounts() {
    var acc = readAccounts();
    var ids = Object.keys(acc).sort(function (a, b) { return (acc[b].created || 0) - (acc[a].created || 0); });
    var list = $("#login-known-list");
    list.innerHTML = "";
    $("#login-known").classList.toggle("hidden", !ids.length || loginMode === "account");
    ids.forEach(function (id) {
      var row = document.createElement("button");
      row.type = "button";
      row.className = "known-row";
      var n = document.createElement("span"); n.textContent = acc[id].name;
      var k = document.createElement("span"); k.className = "kid"; k.textContent = id;
      row.appendChild(n); row.appendChild(k);
      row.addEventListener("click", function () { setLoginMode("returning"); $("#login-id").value = id; });
      list.appendChild(row);
    });
  }

  function renderAccount() {
    var name = currentUser ? accountName(currentUser) : null;
    $("#account-name").textContent = name ? "👤 " + name : "Guest";
    var badge = $("#account-id");
    badge.classList.toggle("hidden", !currentUser);
    badge.textContent = currentUser ? "ID " + currentUser : "";
    $("#btn-login").textContent = currentUser ? "Account" : "Login";
    renderCloudStatus();
  }

  function copyId() {
    if (!currentUser) return;
    var done = function () { toast("ID " + currentUser + " copied"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(currentUser).then(done, done);
    else done();
  }

  function loginError(code, msg) {
    $("#login-error").textContent = "⚠️ Error " + code + ": " + msg;
  }

  var loginBusy = false;
  function setLoginBusy(on) {
    loginBusy = on;
    $("#login-submit").disabled = on;
  }

  function submitLogin(e) {
    e.preventDefault();
    if (loginBusy) return;
    $("#login-error").textContent = "";
    var acc = readAccounts();
    if (loginMode === "new") {
      var name = $("#login-name").value.trim().replace(/\s+/g, " ");
      if (name.length < 2 || name.length > 50) { loginError(ERR.ACCOUNT, "Name must be 2 to 50 characters."); return; }
      if (!/^[\p{L}\p{N} _'.-]+$/u.test(name)) { loginError(ERR.ACCOUNT, "Use letters, numbers, spaces, _ ' . or -"); return; }
      /* A brand new account starts from the guest progress it was created from. */
      var start = currentUser ? defaultState() : JSON.parse(JSON.stringify(S));
      start.playerName = name.slice(0, 16);
      if (Cloud.state === "missing") { finishNewAccount(newAccountId(acc), name, start, 0); return; }
      setLoginBusy(true);
      cloudCall("create", { name: name, device: deviceId, save: start }).then(function (r) {
        if (r.status === 200) finishNewAccount(r.data.id, r.data.name, start, r.data.rev);
        else loginError(r.data.code || ERR.ACCOUNT, r.data.error || "Could not create your account.");
      }, function (err) {
        /* Offline: make the account on this device now; it goes online the next time the server answers. */
        noteNetwork(err);
        finishNewAccount(newAccountId(readAccounts()), name, start, 0);
      }).then(function () { setLoginBusy(false); });
    } else {
      var typed = $("#login-id").value.trim();
      if (!/^\d{7}$/.test(typed)) { loginError(ERR.ACCOUNT, "Enter your 7-digit ID."); return; }
      if (acc[typed]) {
        switchUser(typed);
        closeLogin();
        toast("Welcome back, " + acc[typed].name + "!");
        return;
      }
      if (Cloud.state === "missing") { loginError(ERR.ACCOUNT, "No player with ID " + typed + " on this device. Online accounts aren't set up on this site, so import your save code below."); return; }
      setLoginBusy(true);
      cloudCall("load", { id: typed }).then(function (r) {
        if (r.status !== 200) { loginError(r.data.code || ERR.ACCOUNT, r.data.error || "Could not load that account."); return; }
        var list = readAccounts();
        list[typed] = { id: typed, name: r.data.name, created: Date.now(), cloud: true, rev: r.data.rev, dirty: false };
        writeAccounts(list);
        try { localStorage.setItem(SAVE_BASE + ":" + typed, JSON.stringify(hydrate(r.data.save))); } catch (err) { /* ignore */ }
        switchUser(typed);
        closeLogin();
        toast("Welcome back, " + r.data.name + "! Your progress is loaded.", "gold");
      }, function (err) {
        loginError(ERR.NETWORK, err && err.missing ? "Online accounts aren't set up on this site." : "Can't reach the account server. Check your connection and try again.");
      }).then(function () { setLoginBusy(false); });
    }
  }

  /* Store a newly made account on this device and switch to it. rev 0 means it is not online yet. */
  function finishNewAccount(id, name, start, rev) {
    var acc = readAccounts();
    acc[id] = { id: id, name: name, created: Date.now(), cloud: rev > 0, rev: rev, dirty: false };
    writeAccounts(acc);
    try { localStorage.setItem(SAVE_BASE + ":" + id, JSON.stringify(start)); } catch (e) { /* ignore */ }
    switchUser(id);
    setLoginMode("account");
    toast("Welcome, " + name + "! Your ID is " + id + (rev > 0 ? ". Use it to log in on any device." : ""), "gold");
  }

  /* Save the current slot, switch slots and reload everything from the new one. */
  function switchUser(user) {
    if (battle && !battle.over) forfeit();
    pvpLeave(true);
    save();
    pushSave(true); /* upload the account being left straight away */
    releaseLease();
    currentUser = user;
    try { if (user) localStorage.setItem(SESSION_KEY, user); else localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    S = load();
    autoOn = false;
    hideDualWarning();
    resetRollDisplay();
    renderAccount();
    renderAll();
    syncAccount();
    chatReset();
  }

  /* ---------- Online accounts: the save lives on the server, so an ID works on every device ----------
     Only one device (or browser tab) may roll on an account at a time: rolling takes a short lease from the
     server, and while one device holds it the others get error 145. */

  /* Each browser tab counts as its own device for the roll lock; the ID survives reloading the tab. */
  var deviceId = (function () {
    var d = null;
    try { d = sessionStorage.getItem(TAB_KEY); } catch (e) { /* ignore */ }
    if (!d || !/^[a-z0-9]{8,40}$/.test(d)) {
      var buf = new Uint8Array(16);
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(buf);
      else for (var i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
      d = Array.prototype.map.call(buf, function (b) { return (b % 36).toString(36); }).join("");
      try { sessionStorage.setItem(TAB_KEY, d); } catch (e) { /* ignore */ }
    }
    return d;
  })();

  var Cloud = {
    state: "local",   /* local (nothing online yet), synced, saving, offline, missing (this site has no account server) */
    leaseUntil: 0,    /* this tab may roll until then */
    claiming: null,   /* in-flight claim */
    pushTimer: null,
    pushing: false,
    changes: 0,       /* bumps on every save, so a finished upload knows whether newer changes are waiting */
    contestSeen: 0,
    netWarned: false
  };
  var CONFLICT_MSG = "This account was played on another device at the same time, so its newest save was loaded here.";

  function accountMeta(id) {
    var acc = readAccounts();
    return id && acc[id] ? acc[id] : null;
  }
  function updateMeta(id, fields) {
    var acc = readAccounts();
    if (!acc[id]) return;
    Object.assign(acc[id], fields);
    writeAccounts(acc);
  }
  function cloudOn() {
    var m = accountMeta(currentUser);
    return !!(m && m.cloud) && Cloud.state !== "missing";
  }
  function setCloudState(st) {
    Cloud.state = st;
    renderCloudStatus();
  }

  /* POST one action to the account server. Resolves { status, data }; rejects { net: true } when the
     server can't be reached, with missing: true when this site has no account server at all. */
  function cloudCall(action, payload, keepalive) {
    var body = JSON.stringify(Object.assign({ action: action }, payload || {}));
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 10000) : null;
    var done = function () { if (timer) clearTimeout(timer); };
    return fetch(CLOUD_URL, { method: "POST", headers: { "content-type": "application/json" }, body: body, keepalive: !!keepalive && body.length < 60000, signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        if ((res.headers.get("content-type") || "").indexOf("application/json") === -1) {
          /* A plain page instead of JSON: the site was published without the account function. */
          var missing = res.status === 404 || res.status === 405 || res.status === 501;
          if (missing) setCloudState("missing");
          throw { net: true, missing: missing };
        }
        return res.json().then(function (data) {
          if (res.status >= 500) throw { net: true };
          Cloud.netWarned = false;
          return { status: res.status, data: data };
        });
      })
      .then(function (r) { done(); return r; }, function (e) { done(); throw e && e.net ? e : { net: true }; });
  }

  /* Tell the player once per outage that the account server can't be reached. */
  function noteNetwork(e) {
    if (e && e.missing) {
      if (!Cloud.netWarned && currentUser) errorToast(ERR.NETWORK, "Online accounts aren't set up on this site, so your ID only works on this device.");
    } else {
      setCloudState("offline");
      if (!Cloud.netWarned) errorToast(ERR.NETWORK, "Can't reach the account server. You can keep playing; progress syncs when you're back online.");
    }
    Cloud.netWarned = true;
  }

  /* Called by save(): queue an upload, at most one every few seconds. */
  function cloudChanged() {
    if (!Cloud || !currentUser) return;
    Cloud.changes++;
    var m = accountMeta(currentUser);
    if (!m) return;
    if (!m.dirty) updateMeta(currentUser, { dirty: true });
    if (m.cloud && Cloud.state !== "missing" && !Cloud.pushTimer) Cloud.pushTimer = setTimeout(pushSave, 3000);
  }

  /* Upload the save. Refused when another device is rolling (145) or saved first (98). */
  function pushSave(keepalive) {
    clearTimeout(Cloud.pushTimer);
    Cloud.pushTimer = null;
    var id = currentUser, m = accountMeta(id);
    if (!m || !m.cloud || !m.dirty || Cloud.state === "missing") return;
    if (Cloud.pushing && !keepalive) { Cloud.pushTimer = setTimeout(pushSave, 3000); return; }
    Cloud.pushing = true;
    var stamp = Cloud.changes;
    setCloudState("saving");
    cloudCall("save", { id: id, device: deviceId, rev: m.rev || 0, save: S }, keepalive).then(function (r) {
      var still = id === currentUser && stamp !== Cloud.changes;
      if (r.status === 200) {
        updateMeta(id, { rev: r.data.rev, dirty: still });
        setCloudState("synced");
        if (still && !Cloud.pushTimer) Cloud.pushTimer = setTimeout(pushSave, 3000);
      } else if (r.data.code === ERR.DUAL) {
        setCloudState("synced");
        if (id === currentUser) { showDualWarning(false, r.data.waitMs); Cloud.pushTimer = setTimeout(pushSave, 20000); }
      } else if (r.data.code === ERR.ACCOUNT && r.data.save !== undefined) {
        if (id === currentUser) adoptCloudSave(r.data, CONFLICT_MSG);
      } else if (r.status === 404) {
        /* The account is gone from the server (for example a fresh site): upload it again. */
        updateMeta(id, { cloud: false });
        if (id === currentUser) goOnline();
      } else {
        errorToast(ERR.ACCOUNT, r.data.error || "Your save could not be stored online.");
      }
    }, function (e) {
      noteNetwork(e);
      if (!e.missing && !Cloud.pushTimer) Cloud.pushTimer = setTimeout(pushSave, 15000);
    }).then(function () { Cloud.pushing = false; });
  }

  /* Replace this device's progress with the account's newest save from the server. `lostMsg` is shown
     when local changes had to be dropped; otherwise a friendly note, unless `quiet`. */
  function adoptCloudSave(data, lostMsg, quiet) {
    var meta = accountMeta(currentUser) || {};
    var hadChanges = !!meta.dirty;
    if (data.by === "admin" && data.note === "luck" && (data.base === meta.rev || !hadChanges)) {
      /* An admin cleared everyone's luck. If this device has progress newer than what the admin edited,
         clear the luck here and keep that progress; otherwise just take the server's save. */
      if (hadChanges) { S.luckEffects = []; S.floorEffects = []; S.shinyEffects = []; } else S = hydrate(data.save);
      updateMeta(currentUser, { rev: data.rev });
      saveLocal();
      if (hadChanges) cloudChanged();
      setCloudState("synced");
      renderAll();
      toast("🍀 An admin reset everyone's luck to x1", "gold");
      return;
    }
    var incoming = hydrate(data.save);
    if (JSON.stringify(incoming) === JSON.stringify(S)) {
      /* Same progress (typically this device's own last upload, whose reply was lost): just catch up the revision. */
      updateMeta(currentUser, { rev: data.rev, dirty: false });
      setCloudState("synced");
      return;
    }
    S = incoming;
    saveLocal();
    updateMeta(currentUser, { rev: data.rev, dirty: false, name: data.name || accountName(currentUser) });
    Cloud.changes++;
    setCloudState("synced");
    resetRollDisplay();
    renderAccount();
    renderAll();
    if (data.by === "admin" && data.note === "reset") {
      errorToast(ERR.ACCOUNT, "💥 An admin reset this account, so all its progress was erased.");
    } else if (data.by === "admin") {
      if (hadChanges) errorToast(ERR.ACCOUNT, "An admin changed this account, so its newest save was loaded here.");
      else toast("🛠️ An admin updated your account", "gold");
    } else if (hadChanges && lostMsg) errorToast(ERR.ACCOUNT, lostMsg);
    else if (!quiet) toast("☁️ Loaded your newest progress from your other device");
  }

  /* Ask the server for this tab's turn to roll. Resolves true when rolling may go ahead. */
  function claimLease() {
    if (Cloud.claiming) return Cloud.claiming;
    var id = currentUser, m = accountMeta(id);
    Cloud.claiming = cloudCall("claim", { id: id, device: deviceId, rev: m.rev || 0 }).then(function (r) {
      if (id !== currentUser) return false;
      if (r.status === 200) {
        Cloud.leaseUntil = Date.now() + r.data.leaseMs;
        if (r.data.save !== undefined) adoptCloudSave(r.data, CONFLICT_MSG);
        if (Cloud.state !== "saving") setCloudState("synced");
        if (r.data.contestAt && r.data.contestAt !== Cloud.contestSeen) {
          Cloud.contestSeen = r.data.contestAt;
          showDualWarning(true);
        }
        return true;
      }
      if (r.data.code === ERR.DUAL) {
        Cloud.leaseUntil = 0;
        if (autoOn) { autoOn = false; renderAll(); }
        showDualWarning(false, r.data.waitMs);
        return false;
      }
      if (r.status === 404) { updateMeta(id, { cloud: false }); goOnline(); return true; }
      errorToast(ERR.ACCOUNT, r.data.error || "Your account could not be checked.");
      return false;
    }, function (e) {
      /* Offline: keep playing on this device; the save syncs later. */
      noteNetwork(e);
      return true;
    }).then(function (ok) { Cloud.claiming = null; return ok; });
    return Cloud.claiming;
  }

  /* Give the roll lease back so another device can roll straight away. */
  function releaseLease() {
    if (!currentUser || Cloud.leaseUntil <= Date.now()) return;
    Cloud.leaseUntil = 0;
    cloudCall("release", { id: currentUser, device: deviceId }, true).catch(function () { /* the lease runs out by itself */ });
  }

  /* Roll, but on an online account first make sure no other device is rolling on it. */
  function requestRoll(forced, forcedShiny) {
    if (aurasLocked()) { toast("🚫 Your auras are locked for " + aurasLockText() + " (swearing in chat)", "bad"); if (autoOn) { autoOn = false; renderAll(); } return; }
    if (!canRoll()) return;
    if (!cloudOn()) { doRoll(forced, forcedShiny); return; }
    var left = Cloud.leaseUntil - Date.now();
    if (left > 3000) {
      doRoll(forced, forcedShiny);
      if (left < 12000) claimLease();
      return;
    }
    if (Cloud.claiming) return;
    claimLease().then(function (ok) { if (ok && canRoll()) doRoll(forced, forcedShiny); });
  }

  /* Bring the logged-in account up to date: upload one that only exists here, or load newer progress. */
  function syncAccount() {
    var id = currentUser, m = accountMeta(id);
    renderCloudStatus();
    if (!m || Cloud.state === "missing") return;
    if (!m.cloud) { goOnline(); return; }
    cloudCall("load", { id: id }).then(function (r) {
      if (id !== currentUser) return;
      if (r.status === 404) { updateMeta(id, { cloud: false }); goOnline(); return; }
      if (r.status !== 200) return;
      setCloudState("synced");
      var meta = accountMeta(id);
      if (r.data.rev !== meta.rev) adoptCloudSave(r.data, CONFLICT_MSG);
      else if (meta.dirty) pushSave();
      setTimeout(checkGifts, 1500);
    }, noteNetwork);
  }

  /* Put the logged-in account (made on this device before accounts were online) on the server,
     keeping its ID if nobody online has it. */
  function goOnline() {
    var id = currentUser, m = accountMeta(id);
    if (!m || Cloud.state === "missing") return;
    var name = String(m.name || "").replace(/[^\p{L}\p{N} _'.-]/gu, "").trim().slice(0, 50);
    if (name.length < 2) name = "Player " + id;
    var stamp = Cloud.changes;
    cloudCall("create", { name: name, device: deviceId, save: S, preferId: id }).then(function (r) {
      if (id !== currentUser) return;
      if (r.status !== 200) { errorToast(r.data.code || ERR.ACCOUNT, r.data.error || "Your account could not be put online."); return; }
      if (r.data.id !== id) moveAccount(id, r.data.id);
      updateMeta(r.data.id, { cloud: true, rev: r.data.rev, dirty: stamp !== Cloud.changes, name: r.data.name });
      setCloudState("synced");
      renderAccount();
      renderChat();
      if (r.data.id === id) toast("☁️ Your account is online: log in with ID " + id + " on any device", "gold");
      else toast("☁️ Your account is online with a new ID, " + r.data.id + " (someone already had " + id + "). Write it down!", "gold", 8000);
      if (stamp !== Cloud.changes) pushSave();
    }, noteNetwork);
  }

  /* Re-key the logged-in account to a new ID on this device. */
  function moveAccount(oldId, newId) {
    var acc = readAccounts();
    acc[newId] = Object.assign({}, acc[oldId], { id: newId });
    delete acc[oldId];
    writeAccounts(acc);
    try {
      var slot = localStorage.getItem(SAVE_BASE + ":" + oldId);
      if (slot) localStorage.setItem(SAVE_BASE + ":" + newId, slot);
      localStorage.removeItem(SAVE_BASE + ":" + oldId);
      localStorage.setItem(SESSION_KEY, newId);
    } catch (e) { /* ignore */ }
    currentUser = newId;
  }

  /* While this tab isn't rolling, pick up progress made on another device. */
  function cloudCatchUp() {
    if (!cloudOn() || Cloud.pushing || Cloud.claiming || busy || CS.running || (battle && !battle.over) || Cloud.leaseUntil > Date.now()) return;
    var id = currentUser;
    cloudCall("peek", { id: id }).then(function (r) {
      if (id !== currentUser || r.status !== 200) return;
      if (Cloud.state === "offline") setCloudState("synced");
      var meta = accountMeta(id);
      if (r.data.rev === meta.rev) { if (meta.dirty) pushSave(); return; }
      return cloudCall("load", { id: id }).then(function (l) {
        if (id !== currentUser || l.status !== 200 || busy || CS.running || (battle && !battle.over)) return;
        adoptCloudSave(l.data, CONFLICT_MSG, true);
      });
    }, noteNetwork);
  }

  /* ---------- Gifting auras: they travel from one player ID to another through the account server ---------- */

  var giftView = null; /* the open gift popup: { id, shiny, step: "who" | "confirm", to, toName, count } */

  /* Gifts need an online account on both sides. Says why not (as a red toast) and returns false. */
  function giftReady() {
    var m = accountMeta(currentUser);
    if (!currentUser || !m) { errorToast(ERR.ACCOUNT, "Log in first (Login, top right) to send gifts. Gifts go from one player ID to another."); return false; }
    if (Cloud.state === "missing") { errorToast(ERR.NETWORK, "Gifting needs online accounts, and they aren't set up on this site."); return false; }
    if (!m.cloud) { errorToast(ERR.ACCOUNT, "Your account isn't online yet. Wait a moment and try again."); return false; }
    if (battle && !battle.over) { toast("Finish the fight first", "bad"); return false; }
    return true;
  }

  function giftBag(shiny) { return shiny ? S.shinyInventory : S.inventory; }

  function openGift(id, shiny) {
    if (!giftReady()) return;
    if (aurasLocked()) { toast("Your auras are locked for " + aurasLockText(), "bad"); return; }
    var a = A.byId(id), sh = isShiny(a, shiny), have = giftBag(sh)[id] || 0;
    if (!have) return;
    giftView = { kind: "aura", id: id, shiny: sh, step: "who", to: "", toName: "", count: 1 };
    $("#gift-title").textContent = "🎁 Gift an aura";
    $("#gift-count-label").textContent = "How many";
    var box = $("#gift-aura");
    box.innerHTML = "";
    box.appendChild(makeOrb(a, "", sh));
    var info = document.createElement("div");
    var name = document.createElement("div"); name.className = "card-title"; name.textContent = auraLabel(a, sh);
    var sub = document.createElement("div"); sub.className = "card-sub"; sub.textContent = (sh ? "Shiny " : "") + tierName(a) + " · you have " + fmt(have);
    info.appendChild(name); info.appendChild(sub);
    box.appendChild(info);
    $("#gift-to").value = "";
    $("#gift-count").value = "1";
    $("#gift-count").max = String(have);
    $("#gift-count-row").classList.toggle("hidden", have < 2);
    setGiftStep("who");
    $("#gift-modal").classList.remove("hidden");
    $("#gift-to").focus();
  }

  /* Open the gift popup in coins mode. */
  function openGiftCoins() {
    if (!giftReady()) return;
    if (!(S.coins >= 1)) { errorToast(ERR.ACCOUNT, "You have no coins to gift yet."); return; }
    giftView = { kind: "coins", step: "who", to: "", toName: "", coins: 0 };
    $("#gift-title").textContent = "🎁 Gift coins";
    $("#gift-count-label").textContent = "How many coins";
    var box = $("#gift-aura");
    box.innerHTML = "";
    var icon = document.createElement("div"); icon.className = "gift-coin-icon"; icon.textContent = "🪙";
    var info = document.createElement("div");
    var name = document.createElement("div"); name.className = "card-title"; name.textContent = "Coins";
    var sub = document.createElement("div"); sub.className = "card-sub"; sub.textContent = "You have " + fmt(S.coins) + " coins";
    info.appendChild(name); info.appendChild(sub);
    box.appendChild(icon); box.appendChild(info);
    $("#gift-to").value = "";
    $("#gift-count").value = String(Math.min(100, S.coins));
    $("#gift-count").max = String(Math.floor(S.coins));
    $("#gift-count-row").classList.remove("hidden");
    setGiftStep("who");
    $("#gift-modal").classList.remove("hidden");
    $("#gift-to").focus();
  }
  function closeGift() { giftView = null; $("#gift-modal").classList.add("hidden"); }

  function setGiftStep(step, error) {
    if (!giftView) return;
    giftView.step = step;
    $("#gift-error").textContent = error || "";
    var conf = $("#gift-confirm");
    conf.classList.toggle("hidden", step !== "confirm");
    if (step === "confirm") {
      if (giftView.kind === "coins") {
        conf.textContent = "Send " + fmt(giftView.coins) + " coins to " + giftView.toName + " (ID " + giftView.to + ")? They leave your account and can't be taken back.";
      } else {
        var a = A.byId(giftView.id);
        conf.textContent = "Send " + (giftView.count > 1 ? fmt(giftView.count) + " x " : "") + auraLabel(a, giftView.shiny) + " to " + giftView.toName + " (ID " + giftView.to + ")? It leaves your inventory and can't be taken back.";
      }
    }
    $("#gift-submit").disabled = false;
    $("#gift-submit").textContent = step === "confirm" ? "🎁 Send gift" : "Next";
  }

  /* Step 1 looks the friend up so the player sees their name; step 2 sends. */
  function giftSubmit() {
    if (!giftView || !giftReady()) return;
    if (giftView.step === "confirm") { sendGift(); return; }
    var to = $("#gift-to").value.trim(), amount = Math.floor(Number($("#gift-count").value));
    if (!/^\d{7}$/.test(to)) { setGiftStep("who", "A player ID is 7 digits."); return; }
    if (to === currentUser) { setGiftStep("who", "That's your own ID. Enter your friend's ID."); return; }
    if (giftView.kind === "coins") {
      if (!(amount >= 1)) { setGiftStep("who", "Send at least 1 coin."); return; }
      if (amount > S.coins) { setGiftStep("who", "You only have " + fmt(S.coins) + " coins."); return; }
      giftView.coins = amount;
    } else {
      var have = giftBag(giftView.shiny)[giftView.id] || 0;
      if (!(amount >= 1)) { setGiftStep("who", "Send at least 1."); return; }
      if (amount > have) { setGiftStep("who", "You only have " + fmt(have) + "."); return; }
      giftView.count = amount;
    }
    $("#gift-submit").disabled = true;
    $("#gift-error").textContent = "";
    var view = giftView;
    cloudCall("peek", { id: to }).then(function (r) {
      if (giftView !== view) return;
      if (r.status !== 200) { setGiftStep("who", r.data.error || "No player with ID " + to + "."); return; }
      view.to = to; view.toName = r.data.name || "Player " + to;
      setGiftStep("confirm");
    }, function (e) {
      if (giftView !== view) return;
      setGiftStep("who", e && e.missing ? "Gifting needs online accounts, and they aren't set up on this site." : "Error 404: can't reach the account server. Try again.");
    });
  }

  /* Take the auras out of this save and store it online together with the gift, so the friend's gift box and
     this account change together. If the server refuses, the auras come straight back. */
  function sendGift() {
    var g = giftView, id = currentUser, m = accountMeta(id), coins = g.kind === "coins";
    var bag = coins ? null : giftBag(g.shiny);
    if (coins ? S.coins < g.coins : (bag[g.id] || 0) < g.count) { setGiftStep("who", coins ? "You don't have that many coins any more." : "You don't have that many any more."); return; }
    if (Cloud.pushing || Cloud.claiming) { $("#gift-error").textContent = "Saving… try again in a moment."; return; }
    var before = coins ? { coins: S.coins } : { n: bag[g.id], equipped: S.equipped, equippedShiny: S.equippedShiny };
    if (coins) {
      S.coins -= g.coins;
      S.stats.coinsGifted = (S.stats.coinsGifted || 0) + g.coins;
    } else {
      bag[g.id] -= g.count;
      if (!bag[g.id]) delete bag[g.id];
      if (S.equipped === g.id && !!S.equippedShiny === g.shiny && !owns(g.id, g.shiny)) { S.equipped = null; S.equippedShiny = false; }
      S.stats.giftsSent = (S.stats.giftsSent || 0) + g.count;
    }
    saveLocal();
    var undo = function () {
      if (coins) { S.coins = before.coins; S.stats.coinsGifted -= g.coins; }
      else {
        bag[g.id] = before.n;
        S.equipped = before.equipped;
        S.equippedShiny = before.equippedShiny;
        S.stats.giftsSent -= g.count;
      }
      save();
      renderAll();
    };
    var stamp = Cloud.changes;
    Cloud.pushing = true;
    setCloudState("saving");
    $("#gift-submit").disabled = true;
    $("#gift-submit").textContent = "Sending…";
    var payload = coins ? { id: id, device: deviceId, rev: m.rev || 0, save: S, to: g.to, coins: g.coins }
                        : { id: id, device: deviceId, rev: m.rev || 0, save: S, to: g.to, aura: g.id, shiny: g.shiny, count: g.count };
    cloudCall("gift", payload).then(function (r) {
      if (id !== currentUser) return;
      var label = coins ? fmt(g.coins) + " coins" : (g.count > 1 ? fmt(g.count) + " x " : "") + auraLabel(A.byId(g.id), g.shiny);
      if (r.status === 200) {
        var still = stamp !== Cloud.changes;
        updateMeta(id, { rev: r.data.rev, dirty: still });
        setCloudState("synced");
        if (still && !Cloud.pushTimer) Cloud.pushTimer = setTimeout(pushSave, 3000);
        if (giftView === g) closeGift();
        Sound.buy();
        toast("🎁 Sent " + label + " to " + (r.data.toName || g.toName) + "!", "gold", 5000);
        renderAll();
        return;
      }
      setCloudState("synced");
      if (r.data.code === ERR.ACCOUNT && r.data.save !== undefined) {
        /* Another device played on this account meanwhile: its newer save is loaded and nothing was sent. */
        adoptCloudSave(r.data, CONFLICT_MSG);
        if (giftView === g) setGiftStep("who", "Your account changed on another device, so the gift wasn't sent. Check your auras and try again.");
        return;
      }
      undo();
      if (r.data.code === ERR.DUAL) { if (giftView === g) setGiftStep("who", "Error 145: this account is rolling on another device. Stop rolling there, then send the gift."); return; }
      if (r.status === 404 && r.data.missing !== "to") { updateMeta(id, { cloud: false }); goOnline(); }
      if (giftView === g) setGiftStep("who", r.data.error || "The gift couldn't be sent.");
    }, function (e) {
      undo();
      noteNetwork(e);
      if (giftView === g) setGiftStep("who", "Error 404: can't reach the account server, so the gift wasn't sent. Your " + (g.kind === "coins" ? "coins are" : "aura is") + " safe.");
    }).then(function () { Cloud.pushing = false; });
  }

  /* Collect what is waiting in this account's gift box. Each gift is added to the save once (its id is kept in
     giftsOpened), and the server only takes gifts out of the box once a save holding them is stored. */
  function checkGifts() {
    if (!cloudOn() || Cloud.pushing || Cloud.claiming || Cloud.openingGifts) return;
    var id = currentUser;
    Cloud.openingGifts = true;
    cloudCall("gifts", { id: id }).then(function (r) {
      if (id !== currentUser || r.status !== 200 || !Array.isArray(r.data.gifts) || !r.data.gifts.length) return;
      if (Cloud.pushing || Cloud.claiming) return; /* busy saving: the next check picks them up */
      var all = r.data.gifts, fresh = [];
      all.forEach(function (g) {
        if (!g || S.giftsOpened.indexOf(g.id) >= 0) return;
        S.giftsOpened.push(g.id);
        var from = g.fromName || "A player";
        if (g.coins != null) {
          var coins = Math.max(0, Math.floor(Number(g.coins) || 0));
          if (!coins) return;
          S.coins += coins;
          S.stats.earned = (S.stats.earned || 0) + coins;
          S.stats.coinsReceived = (S.stats.coinsReceived || 0) + coins;
          fresh.push({ id: g.id, coins: coins, from: from });
          return;
        }
        var a = A.byId(g.aura), n = Math.max(1, Math.floor(Number(g.count) || 1));
        if (!a) return; /* an aura this version of the game doesn't know: dropped from the box */
        var sh = isShiny(a, g.shiny);
        giftBag(sh)[a.id] = (giftBag(sh)[a.id] || 0) + n;
        S.stats.giftsReceived = (S.stats.giftsReceived || 0) + n;
        fresh.push({ id: g.id, a: a, sh: sh, n: n, from: from });
      });
      if (S.giftsOpened.length > 300) S.giftsOpened = S.giftsOpened.slice(-300);
      saveLocal();
      var announce = function () {
        if (!fresh.length) return;
        fresh.slice(0, 3).forEach(function (f) {
          var what = f.coins != null ? fmt(f.coins) + " coins" : (f.n > 1 ? fmt(f.n) + " x " : "") + auraLabel(f.a, f.sh);
          toast("🎁 " + f.from + " sent you " + what + "!", "gold", 8000);
        });
        if (fresh.length > 3) toast("🎁 …and " + (fresh.length - 3) + " more gifts! Check your inventory.", "gold", 8000);
        Sound.rare(1);
        renderAll();
      };
      var m = accountMeta(id), stamp = Cloud.changes;
      Cloud.pushing = true;
      setCloudState("saving");
      return cloudCall("openGifts", { id: id, device: deviceId, rev: m.rev || 0, save: S, ids: all.map(function (g) { return g && g.id; }) }).then(function (o) {
        if (id !== currentUser) return;
        setCloudState("synced");
        if (o.status === 200) {
          var still = stamp !== Cloud.changes;
          updateMeta(id, { rev: o.data.rev, dirty: still });
          if (still && !Cloud.pushTimer) Cloud.pushTimer = setTimeout(pushSave, 3000);
          announce();
        } else if (o.data.code === ERR.ACCOUNT && o.data.save !== undefined) {
          /* Another device saved first: take its save. The gifts are still in the box and get added to it next time. */
          adoptCloudSave(o.data, CONFLICT_MSG, true);
        } else {
          /* Another device is rolling on this account (145): put the gifts back; that device collects them. */
          fresh.forEach(function (f) {
            if (f.coins != null) {
              S.coins -= f.coins;
              S.stats.earned = Math.max(0, (S.stats.earned || 0) - f.coins);
              S.stats.coinsReceived = Math.max(0, (S.stats.coinsReceived || 0) - f.coins);
            } else {
              var bag = giftBag(f.sh);
              bag[f.a.id] -= f.n;
              if (!(bag[f.a.id] > 0)) delete bag[f.a.id];
              S.stats.giftsReceived -= f.n;
            }
            S.giftsOpened = S.giftsOpened.filter(function (x) { return x !== f.id; });
          });
          saveLocal();
        }
      }, function (e) {
        /* The reply never came: keep the gifts here (giftsOpened stops them being added twice); the box
           is emptied on a later check once a save holding them is stored. */
        updateMeta(id, { dirty: true });
        announce();
        throw e;
      }).then(function () { Cloud.pushing = false; }, function (e) { Cloud.pushing = false; throw e; });
    }).catch(function (e) { if (e && e.net) noteNetwork(e); }).then(function () { Cloud.openingGifts = false; });
  }
  setInterval(function () { if (document.visibilityState === "visible") checkGifts(); }, 20000);

  /* ---------- Global chat: messages live on the account server; this tab asks for new ones every few seconds ---------- */

  var Chat = { seq: 0, messages: [], nodes: {}, pending: [], timer: null, loading: false, unread: 0, muted: null, error: null, here: null, sending: false, pendingNo: 0 };
  var CHAT_KEEP = 100;

  function chatOpen() { return $("#tab-chat").classList.contains("active"); }

  /* POST to the chat server. Rejects { chat: 981 } when the internet is down, { chat: 523 } for a code or server error. */
  function chatFetch(action, payload) {
    if (navigator.onLine === false) return Promise.reject({ chat: ERR.CHAT_WIFI });
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 10000) : null;
    return fetch(CLOUD_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.assign({ action: action }, payload)), signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        if (timer) clearTimeout(timer);
        if ((res.headers.get("content-type") || "").indexOf("application/json") === -1) {
          throw { chat: ERR.CHAT_CODE, missing: res.status === 404 || res.status === 405 || res.status === 501 };
        }
        return res.json().then(function (data) {
          if (res.status >= 500) throw { chat: ERR.CHAT_CODE };
          return { status: res.status, data: data };
        }, function () { throw { chat: ERR.CHAT_CODE }; });
      }, function () { if (timer) clearTimeout(timer); throw { chat: ERR.CHAT_WIFI }; });
  }

  /* The red chat message for a failure. Anything that isn't a WiFi problem (including a bug in this code) is 523. */
  function chatErrorText(e) {
    if (e && e.chat === ERR.CHAT_WIFI) return "⚠️ Error 981: You can't chat right now because of a WiFi error. Check your internet connection; the chat reconnects by itself.";
    if (e && e.missing) return "⚠️ Error 523: Code error: the chat server isn't set up on this site.";
    return "⚠️ Error 523: Code error: something went wrong in the chat's code. Try again in a moment.";
  }

  function chatSchedule(ms) { clearTimeout(Chat.timer); Chat.timer = setTimeout(chatPoll, ms); }

  /* Fetch messages newer than the last one seen: every 3 seconds with the chat open, every 20 otherwise (for the badge). */
  function chatPoll() {
    if (document.visibilityState !== "visible" || Chat.loading) { chatSchedule(chatOpen() ? 3000 : 20000); return; }
    Chat.loading = true;
    var viewer = currentUser;
    chatFetch("chat", { since: Chat.seq, id: viewer || undefined, here: !!viewer && chatOpen() }).then(function (r) {
      if (viewer !== currentUser) return;
      if (r.status !== 200) throw { chat: ERR.CHAT_CODE };
      chatApply(r.data);
      Chat.error = null;
      Chat.muted = r.data.muted || null;
      Chat.here = Array.isArray(r.data.here) ? r.data.here : null;
      if (viewer && typeof r.data.aurasUntil === "number") setAuraLock(r.data.aurasUntil);
      renderChat();
    }).catch(function (e) {
      Chat.error = e;
      renderChat();
    }).then(function () {
      Chat.loading = false;
      chatSchedule(Chat.error && Chat.error.missing ? 60000 : chatOpen() ? 3000 : 20000);
    });
  }

  /* Merge a chat reply: drop cleared and deleted messages, add new ones, count the unread ones. */
  function chatApply(d) {
    var removed = Array.isArray(d.removed) ? d.removed : [];
    Chat.messages = Chat.messages.filter(function (m) { return m.seq > (d.cleared || 0) && removed.indexOf(m.seq) < 0; });
    var have = {};
    Chat.messages.forEach(function (m) { have[m.seq] = true; });
    var fresh = (d.messages || []).filter(function (m) { return !have[m.seq]; });
    Chat.messages = Chat.messages.concat(fresh).sort(function (a, b) { return a.seq - b.seq; }).slice(-CHAT_KEEP);
    if (Chat.seq && !chatOpen()) Chat.unread += fresh.filter(function (m) { return !m.mine; }).length;
    Chat.seq = Math.max(Chat.seq, d.seq || 0);
  }

  /* One message bubble. Everything players typed goes in as text, never as HTML. */
  function chatNode(m) {
    var el = document.createElement("div");
    el.className = "chat-msg" + (m.mine ? " mine" : "");
    var meta = document.createElement("div");
    meta.className = "chat-meta";
    var name = document.createElement("span");
    name.className = "chat-name";
    name.textContent = m.name;
    meta.appendChild(name);
    var a = m.aura !== null && m.aura !== undefined ? A.byId(m.aura) : null;
    if (a) {
      var tag = document.createElement("span");
      tag.className = "chat-aura t-" + a.tier;
      tag.textContent = auraLabel(a, m.shiny);
      meta.appendChild(tag);
    }
    var time = document.createElement("span");
    time.textContent = new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    meta.appendChild(time);
    var tools = document.createElement("span");
    tools.className = "chat-admin";
    [["🔇 10m", "Mute this player for 10 minutes", function () { chatAdmin("chatMute", { seq: m.seq, minutes: 10 }); }],
     ["🗑️", "Delete this message", function () { chatAdmin("chatDelete", { seq: m.seq }); }]].forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = t[0];
      b.title = t[1];
      b.addEventListener("click", t[2]);
      tools.appendChild(b);
    });
    meta.appendChild(tools);
    var text = document.createElement("div");
    text.className = "chat-text";
    text.textContent = m.text;
    el.appendChild(meta);
    el.appendChild(text);
    return el;
  }

  /* Update the chat: add and remove bubbles (existing ones are kept, so clicks on them never get lost), the
     status line, the badge and the message box. */
  function renderChat() {
    var log = $("#chat-log");
    var atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    var keep = {};
    Chat.messages.forEach(function (m) { keep[m.seq] = true; });
    Object.keys(Chat.nodes).forEach(function (seq) { if (!keep[seq]) { Chat.nodes[seq].remove(); delete Chat.nodes[seq]; } });
    var empty = log.querySelector(".empty-note");
    if (empty) empty.remove();
    /* New bubbles go in seq order (a reply can arrive before an older message); messages still being sent
       stay at the bottom. Existing bubbles are never rebuilt. */
    var anchor = Chat.pending.length ? Chat.pending[0].node : null;
    for (var i = Chat.messages.length - 1; i >= 0; i--) {
      var m = Chat.messages[i], node = Chat.nodes[m.seq];
      if (!node) { node = Chat.nodes[m.seq] = chatNode(m); log.insertBefore(node, anchor && anchor.parentNode === log ? anchor : null); }
      anchor = node;
    }
    Chat.pending.forEach(function (pm) { if (pm.node.parentNode !== log || pm.node.nextSibling) log.appendChild(pm.node); });
    if (!Chat.messages.length && !Chat.pending.length) {
      var note = document.createElement("div");
      note.className = "empty-note";
      note.textContent = Chat.error ? "No messages yet." : "No messages yet. Say hi!";
      log.appendChild(note);
    }
    log.classList.toggle("admin", adminUnlocked);
    if (atBottom) log.scrollTop = log.scrollHeight;

    var st = $("#chat-status"), input = $("#chat-input");
    var meta = accountMeta(currentUser), offlineAcct = !!currentUser && (!meta || !meta.cloud);
    var who = Chat.here ? (Chat.here.length ? "In the chat now: " + Chat.here.join(", ") : "Nobody else is in the chat right now.") : "";
    var bad = Chat.error ? chatErrorText(Chat.error)
      : Chat.muted ? "⚠️ Error 108: An admin muted you, so you can't chat " + Chat.muted.text + "."
      : offlineAcct ? "⚠️ Error 98: Your account isn't online yet, so you can't chat. Keep the game open for a moment; it goes online by itself." : "";
    var status = bad || (Chat.loading && !Chat.seq && !Chat.here ? "Connecting to the chat…"
      : !currentUser ? "🟢 Connected. Log in (Login, top right) to chat; you can still read along. " + who
      : "🟢 Connected. " + who);
    st.textContent = status;
    st.className = "chat-status" + (bad ? " err" : status.indexOf("🟢") === 0 ? " ok" : "");
    $("#chat-site").textContent = location.host || "this device";
    var canSend = !!currentUser && !Chat.muted && !offlineAcct;
    input.disabled = !canSend;
    $("#chat-send").disabled = !canSend || Chat.sending;
    input.placeholder = !currentUser ? "Log in to chat" : Chat.muted ? "You're muted (Error 108)" : offlineAcct ? "Your account isn't online yet" : "Say something…";

    if (chatOpen()) Chat.unread = 0;
    var badge = $("#chat-badge");
    badge.textContent = Chat.unread > 99 ? "99+" : String(Chat.unread);
    badge.classList.toggle("hidden", !Chat.unread);
  }

  /* A message on its way: shown straight away as "sending…", then replaced by the real one, or kept with the
     reason it failed and a Try again button, so a message never just vanishes. */
  function chatPendingNode(pm) {
    var el = chatNode({ seq: "p" + pm.no, at: Date.now(), name: accountName(currentUser) || "You", text: pm.text, mine: true, aura: pm.aura, shiny: pm.shiny });
    el.classList.add("pending");
    var tools = el.querySelector(".chat-admin");
    if (tools) tools.remove();
    var note = document.createElement("div");
    note.className = "chat-note";
    note.textContent = "sending…";
    el.appendChild(note);
    return el;
  }
  function chatPendingFailed(pm, msg) {
    pm.node.classList.remove("pending");
    pm.node.classList.add("failed");
    var note = pm.node.querySelector(".chat-note");
    note.textContent = "Not sent: " + msg + " ";
    var retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Try again";
    retry.addEventListener("click", function () { chatDropPending(pm); chatSend(pm.text); });
    note.appendChild(retry);
    var drop = document.createElement("button");
    drop.type = "button";
    drop.textContent = "✕";
    drop.title = "Remove";
    drop.addEventListener("click", function () { chatDropPending(pm); });
    note.appendChild(drop);
  }
  function chatDropPending(pm) {
    Chat.pending = Chat.pending.filter(function (x) { return x !== pm; });
    pm.node.remove();
    renderChat();
  }

  function chatSend(again) {
    var input = $("#chat-input"), text = (typeof again === "string" ? again : input.value).trim(), id = currentUser;
    if (!text || Chat.sending) return;
    if (!id) { renderChat(); return; }
    if (Chat.muted) { errorToast(ERR.CHAT_MUTED, "An admin muted you, so you can't chat " + Chat.muted.text + "."); return; }
    var eq = equippedAura();
    var pm = { no: ++Chat.pendingNo, text: text, aura: eq ? eq.id : null, shiny: equippedShiny() };
    pm.node = chatPendingNode(pm);
    Chat.pending.push(pm);
    if (typeof again !== "string") input.value = "";
    Chat.sending = true;
    renderChat();
    $("#chat-log").scrollTop = $("#chat-log").scrollHeight;
    chatFetch("chatSend", { id: id, text: text, aura: pm.aura, shiny: pm.shiny }).then(function (r) {
      if (r.status === 200) {
        Chat.error = null;
        Chat.pending = Chat.pending.filter(function (x) { return x !== pm; });
        pm.node.remove();
        chatApply({ seq: Chat.seq, messages: [r.data.message] });
        renderChat();
        $("#chat-log").scrollTop = $("#chat-log").scrollHeight;
        chatSchedule(400);
        return;
      }
      if (r.data.code === ERR.CHAT_MUTED) {
        Chat.muted = { until: r.data.until, text: (r.data.error || "").replace(/^An admin muted you, so you can't chat /, "").replace(/\.$/, "") };
        chatPendingFailed(pm, "Error 108: " + (r.data.error || "An admin muted you."));
        errorToast(ERR.CHAT_MUTED, r.data.error || "An admin muted you, so you can't chat.");
      } else if (r.data.code === ERR.SWEAR) {
        setAuraLock(r.data.aurasUntil);
        chatPendingFailed(pm, "Error " + ERR.SWEAR + ": " + (r.data.error || "No swearing in chat."));
        errorToast(ERR.SWEAR, r.data.error || "No swearing in chat — your auras are locked.");
      } else if (r.data.slow) {
        chatPendingFailed(pm, r.data.error);
      } else {
        chatPendingFailed(pm, "Error " + (r.data.code || ERR.ACCOUNT) + ": " + (r.data.error || "Your message couldn't be sent."));
        errorToast(r.data.code || ERR.ACCOUNT, r.data.error || "Your message couldn't be sent.");
      }
    }).catch(function (e) {
      var code = e && e.chat === ERR.CHAT_WIFI ? ERR.CHAT_WIFI : ERR.CHAT_CODE;
      chatPendingFailed(pm, chatErrorText(e).replace(/^⚠️ /, ""));
      errorToast(code, chatErrorText(e).replace(/^⚠️ Error \d+: /, ""));
    }).then(function () {
      Chat.sending = false;
      renderChat();
    });
  }

  /* Admin buttons next to messages: mute the writer or delete the message. */
  function chatAdmin(op, fields) {
    accountAdmin(op, fields).then(function (d) {
      if (!d) { toast("That didn't work: see the admin panel in Stats", "bad"); return; }
      if (op === "chatMute") toast("🔇 Muted " + d.name + " " + d.text, "gold");
      if (op === "chatDelete") toast("🗑️ Deleted " + d.name + "'s message", "gold");
      aaPrint(op === "chatMute" ? "🔇 Muted " + d.name + " (" + d.id + ") " + d.text + "." : "🗑️ Deleted a message by " + d.name + " (" + d.id + ").");
      chatSchedule(100);
    });
  }

  /* After switching accounts the "mine" marks change, so start the chat over. */
  function chatReset() {
    Object.keys(Chat.nodes).forEach(function (seq) { Chat.nodes[seq].remove(); });
    Chat.pending.forEach(function (pm) { pm.node.remove(); });
    Chat.pending = [];
    Chat.here = null;
    Chat.nodes = {};
    Chat.messages = [];
    Chat.seq = 0;
    Chat.unread = 0;
    Chat.muted = null;
    renderChat();
    chatSchedule(300);
  }

  /* The red error 145 banner. `rolling` is true on the device that holds the lease and heard that another tried. */
  function showDualWarning(rolling, waitMs) {
    var secs = Math.max(1, Math.ceil((waitMs || 20000) / 1000));
    $("#dual-text").textContent = rolling
      ? "Another device just tried to roll on this account while this one is rolling. Rolling on both at once might crash your account. Only this device can roll until it stops for 20 seconds."
      : "This account is already rolling on another device, so this one can't roll right now. Rolling on both at once might crash your account. Stop rolling on the other device, then try again in about " + secs + " seconds.";
    $("#dual-warning").classList.remove("hidden");
  }
  function hideDualWarning() { $("#dual-warning").classList.add("hidden"); }

  function renderCloudStatus() {
    var el = $("#cloud-status");
    var m = accountMeta(currentUser);
    var st = !m ? "" : Cloud.state === "missing" || Cloud.state === "offline" ? Cloud.state : m.cloud ? (Cloud.state === "local" ? "synced" : Cloud.state) : "local";
    var info = {
      synced: ["☁️ Online", "Saved online: log in with this ID on any device."],
      saving: ["☁️ Saving…", "Uploading your progress."],
      offline: ["⚠️ Offline", "Error 404: can't reach the account server. Progress is kept here and syncs when you're back online."],
      missing: ["💻 This device", "Online accounts aren't set up on this site, so this ID only works on this device."],
      local: ["☁️ Connecting…", "Putting your account online."]
    }[st];
    el.className = "cloud-status cs-" + st + (info ? "" : " hidden");
    el.textContent = info ? info[0] : "";
    el.title = info ? info[1] : "";
  }

  /* Keep the lease while auto-rolling or watching a reveal; check for other devices' progress while idle. */
  setInterval(function () {
    if (!cloudOn()) return;
    var left = Cloud.leaseUntil - Date.now();
    if (left > 0 && left < 12000 && (autoOn || CS.running || busy)) claimLease();
  }, 4000);
  setInterval(function () { if (document.visibilityState === "visible") cloudCatchUp(); }, 20000);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") cloudCatchUp();
    else pushSave(true);
  });
  window.addEventListener("pagehide", function () { pushSave(true); releaseLease(); });
  window.addEventListener("online", function () { if (currentUser) syncAccount(); });

  function resetRollDisplay() {
    FX.clear();
    if (S.lastRoll !== null && ownsAny(S.lastRoll)) { var ls = owns(S.lastRoll, !!S.lastShiny) ? !!S.lastShiny : owns(S.lastRoll, true) && !owns(S.lastRoll, false); showAura(A.byId(S.lastRoll), ls); stageAmbient(A.byId(S.lastRoll), ls); return; }
    setGlow(null, 0);
    $("#roll-banner").className = "roll-banner";
    $("#roll-banner").textContent = "";
    $("#roll-name").textContent = "Ready to roll";
    $("#roll-name").className = "roll-name";
    $("#roll-name").style.backgroundImage = "";
    $("#roll-tier").textContent = "Press ROLL to discover your first aura";
    $("#roll-odds").textContent = "";
    $("#btn-equip-last").disabled = true;
    setOrb($("#orb"), A.list[0]);
  }

  function logout() {
    var id = currentUser;
    switchUser(null);
    closeLogin();
    toast("Logged out. Your ID " + id + " logs you back in.");
  }

  function manualSave() {
    save();
    var btn = $("#btn-save");
    btn.textContent = "✅ Saved";
    setTimeout(function () { btn.textContent = "💾 Save"; }, 1500);
    toast("Game saved" + (currentUser ? " for " + (accountName(currentUser) || "ID " + currentUser) : ""));
  }

  /* Fingerprint for save codes, so a hand-edited code is refused on import. */
  function codeSum(body) {
    var h1 = 0x811c9dc5, h2 = 0x9e3779b9, text = "aura-realms-save:" + body;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul((h2 ^ c) >>> 0, 2246822519) >>> 0;
      h2 = ((h2 << 13) | (h2 >>> 19)) >>> 0;
    }
    return ("0000000" + h1.toString(16)).slice(-8) + ("0000000" + h2.toString(16)).slice(-8);
  }

  function exportSave() {
    save();
    var body = btoa(unescape(encodeURIComponent(JSON.stringify(S))));
    var code = "AR2." + body + "." + codeSum(body);
    var ta = $("#save-code");
    ta.value = code;
    ta.select();
    try { document.execCommand("copy"); toast("Save code copied to clipboard"); } catch (e) { toast("Save code ready: copy it from the box"); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).catch(function () { /* ignore */ });
  }

  function importSave() {
    var code = $("#save-code").value.replace(/\s+/g, ""), body;
    if (code.indexOf("AR2.") === 0) {
      var dot = code.lastIndexOf(".");
      body = code.slice(4, dot);
      if (dot <= 4 || codeSum(body) !== code.slice(dot + 1)) { loginError(ERR.ACCOUNT, "That save code was changed or is broken, so it can't be imported."); return; }
    } else if (code.indexOf("AR1.") === 0) {
      /* Codes from before fingerprints can't be checked, so only an admin may import them. */
      if (!adminUnlocked) { loginError(ERR.ACCOUNT, "That's an old save code. Unlock admin to import it, or export a new one."); return; }
      body = code.slice(4);
    } else {
      loginError(ERR.ACCOUNT, "That is not a valid save code.");
      return;
    }
    try {
      var json = decodeURIComponent(escape(atob(body)));
      var data = JSON.parse(json);
      if (!data || typeof data !== "object" || typeof data.rolls !== "number") throw new Error("bad");
      if (!confirm("Import this save? It will replace the current progress for " + (currentUser ? accountName(currentUser) || currentUser : "guest") + ".")) return;
      if (battle && !battle.over) forfeit();
      S = hydrate(data);
      save();
      resetRollDisplay();
      renderAll();
      closeLogin();
      toast("Save imported");
    } catch (e) {
      loginError(ERR.ACCOUNT, "Could not read that save code.");
    }
  }

  /* ---------- Admin panel: coins, luck and deleting auras on any player's online account (password locked) ---------- */

  /* The admin password, stored only as a PBKDF2 hash so the game's code doesn't reveal it. The account
     server keeps its own scrypt hash of the same password (netlify/functions/account.mjs). To change it,
     update both; for this one run
     node -e "const c=require('crypto'),s=c.randomBytes(16).toString('hex');console.log(s,c.pbkdf2Sync('NEW PASSWORD',Buffer.from(s,'hex'),150000,32,'sha256').toString('hex'))" */
  var ADMIN_PW = { salt: "5dbb466384fd7561529dc0f640552297", iterations: 150000, hash: "f6db0a3506768f23d93631b1be667437e07e602dbbe80ef3da3edb444fb70a47" };
  var adminUnlocked = false;
  var aaKey = "";      /* the admin password, kept only while admin is unlocked */
  var ADMIN_IDLE_MS = 5 * 60 * 1000; /* admin locks itself after this long without being used */
  var adminIdleTimer = null;

  /* Note admin activity, restarting the auto-lock countdown. */
  function adminTouched() {
    clearTimeout(adminIdleTimer);
    if (adminUnlocked) adminIdleTimer = setTimeout(function () { aaRelock("🔒 Locked after 5 minutes without admin use."); }, ADMIN_IDLE_MS);
  }
  var aaAccounts = []; /* the last account listing, for names in messages */

  function aaPrint(text) {
    var out = $("#aa-out");
    var line = document.createElement("div");
    line.textContent = text;
    out.appendChild(line);
    while (out.childNodes.length > 40) out.removeChild(out.firstChild);
    out.scrollTop = out.scrollHeight;
  }

  /* "Name (ID)" for an account from the last listing, or just the ID. */
  function aaLabel(id) {
    var a = aaAccounts.filter(function (x) { return x.id === id; })[0];
    return a ? a.name + " (" + id + ")" : "ID " + id;
  }

  /* Send one admin command. Resolves the reply data, or null after printing the error. */
  function accountAdmin(op, fields) {
    var key = aaKey;
    if (!key) { aaPrint("⚠️ Error 98: Admin is locked. Type the admin password and press Unlock."); return Promise.resolve(null); }
    adminTouched();
    if (Cloud.state === "missing") { aaPrint("⚠️ Error 404: Online accounts aren't set up on this site, so there are no accounts to change."); return Promise.resolve(null); }
    return cloudCall("admin", Object.assign({ key: key, op: op }, fields || {})).then(function (r) {
      if (r.status === 200) return r.data;
      aaPrint("⚠️ Error " + (r.data.code || ERR.ACCOUNT) + ": " + (r.data.error || "That didn't work."));
      return null;
    }, function (e) {
      aaPrint("⚠️ Error 404: " + (e && e.missing ? "Online accounts aren't set up on this site." : "Can't reach the account server."));
      return null;
    });
  }

  /* The 7-digit ID typed in the panel, or null after saying what's wrong. */
  function aaTargetId() {
    var id = $("#aa-id").value.trim();
    if (/^\d{7}$/.test(id)) return id;
    aaPrint("⚠️ Error 98: Pick a player in the list, or type their 7-digit ID.");
    return null;
  }

  /* After a change: reload this device's account if it was touched, and refresh the listing. */
  function aaChanged(touchedMine) {
    if (touchedMine) syncAccount();
    if (aaKey) aaList(true);
  }

  function aaShowWho() {
    var id = $("#aa-id").value.trim();
    var a = aaAccounts.filter(function (x) { return x.id === id; })[0];
    $("#aa-who").textContent = a ? a.name + " · " + fmt(a.auras) + " auras · " + fmt(a.coins) + " coins" : "";
    document.querySelectorAll("#aa-accounts tbody tr").forEach(function (tr) { tr.classList.toggle("on", tr.dataset.id === id); });
  }

  /* True when `pw` is the admin password, checked against ADMIN_PW in this browser. */
  function checkAdminPassword(pw) {
    var subtle = window.crypto && window.crypto.subtle;
    if (!subtle || !window.TextEncoder) return Promise.resolve(false);
    var salt = new Uint8Array(ADMIN_PW.salt.match(/../g).map(function (b) { return parseInt(b, 16); }));
    return subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]).then(function (k) {
      return subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: ADMIN_PW.iterations }, k, 256);
    }).then(function (bits) {
      return Array.prototype.map.call(new Uint8Array(bits), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("") === ADMIN_PW.hash;
    }, function () { return false; });
  }

  /* Unlock the console and the player panel. The account server is asked too, in case the site set
     its own ADMIN_KEY in Netlify. Resolves true when the password was right. */
  function unlockAdmin(key) {
    return checkAdminPassword(key).then(function (ok) {
      if (ok || Cloud.state === "missing") return ok;
      return cloudCall("admin", { key: key, op: "list" }).then(function (r) { return r.status === 200; }, function () { return false; });
    }).then(function (ok) {
      if (!ok) return new Promise(function (resolve) { setTimeout(function () { resolve(false); }, 400); }); /* slows down guessing */
      adminUnlocked = true;
      aaKey = key;
      adminTouched();
      $("#aa-lock").classList.add("hidden");
      $("#aa-lock-msg").textContent = "";
      $("#admin-area").classList.remove("hidden");
      renderChat();
      aaList(true).then(function (listed) {
        $("#aa-panel").classList.toggle("hidden", !listed);
        if (listed) aaPrint(aaAccounts.length + " player account" + (aaAccounts.length === 1 ? "" : "s") + ". Click one to pick them.");
      });
      return true;
    });
  }

  function aaUnlock(e) {
    e.preventDefault();
    var key = $("#aa-key").value;
    if (!key) { $("#aa-lock-msg").textContent = "⚠️ Error 98: Type the admin password first."; return; }
    $("#aa-unlock").disabled = true;
    unlockAdmin(key).then(function (ok) {
      $("#aa-unlock").disabled = false;
      $("#aa-key").value = "";
      if (!ok) $("#aa-lock-msg").textContent = "⚠️ Error 98: Wrong admin password.";
    });
  }

  function aaRelock(msg) {
    adminUnlocked = false;
    aaKey = "";
    clearTimeout(adminIdleTimer);
    $("#admin-in").value = "";
    aaAccounts = [];
    $("#aa-accounts").innerHTML = "";
    $("#aa-id").value = "";
    $("#aa-who").textContent = "";
    $("#aa-out").innerHTML = "";
    $("#aa-panel").classList.add("hidden");
    $("#admin-area").classList.add("hidden");
    $("#aa-lock").classList.remove("hidden");
    $("#aa-lock-msg").textContent = msg || "🔒 Locked.";
    renderChat();
  }

  function aaList(quiet) {
    return accountAdmin("list").then(function (d) {
      if (!d) return false;
      aaAccounts = d.accounts;
      var box = $("#aa-accounts");
      box.innerHTML = "";
      var table = document.createElement("table");
      table.innerHTML = "<thead><tr><th>ID</th><th>Name</th><th>Auras</th><th>Coins</th><th>Luck</th><th>Rolls</th></tr></thead>";
      var body = document.createElement("tbody");
      d.accounts.forEach(function (a) {
        var tr = document.createElement("tr");
        tr.dataset.id = a.id;
        [a.id, a.name, fmt(a.auras), fmt(a.coins), "x" + a.luck.toLocaleString("en-US"), fmt(a.rolls)].forEach(function (v) {
          var td = document.createElement("td");
          td.textContent = v;
          tr.appendChild(td);
        });
        tr.addEventListener("click", function () { $("#aa-id").value = a.id; aaShowWho(); });
        body.appendChild(tr);
      });
      table.appendChild(body);
      box.appendChild(table);
      if (!quiet) aaPrint(d.accounts.length + " online account" + (d.accounts.length === 1 ? "" : "s") + ". Click one to pick it.");
      aaShowWho();
      return true;
    });
  }

  function aaErase() {
    var id = aaTargetId();
    if (!id) return;
    var name = $("#aa-aura").value.trim(), aura = null;
    if (name) {
      aura = findAura(name);
      if (!aura) { aaPrint("⚠️ Error 98: No aura matches \"" + name + "\"."); return; }
    }
    if (!confirm((aura ? "Delete " + aura.name + " (and its shiny form)" : "Delete EVERY aura") + " from " + aaLabel(id) + "? This can't be undone.")) return;
    accountAdmin("erase", { id: id, aura: aura ? aura.id : null }).then(function (d) {
      if (!d) return;
      aaPrint("🗑️ Deleted " + fmt(d.result) + " aura" + (d.result === 1 ? "" : "s") + (aura ? " (" + aura.name + ")" : "") + " from " + d.account.name + " (" + id + "). " + fmt(d.account.auras) + " left.");
      aaChanged(id === currentUser);
    });
  }

  function aaAddCoins() {
    var id = aaTargetId();
    if (!id) return;
    var n = Math.trunc(Number($("#aa-coins").value));
    if (!n) { aaPrint("⚠️ Error 98: Enter how many coins to add."); return; }
    accountAdmin("coins", { id: id, amount: n }).then(function (d) {
      if (!d) return;
      aaPrint("🪙 " + (n > 0 ? "Added " + fmt(n) + " coins to " : "Took " + fmt(-n) + " coins from ") + d.account.name + " (" + id + "). They have " + fmt(d.result) + " now.");
      aaChanged(id === currentUser);
    });
  }

  function aaAddLuck() {
    var id = aaTargetId();
    if (!id) return;
    var mult = Number($("#aa-luck").value), rolls = Math.trunc(Number($("#aa-luck-rolls").value));
    if (!(mult > 1)) { aaPrint("⚠️ Error 98: Enter a luck multiplier above 1."); return; }
    if (!(rolls >= 1)) { aaPrint("⚠️ Error 98: Enter how many rolls the luck lasts."); return; }
    accountAdmin("luck", { id: id, mult: mult, rolls: rolls }).then(function (d) {
      if (!d) return;
      aaPrint("🍀 Gave " + d.account.name + " (" + id + ") x" + mult.toLocaleString("en-US") + " luck for " + fmt(rolls) + " roll" + (rolls === 1 ? "" : "s") + ".");
      aaChanged(id === currentUser);
    });
  }

  function aaMute(unmute) {
    var id = aaTargetId();
    if (!id) return;
    var minutes = Math.max(0, Math.floor(Number($("#aa-mute-min").value) || 0));
    accountAdmin(unmute ? "chatUnmute" : "chatMute", { id: id, minutes: minutes }).then(function (d) {
      if (!d) return;
      aaPrint(unmute ? "💬 " + d.name + " (" + id + ") can chat again." : "🔇 Muted " + d.name + " (" + id + ") " + d.text + ". They see Error 108 if they try to chat.");
    });
  }

  function aaMuted() {
    accountAdmin("chatMuted").then(function (d) {
      if (!d) return;
      if (!d.muted.length) { aaPrint("💬 Nobody is muted."); return; }
      d.muted.forEach(function (m) { aaPrint("🔇 " + m.name + " (" + m.id + ") is muted " + m.text + "."); });
    });
  }

  function aaChatClear() {
    if (!confirm("Delete every message in the global chat? This can't be undone.")) return;
    accountAdmin("chatClear").then(function (d) {
      if (!d) return;
      aaPrint("💬 The chat is empty now.");
      chatSchedule(100);
    });
  }

  function aaEraseAll() {
    var id = aaTargetId();
    if (!id) return;
    if (!confirm("Delete EVERY aura on EVERY online account except " + aaLabel(id) + "? This can't be undone.")) return;
    accountAdmin("eraseAll", { except: [id] }).then(function (d) {
      if (!d) return;
      aaPrint("🗑️ Deleted " + fmt(d.removed) + " auras on " + fmt(d.accounts) + " account" + (d.accounts === 1 ? "" : "s") + ". Kept " + aaLabel(id) + ".");
      aaChanged(!!currentUser && currentUser !== id);
    });
  }

  /* End every player's active luck boosts. Players who are rolling right now get it within a few seconds. */
  function aaResetLuck() {
    if (!confirm("Reset the luck of EVERY player to x1? All active luck boosts end right away.")) return;
    accountAdmin("resetLuck").then(function (d) {
      if (!d) return;
      aaPrint("🍀 Reset everyone's luck to x1. " + fmt(d.cleared) + " of " + fmt(d.accounts) + " account" + (d.accounts === 1 ? "" : "s") + " had luck" + (d.playing ? "; " + fmt(d.playing) + (d.playing === 1 ? " player is" : " players are") + " rolling right now and will get it within a few seconds." : "."));
      aaChanged(true);
    });
  }

  /* Reset every other player's account to a brand new save, keeping the one logged in here. */
  function aaDetonate() {
    var me = currentUser, m = accountMeta(me);
    if (!m || !m.cloud) { aaPrint("⚠️ Error 98: Log in to your own online account first, so Detonate knows which account to keep."); return; }
    var others = aaAccounts.filter(function (a) { return a.id !== me; }).length;
    var mine = (accountName(me) || "you") + " (" + me + ")";
    var typed = prompt("💥 DETONATE erases ALL progress on every other player's account" + (aaAccounts.length ? " (" + others + " account" + (others === 1 ? "" : "s") + ")" : "") + ". Only your account, " + mine + ", is kept. This can't be undone.\n\nType DETONATE to confirm.");
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== "DETONATE") { aaPrint("Detonate cancelled: you didn't type DETONATE."); return; }
    $("#aa-detonate").disabled = true;
    accountAdmin("detonate", { except: [me] }).then(function (d) {
      $("#aa-detonate").disabled = false;
      if (!d) return;
      screenFlash({ c1: "#f97316", c2: "#7f1d1d" }, 1);
      shake(3);
      Sound.boom(3);
      aaPrint("💥 DETONATED! Erased " + fmt(d.accounts) + " account" + (d.accounts === 1 ? "" : "s") + ". Kept " + mine + ".");
      aaChanged(false);
    });
  }

  /* Aura names for the erase box's suggestions, filled the first time it's used. */
  function fillAuraList() {
    var list = $("#aa-aura-list"), frag = document.createDocumentFragment();
    A.byRarityDesc.forEach(function (a) { var o = document.createElement("option"); o.value = a.name; frag.appendChild(o); });
    list.appendChild(frag);
  }

  /* ---------- Wiring ---------- */

  function switchTab(name) {
    document.querySelectorAll(".tab").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === name); });
    document.querySelectorAll(".panel").forEach(function (p) { p.classList.toggle("active", p.id === "tab-" + name); });
    if (name === "roll") FX.resize();
    if (name === "inventory") renderInventory();
    if (name === "tower") renderTower();
    if (name === "chat") { Chat.unread = 0; renderChat(); $("#chat-log").scrollTop = $("#chat-log").scrollHeight; chatSchedule(50); }
  }

  $("#tabs").addEventListener("click", function (e) {
    var b = e.target.closest(".tab");
    if (b) switchTab(b.dataset.tab);
  });

  $("#btn-roll").addEventListener("click", function () { requestRoll(); });
  $("#btn-auto").addEventListener("click", function () {
    if (!S.autoUnlocked) { toast("Unlock Auto Roll in the Shop (" + fmt(AUTO_UNLOCK_COST) + " coins)", "bad"); return; }
    autoOn = !autoOn;
    renderAll();
  });
  $("#btn-equip-last").addEventListener("click", function () { if (S.lastRoll !== null) equip(S.lastRoll, !!S.lastShiny); });
  $("#btn-heal").addEventListener("click", function () { healInBattle(); });
  $("#btn-flee").addEventListener("click", forfeit);
  $("#set-sound").addEventListener("change", function (e) { S.settings.sound = e.target.checked; save(); });
  $("#set-skip").addEventListener("change", function (e) { S.settings.skipCutscenes = e.target.checked; save(); });
  $("#set-skipanims").addEventListener("change", function (e) { setSkipAnims(e.target.checked); });
  $("#btn-skip-anim").addEventListener("click", function () {
    /* Toggles the setting and, in either state, stops anything playing right now. */
    setSkipAnims(!S.settings.skipAnims);
    toast(S.settings.skipAnims ? "⏩ Animations off — they're skipped now" : "▶️ Animations back on", "gold");
  });
  renderSkipAnimBtn();
  /* ---------- Updates: a tab left open for days keeps running the old game (no chat, old moves...). Every few
     minutes, and whenever the player comes back to the tab, the game asks the site for its newest page; if
     that has a higher Version number it offers to update, and updates by itself when the player returns. ---------- */
  var RUNNING_VERSION = (function () { var m = /Version (\d+)/.exec($("#game-version").textContent); return m ? Number(m[1]) : 0; })();
  var newerVersion = 0;
  function checkForUpdate() {
    if (!RUNNING_VERSION || !window.fetch || location.protocol === "file:") return Promise.resolve(0);
    return fetch(location.pathname + "?version-check=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.text() : ""; })
      .then(function (html) {
        var m = /id="game-version">Version (\d+)</.exec(html), v = m ? Number(m[1]) : 0;
        if (v > RUNNING_VERSION) {
          newerVersion = v;
          $("#update-text").textContent = "🔄 Version " + v + " of the game is out! You have Version " + RUNNING_VERSION + ".";
          $("#update-banner").classList.remove("hidden");
        }
        return v > RUNNING_VERSION ? v : 0;
      }, function () { return 0; });
  }
  /* Safe to reload by itself: nothing is being played out right now. */
  function idleForUpdate() { return !busy && !CS.running && !(battle && !battle.over) && PvP.status === "idle"; }
  function applyUpdate() {
    save();
    pushSave(true);
    releaseLease();
    setTimeout(function () { location.reload(); }, 150);
  }
  $("#update-now").addEventListener("click", applyUpdate);
  /* ---------- Human check: a simple self-contained captcha shown before the game, once per visit. Not meant to
     stop clever bots, just a friendly "prove you're a person" gate. Skipped for automated tests. ---------- */
  (function captchaGate() {
    var gate = $("#captcha");
    if (!gate) return;
    var passed = false;
    try { passed = sessionStorage.getItem("aura-captcha-ok") === "1"; } catch (e) { /* ignore */ }
    if (navigator.webdriver || passed) { gate.classList.add("hidden"); return; }
    var canvas = $("#captcha-canvas"), cx = canvas.getContext("2d"), input = $("#captcha-input");
    var chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; /* no I, O, L, 0, 1 — too easy to mix up */
    var answer = "";
    function make() {
      answer = "";
      for (var i = 0; i < 5; i++) answer += chars.charAt(Math.floor(Math.random() * chars.length));
      var w = canvas.width, h = canvas.height;
      cx.clearRect(0, 0, w, h);
      cx.fillStyle = "#0d0b1a"; cx.fillRect(0, 0, w, h);
      /* speckle + wavy line noise so it is not plain text */
      for (var d = 0; d < 60; d++) { cx.fillStyle = "rgba(167,139,250," + (0.1 + Math.random() * 0.3) + ")"; cx.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      for (var ln = 0; ln < 3; ln++) {
        cx.strokeStyle = ln % 2 ? "rgba(244,114,182,.5)" : "rgba(96,165,250,.5)"; cx.lineWidth = 2; cx.beginPath();
        for (var x = 0; x <= w; x += 10) { var y = h / 2 + Math.sin(x * 0.05 + ln * 2) * 18 + (Math.random() - 0.5) * 8; if (x === 0) cx.moveTo(x, y); else cx.lineTo(x, y); }
        cx.stroke();
      }
      /* the characters, each with its own tilt, size, wavy baseline and gradient */
      var cols = [["#c4b5fd", "#8b5cf6"], ["#f0abfc", "#db2777"], ["#93c5fd", "#2563eb"], ["#fde68a", "#f59e0b"], ["#86efac", "#16a34a"]];
      for (var c = 0; c < answer.length; c++) {
        cx.save();
        var px = 30 + c * ((w - 50) / answer.length), py = h / 2 + Math.sin(c * 1.3) * 10;
        cx.translate(px, py); cx.rotate((Math.random() - 0.5) * 0.6); cx.scale(1, 1 + (Math.random() - 0.5) * 0.25);
        var g = cx.createLinearGradient(0, -24, 0, 24), col = cols[c % cols.length];
        g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
        cx.fillStyle = g; cx.font = "900 " + (34 + Math.floor(Math.random() * 10)) + "px 'Cinzel', Georgia, serif";
        cx.textAlign = "center"; cx.textBaseline = "middle"; cx.shadowColor = col[0]; cx.shadowBlur = 8;
        cx.fillText(answer.charAt(c), 0, 0);
        cx.restore();
      }
      input.value = "";
    }
    function check() {
      if (input.value.trim().toUpperCase() === answer) {
        try { sessionStorage.setItem("aura-captcha-ok", "1"); } catch (e) { /* ignore */ }
        gate.classList.add("done");
        setTimeout(function () { gate.classList.add("hidden"); }, 400);
      } else {
        make();
        $("#captcha-error").textContent = "That's not quite right — try the new code.";
        input.classList.remove("wrong"); void input.offsetWidth; input.classList.add("wrong");
      }
    }
    make();
    $("#captcha-refresh").addEventListener("click", function () { make(); $("#captcha-error").textContent = ""; });
    $("#captcha-form").addEventListener("submit", function (e) { e.preventDefault(); check(); });
    setTimeout(function () { input.focus(); }, 100);
  })();

  setTimeout(checkForUpdate, 8000);
  setInterval(function () { if (document.visibilityState === "visible") checkForUpdate(); }, 180000);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    checkForUpdate().then(function (v) { if (v && idleForUpdate()) applyUpdate(); });
  });

  $("#inv-search").addEventListener("input", function () { inventoryShown = INVENTORY_PAGE; renderInventory(); });
  $("#inv-more").addEventListener("click", function () { inventoryShown += INVENTORY_PAGE; renderInventory(); });
  $("#gift-form").addEventListener("submit", function (e) { e.preventDefault(); giftSubmit(); });
  $("#btn-gift-coins").addEventListener("click", openGiftCoins);
  $("#btn-sell-dupes").addEventListener("click", sellAllDuplicates);
  $("#gift-close").addEventListener("click", closeGift);
  $("#doubloon-close").addEventListener("click", closeDoubloonShop);
  $("#doubloon-modal").addEventListener("click", function (e) { if (e.target === e.currentTarget) closeDoubloonShop(); });
  $("#gift-modal").addEventListener("click", function (e) { if (e.target === e.currentTarget) closeGift(); });
  ["#gift-to", "#gift-count"].forEach(function (sel) {
    $(sel).addEventListener("input", function () { if (giftView && giftView.step === "confirm") setGiftStep("who"); });
  });
    $("#buy-amount").addEventListener("click", function (e) {
    var b = e.target.closest("[data-qty]");
    if (!b) return;
    S.settings.buyAmount = b.dataset.qty === "max" ? "max" : Number(b.dataset.qty);
    save();
    renderShop();
  });
  $("#use-amount").addEventListener("click", function (e) {
    var b = e.target.closest("[data-qty]");
    if (!b) return;
    S.settings.useAmount = b.dataset.qty === "max" ? "max" : Number(b.dataset.qty);
    save();
    renderQuickbar();
  });
  $("#btn-reset").addEventListener("click", function () {
    if (!confirm("Reset all progress? This cannot be undone.")) return;
    resetSave();
    toast("Progress reset");
  });
  $("#ability-aura").addEventListener("change", function (e) { abilitiesViewAura = Number(e.target.value); renderAbilities(); });
  $("#btn-daily").addEventListener("click", claimDaily);
  var brandClicks = 0;
  $(".brand").addEventListener("click", function () {
    brandClicks++;
    if (brandClicks >= 7 && !S.secretUnlocked) { S.secretUnlocked = true; save(); renderAll(); toast("🗝️ The shop whispers… something new under the counter.", "gold"); }
  });
  $("#btn-save").addEventListener("click", manualSave);
  $("#btn-login").addEventListener("click", openLogin);
  $("#login-close").addEventListener("click", closeLogin);
  $("#login-form").addEventListener("submit", submitLogin);
  $("#mode-new").addEventListener("click", function () { setLoginMode("new"); $("#login-error").textContent = ""; renderKnownAccounts(); });
  $("#mode-returning").addEventListener("click", function () { setLoginMode("returning"); $("#login-error").textContent = ""; renderKnownAccounts(); });
  $("#account-id").addEventListener("click", copyId);
  $("#btn-logout").addEventListener("click", logout);
  $("#btn-export").addEventListener("click", exportSave);
  $("#btn-import").addEventListener("click", importSave);
  $("#login-modal").addEventListener("click", function (e) { if (e.target === $("#login-modal")) closeLogin(); });
  $("#dual-ok").addEventListener("click", hideDualWarning);
  $("#aa-lock").addEventListener("submit", aaUnlock);
  $("#aa-relock").addEventListener("click", function () { aaRelock(); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && adminUnlocked) aaRelock("🔒 Locked because you left the page.");
  });
  $("#aa-erase").addEventListener("click", aaErase);
  $("#aa-add-coins").addEventListener("click", aaAddCoins);
  $("#aa-add-luck").addEventListener("click", aaAddLuck);
  $("#aa-erase-all").addEventListener("click", aaEraseAll);
  $("#aa-mute").addEventListener("click", function () { aaMute(false); });
  $("#aa-unmute").addEventListener("click", function () { aaMute(true); });
  $("#aa-muted").addEventListener("click", aaMuted);
  $("#aa-chat-clear").addEventListener("click", aaChatClear);
  $("#chat-form").addEventListener("submit", function (e) { e.preventDefault(); chatSend(); });
  window.addEventListener("online", function () { chatSchedule(100); });
  window.addEventListener("offline", function () { Chat.error = { chat: ERR.CHAT_WIFI }; renderChat(); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") chatSchedule(200); });
  renderChat();
  chatSchedule(1500);
  $("#aa-detonate").addEventListener("click", aaDetonate);
  $("#aa-reset-luck").addEventListener("click", aaResetLuck);
  $("#aa-id").addEventListener("input", aaShowWho);
  $("#aa-aura").addEventListener("focus", fillAuraList, { once: true });
  $("#btn-pvp-host").addEventListener("click", pvpHost);
  $("#btn-pvp-join").addEventListener("click", function () { pvpJoin($("#pvp-code").value.trim()); });
  $("#pvp-code").addEventListener("keydown", function (e) { if (e.key === "Enter") pvpJoin($("#pvp-code").value.trim()); });
  $("#btn-pvp-leave").addEventListener("click", function () { pvpLeave(); });
  $("#pvp-name").addEventListener("change", function (e) { S.playerName = e.target.value.trim().slice(0, 16); save(); });
  $("#admin-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var inp = $("#admin-in");
    runAdmin(inp.value);
    inp.value = "";
  });
  document.addEventListener("keydown", function (e) {
    var typing = document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA");
    if (e.code === "Space" && !e.repeat && !typing && $("#tab-roll").classList.contains("active")) {
      e.preventDefault();
      requestRoll();
    }
    if (e.key === "`" && !typing) {
      e.preventDefault();
      switchTab("stats");
      $(adminUnlocked ? "#admin-in" : "#aa-key").focus();
    }
  });
  window.addEventListener("beforeunload", function () { if (PvP.conn) pvpSend({ t: "forfeit" }); });

  buildIndex();
  resetRollDisplay();
  renderAccount();
  renderAll();
  syncAccount();

  /* Console hooks. */
  window.AuraRealms = {
    /* Without admin unlocked these hand out copies, so the browser console can't change the game. */
    state: function () { return adminUnlocked ? S : JSON.parse(JSON.stringify(S)); },
    preview: function (name, shiny) { var a = findAura(name); if (a) playCutscene(a, true, !!shiny); },
    reveals: REVEALS,
    revealTimeline: function (name, shiny) { var a = findAura(name); return a ? revealTimeline(a, !!shiny) : null; },
    admin: runAdmin,
    unlockAdmin: unlockAdmin,
    engine: Engine,
    kits: K,
    bfx: BFX,
    ufx: UFX,
    pvp: function () { return { status: PvP.status, role: PvP.role, code: PvP.code }; },
    battle: function () { return adminUnlocked || !battle ? battle : JSON.parse(JSON.stringify(battle)); }
  };
})();
