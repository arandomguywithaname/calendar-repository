import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { AppId, AskTurn, Chat, Message, Preferences, User } from "./types";

/**
 * File-backed store. Everything the reader needs to survive a restart lives
 * here: accounts, per-account preferences, ask-the-AI history, and the
 * messages pushed in by webhooks or polled from the Telegram Bot API.
 */
interface StoreShape {
  users: Record<string, User>;
  emailIndex: Record<string, string>; // lowercased email -> user id
  conversations: Record<string, AskTurn[]>; // user id -> ask history
  telegram: { offset: number; chats: Record<string, Chat>; messages: Message[] };
  whatsapp: { chats: Record<string, Chat>; messages: Message[] };
}

const STORE_PATH = path.resolve(__dirname, "../../data/reader-store.json");
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

let cache: StoreShape | null = null;

function load(): StoreShape {
  if (cache) return cache;
  if (fs.existsSync(STORE_PATH)) {
    try {
      cache = { ...emptyStore(), ...JSON.parse(fs.readFileSync(STORE_PATH, "utf-8")) };
      return cache!;
    } catch (err: any) {
      console.warn(`Could not read ${STORE_PATH} (${err.message}) — starting fresh.`);
    }
  }
  cache = emptyStore();
  return cache;
}

function save(): void {
  const store = load();
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

/** Find an account by email, or create one on first sign-in */
export function upsertUser(input: {
  email: string;
  name: string;
  picture?: string;
  provider: "google" | "demo";
}): User {
  const store = load();
  const key = input.email.toLowerCase();
  const existingId = store.emailIndex[key];

  if (existingId && store.users[existingId]) {
    const user = store.users[existingId];
    user.name = input.name || user.name;
    if (input.picture) user.picture = input.picture;
    save();
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
  save();
  return user;
}

export function getUser(id: string): User | undefined {
  return load().users[id];
}

export function setPreferences(userId: string, preferences: Preferences): User | undefined {
  const user = load().users[userId];
  if (!user) return undefined;
  user.preferences = preferences;
  save();
  return user;
}

export function getConversation(userId: string): AskTurn[] {
  return load().conversations[userId] || [];
}

export function appendConversation(userId: string, turns: AskTurn[]): void {
  const store = load();
  const history = [...(store.conversations[userId] || []), ...turns];
  store.conversations[userId] = history.slice(-MAX_ASK_TURNS);
  save();
}

export function clearConversation(userId: string): void {
  const store = load();
  delete store.conversations[userId];
  save();
}

/* ---------------------------------------------------------------------------
 * Inbound message storage — Telegram polling and the WhatsApp webhook both
 * land here. Slack is queried live, so it has no local buffer.
 * ------------------------------------------------------------------------- */

type BufferedApp = Extract<AppId, "telegram" | "whatsapp">;

export function recordMessages(app: BufferedApp, chats: Chat[], messages: Message[]): void {
  const store = load();
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
  save();
}

export function bufferedChats(app: BufferedApp): Chat[] {
  return Object.values(load()[app].chats);
}

export function bufferedMessages(app: BufferedApp): Message[] {
  return load()[app].messages;
}

/** Mark every buffered message in these chats as read */
export function markRead(app: BufferedApp, chatIds: string[]): void {
  const store = load();
  const bucket = store[app];
  const targets = new Set(chatIds);
  for (const message of bucket.messages) {
    if (targets.has(message.chatId)) message.unread = false;
  }
  for (const id of targets) {
    if (bucket.chats[id]) bucket.chats[id].unreadCount = 0;
  }
  save();
}

export function getTelegramOffset(): number {
  return load().telegram.offset;
}

export function setTelegramOffset(offset: number): void {
  load().telegram.offset = offset;
  save();
}
