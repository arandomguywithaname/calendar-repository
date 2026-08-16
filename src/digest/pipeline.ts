import { collectPosts } from "./collector";
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
  getWatermark,
  listAccounts,
  saveDigest,
  setVerdicts,
  setWatermark,
} from "./store";
import { PeriodDigest, TelegramAccount } from "./types";

/**
 * Collect → summarise → store, for one window.
 *
 * The one invariant worth stating: posts exist only inside this function. They
 * are fetched, handed to the summariser, and dropped when it returns. Nothing
 * downstream — storage, the bot, the model's context — ever sees them again,
 * which is what keeps a conversation about months of channels affordable.
 */

/** How far back to read when a user has no watermark yet. */
const FIRST_RUN_HOURS = 24;
/** Never re-read more than this, however long the bot has been asleep. */
const MAX_LOOKBACK_HOURS = 72;
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
 * old mark.
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

export interface DigestOutcome {
  digest: PeriodDigest;
  /** True when the window held nothing new — the digest is empty but valid. */
  empty: boolean;
}

export async function runDigest(
  userId: string,
  options: { hours?: number } = {}
): Promise<DigestOutcome> {
  const account = await getAccount(userId);
  if (!account) throw new Error("no account connected");

  const now = new Date();
  let since: Date;

  if (options.hours) {
    // An explicit window is a request to re-read, so the watermark is ignored.
    since = new Date(now.getTime() - options.hours * 3600_000);
  } else {
    const watermark = await getWatermark(userId);
    since = watermark ? new Date(watermark) : new Date(now.getTime() - FIRST_RUN_HOURS * 3600_000);
    const floor = new Date(now.getTime() - MAX_LOOKBACK_HOURS * 3600_000);
    if (since < floor) since = floor;
  }

  // The marks go the same way as the watermark: an explicit re-read means
  // "look again at this window", and filtering it against what has already been
  // digested would leave nothing to look at.
  const marks = options.hours ? {} : await getMarks(userId);

  const topics = await getTopics(userId);
  // Before the filter is applied, not after: a channel due to come back should
  // be read in this digest rather than the next one.
  if (topics.length > 0 && canTriage()) await refreshStaleVerdicts(userId, account, topics);
  const allowed = await allowedChannels(userId);

  const { posts, channels, silent, filtered } = await collectPosts(account, since, {
    perChannel: 35,
    total: 550,
    marks,
    allowed: allowed || undefined,
  });
  if (silent > 0 || filtered > 0) {
    console.log(`${userId}: skipped ${silent} quiet and ${filtered} off-subject channel(s)`);
  }

  // The channels are filtered, but a channel that is on subject still posts
  // about other things — so the summariser is told what was asked for too.
  const digest = await summarisePeriod(userId, posts, channels, since, now, topics);

  await saveDigest(digest);
  // After the digest is stored, never before: a crash between the two would
  // otherwise move the marks past posts that no digest accounts for.
  if (digest.coverage) await advanceMarks(userId, digest.coverage);

  // The watermark advances to the newest post actually seen, not to "now" —
  // otherwise a post arriving during collection would be skipped forever.
  const newest = posts.length ? posts[posts.length - 1].date : undefined;
  if (newest) await setWatermark(userId, newest);
  else if (!options.hours) await setWatermark(userId, now.toISOString());

  return { digest, empty: posts.length === 0 };
}

/**
 * A digest for everyone who has connected an account.
 *
 * Failures are per-user: one expired session must not stop the rest of the
 * batch, so each error is reported rather than thrown.
 */
export async function runDigestForAll(): Promise<
  { userId: string; ok: boolean; error?: string; postCount?: number }[]
> {
  const accounts = await listAccounts();
  const results: { userId: string; ok: boolean; error?: string; postCount?: number }[] = [];

  for (const { userId } of accounts) {
    try {
      const { digest } = await runDigest(userId);
      results.push({ userId, ok: true, postCount: digest.postCount });
    } catch (err: any) {
      results.push({ userId, ok: false, error: err?.message || String(err) });
    }
  }
  return results;
}
