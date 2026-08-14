import * as dotenv from "dotenv";
import { startBot, stopBot } from "./digest/bot";
import { envPath } from "./digest/paths";
import { runDigestForAll } from "./digest/pipeline";
import { canPrompt, isConfigured, runSetup } from "./digest/setup";

dotenv.config({ path: envPath(), quiet: true });

/**
 * Entry point for the digest bot.
 *
 * One process does both jobs: it answers messages, and on a timer it builds
 * everyone's digest so there is something to answer from without anyone having
 * to ask for it. They share a process because an unfinished login lives in
 * memory between two messages — see the note in bot.ts.
 */

const INTERVAL_HOURS = Number(process.env.DIGEST_INTERVAL_HOURS || 6);

/**
 * Stamped in at bundle time. Its only job is to make "am I running the build I
 * think I am?" answerable without guessing — a question that cost real time the
 * last round, when fixes weren't reaching the thing being tested.
 */
declare const __BUILD_STAMP__: string;
const BUILD = typeof __BUILD_STAMP__ === "undefined" ? "source" : __BUILD_STAMP__;

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
  console.log(`Channel digest bot — build ${BUILD}`);

  if (!isConfigured()) {
    // A terminal means we can just ask. Without one — a service, a container,
    // a cron — there is nobody to answer, so say what is missing and stop.
    if (!canPrompt()) {
      // On Fly.io or other managed services, wait and retry in case secrets are still loading.
      // Secrets take a moment to become available after deploy.
      if (process.env.FLY) {
        console.log("Waiting for Fly.io secrets to be available (will retry in 5s)...");
        await new Promise((r) => setTimeout(r, 5000));
        if (isConfigured()) {
          console.log("Secrets loaded, starting bot.");
        } else {
          console.error(
            "\nTELEGRAM_BOT_TOKEN not set. On Fly.io, run:\n" +
              "  flyctl secrets set TELEGRAM_BOT_TOKEN='your_token_from_botfather'\n" +
              "  flyctl secrets set TELEGRAM_API_ID='your_id_from_telegram.org'\n" +
              "  flyctl secrets set TELEGRAM_API_HASH='your_hash_from_telegram.org'\n\n" +
              "Then deploy:\n" +
              "  flyctl deploy"
          );
          process.exit(1);
        }
      } else {
        console.error(
          "\nTELEGRAM_BOT_TOKEN is not set, and there's no terminal to ask on.\n\n" +
            `Create ${envPath()} with:\n` +
            "  TELEGRAM_BOT_TOKEN=123456:AA...     (from @BotFather)\n" +
            "  TELEGRAM_API_ID=123456              (from https://my.telegram.org)\n" +
            "  TELEGRAM_API_HASH=abc...\n\n" +
            "Or run it in a terminal and it will ask you for these."
        );
        process.exit(1);
      }
    } else {
      await runSetup();
    }
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
  console.error(`\n${err?.message || err}`);
  // A double-clicked window would vanish before the error could be read.
  if (process.stdin.isTTY) {
    console.error("\nPress Ctrl+C to close.");
    setInterval(() => {}, 1 << 30);
  } else {
    process.exit(1);
  }
});
