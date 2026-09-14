"""
Turning HTML into plain data:

  readable(html)            -> title, text (markdown-ish), links   — for any page (the `read` tool)
  extract(html, schema)     -> records by CSS selectors            — for any page, no code
  jsonld_products(html)     -> v0.2's flat Product list. Superseded by structured.extract_product,
                               which also reads microdata and OpenGraph and normalises the fields;
                               kept so existing callers and tests keep working.
"""

from __future__ import annotations

import json
import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from .parse import parse_price, parse_rating, parse_int, text_of

_NOISE = ("script", "style", "noscript", "svg", "iframe", "template", "canvas")
_CHROME = ("nav", "footer", "header", "aside", "form")   # dropped in readable() unless keep_chrome


def readable(html: str, base_url: str, max_chars: int = 8000, max_links: int = 40, keep_chrome: bool = False) -> dict:
    soup = BeautifulSoup(html or "", "html.parser")
    title = text_of(soup.title) if soup.title else ""
    meta_desc = ""
    md = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", attrs={"property": "og:description"})
    if md and md.get("content"):
        meta_desc = md["content"].strip()
    for t in soup(_NOISE):
        t.decompose()
    if not keep_chrome:
        for t in soup(_CHROME):
            t.decompose()
    root = soup.find("main") or soup.find("article") or soup.body or soup
    lines: list[str] = []
    for el in root.descendants:
        if not isinstance(el, Tag):
            continue
        name = el.name
        if name in ("h1", "h2", "h3", "h4"):
            txt = text_of(el)
            if txt:
                lines.append(f"{'#' * int(name[1])} {txt}")
        elif name in ("p", "li", "td", "th", "dt", "dd", "blockquote", "pre", "figcaption"):
            txt = text_of(el)
            if txt and (name != "li" or not el.find(["p", "li"])):
                lines.append(("- " if name == "li" else "") + txt)
    # de-duplicate consecutive repeats, cap size
    text_lines: list[str] = []
    for ln in lines:
        if not text_lines or text_lines[-1] != ln:
            text_lines.append(ln)
    text = "\n".join(text_lines)
    truncated = len(text) > max_chars
    text = text[:max_chars]
    links = []
    seen = set()
    for a in root.find_all("a", href=True):
        href = urljoin(base_url, a["href"].strip())
        if not href.startswith("http") or href in seen:
            continue
        seen.add(href)
        label = text_of(a)[:120]
        if label:
            links.append({"text": label, "url": href})
        if len(links) >= max_links:
            break
    return {"title": title, "description": meta_desc, "text": text, "truncated": truncated, "links": links}


# ---------------------------------------------------------------------------
# extract(): declarative selector schema
#
#   {"items": "div.product",                      # optional repeating container
#    "fields": {"name": "h2",                     # css -> text
#               "url":  {"css": "a", "attr": "href"},
#               "price": {"css": ".price", "type": "price"},
#               "rating": {"css": ".stars", "attr": "title", "type": "rating"},
#               "sku": {"css": ".sku", "regex": "SKU:\\s*(\\w+)"},
#               "in_stock": {"css": ".availability", "type": "int"}}}
# ---------------------------------------------------------------------------
def _field(scope: Tag, spec, base_url: str):
    if isinstance(spec, str):
        spec = {"css": spec}
    css = spec.get("css")
    el = scope.select_one(css) if css else scope
    if el is None:
        return None
    attr = spec.get("attr")
    if attr == "text" or not attr:
        raw = text_of(el)
    elif attr == "html":
        raw = str(el)
    else:
        raw = el.get(attr)
        if isinstance(raw, list):
            raw = " ".join(raw)
        raw = (raw or "").strip()
    if attr in ("href", "src") and raw:
        raw = urljoin(base_url, raw)
    if "regex" in spec and raw:
        m = re.search(spec["regex"], raw)
        raw = m.group(1) if (m and m.groups()) else (m.group(0) if m else None)
    t = spec.get("type")
    if t == "price":
        amount, cur = parse_price(raw)
        return {"amount": amount, "currency": cur, "raw": raw}
    if t == "rating":
        return parse_rating(raw)
    if t == "int":
        return parse_int(raw)
    if t == "float":
        try:
            return float(str(raw).replace(",", "."))
        except (TypeError, ValueError):
            return None
    if t == "bool":
        return raw not in (None, "", False)
    return raw


def extract(html: str, base_url: str, schema: dict, limit: int = 50) -> list[dict]:
    soup = BeautifulSoup(html or "", "html.parser")
    fields = schema.get("fields") or {}
    items_css = schema.get("items")
    scopes = soup.select(items_css)[:limit] if items_css else [soup]
    out = []
    for sc in scopes:
        rec = {k: _field(sc, spec, base_url) for k, spec in fields.items()}
        if any(v not in (None, "", []) for v in rec.values()):
            out.append(rec)
    return out


# ---------------------------------------------------------------------------
# schema.org JSON-LD — many shops, marketplaces, listings publish this
# ---------------------------------------------------------------------------
def _walk(node, kind: str, found: list):
    if isinstance(node, dict):
        t = node.get("@type")
        types = t if isinstance(t, list) else [t]
        if kind in types:
            found.append(node)
        for v in node.values():
            _walk(v, kind, found)
    elif isinstance(node, list):
        for v in node:
            _walk(v, kind, found)


def jsonld_products(html: str) -> list[dict]:
    soup = BeautifulSoup(html or "", "html.parser")
    products: list[dict] = []
    for s in soup.find_all("script", attrs={"type": re.compile(r"ld\+json", re.I)}):
        try:
            data = json.loads(s.string or s.get_text() or "")
        except (json.JSONDecodeError, TypeError):
            continue
        _walk(data, "Product", products)
    out = []
    for p in products:
        offers = p.get("offers") or {}
        if isinstance(offers, list):
            offers = offers[0] if offers else {}
        if isinstance(offers, dict) and "@type" in offers and offers.get("@type") == "AggregateOffer":
            price = offers.get("lowPrice") or offers.get("price")
        else:
            price = offers.get("price") if isinstance(offers, dict) else None
        rating = p.get("aggregateRating") or {}
        brand = p.get("brand")
        if isinstance(brand, dict):
            brand = brand.get("name")
        out.append({
            "name": p.get("name"),
            "brand": brand,
            "sku": p.get("sku"),
            "price": float(price) if price not in (None, "") and str(price).replace(".", "", 1).isdigit() else price,
            "currency": offers.get("priceCurrency") if isinstance(offers, dict) else None,
            "availability": (offers.get("availability") or "").split("/")[-1] if isinstance(offers, dict) else None,
            "rating": rating.get("ratingValue") if isinstance(rating, dict) else None,
            "reviews": rating.get("reviewCount") or rating.get("ratingCount") if isinstance(rating, dict) else None,
            "url": p.get("url") or (offers.get("url") if isinstance(offers, dict) else None),
        })
    return out
