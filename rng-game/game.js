/* game.js — Aura Realms RNG: rolling, coins, potions, battles, index, cutscenes. */
(function () {
  "use strict";

  var A = window.AURAS;
  var $ = function (s) { return document.querySelector(s); };
  var SAVE_KEY = "aura-realms-save-v1";
  var ROLL_COOLDOWN = 1000;
  var fmt = function (n) { return Math.floor(n).toLocaleString("en-US"); };

  /* ---------- Data ---------- */

  var POTIONS = {
    lucky:    { name: "Lucky Potion",    icon: "🍀", cost: 150,    kind: "luck", mult: 2,    rolls: 20, desc: "x2 luck for 20 rolls" },
    fortune:  { name: "Fortune Potion",  icon: "🧪", cost: 600,    kind: "luck", mult: 5,    rolls: 15, desc: "x5 luck for 15 rolls" },
    heavenly: { name: "Heavenly Potion", icon: "✨", cost: 3000,   kind: "luck", mult: 25,   rolls: 10, desc: "x25 luck for 10 rolls" },
    godly:    { name: "Godly Potion",    icon: "👑", cost: 20000,  kind: "luck", mult: 200,  rolls: 5,  desc: "x200 luck for 5 rolls" },
    zenith:   { name: "Zenith Potion",   icon: "🌌", cost: 100000, kind: "luck", mult: 1000, rolls: 3,  desc: "x1000 luck for 3 rolls" },
    gold:     { name: "Gold Potion",     icon: "💰", cost: 250,    kind: "gold", rolls: 30,  desc: "x2 coins from rolls for 30 rolls" },
    haste:    { name: "Haste Potion",    icon: "⚡", cost: 200,    kind: "haste", seconds: 60, desc: "Roll cooldown halved for 60 seconds" },
    heal:     { name: "Healing Potion",  icon: "❤️", cost: 100,    kind: "heal", pct: 0.4,   desc: "Restore 40% HP during a fight" },
    strength: { name: "Strength Potion", icon: "💪", cost: 150,    kind: "strength", mult: 1.5, desc: "+50% damage in your next fight" }
  };
  var POTION_ORDER = ["lucky", "fortune", "heavenly", "godly", "zenith", "gold", "haste", "heal", "strength"];

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
      goldRolls: 0,
      hasteUntil: 0,
      strengthReady: false,
      training: 0,
      autoUnlocked: false,
      botWins: {},
      history: [],
      stats: { best: null, won: 0, lost: 0, earned: 0, streak: 0, bestStreak: 0, cutscenes: 0 },
      settings: { sound: true, skipCutscenes: false }
    };
  }

  var S = load();

  function load() {
    var base = defaultState();
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return base;
      var saved = JSON.parse(raw);
      var merged = Object.assign(base, saved);
      merged.stats = Object.assign(defaultState().stats, saved.stats || {});
      merged.settings = Object.assign(defaultState().settings, saved.settings || {});
      return merged;
    } catch (e) {
      return base;
    }
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
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

  function equippedAura() {
    if (S.equipped === null || S.equipped === undefined) return null;
    if (!S.inventory[S.equipped]) return null;
    return A.byId(S.equipped);
  }

  function playerPower() {
    var aura = equippedAura();
    return (aura ? aura.power : 0) + S.training * 10;
  }

  function addCoins(n) {
    S.coins += n;
    S.stats.earned += n;
  }

  function setOrb(el, aura) {
    el.style.setProperty("--c1", aura.c1);
    el.style.setProperty("--c2", aura.c2);
    el.className = el.className.replace(/\btier-\S+/g, "").trim() + " tier-" + aura.tier;
  }

  function makeOrb(aura, cls) {
    var el = document.createElement("div");
    el.className = "orb " + (cls || "");
    el.innerHTML = "<div class=\"orb-core\"></div>";
    setOrb(el, aura);
    return el;
  }

  function tierName(aura) { return A.tierOf(aura).name; }

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
    rare: function (level) {
      var self = this;
      [523, 659, 784, 1047, 1319, 1568].slice(0, 2 + level).forEach(function (f, i) { self.tone(f, i * 0.09, 0.6, "triangle", 0.07); });
    },
    cosmic: function () {
      var self = this;
      [196, 247, 294, 392, 494, 587].forEach(function (f, i) { self.tone(f, 0.6 + i * 0.3, 5.5, "sine", 0.045); });
      [1047, 1319, 1568, 2093, 2637].forEach(function (f, i) { self.tone(f, 4.6 + i * 0.1, 1.8, "triangle", 0.06); });
    },
    fury: function () {
      var self = this;
      this.tone(55, 0, 7.5, "sawtooth", 0.07);
      this.tone(58, 0, 7.5, "sawtooth", 0.04);
      [110, 82, 65, 55].forEach(function (f, i) { self.tone(f, 4.1 + i * 0.18, 1.6, "square", 0.08); });
    },
    win: function () { var s = this; [523, 659, 784, 1047].forEach(function (f, i) { s.tone(f, i * 0.09, 0.35, "triangle", 0.07); }); },
    lose: function () { var s = this; [300, 250, 200].forEach(function (f, i) { s.tone(f, i * 0.15, 0.4, "sawtooth", 0.05); }); },
    hit: function (crit) { this.tone(crit ? 220 : 150, 0, 0.1, "square", 0.04); },
    buy: function () { this.tone(880, 0, 0.1, "triangle", 0.06); this.tone(1320, 0.08, 0.15, "triangle", 0.06); }
  };

  /* ---------- HUD ---------- */

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
    if (S.goldRolls > 0) {
      var g = document.createElement("span");
      g.className = "effect gold";
      g.textContent = "💰 x2 coins · " + S.goldRolls + " rolls";
      box.appendChild(g);
    }
    if (hasteActive()) {
      var h = document.createElement("span");
      h.className = "effect haste";
      h.textContent = "⚡ Haste · " + Math.ceil((S.hasteUntil - Date.now()) / 1000) + "s";
      box.appendChild(h);
    }
    if (S.strengthReady) {
      var st = document.createElement("span");
      st.className = "effect strength";
      st.textContent = "💪 Strength ready";
      box.appendChild(st);
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
      var sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.setProperty("--c1", a.c1);
      sw.style.setProperty("--c2", a.c2);
      var name = document.createElement("span");
      name.textContent = a.name;
      var tier = document.createElement("span");
      tier.className = "tierlabel t-" + a.tier;
      tier.textContent = tierName(a);
      var odds = document.createElement("span");
      odds.className = "odds";
      odds.textContent = A.formatOdds(a.rarity);
      li.appendChild(sw); li.appendChild(name); li.appendChild(tier); li.appendChild(odds);
      ul.appendChild(li);
    });
  }

  function renderAll() {
    renderHUD();
    renderEffects();
    renderQuickbar();
    renderHistory();
    renderInventory();
    renderShop();
    renderBots();
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

  function pickAura(luck) {
    var list = A.byRarityDesc;
    for (var i = 0; i < list.length; i++) {
      var p = Math.min(1, luck / list[i].rarity);
      if (Math.random() < p) return list[i];
    }
    return A.list[0];
  }

  function canRoll() { return !busy && Date.now() >= cooldownUntil && !battle; }

  function showAura(aura) {
    var orb = $("#orb");
    setOrb(orb, aura);
    orb.classList.remove("spinning", "pop");
    void orb.offsetWidth;
    orb.classList.add("pop");
    var nameEl = $("#roll-name");
    nameEl.textContent = aura.name;
    nameEl.className = "roll-name t-" + aura.tier;
    $("#roll-tier").textContent = tierName(aura) + " · " + fmt(aura.power) + " power";
    $("#roll-odds").textContent = A.formatOdds(aura.rarity);
    $("#btn-equip-last").disabled = false;
  }

  function startSpin() {
    var orb = $("#orb");
    orb.classList.add("spinning");
    var nameEl = $("#roll-name");
    spinTimer = setInterval(function () {
      var a = A.list[Math.floor(Math.random() * A.list.length)];
      nameEl.textContent = a.name;
      nameEl.className = "roll-name t-" + a.tier;
      orb.style.setProperty("--c1", a.c1);
      orb.style.setProperty("--c2", a.c2);
    }, 55);
  }

  function stopSpin() {
    clearInterval(spinTimer);
    spinTimer = null;
    $("#orb").classList.remove("spinning");
  }

  function doRoll() {
    if (!canRoll()) return;
    busy = true;
    $("#btn-roll").disabled = true;
    Sound.roll();

    var luck = currentLuck();
    var aura = pickAura(luck);

    S.rolls++;
    S.luckEffects.forEach(function (e) { e.rolls--; });
    S.luckEffects = S.luckEffects.filter(function (e) { return e.rolls > 0; });
    var mult = S.goldRolls > 0 ? 2 : 1;
    if (S.goldRolls > 0) S.goldRolls--;
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

    var spinMs = aura.cutscene > 0 ? 900 : (hasteActive() ? 250 : 450);
    startSpin();
    setTimeout(function () {
      stopSpin();
      var after = function () {
        showAura(aura);
        if (aura.cutscene === 0 && aura.rarity >= 1000) Sound.rare(0);
        toast("+" + fmt(coins) + " coins", "gold");
        renderAll();
        busy = false;
        cooldownUntil = Date.now() + (hasteActive() ? ROLL_COOLDOWN / 2 : ROLL_COOLDOWN);
        setTimeout(function () { $("#btn-roll").disabled = false; }, Math.max(0, cooldownUntil - Date.now()));
      };
      if (aura.cutscene > 0 && !S.settings.skipCutscenes) {
        playCutscene(aura).then(after);
      } else {
        after();
      }
    }, spinMs);
  }

  setInterval(function () {
    if (autoOn && canRoll()) doRoll();
  }, 200);

  setInterval(function () {
    if (hasteActive() || $("#active-effects").querySelector(".haste")) renderEffects();
  }, 1000);

  /* ---------- Potions ---------- */

  function usePotion(key) {
    var p = POTIONS[key];
    if (!S.potions[key]) return;
    if (p.kind === "luck") {
      S.luckEffects.push({ mult: p.mult, rolls: p.rolls });
    } else if (p.kind === "gold") {
      S.goldRolls += p.rolls;
    } else if (p.kind === "haste") {
      S.hasteUntil = Math.max(S.hasteUntil, Date.now()) + p.seconds * 1000;
    } else if (p.kind === "strength") {
      if (S.strengthReady) { toast("Strength is already active", "bad"); return; }
      S.strengthReady = true;
    } else if (p.kind === "heal") {
      if (!battle || battle.over) { toast("Healing potions are used during a fight", "bad"); return; }
      healInBattle();
      return;
    }
    S.potions[key]--;
    Sound.buy();
    toast(p.icon + " " + p.name + " used");
    save();
    renderAll();
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
    var grid = $("#shop-grid");
    grid.innerHTML = "";
    POTION_ORDER.forEach(function (key) {
      var p = POTIONS[key];
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
      var card = document.createElement("div");
      card.className = "card" + (eq && eq.id === id ? " equipped" : "");
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
      btn.className = "btn small" + (eq && eq.id === id ? "" : " primary");
      btn.textContent = eq && eq.id === id ? "Equipped" : "Equip";
      btn.disabled = !!(eq && eq.id === id);
      btn.addEventListener("click", function () { equip(id); });
      actions.appendChild(btn);
      card.appendChild(actions);
      grid.appendChild(card);
    });
  }

  function equip(id) {
    if (battle && !battle.over) { toast("Finish the fight first", "bad"); return; }
    S.equipped = id;
    toast("Equipped " + A.byId(id).name);
    save();
    renderAll();
  }

  /* ---------- Battle ---------- */

  var battle = null;

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
      card.innerHTML =
        "<div class=\"row\"><div class=\"big-icon\">" + bot.icon + "</div><div><div class=\"card-title\">" + bot.name + "</div><div class=\"card-sub\">Power " + fmt(bot.power) + " · <span class=\"" + vcls + "\">" + verdict + "</span></div></div></div>" +
        "<div class=\"row\"><span class=\"price\">+" + fmt(bot.reward) + " coins</span><span class=\"card-sub\">wins: " + wins + "</span></div>";
      var actions = document.createElement("div");
      actions.className = "actions";
      var btn = document.createElement("button");
      btn.className = "btn small primary";
      btn.textContent = "Fight";
      btn.disabled = !!battle && !battle.over;
      btn.addEventListener("click", function () { startFight(bot); });
      actions.appendChild(btn);
      card.appendChild(actions);
      grid.appendChild(card);
    });
  }

  function startFight(bot) {
    if (battle && !battle.over) return;
    var aura = equippedAura();
    if (!aura) { toast("Equip an aura first", "bad"); return; }
    var pp = playerPower();
    battle = {
      bot: bot, aura: aura,
      pPower: pp, bPower: bot.power,
      pHP: pp * 10, pMax: pp * 10,
      bHP: bot.power * 10, bMax: bot.power * 10,
      dmgMult: S.strengthReady ? POTIONS.strength.mult : 1,
      turn: "player", over: false, timer: null
    };
    if (S.strengthReady) { S.strengthReady = false; logLine("💪 Strength potion empowers you (+50% damage)", "you"); }
    var arena = $("#arena");
    arena.classList.remove("hidden");
    $("#battle-result").classList.add("hidden");
    $("#battle-log").innerHTML = "";
    setOrb($("#arena-orb"), aura);
    $("#arena-player-name").textContent = aura.name + " (" + fmt(pp) + ")";
    $("#arena-bot-icon").textContent = bot.icon;
    $("#arena-bot-name").textContent = bot.name + " (" + fmt(bot.power) + ")";
    $("#btn-flee").disabled = false;
    updateHP();
    logLine("⚔️ " + bot.name + " challenges you!", "");
    renderAll();
    arena.scrollIntoView({ behavior: "smooth", block: "start" });
    battle.timer = setTimeout(doTurn, 700);
  }

  function updateHP() {
    $("#hp-player").style.width = Math.max(0, battle.pHP / battle.pMax * 100) + "%";
    $("#hp-bot").style.width = Math.max(0, battle.bHP / battle.bMax * 100) + "%";
    $("#hp-player-text").textContent = fmt(Math.max(0, battle.pHP)) + " / " + fmt(battle.pMax);
    $("#hp-bot-text").textContent = fmt(Math.max(0, battle.bHP)) + " / " + fmt(battle.bMax);
    $("#btn-heal").textContent = "❤️ Heal (" + (S.potions.heal || 0) + ")";
    $("#btn-heal").disabled = !(S.potions.heal > 0) || battle.over;
  }

  function logLine(text, cls) {
    var log = $("#battle-log");
    var d = document.createElement("div");
    d.className = cls || "";
    d.textContent = text;
    log.insertBefore(d, log.firstChild);
  }

  function floatDamage(target, text, crit) {
    var el = document.createElement("div");
    el.className = "dmg-float" + (crit ? " t-divine" : " t-forbidden");
    el.textContent = text;
    var rect = target.getBoundingClientRect();
    el.style.left = (rect.left + rect.width / 2 - 20 + (Math.random() - 0.5) * 40) + "px";
    el.style.top = (rect.top + window.scrollY + 10) + "px";
    el.style.position = "absolute";
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 900);
  }

  function rollDamage(power) {
    var crit = Math.random() < 0.12;
    var dmg = power * (0.8 + Math.random() * 0.4) * (crit ? 2 : 1);
    return { dmg: Math.max(1, Math.round(dmg)), crit: crit };
  }

  function doTurn() {
    if (!battle || battle.over) return;
    var r;
    if (battle.turn === "player") {
      r = rollDamage(battle.pPower * battle.dmgMult);
      battle.bHP -= r.dmg;
      flash($("#fighter-bot"));
      floatDamage($("#fighter-bot"), "-" + fmt(r.dmg) + (r.crit ? "!" : ""), r.crit);
      logLine((r.crit ? "💥 CRIT! " : "") + "You hit " + battle.bot.name + " for " + fmt(r.dmg), r.crit ? "crit" : "you");
      battle.turn = "bot";
    } else {
      r = rollDamage(battle.bPower);
      battle.pHP -= r.dmg;
      flash($("#fighter-player"));
      floatDamage($("#fighter-player"), "-" + fmt(r.dmg) + (r.crit ? "!" : ""), r.crit);
      logLine((r.crit ? "💥 CRIT! " : "") + battle.bot.name + " hits you for " + fmt(r.dmg), r.crit ? "crit" : "them");
      battle.turn = "player";
    }
    Sound.hit(r.crit);
    updateHP();
    if (battle.bHP <= 0) return endFight(true);
    if (battle.pHP <= 0) return endFight(false);
    battle.timer = setTimeout(doTurn, 650);
  }

  function flash(el) {
    el.classList.remove("hit");
    void el.offsetWidth;
    el.classList.add("hit");
  }

  function healInBattle() {
    if (!battle || battle.over || !(S.potions.heal > 0)) return;
    S.potions.heal--;
    var amount = Math.round(battle.pMax * POTIONS.heal.pct);
    battle.pHP = Math.min(battle.pMax, battle.pHP + amount);
    logLine("❤️ You heal for " + fmt(amount), "you");
    Sound.buy();
    save();
    updateHP();
    renderQuickbar();
  }

  function endFight(won, fled) {
    clearTimeout(battle.timer);
    battle.over = true;
    var res = $("#battle-result");
    res.classList.remove("hidden", "win", "lose");
    if (fled) {
      res.classList.add("lose");
      res.textContent = "You fled.";
      S.stats.streak = 0;
    } else if (won) {
      var reward = battle.bot.reward;
      addCoins(reward);
      S.botWins[battle.bot.id] = (S.botWins[battle.bot.id] || 0) + 1;
      S.stats.won++;
      S.stats.streak++;
      if (S.stats.streak > S.stats.bestStreak) S.stats.bestStreak = S.stats.streak;
      res.classList.add("win");
      res.textContent = "Victory! +" + fmt(reward) + " coins";
      Sound.win();
      logLine("🏆 " + battle.bot.name + " defeated! +" + fmt(reward) + " coins", "crit");
    } else {
      S.stats.lost++;
      S.stats.streak = 0;
      res.classList.add("lose");
      res.textContent = "Defeated by " + battle.bot.name + "…";
      Sound.lose();
      logLine("💀 You were defeated.", "them");
    }
    $("#btn-flee").disabled = true;
    updateHP();
    save();
    renderAll();
    setTimeout(function () { battle = null; renderBots(); }, 600);
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
      var sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.setProperty("--c1", a.c1);
      sw.style.setProperty("--c2", a.c2);
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
      row.appendChild(sw); row.appendChild(name); row.appendChild(tier); row.appendChild(odds); row.appendChild(cnt);
      if (a.cutscene > 0) {
        var pv = document.createElement("button");
        pv.className = "btn small";
        pv.textContent = "▶ Preview";
        pv.title = "Preview this aura's cutscene";
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
      ["Fights won", fmt(S.stats.won)],
      ["Fights lost", fmt(S.stats.lost)],
      ["Win streak", fmt(S.stats.streak) + " (best " + fmt(S.stats.bestStreak) + ")"],
      ["Cutscenes triggered", fmt(S.stats.cutscenes)],
      ["Training level", fmt(S.training)]
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

  /* ---------- Cutscenes ---------- */

  var CS = {
    el: $("#cutscene"), canvas: $("#cs-canvas"), pre: $("#cs-pre"), title: $("#cs-title"), odds: $("#cs-odds"), hint: $("#cs-hint"),
    running: false, resolve: null, raf: 0, start: 0, draw: null, timers: [], endAt: 0
  };

  function csTimer(ms, fn) { CS.timers.push(setTimeout(fn, ms)); }

  function setLetters(el, text) {
    el.innerHTML = "";
    var i = 0;
    text.split("").forEach(function (ch) {
      var s = document.createElement("span");
      s.className = "ltr" + (ch === " " ? " space" : "");
      s.textContent = ch === " " ? " " : ch;
      s.style.setProperty("--d", (i * 0.09) + "s");
      el.appendChild(s);
      i++;
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
      CS.el.style.setProperty("--c1", aura.c1);
      CS.el.style.setProperty("--c2", aura.c2);
      CS.pre.className = "cs-pre"; CS.title.className = "cs-title"; CS.odds.className = "cs-odds"; CS.hint.className = "cs-hint";
      CS.pre.textContent = preview ? "Preview · " + tierName(aura) : tierName(aura) + " aura";
      CS.title.textContent = "";
      CS.odds.textContent = A.formatOdds(aura.rarity);

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
        csTimer(4700, function () { CS.pre.classList.add("show"); setLetters(CS.title, aura.name.toUpperCase()); CS.title.classList.add("show"); });
        csTimer(6200, function () { CS.odds.classList.add("show"); });
        csTimer(7600, function () { CS.hint.classList.add("show"); });
        CS.endAt = 13;
      } else if (kind === "fury") {
        CS.draw = drawFury();
        Sound.fury();
        csTimer(4300, function () { CS.title.textContent = aura.name.toUpperCase(); CS.title.classList.add("show"); });
        csTimer(5400, function () { CS.pre.classList.add("show"); });
        csTimer(5900, function () { CS.odds.classList.add("show"); });
        csTimer(7600, function () { CS.hint.classList.add("show"); });
        CS.endAt = 13;
      } else {
        CS.draw = drawGeneric(aura, level);
        Sound.rare(level);
        csTimer(700, function () { CS.pre.classList.add("show"); CS.title.textContent = aura.name; CS.title.classList.add("show"); });
        csTimer(1300, function () { CS.odds.classList.add("show"); });
        csTimer(2200, function () { CS.hint.classList.add("show"); });
        CS.endAt = 4.5 + level;
      }

      CS.el.classList.remove("hidden");
      CS.start = performance.now();
      function frame(now) {
        var t = (now - CS.start) / 1000;
        CS.t = t;
        CS.draw(ctx, t, CS.canvas.width, CS.canvas.height);
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
    CS.running = false;
    var r = CS.resolve;
    CS.resolve = null;
    if (r) r();
  }

  CS.el.addEventListener("click", function () { if (CS.running && CS.t > 1) endCutscene(); });

  function drawGeneric(aura, level) {
    var c1 = aura.c1, c2 = aura.c2;
    var parts = null;
    return function (ctx, t, w, h) {
      var cx = w / 2, cy = h / 2, m = Math.max(w, h);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      var shake = t < 1.5 ? (1.5 - t) * 5 * level : 0;
      ctx.save();
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, m * 0.6);
      g.addColorStop(0, c1); g.addColorStop(0.35, c2); g.addColorStop(1, "rgba(0,0,0,1)");
      ctx.globalAlpha = Math.min(1, t * 1.5) * (0.55 + 0.15 * Math.sin(t * 4));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      var rings = 4 + level;
      for (var i = 0; i < rings; i++) {
        var rt = (t * 0.6 + i / rings) % 1;
        ctx.beginPath();
        ctx.arc(cx, cy, rt * m * 0.7, 0, Math.PI * 2);
        ctx.strokeStyle = c1;
        ctx.lineWidth = 2 + (1 - rt) * 6;
        ctx.globalAlpha = (1 - rt) * 0.6;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (!parts) {
        parts = [];
        for (var k = 0; k < 120 + level * 60; k++) {
          parts.push({ a: Math.random() * Math.PI * 2, s: 60 + Math.random() * 260, r: Math.random() * 2 + 1, o: Math.random(), col: Math.random() < 0.5 ? c1 : c2 });
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
      if (t > 2.5 && t < 4.6) shakeAmp = (t - 2.5) * 7;
      else if (t >= 4.6 && t < 5.2) shakeAmp = (5.2 - t) * 25;
      ctx.save();
      ctx.translate((Math.random() - 0.5) * shakeAmp, (Math.random() - 0.5) * shakeAmp);

      ctx.globalCompositeOperation = "lighter";
      var nebAlpha = Math.min(1, Math.max(0, (t - 0.8) / 1.5)) * 0.5;
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

      var speed = t < 4.5 ? 0.002 + Math.pow(t / 4.5, 3) * 0.08 : 0.003;
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

      if (t > 2.2 && t < 5.6) {
        var prog = (t - 2.2) / 2.3;
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

      if (t > 4.5) {
        if (!sparks) {
          sparks = [];
          for (var k = 0; k < 320; k++) sparks.push({ a: Math.random() * Math.PI * 2, s: 80 + Math.random() * 500, r: Math.random() * 2.5 + 0.8, hue: 250 + Math.random() * 70, spin: Math.random() * 2 });
        }
        var bt = t - 4.5;
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

      if (t > 4.4 && t < 5.1) {
        ctx.fillStyle = "#fff";
        ctx.globalAlpha = Math.max(0, 1 - (t - 4.4) / 0.7);
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      if (t < 0.8) {
        ctx.fillStyle = "#000";
        ctx.globalAlpha = 1 - t / 0.8;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }
    };
  }

  function drawFury() {
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
      cracks.push({ pts: pts, delay: Math.random() * 1.5 });
    }
    var embers = [];
    for (var e = 0; e < 170; e++) embers.push({ x: Math.random(), y: Math.random(), s: 0.02 + Math.random() * 0.06, r: Math.random() * 2.5 + 1, ph: Math.random() * 6 });
    var flashes = [4.0, 4.18, 5.6, 7.2, 9.5];
    return function (ctx, t, w, h) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      var beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 1.6)), 8);
      var intensity = Math.min(1, t / 4);
      var shakeAmp = t < 4 ? intensity * intensity * 10 : (t < 4.6 ? 28 : 3 + beat * 6);
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
        var prog = Math.max(0, Math.min(1, (t - 0.6 - c.delay) / 2.4));
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

      if (t > 4) {
        var bt = t - 4;
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
      if (t < 1) {
        ctx.fillStyle = "#000";
        ctx.globalAlpha = 1 - t;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }
    };
  }

  /* ---------- Wiring ---------- */

  function switchTab(name) {
    document.querySelectorAll(".tab").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === name); });
    document.querySelectorAll(".panel").forEach(function (p) { p.classList.toggle("active", p.id === "tab-" + name); });
  }

  $("#tabs").addEventListener("click", function (e) {
    var b = e.target.closest(".tab");
    if (b) switchTab(b.dataset.tab);
  });

  $("#btn-roll").addEventListener("click", doRoll);
  $("#btn-auto").addEventListener("click", function () {
    if (!S.autoUnlocked) { toast("Unlock Auto Roll in the Shop (" + fmt(AUTO_UNLOCK_COST) + " coins)", "bad"); return; }
    autoOn = !autoOn;
    renderAll();
  });
  $("#btn-equip-last").addEventListener("click", function () { if (S.lastRoll !== null) equip(S.lastRoll); });
  $("#btn-heal").addEventListener("click", healInBattle);
  $("#btn-flee").addEventListener("click", function () { if (battle && !battle.over) endFight(false, true); });
  $("#set-sound").addEventListener("change", function (e) { S.settings.sound = e.target.checked; save(); });
  $("#set-skip").addEventListener("change", function (e) { S.settings.skipCutscenes = e.target.checked; save(); });
  $("#btn-reset").addEventListener("click", function () {
    if (!confirm("Reset all progress? This cannot be undone.")) return;
    S = defaultState();
    save();
    autoOn = false;
    $("#roll-name").textContent = "Ready to roll";
    $("#roll-name").className = "roll-name";
    $("#roll-tier").textContent = "Press ROLL to discover your first aura";
    $("#roll-odds").textContent = "";
    renderAll();
    toast("Progress reset");
  });
  document.addEventListener("keydown", function (e) {
    if (e.code === "Space" && !e.repeat && document.activeElement.tagName !== "INPUT" && $("#tab-roll").classList.contains("active")) {
      e.preventDefault();
      doRoll();
    }
  });

  buildIndex();
  if (S.lastRoll !== null && S.inventory[S.lastRoll]) showAura(A.byId(S.lastRoll));
  renderAll();

  /* Debug hooks for the console. */
  window.AuraRealms = { state: function () { return S; }, preview: function (name) { var a = A.byName(name); if (a) playCutscene(a, true); } };
})();
