import Anthropic from "@anthropic-ai/sdk";
import { wellFormed } from "./format";
import { getFocus, listDigests } from "./store";
import { PeriodDigest } from "./types";

/**
 * Answering questions about the accumulated digests.
 *
 * The context handed to the model is built from stored summaries, never from
 * raw posts — that is what keeps a conversation about three months of channels
 * affordable. Source references travel with each topic, so the assistant can
 * point at originals without ever having held them.
 */

/**
 * Opus by default. `ANTHROPIC_MODEL` exists because the bill scales with how
 * much someone reads — a person following forty busy channels pays several
 * times what a light reader does for the same feature, and only they can judge
 * whether that is worth it.
 */
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/**
 * Deep enough for a trend question, not just "and before that?". The digests
 * block is cached, so the depth is paid for once per new digest rather than
 * once per question — sixty summaries cost far less to hold than they look.
 */
const DIGEST_WINDOW = 60;

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
implying the deduplication was thorough.

The digests are dated and run in chronological order, and they are deduplicated across each other: a
story appears in the digest where it was first told, later developments appear as "Update:" topics,
and pure repeats are omitted. Questions about tendencies and trends — "what's building up around X?",
"how did Y evolve over the month?" — are therefore fully answerable and welcome: trace a story from
its first telling through its updates, compare periods, name what appeared, what intensified, and
what went quiet. A topic absent from later digests has not necessarily died — repeats are cut on
purpose — so distinguish "no longer mentioned" from "explicitly reversed".

These digests come from a queue: the person's unread backlog is digested oldest-first, one step at a
time, and each step waits for their verdict before the next is built. Three tools drive that queue,
and a fourth (update_focus) records what the person wants their digests to prioritise.
Everything else — any question about what the digests say — is answered as text, never with a tool.
When they close a digest and ask for the next in one breath ("прочитано, дальше"), call both tools.`;

/**
 * The queue's controls, offered to the model instead of a phrase matcher.
 *
 * Whether "давай дальше" means "advance my unread queue" or "tell me more about
 * that story" is a judgement about meaning, and this codebase has twice
 * rejected lexical matching for exactly that kind of call. The tools carry no
 * parameters: the person is known from the conversation, and the queue has
 * exactly one next step and one latest digest.
 */
const TOOLS = [
  {
    name: "next_digest",
    description:
      "Build and deliver the next digest from the person's unread queue. Call this when they ask to " +
      "continue, advance, or clear their unread backlog — «дальше», «следующий дайджест», «продолжай " +
      "разбор», «зачисти очередь», or equivalents in any language. Never call it for a question about " +
      "content that is already in the digests.",
    input_schema: { type: "object" as const, properties: {}, additionalProperties: false },
  },
  {
    name: "channel_digest",
    description:
      "Build and deliver a digest of ONE channel's unread backlog — oldest first, same queue logic, " +
      "scoped to that channel. Call this when the person asks to summarise or read a specific channel " +
      "by name — «обобщи канал X», «что там непрочитанного у X», «прочитай X» — passing the name " +
      "exactly as they said it. Never call it for a question about content already in the digests.",
    input_schema: {
      type: "object" as const,
      properties: {
        channel: {
          type: "string" as const,
          description: "The channel's name or a fragment of it, as the person referred to it.",
        },
      },
      required: ["channel"],
      additionalProperties: false,
    },
  },
  {
    name: "mark_read",
    description:
      "Mark the channels covered by the most recent digest as read in Telegram — the same thing as " +
      "pressing the digest's ✓ button. Call this when the person declares that digest read or done — " +
      "«прочитано», «отметь прочитанным», «это можно закрывать». Never call it merely because they " +
      "asked about the digest.",
    input_schema: { type: "object" as const, properties: {}, additionalProperties: false },
  },
  {
    name: "update_focus",
    description:
      "Rewrite the person's standing editorial brief — what their future digests should prioritise and " +
      "what should be demoted to one-line mentions. Call this when they state a lasting preference: " +
      "«меньше про бенчмарки», «не показывай анонсы моделей», «добавь интерес к ценам на токены». " +
      "Their current brief is shown in the system prompt; pass the COMPLETE new text with their change " +
      "merged in, keeping everything they didn't ask to change, in their language. Never call it for a " +
      "one-off question about the digests — only for preferences meant to persist.",
    input_schema: {
      type: "object" as const,
      properties: {
        focus: {
          type: "string" as const,
          description: "The complete new brief. An empty string clears it entirely.",
        },
      },
      required: ["focus"],
      additionalProperties: false,
    },
  },
];

/**
 * What a free-text message turned out to be.
 *
 * Either an answer to send, or the queue actions the person asked for in
 * words. Both actions can be requested in one message, and the caller performs
 * marking before advancing — that is the order the words mean.
 */
export interface DigestReply {
  text?: string;
  markRead?: boolean;
  advance?: boolean;
  /** A single channel's digest was asked for, by this (possibly partial) name. */
  channelQuery?: string;
  /** The complete new editorial brief; empty string means "clear it". */
  focusUpdate?: string;
}

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
): Promise<DigestReply> {
  const digests = (await listDigests(userId)).slice(0, DIGEST_WINDOW);
  const focus = await getFocus(userId);

  if (digests.length === 0) {
    return {
      text: "I haven't built any digests yet. Send /digest once you've connected an account and I'll start on your unread backlog.",
    };
  }

  // Without a model there is nobody to judge whether a message is a question
  // or a queue command, so words stay words and the buttons stay the controls.
  if (!haveCredentials()) {
    return { text: answerLocally(question, digests) };
  }

  try {
    const response: any = await (anthropic().beta.messages.create as any)({
      model: MODEL,
      // Thinking and text share this cap, and a trend answer needs both.
      max_tokens: 8000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      // The digests belong in the system block, not the final user turn.
      // Caching is a prefix match: here the digests sit ahead of the growing
      // conversation and change only when a new one is built, so a whole
      // afternoon of questions reads them from cache instead of re-paying for
      // them every message. Inside the user turn they would be re-sent at full
      // price on each question, and buried mid-history on the next one.
      system: [
        { type: "text", text: SYSTEM },
        {
          type: "text",
          text: `<digests>\n${wellFormed(renderDigests(digests))}\n</digests>`,
          cache_control: { type: "ephemeral" },
        },
        // After the breakpoint on purpose: the focus changes on a spoken whim,
        // and sitting past the cached digests it can do so without re-billing
        // them. The block is always present so its absence never shifts bytes.
        {
          type: "text",
          text: focus
            ? `The person's standing brief for what their digests prioritise:\n"${wellFormed(focus)}"\nLet it colour your answers too — lead with what they can use.`
            : "The person has not written a standing brief for their digests yet.",
        },
      ],
      // "high", not "medium": trend questions ask the model to hold sixty
      // digests against each other, and the budget must fit a synthesis, not
      // just a lookup.
      output_config: { effort: "high" },
      tools: TOOLS,
      messages: [
        ...history.map((t) => ({ role: t.role, content: t.content })),
        { role: "user", content: question },
      ],
    });

    if (response.stop_reason === "refusal") {
      return { text: "I couldn't answer that one. Try asking a different way." };
    }

    // A tool call is the whole answer: the delivered digest (or the marking
    // report) is what the person sees, and any text the model wrote alongside
    // would just precede it as chatter.
    const calls = response.content.filter((b: any) => b.type === "tool_use");
    const markRead = calls.some((b: any) => b.name === "mark_read");
    const advance = calls.some((b: any) => b.name === "next_digest");
    const channelQuery = String(
      calls.find((b: any) => b.name === "channel_digest")?.input?.channel || ""
    ).trim() || undefined;
    // Presence, not truthiness: an empty string is the "clear my brief" call
    // and must survive to the caller, so undefined alone means "not asked".
    const focusCall = calls.find((b: any) => b.name === "update_focus");
    const focusUpdate = focusCall ? wellFormed(String(focusCall.input?.focus ?? "")).trim() : undefined;
    if (markRead || advance || channelQuery || focusUpdate !== undefined) {
      return { markRead, advance, channelQuery, focusUpdate };
    }

    return { text: response.content.find((b: any) => b.type === "text")?.text || "" };
  } catch (err: any) {
    if (err instanceof Anthropic.AuthenticationError || /authentication method/i.test(err.message)) {
      return { text: answerLocally(question, digests) };
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

const ASKING_FOR_LATEST = /(что нового|what.?s new|дайджест|digest|итог|summar|catch me up)/i;
/**
 * Greetings and "what are you" — not searches, and answering them as searches is
 * absurd. The trailing guard is written out rather than using `\b`, which is
 * ASCII-only and so never fires after a Cyrillic word.
 */
const CHITCHAT =
  /^(hi|hey|hello|yo|sup|thanks|thank you|ok|okay|cool|привет|здравствуй\w*|спасибо|ага)(?![\p{L}\p{N}])|are you (smart|there|ok|alive|real|a bot)|who are you|what (can|do) you do|как дела|ты кто/iu;

function topicList(digests: PeriodDigest[], limit: number): string[] {
  const lines: string[] = [];
  for (const digest of digests) {
    for (const topic of digest.topics) {
      lines.push(`• ${topic.title}`);
      if (lines.length >= limit) return lines;
    }
  }
  return lines;
}

/**
 * Retrieval over the digests, honest about being search.
 *
 * The hard part here is not matching, it is knowing which kind of nothing it is
 * looking at. "I have digests but none mention your word" and "every digest I
 * have is empty" produce the same zero hits and need completely different
 * answers — the first is a real answer, the second means the collection never
 * found anything and no amount of rephrasing will help. Saying "nothing
 * mentions that" to someone whose digests are all empty sends them in circles.
 */
function answerLocally(question: string, digests: PeriodDigest[]): string {
  const latest = digests[0];
  const totalTopics = digests.reduce((sum, d) => sum + d.topics.length, 0);
  const searchMode = "\n\n(No API key set, so I'm searching my digests rather than really reading them. Add ANTHROPIC_API_KEY to .env and restart to change that.)";

  // Every digest empty: the problem is upstream of anything they can ask.
  if (totalTopics === 0) {
    return [
      "I haven't got anything to talk about yet — every digest I've built is empty, so nothing was found in your channels.",
      "",
      "Two things worth trying:",
      "• /channels — check I can actually see the channels you follow",
      "• /digest 72 — re-read the last three days as a second look",
      "",
      "Plain /digest works through your unread backlog oldest-first, so if it keeps coming back with nothing, the place to look is /channels — either I can't see your channels, or the subject filter is skipping all of them.",
    ].join("\n");
  }

  if (CHITCHAT.test(question.trim())) {
    return [
      `I keep digests of the Telegram channels you follow — ${totalTopics} topics across ${digests.length} period(s) right now.`,
      "",
      "Ask me about anything in them, or say “what's new”. /history shows what I'm holding.",
    ].join("") + searchMode;
  }

  if (/^\s*$/.test(question) || ASKING_FOR_LATEST.test(question)) {
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

  // Nothing matched, but there is material — show it rather than stonewalling.
  if (hits.length === 0) {
    const available = topicList(digests, 8);
    return [
      "Nothing in my digests matches that.",
      "",
      "Here's what I do have:",
      ...available,
      available.length < totalTopics ? `…and ${totalTopics - available.length} more — /history for the rest.` : "",
    ]
      .filter(Boolean)
      .join("\n") + searchMode;
  }

  hits.sort((a, b) => b.score - a.score);
  return ["From the digests:", "", ...hits.slice(0, 6).map((h) => h.text)].join("\n");
}
