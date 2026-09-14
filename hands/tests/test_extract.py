"""Offline tests (no network, no browser). Run: python -m pytest -q  OR  python tests/test_extract.py"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from hands.browser import detect_block  # noqa: E402
from hands.extract import extract, jsonld_products, readable  # noqa: E402
from hands.parse import parse_price  # noqa: E402

SHOP_HTML = """
<html><head><title>Widget Store — Blue Widget</title>
<meta name="description" content="A very blue widget.">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Blue Widget","brand":{"@type":"Brand","name":"Acme"},
 "sku":"BW-42","aggregateRating":{"@type":"AggregateRating","ratingValue":"4.7","reviewCount":"318"},
 "offers":{"@type":"Offer","price":"29.99","priceCurrency":"USD","availability":"https://schema.org/InStock"}}
</script></head>
<body><nav>home shop cart</nav>
<main><h1>Blue Widget</h1><p>The bluest widget available.</p>
<ul><li>Ships in 24h</li><li>2-year warranty</li></ul></main>
<footer>copyright</footer></body></html>
"""

LIST_HTML = """
<html><body>
<div class="card"><a class="title" href="/p/1">First</a><span class="price">£12.50</span><span class="stars" title="4.2 of 5"></span></div>
<div class="card"><a class="title" href="/p/2">Second</a><span class="price">£8.00</span><span class="stars" title="3.9 of 5"></span></div>
</body></html>
"""


def test_jsonld():
    ps = jsonld_products(SHOP_HTML)
    assert len(ps) == 1
    p = ps[0]
    assert p["name"] == "Blue Widget" and p["brand"] == "Acme" and p["sku"] == "BW-42"
    assert p["price"] == 29.99 and p["currency"] == "USD" and p["availability"] == "InStock"
    assert p["rating"] == "4.7" and p["reviews"] == "318"


def test_readable_drops_chrome():
    r = readable(SHOP_HTML, "https://shop.example/p/blue")
    assert r["title"].startswith("Widget Store")
    assert r["description"] == "A very blue widget."
    assert "bluest widget" in r["text"]
    assert "home shop cart" not in r["text"] and "copyright" not in r["text"]


def test_extract_schema():
    schema = {"items": "div.card", "fields": {
        "name": ".title",
        "url": {"css": "a.title", "attr": "href"},
        "price": {"css": ".price", "type": "price"},
        "rating": {"css": ".stars", "attr": "title", "type": "rating"}}}
    recs = extract(LIST_HTML, "https://x.example/list", schema)
    assert len(recs) == 2
    assert recs[0]["name"] == "First"
    assert recs[0]["url"] == "https://x.example/p/1"
    assert recs[0]["price"] == {"amount": 12.5, "currency": "GBP", "raw": "£12.50"}
    assert recs[0]["rating"] == 4.2
    assert recs[1]["price"]["amount"] == 8.0


def test_detect_block():
    assert detect_block(200, "<html><body>ok</body></html>", "Product") is None
    assert detect_block(403, "", "") == "HTTP 403"
    assert detect_block(200, "please enable js <div class=cf-challenge>", "Just a moment...")
    assert detect_block(200, "<form action=/errors/validateCaptcha>", "Robot Check")


def test_parse_price_variants():
    assert parse_price("US$1,299.00") == (1299.0, "USD")
    assert parse_price("1 299,99 €") == (1299.99, "EUR")


if __name__ == "__main__":
    for n, f in list(globals().items()):
        if n.startswith("test_"):
            f()
            print("ok ", n)
