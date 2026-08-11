import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { AppId, AskTurn, Chat, Message, Preferences, User } from "./types";

/**
 * Everything the reader needs to survive a restart: accounts, per-account
 * preferences, ask-the-AI history, and the messages pushed in by webhooks or
 * polled from the Telegram Bot API.
 *
 * Two backends. Locally it's a JSON file. On Netlify the filesystem is
 * ephemeral and per-invocation, so it's Netlify Blobs instead. Both are async
 * and neither caches between calls — a serverless container can be reused, and
 * a cached copy there would serve one user another user's stale state.
 */
interface StoreShape {
  users: Record<string, User>;
  emailIndex: Record<string, string>; // lowercased email -> user id
  conversations: Record<string, AskTurn[]>; // user id -> ask history
  telegram: { offset: number; chats: Record<string, Chat>; messages: Message[] };
  whatsapp: { chats: Record<string, Chat>; messages: Message[] };
}

const STORE_PATH = path.resolve(__dirname, "../../data/reader-store.json");
const BLOB_STORE = "inbox-reader";
const BLOB_KEY = "store";
const MAX_MESSAGES_PER_APP = 2000;
const MAX_ASK_TURNS = 20;

const DEFAULT_PREFERENCES: Preferences = {
  apps: ["telegram", "whatsapp", "slack"],
  chatIds: [],
  unreadOnly: false,
};

function emptyStore(): StoreShape {
  return {
    users: {},
    emailIndex: {},
    conversations: {},
    telegram: { offset: 0, chats: {}, messages: [] },
    whatsapp: { chats: {}, messages: [] },
  };
}

interface Backend {
  read(): Promise<StoreShape | null>;
  write(store: StoreShape): Promise<void>;
}

const fileBackend: Backend = {
  async read() {
    if (!fs.existsSync(STORE_PATH)) return null;
    try {
      return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8")) as StoreShape;
    } catch (err: any) {
      console.warn(`Could not read ${STORE_PATH} (${err.message}) — starting fresh.`);
      return null;
    }
  },
  async write(store) {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
  },
};

const blobBackend: Backend = {
  async read() {
    const { getStore } = await import("@netlify/blobs");
    return (await getStore(BLOB_STORE).get(BLOB_KEY, { type: "json" })) as StoreShape | null;
  },
  async write(store) {
    const { getStore } = await import("@netlify/blobs");
    await getStore(BLOB_STORE).setJSON(BLOB_KEY, store);
  },
};

/** Netlify sets NETLIFY in the functions runtime; the blobs context follows it. */
function backend(): Backend {
  return process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT ? blobBackend : fileBackend;
}

async function load(): Promise<StoreShape> {
  const stored = await backend().read();
  return stored ? { ...emptyStore(), ...stored } : emptyStore();
}

async function save(store: StoreShape): Promise<void> {
  await backend().write(store);
}

/** Read, mutate, write. Note this is last-write-wins across concurrent calls. */
async function mutate<T>(fn: (store: StoreShape) => T): Promise<T> {
  const store = await load();
  const result = fn(store);
  await save(store);
  return result;
}

/** Find an account by email, or create one on first sign-in */
export async function upsertUser(input: {
  email: string;
  name: string;
  picture?: string;
  provider: "google" | "demo";
}): Promise<User> {
  return mutate((store) => {
    const key = input.email.toLowerCase();
    const existingId = store.emailIndex[key];

    if (existingId && store.users[existingId]) {
      const user = store.users[existingId];
      user.name = input.name || user.name;
      if (input.picture) user.picture = input.picture;
      return user;
    }

    const user: User = {
      id: crypto.randomUUID(),
      email: input.email,
      name: input.name || input.email.split("@")[0],
      picture: input.picture,
      createdAt: new Date().toISOString(),
      provider: input.provider,
      preferences: { ...DEFAULT_PREFERENCES },
    };
    store.users[user.id] = user;
    store.emailIndex[key] = user.id;
    return user;
  });
}

export async function getUser(id: string): Promise<User | undefined> {
  return (await load()).users[id];
}

export async function setPreferences(
  userId: string,
  preferences: Preferences
): Promise<User | undefined> {
  return mutate((store) => {
    const user = store.users[userId];
    if (!user) return undefined;
    user.preferences = preferences;
    return user;
  });
}

export async function getConversation(userId: string): Promise<AskTurn[]> {
  return (await load()).conversations[userId] || [];
}

export async function appendConversation(userId: string, turns: AskTurn[]): Promise<void> {
  await mutate((store) => {
    const history = [...(store.conversations[userId] || []), ...turns];
    store.conversations[userId] = history.slice(-MAX_ASK_TURNS);
  });
}

export async function clearConversation(userId: string): Promise<void> {
  await mutate((store) => {
    delete store.conversations[userId];
  });
}

/* ---------------------------------------------------------------------------
 * Inbound message storage — Telegram polling and the WhatsApp webhook both
 * land here. Slack is queried live, so it has no local buffer.
 * ------------------------------------------------------------------------- */

type BufferedApp = Extract<AppId, "telegram" | "whatsapp">;

export async function recordMessages(
  app: BufferedApp,
  chats: Chat[],
  messages: Message[]
): Promise<void> {
  await mutate((store) => {
    const bucket = store[app];

    for (const chat of chats) {
      const previous = bucket.chats[chat.id];
      bucket.chats[chat.id] = {
        ...chat,
        unreadCount: (previous?.unreadCount || 0) + chat.unreadCount,
      };
    }

    const known = new Set(bucket.messages.map((m) => m.id));
    for (const message of messages) {
      if (!known.has(message.id)) bucket.messages.push(message);
    }
    bucket.messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    bucket.messages = bucket.messages.slice(-MAX_MESSAGES_PER_APP);
  });
}

export async function bufferedChats(app: BufferedApp): Promise<Chat[]> {
  return Object.values((await load())[app].chats);
}

export async function bufferedMessages(app: BufferedApp): Promise<Message[]> {
  return (await load())[app].messages;
}

/** Mark every buffered message in these chats as read */
export async function markRead(app: BufferedApp, chatIds: string[]): Promise<void> {
  await mutate((store) => {
    const bucket = store[app];
    const targets = new Set(chatIds);
    for (const message of bucket.messages) {
      if (targets.has(message.chatId)) message.unread = false;
    }
    for (const id of targets) {
      if (bucket.chats[id]) bucket.chats[id].unreadCount = 0;
    }
  });
}

export async function getTelegramOffset(): Promise<number> {
  return (await load()).telegram.offset;
}

export async function setTelegramOffset(offset: number): Promise<void> {
  await mutate((store) => {
    store.telegram.offset = offset;
  });
}
