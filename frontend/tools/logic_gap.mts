import assert from 'node:assert/strict';
import { solveTruss, warren, solveBeam, beamAt, analyticMax, venturi, hydrostatic, hallPetch, orowan, yieldStrength, METALS } from '../src/sims/gap_engineering.ts';
import { runMachine, simulateCache, BELADY, moProperties, MOLECULES, lcaoEquilibrium, lcaoE } from '../src/sims/gap_cs_chem.ts';
import { conicEccentricity, classify, taylor, selectionStep, hwGenotypes, chiSquare, stressAfter, momentMagnitude } from '../src/sims/gap_math_life.ts';
import { faradayInduction, photoelectric, specialRelativity } from '../src/sims/gap_physics_em.ts';
const near = (a: number, b: number, tol = 1e-6, m = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${m} ${a} vs ${b}`);
// truss: symmetric load P at C -> Ay=Ey=P/2; global equilibrium
{ const g = warren(12, 3), s = solveTruss(g, [[0, 0], [0, 0], [0, -40], [0, 0], [0, 0]])!; near(s.Ay, 20); near(s.Ey, 20); near(s.Ax, 0, 1e-9);
  const g2 = solveTruss(g, [[0, 0], [10, -20], [0, -40], [0, -20], [0, 0]])!; near(g2.Ay + g2.Ey, 80); near(g2.Ax, -10);
  // joint A equilibrium check: sum of member forces at A + reactions = 0
  const f = s.forces; near(f[0] * (3 / Math.hypot(3, 3)) + f[3] + s.Ax, 0, 1e-9); }
// beam vs closed form (nodal exact)
for (const bc of ['cantilever', 'simply', 'fixed'] as const) for (const load of ['point', 'udl'] as const) { const L = 4, EI = 2e7, P = 5e4, f = solveBeam(8, L, EI, bc, load, P, P)!; let wm = 0; for (let i = 0; i <= 400; i++) wm = Math.max(wm, Math.abs(beamAt(f, (i / 400) * L).w)); near(wm, analyticMax(bc, load, L, EI, P, P), 2e-3, `${bc}/${load}`); }
// venturi
{ const v = venturi(0.08, 0.04, 0.006, 1000); near(v.v2, v.v1 * 4, 1e-9); near(v.dp, 0.5 * 1000 * (v.v2 ** 2 - v.v1 ** 2)); near(hydrostatic(101325, 1000, 10), 101325 + 98066.5, 1e-6); }
// strengthening
{ near(hallPetch('cu', 1e-6), 0.11e6 / 1e-3); assert.ok(orowan('cu', 50e-9) > orowan('cu', 100e-9)); assert.ok(yieldStrength('cu', 1e-6, 1e-7) > yieldStrength('cu', 1e-4, null)); void METALS; }
// automata
assert.equal(runMachine('dfa3', '110').status, 'accept'); assert.equal(runMachine('dfa3', '1011').status, 'reject');
for (const w of ['110', '1001', '111', '10101', '11000', '1011']) assert.equal(runMachine('dfa3', w).status === 'accept', parseInt(w, 2) % 3 === 0, w);
for (const w of ['1101', '0110', '00101', '1', '0101', '11']) assert.equal(runMachine('nfa01', w).status === 'accept', w.endsWith('01'), w);
for (const w of ['1011', '111', '0', '1001', '11111', '100']) { const r = runMachine('tminc', w); assert.equal(r.status, 'accept'); assert.equal(parseInt(r.tape.join('').replace(/_/g, ''), 2), parseInt(w, 2) + 1, w); }
for (const w of ['abba', 'aba', 'ab', 'babab', 'aabbaa', 'abbb', '', 'a']) assert.equal(runMachine('tmpal', w).status === 'accept', w === [...w].reverse().join(''), w);
// cache: Belady
assert.equal(simulateCache(BELADY, 3, 'fifo').faults, 9); assert.equal(simulateCache(BELADY, 4, 'fifo').faults, 10);
assert.equal(simulateCache(BELADY, 3, 'opt').faults, 7); for (const p of ['fifo', 'lru', 'lfu', 'clock'] as const) assert.ok(simulateCache(BELADY, 3, p).faults >= 7);
assert.equal(simulateCache(BELADY, 3, 'lru').faults, 10);
// MO
const mp = (s: string) => { const m = MOLECULES.find(x => x.sym === s)!; return moProperties(m.Z, m.ve); };
assert.equal(mp('O₂').bondOrder, 2); assert.equal(mp('O₂').unpaired, 2); assert.equal(mp('N₂').bondOrder, 3); assert.equal(mp('N₂').unpaired, 0); assert.equal(mp('B₂').unpaired, 2); assert.equal(mp('C₂').unpaired, 0); assert.equal(mp('C₂').bondOrder, 2);
assert.equal(mp('He₂').bondOrder, 0); assert.equal(mp('Be₂').bondOrder, 0); assert.equal(mp('F₂').bondOrder, 1); assert.equal(mp('Ne₂').bondOrder, 0); assert.equal(mp('H₂').bondOrder, 1);
{ const e = lcaoEquilibrium(); near(e.R, 2.49, 0.02); assert.ok(lcaoE(e.R, 1) < -0.5 - 0.06 && lcaoE(e.R, 1) > -0.6); assert.ok(lcaoE(2.5, -1) > lcaoE(2.5, 1)); }
// math
assert.equal(classify(conicEccentricity(30, 90)), 'circle'); assert.equal(classify(conicEccentricity(30, 30)), 'parabola'); assert.equal(classify(conicEccentricity(30, 60)), 'ellipse'); assert.equal(classify(conicEccentricity(30, 10)), 'hyperbola');
near(taylor('sin', 11, 0, 1), Math.sin(1), 1e-9); near(taylor('exp', 20, 0, 2), Math.exp(2), 1e-9); near(taylor('ln1p', 60, 0, 0.5), Math.log(1.5), 1e-9); near(taylor('geo', 40, 0, 0.5), 2, 1e-9); near(taylor('cos', 10, 1, 1.5), Math.cos(1.5), 1e-8);
near(selectionStep(0.5, 0, 0), 0.5); assert.ok(selectionStep(0.5, 0.2, 0) > 0.5); near(Object.values(hwGenotypes(0.3)).reduce((a, b) => a + b, 0), 1); near(chiSquare([36, 48, 16], 0.6), 0, 1e-9);
assert.ok(stressAfter(90, 20, 1, 100).slipped > 0); near(momentMagnitude(100, 1), (2 / 3) * (Math.log10(3e10 * 1e8) - 9.1));
for (const s of [faradayInduction, photoelectric, specialRelativity]) assert.ok(s.id);
console.log('gap logic OK');
