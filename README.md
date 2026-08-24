# Digestify

Reads the channels and chats you follow, collapses the repetition between them
into a digest organised by topic, and lets you talk to it — in Telegram, or from
your own Claude. Ask "what's been building up around agentic AI?" months later
and it answers from stored summaries; the raw messages were never kept.

Powered by Claude (`claude-opus-5`).

```bash
npm run bot
```

---

## What it does

**Works through a backlog, oldest first.** Digestify doesn't show you "the last
24 hours" — it starts at your oldest unread post and moves forward one digest at
a time. Each digest ends with two buttons: mark its channels read in Telegram,
or leave them unread. Nothing new is built until you answer, so an unread
backlog gets cleared at the speed you confirm it, and the bill is bounded by the
same thing.

**Reads what you actually follow.** You sign in with your own Telegram account
(QR code or phone code), so it sees the channels you see — not just channels a
bot was added to. Slack can be connected too, and its conversations join the same
digests.

**Four reading modes.** `/mode auto` learns what you read for from which
digests you work through and what you ask about, revising your brief every few
digests and telling you each time. `/mode cultural` reads for concerts, theatre
and exhibitions, keeping dates and venues. `/mode work` reads for what changes
what you have to do — rule changes, deadlines, decisions waiting on you.
`/mode custom` is whatever you set by hand. Each mode keeps its own subjects,
brief and triage verdicts parked, so switching back is instant and costs no
re-examination.

**Filters in two layers.** `/topics` decides which channels are opened at all —
a model samples each one and judges it against the subjects you named, so
off-subject channels cost nothing. `/focus` is an editorial brief in your own
words ("things I can take into use, not launch announcements") that decides what
inside those channels deserves a topic and what shrinks to one line.

**Never repeats itself.** Each digest is held against the previous ones: a story
already told is omitted, a development arrives as an "Update:". That makes the
stored digests a chronology — first tellings plus update chains — which is what
lets it answer questions about trends rather than just "what happened".

**Reads the world, not just your feed.** Ask it what actually happened — an ECB
rate decision, an Amazon announcement, whether a story is still true — and it
searches the web and answers with named sources and dates. `/news <subject>` is
the explicit version. It never blurs the two: your channels are one source, the
open web is another, and every answer says which is which.

**Talks to your Claude.** `/mcp` gives you a personal connector URL. Add it on
claude.ai and any conversation there can read your digests, with everything
Claude already knows about you.

---

## Quick start (as a user)

In Telegram, with the bot:

1. `/qr` — scan the code with Telegram on another device (Settings → Devices →
   Link Device). Or `/connect` for a phone code.
2. `/mode work` (or `cultural`, `auto`) for a preset — or set the two filters
   yourself: `/topics ai, agents, инфраструктура` — the subjects you read for. The bot
   samples your channels and keeps the ones that qualify; `/channels` shows what
   it kept, dropped, and why.
3. `/focus меня интересует применимое: подходы, экономика токенов; анонсы моделей — одной строкой`
   — optional, and the single biggest lever on digest quality.
4. `/digest` — the first digest. Then ✓ / "leave unread", or just say
   «прочитано» and «дальше».
5. `/mcp` — your connector URL for claude.ai (see below).

### Commands

| | |
|---|---|
| `/digest` | next digest from your unread queue (`/digest 24` re-reads a recent day instead) |
| `/channel имя` | one channel's unread backlog, same logic |
| `/news тема` | search the web and report what actually happened, with sources |
| `/mode` | auto / cultural / work / custom — presets of the two filters below |
| `/topics` | subjects you read for — the hard channel filter |
| `/focus` | editorial brief — what matters inside them |
| `/sources` | add Slack and other messengers |
| `/slack` | connect a Slack workspace by signing in (`/slack off` disconnects) |
| `/channels`, `/include`, `/exclude` | see and overrule the channel filter |
| `/last`, `/history` | the most recent digest; everything held |
| `/mcp` | connector URL for claude.ai (`/mcp new` rotates it) |
| `/pay`, `/billing` | subscribe; manage card or cancel |
| `/reset`, `/forget` | forget the conversation; delete the stored session |

Admin only (the Telegram id in `ADMIN_USER_ID`): `/suspend`, `/unsuspend`.

---

## Connecting it to Claude

`/mcp` returns `https://<your-app>.fly.dev/mcp/<token>`. On claude.ai:
**Settings → Connectors → Add custom connector**, paste the whole URL (token
included), leave the OAuth fields empty.

The token *is* the authentication — a custom connector can't carry a header of
ours, and there's no OAuth server here — so the URL is a password: anyone with it
reads those digests. `/mcp new` revokes the old one. The same token works as an
`Authorization: Bearer` header against bare `/mcp` for clients that can send one.

Five tools are exposed: `list_digests`, `get_digest`, `search_digests`,
`get_focus`, `update_focus`. Only the last one writes, and only to the editorial
brief — nothing there can mark anything read or touch Telegram.

---

## Sources

| Source | How | Status |
|---|---|---|
| **Telegram** | your own account over MTProto (QR or phone code) | full — channels, queue, read-marking |
| **Slack** | "Connect Slack" link → Slack's own consent screen (OAuth) | conversations join the same digests |
| **Gmail** | connector exists, needs a Google consent screen | not wired to the bot yet |
| **WhatsApp** | Business Cloud API webhook only | see below |
| **iMessage** | — | not possible from a server |

**WhatsApp and iMessage are honest gaps, not to-dos.** A personal WhatsApp
account has no read API: nothing but WhatsApp itself can enumerate your chat
history, and the libraries that claim otherwise drive a WhatsApp Web session and
get accounts banned — not something to build a paid product on. What does work is
a WhatsApp *Business* number pointed at this app's webhook, which accumulates
messages from that moment forward. iMessage has no server-side API at all; it
would require running on the user's own Mac with Full Disk Access.

---

## Running it

Deployed on Fly.io as one always-on machine: the Telegram long poll and the HTTP
server (MCP connector + Stripe webhook) share a process, with a volume at `/data`
holding the store.

```bash
flyctl deploy                      # or push to the deploy branch; Actions does it
flyctl logs -a <app>               # what it's doing
flyctl secrets list -a <app>       # what it's configured with
```

`fly.staging.toml` + the "Deploy staging" workflow give a full twin under a
second bot token, deployed by hand from the Actions tab.

### Configuration

Required:

| | |
|---|---|
| `TELEGRAM_BOT_TOKEN` | from @BotFather |
| `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` | from my.telegram.org → API development tools |
| `ANTHROPIC_API_KEY` | summarising, triage, conversation |

Optional:

| | |
|---|---|
| `ADMIN_USER_ID` | your Telegram id — enables `/suspend` and `/unsuspend` |
| `DIGEST_INTERVAL_HOURS` | how often the queue sweep runs (default 6) |
| `DIGEST_STEP_POSTS` | posts per digest (default 550; 10000 = chunked summarisation, several model calls) |
| `DIGEST_STEP_CHUNKS` | model calls one digest may spend before merging (default 16) |
| `DIGEST_MAX_PER_CHANNEL` | per-channel fetch ceiling per step (default 200) |
| `MCP_PUBLIC_URL` | overrides the base URL in `/mcp` and Slack redirect links |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | registers the Slack app once, turning `/slack` into a one-tap sign-in |
| `STRIPE_PAYMENT_LINK`, `STRIPE_WEBHOOK_SECRET` | enables `/pay` and automatic suspension |
| `STRIPE_PORTAL_LINK` | enables `/billing` |
| `STRIPE_REQUIRE_SUBSCRIPTION=1` | new sign-ups start locked until they pay |
| `ANTHROPIC_MODEL` | override the model |

### Billing

`/pay` hands a client a Stripe Payment Link with their Telegram id as
`client_reference_id`. Stripe posts back to `/stripe/webhook` (HMAC-verified over
the raw body); a completed checkout activates the account and records which
Stripe customer it is, a failed invoice suspends, a paid invoice restores, a
cancelled subscription suspends. Suspension deletes nothing — it flips a flag
every entry point checks (messages, buttons, the queue sweep, the MCP connector)
so resuming is instant. Money never passes through this app.

Turning the paywall on affects **new sign-ins only**; people already using the
bot keep working.

---

## Design notes

- **Raw messages are never stored.** They are fetched, summarised, and dropped
  inside one function. What persists is digests, one MTProto session per user,
  and per-channel marks.
- **Marks are honest.** A channel's mark advances only past material that was
  either summarised into a saved digest or seen to contain no text at all. Every
  trim drops the *newest* posts, so what's cut becomes the next step rather than
  a silent loss.
- **A failed summary consumes nothing.** With a model configured, a degraded
  (wording-grouped) digest throws instead of saving — the same posts are read
  again next attempt.
- **Big windows are summarised in stretches.** Past one model call's worth, the
  window is split into consecutive chunks, each summarised, then merged into one
  digest with source ids carried through.

More: **[docs/digest-bot.md](docs/digest-bot.md)**, **[docs/deploying.md](docs/deploying.md)**.
