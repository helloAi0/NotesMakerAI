import { defineSim, num, str, bool, SCHOOL_8_10, SCHOOL_11_12, SCHOOL_ALL } from './types';
import type { AnySim, Values } from './types';
import {
  C, TAU, arrow, circle, clamp, deg, drawScope, fmt, gauss, hsl, line, panel, plot, polyline, rad, Scope, text, wavelengthToRgb,
} from './draw';

const sinc = (x: number) => (Math.abs(x) < 1e-6 ? 1 : Math.sin(x) / x);
const rgbNm = (nm: number, a = 1) => { const [r, g, b] = wavelengthToRgb(nm); return `rgba(${r},${g},${b},${a})`; };
const diverge = (a: number) => { const m = clamp(Math.abs(a), 0, 1); return a >= 0 ? `rgb(${30 + 40 * m | 0},${60 + 120 * m | 0},${110 + 140 * m | 0})` : `rgb(${40 + 120 * m | 0},${40 + 20 * m | 0},${70 + 30 * m | 0})`; };
void SCHOOL_8_10; void gauss; void hsl; void polyline; void drawScope; void Scope; void arrow; void deg; void str; void bool;

/* ================================================================== */
/*  1. Huygens' principle                                              */
/* ================================================================== */
interface HuS { t: number }
const HU_V = 60;
export const huygens = defineSim<HuS>({
  id: 'huygens', title: "Huygens' Principle: Wavelets at a Slit", subject: 'Physics',
  category: 'Wave Optics', educationLevels: SCHOOL_11_12, difficulty: 'Intermediate', status: 'active',
  topic: 'Wave Optics', subtopic: "Huygens' principle and diffraction at a slit",
  covers: ["Huygens' principle"],
  tags: ['NCERT', 'JEE', 'NEET', 'CBSE', 'wavefront', 'diffraction', 'secondary wavelets', 'Class 12'],
  learningObjectives: ['See that every point on a wavefront acts as a source of secondary wavelets.', 'Explain why a plane wave stays straight through a wide slit but spreads when the slit is about one wavelength wide.', 'Relate the first diffraction minimum to a·sinθ = λ.'],
  assumptions: ['Scalar 2D wave; wavelets are in phase on the slit and the obliquity factor is ignored.', 'Wavelength is shown in pixels (not to scale with real light).'],
  blurb: 'A plane wave hits a barrier with a slit. Each point in the slit acts as a new source of circular wavelets and their sum builds the wave on the other side. Narrow the slit and the wave spreads out.',
  hint: "Huygens-Fresnel construction: sum of circular wavelets from points across the slit. Wide slit (a >> lambda) gives nearly straight beam with edge ripples; a ~ lambda gives strong spreading; a < lambda gives almost a single circular wave. First minimum a sin(theta)=lambda.",
  params: [
    { kind: 'number', id: 'lam', label: 'Wavelength λ', min: 14, max: 48, step: 1, value: 26, unit: 'px' },
    { kind: 'number', id: 'a', label: 'Slit width a', min: 14, max: 200, step: 1, value: 70, unit: 'px' },
    { kind: 'toggle', id: 'wav', label: 'Show secondary wavelets', value: true },
  ],
  dt: 1 / 60, previewSeconds: 2,
  init() { return { t: 0 }; },
  step(s, _v, dt) { s.t += dt; },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const lam = num(v, 'lam'), k = TAU / lam, om = k * HU_V, a = Math.min(num(v, 'a'), h - 50);
    const bx = w * 0.3, cy = h / 2, cell = 6;
    const N = clamp(Math.round(a / (lam * 0.3)), 2, 36);
    const ys: number[] = []; for (let i = 0; i < N; i++) ys.push(cy - a / 2 + (a * (i + 0.5)) / N);
    for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) {
      const px = x + cell / 2, py = y + cell / 2; let val = 0;
      if (px < bx) val = Math.cos(k * (px - bx) - om * s.t);
      else { let sum = 0; for (let i = 0; i < N; i++) { const r = Math.hypot(px - bx, py - ys[i]); sum += Math.cos(k * r - om * s.t) / Math.sqrt(1 + (r / lam) * 0.5); } val = sum / N; }
      c.fillStyle = diverge(val); c.fillRect(x, y, cell, cell);
    }
    c.fillStyle = '#0b1220'; c.fillRect(bx - 5, 0, 10, cy - a / 2); c.fillRect(bx - 5, cy + a / 2, 10, h - cy - a / 2);
    c.strokeStyle = C.axis; c.lineWidth = 1.5; c.strokeRect(bx - 5, -2, 10, cy - a / 2 + 2); c.strokeRect(bx - 5, cy + a / 2, 10, h - cy - a / 2 + 2);
    if (bool(v, 'wav')) {
      const idx = N <= 7 ? ys.map((_, i) => i) : [0, Math.round(N / 4), Math.round(N / 2), Math.round((3 * N) / 4), N - 1];
      for (const i of idx) {
        circle(c, bx, ys[i], 3, C.amber);
        for (let m = 0; m < 4; m++) { const r = ((HU_V * s.t) % lam) + m * lam; if (r < 4) continue; c.beginPath(); c.arc(bx, ys[i], r, -Math.PI / 2, Math.PI / 2); c.strokeStyle = 'rgba(251,191,36,0.55)'; c.lineWidth = 1; c.stroke(); }
      }
    }
    text(c, 'plane wave', 10, 18, C.text, 11); text(c, `a/λ = ${fmt(num(v, 'a') / lam, 1)}`, w - 10, 18, C.amber, 12, 'right', 'alphabetic', true);
  },
  readouts: (_s, v) => { const r = num(v, 'a') / num(v, 'lam'); return [
    { label: 'Slit / wavelength', value: r, digits: 2 }, { label: 'Spreading', value: r > 4 ? 'small (straight beam)' : r > 1 ? 'strong' : 'almost circular' },
    { label: 'First minimum θ', value: r > 1 ? deg(Math.asin(1 / r)) : 'none (a < λ)', unit: r > 1 ? '°' : '', digits: 1 }, { label: 'Wave speed', value: HU_V, unit: 'px/s', digits: 0 }]; },
  equations: (_s, v) => { const r = num(v, 'a') / num(v, 'lam'); return [String.raw`a\sin\theta=\lambda\;\Rightarrow\;\sin\theta=\frac{1}{${fmt(r, 2)}}${r > 1 ? String.raw`\;\Rightarrow\;\theta=${fmt(deg(Math.asin(1 / r)), 1)}^\circ` : ''}`, String.raw`v=f\lambda`]; },
});

/* ================================================================== */
/*  2. Young's double slit & 3. single slit (shared screen panel)      */
/* ================================================================== */
interface ScrRect { x: number; y: number; w: number; h: number }
function screenPanel(c: CanvasRenderingContext2D, r: ScrRect, Y: number, lam: number, I: (y: number) => number, probe: number | null, bins?: number[], title = 'Screen') {
  panel(c, r);
  text(c, title, r.x + 8, r.y + 14, C.text, 11, 'left', 'alphabetic', true);
  const top = r.y + 22, hh = r.h - 30, stripW = Math.min(46, r.w * 0.22), sx = r.x + 40, px = sx + stripW + 12, pw = r.x + r.w - px - 10;
  const Ypx = (y: number) => top + hh / 2 - (y / Y) * (hh / 2);
  const rows = Math.max(40, Math.floor(hh));
  let maxB = 1; if (bins) for (const b of bins) maxB = Math.max(maxB, b);
  for (let i = 0; i < rows; i++) {
    const y = Y - (2 * Y * (i + 0.5)) / rows; let val: number;
    if (bins) val = bins[clamp(Math.floor(((y + Y) / (2 * Y)) * bins.length), 0, bins.length - 1)] / maxB; else val = I(y);
    c.fillStyle = rgbNm(lam, clamp(val, 0, 1) * 0.95 + 0.02); c.fillRect(sx, top + (hh * i) / rows, stripW, hh / rows + 1);
  }
  c.strokeStyle = C.axis; c.strokeRect(sx, top, stripW, hh);
  const ticks = niceTicks(Y); for (const t of ticks) { line(c, sx - 4, Ypx(t), sx, Ypx(t), C.axis); text(c, `${fmt(t, Math.abs(t) < 1 && t !== 0 ? 2 : 1)}`, sx - 6, Ypx(t) + 3, C.dim, 9, 'right'); }
  text(c, 'y (mm)', r.x + 6, top + 8, C.dim, 9);
  line(c, px, top, px, top + hh, C.axis); line(c, px, top + hh / 2 + hh / 2, px + pw, top + hh, C.axis);
  if (bins) { for (let i = 0; i < bins.length; i++) { const y0 = Y - (2 * Y * i) / bins.length, y1 = Y - (2 * Y * (i + 1)) / bins.length; c.fillStyle = 'rgba(96,165,250,0.45)'; c.fillRect(px, Ypx(y0), (bins[i] / maxB) * pw, Ypx(y1) - Ypx(y0) + 0.5); } }
  const pts: [number, number][] = []; for (let i = 0; i <= 160; i++) { const y = -Y + (2 * Y * i) / 160; pts.push([px + I(y) * pw, Ypx(y)]); }
  polyline(c, pts, C.amber, 2);
  text(c, 'I / I₀', px + pw, top + hh + 12 - 4, C.dim, 9, 'right');
  if (probe !== null) { line(c, sx - 4, Ypx(probe), px + pw, Ypx(probe), C.green, 1, [3, 3]); circle(c, px + I(probe) * pw, Ypx(probe), 4, C.green); }
}
function niceTicks(Y: number) { const step = Y > 8 ? 5 : Y > 3 ? 2 : Y > 1.5 ? 1 : Y > 0.6 ? 0.5 : 0.2; const o: number[] = []; for (let t = 0; t <= Y + 1e-9; t += step) { o.push(t); if (t > 0) o.push(-t); } return o; }

interface YgS { t: number; bins: number[]; key: string; yp: number; n: number }
const ygBeta = (v: Values) => (num(v, 'lam') * num(v, 'D')) / (num(v, 'd') * 1000); // mm
const ygI = (v: Values) => (y: number) => { const l = num(v, 'lam'), D = num(v, 'D'); const ph = (Math.PI * num(v, 'd') * y * 1000) / (l * D), sl = (Math.PI * num(v, 'a') * y * 1000) / (l * D); return Math.cos(ph) ** 2 * sinc(sl) ** 2; };
const ygY = (v: Values) => clamp(ygBeta(v) * 6, 0.5, 40);
export const young = defineSim<YgS>({
  id: 'young-double-slit', title: "Young's Double-Slit Experiment", subject: 'Physics',
  category: 'Wave Optics', educationLevels: SCHOOL_11_12, difficulty: 'Intermediate', status: 'active',
  topic: 'Wave Optics', subtopic: 'Interference: fringes, path difference and intensity',
  covers: ['double-slit interference', 'constructive and destructive interference'],
  tags: ['NCERT', 'JEE', 'NEET', 'CBSE', 'fringe width', 'path difference', 'coherent', 'photon build-up', 'Class 12'],
  learningObjectives: ['Calculate the fringe width β = λD/d and predict how it changes with λ, d and D.', 'Connect path difference Δ = nλ (bright) and (n+½)λ (dark) to the intensity pattern.', 'See that single photons build the same pattern one dot at a time.'],
  assumptions: ['Two coherent narrow-ish slits, screen far away (D ≫ d), small angles.', 'Intensity includes the single-slit envelope of slit width a.'],
  derivation: {
    targetEquation: String.raw`\beta=\frac{\lambda D}{d}`,
    problemStatement: 'Find the position of bright and dark fringes on a screen illuminated by two coherent slits.',
    assumptions: ['Slits S₁, S₂ are coherent and separated by d.', 'Screen at distance D ≫ d, y ≪ D (small angle).'],
    variableDefinitions: [{ symbol: 'd', meaning: 'slit separation', unit: 'm' }, { symbol: 'D', meaning: 'slit-to-screen distance', unit: 'm' }, { symbol: 'y', meaning: 'height on screen above the axis', unit: 'm' }, { symbol: '\\lambda', meaning: 'wavelength', unit: 'm' }],
    startingPrinciple: 'Superposition: waves from S₁ and S₂ add; maximum when they arrive in phase.',
    steps: [
      { stepNumber: 1, title: 'Path difference', math: String.raw`\Delta=r_2-r_1=d\sin\theta`, explanation: 'For D ≫ d the two rays to P are nearly parallel, so the extra path of the lower ray is the side of a right triangle with hypotenuse d.', justification: 'Geometry of nearly parallel rays.', highlightKey: 'path' },
      { stepNumber: 2, title: 'Small-angle approximation', math: String.raw`\sin\theta\approx\tan\theta=\frac{y}{D}\;\Rightarrow\;\Delta=\frac{dy}{D}`, explanation: 'When y is much smaller than D the angle is tiny and sin θ ≈ tan θ = y/D.', justification: 'sin θ ≈ tan θ for θ ≪ 1 rad.', highlightKey: 'small' },
      { stepNumber: 3, title: 'Bright fringes', math: String.raw`\Delta=n\lambda\;\Rightarrow\;y_n=\frac{n\lambda D}{d}`, explanation: 'Waves arrive in phase when the path difference is a whole number of wavelengths.', justification: 'Constructive interference condition.', highlightKey: 'bright' },
      { stepNumber: 4, title: 'Dark fringes', math: String.raw`\Delta=\left(n+\tfrac12\right)\lambda\;\Rightarrow\;y_n=\left(n+\tfrac12\right)\frac{\lambda D}{d}`, explanation: 'Waves arrive exactly out of phase at half-integer path differences.', justification: 'Destructive interference condition.', highlightKey: 'dark' },
      { stepNumber: 5, title: 'Fringe width', math: String.raw`\beta=y_{n+1}-y_n=\frac{\lambda D}{d}`, explanation: 'Neighbouring bright fringes are separated by one wavelength of extra path, so the spacing is constant.', justification: 'Subtract consecutive bright-fringe positions.', highlightKey: 'width' },
    ],
    finalResult: String.raw`\beta=\frac{\lambda D}{d},\qquad I=I_0\cos^2\!\left(\frac{\pi d y}{\lambda D}\right)`,
    dimensionalCheck: 'λD/d has units of m·m/m = m, a length, as a fringe width should.',
    physicalInterpretation: 'Longer wavelength, farther screen or closer slits all spread the fringes out.',
  },
  blurb: "Two slits make a pattern of bright and dark fringes. Change the wavelength, slit separation and screen distance, read the fringe width off the intensity graph, or watch single photons build the pattern.",
  hint: "Young's double slit: fringe width beta = lambda D / d; path difference Delta = d y / D; bright at n lambda, dark at (n+1/2) lambda; intensity cos^2 times single-slit sinc^2 envelope. Photon build-up mode samples photons from that intensity.",
  params: [
    { kind: 'number', id: 'lam', label: 'Wavelength λ', min: 400, max: 700, step: 5, value: 550, unit: 'nm' },
    { kind: 'number', id: 'd', label: 'Slit separation d', min: 0.1, max: 1, step: 0.01, value: 0.4, unit: 'mm' },
    { kind: 'number', id: 'D', label: 'Screen distance D', min: 0.5, max: 3, step: 0.1, value: 1.5, unit: 'm' },
    { kind: 'number', id: 'a', label: 'Slit width a', min: 0.01, max: 0.2, step: 0.01, value: 0.06, unit: 'mm' },
    { kind: 'select', id: 'mode', label: 'Display', value: 'wave', options: [{ value: 'wave', label: 'Wave pattern (theory)' }, { value: 'photon', label: 'Photon-by-photon build-up' }] },
  ],
  dt: 1 / 60, previewSeconds: 4,
  init() { return { t: 0, bins: new Array(110).fill(0), key: '', yp: 0.5, n: 0 }; },
  step(s, v, dt) {
    s.t += dt;
    const key = [num(v, 'lam'), num(v, 'd'), num(v, 'D'), num(v, 'a')].join('|');
    if (key !== s.key) { s.key = key; s.bins.fill(0); s.n = 0; }
    if (str(v, 'mode') !== 'photon') return;
    const Y = ygY(v), I = ygI(v);
    for (let k = 0; k < 14; k++) { for (let tries = 0; tries < 40; tries++) { const y = (Math.random() * 2 - 1) * Y; if (Math.random() < I(y)) { s.bins[clamp(Math.floor(((y + Y) / (2 * Y)) * s.bins.length), 0, s.bins.length - 1)]++; s.n++; break; } } }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const lam = num(v, 'lam'), left = { x: 8, y: 8, w: w * 0.4 - 12, h: h - 16 };
    panel(c, left);
    const cy = left.y + left.h / 2, sx = left.x + 16, slx = left.x + left.w * 0.4, scx = left.x + left.w - 14, sep = clamp(num(v, 'd') * 60, 14, left.h * 0.5), yP = cy - (s.yp / ygY(v)) * (left.h * 0.36);
    circle(c, sx, cy, 5, C.amber); text(c, 'S', sx, cy - 10, C.dim, 10, 'center');
    c.fillStyle = '#334155'; c.fillRect(slx - 3, left.y + 4, 6, cy - sep / 2 - left.y - 4 - 4); c.fillRect(slx - 3, cy - sep / 2 + 4, 6, sep - 8); c.fillRect(slx - 3, cy + sep / 2 + 4, 6, left.y + left.h - cy - sep / 2 - 8);
    for (let k = 1; k <= 3; k++) { c.beginPath(); c.arc(sx, cy, 14 * k + ((s.t * 20) % 14), -0.5, 0.5); c.strokeStyle = rgbNm(lam, 0.35); c.lineWidth = 1; c.stroke(); }
    line(c, scx, left.y + 4, scx, left.y + left.h - 4, C.axis, 3);
    const s1 = cy - sep / 2, s2 = cy + sep / 2;
    line(c, slx, s1, scx, yP, rgbNm(lam, 0.9), 1.5); line(c, slx, s2, scx, yP, rgbNm(lam, 0.9), 1.5);
    circle(c, scx, yP, 4, C.green); text(c, 'P', scx - 8, yP - 6, C.green, 11, 'right'); text(c, 'S₁', slx + 6, s1 + 4, C.dim, 9); text(c, 'S₂', slx + 6, s2 + 4, C.dim, 9);
    text(c, 'not to scale', left.x + 8, left.y + left.h - 8, C.dim, 9);
    const Y = ygY(v), I = ygI(v);
    screenPanel(c, { x: left.x + left.w + 8, y: 8, w: w - left.w - 24, h: h - 16 }, Y, lam, I, s.yp, str(v, 'mode') === 'photon' ? s.bins : undefined, str(v, 'mode') === 'photon' ? `Screen: ${s.n} photons` : 'Screen and intensity');
  },
  pointer(s, v, e) {
    if (e.kind === 'up') return;
    const Y = ygY(v), top = 8 + 22, hh = e.h - 16 - 30;
    if (e.x > e.w * 0.4 - 4) s.yp = clamp(((top + hh / 2 - e.y) / (hh / 2)) * Y, -Y, Y);
  },
  readouts: (s, v) => { const beta = ygBeta(v), dl = (num(v, 'd') * s.yp) / num(v, 'D'), n = (dl * 1000) / num(v, 'lam'); const fr = Math.abs(n - Math.round(n)); return [
    { label: 'Fringe width β', value: beta, unit: 'mm', digits: 3 }, { label: 'Probe height y', value: s.yp, unit: 'mm', digits: 2 },
    { label: 'Path difference Δ', value: n, unit: 'λ', digits: 2 }, { label: 'At probe', value: fr < 0.1 ? 'bright' : fr > 0.4 ? 'dark' : 'in between' }]; },
  equations: (s, v) => [String.raw`\beta=\frac{\lambda D}{d}=\frac{${fmt(num(v, 'lam'), 0)}\,\text{nm}\times${fmt(num(v, 'D'), 1)}\,\text{m}}{${fmt(num(v, 'd'), 2)}\,\text{mm}}=${fmt(ygBeta(v), 3)}\ \text{mm}`, String.raw`\Delta=\frac{dy}{D}=${fmt((num(v, 'd') * s.yp) / num(v, 'D') * 1000, 0)}\ \text{nm}`],
});

interface SsS { t: number; yp: number }
const ssA = (v: Values) => num(v, 'a'); // µm
const ssI = (v: Values) => (y: number) => sinc((Math.PI * ssA(v) * y) / (num(v, 'lam') * num(v, 'D'))) ** 2;
const ssY1 = (v: Values) => (num(v, 'lam') * num(v, 'D')) / ssA(v);
export const singleSlit = defineSim<SsS>({
  id: 'single-slit', title: 'Single-Slit Diffraction', subject: 'Physics',
  category: 'Wave Optics', educationLevels: SCHOOL_11_12, difficulty: 'Intermediate', status: 'active',
  topic: 'Wave Optics', subtopic: 'Diffraction minima and central maximum width',
  covers: ['single-slit diffraction'],
  tags: ['NCERT', 'JEE', 'NEET', 'CBSE', 'diffraction', 'central maximum', 'sinc', 'Class 12'],
  learningObjectives: ['Locate the minima using a sinθ = mλ.', 'Predict that a narrower slit gives a wider central maximum.', 'Compare the central-maximum width 2λD/a with the slit width.'],
  assumptions: ['Fraunhofer (far-field) diffraction from one slit.', 'Small angles; slit much longer than it is wide.'],
  blurb: 'Light through one narrow slit spreads into a broad central bright band with weaker fringes either side. Make the slit narrower and the pattern gets wider.',
  hint: 'Single slit Fraunhofer diffraction: I = I0 sinc^2(pi a y/(lambda D)); minima at a sin(theta) = m lambda; central maximum width 2 lambda D / a. Narrower slit gives wider pattern.',
  params: [
    { kind: 'number', id: 'lam', label: 'Wavelength λ', min: 400, max: 700, step: 5, value: 600, unit: 'nm' },
    { kind: 'number', id: 'a', label: 'Slit width a', min: 20, max: 300, step: 5, value: 100, unit: 'µm' },
    { kind: 'number', id: 'D', label: 'Screen distance D', min: 0.5, max: 3, step: 0.1, value: 1.5, unit: 'm' },
  ],
  previewSeconds: 1,
  init() { return { t: 0, yp: ssY1({ lam: 600, D: 1.5, a: 100 }) * 1.43 }; },
  step(s, _v, dt) { s.t += dt; },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const left = { x: 8, y: 8, w: w * 0.4 - 12, h: h - 16 }; panel(c, left);
    const cy = left.y + left.h / 2, slx = left.x + left.w * 0.35, scx = left.x + left.w - 14, gap = clamp(ssA(v) / 6, 4, 50), Y = clamp(ssY1(v) * 4.5, 1, 40), lam = num(v, 'lam');
    for (let k = 0; k < 6; k++) line(c, left.x + 6, cy - 40 + k * 16, slx, cy - 40 + k * 16, rgbNm(lam, 0.6), 1.5);
    c.fillStyle = '#334155'; c.fillRect(slx - 3, left.y + 4, 6, cy - gap / 2 - left.y - 4); c.fillRect(slx - 3, cy + gap / 2, 6, left.y + left.h - cy - gap / 2 - 4);
    line(c, scx, left.y + 4, scx, left.y + left.h - 4, C.axis, 3);
    const th = Math.atan((s.yp) / (num(v, 'D') * 1000)) * 40;
    for (const m of [-2, -1, 0, 1, 2]) { const t = Math.atan((m * ssY1(v)) / (num(v, 'D') * 1000)); line(c, slx, cy, scx, cy - Math.tan(t) * (scx - slx) * 6 * (Y > 0 ? 1 : 1) * 0 - (m * (ssY1(v) / Y) * left.h * 0.36), m === 0 ? rgbNm(lam, 0.9) : rgbNm(lam, 0.35), m === 0 ? 2 : 1, m === 0 ? undefined : [4, 4]); }
    void th; text(c, 'a', slx + 8, cy, C.amber, 11); text(c, 'not to scale', left.x + 8, left.y + left.h - 8, C.dim, 9);
    screenPanel(c, { x: left.x + left.w + 8, y: 8, w: w - left.w - 24, h: h - 16 }, Y, lam, ssI(v), s.yp, undefined, 'Screen and intensity');
  },
  pointer(s, v, e) {
    if (e.kind === 'up' || e.x < e.w * 0.4 - 4) return;
    const Y = clamp(ssY1(v) * 4.5, 1, 40), top = 30, hh = e.h - 46; s.yp = clamp(((top + hh / 2 - e.y) / (hh / 2)) * Y, -Y, Y);
  },
  readouts: (s, v) => { const I = ssI(v)(s.yp); return [
    { label: 'Central max width 2λD/a', value: 2 * ssY1(v), unit: 'mm', digits: 2 }, { label: 'First minimum y₁', value: ssY1(v), unit: 'mm', digits: 2 },
    { label: 'Half-angle θ₁', value: deg(Math.asin(clamp((num(v, 'lam') * 1e-9) / (ssA(v) * 1e-6), -1, 1))), unit: '°', digits: 2 }, { label: 'Probe intensity', value: I, unit: 'I₀', digits: 3 }]; },
  equations: (_s, v) => [String.raw`a\sin\theta=m\lambda\quad(m=\pm1,\pm2,\dots)`, String.raw`2y_1=\frac{2\lambda D}{a}=${fmt(2 * ssY1(v), 2)}\ \text{mm}`],
});

/* ================================================================== */
/*  4. Polarization                                                    */
/* ================================================================== */
interface PoS { t: number }
function polI(v: Values) {
  const I1 = 0.5; const mid = bool(v, 'mid');
  const tp = rad(num(v, 'tp')), ta = rad(num(v, 'ta')), tm = rad(num(v, 'tm'));
  const I2 = mid ? I1 * Math.cos(tm - tp) ** 2 : I1; const I3 = mid ? I2 * Math.cos(ta - tm) ** 2 : I1 * Math.cos(ta - tp) ** 2;
  return { I1, I2, I3, tp, ta, tm, mid };
}
export const polarization = defineSim<PoS>({
  id: 'polarization-malus', title: "Polarization & Malus' Law", subject: 'Physics',
  category: 'Wave Optics', educationLevels: SCHOOL_11_12, difficulty: 'Intermediate', status: 'active',
  topic: 'Wave Optics', subtopic: "Polarisation of light, Malus' law, crossed polarizers",
  covers: ['polarization'],
  tags: ['NCERT', 'JEE', 'NEET', 'CBSE', 'polaroid', 'Malus', 'analyzer', 'crossed polarizers', 'Class 12'],
  learningObjectives: ["Apply Malus' law I = I₀cos²θ.", 'Explain why unpolarized light loses half its intensity at the first polarizer.', 'Show that a third polarizer at 45° between crossed polarizers lets light through.'],
  assumptions: ['Ideal polarizers: no absorption of the transmitted component.', 'Unpolarized light is an equal mixture of all polarization angles.'],
  blurb: 'Unpolarized light passes through a polarizer and an analyzer. Rotate the analyzer and see the intensity follow cos²θ. Insert a middle polarizer and light appears between crossed filters.',
  hint: "Malus' law: I = I0 cos^2(theta) between polarizer axis and light polarization. Unpolarized light through the first polarizer drops to I0/2. Crossed polarizers (90 degrees) give zero, but a third polarizer at 45 degrees between them transmits I0/8.",
  params: [
    { kind: 'number', id: 'tp', label: 'First polarizer angle', min: 0, max: 180, step: 1, value: 0, unit: '°' },
    { kind: 'toggle', id: 'mid', label: 'Insert middle polarizer', value: false },
    { kind: 'number', id: 'tm', label: 'Middle polarizer angle', min: 0, max: 180, step: 1, value: 45, unit: '°' },
    { kind: 'number', id: 'ta', label: 'Analyzer angle', min: 0, max: 180, step: 1, value: 60, unit: '°' },
  ],
  previewSeconds: 0.3,
  init() { return { t: 0 }; },
  step(s, _v, dt) { s.t += dt; },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const p = polI(v), cy = h * 0.27, n = p.mid ? 4 : 3;
    const xs = Array.from({ length: n }, (_, i) => w * (0.12 + (0.76 * i) / (n - 1)));
    const names = p.mid ? ['Source', 'Polarizer', 'Middle', 'Analyzer'] : ['Source', 'Polarizer', 'Analyzer'];
    line(c, 10, cy, w - 10, cy, 'rgba(251,191,36,0.25)', 8);
    const angs = p.mid ? [null, p.tp, p.tm, p.ta] : [null, p.tp, p.ta];
    const ints = p.mid ? [1, p.I1, p.I2, p.I3] : [1, p.I1, p.I3];
    const R = Math.min(30, w * 0.07, h * 0.1), ph = Math.cos(TAU * 1.2 * s.t);
    xs.forEach((x, i) => {
      circle(c, x, cy, R, 'rgba(30,41,59,0.9)', C.axis, 1.5); text(c, names[i], x, cy - R - 6, C.dim, 10, 'center');
      const a = angs[i];
      if (a === null) { for (let k = 0; k < 6; k++) { const aa = (k * Math.PI) / 6 + 0.3 * Math.sin(TAU * (s.t + k * 0.37)); const L = R * 0.8; line(c, x - Math.cos(aa) * L, cy + Math.sin(aa) * L, x + Math.cos(aa) * L, cy - Math.sin(aa) * L, 'rgba(251,191,36,0.4)', 1.2); } }
      else { const L = R * 0.85; line(c, x - Math.cos(a) * L, cy + Math.sin(a) * L, x + Math.cos(a) * L, cy - Math.sin(a) * L, C.cyan, 2.5); }
      const lightAfter = i === 0 ? 0 : 1; void lightAfter;
    });
    // light-field disks between components
    const betw = xs.slice(0, -1).map((x, i) => (x + xs[i + 1]) / 2);
    betw.forEach((x, i) => {
      const polAng = i === 0 ? null : angs[i], amp = Math.sqrt(ints[i + 1]);
      const yb = cy + R * 2.0; circle(c, x, yb, R * 0.75, undefined, C.grid, 1);
      if (polAng === null) text(c, 'unpolarized', x, yb + 4, C.dim, 9, 'center');
      else { const L = R * 0.7 * amp * 2 * ph; line(c, x - Math.cos(polAng) * L, yb + Math.sin(polAng) * L, x + Math.cos(polAng) * L, yb - Math.sin(polAng) * L, C.amber, 2.5); }
      text(c, `I = ${fmt(ints[i + 1], 3)} I₀`, x, yb + R * 0.75 + 14, C.text, 10, 'center', 'alphabetic', true);
    });
    const last = xs[xs.length - 1]; text(c, `out: ${fmt(p.I3, 3)} I₀`, last, cy + R + 18, p.I3 < 0.005 ? C.red : C.green, 11, 'center', 'alphabetic', true);
    // Malus curve
    const rct = { x: 10, y: h * 0.56, w: w - 20, h: h * 0.42 - 6 };
    const m = plot(c, rct, [0, 180], [0, 0.55], { title: 'Transmitted intensity vs analyzer angle', xlabel: 'analyzer angle (°)', xstep: 30, ystep: 0.1 });
    const pts: [number, number][] = []; for (let a = 0; a <= 180; a += 2) { const q = { ...v, ta: a } as Values; pts.push([m.X(a), m.Y(polI(q).I3)]); }
    polyline(c, pts, C.amber, 2.5); circle(c, m.X(num(v, 'ta')), m.Y(p.I3), 5, C.green, C.white, 1.5);
  },
  readouts: (_s, v) => { const p = polI(v); return [{ label: 'After first polarizer', value: p.I1, unit: 'I₀', digits: 3 }, { label: 'After middle', value: p.mid ? p.I2 : '-', unit: p.mid ? 'I₀' : '', digits: 3 }, { label: 'Transmitted', value: p.I3, unit: 'I₀', digits: 3 }, { label: 'Angle polarizer-analyzer', value: Math.abs(num(v, 'ta') - num(v, 'tp')), unit: '°', digits: 0 }]; },
  equations: (_s, v) => { const p = polI(v); return [String.raw`I=I_0\cos^2\theta`, p.mid ? String.raw`I_3=\frac{I_0}{2}\cos^2(${fmt(num(v, 'tm') - num(v, 'tp'), 0)}^\circ)\cos^2(${fmt(num(v, 'ta') - num(v, 'tm'), 0)}^\circ)=${fmt(p.I3, 3)}\,I_0` : String.raw`I_2=\frac{I_0}{2}\cos^2(${fmt(num(v, 'ta') - num(v, 'tp'), 0)}^\circ)=${fmt(p.I3, 3)}\,I_0`]; },
});

export const BATCH1: AnySim[] = [huygens, young, singleSlit, polarization];
void SCHOOL_ALL;
