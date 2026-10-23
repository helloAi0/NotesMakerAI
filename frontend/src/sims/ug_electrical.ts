import { defineSim, num, str, bool } from './types';
import type { AnySim, SimDef, Values } from './types';
import {
  C, TAU, arrow, circle, clamp, deg, drawScope, fmt, hsl, line, panel, plot, polyline, rad, Scope, text,
} from './draw';
import type { Ctx, Rect } from './draw';

/* Shared helpers for this file ------------------------------------------------ */
const mk = <S,>(d: SimDef<S>): AnySim =>
  defineSim<S>({ status: 'active', supportsSnapshot: true, supportsRestore: true, difficulty: 'Intermediate', educationLevels: ['B.Tech'], ...d });
const bg = (c: Ctx, w: number, h: number) => { c.fillStyle = C.bg; c.fillRect(0, 0, w, h); };
/** Two panels: side by side when wide, stacked when narrow. */
const split = (w: number, h: number, ratio = 0.5, gap = 8): [Rect, Rect] =>
  w >= 520
    ? [{ x: gap, y: gap, w: (w - 3 * gap) * ratio, h: h - 2 * gap }, { x: 2 * gap + (w - 3 * gap) * ratio, y: gap, w: (w - 3 * gap) * (1 - ratio), h: h - 2 * gap }]
    : [{ x: gap, y: gap, w: w - 2 * gap, h: (h - 3 * gap) * ratio }, { x: gap, y: 2 * gap + (h - 3 * gap) * ratio, w: w - 2 * gap, h: (h - 3 * gap) * (1 - ratio) }];
const small = (w: number) => w < 520;
/** Complex helpers. */
type Cx = [number, number];
const cadd = (a: Cx, b: Cx): Cx => [a[0] + b[0], a[1] + b[1]];
const csub = (a: Cx, b: Cx): Cx => [a[0] - b[0], a[1] - b[1]];
const cmul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a: Cx, b: Cx): Cx => { const d = b[0] * b[0] + b[1] * b[1] || 1e-300; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const cabs = (a: Cx) => Math.hypot(a[0], a[1]);
const carg = (a: Cx) => Math.atan2(a[1], a[0]);
const MU0 = 4e-7 * Math.PI, EPS0 = 8.854187817e-12, C0 = 299792458;

export const UG_ELECTRICAL_SIMS: AnySim[] = [];

/* ================================================================== */
/*  1. Plane wave propagation (Maxwell)                                */
/* ================================================================== */
interface EmS { ph: number }
function emMedium(v: Values) {
  const f = num(v, 'f') * 1e6, w = TAU * f, er = num(v, 'er'), sg = num(v, 'sigma');
  const eps = EPS0 * er, lt = sg / (w * eps);
  const r = Math.sqrt(1 + lt * lt), k0 = w * Math.sqrt(MU0 * eps);
  const alpha = k0 * Math.sqrt((r - 1) / 2), beta = k0 * Math.sqrt((r + 1) / 2);
  // eta = sqrt(j w mu / (sigma + j w eps))
  const den: Cx = [sg, w * eps];
  const q = cdiv([0, w * MU0], den);
  const m = Math.sqrt(cabs(q)), a = carg(q) / 2;
  return { w, alpha, beta, lt, eta: m, etaPh: a, lam: TAU / beta, vp: w / beta, delta: alpha > 0 ? 1 / alpha : Infinity };
}
UG_ELECTRICAL_SIMS.push(mk<EmS>({
  id: 'ug-em-plane-wave', title: 'Plane Waves & Maxwell\'s Equations', subject: 'Physics',
  category: 'Electromagnetics', topic: 'Maxwell\'s equations', subtopic: 'Uniform plane wave in lossless and lossy media',
  difficulty: 'Intermediate', educationLevels: ['B.Tech', 'B.Sc'],
  covers: ["Maxwell's equations and plane-wave propagation"],
  tags: ['EM waves', 'ECE', 'GATE', 'skin depth', 'polarisation', 'intrinsic impedance', 'electromagnetic theory'],
  learningObjectives: [
    'See that E, B and the direction of travel are mutually perpendicular and in phase in a lossless medium.',
    'Relate wavelength, phase velocity and intrinsic impedance to the permittivity and conductivity of the medium.',
    'Watch a conducting medium attenuate the wave with skin depth δ = 1/α and shift B behind E by the phase of η.',
  ],
  assumptions: ['Uniform plane wave, non-magnetic medium (μ = μ₀), linear isotropic material.', 'The wave is drawn in an oblique 3-D projection; B is drawn scaled by |η| so it has the same size as E.'],
  blurb: 'A uniform plane wave travels through air, glass, seawater or a metal-like conductor. Change polarisation, permittivity and conductivity and watch E and B, the wavelength and the decay envelope respond.',
  hint: 'Plane wave from Maxwell: E_x(z,t)=E0 e^{-αz} cos(ωt-βz). Lossless: α=0, η=√(μ/ε), E and B in phase. Lossy: γ=α+jβ=√(jωμ(σ+jωε)); skin depth δ=1/α; B lags E by the phase angle of η. Circular polarisation: Ex and Ey equal amplitude with 90 degree phase difference.',
  params: [
    { kind: 'number', id: 'f', label: 'Frequency', min: 1, max: 1000, step: 1, value: 100, unit: 'MHz' },
    { kind: 'number', id: 'er', label: 'Relative permittivity εr', min: 1, max: 81, step: 0.5, value: 1 },
    { kind: 'number', id: 'sigma', label: 'Conductivity σ', min: 0, max: 10, step: 0.05, value: 0, unit: 'S/m', digits: 2, help: 'Seawater ≈ 4 S/m, dry soil ≈ 0.01 S/m' },
    { kind: 'select', id: 'pol', label: 'Polarisation', value: 'x', options: [{ value: 'x', label: 'Linear (E along x)' }, { value: '45', label: 'Linear 45°' }, { value: 'rcp', label: 'Circular (right-hand)' }, { value: 'lcp', label: 'Circular (left-hand)' }] },
    { kind: 'toggle', id: 'showB', label: 'Show magnetic field B', value: true },
  ],
  previewSeconds: 0.6,
  init: () => ({ ph: 0 }),
  step(s, _v, dt) { s.ph += dt * TAU * 0.35; },
  draw(c, s, v, w, h) {
    bg(c, w, h);
    const m = emMedium(v), pol = str(v, 'pol');
    const lamD = TAU / (m.w * Math.sqrt(MU0 * EPS0 * num(v, 'er')));
    const zmax = 3 * lamD;
    const x0 = 24, x1 = w - 16, yc = h * 0.55, A = Math.min(h * 0.28, 120);
    const Z = (z: number) => x0 + (z / zmax) * (x1 - x0);
    const ax = pol === 'x' ? 1 : Math.SQRT1_2, ay = pol === 'x' ? 0 : Math.SQRT1_2;
    const dp = pol === 'rcp' ? -Math.PI / 2 : pol === 'lcp' ? Math.PI / 2 : 0;
    const ex: Cx = [0, -1], ey: Cx = [0.55, 0.42];
    const P = (z: number, vx: number, vy: number, k: number): [number, number] => [Z(z) + A * k * (vx * ex[0] + vy * ey[0]), yc + A * k * (vx * ex[1] + vy * ey[1])];
    line(c, x0, yc, x1, yc, C.axis, 1.5); text(c, 'z (direction of travel)', x1, yc + 18, C.dim, 10, 'right');
    arrow(c, x1 - 40, yc, x1, yc, C.axis, 1.5, 6);
    const N = 60, Ef: [number, number][] = [], Bf: [number, number][] = [], env: [number, number][] = [], env2: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const z = (i / N) * zmax, att = Math.exp(-m.alpha * z), phz = s.ph - m.beta * z;
      const Ex = ax * Math.cos(phz), Ey = ay * Math.cos(phz + dp);
      const pb = phz - m.etaPh, Exb = ax * Math.cos(pb), Eyb = ay * Math.cos(pb + dp);
      const Bx = -Eyb, By = Exb; // B = z x E / eta  (scaled by |eta|)
      const pe = P(z, Ex, Ey, att), pbv = P(z, Bx, By, att);
      Ef.push(pe); Bf.push(pbv);
      env.push(P(z, 1, 0, att)); env2.push(P(z, -1, 0, att));
      if (i % 2 === 0) {
        arrow(c, Z(z), yc, pe[0], pe[1], C.amber, 1.4, 5);
        if (bool(v, 'showB')) arrow(c, Z(z), yc, pbv[0], pbv[1], C.cyan, 1.4, 5);
      }
    }
    if (m.alpha > 0) { polyline(c, env, 'rgba(148,163,184,0.5)', 1, [4, 4]); polyline(c, env2, 'rgba(148,163,184,0.5)', 1, [4, 4]); }
    polyline(c, Ef, C.amber, 2.2);
    if (bool(v, 'showB')) polyline(c, Bf, C.cyan, 2.2);
    text(c, 'E', 14, 22, C.amber, 13, 'left', 'alphabetic', true);
    if (bool(v, 'showB')) text(c, 'B (×|η|)', 34, 22, C.cyan, 13, 'left', 'alphabetic', true);
    if (m.delta < zmax * 1.2) { const zd = m.delta; line(c, Z(zd), yc - A * 1.1, Z(zd), yc + A * 0.9, C.red, 1, [3, 3]); text(c, 'δ', Z(zd) + 3, yc - A * 1.05, C.red, 12); }
    text(c, `λ = ${fmt(m.lam, 3)} m`, 14, h - 10, C.text, 11);
    // polarisation hodograph
    if (!small(w)) {
      const r = { x: w - 108, y: 8, w: 98, h: 98 };
      panel(c, r); const cx = r.x + 49, cy = r.y + 52, R = 34;
      line(c, cx - R - 6, cy, cx + R + 6, cy, C.grid); line(c, cx, cy - R - 6, cx, cy + R + 6, C.grid);
      const pts: [number, number][] = [];
      for (let i = 0; i <= 40; i++) { const p = (i / 40) * TAU; pts.push([cx + R * ax * Math.cos(p), cy - R * ay * Math.cos(p + dp)]); }
      polyline(c, pts, 'rgba(251,191,36,0.4)', 1.5);
      circle(c, cx + R * ax * Math.cos(s.ph), cy - R * ay * Math.cos(s.ph + dp), 4, C.amber);
      text(c, 'E_x–E_y at fixed z', r.x + 6, r.y + 12, C.dim, 9);
    }
  },
  readouts: (_s, v) => {
    const m = emMedium(v);
    return [
      { label: 'Wavelength in medium', value: m.lam, unit: 'm', digits: 3 }, { label: 'Phase velocity', value: m.vp / C0, unit: 'c', digits: 3 },
      { label: '|η| intrinsic impedance', value: m.eta, unit: 'Ω', digits: 1 }, { label: 'Phase of η', value: deg(m.etaPh), unit: '°', digits: 1 },
      { label: 'Loss tangent σ/ωε', value: m.lt, digits: 3 }, { label: 'Skin depth δ', value: Number.isFinite(m.delta) ? m.delta : 'no loss', unit: Number.isFinite(m.delta) ? 'm' : '', digits: 3 },
    ];
  },
  equations: (_s, v) => {
    const m = emMedium(v);
    return [
      String.raw`\nabla\times\mathbf E=-\frac{\partial\mathbf B}{\partial t},\quad \nabla\times\mathbf H=\sigma\mathbf E+\varepsilon\frac{\partial\mathbf E}{\partial t}`,
      String.raw`\gamma=\alpha+j\beta=\sqrt{j\omega\mu(\sigma+j\omega\varepsilon)}:\ \alpha=${fmt(m.alpha, 3)}\ \text{Np/m},\ \beta=${fmt(m.beta, 2)}\ \text{rad/m}`,
      String.raw`|\eta|=${fmt(m.eta, 1)}\ \Omega,\quad \lambda=\frac{2\pi}{\beta}=${fmt(m.lam, 3)}\ \text{m}`,
    ];
  },
  derivation: {
    targetEquation: String.raw`E_x(z,t)=E_0 e^{-\alpha z}\cos(\omega t-\beta z)`,
    problemStatement: 'Show that Maxwell\'s equations in a source-free linear medium admit a wave solution and find its speed and impedance.',
    assumptions: ['Linear, homogeneous, isotropic medium.', 'Fields depend only on z (uniform plane wave) and have no z-component.', 'Time-harmonic dependence e^{jωt}.'],
    variableDefinitions: [{ symbol: 'ε', meaning: 'permittivity', unit: 'F/m' }, { symbol: 'μ', meaning: 'permeability', unit: 'H/m' }, { symbol: 'σ', meaning: 'conductivity', unit: 'S/m' }, { symbol: 'γ', meaning: 'propagation constant α+jβ', unit: '1/m' }],
    startingPrinciple: "Faraday's and Ampère–Maxwell laws.",
    steps: [
      { stepNumber: 1, title: 'Curl equations', math: String.raw`\nabla\times\mathbf E=-j\omega\mu\mathbf H,\quad \nabla\times\mathbf H=(\sigma+j\omega\varepsilon)\mathbf E`, explanation: 'Write Maxwell\'s curl equations in phasor form.' },
      { stepNumber: 2, title: 'Take the curl again', math: String.raw`\nabla\times\nabla\times\mathbf E=-j\omega\mu(\sigma+j\omega\varepsilon)\mathbf E`, explanation: 'Substitute H from the first equation into the second.' },
      { stepNumber: 3, title: 'Use the vector identity', math: String.raw`\nabla^2\mathbf E=\gamma^2\mathbf E,\quad \gamma^2=j\omega\mu(\sigma+j\omega\varepsilon)`, explanation: 'With ∇·E = 0, ∇×∇×E = −∇²E. This is the Helmholtz wave equation.', justification: 'No free charge in the medium.' },
      { stepNumber: 4, title: 'Solve for a z-travelling wave', math: String.raw`E_x(z)=E_0e^{-\gamma z}=E_0e^{-\alpha z}e^{-j\beta z}`, explanation: 'For fields depending only on z the equation becomes d²E_x/dz² = γ²E_x.' },
      { stepNumber: 5, title: 'Impedance from the curl', math: String.raw`\eta=\frac{E_x}{H_y}=\sqrt{\frac{j\omega\mu}{\sigma+j\omega\varepsilon}}`, explanation: 'H follows from Faraday\'s law; for σ = 0 this is the real number √(μ/ε).' },
    ],
    finalResult: String.raw`E_x(z,t)=E_0e^{-\alpha z}\cos(\omega t-\beta z),\quad v_p=\omega/\beta`,
    dimensionalCheck: 'γ has units of 1/m because ωμσ has units 1/m².',
    physicalInterpretation: 'In a lossless medium β = ω√(με) and E and H are in phase; conductivity makes α > 0 and puts H behind E by the angle of η.',
  },
}));

/* ================================================================== */
/*  2. Smith chart                                                     */
/* ================================================================== */
interface SmS { zr: number; zx: number; drag: boolean }
const gam = (zr: number, zx: number): Cx => cdiv([zr - 1, zx], [zr + 1, zx]);
function smithSolve(zr: number, zx: number) {
  // find d (in wavelengths, toward the generator) where Re(y_in)=1, then the open-stub length that cancels Im(y_in)
  const G = gam(zr, zx), sols: { d: number; b: number; l: number }[] = [];
  const yAt = (d: number): Cx => { const g = cmul(G, [Math.cos(-4 * Math.PI * d), Math.sin(-4 * Math.PI * d)]); const z = cdiv([1 + g[0], g[1]], [1 - g[0], -g[1]]); return cdiv([1, 0], z); };
  const n = 2000; let prev = yAt(0)[0] - 1;
  for (let i = 1; i <= n; i++) {
    const d = (0.5 * i) / n, cur = yAt(d)[0] - 1;
    if (prev * cur < 0) {
      let lo = (0.5 * (i - 1)) / n, hi = d;
      for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if ((yAt(lo)[0] - 1) * (yAt(mid)[0] - 1) <= 0) hi = mid; else lo = mid; }
      const dd = (lo + hi) / 2, b = yAt(dd)[1];
      let l = Math.atan(-b) / TAU; if (l < 0) l += 0.5;
      sols.push({ d: dd, b, l });
    }
    prev = cur;
  }
  return sols;
}
UG_ELECTRICAL_SIMS.push(mk<SmS>({
  id: 'ug-smith-chart', title: 'Smith Chart & Impedance Matching', subject: 'Electronics',
  category: 'RF & Microwave', topic: 'Transmission lines', subtopic: 'Smith chart, VSWR and single-stub matching',
  difficulty: 'Advanced', educationLevels: ['B.Tech'],
  covers: ['Smith Chart impedance matching'],
  tags: ['Smith chart', 'VSWR', 'stub matching', 'reflection coefficient', 'ECE', 'GATE', 'RF', 'microwave'],
  learningObjectives: ['Locate a load impedance on the chart and read the reflection coefficient and VSWR.', 'See that moving along a lossless line rotates Γ clockwise on a constant-|Γ| circle.', 'Find where a shunt stub placed at distance d brings the line to a perfect match.'],
  assumptions: ['Lossless transmission line, characteristic impedance Z₀ real.', 'The matching stub is a shunt open-circuited stub of the same Z₀ (susceptance j tan βl).'],
  blurb: 'Drag the load point on the Smith chart, slide along the line and watch Γ rotate on its VSWR circle. Then reveal the single shunt-stub solution that brings the input back to the centre.',
  hint: 'Γ=(z−1)/(z+1) with z=Z/Z0. VSWR=(1+|Γ|)/(1−|Γ|). Moving a distance d toward the generator rotates Γ by 2βd = 4πd/λ clockwise. A shunt stub at the distance where Re(y)=1 cancels the remaining susceptance so Γ=0.',
  params: [
    { kind: 'number', id: 'Z0', label: 'Line impedance Z₀', min: 25, max: 100, step: 5, value: 50, unit: 'Ω', resetOnChange: true },
    { kind: 'number', id: 'R', label: 'Load resistance R_L', min: 5, max: 300, step: 5, value: 100, unit: 'Ω', resetOnChange: true },
    { kind: 'number', id: 'X', label: 'Load reactance X_L', min: -300, max: 300, step: 5, value: 75, unit: 'Ω', resetOnChange: true },
    { kind: 'number', id: 'd', label: 'Distance toward generator', min: 0, max: 0.5, step: 0.005, value: 0.1, unit: 'λ', digits: 3 },
    { kind: 'toggle', id: 'stub', label: 'Show single-stub match', value: true },
  ],
  previewSeconds: 0,
  init: v => ({ zr: num(v, 'R') / num(v, 'Z0'), zx: num(v, 'X') / num(v, 'Z0'), drag: false }),
  step() { /* static */ },
  draw(c, s, v, w, h) {
    bg(c, w, h);
    const sz = small(w);
    const side = sz ? Math.min(w - 16, h * 0.7) : Math.min(h - 16, w * 0.58);
    const R = side / 2 - 6, cx = 8 + side / 2, cy = 8 + side / 2;
    const gx = (g: Cx) => cx + R * g[0], gy = (g: Cx) => cy - R * g[1];
    c.save(); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
    for (const r of [0, 0.2, 0.5, 1, 2, 5]) { c.beginPath(); c.arc(cx + R * r / (1 + r), cy, R / (1 + r), 0, TAU); c.strokeStyle = r === 1 ? 'rgba(52,211,153,0.6)' : C.grid; c.lineWidth = r === 1 ? 1.5 : 1; c.stroke(); }
    for (const x of [0.2, 0.5, 1, 2, 5]) for (const sg of [1, -1]) { c.beginPath(); c.arc(cx + R, cy - sg * R / x, R / x, 0, TAU); c.strokeStyle = C.grid; c.lineWidth = 1; c.stroke(); }
    line(c, cx - R, cy, cx + R, cy, C.grid); c.restore();
    circle(c, cx, cy, R, undefined, C.axis, 1.5);
    text(c, 'z = 1', cx + 3, cy + 12, C.green, 9);
    const G = gam(s.zr, s.zx), mag = cabs(G), d = num(v, 'd');
    circle(c, cx, cy, R * mag, undefined, C.amber, 1.5);
    const rot = (g: Cx, dd: number): Cx => cmul(g, [Math.cos(-4 * Math.PI * dd), Math.sin(-4 * Math.PI * dd)]);
    const arc: [number, number][] = []; for (let i = 0; i <= 40; i++) { const g = rot(G, (d * i) / 40); arc.push([gx(g), gy(g)]); }
    polyline(c, arc, C.cyan, 2.5);
    const Gd = rot(G, d);
    circle(c, gx(G), gy(G), 6, C.amber, C.white, 1.5); circle(c, gx(Gd), gy(Gd), 5, C.cyan, C.white, 1.5);
    text(c, 'load', gx(G) + 8, gy(G) - 6, C.amber, 10); text(c, 'at d', gx(Gd) + 8, gy(Gd) + 12, C.cyan, 10);
    const sols = smithSolve(s.zr, s.zx);
    if (bool(v, 'stub') && sols.length) {
      const g1 = rot(G, sols[0].d);
      circle(c, gx(g1), gy(g1), 5, C.green, C.white, 1.5); text(c, 'stub here', gx(g1) + 8, gy(g1) - 6, C.green, 10);
      circle(c, cx, cy, 6, undefined, C.green, 2);
    }
    // info column
    const ix = sz ? 8 : side + 20, iy = sz ? side + 18 : 20;
    const Zin = cdiv([1 + Gd[0], Gd[1]], [1 - Gd[0], -Gd[1]]), Z0 = num(v, 'Z0');
    const lines = [
      `Load  z = ${fmt(s.zr, 2)} ${s.zx < 0 ? '−' : '+'} j${fmt(Math.abs(s.zx), 2)}`,
      `|Γ| = ${fmt(mag, 3)}   ∠Γ = ${fmt(deg(carg(G)), 1)}°`,
      `VSWR = ${mag < 0.9999 ? fmt((1 + mag) / (1 - mag), 2) : '∞'}`,
      `Z_in(d) = ${fmt(Zin[0] * Z0, 1)} ${Zin[1] < 0 ? '−' : '+'} j${fmt(Math.abs(Zin[1] * Z0), 1)} Ω`,
    ];
    if (bool(v, 'stub') && sols.length) lines.push(`Stub: d = ${fmt(sols[0].d, 3)} λ, length = ${fmt(sols[0].l, 3)} λ`);
    lines.forEach((t, i) => text(c, t, ix, iy + i * 18, i === 4 ? C.green : C.text, sz ? 10 : 12));
    if (!sz) text(c, 'drag the amber load point', ix, h - 14, C.dim, 10);
  },
  pointer(s, _v, e) {
    const side = e.w < 520 ? Math.min(e.w - 16, e.h * 0.7) : Math.min(e.h - 16, e.w * 0.58);
    const R = side / 2 - 6, cx = 8 + side / 2, cy = 8 + side / 2;
    if (e.kind === 'up') { s.drag = false; return; }
    const gx = (e.x - cx) / R, gy = -(e.y - cy) / R;
    if (e.kind === 'down') { const G = gam(s.zr, s.zx); if (Math.hypot(gx - G[0], gy - G[1]) < 0.12) s.drag = true; }
    if (s.drag) {
      let m = Math.hypot(gx, gy); const gxs = m > 0.98 ? (gx / m) * 0.98 : gx, gys = m > 0.98 ? (gy / m) * 0.98 : gy; m = Math.min(m, 0.98);
      const z = cdiv([1 + gxs, gys], [1 - gxs, -gys]); s.zr = Math.max(0.02, z[0]); s.zx = z[1];
    }
  },
  readouts: (s, v) => {
    const G = gam(s.zr, s.zx), mag = cabs(G), sols = smithSolve(s.zr, s.zx);
    return [
      { label: '|Γ|', value: mag, digits: 3 }, { label: 'VSWR', value: mag < 0.9999 ? (1 + mag) / (1 - mag) : '∞', digits: 2 },
      { label: 'Return loss', value: mag > 1e-6 ? -20 * Math.log10(mag) : '∞', unit: mag > 1e-6 ? 'dB' : '', digits: 1 },
      { label: 'Load Z', value: `${fmt(s.zr * num(v, 'Z0'), 1)} ${s.zx < 0 ? '−' : '+'} j${fmt(Math.abs(s.zx * num(v, 'Z0')), 1)} Ω` },
      { label: 'Stub position d', value: sols.length ? sols[0].d : '-', unit: sols.length ? 'λ' : '', digits: 3 }, { label: 'Stub length', value: sols.length ? sols[0].l : '-', unit: sols.length ? 'λ' : '', digits: 3 },
    ];
  },
  equations: (s, v) => {
    const G = gam(s.zr, s.zx), mag = cabs(G);
    return [String.raw`\Gamma=\frac{z_L-1}{z_L+1}=${fmt(mag, 3)}\angle${fmt(deg(carg(G)), 1)}^\circ,\quad \text{VSWR}=\frac{1+|\Gamma|}{1-|\Gamma|}=${mag < 0.9999 ? fmt((1 + mag) / (1 - mag), 2) : '\\infty'}`, String.raw`\Gamma(d)=\Gamma_L\,e^{-j4\pi d/\lambda},\quad d=${fmt(num(v, 'd'), 3)}\lambda`];
  },
}));

/* ================================================================== */
/*  3. Rectangular waveguide modes                                     */
/* ================================================================== */
interface WgS { ph: number }
const wgModes = (a: number, b: number) => {
  const out: { m: number; n: number; type: 'TE' | 'TM'; fc: number }[] = [];
  for (let m = 0; m <= 3; m++) for (let n = 0; n <= 3; n++) {
    if (m === 0 && n === 0) continue;
    const fc = (C0 / 2) * Math.sqrt((m / a) ** 2 + (n / b) ** 2);
    out.push({ m, n, type: 'TE', fc }); if (m >= 1 && n >= 1) out.push({ m, n, type: 'TM', fc });
  }
  return out.sort((p, q) => p.fc - q.fc);
};
UG_ELECTRICAL_SIMS.push(mk<WgS>({
  id: 'ug-waveguide-modes', title: 'Waveguide TE/TM Modes', subject: 'Electronics',
  category: 'RF & Microwave', topic: 'Waveguides', subtopic: 'Boundary conditions, cutoff and field patterns',
  difficulty: 'Advanced', educationLevels: ['B.Tech'],
  covers: ['Waveguide boundary conditions and TE/TM modes'],
  tags: ['waveguide', 'TE10', 'cutoff frequency', 'ECE', 'GATE', 'microwave', 'guide wavelength'],
  learningObjectives: ['Understand how the boundary condition E_tan = 0 on the metal walls creates discrete modes.', 'Compute the cutoff frequency f_c of TE_mn and TM_mn modes and see which modes propagate at a given frequency.', 'Relate guide wavelength and group velocity to f/f_c.'],
  assumptions: ['Perfectly conducting walls, air-filled rectangular guide with b = a/2.', 'Lossless propagation above cutoff; below cutoff the field is evanescent.'],
  blurb: 'Choose a mode in a rectangular metal guide and see its field pattern, its cutoff frequency, and whether your operating frequency lets it propagate.',
  hint: 'f_c=(c/2)√((m/a)²+(n/b)²). TE_mn: m,n not both 0; TM_mn: m,n ≥ 1. Above cutoff β=k√(1−(f_c/f)²), λ_g>λ, v_g=c√(1−(f_c/f)²) and v_p v_g=c². Below cutoff the wave decays exponentially.',
  params: [
    { kind: 'select', id: 'type', label: 'Mode family', value: 'TE', options: [{ value: 'TE', label: 'TE (no E in direction of travel)' }, { value: 'TM', label: 'TM (no H in direction of travel)' }] },
    { kind: 'number', id: 'm', label: 'Index m (along a)', min: 0, max: 3, step: 1, value: 1, digits: 0 },
    { kind: 'number', id: 'n', label: 'Index n (along b)', min: 0, max: 3, step: 1, value: 0, digits: 0 },
    { kind: 'number', id: 'a', label: 'Broad wall a', min: 10, max: 40, step: 0.5, value: 22.86, unit: 'mm', digits: 2 },
    { kind: 'number', id: 'f', label: 'Operating frequency', min: 2, max: 30, step: 0.1, value: 10, unit: 'GHz', digits: 1 },
  ],
  previewSeconds: 0.5,
  init: () => ({ ph: 0 }),
  step(s, _v, dt) { s.ph += dt * 3; },
  draw(c, s, v, w, h) {
    bg(c, w, h);
    const a = num(v, 'a') * 1e-3, b = a / 2, m = Math.round(num(v, 'm')), n = Math.round(num(v, 'n')), tm = str(v, 'type') === 'TM';
    const [pa, pb] = split(w, h, 0.5);
    panel(c, pa);
    const valid = !(m === 0 && n === 0) && !(tm && (m < 1 || n < 1));
    const gw = pa.w - 20, gh = Math.min(pa.h - 40, gw / 2), gx = pa.x + 10, gy = pa.y + 26 + (pa.h - 40 - gh) / 2;
    text(c, `${tm ? 'TM' : 'TE'}${m}${n} cross-section (a × b)`, pa.x + 8, pa.y + 14, C.text, 11, 'left', 'alphabetic', true);
    if (valid) {
      const nx = Math.max(12, Math.round(gw / 8)), ny = Math.max(6, Math.round(gh / 8)), cw = gw / nx, ch = gh / ny;
      const pul = Math.cos(s.ph);
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        const xx = ((i + 0.5) / nx) * a, yy = ((j + 0.5) / ny) * b;
        let val: number;
        if (tm) val = Math.sin((m * Math.PI * xx) / a) * Math.sin((n * Math.PI * yy) / b); // Ez
        else { const ex = (n / b) * Math.cos((m * Math.PI * xx) / a) * Math.sin((n * Math.PI * yy) / b), ey = (m / a) * Math.sin((m * Math.PI * xx) / a) * Math.cos((n * Math.PI * yy) / b); val = Math.hypot(ex, ey) / Math.hypot(Math.max(m / a, 1e-9), Math.max(n / b, 1e-9)); }
        const t = clamp(val * (tm ? pul : 1), -1, 1);
        c.fillStyle = tm ? (t >= 0 ? `rgba(251,191,36,${Math.abs(t)})` : `rgba(96,165,250,${Math.abs(t)})`) : `rgba(52,211,153,${clamp(Math.abs(val), 0, 1) * (0.35 + 0.65 * Math.abs(pul))})`;
        c.fillRect(gx + i * cw, gy + (ny - 1 - j) * ch, cw + 0.5, ch + 0.5);
      }
      if (!tm) {
        for (let i = 0; i < 9; i++) for (let j = 0; j < 5; j++) {
          const xx = ((i + 0.5) / 9) * a, yy = ((j + 0.5) / 5) * b;
          const ex = (n / b) * Math.cos((m * Math.PI * xx) / a) * Math.sin((n * Math.PI * yy) / b), ey = (m / a) * Math.sin((m * Math.PI * xx) / a) * Math.cos((n * Math.PI * yy) / b);
          const L = Math.hypot(ex, ey) / Math.hypot(Math.max(m / a, 1e-9), Math.max(n / b, 1e-9)) * 10 * Math.sign(pul || 1), q = Math.hypot(ex, ey) || 1;
          const px = gx + ((i + 0.5) / 9) * gw, py = gy + gh - ((j + 0.5) / 5) * gh;
          if (q > 1e-6) arrow(c, px - (ex / q) * L * 0.5, py + (ey / q) * L * 0.5, px + (ex / q) * L * 0.5, py - (ey / q) * L * 0.5, C.white, 1, 4);
        }
      }
    } else text(c, 'This mode does not exist', gx + gw / 2, gy + gh / 2, C.red, 12, 'center');
    c.strokeStyle = C.axis; c.lineWidth = 3; c.strokeRect(gx, gy, gw, gh);
    text(c, 'metal wall: E_tangential = 0', gx, gy + gh + 14, C.dim, 9);
    // cutoff chart
    panel(c, pb); const modes = wgModes(a, b).slice(0, 10), fmax = 30, f = num(v, 'f');
    text(c, 'Cutoff frequencies (GHz)', pb.x + 8, pb.y + 14, C.text, 11, 'left', 'alphabetic', true);
    const x0 = pb.x + 12, x1 = pb.x + pb.w - 12, Y = pb.y + 40, rowH = Math.min(18, (pb.h - 70) / Math.max(1, modes.length));
    const FX = (g: number) => x0 + (g / fmax) * (x1 - x0);
    line(c, x0, Y + modes.length * rowH + 4, x1, Y + modes.length * rowH + 4, C.axis);
    [0, 10, 20, 30].forEach(g => text(c, `${g}`, FX(g), Y + modes.length * rowH + 16, C.dim, 9, 'center'));
    modes.forEach((md, i) => {
      const fcg = md.fc / 1e9, y = Y + i * rowH, sel = md.m === m && md.n === n && (md.type === 'TM') === tm;
      line(c, FX(fcg), y + rowH / 2, FX(fmax), y + rowH / 2, fcg < f ? 'rgba(52,211,153,0.55)' : 'rgba(148,163,184,0.18)', 4);
      circle(c, FX(fcg), y + rowH / 2, 3.5, sel ? C.amber : C.cyan);
      if (fcg < 28) text(c, `${md.type}${md.m}${md.n}`, FX(fcg) + 6, y + rowH / 2 + 3, sel ? C.amber : C.dim, 9);
    });
    line(c, FX(f), Y - 6, FX(f), Y + modes.length * rowH + 4, C.red, 2); text(c, 'f', FX(f) + 3, Y - 8, C.red, 10, 'left', 'alphabetic', true);
  },
  readouts: (_s, v) => {
    const a = num(v, 'a') * 1e-3, b = a / 2, m = Math.round(num(v, 'm')), n = Math.round(num(v, 'n')), tm = str(v, 'type') === 'TM', f = num(v, 'f') * 1e9;
    const valid = !(m === 0 && n === 0) && !(tm && (m < 1 || n < 1));
    if (!valid) return [{ label: 'Mode', value: 'does not exist' }];
    const fc = (C0 / 2) * Math.sqrt((m / a) ** 2 + (n / b) ** 2), r = fc / f, prop = r < 1, root = Math.sqrt(Math.abs(1 - r * r));
    return [
      { label: 'Cutoff fc', value: fc / 1e9, unit: 'GHz', digits: 3 }, { label: 'f / fc', value: f / fc, digits: 3 }, { label: 'Status', value: prop ? 'propagates' : 'evanescent (cut off)' },
      { label: 'Guide wavelength λg', value: prop ? (C0 / f) / root : '-', unit: prop ? 'mm' : '', digits: 2 }, { label: 'Group velocity', value: prop ? root : 0, unit: 'c', digits: 3 },
      { label: prop ? 'Phase velocity' : 'Attenuation', value: prop ? 1 / root : (TAU / C0) * Math.sqrt(fc * fc - f * f), unit: prop ? 'c' : 'Np/m', digits: 3 },
    ];
  },
  equations: (_s, v) => {
    const a = num(v, 'a') * 1e-3, b = a / 2, m = Math.round(num(v, 'm')), n = Math.round(num(v, 'n'));
    const fc = (C0 / 2) * Math.sqrt((m / a) ** 2 + (n / b) ** 2), f = num(v, 'f') * 1e9;
    return [String.raw`f_c=\frac{c}{2}\sqrt{\left(\frac ma\right)^2+\left(\frac nb\right)^2}=${fmt(fc / 1e9, 3)}\ \text{GHz}`, String.raw`\beta=\frac{2\pi f}{c}\sqrt{1-\left(\frac{f_c}{f}\right)^2},\quad v_g=c\sqrt{1-(f_c/f)^2},\quad v_pv_g=c^2`, String.raw`\frac{f}{f_c}=${fmt(f / fc, 3)}`];
  },
}));
