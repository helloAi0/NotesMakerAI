/**
 * Unsupervised clustering for FRIDAY's knowledge map: TF-IDF vectors → spherical k-means (k-means++ seeding, k chosen by
 * silhouette) → cluster labels from centroid terms → 2-D PCA projection (power iteration on the centred Gram matrix).
 * Pure functions, deterministic for a given seed, no network.
 */
import { tokens } from '../textTools';

export interface Item { id: string; title: string; kind: string; text: string }
export interface Cluster { id: number; label: string; terms: string[]; size: number; members: string[]; cohesion: number }
export interface MapPoint { id: string; title: string; kind: string; x: number; y: number; cluster: number }
export interface KnowledgeMap { k: number; silhouette: number; clusters: Cluster[]; points: MapPoint[]; vocab: string[]; centroids: number[][]; idf: number[] }

export const mulberry = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const norm = (a: Float64Array) => { const n = Math.sqrt(dot(a, a)); if (n > 0) for (let i = 0; i < a.length; i++) a[i] /= n; return a; };

/** TF-IDF with sub-linear tf, vocabulary limited to the `maxTerms` most informative terms. Rows are L2-normalised. */
export function tfidf(texts: string[], maxTerms = 800): { vocab: string[]; idf: number[]; rows: Float64Array[] } {
  const docs = texts.map(t => tokens(t)); const df = new Map<string, number>();
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1);
  const N = docs.length || 1;
  const cand = [...df.entries()].filter(([, c]) => c >= (N > 6 ? 2 : 1) && c <= Math.max(2, 0.7 * N)).map(([w, c]) => ({ w, c, idf: Math.log((N + 1) / (c + 1)) + 1 }));
  cand.sort((a, b) => b.c * b.idf - a.c * a.idf || a.w.localeCompare(b.w)); const top = cand.slice(0, maxTerms), index = new Map(top.map((x, i) => [x.w, i] as const));
  const rows = docs.map(d => { const v = new Float64Array(top.length); const tf = new Map<string, number>(); for (const w of d) tf.set(w, (tf.get(w) ?? 0) + 1); for (const [w, c] of tf) { const i = index.get(w); if (i !== undefined) v[i] = (1 + Math.log(c)) * top[i].idf; } return norm(v); });
  return { vocab: top.map(x => x.w), idf: top.map(x => x.idf), rows };
}
export function embed(text: string, vocab: string[], idf: number[]): Float64Array {
  const index = new Map(vocab.map((w, i) => [w, i] as const)), v = new Float64Array(vocab.length), tf = new Map<string, number>();
  for (const w of tokens(text)) tf.set(w, (tf.get(w) ?? 0) + 1); for (const [w, c] of tf) { const i = index.get(w); if (i !== undefined) v[i] = (1 + Math.log(c)) * idf[i]; } return norm(v);
}
/** Spherical k-means (cosine). Returns assignments and unit-length centroids. */
export function kmeans(rows: Float64Array[], k: number, seed = 1, iters = 40, restarts = 5): { assign: number[]; centroids: Float64Array[]; inertia: number } {
  let bestRun = kmeansOnce(rows, k, seed, iters); for (let r = 1; r < restarts; r++) { const c = kmeansOnce(rows, k, seed + 977 * r, iters); if (c.inertia < bestRun.inertia - 1e-12) bestRun = c; } return bestRun;
}
function kmeansOnce(rows: Float64Array[], k: number, seed: number, iters: number): { assign: number[]; centroids: Float64Array[]; inertia: number } {
  const n = rows.length, dim = rows[0]?.length ?? 0, rng = mulberry(seed); k = Math.max(1, Math.min(k, n));
  // k-means++ seeding with cosine distance 1 - sim
  const cents: Float64Array[] = [Float64Array.from(rows[Math.floor(rng() * n)])]; const d2 = new Array<number>(n).fill(Infinity);
  while (cents.length < k) { let tot = 0; for (let i = 0; i < n; i++) { const d = 1 - dot(rows[i], cents[cents.length - 1]); d2[i] = Math.min(d2[i], Math.max(0, d)); tot += d2[i] ** 2; } let r = rng() * (tot || 1), pick = 0; for (let i = 0; i < n; i++) { r -= d2[i] ** 2; if (r <= 0) { pick = i; break; } } cents.push(Float64Array.from(rows[pick])); }
  let assign = new Array<number>(n).fill(0);
  for (let it = 0; it < iters; it++) {
    let changed = false;
    for (let i = 0; i < n; i++) { let best = 0, bs = -Infinity; for (let c = 0; c < k; c++) { const s = dot(rows[i], cents[c]); if (s > bs) { bs = s; best = c; } } if (assign[i] !== best) { assign[i] = best; changed = true; } }
    const sums = Array.from({ length: k }, () => new Float64Array(dim)), cnt = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) { cnt[assign[i]]++; const s = sums[assign[i]]; for (let j = 0; j < dim; j++) s[j] += rows[i][j]; }
    for (let c = 0; c < k; c++) { if (!cnt[c]) { // re-seed an empty cluster with the point farthest from its centroid
      let far = 0, fs = Infinity; for (let i = 0; i < n; i++) { const s = dot(rows[i], cents[assign[i]]); if (s < fs) { fs = s; far = i; } } cents[c] = Float64Array.from(rows[far]); changed = true; } else cents[c] = norm(sums[c]); }
    if (!changed) break;
  }
  let inertia = 0; for (let i = 0; i < n; i++) inertia += 1 - dot(rows[i], cents[assign[i]]);
  return { assign, centroids: cents, inertia };
}
/** Mean silhouette using cosine distance. */
export function silhouette(rows: Float64Array[], assign: number[], k: number): number {
  const n = rows.length; if (k < 2 || n < 3) return 0; let tot = 0, cnt = 0;
  for (let i = 0; i < n; i++) {
    const sumD = new Array<number>(k).fill(0), c = new Array<number>(k).fill(0); for (let j = 0; j < n; j++) if (j !== i) { sumD[assign[j]] += 1 - dot(rows[i], rows[j]); c[assign[j]]++; }
    const own = assign[i]; if (c[own] === 0) continue; const a = sumD[own] / c[own]; let b = Infinity; for (let q = 0; q < k; q++) if (q !== own && c[q]) b = Math.min(b, sumD[q] / c[q]); if (!Number.isFinite(b)) continue; tot += (b - a) / Math.max(a, b, 1e-12); cnt++;
  }
  return cnt ? tot / cnt : 0;
}
/** 2-D PCA from the centred Gram matrix via power iteration with deflation (n ≤ a few hundred). */
export function project2d(rows: Float64Array[], seed = 3): [number, number][] {
  const n = rows.length; if (n === 0) return []; if (n === 1) return [[0, 0]];
  const dim = rows[0].length, mean = new Float64Array(dim); for (const r of rows) for (let j = 0; j < dim; j++) mean[j] += r[j] / n;
  const X = rows.map(r => { const v = new Float64Array(dim); for (let j = 0; j < dim; j++) v[j] = r[j] - mean[j]; return v; });
  const G: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0)); for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { const s = dot(X[i], X[j]); G[i][j] = s; G[j][i] = s; }
  const rng = mulberry(seed), out: number[][] = [new Array<number>(n).fill(0), new Array<number>(n).fill(0)];
  for (let comp = 0; comp < 2; comp++) {
    let v = Array.from({ length: n }, () => rng() - 0.5), lam = 0;
    for (let it = 0; it < 120; it++) { const w = new Array<number>(n).fill(0); for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += G[i][j] * v[j]; w[i] = s; } const nr = Math.sqrt(w.reduce((a, b) => a + b * b, 0)) || 1; const nv = w.map(x => x / nr); const diff = nv.reduce((a, x, i) => a + Math.abs(x - v[i]), 0); v = nv; lam = nr; if (diff < 1e-9) break; }
    const sc = Math.sqrt(Math.max(lam, 0)); out[comp] = v.map(x => x * sc);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) G[i][j] -= lam * v[i] * v[j]; // deflate
  }
  return Array.from({ length: n }, (_, i) => [out[0][i], out[1][i]] as [number, number]);
}
export function clusterCorpus(items: Item[], opts: { k?: number; kMax?: number; seed?: number } = {}): KnowledgeMap {
  const empty: KnowledgeMap = { k: 0, silhouette: 0, clusters: [], points: [], vocab: [], centroids: [], idf: [] }; if (items.length < 2) return empty;
  const { vocab, idf, rows } = tfidf(items.map(i => `${i.title} ${i.title} ${i.text.slice(0, 6000)}`)); if (!vocab.length) return empty;
  const seed = opts.seed ?? 11; let bestK = opts.k ?? 0, best = kmeans(rows, 1, seed), bestSil = -2;
  if (opts.k) { best = kmeans(rows, opts.k, seed); bestSil = silhouette(rows, best.assign, Math.min(opts.k, rows.length)); }
  else {
    // evaluate every k, then take the smallest k whose silhouette is within 12% of the best (parsimony: avoids over-splitting small corpora)
    const tried: { k: number; s: number; res: ReturnType<typeof kmeans> }[] = [];
    for (let k = 2; k <= Math.min(opts.kMax ?? 8, Math.max(2, Math.floor(items.length / 2))); k++) { let cand = kmeans(rows, k, seed), s = silhouette(rows, cand.assign, k); for (let r = 1; r < 3; r++) { const c2 = kmeans(rows, k, seed + r * 101), s2 = silhouette(rows, c2.assign, k); if (s2 > s) { cand = c2; s = s2; } } tried.push({ k, s, res: cand }); }
    const top = Math.max(...tried.map(t => t.s)), pick = tried.find(t => t.s >= top - 0.12 * Math.abs(top)) ?? tried[0]; bestK = pick.k; best = pick.res; bestSil = pick.s;
  }
  const k = best.centroids.length; if (!bestK) bestK = k;
  const pts = project2d(rows), clusters: Cluster[] = best.centroids.map((c, ci) => {
    const order = Array.from(c).map((w, j) => ({ w, j })).sort((a, b) => b.w - a.w).slice(0, 5).filter(x => x.w > 0).map(x => vocab[x.j]);
    const members = items.filter((_, i) => best.assign[i] === ci); const coh = members.length ? rows.reduce((a, r, i) => a + (best.assign[i] === ci ? dot(r, c) : 0), 0) / members.length : 0;
    return { id: ci, label: order.slice(0, 3).join(' · ') || `topic ${ci + 1}`, terms: order, size: members.length, members: members.map(m => m.id), cohesion: coh };
  }).filter(c => c.size > 0);
  const remap = new Map(clusters.map((c, i) => [c.id, i] as const)); clusters.forEach((c, i) => { c.id = i; });
  const points: MapPoint[] = items.map((it, i) => ({ id: it.id, title: it.title, kind: it.kind, x: pts[i][0], y: pts[i][1], cluster: remap.get(best.assign[i]) ?? 0 }));
  const cents = clusters.map((_, i) => Array.from(best.centroids[[...remap.entries()].find(([, v]) => v === i)![0]]));
  return { k: clusters.length, silhouette: Math.max(0, bestSil), clusters, points, vocab, centroids: cents, idf };
}
/** Which cluster does a new piece of text belong to? (cosine to centroids) */
export function nearestCluster(map: KnowledgeMap, text: string): { cluster: Cluster; sim: number } | null {
  if (!map.k) return null; const v = embed(text, map.vocab, map.idf); let best = -1, bs = -Infinity; map.centroids.forEach((c, i) => { const s = dot(v, c); if (s > bs) { bs = s; best = i; } }); return bs > 0.02 ? { cluster: map.clusters[best], sim: bs } : null;
}
