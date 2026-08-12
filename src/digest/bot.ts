import { cancelLogin, listChannels, startLogin, completeLogin, loginPending } from "./collector";
import { answerFromDigests } from "./converse";
import { chunk, escapeHtml, renderDigest } from "./format";
import { runDigest } from "./pipeline";
import {
  appendChat,
  clearAccount,
  clearChat,
  getAccount,
  getChat,
  latestDigest,
  listDigests,
  setAccount,
} from "./store";

/**
 * The bot — the only interface.
 *
 * It talks to two different Telegram APIs and the distinction matters. The Bot
 * API (this file) is how the conversation happens. MTProto (the collector) is
 * how the channels get read, because a bot cannot see a channel it does not
 * administer. So the bot is the front door, and each person signs in behind it
 * once with their own account.
 *
 * Long-polling rather than webhooks: a half-finished login holds a live MTProto
 * connection in memory between two messages, which needs one long-lived process
 * and rules out a serverless function.
 */

const API = "https://api.telegram.org";

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set — create a bot with @BotFather and set it.");
  return token;
}

async function call(method: string, body: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${API}/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(`${method}: ${data.description || response.status}`);
  return data.result;
}

/** Markup out, readable text back — for the retry when Telegram rejects our HTML. */
function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function send(chatId: number | string, text: string): Promise<void> {
  for (const part of chunk(text)) {
    try {
      await call("sendMessage", {
        chat_id: chatId,
        text: part,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    } catch (err: any) {
      // Malformed markup should cost the formatting, not the message.
      if (!/parse entities|parse_mode|entity/i.test(err?.message || "")) throw err;
      await call("sendMessage", {
        chat_id: chatId,
        text: stripHtml(part),
        link_preview_options: { is_disabled: true },
      });
    }
  }
}

async function typing(chatId: number | string): Promise<void> {
  await call("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
}

/**
 * Remove a message carrying a secret from the chat.
 *
 * A login code and, worse, a two-step password would otherwise sit in the
 * person's history indefinitely. Telegram does not always let a bot delete an
 * incoming message, so this is an attempt rather than a guarantee — the caller
 * tells them to delete it themselves if it fails.
 */
async function scrub(chatId: number | string, messageId?: number): Promise<boolean> {
  if (!messageId) return false;
  try {
    await call("deleteMessage", { chat_id: chatId, message_id: messageId });
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------ conversation ------------------------------ */

type Stage =
  | { name: "idle" }
  | { name: "awaiting_phone"; apiId: number; apiHash: string }
  | { name: "awaiting_code"; apiId: number; apiHash: string; phone: string };

/**
 * In-process, like the half-open MTProto connection it shadows. Losing it on a
 * restart costs an unfinished login and nothing else — the account, once
 * connected, lives in the store.
 */
const stages = new Map<string, Stage>();
/** One operation per person at a time; /digest can take a while. */
const busy = new Set<string>();

function stageOf(userId: string): Stage {
  return stages.get(userId) || { name: "idle" };
}

function credentials(): { apiId: number; apiHash: string } | null {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  if (!apiId || !apiHash) return null;
  return { apiId, apiHash };
}

const HELP = `I read the Telegram channels you follow and keep a digest of them, grouped by topic. Ask me about it in plain language — "what happened today?", "anything about the rate decision?", "what did I miss this week?"

/connect — sign in so I can read your channels
/digest — read the new posts now and summarise them
/last — the most recent digest
/history — the digests I'm holding
/channels — the channels I can see
/forget — delete my copy of your session
/reset — forget our conversation, keep the digests`;

/* -------------------------------- commands -------------------------------- */

async function onConnect(userId: string, chatId: number, args: string[]): Promise<void> {
  const existing = await getAccount(userId);
  if (existing) {
    await send(
      chatId,
      "You're already connected. /digest reads what's new; /forget removes my copy of your session if you want to start over."
    );
    return;
  }

  // Credentials come from the environment normally; two arguments are the escape
  // hatch for someone running the bot without setting them.
  const env = credentials();
  const apiId = args[0] ? Number(args[0]) : env?.apiId;
  const apiHash = args[1] || env?.apiHash;

  if (!apiId || !apiHash) {
    await send(
      chatId,
      "I need Telegram API credentials before I can sign you in. Get them at https://my.telegram.org → API development tools, then either set TELEGRAM_API_ID and TELEGRAM_API_HASH where I'm running, or send:\n\n<code>/connect 123456 your_api_hash</code>"
    );
    return;
  }

  stages.set(userId, { name: "awaiting_phone", apiId, apiHash });
  await send(
    chatId,
    "Send me the phone number of your Telegram account, with the country code — like <code>+441234567890</code>.\n\nThis signs in as you, which is the only way to read channels you merely follow. /cancel stops."
  );
}

async function onPhone(userId: string, chatId: number, stage: Stage & { name: "awaiting_phone" }, text: string) {
  const phone = text.replace(/[^\d+]/g, "");
  if (!/^\+?\d{7,15}$/.test(phone)) {
    await send(chatId, "That doesn't look like a phone number. Try again with the country code, or /cancel.");
    return;
  }

  await typing(chatId);
  try {
    await startLogin(userId, stage.apiId, stage.apiHash, phone.startsWith("+") ? phone : `+${phone}`);
  } catch (err: any) {
    stages.set(userId, { name: "idle" });
    await send(chatId, `Telegram refused that: ${escapeHtml(err?.errorMessage || err?.message || String(err))}\n\n/connect to try again.`);
    return;
  }

  stages.set(userId, { name: "awaiting_code", apiId: stage.apiId, apiHash: stage.apiHash, phone });
  await send(
    chatId,
    "Telegram has sent you a code. Send it back to me <b>with dashes between the digits</b> — like <code>1-2-3-4-5</code>.\n\nThe dashes matter: Telegram cancels any login code it sees posted in a chat, and a spaced-out code slips past that check. If you have two-step verification, add your password after the code: <code>1-2-3-4-5 mypassword</code> — I delete that message as soon as I've read it."
  );
}

async function onCode(
  userId: string,
  chatId: number,
  stage: Stage & { name: "awaiting_code" },
  text: string,
  messageId?: number
) {
  const [first, ...rest] = text.trim().split(/\s+/);
  const code = first.replace(/\D/g, "");
  const password = rest.join(" ") || undefined;

  if (code.length < 4) {
    await send(chatId, "I need the login code — digits only, dashes are fine. /cancel to stop.");
    return;
  }

  // Before anything else: that message holds a code, and possibly a password.
  const scrubbed = await scrub(chatId, messageId);

  await typing(chatId);
  let session: string;
  try {
    session = await completeLogin(userId, code, password);
  } catch (err: any) {
    const message = err?.errorMessage || err?.message || String(err);
    // Two-step verification asks for a second factor; the login is still open,
    // so the stage stays put and they can answer without starting over.
    if (/two-step/i.test(message)) {
      await send(chatId, escapeHtml(message));
      return;
    }
    if (/PHONE_CODE_INVALID/i.test(message)) {
      await send(chatId, "That code was wrong. Send it again, or /connect to request a new one.");
      return;
    }
    stages.set(userId, { name: "idle" });
    await cancelLogin(userId);
    await send(chatId, `Sign-in failed: ${escapeHtml(message)}\n\n/connect to try again.`);
    return;
  }

  await setAccount(userId, {
    apiId: stage.apiId,
    apiHash: stage.apiHash,
    session,
    phone: stage.phone,
  });
  stages.set(userId, { name: "idle" });

  const warning =
    !scrubbed && password
      ? "\n\nI couldn't delete the message with your password in it — please remove it from this chat yourself."
      : "";
  await send(chatId, `Signed in. Reading the last day of your channels now — this takes a minute.${warning}`);
  await onDigest(userId, chatId, []);
}

async function onDigest(userId: string, chatId: number, args: string[]): Promise<void> {
  const account = await getAccount(userId);
  if (!account) {
    await send(chatId, "Not connected yet — /connect first.");
    return;
  }

  const hours = args[0] ? Math.min(72, Math.max(1, Number(args[0]) || 0)) : undefined;
  await typing(chatId);

  try {
    const { digest, empty } = await runDigest(userId, hours ? { hours } : {});
    if (empty) {
      await send(chatId, "Nothing new since I last looked. Ask me about anything I've already read.");
      return;
    }
    await send(chatId, renderDigest(digest));
  } catch (err: any) {
    const message = err?.errorMessage || err?.message || String(err);
    if (/AUTH_KEY|SESSION_REVOKED|USER_DEACTIVATED/i.test(message)) {
      await clearAccount(userId);
      await send(chatId, "Telegram invalidated my session — that happens if you end the session from your account's device list. /connect to sign in again.");
      return;
    }
    await send(chatId, `Couldn't build a digest: ${escapeHtml(message)}`);
  }
}

async function onChannels(userId: string, chatId: number): Promise<void> {
  const account = await getAccount(userId);
  if (!account) {
    await send(chatId, "Not connected yet — /connect first.");
    return;
  }

  await typing(chatId);
  try {
    const channels = await listChannels(account);
    if (channels.length === 0) {
      await send(chatId, "I can't see any channels on this account. Groups and personal chats aren't included — only channels you follow.");
      return;
    }
    const lines = channels.map((c) => `• ${escapeHtml(c.title)}${c.username ? ` (@${escapeHtml(c.username)})` : ""}`);
    await send(chatId, [`<b>${channels.length} channels</b>`, "", ...lines].join("\n"));
  } catch (err: any) {
    await send(chatId, `Couldn't list channels: ${escapeHtml(err?.message || String(err))}`);
  }
}

async function onHistory(userId: string, chatId: number): Promise<void> {
  const digests = await listDigests(userId);
  if (digests.length === 0) {
    await send(chatId, "No digests yet. /digest builds the first one.");
    return;
  }
  const lines = digests
    .slice(0, 20)
    .map((d) => `• ${d.from.slice(0, 16).replace("T", " ")} — ${d.topics.length} topics, ${d.postCount} posts`);
  await send(
    chatId,
    [`<b>${digests.length} digests</b>`, "", ...lines, "", "Ask about any of it in plain language."].join("\n")
  );
}

/* ------------------------------- dispatching ------------------------------ */

async function handleText(
  userId: string,
  chatId: number,
  text: string,
  messageId?: number
): Promise<void> {
  const trimmed = text.trim();
  const isCommand = trimmed.startsWith("/");
  // Group mentions arrive as /digest@thebot.
  const [rawCommand, ...args] = trimmed.split(/\s+/);
  const command = isCommand ? rawCommand.split("@")[0].toLowerCase() : "";

  if (command === "/cancel") {
    stages.set(userId, { name: "idle" });
    await cancelLogin(userId);
    await send(chatId, "Stopped.");
    return;
  }

  const stage = stageOf(userId);
  if (!isCommand && stage.name === "awaiting_phone") return onPhone(userId, chatId, stage, trimmed);
  if (!isCommand && stage.name === "awaiting_code") return onCode(userId, chatId, stage, trimmed, messageId);

  switch (command) {
    case "/start":
    case "/help":
      await send(chatId, HELP);
      return;
    case "/connect":
      return onConnect(userId, chatId, args);
    case "/digest":
      return onDigest(userId, chatId, args);
    case "/channels":
      return onChannels(userId, chatId);
    case "/history":
      return onHistory(userId, chatId);
    case "/last": {
      const digest = await latestDigest(userId);
      await send(chatId, digest ? renderDigest(digest) : "No digests yet — /digest builds the first one.");
      return;
    }
    case "/reset":
      await clearChat(userId);
      await send(chatId, "Conversation forgotten. The digests are still here.");
      return;
    case "/forget":
      await clearAccount(userId);
      stages.set(userId, { name: "idle" });
      await cancelLogin(userId);
      await send(chatId, "Session deleted. Your digests remain — /forget doesn't touch them. /connect to sign in again.");
      return;
  }

  if (isCommand) {
    await send(chatId, "I don't know that one. /help lists what I do.");
    return;
  }

  if (loginPending(userId)) {
    await send(chatId, "I'm still waiting on your login code — send it with dashes, or /cancel.");
    return;
  }

  await typing(chatId);
  const history = await getChat(userId);
  const answer = await answerFromDigests(userId, trimmed, history);
  await appendChat(userId, [
    { role: "user", content: trimmed },
    { role: "assistant", content: answer },
  ]);
  await send(chatId, escapeHtml(answer));
}

/** Exported so a webhook deployment — or a test — can feed updates in directly. */
export async function handleUpdate(update: any): Promise<void> {
  // Only fresh messages: re-running a command because someone fixed a typo in it
  // would surprise them, and `allowed_updates` below doesn't request edits anyway.
  const message = update.message;
  const text: string | undefined = message?.text;
  if (!text || !message.chat) return;

  const chatId = message.chat.id;
  const userId = String(message.from?.id ?? chatId);

  if (busy.has(userId)) {
    await send(chatId, "Still working on the last one — one moment.").catch(() => {});
    return;
  }

  busy.add(userId);
  try {
    await handleText(userId, chatId, text, message.message_id);
  } catch (err: any) {
    console.error(`update failed for ${userId}:`, err);
    await send(chatId, `Something broke: ${escapeHtml(err?.message || String(err))}`).catch(() => {});
  } finally {
    busy.delete(userId);
  }
}

/* --------------------------------- polling -------------------------------- */

let running = false;

export async function startBot(): Promise<void> {
  const me = await call("getMe", {});
  console.log(`Bot @${me.username} listening.`);

  await call("setMyCommands", {
    commands: [
      { command: "connect", description: "sign in so I can read your channels" },
      { command: "digest", description: "read what's new and summarise it" },
      { command: "last", description: "the most recent digest" },
      { command: "history", description: "digests I'm holding" },
      { command: "channels", description: "channels I can see" },
      { command: "reset", description: "forget our conversation" },
      { command: "forget", description: "delete my copy of your session" },
    ],
  }).catch(() => {});

  running = true;
  let offset = 0;
  let backoff = 1000;

  while (running) {
    try {
      const updates: any[] = await call("getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: ["message"],
      });
      backoff = 1000;

      for (const update of updates) {
        offset = update.update_id + 1;
        // Not awaited: a long /digest must not stall everyone else's messages.
        void handleUpdate(update);
      }
    } catch (err: any) {
      const message = err?.message || String(err);
      if (/409/.test(message)) {
        console.error("Another poller is holding this bot token — stopping.");
        return;
      }
      console.error(`getUpdates failed (${message}); retrying in ${backoff}ms`);
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 60_000);
    }
  }
}

export function stopBot(): void {
  running = false;
}
