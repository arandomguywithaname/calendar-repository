import { AskTurn, Digest, Message } from "./types";

/**
 * Summaries and answers computed on the server, with no model and no API key.
 *
 * Calling a model requires credentials — that is not a setting we can switch
 * off. So when there are none, the reader does the reading itself: it groups
 * the real messages, finds the ones actually addressed to you, and quotes them
 * back. Every line below is derived from messages that exist; nothing here
 * invents content, and nothing here is sample data.
 *
 * It is not as good as Claude at nuance. It is honest about what it found.
 */

const URGENT = /\b(urgent|asap|emergency|critical|blocker|blocked|overdue|deadline|right away|immediately)\b/i;

const SOON = /\b(today|tonight|this (morning|afternoon|evening)|tomorrow|by (\d|noon|eod)|before \d|in an hour|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

/** Phrasing that puts the ball in the reader's court. */
const ASKS_YOU = [
  /\b(can|could|would|will) you\b/i,
  /\bare you (able|around|free|coming|going)\b/i,
  /\b(please|pls)\b/i,
  /\bneed (you|your)\b/i,
  /\blet me know\b/i,
  /\bwaiting (on|for) you\b/i,
  /\b(any chance|any update|any news)\b/i,
  /\b(confirm|approve|sign off|review|send me|remind me)\b/i,
  /\bwhen (can|will|are) you\b/i,
  /\byour (thoughts|call|take|input)\b/i,
];

const STOPWORDS = new Set(
  ("a an the and or but if then than that this these those is are was were be been being am do does did doing have has had " +
    "i me my mine you your yours he him his she her it its we us our they them their what which who whom whose when where " +
    "why how all any both each few more most other some such no nor not only own same so too very can will just should now " +
    "of in on at to from by for with about against between into through during before after above below up down out off " +
    "over under again further once here there also get got give me pls please hey hi yeah ok okay uhh uhhh um " +
    // Conversational filler. Without these, "anything about X" matches every
    // message containing the word "anything" and buries the real hit.
    "anything anyone anybody something someone somebody everything everyone nothing thing things stuff " +
    "said say says tell told telling talk talks talked mention mentions mentioned " +
    "message messages msg msgs chat chats unread new latest recent today yesterday " +
    "know need want going nah yep nope really actually maybe").split(/\s+/)
);

/* ------------------------------- helpers --------------------------------- */

/**
 * Words, not substrings. Matching on substrings made "Ines" match "lines" and
 * "car" match "carousel", so questions picked up messages that had nothing to
 * do with them. Splitting into whole words also sidesteps regex-escaping —
 * senders and chat titles are user data and may contain metacharacters.
 */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function tokens(text: string): string[] {
  return words(text).filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/** Whole-word match, tolerating a short inflectional tail (deploy/deploys/deploying). */
function looseMatch(candidate: string, term: string): boolean {
  if (candidate === term) return true;
  const [longer, shorter] = candidate.length >= term.length ? [candidate, term] : [term, candidate];
  return longer.startsWith(shorter) && longer.length - shorter.length <= 3;
}

function clock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function whenLabel(iso: string, now: Date): string {
  const then = new Date(iso);
  const hours = (now.getTime() - then.getTime()) / 3_600_000;
  if (Number.isNaN(hours)) return "";
  if (hours < 1) return "just now";
  if (hours < 24) return `${clock(iso)}`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** " (14:02)" or "" — so a message with an unparseable timestamp reads cleanly. */
function whenSuffix(iso: string, now: Date): string {
  const label = whenLabel(iso, now);
  return label ? ` (${label})` : "";
}

/** One line of a message, short enough to scan, never cut mid-word. */
function quote(text: string, max = 120): string {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut) + "…";
}

/**
 * Quoted text, or a plain note when there is none. Photos, stickers and voice
 * notes arrive with an empty body, and “” reads like the summariser failed.
 */
function renderQuote(text: string, max = 120): string {
  const q = quote(text, max);
  return q ? `“${q}”` : "(no text — attachment or sticker)";
}

/** Does this message put a request or question to the reader? */
function isDirectedAtYou(text: string): boolean {
  if (/\?\s*$/.test(text.trim())) return true;
  return ASKS_YOU.some((p) => p.test(text));
}

interface ChatGroup {
  key: string;
  app: string;
  title: string;
  messages: Message[];
  senders: string[];
  unread: number;
  asks: Message[];
  urgent: boolean;
  timeBound: boolean;
  latest: Message;
  score: number;
}

function group(messages: Message[]): ChatGroup[] {
  const byKey = new Map<string, Message[]>();
  for (const m of messages) {
    const key = `${m.app}:${m.chatId}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(m);
  }

  const groups: ChatGroup[] = [];
  for (const [key, msgs] of byKey) {
    const sorted = [...msgs].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const senders = [...new Set(sorted.map((m) => m.sender))];
    const asks = sorted.filter((m) => isDirectedAtYou(m.text));
    const unread = sorted.filter((m) => m.unread).length;
    const urgent = sorted.some((m) => URGENT.test(m.text));
    const timeBound = sorted.some((m) => SOON.test(m.text));
    const latest = sorted[sorted.length - 1];

    // A one-to-one thread with a question in it is the most likely thing to
    // actually need you; group chatter with no question is the least.
    const oneToOne = senders.length === 1;
    const score =
      (asks.length ? 40 : 0) +
      (urgent ? 30 : 0) +
      (timeBound ? 12 : 0) +
      (oneToOne ? 15 : 0) +
      Math.min(unread, 6) * 4 +
      Math.min(sorted.length, 10);

    groups.push({
      key,
      app: sorted[0].app,
      title: sorted[0].chatTitle,
      messages: sorted,
      senders,
      unread,
      asks,
      urgent,
      timeBound,
      latest,
      score,
    });
  }
  return groups.sort((a, b) => b.score - a.score);
}

function urgencyOf(g: ChatGroup): "high" | "normal" | "low" {
  if (g.urgent || (g.asks.length > 0 && g.senders.length === 1)) return "high";
  if (g.asks.length > 0 || g.unread > 0) return "normal";
  return "low";
}

function describe(g: ChatGroup, now: Date): string {
  const parts: string[] = [];

  const who = g.senders.length === 1 ? g.senders[0] : `${g.senders.length} people`;
  const count = `${g.messages.length} message${g.messages.length === 1 ? "" : "s"}`;
  parts.push(
    g.unread > 0
      ? `${count} from ${who}, ${g.unread} unread.`
      : `${count} from ${who}.`
  );

  if (g.asks.length > 0) {
    const ask = g.asks[g.asks.length - 1];
    parts.push(`${ask.sender} asked${whenSuffix(ask.timestamp, now)}: ${renderQuote(ask.text)}`);
  } else {
    const label = whenLabel(g.latest.timestamp, now);
    parts.push(
      label
        ? `Latest ${label} — ${g.latest.sender}: ${renderQuote(g.latest.text)}`
        : `Latest from ${g.latest.sender}: ${renderQuote(g.latest.text)}`
    );
  }

  if (g.urgent) parts.push("Flagged as urgent.");
  else if (g.timeBound && g.asks.length > 0) parts.push("Time-sensitive.");

  return parts.join(" ");
}

/* -------------------------------- digest --------------------------------- */

export function summariseLocally(messages: Message[], now: Date): Digest {
  if (messages.length === 0) {
    return { headline: "Nothing new in the sources you've selected.", needsYouNow: [], chats: [] };
  }

  const groups = group(messages);
  const unread = messages.filter((m) => m.unread).length;
  const needing = groups.filter((g) => g.asks.length > 0);

  const needsYouNow = needing
    .slice(0, 5)
    .map((g) => {
      const ask = g.asks[g.asks.length - 1];
      const when = whenLabel(ask.timestamp, now);
      return `${ask.sender} in ${g.title} (${g.app}) — ${renderQuote(ask.text, 100)}` + (when ? ` · ${when}` : "");
    });

  const apps = new Set(messages.map((m) => m.app)).size;
  let headline: string;
  if (needing.length === 0) {
    headline = `${messages.length} messages across ${groups.length} chats and ${apps} app${apps === 1 ? "" : "s"}. Nothing is waiting on you — no questions or requests were addressed to you.`;
  } else {
    const top = needing[0];
    // In a one-to-one thread the chat is named after the person, so "Mum in
    // Mum" would read like a bug rather than a summary.
    const where = top.title === top.senders[0] ? top.senders[0] : `${top.senders[0]} in ${top.title}`;
    headline =
      `${unread} unread of ${messages.length} messages across ${groups.length} chats. ` +
      `${needing.length} ${needing.length === 1 ? "chat needs" : "chats need"} a reply — ` +
      `start with ${where}.`;
  }

  return {
    headline,
    needsYouNow,
    chats: groups.map((g) => ({
      key: g.key,
      app: g.app,
      title: g.title,
      summary: describe(g, now),
      urgency: urgencyOf(g),
      actionItems: g.asks.slice(-3).map((m) => `${m.sender}: ${renderQuote(m.text, 100)}`),
    })),
  };
}

/* ------------------------------- ask box --------------------------------- */

function matchesName(questionWords: Set<string>, name: string): boolean {
  return words(name).some((part) => part.length > 2 && questionWords.has(part));
}

function cite(m: Message, now: Date): string {
  const when = whenLabel(m.timestamp, now);
  const where = when ? `${m.app}, ${when}` : m.app;
  return `· ${m.sender} in ${m.chatTitle} (${where}): ${renderQuote(m.text, 160)}`;
}

export function answerLocally(
  question: string,
  messages: Message[],
  _history: AskTurn[],
  now: Date
): string {
  if (messages.length === 0) {
    return "There are no messages in the apps and chats you've selected, so there's nothing for me to read yet.";
  }

  const q = question.toLowerCase();
  const groups = group(messages);

  // "what did I miss", "give me a summary", "catch me up".
  // No trailing \b — "summar" has to match inside "summary"/"summarise".
  if (/\b(summar|catch me up|what did i miss|what'?s new|missed|recap|overview)/.test(q)) {
    const digest = summariseLocally(messages, now);
    const lines = [digest.headline];
    if (digest.needsYouNow.length) {
      lines.push("", "Waiting on you:", ...digest.needsYouNow.map((n) => `· ${n}`));
    }
    const quiet = groups.filter((g) => g.asks.length === 0).slice(0, 3);
    if (quiet.length) {
      lines.push("", "Nothing needed in: " + quiet.map((g) => g.title).join(", ") + ".");
    }
    return lines.join("\n");
  }

  // Scope by person or by chat when the question names one.
  const qWords = new Set(words(question));
  const people = [...new Set(messages.map((m) => m.sender))].filter((s) => matchesName(qWords, s));
  const chats = groups.filter((g) => matchesName(qWords, g.title));

  if (people.length || chats.length) {
    const scoped = messages.filter(
      (m) => people.includes(m.sender) || chats.some((c) => `${m.app}:${m.chatId}` === c.key)
    );
    const label = people.length ? people.join(" and ") : chats.map((c) => c.title).join(" and ");

    if (scoped.length === 0) {
      return `Nothing from ${label} in the chats you've selected.`;
    }

    const recent = [...scoped].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 6);
    const asks = scoped.filter((m) => isDirectedAtYou(m.text));
    const unreadCount = scoped.filter((m) => m.unread).length;

    const lines = [
      `${scoped.length} message${scoped.length === 1 ? "" : "s"} from ${label}` +
        (unreadCount ? `, ${unreadCount} unread.` : "."),
      "",
      ...recent.map((m) => cite(m, now)),
    ];
    if (asks.length) {
      lines.push(
        "",
        `${asks.length === 1 ? "One of them is" : `${asks.length} of them are`} addressed to you — the latest: ${renderQuote(
          asks[asks.length - 1].text,
          140
        )}`
      );
    }
    return lines.join("\n");
  }

  // "anything urgent", "what needs a reply"
  if (/\b(urgent|need|reply|respond|important|action|todo|waiting)\b/.test(q)) {
    const needing = groups.filter((g) => g.asks.length > 0);
    if (!needing.length) return "Nothing in your selected chats is addressed to you right now.";
    return [
      `${needing.length} ${needing.length === 1 ? "chat needs" : "chats need"} something from you:`,
      "",
      ...needing.slice(0, 6).map((g) => cite(g.asks[g.asks.length - 1], now)),
    ].join("\n");
  }

  // Otherwise: retrieve on the words of the question itself.
  const terms = tokens(question);
  if (terms.length === 0) {
    const digest = summariseLocally(messages, now);
    return digest.headline;
  }

  const scored = messages
    .map((m) => {
      const hay = words(`${m.text} ${m.sender} ${m.chatTitle}`);
      let score = 0;
      for (const t of terms) if (hay.some((w) => looseMatch(w, t))) score += 1;
      if (score === 0) return null;
      if (m.unread) score += 0.5;
      return { m, score };
    })
    .filter((x): x is { m: Message; score: number } => x !== null)
    .sort((a, b) => b.score - a.score || b.m.timestamp.localeCompare(a.m.timestamp))
    .slice(0, 6);

  if (scored.length === 0) {
    const names = [...new Set(messages.map((m) => m.sender))].slice(0, 6).join(", ");
    return (
      `I read all ${messages.length} messages and found nothing about that.\n\n` +
      `The people who've written to you are: ${names}. Ask about one of them, or say “what did I miss”.`
    );
  }

  return [
    `${scored.length} message${scored.length === 1 ? "" : "s"} mention that:`,
    "",
    ...scored.map(({ m }) => cite(m, now)),
  ].join("\n");
}
