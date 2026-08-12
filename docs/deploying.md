# Running the bot somewhere permanent

The desktop build works, but only while that window is open. This is about
keeping it running when your computer is off.

## Two things every option has to get right

**One instance, never two.** Telegram lets a single connection long-poll a bot
token. Start a second and Telegram answers it with `409 Conflict`; the bot
notices and stops rather than silently dropping half of everyone's messages. So
when you deploy, make sure the old one is actually gone — and don't leave the
desktop build running against the same token.

**The data directory has to survive restarts.** `data/digest-store.json` holds
the MTProto session that lets the bot read your channels. Lose it and everyone
has to `/connect` again. On a host with an ephemeral filesystem — which is most
of them — that means attaching a volume and pointing `DIGEST_DATA_DIR` at it.

Everything below does both.

---

## Option 1 — a machine you already have

If you have anything that stays on — an old laptop, a Raspberry Pi, a desktop
that never sleeps — this is free and the least to go wrong.

Copy the binary onto it, run it once to answer the setup questions, then keep it
running. On Linux that means a service:

```ini
# /etc/systemd/system/digest-bot.service
[Unit]
Description=Channel digest bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME/digest-bot
ExecStart=/home/YOUR_USERNAME/digest-bot/channel-digest-bot
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Run it by hand first — setup needs a terminal to ask its questions.
./channel-digest-bot        # answer the two prompts, then Ctrl+C

sudo systemctl enable --now digest-bot
sudo journalctl -u digest-bot -f     # watch it
```

Setup writes `.env` next to the binary, and the service reads it from there. It
never prompts again.

On Windows, Task Scheduler can do the same thing: create a task that runs the
`.exe` at logon, set "Restart if the task fails".

---

## Option 2 — Fly.io

A small paid machine, a few dollars a month. `fly.toml` and `Dockerfile` in this
repo are already set up for it, including the volume.

```bash
# One-time
curl -L https://fly.io/install.sh | sh
fly auth signup

fly launch --no-deploy --copy-config     # keeps the fly.toml here
fly volumes create digest_data --size 1  # 1 GB is far more than enough

# Credentials go in as secrets, never in the repo
fly secrets set \
  TELEGRAM_BOT_TOKEN=123456:AA... \
  TELEGRAM_API_ID=123456 \
  TELEGRAM_API_HASH=abc...

# Optional, for meaning-based grouping instead of wording-based
fly secrets set ANTHROPIC_API_KEY=sk-ant-...

fly deploy
fly scale count 1        # see "one instance, never two" above
fly logs
```

Expect `Bot @yourbotname listening.` in the logs. Then message it `/connect` as
usual — signing in happens over Telegram, not over the host.

**Watch for:** `fly launch` likes to add an `[http_service]` block and offer you
a public URL. Decline both. This isn't a web server, and Fly stops idle web
services — which for a long-poll would mean a bot that dies whenever nothing has
happened for a while.

---

## Option 3 — any Linux VPS

Hetzner, DigitalOcean, Oracle's free tier, anything. Same as Option 1: copy the
Linux binary up, run it once to answer the prompts, install the systemd unit.

```bash
npm run package -- --target=linux     # produces channel-digest-bot-linux.zip
scp channel-digest-bot-linux.zip you@your-server:~
```

Nothing to install on the server — the binary carries its own runtime.

---

## Letting other people use it

Nothing to deploy. The bot already keeps each person's channels, digests and
conversation separate, keyed by their Telegram user id. Give someone the bot's
`@username` and they send `/connect` and sign in with their own account.

Worth knowing before you hand it round:

- **Every person's session is in your store.** Anyone who can read
  `digest-store.json` can read their channels. That file deserves the same care
  as a password file.
- **Cost scales with people.** Each person's digest is a separate summarising
  call. If you've set an `ANTHROPIC_API_KEY`, that's your key paying for it.
- **One machine, many people.** Digests run in sequence, so a busy bot takes
  longer per round rather than falling over.

---

## Updating it later

```bash
git pull
npm run package -- --target=win --xz   # or --target=linux, --target=mac
```

On Fly, `fly deploy` rebuilds from the Dockerfile. The volume — and therefore
everyone's session and digests — is untouched by a deploy.

The build stamp prints at startup, so you can tell at a glance whether what's
running is what you just built.
