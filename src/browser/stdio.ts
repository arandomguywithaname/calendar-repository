#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildBrowserMcpServer } from "./mcp";
import { cdpUrl, closeSession, profileDir } from "./session";

/**
 * Local stdio entry point for Claude Desktop / Claude Code:
 *
 *   { "mcpServers": { "browser": {
 *       "command": "node",
 *       "args": ["/path/to/calendar-repository/dist/browser/stdio.js"],
 *       "env": { "BROWSER_MODE": "attach" } } } }
 *
 * This one has to run on the machine with the screen and the browser — a
 * connector whose whole design is "ask the person to solve the CAPTCHA" is no
 * use on a server with nobody in front of it.
 *
 * On stdio, stdout belongs to the MCP protocol — log only to stderr.
 */
async function main() {
  const server = buildBrowserMcpServer();
  await server.connect(new StdioServerTransport());
  const mode = process.env.BROWSER_MODE || "auto";
  console.error(
    `browser MCP server running on stdio (mode: ${mode}, cdp: ${cdpUrl()}, profile: ${profileDir()})\n` +
      "The browser window stays visible on purpose: CAPTCHAs and logins are handed to you, not solved."
  );
}

// Release the browser on the way out; an attached Chrome is the user's and is
// only disconnected, never closed.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    closeSession().finally(() => process.exit(0));
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
