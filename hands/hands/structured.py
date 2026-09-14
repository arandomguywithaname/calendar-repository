"""
Reading a product off a page the way search engines do: from the structured
data the shop itself publishes. In order, stopping at the first that works:

  1. jsonld     <script type="application/ld+json">  — Product, ProductGroup,
                Offer / AggregateOffer, ItemList (urls only)
  2. microdata  itemtype="…schema.org/Product" + itemprop attributes
  3. opengraph  og:title + og:price:amount / product:price:amount
  4. none

No per-shop code. A site that publishes nothing gets `source: "none"` and
Claude is told to read the page instead; a page that is only a JS shell is
flagged `needs_browser` so Claude can say so rather than retry.

`readable()` stays in extract.py, where `read` finds it.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from typing import Any
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .fetch import Fetched
from .parse import parse_price
from .policy import domain_of

AVAILABILITY = ("InStock", "OutOfStock", "PreOrder", "BackOrder", "Unknown")

_AVAIL_MAP = {
    "instock": "InStock", "instoreonly": "InStock", "onlineonly": "InStock",
    "limitedavailability": "InStock", "in stock": "InStock", "available": "InStock",
    "outofstock": "OutOfStock", "soldout": "OutOfStock", "discontinued": "OutOfStock",
    "out of stock": "OutOfStock", "unavailable": "OutOfStock",
    "preorder": "PreOrder", "presale": "PreOrder", "pre-order": "PreOrder",
    "backorder": "BackOrder", "back-order": "BackOrder",
}

_LIST_PRICE_TYPES = ("listprice", "strikethroughprice", "msrp", "rrp")

DESCRIPTION_MAX = 300


@dataclass
class Money:
    amount: float | None = None
    currency: str | None = None


@dataclass
class Product:
    url: str
    site: str
    platform: str = "other"
    name: str | None = None
    brand: str | None = None
    sku: str | None = None
    price: Money = field(default_factory=Money)
    list_price: Money | None = None
    availability: str = "Unknown"
    rating: float | None = None
    reviews: int | None = None
    image: str | None = None
    description: str | None = None
    source: str = "none"
    needs_browser: bool = False
    robots_allowed: bool | None = None
    fetched_at: float | None = None
    from_cache: bool = False

    def to_dict(self) -> dict:
        return asdict(self)


# --- small normalisers --------------------------------------------------------
def _s(v: Any) -> str | None:
    """A trimmed string out of whatever JSON-LD put there, or None."""
    if v is None:
        return None
    if isinstance(v, (str, int, float)):
        t = re.sub(r"\s+", " ", str(v)).strip()
        return t or None
    if isinstance(v, list):
        return _s(v[0]) if v else None
    if isinstance(v, dict):
        return _s(v.get("name") or v.get("url") or v.get("@id") or v.get("value"))
    return None


def _num(v: Any) -> float | None:
    """A float out of 29.99, "29.99", "38,90" or "1.299,99"."""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        amount, _ = parse_price(v)
        return amount
    return None


def _int(v: Any) -> int | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return int(v)
    if isinstance(v, str) and re.search(r"\d", v):
        return int(re.sub(r"[^\d]", "", v))
    return None


def normalize_availability(v: Any) -> str:
    """'https://schema.org/InStock' | 'InStock' | 'in stock' -> 'InStock'."""
    s = _s(v)
    if not s:
        return "Unknown"
    key = s.rsplit("/", 1)[-1].strip().lower()
    return _AVAIL_MAP.get(key) or _AVAIL_MAP.get(s.lower()) or "Unknown"


def _description(v: Any) -> str | None:
    s = _s(v)
    if not s:
        return None
    s = BeautifulSoup(s, "html.parser").get_text(" ", strip=True)
    return (s[: DESCRIPTION_MAX - 1] + "…") if len(s) > DESCRIPTION_MAX else s


def _image(v: Any) -> str | None:
    if isinstance(v, dict):
        return _s(v.get("url") or v.get("contentUrl"))
    return _s(v)


# --- JSON-LD ------------------------------------------------------------------
def _types(node: dict) -> list[str]:
    t = node.get("@type")
    if isinstance(t, list):
        return [str(x).rsplit("/", 1)[-1] for x in t]
    return [str(t).rsplit("/", 1)[-1]] if t else []


def _jsonld_blocks(soup: BeautifulSoup) -> list[Any]:
    out = []
    for s in soup.find_all("script", attrs={"type": re.compile(r"ld\+json", re.I)}):
        raw = s.string or s.get_text() or ""
        try:
            out.append(json.loads(raw))
        except (json.JSONDecodeError, TypeError):
            # Some shops embed several objects or trailing junk; try the
            # first JSON value in the block before giving up on it.
            m = re.search(r"\{.*\}", raw, re.S)
            if m:
                try:
                    out.append(json.loads(m.group(0)))
                except json.JSONDecodeError:
                    pass
    return out


def _walk(node: Any, products: list[dict], groups: list[dict], item_urls: list[str], depth: int = 0) -> None:
    if depth > 12:
        return
    if isinstance(node, list):
        for v in node:
            _walk(v, products, groups, item_urls, depth + 1)
        return
    if not isinstance(node, dict):
        return
    types = _types(node)
    if "ItemList" in types:
        # A listing: only the urls, per spec. Its items are not page products.
        for it in node.get("itemListElement") or []:
            if isinstance(it, dict):
                target = it.get("item") if isinstance(it.get("item"), dict) else it
                u = _s(target.get("url") or target.get("@id") or it.get("url"))
                if u:
                    item_urls.append(u)
        return
    if "ProductGroup" in types:
        groups.append(node)
        return   # variants are read from the group, not as loose products
    if "Product" in types:
        products.append(node)
    for k, v in node.items():
        if k in ("@context",):
            continue
        if isinstance(v, (dict, list)):
            _walk(v, products, groups, item_urls, depth + 1)


def _first_offer(offers: Any) -> dict | None:
    if isinstance(offers, list):
        for o in offers:
            if isinstance(o, dict):
                return o
        return None
    return offers if isinstance(offers, dict) else None


def _price_from_offer(offer: dict | None) -> tuple[Money, Money | None, dict]:
    """(price, list_price, offer_meta) from an Offer or AggregateOffer."""
    price, list_price, meta = Money(), None, {}
    if not offer:
        return price, list_price, meta
    kinds = _types(offer)
    currency = _s(offer.get("priceCurrency"))
    if "AggregateOffer" in kinds:
        low, high = _num(offer.get("lowPrice")), _num(offer.get("highPrice"))
        price = Money(low if low is not None else _num(offer.get("price")), currency)
        meta = {"type": "AggregateOffer", "low": low, "high": high, "count": _int(offer.get("offerCount"))}
    else:
        price = Money(_num(offer.get("price")), currency)
    specs = offer.get("priceSpecification")
    specs = specs if isinstance(specs, list) else ([specs] if isinstance(specs, dict) else [])
    for sp in specs:
        if not isinstance(sp, dict):
            continue
        amt = _num(sp.get("price"))
        cur = _s(sp.get("priceCurrency")) or currency
        ptype = (_s(sp.get("priceType")) or "").rsplit("/", 1)[-1].lower()
        if ptype in _LIST_PRICE_TYPES and amt is not None:
            list_price = Money(amt, cur)
        elif price.amount is None and amt is not None:
            price = Money(amt, cur)
        if price.currency is None and cur:
            price.currency = cur
    return price, list_price, meta


def _fill_from_node(p: Product, node: dict, base_url: str) -> dict:
    p.name = _s(node.get("name")) or p.name
    p.brand = _s(node.get("brand")) or p.brand
    p.sku = _s(node.get("sku") or node.get("mpn") or node.get("gtin13") or node.get("gtin")) or p.sku
    p.image = _image(node.get("image")) or p.image
    p.description = _description(node.get("description")) or p.description
    u = _s(node.get("url") or node.get("@id"))
    if u and u.startswith(("http", "/")):
        p.url = urljoin(base_url, u)
    offer = _first_offer(node.get("offers"))
    price, list_price, offer_meta = _price_from_offer(offer)
    if price.amount is not None or p.price.amount is None:
        p.price = price
    p.list_price = list_price or p.list_price
    if offer:
        av = normalize_availability(offer.get("availability"))
        if av != "Unknown" or p.availability == "Unknown":
            p.availability = av
        if not offer.get("url") is None and p.url == base_url:
            ou = _s(offer.get("url"))
            if ou:
                p.url = urljoin(base_url, ou)
    rating = node.get("aggregateRating")
    if isinstance(rating, dict):
        rv = rating.get("ratingValue")
        p.rating = float(str(rv).replace(",", ".")) if rv not in (None, "") and re.match(r"^\s*\d+([.,]\d+)?\s*$", str(rv)) else p.rating
        p.reviews = _int(rating.get("reviewCount") or rating.get("ratingCount")) or p.reviews
    return offer_meta


def _pick_main(products: list[dict], base_url: str) -> dict:
    """Several Product nodes on one page: prefer the one whose url is this
    page, then the first with an offer, then the first."""
    for node in products:
        u = _s(node.get("url"))
        if u and urljoin(base_url, u).split("#")[0].rstrip("/") == base_url.split("#")[0].rstrip("/"):
            return node
    for node in products:
        if node.get("offers"):
            return node
    return products[0]


def _from_jsonld(soup: BeautifulSoup, base_url: str, meta: dict) -> Product | None:
    products: list[dict] = []
    groups: list[dict] = []
    item_urls: list[str] = []
    for block in _jsonld_blocks(soup):
        _walk(block, products, groups, item_urls)
    if item_urls:
        seen, uniq = set(), []
        for u in item_urls:
            full = urljoin(base_url, u)
            if full not in seen:
                seen.add(full)
                uniq.append(full)
        meta["item_urls"] = uniq
    meta["candidates"] = len(products) + len(groups)

    p = Product(url=base_url, site=domain_of(base_url))
    if groups:
        g = groups[0]
        variants = [v for v in (g.get("hasVariant") or []) if isinstance(v, dict)]
        meta["variants"] = len(variants)
        offer_meta = _fill_from_node(p, g, base_url)
        if p.price.amount is None:
            for v in variants:
                if v.get("offers"):
                    name = p.name
                    offer_meta = _fill_from_node(p, v, base_url)
                    p.name = name or p.name
                    break
        if offer_meta:
            meta["offer"] = offer_meta
        p.source = "jsonld"
        return p
    if products:
        offer_meta = _fill_from_node(p, _pick_main(products, base_url), base_url)
        if offer_meta:
            meta["offer"] = offer_meta
        p.source = "jsonld"
        return p
    return None


# --- microdata ----------------------------------------------------------------
def _prop(scope, name: str, base_url: str) -> str | None:
    el = scope.select_one(f'[itemprop="{name}"]')
    if el is None:
        return None
    for attr in ("content", "href", "src", "datetime"):
        v = el.get(attr)
        if v:
            v = " ".join(v) if isinstance(v, list) else v
            if attr in ("href", "src"):
                v = urljoin(base_url, v)
            return re.sub(r"\s+", " ", v).strip() or None
    if el.name == "meta":
        return None
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip() or None


def _from_microdata(soup: BeautifulSoup, base_url: str, meta: dict) -> Product | None:
    scope = soup.select_one('[itemtype*="schema.org/Product"]')
    if scope is None:
        return None
    name = _prop(scope, "name", base_url)
    if not name:
        return None
    p = Product(url=base_url, site=domain_of(base_url), name=name, source="microdata")
    p.brand = _prop(scope, "brand", base_url)
    p.sku = _prop(scope, "sku", base_url)
    p.image = _prop(scope, "image", base_url)
    p.description = _description(_prop(scope, "description", base_url))
    p.url = _prop(scope, "url", base_url) or base_url
    amt = _num(_prop(scope, "price", base_url))
    cur = _prop(scope, "priceCurrency", base_url)
    if amt is None and (raw := _prop(scope, "price", base_url)):
        amt, sym = parse_price(raw)
        cur = cur or sym
    p.price = Money(amt, cur)
    p.availability = normalize_availability(_prop(scope, "availability", base_url))
    rv = _prop(scope, "ratingValue", base_url)
    if rv and re.match(r"^\d+([.,]\d+)?$", rv):
        p.rating = float(rv.replace(",", "."))
    p.reviews = _int(_prop(scope, "reviewCount", base_url) or _prop(scope, "ratingCount", base_url))
    return p


# --- OpenGraph ----------------------------------------------------------------
def _meta(soup: BeautifulSoup, *names: str) -> str | None:
    for n in names:
        el = soup.find("meta", attrs={"property": n}) or soup.find("meta", attrs={"name": n})
        if el and el.get("content"):
            return el["content"].strip() or None
    return None


def _from_opengraph(soup: BeautifulSoup, base_url: str, meta: dict) -> Product | None:
    """og:title alone is every article on the web; a product needs a price."""
    name = _meta(soup, "og:title")
    amount = _meta(soup, "product:price:amount", "og:price:amount")
    if not name or amount is None:
        return None
    p = Product(url=_meta(soup, "og:url") or base_url, site=domain_of(base_url), name=name, source="opengraph")
    amt, sym = parse_price(amount)
    p.price = Money(amt, _meta(soup, "product:price:currency", "og:price:currency") or sym)
    p.availability = normalize_availability(_meta(soup, "product:availability", "og:availability"))
    p.image = _meta(soup, "og:image")
    p.description = _description(_meta(soup, "og:description", "description"))
    p.brand = _meta(soup, "product:brand")
    return p


# --- page character -----------------------------------------------------------
def platform_of(html: str, headers: dict[str, str] | None = None) -> str:
    h = (html or "")[:200_000]
    hl = h.lower()
    hdr = {k.lower(): v for k, v in (headers or {}).items()}
    if "x-shopid" in hdr or "cdn.shopify.com" in hl or "shopify.theme" in hl:
        return "shopify"
    if "wp-content/plugins/woocommerce" in hl or re.search(r'<body[^>]+class="[^"]*\bwoocommerce\b', h, re.I):
        return "woocommerce"
    if "var prestashop" in hl or re.search(r'<meta[^>]+name="generator"[^>]+content="[^"]*prestashop', h, re.I):
        return "prestashop"
    if "magento_" in hl or "/mage/" in hl or "static/version" in hl and "magento" in hl:
        return "magento"
    return "other"


def visible_text(soup: BeautifulSoup) -> str:
    body = BeautifulSoup(str(soup), "html.parser")
    for t in body(("script", "style", "noscript", "template", "svg")):
        t.decompose()
    return re.sub(r"\s+", " ", body.get_text(" ", strip=True))


def looks_like_spa_shell(soup: BeautifulSoup, has_structured: bool) -> bool:
    """No data, almost no text, and scripts: the page is a JS shell."""
    if has_structured:
        return False
    if not soup.find("script", src=True):
        return False
    return len(visible_text(soup)) < 500


# --- entry points -------------------------------------------------------------
def extract_product(html: str, base_url: str, headers: dict[str, str] | None = None) -> tuple[Product | None, dict]:
    """The cascade. Returns (Product | None, meta); meta.source names what
    worked: jsonld | microdata | opengraph | none."""
    soup = BeautifulSoup(html or "", "html.parser")
    meta: dict[str, Any] = {"source": "none", "platform": platform_of(html, headers), "needs_browser": False}
    product = _from_jsonld(soup, base_url, meta) or _from_microdata(soup, base_url, meta) or _from_opengraph(soup, base_url, meta)
    if product:
        product.platform = meta["platform"]
        meta["source"] = product.source
    else:
        meta["needs_browser"] = looks_like_spa_shell(soup, has_structured=False)
    return product, meta


def product_from(fetched: Fetched) -> tuple[Product | None, dict]:
    """extract_product over a Fetched, with the transport fields filled in."""
    product, meta = extract_product(fetched.html, fetched.final_url, fetched.headers)
    meta.update(
        url=fetched.final_url,
        status=fetched.status,
        title=fetched.title,
        truncated=fetched.truncated,
        robots_allowed=fetched.robots_allowed,
        fetched_at=fetched.fetched_at,
        from_cache=fetched.from_cache,
    )
    if product:
        product.robots_allowed = fetched.robots_allowed
        product.fetched_at = fetched.fetched_at
        product.from_cache = fetched.from_cache
        product.needs_browser = False
    return product, meta
