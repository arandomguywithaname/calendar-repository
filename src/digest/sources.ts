import { connectors } from "../reader/connectors";
import { ForwardedPost } from "./store";
import { AppId, Connections } from "../reader/types";
import { wellFormed } from "./format";
import { Post } from "./types";

/**
 * The other messengers, folded into the same digest.
 *
 * Telegram has its own path — MTProto, ids that count upward, a mark per
 * channel — because it is the source the queue's honest-coverage rules were
 * built around. Everything else arrives through the reader's connector
 * interface, which already speaks Slack's Web API, Gmail, and WhatsApp's
 * Cloud API webhook. This module is the adapter between the two worlds:
 * connector `Message`s in, digest `Post`s out.
 *
 * The mark is a timestamp rather than an id, and that is not laziness. Slack
 * counts in fractional seconds, Gmail in opaque strings, WhatsApp in whatever
 * Meta sends — the one fact they all agree on is when a message happened.
 * These sources are also fetched as a recent window rather than walked
 * position by position, so a timestamp is exactly as much precision as the
 * fetch itself provides.
 */

/** Telegram is excluded: the digest reads it over MTProto, far better than a bot token can. */
const SOURCE_APPS: AppId[] = ["slack", "gmail", "whatsapp"];

/** How many messages to pull per app in one step. */
const PER_APP = 200;

export interface SourceFetch {
  posts: Post[];
  /** "<app>:<chatId>" -> ISO of the newest message fetched, for the caller to advance after saving. */
  newest: Record<string, string>;
  /** What went wrong per app, so a broken Slack token cannot cost the Telegram digest. */
  errors: string[];
}

/** Which of the non-Telegram apps this person has actually connected. */
export function connectedApps(connections: Connections): AppId[] {
  return SOURCE_APPS.filter((app) => connectors[app].isLive(connections));
}

export function appLabel(app: AppId): string {
  return connectors[app].label;
}

/**
 * Everything new since the marks, as digest posts.
 *
 * A connector post carries no numeric message id — there is nothing to count
 * — so `messageId` is 0 and the channel id is namespaced by app. Nothing
 * downstream depends on the number: source links are built from the Telegram
 * channel index, which a connector chat is deliberately absent from, and the
 * queue's coverage walk only ever considers channels it fetched itself.
 */
export async function collectSourcePosts(
  connections: Connections,
  marks: Record<string, string>
): Promise<SourceFetch> {
  const apps = connectedApps(connections);
  const posts: Post[] = [];
  const newest: Record<string, string> = {};
  const errors: string[] = [];

  for (const app of apps) {
    try {
      // An empty chat list means "everything this connector can see".
      const messages = await connectors[app].fetchMessages([], PER_APP, connections);
      for (const message of messages) {
        const key = `${app}:${message.chatId}`;
        const mark = marks[key];
        // Strictly newer: a mark names a message already digested.
        if (mark && message.timestamp <= mark) continue;
        const text = wellFormed(message.text || "").trim();
        if (!text) continue;

        posts.push({
          id: `${key}:${message.id}`,
          channelId: key,
          channelTitle: `${connectors[app].label} · ${message.chatTitle}`,
          messageId: 0,
          // Who said it matters in a conversation in a way it does not in a
          // broadcast channel, and the summariser only sees this text.
          text: message.sender ? `${message.sender}: ${text}` : text,
          date: message.timestamp,
        });
        if (!newest[key] || message.timestamp > newest[key]) newest[key] = message.timestamp;
      }
    } catch (err: any) {
      errors.push(`${connectors[app].label}: ${err?.message || err}`);
    }
  }

  posts.sort((a, b) => a.date.localeCompare(b.date));
  return { posts, newest, errors };
}

/**
 * The namespace forwarded messages live under, kept distinct from any
 * connector's `<app>:<chat>` so the timestamp-marked sources and the
 * drained-by-id forwards never collide.
 */
export const FORWARD_PREFIX = "forward";

/**
 * Forwarded messages as digest posts.
 *
 * They carry `messageId: 0` like a connector post — there is no numeric id to
 * count and nothing downstream needs one — but their channel is the forward
 * namespace, which `sourceCoverage` skips: a forward is consumed by having
 * its queue entry removed, not by advancing a timestamp mark. The post id
 * keeps the queue id so the caller can remove exactly what a digest kept.
 */
export function forwardPosts(forwards: ForwardedPost[]): Post[] {
  return forwards.map((f) => ({
    id: `${FORWARD_PREFIX}:${f.id}`,
    channelId: FORWARD_PREFIX,
    channelTitle: `Forwarded · ${f.from}`,
    messageId: 0,
    text: f.from ? `${f.from}: ${wellFormed(f.text)}` : wellFormed(f.text),
    date: f.date,
  }));
}

/** Which of the kept posts are forwards, by their queue id, so they can be drained. */
export function keptForwardIds(kept: Post[]): string[] {
  return kept
    .filter((p) => p.channelId === FORWARD_PREFIX)
    .map((p) => p.id.slice(FORWARD_PREFIX.length + 1));
}

/**
 * The marks to store, given what actually survived into the digest.
 *
 * Measured on the kept posts rather than the fetched ones, for the same
 * reason the Telegram coverage is: material trimmed to fit the model's
 * context was read and then dropped, and counting it as digested would lose
 * it silently.
 */
export function sourceCoverage(kept: Post[]): Record<string, string> {
  const covered: Record<string, string> = {};
  for (const post of kept) {
    if (post.messageId !== 0) continue; // a Telegram post, handled by the queue's own walk
    if (post.channelId === FORWARD_PREFIX) continue; // a forward, drained by id rather than marked
    if (!covered[post.channelId] || post.date > covered[post.channelId]) {
      covered[post.channelId] = post.date;
    }
  }
  return covered;
}


export interface AppCheck {
  app: AppId;
  label: string;
  ok: boolean;
  detail: string;
}

/**
 * Live-check every source app, in parallel, one bad one never sinking the rest.
 *
 * A connector with a `verify` gets a real call — Slack's auth.test, Gmail's
 * getProfile — so an expired sign-in reads as broken here rather than silently
 * dropping out of digests. One without falls back to its `isLive`, which is
 * still an honest "connected or not". Telegram is excluded: its session is the
 * account itself, checked by the caller, not a connector credential.
 */
export async function verifyConnections(connections: Connections): Promise<AppCheck[]> {
  return Promise.all(
    SOURCE_APPS.map(async (app) => {
      const connector = connectors[app];
      const label = connector.label;
      if (!connector.isLive(connections)) {
        return { app, label, ok: false, detail: "not connected" };
      }
      if (!connector.verify) {
        return { app, label, ok: true, detail: "connected" };
      }
      try {
        const result = await connector.verify(connections);
        return { app, label, ok: result.ok, detail: result.detail };
      } catch (err: any) {
        return { app, label, ok: false, detail: `check failed: ${err?.message || err}` };
      }
    })
  );
}
