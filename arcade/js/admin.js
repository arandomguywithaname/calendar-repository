/* Claude Arc Games — admin panel.

   Opens with Ctrl+Q (desktop), by tapping the footer version badge 5 times
   (phones have no Ctrl key), or by adding #admin to the address.

   IMPORTANT, PLEASE READ: the passcode below keeps a curious sibling out of
   the panel - it is NOT real security. This is a static site with no server,
   so anyone who opens the browser's developer tools can read this file and
   see the passcode. Never put anything genuinely private in here.

   Everything shown is data stored in THIS browser only (scores, play counts,
   friend codes you've added). There is no server, so there is no such thing
   as a list of every player on the site. */
(function () {
  var PASS_KEY = "arcade.admin.pass";
  var DEFAULT_PASS = "2468";
  var unlocked = false;
  var overlay = null;
  var activeTab = "codes";

  function rootPath() {
    var depth = window.ARCADE_ROOT_DEPTH || 0;
    return depth === 0 ? "" : "../".repeat(depth);
  }

  function getPass() {
    try { return localStorage.getItem(PASS_KEY) || DEFAULT_PASS; } catch (e) { return DEFAULT_PASS; }
  }

  // ---------- data helpers ----------

  function lsKeys(prefix) {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(prefix) === 0) out.push(k);
      }
    } catch (e) {}
    return out;
  }

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; } catch (e) { return fallback; }
  }

  function gameTitle(slug) {
    if (window.ARCADE_GAMES) {
      for (var i = 0; i < window.ARCADE_GAMES.length; i++) {
        if (window.ARCADE_GAMES[i].slug === slug) {
          return window.ARCADE_GAMES[i].icon + " " + window.ARCADE_GAMES[i].title;
        }
      }
    }
    return slug;
  }

  function ensureRegistry(cb) {
    if (window.ARCADE_GAMES) return cb();
    var s = document.createElement("script");
    s.src = rootPath() + "js/registry.js";
    s.onload = cb;
    s.onerror = cb;
    document.head.appendChild(s);
  }

  function storageBytes() {
    var total = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        total += (k + (localStorage.getItem(k) || "")).length;
      }
    } catch (e) {}
    return total;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // ---------- tab renderers ----------

  function tabCodes() {
    var mine = window.ArcadeFriends ? window.ArcadeFriends.myCode() : "(friends not loaded)";
    var friends = readJson("arcade.friends", []);
    var h = '<p class="adm-note">Friend codes this device knows. There is no server, ' +
      'so this cannot list players on other devices.</p>';
    h += '<div class="adm-field"><label>Your code</label>' +
      '<div class="adm-row"><input id="adm-mycode" value="' + esc(mine) + '">' +
      '<button class="btn btn-primary" id="adm-savecode">Save</button></div></div>';
    h += "<h4>Friends (" + friends.length + ")</h4>";
    if (!friends.length) {
      h += '<p class="adm-note">No friends added on this device yet.</p>';
    } else {
      h += '<table class="adm-table"><tr><th>Code</th><th>Status</th><th>Chat</th><th></th></tr>';
      friends.forEach(function (c) {
        var online = window.ArcadeFriends && window.ArcadeFriends.isOnline(c);
        var msgs = readJson("arcade.chat." + c, []).length;
        h += "<tr><td><code>" + esc(c) + "</code></td>" +
          '<td>' + (online ? '<span style="color:var(--good)">● online</span>' : '<span style="color:var(--text-dim)">○ offline</span>') + "</td>" +
          "<td>" + msgs + " msgs</td>" +
          '<td><button class="btn adm-mini" data-kick="' + esc(c) + '">Remove</button></td></tr>';
      });
      h += "</table>";
    }
    return h;
  }

  function tabScores() {
    var rows = lsKeys("arcade.best.").map(function (k) {
      var slug = k.slice("arcade.best.".length);
      return { slug: slug, val: localStorage.getItem(k) };
    });
    if (!rows.length) return '<p class="adm-note">No best scores saved yet — go play something!</p>';
    rows.sort(function (a, b) { return gameTitle(a.slug).localeCompare(gameTitle(b.slug)); });
    var h = '<p class="adm-note">' + rows.length + ' game(s) with a saved best score.</p>';
    h += '<div class="adm-row" style="margin-bottom:10px;"><button class="btn adm-danger" id="adm-clear-scores">Reset ALL scores</button></div>';
    h += '<table class="adm-table"><tr><th>Game</th><th>Best</th><th></th></tr>';
    rows.forEach(function (r) {
      h += "<tr><td>" + esc(gameTitle(r.slug)) + "</td><td><b>" + esc(r.val) + "</b></td>" +
        '<td><button class="btn adm-mini" data-reset="' + esc(r.slug) + '">Reset</button></td></tr>';
    });
    return h + "</table>";
  }

  function tabPlays() {
    var plays = readJson("arcade.plays", {});
    var rows = Object.keys(plays).map(function (s) { return { slug: s, n: plays[s] }; });
    if (!rows.length) return '<p class="adm-note">No games opened yet on this device.</p>';
    rows.sort(function (a, b) { return b.n - a.n; });
    var total = rows.reduce(function (t, r) { return t + r.n; }, 0);
    var max = rows[0].n;
    var h = '<p class="adm-note"><b>' + total + '</b> game opens across <b>' + rows.length + '</b> different games.</p>';
    h += '<div class="adm-row" style="margin-bottom:10px;"><button class="btn adm-danger" id="adm-clear-plays">Reset play counts</button></div>';
    h += '<table class="adm-table"><tr><th>Game</th><th>Opens</th><th></th></tr>';
    rows.forEach(function (r) {
      var pct = Math.round((r.n / max) * 100);
      h += "<tr><td>" + esc(gameTitle(r.slug)) + "</td><td><b>" + r.n + "</b></td>" +
        '<td style="width:40%"><div class="adm-bar"><span style="width:' + pct + '%"></span></div></td></tr>';
    });
    return h + "</table>";
  }

  function tabData() {
    var bytes = storageBytes();
    var langs = { en: "English", es: "Espanol", ru: "Russian", ro: "Romanian", fr: "French", de: "German" };
    var lang = null, theme = null;
    try {
      lang = localStorage.getItem("arcade.lang");
      theme = localStorage.getItem("arcade.theme");
    } catch (e) {}
    var diffs = lsKeys("arcade.diff.").map(function (k) {
      return k.slice("arcade.diff.".length) + ": " + localStorage.getItem(k);
    });

    var h = '<table class="adm-table">' +
      "<tr><th>Setting</th><th>Value</th></tr>" +
      "<tr><td>Language</td><td>" + esc(langs[lang] || lang || "auto") + "</td></tr>" +
      "<tr><td>Theme</td><td>" + esc(theme || "dark") + "</td></tr>" +
      "<tr><td>Storage used</td><td>" + (bytes / 1024).toFixed(1) + " KB</td></tr>" +
      "<tr><td>Difficulties set</td><td>" + diffs.length + " game(s)</td></tr>" +
      "</table>";

    h += '<div class="adm-field"><label>Admin passcode</label>' +
      '<div class="adm-row"><input id="adm-newpass" placeholder="new passcode (min 4 chars)">' +
      '<button class="btn btn-primary" id="adm-savepass">Change</button></div>' +
      '<p class="adm-note">Reminder: this only keeps casual snoopers out. Anyone who ' +
      "opens the browser's developer tools can read it — don't reuse a real password.</p></div>";

    h += "<h4>Backup</h4><div class="+'"adm-row"'+">" +
      '<button class="btn" id="adm-export">Export all data</button>' +
      '<button class="btn" id="adm-import">Import…</button>' +
      '<button class="btn adm-danger" id="adm-wipe">Wipe everything</button></div>' +
      '<p class="adm-note">Export saves your scores, friends and settings to a file you can ' +
      "load on another device.</p>";
    return h;
  }

  var TABS = [
    { id: "codes", label: "Friend Codes", render: tabCodes },
    { id: "scores", label: "Scores", render: tabScores },
    { id: "plays", label: "Play Stats", render: tabPlays },
    { id: "data", label: "Settings & Data", render: tabData }
  ];

  // ---------- panel ----------

  function close() {
    if (overlay) { overlay.remove(); overlay = null; }
  }

  function render() {
    if (!overlay) return;
    var body = overlay.querySelector("#adm-body");
    var tab = TABS.filter(function (t) { return t.id === activeTab; })[0] || TABS[0];
    body.innerHTML = tab.render();
    overlay.querySelectorAll(".adm-tab").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-tab") === activeTab);
    });
    wire(body);
  }

  function wire(body) {
    var byId = function (id) { return body.querySelector("#" + id); };

    if (byId("adm-savecode")) byId("adm-savecode").addEventListener("click", function () {
      var v = byId("adm-mycode").value;
      var res = window.ArcadeFriends && window.ArcadeFriends.setMyCode(v);
      if (res && res.ok) {
        window.ArcadeCommon.toast(res.unchanged ? "Code unchanged." : "Your code is now " + window.ArcadeFriends.myCode());
      } else {
        window.ArcadeCommon.toast("Code needs at least 3 letters/numbers.");
      }
      render();
    });

    body.querySelectorAll("[data-kick]").forEach(function (b) {
      b.addEventListener("click", function () {
        var code = b.getAttribute("data-kick");
        var list = readJson("arcade.friends", []).filter(function (c) { return c !== code; });
        try {
          localStorage.setItem("arcade.friends", JSON.stringify(list));
          localStorage.removeItem("arcade.chat." + code);
        } catch (e) {}
        window.ArcadeCommon.toast("Removed " + code);
        render();
      });
    });

    body.querySelectorAll("[data-reset]").forEach(function (b) {
      b.addEventListener("click", function () {
        try { localStorage.removeItem("arcade.best." + b.getAttribute("data-reset")); } catch (e) {}
        render();
      });
    });

    if (byId("adm-clear-scores")) byId("adm-clear-scores").addEventListener("click", function () {
      if (!confirm("Reset the best score for EVERY game? This can't be undone.")) return;
      lsKeys("arcade.best.").forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
      window.ArcadeCommon.toast("All scores reset.");
      render();
    });

    if (byId("adm-clear-plays")) byId("adm-clear-plays").addEventListener("click", function () {
      try { localStorage.removeItem("arcade.plays"); } catch (e) {}
      render();
    });

    if (byId("adm-savepass")) byId("adm-savepass").addEventListener("click", function () {
      var v = (byId("adm-newpass").value || "").trim();
      if (v.length < 4) { window.ArcadeCommon.toast("Passcode must be at least 4 characters."); return; }
      try { localStorage.setItem(PASS_KEY, v); } catch (e) {}
      window.ArcadeCommon.toast("Passcode changed.");
      byId("adm-newpass").value = "";
    });

    if (byId("adm-export")) byId("adm-export").addEventListener("click", function () {
      var dump = {};
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf("arcade.") === 0 && k !== PASS_KEY) dump[k] = localStorage.getItem(k);
        }
      } catch (e) {}
      var blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "arcgames-backup.json";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });

    if (byId("adm-import")) byId("adm-import").addEventListener("click", function () {
      var inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "application/json,.json";
      inp.addEventListener("change", function () {
        var f = inp.files && inp.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
          try {
            var data = JSON.parse(fr.result);
            var n = 0;
            Object.keys(data).forEach(function (k) {
              if (k.indexOf("arcade.") === 0) { localStorage.setItem(k, data[k]); n++; }
            });
            window.ArcadeCommon.toast("Imported " + n + " items. Reloading…");
            setTimeout(function () { location.reload(); }, 900);
          } catch (e) {
            window.ArcadeCommon.toast("That file didn't look like a backup.");
          }
        };
        fr.readAsText(f);
      });
      inp.click();
    });

    if (byId("adm-wipe")) byId("adm-wipe").addEventListener("click", function () {
      if (!confirm("Delete ALL saved data (scores, friends, chats, settings)? This can't be undone.")) return;
      lsKeys("arcade.").forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
      alert("All data cleared. The page will reload.");
      location.reload();
    });
  }

  function openPanel() {
    close();
    overlay = document.createElement("div");
    overlay.id = "adm-overlay";
    overlay.innerHTML =
      '<div class="adm-panel">' +
        '<div class="adm-head"><span>🛠️ Admin Panel</span>' +
        '<button class="btn adm-mini" id="adm-close">✕</button></div>' +
        '<div class="adm-tabs">' +
          TABS.map(function (t) {
            return '<button class="chip adm-tab" data-tab="' + t.id + '">' + t.label + "</button>";
          }).join("") +
        "</div>" +
        '<div class="adm-body" id="adm-body"></div>' +
      "</div>";
    document.body.appendChild(overlay);

    overlay.querySelector("#adm-close").addEventListener("click", close);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    overlay.querySelectorAll(".adm-tab").forEach(function (b) {
      b.addEventListener("click", function () {
        activeTab = b.getAttribute("data-tab");
        render();
      });
    });
    ensureRegistry(render);
  }

  function promptPass() {
    if (unlocked) { openPanel(); return; }
    var v = prompt("Admin passcode:");
    if (v === null) return;
    if (v === getPass()) {
      unlocked = true;
      openPanel();
    } else {
      if (window.ArcadeCommon) window.ArcadeCommon.toast("Wrong passcode.");
    }
  }

  // ---------- entry points ----------

  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === "q" || e.key === "Q")) {
      e.preventDefault();
      promptPass();
    }
  });

  function mount() {
    // Phones have no Ctrl key: 5 quick taps on the footer version badge.
    var badge = document.querySelector("footer.arcade-footer p span:last-child");
    if (badge) {
      var taps = 0, timer = null;
      badge.style.cursor = "pointer";
      badge.addEventListener("click", function () {
        taps++;
        clearTimeout(timer);
        timer = setTimeout(function () { taps = 0; }, 1200);
        if (taps >= 5) { taps = 0; promptPass(); }
      });
    }
    if (location.hash === "#admin") promptPass();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  window.ArcadeAdmin = { open: promptPass };
})();
