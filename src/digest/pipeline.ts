import { collectPosts } from "./collector";
import { summarisePeriod } from "./summarise";
import {
  advanceMarks,
  allowedChannels,
  getAccount,
  getMarks,
  getTopics,
  getWatermark,
  listAccounts,
  saveDigest,
  setWatermark,
} from "./store";
import { PeriodDigest } from "./types";

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

  const [allowed, topics] = await Promise.all([allowedChannels(userId), getTopics(userId)]);

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
