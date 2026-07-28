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
    magenta: "#ff2e97", turquoise: "#29e0c9",
    crimson: "#dc143c", scarlet: "#ff2400", ruby: "#e0115f", maroon: "#800000",
    navy: "#001f7a", aqua: "#00ffff", emerald: "#00c957", mint: "#98ff98",
    olive: "#808000", indigo: "#4b0082", lavender: "#c9a7ff",
    coral: "#ff7f50", salmon: "#fa8072", peachy: "#ffb07c", tan: "#d2b48c",
    beige: "#f5f5dc", silver: "#c0c0c0", bronze: "#cd7f32", rose: "#ff66a3"
  };

  var HUE = {
    red: 0, orange: 25, gold: 40, yellow: 50, lime: 80, green: 120,
    teal: 175, cyan: 175, turquoise: 175, blue: 210, purple: 275,
    violet: 275, magenta: 315, pink: 330, white: 0, black: 0, grey: 0, gray: 0,
    crimson: 348, scarlet: 8, ruby: 337, maroon: 0, navy: 225, aqua: 180,
    emerald: 145, mint: 150, olive: 60, indigo: 275, lavender: 270,
    coral: 16, salmon: 6, peachy: 25, tan: 34, beige: 60, silver: 0,
    bronze: 30, rose: 340
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

  function doReset() {
    window.ArcadeMods.resetAll();
    return { ok: true, msg: "Done — everything is back to normal." };
  }

  function doHelp() {
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

  function doPause(t) {
    var go = hasWord(t, ["unpause", "resume", "unfreeze", "continue", "unstop"]) ||
      /start again|keep going|carry on/.test(t);
    if (go) { window.ArcadeMods.setPaused(false); return { ok: true, msg: "Running again." }; }
    window.ArcadeMods.setPaused(true);
    window.ArcadeMods.note("paused");
    return { ok: true, msg: "Frozen. Say \"unpause\" to start it moving again." };
  }

  function doSize(t) {
    var small = hasWord(t, ["smaller", "tinier", "shrink", "tiny", "minuscule"]) || /zoom out|scale down/.test(t);
    var big = !small;
    if (/zoom out/.test(t)) { big = false; small = true; }
    var step = hasWord(t, ["bit", "little", "slightly"]) ? 1.15 : 1.35;
    var cur = window.ArcadeMods.getScale();
    var applied = window.ArcadeMods.setScale(big ? cur * step : cur / step);
    window.ArcadeMods.note("scale " + applied.toFixed(2));
    return { ok: true, msg: (big ? "Bigger" : "Smaller") + " — now " +
      Math.round(applied * 100) + "% size." + seeIt() };
  }

  function doEffect(t) {
    var f = null, name = "";
    if (/black and white|no colou?r/.test(t) ||
        hasExact(t, ["greyscale", "grayscale", "monochrome", "colourless", "colorless"])) {
      f = "grayscale(1)"; name = "black and white";
    }
    else if (hasExact(t, ["invert", "inverted", "negative", "opposite", "flip", "reverse", "flipped", "reversed"])) {
      f = "invert(1)"; name = "inverted";
    }
    else if (hasExact(t, ["blurry", "blur", "fuzzy"])) { f = "blur(2px)"; name = "blurry"; }
    else if (/wash(ed)? out/.test(t) || hasExact(t, ["desaturate", "desaturated", "faded", "pale", "washed"])) {
      f = "saturate(0.25)"; name = "washed out";
    }
    else if (hasWord(t, ["brighter", "brighten", "brightness"]) || /crank|light(en| it) up/.test(t)) {
      f = "brightness(1.5)"; name = "brighter";
    }
    else if (hasWord(t, ["darker", "darken", "dimmer", "gloomy", "murky"]) || hasExact(t, ["dim"])) {
      f = "brightness(0.5)"; name = "darker";
    }
    else if (hasWord(t, ["rainbow", "psychedelic", "trippy"])) { f = "hue-rotate(120deg) saturate(2.2) contrast(1.2)"; name = "rainbow-ish"; }
    if (!f) return null;
    window.ArcadeMods.setTint(f);
    window.ArcadeMods.note(name);
    return { ok: true, msg: "Made it " + name + "." + seeIt() };
  }

  function themePick(t) {
    var pick = null;
    Object.keys(THEME_WORDS).forEach(function (w) {
      if (new RegExp("\\b" + w + "\\b").test(t)) pick = THEME_WORDS[w];
    });
    return pick;
  }

  function doTheme(t) {
    var pick = themePick(t);
    if (!pick) return null;
    var applied = window.ArcadeCommon.setTheme(pick);
    window.ArcadeMods.note("theme " + applied.id);
    return { ok: true, msg: "Theme is now " + applied.label + " " + applied.icon +
      " (themes stay after a refresh)." };
  }

  function swapPair(raw) {
    var r = String(raw);
    var m =
      // change/swap/turn/replace/make X (in)to/with/for Y
      /(?:change|swap|turn|replace|make|put|use|switch|substitute)\s+(?:the\s+|a\s+|an\s+|some\s+|that\s+|this\s+)?([a-z]+)\s*(?:out\s+)?(?:in ?to|into|to be|to|with|for|as)\s+(?:the\s+|a\s+|an\s+|some\s+)?([^\s,.!?]+)/i.exec(r) ||
      // instead of X (use/put/show) Y
      /instead of\s+(?:the\s+|a\s+|an\s+)?([a-z]+)[,\s]+(?:you can\s+)?(?:use|put|show|have|do|make it|maybe)?\s*(?:the\s+|a\s+|an\s+)?([^\s,.!?]+)/i.exec(r) ||
      // no more X, use Y
      /(?:no more|get rid of)\s+(?:the\s+)?([a-z]+)[,\s]+(?:use|put|show)?\s*(?:the\s+|a\s+|an\s+)?([^\s,.!?]+)/i.exec(r) ||
      // X should/ought to be a Y
      /(?:the\s+|a\s+)?([a-z]+)\s+(?:should|ought to|needs to|has to|must)\s+be\s+(?:a\s+|an\s+|the\s+)?([^\s,.!?]+)/i.exec(r) ||
      // make the X a Y   (no connector word at all)
      /(?:make|turn)\s+(?:the\s+|a\s+)?([a-z]+)\s+(?:in\s*to\s+)?(?:a|an)\s+([a-z]+)/i.exec(r);
    if (m) {
      var from = findEmoji(m[1]), to = findEmoji(m[2]);
      if (from && to) return { from: from, to: to };
    }
    // Reversed wording: "put a shark where the bird is/was"
    var rev = /(?:put|use|show|place)\s+(?:a\s+|an\s+|the\s+)?([a-z]+)\s+(?:where|in place of|instead of)\s+(?:the\s+|a\s+|an\s+)?([a-z]+)/i.exec(r);
    if (rev) {
      var to2 = findEmoji(rev[1]), from2 = findEmoji(rev[2]);
      if (from2 && to2) return { from: from2, to: to2 };
    }
    return null;
  }

  function doSwap(t, raw) {
    var pair = swapPair(raw);
    if (!pair) {
      // "I'd rather see a crown" names what they want but not what to
      // replace - asking is more use than refusing.
      var words = String(raw).toLowerCase().split(/[^a-z]+/).filter(Boolean);
      for (var i = words.length - 1; i >= 0; i--) {
        var e = EMOJI[words[i]];
        if (e) return { ok: true, msg: "Which picture should become " + e +
          "? Try \"change the bird into " + words[i] + "\"." };
      }
      return null;
    }
    var from = pair.from, to = pair.to;
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

  function doSpeed(t) {
    var slower = hasWord(t, ["slower", "slow", "sluggish", "slowmo", "crawl", "snail"]) ||
      /slow (it|the \w+|down)|less speed|slo-?mo/.test(t);
    var faster = !slower;
    var amt = amountFrom(t);
    var cur = window.ArcadeMods.getSpeed();
    var applied = window.ArcadeMods.setSpeed(faster ? cur * amt : cur / amt);
    window.ArcadeMods.note("speed x" + applied.toFixed(2));
    return { ok: true, msg: (faster ? "Faster" : "Slower") + " — now " +
      applied.toFixed(2) + "x normal speed." + seeIt() };
  }

  function doColour(t) {
    // The scorer already decided this is a colour request; all we need is a
    // colour word to act on.
    var found = findColor(t);
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

  function doHotkey(t, raw) {
    var tight = String(raw).toLowerCase().replace(/\s*\+\s*/g, "+");
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

  function doQuestion(t) {
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

  // ---------- intent scoring ----------
  //
  // Rather than requiring set phrases, every intent declares words that
  // point towards it. Any of those words, anywhere in the sentence, in any
  // order, adds to that intent's score; the slots found (a colour, a key
  // combo, two swappable pictures) add more. The highest scorer wins. That
  // is what lets unseen phrasings work instead of only the ones written as
  // patterns - "quicker" means speed whether you say "go quicker",
  // "quicker please" or "why is this not quicker".

  var CUES = {
    speed: { faster: 4, quicker: 4, slower: 4, fast: 3, quick: 3, slow: 3,
      speed: 3, speedy: 3, rapid: 3, hyper: 3, sluggish: 4, slowmo: 4,
      zoomy: 2, accelerate: 4, hurry: 3, crawl: 3, snail: 3, lightning: 2,
      turbo: 4, sonic: 2, pace: 2, tempo: 2, snappier: 4, snappy: 4,
      zippy: 4, nippy: 3, brisk: 3, swift: 3, speedier: 4, laggy: 3,
      lagging: 3, dragging: 3, plodding: 3, breakneck: 4, blazing: 3,
      frantic: 3, gentler: 3, calmer: 3, relaxed: 2, leisurely: 3 },
    size: { bigger: 4, larger: 4, huge: 4, enlarge: 4, smaller: 4, tinier: 4,
      shrink: 4, tiny: 3, big: 3, small: 3, size: 3, giant: 4, massive: 4,
      minuscule: 3, scale: 3, chunkier: 4, wider: 3, zoom: 3, magnify: 4,
      expand: 4, grow: 3, stretch: 3, compact: 3, shrunk: 4, oversized: 4 },
    pause: { pause: 5, freeze: 5, unpause: 6, resume: 5, unfreeze: 6,
      frozen: 4, stop: 3, halt: 4, wait: 3, continue: 4, hold: 3,
      chill: 3, standby: 3, suspend: 4, restart: 2, unhold: 4, going: 2 },
    effect: { invert: 5, inverted: 5, negative: 3, greyscale: 5, grayscale: 5,
      blur: 5, blurry: 5, fuzzy: 4, brighter: 4, brighten: 4, darker: 4,
      darken: 4, dim: 3, rainbow: 5, psychedelic: 5, trippy: 5, glow: 2,
      brightness: 4, dimmer: 4, gloomy: 3, washed: 4, desaturate: 5,
      desaturated: 5, faded: 4, pale: 3, monochrome: 5, colourless: 4,
      colorless: 4, flip: 3, reverse: 3, opposite: 3, crank: 2, murky: 3 },
    colour: { colour: 4, color: 4, background: 4, paint: 4, tint: 4,
      colours: 4, colors: 4, backdrop: 3 },
    theme: { theme: 5, skin: 4, mode: 2, style: 3, look: 2, hacker: 4,
      matrix: 4, synthwave: 5, vaporwave: 5, ocean: 4, amber: 4, grape: 4,
      retro: 4, neon: 3 },
    swap: { instead: 5, replace: 5, swap: 5, change: 3, turn: 2, become: 4,
      becomes: 4, into: 3, rather: 4, ought: 3, should: 2, where: 2,
      substitute: 5, switch: 3, exchange: 4 },
    hotkey: { press: 4, shortcut: 5, hotkey: 5, keybind: 5, hit: 2, push: 2,
      click: 2, key: 3, button: 2, binding: 4 },
    reset: { reset: 6, undo: 6, revert: 5, normal: 4, restore: 5, default: 4,
      original: 4, unchanged: 3, scrap: 5, discard: 5, cancel: 4, wipe: 4,
      forget: 4, ditch: 4, clear: 3, remove: 3, undoing: 5 },
    help: { help: 6, commands: 5, examples: 4, options: 4, instructions: 4,
      capabilities: 4, abilities: 4 }
  };

  var RUNNERS = {
    speed: doSpeed, size: doSize, pause: doPause, effect: doEffect,
    colour: doColour, theme: doTheme, swap: doSwap, hotkey: doHotkey,
    reset: doReset, help: doHelp
  };

  // Order used to break ties, most specific first.
  var PRIORITY = ["reset", "help", "pause", "hotkey", "swap", "theme",
    "effect", "size", "colour", "speed"];

  function scoreAll(t, raw) {
    var words = t.split(/[^a-z0-9+]+/).filter(Boolean);
    var scores = {};
    Object.keys(CUES).forEach(function (intent) {
      var total = 0, map = CUES[intent];
      words.forEach(function (w) {
        if (map[w]) { total += map[w]; return; }
        // typo tolerance, but never for short words where it collides
        Object.keys(map).forEach(function (cue) {
          if (cue.length >= 5 && near(w, cue)) total += map[cue] - 1;
        });
      });
      scores[intent] = total;
    });

    // Slot evidence - concrete things found in the sentence.
    var slots = {
      colour: findColor(t),
      amount: /\d+\s*(x|times)/.test(t) || hasWord(t, ["double", "twice", "triple", "half"]),
      combo: /((?:command|control|ctrl|cmd|shift|alt|option)\+)+[a-z0-9]\b/.test(
        String(raw).toLowerCase().replace(/\s*\+\s*/g, "+")),
      pair: swapPair(raw),
      theme: themePick(t)
    };
    if (slots.colour) scores.colour += 4;
    if (slots.combo) scores.hotkey += 6;
    if (slots.pair) scores.swap += 7;
    if (slots.theme) scores.theme += 3;
    if (slots.amount) scores.speed += 2;

    // Phrases that a single word can't capture.
    if (/back to normal|start over|as (it |they )?w(as|ere)|all (my |the )?changes/.test(t)) scores.reset += 5;
    if (/what (can|do|are)|how do i|what else|my options/.test(t)) scores.help += 5;
    if (/black and white|no colou?r/.test(t)) scores.effect += 6;
    if (/zoom (in|out)|scale (up|down)|blow (it |this |that )?up|too (small|big|tiny|large)/.test(t)) scores.size += 5;
    if (/speed .*up|slow .*down|go (faster|slower)|too (slow|fast)/.test(t)) scores.speed += 4;
    if (/keep going|carry on|run again|let it (run|go)|go on/.test(t)) scores.pause += 6;
    if (/wash(ed)? out|flip .*colou?rs?|reverse .*colou?rs?/.test(t)) scores.effect += 5;
    if (/make (it|everything|them|the \w+)|turn (it|everything|them)/.test(t)) {
      if (slots.colour) scores.colour += 3;
    }
    // "make X a Y" is a swap even with no swap verb
    if (slots.pair) scores.swap += 2;

    return { scores: scores, slots: slots };
  }

  function best(t, raw) {
    var res = scoreAll(t, raw);
    var top = null, topScore = 0;
    PRIORITY.forEach(function (id) {
      if (res.scores[id] > topScore) { topScore = res.scores[id]; top = id; }
    });
    return { id: top, score: topScore, slots: res.slots };
  }

  function runOne(raw) {
    var t = normalize(raw);
    if (!t) return null;
    var q = doQuestion(t);
    if (q) return q;
    var pick = best(t, raw);
    // Below this the sentence isn't really asking for anything we can do.
    // 3 is deliberately low so a single clear word ("stop") or a typo'd one
    // ("fastr", which scores one less than an exact hit) still counts;
    // unrelated sentences score 0 because none of their words are cues.
    if (!pick.id || pick.score < 3) return null;
    var out = RUNNERS[pick.id](t, raw, pick.slots);
    if (out) return out;
    // Winner couldn't complete (e.g. "change" with no recognisable pictures):
    // try the runners-up before giving up.
    var ordered = PRIORITY.slice().sort(function (a, b) {
      return (best(t, raw).slots, 0);
    });
    for (var i = 0; i < PRIORITY.length; i++) {
      var id = PRIORITY[i];
      if (id === pick.id) continue;
      var sc = scoreAll(t, raw).scores[id];
      if (sc >= 3) {
        var alt = RUNNERS[id](t, raw, pick.slots);
        if (alt) return alt;
      }
    }
    return null;
  }

  // "make it faster and turn everything green" -> two instructions.
  function split(raw) {
    var holder = [];
    var masked = String(raw).replace(/black and white/gi, function (m) {
      holder.push(m); return " \u0001" + (holder.length - 1) + " ";
    });
    return masked.split(/\s+and\s+then\s+|\s+and\s+|\s*,\s*|\s+then\s+/i)
      .map(function (p) {
        return p.replace(/\u0001(\d+)/g, function (m, i) { return holder[i]; }).trim();
      }).filter(Boolean);
  }

  function ask(raw) {
    var text = String(raw || "").trim();
    if (!text) return { ok: false, msg: ERR };
    var low = text.toLowerCase();
    // Whole-word match only: substring matching made "scrap" trip on "crap".
    for (var i = 0; i < RUDE.length; i++) {
      if (new RegExp("(^|[^a-z])" + RUDE[i] + "([^a-z]|$)").test(low)) return { ok: false, msg: ERR };
    }

    var parts = split(text);
    if (parts.length > 1) {
      var msgs = [], hits = 0;
      for (var j = 0; j < parts.length; j++) {
        var r = runOne(parts[j]);
        if (r) { hits++; msgs.push(r.msg); }
      }
      if (hits >= 2) return { ok: true, msg: msgs.join("\n") };
    }

    var whole = runOne(text);
    if (whole) return whole;

    if (parts.length > 1) {
      for (var k = 0; k < parts.length; k++) {
        var one = runOne(parts[k]);
        if (one) return one;
      }
    }
    return { ok: false, msg: ERR };
  }

  window.ArcadeAI = { ask: ask, ERR: ERR, emoji: EMOJI, normalize: normalize,
    debug: function (s) { return best(normalize(s), s); } };
})();
