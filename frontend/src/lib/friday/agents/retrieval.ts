/**
 * Hybrid retrieval: BM25 keywords + dense vectors (built-in hashed concept vectors, or a real embedding model when one is connected)
 * + pseudo-relevance feedback, fused with Reciprocal Rank Fusion and re-ranked by a cross-feature scorer.
 * Every hit carries its source (PDF/note title and page) so answers can cite it.
 */
import { Bm25, tokens } from '../../textTools';
import type { Citation } from './core';

export interface Passage { id: string; kind: string; title: string; where?: string; text: string }
export interface Hit { passage: Passage; score: number; quote: string; via: string[] }
export interface Embedder { name: string; embed(texts: string[]): Promise<number[][]> }

/* concept groups give the offline vectors a little real "meaning": words of one group land on the same feature */
const GROUPS = ['heat thermal temperature warmth hot cold', 'entropy disorder randomness', 'energy work joule power', 'velocity speed rate', 'force push pull thrust', 'acceleration deceleration', 'mass weight inertia', 'pressure stress', 'voltage potential emf', 'current flow amp ampere', 'resistance impedance ohm', 'wave oscillation vibration frequency', 'light photon optics', 'atom molecule particle', 'reaction compound chemical', 'cell organism biology living', 'gene dna inheritance heredity', 'derivative slope gradient differentiate', 'integral area antiderivative integrate', 'matrix vector linear tensor', 'probability chance likelihood random', 'algorithm procedure method steps', 'error mistake noise uncertainty', 'equilibrium balance steady', 'gas vapour vapor', 'liquid fluid', 'efficiency effectiveness performance', 'signal waveform spectrum', 'exam test quiz assessment'];
const CONCEPT = new Map<string, string>(); GROUPS.forEach((g, i) => g.split(' ').forEach(w => CONCEPT.set(stem(w), `§${i}`)));
export function stem(w: string): string { return w.replace(/(ing|ed|es|s|ly|ion|al)$/, m => (w.length - m.length >= 4 ? '' : m)); }
const DIM = 1024;
function h32(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function hashVec(text: string): Float32Array {
  const v = new Float32Array(DIM); const ws = tokens(text).map(stem);
  const add = (f: string, w: number) => { const h = h32(f); v[h % DIM] += (h & 0x80000000 ? -1 : 1) * w; };
  ws.forEach((w, i) => { add('u' + w, 1); const c = CONCEPT.get(w); if (c) add('c' + c, 1.2); if (i > 0) add('b' + ws[i - 1] + ' ' + w, 0.7); if (w.length > 4) for (let j = 0; j + 3 <= w.length; j++) add('t' + w.slice(j, j + 3), 0.25); });
  let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; for (let i = 0; i < DIM; i++) v[i] /= n; return v;
}
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => { let s = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) s += a[i] * b[i]; return s; };
const norm = (a: number[]) => { const n = Math.sqrt(a.reduce((s, x) => s + x * x, 0)) || 1; return a.map(x => x / n); };

export function chunk(p: Passage, max = 650): Passage[] {
  if (p.text.length <= max * 1.3) return [p];
  const ss = p.text.split(/(?<=[.!?])\s+/); const out: Passage[] = []; let cur = '';
  for (const s of ss) { if (cur && (cur + ' ' + s).length > max) { out.push({ ...p, id: `${p.id}#${out.length}`, text: cur }); cur = s; } else cur = cur ? cur + ' ' + s : s; }
  if (cur) out.push({ ...p, id: `${p.id}#${out.length}`, text: cur }); return out;
}
const sentencesOf = (t: string) => t.split(/(?<=[.!?])\s+|\n+/).filter(s => s.trim().length > 12);
function bestQuote(q: string, text: string): string {
  const qt = new Set(tokens(q).map(stem)); let best = '', bs = -1;
  for (const s of sentencesOf(text)) { const st = tokens(s).map(stem); const sc = st.filter(w => qt.has(w)).length / Math.sqrt(st.length || 1); if (sc > bs) { bs = sc; best = s; } }
  return (best || text).slice(0, 240).trim();
}
export const toCitation = (h: Hit, n?: number): Citation => ({ kind: h.passage.kind, title: h.passage.title, where: h.passage.where, quote: h.quote, score: +h.score.toFixed(3), n });

export class Retriever {
  passages: Passage[]; private bm: Bm25; private vecs: Float32Array[]; private df = new Map<string, number>(); private ev: number[][] | null = null; embedderUsed = false; private embedder?: Embedder;
  constructor(passages: Passage[], embedder?: Embedder) { this.embedder = embedder;
    this.passages = passages.flatMap(p => chunk(p)); this.bm = new Bm25(this.passages.map(p => ({ id: p.id, title: p.title, text: p.text })), 3); this.vecs = this.passages.map(p => hashVec(p.title + ' ' + p.text));
    for (const p of this.passages) for (const w of new Set(tokens(p.title + ' ' + p.text).map(stem))) this.df.set(w, (this.df.get(w) ?? 0) + 1);
  }
  private idf(w: string) { return Math.log(1 + (this.passages.length - (this.df.get(w) ?? 0) + 0.5) / ((this.df.get(w) ?? 0) + 0.5)); }
  private async ensureEmbeds() { if (this.ev || !this.embedder || !this.passages.length) return; try { const out: number[][] = []; for (let i = 0; i < this.passages.length; i += 32) out.push(...(await this.embedder.embed(this.passages.slice(i, i + 32).map(p => (p.title + '. ' + p.text).slice(0, 1500))))); this.ev = out.map(norm); } catch { this.embedder = undefined; this.ev = null; } }
  async search(q0: string, k = 5): Promise<Hit[]> {
    const cleaned = q0.replace(/\b(?:step[- ]by[- ]step|in detail|in depth|please|tell me|explain|describe|define|what (?:is|are|was|were|does)|what's|how (?:does|do|is)|show me|give me|can you|could you|about|simply|briefly)\b/gi, ' ').replace(/\s+/g, ' ').trim(); const q = cleaned.length >= 3 ? cleaned : q0;
    if (!this.passages.length || !q.trim()) return [];
    const esim = new Map<string, number>(); const idx = new Map(this.passages.map((p, i) => [p.id, i])); const lists: { name: string; ids: string[] }[] = []; const via = new Map<string, Set<string>>();
    const note = (name: string, ids: string[]) => { lists.push({ name, ids }); for (const id of ids) (via.get(id) ?? via.set(id, new Set()).get(id)!).add(name); };
    const kw = this.bm.search(q, 30); note('keyword', kw.map(h => h.doc.id));
    const qv = hashVec(q); const dense = this.vecs.map((v, i) => ({ i, s: dot(qv, v) })).filter(x => x.s > 0.05).sort((a, b) => b.s - a.s).slice(0, 30); note('meaning', dense.map(d => this.passages[d.i].id));
    await this.ensureEmbeds();
    if (this.ev && this.embedder) { try { const [qe] = await this.embedder.embed([q]); const e = norm(qe); const ds = this.ev.map((v, i) => ({ i, s: dot(e, v) })).sort((a, b) => b.s - a.s).slice(0, 30); note('embedding', ds.map(d => this.passages[d.i].id)); for (const d of this.ev.map((v, i) => ({ i, s: dot(e, v) }))) esim.set(this.passages[d.i].id, d.s); this.embedderUsed = true; } catch { this.embedderUsed = false; } }
    // pseudo-relevance feedback: expand the query with the strongest terms of the best first-pass documents
    const first = rrf(lists).slice(0, 3); if (first.length) {
      const qs = new Set(tokens(q).map(stem)); const tf = new Map<string, number>();
      for (const f of first) for (const w of tokens(this.passages[idx.get(f.id)!].text).map(stem)) if (!qs.has(w) && w.length > 3) tf.set(w, (tf.get(w) ?? 0) + this.idf(w));
      const exp = [...tf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]); if (exp.length) note('feedback', this.bm.search(q + ' ' + exp.join(' '), 20).map(h => h.doc.id));
    }
    const fused = rrf(lists).slice(0, 20); const qt = [...new Set(tokens(q).map(stem))]; const qb = tokens(q).map(stem).slice(0, -1).map((w, i) => w + ' ' + tokens(q).map(stem)[i + 1]);
    const top = fused[0]?.score || 1; const idfSum = qt.reduce((s, w) => s + this.idf(w), 0) || 1;
    const rer = fused.map(f => {
      const p = this.passages[idx.get(f.id)!]; const body = tokens(p.text).map(stem); const set = new Set([...body, ...tokens(p.title).map(stem)]); const text = body.join(' ');
      const cov = qt.filter(w => set.has(w)).reduce((s, w) => s + this.idf(w), 0) / idfSum; const phrase = qb.length ? qb.filter(b => text.includes(b)).length / qb.length : 0;
      const pos = qt.map(w => body.reduce<number[]>((a, x, i) => (x === w ? [...a, i] : a), [])).filter(a => a.length); let win = Infinity; if (pos.length) { for (const s of pos[0]) { let lo = s, hi = s; for (const a of pos.slice(1)) { const near = a.reduce((b, x) => (Math.abs(x - s) < Math.abs(b - s) ? x : b), a[0]); lo = Math.min(lo, near); hi = Math.max(hi, near); } win = Math.min(win, hi - lo + 1); } }
      const prox = pos.length > 1 ? Math.min(1, pos.length * 2 / win) : pos.length ? 1 : 0; const tset = new Set(tokens(p.title).map(stem)); const title = qt.length ? qt.filter(w => tset.has(w)).length / qt.length : 0;
      const rare = qt.filter(w => (this.df.get(w) ?? 0) > 0).sort((a, b) => this.idf(b) - this.idf(a))[0]; const miss = rare && !set.has(rare) ? 0.6 : 1;
      const lex = (0.4 * cov + 0.2 * phrase + 0.15 * prox + 0.1 * title + 0.15 * (f.score / top)) * miss; const es2 = esim.get(f.id); const score = es2 !== undefined ? 0.55 * Math.max(0, es2) + 0.45 * lex : lex;
      const sim = dot(qv, this.vecs[idx.get(f.id)!]); const es = esim.get(f.id); const gate = es !== undefined ? es >= 0.45 || cov >= 0.5 : cov >= 0.5 || sim >= 0.3;
      return { passage: p, score: gate ? score : 0, quote: bestQuote(q, p.text), via: [...(via.get(f.id) ?? [])] } as Hit;
    }).filter(h => h.score > 0.12).sort((a, b) => b.score - a.score);
    // one best passage per source location, so citations are not five copies of the same page
    const seen = new Set<string>(); return rer.filter(h => { const key = `${h.passage.title}|${h.passage.where ?? ''}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, k);
  }
}
function rrf(lists: { ids: string[] }[], k = 60): { id: string; score: number }[] {
  const m = new Map<string, number>(); for (const l of lists) l.ids.forEach((id, r) => m.set(id, (m.get(id) ?? 0) + 1 / (k + r + 1)));
  return [...m.entries()].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
}
/* real embedding models (optional): Ollama /api/embed or any OpenAI-compatible /v1/embeddings */
export function ollamaEmbedder(base: string, model: string): Embedder {
  const u = base.replace(/\/+$/, '').replace(/\/v1$/, '');
  return { name: `ollama:${model}`, async embed(texts) { const r = await fetch(`${u}/api/embed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, input: texts }) }); if (!r.ok) throw new Error(`embed ${r.status}`); const j = (await r.json()) as { embeddings: number[][] }; return j.embeddings; } };
}
export function openaiEmbedder(base: string, key: string, model: string): Embedder {
  const u = base.replace(/\/+$/, '');
  return { name: `openai:${model}`, async embed(texts) { const r = await fetch(`${u}/embeddings`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ model, input: texts }) }); if (!r.ok) throw new Error(`embed ${r.status}`); const j = (await r.json()) as { data: { embedding: number[] }[] }; return j.data.map(d => d.embedding); } };
}
