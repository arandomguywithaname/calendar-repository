# Calendar Planning Agent

An AI-powered agent that parses natural language (or images) into Google Calendar events using Claude.

Also included: an **[Apple Health → Claude connector](APPLE_HEALTH.md)** — an MCP server that gives
Claude access to your Apple Health data (sleep, HRV, heart rate, workouts, activity), with recovery
and exertion estimates computed from it. See [APPLE_HEALTH.md](APPLE_HEALTH.md) for setup — and
[`ios/Vital/`](ios/Vital/README.md) for **Vital**, the family's own iPhone app that feeds it.

Also included: a **[Browser → Claude connector](BROWSER.md)** — an MCP server that lets Claude use
your own Chrome, so it can work with shops and sites that have no API (Amazon, Decathlon, order
histories, booking pages). It does **not** bypass CAPTCHAs: when a challenge, login or 2FA prompt
appears it hands the window to you, waits while you clear it, and carries on. It also refuses to
press the button that pays. See [BROWSER.md](BROWSER.md) for setup.

## Example

```
Event description: Schedule an event called meeting 1, on Saturday March 15, 2026,
also add a conference link with contacts @leo and @mia,
also add a location called 12311 Templeton Street
```

The agent extracts:
- **Title:** meeting 1
- **Date:** 2026-03-15T09:00:00
- **Location:** 12311 Templeton Street
- **Attendees:** @leo, @mia (resolved via `contacts.json`)
- **Conference link:** Google Meet auto-generated

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

**Required:**
- `ANTHROPIC_API_KEY` — your Claude API key

**Google Calendar (OAuth2):**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`

### 3. Configure contacts

Edit `contacts.json` to map @mentions to email addresses:

```json
{
  "leo": "leo@company.com",
  "mia": "mia@company.com"
}
```

### 4. Run

```bash
npm run dev        # compiles and starts the web app + Apple Health connector at http://localhost:3000
```

All of these work in Windows Command Prompt, PowerShell, and bash alike. Other ways to run:

```bash
npm run build && npm start   # compile once, then run with plain node (what the Dockerfile/Fly.io use)
npm run dev:cli              # the interactive command-line agent instead of the web app
```

## Features

- **Natural language parsing** — describe events in plain English
- **Image support** — upload a screenshot of an event and the agent extracts details
- **Google Meet** — automatically creates conference links when requested
- **Attendees** — resolves @mentions to emails via contacts.json
- **Location** — sets event location
- **Recurrence** — supports recurring events (e.g., "every Tuesday")
- **Reminders** — configurable email/popup reminders

Plus two connectors that give Claude access to things it otherwise cannot reach:
**[Apple Health](APPLE_HEALTH.md)** (your health data) and **[the browser](BROWSER.md)**
(shops and other sites with no API).

## Architecture

```
src/
  types.ts     — TypeScript interfaces for events, contacts, input
  parser.ts    — Claude API integration for NL/image → structured event
  calendar.ts  — Google Calendar API integration
  index.ts     — CLI entrypoint
  server.ts    — Express web server (also mounts the Apple Health connector)
  health/      — Apple Health → Claude connector (MCP server, see APPLE_HEALTH.md)
    ingest.ts  — parses Health Auto Export payloads
    metrics.ts — recovery/exertion estimates from personal baselines
    mcp.ts     — the MCP tools Claude calls
    router.ts  — /api/health/ingest + /mcp endpoints
    stdio.ts   — local stdio entry for Claude Desktop
  browser/     — Browser → Claude connector (MCP server, see BROWSER.md)
    guards.ts  — CAPTCHA/login/bot-wall detection and the purchase guard
    session.ts — attaches to your Chrome, or launches its own profile
    snapshot.ts— page reading, element refs, product extraction
    mcp.ts     — the MCP tools Claude calls
    stdio.ts   — local stdio entry (must run on the machine with the screen)
```
