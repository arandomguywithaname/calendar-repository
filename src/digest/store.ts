import * as fs from "fs";
import * as path from "path";
import { dataDir } from "./paths";
import { ChannelCoverage, PeriodDigest, TelegramAccount } from "./types";

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
/** Roughly two months of daily digests per person. */
const MAX_DIGESTS_PER_USER = 60;

function empty(): DigestStoreShape {
  return { accounts: {}, digests: {}, chats: {}, watermarks: {}, marks: {} };
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

async function mutate<T>(fn: (store: DigestStoreShape) => T): Promise<T> {
  const store = await load();
  const result = fn(store);
  await save(store);
  return result;
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
