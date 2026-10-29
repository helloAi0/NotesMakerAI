"""Start ClawBot Core:  python run.py [--host 127.0.0.1] [--port 8765] [--model llama3.1:8b] [--backend ollama|vllm]

Use this instead of calling ``uvicorn --reload`` on Windows: Playwright needs the Proactor event loop,
which uvicorn's reloader replaces. This launcher selects it explicitly and never uses the reloader.
"""
import argparse
import asyncio
import os
import sys


def main() -> int:
    if sys.version_info < (3, 11):
        print(f"ClawBot needs Python 3.11 or newer (found {sys.version.split()[0]}).", file=sys.stderr)
        return 2
    ap = argparse.ArgumentParser(description="ClawBot Core server")
    ap.add_argument("--host", default=os.getenv("CLAWBOT_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.getenv("CLAWBOT_PORT", "8765")))
    ap.add_argument("--backend", choices=["ollama", "vllm"], help="LLM server type (CLAWBOT_BACKEND)")
    ap.add_argument("--llm-url", help="LLM server URL (CLAWBOT_LLM_URL), default http://127.0.0.1:11434")
    ap.add_argument("--model", help="model name (CLAWBOT_MODEL), default llama3.1:8b")
    ap.add_argument("--embed-model", help="sentence-transformers model (CLAWBOT_EMBED_MODEL), default BAAI/bge-large-en-v1.5")
    ap.add_argument("--data-dir", help="where ChromaDB persists (CLAWBOT_DATA_DIR), default ./data")
    ap.add_argument("--token", help="require this bearer token (CLAWBOT_TOKEN)")
    a = ap.parse_args()
    for env, val in (("CLAWBOT_BACKEND", a.backend), ("CLAWBOT_LLM_URL", a.llm_url), ("CLAWBOT_MODEL", a.model),
                     ("CLAWBOT_EMBED_MODEL", a.embed_model), ("CLAWBOT_DATA_DIR", a.data_dir), ("CLAWBOT_TOKEN", a.token)):
        if val:
            os.environ[env] = val
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    import uvicorn
    from core.api.server import create_app
    print(f"ClawBot Core listening on ws://{a.host}:{a.port}/ws  (health: http://{a.host}:{a.port}/health)")
    uvicorn.run(create_app(), host=a.host, port=a.port, log_level="info", loop="asyncio")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
