# Inbox Reader

Powered by Claude (`claude-opus-5`).

## → [Channel Digest Bot](docs/digest-bot.md)

A Telegram bot that reads the channels *you* follow, collapses the repetition
between them into a digest organised by topic, and talks to you about it in
ordinary language. Ask it "what happened this week?" months later and it answers
from stored summaries — the raw posts were never kept.

```bash
npm run bot
```

Setup, design notes and commands: **[docs/digest-bot.md](docs/digest-bot.md)**.

---

## Inbox Reader (web)

The earlier dashboard, still here and still working: it reads your Telegram,
WhatsApp and Slack chats and gives you one page that says what you missed.

```
Sign in  →  pick your apps and chats  →  read the summary  →  ask follow-ups
```

## What it does

- **One dashboard for everything.** A single "What you missed" summary across
  every app you've connected, with the things that actually need you pulled to
  the top and the group-chat noise pushed down.
- **You choose the sources.** Per-app and per-chat checkboxes, plus an
  unread-only switch. Your selection is saved to your account.
- **Ask in your own words.** Not menu commands — real sentences:
  *"hey uhhh can you give me a summary of my unread chats pls?"*,
  *"anything from Lena today or nah"*,
  *"what did I miss in the incidents channel while I was out"*.
  The assistant answers from your actual messages and follows the thread across
  questions.
- **Runs with no credentials.** Every connector falls back to a realistic demo
  inbox, so the whole app works before you've configured anything.

## Setup

```bash
npm install
npm start               # http://localhost:3000
```

That's it. No configuration, no environment variables — sign in with your email
and the dashboard works.

**Summaries without an API key.** Calling a model needs credentials, so with none
configured the reader analyses your messages on the server instead: it groups
them by chat, finds the ones that put a question or request to you, ranks them
by urgency and unread count, and quotes them back. The ask box does real
retrieval over the same messages. Everything it says is drawn from messages that
exist — it just can't paraphrase the way Claude can.

Set `ANTHROPIC_API_KEY` and the same screens switch to Claude, which reads for
nuance rather than keywords. Nothing else changes.

## Deploying

This is a Node server, not a static site. The summaries and the ask box call
Claude with your API key, sign-in exchanges an OAuth code for a profile, and
WhatsApp needs a real webhook endpoint — none of which can happen in a browser.
Dropping `public/` on static hosting gets you the front end and nothing behind
it (the page will say so).

### Netlify

**Deploy from Git, not by dropping a folder.** Drag-and-drop deploys run no
build step, and `netlify/functions/api.ts` is TypeScript whose imports resolve
from `node_modules` — neither of which exists in a dropped archive. Netlify
then fails to bundle the function, the deploy fails, and the site keeps serving
whatever was published before. A stale site after an apparently successful
upload almost always means this; the deploy log will say so.

Connect the repository instead (**Add new site → Import an existing project**)
and Netlify runs `npm install` and the build command from `netlify.toml`,
bundling the function properly.

The sign-in card prints a build stamp. If it does not match the commit you
expect, the deploy did not land — no amount of code changes will alter what you
are looking at.

`netlify.toml` and `netlify/functions/api.ts` are set up: the Express app is
wrapped with `serverless-http`, `public/` is published as static assets, and
`/api/*`, `/auth/*` and `/webhooks/*` are redirected into the function.

Because serverless filesystems are per-invocation, the store swaps to
**Netlify Blobs** automatically when `NETLIFY` is set — no configuration.
Locally it stays a JSON file.

Set these under **Site configuration → Environment variables**:

| Variable | Why |
| --- | --- |
| `ANTHROPIC_API_KEY` | Required — no summaries or answers without it |
| `SESSION_SECRET` | **Required here.** Without it each cold start mints a new secret and signs everyone out at random |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | For Google sign-in |
| `GOOGLE_REDIRECT_URI` | `https://<your-site>.netlify.app/auth/google/callback`, and add the same URI to the OAuth client |

Both are checked at runtime and surfaced in the UI if missing, so a
misconfigured deploy says what's wrong instead of failing quietly.

Telegram polls on demand when the dashboard loads — `getUpdates` holds
messages for 24 hours, so nothing is lost between visits and no scheduled
function is needed.

One caveat: the store is a single blob read-modify-written per request, so
concurrent writes are last-write-wins. Fine for one person; if this grows
users, move the store to a real database.

### Anywhere that runs Node

Render, Railway, Fly.io and friends need no changes: set the env vars and run
`npm run web`.

## Sign-in

Sign-in is **Google OAuth**: the button sends you to Google's own consent
screen, you type your password on `accounts.google.com`, and the app gets back
a code it exchanges for your name and email. Your account is created on first
sign-in.

The app never asks for, receives, or stores your Gmail password. A page that
collected one directly would be a phishing form — and Google blocks sign-ins
made that way, so it wouldn't work even if it were built.

To enable it, create an OAuth client at
[console.cloud.google.com](https://console.cloud.google.com), then set:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

The same redirect URI must be listed on the OAuth client.

**Without Google configured**, a local sign-in form stands in: enter an email,
get an account, no password involved. It's labelled as such in the UI and turns
itself off as soon as Google credentials are present (`ALLOW_DEMO_SIGNIN=true`
keeps it on alongside Google; `false` disables it entirely).

Sessions are signed cookies — set `SESSION_SECRET` or they reset on restart.

## Connecting your apps

Two of the four connect per-account: a person clicks **Connect** on the
dashboard and approves it for their own account. Nobody pastes a token, and one
person connecting exposes nothing to anyone else. The site has to be registered
once with each provider so the OAuth handshake has a client to identify —
that's the one piece an operator does, not each user.

| App | How it connects | What it can read |
| --- | --- | --- |
| **Gmail** | Click Connect (same Google sign-in, plus read-only inbox scope). Needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. | Your inbox, read-only — the app cannot send or delete |
| **Slack** | Click Connect. With `SLACK_CLIENT_ID` set that is an OAuth consent screen; without it, paste a token from an app you created at api.slack.com | The conversations your Slack account can see, with real unread counts |
| **Telegram** | **Click Connect and paste a @BotFather token.** No OAuth, no client id, no developer console — creating the bot is a chat message | Groups and channels the bot is added to. **Not your personal DMs** — those need an MTProto user client, which the Bot API cannot do |
| **WhatsApp** | Business Cloud API webhook | Messages sent to a *business* number after the webhook is connected. **A personal WhatsApp account cannot be read by anything** — it is end-to-end encrypted with no read API |

Pasted tokens are checked against the provider before they are stored, so a typo
is reported at the moment you paste it rather than leaving the dashboard quietly
on sample data. Anything not connected shows sample chats so the page still works.

Gmail is the one that genuinely cannot be connected without an OAuth client: its
API accepts no other credential, and an app password only works over IMAP.

### Telegram — `TELEGRAM_BOT_TOKEN`

Create a bot with [@BotFather](https://t.me/botfather), then add it to the
groups and channels you want summarised. The reader polls `getUpdates` and
buffers what arrives.

> The Bot API only shows a bot what it can see: chats it was added to, and
> channels where it's an admin. **It cannot read your personal DM history** —
> that requires an MTProto user client (Telethon/TDLib) signed in as you, which
> is a different auth model and isn't implemented here.

### Slack — `SLACK_BOT_TOKEN` (or `SLACK_USER_TOKEN`)

A bot token reads the conversations the app has been invited to. A user token
(`xoxp-`) also exposes `last_read`, which is what makes unread counts accurate —
with a bot token everything in the fetch window counts as unread.

Scopes: `channels:read`, `groups:read`, `im:read`, `channels:history`,
`groups:history`, `im:history`, `users:read`.

### WhatsApp — `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`

WhatsApp has no read API for a personal account — nothing can enumerate your
existing chats. What exists is the Business Cloud API, which **pushes** messages
to a webhook as they arrive, so this connector is push-based: point Meta's
webhook at `POST /webhooks/whatsapp` and the reader accumulates conversations
from that point forward. Setting `WHATSAPP_APP_SECRET` turns on signature
verification of inbound deliveries.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/session` | Who's signed in, and which sign-in methods exist |
| `GET` | `/auth/google` → `/auth/google/callback` | Google OAuth sign-in |
| `POST` | `/auth/demo` · `/auth/signout` | Local sign-in · sign out |
| `GET` | `/api/sources` | Apps and chats available to pick from |
| `PUT` | `/api/preferences` | Save selected apps, chats, unread-only |
| `GET` | `/api/digest` | The AI summary on the dashboard |
| `GET` | `/api/messages` | The raw feed behind the summary |
| `POST` | `/api/ask` | Ask a question; `GET` for history, `DELETE` to clear |
| `POST` | `/api/mark-read` | Clear unread flags (Telegram/WhatsApp) |
| `GET`/`POST` | `/webhooks/whatsapp` | Cloud API verification and delivery |

## How the AI part works

`src/reader/ai.ts` makes two kinds of call, both to `claude-opus-5`:

- **The digest** uses structured outputs (`output_config.format` with a JSON
  schema), so the dashboard gets a guaranteed shape: headline, "needs you" list,
  and a per-chat summary with an urgency and action items.
- **The ask box** is conversational, with the message transcript supplied in an
  `<inbox>` block each turn and the last few turns of history replayed.

Both send `fallbacks: "default"`, so if Claude's safety classifiers decline a
request the API retries it server-side on the recommended fallback model instead
of returning nothing.

Messages are grouped by chat before being sent, so the model sees conversations
rather than a flat feed.

## Architecture

```
netlify.toml                 Publish dir, function bundling, route redirects
netlify/functions/api.ts     Wraps the Express app for Netlify Functions
src/
  auth.ts                    Google OAuth, signed-cookie sessions
  app.ts                     Express app: pages, API, webhooks
  server.ts                  Local entry point (app.listen)
  reader/
    types.ts                 Chat, Message, Connector, User, Digest
    store.ts                 File-backed accounts, preferences, message buffer
    ai.ts                    Claude calls: digest + ask
    connectors/
      index.ts               Registry, source listing, selection → messages
      telegram.ts            Bot API polling
      slack.ts               Web API
      whatsapp.ts            Cloud API webhook ingest
      demo.ts                Sample inbox used when an app has no credentials
public/
  index.html                 The reader front end (served at /)
  calendar.html              The older calendar agent UI (served at /calendar)
```

Accounts and buffered messages live in `data/reader-store.json` (gitignored).

## Also in this repo: the calendar agent

The original natural-language → Google Calendar agent still lives here, now at
[`/calendar`](http://localhost:3000/calendar) (CLI: `npm run dev`). It turns
"meeting 1 on Saturday March 15 with @leo and @mia at 12311 Templeton Street"
into a real calendar event, with attendees resolved via `contacts.json` and a
Google Meet link when asked. See `src/parser.ts` and `src/calendar.ts`.
