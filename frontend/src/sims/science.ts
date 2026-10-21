import { defineSim, num, str, bool } from './types';
import {
  C, TAU, arrow, circle, clamp, drawScope, fmt, gauss, hsl, line, panel, plot, polyline, rnd, Scope, text, wavelengthToRgb,
} from './draw';

/* ================================================================== */
/*  CHEMISTRY: gas laws                                                */
/* ================================================================== */

interface Gp { x: number; y: number; vx: number; vy: number }
interface GasS { p: Gp[]; Tcur: number; bucket: number[]; bt: number; P: number; t: number; wall: number }
const KEFF = 36; // velocity scale: sigma^2 = KEFF*T/m
export const gas = defineSim<GasS>({
  id: 'gas', title: 'Gas Laws Lab', subject: 'Chemistry',
  blurb: 'Particles in a box. Heat them, squeeze the box or add more gas and see pressure respond. The speed histogram follows the Maxwell–Boltzmann curve.',
  hint: 'Ideal gas in a 2D box: PV = N k T. Pressure comes from wall collisions. Higher temperature means faster particles and more pressure; smaller volume means more frequent collisions (Boyle). Speed distribution is Maxwell-Boltzmann; heavier particles are slower at the same T.',
  params: [
    { kind: 'number', id: 'N', label: 'Number of particles', min: 10, max: 400, step: 5, value: 120, resetOnChange: true },
    { kind: 'number', id: 'T', label: 'Temperature', min: 50, max: 1000, step: 10, value: 300, unit: 'K' },
    { kind: 'number', id: 'W', label: 'Box width (volume)', min: 100, max: 400, step: 5, value: 300 },
    { kind: 'number', id: 'm', label: 'Particle mass', min: 1, max: 16, step: 1, value: 4, unit: 'u', resetOnChange: true },
  ],
  previewSeconds: 1,
  init(v) {
    const N = num(v, 'N'), m = num(v, 'm'), T = num(v, 'T'), W = num(v, 'W'), sg = Math.sqrt((KEFF * T) / m);
    return { p: Array.from({ length: N }, () => ({ x: rnd(4, W - 4), y: rnd(4, 196), vx: gauss() * sg, vy: gauss() * sg })), Tcur: T, bucket: [0, 0, 0, 0, 0], bt: 0, P: 0, t: 0, wall: 0 };
  },
  step(s, v, dt) {
    const T = num(v, 'T'), W = num(v, 'W'), m = num(v, 'm'), H = 200;
    if (Math.abs(T - s.Tcur) > 1e-9) { const f = Math.sqrt(T / s.Tcur); for (const q of s.p) { q.vx *= f; q.vy *= f; } s.Tcur = T; }
    let imp = 0;
    for (const q of s.p) {
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.x < 0) { q.x = -q.x; imp += 2 * m * Math.abs(q.vx); q.vx = Math.abs(q.vx); }
      if (q.x > W) { q.x = 2 * W - q.x; imp += 2 * m * Math.abs(q.vx); q.vx = -Math.abs(q.vx); if (q.x < 0) q.x = W / 2; }
      if (q.y < 0) { q.y = -q.y; imp += 2 * m * Math.abs(q.vy); q.vy = Math.abs(q.vy); }
      if (q.y > H) { q.y = 2 * H - q.y; imp += 2 * m * Math.abs(q.vy); q.vy = -Math.abs(q.vy); }
    }
    s.t += dt; s.bt += dt; s.wall += imp;
    if (s.bt >= 0.25) {
      s.bucket.push(s.wall / (s.bt * 2 * (W + H))); s.bucket.shift(); s.bt = 0; s.wall = 0;
      const live = s.bucket.filter(x => x > 0); s.P = live.length ? live.reduce((a, b) => a + b, 0) / live.length : 0;
    }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const W = num(v, 'W'), H = 200, sc = Math.min((w * 0.6) / 400, (h - 24) / H), ox = 12, oy = 12;
    panel(c, { x: ox - 4, y: oy - 4, w: 400 * sc + 8, h: H * sc + 8 }, '#0e1626');
    c.fillStyle = '#1e293b'; c.fillRect(ox + W * sc, oy - 4, 400 * sc - W * sc + 4, H * sc + 8);
    c.strokeStyle = C.amber; c.lineWidth = 3; c.strokeRect(ox, oy, W * sc, H * sc);
    const sg = Math.sqrt((KEFF * s.Tcur) / num(v, 'm')), hot = clamp(s.Tcur / 1000, 0, 1);
    for (const q of s.p) { const sp = Math.hypot(q.vx, q.vy) / (sg * 2); circle(c, ox + q.x * sc, oy + q.y * sc, 3 + num(v, 'm') * 0.18, hsl(210 - clamp(sp, 0, 1) * 210, 85, 58)); }
    void hot;
    // histogram
    const gx = ox + 400 * sc + 22, gw = w - gx - 12;
    const vmax = sg * 3.6, nb = 18, counts = new Array(nb).fill(0);
    for (const q of s.p) { const b = Math.floor((Math.hypot(q.vx, q.vy) / vmax) * nb); if (b < nb) counts[b]++; }
    const bw = vmax / nb, N = s.p.length;
    const theo = (vv: number) => N * bw * (vv / (sg * sg)) * Math.exp(-(vv * vv) / (2 * sg * sg));
    let ymax = 5; for (let i = 0; i < nb; i++) ymax = Math.max(ymax, counts[i], theo((i + 0.5) * bw));
    const m = plot(c, { x: gx, y: 12, w: gw, h: h * 0.55 }, [0, vmax], [0, ymax * 1.15], { title: 'Speed distribution', xlabel: 'speed' });
    counts.forEach((n, i) => { c.fillStyle = 'rgba(96,165,250,0.6)'; c.fillRect(m.X(i * bw) + 1, m.Y(n), m.X(bw) - m.X(0) - 2, m.Y(0) - m.Y(n)); });
    const pts: [number, number][] = []; for (let i = 0; i <= 60; i++) { const vv = (vmax * i) / 60; pts.push([m.X(vv), m.Y(theo(vv))]); }
    polyline(c, pts, C.amber, 2.5);
    text(c, 'Maxwell–Boltzmann theory', gx + gw - 8, 36, C.amber, 11, 'right');
    // pressure gauge
    const Pn = s.P / 1.0, pmax = ((N * KEFF * 1000) / (400 * 200)) * 1.4;
    panel(c, { x: gx, y: h * 0.55 + 22, w: gw, h: 56 });
    text(c, 'Pressure', gx + 8, h * 0.55 + 40, C.text, 11, 'left', 'alphabetic', true);
    c.fillStyle = 'rgba(148,163,184,0.2)'; c.fillRect(gx + 8, h * 0.55 + 50, gw - 16, 14);
    c.fillStyle = C.red; c.fillRect(gx + 8, h * 0.55 + 50, clamp(Pn / pmax, 0, 1) * (gw - 16), 14);
  },
  readouts: (s, v) => {
    const W = num(v, 'W'), A = W * 200, N = s.p.length, ideal = (N * KEFF * s.Tcur) / A;
    return [
      { label: 'Pressure (measured)', value: s.P, digits: 3 }, { label: 'Pressure (ideal gas)', value: ideal, digits: 3 },
      { label: 'Volume', value: A / 1000, unit: 'k units²', digits: 1 }, { label: 'RMS speed', value: Math.sqrt(s.p.reduce((a, q) => a + q.vx * q.vx + q.vy * q.vy, 0) / Math.max(1, N)), digits: 0 },
    ];
  },
  equations: (_s, v) => [String.raw`PV=NkT\qquad v_{\text{rms}}\propto\sqrt{T/m}\qquad T=${fmt(num(v, 'T'), 0)}\ \text{K},\ V=${fmt(num(v, 'W') * 200 / 1000, 1)}`],
});

/* ================================================================== */
/*  CHEMISTRY: acids, bases and pH                                     */
/* ================================================================== */

const SUBS: Record<string, { name: string; type: 'sa' | 'wa' | 'sb' | 'wb' | 'w'; K?: number }> = {
  hcl: { name: 'Hydrochloric acid (strong acid)', type: 'sa' }, hac: { name: 'Acetic acid (weak acid, Ka=1.8e-5)', type: 'wa', K: 1.8e-5 },
  water: { name: 'Pure water', type: 'w' }, nh3: { name: 'Ammonia (weak base, Kb=1.8e-5)', type: 'wb', K: 1.8e-5 }, naoh: { name: 'Sodium hydroxide (strong base)', type: 'sb' },
};
function phOf(sub: string, logc: number) {
  const s = SUBS[sub], c0 = 10 ** logc;
  const Kw = 1e-14; let H = 1e-7;
  if (s.type === 'sa') H = (c0 + Math.sqrt(c0 * c0 + 4 * Kw)) / 2;
  else if (s.type === 'wa') { const K = s.K!; H = (-K + Math.sqrt(K * K + 4 * K * c0)) / 2; H = Math.max(H, 1e-7 * 0.999); H = Math.max(H, Math.sqrt(K * c0) * 0 + H); }
  else if (s.type === 'sb') { const OH = (c0 + Math.sqrt(c0 * c0 + 4 * Kw)) / 2; H = Kw / OH; }
  else if (s.type === 'wb') { const K = s.K!; const OH = (-K + Math.sqrt(K * K + 4 * K * c0)) / 2; H = Kw / Math.max(OH, 1e-7 * 0.999) ; if (OH < 1e-7) H = 1e-7; else H = Kw / OH; }
  return { pH: -Math.log10(H), H, OH: Kw / H };
}
interface PhS { dots: { x: number; y: number; vx: number; vy: number; k: number }[]; t: number }
export const ph = defineSim<PhS>({
  id: 'ph', title: 'pH & Acid–Base', subject: 'Chemistry',
  blurb: 'Choose a substance and dilute it. The universal-indicator colour, ion counts and the pH scale update together, and weak acids behave very differently from strong ones.',
  hint: 'pH=-log10[H+]. Strong acids/bases dissociate fully; weak ones only partly so their pH changes slowly on dilution. Each pH unit is a factor of 10 in [H+]. Neutral water pH 7 at 25C where [H+][OH-]=1e-14. Dot counts are logarithmic.',
  params: [
    { kind: 'select', id: 'sub', label: 'Substance', value: 'hcl', options: Object.entries(SUBS).map(([k, s]) => ({ value: k, label: s.name })) },
    { kind: 'number', id: 'logc', label: 'Concentration (log₁₀ mol/L)', min: -6, max: 0, step: 0.1, value: -2, digits: 1, help: '0 = 1 mol/L, -2 = 0.01 mol/L' },
  ],
  previewSeconds: 0.5,
  init() { return { dots: Array.from({ length: 140 }, (_, i) => ({ x: rnd(0, 1), y: rnd(0, 1), vx: rnd(-0.1, 0.1), vy: rnd(-0.1, 0.1), k: i })), t: 0 }; },
  step(s, _v, dt) {
    s.t += dt;
    for (const d of s.dots) { d.x += d.vx * dt; d.y += d.vy * dt; if (d.x < 0 || d.x > 1) d.vx *= -1; if (d.y < 0 || d.y > 1) d.vy *= -1; d.x = clamp(d.x, 0, 1); d.y = clamp(d.y, 0, 1); }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const r = phOf(str(v, 'sub'), num(v, 'logc'));
    const bx = 24, by = 20, bw = Math.min(w * 0.42, 300), bh = h * 0.62;
    const hue = clamp(r.pH, 0, 14) / 14;
    const col = `hsl(${(1 - hue) * 0 + (hue < 0.5 ? hue * 2 * 120 : 120 + (hue - 0.5) * 2 * 150)}, 80%, 52%)`;
    c.fillStyle = col; c.globalAlpha = 0.28; c.fillRect(bx, by + bh * 0.12, bw, bh * 0.88); c.globalAlpha = 1;
    c.strokeStyle = C.axis; c.lineWidth = 3; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx, by + bh); c.lineTo(bx + bw, by + bh); c.lineTo(bx + bw, by); c.stroke();
    const nH = Math.round(clamp(Math.log10(r.H) + 14, 0, 14) * 5), nOH = Math.round(clamp(Math.log10(r.OH) + 14, 0, 14) * 5);
    s.dots.forEach((d, i) => {
      const x = bx + 6 + d.x * (bw - 12), y = by + bh * 0.14 + d.y * (bh * 0.84 - 8);
      if (i < nH) { circle(c, x, y, 4, C.red); }
      else if (i >= 140 - nOH) { circle(c, x, y, 4, C.blue); }
    });
    text(c, `H₃O⁺ ions: ${fmt(r.H, 2)} mol/L`, bx, by + bh + 20, C.red, 12, 'left', 'alphabetic', true);
    text(c, `OH⁻ ions: ${fmt(r.OH, 2)} mol/L`, bx, by + bh + 38, C.blue, 12, 'left', 'alphabetic', true);
    // scale
    const sx = bx + bw + 28, sw = w - sx - 20, sy = h * 0.18, sh = 34;
    for (let i = 0; i < 14; i++) { const hu = (i + 0.5) / 14; c.fillStyle = `hsl(${hu < 0.5 ? hu * 2 * 120 : 120 + (hu - 0.5) * 2 * 150}, 80%, 52%)`; c.fillRect(sx + (i * sw) / 14, sy, sw / 14 + 1, sh); text(c, `${i}`, sx + ((i + 0.5) * sw) / 14, sy + sh + 14, C.dim, 10, 'center'); }
    const mx = sx + (clamp(r.pH, 0, 14) / 14) * sw;
    c.fillStyle = C.white; c.beginPath(); c.moveTo(mx, sy - 2); c.lineTo(mx - 7, sy - 14); c.lineTo(mx + 7, sy - 14); c.closePath(); c.fill();
    text(c, `pH ${fmt(r.pH, 2)}`, mx, sy - 20, C.white, 15, 'center', 'alphabetic', true);
    text(c, 'acid', sx, sy + sh + 32, C.red, 11); text(c, 'neutral', sx + sw / 2, sy + sh + 32, C.green, 11, 'center'); text(c, 'base', sx + sw, sy + sh + 32, C.blue, 11, 'right');
    const ex = ['battery acid', 'lemon juice', 'vinegar', 'coffee', 'water', 'baking soda', 'ammonia', 'bleach'];
    const pos = [0, 2, 3, 5, 7, 9, 11, 13];
    ex.forEach((e, i) => { const x = sx + ((pos[i] + 0.5) / 14) * sw; c.save(); c.translate(x, sy + sh + 52 + (i % 2) * 14); text(c, e, 0, 0, C.dim, 10, 'center'); c.restore(); });
  },
  readouts: (_s, v) => { const r = phOf(str(v, 'sub'), num(v, 'logc')); return [{ label: 'pH', value: r.pH, digits: 2 }, { label: 'pOH', value: 14 - r.pH, digits: 2 }, { label: '[H⁺]', value: r.H, unit: 'M' }, { label: '[OH⁻]', value: r.OH, unit: 'M' }]; },
  equations: (_s, v) => { const r = phOf(str(v, 'sub'), num(v, 'logc')); return [String.raw`\mathrm{pH}=-\log_{10}[\mathrm{H^+}]=${fmt(r.pH, 2)}\qquad [\mathrm{H^+}][\mathrm{OH^-}]=10^{-14}`]; },
});

/* ================================================================== */
/*  CHEMISTRY: Beer-Lambert absorbance                                 */
/* ================================================================== */

const DYES: Record<string, { name: string; peaks: [number, number, number][] }> = {
  kmno4: { name: 'Potassium permanganate (purple)', peaks: [[525, 38, 2400]] },
  cuso4: { name: 'Copper sulfate (blue)', peaks: [[800, 140, 1400]] },
  chl: { name: 'Chlorophyll-like (green)', peaks: [[435, 28, 2600], [660, 25, 1900]] },
  dye: { name: 'Orange dye', peaks: [[480, 45, 2800]] },
};
const eps = (d: string, nm: number) => DYES[d].peaks.reduce((a, [p, wd, e]) => a + e * Math.exp(-((nm - p) ** 2) / (2 * wd * wd)), 0);
interface BlS { t: number }
export const beer = defineSim<BlS>({
  id: 'beer', title: 'Light & Concentration (Beer–Lambert)', subject: 'Chemistry',
  blurb: 'Shine coloured light through a solution. Absorbance rises in proportion to concentration and path length, and light is absorbed most near the dye\'s peak wavelength.',
  hint: 'Beer-Lambert law A = epsilon * l * c, T = 10^-A. Absorbance is linear in concentration; transmitted intensity falls exponentially. A solution looks coloured because it absorbs the complementary wavelengths. Spectrophotometry uses a calibration line.',
  params: [
    { kind: 'select', id: 'dye', label: 'Solution', value: 'kmno4', options: Object.entries(DYES).map(([k, d]) => ({ value: k, label: d.name })) },
    { kind: 'number', id: 'wl', label: 'Wavelength of light', min: 400, max: 750, step: 5, value: 525, unit: 'nm' },
    { kind: 'number', id: 'c', label: 'Concentration', min: 0, max: 1, step: 0.01, value: 0.4, unit: 'mM' },
    { kind: 'number', id: 'l', label: 'Path length', min: 0.2, max: 3, step: 0.1, value: 1, unit: 'cm' },
  ],
  previewSeconds: 0.2,
  init() { return { t: 0 }; },
  step(s, _v, dt) { s.t += dt; },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const e = eps(str(v, 'dye'), num(v, 'wl')), A = (e * num(v, 'l') * num(v, 'c')) / 1000, T = 10 ** -A;
    const [r, g, b] = wavelengthToRgb(num(v, 'wl'));
    const y = h * 0.26, cx = w * 0.4, cw = 40 + num(v, 'l') * 55, x0 = cx - cw / 2;
    c.fillStyle = '#334155'; c.fillRect(12, y - 14, 36, 28); text(c, 'lamp', 30, y + 28, C.dim, 10, 'center');
    const sd = clamp(num(v, 'c') / 1, 0, 1);
    const [pr, pg, pb] = wavelengthToRgb(Object.values(DYES[str(v, 'dye')].peaks)[0][0]);
    c.fillStyle = `rgba(${255 - (255 - (255 - pr)) * 0},${0},${0},0)`; // placeholder to keep palette logic simple
    c.fillStyle = `rgba(${255 - pr * 0.8 | 0},${255 - pg * 0.8 | 0},${255 - pb * 0.8 | 0},${0.12 + sd * 0.7})`; c.fillRect(x0, y - 55, cw, 110);
    c.strokeStyle = C.axis; c.lineWidth = 2.5; c.strokeRect(x0, y - 55, cw, 110);
    const beam = (xa: number, xb: number, I: number) => { c.save(); c.globalAlpha = clamp(I, 0.04, 1); line(c, xa, y, xb, y, `rgb(${r},${g},${b})`, 7); c.restore(); };
    beam(48, x0, 1);
    const steps = 24; for (let i = 0; i < steps; i++) { const x1 = x0 + (cw * i) / steps, x2 = x0 + (cw * (i + 1)) / steps; beam(x1, x2, 10 ** -(A * i / steps)); }
    beam(x0 + cw, w * 0.62, T);
    text(c, 'I₀ = 100%', 54, y - 22, C.text, 11); text(c, `I = ${fmt(T * 100, 1)}%`, x0 + cw + 12, y - 22, C.text, 12, 'left', 'alphabetic', true);
    circle(c, w * 0.62 + 6, y, 10, '#475569', C.white, 1.5); text(c, 'detector', w * 0.62 + 6, y + 28, C.dim, 10, 'center');
    // spectrum
    const sp = plot(c, { x: 12, y: h * 0.5, w: w * 0.5 - 18, h: h * 0.46 }, [400, 800], [0, 3000], { title: 'Absorption spectrum', xlabel: 'wavelength (nm)' });
    const pts: [number, number][] = []; for (let n = 400; n <= 800; n += 4) pts.push([sp.X(n), sp.Y(eps(str(v, 'dye'), n))]);
    polyline(c, pts, C.amber, 2.5); line(c, sp.X(num(v, 'wl')), sp.Y(0), sp.X(num(v, 'wl')), sp.Y(3000), `rgb(${r},${g},${b})`, 2);
    const cal = plot(c, { x: w * 0.5 + 6, y: h * 0.5, w: w * 0.5 - 18, h: h * 0.46 }, [0, 1], [0, Math.max(2.5, A * 1.2)], { title: 'Calibration line: A vs c', xlabel: 'concentration (mM)' });
    line(c, cal.X(0), cal.Y(0), cal.X(1), cal.Y((e * num(v, 'l')) / 1000), C.cyan, 2);
    circle(c, cal.X(num(v, 'c')), cal.Y(A), 6, C.amber, C.white, 1.5);
  },
  readouts: (_s, v) => { const e = eps(str(v, 'dye'), num(v, 'wl')), A = (e * num(v, 'l') * num(v, 'c')) / 1000; return [{ label: 'Absorbance A', value: A, digits: 3 }, { label: 'Transmitted', value: 10 ** -A * 100, unit: '%', digits: 1 }, { label: 'ε at this λ', value: e, unit: 'L/mol/cm', digits: 0 }]; },
  equations: (_s, v) => { const e = eps(str(v, 'dye'), num(v, 'wl')), A = (e * num(v, 'l') * num(v, 'c')) / 1000; return [String.raw`A=\varepsilon\,l\,c=${fmt(e, 0)}\times${fmt(num(v, 'l'), 1)}\times${fmt(num(v, 'c') / 1000, 5)}=${fmt(A, 3)}`, String.raw`T=\frac{I}{I_0}=10^{-A}=${fmt(10 ** -A, 3)}`]; },
});

/* ================================================================== */
/*  EARTH SCIENCE: greenhouse energy balance                           */
/* ================================================================== */

interface GhS { T: number; t: number; sc: Scope; ph: number }
const SIG = 5.670374e-8;
const eqT = (v: Record<string, number | string | boolean>) => Math.pow((num(v, 'S') * (1 - num(v, 'alb'))) / 4 / (SIG * (1 - num(v, 'eps') / 2)), 0.25);
export const greenhouse = defineSim<GhS>({
  id: 'greenhouse', title: 'Climate Energy Balance', subject: 'Earth Science',
  blurb: 'A two-layer model of Earth: sunlight in, infrared out, with an atmosphere that sends part of the heat back down. Change the greenhouse strength or reflectivity and watch the temperature drift to a new balance.',
  hint: 'Single-layer atmosphere energy balance: absorbed solar S(1-albedo)/4 = sigma (1 - eps/2) T^4. With no atmosphere Earth would be about 255 K (-18C); a greenhouse strength near 0.78 gives about 288 K (15C). More greenhouse gas or lower albedo warms; ice-albedo feedback is not included. Time is sped up (1 s = ~0.25 year).',
  params: [
    { kind: 'number', id: 'S', label: 'Sunlight at Earth', min: 1200, max: 1500, step: 5, value: 1361, unit: 'W/m²' },
    { kind: 'number', id: 'alb', label: 'Reflectivity (albedo)', min: 0.05, max: 0.7, step: 0.01, value: 0.3 },
    { kind: 'number', id: 'eps', label: 'Greenhouse strength', min: 0, max: 1, step: 0.01, value: 0.78, help: '0 = no atmosphere effect, 1 = fully absorbing' },
  ],
  actions: [{ id: 'co2', label: '+ Add CO₂ (greenhouse +0.05)' }],
  previewSeconds: 0.5,
  init(v) { return { T: eqT(v), t: 0, sc: new Scope(2, 2500), ph: 0 }; },
  action(_s, v) { v.eps = Math.min(1, Math.round(((v.eps as number) + 0.05) * 100) / 100); },
  step(s, v, dt) {
    const C0 = 2e8, absorbed = (num(v, 'S') * (1 - num(v, 'alb'))) / 4, out = SIG * (1 - num(v, 'eps') / 2) * s.T ** 4;
    s.T += ((absorbed - out) / C0) * 3.156e7 * 0.25 * dt; s.t += dt; s.ph += dt;
    if (Math.round(s.t / dt) % 8 === 0) s.sc.push(s.t * 0.25, s.T - 273.15, eqT(v) - 273.15);
  },
  draw(c, s, v, w, h) {
    c.fillStyle = '#060b1a'; c.fillRect(0, 0, w, h);
    const sceneW = Math.min(w * 0.46, 340), x0 = 12;
    const gY = h - 60, aY = h * 0.38;
    const sg = c.createLinearGradient(0, 0, 0, aY); sg.addColorStop(0, '#0b1020'); sg.addColorStop(1, '#14305a'); c.fillStyle = sg; c.fillRect(x0, 8, sceneW, aY - 8);
    c.fillStyle = `rgba(148,163,184,${0.05 + num(v, 'eps') * 0.35})`; c.fillRect(x0, aY - 6, sceneW, 40); text(c, 'atmosphere (greenhouse gases)', x0 + 8, aY + 12, C.dim, 10);
    const tC = s.T - 273.15, hot = clamp((tC + 30) / 80, 0, 1);
    c.fillStyle = `hsl(${120 - hot * 120}, 55%, ${28 + hot * 8}%)`; c.fillRect(x0, gY, sceneW, 52); text(c, `surface ${fmt(tC, 1)} °C`, x0 + 8, gY + 30, C.white, 13, 'left', 'alphabetic', true);
    const flowArrows = (n: number, xs: number, y1: number, y2: number, col: string, dir: 1 | -1, alpha: number) => {
      for (let i = 0; i < n; i++) { const p = (((s.ph * 0.9 + i / n) % 1) + 1) % 1, y = dir === 1 ? y1 + (y2 - y1) * p : y2 - (y2 - y1) * p; c.save(); c.globalAlpha = alpha; arrow(c, xs + i * 10, y - dir * 8, xs + i * 10, y + dir * 8, col, 2, 6); c.restore(); }
    };
    const absorbed = (num(v, 'S') * (1 - num(v, 'alb'))) / 4;
    const lanes = 5;
    for (let k = 0; k < lanes; k++) flowArrows(2, x0 + 20 + k * 22, 10, gY, C.amber, 1, 0.85);
    for (let k = 0; k < Math.round(num(v, 'alb') * lanes * 2 + 1); k++) flowArrows(1, x0 + 26 + k * 22, 10, gY, '#fde68a', -1, 0.5);
    const out = SIG * s.T ** 4, ir = clamp(out / 450, 0.1, 1);
    for (let k = 0; k < 4; k++) flowArrows(2, x0 + sceneW - 100 + k * 18, aY, gY, C.red, -1, ir);
    for (let k = 0; k < Math.round(num(v, 'eps') * 4); k++) flowArrows(2, x0 + sceneW - 90 + k * 18, aY + 10, gY, C.orange, 1, 0.8);
    text(c, 'sunlight', x0 + 6, 24, C.amber, 11); text(c, 'infrared', x0 + sceneW - 8, 24, C.red, 11, 'right');
    void absorbed;
    drawScope(c, { x: sceneW + 28, y: 12, w: w - sceneW - 40, h: h * 0.62 }, s.sc, [C.red, C.dim], { title: 'Temperature (°C): now (red) and balance point (grey) vs years', window: 40, labels: ['now', 'balance'] });
    const bw = w - sceneW - 40;
    panel(c, { x: sceneW + 28, y: h * 0.62 + 24, w: bw, h: h * 0.38 - 36 });
    text(c, `Energy in ${fmt(absorbed, 0)} W/m²  |  out to space ${fmt(SIG * (1 - num(v, 'eps') / 2) * s.T ** 4, 0)} W/m²`, sceneW + 40, h * 0.62 + 48, C.text, 11, 'left', 'alphabetic', true);
    text(c, `Balance temperature ${fmt(eqT(v) - 273.15, 1)} °C`, sceneW + 40, h * 0.62 + 68, C.dim, 11);
    text(c, `(no-atmosphere Earth: ${fmt(Math.pow(absorbed / SIG, 0.25) - 273.15, 1)} °C)`, sceneW + 40, h * 0.62 + 84, C.dim, 11);
  },
  readouts: (s, v) => [{ label: 'Surface temp', value: s.T - 273.15, unit: '°C', digits: 1 }, { label: 'Balance temp', value: eqT(v) - 273.15, unit: '°C', digits: 1 }, { label: 'Energy absorbed', value: (num(v, 'S') * (1 - num(v, 'alb'))) / 4, unit: 'W/m²', digits: 0 }, { label: 'Greenhouse warming', value: eqT(v) - Math.pow((num(v, 'S') * (1 - num(v, 'alb'))) / 4 / SIG, 0.25), unit: 'K', digits: 1 }],
  equations: (_s, v) => [String.raw`\frac{S(1-\alpha)}{4}=\sigma\left(1-\frac{\varepsilon}{2}\right)T^4\;\Rightarrow\;T=${fmt(eqT(v), 1)}\ \text{K}`],
});

/* ================================================================== */
/*  BIOLOGY: natural selection                                         */
/* ================================================================== */

interface NsS { pop: number[]; gen: number; clock: number; hist: number[][]; mean: number[]; bg: number; eaten: number }
export const selection = defineSim<NsS>({
  id: 'selection', title: 'Natural Selection', subject: 'Biology',
  blurb: 'A population of rabbits with different fur shades lives on one background while a fox hunts the ones it can see best. Watch the average fur colour evolve generation after generation, then change the environment.',
  hint: 'Heritable variation + differential survival gives evolution. Rabbits whose fur contrasts with the background are eaten more, survivors reproduce with small random mutations. Stronger predation speeds adaptation; higher mutation adds variation; changing the environment forces re-adaptation. Mean trait approaches the background shade.',
  params: [
    { kind: 'number', id: 'bg', label: 'Background shade (0 dark - 1 light)', min: 0, max: 1, step: 0.01, value: 0.15 },
    { kind: 'number', id: 'pred', label: 'Predation strength', min: 0.1, max: 1, step: 0.01, value: 0.6 },
    { kind: 'number', id: 'mut', label: 'Mutation size', min: 0, max: 0.2, step: 0.005, value: 0.04, digits: 3 },
    { kind: 'number', id: 'rate', label: 'Generations per second', min: 0.3, max: 4, step: 0.1, value: 1.2, digits: 1 },
  ],
  actions: [{ id: 'flip', label: 'Flip the environment' }],
  previewSeconds: 6,
  init(v) { const pop = Array.from({ length: 60 }, () => clamp(0.5 + gauss() * 0.22, 0, 1)); return { pop, gen: 0, clock: 0, hist: [], mean: [pop.reduce((a, b) => a + b, 0) / 60], bg: num(v, 'bg'), eaten: 0 }; },
  action(_s, v) { v.bg = 1 - num(v, 'bg'); },
  step(s, v, dt) {
    s.bg += (num(v, 'bg') - s.bg) * Math.min(1, dt * 3);
    s.clock += dt * num(v, 'rate');
    if (s.clock < 1) return;
    s.clock = 0; s.gen++;
    const surv: number[] = []; let eaten = 0;
    for (const t of s.pop) { const d = Math.abs(t - num(v, 'bg')); if (Math.random() > num(v, 'pred') * clamp(0.08 + d * 1.5, 0, 1)) surv.push(t); else eaten++; }
    while (surv.length < 2) surv.push(clamp(Math.random(), 0, 1));
    s.eaten = eaten;
    const nxt: number[] = [];
    for (let i = 0; i < 60; i++) nxt.push(clamp(surv[(Math.random() * surv.length) | 0] + gauss() * num(v, 'mut'), 0, 1));
    s.pop = nxt;
    const hh = new Array(20).fill(0); nxt.forEach(t => hh[Math.min(19, Math.floor(t * 20))]++);
    s.hist.push(hh); if (s.hist.length > 80) s.hist.shift();
    s.mean.push(nxt.reduce((a, b) => a + b, 0) / 60); if (s.mean.length > 80) s.mean.shift();
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const area = { x: 12, y: 12, w: Math.min(w * 0.45, 340), h: h - 24 };
    const bg = Math.round(s.bg * 255); c.fillStyle = `rgb(${bg},${bg * 0.92 | 0},${bg * 0.85 | 0})`; c.fillRect(area.x, area.y, area.w, area.h);
    const cols = 10, cw = area.w / cols, ch = area.h / 6;
    s.pop.forEach((t, i) => {
      const x = area.x + (i % cols) * cw + cw / 2, y = area.y + Math.floor(i / cols) * ch + ch / 2;
      const g = Math.round(40 + t * 200); c.fillStyle = `rgb(${g},${g * 0.92 | 0},${g * 0.85 | 0})`;
      c.beginPath(); c.ellipse(x, y + 3, cw * 0.3, ch * 0.22, 0, 0, TAU); c.fill(); c.beginPath(); c.arc(x + cw * 0.2, y - ch * 0.12, cw * 0.14, 0, TAU); c.fill();
      c.fillRect(x + cw * 0.17, y - ch * 0.42, cw * 0.05, ch * 0.28); c.fillRect(x + cw * 0.25, y - ch * 0.42, cw * 0.05, ch * 0.28);
    });
    c.strokeStyle = C.axis; c.strokeRect(area.x, area.y, area.w, area.h);
    const gx = area.x + area.w + 14, gw = w - gx - 12;
    const m = plot(c, { x: gx, y: 12, w: gw, h: h * 0.45 }, [Math.max(0, s.gen - 80), Math.max(80, s.gen)], [0, 1], { title: 'Average fur shade over generations', xlabel: 'generation' });
    polyline(c, s.mean.map((y, i) => [m.X(s.gen - (s.mean.length - 1 - i)), m.Y(y)] as [number, number]), C.amber, 2.5);
    line(c, m.X(Math.max(0, s.gen - 80)), m.Y(num(v, 'bg')), m.X(Math.max(80, s.gen)), m.Y(num(v, 'bg')), C.cyan, 1.5, [5, 4]);
    text(c, 'background', gx + gw - 8, 36, C.cyan, 10, 'right');
    const hm = { x: gx, y: h * 0.45 + 24, w: gw, h: h * 0.55 - 36 }; panel(c, hm); text(c, 'Variation in the population (brighter = more rabbits)', hm.x + 8, hm.y + 14, C.text, 11, 'left', 'alphabetic', true);
    const rows = s.hist.length, rh = (hm.h - 28) / 80, cw2 = (hm.w - 16) / 20;
    s.hist.forEach((hh, r) => hh.forEach((n, b) => { if (n) { c.fillStyle = `rgba(251,191,36,${clamp(n / 14, 0.08, 1)})`; c.fillRect(hm.x + 8 + b * cw2, hm.y + 22 + (80 - rows + r) * rh, cw2, rh + 0.5); } }));
    text(c, 'dark', hm.x + 8, hm.y + hm.h - 4, C.dim, 10); text(c, 'light', hm.x + hm.w - 8, hm.y + hm.h - 4, C.dim, 10, 'right');
  },
  readouts: (s, v) => [{ label: 'Generation', value: s.gen, digits: 0 }, { label: 'Average shade', value: s.mean[s.mean.length - 1], digits: 2 }, { label: 'Background', value: num(v, 'bg'), digits: 2 }, { label: 'Eaten last gen', value: s.eaten, digits: 0 }],
});

/* ================================================================== */
/*  BIOLOGY: predator-prey (Lotka-Volterra)                            */
/* ================================================================== */

interface LvS { x: number; y: number; t: number; sc: Scope; trail: [number, number][] }
export const predprey = defineSim<LvS>({
  id: 'predprey', title: 'Predators & Prey', subject: 'Biology',
  blurb: 'Rabbits and foxes chase each other around a cycle. Tweak birth, death and hunting rates, or limit the rabbits\' food supply to calm the swings.',
  hint: 'Lotka-Volterra: dx/dt = a x (1 - x/K) - b x y (prey), dy/dt = d x y - g y (predator). Without K populations cycle around the equilibrium (g/d, a/b); with a finite carrying capacity K they spiral in to a stable point. Phase portrait shows the closed loop.',
  params: [
    { kind: 'number', id: 'a', label: 'Prey birth rate', min: 0.2, max: 2, step: 0.05, value: 1 },
    { kind: 'number', id: 'b', label: 'Hunting rate', min: 0.01, max: 0.2, step: 0.005, value: 0.1, digits: 3 },
    { kind: 'number', id: 'd', label: 'Predator growth from eating', min: 0.01, max: 0.2, step: 0.005, value: 0.02, digits: 3 },
    { kind: 'number', id: 'g', label: 'Predator death rate', min: 0.2, max: 2, step: 0.05, value: 0.5 },
    { kind: 'number', id: 'K', label: 'Food limit K (0 = unlimited)', min: 0, max: 200, step: 5, value: 0 },
  ],
  actions: [{ id: 'cull', label: 'Cull predators by half' }],
  dt: 1 / 200, previewSeconds: 3,
  init() { return { x: 30, y: 10, t: 0, sc: new Scope(2, 3000), trail: [] }; },
  action(s) { s.y *= 0.5; },
  step(s, v, dt) {
    const f = (x: number, y: number): [number, number] => {
      const K = num(v, 'K'), grow = K > 0 ? num(v, 'a') * x * (1 - x / K) : num(v, 'a') * x;
      return [grow - num(v, 'b') * x * y, num(v, 'd') * x * y - num(v, 'g') * y];
    };
    const k1 = f(s.x, s.y), k2 = f(s.x + 0.5 * dt * k1[0], s.y + 0.5 * dt * k1[1]), k3 = f(s.x + 0.5 * dt * k2[0], s.y + 0.5 * dt * k2[1]), k4 = f(s.x + dt * k3[0], s.y + dt * k3[1]);
    s.x = Math.max(0.01, s.x + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])); s.y = Math.max(0.01, s.y + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])); s.t += dt;
    if (Math.round(s.t / dt) % 4 === 0) { s.sc.push(s.t, s.x, s.y); s.trail.push([s.x, s.y]); if (s.trail.length > 1500) s.trail.shift(); }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const half = Math.min(w * 0.42, 340);
    let xm = 80, ym = 40; for (const p of s.trail) { xm = Math.max(xm, p[0] * 1.1); ym = Math.max(ym, p[1] * 1.1); }
    const m = plot(c, { x: 12, y: 12, w: half, h: h - 24 }, [0, xm], [0, ym], { title: 'Phase portrait: foxes vs rabbits', xlabel: 'rabbits', ylabel: 'foxes' });
    for (let i = 1; i < 8; i++) for (let j = 1; j < 8; j++) {
      const x = (xm * i) / 8, y = (ym * j) / 8, K = num(v, 'K');
      const dx = (K > 0 ? num(v, 'a') * x * (1 - x / K) : num(v, 'a') * x) - num(v, 'b') * x * y, dy = num(v, 'd') * x * y - num(v, 'g') * y;
      const px = (dx / xm) * 8, py = (dy / ym) * 8, L = Math.hypot(px, py) || 1;
      arrow(c, m.X(x), m.Y(y), m.X(x) + (px / L) * 14, m.Y(y) - (py / L) * 14, 'rgba(148,163,184,0.35)', 1, 5);
    }
    circle(c, m.X(num(v, 'g') / num(v, 'd')), m.Y(num(v, 'K') > 0 ? (num(v, 'a') / num(v, 'b')) * (1 - num(v, 'g') / num(v, 'd') / num(v, 'K')) : num(v, 'a') / num(v, 'b')), 5, undefined, C.green, 2);
    polyline(c, s.trail.map(p => [m.X(p[0]), m.Y(p[1])] as [number, number]), C.amber, 1.8);
    circle(c, m.X(s.x), m.Y(s.y), 5, C.white);
    drawScope(c, { x: half + 24, y: 12, w: w - half - 36, h: h - 24 }, s.sc, [C.green, C.orange], { title: 'Population vs time', window: 40, ymin: 0, labels: ['rabbits', 'foxes'] });
  },
  readouts: (s, v) => [{ label: 'Rabbits', value: s.x, digits: 1 }, { label: 'Foxes', value: s.y, digits: 1 }, { label: 'Equilibrium rabbits', value: num(v, 'g') / num(v, 'd'), digits: 1 }, { label: 'Equilibrium foxes', value: num(v, 'a') / num(v, 'b'), digits: 1 }],
  equations: (_s, v) => [String.raw`\dot x=ax\left(1-\tfrac xK\right)-bxy,\qquad \dot y=dxy-gy`, String.raw`(x^*,y^*)=\left(\tfrac{g}{d},\tfrac{a}{b}\right)=(${fmt(num(v, 'g') / num(v, 'd'), 1)},\,${fmt(num(v, 'a') / num(v, 'b'), 1)})`],
});

/* ================================================================== */
/*  BIOLOGY: membrane diffusion                                        */
/* ================================================================== */

interface DfS { p: { x: number; y: number; vx: number; vy: number; big: boolean }[]; t: number; sc: Scope }
export const diffusion = defineSim<DfS>({
  id: 'diffusion', title: 'Membrane Diffusion', subject: 'Biology',
  blurb: 'Small molecules slip through pores in a membrane while large ones cannot. Watch the concentrations equalise on both sides: random motion alone drives the balance.',
  hint: 'Diffusion is net movement from high to low concentration caused by random motion; no energy is used. Rate depends on temperature, number of pores and concentration gradient. Selective permeability: large molecules cannot cross a pore that fits only small ones, so they stay on their side. At equilibrium movement continues but net flow is zero.',
  params: [
    { kind: 'number', id: 'pores', label: 'Pores in membrane', min: 1, max: 6, step: 1, value: 3, resetOnChange: true },
    { kind: 'number', id: 'T', label: 'Temperature (speed)', min: 0.3, max: 3, step: 0.05, value: 1 },
    { kind: 'number', id: 'nS', label: 'Small molecules', min: 20, max: 250, step: 10, value: 150, resetOnChange: true },
    { kind: 'number', id: 'nB', label: 'Large molecules', min: 0, max: 80, step: 5, value: 30, resetOnChange: true },
  ],
  previewSeconds: 4,
  init(v) {
    const mk = (n: number, big: boolean) => Array.from({ length: n }, () => ({ x: rnd(0.02, 0.48), y: rnd(0.03, 0.97), vx: gauss() * 0.15, vy: gauss() * 0.15, big }));
    return { p: [...mk(num(v, 'nS'), false), ...mk(num(v, 'nB'), true)], t: 0, sc: new Scope(2, 2000) };
  },
  step(s, v, dt) {
    const n = num(v, 'pores'), gapH = 0.07, T = num(v, 'T');
    const pores = Array.from({ length: n }, (_, i) => (i + 1) / (n + 1));
    for (const q of s.p) {
      const sp = q.big ? 0.5 : 1, px = q.x;
      q.x += q.vx * dt * T * sp * 3; q.y += q.vy * dt * T * sp * 3;
      if (q.y < 0 || q.y > 1) { q.vy *= -1; q.y = clamp(q.y, 0, 1); }
      if (q.x < 0 || q.x > 1) { q.vx *= -1; q.x = clamp(q.x, 0, 1); }
      if ((px - 0.5) * (q.x - 0.5) < 0) {
        const inPore = !q.big && pores.some(p => Math.abs(q.y - p) < gapH / 2);
        if (!inPore) { q.x = px; q.vx *= -1; }
      }
      if (Math.random() < dt * 2) { q.vx = gauss() * 0.15; q.vy = gauss() * 0.15; }
    }
    s.t += dt;
    if (Math.round(s.t / dt) % 12 === 0) { let l = 0, tot = 0; for (const q of s.p) if (!q.big) { tot++; if (q.x < 0.5) l++; } s.sc.push(s.t, tot ? l / tot : 0, tot ? 1 - l / tot : 0); }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const box = { x: 12, y: 12, w: Math.min(w * 0.5, 420), h: h - 24 };
    panel(c, box, '#0e1a2d');
    c.fillStyle = 'rgba(251,191,36,0.14)'; c.fillRect(box.x + box.w / 2 - 5, box.y, 10, box.h);
    const n = num(v, 'pores');
    for (let i = 0; i < n; i++) { const y = box.y + ((i + 1) / (n + 1)) * box.h; c.fillStyle = '#0e1a2d'; c.fillRect(box.x + box.w / 2 - 6, y - 0.035 * box.h, 12, 0.07 * box.h); }
    line(c, box.x + box.w / 2 - 5, box.y, box.x + box.w / 2 - 5, box.y + box.h, C.amber, 2); line(c, box.x + box.w / 2 + 5, box.y, box.x + box.w / 2 + 5, box.y + box.h, C.amber, 2);
    for (const q of s.p) circle(c, box.x + q.x * box.w, box.y + q.y * box.h, q.big ? 6.5 : 3, q.big ? C.purple : C.cyan);
    text(c, 'inside cell', box.x + 10, box.y + 20, C.dim, 11); text(c, 'outside', box.x + box.w - 10, box.y + 20, C.dim, 11, 'right');
    drawScope(c, { x: box.x + box.w + 14, y: 12, w: w - box.w - 40, h: h - 24 }, s.sc, [C.cyan, C.orange], { title: 'Fraction of small molecules on each side', window: 20, ymin: 0, ymax: 1, labels: ['left', 'right'] });
  },
  readouts: (s) => { let l = 0, r = 0, lb = 0, rb = 0; for (const q of s.p) { if (q.big) { if (q.x < 0.5) lb++; else rb++; } else if (q.x < 0.5) l++; else r++; } return [{ label: 'Small left / right', value: `${l} / ${r}` }, { label: 'Large left / right', value: `${lb} / ${rb}` }, { label: 'Time', value: s.t, unit: 's', digits: 1 }]; },
  equations: () => [String.raw`J=-D\,\frac{dC}{dx}\qquad \text{net flow}\to0\ \text{when}\ C_{\text{left}}=C_{\text{right}}`],
});
void bool;
