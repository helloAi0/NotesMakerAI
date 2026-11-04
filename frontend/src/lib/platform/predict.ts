/* Simulation-driven tutoring: PREDICT → RUN → EXPLAIN THE GAP.
   Simulations are plain objects (init/step/readouts), so we can run them headless, find a parameter change that visibly moves a
   readout, ask the student to predict the effect, then show the real result and explain where the mental model went wrong. */
import type { AnySim, Readout, Values, NumberParam } from '../../sims/types';

export type Dir = 'up' | 'down' | 'same';
export interface Reading { label: string; value: number; text: string }
export interface Challenge {
  simId: string; simTitle: string; topic: string; seconds: number;
  param: { id: string; label: string; unit?: string; from: number; to: number };
  readout: { label: string; unit?: string };
  before: Reading; after: Reading; dir: Dir; ratio: number;
  baseValues: Values; newValues: Values; equationsAfter: string[]; question: string;
}
export interface Prediction { dir: Dir; ratio?: number }
export interface Grade { ok: boolean; dirOk: boolean; ratioClose: boolean | null; actual: Dir; pctChange: number }

const defaults = (sim: AnySim): Values => Object.fromEntries(sim.params.map(p => [p.id, p.value]));
const fmt = (x: number) => (Math.abs(x) >= 1000 || (Math.abs(x) < 0.01 && x !== 0) ? x.toExponential(2) : String(Math.round(x * 1000) / 1000));
const unitOf = (r: Readout) => (r.unit ? ` ${r.unit}` : '');

/** Run a simulation without a screen for `seconds` of simulated time (stops early if it is taking too long). */
export function runHeadless(sim: AnySim, values: Values, seconds = 6, maxMs = 450): { readouts: Readout[]; equations: string[]; simulated: number; truncated: boolean } {
  // A fixed number of steps (not a fixed wall-clock time) so the same settings always give the same result.
  const s = sim.init(values) as never; const dt = sim.dt ?? 1 / 240; const steps = Math.min(Math.ceil(seconds / dt), 4800); const t0 = Date.now(); let i = 0, truncated = false;
  try { for (; i < steps; i++) { sim.step(s, values, dt); if ((i & 7) === 7 && Date.now() - t0 > maxMs) { truncated = true; break; } } } catch { truncated = true; }
  let readouts: Readout[] = [], equations: string[] = []; try { readouts = sim.readouts(s, values); } catch { truncated = true; } try { equations = sim.equations?.(s, values) ?? []; } catch { /* ignore */ }
  return { readouts, equations, simulated: i * dt, truncated };
}
const num = (r: Readout) => (typeof r.value === 'number' ? r.value : parseFloat(String(r.value)));
const snap = (p: NumberParam, v: number) => { const c = Math.min(p.max, Math.max(p.min, v)); const k = Math.round((c - p.min) / p.step); return Math.min(p.max, Math.max(p.min, +(p.min + k * p.step).toFixed(6))); };
export const dirOf = (a: number, b: number, tol = 0.03): Dir => { const d = Math.abs(b - a) / Math.max(Math.abs(a), Math.abs(b), 1e-12); return d < tol ? 'same' : b > a ? 'up' : 'down'; };

export function makeChallenge(sim: AnySim, o: { seconds?: number; rng?: () => number; budgetMs?: number } = {}): Challenge | null {
  const rng = o.rng ?? Math.random; let seconds = o.seconds ?? 6; const t0 = Date.now(); const base = defaults(sim);
  const nums = sim.params.filter((p): p is NumberParam => p.kind === 'number' && p.max > p.min); if (!nums.length) return null;
  const order = [...nums].sort(() => rng() - 0.5); const b = runHeadless(sim, base, seconds); if (!b.readouts.length || b.truncated) return null; seconds = Math.round(b.simulated * 10) / 10;
  type Cand = { score: number; p: NumberParam; to: number; ri: number; after: ReturnType<typeof runHeadless> }; const cands: Cand[] = [];
  for (const p of order.slice(0, 5)) {
    if (Date.now() - t0 > (o.budgetMs ?? 900) && cands.length) break;
    const up = p.value === 0 ? p.value + (p.max - p.min) * 0.4 : p.value * 2; const to = snap(p, up > p.max ? p.value / 2 : up); if (to === p.value) continue;
    const a = runHeadless(sim, { ...base, [p.id]: to }, seconds); if (a.truncated) continue;
    for (let i = 0; i < b.readouts.length; i++) {
      const ar = a.readouts.find(r => r.label === b.readouts[i].label); if (!ar) continue; const x = num(b.readouts[i]), y = num(ar); if (!Number.isFinite(x) || !Number.isFinite(y)) continue; const rel = Math.abs(y - x) / Math.max(Math.abs(x), Math.abs(y), 1e-12);
      if (rel < 0.08 || rel > 50) continue; const score = Math.min(rel, 1) + rng() * 0.3; cands.push({ score, p, to, ri: i, after: a });
    }
  }
  // Random elements inside a simulation would make the "right answer" unreliable: only keep a challenge whose result repeats.
  cands.sort((x, y) => y.score - x.score); let best: Cand | null = null;
  const close = (p: number, q: number) => Math.abs(p - q) <= 0.03 * Math.max(Math.abs(p), Math.abs(q), 1e-12);
  for (const c of cands.slice(0, 3)) {
    if (Date.now() - t0 > 1800) break; let good = true; const lab = b.readouts[c.ri].label, pick = (r: Readout[]) => num(r.find(z => z.label === lab) ?? { label: '', value: NaN }); const x1 = pick(b.readouts), y1 = pick(c.after.readouts);
    for (let rep = 0; rep < 3 && good; rep++) { const b2 = runHeadless(sim, base, seconds), a2 = runHeadless(sim, { ...base, [c.p.id]: c.to }, seconds); const x2 = pick(b2.readouts), y2 = pick(a2.readouts); good = !b2.truncated && !a2.truncated && close(x1, x2) && close(y1, y2) && dirOf(x1, y1) === dirOf(x2, y2); }
    if (good) { best = c; break; }
  }
  if (!best) return null; const rb = b.readouts[best.ri], ra = best.after.readouts.find(r => r.label === rb.label)!; const x = num(rb), y = num(ra);
  const before = { label: rb.label, value: x, text: `${fmt(x)}${unitOf(rb)}` }, after = { label: ra.label, value: y, text: `${fmt(y)}${unitOf(ra)}` };
  return {
    simId: sim.id, simTitle: sim.title, topic: sim.topic || sim.category || sim.title, seconds, param: { id: best.p.id, label: best.p.label, unit: best.p.unit, from: best.p.value, to: best.to }, readout: { label: rb.label, unit: rb.unit },
    before, after, dir: dirOf(x, y), ratio: x !== 0 ? y / x : NaN, baseValues: base, newValues: { ...base, [best.p.id]: best.to }, equationsAfter: best.after.equations.slice(0, 3),
    question: `In “${sim.title}”, you change ${best.p.label} from ${fmt(best.p.value)}${best.p.unit ? ' ' + best.p.unit : ''} to ${fmt(best.to)}${best.p.unit ? ' ' + best.p.unit : ''} and leave everything else alone. After ${seconds} s of simulated time, what happens to “${rb.label}” (it starts at ${before.text})?`,
  };
}

export function grade(c: Challenge, p: Prediction): Grade {
  const dirOk = p.dir === c.dir; const ratioClose = p.ratio != null && Number.isFinite(p.ratio) && Number.isFinite(c.ratio) && c.ratio !== 0 ? Math.abs(p.ratio - c.ratio) / Math.abs(c.ratio) <= 0.25 : null;
  return { ok: dirOk, dirOk, ratioClose, actual: c.dir, pctChange: c.before.value !== 0 ? ((c.after.value - c.before.value) / Math.abs(c.before.value)) * 100 : NaN };
}
const word = (d: Dir) => (d === 'up' ? 'increase' : d === 'down' ? 'decrease' : 'stay about the same');
/** The “gap” explanation: what happened, where the prediction differed, and a question that points at the cause (it never just repeats the answer). */
export function explainGap(c: Challenge, p: Prediction, g: Grade, sim?: AnySim): { headline: string; lines: string[]; ask: string } {
  const pc = Number.isFinite(g.pctChange) ? `${g.pctChange >= 0 ? '+' : ''}${Math.round(g.pctChange)}%` : '';
  const headline = g.ok ? `Right: “${c.readout.label}” does ${word(c.dir)} (${c.before.text} → ${c.after.text}${pc ? ', ' + pc : ''}).` : `Not quite. You predicted it would ${word(p.dir)}, but “${c.readout.label}” actually does ${word(c.dir)} (${c.before.text} → ${c.after.text}${pc ? ', ' + pc : ''}).`;
  const lines: string[] = [];
  if (g.ok && g.ratioClose === false && p.ratio != null) lines.push(`Direction right, size off: you guessed ×${fmt(p.ratio)}, the real factor is ×${fmt(c.ratio)}. That points to a power or a constant you did not account for.`);
  if (g.ok && g.ratioClose) lines.push(`Your size estimate (×${fmt(p.ratio!)}) was close to the real ×${fmt(c.ratio)}.`);
  if (c.equationsAfter.length) lines.push('The simulation’s own equations at this setting: ' + c.equationsAfter.join('  ·  '));
  const obj = sim?.learningObjectives?.[0] || sim?.hint; if (obj) lines.push('Idea to revisit: ' + obj.slice(0, 220));
  const ask = g.ok ? `What would happen if you doubled ${c.param.label} again? Write down your guess, then try it in the simulation.` : `Which quantity in the equations above depends on ${c.param.label}, and does it make “${c.readout.label}” bigger or smaller? Try changing only ${c.param.label} in the simulation and watch.`;
  return { headline, lines, ask };
}
