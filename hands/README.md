# Hands

A small, honest HTTP reader for Claude. It runs on a server **you** own (Fly.io, or a box at
home), loads the **public** pages Claude names, and hands back plain data — name, price,
currency, availability, rating. Claude is the head: it searches, compares, ranks. Hands is the
hands: it only goes where it is sent, and only reads.

```
You ─▶ Claude app ──MCP──▶ Hands (your server) ──plain HTTP──▶ public shop pages
                              └──────── plain JSON ────────────┘
```

**v0.3: no browser.** Pages are read with `httpx` and the product comes out of the structured
data shops publish for search engines (JSON-LD, microdata, OpenGraph). That is why a 512 MB
machine is enough and why `pip install` pulls no Chromium.

Design follows *Amazon v. Perplexity* (9th Cir., 2026): the access is made by the user, from
their own infrastructure, on their own instruction, to public pages, with no one else's account;
the AI provider only receives the result. Anything that looks like disguise or circumvention is
out of scope, on purpose. Not legal advice.

## What Hands does not do

- **No logins, no cookies sessions, no cart or checkout endpoints, no undocumented APIs.** Public
  pages only.
- **No disguise.** The User-Agent says exactly what this is:
  `Hands/0.3 (+https://github.com/arandomguywithaname/calendar-repository; personal price monitor)`.
  No browser-lookalike UA, no proxies, no "stealth", no captcha solving.
- **No pushing past a "no".** A challenge page, a captcha marker, a 401/403/429/503 → the tool
  returns `Blocked`, the domain cools down for 6 hours, nothing is retried.
- **No thinking on the server.** No LLM here. Hands does not search for shops, does not decide
  which listing matches your query, does not convert currencies. It fetches, extracts, normalises.
- **No per-shop code.** Sites differ only in their structured data, and (if you save one) in a
  JSON selector recipe.

## Tools Claude gets

| tool | does |
|---|---|
| `product(url)` | one page → `Product` (name, price `{amount, currency}`, availability, rating, reviews, image, description) + `meta` (`source`, `platform`, `needs_browser`, `item_urls` for listings) |
| `products(urls)` | up to 20 pages at once — **the "compare in N shops" tool**. Parallel across domains, one at a time inside a domain; each url gets a result or an `{ok:false, error}` |
| `read(url)` | readable title / text / links for any page — the fallback when `source` is `none` |
| `extract(url, schema \| recipe)` | structured records by CSS-selector schema, no code |
| `save_recipe / list_recipes` | store a selector schema by name and reuse it |
| `watch_add / watch_list / watch_remove / watch_check` | watch a price on any url; `watch_check` re-reads them all |
| `status()` | per-domain budget, cooldowns, blocks |

Every error is `{"ok": false, "error": "Blocked|RateLimited|NotAllowed|BadInput|Fetch", "message": …}`.

`meta.source` tells Claude how much to trust a number: `jsonld` is what the shop tells Google;
`microdata` is the same idea, older; `opengraph` is a social-share card and sometimes stale;
`none` means nothing published — read the page. `meta.needs_browser: true` means the page is a
JavaScript shell with no data in the HTML; Claude is told to say so, not to retry.

## Run it

- **On your own Fly.io app** — see **[CLOUD.md](CLOUD.md)**. Recommended: always on, works from
  the Claude app on your phone.
- **On a home box** — below. The strongest legal posture (your own device).

### Home box

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt            # no Playwright, no system libraries
export HANDS_TOKEN=$(openssl rand -hex 32)
python -m hands.server                     # http://127.0.0.1:8765/mcp
```

Expose it over HTTPS (`cloudflared tunnel --url http://127.0.0.1:8765` or
`tailscale funnel 8765`), then in Claude: **Customize → Connectors → Add custom connector**, URL
`https://…/mcp`, header `Authorization: Bearer <token>`.

### Tests

```bash
pip install pytest pytest-asyncio
pytest -q          # ~90 tests, all offline: fixtures + a local http.server + the real MCP client
```

## Politeness, built in

Per domain: one page at a time, ≥ 15 s + jitter between pages, ≤ 30 pages/hour. Globally
≤ 90 pages/hour. Different domains run side by side. Any block → 6 h cooldown for that domain.
A 600 s cache means asking twice about the same page costs nothing and touches no budget.
`robots.txt` is fetched (outside the budget, cached a day) and, in `warn` mode, reported in every
result as `robots_allowed`; `enforce` refuses disallowed paths; `off` ignores it.

## Config (env)

| variable | default | |
|---|---|---|
| `HANDS_TOKEN` | — | **required**, ≥ 16 chars; the only lock on the endpoint |
| `HANDS_HOST` / `HANDS_PORT` | `127.0.0.1` / `8765` | Fly sets `0.0.0.0` / `8080` |
| `HANDS_LOCALE` | `en-US` | `Accept-Language`; per-call `locale=` overrides |
| `HANDS_USER_AGENT` | the honest one | override only to say something *more* about yourself |
| `HANDS_CACHE_TTL` | `600` | seconds a fetched page is reused |
| `HANDS_MIN_GAP` | `15` | seconds between pages on one domain (+0–4 s jitter) |
| `HANDS_PER_DOMAIN_PER_HOUR` / `HANDS_GLOBAL_PER_HOUR` | `30` / `90` | hourly caps |
| `HANDS_COOLDOWN_HOURS` | `6` | after a block |
| `HANDS_ROBOTS` | `warn` | `off` / `warn` / `enforce` |
| `HANDS_ALLOW_DOMAINS` / `HANDS_DENY_DOMAINS` | — | space/comma lists, subdomains included |
| `HANDS_DB` | `data/hands.db` | SQLite: watches and price history |
| `HANDS_RECIPES_DIR` | `hands/recipes` | saved selector schemas |
| `HANDS_DUMP_DIR` | — | if set, every fetched page's HTML is saved here (selector work) |

## The fragile part

Shops change markup; structured data changes far less. When a field is `null`, look at
`meta.source` first. For a page with no structured data, set `HANDS_DUMP_DIR=./dump`, fetch it
once, open the saved HTML, and write a selector schema for `extract` — then `save_recipe` it.

## Layout

```
hands/
  fetch.py       Fetcher protocol, HttpFetcher (httpx), cache, BrowserFetcher stub (v0.4)
  policy.py      per-domain locks, hourly caps, cooldown, allow/deny, robots.txt, detect_block
  structured.py  extract_product: jsonld → microdata → opengraph → none; Product; platform; needs_browser
  extract.py     readable() for `read`; extract() for selector recipes
  parse.py       parse_price and friends
  store.py       SQLite for watches
  server.py      the MCP server: tools, bearer auth, /health
  recipes/       saved selector schemas (JSON)
tests/           pytest, all offline; fixtures/ holds the HTML cases
```
