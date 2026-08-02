/* ===========================================================
   ai.js — "Make it with AI" client.
   Tries the server (/api/studio/generate, which uses Claude).
   If the server is unreachable or has no API key, it falls back
   to a local generator so the studio still works offline.
   =========================================================== */

import { defaultContent } from "./store.js";

/** Cached answer to "is Claude switched on for this studio?" */
let aiStatus = null;

export async function checkAI() {
  if (aiStatus !== null) return aiStatus;
  try {
    const res = await fetch("/api/studio/status");
    aiStatus = res.ok ? !!(await res.json()).ai : false;
  } catch {
    aiStatus = false;
  }
  return aiStatus;
}

export async function generate(type, prompt) {
  if (!(await checkAI())) return { content: localGenerate(type, prompt), source: "offline" };
  try {
    const res = await fetch("/api/studio/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, prompt }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.content) return { content: data.content, source: data.source || "claude" };
    }
  } catch {
    /* offline — fall through to the local generator */
  }
  return { content: localGenerate(type, prompt), source: "offline" };
}

export async function chatReply(messages) {
  if (!(await checkAI())) return OFFLINE_REPLY;
  try {
    const res = await fetch("/api/studio/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.reply) return data.reply;
    }
  } catch {
    /* ignore */
  }
  return OFFLINE_REPLY;
}

const OFFLINE_REPLY =
  "I'm in offline mode right now (no ANTHROPIC_API_KEY on the server), so I can't think properly — but the studio itself works fine. Add the key to .env and restart to switch me on.";

/* ===========================================================
   Local (offline) generation — keyword driven, deterministic.
   =========================================================== */

const PALETTE = ["#6ea8fe", "#a78bfa", "#4ade80", "#fbbf24", "#f87171", "#38bdf8", "#fb923c"];

function pickColor(prompt) {
  const named = {
    red: "#f87171", blue: "#6ea8fe", green: "#4ade80", yellow: "#fbbf24",
    purple: "#a78bfa", orange: "#fb923c", pink: "#f472b6", white: "#e8eef7", cyan: "#38bdf8",
  };
  const p = prompt.toLowerCase();
  for (const k in named) if (p.includes(k)) return named[k];
  return PALETTE[Math.abs(hash(prompt)) % PALETTE.length];
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function titleOf(prompt) {
  const clean = prompt.replace(/^(make|create|build|draw|show|do|a|an|the)\s+/gi, "").trim();
  const t = clean.split(/[.!?\n]/)[0].slice(0, 60) || "New project";
  return t[0].toUpperCase() + t.slice(1);
}

function sentences(prompt) {
  return prompt
    .split(/[.\n;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

export function localGenerate(type, prompt) {
  const c = defaultContent(type);
  const color = pickColor(prompt);
  const p = prompt.toLowerCase();
  const title = titleOf(prompt);

  if (type === "3d") {
    const shapes = ["cube", "sphere", "torus", "pyramid", "cylinder", "prism", "octahedron"];
    let shape = shapes.find((s) => p.includes(s)) || null;
    if (!shape) {
      if (p.includes("ball") || p.includes("planet") || p.includes("circle")) shape = "sphere";
      else if (p.includes("donut") || p.includes("ring")) shape = "torus";
      else if (p.includes("pyramid") || p.includes("triangle")) shape = "pyramid";
      else if (p.includes("can") || p.includes("tube")) shape = "cylinder";
      else shape = "cube";
    }
    let motion = "spin";
    if (p.includes("bounce") || p.includes("bob")) motion = "bob";
    if (p.includes("orbit")) motion = "orbit";
    if (p.includes("pulse") || p.includes("grow")) motion = "pulse";
    if (p.includes("still") || p.includes("no anim")) motion = "none";
    return { ...c, shape, color, motion, autoSpin: motion !== "none", label: title };
  }

  if (type === "2d") {
    const lines = sentences(prompt);
    const bullets = lines.length > 1 ? lines.slice(1) : defaultBullets(p);
    const slides = [
      makeSlide("t", [
        text("Title", title, 8, 30, 84, 56, "#0f172a", true, "center"),
        text("Sub", "Made in Joseph's Math Studio", 8, 56, 84, 22, "#64748b", false, "center"),
      ], "#ffffff"),
    ];
    chunk(bullets, 3).forEach((group, i) => {
      slides.push(
        makeSlide("s" + i, [
          text("h", group[0].slice(0, 60), 7, 10, 86, 40, "#0f172a", true, "left"),
          ...group.slice(1).map((b, j) =>
            text("b" + j, "•  " + b, 9, 34 + j * 13, 84, 24, "#334155", false, "left")
          ),
        ], "#ffffff")
      );
    });
    slides.push(
      makeSlide("end", [
        text("q", "Your turn — try one!", 8, 40, 84, 46, "#0f172a", true, "center"),
      ], "#f1f5f9")
    );
    return { slides };
  }

  if (type === "whiteboard") {
    const lines = sentences(prompt).slice(0, 6);
    const items = [
      { id: id(), kind: "text", x: 90, y: 70, text: title, size: 42, color: "#e8eef7", bold: true },
      // box sized to the title so long headings don't spill out of it
      { id: id(), kind: "rect", x: 78, y: 46, w: Math.max(340, title.length * 24 + 40), h: 74, color, fill: false, width: 3 },
    ];
    lines.forEach((l, i) => {
      items.push({ id: id(), kind: "text", x: 100, y: 190 + i * 58, text: "• " + l.slice(0, 70), size: 24, color: "#cbd5e1" });
    });
    items.push({ id: id(), kind: "sticker", x: 700, y: 150, text: "📐", size: 74 });
    items.push({ id: id(), kind: "sticker", x: 800, y: 260, text: "✏️", size: 64 });
    const widgets = [];
    if (p.includes("tetris")) widgets.push({ id: id(), kind: "game", game: "tetris", x: 760, y: 380, w: 260, h: 420 });
    if (p.includes("blockoff") || p.includes("breakout") || p.includes("brick"))
      widgets.push({ id: id(), kind: "game", game: "blockoff", x: 120, y: 470, w: 420, h: 320 });
    if (p.includes("code") || p.includes("python") || p.includes("javascript"))
      widgets.push({ id: id(), kind: "code", x: 120, y: 470, w: 420, h: 240, lang: "javascript",
        text: "// " + title + "\nfor (let n = 1; n <= 10; n++) {\n  console.log(n, n * n);\n}" });
    return { items, widgets, camera: { x: 0, y: 0, z: 1 } };
  }

  if (type === "animation") {
    const d = 6;
    const emojiPool = matchEmoji(p);
    const wantsFly = /(fly|across|travel|move|race|zoom|launch)/.test(p);
    const wantsBounce = /(bounce|drop|fall|jump)/.test(p);
    const wantsSpin = /(spin|turn|rotate|orbit|round)/.test(p);

    const layers = emojiPool.map((e, i) => {
      const y = 46 + (i - (emojiPool.length - 1) / 2) * 20;
      const start = i * 0.35;                       // stagger the entrances
      if (wantsFly) {
        return {
          id: id(), kind: "sticker", name: e + " flying", text: e, size: 170,
          ease: "smooth", path: "curve", effect: "float", trail: true,
          keys: [
            { t: start, x: -16, y: y + 8, scale: 0.8, rot: -10, opacity: 1 },
            { t: start + (d - start) * 0.45, x: 48, y: y - 12, scale: 1.25, rot: 4, opacity: 1 },
            { t: d, x: 118, y, scale: 0.9, rot: 12, opacity: 1 },
          ],
        };
      }
      if (wantsBounce) {
        return {
          id: id(), kind: "sticker", name: e + " bouncing", text: e, size: 170, ease: "bounce",
          keys: [
            { t: start, x: 30 + i * 20, y: 12, scale: 1, rot: 0, opacity: 1, squash: 1.12 },
            { t: start + 1.4, x: 30 + i * 20, y: 74, scale: 1, rot: 0, opacity: 1, squash: 0.8 },
            { t: start + 1.7, x: 30 + i * 20, y: 70, scale: 1, rot: 0, opacity: 1, squash: 1.05 },
            { t: start + 3.2, x: 30 + i * 20, y: 38, scale: 1, rot: 0, opacity: 1 },
            { t: d, x: 30 + i * 20, y: 72, scale: 1, rot: 0, opacity: 1, squash: 0.9 },
          ],
        };
      }
      if (wantsSpin) {
        return {
          id: id(), kind: "sticker", name: e + " orbiting", text: e, size: 160,
          ease: "linear", path: "curve", effect: "spin",
          keys: [
            { t: 0, x: 50 + 24, y: 52, scale: 1, rot: 0, opacity: 1 },
            { t: d * 0.25, x: 50, y: 52 - 24, scale: 1.1, rot: 90, opacity: 1 },
            { t: d * 0.5, x: 50 - 24, y: 52, scale: 1, rot: 180, opacity: 1 },
            { t: d * 0.75, x: 50, y: 52 + 24, scale: 0.9, rot: 270, opacity: 1 },
            { t: d, x: 50 + 24, y: 52, scale: 1, rot: 360, opacity: 1 },
          ],
        };
      }
      // default: a lively pop-in that keeps moving afterwards
      return {
        id: id(), kind: "sticker", name: e + " sticker", text: e, size: 170,
        ease: "pop", effect: i % 2 ? "float" : "sway",
        keys: [
          { t: start, x: 34 + i * 26, y, scale: 0.2, rot: -14, opacity: 0 },
          { t: start + 0.7, x: 34 + i * 26, y, scale: 1, rot: 0, opacity: 1 },
          { t: d, x: 34 + i * 26, y, scale: 1, rot: 0, opacity: 1 },
        ],
      };
    });

    layers.unshift({
      id: id(), kind: "text", name: "Title", text: title, color: "#ffffff", size: 62, ease: "pop",
      keys: [
        { t: 0, x: 50, y: 16, scale: 0.5, rot: -6, opacity: 0 },
        { t: 0.8, x: 50, y: 16, scale: 1, rot: 0, opacity: 1 },
        { t: d, x: 50, y: 16, scale: 1, rot: 0, opacity: 1 },
      ],
    });

    return { duration: d, fps: 30, bg: pickBg(p), layers };
  }

  return c;
}

function pickBg(p) {
  if (/space|planet|rocket|star|moon/.test(p)) return "#05060f";
  if (p.includes("white") || p.includes("clean")) return "#f8fafc";
  return "#0b1220";
}

/* One word, one thing. Asking for a rocket should get you a rocket — not a
   rocket plus whatever else happened to share its theme. */
const EMOJI_WORDS = [
  [/\brockets?\b|\blaunch(es|ing)?\b|\bspaceships?\b/, "🚀"],
  [/\bplanets?\b|\bsaturn\b|\bjupiter\b|\borbits?\b|\bsolar system\b/, "🪐"],
  [/\bstars?\b/, "⭐"],
  [/\bmoons?\b/, "🌙"],
  [/\bsuns?\b|\bsunny\b/, "☀️"],
  [/\btriangles?\b/, "🔺"],
  [/\bcircles?\b/, "⭕"],
  [/\bsquares?\b/, "🟦"],
  [/\bangles?\b|\bprotractors?\b|\bgeometry\b/, "📐"],
  [/\brulers?\b|\bmeasur(e|ing)\b|\blength\b/, "📏"],
  [/\bpizzas?\b|\bfractions?\b|\bslices?\b/, "🍕"],
  [/\bmoney\b|\bcoins?\b|\bprices?\b|\bcost(s)?\b/, "💰"],
  [/\bpercent(age)?s?\b|\binterest\b|\bgrowth\b/, "📈"],
  [/\bgraphs?\b|\bcharts?\b|\bdata\b/, "📊"],
  [/\bdice\b|\bprobability\b|\bchance\b|\brandom\b/, "🎲"],
  [/\btargets?\b|\bgoals?\b/, "🎯"],
  [/\bclocks?\b|\btimers?\b|\bseconds?\b|\bminutes?\b/, "⏱️"],
  [/\bballs?\b|\bbounc(e|es|ing|y)\b/, "⚽"],
  [/\bcars?\b/, "🚗"],
  [/\bturtles?\b/, "🐢"],
  [/\bapples?\b/, "🍎"],
  [/\bcakes?\b/, "🍰"],
  [/\bballoons?\b/, "🎈"],
  [/\bbooks?\b|\breading\b/, "📚"],
  [/\bnumbers?\b|\bcounting\b|\bdigits?\b/, "🔢"],
  [/\bideas?\b|\bthinking\b/, "💡"],
];

function matchEmoji(p) {
  const found = [];
  for (const [re, emoji] of EMOJI_WORDS) {
    if (re.test(p) && !found.includes(emoji)) found.push(emoji);
  }
  // only fall back to something generic when the prompt named nothing at all
  return found.length ? found.slice(0, 3) : ["✨"];
}

function defaultBullets(p) {
  if (p.includes("fraction")) return ["What a fraction is", "Numerator and denominator", "Adding fractions", "Practice time"];
  if (p.includes("pythag")) return ["a² + b² = c²", "Only for right triangles", "Find the missing side", "Practice time"];
  return ["Key idea", "Worked example", "Common mistake", "Practice time"];
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out.length ? out : [["Key idea"]];
}

function makeSlide(sid, elements, bg) {
  return { id: "s" + sid + Math.random().toString(36).slice(2, 5), bg, elements };
}
function text(k, t, x, y, w, size, color, bold, align) {
  return { id: "e" + k + Math.random().toString(36).slice(2, 5), kind: "text", x, y, w, text: t, size, color, bold: !!bold, align: align || "left" };
}
function id() {
  return "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
