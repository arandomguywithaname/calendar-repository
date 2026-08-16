import { Channel, ChannelCoverage, Post, TelegramAccount } from "./types";
import QRCode from "qrcode";

/**
 * Reading the channels a person follows.
 *
 * This uses MTProto (a user client) rather than the Bot API, and that choice is
 * forced rather than preferred: a bot can only ever see channels where it has
 * been made an admin, so it cannot read a channel you merely follow. Since the
 * requirement is "the channels available to this user", signing in as the user
 * is the only mechanism Telegram offers.
 *
 * The session string that login produces is the durable credential; the phone
 * code is needed once, never again.
 */

/** Loaded lazily so the module can be imported where MTProto isn't installed. */
async function mtproto() {
  const { TelegramClient, Api } = await import("teleproto");
  const { StringSession } = await import("teleproto/sessions");
  return { TelegramClient, Api, StringSession };
}

async function connect(account: TelegramAccount) {
  const { TelegramClient, StringSession } = await mtproto();
  const client = new TelegramClient(
    new StringSession(account.session),
    account.apiId,
    account.apiHash,
    { connectionRetries: 3 }
  );
  await client.connect();
  return client;
}

/** Telegram ids exceed what a JS number holds exactly, so they stay strings. */
function idOf(value: unknown): string {
  return String(value);
}

/**
 * Ceiling on a single channel's history request.
 *
 * A channel that has been left unread for months would otherwise be asked for
 * its entire backlog in one call, and the run would stall on it. Hitting this
 * ceiling is not a loss: the mark advances to what was read, so the remainder
 * is simply first in line next time.
 */
const MAX_PER_CHANNEL = 200;

/** Every broadcast channel the account follows. */
export async function listChannels(account: TelegramAccount): Promise<Channel[]> {
  const client = await connect(account);
  try {
    const dialogs = await client.getDialogs({ limit: 200 });
    const channels: Channel[] = [];

    for (const dialog of dialogs) {
      const entity: any = dialog.entity;
      // `broadcast` distinguishes a channel from a supergroup, which is the
      // same MTProto type with a different flag.
      if (!entity || entity.className !== "Channel" || !entity.broadcast) continue;
      channels.push({
        id: idOf(entity.id),
        title: entity.title || "(untitled channel)",
        username: entity.username || undefined,
      });
    }
    return channels;
  } finally {
    await client.disconnect();
  }
}

/**
 * A handful of recent posts from every channel, enough to tell what it is about.
 *
 * This is what makes judging fifty channels affordable: subject matter shows in
 * a few posts, so triage reads five each instead of the thirty-five a digest
 * takes, and asks the model once rather than once per channel. Each sample is
 * cut short for the same reason — the opening of a post says what it concerns,
 * and nothing beyond that is needed to place the channel.
 */
export async function sampleChannels(
  account: TelegramAccount,
  options: { perChannel?: number; sampleChars?: number; only?: Set<string> } = {}
): Promise<{ channel: Channel; samples: string[] }[]> {
  const perChannel = options.perChannel ?? 5;
  const sampleChars = options.sampleChars ?? 300;

  const client = await connect(account);
  try {
    const dialogs = await client.getDialogs({ limit: 200 });
    const targets: { entity: any; channel: Channel }[] = [];

    for (const dialog of dialogs) {
      const entity: any = dialog.entity;
      if (!entity || entity.className !== "Channel" || !entity.broadcast) continue;
      if (options.only && !options.only.has(idOf(entity.id))) continue;
      targets.push({
        entity,
        channel: {
          id: idOf(entity.id),
          title: entity.title || "(untitled channel)",
          username: entity.username || undefined,
        },
      });
    }

    return promiseConcurrent(
      targets,
      async ({ entity, channel }) => {
        const messages = (await client.getMessages(entity, { limit: perChannel })) as any[];
        const samples = messages
          .map((m) => String(m?.message || "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .map((text) => (text.length > sampleChars ? `${text.slice(0, sampleChars)}…` : text));
        return { channel, samples };
      },
      12
    );
  } finally {
    await client.disconnect();
  }
}

/**
 * The oldest unread stretch of every channel, reading upward.
 *
 * This is the queue's collector, and its geometry is the point. Reading
 * newest-first — what `collectPosts` below does — cannot be reconciled with a
 * per-channel mark that promises "everything below this is accounted for":
 * any cap or trim keeps the newest posts, the mark advances to the top, and
 * whatever sat between quietly falls below it. Reading oldest-first makes the
 * promise true by construction — everything a cap postpones is *above* what
 * was read, and is simply first in line next time.
 *
 * Each channel's position is its stored mark, or Telegram's own read pointer
 * (`readInboxMaxId`) on first contact — the person's "I've read to here" is
 * the honest place to start a queue of their unread. There is no time filter:
 * the position bounds the window in ids, however old the backlog is.
 *
 * Alongside the text posts, the caller gets every fetched message id with a
 * has-text flag, ascending. Marks cannot advance on kept posts alone: a
 * stretch of photo-only messages contains nothing to summarise, and a mark
 * that refused to cross it would refetch the same stretch on every run,
 * forever. Seen-and-textless is covered; the caller walks the flags to find
 * how far that holds.
 */
export interface QueueChannelFetch {
  channel: Channel;
  /** Where this channel's queue stood before the fetch. */
  position: number;
  /** Every message fetched, ascending by id, text or not. */
  messages: { id: number; hasText: boolean }[];
}

export async function collectQueue(
  account: TelegramAccount,
  options: {
    marks?: Record<string, number>;
    allowed?: (channelId: string) => boolean;
    perChannel?: number;
  } = {}
): Promise<{
  posts: Post[];
  channels: Channel[];
  fetched: QueueChannelFetch[];
  silent: number;
  filtered: number;
  /** ≈ posts still above what this call reached, across the allowed channels. */
  backlog: number;
}> {
  const perChannel = options.perChannel ?? MAX_PER_CHANNEL;
  const marks = options.marks || {};
  const allowed = options.allowed;

  const client = await connect(account);
  try {
    const dialogs = await client.getDialogs({ limit: 200 });
    const wanted = new Set(account.channelIds || []);
    let silent = 0;
    let filtered = 0;

    const targets: { entity: any; channel: Channel; position: number; newest: number }[] = [];
    for (const dialog of dialogs) {
      const entity: any = dialog.entity;
      if (!entity || entity.className !== "Channel" || !entity.broadcast) continue;

      const channelId = idOf(entity.id);
      if (wanted.size > 0 && !wanted.has(channelId)) continue;
      if (allowed && !allowed(channelId)) {
        filtered += 1;
        continue;
      }

      const newest: number = dialog.dialog?.topMessage ?? 0;
      const readUpTo: number = dialog.dialog?.readInboxMaxId ?? 0;
      // A read pointer of zero with a deep channel would mean "queue its entire
      // history" — years of posts the person never treated as unread. Backstop
      // the first contact to one fetch's worth instead of paging through it.
      const position = marks[channelId] ?? (readUpTo > 0 ? readUpTo : Math.max(0, newest - perChannel));

      if (newest <= position) {
        silent += 1;
        continue;
      }

      targets.push({
        entity,
        channel: {
          id: channelId,
          title: entity.title || "(untitled channel)",
          username: entity.username || undefined,
        },
        position,
        newest,
      });
    }

    const results = await promiseConcurrent(
      targets,
      async ({ entity, channel, position, newest }) => {
        // `reverse` flips the walk to oldest-first, and with it `minId` becomes
        // the exclusive starting offset — so this reads upward from just above
        // the position, which is the only direction the marks stay honest in.
        const raw = (await client.getMessages(entity, {
          limit: Math.min(perChannel, newest - position),
          minId: position,
          reverse: true,
        })) as any[];

        const ascending = raw.filter((m) => typeof m?.id === "number").sort((a, b) => a.id - b.id);
        const messages = ascending.map((m) => ({
          id: m.id as number,
          hasText: Boolean(String(m?.message || "").trim()),
        }));
        const posts: Post[] = ascending
          .filter((m) => String(m?.message || "").trim())
          .map((m) => ({
            id: `${channel.id}:${m.id}`,
            channelId: channel.id,
            channelTitle: channel.title,
            messageId: m.id,
            text: String(m.message),
            date: new Date((m.date || 0) * 1000).toISOString(),
          }));

        const reached = messages.length ? messages[messages.length - 1].id : position;
        return { channel, position, messages, posts, remaining: Math.max(0, newest - reached) };
      },
      12
    );

    const posts: Post[] = [];
    const channels: Channel[] = [];
    const fetched: QueueChannelFetch[] = [];
    let backlog = 0;

    for (const entry of results) {
      channels.push(entry.channel);
      fetched.push({ channel: entry.channel, position: entry.position, messages: entry.messages });
      posts.push(...entry.posts);
      // Ids are not dense, so the id gap overstates what is left — an estimate
      // to show a person, never a boundary to act on.
      backlog += entry.remaining;
    }

    posts.sort((a, b) => a.date.localeCompare(b.date));
    return { posts, channels, fetched, silent, filtered, backlog };
  } finally {
    await client.disconnect();
  }
}

/**
 * Posts published after `since`, across the account's channels, newest-first.
 *
 * This is the second-look collector: it serves `/digest 24`-style re-reads of
 * a recent window, where the person wants the freshest material and the marks
 * are deliberately not consulted or advanced. The queue's collector above is
 * the one whose reading order the marks depend on.
 *
 * Bounded twice — per channel and overall — because a digest window covering a
 * hundred busy channels would otherwise pull far more than any summariser needs
 * to establish what happened. Fetching is concurrent with a limit; sequential
 * fetching stalls badly at 50+ channels.
 */
export async function collectPosts(
  account: TelegramAccount,
  since: Date,
  options: {
    perChannel?: number;
    total?: number;
    marks?: Record<string, number>;
    allowed?: (channelId: string) => boolean;
  } = {}
): Promise<{ posts: Post[]; channels: Channel[]; silent: number; filtered: number }> {
  const perChannel = options.perChannel ?? 40;
  const total = options.total ?? 600;
  const marks = options.marks || {};
  const allowed = options.allowed;

  const client = await connect(account);
  try {
    const dialogs = await client.getDialogs({ limit: 200 });
    const wanted = new Set(account.channelIds || []);
    const channels: Channel[] = [];
    const posts: Post[] = [];
    let silent = 0;
    let filtered = 0;

    // Collect all channels first, then fetch messages concurrently
    const channelsToFetch: Array<{ entity: any; channel: Channel; mark?: number; limit: number }> = [];
    for (const dialog of dialogs) {
      const entity: any = dialog.entity;
      if (!entity || entity.className !== "Channel" || !entity.broadcast) continue;

      const channelId = idOf(entity.id);
      if (wanted.size > 0 && !wanted.has(channelId)) continue;

      // Off-subject channels cost nothing here: the decision was made once, on
      // a sample, and is reused until the subjects change or it is re-examined.
      if (allowed && !allowed(channelId)) {
        filtered += 1;
        continue;
      }

      const channel: Channel = {
        id: channelId,
        title: entity.title || "(untitled channel)",
        username: entity.username || undefined,
      };

      const mark = marks[channelId];
      // `topMessage` rides along with the dialog list, so this comparison is
      // free — it is the difference between asking fifty channels what is new
      // and asking only the handful that have anything to say.
      const newest: number | undefined = dialog.dialog?.topMessage;
      if (mark !== undefined && newest !== undefined && newest <= mark) {
        silent += 1;
        continue;
      }

      // Ids are not dense — deletions and service messages leave holes — so the
      // gap between the mark and the newest id overstates how much is waiting.
      // Overstating is the safe direction: asking for more than exists costs
      // nothing, whereas asking for too few drops posts that were never read.
      const outstanding = mark !== undefined && newest !== undefined ? newest - mark : perChannel;
      const limit = Math.min(MAX_PER_CHANNEL, Math.max(perChannel, outstanding));

      channels.push(channel);
      channelsToFetch.push({ entity, channel, mark, limit });
    }

    // Fetch messages from channels concurrently with a limit
    const fetched = await promiseConcurrent(
      channelsToFetch,
      async ({ entity, channel, mark, limit }) => {
        const messages = await client.getMessages(entity, {
          limit,
          // Excludes everything at or below the mark server-side, so already
          // digested messages are never sent over the wire a second time.
          ...(mark !== undefined ? { minId: mark } : {}),
        });
        return { channel, messages: messages as any[] };
      },
      12  // Increased from 5 to 12 for ultra-fast mode
    );

    // Collect posts from all fetched results
    for (const { channel, messages } of fetched) {
      for (const message of messages) {
        const text: string = message?.message || "";
        if (!text.trim()) continue;

        const date = new Date((message.date || 0) * 1000);
        if (date <= since) continue;

        posts.push({
          id: `${channel.id}:${message.id}`,
          channelId: channel.id,
          channelTitle: channel.title,
          messageId: message.id,
          text,
          date: date.toISOString(),
        });
      }

      if (posts.length >= total) break;
    }

    posts.sort((a, b) => a.date.localeCompare(b.date));
    return { posts: posts.slice(-total), channels, silent, filtered };
  } finally {
    await client.disconnect();
  }
}

/**
 * Run async operations on items with concurrency limit.
 * Processes items in batches up to the limit, in parallel.
 */
function promiseConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number
): Promise<R[]> {
  return new Promise((resolve, reject) => {
    const results: R[] = [];
    let index = 0;
    let active = 0;

    const next = () => {
      while (active < limit && index < items.length) {
        const i = index++;
        active++;
        fn(items[i])
          .then((result) => {
            results[i] = result;
            active--;
            next();
          })
          .catch(reject);
      }
      if (active === 0 && index === items.length) {
        resolve(results);
      }
    };

    next();
  });
}

/* ------------------------------- marking read ----------------------------- */

export interface MarkReadOutcome {
  /** Channels whose read pointer this moved. */
  marked: number;
  /** Channels already read past this point, by the person or by an earlier digest. */
  alreadyRead: number;
  /** Channels named in the coverage that the account no longer follows. */
  gone: number;
}

/**
 * Move Telegram's own read pointer up to what a digest covered.
 *
 * The one place in this program that writes read state, and it runs only when
 * somebody presses the button. Reading never marks anything: `getMessages` is
 * `messages.getHistory`, which leaves the pointer alone, so the bot can work
 * through channels without touching the unread badges on someone's phone.
 *
 * The pointer is a high-water mark rather than a range — `channels.readHistory`
 * marks everything up to an id — so this cannot mark a middle section and leave
 * older posts unread. Two consequences worth knowing: accepting a digest also
 * clears anything older in those channels, and asking for a lower id than the
 * pointer already holds does nothing at all, which is why that case is counted
 * and reported rather than passed off as success.
 *
 * Only the channels in `coverage` are touched. A channel the digest never
 * opened — filtered out by subject, or quiet — is not something the person has
 * seen, and clearing it would be a lie told on their behalf.
 */
export async function markRead(
  account: TelegramAccount,
  coverage: ChannelCoverage[]
): Promise<MarkReadOutcome> {
  const client = await connect(account);
  try {
    const dialogs = await client.getDialogs({ limit: 200 });
    const known = new Map<string, { entity: any; readUpTo: number }>();
    for (const dialog of dialogs) {
      const entity: any = dialog.entity;
      if (!entity || entity.className !== "Channel" || !entity.broadcast) continue;
      known.set(idOf(entity.id), { entity, readUpTo: dialog.dialog?.readInboxMaxId ?? 0 });
    }

    let marked = 0;
    let alreadyRead = 0;
    let gone = 0;

    for (const { channelId, maxMessageId } of coverage) {
      const target = known.get(channelId);
      if (!target) {
        gone += 1;
        continue;
      }
      // A zero maxId means "all of it" to `readHistory`, so a coverage entry
      // that somehow arrived empty must never reach the wire.
      if (!(maxMessageId > 0) || target.readUpTo >= maxMessageId) {
        alreadyRead += 1;
        continue;
      }
      await client.markAsRead(target.entity, undefined, { maxId: maxMessageId });
      marked += 1;
    }

    return { marked, alreadyRead, gone };
  } finally {
    await client.disconnect();
  }
}

/* --------------------------------- login --------------------------------- */

/**
 * Telegram's login is a conversation: phone, then a code it sends, sometimes
 * then a 2FA password. A chat interface can't block inside one call waiting for
 * each answer, so the flow is split — `startLogin` leaves a client connected and
 * awaiting the code, `completeLogin` finishes it and returns the session string.
 */
const pending = new Map<string, { client: any; phoneCodeHash: string; phone: string; at: number; sendCodeResponse?: any }>();
const qrPending = new Map<
  string,
  { client: any; at: number; token: Buffer; apiId: number; apiHash: string }
>();
const LOGIN_TTL_MS = 10 * 60 * 1000;
/** Shorter than the code flow: a picture on screen is watched, not waited on. */
const QR_TTL_MS = 3 * 60 * 1000;

function sweep() {
  const now = Date.now();
  for (const [key, entry] of pending) {
    if (now - entry.at > LOGIN_TTL_MS) {
      entry.client.disconnect().catch(() => {});
      pending.delete(key);
    }
  }
}

export async function startLogin(
  userId: string,
  apiId: number,
  apiHash: string,
  phone: string
): Promise<{ type: string; nextType?: string; timeout?: number }> {
  sweep();
  // A second /connect must not strand the first attempt's open socket — and an
  // abandoned QR is worse than a stranded socket, because its watcher would
  // still be able to complete a sign-in behind this one.
  await cancelLogin(userId);
  await cancelQrLogin(userId);

  const { TelegramClient, Api, StringSession } = await mtproto();
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 3,
  });
  await client.connect();

  const sent: any = await client.invoke(
    new Api.auth.SendCode({
      phoneNumber: phone,
      apiId,
      apiHash,
      settings: new Api.CodeSettings({}),
    })
  );

  const sendCodeResponse = {
    type: sent.type?.className || "unknown",
    nextType: sent.nextType?.className,
    timeout: sent.timeout,
  };

  console.log(`SendCode response:`, JSON.stringify(sendCodeResponse, null, 2));

  pending.set(userId, { client, phoneCodeHash: sent.phoneCodeHash, phone, at: Date.now(), sendCodeResponse });
  return sendCodeResponse;
}

/**
 * The account's own Telegram id travels back with the session.
 *
 * Telegram ids are global — the number MTProto reports here is the same one the
 * Bot API puts in `from.id` — so this is what lets setup file the owner's
 * session under the identity the bot will later see them as.
 */
export interface CompletedLogin {
  session: string;
  userId: string;
  name: string;
}

export async function completeLogin(
  userId: string,
  code: string,
  password?: string
): Promise<CompletedLogin> {
  sweep();
  const entry = pending.get(userId);
  if (!entry) throw new Error("That login expired — send /connect and start again.");

  const { Api } = await mtproto();
  const { client, phoneCodeHash, phone } = entry;

  try {
    await client.invoke(
      new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash, phoneCode: code })
    );
  } catch (err: any) {
    // Two-step verification: the code was right, but a password is also needed.
    if (/SESSION_PASSWORD_NEEDED/i.test(err?.errorMessage || err?.message || "")) {
      if (!password) {
        throw new Error(
          "This account has two-step verification. Send the code again followed by your password, like: 12345 mypassword"
        );
      }
      await client.signInWithPassword(
        { apiId: 0, apiHash: "" } as any,
        {
          password: async () => password,
          onError: (e: Error) => {
            throw e;
          },
        }
      );
    } else {
      throw err;
    }
  }

  const me: any = await client.getMe();
  const session = String(client.session.save());
  await client.disconnect();
  pending.delete(userId);

  return {
    session,
    userId: idOf(me?.id),
    name: [me?.firstName, me?.lastName].filter(Boolean).join(" ") || "you",
  };
}

/**
 * Run something against a signed-in account, and always close the socket after.
 *
 * Exported because setup needs a client of its own — it talks to BotFather,
 * which is not reading channels and does not belong in this module's other
 * functions.
 */
export async function withClient<T>(account: TelegramAccount, fn: (client: any) => Promise<T>): Promise<T> {
  const client = await connect(account);
  try {
    return await fn(client);
  } finally {
    await client.disconnect().catch(() => {});
  }
}

export function loginPending(userId: string): boolean {
  sweep();
  return pending.has(userId);
}

/**
 * Abandon a half-finished login and close its connection.
 *
 * Without this, /cancel would only clear the bot's idea of the conversation
 * while the collector went on believing a login was in flight — and every
 * subsequent question would be answered with "send me your code".
 */
export async function cancelLogin(userId: string): Promise<void> {
  const entry = pending.get(userId);
  if (!entry) return;
  pending.delete(userId);
  await entry.client.disconnect().catch(() => {});
}

/* --------------------------------- QR login -------------------------------- */

/**
 * Signing in by showing a picture instead of receiving a code.
 *
 * Worth being precise about who does what, because the API names mislead:
 * `auth.exportLoginToken` is called by the *new* client (us) to mint a token,
 * and `auth.acceptLoginToken` is called by the *already signed-in* device that
 * scans the picture — never by us. Our half is to mint the token, draw it, and
 * then keep re-exporting until Telegram answers with an authorisation instead
 * of another token.
 *
 * This exists because the phone-code path can be undeliverable: when Telegram
 * chooses `SentCodeTypeApp` it puts the code inside an existing session, and if
 * that session isn't reachable there is no way to receive it. A QR needs no
 * delivery at all.
 */

export interface QrCode {
  png: Buffer;
  /** What the picture encodes — offered as text so a scan-less client can still use it. */
  url: string;
}

/** A token is short-lived; the picture has to be redrawn when Telegram rotates it. */
function qrUrl(token: Buffer): string {
  return `tg://login?token=${token.toString("base64url")}`;
}

async function renderQr(token: Buffer): Promise<QrCode> {
  const url = qrUrl(token);
  const png = await QRCode.toBuffer(url, { width: 512, margin: 2 });
  return { png, url };
}

export async function startQrLogin(userId: string, apiId: number, apiHash: string): Promise<QrCode> {
  sweep();
  // Neither login flow may leave the other's socket open.
  await cancelLogin(userId);
  await cancelQrLogin(userId);

  const { TelegramClient, Api, StringSession } = await mtproto();
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 3,
  });
  await client.connect();

  const exported: any = await client.invoke(
    new Api.auth.ExportLoginToken({ apiId, apiHash, exceptIds: [] })
  );

  const token = Buffer.from(exported.token);
  qrPending.set(userId, { client, at: Date.now(), token, apiId, apiHash });
  return renderQr(token);
}

async function finishQr(userId: string, authorization: any): Promise<CompletedLogin> {
  const entry = qrPending.get(userId);
  if (!entry) throw new Error("That QR login expired — send /qr and start again.");

  const me: any = authorization?.user || (await entry.client.getMe());
  const session = String(entry.client.session.save());
  await entry.client.disconnect().catch(() => {});
  qrPending.delete(userId);

  return {
    session,
    userId: idOf(me?.id),
    name: [me?.firstName, me?.lastName].filter(Boolean).join(" ") || "you",
  };
}

/**
 * Block until the picture is scanned, redrawing it whenever Telegram rotates
 * the token.
 *
 * `onRefresh` is how the caller keeps the displayed picture current: tokens
 * expire in well under a minute, so a QR sent once and never updated is dead
 * long before anyone gets their other device out.
 */
export async function waitForQrLogin(
  userId: string,
  onRefresh?: (qr: QrCode) => Promise<void>
): Promise<CompletedLogin> {
  const entry = qrPending.get(userId);
  if (!entry) throw new Error("No QR login in progress — send /qr to start one.");

  const { Api } = await mtproto();
  const { client, apiId, apiHash } = entry;
  const deadline = Date.now() + QR_TTL_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    // /cancel drops the entry, a second /qr replaces it. Both mean this watcher
    // is done — checking by identity, not by key, is what stops a superseded
    // watcher from polling its dead client and then, at its own expiry,
    // cancelling the fresh login that replaced it.
    if (qrPending.get(userId) !== entry) throw new Error("QR_CANCELLED");

    let result: any;
    try {
      result = await client.invoke(new Api.auth.ExportLoginToken({ apiId, apiHash, exceptIds: [] }));
    } catch (err: any) {
      const message = err?.errorMessage || err?.message || String(err);
      // The scan succeeded, but the account is behind a second factor. QR
      // carries no way to ask for it, so the phone-code flow has to take over.
      if (/SESSION_PASSWORD_NEEDED/i.test(message)) {
        await cancelQrLogin(userId);
        throw new Error(
          "That account has two-step verification, which I can't finish over QR. Use /connect instead — it asks for the password."
        );
      }
      throw err;
    }

    if (result.className === "auth.LoginTokenSuccess") {
      return finishQr(userId, result.authorization);
    }

    // The account lives on another data centre: move, then present the token
    // there rather than re-minting it.
    if (result.className === "auth.LoginTokenMigrateTo") {
      await client._switchDC(result.dcId);
      const imported: any = await client.invoke(
        new Api.auth.ImportLoginToken({ token: result.token })
      );
      return finishQr(userId, imported?.authorization ?? imported);
    }

    // Still auth.LoginToken — nobody has scanned it yet. Redraw if it rotated.
    const token = Buffer.from(result.token);
    if (!token.equals(entry.token)) {
      entry.token = token;
      if (onRefresh) await onRefresh(await renderQr(token));
    }
  }

  await cancelQrLogin(userId);
  throw new Error("QR_EXPIRED");
}

export function qrLoginPending(userId: string): boolean {
  const entry = qrPending.get(userId);
  if (entry && Date.now() - entry.at > QR_TTL_MS) {
    entry.client.disconnect().catch(() => {});
    qrPending.delete(userId);
    return false;
  }
  return Boolean(entry);
}

export async function cancelQrLogin(userId: string): Promise<void> {
  const entry = qrPending.get(userId);
  if (!entry) return;
  qrPending.delete(userId);
  await entry.client.disconnect().catch(() => {});
}
