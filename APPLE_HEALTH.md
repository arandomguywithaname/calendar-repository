# Apple Health → Claude Connector

A real, working Claude connector (an [MCP](https://modelcontextprotocol.io) server) for your Apple Health
data: sleep, HRV, resting heart rate, workouts, activity, and any other HealthKit metric your phone
syncs — plus recovery (0–100) and exertion (0–10) estimates computed from your own baselines.

**Check the official route first:** the Claude iOS app has a built-in Apple Health integration
(Settings → Integrations), but as of August 2026 it's a **US-only** beta for Pro/Max accounts.
This connector is the do-it-yourself alternative that works **anywhere — Europe included** — and
from web/desktop chats, with your data on your own server.

**One honest caveat up front:** Apple Health has **no cloud API** — HealthKit data lives on the
iPhone, and there is nothing a server can "log into". So the phone itself pushes the data here,
automatically, using the free-tier
[Health Auto Export](https://apps.apple.com/us/app/health-auto-export-to-csv/id1115567069) app
(or you upload an export by hand). Claude then reads everything through a custom connector.

```
Apple Watch ──▶ Apple Health ──▶ Health Auto Export ──▶ this server ──▶ Claude
                (HealthKit,         (automatic REST        /api/health/ingest       custom connector
                 on the phone)       push, JSON)           stores + scores it       at /mcp/<token>
```

Run it however you like: `npm run dev` (compile + start in one command) for local use, or
`npm run build` + `npm start` (plain `node dist/server.js` — what the Dockerfile and Fly.io deploy run).
Every command in this guide works in Windows Command Prompt, PowerShell, and bash.
**No Node.js installed? That's fine** — use the Fly.io path (Option A): the build happens on
Fly's servers, so your machine only needs the Fly CLI.

> This project started life as an "Athlytic connector" (Athlytic reads the same Apple Health data
> and has no API of its own). The old names still work: `/api/athlytic/ingest`, `/api/athlytic/status`,
> the `/athlytic` page, the `ATHLYTIC_INGEST_TOKEN` variable, and an existing `athlytic-health.json`
> data file are all still accepted.

---

## 1. Run the server

### Option A — Fly.io (recommended; no Node.js needed on your machine)

`fly deploy` uploads the source and builds it on Fly's servers with the repo's Dockerfile —
Node.js, npm, and the TypeScript compile all happen there, not on your computer.

1. **Install the Fly CLI** ([fly.io/docs/flyctl/install](https://fly.io/docs/flyctl/install/)).
   On Windows, run this once in PowerShell, then `fly` works in Command Prompt too:
   `iwr https://fly.io/install.ps1 -useb | iex`
   Sign in with `fly auth login`.

2. **Get the code onto your machine** — `git clone` if you have git, or with no tools at all:
   on the GitHub repo page press the green **Code** button → **Download ZIP**, unzip it, and open
   a terminal in that folder (the one containing `fly.toml`).

> **Shortcut:** with Node.js installed, `npm run deploy` does steps 3–5 for you — it generates
> and saves the tokens to `.env`, creates a dedicated Fly app (asking before touching any
> existing one), updates `fly.toml`, sets the secrets, deploys, and prints the final URLs for
> the phone and claude.ai. Steps 1–2 (Fly CLI + `fly auth login`, and having the code) still
> come first.

3. **Pick two secrets.** They're just passwords — any two *different* random strings of 30+
   characters work. Use a password manager's generator, or paste this in PowerShell twice:

   ```powershell
   $b = New-Object byte[] 24; (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b); -join ($b | ForEach-Object ToString x2)
   ```

   (If you do have Node.js, `npm run tokens` prints both in one go.)

4. **Give this its own Fly app.** The app name in `fly.toml` is where `fly deploy` ships the
   code — **never point it at a Fly app that already runs another project** (the deploy would
   replace that project). If the name in `fly.toml` doesn't exist on your account yet, or your
   account has other apps, create a dedicated one and point `fly.toml` at it:

   ```
   fly apps create <pick-a-unique-name>
   notepad fly.toml
   ```

   In the editor, change the `app = '...'` line to the name you just created, and save.

5. **Set the secrets and deploy**, from the repo folder:

   ```
   fly secrets set HEALTH_INGEST_TOKEN=<first secret> MCP_TOKEN=<second secret>
   fly deploy
   ```

`fly secrets set` stores them encrypted and restarts the app with them as environment variables —
they're set once and live only on Fly, so keep a copy somewhere safe (you'll need the first one in
Health Auto Export and the second one in the connector URL). `fly secrets list` shows what's set,
without values.

Your endpoints become (using your app name):

- Ingest: `https://<your-app>.fly.dev/api/health/ingest`
- Claude connector: `https://<your-app>.fly.dev/mcp/<MCP_TOKEN>`
- Setup/status page: `https://<your-app>.fly.dev/health`

> **Keeping data across deploys:** by default health data is stored in `data/apple-health.json`
> inside the machine, which survives restarts but not `fly deploy`. For durable storage, create a
> volume and point `DATA_DIR` at it:
> ```bash
> fly volumes create health_data --size 1
> # then add to fly.toml:
> #   [mounts]
> #     source = 'health_data'
> #     destination = '/data'
> fly secrets set DATA_DIR=/data
> ```
> (Or just re-send history from Health Auto Export after a deploy — see step 3.)

### Option B — run locally on any machine (requires [Node.js](https://nodejs.org), v20+)

Put the tokens in a `.env` file (the server loads it automatically on every platform — no shell
env-var syntax needed, so this works the same in Command Prompt):

```
npm ci
copy .env.example .env     :: Windows Command Prompt   (macOS/Linux: cp .env.example .env)
npm run tokens
```

Open `.env` in any editor and paste the two printed lines over the empty
`HEALTH_INGEST_TOKEN=` / `MCP_TOKEN=` entries. Then:

```
npm run dev                :: compiles and starts everything at http://localhost:3000
```

(`npm start` does the same without recompiling, once `npm run build` has been run.)

For claude.ai to reach it, the URL must be public HTTPS (e.g. behind a reverse proxy or a tunnel).
For Claude Desktop only, no hosting is needed at all — see step 4, Option B.

## 2. Send health data from the iPhone

1. Install **Health Auto Export — JSON+CSV** from the App Store and grant it Apple Health access
   for whatever you want Claude to see (e.g. Heart Rate, Heart Rate Variability, Resting Heart
   Rate, Sleep, Active Energy, Steps, Respiratory Rate, VO₂ Max, and Workouts — but any HealthKit
   metric the app can export will be stored and queryable).
2. In the app, create an **Automation**:
   - Type: **REST API**
   - URL: `https://<your-app>.fly.dev/api/health/ingest`
   - Headers: add `Authorization` = `Bearer <HEALTH_INGEST_TOKEN>`
   - Data format: **JSON**, aggregation: **Days**
   - Select the health metrics you want, enable workouts, and set the schedule (e.g. hourly).
3. Tap **Update/Run** once to test — the server replies with how many data points and days it stored,
   and the `/health` page shows the sync status.

## 3. Seed history (do this once)

Recovery scores compare each day against your rolling 42-day personal baseline, so the connector gets
good after it has some history (it needs ≥5 days to score at all). In Health Auto Export, do a one-time
manual export of the **last 60–90 days** to the same endpoint (or export to a JSON file and upload it on
the `/health` page).

To try everything without a phone, this repo ships a realistic sample. One line, works in
Command Prompt and bash alike (replace `YOUR_INGEST_TOKEN` with the value from your `.env`;
**in PowerShell type `curl.exe` instead of `curl`** — bare `curl` is an alias for a different
command there) — or skip curl entirely and upload `examples/health-auto-export-sample.json`
on the `/health` page:

```
curl -X POST "http://localhost:3000/api/health/ingest" -H "Authorization: Bearer YOUR_INGEST_TOKEN" -H "Content-Type: application/json" --data @examples/health-auto-export-sample.json
```

## 4. Connect Claude

### Option A — claude.ai custom connector (web, desktop, and mobile)

1. Go to **claude.ai → Settings → Connectors → Add custom connector** (available on paid plans).
2. Name: `Apple Health`, URL: `https://<your-app>.fly.dev/mcp/<MCP_TOKEN>`.
3. Add it, then enable it in a chat and ask: *“How did I sleep this week?”*

The `<MCP_TOKEN>` path segment is the access control — claude.ai connectors can't send custom
headers, so treat that URL like a password. (Opening it in a browser shows a "POST only" error;
that's normal — browsers send GET, Claude sends POST.)

### Option B — Claude Desktop, fully local (no hosting)

Add to `claude_desktop_config.json` (Claude Desktop → Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "apple-health": {
      "command": "node",
      "args": ["/path/to/calendar-repository/dist/health/stdio.js"]
    }
  }
}
```

Data still has to get into `data/apple-health.json` — either run the web server on the same machine
to receive pushes, or periodically upload a Health Auto Export JSON file on the `/health` page.

### Option C — Claude Code

```bash
claude mcp add --transport http apple-health https://<your-app>.fly.dev/mcp/<MCP_TOKEN>
```

## What Claude can do with it

Tools exposed by the connector:

| Tool | What it answers |
|---|---|
| `get_data_status` | What data exists, date range, last sync |
| `get_daily_summary` | “How recovered am I today? Should I train hard?” |
| `get_trends` | “How has my sleep/HRV/training load looked this month?” |
| `get_workouts` | “What did my runs look like last week?” |
| `get_sleep` | “Am I sleeping enough?” |
| `get_raw_metric` | Any individual stored metric, day by day, with units |

### How the scores work (and their limits)

- **Recovery (0–100):** 50% today's HRV vs your rolling 42-day baseline, 25% resting heart rate vs
  baseline, 25% sleep duration (7.5 h ≈ full credit). ≥67 is high / 34–66 moderate / <34 low.
- **Exertion (0–10):** a TRIMP-style load — workout minutes × heart-rate-reserve fraction, plus a
  small credit for steps — scaled so your own typical hard day lands around 7. The target range
  comes from recovery: the readier you are, the harder the suggested range.
- They're computed with transparent formulas from your own data, in the spirit of fitness apps'
  readiness scores (Athlytic, Whoop, …) — expect trends to be more meaningful than any single number.

## Privacy

Health data is sensitive. It stays in one JSON file on your server (`DATA_DIR`), is only writable
with `HEALTH_INGEST_TOKEN`, and only readable through the secret `/mcp/<MCP_TOKEN>` URL. Don't
share those tokens, and don't add the connector to a Claude account that isn't yours.
