/* game.js — Aura Realms RNG: rolling, coins, potions, abilities, turn-based battles, PvP, cutscenes. */
(function () {
  "use strict";

  var A = window.AURAS;
  var K = window.KITS;
  var $ = function (s) { return document.querySelector(s); };
  var SAVE_BASE = "aura-realms-save-v2";
  var ACCOUNTS_KEY = "aura-realms-accounts";
  var SESSION_KEY = "aura-realms-session";
  var currentUser = null;
  function saveKey() { return currentUser ? SAVE_BASE + ":" + currentUser : SAVE_BASE; }
  var ROLL_COOLDOWN = 1000;
  var PEER_PREFIX = "aura-realms-v1-";
  var fmt = function (n) { return Math.floor(n).toLocaleString("en-US"); };

  /* ---------- Data ---------- */

  var POTIONS = {
    /* Luck */
    lucky:     { name: "Lucky Potion",      icon: "🍀", cost: 150,     group: "luck",   kind: "luck", mult: 2,     rolls: 20, desc: "x2 luck for 20 rolls" },
    clover:    { name: "Clover Brew",       icon: "☘️", cost: 500,     group: "luck",   kind: "luck", mult: 3,     rolls: 50, desc: "x3 luck for 50 rolls" },
    fortune:   { name: "Fortune Potion",    icon: "🧪", cost: 600,     group: "luck",   kind: "luck", mult: 5,     rolls: 15, desc: "x5 luck for 15 rolls" },
    heavenly:  { name: "Heavenly Potion",   icon: "✨", cost: 3000,    group: "luck",   kind: "luck", mult: 25,    rolls: 10, desc: "x25 luck for 10 rolls" },
    starlight: { name: "Starlight Elixir",  icon: "🌟", cost: 8000,    group: "luck",   kind: "luck", mult: 60,    rolls: 8,  desc: "x60 luck for 8 rolls" },
    godly:     { name: "Godly Potion",      icon: "👑", cost: 20000,   group: "luck",   kind: "luck", mult: 200,   rolls: 5,  desc: "x200 luck for 5 rolls" },
    voidess:   { name: "Void Essence",      icon: "🕳️", cost: 45000,   group: "luck",   kind: "luck", mult: 500,   rolls: 4,  desc: "x500 luck for 4 rolls" },
    zenith:    { name: "Zenith Potion",     icon: "🌌", cost: 100000,  group: "luck",   kind: "luck", mult: 1000,  rolls: 3,  desc: "x1000 luck for 3 rolls" },
    oblivion:  { name: "Oblivion Draught",  icon: "🌑", cost: 400000,  group: "luck",   kind: "luck", mult: 5000,  rolls: 2,  desc: "x5000 luck for 2 rolls" },
    infinity:  { name: "Infinity Serum",    icon: "♾️", cost: 2000000, group: "luck",   kind: "luck", mult: 25000, rolls: 1,  desc: "x25000 luck for a single roll. The best potion money can buy." },
    blessing:  { name: "Daily Blessing",    icon: "🎁", cost: 0,       group: "luck",   kind: "luck", mult: 50,    rolls: 1,  desc: "x50 luck for one roll. Only from the daily gift.", daily: true },
    magnet:    { name: "Rarity Magnet",     icon: "🧲", cost: 2500,    group: "luck",   kind: "floor", rolls: 5,  desc: "Your next 5 rolls can't be Common or Uncommon" },
    /* Coins and speed */
    gold:      { name: "Gold Potion",       icon: "💰", cost: 250,     group: "coins",  kind: "gold", mult: 2,  rolls: 30, desc: "x2 coins from rolls for 30 rolls" },
    midas:     { name: "Midas Tonic",       icon: "🏆", cost: 1200,    group: "coins",  kind: "gold", mult: 5,  rolls: 20, desc: "x5 coins from rolls for 20 rolls" },
    rush:      { name: "Golden Rush",       icon: "💎", cost: 3000,    group: "coins",  kind: "gold", mult: 10, rolls: 10, desc: "x10 coins from rolls for 10 rolls" },
    haste:     { name: "Haste Potion",      icon: "⚡", cost: 200,     group: "coins",  kind: "haste", div: 2, seconds: 60,  desc: "Roll cooldown halved for 60 seconds" },
    blitz:     { name: "Blitz Potion",      icon: "🌀", cost: 800,     group: "coins",  kind: "haste", div: 4, seconds: 120, desc: "Roll cooldown quartered for 2 minutes" },
    mystery:   { name: "Mystery Potion",    icon: "❓", cost: 1000,    group: "coins",  kind: "mystery", desc: "Turns into a random potion. Usually cheap, sometimes amazing." },
    /* Battle */
    heal:      { name: "Healing Potion",    icon: "❤️", cost: 100,     group: "battle", kind: "heal", pct: 0.4,  desc: "Restore 40% HP during a bot fight" },
    greatheal: { name: "Greater Healing",   icon: "💖", cost: 300,     group: "battle", kind: "heal", pct: 0.8,  desc: "Restore 80% HP during a bot fight" },
    strength:  { name: "Strength Potion",   icon: "💪", cost: 150,     group: "battle", kind: "strength", mult: 1.5, desc: "+50% damage in your next bot fight" },
    titan:     { name: "Titan's Brew",      icon: "🦾", cost: 500,     group: "battle", kind: "strength", mult: 2,   desc: "+100% damage in your next bot fight" },
    ironskin:  { name: "Iron Skin",         icon: "🛡️", cost: 400,     group: "battle", kind: "shield", pct: 0.3, desc: "Start your next bot fight with a shield worth 30% of your HP" },
    secondwind:{ name: "Second Wind",       icon: "🕊️", cost: 1500,    group: "battle", kind: "revive", pct: 0.4, desc: "Survive a killing blow once in your next bot fight and come back at 40% HP" }
  };
  var POTION_ORDER = Object.keys(POTIONS);
  var POTION_GROUPS = [["luck", "Luck potions"], ["coins", "Coins and speed"], ["battle", "Battle potions"]];

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
    { id: "omega",     name: "Omega Bot",      icon: "💀", power: 3000, reward: 15000, boss: true }
  ];

  var AUTO_UNLOCK_COST = 1000;
  var PVP_WIN_REWARD = 500;
  var PVP_LOSS_REWARD = 100;
  function trainingCost(level) { return Math.floor(50 * Math.pow(1.35, level)); }

  /* ---------- State ---------- */

  function defaultState() {
    return {
      coins: 100,
      rolls: 0,
      inventory: {},
      equipped: null,
      lastRoll: null,
      potions: {},
      luckEffects: [],
      goldEffects: [],
      floorRolls: 0,
      hasteUntil: 0,
      hasteDiv: 2,
      strengthMult: 1,
      shieldReady: 0,
      reviveReady: 0,
      daily: { last: 0, streak: 0, claims: 0 },
      training: 0,
      autoUnlocked: false,
      loadouts: {},
      playerName: "",
      botWins: {},
      history: [],
      stats: { best: null, won: 0, lost: 0, pvpWon: 0, pvpLost: 0, earned: 0, streak: 0, bestStreak: 0, cutscenes: 0 },
      settings: { sound: true, skipCutscenes: false }
    };
  }

  try { currentUser = localStorage.getItem(SESSION_KEY) || null; } catch (e) { currentUser = null; }
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
      if (!merged.loadouts || typeof merged.loadouts !== "object") merged.loadouts = {};
      merged.daily = Object.assign(defaultState().daily, saved.daily || {});
      if (!Array.isArray(merged.goldEffects)) merged.goldEffects = [];
      if (saved.goldRolls > 0) merged.goldEffects.push({ mult: 2, rolls: saved.goldRolls });
      if (saved.strengthReady) merged.strengthMult = Math.max(merged.strengthMult || 1, 1.5);
      delete merged.goldRolls;
      delete merged.strengthReady;
      return merged;
    } catch (e) {
      return base;
    }
  }

  function save() {
    try { localStorage.setItem(saveKey(), JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
  }

  /* ---------- Helpers ---------- */

  function toast(msg, cls) {
    var el = document.createElement("div");
    el.className = "toast" + (cls ? " " + cls : "");
    el.textContent = msg;
    $("#toasts").appendChild(el);
    setTimeout(function () { el.remove(); }, 2900);
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

  function equippedAura() {
    if (S.equipped === null || S.equipped === undefined) return null;
    if (!S.inventory[S.equipped]) return null;
    return A.byId(S.equipped);
  }

  function playerPower() {
    var aura = equippedAura();
    return (aura ? aura.power : 0) + S.training * 10;
  }

  /* Slot indices (0-5) of the chosen abilities for an aura. */
  function loadoutFor(aura) {
    var raw = S.loadouts[aura.id];
    var clean = Array.isArray(raw) ? raw.filter(function (i, pos) { return Number.isInteger(i) && i >= 0 && i < K.KIT_SIZE && raw.indexOf(i) === pos; }).slice(0, LOADOUT_SIZE) : [];
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

  function setOrb(el, aura) {
    el.style.setProperty("--c1", aura.c1);
    el.style.setProperty("--c2", aura.c2);
    var paint = el.querySelector(".orb-paint");
    if (paint) paint.style.background = fillStyle(aura);
    el.className = el.className.replace(/\b(tier|shine)-\S+/g, "").replace(/\s+/g, " ").trim() + " tier-" + aura.tier + " shine-" + shineLevel(aura);
  }

  function makeOrb(aura, cls) {
    var el = document.createElement("div");
    el.className = "orb " + (cls || "");
    el.innerHTML = "<div class=\"orb-fill\"><div class=\"orb-paint\"></div></div><div class=\"orb-core\"></div><div class=\"orb-gloss\"></div>";
    setOrb(el, aura);
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

  function setNameStyle(el, aura) {
    el.className = "roll-name t-" + aura.tier;
    el.style.backgroundImage = "";
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
    if (S.floorRolls > 0) {
      var fl = document.createElement("span");
      fl.className = "effect";
      fl.textContent = "🧲 Rare or better · " + S.floorRolls + " roll" + (S.floorRolls === 1 ? "" : "s");
      box.appendChild(fl);
    }
    if (hasteActive()) {
      var h = document.createElement("span");
      h.className = "effect haste";
      h.textContent = (S.hasteDiv >= 4 ? "🌀 Blitz" : "⚡ Haste") + " · " + Math.ceil((S.hasteUntil - Date.now()) / 1000) + "s";
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
      sh.textContent = "🛡️ Iron Skin ready";
      box.appendChild(sh);
    }
    if (S.reviveReady > 0) {
      var rv = document.createElement("span");
      rv.className = "effect strength";
      rv.textContent = "🕊️ Second Wind ready";
      box.appendChild(rv);
    }
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
    S.history.forEach(function (id) {
      var a = A.byId(id);
      var li = document.createElement("li");
      var name = document.createElement("span");
      name.textContent = a.name;
      var tier = document.createElement("span");
      tier.className = "tierlabel t-" + a.tier;
      tier.textContent = tierName(a);
      var odds = document.createElement("span");
      odds.className = "odds";
      odds.textContent = A.formatOdds(a.rarity);
      li.appendChild(makeSwatch(a)); li.appendChild(name); li.appendChild(tier); li.appendChild(odds);
      ul.appendChild(li);
    });
  }

  function renderAll() {
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

  var rareFloorList = null;
  function pickAura(luck, floor) {
    var list = A.byRarityDesc;
    for (var i = 0; i < list.length; i++) {
      if (floor && list[i].rarity < 1000) break;
      var p = Math.min(1, luck / list[i].rarity);
      if (Math.random() < p) return list[i];
    }
    if (floor) {
      if (!rareFloorList) rareFloorList = A.list.filter(function (a) { return a.rarity >= 1000 && a.rarity < 2000; });
      return rareFloorList[Math.floor(Math.random() * rareFloorList.length)];
    }
    return A.list[0];
  }

  function canRoll() { return !busy && Date.now() >= cooldownUntil && !battle && !CS.running; }

  function showAura(aura) {
    var orb = $("#orb");
    setOrb(orb, aura);
    orb.classList.remove("spinning", "pop");
    void orb.offsetWidth;
    orb.classList.add("pop");
    var nameEl = $("#roll-name");
    nameEl.textContent = aura.name;
    setNameStyle(nameEl, aura);
    $("#roll-tier").textContent = tierName(aura) + " · " + fmt(aura.power) + " power";
    $("#roll-odds").textContent = A.formatOdds(aura.rarity);
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
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
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
          ctx.arc(p.x, p.y, p.rad, 0, Math.PI * 2);
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
        ctx.arc(p.x, p.y, p.size * (0.4 + p.life * 0.6), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      if (parts.length || orbit.length || beams.on) raf = requestAnimationFrame(frame);
      else { running = false; ctx.clearRect(0, 0, canvas.width, canvas.height); }
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

  function showBanner(aura, ti) {
    var b = $("#roll-banner");
    b.className = "roll-banner";
    if (ti < 2) { b.textContent = ""; return; }
    b.textContent = "✦ " + tierName(aura) + " ✦";
    b.classList.add("t-" + aura.tier);
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
  function stageAmbient(aura) {
    var ti = tierIndex(aura);
    setGlow(aura, ti);
    FX.ambient(aura, ti);
    var b = $("#roll-banner");
    b.className = "roll-banner";
    if (ti >= 2) { b.textContent = "✦ " + tierName(aura) + " ✦"; b.classList.add("t-" + aura.tier, ti >= 4 ? "big" : "go"); }
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

  function revealEffects(aura, ti) {
    if (ti < 2) return;
    var power = ti === 2 ? 0.5 : ti === 3 ? 0.8 : ti >= 7 ? 1.4 : 1.1;
    screenFlash(aura, power);
    FX.burst(aura.colors, ti === 2 ? 50 : ti === 3 ? 130 : ti >= 7 ? 420 : 260, power);
    FX.ring(aura.c1, power);
    if (ti >= 4) { FX.ring(aura.colors[2] || aura.c2, power * 0.7); setTimeout(function () { FX.ring("#ffffff", power * 0.5); }, 180); }
    showBanner(aura, ti);
    setGlow(aura, ti);
    FX.ambient(aura, ti);
    shake(ti === 3 ? 1 : ti >= 7 ? 3 : ti >= 4 ? 2 : 0);
    if (ti >= 4) Sound.boom(ti - 4);
    else Sound.rare(ti - 2);
  }

  function doRoll(forced) {
    if (!canRoll()) return;
    busy = true;
    $("#btn-roll").disabled = true;
    Sound.roll();

    var aura = forced || pickAura(currentLuck(), S.floorRolls > 0);
    var ti = tierIndex(aura);

    S.rolls++;
    if (!forced) {
      S.luckEffects.forEach(function (e) { e.rolls--; });
      S.luckEffects = S.luckEffects.filter(function (e) { return e.rolls > 0; });
      if (S.floorRolls > 0) S.floorRolls--;
    }
    var mult = currentGoldMult();
    S.goldEffects.forEach(function (e) { e.rolls--; });
    S.goldEffects = S.goldEffects.filter(function (e) { return e.rolls > 0; });
    var coins = aura.coins * mult;
    addCoins(coins);
    S.inventory[aura.id] = (S.inventory[aura.id] || 0) + 1;
    S.lastRoll = aura.id;
    S.history.unshift(aura.id);
    if (S.history.length > 12) S.history.length = 12;
    if (S.stats.best === null || A.byId(S.stats.best).rarity < aura.rarity) S.stats.best = aura.id;
    if (equippedAura() === null) S.equipped = aura.id;
    if (aura.cutscene > 0) S.stats.cutscenes++;
    save();

    FX.clear();
    setGlow(null, 0);
    $("#roll-banner").className = "roll-banner";
    var spinMs = ti <= 1 ? (hasteActive() ? 250 : 450) : ti === 2 ? 1100 : ti === 3 ? 1600 : 2200;
    var stage = $("#roll-stage");
    runSpin(aura, ti, spinMs, function () {
      var finish = function () {
        stage.classList.remove("suspense");
        showAura(aura);
        revealEffects(aura, ti);
        toast("+" + fmt(coins) + " coins", "gold");
        renderAll();
        busy = false;
        cooldownUntil = Date.now() + rollCooldown();
        setTimeout(function () { $("#btn-roll").disabled = false; }, Math.max(0, cooldownUntil - Date.now()));
      };
      if (aura.cutscene > 0 && !S.settings.skipCutscenes) {
        /* A beat of suspense: the orb trembles and dims before the screen is taken over. */
        stage.classList.add("suspense");
        $("#roll-name").textContent = "…";
        $("#roll-name").className = "roll-name";
        setTimeout(function () { playCutscene(aura).then(finish); }, 650);
      } else {
        finish();
      }
    });
  }

  setInterval(function () {
    if (autoOn && canRoll()) doRoll();
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
    if (!p || !S.potions[key]) return;
    var note = "";
    if (p.kind === "luck") {
      S.luckEffects.push({ mult: p.mult, rolls: p.rolls });
    } else if (p.kind === "floor") {
      S.floorRolls += p.rolls;
    } else if (p.kind === "gold") {
      S.goldEffects.push({ mult: p.mult, rolls: p.rolls });
    } else if (p.kind === "haste") {
      var active = hasteActive();
      if (active && p.div < S.hasteDiv) { toast("A stronger speed potion is already active", "bad"); return; }
      S.hasteUntil = (active && p.div === S.hasteDiv ? S.hasteUntil : Date.now()) + p.seconds * 1000;
      S.hasteDiv = p.div;
    } else if (p.kind === "strength") {
      if (S.strengthMult >= p.mult) { toast("An equal or stronger damage boost is already waiting", "bad"); return; }
      S.strengthMult = p.mult;
    } else if (p.kind === "shield") {
      if (S.shieldReady > 0) { toast("Iron Skin is already waiting for your next fight", "bad"); return; }
      S.shieldReady = p.pct;
    } else if (p.kind === "revive") {
      if (S.reviveReady > 0) { toast("Second Wind is already waiting for your next fight", "bad"); return; }
      S.reviveReady = p.pct;
    } else if (p.kind === "heal") {
      if (!battle || battle.over || view.pvp) { toast("Healing potions are used during a bot fight", "bad"); return; }
      healInBattle(key);
      return;
    } else if (p.kind === "mystery") {
      var won = rollMysteryPotion();
      S.potions[key]--;
      S.potions[won] = (S.potions[won] || 0) + 1;
      Sound.buy();
      toast("❓ The Mystery Potion became " + POTIONS[won].icon + " " + POTIONS[won].name + "!", "gold");
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

  /* Mystery potion odds: mostly cheap potions, with a small shot at the great ones. */
  function rollMysteryPotion() {
    var pool = POTION_ORDER.filter(function (k) { return k !== "mystery" && !POTIONS[k].daily; });
    var weights = pool.map(function (k) { return 1 / Math.sqrt(POTIONS[k].cost + 100); });
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
    return pool[0];
  }

  function buyPotion(key) {
    var p = POTIONS[key];
    if (S.coins < p.cost) { toast("Not enough coins", "bad"); return; }
    S.coins -= p.cost;
    S.potions[key] = (S.potions[key] || 0) + 1;
    Sound.buy();
    toast("Bought " + p.name);
    save();
    renderAll();
  }

  function renderShop() {
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
      card.innerHTML =
        "<div class=\"row\"><div class=\"big-icon\">" + p.icon + "</div><div><div class=\"card-title\">" + p.name + "</div><div class=\"card-sub\">" + p.desc + "</div></div></div>" +
        "<div class=\"row\"><span class=\"price\">" + fmt(p.cost) + " coins</span><span class=\"card-sub\">owned: " + (S.potions[key] || 0) + "</span></div>";
      var actions = document.createElement("div");
      actions.className = "actions";
      var buy = document.createElement("button");
      buy.className = "btn small primary";
      buy.textContent = "Buy";
      buy.disabled = S.coins < p.cost;
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

    var tc = trainingCost(S.training);
    var train = document.createElement("div");
    train.className = "card";
    train.innerHTML =
      "<div class=\"row\"><div class=\"big-icon\">🏋️</div><div><div class=\"card-title\">Training · Lv " + S.training + "</div><div class=\"card-sub\">+10 power per level, applied to any equipped aura</div></div></div>" +
      "<div class=\"row\"><span class=\"price\">" + fmt(tc) + " coins</span><span class=\"card-sub\">bonus: +" + fmt(S.training * 10) + "</span></div>";
    var ta = document.createElement("div");
    ta.className = "actions";
    var tb = document.createElement("button");
    tb.className = "btn small primary";
    tb.textContent = "Train";
    tb.disabled = S.coins < tc;
    tb.addEventListener("click", function () {
      if (S.coins < tc) return;
      S.coins -= tc;
      S.training++;
      Sound.buy();
      toast("Training level " + S.training);
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
      ab.className = "btn small primary";
      ab.textContent = "Unlock";
      ab.disabled = S.coins < AUTO_UNLOCK_COST;
      ab.addEventListener("click", function () {
        if (S.coins < AUTO_UNLOCK_COST) return;
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

  function renderInventory() {
    var grid = $("#inventory-grid");
    grid.innerHTML = "";
    var ids = Object.keys(S.inventory).map(Number).filter(function (id) { return S.inventory[id] > 0; });
    if (!ids.length) {
      grid.innerHTML = "<div class=\"empty-note\">Nothing yet. Roll to discover auras.</div>";
      return;
    }
    ids.sort(function (a, b) { return A.byId(b).rarity - A.byId(a).rarity; });
    var eq = equippedAura();
    ids.forEach(function (id) {
      var a = A.byId(id);
      var isEq = !!(eq && eq.id === id);
      var card = document.createElement("div");
      card.className = "card" + (isEq ? " equipped" : "");
      var badge = document.createElement("div");
      badge.className = "count-badge";
      badge.textContent = "x" + S.inventory[id];
      card.appendChild(badge);
      var row = document.createElement("div");
      row.className = "row";
      row.appendChild(makeOrb(a));
      var info = document.createElement("div");
      var title = document.createElement("div");
      title.className = "card-title";
      title.textContent = a.name;
      var tier = document.createElement("div");
      tier.className = "tierlabel t-" + a.tier;
      tier.textContent = tierName(a);
      var sub = document.createElement("div");
      sub.className = "card-sub";
      sub.textContent = A.formatOdds(a.rarity) + " · " + fmt(a.power) + " power";
      info.appendChild(title); info.appendChild(tier); info.appendChild(sub);
      row.appendChild(info);
      card.appendChild(row);
      var actions = document.createElement("div");
      actions.className = "actions";
      var btn = document.createElement("button");
      btn.className = "btn small" + (isEq ? "" : " primary");
      btn.textContent = isEq ? "Equipped" : "Equip";
      btn.disabled = isEq;
      btn.addEventListener("click", function () { equip(id); });
      actions.appendChild(btn);
      card.appendChild(actions);
      grid.appendChild(card);
    });
  }

  function equip(id) {
    if (battle && !battle.over) { toast("Finish the fight first", "bad"); return; }
    S.equipped = id;
    abilitiesViewAura = id;
    toast("Equipped " + A.byId(id).name);
    save();
    renderAll();
  }

  /* ---------- Abilities tab: each aura has its own kit of 6, pick 4 ---------- */

  var abilitiesViewAura = null;

  function renderAbilities() {
    var grid = $("#ability-grid");
    var sel = $("#ability-aura");
    grid.innerHTML = "";
    var ids = Object.keys(S.inventory).map(Number).filter(function (id) { return S.inventory[id] > 0; });
    ids.sort(function (a, b) { return A.byId(b).rarity - A.byId(a).rarity; });
    var eq = equippedAura();
    if (abilitiesViewAura === null || !S.inventory[abilitiesViewAura]) abilitiesViewAura = eq ? eq.id : (ids.length ? ids[0] : null);
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
    head.appendChild(makeOrb(aura, "small"));
    var ht = document.createElement("div");
    var hn = document.createElement("div"); hn.className = "card-title"; hn.textContent = aura.name + "'s kit";
    var hs = document.createElement("div"); hs.className = "card-sub"; hs.textContent = tierName(aura) + " · " + fmt(aura.power) + " power" + (eq && eq.id === aura.id ? " · equipped" : " · not equipped");
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
      var stat = ab.mult > 0 ? fmt(Math.round(ab.mult * 100)) + "% power" + (ab.hits ? " x" + ab.hits : "") : "support";
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
        auraId: o.auraId === undefined ? null : o.auraId, icon: o.icon || null, isBot: !!o.isBot
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
    return { name: (S.playerName || "You"), power: playerPower(), auraId: aura ? aura.id : null, loadout: aura ? loadoutFor(aura) : DEFAULT_LOADOUT.slice(), isBot: false };
  }

  /* Build a fighter from a spec: its kit comes from the aura, its abilities from the loadout slots. */
  function fighterFromSpec(spec) {
    var aura = spec.auraId !== null && spec.auraId !== undefined ? A.byId(spec.auraId) : null;
    var kit = aura ? K.kitFor(aura) : K.botKit("dummy");
    var slots = Array.isArray(spec.loadout) && spec.loadout.length ? spec.loadout : DEFAULT_LOADOUT;
    var abilities = slots.filter(function (i) { return kit[i]; }).map(function (i) { return kit[i].id; });
    if (!abilities.length) abilities = [kit[0].id];
    return Engine.makeFighter({ name: spec.name, power: spec.power, kit: kit, abilities: abilities, auraId: aura ? aura.id : null, dmgMult: spec.dmgMult || 1, isBot: false });
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
    if (S.reviveReady > 0) { me.revive = S.reviveReady; }
    var bkit = K.botKit(bot.id);
    var them = Engine.makeFighter({ name: bot.name, power: bot.power, kit: bkit, abilities: bkit.map(function (ab) { return ab.id; }), icon: bot.icon, isBot: true });
    battle = Engine.create(me, them, "a");
    view = { me: "a", pvp: false, animating: false, bot: bot };
    openArena();
    $("#arena-banner").textContent = "Bot fight";
    if (S.strengthMult > 1) { logLine("💪 +" + Math.round((S.strengthMult - 1) * 100) + "% damage this fight", "you"); S.strengthMult = 1; }
    if (S.shieldReady > 0) { logLine("🛡️ Iron Skin: you start with a " + fmt(me.shield) + " shield", "you"); S.shieldReady = 0; }
    if (S.reviveReady > 0) { logLine("🕊️ Second Wind is ready to save you once", "you"); S.reviveReady = 0; }
    logLine("⚔️ " + bot.name + " challenges you!", "");
    renderArena();
    renderAll();
  }

  function openArena() {
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
      el.appendChild(makeOrb(A.byId(f.auraId), "small"));
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
    if (f.revive > 0) chips.push(["🕊️ Second Wind", "good"]);
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
      var sub = ab.mult > 0 ? "~" + fmt(Math.round(me.power * ab.mult * me.dmgMult)) + " dmg" + (ab.hits ? " x" + ab.hits : "") : "support";
      btn.innerHTML = "<span class=\"ab-icon\">" + ab.icon + "</span><span class=\"ab-name\">" + ab.name + "</span><span class=\"ab-sub\">" + sub + "</span>" + (cdLeft > 0 ? "<span class=\"cd\">" + cdLeft + "</span>" : "");
      btn.addEventListener("click", function () { chooseAbility(id); });
      bar.appendChild(btn);
    });

    $("#btn-heal").classList.toggle("hidden", view.pvp);
    var heals = (S.potions.heal || 0) + (S.potions.greatheal || 0);
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
          delay = 250;
          break;
        case "damage":
          flash(e.target, "hit");
          floatText(e.target, "-" + fmt(e.amount) + (e.crit ? "!" : ""), e.crit ? "t-divine" : "t-forbidden");
          Sound.hit(e.crit);
          logLine((e.crit ? "💥 CRIT! " : "") + (e.executed ? "EXECUTE! " : "") + (isMe(e.who) ? "You hit " + sideName(e.target) : sideName(e.who) + " hits " + (isMe(e.target) ? "you" : sideName(e.target))) + " for " + fmt(e.amount) + (e.absorbed ? " (" + fmt(e.absorbed) + " absorbed)" : "") + (e.blocked ? " (blocked 60%)" : ""), e.crit || e.executed ? "crit" : (isMe(e.who) ? "you" : "them"));
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
          floatText(e.who, "SECOND WIND", "heal");
          Sound.heal();
          logLine("🕊️ " + (isMe(e.who) ? "Second Wind saves you!" : sideName(e.who) + " refuses to fall!"), isMe(e.who) ? "you" : "them");
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

  function healInBattle(key) {
    key = key || (S.potions.heal > 0 ? "heal" : "greatheal");
    if (!battle || battle.over || view.pvp || !(S.potions[key] > 0)) return;
    if (battle.turn !== view.me || view.animating) { toast("Wait for your turn", "bad"); return; }
    S.potions[key]--;
    var me = battle.a;
    var amount = Math.round(me.maxHp * POTIONS[key].pct);
    me.hp = Math.min(me.maxHp, me.hp + amount);
    flash("a", "healed");
    floatText("a", "+" + fmt(amount), "heal");
    logLine("❤️ Healing potion restores " + fmt(amount) + " HP", "you");
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
    var loadout = raw.filter(function (i, pos) { return Number.isInteger(i) && i >= 0 && i < K.KIT_SIZE && raw.indexOf(i) === pos; }).slice(0, LOADOUT_SIZE);
    if (!loadout.length) loadout = DEFAULT_LOADOUT.slice();
    return { name: name, power: power, auraId: auraId, loadout: loadout, isBot: false };
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
      var tier = document.createElement("span");
      tier.className = "tierlabel t-" + a.tier;
      tier.textContent = tierName(a);
      var odds = document.createElement("span");
      odds.className = "odds";
      odds.textContent = A.formatOdds(a.rarity);
      var cnt = document.createElement("span");
      cnt.className = "cnt";
      row.appendChild(makeSwatch(a)); row.appendChild(name); row.appendChild(tier); row.appendChild(odds); row.appendChild(cnt);
      if (a.cutscene > 0) {
        var pv = document.createElement("button");
        pv.className = "btn small";
        pv.textContent = "▶ Preview";
        pv.title = "Preview this aura's reveal";
        pv.addEventListener("click", function () { if (!busy) playCutscene(a, true); });
        row.appendChild(pv);
      } else {
        row.appendChild(document.createElement("span"));
      }
      indexRows.push({ aura: a, row: row, cnt: cnt });
      frag.appendChild(row);
    });
    list.appendChild(frag);
    $("#index-search").addEventListener("input", filterIndex);
    $("#index-tier").addEventListener("change", filterIndex);
    $("#index-found").addEventListener("change", filterIndex);
  }

  function updateIndex() {
    var found = 0;
    indexRows.forEach(function (r) {
      var n = S.inventory[r.aura.id] || 0;
      if (n) found++;
      r.row.classList.toggle("undiscovered", !n);
      r.cnt.textContent = n ? "x" + n : "";
    });
    $("#index-progress").textContent = found + " / " + A.TOTAL;
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
      if (foundOnly && !S.inventory[r.aura.id]) ok = false;
      r.row.style.display = ok ? "" : "none";
    });
  }

  /* ---------- Stats ---------- */

  function renderStats() {
    var grid = $("#stats-grid");
    var found = Object.keys(S.inventory).filter(function (id) { return S.inventory[id] > 0; }).length;
    var best = S.stats.best !== null ? A.byId(S.stats.best) : null;
    var items = [
      ["Total rolls", fmt(S.rolls)],
      ["Auras found", found + " / " + A.TOTAL],
      ["Best aura", best ? best.name + " (" + A.formatOdds(best.rarity) + ")" : "—"],
      ["Coins earned", fmt(S.stats.earned)],
      ["Bot fights", fmt(S.stats.won) + " won · " + fmt(S.stats.lost) + " lost"],
      ["PvP record", fmt(S.stats.pvpWon) + " won · " + fmt(S.stats.pvpLost) + " lost"],
      ["Win streak", fmt(S.stats.streak) + " (best " + fmt(S.stats.bestStreak) + ")"],
      ["Cutscenes triggered", fmt(S.stats.cutscenes)],
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
    "give <aura name|id>       add an aura to your inventory",
    "roll <aura name|id>       force your next roll to be that aura (plays its reveal)",
    "potion <key> [count]      add potions: " + POTION_ORDER.join(", "),
    "training <level>          set training level",
    "unlockauto                unlock Auto Roll",
    "daily reset               make the daily gift claimable again",
    "clearluck                 remove all luck boosts",
    "reset                     wipe the save"
  ];

  function runAdmin(line) {
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
        var a = findAura(rest);
        if (!a) { adminPrint("No aura matches \"" + rest + "\"."); break; }
        S.inventory[a.id] = (S.inventory[a.id] || 0) + 1;
        if (S.stats.best === null || A.byId(S.stats.best).rarity < a.rarity) S.stats.best = a.id;
        if (!equippedAura()) S.equipped = a.id;
        adminPrint("Added " + a.name + " (" + A.formatOdds(a.rarity) + ").");
        break;
      }
      case "roll": {
        var ra = findAura(rest);
        if (!ra) { adminPrint("No aura matches \"" + rest + "\"."); break; }
        if (!canRoll()) { adminPrint("Can't roll right now (busy, cooling down or in a fight)."); break; }
        adminPrint("Rolling " + ra.name + "…");
        switchTab("roll");
        doRoll(ra);
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
      case "clearluck":
        S.luckEffects = [];
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
    el: $("#cutscene"), canvas: $("#cs-canvas"), pre: $("#cs-pre"), title: $("#cs-title"), odds: $("#cs-odds"), hint: $("#cs-hint"),
    running: false, resolve: null, raf: 0, start: 0, draw: null, timers: [], endAt: 6, t: 0
  };
  var CUTSCENE_SECONDS = 6;
  var CUTSCENE_FADE = 0.7;

  function csTimer(ms, fn) { CS.timers.push(setTimeout(fn, ms)); }

  /* Split a title into letters that animate in one after another. Returns the seconds until the last letter has landed. */
  var LETTER_ANIM = 1.1;
  function setLetters(el, text, step) {
    el.innerHTML = "";
    var i = 0;
    text.split("").forEach(function (ch) {
      var sp = document.createElement("span");
      sp.className = "ltr" + (ch === " " ? " space" : "");
      sp.textContent = ch === " " ? "\u00a0" : ch;
      sp.style.setProperty("--d", (i * step) + "s");
      el.appendChild(sp);
      i++;
    });
    return i * step + LETTER_ANIM;
  }

  /* Show the title letter by letter starting at `at` ms, then the odds once the letters are in. */
  function scheduleTitle(text, at, step, latestOdds) {
    csTimer(at, function () {
      var lettersDone = setLetters(CS.title, text, step);
      CS.title.classList.add("show");
      var oddsAt = Math.min(latestOdds, at + (lettersDone - LETTER_ANIM * 0.7) * 1000);
      csTimer(Math.max(0, oddsAt - at), function () { CS.odds.classList.add("show"); });
    });
  }

  function playCutscene(aura, preview) {
    return new Promise(function (resolve) {
      if (CS.running) { resolve(); return; }
      var kind = aura.special || "generic";
      var level = aura.cutscene;
      CS.running = true;
      CS.resolve = resolve;
      CS.el.className = "cutscene kind-" + kind;
      CS.el.style.opacity = "";
      CS.el.style.setProperty("--c1", aura.c1);
      CS.el.style.setProperty("--c2", aura.c2);
      CS.pre.className = "cs-pre"; CS.title.className = "cs-title"; CS.odds.className = "cs-odds"; CS.hint.className = "cs-hint";
      CS.pre.textContent = preview ? "Preview · " + tierName(aura) : tierName(aura) + " aura";
      CS.title.textContent = "";
      CS.odds.textContent = A.formatOdds(aura.rarity);
      CS.endAt = CUTSCENE_SECONDS;

      var ctx = CS.canvas.getContext("2d");
      function resize() {
        CS.canvas.width = window.innerWidth;
        CS.canvas.height = window.innerHeight;
      }
      resize();
      CS.onResize = resize;
      window.addEventListener("resize", resize);

      if (kind === "cosmic") {
        CS.draw = drawCosmic();
        Sound.cosmic();
        csTimer(3300, function () { CS.pre.classList.add("show"); });
        scheduleTitle(aura.name.toUpperCase(), 3300, 0.09, 4600);
      } else if (kind === "fury") {
        CS.draw = drawFury();
        Sound.fury();
        scheduleTitle(aura.name.toUpperCase(), 3100, 0.08, 4600);
        csTimer(3900, function () { CS.pre.classList.add("show"); });
      } else {
        CS.draw = drawGeneric(aura, level);
        Sound.rare(level);
        csTimer(700, function () { CS.pre.classList.add("show"); });
        scheduleTitle(aura.name, 900, Math.min(0.16, 2.6 / Math.max(1, aura.name.length)), 4300);
      }
      csTimer(1200, function () { CS.hint.classList.add("show"); });
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
    window.removeEventListener("resize", CS.onResize);
    CS.el.classList.add("hidden");
    CS.el.style.opacity = "";
    CS.running = false;
    var r = CS.resolve;
    CS.resolve = null;
    if (r) r();
  }

  CS.el.addEventListener("click", function () { if (CS.running && performance.now() - CS.start > 1000) endCutscene(); });

  /* Generic reveal. level 1 = Legendary (rings + sparks), 2 = Cosmic (+ star warp),
     3 = Divine (+ god rays), 4 = Transcendent (+ lightning and colour cycling). */
  function drawGeneric(aura, level) {
    var colors = aura.colors;
    var c1 = aura.c1, c2 = aura.c2;
    var parts = null, stars = null, bolts = [], lastBolt = 0;
    function makeBolt(w, h) {
      var edge = Math.floor(Math.random() * 4);
      var x = edge === 0 ? Math.random() * w : edge === 1 ? w : edge === 2 ? Math.random() * w : 0;
      var y = edge === 0 ? 0 : edge === 1 ? Math.random() * h : edge === 2 ? h : Math.random() * h;
      var pts = [[x, y]];
      var cx = w / 2 + (Math.random() - 0.5) * w * 0.25, cy = h / 2 + (Math.random() - 0.5) * h * 0.25;
      var n = 9;
      for (var i = 1; i <= n; i++) {
        var f = i / n;
        pts.push([x + (cx - x) * f + (Math.random() - 0.5) * 60 * (1 - f), y + (cy - y) * f + (Math.random() - 0.5) * 60 * (1 - f)]);
      }
      return { pts: pts, born: performance.now() };
    }
    return function (ctx, t, w, h) {
      var cx = w / 2, cy = h / 2, m = Math.max(w, h);
      var cyc = level >= 4 ? Math.floor(t * 3) : 0;
      var col = function (i) { return colors[(i + cyc) % colors.length]; };
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      var shake = t < 1.5 ? (1.5 - t) * 5 * level : (level >= 3 ? 1.5 : 0);
      ctx.save();
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, m * 0.6);
      g.addColorStop(0, col(0)); g.addColorStop(0.35, col(1)); g.addColorStop(1, "rgba(0,0,0,1)");
      ctx.globalAlpha = Math.min(1, t * 1.5) * (0.55 + 0.15 * Math.sin(t * 4));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;

      if (level >= 2) {
        if (!stars) { stars = []; for (var si = 0; si < 320; si++) stars.push({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random() }); }
        var speed = 0.004 + Math.min(1, t / 2) * 0.03;
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        stars.forEach(function (st) {
          var pz = st.z;
          st.z -= speed;
          if (st.z <= 0.03) { st.z = 1; st.x = (Math.random() - 0.5) * 2; st.y = (Math.random() - 0.5) * 2; return; }
          ctx.strokeStyle = Math.random() < 0.5 ? "#fff" : c1;
          ctx.globalAlpha = Math.min(1, (1 - st.z) * 1.3) * Math.min(1, t);
          ctx.lineWidth = (1 - st.z) * 2.2 + 0.4;
          ctx.beginPath();
          ctx.moveTo(cx + st.x / pz * cx, cy + st.y / pz * cy);
          ctx.lineTo(cx + st.x / st.z * cx, cy + st.y / st.z * cy);
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }

      if (level >= 3) {
        var rays = level >= 4 ? 20 : 14;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.globalCompositeOperation = "lighter";
        for (var r = 0; r < rays; r++) {
          var ang = t * 0.35 * (r % 2 ? 1 : -0.7) + r * Math.PI * 2 / rays;
          var rg = ctx.createLinearGradient(0, 0, Math.cos(ang) * m, Math.sin(ang) * m);
          rg.addColorStop(0, col(r)); rg.addColorStop(1, "rgba(0,0,0,0)");
          ctx.globalAlpha = (0.12 + 0.08 * Math.sin(t * 3 + r)) * Math.min(1, t / 1.2);
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(ang - 0.06) * m, Math.sin(ang - 0.06) * m);
          ctx.lineTo(Math.cos(ang + 0.06) * m, Math.sin(ang + 0.06) * m);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      var rings = 4 + level;
      for (var i = 0; i < rings; i++) {
        var rt = (t * 0.6 + i / rings) % 1;
        ctx.beginPath();
        ctx.arc(cx, cy, rt * m * 0.7, 0, Math.PI * 2);
        ctx.strokeStyle = col(i);
        ctx.lineWidth = 2 + (1 - rt) * 6;
        ctx.globalAlpha = (1 - rt) * 0.6;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (!parts) {
        parts = [];
        for (var k = 0; k < 120 + level * 70; k++) {
          parts.push({ a: Math.random() * Math.PI * 2, s: 60 + Math.random() * 260, r: Math.random() * 2 + 1, o: Math.random(), col: colors[Math.floor(Math.random() * colors.length)] });
        }
      }
      ctx.globalCompositeOperation = "lighter";
      parts.forEach(function (p) {
        var lt = (t * 0.5 + p.o) % 1;
        var d = lt * p.s * 3;
        ctx.globalAlpha = 1 - lt;
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(p.a) * d, cy + Math.sin(p.a) * d, p.r * (1 + level * 0.3), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

      if (level >= 4) {
        var now = performance.now();
        if (now - lastBolt > 180 + Math.random() * 500 && t > 0.4) { bolts.push(makeBolt(w, h)); lastBolt = now; }
        bolts = bolts.filter(function (b) { return now - b.born < 260; });
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        bolts.forEach(function (b) {
          var age = (now - b.born) / 260;
          ctx.beginPath();
          ctx.moveTo(b.pts[0][0], b.pts[0][1]);
          for (var q = 1; q < b.pts.length; q++) ctx.lineTo(b.pts[q][0], b.pts[q][1]);
          ctx.shadowColor = c1; ctx.shadowBlur = 25;
          ctx.strokeStyle = c1; ctx.lineWidth = 5 * (1 - age); ctx.globalAlpha = 1 - age; ctx.stroke();
          ctx.shadowBlur = 0; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
          if (age < 0.15) { ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.25 * (1 - age / 0.15); ctx.fillRect(-20, -20, w + 40, h + 40); }
          ctx.globalAlpha = 1;
        });
      }

      if (t < 0.5) {
        ctx.fillStyle = "#fff";
        ctx.globalAlpha = (0.5 - t) * 2;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    };
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

  /* ---------- Accounts (local to this browser), save button, export / import ---------- */

  function readAccounts() {
    try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function writeAccounts(acc) {
    try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(acc)); } catch (e) { /* ignore */ }
  }

  function hashPassword(password, salt) {
    var text = salt + ":" + password;
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      return window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      }).catch(function () { return fallbackHash(text); });
    }
    return Promise.resolve(fallbackHash(text));
  }
  function fallbackHash(text) {
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < text.length; i++) {
      h1 ^= text.charCodeAt(i); h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 ^= text.charCodeAt(i) * 31; h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
    }
    return "f" + h1.toString(16) + h2.toString(16);
  }
  function randomSalt() {
    var s = "";
    for (var i = 0; i < 16; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }

  var loginMode = "login";

  function openLogin() {
    $("#login-modal").classList.remove("hidden");
    $("#login-error").textContent = "";
    $("#login-user").value = currentUser || "";
    $("#login-pass").value = "";
    setLoginMode(currentUser ? "account" : "login");
    $("#save-code").value = "";
  }
  function closeLogin() { $("#login-modal").classList.add("hidden"); }

  function setLoginMode(mode) {
    loginMode = mode;
    var loggedIn = mode === "account";
    $("#login-title").textContent = loggedIn ? "Logged in as " + currentUser : (mode === "register" ? "Create account" : "Login");
    $("#login-submit").textContent = mode === "register" ? "Create" : "Login";
    $("#login-switch").textContent = mode === "register" ? "I have an account" : "Create account";
    $("#login-user").disabled = loggedIn;
    $("#login-pass").classList.toggle("hidden", loggedIn);
    $("#login-submit").classList.toggle("hidden", loggedIn);
    $("#login-switch").classList.toggle("hidden", loggedIn);
    $("#btn-logout").classList.toggle("hidden", !loggedIn);
  }

  function renderAccount() {
    $("#account-name").textContent = currentUser ? "👤 " + currentUser : "Guest";
    $("#btn-login").textContent = currentUser ? "Account" : "Login";
  }

  function submitLogin(e) {
    e.preventDefault();
    var user = $("#login-user").value.trim();
    var pass = $("#login-pass").value;
    var err = $("#login-error");
    if (!/^[A-Za-z0-9_]{3,16}$/.test(user)) { err.textContent = "Username: 3-16 letters, numbers or underscores."; return; }
    if (pass.length < 4) { err.textContent = "Password must be at least 4 characters."; return; }
    var key = user.toLowerCase();
    var acc = readAccounts();
    if (loginMode === "register") {
      if (acc[key]) { err.textContent = "That username is taken on this device."; return; }
      var salt = randomSalt();
      hashPassword(pass, salt).then(function (hash) {
        acc[key] = { name: user, salt: salt, hash: hash, created: Date.now() };
        writeAccounts(acc);
        switchUser(user, true);
        closeLogin();
        toast("Account created. Welcome, " + user + "!");
      });
    } else {
      var rec = acc[key];
      if (!rec) { err.textContent = "No account with that name on this device."; return; }
      hashPassword(pass, rec.salt).then(function (hash) {
        if (hash !== rec.hash) { err.textContent = "Wrong password."; return; }
        switchUser(rec.name, false);
        closeLogin();
        toast("Logged in as " + rec.name);
      });
    }
  }

  /* Save the current slot, switch slots and reload everything from the new one. */
  function switchUser(user, isNew) {
    save();
    if (battle && !battle.over) forfeit();
    pvpLeave(true);
    var guestState = (!currentUser && isNew) ? JSON.parse(JSON.stringify(S)) : null;
    currentUser = user;
    try { if (user) localStorage.setItem(SESSION_KEY, user); else localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    if (guestState && !localStorage.getItem(saveKey())) {
      /* A brand new account inherits the guest progress it was created from. */
      S = guestState;
      save();
    } else {
      S = load();
    }
    autoOn = false;
    resetRollDisplay();
    renderAccount();
    renderAll();
  }

  function resetRollDisplay() {
    FX.clear();
    if (S.lastRoll !== null && S.inventory[S.lastRoll]) { showAura(A.byId(S.lastRoll)); stageAmbient(A.byId(S.lastRoll)); return; }
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
    switchUser(null, false);
    closeLogin();
    toast("Logged out. Playing as guest.");
  }

  function manualSave() {
    save();
    var btn = $("#btn-save");
    btn.textContent = "✅ Saved";
    setTimeout(function () { btn.textContent = "💾 Save"; }, 1500);
    toast("Game saved" + (currentUser ? " for " + currentUser : ""));
  }

  function exportSave() {
    save();
    var json = JSON.stringify(S);
    var code = "AR1." + btoa(unescape(encodeURIComponent(json)));
    var ta = $("#save-code");
    ta.value = code;
    ta.select();
    try { document.execCommand("copy"); toast("Save code copied to clipboard"); } catch (e) { toast("Save code ready: copy it from the box"); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).catch(function () { /* ignore */ });
  }

  function importSave() {
    var code = $("#save-code").value.trim();
    var err = $("#login-error");
    if (code.indexOf("AR1.") !== 0) { err.textContent = "That is not a valid save code."; return; }
    try {
      var json = decodeURIComponent(escape(atob(code.slice(4))));
      var data = JSON.parse(json);
      if (!data || typeof data !== "object" || typeof data.rolls !== "number") throw new Error("bad");
      if (!confirm("Import this save? It will replace the current progress for " + (currentUser || "guest") + ".")) return;
      if (battle && !battle.over) forfeit();
      S = hydrate(data);
      save();
      resetRollDisplay();
      renderAll();
      closeLogin();
      toast("Save imported");
    } catch (e) {
      err.textContent = "Could not read that save code.";
    }
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

  $("#btn-roll").addEventListener("click", function () { doRoll(); });
  $("#btn-auto").addEventListener("click", function () {
    if (!S.autoUnlocked) { toast("Unlock Auto Roll in the Shop (" + fmt(AUTO_UNLOCK_COST) + " coins)", "bad"); return; }
    autoOn = !autoOn;
    renderAll();
  });
  $("#btn-equip-last").addEventListener("click", function () { if (S.lastRoll !== null) equip(S.lastRoll); });
  $("#btn-heal").addEventListener("click", function () { healInBattle(); });
  $("#btn-flee").addEventListener("click", forfeit);
  $("#set-sound").addEventListener("change", function (e) { S.settings.sound = e.target.checked; save(); });
  $("#set-skip").addEventListener("change", function (e) { S.settings.skipCutscenes = e.target.checked; save(); });
  $("#btn-reset").addEventListener("click", function () {
    if (!confirm("Reset all progress? This cannot be undone.")) return;
    resetSave();
    toast("Progress reset");
  });
  $("#ability-aura").addEventListener("change", function (e) { abilitiesViewAura = Number(e.target.value); renderAbilities(); });
  $("#btn-daily").addEventListener("click", claimDaily);
  $("#btn-save").addEventListener("click", manualSave);
  $("#btn-login").addEventListener("click", openLogin);
  $("#login-close").addEventListener("click", closeLogin);
  $("#login-form").addEventListener("submit", submitLogin);
  $("#login-switch").addEventListener("click", function () { setLoginMode(loginMode === "register" ? "login" : "register"); $("#login-error").textContent = ""; });
  $("#btn-logout").addEventListener("click", logout);
  $("#btn-export").addEventListener("click", exportSave);
  $("#btn-import").addEventListener("click", importSave);
  $("#login-modal").addEventListener("click", function (e) { if (e.target === $("#login-modal")) closeLogin(); });
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
      doRoll();
    }
    if (e.key === "`" && !typing) {
      e.preventDefault();
      switchTab("stats");
      $("#admin-in").focus();
    }
  });
  window.addEventListener("beforeunload", function () { if (PvP.conn) pvpSend({ t: "forfeit" }); });

  buildIndex();
  resetRollDisplay();
  renderAccount();
  renderAll();

  /* Console hooks. */
  window.AuraRealms = {
    state: function () { return S; },
    preview: function (name) { var a = findAura(name); if (a) playCutscene(a, true); },
    admin: runAdmin,
    engine: Engine,
    kits: K,
    pvp: function () { return { status: PvP.status, role: PvP.role, code: PvP.code }; },
    battle: function () { return battle; }
  };
})();
