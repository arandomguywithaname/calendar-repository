#!/usr/bin/env node
// `npm run site:family` / `npm run site:gravita` — serves one of the static
// websites from this repo on http://localhost:8080 (PORT overrides it).
// No dependencies: plain Node, read-only, files inside the site folder only.
const http = require("http");
const fs = require("fs");
const path = require("path");

const SITES = {
  family: "family-website",
  gravita: "gravita-website",
};

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const name = process.argv[2];
if (!SITES[name]) {
  console.error("Usage: node scripts/serve-static.js <" + Object.keys(SITES).join("|") + ">");
  process.exit(1);
}
const root = path.resolve(__dirname, "..", SITES[name]);
const port = Number(process.env.PORT) || 8080;

/** Map a URL path to a file inside root, or null if it would escape it. */
function resolveFile(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath.split("?")[0]); } catch (e) { return null; }
  const file = path.resolve(root, "." + path.posix.normalize("/" + decoded));
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  return file;
}

/** Send a small plain-text error page. */
function fail(res, code, text) {
  res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") return fail(res, 405, "Method not allowed");
  let file = resolveFile(req.url);
  if (!file) return fail(res, 403, "Forbidden");
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) file = path.join(file, "index.html");
    fs.readFile(file, (err2, data) => {
      if (err2) return fail(res, 404, "Not found");
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Content-Length": data.length,
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    });
  });
});

server.listen(port, () => {
  console.log(`Serving ${SITES[name]}/ at http://localhost:${port}  (Ctrl+C to stop)`);
});
