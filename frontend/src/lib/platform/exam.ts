/* Exam mode: a timed mock paper built from the student’s own weak topics, graded by the app, with an error-pattern report. */
import { Deck } from '../friday/agents/tutor';
import type { Card } from '../friday/agents/tutor';
import { tokens } from './model';

export interface Item { id: string; kind: 'mcq' | 'short'; topic: string; q: string; options?: string[]; answer?: number; key: string; cardId: string; marks: number }
export interface Paper { id: string; created: number; minutes: number; items: Item[] }
export interface Answer { itemId: string; choice?: number; text?: string; ms: number }
export interface Marked { item: Item; ok: boolean; got: number; given: string; ms: number; answered: boolean; why: string }
export interface Result {
  score: number; max: number; pct: number; items: Marked[];
  byTopic: { topic: string; got: number; max: number; pct: number }[];
  patterns: { kind: 'rushed' | 'concept-gap' | 'unanswered' | 'close-miss' | 'repeat-mistake'; count: number; advice: string }[];
  updates: { cardId: string; grade: 1 | 3; mistake?: { topic: string; question: string; given: string; correct: string } }[];
}

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export function makePaper(deck: Deck, o: { n?: number; minutes?: number; now?: number; rng?: () => number } = {}): Paper | null {
  const now = o.now ?? Date.now(); const rng = o.rng ?? Math.random; const n = o.n ?? 10; const all = deck.cards().filter(c => c.back.length >= 3 && c.back.length < 160); if (all.length < 3) return null;
  const weak = new Map(deck.topics().map(t => [t.toLowerCase(), 1 - deck.mastery(t, now).mastery])); const miss = new Map<string, number>(); for (const m of deck.mistakes()) miss.set(m.question, (miss.get(m.question) ?? 0) + 1);
  const w = (c: Card) => 0.2 + (weak.get(c.topic.toLowerCase()) ?? 0.5) * 2 + (c.due <= now ? 0.5 : 0) + Math.min(miss.get(c.front) ?? 0, 3) * 0.6 + rng() * 0.8;
  const pick = [...all].sort((a, b) => w(b) - w(a)).slice(0, Math.min(n, all.length)); const items: Item[] = [];
  pick.forEach((c, i) => {
    const short = i % 3 === 2; const id = 'q' + (i + 1);
    if (short) { items.push({ id, kind: 'short', topic: c.topic, q: c.front, key: c.back, cardId: c.id, marks: 2 }); return; }
    const others = all.filter(x => x.id !== c.id && x.back !== c.back && x.back.length < 160); const pool = others.sort((a, b) => hash(c.id + a.id) - hash(c.id + b.id)).slice(0, 3).map(x => x.back); const opts = [...pool]; const pos = hash(c.id) % (opts.length + 1); opts.splice(pos, 0, c.back);
    items.push({ id, kind: 'mcq', topic: c.topic, q: c.front, options: opts, answer: pos, key: c.back, cardId: c.id, marks: 1 });
  });
  return { id: 'p' + hash(String(now) + items.map(i => i.id + i.cardId).join('')).toString(36), created: now, minutes: o.minutes ?? Math.max(5, Math.round(items.length * 1.5)), items };
}
/** Short answers: partial credit by how much of the key’s content words the answer contains. */
export function markShort(key: string, answer: string): { got: number; why: string } {
  const k = [...new Set(tokens(key))], a = new Set(tokens(answer)); if (!answer.trim()) return { got: 0, why: 'no answer' }; if (!k.length) return { got: answer.trim().toLowerCase() === key.trim().toLowerCase() ? 1 : 0, why: '' };
  const kn = key.match(/-?\d+(?:\.\d+)?/g), an = answer.match(/-?\d+(?:\.\d+)?/g); if (kn && kn.length && !kn.every(x => an?.includes(x))) return { got: 0, why: 'the numbers do not match' };
  const cov = k.filter(w => a.has(w)).length / k.length; return cov >= 0.6 ? { got: 1, why: '' } : cov >= 0.35 ? { got: 0.5, why: `you covered ${Math.round(cov * 100)}% of the key ideas` } : { got: 0, why: 'key ideas missing' };
}
export function gradePaper(deck: Deck, paper: Paper, answers: Answer[]): Result {
  const by = new Map(answers.map(a => [a.itemId, a])); const prior = new Map<string, number>(); for (const m of deck.mistakes()) prior.set(m.question, (prior.get(m.question) ?? 0) + 1);
  const items: Marked[] = paper.items.map(it => {
    const a = by.get(it.id); const answered = !!a && (it.kind === 'mcq' ? a.choice != null : !!a.text?.trim()); const ms = a?.ms ?? 0;
    if (!answered) return { item: it, ok: false, got: 0, given: '', ms, answered, why: 'not answered' };
    if (it.kind === 'mcq') { const ok = a!.choice === it.answer; return { item: it, ok, got: ok ? it.marks : 0, given: it.options![a!.choice!], ms, answered, why: ok ? '' : 'wrong option' }; }
    const m = markShort(it.key, a!.text!); const got = m.got * it.marks; return { item: it, ok: m.got >= 1, got, given: a!.text!.trim(), ms, answered, why: m.why };
  });
  const score = items.reduce((s, x) => s + x.got, 0), max = items.reduce((s, x) => s + x.item.marks, 0);
  const tmap = new Map<string, { got: number; max: number }>(); for (const x of items) { const t = tmap.get(x.item.topic) ?? { got: 0, max: 0 }; t.got += x.got; t.max += x.item.marks; tmap.set(x.item.topic, t); }
  const byTopic = [...tmap].map(([topic, v]) => ({ topic, ...v, pct: v.max ? v.got / v.max : 0 })).sort((a, b) => a.pct - b.pct);
  const answeredMs = items.filter(x => x.answered).map(x => x.ms).sort((a, b) => a - b); const med = answeredMs.length ? answeredMs[Math.floor(answeredMs.length / 2)] : 0;
  const wrong = items.filter(x => x.answered && x.got < x.item.marks); const patterns: Result['patterns'] = [];
  const rushed = wrong.filter(x => med > 0 && x.ms < med * 0.4); if (rushed.length) patterns.push({ kind: 'rushed', count: rushed.length, advice: `${rushed.length} wrong answer${rushed.length > 1 ? 's were' : ' was'} given much faster than your usual pace. Re-read the question once before choosing.` });
  const gapTopics = byTopic.filter(t => t.pct < 0.5 && items.filter(x => x.item.topic === t.topic && x.got < x.item.marks).length >= 2); if (gapTopics.length) patterns.push({ kind: 'concept-gap', count: gapTopics.length, advice: `Several misses in ${gapTopics.map(t => t.topic).join(', ')}: that is a concept gap, not carelessness. Re-learn it before drilling.` });
  const rep = wrong.filter(x => (prior.get(x.item.q) ?? 0) >= 1); if (rep.length) patterns.push({ kind: 'repeat-mistake', count: rep.length, advice: `You missed ${rep.length} question${rep.length > 1 ? 's' : ''} you had already got wrong before. Try explaining the answer aloud, then ask FRIDAY to quiz you on it tomorrow.` });
  const close = items.filter(x => x.item.kind === 'short' && x.got > 0 && x.got < x.item.marks); if (close.length) patterns.push({ kind: 'close-miss', count: close.length, advice: `${close.length} short answer${close.length > 1 ? 's were' : ' was'} partly right. Practise stating the complete definition, not just the first idea.` });
  const un = items.filter(x => !x.answered); if (un.length) patterns.push({ kind: 'unanswered', count: un.length, advice: `${un.length} unanswered. In a real exam, move on after ~${Math.max(1, Math.round(paper.minutes * 60 / paper.items.length))} seconds and come back.` });
  const updates: Result['updates'] = items.filter(x => x.answered).map(x => ({ cardId: x.item.cardId, grade: x.ok ? 3 : 1, mistake: x.ok ? undefined : { topic: x.item.topic, question: x.item.q, given: x.given, correct: x.item.key } }));
  return { score, max, pct: max ? score / max : 0, items, byTopic, patterns, updates };
}
