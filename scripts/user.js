#!/usr/bin/env node
// `npm run user -- Papa Tim` — prints each family member's two personal links.
//
// No registration, no server call: the links are derived from the server's
// secrets with the same HMAC the server uses to verify them (src/health/users.ts),
// so any name works instantly and survives redeploys. Each person's data is
// stored separately and their connector only sees their own data.
const crypto = require("crypto");
const { connection } = require("./config");

function slugify(name) {
  const slug = String(name).trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.length >= 2 && slug.length <= 32 ? slug : undefined;
}

// Must match src/health/users.ts signature() exactly.
function signature(kind, secret, slug) {
  return crypto.createHmac("sha256", secret).update(`${kind}|${slug}`).digest("hex").slice(0, 40);
}

const names = process.argv.slice(2).filter((a) => !a.startsWith("-"));
if (names.length === 0) {
  console.error("Who? Example:  npm run user -- Papa Tim");
  process.exit(1);
}

const { base, ingestToken, mcpToken, missing } = connection();
if (!mcpToken) missing.push("MCP_TOKEN in .env (`npm run deploy` creates it)");
if (missing.length) {
  console.error("Can't build links yet — missing: " + missing.join("; "));
  process.exit(1);
}

for (const name of names) {
  const slug = slugify(name);
  if (!slug) {
    console.error(`Skipping "${name}" — names need 2+ letters/digits.`);
    continue;
  }
  const pretty = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
  console.log(`
${pretty} — personal links (secret; share only with ${pretty}):

  Phone (the ONE setting in the Vital app, or Health Auto Export's URL):
      ${base}/ingest/${slug}/${signature("ingest", ingestToken, slug)}

  ${pretty}'s claude.ai → Settings → Connectors → Add custom connector (name: Vital):
      ${base}/mcp/${slug}/${signature("mcp", mcpToken, slug)}
`);
}
console.log("Each person's data is stored separately; their connector sees only their own data.");
