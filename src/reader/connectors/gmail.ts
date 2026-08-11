import { google } from "googleapis";
import { Chat, Connections, Connector, Message } from "../types";
import { demoChats, demoMessages } from "./demo";

/**
 * Gmail, read with the same Google account used to sign in.
 *
 * This is the one source a person can genuinely connect themselves: the sign-in
 * consent screen also asks for read-only Gmail access, and the refresh token
 * that comes back is stored against their account. No token is ever pasted, and
 * nothing is stored in the environment.
 *
 * Read-only by design — the scope requested is gmail.readonly, so the app
 * cannot send, delete or modify anything.
 */

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

function oauthClient(refreshToken: string) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/google/callback"
  );
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

function header(headers: { name?: string | null; value?: string | null }[], want: string): string {
  const found = headers.find((h) => (h.name || "").toLowerCase() === want.toLowerCase());
  return found?.value || "";
}

/** "Lena Fischer <lena@example.com>" -> "Lena Fischer" */
function displayName(from: string): string {
  const named = from.match(/^\s*"?([^"<]+?)"?\s*</);
  if (named) return named[1].trim();
  return from.replace(/[<>]/g, "").trim() || "Unknown sender";
}

/** A thread is the closest thing Gmail has to a chat. */
function threadKey(threadId: string): string {
  return threadId;
}

export const gmailConnector: Connector = {
  app: "gmail",
  label: "Gmail",

  isLive: (c) => Boolean(c.googleRefreshToken),

  connectable: () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),

  status: (c) =>
    c.googleRefreshToken
      ? `Connected as ${c.googleEmail || "your Google account"}. Reading your inbox read-only; the app cannot send or delete mail.`
      : process.env.GOOGLE_CLIENT_ID
        ? "Not connected — click Connect to allow read-only access to your Gmail inbox."
        : "Not connected — showing sample mail. Gmail needs a Google OAuth client (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) registered once for this site.",

  async listChats(c): Promise<Chat[]> {
    if (!c.googleRefreshToken) return demoChats("gmail");

    const gmail = google.gmail({ version: "v1", auth: oauthClient(c.googleRefreshToken) });
    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults: 40,
      q: "in:inbox newer_than:7d",
    });

    const byThread = new Map<string, Chat>();
    for (const ref of list.data.messages || []) {
      if (!ref.id || !ref.threadId) continue;
      if (byThread.has(ref.threadId)) continue;

      const full = await gmail.users.messages.get({
        userId: "me",
        id: ref.id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });
      const headers = full.data.payload?.headers || [];
      const unread = (full.data.labelIds || []).includes("UNREAD");

      byThread.set(ref.threadId, {
        id: threadKey(ref.threadId),
        app: "gmail",
        title: header(headers, "Subject") || "(no subject)",
        kind: "dm",
        unreadCount: unread ? 1 : 0,
        lastActivity: new Date(Number(full.data.internalDate || Date.now())).toISOString(),
      });
    }

    return [...byThread.values()];
  },

  async fetchMessages(chatIds, limit, c): Promise<Message[]> {
    if (!c.googleRefreshToken) {
      const all = demoMessages("gmail");
      const scoped = chatIds.length ? all.filter((m) => chatIds.includes(m.chatId)) : all;
      return scoped.slice(-limit);
    }

    const gmail = google.gmail({ version: "v1", auth: oauthClient(c.googleRefreshToken) });
    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults: Math.min(limit, 50),
      q: "in:inbox newer_than:7d",
    });

    const messages: Message[] = [];
    for (const ref of list.data.messages || []) {
      if (!ref.id || !ref.threadId) continue;
      if (chatIds.length && !chatIds.includes(ref.threadId)) continue;

      const full = await gmail.users.messages.get({
        userId: "me",
        id: ref.id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });
      const headers = full.data.payload?.headers || [];

      messages.push({
        id: `gmail:${ref.id}`,
        app: "gmail",
        chatId: ref.threadId,
        chatTitle: header(headers, "Subject") || "(no subject)",
        sender: displayName(header(headers, "From")),
        // The snippet is the summary line Gmail itself shows; fetching full
        // bodies would mean parsing MIME for every message on every load.
        text: (full.data.snippet || "").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
        timestamp: new Date(Number(full.data.internalDate || Date.now())).toISOString(),
        unread: (full.data.labelIds || []).includes("UNREAD"),
      });
    }

    return messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  },
};
