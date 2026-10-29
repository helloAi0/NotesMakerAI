import json
import random

import httpx
import pytest

from core.agent.executor import Agent, AgentConfig, AgentDeps, analyze_draft, build_context
from core.llm.inference import InferenceClient, LLMConfig
from core.memory.vector_store import VectorStore
from tests.test_vector_store import HashEmbedder


def ndjson(text, parts=3):
    n = max(1, len(text) // parts)
    chunks = [text[i:i + n] for i in range(0, len(text), n)]
    lines = [json.dumps({"message": {"content": c}, "done": False}) for c in chunks]
    return ("\n".join(lines + [json.dumps({"done": True, "message": {"content": ""}})])).encode()


class Script:
    """Fake local LLM: dispatches on which module (plan / critic / generator) is calling."""

    def __init__(self, plans, drafts, critiques):
        self.plans, self.drafts, self.critiques = list(plans), list(drafts), list(critiques)
        self.calls = []

    def __call__(self, req):
        if req.method == "GET":
            return httpx.Response(200, json={"models": [{"name": "llama3.1:8b"}]})
        body = json.loads(req.content)
        sys = body["messages"][0]["content"]
        if "planning module" in sys:
            kind, queue = "plan", self.plans
        elif "strict reviewer" in sys:
            kind, queue = "critic", self.critiques
        else:
            kind, queue = "gen", self.drafts
        item = queue.pop(0) if len(queue) > 1 else queue[0]
        self.calls.append((kind, body))
        return httpx.Response(200, content=ndjson(item if isinstance(item, str) else json.dumps(item)))


def PLAN(route="memory", **kw):
    return {"route": route, "reason": "r", "search_queries": kw.get("q", ["quantum error correction"] if route == "web" else []),
            "urls": [], "rewritten_question": kw.get("rq", "Which language has a borrow checker?")}


def CRIT(verdict="pass", score=0.9, more=False, issues=()):
    return {"verdict": verdict, "score": score, "grounded": True, "answers_question": True,
            "needs_more_context": more, "issues": list(issues), "suggestions": ["be specific"] if issues else []}


class FakeWeb:
    def __init__(self, text="Quantum error correction uses redundancy across many qubits to protect information."):
        self.text, self.calls = text, []

    async def ingest(self, queries, urls, *, max_pages):
        self.calls.append((list(queries), list(urls)))
        return [{"url": "https://example.org/qec", "title": "QEC", "text": self.text}]


async def nosleep(_): return None


def make(tmp_path, script, web=None, **cfg):
    llm = InferenceClient(LLMConfig(base_url="http://local", max_retries=0), transport=httpx.MockTransport(script),
                          sleep=nosleep, rng=random.Random(0))
    store = VectorStore(tmp_path / "db", embedder=HashEmbedder(), chunk_size=300, chunk_overlap=40)
    store.add_text("The Rust borrow checker enforces memory safety without a garbage collector.", source="notes/rust")
    return llm, store, Agent(AgentDeps(llm, store, web, AgentConfig(**cfg)))


def nodes(result):
    return [t["node"] for t in result["trace"]]


async def test_memory_route_passes_first_time(tmp_path):
    s = Script([PLAN()], ["Rust has a borrow checker [1]."], [CRIT()])
    llm, store, agent = make(tmp_path, s)
    async with llm:
        r = await agent.run("Which language has a borrow checker?")
    assert nodes(r) == ["parse", "retrieve", "generate", "critic", "finalize"]
    assert r["passed"] and r["answer"] == "Rust has a borrow checker [1]." and r["route"] == "memory"
    assert r["sources"][0]["source"] == "notes/rust" and r["revisions"] == 0


async def test_critic_rejects_then_generator_revises(tmp_path):
    s = Script([PLAN()], ["Rust has one.", "Rust has a borrow checker [1]."],
               [CRIT("revise", 0.4, issues=["too vague"]), CRIT()])
    llm, store, agent = make(tmp_path, s)
    async with llm:
        r = await agent.run("Which language has a borrow checker?")
    assert nodes(r) == ["parse", "retrieve", "generate", "critic", "generate", "critic", "finalize"]
    assert r["passed"] and r["revisions"] == 1 and "[1]" in r["answer"]
    second_gen = [b for k, b in s.calls if k == "gen"][1]
    assert "REVIEW FEEDBACK" in second_gen["messages"][-1]["content"] and "cites no source" in second_gen["messages"][-1]["content"]


async def test_revision_budget_exhausted_returns_best_effort(tmp_path):
    s = Script([PLAN()], ["Bad answer without citations."], [CRIT("revise", 0.2, issues=["wrong"])])
    llm, store, agent = make(tmp_path, s, max_revisions=1)
    async with llm:
        r = await agent.run("Which language has a borrow checker?")
    assert nodes(r).count("generate") == 2 and not r["passed"]
    assert "did not fully pass" in r["answer"] and nodes(r)[-1] == "finalize"


async def test_invalid_citation_forces_revision_even_if_llm_critic_passes(tmp_path):
    s = Script([PLAN()], ["Rust [7].", "Rust [1]."], [CRIT()])
    llm, store, agent = make(tmp_path, s)
    async with llm:
        r = await agent.run("Which language has a borrow checker?")
    assert nodes(r).count("generate") == 2 and r["answer"] == "Rust [1]."


async def test_web_route_ingests_then_retrieves(tmp_path):
    web = FakeWeb()
    s = Script([PLAN("web", rq="How does quantum error correction work?")], ["It uses redundancy [1]."], [CRIT()])
    llm, store, agent = make(tmp_path, s, web=web)
    async with llm:
        r = await agent.run("How does quantum error correction work?")
    assert nodes(r) == ["parse", "ingest_web", "retrieve", "generate", "critic", "finalize"]
    assert web.calls and r["sources"][0]["source"] == "https://example.org/qec" and r["passed"]
    assert store.sources().get("https://example.org/qec")


async def test_offline_mode_never_touches_web(tmp_path):
    web = FakeWeb()
    s = Script([PLAN("web")], ["Rust [1]."], [CRIT()])
    llm, store, agent = make(tmp_path, s, web=web)
    async with llm:
        r = await agent.run("What is the latest news?", mode="offline")
    assert web.calls == [] and "ingest_web" not in nodes(r) and r["route"] == "memory"


async def test_poor_retrieval_falls_back_to_web_when_online(tmp_path):
    web = FakeWeb()
    s = Script([PLAN("memory", rq="quantum error correction redundancy qubits")], ["Redundancy [1]."], [CRIT()])
    llm, store, agent = make(tmp_path, s, web=web, min_retrieval_score=0.5)
    async with llm:
        r = await agent.run("quantum error correction redundancy qubits")
    assert nodes(r) == ["parse", "retrieve", "ingest_web", "retrieve", "generate", "critic", "finalize"]


async def test_critic_requests_more_context_triggers_web(tmp_path):
    web = FakeWeb()
    s = Script([PLAN()], ["Rust [1].", "Redundancy [1] [2]."], [CRIT("revise", 0.4, more=True, issues=["missing facts"]), CRIT()])
    llm, store, agent = make(tmp_path, s, web=web, min_retrieval_score=0.0)
    async with llm:
        r = await agent.run("Which language has a borrow checker?")
    assert "ingest_web" in nodes(r) and r["passed"]


async def test_direct_route_needs_no_citations(tmp_path):
    s = Script([PLAN("direct")], ["Hello! Four."], [CRIT()])
    llm, store, agent = make(tmp_path, s)
    async with llm:
        r = await agent.run("what is 2+2")
    assert nodes(r) == ["parse", "generate", "critic", "finalize"] and r["passed"]


async def test_planner_failure_uses_heuristic(tmp_path):
    s = Script(["not json"], ["Rust [1]."], [CRIT()])
    llm, store, agent = make(tmp_path, s)
    async with llm:
        r = await agent.run("Which language has a borrow checker?")
    assert r["trace"][0]["note"].startswith("heuristic plan") and r["passed"]


async def test_streaming_events_and_style_rules(tmp_path):
    s = Script([PLAN()], ["Rust has a borrow checker [1]."], [CRIT()])
    llm, store, agent = make(tmp_path, s, style_rule_min_score=0.05)
    store.add_text("Always answer in one short sentence about the borrow checker.", source="rule:1",
                   metadata={"kind": "preference_rule", "scope": "topic"}, priority=1.0, chunk=False)
    async with llm:
        evs = [e async for e in agent.stream("Which language has a borrow checker?")]
    kinds = [e["event"] for e in evs]
    assert kinds[0] == "run_start" and kinds[-1] == "result" and "token" in kinds
    starts = [e["node"] for e in evs if e["event"] == "node_start"]
    assert starts == ["parse", "retrieve", "generate", "critic", "finalize"]
    assert "".join(e["text"] for e in evs if e["event"] == "token") == "Rust has a borrow checker [1]."
    gen_sys = [b for k, b in s.calls if k == "gen"][0]["messages"][0]["content"]
    assert "USER PREFERENCES" in gen_sys and "rule:1" not in gen_sys.split("CONTEXT:")[1].split("USER PREFERENCES")[0]
    assert all(d["source"] != "rule:1" for d in evs[-1]["sources"])


def test_analyze_draft_and_context():
    ok = analyze_draft("Fact one [1] and two [2].", 2, require_citations=True)
    assert ok["ok"] and ok["data"]["citations"] == [1, 2]
    assert not analyze_draft("TODO write this", 0, require_citations=False)["ok"]
    assert not analyze_draft("As an AI language model I can't", 0, require_citations=False)["ok"]
    assert build_context([{"n": 1, "id": "a", "source": "s", "text": "x" * 50, "score": 1}], 10) == ""


async def test_empty_question_rejected(tmp_path):
    llm, store, agent = make(tmp_path, Script([PLAN()], ["x"], [CRIT()]))
    with pytest.raises(ValueError):
        await agent.run("   ")
