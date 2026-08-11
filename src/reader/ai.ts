import Anthropic from "@anthropic-ai/sdk";
import { AskTurn, Digest, Message } from "./types";

const MODEL = "claude-opus-5";

// Claude Opus 5's safety classifiers can decline a request; `fallbacks: "default"`
// lets the API re-run it on Anthropic's recommended fallback model server-side
// instead of handing back a refusal.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

const DIGEST_SCHEMA = {
  type: "object",
  properties: {
    headline: {
      type: "string",
      description: "One sentence on the state of the inbox right now.",
    },
    needsYouNow: {
      type: "array",
      description: "Things that need the user personally, most urgent first. Empty if nothing does.",
      items: { type: "string" },
    },
    chats: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string", description: "The chat key exactly as given in the transcript." },
          app: { type: "string" },
          title: { type: "string" },
          summary: { type: "string", description: "What happened in this chat, in one to three sentences." },
          urgency: { type: "string", enum: ["high", "normal", "low"] },
          actionItems: { type: "array", items: { type: "string" } },
        },
        required: ["key", "app", "title", "summary", "urgency", "actionItems"],
        additionalProperties: false,
      },
    },
  },
  required: ["headline", "needsYouNow", "chats"],
  additionalProperties: false,
} as const;

const DIGEST_SYSTEM = `You summarise a person's messaging inbox across apps like Telegram, WhatsApp and Slack.

You are given a transcript of recent messages, grouped by chat. Each chat has a key of the form "<app>:<chat id>" — reuse those keys verbatim.

Write for someone who has been away and wants to know what they missed:
- Lead with what changed or what is being asked of them, not with who said what.
- Mark a chat "high" urgency only when it needs the user specifically, or has a deadline in the next day or so. Group banter, bots, and promotional channels are "low".
- Put something in needsYouNow only if the user has to do or decide something. A chat that is merely interesting does not belong there.
- Action items are concrete and start with a verb. If there are none, return an empty list.
- Cover every chat present in the transcript, once each.
- Never invent messages, names, or deadlines that are not in the transcript.`;

const ASK_SYSTEM = `You are the assistant inside a messaging reader. The user's recent messages across their connected apps are given to you in an <inbox> block on each turn.

The user types the way people actually type — casual, run-on, with typos, half-questions and requests buried in filler ("hey uhhh can you give me a summary of my unread chats pls?", "anything from lena today or nah", "what did i miss in the incidents channel while I was out"). Work out what they are actually asking and answer that. Don't ask them to rephrase, and don't lecture them about phrasing.

Answering:
- Use only what is in the <inbox> block. If the answer isn't there, say so plainly and say what you would need — a different app selected, a wider time range, that connector configured.
- Quote or name senders and chats when it helps the user locate the message.
- Match the length to the question: a one-line question gets a one-line answer, "what did I miss" gets a short structured rundown.
- Times in the transcript are ISO timestamps; talk about them the way a person would ("about an hour ago", "this morning").
- Plain prose and short lists. No headers or tables unless the user asks for a rundown that genuinely needs them.
- You read messages, you don't send them. If asked to reply to someone, say that and offer to draft the text instead.`;

/** Group messages by chat so the model sees conversations, not a flat feed. */
export function renderTranscript(messages: Message[]): string {
  if (messages.length === 0) return "(no messages in the current selection)";

  const byChat = new Map<string, Message[]>();
  for (const message of messages) {
    const key = `${message.app}:${message.chatId}`;
    const bucket = byChat.get(key) || [];
    bucket.push(message);
    byChat.set(key, bucket);
  }

  const sections: string[] = [];
  for (const [key, chatMessages] of byChat) {
    const { chatTitle, app } = chatMessages[0];
    const unread = chatMessages.filter((m) => m.unread).length;
    const lines = chatMessages.map(
      (m) => `  [${m.timestamp}]${m.unread ? " (unread)" : ""} ${m.sender}: ${m.text}`
    );
    sections.push(
      `chat key: ${key}\napp: ${app}\ntitle: ${chatTitle}\nunread in this chat: ${unread}\n${lines.join("\n")}`
    );
  }
  return sections.join("\n\n");
}

interface MessageResult {
  text: string;
  refused: boolean;
}

async function createMessage(params: Record<string, unknown>): Promise<MessageResult> {
  let response: any;
  try {
    // The SDK's typings lag the beta `fallbacks` parameter, so the params
    // object is assembled here and passed through.
    response = await (anthropic().beta.messages.create as any)({
      model: MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      ...params,
    });
  } catch (err: any) {
    if (err instanceof Anthropic.AuthenticationError || /authentication method/i.test(err.message)) {
      throw new Error(
        "No Claude API credentials found. Set ANTHROPIC_API_KEY in your .env to turn on summaries and questions."
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new Error("Claude is rate limited right now — try again in a moment.");
    }
    throw err;
  }

  if (response.stop_reason === "refusal") {
    return { text: "", refused: true };
  }

  const textBlock = response.content.find((block: any) => block.type === "text");
  return { text: textBlock?.text ?? "", refused: false };
}

function createDemoDigest(messages: Message[]): Digest {
  if (messages.length === 0) {
    return {
      headline: "Nothing new in the sources you've selected.",
      needsYouNow: [],
      chats: [],
    };
  }

  const byChat = new Map<string, Message[]>();
  for (const msg of messages) {
    const key = `${msg.app}:${msg.chatId}`;
    if (!byChat.has(key)) byChat.set(key, []);
    byChat.get(key)!.push(msg);
  }

  const chats: Array<{ key: string; app: string; title: string; summary: string; urgency: "high" | "normal" | "low"; actionItems: string[] }> = Array.from(byChat.entries()).map(([key, msgs]) => {
    const [app, chatId] = key.split(":");
    const title = msgs[0]?.chatTitle || chatId;
    const msgCount = msgs.length;
    const hasQuestion = msgs.some((m) => m.text.includes("?"));

    const urgency: "high" | "normal" | "low" = msgCount > 5 ? "high" : msgCount > 2 ? "normal" : "low";

    return {
      key,
      app,
      title,
      summary: `${msgCount} message${msgCount !== 1 ? "s" : ""} in this chat. ${hasQuestion ? "Includes questions." : ""}`,
      urgency,
      actionItems: hasQuestion ? ["Review questions from group"] : [],
    };
  });

  return {
    headline: `${messages.length} new messages across ${new Set(messages.map((m) => m.app)).size} apps.`,
    needsYouNow: [],
    chats,
  };
}

/** The dashboard's main-page summary. */
export async function buildDigest(messages: Message[], now: Date): Promise<Digest> {
  if (messages.length === 0) {
    return {
      headline: "Nothing new in the sources you've selected.",
      needsYouNow: [],
      chats: [],
    };
  }

  try {
    const { text, refused } = await createMessage({
      system: DIGEST_SYSTEM,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: DIGEST_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: `The current time is ${now.toISOString()}.\n\nHere is the transcript:\n\n${renderTranscript(
            messages
          )}`,
        },
      ],
    });

    if (refused) throw new Error("The model declined to summarise this content.");
    return JSON.parse(text) as Digest;
  } catch (err: any) {
    if (err instanceof Anthropic.AuthenticationError || /authentication method/i.test(err.message)) {
      return createDemoDigest(messages);
    }
    throw err;
  }
}

/** The ask-the-AI box. Free-form questions about the same message set. */
export async function askAboutInbox(
  question: string,
  messages: Message[],
  history: AskTurn[],
  now: Date
): Promise<string> {
  const turns = history.map((turn) => ({ role: turn.role, content: turn.content }));

  try {
    const { text, refused } = await createMessage({
      system: ASK_SYSTEM,
      output_config: { effort: "medium" },
      messages: [
        ...turns,
        {
          role: "user",
          content: `<inbox time="${now.toISOString()}">\n${renderTranscript(messages)}\n</inbox>\n\n${question}`,
        },
      ],
    });

    if (refused) return "I wasn't able to answer that one. Try asking a different way.";
    return text;
  } catch (err: any) {
    if (err instanceof Anthropic.AuthenticationError || /authentication method/i.test(err.message)) {
      const mentionedIn = messages.filter((m) => m.text.toLowerCase().includes(question.toLowerCase())).length;
      if (mentionedIn > 0) {
        return `I found ${mentionedIn} message${mentionedIn !== 1 ? "s" : ""} mentioning that in your chats. Set ANTHROPIC_API_KEY for AI-powered answers.`;
      }
      return "I couldn't find that in your messages. Set ANTHROPIC_API_KEY for AI-powered analysis.";
    }
    throw err;
  }
}
