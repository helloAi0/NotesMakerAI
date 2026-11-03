/**
 * Tutor: FSRS-5 spaced repetition, flashcards generated from notes/lectures, per-topic mastery, mistake tracking, exam dates and proactive nudges.
 * FSRS formulas and default parameters follow the open FSRS-5 specification (Ye et al.); all state is stored on this device.
 */
import { defaultKV, testKV } from '../learn';
import type { KV } from '../learn';
import { findDefinitions, findFormulas, splitSentences } from '../../lecture';
import { parseWhen, daysUntil } from './when';

export const DAY = 86400000;
export const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const DECAY = -0.5, FACTOR = 19 / 81, clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const retrievability = (elapsedDays: number, S: number) => Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / S, DECAY);
export const nextInterval = (S: number, retention = 0.9) => Math.max(1, Math.round((S / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1)));
const d0 = (g: number) => clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);
export type Grade = 1 | 2 | 3 | 4; // again, hard, good, easy
export interface Card { id: string; topic: string; front: string; back: string; kind: 'def' | 'formula' | 'cloze' | 'qa'; source?: string; created: number; due: number; S: number; D: number; reps: number; lapses: number; last?: number; state: 'new' | 'learning' | 'review' | 'relearning' }
export function schedule(c: Card, g: Grade, now: number): Card {
  const n = { ...c, reps: c.reps + 1, last: now };
  if (c.state === 'new' || !c.last) { n.S = W[g - 1]; n.D = d0(g); } else {
    const t = (now - c.last) / DAY, R = retrievability(t, c.S);
    const D1 = c.D - W[6] * (g - 3); const D2 = D1 + ((10 - D1) * (-W[6] * (g - 3))) / 9; n.D = clamp(W[7] * d0(4) + (1 - W[7]) * D2, 1, 10);
    if (t < 1) n.S = Math.max(0.01, c.S * Math.exp(W[17] * (g - 3 + W[18])));
    else if (g === 1) { n.S = Math.max(0.01, Math.min(c.S, W[11] * Math.pow(c.D, -W[12]) * (Math.pow(c.S + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R)))); n.lapses = c.lapses + 1; }
    else n.S = c.S * (1 + Math.exp(W[8]) * (11 - c.D) * Math.pow(c.S, -W[9]) * (Math.exp(W[10] * (1 - R)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1));
  }
  if (g === 1) { n.state = c.state === 'new' ? 'learning' : 'relearning'; n.due = now + 10 * 60000; } else { n.state = 'review'; n.due = now + nextInterval(n.S) * DAY; }
  return n;
}

/* ---------------- card generation (offline, from your own notes) ---------------- */
let seq = 0; const uid = () => `c${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 4)}`;
export function cardsFromText(text: string, topic: string, source = '', now = Date.now()): Card[] {
  const out: Card[] = []; const mk = (kind: Card['kind'], front: string, back: string) => out.push({ id: uid(), topic, front, back, kind, source, created: now, due: now, S: 0, D: 0, reps: 0, lapses: 0, state: 'new' });
  const ss = splitSentences(text);
  for (const d of findDefinitions(ss)) mk('def', `What is ${d.term}?`, d.meaning);
  for (const f of findFormulas(text)) { const i = f.text.indexOf('='); if (i > 0) mk('formula', `Write the relation: ${f.text.slice(0, i).trim()} = ?`, f.text); }
  const have = new Set(out.map(c => c.back.toLowerCase()));
  for (const s of ss) { if (out.length >= 24) break; if (s.length < 50 || s.length > 220 || have.has(s.toLowerCase())) continue; const w = s.match(/\b[A-Za-z]{7,}\b/g); if (!w) continue; const key = [...w].sort((a, b) => b.length - a.length)[0]; mk('cloze', s.replace(key, '_____'), key); }
  const seen = new Set<string>(); return out.filter(c => !seen.has(c.front) && seen.add(c.front)).slice(0, 30);
}
export interface Quiz { q: string; options: string[]; answer: number; cardId: string; topic: string }

export interface Mistake { id: string; t: number; topic: string; question: string; given: string; correct: string }
export interface Exam { id: string; topic: string; at: number }
interface State { cards: Card[]; mistakes: Mistake[]; exams: Exam[] }
export class Deck {
  s: State; private kv: KV; private key: string; constructor(kv: KV = defaultKV(), key = 'nm_friday_deck') { this.kv = kv; this.key = key; try { this.s = { cards: [], mistakes: [], exams: [], ...JSON.parse(kv.get(key) || '{}') }; } catch { this.s = { cards: [], mistakes: [], exams: [] }; } }
  private save() { this.kv.set(this.key, JSON.stringify({ ...this.s, mistakes: this.s.mistakes.slice(-200) })); }
  cards() { return this.s.cards; }
  add(cards: Card[]): number { const have = new Set(this.s.cards.map(c => c.topic + '|' + c.front)); const fresh = cards.filter(c => !have.has(c.topic + '|' + c.front)); this.s.cards.push(...fresh); this.save(); return fresh.length; }
  remove(id: string) { this.s.cards = this.s.cards.filter(c => c.id !== id); this.save(); }
  due(now = Date.now(), limit = 20): Card[] { const weak = new Set(this.weakTopics(now).map(w => w.topic)); return this.s.cards.filter(c => c.due <= now).sort((a, b) => (weak.has(b.topic) ? 1 : 0) - (weak.has(a.topic) ? 1 : 0) || a.due - b.due).slice(0, limit); }
  review(id: string, g: Grade, now = Date.now()): Card | null { const i = this.s.cards.findIndex(c => c.id === id); if (i < 0) return null; const c = schedule(this.s.cards[i], g, now); this.s.cards[i] = c; this.save(); return c; }
  recordMistake(m: Omit<Mistake, 'id' | 't'>, now = Date.now()) { this.s.mistakes.push({ ...m, id: uid(), t: now }); this.save(); }
  mistakes(topic?: string) { return topic ? this.s.mistakes.filter(m => m.topic === topic) : this.s.mistakes; }
  topics(): string[] { return [...new Set(this.s.cards.map(c => c.topic))]; }
  /** mastery = mean recall probability over ALL cards of the topic (unseen cards count as 0) */
  mastery(topic: string, now = Date.now()): { topic: string; mastery: number; cards: number; due: number; mistakes: number } {
    const cs = this.s.cards.filter(c => c.topic.toLowerCase() === topic.toLowerCase()); const sum = cs.reduce((a, c) => a + (c.last ? retrievability((now - c.last) / DAY, c.S) : 0), 0);
    return { topic, mastery: cs.length ? sum / cs.length : 0, cards: cs.length, due: cs.filter(c => c.due <= now).length, mistakes: this.s.mistakes.filter(m => m.topic.toLowerCase() === topic.toLowerCase()).length };
  }
  weakTopics(now = Date.now(), below = 0.7) { return this.topics().map(t => this.mastery(t, now)).filter(m => m.mastery < below).sort((a, b) => a.mastery - b.mastery); }
  exams() { return [...this.s.exams].sort((a, b) => a.at - b.at); }
  addExam(topic: string, at: number) { const t = topic.trim(); if (!t) return; this.s.exams = this.s.exams.filter(e => e.topic.toLowerCase() !== t.toLowerCase()); this.s.exams.push({ id: uid(), topic: t, at }); this.save(); }
  removeExam(id: string) { this.s.exams = this.s.exams.filter(e => e.id !== id); this.save(); }
  /** Proactive nudges, most urgent first: “Enthalpy is weak (41%), exam in 3 days — 8 cards due.” */
  nudges(now = Date.now()): string[] {
    const out: { u: number; t: string }[] = [];
    for (const e of this.exams()) {
      if (e.at < now - DAY) continue; const d = daysUntil(e.at, now); const m = this.mastery(e.topic, now); const when = d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`; const T = e.topic[0].toUpperCase() + e.topic.slice(1);
      if (!m.cards) out.push({ u: 2 / Math.max(1, d), t: `${T}: exam ${when}, but you have no flashcards for it yet. Say “make flashcards from my notes on ${e.topic}”.` });
      else if (m.mastery < 0.7) out.push({ u: (1 - m.mastery) * 3 / Math.max(1, d), t: `${T} is weak (${Math.round(m.mastery * 100)}%), exam ${when}${m.due ? ` — ${m.due} card${m.due === 1 ? '' : 's'} due` : ''}.` });
    }
    for (const w of this.weakTopics(now, 0.5)) if (!this.s.exams.some(e => e.topic.toLowerCase() === w.topic.toLowerCase())) out.push({ u: (1 - w.mastery) / 10, t: `${w.topic} is slipping (${Math.round(w.mastery * 100)}%).` });
    const due = this.s.cards.filter(c => c.due <= now).length; if (due) out.push({ u: 0.05, t: `${due} flashcard${due === 1 ? '' : 's'} due for review.` });
    return out.sort((a, b) => b.u - a.u).map(x => x.t);
  }
  quiz(topic: string | null, n = 5, now = Date.now()): Quiz[] {
    const pool = this.s.cards.filter(c => (!topic || c.topic.toLowerCase() === topic.toLowerCase()) && c.back.length < 140); const base = pool.length >= 2 ? pool : this.s.cards.filter(c => c.back.length < 140); if (base.length < 2) return [];
    const pick = [...base].sort((a, b) => (a.due <= now ? 0 : 1) - (b.due <= now ? 0 : 1) || a.due - b.due).slice(0, n);
    return pick.map((c, k) => { const others = base.filter(x => x.id !== c.id && x.back !== c.back); const d = others.sort((a, b) => ((a.id.charCodeAt(2) + k) % 7) - ((b.id.charCodeAt(2) + k) % 7)).slice(0, 3).map(x => x.back); const opts = [...d]; const pos = (c.front.length + k) % (opts.length + 1); opts.splice(pos, 0, c.back); return { q: c.front, options: opts, answer: pos, cardId: c.id, topic: c.topic }; });
  }
  /** Which cards to study now: due cards first, weak/exam topics first, capped by minutes (≈0.5 min a card). */
  session(minutes = 15, now = Date.now()) { return this.due(now, Math.max(1, Math.round(minutes * 2))); }
}
/** “my thermodynamics exam is on friday” → { topic, at } */
export function parseExam(text: string, now = Date.now()): { topic: string; at: number } | null {
  const w = parseWhen(text, now); if (!w) return null; const s = text.toLowerCase();
  let m = s.match(/\b(?:my\s+)?([a-z][a-z\s&-]{2,40}?)\s+(?:exam|test|quiz|midterm|final)\b/); let topic = m?.[1]?.replace(/\b(?:my|the|have|has|a|an|i|there is|there's|upcoming)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!topic) { m = s.match(/\b(?:exam|test|quiz)\s+(?:on|in|for)\s+([a-z][a-z\s&-]{2,40}?)(?:\s+(?:is|on|in|at|next|this|tomorrow|today)\b|$)/); topic = m?.[1]?.trim(); }
  if (!topic || !/\b(exam|test|quiz|midterm|final)\b/.test(s)) return null; return { topic, at: w.at };
}
export const testDeck = () => new Deck(testKV(), 'd');
