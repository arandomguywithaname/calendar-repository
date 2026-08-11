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
export function ingestWebhook(payload: CloudApiPayload): number {
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

        const title = names.get(message.from) || message.from;
        const timestamp = new Date(Number(message.timestamp || Date.now() / 1000) * 1000).toISOString();

        chats.push({
          id: message.from,
          app: "whatsapp",
          title,
          kind: "dm",
          unreadCount: 1,
          lastActivity: timestamp,
        });

        messages.push({
          id: `whatsapp:${message.id}`,
          app: "whatsapp",
          chatId: message.from,
          chatTitle: title,
          sender: title,
          text,
          timestamp,
          unread: true,
        });
      }
    }
  }

  if (messages.length > 0) recordMessages("whatsapp", chats, messages);
  return messages.length;
}

export const whatsappConnector: Connector = {
  app: "whatsapp",
  label: "WhatsApp",

  isLive: () => isConfigured(),

  status: () =>
    isConfigured()
      ? "Live via the WhatsApp Business Cloud API webhook (POST /webhooks/whatsapp). Only messages received after the webhook was connected are available — WhatsApp exposes no history API."
      : "Demo data. Set WHATSAPP_VERIFY_TOKEN and point the Cloud API webhook at /webhooks/whatsapp.",

  async listChats(): Promise<Chat[]> {
    if (!isConfigured()) return demoChats("whatsapp");
    return bufferedChats("whatsapp");
  },

  async fetchMessages(chatIds: string[], limit: number): Promise<Message[]> {
    const all = isConfigured() ? bufferedMessages("whatsapp") : demoMessages("whatsapp");
    const wanted = new Set(chatIds);
    const scoped = wanted.size > 0 ? all.filter((m) => wanted.has(m.chatId)) : all;
    return scoped.slice(-limit);
  },
};
