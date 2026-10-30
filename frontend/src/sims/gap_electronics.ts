/* ------------------------------------------------------------------ */
/*  Electronics gap-fillers: MOSFET I-V, three-phase power systems,     */
/*  AM / FM / digital (BPSK, QPSK, 16-QAM) modulation.                  */
/*  Pure model functions are exported so tools/logic_gap_electronics.mts */
/*  can verify the numbers independently of the drawing code.           */
/* ------------------------------------------------------------------ */
import { defineSim, num, str, bool, UG_ENG } from './types';
import type { Values } from './types';
import { C, TAU, clamp, fmt, line, plot, polyline, text, circle, arrow, panel } from './draw';
import type { Ctx, Rect } from './draw';
import { meta, mulberry } from './univ_util';

const bg = (c: Ctx, w: number, h: number) => { c.fillStyle = C.bg; c.fillRect(0, 0, w, h); };
const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w: Math.max(30, w), h: Math.max(30, h) });
const fin = (x: number, d = 0) => (Number.isFinite(x) ? x : d);

/* ================================================================== */
/*  1. MOSFET I-V characteristics                                      */
/* ================================================================== */
export interface MosP { vth: number; k: number; lam: number; gamma: number; vsb: number; T: number }
const PHI2 = 0.7; // 2*phi_F in volts
/** Threshold voltage with body effect and temperature drift (-2 mV/K). */
export const mosVth = (p: MosP) => p.vth + p.gamma * (Math.sqrt(PHI2 + Math.max(0, p.vsb)) - Math.sqrt(PHI2)) - 0.002 * (p.T - 300);
/** Transconductance parameter k = kn'·W/L (mA/V^2) with mobility ~ T^-1.5. */
export const mosK = (p: MosP) => p.k * Math.pow(300 / Math.max(p.T, 1), 1.5);
export const mosRegion = (vgs: number, vds: number, p: MosP) => { const vov = vgs - mosVth(p); return vov <= 0 ? 'cutoff' : vds < vov ? 'triode' : 'saturation'; };
/** Drain current in mA. Square-law with (1+lambda*VDS) applied in both regions so the curve is continuous at VDS = VOV. */
export function mosId(vgs: number, vds: number, p: MosP): number {
  const vov = vgs - mosVth(p);
  if (vov <= 0 || vds <= 0) return 0;
  const k = mosK(p), clm = 1 + p.lam * vds;
  return vds < vov ? k * (vov * vds - 0.5 * vds * vds) * clm : 0.5 * k * vov * vov * clm;
}
/** Solves VDS = VDD - ID*RD (RD in kOhm, ID in mA) by bisection (f is monotone in VDS). */
export function mosLoad(vgs: number, vdd: number, rd: number, p: MosP) {
  let lo = 0, hi = Math.max(vdd, 1e-6);
  for (let i = 0; i < 60; i++) { const m = 0.5 * (lo + hi); if (mosId(vgs, m, p) + (m - vdd) / rd > 0) hi = m; else lo = m; }
  const vds = 0.5 * (lo + hi);
  return { vds, id: mosId(vgs, vds, p) };
}
export function mosSmallSignal(vgs: number, vds: number, p: MosP) {
  const h = 1e-4;
  const gm = (mosId(vgs + h, vds, p) - mosId(vgs - h, vds, p)) / (2 * h);
  const gds = (mosId(vgs, vds + h, p) - mosId(vgs, Math.max(0, vds - h), p)) / (vds + h - Math.max(0, vds - h));
  return { gm, gds, ro: gds > 1e-9 ? 1 / gds : Infinity };
}
/** sqrt(ID) tangent at vgsRef extrapolated to the VGS axis: gives the threshold voltage. */
export function mosExtractVth(vds: number, p: MosP, vgsRef: number) {
  const h = 1e-3, f = (g: number) => Math.sqrt(Math.max(0, mosId(g, vds, p)));
  const sl = (f(vgsRef + h) - f(vgsRef - h)) / (2 * h);
  return sl > 1e-9 ? { vth: vgsRef - f(vgsRef) / sl, slope: sl, y0: f(vgsRef), x0: vgsRef } : null;
}
const mosPar = (v: Values): MosP => ({ vth: num(v, 'vth'), k: num(v, 'k'), lam: num(v, 'lam'), gamma: num(v, 'gamma'), vsb: num(v, 'vsb'), T: num(v, 'T') });

interface MosS { t: number; u: number[]; lat: number[] }
function mosBias(s: MosS, v: Values) {
  const p = mosPar(v), vg = num(v, 'vgs');
  const vgs = bool(v, 'sweep') ? vg * (0.5 + 0.5 * Math.cos((TAU * s.t) / 10)) : vg;
  const q = mosLoad(vgs, num(v, 'vdd'), num(v, 'rd'), p);
  const vds = bool(v, 'useLoad') ? q.vds : num(v, 'vds');
  return { p, vgs, q, vds, id: mosId(vgs, vds, p), vthE: mosVth(p), region: mosRegion(vgs, vds, p) };
}
const clipPlot = (c: Ctx, r: Rect) => { c.beginPath(); c.rect(r.x + 34, r.y + 20, Math.max(1, r.w - 42), Math.max(1, r.h - 46)); c.clip(); };

function drawMosCross(c: Ctx, r: Rect, s: MosS, b: ReturnType<typeof mosBias>) {
  panel(c, r);
  const vov = b.vgs - b.vthE, fs = r.w < 260 ? 9 : 11;
  text(c, 'Channel cross-section (not to scale)', r.x + 8, r.y + 13, C.text, fs, 'left', 'alphabetic', true);
  const X0 = r.x + 8, Y0 = r.y + 22, W = Math.max(40, r.w - 16), H = Math.max(30, r.h - 30), ys = Y0 + 0.36 * H;
  const xs0 = X0 + 0.25 * W, xs1 = X0 + 0.75 * W, nd = 0.26 * H, tg = 0.06 * H, gh = 0.14 * H;
  c.fillStyle = '#2b2140'; c.fillRect(X0, ys, W, Y0 + H - ys);
  c.fillStyle = '#1d4ed8'; c.fillRect(X0 + 0.03 * W, ys, 0.22 * W, nd); c.fillRect(xs1, ys, 0.22 * W, nd);
  text(c, 'n+', X0 + 0.14 * W, ys + nd * 0.62, C.text, fs, 'center'); text(c, 'n+', xs1 + 0.11 * W, ys + nd * 0.62, C.text, fs, 'center');
  text(c, 'p-substrate (B)', X0 + 0.5 * W, Y0 + H - 6, C.dim, fs - 1, 'center');
  // oxide + gate
  c.fillStyle = '#94a3b8'; c.fillRect(xs0, ys - tg, xs1 - xs0, tg);
  const gi = clamp(b.vgs / 6, 0, 1);
  c.fillStyle = `rgba(${Math.round(80 + 170 * gi)},${Math.round(90 + 60 * gi)},${Math.round(120 - 60 * gi)},1)`; c.fillRect(xs0, ys - tg - gh, xs1 - xs0, gh);
  text(c, 'Gate', (xs0 + xs1) / 2, ys - tg - gh / 2 + 4, C.bg, fs, 'center', 'alphabetic', true);
  line(c, (xs0 + xs1) / 2, ys - tg - gh, (xs0 + xs1) / 2, Y0 + 2, C.amber, 1.5); text(c, `G  ${fmt(b.vgs, 2)} V`, (xs0 + xs1) / 2 + 4, Y0 + 8, C.amber, fs - 1);
  line(c, X0 + 0.14 * W, ys, X0 + 0.14 * W, Y0 + 2, C.green, 1.5); text(c, 'S', X0 + 0.14 * W - 3, Y0 + 8, C.green, fs, 'right', 'alphabetic', true);
  line(c, xs1 + 0.11 * W, ys, xs1 + 0.11 * W, Y0 + 2, C.red, 1.5); text(c, `D  ${fmt(b.vds, 2)} V`, xs1 + 0.11 * W - 3, Y0 + 8, C.red, fs - 1, 'right');
  // depletion layer under the channel (wider at the drain end)
  const dS = 0.09 * H, dD = 0.09 * H + 0.13 * H * clamp(b.vds / 6, 0, 1);
  c.fillStyle = 'rgba(167,139,250,0.28)'; c.beginPath(); c.moveTo(xs0, ys); c.lineTo(xs1, ys); c.lineTo(xs1, ys + dD); c.lineTo(xs0, ys + dS); c.closePath(); c.fill();
  // channel
  const L = xs1 - xs0, tmax = 0.15 * H;
  const sat = b.region === 'saturation', vd = sat ? vov : b.vds;
  const xp = sat ? 1 - Math.min(0.4, b.p.lam * (b.vds - vov)) : 1;
  const th = (x: number) => { // thickness in px at normalised position x of the channel
    if (vov <= 0 || x > xp) return 0;
    const xn = x / Math.max(xp, 0.05), Vx = vov - Math.sqrt(Math.max(0, vov * vov - xn * (2 * vov * vd - vd * vd)));
    return tmax * Math.pow(clamp((vov - Vx) / 2.5, 0, 1), 0.7);
  };
  if (vov > 0) {
    const top: [number, number][] = [], bot: [number, number][] = [];
    for (let i = 0; i <= 40; i++) { const x = (i / 40) * xp; top.push([xs0 + x * L, ys]); bot.push([xs0 + x * L, ys + Math.max(1, th(x))]); }
    c.fillStyle = 'rgba(34,211,238,0.55)'; c.beginPath(); c.moveTo(top[0][0], top[0][1]); for (const q of top) c.lineTo(q[0], q[1]); for (let i = bot.length - 1; i >= 0; i--) c.lineTo(bot[i][0], bot[i][1]); c.closePath(); c.fill();
    if (sat) {
      const px = xs0 + xp * L;
      c.fillStyle = 'rgba(251,146,60,0.30)'; c.fillRect(px, ys, xs1 - px, Math.max(2, 0.05 * H));
      circle(c, px, ys, 4, C.red, C.white, 1); if (r.w > 220) text(c, 'pinch-off', px, ys + 0.20 * H + 12, C.red, fs - 1, 'center');
    }
    // carriers (electrons) drifting from source to drain, speed follows the drain current
    for (let i = 0; i < s.u.length; i++) {
      const u = s.u[i], x = u * L, t = th(u * (1 / 1));
      const inCh = u <= xp, y = ys + (inCh ? Math.max(1.5, t) * s.lat[i] : 2 + 3 * s.lat[i]);
      circle(c, xs0 + x, y, 2, inCh ? C.white : C.orange);
    }
  } else if (r.w > 200) text(c, 'no inversion layer: cutoff', (xs0 + xs1) / 2, ys + 0.22 * H, C.dim, fs - 1, 'center');
  const col = b.region === 'cutoff' ? C.dim : b.region === 'triode' ? C.cyan : C.green;
  text(c, b.region.toUpperCase(), r.x + r.w - 8, r.y + 13, col, fs, 'right', 'alphabetic', true);
}

export const mosfetIv = defineSim<MosS>({
  id: 'mosfet_iv_characteristics', title: 'MOSFET I–V Characteristics: Cutoff, Triode and Saturation with Load Line',
  ...meta('Electronics', 'Intermediate', 'Analog Electronics', 'MOSFET', 'Square-law model, channel-length modulation, body effect, load line, small-signal gm and ro', UG_ENG),
  covers: ['MOSFET I-V characteristics', 'Saturation and triode regions', 'Channel-length modulation', 'Threshold voltage', 'Body effect', 'Load line and Q-point', 'Transconductance gm', 'Output resistance ro', 'Pinch-off'],
  tags: ['NMOS', 'enhancement MOSFET', 'square law', 'GATE EC', 'analog electronics', 'transfer characteristic', 'sqrt(ID) plot', 'B.Tech ECE', 'VLSI', 'Early voltage'],
  learningObjectives: ['Identify cutoff, triode and saturation from VGS, Vth and VDS and see the pinch-off point appear in the channel.', 'Read gm and ro from the curves and extract Vth from the straight line of the √ID–VGS plot.', 'Find the DC operating point graphically as the intersection of the load line with the VGS curve.'],
  assumptions: ['Long-channel square-law model, no velocity saturation or subthreshold conduction (ID = 0 below Vth); (1 + λVDS) is applied in both regions so ID is continuous.', 'Body effect uses 2φF = 0.7 V; temperature enters as Vth drift of −2 mV/K and mobility ∝ T^−1.5.'],
  blurb: 'Sweep the gate voltage (animated) and watch the ID–VDS family, the transfer curves, the load-line Q-point and the channel pinch off as the device moves from cutoff to triode to saturation.',
  hint: 'Triode: ID = k[(VGS−Vth)VDS − VDS²/2](1+λVDS); saturation (VDS ≥ VGS−Vth): ID = ½k(VGS−Vth)²(1+λVDS) with k = kn′W/L. gm = k·VOV (1+λVDS), ro = 1/(λ·ID). Body effect raises Vth by γ(√(2φ+VSB) − √2φ). Load line: VDS = VDD − ID·RD.',
  params: [
    { kind: 'number', id: 'vgs', label: 'Gate–source voltage VGS (max of sweep)', min: 0, max: 6, step: 0.05, value: 3, unit: 'V', digits: 2 },
    { kind: 'number', id: 'vds', label: 'Drain–source voltage VDS (free mode)', min: 0, max: 10, step: 0.05, value: 4, unit: 'V', digits: 2 },
    { kind: 'number', id: 'vth', label: 'Threshold voltage Vth0', min: 0.2, max: 2, step: 0.05, value: 0.8, unit: 'V', digits: 2 },
    { kind: 'number', id: 'k', label: 'k = kn′·W/L', min: 0.1, max: 10, step: 0.1, value: 2, unit: 'mA/V²', digits: 1 },
    { kind: 'number', id: 'lam', label: 'Channel-length modulation λ', min: 0, max: 0.3, step: 0.005, value: 0.04, unit: '1/V', digits: 3 },
    { kind: 'number', id: 'gamma', label: 'Body-effect coefficient γ', min: 0, max: 1, step: 0.05, value: 0.4, unit: '√V', digits: 2 },
    { kind: 'number', id: 'vsb', label: 'Source–body voltage VSB', min: 0, max: 4, step: 0.1, value: 0, unit: 'V', digits: 1 },
    { kind: 'number', id: 'T', label: 'Temperature', min: 250, max: 400, step: 5, value: 300, unit: 'K', digits: 0 },
    { kind: 'number', id: 'vdd', label: 'Supply VDD (load line)', min: 1, max: 12, step: 0.1, value: 5, unit: 'V', digits: 1 },
    { kind: 'number', id: 'rd', label: 'Drain resistor RD', min: 0.2, max: 20, step: 0.1, value: 2, unit: 'kΩ', digits: 1 },
    { kind: 'toggle', id: 'useLoad', label: 'Bias through RD (solve load-line Q-point)', value: true },
    { kind: 'toggle', id: 'sweep', label: 'Animate VGS sweep 0 → VGS', value: true },
  ],
  dt: 1 / 60, previewSeconds: 1.5,
  init() { const r = mulberry(5); return { t: 0, u: Array.from({ length: 30 }, (_, i) => i / 30), lat: Array.from({ length: 30 }, () => r()) }; },
  step(s, v, dt) {
    s.t += dt; const b = mosBias(s, v);
    const idRef = Math.max(1e-6, mosId(b.vthE + 2, 4, b.p)), sp = b.id > 0 ? 0.08 + 0.5 * clamp(b.id / idRef, 0, 1.5) : 0;
    for (let i = 0; i < s.u.length; i++) { s.u[i] += sp * dt; if (s.u[i] > 1) s.u[i] -= 1; }
  },
  draw(c, s, v, w, h) {
    bg(c, w, h); const b = mosBias(s, v), p = b.p, vdd = num(v, 'vdd'), rd = num(v, 'rd'), vdsSlide = num(v, 'vds');
    const compact = w < 560 || h < 340, g = 8;
    let A: Rect, B: Rect, Cc: Rect, D: Rect | null;
    if (compact) { const h1 = Math.round((h - 3 * g) * 0.5); A = R(g, g, w - 2 * g, h1); const hw = (w - 3 * g) / 2; B = R(g, 2 * g + h1, hw, h - 3 * g - h1); Cc = R(2 * g + hw, 2 * g + h1, hw, h - 3 * g - h1); D = null; }
    else { const hw = (w - 3 * g) / 2, hh = (h - 3 * g) / 2; A = R(g, g, hw, hh); B = R(2 * g + hw, g, hw, hh); Cc = R(g, 2 * g + hh, hw, hh); D = R(2 * g + hw, 2 * g + hh, hw, hh); }
    const small = A.w < 240;
    // ---- A: ID-VDS family
    const xmax = Math.max(vdd, b.vds, 1), vthE = b.vthE;
    const fam = [0.5, 1, 1.5, 2, 2.5].map(o => vthE + o);
    let ytop = mosId(vthE + 2.5, xmax, p);
    ytop = Math.max(ytop, mosId(b.vgs, xmax, p), 1e-3) * 1.08;
    const mA = plot(c, A, [0, xmax], [0, ytop], { title: 'ID–VDS family', xlabel: 'VDS (V)', ylabel: 'ID (mA)' });
    c.save(); clipPlot(c, A);
    fam.forEach(vg => { const pts: [number, number][] = []; for (let i = 0; i <= 80; i++) { const x = (xmax * i) / 80; pts.push([mA.X(x), mA.Y(mosId(vg, x, p))]); } polyline(c, pts, 'rgba(96,165,250,0.55)', 1.3); });
    const par: [number, number][] = []; for (let i = 0; i <= 80; i++) { const x = (xmax * i) / 80, y = 0.5 * mosK(p) * x * x * (1 + p.lam * x); if (y > ytop) break; par.push([mA.X(x), mA.Y(y)]); }
    polyline(c, par, C.green, 1.5, [5, 4]);
    polyline(c, [[mA.X(0), mA.Y(vdd / rd)], [mA.X(vdd), mA.Y(0)]], C.pink, 1.6, [2, 3]);
    const cur: [number, number][] = []; for (let i = 0; i <= 80; i++) { const x = (xmax * i) / 80; cur.push([mA.X(x), mA.Y(mosId(b.vgs, x, p))]); }
    polyline(c, cur, C.amber, 2.6);
    c.restore();
    if (!small) { fam.forEach(vg => text(c, `${fmt(vg, 1)}V`, mA.X(xmax) - 2, clamp(mA.Y(mosId(vg, xmax, p)) - 2, A.y + 28, A.y + A.h - 28), 'rgba(96,165,250,0.9)', 9, 'right')); text(c, 'VDS = VGS − Vth', mA.X(xmax * 0.18), A.y + 32, C.green, 9); text(c, 'load line', mA.X(vdd * 0.62), mA.Y(vdd / rd * 0.38) - 6, C.pink, 9); }
    circle(c, mA.X(b.q.vds), mA.Y(b.q.id), 4, undefined, C.pink, 1.8);
    circle(c, mA.X(b.vds), mA.Y(b.id), 5.5, C.amber, C.white, 1.5);
    // ---- B: transfer
    const vgsMax = 6, idT = (g2: number) => mosId(g2, vdsSlide, p);
    const yt = Math.max(idT(vgsMax), 1e-3) * 1.06;
    const mB = plot(c, B, [0, vgsMax], [0, yt], { title: `ID–VGS at VDS = ${fmt(vdsSlide, 1)} V`, xlabel: 'VGS (V)', ylabel: 'ID (mA)' });
    c.save(); clipPlot(c, B);
    const tr: [number, number][] = []; for (let i = 0; i <= 120; i++) { const x = (vgsMax * i) / 120; tr.push([mB.X(x), mB.Y(idT(x))]); }
    polyline(c, tr, C.cyan, 2.2); c.restore();
    line(c, mB.X(vthE), mB.Y(0), mB.X(vthE), mB.Y(yt), C.red, 1, [3, 3]);
    circle(c, mB.X(clamp(b.vgs, 0, vgsMax)), mB.Y(idT(b.vgs)), 4.5, C.amber, C.white, 1.2);
    if (bool(v, 'useLoad')) circle(c, mB.X(clamp(b.vgs, 0, vgsMax)), mB.Y(b.id), 4, C.pink, C.white, 1.2);
    if (!small) text(c, 'Vth', mB.X(vthE) + 3, B.y + 32, C.red, 9);
    // ---- C: cross-section
    drawMosCross(c, Cc, s, b);
    // ---- D: sqrt(ID)
    if (D) {
      const sq = (g2: number) => Math.sqrt(Math.max(0, idT(g2))), ys2 = Math.max(sq(vgsMax), 0.05) * 1.06;
      const mD = plot(c, D, [0, vgsMax], [0, ys2], { title: '√ID–VGS: straight line → Vth', xlabel: 'VGS (V)', ylabel: '√ID (√mA)' });
      c.save(); clipPlot(c, D);
      const sp: [number, number][] = []; for (let i = 0; i <= 120; i++) { const x = (vgsMax * i) / 120; sp.push([mD.X(x), mD.Y(sq(x))]); } polyline(c, sp, C.cyan, 2.2);
      const ref = b.region === 'saturation' && b.vgs > 0 ? clamp(b.vgs, 0, vgsMax - 0.01) : clamp(vthE + 1, 0.05, vgsMax - 0.01);
      const ex = mosExtractVth(vdsSlide, p, ref);
      if (ex) { polyline(c, [[mD.X(ex.vth), mD.Y(0)], [mD.X(vgsMax), mD.Y(ex.y0 + ex.slope * (vgsMax - ex.x0))]], C.amber, 1.4, [5, 4]); }
      c.restore();
      if (ex) { circle(c, mD.X(clamp(ex.vth, 0, vgsMax)), mD.Y(0), 4.5, C.red, C.white, 1.2); text(c, `Vth ≈ ${fmt(ex.vth, 2)} V`, D.x + D.w - 8, D.y + D.h - 32, C.red, 10, 'right'); }
    }
  },
  readouts(s, v) {
    const b = mosBias(s, v), ss = mosSmallSignal(b.vgs, b.vds, b.p), vov = b.vgs - b.vthE;
    const ex = mosExtractVth(num(v, 'vds'), b.p, b.region === 'saturation' && b.vgs > 0 ? clamp(b.vgs, 0, 5.99) : clamp(b.vthE + 1, 0.05, 5.99));
    return [
      { label: 'Region', value: b.region },
      { label: 'VGS (live)', value: b.vgs, unit: 'V', digits: 2 },
      { label: 'Vth (body + temp)', value: b.vthE, unit: 'V', digits: 3 },
      { label: 'Overdrive VOV = VGS − Vth', value: vov, unit: 'V', digits: 3 },
      { label: 'VDS (bias)', value: b.vds, unit: 'V', digits: 3 },
      { label: 'ID', value: b.id, unit: 'mA', digits: 4 },
      { label: 'gm', value: ss.gm, unit: 'mS', digits: 4 },
      { label: 'ro', value: Number.isFinite(ss.ro) ? ss.ro : '∞ (λ = 0 in saturation / cutoff)', unit: Number.isFinite(ss.ro) ? 'kΩ' : undefined, digits: 2 },
      { label: 'Q-point on load line', value: `VDS ${fmt(b.q.vds, 2)} V, ID ${fmt(b.q.id, 3)} mA` },
      { label: 'Power in device VDS·ID', value: b.vds * b.id, unit: 'mW', digits: 3 },
      { label: 'Vth extracted from √ID line', value: ex ? ex.vth : 'n/a', unit: ex ? 'V' : undefined, digits: 3 },
    ];
  },
  equations(s, v) {
    const b = mosBias(s, v), p = b.p, k = mosK(p), vov = b.vgs - b.vthE, ss = mosSmallSignal(b.vgs, b.vds, p);
    const main = b.region === 'saturation' ? `I_D=\\tfrac12 k V_{OV}^2(1+\\lambda V_{DS})=\\tfrac12(${fmt(k, 2)})(${fmt(vov, 2)})^2(1+${fmt(p.lam, 3)}\\cdot${fmt(b.vds, 2)})=${fmt(b.id, 3)}\\ \\mathrm{mA}`
      : b.region === 'triode' ? `I_D=k\\left[V_{OV}V_{DS}-\\tfrac{V_{DS}^2}{2}\\right](1+\\lambda V_{DS})=${fmt(b.id, 3)}\\ \\mathrm{mA}` : `V_{GS}=${fmt(b.vgs, 2)}\\ \\mathrm{V}\\le V_{th}=${fmt(b.vthE, 2)}\\ \\mathrm{V}\\Rightarrow I_D=0`;
    return [main, `V_{th}=V_{th0}+\\gamma\\left(\\sqrt{2\\phi_F+V_{SB}}-\\sqrt{2\\phi_F}\\right)-2\\,\\mathrm{mV/K}\\,(T-300)=${fmt(b.vthE, 3)}\\ \\mathrm{V}`, `g_m=\\partial I_D/\\partial V_{GS}=${fmt(ss.gm, 3)}\\ \\mathrm{mS},\\quad r_o=1/g_{ds}\\approx 1/(\\lambda I_D)=${Number.isFinite(ss.ro) ? fmt(ss.ro, 1) : '\\infty'}\\ \\mathrm{k\\Omega}`, `V_{DS}=V_{DD}-I_DR_D=${fmt(num(v, 'vdd'), 1)}-I_D(${fmt(num(v, 'rd'), 1)})\\Rightarrow Q=(${fmt(b.q.vds, 2)}\\,\\mathrm{V},\\,${fmt(b.q.id, 3)}\\,\\mathrm{mA})`];
  },
});

/* ================================================================== */
/*  2. Three-phase power systems                                       */
/* ================================================================== */
type Cx = [number, number];
const cadd = (a: Cx, b: Cx): Cx => [a[0] + b[0], a[1] + b[1]];
const csub = (a: Cx, b: Cx): Cx => [a[0] - b[0], a[1] - b[1]];
const cmul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cinv = (a: Cx): Cx => { const d = a[0] * a[0] + a[1] * a[1] || 1e-30; return [a[0] / d, -a[1] / d]; };
const cabs = (a: Cx) => Math.hypot(a[0], a[1]);
const carg = (a: Cx) => Math.atan2(a[1], a[0]);
const cpol = (m: number, ang: number): Cx => [m * Math.cos(ang), m * Math.sin(ang)];
const cconj = (a: Cx): Cx => [a[0], -a[1]];

export interface TP { VL: number; f: number; conn: 'Y' | 'D'; R: number; X: number; unbal: number; C: number; neutral: boolean }
export function solveThreePhase(p: TP) {
  const Vph = p.VL / Math.sqrt(3), w = TAU * p.f, ub = 1 - p.unbal / 100;
  const Vs: Cx[] = [cpol(Vph, 0), cpol(Vph, -TAU / 3), cpol(Vph, TAU / 3)];
  const Z: Cx[] = [[p.R, p.X], [p.R * ub, p.X * ub], [p.R, p.X]];
  const Y: Cx[] = Z.map(z => cadd(cinv(z), [0, w * p.C * 1e-6]));
  const Vl: Cx[] = [csub(Vs[0], Vs[1]), csub(Vs[1], Vs[2]), csub(Vs[2], Vs[0])];
  let I: Cx[], Iph: Cx[], In: Cx = [0, 0], VnN: Cx = [0, 0];
  if (p.conn === 'Y') {
    if (p.neutral) { I = Y.map((y, k) => cmul(y, Vs[k])); In = cadd(cadd(I[0], I[1]), I[2]); }
    else {
      let num: Cx = [0, 0], den: Cx = [0, 0]; Y.forEach((y, k) => { num = cadd(num, cmul(y, Vs[k])); den = cadd(den, y); });
      VnN = cmul(num, cinv(den)); I = Y.map((y, k) => cmul(y, csub(Vs[k], VnN)));
    }
    Iph = I;
  } else {
    Iph = Y.map((y, k) => cmul(y, Vl[k]));
    I = [csub(Iph[0], Iph[2]), csub(Iph[1], Iph[0]), csub(Iph[2], Iph[1])];
  }
  let S: Cx = [0, 0]; for (let k = 0; k < 3; k++) S = cadd(S, cmul(Vs[k], cconj(I[k])));
  const Sa = cabs(S);
  return { Vph, Vs, Vl, I, Iph, In, VnN, P: S[0], Q: S[1], S: Sa, pf: Sa > 1e-9 ? S[0] / Sa : 1, w };
}
const wv = (z: Cx, th: number) => Math.SQRT2 * (z[0] * Math.cos(th) - z[1] * Math.sin(th));
/** Instantaneous total power sum(v_k i_k) at electrical angle theta (W). */
export function threePhaseInstPower(sol: ReturnType<typeof solveThreePhase>, th: number) {
  let t = 0; for (let k = 0; k < 3; k++) t += wv(sol.Vs[k], th) * wv(sol.I[k], th); return t;
}
const tpPar = (v: Values, withCap = bool(v, 'pfc')): TP => ({ VL: num(v, 'VL'), f: Number(str(v, 'f')), conn: str(v, 'conn') === 'D' ? 'D' : 'Y', R: num(v, 'R'), X: num(v, 'X'), unbal: num(v, 'unbal'), C: withCap ? num(v, 'C') : 0, neutral: bool(v, 'neutral') });
const PCOL = [C.red, C.amber, C.blue];

export const threePhase = defineSim<{ th: number }>({
  id: 'three_phase_power_systems', title: 'Three-Phase Power: Phasors, Y/Δ Loads, Neutral Current and Constant Total Power',
  ...meta('Electronics', 'Intermediate', 'Power Systems', 'Three-phase systems', 'Line and phase quantities, Y and Delta loads, unbalance, P Q S, power-factor correction', UG_ENG),
  covers: ['Three-phase systems', 'Line and phase voltage', 'Star and delta connection', 'Unbalanced load', 'Neutral current', 'Three-phase power', 'Power factor correction', 'Phasor diagram', 'Active, reactive and apparent power'],
  tags: ['3-phase', 'star delta', 'phasor', 'GATE EE', 'power factor', 'kVAR', 'electrical machines', 'power systems', 'B.Tech EEE', 'balanced load'],
  learningObjectives: ['See V_L = √3·V_ph leading by 30° and I_L = √3·I_ph in a delta load.', 'Show that the instantaneous total power of a balanced load is constant = 3·V_ph·I_ph·cosφ while each phase pulsates at 2ω.', 'Quantify neutral current for an unbalanced star load and the kVA/line-current saving from a power-factor-correction capacitor bank.'],
  assumptions: ['Ideal balanced sinusoidal source (ABC sequence), zero line and source impedance; neutral is ideal when connected. Phase B load is scaled by (1 − unbalance).', 'The correction capacitor bank uses the same connection as the load; the phasors rotate in slow motion (0.4 rev/s) while the time axis is real milliseconds.'],
  blurb: 'Watch the phasors rotate and the three sinusoids trace out while you switch the load between star and delta, add a lagging or leading load, unbalance phase B and add a power-factor-correction capacitor.',
  hint: 'Van = Vph∠0°, Vbn = Vph∠−120°, Vcn = Vph∠+120°; Vab = Van − Vbn = √3 Vph∠30°. Y load: IL = Iph, neutral current In = Ia+Ib+Ic (zero if balanced). Δ load: IL = √3 Iph. P = √3 VL IL cosφ, Q = √3 VL IL sinφ, S = √3 VL IL. Balanced total p(t) = 3 Vph Iph cosφ constant.',
  params: [
    { kind: 'number', id: 'VL', label: 'Line-to-line voltage VL (rms)', min: 100, max: 700, step: 10, value: 400, unit: 'V', digits: 0 },
    { kind: 'select', id: 'f', label: 'Frequency', value: '50', options: [{ value: '50', label: '50 Hz' }, { value: '60', label: '60 Hz' }] },
    { kind: 'select', id: 'conn', label: 'Load connection', value: 'Y', options: [{ value: 'Y', label: 'Star (Y)' }, { value: 'D', label: 'Delta (Δ)' }] },
    { kind: 'number', id: 'R', label: 'Load resistance R per phase', min: 1, max: 100, step: 0.5, value: 10, unit: 'Ω', digits: 1 },
    { kind: 'number', id: 'X', label: 'Load reactance X per phase (+ inductive, − capacitive)', min: -60, max: 60, step: 0.5, value: 8, unit: 'Ω', digits: 1 },
    { kind: 'number', id: 'unbal', label: 'Unbalance: phase B impedance reduced by', min: 0, max: 80, step: 1, value: 0, unit: '%', digits: 0 },
    { kind: 'toggle', id: 'neutral', label: 'Neutral wire connected (star)', value: true },
    { kind: 'toggle', id: 'pfc', label: 'Add power-factor-correction capacitor bank', value: false },
    { kind: 'number', id: 'C', label: 'Capacitor per phase C', min: 0, max: 800, step: 5, value: 150, unit: 'µF', digits: 0 },
  ],
  dt: 1 / 60, previewSeconds: 1, init() { return { th: 0.35 }; }, step(s, v, dt) { s.th = (s.th + TAU * 0.4 * (Number(str(v, 'f')) / 50) * dt) % (4 * Math.PI); },
  draw(c, s, v, w, h) {
    bg(c, w, h); const P = tpPar(v), sol = solveThreePhase(P), g = 8, compact = w < 560 || h < 340;
    const fHz = P.f, winMs = 2000 / fHz, th = s.th;
    let Ph: Rect, Sc: Rect | null, Pv: Rect, Pi: Rect | null, Pp: Rect;
    if (compact) { const lw = Math.round(w * 0.42), rw = w - lw - 3 * g, hh = (h - 3 * g) / 2; Ph = R(g, g, lw, h - 2 * g); Sc = null; Pv = R(lw + 2 * g, g, rw, hh); Pi = null; Pp = R(lw + 2 * g, 2 * g + hh, rw, hh); }
    else { const lw = Math.round(w * 0.36), rw = w - lw - 3 * g, hh = (h - 4 * g) / 3, lh = Math.round((h - 3 * g) * 0.62); Ph = R(g, g, lw, lh); Sc = R(g, 2 * g + lh, lw, h - 3 * g - lh); Pv = R(lw + 2 * g, g, rw, hh); Pi = R(lw + 2 * g, 2 * g + hh, rw, hh); Pp = R(lw + 2 * g, 3 * g + 2 * hh, rw, hh); }
    // ---- phasor diagram
    panel(c, Ph); text(c, 'Phasors (peak, rotating)', Ph.x + 8, Ph.y + 13, C.text, Ph.w < 240 ? 9 : 11, 'left', 'alphabetic', true);
    const cx = Ph.x + Ph.w / 2, cy = Ph.y + 20 + (Ph.h - 24) / 2, R0 = Math.max(18, Math.min(Ph.w / 2 - 14, (Ph.h - 28) / 2 - 4)), kV = R0 / (Math.SQRT2 * P.VL);
    c.save(); c.beginPath(); c.rect(Ph.x + 1, Ph.y + 18, Ph.w - 2, Ph.h - 19); c.clip();
    line(c, cx - R0, cy, cx + R0, cy, C.grid); line(c, cx, cy - R0, cx, cy + R0, C.grid); circle(c, cx, cy, R0, undefined, C.grid, 1);
    const pt = (z: Cx, k: number): [number, number] => { const a = carg(z) + th, m = cabs(z) * k * Math.SQRT2; return [cx + m * Math.cos(a), cy - m * Math.sin(a)]; };
    const tips = sol.Vs.map(z => pt(z, kV)), ltips = sol.Vl.map(z => pt(z, kV));
    for (let k = 0; k < 3; k++) { const n = (k + 1) % 3; line(c, tips[n][0], tips[n][1], tips[k][0], tips[k][1], 'rgba(148,163,184,0.45)', 1, [3, 3]); }
    const lcol = [C.pink, C.cyan, C.purple];
    for (let k = 0; k < 3; k++) arrow(c, cx, cy, ltips[k][0], ltips[k][1], lcol[k], 1.4, 7);
    for (let k = 0; k < 3; k++) { arrow(c, cx, cy, tips[k][0], tips[k][1], PCOL[k], 2.4, 9); line(c, tips[k][0], tips[k][1], tips[k][0], cy, PCOL[k], 1, [2, 3]); circle(c, tips[k][0], cy, 3, PCOL[k]); }
    const mi = Math.max(1e-9, ...sol.I.map(cabs)), kI = (0.5 * R0) / (Math.SQRT2 * mi);
    for (let k = 0; k < 3; k++) { const q = pt(sol.I[k], kI); arrow(c, cx, cy, q[0], q[1], PCOL[k], 1.2, 6); circle(c, q[0], q[1], 2.5, C.white); }
    // 30 degree arc between Van and Vab
    const a0 = carg(sol.Vs[0]) + th, a1 = carg(sol.Vl[0]) + th;
    c.beginPath(); c.arc(cx, cy, R0 * 0.22, -a1, -a0); c.strokeStyle = C.white; c.lineWidth = 1; c.stroke();
    c.restore();
    if (Ph.w > 220) { ['Van', 'Vbn', 'Vcn'].forEach((n, k) => text(c, n, tips[k][0] + 4, tips[k][1] - 4, PCOL[k], 10, 'left', 'alphabetic', true)); ['Vab', 'Vbc', 'Vca'].forEach((n, k) => text(c, n, ltips[k][0] + 4, ltips[k][1] + 10, lcol[k], 9)); text(c, '30° • thin = line currents', Ph.x + 8, Ph.y + Ph.h - 6, C.dim, 9); }
    // ---- schematic
    if (Sc) {
      panel(c, Sc); const fs = Sc.w < 260 ? 8 : 10; text(c, `${P.conn === 'Y' ? 'Star' : 'Delta'} load${P.conn === 'Y' ? (P.neutral ? ', 4-wire' : ', 3-wire') : ''}`, Sc.x + 8, Sc.y + 13, C.text, fs + 1, 'left', 'alphabetic', true);
      const ys = [0, 1, 2].map(k => Sc.y + 28 + (k * (Sc.h - 46)) / 2), xl = Sc.x + 20, xb = Sc.x + Sc.w * 0.42;
      for (let k = 0; k < 3; k++) { line(c, xl, ys[k], xb, ys[k], PCOL[k], 2); text(c, 'ABC'[k], xl - 6, ys[k] + 3, PCOL[k], fs, 'right', 'alphabetic', true); text(c, `I${'abc'[k]} ${fmt(cabs(sol.I[k]), 1)} A`, xl + 4, ys[k] - 4, PCOL[k], fs - 1); }
      const bw = Math.min(46, Sc.w * 0.16), bh = 14;
      if (P.conn === 'Y') {
        const xe = xb + bw + 6, xn = xe + 14;
        for (let k = 0; k < 3; k++) { c.fillStyle = k === 1 && P.unbal > 0 ? 'rgba(248,113,113,0.35)' : 'rgba(148,163,184,0.2)'; c.fillRect(xb, ys[k] - bh / 2, bw, bh); c.strokeStyle = C.axis; c.strokeRect(xb, ys[k] - bh / 2, bw, bh); text(c, `Z${'abc'[k]}`, xb + bw / 2, ys[k] + 3, C.text, fs - 1, 'center'); line(c, xb + bw, ys[k], xn, ys[k], PCOL[k], 2); }
        line(c, xn, ys[0], xn, ys[2], C.axis, 2); circle(c, xn, ys[1], 3, C.white);
        if (P.neutral) { line(c, xn, ys[1], Sc.x + Sc.w - 10, ys[1], C.dim, 1.5, [4, 3]); text(c, `N: In = ${fmt(cabs(sol.In), 2)} A`, Sc.x + Sc.w - 10, ys[1] + 14, C.white, fs, 'right'); } else text(c, `V_nN = ${fmt(cabs(sol.VnN), 1)} V`, Sc.x + Sc.w - 10, ys[1] + 14, C.white, fs, 'right');
      } else {
        const xv = xb + bw + 10, dx = Math.min(70, Sc.w * 0.2);
        const vA: [number, number] = [xv, ys[0]], vB: [number, number] = [xv + dx, ys[1]], vC: [number, number] = [xv, ys[2]];
        for (let k = 0; k < 3; k++) line(c, xb, ys[k], xv, ys[k], PCOL[k], 2);
        const edges: [[number, number], [number, number]][] = [[vA, vB], [vB, vC], [vC, vA]];
        edges.forEach(([a, b], k) => { line(c, a[0], a[1], b[0], b[1], C.axis, 2); const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; c.fillStyle = k === 1 && P.unbal > 0 ? 'rgba(248,113,113,0.6)' : 'rgba(30,41,59,0.95)'; c.fillRect(mx - 9, my - 6, 18, 12); c.strokeStyle = C.axis; c.strokeRect(mx - 9, my - 6, 18, 12); text(c, ['ab', 'bc', 'ca'][k], mx, my + 3, C.text, 8, 'center'); });
        text(c, `Iph = ${fmt(cabs(sol.Iph[0]), 1)} A`, Sc.x + Sc.w - 10, ys[1] + 14, C.white, fs, 'right');
      }
    }
    // ---- waveforms
    const N = 240, xs: number[] = [], vab: number[] = [], vv = [[], [], []] as number[][], ii = [[], [], []] as number[][], inn: number[] = [], pp = [[], [], []] as number[][], pt2: number[] = [];
    for (let n = 0; n <= N; n++) {
      const ms = (winMs * n) / N, a = (TAU * fHz * ms) / 1000; xs.push(ms); let tot = 0;
      for (let k = 0; k < 3; k++) { const vk = wv(sol.Vs[k], a), ik = wv(sol.I[k], a); vv[k].push(vk); ii[k].push(ik); pp[k].push(vk * ik / 1000); tot += vk * ik; }
      vab.push(wv(sol.Vl[0], a)); inn.push(wv(sol.In, a)); pt2.push(tot / 1000);
    }
    const cursor = ((th % (4 * Math.PI)) / (TAU * fHz)) * 1000;
    const drawLines = (m: ReturnType<typeof plot>, rr: Rect, series: number[][], cols: string[], dashes: (number[] | undefined)[], widths: number[]) => {
      c.save(); clipPlot(c, rr); series.forEach((sr, k) => polyline(c, sr.map((y, i) => [m.X(xs[i]), m.Y(y)] as [number, number]), cols[k], widths[k], dashes[k])); line(c, m.X(cursor), rr.y + 20, m.X(cursor), rr.y + rr.h - 26, C.white, 1, [3, 3]); c.restore();
    };
    const vmax = Math.SQRT2 * P.VL * 1.05, mV = plot(c, Pv, [0, winMs], [-vmax, vmax], { title: 'Voltages: phase (solid), Vab (dashed)', xlabel: 'time (ms, real)', ylabel: 'V', zeroAxis: true });
    drawLines(mV, Pv, [vv[0], vv[1], vv[2], vab], [...PCOL, C.white], [undefined, undefined, undefined, [5, 4]], [2, 2, 2, 1.3]);
    for (let k = 0; k < 3; k++) circle(c, mV.X(cursor), mV.Y(vv[k][clamp(Math.round((cursor / winMs) * N), 0, N)]), 3.5, PCOL[k]);
    if (Pi) {
      const imax = Math.max(1, Math.SQRT2 * Math.max(...sol.I.map(cabs), cabs(sol.In))) * 1.1, mI = plot(c, Pi, [0, winMs], [-imax, imax], { title: 'Line currents (neutral dashed grey)', xlabel: 'time (ms, real)', ylabel: 'A', zeroAxis: true });
      drawLines(mI, Pi, [ii[0], ii[1], ii[2], inn], [...PCOL, C.dim], [undefined, undefined, undefined, [5, 4]], [2, 2, 2, 1.6]);
    }
    const pmax = Math.max(1e-3, ...pt2.map(Math.abs), ...pp.flat().map(Math.abs)) * 1.1, pLo = Math.min(...pt2, ...pp.flat(), 0) * 1.1;
    const mP = plot(c, Pp, [0, winMs], [Math.min(pLo, -pmax * 0.05), pmax], { title: 'Power: phases (thin) and TOTAL p(t) (white)', xlabel: 'time (ms, real)', ylabel: 'kW', zeroAxis: true });
    drawLines(mP, Pp, [pp[0], pp[1], pp[2], pt2], [...PCOL, C.white], [undefined, undefined, undefined, undefined], [1, 1, 1, 3]);
    c.save(); clipPlot(c, Pp); line(c, mP.X(0), mP.Y(sol.P / 1000), mP.X(winMs), mP.Y(sol.P / 1000), C.green, 1.2, [6, 4]); c.restore();
    circle(c, mP.X(cursor), mP.Y(pt2[clamp(Math.round((cursor / winMs) * N), 0, N)]), 4, C.white);
  },
  readouts(_s, v) {
    const P = tpPar(v), sol = solveThreePhase(P), s0 = solveThreePhase(tpPar(v, false)), I = sol.I.map(cabs), Il = (I[0] + I[1] + I[2]) / 3;
    let lo = Infinity, hi = -Infinity; for (let n = 0; n < 96; n++) { const p = threePhaseInstPower(sol, (TAU * n) / 96); lo = Math.min(lo, p); hi = Math.max(hi, p); }
    return [
      { label: 'Phase voltage Vph = VL/√3', value: sol.Vph, unit: 'V', digits: 1 },
      { label: 'Line current IL (mean of 3)', value: Il, unit: 'A', digits: 2 },
      { label: 'Phase-load current Iph', value: (cabs(sol.Iph[0]) + cabs(sol.Iph[1]) + cabs(sol.Iph[2])) / 3, unit: 'A', digits: 2 },
      { label: 'Neutral current |In|', value: cabs(sol.In), unit: 'A', digits: 3 },
      { label: 'Real power P', value: sol.P / 1000, unit: 'kW', digits: 3 },
      { label: 'Reactive power Q', value: sol.Q / 1000, unit: 'kvar', digits: 3 },
      { label: 'Apparent power S', value: sol.S / 1000, unit: 'kVA', digits: 3 },
      { label: 'Power factor', value: `${fmt(sol.pf, 3)} ${sol.Q >= 0 ? 'lagging' : 'leading'}` },
      { label: 'pf without capacitor bank', value: `${fmt(s0.pf, 3)} ${s0.Q >= 0 ? 'lagging' : 'leading'}` },
      { label: 'Total p(t) ripple (max − min)', value: (hi - lo) / 1000, unit: 'kW', digits: 4 },
      { label: 'Capacitor bank Qc', value: bool(v, 'pfc') ? (s0.Q - sol.Q) / 1000 : 0, unit: 'kvar', digits: 3 },
    ];
  },
  equations(_s, v) {
    const P = tpPar(v), sol = solveThreePhase(P), Il = (cabs(sol.I[0]) + cabs(sol.I[1]) + cabs(sol.I[2])) / 3, phi = Math.acos(clamp(sol.pf, -1, 1)) * 180 / Math.PI;
    return [`V_L=\\sqrt3\\,V_{ph}=\\sqrt3(${fmt(sol.Vph, 1)})=${fmt(P.VL, 1)}\\ \\mathrm{V},\\quad V_{ab}=\\sqrt3V_{ph}\\angle30^\\circ`, `P=\\sqrt3V_LI_L\\cos\\varphi=\\sqrt3(${fmt(P.VL, 0)})(${fmt(Il, 2)})(${fmt(sol.pf, 3)})=${fmt(sol.P / 1000, 2)}\\ \\mathrm{kW}`, `Q=\\sqrt3V_LI_L\\sin\\varphi=${fmt(sol.Q / 1000, 2)}\\ \\mathrm{kvar},\\ S=${fmt(sol.S / 1000, 2)}\\ \\mathrm{kVA},\\ \\varphi=${fmt(phi, 1)}^\\circ`, P.unbal === 0 && P.conn === 'Y' ? `p(t)=\\sum v_ki_k=3V_{ph}I_{ph}\\cos\\varphi=${fmt(sol.P / 1000, 2)}\\ \\mathrm{kW}\\ (\\text{constant})` : `I_n=I_a+I_b+I_c=${fmt(cabs(sol.In), 2)}\\ \\mathrm{A}`, `Q_C=3\\omega CV^2\\ \\Rightarrow\\ \\text{pf improves from }${fmt(solveThreePhase(tpPar(v, false)).pf, 3)}\\text{ to }${fmt(sol.pf, 3)}`];
  },
});

/* ================================================================== */
/*  3. AM / FM / BPSK / QPSK / 16-QAM                                  */
/* ================================================================== */
export type Scheme = 'am' | 'fm' | 'bpsk' | 'qpsk' | 'qam16';
const BITS: Record<string, number> = { am: 0, fm: 0, bpsk: 1, qpsk: 2, qam16: 4 };
export const bitsPer = (sc: string) => BITS[sc] ?? 0;
export interface Pt { i: number; q: number; idx: number; label: string }
const G4 = [-3, -1, 3, 1]; // Gray: bit pair 00 -> -3, 01 -> -1, 10 -> +3, 11 -> +1
const CONS: Record<string, Pt[]> = {};
export function constellation(sc: string): Pt[] {
  if (CONS[sc]) return CONS[sc];
  const k = bitsPer(sc), pts: Pt[] = [];
  for (let idx = 0; idx < (1 << k); idx++) {
    let i = 0, q = 0;
    if (sc === 'bpsk') i = idx === 0 ? 1 : -1;
    else if (sc === 'qpsk') { i = (idx & 2 ? -1 : 1) / Math.SQRT2; q = (idx & 1 ? -1 : 1) / Math.SQRT2; }
    else { i = G4[(idx >> 2) & 3] / Math.sqrt(10); q = G4[idx & 3] / Math.sqrt(10); }
    pts.push({ i, q, idx, label: idx.toString(2).padStart(k, '0') });
  }
  return (CONS[sc] = pts);
}
function erfc(x: number) { const z = Math.abs(x), t = 1 / (1 + 0.5 * z), r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; }
export const Qf = (x: number) => 0.5 * erfc(x / Math.SQRT2);
export function theoryBer(sc: string, ebn0dB: number) {
  const g = Math.pow(10, ebn0dB / 10);
  if (sc === 'bpsk' || sc === 'qpsk') return Qf(Math.sqrt(2 * g));
  if (sc === 'qam16') return 0.75 * Qf(Math.sqrt(0.8 * g));
  return NaN;
}
export function theorySer(sc: string, ebn0dB: number) {
  const g = Math.pow(10, ebn0dB / 10), p = Qf(Math.sqrt(2 * g));
  if (sc === 'bpsk') return p;
  if (sc === 'qpsk') return 2 * p - p * p;
  if (sc === 'qam16') { const pa = 1.5 * Qf(Math.sqrt(0.8 * g)); return 1 - (1 - pa) * (1 - pa); }
  return NaN;
}
const pop = (x: number) => { let n = 0; while (x) { n += x & 1; x >>= 1; } return n; };
class Gen { rng: () => number; spare: number | null = null; constructor(seed: number) { this.rng = mulberry(seed); }
  g() { if (this.spare !== null) { const s = this.spare; this.spare = null; return s; } let u = 0; while (u === 0) u = this.rng(); const v = this.rng(), m = Math.sqrt(-2 * Math.log(u)); this.spare = m * Math.sin(TAU * v); return m * Math.cos(TAU * v); } }
const sigmaOf = (sc: string, ebn0dB: number) => Math.sqrt(1 / (2 * Math.max(1, bitsPer(sc)) * Math.pow(10, ebn0dB / 10)));
/** Sends one random symbol through an AWGN channel and decides it (nearest point). */
function oneSymbol(g: Gen, pts: Pt[], sigma: number, out: { tx: number; rx: number; ni: number; nq: number; ri: number; rq: number }) {
  const tx = Math.min(pts.length - 1, Math.floor(g.rng() * pts.length)), ni = sigma * g.g(), nq = sigma * g.g(), ri = pts[tx].i + ni, rq = pts[tx].q + nq;
  let best = 0, bd = Infinity; for (let j = 0; j < pts.length; j++) { const d = (ri - pts[j].i) ** 2 + (rq - pts[j].q) ** 2; if (d < bd) { bd = d; best = j; } }
  out.tx = tx; out.rx = best; out.ni = ni; out.nq = nq; out.ri = ri; out.rq = rq;
}
/** Monte-Carlo run used by the logic test: returns symbol and bit error counts. */
export function simulateDigital(sc: string, ebn0dB: number, nSym: number, seed: number) {
  const g = new Gen(seed), pts = constellation(sc), sg = sigmaOf(sc, ebn0dB), o = { tx: 0, rx: 0, ni: 0, nq: 0, ri: 0, rq: 0 };
  let se = 0, be = 0; for (let n = 0; n < nSym; n++) { oneSymbol(g, pts, sg, o); if (o.rx !== o.tx) { se++; be += pop(o.rx ^ o.tx); } }
  return { symErr: se, bitErr: be, ser: se / nSym, ber: be / (nSym * bitsPer(sc)) };
}
/** Single-sided amplitude spectrum by a direct DFT (N = 2048 samples, fs = 102.4 kHz, 20 ms window: all tones in a 100 Hz grid are bin-centred). */
export const SPEC_N = 2048, SPEC_FS = 102400;
const COS = new Float64Array(SPEC_N), SIN = new Float64Array(SPEC_N);
for (let i = 0; i < SPEC_N; i++) { COS[i] = Math.cos((TAU * i) / SPEC_N); SIN[i] = Math.sin((TAU * i) / SPEC_N); }
export function dftAmplitude(x: Float64Array | number[], kMax: number) {
  const N = SPEC_N, out = new Float64Array(kMax + 1);
  for (let k = 0; k <= kMax; k++) { let re = 0, im = 0; for (let n = 0; n < N; n++) { const j = (k * n) & (N - 1); re += x[n] * COS[j]; im -= x[n] * SIN[j]; } out[k] = (k === 0 ? 1 : 2) * Math.hypot(re, im) / N; }
  return out;
}
export const SPEC_DF = SPEC_FS / SPEC_N; // 50 Hz per bin
const hz = (kHz: number) => Math.round(kHz * 10) * 100;
export function modSignal(sc: 'am' | 'fm', fcK: number, fmK: number, m: number, dfK: number, t: number) {
  const fc = hz(fcK), fm = hz(fmK);
  if (sc === 'am') return (1 + m * Math.cos(TAU * fm * t)) * Math.cos(TAU * fc * t);
  return Math.cos(TAU * fc * t + (dfK / fmK) * Math.sin(TAU * fm * t));
}
export function modSpectrum(sc: 'am' | 'fm', fcK: number, fmK: number, m: number, dfK: number) {
  const x = new Float64Array(SPEC_N); for (let n = 0; n < SPEC_N; n++) x[n] = modSignal(sc, fcK, fmK, m, dfK, n / SPEC_FS);
  return dftAmplitude(x, Math.min(SPEC_N / 2 - 1, Math.ceil((fcK * 1000 + 22000) / SPEC_DF)));
}
/** Bessel function J_n(x) by trapezoid integration of (1/pi) * int_0^pi cos(n t - x sin t) dt. */
export function besselJ(n: number, x: number) { let s = 0; const M = 400; for (let i = 0; i <= M; i++) { const t = (Math.PI * i) / M, w = i === 0 || i === M ? 0.5 : 1; s += w * Math.cos(n * t - x * Math.sin(t)); } return s / M; }

interface Mod {
  t: number; seed: number; gen: Gen; key: string; steps: number; n: number; symErr: number; bitErr: number;
  cloud: Float32Array; cloudErr: Uint8Array; cn: number; stream: { tx: number; rx: number; ri: number; rq: number }[];
  spec: Float64Array | null; specKey: string; o: { tx: number; rx: number; ni: number; nq: number; ri: number; rq: number };
}
const CLOUD = 700, STREAM = 13, PER_STEP = 40;
function modBuild(seed: number): Mod { return { t: 0, seed, gen: new Gen(seed), key: '', steps: 0, n: 0, symErr: 0, bitErr: 0, cloud: new Float32Array(CLOUD * 2), cloudErr: new Uint8Array(CLOUD), cn: 0, stream: [], spec: null, specKey: '', o: { tx: 0, rx: 0, ni: 0, nq: 0, ri: 0, rq: 0 } }; }
function ensureSpec(s: Mod, v: Values) {
  const sc = str(v, 'scheme'); if (sc !== 'am' && sc !== 'fm') return;
  const key = [sc, num(v, 'fc'), num(v, 'fm'), num(v, 'm'), num(v, 'df')].join('|');
  if (key !== s.specKey || !s.spec) { s.spec = modSpectrum(sc, num(v, 'fc'), num(v, 'fm'), num(v, 'm'), num(v, 'df')); s.specKey = key; }
}
function drawBits(c: Ctx, label: string, x: number, y: number, ok: boolean, fs: number) { text(c, label, x, y, ok ? C.green : C.red, fs, 'center', 'alphabetic', true); }

export const modulation = defineSim<Mod>({
  id: 'modulation_am_fm_qam', title: 'Modulation Lab: AM, FM, BPSK, QPSK and 16-QAM with Spectrum, Constellation and BER',
  ...meta('Electronics', 'Intermediate', 'Communication Systems', 'Modulation', 'AM and FM spectra, Carson bandwidth, digital constellations, AWGN and bit-error rate', UG_ENG),
  covers: ['Amplitude modulation', 'Frequency modulation', 'Carson bandwidth', 'Modulation index', 'BPSK', 'QPSK', '16-QAM', 'Constellation diagram', 'Bit error rate', 'AWGN channel', 'Gray coding', 'Spectrum of modulated signals'],
  tags: ['communication engineering', 'GATE EC', 'analog communication', 'digital communication', 'sidebands', 'Eb/N0', 'Q function', 'Bessel', 'overmodulation', 'PSK QAM', 'B.Tech ECE'],
  learningObjectives: ['Measure AM sidebands (m/2 of the carrier) and FM sideband lines from a real DFT, and compare FM bandwidth with Carson’s rule 2(Δf+fm).', 'Recognise AM overmodulation (m > 1) as an envelope that crosses zero.', 'Relate Eb/N0 to the scatter around Gray-coded constellation points and to measured vs. theoretical symbol and bit error rates.'],
  assumptions: ['Normalised units: carrier amplitude 1 and Es = 1 for the digital constellations; the channel is AWGN with perfect timing, phase and amplitude recovery (coherent, nearest-point decisions).', 'Spectra use a 20 ms window so every tone is bin-centred (100 Hz grid); BER theory: Q(√(2Eb/N0)) for BPSK/QPSK, ≈ ¾Q(√(0.8Eb/N0)) for Gray 16-QAM.'],
  blurb: 'Pick a scheme: for AM/FM watch the message, modulated waveform and DFT spectrum with sidebands; for BPSK/QPSK/16-QAM stream random bits through noise and watch the constellation cloud, errors and the BER curve.',
  hint: 'AM: s = [1 + m cos ωm t] cos ωc t, sidebands at fc ± fm with amplitude m/2, BW = 2fm, overmodulation when m > 1. FM: s = cos(ωc t + β sin ωm t), β = Δf/fm, lines J_n(β) at fc ± n fm, Carson BW ≈ 2(Δf+fm). Digital: Gray-coded points, σ² = N0/2 per dimension, BER_QPSK = Q(√(2Eb/N0)).',
  params: [
    { kind: 'select', id: 'scheme', label: 'Modulation scheme', value: 'am', options: [{ value: 'am', label: 'AM (DSB with carrier)' }, { value: 'fm', label: 'FM' }, { value: 'bpsk', label: 'BPSK' }, { value: 'qpsk', label: 'QPSK' }, { value: 'qam16', label: '16-QAM (Gray)' }] },
    { kind: 'number', id: 'm', label: 'AM modulation index m', min: 0, max: 2, step: 0.05, value: 0.6, digits: 2 },
    { kind: 'number', id: 'fm', label: 'Message frequency fm', min: 0.5, max: 3, step: 0.1, value: 1, unit: 'kHz', digits: 1 },
    { kind: 'number', id: 'fc', label: 'Carrier frequency fc', min: 8, max: 24, step: 0.5, value: 12, unit: 'kHz', digits: 1 },
    { kind: 'number', id: 'df', label: 'FM peak deviation Δf', min: 0.5, max: 6, step: 0.1, value: 3, unit: 'kHz', digits: 1 },
    { kind: 'number', id: 'snr', label: 'Eb/N0 (digital schemes)', min: 0, max: 20, step: 0.5, value: 8, unit: 'dB', digits: 1 },
  ],
  actions: [{ id: 'restart', label: 'New random bits / restart count' }],
  dt: 1 / 60, previewSeconds: 2,
  init() { return modBuild(2024); },
  action(s) { const seed = s.seed + 1, n = modBuild(seed); Object.assign(s, n); },
  step(s, v, dt) {
    s.t += dt; const sc = str(v, 'scheme'); ensureSpec(s, v);
    if (bitsPer(sc) === 0) return;
    const key = sc + '|' + num(v, 'snr');
    if (key !== s.key) { s.key = key; s.n = 0; s.symErr = 0; s.bitErr = 0; s.cn = 0; s.stream = []; }
    const pts = constellation(sc), sg = sigmaOf(sc, num(v, 'snr')), o = s.o;
    for (let j = 0; j < PER_STEP; j++) {
      oneSymbol(s.gen, pts, sg, o); s.n++; const e = o.rx !== o.tx; if (e) { s.symErr++; s.bitErr += pop(o.rx ^ o.tx); }
      const k = s.cn % CLOUD; s.cloud[2 * k] = o.ri; s.cloud[2 * k + 1] = o.rq; s.cloudErr[k] = e ? 1 : 0; s.cn++;
    }
    s.steps++;
    if (s.steps % 10 === 0) { s.stream.push({ tx: o.tx, rx: o.rx, ri: o.ri, rq: o.rq }); if (s.stream.length > STREAM) s.stream.shift(); }
  },
  draw(c, s, v, w, h) {
    bg(c, w, h); const sc = str(v, 'scheme'), g = 8;
    if (sc === 'am' || sc === 'fm') {
      ensureSpec(s, v);
      const m = num(v, 'm'), fmK = num(v, 'fm'), fcK = num(v, 'fc'), dfK = num(v, 'df'), beta = dfK / fmK, wide = w >= 600;
      let Pm: Rect, Pt: Rect, Ps: Rect;
      if (wide) { const lw = Math.round(w * 0.58), rw = w - lw - 3 * g, h1 = Math.round((h - 3 * g) * 0.34); Pm = R(g, g, lw, h1); Pt = R(g, 2 * g + h1, lw, h - 3 * g - h1); Ps = R(lw + 2 * g, g, rw, h - 2 * g); }
      else { const hh = (h - 4 * g); const h1 = Math.round(hh * 0.22), h2 = Math.round(hh * 0.38); Pm = R(g, g, w - 2 * g, h1); Pt = R(g, 2 * g + h1, w - 2 * g, h2); Ps = R(g, 3 * g + h1 + h2, w - 2 * g, hh - h1 - h2); }
      const W = 3 / fmK, t0 = (s.t * 0.4) / fmK, cycles = W * fcK, nP = clamp(Math.round(cycles * 14), 240, 1800);
      const tt: number[] = [], mm: number[] = [], yy: number[] = [], env: number[] = [];
      for (let n = 0; n <= nP; n++) { const t = t0 + (W * n) / nP; tt.push(t); mm.push(Math.cos(TAU * fmK * t)); yy.push(modSignal(sc, fcK, fmK, m, dfK, t * 1e-3)); env.push(1 + m * Math.cos(TAU * fmK * t)); }
      const mM = plot(c, Pm, [t0, t0 + W], [-1.2, 1.2], { title: 'Message m(t)', xlabel: Pm.h > 70 ? 'time (ms)' : undefined, zeroAxis: true });
      c.save(); clipPlot(c, Pm); polyline(c, tt.map((t, i) => [mM.X(t), mM.Y(mm[i])] as [number, number]), C.green, 2); c.restore();
      const ym = sc === 'am' ? 1 + Math.min(m, 2) + 0.15 : 1.25, over = sc === 'am' && m > 1;
      const mT = plot(c, Pt, [t0, t0 + W], [-ym, ym], { title: sc === 'am' ? `AM waveform (m = ${fmt(m, 2)})${over ? ' – OVERMODULATED' : ''}` : `FM waveform (Δf = ${fmt(dfK, 1)} kHz, β = ${fmt(beta, 2)})`, xlabel: 'time (ms)', zeroAxis: true });
      c.save(); clipPlot(c, Pt);
      if (sc === 'am') { polyline(c, tt.map((t, i) => [mT.X(t), mT.Y(env[i])] as [number, number]), over ? C.red : C.amber, 1.4, [5, 4]); polyline(c, tt.map((t, i) => [mT.X(t), mT.Y(-env[i])] as [number, number]), over ? C.red : C.amber, 1.4, [5, 4]); }
      polyline(c, tt.map((t, i) => [mT.X(t), mT.Y(yy[i])] as [number, number]), over ? C.red : C.cyan, 1.4); c.restore();
      if (over) text(c, 'm > 1: envelope crosses zero, phase reversals, envelope detector distorts', Pt.x + Pt.w / 2, Pt.y + Pt.h - 30, C.red, Pt.w < 300 ? 8 : 10, 'center', 'alphabetic', true);
      // spectrum
      const bw = sc === 'am' ? 2 * fmK : 2 * (dfK + fmK), S = Math.max(sc === 'am' ? 4 * fmK : 0.75 * bw + 2 * fmK, 3 * fmK), f0 = Math.max(0, fcK - S), f1 = fcK + S;
      const spec = s.spec as Float64Array, yTop = 1.15;
      const mS = plot(c, Ps, [f0, f1], [0, yTop], { title: `Spectrum (DFT, single-sided amplitude)`, xlabel: 'frequency (kHz)', ylabel: 'amplitude' });
      c.save(); clipPlot(c, Ps);
      const x0 = mS.X(Math.max(f0, fcK - bw / 2)), x1 = mS.X(Math.min(f1, fcK + bw / 2)); c.fillStyle = 'rgba(34,211,238,0.12)'; c.fillRect(x0, Ps.y + 20, Math.max(0, x1 - x0), Math.max(1, Ps.h - 46));
      const kLo = Math.max(0, Math.floor((f0 * 1000) / SPEC_DF)), kHi = Math.min(spec.length - 1, Math.ceil((f1 * 1000) / SPEC_DF));
      for (let k = kLo; k <= kHi; k++) { const a = spec[k], x = mS.X((k * SPEC_DF) / 1000); if (a > 1e-3) { line(c, x, mS.Y(0), x, mS.Y(Math.min(a, yTop)), C.cyan, 2); } }
      if (sc === 'am') { [[fcK, 1], [fcK - fmK, m / 2], [fcK + fmK, m / 2]].forEach(([f, a]) => circle(c, mS.X(f), mS.Y(a), 4, undefined, C.amber, 1.5)); }
      else for (let n = -8; n <= 8; n++) { const a = Math.abs(besselJ(n, beta)), f = fcK + n * fmK; if (f >= 0 && a > 0.01) circle(c, mS.X(f), mS.Y(a), 4, undefined, C.amber, 1.5); }
      c.restore();
      text(c, `${sc === 'am' ? 'AM BW = 2fm' : 'Carson BW = 2(Δf+fm)'} = ${fmt(bw, 1)} kHz (shaded)`, Ps.x + Ps.w - 8, Ps.y + 13, C.cyan, Ps.w < 280 ? 8 : 10, 'right');
      if (Ps.h > 90) text(c, '○ theory   | DFT line', Ps.x + 40, Ps.y + Ps.h - 30, C.amber, 9);
      return;
    }
    // ---------------- digital
    const pts = constellation(sc), k = bitsPer(sc), compact = w < 580 || h < 340;
    let Pc: Rect, Pw: Rect, Pb: Rect;
    if (compact) { const h1 = Math.round((h - 3 * g) * 0.62), hw = (w - 3 * g) / 2; Pc = R(g, g, hw, h1); Pb = R(2 * g + hw, g, hw, h1); Pw = R(g, 2 * g + h1, w - 2 * g, h - 3 * g - h1); }
    else { const side = Math.min(h - 2 * g, Math.round(w * 0.42)), rw = w - side - 3 * g, hh = (h - 3 * g) / 2; Pc = R(g, g, side, h - 2 * g); Pw = R(side + 2 * g, g, rw, hh); Pb = R(side + 2 * g, 2 * g + hh, rw, hh); }
    const fs = Pc.w < 240 ? 8 : 10;
    // constellation
    panel(c, Pc); text(c, `${sc === 'qam16' ? '16-QAM' : sc.toUpperCase()} constellation (Gray labels)`, Pc.x + 8, Pc.y + 13, C.text, fs + 1, 'left', 'alphabetic', true);
    const ar = Math.max(20, Math.min(Pc.w - 20, Pc.h - 34)), cx = Pc.x + Pc.w / 2, cy = Pc.y + 22 + (Pc.h - 26) / 2, sc2 = ar / 2 / 1.5;
    c.save(); c.beginPath(); c.rect(Pc.x + 1, Pc.y + 18, Pc.w - 2, Pc.h - 19); c.clip();
    line(c, cx - ar / 2, cy, cx + ar / 2, cy, C.axis, 1); line(c, cx, cy - ar / 2, cx, cy + ar / 2, C.axis, 1); text(c, 'I', cx + ar / 2 - 2, cy - 4, C.dim, 9, 'right'); text(c, 'Q', cx + 4, cy - ar / 2 + 9, C.dim, 9);
    if (sc === 'qam16') for (const t of [-2, 2]) { const d = (t / Math.sqrt(10)) * sc2; line(c, cx + d, cy - ar / 2, cx + d, cy + ar / 2, C.grid, 1, [3, 3]); line(c, cx - ar / 2, cy - d, cx + ar / 2, cy - d, C.grid, 1, [3, 3]); }
    const nShow = Math.min(s.cn, CLOUD);
    for (let j = 0; j < nShow; j++) { const px = cx + s.cloud[2 * j] * sc2, py = cy - s.cloud[2 * j + 1] * sc2; c.fillStyle = s.cloudErr[j] ? 'rgba(248,113,113,0.85)' : 'rgba(96,165,250,0.40)'; c.fillRect(px - 1.2, py - 1.2, 2.4, 2.4); }
    for (const p of pts) { const px = cx + p.i * sc2, py = cy - p.q * sc2; circle(c, px, py, 4, C.amber, C.white, 1); if (Pc.w > 210 && (sc !== 'qam16' || Pc.w > 280)) text(c, p.label, px, py - 7, C.white, fs - 1, 'center'); }
    c.restore();
    // I/Q waveform
    panel(c, Pw); text(c, 'Baseband I (green) / Q (cyan): ideal levels, received samples, decisions', Pw.x + 8, Pw.y + 13, C.text, fs, 'left', 'alphabetic', true);
    const st = s.stream, frac = (s.steps % 10) / 10, area = { x: Pw.x + 34, y: Pw.y + 22, w: Math.max(20, Pw.w - 42), h: Math.max(20, Pw.h - 42) }, slot = area.w / (STREAM - 1), amp = 1.5;
    const yI = (a: number) => area.y + area.h / 2 - (a / amp) * (area.h / 2);
    c.save(); c.beginPath(); c.rect(area.x, area.y - 2, area.w, area.h + 22); c.clip();
    line(c, area.x, yI(0), area.x + area.w, yI(0), C.grid, 1, [3, 3]);
    const x0 = area.x + area.w - (st.length - 1 + frac) * slot;
    const qs: [number, string, string][] = [[0, C.green, 'i'], [1, C.cyan, 'q']];
    for (const [ch, col] of qs) {
      if (ch === 1 && sc === 'bpsk') continue;
      const lines: [number, number][] = [];
      st.forEach((e, j) => { const xa = x0 + j * slot - slot / 2, xb = x0 + j * slot + slot / 2, lv = ch === 0 ? pts[e.tx].i : pts[e.tx].q; lines.push([xa, yI(lv)], [xb, yI(lv)]); });
      polyline(c, lines, col, 2);
      st.forEach((e, j) => { const x = x0 + j * slot, y = yI(ch === 0 ? e.ri : e.rq); circle(c, x, y, 2.5, e.tx === e.rx ? C.white : C.red); });
    }
    st.forEach((e, j) => { const x = x0 + j * slot; line(c, x - slot / 2, area.y, x - slot / 2, area.y + area.h, C.grid, 1); if (slot > 22) drawBits(c, pts[e.rx].label, x, area.y + area.h + 12, e.tx === e.rx, fs - 1); });
    c.restore();
    text(c, `${fmt(Math.pow(10, num(v, 'snr') / 10) * k, 1)} Es/N0`, Pw.x + Pw.w - 8, Pw.y + 13, C.dim, fs - 1, 'right');
    // BER plot
    const mB = plot(c, Pb, [0, 20], [-6, 0], { title: 'BER vs Eb/N0 (log10)', xlabel: 'Eb/N0 (dB)', ylabel: 'log10 BER', ystep: Pb.h < 130 ? 2 : 1, xstep: 5 });
    c.save(); clipPlot(c, Pb);
    const curve = (name: string, col: string, wd: number, dash?: number[]) => { const a: [number, number][] = []; for (let i = 0; i <= 100; i++) { const e = i / 5, b = theoryBer(name, e); a.push([mB.X(e), mB.Y(clamp(Math.log10(Math.max(b, 1e-12)), -6, 0))]); } polyline(c, a, col, wd, dash); };
    curve('qpsk', 'rgba(96,165,250,0.5)', 1.4, [5, 4]); curve('qam16', 'rgba(251,191,36,0.5)', 1.4, [5, 4]);
    curve(sc, sc === 'qam16' ? C.amber : C.blue, 2.6);
    const snr = num(v, 'snr'); line(c, mB.X(snr), Pb.y + 20, mB.X(snr), Pb.y + Pb.h - 26, C.white, 1, [3, 3]);
    const nb = s.n * k, mber = nb > 0 ? s.bitErr / nb : 0;
    if (nb > 0) { if (s.bitErr > 0) circle(c, mB.X(snr), mB.Y(clamp(Math.log10(mber), -6, 0)), 5, C.green, C.white, 1.3); else circle(c, mB.X(snr), mB.Y(clamp(Math.log10(1 / nb), -6, 0)), 5, undefined, C.green, 1.8); }
    c.restore();
    if (Pb.w > 200) { text(c, 'BPSK/QPSK', mB.X(11.2), mB.Y(-4.1), C.blue, 9); text(c, '16-QAM', mB.X(14), mB.Y(-2.2), C.amber, 9); }
  },
  readouts(s, v) {
    const sc = str(v, 'scheme');
    if (sc === 'am') {
      ensureSpec(s, v); const m = num(v, 'm'), kc = Math.round(hz(num(v, 'fc')) / SPEC_DF), kf = Math.round(hz(num(v, 'fm')) / SPEC_DF), sp = s.spec as Float64Array;
      return [{ label: 'Carrier amplitude (DFT)', value: sp[kc], digits: 4 }, { label: 'Sideband amplitude (DFT, fc ± fm)', value: sp[kc + kf], digits: 4 }, { label: 'Sideband theory m/2', value: m / 2, digits: 4 }, { label: 'Bandwidth 2·fm', value: 2 * num(v, 'fm'), unit: 'kHz', digits: 1 }, { label: 'Sideband power / total η = m²/(2+m²)', value: (m * m) / (2 + m * m) * 100, unit: '%', digits: 1 }, { label: 'Peak / trough envelope', value: `${fmt(1 + m, 2)} / ${fmt(1 - m, 2)}` }, { label: 'Overmodulation', value: m > 1 ? 'YES (m > 1)' : m === 1 ? 'critical (m = 1)' : 'no' }];
    }
    if (sc === 'fm') {
      ensureSpec(s, v); const fmK = num(v, 'fm'), dfK = num(v, 'df'), beta = dfK / fmK, kc = Math.round(hz(num(v, 'fc')) / SPEC_DF), kf = Math.round(hz(fmK) / SPEC_DF), sp = s.spec as Float64Array;
      return [{ label: 'Modulation index β = Δf/fm', value: beta, digits: 3 }, { label: 'Carrier line (DFT) |J0(β)|', value: sp[kc], digits: 4 }, { label: 'Theory |J0(β)|', value: Math.abs(besselJ(0, beta)), digits: 4 }, { label: 'First sideband (DFT)', value: sp[kc + kf], digits: 4 }, { label: 'Theory |J1(β)|', value: Math.abs(besselJ(1, beta)), digits: 4 }, { label: 'Carson bandwidth 2(Δf+fm)', value: 2 * (dfK + fmK), unit: 'kHz', digits: 2 }, { label: 'Band type', value: beta < 0.5 ? 'narrowband (β < 0.5)' : 'wideband' }];
    }
    const snr = num(v, 'snr'), k = bitsPer(sc), nb = s.n * k;
    return [{ label: 'Bits per symbol', value: k, digits: 0 }, { label: 'Eb/N0', value: snr, unit: 'dB', digits: 1 }, { label: 'Es/N0', value: snr + 10 * Math.log10(k), unit: 'dB', digits: 2 }, { label: 'Noise σ per axis (Es = 1)', value: sigmaOf(sc, snr), digits: 4 }, { label: 'Symbols sent', value: s.n, digits: 0 }, { label: 'Symbol errors', value: s.symErr, digits: 0 }, { label: 'SER measured', value: s.n > 0 ? s.symErr / s.n : 0, digits: 5 }, { label: 'SER theory', value: theorySer(sc, snr), digits: 5 }, { label: 'BER measured', value: nb > 0 ? s.bitErr / nb : 0, digits: 5 }, { label: 'BER theory', value: theoryBer(sc, snr), digits: 5 }];
  },
  equations(s, v) {
    const sc = str(v, 'scheme');
    if (sc === 'am') { const m = num(v, 'm'); return [`s(t)=A_c\\left[1+m\\cos(2\\pi f_mt)\\right]\\cos(2\\pi f_ct),\\ m=${fmt(m, 2)}`, `s(t)=A_c\\cos\\omega_ct+\\tfrac{mA_c}{2}\\cos(\\omega_c\\pm\\omega_m)t\\Rightarrow \\text{sidebands } ${fmt(m / 2, 3)}A_c,\\ BW=2f_m=${fmt(2 * num(v, 'fm'), 1)}\\ \\mathrm{kHz}`, `\\eta=\\dfrac{m^2}{2+m^2}=${fmt((m * m) / (2 + m * m) * 100, 1)}\\%\\quad(m\\le1\\ \\text{required for envelope detection})`]; }
    if (sc === 'fm') { const b = num(v, 'df') / num(v, 'fm'); return [`s(t)=A_c\\cos\\left(2\\pi f_ct+\\beta\\sin2\\pi f_mt\\right),\\ \\beta=\\dfrac{\\Delta f}{f_m}=${fmt(b, 2)}`, `s(t)=A_c\\sum_{n}J_n(\\beta)\\cos\\left[2\\pi(f_c+nf_m)t\\right],\\ J_0(\\beta)=${fmt(besselJ(0, b), 3)}`, `BW_{Carson}\\approx2(\\Delta f+f_m)=${fmt(2 * (num(v, 'df') + num(v, 'fm')), 1)}\\ \\mathrm{kHz}`]; }
    const snr = num(v, 'snr'), nm = sc === 'qam16' ? '\\tfrac34 Q\\!\\left(\\sqrt{0.8E_b/N_0}\\right)' : 'Q\\!\\left(\\sqrt{2E_b/N_0}\\right)';
    return [`\\mathrm{BER}\\approx ${nm}=${fmt(theoryBer(sc, snr), 6)}\\ \\text{at }E_b/N_0=${fmt(snr, 1)}\\ \\mathrm{dB}`, `\\sigma^2=\\dfrac{N_0}{2},\\ \\sigma=${fmt(sigmaOf(sc, snr), 4)}\\ (E_s=1)\\quad \\mathrm{SER}_{theory}=${fmt(theorySer(sc, snr), 6)}`, `\\mathrm{SER}_{meas}=\\dfrac{${s.symErr}}{${s.n}}=${fmt(s.n > 0 ? s.symErr / s.n : 0, 6)}`];
  },
});

export const _gapElectronicsHelpers = { fin };
