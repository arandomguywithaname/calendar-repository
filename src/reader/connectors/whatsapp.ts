import { bufferedChats, bufferedMessages, recordMessages } from "../store";
import { Chat, Connector, Message } from "../types";
import { demoChats, demoMessages } from "./demo";

/**
 * WhatsApp via the Cloud API webhook.
 *
 * WhatsApp has no read API for a personal account — nothing can enumerate your
 * existing chat history. What is available is the Business Cloud API, which
 * pushes messages to a webhook as they arrive. So this connector is push-based:
 * point Meta's webhook at POST /webhooks/whatsapp and the reader accumulates
 * conversations from that point forward.
 */

/**
 * Identifiers are used as DOM attribute values and as preference keys, so they
 * are restricted to a conservative charset rather than escaped at each use.
 * Returns "" when nothing usable survives, and the caller drops the message.
 */
function safeId(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._@+-]/g, "").slice(0, 64);
}

export function isConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_VERIFY_TOKEN);
}

interface CloudApiPayload {
  entry?: {
    changes?: {
      field?: string;
      value?: {
        contacts?: { profile?: { name?: string }; wa_id?: string }[];
        messages?: {
          from?: string;
          id?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }[];
      };
    }[];
  }[];
}

/** Store the messages in one webhook delivery. Returns how many were kept. */
export async function ingestWebhook(payload: CloudApiPayload): Promise<number> {
  const chats: Chat[] = [];
  const messages: Message[] = [];

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value?.messages) continue;

      const names = new Map<string, string>();
      for (const contact of value.contacts || []) {
        if (contact.wa_id) names.set(contact.wa_id, contact.profile?.name || contact.wa_id);
      }

      for (const message of value.messages) {
        const text = message.text?.body;
        if (!text || !message.from || !message.id) continue;

        // The webhook is unauthenticated unless WHATSAPP_APP_SECRET is set, so
        // treat identifiers as hostile: they end up in DOM attributes and in
        // preference keys. A wa_id is a phone number; anything else is junk.
        const from = safeId(message.from);
        if (!from) continue;

        const title = names.get(message.from) || from;
        const timestamp = new Date(Number(message.timestamp || Date.now() / 1000) * 1000).toISOString();

        chats.push({
          id: from,
          app: "whatsapp",
          title,
          kind: "dm",
          unreadCount: 1,
          lastActivity: timestamp,
        });

        messages.push({
          id: `whatsapp:${safeId(message.id)}`,
          app: "whatsapp",
          chatId: from,
          chatTitle: title,
          sender: title,
          text,
          timestamp,
          unread: true,
        });
      }
    }
  }

  if (messages.length > 0) await recordMessages("whatsapp", chats, messages);
  return messages.length;
}

export const whatsappConnector: Connector = {
  app: "whatsapp",
  label: "WhatsApp",

  isLive: () => isConfigured(),

  connectable: () => false,

  status: () =>
    isConfigured()
      ? "Live via the WhatsApp Business Cloud API webhook (POST /webhooks/whatsapp). Only messages received after the webhook was connected are available — WhatsApp exposes no history API."
      : "Not connected — showing sample chats. WhatsApp has no API for reading a personal account; only the Business Cloud API can deliver messages, by pushing them to /webhooks/whatsapp.",

  async listChats(): Promise<Chat[]> {
    if (!isConfigured()) return demoChats("whatsapp");
    return bufferedChats("whatsapp");
  },

  async fetchMessages(chatIds: string[], limit: number): Promise<Message[]> {
    const all = isConfigured() ? await bufferedMessages("whatsapp") : demoMessages("whatsapp");
    const wanted = new Set(chatIds);
    const scoped = wanted.size > 0 ? all.filter((m) => wanted.has(m.chatId)) : all;
    return scoped.slice(-limit);
  },
};
