/**
 * The digest pipeline's vocabulary.
 *
 * The shape encodes the central decision: raw posts are transient working
 * material, and only the summary is kept. Everything a person can later ask
 * about has to survive in `TopicDigest`, which is why each topic carries source
 * references rather than just prose — otherwise "show me the original" becomes
 * unanswerable the moment the posts are dropped.
 */

/** A channel the user follows, as MTProto reports it. */
export interface Channel {
  /** Telegram's numeric channel id, as a string (they exceed 2^53). */
  id: string;
  title: string;
  /** Public @name, when the channel has one. */
  username?: string;
}

/** One post, held only until it has been folded into a digest. */
export interface Post {
  id: string; // "<channelId>:<messageId>"
  channelId: string;
  channelTitle: string;
  messageId: number;
  text: string;
  date: string; // ISO 8601
}

/** Where a claim in the digest came from. */
export interface SourceRef {
  channelId: string;
  channelTitle: string;
  messageId: number;
  /** t.me link when the channel is public; undefined for private ones. */
  link?: string;
}

/**
 * One theme within a period. The same event reported by five channels collapses
 * into a single topic with five sources — that collapse is the whole point.
 */
export interface TopicDigest {
  /** Short, human title: "Bank rate decision", not "Topic 3". */
  title: string;
  /** What actually happened, in a few sentences, merged across sources. */
  summary: string;
  /** Points worth knowing individually, if any. */
  points: string[];
  /** How widely it was covered — a rough salience signal. */
  sources: SourceRef[];
}

/** Everything kept for one window. Raw posts are gone by the time this exists. */
export interface PeriodDigest {
  /** Stable key: "<userId>:<fromISO>" */
  id: string;
  userId: string;
  from: string; // ISO 8601, inclusive
  to: string; // ISO 8601, exclusive
  createdAt: string;
  /** How many posts were read to produce this, before deduplication. */
  postCount: number;
  channelCount: number;
  /** One line for the whole period. */
  headline: string;
  topics: TopicDigest[];
  /** Set when the summary was produced without a model, so answers can say so. */
  degraded?: boolean;
}

/** MTProto credentials for one account, stored per user. */
export interface TelegramAccount {
  apiId: number;
  apiHash: string;
  /** teleproto StringSession — the durable proof of a completed login. */
  session: string;
  phone?: string;
  /** Channels the user chose to follow in the digest; empty means all of them. */
  channelIds?: string[];
}
