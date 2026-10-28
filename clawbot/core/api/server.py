"""FastAPI layer: live WebSocket stream of LLM tokens + LangGraph node events, REST for
feedback / rules / ingestion / health.

Run:  ``uvicorn core.api.server:app --host 127.0.0.1 --port 8765``

WebSocket ``/ws`` protocol (JSON text frames)
  client -> server
    {"type":"ask","question":str,"mode":"online"|"offline","history":[{role,content}],"run_id"?:str}
    {"type":"cancel"}            abort the active run
    {"type":"set_mode","mode":"online"|"offline"}
    {"type":"ping"}
  server -> client (every frame carries a monotonically increasing "seq")
    {"event":"ready","mode":...,"auth":bool}
    {"event":"run_start"|"node_start"|"token"|"node_end"|"state"|"result", ...}   (see core.agent.executor)
    {"event":"cancelled","run_id":...} | {"event":"error","message":str,"code":str} | {"event":"pong"}
"""
from __future__ import annotations

import asyncio
import hmac
import json
import logging
import os
import time
from collections import OrderedDict
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncIterator, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from core.agent.browser import BrowserConfig, StealthBrowser
from core.agent.executor import Agent, AgentConfig, AgentDeps, WebIngestor
from core.llm.inference import InferenceClient, LLMConfig, LLMError
from core.memory.preferences import PreferenceMemory
from core.memory.vector_store import SentenceTransformerEmbedder, VectorStore

log = logging.getLogger("clawbot.api")
MAX_FRAME_BYTES = 256 * 1024
MAX_QUESTION_CHARS = 4000


# --------------------------------------------------------------------------- settings
@dataclass
class Settings:
    backend: Literal["ollama", "vllm"] = field(default_factory=lambda: os.getenv("CLAWBOT_BACKEND", "ollama"))          # type: ignore[arg-type]
    llm_url: str = field(default_factory=lambda: os.getenv("CLAWBOT_LLM_URL", "http://127.0.0.1:11434"))
    model: str = field(default_factory=lambda: os.getenv("CLAWBOT_MODEL", "llama3.1:8b"))
    embed_model: str = field(default_factory=lambda: os.getenv("CLAWBOT_EMBED_MODEL", "BAAI/bge-large-en-v1.5"))
    data_dir: str = field(default_factory=lambda: os.getenv("CLAWBOT_DATA_DIR", "./data"))
    token: str | None = field(default_factory=lambda: os.getenv("CLAWBOT_TOKEN") or None)
    origins: list[str] = field(default_factory=lambda: [o for o in os.getenv(
        "CLAWBOT_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o])
    max_runs: int = field(default_factory=lambda: int(os.getenv("CLAWBOT_MAX_RUNS", "2")))
    default_mode: Literal["online", "offline"] = "online"


# --------------------------------------------------------------------------- run registry
class RunRegistry:
    """Bounded memory of recent runs so feedback can reference ``run_id`` instead of resending text."""

    def __init__(self, cap: int = 200) -> None:
        self.cap = cap
        self._runs: OrderedDict[str, dict[str, Any]] = OrderedDict()

    def put(self, run_id: str, **data: Any) -> None:
        self._runs[run_id] = {**self._runs.get(run_id, {}), **data, "ts": time.time()}
        self._runs.move_to_end(run_id)
        while len(self._runs) > self.cap:
            self._runs.popitem(last=False)

    def get(self, run_id: str) -> dict[str, Any] | None:
        return self._runs.get(run_id)


# --------------------------------------------------------------------------- models
class FeedbackIn(BaseModel):
    action: Literal["edit", "reject", "accept"] = "edit"
    run_id: str | None = Field(default=None, max_length=64)
    question: str | None = Field(default=None, max_length=MAX_QUESTION_CHARS)
    generated_text: str | None = Field(default=None, max_length=40_000)
    edited_text: str | None = Field(default=None, max_length=40_000)
    comment: str | None = Field(default=None, max_length=1000)

    @field_validator("question", "generated_text", "edited_text", "comment")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return v.strip() if isinstance(v, str) else v


class IngestIn(BaseModel):
    text: str = Field(min_length=1, max_length=500_000)
    source: str = Field(default="manual", min_length=1, max_length=300)


class UrlIngestIn(BaseModel):
    urls: list[str] = Field(min_length=1, max_length=5)


# --------------------------------------------------------------------------- app factory
def create_app(settings: Settings | None = None, *, llm: InferenceClient | None = None, store: VectorStore | None = None,
               web: WebIngestor | None = None, agent_config: AgentConfig | None = None) -> FastAPI:
    cfg = settings or Settings()
    owned: list[Any] = []

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        client = llm or InferenceClient(LLMConfig(backend=cfg.backend, base_url=cfg.llm_url, model=cfg.model))
        await client.open()
        vs = store or VectorStore(Path(cfg.data_dir) / "chroma", embedder=SentenceTransformerEmbedder(cfg.embed_model))
        browser: WebIngestor | None = web
        if browser is None:
            browser = StealthBrowser(BrowserConfig())      # Chromium launches lazily on first web fetch
            owned.append(browser)
        agent = Agent(AgentDeps(client, vs, browser, agent_config or AgentConfig()))
        app.state.llm, app.state.store, app.state.web, app.state.agent = client, vs, browser, agent
        app.state.prefs = PreferenceMemory(vs)
        app.state.runs = RunRegistry()
        app.state.run_slots = asyncio.Semaphore(cfg.max_runs)
        try:
            yield
        finally:
            for r in owned:
                try:
                    await r.close()
                except Exception:
                    log.exception("closing %r failed", r)
            if llm is None:
                await client.close()

    app = FastAPI(title="ClawBot Core", version="1.0.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=cfg.origins, allow_methods=["GET", "POST", "DELETE"],
                       allow_headers=["Authorization", "Content-Type"], allow_credentials=False)

    # ---- auth
    def _authorised(token: str | None) -> bool:
        return cfg.token is None or (token is not None and hmac.compare_digest(token, cfg.token))

    async def require_auth(authorization: str | None = Header(default=None)) -> None:
        tok = authorization[7:] if authorization and authorization.lower().startswith("bearer ") else None
        if not _authorised(tok):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing or invalid bearer token",
                                headers={"WWW-Authenticate": "Bearer"})

    # ---- REST
    @app.get("/health")
    async def health() -> dict[str, Any]:
        llm_ok = await app.state.llm.health()
        n = await asyncio.to_thread(app.state.store.count)
        return {"status": "ok" if llm_ok else "degraded", "llm": llm_ok, "model": app.state.llm.config.model,
                "backend": app.state.llm.config.backend, "chunks": n,
                "browser_launches": getattr(app.state.web, "launches", None)}

    @app.post("/api/feedback", dependencies=[Depends(require_auth)])
    async def feedback(body: FeedbackIn) -> dict[str, Any]:
        """Webhook: user edit / rejection -> structural rules stored as high-priority few-shot vectors."""
        run = app.state.runs.get(body.run_id) if body.run_id else None
        question = body.question or (run or {}).get("question")
        generated = body.generated_text or (run or {}).get("answer")
        if not question or not generated:
            raise HTTPException(422, "need 'question' and 'generated_text' (or a known run_id that provides them)")
        if body.action == "edit" and not (body.edited_text or "").strip():
            raise HTTPException(422, "action 'edit' requires non-empty 'edited_text'")
        result = await asyncio.to_thread(app.state.prefs.record, question=question, generated=generated,
                                         edited=body.edited_text, action=body.action, comment=body.comment)
        return {"ok": True, **result}

    @app.get("/api/rules", dependencies=[Depends(require_auth)])
    async def rules() -> dict[str, Any]:
        items = await asyncio.to_thread(app.state.prefs.list_rules)
        return {"count": len(items), "rules": items}

    @app.delete("/api/rules", dependencies=[Depends(require_auth)])
    async def delete_rule(source: str = Query(min_length=12, max_length=300)) -> dict[str, Any]:
        n = await asyncio.to_thread(app.state.prefs.delete_rule, source)
        if not n:
            raise HTTPException(404, "no such preference rule")
        return {"deleted": n}

    @app.post("/api/ingest/text", dependencies=[Depends(require_auth)])
    async def ingest_text(body: IngestIn) -> dict[str, Any]:
        ids = await app.state.store.aadd_text(body.text, source=body.source)
        return {"chunks": len(ids)}

    @app.post("/api/ingest/urls", dependencies=[Depends(require_auth)])
    async def ingest_urls(body: UrlIngestIn) -> dict[str, Any]:
        try:
            docs = await app.state.web.ingest([], body.urls, max_pages=len(body.urls))
        except Exception as e:
            raise HTTPException(502, f"web ingestion failed: {type(e).__name__}: {e}") from e
        n = 0
        for d in docs:
            n += len(await app.state.store.aadd_text(d["text"], source=d["url"], metadata={"title": d["title"], "kind": "web"}))
        return {"pages": [d["url"] for d in docs], "chunks": n}

    # ---- WebSocket
    @app.websocket("/ws")
    async def ws_endpoint(ws: WebSocket, token: str | None = Query(default=None)) -> None:
        if not _authorised(token):
            await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="unauthorised")
            return
        origin = ws.headers.get("origin")
        if origin and cfg.origins and origin not in cfg.origins and "*" not in cfg.origins:
            await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="origin not allowed")
            return
        await ws.accept()
        seq = 0
        send_lock = asyncio.Lock()
        mode: Literal["online", "offline"] = cfg.default_mode
        active: asyncio.Task[None] | None = None

        async def send(obj: dict[str, Any]) -> bool:
            nonlocal seq
            async with send_lock:
                seq += 1
                try:
                    await ws.send_text(json.dumps({**obj, "seq": seq}, ensure_ascii=False, default=str))
                    return True
                except (WebSocketDisconnect, RuntimeError):
                    return False

        async def run_agent(question: str, history: list[dict[str, str]], run_mode: str, run_id: str | None) -> None:
            async with app.state.run_slots:
                rid = run_id
                try:
                    async for ev in app.state.agent.stream(question, history=history, mode=run_mode, run_id=run_id):
                        rid = ev.get("run_id", rid)
                        if ev["event"] == "result":
                            app.state.runs.put(ev["run_id"], question=question, answer=ev.get("answer", ""))
                        if not await send(ev):
                            return
                    if rid:
                        await app.state.agent.forget(rid)
                except asyncio.CancelledError:
                    await send({"event": "cancelled", "run_id": rid})
                    if rid:
                        await asyncio.shield(app.state.agent.forget(rid))
                    raise
                except LLMError as e:
                    await send({"event": "error", "code": "llm", "message": f"{type(e).__name__}: {e}", "run_id": rid})
                except Exception as e:
                    log.exception("run failed")
                    await send({"event": "error", "code": "internal", "message": f"{type(e).__name__}: {e}", "run_id": rid})

        await send({"event": "ready", "mode": mode, "auth": cfg.token is not None})
        try:
            while True:
                raw = await ws.receive_text()
                if len(raw) > MAX_FRAME_BYTES:
                    await send({"event": "error", "code": "too_large", "message": "frame too large"})
                    continue
                try:
                    msg = json.loads(raw)
                    if not isinstance(msg, dict):
                        raise ValueError("frame must be a JSON object")
                except ValueError as e:
                    await send({"event": "error", "code": "bad_json", "message": str(e)})
                    continue
                kind = msg.get("type")
                if kind == "ping":
                    await send({"event": "pong"})
                elif kind == "set_mode":
                    if msg.get("mode") in ("online", "offline"):
                        mode = msg["mode"]
                        await send({"event": "mode", "mode": mode})
                    else:
                        await send({"event": "error", "code": "bad_mode", "message": "mode must be 'online' or 'offline'"})
                elif kind == "cancel":
                    if active and not active.done():
                        active.cancel()
                elif kind == "ask":
                    q = str(msg.get("question", "")).strip()
                    m = msg.get("mode", mode)
                    hist = [h for h in msg.get("history", []) if isinstance(h, dict)][-20:] if isinstance(msg.get("history", []), list) else []
                    rid = msg.get("run_id")
                    if not q or len(q) > MAX_QUESTION_CHARS:
                        await send({"event": "error", "code": "bad_question", "message": f"question must be 1..{MAX_QUESTION_CHARS} characters"})
                    elif m not in ("online", "offline"):
                        await send({"event": "error", "code": "bad_mode", "message": "mode must be 'online' or 'offline'"})
                    elif rid is not None and not (isinstance(rid, str) and 0 < len(rid) <= 64):
                        await send({"event": "error", "code": "bad_run_id", "message": "run_id must be a short string"})
                    elif active and not active.done():
                        await send({"event": "error", "code": "busy", "message": "a run is already active on this connection"})
                    else:
                        mode = m
                        active = asyncio.create_task(run_agent(q, [{"role": str(h.get("role", "")), "content": str(h.get("content", ""))} for h in hist], m, rid))
                else:
                    await send({"event": "error", "code": "unknown_type", "message": f"unknown message type {kind!r}"})
        except WebSocketDisconnect:
            pass
        finally:
            if active and not active.done():
                active.cancel()
                await asyncio.gather(active, return_exceptions=True)

    return app


def _default_app() -> FastAPI:
    return create_app()


app = _default_app()
