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


/** Run `fn` over `items` with a bounded number in flight. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * One dashboard load hits /api/sources, /api/digest and /api/messages, and each
 * of those wants the same mail. Without this they would each re-fetch it,
 * tripling both the latency and the API quota for one page view.
 */
const recentCache = new Map<string, { at: number; messages: Message[] }>();
const CACHE_TTL_MS = 30_000;

/**
 * Gmail has no endpoint that returns message bodies in bulk: `messages.list`
 * gives ids only, so each one needs its own `get`. Issued serially that is a
 * round trip per message and a dashboard that hangs for seconds; these run
 * concurrently, capped so a load stays inside Gmail's per-user rate limit.
 */
async function loadRecent(c: Connections, max: number): Promise<Message[]> {
  const key = c.googleRefreshToken || "";
  const cached = recentCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.messages;

  const gmail = google.gmail({ version: "v1", auth: oauthClient(key) });
  const list = await gmail.users.messages.list({
    userId: "me",
    maxResults: Math.min(max, 50),
    q: "in:inbox newer_than:7d",
  });

  const refs = (list.data.messages || []).filter(
    (m): m is { id: string; threadId: string } => Boolean(m.id && m.threadId)
  );

  const loaded = await mapWithConcurrency(refs, 8, async (ref) => {
    const full = await gmail.users.messages.get({
      userId: "me",
      id: ref.id,
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date"],
    });
    const headers = full.data.payload?.headers || [];
    const message: Message = {
      id: `gmail:${ref.id}`,
      app: "gmail",
      chatId: ref.threadId,
      chatTitle: header(headers, "Subject") || "(no subject)",
      sender: displayName(header(headers, "From")),
      // The snippet is the summary line Gmail itself shows; fetching full
      // bodies would mean parsing MIME for every message on every load.
      text: (full.data.snippet || "")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&"),
      timestamp: new Date(Number(full.data.internalDate || Date.now())).toISOString(),
      unread: (full.data.labelIds || []).includes("UNREAD"),
    };
    return message;
  });

  const messages = loaded.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Keep the cache small; this is a per-process nicety, not a store.
  if (recentCache.size > 50) recentCache.clear();
  recentCache.set(key, { at: Date.now(), messages });
  return messages;
}

export const gmailConnector: Connector = {
  app: "gmail",
  label: "Gmail",

  isLive: (c) => Boolean(c.googleRefreshToken),

  connectable: () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),

  // Gmail has no token you can paste: an app password is IMAP-only, and the
  // REST API accepts nothing but OAuth. So this one genuinely needs a client.
  connectVia: () => (process.env.GOOGLE_CLIENT_ID ? "oauth" : "none"),

  status: (c) =>
    c.googleRefreshToken
      ? `Connected as ${c.googleEmail || "your Google account"}. Reading your inbox read-only; the app cannot send or delete mail.`
      : process.env.GOOGLE_CLIENT_ID
        ? "Not connected — click Connect to allow read-only access to your Gmail inbox."
        : "Not connected — showing sample mail. Gmail needs a Google OAuth client (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) registered once for this site.",

  async verify(c): Promise<{ ok: boolean; detail: string }> {
    if (!c.googleRefreshToken) return { ok: false, detail: "not connected" };
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return { ok: false, detail: "the Google client isn't set up on this server — ask the operator" };
    }
    try {
      // getProfile forces the refresh token to mint a fresh access token: if it
      // was revoked, this is where Google says invalid_grant, cheaply.
      const auth = oauthClient(c.googleRefreshToken);
      const profile = await google.gmail({ version: "v1", auth }).users.getProfile({ userId: "me" });
      return { ok: true, detail: `reading ${profile.data.emailAddress || c.googleEmail || "your inbox"}, read-only` };
    } catch (err: any) {
      const revoked = /invalid_grant|invalid_token|unauthorized/i.test(err?.message || "");
      return { ok: false, detail: revoked ? "access was revoked — reconnect with /gmail" : `Google said: ${err?.message || err}` };
    }
  },

  async listChats(c): Promise<Chat[]> {
    if (!c.googleRefreshToken) return demoChats("gmail");

    const messages = await loadRecent(c, 50);
    const byThread = new Map<string, Chat>();
    for (const m of messages) {
      const existing = byThread.get(m.chatId);
      if (existing) {
        if (m.unread) existing.unreadCount += 1;
        if (m.timestamp > existing.lastActivity) existing.lastActivity = m.timestamp;
        continue;
      }
      byThread.set(m.chatId, {
        id: threadKey(m.chatId),
        app: "gmail",
        title: m.chatTitle,
        kind: "dm",
        unreadCount: m.unread ? 1 : 0,
        lastActivity: m.timestamp,
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

    const messages = await loadRecent(c, limit);
    const scoped = chatIds.length ? messages.filter((m) => chatIds.includes(m.chatId)) : messages;
    return scoped.slice(-limit);
  },
};
