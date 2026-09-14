"""parse_price and friends — the formats the spec names, plus the ones that bit."""

import pytest

from hands.parse import parse_int, parse_price, parse_rating


@pytest.mark.parametrize("text,want", [
    ("$1,299.99", (1299.99, "USD")),
    ("1.299,99 €", (1299.99, "EUR")),
    ("38,90€", (38.9, "EUR")),
    ("£19.99", (19.99, "GBP")),
    ("1 299,99 €", (1299.99, "EUR")),
    ("US$ 12", (12.0, "USD")),
    ("US$1,299.00", (1299.0, "USD")),
    ("29.99", (29.99, None)),          # bare JSON-LD price string
    ("38,90", (38.9, None)),
    ("1.299,99", (1299.99, None)),
    ("CHF 89.00", (89.0, "CHF")),
    ("1 299 kr", (1299.0, "SEK")),
])
def test_parse_price(text, want):
    assert parse_price(text) == want


def test_parse_price_empty():
    assert parse_price(None) == (None, None)
    assert parse_price("") == (None, None)
    assert parse_price("sold out") == (None, None)


def test_parse_rating():
    assert parse_rating("4.2 of 5 stars") == 4.2
    assert parse_rating("4,7") == 4.7
    assert parse_rating("") is None


def test_parse_int():
    assert parse_int("1,204 ratings") == 1204
    assert parse_int("(57)") == 57
    assert parse_int("none") is None
