"""SQLite store: watched URLs and every price seen. Universal (any site)."""

from __future__ import annotations

import os
import sqlite3
import time
from contextlib import contextmanager

DB_PATH = os.environ.get("HANDS_DB", os.path.join(os.path.dirname(__file__), "..", "data", "hands.db"))

_SCHEMA = """
CREATE TABLE IF NOT EXISTS tracked (
    url TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    title TEXT,
    target_price REAL,
    price_css TEXT,
    added_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    price REAL,
    currency TEXT,
    ts REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS prices_idx ON prices (url, ts);
"""


@contextmanager
def _db():
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript(_SCHEMA)
        yield conn
        conn.commit()
    finally:
        conn.close()


def track_add(url, domain, title, target_price, price_css=None):
    with _db() as c:
        c.execute(
            "INSERT INTO tracked (url,domain,title,target_price,price_css,added_at) VALUES (?,?,?,?,?,?) "
            "ON CONFLICT(url) DO UPDATE SET target_price=excluded.target_price, "
            "price_css=COALESCE(excluded.price_css, tracked.price_css), "
            "title=COALESCE(excluded.title, tracked.title)",
            (url, domain, title, target_price, price_css, time.time()),
        )


def track_remove(url) -> bool:
    with _db() as c:
        return c.execute("DELETE FROM tracked WHERE url=?", (url,)).rowcount > 0


def track_list():
    with _db() as c:
        out = []
        for r in c.execute("SELECT * FROM tracked ORDER BY added_at").fetchall():
            last = c.execute("SELECT price,currency,ts FROM prices WHERE url=? ORDER BY ts DESC LIMIT 1",
                             (r["url"],)).fetchone()
            out.append({"url": r["url"], "domain": r["domain"], "title": r["title"],
                        "target_price": r["target_price"], "price_css": r["price_css"],
                        "last_price": last["price"] if last else None,
                        "currency": last["currency"] if last else None,
                        "last_checked": last["ts"] if last else None})
        return out


def record_price(url, price, currency):
    with _db() as c:
        c.execute("INSERT INTO prices (url,price,currency,ts) VALUES (?,?,?,?)",
                  (url, price, currency, time.time()))


def previous_price(url):
    with _db() as c:
        rows = c.execute("SELECT price FROM prices WHERE url=? AND price IS NOT NULL ORDER BY ts DESC LIMIT 2",
                         (url,)).fetchall()
        return rows[1]["price"] if len(rows) == 2 else None


def history(url, days=30):
    since = time.time() - days * 86400
    with _db() as c:
        return [dict(r) for r in c.execute(
            "SELECT price,currency,ts FROM prices WHERE url=? AND ts>=? ORDER BY ts", (url, since)).fetchall()]
