"""
Fetching a page. This is the only module in the package that talks to the
network, and it does so as a plainly labelled HTTP client — no browser, no
session, no pretending. The User-Agent names the project and links to it.

    Fetcher      — the interface the rest of the package codes against
    HttpFetcher  — httpx, honest headers, small cache, retries on network
                   errors only (a 4xx/5xx is an answer, not a failure)
    BrowserFetcher — a hole for v0.4; raises NotImplementedError

Policy (budgets, locks, robots, block detection) lives in policy.py and wraps
a Fetcher. Keep it that way: this module must stay usable for robots.txt,
which is fetched outside the budget.
"""

from __future__ import annotations

import asyncio
import html as htmlmod
import re
import time
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Protocol

import httpx

from . import REPO_URL, __version__

# major.minor in the UA, as the spec writes it: Hands/0.3, not Hands/0.3.0
_UA_VERSION = ".".join(__version__.split(".")[:2])
DEFAULT_USER_AGENT = f"Hands/{_UA_VERSION} (+{REPO_URL}; personal price monitor)"
DEFAULT_TIMEOUT_S = 20.0
DEFAULT_MAX_BYTES = 3 * 1024 * 1024
DEFAULT_CACHE_TTL_S = 600.0
# Retries after the first attempt, on network errors only. Two values, two retries.
RETRY_BACKOFF_S = (1.0, 3.0)

_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
_CHARSET_RE = re.compile(r"charset=([\w-]+)", re.I)


@dataclass
class Fetched:
    url: str
    final_url: str
    status: int | None
    headers: dict[str, str]          # lower-cased keys
    html: str
    fetched_at: float
    from_cache: bool = False
    robots_allowed: bool | None = None   # filled in by policy; None = unknown / robots off
    title: str = ""                       # derived from the HTML; detect_block wants it
    truncated: bool = False               # body was cut at the size limit
    tries: int = 1                        # how many attempts it took (tests, diagnostics)


class Fetcher(Protocol):
    async def fetch(self, url: str, *, locale: str | None = None) -> Fetched: ...


class FetchError(Exception):
    """The network gave up on us (after retries). Not a block, not a 4xx."""


def title_of(html: str) -> str:
    m = _TITLE_RE.search(html[:50_000] if html else "")
    if not m:
        return ""
    return re.sub(r"\s+", " ", htmlmod.unescape(m.group(1))).strip()


def _decode(body: bytes, content_type: str | None) -> str:
    m = _CHARSET_RE.search(content_type or "")
    for enc in ((m.group(1),) if m else ()) + ("utf-8",):
        try:
            return body.decode(enc)
        except (LookupError, UnicodeDecodeError):
            continue
    return body.decode("utf-8", errors="replace")


@dataclass
class _Entry:
    fetched: Fetched
    expires: float


class HttpFetcher:
    def __init__(
        self,
        *,
        user_agent: str | None = None,
        locale: str = "en-US",
        timeout_s: float = DEFAULT_TIMEOUT_S,
        max_bytes: int = DEFAULT_MAX_BYTES,
        cache_ttl_s: float = DEFAULT_CACHE_TTL_S,
        clock: Callable[[], float] = time.time,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        transport: httpx.AsyncBaseTransport | None = None,   # tests inject MockTransport
    ):
        self.user_agent = user_agent or DEFAULT_USER_AGENT
        self.locale = locale
        self.timeout_s = timeout_s
        self.max_bytes = max_bytes
        self.cache_ttl_s = cache_ttl_s
        self._clock = clock
        self._sleep = sleep
        self._cache: dict[str, _Entry] = {}
        self._client = httpx.AsyncClient(
            follow_redirects=True,
            timeout=timeout_s,
            transport=transport,
            headers={"User-Agent": self.user_agent},
        )

    # -- cache -------------------------------------------------------------
    def cached(self, url: str) -> Fetched | None:
        """A fresh cached copy, or None. Does not touch the network. Policy
        checks this first so a cache hit costs no budget and no wait."""
        e = self._cache.get(url)
        if e is None or e.expires <= self._clock():
            return None
        f = e.fetched
        return Fetched(**{**f.__dict__, "from_cache": True})

    def _remember(self, f: Fetched) -> None:
        if self.cache_ttl_s <= 0:
            return
        e = _Entry(f, self._clock() + self.cache_ttl_s)
        # Keyed by final_url as the spec says — and by the requested url too,
        # because the next call will ask for the URL it knows, not the one the
        # redirect landed on. Same entry, two keys.
        self._cache[f.final_url] = e
        self._cache[f.url] = e

    def clear_cache(self) -> None:
        self._cache.clear()

    # -- fetch -------------------------------------------------------------
    def _headers(self, locale: str | None) -> dict[str, str]:
        loc = locale or self.locale
        return {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": f"{loc},en;q=0.5" if not loc.startswith("en") else loc,
            "Accept-Encoding": "gzip, br",
        }

    async def _once(self, url: str, locale: str | None) -> Fetched:
        async with self._client.stream("GET", url, headers=self._headers(locale)) as r:
            chunks: list[bytes] = []
            size = 0
            truncated = False
            async for chunk in r.aiter_bytes():
                room = self.max_bytes - size
                if len(chunk) > room:
                    chunks.append(chunk[:room])
                    truncated = True
                    break
                chunks.append(chunk)
                size += len(chunk)
            body = b"".join(chunks)
        headers = {k.lower(): v for k, v in r.headers.items()}
        html = _decode(body, headers.get("content-type"))
        return Fetched(
            url=url,
            final_url=str(r.url),
            status=r.status_code,
            headers=headers,
            html=html,
            fetched_at=self._clock(),
            title=title_of(html),
            truncated=truncated,
        )

    async def fetch(self, url: str, *, locale: str | None = None) -> Fetched:
        hit = self.cached(url)
        if hit is not None:
            return hit
        last: Exception | None = None
        for attempt in range(1 + len(RETRY_BACKOFF_S)):
            try:
                f = await self._once(url, locale)
                f.tries = attempt + 1
                self._remember(f)
                return f
            except httpx.TransportError as e:
                # Connection refused, DNS, timeout, reset: worth another go.
                # Anything the server actually said (4xx/5xx) is returned as
                # a Fetched above and never lands here.
                last = e
                if attempt < len(RETRY_BACKOFF_S):
                    await self._sleep(RETRY_BACKOFF_S[attempt])
        raise FetchError(f"{type(last).__name__}: {last}") from last

    async def close(self) -> None:
        await self._client.aclose()


class BrowserFetcher:
    """Placeholder for a real-browser fetcher (v0.4). Not wired, not a
    dependency; here so the Fetcher seam is visible in the code."""

    def __init__(self, *_, **__):
        raise NotImplementedError("BrowserFetcher is planned for v0.4 — TODO")

    async def fetch(self, url: str, *, locale: str | None = None) -> Fetched:  # pragma: no cover
        raise NotImplementedError("v0.4")
