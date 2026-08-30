// Shared helpers for the little command-line tools: read .env and fly.toml
// so `npm run link` / `npm run demo` can assemble the real URLs themselves.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function readEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return {};
  const values = {};
  for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) values[m[1]] = m[2].trim();
  }
  return values;
}

function flyAppName() {
  const tomlPath = path.join(ROOT, "fly.toml");
  if (!fs.existsSync(tomlPath)) return undefined;
  const m = fs.readFileSync(tomlPath, "utf-8").match(/^app\s*=\s*['"]([^'"]+)['"]/m);
  return m ? m[1] : undefined;
}

/** Everything the tools need, or a clear explanation of what's missing. */
function connection({ urlOverride } = {}) {
  const env = readEnv();
  const ingestToken = env.HEALTH_INGEST_TOKEN || env.ATHLYTIC_INGEST_TOKEN;
  const mcpToken = env.MCP_TOKEN;
  const app = flyAppName();

  let base = urlOverride;
  if (!base && app && app !== "calendar-repository") base = `https://${app}.fly.dev`;
  if (base) {
    base = base.trim();
    while (base.endsWith("/")) base = base.slice(0, -1);
    if (!/^https?:\/\//i.test(base)) base = "https://" + base;
  }

  const missing = [];
  if (!base) missing.push("the server address (deploy first with `npm run deploy`)");
  if (!ingestToken) missing.push("HEALTH_INGEST_TOKEN in .env (`npm run deploy` creates it)");
  return { base, ingestToken, mcpToken, missing };
}

module.exports = { ROOT, readEnv, flyAppName, connection };
