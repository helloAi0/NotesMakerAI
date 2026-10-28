import random

import httpx

from core.agent.browser import StealthBrowser
from core.agent.executor import Agent, AgentConfig, AgentDeps
from core.llm.inference import InferenceClient, LLMConfig
from core.memory.vector_store import VectorStore
from tests.test_browser import cfg, server  # noqa: F401  (fixture)
from tests.test_executor import CRIT, Script, nosleep
from tests.test_vector_store import HashEmbedder


async def test_agent_ingests_live_page_end_to_end(tmp_path, server):  # noqa: F811
    plan = {"route": "web", "reason": "url given", "search_queries": [], "urls": [server + "/article"],
            "rewritten_question": "What is a qubit and which gates exist?"}
    script = Script([plan], ["A qubit is a two-level system [1]; the X gate is a bit flip [1]."], [CRIT()])
    llm = InferenceClient(LLMConfig(base_url="http://local", max_retries=0), transport=httpx.MockTransport(script),
                          sleep=nosleep, rng=random.Random(0))
    store = VectorStore(tmp_path / "db", embedder=HashEmbedder(), chunk_size=400, chunk_overlap=60)
    async with StealthBrowser(cfg()) as web:
        agent = Agent(AgentDeps(llm, store, web, AgentConfig(min_retrieval_score=0.0)))
        async with llm:
            r = await agent.run("What is a qubit and which gates exist?")
        assert web.open_contexts == 0
    assert r["passed"] and [t["node"] for t in r["trace"]][:3] == ["parse", "ingest_web", "retrieve"]
    assert r["sources"][0]["source"].endswith("/article")
    ctx = [b for k, b in script.calls if k == "gen"][0]["messages"][0]["content"]
    assert "bit flip" in ctx and "cookies" not in ctx
