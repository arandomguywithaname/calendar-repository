import {
  bufferedChats,
  bufferedMessages,
  getTelegramOffset,
  recordMessages,
  setTelegramOffset,
} from "../store";
import { Chat, Connector, Message } from "../types";
import { demoChats, demoMessages } from "./demo";

/**
 * Telegram via the Bot API.
 *
 * The Bot API only delivers what a bot can see: chats and groups the bot has
 * been added to, and channels where it is an admin. It cannot read your
 * personal DM history — that needs an MTProto user client (Telethon/TDLib),
 * which is a different auth model and out of scope here. Add the bot to the
 * groups and channels you want summarised, then call `poll()`.
 */

const API = "https://api.telegram.org";

interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramMessage {
  message_id: number;
  date: number;
  text?: string;
  caption?: string;
  chat: TelegramChat;
  from?: { first_name?: string; last_name?: string; username?: string };
  sender_chat?: TelegramChat;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
}

function token(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN;
}

function chatTitle(chat: TelegramChat): string {
  if (chat.title) return chat.title;
  const name = [chat.first_name, chat.last_name].filter(Boolean).join(" ");
  return name || chat.username || `Chat ${chat.id}`;
}

function chatKind(chat: TelegramChat): Chat["kind"] {
  if (chat.type === "private") return "dm";
  if (chat.type === "channel") return "channel";
  return "group";
}

function senderName(message: TelegramMessage): string {
  if (message.from) {
    const name = [message.from.first_name, message.from.last_name].filter(Boolean).join(" ");
    return name || message.from.username || "Unknown";
  }
  if (message.sender_chat) return chatTitle(message.sender_chat);
  return "Unknown";
}

/** Drain pending updates into the local store. Safe to call repeatedly. */
export async function poll(): Promise<number> {
  const botToken = token();
  if (!botToken) return 0;

  const offset = getTelegramOffset();
  const url = `${API}/bot${botToken}/getUpdates?timeout=0&limit=100${offset ? `&offset=${offset}` : ""}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Telegram getUpdates failed: ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as { ok: boolean; result?: TelegramUpdate[]; description?: string };
  if (!body.ok) throw new Error(`Telegram getUpdates failed: ${body.description}`);

  const updates = body.result || [];
  const chats: Chat[] = [];
  const messages: Message[] = [];
  let highest = offset;

  for (const update of updates) {
    highest = Math.max(highest, update.update_id + 1);
    const payload = update.message || update.channel_post || update.edited_message;
    const text = payload?.text || payload?.caption;
    if (!payload || !text) continue;

    const chatId = String(payload.chat.id);
    const timestamp = new Date(payload.date * 1000).toISOString();

    chats.push({
      id: chatId,
      app: "telegram",
      title: chatTitle(payload.chat),
      kind: chatKind(payload.chat),
      unreadCount: 1,
      lastActivity: timestamp,
    });

    messages.push({
      id: `telegram:${chatId}:${payload.message_id}`,
      app: "telegram",
      chatId,
      chatTitle: chatTitle(payload.chat),
      sender: senderName(payload),
      text,
      timestamp,
      unread: true,
    });
  }

  if (messages.length > 0 || highest !== offset) {
    recordMessages("telegram", chats, messages);
    setTelegramOffset(highest);
  }
  return messages.length;
}

export const telegramConnector: Connector = {
  app: "telegram",
  label: "Telegram",

  isLive: () => Boolean(token()),

  status: () =>
    token()
      ? "Live via the Telegram Bot API. The bot only sees chats it has been added to (and channels where it is an admin) — personal DMs need an MTProto user client."
      : "Demo data. Set TELEGRAM_BOT_TOKEN to read real chats.",

  async listChats(): Promise<Chat[]> {
    if (!token()) return demoChats("telegram");
    await poll();
    return bufferedChats("telegram");
  },

  async fetchMessages(chatIds: string[], limit: number): Promise<Message[]> {
    if (!token()) return filter(demoMessages("telegram"), chatIds, limit);
    await poll();
    return filter(bufferedMessages("telegram"), chatIds, limit);
  },
};

function filter(messages: Message[], chatIds: string[], limit: number): Message[] {
  const wanted = new Set(chatIds);
  const scoped = wanted.size > 0 ? messages.filter((m) => wanted.has(m.chatId)) : messages;
  return scoped.slice(-limit);
}
