import hashlib
import math
import re

import pytest

from core.memory.vector_store import EmbeddingModelMismatch, VectorStore, chunk_text


class HashEmbedder:
    """Deterministic bag-of-words embedder (unit-norm) for offline tests."""
    name, dim = "test-hash", 256

    def _v(self, t):
        v = [0.0] * self.dim
        for w in re.findall(r"[a-z0-9]+", t.lower()):
            v[int(hashlib.md5(w.encode()).hexdigest(), 16) % self.dim] += 1
        n = math.sqrt(sum(x * x for x in v)) or 1
        return [x / n for x in v]

    def embed_documents(self, texts): return [self._v(t) for t in texts]
    def embed_query(self, t): return self._v(t)


def test_chunking_bounds_overlap_and_coverage():
    text = " ".join(f"Sentence number {i} talks about topic {i % 7}." for i in range(200))
    cs = chunk_text(text, 300, 80)
    assert len(cs) > 5 and all(len(c.text) <= 300 for c in cs)
    assert cs[0].start == 0 and cs[-1].end >= len(text) - 1
    assert all(b.start < b.end and cs[i].end > b.start for i, b in enumerate(cs[1:]))  # overlap
    assert [c.index for c in cs] == list(range(len(cs)))
    assert chunk_text("   \n ") == []
    assert len(chunk_text("x" * 2500, 500, 50)) >= 5       # unbroken text is hard-wrapped
    with pytest.raises(ValueError):
        chunk_text("abc", 10)


def mk(tmp_path, **kw):
    return VectorStore(tmp_path / "db", embedder=HashEmbedder(), chunk_size=200, chunk_overlap=40, **kw)


def test_ingest_query_cosine_and_idempotence(tmp_path):
    s = mk(tmp_path)
    s.add_text("Photosynthesis converts light energy into chemical energy in chloroplasts.", source="bio")
    s.add_text("The Rust borrow checker enforces memory safety without garbage collection.", source="rust")
    s.add_text("Mitochondria generate ATP through oxidative phosphorylation.", source="bio2")
    n = s.count()
    s.add_text("The Rust borrow checker enforces memory safety without garbage collection.", source="rust")
    assert s.count() == n                                          # idempotent upsert
    hits = s.query("how does rust enforce memory safety", k=2)
    assert hits[0].source == "rust" and 0.3 < hits[0].score <= 1.0 and hits[0].score >= hits[1].score
    assert s.query("chloroplast light", k=1, where={"source": "bio"})[0].source == "bio"
    assert s.query("rust", k=3, min_score=0.99) == []
    assert s.query("   ") == []


def test_priority_boost_and_delete(tmp_path):
    s = mk(tmp_path, priority_weight=0.5)
    s.add_text("alpha beta gamma", source="plain")
    s.add_text("alpha beta delta", source="rule", priority=1.0, chunk=False)
    top = s.query("alpha beta gamma", k=2)
    assert top[0].source == "rule" and top[0].rank_score > top[0].score
    assert s.query("alpha beta gamma", k=1, priority_boost=False)[0].source == "plain"
    assert s.delete_source("rule") == 1 and s.sources() == {"plain": 1}


def test_persistence_across_instances_and_manifest(tmp_path):
    s = mk(tmp_path)
    s.add_text("Persistent fact about quasars and radio emission.", source="astro")
    del s
    s2 = mk(tmp_path)
    assert s2.count() == 1 and s2.query("quasars", k=1)[0].source == "astro"
    assert s2.manifest_path.exists()

    class Other(HashEmbedder):
        name = "other-model"
    bad = VectorStore(tmp_path / "db", embedder=Other(), chunk_size=200, chunk_overlap=40)
    with pytest.raises(EmbeddingModelMismatch):
        bad.query("quasars")


def test_export_import_roundtrip(tmp_path):
    s = mk(tmp_path)
    s.add_text("Alpha particles are helium nuclei. " * 10, source="phys")
    n = s.count()
    assert s.export_jsonl(tmp_path / "snap.jsonl") == n
    t = VectorStore(tmp_path / "db2", embedder=HashEmbedder())
    assert t.import_jsonl(tmp_path / "snap.jsonl") == n and t.query("helium", k=1)[0].source == "phys"


async def test_async_facade(tmp_path):
    s = mk(tmp_path)
    await s.aadd_text("Async ingestion works.", source="a")
    assert (await s.aquery("ingestion", k=1))[0].source == "a" and await s.acount() == 1
