# Browser → Claude Connector

A Claude connector (an [MCP](https://modelcontextprotocol.io) server) that lets Claude use
**your own browser** — so it can work with shops and sites that have no API: Amazon, Decathlon,
a supermarket, an airline, your order history, a booking page.

## The honest bit, first

Sites like Amazon and Decathlon put CAPTCHAs and bot walls in front of automated traffic **on
purpose**. This connector does not defeat them, and it is not built to. There is no solver
service, no fingerprint spoofing, no user-agent rotation and no proxy list anywhere in it.

What it does instead is simple and it actually works: **it drives the browser you are sitting in
front of, and when a challenge appears it asks you to solve it.** A banner pops up in the window,
Claude waits, you click the traffic lights or type your password, and Claude carries on from
wherever you landed.

That is not a workaround — it is the arrangement those sites are asking for. A CAPTCHA means
"a human should be doing this". So a human does that part.

```
You ──▶ your own Chrome ◀── this connector ◀── Claude
        (real profile,      opens pages,        "find me running
         real logins,       reads them,          shoes under 80 €"
         visible window)    clicks, types
                │
                └── CAPTCHA / login / 2FA appears
                        ──▶ banner in the window ──▶ you solve it ──▶ Claude continues
```

## What it can and cannot do

**Can**
- Open any page and read it — text, links, buttons, form fields
- Click, type, choose dropdown options, scroll, go back, take screenshots
- Pull products off a page (name, price, currency, stock, rating, link) from the site's own
  structured data — the same JSON-LD it publishes for Google
- Compare prices across several shops, fill a basket, walk to the checkout
- Use your existing logins, because it is literally your browser

**Cannot, by design**
- Solve, bypass, or disguise itself around a CAPTCHA or a bot wall
- Type a password, a card number, or a one-time code — those are yours to enter
- Press a button that places an order or takes a payment (see [the money guard](#the-money-guard))
- Run on a server with nobody in front of it. The whole design needs a human at the screen

---

## 1. Install

This has to run on the computer with the screen and the browser.

```bash
npm install              # the repo's own dependencies
npm run browser:setup    # adds Playwright and a Chromium, ~150 MB
npm run build
```

Playwright is deliberately **not** in `package.json` — the calendar app and the Fly.io deploy
have no business downloading a browser. `npm run browser:setup` installs it just on this machine.

## 2. Choose how it gets a browser

### Option A — attach to your own Chrome (recommended)

Claude drives the Chrome *you* started. Your logins, your cookies, your extensions.

Start Chrome once with remote debugging on, pointed at a profile directory kept for this:

**macOS**
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 --user-data-dir="$HOME/chrome-claude"
```

**Windows** (Command Prompt or PowerShell)
```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\chrome-claude"
```

**Linux**
```bash
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/chrome-claude"
```

Then sign in to the shops you care about in that window, once. The profile remembers.

> **Use a separate `--user-data-dir`, as above.** Anything with the debugging port open can drive
> that browser, so give it its own profile rather than pointing it at your everyday Chrome with
> your bank, your email and your password manager signed in. Same reason you would not hand
> someone your unlocked phone to look up a recipe.

### Option B — let the connector run its own browser

Set `BROWSER_MODE=profile` and it launches a visible Chrome against its own persistent profile
(`~/.claude-browser-profile` by default). Sign in once, and it stays signed in. Nothing to start
by hand — but it will not see the logins in your normal Chrome.

The default, `BROWSER_MODE=auto`, tries A and falls back to B.

## 3. Point Claude at it

**Claude Desktop** — `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "browser": {
      "command": "node",
      "args": ["/full/path/to/calendar-repository/dist/browser/stdio.js"],
      "env": {
        "BROWSER_MODE": "attach",
        "BROWSER_ALLOWED_DOMAINS": "amazon.de,amazon.fr,decathlon.fr"
      }
    }
  }
}
```

**Claude Code** — from the repo directory:

```bash
claude mcp add browser -- node "$PWD/dist/browser/stdio.js"
```

Restart Claude, and ask it something like *"open decathlon.fr and find me trail running shoes
under 80 euros"*.

---

## Settings

All optional; set them in the `env` block above, or in `.env` if you start the server yourself.

| Variable | Default | What it does |
| --- | --- | --- |
| `BROWSER_MODE` | `auto` | `attach` (your Chrome), `profile` (its own), `auto` (try attach, then profile) |
| `BROWSER_CDP_URL` | `http://127.0.0.1:9222` | Where to attach |
| `BROWSER_PROFILE_DIR` | `~/.claude-browser-profile` | Profile for `profile` mode |
| `BROWSER_ALLOWED_DOMAINS` | *(empty — all allowed)* | Comma-separated allowlist, e.g. `amazon.de,decathlon.fr`. Subdomains count; lookalikes like `notamazon.de` do not |
| `BROWSER_ALLOW_PURCHASE` | `never` | `never`, or `confirm` to let Claude place an order after you say yes in the chat |
| `BROWSER_TIMEOUT_MS` | `45000` | Navigation timeout |

## The two guards

### The human handoff

Every tool that reads or acts on a page checks for a wall first. When one is up, the tool
**refuses** and tells Claude to call `browser_request_human`, which brings the window forward,
drops an orange banner across the top saying what you need to do, and polls until the page is
clear. It reports back honestly if you never got to it.

It recognises reCAPTCHA, hCaptcha, Cloudflare Turnstile, Arkose/FunCaptcha, GeeTest, Amazon's
character challenge, Cloudflare and Akamai interstitials, HTTP 403/429, login forms, one-time-code
prompts, age gates and cookie banners — in English, French, German, Spanish, Italian and Dutch.

Cookie banners are the one thing it detects but does not treat as a wall: the page behind them is
readable, and **which button to press is your decision**, not Claude's. Claude has to ask you,
then call `browser_dismiss_consent` with `accept` or `reject`.

### The money guard

A click on **Place your order**, **Buy now**, **Jetzt kaufen**, **Passer la commande**,
**Comprar ahora**, **Procedi all'ordine** and their friends is refused. Claude can search,
compare, choose a size, add to the basket and get you to the checkout page — then it stops and
tells you to press the last button yourself.

If you genuinely want Claude to be able to place an order, set `BROWSER_ALLOW_PURCHASE=confirm`.
It then still refuses unless you have told it, in that conversation, to place that specific order.
`never` is the default for a reason.

## What a session looks like

> **You:** find me trail running shoes under 80 € on decathlon.fr
>
> Claude opens the site, hits a cookie banner, asks whether to accept or reject, dismisses it,
> types into the search box, reads 24 products out of the page's structured data and gives you a
> table sorted by price.
>
> **You:** add the Evadict TR2 in 43 to my basket
>
> Claude opens the product, picks the size, clicks add-to-basket — and hits a login wall. The
> window comes forward with a banner: *"Claude needs you: sign in to Decathlon."* You sign in.
> Claude picks straight back up, confirms the basket, and says: *"It's in your basket at 74,99 € —
> press **Passer la commande** yourself when you're ready. I can't press that one."*

## Troubleshooting

**"Playwright is not installed"** — run `npm run browser:setup` on this machine.

**"No browser is listening at http://127.0.0.1:9222"** — Chrome is not running with the debugging
port. Start it with the command in Option A, or switch to `BROWSER_MODE=profile`.

**Claude says a ref is gone** — refs (`e12`) are reissued on every snapshot. Any click or
navigation invalidates them. Claude just needs to snapshot again; the tool descriptions say so.

**A site blocks you anyway** — some will, and that is their answer. Sign in, slow down, or use the
site's app or official API. Do not go looking for a way around it; there is nothing in this
connector that will help you do that, and getting caught trying usually means a banned account.

**Prices look wrong** — `browser_extract_products` reads the site's structured data, which is
occasionally stale or excludes delivery. For anything you are about to pay for, check the page.

## Deliberately not included

No CAPTCHA-solving service. No stealth or anti-detection plugin. No fingerprint, user-agent or
canvas spoofing. No proxy or IP rotation. No headless mode. No "wait for the human" that quietly
gives up and clicks anyway.

If you are tempted to add one of these: the rules live in `src/browser/guards.ts`, and the
comment at the top of that file explains why they stay as they are.
