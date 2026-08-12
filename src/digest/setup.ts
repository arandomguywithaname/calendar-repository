import * as fs from "fs";
// The `node:` prefix is required here — a bare "readline/promises" resolves
// under tsc but not under the bundler that produces the shipped binary.
import * as readline from "node:readline/promises";
import { envPath } from "./paths";

/**
 * First-run setup, asked rather than configured.
 *
 * Telegram needs two credentials and there is no way around either — a bot
 * cannot exist without a token, and MTProto cannot connect without an api_id.
 * What can be removed is the part where someone opens a text file and edits it
 * correctly, so this asks for the values, checks them while the person is still
 * looking, and writes the file itself.
 *
 * Checking matters more than it sounds: a mistyped token would otherwise
 * surface much later as an unexplained failure, by which point the paste that
 * caused it is long out of view.
 */

const TOKEN_SHAPE = /^\d{5,}:[A-Za-z0-9_-]{20,}$/;

interface Answers {
  token: string;
  apiId: string;
  apiHash: string;
  anthropicKey: string;
}

/** True when there is a terminal to ask questions of. */
export function canPrompt(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export function isConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

/** Confirms the token is real, and tells us the bot's name for the closing line. */
async function verifyToken(token: string): Promise<{ ok: true; username: string } | { ok: false; why: string }> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const raw = await response.text();
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, why: `couldn't reach Telegram (HTTP ${response.status})` };
    }
    if (data.ok) return { ok: true, username: data.result.username };
    return { ok: false, why: data.description || `HTTP ${response.status}` };
  } catch (err: any) {
    return { ok: false, why: `couldn't reach api.telegram.org (${err?.message || err})` };
  }
}

/**
 * A prompt that gives up when there is nobody left to answer.
 *
 * Every question here sits in a retry loop, which is right when a person is
 * mistyping and wrong the moment the input closes — Ctrl+D, a pipe running dry,
 * a disconnected terminal — because `rl.question` then never settles and the
 * loop spins on empty answers forever. Racing each question against the
 * interface closing turns that into a clean exit.
 */
function asker(rl: readline.Interface): (question: string) => Promise<string> {
  const cancelled = new Error("Setup stopped — nothing left to read answers from.");
  let closed = false;

  const onClose = new Promise<never>((_, reject) => {
    rl.once("close", () => {
      closed = true;
      reject(cancelled);
    });
  });
  onClose.catch(() => {}); // it is raced, not always awaited

  return async (question: string) => {
    if (closed) throw cancelled;
    const answer = await Promise.race([rl.question(question), onClose]);
    return answer.trim();
  };
}

/** Streams are injectable so the whole flow can be driven in a test. */
export interface SetupIO {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}

export async function runSetup(io?: SetupIO): Promise<string> {
  const { input, output } = io || { input: process.stdin, output: process.stdout };
  const rl = readline.createInterface({ input, output });
  const ask = asker(rl);
  const say = (text = "") => void output.write(`${text}\n`);

  say(`
──────────────────────────────────────────────────────────────
  Setting up your channel digest bot. Two values, both free,
  about a minute. I'll save them so this only happens once.
──────────────────────────────────────────────────────────────
`);

  const answers: Answers = { token: "", apiId: "", apiHash: "", anthropicKey: "" };
  let botName = "";

  /* ------------------------------- bot token ------------------------------ */

  say("STEP 1 of 2 — the bot itself\n");
  say("  Open Telegram, search for  @BotFather");
  say("  Send it:  /newbot");
  say("  Answer its two questions (a name, then a username ending in 'bot').");
  say("  It replies with a token like  123456789:AAHxxxxxxxxxxxxxxxxxxxxx\n");

  while (!answers.token) {
    const value = await ask("  Paste the token here: ");
    if (!value) {
      say("  ↳ Nothing pasted. Try again, or press Ctrl+C to stop.\n");
      continue;
    }
    if (!TOKEN_SHAPE.test(value)) {
      say("  ↳ That doesn't look like a bot token — it should be digits, a colon, then letters.\n");
      continue;
    }

    output.write("  ↳ Checking with Telegram… ");
    const check = await verifyToken(value);
    if (!check.ok) {
      say(`no: ${check.why}\n`);
      continue;
    }
    say(`works, that's @${check.username}.\n`);
    answers.token = value;
    botName = check.username;
  }

  /* ---------------------------- api credentials --------------------------- */

  say("STEP 2 of 2 — permission to read your channels\n");
  say("  A bot can only see channels it was made an admin of, so it can't read");
  say("  the ones you follow. That needs a second set of credentials.\n");
  say("  Go to  https://my.telegram.org  and log in with your phone number.");
  say("  Click 'API development tools' and create an app (any name will do).");
  say("  It shows you an  api_id  (a number) and an  api_hash  (a long string).\n");

  while (!answers.apiId) {
    const value = await ask("  api_id: ");
    if (/^\d{4,}$/.test(value)) answers.apiId = value;
    else say("  ↳ That should be just digits.\n");
  }

  while (!answers.apiHash) {
    const value = await ask("  api_hash: ");
    if (/^[a-f0-9]{32}$/i.test(value)) answers.apiHash = value;
    else say("  ↳ That should be 32 characters of letters and numbers.\n");
  }

  /* ------------------------------- optional ------------------------------- */

  say(`
  Optional: an Anthropic API key improves the summaries.

  Without one the bot still reads your real channels, but it groups them by
  shared wording instead of by meaning — so one story told two different ways
  can show up twice. It says so on screen when that happens.

  Press Enter to skip.
`);
  answers.anthropicKey = await ask("  Anthropic API key (optional): ");

  rl.close();

  /* --------------------------------- save --------------------------------- */

  const file = envPath();
  const contents = [
    "# Written by first-run setup. Delete this file to start over.",
    `TELEGRAM_BOT_TOKEN=${answers.token}`,
    `TELEGRAM_API_ID=${answers.apiId}`,
    `TELEGRAM_API_HASH=${answers.apiHash}`,
    answers.anthropicKey ? `ANTHROPIC_API_KEY=${answers.anthropicKey}` : "# ANTHROPIC_API_KEY=",
    "DIGEST_INTERVAL_HOURS=6",
    "",
  ].join("\n");

  try {
    // 0600: this file holds a token that controls the bot.
    fs.writeFileSync(file, contents, { mode: 0o600 });
    say(`\n  Saved to ${file}\n`);
  } catch (err: any) {
    say(`\n  Couldn't save to ${file} (${err.message}).`);
    say("  The bot will still start, but it'll ask again next time.\n");
  }

  process.env.TELEGRAM_BOT_TOKEN = answers.token;
  process.env.TELEGRAM_API_ID = answers.apiId;
  process.env.TELEGRAM_API_HASH = answers.apiHash;
  if (answers.anthropicKey) process.env.ANTHROPIC_API_KEY = answers.anthropicKey;

  say(`──────────────────────────────────────────────────────────────
  Done. Open @${botName} in Telegram and send /connect
──────────────────────────────────────────────────────────────
`);

  return botName;
}
