import asyncio
import http.server
import json
import threading

import pytest

from core.agent.browser import (BrowserConfig, FetchError, NavigationBlocked, StealthBrowser, UrlPolicy, html_to_markdown)

ARTICLE = """<!doctype html><html><head><title>Quantum Notes</title><meta name="description" content="About qubits">
<style>.x{color:red}</style><script>var tracking = 1;</script></head><body>
<header><a href="/">Home</a> <a href="/a">About</a></header>
<nav><ul><li><a href="/1">One</a></li><li><a href="/2">Two</a></li><li><a href="/3">Three</a></li></ul></nav>
<div class="cookie-banner">We use cookies. Accept?</div>
<main><article><h1>Qubits explained</h1>
<p>A <strong>qubit</strong> is a two-level system; see <a href="/wiki/qubit#x">the wiki</a> and <em>more</em>.</p>
<h2>Properties</h2><ul><li>Superposition</li><li>Entanglement<ul><li>Bell pairs</li></ul></li></ul>
<ol><li>Prepare</li><li>Measure</li></ol>
<table><tr><th>Gate</th><th>Effect</th></tr><tr><td>X</td><td>bit flip</td></tr></table>
<pre><code>H = 1/sqrt(2)
    [[1, 1],
     [1, -1]]</code></pre>
<blockquote>Nature is quantum.</blockquote>
<p style="display:none">HIDDEN TEXT</p><p aria-hidden="true">ARIA HIDDEN</p>
<p>Unclosed paragraph<p>Second paragraph with enough words to matter for the reducer test.
</article></main><aside>Related: ads ads ads</aside><footer>Copyright</footer></body></html>"""


def test_markdown_reduction():
    r = html_to_markdown(ARTICLE, "https://ex.org/base/", max_chars=10_000)
    md = r["markdown"]
    assert r["title"] == "Quantum Notes" and r["description"] == "About qubits"
    assert md.startswith("# Qubits explained")
    assert "**qubit**" in md and "[the wiki](https://ex.org/wiki/qubit)" in md and "*more*" in md
    assert "## Properties" in md and "- Superposition" in md and "  - Bell pairs" in md and "1. Prepare" in md and "2. Measure" in md
    assert "| Gate | Effect |" in md and "|---|---|" in md and "| X | bit flip |" in md
    assert "```\nH = 1/sqrt(2)\n    [[1, 1],\n     [1, -1]]\n```" in md
    assert "> Nature is quantum." in md
    assert "Unclosed paragraph" in md and "Second paragraph" in md
    for noise in ("HIDDEN TEXT", "ARIA HIDDEN", "cookies", "tracking", "Copyright", "Related", "Home", "color:red"):
        assert noise not in md
    assert "https://ex.org/wiki/qubit" in r["links"]


def test_no_main_drops_menus_and_dedupes():
    html = ("<html><body><div><ul>" + "".join(f'<li><a href="/{i}">Item {i}</a></li>' for i in range(5)) + "</ul>"
            "<p>Real content paragraph one.</p>" + "<p>Repeat line</p>" * 5 + "</div></body></html>")
    md = html_to_markdown(html, "https://e.org")["markdown"]
    assert "Item 1" not in md and "Real content" in md and md.count("Repeat line") == 2


def test_truncation_and_garbage():
    html = "<p>" + ("word " * 100 + "</p><p>") * 40
    r = html_to_markdown(html, "", max_chars=1000)
    assert r["truncated"] and len(r["markdown"]) <= 1020 and r["markdown"].endswith("…[truncated]")
    assert html_to_markdown("<div><<<>>>&&& <p", "")["markdown"] is not None
    assert html_to_markdown("", "")["markdown"] == ""


async def test_url_policy():
    pol = UrlPolicy()
    for bad in ("file:///etc/passwd", "ftp://x.org", "http://127.0.0.1/", "http://localhost:8080", "http://169.254.169.254/latest",
                "http://10.0.0.5/", "http://[::1]/", "https://user:pw@example.org/", "http://metadata.google.internal/"):
        with pytest.raises(NavigationBlocked):
            await pol.check(bad)
    await pol.check("https://93.184.216.34/")
    assert UrlPolicy.normalise("example.org/a#frag") == "https://example.org/a"
    await UrlPolicy(allow_private=True).check("http://127.0.0.1:1/")


# ---------------------------------------------------------------- live browser tests against a local server
DYNAMIC = """<!doctype html><html><head><title>Dynamic</title></head><body><main><div id="root">loading…</div></main>
<script>
const root = document.getElementById('root');
let n = 0;
const iv = setInterval(() => { n++; if (n === 1) root.textContent = '';
  const p = document.createElement('p'); p.textContent = 'Streamed paragraph number ' + n + ' with sufficient text to be counted as content by the reducer.';
  root.appendChild(p); if (n >= 6) clearInterval(iv); }, 350);
</script></body></html>"""
PROBE = """<!doctype html><html><head><title>Probe</title></head><body><main><p id="o">pending</p>
<script>document.getElementById('o').textContent = 'webdriver=' + String(navigator.webdriver) + ' plugins=' + navigator.plugins.length +
 ' chrome=' + (typeof window.chrome) + ' lang=' + navigator.languages.join(',') + ' ua=' + navigator.userAgent;</script>
<p>This paragraph pads the page so that it exceeds the minimum useful content threshold used by the ingestion matrix pipeline.</p></main></body></html>"""


class Handler(http.server.BaseHTTPRequestHandler):
    seen_headers: list = []

    def log_message(self, *a): pass

    def do_GET(self):
        Handler.seen_headers.append(dict(self.headers))
        routes = {"/article": ("text/html", ARTICLE), "/dynamic": ("text/html", DYNAMIC), "/probe": ("text/html", PROBE)}
        if self.path == "/slow":
            import time; time.sleep(5)
        if self.path == "/pdf":
            body, ctype, code = b"%PDF-1.4", "application/pdf", 200
        elif self.path in routes:
            ctype, text = routes[self.path]; body, code = text.encode(), 200
        elif self.path == "/redirect":
            self.send_response(302); self.send_header("Location", "/article"); self.end_headers(); return
        else:
            body, ctype, code = b"nope", "text/plain", 404
        self.send_response(code); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(body)))
        self.end_headers(); self.wfile.write(body)


@pytest.fixture(scope="module")
def server():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


def cfg(**kw):
    base = dict(allow_private_hosts=True, settle_quiet_ms=500, settle_max_ms=6000, hard_timeout_s=20, seed=1)
    base.update(kw)
    return BrowserConfig(**base)


async def test_fetch_static_article(server):
    async with StealthBrowser(cfg()) as b:
        r = await b.fetch(server + "/article")
        assert r.status == 200 and r.title == "Quantum Notes" and "## Properties" in r.markdown and "cookies" not in r.markdown
        assert (await b.fetch(server + "/redirect")).final_url.endswith("/article")
        assert b.open_contexts == 0


async def test_waits_for_dom_mutations_not_fixed_sleep(server):
    async with StealthBrowser(cfg()) as b:
        r = await b.fetch(server + "/dynamic")
    assert "Streamed paragraph number 6" in r.markdown and "loading" not in r.markdown
    assert r.settle["reason"] == "quiet" and 1500 < r.settle["waitedMs"] < 5000


async def test_stealth_and_headers(server):
    Handler.seen_headers.clear()
    async with StealthBrowser(cfg()) as b:
        r = await b.fetch(server + "/probe")
    assert "webdriver=undefined" in r.markdown and "plugins=3" in r.markdown and "chrome=object" in r.markdown
    assert "HeadlessChrome" not in r.markdown and "lang=en-US,en" in r.markdown
    h = {k.lower(): v for k, v in Handler.seen_headers[-1].items()}
    assert h["accept-language"].startswith("en-US") and "sec-ch-ua" in h and h["sec-fetch-mode"] == "navigate"
    assert "Chrome/" in h["user-agent"] and "Headless" not in h["user-agent"] and h["dnt"] == "1"


async def test_errors_never_leak_contexts(server):
    async with StealthBrowser(cfg(hard_timeout_s=2)) as b:
        with pytest.raises(FetchError) as e:
            await b.fetch(server + "/missing")
        assert e.value.status == 404 and b.open_contexts == 0
        with pytest.raises(FetchError):
            await b.fetch(server + "/pdf")
        with pytest.raises(FetchError, match="timeout"):
            await b.fetch(server + "/slow")
        with pytest.raises(FetchError):
            await b.fetch("http://127.0.0.1:1/")
        assert b.open_contexts == 0
        ok = await b.fetch(server + "/article")           # browser still healthy afterwards
        assert ok.status == 200


async def test_cancellation_closes_context(server):
    async with StealthBrowser(cfg()) as b:
        t = asyncio.create_task(b.fetch(server + "/slow"))
        await asyncio.sleep(1.0)
        assert b.open_contexts == 1
        t.cancel()
        with pytest.raises((asyncio.CancelledError, FetchError)):
            await t
        await asyncio.sleep(0.5)
        assert b.open_contexts == 0


async def test_ssrf_blocked_by_default(server):
    async with StealthBrowser(BrowserConfig(seed=1)) as b:
        with pytest.raises(NavigationBlocked):
            await b.fetch(server + "/article")
        assert await b.ingest([], [server + "/article"], max_pages=2) == []


async def test_concurrency_recycle_and_relaunch(server):
    async with StealthBrowser(cfg(max_concurrency=2, recycle_after_contexts=3)) as b:
        rs = await asyncio.gather(*(b.fetch(server + "/article") for _ in range(6)))
        assert all(r.status == 200 for r in rs) and b.open_contexts == 0
        await b.fetch(server + "/article")
        assert b.launches >= 2                              # recycled after 3 contexts when idle
        await b._browser.close()                            # simulate a crashed browser
        assert (await b.fetch(server + "/probe")).status == 200


async def test_ingest_urls_returns_webdocs(server):
    async with StealthBrowser(cfg()) as b:
        docs = await b.ingest([], [server + "/article", server + "/missing", server + "/dynamic"], max_pages=3)
    assert {d["url"].split("/")[-1] for d in docs} == {"article", "dynamic"}
    assert docs[0]["text"].startswith("# Qubits explained") or docs[0]["text"].startswith("# Quantum Notes")


def test_search_result_decoding():
    d = StealthBrowser._decode_result
    assert d("https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fa%3Fb%3D1&rut=x") == "https://example.org/a?b=1"
    assert d("https://duckduckgo.com/y.js?ad=1") is None
    assert d("https://example.org/x") == "https://example.org/x"
    assert d("javascript:alert(1)") is None
