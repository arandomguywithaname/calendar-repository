import { collectPosts, collectQueue, QueueChannelFetch } from "./collector";
import { summarisePeriod } from "./summarise";
import { canTriage, triage } from "./triage";
import {
  advanceMarks,
  allowedChannels,
  getAccount,
  getMarks,
  getOverrides,
  getTopics,
  getVerdicts,
  saveDigest,
  setVerdicts,
} from "./store";
import { ChannelCoverage, PeriodDigest, Post, TelegramAccount } from "./types";

/**
 * Collect → summarise → store, one queue step at a time.
 *
 * The queue reads from the oldest unread forward, and moves at the speed of
 * confirmations: a step is built, offered, and the next one waits until it is
 * closed. Windows are therefore chosen by volume, not by calendar — deep in a
 * backlog one step may span months of sparse posts, near the present it spans
 * hours — and the digest's own from/to reports whatever stretch was actually
 * covered.
 *
 * The one invariant worth stating twice: a channel's mark may only move past
 * material that was either summarised into a saved digest or seen to contain
 * no text at all. Every trim in this file drops the *newest* posts for that
 * reason — they are above the mark either way, and become the start of the
 * next step rather than a silent loss.
 *
 * Posts exist only inside this function: fetched, summarised, dropped.
 * Nothing downstream ever sees them again.
 */

/** One step's budget, in posts — roughly one affordable model call. */
const STEP_POSTS = 550;
/** A long post's opening states what happened; the rest is elaboration. */
const MAX_POST_CHARS = 1000;
/** Roughly 120k tokens of posts — the same ceiling the summariser trims to. */
const MAX_TOTAL_CHARS = 450_000;
/** How long a channel stays excluded before it is looked at again. */
const PROBATION_DAYS = 7;

/**
 * Look again at channels that were set aside.
 *
 * Without this the filter is a one-way door: a channel that changes what it
 * publishes stays excluded for good, and nobody finds out, because an excluded
 * channel produces no evidence of itself. Re-examining costs five posts each
 * and one model call, a week apart.
 *
 * Only the excluded ones. The two errors are not symmetrical — a channel
 * wrongly let in shows up as noise in a digest and can be dealt with, whereas
 * one wrongly kept out is silent — so the side that needs periodic rescuing is
 * the one nobody can see. Channels the person ruled on themselves are left
 * alone entirely; re-judging those would spend a sample on an answer that is
 * outranked anyway.
 *
 * Nothing is lost while a channel sits excluded: marks only advance for
 * channels that were read, so one coming back still has its backlog above its
 * old mark — and the queue's oldest-first order means that backlog is read
 * before anything newer, not skipped over.
 */
async function refreshStaleVerdicts(userId: string, account: TelegramAccount, topics: string[]): Promise<void> {
  const [verdicts, overrides] = await Promise.all([getVerdicts(userId), getOverrides(userId)]);
  const cutoff = Date.now() - PROBATION_DAYS * 86_400_000;

  const due = Object.entries(verdicts)
    .filter(([channelId, v]) => !v.onTopic && !overrides[channelId] && Date.parse(v.decidedAt) < cutoff)
    .map(([channelId]) => channelId);
  if (due.length === 0) return;

  // A failure here must cost a re-examination, not the digest.
  try {
    const { verdicts: fresh } = await triage(account, topics, { only: new Set(due) });
    if (Object.keys(fresh).length === 0) return;
    await setVerdicts(userId, fresh);
    const returning = Object.values(fresh).filter((v) => v.onTopic).length;
    console.log(`${userId}: re-examined ${due.length} excluded channel(s), ${returning} back on subject`);
  } catch (err: any) {
    console.warn(`${userId}: could not re-examine excluded channels (${err?.message || err})`);
  }
}

/**
 * Cut a step down to what one model call can hold, keeping the oldest.
 *
 * The queue's direction decides which end is expendable: material dropped here
 * must be the *newest*, because it sits above where the marks will land and so
 * becomes the next step. Dropping the oldest — what the summariser's own trim
 * does for time-window re-reads — would orphan posts below an advancing mark.
 */
function fitStep(posts: Post[]): Post[] {
  // +1 per post: the summariser appends an ellipsis when it truncates, and its
  // own trim must never fire on a step this one has passed — it drops from the
  // wrong end, past posts the coverage below has already counted.
  const size = (p: Post) => Math.min(p.text.length, MAX_POST_CHARS) + 1;
  const kept = posts.slice(0, STEP_POSTS);
  let total = kept.reduce((sum, p) => sum + size(p), 0);
  while (kept.length > 1 && total > MAX_TOTAL_CHARS) {
    total -= size(kept.pop()!);
  }
  return kept;
}

/**
 * How far each channel's mark may honestly advance.
 *
 * Walk each channel's fetched ids from the bottom: a message counts as covered
 * if it had no text (seen, nothing to summarise — without this, a stretch of
 * photo-only posts would be refetched on every run forever) or if its post was
 * kept in the digest. The first fetched message that was neither stops the
 * walk — everything above it stays queued, whatever else was fetched.
 */
export function honestCoverage(fetched: QueueChannelFetch[], kept: Post[]): ChannelCoverage[] {
  const keptIds = new Set(kept.map((p) => p.id));
  const coverage: ChannelCoverage[] = [];

  for (const { channel, position, messages } of fetched) {
    let reached = position;
    for (const message of messages) {
      if (!message.hasText || keptIds.has(`${channel.id}:${message.id}`)) {
        reached = message.id;
      } else {
        break;
      }
    }
    if (reached > position) coverage.push({ channelId: channel.id, maxMessageId: reached });
  }
  return coverage;
}

export interface DigestOutcome {
  digest: PeriodDigest;
  /** True when the queue held nothing summarisable — the digest was not saved. */
  empty: boolean;
  /** ≈ posts still queued after this step, across the channels being read. */
  backlog: number;
}

export async function runDigest(
  userId: string,
  options: { hours?: number } = {}
): Promise<DigestOutcome> {
  const account = await getAccount(userId);
  if (!account) throw new Error("no account connected");

  // An explicit window is a second look, not a queue step: it reads the recent
  // past newest-first, advances nothing, closes nothing, and gates nothing.
  if (options.hours) return runRereadDigest(userId, account, options.hours);

  const topics = await getTopics(userId);
  // Before the filter is applied, not after: a channel due to come back should
  // be read in this step rather than the next one.
  if (topics.length > 0 && canTriage()) await refreshStaleVerdicts(userId, account, topics);
  const allowed = await allowedChannels(userId);
  const marks = await getMarks(userId);

  const { posts, channels, fetched, silent, filtered, backlog } = await collectQueue(account, {
    marks,
    allowed: allowed || undefined,
  });
  if (silent > 0 || filtered > 0) {
    console.log(`${userId}: skipped ${silent} quiet and ${filtered} off-subject channel(s)`);
  }

  const kept = fitStep(posts);
  const coverage = honestCoverage(fetched, kept);
  // What the trims postponed is still queued; say so in the estimate.
  const stillQueued = backlog + (posts.length - kept.length);

  if (kept.length === 0) {
    // Nothing summarisable — but marks still advance over stretches that were
    // seen and textless, or the same photo-only span would be refetched every
    // run. No digest is saved: an empty one would gate the queue with a step
    // nobody can close, and pollute both /history and the conversation window.
    if (coverage.length > 0) await advanceMarks(userId, coverage);
    const now = new Date();
    return {
      digest: {
        id: `${userId}:${now.toISOString()}`,
        userId,
        from: now.toISOString(),
        to: now.toISOString(),
        createdAt: now.toISOString(),
        postCount: 0,
        channelCount: 0,
        headline: "Nothing unread to digest.",
        topics: [],
        closedAt: now.toISOString(),
      },
      empty: true,
      backlog: stillQueued,
    };
  }

  // The step's window is whatever the kept posts actually span — deep in a
  // backlog that may be months, near the present it is hours. The digest
  // reports the real stretch rather than a calendar guess.
  const from = new Date(kept[0].date);
  const to = new Date(kept[kept.length - 1].date);

  const digest = await summarisePeriod(userId, kept, channels, from, to, topics);
  // The summariser measures coverage on what survived its own trim; the queue
  // has already fitted the step and knows about textless stretches too, so its
  // walk is the authoritative one.
  digest.coverage = coverage;
  digest.postCount = kept.length;

  await saveDigest(digest);
  // After the digest is stored, never before: a crash between the two would
  // otherwise move the marks past posts that no digest accounts for.
  if (coverage.length > 0) await advanceMarks(userId, coverage);

  return { digest, empty: false, backlog: stillQueued };
}

/**
 * `/digest 24` and friends: re-read a recent window, newest-first.
 *
 * Deliberately outside the queue. The marks are neither consulted nor
 * advanced — a newest-first read over a time window cannot advance them
 * honestly, since anything it skips sits *below* its newest posts. The digest
 * is saved for conversation but born closed, and carries no coverage, so it
 * never grows a mark-read button and never gates the queue.
 */
async function runRereadDigest(
  userId: string,
  account: TelegramAccount,
  hours: number
): Promise<DigestOutcome> {
  const now = new Date();
  const since = new Date(now.getTime() - hours * 3600_000);
  const [allowed, topics] = await Promise.all([allowedChannels(userId), getTopics(userId)]);

  const { posts, channels } = await collectPosts(account, since, {
    perChannel: 35,
    total: STEP_POSTS,
    allowed: allowed || undefined,
  });

  const digest = await summarisePeriod(userId, posts, channels, since, now, topics);
  digest.coverage = undefined;
  digest.closedAt = new Date().toISOString();

  if (posts.length > 0) await saveDigest(digest);
  return { digest, empty: posts.length === 0, backlog: 0 };
}
