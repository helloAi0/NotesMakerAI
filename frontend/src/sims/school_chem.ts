import { defineSim, num, str, bool, SCHOOL_11_12, UG_SCI } from './types';
import type { EducationLevel, Difficulty } from './types';
import { C, TAU, arrow, circle, clamp, fmt, line, panel, plot, polyline, text, wavelengthToRgb } from './draw';

const L1112: EducationLevel[] = [...SCHOOL_11_12, 'B.Sc'];
const meta = (levels: EducationLevel[], difficulty: Difficulty, category: string, topic: string, subtopic: string) => ({
  subject: 'Chemistry' as const, status: 'active' as const, educationLevels: levels, difficulty, category, topic, subtopic,
});

/* ================================================================== */
/*  Bohr hydrogen atom                                                 */
/* ================================================================== */
interface BohrS { t: number; ni: number; nf: number }
const RYD = 13.6057; // eV
const HC = 1239.842; // eV nm
export const bohrH = defineSim<BohrS>({
  id: 'bohr_hydrogen', title: 'Bohr Hydrogen Atom: Energy Levels & Spectral Lines',
  ...meta(L1112, 'Intermediate', 'Atomic Structure', 'Structure of Atom', 'Bohr model and hydrogen spectrum'),
  covers: ['Bohr model', 'Hydrogen spectrum', 'Rydberg formula', 'Lyman Balmer Paschen series'],
  tags: ['NCERT', 'JEE', 'NEET', 'energy levels', 'emission', 'absorption', 'photon', 'spectral series'],
  learningObjectives: ['Compute the energy of level n as -13.6/n² eV.', 'Link a jump between levels to the wavelength of the photon emitted or absorbed.', 'Name the Lyman, Balmer and Paschen series from the final level.'],
  assumptions: ['Bohr model: valid for one-electron atoms; ignores fine structure and quantum-mechanical orbitals.', 'Nucleus mass treated as infinite (no reduced-mass correction).'],
  blurb: 'Choose an initial and final level for the electron in hydrogen. The photon energy, wavelength, colour and spectral series are calculated from the energy difference.',
  hint: 'E_n = -13.6 eV / n^2. Photon energy = |E_i - E_f|. lambda = hc/E. Final level 1 = Lyman (UV), 2 = Balmer (visible lines 656, 486, 434, 410 nm), 3 = Paschen (IR). Emission when ni > nf, absorption when ni < nf.',
  params: [
    { kind: 'number', id: 'ni', label: 'Initial level nᵢ', min: 1, max: 7, step: 1, value: 3, digits: 0 },
    { kind: 'number', id: 'nf', label: 'Final level n_f', min: 1, max: 7, step: 1, value: 2, digits: 0 },
    { kind: 'toggle', id: 'orb', label: 'Show orbits', value: true },
  ],
  dt: 1 / 60, previewSeconds: 1,
  init(v) { return { t: 0, ni: num(v, 'ni'), nf: num(v, 'nf') }; },
  step(s, v, dt) { s.t += dt; s.ni = num(v, 'ni'); s.nf = num(v, 'nf'); },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const half = w / 2;
    // energy ladder (left)
    const L = { x: 8, y: 8, w: half - 14, h: h - 16 };
    const m = plot(c, L, [0, 1], [-14.5, 0.5], { title: 'Energy levels (eV)', grid: false });
    for (let n = 1; n <= 7; n++) {
      const E = -RYD / (n * n), y = m.Y(E);
      line(c, m.X(0.1), y, m.X(0.9), y, n === s.ni || n === s.nf ? C.amber : C.dim, n === s.ni || n === s.nf ? 2.2 : 1);
      if (n <= 3 || n === s.ni || n === s.nf) { text(c, `n=${n}`, m.X(0.12), y - 3, C.text, 10); text(c, fmt(E, 2), m.X(0.88), y - 3, C.dim, 10, 'right'); }
    }
    const emit = s.ni > s.nf, same = s.ni === s.nf;
    if (!same) {
      const x = m.X(0.5);
      arrow(c, x, m.Y(-RYD / (s.ni * s.ni)), x, m.Y(-RYD / (s.nf * s.nf)), emit ? C.green : C.red, 2.5, 9);
    }
    // atom (right top)
    const cx = half + (w - half) / 2, cy = h * 0.36, R1 = Math.min((w - half) / 2 - 10, h * 0.3) / 49 * 7;
    panel(c, { x: half + 6, y: 8, w: half - 14, h: h * 0.62 });
    const rad = (n: number) => (R1 * n * n) / 7 * 1.0 + 6;
    if (bool(v, 'orb')) for (let n = 1; n <= 7; n++) { c.beginPath(); c.arc(cx, cy, rad(n) * 0.85, 0, TAU); c.strokeStyle = n === s.ni || n === s.nf ? C.amber : 'rgba(148,163,184,0.25)'; c.lineWidth = 1; c.stroke(); }
    circle(c, cx, cy, 6, C.red);
    const nShow = same ? s.ni : (Math.floor(s.t / 1.6) % 2 === 0 ? s.ni : s.nf);
    const ang = s.t * 2 / (nShow * nShow) * 3;
    circle(c, cx + Math.cos(ang) * rad(nShow) * 0.85, cy + Math.sin(ang) * rad(nShow) * 0.85, 4.5, C.cyan);
    text(c, same ? 'no transition (nᵢ = n_f)' : emit ? 'emission: photon leaves' : 'absorption: photon needed', cx, h * 0.62, emit ? C.green : C.red, 11, 'center');
    // spectrum bar (right bottom)
    const sp = { x: half + 6, y: h * 0.7, w: half - 14, h: h * 0.3 - 8 };
    panel(c, sp);
    if (!same) {
      const E = Math.abs(RYD * (1 / (s.nf * s.nf) - 1 / (s.ni * s.ni))), lam = HC / E;
      if (lam >= 380 && lam <= 780) {
        for (let x = 0; x < sp.w - 20; x++) { const nm = 380 + (x / (sp.w - 20)) * 400, [r, g, b] = wavelengthToRgb(nm); c.fillStyle = `rgba(${r},${g},${b},0.25)`; c.fillRect(sp.x + 10 + x, sp.y + 22, 1, sp.h - 40); }
        const [r, g, b] = wavelengthToRgb(lam), px = sp.x + 10 + ((lam - 380) / 400) * (sp.w - 20);
        c.fillStyle = `rgb(${r},${g},${b})`; c.fillRect(px - 1.5, sp.y + 18, 3, sp.h - 32);
        text(c, `${fmt(lam, 0)} nm (visible)`, sp.x + sp.w / 2, sp.y + sp.h - 4, C.text, 11, 'center');
      } else text(c, `${fmt(lam, 0)} nm: ${lam < 380 ? 'ultraviolet' : 'infrared'}, not visible`, sp.x + sp.w / 2, sp.y + sp.h / 2 + 4, C.amber, 11, 'center');
      text(c, 'photon wavelength', sp.x + 8, sp.y + 14, C.dim, 10);
    }
  },
  readouts(s) {
    const Ei = -RYD / (s.ni * s.ni), Ef = -RYD / (s.nf * s.nf), dE = Math.abs(Ef - Ei), lam: number | string = dE > 0 ? HC / dE : 'none (nᵢ = n_f, no photon)';
    const series = s.nf === 1 ? 'Lyman (UV)' : s.nf === 2 ? 'Balmer (visible)' : s.nf === 3 ? 'Paschen (IR)' : s.nf === 4 ? 'Brackett (IR)' : 'Pfund / higher (IR)';
    return [
      { label: 'E at nᵢ', value: Ei, unit: 'eV', digits: 2 }, { label: 'E at n_f', value: Ef, unit: 'eV', digits: 2 },
      { label: 'Photon energy', value: dE, unit: 'eV', digits: 3 }, { label: 'Wavelength', value: lam, unit: 'nm', digits: 1 },
      { label: 'Process', value: s.ni === s.nf ? 'none' : s.ni > s.nf ? 'emission' : 'absorption' }, { label: 'Series', value: s.ni === s.nf ? '-' : series },
    ];
  },
  equations(s) {
    const dE = Math.abs(RYD * (1 / (s.nf * s.nf) - 1 / (s.ni * s.ni)));
    return ['E_n = -\\dfrac{13.6\\ \\text{eV}}{n^2}', `\\Delta E = 13.6\\left(\\dfrac{1}{${s.nf}^2}-\\dfrac{1}{${s.ni}^2}\\right) = ${fmt(dE, 3)}\\ \\text{eV}`, `\\lambda = \\dfrac{hc}{\\Delta E} = ${dE > 0 ? fmt(HC / dE, 1) : '-'}\\ \\text{nm}`];
  },
});

/* ================================================================== */
/*  Chemical equilibrium & Le Chatelier                                */
/* ================================================================== */
interface EqS { t: number; A: number; B: number; Cc: number; hist: { t: number; A: number; B: number; C: number; Q: number }[]; acc: number }
export const equilibrium = defineSim<EqS>({
  id: 'equilibrium_lechatelier', title: "Chemical Equilibrium & Le Chatelier's Principle",
  ...meta(L1112, 'Intermediate', 'Chemical Equilibrium', 'Equilibrium', "Reaction quotient Q vs K, Le Chatelier's principle"),
  covers: ["Le Chatelier's principle", 'Equilibrium constant', 'Reaction quotient', 'Dynamic equilibrium'],
  tags: ['NCERT', 'JEE', 'NEET', 'Kc', 'Qc', 'forward reverse rate', 'stress on equilibrium'],
  learningObjectives: ['See that equilibrium is dynamic: forward and reverse rates become equal.', 'Compare Q with K to predict which way the reaction shifts.', 'Predict the response to adding or removing a species.'],
  assumptions: ['Elementary reaction A + B ⇌ C in a fixed volume with mass-action kinetics.', 'Temperature changes are modelled only through the rate constants you set.'],
  blurb: 'A + B ⇌ C is simulated with real rate equations. Add or remove a species and watch Q jump away from K and the system shift back.',
  hint: 'dA/dt = -kf[A][B] + kr[C]; K = kf/kr; Q = [C]/([A][B]). If Q<K the reaction goes forward, if Q>K it goes backward. Adding reactant shifts forward; removing product shifts forward.',
  params: [
    { kind: 'number', id: 'kf', label: 'Forward rate constant k_f', min: 0.05, max: 2, step: 0.05, value: 0.5, digits: 2 },
    { kind: 'number', id: 'kr', label: 'Reverse rate constant k_r', min: 0.05, max: 2, step: 0.05, value: 0.25, digits: 2 },
    { kind: 'number', id: 'A0', label: 'Initial [A]', min: 0, max: 2, step: 0.1, value: 1, unit: 'M', digits: 1 },
    { kind: 'number', id: 'B0', label: 'Initial [B]', min: 0, max: 2, step: 0.1, value: 1, unit: 'M', digits: 1 },
  ],
  actions: [{ id: 'addA', label: 'Add A (+0.5 M)' }, { id: 'addB', label: 'Add B (+0.5 M)' }, { id: 'remC', label: 'Remove half of C' }, { id: 'addC', label: 'Add C (+0.5 M)' }],
  dt: 1 / 60, previewSeconds: 8,
  init(v) { return { t: 0, A: num(v, 'A0'), B: num(v, 'B0'), Cc: 0, hist: [], acc: 0 }; },
  step(s, v, dt) {
    const kf = num(v, 'kf'), kr = num(v, 'kr');
    for (let i = 0; i < 4; i++) { const h = dt / 4, r = kf * s.A * s.B - kr * s.Cc; s.A -= r * h; s.B -= r * h; s.Cc += r * h; s.A = Math.max(0, s.A); s.B = Math.max(0, s.B); s.Cc = Math.max(0, s.Cc); }
    s.t += dt; s.acc += dt;
    if (s.acc > 0.1) { s.acc = 0; s.hist.push({ t: s.t, A: s.A, B: s.B, C: s.Cc, Q: s.A * s.B > 1e-9 ? s.Cc / (s.A * s.B) : NaN }); if (s.hist.length > 400) s.hist.shift(); }
  },
  action(s, _v, id) { if (id === 'addA') s.A += 0.5; else if (id === 'addB') s.B += 0.5; else if (id === 'addC') s.Cc += 0.5; else if (id === 'remC') s.Cc *= 0.5; },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const t1 = s.hist.length ? s.hist[0].t : 0, t2 = Math.max(s.t, t1 + 10);
    const top = { x: 8, y: 8, w: w - 16, h: h * 0.62 };
    const m = plot(c, top, [t1, t2], [0, Math.max(2.5, ...s.hist.map(p => Math.max(p.A, p.B, p.C)) )], { title: 'Concentrations (M)', xlabel: 'time (s)' });
    for (const [key, col] of [['A', C.blue], ['B', C.amber], ['C', C.green]] as const) polyline(c, s.hist.map(p => [m.X(p.t), m.Y(p[key])] as [number, number]), col, 2);
    text(c, '[A]', top.x + top.w - 90, top.y + 16, C.blue, 11, 'left', 'alphabetic', true); text(c, '[B]', top.x + top.w - 62, top.y + 16, C.amber, 11, 'left', 'alphabetic', true); text(c, '[C]', top.x + top.w - 34, top.y + 16, C.green, 11, 'left', 'alphabetic', true);
    const K = num(v, 'kf') / num(v, 'kr'), Q = s.A * s.B > 1e-9 ? s.Cc / (s.A * s.B) : Infinity;
    const bp = { x: 8, y: h * 0.62 + 16, w: w - 16, h: h * 0.38 - 24 };
    panel(c, bp);
    const maxv = Math.max(K, Number.isFinite(Q) ? Q : K, 1) * 1.3, bx = (val: number) => bp.x + 70 + (clamp(val, 0, maxv) / maxv) * (bp.w - 90);
    text(c, 'K', bp.x + 10, bp.y + 26, C.cyan, 12, 'left', 'alphabetic', true); text(c, 'Q', bp.x + 10, bp.y + 56, C.amber, 12, 'left', 'alphabetic', true);
    c.fillStyle = C.cyan; c.fillRect(bp.x + 70, bp.y + 16, bx(K) - bp.x - 70, 14);
    c.fillStyle = C.amber; c.fillRect(bp.x + 70, bp.y + 46, bx(Number.isFinite(Q) ? Q : maxv) - bp.x - 70, 14);
    const verdict = Math.abs(Q - K) / K < 0.03 ? 'Q ≈ K: at equilibrium' : Q < K ? 'Q < K: shifts forward →' : 'Q > K: shifts backward ←';
    text(c, verdict, bp.x + bp.w / 2, bp.y + bp.h - 8, Math.abs(Q - K) / K < 0.03 ? C.green : C.red, 12, 'center', 'alphabetic', true);
  },
  readouts(s, v) {
    const K = num(v, 'kf') / num(v, 'kr'), Q = s.A * s.B > 1e-9 ? s.Cc / (s.A * s.B) : Infinity;
    const rf = num(v, 'kf') * s.A * s.B, rr = num(v, 'kr') * s.Cc;
    return [{ label: '[A]', value: s.A, unit: 'M', digits: 3 }, { label: '[B]', value: s.B, unit: 'M', digits: 3 }, { label: '[C]', value: s.Cc, unit: 'M', digits: 3 },
      { label: 'K = kf/kr', value: K, digits: 2 }, { label: 'Q', value: Number.isFinite(Q) ? Q : 'not defined (no A or B left)', digits: 2 }, { label: 'Forward rate', value: rf, unit: 'M/s', digits: 3 }, { label: 'Reverse rate', value: rr, unit: 'M/s', digits: 3 }];
  },
  equations(s, v) {
    const K = num(v, 'kf') / num(v, 'kr');
    return ['A + B \\rightleftharpoons C', `K = \\dfrac{k_f}{k_r} = \\dfrac{${fmt(num(v, 'kf'), 2)}}{${fmt(num(v, 'kr'), 2)}} = ${fmt(K, 2)}`, `Q = \\dfrac{[C]}{[A][B]} = ${s.A * s.B > 1e-9 ? fmt(s.Cc / (s.A * s.B), 2) : '\\infty'}`];
  },
});

/* ================================================================== */
/*  Titration curve                                                    */
/* ================================================================== */
interface TiS { vol: number; running: boolean }
function titrationPH(Ca: number, Va: number, Cb: number, Vb: number, pKa: number, strong: boolean) {
  const Ka = strong ? 1e12 : 10 ** -pKa, V = Va + Vb, tot = Ca * Va / V, na = Cb * Vb / V;
  const f = (pH: number) => { const H = 10 ** -pH, OH = 1e-14 / H, A = tot * Ka / (Ka + H); return na + H - OH - A; };
  let lo = -1, hi = 15;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
export const titration = defineSim<TiS>({
  id: 'acid_base_titration', title: 'Acid-Base Titration Curve & Indicators',
  ...meta(L1112, 'Intermediate', 'Ionic Equilibrium', 'Equilibrium', 'Titration of strong/weak acid with strong base'),
  covers: ['Titration curve', 'Equivalence point', 'Buffer region', 'Indicators', 'pKa and half-equivalence'],
  tags: ['NCERT', 'JEE', 'NEET', 'burette', 'phenolphthalein', 'methyl orange', 'Henderson-Hasselbalch', 'neutralisation'],
  learningObjectives: ['Read the equivalence point from the steep part of the pH curve.', 'See that a weak acid has a buffer region and pH = pKa at half-equivalence.', 'Choose an indicator whose colour change lies in the steep region.'],
  assumptions: ['25 °C, Kw = 1e-14; ideal dilute solutions (activity effects ignored).', 'Monoprotic acid titrated with a strong monoprotic base.'],
  blurb: 'Run NaOH from a burette into an acid. The pH is solved exactly from the charge balance at every drop, and the flask changes colour with the chosen indicator.',
  hint: 'Charge balance [Na+]+[H+]=[OH-]+[A-]. Strong acid: equivalence pH 7. Weak acid: equivalence pH >7, pH = pKa at half-equivalence, buffer region before. Phenolphthalein changes at pH 8.2-10, methyl orange at 3.1-4.4.',
  params: [
    { kind: 'select', id: 'kind', label: 'Acid', value: 'weak', options: [{ value: 'strong', label: 'Strong (HCl)' }, { value: 'weak', label: 'Weak (e.g. acetic)' }], resetOnChange: false },
    { kind: 'number', id: 'pKa', label: 'pKa (weak acid)', min: 2, max: 10, step: 0.1, value: 4.76, digits: 2 },
    { kind: 'number', id: 'Ca', label: 'Acid concentration', min: 0.01, max: 0.5, step: 0.01, value: 0.1, unit: 'M', digits: 2 },
    { kind: 'number', id: 'Cb', label: 'NaOH concentration', min: 0.01, max: 0.5, step: 0.01, value: 0.1, unit: 'M', digits: 2 },
    { kind: 'select', id: 'ind', label: 'Indicator', value: 'phph', options: [{ value: 'phph', label: 'Phenolphthalein (8.2-10)' }, { value: 'mo', label: 'Methyl orange (3.1-4.4)' }, { value: 'bt', label: 'Bromothymol blue (6-7.6)' }] },
  ],
  actions: [{ id: 'go', label: 'Start / pause burette' }, { id: 'reset', label: 'Refill burette' }],
  dt: 1 / 60, previewSeconds: 1,
  init() { return { vol: 0, running: true }; },
  step(s, v, dt) { if (s.running) { s.vol = Math.min(s.vol + dt * 2.5, 2.2 * 25 * num(v, 'Ca') / num(v, 'Cb')); } },
  action(s, _v, id) { if (id === 'go') s.running = !s.running; else if (id === 'reset') { s.vol = 0; s.running = true; } },
  pointer(s, v, e) { if (e.kind !== 'up') { s.running = false; const vmax = 2.2 * 25 * num(v, 'Ca') / num(v, 'Cb'); s.vol = clamp(((e.x / e.w - 0.04) / 0.62) * vmax, 0, vmax); } },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const Ca = num(v, 'Ca'), Cb = num(v, 'Cb'), strong = str(v, 'kind') === 'strong', pKa = num(v, 'pKa'), Vmax = 2.2 * 25 * Ca / Cb, Veq = 25 * Ca / Cb;
    const P = { x: 8, y: 8, w: w * 0.68, h: h - 16 };
    const m = plot(c, P, [0, Vmax], [0, 14], { title: 'pH vs volume of NaOH added (mL)', xlabel: 'volume NaOH (mL)', ystep: 2 });
    const [lo, hi] = str(v, 'ind') === 'phph' ? [8.2, 10] : str(v, 'ind') === 'mo' ? [3.1, 4.4] : [6, 7.6];
    c.fillStyle = 'rgba(251,191,36,0.13)'; c.fillRect(P.x + 34, m.Y(hi), P.w - 42, m.Y(lo) - m.Y(hi));
    const pts: [number, number][] = [];
    for (let i = 0; i <= 240; i++) { const Vb = (i / 240) * Vmax; pts.push([m.X(Vb), m.Y(clamp(titrationPH(Ca, 25, Cb, Vb, pKa, strong), 0, 14))]); }
    polyline(c, pts, C.cyan, 2.2);
    line(c, m.X(Veq), m.Y(0), m.X(Veq), m.Y(14), C.green, 1, [4, 4]); text(c, 'equivalence', m.X(Veq) + 4, m.Y(1), C.green, 10);
    if (!strong) { line(c, m.X(Veq / 2), m.Y(0), m.X(Veq / 2), m.Y(pKa), C.amber, 1, [3, 3]); circle(c, m.X(Veq / 2), m.Y(pKa), 4, C.amber); text(c, 'pH = pKa', m.X(Veq / 2) + 6, m.Y(pKa) + 14, C.amber, 10); }
    const pH = titrationPH(Ca, 25, Cb, s.vol, pKa, strong);
    circle(c, m.X(s.vol), m.Y(clamp(pH, 0, 14)), 5.5, C.red, C.white, 1.5);
    // flask
    const fx = P.x + P.w + 20, fw = w - fx - 12, cx = fx + fw / 2;
    const col = pH < lo ? (str(v, 'ind') === 'phph' ? 'rgba(230,240,255,0.55)' : str(v, 'ind') === 'mo' ? '#ef4444' : '#facc15') : pH > hi ? (str(v, 'ind') === 'phph' ? '#ec4899' : str(v, 'ind') === 'mo' ? '#facc15' : '#3b82f6') : (str(v, 'ind') === 'phph' ? '#f9a8d4' : str(v, 'ind') === 'mo' ? '#fb923c' : '#22c55e');
    c.fillStyle = 'rgba(148,163,184,0.25)'; c.fillRect(cx - 7, 24, 14, h * 0.32);
    c.fillStyle = C.blue; const fill = (1 - s.vol / Vmax) * h * 0.32; c.fillRect(cx - 5, 24 + (h * 0.32 - fill), 10, fill);
    c.beginPath(); c.moveTo(cx - 12, h * 0.52); c.lineTo(cx - fw * 0.45, h - 24); c.lineTo(cx + fw * 0.45, h - 24); c.lineTo(cx + 12, h * 0.52); c.closePath();
    c.fillStyle = col; c.fill(); c.strokeStyle = C.axis; c.lineWidth = 1.5; c.stroke();
    text(c, `pH ${fmt(pH, 2)}`, cx, h - 8, C.text, 12, 'center', 'alphabetic', true);
    if (s.running && s.vol < Vmax) { circle(c, cx, 24 + h * 0.32 + ((s.vol * 30) % 30) * 1.2, 2.5, C.blue); }
  },
  readouts(s, v) {
    const Ca = num(v, 'Ca'), Cb = num(v, 'Cb'), strong = str(v, 'kind') === 'strong', Veq = 25 * Ca / Cb;
    return [{ label: 'NaOH added', value: s.vol, unit: 'mL', digits: 1 }, { label: 'pH', value: titrationPH(Ca, 25, Cb, s.vol, num(v, 'pKa'), strong), digits: 2 },
      { label: 'Equivalence volume', value: Veq, unit: 'mL', digits: 1 }, { label: 'pH at equivalence', value: titrationPH(Ca, 25, Cb, Veq, num(v, 'pKa'), strong), digits: 2 },
      { label: 'Fraction titrated', value: s.vol / Veq, digits: 2 }];
  },
  equations(_s, v) {
    return ['n_{\\text{OH}^-} = n_{\\text{HA}} \\Rightarrow V_{eq} = \\dfrac{C_a V_a}{C_b}', `V_{eq} = \\dfrac{${fmt(num(v, 'Ca'), 2)}\\times 25}{${fmt(num(v, 'Cb'), 2)}} = ${fmt(25 * num(v, 'Ca') / num(v, 'Cb'), 1)}\\ \\text{mL}`, 'pH = pK_a + \\log\\dfrac{[A^-]}{[HA]}'];
  },
});

/* ================================================================== */
/*  Maxwell-Boltzmann distribution                                     */
/* ================================================================== */
const GASES: Record<string, { name: string; M: number }> = { H2: { name: 'H₂', M: 2.016 }, He: { name: 'He', M: 4.003 }, N2: { name: 'N₂', M: 28.01 }, O2: { name: 'O₂', M: 32.0 }, CO2: { name: 'CO₂', M: 44.01 } };
interface MbS { p: { x: number; y: number; vx: number; vy: number }[]; key: string }
const KB = 1.380649e-23, NA = 6.02214e23;
const mb = (v: number, M: number, T: number) => { const m = (M / 1000) / NA, a = m / (2 * Math.PI * KB * T); return 4 * Math.PI * a ** 1.5 * v * v * Math.exp(-m * v * v / (2 * KB * T)); };
export const maxwell = defineSim<MbS>({
  id: 'maxwell_boltzmann', title: 'Maxwell-Boltzmann Speed Distribution',
  ...meta(L1112, 'Intermediate', 'States of Matter', 'Kinetic Theory', 'Distribution of molecular speeds'),
  covers: ['Maxwell-Boltzmann distribution', 'Most probable speed', 'rms speed', 'Kinetic theory of gases'],
  tags: ['NCERT', 'JEE', 'NEET', 'molecular speeds', 'temperature', 'molar mass', 'Graham', 'effusion'],
  learningObjectives: ['See that molecules have a spread of speeds, not one speed.', 'Compare v_mp < v_mean < v_rms and how they scale with √(T/M).', 'Explain why light gases move faster at the same temperature.'],
  assumptions: ['Ideal gas in thermal equilibrium; collisions are not drawn in the box animation.'],
  blurb: 'Pick a gas and temperature. The exact Maxwell-Boltzmann curve is plotted with its three characteristic speeds, next to a box of molecules moving with sampled speeds.',
  hint: 'f(v)=4π(m/2πkT)^{3/2} v² exp(-mv²/2kT). v_mp=√(2kT/m), v_mean=√(8kT/πm), v_rms=√(3kT/m). Light gas or high T shifts and flattens the curve.',
  params: [
    { kind: 'select', id: 'gas', label: 'Gas', value: 'N2', options: Object.entries(GASES).map(([k, g]) => ({ value: k, label: g.name })) },
    { kind: 'number', id: 'T', label: 'Temperature', min: 100, max: 1500, step: 10, value: 300, unit: 'K', digits: 0 },
    { kind: 'toggle', id: 'cmp', label: 'Compare with 300 K N₂', value: true },
  ],
  dt: 1 / 60, previewSeconds: 1,
  init(v) { return { key: '', p: [] }; void v; },
  step(s, v, dt) {
    const g = GASES[str(v, 'gas')], T = num(v, 'T'), key = `${str(v, 'gas')}${T}`;
    const sig = Math.sqrt(KB * T / ((g.M / 1000) / NA));
    if (s.key !== key) { s.key = key; s.p = Array.from({ length: 60 }, () => { const gs = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(TAU * Math.random()); return { x: Math.random(), y: Math.random(), vx: gs() * sig, vy: gs() * sig }; }); }
    const k = 0.00035 * dt * 60; // pixels-per-second scale: 500 m/s crosses the box in ~2.5 s
    for (const q of s.p) { q.x += q.vx * k / 1000; q.y += q.vy * k / 1000; if (q.x < 0 || q.x > 1) { q.vx = -q.vx; q.x = clamp(q.x, 0, 1); } if (q.y < 0 || q.y > 1) { q.vy = -q.vy; q.y = clamp(q.y, 0, 1); } }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const g = GASES[str(v, 'gas')], T = num(v, 'T'), m = (g.M / 1000) / NA;
    const vmp = Math.sqrt(2 * KB * T / m), vmean = Math.sqrt(8 * KB * T / (Math.PI * m)), vrms = Math.sqrt(3 * KB * T / m);
    const P = { x: 8, y: 8, w: w * 0.64, h: h - 16 };
    const vmax = 3500, yMax = Math.max(mb(vmp, g.M, T), bool(v, 'cmp') ? mb(Math.sqrt(2 * KB * 300 / ((28.01 / 1000) / NA)), 28.01, 300) : 0) * 1.15;
    const mp = plot(c, P, [0, vmax], [0, yMax], { title: `f(v) for ${g.name} at ${T} K`, xlabel: 'speed v (m/s)', ystep: yMax / 4 });
    const pts: [number, number][] = []; for (let x = 0; x <= vmax; x += 20) pts.push([mp.X(x), mp.Y(mb(x, g.M, T))]);
    if (bool(v, 'cmp')) { const q: [number, number][] = []; for (let x = 0; x <= vmax; x += 20) q.push([mp.X(x), mp.Y(mb(x, 28.01, 300))]); polyline(c, q, 'rgba(148,163,184,0.8)', 1.5, [5, 4]); }
    c.beginPath(); c.moveTo(mp.X(0), mp.Y(0)); for (const [x, y] of pts) c.lineTo(x, y); c.lineTo(mp.X(vmax), mp.Y(0)); c.fillStyle = 'rgba(34,211,238,0.15)'; c.fill();
    polyline(c, pts, C.cyan, 2.4);
    for (const [val, col, lab, dy] of [[vmp, C.green, 'v_mp', 0], [vmean, C.amber, 'v_mean', 14], [vrms, C.red, 'v_rms', 28]] as const) { line(c, mp.X(val), mp.Y(0), mp.X(val), mp.Y(yMax * 0.92) + dy, col, 1.2, [4, 3]); text(c, lab, mp.X(val) + 3, mp.Y(yMax * 0.92) + dy + 10, col, 10); }
    // box
    const B = { x: P.x + P.w + 12, y: 18, w: w - P.x - P.w - 22, h: Math.min(h - 40, w - P.x - P.w - 22) };
    panel(c, B);
    for (const q of s.p) { const sp = Math.hypot(q.vx, q.vy), col = `hsl(${220 - clamp(sp / 2200, 0, 1) * 220},90%,60%)`; circle(c, B.x + q.x * B.w, B.y + q.y * B.h, 3, col); }
    text(c, 'molecules (colour = speed)', B.x + B.w / 2, B.y + B.h + 14, C.dim, 10, 'center');
  },
  readouts(_s, v) {
    const g = GASES[str(v, 'gas')], T = num(v, 'T'), m = (g.M / 1000) / NA;
    return [{ label: 'Molar mass', value: g.M, unit: 'g/mol', digits: 2 }, { label: 'Most probable v_mp', value: Math.sqrt(2 * KB * T / m), unit: 'm/s', digits: 0 }, { label: 'Mean speed', value: Math.sqrt(8 * KB * T / (Math.PI * m)), unit: 'm/s', digits: 0 },
      { label: 'rms speed', value: Math.sqrt(3 * KB * T / m), unit: 'm/s', digits: 0 }, { label: 'Mean KE per molecule', value: 1.5 * KB * T / 1.602e-19, unit: 'eV', digits: 3 }];
  },
  equations(_s, v) {
    const g = GASES[str(v, 'gas')], T = num(v, 'T'), m = (g.M / 1000) / NA;
    return ['v_{mp}=\\sqrt{\\dfrac{2kT}{m}},\\ \\ v_{mean}=\\sqrt{\\dfrac{8kT}{\\pi m}},\\ \\ v_{rms}=\\sqrt{\\dfrac{3kT}{m}}', `v_{rms} = ${fmt(Math.sqrt(3 * KB * T / m), 0)}\\ \\text{m/s}`];
  },
});

/* ================================================================== */
/*  Collision theory & Arrhenius                                       */
/* ================================================================== */
interface ArS { t: number }
const R = 8.314;
function fracAbove(Ea: number, T: number) { // fraction of molecules with E > Ea for 2D-like exp(-E/RT) tail (3D MB energy distribution, numeric)
  const kT = R * T; let tot = 0, hi = 0; const dE = kT / 40;
  for (let E = dE / 2; E < 40 * kT; E += dE) { const f = 2 * Math.sqrt(E / Math.PI) * kT ** -1.5 * Math.exp(-E / kT); tot += f * dE; if (E > Ea) hi += f * dE; }
  return hi / tot;
}
export const arrhenius = defineSim<ArS>({
  id: 'collision_arrhenius', title: 'Collision Theory: Activation Energy & Arrhenius Equation',
  ...meta(L1112, 'Intermediate', 'Chemical Kinetics', 'Chemical Kinetics', 'Effect of temperature and activation energy on rate'),
  covers: ['Collision theory', 'Activation energy', 'Arrhenius equation', 'Effect of temperature on rate', 'Catalyst'],
  tags: ['NCERT', 'JEE', 'NEET', 'rate constant', 'energy distribution', 'ln k vs 1/T', 'catalyst lowers Ea'],
  learningObjectives: ['Relate the shaded fraction of molecules with E ≥ Ea to the rate constant.', 'See why a 10 K rise can double the rate.', 'Read Ea from the slope of ln k vs 1/T.'],
  assumptions: ['Energy distribution of translational energy (3D Maxwell-Boltzmann); steric factor folded into A.'],
  blurb: 'The energy distribution of molecules is drawn with the activation energy marked. The shaded tail is the fraction that can react; the Arrhenius plot builds up as you change T.',
  hint: 'k = A exp(-Ea/RT). Fraction with E>Ea rises steeply with T. A catalyst lowers Ea. Slope of ln k vs 1/T is -Ea/R.',
  params: [
    { kind: 'number', id: 'Ea', label: 'Activation energy Ea', min: 10, max: 120, step: 1, value: 50, unit: 'kJ/mol', digits: 0 },
    { kind: 'number', id: 'T', label: 'Temperature', min: 250, max: 700, step: 5, value: 300, unit: 'K', digits: 0 },
    { kind: 'toggle', id: 'cat', label: 'Add catalyst (Ea − 20 kJ/mol)', value: false },
  ],
  dt: 1 / 60, previewSeconds: 1,
  init() { return { t: 0 }; }, step(s, _v, dt) { s.t += dt; },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const Ea = (num(v, 'Ea') - (bool(v, 'cat') ? 20 : 0)) * 1000, T = num(v, 'T'), kT = R * T;
    const P = { x: 8, y: 8, w: w * 0.58, h: h - 16 };
    const Emax = 120000, f = (E: number) => 2 * Math.sqrt(E / Math.PI) * kT ** -1.5 * Math.exp(-E / kT);
    let fm = 0; for (let E = 100; E < Emax; E += 400) fm = Math.max(fm, f(E));
    const m = plot(c, P, [0, Emax / 1000], [0, fm * 1.15], { title: `Energy distribution at ${T} K`, xlabel: 'kinetic energy E (kJ/mol)', ystep: fm });
    c.beginPath(); c.moveTo(m.X(Ea / 1000), m.Y(0)); for (let E = Ea; E < Emax; E += 400) c.lineTo(m.X(E / 1000), m.Y(f(E))); c.lineTo(m.X(Emax / 1000), m.Y(0)); c.fillStyle = 'rgba(248,113,113,0.55)'; c.fill();
    const pts: [number, number][] = []; for (let E = 100; E < Emax; E += 400) pts.push([m.X(E / 1000), m.Y(f(E))]);
    polyline(c, pts, C.cyan, 2.2); line(c, m.X(Ea / 1000), m.Y(0), m.X(Ea / 1000), m.Y(fm * 1.1), C.amber, 1.5, [4, 3]); text(c, 'Ea', m.X(Ea / 1000) + 4, m.Y(fm * 1.05), C.amber, 11, 'left', 'alphabetic', true);
    text(c, `fraction ≥ Ea: ${fmt(fracAbove(Ea, T) * 100, 3)} %`, P.x + P.w - 10, P.y + 34, C.red, 11, 'right');
    // Arrhenius plot
    const Q = { x: P.x + P.w + 10, y: 8, w: w - P.x - P.w - 18, h: h - 16 };
    const xs: number[] = [], ys: number[] = [];
    for (let Tt = 250; Tt <= 700; Tt += 15) { xs.push(1000 / Tt); ys.push(-Ea / (R * Tt)); }
    const yr: [number, number] = [Math.floor(Math.min(...ys)), Math.ceil(Math.max(...ys))];
    const mq = plot(c, Q, [1000 / 700, 1000 / 250], yr, { title: 'ln k vs 1000/T', xlabel: '1000 / T (K⁻¹)' });
    polyline(c, xs.map((x, i) => [mq.X(x), mq.Y(ys[i])] as [number, number]), C.green, 2);
    circle(c, mq.X(1000 / T), mq.Y(-Ea / (R * T)), 5, C.red, C.white, 1.5);
    text(c, `slope = −Ea/R`, Q.x + Q.w - 8, Q.y + 34, C.dim, 10, 'right');
    void s;
  },
  readouts(_s, v) {
    const Ea = (num(v, 'Ea') - (bool(v, 'cat') ? 20 : 0)) * 1000, T = num(v, 'T'), rel = Math.exp(-Ea / (R * T)) / Math.exp(-50000 / (R * 300));
    return [{ label: 'Effective Ea', value: Ea / 1000, unit: 'kJ/mol', digits: 0 }, { label: 'Fraction E ≥ Ea', value: fracAbove(Ea, T) * 100, unit: '%', digits: 4 }, { label: 'k / k(300 K, 50 kJ)', value: rel, digits: 3 },
      { label: 'Rate gain for +10 K', value: Math.exp(-Ea / (R * (T + 10))) / Math.exp(-Ea / (R * T)), digits: 2 }];
  },
  equations(_s, v) {
    const Ea = (num(v, 'Ea') - (bool(v, 'cat') ? 20 : 0)) * 1000, T = num(v, 'T');
    return ['k = A\\, e^{-E_a/RT}', `e^{-E_a/RT} = e^{-${fmt(Ea / 1000, 0)}\\,000/(8.314\\times ${T})} = ${fmt(Math.exp(-Ea / (R * T)), 6)}`, '\\ln k = \\ln A - \\dfrac{E_a}{R}\\cdot\\dfrac{1}{T}'];
  },
});

/* ================================================================== */
/*  VSEPR molecular geometry                                           */
/* ================================================================== */
interface VsS { t: number; rx: number; ry: number; drag: { x: number; y: number } | null }
type V3 = [number, number, number];
const GEOM: Record<number, V3[]> = {
  2: [[0, 0, 1], [0, 0, -1]],
  3: [[1, 0, 0], [-0.5, 0.866, 0], [-0.5, -0.866, 0]],
  4: [[0.943, 0, -0.333], [-0.471, 0.816, -0.333], [-0.471, -0.816, -0.333], [0, 0, 1]],
  5: [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-0.5, 0.866, 0], [-0.5, -0.866, 0]],
  6: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
};
const SHAPES: Record<string, [string, string, string]> = {
  '2,0': ['Linear', '180°', 'CO₂, BeCl₂'], '3,0': ['Trigonal planar', '120°', 'BF₃'], '2,1': ['Bent', '<120° (≈117°)', 'SO₂'],
  '4,0': ['Tetrahedral', '109.5°', 'CH₄'], '3,1': ['Trigonal pyramidal', '≈107°', 'NH₃'], '2,2': ['Bent', '≈104.5°', 'H₂O'],
  '5,0': ['Trigonal bipyramidal', '90° / 120°', 'PCl₅'], '4,1': ['Seesaw', '<90° / <120°', 'SF₄'], '3,2': ['T-shaped', '<90°', 'ClF₃'], '2,3': ['Linear', '180°', 'XeF₂'],
  '6,0': ['Octahedral', '90°', 'SF₆'], '5,1': ['Square pyramidal', '<90°', 'BrF₅'], '4,2': ['Square planar', '90°', 'XeF₄'],
};
export const vsepr = defineSim<VsS>({
  id: 'vsepr_geometry', title: 'VSEPR: Electron Pairs & Molecular Shape',
  ...meta(L1112, 'Intermediate', 'Chemical Bonding', 'Chemical Bonding and Molecular Structure', 'VSEPR theory and molecular geometry'),
  covers: ['VSEPR theory', 'Molecular geometry', 'Lone pair repulsion', 'Bond angle'],
  tags: ['NCERT', 'JEE', 'NEET', 'AXE notation', 'bent', 'pyramidal', 'tetrahedral', 'octahedral', 'steric number'],
  learningObjectives: ['Count bonding and lone pairs to get the steric number.', 'Predict the electron-domain geometry and the molecular shape.', 'Explain why lone pairs compress bond angles.'],
  assumptions: ['Idealised geometry; real angles shown are textbook values for the common examples, otherwise a qualitative "less than ideal".', 'Drag to rotate the 3D view.'],
  blurb: 'Set the number of bonding pairs and lone pairs on the central atom. The electron domains arrange themselves in 3D; the molecular shape ignores the lone pairs. Drag to rotate.',
  hint: 'Steric number = bonding + lone pairs sets the electron geometry (2 linear, 3 trigonal planar, 4 tetrahedral, 5 trigonal bipyramidal, 6 octahedral). Lone pairs repel more, so bond angles shrink. Lone pairs take equatorial sites in trigonal bipyramidal and opposite sites in octahedral.',
  params: [
    { kind: 'number', id: 'bp', label: 'Bonding pairs', min: 2, max: 6, step: 1, value: 4, digits: 0 },
    { kind: 'number', id: 'lp', label: 'Lone pairs on central atom', min: 0, max: 3, step: 1, value: 0, digits: 0 },
  ],
  dt: 1 / 60, previewSeconds: 0,
  init() { return { t: 0, rx: -0.35, ry: 0.5, drag: null }; },
  step(s, _v, dt) { if (!s.drag) s.ry += dt * 0.4; },
  pointer(s, _v, e) { if (e.kind === 'down') s.drag = { x: e.x, y: e.y }; else if (e.kind === 'move' && s.drag) { s.ry += (e.x - s.drag.x) * 0.012; s.rx += (e.y - s.drag.y) * 0.012; s.drag = { x: e.x, y: e.y }; } else s.drag = null; },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const bp = num(v, 'bp'), lp = num(v, 'lp'), n = bp + lp;
    if (n > 6) { text(c, 'Too many electron pairs (max 6 domains)', w / 2, h / 2, C.red, 14, 'center'); return; }
    const dirs = GEOM[n];
    // choose which positions hold lone pairs
    const lpIdx: number[] = [];
    if (n === 5) lpIdx.push(2, 3, 4); else if (n === 6) lpIdx.push(5, 4); else for (let i = 0; i < lp; i++) lpIdx.push(dirs.length - 1 - i);
    const lps = new Set(lpIdx.slice(0, lp));
    const sc = Math.min(w, h) * 0.3, cx = w * 0.5, cy = h * 0.5;
    const rot = ([x, y, z]: V3): V3 => { const cy_ = Math.cos(s.ry), sy = Math.sin(s.ry), cx_ = Math.cos(s.rx), sx = Math.sin(s.rx); const x1 = x * cy_ + z * sy, z1 = -x * sy + z * cy_; const y2 = y * cx_ - z1 * sx, z2 = y * sx + z1 * cx_; return [x1, y2, z2]; };
    const items = dirs.map((d, i) => ({ p: rot(d), lone: lps.has(i) })).sort((a, b) => a.p[2] - b.p[2]);
    circle(c, cx, cy, 15, C.purple, C.white, 1.5);
    for (const it of items) {
      const px = cx + it.p[0] * sc, py = cy - it.p[1] * sc, dep = 0.75 + 0.25 * (it.p[2] + 1) / 2;
      if (!it.lone) { line(c, cx, cy, px, py, 'rgba(226,232,240,0.8)', 3); circle(c, px, py, 11 * dep, C.green, C.white, 1); }
      else { c.beginPath(); c.ellipse(px, py, 14 * dep, 9 * dep, Math.atan2(py - cy, px - cx), 0, TAU); c.fillStyle = 'rgba(251,191,36,0.55)'; c.fill(); c.strokeStyle = C.amber; c.lineWidth = 1.5; c.stroke(); text(c, '••', px, py + 3, C.white, 10, 'center'); }
    }
    const [name] = SHAPES[`${bp},${lp}`] ?? ['(no common example)'];
    text(c, name, 12, 22, C.text, 15, 'left', 'alphabetic', true);
    text(c, `AX${bp}${lp ? 'E' + lp : ''}`, 12, 40, C.amber, 12, 'left', 'alphabetic', true);
  },
  readouts(_s, v) {
    const bp = num(v, 'bp'), lp = num(v, 'lp'), n = bp + lp, e = SHAPES[`${bp},${lp}`];
    const eg = ['', '', 'linear', 'trigonal planar', 'tetrahedral', 'trigonal bipyramidal', 'octahedral'][n] ?? 'not possible';
    return [{ label: 'Steric number', value: n, digits: 0 }, { label: 'Electron geometry', value: eg }, { label: 'Molecular shape', value: e ? e[0] : n > 6 ? 'not possible' : 'rare / not listed' }, { label: 'Bond angle', value: e ? e[1] : '-' }, { label: 'Example', value: e ? e[2] : '-' }];
  },
  equations(_s, v) { return [`\\text{SN} = ${num(v, 'bp')} + ${num(v, 'lp')} = ${num(v, 'bp') + num(v, 'lp')}`, '\\text{repulsion: LP–LP} > \\text{LP–BP} > \\text{BP–BP}']; },
});

/* ================================================================== */
/*  Galvanic cell & Nernst equation                                    */
/* ================================================================== */
const METALS: Record<string, { name: string; E0: number; z: number; ion: string }> = {
  Zn: { name: 'Zn', E0: -0.76, z: 2, ion: 'Zn²⁺' }, Fe: { name: 'Fe', E0: -0.44, z: 2, ion: 'Fe²⁺' }, Ni: { name: 'Ni', E0: -0.25, z: 2, ion: 'Ni²⁺' },
  Pb: { name: 'Pb', E0: -0.13, z: 2, ion: 'Pb²⁺' }, Cu: { name: 'Cu', E0: 0.34, z: 2, ion: 'Cu²⁺' }, Ag: { name: 'Ag', E0: 0.80, z: 1, ion: 'Ag⁺' },
};
interface GaS { t: number; ca: number; cc: number; q: number; run: boolean }
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
function cellE(s: GaS, v: { an: string; ca: string }) {
  const A = METALS[v.an], K = METALS[v.ca], n = (A.z * K.z) / gcd(A.z, K.z);
  const Q = s.ca ** (n / A.z) / s.cc ** (n / K.z);
  return { E0: K.E0 - A.E0, n, Q, E: K.E0 - A.E0 - (0.025693 / n) * Math.log(Q) };
}
export const galvanic = defineSim<GaS>({
  id: 'galvanic_nernst', title: 'Galvanic Cell: Electrode Potentials & the Nernst Equation',
  ...meta(L1112, 'Advanced', 'Electrochemistry', 'Electrochemistry', 'EMF of a cell and the Nernst equation'),
  covers: ['Galvanic cell', 'Standard electrode potential', 'Nernst equation', 'Cell EMF', 'Electrochemical series'],
  tags: ['NCERT', 'JEE', 'NEET', 'Daniell cell', 'salt bridge', 'anode cathode', 'ΔG = -nFE', 'equilibrium constant'],
  learningObjectives: ['Compute E°cell = E°cathode − E°anode from the electrochemical series.', 'Use the Nernst equation to see how concentrations change EMF.', 'Watch the cell run down to E = 0 at equilibrium.'],
  assumptions: ['25 °C, concentrations used instead of activities; ideal salt bridge; 1 L half-cells.', 'Run speed is accelerated (ion concentrations change quickly) so the discharge is visible in seconds.'],
  blurb: 'Pick two metals. The cell EMF follows the Nernst equation from the ion concentrations; run the cell and the concentrations change until the EMF reaches zero (equilibrium).',
  hint: 'Anode is the metal with the lower reduction potential (oxidised). E = E° − (0.0257/n) ln Q with Q = [anode ion]^{n/za} / [cathode ion]^{n/zc}. At equilibrium E = 0 and ΔG = −nFE.',
  params: [
    { kind: 'select', id: 'an', label: 'Anode metal', value: 'Zn', options: Object.keys(METALS).map(k => ({ value: k, label: METALS[k].name })) },
    { kind: 'select', id: 'ca', label: 'Cathode metal', value: 'Cu', options: Object.keys(METALS).map(k => ({ value: k, label: METALS[k].name })) },
    { kind: 'number', id: 'lga', label: 'log₁₀ [anode ion]', min: -3, max: 0.5, step: 0.1, value: 0, digits: 1, resetOnChange: true },
    { kind: 'number', id: 'lgc', label: 'log₁₀ [cathode ion]', min: -3, max: 0.5, step: 0.1, value: 0, digits: 1, resetOnChange: true },
    { kind: 'toggle', id: 'run', label: 'Run the cell (discharge)', value: false },
  ],
  dt: 1 / 60, previewSeconds: 0,
  init(v) { return { t: 0, ca: 10 ** num(v, 'lga'), cc: 10 ** num(v, 'lgc'), q: 0, run: false }; },
  step(s, v, dt) {
    const a = str(v, 'an'), k = str(v, 'ca');
    if (a === k) return;
    const E = cellE(s, { an: a, ca: k }).E;
    s.t += dt;
    if (bool(v, 'run') && E > 0.0005) {
      const r = clamp(E, 0, 1.5) * 0.12 * dt; // mol/L converted per step (accelerated)
      const A = METALS[a], K = METALS[k];
      s.ca += r / A.z * 1; s.cc = Math.max(1e-6, s.cc - r / K.z); s.q += r;
    }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const a = str(v, 'an'), k = str(v, 'ca');
    if (a === k) { text(c, 'Choose two different metals', w / 2, h / 2, C.red, 14, 'center'); return; }
    const A = METALS[a], K = METALS[k], r = cellE(s, { an: a, ca: k }), E = r.E;
    const bw = w * 0.28, by = h * 0.42, bh = h * 0.42, lx = w * 0.12, rx = w * 0.6;
    // beakers
    for (const [x, met, conc, col, label] of [[lx, A, s.ca, 'rgba(96,165,250,0.35)', 'Anode (−) oxidation'], [rx, K, s.cc, 'rgba(34,211,238,0.35)', 'Cathode (+) reduction']] as const) {
      c.fillStyle = col; c.fillRect(x, by + bh * 0.2, bw, bh * 0.8); c.strokeStyle = C.axis; c.lineWidth = 2; c.strokeRect(x, by, bw, bh);
      c.fillStyle = '#cbd5e1'; c.fillRect(x + bw / 2 - 8, by - 36, 16, bh * 0.7 + 36);
      text(c, met.name, x + bw / 2, by - 40, C.white, 13, 'center', 'alphabetic', true);
      text(c, `${met.ion}  ${fmt(conc, 3)} M`, x + bw / 2, by + bh + 16, C.text, 11, 'center'); text(c, label, x + bw / 2, by + bh + 32, C.dim, 10, 'center');
    }
    // salt bridge & wire
    c.strokeStyle = C.amber; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(lx + bw * 0.78, by + bh * 0.4); c.lineTo(lx + bw * 0.78, by + bh * 0.1); c.lineTo(rx + bw * 0.22, by + bh * 0.1); c.lineTo(rx + bw * 0.22, by + bh * 0.4); c.stroke();
    text(c, 'salt bridge', (lx + bw + rx) / 2, by + bh * 0.1 - 8, C.amber, 10, 'center');
    const wy = by - 60; line(c, lx + bw / 2, by - 36, lx + bw / 2, wy, C.text, 2); line(c, rx + bw / 2, by - 36, rx + bw / 2, wy, C.text, 2); line(c, lx + bw / 2, wy, rx + bw / 2, wy, C.text, 2);
    const mx = (lx + rx + bw) / 2; panel(c, { x: mx - 38, y: wy - 18, w: 76, h: 36 }, '#0f172a'); text(c, `${fmt(Math.max(E, 0), 3)} V`, mx, wy + 6, E > 0.001 ? C.green : C.red, 15, 'center', 'alphabetic', true);
    if (bool(v, 'run') && E > 0.001) for (let i = 0; i < 6; i++) { const f = ((s.t * 0.7 + i / 6) % 1), x = lx + bw / 2 + f * (rx - lx); circle(c, x, wy, 3, C.cyan); }
    text(c, 'e⁻ flow anode → cathode', mx, wy - 26, C.dim, 10, 'center');
  },
  readouts(s, v) {
    const a = str(v, 'an'), k = str(v, 'ca'); if (a === k) return [{ label: 'Cell', value: 'choose two metals' }];
    const r = cellE(s, { an: a, ca: k });
    return [{ label: 'E° cell', value: r.E0, unit: 'V', digits: 3 }, { label: 'n (electrons)', value: r.n, digits: 0 }, { label: 'Q', value: r.Q, digits: 3 }, { label: 'EMF now', value: r.E, unit: 'V', digits: 3 },
      { label: 'ΔG', value: -r.n * 96485 * r.E / 1000, unit: 'kJ/mol', digits: 1 }, { label: 'K (equilibrium)', value: Math.exp(r.n * r.E0 / 0.025693), digits: 2 }];
  },
  equations(s, v) {
    const a = str(v, 'an'), k = str(v, 'ca'); if (a === k) return [];
    const r = cellE(s, { an: a, ca: k });
    return [`E^\\circ = ${fmt(METALS[k].E0, 2)} - (${fmt(METALS[a].E0, 2)}) = ${fmt(r.E0, 2)}\\ \\text{V}`, `E = E^\\circ - \\dfrac{0.0257}{${r.n}}\\ln Q = ${fmt(r.E, 3)}\\ \\text{V}`];
  },
});

export const SCHOOL_CHEM_SIMS = [bohrH, equilibrium, titration, maxwell, arrhenius, vsepr, galvanic];
void UG_SCI;
