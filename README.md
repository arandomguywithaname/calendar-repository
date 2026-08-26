# Calendar Planning Agent

An AI-powered agent that parses natural language (or images) into Google Calendar events using Claude.

Also included: an **[Athlytic → Claude connector](ATHLYTIC.md)** — an MCP server that gives Claude
access to the Apple Health data behind the Athlytic app (recovery, exertion, sleep, HRV, workouts).
See [ATHLYTIC.md](ATHLYTIC.md) for setup.

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

Production-style (compile once, run with plain node — this is what the Dockerfile/Fly.io use):

```bash
npm run build
npm start          # web UI + Athlytic connector at /mcp
```

Or the interactive CLI:

```bash
npm run build && npm run cli
```

## Features

- **Natural language parsing** — describe events in plain English
- **Image support** — upload a screenshot of an event and the agent extracts details
- **Google Meet** — automatically creates conference links when requested
- **Attendees** — resolves @mentions to emails via contacts.json
- **Location** — sets event location
- **Recurrence** — supports recurring events (e.g., "every Tuesday")
- **Reminders** — configurable email/popup reminders

## Architecture

```
src/
  types.ts     — TypeScript interfaces for events, contacts, input
  parser.ts    — Claude API integration for NL/image → structured event
  calendar.ts  — Google Calendar API integration
  index.ts     — CLI entrypoint
  server.ts    — Express web server (also mounts the Athlytic connector)
  athlytic/    — Athlytic → Claude connector (MCP server, see ATHLYTIC.md)
    ingest.ts  — parses Health Auto Export payloads
    metrics.ts — Athlytic-style recovery/exertion estimates
    mcp.ts     — the MCP tools Claude calls
    router.ts  — /api/athlytic/ingest + /mcp endpoints
    stdio.ts   — local stdio entry for Claude Desktop
```
