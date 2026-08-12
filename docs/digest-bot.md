# Channel Digest Bot

A Telegram bot that reads the channels you follow, collapses the repetition
between them into a digest organised by topic, and then talks to you about it in
ordinary language.

```
/connect  →  it reads your channels  →  ask it things
```

## Why it is built this way

Three constraints shaped the design, and each one ruled out an easier option.

**A bot cannot read the channels you follow.** The Telegram Bot API only shows a
bot the chats it has been added to; a channel you merely subscribe to is
invisible to it. The only interface that can see your subscriptions is a *user*
client speaking MTProto — so the bot is the front door, and behind it each
person signs in once with their own account. `/connect` runs that login.

**The same story arrives five times.** Following twenty channels means reading
one event repeatedly in five wordings. Deduplicating that is a judgement about
meaning, not about vocabulary — two channels can report one event without
sharing a content word — so the grouping is done by the model, not by string
similarity.

**Months of posts do not fit in a conversation.** So they are never in one. Posts
exist only inside `runDigest`: they are fetched, summarised, and dropped. What
persists is the digest — topics, a few sentences each, and a reference back to
every channel that carried the story. Every answer the bot gives is built from
those, which is what makes "what happened last month?" as cheap as "what
happened today?".

## Setup

Two credentials, both one-time.

**1. A bot token.** Open [@BotFather](https://t.me/BotFather), send `/newbot`,
follow the prompts.

**2. API credentials** for the MTProto side, from
[my.telegram.org](https://my.telegram.org) → *API development tools*.

Put both in `.env`:

```
TELEGRAM_BOT_TOKEN=123456:AA...
TELEGRAM_API_ID=123456
TELEGRAM_API_HASH=abc...
```

Then:

```bash
npm install
npm run bot
```

Message your bot and send `/connect`.

If you would rather not set the API credentials in the environment, each person
can pass their own instead: `/connect 123456 your_api_hash`.

### Optional

| Variable | Default | What it does |
| --- | --- | --- |
| `DIGEST_INTERVAL_HOURS` | `6` | How often digests are built unprompted. `0` disables it. |
| `ANTHROPIC_API_KEY` | — | Enables model summarising and conversation. Without it, see below. |

## Signing in

Telegram's login is a conversation, so the bot runs it as one: phone number,
then the code, then a password if the account has two-step verification.

**Send the code with dashes** — `1-2-3-4-5`. Telegram scans chats for login codes
and cancels any it finds posted in one; separators get the code past that check.
The bot strips them before use.

The message containing your code — and your password, if you send one — is
deleted from the chat as soon as it has been read. If Telegram refuses the
deletion, the bot says so and asks you to remove it yourself.

`/forget` deletes the stored session. Ending the session from Telegram's own
device list also works, and the bot notices next time it tries to read.

## Commands

| Command | |
| --- | --- |
| `/connect` | Sign in so the bot can read your channels |
| `/digest` | Read what's new now and summarise it. `/digest 12` re-reads the last 12 hours |
| `/last` | The most recent digest |
| `/history` | The digests currently held |
| `/channels` | The channels the bot can see |
| `/reset` | Forget the conversation, keep the digests |
| `/forget` | Delete the stored session |
| `/cancel` | Abandon a half-finished login |

Anything that isn't a command is a question:

> *what happened today?*
> *anything about the rate decision?*
> *what did I miss this week?*
> *which channels covered the bridge closure?*

## Without an API key

The bot still runs, with one thing lost and nothing hidden.

Grouping falls back to shared vocabulary, which merges near-identical reposts
and misses paraphrase. Digests produced that way are marked `degraded`, the
digest itself says so on screen, and answers drawn from them say that stories
phrased differently may not have been merged. Questions are answered by
retrieval over the stored topics rather than by a model.

It is a real fallback, not a demo: it reads your actual channels and reports
what it actually found.

## Shape of the code

| File | |
| --- | --- |
| `src/digest/collector.ts` | MTProto: listing channels, reading posts, the login conversation |
| `src/digest/summarise.ts` | Posts → topic digest. Model path and lexical fallback |
| `src/digest/pipeline.ts` | Collect → summarise → store, for one window or everyone |
| `src/digest/store.ts` | Sessions, digests, watermarks, chat history |
| `src/digest/converse.ts` | Answering from stored digests only |
| `src/digest/format.ts` | Rendering and splitting for Telegram |
| `src/digest/bot.ts` | Bot API: commands, login flow, dispatch |
| `src/bot-server.ts` | Entry point — polling plus the scheduled sweep |

### Two notes for anyone changing it

**It needs a long-lived process, not a function.** A half-finished login holds an
open MTProto connection in memory between two messages. Long-polling keeps that
possible; a serverless deployment would drop it between invocations.

**The watermark advances to the newest post seen, never to "now".** A post
arriving mid-collection would otherwise fall in the gap and never be read.
