import {
  cancelLogin,
  cancelQrLogin,
  CompletedLogin,
  completeLogin,
  listChannels,
  loginPending,
  markRead,
  qrLoginPending,
  startLogin,
  startQrLogin,
  waitForQrLogin,
} from "./collector";
import { answerFromDigests } from "./converse";
import { chunk, escapeHtml, renderDigest } from "./format";
import { runDigest } from "./pipeline";
import { canTriage, triage } from "./triage";
import { PeriodDigest } from "./types";
import {
  appendChat,
  claimReadMark,
  clearAccount,
  clearChat,
  getAccount,
  getChat,
  getDigest,
  getOverrides,
  getTopics,
  getVerdicts,
  latestDigest,
  listDigests,
  releaseReadMark,
  setAccount,
  setOverride,
  setTopics,
  setVerdicts,
} from "./store";

/**
 * The bot — the only interface.
 *
 * It talks to two different Telegram APIs and the distinction matters. The Bot
 * API (this file) is how the conversation happens. MTProto (the collector) is
 * how the channels get read, because a bot cannot see a channel it does not
 * administer. So the bot is the front door, and each person signs in behind it
 * once with their own account.
 *
 * Long-polling rather than webhooks: a half-finished login holds a live MTProto
 * connection in memory between two messages, which needs one long-lived process
 * and rules out a serverless function.
 */

const API = "https://api.telegram.org";

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set — create a bot with @BotFather and set it.");
  return token;
}

async function call(method: string, body: Record<string, unknown>): Promise<any> {
  let response: Response;
  try {
    response = await fetch(`${API}/bot${botToken()}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    throw new Error(`${method}: could not reach api.telegram.org (${err?.message || err})`);
  }

  // Anything between here and Telegram — a proxy, a gateway, a captive portal —
  // can answer with HTML. Reporting that as a JSON parse error tells nobody
  // anything, so say what actually came back.
  const raw = await response.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `${method}: expected JSON from api.telegram.org, got HTTP ${response.status} — ${raw.slice(0, 200).replace(/\s+/g, " ").trim()}`
    );
  }

  if (!data.ok) throw new Error(`${method}: ${data.description || response.status}`);
  return data.result;
}

/** Markup out, readable text back — for the retry when Telegram rejects our HTML. */
function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * `markup` rides on the last part only. A digest long enough to be split would
 * otherwise carry a button under every piece, and pressing any of them would
 * mean the same thing.
 */
async function send(
  chatId: number | string,
  text: string,
  markup?: Record<string, unknown>
): Promise<void> {
  const parts = chunk(text);
  for (const [index, part] of parts.entries()) {
    const last = index === parts.length - 1;
    try {
      await call("sendMessage", {
        chat_id: chatId,
        text: part,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        ...(last && markup ? { reply_markup: markup } : {}),
      });
    } catch (err: any) {
      // Malformed markup should cost the formatting, not the message.
      if (!/parse entities|parse_mode|entity/i.test(err?.message || "")) throw err;
      await call("sendMessage", {
        chat_id: chatId,
        text: stripHtml(part),
        link_preview_options: { is_disabled: true },
        ...(last && markup ? { reply_markup: markup } : {}),
      });
    }
  }
}

async function typing(chatId: number | string): Promise<void> {
  await call("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
}

/**
 * Pictures go up as multipart, not as JSON.
 *
 * `sendPhoto` takes a file id, an http URL, or an upload — and nothing else. A
 * `data:` URL looks like it ought to work and fails with "wrong remote file
 * identifier", because Telegram reads any string as an id to look up rather
 * than as bytes to decode.
 */
async function upload(method: string, fields: Record<string, string>, file: { field: string; data: Buffer; name: string }): Promise<any> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append(file.field, new Blob([new Uint8Array(file.data)], { type: "image/png" }), file.name);

  const response = await fetch(`${API}/bot${botToken()}/${method}`, { method: "POST", body: form });
  const data = await response.json().catch(() => null);
  if (!data?.ok) throw new Error(`${method}: ${data?.description || response.status}`);
  return data.result;
}

async function sendPhoto(chatId: number, png: Buffer, caption: string): Promise<number> {
  const result = await upload(
    "sendPhoto",
    { chat_id: String(chatId), caption, parse_mode: "HTML" },
    { field: "photo", data: png, name: "qr.png" }
  );
  return result.message_id;
}

/** Replacing the picture in place, so a rotated QR doesn't add a new message. */
async function replacePhoto(chatId: number, messageId: number, png: Buffer, caption: string): Promise<void> {
  await upload(
    "editMessageMedia",
    {
      chat_id: String(chatId),
      message_id: String(messageId),
      media: JSON.stringify({ type: "photo", media: "attach://qr", caption, parse_mode: "HTML" }),
    },
    { field: "qr", data: png, name: "qr.png" }
  );
}

/**
 * Remove a message carrying a secret from the chat.
 *
 * A login code and, worse, a two-step password would otherwise sit in the
 * person's history indefinitely. Telegram does not always let a bot delete an
 * incoming message, so this is an attempt rather than a guarantee — the caller
 * tells them to delete it themselves if it fails.
 */
async function scrub(chatId: number | string, messageId?: number): Promise<boolean> {
  if (!messageId) return false;
  try {
    await call("deleteMessage", { chat_id: chatId, message_id: messageId });
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------ conversation ------------------------------ */

type Stage =
  | { name: "idle" }
  | { name: "awaiting_phone"; apiId: number; apiHash: string }
  | { name: "awaiting_code"; apiId: number; apiHash: string; phone: string }
  | { name: "awaiting_qr"; apiId: number; apiHash: string };

/**
 * In-process, like the half-open MTProto connection it shadows. Losing it on a
 * restart costs an unfinished login and nothing else — the account, once
 * connected, lives in the store.
 */
const stages = new Map<string, Stage>();
/** One operation per person at a time; /digest can take a while. */
const busy = new Set<string>();

function stageOf(userId: string): Stage {
  return stages.get(userId) || { name: "idle" };
}

function credentials(): { apiId: number; apiHash: string } | null {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  if (!apiId || !apiHash) return null;
  return { apiId, apiHash };
}

const HELP = `I read the Telegram channels you follow and keep a digest of them, grouped by topic. Ask me about it in plain language — "what happened today?", "anything about the rate decision?", "what did I miss this week?"

/connect — sign in with phone code
/qr — sign in with QR code (faster, scan with another device)
/topics — name the subjects you read for, so I skip the rest
/digest — read the new posts now and summarise them
/last — the most recent digest
/history — the digests I'm holding
/channels — what I read, what I skip, and why
/include, /exclude — overrule me on one channel
/forget — delete my copy of your session
/reset — forget our conversation, keep the digests`;

/* -------------------------------- commands -------------------------------- */

async function onConnect(userId: string, chatId: number, args: string[]): Promise<void> {
  const existing = await getAccount(userId);
  if (existing) {
    await send(
      chatId,
      "You're already connected. /digest reads what's new; /forget removes my copy of your session if you want to start over."
    );
    return;
  }

  // Credentials come from the environment normally; two arguments are the escape
  // hatch for someone running the bot without setting them.
  const env = credentials();
  const apiId = args[0] ? Number(args[0]) : env?.apiId;
  const apiHash = args[1] || env?.apiHash;

  if (!apiId || !apiHash) {
    await send(
      chatId,
      "I need Telegram API credentials before I can sign you in. Get them at https://my.telegram.org → API development tools, then either set TELEGRAM_API_ID and TELEGRAM_API_HASH where I'm running, or send:\n\n<code>/connect 123456 your_api_hash</code>"
    );
    return;
  }

  stages.set(userId, { name: "awaiting_phone", apiId, apiHash });
  await send(
    chatId,
    "Send me the phone number of your Telegram account, with the country code — like <code>+441234567890</code>.\n\nThis signs in as you, which is the only way to read channels you merely follow. /cancel stops."
  );
}

async function onPhone(userId: string, chatId: number, stage: Stage & { name: "awaiting_phone" }, text: string) {
  const phone = text.replace(/[^\d+]/g, "");
  if (!/^\+?\d{7,15}$/.test(phone)) {
    await send(chatId, "That doesn't look like a phone number. Try again with the country code, or /cancel.");
    return;
  }

  await typing(chatId);
  let sendCodeResponse: any;
  try {
    sendCodeResponse = await startLogin(userId, stage.apiId, stage.apiHash, phone.startsWith("+") ? phone : `+${phone}`);
  } catch (err: any) {
    stages.set(userId, { name: "idle" });
    await send(chatId, `Telegram refused that: ${escapeHtml(err?.errorMessage || err?.message || String(err))}\n\n/connect to try again.`);
    return;
  }

  stages.set(userId, { name: "awaiting_code", apiId: stage.apiId, apiHash: stage.apiHash, phone });

  const deliveryInfo = sendCodeResponse.type
    ? `<b>Code delivery method:</b> ${escapeHtml(sendCodeResponse.type)}${sendCodeResponse.nextType ? ` (also ${escapeHtml(sendCodeResponse.nextType)})` : ""}\n\n`
    : "";

  await send(
    chatId,
    `${deliveryInfo}Telegram has sent you a code. Send it back to me <b>with dashes between the digits</b> — like <code>1-2-3-4-5</code>.\n\nThe dashes matter: Telegram cancels any login code it sees posted in a chat, and a spaced-out code slips past that check. If you have two-step verification, add your password after the code: <code>1-2-3-4-5 mypassword</code> — I delete that message as soon as I've read it.`
  );
}

async function onCode(
  userId: string,
  chatId: number,
  stage: Stage & { name: "awaiting_code" },
  text: string,
  messageId?: number
) {
  const [first, ...rest] = text.trim().split(/\s+/);
  const code = first.replace(/\D/g, "");
  const password = rest.join(" ") || undefined;

  if (code.length < 4) {
    await send(chatId, "I need the login code — digits only, dashes are fine. /cancel to stop.");
    return;
  }

  // Before anything else: that message holds a code, and possibly a password.
  const scrubbed = await scrub(chatId, messageId);

  await typing(chatId);
  let login: CompletedLogin;
  try {
    login = await completeLogin(userId, code, password);
  } catch (err: any) {
    const message = err?.errorMessage || err?.message || String(err);
    // Two-step verification asks for a second factor; the login is still open,
    // so the stage stays put and they can answer without starting over.
    if (/two-step/i.test(message)) {
      await send(chatId, escapeHtml(message));
      return;
    }
    if (/PHONE_CODE_INVALID/i.test(message)) {
      await send(chatId, "That code was wrong. Send it again, or /connect to request a new one.");
      return;
    }
    stages.set(userId, { name: "idle" });
    await cancelLogin(userId);
    await send(chatId, `Sign-in failed: ${escapeHtml(message)}\n\n/connect to try again.`);
    return;
  }

  await setAccount(userId, {
    apiId: stage.apiId,
    apiHash: stage.apiHash,
    session: login.session,
    phone: stage.phone,
  });
  stages.set(userId, { name: "idle" });

  const warning =
    !scrubbed && password
      ? "\n\nI couldn't delete the message with your password in it — please remove it from this chat yourself."
      : "";
  await send(chatId, `Signed in. Reading the last day of your channels now — this takes a minute.${warning}`);
  await onDigest(userId, chatId, []);
}

const QR_CAPTION =
  "<b>Scan this with Telegram on another device</b>\n\nSettings → Devices → Link Desktop Device, then point the camera here. I refresh the picture as Telegram rotates it, so scan whatever is showing.\n\n/cancel stops.";

async function onQr(userId: string, chatId: number, args: string[]): Promise<void> {
  const existing = await getAccount(userId);
  if (existing) {
    await send(
      chatId,
      "You're already connected. /digest reads what's new; /forget removes my copy of your session if you want to start over."
    );
    return;
  }

  const env = credentials();
  const apiId = args[0] ? Number(args[0]) : env?.apiId;
  const apiHash = args[1] || env?.apiHash;

  if (!apiId || !apiHash) {
    await send(
      chatId,
      "I need Telegram API credentials before I can sign you in. Get them at https://my.telegram.org → API development tools, then either set TELEGRAM_API_ID and TELEGRAM_API_HASH where I'm running, or send:\n\n<code>/qr 123456 your_api_hash</code>"
    );
    return;
  }

  await typing(chatId);
  let messageId: number;
  try {
    const qr = await startQrLogin(userId, apiId, apiHash);
    messageId = await sendPhoto(chatId, qr.png, QR_CAPTION);
  } catch (err: any) {
    stages.set(userId, { name: "idle" });
    await cancelQrLogin(userId);
    await send(
      chatId,
      `Couldn't start a QR login: ${escapeHtml(err?.errorMessage || err?.message || String(err))}\n\n/connect signs in with a phone code instead.`
    );
    return;
  }

  stages.set(userId, { name: "awaiting_qr", apiId, apiHash });
  // Deliberately not awaited: the scan happens on another device over minutes,
  // and holding the per-user lock that long would block even /cancel.
  void watchQrScan(userId, chatId, apiId, apiHash, messageId);
}

async function watchQrScan(
  userId: string,
  chatId: number,
  apiId: number,
  apiHash: string,
  messageId: number
): Promise<void> {
  let login: CompletedLogin;
  try {
    login = await waitForQrLogin(userId, async (qr) => {
      await replacePhoto(chatId, messageId, qr.png, QR_CAPTION).catch(() => {});
    });
  } catch (err: any) {
    const message = err?.errorMessage || err?.message || String(err);
    if (stageOf(userId).name === "awaiting_qr") stages.set(userId, { name: "idle" });
    // /cancel already said its piece.
    if (message === "QR_CANCELLED") return;
    await send(
      chatId,
      message === "QR_EXPIRED"
        ? "That QR went unscanned and expired. /qr shows a fresh one."
        : `QR sign-in failed: ${escapeHtml(message)}\n\n/connect signs in with a phone code instead.`
    ).catch(() => {});
    return;
  }

  await setAccount(userId, { apiId, apiHash, session: login.session, phone: "" });
  stages.set(userId, { name: "idle" });

  // The digest can run for a while; take the same lock a command would.
  if (busy.has(userId)) {
    await send(chatId, `Signed in as ${escapeHtml(login.name)}. Send /digest when you're ready.`).catch(() => {});
    return;
  }
  busy.add(userId);
  try {
    await send(chatId, `Signed in as ${escapeHtml(login.name)}. Reading the last day of your channels now — this takes a minute.`);
    await onDigest(userId, chatId, []);
  } catch (err: any) {
    await send(chatId, `Something broke: ${escapeHtml(err?.message || String(err))}`).catch(() => {});
  } finally {
    busy.delete(userId);
  }
}

/**
 * The digest's own start time is the key.
 *
 * `callback_data` is capped at 64 bytes, and the digest id — user and timestamp
 * — does not reliably fit. The user is already known from the press, so only
 * the timestamp needs carrying, and it stays valid across restarts in a way a
 * counter or an index into the last listing would not.
 */
function readButton(digest: PeriodDigest): Record<string, unknown> {
  return {
    inline_keyboard: [
      [
        { text: "✓ Прочитано", callback_data: `read:${digest.from}` },
        { text: "Оставить", callback_data: `keep:${digest.from}` },
      ],
    ],
  };
}

async function onDigest(userId: string, chatId: number, args: string[]): Promise<void> {
  const account = await getAccount(userId);
  if (!account) {
    await send(chatId, "Not connected yet — /connect first.");
    return;
  }

  const hours = args[0] ? Math.min(72, Math.max(1, Number(args[0]) || 0)) : undefined;
  await typing(chatId);

  try {
    const { digest, empty } = await runDigest(userId, hours ? { hours } : {});
    if (empty) {
      await send(chatId, "Nothing new since I last looked. Ask me about anything I've already read.");
      return;
    }
    // No coverage, no button: without it there is no honest boundary to mark
    // up to, and guessing one would clear posts nothing ever summarised.
    const offer = digest.coverage?.length ? readButton(digest) : undefined;
    await send(chatId, renderDigest(digest), offer);
  } catch (err: any) {
    const message = err?.errorMessage || err?.message || String(err);
    if (/AUTH_KEY|SESSION_REVOKED|USER_DEACTIVATED/i.test(message)) {
      await clearAccount(userId);
      await send(chatId, "Telegram invalidated my session — that happens if you end the session from your account's device list. /connect to sign in again.");
      return;
    }
    await send(chatId, `Couldn't build a digest: ${escapeHtml(message)}`);
  }
}

async function onChannels(userId: string, chatId: number): Promise<void> {
  const account = await getAccount(userId);
  if (!account) {
    await send(chatId, "Not connected yet — /connect first.");
    return;
  }

  await typing(chatId);
  try {
    const [channels, topics, verdicts, overrides] = await Promise.all([
      listChannels(account),
      getTopics(userId),
      getVerdicts(userId),
      getOverrides(userId),
    ]);
    if (channels.length === 0) {
      await send(chatId, "I can't see any channels on this account. Groups and personal chats aren't included — only channels you follow.");
      return;
    }

    const reading: string[] = [];
    const skipping: string[] = [];
    const unjudged: string[] = [];

    for (const channel of channels) {
      const name = `${escapeHtml(channel.title)}${channel.username ? ` (@${escapeHtml(channel.username)})` : ""}`;
      const override = overrides[channel.id];
      if (override) {
        (override === "include" ? reading : skipping).push(`• ${name} — your choice`);
        continue;
      }
      const verdict = verdicts[channel.id];
      if (!verdict) {
        (topics.length > 0 ? unjudged : reading).push(`• ${name}`);
        continue;
      }
      (verdict.onTopic ? reading : skipping).push(`• ${name} — ${escapeHtml(verdict.reason)}`);
    }

    const sections: string[] = [
      topics.length > 0
        ? `<b>Reading for:</b> ${escapeHtml(topics.join(", "))}`
        : "<b>No subjects set</b> — I read everything. /topics narrows it.",
      "",
      `<b>Reading — ${reading.length}</b>`,
      ...reading,
    ];
    if (skipping.length > 0) sections.push("", `<b>Skipping — ${skipping.length}</b>`, ...skipping);
    if (unjudged.length > 0) {
      sections.push("", `<b>Not judged yet — ${unjudged.length}</b>`, ...unjudged, "", "I read these until I've seen enough to place them.");
    }
    sections.push("", "<code>/include название</code> or <code>/exclude название</code> overrules me.");

    await send(chatId, sections.join("\n"));
  } catch (err: any) {
    await send(chatId, `Couldn't list channels: ${escapeHtml(err?.message || String(err))}`);
  }
}

async function onTopics(userId: string, chatId: number, args: string[]): Promise<void> {
  const account = await getAccount(userId);
  if (!account) {
    await send(chatId, "Not connected yet — /connect first.");
    return;
  }

  const raw = args.join(" ").trim();

  if (!raw) {
    const topics = await getTopics(userId);
    await send(
      chatId,
      topics.length === 0
        ? "No subjects set — I read every channel you follow.\n\nName them and I'll stop reading the rest: <code>/topics AI, стартапы</code>."
        : `Reading for: <b>${escapeHtml(topics.join(", "))}</b>\n\n/channels shows what that lets through. <code>/topics -</code> goes back to everything.`
    );
    return;
  }

  if (raw === "-" || /^(clear|off|все|всё)$/i.test(raw)) {
    await setTopics(userId, []);
    await send(chatId, "Subjects cleared — I'm back to reading every channel.");
    return;
  }

  const topics = raw
    .split(/[,;\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (topics.length === 0) {
    await send(chatId, "I couldn't read any subjects in that. Try <code>/topics AI, стартапы</code>.");
    return;
  }

  if (!canTriage()) {
    // Storing them would be worse than refusing: subjects that filter nothing
    // still change what the summariser writes, so the bot would look like it
    // was obeying while reading everything.
    await send(chatId, "I can't judge channels without a summarising model configured (ANTHROPIC_API_KEY), so subjects wouldn't do anything yet.");
    return;
  }

  await setTopics(userId, topics);
  await send(chatId, `Set: <b>${escapeHtml(topics.join(", "))}</b>\n\nReading a few posts from each channel to see which ones qualify — a moment.`);
  await typing(chatId);

  try {
    const { verdicts, channels, everythingExcluded } = await triage(account, topics);

    if (channels.length === 0) {
      await send(chatId, "I can't see any channels on this account, so there was nothing to judge.");
      return;
    }
    if (everythingExcluded) {
      // Saving this leaves a bot that reads nothing and cannot explain itself.
      await send(
        chatId,
        `None of your ${channels.length} channels look like they cover that. I've left the filter off rather than leave you with empty digests — try broader wording, or /channels to sort them yourself.`
      );
      return;
    }

    await setVerdicts(userId, verdicts);
    const kept = Object.values(verdicts).filter((v) => v.onTopic).length;
    const dropped = Object.values(verdicts).length - kept;
    await send(
      chatId,
      `Keeping <b>${kept}</b> of ${channels.length} channels, skipping ${dropped}.\n\n/channels shows which and why — <code>/include название</code> puts one back. /digest reads them now.`
    );
  } catch (err: any) {
    await send(
      chatId,
      `I set the subjects but couldn't judge the channels: ${escapeHtml(err?.message || String(err))}\n\nUntil that works I'll keep reading all of them. /topics again to retry.`
    );
  }
}

/**
 * Matching a channel by what the person typed.
 *
 * By name rather than by a number from the last listing: the numbering would
 * shift between listings, and acting on the wrong channel is invisible until a
 * digest comes back missing something.
 */
async function resolveChannel(
  userId: string,
  chatId: number,
  query: string
): Promise<{ id: string; title: string } | null> {
  const account = await getAccount(userId);
  if (!account) {
    await send(chatId, "Not connected yet — /connect first.");
    return null;
  }

  const channels = await listChannels(account);
  const needle = query.toLowerCase().replace(/^@/, "");
  const hits = channels.filter(
    (c) => c.title.toLowerCase().includes(needle) || (c.username || "").toLowerCase().includes(needle)
  );

  if (hits.length === 0) {
    await send(chatId, `No channel of yours matches “${escapeHtml(query)}”. /channels lists them.`);
    return null;
  }
  if (hits.length > 1) {
    const names = hits.slice(0, 8).map((c) => `• ${escapeHtml(c.title)}`);
    await send(chatId, [`“${escapeHtml(query)}” matches ${hits.length} channels — be more specific:`, "", ...names].join("\n"));
    return null;
  }
  return { id: hits[0].id, title: hits[0].title };
}

async function onOverride(
  userId: string,
  chatId: number,
  args: string[],
  choice: "include" | "exclude"
): Promise<void> {
  const query = args.join(" ").trim();
  if (!query) {
    await send(chatId, `Which channel? <code>/${choice} часть названия</code>.`);
    return;
  }

  await typing(chatId);
  const channel = await resolveChannel(userId, chatId, query);
  if (!channel) return;

  await setOverride(userId, channel.id, choice);
  await send(
    chatId,
    choice === "include"
      ? `Reading <b>${escapeHtml(channel.title)}</b> from now on, whatever I make of its subject.`
      : `Skipping <b>${escapeHtml(channel.title)}</b> from now on. <code>/include ${escapeHtml(channel.title)}</code> undoes it.`
  );
}

async function onHistory(userId: string, chatId: number): Promise<void> {
  const digests = await listDigests(userId);
  if (digests.length === 0) {
    await send(chatId, "No digests yet. /digest builds the first one.");
    return;
  }
  const lines = digests
    .slice(0, 20)
    .map((d) => `• ${d.from.slice(0, 16).replace("T", " ")} — ${d.topics.length} topics, ${d.postCount} posts`);
  await send(
    chatId,
    [`<b>${digests.length} digests</b>`, "", ...lines, "", "Ask about any of it in plain language."].join("\n")
  );
}

/* ---------------------------- marking read ------------------------------- */

/** Buttons stay on screen until answered, and a stale one is worse than none. */
async function dropButtons(chatId: number, messageId: number): Promise<void> {
  await call("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId }).catch(() => {});
}

async function onReadPress(
  userId: string,
  chatId: number,
  messageId: number,
  from: string
): Promise<string> {
  const account = await getAccount(userId);
  if (!account) return "Not connected any more — nothing to mark.";

  const digest = await getDigest(`${userId}:${from}`);
  if (!digest) return "I no longer hold that digest, so I can't tell what it covered.";
  if (!digest.coverage?.length) return "I didn't record what that digest covered, so I won't guess at what to mark.";
  if (digest.readMarkedAt) return "Already marked.";

  // Claimed before the work, so a double press cannot report success twice.
  if (!(await claimReadMark(digest.id))) return "Already marked.";

  await dropButtons(chatId, messageId);
  await typing(chatId);

  let outcome;
  try {
    outcome = await markRead(account, digest.coverage);
  } catch (err) {
    // The claim was taken before the work; hand it back so this can be retried
    // rather than leaving a digest that claims to be marked and a Telegram that
    // disagrees.
    await releaseReadMark(digest.id);
    throw err;
  }

  const parts = [`Marked ${outcome.marked} channel(s) read in Telegram.`];
  // The pointer only moves forward, so these are not failures worth alarm —
  // but reporting the whole count as marked would overstate what happened.
  if (outcome.alreadyRead > 0) parts.push(`${outcome.alreadyRead} were already read past that point.`);
  if (outcome.gone > 0) parts.push(`${outcome.gone} you no longer follow.`);
  return parts.join(" ");
}

async function handleCallback(query: any): Promise<void> {
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  const userId = String(query.from?.id ?? chatId);
  const data = String(query.data || "");

  // Telegram spins the button until the query is answered, so every path must
  // reach `answerCallbackQuery` — including the ones that fail.
  const answer = (text?: string) =>
    call("answerCallbackQuery", { callback_query_id: query.id, ...(text ? { text } : {}) }).catch(() => {});

  if (!chatId || !messageId) {
    await answer();
    return;
  }

  const [action, from] = [data.slice(0, data.indexOf(":")), data.slice(data.indexOf(":") + 1)];

  if (action === "keep") {
    await dropButtons(chatId, messageId);
    await answer("Left as it is.");
    return;
  }

  if (action !== "read") {
    await answer();
    return;
  }

  if (busy.has(userId)) {
    await answer("Still working on something else — try again in a moment.");
    return;
  }

  busy.add(userId);
  try {
    const result = await onReadPress(userId, chatId, messageId, from);
    await answer();
    await send(chatId, escapeHtml(result));
  } catch (err: any) {
    console.error(`read-mark failed for ${userId}:`, err);
    await answer();
    await send(
      chatId,
      `Couldn't mark those read: ${escapeHtml(err?.errorMessage || err?.message || String(err))}`
    ).catch(() => {});
  } finally {
    busy.delete(userId);
  }
}

/* ------------------------------- dispatching ------------------------------ */

async function handleText(
  userId: string,
  chatId: number,
  text: string,
  messageId?: number
): Promise<void> {
  const trimmed = text.trim();
  const isCommand = trimmed.startsWith("/");
  // Group mentions arrive as /digest@thebot.
  const [rawCommand, ...args] = trimmed.split(/\s+/);
  const command = isCommand ? rawCommand.split("@")[0].toLowerCase() : "";

  if (command === "/cancel") {
    stages.set(userId, { name: "idle" });
    await cancelLogin(userId);
    await cancelQrLogin(userId);
    await send(chatId, "Stopped.");
    return;
  }

  const stage = stageOf(userId);
  if (!isCommand && stage.name === "awaiting_phone") return onPhone(userId, chatId, stage, trimmed);
  if (!isCommand && stage.name === "awaiting_code") return onCode(userId, chatId, stage, trimmed, messageId);
  if (!isCommand && stage.name === "awaiting_qr") {
    await send(chatId, "Still waiting for that QR to be scanned — /cancel stops, /connect switches to a phone code.");
    return;
  }

  switch (command) {
    case "/start":
    case "/help":
      await send(chatId, HELP);
      return;
    case "/connect":
      return onConnect(userId, chatId, args);
    case "/qr":
      return onQr(userId, chatId, args);
    case "/digest":
      return onDigest(userId, chatId, args);
    case "/channels":
      return onChannels(userId, chatId);
    case "/topics":
      return onTopics(userId, chatId, args);
    case "/include":
      return onOverride(userId, chatId, args, "include");
    case "/exclude":
      return onOverride(userId, chatId, args, "exclude");
    case "/history":
      return onHistory(userId, chatId);
    case "/last": {
      const digest = await latestDigest(userId);
      await send(chatId, digest ? renderDigest(digest) : "No digests yet — /digest builds the first one.");
      return;
    }
    case "/reset":
      await clearChat(userId);
      await send(chatId, "Conversation forgotten. The digests are still here.");
      return;
    case "/forget":
      await clearAccount(userId);
      stages.set(userId, { name: "idle" });
      await cancelLogin(userId);
      await cancelQrLogin(userId);
      await send(chatId, "Session deleted. Your digests remain — /forget doesn't touch them. /connect to sign in again.");
      return;
  }

  if (isCommand) {
    await send(chatId, "I don't know that one. /help lists what I do.");
    return;
  }

  if (loginPending(userId)) {
    await send(chatId, "I'm still waiting on your login code — send it with dashes, or /cancel.");
    return;
  }

  if (qrLoginPending(userId)) {
    await send(chatId, "I'm still waiting for that QR to be scanned — /cancel stops it.");
    return;
  }

  await typing(chatId);
  const history = await getChat(userId);
  const answer = await answerFromDigests(userId, trimmed, history);
  await appendChat(userId, [
    { role: "user", content: trimmed },
    { role: "assistant", content: answer },
  ]);
  await send(chatId, escapeHtml(answer));
}

/** Exported so a webhook deployment — or a test — can feed updates in directly. */
export async function handleUpdate(update: any): Promise<void> {
  if (update.callback_query) return handleCallback(update.callback_query);

  // Only fresh messages: re-running a command because someone fixed a typo in it
  // would surprise them, and `allowed_updates` below doesn't request edits anyway.
  const message = update.message;
  const text: string | undefined = message?.text;
  if (!text || !message.chat) return;

  const chatId = message.chat.id;
  const userId = String(message.from?.id ?? chatId);

  if (busy.has(userId)) {
    await send(chatId, "Still working on the last one — one moment.").catch(() => {});
    return;
  }

  busy.add(userId);
  try {
    await handleText(userId, chatId, text, message.message_id);
  } catch (err: any) {
    console.error(`update failed for ${userId}:`, err);
    await send(chatId, `Something broke: ${escapeHtml(err?.message || String(err))}`).catch(() => {});
  } finally {
    busy.delete(userId);
  }
}

/* --------------------------------- polling -------------------------------- */

let running = false;

export async function startBot(): Promise<void> {
  let me: any;
  try {
    me = await call("getMe", {});
  } catch (err: any) {
    const message = err?.message || String(err);
    // The two startup failures worth telling apart: a token that isn't a token,
    // and a network that can't reach Telegram at all.
    if (/401|[Uu]nauthorized/.test(message)) {
      throw new Error(
        "Telegram rejected the bot token. Check TELEGRAM_BOT_TOKEN in your .env — it should look like 123456789:AAH... and come from @BotFather."
      );
    }
    throw new Error(`${message}\n\nThe bot needs to reach api.telegram.org. Check your connection or proxy.`);
  }
  console.log(`Bot @${me.username} listening.`);

  await call("setMyCommands", {
    commands: [
      { command: "connect", description: "sign in so I can read your channels" },
      { command: "digest", description: "read what's new and summarise it" },
      { command: "last", description: "the most recent digest" },
      { command: "history", description: "digests I'm holding" },
      { command: "channels", description: "channels I can see" },
      { command: "reset", description: "forget our conversation" },
      { command: "forget", description: "delete my copy of your session" },
    ],
  }).catch(() => {});

  running = true;
  let offset = 0;
  let backoff = 1000;

  while (running) {
    try {
      const updates: any[] = await call("getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: ["message", "callback_query"],
      });
      backoff = 1000;

      for (const update of updates) {
        offset = update.update_id + 1;
        // Not awaited: a long /digest must not stall everyone else's messages.
        void handleUpdate(update);
      }
    } catch (err: any) {
      const message = err?.message || String(err);
      if (/409/.test(message)) {
        console.error("Another poller is holding this bot token — stopping.");
        return;
      }
      console.error(`getUpdates failed (${message}); retrying in ${backoff}ms`);
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 60_000);
    }
  }
}

export function stopBot(): void {
  running = false;
}
