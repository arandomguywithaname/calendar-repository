/** Supported messaging apps the reader can pull from */
export type AppId = "telegram" | "whatsapp" | "slack";

export interface Chat {
  id: string; // unique within the app
  app: AppId;
  title: string;
  kind: "dm" | "group" | "channel";
  unreadCount: number;
  lastActivity: string; // ISO 8601
}

export interface Message {
  id: string;
  app: AppId;
  chatId: string;
  chatTitle: string;
  sender: string;
  text: string;
  timestamp: string; // ISO 8601
  unread: boolean;
}

/** A source of chats and messages — one per app */
export interface Connector {
  app: AppId;
  label: string;
  /** True when real credentials are configured; false means demo data */
  isLive(): boolean;
  /** Why the connector is in demo mode, or how it gets its data */
  status(): string;
  listChats(): Promise<Chat[]>;
  fetchMessages(chatIds: string[], limit: number): Promise<Message[]>;
}

/** What the user picked on the dashboard */
export interface Preferences {
  apps: AppId[];
  chatIds: string[]; // "<app>:<chatId>", empty means "everything in the selected apps"
  unreadOnly: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  createdAt: string;
  provider: "google" | "demo";
  preferences: Preferences;
}

/** One chat's slice of the AI digest */
export interface ChatDigest {
  key: string; // "<app>:<chatId>"
  app: string;
  title: string;
  summary: string;
  urgency: "high" | "normal" | "low";
  actionItems: string[];
}

export interface Digest {
  headline: string;
  needsYouNow: string[];
  chats: ChatDigest[];
}

export interface AskTurn {
  role: "user" | "assistant";
  content: string;
}
