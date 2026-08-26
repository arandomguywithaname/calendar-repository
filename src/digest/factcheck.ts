import Anthropic from "@anthropic-ai/sdk";
import { wellFormed } from "./format";
import { getFocus } from "./store";

/**
 * Checking a claim before it spreads, without pretending to be sure.
 *
 * Two honest tools, and no more than they are. For a claim, web search: the
 * model looks for who actually reports it, weighs how much to trust them, and
 * — this is the point — is allowed to come back with "I couldn't corroborate
 * this, are you sure?" rather than an answer. A single confident-sounding page
 * is not proof, and the checker says so.
 *
 * For a URL, a plain fetch and an honest reading of what came back: a dead
 * domain, a 404, a timeout, a bot wall, or a page that loaded. What this
 * deliberately does NOT do is claim more than the tools give. It cannot take a
 * screenshot — there is no browser where this runs — so it says that plainly
 * instead of inventing one, and it cannot see past a bot wall's challenge page,
 * so it reports the wall rather than guessing what was behind it.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const PROBE_TIMEOUT_MS = 8000;

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export function haveCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** The first http(s) URL in a message, if any — so "is x.com/y real?" routes to the prober. */
export function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"')]+/i);
  return m ? m[0] : null;
}

export type ProbeKind = "dead" | "notfound" | "timeout" | "servererror" | "botwall" | "ok";

export interface ProbeResult {
  kind: ProbeKind;
  status?: number;
  host: string;
  /** A little of the page's readable text, when it loaded — for a claim check to lean on. */
  snippet?: string;
}

/** Markers a challenge page leaves in its HTML — a 200 that is really a locked door. */
const BOT_WALL = [
  "just a moment",
  "attention required",
  "cf-browser-verification",
  "checking your browser",
  "enable javascript and cookies",
  "captcha",
  "px-captcha",
  "verifying you are human",
];

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function looksLikeBotWall(body: string): boolean {
  const low = body.slice(0, 4000).toLowerCase();
  return BOT_WALL.some((m) => low.includes(m));
}

/** Strip tags to a rough readable snippet — enough for the model, not a parser. */
function readable(body: string): string {
  return wellFormed(
    body
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  ).slice(0, 1500);
}

/**
 * Fetch a URL and say honestly what happened. `fetchImpl` is injectable so the
 * decision logic can be tested against simulated responses — the live fetch
 * runs where the bot is deployed, with real outbound internet.
 */
export async function probeUrl(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<ProbeResult> {
  const host = hostOf(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (digestify fact-check)" },
    });
    const status = res.status;
    if (status === 404 || status === 410) return { kind: "notfound", status, host };
    if (status >= 500) return { kind: "servererror", status, host };
    let body = "";
    try {
      body = await res.text();
    } catch {
      /* a body we can't read is not fatal to the verdict */
    }
    if (status === 403 || looksLikeBotWall(body)) return { kind: "botwall", status, host };
    return { kind: "ok", status, host, snippet: readable(body) };
  } catch (err: any) {
    if (err?.name === "AbortError") return { kind: "timeout", host };
    return { kind: "dead", host };
  } finally {
    clearTimeout(timer);
  }
}

// Human, varied lines per outcome — so the same failure never reads identically
// twice. Picked at random; the model handles the claim itself.
const LINES: Record<Exclude<ProbeKind, "ok">, string[]> = {
  dead: [
    "I couldn't reach <b>{host}</b> at all. Check there isn't a typo in it, or that the site is still live.",
    "That address, <b>{host}</b>, didn't answer. It might be misspelled, or the site could be down or gone.",
    "No luck reaching <b>{host}</b> — worth checking the spelling, or whether the site still exists.",
  ],
  notfound: [
    "<b>{host}</b> is there, but that exact page came back as “not found” (404). The link may be old or mistyped.",
    "The site loaded, but that page is missing on <b>{host}</b> — a 404. Double-check the rest of the link.",
    "I reached <b>{host}</b>, yet that page isn't there (404). Maybe it moved or the link has a typo.",
  ],
  timeout: [
    "<b>{host}</b> took too long to answer. That's usually a slow or dropped connection, or the site being down right now.",
    "I waited, but <b>{host}</b> never responded in time — likely your connection, or the site struggling.",
    "That one timed out on <b>{host}</b>. Could be the internet here, or the site being slow — worth a retry.",
  ],
  servererror: [
    "<b>{host}</b> answered, but with an error on its side (a 5xx). Nothing to do but try again later — that's the site's problem, not yours.",
    "The site <b>{host}</b> is having trouble — it returned a server error. Give it a while and try again.",
    "I got through to <b>{host}</b>, but it threw a server error back. That's on their end; a later try may work.",
  ],
  botwall: [
    "I reached <b>{host}</b>, but it put up a “prove you're human” check (a bot wall), so I can't read past it. I genuinely can't see what's on the other side.",
    "<b>{host}</b> is guarded by a bot checker — it blocks readers like me at the door, so I can't tell you what the page says.",
    "That site, <b>{host}</b>, uses an anti-bot screen. It stopped me before the content, so I can't confirm anything from it.",
  ],
};

/** One human line for a non-ok probe. Screenshots are honestly not offered. */
export function probeMessage(result: ProbeResult): string {
  if (result.kind === "ok") return "";
  const pick = LINES[result.kind][Math.floor(Math.random() * LINES[result.kind].length)];
  return pick.replace("{host}", result.host);
}

const FACTCHECK_SYSTEM = `You are a careful fact-checker for one person, using web search. Someone has given you a claim —
possibly something they saw forwarded or posted — and your job is to find out whether it holds up, and to
be honest about how sure you can be.

Search before you answer. Look for who actually reports this, and weigh them: an established outlet, a
primary source, or several independent reports mean far more than one unknown site or a single viral post.

Then say what you found, plainly, in the person's own language, in a few sentences:
- If solid, independent sources confirm it, say so and name them — but stay humble: you are a simple
  checker, so add that anything important is worth confirming at the source.
- If you find nothing, do NOT invent a verdict. Say you looked and couldn't find sources for it, and ask
  whether they're sure — invite them to send a link if they have one.
- If only a weak or single questionable source asserts it, say exactly that: one place claims it, but you
  are not convinced it's true, and they should double-check. A confident-sounding page is not proof.
- If credible sources contradict it, say so and give what they actually say.

Never be a threat about it and never lecture. You are helping a person not get fooled. Vary how you word
things naturally — never a canned template. If a website's readable text is provided below, use it as one
input among your searches, not as the last word: a single page saying something does not make it true.`;

/**
 * Check a claim, optionally anchored to a page the person sent.
 *
 * When they include a URL, the page is probed first and reported honestly; if
 * it loaded, its text is handed to the checker as *one* input, never as proof.
 * The verdict itself always comes from search across sources.
 */
export async function factCheck(userId: string, input: string): Promise<string> {
  if (!haveCredentials()) {
    return "I can't fact-check without a model configured (ANTHROPIC_API_KEY).";
  }

  const claim = wellFormed(input).trim();
  if (!claim) return "Send me the claim you want checked — the sentence you're unsure about.";

  let pageNote = "";
  let pageText = "";
  const url = extractUrl(claim);
  if (url) {
    const probe = await probeUrl(url);
    if (probe.kind !== "ok") {
      // The page is the whole request when it won't load — report it, honestly,
      // and stop rather than pretending to have checked its contents.
      return probeMessage(probe);
    }
    pageNote = `\n\nThey pointed at ${probe.host}, which loaded.`;
    if (probe.snippet) pageText = `\n\nReadable text from that page (one input, not proof):\n"${probe.snippet}"`;
  }

  const focus = await getFocus(userId);
  const messages: any[] = [
    {
      role: "user",
      content: `Claim to check: ${claim}\n\nToday is ${new Date().toISOString().slice(0, 10)}. Is this true? Search, weigh your sources, and be honest about how sure you can be.${pageNote}${pageText}${
        focus ? `\n\n(For context, this person reads for: "${wellFormed(focus)}".)` : ""
      }`,
    },
  ];

  let response: any;
  for (let attempt = 0; ; attempt++) {
    response = await (anthropic().beta.messages.create as any)({
      model: MODEL,
      max_tokens: 3000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: FACTCHECK_SYSTEM,
      output_config: { effort: "medium" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
      messages,
    });
    if (response.stop_reason !== "pause_turn" || attempt >= 3) break;
    messages.push({ role: "assistant", content: response.content });
  }

  if (response.stop_reason === "refusal") {
    return "I couldn't check that one. Try wording it differently.";
  }

  const text = response.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();
  return text || "I searched but couldn't find enough to say either way. Are you sure about it? Send a link if you have one and I'll look.";
}
