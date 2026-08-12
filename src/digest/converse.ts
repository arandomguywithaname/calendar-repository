import Anthropic from "@anthropic-ai/sdk";
import { listDigests } from "./store";
import { PeriodDigest } from "./types";

/**
 * Answering questions about the accumulated digests.
 *
 * The context handed to the model is built from stored summaries, never from
 * raw posts — that is what keeps a conversation about three months of channels
 * affordable. Source references travel with each topic, so the assistant can
 * point at originals without ever having held them.
 */

const MODEL = "claude-opus-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** Enough history for "and before that?" without unbounded growth. */
const DIGEST_WINDOW = 30;

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

function haveCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const SYSTEM = `You are the person's reader for the Telegram channels they follow. You have their digests —
already summarised and deduplicated by period — not the original posts.

Answer from the digests in front of you and nothing else. If they do not cover something, say so plainly
instead of guessing; "that isn't in the digests I have" is a complete answer. Reply in the language the
person writes in, conversationally, without headings or bullet scaffolding unless they ask for a list.

When a topic matters, name its channels so they can go to the source. Where a digest is marked as
grouped without a model, say that stories phrased differently may not have been merged, rather than
implying the deduplication was thorough.`;

function renderDigests(digests: PeriodDigest[]): string {
  return digests
    .map((d) => {
      const when = `${d.from.slice(0, 16).replace("T", " ")} — ${d.to.slice(0, 16).replace("T", " ")}`;
      const flag = d.degraded ? " [grouped without a model]" : "";
      const topics = d.topics
        .map((t) => {
          const sources = [...new Set(t.sources.map((s) => s.channelTitle))].join(", ");
          const points = t.points.length ? `\n    - ${t.points.join("\n    - ")}` : "";
          return `  • ${t.title} — ${t.summary}${points}\n    sources: ${sources || "none recorded"}`;
        })
        .join("\n");
      return `### ${when}${flag}\n${d.headline}\n${topics}`;
    })
    .join("\n\n");
}

export async function answerFromDigests(
  userId: string,
  question: string,
  history: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  const digests = (await listDigests(userId)).slice(0, DIGEST_WINDOW);

  if (digests.length === 0) {
    return "I haven't built any digests yet. Send /digest once you've connected an account and I'll read the last day of your channels.";
  }

  if (!haveCredentials()) {
    return answerLocally(question, digests);
  }

  try {
    const response: any = await (anthropic().beta.messages.create as any)({
      model: MODEL,
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "medium" },
      messages: [
        ...history.map((t) => ({ role: t.role, content: t.content })),
        {
          role: "user",
          content: `<digests>\n${renderDigests(digests)}\n</digests>\n\n${question}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return "I couldn't answer that one. Try asking a different way.";
    }
    return response.content.find((b: any) => b.type === "text")?.text || "";
  } catch (err: any) {
    if (err instanceof Anthropic.AuthenticationError || /authentication method/i.test(err.message)) {
      return answerLocally(question, digests);
    }
    throw err;
  }
}

/* ------------------------------ no-model path ----------------------------- */

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

/** Retrieval over the digests, quoting what it finds. Honest about being search. */
function answerLocally(question: string, digests: PeriodDigest[]): string {
  const latest = digests[0];

  if (/^\s*$/.test(question) || /(что нового|what.?s new|дайджест|digest|итог|summar)/i.test(question)) {
    const lines = [latest.headline, ""];
    for (const topic of latest.topics.slice(0, 8)) {
      const sources = [...new Set(topic.sources.map((s) => s.channelTitle))].slice(0, 3).join(", ");
      lines.push(`• ${topic.title} — ${topic.summary}${sources ? ` (${sources})` : ""}`);
    }
    return lines.join("\n");
  }

  const terms = words(question);
  const hits: { score: number; text: string }[] = [];

  for (const digest of digests) {
    for (const topic of digest.topics) {
      const hay = words(`${topic.title} ${topic.summary} ${topic.points.join(" ")}`);
      let score = 0;
      for (const term of terms) if (hay.some((w) => w.startsWith(term) || term.startsWith(w))) score += 1;
      if (score === 0) continue;
      const sources = [...new Set(topic.sources.map((s) => s.channelTitle))].slice(0, 3).join(", ");
      hits.push({
        score,
        text: `• ${digest.from.slice(0, 10)} — ${topic.title}: ${topic.summary}${sources ? ` (${sources})` : ""}`,
      });
    }
  }

  if (hits.length === 0) {
    return "Nothing in the digests I have mentions that. Ask about something else, or say “what's new” for the latest period.";
  }

  hits.sort((a, b) => b.score - a.score);
  return ["From the digests:", "", ...hits.slice(0, 6).map((h) => h.text)].join("\n");
}
