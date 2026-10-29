"""A tiny Ollama-protocol HTTP server (real sockets, real chunked NDJSON) for end-to-end tests.
    python -m tests.fake_ollama 11500
"""
import asyncio
import sys

import httpx
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

from tests.dev_server import handler

app = FastAPI()


@app.get("/api/tags")
async def tags():
    return {"models": [{"name": "llama3.1:8b"}]}


@app.post("/api/chat")
async def chat(req: Request):
    raw = await req.body()
    resp = await handler(httpx.Request("POST", "http://x/api/chat", content=raw))
    body = await resp.aread()

    async def gen():
        for line in body.split(b"\n"):
            if line:
                await asyncio.sleep(0.02)
                yield line + b"\n"
    return StreamingResponse(gen(), media_type="application/x-ndjson")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(sys.argv[1]) if len(sys.argv) > 1 else 11500, log_level="warning")
