import { defineSim, num, str, bool, PG_ALL, UG_ENG, UG_SCI } from './types';
import type { EducationLevel, Difficulty, SimSubject } from './types';
import { C, TAU, circle, clamp, fmt, line, panel, plot, polyline, text, deg, rad } from './draw';

const meta = (subject: SimSubject, levels: EducationLevel[], difficulty: Difficulty, category: string, topic: string, subtopic: string) => ({
  subject, status: 'active' as const, educationLevels: levels, difficulty, category, topic, subtopic,
});
const LV: EducationLevel[] = [...UG_SCI, ...PG_ALL];

/* ---------- Bragg diffraction ---------- */
interface BrS { t: number }
export const bragg = defineSim<BrS>({
  id: 'bragg_diffraction', title: "Bragg's Law: X-ray Diffraction from Crystal Planes",
  ...meta('Materials', LV, 'Intermediate', 'Solid State', 'X-ray Diffraction', "Bragg's law and diffraction peaks"),
  covers: ["Bragg's law", 'X-ray diffraction', 'Interplanar spacing', 'Constructive interference', 'Powder XRD peaks'],
  tags: ['B.Sc', 'M.Sc', 'physics', 'materials science', 'XRD', 'crystallography', 'GATE'],
  learningObjectives: ['Find the angles where reflections from parallel planes add in phase.', 'Relate peak position to plane spacing d and wavelength λ.', 'Index cubic peaks using d = a/√(h²+k²+l²).'],
  assumptions: ['Cubic lattice, simple kinematic scattering; relative intensities not computed (peak heights are illustrative equal).'],
  blurb: 'Rotate the incident angle θ and see when X-rays reflected from successive atomic planes arrive in step. The detector trace shows peaks exactly at 2d sinθ = nλ.',
  hint: 'Path difference between adjacent planes = 2d sinθ. Constructive when it equals nλ. For a cubic crystal d(hkl)=a/√(h²+k²+l²).',
  params: [
    { kind: 'number', id: 'lam', label: 'Wavelength λ', min: 0.5, max: 2.5, step: 0.01, value: 1.54, unit: 'Å', digits: 2 },
    { kind: 'number', id: 'a', label: 'Lattice constant a', min: 2, max: 6, step: 0.05, value: 4.05, unit: 'Å', digits: 2 },
    { kind: 'select', id: 'hkl', label: 'Plane family (hkl)', value: '111', options: [{ value: '100', label: '(100)' }, { value: '110', label: '(110)' }, { value: '111', label: '(111)' }, { value: '200', label: '(200)' }, { value: '220', label: '(220)' }] },
    { kind: 'number', id: 'th', label: 'Incident angle θ', min: 5, max: 85, step: 0.1, value: 19, unit: '°', digits: 1 },
  ],
  dt: 1 / 30, previewSeconds: 1, init() { return { t: 0 }; }, step(s, _v, dt) { s.t += dt; },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const lam = num(v, 'lam'), a = num(v, 'a'), hkl = str(v, 'hkl'), N = [...hkl].reduce((q, ch) => q + Number(ch) ** 2, 0), d = a / Math.sqrt(N), th = rad(num(v, 'th'));
    const L = { x: 8, y: 8, w: w * 0.5 - 12, h: h - 16 }; panel(c, L); const gap = Math.min(L.h / 6, 36 + d * 8);
    const x0 = L.x + 20, x1 = L.x + L.w - 20, cy = L.y + L.h * 0.55;
    for (let i = 0; i < 4; i++) { const y = cy + i * gap; line(c, x0, y, x1, y, C.dim, 1.5); for (let k = 0; k < 8; k++) circle(c, x0 + 14 + (k * (x1 - x0 - 28)) / 7, y, 4, C.cyan); }
    const hit = (i: number): [number, number] => [(x0 + x1) / 2 - i * gap / Math.tan(th) * 0.0 + (i * gap) / Math.tan(th) * 0.5, cy + i * gap];
    for (let i = 0; i < 2; i++) { const [hx, hy] = hit(i), len = 80; line(c, hx - len * Math.cos(th), hy - len * Math.sin(th), hx, hy, C.amber, 2); line(c, hx, hy, hx + len * Math.cos(th), hy - len * Math.sin(th), C.green, 2); }
    const delta = 2 * d * Math.sin(th), n = delta / lam, near = Math.abs(n - Math.round(n)) < 0.04 && Math.round(n) >= 1;
    text(c, `2d sinθ = ${fmt(delta, 3)} Å = ${fmt(n, 2)} λ`, L.x + 10, L.y + 18, near ? C.green : C.text, 12, 'left', 'alphabetic', true);
    text(c, near ? 'IN PHASE — Bragg peak' : 'partly out of phase', L.x + 10, L.y + 36, near ? C.green : C.dim, 11);
    const R = { x: w * 0.5 + 4, y: 8, w: w * 0.5 - 12, h: h - 16 }; const m = plot(c, R, [5, 85], [0, 1.15], { title: 'Detector intensity vs θ', xlabel: 'θ (°)', ystep: 0.5 });
    const pts: [number, number][] = [];
    for (let t = 5; t <= 85; t += 0.25) { const x = 2 * d * Math.sin(rad(t)) / lam; const dev = x - Math.round(x); const I = Math.round(x) >= 1 ? Math.exp(-(dev * dev) / (2 * 0.02 ** 2)) : 0; pts.push([m.X(t), m.Y(I)]); }
    polyline(c, pts, C.cyan, 2); line(c, m.X(num(v, 'th')), R.y + 24, m.X(num(v, 'th')), R.y + R.h - 28, C.amber, 1.5);
  },
  readouts(_s, v) { const lam = num(v, 'lam'), a = num(v, 'a'), N = [...str(v, 'hkl')].reduce((q, ch) => q + Number(ch) ** 2, 0), d = a / Math.sqrt(N); const out: { label: string; value: number | string; unit?: string; digits?: number }[] = [{ label: 'd spacing', value: d, unit: 'Å', digits: 3 }, { label: 'Path difference 2d sinθ', value: 2 * d * Math.sin(rad(num(v, 'th'))), unit: 'Å', digits: 3 }]; for (let n = 1; n <= 3; n++) { const s = (n * lam) / (2 * d); out.push({ label: `Peak order n=${n}`, value: s <= 1 ? deg(Math.asin(s)) : 'no reflection', unit: s <= 1 ? '° (θ)' : '', digits: 2 }); } return out; },
  equations(_s, v) { const a = num(v, 'a'), N = [...str(v, 'hkl')].reduce((q, ch) => q + Number(ch) ** 2, 0); return ['2d\\sin\\theta = n\\lambda', `d_{hkl} = \\dfrac{a}{\\sqrt{h^2+k^2+l^2}} = ${fmt(a / Math.sqrt(N), 3)}\\ \\text{Å}`]; },
});

/* ---------- Stress-strain ---------- */
interface SsS { t: number; strain: number }
const MATS: Record<string, { n: string; E: number; sy: number; su: number; eu: number; ef: number; ductile: boolean }> = {
  steel: { n: 'Mild steel', E: 200, sy: 250, su: 400, eu: 0.18, ef: 0.28, ductile: true },
  alu: { n: 'Aluminium alloy', E: 70, sy: 275, su: 310, eu: 0.1, ef: 0.15, ductile: true },
  cast: { n: 'Cast iron (brittle)', E: 100, sy: 200, su: 200, eu: 0.006, ef: 0.006, ductile: false },
  cu: { n: 'Copper (annealed)', E: 120, sy: 70, su: 220, eu: 0.35, ef: 0.45, ductile: true },
};
function sigma(m: (typeof MATS)[string], e: number) { const ey = m.sy / (m.E * 1000); if (e <= ey) return m.E * 1000 * e; if (!m.ductile) return Math.min(m.E * 1000 * e, m.su);
  if (e < ey * 12 && m.sy < m.su) { const t = (e - ey) / (ey * 11); return m.sy + 0.01 * (m.su - m.sy) * t; }
  const e0 = ey * 12; if (e <= m.eu) { const t = (e - e0) / Math.max(m.eu - e0, 1e-9); return m.sy + 0.01 * (m.su - m.sy) + (m.su - m.sy - 0.01 * (m.su - m.sy)) * (1 - (1 - t) ** 2); }
  const t = (e - m.eu) / Math.max(m.ef - m.eu, 1e-9); return m.su * (1 - 0.35 * t * t); }
export const stressStrain = defineSim<SsS>({
  id: 'stress_strain_tensile', title: 'Tensile Test: Stress–Strain Curve, Yield, UTS and Necking',
  ...meta('Materials', [...UG_ENG, 'B.Sc', ...PG_ALL], 'Intermediate', 'Mechanical Behaviour', 'Mechanical Properties', "Elastic/plastic behaviour, Young's modulus, ductility"),
  covers: ["Young's modulus", 'Yield strength', 'Ultimate tensile strength', 'Ductile vs brittle', 'Elastic recovery', 'Toughness'],
  tags: ['B.Tech', 'mechanical', 'civil', 'materials', 'GATE', 'tensile test', 'proof stress'],
  learningObjectives: ['Read E, σy, σu and ductility off a curve.', 'See elastic recovery on unloading versus permanent plastic strain.', 'Compare ductile and brittle materials.'],
  assumptions: ['Idealised engineering stress–strain curve built from typical handbook values; not a measured data set.'],
  blurb: 'Pull a specimen in a virtual tensile machine. A marker travels along the curve and the specimen stretches, necks and breaks; unload part way to see the elastic recovery line.',
  hint: 'Linear elastic σ=Eε up to yield; plastic strain hardening to UTS; then necking and fracture (ductile). Unloading follows a line of slope E leaving permanent set.',
  params: [
    { kind: 'select', id: 'mat', label: 'Material', value: 'steel', options: Object.entries(MATS).map(([k, o]) => ({ value: k, label: o.n })), resetOnChange: true },
    { kind: 'number', id: 'rate', label: 'Loading speed', min: 0.2, max: 4, step: 0.1, value: 1.5, digits: 1 },
    { kind: 'toggle', id: 'unload', label: 'Show unloading line from current point', value: false },
  ],
  actions: [{ id: 'restart', label: 'New specimen' }],
  dt: 1 / 60, previewSeconds: 4,
  init() { return { t: 0, strain: 0 }; }, action(s) { s.strain = 0; },
  step(s, v, dt) { const m = MATS[str(v, 'mat')]; if (s.strain < m.ef) s.strain += m.ef * 0.1 * num(v, 'rate') * dt; else s.strain = m.ef + 1e-9; s.t += dt; },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const m = MATS[str(v, 'mat')], e = Math.min(s.strain, m.ef), sg = sigma(m, e), broke = s.strain >= m.ef;
    const R = { x: 8, y: 8, w: w * 0.68, h: h - 16 }; const mp = plot(c, R, [0, m.ef * 1.08], [0, m.su * 1.2], { title: 'Engineering stress σ (MPa) vs strain ε', xlabel: 'strain ε', ystep: Math.round(m.su / 4 / 50) * 50 || 50 });
    const pts: [number, number][] = []; for (let k = 0; k <= 300; k++) { const ee = (k / 300) * m.ef; pts.push([mp.X(ee), mp.Y(sigma(m, ee))]); } polyline(c, pts, C.dim, 1.6, [3, 3]);
    const run: [number, number][] = []; for (let k = 0; k <= 300; k++) { const ee = (k / 300) * e; run.push([mp.X(ee), mp.Y(sigma(m, ee))]); } polyline(c, run, C.cyan, 2.8);
    if (bool(v, 'unload')) { const ep = e - sg / (m.E * 1000); line(c, mp.X(e), mp.Y(sg), mp.X(Math.max(ep, 0)), mp.Y(0), C.green, 2); circle(c, mp.X(Math.max(ep, 0)), mp.Y(0), 4, C.green); }
    circle(c, mp.X(e), mp.Y(sg), 6, broke ? C.red : C.amber, C.white, 1.5);
    const ey = m.sy / (m.E * 1000); circle(c, mp.X(ey), mp.Y(m.sy), 4, C.purple); text(c, 'yield', mp.X(ey) + 8, mp.Y(m.sy) + 14, C.purple, 10);
    const peakE = m.ductile ? m.eu : m.ef; circle(c, mp.X(peakE), mp.Y(m.su), 4, C.pink); text(c, 'UTS', mp.X(peakE) - 8, mp.Y(m.su) - 8, C.pink, 10, 'right');
    const S = { x: w * 0.7 + 12, y: 8, w: w * 0.3 - 20, h: h - 16 }; panel(c, S); const cx = S.x + S.w / 2, topY = S.y + 20, botY = S.y + S.h - 20, L0 = (botY - topY) * 0.7, stretch = 1 + e * 2.5; const L = Math.min(L0 * stretch, botY - topY - 10), neck = m.ductile && e > m.eu ? (e - m.eu) / (m.ef - m.eu) : 0;
    c.fillStyle = '#475569'; c.fillRect(cx - 24, topY - 14, 48, 12); c.fillRect(cx - 24, topY + L + 2, 48, 12); const wd = 14 * (1 - 0.12 * Math.min(e / m.ef, 1)); c.beginPath();
    if (broke) { c.fillStyle = C.cyan; c.fillRect(cx - wd, topY, wd * 2, L * 0.46); c.fillRect(cx - wd, topY + L * 0.54 + 12, wd * 2, L * 0.46 - 12); } else { c.moveTo(cx - wd, topY); c.lineTo(cx - wd * (1 - 0.6 * neck), topY + L / 2); c.lineTo(cx - wd, topY + L); c.lineTo(cx + wd, topY + L); c.lineTo(cx + wd * (1 - 0.6 * neck), topY + L / 2); c.lineTo(cx + wd, topY); c.closePath(); c.fillStyle = C.cyan; c.fill(); }
    text(c, broke ? 'FRACTURED' : 'loading…', cx, S.y + S.h - 4, broke ? C.red : C.dim, 10, 'center');
  },
  readouts(s, v) { const m = MATS[str(v, 'mat')], e = Math.min(s.strain, m.ef), sg = sigma(m, e); return [{ label: 'Strain ε', value: e, digits: 4 }, { label: 'Stress σ', value: sg, unit: 'MPa', digits: 0 }, { label: "Young's modulus E", value: m.E, unit: 'GPa', digits: 0 }, { label: 'Yield strength', value: m.sy, unit: 'MPa', digits: 0 }, { label: 'Ultimate strength', value: m.su, unit: 'MPa', digits: 0 }, { label: 'Elongation at fracture', value: m.ef * 100, unit: '%', digits: 1 }, { label: 'Behaviour', value: m.ductile ? 'ductile' : 'brittle' }]; },
  equations(_s, v) { const m = MATS[str(v, 'mat')]; return ['\\sigma = E\\varepsilon\\ \\ (\\sigma<\\sigma_y)', `E = ${m.E}\\ \\text{GPa},\\ \\sigma_y = ${m.sy}\\ \\text{MPa}`]; },
});

/* ---------- Lever rule phase diagram (isomorphous Cu-Ni style) ---------- */
interface PhS { dummy: number }
const Tm = [1085, 1455]; // Cu, Ni melting (°C)
const liq = (x: number) => Tm[0] + (Tm[1] - Tm[0]) * (0.55 * x + 0.45 * x ** 0.6);
const solidus = (x: number) => Tm[0] + (Tm[1] - Tm[0]) * (0.35 * x + 0.65 * x ** 2.2);
function compAt(T: number, x0: number): { fL: number; xL: number; xS: number; region: string } {
  const invL = (t: number) => { let lo = 0, hi = 1; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (liq(mid) < t) lo = mid; else hi = mid; } return lo; };
  const invS = (t: number) => { let lo = 0, hi = 1; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (solidus(mid) < t) lo = mid; else hi = mid; } return lo; };
  if (T >= liq(x0)) return { fL: 1, xL: x0, xS: 0, region: 'Liquid' }; if (T <= solidus(x0)) return { fL: 0, xL: 0, xS: x0, region: 'Solid α' };
  const xL = invL(T), xS = invS(T); const fL = clamp((xS - x0) / (xS - xL), 0, 1); return { fL, xL, xS, region: 'L + α' };
}
export const leverRule = defineSim<PhS>({
  id: 'phase_diagram_lever', title: 'Binary Phase Diagram: Tie Line & Lever Rule (Isomorphous Alloy)',
  ...meta('Materials', [...UG_ENG, 'B.Sc', ...PG_ALL], 'Intermediate', 'Phase Equilibria', 'Phase Diagrams', 'Tie lines, phase compositions and fractions'),
  covers: ['Lever rule', 'Tie line', 'Liquidus and solidus', 'Isomorphous system', 'Phase fraction'],
  tags: ['B.Tech', 'metallurgy', 'Cu-Ni', 'materials', 'GATE', 'equilibrium cooling'],
  learningObjectives: ['Read liquid and solid compositions from a tie line.', 'Compute phase fractions with the lever rule.', 'Follow an alloy as it cools through the two-phase region.'],
  assumptions: ['Qualitative Cu–Ni–like diagram with smooth model liquidus/solidus curves (not exact experimental data); equilibrium cooling.'],
  blurb: 'Choose an alloy composition and temperature. The tie line gives the compositions of the liquid and solid phases and the lever rule gives how much of each is present.',
  hint: 'Within L+α, draw horizontal tie line; W_L = (C_α − C0)/(C_α − C_L), W_α = (C0 − C_L)/(C_α − C_L). Both curves meet at pure-component melting points.',
  params: [
    { kind: 'number', id: 'x0', label: 'Alloy composition (wt fraction Ni)', min: 0.05, max: 0.95, step: 0.01, value: 0.4, digits: 2 },
    { kind: 'number', id: 'T', label: 'Temperature', min: 1050, max: 1480, step: 1, value: 1200, unit: '°C', digits: 0 },
  ],
  dt: 1 / 20, previewSeconds: 1, init() { return { dummy: 0 }; }, step() {},
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const x0 = num(v, 'x0'), T = num(v, 'T'), r = compAt(T, x0), R = { x: 8, y: 8, w: w * 0.62, h: h - 16 };
    const m = plot(c, R, [0, 1], [1050, 1480], { title: 'T (°C) vs composition (fraction Ni)', xlabel: 'fraction Ni', ystep: 100 });
    const L: [number, number][] = [], S: [number, number][] = []; for (let k = 0; k <= 60; k++) { const x = k / 60; L.push([m.X(x), m.Y(liq(x))]); S.push([m.X(x), m.Y(solidus(x))]); } polyline(c, L, C.red, 2.4); polyline(c, S, C.blue, 2.4);
    text(c, 'Liquid', m.X(0.2), m.Y(1420), C.red, 12); text(c, 'α solid', m.X(0.78), m.Y(1120), C.blue, 12); line(c, m.X(x0), m.Y(1050), m.X(x0), m.Y(1480), C.dim, 1, [3, 3]);
    if (r.region === 'L + α') { line(c, m.X(r.xL), m.Y(T), m.X(r.xS), m.Y(T), C.amber, 3); circle(c, m.X(r.xL), m.Y(T), 4, C.red); circle(c, m.X(r.xS), m.Y(T), 4, C.blue); }
    circle(c, m.X(x0), m.Y(T), 6, C.amber, C.white, 1.5);
    const B = { x: w * 0.62 + 20, y: 8, w: w * 0.38 - 28, h: h - 16 }; panel(c, B); text(c, r.region, B.x + 10, B.y + 22, C.amber, 14, 'left', 'alphabetic', true);
    const bar = (y: number, label: string, f: number, col: string) => { text(c, `${label} ${fmt(f * 100, 1)} %`, B.x + 10, y, col, 11); c.fillStyle = '#1e293b'; c.fillRect(B.x + 10, y + 6, B.w - 20, 12); c.fillStyle = col; c.fillRect(B.x + 10, y + 6, (B.w - 20) * f, 12); };
    bar(B.y + 56, 'liquid', r.fL, C.red); bar(B.y + 98, 'α solid', 1 - r.fL, C.blue);
  },
  readouts(_s, v) { const x0 = num(v, 'x0'), r = compAt(num(v, 'T'), x0); return [{ label: 'Region', value: r.region }, { label: 'Liquidus T at C0', value: liq(x0), unit: '°C', digits: 0 }, { label: 'Solidus T at C0', value: solidus(x0), unit: '°C', digits: 0 }, { label: 'Fraction liquid', value: r.fL * 100, unit: '%', digits: 1 }, { label: 'Fraction solid', value: (1 - r.fL) * 100, unit: '%', digits: 1 }, { label: 'C_L (liquid)', value: r.region === 'L + α' ? r.xL : r.region === 'Liquid' ? x0 : '-', digits: 3 }, { label: 'C_α (solid)', value: r.region === 'L + α' ? r.xS : r.region === 'Solid α' ? x0 : '-', digits: 3 }]; },
  equations() { return ['W_L = \\dfrac{C_\\alpha - C_0}{C_\\alpha - C_L}', 'W_\\alpha = \\dfrac{C_0 - C_L}{C_\\alpha - C_L}']; },
});

/* ---------- Fick's diffusion ---------- */
interface FkS { t: number }
const erfc = (x: number) => { const z = Math.abs(x), t = 1 / (1 + 0.3275911 * z), y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-z * z); return x >= 0 ? y : 2 - y; };
export const fickDiffusion = defineSim<FkS>({
  id: 'fick_diffusion_carburising', title: "Fick's Second Law: Diffusion Profile (Carburising / Doping)",
  ...meta('Materials', [...UG_ENG, 'B.Sc', ...PG_ALL], 'Advanced', 'Transport in Solids', 'Diffusion', 'Semi-infinite solid with constant surface concentration'),
  covers: ["Fick's second law", 'Diffusion coefficient', 'Arrhenius temperature dependence', 'Error-function solution', 'Case depth'],
  tags: ['B.Tech', 'M.Tech', 'metallurgy', 'semiconductor doping', 'carburising', 'GATE', 'erfc'],
  learningObjectives: ['See concentration profiles broaden as √(Dt).', 'Understand why diffusion speeds up exponentially with temperature.', 'Estimate case depth at a target concentration.'],
  assumptions: ['Constant D, constant surface concentration, semi-infinite medium; D0 and Q typical for carbon in γ-iron (D0 = 2.3×10⁻⁵ m²/s, Q = 148 kJ/mol).'],
  blurb: 'A surface held at fixed carbon content diffuses into steel. Change the temperature and time to see how deep the carbon penetrates and where it reaches a chosen hardness threshold.',
  hint: 'C(x,t) = Cs − (Cs−C0)·erf(x/2√(Dt)), D = D0 exp(−Q/RT). Depth for fixed C scales as √(Dt).',
  params: [
    { kind: 'number', id: 'T', label: 'Temperature', min: 800, max: 1100, step: 5, value: 930, unit: '°C', digits: 0 },
    { kind: 'number', id: 'time', label: 'Time', min: 0.1, max: 24, step: 0.1, value: 6, unit: 'h', digits: 1 },
    { kind: 'number', id: 'cs', label: 'Surface carbon Cs', min: 0.6, max: 1.4, step: 0.05, value: 1.0, unit: 'wt%', digits: 2 },
    { kind: 'number', id: 'ct', label: 'Threshold carbon', min: 0.2, max: 0.8, step: 0.01, value: 0.4, unit: 'wt%', digits: 2 },
  ],
  dt: 1 / 20, previewSeconds: 1, init() { return { t: 0 }; }, step(s, _v, dt) { s.t += dt; },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const T = num(v, 'T') + 273.15, tt = num(v, 'time') * 3600, Cs = num(v, 'cs'), C0 = 0.1, Ct = num(v, 'ct'), D = 2.3e-5 * Math.exp(-148000 / (8.314 * T)), dep = (cc: number) => { const q = (Cs - cc) / (Cs - C0); let lo = 0, hi = 4; for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (1 - erfc(mid) > q) hi = mid; else lo = mid; } return 2 * Math.sqrt(D * tt) * lo; };
    const xmax = 4e-3, R = { x: 8, y: 8, w: w - 16, h: h * 0.7 }; const m = plot(c, R, [0, xmax * 1000], [0, 1.5], { title: 'Carbon concentration vs depth', xlabel: 'depth x (mm)', ystep: 0.5 });
    for (const k of [0.25, 0.5, 1]) { const pts: [number, number][] = []; for (let i = 0; i <= 100; i++) { const x = (i / 100) * xmax; pts.push([m.X(x * 1000), m.Y(Cs - (Cs - C0) * (1 - erfc(x / (2 * Math.sqrt(D * tt * k)))))]); } polyline(c, pts, k === 1 ? C.cyan : 'rgba(96,165,250,0.35)', k === 1 ? 3 : 1.4); }
    line(c, R.x + 30, m.Y(Ct), R.x + R.w - 10, m.Y(Ct), C.amber, 1.2, [4, 3]); const dd = dep(Ct); if (dd < xmax) { circle(c, m.X(dd * 1000), m.Y(Ct), 5, C.amber, C.white, 1.5); text(c, `case depth ${fmt(dd * 1000, 2)} mm`, m.X(dd * 1000) + 8, m.Y(Ct) - 8, C.amber, 11); }
    text(c, 'faint curves: ¼ t and ½ t', R.x + R.w - 12, R.y + 36, C.dim, 10, 'right');
    const B = { x: 8, y: R.y + R.h + 12, w: w - 16, h: h - R.h - 28 }; panel(c, B); for (let i = 0; i < 70; i++) { const x = (i / 70) * (B.w - 8) + B.x + 4, d0 = (i / 70) * xmax, C = Cs - (Cs - C0) * (1 - erfc(d0 / (2 * Math.sqrt(D * tt)))); c.fillStyle = `rgba(251,191,36,${clamp(C / Cs, 0, 1)})`; c.fillRect(x, B.y + 6, (B.w - 8) / 70 + 1, B.h - 12); }
  },
  readouts(_s, v) { const T = num(v, 'T') + 273.15, tt = num(v, 'time') * 3600, D = 2.3e-5 * Math.exp(-148000 / (8.314 * T)), Cs = num(v, 'cs'), Ct = num(v, 'ct'); const q = (Cs - Ct) / (Cs - 0.1); let lo = 0, hi = 4; for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (1 - erfc(mid) > q) hi = mid; else lo = mid; } return [{ label: 'Diffusion coefficient D', value: D * 1e12, unit: '×10⁻¹² m²/s', digits: 2 }, { label: 'Diffusion length 2√(Dt)', value: 2 * Math.sqrt(D * tt) * 1000, unit: 'mm', digits: 3 }, { label: 'Depth at threshold', value: 2 * Math.sqrt(D * tt) * lo * 1000, unit: 'mm', digits: 3 }, { label: 'Time to double depth', value: num(v, 'time') * 4, unit: 'h', digits: 1 }]; },
  equations(_s, v) { const T = num(v, 'T') + 273.15, D = 2.3e-5 * Math.exp(-148000 / (8.314 * T)); return ['C(x,t) = C_s - (C_s - C_0)\\,\\text{erf}\\!\\left(\\dfrac{x}{2\\sqrt{Dt}}\\right)', `D = D_0 e^{-Q/RT} = ${(D * 1e12).toFixed(2)}\\times10^{-12}\\ \\text{m}^2/\\text{s}`]; },
});

/* ---------- Kronig-Penney ---------- */
interface KpS { t: number }
export const kronigPenney = defineSim<KpS>({
  id: 'kronig_penney_bands', title: 'Kronig–Penney Model: Energy Bands and Band Gaps',
  ...meta('Quantum', [...UG_SCI, ...PG_ALL], 'Advanced', 'Solid State Physics', 'Band Theory of Solids', 'Periodic potential, allowed bands and gaps'),
  covers: ['Kronig–Penney model', 'Energy bands', 'Band gap', "Bloch's theorem", 'Conductor vs insulator'],
  tags: ['B.Sc', 'M.Sc', 'M.Tech', 'solid state', 'semiconductor', 'GATE', 'periodic potential'],
  learningObjectives: ['See how a periodic potential creates allowed and forbidden energy regions.', 'Understand that stronger barriers give wider gaps and narrower bands.', 'Connect band structure to conduction.'],
  assumptions: ['Dirac-comb limit of the Kronig–Penney model; dimensionless units with ħ²/2m = 1 and period a = 1.'],
  blurb: 'The electron in a crystal sees a periodic array of atoms. Increase the barrier strength P and the allowed energy bands (where |cos ka| ≤ 1) shrink and gaps open up.',
  hint: 'cos(ka) = cos(αa) + P·sin(αa)/(αa), α = √E (units ħ²/2m=1, a=1). Allowed where right side lies in [−1, 1].',
  params: [
    { kind: 'number', id: 'P', label: 'Barrier strength P', min: 0, max: 20, step: 0.1, value: 6, digits: 1 },
    { kind: 'number', id: 'Emax', label: 'Energy range', min: 20, max: 200, step: 5, value: 100, digits: 0 },
  ],
  dt: 1 / 20, previewSeconds: 1, init() { return { t: 0 }; }, step(s, _v, dt) { s.t += dt; },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const P = num(v, 'P'), Em = num(v, 'Emax'); const f = (E: number) => { const a = Math.sqrt(E); return a < 1e-6 ? 1 + P : Math.cos(a) + (P * Math.sin(a)) / a; };
    const R1 = { x: 8, y: 8, w: w * 0.5 - 12, h: h - 16 }; const m1 = plot(c, R1, [0, Em], [-3, 3], { title: 'f(E) = cos αa + P sin αa/αa', xlabel: 'E', ystep: 1 });
    const pts: [number, number][] = []; for (let i = 0; i <= 400; i++) { const E = (i / 400) * Em; pts.push([m1.X(E), m1.Y(clamp(f(E), -3, 3))]); } polyline(c, pts, C.cyan, 2);
    c.fillStyle = 'rgba(52,211,153,0.15)'; let inB = false, st = 0; const bands: [number, number][] = []; for (let i = 0; i <= 800; i++) { const E = (i / 800) * Em, ok = Math.abs(f(E)) <= 1; if (ok && !inB) { st = E; inB = true; } if (!ok && inB) { bands.push([st, E]); inB = false; } } if (inB) bands.push([st, Em]);
    for (const [a, b] of bands) c.fillRect(m1.X(a), R1.y + 24, m1.X(b) - m1.X(a), R1.h - 52);
    const R2 = { x: w * 0.5 + 4, y: 8, w: w * 0.5 - 12, h: h - 16 }; const m2 = plot(c, R2, [-Math.PI, Math.PI], [0, Em], { title: 'E(k) band structure', xlabel: 'k a', ystep: Em / 4 });
    const branch: [number, number][][] = [[], []]; for (let i = 0; i <= 1600; i++) { const E = (i / 1600) * Em, fv = f(E); if (Math.abs(fv) <= 1) { const k = Math.acos(fv); branch[0].push([m2.X(k), m2.Y(E)]); branch[1].push([m2.X(-k), m2.Y(E)]); } }
    for (const b of branch) for (const p of b) circle(c, p[0], p[1], 1.3, C.green);
  },
  readouts(_s, v) { const P = num(v, 'P'), Em = num(v, 'Emax'), f = (E: number) => { const a = Math.sqrt(E); return a < 1e-6 ? 1 + P : Math.cos(a) + (P * Math.sin(a)) / a; }; const bands: [number, number][] = []; let inB = false, st = 0; for (let i = 0; i <= 4000; i++) { const E = (i / 4000) * Em, ok = Math.abs(f(E)) <= 1; if (ok && !inB) { st = E; inB = true; } if (!ok && inB) { bands.push([st, E]); inB = false; } } if (inB) bands.push([st, Em]);
    const out: { label: string; value: number | string; digits?: number }[] = [{ label: 'Allowed bands in range', value: bands.length, digits: 0 }]; bands.slice(0, 2).forEach((b, i) => out.push({ label: `Band ${i + 1} width`, value: b[1] - b[0], digits: 2 })); if (bands.length >= 2) out.push({ label: 'Gap 1→2', value: bands[1][0] - bands[0][1], digits: 2 }); else out.push({ label: 'Gap 1→2', value: 'none in range' }); return out; },
  equations(_s, v) { return ['\\cos ka = \\cos\\alpha a + P\\dfrac{\\sin\\alpha a}{\\alpha a}', `P = ${fmt(num(v, 'P'), 1)},\\ \\alpha = \\sqrt{E}`]; },
});

/* ---------- p-n junction ---------- */
interface PnS { t: number }
export const pnJunction = defineSim<PnS>({
  id: 'pn_junction_depletion', title: 'p–n Junction: Depletion Region, Built-in Potential and Bias',
  ...meta('Electronics', [...UG_ENG, 'B.Sc', ...PG_ALL], 'Intermediate', 'Semiconductor Devices', 'p-n Junction', 'Depletion width, electric field and I–V'),
  covers: ['Depletion region', 'Built-in potential', 'Forward and reverse bias', 'Diode equation', 'Junction electric field'],
  tags: ['B.Tech', 'B.Sc', 'ECE', 'diode', 'GATE', 'semiconductor', 'Shockley equation'],
  learningObjectives: ['See the depletion region shrink in forward and grow in reverse bias.', 'Relate doping to depletion width and peak field.', 'Connect to the exponential diode I–V curve.'],
  assumptions: ['Abrupt junction, depletion approximation, silicon (εr = 11.7, ni = 1.0×10¹⁰ cm⁻³), T = 300 K; low-level injection.'],
  blurb: 'Adjust doping and apply forward or reverse voltage. The charge, field and potential profiles update with the exact depletion-approximation formulas and the diode current is shown on its I–V curve.',
  hint: 'V_bi = (kT/q) ln(NaNd/ni²). W = √(2ε(Vbi−V)/q · (1/Na+1/Nd)). Emax = qNaxp/ε. I = Is(e^{V/Vt}−1).',
  params: [
    { kind: 'number', id: 'na', label: 'Acceptor doping log₁₀Nₐ (cm⁻³)', min: 15, max: 18, step: 0.1, value: 17, digits: 1 },
    { kind: 'number', id: 'nd', label: 'Donor doping log₁₀N_d (cm⁻³)', min: 15, max: 18, step: 0.1, value: 16, digits: 1 },
    { kind: 'number', id: 'V', label: 'Applied bias V', min: -10, max: 0.65, step: 0.01, value: 0, unit: 'V', digits: 2 },
  ],
  dt: 1 / 20, previewSeconds: 1, init() { return { t: 0 }; }, step(s, _v, dt) { s.t += dt; },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const g = pnCalc(v), W = g.W * 1e4; const R = { x: 8, y: 8, w: w * 0.6, h: h - 16 }; const xr = Math.max(W * 1.5, 0.2), gh = (R.h - 10) / 3;
    const mk = (i: number, title: string, fn: (x: number) => number, lo: number, hi: number, col: string) => { const r = { x: R.x, y: R.y + i * (gh + 5), w: R.w, h: gh }; const m = plot(c, r, [-xr, xr], [lo, hi], { title, ystep: (hi - lo) / 2 }); const pts: [number, number][] = []; for (let k = 0; k <= 200; k++) { const x = -xr + (k / 200) * 2 * xr; pts.push([m.X(x), m.Y(fn(x))]); } polyline(c, pts, col, 2.2); line(c, m.X(-g.xp * 1e4), r.y + 20, m.X(-g.xp * 1e4), r.y + r.h - 20, C.dim, 1, [3, 3]); line(c, m.X(g.xn * 1e4), r.y + 20, m.X(g.xn * 1e4), r.y + r.h - 20, C.dim, 1, [3, 3]); };
    const q = 1.602e-19, eps = 11.7 * 8.854e-14; const rho = (x: number) => (x < -g.xp * 1e4 ? 0 : x < 0 ? -q * g.Na : x < g.xn * 1e4 ? q * g.Nd : 0);
    const Ef = (x: number) => { const xm = x * 1e-4; if (xm < -g.xp || xm > g.xn) return 0; return xm < 0 ? -(q * g.Na * (xm + g.xp)) / eps : -(q * g.Nd * (g.xn - xm)) / eps; };
    const Em = Math.abs(Ef(0)) || 1;
    mk(0, 'Charge density ρ (norm.)', x => rho(x) / (q * Math.max(g.Na, g.Nd)), -1.1, 1.1, C.purple); mk(1, 'Electric field E (norm.)', x => Ef(x) / Em, -1.1, 0.2, C.amber);
    mk(2, 'Potential (V)', x => { const xm = x * 1e-4, vb = g.Vbi - g.V; if (xm <= -g.xp) return 0; if (xm >= g.xn) return vb; if (xm < 0) return (q * g.Na * (xm + g.xp) ** 2) / (2 * eps); return vb - (q * g.Nd * (g.xn - xm) ** 2) / (2 * eps); }, 0, Math.max(g.Vbi - g.V, 0.2) * 1.1, C.cyan);
    const I = { x: R.x + R.w + 14, y: 8, w: w - R.w - 30, h: h * 0.55 }; const m = plot(c, I, [-1, 0.8], [-1, 6], { title: 'I–V (mA, log-limited)', xlabel: 'V', ystep: 2 }); const pts: [number, number][] = []; for (let k = 0; k <= 100; k++) { const V = -1 + (k / 100) * 1.8; pts.push([m.X(V), m.Y(clamp(Math.min(g.Is * (Math.exp(V / 0.02585) - 1) * 1e3, 6), -1, 6))]); } polyline(c, pts, C.green, 2); const Vc = clamp(g.V, -1, 0.8); circle(c, m.X(Vc), m.Y(clamp(g.Is * (Math.exp(g.V / 0.02585) - 1) * 1e3, -1, 6)), 5, C.amber, C.white, 1.2);
  },
  readouts(_s, v) { const g = pnCalc(v); return [{ label: 'Built-in potential Vbi', value: g.Vbi, unit: 'V', digits: 3 }, { label: 'Depletion width W', value: g.W * 1e4, unit: 'µm', digits: 3 }, { label: 'x on n side', value: g.xn * 1e4, unit: 'µm', digits: 3 }, { label: 'x on p side', value: g.xp * 1e4, unit: 'µm', digits: 3 }, { label: 'Peak field', value: (1.602e-19 * g.Na * g.xp) / (11.7 * 8.854e-14) / 1e3, unit: 'kV/cm', digits: 1 }, { label: 'Diode current', value: g.Is * (Math.exp(g.V / 0.02585) - 1) * 1e3, unit: 'mA', digits: 3 }]; },
  equations(_s, v) { const g = pnCalc(v); return ['V_{bi} = \\dfrac{kT}{q}\\ln\\dfrac{N_aN_d}{n_i^2}', `W = \\sqrt{\\dfrac{2\\varepsilon (V_{bi}-V)}{q}\\left(\\dfrac1{N_a}+\\dfrac1{N_d}\\right)} = ${fmt(g.W * 1e4, 3)}\\ \\mu\\text{m}`]; },
});
function pnCalc(v: Record<string, number | string | boolean>) {
  const Na = 10 ** num(v, 'na'), Nd = 10 ** num(v, 'nd'), ni = 1e10, Vt = 0.02585, q = 1.602e-19, eps = 11.7 * 8.854e-14, V = num(v, 'V'), Vbi = Vt * Math.log((Na * Nd) / (ni * ni));
  const W = Math.sqrt(((2 * eps * Math.max(Vbi - V, 1e-3)) / q) * (1 / Na + 1 / Nd)); const xn = (W * Na) / (Na + Nd), xp = (W * Nd) / (Na + Nd);
  const Is = 1e-12 * (1e17 / Math.max(Na, Nd)) ** 0 * 1; return { Na, Nd, Vbi, W, xn, xp, V, Is };
}

export const PG_MATERIALS_SIMS = [bragg, stressStrain, leverRule, fickDiffusion, kronigPenney, pnJunction];
void TAU;
