# ClawBot Core

Self-hosted agent: local LLM (Ollama / vLLM) + local embeddings (BGE) + ChromaDB + headless Chromium. No paid APIs.

```
core/llm/inference.py        streaming client, JSON-schema extraction, exponential backoff
core/memory/vector_store.py  chunking -> sentence-transformers -> ChromaDB (cosine), persistence, export/import
core/memory/preferences.py   edit/reject deltas -> structural rules -> high-priority few-shot vectors
core/agent/executor.py       LangGraph: parse -> retrieve | ingest_web -> generate -> critic (loop) -> finalize
core/agent/browser.py        stealth Playwright, DOM-mutation waiting, HTML->Markdown, SSRF guard, leak guards
core/api/server.py           FastAPI: /ws token + node stream, /api/feedback webhook, rules, ingest, health
run.py                       launcher (use this on Windows)
```

## One-time setup (needs Python 3.11+, run inside `clawbot/`)

**Windows (PowerShell)**
```powershell
cd clawbot
py -3.11 -m venv .venv          # or: python -m venv .venv
.\.venv\Scripts\Activate.ps1    # if blocked: Set-ExecutionPolicy -Scope Process Bypass
pip install -r requirements.txt
playwright install chromium
```
**macOS / Linux**
```bash
cd clawbot
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install --with-deps chromium     # on macOS: playwright install chromium
```
**Local model (Ollama)** – install from ollama.com, then:
```
ollama pull llama3.1:8b
```
The first question downloads the embedding model (BAAI/bge-large-en-v1.5, ~1.3 GB) once. To pre-download it, or to use a lighter one
on a small machine (`--embed-model BAAI/bge-small-en-v1.5`, ~130 MB), run:
`python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-large-en-v1.5')"`.
Do not switch embedding models on an existing data folder; ClawBot refuses to mix them (delete `data/` or use `--data-dir` for a new one).

## Every time
Terminal 1 – the model server (skip if Ollama already runs as a service): `ollama serve`
Terminal 2 – ClawBot:
```
cd clawbot
python run.py                      # ws://127.0.0.1:8765/ws   health: http://127.0.0.1:8765/health
```
Options: `--model`, `--llm-url`, `--backend vllm`, `--embed-model`, `--data-dir`, `--port`, `--token SECRET`
(same as env `CLAWBOT_MODEL`, `CLAWBOT_LLM_URL`, `CLAWBOT_BACKEND`, `CLAWBOT_EMBED_MODEL`, `CLAWBOT_DATA_DIR`, `CLAWBOT_PORT`, `CLAWBOT_TOKEN`;
`CLAWBOT_ORIGINS=https://my.site` adds browser origins, `CLAWBOT_ALLOW_PRIVATE_HOSTS=1` lets the scraper reach LAN/localhost pages).
Terminal 3 – the web app: `cd frontend && npm install && npm run dev`, open the sidebar entry **ClawBot Core**.
If the page says it cannot connect, check the URL under the gear icon (default `ws://127.0.0.1:8765/ws`).

## Troubleshooting
| Symptom | Fix |
|---|---|
| "Cannot reach the ollama server" | start `ollama serve`; check `CLAWBOT_LLM_URL` |
| "Model 'x' is not available" | `ollama pull x` or `python run.py --model <installed name>` |
| "cannot launch chromium" | `playwright install chromium` (Linux: add `--with-deps`) |
| `NotImplementedError` from asyncio on Windows | start with `python run.py`, never `uvicorn --reload` |
| Disconnected badge | ClawBot not running, wrong port, or token mismatch (gear icon) |
| "built with a different embedding model" | you changed `--embed-model`; use a new `--data-dir` |
| `pip install` fails building chromadb | upgrade pip (`python -m pip install -U pip`) and use Python 3.11-3.13 |

## Tests
```
pip install -r requirements-dev.txt
pytest                                   # 56 tests: fake LLM, real Chromium, real ChromaDB
python -m tests.dev_server               # fake-LLM server on :8765 for UI work
node ../frontend/tools/e2e_clawbot.mjs   # dashboard browser test (needs `npm run preview -- --port 5300`)
```
