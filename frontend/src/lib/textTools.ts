/** Small offline NLP toolkit: tokenising, BM25 retrieval, extractive summaries, key terms. No network, no models to download. */
const STOP = new Set('a an and are as at be but by can do does for from had has have how i if in into is it its of on or our so such than that the their then there these they this to was we were what when where which who why will with you your about also been being both each more most other some very not no yes use used using'.split(' '));
export const stem = (w: string) => w.replace(/(ations?|ization|ising|izing|ments?|ness|ings?|ies|ied|ers?|ed|es|s|ly)$/, m => (m === 'ies' || m === 'ied' ? 'y' : '')).replace(/^(.{3,}?)e$/, '$1');
export function tokens(text: string, keepStop = false): string[] {
  return (text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]+(?:[-'][a-z0-9]+)*/g) ?? []).filter(w => (keepStop || !STOP.has(w)) && w.length > 1).map(stem);
}
export const sentences = (text: string): string[] => text.replace(/\s+/g, ' ').match(/[^.!?\n]+(?:[.!?]+(?=\s|$)|$)/g)?.map(s => s.trim()).filter(s => s.length > 25) ?? [];

export interface Doc { id: string; text: string; title?: string; meta?: Record<string, unknown> }
export interface Hit<T extends Doc = Doc> { doc: T; score: number }
export class Bm25<T extends Doc = Doc> {
  private tf: Map<string, number>[] = []; private df = new Map<string, number>(); private len: number[] = []; private avg = 1;
  docs: T[];
  constructor(docs: T[], titleBoost = 3) {
    this.docs = docs;
    for (const d of docs) {
      const m = new Map<string, number>(); const add = (w: string, n = 1) => m.set(w, (m.get(w) ?? 0) + n);
      for (const w of tokens(d.text)) add(w); if (d.title) for (const w of tokens(d.title)) add(w, titleBoost);
      this.tf.push(m); let L = 0; m.forEach((c, w) => { L += c; this.df.set(w, (this.df.get(w) ?? 0) + 1); }); this.len.push(L);
    }
    this.avg = this.len.reduce((a, b) => a + b, 0) / Math.max(1, docs.length) || 1;
  }
  search(q: string, k = 5): Hit<T>[] {
    const qt = [...new Set(tokens(q))]; if (!qt.length) return [];
    const N = this.docs.length, out: Hit<T>[] = [];
    this.tf.forEach((m, i) => {
      let s = 0;
      for (const w of qt) { const f = m.get(w); if (!f) continue; const idf = Math.log(1 + (N - (this.df.get(w) ?? 0) + 0.5) / ((this.df.get(w) ?? 0) + 0.5)); s += idf * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (this.len[i] / this.avg)))); }
      if (s > 0) out.push({ doc: this.docs[i], score: s });
    });
    return out.sort((a, b) => b.score - a.score).slice(0, k);
  }
}

/** Extractive summary: the n most central sentences, kept in their original order. */
export function summarize(text: string, n = 5, query = ''): string[] {
  const ss = sentences(text); if (ss.length <= n) return ss;
  const tf = new Map<string, number>(); for (const s of ss) for (const w of tokens(s)) tf.set(w, (tf.get(w) ?? 0) + 1);
  const qs = new Set(tokens(query));
  const scored = ss.map((s, i) => { const ws = tokens(s); if (ws.length < 4) return { i, sc: 0 }; let sc = 0; for (const w of ws) sc += (tf.get(w) ?? 0) * (qs.has(w) ? 3 : 1); sc /= Math.pow(ws.length, 0.7); if (i < 3) sc *= 1.15; if (/\b(is|are|defined|called|means|equals|states)\b/i.test(s)) sc *= 1.1; return { i, sc }; });
  return scored.sort((a, b) => b.sc - a.sc).slice(0, n).sort((a, b) => a.i - b.i).map(x => ss[x.i]);
}
export function keyTerms(text: string, n = 8): string[] {
  const tf = new Map<string, { c: number; w: string }>(); for (const raw of text.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []) { if (STOP.has(raw)) continue; const s = stem(raw), e = tf.get(s); if (e) e.c++; else tf.set(s, { c: 1, w: raw }); }
  return [...tf.values()].sort((a, b) => b.c - a.c).slice(0, n).map(x => x.w);
}
