import { Channel, Post, TelegramAccount } from "./types";

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
 * Posts published after `since`, across the account's channels.
 *
 * Bounded twice — per channel and overall — because a digest window covering a
 * hundred busy channels would otherwise pull far more than any summariser needs
 * to establish what happened.
 *
 * Message fetching is concurrent with a limit to balance speed against rate-limiting.
 * Sequential fetching times out badly with 50+ channels (1-2s per channel = 50-100s stall).
 */
export async function collectPosts(
  account: TelegramAccount,
  since: Date,
  options: { perChannel?: number; total?: number } = {}
): Promise<{ posts: Post[]; channels: Channel[] }> {
  const perChannel = options.perChannel ?? 40;
  const total = options.total ?? 600;
  const concurrency = 5; // Fetch from 5 channels at once

  const client = await connect(account);
  try {
    const dialogs = await client.getDialogs({ limit: 200 });
    const wanted = new Set(account.channelIds || []);
    const channels: Channel[] = [];
    const posts: Post[] = [];

    // Collect all channels first, then fetch messages concurrently
    const channelsToFetch: Array<{ entity: any; channel: Channel }> = [];
    for (const dialog of dialogs) {
      const entity: any = dialog.entity;
      if (!entity || entity.className !== "Channel" || !entity.broadcast) continue;

      const channelId = idOf(entity.id);
      if (wanted.size > 0 && !wanted.has(channelId)) continue;

      const channel: Channel = {
        id: channelId,
        title: entity.title || "(untitled channel)",
        username: entity.username || undefined,
      };
      channels.push(channel);
      channelsToFetch.push({ entity, channel });
    }

    // Fetch messages from channels concurrently with a limit
    const fetched = await promiseConcurrent(
      channelsToFetch,
      async ({ entity, channel }) => {
        const messages = await client.getMessages(entity, { limit: perChannel });
        return { channel, messages: messages as any[] };
      },
      concurrency
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
    return { posts: posts.slice(-total), channels };
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

/* --------------------------------- login --------------------------------- */

/**
 * Telegram's login is a conversation: phone, then a code it sends, sometimes
 * then a 2FA password. A chat interface can't block inside one call waiting for
 * each answer, so the flow is split — `startLogin` leaves a client connected and
 * awaiting the code, `completeLogin` finishes it and returns the session string.
 */
const pending = new Map<string, { client: any; phoneCodeHash: string; phone: string; at: number }>();
const LOGIN_TTL_MS = 10 * 60 * 1000;

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
): Promise<void> {
  sweep();
  // A second /connect must not strand the first attempt's open socket.
  await cancelLogin(userId);

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

  pending.set(userId, { client, phoneCodeHash: sent.phoneCodeHash, phone, at: Date.now() });
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
