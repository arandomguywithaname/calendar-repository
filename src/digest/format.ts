import { PeriodDigest } from "./types";

/** Rendering digests for a Telegram message. Kept apart from the bot's plumbing. */

/** Telegram rejects anything longer; splitting is on the caller. */
export const TELEGRAM_LIMIT = 4096;

/**
 * Replace lone UTF-16 surrogates with the replacement character.
 *
 * Telegram posts are full of emoji, and an emoji is two UTF-16 code units —
 * so any slice by character count can cut one in half. JSON.stringify encodes
 * the leftover as a bare "\ud83d", and strict parsers (the model API's among
 * them) reject the entire request body over it: one half-emoji, no digest.
 * Sanitising at the boundaries — after truncation, before anything is sent or
 * stored — keeps that trade from ever being on offer.
 */
export function wellFormed(text: string): string {
  return text
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "�")
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�");
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function when(digest: PeriodDigest): string {
  const from = new Date(digest.from);
  const to = new Date(digest.to);
  const sameDay = from.toISOString().slice(0, 10) === to.toISOString().slice(0, 10);
  const stamp = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");
  return sameDay ? `${stamp(from)} → ${to.toISOString().slice(11, 16)}` : `${stamp(from)} → ${stamp(to)}`;
}

export function renderDigest(digest: PeriodDigest): string {
  if (digest.topics.length === 0) {
    // Zero topics has two different meanings — an empty window, or a window
    // whose every post repeated stories from earlier digests — and only the
    // headline knows which. Swallowing it behind a fixed phrase would tell
    // someone "nothing happened" about posts that were read and set aside.
    const parts = [
      `<b>${escapeHtml(when(digest))}</b>`,
      escapeHtml(digest.headline || "Nothing new in your channels for this window."),
    ];
    if (digest.postCount > 0) {
      parts.push(`<i>${digest.postCount} posts from ${digest.channelCount} channels → no new stories</i>`);
    }
    return parts.join("\n");
  }

  const parts: string[] = [
    `<b>${escapeHtml(when(digest))}</b>`,
    escapeHtml(digest.headline),
    "",
  ];

  digest.topics.forEach((topic, index) => {
    const names = [...new Set(topic.sources.map((s) => s.channelTitle))];
    const shown = names.slice(0, 4).join(", ");
    const more = names.length > 4 ? ` +${names.length - 4}` : "";

    parts.push(`<b>${index + 1}. ${escapeHtml(topic.title)}</b>`);
    parts.push(escapeHtml(topic.summary));
    for (const point of topic.points.slice(0, 6)) parts.push(`• ${escapeHtml(point)}`);

    // A link only exists for public channels; private ones get the name alone.
    const link = topic.sources.find((s) => s.link);
    const source = link
      ? `<a href="${escapeHtml(link.link!)}">${escapeHtml(shown)}${escapeHtml(more)}</a>`
      : escapeHtml(shown + more);
    if (names.length) parts.push(`<i>${source}</i>`);
    parts.push("");
  });

  parts.push(
    `<i>${digest.postCount} posts from ${digest.channelCount} channels → ${digest.topics.length} topics</i>`
  );
  if (digest.degraded) {
    parts.push(
      "<i>Grouped by wording, not meaning — no summarising model was reachable, so stories phrased differently may appear twice.</i>"
    );
  }

  return parts.join("\n");
}

/**
 * Where a cut at `limit` would land, backed off so it doesn't fall inside a tag
 * or an entity. Telegram parses each message independently and rejects one whose
 * HTML is malformed, so a split through `&amp;` or `<b>` loses the whole message.
 */
function safeCut(line: string, limit: number): number {
  const window = line.slice(0, limit);
  const tag = window.lastIndexOf("<");
  const entity = window.lastIndexOf("&");

  // Only back off for a marker this cut would actually bisect.
  const openTag = tag >= 0 && window.indexOf(">", tag) === -1 ? tag : -1;
  const openEntity = entity >= 0 && window.indexOf(";", entity) === -1 ? entity : -1;

  const cut = Math.max(openTag, openEntity);
  return cut > 0 ? cut : limit;
}

/** Split on paragraph boundaries where possible, hard-split only if forced. */
export function chunk(text: string, limit = TELEGRAM_LIMIT): string[] {
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let current = "";

  for (const line of text.split("\n")) {
    if (line.length > limit) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      let rest = line;
      while (rest.length > limit) {
        const cut = safeCut(rest, limit);
        chunks.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      if (rest) chunks.push(rest);
      continue;
    }
    if (current.length + line.length + 1 > limit) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
