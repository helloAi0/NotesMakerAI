import json
import random

import httpx
import pytest

from core.llm.inference import (InferenceClient, LLMConfig, LLMConnectionError, LLMResponseError, LLMSchemaError,
                                parse_json_loose)


def ollama_stream(parts):
    lines = [json.dumps({"message": {"role": "assistant", "content": p}, "done": False}) for p in parts]
    lines.append(json.dumps({"message": {"content": ""}, "done": True}))
    return "\n".join(lines).encode()


def sse(parts):
    lines = [f"data: {json.dumps({'choices': [{'delta': {'content': p}}]})}" for p in parts]
    lines += ['data: {"choices":[{"delta":{},"finish_reason":"stop"}]}', "data: [DONE]"]
    return "\n\n".join(lines).encode()


async def nosleep(_):
    return None


def client(handler, backend="ollama", **cfg):
    c = LLMConfig(backend=backend, base_url="http://local", **cfg)
    return InferenceClient(c, transport=httpx.MockTransport(handler), sleep=nosleep, rng=random.Random(1))


async def test_ollama_stream_and_generate():
    seen = {}

    def h(req):
        seen.update(json.loads(req.content), path=req.url.path)
        return httpx.Response(200, content=ollama_stream(["Hel", "lo ", "world"]))

    async with client(h) as llm:
        toks = [t async for t in llm.stream([{"role": "user", "content": "hi"}])]
        res = await llm.generate([{"role": "user", "content": "hi"}])
    assert toks == ["Hel", "lo ", "world"] and res.text == "Hello world" and res.chunks == 3
    assert seen["path"] == "/api/chat" and seen["stream"] is True


async def test_vllm_sse_stream_and_json_mode():
    seen = {}

    def h(req):
        seen.update(json.loads(req.content), path=req.url.path, auth=req.headers.get("authorization"))
        return httpx.Response(200, content=sse(["a", "b", "c"]))

    async with client(h, backend="vllm", api_key="k") as llm:
        text = await llm.complete("x", json_mode=True)
    assert text == "abc" and seen["path"] == "/v1/chat/completions"
    assert seen["response_format"] == {"type": "json_object"} and seen["auth"] == "Bearer k"


async def test_backoff_retries_then_succeeds():
    calls = {"n": 0}

    def h(req):
        calls["n"] += 1
        if calls["n"] == 1:
            raise httpx.ConnectError("refused")
        if calls["n"] == 2:
            return httpx.Response(503, text="loading model")
        return httpx.Response(200, content=ollama_stream(["ok"]))

    async with client(h) as llm:
        res = await llm.generate([{"role": "user", "content": "x"}])
        delays = list(llm.retry_log)
    assert res.text == "ok" and res.attempts == 3 and len(delays) == 2
    assert delays[1] > delays[0] * 0.9 and all(d <= 20 for d in delays)


async def test_backoff_exhaustion_raises_connection_error():
    def h(req):
        raise httpx.ConnectTimeout("t")

    async with client(h, max_retries=2) as llm:
        with pytest.raises(LLMConnectionError):
            await llm.complete("x")
        assert len(llm.retry_log) == 2


async def test_non_retryable_status_fails_fast():
    def h(req):
        return httpx.Response(404, text='{"error":"model not found"}')

    async with client(h) as llm:
        with pytest.raises(LLMResponseError) as e:
            await llm.complete("x")
        assert e.value.status == 404 and llm.retry_log == []


async def test_stream_error_line_raises():
    def h(req):
        return httpx.Response(200, content=json.dumps({"error": "out of memory"}).encode())

    async with client(h) as llm:
        with pytest.raises(LLMResponseError, match="out of memory"):
            await llm.complete("x")


SCHEMA = {"type": "object", "properties": {"route": {"enum": ["memory", "web"]}, "confidence": {"type": "number"}},
          "required": ["route", "confidence"], "additionalProperties": False}


async def test_extract_json_repairs_after_invalid_output():
    outs = ['Sure! {"route": "nowhere", "confidence": 0.4}', '```json\n{"route": "web", "confidence": 0.9}\n```']
    bodies = []

    def h(req):
        bodies.append(json.loads(req.content))
        return httpx.Response(200, content=ollama_stream([outs[len(bodies) - 1]]))

    async with client(h) as llm:
        v = await llm.extract_json("where?", SCHEMA)
    assert v == {"route": "web", "confidence": 0.9}
    assert "JSON Schema" in bodies[0]["messages"][0]["content"] and bodies[0]["format"] == "json"
    assert "invalid" in bodies[1]["messages"][-1]["content"]


async def test_extract_json_gives_up():
    def h(req):
        return httpx.Response(200, content=ollama_stream(["not json at all"]))

    async with client(h, max_schema_attempts=2) as llm:
        with pytest.raises(LLMSchemaError) as e:
            await llm.extract_json("x", SCHEMA)
    assert e.value.last_output == "not json at all"


def test_parse_json_loose():
    assert parse_json_loose('text {"a": "}{", "b": [1, {"c": 2}]} tail') == {"a": "}{", "b": [1, {"c": 2}]}
    assert parse_json_loose("```\n[1,2]\n```") == [1, 2]
    with pytest.raises(ValueError):
        parse_json_loose("nothing")


async def test_health_and_models():
    def h(req):
        return httpx.Response(200, json={"models": [{"name": "llama3.1:8b"}]})

    async with client(h) as llm:
        assert await llm.health() and await llm.list_models() == ["llama3.1:8b"]
