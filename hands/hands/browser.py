"""
The browser layer. The ONLY module that opens network connections to the
sites you ask about. It runs a real Chromium on YOUR machine, loads pages
the way a visitor would, and returns the HTML. It keeps a polite budget per
domain, and when a site says "no" (robot check, challenge page, 403/429) it
stops and cools down. It never tries to get around a block.
"""

from __future__ import annotations

import asyncio
import hashlib
import os
import random
import re
import time
from collections import deque
from dataclasses import dataclass, field
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser


class Blocked(Exception):
    """The site answered with a block / challenge. We stop."""


class RateLimited(Exception):
    """Our own budget says: not now."""


class NotAllowed(Exception):
    """Domain policy (allow/deny lists) says no."""


@dataclass
class Fetched:
    url: str
    final_url: str
    status: int | None
    title: str
    html: str
    fetched_at: float
    robots_allowed: bool | None = None   # None = unknown / robots mode off


@dataclass
class Budget:
    min_gap_s: float = 15.0        # per domain
    per_domain_per_hour: int = 30
    global_per_hour: int = 90
    cooldown_hours: float = 6.0    # per domain, after a block


# --- generic block / challenge detection ------------------------------------
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


# --- domain state -------------------------------------------------------------
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


class Hands:
    def __init__(
        self,
        budget: Budget | None = None,
        headless: bool = True,
        channel: str | None = None,
        dump_dir: str | None = None,
        robots_mode: str = "warn",            # off | warn | enforce
        allow_domains: list[str] | None = None,  # if set: ONLY these
        deny_domains: list[str] | None = None,
        default_locale: str = "en-US",
    ):
        self.budget = budget or Budget()
        self.headless = headless
        self.channel = channel or None
        self.dump_dir = dump_dir or None
        self.robots_mode = robots_mode
        self.allow_domains = [d.lower() for d in (allow_domains or []) if d]
        self.deny_domains = [d.lower() for d in (deny_domains or []) if d]
        self.default_locale = default_locale
        self._pw = None
        self._browser = None
        self._contexts: dict[str, object] = {}
        self._lock = asyncio.Lock()
        self._domains: dict[str, _DomainState] = {}
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
        if self.robots_mode == "off":
            return None
        d = domain_of(url)
        now = time.time()
        cached = self._robots_cache.get(d)
        if cached and now - cached[0] < 86400:
            rp = cached[1]
        else:
            rp = None
            try:
                import httpx
                origin = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
                async with httpx.AsyncClient(timeout=10, follow_redirects=True) as c:
                    r = await c.get(origin + "/robots.txt")
                if r.status_code == 200 and r.text.strip():
                    rp = RobotFileParser()
                    rp.parse(r.text.splitlines())
            except Exception:
                rp = None
            self._robots_cache[d] = (now, rp)
        if rp is None:
            return True
        return rp.can_fetch("*", url)

    # -- lifecycle -----------------------------------------------------------
    async def _ensure(self):
        if self._pw is None:
            from playwright.async_api import async_playwright
            self._pw = await async_playwright().start()
        if self._browser is None:
            kwargs = {"headless": self.headless}
            if self.channel:
                kwargs["channel"] = self.channel
            self._browser = await self._pw.chromium.launch(**kwargs)

    async def _context(self, locale: str):
        await self._ensure()
        ctx = self._contexts.get(locale)
        if ctx is None:
            ctx = await self._browser.new_context(locale=locale, viewport={"width": 1280, "height": 900})
            self._contexts[locale] = ctx
        return ctx

    async def close(self):
        for ctx in self._contexts.values():
            await ctx.close()
        self._contexts.clear()
        if self._browser:
            await self._browser.close()
            self._browser = None
        if self._pw:
            await self._pw.stop()
            self._pw = None

    # -- budget --------------------------------------------------------------
    def _state(self, domain: str) -> _DomainState:
        return self._domains.setdefault(domain, _DomainState())

    @staticmethod
    def _trim(q: deque, now: float):
        while q and now - q[0] > 3600:
            q.popleft()

    def status(self) -> dict:
        now = time.time()
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

    async def _wait_for_budget(self, domain: str):
        now = time.time()
        s = self._state(domain)
        if now < s.cooldown_until:
            raise RateLimited(f"{domain}: cooling down {int((s.cooldown_until - now) // 60)} more minutes after a block.")
        self._trim(s.recent, now)
        self._trim(self._global_recent, now)
        if len(s.recent) >= self.budget.per_domain_per_hour:
            raise RateLimited(f"{domain}: hourly budget ({self.budget.per_domain_per_hour} pages) used up.")
        if len(self._global_recent) >= self.budget.global_per_hour:
            raise RateLimited(f"Global hourly budget ({self.budget.global_per_hour} pages) used up.")
        wait = s.last + self.budget.min_gap_s + random.uniform(0, 4) - now
        if wait > 0:
            await asyncio.sleep(wait)

    # -- fetch ---------------------------------------------------------------
    async def fetch(self, url: str, locale: str | None = None, wait_ms: int = 1500) -> Fetched:
        self.check_policy(url)
        domain = domain_of(url)
        robots = await self.robots_allowed(url)
        if robots is False and self.robots_mode == "enforce":
            raise NotAllowed(f"{domain}/robots.txt disallows this path (HANDS_ROBOTS=enforce).")
        async with self._lock:
            await self._wait_for_budget(domain)
            ctx = await self._context(locale or self.default_locale)
            page = await ctx.new_page()
            try:
                resp = await page.goto(url, wait_until="domcontentloaded", timeout=45_000)
                await page.wait_for_timeout(wait_ms)
                html = await page.content()
                title = await page.title()
                final_url = page.url
                status = resp.status if resp else None
            finally:
                await page.close()
            now = time.time()
            s = self._state(domain)
            s.last = now
            s.recent.append(now)
            self._global_recent.append(now)
            self.pages_total += 1
            if self.dump_dir:
                os.makedirs(self.dump_dir, exist_ok=True)
                name = f"{int(now)}_{domain}_{hashlib.md5(url.encode()).hexdigest()[:8]}.html"
                with open(os.path.join(self.dump_dir, name), "w", encoding="utf-8") as f:
                    f.write(html)
            reason = detect_block(status, html, title)
            if reason:
                s.blocks += 1
                s.cooldown_until = now + self.budget.cooldown_hours * 3600
                raise Blocked(
                    f"{domain} answered with {reason}. Stopped; cooling down {self.budget.cooldown_hours:g} h. "
                    f"Hands does not try to bypass blocks."
                )
            return Fetched(url=url, final_url=final_url, status=status, title=title, html=html,
                           fetched_at=now, robots_allowed=robots)
