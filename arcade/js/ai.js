/* Claude Arc Games — the admin "AI" command engine.

   HONEST DESCRIPTION: this is not a chatbot and there is no AI model behind
   it. A real one would need a paid server connection, which a static site
   can't have. What this DOES do is read a sentence you typed, work out which
   kind of change you're asking for, pull the details out of it (which game,
   how much, which emoji, which key), and then perform that change for real
   through ArcadeMods. It understands lots of different phrasings rather than
   a fixed menu - but only for the kinds of change listed in help(). Anything
   outside that returns the prohibited-message error. */
(function () {
  var ERR = "Error;error;ShowID(ai.extension<adminpanel>prohibited/Text.message();;return)";

  var RUDE = ["stupid", "dumb", "idiot", "hate you", "shut up", "suck", "trash",
    "useless", "hell", "damn", "crap", "screw you", "moron", "loser"];

  // Words people are likely to type -> the emoji actually drawn in the games.
  var EMOJI = {
    chicken: "🐔", egg: "🥚", bird: "🐦", snake: "🐍", worm: "🐛", ball: "⚪",
    apple: "🍎", banana: "🍌", cherry: "🍒", grape: "🍇", lemon: "🍋",
    watermelon: "🍉", melon: "🍉", strawberry: "🍓", kiwi: "🥝", peach: "🍑",
    orange: "🍊", pineapple: "🍍", coconut: "🥥", pizza: "🍕", burger: "🍔",
    cake: "🍰", donut: "🍩", star: "⭐", heart: "❤️", fire: "🔥", rocket: "🚀",
    car: "🚗", plane: "✈️", boat: "⛵", cat: "🐱", dog: "🐶", frog: "🐸",
    fish: "🐠", ghost: "👻", alien: "👾", monster: "👹", skull: "💀",
    moon: "🌙", sun: "☀️", cloud: "☁️", tree: "🌳", flower: "🌸",
    crown: "👑", diamond: "💎", coin: "🪙", money: "💰", bomb: "💣",
    rainbow: "🌈", lightning: "⚡", snowflake: "❄️", trophy: "🏆",
    football: "⚽", basketball: "🏀", tennis: "🎾", dice: "🎲",
    poop: "💩", robot: "🤖", unicorn: "🦄", dragon: "🐉", penguin: "🐧",
    monkey: "🐵", panda: "🐼", lion: "🦁", tiger: "🐯", bear: "🐻",
    mushroom: "🍄", cookie: "🍪", candy: "🍬", icecream: "🍦", "ice cream": "🍦"
  };

  var COLORS = {
    red: "#ff4141", green: "#00ff41", blue: "#3aa0ff", yellow: "#ffd23f",
    orange: "#ff8c1a", purple: "#b14aff", pink: "#ff5da2", cyan: "#29e0c9",
    white: "#ffffff", black: "#05070f", grey: "#8a90ad", gray: "#8a90ad",
    lime: "#b6ff00", gold: "#ffab00", teal: "#00c2ff"
  };

  // Approximate hue of each colour, used to rotate the canvas towards it.
  var HUE = {
    red: 0, orange: 25, gold: 40, yellow: 50, lime: 80, green: 120,
    teal: 175, cyan: 175, blue: 210, purple: 275, pink: 330,
    white: 0, black: 0, grey: 0, gray: 0
  };

  var THEME_WORDS = {
    dark: "dark", night: "dark", light: "light", day: "light", bright: "light",
    green: "matrix", matrix: "matrix", hacker: "matrix",
    synthwave: "synthwave", neon: "synthwave", retro: "amber",
    ocean: "ocean", sea: "ocean", water: "ocean", blue: "ocean",
    amber: "amber", orange: "amber", grape: "grape", purple: "grape"
  };

  function findEmoji(word) {
    if (!word) return null;
    var w = word.toLowerCase().trim().replace(/^(a|an|the)\s+/, "");
    if (EMOJI[w]) return EMOJI[w];
    // Already an emoji? Anything outside the basic ASCII range counts.
    if (/[‼-\uDFFF]/.test(word)) return word.trim();
    if (EMOJI[w.replace(/s$/, "")]) return EMOJI[w.replace(/s$/, "")];
    return null;
  }

  function amountFrom(text) {
    var m = /(\d+(?:\.\d+)?)\s*(?:x|times)/.exec(text);
    if (m) return parseFloat(m[1]);
    if (/\b(way|much|a lot|super|really|very)\b/.test(text)) return 2.5;
    if (/\b(bit|little|slightly|tiny)\b/.test(text)) return 1.25;
    return 1.6;
  }

  // ---------- intent handlers ----------

  function tryReset(t) {
    if (!/\b(reset|undo|back to normal|normal again|revert|clear (the )?changes|start over)\b/.test(t)) return null;
    window.ArcadeMods.resetAll();
    return { ok: true, msg: "Done — everything is back to normal. (A refresh always does this too.)" };
  }

  function tryHelp(t) {
    if (!/\b(help|what can you do|commands|how do i|examples?)\b/.test(t)) return null;
    return { ok: true, msg:
      "Type normal sentences. Things I can really do:\n" +
      "• Speed — \"make the ball faster\", \"slow snake down\", \"3x faster\"\n" +
      "• Swap pictures — \"change the chicken to an egg\", \"replace the bird with a rocket\"\n" +
      "• Colours — \"make the background black\", \"turn everything green\"\n" +
      "• Themes — \"green on black theme\", \"switch to synthwave\"\n" +
      "• New shortcuts — \"when I press ctrl+Q open the admin panel\"\n" +
      "• \"reset\" undoes it all. Refreshing the page does too." };
  }

  function trySpeed(t) {
    var faster = /\b(faster|speed up|speed it up|quicker|quick|fast|accelerate|hurry)\b/.test(t);
    var slower = /\b(slower|slow down|slow it down|slow|slo-?mo|slower motion|calm down)\b/.test(t);
    if (!faster && !slower) return null;
    var amt = amountFrom(t);
    var cur = window.ArcadeMods.getSpeed();
    var next = faster ? cur * amt : cur / amt;
    var applied = window.ArcadeMods.setSpeed(next);
    var what = /\bball\b/.test(t) ? "the ball" : /\bgame\b/.test(t) ? "the game" : "everything";
    window.ArcadeMods.note("Speed x" + applied.toFixed(2));
    return { ok: true, msg: (faster ? "Sped up " : "Slowed down ") + what +
      " — now running at " + applied.toFixed(2) + "x normal speed." +
      (isGamePage() ? "" : " (Open a game to see it.)") };
  }

  function trySwap(t, raw) {
    // "change the chicken to an egg" / "instead of a bird use a rocket" /
    // "replace X with Y" / "turn the snake into a worm" / "make the ball a star"
    var m =
      /(?:change|swap|turn|replace|make)\s+(?:the\s+|a\s+|an\s+)?(.+?)\s+(?:in ?to|into|to|with|for|be)\s+(?:the\s+|a\s+|an\s+)?([^\s.!,]+)/i.exec(raw) ||
      /instead of\s+(?:the\s+|a\s+|an\s+)?(.+?)[,\s]+(?:use|put|show|maybe|have)?\s*(?:the\s+|a\s+|an\s+)?([^\s.!,]+)/i.exec(raw);
    if (!m) return null;
    var from = findEmoji(m[1]);
    var to = findEmoji(m[2]);
    if (!from || !to) return null;
    if (from === to) return { ok: true, msg: "Those are already the same picture!" };
    var present = window.ArcadeMods.isOnPage(from);
    window.ArcadeMods.addSwap(from, to);
    window.ArcadeMods.note(from + " -> " + to);
    if (!present) {
      // Don't claim a change the player will never see.
      return { ok: true, msg: "Set up " + from + " → " + to + ", but I can't see any " +
        from + " on this page, so nothing will look different here. Try it on a game " +
        "that actually uses " + from + "." };
    }
    return { ok: true, msg: "Swapped " + from + " for " + to + " — look at the game!" };
  }

  function tryColor(t, raw) {
    if (!/\b(colou?r|background|make (it|everything)|turn (it|everything)|paint)\b/.test(t)) return null;
    var found = null;
    Object.keys(COLORS).forEach(function (c) {
      if (new RegExp("\\b" + c + "\\b").test(t)) found = c;
    });
    if (!found) return null;
    // Games paint hard-coded colours straight onto the canvas, so changing
    // CSS variables alone leaves the actual game looking identical. Tinting
    // the canvas is what the player actually sees change.
    var rot = (HUE[found] - 300 + 360) % 360;
    var filter = found === "black" ? "brightness(0.35)"
      : found === "white" ? "brightness(1.6) saturate(0.4)"
      : (found === "grey" || found === "gray") ? "grayscale(1)"
      : "hue-rotate(" + rot + "deg) saturate(1.35)";
    window.ArcadeMods.setTint(filter);

    var bg = /\b(background|behind|back)\b/.test(t);
    if (bg) {
      window.ArcadeMods.setColor("--bg", COLORS[found]);
      window.ArcadeMods.setColor("--bg-alt", COLORS[found]);
    } else {
      window.ArcadeMods.setColor("--accent", COLORS[found]);
      window.ArcadeMods.setColor("--accent-2", COLORS[found]);
      window.ArcadeMods.setColor("--accent-3", COLORS[found]);
    }
    window.ArcadeMods.note((bg ? "background " : "colour ") + found);
    return { ok: true, msg: "Everything is " + found + " now" +
      (isGamePage() ? " — including the game itself." : ". Open a game to see it there too.") };
  }

  function tryTheme(t) {
    if (!/\b(theme|mode|skin|style|look)\b/.test(t)) return null;
    var pick = null;
    Object.keys(THEME_WORDS).forEach(function (w) {
      if (new RegExp("\\b" + w + "\\b").test(t)) pick = THEME_WORDS[w];
    });
    if (!pick) return null;
    var applied = window.ArcadeCommon.setTheme(pick);
    window.ArcadeMods.note("theme " + applied.id);
    return { ok: true, msg: "Theme switched to " + applied.label + " " + applied.icon +
      " (this one is saved and survives a refresh)." };
  }

  function tryHotkey(t, raw) {
    if (!/\b(press|click|hit|push|shortcut|command|key)\b/.test(t)) return null;
    var tightened = raw.replace(/\s*\+\s*/g, "+");
    // Must include a real modifier, otherwise a stray letter inside an
    // ordinary word ("whe[n]") gets mistaken for the key.
    var combo = /((?:command|control|ctrl|cmd|shift|alt)\+)+[a-z0-9]\b/i.exec(tightened);
    if (!combo) {
      // "press G to..." with no modifier - explain rather than silently fail.
      if (/\b(press|hit|push)\s+(?:the\s+)?['"]?([a-z0-9])['"]?\b/i.test(tightened)) {
        return { ok: true, msg: "Use a modifier with it (like ctrl+g or shift+g) — " +
          "a plain letter would fire while you're typing in games." };
      }
      return null;
    }
    var str = combo[0].toLowerCase();
    var key = str.slice(-1);
    var spec = {
      combo: str, key: key,
      ctrl: /ctrl|control|cmd/.test(str),
      shift: /shift/.test(str),
      alt: /alt/.test(str),
      action: null
    };
    if (/\badmin\b/.test(t)) spec.action = "admin";
    else if (/\b(home|arcade|menu|main)\b/.test(t)) spec.action = "home";
    else if (/\b(restart|new game|again)\b/.test(t)) spec.action = "restart";
    else if (/\btheme|colou?r|dark|light\b/.test(t)) spec.action = "theme";
    else if (/\bfaster|speed up\b/.test(t)) spec.action = "faster";
    else if (/\bslow/.test(t)) spec.action = "slower";
    else if (/\breset|undo|normal\b/.test(t)) spec.action = "reset";
    if (!spec.action) return null;
    window.ArcadeMods.addHotkey(spec);
    window.ArcadeMods.note("hotkey " + str);
    return { ok: true, msg: "Shortcut saved: press " + str.toUpperCase() + " to " +
      window.ArcadeMods.actions[spec.action].label + "." };
  }

  function isGamePage() {
    return /\/games\//.test(location.pathname);
  }

  // ---------- main ----------

  var HANDLERS = [tryReset, tryHelp, tryTheme, trySwap, trySpeed, tryColor, tryHotkey];

  function ask(raw) {
    var text = String(raw || "").trim();
    if (!text) return { ok: false, msg: ERR };
    var t = text.toLowerCase();

    for (var i = 0; i < RUDE.length; i++) {
      if (t.indexOf(RUDE[i]) !== -1) return { ok: false, msg: ERR };
    }

    for (var h = 0; h < HANDLERS.length; h++) {
      var res = HANDLERS[h](t, text);
      if (res) return res;
    }
    // Understood nothing it can actually carry out.
    return { ok: false, msg: ERR };
  }

  window.ArcadeAI = { ask: ask, ERR: ERR, emoji: EMOJI };
})();
