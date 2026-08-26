import * as fs from "fs";
// The `node:` prefix is required here — a bare "readline/promises" resolves
// under tsc but not under the bundler that produces the shipped binary.
import * as readline from "node:readline/promises";
import { BotFatherError, createBot } from "./botfather";
import { cancelLogin, completeLogin, startLogin, withClient } from "./collector";
import { envPath } from "./paths";
import { setAccount } from "./store";

/**
 * First-run setup, asked rather than configured.
 *
 * Only one credential is genuinely unavoidable. `api_id`/`api_hash` identify
 * the *application* to Telegram and can only be issued to someone logged in at
 * my.telegram.org, so they have to come from the person running this — nobody
 * else can obtain them on their behalf.
 *
 * The bot token is a different matter. @BotFather is an ordinary bot, and by
 * the time we need a token the person is already signed in over MTProto, so the
 * program can hold that conversation itself. Typing a token by hand is the
 * fallback for when BotFather says something we don't recognise, not the path.
 *
 * A happy side effect of doing the login here: the code is typed into a
 * terminal rather than into a Telegram chat, so Telegram's rule about cancelling
 * codes it sees posted in chats never comes into play.
 */

const TOKEN_SHAPE = /^\d{5,}:[A-Za-z0-9_-]{20,}$/;
/** Nothing is keyed per-user during setup; there is exactly one person here. */
const SETUP_KEY = "__setup__";

export function canPrompt(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export function isConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

/** Streams are injectable so the whole flow can be driven in a test. */
export interface SetupIO {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
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

function reason(err: any): string {
  return err?.errorMessage || err?.message || String(err);
}

export interface SetupResult {
  botUsername: string;
  /** Present when the login also ran, which is the normal path. */
  ownerId?: string;
}

export async function runSetup(io?: SetupIO): Promise<SetupResult> {
  const { input, output } = io || { input: process.stdin, output: process.stdout };
  const rl = readline.createInterface({ input, output });
  const ask = asker(rl);
  const say = (text = "") => void output.write(`${text}\n`);

  say(`
──────────────────────────────────────────────────────────────
  Setting up your channel digest bot.

  One thing to fetch, then your phone number. I'll make the
  bot for you. Saved when it's done, so this happens once.
──────────────────────────────────────────────────────────────
`);

  /* ------------------------- step 1: the app itself ------------------------ */

  say("STEP 1 of 2 — permission for this program to talk to Telegram\n");
  say("  Telegram issues these to a logged-in account, so only you can get them.");
  say("  I can't do this part for you.\n");
  say("  Go to  https://my.telegram.org  and log in with your phone number.");
  say("  Click 'API development tools' and create an app (any name will do).");
  say("  It shows an  api_id  (a number) and an  api_hash  (a long string).\n");

  let apiId = "";
  while (!apiId) {
    const value = await ask("  api_id: ");
    if (/^\d{4,}$/.test(value)) apiId = value;
    else say("  ↳ That should be just digits.\n");
  }

  let apiHash = "";
  while (!apiHash) {
    const value = await ask("  api_hash: ");
    if (/^[a-f0-9]{32}$/i.test(value)) apiHash = value;
    else say("  ↳ That should be 32 characters of letters and numbers.\n");
  }

  /* --------------------------- step 2: signing in -------------------------- */

  say("\nSTEP 2 of 2 — signing in\n");
  say("  This is what lets me read the channels you follow. A bot can only see");
  say("  channels it was made an admin of, so signing in as you is the only way.\n");

  let login: { session: string; userId: string; name: string } | null = null;

  while (!login) {
    let phone = "";
    while (!phone) {
      const value = (await ask("  Your phone number, with country code (+44...): ")).replace(/[^\d+]/g, "");
      if (/^\+?\d{7,15}$/.test(value)) phone = value.startsWith("+") ? value : `+${value}`;
      else say("  ↳ That doesn't look like a phone number.\n");
    }

    try {
      output.write("  ↳ Asking Telegram to send you a code… ");
      await startLogin(SETUP_KEY, Number(apiId), apiHash, phone);
      say("sent.\n");
    } catch (err) {
      say(`no: ${reason(err)}\n`);
      continue;
    }

    // Typed here, not into a chat — so no dashes are needed and Telegram has
    // no reason to cancel it.
    say("  Telegram just sent you a code. Type it in below.\n");

    let password: string | undefined;
    // The code is held across attempts: a two-step password is a second factor
    // for the same code, so asking for the code again would be asking twice for
    // something already given.
    let code = "";

    while (!login) {
      if (!code) {
        code = (await ask("  Code: ")).replace(/\D/g, "");
        if (code.length < 4) {
          say("  ↳ That should be the digits Telegram sent.\n");
          code = "";
          continue;
        }
      }

      try {
        login = await completeLogin(SETUP_KEY, code, password);
      } catch (err) {
        const why = reason(err);
        if (/two-step/i.test(why)) {
          say("\n  This account has two-step verification.");
          password = await ask("  Your two-step password: ");
          continue;
        }
        if (/PHONE_CODE_INVALID/i.test(why)) {
          say("  ↳ Wrong code. Try again.\n");
          code = "";
          continue;
        }
        say(`  ↳ ${why}\n`);
        await cancelLogin(SETUP_KEY);
        break; // back out to the phone number
      }
    }
  }

  say(`\n  Signed in as ${login.name}.\n`);

  /* ------------------------ the bot, made for them ------------------------- */

  say("  Making your bot…\n");

  let token = "";
  let botUsername = "";

  try {
    const created = await withClient(
      { apiId: Number(apiId), apiHash, session: login.session },
      (client) => createBot(client, { displayName: "Channel Digest" })
    );
    token = created.token;
    botUsername = created.username;
    say(`  Made it: @${botUsername}\n`);
  } catch (err: any) {
    // BotFather's wording is not an API. When it surprises us, show what it
    // actually said and let the person finish the job by hand.
    say(`  ↳ Couldn't do that automatically: ${reason(err)}`);
    if (err instanceof BotFatherError && err.said) {
      say(`\n  BotFather said:\n  ${err.said.split("\n").join("\n  ")}`);
    }
    say(`
  You can make one yourself in about thirty seconds:

    Open Telegram, search for  @BotFather
    Send it:  /newbot
    Answer its two questions (a name, then a username ending in 'bot')
    It replies with a token
`);

    while (!token) {
      const value = await ask("  Paste the token here: ");
      if (TOKEN_SHAPE.test(value)) token = value;
      else say("  ↳ That should be digits, a colon, then letters.\n");
    }
  }

  /* ------------------------------- optional -------------------------------- */

  say(`
  Optional: an Anthropic API key improves the summaries.

  Without one the bot still reads your real channels, but it groups them by
  shared wording instead of by meaning — so one story told two different ways
  can show up twice. It says so on screen when that happens.

  Press Enter to skip.
`);
  const anthropicKey = await ask("  Anthropic API key (optional): ");

  rl.close();

  /* --------------------------------- save ---------------------------------- */

  const file = envPath();
  const contents = [
    "# Written by first-run setup. Delete this file to start over.",
    `TELEGRAM_BOT_TOKEN=${token}`,
    `TELEGRAM_API_ID=${apiId}`,
    `TELEGRAM_API_HASH=${apiHash}`,
    anthropicKey ? `ANTHROPIC_API_KEY=${anthropicKey}` : "# ANTHROPIC_API_KEY=",
    "DIGEST_INTERVAL_HOURS=6",
    "",
  ].join("\n");

  try {
    // 0600: this file holds a token that controls the bot.
    fs.writeFileSync(file, contents, { mode: 0o600 });
  } catch (err: any) {
    say(`\n  Couldn't save to ${file} (${err.message}).`);
    say("  The bot will still start, but it'll ask again next time.");
  }

  process.env.TELEGRAM_BOT_TOKEN = token;
  process.env.TELEGRAM_API_ID = apiId;
  process.env.TELEGRAM_API_HASH = apiHash;
  if (anthropicKey) process.env.ANTHROPIC_API_KEY = anthropicKey;

  // Filed under their Telegram id, which is the same number the Bot API will
  // report — so the bot already knows them and /connect is not needed.
  await setAccount(login.userId, {
    apiId: Number(apiId),
    apiHash,
    session: login.session,
    phone: undefined,
  });

  say(`
──────────────────────────────────────────────────────────────
  Done. You're already signed in — no /connect needed.

  Open  @${botUsername}  in Telegram and send  /digest
──────────────────────────────────────────────────────────────
`);

  return { botUsername, ownerId: login.userId };
}
