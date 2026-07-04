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

  window.ArcadeCommon = {
    initTheme: initTheme,
    toast: toast,
    getBest: getBest,
    setBest: setBest,
    setBestLowerIsBetter: setBestLowerIsBetter,
    pick: pick,
    randInt: randInt,
    shuffle: shuffle
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTheme);
  } else {
    initTheme();
  }
})();
