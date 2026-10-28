"""User-preference alignment: turn edits/rejections into retrievable structural rules.

``analyze_delta`` compares the generated text with the user's edit and derives *structural*
rules (length, lists, headings, bold, code fences, citations, filler phrases, sentence length,
preferred wording). ``PreferenceMemory.record`` stores each rule as a high-priority vector
(``kind="preference_rule"``) which the agent injects into future generation prompts:

* a rule first seen on one question is stored with ``scope="topic"`` (only retrieved for
  similar questions);
* when the same rule code is observed on ``PROMOTE_AT`` different questions it is promoted to
  ``scope="global"`` and applied to every answer, with growing priority.
"""
from __future__ import annotations

import difflib
import hashlib
import json
import re
import time
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Literal

from core.memory.vector_store import VectorStore

Action = Literal["edit", "reject", "accept"]
PROMOTE_AT = 2
MAX_PRIORITY = 3.0

_WORD = re.compile(r"\S+")
_SENT = re.compile(r"(?<=[.!?])\s+|\n+")
_LIST = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+", re.M)
_HEAD = re.compile(r"^\s{0,3}#{1,6}\s+", re.M)
_BOLD = re.compile(r"\*\*[^*\n]+\*\*")
_CITE = re.compile(r"\[\d{1,3}\]")
_FENCE = re.compile(r"^```", re.M)
_FILLERS = (r"sure[,!]?", r"certainly[,!]?", r"of course[,!]?", r"great question[,!]?", r"absolutely[,!]?",
            r"i think", r"it seems(?: that)?", r"perhaps", r"as an ai(?: language model)?", r"in conclusion[,]?",
            r"in summary[,]?", r"overall[,]?", r"it is important to note that", r"it's worth noting that",
            r"basically[,]?", r"i hope this helps[.!]?")
_FILLER_RE = [re.compile(r"\b" + f + r"(?=\s|$)", re.I) for f in _FILLERS]


@dataclass(frozen=True)
class RuleSpec:
    code: str          # stable identifier used for consolidation / promotion
    text: str          # imperative instruction injected into prompts
    strength: float    # 0..1 evidence strength


@dataclass
class Delta:
    similarity: float
    words_generated: int
    words_edited: int
    length_ratio: float
    ops: dict[str, int]
    swaps: list[tuple[str, str]]
    rules: list[RuleSpec] = field(default_factory=list)

    @property
    def changed(self) -> bool:
        return self.similarity < 0.995


def _words(t: str) -> list[str]:
    return _WORD.findall(t)


def _count(rx: re.Pattern[str], t: str) -> int:
    return len(rx.findall(t))


def _sentences(t: str) -> list[str]:
    return [s.strip() for s in _SENT.split(t) if len(s.strip()) > 2]


def _avg_sentence_words(t: str) -> float:
    s = _sentences(t)
    return sum(len(_words(x)) for x in s) / len(s) if s else 0.0


def _fillers(t: str) -> set[str]:
    return {m.group(0).lower().strip(" ,!.") for rx in _FILLER_RE for m in rx.finditer(t)}


def analyze_delta(generated: str, edited: str) -> Delta:
    """Derive structural preference rules from the difference between two texts."""
    g, e = generated.strip(), edited.strip()
    gw, ew = _words(g), _words(e)
    sm = difflib.SequenceMatcher(a=gw, b=ew, autojunk=False)
    ops = Counter(tag for tag, *_ in sm.get_opcodes() if tag != "equal")
    swaps: list[tuple[str, str]] = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "replace" and (i2 - i1) <= 3 and (j2 - j1) <= 3:
            old = " ".join(gw[i1:i2]).strip(".,;:!?").lower()
            new = " ".join(ew[j1:j2]).strip(".,;:!?").lower()
            if old and new and old != new and len(old) > 1:
                swaps.append((old, new))
    swaps = [s for s, _ in Counter(swaps).most_common(3)]
    ratio = (len(ew) / len(gw)) if gw else 1.0
    d = Delta(similarity=sm.ratio() if (gw or ew) else 1.0, words_generated=len(gw), words_edited=len(ew),
              length_ratio=ratio, ops=dict(ops), swaps=swaps)
    if not d.changed:
        return d
    R = d.rules
    if len(gw) >= 20 and ratio < 0.75:
        target = max(10, int(round(len(ew) / 10.0)) * 10)
        R.append(RuleSpec("shorter", f"Keep answers concise: about {target} words or fewer unless the question needs more.",
                          min(1.0, (0.75 - ratio) * 3)))
    elif len(gw) >= 20 and ratio > 1.35:
        R.append(RuleSpec("longer", "Give more detailed, fuller explanations with concrete specifics.",
                          min(1.0, (ratio - 1.35) / 1.0)))
    gl, el = _count(_LIST, g), _count(_LIST, e)
    if el >= 2 and gl == 0:
        R.append(RuleSpec("use_bullets", "Present multi-part information as bullet lists.", 0.8))
    elif gl >= 2 and el == 0:
        R.append(RuleSpec("no_bullets", "Write in flowing prose paragraphs; do not use bullet lists.", 0.8))
    gh, eh = _count(_HEAD, g), _count(_HEAD, e)
    if eh >= 1 and gh == 0:
        R.append(RuleSpec("use_headings", "Organise longer answers under short Markdown headings.", 0.6))
    elif gh >= 1 and eh == 0:
        R.append(RuleSpec("no_headings", "Do not use Markdown headings; answer in plain paragraphs.", 0.7))
    gb, eb = _count(_BOLD, g), _count(_BOLD, e)
    if gb >= 2 and eb == 0:
        R.append(RuleSpec("no_bold", "Avoid bold emphasis.", 0.6))
    elif eb >= 1 and gb == 0:
        R.append(RuleSpec("use_bold", "Bold the key terms the reader must remember.", 0.5))
    if _count(_FENCE, e) >= 2 and _count(_FENCE, g) == 0:
        R.append(RuleSpec("code_fences", "Put code and formulas in fenced code blocks.", 0.7))
    gc, ec = _count(_CITE, g), _count(_CITE, e)
    if gc >= 1 and ec == 0:
        R.append(RuleSpec("no_citations", "Do not put [n] citation markers inside the answer text.", 0.8))
    elif ec >= 1 and gc == 0:
        R.append(RuleSpec("cite", "Cite sources inline as [n] for every factual claim.", 0.8))
    removed = sorted(_fillers(g) - _fillers(e))
    if removed:
        R.append(RuleSpec("no_filler", "Never use filler or hedging phrases such as " + ", ".join(f"“{r}”" for r in removed[:4]) + ".",
                          min(1.0, 0.5 + 0.15 * len(removed))))
    ga, ea = _avg_sentence_words(g), _avg_sentence_words(e)
    if ga >= 18 and ea > 0 and ea < 0.75 * ga:
        R.append(RuleSpec("short_sentences", f"Use short sentences (about {int(round(ea))} words each).", 0.6))
    gpar, epar = len([p for p in re.split(r"\n\s*\n", g) if p.strip()]), len([p for p in re.split(r"\n\s*\n", e) if p.strip()])
    if gpar >= 4 and epar <= max(1, gpar // 2) and ratio < 0.9:
        R.append(RuleSpec("fewer_paragraphs", "Use fewer, denser paragraphs.", 0.4))
    if swaps:
        R.append(RuleSpec("wording:" + hashlib.sha1("|".join(f"{a}>{b}" for a, b in swaps).encode()).hexdigest()[:8],
                          "Prefer wording: " + "; ".join(f"“{b}” instead of “{a}”" for a, b in swaps) + ".", 0.5))
    if not R:
        R.append(RuleSpec("rephrase", "Match the phrasing and tone of the user's own edited version.", 0.3))
    return d


def _h(*p: str) -> str:
    return hashlib.sha1("\x1f".join(p).encode()).hexdigest()[:10]


def _clip(t: str, n: int) -> str:
    t = re.sub(r"\s+", " ", t).strip()
    return t if len(t) <= n else t[: n - 1].rstrip() + "…"


class PreferenceMemory:
    def __init__(self, store: VectorStore) -> None:
        self.store = store

    # ---- recording
    def record(self, *, question: str, generated: str, edited: str | None, action: Action = "edit",
               comment: str | None = None) -> dict[str, Any]:
        """Store learned rules. Returns {'stored': [...], 'delta': {...}, 'promoted': [...]}."""
        if action == "accept" or (action == "edit" and edited is not None and edited.strip() == generated.strip()):
            return {"stored": [], "promoted": [], "delta": None, "reason": "accepted unchanged: nothing to learn"}
        stored: list[dict[str, Any]] = []
        promoted: list[str] = []
        qh = _h(question.lower().strip())
        q = _clip(question, 110)
        if action == "reject" or edited is None or not edited.strip():
            specs: list[tuple[RuleSpec, float]] = []
            if comment and comment.strip():
                specs.append((RuleSpec("reject:" + _h(comment.lower()), "Avoid this mistake: " + _clip(comment, 220), 0.8), 0.8))
            specs.append((RuleSpec("reject_example:" + qh, f"For questions like “{q}”, do not answer like this: “{_clip(generated, 200)}”.", 0.7), 0.7))
            delta_info = None
            for spec, pr in specs:
                self._put_topic(spec, qh, q, generated, "", 1.0 + pr, stored, promote=False)
        else:
            delta = analyze_delta(generated, edited)
            delta_info = {"similarity": round(delta.similarity, 3), "length_ratio": round(delta.length_ratio, 3),
                          "ops": delta.ops, "swaps": delta.swaps, "rules": [r.code for r in delta.rules]}
            for spec in delta.rules:
                self._put_topic(spec, qh, q, generated, edited, 1.0 + spec.strength, stored, promote=True, promoted=promoted)
            shot = RuleSpec("fewshot:" + qh, f"For questions like “{q}”, the user prefers answers in this style: “{_clip(edited, 300)}” "
                            f"rather than: “{_clip(generated, 160)}”.", 1.0)
            self._put_topic(shot, qh, q, generated, edited, 2.0, stored, promote=False)
        return {"stored": stored, "promoted": promoted, "delta": delta_info}

    def _put_topic(self, spec: RuleSpec, qh: str, q: str, generated: str, edited: str, priority: float,
                   stored: list[dict[str, Any]], *, promote: bool, promoted: list[str] | None = None) -> None:
        glob_src = f"preference:{spec.code}"
        existing_global = self.store.get_by_source(glob_src)
        if existing_global:                                   # reinforce an existing global rule
            count = int(existing_global[0].metadata.get("count", 1)) + 1
            self._write(glob_src, spec.text, spec.code, "global", min(MAX_PRIORITY, 2.0 + 0.25 * count), count, q, generated, edited)
            stored.append({"code": spec.code, "scope": "global", "count": count})
            return
        topic_src = f"preference:{spec.code}:{qh}"
        prev = self.store.get_by_source(topic_src)
        count = int(prev[0].metadata.get("count", 0)) + 1 if prev else 1
        text = spec.text if spec.code.startswith(("fewshot", "reject")) else f"For questions like “{q}”: {spec.text}"
        self._write(topic_src, text, spec.code, "topic", min(MAX_PRIORITY, priority), count, q, generated, edited)
        stored.append({"code": spec.code, "scope": "topic", "count": count})
        if promote:
            siblings = self.store.get_where({"$and": [{"kind": "preference_rule"}, {"code": spec.code}, {"scope": "topic"}]}, 200)
            questions = {h.source for h in siblings}
            if len(questions) >= PROMOTE_AT:
                for h in siblings:
                    self.store.delete_source(h.source)
                self._write(glob_src, spec.text, spec.code, "global", min(MAX_PRIORITY, 2.0 + 0.25 * len(questions)),
                            len(questions), q, generated, edited)
                stored[-1] = {"code": spec.code, "scope": "global", "count": len(questions)}
                if promoted is not None:
                    promoted.append(spec.code)

    def _write(self, source: str, text: str, code: str, scope: str, priority: float, count: int, q: str,
               generated: str, edited: str) -> None:
        self.store.delete_source(source)
        self.store.add_text(text, source=source, chunk=False, priority=priority, metadata={
            "kind": "preference_rule", "scope": scope, "code": code, "count": count, "question": q,
            "example_generated": _clip(generated, 600), "example_edited": _clip(edited, 600), "updated_at": time.time()})

    # ---- management
    def list_rules(self) -> list[dict[str, Any]]:
        hits = self.store.get_where({"kind": "preference_rule"}, 500)
        return [{"id": h.id, "source": h.source, "text": h.text, "scope": h.metadata.get("scope"),
                 "code": h.metadata.get("code"), "count": h.metadata.get("count"), "priority": h.metadata.get("priority")}
                for h in hits]

    def delete_rule(self, source: str) -> int:
        if not source.startswith("preference:"):
            return 0
        return self.store.delete_source(source)
