#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildHealthMcpServer } from "./mcp";
import { storePath } from "./store";

/**
 * Local stdio entry point for Claude Desktop (no hosting needed):
 *
 *   { "mcpServers": { "apple-health": {
 *       "command": "node",
 *       "args": ["/path/to/calendar-repository/dist/health/stdio.js"],
 *       "env": { "DATA_DIR": "/path/to/health-data" } } } }
 *
 * Reads the same JSON store the web server writes. On stdio, stdout is
 * reserved for the MCP protocol — log only to stderr.
 */
async function main() {
  const server = buildHealthMcpServer();
  await server.connect(new StdioServerTransport());
  console.error(`apple-health MCP server running on stdio (data: ${storePath()})`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
