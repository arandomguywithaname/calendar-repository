import Anthropic from "@anthropic-ai/sdk";
import express, { Request, Response, Router } from "express";

/**
 * Backend for Joseph's Math Studio (public/studio).
 *
 * Two endpoints:
 *   POST /api/studio/generate — turn a plain-English description into project content
 *   POST /api/studio/chat     — the @claude helper in the studio chat drawer
 *
 * Both degrade gracefully: with no ANTHROPIC_API_KEY the studio falls back to
 * its own offline generator in the browser, so nothing in the app breaks.
 */

const MODEL = "claude-opus-5";

const SCHEMAS: Record<string, string> = {
  "3d": `{
  "shape": "cube" | "sphere" | "torus" | "pyramid" | "cylinder" | "prism" | "octahedron",
  "color": "#rrggbb",
  "bg": "#rrggbb",
  "wireframe": boolean,
  "autoSpin": boolean,
  "spinSpeed": number (0-3),
  "motion": "spin" | "bob" | "orbit" | "pulse" | "none",
  "label": "short caption shown on the model"
}`,
  "2d": `{
  "slides": [
    {
      "id": "unique string",
      "bg": "#rrggbb",
      "elements": [
        {
          "id": "unique string",
          "kind": "text",
          "x": number (0-100, percent from left),
          "y": number (0-100, percent from top),
          "w": number (0-100, width in percent),
          "text": "the words on the slide",
          "size": number (font size on a 1000px-wide design, 18-72),
          "color": "#rrggbb",
          "bold": boolean,
          "align": "left" | "center" | "right"
        }
      ]
    }
  ]
}`,
  whiteboard: `{
  "items": [
    { "id": "unique", "kind": "text", "x": number, "y": number, "text": "string", "size": number, "color": "#rrggbb", "bold": boolean },
    { "id": "unique", "kind": "sticker", "x": number, "y": number, "text": "one emoji", "size": number },
    { "id": "unique", "kind": "rect" | "ellipse" | "line" | "arrow", "x": number, "y": number, "w": number, "h": number, "color": "#rrggbb", "width": number, "fill": false }
  ],
  "widgets": [
    { "id": "unique", "kind": "code", "x": number, "y": number, "w": number, "h": number, "lang": "javascript", "text": "source code" },
    { "id": "unique", "kind": "game", "game": "tetris" | "blockoff", "x": number, "y": number, "w": number, "h": number }
  ],
  "camera": { "x": 0, "y": 0, "z": 1 }
}
Whiteboard coordinates are plain pixels on an infinite board; keep everything between 60 and 1100.`,
  animation: `{
  "duration": number (seconds, 3-12),
  "fps": 30,
  "bg": "#rrggbb",
  "layers": [
    {
      "id": "unique",
      "name": "short name",
      "kind": "sticker" | "text",
      "text": "an emoji for stickers, or the words for text",
      "color": "#rrggbb (text layers only)",
      "size": number (sticker 120-220, text 40-90),
      "ease": "smooth" | "snap" | "pop" | "bounce" | "elastic" | "linear",
      "path": "straight" | "curve",
      "effect": "none" | "float" | "spin" | "wiggle" | "pulse" | "sway",
      "trail": boolean,
      "keys": [
        { "t": seconds, "x": 0-100, "y": 0-100, "scale": number, "rot": degrees, "opacity": 0-1, "squash": number (1 = normal, <1 squashed, >1 stretched) }
      ]
    }
  ]
}
Make it move well, not just move:
- Every layer needs at least three keyframes; the first is at t = 0.
- Stagger the layers' entrances by a few tenths of a second instead of starting them all together.
- Match the easing to the motion: "pop" or "snap" for entrances, "bounce" for anything falling, "linear" for orbits, "smooth" for drifting.
- Use "path": "curve" whenever something travels through three or more points.
- Use "squash" on impacts (about 0.8 when it lands, 1.1 just before) — it is what makes a bounce look alive.
- Give a layer an "effect" so it keeps moving after it arrives, and "trail": true for anything fast.`,
};

const SYSTEM = `You build content for a maths teacher's creation studio. The teacher is Joseph; the users are Joseph and his students.

You reply with ONLY a JSON object — no prose, no markdown fences, no explanation. The JSON must match the schema you are given exactly: no extra keys, no missing required keys.

Guidelines:
- Keep the maths correct and age appropriate for a school classroom.
- Prefer clear, short wording over clever wording.
- Use plenty of colour, but keep text readable against its background.
- Everything you produce is edited by hand afterwards, so leave it tidy and easy to change.`;

export function studioRouter(): Router {
  const router = express.Router();

  /** Lets the studio tell the user whether AI is switched on before they type a prompt. */
  router.get("/status", (_req: Request, res: Response) => {
    res.json({ ai: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
  });

  router.post("/generate", async (req: Request, res: Response) => {
    const { type, prompt } = req.body || {};
    const schema = SCHEMAS[type];

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
      const client = new Anthropic();
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `Project type: ${type}\n\nJSON schema to fill in:\n${schema}\n\nWhat the teacher asked for:\n${prompt}`,
          },
        ],
      });

      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      res.json({ content: parseJson(text), source: "claude" });
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
      const client = new Anthropic();
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system:
          "You are the helper inside Joseph's Math Studio, a project studio used by a maths teacher and his students. Answer maths and studio questions briefly and clearly, in a friendly classroom voice. Keep answers under about 120 words unless asked for more.",
        messages: messages
          .filter((m: any) => typeof m?.content === "string" && m.content.trim())
          .slice(-8)
          .map((m: any) => ({
            role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: String(m.content).replace(/^@claude\s*/i, ""),
          })),
      });

      const reply = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();

      res.json({ reply: reply || "I didn't catch that — try asking again." });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Chat failed." });
    }
  });

  return router;
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
