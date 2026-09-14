"""HttpFetcher, offline: every request goes through httpx.MockTransport."""

import httpx
import pytest

from hands.fetch import (
    RETRY_BACKOFF_S,
    BrowserFetcher,
    FetchError,
    HttpFetcher,
    title_of,
)


class Clock:
    def __init__(self, t=1_000_000.0):
        self.t = t

    def __call__(self):
        return self.t


class Sleeper:
    def __init__(self):
        self.calls = []

    async def __call__(self, s):
        self.calls.append(s)


def make(handler, **kw):
    """A fetcher wired to a mock transport; returns (fetcher, calls list)."""
    calls = []

    async def wrapped(request: httpx.Request):
        calls.append(request)
        return await handler(request) if callable(handler) and _is_coro(handler) else handler(request)

    f = HttpFetcher(transport=httpx.MockTransport(wrapped), cache_ttl_s=kw.pop("cache_ttl_s", 0), **kw)
    return f, calls


def _is_coro(fn):
    import inspect
    return inspect.iscoroutinefunction(fn)


PAGE = b"<html><head><title>  Blue &amp; Green\n Widget </title></head><body>hi</body></html>"


async def test_sends_honest_headers():
    f, calls = make(lambda r: httpx.Response(200, content=PAGE))
    await f.fetch("https://shop.example/p/1")
    h = calls[0].headers
    assert h["user-agent"].startswith("Hands/0.3 (+https://")
    assert "personal price monitor" in h["user-agent"]
    assert h["accept"].startswith("text/html")
    assert h["accept-language"] == "en-US"
    assert h["accept-encoding"] == "gzip, br"


async def test_locale_goes_into_accept_language():
    f, calls = make(lambda r: httpx.Response(200, content=PAGE), locale="es-ES")
    await f.fetch("https://shop.example/")
    assert calls[0].headers["accept-language"] == "es-ES,en;q=0.5"
    await f.fetch("https://shop.example/x", locale="fr-FR")
    assert calls[1].headers["accept-language"] == "fr-FR,en;q=0.5"


async def test_title_is_extracted_and_cleaned():
    f, _ = make(lambda r: httpx.Response(200, content=PAGE))
    r = await f.fetch("https://shop.example/")
    assert r.title == "Blue & Green Widget"
    assert title_of("") == ""
    assert title_of("<html><body>no title</body></html>") == ""


async def test_retries_on_network_error_then_succeeds():
    n = {"i": 0}

    def handler(r):
        n["i"] += 1
        if n["i"] < 3:
            raise httpx.ConnectError("refused", request=r)
        return httpx.Response(200, content=PAGE)

    sleeper = Sleeper()
    f, calls = make(handler, sleep=sleeper)
    r = await f.fetch("https://shop.example/")
    assert r.status == 200 and r.tries == 3
    assert len(calls) == 3
    assert sleeper.calls == list(RETRY_BACKOFF_S)


async def test_gives_up_after_retries():
    def handler(r):
        raise httpx.ReadTimeout("slow", request=r)

    f, calls = make(handler, sleep=Sleeper())
    with pytest.raises(FetchError) as ei:
        await f.fetch("https://shop.example/")
    assert "ReadTimeout" in str(ei.value)
    assert len(calls) == 1 + len(RETRY_BACKOFF_S)


@pytest.mark.parametrize("status", [403, 429, 500, 503])
async def test_server_answers_are_not_retried(status):
    # A 4xx/5xx is the site's answer. Retrying it is what impolite bots do.
    sleeper = Sleeper()
    f, calls = make(lambda r: httpx.Response(status, content=b"<title>Nope</title>"), sleep=sleeper)
    r = await f.fetch("https://shop.example/")
    assert r.status == status and r.tries == 1
    assert len(calls) == 1 and sleeper.calls == []


async def test_body_is_cut_at_limit():
    big = b"<title>Big</title>" + b"x" * 10_000
    f, _ = make(lambda r: httpx.Response(200, content=big), max_bytes=1000)
    r = await f.fetch("https://shop.example/")
    assert r.truncated is True
    assert len(r.html) <= 1000


async def test_small_body_is_not_marked_truncated():
    f, _ = make(lambda r: httpx.Response(200, content=PAGE), max_bytes=1000)
    r = await f.fetch("https://shop.example/")
    assert r.truncated is False


async def test_cache_hit_skips_network_within_ttl():
    clock = Clock()
    f, calls = make(lambda r: httpx.Response(200, content=PAGE), cache_ttl_s=600, clock=clock)
    a = await f.fetch("https://shop.example/p/1")
    b = await f.fetch("https://shop.example/p/1")
    assert len(calls) == 1
    assert a.from_cache is False and b.from_cache is True
    assert b.html == a.html
    # cached() is the peek policy uses; it must not fetch either
    assert f.cached("https://shop.example/p/1").from_cache is True
    assert f.cached("https://shop.example/other") is None


async def test_cache_expires_after_ttl():
    clock = Clock()
    f, calls = make(lambda r: httpx.Response(200, content=PAGE), cache_ttl_s=600, clock=clock)
    await f.fetch("https://shop.example/p/1")
    clock.t += 601
    r = await f.fetch("https://shop.example/p/1")
    assert len(calls) == 2 and r.from_cache is False


async def test_cache_is_found_under_the_requested_url_after_a_redirect():
    def handler(r):
        if r.url.path == "/old":
            return httpx.Response(301, headers={"location": "https://shop.example/new"})
        return httpx.Response(200, content=PAGE)

    f, calls = make(handler, cache_ttl_s=600)
    a = await f.fetch("https://shop.example/old")
    assert a.final_url == "https://shop.example/new"
    b = await f.fetch("https://shop.example/old")
    assert b.from_cache is True
    assert f.cached("https://shop.example/new") is not None
    # one redirect hop + one page on the first call, nothing on the second
    assert len(calls) == 2


async def test_headers_are_lowercased():
    f, _ = make(lambda r: httpx.Response(200, content=PAGE, headers={"X-ShopId": "42", "Content-Type": "text/html"}))
    r = await f.fetch("https://shop.example/")
    assert r.headers["x-shopid"] == "42"
    assert "X-ShopId" not in r.headers


async def test_charset_from_content_type_is_honoured():
    body = "<title>Café</title>".encode("latin-1")
    f, _ = make(lambda r: httpx.Response(200, content=body, headers={"content-type": "text/html; charset=iso-8859-1"}))
    r = await f.fetch("https://shop.example/")
    assert r.title == "Café"


def test_browser_fetcher_is_a_stub():
    with pytest.raises(NotImplementedError):
        BrowserFetcher()
