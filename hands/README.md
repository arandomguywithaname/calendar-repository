# Hands

A **universal, local-first** browser connector for Claude. It runs on a machine you own
(home box *or* your own Fly.io app), opens **public** web pages in a real Chromium, and hands
Claude **plain data**. Claude is the brain; your machine is the hands. Works on any site.

```
You ─▶ Claude app ──MCP──▶ Hands (your machine) ──Chromium──▶ the web
                              └──────── plain JSON ───────────┘
```

Design follows *Amazon v. Perplexity* (9th Cir., Aug 2026): the connection comes from a device
**you** control; the AI provider only gets observations and gives instructions. Hands is stricter —
Claude receives extracted text/JSON, never a session, never your credentials.

> Closes the "hacking" (CFAA) question, not the contract one. Automated access can still breach a
> site's terms; a site may block you. Hands stays polite and **stops on a block — never bypasses it.**
> Not legal advice.

## Tools Claude gets (all sites)
| tool | does |
|---|---|
| `fetch_page(url)` | readable title / text / links for any page |
| `products(url)` | schema.org Product data (price, rating, availability) — most shops publish it |
| `extract(url, schema \| recipe)` | structured records by CSS-selector schema, no code |
| `save_recipe / list_recipes` | store a schema and reuse it by name |
| `track_add / track_list / track_remove / track_check` | watch a price on **any** URL |
| `status()` | per-domain budget + cooldown |

## Run it
- **On your own cloud (Fly.io):** see **CLOUD.md** — recommended for "always on", single-user.
- **On a home box (Pi/desktop):** below — strongest legal posture.

### Home box
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
export HANDS_TOKEN=$(openssl rand -hex 32)
python -m hands.server            # http://127.0.0.1:8765/mcp
```
Expose over HTTPS (`cloudflared tunnel --url http://127.0.0.1:8765` or `tailscale funnel 8765`),
then add the URL + `Authorization: Bearer <token>` header in **Customize → Connectors**.

## Guardrails
Per-domain budget (≥15 s between loads, ≤30/hour, global ≤90/hour); generic block/captcha/403/429
detection → 6 h cooldown, no bypass; public pages only, no login; optional `HANDS_ALLOW_DOMAINS`
allow-list and `HANDS_ROBOTS=warn|enforce|off`.

## Config
`HANDS_TOKEN` (required), `HANDS_HOST`/`HANDS_PORT`, `HANDS_MARKETPLACE`→n/a, `HANDS_ALLOW_DOMAINS`,
`HANDS_DENY_DOMAINS`, `HANDS_ROBOTS`, `HANDS_MIN_GAP`, `HANDS_PER_DOMAIN_PER_HOUR`,
`HANDS_GLOBAL_PER_HOUR`, `HANDS_COOLDOWN_HOURS`, `HANDS_HEADLESS`, `HANDS_BROWSER_CHANNEL`,
`HANDS_LOCALE`, `HANDS_DB`, `HANDS_RECIPES_DIR`, `HANDS_DUMP_DIR`.

## The fragile part
Sites change markup. When a field is `null`, prefer `products()` (schema.org is stable); for `extract`
set `HANDS_DUMP_DIR=./dump`, fetch once, open the saved HTML, adjust selectors. Offline tests:
`python tests/test_extract.py`.
