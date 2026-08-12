import * as dotenv from "dotenv";
import { startBot, stopBot } from "./digest/bot";
import { runDigestForAll } from "./digest/pipeline";

dotenv.config();

/**
 * Entry point for the digest bot.
 *
 * One process does both jobs: it answers messages, and on a timer it builds
 * everyone's digest so there is something to answer from without anyone having
 * to ask for it. They share a process because an unfinished login lives in
 * memory between two messages — see the note in bot.ts.
 */

const INTERVAL_HOURS = Number(process.env.DIGEST_INTERVAL_HOURS || 6);

async function sweepDigests(): Promise<void> {
  try {
    const results = await runDigestForAll();
    const failed = results.filter((r) => !r.ok);
    console.log(
      `Scheduled digest: ${results.length - failed.length}/${results.length} accounts` +
        (failed.length ? ` — failures: ${failed.map((f) => `${f.userId}: ${f.error}`).join("; ")}` : "")
    );
  } catch (err) {
    console.error("Scheduled digest failed:", err);
  }
}

async function main(): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error(
      "TELEGRAM_BOT_TOKEN is not set.\n\n" +
        "Open @BotFather in Telegram, send /newbot, and put the token it gives you in a .env file:\n" +
        "  TELEGRAM_BOT_TOKEN=123456:AA...\n\n" +
        "Reading channels also needs Telegram API credentials from https://my.telegram.org:\n" +
        "  TELEGRAM_API_ID=123456\n" +
        "  TELEGRAM_API_HASH=abc..."
    );
    process.exit(1);
  }

  if (INTERVAL_HOURS > 0) {
    const timer = setInterval(sweepDigests, INTERVAL_HOURS * 3600_000);
    timer.unref();
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      console.log(`\n${signal} — stopping.`);
      stopBot();
      process.exit(0);
    });
  }

  await startBot();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
