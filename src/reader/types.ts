/** Supported messaging apps the reader can pull from */
export type AppId = "telegram" | "whatsapp" | "slack" | "gmail";

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

/**
 * Credentials belonging to one signed-in account.
 *
 * These live on the user record rather than in the environment, so connecting
 * an app is something a person does by clicking "Connect" — not something the
 * operator does by pasting a token into a deploy. Environment tokens still
 * work and act as a shared fallback for accounts with no connection of their own.
 */
export interface Connections {
  /**
   * A Telegram bot token from @BotFather. Pasted rather than granted: Telegram
   * has no OAuth for this, and creating the bot takes a chat message — no
   * developer console, no client id, no app review.
   */
  telegramBotToken?: string;
  /** Slack user token (xoxp-) obtained through the OAuth flow. */
  slackToken?: string;
  slackTeam?: string;
  /** Google refresh token, granted when the account allowed Gmail access. */
  googleRefreshToken?: string;
  googleEmail?: string;
}

/** A source of chats and messages — one per app */
export interface Connector {
  app: AppId;
  label: string;
  /** True when this account (or the environment) can reach the real service. */
  isLive(connections: Connections): boolean;
  /** How this connector gets its data, or what connecting it would take. */
  status(connections: Connections): string;
  /** Whether a person can connect this app themselves from the dashboard. */
  connectable(): boolean;
  /**
   * How this app is connected by hand, when it can be. `token` means the
   * person pastes a credential; `oauth` means they are sent to a consent
   * screen; `none` means there is no self-serve route at all.
   */
  connectVia(): "token" | "oauth" | "none";
  /** What to show above the paste box, for token-connected apps. */
  tokenHelp?(): { label: string; help: string; placeholder: string };
  listChats(connections: Connections): Promise<Chat[]>;
  fetchMessages(chatIds: string[], limit: number, connections: Connections): Promise<Message[]>;
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
  connections?: Connections;
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
