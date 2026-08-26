# CLAUDE.md

Guidance for Claude Code (and other AI assistants) working in this repository.

## What this project is

A **calendar planning agent**: it turns natural-language text (and/or an image) into
a structured calendar event via the Claude API, then creates that event in Google
Calendar. There are two front doors over the same core — an interactive CLI and a
small Express web app.

TypeScript, CommonJS, compiled with `tsc` to `dist/`. No framework, no test runner,
no linter, no CI.

## Layout

```
src/
  types.ts     TypeScript interfaces (CalendarEvent, Attendee, Reminder, AgentInput, ContactsMap)
  parser.ts    Claude API call: text/image -> CalendarEvent JSON
  calendar.ts  Google Calendar API: CalendarEvent -> created event
  index.ts     CLI entrypoint (readline prompts, confirm, create)
  server.ts    Express entrypoint: static /public + POST /api/parse, POST /api/create
public/
  index.html   Entire frontend — markup, CSS, and vanilla JS in one file (no build step)
contacts.json  @mention -> email map, committed at repo root
.env.example   Template for the required secrets (.env itself is gitignored)
tsconfig.json  strict: true, target es2020, module commonjs, rootDir src -> outDir dist
```

The dependency flow is one-directional and worth preserving:

```
index.ts  ─┐
           ├─> parser.ts ──> Anthropic SDK
server.ts ─┘   calendar.ts ─> googleapis
               types.ts (shared, no runtime deps)
```

`parser.ts` and `calendar.ts` are the shared core — **both entrypoints must keep
behaving the same**. If you change the parse or create flow, update the CLI and the
server together, and check whether `public/index.html`'s `renderEvent()` needs the
new field.

## Commands

```bash
npm install         # dependencies (node_modules/ is not committed)
npm run build       # tsc -> dist/
npm run dev         # tsc && node dist/index.js   (CLI, recompiles first)
npm run web         # tsc && node dist/server.js  (web UI on :3000, recompiles first)
npm run start       # node dist/index.js          (no recompile)
npm run web:start   # node dist/server.js         (no recompile)
npx tsc --noEmit    # typecheck only
```

`npm run dev` and `npm run web` compile before running, so there is no watch mode —
restart after every edit. `PORT` overrides the web server's default 3000.

There are **no tests and no lint config**. The only automated check available is
`npx tsc --noEmit`; run it before committing. Do not add a test runner, linter, or CI
workflow unless asked.

## Environment

Copy `.env.example` to `.env`. Both entrypoints call `dotenv.config()` at module load —
`parser.ts` and `calendar.ts` do **not**, so anything that imports them directly must
load dotenv itself.

- `ANTHROPIC_API_KEY` — required. `new Anthropic()` in `parser.ts` is constructed with
  no arguments and reads this from the environment.
- Google Calendar auth, in `calendar.ts:getAuthClient()`, has two branches and
  **`GOOGLE_APPLICATION_CREDENTIALS` wins if it is set at all**:
  - Service account: `GOOGLE_APPLICATION_CREDENTIALS` pointing at a JSON key file.
  - OAuth2: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`,
    optional `GOOGLE_REDIRECT_URI` (defaults to `http://localhost:3000/callback`).

Never commit `.env`, API keys, refresh tokens, or a service-account JSON file. Keep
real addresses out of `contacts.json` — it is committed and currently holds
`@example.com` placeholders.

## Conventions and things that will bite you

**Runtime paths are relative to `dist/`, not `src/`.** Both entrypoints resolve
`path.resolve(__dirname, "../contacts.json")` and `path.join(__dirname, "../public")`,
which land at the repo root only because compiled code lives in `dist/`. Changing
`outDir`, `rootDir`, or adding subdirectories under `src/` breaks contact loading and
static file serving. Adjust these paths if you touch the layout.

**The parser expects raw JSON.** `parser.ts` does `JSON.parse(textBlock.text)` with no
fence-stripping and no try/catch, so a model reply wrapped in ```` ```json ```` throws.
The system prompt is what keeps output clean — if you edit `SYSTEM_PROMPT`, keep the
"Return ONLY valid JSON — no markdown" instruction, and keep the inline schema in sync
with `CalendarEvent` in `types.ts`.

**Today's date is injected, not assumed.** Both entrypoints compute
`new Date().toISOString().split("T")[0]` and pass it into `parseInput()` so relative
dates ("next Tuesday") resolve. Preserve that argument.

**The model ID is hardcoded** in `parser.ts` (`model: "claude-sonnet-4-20250514"`).
Change it there; there is no config for it.

**Creating an event emails real people.** `calendar.ts` sets
`sendUpdates: "all"` whenever there is at least one resolved attendee. Do not run the
create path against a real calendar to "test" a change.

**Unresolved @mentions are dropped silently-ish.** `resolveAttendees()` lowercases the
tag, strips `@`, looks it up in `contacts.json`, and on a miss logs a warning and skips
that attendee — the event is still created without them.

**Google Meet requires `conferenceDataVersion: 1`.** When `event.conferenceLink` is
true, `calendar.ts` sets both the `conferenceData.createRequest` body and the
`conferenceDataVersion` query param. Both are needed; setting only one silently yields
no Meet link.

**Optional fields go out as `undefined`, never `null`.** Empty arrays and empty strings
are normalized to `undefined` before being handed to the Google API. Follow that pattern
for any new field.

**`public/index.html` is hand-written and self-contained.** No bundler, no npm
dependency, no framework — plain `fetch`, `FormData`, and `innerHTML`. Keep it that way.
Note that `renderEvent()` interpolates model-produced strings straight into `innerHTML`;
if you extend it, escape the values.

**Web upload flow.** `POST /api/parse` accepts multipart (`multer`, memory storage,
10 MB cap), writes the buffer to `/tmp/upload-<ts>-<name>`, hands the path to
`parseInput()`, then unlinks it. The unlink only runs on the success path, so a parse
failure leaks the temp file — fix that with a `finally` if you touch this handler.
`POST /api/create` takes the (client-editable) event JSON back and forwards it to
Google with no validation.

**Style.** Two-space indent, double quotes, semicolons, named `export function`s,
`async`/`await` (no `.then` chains), JSDoc one-liners above exported and helper
functions. `strict` is on — no `any` except the existing `catch (err: any)` in
`server.ts`. Match the surrounding file.

## Git workflow

- Remote: `arandomguywithaname/calendar-repository`.
- Work on a `claude/<topic>` branch; push with `git push -u origin <branch>`.
- Commit messages are short and imperative; some use Conventional Commit prefixes
  (`feat: initial calendar planning agent`). Either form is fine — be descriptive.
- `node_modules/`, `dist/`, and `.env` are gitignored. Never commit build output.
- Do not open a pull request unless explicitly asked.
