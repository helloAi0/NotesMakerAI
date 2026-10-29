"""LangGraph planner / generator / critic engine.

Graph (conditional edges in brackets)::

    START -> parse -[memory|web|direct]-> retrieve | ingest_web | generate
    retrieve -[good context | poor+online | poor]-> generate | ingest_web | generate
    ingest_web -> retrieve                                  (web text is embedded, then re-queried)
    generate -> critic -[pass | revise | needs context | budget spent]-> finalize | generate | ingest_web | finalize

The critic has two layers: a deterministic check of the draft against local JSON schemas
(``DRAFT_SCHEMA`` plus citation-range and placeholder rules) and an LLM review constrained
by ``CRITIQUE_SCHEMA``. Any failure routes back to the generator with concrete feedback until
the revision budget is exhausted.

Every node emits ``node_start`` / ``node_end`` events and the generator emits ``token``
events through LangGraph's custom stream, so a UI can render live graph state.
"""
from __future__ import annotations

import asyncio
import logging
import operator
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import Annotated, Any, AsyncIterator, Awaitable, Callable, Literal, Mapping, Protocol, Sequence, TypedDict

from jsonschema import Draft202012Validator
from langgraph.checkpoint.memory import MemorySaver
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph

from core.llm.inference import InferenceClient, LLMError
from core.memory.vector_store import SearchHit, VectorStore

log = logging.getLogger("clawbot.agent")

Route = Literal["memory", "web", "direct"]
Mode = Literal["online", "offline"]

NODE_NAMES = ("parse", "retrieve", "ingest_web", "generate", "critic", "finalize")


# --------------------------------------------------------------------------- schemas
PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "route": {"enum": ["memory", "web", "direct"]},
        "reason": {"type": "string", "maxLength": 400},
        "search_queries": {"type": "array", "items": {"type": "string", "minLength": 2}, "maxItems": 4},
        "urls": {"type": "array", "items": {"type": "string", "pattern": "^https?://"}, "maxItems": 5},
        "rewritten_question": {"type": "string"},
    },
    "required": ["route", "reason", "search_queries", "urls", "rewritten_question"],
    "additionalProperties": False,
}

CRITIQUE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "verdict": {"enum": ["pass", "revise"]},
        "score": {"type": "number", "minimum": 0, "maximum": 1},
        "grounded": {"type": "boolean"},
        "answers_question": {"type": "boolean"},
        "needs_more_context": {"type": "boolean"},
        "issues": {"type": "array", "items": {"type": "string"}, "maxItems": 8},
        "suggestions": {"type": "array", "items": {"type": "string"}, "maxItems": 8},
    },
    "required": ["verdict", "score", "grounded", "answers_question", "needs_more_context", "issues", "suggestions"],
    "additionalProperties": False,
}

DRAFT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "answer": {"type": "string", "minLength": 1},
        "word_count": {"type": "integer", "minimum": 1},
        "citations": {"type": "array", "items": {"type": "integer", "minimum": 1}, "uniqueItems": True},
        "has_placeholder": {"const": False},
        "has_refusal_boilerplate": {"const": False},
    },
    "required": ["answer", "word_count", "citations", "has_placeholder", "has_refusal_boilerplate"],
}

_PLACEHOLDER = re.compile(r"\b(TODO|TBD|FIXME|lorem ipsum)\b|\[(insert|placeholder)[^\]]*\]|\.\.\.\s*$", re.I)
_REFUSAL = re.compile(r"\b(as an ai (language )?model|i (cannot|can't) browse)\b", re.I)
_CITE = re.compile(r"\[(\d{1,3})\]")


# --------------------------------------------------------------------------- state
class Doc(TypedDict):
    n: int
    id: str
    source: str
    text: str
    score: float


class WebDoc(TypedDict):
    url: str
    title: str
    text: str


class TraceEntry(TypedDict):
    node: str
    t_start: float
    duration_ms: int
    note: str


class AgentState(TypedDict, total=False):
    run_id: str
    question: str
    history: list[dict[str, str]]
    mode: Mode
    route: Route
    plan_reason: str
    search_queries: list[str]
    urls: list[str]
    rewritten_question: str
    docs: list[Doc]
    style_rules: list[str]
    best_score: float
    web_attempts: int
    web_error: str
    ingested_urls: list[str]
    draft: str
    draft_checks: dict[str, Any]
    critique: dict[str, Any]
    feedback: str
    revisions: int
    passed: bool
    final: str
    error: str
    trace: Annotated[list[TraceEntry], operator.add]


# --------------------------------------------------------------------------- dependencies
class WebIngestor(Protocol):
    """Implemented in Phase 3 (headless browser). Returns cleaned markdown documents."""

    async def ingest(self, queries: Sequence[str], urls: Sequence[str], *, max_pages: int) -> list[WebDoc]: ...


@dataclass
class AgentConfig:
    top_k: int = 6
    min_retrieval_score: float = 0.35
    pass_score: float = 0.7
    max_revisions: int = 2
    max_web_attempts: int = 1
    max_web_pages: int = 3
    context_chars: int = 6000
    history_turns: int = 6
    generation_temperature: float = 0.3
    style_rule_k: int = 4
    style_rule_min_score: float = 0.45
    global_rule_limit: int = 6


@dataclass
class AgentDeps:
    llm: InferenceClient
    store: VectorStore
    web: WebIngestor | None = None
    config: AgentConfig = field(default_factory=AgentConfig)


# --------------------------------------------------------------------------- pure helpers
def analyze_draft(draft: str, n_docs: int, *, require_citations: bool) -> dict[str, Any]:
    """Deterministic schema check. Returns {'data', 'schema_errors', 'rule_errors', 'ok'}."""
    text = draft.strip()
    cites = sorted({int(m) for m in _CITE.findall(text)})
    data = {
        "answer": text,
        "word_count": len(text.split()),
        "citations": cites,
        "has_placeholder": bool(_PLACEHOLDER.search(text)),
        "has_refusal_boilerplate": bool(_REFUSAL.search(text)),
    }
    validator = Draft202012Validator(DRAFT_SCHEMA)
    schema_errors = [f"{'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message}"
                     for e in validator.iter_errors(data)]
    rule_errors: list[str] = []
    bad = [c for c in cites if c > n_docs]
    if bad:
        rule_errors.append(f"cites non-existent sources {bad}; only [1]..[{n_docs}] exist")
    if require_citations and n_docs > 0 and not cites:
        rule_errors.append("answer uses retrieved context but cites no source with [n]")
    return {"data": data, "schema_errors": schema_errors, "rule_errors": rule_errors,
            "ok": not schema_errors and not rule_errors}


def build_context(docs: Sequence[Doc], budget: int) -> str:
    parts: list[str] = []
    used = 0
    for d in docs:
        block = f"[{d['n']}] (source: {d['source']})\n{d['text'].strip()}"
        if used + len(block) > budget:
            room = budget - used
            if room > 200:
                parts.append(block[:room].rstrip() + " …[truncated]")
            break
        parts.append(block)
        used += len(block) + 2
    return "\n\n".join(parts)


def _hits_to_docs(hits: Sequence[SearchHit]) -> list[Doc]:
    seen: set[str] = set()
    out: list[Doc] = []
    for h in hits:
        if h.id in seen:
            continue
        seen.add(h.id)
        out.append(Doc(n=len(out) + 1, id=h.id, source=h.source or "memory", text=h.text, score=round(h.score, 4)))
    return out


def _recent(history: Sequence[Mapping[str, str]], turns: int) -> list[dict[str, str]]:
    keep = [dict(m) for m in history if m.get("role") in ("user", "assistant") and m.get("content")]
    return keep[-2 * turns:]


def heuristic_plan(question: str, mode: Mode) -> dict[str, Any]:
    """Fallback planner when the LLM cannot produce a valid plan."""
    urls = re.findall(r"https?://\S+", question)
    wants_web = mode == "online" and bool(urls or re.search(r"\b(latest|today|news|current|recent|202\d)\b", question, re.I))
    return {"route": "web" if wants_web else "memory", "reason": "heuristic fallback (planner unavailable)",
            "search_queries": [] if urls else [question[:200]], "urls": [u.rstrip(").,;") for u in urls][:5],
            "rewritten_question": question}


# --------------------------------------------------------------------------- node instrumentation
NodeFn = Callable[[AgentState], Awaitable[dict[str, Any]]]


def instrumented(name: str, fn: NodeFn) -> NodeFn:
    async def wrapper(state: AgentState) -> dict[str, Any]:
        writer = get_stream_writer()
        t0 = time.time()
        writer({"event": "node_start", "node": name, "run_id": state.get("run_id"), "ts": t0})
        try:
            update = await fn(state)
        except Exception as e:                       # a node must never kill the stream
            log.exception("node %s failed", name)
            update = {"error": f"{name}: {type(e).__name__}: {e}"}
        note = str(update.pop("_note", ""))
        ms = int((time.time() - t0) * 1000)
        update["trace"] = [TraceEntry(node=name, t_start=t0, duration_ms=ms, note=note)]
        writer({"event": "node_end", "node": name, "run_id": state.get("run_id"), "duration_ms": ms, "note": note,
                "error": update.get("error")})
        return update
    return wrapper


# --------------------------------------------------------------------------- the agent
class Agent:
    def __init__(self, deps: AgentDeps, *, checkpointer: Any | None = None) -> None:
        self.deps = deps
        self.cfg = deps.config
        self.graph = self._build(checkpointer)

    # ------------------------------------------------------------------ nodes
    async def _parse(self, state: AgentState) -> dict[str, Any]:
        mode = state.get("mode", "online")
        q = state["question"]
        sys = ("You are the planning module of a local research agent. Decide how to answer the user's question.\n"
               "- route 'memory': answer from the local knowledge base (notes, ingested pages).\n"
               "- route 'web': fresh or external information is required (news, prices, a given URL, recent facts).\n"
               "- route 'direct': conversational or pure reasoning that needs no sources.\n"
               f"The agent is currently {mode.upper()}. "
               + ("Web access is DISABLED; never choose 'web'. " if mode == "offline" else "")
               + "Give 1-3 concise web search queries only when route is 'web'; list explicit URLs found in the question. "
                 "rewritten_question must be a standalone version of the question (resolve pronouns from history).")
        try:
            plan = await self.deps.llm.extract_json(q, PLAN_SCHEMA, system=sys,
                                                    history=_recent(state.get("history", []), 3))
            note = "llm plan"
        except LLMError as e:
            plan = heuristic_plan(q, mode)
            note = f"heuristic plan ({type(e).__name__})"
        route: Route = plan["route"]
        if mode == "offline" and route == "web":
            route, plan["reason"] = "memory", plan["reason"] + " [offline: web disabled, using memory]"
        if route == "web" and self.deps.web is None:
            route, plan["reason"] = "memory", plan["reason"] + " [no web ingestor configured]"
        rq = plan["rewritten_question"].strip() or q
        return {"route": route, "plan_reason": plan["reason"], "search_queries": plan["search_queries"],
                "urls": plan["urls"], "rewritten_question": rq, "web_attempts": state.get("web_attempts", 0),
                "revisions": 0, "ingested_urls": [], "_note": f"{note}: route={route}"}

    async def _retrieve(self, state: AgentState) -> dict[str, Any]:
        q = state.get("rewritten_question") or state["question"]
        hits = await self.deps.store.aquery(q, self.cfg.top_k, where={"kind": {"$ne": "preference_rule"}})
        docs = _hits_to_docs(hits)
        rules = await self._style_rules(q)
        best = max((d["score"] for d in docs), default=0.0)
        return {"docs": docs, "best_score": best, "style_rules": rules,
                "_note": f"{len(docs)} chunks, best cosine {best:.2f}, {len(rules)} style rules"}

    async def _style_rules(self, q: str) -> list[str]:
        """Global rules (always on, highest priority first) + topical rules similar to the question."""
        store = self.deps.store
        global_hits = await asyncio.to_thread(store.get_where, {"$and": [{"kind": "preference_rule"}, {"scope": "global"}]},
                                              self.cfg.global_rule_limit)
        topical = await store.aquery(q, self.cfg.style_rule_k,
                                     where={"$and": [{"kind": "preference_rule"}, {"scope": "topic"}]},
                                     min_score=self.cfg.style_rule_min_score)
        out: list[str] = []
        for h in [*global_hits, *topical]:
            if h.text not in out:
                out.append(h.text)
        return out

    async def _ingest_web(self, state: AgentState) -> dict[str, Any]:
        attempts = state.get("web_attempts", 0) + 1
        web = self.deps.web
        if state.get("mode") == "offline" or web is None:
            return {"web_attempts": attempts, "web_error": "web ingestion unavailable", "_note": "skipped"}
        queries = state.get("search_queries") or [state.get("rewritten_question") or state["question"]]
        try:
            pages = await web.ingest(queries, state.get("urls", []), max_pages=self.cfg.max_web_pages)
        except Exception as e:
            return {"web_attempts": attempts, "web_error": f"{type(e).__name__}: {e}", "_note": f"web failed: {e}"}
        urls: list[str] = []
        for p in pages:
            if not p["text"].strip():
                continue
            await self.deps.store.aadd_text(p["text"], source=p["url"],
                                            metadata={"title": p["title"], "kind": "web", "fetched_at": time.time()})
            urls.append(p["url"])
        return {"web_attempts": attempts, "ingested_urls": urls, "web_error": "" if urls else "no readable pages",
                "_note": f"ingested {len(urls)} page(s)"}

    async def _generate(self, state: AgentState) -> dict[str, Any]:
        writer = get_stream_writer()
        docs = state.get("docs", [])
        context = build_context(docs, self.cfg.context_chars)
        rules = state.get("style_rules", [])
        sys = ["You are ClawBot, a careful local research assistant."]
        if docs:
            sys.append("Answer using ONLY the numbered context below. Cite every factual claim with its source number "
                       "like [1] or [2][3]. If the context is insufficient, say precisely what is missing instead of guessing.\n\n"
                       "CONTEXT:\n" + context)
        else:
            sys.append("No external context is available. Answer from reasoning and general knowledge, state uncertainty "
                       "plainly, and do not cite sources.")
        if rules:
            sys.append("USER PREFERENCES learned from past edits (follow them):\n- " + "\n- ".join(rules))
        feedback = state.get("feedback", "")
        user = state.get("rewritten_question") or state["question"]
        if feedback and state.get("draft"):
            user += ("\n\nYour previous draft was rejected by a reviewer.\nPREVIOUS DRAFT:\n" + state["draft"]
                     + "\n\nREVIEW FEEDBACK:\n" + feedback + "\nWrite an improved complete answer.")
        msgs = [{"role": "system", "content": "\n\n".join(sys)}, *_recent(state.get("history", []), self.cfg.history_turns),
                {"role": "user", "content": user}]
        parts: list[str] = []
        revision = state.get("revisions", 0)
        async for tok in self.deps.llm.stream(msgs, temperature=self.cfg.generation_temperature):
            parts.append(tok)
            writer({"event": "token", "node": "generate", "text": tok, "revision": revision, "run_id": state.get("run_id")})
        draft = "".join(parts).strip()
        if not draft:
            return {"error": "generate: model returned an empty answer", "draft": ""}
        return {"draft": draft, "_note": f"draft r{revision}, {len(draft.split())} words"}

    async def _critic(self, state: AgentState) -> dict[str, Any]:
        docs = state.get("docs", [])
        draft = state.get("draft", "")
        checks = analyze_draft(draft, len(docs), require_citations=bool(docs))
        problems = [*checks["schema_errors"], *checks["rule_errors"]]
        critique: dict[str, Any] = {}
        sys = ("You are a strict reviewer. Judge the DRAFT against the QUESTION and CONTEXT. "
               "verdict 'pass' only if the draft is on-topic, fully answers the question, every claim is supported by the context "
               "(grounded) and nothing is fabricated. Set needs_more_context=true if the context simply lacks the facts needed. "
               "score is overall quality 0..1. List concrete issues and actionable suggestions.")
        prompt = (f"QUESTION:\n{state.get('rewritten_question') or state['question']}\n\n"
                  f"CONTEXT:\n{build_context(docs, self.cfg.context_chars) or '(none)'}\n\nDRAFT:\n{draft}\n\n"
                  f"AUTOMATED CHECK FINDINGS: {problems or 'none'}")
        try:
            critique = await self.deps.llm.extract_json(prompt, CRITIQUE_SCHEMA, system=sys)
        except LLMError as e:
            # LLM reviewer unavailable: fall back to the deterministic verdict only.
            critique = {"verdict": "pass" if not problems else "revise", "score": 0.75 if not problems else 0.3,
                        "grounded": not problems, "answers_question": bool(draft), "needs_more_context": False,
                        "issues": [f"LLM critic unavailable: {type(e).__name__}"], "suggestions": []}
        issues = [*problems, *critique["issues"]]
        passed = (not problems and critique["verdict"] == "pass" and critique["score"] >= self.cfg.pass_score
                  and critique["grounded" if docs else "answers_question"])
        feedback = "\n".join([f"- {i}" for i in issues] + [f"- suggestion: {s}" for s in critique["suggestions"]])
        revisions = state.get("revisions", 0) + (0 if passed else 1)
        critique = {**critique, "draft_checks": {k: v for k, v in checks.items() if k != "data"}, "passed": passed}
        return {"critique": critique, "draft_checks": checks["data"], "passed": passed, "feedback": feedback,
                "revisions": revisions,
                "_note": f"{'PASS' if passed else 'REVISE'} score={critique['score']:.2f} issues={len(issues)}"}

    async def _finalize(self, state: AgentState) -> dict[str, Any]:
        draft = state.get("draft", "")
        if state.get("passed"):
            return {"final": draft, "_note": "accepted"}
        if draft:
            issues = state.get("critique", {}).get("issues") or []
            note = "\n\n[Note: this answer did not fully pass the automated quality review" + (f" ({issues[0]})" if issues else "") + ".]"
            return {"final": draft + note, "_note": "best effort (review not passed)"}
        return {"final": "I could not produce an answer: " + (state.get("error") or "the model returned nothing."),
                "_note": "failed"}

    # ------------------------------------------------------------------ routing
    def _after_parse(self, state: AgentState) -> str:
        if state.get("error"):
            return "finalize"
        return {"memory": "retrieve", "web": "ingest_web", "direct": "generate"}[state["route"]]

    def _after_retrieve(self, state: AgentState) -> str:
        if state.get("error"):
            return "finalize"
        poor = state.get("best_score", 0.0) < self.cfg.min_retrieval_score or not state.get("docs")
        if (poor and state.get("mode") == "online" and self.deps.web is not None
                and state.get("web_attempts", 0) < self.cfg.max_web_attempts and not state.get("urls")):
            return "ingest_web"
        return "generate"

    def _after_generate(self, state: AgentState) -> str:
        return "finalize" if state.get("error") else "critic"

    def _after_critic(self, state: AgentState) -> str:
        if state.get("error") or state.get("passed"):
            return "finalize"
        c = state.get("critique", {})
        can_web = (state.get("mode") == "online" and self.deps.web is not None
                   and state.get("web_attempts", 0) < self.cfg.max_web_attempts)
        if c.get("needs_more_context") and can_web and state.get("revisions", 0) <= self.cfg.max_revisions:
            return "ingest_web"
        return "generate" if state.get("revisions", 0) <= self.cfg.max_revisions else "finalize"

    # ------------------------------------------------------------------ graph
    def _build(self, checkpointer: Any | None) -> Any:
        g: StateGraph = StateGraph(AgentState)
        for name, fn in (("parse", self._parse), ("retrieve", self._retrieve), ("ingest_web", self._ingest_web),
                         ("generate", self._generate), ("critic", self._critic), ("finalize", self._finalize)):
            g.add_node(name, instrumented(name, fn))
        g.add_edge(START, "parse")
        g.add_conditional_edges("parse", self._after_parse, {"retrieve": "retrieve", "ingest_web": "ingest_web",
                                                            "generate": "generate", "finalize": "finalize"})
        g.add_conditional_edges("retrieve", self._after_retrieve, {"ingest_web": "ingest_web", "generate": "generate",
                                                                  "finalize": "finalize"})
        g.add_edge("ingest_web", "retrieve")
        g.add_conditional_edges("generate", self._after_generate, {"critic": "critic", "finalize": "finalize"})
        g.add_conditional_edges("critic", self._after_critic, {"generate": "generate", "ingest_web": "ingest_web",
                                                              "finalize": "finalize"})
        g.add_edge("finalize", END)
        return g.compile(checkpointer=checkpointer or MemorySaver())

    # ------------------------------------------------------------------ public API
    def _initial(self, question: str, history: Sequence[Mapping[str, str]] | None, mode: Mode, run_id: str) -> AgentState:
        if not question.strip():
            raise ValueError("question must not be empty")
        if mode not in ("online", "offline"):
            raise ValueError("mode must be 'online' or 'offline'")
        return AgentState(run_id=run_id, question=question.strip(), history=_recent(history or [], self.cfg.history_turns),
                          mode=mode, docs=[], style_rules=[], web_attempts=0, revisions=0, trace=[])

    async def stream(self, question: str, *, history: Sequence[Mapping[str, str]] | None = None, mode: Mode = "online",
                     run_id: str | None = None, recursion_limit: int = 40) -> AsyncIterator[dict[str, Any]]:
        """Yield UI events: node_start, token, node_end, state (after each node) and a final 'result'."""
        rid = run_id or uuid.uuid4().hex[:12]
        state = self._initial(question, history, mode, rid)
        config = {"configurable": {"thread_id": rid}, "recursion_limit": recursion_limit}
        yield {"event": "run_start", "run_id": rid, "mode": mode}
        async for kind, payload in self.graph.astream(state, config, stream_mode=["custom", "updates"]):
            if kind == "custom":
                yield payload
            else:
                for node, upd in payload.items():
                    if isinstance(upd, dict):
                        yield {"event": "state", "node": node, "run_id": rid,
                               "keys": sorted(k for k in upd if k != "trace")}
        snap = await self.graph.aget_state(config)
        values = dict(snap.values)
        yield {"event": "result", "run_id": rid, "answer": values.get("final", ""), "passed": bool(values.get("passed")),
               "route": values.get("route"), "revisions": values.get("revisions", 0),
               "sources": [{"n": d["n"], "source": d["source"], "score": d["score"]} for d in values.get("docs", [])],
               "critique": values.get("critique"), "trace": values.get("trace", []), "error": values.get("error")}

    async def forget(self, run_id: str) -> None:
        """Drop the checkpointed state of a finished run (keeps long-lived servers from leaking memory)."""
        saver = self.graph.checkpointer
        if hasattr(saver, "adelete_thread"):
            await saver.adelete_thread(run_id)

    async def run(self, question: str, **kw: Any) -> dict[str, Any]:
        """Run to completion and return the 'result' event."""
        result: dict[str, Any] = {}
        async for ev in self.stream(question, **kw):
            if ev["event"] == "result":
                result = ev
        return result
