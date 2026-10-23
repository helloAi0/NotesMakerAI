import { defineSim, num, str, bool } from './types';
import type { SimSubject, EducationLevel, Difficulty, DerivationPlan, DerivationStep, Values } from './types';
import { SCHOOL_8_10, SCHOOL_11_12 } from './types';
import {
  C, TAU, arrow, circle, clamp, deg, fmt, line, panel, plot, polyline, rad, text, niceStep, fitView, hsl,
} from './draw';
import type { Ctx, PlotMap } from './draw';

/* ------------------------------------------------------------------ */
/*  shared helpers (local to this file)                                */
/* ------------------------------------------------------------------ */

export const meta = (subject: SimSubject, educationLevels: EducationLevel[], difficulty: Difficulty, category: string, topic: string, subtopic: string) => ({
  subject, educationLevels, difficulty, category, topic, subtopic, status: 'active' as const,
});

export function mkDerivation(
  targetEquation: string, problemStatement: string, assumptions: string[],
  variableDefinitions: DerivationPlan['variableDefinitions'], startingPrinciple: string,
  steps: Omit<DerivationStep, 'stepNumber'>[], finalResult: string, dimensionalCheck?: string, physicalInterpretation?: string,
): DerivationPlan {
  return {
    targetEquation, problemStatement, assumptions, variableDefinitions, startingPrinciple,
    steps: steps.map((s, i) => ({ ...s, stepNumber: i + 1 })), finalResult, dimensionalCheck, physicalInterpretation,
  };
}

/** Draw y=f(x) as a polyline, splitting at non-finite or huge values. */
export function curve(c: Ctx, m: PlotMap, f: (x: number) => number, x0: number, x1: number, color: string, w = 2.2, n = 260, ymax = 1e4, dash?: number[]) {
  let seg: [number, number][] = [];
  const flush = () => { if (seg.length > 1) polyline(c, seg, color, w, dash); seg = []; };
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, y = f(x);
    if (!Number.isFinite(y) || Math.abs(y) > ymax) { flush(); continue; }
    seg.push([m.X(x), m.Y(y)]);
  }
  flush();
}

/** Orthographic projection (x right, y into screen, z up) with azimuth and elevation. */
export function proj3(az: number, el: number) {
  const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
  return (x: number, y: number, z: number): [number, number, number] => {
    const xr = x * ca - y * sa, yr = x * sa + y * ca;
    return [xr, z * ce + yr * se, yr * ce - z * se];
  };
}

const wide = (w: number) => w >= 520;
const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len3 = (a: number[]) => Math.hypot(a[0], a[1], a[2]);

/* ================================================================== */
/*  1. Riemann sums                                                    */
/* ================================================================== */

const RF: Record<string, { name: string; f: (x: number) => number; F: (x: number) => number; a: number; b: number; tex: string; texF: string; aTex: string; bTex: string }> = {
  x2: { name: 'f(x) = x²  on [0, 3]', f: x => x * x, F: x => x ** 3 / 3, a: 0, b: 3, tex: 'x^2', texF: '\\frac{x^3}{3}', aTex: '0', bTex: '3' },
  sin: { name: 'f(x) = sin x  on [0, π]', f: Math.sin, F: x => -Math.cos(x), a: 0, b: Math.PI, tex: '\\sin x', texF: '-\\cos x', aTex: '0', bTex: '\\pi' },
  exp: { name: 'f(x) = eˣ  on [0, 2]', f: Math.exp, F: Math.exp, a: 0, b: 2, tex: 'e^x', texF: 'e^x', aTex: '0', bTex: '2' },
  sqrt: { name: 'f(x) = √x  on [0, 4]', f: Math.sqrt, F: x => (2 / 3) * x ** 1.5, a: 0, b: 4, tex: '\\sqrt{x}', texF: '\\tfrac23x^{3/2}', aTex: '0', bTex: '4' },
  inv: { name: 'f(x) = 1/x  on [1, 5]', f: x => 1 / x, F: Math.log, a: 1, b: 5, tex: '\\frac1x', texF: '\\ln x', aTex: '1', bTex: '5' },
  cubic: { name: 'f(x) = x³ − 4x + 5  on [0, 3]', f: x => x ** 3 - 4 * x + 5, F: x => x ** 4 / 4 - 2 * x * x + 5 * x, a: 0, b: 3, tex: 'x^3-4x+5', texF: '\\frac{x^4}{4}-2x^2+5x', aTex: '0', bTex: '3' },
};
function riemann(fn: string, method: string, n: number) {
  const r = RF[fn], dx = (r.b - r.a) / n;
  let s = 0;
  if (method === 'trap') { s = (r.f(r.a) + r.f(r.b)) / 2; for (let i = 1; i < n; i++) s += r.f(r.a + i * dx); return s * dx; }
  const off = method === 'left' ? 0 : method === 'right' ? 1 : 0.5;
  for (let i = 0; i < n; i++) s += r.f(r.a + (i + off) * dx);
  return s * dx;
}
interface RiS { t: number }
export const riemannSums = defineSim<RiS>({
  id: 'riemann-sums', title: 'Riemann Sums & Definite Integrals',
  ...meta('Math', SCHOOL_11_12, 'Intermediate', 'Calculus', 'Integration', 'Riemann sums and the definite integral'),
  covers: ['Riemann sums and definite integrals'], tags: ['NCERT', 'CBSE', 'JEE', 'integration', 'area under curve', 'trapezoid', 'midpoint', 'definite integral'],
  learningObjectives: ['See the definite integral as the limit of rectangle (or trapezoid) areas as n grows.', 'Compare left, right, midpoint and trapezoid rules and how fast each error shrinks.', 'Connect the sum to the exact value F(b) − F(a).'],
  assumptions: ['f is continuous on [a, b]; the exact value comes from an antiderivative.', 'Numbers are computed in double precision.'],
  derivation: mkDerivation('\\int_a^b f(x)\\,dx=\\lim_{n\\to\\infty}\\sum_{i=1}^{n} f(x_i^*)\\,\\Delta x',
    'Define the definite integral as a limit of Riemann sums.',
    ['f is bounded and continuous on [a, b].', 'The interval is split into n equal subintervals.'],
    [{ symbol: '\\Delta x', meaning: 'width of each subinterval = (b − a)/n' }, { symbol: 'x_i^*', meaning: 'sample point in the i-th subinterval' }],
    'Area of a rectangle = height × width',
    [
      { title: 'Split the interval', math: '\\Delta x=\\frac{b-a}{n},\\quad x_i=a+i\\,\\Delta x', explanation: 'Divide [a, b] into n slices of equal width.' },
      { title: 'Approximate each slice', math: 'A_i\\approx f(x_i^*)\\,\\Delta x', explanation: 'On a thin slice f hardly changes, so the slice is almost a rectangle.' },
      { title: 'Add the slices', math: 'S_n=\\sum_{i=1}^{n} f(x_i^*)\\,\\Delta x', explanation: 'The total area is approximately the sum of all rectangles.' },
      { title: 'Refine the partition', math: '\\int_a^b f(x)\\,dx=\\lim_{n\\to\\infty}S_n', explanation: 'As n grows the rectangles hug the curve; the limit is the exact area.' },
    ], '\\int_a^b f(x)\\,dx=F(b)-F(a)', undefined, 'The sum of thin rectangle areas converges to the exact area under the curve.'),
  blurb: 'Fill the area under a curve with rectangles or trapezoids. Increase n and watch the sum close in on the exact integral.',
  hint: 'Riemann sums: S_n = sum f(x_i*) dx. Left/right sums are first-order accurate (error ~ 1/n), midpoint and trapezoid are second-order (error ~ 1/n^2). For increasing functions left sums underestimate and right sums overestimate. Exact value uses an antiderivative.',
  params: [
    { kind: 'select', id: 'fn', label: 'Function', value: 'x2', options: Object.entries(RF).map(([k, r]) => ({ value: k, label: r.name })) },
    { kind: 'select', id: 'method', label: 'Rule', value: 'left', options: [{ value: 'left', label: 'Left endpoints' }, { value: 'right', label: 'Right endpoints' }, { value: 'mid', label: 'Midpoints' }, { value: 'trap', label: 'Trapezoids' }] },
    { kind: 'number', id: 'n', label: 'Number of slices n', min: 1, max: 200, step: 1, value: 8 },
    { kind: 'toggle', id: 'sweep', label: 'Animate n from 1 to 100', value: false },
  ],
  previewSeconds: 0, dt: 1 / 60,
  init() { return { t: 0 }; },
  step(s, _v, dt) { s.t += dt; },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const r = RF[str(v, 'fn')], method = str(v, 'method');
    const n = bool(v, 'sweep') ? Math.min(100, 1 + Math.floor((s.t * 6) % 140)) : Math.round(num(v, 'n'));
    const isWide = wide(w);
    const pr = isWide ? { x: 8, y: 8, w: w * 0.62 - 12, h: h - 16 } : { x: 8, y: 8, w: w - 16, h: h * 0.62 - 12 };
    let ymax = 0, ymin = 0; for (let i = 0; i <= 100; i++) { const y = r.f(r.a + ((r.b - r.a) * i) / 100); ymax = Math.max(ymax, y); ymin = Math.min(ymin, y); }
    const m = plot(c, pr, [r.a - (r.b - r.a) * 0.04, r.b + (r.b - r.a) * 0.04], [ymin, ymax * 1.15], { title: `${method === 'trap' ? 'Trapezoid' : method === 'mid' ? 'Midpoint' : method === 'left' ? 'Left' : 'Right'} sum, n = ${n}` });
    const dx = (r.b - r.a) / n;
    c.save(); c.beginPath(); c.rect(pr.x + 34, pr.y + 20, pr.w - 42, pr.h - 38); c.clip();
    for (let i = 0; i < n; i++) {
      const x0 = r.a + i * dx, x1 = x0 + dx;
      c.beginPath();
      if (method === 'trap') { c.moveTo(m.X(x0), m.Y(0)); c.lineTo(m.X(x0), m.Y(r.f(x0))); c.lineTo(m.X(x1), m.Y(r.f(x1))); c.lineTo(m.X(x1), m.Y(0)); }
      else { const xs = method === 'left' ? x0 : method === 'right' ? x1 : (x0 + x1) / 2, y = r.f(xs); c.rect(m.X(x0), m.Y(Math.max(y, 0)), m.X(x1) - m.X(x0), Math.abs(m.Y(y) - m.Y(0))); }
      c.fillStyle = 'rgba(96,165,250,0.35)'; c.fill(); c.strokeStyle = n > 60 ? 'rgba(96,165,250,0.5)' : C.blue; c.lineWidth = n > 60 ? 0.5 : 1; c.stroke();
    }
    c.restore();
    curve(c, m, r.f, r.a, r.b, C.amber, 2.6);
    // error vs n
    const exact = r.F(r.b) - r.F(r.a), S = riemann(str(v, 'fn'), method, n);
    const er = isWide ? { x: pr.w + 16, y: 8, w: w - pr.w - 24, h: h - 16 } : { x: 8, y: pr.h + 16, w: w - 16, h: h - pr.h - 24 };
    const pts: [number, number][] = []; let emin = 0, emax = -99;
    for (let k = 1; k <= 60; k++) { const e = Math.log10(Math.abs(riemann(str(v, 'fn'), method, k) - exact) + 1e-16); pts.push([k, e]); emax = Math.max(emax, e); }
    emin = Math.max(-12, Math.min(...pts.map(p => p[1])));
    const m2 = plot(c, er, [0, 60], [emin - 0.3, emax + 0.5], { title: 'log₁₀ |error| vs n', xlabel: 'n' });
    polyline(c, pts.map(p => [m2.X(p[0]), m2.Y(Math.max(p[1], emin - 0.3))] as [number, number]), C.green, 2);
    if (n <= 60) circle(c, m2.X(n), m2.Y(Math.max(pts[n - 1][1], emin - 0.3)), 5, C.amber, C.white, 1.5);
    text(c, `error ${fmt(S - exact, 4)}`, er.x + er.w - 8, er.y + er.h - 30, C.dim, 10, 'right');
  },
  readouts: (s, v) => {
    const r = RF[str(v, 'fn')], n = bool(v, 'sweep') ? Math.min(100, 1 + Math.floor((s.t * 6) % 140)) : Math.round(num(v, 'n'));
    const S = riemann(str(v, 'fn'), str(v, 'method'), n), ex = r.F(r.b) - r.F(r.a);
    return [{ label: 'Slices n', value: n, digits: 0 }, { label: 'Width Δx', value: (r.b - r.a) / n, digits: 4 }, { label: 'Riemann sum', value: S, digits: 5 }, { label: 'Exact integral', value: ex, digits: 5 }, { label: 'Error', value: S - ex, digits: 5 }, { label: 'Relative error', value: (Math.abs(S - ex) / Math.abs(ex)) * 100, unit: '%', digits: 3 }];
  },
  equations: (s, v) => {
    const r = RF[str(v, 'fn')], n = bool(v, 'sweep') ? Math.min(100, 1 + Math.floor((s.t * 6) % 140)) : Math.round(num(v, 'n'));
    return [String.raw`\int_{${r.aTex}}^{${r.bTex}} ${r.tex}\,dx=\left[${r.texF}\right]=${fmt(r.F(r.b) - r.F(r.a), 5)}`, String.raw`S_{${n}}=\sum_{i=1}^{${n}} f(x_i^*)\,\Delta x=${fmt(riemann(str(v, 'fn'), str(v, 'method'), n), 5)}`];
  },
});

/* ================================================================== */
/*  2. Tangent lines and the limit definition of the derivative        */
/* ================================================================== */

const TF: Record<string, { name: string; f: (x: number) => number; df: (x: number) => number; tex: string; dtex: string }> = {
  x2: { name: 'f(x) = x²', f: x => x * x, df: x => 2 * x, tex: 'x^2', dtex: '2x' },
  sin: { name: 'f(x) = sin x', f: Math.sin, df: Math.cos, tex: '\\sin x', dtex: '\\cos x' },
  exp: { name: 'f(x) = eˣ', f: Math.exp, df: Math.exp, tex: 'e^x', dtex: 'e^x' },
  cubic: { name: 'f(x) = x³ − 3x', f: x => x ** 3 - 3 * x, df: x => 3 * x * x - 3, tex: 'x^3-3x', dtex: '3x^2-3' },
};
interface TgS { x0: number; hAnim: number; drag: boolean }
const hEff = (h: number) => (Math.abs(h) < 0.005 ? 0.005 : h);
export const tangentLimit = defineSim<TgS>({
  id: 'tangent-limit', title: 'Tangent Lines & the Derivative Limit',
  ...meta('Math', SCHOOL_11_12, 'Intermediate', 'Calculus', 'Differentiation', 'Secant to tangent: derivative as a limit'),
  covers: ['Tangent lines and derivative limits'], tags: ['NCERT', 'CBSE', 'JEE', 'derivative', 'first principles', 'secant', 'slope', 'limit'],
  learningObjectives: ['See the tangent as the limit of secant lines as h → 0.', 'Read the derivative as the slope of the tangent at a point.', 'Compare the difference quotient with the exact derivative.'],
  assumptions: ['f is differentiable at the chosen point.', 'h is never exactly 0 (the quotient 0/0 is undefined) - the tool clamps |h| to at least 0.005.'],
  derivation: mkDerivation("f'(x)=\\lim_{h\\to0}\\frac{f(x+h)-f(x)}{h}", "Find the derivative of f(x)=x² from first principles.",
    ['f(x)=x² is defined for all real x.', 'h ≠ 0 while simplifying.'],
    [{ symbol: 'h', meaning: 'horizontal step between the two points' }, { symbol: 'm_{sec}', meaning: 'slope of the secant line' }],
    'Slope of a line through two points = rise / run',
    [
      { title: 'Secant slope', math: 'm_{sec}=\\frac{f(x+h)-f(x)}{(x+h)-x}', explanation: 'The slope of the line through (x, f(x)) and (x+h, f(x+h)).' },
      { title: 'Substitute f(x)=x²', math: 'm_{sec}=\\frac{(x+h)^2-x^2}{h}', explanation: 'Replace f by the squaring function.' },
      { title: 'Expand', math: 'm_{sec}=\\frac{x^2+2xh+h^2-x^2}{h}=\\frac{2xh+h^2}{h}', explanation: 'Expand (x+h)² and cancel x².' },
      { title: 'Cancel h', math: 'm_{sec}=2x+h\\quad(h\\neq0)', explanation: 'Valid because h ≠ 0.' },
      { title: 'Let h → 0', math: "f'(x)=\\lim_{h\\to0}(2x+h)=2x", explanation: 'As the second point slides to the first, the secant becomes the tangent.' },
    ], "f'(x)=2x", undefined, 'At x = 1.5 the tangent to y = x² has slope 3.'),
  blurb: 'Slide a second point towards the first and watch the secant line turn into the tangent. The slope of the secant approaches the derivative.',
  hint: 'Derivative as a limit: f\'(x0) = lim h->0 [f(x0+h) - f(x0)]/h. The secant slope through x0 and x0+h approaches the tangent slope. Try shrinking h from both sides (positive and negative); both must agree for the derivative to exist.',
  params: [
    { kind: 'select', id: 'fn', label: 'Function', value: 'x2', options: Object.entries(TF).map(([k, r]) => ({ value: k, label: r.name })) },
    { kind: 'number', id: 'h', label: 'Step h', min: -2, max: 2, step: 0.01, value: 1, digits: 2 },
    { kind: 'toggle', id: 'shrink', label: 'Animate h → 0', value: false },
  ],
  previewSeconds: 0, dt: 1 / 60,
  init() { return { x0: 1, hAnim: 2, drag: false }; },
  step(s, v, dt) { if (bool(v, 'shrink')) { s.hAnim *= Math.exp(-dt * 0.7); if (s.hAnim < 0.006) s.hAnim = 2; } },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const t = TF[str(v, 'fn')], hh = hEff(bool(v, 'shrink') ? s.hAnim : num(v, 'h')), x0 = s.x0;
    const isWide = wide(w), pr = isWide ? { x: 8, y: 8, w: w * 0.66 - 12, h: h - 16 } : { x: 8, y: 8, w: w - 16, h: h * 0.7 - 12 };
    const xr: [number, number] = str(v, 'fn') === 'sin' ? [-4, 4] : [-3, 3];
    let yr: [number, number] = [-4, 8]; if (str(v, 'fn') === 'sin') yr = [-2, 2]; if (str(v, 'fn') === 'exp') yr = [-1, 12]; if (str(v, 'fn') === 'cubic') yr = [-4, 6];
    const m = plot(c, pr, xr, yr, { title: 'Drag the blue point along the curve', zeroAxis: true });
    c.save(); c.beginPath(); c.rect(pr.x + 34, pr.y + 20, pr.w - 42, pr.h - 38); c.clip();
    const y0 = t.f(x0), x1 = x0 + hh, y1 = t.f(x1), msec = (y1 - y0) / hh, mt = t.df(x0);
    const L = (k: number, col: string, wd: number, dash?: number[]) => line(c, m.X(xr[0]), m.Y(y0 + k * (xr[0] - x0)), m.X(xr[1]), m.Y(y0 + k * (xr[1] - x0)), col, wd, dash);
    L(mt, C.green, 1.8, [6, 5]); L(msec, C.orange, 2.4);
    curve(c, m, t.f, xr[0], xr[1], C.amber, 2.6);
    line(c, m.X(x0), m.Y(y0), m.X(x1), m.Y(y0), C.dim, 1, [3, 3]); line(c, m.X(x1), m.Y(y0), m.X(x1), m.Y(y1), C.dim, 1, [3, 3]);
    circle(c, m.X(x1), m.Y(y1), 5, C.orange, C.white, 1.5); circle(c, m.X(x0), m.Y(y0), 7, C.blue, C.white, 2);
    c.restore();
    text(c, 'secant', pr.x + pr.w - 10, pr.y + 34, C.orange, 11, 'right', 'alphabetic', true); text(c, 'tangent', pr.x + pr.w - 10, pr.y + 48, C.green, 11, 'right', 'alphabetic', true);
    // table of slopes as h -> 0
    const tr = isWide ? { x: pr.w + 16, y: 8, w: w - pr.w - 24, h: h - 16 } : { x: 8, y: pr.h + 16, w: w - 16, h: h - pr.h - 24 };
    panel(c, tr); text(c, 'Secant slope as h shrinks', tr.x + 8, tr.y + 15, C.text, 11, 'left', 'alphabetic', true);
    const hs = isWide ? [1, 0.5, 0.1, 0.01, -0.01, -0.1, -0.5, -1] : [1, 0.1, 0.01, -0.01];
    const rowH = Math.min(18, (tr.h - 34) / hs.length);
    hs.forEach((hv, i) => { const sl = (t.f(x0 + hv) - t.f(x0)) / hv; text(c, `h = ${hv}`, tr.x + 10, tr.y + 34 + i * rowH, C.dim, 10.5); text(c, fmt(sl, 4), tr.x + tr.w - 10, tr.y + 34 + i * rowH, Math.abs(sl - mt) < 0.02 ? C.green : C.text, 10.5, 'right'); });
  },
  pointer(s, v, e) {
    if (e.kind === 'up') { s.drag = false; return; }
    const isW = wide(e.w), pw = isW ? e.w * 0.66 - 12 : e.w - 16, ph = isW ? e.h - 16 : e.h * 0.7 - 12;
    const xr = str(v, 'fn') === 'sin' ? 4 : 3, ix = 8 + 34, iw = pw - 42;
    const x = -xr + ((e.x - ix) / iw) * 2 * xr;
    if (e.kind === 'down' && e.y < 8 + ph) s.drag = true;
    if (s.drag) s.x0 = clamp(x, -xr + 0.2, xr - 0.2);
  },
  readouts: (s, v) => {
    const t = TF[str(v, 'fn')], hh = hEff(num(v, 'h')), x0 = s.x0, ms = (t.f(x0 + hh) - t.f(x0)) / hh;
    return [{ label: 'Point x₀', value: x0, digits: 2 }, { label: 'f(x₀)', value: t.f(x0), digits: 3 }, { label: 'Secant slope', value: ms, digits: 4 }, { label: 'Tangent slope f′(x₀)', value: t.df(x0), digits: 4 }, { label: 'Gap', value: Math.abs(ms - t.df(x0)), digits: 4 }];
  },
  equations: (s, v) => {
    const t = TF[str(v, 'fn')], hh = hEff(num(v, 'h')), x0 = s.x0;
    return [String.raw`m_{sec}=\frac{f(x_0+h)-f(x_0)}{h}=\frac{${fmt(t.f(x0 + hh), 3)}-${fmt(t.f(x0), 3)}}{${fmt(hh, 2)}}=${fmt((t.f(x0 + hh) - t.f(x0)) / hh, 4)}`, String.raw`f'(x)=\lim_{h\to0}\frac{f(x+h)-f(x)}{h}=${t.dtex}\;\Rightarrow\; f'(${fmt(x0, 2)})=${fmt(t.df(x0), 4)}`];
  },
});

/* ================================================================== */
/*  3. Fundamental Theorem of Calculus                                 */
/* ================================================================== */

const FF: Record<string, { name: string; f: (x: number) => number; tex: string }> = {
  poly: { name: 'f(x) = x² − 2x + 1.5', f: x => x * x - 2 * x + 1.5, tex: 'x^2-2x+1.5' },
  sin: { name: 'f(x) = 2 sin x', f: x => 2 * Math.sin(x), tex: '2\\sin x' },
  wave: { name: 'f(x) = x·cos x', f: x => x * Math.cos(x), tex: 'x\\cos x' },
  step: { name: 'f(x) = 3 − x', f: x => 3 - x, tex: '3-x' },
};
const FA = 0, FB = 6, FN = 600;
function cumulative(fn: string) {
  const f = FF[fn].f, A = new Array(FN + 1).fill(0), dx = (FB - FA) / FN;
  for (let i = 1; i <= FN; i++) A[i] = A[i - 1] + (f(FA + (i - 1) * dx) + f(FA + i * dx)) * 0.5 * dx;
  return A;
}
interface FtS { x: number; drag: boolean; fn: string; A: number[] }
export const ftc = defineSim<FtS>({
  id: 'ftc-area-function', title: 'Fundamental Theorem of Calculus',
  ...meta('Math', SCHOOL_11_12, 'Advanced', 'Calculus', 'Integration', 'Area function and its derivative'),
  covers: ['The Fundamental Theorem of Calculus'], tags: ['NCERT', 'CBSE', 'JEE', 'integral', 'derivative', 'area function', 'accumulation'],
  learningObjectives: ['See that A(x) = ∫ f is the accumulated area under f.', 'Observe that the slope of A at x equals f(x).', 'Understand why differentiation and integration are inverse processes.'],
  assumptions: ['f is continuous on [0, 6].', 'A(x) is computed by the trapezoid rule on 600 slices (error < 10⁻⁴ here).'],
  derivation: mkDerivation("\\frac{d}{dx}\\int_a^x f(t)\\,dt=f(x)", 'Show that the derivative of the area function is the integrand.',
    ['f is continuous near x.', 'A(x)=∫ₐˣ f(t)dt.'],
    [{ symbol: 'A(x)', meaning: 'signed area under f from a to x' }, { symbol: 'h', meaning: 'small increment in x' }],
    'Definition of the derivative and additivity of area',
    [
      { title: 'Difference of areas', math: 'A(x+h)-A(x)=\\int_x^{x+h}f(t)\\,dt', explanation: 'The extra area is a thin strip of width h.' },
      { title: 'Strip ≈ rectangle', math: '\\int_x^{x+h}f(t)\\,dt\\approx f(x)\\,h', explanation: 'On a very thin strip f is almost constant.' },
      { title: 'Divide by h', math: '\\frac{A(x+h)-A(x)}{h}\\approx f(x)', explanation: 'The left side is the difference quotient of A.' },
      { title: 'Take the limit', math: "A'(x)=\\lim_{h\\to0}\\frac{A(x+h)-A(x)}{h}=f(x)", explanation: 'Continuity of f makes the approximation exact in the limit.' },
    ], "A'(x)=f(x)", undefined, 'Where f is positive the area function rises; where f is negative it falls.'),
  blurb: 'Drag x along the top graph. The shaded area up to x is plotted as A(x) below, and the slope of A always equals the height of f.',
  hint: 'FTC part 1: if A(x)=integral from 0 to x of f(t)dt then A\'(x)=f(x). Where f>0 A increases, where f<0 A decreases, where f crosses zero A has a local extremum. Part 2: integral a to b of f = F(b)-F(a).',
  params: [
    { kind: 'select', id: 'fn', label: 'Function', value: 'poly', options: Object.entries(FF).map(([k, r]) => ({ value: k, label: r.name })), resetOnChange: true },
    { kind: 'toggle', id: 'tan', label: 'Show slope of A(x)', value: true },
  ],
  previewSeconds: 0, dt: 1 / 60,
  init(v) { return { x: 3.2, drag: false, fn: str(v, 'fn'), A: cumulative(str(v, 'fn')) }; },
  step() { /* static */ },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const f = FF[s.fn].f;
    const top = { x: 8, y: 8, w: w - 16, h: (h - 24) * 0.5 }, bot = { x: 8, y: top.h + 16, w: w - 16, h: h - top.h - 24 };
    let fmin = 0, fmax = 0, amin = 0, amax = 0; for (let i = 0; i <= FN; i += 6) { const y = f(FA + (i * (FB - FA)) / FN); fmin = Math.min(fmin, y); fmax = Math.max(fmax, y); amin = Math.min(amin, s.A[i]); amax = Math.max(amax, s.A[i]); }
    const m = plot(c, top, [FA, FB], [fmin - 0.4, fmax + 0.4], { title: 'f(x) — drag the vertical line', zeroAxis: true });
    c.save(); c.beginPath(); c.rect(top.x + 34, top.y + 20, top.w - 42, top.h - 38); c.clip();
    c.beginPath(); c.moveTo(m.X(FA), m.Y(0));
    const k = Math.round(((s.x - FA) / (FB - FA)) * FN);
    for (let i = 0; i <= k; i++) c.lineTo(m.X(FA + (i * (FB - FA)) / FN), m.Y(f(FA + (i * (FB - FA)) / FN)));
    c.lineTo(m.X(s.x), m.Y(0)); c.closePath(); c.fillStyle = 'rgba(96,165,250,0.35)'; c.fill();
    c.restore();
    curve(c, m, f, FA, FB, C.amber, 2.5);
    line(c, m.X(s.x), m.Y(fmin - 0.4), m.X(s.x), m.Y(fmax + 0.4), C.white, 1.5); circle(c, m.X(s.x), m.Y(f(s.x)), 5, C.amber, C.white, 1.5);
    const m2 = plot(c, bot, [FA, FB], [amin - 0.5, amax + 0.5], { title: 'A(x) = area accumulated from 0 to x', xlabel: 'x', zeroAxis: true });
    polyline(c, s.A.map((a, i) => [m2.X(FA + (i * (FB - FA)) / FN), m2.Y(a)] as [number, number]), C.green, 2.5);
    const Ax = s.A[k], fx = f(s.x);
    if (bool(v, 'tan')) { const sp = 1.2; line(c, m2.X(s.x - sp), m2.Y(Ax - fx * sp), m2.X(s.x + sp), m2.Y(Ax + fx * sp), C.orange, 2); }
    circle(c, m2.X(s.x), m2.Y(Ax), 5.5, C.green, C.white, 1.5);
    text(c, `slope of A = f(x) = ${fmt(fx, 2)}`, bot.x + bot.w - 10, bot.y + 14, C.orange, 11, 'right', 'alphabetic', true);
  },
  pointer(s, _v, e) {
    if (e.kind === 'up') { s.drag = false; return; }
    if (e.kind === 'down') s.drag = true;
    if (s.drag) s.x = clamp(FA + ((e.x - 8 - 34) / (e.w - 16 - 42)) * (FB - FA), 0.05, FB - 0.05);
  },
  readouts: (s) => { const f = FF[s.fn].f, k = Math.round(((s.x - FA) / (FB - FA)) * FN); return [{ label: 'x', value: s.x, digits: 2 }, { label: 'f(x)', value: f(s.x), digits: 3 }, { label: 'A(x) = ∫₀ˣ f', value: s.A[k], digits: 3 }, { label: 'Numerical dA/dx', value: (s.A[Math.min(FN, k + 3)] - s.A[Math.max(0, k - 3)]) / (6 * (FB - FA) / FN), digits: 3 }]; },
  equations: (s) => [String.raw`A(x)=\int_0^{x}${FF[s.fn].tex}\,dt=${fmt(s.A[Math.round(((s.x - FA) / (FB - FA)) * FN)], 3)}\quad\text{at } x=${fmt(s.x, 2)}`, String.raw`\frac{dA}{dx}=f(x)=${fmt(FF[s.fn].f(s.x), 3)}`],
});

/* ================================================================== */
/*  4. 3D vectors: dot and cross product                               */
/* ================================================================== */

interface V3S { dAz: number; dEl: number; lx: number; ly: number; drag: boolean }
const view3 = (s: { dAz: number; dEl: number }, v: Values) => proj3(rad(num(v, 'az')) + s.dAz, clamp(rad(num(v, 'el')) + s.dEl, -1.5, 1.5));
function drag3(s: { dAz: number; dEl: number; lx: number; ly: number; drag: boolean }, e: { kind: string; x: number; y: number }) {
  if (e.kind === 'down') { s.drag = true; s.lx = e.x; s.ly = e.y; }
  else if (e.kind === 'move' && s.drag) { s.dAz += (e.x - s.lx) * 0.012; s.dEl += (e.y - s.ly) * 0.012; s.lx = e.x; s.ly = e.y; }
  else if (e.kind === 'up') s.drag = false;
}
function axes3(c: Ctx, P: (x: number, y: number, z: number) => [number, number, number], X: (a: number) => number, Y: (a: number) => number, R: number) {
  for (let g = -R; g <= R; g++) { const a = P(g, -R, 0), b = P(g, R, 0), a2 = P(-R, g, 0), b2 = P(R, g, 0); line(c, X(a[0]), Y(a[1]), X(b[0]), Y(b[1]), C.grid); line(c, X(a2[0]), Y(a2[1]), X(b2[0]), Y(b2[1]), C.grid); }
  const o = P(0, 0, 0);
  ([[R, 0, 0, 'x', C.red], [0, R, 0, 'y', C.green], [0, 0, R, 'z', C.blue]] as [number, number, number, string, string][]).forEach(([x, y, z, nm, col]) => {
    const p = P(x, y, z); line(c, X(o[0]), Y(o[1]), X(p[0]), Y(p[1]), col, 1.2); text(c, nm, X(p[0]) + 4, Y(p[1]) - 3, col, 11, 'left', 'alphabetic', true);
  });
}
export const vectors3d = defineSim<V3S>({
  id: 'vectors-3d-dot-cross', title: '3D Vectors: Dot & Cross Product',
  ...meta('Math', SCHOOL_11_12, 'Intermediate', 'Vectors & 3D Geometry', 'Vectors', 'Dot product, cross product, projection'),
  covers: ['Three-dimensional vectors, dot products, and cross products', 'Projections and distances between skew lines'], tags: ['NCERT', 'CBSE', 'JEE', 'vectors', 'dot product', 'cross product', 'projection', 'angle between vectors', '3D geometry'],
  learningObjectives: ['Compute a·b and a×b from components and see them geometrically.', 'Relate a·b to the angle and projection, and |a×b| to the parallelogram area.', 'Check that a×b is perpendicular to both a and b (right-hand rule).'],
  assumptions: ['Right-handed coordinate system with z pointing up.', 'Orthographic projection - drag the scene to rotate it.'],
  derivation: mkDerivation('\\vec a\\cdot\\vec b=|\\vec a||\\vec b|\\cos\\theta', 'Connect the component form of the dot product to the angle between vectors.',
    ['Vectors in ℝ³ with a common origin.'],
    [{ symbol: '\\theta', meaning: 'angle between a and b' }],
    'Law of cosines applied to the triangle with sides a, b and a − b',
    [
      { title: 'Law of cosines', math: '|\\vec a-\\vec b|^2=|\\vec a|^2+|\\vec b|^2-2|\\vec a||\\vec b|\\cos\\theta', explanation: 'The third side of the triangle formed by a and b.' },
      { title: 'Expand with components', math: '|\\vec a-\\vec b|^2=|\\vec a|^2+|\\vec b|^2-2(a_xb_x+a_yb_y+a_zb_z)', explanation: 'Squaring each component of a − b and collecting terms.' },
      { title: 'Compare', math: 'a_xb_x+a_yb_y+a_zb_z=|\\vec a||\\vec b|\\cos\\theta', explanation: 'Both expressions equal |a − b|², so the cross terms match.' },
    ], '\\vec a\\cdot\\vec b=a_xb_x+a_yb_y+a_zb_z=|\\vec a||\\vec b|\\cos\\theta', undefined, 'a·b = 0 exactly when the vectors are perpendicular.'),
  blurb: 'Set the components of two vectors in 3D and see their dot product, angle, projection and cross product. Drag the scene to rotate it.',
  hint: 'Dot product a.b = |a||b|cos(theta) gives the angle and projection of a on b; cross product a x b is perpendicular to both with magnitude |a||b|sin(theta) = parallelogram area (right-hand rule). a.b=0 means perpendicular, a x b = 0 means parallel.',
  params: [
    { kind: 'number', id: 'ax', label: 'a: x', min: -5, max: 5, step: 0.5, value: 3 }, { kind: 'number', id: 'ay', label: 'a: y', min: -5, max: 5, step: 0.5, value: 1 }, { kind: 'number', id: 'az', label: 'a: z', min: -5, max: 5, step: 0.5, value: 2 },
    { kind: 'number', id: 'bx', label: 'b: x', min: -5, max: 5, step: 0.5, value: -1 }, { kind: 'number', id: 'by', label: 'b: y', min: -5, max: 5, step: 0.5, value: 3 }, { kind: 'number', id: 'bz', label: 'b: z', min: -5, max: 5, step: 0.5, value: 1 },
    { kind: 'number', id: 'az0', label: 'View azimuth', min: -180, max: 180, step: 5, value: -40, unit: '°' }, { kind: 'toggle', id: 'plane', label: 'Show parallelogram & projection', value: true },
  ].map(p => (p.id === 'az0' ? { ...p, id: 'az' } : p)) as never,
  previewSeconds: 0,
  init() { return { dAz: 0, dEl: 0, lx: 0, ly: 0, drag: false }; },
  step() { /* static */ },
  draw() { /* replaced below */ },
  readouts: () => [],
});
