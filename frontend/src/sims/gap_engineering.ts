/* Engineering / materials gap-fillers: truss method of joints, fluid statics + Bernoulli, finite-element beam, dislocations. */
import { defineSim, UG_ENG, PG_ALL } from './types';
import type { EducationLevel } from './types';
import { C, TAU, clamp, fmt, line, plot, polyline, text, circle, arrow, panel, bars } from './draw';
import type { Ctx, Rect } from './draw';
import { meta } from './univ_util';

const bg = (c: Ctx, w: number, h: number) => { c.fillStyle = C.bg; c.fillRect(0, 0, w, h); };
const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w: Math.max(30, w), h: Math.max(30, h) });
const clip = (c: Ctx, r: Rect) => { c.beginPath(); c.rect(r.x + 34, r.y + 20, Math.max(1, r.w - 42), Math.max(1, r.h - 46)); c.clip(); };
const LV: EducationLevel[] = [...UG_ENG, 'B.Sc', ...PG_ALL];

/** Dense Gaussian elimination with partial pivoting. Solves A x = b (A is n×n, row-major arrays). Returns null if singular. */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let k = 0; k < n; k++) {
    let piv = k; for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[piv][k])) piv = i;
    if (Math.abs(M[piv][k]) < 1e-12) return null;
    [M[k], M[piv]] = [M[piv], M[k]];
    for (let i = k + 1; i < n; i++) { const f = M[i][k] / M[k][k]; if (f !== 0) for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j]; }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
  return x;
}

/* ================================================================== */
/*  1. Truss analysis by the method of joints                          */
/* ================================================================== */
export interface TrussGeom { nodes: [number, number][]; members: [number, number][]; }
/** Warren truss: bottom A(0,0) C(L/2,0) E(L,0); top B(L/4,h) D(3L/4,h). */
export const warren = (L: number, h: number): TrussGeom => ({
  nodes: [[0, 0], [L / 4, h], [L / 2, 0], [(3 * L) / 4, h], [L, 0]],
  members: [[0, 1], [1, 3], [3, 4], [0, 2], [2, 4], [1, 2], [2, 3]],
});
/** Method of joints: unknowns = member forces (+ tension) and reactions Ax, Ay (pin at node 0), Ey (roller at node 4). loads[i] = [Fx, Fy] applied at node i. */
export function solveTruss(g: TrussGeom, loads: [number, number][]) {
  const nm = g.members.length, nn = g.nodes.length, n = nm + 3, A = Array.from({ length: 2 * nn }, () => new Array<number>(n).fill(0)), b = new Array<number>(2 * nn).fill(0);
  g.members.forEach(([i, j], k) => {
    const dx = g.nodes[j][0] - g.nodes[i][0], dy = g.nodes[j][1] - g.nodes[i][1], len = Math.hypot(dx, dy), cx = dx / len, cy = dy / len;
    // tension pulls node i toward j and node j toward i
    A[2 * i][k] += cx; A[2 * i + 1][k] += cy; A[2 * j][k] -= cx; A[2 * j + 1][k] -= cy;
  });
  A[0][nm] = 1; A[1][nm + 1] = 1; A[2 * 4 + 1][nm + 2] = 1; // reactions
  for (let i = 0; i < nn; i++) { b[2 * i] = -loads[i][0]; b[2 * i + 1] = -loads[i][1]; }
  const x = solveLinear(A, b);
  if (!x) return null;
  return { forces: x.slice(0, nm), Ax: x[nm], Ay: x[nm + 1], Ey: x[nm + 2] };
}
interface TrS { t: number }
export const trussMethodOfJoints = defineSim<TrS>({
  id: 'truss_method_of_joints', title: 'Truss Analysis by the Method of Joints (Warren Bridge Truss)',
  ...meta('Engineering', 'Intermediate', 'Structural Mechanics', 'Truss analysis / method of joints', 'Statically determinate truss, member forces, tension and compression, reactions', LV),
  covers: ['Truss analysis', 'Method of joints', 'Member forces', 'Tension and compression', 'Support reactions', 'Static determinacy'],
  tags: ['truss', 'method of joints', 'statics', 'bridge', 'warren truss', 'structural analysis', 'civil engineering', 'mechanical', 'GATE'],
  learningObjectives: ['Solve a statically determinate truss by joint equilibrium (ΣFx = ΣFy = 0).', 'Identify tension (red) and compression (blue) members and the critical member.', 'Check global equilibrium: reactions equal applied loads.'],
  assumptions: ['Pin-jointed, weightless members carrying axial force only; small deformations; loads applied at joints.', 'Support: pin at the left joint, roller at the right joint (m + r = 2j).'],
  blurb: 'A Warren bridge truss with three joint loads. Member forces come from a real linear solve of all 10 joint equilibrium equations; the load ramps so tension and compression visibly evolve.',
  hint: 'Increase the load at C and watch the bottom chord go into tension and the top chord into compression. Zero-force members are drawn thin.',
  params: [
    { kind: 'number', id: 'L', label: 'Span L', min: 4, max: 20, step: 0.5, value: 12, unit: 'm', digits: 1 },
    { kind: 'number', id: 'h', label: 'Truss height h', min: 1, max: 8, step: 0.25, value: 3, unit: 'm', digits: 2 },
    { kind: 'number', id: 'PB', label: 'Downward load at B', min: 0, max: 100, step: 1, value: 20, unit: 'kN', digits: 0 },
    { kind: 'number', id: 'PC', label: 'Downward load at C', min: 0, max: 100, step: 1, value: 40, unit: 'kN', digits: 0 },
    { kind: 'number', id: 'PD', label: 'Downward load at D', min: 0, max: 100, step: 1, value: 20, unit: 'kN', digits: 0 },
    { kind: 'number', id: 'HB', label: 'Horizontal load at B (→)', min: -50, max: 50, step: 1, value: 0, unit: 'kN', digits: 0 },
    { kind: 'toggle', id: 'ramp', label: 'Ramp loads up and down', value: true },
  ],
  actions: [{ id: 'restart', label: 'Restart load ramp' }],
  dt: 1 / 60, previewSeconds: 1.5,
  init() { return { t: 0 }; },
  action(s) { s.t = 0; },
  step(s, v, dt) { s.t += dt; void v; },
  draw(c, s, v, w, h) {
    bg(c, w, h); const f = v.ramp ? 0.5 - 0.5 * Math.cos(s.t * 0.9) : 1, g = warren(v.L as number, v.h as number);
    const loads: [number, number][] = [[(v.HB as number) * f, -(v.PB as number) * f], [0, 0], [0, 0], [0, 0], [0, 0]]; // set below with correct indices
    // node order: 0 A, 1 B(top-left), 2 C(bottom mid), 3 D(top-right), 4 E
    const Ld: [number, number][] = [[0, 0], [loads[0][0], loads[0][1]], [0, -(v.PC as number) * f], [0, -(v.PD as number) * f], [0, 0]];
    const sol = solveTruss(g, Ld); const A = R(8, 8, w - 16, h * 0.64), B = R(8, h * 0.64 + 14, w - 16, h * 0.36 - 22); panel(c, A);
    const sc = Math.min((A.w - 100) / (v.L as number), (A.h - 90) / Math.max(v.h as number, 1)), ox = A.x + 50, oy = A.y + A.h - 40, P = (n: number): [number, number] => [ox + g.nodes[n][0] * sc, oy - g.nodes[n][1] * sc];
    const maxF = sol ? Math.max(1e-6, ...sol.forces.map(Math.abs)) : 1;
    g.members.forEach(([i, j], k) => {
      const F = sol ? sol.forces[k] : 0, [x1, y1] = P(i), [x2, y2] = P(j), a = Math.abs(F) / maxF, col = Math.abs(F) < 1e-6 ? C.dim : F > 0 ? C.red : C.blue;
      line(c, x1, y1, x2, y2, col, 2 + 6 * a); text(c, `${fmt(F, 1)}`, (x1 + x2) / 2, (y1 + y2) / 2 - 6, C.white, 10, 'center', 'alphabetic', true);
    });
    g.nodes.forEach((_, i) => { const [x, y] = P(i); circle(c, x, y, 5, C.white, C.bg, 1.5); text(c, 'ABCDE'[i === 1 ? 1 : i === 2 ? 2 : i === 3 ? 3 : i === 4 ? 4 : 0], x, y + (g.nodes[i][1] > 0 ? -12 : 20), C.amber, 11, 'center', 'alphabetic', true); });
    // supports
    const [ax, ay] = P(0), [ex, ey] = P(4); c.fillStyle = C.green; c.beginPath(); c.moveTo(ax, ay + 5); c.lineTo(ax - 10, ay + 20); c.lineTo(ax + 10, ay + 20); c.fill(); circle(c, ex, ey + 12, 6, undefined, C.green, 2); line(c, ex - 12, ey + 20, ex + 12, ey + 20, C.green, 2);
    // loads
    ([[1, Ld[1][1]], [2, Ld[2][1]], [3, Ld[3][1]]] as [number, number][]).forEach(([n, fy]) => { const [x, y] = P(n); if (Math.abs(fy) > 0.01) { arrow(c, x, y - 46 - Math.min(30, -fy * 0.3), x, y - 8, C.amber, 2.5, 8); text(c, `${fmt(-fy, 0)} kN`, x + 8, y - 36, C.amber, 10); } });
    if (Math.abs(Ld[1][0]) > 0.01) { const [x, y] = P(1); arrow(c, x - Math.sign(Ld[1][0]) * 44, y - 14, x - Math.sign(Ld[1][0]) * 6, y - 14, C.amber, 2.5, 8); }
    text(c, 'red = tension (T)   blue = compression (C)   grey = zero-force', A.x + 10, A.y + 16, C.dim, 10);
    // bars of member forces
    const names = g.members.map(([i, j]) => 'ABCDE'[i] + 'ABCDE'[j]); void names;
    bars(c, B, g.members.map(([i, j], k) => ({ label: 'ABCDE'[i] + 'ABCDE'[j], value: Math.abs(sol ? sol.forces[k] : 0), color: sol && sol.forces[k] > 1e-6 ? C.red : sol && sol.forces[k] < -1e-6 ? C.blue : C.dim })), maxF * 1.1, 'Member axial force magnitude (kN)');
  },
  readouts(s, v) {
    const f = v.ramp ? 0.5 - 0.5 * Math.cos(s.t * 0.9) : 1, g = warren(v.L as number, v.h as number), Ld: [number, number][] = [[0, 0], [(v.HB as number) * f, -(v.PB as number) * f], [0, -(v.PC as number) * f], [0, -(v.PD as number) * f], [0, 0]];
    const sol = solveTruss(g, Ld); if (!sol) return [{ label: 'Solution', value: 'singular (unstable geometry)' }];
    const kmax = sol.forces.reduce((m, x, i) => (Math.abs(x) > Math.abs(sol.forces[m]) ? i : m), 0), tot = -Ld.reduce((a, l) => a + l[1], 0);
    return [
      { label: 'Load factor', value: f, digits: 2 }, { label: 'Total vertical load', value: tot, unit: 'kN', digits: 2 }, { label: 'Reaction Ay at A', value: sol.Ay, unit: 'kN', digits: 2 }, { label: 'Reaction Ey at E', value: sol.Ey, unit: 'kN', digits: 2 }, { label: 'Reaction Ax at A', value: sol.Ax, unit: 'kN', digits: 2 },
      { label: 'Vertical equilibrium ΣFy', value: sol.Ay + sol.Ey - tot, unit: 'kN', digits: 6 },
      { label: 'Critical member', value: `${'ABCDE'[g.members[kmax][0]]}${'ABCDE'[g.members[kmax][1]]} = ${fmt(sol.forces[kmax], 2)} kN (${sol.forces[kmax] > 0 ? 'T' : 'C'})` },
      { label: 'Members + reactions vs 2×joints', value: `${g.members.length} + 3 = ${2 * g.nodes.length} (determinate)` },
    ];
  },
  equations() { return ['\\sum F_x=0,\\ \\sum F_y=0\\ \\text{at every joint}', 'm+r=2j\\ \\Rightarrow\\ 7+3=10\\ \\text{(statically determinate)}', 'F_{AB}\\cos\\theta + F_{AC} + A_x = 0,\\quad F_{AB}\\sin\\theta + A_y = 0']; },
});

/* ================================================================== */
/*  2. Fluid statics and Bernoulli (Venturi)                           */
/* ================================================================== */
export const FLUIDS: Record<string, { name: string; rho: number }> = { water: { name: 'Water', rho: 1000 }, oil: { name: 'Oil', rho: 850 }, brine: { name: 'Brine', rho: 1200 }, hg: { name: 'Mercury', rho: 13546 } };
export const G0 = 9.80665;
/** Venturi: continuity v2 = v1 (A1/A2) and Bernoulli p1 − p2 = ½ρ(v2² − v1²). Areas from diameters in metres. */
export function venturi(d1: number, d2: number, Q: number, rho: number) {
  const A1 = (Math.PI * d1 * d1) / 4, A2 = (Math.PI * d2 * d2) / 4, v1 = Q / A1, v2 = Q / A2, dp = 0.5 * rho * (v2 * v2 - v1 * v1);
  return { A1, A2, v1, v2, dp };
}
export const hydrostatic = (p0: number, rho: number, depth: number) => p0 + rho * G0 * depth;
interface FlS { t: number; parts: { u: number; y: number }[] }
export const fluidStaticsBernoulli = defineSim<FlS>({
  id: 'fluid_statics_bernoulli', title: 'Fluid Statics and Bernoulli: Pressure with Depth and the Venturi Meter',
  ...meta('Engineering', 'Intermediate', 'Fluid Mechanics', 'Fluid statics & Bernoulli', 'Hydrostatic pressure, continuity, Bernoulli equation, Venturi flow measurement', [...LV, 'Class 11', 'Class 12']),
  covers: ['Fluid statics', 'Hydrostatic pressure', 'Pascal’s law', 'Bernoulli equation', 'Continuity equation', 'Venturi meter', 'Manometer'],
  tags: ['bernoulli', 'venturi', 'pressure depth', 'continuity', 'fluid mechanics', 'manometer', 'piezometer', 'JEE', 'NEET', 'GATE civil mechanical'],
  learningObjectives: ['Compute p = p0 + ρgh and read pressure from manometer heights.', 'Apply continuity A1v1 = A2v2 and Bernoulli between the inlet and the throat.', 'Predict the piezometer height difference and use it to measure flow rate.'],
  assumptions: ['Steady, incompressible, inviscid, irrotational flow along a streamline (no friction losses, so recovery after the throat is ideal).', 'Horizontal tube so the elevation term cancels.'],
  blurb: 'Water flows through a Venturi tube: it speeds up in the throat and the pressure drops, shown by two piezometer columns, a live pressure profile and a depth gauge diving through a tank.',
  hint: 'Narrow the throat and the throat piezometer falls. Switch fluids to see the density effect on pressure (not on the Δh of a piezometer, which scales with v²/2g).',
  params: [
    { kind: 'number', id: 'Q', label: 'Flow rate Q', min: 0.5, max: 20, step: 0.1, value: 6, unit: 'L/s', digits: 1 },
    { kind: 'number', id: 'D1', label: 'Inlet diameter D₁', min: 40, max: 120, step: 1, value: 80, unit: 'mm', digits: 0 },
    { kind: 'number', id: 'D2', label: 'Throat diameter D₂', min: 15, max: 100, step: 1, value: 40, unit: 'mm', digits: 0 },
    { kind: 'select', id: 'fluid', label: 'Fluid', value: 'water', options: Object.entries(FLUIDS).map(([k, f]) => ({ value: k, label: f.name })) },
    { kind: 'number', id: 'p0', label: 'Inlet gauge pressure p₁', min: 5, max: 200, step: 1, value: 60, unit: 'kPa', digits: 0 },
    { kind: 'number', id: 'depth', label: 'Diver depth in tank', min: 0, max: 20, step: 0.1, value: 6, unit: 'm', digits: 1 },
  ],
  actions: [{ id: 'restart', label: 'Re-seed tracer particles' }],
  dt: 1 / 60, previewSeconds: 2,
  init() { return { t: 0, parts: Array.from({ length: 36 }, (_, i) => ({ u: i / 36, y: ((i * 7919) % 100) / 100 })) }; },
  action(s) { s.t = 0; s.parts.forEach((p, i) => { p.u = i / 36; }); },
  step(s, v, dt) { s.t += dt; const d1 = (v.D1 as number) / 1000, Q = (v.Q as number) / 1000, v1 = Q / ((Math.PI * d1 * d1) / 4); for (const p of s.parts) { p.u = (p.u + dt * Math.min(v1, 8) * 0.12) % 1; } },
  draw(c, s, v, w, h) {
    bg(c, w, h); const f = FLUIDS[v.fluid as string], d1 = (v.D1 as number) / 1000, d2 = Math.min((v.D2 as number) / 1000, d1 * 0.98), Q = (v.Q as number) / 1000, V = venturi(d1, d2, Q, f.rho), p1 = (v.p0 as number) * 1000;
    const A = R(8, 8, w * 0.68 - 12, h * 0.55), B = R(8, h * 0.55 + 14, w * 0.68 - 12, h * 0.45 - 22), T = R(A.x + A.w + 8, 8, w - A.w - 24, h - 16); panel(c, A);
    const x0 = A.x + 30, x1 = A.x + A.w - 20, cy = A.y + A.h * 0.62, rMax = Math.min(A.h * 0.2, 40), r1 = rMax, r2 = rMax * (d2 / d1);
    const rad = (u: number) => u < 0.25 ? r1 : u < 0.4 ? r1 + (r2 - r1) * ((u - 0.25) / 0.15) : u < 0.6 ? r2 : u < 0.85 ? r2 + (r1 - r2) * ((u - 0.6) / 0.25) : r1;
    const pAt = (u: number) => { const d = 2 * rad(u) / (2 * r1) * d1, Av = (Math.PI * d * d) / 4, vv = Q / Av; return p1 - 0.5 * f.rho * (vv * vv - V.v1 * V.v1); };
    const poly: [number, number][] = []; for (let i = 0; i <= 80; i++) { const u = i / 80; poly.push([x0 + u * (x1 - x0), cy - rad(u)]); } for (let i = 80; i >= 0; i--) { const u = i / 80; poly.push([x0 + u * (x1 - x0), cy + rad(u)]); }
    c.beginPath(); poly.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fillStyle = 'rgba(56,189,248,0.22)'; c.fill(); c.strokeStyle = C.axis; c.lineWidth = 2; c.stroke();
    for (const p of s.parts) { const u = p.u, r = rad(u); circle(c, x0 + u * (x1 - x0), cy + (p.y - 0.5) * 1.7 * r, 2.2, C.cyan); }
    // piezometers at u = 0.1 and 0.5
    const hcol = (u: number) => clamp(pAt(u) / (f.rho * G0), 0, 100); const sc = (A.h * 0.45) / Math.max(hcol(0.1), 0.1);
    for (const u of [0.1, 0.5]) { const x = x0 + u * (x1 - x0), hh = hcol(u) * sc; c.fillStyle = 'rgba(56,189,248,0.7)'; c.fillRect(x - 4, cy - rad(u) - hh, 8, hh); c.strokeStyle = C.axis; c.strokeRect(x - 4, cy - rad(u) - A.h * 0.5, 8, A.h * 0.5); text(c, `${fmt(hcol(u), 2)} m`, x + 10, cy - rad(u) - hh + 4, C.white, 10); }
    text(c, 'p₁, v₁', x0 + 0.1 * (x1 - x0) - 18, cy + r1 + 14, C.amber, 10); text(c, 'p₂, v₂ (throat)', x0 + 0.5 * (x1 - x0) - 34, cy + r1 + 14, C.amber, 10);
    arrow(c, x0 - 22, cy, x0 + 2, cy, C.green, 3, 9); text(c, `Venturi: v₁ = ${fmt(V.v1, 2)} m/s → v₂ = ${fmt(V.v2, 2)} m/s, Δp = ${fmt(V.dp / 1000, 2)} kPa`, A.x + 10, A.y + 16, C.text, 11, 'left', 'alphabetic', true);
    // pressure profile
    const pm = plot(c, B, [0, 1], [Math.min(0, (p1 - V.dp) / 1000 * 1.2), (p1 / 1000) * 1.2], { title: 'Gauge pressure along the tube', xlabel: 'position', ylabel: 'p (kPa)', grid: true });
    c.save(); clip(c, B); polyline(c, Array.from({ length: 101 }, (_, i) => [pm.X(i / 100), pm.Y(pAt(i / 100) / 1000)] as [number, number]), C.amber, 2.4); c.restore();
    // tank with diver
    panel(c, T); const tx = T.x + T.w * 0.2, tw = T.w * 0.6, ty = T.y + 30, th = T.h - 60; c.fillStyle = 'rgba(56,189,248,0.25)'; c.fillRect(tx, ty, tw, th); c.strokeStyle = C.axis; c.strokeRect(tx, ty, tw, th);
    const dd = (v.depth as number), dy = ty + (clamp(dd + 0.4 * Math.sin(s.t * 2), 0, 20) / 20) * th; circle(c, tx + tw / 2, dy, 9, C.amber, C.white, 1.5);
    const pd = hydrostatic(101325, f.rho, dd); text(c, `Tank of ${f.name}`, T.x + 8, T.y + 16, C.text, 11, 'left', 'alphabetic', true); text(c, `p = p₀ + ρgh`, T.x + 8, T.y + T.h - 22, C.dim, 10); text(c, `${fmt(pd / 1000, 1)} kPa abs at ${fmt(dd, 1)} m`, T.x + 8, T.y + T.h - 8, C.cyan, 10);
  },
  readouts(s, v) {
    const f = FLUIDS[v.fluid as string], d1 = (v.D1 as number) / 1000, d2 = Math.min((v.D2 as number) / 1000, d1 * 0.98), V = venturi(d1, d2, (v.Q as number) / 1000, f.rho), p1 = (v.p0 as number) * 1000;
    return [{ label: 'Inlet velocity v₁', value: V.v1, unit: 'm/s', digits: 3 }, { label: 'Throat velocity v₂ = v₁A₁/A₂', value: V.v2, unit: 'm/s', digits: 3 }, { label: 'Pressure drop p₁ − p₂', value: V.dp / 1000, unit: 'kPa', digits: 3 }, { label: 'Throat pressure p₂', value: (p1 - V.dp) / 1000, unit: 'kPa', digits: 2 }, { label: 'Piezometer difference Δh', value: V.dp / (f.rho * G0), unit: 'm', digits: 3 }, { label: 'Cavitation risk (p₂ abs < 2.3 kPa)', value: (p1 - V.dp + 101325) < 2339 ? 'YES — water would boil' : 'no' }, { label: 'Absolute pressure at diver', value: hydrostatic(101325, f.rho, v.depth as number) / 1000, unit: 'kPa', digits: 2 }, { label: 'Reynolds number at throat', value: (f.rho * V.v2 * d2) / 1e-3, digits: 0 }];
  },
  equations(s, v) { const f = FLUIDS[v.fluid as string], d1 = (v.D1 as number) / 1000, d2 = Math.min((v.D2 as number) / 1000, d1 * 0.98), V = venturi(d1, d2, (v.Q as number) / 1000, f.rho); return ['A_1v_1=A_2v_2=Q', `p_1+\\tfrac12\\rho v_1^2=p_2+\\tfrac12\\rho v_2^2\\ \\Rightarrow\\ p_1-p_2=${fmt(V.dp, 0)}\\ \\mathrm{Pa}`, 'p=p_0+\\rho g h\\qquad Q=A_2\\sqrt{\\dfrac{2(p_1-p_2)/\\rho}{1-(A_2/A_1)^2}}']; },
});

/* ================================================================== */
/*  3. Finite-element Euler–Bernoulli beam                             */
/* ================================================================== */
export type BeamBC = 'cantilever' | 'simply' | 'fixed';
export type BeamLoad = 'point' | 'udl';
/** Element stiffness for a 2-node Hermite beam element (dof: w1, θ1, w2, θ2). */
export const beamKe = (EI: number, l: number): number[][] => {
  const k = EI / (l * l * l);
  return [[12 * k, 6 * l * k, -12 * k, 6 * l * k], [6 * l * k, 4 * l * l * k, -6 * l * k, 2 * l * l * k], [-12 * k, -6 * l * k, 12 * k, -6 * l * k], [6 * l * k, 2 * l * l * k, -6 * l * k, 4 * l * l * k]];
};
export interface BeamSol { x: number[]; w: number[]; th: number[]; l: number; EI: number; n: number; L: number; load: BeamLoad; P: number; q: number; bc: BeamBC }
export function solveBeam(n: number, L: number, EI: number, bc: BeamBC, load: BeamLoad, P: number, q: number): BeamSol | null {
  const nd = n + 1, N = 2 * nd, l = L / n, K = Array.from({ length: N }, () => new Array<number>(N).fill(0)), F = new Array<number>(N).fill(0), ke = beamKe(EI, l);
  for (let e = 0; e < n; e++) for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) K[2 * e + a][2 * e + b] += ke[a][b];
  if (load === 'udl') for (let e = 0; e < n; e++) { const fq = [q * l / 2, q * l * l / 12, q * l / 2, -q * l * l / 12]; for (let a = 0; a < 4; a++) F[2 * e + a] += fq[a]; }
  else { const node = bc === 'cantilever' ? n : Math.floor(n / 2); F[2 * node] += P; }
  const fixed = new Set<number>(); if (bc === 'cantilever') { fixed.add(0); fixed.add(1); } else if (bc === 'simply') { fixed.add(0); fixed.add(2 * n); } else { fixed.add(0); fixed.add(1); fixed.add(2 * n); fixed.add(2 * n + 1); }
  const free = Array.from({ length: N }, (_, i) => i).filter(i => !fixed.has(i)), Kf = free.map(i => free.map(j => K[i][j])), Ff = free.map(i => F[i]), u = solveLinear(Kf, Ff);
  if (!u) return null; const d = new Array<number>(N).fill(0); free.forEach((i, k) => { d[i] = u[k]; });
  return { x: Array.from({ length: nd }, (_, i) => i * l), w: Array.from({ length: nd }, (_, i) => d[2 * i]), th: Array.from({ length: nd }, (_, i) => d[2 * i + 1]), l, EI, n, L, load, P, q, bc };
}
/** Hermite interpolation of the FE deflection and its second derivative (curvature) at position x. */
export function beamAt(s: BeamSol, x: number): { w: number; kappa: number } {
  const e = clamp(Math.floor(x / s.l), 0, s.n - 1), xi = (x - e * s.l) / s.l, l = s.l, w1 = s.w[e], t1 = s.th[e], w2 = s.w[e + 1], t2 = s.th[e + 1];
  const N1 = 1 - 3 * xi * xi + 2 * xi ** 3, N2 = l * (xi - 2 * xi * xi + xi ** 3), N3 = 3 * xi * xi - 2 * xi ** 3, N4 = l * (-xi * xi + xi ** 3);
  const d1 = (-6 + 12 * xi) / (l * l), d2 = (-4 + 6 * xi) / l, d3 = (6 - 12 * xi) / (l * l), d4 = (-2 + 6 * xi) / l;
  return { w: N1 * w1 + N2 * t1 + N3 * w2 + N4 * t2, kappa: d1 * w1 + d2 * t1 + d3 * w2 + d4 * t2 };
}
/** Closed-form maximum deflection magnitudes. */
export function analyticMax(bc: BeamBC, load: BeamLoad, L: number, EI: number, P: number, q: number): number {
  const L3 = L ** 3, L4 = L ** 4;
  if (bc === 'cantilever') return load === 'point' ? (P * L3) / (3 * EI) : (q * L4) / (8 * EI);
  if (bc === 'simply') return load === 'point' ? (P * L3) / (48 * EI) : (5 * q * L4) / (384 * EI);
  return load === 'point' ? (P * L3) / (192 * EI) : (q * L4) / (384 * EI);
}
interface FeS { t: number; nAnim: number }
export const femBeamTruss = defineSim<FeS>({
  id: 'fem_beam_truss', title: 'Finite-Element Beam Analysis: Stiffness Assembly, Mesh Refinement and Convergence',
  ...meta('Engineering', 'Advanced', 'Finite Element Method', 'Finite-element beam / truss analysis', 'Euler–Bernoulli beam elements, global stiffness assembly, boundary conditions, convergence', [...LV]),
  covers: ['Finite element method', 'Beam element', 'Stiffness matrix', 'Mesh refinement', 'Boundary conditions', 'Euler–Bernoulli beam theory', 'Convergence'],
  tags: ['FEM', 'FEA', 'finite element', 'beam', 'stiffness matrix', 'Hermite', 'cantilever', 'structural', 'M.Tech', 'CAE'],
  learningObjectives: ['Assemble element stiffness matrices into the global K and apply boundary conditions.', 'See nodal deflection match theory while interior curvature converges with mesh refinement.', 'Compare cantilever, simply supported and fixed–fixed beams under point and distributed loads.'],
  assumptions: ['Euler–Bernoulli (no shear deformation), prismatic linear-elastic beam, small deflections, cubic Hermite shape functions, consistent nodal loads.'],
  blurb: 'A real 2-DOF-per-node beam FE solver. The mesh refines automatically from 2 to 32 elements so you can watch the FE deflection and bending moment converge to the analytic result.',
  hint: 'For a point load at a node, FE nodal values are exact; for a UDL the interior moment needs refinement. Compare the max-deflection error against the closed form.',
  params: [
    { kind: 'select', id: 'bc', label: 'Supports', value: 'cantilever', options: [{ value: 'cantilever', label: 'Cantilever (fixed–free)' }, { value: 'simply', label: 'Simply supported' }, { value: 'fixed', label: 'Fixed–fixed' }] },
    { kind: 'select', id: 'load', label: 'Load', value: 'udl', options: [{ value: 'udl', label: 'Uniformly distributed load' }, { value: 'point', label: 'Point load (tip / midspan)' }] },
    { kind: 'number', id: 'n', label: 'Elements n (when not auto-refining)', min: 2, max: 32, step: 2, value: 4, digits: 0 },
    { kind: 'number', id: 'L', label: 'Length L', min: 1, max: 10, step: 0.5, value: 4, unit: 'm', digits: 1 },
    { kind: 'number', id: 'EI', label: 'Flexural rigidity EI', min: 1, max: 100, step: 1, value: 20, unit: 'MN·m²', digits: 0 },
    { kind: 'number', id: 'P', label: 'Load magnitude (P kN or q kN/m)', min: 1, max: 200, step: 1, value: 50, digits: 0 },
    { kind: 'toggle', id: 'auto', label: 'Auto-refine the mesh (2 → 32)', value: true },
  ],
  actions: [{ id: 'restart', label: 'Restart refinement' }],
  dt: 1 / 30, previewSeconds: 3,
  init() { return { t: 0, nAnim: 2 }; },
  action(s) { s.t = 0; s.nAnim = 2; },
  step(s, v, dt) { s.t += dt; if (v.auto) { const k = Math.floor((s.t * 0.9) % 5); s.nAnim = [2, 4, 8, 16, 32][k]; } },
  draw(c, s, v, w, h) {
    bg(c, w, h); const n = v.auto ? s.nAnim : (v.n as number), L = v.L as number, EI = (v.EI as number) * 1e6, bc = v.bc as BeamBC, load = v.load as BeamLoad, P = (v.P as number) * 1e3;
    const fe = solveBeam(n, L, EI, bc, load, P, P), ref = solveBeam(128, L, EI, bc, load, P, P); const A = R(8, 8, w - 16, h * 0.4), B = R(8, h * 0.4 + 14, w / 2 - 12, h * 0.6 - 22), G = R(w / 2 + 4, h * 0.4 + 14, w / 2 - 12, h * 0.6 - 22);
    panel(c, A); if (!fe || !ref) { text(c, 'singular system', A.x + 10, A.y + 20, C.red, 12); return; }
    const x0 = A.x + 40, x1 = A.x + A.w - 40, cy = A.y + A.h * 0.45, mw = analyticMax(bc, load, L, EI, P, P), amp = (A.h * 0.28) / Math.max(mw, 1e-12);
    const X = (x: number) => x0 + (x / L) * (x1 - x0);
    line(c, x0, cy, x1, cy, 'rgba(148,163,184,0.4)', 1, [4, 4]);
    polyline(c, Array.from({ length: 201 }, (_, i) => { const x = (i / 200) * L; return [X(x), cy + beamAt(ref, x).w * amp] as [number, number]; }), 'rgba(52,211,153,0.9)', 2.5, [6, 4]);
    polyline(c, Array.from({ length: 201 }, (_, i) => { const x = (i / 200) * L; return [X(x), cy + beamAt(fe, x).w * amp] as [number, number]; }), C.amber, 3);
    fe.x.forEach((x, i) => circle(c, X(x), cy + fe.w[i] * amp, 3.5, C.white, C.bg, 1)); fe.x.forEach(x => line(c, X(x), cy - 6, X(x), cy + 6, 'rgba(148,163,184,0.5)', 1));
    // supports and loads
    c.fillStyle = C.green; if (bc !== 'simply') c.fillRect(x0 - 8, cy - 18, 8, 36); else { c.beginPath(); c.moveTo(x0, cy + 4); c.lineTo(x0 - 9, cy + 20); c.lineTo(x0 + 9, cy + 20); c.fill(); }
    if (bc === 'fixed') c.fillRect(x1, cy - 18, 8, 36); else if (bc === 'simply') circle(c, x1, cy + 12, 6, undefined, C.green, 2);
    if (load === 'udl') for (let i = 0; i <= 12; i++) arrow(c, x0 + (i / 12) * (x1 - x0), cy - 52, x0 + (i / 12) * (x1 - x0), cy - 14, C.red, 1.5, 6); else { const px = bc === 'cantilever' ? x1 : (x0 + x1) / 2; arrow(c, px, cy - 62, px, cy - 12, C.red, 3, 9); }
    text(c, `${n} elements   FE (amber) vs exact (green dashed)`, A.x + 10, A.y + 16, C.text, 11, 'left', 'alphabetic', true);
    const mm = plot(c, B, [0, L], [-1.2, 1.2], { title: 'Bending moment M(x)/max|M|  (EI·w″)', xlabel: 'x (m)', grid: true, zeroAxis: true });
    const Mx = Array.from({ length: 201 }, (_, i) => EI * beamAt(ref, (i / 200) * L).kappa), Mfe = Array.from({ length: 201 }, (_, i) => EI * beamAt(fe, (i / 200) * L).kappa), Mmax = Math.max(1e-9, ...Mx.map(Math.abs));
    c.save(); clip(c, B); polyline(c, Mx.map((m, i) => [mm.X((i / 200) * L), mm.Y(-m / Mmax)] as [number, number]), 'rgba(52,211,153,0.9)', 2, [6, 4]); polyline(c, Mfe.map((m, i) => [mm.X((i / 200) * L), mm.Y(-m / Mmax)] as [number, number]), C.amber, 2.4); c.restore();
    const ns = [2, 4, 8, 16, 32], errs = ns.map(k => { const f = solveBeam(k, L, EI, bc, load, P, P)!; let e = 0, d = 0; for (let i = 0; i <= 40; i++) { const x = (i / 40) * L, a = EI * beamAt(f, x).kappa, b = EI * beamAt(ref, x).kappa; e += (a - b) ** 2; d += b * b; } return Math.sqrt(e / Math.max(d, 1e-30)); });
    const cm = plot(c, G, [0, 5], [-10, 0.5], { title: 'Moment error vs mesh (log₁₀ relative L2)', xlabel: 'n = 2,4,8,16,32', ylabel: 'log₁₀ err', grid: true });
    c.save(); clip(c, G); const pts = errs.map((e, i) => [cm.X(i + 0.5), cm.Y(clamp(Math.log10(e + 1e-12), -10, 0.5))] as [number, number]); polyline(c, pts, C.cyan, 2.4); pts.forEach(([x, y]) => circle(c, x, y, 3.5, C.cyan)); const ci = ns.indexOf(n); if (ci >= 0) circle(c, pts[ci][0], pts[ci][1], 7, undefined, C.amber, 2); c.restore();
  },
  readouts(s, v) {
    const n = v.auto ? s.nAnim : (v.n as number), L = v.L as number, EI = (v.EI as number) * 1e6, P = (v.P as number) * 1e3, fe = solveBeam(n, L, EI, v.bc as BeamBC, v.load as BeamLoad, P, P); if (!fe) return [{ label: 'Solution', value: 'singular' }];
    let wmax = 0; for (let i = 0; i <= 400; i++) wmax = Math.max(wmax, Math.abs(beamAt(fe, (i / 400) * L).w)); const ex = analyticMax(v.bc as BeamBC, v.load as BeamLoad, L, EI, P, P);
    return [{ label: 'Elements / DOF', value: `${n} / ${2 * (n + 1)}` }, { label: 'Max |deflection| (FE)', value: wmax * 1000, unit: 'mm', digits: 4 }, { label: 'Max |deflection| (closed form)', value: ex * 1000, unit: 'mm', digits: 4 }, { label: 'Relative error', value: (Math.abs(wmax - ex) / ex) * 100, unit: '%', digits: 4 }, { label: 'Element length', value: L / n, unit: 'm', digits: 3 }, { label: 'Free DOF solved', value: v.bc === 'fixed' ? 2 * (n + 1) - 4 : 2 * (n + 1) - 2 }];
  },
  equations(s, v) { void s; void v; return ['[K]\\{d\\}=\\{F\\},\\qquad K=\\sum_e \\dfrac{EI}{l^3}\\begin{bmatrix}12&6l&-12&6l\\\\6l&4l^2&-6l&2l^2\\\\-12&-6l&12&-6l\\\\6l&2l^2&-6l&4l^2\\end{bmatrix}', 'M(x)=EI\\,w\'\'(x),\\quad w_{\\max}^{\\text{cant,tip}}=\\dfrac{PL^3}{3EI},\\ \\dfrac{qL^4}{8EI}', 'N_2=l\\,(\\xi-2\\xi^2+\\xi^3)\\ \\ (\\text{Hermite shape function})']; },
});

/* ================================================================== */
/*  4. Dislocations and strengthening                                  */
/* ================================================================== */
export const METALS: Record<string, { name: string; G: number; b: number; s0: number; ky: number; nu: number }> = {
  cu: { name: 'Copper', G: 48e9, b: 0.256e-9, s0: 25e6, ky: 0.11e6, nu: 0.34 }, al: { name: 'Aluminium', G: 26e9, b: 0.286e-9, s0: 10e6, ky: 0.04e6, nu: 0.33 }, fe: { name: 'Iron (ferrite)', G: 82e9, b: 0.248e-9, s0: 70e6, ky: 0.55e6, nu: 0.29 },
};
export const TAYLOR_M = 3.06;
/** Hall–Petch grain-boundary strengthening. d in metres. */
export const hallPetch = (m: string, d: number) => METALS[m].ky / Math.sqrt(d);
/** Orowan bypass shear stress for obstacle spacing L (m): Δτ = Gb/L; converted to tensile via Taylor factor. */
export const orowan = (m: string, L: number) => TAYLOR_M * (METALS[m].G * METALS[m].b) / L;
/** Total yield strength as the linear sum of lattice friction, boundary and precipitate contributions. */
export const yieldStrength = (m: string, d: number, L: number | null) => METALS[m].s0 + hallPetch(m, d) + (L ? orowan(m, L) : 0);
interface DiS { t: number; x: number; tauNow: number; gamma: number; passes: number; bow: number }
export const dislocationsStrengthening = defineSim<DiS>({
  id: 'dislocations_strengthening', title: 'Dislocations and Strengthening: Edge-Dislocation Glide, Hall–Petch and Orowan',
  ...meta('Materials', 'Advanced', 'Mechanical Behaviour of Materials', 'Dislocations & strengthening', 'Edge dislocation glide, Peierls stress, grain-boundary and precipitation strengthening', [...LV]),
  covers: ['Dislocations', 'Edge dislocation', 'Slip', 'Hall–Petch relation', 'Orowan strengthening', 'Precipitation hardening', 'Yield strength', 'Burgers vector'],
  tags: ['dislocation', 'burgers vector', 'hall petch', 'orowan', 'strengthening mechanisms', 'precipitation hardening', 'materials science', 'yield stress', 'plastic deformation'],
  learningObjectives: ['Visualise an edge dislocation as an extra half-plane gliding under shear stress.', 'Quantify strengthening: Hall–Petch (grain size) and Orowan (precipitate spacing).', 'Predict how refining grains or adding obstacles raises yield strength.'],
  assumptions: ['2-D lattice displaced by the linear-elastic Volterra edge-dislocation field (core cut off), amplified for visibility.', 'Strengthening contributions are added linearly; Taylor factor 3.06 converts shear to tensile stress.'],
  blurb: 'An edge dislocation glides through a crystal under rising shear stress and is pinned by precipitates until the Orowan stress is exceeded. Compare lattice friction, Hall–Petch and Orowan contributions live.',
  hint: 'Reduce the grain size or the precipitate spacing to raise the stress needed for the dislocation to move. Hall–Petch: σ = σ0 + k_y d^−1/2; Orowan: Δτ = Gb/L.',
  params: [
    { kind: 'select', id: 'metal', label: 'Metal', value: 'cu', options: Object.entries(METALS).map(([k, m]) => ({ value: k, label: m.name })) },
    { kind: 'number', id: 'd', label: 'Grain size d', min: 0.2, max: 100, step: 0.1, value: 10, unit: 'µm', digits: 1 },
    { kind: 'number', id: 'L', label: 'Precipitate spacing L', min: 20, max: 400, step: 5, value: 100, unit: 'nm', digits: 0 },
    { kind: 'toggle', id: 'prec', label: 'Precipitates present', value: true },
    { kind: 'number', id: 'rate', label: 'Stress ramp rate', min: 0.1, max: 3, step: 0.1, value: 1, digits: 1 },
    { kind: 'number', id: 'amp', label: 'Displacement amplification', min: 1, max: 8, step: 0.5, value: 4, digits: 1 },
  ],
  actions: [{ id: 'restart', label: 'Re-insert dislocation' }],
  dt: 1 / 60, previewSeconds: 3,
  init() { return { t: 0, x: -4, tauNow: 0, gamma: 0, passes: 0, bow: 0 }; },
  action(s) { s.x = -4; s.tauNow = 0; s.gamma = 0; s.passes = 0; s.t = 0; s.bow = 0; },
  step(s, v, dt) {
    s.t += dt; const m = v.metal as string, tauPN = 0.5 * METALS[m].s0 / TAYLOR_M, tauOr = (v.prec ? METALS[m].G * METALS[m].b / ((v.L as number) * 1e-9) : 0) + tauPN, tauHP = hallPetch(m, (v.d as number) * 1e-6) / TAYLOR_M;
    const tauNeed = tauOr + tauHP * 0.3, tauMax = tauNeed * 1.25;
    s.tauNow = Math.min(tauMax, s.tauNow + dt * (v.rate as number) * tauMax * 0.25);
    // dislocation pinned at obstacle positions until applied stress exceeds the need
    const spacing = 3, nextPin = Math.floor((s.x + 0.001) / spacing + 1) * spacing;
    if (v.prec && s.tauNow < tauNeed && nextPin - s.x < 0.2) { s.bow = clamp((s.tauNow / tauNeed), 0, 1); } else { s.bow = 0; const vel = Math.max(0, (s.tauNow - tauPN) / (tauMax - tauPN + 1e-9)) * 3.2; s.x += vel * dt; s.gamma += vel * dt * 0.02; }
    if (s.x > 4) { s.x = -4; s.passes++; s.tauNow *= 0.4; }
  },
  draw(c, s, v, w, h) {
    bg(c, w, h); const m = v.metal as string, A = R(8, 8, w - 16, h * 0.58), B = R(8, h * 0.58 + 14, w * 0.5 - 12, h * 0.42 - 22), G = R(w * 0.5 + 4, h * 0.58 + 14, w * 0.5 - 12, h * 0.42 - 22); panel(c, A);
    const cols = 17, rows = 11, sp = Math.min((A.w - 40) / (cols - 1), (A.h - 50) / (rows - 1)), ox = A.x + A.w / 2, oy = A.y + A.h / 2 + 8, nu = METALS[m].nu, b = sp * 0.9, amp = (v.amp as number) / 4;
    const disp = (x: number, y: number): [number, number] => {
      const dx = x - s.x * sp * 0.9, r2 = dx * dx + y * y + (0.7 * sp) ** 2, th = Math.atan2(y, dx);
      const ux = (b / TAU) * (th + (dx * y) / (2 * (1 - nu) * r2)), uy = -(b / TAU) * (((1 - 2 * nu) / (4 * (1 - nu))) * Math.log(r2 / (sp * sp)) + (dx * dx - y * y) / (4 * (1 - nu) * r2));
      return [ux * amp, uy * amp];
    };
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = (i - (cols - 1) / 2) * sp, y = (j - (rows - 1) / 2) * sp, [ux, uy] = disp(x, y), px = ox + x + ux, py = oy + y + uy;
      if (i < cols - 1) { const [u2x, u2y] = disp(x + sp, y); line(c, px, py, ox + x + sp + u2x, oy + y + u2y, 'rgba(96,165,250,0.35)', 1); }
      if (j < rows - 1) { const [v2x, v2y] = disp(x, y + sp); line(c, px, py, ox + x + v2x, oy + y + sp + v2y, 'rgba(96,165,250,0.35)', 1); }
      circle(c, px, py, 3, Math.abs(x - s.x * sp * 0.9) < sp * 0.8 && y < 0 && y > -sp * 0.6 ? C.red : C.cyan);
    }
    const dxs = ox + s.x * sp * 0.9; text(c, '⊥', dxs, oy - 2, C.red, 22, 'center', 'middle', true);
    if (v.prec) for (let k = -1; k <= 1; k++) { const px = ox + (k * 3) * sp * 0.9 + 1.5 * sp * 0.9; for (const yy of [-3, -1, 1, 3]) circle(c, px, oy + yy * sp * 0.5, 5, C.amber, 'rgba(0,0,0,0.5)', 1); }
    // shear stress arrows
    const tf = s.tauNow, tauMax = 1; void tauMax; const aL = 22; arrow(c, A.x + 14, A.y + 26, A.x + 14 + aL, A.y + 26, C.green, 2.5, 8); arrow(c, A.x + A.w - 14, A.y + A.h - 14, A.x + A.w - 14 - aL, A.y + A.h - 14, C.green, 2.5, 8);
    const tauPN = 0.5 * METALS[m].s0 / TAYLOR_M, tauOr = (v.prec ? METALS[m].G * METALS[m].b / ((v.L as number) * 1e-9) : 0) + tauPN, need = tauOr + hallPetch(m, (v.d as number) * 1e-6) / TAYLOR_M * 0.3;
    text(c, s.bow > 0.01 ? 'dislocation PINNED at precipitates — stress still below Orowan' : s.tauNow >= need ? 'stress above critical: dislocation glides, crystal slips' : 'elastic loading', A.x + 10, A.y + 16, s.bow > 0.01 ? C.amber : C.green, 11, 'left', 'alphabetic', true);
    // bar chart of contributions
    const sig = [{ label: 'lattice σ₀', value: METALS[m].s0 / 1e6, color: C.cyan }, { label: 'Hall–Petch', value: hallPetch(m, (v.d as number) * 1e-6) / 1e6, color: C.green }, { label: 'Orowan', value: v.prec ? orowan(m, (v.L as number) * 1e-9) / 1e6 : 0, color: C.amber }, { label: 'total σy', value: yieldStrength(m, (v.d as number) * 1e-6, v.prec ? (v.L as number) * 1e-9 : null) / 1e6, color: C.pink }];
    bars(c, B, sig, Math.max(...sig.map(x => x.value)) * 1.1, 'Yield strength contributions (MPa)');
    // Hall–Petch curve
    const dm = plot(c, G, [0, 6], [0, Math.max(50, hallPetch(m, 0.2e-6) / 1e6 + METALS[m].s0 / 1e6) * 1.1], { title: 'Hall–Petch: σ vs d⁻¹ᐟ² (µm⁻¹ᐟ²)', xlabel: 'd^-1/2', ylabel: 'σ (MPa)', grid: true });
    c.save(); clip(c, G); polyline(c, [[dm.X(0), dm.Y(METALS[m].s0 / 1e6)], [dm.X(6), dm.Y((METALS[m].s0 + METALS[m].ky * 6 / Math.sqrt(1e-6)) / 1e6)]], C.amber, 2); const dx = 1 / Math.sqrt(v.d as number); circle(c, dm.X(dx), dm.Y((METALS[m].s0 + hallPetch(m, (v.d as number) * 1e-6)) / 1e6), 6, C.red, C.white, 1.5); c.restore(); void tf;
  },
  readouts(s, v) {
    const m = v.metal as string, d = (v.d as number) * 1e-6, L = (v.L as number) * 1e-9, sy = yieldStrength(m, d, v.prec ? L : null);
    return [{ label: 'Lattice friction σ₀', value: METALS[m].s0 / 1e6, unit: 'MPa', digits: 1 }, { label: 'Hall–Petch k_y/√d', value: hallPetch(m, d) / 1e6, unit: 'MPa', digits: 1 }, { label: 'Orowan Gb/L (× Taylor factor)', value: v.prec ? orowan(m, L) / 1e6 : 0, unit: 'MPa', digits: 1 }, { label: 'Predicted yield strength', value: sy / 1e6, unit: 'MPa', digits: 1 }, { label: 'Applied resolved shear stress', value: s.tauNow / 1e6, unit: 'MPa', digits: 1 }, { label: 'Dislocation passes (cumulative slip steps)', value: s.passes, digits: 0 }, { label: 'Shear strain from glide', value: s.gamma, digits: 4 }];
  },
  equations(s, v) { const m = v.metal as string, d = (v.d as number) * 1e-6; void s; return [`\\sigma_y=\\sigma_0+\\dfrac{k_y}{\\sqrt d}+M\\,\\dfrac{G b}{L}=${fmt(yieldStrength(m, d, v.prec ? (v.L as number) * 1e-9 : null) / 1e6, 1)}\\ \\mathrm{MPa}`, '\\Delta\\tau_{\\text{Orowan}}=\\dfrac{G b}{L},\\qquad \\gamma=\\rho_m\\,b\\,\\bar x', 'u_x=\\dfrac b{2\\pi}\\left[\\theta+\\dfrac{xy}{2(1-\\nu)(x^2+y^2)}\\right]\\ \\text{(Volterra edge dislocation)}']; },
});

