# NOTES — real-shop checks (spec §4)

Filled in by hand after running `products([...])` against real product pages with a real
`HANDS_TOKEN`. Budget and gaps apply; re-run no more often than every 10 minutes (the cache
answers in between).

**Status: not yet run.** The development sandbox routes outbound traffic through an egress
proxy that does not reach retail sites, so this pass has to happen on the user's machine or on
the deployed Fly app. Command, once the server is up:

```bash
# from the Claude app: "call Hands products with these urls: …"
# or straight at the endpoint with the MCP client — see tests/test_server.py::call for the shape
```

Record, per url:

| url (domain) | platform | source | price ok? | availability | needs_browser | block? | notes |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

Things worth writing down when they happen:

- A shop whose JSON-LD price disagrees with the visible page (common: variant vs. base price).
- `opengraph`-only shops — note whether the price was current.
- Any `Blocked` and what the page said (title). Do **not** retry inside the cooldown.
- Any `needs_browser: true` — candidates for the v0.4 browser fetcher.
- robots.txt disallowing product pages (`robots_allowed: false` in warn mode).
