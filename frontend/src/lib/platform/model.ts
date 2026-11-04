/* Student model: ONE event log per student (reviews, quizzes, mistakes, simulations, predictions, notes, lectures, mock exams, photo checks)
   plus the Knowledge Graph and Outcomes numbers derived from it. Everything is local; nothing here talks to a network. */
import type { KV } from '../friday/learn';
import { defaultKV } from '../friday/learn';
import { Deck, DAY } from '../friday/agents/tutor';

export type EvType = 'review' | 'quiz' | 'mistake' | 'sim' | 'predict' | 'note' | 'lecture' | 'mock' | 'photo' | 'course' | 'lab';
export interface Ev { t: number; type: EvType; topic?: string; ref?: string; grade?: number; elapsed?: number; score?: number; n?: number; ok?: boolean }
interface Store { ev: Ev[]; mast: { t: number; avg: number; topics: number }[] }

export class StudentModel {
  private kv: KV; private key: string; s: Store;
  constructor(kv: KV = defaultKV(), key = 'nm_student_model') { this.kv = kv; this.key = key; try { const j = JSON.parse(kv.get(key) || '{}'); this.s = { ev: Array.isArray(j.ev) ? j.ev : [], mast: Array.isArray(j.mast) ? j.mast : [] }; } catch { this.s = { ev: [], mast: [] }; } }
  private save() { this.kv.set(this.key, JSON.stringify({ ev: this.s.ev.slice(-4000), mast: this.s.mast.slice(-200) })); }
  record(e: Omit<Ev, 't'> & { t?: number }) { this.s.ev.push({ ...e, t: e.t ?? Date.now() }); if (this.s.ev.length > 4500) this.s.ev = this.s.ev.slice(-4000); this.save(); }
  events(type?: EvType) { return type ? this.s.ev.filter(e => e.type === type) : this.s.ev; }
  /** Keep at most one mastery snapshot a day (used for the growth curve). */
  snapshot(deck: Deck, now = Date.now()) {
    const ms = deck.topics().map(t => deck.mastery(t, now)); if (!ms.length) return; const avg = ms.reduce((a, m) => a + m.mastery, 0) / ms.length; const last = this.s.mast[this.s.mast.length - 1];
    if (last && new Date(last.t).toDateString() === new Date(now).toDateString()) { last.avg = avg; last.topics = ms.length; } else this.s.mast.push({ t: now, avg, topics: ms.length }); this.save();
  }
  masteryHistory() { return this.s.mast; }
  clear() { this.s = { ev: [], mast: [] }; this.save(); }
}

/* ---------------- Knowledge Graph ---------------- */
export type NodeKind = 'concept' | 'mistake' | 'sim' | 'note' | 'exam';
export interface GNode { id: string; kind: NodeKind; label: string; weight: number; mastery?: number; meta?: string }
export interface GEdge { a: string; b: string; kind: 'mistake-in' | 'practised-in' | 'notes-on' | 'exam-on'; w: number }
export interface Graph { nodes: GNode[]; edges: GEdge[] }
export interface SimInfo { id: string; title: string; tags?: string[]; subject?: string }
export interface NoteInfo { title: string; text: string }

const STOP = new Set(['the', 'and', 'of', 'a', 'an', 'to', 'in', 'on', 'for', 'is', 'with', 'my', 'notes', 'basic', 'intro', 'introduction', 'law', 'laws']);
const stem = (w: string) => (w.endsWith('ies') ? w.slice(0, -3) + 'y' : /(ss|x|ch|sh)es$/.test(w) ? w.slice(0, -2) : w.endsWith('ing') && w.length > 5 ? w.slice(0, -3) : w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
export const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)).map(stem);
/** 0..1 — how much of the topic’s words appear in the text’s words. */
export function relatedness(topic: string, text: string): number { const a = tokens(topic); if (!a.length) return 0; const b = new Set(tokens(text)); return a.filter(w => b.has(w)).length / a.length; }

export function buildGraph(o: { deck: Deck; events: Ev[]; sims: SimInfo[]; notes: NoteInfo[]; now?: number }): Graph {
  const now = o.now ?? Date.now(); const nodes = new Map<string, GNode>(); const edges: GEdge[] = [];
  const add = (n: GNode) => { if (!nodes.has(n.id)) nodes.set(n.id, n); return nodes.get(n.id)!; };
  const topics = o.deck.topics();
  for (const t of topics) { const m = o.deck.mastery(t, now); add({ id: 'c:' + t.toLowerCase(), kind: 'concept', label: t, weight: Math.max(1, m.cards), mastery: m.mastery, meta: `${m.cards} cards · ${m.due} due` }); }
  const tid = (t?: string) => { if (!t) return null; const k = 'c:' + t.toLowerCase(); if (nodes.has(k)) return k; const hit = topics.find(x => relatedness(x, t) >= 0.6 || relatedness(t, x) >= 0.6); return hit ? 'c:' + hit.toLowerCase() : null; };
  // mistakes
  const bySig = new Map<string, { q: string; topic: string; n: number }>();
  for (const m of o.deck.mistakes()) { const k = m.topic.toLowerCase() + '|' + m.question; const e = bySig.get(k) ?? { q: m.question, topic: m.topic, n: 0 }; e.n++; bySig.set(k, e); }
  for (const [k, m] of [...bySig].sort((a, b) => b[1].n - a[1].n).slice(0, 40)) { const c = tid(m.topic); if (!c) continue; const id = 'm:' + k; add({ id, kind: 'mistake', label: m.q.slice(0, 60), weight: m.n }); edges.push({ a: id, b: c, kind: 'mistake-in', w: m.n }); }
  // simulations: ones the student ran (events) linked to the concepts they relate to
  const ran = new Map<string, number>(); for (const e of o.events) if ((e.type === 'sim' || e.type === 'predict') && e.ref) ran.set(e.ref, (ran.get(e.ref) ?? 0) + 1);
  for (const s of o.sims) { const n = ran.get(s.id); if (!n) continue; const txt = [s.title, s.subject ?? '', ...(s.tags ?? [])].join(' '); for (const t of topics) { const r = relatedness(t, txt); if (r >= 0.5) { const id = 's:' + s.id; add({ id, kind: 'sim', label: s.title, weight: n }); edges.push({ a: id, b: 'c:' + t.toLowerCase(), kind: 'practised-in', w: n * r }); } } }
  // notes
  for (const nt of o.notes) for (const t of topics) { const r = Math.max(relatedness(t, nt.title), relatedness(t, nt.text.slice(0, 3000)) * 0.8); if (r >= 0.6) { const id = 'n:' + nt.title; add({ id, kind: 'note', label: nt.title, weight: 1 }); edges.push({ a: id, b: 'c:' + t.toLowerCase(), kind: 'notes-on', w: r }); } }
  // exams
  for (const e of o.deck.exams()) { const c = tid(e.topic); const id = 'e:' + e.topic.toLowerCase(); add({ id, kind: 'exam', label: `${e.topic} exam`, weight: 1, meta: new Date(e.at).toLocaleDateString() }); if (c) edges.push({ a: id, b: c, kind: 'exam-on', w: 1 }); else add({ id: 'c:' + e.topic.toLowerCase(), kind: 'concept', label: e.topic, weight: 1, mastery: 0, meta: 'no cards yet' }), edges.push({ a: id, b: 'c:' + e.topic.toLowerCase(), kind: 'exam-on', w: 1 });
  }
  return { nodes: [...nodes.values()], edges };
}

export interface Explain { topic: string; mastery: number; mistakes: string[]; sims: string[]; notes: string[]; exam?: { at: number; days: number }; next: string }
/** Everything the graph knows about one concept, plus the single most useful next action. */
export function explainConcept(g: Graph, topic: string, now = Date.now()): Explain | null {
  const c = g.nodes.find(n => n.kind === 'concept' && n.label.toLowerCase() === topic.toLowerCase()); if (!c) return null;
  const nb = (kind: NodeKind) => g.edges.filter(e => e.b === c.id || e.a === c.id).map(e => g.nodes.find(n => n.id === (e.a === c.id ? e.b : e.a))!).filter(n => n && n.kind === kind);
  const mistakes = nb('mistake').map(n => n.label), sims = nb('sim').map(n => n.label), notes = nb('note').map(n => n.label); const ex = g.nodes.find(n => n.kind === 'exam' && g.edges.some(e => e.kind === 'exam-on' && e.a === n.id && e.b === c.id));
  const exam = ex && ex.meta ? (() => { const at = new Date(g.edges.length ? ex.meta : '').getTime(); return Number.isFinite(at) ? { at, days: Math.max(0, Math.ceil((at - now) / DAY)) } : undefined; })() : undefined;
  const m = c.mastery ?? 0; const next = m < 0.5 && mistakes.length ? `Redo the ${mistakes.length} question${mistakes.length > 1 ? 's' : ''} you missed in ${c.label}.` : m < 0.7 ? `Review the due ${c.label} flashcards${sims.length ? ` or predict-and-run “${sims[0]}”` : ''}.` : !sims.length ? `Strong on ${c.label}. Try a simulation to test it in practice.` : `${c.label} looks solid. Keep it fresh with a short quiz.`;
  return { topic: c.label, mastery: m, mistakes, sims, notes, exam, next };
}
export function recommend(g: Graph, n = 3): { topic: string; why: string; score: number }[] {
  return g.nodes.filter(x => x.kind === 'concept').map(c => { const mis = g.edges.filter(e => e.kind === 'mistake-in' && e.b === c.id).reduce((a, e) => a + e.w, 0); const ex = g.edges.some(e => e.kind === 'exam-on' && e.b === c.id); const m = c.mastery ?? 0; return { topic: c.label, score: (1 - m) * 2 + Math.min(mis, 5) * 0.2 + (ex ? 0.8 : 0), why: `${Math.round(m * 100)}% mastery${mis ? `, ${mis} mistake${mis > 1 ? 's' : ''}` : ''}${ex ? ', exam coming' : ''}` }; }).sort((a, b) => b.score - a.score).slice(0, n);
}

/* ---------------- Outcomes ---------------- */
export interface Outcomes {
  reviews: number; activeDays30: number; quizzes: number;
  quiz: { first: number | null; latest: number | null; gain: number | null; n: number };
  retention: { label: string; n: number; recalled: number | null }[];
  masteryGrowth: { from: number | null; to: number | null; points: number };
  timeSaved: { minutes: number; assumptions: string[] };
  predictions: { n: number; right: number | null };
  evidence: 'none' | 'early' | 'usable';
}
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export function outcomes(m: StudentModel, now = Date.now()): Outcomes {
  const ev = m.events(); const rev = ev.filter(e => e.type === 'review'); const qz = ev.filter(e => e.type === 'quiz' && e.n);
  const pct = qz.map(e => (e.score ?? 0) / (e.n || 1)); const k = Math.min(3, Math.floor(pct.length / 2));
  const quiz = { n: pct.length, first: k ? mean(pct.slice(0, k)) : pct.length ? pct[0] : null, latest: k ? mean(pct.slice(-k)) : pct.length ? pct[pct.length - 1] : null, gain: null as number | null }; if (k) quiz.gain = quiz.latest! - quiz.first!;
  const B: [string, number, number][] = [['<1 day', 0, 1], ['1–3 days', 1, 3], ['3–7 days', 3, 7], ['1–2 weeks', 7, 14], ['2+ weeks', 14, 1e9]];
  const retention = B.map(([label, lo, hi]) => { const xs = rev.filter(e => e.elapsed != null && e.elapsed >= lo && e.elapsed < hi && e.grade != null); return { label, n: xs.length, recalled: xs.length >= 3 ? xs.filter(e => (e.grade ?? 0) >= 3).length / xs.length : null }; });
  const mh = m.masteryHistory(); const days = new Set(ev.filter(e => e.t >= now - 30 * DAY).map(e => new Date(e.t).toDateString())).size;
  const lec = ev.filter(e => e.type === 'lecture' || e.type === 'note').length, cards = ev.filter(e => e.type === 'course').length;
  const minutes = lec * 25 + Math.min(cards, 50) * 10;
  const pr = ev.filter(e => e.type === 'predict' && e.ok != null);
  const evidence: Outcomes['evidence'] = rev.length + qz.length < 10 ? 'none' : quiz.gain == null || mh.length < 3 ? 'early' : 'usable';
  return { reviews: rev.length, activeDays30: days, quizzes: qz.length, quiz, retention, masteryGrowth: { from: mh[0]?.avg ?? null, to: mh.length ? mh[mh.length - 1].avg : null, points: mh.length },
    timeSaved: { minutes, assumptions: ['Each lecture or auto-made note set saves about 25 minutes of manual note-taking (estimate, not measured).', 'Each auto-made course pack saves about 10 minutes per batch (capped).'] },
    predictions: { n: pr.length, right: pr.length ? pr.filter(e => e.ok).length / pr.length : null }, evidence };
}
