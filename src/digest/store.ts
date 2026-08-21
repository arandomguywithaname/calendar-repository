import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { dataDir } from "./paths";
import { ChannelCoverage, ChannelVerdict, PeriodDigest, TelegramAccount } from "./types";

/**
 * Persistence for the digest side.
 *
 * Deliberately separate from the reader's store: what is kept here is small and
 * long-lived (summaries, one MTProto session per user), whereas raw posts are
 * never written at all. That is the point of the redesign — the model's context
 * is fed from summaries, so the volume that reaches storage stays bounded no
 * matter how much the channels produce.
 *
 * Same two backends as the rest of the app: a JSON file where the disk is
 * writable, Netlify Blobs where it isn't.
 */

interface DigestStoreShape {
  /** userId -> their Telegram login */
  accounts: Record<string, TelegramAccount>;
  /** digest id -> the digest */
  digests: Record<string, PeriodDigest>;
  /** userId -> conversation with the bot, capped */
  chats: Record<string, { role: "user" | "assistant"; content: string }[]>;
  /** userId -> ISO timestamp of the last post already folded into a digest */
  watermarks: Record<string, string>;
  /**
   * userId -> channelId -> highest message id already folded into a digest.
   *
   * Beside the timestamp watermark rather than instead of it, because they
   * answer different questions. The watermark bounds the window in time; these
   * say, per channel, exactly which messages are already accounted for — which
   * a timestamp cannot, since one shared instant says nothing about a channel
   * that was truncated at the per-channel limit while another was not.
   */
  marks: Record<string, Record<string, number>>;
  /** userId -> the subjects they asked for. Absent or empty means everything. */
  topics: Record<string, string[]>;
  /** userId -> channelId -> what triage made of it, against the topics above */
  verdicts: Record<string, Record<string, ChannelVerdict>>;
  /**
   * userId -> channelId -> a decision the person made themselves.
   *
   * Separate from the verdicts and always stronger. Changing the subjects wipes
   * what triage decided, because those judgements were made against a question
   * that no longer applies; it must not wipe these, which were not.
   */
  overrides: Record<string, Record<string, "include" | "exclude">>;
  /**
   * MCP access token -> userId.
   *
   * The token *is* the authentication: it rides in the connector URL, because
   * that is the only credential a claude.ai custom connector can carry without
   * an OAuth server. Keyed by token so a lookup on every request is O(1) and a
   * token can be revoked by deleting one key.
   */
  mcpTokens: Record<string, string>;
  /**
   * Stripe customer id -> userId.
   *
   * Written once, when a checkout completes carrying the Telegram id as its
   * client_reference_id. Every later webhook — a failed invoice, a cancelled
   * subscription — identifies the person only by customer id, so this map is
   * what lets billing events reach the suspension switch.
   */
  stripeCustomers: Record<string, string>;
  /**
   * userId -> the person's display name, best known.
   *
   * Written from wherever an identity passes by — MTProto's getMe at login,
   * the Bot API's `from` on every message — because the admin's account list
   * is unreadable as bare numeric ids. Display only, never authorisation.
   */
  names: Record<string, string>;
  /**
   * userId -> ISO timestamp of when their access was suspended.
   *
   * The per-customer kill switch: a lapsed subscription is an application
   * fact, not an infrastructure one — everyone shares one machine, so the
   * only correct "shut it off for this person" is a flag their every entry
   * point checks. Data is deliberately untouched: suspension is meant to be
   * reversed the day they pay, with nothing to rebuild.
   */
  suspensions: Record<string, string>;
  /**
   * userId -> their editorial brief, in their own words.
   *
   * Different layer from `topics`: topics decide which channels are opened at
   * all, the focus decides what within them deserves a topic and what folds
   * into a one-line mention. Free text on purpose — the model applies a stated
   * criterion far better than any flag set could encode one, and updating it
   * is a sentence, not a schema change.
   */
  focuses: Record<string, string>;
}

/**
 * Beside the running program, not beside this source file.
 *
 * A path built from `__dirname` means something different in `dist/digest/`
 * than it does inside a single compiled binary — and the binary is how this
 * ships to anyone without Node. See `paths.ts` for how the two are told apart.
 *
 * Resolved lazily: under a compiled binary the answer depends on `execPath`,
 * which is stable, but tests need to be able to point it elsewhere.
 */
function storePath(): string {
  return path.join(dataDir(), "digest-store.json");
}
const BLOB_STORE = "inbox-reader";
const BLOB_KEY = "digest-store";
const MAX_CHAT_TURNS = 24;
/**
 * Deep enough that a trend question spanning months has material to stand on.
 * Digests are compressed text — a couple of hundred of them is still a small
 * file — and during a heavy backlog catch-up they are born fast, so a tight
 * cap here would silently eat the early history a trend answer needs most.
 */
const MAX_DIGESTS_PER_USER = 240;

function empty(): DigestStoreShape {
  return {
    accounts: {},
    digests: {},
    chats: {},
    watermarks: {},
    marks: {},
    topics: {},
    verdicts: {},
    overrides: {},
    mcpTokens: {},
    focuses: {},
    suspensions: {},
    names: {},
    stripeCustomers: {},
  };
}

let memory: DigestStoreShape | null = null;
let writableDisk: boolean | null = null;

function diskIsWritable(): boolean {
  if (writableDisk !== null) return writableDisk;
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.accessSync(dataDir(), fs.constants.W_OK);
    writableDisk = true;
  } catch {
    writableDisk = false;
  }
  return writableDisk;
}

async function load(): Promise<DigestStoreShape> {
  try {
    if (process.env.NETLIFY_BLOBS_CONTEXT) {
      const { getStore } = await import("@netlify/blobs");
      const stored = (await getStore(BLOB_STORE).get(BLOB_KEY, { type: "json" })) as DigestStoreShape | null;
      return stored ? { ...empty(), ...stored } : empty();
    }
    if (diskIsWritable() && fs.existsSync(storePath())) {
      return { ...empty(), ...JSON.parse(fs.readFileSync(storePath(), "utf-8")) };
    }
  } catch (err: any) {
    console.warn(`Digest store read failed (${err.message}) — continuing empty.`);
  }
  return memory || empty();
}

/** Best effort, like the reader's store: a failed write must not break a reply. */
async function save(store: DigestStoreShape): Promise<void> {
  memory = store;
  try {
    if (process.env.NETLIFY_BLOBS_CONTEXT) {
      const { getStore } = await import("@netlify/blobs");
      await getStore(BLOB_STORE).setJSON(BLOB_KEY, store);
      return;
    }
    if (diskIsWritable()) {
      fs.mkdirSync(dataDir(), { recursive: true });
      fs.writeFileSync(storePath(), JSON.stringify(store, null, 2));
    }
  } catch (err: any) {
    console.warn(`Digest store write failed (${err.message}) — kept in memory.`);
  }
}

/**
 * Writes go through one queue.
 *
 * `mutate` is read-modify-write over a single file, and the writers multiplied:
 * message handlers run unawaited, the digest timer runs beside them, and marks,
 * verdicts and read-claims all land here. Two interleaved mutations would each
 * load, change different keys, and the second save would silently drop the
 * first one's work. Serialising them costs nothing anyone can feel.
 */
let writeChain: Promise<unknown> = Promise.resolve();

function mutate<T>(fn: (store: DigestStoreShape) => T): Promise<T> {
  const run = writeChain.then(async () => {
    const store = await load();
    const result = fn(store);
    await save(store);
    return result;
  });
  writeChain = run.catch(() => {});
  return run;
}

/* ------------------------------- accounts -------------------------------- */

export async function getAccount(userId: string): Promise<TelegramAccount | undefined> {
  return (await load()).accounts[userId];
}

export async function setAccount(userId: string, account: TelegramAccount): Promise<void> {
  await mutate((store) => {
    store.accounts[userId] = account;
  });
}

export async function clearAccount(userId: string): Promise<void> {
  await mutate((store) => {
    delete store.accounts[userId];
    delete store.watermarks[userId];
    delete store.marks[userId];
    delete store.verdicts[userId];
    // Topics and overrides are the person's own settings rather than progress,
    // so /forget — which removes the session, not the preferences — keeps them.
  });
}

export async function listAccounts(): Promise<{ userId: string; account: TelegramAccount }[]> {
  const store = await load();
  return Object.entries(store.accounts).map(([userId, account]) => ({ userId, account }));
}

/* -------------------------------- digests -------------------------------- */

export async function saveDigest(digest: PeriodDigest): Promise<void> {
  await mutate((store) => {
    store.digests[digest.id] = digest;

    // Keep the newest N per user so the store cannot grow without bound.
    const mine = Object.values(store.digests)
      .filter((d) => d.userId === digest.userId)
      .sort((a, b) => b.from.localeCompare(a.from));
    for (const stale of mine.slice(MAX_DIGESTS_PER_USER)) delete store.digests[stale.id];
  });
}

/** Newest first. `since` filters by the start of the window. */
export async function listDigests(userId: string, since?: string): Promise<PeriodDigest[]> {
  const store = await load();
  return Object.values(store.digests)
    .filter((d) => d.userId === userId && (!since || d.from >= since))
    .sort((a, b) => b.from.localeCompare(a.from));
}

export async function latestDigest(userId: string): Promise<PeriodDigest | undefined> {
  return (await listDigests(userId))[0];
}

export async function getDigest(id: string): Promise<PeriodDigest | undefined> {
  return (await load()).digests[id];
}

/**
 * Record that a digest's channels were marked read, and say whether this call
 * was the one that did it.
 *
 * The answer matters: two quick presses would otherwise both report success,
 * and the second would be claiming credit for work it did not do. Read-marking
 * itself is idempotent, so the cost of losing this race is a misleading
 * message rather than a wrong pointer — but misleading is enough.
 *
 * A claim also closes the digest: accepting it is one of the ways a queue step
 * ends.
 */
export async function claimReadMark(id: string): Promise<boolean> {
  return mutate((store) => {
    const digest = store.digests[id];
    if (!digest || digest.readMarkedAt) return false;
    const now = new Date().toISOString();
    digest.readMarkedAt = now;
    if (!digest.closedAt) digest.closedAt = now;
    return true;
  });
}

/**
 * Give the claim back when the marking did not happen.
 *
 * Claiming before the work is what stops two presses both reporting success,
 * but it also means a failure would leave a digest that says it was marked and
 * a Telegram that disagrees — and no way to try again, since the button is
 * gone and the flag is set. The close is handed back too: a step whose marking
 * failed has not ended, and the queue should wait for the person to answer the
 * restored button rather than roll on past it.
 */
export async function releaseReadMark(id: string): Promise<void> {
  await mutate((store) => {
    const digest = store.digests[id];
    if (!digest) return;
    delete digest.readMarkedAt;
    delete digest.closedAt;
  });
}

/** Close one digest — the "leave unread" press. Marks nothing in Telegram. */
export async function closeDigest(id: string): Promise<void> {
  await mutate((store) => {
    const digest = store.digests[id];
    if (digest && !digest.closedAt) digest.closedAt = new Date().toISOString();
  });
}

/**
 * The newest digest whose channels could still be marked read.
 *
 * What "прочитано" said in words refers to: the digest the person just saw.
 * Unlike the button press, a spoken request carries no message id, so the
 * target is resolved by recency — newest by creation time, carrying coverage,
 * not yet marked. A digest closed with "leave unread" still qualifies: closing
 * declined to mark it then, and saying "read" afterwards is a change of mind,
 * not an error.
 */
export async function latestMarkableDigest(userId: string): Promise<PeriodDigest | undefined> {
  const store = await load();
  let best: PeriodDigest | undefined;
  for (const digest of Object.values(store.digests)) {
    if (digest.userId !== userId || !digest.coverage?.length || digest.readMarkedAt) continue;
    if (!best || digest.createdAt > best.createdAt) best = digest;
  }
  return best;
}

/**
 * The digest currently gating the queue, if any.
 *
 * Only the newest digest by creation time can gate. Judging "is anything open"
 * across the whole history would let one pre-`closedAt` digest — or any row a
 * crash left half-written — jam the queue permanently; judging only the newest
 * means the state converges the moment one more step is built or closed.
 */
export async function openDigest(userId: string): Promise<PeriodDigest | undefined> {
  const store = await load();
  let newest: PeriodDigest | undefined;
  for (const digest of Object.values(store.digests)) {
    if (digest.userId !== userId) continue;
    if (!newest || digest.createdAt > newest.createdAt) newest = digest;
  }
  return newest && newest.coverage?.length && !newest.closedAt ? newest : undefined;
}

/**
 * Close every open digest a person has, and return how many that was.
 *
 * Called when /digest moves on: typing the command while a step sits open is
 * an answer to it — "next" — and it also sweeps up any older strays so the
 * store converges instead of accumulating open rows forever.
 */
export async function closeOpenDigests(userId: string): Promise<number> {
  return mutate((store) => {
    const now = new Date().toISOString();
    let closed = 0;
    for (const digest of Object.values(store.digests)) {
      if (digest.userId !== userId || digest.closedAt || !digest.coverage?.length) continue;
      digest.closedAt = now;
      closed += 1;
    }
    return closed;
  });
}

/* ------------------------------- watermark ------------------------------- */

/** The last post already summarised, so collection never re-reads the same window. */
export async function getWatermark(userId: string): Promise<string | undefined> {
  return (await load()).watermarks[userId];
}

export async function setWatermark(userId: string, iso: string): Promise<void> {
  await mutate((store) => {
    store.watermarks[userId] = iso;
  });
}

/** Per channel, the highest message id already digested. Empty before the first run. */
export async function getMarks(userId: string): Promise<Record<string, number>> {
  return (await load()).marks[userId] || {};
}

/**
 * Move each channel's mark forward to what a digest covered.
 *
 * Forward only. `/digest 72` deliberately re-reads a window that is already
 * behind the marks, and letting that rewind them would make the same posts
 * eligible again on every subsequent run — the re-read is meant to be a second
 * look, not a reset.
 */
export async function advanceMarks(userId: string, coverage: ChannelCoverage[]): Promise<void> {
  if (coverage.length === 0) return;
  await mutate((store) => {
    const mine = store.marks[userId] || (store.marks[userId] = {});
    for (const { channelId, maxMessageId } of coverage) {
      if (!(mine[channelId] >= maxMessageId)) mine[channelId] = maxMessageId;
    }
  });
}

/* -------------------------------- topics --------------------------------- */

export async function getTopics(userId: string): Promise<string[]> {
  return (await load()).topics[userId] || [];
}

/**
 * Set the subjects, and discard every automatic verdict.
 *
 * The verdicts answered "does this channel cover those subjects", and after
 * this call there are different subjects — so they are not stale, they are
 * about a question nobody asked. Keeping them would silently filter against
 * the old list. The person's own include/exclude decisions stay.
 */
export async function setTopics(userId: string, topics: string[]): Promise<void> {
  await mutate((store) => {
    if (topics.length === 0) delete store.topics[userId];
    else store.topics[userId] = topics;
    delete store.verdicts[userId];
  });
}

export async function getVerdicts(userId: string): Promise<Record<string, ChannelVerdict>> {
  return (await load()).verdicts[userId] || {};
}

export async function setVerdicts(
  userId: string,
  verdicts: Record<string, ChannelVerdict>
): Promise<void> {
  await mutate((store) => {
    store.verdicts[userId] = { ...(store.verdicts[userId] || {}), ...verdicts };
  });
}

export async function getOverrides(userId: string): Promise<Record<string, "include" | "exclude">> {
  return (await load()).overrides[userId] || {};
}

export async function setOverride(
  userId: string,
  channelId: string,
  choice: "include" | "exclude" | null
): Promise<void> {
  await mutate((store) => {
    const mine = store.overrides[userId] || (store.overrides[userId] = {});
    if (choice === null) delete mine[channelId];
    else mine[channelId] = choice;
  });
}

/**
 * Which channels a digest may read.
 *
 * `null` means no filtering at all — no subjects were asked for, so everything
 * counts. Otherwise the rules, in the order they win:
 *
 *   1. What the person said themselves, either way.
 *   2. What triage decided.
 *   3. Nothing known yet — read it.
 *
 * The third is what keeps a newly joined channel from being invisible. Erring
 * towards reading is the cheap mistake: a channel wrongly let in costs one
 * digest of noise and is then judged, whereas one wrongly kept out produces no
 * evidence of itself at all.
 */
export type ChannelFilter = (channelId: string) => boolean;

export async function allowedChannels(userId: string): Promise<ChannelFilter | null> {
  const store = await load();
  const topics = store.topics[userId];
  const overrides = store.overrides[userId] || {};
  const verdicts = store.verdicts[userId] || {};
  const filtering = Boolean(topics && topics.length > 0);

  // Without subjects there is nothing to filter against — but an explicit
  // exclusion is a decision in its own right and still holds.
  if (!filtering && Object.keys(overrides).length === 0) return null;

  return (channelId: string) => {
    const override = overrides[channelId];
    if (override) return override === "include";
    if (!filtering) return true;
    const verdict = verdicts[channelId];
    return verdict ? verdict.onTopic : true;
  };
}

/* --------------------------------- billing ---------------------------------- */

export async function linkStripeCustomer(customerId: string, userId: string): Promise<void> {
  if (!customerId || !userId) return;
  await mutate((store) => {
    store.stripeCustomers[customerId] = userId;
  });
}

export async function userForStripeCustomer(customerId: string): Promise<string | undefined> {
  if (!customerId) return undefined;
  return (await load()).stripeCustomers[customerId];
}

/** Has this person ever completed a checkout? Survives /forget and reconnects. */
export async function hasStripeCustomer(userId: string): Promise<boolean> {
  return Object.values((await load()).stripeCustomers).includes(userId);
}

/* --------------------------------- names ----------------------------------- */

/**
 * Remember what to call someone. Called on every message, so the no-change
 * case reads without writing — the store must not be re-serialised each time
 * a person says «дальше».
 */
export async function setName(userId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  if ((await load()).names[userId] === trimmed) return;
  await mutate((store) => {
    store.names[userId] = trimmed;
  });
}

export async function getNames(): Promise<Record<string, string>> {
  return (await load()).names;
}

/* ------------------------------- suspensions ------------------------------- */

export async function isSuspended(userId: string): Promise<boolean> {
  return Boolean((await load()).suspensions[userId]);
}

/** Flip one person's access. Returns false when it was already in that state. */
export async function setSuspension(userId: string, suspended: boolean): Promise<boolean> {
  return mutate((store) => {
    const already = Boolean(store.suspensions[userId]);
    if (suspended === already) return false;
    if (suspended) store.suspensions[userId] = new Date().toISOString();
    else delete store.suspensions[userId];
    return true;
  });
}

export async function getSuspensions(): Promise<Record<string, string>> {
  return (await load()).suspensions;
}

/* --------------------------------- focus ---------------------------------- */

export async function getFocus(userId: string): Promise<string> {
  return (await load()).focuses[userId] || "";
}

/** Empty text clears it. Like topics and overrides, /forget leaves it alone. */
export async function setFocus(userId: string, text: string): Promise<void> {
  await mutate((store) => {
    const trimmed = text.trim();
    if (trimmed) store.focuses[userId] = trimmed;
    else delete store.focuses[userId];
  });
}

/* ------------------------------ MCP tokens -------------------------------- */

/**
 * The token that lets this person's Claude read their digests over MCP.
 *
 * One per user, created on first ask and stable after that — the person pastes
 * it into claude.ai once, and regenerating it on every /mcp would break the
 * connector they already saved. Rotation is deliberate: /mcp new deletes the
 * old token and mints another, which is the revocation story for a leaked URL.
 */
export async function getOrCreateMcpToken(userId: string): Promise<string> {
  return mutate((store) => {
    for (const [token, owner] of Object.entries(store.mcpTokens)) {
      if (owner === userId) return token;
    }
    const token = crypto.randomBytes(24).toString("base64url");
    store.mcpTokens[token] = userId;
    return token;
  });
}

export async function rotateMcpToken(userId: string): Promise<string> {
  return mutate((store) => {
    for (const [token, owner] of Object.entries(store.mcpTokens)) {
      if (owner === userId) delete store.mcpTokens[token];
    }
    const token = crypto.randomBytes(24).toString("base64url");
    store.mcpTokens[token] = userId;
    return token;
  });
}

export async function userForMcpToken(token: string): Promise<string | undefined> {
  if (!token) return undefined;
  return (await load()).mcpTokens[token];
}

/* --------------------------------- chat ---------------------------------- */

export async function getChat(userId: string): Promise<{ role: "user" | "assistant"; content: string }[]> {
  return (await load()).chats[userId] || [];
}

export async function appendChat(
  userId: string,
  turns: { role: "user" | "assistant"; content: string }[]
): Promise<void> {
  await mutate((store) => {
    store.chats[userId] = [...(store.chats[userId] || []), ...turns].slice(-MAX_CHAT_TURNS);
  });
}

export async function clearChat(userId: string): Promise<void> {
  await mutate((store) => {
    delete store.chats[userId];
  });
}
