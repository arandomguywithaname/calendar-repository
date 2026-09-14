"""Policy, offline, with a fake clock: gaps, caps, cooldowns, robots, lists."""

import asyncio

import pytest

from hands.fetch import FetchError, Fetched
from hands.policy import (
    Blocked,
    Budget,
    Hands,
    NotAllowed,
    RateLimited,
    detect_block,
    domain_of,
    split_list,
)


class FakeTime:
    """clock() and sleep() share one timeline; sleeping advances it."""

    def __init__(self, t=1_000_000.0):
        self.t = t
        self.sleeps = []

    def clock(self):
        return self.t

    async def sleep(self, s):
        self.sleeps.append(round(s, 3))
        self.t += s


class FakeFetcher:
    """Answers from a dict of url -> (status, html); records every call."""

    def __init__(self, pages=None, robots=None, gate: asyncio.Event | None = None):
        self.pages = pages or {}
        self.robots = robots or {}
        self.calls = []
        self.cache = {}
        self.gate = gate

    def cached(self, url):
        return self.cache.get(url)

    async def fetch(self, url, *, locale=None):
        self.calls.append(url)
        if self.gate and not url.endswith("/robots.txt"):
            await self.gate.wait()
        if url.endswith("/robots.txt"):
            body = self.robots.get(url)
            status = 200 if body is not None else 404
            return Fetched(url=url, final_url=url, status=status, headers={}, html=body or "", fetched_at=0)
        status, html = self.pages.get(url, (200, "<title>ok</title><p>fine</p>"))
        title = "Just a moment..." if "just-a-moment" in html else "ok"
        return Fetched(url=url, final_url=url, status=status, headers={}, html=html, fetched_at=0, title=title)


def hands(fetcher, ft, **kw):
    budget = kw.pop("budget", Budget(min_gap_s=15, jitter_s=0))
    return Hands(fetcher, budget, clock=ft.clock, sleep=ft.sleep, jitter=lambda a, b: 0.0,
                 robots_mode=kw.pop("robots_mode", "off"), **kw)


# --- helpers ----------------------------------------------------------------
def test_domain_of_strips_www():
    assert domain_of("https://www.amazon.de/dp/X") == "amazon.de"
    assert domain_of("https://smile.amazon.de/") == "smile.amazon.de"
    assert domain_of("not a url") == ""


def test_split_list_is_forgiving():
    assert split_list(" amazon.de, decathlon.fr .Example.COM ") == ["amazon.de", "decathlon.fr", "example.com"]
    assert split_list(None) == []


# --- detect_block (carried over from v0.2 as-is) ----------------------------
def test_detect_block_cases():
    assert detect_block(200, "<html><body>ok</body></html>", "Product") is None
    assert detect_block(403, "", "") == "HTTP 403"
    assert detect_block(429, "", "") == "HTTP 429"
    assert detect_block(200, "please enable js <div class=cf-challenge>", "Just a moment...")
    assert detect_block(200, "<form action=/errors/validateCaptcha>", "Robot Check")
    assert detect_block(200, "<div class='g-recaptcha'>", "Sign in") is not None


# --- gap and locks ----------------------------------------------------------
async def test_gap_is_kept_inside_a_domain():
    ft = FakeTime()
    h = hands(FakeFetcher(), ft)
    await h.fetch("https://a.example/1")
    await h.fetch("https://a.example/2")
    assert ft.sleeps == [15.0]          # second call on the same domain waited the gap


async def test_first_visit_to_a_domain_does_not_wait():
    ft = FakeTime()
    h = hands(FakeFetcher(), ft)
    await h.fetch("https://a.example/1")
    await h.fetch("https://b.example/1")
    assert ft.sleeps == []              # different domains, no gap between them


async def test_two_domains_run_side_by_side():
    # Domain A is stuck behind a gate. Domain B must finish anyway: the lock is
    # per domain, not global.
    gate = asyncio.Event()
    ft = FakeTime()
    fetcher = FakeFetcher(gate=gate)
    h = hands(fetcher, ft)
    task_a = asyncio.create_task(h.fetch("https://a.example/1"))
    await asyncio.sleep(0)               # let A grab its lock and block on the gate
    task_b = asyncio.create_task(h.fetch("https://b.example/1"))
    await asyncio.sleep(0)
    # Both calls are in flight together: B was not queued behind A's lock.
    assert fetcher.calls == ["https://a.example/1", "https://b.example/1"]
    gate.set()
    await asyncio.gather(task_a, task_b)


async def test_same_domain_is_serialised():
    gate = asyncio.Event()
    ft = FakeTime()
    fetcher = FakeFetcher(gate=gate)
    h = hands(fetcher, ft)
    t1 = asyncio.create_task(h.fetch("https://a.example/1"))
    t2 = asyncio.create_task(h.fetch("https://a.example/2"))
    await asyncio.sleep(0)
    await asyncio.sleep(0)
    assert fetcher.calls == ["https://a.example/1"]   # /2 is waiting for the lock
    gate.set()
    await asyncio.gather(t1, t2)
    assert fetcher.calls == ["https://a.example/1", "https://a.example/2"]


# --- caps and cooldown ------------------------------------------------------
async def test_per_domain_hourly_cap():
    ft = FakeTime()
    h = hands(FakeFetcher(), ft, budget=Budget(min_gap_s=0, jitter_s=0, per_domain_per_hour=2))
    await h.fetch("https://a.example/1")
    await h.fetch("https://a.example/2")
    with pytest.raises(RateLimited, match="hourly budget"):
        await h.fetch("https://a.example/3")
    await h.fetch("https://b.example/1")     # another domain is unaffected
    ft.t += 3601
    await h.fetch("https://a.example/4")     # the hour rolled over


async def test_global_hourly_cap():
    ft = FakeTime()
    h = hands(FakeFetcher(), ft, budget=Budget(min_gap_s=0, jitter_s=0, global_per_hour=2))
    await h.fetch("https://a.example/1")
    await h.fetch("https://b.example/1")
    with pytest.raises(RateLimited, match="Global hourly budget"):
        await h.fetch("https://c.example/1")


async def test_block_starts_a_cooldown_and_is_never_retried():
    ft = FakeTime()
    fetcher = FakeFetcher(pages={"https://a.example/p": (403, "")})
    h = hands(fetcher, ft, budget=Budget(min_gap_s=0, jitter_s=0, cooldown_hours=6))
    with pytest.raises(Blocked, match="HTTP 403"):
        await h.fetch("https://a.example/p")
    with pytest.raises(RateLimited, match="cooling down"):
        await h.fetch("https://a.example/other")
    assert len(fetcher.calls) == 1          # the second call never reached the network
    assert h.status()["domains"]["a.example"]["blocks_seen"] == 1
    assert h.status()["domains"]["a.example"]["cooldown_seconds_left"] == 6 * 3600
    await h.fetch("https://b.example/p")    # other domains keep working
    ft.t += 6 * 3600 + 1
    await h.fetch("https://a.example/again")


async def test_challenge_page_with_status_200_is_still_a_block():
    ft = FakeTime()
    fetcher = FakeFetcher(pages={"https://a.example/p": (200, "just-a-moment <div class=cf-challenge>")})
    h = hands(fetcher, ft, budget=Budget(min_gap_s=0, jitter_s=0))
    with pytest.raises(Blocked, match="challenge"):
        await h.fetch("https://a.example/p")


# --- allow / deny -------------------------------------------------------------
async def test_allow_list_restricts_and_covers_subdomains():
    ft = FakeTime()
    h = hands(FakeFetcher(), ft, allow_domains=["amazon.de"])
    await h.fetch("https://www.amazon.de/dp/X")
    await h.fetch("https://smile.amazon.de/")
    with pytest.raises(NotAllowed, match="not in HANDS_ALLOW_DOMAINS"):
        await h.fetch("https://notamazon.de/")
    with pytest.raises(NotAllowed):
        await h.fetch("https://decathlon.fr/")


async def test_deny_list():
    ft = FakeTime()
    h = hands(FakeFetcher(), ft, deny_domains=["bad.example"])
    with pytest.raises(NotAllowed, match="HANDS_DENY_DOMAINS"):
        await h.fetch("https://shop.bad.example/x")
    await h.fetch("https://good.example/x")


async def test_non_http_urls_are_refused():
    ft = FakeTime()
    h = hands(FakeFetcher(), ft)
    for bad in ("file:///etc/passwd", "ftp://x.example/", "javascript:alert(1)", "not a url"):
        with pytest.raises(NotAllowed):
            await h.fetch(bad)


# --- robots -----------------------------------------------------------------
ROBOTS = "User-agent: *\nDisallow: /private/\nAllow: /\n"


async def test_robots_off_reports_none():
    ft = FakeTime()
    h = hands(FakeFetcher(robots={"https://a.example/robots.txt": ROBOTS}), ft, robots_mode="off")
    f = await h.fetch("https://a.example/private/x")
    assert f.robots_allowed is None


async def test_robots_warn_reports_but_does_not_refuse():
    ft = FakeTime()
    fetcher = FakeFetcher(robots={"https://a.example/robots.txt": ROBOTS})
    h = hands(fetcher, ft, robots_mode="warn", budget=Budget(min_gap_s=0, jitter_s=0))
    f = await h.fetch("https://a.example/private/x")
    assert f.robots_allowed is False
    f2 = await h.fetch("https://a.example/public")
    assert f2.robots_allowed is True
    # robots.txt itself is outside the budget: two pages counted, not three
    assert h.pages_total == 2
    assert fetcher.calls.count("https://a.example/robots.txt") == 1   # cached a day


async def test_robots_enforce_refuses():
    ft = FakeTime()
    h = hands(FakeFetcher(robots={"https://a.example/robots.txt": ROBOTS}), ft, robots_mode="enforce")
    with pytest.raises(NotAllowed, match="robots.txt disallows"):
        await h.fetch("https://a.example/private/x")
    await h.fetch("https://a.example/ok")


async def test_missing_robots_means_allowed():
    ft = FakeTime()
    h = hands(FakeFetcher(), ft, robots_mode="enforce")
    f = await h.fetch("https://a.example/anything")
    assert f.robots_allowed is True


def test_bad_robots_mode_is_rejected_early():
    with pytest.raises(ValueError):
        Hands(FakeFetcher(), robots_mode="maybe")


# --- cache ------------------------------------------------------------------
async def test_cache_hit_costs_no_budget_and_no_wait():
    ft = FakeTime()
    fetcher = FakeFetcher()
    h = hands(fetcher, ft)
    await h.fetch("https://a.example/1")
    fetcher.cache["https://a.example/1"] = Fetched(
        url="https://a.example/1", final_url="https://a.example/1", status=200, headers={},
        html="<p>cached</p>", fetched_at=0, from_cache=True)
    f = await h.fetch("https://a.example/1")
    assert f.from_cache is True
    assert h.pages_total == 1            # still one real visit
    assert ft.sleeps == []               # and no 15 s gap for a cache hit
    assert fetcher.calls == ["https://a.example/1"]


# --- errors propagate ---------------------------------------------------------
async def test_network_failure_is_not_a_block():
    class Dead(FakeFetcher):
        async def fetch(self, url, *, locale=None):
            raise FetchError("ConnectError: refused")

    ft = FakeTime()
    h = hands(Dead(), ft)
    with pytest.raises(FetchError):
        await h.fetch("https://a.example/1")
    assert h.status()["domains"]["a.example"]["blocks_seen"] == 0
