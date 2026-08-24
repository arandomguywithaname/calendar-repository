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
import { answerFromDigests, newsBriefing } from "./converse";
import { chunk, escapeHtml, renderDigest, wellFormed } from "./format";
import { billingConfigured, billingRequired, paymentLinkFor, portalLink, setBillingNotifier } from "./billing";
import { mcpUrl } from "./mcp";
import { connectUrl, setSlackNotifier, slackOauthConfigured } from "./slack-connect";
import { LEARN_EVERY, learnFocus } from "./auto";
import { isModeName, modeBlurb, modeLabel, MODES, presetProfile } from "./modes";
import { appLabel, connectedApps } from "./sources";
import { runChannelDigest, runDigest } from "./pipeline";
import { canTriage, triage } from "./triage";
import { ModeName, PeriodDigest, TelegramAccount } from "./types";
import {
  appendChat,
  claimReadMark,
  clearAccount,
  clearChat,
  closeDigest,
  closeOpenDigests,
  getAccount,
  getChat,
  getDigest,
  getFocus,
  getNames,
  getOrCreateMcpToken,
  getOverrides,
  getConnections,
  getMode,
  getSuspensions,
  hasStripeCustomer,
  noteDigestClosed,
  isSuspended,
  getTopics,
  getVerdicts,
  latestDigest,
  latestMarkableDigest,
  listAccounts,
  listDigests,
  openDigest,
  releaseReadMark,
  rotateMcpToken,
  clearConnection,
  setAccount,
  setConnections,
  setFocus,
  setName,
  setSuspension,
  setOverride,
  switchMode,
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
  for (const [index, rawPart] of parts.entries()) {
    // The 4096-char split can cut an emoji in half too; Telegram's parser is
    // no fonder of lone surrogates than the model API's.
    const part = wellFormed(rawPart);
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

I work through your unread backlog from the oldest post forward, one digest at a time. Each digest ends with two buttons — mark its channels read in Telegram, or leave them unread — and I wait for your answer before building the next one. Plain words work too: «прочитано» does what the ✓ button does, «дальше» builds the next digest.

/connect — sign in with phone code
/qr — sign in with QR code (faster, scan with another device)
/news тема — search the web and report what actually happened, with sources\n/mode — auto, cultural, work or custom reading modes\n/sources — add Slack and other messengers to your digests\n/topics — name the subjects you read for, so I skip the rest
/focus — say what matters within those subjects; the rest shrinks to one line
/digest — the next digest from your unread queue (/digest 24 re-reads a recent day instead)
/channel название — one channel's unread backlog, same logic, filter or no filter
/last — the most recent digest
/history — the digests I'm holding
/channels — what I read, what I skip, and why
/include, /exclude — overrule me on one channel
/mcp — a connector URL so your own claude.ai can read these digests
/pay — subscribe or renew\n/billing — manage your card or cancel
/forget — delete my copy of your session
/reset — forget our conversation, keep the digests`;

/* -------------------------------- commands -------------------------------- */

/**
 * The operator, named by environment rather than stored: whoever controls the
 * deployment controls ADMIN_USER_ID, which is exactly the person suspension
 * should answer to. Unset means no admin commands exist at all.
 */
function isAdmin(userId: string): boolean {
  const admin = (process.env.ADMIN_USER_ID || "").trim();
  return admin !== "" && userId === admin;
}

const SUSPENDED_NOTICE =
  "This bot is paused for your account — the subscription is inactive. Your digests and settings are kept and come back the moment it's resumed. /pay renews the subscription; anything else, contact the person who runs the bot.";

/**
 * The client's checkout link. Their Telegram id rides in it, which is the
 * whole trick: when Stripe reports the checkout done, the id comes back and
 * the webhook knows whose switch to flip.
 */
/**
 * Lock a brand-new account until it pays, when the operator asked for that.
 *
 * Applied at sign-in only, so anyone already using the bot keeps working when
 * the flag goes on. Someone who paid before and reconnected later is
 * recognised by their Stripe customer link and let straight through.
 *
 * Returns true when the account was locked, so the caller can say so instead
 * of promising a digest that will not come.
 */
async function gateNewAccount(userId: string, chatId: number): Promise<boolean> {
  if (!billingRequired() || isAdmin(userId)) return false;
  if (await hasStripeCustomer(userId)) return false;
  await setSuspension(userId, true);
  await send(
    chatId,
    `Signed in. This bot runs on a subscription — /pay opens the checkout, and everything switches on the moment the payment goes through.\n\n${escapeHtml(paymentLinkFor(userId))}`
  );
  return true;
}

/**
 * "Go and find out", as opposed to "tell me what my channels said".
 *
 * The digests answer what this person's own sources reported; this answers
 * what happened, checked against the open web. Separate command because the
 * two are different promises and blurring them is how a reader stops trusting
 * either.
 */
async function onNews(userId: string, chatId: number, args: string[]): Promise<void> {
  const subject = args.join(" ").trim();
  if (!subject) {
    const topics = await getTopics(userId);
    await send(
      chatId,
      topics.length
        ? `<code>/news тема</code> — I'll search the web and tell you what actually happened, with sources.\n\nFor example: <code>/news ${escapeHtml(topics[0])}</code>`
        : "<code>/news тема</code> — I'll search the web and tell you what actually happened, with sources. For example: <code>/news ставка ЕЦБ</code> or <code>/news Amazon</code>."
    );
    return;
  }

  await typing(chatId);
  try {
    await send(chatId, await newsBriefing(userId, subject));
  } catch (err: any) {
    await send(chatId, `Couldn't read the news on that: ${escapeHtml(err?.message || String(err))}`);
  }
}

/**
 * Reading modes: the two filters, preset and named.
 *
 * Switching parks the settings of the mode being left and loads the other's,
 * so going back and forth costs nothing and re-buys no triage. Entering a
 * preset mode for the first time is the one case that needs re-examining the
 * channels, because its subjects are new.
 */
async function onMode(userId: string, chatId: number, args: string[]): Promise<void> {
  const current = await getMode(userId);
  const asked = (args[0] || "").toLowerCase();

  if (!asked) {
    const list = (["auto", "cultural", "work", "custom"] as ModeName[])
      .map((m) => `${m === current ? "▸" : " "} <b>/mode ${m}</b> — ${modeBlurb(m)}`)
      .join("\n");
    await send(
      chatId,
      `You're reading in <b>${modeLabel(current)}</b> mode.\n\n${list}\n\nEach mode keeps its own subjects and brief, so switching back is instant. /topics and /focus still edit whichever mode you're in.`
    );
    return;
  }

  if (!isModeName(asked)) {
    await send(chatId, "Modes are <b>auto</b>, <b>cultural</b>, <b>work</b> and <b>custom</b>. /mode on its own shows what each reads for.");
    return;
  }

  const { changed, fresh } = await switchMode(userId, asked, (active) => presetProfile(asked, active));
  if (!changed) {
    await send(chatId, `Already in <b>${modeLabel(asked)}</b> mode. /mode lists the others.`);
    return;
  }

  const lines = [`Switched to <b>${modeLabel(asked)}</b> — ${modeBlurb(asked)}.`];
  if (asked === "auto") {
    lines.push("", "I'll work out what you read for from which digests you actually work through and what you ask me about, and tell you each time I revise it. /focus overrules me whenever you like.");
  } else if (fresh && (asked === "cultural" || asked === "work")) {
    lines.push(
      "",
      `Subjects: <i>${escapeHtml(MODES[asked].topics.slice(0, 6).join(", "))}…</i>`,
      "",
      "These are new subjects, so I need to look at your channels again before the next digest — /channels shows the result. /topics and /focus adjust this mode without leaving it."
    );
  } else {
    lines.push("", "Restored the subjects and brief you had in this mode.");
  }
  await send(chatId, lines.join("\n"));

  // A fresh preset means channels judged against subjects nobody has judged
  // them against yet; without this the first digest reads on last mode's
  // verdicts. Done after the reply so the person is not left waiting.
  if (fresh && (asked === "cultural" || asked === "work") && canTriage()) {
    void retriageForMode(userId, chatId).catch((err) =>
      console.warn(`mode re-triage failed for ${userId}: ${err?.message || err}`)
    );
  }

  if (asked === "auto") void announceLearned(userId, chatId);
}

async function retriageForMode(userId: string, chatId: number): Promise<void> {
  const account = await getAccount(userId);
  if (!account) return;
  const topics = await getTopics(userId);
  if (topics.length === 0) return;
  const { verdicts, channels, everythingExcluded } = await triage(account, topics);
  if (everythingExcluded) {
    await send(chatId, "None of your channels look like they cover this mode's subjects, so I've left the filter off rather than give you empty digests. /channels to sort them yourself.");
    return;
  }
  await setVerdicts(userId, verdicts);
  const kept = Object.values(verdicts).filter((v) => v.onTopic).length;
  await send(chatId, `Looked at your channels for this mode: keeping <b>${kept}</b> of ${channels.length}. /channels shows which and why.`);
}

/**
 * A digest was answered. In auto mode that is the evidence, so count it and
 * refresh the brief every few — unawaited, because the person is owed their
 * confirmation now, not after a model call.
 */
async function noteEngagement(userId: string, chatId: number): Promise<void> {
  if (!(await noteDigestClosed(userId, LEARN_EVERY))) return;
  void announceLearned(userId, chatId);
}

/** Auto's refresh, said out loud — a brief that changes silently cannot be corrected. */
async function announceLearned(userId: string, chatId: number): Promise<void> {
  const learned = await learnFocus(userId);
  if (!learned) return;
  await send(
    chatId,
    `From how you've been using me, I've set your brief to:\n<i>${escapeHtml(learned)}</i>\n\n/focus rewrites it if I've read you wrong.`
  ).catch(() => {});
}

/**
 * The other messengers, listed with how to add them.
 *
 * Telegram is deliberately absent: it is not a source you connect here, it is
 * the account this whole conversation runs on.
 */
async function onSources(userId: string, chatId: number): Promise<void> {
  const connections = await getConnections(userId);
  const live = connectedApps(connections);
  const lines = [
    live.length
      ? `Also reading: <b>${live.map(appLabel).map(escapeHtml).join(", ")}</b>. Their messages join the same digests as your channels.`
      : "Right now I read your Telegram channels only.",
    "",
    slackOauthConfigured()
      ? "<b>Slack</b> — send <code>/slack</code> and press the link. It opens Slack's own sign-in, you press Allow, and the conversations you can see join your digests. <code>/slack off</code> disconnects."
      : "<b>Slack</b> — <code>/slack xoxp-…</code>. No Slack app is registered for this bot yet, so connecting means creating one at api.slack.com/apps and pasting its token. Ask the operator to register one and it becomes a one-tap sign-in.",
    "",
    "<b>WhatsApp</b> — personal chats can't be read by anything but WhatsApp itself; there is no API for it, and the tools that claim otherwise drive the account towards a ban. What does work is a WhatsApp <i>Business</i> number whose webhook points at this bot, which then accumulates what arrives from that moment on. Ask if you want that set up.",
    "",
    "<b>Gmail</b> — the connector exists but needs a Google consent screen, which is a setup step rather than a pasted token. Not wired to the bot yet.",
  ];
  await send(chatId, lines.join("\n"));
}

/** Slack, connected by pasting a token — no consent screen, no redirect URL. */
async function onSlack(userId: string, chatId: number, args: string[]): Promise<void> {
  const value = (args[0] || "").trim();

  // With the app registered, connecting is a login: one link, Slack's own
  // consent screen, nothing to paste. The token path below stays for whoever
  // runs this without registering an app — but it is the fallback, not the
  // route a subscriber should ever be walked through.
  if (!value && slackOauthConfigured()) {
    const { slackToken, slackTeam } = await getConnections(userId);
    const link = connectUrl(userId);
    await send(
      chatId,
      slackToken
        ? `Slack is connected${slackTeam ? ` to <b>${escapeHtml(slackTeam)}</b>` : ""}. Its conversations join your digests.\n\n<a href="${escapeHtml(link)}">Reconnect</a> to switch workspace, or <code>/slack off</code> to disconnect.`
        : `<a href="${escapeHtml(link)}">Connect Slack</a> — the link opens Slack, you press Allow, and that's it. Nothing to paste.\n\nThe link is yours alone and expires in 15 minutes.`
    );
    return;
  }

  if (!value) {
    const { slackToken } = await getConnections(userId);
    await send(
      chatId,
      slackToken
        ? "Slack is connected. Its messages join your digests. <code>/slack off</code> disconnects it; <code>/slack xoxp-…</code> replaces the token."
        : "Send <code>/slack xoxp-…</code> with a Slack token to connect it. /sources explains where to get one."
    );
    return;
  }
  if (value === "off") {
    await clearConnection(userId, ["slackToken", "slackTeam"]);
    await send(chatId, "Slack disconnected. Your digests go back to Telegram only.");
    return;
  }
  if (value !== "off" && !slackOauthConfigured() && !/^xox[bp]-/.test(value)) {
    await send(chatId, "That doesn't look like a Slack token — they start with <code>xoxp-</code> or <code>xoxb-</code>. /sources explains where to find one.");
    return;
  }
  if (!/^xox[bp]-/.test(value)) {
    await send(chatId, "That doesn't look like a Slack token — they start with <code>xoxp-</code> or <code>xoxb-</code>. /sources explains where to find one.");
    return;
  }

  // A token that cannot list conversations is worth rejecting now, while the
  // person is still here to fix it, rather than silently at the next digest.
  await typing(chatId);
  try {
    const { connectors } = await import("../reader/connectors");
    const chats = await connectors.slack.listChats({ slackToken: value });
    await setConnections(userId, { slackToken: value });
    await scrub(chatId, undefined);
    await send(
      chatId,
      `Slack connected — I can see <b>${chats.length}</b> conversation(s). They'll be part of your next digest. /sources shows what's connected.`
    );
  } catch (err: any) {
    await send(chatId, `Slack refused that token: ${escapeHtml(err?.message || String(err))}\n\nCheck the scopes at api.slack.com/apps, then try again.`);
  }
}

/** Where a client manages their own card, invoices, and cancellation. */
async function onBilling(userId: string, chatId: number): Promise<void> {
  const portal = portalLink();
  if (!portal) {
    await send(
      chatId,
      isAdmin(userId)
        ? "No portal configured. Create one in Stripe → Settings → Billing → Customer portal, then set STRIPE_PORTAL_LINK."
        : "Contact the person who runs the bot to change your subscription."
    );
    return;
  }
  await send(
    chatId,
    `Manage your subscription — card, invoices, cancellation:\n${escapeHtml(portal)}\n\nSign in there with the email you paid with. /pay is for starting a new subscription.`
  );
}

async function onPay(userId: string, chatId: number): Promise<void> {
  if (!billingConfigured()) {
    await send(
      chatId,
      isAdmin(userId)
        ? "Billing isn't configured. Set STRIPE_PAYMENT_LINK and STRIPE_WEBHOOK_SECRET as Fly secrets — the deploy notes explain where each comes from."
        : "Payments aren't set up here yet — contact the person who runs the bot."
    );
    return;
  }
  await send(
    chatId,
    `Subscribe here:\n${escapeHtml(paymentLinkFor(userId))}\n\nThe link is personal — it tells the payment to your account. Once the payment goes through, access switches on (or stays on) automatically, and if a renewal ever fails the bot pauses until it's fixed.`
  );
}

/**
 * The per-customer kill switch, admin only.
 *
 * /suspend with no arguments doubles as the client list, because the admin
 * needs the numeric ids from somewhere before they can name one. Suspension
 * deletes nothing — the whole point is that resuming is instant.
 */
async function onSuspend(chatId: number, args: string[], suspend: boolean): Promise<void> {
  if (args.length === 0) {
    const [accounts, suspensions, names] = [await listAccounts(), await getSuspensions(), await getNames()];
    if (accounts.length === 0) {
      await send(chatId, "No connected accounts yet.");
      return;
    }
    const describe = (userId: string, phone?: string, note?: string) => {
      const who = names[userId] || "(no name yet — they'll be named when they next message me)";
      const tel = phone ? ` · +${escapeHtml(phone.replace(/^\+/, ""))}` : "";
      const state = suspensions[userId] ? ` — suspended since ${suspensions[userId].slice(0, 10)}` : "";
      return `<b>${escapeHtml(who)}</b>${tel}${note ? ` ${note}` : ""}${state}\n  id: <code>${escapeHtml(userId)}</code>`;
    };
    const lines = accounts.map(({ userId, account }) => describe(userId, account.phone));
    // Suspended users who deleted their session via /forget would vanish from
    // listAccounts; show them anyway so an unsuspend is always possible.
    for (const userId of Object.keys(suspensions)) {
      if (!accounts.some((a) => a.userId === userId)) lines.push(describe(userId, undefined, "(no session)"));
    }
    await send(chatId, `Connected accounts:\n\n${lines.join("\n")}\n\n<code>/suspend id</code> pauses one, <code>/unsuspend id</code> resumes.`);
    return;
  }

  const target = args[0];
  if (isAdmin(target)) {
    await send(chatId, "That's you — suspending the admin would be a lock without a key.");
    return;
  }
  const changed = await setSuspension(target, suspend);
  await send(
    chatId,
    changed
      ? suspend
        ? `Suspended <code>${escapeHtml(target)}</code>: no digests will be built, and their bot and connector answer with a subscription notice. /unsuspend restores everything.`
        : `Resumed <code>${escapeHtml(target)}</code> — digests, conversation and connector are back.`
      : `<code>${escapeHtml(target)}</code> was already ${suspend ? "suspended" : "active"}.`
  );
}

/**
 * The standing editorial brief — what digests should prioritise.
 *
 * Deliberately free text: /topics is a hard filter over channels, while this
 * is a soft criterion applied inside them, and only words can carry "things I
 * can take into use, not launch announcements". Spoken phrases in chat edit
 * the same text through the update_focus tool.
 */
async function onFocus(userId: string, chatId: number, args: string[]): Promise<void> {
  if (args.length === 0) {
    const focus = await getFocus(userId);
    await send(
      chatId,
      focus
        ? `Your digests currently read for:\n<i>${escapeHtml(focus)}</i>\n\n<code>/focus текст</code> replaces it, <code>/focus -</code> clears it. Or just tell me in plain words — «меньше про бенчмарки».`
        : `No brief set — digests cover everything their subjects allow.\n\nWrite one in your own words, e.g.:\n<code>/focus интересно применимое: агенты, организация труда, экономика токенов; анонсы очередных моделей — одной строкой</code>`
    );
    return;
  }
  if (args.length === 1 && args[0] === "-") {
    await setFocus(userId, "");
    await send(chatId, "Brief cleared — digests go back to covering everything their subjects allow.");
    return;
  }
  const text = args.join(" ");
  await setFocus(userId, text);
  await send(
    chatId,
    `Noted. From the next digest on, I'll read for:\n<i>${escapeHtml(text)}</i>\n\nStories outside it get one line in «Briefly» rather than vanishing, so you can catch me misjudging. /focus - clears it.`
  );
}

/**
 * The connector URL for the person's own Claude.
 *
 * The URL is the credential — whoever holds it reads these digests — so it is
 * only ever spoken here, in the person's private chat with the bot, and
 * `/mcp new` is the revocation: it deletes the old token, and every saved
 * copy of the old URL stops working at once.
 */
async function onMcp(userId: string, chatId: number, args: string[]): Promise<void> {
  const rotate = args[0] === "new";
  const token = rotate ? await rotateMcpToken(userId) : await getOrCreateMcpToken(userId);
  const url = mcpUrl(token);
  const lines = [
    rotate
      ? "New connector URL — the old one no longer works:"
      : "Your personal connector URL for claude.ai:",
    `<code>${escapeHtml(url)}</code>`,
    "",
    "In claude.ai: Settings → Connectors → Add custom connector → paste this URL. Your Claude can then read these digests in any conversation — ask it about trends, or anything the channels covered.",
    "",
    "Treat the URL like a password: anyone who has it can read your digests (and nothing else — it can't mark anything read or touch Telegram). <code>/mcp new</code> replaces it if it leaks.",
  ];
  await send(chatId, lines.join("\n"));
}

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
  await setName(userId, login.name);
  stages.set(userId, { name: "idle" });

  if (await gateNewAccount(userId, chatId)) return;

  const warning =
    !scrubbed && password
      ? "\n\nI couldn't delete the message with your password in it — please remove it from this chat yourself."
      : "";
  await send(chatId, `Signed in. Starting on your unread backlog, oldest first — this takes a minute.${warning}`);
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

  await setAccount(userId, { apiId, apiHash, session: login.session, phone: login.phone || "" });
  await setName(userId, login.name);
  stages.set(userId, { name: "idle" });

  if (await gateNewAccount(userId, chatId)) return;

  // The digest can run for a while; take the same lock a command would.
  if (busy.has(userId)) {
    await send(chatId, `Signed in as ${escapeHtml(login.name)}. Send /digest when you're ready.`).catch(() => {});
    return;
  }
  busy.add(userId);
  try {
    await send(chatId, `Signed in as ${escapeHtml(login.name)}. Starting on your unread backlog, oldest first — this takes a minute.`);
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
function readMarkup(from: string): Record<string, unknown> {
  return {
    inline_keyboard: [
      [
        { text: "✓ Mark read", callback_data: `read:${from}` },
        { text: "Leave unread", callback_data: `keep:${from}` },
      ],
    ],
  };
}

function readButton(digest: PeriodDigest): Record<string, unknown> {
  return readMarkup(digest.from);
}

/**
 * One line of queue position under a step, so "why is nothing arriving" and
 * "how much is left" are answered where the person is already looking.
 */
function queueFooter(backlog: number): string {
  if (backlog <= 0) return "";
  return `\n\n<i>≈${backlog} posts still queued — close this digest and the next one continues from there.</i>`;
}

/**
 * Build and offer the next queue step. Shared by /digest and the timer — the
 * only difference is that the timer stays silent when there is nothing to say.
 */
async function deliverNextStep(userId: string, chatId: number | string, quiet: boolean): Promise<void> {
  const { digest, empty, backlog } = await runDigest(userId, {});
  if (empty) {
    if (!quiet) {
      await send(
        chatId,
        backlog > 0
          ? `That stretch had no text posts to summarise. ≈${backlog} posts still queued — /digest continues.`
          : "Nothing unread in your channels — you're all caught up."
      );
    }
    return;
  }
  await send(chatId, renderDigest(digest) + queueFooter(backlog), readButton(digest));
}

/**
 * A digest of one channel, asked for by name — the queue's logic scoped down.
 *
 * Naming the channel outranks the subject filter (it is a one-off /include),
 * and like /digest it moves past any open step: an explicit request is an
 * answer to whatever was waiting.
 */
async function onChannelDigest(userId: string, chatId: number, query: string): Promise<void> {
  const wanted = query.trim();
  if (!wanted) {
    await send(chatId, "Which channel? <code>/channel часть названия</code>.");
    return;
  }
  const account = await getAccount(userId);
  if (!account) {
    await send(chatId, "Not connected yet — /connect first.");
    return;
  }

  await typing(chatId);
  const channel = await resolveChannel(userId, chatId, wanted);
  if (!channel) return;

  try {
    await closeOpenDigests(userId);
    const { digest, empty, backlog } = await runChannelDigest(userId, channel.id);
    if (empty) {
      await send(
        chatId,
        backlog > 0
          ? `That stretch of <b>${escapeHtml(channel.title)}</b> had no text posts to summarise — ≈${backlog} still queued, ask again to continue.`
          : `<b>${escapeHtml(channel.title)}</b> has nothing unread.`
      );
      return;
    }
    await send(chatId, renderDigest(digest) + queueFooter(backlog), readButton(digest));
  } catch (err: any) {
    const message = err?.errorMessage || err?.message || String(err);
    if (/AUTH_KEY|SESSION_REVOKED|USER_DEACTIVATED/i.test(message)) {
      await clearAccount(userId);
      await send(chatId, "Telegram invalidated my session — that happens if you end the session from your account's device list. /connect to sign in again.");
      return;
    }
    await send(chatId, `Couldn't build that channel's digest: ${escapeHtml(message)}`);
  }
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
    if (hours) {
      // A second look at a recent window — outside the queue, nothing advances.
      const { digest, empty } = await runDigest(userId, { hours });
      await send(
        chatId,
        empty
          ? "Nothing in that window. The queue is untouched — plain /digest continues it."
          : renderDigest(digest)
      );
      return;
    }

    // Typing /digest over an open step is an answer to it: move on. The step
    // stays unread in Telegram — only the button marks anything.
    await closeOpenDigests(userId);
    await deliverNextStep(userId, chatId, false);
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

/**
 * The marking itself, shared by the button press and the spoken request.
 * Expects the claim to already be held; hands it back if the marking fails.
 */
async function markDigestRead(account: TelegramAccount, digest: PeriodDigest): Promise<string> {
  let outcome;
  try {
    outcome = await markRead(account, digest.coverage!);
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

  try {
    return await markDigestRead(account, digest);
  } catch (err) {
    // Put the button back — with the claim released, it is the way to retry.
    await call("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: readMarkup(from),
    }).catch(() => {});
    throw err;
  }
}

/**
 * "Прочитано", said in words.
 *
 * The same act as the ✓ button, resolved by recency instead of a message id.
 * The delivered digest's own buttons stay on screen — the message id was never
 * stored — so a later press simply answers "Already marked."
 */
async function onSpokenMarkRead(userId: string, chatId: number): Promise<void> {
  const account = await getAccount(userId);
  if (!account) {
    await send(chatId, "Not connected — nothing to mark.");
    return;
  }

  const digest = await latestMarkableDigest(userId);
  if (!digest) {
    await send(chatId, "Nothing to mark — the latest digest's channels are already marked read.");
    return;
  }
  if (!(await claimReadMark(digest.id))) {
    await send(chatId, "Already marked.");
    return;
  }

  await typing(chatId);
  const result = await markDigestRead(account, digest);
  await send(chatId, escapeHtml(result));
  void noteEngagement(userId, chatId);
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

  // A leftover button on an old digest is still an entry point.
  if ((await isSuspended(userId)) && !isAdmin(userId)) {
    await answer();
    await send(chatId, SUSPENDED_NOTICE).catch(() => {});
    return;
  }

  const [action, from] = [data.slice(0, data.indexOf(":")), data.slice(data.indexOf(":") + 1)];

  if (action === "keep") {
    // Closing the step is what lets the queue move on; the channels themselves
    // stay unread in Telegram — that is the entire meaning of this button.
    await closeDigest(`${userId}:${from}`);
    await dropButtons(chatId, messageId);
    await answer("Left unread. The queue moves on.");
    void noteEngagement(userId, chatId);
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
    void noteEngagement(userId, chatId);
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
    case "/channel":
      return onChannelDigest(userId, chatId, args.join(" "));
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
      if (!digest) {
        await send(chatId, "No digests yet — /digest builds the first one.");
        return;
      }
      // A step still gating the queue keeps its button here too — /last is how
      // a digest delivered while the person was away gets answered.
      const open = Boolean(digest.coverage?.length && !digest.closedAt);
      await send(chatId, renderDigest(digest), open ? readButton(digest) : undefined);
      return;
    }
    case "/news":
      return onNews(userId, chatId, args);
    case "/mode":
      return onMode(userId, chatId, args);
    case "/sources":
      return onSources(userId, chatId);
    case "/slack":
      return onSlack(userId, chatId, args);
    case "/pay":
      return onPay(userId, chatId);
    case "/billing":
      return onBilling(userId, chatId);
    case "/suspend":
    case "/unsuspend":
      // Invisible to everyone but the admin: a non-admin gets the same "don't
      // know that one" as any typo, so the command's existence leaks nothing.
      if (!isAdmin(userId)) break;
      return onSuspend(chatId, args, command === "/suspend");
    case "/focus":
      return onFocus(userId, chatId, args);
    case "/mcp":
      return onMcp(userId, chatId, args);
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
  const reply = await answerFromDigests(userId, trimmed, history);

  // The model judged this a queue command, not a question. Marking runs before
  // advancing — "прочитано, дальше" means close this one, then continue. The
  // history still gets a turn, so a follow-up like "и ещё" keeps its context.
  if (reply.markRead || reply.advance || reply.channelQuery || reply.focusUpdate !== undefined) {
    const acted: string[] = [];
    // The preference lands first, so a "no more benchmarks — and next digest"
    // in one breath builds that next digest under the brief it just set.
    if (reply.focusUpdate !== undefined) {
      await setFocus(userId, reply.focusUpdate);
      await send(
        chatId,
        reply.focusUpdate
          ? `Noted. Your digests will now read for:\n<i>${escapeHtml(reply.focusUpdate)}</i>\n\n/focus shows or changes this anytime.`
          : "Brief cleared — digests go back to covering everything their subjects allow."
      );
      acted.push(
        reply.focusUpdate
          ? `(updated the standing brief to: ${reply.focusUpdate})`
          : "(cleared the standing brief)"
      );
    }
    if (reply.markRead) {
      await onSpokenMarkRead(userId, chatId);
      acted.push("(marked the latest digest's channels read)");
    }
    if (reply.advance) {
      await onDigest(userId, chatId, []);
      acted.push("(built and delivered the next digest from the queue)");
    }
    if (reply.channelQuery) {
      await onChannelDigest(userId, chatId, reply.channelQuery);
      acted.push(`(built a digest of the channel matching "${reply.channelQuery}")`);
    }
    await appendChat(userId, [
      { role: "user", content: trimmed },
      { role: "assistant", content: acted.join(" ") },
    ]);
    return;
  }

  const answer = reply.text || "";
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

  // Every message carries an identity; keep the freshest one so the admin's
  // account list reads as people, not numbers. Existing users get named the
  // first time they say anything after this ships.
  if (message.from) {
    const parts = [message.from.first_name, message.from.last_name].filter(Boolean).join(" ");
    const name = message.from.username ? `${parts || "?"} (@${message.from.username})` : parts;
    if (name) await setName(userId, name).catch(() => {});
  }

  // /pay must survive suspension — it is the way back in. Everything else a
  // suspended account says gets the notice.
  const asksToPay = /^\/(pay|billing)(@|\s|$)/i.test(text.trim());
  if (!asksToPay && (await isSuspended(userId)) && !isAdmin(userId)) {
    await send(chatId, SUSPENDED_NOTICE).catch(() => {});
    return;
  }

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

/* --------------------------------- the queue ------------------------------- */

/**
 * Move every account's queue forward by at most one step.
 *
 * Called on a timer, and the timer is subordinate to the confirmations: an
 * account whose latest step is still open is skipped, so nothing is built that
 * nobody has answered for. That is what bounds the spend — a person who walks
 * away for a week costs one unconfirmed digest, not twenty-eight.
 *
 * Delivered steps go to the person directly: for a private chat the Bot API
 * chat id and the user id are the same number, and everyone here arrived by
 * messaging the bot privately. Quiet mode keeps an all-caught-up account from
 * being told so every six hours.
 */
export async function sweepQueue(): Promise<void> {
  const accounts = await listAccounts();
  for (const { userId } of accounts) {
    if (busy.has(userId)) continue;
    // A suspended account costs nothing: no collection, no model calls.
    if (await isSuspended(userId)) continue;
    if (await openDigest(userId)) continue;

    busy.add(userId);
    try {
      await deliverNextStep(userId, userId, true);
    } catch (err: any) {
      console.warn(`queue step failed for ${userId}: ${err?.message || err}`);
    } finally {
      busy.delete(userId);
    }
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

  // Billing's mouth: when a webhook flips someone's switch, tell them, and
  // tell the admin. Registered here because billing must not import the bot.
  setSlackNotifier((userId, team) => {
    const chatId = Number(userId);
    if (!Number.isFinite(chatId)) return;
    void send(
      chatId,
      `Slack connected${team ? ` — <b>${escapeHtml(team)}</b>` : ""}. Its conversations join your next digest. /sources shows what's connected.`
    ).catch(() => {});
  });

  setBillingNotifier(async ({ userId, kind, reason }) => {
    const chatId = Number(userId);
    const admin = (process.env.ADMIN_USER_ID || "").trim();
    if (Number.isFinite(chatId)) {
      await send(
        chatId,
        kind === "activated"
          ? "Subscription active — welcome back. Everything is exactly where you left it."
          : `Your subscription ${reason === "payment failed" ? "payment failed" : "was cancelled"}, so the bot is paused for you. Your digests and settings are kept. /pay reactivates it.`
      ).catch(() => {});
    }
    if (admin && admin !== userId) {
      const names = await getNames().catch(() => ({} as Record<string, string>));
      const who = names[userId] || userId;
      await send(Number(admin), `Billing: ${escapeHtml(who)} ${kind} (${escapeHtml(reason)}).`).catch(() => {});
    }
    console.log(`billing: ${userId} ${kind} — ${reason}`);
  });

  await call("setMyCommands", {
    commands: [
      { command: "digest", description: "the next digest from your unread queue" },
      { command: "topics", description: "subjects you read for — I skip the rest" },
      { command: "focus", description: "what matters within them — the rest shrinks" },
      { command: "news", description: "search the web on a subject, with sources" },
      { command: "mode", description: "auto, cultural, work or custom" },
      { command: "sources", description: "add Slack and other messengers" },
      { command: "channel", description: "digest one channel's unread backlog" },
      { command: "channels", description: "what I read, skip, and why" },
      { command: "last", description: "the most recent digest" },
      { command: "history", description: "digests I'm holding" },
      { command: "connect", description: "sign in with a phone code" },
      { command: "qr", description: "sign in by scanning a QR code" },
      { command: "include", description: "always read a channel" },
      { command: "exclude", description: "never read a channel" },
      { command: "mcp", description: "connector URL for your claude.ai" },
      { command: "pay", description: "subscribe or renew" },
      { command: "billing", description: "manage your card or cancel" },
      { command: "pay", description: "subscribe or renew" },
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
