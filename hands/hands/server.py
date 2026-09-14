"""
Hands — a small, honest HTTP reader for Claude, on a server you own.

Claude is the head: it searches, compares, ranks. Hands is the hands: it
loads the exact public URLs Claude names, with a plainly labelled HTTP
client, and returns plain data. No browser, no login, no bypassing.

Tools:
  product(url)            one page -> Product + meta
  products(urls)          up to 20 pages, parallel across domains -> the "compare in N shops" tool
  read(url)               readable title/text/links for any page
  extract(url, schema|recipe), save_recipe, list_recipes   CSS-selector records, no code
  watch_add / watch_list / watch_remove / watch_check      price watch on any url
  status()                per-domain budget + cooldown

Run:  HANDS_TOKEN=... python -m hands.server
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import time
from collections import defaultdict

import uvicorn
from bs4 import BeautifulSoup
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from . import __version__, store
from .extract import extract as do_extract
from .extract import readable
from .fetch import Fetched, FetchError, HttpFetcher
from .policy import Blocked, Budget, Hands, NotAllowed, RateLimited, domain_of, split_list
from .parse import parse_price
from .structured import product_from

# --- config -----------------------------------------------------------------
TOKEN = os.environ.get("HANDS_TOKEN", "").strip()
if len(TOKEN) < 16:
    raise SystemExit("Set HANDS_TOKEN to a long random secret (e.g. `openssl rand -hex 32`).")

HOST = os.environ.get("HANDS_HOST", "127.0.0.1")   # Fly needs 0.0.0.0
PORT = int(os.environ.get("HANDS_PORT", "8765"))
RECIPES_DIR = os.environ.get("HANDS_RECIPES_DIR", os.path.join(os.path.dirname(__file__), "recipes"))
DUMP_DIR = os.environ.get("HANDS_DUMP_DIR") or None
MAX_URLS = 20


def _env_float(name: str, default: str) -> float:
    return float(os.environ.get(name, default))


fetcher = HttpFetcher(
    user_agent=os.environ.get("HANDS_USER_AGENT") or None,   # default is the honest one
    locale=os.environ.get("HANDS_LOCALE", "en-US"),
    cache_ttl_s=_env_float("HANDS_CACHE_TTL", "600"),
)

hands = Hands(
    fetcher,
    Budget(
        min_gap_s=_env_float("HANDS_MIN_GAP", "15"),
        per_domain_per_hour=int(os.environ.get("HANDS_PER_DOMAIN_PER_HOUR", "30")),
        global_per_hour=int(os.environ.get("HANDS_GLOBAL_PER_HOUR", "90")),
        cooldown_hours=_env_float("HANDS_COOLDOWN_HOURS", "6"),
    ),
    robots_mode=os.environ.get("HANDS_ROBOTS", "warn"),   # off | warn | enforce
    allow_domains=split_list(os.environ.get("HANDS_ALLOW_DOMAINS")),
    deny_domains=split_list(os.environ.get("HANDS_DENY_DOMAINS")),
    default_locale=os.environ.get("HANDS_LOCALE", "en-US"),
)

INSTRUCTIONS = (
    "Hands works on the user's own server and reads PUBLIC pages with an honest HTTP client (no browser, "
    "no login). You are the brain: find where a product is sold with your own web search, then verify "
    "prices with `products([...urls])` — never fetch shop pages with your own fetch tool, always through "
    "Hands. Check name/vintage/volume/pack size yourself from the returned fields; Hands does not judge. "
    "`source` tells you where data came from (`jsonld` is reliable, `opengraph` less so, `none` means read "
    "the page with `read`). `needs_browser: true` means the page is a JS shell — say so, don't retry. "
    "On `Blocked`/`RateLimited` tell the user plainly and do not loop. Prices exclude shipping unless the "
    "page says otherwise."
)

mcp = MCPServer("Hands", version=__version__, instructions=INSTRUCTIONS)


# --- shared plumbing ----------------------------------------------------------
_ERROR_NAMES = {Blocked: "Blocked", RateLimited: "RateLimited", NotAllowed: "NotAllowed", FetchError: "Fetch"}


def _err(e: Exception, url: str | None = None) -> dict:
    out = {"ok": False, "error": _ERROR_NAMES.get(type(e), "Fetch"), "message": str(e)}
    if url:
        out["url"] = url
    return out


def _bad(message: str) -> dict:
    return {"ok": False, "error": "BadInput", "message": message}


def _dump(f: Fetched) -> None:
    """HANDS_DUMP_DIR: keep the HTML of every page loaded, for selector work."""
    if not DUMP_DIR:
        return
    os.makedirs(DUMP_DIR, exist_ok=True)
    name = f"{int(f.fetched_at)}_{domain_of(f.final_url)}_{hashlib.md5(f.url.encode()).hexdigest()[:8]}.html"
    with open(os.path.join(DUMP_DIR, name), "w", encoding="utf-8") as fh:
        fh.write(f.html)


async def _fetch(url: str, locale: str | None) -> Fetched:
    f = await hands.fetch(url, locale)
    if not f.from_cache:
        _dump(f)
    return f


async def _product(url: str, locale: str | None) -> dict:
    """One url -> Product dict, or an ok:false record. Never raises."""
    try:
        f = await _fetch(url, locale)
    except (Blocked, RateLimited, NotAllowed, FetchError) as e:
        return _err(e, url)
    product, meta = product_from(f)
    if product is None:
        return {"ok": True, "url": f.final_url, "product": None, "meta": meta}
    return {"ok": True, "url": f.final_url, "product": product.to_dict(), "meta": meta}


def _clean_urls(urls: list[str] | None) -> list[str] | dict:
    if not isinstance(urls, list) or not urls:
        return _bad("Pass a non-empty list of urls.")
    cleaned = [u.strip() for u in urls if isinstance(u, str) and u.strip()]
    if not cleaned:
        return _bad("No usable urls in the list.")
    if len(cleaned) > MAX_URLS:
        return _bad(f"At most {MAX_URLS} urls per call; got {len(cleaned)}.")
    return cleaned


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
async def product(url: str, locale: str | None = None) -> dict:
    """Read one product page and return its structured data: name, price {amount, currency},
    availability, rating, reviews, image, plus meta.source (jsonld|microdata|opengraph|none) and
    meta.needs_browser. `product: null` with source `none` means the page publishes nothing — use read()."""
    return await _product(url, locale)


@mcp.tool()
async def products(urls: list[str], locale: str | None = None) -> dict:
    """Read up to 20 product pages at once — the tool for "compare this in N shops". Different
    domains load in parallel; the same domain loads one page at a time with a polite gap. Each
    entry is either {ok:true, product, meta} or {ok:false, error, message}; one blocked shop does
    not stop the others. Check name/size/pack yourself — Hands does not judge matches."""
    cleaned = _clean_urls(urls)
    if isinstance(cleaned, dict):
        return cleaned
    results = await asyncio.gather(*(_product(u, locale) for u in cleaned))
    return {
        "ok": all(r["ok"] for r in results),
        "count": len(results),
        "results": results,
        "status": hands.status(),
    }


@mcp.tool()
async def read(url: str, max_chars: int = 8000, keep_chrome: bool = False, locale: str | None = None) -> dict:
    """Readable {title, description, text, links} of one public page — articles, listings, anything.
    `keep_chrome` keeps nav/footer text. Use this when product() says source `none`."""
    try:
        f = await _fetch(url, locale)
    except (Blocked, RateLimited, NotAllowed, FetchError) as e:
        return _err(e, url)
    r = readable(f.html, f.final_url, max_chars=max_chars, keep_chrome=keep_chrome)
    return {"ok": True, "url": f.final_url, "status": f.status, "robots_allowed": f.robots_allowed,
            "fetched_at": f.fetched_at, "from_cache": f.from_cache, "truncated_body": f.truncated, **r}


@mcp.tool()
async def extract(url: str, schema: dict | None = None, recipe: str | None = None,
                  locale: str | None = None, limit: int = 50) -> dict:
    """Pull records from a page by CSS-selector schema, when it has no structured data.
    schema = {"items": "css for each row (optional)", "fields": {"name":"h2",
      "url":{"css":"a","attr":"href"}, "price":{"css":".price","type":"price"},
      "rating":{"css":".stars","attr":"title","type":"rating"}}}.
    Pass `recipe` to use a saved schema by name. types: price|rating|int|float|bool."""
    sch = schema or (_load_recipe(recipe) if recipe else None)
    if not sch or "fields" not in sch:
        return _bad("Provide a schema with 'fields', or a saved recipe name.")
    try:
        f = await _fetch(url, locale)
    except (Blocked, RateLimited, NotAllowed, FetchError) as e:
        return _err(e, url)
    records = do_extract(f.html, f.final_url, sch, limit=limit)
    return {"ok": True, "url": f.final_url, "fetched_at": f.fetched_at, "from_cache": f.from_cache,
            "count": len(records), "records": records}


@mcp.tool()
async def save_recipe(name: str, schema: dict, note: str | None = None) -> dict:
    """Save a selector schema under a name so extract(recipe=name) can reuse it."""
    if "fields" not in schema:
        return _bad("schema needs a 'fields' object.")
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


# --- price watch (any url) ------------------------------------------------------
async def _read_price(url: str, price_css: str | None) -> tuple[float | None, str | None, str]:
    """Structured data first; the saved CSS selector only when there is none."""
    f = await _fetch(url, None)
    product, _ = product_from(f)
    if product and product.price.amount is not None:
        return product.price.amount, product.price.currency, f.final_url
    if price_css:
        el = BeautifulSoup(f.html, "html.parser").select_one(price_css)
        amount, cur = parse_price(el.get_text(" ", strip=True) if el else None)
        return amount, cur, f.final_url
    return None, None, f.final_url


@mcp.tool()
async def watch_add(url: str, target_price: float | None = None, price_css: str | None = None,
                    title: str | None = None) -> dict:
    """Watch a price on ANY product url. Pages with structured data need nothing else; otherwise
    pass price_css (a CSS selector for the price element). target_price = alert threshold."""
    try:
        hands.check_policy(url)
    except NotAllowed as e:
        return _err(e, url)
    store.track_add(url, domain_of(url), title, target_price, price_css)
    return {"ok": True, "url": url, "domain": domain_of(url), "target_price": target_price, "price_css": price_css}


@mcp.tool()
async def watch_remove(url: str) -> dict:
    """Stop watching a url."""
    return {"ok": True, "removed": store.track_remove(url)}


@mcp.tool()
async def watch_list() -> dict:
    """Watched urls with last recorded price and target."""
    return {"ok": True, "items": store.track_list()}


@mcp.tool()
async def watch_check(only_changes: bool = False) -> dict:
    """Re-check every watched url and report price vs. target and vs. last time. Domains run in
    parallel; inside a domain, one page at a time. A Blocked or RateLimited domain stops there —
    `stopped` says which and why; the others finish."""
    by_domain: dict[str, list[dict]] = defaultdict(list)
    for it in store.track_list():
        by_domain[it["domain"]].append(it)

    async def one_domain(items: list[dict]) -> tuple[list[dict], str | None]:
        report: list[dict] = []
        for it in items:
            try:
                price, cur, _ = await _read_price(it["url"], it["price_css"])
            except (Blocked, RateLimited) as e:
                return report, f"{type(e).__name__}: {e}"
            except (NotAllowed, FetchError) as e:
                report.append({"url": it["url"], "title": it["title"], **_err(e)})
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
        return report, None

    outcomes = await asyncio.gather(*(one_domain(items) for items in by_domain.values()))
    items: list[dict] = []
    stopped: dict[str, str] = {}
    for domain, (report, why) in zip(by_domain.keys(), outcomes):
        items.extend(report)
        if why:
            stopped[domain] = why
    return {"ok": not stopped, "items": items, "stopped": stopped or None, "status": hands.status()}


@mcp.tool()
async def status() -> dict:
    """Per-domain budget and cooldown state of the box."""
    return {"ok": True, "version": __version__, "user_agent": fetcher.user_agent, **hands.status()}


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
    return JSONResponse({"ok": True, "version": __version__, **hands.status()})


app = mcp.streamable_http_app(
    stateless_http=True,
    json_response=True,
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    host=HOST,
)
app.add_middleware(BearerAuth)


def main():
    print(f"Hands {__version__} listening on http://{HOST}:{PORT}/mcp  (health: /health)")
    print(f"User-Agent: {fetcher.user_agent}")
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()
