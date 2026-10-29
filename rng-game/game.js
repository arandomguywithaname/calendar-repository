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
  var ERR = { DUAL: 145, NETWORK: 404, POTION_BUY: 435, POTION_USE: 102, ACCOUNT: 98 };
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
    return POTION_ORDER.filter(function (k) { return !POTIONS[k].daily && !POTIONS[k].collector && COLLECTION_SKIP.indexOf(k) < 0; });
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
      history: [],
      stats: { best: null, bestShiny: false, shinies: 0, won: 0, lost: 0, pvpWon: 0, pvpLost: 0, earned: 0, streak: 0, bestStreak: 0, cutscenes: 0 },
      settings: { sound: true, skipCutscenes: false, buyAmount: 1 }
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
  }

  function renderEffects() {
    var box = $("#active-effects");
    box.innerHTML = "";
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

  function canRoll() { return !busy && Date.now() >= cooldownUntil && !battle && !CS.running; }

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

  function shake(level) {
    if (!level) return;
    document.body.classList.remove("shake-1", "shake-2", "shake-3");
    void document.body.offsetWidth;
    document.body.classList.add("shake-" + level);
    setTimeout(function () { document.body.classList.remove("shake-" + level); }, 1000);
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
    var cutscene = ti >= 3 && !S.settings.skipCutscenes;
    if (cutscene) S.stats.cutscenes++;
    save();

    FX.clear();
    setGlow(null, 0);
    $("#roll-banner").className = "roll-banner";
    var spinMs = ti <= 1 ? (hasteActive() ? 250 : 450) : ti === 2 ? 1100 : ti === 3 ? 1600 : 2200;
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
      S.potions[k] = (S.potions[k] || 0) + r.potions[k];
      lines.push(POTIONS[k].icon + " " + POTIONS[k].name + (r.potions[k] > 1 ? " x" + r.potions[k] : ""));
    });
    Sound.win();
    toast("🎁 Daily gift day " + r.day + ": " + lines.join(" · "), "gold");
    FX.burst(["#fde68a", "#f59e0b", "#fff7ed", "#a78bfa"], 90, 0.7);
    save();
    renderAll();
  }

  setInterval(function () { if (!dailyReady()) renderDaily(); }, 30000);

  /* ---------- Potions ---------- */

  function usePotion(key) {
    var p = POTIONS[key];
    if (!p) return;
    if (!S.potions[key]) { errorToast(ERR.POTION_USE, "You have no " + p.name + " left."); return; }
    var note = "";
    if (p.kind === "luck") {
      S.luckEffects.push({ mult: p.mult, rolls: p.rolls });
    } else if (p.kind === "floor") {
      S.floorEffects.push({ min: p.min, rolls: p.rolls });
    } else if (p.kind === "shiny") {
      S.shinyEffects.push({ mult: p.mult, rolls: p.rolls });
    } else if (p.kind === "gold") {
      S.goldEffects.push({ mult: p.mult, rolls: p.rolls });
    } else if (p.kind === "haste") {
      var active = hasteActive();
      if (active && p.div < S.hasteDiv) { errorToast(ERR.POTION_USE, "A stronger speed potion is already active."); return; }
      S.hasteUntil = (active && p.div === S.hasteDiv ? S.hasteUntil : Date.now()) + p.seconds * 1000;
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
    } else if (p.kind === "heal") {
      if (!battle || battle.over || view.pvp) { errorToast(ERR.POTION_USE, "Healing potions are used during a bot fight."); return; }
      healInBattle(key);
      return;
    } else if (p.kind === "mystery") {
      var won = rollMysteryPotion(p);
      S.potions[key]--;
      S.potions[won] = (S.potions[won] || 0) + 1;
      Sound.buy();
      toast(p.icon + " The " + p.name + " became " + POTIONS[won].icon + " " + POTIONS[won].name + "!", "gold");
      save();
      renderAll();
      return;
    }
    S.potions[key]--;
    Sound.buy();
    toast(p.icon + " " + p.name + " used" + note);
    save();
    renderAll();
  }

  /* Mystery potion odds: mostly cheap potions, with a small shot at the great ones. The mystery potion's
     `minCost` and `maxCost` bound which potions it can become. */
  function rollMysteryPotion(m) {
    var pool = POTION_ORDER.filter(function (k) { var q = POTIONS[k]; return q.kind !== "mystery" && !q.daily && !q.secret && !q.collector && q.cost >= (m.minCost || 0) && q.cost <= (m.maxCost || Infinity); });
    var weights = pool.map(function (k) { return 1 / Math.sqrt(POTIONS[k].cost + 100); });
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
    return pool[0];
  }

  /* How many of a potion one Buy click gets: the chosen Buy amount, or for Max as many as the coins cover. */
  function buyCount(p) {
    var amt = S.settings.buyAmount;
    if (amt === "max") return p.cost > 0 ? Math.floor(S.coins / p.cost) : 1;
    return BUY_AMOUNTS.indexOf(amt) >= 0 ? amt : 1;
  }

  function buyPotion(key) {
    var p = POTIONS[key];
    if (!p) return;
    if (p.collector && !collectionDone()) return;
    var n = buyCount(p), total = n * p.cost;
    if (n < 1 || S.coins < total) { errorToast(ERR.POTION_BUY, "Not enough coins for " + (n > 1 ? fmt(n) + " x " : "") + p.name + " (" + fmt(n > 1 ? total : p.cost) + " needed)."); return; }
    var wasDone = collectionDone();
    S.coins -= total;
    S.potions[key] = (S.potions[key] || 0) + n;
    S.bought[key] = (S.bought[key] || 0) + n;
    Sound.buy();
    toast("Bought " + (n > 1 ? fmt(n) + " x " + p.name + " for " + fmt(total) + " coins" : p.name));
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
      if (p.daily) return;
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
      var n = buyCount(p);
      if (S.settings.buyAmount !== 1) {
        var total = document.createElement("div");
        total.className = "card-sub buy-total";
        total.textContent = n > 0 ? "x" + fmt(n) + " = " + fmt(n * p.cost) + " coins" : "Not enough coins for one yet";
        card.appendChild(total);
      }
      var actions = document.createElement("div");
      actions.className = "actions";
      var buy = document.createElement("button");
      buy.className = "btn small primary" + (n < 1 || S.coins < n * p.cost ? " cant-afford" : "");
      buy.textContent = S.settings.buyAmount === 1 ? "Buy" : S.settings.buyAmount === "max" && n < 1 ? "Buy max" : "Buy x" + fmt(n);
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

  function renderInventory() {
    var grid = $("#inventory-grid");
    grid.innerHTML = "";
    var entries = [];
    ownedIds().forEach(function (id) {
      if (owns(id, false)) entries.push({ id: id, shiny: false, n: S.inventory[id] });
      if (owns(id, true)) entries.push({ id: id, shiny: true, n: S.shinyInventory[id] });
    });
    if (!entries.length) {
      grid.innerHTML = "<div class=\"empty-note\">Nothing yet. Roll to discover auras.</div>";
      return;
    }
    entries.sort(function (x, y) { return effRarity(A.byId(y.id), y.shiny) - effRarity(A.byId(x.id), x.shiny); });
    var eq = equippedAura(), eqShiny = equippedShiny();
    entries.forEach(function (en) {
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
      card.appendChild(actions);
      grid.appendChild(card);
    });
  }

  function equip(id, shiny) {
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
        ev.push({ type: "damage", who: who, target: other, amount: ab.flat, absorbed: 0, crit: false, blocked: false, executed: false, flat: true, flatName: ab.name, flatIcon: ab.icon, hpA: b.a.hp, hpB: b.b.hp });
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
      snap: flatHitFx("#22d3ee", "#a5f3fc", "#ecfeff"),
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

    function play(arch, fromSide, toSide, c1, c2) {
      var def = LIB[arch] || LIB.strike;
      resize();
      var env = { from: rectOf(fromSide), to: rectOf(toSide), c1: c1 || "#f8fafc", c2: c2 || "#a78bfa" };
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
    var anim = null, raf = 0;
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
      snap: flatUltFx("#22d3ee", "#a5f3fc", "236,254,255", "34,211,238"),
      destiny: flatUltFx("#f59e0b", "#fde68a", "255,251,235", "251,191,36"),
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

    function play(arch, fromEl, toEl, aura, abilityName, userName) {
      var def = LIB[arch] || LIB.strike;
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      var fr = fromEl.getBoundingClientRect(), tr = toEl.getBoundingClientRect();
      var env = { w: canvas.width, h: canvas.height, cx: canvas.width / 2, cy: canvas.height / 2,
        from: { x: fr.left + fr.width / 2, y: fr.top + fr.height / 2 }, to: { x: tr.left + tr.width / 2, y: tr.top + tr.height / 2 },
        c1: aura.c1, c2: aura.c2, colors: aura.colors };
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
      ctx.save(); try { anim.def.draw(p, anim.env, anim.parts); } catch (e) { p = 1; } ctx.restore();
      if (p >= 1) { anim = null; el.classList.add("hidden"); ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
      raf = requestAnimationFrame(frame);
    }
    function clear() { anim = null; cancelAnimationFrame(raf); el.classList.add("hidden"); }
    return { play: play, clear: clear, LIB: LIB };
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
    var target = Engine.other(who);
    var f = battle[who];
    var aura = f.auraId !== null && f.auraId !== undefined ? A.byId(f.auraId) : null;
    var c1 = aura ? aura.c1 : "#f87171", c2 = aura ? aura.c2 : "#7f1d1d";
    var self = SELF_ARCHS[ab.arch];
    var pose = self ? "cast" : (ab.arch === "heavy" || ab.arch === "execute" ? "slam" : (who === "a" ? "lunge-right" : "lunge-left"));
    fighterPose(who, pose);
    $("#fighter-" + who).style.setProperty("--c1", c1);
    $("#fighter-" + who).classList.remove("flare"); void $("#fighter-" + who).offsetWidth; $("#fighter-" + who).classList.add("flare");
    abilityLabel(who, ab, c1);
    Sound.ability(ab.arch);
    var ultimate = aura && tierIndex(aura) >= 4;
    if (ultimate) {
      var udur = UFX.play(ab.arch, $("#visual-" + who), $("#visual-" + (self ? who : target)), aura, ab.name, f.name === "You" ? "You unleash" : f.name + " unleashes");
      var udef = UFX.LIB[ab.arch];
      var ushake = ab.arch === "burst" || ab.arch === "execute" ? 3 : (ab.arch === "heavy" || ab.arch === "stun" || ab.arch === "barrage" ? 2 : 1);
      setTimeout(function () { shake(ushake); }, udur * 0.4);
      if (ab.arch === "burst" || ab.arch === "execute" || ab.arch === "heavy") setTimeout(function () { Sound.boom(2); }, udur * 0.35);
      setTimeout(function () { BFX.play(ab.arch, who, self ? who : target, c1, c2); }, udur * 0.55);
      return udur + 120;
    }
    var dur = BFX.play(ab.arch, who, self ? who : target, c1, c2);
    var def = BFX.LIB[ab.arch];
    if (def && def.shake) setTimeout(function () { shake(def.shake); }, dur * 0.45);
    return dur + 80;
  }

  /* ---------- Battle UI ---------- */

  var battle = null;
  var view = { me: "a", pvp: false, animating: false, bot: null };
  var botTimer = null;

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
      $("#hp-" + side).style.width = Math.max(0, f.hp / f.maxHp * 100) + "%";
      $("#hptext-" + side).textContent = fmt(Math.max(0, f.hp)) + " / " + fmt(f.maxHp);
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
    $("#hp-a").className = "hpfill " + (view.me === "a" ? "player" : "bot");
    $("#hp-b").className = "hpfill " + (view.me === "b" ? "player" : "bot");
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
          flash(e.who, "healed");
          var rf = battle[e.who];
          floatText(e.who, (rf.reviveName || "Second Wind").toUpperCase(), "heal");
          Sound.heal();
          logLine((rf.reviveIcon || "🕊️") + " " + (isMe(e.who) ? (rf.reviveName || "Second Wind") + " saves you!" : sideName(e.who) + " refuses to fall!"), isMe(e.who) ? "you" : "them");
          setHP(e);
          delay = 700;
          break;
        case "end":
          delay = 200;
          break;
      }
      setTimeout(step, delay);
    }
    step();
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
        S.potions[key] = (S.potions[key] || 0) + cnt;
        adminPrint("Added " + cnt + " x " + POTIONS[key].name + ".");
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
      if (CS.running) { resolve(); return; }
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
  $("#buy-amount").addEventListener("click", function (e) {
    var b = e.target.closest("[data-qty]");
    if (!b) return;
    S.settings.buyAmount = b.dataset.qty === "max" ? "max" : Number(b.dataset.qty);
    save();
    renderShop();
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
