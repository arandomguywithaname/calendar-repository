import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import { wellFormed } from "./format";
import { getDigest, getFocus, isSuspended, listDigests, setFocus, userForMcpToken } from "./store";
import { PeriodDigest } from "./types";

/**
 * The digests, served to the person's own Claude.
 *
 * claude.ai can attach a "custom connector" — a remote MCP server it calls
 * over streamable HTTP — and from then on any conversation there can pull
 * these digests in and read them with everything that Claude knows about its
 * person. This module is that server: three read-only tools over the store,
 * plus one narrow write — the person's editorial brief, so "stop showing me
 * model announcements" said to their own Claude persists into the bot's
 * summariser. Nothing else writes: no collection is triggered and nothing can
 * be marked read — the queue's controls stay in Telegram, where their
 * confirmations live.
 *
 * Authentication is the URL. A custom connector carries no header of ours and
 * we have no OAuth server, so the per-user token rides in the path —
 * /mcp/<token> — the way webhook URLs work. The same token is honoured as a
 * `Authorization: Bearer` header on bare /mcp for clients that can send one
 * (Claude Code, the Messages API MCP connector).
 *
 * Every request builds a fresh server and transport and tears them down when
 * the response closes: the statelessness is what lets claude.ai reconnect
 * whenever it likes without a session table on our side.
 */

const MCP_PATH = "/mcp";

/** Render one digest fully — what get_digest returns. */
function renderFull(digest: PeriodDigest): string {
  const when = `${digest.from.slice(0, 16).replace("T", " ")} — ${digest.to.slice(0, 16).replace("T", " ")}`;
  const flag = digest.degraded ? " [grouped without a model — related stories may not be merged]" : "";
  const topics = digest.topics.length
    ? digest.topics
        .map((t) => {
          const sources = [...new Set(t.sources.map((s) => s.channelTitle))].join(", ");
          const links = t.sources.map((s) => s.link).filter(Boolean).slice(0, 5).join(" ");
          const points = t.points.length ? `\n  - ${t.points.join("\n  - ")}` : "";
          return `• ${t.title} — ${t.summary}${points}\n  sources: ${sources || "none recorded"}${links ? `\n  links: ${links}` : ""}`;
        })
        .join("\n\n")
    : "(no topics — nothing new was found in this window)";
  return wellFormed(
    `# ${when}${flag}\nid: ${digest.id}\n${digest.postCount} posts across ${digest.channelCount} channel(s)\n\n${digest.headline}\n\n${topics}`
  );
}

/** One line per digest — what list_digests returns. */
function renderLine(digest: PeriodDigest): string {
  const when = `${digest.from.slice(0, 10)} → ${digest.to.slice(0, 10)}`;
  const titles = digest.topics.map((t) => t.title).slice(0, 8).join("; ");
  return wellFormed(
    `${when} · id: ${digest.id} · ${digest.topics.length} topic(s)${digest.degraded ? " [no-model]" : ""}\n  ${titles || "(empty)"}`
  );
}

function text(body: string) {
  return { content: [{ type: "text" as const, text: body }] };
}

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * One MCP server, bound to one person's digests.
 *
 * Built per request rather than shared, because the userId is baked into the
 * tool closures — the token decides whose digests exist at all, and no tool
 * takes a userId parameter that could be pointed at someone else.
 */
function buildServer(userId: string): McpServer {
  const server = new McpServer({ name: "telegram-digests", version: "1.0.0" });

  server.registerTool(
    "list_digests",
    {
      title: "List digests",
      description:
        "List this person's Telegram channel digests, newest first: period dates, digest id, and topic " +
        "titles. Digests are built from the person's unread backlog oldest-first and deduplicated against " +
        "each other — a story appears where it was first told, and later developments appear as 'Update:' " +
        "topics. Use get_digest with an id for the full text.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional()
          .describe("How many digests to list. Default 30, newest first."),
      },
    },
    async ({ limit }) => {
      const digests = (await listDigests(userId)).slice(0, limit ?? 30);
      if (digests.length === 0) return text("No digests yet — none have been built for this account.");
      return text(digests.map(renderLine).join("\n"));
    }
  );

  server.registerTool(
    "get_digest",
    {
      title: "Read one digest",
      description:
        "Fetch the full text of one digest by id (ids come from list_digests or search_digests): headline, " +
        "every topic with its summary, points, source channels and t.me links.",
      inputSchema: {
        id: z.string().describe("The digest id, exactly as list_digests reported it."),
      },
    },
    async ({ id }) => {
      const digest = await getDigest(id);
      // The ownership check matters more than the existence check: a guessed or
      // leaked id from another account must be indistinguishable from a missing one.
      if (!digest || digest.userId !== userId) {
        return text(`No digest with id "${id}". Use list_digests to see the valid ids.`);
      }
      return text(renderFull(digest));
    }
  );

  server.registerTool(
    "search_digests",
    {
      title: "Search digests",
      description:
        "Keyword search across every stored digest's topics. Returns matching topics with their digest date " +
        "and id, best matches first. Word-overlap only — it will not catch paraphrases, so for a thorough " +
        "answer on a broad theme prefer reading the digests via list_digests + get_digest.",
      inputSchema: {
        query: z.string().describe("Words to look for, in any language the channels use."),
      },
    },
    async ({ query }) => {
      const terms = words(query);
      if (terms.length === 0) return text("The query had no searchable words in it.");
      const digests = await listDigests(userId);
      const hits: { score: number; line: string }[] = [];
      for (const digest of digests) {
        for (const topic of digest.topics) {
          const hay = words(`${topic.title} ${topic.summary} ${topic.points.join(" ")}`);
          let score = 0;
          for (const term of terms) if (hay.some((w) => w.startsWith(term) || term.startsWith(w))) score += 1;
          if (score === 0) continue;
          const sources = [...new Set(topic.sources.map((s) => s.channelTitle))].slice(0, 3).join(", ");
          hits.push({
            score,
            line: wellFormed(
              `${digest.from.slice(0, 10)} · ${topic.title} — ${topic.summary}${sources ? ` (${sources})` : ""}\n  digest id: ${digest.id}`
            ),
          });
        }
      }
      if (hits.length === 0) return text(`Nothing in the digests matches "${query}".`);
      hits.sort((a, b) => b.score - a.score);
      return text(hits.slice(0, 20).map((h) => h.line).join("\n\n"));
    }
  );

  server.registerTool(
    "get_focus",
    {
      title: "Read the standing brief",
      description:
        "Read the person's standing editorial brief — the free-text preference that tells the digest " +
        "summariser what to prioritise and what to shrink to one-line mentions. Read it before calling " +
        "update_focus, so a change merges into what is already there instead of overwriting it.",
      inputSchema: {},
    },
    async () => {
      const focus = await getFocus(userId);
      return text(focus ? `Current brief:\n"${wellFormed(focus)}"` : "No brief is set — digests cover everything their subjects allow.");
    }
  );

  server.registerTool(
    "update_focus",
    {
      title: "Update the standing brief",
      description:
        "Replace the person's standing editorial brief. Call this only when they state a lasting " +
        "preference about their digests — 'stop showing me model announcements', 'add interest in token " +
        "pricing' — never for a one-off question. Read the current brief with get_focus first and pass " +
        "the COMPLETE merged text in the person's own language; an empty string clears the brief. The " +
        "change applies from the next digest the bot builds.",
      inputSchema: {
        focus: z.string().describe("The complete new brief, or an empty string to clear it."),
      },
    },
    async ({ focus }) => {
      const cleaned = wellFormed(focus).trim();
      await setFocus(userId, cleaned);
      return text(
        cleaned
          ? `Brief updated. Future digests will read for:\n"${cleaned}"`
          : "Brief cleared — future digests cover everything their subjects allow."
      );
    }
  );

  return server;
}

function jsonRpcError(res: express.Response, status: number, code: number, message: string): void {
  res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });
}

async function handleMcpPost(req: express.Request, res: express.Response, token: string): Promise<void> {
  const userId = await userForMcpToken(token);
  if (!userId) {
    jsonRpcError(res, 401, -32001, "Unknown token. Send /mcp to the Telegram bot to get your connector URL.");
    return;
  }
  // The token stays valid but answers nothing while suspended: same switch,
  // same instant restore, as the bot side.
  if (await isSuspended(userId)) {
    jsonRpcError(res, 403, -32002, "This account's subscription is inactive — the connector is paused. Contact the person who runs the bot.");
    return;
  }

  const server = buildServer(userId);
  // No session id: every request stands alone, which is what lets this run
  // with no session table and survive restarts mid-conversation.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err: any) {
    console.error("MCP request failed:", err?.message || err);
    if (!res.headersSent) jsonRpcError(res, 500, -32603, "Internal error.");
  }
}

/**
 * Start the HTTP listener beside the bot.
 *
 * Failure to bind is a warning, not a crash: on a desktop where the port is
 * taken, the bot's real job — Telegram — must go on without the connector.
 */
export function startMcpServer(): void {
  const port = Number(process.env.PORT || 8080);
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Fly's health checks and anyone poking the root get a plain answer.
  app.get("/", (_req, res) => {
    res.type("text/plain").send("telereader: digest MCP endpoint at POST /mcp/<token>");
  });

  app.post(`${MCP_PATH}/:token`, (req, res) => {
    void handleMcpPost(req, res, req.params.token);
  });
  app.post(MCP_PATH, (req, res) => {
    const auth = String(req.headers.authorization || "");
    void handleMcpPost(req, res, auth.replace(/^Bearer\s+/i, "").trim());
  });

  // Stateless server: there is no stream to resume and no session to delete.
  const reject = (_req: express.Request, res: express.Response) => {
    jsonRpcError(res, 405, -32000, "Method not allowed — this server is stateless; POST only.");
  };
  app.get([`${MCP_PATH}/:token`, MCP_PATH], reject);
  app.delete([`${MCP_PATH}/:token`, MCP_PATH], reject);

  app
    .listen(port, () => {
      console.log(`MCP connector listening on :${port}`);
    })
    .on("error", (err: any) => {
      console.warn(`MCP connector not started (${err?.message || err}) — the bot runs on without it.`);
    });
}

/** The URL a person pastes into claude.ai, built from where this is running. */
export function mcpUrl(token: string): string {
  const base =
    process.env.MCP_PUBLIC_URL ||
    (process.env.FLY_APP_NAME ? `https://${process.env.FLY_APP_NAME}.fly.dev` : `http://localhost:${process.env.PORT || 8080}`);
  return `${base.replace(/\/+$/, "")}${MCP_PATH}/${token}`;
}
