/* Claude Arc Games — shared helpers used by the hub and every game page. */
(function () {
  var THEME_KEY = "arcade.theme";

  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    var theme = saved || "dark";
    document.documentElement.setAttribute("data-theme", theme);
    var btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.textContent = theme === "dark" ? "☀️" : "🌙";
      btn.addEventListener("click", function () {
        var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
        btn.textContent = next === "dark" ? "☀️" : "🌙";
      });
    }
  }

  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById("arcade-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "arcade-toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }

  function getBest(gameId) {
    try {
      var v = localStorage.getItem("arcade.best." + gameId);
      return v === null ? null : Number(v);
    } catch (e) { return null; }
  }

  function setBest(gameId, score) {
    try {
      var prev = getBest(gameId);
      if (prev === null || score > prev) {
        localStorage.setItem("arcade.best." + gameId, String(score));
        return true;
      }
    } catch (e) {}
    return false;
  }

  function setBestLowerIsBetter(gameId, value) {
    try {
      var prev = getBest(gameId);
      if (prev === null || value < prev) {
        localStorage.setItem("arcade.best." + gameId, String(value));
        return true;
      }
    } catch (e) {}
    return false;
  }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // Difficulty selector: a shared row of Easy/Medium/Hard chips that games
  // drop into a container. Remembers the last choice per game in localStorage.
  // onChange(levelKey) fires immediately with the saved (or default) level,
  // then again whenever the player picks a different one.
  var DEFAULT_LEVELS = [
    { key: "easy", label: "Easy" },
    { key: "medium", label: "Medium" },
    { key: "hard", label: "Hard" }
  ];

  function getDifficulty(gameId, fallback) {
    try {
      var v = localStorage.getItem("arcade.diff." + gameId);
      if (v) return v;
    } catch (e) {}
    return fallback || "medium";
  }

  function setDifficulty(gameId, level) {
    try { localStorage.setItem("arcade.diff." + gameId, level); } catch (e) {}
  }

  function mountDifficulty(container, gameId, opts) {
    opts = opts || {};
    var levels = opts.levels || DEFAULT_LEVELS;
    var defaultKey = opts.defaultKey || "medium";
    var onChange = opts.onChange || function () {};
    var current = getDifficulty(gameId, defaultKey);
    if (!levels.some(function (l) { return l.key === current; })) current = defaultKey;

    container.innerHTML = "";
    container.classList.add("difficulty-row");
    levels.forEach(function (lvl) {
      var chip = document.createElement("button");
      chip.className = "chip" + (lvl.key === current ? " active" : "");
      chip.setAttribute("data-level", lvl.key);
      var i18nKey = "difficulty." + lvl.key;
      var translated = window.ArcadeI18n ? window.ArcadeI18n.t(i18nKey) : null;
      chip.textContent = (translated && translated !== i18nKey) ? translated : lvl.label;
      chip.addEventListener("click", function () {
        if (lvl.key === current) return;
        current = lvl.key;
        setDifficulty(gameId, current);
        container.querySelectorAll(".chip").forEach(function (c) {
          c.classList.toggle("active", c.getAttribute("data-level") === current);
        });
        onChange(current);
      });
      container.appendChild(chip);
    });
    onChange(current);
    return { current: function () { return current; } };
  }

  // Count how often each game is opened, so the admin panel can show real
  // "most played" stats. Keyed by folder slug, derived from the URL.
  function trackPlay() {
    try {
      var m = /\/games\/([^\/]+)\//.exec(location.pathname);
      if (!m) return;
      var key = "arcade.plays";
      var all = JSON.parse(localStorage.getItem(key) || "{}");
      all[m[1]] = (all[m[1]] || 0) + 1;
      localStorage.setItem(key, JSON.stringify(all));
    } catch (e) {}
  }

  window.ArcadeCommon = {
    initTheme: initTheme,
    toast: toast,
    getBest: getBest,
    setBest: setBest,
    setBestLowerIsBetter: setBestLowerIsBetter,
    pick: pick,
    randInt: randInt,
    shuffle: shuffle,
    getDifficulty: getDifficulty,
    setDifficulty: setDifficulty,
    mountDifficulty: mountDifficulty
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { initTheme(); trackPlay(); });
  } else {
    initTheme();
    trackPlay();
  }
})();
