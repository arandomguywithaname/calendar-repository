"""Small, pure helpers shared by extractors and recipes."""

from __future__ import annotations

import re

_NUM_RE = re.compile(r"(\d[\d.,\s\u202f\u00a0]*\d|\d)")
_RATING_RE = re.compile(r"(\d+[.,]\d)")

_CURRENCIES = (("€", "EUR"), ("£", "GBP"), ("CHF", "CHF"), ("zł", "PLN"), ("kr", "SEK"),
               ("C$", "CAD"), ("US$", "USD"), ("$", "USD"), ("USD", "USD"), ("EUR", "EUR"), ("GBP", "GBP"))


def parse_price(text: str | None) -> tuple[float | None, str | None]:
    """'$1,299.99' -> (1299.99,'USD'); '1.299,99 €' -> (1299.99,'EUR'); '19,99€' -> (19.99,'EUR')."""
    if not text:
        return None, None
    t = text.replace("\u202f", " ").replace("\u00a0", " ").strip()
    currency = next((code for sym, code in _CURRENCIES if sym in t), None)
    m = _NUM_RE.search(t)
    if not m:
        return None, currency
    num = m.group(1).replace(" ", "")
    if "," in num and "." in num:
        num = num.replace(".", "").replace(",", ".") if num.rfind(",") > num.rfind(".") else num.replace(",", "")
    elif "," in num:
        head, _, tail = num.rpartition(",")
        num = head.replace(",", "") + "." + tail if len(tail) == 2 else num.replace(",", "")
    elif "." in num:
        head, _, tail = num.rpartition(".")
        num = head.replace(".", "") + "." + tail if len(tail) == 2 else num.replace(".", "")
    try:
        return round(float(num), 2), currency
    except ValueError:
        return None, currency


def parse_rating(text: str | None) -> float | None:
    if not text:
        return None
    m = _RATING_RE.search(text)
    return float(m.group(1).replace(",", ".")) if m else None


def parse_int(text: str | None) -> int | None:
    if not text or not re.search(r"\d", text):
        return None
    return int(re.sub(r"[^\d]", "", text))


def text_of(el) -> str:
    return el.get_text(" ", strip=True) if el is not None else ""
