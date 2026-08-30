#!/usr/bin/env node
// `npm run link` — prints the ready-made links for this deployment, so nobody
// ever hunts through deploy output or copies tokens around by hand.
const { connection } = require("./config");

const { base, ingestToken, mcpToken, missing } = connection();
if (missing.length) {
  console.error("Can't build the links yet — missing: " + missing.join("; "));
  process.exit(1);
}

console.log(`
Vital — your links (each contains a secret; share only inside the family)

  Phone (paste as the ONE setting in the Vital app,
  or as the REST API URL in Health Auto Export — no headers needed):
      ${base}/ingest/${ingestToken}

  claude.ai → Settings → Connectors → Add custom connector (name it Vital):
      ${mcpToken ? `${base}/mcp/${mcpToken}` : `${base}/mcp   (set MCP_TOKEN in .env and redeploy to protect this!)`}

  Status page (safe to open in any browser, shows no health values):
      ${base}/health
`);
