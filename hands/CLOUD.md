# Hands on Fly.io — your personal backend

A single-user Hands on **your own** Fly.io app. Same code and guardrails as the home-box
version; the machine you rent is the one doing the reading. Because it is your app, used only
by you, on your instruction, it stays close to the *Amazon v. Perplexity* logic — but it is a
step further from "your own device", so keep it **just you**. Do not hand the URL + token to
anyone else; that turns it into the multi-user pattern courts have been wary of.

```
You (Claude app, phone or desktop)
   │  MCP tool call, Bearer <token>
   ▼
Anthropic cloud ──▶ https://hands-you.fly.dev/mcp ──▶ your Fly machine ──plain HTTP──▶ public pages
                                                            │
                                                     plain JSON back
```

v0.3 has no browser, so the machine is small (512 MB) and starts in seconds.

## What you need
- A [Fly.io](https://fly.io) account and `flyctl` installed (`brew install flyctl`, or see fly.io/docs).
- The Claude app. Custom connectors work on any plan; unattended scheduled checks need Cowork on a paid plan.

## Deploy (about 5 minutes)

```bash
cd hands
fly launch --no-deploy            # pick a unique app name; it rewrites `app` in fly.toml.
                                  # Say NO to Postgres/Redis. Keep the suggested volume mount.

# the volume the mount expects (same name as in fly.toml, same region)
fly volumes create hands_data --size 1 --region mad

# your secret — the only lock on the endpoint. Save it: you cannot read it back later.
TOKEN=$(openssl rand -hex 32); echo "$TOKEN"
fly secrets set HANDS_TOKEN="$TOKEN"

fly deploy
fly status                        # 1 machine, health check passing
curl https://<your-app>.fly.dev/health
```

`/health` needs no token and returns the budget state, so it is safe for the Fly health check.

## Connect it to Claude (once, on web or desktop)
1. **Customize → Connectors → + → Add custom connector**
2. Name `Hands`, URL `https://<your-app>.fly.dev/mcp`
3. **Advanced settings → Request headers →** add `Authorization: Bearer <your token>`
4. Add, then in a chat open **+ → Connectors** and switch Hands on.

Connectors added on the web appear in the Claude iOS/Android apps automatically. (You just
cannot *add* new connectors from the phone.)

## Use it
- "Is this cheaper anywhere? Here's the product page." → Claude searches with its own web
  search, then calls **`products([...urls])`** to verify the prices through Hands.
- "Get the price and stock from this URL." → `product`
- "Read this page and summarise it." → `read`
- "Pull every row from this listing — name, price, link." → `extract` with a schema;
  `save_recipe` to keep it
- "Watch this URL, tell me if it drops below 250." → `watch_add`
- "Check my watched items." → `watch_check`

**Unattended:** in Claude Cowork, `/schedule` a task — *"Every morning at 8, call Hands
`watch_check` and tell me anything at or under target, or that dropped."* Cowork tasks run in
Anthropic's cloud; your Fly machine only needs to be up (it is — `min_machines_running = 1`).

## Keep it defensible and healthy
- **Just you.** One user, one agent. Don't share the token.
- **Cloud IPs get blocked more.** Shops distrust data-centre ranges, and Hands does not hide
  where it comes from — the defaults (≥ 15 s between pages, ≤ 30/domain/hour) matter more here
  than at home. If a shop blocks, that is its answer: Hands cools that domain down for 6 h and
  Claude is told to say so. Do not "fix" this with proxies; it is the line the project does not cross.
- **Restrict scope if you like.** Set `HANDS_ALLOW_DOMAINS` in `fly.toml` to a short list so the
  backend will only ever touch sites you named.
- **robots.txt.** `HANDS_ROBOTS=warn` reports what a path's robots.txt says (`robots_allowed` in
  every result); `enforce` refuses disallowed paths; `off` ignores it.
- **Pages that are JS shells** come back with `needs_browser: true` and no data. That is a fact
  about the site, not a bug; a browser fetcher is planned for v0.4 and is deliberately absent now.

## Costs & ops
- `shared-cpu-1x` / 512 MB always-on is a couple of dollars a month; the 1 GB volume is pennies.
- Logs: `fly logs`. Redeploy after edits: `fly deploy`. Rotate the token:
  `fly secrets set HANDS_TOKEN=…` then update the header in the connector.
- Upgrading from v0.2: the volume and its `hands.db` carry over unchanged; the watch tools are
  now `watch_*` (were `track_*`) and `fetch_page` is now `read`. Memory can go down to 512 MB.

## If you'd rather keep it at home
The same code runs on a Pi or a desktop with a tunnel instead — see `README.md`. That is the
strongest legal posture (your own device); Fly is the convenient middle. Your call.
