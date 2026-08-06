/**
 * Joseph's Math Studio — the AI backend for a Netlify deploy.
 *
 * Serves the same three routes as the Express server in src/studio.ts:
 *   GET  /api/studio/status
 *   POST /api/studio/generate
 *   POST /api/studio/chat
 *
 * This talks to the Anthropic API over plain fetch on purpose. A Netlify
 * drag-and-drop deploy never runs `npm install`, so a function with any
 * dependency would not work; keeping it dependency-free is what lets the
 * studio be published by dropping a folder onto Netlify. The Express server
 * uses the official SDK.
 *
 * Set ANTHROPIC_API_KEY in Site settings → Environment variables to switch
 * Claude on. Without it the studio uses its offline builder and says so.
 */

import { readFileSync } from "node:fs";

const API = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
const REFUSED = "Claude declined that request. Try describing it a different way.";

/**
 * The prompts live in one file, studio-prompts.json at the top of the repo.
 * The build copies it next to this function for the deploy; running the
 * function straight out of the repo finds the original two folders up. Keeping
 * a second copy checked in here is what let the two drift apart before.
 */
const PROMPTS = (() => {
  const tries = ["./studio-prompts.json", "../../studio-prompts.json"];
  for (const rel of tries) {
    try {
      return JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf-8"));
    } catch {
      /* try the next place */
    }
  }
  throw new Error("studio-prompts.json not found next to the function or at the repo root");
})();

export default async (req) => {
  const route = new URL(req.url).pathname.split("/").filter(Boolean).pop();

  if (route === "status") {
    return json({ ai: !!process.env.ANTHROPIC_API_KEY, model: PROMPTS.model });
  }

  if (req.method !== "POST") return json({ error: "Not found." }, 404);
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: "No ANTHROPIC_API_KEY set for this site." }, 503);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request body." }, 400);
  }

  if (route === "generate") return generate(body);
  if (route === "chat") return chat(body);
  return json({ error: "Not found." }, 404);
};

async function generate({ type, prompt }) {
  const schema = PROMPTS.schemas[type];
  if (!schema) return json({ error: "Unknown project type." }, 400);
  if (!prompt || typeof prompt !== "string") {
    return json({ error: "Please describe what you'd like to make." }, 400);
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

    if (message.stop_reason === "refusal") return json({ error: REFUSED }, 422);
    return json({ content: parseJson(textOf(message)), source: "claude" });
  } catch (err) {
    return json({ error: err?.message || "Generation failed." }, 500);
  }
}

async function chat({ messages }) {
  if (!Array.isArray(messages) || !messages.length) {
    return json({ error: "No messages provided." }, 400);
  }

  try {
    const message = await createMessage({
      max_tokens: 2048,
      system: PROMPTS.chatSystem,
      messages: messages
        .filter((m) => typeof m?.content === "string" && m.content.trim())
        .slice(-8)
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content).replace(/^@claude\s*/i, ""),
        })),
    });

    const reply = message.stop_reason === "refusal" ? REFUSED : textOf(message).trim();
    return json({ reply: reply || "I didn't catch that — try asking again." });
  } catch (err) {
    return json({ error: err?.message || "Chat failed." }, 500);
  }
}

/**
 * Asks for a server-side fallback so a declined request is retried on another
 * model automatically; if this account can't use that beta, retry plainly
 * rather than failing the whole request.
 */
async function createMessage(params) {
  const base = { model: PROMPTS.model, ...params };

  const send = (payload, betas) =>
    fetch(`${API}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        ...(betas ? { "anthropic-beta": betas } : {}),
      },
      body: JSON.stringify(payload),
    });

  let res = await send({ ...base, fallbacks: "default" }, "server-side-fallback-2026-07-01");

  if (res.status === 400) {
    const detail = await res.text();
    if (/fallback|beta/i.test(detail)) res = await send(base);
    else throw new Error(errorFrom(detail));
  }

  if (!res.ok) throw new Error(errorFrom(await res.text()));
  return res.json();
}

function errorFrom(text) {
  try {
    return JSON.parse(text)?.error?.message || text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

const textOf = (message) =>
  (message.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

/** Claude is asked for bare JSON, but tolerate a stray fence or surrounding prose. */
function parseJson(text) {
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

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
