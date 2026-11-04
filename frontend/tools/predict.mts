import assert from 'node:assert/strict';
import { SIMS } from '../src/sims/registry.ts';
import { makeChallenge, grade, explainGap, runHeadless, dirOf } from '../src/lib/platform/predict.ts';
import type { Challenge } from '../src/lib/platform/predict.ts';
let seed = 7; const rng = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const val = (rs: { label: string; value: unknown }[], l: string) => parseFloat(String(rs.find(r => r.label === l)?.value));
let ok = 0, ms = 0, worst = 0; const bad: string[] = []; const t0 = Date.now(); let sample: { sim: (typeof SIMS)[number]; c: Challenge } | null = null;
for (const s of SIMS) {
  const t = Date.now(); let c: Challenge | null = null; try { c = makeChallenge(s, { rng, seconds: 4 }); } catch (e) { bad.push(`${s.id}: THREW ${(e as Error).message}`); continue; } const d = Date.now() - t; ms += d; worst = Math.max(worst, d);
  if (!c) continue; ok++; if (!sample && Number.isFinite(c.ratio) && c.ratio > 0) sample = { sim: s, c };
  const a = val(runHeadless(s, c.baseValues, c.seconds).readouts, c.readout.label), b = val(runHeadless(s, c.newValues, c.seconds).readouts, c.readout.label);
  if (dirOf(a, b) !== c.dir || Math.abs(b - c.after.value) > 0.08 * Math.max(1e-9, Math.abs(c.after.value))) bad.push(`${s.id}: ground truth not reproducible`);
  if (!Number.isFinite(c.before.value) || !Number.isFinite(c.after.value) || c.param.from === c.param.to) bad.push(`${s.id}: degenerate challenge`);
}
console.log(`${ok}/${SIMS.length} sims give a challenge; avg ${(ms / SIMS.length).toFixed(0)} ms, worst ${worst} ms, total ${Date.now() - t0} ms`);
assert.ok(!bad.length, bad.slice(0, 8).join('\n')); assert.ok(ok >= SIMS.length * 0.5, 'at least half of the simulations should support a prediction challenge'); assert.ok(worst < 2500, `slowest challenge ${worst} ms`);
assert.ok(sample, 'a sample challenge exists'); const { sim, c } = sample!;
const right = grade(c, { dir: c.dir, ratio: c.ratio }); assert.ok(right.ok && right.ratioClose);
const wrongDir = (['up', 'down', 'same'] as const).find(d => d !== c.dir)!; const w = grade(c, { dir: wrongDir }); assert.ok(!w.ok);
const e = explainGap(c, { dir: wrongDir }, w, sim); assert.match(e.headline, /Not quite/); assert.ok(e.ask.includes(c.param.label)); assert.match(explainGap(c, { dir: c.dir }, right, sim).headline, /Right/);
assert.equal(grade(c, { dir: c.dir, ratio: c.ratio * 3 }).ratioClose, false);
console.log('predict OK:', sim.id, '|', c.question.slice(0, 120));
