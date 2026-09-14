"""The extraction cascade against HTML fixtures. No network."""

import os

import pytest

from hands.fetch import Fetched
from hands.structured import (
    AVAILABILITY,
    Product,
    extract_product,
    normalize_availability,
    platform_of,
    product_from,
)

FIX = os.path.join(os.path.dirname(__file__), "fixtures")


def fixture(name: str) -> str:
    with open(os.path.join(FIX, name), encoding="utf-8") as f:
        return f.read()


def run(name: str, url: str = "https://shop.example/p/x", headers=None):
    return extract_product(fixture(name), url, headers)


# --- JSON-LD ----------------------------------------------------------------
def test_single_product():
    p, meta = run("jsonld_single.html", "https://shop.example/p/blue-widget")
    assert meta["source"] == "jsonld" and p.source == "jsonld"
    assert p.name == "Blue Widget" and p.brand == "Acme" and p.sku == "BW-42"
    assert p.price.amount == 29.99 and p.price.currency == "USD"
    assert p.availability == "InStock"
    assert p.rating == 4.7 and p.reviews == 318          # strings in, numbers out
    assert p.image == "https://img.example/bw.jpg"        # first of a list
    assert p.description == "The bluest widget available. Ships fast."   # tags stripped
    assert p.url == "https://shop.example/p/blue-widget"
    assert p.site == "shop.example"
    assert meta["needs_browser"] is False


def test_product_inside_graph():
    p, meta = run("jsonld_graph.html", "https://run.example/p/tr2")
    assert meta["source"] == "jsonld"
    assert p.name == "Evadict TR2" and p.brand == "Evadict"
    assert p.price.amount == 74.99 and p.price.currency == "EUR"
    assert p.availability == "InStock"                    # http:// form of the URL
    assert p.rating == 4.5 and p.reviews == 1204          # ratingCount, numeric
    # the BreadcrumbList's ListItem is not a product listing
    assert "item_urls" not in meta


def test_aggregate_offer():
    p, meta = run("jsonld_aggregate_offer.html")
    assert p.price.amount == 19.9 and p.price.currency == "EUR"
    assert meta["offer"] == {"type": "AggregateOffer", "low": 19.9, "high": 89.9, "count": 6}
    assert p.availability == "InStock"


def test_product_group_with_variants():
    p, meta = run("jsonld_product_group.html")
    assert meta["source"] == "jsonld"
    assert meta["variants"] == 2
    assert p.name == "Merino Tee"                         # the group's name, not the variant's
    assert p.brand == "Woolly"
    assert p.price.amount == 49.0 and p.price.currency == "GBP"
    assert p.sku == "MT-100-S-NV"                         # first variant with an offer


def test_item_list_gives_urls_not_a_product():
    p, meta = run("jsonld_itemlist.html", "https://run.example/s?q=shoes")
    assert p is None
    assert meta["source"] == "none"
    assert meta["item_urls"] == [
        "https://run.example/p/a",
        "https://run.example/p/b",        # relative url resolved
        "https://run.example/p/c",        # @id form
    ]                                     # duplicate of /p/a dropped
    assert meta["needs_browser"] is False


def test_comma_price_string_and_list_price():
    p, meta = run("jsonld_comma_price.html")
    assert p.price.amount == 38.9 and p.price.currency == "EUR"
    assert p.list_price.amount == 45.0 and p.list_price.currency == "EUR"
    assert p.availability == "InStock"                    # bare string, not a URL


def test_several_products_prefer_the_one_for_this_url():
    p, meta = run("jsonld_two_products.html", "https://shop.example/p/main")
    assert meta["candidates"] == 2
    assert p.name == "The Main Thing" and p.price.amount == 50.0


def test_availability_forms():
    for raw, want in [
        ("https://schema.org/InStock", "InStock"),
        ("http://schema.org/OutOfStock", "OutOfStock"),
        ("InStock", "InStock"),
        ("in stock", "InStock"),
        ("PreOrder", "PreOrder"),
        ("https://schema.org/BackOrder", "BackOrder"),
        ("SoldOut", "OutOfStock"),
        ("LimitedAvailability", "InStock"),
        ("whatever", "Unknown"),
        (None, "Unknown"),
        ("", "Unknown"),
    ]:
        assert normalize_availability(raw) == want, raw
    assert set(AVAILABILITY) == {"InStock", "OutOfStock", "PreOrder", "BackOrder", "Unknown"}


# --- microdata --------------------------------------------------------------
def test_microdata_only():
    p, meta = run("microdata.html", "https://lamps.example/p/7")
    assert meta["source"] == "microdata"
    assert p.name == "Desk Lamp"                          # whitespace collapsed
    assert p.brand == "Lumo" and p.sku == "LMP-7"
    assert p.price.amount == 24.5 and p.price.currency == "GBP"   # content= wins over text
    assert p.availability == "PreOrder"                   # from <link href>
    assert p.rating == 4.2 and p.reviews == 57            # "4,2" decimal comma
    assert p.image == "https://lamps.example/img/lamp.jpg"
    assert p.description == "A lamp for desks."


# --- OpenGraph --------------------------------------------------------------
def test_opengraph_only():
    p, meta = run("opengraph.html", "https://gear.example/bottle?ref=1")
    assert meta["source"] == "opengraph"
    assert p.name == "Steel Bottle 750ml"
    assert p.price.amount == 1299.99 and p.price.currency == "SEK"
    assert p.availability == "OutOfStock"
    assert p.url == "https://gear.example/bottle"         # og:url
    assert p.image == "https://gear.example/i/bottle.jpg"
    assert p.description == "Keeps things cold."


def test_og_title_without_price_is_not_a_product():
    p, meta = run("og_title_only.html")
    assert p is None and meta["source"] == "none"
    assert meta["needs_browser"] is False                 # plenty of text: a real page


# --- nothing / shells ---------------------------------------------------------
def test_page_without_data():
    p, meta = run("nothing.html")
    assert p is None and meta["source"] == "none"
    assert meta["needs_browser"] is False                 # has <script src> but also real text


def test_spa_shell_is_flagged():
    p, meta = run("spa_shell.html")
    assert p is None and meta["source"] == "none"
    assert meta["needs_browser"] is True


def test_empty_html():
    p, meta = extract_product("", "https://x.example/")
    assert p is None and meta["source"] == "none" and meta["needs_browser"] is False


# --- platform ---------------------------------------------------------------
@pytest.mark.parametrize("name,want", [
    ("platform_shopify.html", "shopify"),
    ("platform_woocommerce.html", "woocommerce"),
    ("platform_prestashop.html", "prestashop"),
    ("platform_magento.html", "magento"),
    ("nothing.html", "other"),
])
def test_platform_from_html(name, want):
    assert platform_of(fixture(name)) == want
    _, meta = run(name)
    assert meta["platform"] == want


def test_platform_from_shopify_header():
    assert platform_of("<html></html>", {"X-ShopId": "12345"}) == "shopify"


# --- product_from(Fetched) ----------------------------------------------------
def test_product_from_fills_transport_fields():
    f = Fetched(url="https://shop.example/p/blue-widget", final_url="https://shop.example/p/blue-widget",
                status=200, headers={"content-type": "text/html"}, html=fixture("jsonld_single.html"),
                fetched_at=123.0, from_cache=True, robots_allowed=True, title="Blue Widget", truncated=False)
    p, meta = product_from(f)
    assert p.fetched_at == 123.0 and p.from_cache is True and p.robots_allowed is True
    assert meta["status"] == 200 and meta["title"] == "Blue Widget" and meta["from_cache"] is True
    d = p.to_dict()
    assert d["price"] == {"amount": 29.99, "currency": "USD"}
    assert d["list_price"] is None
    assert set(d) >= {"url", "site", "platform", "name", "brand", "sku", "price", "list_price",
                      "availability", "rating", "reviews", "image", "description", "source",
                      "needs_browser", "robots_allowed", "fetched_at", "from_cache"}


def test_description_is_capped():
    html = ('<script type="application/ld+json">{"@type":"Product","name":"X","description":"%s"}</script>'
            % ("word " * 200))
    p, _ = extract_product(html, "https://x.example/")
    assert len(p.description) <= 300 and p.description.endswith("…")
