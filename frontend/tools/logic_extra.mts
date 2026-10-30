import assert from 'node:assert/strict';
import { solveCircuit, mechRates, steadyHeart, ecAdd, ecMul, curvePoints, pointOrder, onCurve, nonSingular, primeImplicants, minimalCover, evalCover } from '../src/sims/gap_extra.ts';
const near = (a: number, b: number, t = 1e-9) => assert.ok(Math.abs(a - b) <= t * Math.max(1, Math.abs(b)), `${a} vs ${b}`);
// Ohm
{ const s = solveCircuit('series', 12, 0, 10, 20, 30); near(s.I, 0.2); near(s.v[2], 6); const p = solveCircuit('parallel', 12, 0, 10, 20, 30); near(p.I, 1.2 + 0.6 + 0.4); near(p.Rext, 60 / 11); const m = solveCircuit('mixed', 12, 0.5, 10, 20, 30); near(m.Rext, 22); near(m.I, 12 / 22.5); near(m.i[1] + m.i[2], m.I); near(m.v[0] + m.v[1] + m.I * 0.5, 12);
  for (const k of ['series', 'parallel', 'mixed'] as const) { const q = solveCircuit(k, 9, 1, 7, 13, 21); near(q.Pbat, q.Ploss + q.p[0] + q.p[1] + q.p[2], 1e-9); } }
// mechanisms
assert.equal(mechRates('primary', 'Br', 0.9, 0.2, 0, true, 298).best, 'SN2'); assert.equal(mechRates('methyl', 'I', 0.9, 0.2, 0, true, 298).best, 'SN2');
assert.equal(mechRates('tertiary', 'Br', 0.1, 0.1, 0, false, 298).best, 'SN1'); assert.equal(mechRates('tertiary', 'Br', 0.2, 0.95, 0.9, true, 340).best, 'E2');
assert.notEqual(mechRates('tertiary', 'Br', 0.9, 0.2, 0, true, 298).best, 'SN2');
// heart
{ const m = steadyHeart({ hr: 75, emax: 2, pla: 8, rsys: 1, cao: 1.5 }); console.log('heart', m); assert.ok(m.SV > 50 && m.SV < 100, 'SV'); assert.ok(m.Psys > 100 && m.Psys < 150 && m.Pdia > 60 && m.Pdia < 95, 'BP'); assert.ok(m.EDV > m.ESV);
  const hi = steadyHeart({ hr: 75, emax: 2, pla: 14, rsys: 1, cao: 1.5 }); assert.ok(hi.SV > m.SV, 'Frank-Starling'); const hr = steadyHeart({ hr: 75, emax: 2, pla: 8, rsys: 1.6, cao: 1.5 }); assert.ok(hr.Psys > m.Psys, 'resistance raises BP'); const ct = steadyHeart({ hr: 75, emax: 3, pla: 8, rsys: 1, cao: 1.5 }); assert.ok(ct.SV > m.SV, 'contractility'); }
// ECC
for (const p of [23, 97, 251]) { const a = 2, b = 3; if (!nonSingular(a, b, p)) continue; const pts = curvePoints(a, b, p), N = pts.length + 1; assert.ok(Math.abs(N - (p + 1)) <= 2 * Math.sqrt(p), 'hasse'); for (const P of pts.slice(0, 20)) assert.ok(onCurve(P, a, b, p)); const G = pts[0], n = pointOrder(G, a, p); assert.equal(ecMul(n, G, a, p), null); assert.ok(N % n === 0, 'Lagrange'); const A = ecMul(7, G, a, p), B = ecMul(11, G, a, p); assert.deepEqual(ecMul(7, B, a, p), ecMul(11, A, a, p)); assert.ok(onCurve(ecAdd(G, ecMul(3, G, a, p), a, p), a, b, p)); assert.deepEqual(ecAdd(ecMul(3, G, a, p), ecMul(4, G, a, p), a, p), ecMul(7, G, a, p)); }
// K-map
{ const cases: [number, number[], number[]][] = [[3, [3, 5, 6, 7], []], [3, [1, 2, 4, 7], []], [4, [0, 2, 3, 5, 6, 7, 8, 9], [10, 11, 12, 13, 14, 15]], [4, [2, 3, 5, 7, 11, 13], []], [4, [0, 1, 2, 5, 6, 7, 8, 9, 10, 14], []], [2, [0, 3], []]];
  for (const [nv, ones, dc] of cases) { const cov = minimalCover(nv, ones, dc); for (let m = 0; m < 1 << nv; m++) { if (dc.includes(m)) continue; assert.equal(evalCover(cov, m, nv), ones.includes(m), `${nv} ${ones} m${m}`); } }
  assert.equal(minimalCover(3, [3, 5, 6, 7], []).length, 3); assert.equal(minimalCover(3, [1, 2, 4, 7], []).length, 4); assert.equal(primeImplicants(4, [0, 1, 2, 3], []).length, 1);
  // exhaustive random check on 4 vars
  let seed = 5; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; for (let t = 0; t < 200; t++) { const ones: number[] = []; for (let m = 0; m < 16; m++) if (rnd() < 0.45) ones.push(m); const cov = minimalCover(4, ones, []); for (let m = 0; m < 16; m++) assert.equal(evalCover(cov, m, 4), ones.includes(m)); } }
console.log('extra logic OK');
