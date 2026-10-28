"""Fake-LLM ClawBot server for UI development and e2e tests (no Ollama, no model download).

    python -m tests.dev_server [port]
Questions containing "latest" take the web route; the first draft of a question containing "revise"
is rejected by the critic once so the reflection loop is visible.
"""
import asyncio
import json
import random
import sys
import tempfile
from pathlib import Path

import httpx
import uvicorn

from core.agent.executor import AgentConfig
from core.api.server import Settings, create_app
from core.llm.inference import InferenceClient, LLMConfig
from core.memory.vector_store import VectorStore
from tests.test_vector_store import HashEmbedder

DELAY = 0.35


def nd(text: str) -> bytes:
    n = 6
    parts = [text[i:i + n] for i in range(0, len(text), n)] or [""]
    return "\n".join([json.dumps({"message": {"content": p}, "done": False}) for p in parts] + [json.dumps({"done": True, "message": {"content": ""}})]).encode()


class SlowStream(httpx.AsyncByteStream):
    """Sends NDJSON lines one at a time with a pause so the UI shows real token streaming."""

    def __init__(self, payload: bytes, pause: float = 0.05) -> None:
        self.lines, self.pause = payload.split(b"\n"), pause

    async def __aiter__(self):
        for ln in self.lines:
            await asyncio.sleep(self.pause)
            yield ln + b"\n"


class FakeWeb:
    async def ingest(self, queries, urls, *, max_pages):
        await asyncio.sleep(0.8)
        return [{"url": "https://example.org/latest", "title": "Latest", "text": "Fresh web page about the latest developments in local AI agents and vector memory."}]


async def handler(req: httpx.Request) -> httpx.Response:
    if req.method == "GET":
        return httpx.Response(200, json={"models": [{"name": "fake"}]})
    await asyncio.sleep(DELAY)
    body = json.loads(req.content)
    sys_prompt, user = body["messages"][0]["content"], body["messages"][-1]["content"]
    if "planning module" in sys_prompt:
        web = "latest" in user.lower() and "NOT" not in sys_prompt.split("DISABLED")[0] and "DISABLED" not in sys_prompt
        return httpx.Response(200, content=nd(json.dumps({"route": "web" if web else "memory", "reason": "dev", "search_queries": ["latest local ai agents"] if web else [],
                                                          "urls": [], "rewritten_question": user})))
    if "strict reviewer" in sys_prompt:
        bad = "revise" in user.lower() and "IMPROVED" not in user
        return httpx.Response(200, content=nd(json.dumps({"verdict": "revise" if bad else "pass", "score": 0.4 if bad else 0.92, "grounded": True, "answers_question": True,
                                                          "needs_more_context": False, "issues": ["Too vague, add specifics"] if bad else [], "suggestions": ["Be concrete"] if bad else []})))
    improved = "REVIEW FEEDBACK" in user
    return httpx.Response(200, stream=SlowStream(nd(("IMPROVED: " if improved else "") + "ClawBot keeps memory locally and cites its sources [1]. Sure! It is basically very useful.")))


def main(port: int) -> None:
    llm = InferenceClient(LLMConfig(base_url="http://local", max_retries=0), transport=httpx.MockTransport(handler))
    store = VectorStore(Path(tempfile.mkdtemp()) / "db", embedder=HashEmbedder())
    store.add_text("ClawBot is a local agent that stores memory in ChromaDB and answers with citations.", source="notes/clawbot")
    origins = ["http://localhost:5173", "http://127.0.0.1:5173", "http://127.0.0.1:5300", "http://localhost:5300"]
    app = create_app(Settings(origins=origins), llm=llm, store=store, web=FakeWeb(), agent_config=AgentConfig(min_retrieval_score=0.0))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 8765)
