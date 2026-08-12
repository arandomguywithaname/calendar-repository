import { AppId, Chat, Connections, Connector, Message, Preferences } from "../types";
import { gmailConnector } from "./gmail";
import { slackConnector } from "./slack";
import { telegramConnector } from "./telegram";
import { whatsappConnector } from "./whatsapp";

export const connectors: Record<AppId, Connector> = {
  telegram: telegramConnector,
  whatsapp: whatsappConnector,
  slack: slackConnector,
  gmail: gmailConnector,
};

export const APP_IDS: AppId[] = ["telegram", "whatsapp", "slack", "gmail"];

/** "<app>:<chatId>" — how the UI and preferences address a single chat */
export function chatKey(app: AppId, chatId: string): string {
  return `${app}:${chatId}`;
}

export interface SourceSummary {
  app: AppId;
  label: string;
  live: boolean;
  connectable: boolean;
  connectVia: "token" | "oauth" | "none";
  tokenHelp?: { label: string; help: string; placeholder: string };
  status: string;
  chats: Chat[];
  error?: string;
}

/** Every app the user can pick from, with its chats. One bad app doesn't break the page. */
export async function listSources(connections: Connections = {}): Promise<SourceSummary[]> {
  return Promise.all(
    APP_IDS.map(async (app) => {
      const connector = connectors[app];
      const base = {
        app,
        label: connector.label,
        live: connector.isLive(connections),
        connectable: connector.connectable(),
        connectVia: connector.connectVia(),
        tokenHelp: connector.tokenHelp ? connector.tokenHelp() : undefined,
        status: connector.status(connections),
      };
      try {
        const chats = await connector.listChats(connections);
        return {
          ...base,
          chats: chats.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity)),
        };
      } catch (err: any) {
        return { ...base, chats: [], error: err.message || "Could not load chats." };
      }
    })
  );
}

/** Pull the messages the user's selection actually covers. */
export async function collectMessages(
  preferences: Preferences,
  connections: Connections = {},
  limitPerApp = 120
): Promise<{ messages: Message[]; errors: string[] }> {
  const apps = preferences.apps.length > 0 ? preferences.apps : APP_IDS;
  const messages: Message[] = [];
  const errors: string[] = [];

  await Promise.all(
    apps.map(async (app) => {
      const connector = connectors[app];
      const chatIds = preferences.chatIds
        .filter((key) => key.startsWith(`${app}:`))
        .map((key) => key.slice(app.length + 1));

      // A user who picked the app but no specific chats wants the whole app.
      const selectedSomewhere = preferences.chatIds.some((key) => key.startsWith(`${app}:`));

      try {
        const found = await connector.fetchMessages(
          selectedSomewhere ? chatIds : [],
          limitPerApp,
          connections
        );
        messages.push(...found);
      } catch (err: any) {
        errors.push(`${connector.label}: ${err.message || "could not fetch messages"}`);
      }
    })
  );

  const filtered = preferences.unreadOnly ? messages.filter((m) => m.unread) : messages;
  return {
    messages: filtered.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    errors,
  };
}
