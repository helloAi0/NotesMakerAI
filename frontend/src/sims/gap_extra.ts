/* Gap-fillers: Ohm's-law circuits, SN1/SN2/E2 mechanisms, cardiac cycle, elliptic-curve cryptography, Karnaugh-map minimiser. */
import { defineSim, SCHOOL_8_10, SCHOOL_11_12, UG_ENG, UG_SCI, PG_ALL } from './types';
import type { EducationLevel } from './types';
import { C, TAU, clamp, fmt, line, plot, polyline, text, circle, arrow, panel } from './draw';
import type { Ctx, Rect } from './draw';
import { meta } from './univ_util';

const bg = (c: Ctx, w: number, h: number) => { c.fillStyle = C.bg; c.fillRect(0, 0, w, h); };
const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w: Math.max(30, w), h: Math.max(30, h) });
const clip = (c: Ctx, r: Rect) => { c.beginPath(); c.rect(r.x + 34, r.y + 20, Math.max(1, r.w - 42), Math.max(1, r.h - 46)); c.clip(); };

/* ================================================================== */
/*  1. Ohm's law and simple circuits                                   */
/* ================================================================== */
export type CircuitKind = 'series' | 'parallel' | 'mixed';
export interface CircuitSol { Rext: number; Rtot: number; I: number; Vt: number; i: [number, number, number]; v: [number, number, number]; p: [number, number, number]; Pbat: number; Ploss: number }
/** Solve the three resistor networks with an ideal source E and internal resistance r. */
export function solveCircuit(kind: CircuitKind, E: number, r: number, R1: number, R2: number, R3: number): CircuitSol {
  let Rext: number, i: [number, number, number], v: [number, number, number];
  if (kind === 'series') { Rext = R1 + R2 + R3; const I = E / (Rext + r); i = [I, I, I]; v = [I * R1, I * R2, I * R3]; }
  else if (kind === 'parallel') { Rext = 1 / (1 / R1 + 1 / R2 + 1 / R3); const I = E / (Rext + r), V = I * Rext; i = [V / R1, V / R2, V / R3]; v = [V, V, V]; }
  else { const Rp = (R2 * R3) / (R2 + R3); Rext = R1 + Rp; const I = E / (Rext + r), Vp = I * Rp; i = [I, Vp / R2, Vp / R3]; v = [I * R1, Vp, Vp]; }
  const I = kind === 'parallel' ? i[0] + i[1] + i[2] : i[0], p: [number, number, number] = [i[0] * v[0], i[1] * v[1], i[2] * v[2]];
  return { Rext, Rtot: Rext + r, I, Vt: E - I * r, i, v, p, Pbat: E * I, Ploss: I * I * r };
}
interface OhS { t: number; ph: number }
export const ohmsLawCircuits = defineSim<OhS>({
  id: 'ohms_law_circuits', title: 'Ohm’s Law and Simple Circuits: Series, Parallel and Combination Networks',
  ...meta('Physics', 'Beginner', 'Current Electricity', 'Ohm’s law & simple circuits', 'V = IR, series and parallel resistors, power, internal resistance', [...SCHOOL_8_10, ...SCHOOL_11_12, 'B.Sc']),
  covers: ['Ohm’s law', 'Series circuits', 'Parallel circuits', 'Kirchhoff’s laws', 'Electric power', 'Internal resistance', 'Equivalent resistance'],
  tags: ['ohm', 'V=IR', 'resistors', 'series parallel', 'kirchhoff', 'current electricity', 'CBSE class 10', 'class 12', 'voltage divider', 'electric power'],
  learningObjectives: ['Apply V = IR to every resistor and check KVL and KCL.', 'Compare series (same current) and parallel (same voltage) behaviour.', 'See how internal resistance reduces the terminal voltage and wastes power.'],
  assumptions: ['Ideal ohmic resistors (R independent of current or temperature); steady DC; ideal connecting wires.'],
  blurb: 'Build a series, parallel or mixed resistor network. Moving charges show the current in each branch; the meters show V, I and P for every resistor and confirm Kirchhoff’s laws.',
  hint: 'In series the same current flows everywhere and voltages add; in parallel the voltage is shared and currents add. Raise the internal resistance and watch the terminal voltage sag.',
  params: [
    { kind: 'select', id: 'kind', label: 'Network', value: 'mixed', options: [{ value: 'series', label: 'Series' }, { value: 'parallel', label: 'Parallel' }, { value: 'mixed', label: 'R₁ in series with (R₂ ∥ R₃)' }] },
    { kind: 'number', id: 'E', label: 'EMF E', min: 1, max: 24, step: 0.5, value: 12, unit: 'V', digits: 1 },
    { kind: 'number', id: 'r', label: 'Internal resistance r', min: 0, max: 5, step: 0.1, value: 0.5, unit: 'Ω', digits: 1 },
    { kind: 'number', id: 'R1', label: 'R₁', min: 1, max: 100, step: 1, value: 10, unit: 'Ω', digits: 0 },
    { kind: 'number', id: 'R2', label: 'R₂', min: 1, max: 100, step: 1, value: 20, unit: 'Ω', digits: 0 },
    { kind: 'number', id: 'R3', label: 'R₃', min: 1, max: 100, step: 1, value: 30, unit: 'Ω', digits: 0 },
  ],
  actions: [{ id: 'restart', label: 'Reset charge flow' }],
  dt: 1 / 60, previewSeconds: 1.5,
  init() { return { t: 0, ph: 0 }; },
  action(s) { s.t = 0; s.ph = 0; },
  step(s, v, dt) { s.t += dt; const sol = solveCircuit(v.kind as CircuitKind, v.E as number, v.r as number, v.R1 as number, v.R2 as number, v.R3 as number); s.ph += dt * clamp(sol.I * 0.35, 0.05, 2.5); },
  draw(c, s, v, w, h) {
    bg(c, w, h); const kind = v.kind as CircuitKind, sol = solveCircuit(kind, v.E as number, v.r as number, v.R1 as number, v.R2 as number, v.R3 as number), A = R(8, 8, w * 0.64 - 12, h - 16), B = R(A.x + A.w + 8, 8, w - A.w - 24, h - 16); panel(c, A);
    const X = (u: number) => A.x + u * A.w, Y = (u: number) => A.y + 24 + u * (A.h - 56), top = 0.12, bot = 0.88;
    const wire = (x1: number, y1: number, x2: number, y2: number) => line(c, X(x1), Y(y1), X(x2), Y(y2), '#cbd5e1', 2);
    const res = (x1: number, y1: number, x2: number, y2: number, label: string, val: number, vv: number, ii: number) => {
      const ax = X(x1), ay = Y(y1), bx = X(x2), by = Y(y2), d = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / d, ny = (bx - ax) / d, seg = 8, pts: [number, number][] = [[ax, ay]];
      for (let k = 1; k < seg; k++) { const u = k / seg, sg = k % 2 ? 1 : -1; pts.push([ax + (bx - ax) * u + nx * 7 * sg, ay + (by - ay) * u + ny * 7 * sg]); } pts.push([bx, by]); polyline(c, pts, C.amber, 2.4);
      text(c, `${label}=${fmt(val, 0)}Ω`, (ax + bx) / 2 + (nx === 0 ? 0 : 26 * Math.sign(nx || 1)), (ay + by) / 2 - (ny === 0 ? 0 : 0) + (ny === 0 ? -14 : 0), C.text, 10, 'center', 'alphabetic', true);
      text(c, `${fmt(vv, 2)} V · ${fmt(ii * 1000, 0)} mA`, (ax + bx) / 2 + (nx === 0 ? 0 : 26 * Math.sign(nx || 1)), (ay + by) / 2 + (ny === 0 ? 16 : 12), C.cyan, 9, 'center');
    };
    const dots = (path: [number, number][], I: number) => { let L = 0; const seg: number[] = []; for (let k = 1; k < path.length; k++) { seg.push(Math.hypot(X(path[k][0]) - X(path[k - 1][0]), Y(path[k][1]) - Y(path[k - 1][1]))); L += seg[k - 1]; } const n = Math.max(3, Math.round(L / 28)), amt = clamp(I / 0.5, 0.15, 1); for (let i = 0; i < n; i++) { let d = (((i / n) + s.ph * amt) % 1) * L, k = 0; while (k < seg.length - 1 && d > seg[k]) { d -= seg[k]; k++; } const u = seg[k] ? d / seg[k] : 0; circle(c, X(path[k][0] + (path[k + 1][0] - path[k][0]) * u), Y(path[k][1] + (path[k + 1][1] - path[k][1]) * u), 3, '#38bdf8'); } };
    // battery on the left
    wire(0.08, top, 0.08, 0.38); wire(0.08, 0.62, 0.08, bot); line(c, X(0.05), Y(0.38), X(0.11), Y(0.38), C.red, 3); line(c, X(0.065), Y(0.43), X(0.095), Y(0.43), C.blue, 3); line(c, X(0.05), Y(0.5), X(0.11), Y(0.5), C.red, 3); line(c, X(0.065), Y(0.55), X(0.095), Y(0.55), C.blue, 3); text(c, `E=${fmt(v.E as number, 1)} V`, X(0.08), Y(0.72), C.text, 10, 'center', 'alphabetic', true); text(c, `r=${fmt(v.r as number, 1)}Ω`, X(0.08), Y(0.78), C.dim, 9, 'center');
    wire(0.08, top, kind === 'parallel' ? 0.82 : kind === 'mixed' ? 0.82 : 0.92, top);
    if (kind === 'series') { wire(0.92, top, 0.92, bot); wire(0.08, bot, 0.92, bot); }
    if (kind === 'series') { const xs = [0.28, 0.5, 0.72], ii = sol.i, vv = sol.v, rv = [v.R1, v.R2, v.R3] as number[]; xs.forEach((x, k) => { c.fillStyle = C.bg; c.fillRect(X(x - 0.07), Y(top) - 12, X(0.14), 24); res(x - 0.07, top, x + 0.07, top, `R${k + 1}`, rv[k], vv[k], ii[k]); }); dots([[0.08, bot], [0.92, bot], [0.92, top], [0.08, top], [0.08, bot]], sol.I); }
    else if (kind === 'parallel') { wire(0.08, bot, 0.82, bot); const xs = [0.3, 0.55, 0.8], rv = [v.R1, v.R2, v.R3] as number[]; xs.forEach((x, k) => { wire(x, top, x, 0.32); wire(x, 0.68, x, bot); circle(c, X(x), Y(top), 3, '#cbd5e1'); circle(c, X(x), Y(bot), 3, '#cbd5e1'); res(x, 0.32, x, 0.68, `R${k + 1}`, rv[k], sol.v[k], sol.i[k]); dots([[x, bot], [x, top]], sol.i[k]); }); dots([[0.08, bot], [0.08, top], [0.3, top]], sol.I); }
    else { wire(0.08, bot, 0.82, bot); c.fillStyle = C.bg; c.fillRect(X(0.17), Y(top) - 12, X(0.2), 24); res(0.17, top, 0.37, top, 'R1', v.R1 as number, sol.v[0], sol.i[0]); wire(0.37, top, 0.55, top); const xs = [0.55, 0.8], rv = [v.R2, v.R3] as number[]; xs.forEach((x, k) => { wire(x, top, x, 0.32); wire(x, 0.68, x, bot); circle(c, X(x), Y(top), 3, '#cbd5e1'); circle(c, X(x), Y(bot), 3, '#cbd5e1'); res(x, 0.32, x, 0.68, `R${k + 2}`, rv[k], sol.v[k + 1], sol.i[k + 1]); dots([[x, bot], [x, top]], sol.i[k + 1]); }); dots([[0.08, bot], [0.08, top], [0.55, top]], sol.I); }
    text(c, 'conventional current flows + → − outside the cell (dots show charge drift)', A.x + 10, A.y + 16, C.dim, 10);
    // V-I characteristics
    const Imax = Math.max(sol.I, ...sol.i) * 1.3 * 1000, Vmax = Math.max(...sol.v, sol.Vt) * 1.3;
    const m = plot(c, B, [0, Math.max(1, Imax)], [0, Math.max(0.5, Vmax)], { title: 'V–I graph (slope = R)', xlabel: 'I (mA)', ylabel: 'V (V)', grid: true });
    c.save(); clip(c, B); const Rv = [v.R1, v.R2, v.R3] as number[], cols = [C.amber, C.green, C.pink]; Rv.forEach((rv, k) => { polyline(c, [[m.X(0), m.Y(0)], [m.X(Imax), m.Y((Imax / 1000) * rv)]], cols[k], 1.6); circle(c, m.X(sol.i[k] * 1000), m.Y(sol.v[k]), 4.5, cols[k], C.white, 1); }); polyline(c, [[m.X(0), m.Y(v.E as number)], [m.X(Imax), m.Y((v.E as number) - (Imax / 1000) * (v.r as number))]], C.cyan, 2, [5, 4]); circle(c, m.X(sol.I * 1000), m.Y(sol.Vt), 4.5, C.cyan, C.white, 1); c.restore();
  },
  readouts(s, v) {
    const sol = solveCircuit(v.kind as CircuitKind, v.E as number, v.r as number, v.R1 as number, v.R2 as number, v.R3 as number);
    return [{ label: 'Equivalent external resistance', value: sol.Rext, unit: 'Ω', digits: 3 }, { label: 'Total current from cell', value: sol.I, unit: 'A', digits: 4 }, { label: 'Terminal voltage E − Ir', value: sol.Vt, unit: 'V', digits: 3 }, { label: 'I₁ / I₂ / I₃', value: sol.i.map(x => fmt(x * 1000, 1)).join(' / '), unit: 'mA' }, { label: 'V₁ / V₂ / V₃', value: sol.v.map(x => fmt(x, 2)).join(' / '), unit: 'V' }, { label: 'Power in R₁ / R₂ / R₃', value: sol.p.map(x => fmt(x, 3)).join(' / '), unit: 'W' }, { label: 'Power from cell', value: sol.Pbat, unit: 'W', digits: 3 }, { label: 'Power lost in r', value: sol.Ploss, unit: 'W', digits: 4 }, { label: 'Energy check Pcell − ΣP', value: sol.Pbat - sol.Ploss - (v.kind === 'series' ? sol.p[0] + sol.p[1] + sol.p[2] : v.kind === 'parallel' ? sol.p[0] + sol.p[1] + sol.p[2] : sol.p[0] + sol.p[1] + sol.p[2]), unit: 'W', digits: 8 }];
  },
  equations(s, v) { const sol = solveCircuit(v.kind as CircuitKind, v.E as number, v.r as number, v.R1 as number, v.R2 as number, v.R3 as number); return ['V=IR,\\qquad P=VI=I^2R=\\dfrac{V^2}{R}', v.kind === 'series' ? 'R_{eq}=R_1+R_2+R_3,\\quad I\\ \\text{same everywhere}' : v.kind === 'parallel' ? '\\dfrac1{R_{eq}}=\\dfrac1{R_1}+\\dfrac1{R_2}+\\dfrac1{R_3},\\quad V\\ \\text{same on each branch}' : 'R_{eq}=R_1+\\dfrac{R_2R_3}{R_2+R_3}', `I=\\dfrac{E}{R_{eq}+r}=${fmt(sol.I, 4)}\\ \\mathrm{A},\\qquad V_t=E-Ir=${fmt(sol.Vt, 3)}\\ \\mathrm{V}`]; },
});

/* ================================================================== */
/*  2. Organic reaction mechanisms: SN2, SN1, E2, E1                   */
/* ================================================================== */
export type Substrate = 'methyl' | 'primary' | 'secondary' | 'tertiary';
export type Mech = 'SN2' | 'SN1' | 'E2' | 'E1';
const SUB: Record<Substrate, { name: string; sn2: number; carbocation: number; e: number }> = {
  methyl: { name: 'Methyl (CH₃–X)', sn2: 30, carbocation: 0, e: 0 }, primary: { name: 'Primary (RCH₂–X)', sn2: 1, carbocation: 1e-8, e: 0.1 },
  secondary: { name: 'Secondary (R₂CH–X)', sn2: 0.02, carbocation: 1e-3, e: 1 }, tertiary: { name: 'Tertiary (R₃C–X)', sn2: 1e-5, carbocation: 1, e: 3 },
};
const LG: Record<string, { name: string; k: number }> = { I: { name: 'I⁻ (excellent)', k: 1 }, Br: { name: 'Br⁻', k: 0.6 }, Cl: { name: 'Cl⁻', k: 0.02 }, F: { name: 'F⁻ (poor)', k: 1e-5 } };
/** Relative (dimensionless) rate scores for the four pathways from the standard qualitative rules of thumb. */
export function mechRates(sub: Substrate, lg: string, nu: number, base: number, bulk: number, aprotic: boolean, tempK: number) {
  const s = SUB[sub], g = LG[lg].k;
  const sn2 = s.sn2 * g * Math.pow(10, nu * 2) * (aprotic ? 1 : 0.05) * Math.pow(0.1, bulk * 1.5);
  const ionise = s.carbocation * g * (aprotic ? 0.02 : 1) * 3e-2;
  const sn1 = ionise;
  const e2 = s.e * g * Math.pow(10, base * 4) * Math.pow(10, bulk * 0.8) * Math.exp((tempK - 298) / 40) * 1e-3;
  const e1 = ionise * 0.3 * Math.exp((tempK - 298) / 25);
  const all = { SN2: sn2, SN1: sn1, E2: e2, E1: e1 } as Record<Mech, number>, tot = Math.max(1e-300, sn2 + sn1 + e2 + e1);
  const frac = Object.fromEntries((Object.keys(all) as Mech[]).map(k => [k, all[k] / tot])) as Record<Mech, number>;
  const best = (Object.keys(all) as Mech[]).reduce((a, b) => (all[b] > all[a] ? b : a));
  return { rates: all, frac, best, total: tot };
}
const RGAS = 8.314;
/** Barrier (kJ/mol) such that k = A·exp(−Ea/RT) gives the relative score (reference barrier 85 kJ/mol at score 1). */
export const barrier = (score: number, T: number) => clamp(85 - (RGAS * T * Math.log(Math.max(score, 1e-30))) / 1000, 20, 260);
interface OrS { t: number }
export const organicMechanisms = defineSim<OrS>({
  id: 'organic_sn_e_mechanisms', title: 'Organic Reaction Mechanisms: SN2, SN1, E2 and E1 Competition',
  ...meta('Chemistry', 'Intermediate', 'Organic Chemistry', 'Organic reaction mechanisms', 'Nucleophilic substitution and elimination, reaction coordinate diagrams, stereochemistry', [...SCHOOL_11_12, 'B.Sc', 'M.Sc']),
  covers: ['Organic reaction mechanisms', 'SN2', 'SN1', 'E2', 'E1', 'Nucleophilic substitution', 'Elimination', 'Walden inversion', 'Carbocation stability', 'Reaction coordinate diagram'],
  tags: ['sn1 sn2', 'e1 e2', 'haloalkane', 'nucleophile', 'leaving group', 'carbocation', 'solvent effect', 'organic chemistry', 'NEET', 'JEE', 'class 12 chemistry', 'inversion of configuration'],
  learningObjectives: ['Predict which of SN2, SN1, E2 or E1 dominates for a given substrate, nucleophile/base, leaving group, solvent and temperature.', 'Read a reaction-coordinate diagram: transition states, intermediates and activation energy.', 'Recognise Walden inversion (SN2) versus racemisation (SN1).'],
  assumptions: ['Relative rates are a qualitative rules-of-thumb model (sterics, carbocation stability, solvent class, leaving-group ability), not computed ab initio; barriers are scaled from those scores through the Arrhenius relation.'],
  blurb: 'Choose the substrate, nucleophile, base strength, solvent, leaving group and temperature. The simulator ranks SN2/SN1/E2/E1, animates the winning mechanism step by step and draws its energy profile.',
  hint: 'Tertiary + polar protic solvent → SN1/E1; primary + good nucleophile + aprotic solvent → SN2; strong bulky base + heat → E2. Watch the carbon invert in SN2 and the planar carbocation in SN1.',
  params: [
    { kind: 'select', id: 'sub', label: 'Substrate', value: 'primary', options: (Object.keys(SUB) as Substrate[]).map(k => ({ value: k, label: SUB[k].name })) },
    { kind: 'select', id: 'lg', label: 'Leaving group', value: 'Br', options: Object.entries(LG).map(([k, x]) => ({ value: k, label: x.name })) },
    { kind: 'number', id: 'nu', label: 'Nucleophilicity', min: 0, max: 1, step: 0.05, value: 0.8, digits: 2 },
    { kind: 'number', id: 'base', label: 'Basicity', min: 0, max: 1, step: 0.05, value: 0.3, digits: 2 },
    { kind: 'number', id: 'bulk', label: 'Steric bulk of nucleophile/base', min: 0, max: 1, step: 0.05, value: 0.1, digits: 2 },
    { kind: 'select', id: 'solv', label: 'Solvent', value: 'aprotic', options: [{ value: 'aprotic', label: 'Polar aprotic (DMSO, acetone)' }, { value: 'protic', label: 'Polar protic (H₂O, EtOH)' }] },
    { kind: 'number', id: 'T', label: 'Temperature', min: 250, max: 420, step: 1, value: 298, unit: 'K', digits: 0 },
  ],
  actions: [{ id: 'restart', label: 'Replay the mechanism' }],
  dt: 1 / 60, previewSeconds: 2,
  init() { return { t: 0 }; },
  action(s) { s.t = 0; },
  step(s, v, dt) { s.t += dt; void v; },
  draw(c, s, v, w, h) {
    bg(c, w, h); const r = mechRates(v.sub as Substrate, v.lg as string, v.nu as number, v.base as number, v.bulk as number, v.solv === 'aprotic', v.T as number), A = R(8, 8, w * 0.52 - 12, h * 0.6), B = R(A.x + A.w + 8, 8, w - A.w - 24, h * 0.6), G = R(8, h * 0.6 + 14, w - 16, h * 0.4 - 22);
    panel(c, A); const best = r.best, T = v.T as number, u = ((s.t * 0.25) % 1.4) / 1.4, cx = A.x + A.w / 2, cy = A.y + A.h * 0.5;
    text(c, `Predicted major pathway: ${best}`, A.x + 10, A.y + 18, C.green, 14, 'left', 'alphabetic', true);
    const atom = (x: number, y: number, rad: number, col: string, lab: string) => { circle(c, x, y, rad, col, 'rgba(0,0,0,0.5)', 1.2); text(c, lab, x, y + 4, '#0b1220', Math.max(10, rad * 0.7), 'center', 'alphabetic', true); };
    const Hs = (x: number, y: number, ang: number) => { for (let k = 0; k < 3; k++) { const a = ang + (k - 1) * 1.05; line(c, x, y, x + Math.cos(a) * 28, y + Math.sin(a) * 28, C.dim, 2); atom(x + Math.cos(a) * 28, y + Math.sin(a) * 28, 8, '#e2e8f0', 'R'); } };
    if (best === 'SN2') {
      const nx = cx - 150 + u * 90, lgx = cx + 20 + Math.max(0, u - 0.5) * 140, flip = u > 0.5 ? -1 : 1, tilt = (u < 0.5 ? 0 : 1) * Math.PI * Math.min(1, (u - 0.4) * 5);
      const ang = -Math.PI / 2 + (u > 0.35 && u < 0.65 ? 0 : 0); void ang; void tilt;
      const sp = Math.sin(clamp((u - 0.2) / 0.6, 0, 1) * Math.PI); // inversion umbrella flattening at the TS
      for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (k - 1) * 1.05 * (1 - 0.0) ; const bend = (u < 0.5 ? 1 : -1) * (1 - sp) * 0.5; const px = cx - 30 + Math.cos(a) * 30 * (k === 1 ? 0.6 : 1) * (1) + bend * 10 * (k - 1); const py = cy + Math.sin(a) * 38 * 0 + (k === 1 ? 0 : 0) - 10 + (k - 1) * 40; line(c, cx - 30, cy, px, py, C.dim, 2); atom(px, py, 8, '#e2e8f0', 'R'); } void flip;
      atom(cx - 30, cy, 14, '#94a3b8', 'C'); atom(nx, cy, 13, C.cyan, 'Nu'); atom(lgx, cy, 13, C.orange, v.lg as string);
      line(c, cx - 30, cy, nx, cy, `rgba(34,211,238,${clamp(u * 1.4, 0, 1)})`, 2, [4, 3]); line(c, cx - 30, cy, lgx, cy, `rgba(251,146,60,${clamp(1.6 - u * 1.6, 0, 1)})`, 2, [4, 3]);
      text(c, u < 0.3 ? 'Nu attacks from the back side' : u < 0.7 ? 'five-coordinate transition state [Nu···C···X]‡' : 'inversion of configuration (Walden)', A.x + 10, A.y + A.h - 12, C.amber, 11);
    } else if (best === 'SN1' || best === 'E1') {
      const stage = u < 0.35 ? 0 : u < 0.7 ? 1 : 2, lgx = cx + 30 + (stage >= 1 ? 90 : 0) + (stage === 0 ? u * 40 : 0);
      atom(cx - 20, cy, 14, '#94a3b8', stage ? 'C⁺' : 'C'); Hs(cx - 20, cy, stage ? -Math.PI / 2 : -Math.PI / 2);
      atom(lgx, cy, 13, C.orange, v.lg as string); if (stage === 0) line(c, cx - 20, cy, lgx, cy, C.dim, 2, [4, 3]);
      if (stage === 2) { if (best === 'SN1') { atom(cx - 100, cy - 36, 12, C.cyan, 'Nu'); atom(cx + 60, cy + 36, 12, C.cyan, 'Nu'); text(c, 'attack from either face → racemic mixture', A.x + 10, A.y + A.h - 12, C.amber, 11); } else { atom(cx + 60, cy - 50, 11, C.pink, 'B:'); text(c, 'base removes β-H → alkene (C=C)', A.x + 10, A.y + A.h - 12, C.amber, 11); line(c, cx - 20, cy - 3, cx + 30, cy - 33, C.green, 2.5); } }
      else text(c, stage === 0 ? 'slow ionisation: C–X bond breaks (rate-determining)' : 'planar sp² carbocation intermediate', A.x + 10, A.y + A.h - 12, C.amber, 11);
    } else {
      atom(cx - 70, cy, 14, '#94a3b8', 'Cα'); atom(cx + 10, cy, 14, '#94a3b8', 'Cβ'); line(c, cx - 70, cy, cx + 10, cy, C.dim, 3); atom(cx - 70, cy - 60, 12, C.orange, v.lg as string);
      const bx = cx + 10 + 80 * (1 - u) - (u > 0.5 ? 0 : 0), hx = cx + 40, hy = cy - 40 * (1 - Math.max(0, u - 0.5) * 2);
      atom(hx, hy, 8, '#e2e8f0', 'H'); atom(u < 0.5 ? bx + 40 : hx + 30 + (u - 0.5) * 40, u < 0.5 ? cy - 70 : hy - 6, 12, C.pink, 'B:');
      if (u > 0.55) line(c, cx - 70, cy + 4, cx + 10, cy + 4, C.green, 3); text(c, 'concerted: base removes H while X leaves (anti-periplanar)', A.x + 10, A.y + A.h - 12, C.amber, 11);
    }
    // energy diagram
    panel(c, B); const Ea = barrier(r.rates[best], T), ys = (e: number) => B.y + B.h - 30 - (e / 260) * (B.h - 60), xs = (f: number) => B.x + 24 + f * (B.w - 48);
    const prof: [number, number][] = []; const dG = best === 'SN1' || best === 'E1' ? 0 : 0;
    for (let i = 0; i <= 120; i++) { const f = i / 120; let e: number; if (best === 'SN1' || best === 'E1') { const Ea1 = Ea, Ea2 = 30; e = f < 0.5 ? Ea1 * Math.sin((f / 0.5) * (Math.PI / 2)) ** 2 * 1 - 0 + (f > 0.45 ? 0 : 0) : Math.max(0, Ea1 * 0.7 - (Ea1 * 0.7 - Ea2) * Math.sin(((f - 0.5) / 0.5) * (Math.PI / 2)) ** 2 + 0); if (f >= 0.5) e = Ea1 * 0.6 + (Ea2 * 0.6) * Math.sin(((f - 0.5) / 0.5) * Math.PI) - 50 * ((f - 0.5) / 0.5); } else e = Ea * Math.exp(-Math.pow((f - 0.5) / 0.2, 2)) - 50 * f; prof.push([xs(f), ys(Math.max(0, e + dG))]); }
    polyline(c, prof, C.cyan, 3); text(c, `Energy profile: ${best}   Eₐ ≈ ${fmt(Ea, 0)} kJ/mol`, B.x + 10, B.y + 16, C.text, 11, 'left', 'alphabetic', true); text(c, 'reaction coordinate →', B.x + B.w - 10, B.y + B.h - 8, C.dim, 10, 'right');
    const mk = prof[Math.floor(u * 120)]; circle(c, mk[0], mk[1], 6, C.amber, C.white, 1.5);
    // product distribution bars
    panel(c, G); (Object.keys(r.frac) as Mech[]).forEach((k, i) => { const bw = (G.w - 80) / 4, x = G.x + 40 + i * bw, hh = (G.h - 50) * r.frac[k]; c.fillStyle = k === best ? C.green : 'rgba(96,165,250,0.7)'; c.fillRect(x + 10, G.y + G.h - 24 - hh, bw - 20, hh); text(c, k, x + bw / 2, G.y + G.h - 8, C.text, 12, 'center', 'alphabetic', true); text(c, `${fmt(r.frac[k] * 100, 1)}%`, x + bw / 2, G.y + G.h - 28 - hh, C.text, 10, 'center'); }); text(c, 'Predicted product distribution (relative pathway rates)', G.x + 10, G.y + 15, C.text, 11, 'left', 'alphabetic', true);
  },
  readouts(s, v) {
    const r = mechRates(v.sub as Substrate, v.lg as string, v.nu as number, v.base as number, v.bulk as number, v.solv === 'aprotic', v.T as number), T = v.T as number;
    return [{ label: 'Major pathway', value: r.best }, { label: 'SN2 / SN1', value: `${fmt(r.frac.SN2 * 100, 1)}% / ${fmt(r.frac.SN1 * 100, 1)}%` }, { label: 'E2 / E1', value: `${fmt(r.frac.E2 * 100, 1)}% / ${fmt(r.frac.E1 * 100, 1)}%` }, { label: 'Activation energy of major path', value: barrier(r.rates[r.best], T), unit: 'kJ/mol', digits: 0 }, { label: 'Kinetics', value: r.best === 'SN2' || r.best === 'E2' ? 'second order: rate = k[RX][Nu]' : 'first order: rate = k[RX]' }, { label: 'Stereochemistry', value: r.best === 'SN2' ? 'inversion (Walden)' : r.best === 'SN1' ? 'racemisation' : r.best === 'E2' ? 'anti-periplanar, Zaitsev' : 'Zaitsev alkene' }];
  },
  equations(s, v) { const r = mechRates(v.sub as Substrate, v.lg as string, v.nu as number, v.base as number, v.bulk as number, v.solv === 'aprotic', v.T as number); return [r.best === 'SN2' || r.best === 'E2' ? '\\text{rate}=k\\,[\\mathrm{RX}][\\mathrm{Nu}^-]' : '\\text{rate}=k\\,[\\mathrm{RX}]', 'k=A\\,e^{-E_a/RT}', '\\text{3}^\\circ>2^\\circ>1^\\circ>\\mathrm{CH_3}\\ (\\text{S}_\\text{N}1)\\qquad \\mathrm{CH_3}>1^\\circ>2^\\circ>3^\\circ\\ (\\text{S}_\\text{N}2)']; },
});

/* ================================================================== */
/*  3. Cardiac cycle: time-varying elastance LV + windkessel           */
/* ================================================================== */
export interface HeartP { hr: number; emax: number; pla: number; rsys: number; cao: number }
export interface HeartS { t: number; V: number; Pao: number; Plv: number; Qao: number; Qmv: number; log: { t: number; Plv: number; Pao: number; V: number }[]; beats: number; lastCycle: { EDV: number; ESV: number; SV: number; Psys: number; Pdia: number } }
const E_MIN = 0.06, V0 = 10, RAV = 0.005, RMV = 0.01;
export const elastance = (t: number, T: number, emax: number) => { const Ts = 0.37 * Math.sqrt(T), ph = t % T; const e = ph < Ts ? Math.sin((Math.PI * ph) / Ts) ** 2 : 0; return E_MIN + (emax - E_MIN) * e; };
/** One RK-free explicit step with sub-stepping (dt ≤ 0.5 ms keeps the stiff valve resistances stable). */
export function heartStep(s: HeartS, p: HeartP, dt: number) {
  const T = 60 / p.hr; let remaining = dt;
  while (remaining > 1e-9) {
    const h = Math.min(remaining, 0.0004), Plv = elastance(s.t, T, p.emax) * (s.V - V0);
    const Qao = Math.max(0, (Plv - s.Pao) / RAV), Qmv = Math.max(0, (p.pla - Plv) / RMV);
    s.V = Math.max(V0 + 1, s.V + (Qmv - Qao) * h); s.Pao = Math.max(1, s.Pao + ((Qao - s.Pao / p.rsys) / p.cao) * h);
    s.Plv = Plv; s.Qao = Qao; s.Qmv = Qmv; s.t += h; remaining -= h;
  }
}
export function newHeart(): HeartS { return { t: 0, V: 120, Pao: 80, Plv: 5, Qao: 0, Qmv: 0, log: [], beats: 0, lastCycle: { EDV: 120, ESV: 50, SV: 70, Psys: 120, Pdia: 80 } }; }
/** Run the model for n beats and return the steady-state cycle metrics (used by the checker). */
export function steadyHeart(p: HeartP, beats = 25) {
  const s = newHeart(), T = 60 / p.hr; let metrics = s.lastCycle;
  for (let b = 0; b < beats; b++) { let vmax = 0, vmin = 1e9, pmax = 0, pmin = 1e9; const n = Math.round(T / 0.002); for (let i = 0; i < n; i++) { heartStep(s, p, 0.002); vmax = Math.max(vmax, s.V); vmin = Math.min(vmin, s.V); pmax = Math.max(pmax, s.Pao); pmin = Math.min(pmin, s.Pao); } metrics = { EDV: vmax, ESV: vmin, SV: vmax - vmin, Psys: pmax, Pdia: pmin }; }
  return metrics;
}
const ecg = (ph: number) => { const g = (x: number, c0: number, wd: number, a: number) => a * Math.exp(-Math.pow((x - c0) / wd, 2)); return g(ph, 0.1, 0.03, 0.15) + g(ph, 0.2, 0.008, -0.12) + g(ph, 0.225, 0.012, 1) + g(ph, 0.25, 0.01, -0.25) + g(ph, 0.45, 0.05, 0.3); };
export const cardiacCycle = defineSim<HeartS>({
  id: 'cardiac_cycle', title: 'Human Heart and Circulation: Cardiac Cycle, Wiggers Diagram and Pressure–Volume Loop',
  ...meta('Biology', 'Intermediate', 'Human Physiology', 'Human heart & circulation', 'Cardiac cycle, valves, ECG, pressure–volume loop, stroke volume and cardiac output', [...SCHOOL_11_12, 'B.Sc', 'M.Sc']),
  covers: ['Human heart', 'Cardiac cycle', 'Blood circulation', 'Cardiac output', 'Stroke volume', 'Blood pressure', 'Heart valves', 'ECG', 'Pressure–volume loop', 'Frank–Starling mechanism'],
  tags: ['heart', 'cardiac output', 'wiggers diagram', 'blood pressure', 'ECG', 'systole diastole', 'PV loop', 'NEET', 'CBSE class 11', 'physiology', 'circulation'],
  learningObjectives: ['Follow the four phases: filling, isovolumic contraction, ejection, isovolumic relaxation.', 'Relate ventricular, aortic and atrial pressures to opening and closing of the valves.', 'Explore how heart rate, contractility, preload and peripheral resistance change stroke volume, cardiac output and blood pressure.'],
  assumptions: ['Lumped-parameter model: time-varying elastance left ventricle, ideal diode valves with small resistances, 2-element windkessel aorta, constant atrial and venous pressure; right heart and pulmonary circuit are not modelled. The ECG is schematic.'],
  blurb: 'A working left-heart model: the ventricle contracts through a time-varying elastance, valves open and close from the pressure differences, and the Wiggers diagram, ECG and P–V loop are drawn from the live numbers.',
  hint: 'Raise the preload and stroke volume rises (Frank–Starling); raise peripheral resistance and blood pressure climbs while stroke volume dips. Cardiac output = HR × SV.',
  params: [
    { kind: 'number', id: 'hr', label: 'Heart rate', min: 40, max: 180, step: 1, value: 75, unit: 'bpm', digits: 0 },
    { kind: 'number', id: 'emax', label: 'Contractility (Eₘₐₓ)', min: 0.8, max: 4, step: 0.05, value: 2, unit: 'mmHg/mL', digits: 2 },
    { kind: 'number', id: 'pla', label: 'Preload (atrial pressure)', min: 2, max: 20, step: 0.5, value: 8, unit: 'mmHg', digits: 1 },
    { kind: 'number', id: 'rsys', label: 'Peripheral resistance', min: 0.5, max: 2.5, step: 0.05, value: 1, unit: 'mmHg·s/mL', digits: 2 },
    { kind: 'number', id: 'cao', label: 'Aortic compliance', min: 0.5, max: 3, step: 0.1, value: 1.5, unit: 'mL/mmHg', digits: 1 },
  ],
  actions: [{ id: 'restart', label: 'Restart the heart' }],
  dt: 1 / 60, previewSeconds: 6,
  init() { return newHeart(); },
  action(s) { Object.assign(s, newHeart()); },
  step(s, v, dt) {
    const p = hp(v), T = 60 / p.hr, before = Math.floor(s.t / T); heartStep(s, p, dt);
    s.log.push({ t: s.t, Plv: s.Plv, Pao: s.Pao, V: s.V }); while (s.log.length && s.log[0].t < s.t - 2.5 * T) s.log.shift();
    if (Math.floor(s.t / T) > before) { s.beats++; const cyc = s.log.filter(x => x.t > s.t - T); if (cyc.length) { const vs = cyc.map(x => x.V), ps = cyc.map(x => x.Pao); s.lastCycle = { EDV: Math.max(...vs), ESV: Math.min(...vs), SV: Math.max(...vs) - Math.min(...vs), Psys: Math.max(...ps), Pdia: Math.min(...ps) }; } }
  },
  draw(c, s, v, w, h) {
    bg(c, w, h); const p = hp(v), T = 60 / p.hr, A = R(8, 8, w * 0.3 - 8, h * 0.58), W = R(A.x + A.w + 8, 8, w * 0.7 - 16, h * 0.58), L = R(8, h * 0.58 + 14, w * 0.5 - 12, h * 0.42 - 22), E = R(w * 0.5 + 4, h * 0.58 + 14, w * 0.5 - 12, h * 0.42 - 22); panel(c, A);
    // heart cartoon: LV chamber scaled by volume
    const cx = A.x + A.w / 2, cy = A.y + A.h * 0.55, rr = 22 + 34 * clamp((s.V - 40) / 120, 0, 1.2), open = s.Qao > 0.5, mitral = s.Qmv > 0.5, phase = open ? 'Ejection (aortic valve open)' : mitral ? 'Filling (mitral valve open)' : s.Plv > p.pla + 1 ? 'Isovolumic contraction' : 'Isovolumic relaxation';
    circle(c, cx, cy, rr, 'rgba(239,68,68,0.55)', C.red, 3); text(c, 'LV', cx, cy + 4, C.white, 13, 'center', 'alphabetic', true);
    circle(c, cx - 40, cy - rr - 20, 17, 'rgba(96,165,250,0.5)', C.blue, 2); text(c, 'LA', cx - 40, cy - rr - 16, C.white, 11, 'center'); line(c, cx - 28, cy - rr - 10, cx - 14, cy - rr + 6, mitral ? C.green : C.red, 5);
    c.strokeStyle = 'rgba(239,68,68,0.9)'; c.lineWidth = 12; c.beginPath(); c.moveTo(cx + 14, cy - rr + 4); c.quadraticCurveTo(cx + 40, cy - rr - 40, cx + 62, cy - rr - 10); c.stroke(); line(c, cx + 10, cy - rr + 2, cx + 24, cy - rr - 8, open ? C.green : C.red, 5);
    if (open) arrow(c, cx + 20, cy - rr - 20, cx + 56, cy - rr - 36, C.amber, 3, 8); if (mitral) arrow(c, cx - 40, cy - rr + 6, cx - 18, cy - rr + 16, C.amber, 3, 8);
    text(c, phase, A.x + 8, A.y + 18, C.amber, 11, 'left', 'alphabetic', true); text(c, `${fmt(s.Plv, 0)} mmHg  ${fmt(s.V, 0)} mL`, A.x + 8, A.y + A.h - 10, C.dim, 10);
    // Wiggers diagram
    const t0 = s.t - 2 * T, m = plot(c, W, [t0, s.t], [0, 140], { title: 'Wiggers diagram: ventricular (red), aortic (blue), atrial (green) pressure', xlabel: 'time (s)', ylabel: 'mmHg', grid: true });
    c.save(); clip(c, W); const lg = s.log; polyline(c, lg.map(x => [m.X(x.t), m.Y(x.Plv)] as [number, number]), C.red, 2.2); polyline(c, lg.map(x => [m.X(x.t), m.Y(x.Pao)] as [number, number]), C.blue, 2.2); line(c, m.X(t0), m.Y(p.pla), m.X(s.t), m.Y(p.pla), C.green, 1.6, [5, 4]);
    polyline(c, lg.map(x => [m.X(x.t), m.Y(10 + 25 * ecg(((x.t % T) / T) * 0.85 + 0.05 * 0))] as [number, number]), 'rgba(251,191,36,0.85)', 1.4); c.restore();
    // volume trace and PV loop
    const m2 = plot(c, L, [t0, s.t], [30, 160], { title: 'LV volume (mL)', xlabel: 'time (s)', grid: true }); c.save(); clip(c, L); polyline(c, lg.map(x => [m2.X(x.t), m2.Y(x.V)] as [number, number]), C.cyan, 2.2); c.restore();
    const m3 = plot(c, E, [30, 160], [0, 150], { title: 'Pressure–volume loop (area = stroke work)', xlabel: 'V (mL)', ylabel: 'P (mmHg)', grid: true }); c.save(); clip(c, E); const cyc = lg.filter(x => x.t > s.t - T); polyline(c, cyc.map(x => [m3.X(x.V), m3.Y(x.Plv)] as [number, number]), C.amber, 2.4); const last = lg[lg.length - 1]; if (last) circle(c, m3.X(last.V), m3.Y(last.Plv), 5, C.red, C.white, 1.2); c.restore();
  },
  readouts(s, v) {
    const p = hp(v), c = s.lastCycle, co = (p.hr * c.SV) / 1000;
    return [{ label: 'Beats simulated', value: s.beats, digits: 0 }, { label: 'End-diastolic volume', value: c.EDV, unit: 'mL', digits: 0 }, { label: 'End-systolic volume', value: c.ESV, unit: 'mL', digits: 0 }, { label: 'Stroke volume', value: c.SV, unit: 'mL', digits: 0 }, { label: 'Ejection fraction', value: (c.SV / c.EDV) * 100, unit: '%', digits: 0 }, { label: 'Cardiac output', value: co, unit: 'L/min', digits: 2 }, { label: 'Blood pressure (sys/dia)', value: `${fmt(c.Psys, 0)}/${fmt(c.Pdia, 0)}`, unit: 'mmHg' }, { label: 'Mean arterial pressure ≈ CO × R', value: (p.hr * c.SV * p.rsys) / 60, unit: 'mmHg', digits: 0 }, { label: 'Pulse pressure', value: c.Psys - c.Pdia, unit: 'mmHg', digits: 0 }];
  },
  equations(s, v) { const p = hp(v); return ['P_{LV}(t)=E(t)\\,\\left[V(t)-V_0\\right],\\quad E(t)=E_{min}+(E_{max}-E_{min})\\sin^2\\!\\left(\\dfrac{\\pi t}{T_s}\\right)', `CO=HR\\times SV=${p.hr}\\times${fmt(s.lastCycle.SV, 0)}\\ \\mathrm{mL}=${fmt((p.hr * s.lastCycle.SV) / 1000, 2)}\\ \\mathrm{L/min}`, 'C_{ao}\\dfrac{dP_{ao}}{dt}=Q_{ao}-\\dfrac{P_{ao}}{R_{sys}},\\qquad MAP\\approx CO\\cdot R_{sys}']; },
});
const hp = (v: Record<string, number | string | boolean>): HeartP => ({ hr: v.hr as number, emax: v.emax as number, pla: v.pla as number, rsys: v.rsys as number, cao: v.cao as number });

/* ================================================================== */
/*  4. Elliptic-curve cryptography over F_p                            */
/* ================================================================== */
export type Pt = [number, number] | null;
export const modp = (a: number, p: number) => ((a % p) + p) % p;
export function inv(a: number, p: number): number { let [r0, r1, s0, s1] = [p, modp(a, p), 0, 1]; while (r1) { const q = Math.floor(r0 / r1); [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; } return modp(s0, p); }
export const onCurve = (P: Pt, a: number, b: number, p: number) => P === null || modp(P[1] * P[1] - (P[0] ** 3 + a * P[0] + b), p) === 0;
export function ecAdd(P: Pt, Q: Pt, a: number, p: number): Pt {
  if (!P) return Q; if (!Q) return P;
  if (P[0] === Q[0] && modp(P[1] + Q[1], p) === 0) return null;
  const l = P[0] === Q[0] && P[1] === Q[1] ? modp((3 * P[0] * P[0] + a) * inv(2 * P[1], p), p) : modp((Q[1] - P[1]) * inv(Q[0] - P[0], p), p), x = modp(l * l - P[0] - Q[0], p);
  return [x, modp(l * (P[0] - x) - P[1], p)];
}
export function ecMul(k: number, P: Pt, a: number, p: number): Pt { let R_: Pt = null, Q = P; while (k > 0) { if (k & 1) R_ = ecAdd(R_, Q, a, p); Q = ecAdd(Q, Q, a, p); k >>= 1; } return R_; }
export function curvePoints(a: number, b: number, p: number): [number, number][] { const pts: [number, number][] = []; for (let x = 0; x < p; x++) { const rhs = modp(x ** 3 + a * x + b, p); for (let y = 0; y < p; y++) if (modp(y * y, p) === rhs) pts.push([x, y]); } return pts; }
export function pointOrder(P: Pt, a: number, p: number): number { let k = 1, Q = P; while (Q !== null && k < 100000) { Q = ecAdd(Q, P, a, p); k++; } return k; }
export const nonSingular = (a: number, b: number, p: number) => modp(4 * a ** 3 + 27 * b * b, p) !== 0;
interface EcS { t: number }
export const ellipticCurveCrypto = defineSim<EcS>({
  id: 'elliptic_curve_crypto', title: 'Elliptic-Curve Cryptography: Point Addition, Scalar Multiplication and ECDH',
  ...meta('Security', 'Advanced', 'Public-Key Cryptography', 'Elliptic-curve cryptography', 'Group law on y² = x³ + ax + b, double-and-add, ECDH key agreement over a small prime field', [...UG_ENG, 'BCA', 'B.Sc', ...PG_ALL]),
  covers: ['Elliptic-curve cryptography', 'Elliptic curve group law', 'Point addition', 'Point doubling', 'Scalar multiplication', 'Double-and-add', 'ECDH', 'Discrete logarithm problem', 'Hasse bound'],
  tags: ['ECC', 'ECDH', 'elliptic curve', 'secp256k1', 'public key', 'discrete log', 'cryptography', 'finite field', 'double and add', 'security'],
  learningObjectives: ['See chord-and-tangent point addition on the real curve and the same algebra over a finite field.', 'Compute kG by double-and-add and watch the multiples hop around the field.', 'Run a toy ECDH key exchange and confirm both parties derive the same secret.'],
  assumptions: ['Toy sizes (p ≤ 251) so every point can be enumerated; real ECC uses ≈256-bit primes. The real-plane picture uses the same a and b with real numbers for geometry only.'],
  blurb: 'Left: the real curve with chord-and-tangent point addition. Right: the same curve over a small prime field, every point plotted, with G, 2G, 3G … tracing through the group. Bottom: toy ECDH between Alice and Bob.',
  hint: 'Pick a prime and curve; the number of points N obeys Hasse: |N − (p+1)| ≤ 2√p. The order of G tells how many multiples exist before returning to the point at infinity.',
  params: [
    { kind: 'select', id: 'p', label: 'Prime field p', value: '97', options: ['23', '47', '97', '151', '211', '251'].map(x => ({ value: x, label: `p = ${x}` })) },
    { kind: 'number', id: 'a', label: 'Curve a', min: -5, max: 20, step: 1, value: 2, digits: 0 },
    { kind: 'number', id: 'b', label: 'Curve b', min: 1, max: 30, step: 1, value: 3, digits: 0 },
    { kind: 'number', id: 'g', label: 'Base point index (which point is G)', min: 1, max: 200, step: 1, value: 1, digits: 0 },
    { kind: 'number', id: 'da', label: 'Alice private key a', min: 2, max: 60, step: 1, value: 7, digits: 0 },
    { kind: 'number', id: 'db', label: 'Bob private key b', min: 2, max: 60, step: 1, value: 11, digits: 0 },
    { kind: 'number', id: 'rate', label: 'Multiples per second', min: 0.5, max: 10, step: 0.5, value: 2, digits: 1 },
  ],
  actions: [{ id: 'restart', label: 'Restart multiples' }],
  dt: 1 / 30, previewSeconds: 3,
  init() { return { t: 0 }; },
  action(s) { s.t = 0; },
  step(s, v, dt) { s.t += dt; void v; },
  draw(c, s, v, w, h) {
    bg(c, w, h); const p = +(v.p as string), a = v.a as number, b = v.b as number, ok = nonSingular(a, b, p), pts = curvePoints(a, b, p), A = R(8, 8, w * 0.45 - 12, h * 0.64), B = R(A.x + A.w + 8, 8, w - A.w - 24, h * 0.64), D = R(8, h * 0.64 + 14, w - 16, h * 0.36 - 22);
    if (!ok || pts.length < 2) { panel(c, A); text(c, 'singular curve (4a³+27b² ≡ 0): choose other a, b', A.x + 14, A.y + 24, C.red, 13, 'left', 'alphabetic', true); return; }
    const G = pts[(clamp(v.g as number, 1, pts.length) - 1) % pts.length] as [number, number], n = pointOrder(G, a, p), k = 1 + Math.floor(s.t * (v.rate as number)) % Math.max(1, n - 1);
    // real curve with chord and tangent
    const m = plot(c, A, [-4, 4], [-6, 6], { title: `Real curve y² = x³ ${a >= 0 ? '+' : '−'} ${Math.abs(a)}x ${b >= 0 ? '+' : '−'} ${Math.abs(b)}: P + Q = −R`, grid: true, zeroAxis: true }); c.save(); clip(c, A);
    const up: [number, number][] = [], dn: [number, number][] = []; for (let i = 0; i <= 400; i++) { const x = -4 + (8 * i) / 400, r = x ** 3 + a * x + b; if (r >= 0) { up.push([m.X(x), m.Y(Math.sqrt(r))]); dn.push([m.X(x), m.Y(-Math.sqrt(r))]); } } polyline(c, up, C.cyan, 2); polyline(c, dn, C.cyan, 2);
    const fr = (x: number) => x ** 3 + a * x + b, xs = [-4, 4].map(() => 0); void xs; let x1 = -3, x2 = 3; for (let x = -3.9; x < 3.9; x += 0.05) if (fr(x) > 0.2) { x1 = x; break; } for (let x = 3.9; x > -3.9; x -= 0.05) if (fr(x) > 0.2) { x2 = x; break; } const t = 0.5 + 0.35 * Math.sin(s.t * 0.7), Px = x1 + (x2 - x1) * 0.2 + 0 * t, Qx = x1 + (x2 - x1) * (0.45 + 0.4 * t);
    const P1: [number, number] = [Px, Math.sqrt(Math.max(0, fr(Px)))], Q1: [number, number] = [Qx, -Math.sqrt(Math.max(0, fr(Qx)))];
    if (Math.abs(Q1[0] - P1[0]) > 1e-3) { const l = (Q1[1] - P1[1]) / (Q1[0] - P1[0]), x3 = l * l - P1[0] - Q1[0], y3 = l * (P1[0] - x3) - P1[1]; line(c, m.X(-4), m.Y(P1[1] + l * (-4 - P1[0])), m.X(4), m.Y(P1[1] + l * (4 - P1[0])), 'rgba(251,191,36,0.7)', 1.5); circle(c, m.X(x3), m.Y(-y3), 5, C.green, C.white, 1.2); circle(c, m.X(x3), m.Y(y3), 3.5, undefined, C.amber, 1.5); line(c, m.X(x3), m.Y(y3), m.X(x3), m.Y(-y3), 'rgba(52,211,153,0.6)', 1.2, [3, 3]); text(c, 'P+Q', m.X(x3) + 7, m.Y(-y3) + 4, C.green, 10, 'left', 'alphabetic', true); }
    circle(c, m.X(P1[0]), m.Y(P1[1]), 5, C.pink, C.white, 1); circle(c, m.X(Q1[0]), m.Y(Q1[1]), 5, C.purple, C.white, 1); text(c, 'P', m.X(P1[0]) + 6, m.Y(P1[1]) - 6, C.pink, 10, 'left', 'alphabetic', true); text(c, 'Q', m.X(Q1[0]) + 6, m.Y(Q1[1]) + 12, C.purple, 10, 'left', 'alphabetic', true); c.restore();
    // finite-field scatter
    panel(c, B); text(c, `Same curve over F${p}: ${pts.length + 1} points (incl. ∞)   order(G) = ${n}`, B.x + 10, B.y + 16, C.text, 11, 'left', 'alphabetic', true);
    const gx = B.x + 28, gy = B.y + 26, gw = B.w - 40, gh = B.h - 40, X = (x: number) => gx + (x / p) * gw, Y = (y: number) => gy + gh - (y / p) * gh;
    c.strokeStyle = 'rgba(148,163,184,0.25)'; c.strokeRect(gx, gy, gw, gh); for (const [x, y] of pts) circle(c, X(x), Y(y), Math.max(1.6, gw / p / 2.2), 'rgba(96,165,250,0.75)');
    let Pk: Pt = null; const trail: [number, number][] = []; for (let i = 1; i <= k; i++) { Pk = ecAdd(Pk, G, a, p); if (Pk) trail.push([X(Pk[0]), Y(Pk[1])]); }
    if (trail.length > 1) polyline(c, trail.slice(-40), 'rgba(251,191,36,0.4)', 1); trail.slice(-40).forEach(([x, y], i, arr) => circle(c, x, y, 2 + (i / arr.length) * 3, `rgba(251,191,36,${0.2 + 0.8 * (i / arr.length)})`));
    circle(c, X(G[0]), Y(G[1]), 6, C.red, C.white, 1.5); text(c, 'G', X(G[0]) + 8, Y(G[1]) - 6, C.red, 11, 'left', 'alphabetic', true); if (Pk) { circle(c, X(Pk[0]), Y(Pk[1]), 6, C.green, C.white, 1.5); text(c, `${k}G=(${Pk[0]},${Pk[1]})`, B.x + B.w - 10, B.y + B.h - 8, C.green, 11, 'right', 'alphabetic', true); }
    // ECDH panel
    panel(c, D); const da = v.da as number, db = v.db as number, QA = ecMul(da, G, a, p), QB = ecMul(db, G, a, p), SA = ecMul(da, QB, a, p), SB = ecMul(db, QA, a, p), f = (P: Pt) => (P ? `(${P[0]}, ${P[1]})` : '∞');
    text(c, 'Toy ECDH key agreement', D.x + 10, D.y + 18, C.text, 12, 'left', 'alphabetic', true);
    text(c, `Alice: private a=${da}  public A = aG = ${f(QA)}`, D.x + 10, D.y + 40, C.pink, 11); text(c, `Bob:   private b=${db}  public B = bG = ${f(QB)}`, D.x + 10, D.y + 58, C.purple, 11);
    text(c, `Alice computes a·B = ${f(SA)}     Bob computes b·A = ${f(SB)}`, D.x + 10, D.y + 80, C.cyan, 11); text(c, SA && SB && SA[0] === SB[0] && SA[1] === SB[1] ? '✓ shared secret agrees: abG' : SA === null && SB === null ? '✓ both ∞ (pick other keys)' : '✗ mismatch', D.x + 10, D.y + 100, C.green, 12, 'left', 'alphabetic', true);
  },
  readouts(s, v) {
    const p = +(v.p as string), a = v.a as number, b = v.b as number; if (!nonSingular(a, b, p)) return [{ label: 'Curve', value: 'singular — invalid for ECC' }];
    const pts = curvePoints(a, b, p), G = pts[(clamp(v.g as number, 1, pts.length) - 1) % pts.length] as [number, number], n = pointOrder(G, a, p), N = pts.length + 1, hasse = 2 * Math.sqrt(p);
    return [{ label: 'Number of points N (with ∞)', value: N, digits: 0 }, { label: 'Hasse bound |N − (p+1)| ≤ 2√p', value: `${Math.abs(N - (p + 1))} ≤ ${fmt(hasse, 2)}` }, { label: 'Base point G', value: `(${G[0]}, ${G[1]})` }, { label: 'Order of G', value: n, digits: 0 }, { label: 'Discriminant 4a³+27b² mod p', value: modp(4 * a ** 3 + 27 * b * b, p), digits: 0 }, { label: 'Brute-force search space for the secret', value: n, digits: 0 }, { label: 'Real-world equivalent', value: 'secp256k1 / P-256: ≈2²⁵⁶ points' }];
  },
  equations(s, v) { const p = +(v.p as string); return [`y^2\\equiv x^3+${v.a}x+${v.b}\\pmod{${p}}`, '\\lambda=\\dfrac{y_2-y_1}{x_2-x_1},\\ \\ \\lambda_{dbl}=\\dfrac{3x_1^2+a}{2y_1},\\quad x_3=\\lambda^2-x_1-x_2,\\ \\ y_3=\\lambda(x_1-x_3)-y_1', 'Q_A=aG,\\ Q_B=bG,\\qquad K=aQ_B=bQ_A=abG']; },
});

/* ================================================================== */
/*  5. Karnaugh-map minimiser (Quine–McCluskey)                        */
/* ================================================================== */
export interface Imp { bits: string; covers: number[] }
const popc = (n: number) => { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; };
/** Quine–McCluskey: prime implicants of the given minterms (don't-cares allowed). bits uses '-' for eliminated variables. */
export function primeImplicants(nv: number, minterms: number[], dc: number[] = []): Imp[] {
  const all = [...new Set([...minterms, ...dc])]; let cur: Imp[] = all.map(m => ({ bits: m.toString(2).padStart(nv, '0'), covers: [m] })); const primes: Imp[] = [];
  while (cur.length) {
    const used = new Set<number>(), next = new Map<string, Imp>();
    for (let i = 0; i < cur.length; i++) for (let j = i + 1; j < cur.length; j++) {
      const a = cur[i].bits, b = cur[j].bits; let diff = -1, ok = true; for (let k = 0; k < nv; k++) if (a[k] !== b[k]) { if (a[k] === '-' || b[k] === '-' || diff >= 0) { ok = false; break; } diff = k; }
      if (ok && diff >= 0) { used.add(i); used.add(j); const bits = a.slice(0, diff) + '-' + a.slice(diff + 1); if (!next.has(bits)) next.set(bits, { bits, covers: [...new Set([...cur[i].covers, ...cur[j].covers])].sort((x, y) => x - y) }); }
    }
    cur.forEach((imp, i) => { if (!used.has(i)) primes.push(imp); }); cur = [...next.values()];
  }
  return primes;
}
/** Minimum cover: essential primes first, then an exact Petrick-style search on the remainder (≤ 16 variables worth of terms is tiny here). */
export function minimalCover(nv: number, minterms: number[], dc: number[] = []): Imp[] {
  if (!minterms.length) return []; const primes = primeImplicants(nv, minterms, dc); const need = new Set(minterms), chosen: Imp[] = [];
  for (const m of minterms) { const cand = primes.filter(p => p.covers.includes(m)); if (cand.length === 1 && !chosen.includes(cand[0])) chosen.push(cand[0]); }
  chosen.forEach(p => p.covers.forEach(m => need.delete(m)));
  const rest = primes.filter(p => !chosen.includes(p) && p.covers.some(m => need.has(m)));
  if (need.size) { let best: Imp[] | null = null; const rec = (i: number, left: Set<number>, pick: Imp[]) => { if (best && pick.length >= best.length) return; if (!left.size) { best = pick.slice(); return; } if (i >= rest.length) return; const m = [...left][0]; for (let j = 0; j < rest.length; j++) if (rest[j].covers.includes(m)) { const nl = new Set(left); rest[j].covers.forEach(x => nl.delete(x)); rec(j + 1 > 0 ? 0 : 0, nl, [...pick, rest[j]]); } }; rec(0, need, []); if (best) chosen.push(...(best as Imp[])); }
  return chosen;
}
export const implicantExpr = (imp: Imp, names: string[]) => { const t = imp.bits.split('').map((b, i) => (b === '1' ? names[i] : b === '0' ? names[i] + '′' : '')).join(''); return t || '1'; };
export const evalCover = (cover: Imp[], m: number, nv: number) => cover.some(imp => imp.bits.split('').every((b, i) => b === '-' || b === ((m >> (nv - 1 - i)) & 1).toString()));
const FUNCS: Record<string, { name: string; nv: number; ones: number[]; dc?: number[] }> = {
  maj3: { name: 'Majority of 3 (A,B,C)', nv: 3, ones: [3, 5, 6, 7] }, xor3: { name: 'Parity / XOR of 3', nv: 3, ones: [1, 2, 4, 7] }, adder: { name: 'Full-adder carry-out', nv: 3, ones: [3, 5, 6, 7] },
  seg: { name: '7-segment “a” (BCD, 4 vars, don’t-cares 10–15)', nv: 4, ones: [0, 2, 3, 5, 6, 7, 8, 9], dc: [10, 11, 12, 13, 14, 15] }, mux: { name: '2:1 multiplexer (S,A,B)', nv: 3, ones: [2, 3, 5, 7] }, prime4: { name: 'Prime numbers 0–15', nv: 4, ones: [2, 3, 5, 7, 11, 13] }, ex4: { name: 'F = Σm(0,1,2,5,6,7,8,9,10,14)', nv: 4, ones: [0, 1, 2, 5, 6, 7, 8, 9, 10, 14] }, eq2: { name: 'XNOR of 2', nv: 2, ones: [0, 3] },
};
export const GRAY = [0, 1, 3, 2];
const NAMES = ['A', 'B', 'C', 'D'];
interface KmS { t: number }
export const karnaughMinimiser = defineSim<KmS>({
  id: 'karnaugh_map_minimiser', title: 'Karnaugh Maps and Boolean Minimisation (Quine–McCluskey)',
  ...meta('Electronics', 'Intermediate', 'Digital Logic', 'Logic gates & Karnaugh maps', 'K-map grouping, prime implicants, essential implicants, don’t-care conditions, minimal SOP', [...UG_ENG, 'BCA', 'B.Sc', ...PG_ALL]),
  covers: ['Karnaugh map', 'K-map', 'Boolean minimisation', 'Prime implicants', 'Sum of products', 'Don’t-care conditions', 'Quine–McCluskey', 'Logic gates'],
  tags: ['kmap', 'karnaugh', 'boolean algebra', 'digital electronics', 'SOP', 'minterms', 'logic design', 'GATE', 'combinational logic', 'quine mccluskey', 'logic gates'],
  learningObjectives: ['Group adjacent ones on a Gray-coded map, including wrap-around groups.', 'Distinguish prime and essential prime implicants and use don’t-cares to simplify further.', 'Read off the minimal sum-of-products and its gate cost, verified against the truth table.'],
  assumptions: ['Sum-of-products minimisation for up to 4 variables; essential primes are taken first and the rest covered with an exact minimum search.'],
  blurb: 'Pick a function and the map fills in. Groups appear one by one with wrap-around, the minimal SOP is built term by term, and the result is verified against all input combinations.',
  hint: 'Try the 7-segment function: don’t-cares let groups grow bigger. Click Replay to see the grouping order.',
  params: [
    { kind: 'select', id: 'fn', label: 'Boolean function', value: 'seg', options: Object.entries(FUNCS).map(([k, f]) => ({ value: k, label: f.name })) },
    { kind: 'toggle', id: 'dc', label: 'Use don’t-care cells as ones', value: true },
    { kind: 'toggle', id: 'table', label: 'Show truth table', value: true },
    { kind: 'number', id: 'rate', label: 'Group reveal rate', min: 0.3, max: 3, step: 0.1, value: 0.8, unit: 'groups/s', digits: 1 },
  ],
  actions: [{ id: 'restart', label: 'Replay grouping' }],
  dt: 1 / 30, previewSeconds: 4,
  init() { return { t: 0 }; },
  action(s) { s.t = 0; },
  step(s, v, dt) { s.t += dt; void v; },
  draw(c, s, v, w, h) {
    bg(c, w, h); const f = FUNCS[v.fn as string], nv = f.nv, dc = v.dc ? f.dc ?? [] : [], cover = minimalCover(nv, f.ones, dc), A = R(8, 8, w * 0.58 - 12, h - 16), B = R(A.x + A.w + 8, 8, w - A.w - 24, h - 16); panel(c, A);
    const rowsN = nv === 2 ? 2 : nv === 3 ? 2 : 4, colsN = nv === 2 ? 2 : nv === 3 ? 4 : 4, cs = Math.min((A.w - 80) / colsN, (A.h - 130) / rowsN, 70), x0 = A.x + 60, y0 = A.y + 62;
    const rowVars = nv === 2 ? 1 : nv === 3 ? 1 : 2, colVars = nv - rowVars, rowCode = (r: number) => (rowVars === 2 ? GRAY[r] : r), colCode = (cc: number) => (colVars === 2 ? GRAY[cc] : cc);
    const cell = (r: number, cc: number) => (rowCode(r) << colVars) | colCode(cc);
    text(c, f.name, A.x + 10, A.y + 18, C.text, 12, 'left', 'alphabetic', true); text(c, `${NAMES.slice(0, rowVars).join('')} \\ ${NAMES.slice(rowVars, nv).join('')}`, x0 - 10, y0 - 30, C.dim, 11, 'right');
    for (let cc = 0; cc < colsN; cc++) text(c, colCode(cc).toString(2).padStart(colVars, '0'), x0 + cc * cs + cs / 2, y0 - 8, C.amber, 12, 'center', 'alphabetic', true);
    for (let r = 0; r < rowsN; r++) text(c, rowCode(r).toString(2).padStart(rowVars, '0'), x0 - 10, y0 + r * cs + cs / 2 + 4, C.amber, 12, 'right', 'alphabetic', true);
    const nshow = Math.floor(s.t * (v.rate as number)) % (cover.length + 2);
    for (let r = 0; r < rowsN; r++) for (let cc = 0; cc < colsN; cc++) { const m = cell(r, cc), one = f.ones.includes(m), isdc = (f.dc ?? []).includes(m); c.fillStyle = C.panel2; c.fillRect(x0 + cc * cs, y0 + r * cs, cs - 2, cs - 2); text(c, one ? '1' : isdc ? 'X' : '0', x0 + cc * cs + cs / 2, y0 + r * cs + cs / 2 + 6, one ? C.white : isdc ? C.purple : C.dim, 18, 'center', 'alphabetic', true); text(c, String(m), x0 + cc * cs + 4, y0 + r * cs + 11, 'rgba(148,163,184,0.7)', 9); }
    const cols = [C.green, C.pink, C.cyan, C.amber, C.purple, C.red, C.blue, C.lime];
    cover.forEach((imp, gi) => { if (gi >= nshow && nshow <= cover.length) return; const col = cols[gi % cols.length], set = new Set(imp.covers); for (let r = 0; r < rowsN; r++) for (let cc = 0; cc < colsN; cc++) { const m = cell(r, cc); if (!set.has(m)) continue; const px = x0 + cc * cs, py = y0 + r * cs; c.fillStyle = col.replace('#', '#') + '33'; c.globalAlpha = 0.25; c.fillStyle = col; c.fillRect(px + 3 + gi * 1.2, py + 3 + gi * 1.2, cs - 8 - gi * 2.4, cs - 8 - gi * 2.4); c.globalAlpha = 1; c.strokeStyle = col; c.lineWidth = 2; c.strokeRect(px + 3 + gi * 1.2, py + 3 + gi * 1.2, cs - 8 - gi * 2.4, cs - 8 - gi * 2.4); } });
    const shown = cover.slice(0, nshow > cover.length ? cover.length : nshow);
    const expr = (nshow >= cover.length ? cover : shown).map(i => implicantExpr(i, NAMES)).join(' + ') || '0';
    text(c, `F = ${nshow >= cover.length ? expr : shown.length ? expr + ' + …' : '…'}`, A.x + 10, A.y + A.h - 40, C.green, 14, 'left', 'alphabetic', true); text(c, `${cover.length} product term(s), ${cover.reduce((a, i) => a + i.bits.replace(/-/g, '').length, 0)} literals`, A.x + 10, A.y + A.h - 18, C.dim, 11);
    // truth table
    panel(c, B); if (v.table) { text(c, `Truth table ${NAMES.slice(0, nv).join('')} | F`, B.x + 10, B.y + 16, C.text, 11, 'left', 'alphabetic', true); const n = 1 << nv, rh = Math.min(16, (B.h - 40) / n); for (let m = 0; m < n; m++) { const one = f.ones.includes(m), isdc = (f.dc ?? []).includes(m), y = B.y + 30 + m * rh; c.fillStyle = m % 2 ? 'rgba(30,41,59,0.6)' : 'rgba(15,23,42,0.6)'; c.fillRect(B.x + 6, y, B.w - 12, rh - 1); text(c, `${m.toString(2).padStart(nv, '0')}  |  ${one ? '1' : isdc ? 'X' : '0'}`, B.x + 16, y + rh * 0.75, one ? C.green : isdc ? C.purple : C.dim, Math.min(12, rh - 3), 'left', 'alphabetic', one); } }
  },
  readouts(s, v) {
    const f = FUNCS[v.fn as string], dc = v.dc ? f.dc ?? [] : [], primes = primeImplicants(f.nv, f.ones, dc), cover = minimalCover(f.nv, f.ones, dc); let ok = true; for (let m = 0; m < 1 << f.nv; m++) { const want = f.ones.includes(m), dcm = (f.dc ?? []).includes(m); const got = evalCover(cover, m, f.nv); if (!dcm && want !== got) ok = false; if (dcm && !v.dc && got && !want) ok = false; }
    return [{ label: 'Variables / minterms', value: `${f.nv} / ${f.ones.length}` }, { label: 'Don’t-care cells', value: (f.dc ?? []).length, digits: 0 }, { label: 'Prime implicants found', value: primes.length, digits: 0 }, { label: 'Terms in minimal SOP', value: cover.length, digits: 0 }, { label: 'Minimal SOP', value: cover.map(i => implicantExpr(i, NAMES)).join(' + ') || '0' }, { label: 'Verified against truth table', value: ok ? 'yes — all inputs match' : 'MISMATCH' }];
  },
  equations(s, v) { const f = FUNCS[v.fn as string], cover = minimalCover(f.nv, f.ones, v.dc ? f.dc ?? [] : []); return [`F=\\sum m(${f.ones.join(',')})${(f.dc ?? []).length ? `+d(${(f.dc ?? []).join(',')})` : ''}`, `F_{\\min}=${cover.map(i => implicantExpr(i, NAMES).replace(/′/g, "'")).join('+') || '0'}`, 'AB+A\\bar B=A,\\quad A+\\bar AB=A+B\\ \\ (\\text{adjacency rule})']; },
});
export type { EducationLevel };
void TAU; void UG_SCI;
