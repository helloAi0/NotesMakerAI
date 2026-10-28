"""Self-hosted vector memory: chunking -> local embeddings -> ChromaDB (cosine) -> persistence.

Everything runs on the local machine. Embeddings come from ``sentence-transformers``
(default ``BAAI/bge-large-en-v1.5``); ChromaDB persists to a local directory.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import re
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Mapping, Protocol, Sequence

log = logging.getLogger("clawbot.memory")

BGE_MODEL = "BAAI/bge-large-en-v1.5"
BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "
MANIFEST_NAME = "clawbot_manifest.json"
MetaValue = str | int | float | bool


class MemoryError_(Exception):
    """Base error for the memory layer."""


class EmbeddingModelMismatch(MemoryError_):
    """The on-disk collection was built with a different embedding model/dimension."""


# --------------------------------------------------------------------------- chunking
@dataclass(frozen=True)
class Chunk:
    index: int
    text: str
    start: int
    end: int


_SENT_END = re.compile(r"(?<=[.!?。])\s+|\n{2,}")


def _units(text: str, max_chars: int) -> list[tuple[int, int]]:
    """Split into sentence/paragraph spans; hard-wrap any span longer than max_chars."""
    spans: list[tuple[int, int]] = []
    pos = 0
    for m in _SENT_END.finditer(text):
        spans.append((pos, m.start()))
        pos = m.end()
    spans.append((pos, len(text)))
    out: list[tuple[int, int]] = []
    for a, b in spans:
        if b <= a:
            continue
        while b - a > max_chars:
            cut = text.rfind(" ", a + max_chars // 2, a + max_chars)
            cut = cut if cut > a else a + max_chars
            out.append((a, cut))
            a = cut
            while a < b and text[a].isspace():
                a += 1
        if b > a:
            out.append((a, b))
    return out


def chunk_text(text: str, chunk_size: int = 900, overlap: int = 150) -> list[Chunk]:
    """Sentence-aware sliding window. ``chunk_size``/``overlap`` are in characters.

    Chunks never exceed ``chunk_size`` and consecutive chunks share ~``overlap`` characters
    of trailing sentences so facts that straddle a boundary stay retrievable.
    """
    if chunk_size < 50:
        raise ValueError("chunk_size must be >= 50")
    if not 0 <= overlap < chunk_size // 2:
        raise ValueError("overlap must satisfy 0 <= overlap < chunk_size/2")
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    if not text.strip():
        return []
    units = _units(text, chunk_size)
    chunks: list[Chunk] = []
    i = 0
    while i < len(units):
        j = i
        start = units[i][0]
        end = units[i][1]
        while j + 1 < len(units) and units[j + 1][1] - start <= chunk_size:
            j += 1
            end = units[j][1]
        body = text[start:end].strip()
        if body:
            chunks.append(Chunk(len(chunks), body, start, end))
        if j + 1 >= len(units):
            break
        # step back to build overlap, but always make forward progress
        k = j + 1
        back = 0
        while k - 1 > i and back + (units[k - 1][1] - units[k - 1][0]) <= overlap:
            k -= 1
            back += units[k][1] - units[k][0]
        i = max(k, i + 1)
    return chunks


# --------------------------------------------------------------------------- embeddings
class Embedder(Protocol):
    name: str
    dim: int

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]: ...
    def embed_query(self, text: str) -> list[float]: ...


class SentenceTransformerEmbedder:
    """BGE-Large (or any sentence-transformers model) loaded lazily, fully offline-capable.

    Set ``local_files_only=True`` once the model is cached to forbid any network access.
    """

    def __init__(self, model_name: str = BGE_MODEL, *, device: str | None = None, batch_size: int = 16,
                 query_prefix: str | None = None, local_files_only: bool = False,
                 cache_folder: str | None = None) -> None:
        self.name = model_name
        self.device = device
        self.batch_size = batch_size
        self.query_prefix = BGE_QUERY_PREFIX if (query_prefix is None and "bge" in model_name.lower() and "en" in model_name.lower()) \
            else (query_prefix or "")
        self.local_files_only = local_files_only
        self.cache_folder = cache_folder
        self._model: Any = None
        self._lock = threading.Lock()
        self._dim: int | None = None

    def _load(self) -> Any:
        with self._lock:
            if self._model is None:
                try:
                    from sentence_transformers import SentenceTransformer
                except ImportError as e:   # pragma: no cover - environment dependent
                    raise MemoryError_("sentence-transformers is not installed: pip install sentence-transformers") from e
                self._model = SentenceTransformer(self.name, device=self.device, cache_folder=self.cache_folder,
                                                  local_files_only=self.local_files_only)
                self._dim = int(self._model.get_sentence_embedding_dimension())
                log.info("loaded embedding model %s (dim=%d)", self.name, self._dim)
            return self._model

    @property
    def dim(self) -> int:  # type: ignore[override]
        self._load()
        assert self._dim is not None
        return self._dim

    def _encode(self, texts: Sequence[str]) -> list[list[float]]:
        model = self._load()
        arr = model.encode(list(texts), batch_size=self.batch_size, normalize_embeddings=True,
                           convert_to_numpy=True, show_progress_bar=False)
        return [[float(x) for x in row] for row in arr]

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        return self._encode(texts) if texts else []

    def embed_query(self, text: str) -> list[float]:
        return self._encode([self.query_prefix + text])[0]


# --------------------------------------------------------------------------- results
@dataclass(frozen=True)
class SearchHit:
    id: str
    text: str
    score: float                   # cosine similarity in [-1, 1] (higher is better)
    rank_score: float              # score after priority boost; results are sorted by this
    metadata: dict[str, MetaValue] = field(default_factory=dict)

    @property
    def source(self) -> str:
        return str(self.metadata.get("source", ""))


def _clean_meta(meta: Mapping[str, Any] | None) -> dict[str, MetaValue]:
    out: dict[str, MetaValue] = {}
    for k, v in (meta or {}).items():
        if v is None:
            continue
        if isinstance(v, bool | int | str):
            out[str(k)] = v
        elif isinstance(v, float):
            if math.isfinite(v):
                out[str(k)] = v
        else:
            out[str(k)] = json.dumps(v, ensure_ascii=False, sort_keys=True, default=str)
    return out


def _digest(*parts: str) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p.encode("utf-8"))
        h.update(b"\x1f")
    return h.hexdigest()[:40]


# --------------------------------------------------------------------------- store
class VectorStore:
    """Persistent cosine-similarity vector store backed by ChromaDB.

    * Chunk IDs are content hashes, so re-ingesting identical text is idempotent.
    * ``priority`` metadata (default 0) lets callers (e.g. preference rules) outrank plain
      documents: ``rank_score = cosine + priority_weight * priority``.
    * A manifest next to the DB records the embedding model/dimension and refuses to mix
      incompatible vectors.
    """

    def __init__(self, path: str | Path = "./data/chroma", *, collection: str = "clawbot_memory",
                 embedder: Embedder | None = None, chunk_size: int = 900, chunk_overlap: int = 150,
                 priority_weight: float = 0.05) -> None:
        import chromadb
        from chromadb.config import Settings

        self.path = Path(path).expanduser().resolve()
        self.path.mkdir(parents=True, exist_ok=True)
        self.embedder: Embedder = embedder or SentenceTransformerEmbedder()
        self.chunk_size, self.chunk_overlap = chunk_size, chunk_overlap
        self.priority_weight = priority_weight
        self.collection_name = collection
        self._lock = threading.RLock()
        self._client = chromadb.PersistentClient(path=str(self.path), settings=Settings(anonymized_telemetry=False,
                                                                                         allow_reset=False))
        self._col = self._client.get_or_create_collection(name=collection, metadata={"hnsw:space": "cosine"})
        self._check_manifest_lazy = True

    # ---- manifest / persistence
    @property
    def manifest_path(self) -> Path:
        return self.path / f"{self.collection_name}.{MANIFEST_NAME}"

    def _verify_manifest(self, dim: int) -> None:
        mp = self.manifest_path
        if mp.exists():
            try:
                m = json.loads(mp.read_text("utf-8"))
            except (OSError, json.JSONDecodeError) as e:
                raise MemoryError_(f"corrupt manifest {mp}: {e}") from e
            if m.get("embedding_model") != self.embedder.name or int(m.get("dim", -1)) != dim:
                raise EmbeddingModelMismatch(
                    f"collection '{self.collection_name}' was built with {m.get('embedding_model')} "
                    f"(dim {m.get('dim')}); current embedder is {self.embedder.name} (dim {dim}). "
                    "Use a new collection or re-ingest.")
        else:
            tmp = mp.with_suffix(".tmp")
            tmp.write_text(json.dumps({"embedding_model": self.embedder.name, "dim": dim, "metric": "cosine",
                                       "created": time.time()}, indent=2), "utf-8")
            tmp.replace(mp)
        self._check_manifest_lazy = False

    # ---- ingestion
    def add_text(self, text: str, *, source: str = "manual", metadata: Mapping[str, Any] | None = None,
                 priority: float = 0.0, chunk: bool = True) -> list[str]:
        """Chunk, embed and upsert ``text``. Returns the chunk IDs written."""
        pieces = chunk_text(text, self.chunk_size, self.chunk_overlap) if chunk else (
            [Chunk(0, text.strip(), 0, len(text))] if text.strip() else [])
        if not pieces:
            return []
        base = _clean_meta(metadata)
        base.update({"source": source, "priority": float(priority), "ingested_at": time.time(),
                     "n_chunks": len(pieces)})
        seen: set[str] = set()
        unique: list[Chunk] = []
        for p in pieces:                       # identical chunks inside one document collapse to one vector
            d = _digest(source, p.text)
            if d not in seen:
                seen.add(d)
                unique.append(p)
        pieces = unique
        ids = [_digest(source, p.text) for p in pieces]
        metas = [{**base, "chunk_index": p.index, "char_start": p.start, "char_end": p.end} for p in pieces]
        vectors = self.embedder.embed_documents([p.text for p in pieces])
        if len(vectors) != len(pieces):
            raise MemoryError_("embedder returned a different number of vectors than texts")
        with self._lock:
            if self._check_manifest_lazy:
                self._verify_manifest(len(vectors[0]))
            self._col.upsert(ids=ids, documents=[p.text for p in pieces], embeddings=vectors, metadatas=metas)
        return ids

    def add_texts(self, items: Iterable[tuple[str, str]], **kw: Any) -> int:
        """Ingest ``(source, text)`` pairs; returns the total number of chunks written."""
        return sum(len(self.add_text(t, source=s, **kw)) for s, t in items)

    # ---- retrieval
    def query(self, text: str, k: int = 5, *, where: Mapping[str, Any] | None = None,
              min_score: float | None = None, priority_boost: bool = True) -> list[SearchHit]:
        """Top-k cosine-similarity search, optionally filtered by metadata (Chroma ``where`` syntax)."""
        if k < 1:
            raise ValueError("k must be >= 1")
        if not text.strip():
            return []
        qv = self.embedder.embed_query(text)
        with self._lock:
            if self._check_manifest_lazy:
                self._verify_manifest(len(qv))
            total = self._col.count()
            if total == 0:
                return []
            fetch = min(total, k * 3 if priority_boost else k)
            res = self._col.query(query_embeddings=[qv], n_results=fetch, where=dict(where) if where else None,
                                  include=["documents", "metadatas", "distances"])
        hits: list[SearchHit] = []
        for i, doc, meta, dist in zip(res["ids"][0], res["documents"][0], res["metadatas"][0], res["distances"][0]):
            sim = 1.0 - float(dist)
            if min_score is not None and sim < min_score:
                continue
            meta = dict(meta or {})
            pr = float(meta.get("priority", 0.0) or 0.0) if priority_boost else 0.0
            hits.append(SearchHit(id=i, text=doc, score=sim, rank_score=sim + self.priority_weight * pr, metadata=meta))
        hits.sort(key=lambda h: h.rank_score, reverse=True)
        return hits[:k]

    def get_by_source(self, source: str) -> list[SearchHit]:
        with self._lock:
            res = self._col.get(where={"source": source}, include=["documents", "metadatas"])
        hits = [SearchHit(i, d, 1.0, 1.0, dict(m or {})) for i, d, m in zip(res["ids"], res["documents"], res["metadatas"])]
        return sorted(hits, key=lambda h: int(h.metadata.get("chunk_index", 0)))

    # ---- maintenance
    def delete_source(self, source: str) -> int:
        with self._lock:
            ids = self._col.get(where={"source": source}, include=[])["ids"]
            if ids:
                self._col.delete(ids=ids)
        return len(ids)

    def delete_ids(self, ids: Sequence[str]) -> None:
        if ids:
            with self._lock:
                self._col.delete(ids=list(ids))

    def count(self) -> int:
        with self._lock:
            return int(self._col.count())

    def sources(self) -> dict[str, int]:
        with self._lock:
            metas = self._col.get(include=["metadatas"])["metadatas"]
        out: dict[str, int] = {}
        for m in metas:
            s = str((m or {}).get("source", ""))
            out[s] = out.get(s, 0) + 1
        return out

    def stats(self) -> dict[str, Any]:
        return {"path": str(self.path), "collection": self.collection_name, "chunks": self.count(),
                "embedding_model": self.embedder.name, "metric": "cosine", "sources": len(self.sources())}

    # ---- portable snapshots (JSONL, no embeddings needed: re-embedded on import)
    def export_jsonl(self, dest: str | Path) -> int:
        dest = Path(dest)
        dest.parent.mkdir(parents=True, exist_ok=True)
        with self._lock:
            data = self._col.get(include=["documents", "metadatas"])
        tmp = dest.with_suffix(dest.suffix + ".tmp")
        with tmp.open("w", encoding="utf-8") as f:
            for i, d, m in zip(data["ids"], data["documents"], data["metadatas"]):
                f.write(json.dumps({"id": i, "text": d, "metadata": m}, ensure_ascii=False) + "\n")
        tmp.replace(dest)
        return len(data["ids"])

    def import_jsonl(self, src: str | Path, batch: int = 64) -> int:
        n = 0
        rows: list[dict[str, Any]] = []

        def flush() -> int:
            if not rows:
                return 0
            vecs = self.embedder.embed_documents([r["text"] for r in rows])
            with self._lock:
                if self._check_manifest_lazy:
                    self._verify_manifest(len(vecs[0]))
                self._col.upsert(ids=[r["id"] for r in rows], documents=[r["text"] for r in rows], embeddings=vecs,
                                 metadatas=[_clean_meta(r.get("metadata")) or {"source": "import"} for r in rows])
            c = len(rows)
            rows.clear()
            return c

        with Path(src).open(encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    rows.append(json.loads(line))
                    if len(rows) >= batch:
                        n += flush()
        return n + flush()

    # ---- async facade (embedding + sqlite I/O are blocking -> run in worker threads)
    async def aadd_text(self, text: str, **kw: Any) -> list[str]:
        return await asyncio.to_thread(self.add_text, text, **kw)

    async def aquery(self, text: str, k: int = 5, **kw: Any) -> list[SearchHit]:
        return await asyncio.to_thread(self.query, text, k, **kw)

    async def adelete_source(self, source: str) -> int:
        return await asyncio.to_thread(self.delete_source, source)

    async def acount(self) -> int:
        return await asyncio.to_thread(self.count)
