"""
Integration, still offline: the real server as a subprocess (the way the
Dockerfile runs it), a local http.server handing out the fixtures, and the
real MCP client talking to /mcp over HTTP.
"""

import http.server
import json
import os
import socket
import subprocess
import sys
import threading
import time

import httpx
import pytest

from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURES = os.path.join(ROOT, "tests", "fixtures")
TOKEN = "test-token-0123456789abcdef"


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def fixtures_server():
    port = free_port()
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=FIXTURES, **k)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{port}"
    httpd.shutdown()


@pytest.fixture(scope="module")
def hands_server(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("hands")
    port = free_port()
    env = {
        **os.environ,
        "HANDS_TOKEN": TOKEN,
        "HANDS_HOST": "127.0.0.1",
        "HANDS_PORT": str(port),
        "HANDS_MIN_GAP": "0",
        "HANDS_ROBOTS": "warn",
        "HANDS_DB": str(tmp / "hands.db"),
        "HANDS_RECIPES_DIR": str(tmp / "recipes"),
        "HANDS_CACHE_TTL": "600",
    }
    proc = subprocess.Popen([sys.executable, "-m", "hands.server"], cwd=ROOT, env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    base = f"http://127.0.0.1:{port}"
    deadline = time.time() + 20
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError("server exited early:\n" + proc.stdout.read())
        try:
            if httpx.get(base + "/health", timeout=1).status_code == 200:
                break
        except httpx.HTTPError:
            time.sleep(0.2)
    else:
        proc.kill()
        raise RuntimeError("server did not come up:\n" + proc.stdout.read())
    yield base
    proc.terminate()
    try:
        proc.wait(5)
    except subprocess.TimeoutExpired:
        proc.kill()


def mcp_client(base: str):
    http_client = httpx.AsyncClient(headers={"Authorization": f"Bearer {TOKEN}"}, timeout=30)
    return streamable_http_client(base + "/mcp", http_client=http_client)


async def call(_base: str, _tool: str, **args) -> dict:
    """Call one tool and hand back its dict. Tools return a plain dict, which
    the SDK ships as a JSON text block; structured_content is only filled for
    typed schemas, so read the text."""
    async with mcp_client(_base) as (read, write, *_):
        async with ClientSession(read, write) as s:
            await s.initialize()
            r = await s.call_tool(_tool, args)
            assert not r.is_error, r
            if r.structured_content is not None:
                return r.structured_content
            text = next(c.text for c in r.content if getattr(c, "type", "") == "text")
            return json.loads(text)


# --- the checks the spec lists ------------------------------------------------
def test_health_needs_no_token(hands_server):
    r = httpx.get(hands_server + "/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True and body["version"].startswith("0.3")
    assert body["robots_mode"] == "warn"


def test_mcp_without_token_is_401(hands_server):
    r = httpx.post(hands_server + "/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    assert r.status_code == 401
    r = httpx.post(hands_server + "/mcp", json={}, headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 401


async def test_tools_list(hands_server):
    async with mcp_client(hands_server) as (read, write, *_):
        async with ClientSession(read, write) as s:
            init = await s.initialize()
            assert "Hands" in init.server_info.name
            assert "never fetch shop pages with your own fetch tool" in (init.instructions or "")
            tools = {t.name for t in (await s.list_tools()).tools}
    assert tools == {
        "product", "products", "read", "extract", "save_recipe", "list_recipes",
        "watch_add", "watch_list", "watch_remove", "watch_check", "status",
    }


async def test_product_from_local_fixture(hands_server, fixtures_server):
    r = await call(hands_server, "product", url=fixtures_server + "/jsonld_single.html")
    assert r["ok"] is True
    assert r["meta"]["source"] == "jsonld"
    p = r["product"]
    assert p["name"] == "Blue Widget" and p["price"] == {"amount": 29.99, "currency": "USD"}
    assert p["availability"] == "InStock" and p["source"] == "jsonld"
    assert r["meta"]["status"] == 200
    assert r["meta"]["robots_allowed"] is True      # no robots.txt on the fixture server


async def test_products_batch_mixes_outcomes(hands_server, fixtures_server):
    urls = [
        fixtures_server + "/jsonld_graph.html",
        fixtures_server + "/microdata.html",
        fixtures_server + "/nothing.html",
        fixtures_server + "/spa_shell.html",
        "ftp://nope.example/x",
    ]
    r = await call(hands_server, "products", urls=urls)
    assert r["count"] == 5 and r["ok"] is False        # the ftp one fails
    res = r["results"]
    assert res[0]["product"]["name"] == "Evadict TR2" and res[0]["meta"]["source"] == "jsonld"
    assert res[1]["product"]["name"] == "Desk Lamp" and res[1]["meta"]["source"] == "microdata"
    assert res[2]["ok"] and res[2]["product"] is None and res[2]["meta"]["source"] == "none"
    assert res[3]["ok"] and res[3]["meta"]["needs_browser"] is True
    assert res[4]["ok"] is False and res[4]["error"] == "NotAllowed"
    assert "domains" in r["status"]


async def test_products_rejects_bad_input(hands_server):
    r = await call(hands_server, "products", urls=[])
    assert r["ok"] is False and r["error"] == "BadInput"
    r = await call(hands_server, "products", urls=["https://x.example/"] * 21)
    assert r["error"] == "BadInput" and "20" in r["message"]


async def test_second_read_comes_from_cache(hands_server, fixtures_server):
    # A url no other test in this module has touched; the server (and its
    # cache) lives for the whole module.
    url = fixtures_server + "/og_title_only.html"
    a = await call(hands_server, "read", url=url)
    b = await call(hands_server, "read", url=url)
    assert a["ok"] and "real page" in a["text"]
    assert a["from_cache"] is False and b["from_cache"] is True


async def test_block_is_reported_not_retried(hands_server, fixtures_server):
    # 404 from the fixture server is not a block; a challenge title is.
    r = await call(hands_server, "product", url=fixtures_server + "/does-not-exist.html")
    assert r["ok"] is True and r["meta"]["status"] == 404 and r["product"] is None


async def test_recipes_and_extract(hands_server, fixtures_server):
    schema = {"items": 'div[itemtype$="/Product"]',
              "fields": {"name": "[itemprop=name]", "price": {"css": "[itemprop=price]", "type": "price"}}}
    r = await call(hands_server, "save_recipe", name="lamp", schema=schema)
    assert r["ok"]
    r = await call(hands_server, "list_recipes")
    assert [x["name"] for x in r["recipes"]] == ["lamp"]
    r = await call(hands_server, "extract", url=fixtures_server + "/microdata.html", recipe="lamp")
    assert r["ok"] and r["count"] == 1
    # extract() keeps v0.2's raw text (inner whitespace and all); only the
    # structured path normalises.
    assert " ".join(r["records"][0]["name"].split()) == "Desk Lamp"
    assert r["records"][0]["price"]["amount"] == 24.5


async def test_watch_round_trip(hands_server, fixtures_server):
    url = fixtures_server + "/jsonld_comma_price.html"
    r = await call(hands_server, "watch_add", url=url, target_price=40.0, title="Rioja")
    assert r["ok"]
    r = await call(hands_server, "watch_check")
    assert r["ok"] is True and r["stopped"] is None
    item = next(i for i in r["items"] if i["url"] == url)
    assert item["price"] == 38.9 and item["currency"] == "EUR"
    assert item["at_or_below_target"] is True
    r = await call(hands_server, "watch_list")
    assert any(i["url"] == url and i["last_price"] == 38.9 for i in r["items"])
    r = await call(hands_server, "watch_remove", url=url)
    assert r["removed"] is True


async def test_status_names_the_user_agent(hands_server):
    r = await call(hands_server, "status")
    assert r["ok"] and r["user_agent"].startswith("Hands/0.3 (+")
