import { Chat, Connector, Message } from "../types";
import { demoChats, demoMessages } from "./demo";

/**
 * Slack via the Web API.
 *
 * A bot token (xoxb-) sees the conversations the app has been invited to. A
 * user token (xoxp-) additionally exposes `last_read`, which is what lets the
 * reader tell read from unread — with a bot token everything in the fetch
 * window is treated as unread.
 *
 * Scopes: channels:read, groups:read, im:read, channels:history,
 * groups:history, im:history, users:read.
 */

const API = "https://slack.com/api";
const userNames = new Map<string, string>();

function token(): string | undefined {
  return process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN;
}

async function slack<T>(method: string, params: Record<string, string> = {}): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${API}/${method}${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  const body = (await response.json()) as { ok: boolean; error?: string } & T;
  if (!body.ok) throw new Error(`Slack ${method} failed: ${body.error}`);
  return body;
}

interface SlackConversation {
  id: string;
  name?: string;
  user?: string;
  is_im?: boolean;
  is_mpim?: boolean;
  is_private?: boolean;
  updated?: number;
}

interface SlackHistoryMessage {
  ts: string;
  text?: string;
  user?: string;
  username?: string;
  bot_id?: string;
  subtype?: string;
}

async function displayName(userId?: string): Promise<string> {
  if (!userId) return "Unknown";
  const cached = userNames.get(userId);
  if (cached) return cached;
  try {
    const body = await slack<{ user: { real_name?: string; name?: string } }>("users.info", {
      user: userId,
    });
    const name = body.user.real_name || body.user.name || userId;
    userNames.set(userId, name);
    return name;
  } catch {
    return userId;
  }
}

async function conversationTitle(conversation: SlackConversation): Promise<string> {
  if (conversation.name) return conversation.is_private ? `🔒 ${conversation.name}` : `#${conversation.name}`;
  if (conversation.is_im) return `${await displayName(conversation.user)} (DM)`;
  return conversation.id;
}

function conversationKind(conversation: SlackConversation): Chat["kind"] {
  if (conversation.is_im) return "dm";
  if (conversation.is_mpim) return "group";
  return "channel";
}

export const slackConnector: Connector = {
  app: "slack",
  label: "Slack",

  isLive: () => Boolean(token()),

  status: () =>
    token()
      ? "Live via the Slack Web API. The app reads conversations it has been invited to; a user token (SLACK_USER_TOKEN) also gives accurate unread counts."
      : "Not connected — showing a sample workspace. Connecting Slack needs an app registered at api.slack.com; its token goes in SLACK_BOT_TOKEN (or SLACK_USER_TOKEN).",

  async listChats(): Promise<Chat[]> {
    if (!token()) return demoChats("slack");

    const body = await slack<{ channels: SlackConversation[] }>("conversations.list", {
      types: "public_channel,private_channel,im,mpim",
      exclude_archived: "true",
      limit: "100",
    });

    const chats: Chat[] = [];
    for (const conversation of body.channels) {
      chats.push({
        id: conversation.id,
        app: "slack",
        title: await conversationTitle(conversation),
        kind: conversationKind(conversation),
        unreadCount: 0, // filled in per-chat by fetchMessages, which reads last_read
        lastActivity: new Date((conversation.updated || Date.now() / 1000) * 1000).toISOString(),
      });
    }
    return chats;
  },

  async fetchMessages(chatIds: string[], limit: number): Promise<Message[]> {
    if (!token()) {
      const wanted = new Set(chatIds);
      const all = demoMessages("slack");
      return (wanted.size > 0 ? all.filter((m) => wanted.has(m.chatId)) : all).slice(-limit);
    }

    const targets = chatIds.length > 0 ? chatIds : (await this.listChats()).map((chat) => chat.id);
    const perChat = Math.max(5, Math.floor(limit / Math.max(1, targets.length)));
    const messages: Message[] = [];

    for (const chatId of targets) {
      let lastRead = "0";
      let title = chatId;
      try {
        const info = await slack<{ channel: SlackConversation & { last_read?: string } }>(
          "conversations.info",
          { channel: chatId }
        );
        lastRead = info.channel.last_read || "0";
        title = await conversationTitle(info.channel);
      } catch {
        // conversations.info needs extra scopes on some tokens — keep going.
      }

      const history = await slack<{ messages: SlackHistoryMessage[] }>("conversations.history", {
        channel: chatId,
        limit: String(perChat),
      });

      for (const message of history.messages) {
        if (!message.text || message.subtype === "channel_join") continue;
        messages.push({
          id: `slack:${chatId}:${message.ts}`,
          app: "slack",
          chatId,
          chatTitle: title,
          sender: message.username || (await displayName(message.user)) || message.bot_id || "Unknown",
          text: message.text,
          timestamp: new Date(Number(message.ts) * 1000).toISOString(),
          unread: Number(message.ts) > Number(lastRead),
        });
      }
    }

    return messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(-limit);
  },
};
