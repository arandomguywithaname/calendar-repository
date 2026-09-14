"""
Hands — a universal, local-first (or your-own-cloud) browser connector for Claude.

Claude decides WHAT to look at; this server, running on a box you own, does the
looking with a real Chromium and returns plain data. Works on any site, not just
one shop. Blocks are respected, never bypassed.

Generic tools:
  fetch_page(url)              -> readable title/text/links for any page
  extract(url, schema|recipe)  -> records by CSS-selector schema (no code)
  products(url)                -> schema.org Product/Offer data (most shops publish this)
  save_recipe / list_recipes   -> store a schema for a site so you can reuse it by name
  track_add / track_list / track_remove / track_check  -> watch a price on ANY url
  status()                     -> per-domain budget + cooldown

Run:  HANDS_TOKEN=... python -m hands.server
"""

from __future__ import annotations

import hmac
import json
import os
import time

import uvicorn
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from . import store
from .browser import Blocked, Budget, Hands, NotAllowed, RateLimited, domain_of
from .extract import extract as do_extract
from .extract import jsonld_products, readable
from .parse import parse_price

# --- config -----------------------------------------------------------------
TOKEN = os.environ.get("HANDS_TOKEN", "").strip()
if len(TOKEN) < 16:
    raise SystemExit("Set HANDS_TOKEN to a long random secret (e.g. `openssl rand -hex 32`).")

HOST = os.environ.get("HANDS_HOST", "127.0.0.1")   # Fly needs 0.0.0.0
PORT = int(os.environ.get("HANDS_PORT", "8765"))
RECIPES_DIR = os.environ.get("HANDS_RECIPES_DIR", os.path.join(os.path.dirname(__file__), "recipes"))


def _split(v: str | None) -> list[str]:
    return [x.strip() for x in (v or "").replace(",", " ").split() if x.strip()]


hands = Hands(
    budget=Budget(
        min_gap_s=float(os.environ.get("HANDS_MIN_GAP", "15")),
        per_domain_per_hour=int(os.environ.get("HANDS_PER_DOMAIN_PER_HOUR", "30")),
        global_per_hour=int(os.environ.get("HANDS_GLOBAL_PER_HOUR", "90")),
        cooldown_hours=float(os.environ.get("HANDS_COOLDOWN_HOURS", "6")),
    ),
    headless=os.environ.get("HANDS_HEADLESS", "1") != "0",
    channel=os.environ.get("HANDS_BROWSER_CHANNEL") or None,
    dump_dir=os.environ.get("HANDS_DUMP_DIR") or None,
    robots_mode=os.environ.get("HANDS_ROBOTS", "warn"),   # off | warn | enforce
    allow_domains=_split(os.environ.get("HANDS_ALLOW_DOMAINS")),
    deny_domains=_split(os.environ.get("HANDS_DENY_DOMAINS")),
    default_locale=os.environ.get("HANDS_LOCALE", "en-US"),
)

mcp = MCPServer(
    "Hands",
    instructions=(
        "Hands runs on the user's own machine and reads PUBLIC web pages with a real browser, then "
        "returns plain data — you do the reading, comparing and ranking. Works on ANY site.\n"
        "- fetch_page(url): get readable text + links from one page.\n"
        "- products(url): try schema.org Product data first for shop/listing pages — it's the most "
        "robust way to get price/rating/availability.\n"
        "- extract(url, schema=...) or extract(url, recipe='name'): pull structured records by CSS "
        "selectors when a page has no schema.org data; save good schemas with save_recipe for reuse.\n"
        "- track_* : watch a price on any product URL.\n"
        "If a tool returns ok=false with error 'Blocked' or 'RateLimited', tell the user plainly and do "
        "NOT retry in a loop — the box cools down on its own. Never ask Hands to bypass a block, log in, "
        "solve a captcha, or hide that it's automated; it won't. Prices/text are what the public page "
        "showed at fetch time."
    ),
)


def _err(e: Exception) -> dict:
    return {"ok": False, "error": type(e).__name__, "message": str(e), "status": hands.status()}


# --- recipes (saved selector schemas, no code) ------------------------------
def _recipe_path(name: str) -> str:
    safe = "".join(c for c in name if c.isalnum() or c in "-_").lower()
    return os.path.join(RECIPES_DIR, f"{safe}.json")


def _load_recipe(name: str) -> dict | None:
    try:
        with open(_recipe_path(name), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


# --- tools ------------------------------------------------------------------
@mcp.tool()
async def fetch_page(url: str, locale: str | None = None, max_chars: int = 8000, keep_chrome: bool = False) -> dict:
    """Load one public page in the box's browser and return readable {title, description, text, links}.
    Use for articles, listings, or any page you just want to read. `keep_chrome` keeps nav/footer text."""
    try:
        f = await hands.fetch(url, locale)
    except (Blocked, RateLimited, NotAllowed) as e:
        return _err(e)
    r = readable(f.html, f.final_url, max_chars=max_chars, keep_chrome=keep_chrome)
    return {"ok": True, "url": f.final_url, "status": f.status, "robots_allowed": f.robots_allowed,
            "fetched_at": f.fetched_at, **r}


@mcp.tool()
async def products(url: str, locale: str | None = None) -> dict:
    """Fetch a page and return schema.org Product data (name, price, currency, availability, rating,
    reviews). The most robust way to read shop/marketplace/product pages. Empty list => none published;
    fall back to extract()."""
    try:
        f = await hands.fetch(url, locale)
    except (Blocked, RateLimited, NotAllowed) as e:
        return _err(e)
    items = jsonld_products(f.html)
    return {"ok": True, "url": f.final_url, "status": f.status, "fetched_at": f.fetched_at,
            "count": len(items), "products": items}


@mcp.tool()
async def extract(url: str, schema: dict | None = None, recipe: str | None = None,
                  locale: str | None = None, limit: int = 50) -> dict:
    """Fetch a page and pull structured records using a CSS-selector schema.
    schema = {"items": "css for each row (optional)", "fields": {"name":"h2",
      "url":{"css":"a","attr":"href"}, "price":{"css":".price","type":"price"},
      "rating":{"css":".stars","attr":"title","type":"rating"}}}.
    Pass `recipe` instead to use a saved schema by name. types: price|rating|int|float|bool."""
    sch = schema or (_load_recipe(recipe) if recipe else None)
    if not sch or "fields" not in sch:
        return {"ok": False, "error": "BadInput",
                "message": "Provide a schema with 'fields', or a saved recipe name."}
    try:
        f = await hands.fetch(url, locale)
    except (Blocked, RateLimited, NotAllowed) as e:
        return _err(e)
    records = do_extract(f.html, f.final_url, sch, limit=limit)
    return {"ok": True, "url": f.final_url, "fetched_at": f.fetched_at, "count": len(records), "records": records}


@mcp.tool()
async def save_recipe(name: str, schema: dict, note: str | None = None) -> dict:
    """Save a selector schema under a name so you can reuse it with extract(recipe=name)."""
    if "fields" not in schema:
        return {"ok": False, "error": "BadInput", "message": "schema needs a 'fields' object."}
    os.makedirs(RECIPES_DIR, exist_ok=True)
    payload = {"name": name, "note": note, "saved_at": time.time(), **schema}
    with open(_recipe_path(name), "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)
    return {"ok": True, "name": name, "path": _recipe_path(name)}


@mcp.tool()
async def list_recipes() -> dict:
    """List saved recipes (selector schemas)."""
    out = []
    if os.path.isdir(RECIPES_DIR):
        for fn in sorted(os.listdir(RECIPES_DIR)):
            if fn.endswith(".json"):
                try:
                    with open(os.path.join(RECIPES_DIR, fn), encoding="utf-8") as fh:
                        d = json.load(fh)
                    out.append({"name": d.get("name", fn[:-5]), "note": d.get("note"),
                                "fields": list((d.get("fields") or {}).keys())})
                except (OSError, json.JSONDecodeError):
                    pass
    return {"ok": True, "recipes": out}


# --- generic price tracking (any url) ---------------------------------------
async def _read_price(url: str, price_css: str | None, locale: str | None) -> tuple[float | None, str | None, str]:
    f = await hands.fetch(url, locale)
    if price_css:
        from bs4 import BeautifulSoup
        el = BeautifulSoup(f.html, "html.parser").select_one(price_css)
        amount, cur = parse_price(el.get_text(" ", strip=True) if el else None)
        return amount, cur, f.final_url
    prods = jsonld_products(f.html)
    for p in prods:
        if p.get("price") not in (None, ""):
            try:
                return float(p["price"]), p.get("currency"), f.final_url
            except (TypeError, ValueError):
                pass
    return None, None, f.final_url


@mcp.tool()
async def track_add(url: str, target_price: float | None = None, price_css: str | None = None,
                    title: str | None = None) -> dict:
    """Watch a price on ANY product URL. If the page publishes schema.org data, no selector is needed;
    otherwise pass price_css (a CSS selector for the price element). target_price = alert threshold."""
    try:
        hands.check_policy(url)
    except NotAllowed as e:
        return _err(e)
    store.track_add(url, domain_of(url), title, target_price, price_css)
    return {"ok": True, "url": url, "domain": domain_of(url), "target_price": target_price, "price_css": price_css}


@mcp.tool()
async def track_remove(url: str) -> dict:
    """Stop watching a URL."""
    return {"ok": True, "removed": store.track_remove(url)}


@mcp.tool()
async def track_list() -> dict:
    """List watched URLs with last recorded price and target."""
    return {"ok": True, "items": store.track_list()}


@mcp.tool()
async def track_check(only_changes: bool = False) -> dict:
    """Re-check every watched URL (one page load each, politely spaced) and report price vs. target and
    vs. last time. Stops early on a block or when the budget runs out; the report says how far it got."""
    report, stopped = [], None
    for it in store.track_list():
        try:
            price, cur, final = await _read_price(it["url"], it["price_css"], None)
        except (Blocked, RateLimited) as e:
            stopped = f"{type(e).__name__}: {e}"
            break
        except NotAllowed:
            continue
        store.record_price(it["url"], price, cur)
        prev = store.previous_price(it["url"])
        entry = {
            "url": it["url"], "title": it["title"], "price": price, "currency": cur,
            "previous_price": prev,
            "change": round(price - prev, 2) if price is not None and prev is not None else None,
            "target_price": it["target_price"],
            "at_or_below_target": price is not None and it["target_price"] is not None and price <= it["target_price"],
        }
        if not only_changes or entry["change"] or entry["at_or_below_target"]:
            report.append(entry)
    return {"ok": stopped is None, "items": report, "stopped_early": stopped, "status": hands.status()}


@mcp.tool()
async def status() -> dict:
    """Per-domain budget and cooldown state of the box."""
    return {"ok": True, **hands.status()}


# --- auth + app -------------------------------------------------------------
class BearerAuth(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/health":
            return await call_next(request)
        if not hmac.compare_digest(request.headers.get("authorization", ""), f"Bearer {TOKEN}"):
            return JSONResponse({"error": "unauthorized"}, status_code=401)
        return await call_next(request)


@mcp.custom_route("/health", methods=["GET"])
async def health(_: Request):
    return JSONResponse({"ok": True, **hands.status()})


app = mcp.streamable_http_app(
    stateless_http=True,
    json_response=True,
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    host=HOST,
)
app.add_middleware(BearerAuth)


def main():
    print(f"Hands listening on http://{HOST}:{PORT}/mcp  (health: /health)")
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()
