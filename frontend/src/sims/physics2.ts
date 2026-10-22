import { defineSim, num, bool } from './types';
import {
  C, TAU, arrow, circle, clamp, deg, drawScope, fmt, line, panel, plot, polyline, rad, Scope, text, wavelengthToRgb,
} from './draw';

/* ================================================================== */
/*  Two-source wave interference                                       */
/* ================================================================== */

interface WvS { t: number; px: number; py: number; sc: Scope; drag: boolean }
export const interference = defineSim<WvS>({
  id: 'interference', title: 'Wave Interference', subject: 'Physics',
  blurb: 'Two coherent sources make a pattern of bright and dark fans. Drag the probe around and watch its signal switch between double amplitude and silence.',
  hint: 'Superposition of two circular waves. Constructive interference where path difference = n·lambda, destructive at (n+1/2)·lambda. Number of nodal lines grows with source separation / wavelength. Probe signal shows amplitude at one point.',
  params: [
    { kind: 'number', id: 'lam', label: 'Wavelength', min: 20, max: 120, step: 1, value: 60, unit: 'px' },
    { kind: 'number', id: 'd', label: 'Source separation', min: 40, max: 300, step: 2, value: 140, unit: 'px' },
    { kind: 'number', id: 'f', label: 'Frequency', min: 0.3, max: 3, step: 0.05, value: 1, unit: 'Hz' },
    { kind: 'number', id: 'ph', label: 'Phase offset', min: 0, max: 180, step: 5, value: 0, unit: '°' },
    { kind: 'toggle', id: 'two', label: 'Second source on', value: true },
  ],
  dt: 1 / 120, previewSeconds: 1,
  init() { return { t: 0, px: 0.62, py: 0.3, sc: new Scope(1, 1200), drag: false }; },
  step(s, v, dt) {
    s.t += dt;
    const geo = layout(s, v, 700, 440);
    const a = field(geo.px, geo.py, geo, v, s.t);
    if (Math.round(s.t / dt) % 3 === 0) s.sc.push(s.t, a);
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const g = layout(s, v, w, h);
    const cell = 6;
    for (let y = g.top; y < g.top + g.fh; y += cell) for (let x = 0; x < g.fw; x += cell) {
      const a = field(x + cell / 2, y + cell / 2, g, v, s.t) / 2; // -1..1
      const m = Math.abs(a);
      c.fillStyle = a >= 0 ? `rgb(${30 + 40 * m | 0},${60 + 120 * m | 0},${110 + 140 * m | 0})` : `rgb(${40 + 120 * m | 0},${40 + 20 * m | 0},${70 + 30 * m | 0})`;
      c.fillRect(x, y, cell, cell);
    }
    g.srcs.forEach(p => { circle(c, p[0], p[1], 7, C.amber, C.white, 1.5); });
    circle(c, g.px, g.py, 9, undefined, C.green, 2.5); line(c, g.px - 13, g.py, g.px + 13, g.py, C.green, 1.5); line(c, g.px, g.py - 13, g.px, g.py + 13, C.green, 1.5);
    text(c, 'probe (drag me)', g.px + 14, g.py - 10, C.green, 11);
    drawScope(c, { x: 8, y: g.top + g.fh + 6, w: w - 16, h: h - g.top - g.fh - 12 }, s.sc, [C.green], { title: 'Probe signal', window: 6, ymin: -2.3, ymax: 2.3 });
  },
  pointer(s, _v, e) {
    if (e.kind === 'up') { s.drag = false; return; }
    if (e.kind === 'down') s.drag = true;
    if (s.drag) { s.px = clamp(e.x / e.w, 0.1, 0.98); s.py = clamp((e.y - 8) / (e.h * 0.62), 0.02, 0.98); s.sc.clear(); }
  },
  readouts: (s, v) => {
    const g = layout(s, v, 700, 440);
    const d1 = Math.hypot(g.px - g.srcs[0][0], g.py - g.srcs[0][1]), d2 = Math.hypot(g.px - g.srcs[1][0], g.py - g.srcs[1][1]);
    const diff = Math.abs(d1 - d2) / num(v, 'lam');
    const frac = Math.abs(diff - Math.round(diff));
    return [
      { label: 'Path difference', value: diff, unit: 'λ', digits: 2 }, { label: 'Probe type', value: !bool(v, 'two') ? 'single source' : frac < 0.15 ? 'constructive' : frac > 0.35 ? 'destructive' : 'in between' },
      { label: 'Nodal lines', value: Math.floor((2 * num(v, 'd')) / num(v, 'lam')), digits: 0 },
    ];
  },
  derivation: {
    targetEquation: 'd \\sin\\theta = n\\lambda',
    problemStatement: 'Double-Source Wave Interference and Fringe Condition Derivation',
    assumptions: [
      'Two monochromatic, mutually coherent point sources oscillating in phase.',
      'Far-field condition: screen distance L >> slit separation d.',
      'Linear wave superposition holds (no medium non-linearities).',
    ],
    variableDefinitions: [
      { symbol: 'd', meaning: 'Distance between coherent wave sources', unit: 'm / px' },
      { symbol: '\\lambda', meaning: 'Wavelength of radiated wave', unit: 'm / px' },
      { symbol: '\\theta', meaning: 'Diffraction angle from central axis', unit: 'rad / °' },
      { symbol: '\\Delta r', meaning: 'Path length difference |r₁ - r₂|', unit: 'm / px' },
      { symbol: 'n', meaning: 'Integer fringe order (0, ±1, ±2...)', unit: 'dimensionless' },
    ],
    startingPrinciple: 'Superposition principle: total amplitude is the algebraic sum of component field wavefunctions',
    steps: [
      {
        stepNumber: 1,
        title: 'Wave Superposition and Phase Difference',
        math: '\\psi(r, t) = A_1 \\cos(k r_1 - \\omega t) + A_2 \\cos(k r_2 - \\omega t + \\phi)',
        explanation: 'At any field point P(x, y), the resulting oscillation is the sum of wave disturbances travelling paths r₁ and r₂ from the sources.',
        justification: 'Linear wave equation permits direct superposition of disturbances.',
        intermediateResult: '\\Delta \\phi = k(r_2 - r_1) = \\frac{2\\pi}{\\lambda} \\Delta r',
        highlightKey: 'superposition',
      },
      {
        stepNumber: 2,
        title: 'Geometric Path Difference in Far-Field',
        math: '\\Delta r = r_2 - r_1 \\approx d \\sin\\theta',
        explanation: 'For distances much larger than separation d, rays from S₁ and S₂ are approximately parallel, forming a right-angled triangle with opposite side d sin θ.',
        justification: 'First-order Taylor expansion of hypotenuse distance difference as L → ∞.',
        intermediateResult: '\\Delta r = d \\sin\\theta',
        highlightKey: 'path_difference',
      },
      {
        stepNumber: 3,
        title: 'Constructive Interference (Bright Fringes)',
        math: '\\Delta r = n\\lambda \\implies d \\sin\\theta_n = n\\lambda \\quad (n = 0, \\pm 1, \\pm 2, \\dots)',
        explanation: 'Constructive interference occurs when wave crests arrive simultaneously in phase, requiring path difference to be an integer multiple of λ.',
        justification: 'Phase difference Δφ = 2πn gives cos(Δφ) = 1, maximizing squared intensity I ∝ 4A².',
        intermediateResult: '\\sin\\theta_n = \\frac{n\\lambda}{d}',
        highlightKey: 'constructive',
      },
      {
        stepNumber: 4,
        title: 'Destructive Interference (Nodal Lines / Dark Fringes)',
        math: '\\Delta r = \\left(n + \\frac{1}{2}\\right)\\lambda \\implies d \\sin\\theta = \\left(n + \\frac{1}{2}\\right)\\lambda',
        explanation: 'Crests from one source meet troughs from the other, cancelling completely to produce silence / zero intensity nodes.',
        justification: 'Phase difference Δφ = (2n+1)π gives cos(Δφ) = -1, yielding zero total field.',
        intermediateResult: 'I(\\theta) = 4 I_0 \\cos^2\\left(\\frac{\\pi d \\sin\\theta}{\\lambda}\\right)',
        highlightKey: 'destructive',
      },
    ],
    finalResult: 'd \\sin\\theta = n\\lambda \\quad \\text{(Max)} \\qquad d \\sin\\theta = \\left(n + \\tfrac{1}{2}\\right)\\lambda \\quad \\text{(Min)}',
    dimensionalCheck: 'Both sides of d sin θ = nλ have units of length [L].',
    physicalInterpretation: 'Stationary spatial interference fringes emerge due to alternating constructive and destructive phase relationships across space.',
  },
  equations: (_s, v) => [
    String.raw`\Delta r=n\lambda\ \text{(bright)}\qquad \Delta r=\left(n+\tfrac12\right)\lambda\ \text{(dark)}`,
    String.raw`d\sin\theta=n\lambda\;\Rightarrow\;\theta_1=${fmt(deg(Math.asin(Math.min(1, num(v, 'lam') / num(v, 'd')))), 1)}^\circ`,
  ],
});
function layout(s: WvS, v: Record<string, number | string | boolean>, w: number, h: number) {
  const fh = h * 0.62, top = 8, fw = w;
  const cy = top + fh / 2, d = num(v, 'd'), sx = 40;
  const srcs: [number, number][] = [[sx, cy - d / 2], [sx, cy + d / 2]];
  return { fw, fh, top, srcs, px: s.px * w, py: top + s.py * fh };
}
function field(x: number, y: number, g: ReturnType<typeof layout>, v: Record<string, number | string | boolean>, t: number) {
  const k = TAU / num(v, 'lam'), om = TAU * num(v, 'f'), ph = rad(num(v, 'ph'));
  const r1 = Math.hypot(x - g.srcs[0][0], y - g.srcs[0][1]), r2 = Math.hypot(x - g.srcs[1][0], y - g.srcs[1][1]);
  const a1 = Math.cos(k * r1 - om * t) * Math.min(1, 40 / (r1 + 20) + 0.45);
  const a2 = bool(v, 'two') ? Math.cos(k * r2 - om * t + ph) * Math.min(1, 40 / (r2 + 20) + 0.45) : 0;
  return a1 + a2;
}

/* ================================================================== */
/*  Refraction, Snell's law and total internal reflection              */
/* ================================================================== */

interface RfS { t: number }
const fresnel = (n1: number, n2: number, ti: number) => {
  const si = (n1 / n2) * Math.sin(ti);
  if (si >= 1) return { R: 1, tt: NaN };
  const tt = Math.asin(si), ci = Math.cos(ti), ct = Math.cos(tt);
  const rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct), rp = (n2 * ci - n1 * ct) / (n2 * ci + n1 * ct);
  return { R: (rs * rs + rp * rp) / 2, tt };
};
export const refraction = defineSim<RfS>({
  id: 'refraction', title: 'Light & Refraction', subject: 'Physics',
  blurb: 'Bend a laser at the boundary between two materials. See Snell\'s law, the critical angle, total internal reflection and how much light is reflected.',
  hint: 'Snell: n1 sin(t1)=n2 sin(t2). Going from high to low index the ray bends away from the normal; beyond the critical angle asin(n2/n1) there is total internal reflection. Reflectance from Fresnel equations (average polarisation); at Brewster-like angles reflection dips.',
  params: [
    { kind: 'number', id: 'n1', label: 'Index of upper material n₁', min: 1, max: 2.5, step: 0.01, value: 1 },
    { kind: 'number', id: 'n2', label: 'Index of lower material n₂', min: 1, max: 2.5, step: 0.01, value: 1.5 },
    { kind: 'number', id: 'ang', label: 'Angle of incidence', min: 0, max: 89, step: 1, value: 45, unit: '°' },
    { kind: 'number', id: 'wl', label: 'Light colour (wavelength)', min: 400, max: 700, step: 5, value: 560, unit: 'nm' },
    { kind: 'toggle', id: 'flip', label: 'Light comes from below (swap materials)', value: false },
  ],
  previewSeconds: 0.2,
  init() { return { t: 0 }; },
  step(s, _v, dt) { s.t += dt; },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const a = bool(v, 'flip') ? [num(v, 'n2'), num(v, 'n1')] : [num(v, 'n1'), num(v, 'n2')];
    const n1 = a[0], n2 = a[1];
    const cx = w * 0.5, cy = h * 0.52, R = Math.min(w, h) * 0.42;
    const grad = (y0: number, y1: number, n: number) => { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, `rgba(96,165,250,${0.05 + (n - 1) * 0.16})`); g.addColorStop(1, `rgba(96,165,250,${0.1 + (n - 1) * 0.2})`); return g; };
    c.fillStyle = grad(0, cy, n1); c.fillRect(0, 0, w, cy);
    c.fillStyle = grad(cy, h, n2); c.fillRect(0, cy, w, h - cy);
    line(c, 0, cy, w, cy, C.axis, 1.5);
    line(c, cx, cy - R * 1.05, cx, cy + R * 1.05, C.dim, 1, [5, 5]);
    text(c, `n₁ = ${fmt(n1, 2)}`, 12, 22, C.text, 13, 'left', 'alphabetic', true); text(c, `n₂ = ${fmt(n2, 2)}`, 12, h - 14, C.text, 13, 'left', 'alphabetic', true);
    const ti = rad(num(v, 'ang')), fr = fresnel(n1, n2, ti);
    const [r, g, b] = wavelengthToRgb(num(v, 'wl')); const col = `rgb(${r},${g},${b})`;
    const beam = (x1: number, y1: number, x2: number, y2: number, I: number) => {
      if (I < 0.003) return;
      c.save(); c.globalAlpha = clamp(0.15 + I * 0.85, 0, 1); line(c, x1, y1, x2, y2, col, 2 + I * 3); c.restore();
      const len = Math.hypot(x2 - x1, y2 - y1); const nd = Math.floor(len / 26);
      for (let i = 0; i < nd; i++) { const p = ((i + (s.t * 1.6) % 1) / nd); circle(c, x1 + (x2 - x1) * p, y1 + (y2 - y1) * p, 2.5, 'rgba(255,255,255,0.9)'); }
    };
    // incident from top-left (or bottom-left when flipped)
    const sgn = bool(v, 'flip') ? 1 : -1; // y direction of incoming source side
    const ix = cx - Math.sin(ti) * R, iy = cy + sgn * Math.cos(ti) * R;
    beam(ix, iy, cx, cy, 1);
    beam(cx, cy, cx + Math.sin(ti) * R, cy + sgn * Math.cos(ti) * R, fr.R);
    if (Number.isFinite(fr.tt)) beam(cx, cy, cx + Math.sin(fr.tt) * R, cy - sgn * Math.cos(fr.tt) * R, 1 - fr.R);
    else text(c, 'TOTAL INTERNAL REFLECTION', cx, cy + (bool(v, 'flip') ? 40 : -30) * (bool(v, 'flip') ? -1 : 1), C.amber, 13, 'center', 'alphabetic', true);
    text(c, `${fmt(num(v, 'ang'), 0)}°`, cx - 40, cy + sgn * 30, C.amber, 12, 'center');
    if (Number.isFinite(fr.tt)) text(c, `${fmt(deg(fr.tt), 1)}°`, cx + 40, cy - sgn * 36, C.cyan, 12, 'center');
    if (n1 > n2) { const cr = Math.asin(n2 / n1); text(c, `critical angle ${fmt(deg(cr), 1)}°`, w - 12, 22, C.dim, 12, 'right'); }
  },
  readouts: (_s, v) => {
    const flip = bool(v, 'flip'), n1 = flip ? num(v, 'n2') : num(v, 'n1'), n2 = flip ? num(v, 'n1') : num(v, 'n2');
    const fr = fresnel(n1, n2, rad(num(v, 'ang')));
    return [
      { label: 'Refracted angle', value: Number.isFinite(fr.tt) ? deg(fr.tt) : 'none (TIR)', unit: Number.isFinite(fr.tt) ? '°' : '', digits: 1 },
      { label: 'Reflected', value: fr.R * 100, unit: '%', digits: 1 }, { label: 'Transmitted', value: (1 - fr.R) * 100, unit: '%', digits: 1 },
      { label: 'Light speed in n₂', value: 299.8 / n2, unit: '×10⁶ m/s', digits: 1 },
    ];
  },
  equations: (_s, v) => {
    const flip = bool(v, 'flip'), n1 = flip ? num(v, 'n2') : num(v, 'n1'), n2 = flip ? num(v, 'n1') : num(v, 'n2');
    return [String.raw`n_1\sin\theta_1=n_2\sin\theta_2\;\Rightarrow\;${fmt(n1, 2)}\sin ${fmt(num(v, 'ang'), 0)}^\circ=${fmt(n2, 2)}\sin\theta_2`];
  },
});

/* ================================================================== */
/*  Thin lens ray diagram                                              */
/* ================================================================== */

interface LnS { t: number }
export const lens = defineSim<LnS>({
  id: 'lens', title: 'Lens & Image Maker', subject: 'Physics',
  blurb: 'Move an object toward and past the focal point of a lens. The three principal rays show where the image forms, how big it is and whether it is real or virtual.',
  hint: 'Thin lens equation 1/do + 1/di = 1/f with magnification m = -di/do. Converging lens (f>0): object beyond f gives real inverted image; inside f gives virtual upright magnified image (magnifying glass). Diverging lens always gives virtual smaller image.',
  params: [
    { kind: 'number', id: 'f', label: 'Focal length (negative = diverging)', min: -200, max: 200, step: 5, value: 80, unit: 'px' },
    { kind: 'number', id: 'do', label: 'Object distance', min: 20, max: 340, step: 1, value: 180, unit: 'px' },
    { kind: 'number', id: 'ho', label: 'Object height', min: 10, max: 80, step: 1, value: 45, unit: 'px' },
  ],
  previewSeconds: 0,
  init() { return { t: 0 }; },
  step() { /* static optics */ },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    let f = num(v, 'f'); if (Math.abs(f) < 5) f = 5;
    const dO = num(v, 'do'), ho = num(v, 'ho');
    const ax = h / 2, lx = w * 0.45;
    line(c, 0, ax, w, ax, C.dim, 1);
    // lens
    c.save(); c.strokeStyle = C.cyan; c.lineWidth = 2.5; c.beginPath();
    const lh = h * 0.42;
    c.moveTo(lx, ax - lh); c.lineTo(lx, ax + lh); c.stroke();
    const t = f > 0 ? 1 : -1;
    for (const sy of [-lh, lh]) { arrow(c, lx, ax + sy, lx + t * 0, ax + sy + (sy < 0 ? 10 * t : -10 * t) * -1, C.cyan, 2); }
    c.restore();
    [-1, 1].forEach(sd => { circle(c, lx + sd * Math.abs(f), ax, 4, C.amber); text(c, 'F', lx + sd * Math.abs(f), ax + 18, C.amber, 11, 'center'); circle(c, lx + sd * 2 * Math.abs(f), ax, 3, C.dim); text(c, '2F', lx + sd * 2 * Math.abs(f), ax + 18, C.dim, 10, 'center'); });
    const ox = lx - dO, oy = ax - ho;
    arrow(c, ox, ax, ox, oy, C.green, 4, 10);
    text(c, 'object', ox, ax + 18, C.green, 11, 'center');
    const di = (f * dO) / (dO - f);
    const m = -di / dO, hi = m * ho, ix = lx + di, iy = ax - hi;
    const real = di > 0 && Number.isFinite(di);
    const col = ['#f87171', '#fbbf24', '#a78bfa'];
    const finite = Number.isFinite(di) && Math.abs(di) < 3000;
    const ray = (yL: number, slope: number, color: string) => {
      line(c, ox, oy, lx, yL, color, 1.8);
      line(c, lx, yL, w, yL + slope * (w - lx), color, 1.8);
      if (finite && !real) line(c, lx, yL, ix, iy, color, 1.5, [4, 4]);
    };
    // ray 1: parallel to axis, leaves through the far focus (or as if from it)
    ray(oy, (ax - oy) / f, col[0]);
    // ray 2: through the centre of the lens
    ray(ax, (ax - oy) / (lx - ox), col[1]);
    // ray 3: aimed at the near focus, leaves parallel to the axis
    const fx = lx - f, yl = oy + ((ax - oy) / (fx - ox)) * (lx - ox);
    if (Math.abs(yl - ax) < lh) ray(yl, 0, col[2]);
    if (finite) {
      c.save(); if (!real) c.setLineDash([5, 4]); arrow(c, ix, ax, ix, iy, real ? C.pink : '#f9a8d4', 4, 10); c.restore();
      text(c, real ? 'real image' : 'virtual image', ix, ax + 18, C.pink, 11, 'center');
    }
  },
  readouts: (_s, v) => {
    let f = num(v, 'f'); if (Math.abs(f) < 5) f = 5;
    const dO = num(v, 'do'), di = (f * dO) / (dO - f), m = -di / dO;
    const atF = Math.abs(dO - f) < 0.5;
    return [
      { label: 'Image distance', value: atF ? 'at infinity' : di, unit: atF ? '' : 'px', digits: 0 },
      { label: 'Magnification', value: atF ? '-' : m, digits: 2 },
      { label: 'Image type', value: atF ? '-' : di > 0 ? 'real, inverted' : 'virtual, upright' },
      { label: 'Power', value: 100 / f * 100 / 100, unit: '1/(100px)', digits: 2 },
    ];
  },
  equations: (_s, v) => {
    let f = num(v, 'f'); if (Math.abs(f) < 5) f = 5;
    const dO = num(v, 'do'), di = (f * dO) / (dO - f);
    return [String.raw`\frac1{d_o}+\frac1{d_i}=\frac1f\;\Rightarrow\;\frac1{${fmt(dO, 0)}}+\frac1{d_i}=\frac1{${fmt(f, 0)}}\;\Rightarrow\; d_i=${Number.isFinite(di) ? fmt(di, 0) : '\\infty'}`, String.raw`m=-\frac{d_i}{d_o}`];
  },
});

/* ================================================================== */
/*  Buoyancy (Archimedes)                                              */
/* ================================================================== */

interface BuS { y: number; v: number; t: number; sc: Scope }
export const buoyancy = defineSim<BuS>({
  id: 'buoyancy', title: 'Buoyancy Tank', subject: 'Physics',
  blurb: 'Drop a block into a fluid. It floats if it is less dense than the fluid and sinks if it is denser. Watch the buoyant force balance weight.',
  hint: 'Archimedes principle: buoyant force = fluid density x g x submerged volume. Floats when block density < fluid density with submerged fraction = rho_block/rho_fluid. Equilibrium where buoyant force equals weight.',
  params: [
    { kind: 'number', id: 'rb', label: 'Block density', min: 100, max: 3000, step: 10, value: 600, unit: 'kg/m³', resetOnChange: true },
    { kind: 'number', id: 'rf', label: 'Fluid density', min: 500, max: 1500, step: 10, value: 1000, unit: 'kg/m³' },
    { kind: 'number', id: 'side', label: 'Block side', min: 0.1, max: 0.4, step: 0.01, value: 0.25, unit: 'm', resetOnChange: true },
  ],
  actions: [{ id: 'drop', label: 'Drop again' }],
  previewSeconds: 1.8,
  init(v) { return { y: -(0.3 + num(v, 'side') / 2), v: 0, t: 0, sc: new Scope(2, 1500) }; },
  action(s, v) { s.y = -(0.3 + num(v, 'side') / 2); s.v = 0; s.t = 0; s.sc.clear(); },
  step(s, v, dt) {
    const L = num(v, 'side'), V = L ** 3, m = num(v, 'rb') * V, g = 9.81, rf = num(v, 'rf');
    const submerged = clamp((s.y + L / 2) / L, 0, 1);
    const Fb = rf * g * V * submerged;
    const drag = 0.5 * 1.1 * (submerged > 0 ? rf : 1.2) * L * L * Math.abs(s.v) * s.v;
    s.v += (g - Fb / m - drag / m) * dt; s.y += s.v * dt; s.t += dt;
    const bottom = 1.15 - L / 2; if (s.y > bottom) { s.y = bottom; s.v = 0; }
    if (Math.round(s.t / dt) % 6 === 0) s.sc.push(s.t, Fb, m * g);
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const L = num(v, 'side');
    const tank = { x: 20, y: 20, w: Math.min(w * 0.5, 300), h: h - 40 };
    const pxm = tank.h / 1.7; const surf = tank.y + 0.55 * pxm;
    c.fillStyle = `rgba(56,189,248,${0.15 + (num(v, 'rf') - 500) / 1000 * 0.4})`; c.fillRect(tank.x, surf, tank.w, tank.y + tank.h - surf);
    c.strokeStyle = C.axis; c.lineWidth = 3; c.beginPath(); c.moveTo(tank.x, tank.y); c.lineTo(tank.x, tank.y + tank.h); c.lineTo(tank.x + tank.w, tank.y + tank.h); c.lineTo(tank.x + tank.w, tank.y); c.stroke();
    line(c, tank.x, surf, tank.x + tank.w, surf, C.cyan, 2);
    const bx = tank.x + tank.w / 2;
    const cy = surf + s.y * pxm;
    const bs = L * pxm;
    const dens = clamp((num(v, 'rb') - 100) / 2900, 0, 1);
    c.fillStyle = `hsl(${30 - dens * 20}, ${60}%, ${60 - dens * 30}%)`; c.fillRect(bx - bs / 2, cy - bs / 2, bs, bs);
    c.strokeStyle = C.white; c.strokeRect(bx - bs / 2, cy - bs / 2, bs, bs);
    const g = 9.81, V = L ** 3, m = num(v, 'rb') * V, submerged = clamp((cy + bs / 2 - surf) / bs, 0, 1);
    const Fb = num(v, 'rf') * g * V * submerged, W = m * g, sc = 70 / Math.max(W, 1);
    arrow(c, bx, cy, bx, cy + W * sc, C.red, 3); arrow(c, bx + 14, cy, bx + 14, cy - Fb * sc, C.green, 3);
    text(c, 'weight', bx + 22, cy + W * sc, C.red, 11); text(c, 'buoyant force', bx + 24, cy - Fb * sc, C.green, 11);
    drawScope(c, { x: tank.x + tank.w + 20, y: 20, w: w - tank.w - 60, h: h * 0.5 }, s.sc, [C.green, C.red], { title: 'Forces (N): buoyant (green), weight (red)', window: 8, ymin: 0 });
    text(c, `submerged ${fmt(submerged * 100, 0)}%`, tank.x + tank.w + 24, h * 0.5 + 54, C.cyan, 13, 'left', 'alphabetic', true);
    text(c, num(v, 'rb') < num(v, 'rf') ? 'floats (ρ block < ρ fluid)' : 'sinks (ρ block > ρ fluid)', tank.x + tank.w + 24, h * 0.5 + 76, C.text, 13);
  },
  readouts: (s, v) => {
    const L = num(v, 'side'), V = L ** 3, m = num(v, 'rb') * V;
    const submerged = clamp((s.y + L / 2) / L, 0, 1);
    return [
      { label: 'Mass', value: m, unit: 'kg' }, { label: 'Weight', value: m * 9.81, unit: 'N', digits: 1 },
      { label: 'Buoyant force', value: num(v, 'rf') * 9.81 * V * submerged, unit: 'N', digits: 1 }, { label: 'Submerged', value: submerged * 100, unit: '%', digits: 0 },
      { label: 'Float depth (theory)', value: Math.min(1, num(v, 'rb') / num(v, 'rf')) * 100, unit: '%', digits: 0 },
    ];
  },
  equations: (_s, v) => [String.raw`F_b=\rho_{f}\,g\,V_{\text{sub}}\qquad \text{floating: }\frac{V_{\text{sub}}}{V}=\frac{\rho_b}{\rho_f}=${fmt(Math.min(1, num(v, 'rb') / num(v, 'rf')), 2)}`],
});

/* ================================================================== */
/*  Radioactive decay                                                  */
/* ================================================================== */

interface DcS { alive: boolean[]; t: number; sc: Scope; n0: number; flash: number[] }
export const decay = defineSim<DcS>({
  id: 'decay', title: 'Radioactive Decay', subject: 'Physics',
  blurb: 'Hundreds of atoms, each with the same chance of decaying every moment. The count follows a smooth exponential curve with random scatter you can compare with theory.',
  hint: 'Each nucleus decays randomly with probability lambda*dt; the half-life is ln2/lambda. Number N(t)=N0*exp(-lambda t). Small samples show noticeable statistical fluctuation; large samples follow the exponential closely.',
  params: [
    { kind: 'number', id: 'half', label: 'Half-life', min: 0.5, max: 10, step: 0.1, value: 3, unit: 's', resetOnChange: true },
    { kind: 'number', id: 'n', label: 'Number of atoms', min: 20, max: 900, step: 10, value: 400, resetOnChange: true },
  ],
  previewSeconds: 3,
  init(v) { const n = num(v, 'n'); return { alive: Array(n).fill(true), t: 0, sc: new Scope(1, 3000), n0: n, flash: Array(n).fill(0) }; },
  step(s, v, dt) {
    const lam = Math.LN2 / num(v, 'half'), p = lam * dt;
    for (let i = 0; i < s.alive.length; i++) { if (s.alive[i] && Math.random() < p) { s.alive[i] = false; s.flash[i] = 1; } else if (s.flash[i] > 0) s.flash[i] = Math.max(0, s.flash[i] - dt * 2); }
    s.t += dt;
    if (Math.round(s.t / dt) % 8 === 0) s.sc.push(s.t, s.alive.filter(Boolean).length);
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const n = s.alive.length, area = { x: 12, y: 12, w: w * 0.4, h: h - 24 };
    panel(c, area);
    const cols = Math.ceil(Math.sqrt((n * (area.w - 16)) / (area.h - 16))), rows = Math.ceil(n / cols);
    const cw = (area.w - 16) / cols, ch = (area.h - 16) / rows, r = Math.min(cw, ch) * 0.38;
    for (let i = 0; i < n; i++) {
      const x = area.x + 8 + (i % cols) * cw + cw / 2, y = area.y + 8 + Math.floor(i / cols) * ch + ch / 2;
      if (s.alive[i]) circle(c, x, y, r, C.green); else { circle(c, x, y, r * 0.6, 'rgba(100,116,139,0.45)'); if (s.flash[i] > 0) circle(c, x, y, r * (1 + 2 * (1 - s.flash[i])), undefined, `rgba(251,191,36,${s.flash[i]})`, 2); }
    }
    const gx = area.x + area.w + 12, gw = w - gx - 12;
    const T = Math.max(num(v, 'half') * 5, s.t * 1.02);
    const m = plot(c, { x: gx, y: 12, w: gw, h: h - 24 }, [0, T], [0, s.n0 * 1.05], { title: 'Atoms remaining', xlabel: 'time (s)' });
    const th: [number, number][] = []; for (let i = 0; i <= 80; i++) { const t = (T * i) / 80; th.push([m.X(t), m.Y(s.n0 * Math.exp(-Math.LN2 * t / num(v, 'half')))]); }
    polyline(c, th, C.dim, 2, [6, 5]);
    polyline(c, s.sc.t.map((t, i) => [m.X(t), m.Y(s.sc.ys[0][i])] as [number, number]), C.green, 2.5);
    for (let k = 1; k <= 4; k++) { const t = k * num(v, 'half'); if (t < T) { line(c, m.X(t), m.Y(0), m.X(t), m.Y(s.n0 / 2 ** k), C.amber, 1, [3, 3]); text(c, `${k}t½`, m.X(t), m.Y(0) - 4, C.amber, 10, 'center'); } }
    text(c, 'theory', gx + gw - 8, 36, C.dim, 11, 'right'); text(c, 'experiment', gx + gw - 8, 50, C.green, 11, 'right');
  },
  readouts: (s, v) => {
    const left = s.alive.filter(Boolean).length;
    return [
      { label: 'Remaining', value: left, digits: 0 }, { label: 'Decayed', value: s.n0 - left, digits: 0 },
      { label: 'Theory N(t)', value: s.n0 * Math.exp(-Math.LN2 * s.t / num(v, 'half')), digits: 1 }, { label: 'Elapsed', value: s.t, unit: 's' },
    ];
  },
  equations: (_s, v) => [String.raw`N(t)=N_0e^{-\lambda t},\quad \lambda=\frac{\ln 2}{t_{1/2}}=${fmt(Math.LN2 / num(v, 'half'), 3)}\ \text{s}^{-1}`],
});
