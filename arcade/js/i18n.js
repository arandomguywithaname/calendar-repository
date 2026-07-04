/* Claude Arc Games — i18n loader.
   Works from file:// and any static host, no build step.
   Usage: <span data-i18n="common.score"></span>, <input data-i18n-placeholder="...">
   window.ArcadeI18n.t(key) is available to game scripts. */
(function () {
  var SUPPORTED = ["en", "es", "ru", "ro", "fr", "de"];
  var FALLBACK = "en";
  var STORAGE_KEY = "arcade.lang";
  var cache = {};
  var current = FALLBACK;
  var listeners = [];

  function rootPath() {
    // Works whether the page lives at /arcade/ or /arcade/games/<slug>/
    var depth = (window.ARCADE_ROOT_DEPTH || 0);
    return depth === 0 ? "" : "../".repeat(depth);
  }

  function detectDefault() {
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
    var nav = (navigator.language || "en").slice(0, 2).toLowerCase();
    return SUPPORTED.indexOf(nav) !== -1 ? nav : FALLBACK;
  }

  function load(lang) {
    if (cache[lang]) return Promise.resolve(cache[lang]);
    if (window.ARCADE_I18N_DATA && window.ARCADE_I18N_DATA[lang]) {
      cache[lang] = window.ARCADE_I18N_DATA[lang];
      return Promise.resolve(cache[lang]);
    }
    // Script tags (unlike fetch/XHR) work when the page is opened directly
    // from disk (file://), which is why translations ship as .js, not .json.
    return new Promise(function (resolve) {
      var s = document.createElement("script");
      s.src = rootPath() + "i18n/" + lang + ".js";
      s.onload = function () {
        cache[lang] = (window.ARCADE_I18N_DATA && window.ARCADE_I18N_DATA[lang]) || {};
        resolve(cache[lang]);
      };
      s.onerror = function () { cache[lang] = {}; resolve({}); };
      document.head.appendChild(s);
    });
  }

  function apply() {
    var dict = cache[current] || {};
    var fallbackDict = cache[FALLBACK] || {};
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      var val = dict[key] || fallbackDict[key];
      if (val) el.textContent = val;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-placeholder");
      var val = dict[key] || fallbackDict[key];
      if (val) el.setAttribute("placeholder", val);
    });
    document.documentElement.setAttribute("lang", current);
    listeners.forEach(function (fn) { try { fn(current); } catch (e) {} });
  }

  function setLang(lang) {
    if (SUPPORTED.indexOf(lang) === -1) lang = FALLBACK;
    current = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    return Promise.all([load(FALLBACK), load(lang)]).then(apply);
  }

  function t(key) {
    var dict = cache[current] || {};
    var fallbackDict = cache[FALLBACK] || {};
    return dict[key] || fallbackDict[key] || key;
  }

  function init() {
    current = detectDefault();
    return Promise.all([load(FALLBACK), load(current)]).then(function () {
      apply();
      var sel = document.getElementById("lang-select");
      if (sel) {
        sel.value = current;
        sel.addEventListener("change", function () { setLang(sel.value); });
      }
    });
  }

  window.ArcadeI18n = {
    init: init,
    setLang: setLang,
    t: t,
    onChange: function (fn) { listeners.push(fn); },
    supported: SUPPORTED,
    current: function () { return current; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
