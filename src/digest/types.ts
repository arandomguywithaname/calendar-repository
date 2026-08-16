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

/**
 * How far a digest got through one channel.
 *
 * This is the only record of what a digest actually read: posts are dropped
 * once summarised, so without it there is no way to answer "which messages does
 * this digest account for". Three things need that answer — advancing the
 * per-channel mark, estimating how much is outstanding without fetching
 * anything, and knowing what may be marked read in Telegram once a digest is
 * accepted. All three are wrong if the number is a guess.
 *
 * It records what survived into the summary, not what was fetched: material
 * trimmed to fit the model's context was never digested and must not count as
 * covered.
 */
export interface ChannelCoverage {
  channelId: string;
  /** Highest message id folded into the digest. */
  maxMessageId: number;
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
  /** Per channel, how far this digest got. Absent on digests built before it was recorded. */
  coverage?: ChannelCoverage[];
  /** When its channels were marked read in Telegram, if they were. Set only by an explicit press. */
  readMarkedAt?: string;
  /**
   * When this digest stopped gating the queue.
   *
   * The queue moves at the speed of confirmations: the next digest is not built
   * while the latest one is still open. Any of three things closes it — the
   * "mark read" press, the "leave unread" press, or a /digest that moves on —
   * and a digest born outside the queue (an explicit-hours re-read) is born
   * closed.
   */
  closedAt?: string;
}

/**
 * What triage made of one channel, against the subjects in force at the time.
 *
 * Kept apart from the person's own include/exclude decisions on purpose. Once
 * the two are mixed there is no way to tell "I turned this off" from "a model
 * turned this off", and re-running triage after the subjects change would
 * quietly overwrite choices someone made deliberately.
 */
export interface ChannelVerdict {
  /** True when the channel regularly covers the subjects asked for. */
  onTopic: boolean;
  /** One line explaining the call, shown by /channels so the filter can be argued with. */
  reason: string;
  /** When it was decided — what lets a channel that changes subject be looked at again. */
  decidedAt: string;
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
