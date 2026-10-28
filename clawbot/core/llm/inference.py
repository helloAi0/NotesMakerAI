"""Asynchronous local-inference client for Ollama and vLLM.

No external paid API is ever contacted: the only network endpoint is the
``base_url`` of a local (or LAN) Ollama / vLLM server.

Features
--------
* Token streaming (Ollama NDJSON ``/api/chat`` and vLLM/OpenAI-compatible SSE
  ``/v1/chat/completions``).
* Exponential backoff with full jitter for socket-level failures
  (connect/read timeouts, resets, 429/502/503/504). Streams are retried only
  while no token has been delivered, so a caller never sees duplicated text.
* Schema-constrained JSON extraction: the JSON Schema is injected into the system
  prompt, the server's JSON mode is enabled, the answer is parsed tolerantly
  (code fences, prose around the object) and validated with ``jsonschema``;
  on failure the validation error is fed back to the model for a repair attempt.
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
import time
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Literal, Mapping, Sequence

import httpx
from jsonschema import Draft202012Validator

log = logging.getLogger("clawbot.llm")

Role = Literal["system", "user", "assistant"]
Message = dict[str, str]

RETRYABLE_STATUS = frozenset({408, 425, 429, 500, 502, 503, 504})
RETRYABLE_EXC: tuple[type[BaseException], ...] = (
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.ReadTimeout,
    httpx.WriteTimeout,
    httpx.PoolTimeout,
    httpx.ReadError,
    httpx.WriteError,
    httpx.RemoteProtocolError,
)


# --------------------------------------------------------------------------- errors
class LLMError(Exception):
    """Base class for every error raised by this module."""


class LLMConnectionError(LLMError):
    """The local inference server could not be reached after all retries."""


class LLMResponseError(LLMError):
    """The server answered, but with an error or a malformed payload."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class LLMSchemaError(LLMError):
    """The model never produced JSON that satisfies the requested schema."""

    def __init__(self, message: str, last_output: str = "", errors: Sequence[str] = ()) -> None:
        super().__init__(message)
        self.last_output = last_output
        self.errors = list(errors)


# --------------------------------------------------------------------------- config
@dataclass(frozen=True)
class LLMConfig:
    backend: Literal["ollama", "vllm"] = "ollama"
    base_url: str = "http://127.0.0.1:11434"
    model: str = "llama3.1:8b"
    api_key: str | None = None          # vLLM --api-key (local shared secret), never a paid API
    connect_timeout: float = 5.0
    read_timeout: float = 120.0         # max silence between two streamed chunks
    max_retries: int = 5
    base_delay: float = 0.5
    max_delay: float = 20.0
    temperature: float = 0.2
    max_tokens: int | None = None
    num_ctx: int | None = None          # Ollama context window override
    max_schema_attempts: int = 3

    def __post_init__(self) -> None:
        if self.backend not in ("ollama", "vllm"):
            raise ValueError(f"unsupported backend {self.backend!r}")
        if self.max_retries < 0 or self.max_schema_attempts < 1:
            raise ValueError("max_retries must be >= 0 and max_schema_attempts >= 1")
        if self.base_delay <= 0 or self.max_delay < self.base_delay:
            raise ValueError("require 0 < base_delay <= max_delay")


@dataclass
class GenerationResult:
    text: str
    model: str
    elapsed_s: float
    chunks: int
    attempts: int = 1


# --------------------------------------------------------------------------- JSON helpers
def _strip_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        nl = t.find("\n")
        t = t[nl + 1:] if nl != -1 else t[3:]
        if t.rstrip().endswith("```"):
            t = t.rstrip()[:-3]
    return t.strip()


def _balanced_candidates(text: str) -> list[str]:
    """Return every top-level balanced {...} / [...] substring, string-literal aware."""
    out: list[str] = []
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch in "{[":
            close = "}" if ch == "{" else "]"
            stack = [close]
            j = i + 1
            in_str = False
            esc = False
            while j < n and stack:
                c = text[j]
                if in_str:
                    if esc:
                        esc = False
                    elif c == "\\":
                        esc = True
                    elif c == '"':
                        in_str = False
                elif c == '"':
                    in_str = True
                elif c in "{[":
                    stack.append("}" if c == "{" else "]")
                elif c in "}]":
                    if c != stack[-1]:
                        break
                    stack.pop()
                j += 1
            if not stack:
                out.append(text[i:j])
                i = j
                continue
        i += 1
    return out


def parse_json_loose(text: str) -> Any:
    """Parse the first JSON value found in ``text``; raises ``ValueError`` if none."""
    cleaned = _strip_fences(text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    for cand in sorted(_balanced_candidates(cleaned), key=len, reverse=True):
        try:
            return json.loads(cand)
        except json.JSONDecodeError:
            continue
    raise ValueError("no valid JSON value found in model output")


def schema_system_prompt(schema: Mapping[str, Any], instructions: str | None = None) -> str:
    return (
        (instructions.strip() + "\n\n" if instructions else "")
        + "You are a deterministic JSON generator. Respond with ONE JSON value that validates "
        "against the JSON Schema below. Output raw JSON only: no markdown fences, no commentary, "
        "no trailing text. Use exactly the property names given; never invent extra properties "
        "when additionalProperties is false.\n\nJSON Schema:\n"
        + json.dumps(schema, indent=2, sort_keys=True)
    )


def _format_errors(validator: Draft202012Validator, value: Any) -> list[str]:
    errs = []
    for e in sorted(validator.iter_errors(value), key=lambda x: list(map(str, x.absolute_path))):
        loc = "/".join(map(str, e.absolute_path)) or "<root>"
        errs.append(f"{loc}: {e.message}")
    return errs[:10]


# --------------------------------------------------------------------------- client
class InferenceClient:
    """Async client. Use as ``async with InferenceClient(cfg) as llm:``."""

    def __init__(self, config: LLMConfig | None = None, *, transport: httpx.AsyncBaseTransport | None = None,
                 sleep: Any = asyncio.sleep, rng: random.Random | None = None) -> None:
        self.config = config or LLMConfig()
        self._transport = transport
        self._sleep = sleep
        self._rng = rng or random.Random()
        self._client: httpx.AsyncClient | None = None
        self.retry_log: list[float] = []   # delays actually slept (observability / tests)

    # ---- lifecycle
    async def __aenter__(self) -> "InferenceClient":
        await self.open()
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.close()

    async def open(self) -> None:
        if self._client is not None:
            return
        c = self.config
        headers = {"Content-Type": "application/json"}
        if c.api_key:
            headers["Authorization"] = f"Bearer {c.api_key}"
        timeout = httpx.Timeout(connect=c.connect_timeout, read=c.read_timeout, write=30.0, pool=10.0)
        self._client = httpx.AsyncClient(base_url=c.base_url.rstrip("/"), headers=headers, timeout=timeout,
                                         transport=self._transport,
                                         limits=httpx.Limits(max_connections=20, max_keepalive_connections=5))

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @property
    def http(self) -> httpx.AsyncClient:
        if self._client is None:
            raise LLMError("client is not open; use 'async with InferenceClient(...)' or await open()")
        return self._client

    # ---- backoff
    def backoff_delay(self, attempt: int) -> float:
        """Full-jitter exponential backoff: U(0, min(max_delay, base * 2**attempt))."""
        c = self.config
        ceiling = min(c.max_delay, c.base_delay * (2 ** attempt))
        return self._rng.uniform(ceiling / 2, ceiling)

    # ---- request payloads
    def _payload(self, messages: Sequence[Message], *, stream: bool, json_mode: bool,
                 json_schema: Mapping[str, Any] | None, temperature: float | None,
                 max_tokens: int | None, stop: Sequence[str] | None, model: str | None) -> tuple[str, dict[str, Any]]:
        c = self.config
        temp = c.temperature if temperature is None else temperature
        limit = c.max_tokens if max_tokens is None else max_tokens
        msgs = [dict(m) for m in messages]
        if c.backend == "ollama":
            options: dict[str, Any] = {"temperature": temp}
            if limit is not None:
                options["num_predict"] = limit
            if c.num_ctx is not None:
                options["num_ctx"] = c.num_ctx
            if stop:
                options["stop"] = list(stop)
            body: dict[str, Any] = {"model": model or c.model, "messages": msgs, "stream": stream, "options": options}
            if json_schema is not None:
                body["format"] = dict(json_schema)
            elif json_mode:
                body["format"] = "json"
            return "/api/chat", body
        body = {"model": model or c.model, "messages": msgs, "stream": stream, "temperature": temp}
        if limit is not None:
            body["max_tokens"] = limit
        if stop:
            body["stop"] = list(stop)
        if json_schema is not None:
            body["response_format"] = {"type": "json_schema",
                                       "json_schema": {"name": "response", "schema": dict(json_schema), "strict": True}}
        elif json_mode:
            body["response_format"] = {"type": "json_object"}
        return "/v1/chat/completions", body

    # ---- streaming
    async def stream(self, messages: Sequence[Message], *, json_mode: bool = False,
                     json_schema: Mapping[str, Any] | None = None, temperature: float | None = None,
                     max_tokens: int | None = None, stop: Sequence[str] | None = None,
                     model: str | None = None) -> AsyncIterator[str]:
        """Yield text deltas. Retries with backoff until the first token arrives."""
        path, body = self._payload(messages, stream=True, json_mode=json_mode, json_schema=json_schema,
                                   temperature=temperature, max_tokens=max_tokens, stop=stop, model=model)
        attempt = 0
        while True:
            delivered = False
            try:
                async with self.http.stream("POST", path, json=body) as resp:
                    if resp.status_code != 200:
                        detail = (await resp.aread()).decode("utf-8", "replace")[:500]
                        raise LLMResponseError(f"{self.config.backend} returned HTTP {resp.status_code}: {detail}",
                                               resp.status_code)
                    async for delta in self._iter_deltas(resp):
                        delivered = True
                        yield delta
                    return
            except LLMResponseError as e:
                if delivered or e.status not in RETRYABLE_STATUS or attempt >= self.config.max_retries:
                    raise
                err: BaseException = e
            except RETRYABLE_EXC as e:
                if delivered:
                    raise LLMConnectionError(f"stream interrupted after partial output: {e!r}") from e
                if attempt >= self.config.max_retries:
                    raise LLMConnectionError(
                        f"cannot reach {self.config.backend} at {self.config.base_url} after "
                        f"{attempt + 1} attempts: {e!r}") from e
                err = e
            delay = self.backoff_delay(attempt)
            self.retry_log.append(delay)
            log.warning("inference retry %d/%d in %.2fs (%r)", attempt + 1, self.config.max_retries, delay, err)
            await self._sleep(delay)
            attempt += 1

    async def _iter_deltas(self, resp: httpx.Response) -> AsyncIterator[str]:
        ollama = self.config.backend == "ollama"
        async for raw in resp.aiter_lines():
            line = raw.strip()
            if not line:
                continue
            if not ollama:
                if line.startswith(":"):          # SSE comment / keep-alive
                    continue
                if not line.startswith("data:"):
                    continue
                line = line[5:].strip()
                if line == "[DONE]":
                    return
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                raise LLMResponseError(f"malformed stream line: {line[:200]!r}") from e
            if not isinstance(obj, dict):
                raise LLMResponseError(f"unexpected stream payload: {line[:200]!r}")
            if "error" in obj:
                err = obj["error"]
                msg = err.get("message", err) if isinstance(err, dict) else err
                raise LLMResponseError(f"{self.config.backend} stream error: {msg}")
            if ollama:
                text = (obj.get("message") or {}).get("content") or ""
                if text:
                    yield text
                if obj.get("done"):
                    return
            else:
                choices = obj.get("choices") or []
                if choices:
                    delta = (choices[0].get("delta") or {}).get("content") or ""
                    if delta:
                        yield delta

    # ---- non-streaming convenience
    async def generate(self, messages: Sequence[Message], **kw: Any) -> GenerationResult:
        start = time.perf_counter()
        retries_before = len(self.retry_log)
        parts: list[str] = []
        async for d in self.stream(messages, **kw):
            parts.append(d)
        text = "".join(parts)
        if not text.strip():
            raise LLMResponseError("model returned an empty completion")
        return GenerationResult(text=text, model=kw.get("model") or self.config.model,
                                elapsed_s=time.perf_counter() - start, chunks=len(parts),
                                attempts=1 + len(self.retry_log) - retries_before)

    async def complete(self, prompt: str, *, system: str | None = None, **kw: Any) -> str:
        msgs: list[Message] = ([{"role": "system", "content": system}] if system else []) + [
            {"role": "user", "content": prompt}]
        return (await self.generate(msgs, **kw)).text

    # ---- schema-enforced JSON
    async def extract_json(self, prompt: str, schema: Mapping[str, Any], *, system: str | None = None,
                           history: Sequence[Message] = (), **kw: Any) -> Any:
        """Return a value validated against ``schema`` or raise ``LLMSchemaError``."""
        Draft202012Validator.check_schema(schema)
        validator = Draft202012Validator(schema)
        msgs: list[Message] = [{"role": "system", "content": schema_system_prompt(schema, system)},
                               *[dict(m) for m in history], {"role": "user", "content": prompt}]
        kw.setdefault("temperature", 0.0)
        last_out, last_errs = "", []
        for attempt in range(self.config.max_schema_attempts):
            res = await self.generate(msgs, json_mode=True, **kw)
            last_out = res.text
            try:
                value = parse_json_loose(last_out)
            except ValueError as e:
                last_errs = [str(e)]
            else:
                last_errs = _format_errors(validator, value)
                if not last_errs:
                    return value
            log.info("schema attempt %d failed: %s", attempt + 1, last_errs)
            msgs = [*msgs, {"role": "assistant", "content": last_out},
                    {"role": "user", "content": "Your previous output was invalid:\n- " + "\n- ".join(last_errs)
                     + "\nReturn ONLY corrected raw JSON that satisfies the schema."}]
        raise LLMSchemaError(f"no schema-valid JSON after {self.config.max_schema_attempts} attempts",
                             last_output=last_out, errors=last_errs)

    # ---- diagnostics
    async def health(self) -> bool:
        path = "/api/tags" if self.config.backend == "ollama" else "/v1/models"
        try:
            return (await self.http.get(path, timeout=httpx.Timeout(3.0))).status_code == 200
        except httpx.HTTPError:
            return False

    async def list_models(self) -> list[str]:
        try:
            r = await self.http.get("/api/tags" if self.config.backend == "ollama" else "/v1/models")
            r.raise_for_status()
            data = r.json()
        except httpx.HTTPError as e:
            raise LLMConnectionError(f"cannot list models: {e!r}") from e
        if self.config.backend == "ollama":
            return [m["name"] for m in data.get("models", [])]
        return [m["id"] for m in data.get("data", [])]
