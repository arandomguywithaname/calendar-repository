import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import express, { Request, Response, Router } from "express";

/**
 * Backend for Joseph's Math Studio (public/studio).
 *
 *   GET  /api/studio/status   — is Claude switched on for this studio?
 *   POST /api/studio/generate — turn a plain-English description into project content
 *   POST /api/studio/chat     — the @claude helper in the studio chat drawer
 *
 * The prompts live in studio-prompts.json at the repo root so that this server
 * and the Netlify function (netlify/functions/studio.mjs) can never drift apart.
 *
 * Everything degrades gracefully: with no ANTHROPIC_API_KEY the studio falls
 * back to its own offline builder in the browser, so nothing in the app breaks.
 */

type Prompts = {
  model: string;
  system: string;
  chatSystem: string;
  schemas: Record<string, string>;
};

const PROMPTS: Prompts = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../studio-prompts.json"), "utf-8")
);

/** Claude Opus 5 can decline a request; when it does, say so plainly. */
const REFUSED = "Claude declined that request. Try describing it a different way.";

export function studioRouter(): Router {
  const router = express.Router();

  /** Lets the studio tell the user whether AI is switched on before they type a prompt. */
  router.get("/status", (_req: Request, res: Response) => {
    res.json({ ai: !!process.env.ANTHROPIC_API_KEY, model: PROMPTS.model });
  });

  router.post("/generate", async (req: Request, res: Response) => {
    const { type, prompt } = req.body || {};
    const schema = PROMPTS.schemas[type];

    if (!schema) {
      res.status(400).json({ error: "Unknown project type." });
      return;
    }
    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "Please describe what you'd like to make." });
      return;
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      res.status(503).json({ error: "No ANTHROPIC_API_KEY on the server." });
      return;
    }

    try {
      const message = await createMessage({
        max_tokens: 16000,
        system: PROMPTS.system,
        messages: [
          {
            role: "user",
            content: `Project type: ${type}\n\nJSON schema to fill in:\n${schema}\n\nWhat the teacher asked for:\n${prompt}`,
          },
        ],
      });

      if (message.stop_reason === "refusal") {
        res.status(422).json({ error: REFUSED });
        return;
      }

      res.json({ content: parseJson(textOf(message)), source: "claude" });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Generation failed." });
    }
  });

  router.post("/chat", async (req: Request, res: Response) => {
    const { messages } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "No messages provided." });
      return;
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      res.status(503).json({ error: "No ANTHROPIC_API_KEY on the server." });
      return;
    }

    try {
      const message = await createMessage({
        max_tokens: 2048,
        system: PROMPTS.chatSystem,
        messages: messages
          .filter((m: any) => typeof m?.content === "string" && m.content.trim())
          .slice(-8)
          .map((m: any) => ({
            role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: String(m.content).replace(/^@claude\s*/i, ""),
          })),
      });

      const reply =
        message.stop_reason === "refusal" ? REFUSED : textOf(message).trim();
      res.json({ reply: reply || "I didn't catch that — try asking again." });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Chat failed." });
    }
  });

  return router;
}

/**
 * One call site for the API. Asks for a server-side fallback so a declined
 * request is retried on another model automatically, and quietly drops that
 * option if this account can't use it rather than failing the whole request.
 */
async function createMessage(params: {
  max_tokens: number;
  system: string;
  messages: Anthropic.MessageParam[];
}): Promise<Anthropic.Message> {
  const client = new Anthropic();
  const base = { model: PROMPTS.model, ...params };

  try {
    return (await (client as any).beta.messages.create({
      ...base,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    })) as Anthropic.Message;
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (!/fallback|beta|unexpected|unknown/i.test(msg)) throw err;
    // this account or SDK build doesn't support the fallback beta — go plain
    return client.messages.create(base);
  }
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/** Claude is asked for bare JSON, but tolerate a stray fence or surrounding prose. */
function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("The model did not return usable JSON.");
  }
}
