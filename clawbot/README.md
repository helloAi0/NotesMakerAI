# ClawBot Core

Self-hosted agent: local LLM (Ollama / vLLM) + local embeddings (BGE-Large) + ChromaDB + headless Chromium. No paid APIs.

```
core/llm/inference.py        streaming client, JSON-schema extraction, exponential backoff
core/memory/vector_store.py  chunking -> sentence-transformers -> ChromaDB (cosine), persistence, export/import
core/memory/preferences.py   edit/reject deltas -> structural rules -> high-priority few-shot vectors
core/agent/executor.py       LangGraph: parse -> retrieve | ingest_web -> generate -> critic (loop) -> finalize
core/agent/browser.py        stealth Playwright, DOM-mutation waiting, HTML->Markdown, SSRF guard, leak guards
core/api/server.py           FastAPI: /ws token + node stream, /api/feedback webhook, rules, ingest, health
```

## Run
```
cd clawbot
pip install -r requirements.txt && playwright install chromium
ollama pull llama3.1:8b            # or run vLLM and set CLAWBOT_BACKEND=vllm
uvicorn core.api.server:app --host 127.0.0.1 --port 8765
```
Env: `CLAWBOT_BACKEND`, `CLAWBOT_LLM_URL`, `CLAWBOT_MODEL`, `CLAWBOT_EMBED_MODEL`, `CLAWBOT_DATA_DIR`, `CLAWBOT_TOKEN`, `CLAWBOT_ORIGINS`.

Frontend: open **ClawBot Core** in the sidebar (Settings gear sets the WebSocket URL / token).

## Test
`pytest` (53 tests, fake LLM + real Chromium) · UI: `python -m tests.dev_server` then `node frontend/tools/e2e_clawbot.mjs`.
