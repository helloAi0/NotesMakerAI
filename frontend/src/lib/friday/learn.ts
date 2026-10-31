/**
 * FRIDAY's long-term memory and reinforcement learning, all stored on this device.
 *  - Memory: facts/preferences/episodes with BM25 recall; facts are extracted from what the user says ("my name is …").
 *  - Policy: a contextual softmax policy over answer *strategies* (concise, step-by-step, example-first, formal, analogy), trained online
 *    with REINFORCE (baseline-subtracted policy gradient) from 👍/👎/regenerate/copy feedback, plus ε-exploration.
 *  - Preferences: global length/level dials nudged by feedback reasons and written into the model prompt.
 * Nothing here pretends to be more than it is: a small online learner that really changes FRIDAY's behaviour from your feedback.
 */
import { Bm25 } from '../textTools';

export interface KV { get(k: string): string | null; set(k: string, v: string): void }
const memKV = (): KV => { const m = new Map<string, string>(); return { get: k => m.get(k) ?? null, set: (k, v) => { m.set(k, v); } }; };
const lsKV = (): KV => ({ get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* quota */ } } });
export const defaultKV = (): KV => (typeof localStorage !== 'undefined' ? lsKV() : memKV());
export const testKV = memKV;

/* ================================================================== */
/*  Memory                                                             */
/* ================================================================== */
export interface Memory { id: string; kind: 'fact' | 'preference' | 'episode'; text: string; t: number; hits: number }
export class MemoryStore {
  private items: Memory[]; private kv: KV; private key: string;
  constructor(kv: KV = defaultKV(), key = 'nm_friday_memory') { this.kv = kv; this.key = key; try { this.items = JSON.parse(kv.get(key) || '[]'); } catch { this.items = []; } if (!Array.isArray(this.items)) this.items = []; }
  private save() { this.kv.set(this.key, JSON.stringify(this.items.slice(-400))); }
  all() { return [...this.items].sort((a, b) => b.t - a.t); }
  add(text: string, kind: Memory['kind'] = 'fact'): Memory | null {
    const t = text.trim().replace(/\s+/g, ' ').slice(0, 300); if (t.length < 3) return null;
    const dup = this.items.find(m => m.text.toLowerCase() === t.toLowerCase()); if (dup) { dup.t = Date.now(); this.save(); return dup; }
    // a newer statement about the same slot replaces the older one ("my name is A" → "my name is B")
    const slot = slotOf(t); if (slot) this.items = this.items.filter(m => slotOf(m.text) !== slot);
    const m: Memory = { id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, kind, text: t, t: Date.now(), hits: 0 }; this.items.push(m); this.save(); return m;
  }
  forget(query: string): number {
    const q = query.trim().toLowerCase(); if (!q) return 0; if (/^(everything|all)$/.test(q)) { const n = this.items.length; this.items = []; this.save(); return n; }
    const before = this.items.length; this.items = this.items.filter(m => !m.text.toLowerCase().includes(q)); this.save(); return before - this.items.length;
  }
  remove(id: string) { this.items = this.items.filter(m => m.id !== id); this.save(); }
  recall(query: string, k = 4): Memory[] {
    if (!this.items.length) return []; const bm = new Bm25(this.items.map(m => ({ id: m.id, text: m.text })), 3); const hits = bm.search(query, k).filter(h => h.score > 0.4);
    const out = hits.map(h => this.items.find(m => m.id === h.doc.id)!).filter(Boolean); const profile = this.items.filter(m => m.kind !== 'episode' && /\b(name|studying|study|class|year|prefer|course|branch|exam)\b/i.test(m.text)).slice(-3);
    const seen = new Set<string>(); return [...out, ...profile].filter(m => !seen.has(m.id) && seen.add(m.id)).slice(0, k + 2);
  }
  name(): string | null { const m = this.items.find(x => /^(?:the user'?s name is|your name is) /i.test(x.text) || /^name: /i.test(x.text)); return m ? m.text.replace(/^(?:the user'?s name is|your name is|name:)\s*/i, '').trim() : null; }
}
function slotOf(t: string): string | null { const l = t.toLowerCase(); if (/\bname is\b|^name:/.test(l)) return 'name'; if (/\b(studying|class \d+|year of|b\.?tech|m\.?tech|b\.?sc|m\.?sc)\b/.test(l)) return 'level'; if (/prefers? (short|long|detailed|brief)/.test(l)) return 'length'; return null; }
/** Pull durable facts out of a user message. Returns the statements to store (already phrased in the third person). */
export function extractFacts(msg: string): { facts: string[]; explicit: boolean } {
  const m = msg.trim(); const out: string[] = []; let explicit = false, r: RegExpMatchArray | null;
  if ((r = m.match(/^(?:please\s+)?remember(?:\s+that)?\s+(.{3,200})$/i))) { explicit = true; out.push(r[1].replace(/\bmy\b/gi, 'the user\'s').replace(/\bI am\b/gi, 'the user is').replace(/\bI'm\b/gi, 'the user is').replace(/\bI\b/g, 'the user').replace(/[.!]+$/, '')); }
  else {
    if ((r = m.match(/\b(?:my name is|call me|i am called)\s+([A-Z][\p{L}'-]{1,24})\b/iu))) out.push(`The user's name is ${r[1][0].toUpperCase()}${r[1].slice(1)}`);
    if ((r = m.match(/\bi(?:'m| am)\s+(?:studying|doing|pursuing|in)\s+([^.,;!?]{3,60})/i))) out.push(`The user is studying ${r[1].trim()}`);
    if ((r = m.match(/\bi(?:'m| am)\s+in\s+(class|grade|year)\s+(\d{1,2})/i))) out.push(`The user is in ${r[1].toLowerCase()} ${r[2]}`);
    if ((r = m.match(/\bi\s+(?:prefer|like|want)\s+(short|brief|concise|detailed|long|step[- ]by[- ]step|simple)\s+(?:answers?|explanations?|replies)/i))) out.push(`The user prefers ${r[1].toLowerCase()} answers`);
    if ((r = m.match(/\bmy\s+(?:exam|test)\s+(?:is|on)\s+([^.,;!?]{3,40})/i))) out.push(`The user has an exam ${r[1].trim()}`);
  }
  return { facts: out.map(s => s.slice(0, 200)), explicit };
}

/* ================================================================== */
/*  Reinforcement-learning policy over answer strategies                */
/* ================================================================== */
export const STRATEGIES = ['concise', 'stepwise', 'example', 'formal', 'analogy'] as const;
export type Strategy = typeof STRATEGIES[number];
export const CONTEXTS = ['explain', 'derive', 'define', 'howto', 'compute', 'chat'] as const;
export type Ctx = typeof CONTEXTS[number];
export const STRATEGY_STYLE: Record<Strategy, string> = {
  concise: 'Answer in the fewest words that are still complete: a direct answer first, at most one short example.',
  stepwise: 'Teach step by step: number the steps, state each formula, and end with a one-line summary.',
  example: 'Lead with a concrete worked example, then generalise the idea in two or three sentences.',
  formal: 'Be precise and rigorous: definitions, assumptions, then the result with its derivation; use proper notation.',
  analogy: 'Start from an everyday analogy that builds intuition, then give the exact statement and the formula.',
};
export function classify(q: string): Ctx {
  const l = q.toLowerCase();
  if (/\b(derive|derivation|prove|proof|show that)\b/.test(l)) return 'derive';
  if (/\b(calculate|compute|evaluate|solve|simplify|integrate|differentiate)\b|\d\s*[-+*/^]\s*\d/.test(l)) return 'compute';
  if (/^(?:what is|what's|define|meaning of|what are)\b/.test(l) && l.split(/\s+/).length <= 8) return 'define';
  if (/\b(how (?:do|can|to|does)|steps? to|guide|tutorial|use)\b/.test(l)) return 'howto';
  if (/\b(explain|why|difference|compare|intuition|understand|how does|works?)\b/.test(l)) return 'explain';
  return 'chat';
}
export interface PolicyState { theta: Record<string, number[]>; n: Record<string, number[]>; r: Record<string, number[]>; baseline: Record<string, number>; log: { t: number; ctx: string; s: string; r: number }[]; prefs: { length: number; level: number } }
const fresh = (): PolicyState => ({ theta: {}, n: {}, r: {}, baseline: {}, log: [], prefs: { length: 0, level: 0 } });
export const softmax = (z: number[], tau = 1) => { const m = Math.max(...z), e = z.map(x => Math.exp((x - m) / tau)), s = e.reduce((a, b) => a + b, 0); return e.map(x => x / s); };
export class Policy {
  s: PolicyState; alpha: number; epsilon: number; private kv: KV; private key: string;
  constructor(kv: KV = defaultKV(), key = 'nm_friday_policy', alpha = 0.35, epsilon = 0.12) { this.kv = kv; this.key = key; this.alpha = alpha; this.epsilon = epsilon; try { const j = JSON.parse(kv.get(key) || 'null'); this.s = j && j.theta ? { ...fresh(), ...j } : fresh(); } catch { this.s = fresh(); } }
  private save() { this.s.log = this.s.log.slice(-300); this.kv.set(this.key, JSON.stringify(this.s)); }
  private th(c: string) { return (this.s.theta[c] ??= STRATEGIES.map(() => 0)); }
  probs(c: Ctx | string): number[] { return softmax(this.th(c)); }
  /** Sample a strategy: ε-greedy exploration on top of the softmax policy. */
  pick(c: Ctx, rng: () => number = Math.random): Strategy {
    const p = this.probs(c); if (rng() < this.epsilon) return STRATEGIES[Math.floor(rng() * STRATEGIES.length)];
    let r = rng(); for (let i = 0; i < p.length; i++) { r -= p[i]; if (r <= 0) return STRATEGIES[i]; } return STRATEGIES[STRATEGIES.length - 1];
  }
  best(c: Ctx): Strategy { const p = this.probs(c); return STRATEGIES[p.indexOf(Math.max(...p))]; }
  /** REINFORCE with a running baseline: θ_a += α (r − b)(1[a] − π_a) */
  reward(c: Ctx, strat: Strategy, r: number) {
    const th = this.th(c), p = softmax(th), a = STRATEGIES.indexOf(strat), b = this.s.baseline[c] ?? 0, adv = r - b;
    for (let i = 0; i < th.length; i++) th[i] += this.alpha * adv * ((i === a ? 1 : 0) - p[i]);
    this.s.baseline[c] = b + 0.2 * (r - b); (this.s.n[c] ??= STRATEGIES.map(() => 0))[a]++; (this.s.r[c] ??= STRATEGIES.map(() => 0))[a] += r; this.s.log.push({ t: Date.now(), ctx: c, s: strat, r }); this.save();
  }
  /** Reason-based preference nudges from a thumbs-down. */
  prefer(reason: 'too_long' | 'too_short' | 'too_technical' | 'too_simple') { const p = this.s.prefs; if (reason === 'too_long') p.length = Math.max(-1, p.length - 0.34); if (reason === 'too_short') p.length = Math.min(1, p.length + 0.34); if (reason === 'too_technical') p.level = Math.max(-1, p.level - 0.34); if (reason === 'too_simple') p.level = Math.min(1, p.level + 0.34); this.save(); }
  prefText(): string { const p = this.s.prefs, out: string[] = []; if (p.length <= -0.3) out.push('The user prefers short answers.'); if (p.length >= 0.3) out.push('The user prefers detailed answers.'); if (p.level <= -0.3) out.push('Use simpler language and avoid heavy jargon.'); if (p.level >= 0.3) out.push('The user is advanced; skip basics and be rigorous.'); return out.join(' '); }
  stats() { const tot = this.s.log.length, avg = tot ? this.s.log.reduce((a, x) => a + x.r, 0) / tot : 0, last = this.s.log.slice(-20), prev = this.s.log.slice(-40, -20); const m = (a: { r: number }[]) => (a.length ? a.reduce((x, y) => x + y.r, 0) / a.length : 0); return { total: tot, avgReward: avg, recent: m(last), trend: prev.length ? m(last) - m(prev) : 0, contexts: CONTEXTS.map(c => ({ ctx: c, probs: this.probs(c), best: this.best(c), n: (this.s.n[c] ?? []).reduce((a, b) => a + b, 0) })) }; }
  reset() { this.s = fresh(); this.save(); }
}
/** Map explicit feedback events to scalar rewards. */
export const REWARD = { up: 1, down: -1, regenerate: -0.5, copy: 0.4, edit: -0.3, followup_confused: -0.4 } as const;
