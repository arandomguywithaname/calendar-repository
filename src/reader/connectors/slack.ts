import { Chat, Connections, Connector, Message } from "../types";
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

/**
 * The account's own token wins. Environment tokens remain as a shared fallback
 * so an operator-configured workspace still works for everyone.
 */
function token(c: Connections = {}): string | undefined {
  return c.slackToken || process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN;
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

  isLive: (c) => Boolean(token(c)),

  connectable: () => true,

  // OAuth when the site is registered, a pasted token otherwise — either way a
  // person can connect their own workspace without an operator involved.
  connectVia: () => (process.env.SLACK_CLIENT_ID ? "oauth" : "token"),

  tokenHelp: () => ({
    label: "Slack token",
    help:
      "At api.slack.com/apps create an app for your workspace, add the scopes " +
      "channels:read, channels:history, groups:read, groups:history, im:read, im:history, users:read, " +
      "install it, and paste the token. A user token (xoxp-) also gives accurate unread counts.",
    placeholder: "xoxp-… or xoxb-…",
  }),

  status: (c) =>
    c.slackToken
      ? `Connected${c.slackTeam ? ` to ${c.slackTeam}` : ""}. Reading the conversations your Slack account can see, with accurate unread counts.`
      : token(c)
        ? "Live via a workspace token configured for this site. Unread counts are accurate only with a user token."
        : process.env.SLACK_CLIENT_ID
          ? "Not connected — click Connect to sign in with Slack and read your own conversations."
          : "Not connected — showing a sample workspace. Slack needs an app registered at api.slack.com (SLACK_CLIENT_ID / SLACK_CLIENT_SECRET) once for this site.",

  async verify(c: Connections = {}): Promise<{ ok: boolean; detail: string }> {
    const t = token(c);
    if (!t) return { ok: false, detail: "not connected" };
    try {
      // auth.test is Slack's own "is this token still good" call — no scopes,
      // no cost, and it names the workspace it's signed in to.
      const res = await fetch(`${API}/auth.test`, { headers: { Authorization: `Bearer ${t}` } });
      const body = (await res.json()) as { ok: boolean; error?: string; team?: string; user?: string };
      if (body.ok) {
        return { ok: true, detail: `signed in to ${body.team || "your workspace"}${body.user ? ` as ${body.user}` : ""}` };
      }
      const expired = body.error === "invalid_auth" || body.error === "token_revoked" || body.error === "account_inactive";
      return { ok: false, detail: expired ? "the sign-in expired — reconnect with /slack" : `Slack said: ${body.error || "not ok"}` };
    } catch (err: any) {
      return { ok: false, detail: `couldn't reach Slack: ${err?.message || err}` };
    }
  },

  async listChats(c: Connections = {}): Promise<Chat[]> {
    if (!token(c)) return demoChats("slack");

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

  async fetchMessages(chatIds: string[], limit: number, c: Connections = {}): Promise<Message[]> {
    if (!token(c)) {
      const wanted = new Set(chatIds);
      const all = demoMessages("slack");
      return (wanted.size > 0 ? all.filter((m) => wanted.has(m.chatId)) : all).slice(-limit);
    }

    const targets = chatIds.length > 0 ? chatIds : (await this.listChats(c)).map((chat) => chat.id);
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
