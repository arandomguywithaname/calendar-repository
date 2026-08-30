import * as crypto from "crypto";
import * as path from "path";
import express, { NextFunction, Request, Response, Router } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildHealthMcpServer } from "./mcp";
import { ingestPayload } from "./ingest";
import { loadStore, saveStore, sortedDates, userStoreCount } from "./store";
import { HealthUser, verifyUser } from "./users";

/**
 * HTTP surface of the Apple Health connector:
 *   POST /api/health/ingest   ← Health Auto Export pushes JSON here (token required)
 *   GET  /api/health/status   ← non-sensitive sync status (used by the /health page)
 *   ALL  /mcp[/<MCP_TOKEN>]   ← the Claude connector endpoint (Streamable HTTP, stateless)
 *   GET  /health              ← setup/status/upload page
 * The pre-rename /api/athlytic/* and /athlytic paths stay as aliases.
 */

function ingestToken(): string | undefined {
  // HEALTH_INGEST_TOKEN is the current name; ATHLYTIC_INGEST_TOKEN kept for existing setups.
  return process.env.HEALTH_INGEST_TOKEN || process.env.ATHLYTIC_INGEST_TOKEN;
}

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

/** Ingest requires the token — health data should never be writable by strangers. */
function requireIngestToken(req: Request, res: Response, next: NextFunction): void {
  const expected = ingestToken();
  if (!expected) {
    res.status(503).json({
      error:
        "Ingest is disabled: set the HEALTH_INGEST_TOKEN environment variable (e.g. `fly secrets set HEALTH_INGEST_TOKEN=...`), " +
        "then send that token as an `Authorization: Bearer <token>` header from Health Auto Export.",
    });
    return;
  }
  const provided = providedToken(req);
  if (!provided || !tokensMatch(provided, expected)) {
    res.status(401).json({ error: "Missing or invalid token. Send `Authorization: Bearer <HEALTH_INGEST_TOKEN>`." });
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
  const server = buildHealthMcpServer(res.locals.healthUser as HealthUser | undefined);
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

export function healthRouter(): Router {
  const router = express.Router();
  const mcpToken = process.env.MCP_TOKEN;

  const handleIngest = (req: Request, res: Response) => {
    const user = res.locals.healthUser as HealthUser | undefined;
    try {
      const store = loadStore(user?.slug);
      const summary = ingestPayload(store, req.body, "health-auto-export");
      saveStore(store, user?.slug);
      const dates = sortedDates(store);
      console.log(
        `Health ingest (${user?.name ?? "default"}): ${summary.dataPoints} points, ` +
          `${summary.daysTouched} days (${summary.firstDate}..${summary.lastDate})`
      );
      res.json({ ok: true, ...summary, totalDaysStored: dates.length });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message || "Failed to parse payload." });
    }
  };

  // Deliberately excludes health values — it powers the public setup page.
  const handleStatus = (_req: Request, res: Response) => {
    const store = loadStore();
    const dates = sortedDates(store);
    res.json({
      daysStored: dates.length,
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
      lastSync: store.updatedAt ?? null,
      ingestConfigured: Boolean(ingestToken()),
      mcpPath: mcpToken ? "/mcp/<MCP_TOKEN>" : "/mcp",
      familyMembers: userStoreCount(),
    });
  };

  for (const base of ["/api/health", "/api/athlytic"]) {
    router.post(`${base}/ingest`, requireIngestToken, handleIngest);
    router.get(`${base}/status`, handleStatus);
  }

  // Secret-link ingest: the token lives inside the URL, so the phone needs
  // exactly one thing pasted (no headers). Same pattern as /mcp/<token>.
  const linkGuard = (req: Request, res: Response, next: NextFunction): void => {
    const expected = ingestToken();
    const supplied = typeof req.params.token === "string" ? req.params.token : "";
    if (!expected) {
      res.status(503).json({ error: "Ingest is disabled: set HEALTH_INGEST_TOKEN on the server first." });
      return;
    }
    if (!supplied || !tokensMatch(supplied, expected)) {
      res.status(401).json({ error: "Wrong link. Get the current one with `npm run link` on the computer." });
      return;
    }
    next();
  };
  router.post("/ingest/:token", linkGuard, handleIngest);
  // Someone will click the link in a chat — greet them instead of erroring.
  const greetSender = (_req: Request, res: Response) => {
    const user = res.locals.healthUser as HealthUser | undefined;
    res
      .type("text/plain")
      .send(
        `This is ${user ? user.name + "'s" : "the"} secret SEND address — and it's working. Don't share it.\n` +
          "It belongs in the Vital app's settings (or in Health Auto Export as the REST API URL). Data sent here shows up on /health.\n" +
          "\n" +
          "Trying to connect Claude? That's the OTHER link — the one with /mcp/ in it — pasted into claude.ai → Settings → Connectors."
      );
  };
  router.get("/ingest/:token", linkGuard, greetSender);

  // Per-person links, verified statelessly by signature (see users.ts):
  //   /ingest/<name>/<sig>  and  /mcp/<name>/<sig> — printed by `npm run user`.
  const userIngestGuard = (req: Request, res: Response, next: NextFunction): void => {
    if (!ingestToken()) {
      res.status(503).json({ error: "Ingest is disabled: set HEALTH_INGEST_TOKEN on the server first." });
      return;
    }
    const user = verifyUser("ingest", ingestToken(), req.params.user, req.params.sig);
    if (!user) {
      res.status(401).json({ error: "Wrong link. Get the current one with `npm run user -- <Name>` on the computer." });
      return;
    }
    res.locals.healthUser = user;
    next();
  };
  router.post("/ingest/:user/:sig", userIngestGuard, handleIngest);
  router.get("/ingest/:user/:sig", userIngestGuard, greetSender);

  const userMcpGuard = (req: Request, res: Response, next: NextFunction): void => {
    const user = verifyUser("mcp", mcpToken, req.params.user, req.params.sig);
    if (!user) {
      jsonRpcError(res, 401, -32000, "Unauthorized: get this person's connector link with `npm run user -- <Name>`.");
      return;
    }
    res.locals.healthUser = user;
    next();
  };
  router.post("/mcp/:user/:sig", userMcpGuard, handleMcpPost);
  router.get("/mcp/:user/:sig", userMcpGuard, (_req, res) => jsonRpcError(res, 405, -32000, "This is the Claude connector address — paste it into claude.ai → Settings → Connectors → Add custom connector. Browsers cannot open it (POST only)."));
  router.delete("/mcp/:user/:sig", userMcpGuard, (_req, res) => jsonRpcError(res, 405, -32000, "This is the Claude connector address — paste it into claude.ai → Settings → Connectors → Add custom connector. Browsers cannot open it (POST only)."));

  // The Claude connector endpoint. With MCP_TOKEN set, the real endpoint
  // lives at /mcp/<token> (claude.ai custom connectors can't send custom
  // headers, so a secret path is the practical way to keep it private).
  const guard = (req: Request, res: Response, next: NextFunction): void => {
    if (!mcpToken) {
      next();
      return;
    }
    const supplied = (typeof req.params.token === "string" ? req.params.token : undefined) ?? providedToken(req);
    if (supplied && tokensMatch(supplied, mcpToken)) {
      next();
      return;
    }
    jsonRpcError(res, 401, -32000, "Unauthorized: connect via /mcp/<MCP_TOKEN>.");
  };

  for (const p of ["/mcp", "/mcp/:token"]) {
    router.post(p, guard, handleMcpPost);
    // Stateless server: no standalone SSE stream, no sessions to delete.
    router.get(p, guard, (_req, res) => jsonRpcError(res, 405, -32000, "This is the Claude connector address — paste it into claude.ai → Settings → Connectors → Add custom connector. Browsers cannot open it (POST only)."));
    router.delete(p, guard, (_req, res) => jsonRpcError(res, 405, -32000, "This is the Claude connector address — paste it into claude.ai → Settings → Connectors → Add custom connector. Browsers cannot open it (POST only)."));
  }
  if (!mcpToken) {
    console.warn("MCP_TOKEN is not set — /mcp is unauthenticated. Set MCP_TOKEN before exposing this server publicly.");
  }

  router.get("/health", (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "../../public/health.html"));
  });
  router.get("/athlytic", (_req: Request, res: Response) => res.redirect("/health"));

  return router;
}
