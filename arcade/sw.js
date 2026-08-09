/* Claude Arc Games — offline service worker.

   This is what makes the site behave like an installed app: Android will
   offer a real "Install" prompt, and every game keeps working with no
   internet at all.

   Two rules, chosen deliberately:

   - Pages (HTML) are fetched from the NETWORK FIRST, falling back to the
     cache only when offline. A service worker that serves cached HTML is the
     classic way to leave someone stuck on an old version for ever, and this
     site has been bitten by stale caching before.
   - Everything else is served CACHE FIRST, which is safe because every asset
     URL carries ?v=N. A new release changes the URL, so it simply cannot
     match an old cached entry.

   VERSION must be bumped with the site's ?v=N. On activation every cache with
   a different name is deleted, so a new release wipes the old one out. */

var VERSION = "v18";
var CACHE = "arcade-" + VERSION;

// The game list is the real one, imported rather than copied, so this can
// never drift out of step with what is actually on the site. registry.js
// assigns to `window`, which does not exist in a worker.
self.window = self;
try { importScripts("js/registry.js?" + VERSION); } catch (e) {}

function shellUrls() {
  var v = "?v=" + VERSION.slice(1);
  var list = [
    "./", "index.html", "privacy.html", "manifest.json",
    "css/main.css" + v,
    "js/registry.js" + v, "js/i18n.js" + v, "js/common.js" + v,
    "js/friends.js" + v, "js/mods.js" + v, "js/ai.js" + v, "js/admin.js" + v,
    "vendor/peerjs.min.js",
    "icons/icon-192.png", "icons/icon-512.png"
  ];
  ["en", "es", "ru", "ro", "fr", "de"].forEach(function (l) {
    list.push("i18n/" + l + ".js" + v);
  });
  return list;
}

function gameUrls() {
  var games = self.ARCADE_GAMES || [];
  var list = [];
  games.forEach(function (g) {
    list.push("games/" + g.slug + "/index.html");
    list.push("games/" + g.slug + "/game.js");
    // Only some games ship a style.css, so a missing one must not abort the
    // whole install - each file is added individually below.
    list.push("games/" + g.slug + "/style.css");
  });
  return list;
}

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      var all = shellUrls().concat(gameUrls());
      // addAll() is atomic: one 404 throws the lot away. Add one at a time and
      // let the misses fall through.
      return Promise.all(all.map(function (u) {
        return cache.add(new Request(u, { cache: "reload" })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isPage(req) {
  return req.mode === "navigate" ||
    (req.headers.get("accept") || "").indexOf("text/html") !== -1;
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;   // let PeerJS etc. through

  if (isPage(req)) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match("index.html");
        });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
