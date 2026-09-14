"""
Politeness. Everything that decides whether, and how fast, Hands may load a
page — moved here from the v0.2 browser module, because it never had anything
to do with the browser.

  - per-domain lock: one request at a time on a domain, with a gap between
    them; different domains run side by side
  - hourly caps, per domain and global
  - a cooldown after any block, and no attempt, ever, to get around one
  - allow / deny lists
  - robots.txt, in off / warn / enforce mode
  - detect_block(): the generic "this is a challenge page" test

`Hands` wraps a Fetcher. The Fetcher does HTTP; this does manners.
"""

from __future__ import annotations

import asyncio
import random
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Awaitable, Callable
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

from .fetch import FetchError, Fetched, Fetcher


class Blocked(Exception):
    """The site answered with a block / challenge. We stop."""


class RateLimited(Exception):
    """Our own budget says: not now."""


class NotAllowed(Exception):
    """Domain policy (allow/deny lists, robots in enforce mode) says no."""


@dataclass
class Budget:
    min_gap_s: float = 15.0        # per domain
    jitter_s: float = 4.0          # added to the gap, 0..jitter
    per_domain_per_hour: int = 30
    global_per_hour: int = 90
    cooldown_hours: float = 6.0    # per domain, after a block


# --- generic block / challenge detection ------------------------------------
# Carried over from v0.2 as-is. Markers, not heuristics: a match means the
# page is telling us, in its own words, that it wants a human.
_TITLE_MARKERS = (
    "just a moment", "attention required", "access denied", "robot check",
    "pardon our interruption", "are you a human", "verify you are human",
    "security check", "one more step", "blocked", "captcha",
)
_HTML_MARKERS = (
    "/errors/validatecaptcha", "enter the characters you see below",
    "api-services-support@amazon.com", "cf-challenge", "challenge-platform",
    "g-recaptcha", "h-captcha", "hcaptcha.com", "px-captcha", "_incapsula_",
    "distil_r_captcha", "press & hold", "press and hold",
)


def detect_block(status: int | None, html: str, title: str) -> str | None:
    t = (title or "").lower()
    h = (html or "")[:30000].lower()
    for m in _TITLE_MARKERS:
        if m in t:
            return f"challenge page (title: {title!r})"
    for m in _HTML_MARKERS:
        if m in h:
            return f"challenge/captcha marker '{m}'"
    if status in (401, 403, 429, 503):
        return f"HTTP {status}"
    return None


# --- domains ------------------------------------------------------------------
@dataclass
class _DomainState:
    last: float = 0.0
    recent: deque = field(default_factory=deque)
    cooldown_until: float = 0.0
    blocks: int = 0


def domain_of(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def _matches(domain: str, patterns: list[str]) -> bool:
    return any(domain == p or domain.endswith("." + p) for p in patterns if p)


def split_list(v: str | None) -> list[str]:
    """'a.com, b.org c.net' -> ['a.com', 'b.org', 'c.net'] (env-style lists)."""
    return [x.strip().lower().lstrip(".") for x in (v or "").replace(",", " ").split() if x.strip()]


ROBOTS_MODES = ("off", "warn", "enforce")
_ROBOTS_TTL_S = 24 * 3600


class Hands:
    def __init__(
        self,
        fetcher: Fetcher,
        budget: Budget | None = None,
        *,
        robots_mode: str = "warn",
        allow_domains: list[str] | None = None,   # if set: ONLY these
        deny_domains: list[str] | None = None,
        default_locale: str = "en-US",
        clock: Callable[[], float] = time.time,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        jitter: Callable[[float, float], float] = random.uniform,
    ):
        if robots_mode not in ROBOTS_MODES:
            raise ValueError(f"robots_mode must be one of {ROBOTS_MODES}, got {robots_mode!r}")
        self.fetcher = fetcher
        self.budget = budget or Budget()
        self.robots_mode = robots_mode
        self.allow_domains = [d.lower() for d in (allow_domains or []) if d]
        self.deny_domains = [d.lower() for d in (deny_domains or []) if d]
        self.default_locale = default_locale
        self._clock = clock
        self._sleep = sleep
        self._jitter = jitter
        self._domains: dict[str, _DomainState] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._counter_lock = asyncio.Lock()
        self._global_recent: deque = deque()
        self._robots_cache: dict[str, tuple[float, RobotFileParser | None]] = {}
        self.pages_total = 0

    # -- policy --------------------------------------------------------------
    def check_policy(self, url: str) -> None:
        d = domain_of(url)
        if not d or urlparse(url).scheme not in ("http", "https"):
            raise NotAllowed(f"Not a fetchable http(s) URL: {url}")
        if self.allow_domains and not _matches(d, self.allow_domains):
            raise NotAllowed(f"{d} is not in HANDS_ALLOW_DOMAINS")
        if _matches(d, self.deny_domains):
            raise NotAllowed(f"{d} is in HANDS_DENY_DOMAINS")

    async def robots_allowed(self, url: str) -> bool | None:
        """What robots.txt says about this path. None when robots is off.
        Fetched through the same fetcher, outside the budget, cached a day."""
        if self.robots_mode == "off":
            return None
        d = domain_of(url)
        now = self._clock()
        cached = self._robots_cache.get(d)
        if cached and now - cached[0] < _ROBOTS_TTL_S:
            rp = cached[1]
        else:
            rp = None
            try:
                p = urlparse(url)
                r = await self.fetcher.fetch(f"{p.scheme}://{p.netloc}/robots.txt")
                if r.status == 200 and r.html.strip():
                    rp = RobotFileParser()
                    rp.parse(r.html.splitlines())
            except FetchError:
                rp = None
            self._robots_cache[d] = (now, rp)
        if rp is None:
            return True   # no file, or unreadable: nothing forbids it
        return rp.can_fetch("*", url)

    # -- budget --------------------------------------------------------------
    def _state(self, domain: str) -> _DomainState:
        return self._domains.setdefault(domain, _DomainState())

    def _lock(self, domain: str) -> asyncio.Lock:
        return self._locks.setdefault(domain, asyncio.Lock())

    @staticmethod
    def _trim(q: deque, now: float) -> None:
        while q and now - q[0] > 3600:
            q.popleft()

    def _check_caps(self, domain: str) -> None:
        now = self._clock()
        s = self._state(domain)
        if now < s.cooldown_until:
            mins = int((s.cooldown_until - now) // 60)
            raise RateLimited(f"{domain}: cooling down {mins} more minutes after a block.")
        self._trim(s.recent, now)
        self._trim(self._global_recent, now)
        if len(s.recent) >= self.budget.per_domain_per_hour:
            raise RateLimited(f"{domain}: hourly budget ({self.budget.per_domain_per_hour} pages) used up.")
        if len(self._global_recent) >= self.budget.global_per_hour:
            raise RateLimited(f"Global hourly budget ({self.budget.global_per_hour} pages) used up.")

    async def _reserve(self, domain: str) -> None:
        """Wait out the gap, then take one page of budget. Called under the
        domain lock, so the gap is per domain and other domains do not wait."""
        s = self._state(domain)
        self._check_caps(domain)
        wait = s.last + self.budget.min_gap_s + self._jitter(0, self.budget.jitter_s) - self._clock()
        if wait > 0:
            await self._sleep(wait)
        async with self._counter_lock:
            self._check_caps(domain)     # the sleep may have been long
            now = self._clock()
            s.last = now
            s.recent.append(now)
            self._global_recent.append(now)
            self.pages_total += 1

    def status(self) -> dict:
        now = self._clock()
        self._trim(self._global_recent, now)
        doms = {}
        for d, s in self._domains.items():
            self._trim(s.recent, now)
            doms[d] = {
                "pages_last_hour": len(s.recent),
                "cooldown_seconds_left": max(0, int(s.cooldown_until - now)),
                "blocks_seen": s.blocks,
            }
        return {
            "pages_last_hour": len(self._global_recent),
            "global_hourly_cap": self.budget.global_per_hour,
            "per_domain_hourly_cap": self.budget.per_domain_per_hour,
            "min_gap_seconds": self.budget.min_gap_s,
            "pages_total_this_run": self.pages_total,
            "domains": doms,
            "robots_mode": self.robots_mode,
        }

    # -- fetch ---------------------------------------------------------------
    async def fetch(self, url: str, locale: str | None = None) -> Fetched:
        self.check_policy(url)
        domain = domain_of(url)
        robots = await self.robots_allowed(url)
        if robots is False and self.robots_mode == "enforce":
            raise NotAllowed(f"{domain}/robots.txt disallows this path (HANDS_ROBOTS=enforce).")

        # A cache hit is not a visit: no lock, no gap, no budget.
        peek = getattr(self.fetcher, "cached", None)
        hit = peek(url) if peek else None
        if hit is not None:
            hit.robots_allowed = robots
            return hit

        async with self._lock(domain):
            await self._reserve(domain)
            f = await self.fetcher.fetch(url, locale=locale or self.default_locale)
            s = self._state(domain)
            reason = detect_block(f.status, f.html, f.title)
            if reason:
                s.blocks += 1
                s.cooldown_until = self._clock() + self.budget.cooldown_hours * 3600
                raise Blocked(
                    f"{domain} answered with {reason}. Stopped; cooling down "
                    f"{self.budget.cooldown_hours:g} h. Hands does not try to bypass blocks."
                )
            f.robots_allowed = robots
            return f
