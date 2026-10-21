import { defineSim, num, str, bool } from './types';
import { C, TAU, arrow, circle, clamp, deg, drawScope, fmt, line, panel, plot, polyline, rnd, gauss, Scope, text } from './draw';

/* ================================================================== */
/*  Fourier epicycles                                                  */
/* ================================================================== */

interface FoS { t: number; trace: number[]; n: number }
const coef = (shape: string, k: number): number => {
  if (shape === 'square') return k % 2 ? 4 / (Math.PI * k) : 0;
  if (shape === 'saw') return ((k % 2 ? 1 : -1) * 2) / (Math.PI * k);
  return k % 2 ? ((8 / (Math.PI * Math.PI * k * k)) * (((k - 1) / 2) % 2 ? -1 : 1)) : 0;
};
export const fourier = defineSim<FoS>({
  id: 'fourier', title: 'Fourier Circles', subject: 'Math',
  blurb: 'Any repeating wave is a stack of spinning circles. Add more circles and watch a square, sawtooth or triangle wave appear from pure sine motion.',
  hint: 'Fourier series: periodic functions are sums of sines. Square wave uses odd harmonics 4/(pi k); sawtooth uses all harmonics 2(-1)^(k+1)/(pi k); triangle uses odd harmonics with 1/k^2 so it converges fast. Gibbs overshoot of about 9% near jumps of the square wave never disappears.',
  params: [
    { kind: 'select', id: 'shape', label: 'Target wave', value: 'square', options: [{ value: 'square', label: 'Square wave' }, { value: 'saw', label: 'Sawtooth' }, { value: 'tri', label: 'Triangle' }] },
    { kind: 'number', id: 'n', label: 'Number of terms', min: 1, max: 25, step: 1, value: 4 },
    { kind: 'number', id: 'spd', label: 'Rotation speed', min: 0.2, max: 3, step: 0.1, value: 1 },
  ],
  previewSeconds: 2,
  init() { return { t: 0, trace: [], n: 0 }; },
  step(s, v, dt) {
    s.t += dt * num(v, 'spd') * 2;
    let y = 0; for (let k = 1; k <= num(v, 'n'); k++) y += coef(str(v, 'shape'), k) * Math.sin(k * s.t);
    if (++s.n % 2 === 0) { s.trace.unshift(y); if (s.trace.length > 420) s.trace.pop(); }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const R = Math.min(h * 0.28, w * 0.16), cx = R * 1.9, cy = h / 2;
    let x = cx, y = cy;
    for (let k = 1; k <= num(v, 'n'); k++) {
      const a = coef(str(v, 'shape'), k); if (a === 0) continue;
      const r = Math.abs(a) * R, psi = k * s.t + (a < 0 ? Math.PI : 0);
      const nx = x + r * Math.cos(psi), ny = y - r * Math.sin(psi);
      circle(c, x, y, r, undefined, 'rgba(148,163,184,0.35)', 1);
      line(c, x, y, nx, ny, C.amber, 1.5); circle(c, nx, ny, 2.5, C.white);
      x = nx; y = ny;
    }
    const px0 = w * 0.42; line(c, x, y, px0, y, C.cyan, 1.2, [3, 3]);
    const sc = R;
    polyline(c, s.trace.map((val, i) => [px0 + i * ((w - px0 - 16) / 420), cy - val * sc] as [number, number]), C.cyan, 2.4);
    line(c, px0, cy, w - 10, cy, C.grid); line(c, px0, cy - R * 1.3, px0, cy + R * 1.3, C.grid);
    // ideal
    const ideal: [number, number][] = []; for (let i = 0; i < 420; i += 2) { const t = s.t - i * 0.0001 * 0 - i * (num(v, 'spd') * 2 * (1 / 240) * 2); let yy = 0; for (let k = 1; k <= 60; k++) yy += coef(str(v, 'shape'), k) * Math.sin(k * t); ideal.push([px0 + i * ((w - px0 - 16) / 420), cy - yy * sc]); }
    polyline(c, ideal, 'rgba(251,191,36,0.28)', 1.4, [4, 4]);
    text(c, 'sum of circles (blue) vs ideal wave (dashed)', px0, 18, C.dim, 11);
  },
  readouts: (s, v) => [{ label: 'Terms', value: num(v, 'n'), digits: 0 }, { label: 'Current value', value: s.trace[0] ?? 0, digits: 3 }, { label: 'Last term size', value: Math.abs(coef(str(v, 'shape'), Math.round(num(v, 'n')))) || Math.abs(coef(str(v, 'shape'), Math.round(num(v, 'n')) - 1)), digits: 3 }],
  equations: (_s, v) => [str(v, 'shape') === 'square' ? String.raw`f(t)=\frac4\pi\sum_{k\ \text{odd}}\frac{\sin kt}{k}` : str(v, 'shape') === 'saw' ? String.raw`f(t)=\frac2\pi\sum_{k=1}^{\infty}(-1)^{k+1}\frac{\sin kt}{k}` : String.raw`f(t)=\frac{8}{\pi^2}\sum_{k\ \text{odd}}(-1)^{\frac{k-1}{2}}\frac{\sin kt}{k^2}`],
});

/* ================================================================== */
/*  Unit circle trigonometry                                           */
/* ================================================================== */

interface TrS { th: number }
export const trig = defineSim<TrS>({
  id: 'trig', title: 'Unit Circle & Trig', subject: 'Math',
  blurb: 'Sine, cosine and tangent are just lengths on a circle. Spin the angle and see them draw their waves.',
  hint: 'On the unit circle a point at angle theta is (cos theta, sin theta). tan theta = sin/cos blows up at 90 and 270 degrees. Sine and cosine graphs are the same wave shifted by 90 degrees. sin^2+cos^2=1 always.',
  params: [
    { kind: 'toggle', id: 'auto', label: 'Spin automatically', value: true },
    { kind: 'number', id: 'ang', label: 'Angle (when not spinning)', min: 0, max: 360, step: 1, value: 40, unit: '°' },
    { kind: 'toggle', id: 'tan', label: 'Show tangent', value: true },
  ],
  previewSeconds: 1,
  init() { return { th: 0.7 }; },
  step(s, v, dt) { if (bool(v, 'auto')) s.th = (s.th + dt * 0.8) % TAU; else s.th = (num(v, 'ang') * Math.PI) / 180; },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const R = Math.min(h * 0.36, w * 0.2), cx = R + 34, cy = h / 2;
    line(c, cx - R * 1.4, cy, cx + R * 1.4, cy, C.axis); line(c, cx, cy - R * 1.4, cx, cy + R * 1.4, C.axis);
    circle(c, cx, cy, R, undefined, C.dim, 1.5);
    const px = cx + R * Math.cos(s.th), py = cy - R * Math.sin(s.th);
    c.save(); c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, 22, 0, -s.th, true); c.closePath(); c.fillStyle = 'rgba(251,191,36,0.3)'; c.fill(); c.restore();
    line(c, cx, cy, px, py, C.white, 2.5);
    line(c, px, py, px, cy, C.red, 3); line(c, cx, cy, px, cy, C.green, 3);
    if (bool(v, 'tan') && Math.abs(Math.cos(s.th)) > 0.05) { const ty = cy - R * Math.tan(s.th) * Math.sign(Math.cos(s.th)) * Math.sign(Math.cos(s.th)); line(c, cx + R * Math.sign(Math.cos(s.th)), cy, cx + R * Math.sign(Math.cos(s.th)), clamp(cy - R * Math.tan(s.th) * Math.sign(Math.cos(s.th)), cy - R * 1.4, cy + R * 1.4), C.purple, 2.5); void ty; }
    circle(c, px, py, 6, C.amber, C.white, 1.5);
    text(c, 'sin', px + 6, (py + cy) / 2, C.red, 12, 'left', 'alphabetic', true); text(c, 'cos', (px + cx) / 2, cy + 16, C.green, 12, 'center', 'alphabetic', true);
    const gx = cx + R * 1.9, gw = w - gx - 14;
    const m = plot(c, { x: gx, y: 12, w: gw, h: h - 24 }, [0, 360], [-1.5, 1.5], { title: 'sin θ (red), cos θ (green), tan θ (purple)', xlabel: 'angle (degrees)', xstep: 90, ystep: 0.5, zeroAxis: true });
    c.save(); c.beginPath(); c.rect(gx + 34, 32, gw - 42, h - 24 - 20 - 26 + 12); c.clip();
    const pts = (f: (t: number) => number): [number, number][] => { const o: [number, number][] = []; for (let d = 0; d <= 360; d += 2) o.push([m.X(d), m.Y(f((d * Math.PI) / 180))]); return o; };
    polyline(c, pts(Math.sin), C.red, 2.2); polyline(c, pts(Math.cos), C.green, 2.2);
    if (bool(v, 'tan')) { let seg: [number, number][] = []; for (let d = 0; d <= 360; d += 1) { const t = (d * Math.PI) / 180, val = Math.tan(t); if (Math.abs(val) > 1.5) { polyline(c, seg, C.purple, 1.8); seg = []; } else seg.push([m.X(d), m.Y(val)]); } polyline(c, seg, C.purple, 1.8); }
    c.restore();
    const d = deg(s.th); line(c, m.X(d), m.Y(-1.5), m.X(d), m.Y(1.5), C.amber, 1.5, [4, 4]);
    circle(c, m.X(d), m.Y(Math.sin(s.th)), 5, C.red); circle(c, m.X(d), m.Y(Math.cos(s.th)), 5, C.green);
  },
  readouts: (s) => [{ label: 'Angle', value: deg(s.th), unit: '°', digits: 1 }, { label: 'Radians', value: s.th, digits: 3 }, { label: 'sin θ', value: Math.sin(s.th), digits: 3 }, { label: 'cos θ', value: Math.cos(s.th), digits: 3 }, { label: 'tan θ', value: Math.abs(Math.cos(s.th)) < 1e-3 ? 'undefined' : Math.tan(s.th), digits: 3 }],
  equations: (s) => [String.raw`\sin^2\theta+\cos^2\theta=${fmt(Math.sin(s.th) ** 2, 3)}+${fmt(Math.cos(s.th) ** 2, 3)}=1`],
});

/* ================================================================== */
/*  Galton board / central limit                                       */
/* ================================================================== */

interface GaS { balls: { row: number; pos: number; next: number; p: number }[]; bins: number[]; total: number; clock: number; rowsUsed: number }
const binom = (n: number, k: number) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
export const galton = defineSim<GaS>({
  id: 'galton', title: 'Galton Board', subject: 'Math',
  blurb: 'Balls bounce left or right at every peg. Individually unpredictable, together they build a bell curve. Tilt the odds and watch the pile shift.',
  hint: 'Each ball makes n independent left/right choices, so the landing bin follows a binomial distribution; for large n this is close to a normal curve (central limit theorem). Mean n p, standard deviation sqrt(n p (1-p)). A bias p changes the mean and skews the pile.',
  params: [
    { kind: 'number', id: 'rows', label: 'Rows of pegs', min: 3, max: 14, step: 1, value: 10, resetOnChange: true },
    { kind: 'number', id: 'p', label: 'Chance of going right', min: 0.1, max: 0.9, step: 0.01, value: 0.5 },
    { kind: 'number', id: 'rate', label: 'Balls per second', min: 1, max: 40, step: 1, value: 10 },
  ],
  previewSeconds: 6,
  init(v) { return { balls: [], bins: new Array(num(v, 'rows') + 1).fill(0), total: 0, clock: 0, rowsUsed: num(v, 'rows') }; },
  step(s, v, dt) {
    const n = s.rowsUsed;
    s.clock += dt * num(v, 'rate');
    while (s.clock >= 1) { s.clock -= 1; s.balls.push({ row: 0, pos: 0, next: Math.random() < num(v, 'p') ? 1 : 0, p: 0 }); }
    for (const b of s.balls) {
      b.p += dt * 5;
      if (b.p >= 1) {
        b.p = 0; b.row++; b.pos = b.next;
        if (b.row >= n) { s.bins[b.pos]++; s.total++; b.row = 9999; } else b.next = b.pos + (Math.random() < num(v, 'p') ? 1 : 0);
      }
    }
    s.balls = s.balls.filter(b => b.row < 9999);
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const n = s.rowsUsed, bw = Math.min(w * 0.55, 440), x0 = 14, top = 18, rowH = (h * 0.55) / (n + 1), dx = bw / (n + 1);
    const pegX = (r: number, i: number) => x0 + bw / 2 + (i - r / 2) * dx;
    for (let r = 0; r < n; r++) for (let i = 0; i <= r; i++) circle(c, pegX(r, i), top + (r + 0.5) * rowH, 2.5, C.dim);
    for (const b of s.balls) {
      const xa = pegX(b.row, b.pos), xb = pegX(b.row + 1, b.next);
      circle(c, xa + (xb - xa) * b.p, top + (b.row + b.p) * rowH, 3.5, C.amber);
    }
    const by = top + (n + 0.6) * rowH, bh = h - by - 16, maxc = Math.max(4, ...s.bins);
    const cwid = bw / (n + 1);
    s.bins.forEach((cnt, i) => { const hh = (cnt / maxc) * bh * 0.95; c.fillStyle = 'rgba(96,165,250,0.75)'; c.fillRect(x0 + i * cwid + 1, by + bh - hh, cwid - 2, hh); text(c, `${i}`, x0 + (i + 0.5) * cwid, by + bh + 12, C.dim, 10, 'center'); });
    if (s.total > 5) { const pts: [number, number][] = []; for (let i = 0; i <= n; i++) pts.push([x0 + (i + 0.5) * cwid, by + bh - ((s.total * binom(n, i) * num(v, 'p') ** i * (1 - num(v, 'p')) ** (n - i)) / maxc) * bh * 0.95]); polyline(c, pts, C.amber, 2.5); }
    const rx = x0 + bw + 24, rw = w - rx - 12; panel(c, { x: rx, y: 14, w: rw, h: 130 });
    const mean = s.total ? s.bins.reduce((a, b, i) => a + b * i, 0) / s.total : 0, sd = s.total ? Math.sqrt(s.bins.reduce((a, b, i) => a + b * (i - mean) ** 2, 0) / s.total) : 0;
    text(c, `balls landed: ${s.total}`, rx + 10, 36, C.text, 13, 'left', 'alphabetic', true);
    text(c, `mean ${fmt(mean, 2)} (theory ${fmt(n * num(v, 'p'), 2)})`, rx + 10, 60, C.dim, 12); text(c, `spread ${fmt(sd, 2)} (theory ${fmt(Math.sqrt(n * num(v, 'p') * (1 - num(v, 'p'))), 2)})`, rx + 10, 80, C.dim, 12);
    text(c, 'amber line = binomial theory', rx + 10, 108, C.amber, 11);
  },
  readouts: (s, v) => { const mean = s.total ? s.bins.reduce((a, b, i) => a + b * i, 0) / s.total : 0; return [{ label: 'Balls', value: s.total, digits: 0 }, { label: 'Mean bin', value: mean, digits: 2 }, { label: 'Theory mean', value: s.rowsUsed * num(v, 'p'), digits: 2 }]; },
  equations: (s, v) => [String.raw`P(k)=\binom{n}{k}p^k(1-p)^{n-k},\quad \mu=np=${fmt(s.rowsUsed * num(v, 'p'), 2)},\ \sigma=\sqrt{np(1-p)}=${fmt(Math.sqrt(s.rowsUsed * num(v, 'p') * (1 - num(v, 'p'))), 2)}`],
});

/* ================================================================== */
/*  Least squares regression with draggable points                     */
/* ================================================================== */

interface RgS { pts: [number, number][]; pick: number }
const fit = (pts: [number, number][]) => {
  const n = pts.length; if (n < 2) return { m: 0, b: 0, r2: 0, sse: 0 };
  const mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0, sxy = 0, syy = 0; for (const p of pts) { sxx += (p[0] - mx) ** 2; sxy += (p[0] - mx) * (p[1] - my); syy += (p[1] - my) ** 2; }
  const m = sxx ? sxy / sxx : 0, b = my - m * mx; const sse = pts.reduce((a, p) => a + (p[1] - (m * p[0] + b)) ** 2, 0);
  return { m, b, r2: syy ? 1 - sse / syy : 0, sse };
};
const randPts = (): [number, number][] => Array.from({ length: 12 }, (_, i) => { const x = 0.8 + (i * 8.4) / 11; return [x, clamp(1.5 + 0.7 * x + gauss() * 1.1, 0.3, 9.7)] as [number, number]; });
export const regression = defineSim<RgS>({
  id: 'regression', title: 'Line of Best Fit', subject: 'Math',
  blurb: 'Drag the points, or click empty space to add more. The orange squares show the squared errors, and the least-squares line is the one that makes their total area as small as possible.',
  hint: 'Least squares regression minimises the sum of squared vertical residuals. Slope m = Sxy/Sxx, intercept b = ybar - m xbar, R squared = 1 - SSE/SST. One outlier can tilt the line a lot. Compare your manual line with the best fit.',
  params: [
    { kind: 'toggle', id: 'sq', label: 'Show squared errors', value: true },
    { kind: 'toggle', id: 'manual', label: 'Use my own line instead', value: false },
    { kind: 'number', id: 'mm', label: 'My slope', min: -2, max: 3, step: 0.05, value: 0.5 },
    { kind: 'number', id: 'bb', label: 'My intercept', min: -3, max: 8, step: 0.1, value: 2 },
  ],
  actions: [{ id: 'rand', label: 'New random data' }, { id: 'clear', label: 'Clear points' }, { id: 'outlier', label: 'Add outlier' }],
  previewSeconds: 0,
  init() { return { pts: randPts(), pick: -1 }; },
  action(s, _v, id) { if (id === 'rand') s.pts = randPts(); else if (id === 'clear') s.pts = []; else s.pts.push([8.5, 0.8]); },
  step() { /* static */ },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const area = { x: 10, y: 10, w: Math.min(w - 20, 560), h: h - 20 };
    const m = plot(c, area, [0, 10], [0, 10], { xstep: 1, ystep: 1 });
    const f = fit(s.pts), man = bool(v, 'manual'), L = man ? { m: num(v, 'mm'), b: num(v, 'bb') } : f;
    if (bool(v, 'sq')) for (const p of s.pts) { const yh = L.m * p[0] + L.b, e = yh - p[1]; const side = Math.abs(m.X(p[0] + Math.abs(e)) - m.X(p[0])); c.fillStyle = 'rgba(251,146,60,0.28)'; c.strokeStyle = C.orange; c.lineWidth = 1; c.beginPath(); c.rect(e >= 0 ? m.X(p[0]) : m.X(p[0]), Math.min(m.Y(yh), m.Y(p[1])), side * (e >= 0 ? 1 : 1), Math.abs(m.Y(yh) - m.Y(p[1]))); c.fill(); c.stroke(); }
    c.save(); c.beginPath(); c.rect(area.x + 34, area.y + 8, area.w - 42, area.h - 26); c.clip(); line(c, m.X(0), m.Y(L.b), m.X(10), m.Y(L.m * 10 + L.b), man ? C.cyan : C.green, 3); if (man) line(c, m.X(0), m.Y(f.b), m.X(10), m.Y(f.m * 10 + f.b), 'rgba(52,211,153,0.5)', 2, [6, 5]); c.restore();
    for (const p of s.pts) { line(c, m.X(p[0]), m.Y(p[1]), m.X(p[0]), m.Y(L.m * p[0] + L.b), C.orange, 1.5); circle(c, m.X(p[0]), m.Y(p[1]), 6, C.amber, C.white, 1.5); }
    if (!s.pts.length) text(c, 'click to add points', area.x + area.w / 2, area.y + area.h / 2, C.dim, 14, 'center');
  },
  pointer(s, _v, e) {
    const area = { x: 10, y: 10, w: Math.min(e.w - 20, 560), h: e.h - 20 };
    const ix = area.x + 34, iw = area.w - 42, iy = area.y + 8, ih = area.h - 26;
    const toX = (px: number) => ((px - ix) / iw) * 10, toY = (py: number) => ((iy + ih - py) / ih) * 10;
    if (e.kind === 'up') { s.pick = -1; return; }
    if (e.kind === 'down') {
      let best = -1, bd = 18; s.pts.forEach((p, i) => { const d = Math.hypot(ix + (p[0] / 10) * iw - e.x, iy + ih - (p[1] / 10) * ih - e.y); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) s.pick = best; else if (s.pts.length < 40 && e.x > ix && e.y < iy + ih) { s.pts.push([clamp(toX(e.x), 0, 10), clamp(toY(e.y), 0, 10)]); s.pick = s.pts.length - 1; }
    }
    if (s.pick >= 0) s.pts[s.pick] = [clamp(toX(e.x), 0, 10), clamp(toY(e.y), 0, 10)];
  },
  readouts: (s, v) => { const f = fit(s.pts), L = bool(v, 'manual') ? { m: num(v, 'mm'), b: num(v, 'bb') } : f, sse = s.pts.reduce((a, p) => a + (p[1] - (L.m * p[0] + L.b)) ** 2, 0); return [{ label: 'Slope m', value: L.m, digits: 3 }, { label: 'Intercept b', value: L.b, digits: 3 }, { label: 'R²', value: f.r2, digits: 3 }, { label: 'Your SSE', value: sse, digits: 2 }, { label: 'Best possible SSE', value: f.sse, digits: 2 }, { label: 'Points', value: s.pts.length, digits: 0 }]; },
  equations: (s) => { const f = fit(s.pts); return [String.raw`\hat y=${fmt(f.m, 3)}\,x+${fmt(f.b, 3)}\qquad R^2=${fmt(f.r2, 3)}`, String.raw`m=\frac{\sum(x-\bar x)(y-\bar y)}{\sum(x-\bar x)^2},\quad b=\bar y-m\bar x`]; },
});

/* ================================================================== */
/*  Quadratic explorer                                                 */
/* ================================================================== */

interface QdS { t: number }
export const quadratic = defineSim<QdS>({
  id: 'quadratic', title: 'Quadratic Explorer', subject: 'Math',
  blurb: 'Change a, b and c and watch the parabola, its vertex, its roots and the discriminant respond together.',
  hint: 'y = ax^2+bx+c. Vertex at x=-b/(2a). Discriminant D=b^2-4ac decides roots: D>0 two real roots, D=0 one repeated root, D<0 none on the real axis (complex pair). a sets opening direction and width; c is the y-intercept.',
  params: [
    { kind: 'number', id: 'a', label: 'a', min: -3, max: 3, step: 0.1, value: 1 },
    { kind: 'number', id: 'b', label: 'b', min: -8, max: 8, step: 0.1, value: -2 },
    { kind: 'number', id: 'c', label: 'c', min: -8, max: 8, step: 0.1, value: -3 },
  ],
  previewSeconds: 0,
  init() { return { t: 0 }; },
  step() { /* static */ },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const a = num(v, 'a') || 0.001, b = num(v, 'b'), cc = num(v, 'c');
    const m = plot(c, { x: 10, y: 10, w: Math.min(w - 20, 640), h: h - 20 }, [-10, 10], [-10, 10], { xstep: 2, ystep: 2, zeroAxis: true });
    const pts: [number, number][] = []; for (let x = -10; x <= 10; x += 0.1) pts.push([m.X(x), m.Y(a * x * x + b * x + cc)]);
    c.save(); c.beginPath(); c.rect(44, 18, Math.min(w - 20, 640) - 42, h - 20 - 26); c.clip(); polyline(c, pts, C.amber, 3); c.restore();
    const vx = -b / (2 * a), vy = a * vx * vx + b * vx + cc;
    line(c, m.X(vx), m.Y(-10), m.X(vx), m.Y(10), C.grid, 1, [5, 5]);
    circle(c, m.X(vx), m.Y(vy), 6, C.cyan, C.white, 1.5); text(c, `vertex (${fmt(vx, 2)}, ${fmt(vy, 2)})`, m.X(vx) + 10, m.Y(vy) + (a > 0 ? 18 : -10), C.cyan, 12);
    circle(c, m.X(0), m.Y(cc), 5, C.green); const D = b * b - 4 * a * cc;
    if (D >= 0) [(-b + Math.sqrt(D)) / (2 * a), (-b - Math.sqrt(D)) / (2 * a)].forEach(r => { circle(c, m.X(r), m.Y(0), 6, C.red, C.white, 1.5); text(c, fmt(r, 2), m.X(r), m.Y(0) + 18, C.red, 12, 'center', 'alphabetic', true); });
  },
  readouts: (_s, v) => { const a = num(v, 'a') || 0.001, b = num(v, 'b'), c = num(v, 'c'), D = b * b - 4 * a * c; return [{ label: 'Discriminant D', value: D, digits: 2 }, { label: 'Roots', value: D > 0 ? `${fmt((-b + Math.sqrt(D)) / (2 * a), 2)}, ${fmt((-b - Math.sqrt(D)) / (2 * a), 2)}` : D === 0 ? `${fmt(-b / (2 * a), 2)} (double)` : 'complex' }, { label: 'Vertex x', value: -b / (2 * a), digits: 2 }, { label: 'Opens', value: a > 0 ? 'upward' : 'downward' }]; },
  equations: (_s, v) => { const a = num(v, 'a') || 0.001, b = num(v, 'b'), c = num(v, 'c'); return [String.raw`y=${fmt(a, 1)}x^2${b < 0 ? '' : '+'}${fmt(b, 1)}x${c < 0 ? '' : '+'}${fmt(c, 1)}`, String.raw`D=b^2-4ac=${fmt(b * b - 4 * a * c, 2)}\qquad x=\frac{-b\pm\sqrt D}{2a}`]; },
});
void arrow; void drawScope; void rnd; void Scope;
