import { AppId, Chat, Message } from "../types";

/**
 * Sample inbox used whenever an app has no credentials configured, so the
 * dashboard, the digest, and the ask-the-AI box all work out of the box.
 */

interface Seed {
  chatId: string;
  title: string;
  kind: Chat["kind"];
  lines: [minutesAgo: number, sender: string, text: string, unread?: boolean][];
}

const SEEDS: Record<AppId, Seed[]> = {
  telegram: [
    {
      chatId: "frontend-guild",
      title: "Frontend Guild",
      kind: "channel",
      lines: [
        [420, "Priya", "Heads up: the design tokens package ships Thursday. Anything still on v2 will break.", false],
        [180, "Marek", "We're still on v2 in the billing screens. I'll start the bump today.", true],
        [95, "Priya", "@you can you review the migration PR before Thursday? It's about 40 files but mostly mechanical.", true],
        [40, "Marek", "PR is up: github.com/acme/web/pull/2213", true],
      ],
    },
    {
      chatId: "mum",
      title: "Mum",
      kind: "dm",
      lines: [
        [1500, "Mum", "Are you coming for lunch on Sunday? Your sister is bringing the twins.", true],
        [1440, "Mum", "Also don't forget dad's birthday is next Saturday!", true],
      ],
    },
    {
      chatId: "crypto-noise",
      title: "Alpha Signals 🚀",
      kind: "channel",
      lines: [
        [300, "AlphaBot", "🔥🔥 100x GEM ALERT 🔥🔥 don't miss this one anon", false],
        [120, "AlphaBot", "chart looking BULLISH, LFG 🚀🚀🚀", false],
        [30, "AlphaBot", "last call before we send it", false],
      ],
    },
    {
      chatId: "flat-3b",
      title: "Flat 3B",
      kind: "group",
      lines: [
        [600, "Sam", "Boiler is making that noise again. I've called the landlord.", false],
        [220, "Ines", "Rent goes out on the 1st — everyone transferred their share?", true],
        [45, "Sam", "I have. @you I think you're the last one left 😅", true],
      ],
    },
  ],
  whatsapp: [
    {
      chatId: "lena",
      title: "Lena",
      kind: "dm",
      lines: [
        [260, "Lena", "Still on for the 8pm table on Friday? I need to confirm the booking today.", true],
        [90, "Lena", "They'll release it if nobody calls back by 6.", true],
      ],
    },
    {
      chatId: "five-a-side",
      title: "Five-a-side ⚽",
      kind: "group",
      lines: [
        [700, "Tomas", "Pitch is booked for Wednesday 7pm.", false],
        [150, "Ade", "We're one short. Anyone bringing a sub?", true],
        [20, "Tomas", "Bring dark shirts, we're the away team this week.", true],
      ],
    },
  ],
  slack: [
    {
      chatId: "incidents",
      title: "#incidents",
      kind: "channel",
      lines: [
        [200, "Dana", "p2: checkout latency is up to 4s at p95 in eu-west-1. Investigating.", false],
        [110, "Dana", "Root cause looks like the new pricing query — missing index on orders.customer_id.", true],
        [65, "Ravi", "@you you wrote that query, can you confirm before I ship the index migration?", true],
      ],
    },
    {
      chatId: "eng-standup",
      title: "#eng-standup",
      kind: "channel",
      lines: [
        [480, "Standup Bot", "Reminder: async standup thread closes at 10:30.", false],
        [430, "Ravi", "Yesterday: pricing cache. Today: index migration. Blockers: none.", false],
      ],
    },
    {
      chatId: "dm-hannah",
      title: "Hannah (DM)",
      kind: "dm",
      lines: [
        [340, "Hannah", "Can you send me the Q3 numbers before the board call tomorrow at 9?", true],
        [55, "Hannah", "No rush tonight, but I do need them before I get on the call.", true],
      ],
    },
  ],
};

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export function demoChats(app: AppId): Chat[] {
  return SEEDS[app].map((seed) => {
    const unread = seed.lines.filter(([, , , isUnread]) => isUnread).length;
    const newest = Math.min(...seed.lines.map(([minutesAgo]) => minutesAgo));
    return {
      id: seed.chatId,
      app,
      title: seed.title,
      kind: seed.kind,
      unreadCount: unread,
      lastActivity: isoMinutesAgo(newest),
    };
  });
}

export function demoMessages(app: AppId): Message[] {
  const messages: Message[] = [];
  for (const seed of SEEDS[app]) {
    seed.lines.forEach(([minutesAgo, sender, text, unread], index) => {
      messages.push({
        id: `${app}:${seed.chatId}:${index}`,
        app,
        chatId: seed.chatId,
        chatTitle: seed.title,
        sender,
        text,
        timestamp: isoMinutesAgo(minutesAgo),
        unread: Boolean(unread),
      });
    });
  }
  return messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
