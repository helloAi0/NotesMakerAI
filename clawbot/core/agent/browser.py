"""Headless ingestion matrix: stealth Chromium + mutation-driven waiting + markdown reduction.

* ``StealthBrowser`` launches Playwright Chromium with anti-automation hardening, realistic
  client headers and a consistent fingerprint, and never leaks a browser context: every context
  is closed in ``finally`` (shielded against cancellation), tracked, bounded by a semaphore and
  a hard per-fetch deadline, and the browser process itself is recycled periodically and
  relaunched if it dies.
* Dynamic pages are awaited with an in-page ``MutationObserver`` (DOM quiescence), not a fixed sleep.
* ``html_to_markdown`` strips scripts, navigation, ads, cookie banners and hidden nodes and emits
  compact structured Markdown (headings, lists, tables, code, links).
* Agent-supplied URLs are SSRF-guarded: only public http(s) hosts are fetched, including every
  sub-request and redirect target.
"""
from __future__ import annotations

import asyncio
import ipaddress
import logging
import random
import re
import socket
import time
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Any, Sequence
from urllib.parse import parse_qs, quote_plus, unquote, urljoin, urlparse, urldefrag

from playwright.async_api import Browser, BrowserContext, Error as PlaywrightError, Playwright, Route, async_playwright

from core.agent.executor import WebDoc

log = logging.getLogger("clawbot.browser")


# --------------------------------------------------------------------------- errors
class BrowserError(Exception):
    """Base class for ingestion failures."""


class NavigationBlocked(BrowserError):
    """URL rejected by the SSRF / scheme policy."""


class FetchError(BrowserError):
    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


# --------------------------------------------------------------------------- fingerprints
@dataclass(frozen=True)
class Fingerprint:
    user_agent: str
    sec_ch_ua: str
    platform: str            # navigator.platform
    ch_platform: str         # Sec-CH-UA-Platform
    webgl_vendor: str
    webgl_renderer: str


FINGERPRINTS: tuple[Fingerprint, ...] = (
    Fingerprint("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"', "Win32", '"Windows"',
                "Google Inc. (NVIDIA)", "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)"),
    Fingerprint("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
                '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"', "MacIntel", '"macOS"',
                "Google Inc. (Apple)", "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)"),
    Fingerprint("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"', "Linux x86_64", '"Linux"',
                "Google Inc. (Intel)", "ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)"),
)

LAUNCH_ARGS = [
    "--disable-blink-features=AutomationControlled", "--disable-infobars", "--no-first-run", "--no-default-browser-check",
    "--disable-dev-shm-usage", "--disable-background-networking", "--disable-component-update", "--disable-sync",
    "--mute-audio", "--hide-scrollbars", "--disable-features=Translate,MediaRouter,OptimizationHints",
]

STEALTH_JS = r"""
(() => {
  const FP = __FP__;
  const def = (o, k, g) => { try { Object.defineProperty(o, k, { get: g, configurable: true }); } catch (_) {} };
  def(Navigator.prototype, 'webdriver', () => undefined);
  def(Navigator.prototype, 'languages', () => ['en-US', 'en']);
  def(Navigator.prototype, 'platform', () => FP.platform);
  def(Navigator.prototype, 'hardwareConcurrency', () => 8);
  def(Navigator.prototype, 'deviceMemory', () => 8);
  def(Navigator.prototype, 'plugins', () => { const a = [{name:'PDF Viewer'},{name:'Chrome PDF Viewer'},{name:'Chromium PDF Viewer'}]; a.item = i => a[i]; a.namedItem = n => a.find(p => p.name === n) || null; a.refresh = () => {}; return a; });
  if (!window.chrome) window.chrome = {};
  if (!window.chrome.runtime) window.chrome.runtime = {};
  if (!window.chrome.app) window.chrome.app = { isInstalled: false };
  try {
    const q = window.navigator.permissions && window.navigator.permissions.query;
    if (q) window.navigator.permissions.query = p => (p && p.name === 'notifications') ? Promise.resolve({ state: Notification.permission, onchange: null }) : q.call(window.navigator.permissions, p);
  } catch (_) {}
  const patchGL = (proto) => {
    if (!proto || !proto.getParameter) return;
    const orig = proto.getParameter;
    proto.getParameter = function (p) { if (p === 37445) return FP.webglVendor; if (p === 37446) return FP.webglRenderer; return orig.call(this, p); };
  };
  patchGL(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
  patchGL(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
  try { Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth }); Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight + 85 }); } catch (_) {}
})();
"""

# Resolves when the DOM has been quiet for `quietMs` (and an optional selector exists), or after `maxMs`.
SETTLE_JS = r"""
({ quietMs, maxMs, selector }) => new Promise((resolve) => {
  const start = performance.now();
  let last = start, resolved = false;
  const textLen = () => (document.body ? document.body.innerText.length : 0);
  const obs = new MutationObserver(() => { last = performance.now(); });
  obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  const finish = (reason) => {
    if (resolved) return; resolved = true; obs.disconnect(); clearInterval(iv);
    resolve({ reason, waitedMs: Math.round(performance.now() - start), textLength: textLen() });
  };
  const iv = setInterval(() => {
    const now = performance.now();
    if (now - start >= maxMs) return finish('max');
    const selOk = !selector || !!document.querySelector(selector);
    const loaded = document.readyState !== 'loading';
    if (loaded && selOk && now - last >= quietMs && (textLen() > 0 || now - start >= quietMs * 4)) finish(selector ? 'selector+quiet' : 'quiet');
  }, 40);
});
"""


# --------------------------------------------------------------------------- config / results
@dataclass(frozen=True)
class BrowserConfig:
    headless: bool = True
    executable_path: str | None = None
    proxy: str | None = None
    max_concurrency: int = 3
    nav_timeout_ms: int = 30_000
    hard_timeout_s: float = 60.0
    settle_quiet_ms: int = 450
    settle_max_ms: int = 9_000
    block_resource_types: tuple[str, ...] = ("image", "media", "font")
    max_html_bytes: int = 4_000_000
    max_markdown_chars: int = 40_000
    min_useful_chars: int = 200
    recycle_after_contexts: int = 50
    locale: str = "en-US"
    timezone_id: str = "Asia/Kolkata"
    allow_private_hosts: bool = False       # tests / intranet crawling only
    search_engines: tuple[str, ...] = ("duckduckgo", "bing")
    seed: int | None = None


@dataclass
class PageResult:
    url: str
    final_url: str
    status: int
    title: str
    description: str
    markdown: str
    links: list[str] = field(default_factory=list)
    truncated: bool = False
    settle: dict[str, Any] = field(default_factory=dict)
    fetched_at: float = field(default_factory=time.time)


# --------------------------------------------------------------------------- SSRF policy
def _ip_public(ip: str) -> bool:
    try:
        return ipaddress.ip_address(ip.split("%")[0]).is_global
    except ValueError:
        return False


class UrlPolicy:
    def __init__(self, allow_private: bool = False) -> None:
        self.allow_private = allow_private
        self._cache: dict[str, bool] = {}

    @staticmethod
    def normalise(url: str) -> str:
        url = url.strip()
        if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", url):
            url = "https://" + url
        return urldefrag(url)[0]

    async def check(self, url: str) -> None:
        p = urlparse(url)
        if p.scheme not in ("http", "https"):
            raise NavigationBlocked(f"scheme {p.scheme!r} not allowed")
        host = p.hostname
        if not host:
            raise NavigationBlocked("URL has no host")
        if p.username or p.password:
            raise NavigationBlocked("credentials in URL not allowed")
        if self.allow_private:
            return
        ok = self._cache.get(host)
        if ok is None:
            ok = await self._host_public(host)
            if len(self._cache) > 4096:
                self._cache.clear()
            self._cache[host] = ok
        if not ok:
            raise NavigationBlocked(f"host {host!r} resolves to a non-public address")

    @staticmethod
    async def _host_public(host: str) -> bool:
        if host.lower() in ("localhost", "metadata.google.internal") or host.lower().endswith((".local", ".internal", ".localhost")):
            return False
        try:
            ipaddress.ip_address(host)
            return _ip_public(host)
        except ValueError:
            pass
        try:
            infos = await asyncio.get_running_loop().getaddrinfo(host, None, type=socket.SOCK_STREAM)
        except OSError:
            return True          # unresolved: let the browser surface the DNS error; nothing private was reached
        return bool(infos) and all(_ip_public(i[4][0]) for i in infos)


# --------------------------------------------------------------------------- HTML -> Markdown
_VOID = frozenset("area base br col embed hr img input link meta param source track wbr".split())
_SKIP = frozenset("script style noscript template svg canvas iframe object embed nav footer aside form dialog select "
                  "textarea button head audio video map picture".split())
_BLOCK = frozenset("p div section article main header li ul ol table tr blockquote pre figure figcaption details summary "
                   "h1 h2 h3 h4 h5 h6 dl dt dd hr body".split())
_NOISE_ATTR = re.compile(r"(^|[\s_-])(cookie|cookies|consent|gdpr|banner|advert|advertisement|ads?|adsbygoogle|sidebar|popup|modal|"
                         r"newsletter|subscribe|social|share|sharing|breadcrumbs?|promo|paywall|toolbar|skip-link)([\s_-]|$)", re.I)
_HIDDEN_STYLE = re.compile(r"(display\s*:\s*none|visibility\s*:\s*hidden)", re.I)


class _MarkdownParser(HTMLParser):
    def __init__(self, base_url: str, focus: bool) -> None:
        super().__init__(convert_charrefs=True)
        self.base = base_url
        self.focus = focus
        self.stack: list[str] = []
        self.skip_at: int | None = None            # stack depth where a skipped subtree began
        self.focus_depth = 0
        self.segs: list[tuple[str, str]] = []       # ('text'|'raw', value)
        self.title = ""
        self.description = ""
        self.links: list[str] = []
        self._in_title = False
        self._href: list[str | None] = []
        self._list: list[list[Any]] = []            # [ordered?, counter]
        self._pre = False
        self._pre_buf: list[str] = []
        self._bq = 0
        self._table: list[list[str]] | None = None
        self._cell: list[str] | None = None
        self._row: list[str] | None = None

    # --- helpers
    def _active(self) -> bool:
        return self.skip_at is None and (not self.focus or self.focus_depth > 0)

    def _emit(self, s: str) -> None:
        if self._cell is not None:
            self._cell.append(s)
        else:
            self.segs.append(("text", s))

    def _brk(self, n: int = 2) -> None:
        if self._cell is None:
            self.segs.append(("text", "\n" * n))

    # --- tag events
    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k: (v or "") for k, v in attrs}
        if tag == "meta":
            nm = (a.get("name") or a.get("property") or "").lower()
            if nm in ("description", "og:description") and not self.description:
                self.description = a.get("content", "").strip()
            if nm == "og:title" and not self.title:
                self.title = a.get("content", "").strip()
            return
        if tag in _VOID:
            if tag == "br" and self._active():
                if self._cell is not None:
                    self._cell.append(" ")
                else:
                    self._brk(1)
            elif tag == "hr" and self._active():
                self._brk(2)
                self.segs.append(("text", "---"))
                self._brk(2)
            return
        self.stack.append(tag)
        depth = len(self.stack)
        if tag == "title":
            self._in_title = True
        if self.skip_at is None:
            hidden = ("hidden" in a or a.get("aria-hidden") == "true" or _HIDDEN_STYLE.search(a.get("style", "")) is not None
                      or a.get("type") == "hidden")
            noisy = tag not in ("html", "body", "main", "article") and _NOISE_ATTR.search(f"{a.get('class', '')} {a.get('id', '')}") is not None
            role_skip = a.get("role") in ("navigation", "banner", "complementary", "contentinfo", "search", "dialog", "alert")
            header_skip = tag == "header" and not any(t in ("article", "main") for t in self.stack[:-1])
            if tag in _SKIP or hidden or noisy or role_skip or header_skip:
                self.skip_at = depth
                return
        if self.skip_at is not None:
            return
        if self.focus and tag in ("main", "article"):
            self.focus_depth += 1
        if not self._active():
            return
        if tag in _BLOCK:
            self._brk(1 if tag in ("li", "tr", "dt", "dd") else 2)
        if re.fullmatch(r"h[1-6]", tag):
            self.segs.append(("text", "#" * int(tag[1]) + " "))
        elif tag in ("ul", "ol"):
            self._list.append([tag == "ol", 0])
        elif tag == "li":
            if self._list:
                lst = self._list[-1]
                lst[1] += 1
                self.segs.append(("text", "  " * (len(self._list) - 1) + (f"{lst[1]}. " if lst[0] else "- ")))
            else:
                self.segs.append(("text", "- "))
        elif tag == "blockquote":
            self._bq += 1
            self.segs.append(("text", "> "))
        elif tag == "pre":
            self._pre, self._pre_buf = True, []
        elif tag in ("strong", "b"):
            self._emit("**")
        elif tag in ("em", "i"):
            self._emit("*")
        elif tag == "code" and not self._pre:
            self._emit("`")
        elif tag == "a":
            href = a.get("href", "").strip()
            full = None
            if href and not href.startswith(("#", "javascript:", "mailto:", "tel:", "data:")):
                full = urldefrag(urljoin(self.base, href))[0]
                if not full.startswith(("http://", "https://")):
                    full = None
            self._href.append(full)
            if full:
                self._emit("[")
        elif tag == "table":
            self._table = []
        elif tag == "tr" and self._table is not None:
            self._row = []
        elif tag in ("td", "th") and self._table is not None:
            self._cell = []

    def handle_endtag(self, tag: str) -> None:
        if tag in _VOID:
            return
        if tag not in self.stack:
            return
        # pop to the matching open tag (tolerates unclosed <p>/<li>)
        while self.stack:
            top = self.stack.pop()
            depth_after = len(self.stack)
            self._close(top, depth_after + 1)
            if top == tag:
                break

    def _close(self, tag: str, depth: int) -> None:
        if tag == "title":
            self._in_title = False
        if self.skip_at is not None:
            if depth == self.skip_at:
                self.skip_at = None
            return
        if self.focus and tag in ("main", "article") and self.focus_depth > 0:
            self.focus_depth -= 1
        if not (not self.focus or self.focus_depth > 0 or tag in ("main", "article")):
            return
        if tag in ("ul", "ol") and self._list:
            self._list.pop()
        elif tag == "blockquote" and self._bq:
            self._bq -= 1
        elif tag == "pre" and self._pre:
            body = "".join(self._pre_buf).strip("\n")
            self._pre = False
            if body.strip():
                self._brk(2)
                self.segs.append(("raw", "```\n" + body + "\n```"))
                self._brk(2)
            return
        elif tag in ("strong", "b"):
            self._emit("**")
        elif tag in ("em", "i"):
            self._emit("*")
        elif tag == "code" and not self._pre:
            self._emit("`")
        elif tag == "a" and self._href:
            full = self._href.pop()
            if full:
                self._emit(f"]({full})")
                self.links.append(full)
        elif tag in ("td", "th") and self._cell is not None and self._row is not None:
            self._row.append(re.sub(r"\s+", " ", "".join(self._cell)).strip().replace("|", "\\|"))
            self._cell = None
        elif tag == "tr" and self._row is not None and self._table is not None:
            if any(self._row):
                self._table.append(self._row)
            self._row = None
        elif tag == "table" and self._table is not None:
            rows, self._table = self._table, None
            if rows:
                w = max(len(r) for r in rows)
                rows = [r + [""] * (w - len(r)) for r in rows]
                lines = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * w] + ["| " + " | ".join(r) + " |" for r in rows[1:]]
                self._brk(2)
                self.segs.append(("raw", "\n".join(lines)))
                self._brk(2)
            return
        if tag in _BLOCK:
            self._brk(2 if tag not in ("li", "tr") else 1)

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data
            return
        if not self._active():
            return
        if self._pre:
            self._pre_buf.append(data)
            return
        if not data.strip() and "\n" in data:
            self._emit(" ")
            return
        txt = re.sub(r"\s+", " ", data)
        self._emit(txt)


_LIST_ITEM = re.compile(r"^\s*(?:[-*]|\d+\.) ")
_LINK_ONLY = re.compile(r"^\s*(?:[-*]|\d+\.)\s*\[[^\]]{1,40}\]\([^)]*\)\s*$")


def _normalise(segs: Sequence[tuple[str, str]], drop_menus: bool) -> str:
    text = ""
    for kind, s in segs:
        text += ("\n" + s.replace("\n", "\x01") + "\n") if kind == "raw" else s
    out: list[str] = []
    for line in text.split("\n"):
        if "\x01" in line:
            out.append(line.replace("\x01", "\n"))
            continue
        lead = re.match(r"^( *)(?:[-*]|\d+\.) ", line)
        indent = lead.group(1) if lead else ""
        line = indent + re.sub(r"[ \t\u00a0]+", " ", line).strip()
        line = re.sub(r"(?<!\*)\*\*\s*\*\*(?!\*)", "", line)
        line = re.sub(r"(?<![*\w])\*\s+\*(?![*\w])", "", line)
        line = re.sub(r"\[\s*\]\([^)]*\)", "", line).rstrip()
        if not lead:
            line = line.lstrip()
        if line.strip() in ("-", "*", ">", "#", "##", "###", "1."):
            continue
        out.append(line)
    tight: list[str] = []                       # no blank lines between consecutive list items
    for i, line in enumerate(out):
        if (not line and tight and i + 1 < len(out) and _LIST_ITEM.match(tight[-1]) and _LIST_ITEM.match(out[i + 1])):
            continue
        tight.append(line)
    out = tight
    if drop_menus:                              # runs of >=3 bare short link bullets are navigation, not prose
        keep: list[str] = []
        i = 0
        while i < len(out):
            j = i
            while j < len(out) and _LINK_ONLY.match(out[j]):
                j += 1
            if j - i >= 3:
                i = j
                continue
            keep.append(out[i])
            i += 1
        out = keep
    counts: dict[str, int] = {}
    final: list[str] = []
    blank = 0
    for line in out:
        if not line:
            blank += 1
            if blank <= 1 and final:
                final.append("")
            continue
        blank = 0
        if len(line) < 120:
            counts[line] = counts.get(line, 0) + 1
            if counts[line] > 2:
                continue
        final.append(line)
    return "\n".join(final).strip()


def html_to_markdown(html: str, base_url: str = "", *, max_chars: int = 40_000) -> dict[str, Any]:
    """Reduce raw HTML to Markdown. Returns title, description, markdown, links, truncated."""
    has_main = re.search(r"<(main|article)\b", html, re.I) is not None
    result: dict[str, Any] | None = None
    for focus in ((True, False) if has_main else (False,)):
        p = _MarkdownParser(base_url, focus)
        try:
            p.feed(html)
            p.close()
        except Exception as e:                  # html.parser is lenient, but never trust the web
            log.warning("html parse error: %s", e)
        md = _normalise(p.segs, drop_menus=not focus)
        title = re.sub(r"\s+", " ", p.title).strip()
        result = {"title": title, "description": p.description, "markdown": md, "links": list(dict.fromkeys(p.links))}
        if len(md) >= 200 or not focus:
            break
    assert result is not None
    md = result["markdown"]
    truncated = len(md) > max_chars
    if truncated:
        cut = md.rfind("\n\n", int(max_chars * 0.6), max_chars)
        md = md[: cut if cut > 0 else max_chars].rstrip() + "\n\n…[truncated]"
    result["markdown"], result["truncated"] = md, truncated
    return result


# --------------------------------------------------------------------------- browser
class StealthBrowser:
    """Pool-less, leak-safe headless Chromium fetcher. Use ``async with StealthBrowser() as b``."""

    def __init__(self, config: BrowserConfig | None = None) -> None:
        self.config = config or BrowserConfig()
        self.policy = UrlPolicy(self.config.allow_private_hosts)
        self._rng = random.Random(self.config.seed)
        self._pw: Playwright | None = None
        self._browser: Browser | None = None
        self._lock = asyncio.Lock()
        self._sem = asyncio.Semaphore(self.config.max_concurrency)
        self._contexts: set[BrowserContext] = set()
        self._closers: set[asyncio.Future[None]] = set()
        self._served = 0
        self._closed = False
        self.launches = 0

    # ---- lifecycle
    async def __aenter__(self) -> "StealthBrowser":
        await self._ensure_browser()
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.close()

    async def _ensure_browser(self) -> Browser:
        async with self._lock:
            return await self._ensure_locked()

    async def _ensure_locked(self) -> Browser:
        if self._closed:
            raise BrowserError("browser has been closed")
        recycle = (self._browser is not None and self._served >= self.config.recycle_after_contexts and not self._contexts)
        if self._browser is not None and (not self._browser.is_connected() or recycle):
            log.info("relaunching chromium (%s)", "recycle" if recycle else "disconnected")
            await self._kill_browser()
        if self._browser is None:
            if self._pw is None:
                self._pw = await async_playwright().start()
            kw: dict[str, Any] = {"headless": self.config.headless, "args": LAUNCH_ARGS}
            if self.config.executable_path:
                kw["executable_path"] = self.config.executable_path
            if self.config.proxy:
                kw["proxy"] = {"server": self.config.proxy}
            try:
                self._browser = await self._pw.chromium.launch(**kw)
            except PlaywrightError as e:
                raise BrowserError(f"cannot launch chromium: {e}") from e
            self._served = 0
            self.launches += 1
        return self._browser

    async def _kill_browser(self) -> None:
        b, self._browser = self._browser, None
        if b is not None:
            try:
                await asyncio.wait_for(b.close(), 10)
            except Exception as e:
                log.warning("browser close failed: %s", e)

    async def close(self) -> None:
        self._closed = True
        for ctx in list(self._contexts):
            await self._close_ctx(ctx)
        if self._closers:
            await asyncio.gather(*self._closers, return_exceptions=True)
        async with self._lock:
            await self._kill_browser()
            if self._pw is not None:
                try:
                    await asyncio.wait_for(self._pw.stop(), 10)
                except Exception as e:
                    log.warning("playwright stop failed: %s", e)
                self._pw = None

    async def _close_ctx(self, ctx: BrowserContext) -> None:
        try:
            await asyncio.wait_for(ctx.close(), 10)
        except Exception as e:
            log.warning("context close failed: %s", e)
        finally:
            self._contexts.discard(ctx)

    @property
    def open_contexts(self) -> int:
        return len(self._contexts)

    # ---- context construction
    def _fingerprint(self) -> Fingerprint:
        return self._rng.choice(FINGERPRINTS)

    def _headers(self, fp: Fingerprint) -> dict[str, str]:
        return {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": f"{self.config.locale},en;q=0.9",
            "Upgrade-Insecure-Requests": "1", "DNT": "1",
            "Sec-CH-UA": fp.sec_ch_ua, "Sec-CH-UA-Mobile": "?0", "Sec-CH-UA-Platform": fp.ch_platform,
            "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Site": "none", "Sec-Fetch-User": "?1",
        }

    async def _new_context(self) -> BrowserContext:
        fp = self._fingerprint()
        w, h = self._rng.choice([(1366, 768), (1440, 900), (1536, 864), (1920, 1080)])
        async with self._lock:                      # recycle/relaunch decisions and context registration are atomic
            browser = await self._ensure_locked()
            try:
                ctx = await browser.new_context(
                    user_agent=fp.user_agent, viewport={"width": w, "height": h}, screen={"width": w, "height": h},
                    locale=self.config.locale, timezone_id=self.config.timezone_id, extra_http_headers=self._headers(fp),
                    java_script_enabled=True, service_workers="block", accept_downloads=False, bypass_csp=False,
                    color_scheme="light", ignore_https_errors=False)
            except PlaywrightError as e:
                raise BrowserError(f"cannot create browser context: {e}") from e
            self._contexts.add(ctx)
            self._served += 1
        try:
            import json
            await ctx.add_init_script(STEALTH_JS.replace("__FP__", json.dumps(
                {"platform": fp.platform, "webglVendor": fp.webgl_vendor, "webglRenderer": fp.webgl_renderer})))
            await ctx.route("**/*", self._route)
            ctx.set_default_timeout(self.config.nav_timeout_ms)
            ctx.set_default_navigation_timeout(self.config.nav_timeout_ms)
        except BaseException:
            await asyncio.shield(self._close_ctx(ctx))
            raise
        return ctx

    async def _route(self, route: Route) -> None:
        req = route.request
        try:
            if req.resource_type in self.config.block_resource_types:
                await route.abort("blockedbyclient")
                return
            await self.policy.check(req.url)
        except NavigationBlocked:
            log.info("blocked request to %s", req.url)
            await route.abort("blockedbyclient")
            return
        except PlaywrightError:
            return                                  # page already closed
        try:
            await route.continue_()
        except PlaywrightError:
            pass

    # ---- fetching
    async def fetch(self, url: str, *, wait_selector: str | None = None) -> PageResult:
        url = self.policy.normalise(url)
        await self.policy.check(url)
        async with self._sem:
            try:
                async with asyncio.timeout(self.config.hard_timeout_s):
                    return await self._fetch_once(url, wait_selector)
            except TimeoutError as e:
                raise FetchError(f"hard timeout ({self.config.hard_timeout_s}s) fetching {url}") from e

    async def _fetch_once(self, url: str, wait_selector: str | None) -> PageResult:
        ctx = await self._new_context()
        try:
            page = await ctx.new_page()
            try:
                resp = await page.goto(url, wait_until="domcontentloaded")
            except PlaywrightError as e:
                msg = str(e).splitlines()[0]
                if "blockedbyclient" in msg.lower():
                    raise NavigationBlocked(f"navigation to {url} blocked by policy") from e
                raise FetchError(f"navigation failed: {msg}") from e
            status = resp.status if resp else 0
            if status >= 400:
                raise FetchError(f"HTTP {status} for {url}", status)
            ctype = (resp.headers.get("content-type", "") if resp else "").lower()
            if ctype and not any(t in ctype for t in ("html", "xml", "text/plain")):
                raise FetchError(f"unsupported content type {ctype!r}", status)
            settle: dict[str, Any] = {}
            try:
                settle = await page.evaluate(SETTLE_JS, {"quietMs": self.config.settle_quiet_ms,
                                                         "maxMs": self.config.settle_max_ms, "selector": wait_selector})
            except PlaywrightError as e:           # page navigated away mid-wait (client-side redirect)
                settle = {"reason": f"interrupted: {str(e).splitlines()[0]}"}
                try:
                    await page.wait_for_load_state("domcontentloaded", timeout=5000)
                except PlaywrightError:
                    pass
            final_url = page.url
            await self.policy.check(final_url)
            html = await page.content()
            if len(html.encode("utf-8", "ignore")) > self.config.max_html_bytes:
                html = html[: self.config.max_html_bytes]
            parsed = html_to_markdown(html, final_url, max_chars=self.config.max_markdown_chars)
            return PageResult(url=url, final_url=final_url, status=status, title=parsed["title"],
                              description=parsed["description"], markdown=parsed["markdown"], links=parsed["links"],
                              truncated=parsed["truncated"], settle=settle)
        finally:
            closer = asyncio.ensure_future(self._close_ctx(ctx))
            self._closers.add(closer)
            closer.add_done_callback(self._closers.discard)
            await asyncio.shield(closer)

    # ---- search (no API: scrape an HTML results page through the same hardened browser)
    async def search(self, query: str, limit: int = 6) -> list[str]:
        q = quote_plus(query.strip())
        found: list[str] = []
        for engine in self.config.search_engines:
            try:
                urls = await self._search_one(engine, q)
            except BrowserError as e:
                log.warning("search via %s failed: %s", engine, e)
                continue
            for u in urls:
                if u not in found:
                    found.append(u)
            if len(found) >= limit:
                break
        return found[:limit]

    async def _search_one(self, engine: str, q: str) -> list[str]:
        if engine == "duckduckgo":
            url, sel = f"https://html.duckduckgo.com/html/?q={q}", "a.result__a"
        elif engine == "bing":
            url, sel = f"https://www.bing.com/search?q={q}&setlang=en", "li.b_algo h2 a"
        else:
            raise BrowserError(f"unknown search engine {engine!r}")
        await self.policy.check(url)
        async with self._sem:
            try:
                async with asyncio.timeout(self.config.hard_timeout_s):
                    ctx = await self._new_context()
                    try:
                        page = await ctx.new_page()
                        try:
                            await page.goto(url, wait_until="domcontentloaded")
                            await page.wait_for_selector(sel, timeout=8000)
                        except PlaywrightError as e:
                            raise FetchError(f"{engine}: {str(e).splitlines()[0]}") from e
                        hrefs: list[str] = await page.eval_on_selector_all(sel, "els => els.map(e => e.href)")
                    finally:
                        closer = asyncio.ensure_future(self._close_ctx(ctx))
                        self._closers.add(closer)
                        closer.add_done_callback(self._closers.discard)
                        await asyncio.shield(closer)
            except TimeoutError as e:
                raise FetchError(f"{engine}: search timed out") from e
        return [u for u in (self._decode_result(h) for h in hrefs) if u]

    @staticmethod
    def _decode_result(href: str) -> str | None:
        p = urlparse(href)
        if "duckduckgo.com" in (p.hostname or ""):
            if p.path.startswith("/l/") or "uddg" in p.query:
                target = parse_qs(p.query).get("uddg", [""])[0]
                href = unquote(target)
            else:
                return None
        elif (p.hostname or "").endswith("bing.com") and p.path.startswith("/ck/"):
            enc = parse_qs(p.query).get("u", [""])[0]
            if enc.startswith("a1"):
                import base64
                try:
                    href = base64.urlsafe_b64decode(enc[2:] + "=" * (-len(enc[2:]) % 4)).decode()
                except Exception:
                    return None
            else:
                return None
        return href if href.startswith(("http://", "https://")) else None

    # ---- WebIngestor protocol used by the agent
    async def ingest(self, queries: Sequence[str], urls: Sequence[str], *, max_pages: int) -> list[WebDoc]:
        candidates: list[str] = []
        for u in urls:
            try:
                n = self.policy.normalise(u)
                await self.policy.check(n)
                candidates.append(n)
            except NavigationBlocked as e:
                log.info("skipping url %s: %s", u, e)
        if len(candidates) < max_pages:
            for q in queries:
                if not q.strip():
                    continue
                for u in await self.search(q, limit=max_pages * 2):
                    if u not in candidates:
                        candidates.append(u)
                if len(candidates) >= max_pages * 2:
                    break
        docs: list[WebDoc] = []
        seen_hosts: dict[str, int] = {}
        i = 0
        while i < len(candidates) and len(docs) < max_pages:
            batch = [c for c in candidates[i: i + (max_pages - len(docs))]]
            i += len(batch)
            results = await asyncio.gather(*(self.fetch(c) for c in batch), return_exceptions=True)
            for c, r in zip(batch, results):
                if isinstance(r, asyncio.CancelledError):
                    raise r
                if isinstance(r, BaseException):
                    log.info("fetch failed for %s: %s", c, r)
                    continue
                if len(r.markdown) < self.config.min_useful_chars:
                    continue
                host = urlparse(r.final_url).hostname or ""
                seen_hosts[host] = seen_hosts.get(host, 0) + 1
                head = f"# {r.title}\n\n" if r.title and not r.markdown.lstrip().startswith("# ") else ""
                docs.append(WebDoc(url=r.final_url, title=r.title or host, text=head + r.markdown))
        return docs
