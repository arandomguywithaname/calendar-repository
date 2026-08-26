import * as crypto from "crypto";
import * as path from "path";
import express, { NextFunction, Request, Response, Router } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildAthlyticMcpServer } from "./mcp";
import { ingestPayload } from "./ingest";
import { loadStore, saveStore, sortedDates } from "./store";

/**
 * HTTP surface of the Athlytic connector:
 *   POST /api/athlytic/ingest   ← Health Auto Export pushes JSON here (token required)
 *   GET  /api/athlytic/status   ← non-sensitive sync status (used by the /athlytic page)
 *   ALL  /mcp[/<MCP_TOKEN>]     ← the Claude connector endpoint (Streamable HTTP, stateless)
 *   GET  /athlytic              ← setup/status/upload page
 */

function tokensMatch(provided: string, expected: string): boolean {
  // Hash first so timingSafeEqual gets equal-length buffers.
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function providedToken(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const apiKey = req.headers["x-api-key"];
  if (typeof apiKey === "string" && apiKey) return apiKey;
  if (typeof req.query.token === "string" && req.query.token) return req.query.token;
  return undefined;
}

/** Ingest requires ATHLYTIC_INGEST_TOKEN — health data should never be writable by strangers. */
function requireIngestToken(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ATHLYTIC_INGEST_TOKEN;
  if (!expected) {
    res.status(503).json({
      error:
        "Ingest is disabled: set the ATHLYTIC_INGEST_TOKEN environment variable (e.g. `fly secrets set ATHLYTIC_INGEST_TOKEN=...`), " +
        "then send that token as an `Authorization: Bearer <token>` header from Health Auto Export.",
    });
    return;
  }
  const provided = providedToken(req);
  if (!provided || !tokensMatch(provided, expected)) {
    res.status(401).json({ error: "Missing or invalid token. Send `Authorization: Bearer <ATHLYTIC_INGEST_TOKEN>`." });
    return;
  }
  next();
}

function jsonRpcError(res: Response, status: number, code: number, message: string): void {
  res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });
}

/**
 * Stateless Streamable HTTP handler: a fresh server+transport per POST.
 * No sessions to manage, works behind Fly's proxy, and every request
 * sees the latest synced data.
 */
async function handleMcpPost(req: Request, res: Response): Promise<void> {
  const server = buildAthlyticMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request failed:", err);
    if (!res.headersSent) jsonRpcError(res, 500, -32603, "Internal server error");
  }
}

export function athlyticRouter(): Router {
  const router = express.Router();
  const mcpToken = process.env.MCP_TOKEN;

  router.post("/api/athlytic/ingest", requireIngestToken, (req: Request, res: Response) => {
    try {
      const store = loadStore();
      const summary = ingestPayload(store, req.body, "health-auto-export");
      saveStore(store);
      const dates = sortedDates(store);
      console.log(
        `Athlytic ingest: ${summary.dataPoints} points, ${summary.daysTouched} days (${summary.firstDate}..${summary.lastDate})`
      );
      res.json({ ok: true, ...summary, totalDaysStored: dates.length });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message || "Failed to parse payload." });
    }
  });

  // Deliberately excludes health values — it powers the public setup page.
  router.get("/api/athlytic/status", (_req: Request, res: Response) => {
    const store = loadStore();
    const dates = sortedDates(store);
    res.json({
      daysStored: dates.length,
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
      lastSync: store.updatedAt ?? null,
      ingestConfigured: Boolean(process.env.ATHLYTIC_INGEST_TOKEN),
      mcpPath: mcpToken ? "/mcp/<MCP_TOKEN>" : "/mcp",
    });
  });

  // The Claude connector endpoint. With MCP_TOKEN set, the real endpoint
  // lives at /mcp/<token> (claude.ai custom connectors can't send custom
  // headers, so a secret path is the practical way to keep it private).
  const guard = (req: Request, res: Response, next: NextFunction): void => {
    if (!mcpToken) {
      next();
      return;
    }
    const supplied = req.params.token ?? providedToken(req);
    if (supplied && tokensMatch(supplied, mcpToken)) {
      next();
      return;
    }
    jsonRpcError(res, 401, -32000, "Unauthorized: connect via /mcp/<MCP_TOKEN>.");
  };

  for (const p of ["/mcp", "/mcp/:token"]) {
    router.post(p, guard, handleMcpPost);
    // Stateless server: no standalone SSE stream, no sessions to delete.
    router.get(p, guard, (_req, res) => jsonRpcError(res, 405, -32000, "Method Not Allowed: POST only."));
    router.delete(p, guard, (_req, res) => jsonRpcError(res, 405, -32000, "Method Not Allowed: POST only."));
  }
  if (!mcpToken) {
    console.warn("MCP_TOKEN is not set — /mcp is unauthenticated. Set MCP_TOKEN before exposing this server publicly.");
  }

  router.get("/athlytic", (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "../../public/athlytic.html"));
  });

  return router;
}
