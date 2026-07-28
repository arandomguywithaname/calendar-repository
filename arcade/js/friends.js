/* Claude Arc Games — peer-to-peer friends & chat.
   No backend: uses PeerJS's free public signaling broker just to help two
   browsers find each other, then talks directly browser-to-browser (WebRTC).
   Both friends need this site open at the same time; nothing is stored
   on a server — friend lists and chat history live in localStorage. */
(function () {
  var CODE_KEY = "arcade.friendcode";
  var LIST_KEY = "arcade.friends";
  var CHAT_PREFIX = "arcade.chat.";
  var connections = {};
  var onlineSet = {};
  var pendingMessages = {};
  var peer = null;
  var peerStatus = "connecting"; // "connecting" | "connected" | "failed"
  var activeChatWith = null;
  var retryTimers = {};
  var connectAttempts = {}; // code -> { startedAt, failCount }
  var gameListeners = [];
  var CONNECT_TIMEOUT_MS = 15000;
  var editingMyCode = false;
  var idRetries = 0;
  var sameIdRetries = 0;
  var lastPeerError = null;
  var lastConnError = {}; // friend code -> last PeerJS error type when dialing them

  function rootPath() {
    var depth = window.ARCADE_ROOT_DEPTH || 0;
    return depth === 0 ? "" : "../".repeat(depth);
  }

  function t(key, fallback) {
    return window.ArcadeI18n ? window.ArcadeI18n.t(key) : fallback || key;
  }

  function genCode() {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var s = "";
    for (var i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return "ARC-" + s.slice(0, 4) + "-" + s.slice(4);
  }

  // Cached per page-load: this is the code OUR peer connection actually
  // registered under. Two tabs of the same browser share localStorage, so
  // re-reading it after the other tab self-heals its collision would show
  // a code that doesn't belong to this tab.
  var activeCode = null;

  function myCode() {
    if (activeCode) return activeCode;
    var code = null;
    try { code = localStorage.getItem(CODE_KEY); } catch (e) {}
    if (!code) {
      code = genCode();
      try { localStorage.setItem(CODE_KEY, code); } catch (e) {}
    }
    activeCode = code;
    return code;
  }

  function sanitizeCode(raw) {
    // PeerJS IDs only allow letters/numbers/hyphens/underscores - strip
    // anything else so a custom code always works as a real peer ID.
    var cleaned = (raw || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    return cleaned.slice(0, 40);
  }

  function setMyCode(raw) {
    var cleaned = sanitizeCode(raw);
    if (cleaned.length < 3) return { ok: false, reason: "tooShort" };
    var current = myCode();
    if (cleaned === current) return { ok: true, unchanged: true };
    activeCode = cleaned;
    try { localStorage.setItem(CODE_KEY, cleaned); } catch (e) {}
    // Existing connections were opened under the old peer ID - drop them and
    // re-register fresh under the new one so friends can actually reach it.
    Object.keys(connections).forEach(function (code) {
      try { connections[code].close(); } catch (e) {}
    });
    connections = {};
    onlineSet = {};
    connectAttempts = {};
    if (peer) {
      try { peer.destroy(); } catch (e) {}
      peer = null;
    }
    peerStatus = "connecting";
    if (window.Peer) initPeer();
    return { ok: true, unchanged: false };
  }

  function getFriends() {
    try { return JSON.parse(localStorage.getItem(LIST_KEY) || "[]"); } catch (e) { return []; }
  }

  function saveFriends(list) {
    try { localStorage.setItem(LIST_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function addFriend(code) {
    code = (code || "").trim().toUpperCase();
    if (!code || code === myCode()) return false;
    var list = getFriends();
    if (list.indexOf(code) === -1) {
      list.push(code);
      saveFriends(list);
    }
    connectTo(code);
    return true;
  }

  function removeFriend(code) {
    saveFriends(getFriends().filter(function (c) { return c !== code; }));
    if (connections[code]) { try { connections[code].close(); } catch (e) {} }
    delete connections[code];
    delete onlineSet[code];
    if (activeChatWith === code) activeChatWith = null;
    renderPanel();
  }

  function loadChat(code) {
    try { return JSON.parse(localStorage.getItem(CHAT_PREFIX + code) || "[]"); } catch (e) { return []; }
  }

  function pushChat(code, msg) {
    var log = loadChat(code);
    log.push(msg);
    if (log.length > 200) log = log.slice(-200);
    try { localStorage.setItem(CHAT_PREFIX + code, JSON.stringify(log)); } catch (e) {}
  }

  function flushPending(code) {
    var queue = pendingMessages[code];
    var conn = connections[code];
    if (!queue || !queue.length || !conn || !conn.open) return;
    queue.forEach(function (msg) { try { conn.send(msg); } catch (e) {} });
    pendingMessages[code] = [];
  }

  function setupConnection(code, conn) {
    connections[code] = conn;
    conn.on("open", function () {
      onlineSet[code] = true;
      delete lastConnError[code];
      if (connectAttempts[code]) connectAttempts[code].failCount = 0;
      flushPending(code);
      renderPanel();
    });
    conn.on("data", function (data) {
      if (data && data.type === "chat") {
        pushChat(code, { from: "them", text: data.text, ts: Date.now() });
        if (activeChatWith === code) renderChat(code);
        else if (window.ArcadeCommon) window.ArcadeCommon.toast(code + ": " + data.text);
      } else if (data && data.type === "game") {
        gameListeners.forEach(function (fn) { try { fn(code, data.payload); } catch (e) {} });
      }
    });
    conn.on("close", function () {
      onlineSet[code] = false;
      delete connections[code];
      renderPanel();
    });
    conn.on("error", function () {
      onlineSet[code] = false;
      // Clear it out so the next poll/connectTo actually retries instead of
      // seeing a stale (permanently failed) connection object and giving up.
      delete connections[code];
      renderPanel();
    });
  }

  function connectTo(code) {
    if (!peer || peer.disconnected || connections[code]) return;
    delete lastConnError[code]; // fresh dial, fresh diagnosis
    try {
      var conn = peer.connect(code, { reliable: true });
      setupConnection(code, conn);
      var attempt = connectAttempts[code] || { failCount: 0 };
      attempt.startedAt = Date.now();
      connectAttempts[code] = attempt;
      // WebRTC connections that fail at the ICE/NAT-traversal stage often
      // never fire any PeerJS "error" event at all - they just hang forever
      // in a not-open state. Without this, a friend behind a strict NAT
      // would show as permanently "connecting" with no way to recover.
      setTimeout(function () {
        var c = connections[code];
        if (c && !c.open) {
          try { c.close(); } catch (e) {}
          delete connections[code];
          onlineSet[code] = false;
          connectAttempts[code].failCount = (connectAttempts[code].failCount || 0) + 1;
          renderPanel();
        }
      }, CONNECT_TIMEOUT_MS);
    } catch (e) {}
  }

  function pollFriends() {
    getFriends().forEach(function (code) {
      if (!connections[code]) connectTo(code);
    });
  }

  function sendChat(code, text) {
    var conn = connections[code];
    var msg = { type: "chat", text: text };
    if (conn && conn.open) {
      conn.send(msg);
    } else {
      // Not connected yet (or connection dropped) - queue it and make sure
      // we're actively trying to (re)connect, instead of silently losing it.
      pendingMessages[code] = pendingMessages[code] || [];
      pendingMessages[code].push(msg);
      connectTo(code);
    }
    pushChat(code, { from: "me", text: text, ts: Date.now() });
    renderChat(code);
  }

  // ---------- UI ----------

  var els = {};

  function buildUI() {
    var toggle = document.createElement("button");
    toggle.id = "friends-toggle";
    toggle.textContent = "👥";
    toggle.setAttribute("aria-label", "Friends");
    document.body.appendChild(toggle);

    var panel = document.createElement("div");
    panel.id = "friends-panel";
    panel.innerHTML =
      '<div class="fp-header"><span data-i18n="friends.title">Friends</span>' +
      '<button class="btn" id="fp-close" style="padding:4px 10px;">✕</button></div>' +
      '<div class="fp-body" id="fp-body"></div>';
    document.body.appendChild(panel);

    els.toggle = toggle;
    els.panel = panel;
    els.body = panel.querySelector("#fp-body");

    toggle.addEventListener("click", function () {
      panel.classList.toggle("open");
      if (panel.classList.contains("open")) {
        pollFriends();
        renderPanel();
      }
    });
    panel.querySelector("#fp-close").addEventListener("click", function () {
      panel.classList.remove("open");
    });

    // Keep "Connecting..." / online dots live while the panel is open,
    // even if no PeerJS event happens to fire in the meantime.
    setInterval(function () {
      if (panel.classList.contains("open")) renderPanel();
    }, 3000);
  }

  function friendStatusLine(code) {
    if (onlineSet[code]) return "";

    // Live diagnostics: name the exact stage that is failing, so "it
    // doesn't work" turns into something we can actually act on.
    if (lastConnError[code] === "not-online") {
      return '<div style="color:var(--warn); font-size:0.78rem; margin-top:2px;">' +
        "⚠ This code isn't online right now. It must match EXACTLY what their Friends panel " +
        "shows at this moment (codes can change!) — re-check it on their screen, then " +
        '<button class="btn" data-action="retry" data-code="' + code + '" style="padding:2px 8px; font-size:0.75rem;">Retry</button></div>';
    }

    var c = connections[code];
    var ice = null;
    try { ice = c && c.peerConnection ? c.peerConnection.iceConnectionState : null; } catch (e) {}

    if (ice === "failed" || ice === "disconnected") {
      return '<div style="color:var(--warn); font-size:0.78rem; margin-top:2px;">' +
        "⚠ Found them, but the connection between your devices is blocked (link: " + ice + "). " +
        "This is usually the router/firewall. Try both devices on different networks, or " +
        '<button class="btn" data-action="retry" data-code="' + code + '" style="padding:2px 8px; font-size:0.75rem;">Retry</button></div>';
    }

    var attempt = connectAttempts[code];
    var fails = attempt ? attempt.failCount || 0 : 0;
    if (fails >= 2) {
      return '<div style="color:var(--warn); font-size:0.78rem; margin-top:2px;">' +
        "⚠ Couldn't connect after several tries" + (ice ? " (link stuck at: " + ice + ")" : "") + ". " +
        "One of you may be on a network that blocks game connections. " +
        '<button class="btn" data-action="retry" data-code="' + code + '" style="padding:2px 8px; font-size:0.75rem;">Retry now</button></div>';
    }

    var stage = !c ? "waiting to dial" : (ice ? "link: " + ice : "calling...");
    return '<div style="color:var(--text-dim); font-size:0.78rem; margin-top:2px;">Connecting... (' + stage + ")</div>";
  }

  function relayStatusBanner() {
    if (peerStatus === "connected") return "";
    if (peerStatus === "failed") {
      return '<div class="instructions" style="text-align:left; color:var(--danger);">' +
        "⚠ Couldn't reach the connection service used to find friends" +
        (lastPeerError ? " (error: " + lastPeerError + ")" : "") + ". Check your internet connection, " +
        "or a VPN/firewall/ad-blocker may be blocking it. Friends/chat won't work until this connects, " +
        "but every game still works fine.</div>";
    }
    return '<div class="instructions" style="text-align:left; color:var(--text-dim);">Connecting to the friends service...</div>';
  }

  // The panel refreshes itself every few seconds to keep the online dots and
  // the "Connecting..." banner honest. It used to do that by replacing the
  // whole body's innerHTML, which threw away the text box you were typing
  // your friend's code into and built a new one. On a desktop that is nearly
  // invisible - the value gets copied across and focus restored. On a phone
  // it is not: replacing a focused input closes the on-screen keyboard, and
  // a keyboard can only be reopened by a real tap, so every 3 seconds the
  // keyboard would vanish mid-code.
  //
  // So the body is now split into three regions. The banner and the friend
  // list are volatile and get redrawn on the timer; the region holding the
  // text boxes is only rebuilt when it actually changes (you start editing
  // your code, or your code changes), never on the timer.
  var staticSig = null;

  function ensureShell() {
    if (els.body.querySelector("#fp-static")) return false;
    els.body.className = "fp-body";
    els.body.innerHTML =
      '<div id="fp-banner" class="fp-sec"></div>' +
      '<div id="fp-static" class="fp-sec"></div>' +
      '<div id="fp-list" class="fp-sec"></div>';
    staticSig = null;
    return true;
  }

  function translateIn(root) {
    if (!window.ArcadeI18n) return;
    root.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
  }

  // Friend codes are typed, not written prose: stop the phone keyboard from
  // autocapitalising, autocorrecting or autocompleting them into something
  // that no longer matches the code the friend actually has.
  var CODE_INPUT_ATTRS = 'autocapitalize="characters" autocorrect="off" autocomplete="off" spellcheck="false"';

  function renderStatic() {
    var host = els.body.querySelector("#fp-static");
    var sig = (editingMyCode ? "edit" : "show") + "|" + myCode();
    if (sig === staticSig) return;

    var prevInput = host.querySelector("#fp-add-input");
    var preservedValue = prevInput ? prevInput.value : "";
    var hadFocus = prevInput === document.activeElement;
    staticSig = sig;

    var html = "";
    if (editingMyCode) {
      html += '<div class="fp-code"><input id="fp-code-edit" value="' + myCode() + '" maxlength="40" ' + CODE_INPUT_ATTRS + ' style="flex:1; min-width:0; background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:6px 8px; color:var(--text); font-family:monospace;">' +
        '<button class="btn btn-primary" id="fp-code-save" style="padding:4px 10px;">Save</button>' +
        '<button class="btn" id="fp-code-cancel" style="padding:4px 10px;">✕</button></div>' +
        '<p class="instructions" style="text-align:left; font-size:0.78rem;">Set the same code on your other devices to use them as the same friend. Letters, numbers, - and _ only.</p>';
    } else {
      html += '<div class="fp-code"><span>' + myCode() + '</span>' +
        '<button class="btn" id="fp-copy" style="padding:4px 10px;" data-i18n="friends.copy">Copy</button>' +
        '<button class="btn" id="fp-edit-code" style="padding:4px 10px;" title="Set a custom code">✏️</button></div>';
    }
    html += '<div class="fp-add"><input id="fp-add-input" ' + CODE_INPUT_ATTRS + ' data-i18n-placeholder="friends.addPlaceholder" placeholder="Enter friend\'s code">' +
      '<button class="btn btn-primary" id="fp-add-btn" data-i18n="friends.add">Add</button></div>';
    host.innerHTML = html;
    translateIn(host);

    if (preservedValue) {
      var newInput = host.querySelector("#fp-add-input");
      if (newInput) {
        newInput.value = preservedValue;
        if (hadFocus) newInput.focus();
      }
    }

    var copyBtn = host.querySelector("#fp-copy");
    if (copyBtn) copyBtn.addEventListener("click", function () { copyMyCode(); });
    var editBtn = host.querySelector("#fp-edit-code");
    if (editBtn) editBtn.addEventListener("click", function () {
      editingMyCode = true;
      renderPanel();
    });
    var cancelBtn = host.querySelector("#fp-code-cancel");
    if (cancelBtn) cancelBtn.addEventListener("click", function () {
      editingMyCode = false;
      renderPanel();
    });
    var saveBtn = host.querySelector("#fp-code-save");
    if (saveBtn) saveBtn.addEventListener("click", function () {
      var codeInput = host.querySelector("#fp-code-edit");
      var result = setMyCode(codeInput.value);
      if (!result.ok) {
        if (window.ArcadeCommon) window.ArcadeCommon.toast("Code must be at least 3 characters.");
        return;
      }
      editingMyCode = false;
      if (window.ArcadeCommon) window.ArcadeCommon.toast(result.unchanged ? "Code unchanged." : "Your code is now " + myCode());
      renderPanel();
    });
    var addInput = host.querySelector("#fp-add-input");
    function submitAdd() {
      var code = (addInput.value || "").trim().toUpperCase();
      if (code && code === myCode()) {
        if (window.ArcadeCommon) window.ArcadeCommon.toast("That's your own code! Ask your friend for theirs.");
        return;
      }
      if (addFriend(addInput.value)) { addInput.value = ""; renderPanel(); }
    }
    host.querySelector("#fp-add-btn").addEventListener("click", submitAdd);
    // Phone keyboards show a "Go"/"Enter" key rather than a visible Add
    // button once the keyboard covers the panel.
    addInput.addEventListener("keydown", function (e) { if (e.key === "Enter") submitAdd(); });
  }

  // Only say the code was copied if it really was. navigator.clipboard is
  // missing or refused on plenty of phone browsers, and the old code always
  // claimed success - so you would tap Copy, paste nothing, and blame the
  // code. When the clipboard is unavailable the code is selected instead so
  // it can be copied with the usual long-press.
  function copyMyCode() {
    var code = myCode();
    function selectFallback() {
      var span = els.body.querySelector(".fp-code span");
      try {
        if (span && window.getSelection && document.createRange) {
          var range = document.createRange();
          range.selectNodeContents(span);
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          if (document.execCommand && document.execCommand("copy")) {
            sel.removeAllRanges();
            if (window.ArcadeCommon) window.ArcadeCommon.toast(t("friends.copied", "Copied!"));
            return;
          }
        }
      } catch (e) {}
      if (window.ArcadeCommon) window.ArcadeCommon.toast("Hold on the code to copy it: " + code);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(function () {
        if (window.ArcadeCommon) window.ArcadeCommon.toast(t("friends.copied", "Copied!"));
      }, selectFallback);
    } else {
      selectFallback();
    }
  }

  function renderList() {
    var host = els.body.querySelector("#fp-list");
    var friends = getFriends();
    var html = "";
    if (friends.length === 0) {
      html += '<div class="instructions" data-i18n="friends.noFriends" style="text-align:left;">No friends yet.</div>';
    } else {
      friends.forEach(function (code) {
        var online = !!onlineSet[code];
        html += '<div class="friend-row" data-code="' + code + '" style="flex-direction:column; align-items:stretch;">' +
          '<div style="display:flex; justify-content:space-between; align-items:center;">' +
          '<span><span class="dot ' + (online ? "online" : "") + '"></span>' + code + "</span>" +
          '<span><button class="btn" data-action="chat" data-code="' + code + '" style="padding:4px 8px;">💬</button> ' +
          '<button class="btn" data-action="remove" data-code="' + code + '" style="padding:4px 8px;">🗑️</button></span>' +
          "</div>" + friendStatusLine(code) +
          "</div>";
      });
    }
    html += '<p class="instructions" data-i18n="friends.helpText" style="text-align:left;">Friends connect peer-to-peer.</p>';
    host.innerHTML = html;
    translateIn(host);

    host.querySelectorAll('[data-action="chat"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        activeChatWith = btn.getAttribute("data-code");
        renderChat(activeChatWith);
      });
    });
    host.querySelectorAll('[data-action="remove"]').forEach(function (btn) {
      btn.addEventListener("click", function () { removeFriend(btn.getAttribute("data-code")); });
    });
    host.querySelectorAll('[data-action="retry"]').forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var code = btn.getAttribute("data-code");
        delete connections[code];
        connectTo(code);
        renderPanel();
      });
    });
  }

  function renderPanel() {
    if (!els.body) return;
    if (activeChatWith) return renderChat(activeChatWith);
    ensureShell();
    els.body.querySelector("#fp-banner").innerHTML = relayStatusBanner();
    renderStatic();
    renderList();
  }

  // Same story as the panel: the chat used to rebuild its whole body - message
  // box included - on the refresh timer and on every incoming message, which
  // shut the phone keyboard mid-sentence. The message box is now built once
  // per conversation and left alone; only the header and the log redraw.
  var chatSig = null;

  function buildChatShell(code) {
    els.body.className = "fp-body chat-mode";
    els.body.innerHTML =
      '<div id="chat-head"></div>' +
      '<div class="chat-window"><div class="chat-log" id="chat-log"></div>' +
      '<div class="chat-input-row"><input id="chat-input" autocomplete="off" data-i18n-placeholder="friends.chatPlaceholder" placeholder="Type a message...">' +
      '<button class="btn btn-primary" id="chat-send" data-i18n="friends.send">Send</button></div></div>';
    chatSig = code;

    var input = els.body.querySelector("#chat-input");
    function doSend() {
      var text = input.value.trim();
      if (!text) return;
      sendChat(code, text);
      input.value = "";
      // Keep the keyboard up so you can carry on typing - re-focusing here is
      // allowed because it happens inside the tap that sent the message.
      input.focus();
    }
    els.body.querySelector("#chat-send").addEventListener("click", doSend);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") doSend(); });
    translateIn(els.body);
  }

  function renderChat(code) {
    var online = !!onlineSet[code];
    if (!online) connectTo(code);

    if (chatSig !== code || !els.body.querySelector("#chat-input")) buildChatShell(code);

    var head = els.body.querySelector("#chat-head");
    head.innerHTML = '<div class="friend-row" style="flex-direction:column; align-items:stretch; margin-bottom:8px;">' +
      '<div style="display:flex; align-items:center;">' +
      '<button class="btn" id="fp-back" style="padding:4px 8px;">←</button>&nbsp;' +
      '<span class="dot ' + (online ? "online" : "") + '"></span>' + code +
      "</div>" + friendStatusLine(code) +
      "</div>";
    translateIn(head);

    head.querySelector("#fp-back").addEventListener("click", function () {
      activeChatWith = null;
      chatSig = null;
      renderPanel();
    });
    head.querySelectorAll('[data-action="retry"]').forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        delete connections[code];
        connectTo(code);
        renderChat(code);
      });
    });

    var logEl = els.body.querySelector("#chat-log");
    var atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 30;
    logEl.innerHTML = "";
    loadChat(code).forEach(function (m) {
      var d = document.createElement("div");
      d.className = "chat-msg" + (m.from === "me" ? " me" : "");
      d.textContent = m.text;
      logEl.appendChild(d);
    });
    // Don't yank the view to the bottom if they've scrolled up to read.
    if (atBottom) logEl.scrollTop = logEl.scrollHeight;
  }

  function initPeer() {
    if (!window.Peer) return;
    try {
      peer = new window.Peer(myCode(), {
        debug: 0,
        config: {
          // STUN finds a direct path between the two browsers; TURN relays
          // traffic when routers block direct connections (same-WiFi setups
          // with client isolation, mobile networks, school firewalls...).
          // The turn.peerjs.com entries are PeerJS's OWN relay servers -
          // shipped in the library's default config and run by the same
          // people as the free broker we use. An earlier version of this
          // file overrode the config and accidentally dropped them, which
          // broke every match that needed relaying ("Connecting..." forever
          // even on the same WiFi). Keep them first; openrelay is a spare.
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            {
              urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"],
              username: "peerjs",
              credential: "peerjsp"
            },
            { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
            { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" }
          ]
        }
      });
    } catch (e) { return; }
    peer.on("open", function () {
      peerStatus = "connected";
      sameIdRetries = 0;
      lastPeerError = null;
      renderPanel();
      pollFriends();
      // Reconnect quickly when a friend reloads or changes page - their old
      // connection dies and game invites can't reach them until a new one
      // opens, so a short poll keeps that gap small.
      setInterval(pollFriends, 7000);
    });
    peer.on("connection", function (conn) {
      var code = conn.peer;
      if (getFriends().indexOf(code) === -1) {
        var list = getFriends();
        list.push(code);
        saveFriends(list);
      }
      setupConnection(code, conn);
    });
    peer.on("disconnected", function () {
      // Lost the signaling connection (network blip, broker restart, etc).
      // Reconnect so friends can still reach this browser's same code.
      peerStatus = "connecting";
      renderPanel();
      setTimeout(function () {
        // The disconnected guard matters: after an unavailable-id self-heal,
        // this timer can fire against the NEW peer, which isn't disconnected.
        if (peer && !peer.destroyed && peer.disconnected) peer.reconnect();
      }, 2000);
    });
    peer.on("error", function (err) {
      lastPeerError = err && err.type ? err.type : "unknown";
      if (err && err.type === "unavailable-id") {
        // "Code already registered" has TWO very different causes:
        // (a) A navigation race: when you go hub -> Pong, the new page tries
        //     to register while the broker hasn't yet noticed the old page's
        //     socket closing. The SAME code becomes free again within a
        //     couple of seconds - so retry it first. Renaming here (like v4
        //     did immediately) silently changes your code on every page
        //     switch, and friends end up dialing a code that no longer exists.
        // (b) A genuine collision (two people picked the same custom code).
        //     Only after the same-code retries fail do we mint a variant.
        try { peer.destroy(); } catch (e) {}
        peer = null;
        peerStatus = "connecting";
        renderPanel();
        if (sameIdRetries < 2) {
          sameIdRetries++;
          setTimeout(initPeer, 1200 * sameIdRetries);
        } else if (idRetries < 2) {
          idRetries++;
          sameIdRetries = 0;
          var chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
          var suffix = chars[Math.floor(Math.random() * chars.length)] + chars[Math.floor(Math.random() * chars.length)];
          var newCode = myCode().slice(0, 36) + "-" + suffix;
          activeCode = newCode;
          try { localStorage.setItem(CODE_KEY, newCode); } catch (e) {}
          if (window.ArcadeCommon) window.ArcadeCommon.toast("That code was already taken by someone else — your code is now " + newCode);
          renderPanel();
          setTimeout(initPeer, 500);
        } else {
          peerStatus = "failed";
          renderPanel();
        }
        return;
      }
      if (err && err.type === "peer-unavailable") {
        // The code WE dialed isn't registered right now - our own
        // registration is fine, so this must not flip the panel to "failed"
        // (it used to, painting a scary red banner just because a friend
        // was offline). Record it against that friend for the diagnostics.
        var m = /peer\s+(\S+)\s*$/.exec(err.message || "");
        var target = m ? m[1] : null;
        if (target) {
          lastConnError[target] = "not-online";
          delete connections[target];
          renderPanel();
        }
        return;
      }
      // Broker unreachable, blocked network, transient failure, etc - retry.
      peerStatus = "failed";
      renderPanel();
      if (peer && !peer.destroyed) {
        setTimeout(function () {
          if (peer && peer.disconnected && !peer.destroyed) peer.reconnect();
        }, 3000);
      }
    });
  }

  function loadPeerJs() {
    var s = document.createElement("script");
    s.src = rootPath() + "vendor/peerjs.min.js";
    s.onload = initPeer;
    s.onerror = function () { peerStatus = "failed"; renderPanel(); };
    document.head.appendChild(s);
  }

  function mount() {
    buildUI();
    renderPanel();
    if (window.ArcadeI18n) window.ArcadeI18n.onChange(renderPanel);
    loadPeerJs();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  function whenReady(code, callback, timeoutMs) {
    timeoutMs = timeoutMs || 8000;
    var conn = connections[code];
    if (conn && conn.open) { callback(true); return; }
    connectTo(code);
    var settled = false;
    var start = Date.now();
    var interval = setInterval(function () {
      if (settled) { clearInterval(interval); return; }
      var c = connections[code];
      if (c && c.open) {
        settled = true;
        clearInterval(interval);
        callback(true);
      } else if (Date.now() - start > timeoutMs) {
        settled = true;
        clearInterval(interval);
        callback(false);
      }
    }, 250);
  }

  window.ArcadeFriends = {
    myCode: myCode,
    setMyCode: setMyCode,
    addFriend: addFriend,
    isOnline: function (code) { return !!onlineSet[code]; },
    connect: connectTo,
    whenReady: whenReady,
    sendGame: function (code, payload) {
      var conn = connections[code];
      var msg = { type: "game", payload: payload };
      if (conn && conn.open) {
        conn.send(msg);
        return true;
      }
      // Queue it and keep trying to connect - it'll flush automatically
      // once (if) the peer-to-peer link actually opens.
      pendingMessages[code] = pendingMessages[code] || [];
      pendingMessages[code].push(msg);
      connectTo(code);
      return false;
    },
    onGameMessage: function (fn) { gameListeners.push(fn); }
  };
})();
