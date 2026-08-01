# Calendar Repository

Two apps live here:

- **Joseph's Math Studio** — a project studio for a maths classroom ([docs](#josephs-math-studio))
- **Calendar Planning Agent** — the original natural-language → Google Calendar agent

---

# Joseph's Math Studio

A creation studio for Joseph's maths class. Run the server and open
**http://localhost:3000/studio/**.

### How you get in

1. **Studio password** — `williamiscool123`
2. **Pick a profile** — Joseph (teacher), an existing student, or *Another user* to make a new one
3. **Sign in** with that profile's passcode (the first passcode you type for a profile becomes its passcode)

Joseph is a teacher account and sees every project in the studio, with the
student's name on each card. Students see only their own.

### Making a project

From the dashboard: **+ New Project** → pick a creation type → pick **With AI** or **From scratch**.

| Type | What it is |
| --- | --- |
| **3D Creation** | Spin a model around — a built-in shape or your own `.obj` — with colour, wireframe, and motion (spin / bob / orbit / pulse). Exports `.obj` and PNG. |
| **2D Slides** | Slides you edit and present full screen with the arrow keys. Text, boxes, circles, photos, web images and stickers. Exports a standalone web page. |
| **Whiteboard** | Draw, type, stickers, shapes, photos, code blocks and playable games (Tetris, Blockoff) on an infinite pannable board. Ctrl+C / Ctrl+V, Ctrl+Z, Delete. Exports PNG. |
| **Animation** | A keyframe timeline over photos, videos, web images, text, stickers and 3D models. Play, scrub, and export to video (`.webm`). |

**With AI** asks you to describe what you want in plain English and builds it into
the editor, where you can still change everything by hand. Projects are named
`Project 1`, `Project 2`, `Project 3`… and can be renamed.

### Editing and presenting a finished project

Select a project on the dashboard and it asks what you'd like to do:

- **✏️ Edit** — open it in its editor and keep working
- **▶ Present** — full screen with every toolbar hidden, ready to show the class

Both are also one-click buttons on the card, and there's a **▶ Present** button in
the editor's top bar for going straight from making to showing. **Esc** or
**✕ Exit** leaves present mode and puts you back where you started.

What "present" means per type:

| Type | Presenting |
| --- | --- |
| **3D** | The model full screen, turning on its own, with its label underneath. Drag to spin, scroll to zoom. |
| **2D Slides** | A slideshow — arrow keys, space, click, or the on-screen arrows; a slide counter at the bottom. |
| **Whiteboard** | The whole board zoomed to fit. Drag to move around, scroll to zoom, and the games stay playable. |
| **Animation** | Plays full screen on a loop; click the picture to pause or resume. |

The `⋯` button on a card renames, copies or deletes it.

There's a **Chat** drawer for a class chat and a per-project chat. Start a message
with `@claude` to ask the AI helper a question.

### Where things are saved

Everything (users, projects, chat) is saved in the browser's `localStorage` on
that device — no database and no accounts server. Use the export buttons in each
editor to get files out.

### AI setup (optional)

The studio works fully without any API key: "With AI" falls back to a built-in
offline builder and says so on screen. To switch Claude on, put
`ANTHROPIC_API_KEY` in `.env` and restart — `/api/studio/status` reports which
mode you're in.

### Files

```
public/studio/
  index.html            — the whole app shell (screens + modals + chat)
  css/studio.css
  js/store.js           — localStorage: users, projects, chat
  js/ai.js              — AI client + offline generator
  js/app.js             — gate, profiles, sign-in, dashboard, editor loading
  js/gl.js              — hand-rolled WebGL renderer + .obj loader/exporter
  js/editors/           — threed.js, slides.js, whiteboard.js, animation.js
  js/games/             — tetris.js, blockoff.js
src/studio.ts           — /api/studio/{status,generate,chat}
```

---

# Calendar Planning Agent

An AI-powered agent that parses natural language (or images) into Google Calendar events using Claude.

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
npm run dev
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
```
