/* Claude Arc Games — admin panel.

   Opens from the small button in the TOP RIGHT of every page, guarded by a
   passcode. (You can also add your own keyboard shortcut for it from the AI
   tab - try "when I press ctrl+Q open the admin panel".)

   It is also locked to this site's own web addresses, so if someone copies
   these files onto a different domain the panel refuses to open there.

   IMPORTANT, PLEASE READ: the passcode below keeps a curious sibling out of
   the panel - it is NOT real security. This is a static site with no server,
   so anyone who opens the browser's developer tools can read this file and
   see the passcode. Never put anything genuinely private in here.

   Everything shown is data stored in THIS browser only (scores, play counts,
   friend codes you've added). There is no server, so there is no such thing
   as a list of every player on the site. */
(function () {
  var PASS_KEY = "arcade.admin.pass";
  var DEFAULT_PASS = "676767yo";
  // Only these hosts may open the panel. localhost/127.0.0.1/"" (file://)
   // are kept so it still works while testing on your own computer.
  var ALLOWED_HOSTS = [
    "claudearcgames.com", "www.claudearcgames.com",
    "clinquant-meerkat-145283.netlify.app",
    "localhost", "127.0.0.1", ""
  ];

  function siteAllowed() {
    var h = (location.hostname || "").toLowerCase();
    if (ALLOWED_HOSTS.indexOf(h) !== -1) return true;
    // Netlify Drop gives a new random *.netlify.app name on every fresh
    // drop; allow those too rather than mysteriously vanishing.
    return /\.netlify\.app$/.test(h);
  }

  var unlocked = false;
  var overlay = null;
  var activeTab = "ai";

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
    s.src = rootPath() + "js/registry.js?v=13";
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


  function tabAI() {
    var h = '<p class="adm-note">Type what you want changed in plain English and press ' +
      'Enter. Changes are live but temporary — <b>refreshing the page undoes ' +
      'everything</b> (except themes, which are saved).</p>';
    h += '<div class="ai-log" id="ai-log"></div>';
    h += '<div class="ai-input-row"><input id="ai-input" placeholder="e.g. make the ball faster in pong" autocomplete="off">' +
      '<button class="btn btn-primary" id="ai-send">Send</button></div>';
    h += '<div class="ai-chips">' +
      ['make the ball 2x faster',
       'change the chicken to an egg',
       'make the background black',
       'green on black theme',
       'when I press ctrl+Q open the admin panel',
       'help'].map(function (ex) {
        return '<button class="chip ai-ex">' + esc(ex) + '</button>';
      }).join('') + '</div>';
    h += '<div class="ai-active" id="ai-active"></div>';
    h += '<div class="ai-active"><b>Engine ' + (window.ArcadeMods ? window.ArcadeMods.VERSION : '(not loaded!)') +
      '</b> &nbsp;<button class="btn adm-mini" id="ai-selftest">Run self-test</button> ' +
      '<span id="ai-selftest-out"></span></div>';
    return h;
  }

  function renderActiveMods() {
    var el = document.getElementById('ai-active');
    if (!el || !window.ArcadeMods) return;
    var bits = [];
    var sp = window.ArcadeMods.getSpeed();
    if (sp !== 1) bits.push('speed <b>' + sp.toFixed(2) + 'x</b>');
    var sw = window.ArcadeMods.getSwaps();
    Object.keys(sw).forEach(function (k) { bits.push(k + ' → <b>' + sw[k] + '</b>'); });
    var co = window.ArcadeMods.getColors();
    Object.keys(co).forEach(function (k) { bits.push(k.replace('--', '') + ' <b>' + co[k] + '</b>'); });
    window.ArcadeMods.getHotkeys().forEach(function (hk) {
      bits.push('<b>' + hk.combo.toUpperCase() + '</b> → ' + window.ArcadeMods.actions[hk.action].label);
    });
    el.innerHTML = bits.length
      ? 'Active changes (gone on refresh): ' + bits.join(' &nbsp;·&nbsp; ') +
        ' <button class="btn adm-mini" id="ai-reset">Undo all</button>'
      : 'No changes active right now.';
    var rb = document.getElementById('ai-reset');
    if (rb) rb.addEventListener('click', function () {
      window.ArcadeMods.resetAll();
      aiSay('bot', 'Everything is back to normal.');
      renderActiveMods();
    });
  }

  function aiSay(kind, text) {
    var log = document.getElementById('ai-log');
    if (!log) return;
    var d = document.createElement('div');
    d.className = 'ai-msg ' + kind;
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  function runSelfTest() {
    var out = document.getElementById('ai-selftest-out');
    var lines = [];
    if (!window.ArcadeMods) {
      out.innerHTML = '<span style="color:var(--danger)">FAILED: the mod engine did not load. ' +
        'Your browser is probably showing a cached old copy — hard-refresh the page ' +
        '(Ctrl+Shift+R, or Cmd+Shift+R on a Mac).</span>';
      return;
    }
    // Speed: set a fractional rate and read it back.
    window.ArcadeMods.setSpeed(1.25);
    lines.push((window.ArcadeMods.getSpeed() === 1.25 ? 'PASS' : 'FAIL') + ' fractional speed');
    window.ArcadeMods.setSpeed(1);
    // Tint: apply and confirm the canvas really carries a filter.
    window.ArcadeMods.setTint('hue-rotate(90deg)');
    var cv = document.querySelector('canvas');
    var f = cv ? getComputedStyle(cv).filter : '';
    lines.push((!cv ? 'SKIP (no canvas on this page)' : (f && f !== 'none' ? 'PASS' : 'FAIL')) + ' colour tint');
    window.ArcadeMods.setTint('');
    // Swap plumbing.
    window.ArcadeMods.addSwap('\u2764\ufe0f', '\u2b50');
    lines.push((window.ArcadeMods.getSwaps()['\u2764\ufe0f'] === '\u2b50' ? 'PASS' : 'FAIL') + ' picture swap');
    window.ArcadeMods.resetAll();
    var bad = lines.filter(function (l) { return l.indexOf('FAIL') === 0; }).length;
    out.innerHTML = '<span style="color:' + (bad ? 'var(--danger)' : 'var(--good)') + '">' +
      lines.join(' · ') + (bad ? '' : ' — engine is live ✓') + '</span>';
    renderActiveMods();
  }

  function aiSubmit(value) {
    var text = (value || '').trim();
    if (!text) return;
    aiSay('you', text);
    var res = window.ArcadeAI.ask(text);
    aiSay(res.ok ? 'bot ok' : 'err', res.msg);
    renderActiveMods();
  }

  var TABS = [
    { id: "ai", label: "🤖 AI Panel", render: tabAI },
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

    if (byId("ai-input")) {
      var input = byId("ai-input");
      var send = function () { aiSubmit(input.value); input.value = ""; };
      byId("ai-send").addEventListener("click", send);
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") send(); });
      body.querySelectorAll(".ai-ex").forEach(function (b) {
        b.addEventListener("click", function () { aiSubmit(b.textContent); });
      });
      if (byId("ai-selftest")) byId("ai-selftest").addEventListener("click", runSelfTest);
      renderActiveMods();
      if (!byId("ai-log").children.length) {
        aiSay("bot", "Hi Tim! Tell me what to change — try one of the buttons below, " +
          "or type your own sentence. Type \"help\" to see everything I can do.");
      }
      setTimeout(function () { input.focus(); }, 50);
    }

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
    if (!siteAllowed()) {
      // Copied onto someone else's domain - refuse, using the same message
      // the AI panel gives for anything it won't do.
      alert(window.ArcadeAI ? window.ArcadeAI.ERR :
        "Error;error;ShowID(ai.extension<adminpanel>prohibited/Text.message();;return)");
      return;
    }
    if (unlocked) { openPanel(); return; }
    var v = prompt("Admin passcode:");
    if (v === null) return;
    if (v === getPass()) {
      unlocked = true;
      var b = document.getElementById("adm-open");
      if (b) b.classList.add("locked-in");
      openPanel();
    } else {
      if (window.ArcadeCommon) window.ArcadeCommon.toast("Wrong passcode.");
    }
  }

  // ---------- entry point: the button in the top right ----------

  function mount() {
    if (!siteAllowed()) return; // don't even show the button off-site
    var btn = document.createElement("button");
    btn.id = "adm-open";
    btn.type = "button";
    btn.textContent = "🛠️";
    btn.title = "Admin (passcode)";
    btn.setAttribute("aria-label", "Admin panel");
    btn.addEventListener("click", promptPass);
    document.body.appendChild(btn);
    if (location.hash === "#admin") promptPass();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  window.ArcadeAdmin = { open: promptPass };
})();
