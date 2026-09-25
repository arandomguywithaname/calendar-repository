(function () {
  "use strict";

  var raw = window.COUPON_DATA || {};
  var state = { q: "", cat: "All", codesOnly: false };
  var revealed = {}; // coupon keys the visitor has already revealed

  /** Only allow real web links for "Shop now" (blocks javascript: and typos). */
  function safeUrl(u) {
    return /^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "";
  }

  /** Text or number from the data file as a trimmed string; anything else becomes "". */
  function text(v) {
    return typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
  }

  /** Clean up hand-edited data so a missing field can't break the page. */
  function normalize(stores) {
    var seen = {};
    return (Array.isArray(stores) ? stores : []).filter(function (s) {
      return s && typeof s === "object" && text(s.name);
    }).map(function (s, i) {
      var id = text(s.id) || text(s.name);
      if (seen[id]) id += "-" + i;
      seen[id] = true;
      return {
        id: id,
        name: text(s.name),
        category: text(s.category) || "Other",
        url: safeUrl(text(s.url)),
        color: /^#[0-9a-f]{3,8}$|^[a-z]+$/i.test(text(s.color)) ? text(s.color) : "#888",
        coupons: (Array.isArray(s.coupons) ? s.coupons : []).filter(function (c) {
          // An offer is either a promo code or a link to a deal page.
          return c && typeof c === "object" && (text(c.code) || safeUrl(text(c.url)));
        }).map(function (c) {
          var code = text(c.code);
          return {
            code: code,
            url: code ? "" : safeUrl(text(c.url)),
            title: text(c.title) || (code ? "Promo code" : "Deal"),
            details: text(c.details),
            expires: text(c.expires),
            verified: c.verified === true
          };
        })
      };
    });
  }
  var data = { siteName: raw.siteName, tagline: raw.tagline, stores: normalize(raw.stores) };
  var VOTES_KEY = "couponify-votes";

  var $ = function (id) { return document.getElementById(id); };

  /** Escape a value for safe use inside innerHTML. */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /** Read this visitor's worked / didn't-work votes (browser-only). */
  function loadVotes() {
    try { return JSON.parse(localStorage.getItem(VOTES_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveVotes(v) {
    try { localStorage.setItem(VOTES_KEY, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
  }
  var votes = loadVotes();

  /** True if a coupon's expiry date is in the past. */
  function isExpired(c) {
    if (!c.expires) return false;
    var end = new Date(c.expires + "T23:59:59");
    return !isNaN(end) && end < new Date();
  }

  function fmtDate(s) {
    var d = new Date(s + "T00:00:00");
    return isNaN(d) ? s : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  /** Show a short message at the bottom of the screen. */
  var toastTimer;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  /** Copy text to the clipboard, with a fallback for iframes / older browsers. */
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return fallbackCopy(text); }
      );
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
    return ok;
  }

  function categories() {
    var set = {};
    data.stores.forEach(function (s) { set[s.category] = true; });
    delete set.All;
    return ["All"].concat(Object.keys(set).sort());
  }

  function renderCats() {
    $("cats").innerHTML = categories().map(function (c) {
      return '<button type="button" class="chip" data-cat="' + esc(c) + '" aria-pressed="' + (c === state.cat) + '">' + esc(c) + "</button>";
    }).join("");
  }

  /** Stores (with filtered coupons) that match the current search and filters. */
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return data.stores.map(function (s) {
      if (state.cat !== "All" && s.category !== state.cat) return null;
      var has = function (field) { return field.toLowerCase().indexOf(q) !== -1; };
      var storeHit = !q || has(s.name) || has(s.category);
      var coupons = s.coupons.filter(function (c) {
        if (isExpired(c)) return false;
        if (state.codesOnly && !c.code) return false;
        if (storeHit) return true;
        return has(c.code) || has(c.title) || has(c.details);
      });
      return coupons.length ? { store: s, coupons: coupons } : null;
    }).filter(Boolean);
  }

  function couponHtml(s, c) {
    var key = s.id + ":" + (c.code || "deal:" + c.title);
    var v = votes[key];
    var shown = revealed[key];
    var badges = [];
    if (c.verified) badges.push('<span class="badge good">✓ Verified</span>');
    if (!c.code) badges.push('<span class="badge">Official deals page</span>');
    badges.push('<span class="badge">' + (c.expires ? "Ends " + esc(fmtDate(c.expires)) : c.code ? "No end date listed" : "Updated by the store") + "</span>");
    return (
      '<div class="coupon">' +
        '<div class="coupon-body">' +
          '<div class="coupon-title">' + esc(c.title) + "</div>" +
          (c.details ? '<div class="coupon-details muted">' + esc(c.details) + "</div>" : "") +
          '<div class="badges">' + badges.join("") + "</div>" +
          '<div class="votes muted">Did it work?' +
            '<button type="button" data-vote="up" data-key="' + esc(key) + '" aria-pressed="' + (v === "up") + '">👍 Yes</button>' +
            '<button type="button" data-vote="down" data-key="' + esc(key) + '" aria-pressed="' + (v === "down") + '">👎 No</button>' +
          "</div>" +
        "</div>" +
        (c.code
          ? '<button type="button" class="code-btn' + (shown ? "" : " hidden-code") + '" data-key="' + esc(key) + '" data-code="' + esc(c.code) + '" data-url="' + esc(s.url) + '">' + (shown ? esc(c.code) : "Show code") + "</button>"
          : '<a class="code-btn hidden-code deal-btn" href="' + esc(c.url) + '" target="_blank" rel="noopener nofollow">Get deal ↗</a>') +
      "</div>"
    );
  }

  function render() {
    var list = filtered();
    var total = list.reduce(function (n, r) { return n + r.coupons.length; }, 0);
    $("count").textContent = total + " offer" + (total === 1 ? "" : "s") + " at " + list.length + " store" + (list.length === 1 ? "" : "s");
    $("empty").hidden = list.length > 0;
    $("stores").innerHTML = list.map(function (r) {
      var s = r.store;
      return (
        '<article class="store">' +
          '<div class="store-head">' +
            '<div class="avatar" style="background:' + esc(s.color) + '">' + esc(Array.from(s.name)[0].toUpperCase()) + "</div>" +
            '<div><div class="store-name">' + esc(s.name) + '</div><div class="store-meta muted">' + esc(s.category) + "</div></div>" +
            (s.url ? '<a class="shop" href="' + esc(s.url) + '" target="_blank" rel="noopener nofollow">Shop now ↗</a>' : "") +
          "</div>" +
          r.coupons.map(function (c) { return couponHtml(s, c); }).join("") +
        "</article>"
      );
    }).join("");
    notifyHeight();
  }

  /**
   * Tell a parent page (e.g. Squarespace embed) how tall we are so the iframe can fit.
   * Measures <body> rather than scrollHeight, which never drops below the iframe's
   * current height and so would stop the embed from shrinking.
   */
  function notifyHeight() {
    if (window.parent === window) return;
    var height = Math.ceil(document.body.getBoundingClientRect().height);
    window.parent.postMessage({ type: "couponify:height", height: height }, "*");
  }

  // --- Events ---------------------------------------------------------------

  $("q").addEventListener("input", function (e) { state.q = e.target.value; render(); });
  $("codes-only").addEventListener("change", function (e) { state.codesOnly = e.target.checked; render(); });

  $("cats").addEventListener("click", function (e) {
    var b = e.target.closest("[data-cat]");
    if (!b) return;
    state.cat = b.getAttribute("data-cat");
    renderCats();
    render();
  });

  $("stores").addEventListener("click", function (e) {
    var codeBtn = e.target.closest("button.code-btn");
    if (codeBtn) {
      var code = codeBtn.getAttribute("data-code");
      var key = codeBtn.getAttribute("data-key");
      var url = safeUrl(codeBtn.getAttribute("data-url"));
      var firstReveal = !revealed[key];
      revealed[key] = true;
      render();
      // Copy before opening the tab: the clipboard needs this page to still have focus.
      copy(code).then(function (ok) {
        toast(ok ? "Copied " + code + " — paste it at checkout" : "Your code is " + code + " — copy it before checkout");
      });
      // Like Honey-style sites: first click also opens the store in a new tab.
      if (firstReveal && url) window.open(url, "_blank", "noopener");
      return;
    }
    var voteBtn = e.target.closest("[data-vote]");
    if (voteBtn) {
      var key = voteBtn.getAttribute("data-key");
      var dir = voteBtn.getAttribute("data-vote");
      var undo = votes[key] === dir;
      if (undo) delete votes[key]; else votes[key] = dir;
      saveVotes(votes);
      render();
      toast(undo ? "Vote removed." : dir === "up" ? "Thanks! Glad it worked." : "Thanks — we'll recheck that one.");
    }
  });

  $("submit-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.target;
    var body = new URLSearchParams(new FormData(form)).toString();
    var msg = $("submit-msg");
    var btn = form.querySelector("button[type=submit]");
    if (btn.disabled) return;
    btn.disabled = true;
    msg.textContent = "Sending…";
    fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body })
      .then(function (res) {
        if (!res.ok) throw new Error(res.status);
        form.reset();
        msg.textContent = "Thanks! We'll review it soon.";
      })
      .catch(function () {
        msg.textContent = "Couldn't send right now — submissions work once the site is live on Netlify.";
      })
      .then(function () { btn.disabled = false; });
  });

  window.addEventListener("resize", notifyHeight);
  // Also catch size changes that aren't re-renders (font loading, form messages).
  if (window.ResizeObserver) new ResizeObserver(notifyHeight).observe(document.body);

  // --- Init -----------------------------------------------------------------

  if (data.siteName) { $("site-name").textContent = data.siteName; document.title = data.siteName + " — Promo Codes"; }
  if (data.tagline) $("tagline").textContent = data.tagline;
  renderCats();
  render();
})();
