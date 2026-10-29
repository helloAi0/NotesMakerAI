import json
import random

import httpx
import pytest
from starlette.testclient import TestClient

from core.agent.executor import AgentConfig
from core.api.server import Settings, create_app
from core.llm.inference import InferenceClient, LLMConfig
from core.memory.preferences import PreferenceMemory, analyze_delta
from core.memory.vector_store import VectorStore
from tests.test_executor import CRIT, PLAN, FakeWeb, Script, nosleep
from tests.test_vector_store import HashEmbedder

Q = "Which language has a borrow checker?"


def build(tmp_path, script=None, token=None, **kw):
    script = script or Script([PLAN()], ["Rust has a borrow checker [1]."], [CRIT()])
    llm = InferenceClient(LLMConfig(base_url="http://local", max_retries=0), transport=httpx.MockTransport(script),
                          sleep=nosleep, rng=random.Random(0))
    store = VectorStore(tmp_path / "db", embedder=HashEmbedder(), chunk_size=300, chunk_overlap=40)
    store.add_text("The Rust borrow checker enforces memory safety without a garbage collector.", source="notes/rust")
    s = Settings(token=token, data_dir=str(tmp_path))
    app = create_app(s, llm=llm, store=store, web=kw.pop("web", FakeWeb()), agent_config=AgentConfig(**kw))
    return app, script, store


def collect(ws, until=("result", "error", "cancelled")):
    out = []
    while True:
        ev = json.loads(ws.receive_text())
        out.append(ev)
        if ev["event"] in until:
            return out


def test_ws_streams_tokens_and_node_events(tmp_path):
    app, script, _ = build(tmp_path)
    with TestClient(app) as c, c.websocket_connect("/ws") as ws:
        assert json.loads(ws.receive_text())["event"] == "ready"
        ws.send_text(json.dumps({"type": "ask", "question": Q, "mode": "offline"}))
        evs = collect(ws)
    kinds = [e["event"] for e in evs]
    assert kinds[0] == "run_start" and kinds[-1] == "result" and kinds.count("node_start") == 5
    assert [e["seq"] for e in evs] == list(range(2, 2 + len(evs)))              # strictly increasing
    assert "".join(e["text"] for e in evs if e["event"] == "token") == "Rust has a borrow checker [1]."
    res = evs[-1]
    assert res["passed"] and res["answer"].startswith("Rust") and res["sources"][0]["source"] == "notes/rust"
    order = [e["node"] for e in evs if e["event"] in ("node_start",)]
    assert order == ["parse", "retrieve", "generate", "critic", "finalize"]


def test_ws_validation_errors_and_modes(tmp_path):
    app, *_ = build(tmp_path)
    with TestClient(app) as c, c.websocket_connect("/ws") as ws:
        ws.receive_text()
        for frame, code in [("not json", "bad_json"), ("[1]", "bad_json"), ('{"type":"zzz"}', "unknown_type"),
                            ('{"type":"ask","question":"  "}', "bad_question"),
                            ('{"type":"ask","question":"hi","mode":"hybrid"}', "bad_mode"),
                            ('{"type":"set_mode","mode":"x"}', "bad_mode")]:
            ws.send_text(frame)
            ev = json.loads(ws.receive_text())
            assert ev["event"] == "error" and ev["code"] == code, (frame, ev)
        ws.send_text('{"type":"ping"}')
        assert json.loads(ws.receive_text())["event"] == "pong"
        ws.send_text('{"type":"set_mode","mode":"offline"}')
        assert json.loads(ws.receive_text()) ["mode"] == "offline"


def test_offline_toggle_blocks_web_online_uses_it(tmp_path):
    web = FakeWeb()
    script = Script([PLAN("web", rq="How does quantum error correction work?")], ["Redundancy [1]."], [CRIT()])
    app, *_ = build(tmp_path, script, web=web)
    with TestClient(app) as c, c.websocket_connect("/ws") as ws:
        ws.receive_text()
        ws.send_text(json.dumps({"type": "ask", "question": "quantum error correction?", "mode": "offline"}))
        r1 = collect(ws)[-1]
        assert web.calls == [] and r1["route"] == "memory"
        ws.send_text(json.dumps({"type": "ask", "question": "quantum error correction?", "mode": "online"}))
        r2 = collect(ws)[-1]
        assert web.calls and r2["route"] == "web"


def test_preflight_gives_actionable_errors(tmp_path):
    def mk(handler):
        llm = InferenceClient(LLMConfig(base_url="http://local", max_retries=0), transport=httpx.MockTransport(handler), sleep=nosleep)
        store = VectorStore(tmp_path / "pf", embedder=HashEmbedder())
        return create_app(Settings(), llm=llm, store=store, web=FakeWeb())

    def down(req):
        raise httpx.ConnectError("refused")
    with TestClient(mk(down)) as c, c.websocket_connect("/ws") as ws:
        ws.receive_text(); ws.send_text(json.dumps({"type": "ask", "question": Q}))
        ev = collect(ws)[-1]
        assert ev["code"] == "llm_unavailable" and "ollama serve" in ev["message"]

    def wrong_model(req):
        return httpx.Response(200, json={"models": [{"name": "mistral:7b"}]})
    with TestClient(mk(wrong_model)) as c, c.websocket_connect("/ws") as ws:
        ws.receive_text(); ws.send_text(json.dumps({"type": "ask", "question": Q}))
        ev = collect(ws)[-1]
        assert ev["code"] == "llm_unavailable" and "ollama pull llama3.1:8b" in ev["message"] and "mistral:7b" in ev["message"]


def test_any_localhost_port_allowed_but_not_foreign_origins(tmp_path):
    app, *_ = build(tmp_path)
    with TestClient(app) as c:
        with c.websocket_connect("/ws", headers={"origin": "http://localhost:5199"}) as ws:
            assert json.loads(ws.receive_text())["event"] == "ready"
        with pytest.raises(Exception):
            with c.websocket_connect("/ws", headers={"origin": "https://evil.example"}):
                pass
        r = c.get("/health", headers={"origin": "http://127.0.0.1:5174"})
        assert r.headers.get("access-control-allow-origin") == "http://127.0.0.1:5174"
        r = c.get("/health", headers={"origin": "https://evil.example"})
        assert "access-control-allow-origin" not in r.headers


def test_llm_failure_is_reported_not_fatal(tmp_path):
    def down(req):
        raise httpx.ConnectError("refused")
    app, *_ = build(tmp_path)
    app_llm = InferenceClient(LLMConfig(base_url="http://local", max_retries=0), transport=httpx.MockTransport(down), sleep=nosleep)
    store = VectorStore(tmp_path / "db2", embedder=HashEmbedder())
    app = create_app(Settings(), llm=app_llm, store=store, web=FakeWeb())
    with TestClient(app) as c, c.websocket_connect("/ws") as ws:
        ws.receive_text()
        ws.send_text(json.dumps({"type": "ask", "question": Q}))
        evs = collect(ws)
        assert evs[-1]["event"] == "result" and "could not produce" in evs[-1]["answer"].lower() or evs[-1]["event"] == "error"
        ws.send_text('{"type":"ping"}')
        assert json.loads(ws.receive_text())["event"] == "pong"           # connection still alive
        assert c.get("/health").json()["status"] == "degraded"


def test_cancel_stops_run(tmp_path):
    import time

    def slow(req):
        if req.method == "GET":
            return httpx.Response(200, json={"models": [{"name": "llama3.1:8b"}]})
        body = json.loads(req.content)
        if "planning module" in body["messages"][0]["content"]:
            time.sleep(1.5)
            return httpx.Response(200, content=json.dumps({"message": {"content": json.dumps(PLAN())}, "done": True}).encode())
        return httpx.Response(200, content=b'{"message":{"content":"x"},"done":true}')
    llm = InferenceClient(LLMConfig(base_url="http://local", max_retries=0), transport=httpx.MockTransport(slow), sleep=nosleep)
    store = VectorStore(tmp_path / "db", embedder=HashEmbedder())
    app = create_app(Settings(), llm=llm, store=store, web=FakeWeb())
    with TestClient(app) as c, c.websocket_connect("/ws") as ws:
        ws.receive_text()
        ws.send_text(json.dumps({"type": "ask", "question": Q}))
        assert json.loads(ws.receive_text())["event"] == "run_start"
        ws.send_text('{"type":"cancel"}')
        evs = collect(ws, until=("cancelled", "result", "error"))
        assert evs[-1]["event"] == "cancelled"
        ws.send_text(json.dumps({"type": "ask", "question": Q}))                 # slot freed: a new run is accepted
        assert json.loads(ws.receive_text())["event"] == "run_start"


def test_auth_and_origin(tmp_path):
    app, *_ = build(tmp_path, token="s3cret")
    with TestClient(app) as c:
        assert c.post("/api/feedback", json={}).status_code == 401
        assert c.get("/api/rules").status_code == 401
        assert c.get("/api/rules", headers={"Authorization": "Bearer s3cret"}).status_code == 200
        assert c.get("/health").status_code == 200
        with pytest.raises(Exception):
            with c.websocket_connect("/ws"):
                pass
        with c.websocket_connect("/ws?token=s3cret") as ws:
            assert json.loads(ws.receive_text())["auth"] is True
        with pytest.raises(Exception):
            with c.websocket_connect("/ws?token=s3cret", headers={"origin": "http://evil.example"}):
                pass


# ----------------------------------------------------------------------------- preference alignment
GEN = ("Sure! Rust has a borrow checker [1]. It is important to note that the borrow checker enforces memory safety without "
       "needing a garbage collector, which is basically a big deal for systems programmers who care about performance [1]. "
       "Overall, it is quite a useful feature.")
EDIT = "- Rust has a borrow checker.\n- It enforces memory safety without a garbage collector.\n- Systems programmers value this."


def test_delta_extracts_structural_rules():
    d = analyze_delta(GEN, EDIT)
    codes = {r.code for r in d.rules}
    assert {"shorter", "use_bullets", "no_citations", "no_filler"} <= codes and d.changed
    filler = next(r for r in d.rules if r.code == "no_filler").text
    assert "sure" in filler.lower() and "basically" in filler.lower() or "overall" in filler.lower()
    assert not analyze_delta("same text here", "same text here").changed
    swap = analyze_delta("Use the utilise method here today please now", "Use the apply method here today please now")
    assert any(r.code.startswith("wording:") and "apply" in r.text for r in swap.rules)


def test_feedback_webhook_stores_priority_vectors_and_promotes(tmp_path):
    app, script, store = build(tmp_path)
    with TestClient(app) as c:
        r = c.post("/api/feedback", json={"question": Q, "generated_text": GEN, "edited_text": EDIT})
        body = r.json()
        assert r.status_code == 200 and body["ok"] and any(s["code"] == "shorter" and s["scope"] == "topic" for s in body["stored"])
        rules = c.get("/api/rules").json()["rules"]
        assert rules and all(x["priority"] >= 1.0 for x in rules) and all(x["scope"] == "topic" for x in rules)
        r2 = c.post("/api/feedback", json={"question": "Explain ownership in Rust", "generated_text": GEN, "edited_text": EDIT}).json()
        assert "use_bullets" in r2["promoted"]
        glob = [x for x in c.get("/api/rules").json()["rules"] if x["scope"] == "global"]
        assert {"shorter", "use_bullets", "no_citations"} <= {x["code"] for x in glob}
        assert all(x["priority"] >= 2.5 for x in glob if x["code"] == "use_bullets")
        # global rules reach the generation prompt for an unrelated question
        with c.websocket_connect("/ws") as ws:
            ws.receive_text()
            ws.send_text(json.dumps({"type": "ask", "question": "completely unrelated gardening query", "mode": "offline"}))
            collect(ws)
        gen_sys = [b for k, b in script.calls if k == "gen"][-1]["messages"][0]["content"]
        assert "USER PREFERENCES" in gen_sys and "bullet lists" in gen_sys
        # vectors really live in chroma with kind=preference_rule and outrank plain docs
        hits = store.query("bullet lists", k=3, where={"kind": "preference_rule"})
        assert hits and hits[0].metadata["kind"] == "preference_rule"


def test_feedback_by_run_id_reject_accept_and_validation(tmp_path):
    app, *_ = build(tmp_path)
    with TestClient(app) as c:
        with c.websocket_connect("/ws") as ws:
            ws.receive_text()
            ws.send_text(json.dumps({"type": "ask", "question": Q, "mode": "offline", "run_id": "run-abc"}))
            collect(ws)
        r = c.post("/api/feedback", json={"run_id": "run-abc", "action": "reject", "comment": "too terse, no examples"}).json()
        assert r["ok"] and {s["code"].split(":")[0] for s in r["stored"]} == {"reject", "reject_example"}
        acc = c.post("/api/feedback", json={"run_id": "run-abc", "action": "accept"}).json()
        assert acc["stored"] == []
        same = c.post("/api/feedback", json={"question": Q, "generated_text": "a b", "edited_text": "a b"}).json()
        assert same["stored"] == []
        assert c.post("/api/feedback", json={"action": "edit"}).status_code == 422
        assert c.post("/api/feedback", json={"question": Q, "generated_text": "x"}).status_code == 422
        assert c.post("/api/feedback", json={"run_id": "nope", "action": "reject"}).status_code == 422
        src = c.get("/api/rules").json()["rules"][0]["source"]
        assert c.delete("/api/rules", params={"source": src}).json()["deleted"] == 1
        assert c.delete("/api/rules", params={"source": "notes/rust-aaaaaaa"}).status_code == 404


def test_ingest_endpoints_and_health(tmp_path):
    app, _, store = build(tmp_path)
    with TestClient(app) as c:
        assert c.post("/api/ingest/text", json={"text": "Fusion powers stars.", "source": "astro"}).json()["chunks"] == 1
        u = c.post("/api/ingest/urls", json={"urls": ["https://example.org/qec"]}).json()
        assert u["pages"] == ["https://example.org/qec"] and u["chunks"] >= 1
        assert c.post("/api/ingest/text", json={"text": ""}).status_code == 422
        h = c.get("/health").json()
        assert h["llm"] is False or h["llm"] is True and h["chunks"] >= 3
