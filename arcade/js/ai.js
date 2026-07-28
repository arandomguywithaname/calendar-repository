/* Claude Arc Games — the admin "AI" command engine.

   HONEST DESCRIPTION: there is no AI model behind this. A real one needs a
   paid server connection, which a static site can't have. What this DOES do
   is read a sentence you actually typed - however you phrased it - work out
   which kind of change you meant, pull the details out (how much, which
   picture, which key), and then carry it out for real through ArcadeMods.

   It is built to be forgiving: it strips politeness ("can you please..."),
   tolerates typos, understands many verbs for the same idea, and handles
   several instructions joined with "and". It still only covers the kinds of
   change listed in help(); anything else returns the prohibited error. */
(function () {
  var ERR = "Error;error;ShowID(ai.extension<adminpanel>prohibited/Text.message();;return)";

  var RUDE = ["stupid", "dumb", "idiot", "hate you", "shut up", "suck", "trash",
    "useless", "damn", "crap", "screw you", "moron", "loser", "ugly", "worthless"];

  var EMOJI = {
    chicken: "🐔", hen: "🐔", egg: "🥚", bird: "🐦", birdie: "🐦", snake: "🐍",
    worm: "🐛", bug: "🐛", ball: "⚪", apple: "🍎", banana: "🍌", cherry: "🍒",
    cherries: "🍒", grape: "🍇", grapes: "🍇", lemon: "🍋", watermelon: "🍉",
    melon: "🍉", strawberry: "🍓", kiwi: "🥝", peach: "🍑", orange: "🍊",
    pineapple: "🍍", coconut: "🥥", pizza: "🍕", burger: "🍔", hamburger: "🍔",
    fries: "🍟", cake: "🍰", donut: "🍩", doughnut: "🍩", cookie: "🍪",
    candy: "🍬", sweet: "🍬", icecream: "🍦", star: "⭐", heart: "❤️",
    fire: "🔥", flame: "🔥", rocket: "🚀", spaceship: "🚀", car: "🚗",
    truck: "🚚", plane: "✈️", aeroplane: "✈️", airplane: "✈️", boat: "⛵",
    ship: "⛵", train: "🚂", bike: "🚲", bicycle: "🚲", cat: "🐱", kitty: "🐱",
    dog: "🐶", puppy: "🐶", frog: "🐸", fish: "🐠", shark: "🦈", ghost: "👻",
    alien: "👾", monster: "👹", skull: "💀", zombie: "🧟", moon: "🌙",
    sun: "☀️", cloud: "☁️", tree: "🌳", flower: "🌸", rose: "🌹",
    crown: "👑", diamond: "💎", gem: "💎", coin: "🪙", money: "💰",
    bomb: "💣", rainbow: "🌈", lightning: "⚡", bolt: "⚡", snowflake: "❄️",
    trophy: "🏆", football: "⚽", soccer: "⚽", basketball: "🏀",
    tennis: "🎾", baseball: "⚾", dice: "🎲", poop: "💩", robot: "🤖",
    unicorn: "🦄", dragon: "🐉", penguin: "🐧", monkey: "🐵", panda: "🐼",
    lion: "🦁", tiger: "🐯", bear: "🐻", cow: "🐮", pig: "🐷", mouse: "🐭",
    rabbit: "🐰", bunny: "🐰", fox: "🦊", owl: "🦉", bee: "🐝",
    butterfly: "🦋", spider: "🕷️", crab: "🦀", octopus: "🐙", whale: "🐳",
    mushroom: "🍄", cheese: "🧀", bread: "🍞", taco: "🌮", sushi: "🍣",
    balloon: "🎈", gift: "🎁", present: "🎁", key: "🔑", lock: "🔒",
    eye: "👁️", brain: "🧠", muscle: "💪", wave: "👋", ok: "👌",
    thumbsup: "👍", clap: "👏", party: "🎉", music: "🎵", note: "🎵",
    book: "📚", pencil: "✏️", phone: "📱", computer: "💻", tv: "📺",
    clock: "⏰", hourglass: "⏳", magnet: "🧲", sword: "⚔️", shield: "🛡️",
    hammer: "🔨", wrench: "🔧", rock: "🪨", stone: "🪨", snowman: "⛄",
    cactus: "🌵", palm: "🌴", earth: "🌍", planet: "🪐", comet: "☄️",
    ufo: "🛸", crystal: "🔮", potion: "🧪", pill: "💊", chick: "🐤"
  };

  var COLORS = {
    red: "#ff4141", green: "#00ff41", blue: "#3aa0ff", yellow: "#ffd23f",
    orange: "#ff8c1a", purple: "#b14aff", pink: "#ff5da2", cyan: "#29e0c9",
    white: "#ffffff", black: "#05070f", grey: "#8a90ad", gray: "#8a90ad",
    lime: "#b6ff00", gold: "#ffab00", teal: "#00c2ff", violet: "#b14aff",
    magenta: "#ff2e97", turquoise: "#29e0c9"
  };

  var HUE = {
    red: 0, orange: 25, gold: 40, yellow: 50, lime: 80, green: 120,
    teal: 175, cyan: 175, turquoise: 175, blue: 210, purple: 275,
    violet: 275, magenta: 315, pink: 330, white: 0, black: 0, grey: 0, gray: 0
  };

  var THEME_WORDS = {
    dark: "dark", night: "dark", light: "light", day: "light", bright: "light",
    green: "matrix", matrix: "matrix", hacker: "matrix", hacking: "matrix",
    synthwave: "synthwave", neon: "synthwave", vaporwave: "synthwave",
    retro: "amber", ocean: "ocean", sea: "ocean", water: "ocean",
    blue: "ocean", amber: "amber", orange: "amber", grape: "grape",
    purple: "grape", pink: "synthwave"
  };

  // ---------- text helpers ----------

  // Strip the polite wrapper people naturally type so the meaning is left.
  var FILLER = /\b(can you|could you|would you|will you|please|pls|plz|thanks|thank you|i want you to|i want|i would like|i'd like|id like|lets|let's|hey|hi|yo|ok|okay|now|just|maybe|try to|for me|the game|in the game)\b/g;

  function normalize(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[‘’′`]/g, "'")
      .replace(/\bdont\b/g, "don't")
      .replace(/[.?!;:]+/g, " ")
      .replace(FILLER, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Edit distance, capped - lets "fastr"/"colour"/"rockit" still land.
  function near(a, b) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 2) return false;
    if (a.length < 4) return false;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      for (j = 0; j <= b.length; j++) prev[j] = cur[j];
    }
    return prev[b.length] <= (a.length > 6 ? 2 : 1);
  }

  // Exact word match - for words where a typo-tolerant match would collide
  // with a different intent (notably "blue" vs "blur").
  function hasExact(t, list) {
    var words = t.split(/[^a-z0-9+]+/);
    for (var i = 0; i < list.length; i++) {
      if (list[i].indexOf(" ") !== -1) { if (t.indexOf(list[i]) !== -1) return true; continue; }
      if (words.indexOf(list[i]) !== -1) return true;
    }
    return false;
  }

  function hasWord(t, list) {
    var words = t.split(/[^a-z0-9+]+/);
    for (var i = 0; i < list.length; i++) {
      if (list[i].indexOf(" ") !== -1) { if (t.indexOf(list[i]) !== -1) return true; continue; }
      for (var w = 0; w < words.length; w++) {
        if (words[w] === list[i] || near(words[w], list[i])) return true;
      }
    }
    return false;
  }

  function findEmoji(word) {
    if (!word) return null;
    var w = String(word).toLowerCase().trim()
      .replace(/^(a|an|the|some|my)\s+/, "")
      .replace(/[^a-z0-9\s -￿]/g, "")
      .trim();
    if (!w) return null;
    if (EMOJI[w]) return EMOJI[w];
    var squashed = w.replace(/\s+/g, "");
    if (EMOJI[squashed]) return EMOJI[squashed];
    if (EMOJI[w.replace(/s$/, "")]) return EMOJI[w.replace(/s$/, "")];
    // Typed an actual emoji?
    if (/[‼-㊙\ud83c-\ud83e]/.test(word)) {
      var m = String(word).match(/([‼-㊙]|[\ud83c-\ud83e][\udc00-\udfff])(️|‍[\s\S])*/);
      if (m) return m[0];
    }
    var keys = Object.keys(EMOJI);
    for (var i = 0; i < keys.length; i++) if (near(squashed, keys[i])) return EMOJI[keys[i]];
    return null;
  }

  function findColor(t) {
    // Exact only: colour words are short, so typo-tolerance turns "write"
    // into "white" and "read" into "red".
    var words = t.split(/[^a-z]+/);
    var keys = Object.keys(COLORS);
    for (var w = 0; w < words.length; w++) {
      for (var i = 0; i < keys.length; i++) if (words[w] === keys[i]) return keys[i];
    }
    return null;
  }

  function amountFrom(t) {
    var m = /(\d+(?:\.\d+)?)\s*(?:x|times)/.exec(t) || /by (\d+(?:\.\d+)?)/.exec(t);
    if (m) return parseFloat(m[1]);
    if (hasWord(t, ["double", "twice"])) return 2;
    if (hasWord(t, ["triple"])) return 3;
    if (hasWord(t, ["half"])) return 2;
    if (hasWord(t, ["way", "much", "lot", "super", "really", "very", "loads", "tons", "insanely", "crazy"])) return 2.5;
    if (hasWord(t, ["bit", "little", "slightly", "tiny", "abit", "somewhat"])) return 1.25;
    return 1.6;
  }

  function isGamePage() { return /\/games\//.test(location.pathname); }
  function seeIt() { return isGamePage() ? "" : " Open a game to see it."; }

  // ---------- intents ----------

  function tryReset(t) {
    if (!hasWord(t, ["reset", "undo", "revert", "normal"]) &&
        !/back to normal|start over|clear changes|undo everything/.test(t)) return null;
    window.ArcadeMods.resetAll();
    return { ok: true, msg: "Done — everything is back to normal." };
  }

  function tryHelp(t, raw) {
    var r = String(raw || "").toLowerCase();
    if (!hasWord(t, ["help", "commands", "examples"]) &&
        !/what (can|do) (you )?(do|change)|how do i|what do i (type|say)|what else|list/.test(t) &&
        !/what can you do|what do you do|what can i (say|type|ask)/.test(r)) return null;
    return { ok: true, msg:
      "Type it however you like — these all work:\n" +
      "• \"make the ball go way faster\"  \"slow snake down a bit\"  \"3x speed\"\n" +
      "• \"turn the chicken into an egg\"  \"instead of a bird put a rocket\"\n" +
      "• \"make everything green\"  \"black and white\"  \"invert the colours\"\n" +
      "• \"make the game bigger\"  \"zoom out a little\"\n" +
      "• \"freeze the game\"  \"unpause\"\n" +
      "• \"switch to the hacker theme\"\n" +
      "• \"when I press ctrl+Q open the admin panel\"\n" +
      "• \"reset\" undoes everything. So does refreshing." };
  }

  function tryPause(t) {
    var stop = hasWord(t, ["pause", "freeze", "stop", "hold"]);
    var go = hasWord(t, ["unpause", "resume", "unfreeze", "continue", "unstop"]) ||
      /start again|keep going|carry on/.test(t);
    if (!stop && !go) return null;
    if (go) { window.ArcadeMods.setPaused(false); return { ok: true, msg: "Running again." }; }
    window.ArcadeMods.setPaused(true);
    window.ArcadeMods.note("paused");
    return { ok: true, msg: "Frozen. Say \"unpause\" to start it moving again." };
  }

  function trySize(t) {
    var big = hasWord(t, ["bigger", "larger", "huge", "enlarge", "zoom"]) || /zoom in|scale up|blow up/.test(t);
    var small = hasWord(t, ["smaller", "tinier", "shrink", "tiny"]) || /zoom out|scale down/.test(t);
    if (!big && !small) return null;
    if (/zoom out/.test(t)) { big = false; small = true; }
    var step = hasWord(t, ["bit", "little", "slightly"]) ? 1.15 : 1.35;
    var cur = window.ArcadeMods.getScale();
    var applied = window.ArcadeMods.setScale(big ? cur * step : cur / step);
    window.ArcadeMods.note("scale " + applied.toFixed(2));
    return { ok: true, msg: (big ? "Bigger" : "Smaller") + " — now " +
      Math.round(applied * 100) + "% size." + seeIt() };
  }

  function tryEffect(t) {
    var f = null, name = "";
    if (/black and white|greyscale|grayscale|no colou?r/.test(t)) { f = "grayscale(1)"; name = "black and white"; }
    else if (hasExact(t, ["invert", "inverted", "negative", "opposite"])) { f = "invert(1)"; name = "inverted"; }
    else if (hasExact(t, ["blurry", "blur", "fuzzy"])) { f = "blur(2px)"; name = "blurry"; }
    else if (hasWord(t, ["brighter", "brighten"])) { f = "brightness(1.5)"; name = "brighter"; }
    else if (hasWord(t, ["darker", "darken", "dimmer", "dim"])) { f = "brightness(0.5)"; name = "darker"; }
    else if (hasWord(t, ["rainbow", "psychedelic", "trippy"])) { f = "hue-rotate(120deg) saturate(2.2) contrast(1.2)"; name = "rainbow-ish"; }
    if (!f) return null;
    window.ArcadeMods.setTint(f);
    window.ArcadeMods.note(name);
    return { ok: true, msg: "Made it " + name + "." + seeIt() };
  }

  function tryTheme(t) {
    if (!hasWord(t, ["theme", "mode", "skin", "style", "look"])) return null;
    var pick = null;
    Object.keys(THEME_WORDS).forEach(function (w) {
      if (new RegExp("\\b" + w + "\\b").test(t)) pick = THEME_WORDS[w];
    });
    if (!pick) return null;
    var applied = window.ArcadeCommon.setTheme(pick);
    window.ArcadeMods.note("theme " + applied.id);
    return { ok: true, msg: "Theme is now " + applied.label + " " + applied.icon +
      " (themes stay after a refresh)." };
  }

  function trySwap(t, raw) {
    var m =
      /(?:change|swap|turn|replace|make|put|use)\s+(?:the\s+|a\s+|an\s+|some\s+)?(.+?)\s+(?:in ?to|into|to be|to|with|for|as)\s+(?:the\s+|a\s+|an\s+|some\s+)?([^\s,]+)/i.exec(raw) ||
      /instead of\s+(?:the\s+|a\s+|an\s+)?([a-z]+)[,\s]+(?:you can\s+)?(?:use|put|show|have|do|make it|maybe)?\s*(?:the\s+|a\s+|an\s+)?([^\s,]+)/i.exec(raw) ||
      /(?:no more|get rid of)\s+(?:the\s+)?([a-z]+)[,\s]+(?:use|put|show)?\s*(?:the\s+|a\s+|an\s+)?([^\s,]+)/i.exec(raw) ||
      // "make the bird a pizza" - no connector word at all
      /(?:make|turn)\s+(?:the\s+|a\s+)?([a-z]+)\s+(?:in\s*to\s+)?(?:a|an)\s+([a-z]+)/i.exec(raw);
    if (!m) return null;
    var from = findEmoji(m[1]);
    var to = findEmoji(m[2]);
    if (!from || !to) return null;
    if (from === to) return { ok: true, msg: "Those are the same picture already!" };
    var present = window.ArcadeMods.isOnPage(from);
    window.ArcadeMods.addSwap(from, to);
    window.ArcadeMods.note(from + " -> " + to);
    if (!present) {
      return { ok: true, msg: "Set " + from + " → " + to + ", but there's no " + from +
        " on this page so nothing changes here. Try it in a game that uses " + from + "." };
    }
    return { ok: true, msg: "Swapped " + from + " for " + to + " — look at the game!" };
  }

  function trySpeed(t) {
    var faster = hasWord(t, ["faster", "quicker", "fast", "quick", "speedy", "zoom", "rapid", "hyper"]) ||
      /speed (it |the \w+ )?up|speed up|more speed|go faster/.test(t);
    var slower = hasWord(t, ["slower", "slow", "sluggish", "slowmo"]) ||
      /slow (it|the \w+|down)|slow down|less speed|slo-?mo/.test(t);
    if (/zoom (in|out)/.test(t)) return null; // that's a size request
    if (!faster && !slower) return null;
    if (faster && slower) faster = !/slow/.test(t.split(" ")[0]);
    var amt = amountFrom(t);
    var cur = window.ArcadeMods.getSpeed();
    var applied = window.ArcadeMods.setSpeed(faster ? cur * amt : cur / amt);
    window.ArcadeMods.note("speed x" + applied.toFixed(2));
    return { ok: true, msg: (faster ? "Faster" : "Slower") + " — now " +
      applied.toFixed(2) + "x normal speed." + seeIt() };
  }

  function tryColor(t) {
    var found = findColor(t);
    var keyworded = hasWord(t, ["colour", "color", "background", "paint", "tint"]) ||
      /make (it|everything|them)|turn (it|everything|them)/.test(t);
    // A colour word plus something meaning "the whole thing" is enough:
    // "everything to be green", "all green", "green screen".
    var scoped = found && /\b(everything|all|it|screen|game|whole|board)\b/.test(t);
    if (!keyworded && !scoped) return null;
    if (!found) return null;
    var rot = (HUE[found] - 300 + 360) % 360;
    var filter = found === "black" ? "brightness(0.35)"
      : found === "white" ? "brightness(1.6) saturate(0.4)"
      : (found === "grey" || found === "gray") ? "grayscale(1)"
      : "hue-rotate(" + rot + "deg) saturate(1.35)";
    window.ArcadeMods.setTint(filter);
    if (/\b(background|behind|back)\b/.test(t)) {
      window.ArcadeMods.setColor("--bg", COLORS[found]);
      window.ArcadeMods.setColor("--bg-alt", COLORS[found]);
    } else {
      window.ArcadeMods.setColor("--accent", COLORS[found]);
      window.ArcadeMods.setColor("--accent-2", COLORS[found]);
      window.ArcadeMods.setColor("--accent-3", COLORS[found]);
    }
    window.ArcadeMods.note("colour " + found);
    return { ok: true, msg: "Everything's " + found + " now." + seeIt() };
  }

  function tryHotkey(t, raw) {
    var tight = raw.toLowerCase().replace(/\s*\+\s*/g, "+");
    var hasCombo = /((?:command|control|ctrl|cmd|shift|alt|option)\+)+[a-z0-9]\b/.test(tight);
    if (!hasCombo && !hasWord(t, ["press", "click", "hit", "push", "shortcut", "key", "button", "command"])) return null;
    var combo = /((?:command|control|ctrl|cmd|shift|alt|option)\+)+[a-z0-9]\b/.exec(tight);
    if (!combo) {
      if (/\b(press|hit|push)\s+(?:the\s+)?['"]?([a-z0-9])['"]?\b/.test(tight)) {
        return { ok: true, msg: "Pair it with ctrl, shift or alt (like ctrl+g) — a plain " +
          "letter would fire while you're typing in a game." };
      }
      return null;
    }
    var str = combo[0];
    var spec = {
      combo: str, key: str.slice(-1),
      ctrl: /ctrl|control|cmd|command/.test(str),
      shift: /shift/.test(str),
      alt: /alt|option/.test(str),
      action: null
    };
    if (hasWord(t, ["admin", "panel"])) spec.action = "admin";
    else if (hasWord(t, ["home", "arcade", "menu", "main"])) spec.action = "home";
    else if (hasWord(t, ["restart", "again"]) || /new game/.test(t)) spec.action = "restart";
    else if (hasWord(t, ["theme", "colour", "color", "dark", "light"])) spec.action = "theme";
    else if (hasWord(t, ["faster", "quicker"])) spec.action = "faster";
    else if (hasWord(t, ["slower", "slow"])) spec.action = "slower";
    else if (hasWord(t, ["reset", "undo", "normal"])) spec.action = "reset";
    if (!spec.action) {
      return { ok: true, msg: "Which should " + str.toUpperCase() + " do? Try: open the admin " +
        "panel, go home, restart, switch theme, faster, slower, or reset." };
    }
    window.ArcadeMods.addHotkey(spec);
    window.ArcadeMods.note("hotkey " + str);
    return { ok: true, msg: "Saved — " + str.toUpperCase() + " will now " +
      window.ArcadeMods.actions[spec.action].label + "." };
  }

  function tryQuestion(t) {
    if (/my (friend )?code|what.*my code/.test(t)) {
      return { ok: true, msg: "Your friend code is " +
        (window.ArcadeFriends ? window.ArcadeFriends.myCode() : "(not loaded)") + "." };
    }
    if (/how many games|number of games/.test(t)) {
      return { ok: true, msg: "There are 100 games on the site." };
    }
    if (/who (made|built|created)/.test(t)) {
      return { ok: true, msg: "Tim made this arcade. 🕹️" };
    }
    return null;
  }

  var HANDLERS = [tryReset, tryHelp, tryQuestion, tryPause, tryTheme, trySwap,
    trySize, tryEffect, trySpeed, tryColor, tryHotkey];

  function runOne(raw) {
    var t = normalize(raw);
    if (!t) return null;
    for (var i = 0; i < HANDLERS.length; i++) {
      var res = HANDLERS[i](t, raw);
      if (res) return res;
    }
    return null;
  }

  // "make it faster and turn everything green" -> two instructions.
  function split(raw) {
    var protectedPhrases = /black and white/gi;
    var holder = [];
    var masked = String(raw).replace(protectedPhrases, function (m) {
      holder.push(m); return " " + (holder.length - 1) + " ";
    });
    var parts = masked.split(/\s+and\s+then\s+|\s+and\s+|\s*,\s*|\s+then\s+/i);
    return parts.map(function (p) {
      return p.replace(/ (\d+) /g, function (m, i) { return holder[i]; }).trim();
    }).filter(Boolean);
  }

  function ask(raw) {
    var text = String(raw || "").trim();
    if (!text) return { ok: false, msg: ERR };
    var low = text.toLowerCase();
    for (var i = 0; i < RUDE.length; i++) if (low.indexOf(RUDE[i]) !== -1) return { ok: false, msg: ERR };

    // Try it as several instructions first, but only accept that reading if
    // at least two pieces genuinely mean something. Otherwise fall back to
    // the whole sentence, which keeps phrases like "when I press ctrl+Q and
    // open the admin panel" in one piece.
    var parts = split(text);
    if (parts.length > 1) {
      var msgs = [], hits = 0;
      for (var i = 0; i < parts.length; i++) {
        var r = runOne(parts[i]);
        if (r) { hits++; msgs.push(r.msg); }
      }
      if (hits >= 2) return { ok: true, msg: msgs.join("\n") };
    }

    var whole = runOne(text);
    if (whole) return whole;

    // One understood piece inside a longer sentence is better than an error.
    if (parts.length > 1) {
      for (var j = 0; j < parts.length; j++) {
        var one = runOne(parts[j]);
        if (one) return one;
      }
    }
    return { ok: false, msg: ERR };
  }

  window.ArcadeAI = { ask: ask, ERR: ERR, emoji: EMOJI, normalize: normalize };
})();
