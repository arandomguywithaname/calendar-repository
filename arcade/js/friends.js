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

  function myCode() {
    var code = null;
    try { code = localStorage.getItem(CODE_KEY); } catch (e) {}
    if (!code) {
      code = genCode();
      try { localStorage.setItem(CODE_KEY, code); } catch (e) {}
    }
    return code;
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
    var attempt = connectAttempts[code];
    var fails = attempt ? attempt.failCount || 0 : 0;
    if (fails >= 2) {
      return '<div style="color:var(--warn); font-size:0.78rem; margin-top:2px;">' +
        "⚠ Couldn't connect after several tries. This usually means one of you is on a network " +
        "that blocks direct peer-to-peer connections (school/office WiFi, a VPN, or a strict firewall). " +
        "Try a different network (e.g. home WiFi) on either side, or " +
        '<button class="btn" data-action="retry" data-code="' + code + '" style="padding:2px 8px; font-size:0.75rem;">Retry now</button></div>';
    }
    return '<div style="color:var(--text-dim); font-size:0.78rem; margin-top:2px;">Connecting...</div>';
  }

  function relayStatusBanner() {
    if (peerStatus === "connected") return "";
    if (peerStatus === "failed") {
      return '<div class="instructions" style="text-align:left; color:var(--danger);">' +
        "⚠ Couldn't reach the connection service used to find friends. Check your internet connection, " +
        "or a VPN/firewall/ad-blocker may be blocking it. Friends/chat won't work until this connects, " +
        "but every game still works fine.</div>";
    }
    return '<div class="instructions" style="text-align:left; color:var(--text-dim);">Connecting to the friends service...</div>';
  }

  function renderPanel() {
    if (!els.body) return;
    if (activeChatWith) return renderChat(activeChatWith);

    var prevInput = els.body.querySelector("#fp-add-input");
    var preservedValue = prevInput ? prevInput.value : "";
    var hadFocus = prevInput === document.activeElement;

    var friends = getFriends();
    var html = "";
    html += relayStatusBanner();
    html += '<div class="fp-code"><span>' + myCode() + '</span>' +
      '<button class="btn" id="fp-copy" style="padding:4px 10px;" data-i18n="friends.copy">Copy</button></div>';
    html += '<div class="fp-add"><input id="fp-add-input" data-i18n-placeholder="friends.addPlaceholder" placeholder="Enter friend\'s code">' +
      '<button class="btn btn-primary" id="fp-add-btn" data-i18n="friends.add">Add</button></div>';

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
    els.body.innerHTML = html;
    els.body.className = "fp-body";

    if (preservedValue) {
      var newInput = els.body.querySelector("#fp-add-input");
      if (newInput) {
        newInput.value = preservedValue;
        if (hadFocus) newInput.focus();
      }
    }

    if (window.ArcadeI18n) {
      els.body.querySelectorAll("[data-i18n]").forEach(function (el) {
        el.textContent = t(el.getAttribute("data-i18n"));
      });
      els.body.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
        el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
      });
    }

    els.body.querySelector("#fp-copy").addEventListener("click", function () {
      var code = myCode();
      if (navigator.clipboard) navigator.clipboard.writeText(code).catch(function () {});
      if (window.ArcadeCommon) window.ArcadeCommon.toast(t("friends.copied", "Copied!"));
    });
    els.body.querySelector("#fp-add-btn").addEventListener("click", function () {
      var input = els.body.querySelector("#fp-add-input");
      var code = (input.value || "").trim().toUpperCase();
      if (code && code === myCode()) {
        if (window.ArcadeCommon) window.ArcadeCommon.toast("That's your own code! Ask your friend for theirs.");
        return;
      }
      if (addFriend(input.value)) { input.value = ""; renderPanel(); }
    });
    els.body.querySelectorAll('[data-action="chat"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        activeChatWith = btn.getAttribute("data-code");
        renderChat(activeChatWith);
      });
    });
    els.body.querySelectorAll('[data-action="remove"]').forEach(function (btn) {
      btn.addEventListener("click", function () { removeFriend(btn.getAttribute("data-code")); });
    });
    els.body.querySelectorAll('[data-action="retry"]').forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var code = btn.getAttribute("data-code");
        delete connections[code];
        connectTo(code);
        renderPanel();
      });
    });
  }

  function renderChat(code) {
    var online = !!onlineSet[code];
    if (!online) connectTo(code);
    var log = loadChat(code);

    var prevInput = els.body.querySelector("#chat-input");
    var preservedValue = prevInput ? prevInput.value : "";
    var hadFocus = prevInput === document.activeElement;

    var html = '<div class="friend-row" style="flex-direction:column; align-items:stretch; margin-bottom:8px;">' +
      '<div style="display:flex; align-items:center;">' +
      '<button class="btn" id="fp-back" style="padding:4px 8px;">←</button>&nbsp;' +
      '<span class="dot ' + (online ? "online" : "") + '"></span>' + code +
      "</div>" + friendStatusLine(code) +
      "</div>" +
      '<div class="chat-window"><div class="chat-log" id="chat-log"></div>' +
      '<div class="chat-input-row"><input id="chat-input" data-i18n-placeholder="friends.chatPlaceholder" placeholder="Type a message...">' +
      '<button class="btn btn-primary" id="chat-send" data-i18n="friends.send">Send</button></div></div>';
    els.body.innerHTML = html;
    els.body.className = "fp-body chat-mode";

    var logEl = els.body.querySelector("#chat-log");
    log.forEach(function (m) {
      var d = document.createElement("div");
      d.className = "chat-msg" + (m.from === "me" ? " me" : "");
      d.textContent = m.text;
      logEl.appendChild(d);
    });
    logEl.scrollTop = logEl.scrollHeight;

    if (window.ArcadeI18n) {
      els.body.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
      els.body.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) { el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder"))); });
    }

    els.body.querySelector("#fp-back").addEventListener("click", function () {
      activeChatWith = null;
      renderPanel();
    });
    els.body.querySelectorAll('[data-action="retry"]').forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        delete connections[code];
        connectTo(code);
        renderChat(code);
      });
    });
    var input = els.body.querySelector("#chat-input");
    if (preservedValue) {
      input.value = preservedValue;
      if (hadFocus) input.focus();
    }
    function doSend() {
      var text = input.value.trim();
      if (!text) return;
      sendChat(code, text);
      input.value = "";
    }
    els.body.querySelector("#chat-send").addEventListener("click", doSend);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") doSend(); });
  }

  function initPeer() {
    if (!window.Peer) return;
    try {
      peer = new window.Peer(myCode(), {
        debug: 0,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
            { urls: "stun:stun.services.mozilla.com" }
          ]
        }
      });
    } catch (e) { return; }
    peer.on("open", function () {
      peerStatus = "connected";
      renderPanel();
      pollFriends();
      setInterval(pollFriends, 20000);
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
        if (peer && !peer.destroyed) peer.reconnect();
      }, 2000);
    });
    peer.on("error", function (err) {
      // Broker unreachable, blocked network, transient failure, etc. Retry
      // unless the failure means this exact ID can never work (already taken).
      var fatal = err && err.type === "unavailable-id";
      peerStatus = fatal ? "connected" : "failed";
      renderPanel();
      if (!fatal && peer && !peer.destroyed) {
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
