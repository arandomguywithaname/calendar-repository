# Hands on Fly.io — your personal backend

A single-user version of Hands that lives on **your own** Fly.io app instead of a box at home.
Same code, same guardrails; the browser just runs on a machine you rent. Because it's your app,
used only by you, with your instruction and (if any) your credentials, it stays much closer to the
*Amazon v. Perplexity* logic than a shared service would — but it's a step further from "your own
device," so keep it **just you**. Don't hand the URL + token to other people; that turns it into the
multi-user pattern the courts have been wary of.

```
You (Claude app, phone or desktop)
   │  MCP tool call, Bearer <token>
   ▼
Anthropic cloud ──▶ https://hands-you.fly.dev/mcp ──▶ your Fly machine ──Chromium──▶ the web
                                                            │
                                                     plain JSON back
```

## What you need
- A [Fly.io](https://fly.io) account and `flyctl` installed (`brew install flyctl`, or see fly.io/docs).
- A paid Claude plan (custom connectors work on Free too, but scheduled unattended checks need Cowork on a paid plan).

## Deploy (about 10 minutes)

```bash
cd hands
fly launch --no-deploy            # pick a unique app name; it rewrites `app` in fly.toml.
                                  # Say NO to a Postgres/Redis db. Keep the suggested volume mount.

# create the volume the mount expects (same name as in fly.toml, same region)
fly volumes create hands_data --size 1 --region mad

# your secret — this is the only lock on the endpoint
fly secrets set HANDS_TOKEN=$(openssl rand -hex 32)
fly secrets list                  # note: you can't read the value back; save it now (see below)

fly deploy
fly status                        # should show 1 machine, health check passing
curl https://<your-app>.fly.dev/health
```

To capture the token at creation time, set it into a shell variable first:

```bash
TOKEN=$(openssl rand -hex 32); echo "$TOKEN"      # copy this
fly secrets set HANDS_TOKEN="$TOKEN"
```

## Connect it to Claude (once, on web or desktop)
1. **Customize → Connectors → + → Add custom connector**
2. Name `Hands`, URL `https://<your-app>.fly.dev/mcp`
3. **Advanced settings → Request headers →** add `Authorization: Bearer <your token>`
4. Add, then in a chat open **+ → Connectors** and switch Hands on.

Connectors added on the web appear in the Claude iOS/Android apps automatically — so this is live on
your phone with no extra step. (You just can't *add* new connectors from the phone.)

## Use it (any site, not just shops)
- "Read this page and summarise it." → `fetch_page`
- "Get the price and rating from this product URL." → `products` (schema.org first)
- "Pull every result row from this listing — name, price, link." → `extract` with a schema
- "Save that schema as `acme-listing` so we can reuse it." → `save_recipe`
- "Watch this URL and tell me if it drops below 250." → `track_add`
- "Check my tracked items." → `track_check`

**Unattended:** in Claude Cowork, `/schedule` a task — *"Every morning at 8, call Hands `track_check`
and tell me anything at/under target or that dropped."* Cowork tasks run in Anthropic's cloud; your Fly
machine just needs to be up (it is — `min_machines_running = 1`).

## Keep it defensible & healthy
- **Just you.** One user, one agent. Don't share the token.
- **Cloud IPs get blocked more.** Shops distrust data-center ranges, so stay slow — the defaults
  (≥15 s between loads, ≤30/domain/hour) matter more here. Raise the gaps if you see blocks.
- **Blocks are respected.** A challenge/captcha/403/429 → the tool returns `Blocked`, the domain cools
  down 6 h. Hands never solves captchas, never fakes being human, never logs in for you.
- **Restrict scope if you like.** Set `HANDS_ALLOW_DOMAINS` in `fly.toml` to a short list so the backend
  will only ever touch sites you named.
- **robots.txt.** `HANDS_ROBOTS=warn` reports what a path's robots.txt says; `enforce` refuses
  disallowed paths; `off` ignores it.

## Costs & ops
- A `shared-cpu-1x` / 1 GB machine kept always-on is roughly a few dollars a month; the 1 GB volume is
  pennies. Bump memory to 2 GB in `fly.toml` if heavy pages make Chromium OOM.
- Logs: `fly logs`.  Redeploy after edits: `fly deploy`.  Rotate the token: `fly secrets set HANDS_TOKEN=…`
  then update the header in the connector.

## If you'd rather keep it at home
The exact same code runs on a Pi/desktop with a tunnel instead — see `README.md`. That's the strongest
legal posture (your own device); Fly is the convenient middle. Your call.
