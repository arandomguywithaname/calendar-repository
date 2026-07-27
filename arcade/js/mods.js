/* Claude Arc Games — live mod engine.

   Loaded BEFORE each game's game.js so it can wrap the browser APIs the
   games use (requestAnimationFrame, setInterval, canvas fillText). That
   lets the admin AI panel change a running game without touching its source
   code at all - which is also why every change disappears on refresh: it
   only ever lives in memory.

   Nothing here is written to storage on purpose. Refresh = back to normal. */
(function () {
  var speed = 1;            // 1 = normal, 2 = double, 0.5 = half
  var swaps = {};           // "🐔" -> "🥚" applied to canvas + DOM text
  var colorOverrides = {};  // css var name -> value
  var styleEl = null;
  var hotkeys = [];         // { combo, action, label }
  var history = [];         // human-readable list of what's changed

  // ---------- speed ----------

  var origRAF = window.requestAnimationFrame.bind(window);
  var origInterval = window.setInterval.bind(window);
  var swallowing = false;

  window.requestAnimationFrame = function (cb) {
    // While replaying a frame we must not let the game queue extra loops,
    // or each replay would fork a new chain and multiply forever.
    if (swallowing) return -1;

    var frames = 0;
    function tick(t) {
      if (speed >= 1) {
        var reps = Math.max(1, Math.round(speed));
        for (var i = 0; i < reps; i++) {
          // Every repeat except the last is swallowed, so exactly one new
          // frame gets queued no matter how many times we advance the game.
          swallowing = (i < reps - 1);
          try { cb(t); } catch (e) { swallowing = false; throw e; }
          swallowing = false;
        }
      } else {
        // Slow motion: keep the rAF chain alive ourselves on skipped frames,
        // otherwise the game never re-queues and the loop dies.
        var every = Math.max(1, Math.round(1 / Math.max(0.05, speed)));
        frames++;
        if (frames % every === 0) cb(t);
        else origRAF(tick);
      }
    }
    return origRAF(tick);
  };

  window.setInterval = function (fn, delay) {
    var scaled = function () { return Math.max(4, (delay || 0) / speed); };
    // Interval delay can't be changed after the fact, so re-arm a timeout
    // chain that reads the CURRENT speed each tick.
    var stopped = false;
    var handle = { stopped: false };
    function loop() {
      if (handle.stopped) return;
      try { fn(); } catch (e) {}
      if (!handle.stopped) handle.id = setTimeout(loop, scaled());
    }
    handle.id = setTimeout(loop, scaled());
    intervalHandles.push(handle);
    return handle;
  };
  var intervalHandles = [];
  var origClearInterval = window.clearInterval.bind(window);
  window.clearInterval = function (h) {
    if (h && typeof h === "object" && "id" in h) { h.stopped = true; clearTimeout(h.id); return; }
    return origClearInterval(h);
  };

  function setSpeed(v) {
    speed = Math.max(0.1, Math.min(6, v));
    return speed;
  }

  // ---------- emoji / text swaps ----------

  var origFillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (text) {
    var t = applySwaps(String(text));
    var args = Array.prototype.slice.call(arguments);
    args[0] = t;
    return origFillText.apply(this, args);
  };

  function applySwaps(s) {
    var keys = Object.keys(swaps);
    for (var i = 0; i < keys.length; i++) {
      if (s.indexOf(keys[i]) !== -1) s = s.split(keys[i]).join(swaps[keys[i]]);
    }
    return s;
  }

  // DOM games draw with text nodes rather than canvas, so sweep those too.
  var sweepTimer = null;
  function sweepDom() {
    if (!Object.keys(swaps).length) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var p = node.parentNode;
      if (p && (p.id === "adm-overlay" || p.closest && p.closest("#adm-overlay"))) continue;
      var next = applySwaps(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
  }
  function startSweeping() {
    if (sweepTimer) return;
    sweepTimer = origInterval(sweepDom, 250);
  }

  function addSwap(from, to) {
    swaps[from] = to;
    startSweeping();
    sweepDom();
  }

  // ---------- colors ----------

  function setColor(varName, value) {
    colorOverrides[varName] = value;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "arc-mod-style";
      document.head.appendChild(styleEl);
    }
    var css = ":root{";
    Object.keys(colorOverrides).forEach(function (k) { css += k + ":" + colorOverrides[k] + " !important;"; });
    styleEl.textContent = css + "}";
  }

  // ---------- hotkeys ----------

  var ACTIONS = {
    admin: { label: "open the admin panel", run: function () { if (window.ArcadeAdmin) window.ArcadeAdmin.open(); } },
    home: { label: "go to the arcade home page", run: function () {
      var d = window.ARCADE_ROOT_DEPTH || 0;
      location.href = (d === 0 ? "" : "../".repeat(d)) + "index.html";
    } },
    restart: { label: "restart the game", run: function () {
      var b = document.getElementById("restart");
      if (b) b.click();
    } },
    theme: { label: "switch theme", run: function () {
      var b = document.getElementById("theme-toggle");
      if (b) { b.click(); return; }
      var list = window.ArcadeCommon.themes;
      var cur = document.documentElement.getAttribute("data-theme");
      var i = 0;
      for (var k = 0; k < list.length; k++) if (list[k].id === cur) { i = k; break; }
      window.ArcadeCommon.setTheme(list[(i + 1) % list.length].id);
    } },
    faster: { label: "speed the game up", run: function () { setSpeed(speed * 1.5); } },
    slower: { label: "slow the game down", run: function () { setSpeed(speed / 1.5); } },
    reset: { label: "undo all changes", run: function () { resetAll(); } }
  };

  document.addEventListener("keydown", function (e) {
    if (!hotkeys.length) return;
    var key = (e.key || "").toLowerCase();
    for (var i = 0; i < hotkeys.length; i++) {
      var h = hotkeys[i];
      if (h.key === key && !!h.ctrl === (e.ctrlKey || e.metaKey) &&
          !!h.shift === e.shiftKey && !!h.alt === e.altKey) {
        e.preventDefault();
        var a = ACTIONS[h.action];
        if (a) a.run();
        return;
      }
    }
  });

  function addHotkey(spec) {
    hotkeys = hotkeys.filter(function (h) { return h.combo !== spec.combo; });
    hotkeys.push(spec);
  }

  // ---------- reset ----------

  function resetAll() {
    speed = 1;
    swaps = {};
    colorOverrides = {};
    if (styleEl) { styleEl.textContent = ""; }
    hotkeys = [];
    history = [];
    sweepDom();
  }

  function note(text) {
    history.push(text);
    if (history.length > 40) history.shift();
  }

  window.ArcadeMods = {
    setSpeed: setSpeed,
    getSpeed: function () { return speed; },
    addSwap: addSwap,
    getSwaps: function () { return swaps; },
    setColor: setColor,
    getColors: function () { return colorOverrides; },
    addHotkey: addHotkey,
    getHotkeys: function () { return hotkeys; },
    actions: ACTIONS,
    resetAll: resetAll,
    note: note,
    history: function () { return history.slice(); }
  };
})();
