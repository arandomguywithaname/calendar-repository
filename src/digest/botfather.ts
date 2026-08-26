/**
 * Getting a bot token without anyone visiting BotFather by hand.
 *
 * @BotFather is an ordinary bot, so a signed-in user client can hold the
 * conversation that creates a bot: /newbot, a display name, a username, and the
 * token comes back in the reply. Since the person is already signed in over
 * MTProto — that part is unavoidable — this removes the one credential that
 * *was* avoidable.
 *
 * It is written to fail visibly. BotFather's wording is not an API and can
 * change under us; every step that doesn't get the reply it expects gives up
 * and hands back what BotFather actually said, so setup can fall back to asking
 * for a token rather than leaving someone stuck against a silent wall.
 */

const BOTFATHER = "BotFather";

/** BotFather's replies are conversational, so we wait for one rather than poll a result. */
const REPLY_TIMEOUT_MS = 25_000;
const POLL_MS = 900;

export class BotFatherError extends Error {
  /** BotFather's own words, for showing the person what actually happened. */
  readonly said: string;
  constructor(message: string, said = "") {
    super(message);
    this.said = said;
  }
}

export interface CreatedBot {
  token: string;
  username: string;
}

/** Telegram requires 5–32 chars, letters/digits/underscore, ending in "bot". */
export function proposeUsername(seed = ""): string {
  const base = seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 18);

  // Randomness is not decoration: every username on Telegram is global, so a
  // predictable one would collide with the previous person to run this.
  const suffix = Math.random().toString(36).slice(2, 8);
  const stem = base ? `${base}_${suffix}` : `digest_${suffix}`;
  return `${stem}_bot`.replace(/_bot_bot$/, "_bot");
}

/** A token, wherever in the reply it appears. */
export function extractToken(text: string): string | null {
  const match = text.match(/\b(\d{6,}:[A-Za-z0-9_-]{30,})\b/);
  return match ? match[1] : null;
}

async function newestId(client: any): Promise<number> {
  const messages: any[] = await client.getMessages(BOTFATHER, { limit: 1 });
  return messages[0]?.id ?? 0;
}

/**
 * Say something to BotFather and wait for what it says next.
 *
 * Waiting is by message id rather than by content: BotFather sometimes sends
 * two messages in a row, and anchoring on "newer than what I had" is the only
 * reading that doesn't mistake its previous reply for its next one.
 */
async function exchange(client: any, text: string, after: number): Promise<{ text: string; id: number }> {
  await client.sendMessage(BOTFATHER, { message: text });

  const deadline = Date.now() + REPLY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const messages: any[] = await client.getMessages(BOTFATHER, { limit: 5 });

    // Newest first from Telegram; oldest-first is the order it was said in.
    const replies = messages
      .filter((m) => m.id > after && !m.out)
      .sort((a, b) => a.id - b.id);

    if (replies.length) {
      const said = replies.map((m) => m.message || "").join("\n");
      return { text: said, id: replies[replies.length - 1].id };
    }
  }

  throw new BotFatherError("BotFather didn't reply. It may be rate-limiting this account — try again in a few minutes.");
}

/**
 * Create a bot and return its token.
 *
 * `attempts` covers username collisions, which are ordinary rather than
 * exceptional — the namespace is global and every good name is long gone.
 */
export async function createBot(
  client: any,
  options: { displayName?: string; attempts?: number } = {}
): Promise<CreatedBot> {
  const displayName = options.displayName || "Channel Digest";
  const attempts = options.attempts ?? 5;

  let cursor = await newestId(client);

  const start = await exchange(client, "/newbot", cursor);
  cursor = start.id;

  if (/too many attempts|20 bots|limit/i.test(start.text)) {
    throw new BotFatherError(
      "BotFather won't create another bot on this account right now — it limits how many you can have.",
      start.text
    );
  }
  if (!/how are we going to call it|name for your bot|choose a name/i.test(start.text)) {
    throw new BotFatherError("BotFather answered /newbot with something unexpected.", start.text);
  }

  const named = await exchange(client, displayName, cursor);
  cursor = named.id;

  if (!/username/i.test(named.text)) {
    throw new BotFatherError("BotFather didn't ask for a username as expected.", named.text);
  }

  let lastSaid = named.text;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const username = proposeUsername(displayName);
    const reply = await exchange(client, username, cursor);
    cursor = reply.id;
    lastSaid = reply.text;

    const token = extractToken(reply.text);
    if (token) return { token, username };

    // Taken or malformed: both mean "pick another and try again".
    if (/already taken|invalid|must end in|sorry/i.test(reply.text)) continue;

    throw new BotFatherError("BotFather replied with something unexpected after the username.", reply.text);
  }

  throw new BotFatherError(
    `Couldn't find a free username after ${attempts} tries.`,
    lastSaid
  );
}
