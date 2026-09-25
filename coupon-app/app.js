(function () {
  "use strict";

  var data = window.COUPON_DATA || { stores: [] };
  var state = { q: "", cat: "All", verifiedOnly: false };
  var VOTES_KEY = "couponjar-votes";

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
      return navigator.clipboard.writeText(text).catch(function () { return fallbackCopy(text); });
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
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  function categories() {
    var set = {};
    data.stores.forEach(function (s) { set[s.category || "Other"] = true; });
    return ["All"].concat(Object.keys(set).sort());
  }

  function renderCats() {
    $("cats").innerHTML = categories().map(function (c) {
      return '<button class="chip" role="tab" data-cat="' + esc(c) + '" aria-selected="' + (c === state.cat) + '">' + esc(c) + "</button>";
    }).join("");
  }

  /** Stores (with filtered coupons) that match the current search and filters. */
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return data.stores.map(function (s) {
      if (state.cat !== "All" && (s.category || "Other") !== state.cat) return null;
      var storeHit = !q || s.name.toLowerCase().indexOf(q) !== -1 || (s.category || "").toLowerCase().indexOf(q) !== -1;
      var coupons = s.coupons.filter(function (c) {
        if (isExpired(c)) return false;
        if (state.verifiedOnly && !c.verified) return false;
        if (storeHit) return true;
        return [c.code, c.title, c.details].join(" ").toLowerCase().indexOf(q) !== -1;
      });
      return coupons.length ? { store: s, coupons: coupons } : null;
    }).filter(Boolean);
  }

  function couponHtml(s, c) {
    var key = s.id + ":" + c.code;
    var v = votes[key];
    var badges = [];
    if (c.verified) badges.push('<span class="badge good">✓ Verified</span>');
    badges.push('<span class="badge">' + (c.expires ? "Expires " + esc(fmtDate(c.expires)) : "No expiry listed") + "</span>");
    return (
      '<div class="coupon">' +
        '<div class="coupon-body">' +
          '<div class="coupon-title">' + esc(c.title) + "</div>" +
          (c.details ? '<div class="coupon-details muted">' + esc(c.details) + "</div>" : "") +
          '<div class="badges">' + badges.join("") + "</div>" +
          '<div class="votes muted">Did it work?' +
            '<button data-vote="up" data-key="' + esc(key) + '" aria-pressed="' + (v === "up") + '">👍 Yes</button>' +
            '<button data-vote="down" data-key="' + esc(key) + '" aria-pressed="' + (v === "down") + '">👎 No</button>' +
          "</div>" +
        "</div>" +
        '<button class="code-btn hidden-code" data-code="' + esc(c.code) + '" data-url="' + esc(s.url) + '">Show code</button>' +
      "</div>"
    );
  }

  function render() {
    var list = filtered();
    var total = list.reduce(function (n, r) { return n + r.coupons.length; }, 0);
    $("count").textContent = total + " code" + (total === 1 ? "" : "s") + " at " + list.length + " store" + (list.length === 1 ? "" : "s");
    $("empty").hidden = list.length > 0;
    $("stores").innerHTML = list.map(function (r) {
      var s = r.store;
      return (
        '<article class="store">' +
          '<div class="store-head">' +
            '<div class="avatar" style="background:' + esc(s.color || "#888") + '">' + esc(s.name.charAt(0)) + "</div>" +
            '<div><div class="store-name">' + esc(s.name) + '</div><div class="store-meta muted">' + esc(s.category || "") + "</div></div>" +
            (s.url ? '<a class="shop" href="' + esc(s.url) + '" target="_blank" rel="noopener nofollow">Shop now ↗</a>' : "") +
          "</div>" +
          r.coupons.map(function (c) { return couponHtml(s, c); }).join("") +
        "</article>"
      );
    }).join("");
    notifyHeight();
  }

  /** Tell a parent page (e.g. Squarespace embed) how tall we are so the iframe can fit. */
  function notifyHeight() {
    if (window.parent === window) return;
    requestAnimationFrame(function () {
      window.parent.postMessage({ type: "couponjar:height", height: document.documentElement.scrollHeight }, "*");
    });
  }

  // --- Events ---------------------------------------------------------------

  $("q").addEventListener("input", function (e) { state.q = e.target.value; render(); });
  $("verified-only").addEventListener("change", function (e) { state.verifiedOnly = e.target.checked; render(); });

  $("cats").addEventListener("click", function (e) {
    var b = e.target.closest("[data-cat]");
    if (!b) return;
    state.cat = b.getAttribute("data-cat");
    renderCats();
    render();
  });

  $("stores").addEventListener("click", function (e) {
    var codeBtn = e.target.closest(".code-btn");
    if (codeBtn) {
      var code = codeBtn.getAttribute("data-code");
      var firstReveal = codeBtn.classList.contains("hidden-code");
      codeBtn.classList.remove("hidden-code");
      codeBtn.textContent = code;
      copy(code).then(function () { toast("Copied " + code + " — paste it at checkout"); });
      // Like Honey-style sites: first click also opens the store in a new tab.
      var url = codeBtn.getAttribute("data-url");
      if (firstReveal && url) window.open(url, "_blank", "noopener");
      return;
    }
    var voteBtn = e.target.closest("[data-vote]");
    if (voteBtn) {
      var key = voteBtn.getAttribute("data-key");
      var dir = voteBtn.getAttribute("data-vote");
      votes[key] = votes[key] === dir ? undefined : dir;
      saveVotes(votes);
      render();
      toast(dir === "up" ? "Thanks! Glad it worked." : "Thanks — we'll recheck that one.");
    }
  });

  $("submit-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.target;
    var body = new URLSearchParams(new FormData(form)).toString();
    var msg = $("submit-msg");
    msg.textContent = "Sending…";
    fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body })
      .then(function (res) {
        if (!res.ok) throw new Error(res.status);
        form.reset();
        msg.textContent = "Thanks! We'll review it soon.";
      })
      .catch(function () {
        msg.textContent = "Couldn't send right now — submissions work once the site is live on Netlify.";
      });
  });

  window.addEventListener("resize", notifyHeight);

  // --- Init -----------------------------------------------------------------

  if (data.siteName) { $("site-name").textContent = data.siteName; document.title = data.siteName + " — Promo Codes"; }
  if (data.tagline) $("tagline").textContent = data.tagline;
  renderCats();
  render();
})();
