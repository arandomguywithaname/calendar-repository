import Anthropic from "@anthropic-ai/sdk";
import { wellFormed } from "./format";
import { getChat, getFocus, getOverrides, listDigests, setFocus } from "./store";

/**
 * Auto mode: working out what someone reads for, from how they use the bot.
 *
 * Be clear about the evidence, because it decides how good this can be. There
 * is no per-topic rating anywhere — nobody clicks a thumb — so the signals are
 * indirect: which digests they marked read rather than left unread, what they
 * ask the bot about afterwards, and which channels they overruled the filter
 * on. Questions are the strongest of the three by a distance: asking "what
 * happened with the rate decision" is a person telling you what they care
 * about, in their own words, unprompted.
 *
 * What it produces is an ordinary focus brief — the same free text /focus
 * writes — so nothing downstream needs to know a mode exists, and the person
 * can read it, disagree, and edit it by hand without leaving auto mode.
 *
 * It is deliberately not silent. A bot that reshapes what it shows you without
 * saying so is one you cannot correct, so every refresh is announced.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** How many closed digests between refreshes. Learning at the pace of reading. */
export const LEARN_EVERY = 3;
/** Enough recent history to see a pattern, not so much that old interests dominate. */
const DIGESTS_CONSIDERED = 8;

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

function haveCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const SYSTEM = `You maintain one line of standing instructions for a personal news digest — a brief saying what its
reader wants covered in full and what should shrink to a passing mention.

You are given evidence of how they actually use it: the topics of digests they marked read (they worked
through those), the topics of digests they left unread (weaker evidence — they may simply not have got to
them), what they asked the bot about afterwards, and any channels they overruled the filter on. Questions
are the strongest evidence by far: a person asking a follow-up has told you what they care about, in their
own words, without being asked.

Write the brief as one short paragraph addressed to the digest writer, in the language the person uses.
Name the subjects worth full topics and the kinds of item that should shrink to one line. Be concrete —
"pricing and availability of models, not benchmark scores" beats "AI news". Never invent an interest the
evidence does not support: if the evidence is thin, keep the existing brief and change only what the new
evidence justifies. Some of the brief may have been written by the person themselves — preserve anything
they clearly asked for even if this round's evidence does not mention it.

Return the brief and nothing else: no preamble, no explanation, no quotation marks.`;

/** The questions they asked, which is the strongest evidence of interest we hold. */
function questionsFrom(chat: { role: string; content: string }[]): string[] {
  return chat
    .filter((turn) => turn.role === "user")
    .map((turn) => wellFormed(turn.content).trim())
    // The queue's own vocabulary is procedure, not interest: "дальше" says
    // nothing about what the person reads for.
    .filter((text) => text.length > 12 && !/^\/|^(дальше|прочитано|next|read)\b/i.test(text))
    .slice(-12);
}

function topicLines(titles: string[], limit: number): string {
  return titles.slice(0, limit).map((t) => `- ${t}`).join("\n") || "(none)";
}

/**
 * Look at the evidence and rewrite the brief. Returns the new text when it
 * changed, `null` when there was nothing to learn from or nothing to change.
 *
 * Never throws: a failed refresh must cost a log line, not the digest that
 * triggered it.
 */
export async function learnFocus(userId: string): Promise<string | null> {
  if (!haveCredentials()) return null;

  try {
    const [digests, chat, overrides, current] = await Promise.all([
      listDigests(userId),
      getChat(userId),
      getOverrides(userId),
      getFocus(userId),
    ]);

    const recent = digests.slice(0, DIGESTS_CONSIDERED);
    const engaged: string[] = [];
    const ignored: string[] = [];
    for (const digest of recent) {
      const titles = digest.topics.map((t) => t.title);
      (digest.readMarkedAt ? engaged : ignored).push(...titles);
    }
    const questions = questionsFrom(chat);

    // Nothing to go on: no digests worked through and nothing asked. Silence
    // beats inventing a personality for someone.
    if (engaged.length === 0 && questions.length === 0) return null;

    const evidence = [
      `Topics in digests they marked read:\n${topicLines(engaged, 40)}`,
      `Topics in digests they left unread:\n${topicLines(ignored, 20)}`,
      `Questions they asked the bot:\n${questions.map((q) => `- ${q}`).join("\n") || "(none)"}`,
      `Channels they forced in or out: ${
        Object.entries(overrides)
          .map(([id, choice]) => `${id}:${choice}`)
          .slice(0, 20)
          .join(", ") || "(none)"
      }`,
      `The brief in force now:\n${current || "(none yet)"}`,
    ].join("\n\n");

    const response: any = await (anthropic().beta.messages.create as any)({
      model: MODEL,
      max_tokens: 1000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: wellFormed(evidence) }],
    });

    if (response.stop_reason === "refusal") return null;
    const text = wellFormed(response.content.find((b: any) => b.type === "text")?.text || "").trim();
    if (!text || text === current) return null;

    await setFocus(userId, text);
    return text;
  } catch (err: any) {
    console.warn(`auto-focus refresh failed for ${userId}: ${err?.message || err}`);
    return null;
  }
}
