/* ------------------------------------------------------------------ */
/*  Physics gap-fillers: Faraday induction (magnet through a coil),     */
/*  the photoelectric effect, and special relativity (light clock,      */
/*  Lorentz transformation, Minkowski spacetime diagram).               */
/*  Pure model functions are exported so they can be verified apart     */
/*  from the drawing code.                                              */
/* ------------------------------------------------------------------ */
import { defineSim, num, str, bool, SCHOOL_11_12, UG_SCI } from './types';
import type { Values, EducationLevel } from './types';
import { C, TAU, clamp, fmt, line, plot, polyline, text, circle, arrow, panel, wavelengthToRgb } from './draw';
import type { Ctx, Rect } from './draw';
import { meta, mulberry } from './univ_util';

const bg = (c: Ctx, w: number, h: number) => { c.fillStyle = C.bg; c.fillRect(0, 0, w, h); };
const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w: Math.max(30, w), h: Math.max(30, h) });
const LV: EducationLevel[] = [...SCHOOL_11_12, ...UG_SCI, 'M.Sc'];
const clipPlot = (c: Ctx, r: Rect) => { c.beginPath(); c.rect(r.x + 34, r.y + 20, Math.max(1, r.w - 42), Math.max(1, r.h - 46)); c.clip(); };
/** Scene on top, two graphs side by side underneath. */
function lay3(w: number, h: number) {
  const g = 8, h1 = Math.round((h - 3 * g) * 0.5), hw = (w - 3 * g) / 2;
  return { A: R(g, g, w - 2 * g, h1), B: R(g, 2 * g + h1, hw, h - 3 * g - h1), G: R(2 * g + hw, 2 * g + h1, hw, h - 3 * g - h1) };
}

/* ================================================================== */
/*  1. Faraday induction: bar magnet (point dipole) through a coil      */
/* ================================================================== */
const MU0 = 4e-7 * Math.PI;
export interface FarP { v: number; N: number; m: number; a: number; R: number; slow: number }
/** Flux through ONE turn of radius a from a point dipole m on the axis at distance x: mu0 m a^2 / (2 (a^2 + x^2)^(3/2)) (Wb). */
export const dipFlux = (x: number, a: number, m: number) => (MU0 * m * a * a) / (2 * Math.pow(a * a + x * x, 1.5));
/** EMF = -N dPhi/dt with dx/dt = +v (magnet moving in +x towards and past the coil at x = 0): 3 N mu0 m a^2 x v / (2 (a^2+x^2)^(5/2)) (V). */
export const dipEmf = (x: number, p: FarP) => (3 * p.N * MU0 * p.m * p.a * p.a * x * p.v) / (2 * Math.pow(p.a * p.a + x * x, 2.5));
/** Peak |EMF| occurs at |x| = a/2. */
export const dipPeakEmf = (p: FarP) => Math.abs(dipEmf(p.a / 2, p));
const farPar = (v: Values): FarP => ({ v: num(v, 'v'), N: num(v, 'N'), m: num(v, 'm') * (bool(v, 'flip') ? -1 : 1), a: num(v, 'a') / 100, R: num(v, 'R'), slow: num(v, 'slow') });

interface FarS { xn: number; E: number; passes: number }
const farL = (p: FarP) => 5 * p.a;
const farStatus = (s: FarS, p: FarP) => { const L = farL(p), x = s.xn * L, flux = p.N * dipFlux(x, p.a, p.m), emf = dipEmf(x, p), I = emf / Math.max(p.R, 1e-9); return { L, x, flux, emf, I, P: emf * I, F: p.v > 1e-9 ? (emf * emf) / (Math.max(p.R, 1e-9) * p.v) : 0 }; };

export const faradayInduction = defineSim<FarS>({
  id: 'faraday_induction', title: 'Faraday’s Law and Lenz’s Law: Magnet Passing Through a Coil',
  ...meta('Physics', 'Intermediate', 'Electromagnetism', 'Electromagnetic induction', 'Flux linkage, induced EMF, Lenz’s law and magnetic braking', LV),
  covers: ['Faraday’s law of electromagnetic induction', 'Lenz’s law', 'Magnetic flux', 'Induced EMF', 'Flux linkage', 'Eddy-current style magnetic braking', 'Energy conservation in induction'],
  tags: ['Faraday', 'Lenz', 'induced emf', 'magnetic flux', 'coil and magnet', 'CBSE class 12', 'JEE', 'NEET', 'B.Sc physics', 'EM induction', 'galvanometer'],
  learningObjectives: ['Relate the sign and size of the induced EMF to the rate of change of flux linkage, not to the flux itself.', 'Use Lenz’s law to predict the induced pole of the coil face while the magnet approaches and leaves.', 'See how speed, number of turns and magnet strength scale the EMF, and that the net charge for a complete pass is zero.'],
  assumptions: ['The magnet is a point dipole on the coil axis and the coil is N coincident thin turns of one radius; the flux is the exact on-axis dipole result.', 'Only the resistance R of the circuit is included; the coil’s own back-EMF (self-inductance) and the field of the induced current acting back on the magnet are not fed back into the motion, so v is constant.'],
  blurb: 'A magnet moves at constant speed through a coil (shown in slow motion). Watch the flux linkage rise and fall, the EMF swing positive then negative, and the coil face switch pole to oppose the change.',
  hint: 'Flux per turn Φ = μ0 m a² / [2(a²+x²)^{3/2}]; EMF = −N dΦ/dt = 3Nμ0 m a² x v / [2(a²+x²)^{5/2}], peak at |x| = a/2. I = EMF/R, dissipated power EMF²/R equals the work rate of the magnetic drag force F·v. Net charge over a whole pass is zero because Φ returns to ~0. Time axis is real time; the animation is stretched by the slow-motion factor.',
  params: [
    { kind: 'number', id: 'v', label: 'Magnet speed v', min: 0.1, max: 5, step: 0.1, value: 1, unit: 'm/s', digits: 1 },
    { kind: 'number', id: 'N', label: 'Number of turns N', min: 1, max: 500, step: 1, value: 100, digits: 0 },
    { kind: 'number', id: 'm', label: 'Magnet strength (dipole moment m)', min: 0.5, max: 20, step: 0.5, value: 4, unit: 'A·m²', digits: 1 },
    { kind: 'number', id: 'a', label: 'Coil radius a', min: 1, max: 6, step: 0.5, value: 3, unit: 'cm', digits: 1 },
    { kind: 'number', id: 'R', label: 'Circuit resistance R', min: 1, max: 100, step: 1, value: 20, unit: 'Ω', digits: 0 },
    { kind: 'number', id: 'slow', label: 'Slow-motion factor (animation only)', min: 1, max: 100, step: 1, value: 10, digits: 0 },
    { kind: 'toggle', id: 'flip', label: 'Reverse magnet (S pole leads)', value: false },
  ],
  actions: [{ id: 'restart', label: 'Restart magnet from the left' }],
  dt: 1 / 120, previewSeconds: 1.2,
  init() { return { xn: -0.8, E: 0, passes: 0 }; },
  action(s) { s.xn = -1; s.E = 0; s.passes = 0; },
  step(s, v, dt) {
    const p = farPar(v), L = farL(p), dtReal = dt / p.slow, dx = p.v * dtReal;
    const n = clamp(Math.ceil(dx / (0.05 * p.a)), 1, 400), sub = dtReal / n;
    for (let i = 0; i < n; i++) {
      s.xn += (dx / n) / L;
      const e = dipEmf(s.xn * L, p); s.E += (e * e / Math.max(p.R, 1e-9)) * sub;
      if (s.xn > 1) { s.xn = -1; s.E = 0; s.passes++; }
    }
  },
  draw(c, s, v, w, h) {
    bg(c, w, h); const p = farPar(v), st = farStatus(s, p), { A, B, G } = lay3(w, h), L = st.L;
    const small = A.w < 300, fs = small ? 9 : 11;
    const emfPk = Math.max(dipPeakEmf(p), 1e-12), phi0 = Math.max(Math.abs(p.N * dipFlux(0, p.a, p.m)), 1e-15);
    // ---- scene
    panel(c, A); text(c, 'Side view: magnet moves right through the coil', A.x + 8, A.y + 13, C.text, fs, 'left', 'alphabetic', true);
    const cx = A.x + A.w * 0.5, cy = A.y + A.h * 0.56, sc = (A.w * 0.46) / L, hc = Math.min(p.a * sc, A.h * 0.3), X = (x: number) => cx + x * sc;
    c.save(); c.beginPath(); c.rect(A.x + 2, A.y + 18, A.w - 4, A.h - 20); c.clip();
    const mx = X(st.x), mw = Math.max(26, p.a * sc * 1.3), mh = Math.max(8, hc * 0.38), pol = p.m >= 0 ? 1 : -1;
    // dipole field lines r = r0 sin^2(theta) about the magnet centre
    for (const r0 of [1.6, 2.6, 4.0]) for (const sg of [1, -1]) {
      const pts: [number, number][] = [];
      for (let i = 1; i < 40; i++) { const th = (Math.PI * i) / 40, r = r0 * p.a * sc * Math.pow(Math.sin(th), 2); pts.push([mx + pol * r * Math.cos(th), cy + sg * r * Math.sin(th) * 0.9]); }
      polyline(c, pts, 'rgba(96,165,250,0.35)', 1);
    }
    // coil: turns drawn as stacked rings (cross-section: top and bottom wire ends)
    const nvis = Math.min(8, Math.max(1, Math.round(p.N / 20) + 1)), cw = Math.max(8, 5 * nvis);
    c.fillStyle = 'rgba(251,146,60,0.10)'; c.fillRect(cx - cw / 2 - 2, cy - hc, cw + 4, 2 * hc);
    for (let i = 0; i < nvis; i++) { const x = cx - cw / 2 + (cw * (i + 0.5)) / nvis; circle(c, x, cy - hc, 2.6, C.orange); circle(c, x, cy + hc, 2.6, C.orange); line(c, x, cy - hc, x, cy + hc, 'rgba(251,146,60,0.35)', 1); }
    // induced current: positive EMF => anticlockwise seen from +x => out of page at top
    const Ia = Math.abs(st.I), strong = clamp(Ia / (emfPk / Math.max(p.R, 1e-9)), 0, 1);
    if (strong > 0.03) {
      const out = st.I > 0, col = `rgba(244,114,182,${0.4 + 0.6 * strong})`, r = 5 + 2 * strong;
      for (const yy of [cy - hc - 11, cy + hc + 11]) { const top = yy < cy, o = top ? out : !out; circle(c, cx, yy, r, undefined, col, 1.6); if (o) circle(c, cx, yy, 1.8, col); else { line(c, cx - r * 0.6, yy - r * 0.6, cx + r * 0.6, yy + r * 0.6, col, 1.6); line(c, cx - r * 0.6, yy + r * 0.6, cx + r * 0.6, yy - r * 0.6, col, 1.6); } }
      // induced pole of each coil face: induced moment along +x when I > 0 => N face on the right
      const nRight = st.I > 0;
      text(c, nRight ? 'S' : 'N', cx - cw / 2 - 12, cy + 4, nRight ? C.blue : C.red, 12, 'center', 'alphabetic', true);
      text(c, nRight ? 'N' : 'S', cx + cw / 2 + 12, cy + 4, nRight ? C.red : C.blue, 12, 'center', 'alphabetic', true);
    }
    // magnet
    c.fillStyle = pol > 0 ? '#ef4444' : '#3b82f6'; c.fillRect(mx - mw / 2, cy - mh / 2, mw / 2, mh);
    c.fillStyle = pol > 0 ? '#3b82f6' : '#ef4444'; c.fillRect(mx, cy - mh / 2, mw / 2, mh);
    text(c, pol > 0 ? 'N' : 'S', mx - mw / 4, cy + 4, C.white, 11, 'center', 'alphabetic', true); text(c, pol > 0 ? 'S' : 'N', mx + mw / 4, cy + 4, C.white, 11, 'center', 'alphabetic', true);
    arrow(c, mx, cy - mh / 2 - 8, mx + 26, cy - mh / 2 - 8, C.green, 2, 7); text(c, 'v', mx + 31, cy - mh / 2 - 4, C.green, 10);
    c.restore();
    // galvanometer bar
    const gx = A.x + A.w - 96, gy = A.y + 12, gwid = 84;
    if (A.w > 240) { line(c, gx, gy + 14, gx + gwid, gy + 14, C.axis, 1.5); line(c, gx + gwid / 2, gy + 8, gx + gwid / 2, gy + 20, C.axis, 1.5); const nx = gx + gwid / 2 + (gwid / 2) * clamp(st.emf / emfPk, -1, 1); circle(c, nx, gy + 14, 4.5, C.pink, C.white, 1); text(c, 'galvanometer', gx + gwid / 2, gy + 34, C.dim, 9, 'center'); }
    const lens = Math.abs(st.emf) < 0.02 * emfPk ? 'no change of flux: EMF ≈ 0' : (st.x < 0 ? 'approaching: flux ↑' : 'leaving: flux ↓') + (st.I * (st.x < 0 ? 1 : -1) < 0 ? '' : '');
    text(c, lens + (Math.abs(st.emf) >= 0.02 * emfPk ? ` — coil face toward magnet is ${(st.x < 0) === (pol > 0) ? 'N (repels)' : 'S (repels)'}`.replace(/.*/, st.x < 0 ? ' — induced pole repels (opposes approach)' : ' — induced pole attracts (opposes departure)') : ''), A.x + 8, A.y + A.h - 7, C.amber, fs - 1);
    // ---- graphs vs real time
    const tm = (L / p.v) * 1000, nSamp = 160;
    const phiPk = phi0 * 1000;
    const m1 = plot(c, B, [-tm, tm], [-phiPk * 0.08, phiPk * 1.1], { title: 'Flux linkage NΦ vs time', xlabel: 't (ms)', ylabel: 'NΦ (mWb)', zeroAxis: true });
    c.save(); clipPlot(c, B);
    const sgn = pol; const f1: [number, number][] = [], f2: [number, number][] = [];
    for (let i = 0; i <= nSamp; i++) { const x = -L + (2 * L * i) / nSamp; f1.push([m1.X((x / p.v) * 1000), m1.Y(sgn * p.N * dipFlux(x, p.a, Math.abs(p.m)) * 1000 * (pol > 0 ? 1 : 1))]); }
    polyline(c, f1, C.cyan, 2.2); c.restore();
    line(c, m1.X((st.x / p.v) * 1000), B.y + 20, m1.X((st.x / p.v) * 1000), B.y + B.h - 26, C.amber, 1, [3, 3]);
    circle(c, m1.X((st.x / p.v) * 1000), m1.Y(st.flux * 1000), 4.5, C.amber, C.white, 1.2);
    const m2 = plot(c, G, [-tm, tm], [-emfPk * 1.15 * 1000, emfPk * 1.15 * 1000], { title: 'Induced EMF = −N dΦ/dt', xlabel: 't (ms)', ylabel: 'EMF (mV)', zeroAxis: true });
    c.save(); clipPlot(c, G);
    for (let i = 0; i <= nSamp; i++) { const x = -L + (2 * L * i) / nSamp; f2.push([m2.X((x / p.v) * 1000), m2.Y(dipEmf(x, p) * 1000)]); }
    polyline(c, f2, C.pink, 2.2); c.restore();
    line(c, m2.X((st.x / p.v) * 1000), G.y + 20, m2.X((st.x / p.v) * 1000), G.y + G.h - 26, C.amber, 1, [3, 3]);
    circle(c, m2.X((st.x / p.v) * 1000), m2.Y(st.emf * 1000), 4.5, C.amber, C.white, 1.2);
    if (G.w > 200) text(c, 'peak at |x| = a/2', G.x + G.w - 10, G.y + 32, C.dim, 9, 'right');
  },
  readouts(s, v) {
    const p = farPar(v), st = farStatus(s, p), pk = dipPeakEmf(p), L = st.L, q = -(p.N * (dipFlux(st.x, p.a, p.m) - dipFlux(-L, p.a, p.m))) / Math.max(p.R, 1e-9);
    return [
      { label: 'Magnet position x (0 = coil centre)', value: st.x * 100, unit: 'cm', digits: 2 },
      { label: 'Flux linkage NΦ', value: st.flux * 1000, unit: 'mWb', digits: 3 },
      { label: 'Induced EMF', value: st.emf, unit: 'V', digits: 4 },
      { label: 'Induced current I = EMF/R', value: st.I * 1000, unit: 'mA', digits: 3 },
      { label: 'Peak |EMF| (at |x| = a/2)', value: pk, unit: 'V', digits: 4 },
      { label: 'Joule power EMF²/R', value: st.P * 1000, unit: 'mW', digits: 3 },
      { label: 'Magnetic drag on magnet F = EMF²/(R v)', value: st.F * 1000, unit: 'mN', digits: 3 },
      { label: 'Energy dissipated this pass', value: s.E * 1000, unit: 'mJ', digits: 4 },
      { label: 'Charge passed since start of pass', value: q * 1000, unit: 'mC', digits: 4 },
      { label: 'Passes completed', value: s.passes, digits: 0 },
    ];
  },
  equations(s, v) {
    const p = farPar(v), st = farStatus(s, p);
    return [
      `\\Phi_1=\\dfrac{\\mu_0 m a^2}{2\\,(a^2+x^2)^{3/2}},\\qquad N\\Phi=${fmt(st.flux * 1000, 3)}\\ \\mathrm{mWb}`,
      `\\varepsilon=-N\\dfrac{d\\Phi}{dt}=\\dfrac{3N\\mu_0 m a^2\\,x\\,v}{2\\,(a^2+x^2)^{5/2}}=${fmt(st.emf, 4)}\\ \\mathrm{V}`,
      `I=\\dfrac{\\varepsilon}{R}=${fmt(st.I * 1000, 3)}\\ \\mathrm{mA},\\quad P=\\dfrac{\\varepsilon^2}{R}=F_{\\mathrm{drag}}\\,v=${fmt(st.P * 1000, 3)}\\ \\mathrm{mW}`,
      `Q=\\int I\\,dt=-\\dfrac{N\\,\\Delta\\Phi}{R}\\ \\ (\\text{zero over a whole pass})`,
    ];
  },
});

/* ================================================================== */
/*  2. Photoelectric effect                                            */
/* ================================================================== */
export const H_PLANCK = 6.62607015e-34, E_CHG = 1.602176634e-19, C_LIGHT = 299792458, M_E = 9.1093837015e-31;
const H_EV = H_PLANCK / E_CHG; // eV per Hz = 4.1357e-15
export const METALS: Record<string, { name: string; phi: number }> = {
  cs: { name: 'Caesium', phi: 2.14 }, k: { name: 'Potassium', phi: 2.30 }, na: { name: 'Sodium', phi: 2.36 }, ca: { name: 'Calcium', phi: 2.87 },
  al: { name: 'Aluminium', phi: 4.08 }, zn: { name: 'Zinc', phi: 4.30 }, cu: { name: 'Copper', phi: 4.65 }, pt: { name: 'Platinum', phi: 5.65 },
};
const QE = 0.01; // electrons per absorbed photon (typical few %, fixed here)
/** Photon energy in eV for frequency f in units of 1e14 Hz. */
export const photonEv = (f14: number) => H_EV * f14 * 1e14;
/** Maximum kinetic energy of photoelectrons in eV (Einstein): hf - phi, or 0 below threshold. */
export const keMax = (f14: number, phi: number) => Math.max(0, photonEv(f14) - phi);
/** Saturation photocurrent in microamps for light power P (mW): I = QE * P / (E_photon in eV). */
export const satCurrentUA = (pmw: number, f14: number) => (1000 * QE * pmw) / Math.max(photonEv(f14), 1e-9);
/** Current in microamps at collector potential V (volts, relative to emitter). Electron KE distribution P(KE > x) = (1 - x/KEmax)^2. */
export function photoCurrentUA(vApp: number, f14: number, pmw: number, phi: number) {
  const k = keMax(f14, phi); if (k <= 0) return 0;
  const is = satCurrentUA(pmw, f14);
  if (vApp >= 0) return is;
  const r = 1 + vApp / k; return r <= 0 ? 0 : is * r * r;
}
interface PeSel { f: number; P: number; phi: number; name: string; V: number }
const peSel = (v: Values, s?: PeS): PeSel => {
  const m = METALS[str(v, 'metal')] ?? METALS.na, sw = bool(v, 'sweep') && s;
  const V = sw ? 6 * (1 - 4 * Math.abs((((s.t / 16) % 1) + 1) % 1 - 0.5) + 0) * 1 - 0 : num(v, 'V');
  return { f: num(v, 'f'), P: num(v, 'P'), phi: m.phi, name: m.name, V: sw ? clamp(V, -6, 6) : num(v, 'V') };
};
interface Photon { t: number; y: number }
interface Elec { u: number; ke0: number; dir: number; y: number }
interface PeS { t: number; ph: Photon[]; el: Elec[]; acc: number; reach: number; back: number; emitted: number; rnd: () => number }
const peBuild = (): PeS => ({ t: 0, ph: [], el: [], acc: 0, reach: 0, back: 0, emitted: 0, rnd: mulberry(77) });

export const photoelectric = defineSim<PeS>({
  id: 'photoelectric_effect', title: 'Photoelectric Effect: Threshold Frequency, Stopping Potential and Photocurrent',
  ...meta('Physics', 'Intermediate', 'Modern Physics', 'Photoelectric effect', 'Einstein equation, stopping potential and I–V characteristic', LV),
  covers: ['Photoelectric effect', 'Einstein’s photoelectric equation', 'Work function', 'Threshold frequency', 'Stopping potential', 'Photocurrent vs intensity', 'Planck’s constant from KE vs frequency'],
  tags: ['photoelectric effect', 'Einstein', 'work function', 'stopping potential', 'threshold frequency', 'Millikan', 'CBSE class 12', 'JEE', 'NEET', 'dual nature of radiation', 'B.Sc physics'],
  learningObjectives: ['Show that electrons are emitted only when hf exceeds the work function, however intense a low-frequency beam is.', 'Read the stopping potential from the I–V curve and the KE–f line (slope h, intercept −φ).', 'Distinguish the roles of frequency (sets KE_max, V0) and intensity (sets the saturation current).'],
  assumptions: ['Einstein’s equation KEmax = hf − φ with fixed tabulated work functions at 0 K-like conditions; the electron-energy distribution is modelled by P(KE > x) = (1 − x/KEmax)², giving I = Isat(1 − |V|/V0)² for retarding voltages.', 'Quantum efficiency is fixed at 1 % for the current scale; the animation shows one electron per photon so that the effect is visible, and electron speeds are drawn on a convenient scale.'],
  blurb: 'Shine light of chosen frequency and power on a metal cathode. Electrons appear only above the threshold, are driven back by a negative collector voltage, and the KE–f and I–V graphs update live.',
  hint: 'E = hf = 4.1357e-15 eV·s × f. KEmax = hf − φ = eV0. Threshold f0 = φ/h. Intensity changes photon number and the saturation current (I ∝ P/hf at fixed efficiency) but not KEmax or V0. Reverse bias −V0 just stops the fastest electrons. KE–f slope is h (4.136e-15 eV·s), intercept −φ.',
  params: [
    { kind: 'number', id: 'f', label: 'Light frequency f', min: 2, max: 15, step: 0.1, value: 9, unit: '×10¹⁴ Hz', digits: 1 },
    { kind: 'number', id: 'P', label: 'Light power on the cathode (intensity)', min: 0.5, max: 10, step: 0.5, value: 2, unit: 'mW', digits: 1 },
    { kind: 'select', id: 'metal', label: 'Cathode metal', value: 'na', options: Object.keys(METALS).map(k => ({ value: k, label: `${METALS[k].name} (φ = ${METALS[k].phi} eV)` })) },
    { kind: 'number', id: 'V', label: 'Applied collector voltage V (− retards electrons)', min: -6, max: 6, step: 0.1, value: -0.6, unit: 'V', digits: 1 },
    { kind: 'toggle', id: 'sweep', label: 'Auto-sweep V from −6 V to +6 V', value: false },
  ],
  actions: [{ id: 'restart', label: 'Clear electrons and counters' }],
  dt: 1 / 60, previewSeconds: 3,
  init() { return peBuild(); },
  action(s) { Object.assign(s, peBuild()); },
  step(s, v, dt) {
    s.t += dt; const m = peSel(v, s), E = photonEv(m.f), ke = keMax(m.f, m.phi);
    const rate = clamp(3 * m.P * (4 / E), 1.5, 26);
    s.acc += rate * dt;
    while (s.acc >= 1) { s.acc -= 1; if (s.ph.length < 60) s.ph.push({ t: 0, y: 0.15 + 0.7 * s.rnd() }); }
    for (let i = s.ph.length - 1; i >= 0; i--) {
      const q = s.ph[i]; q.t += dt / 0.7;
      if (q.t >= 1) {
        if (ke > 0 && s.el.length < 80) { s.el.push({ u: 0.001, ke0: ke * (1 - Math.sqrt(s.rnd())), dir: 1, y: q.y }); s.emitted++; }
        s.ph.splice(i, 1);
      }
    }
    for (let i = s.el.length - 1; i >= 0; i--) {
      const e = s.el[i], kin = e.ke0 + m.V * e.u;
      if (e.dir > 0 && kin <= 0) e.dir = -1;
      e.u += e.dir * 0.5 * Math.sqrt(Math.max(kin, 0.04)) * dt;
      if (e.u >= 1) { s.reach++; s.el.splice(i, 1); } else if (e.u <= 0) { s.back++; s.el.splice(i, 1); }
    }
  },
  draw(c, s, v, w, h) {
    bg(c, w, h); const m = peSel(v, s), { A, B, G } = lay3(w, h), E = photonEv(m.f), ke = keMax(m.f, m.phi), f0 = m.phi / H_EV / 1e14, lam = (C_LIGHT / (m.f * 1e14)) * 1e9;
    const small = A.w < 300, fs = small ? 9 : 11;
    // ---- scene
    panel(c, A); text(c, `Vacuum photocell: ${m.name}, φ = ${m.phi} eV`, A.x + 8, A.y + 13, C.text, fs, 'left', 'alphabetic', true);
    const tx0 = A.x + 14, tx1 = A.x + A.w - 14, ty0 = A.y + 26, ty1 = A.y + A.h - 34;
    c.strokeStyle = 'rgba(148,163,184,0.45)'; c.lineWidth = 1.5; c.strokeRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
    const ex = tx0 + (tx1 - tx0) * 0.14, cxp = tx0 + (tx1 - tx0) * 0.86, py0 = ty0 + 8, py1 = ty1 - 8, ph = py1 - py0, gap = cxp - ex - 12;
    c.fillStyle = ke > 0 ? '#d97706' : '#64748b'; c.fillRect(ex - 6, py0, 6, ph); c.fillStyle = '#94a3b8'; c.fillRect(cxp, py0, 6, ph);
    text(c, 'emitter', ex - 3, py0 - 2, C.dim, 9, 'center'); text(c, 'collector', cxp + 3, py0 - 2, C.dim, 9, 'center');
    // electric field arrows between plates
    const fa = clamp(Math.abs(m.V) / 6, 0, 1);
    if (fa > 0.02) for (const q of [0.3, 0.5, 0.7]) { const yy = py0 + ph * q, dirR = m.V < 0; arrow(c, dirR ? ex + gap * 0.4 : ex + gap * 0.6, yy, dirR ? ex + gap * 0.6 : ex + gap * 0.4, yy, `rgba(167,139,250,${0.15 + 0.5 * fa})`, 1.2, 5); }
    // photons
    const col = lam < 380 ? C.purple : lam > 780 ? '#b91c1c' : (() => { const k = wavelengthToRgb(lam); return `rgb(${k[0]},${k[1]},${k[2]})`; })();
    const sx = ex + gap * 0.55, sy = ty0 - 2;
    for (const q of s.ph) {
      const hx = ex, hy = py0 + q.y * ph, px = sx + (hx - sx) * q.t, py = sy + (hy - sy) * q.t, ang = Math.atan2(hy - sy, hx - sx), nx = -Math.sin(ang), ny = Math.cos(ang);
      const pts: [number, number][] = [];
      for (let i = 0; i <= 14; i++) { const d = (i / 14 - 0.5) * 26, a = 3.2 * Math.sin(i * 1.3); pts.push([px + Math.cos(ang) * d + nx * a, py + Math.sin(ang) * d + ny * a]); }
      polyline(c, pts, col, 2);
    }
    if (m.f > 0) { arrow(c, sx + 12, sy - 14 < A.y + 16 ? A.y + 18 : sy - 14, sx + 2, sy + 4, col, 1.5, 6); }
    // electrons
    for (const e of s.el) { const x = ex + 6 + e.u * gap, y = py0 + e.y * ph; circle(c, x, y, 3, C.cyan, C.white, 0.8); }
    if (ke <= 0) text(c, `f < f0 (${fmt(f0, 2)}×10¹⁴ Hz): photons absorbed, NO electrons`, (tx0 + tx1) / 2, ty0 + (ty1 - ty0) * 0.5, C.red, fs, 'center', 'alphabetic', true);
    // external circuit: ammeter + battery
    const yb = ty1 + 20, xm = (ex + cxp) / 2;
    line(c, ex - 3, py1, ex - 3, yb, C.axis, 1.2); line(c, cxp + 3, py1, cxp + 3, yb, C.axis, 1.2); line(c, ex - 3, yb, cxp + 3, yb, C.axis, 1.2);
    c.fillStyle = C.panel2; c.fillRect(xm - 36, yb - 9, 72, 18); c.strokeStyle = C.axis; c.strokeRect(xm - 36, yb - 9, 72, 18);
    text(c, `V = ${fmt(m.V, 1)} V`, xm, yb + 4, m.V < 0 ? C.pink : C.green, 10, 'center', 'alphabetic', true);
    const cur = photoCurrentUA(m.V, m.f, m.P, m.phi);
    circle(c, ex + (cxp - ex) * 0.2, yb, 9, C.panel2, C.amber, 1.4); text(c, 'A', ex + (cxp - ex) * 0.2, yb + 3.5, C.amber, 10, 'center', 'alphabetic', true);
    text(c, `${fmt(cur, 2)} µA`, ex + (cxp - ex) * 0.2 + 14, yb + 4, C.amber, 10);
    text(c, `f = ${fmt(m.f, 1)}×10¹⁴ Hz   λ = ${fmt(lam, 0)} nm   hf = ${fmt(E, 2)} eV`, A.x + A.w - 8, A.y + 13, col, fs - 1, 'right');
    // ---- KE vs f
    const fmax = 16, yr: [number, number] = [-6.2, 6.4];
    const m1 = plot(c, B, [0, fmax], yr, { title: 'KEmax vs frequency', xlabel: 'f (×10¹⁴ Hz)', ylabel: 'KE (eV)', zeroAxis: true });
    c.save(); clipPlot(c, B);
    for (const k of Object.keys(METALS)) { const ph0 = METALS[k].phi, fth = ph0 / H_EV / 1e14; polyline(c, [[m1.X(fth), m1.Y(0)], [m1.X(fmax), m1.Y(H_EV * fmax * 1e14 - ph0)]], 'rgba(148,163,184,0.35)', 1); }
    polyline(c, [[m1.X(0), m1.Y(-m.phi)], [m1.X(f0), m1.Y(0)]], 'rgba(251,191,36,0.6)', 1.4, [4, 4]);
    polyline(c, [[m1.X(f0), m1.Y(0)], [m1.X(fmax), m1.Y(H_EV * fmax * 1e14 - m.phi)]], C.amber, 2.4);
    c.restore();
    circle(c, m1.X(f0), m1.Y(0), 4, C.red, C.white, 1);
    circle(c, m1.X(m.f), m1.Y(ke), 5, ke > 0 ? C.cyan : C.red, C.white, 1.3);
    if (B.w > 200) { text(c, `f0 = ${fmt(f0, 2)}`, m1.X(f0) + 4, B.y + B.h - 32, C.red, 9); text(c, '−φ', m1.X(0) + 4, m1.Y(-m.phi) - 2, C.amber, 9); text(c, 'slope = h', m1.X(fmax * 0.62), m1.Y(0.45 * H_EV * fmax * 1e14 * 0.62 - 0.9) + 2, C.dim, 9); }
    // ---- I-V
    const Vr = 6, isat = Math.max(satCurrentUA(m.P, m.f), 1e-6), ytop = isat * 1.3;
    const m2 = plot(c, G, [-Vr, Vr], [0, ytop], { title: 'Photocurrent vs voltage', xlabel: 'V (volts)', ylabel: 'I (µA)' });
    c.save(); clipPlot(c, G);
    const curve = (pm: number, color: string, wd: number, dash?: number[]) => { const pts: [number, number][] = []; for (let i = 0; i <= 120; i++) { const vv = -Vr + (2 * Vr * i) / 120; pts.push([m2.X(vv), m2.Y(photoCurrentUA(vv, m.f, pm, m.phi))]); } polyline(c, pts, color, wd, dash); };
    if (ke > 0) curve(m.P / 2, 'rgba(148,163,184,0.5)', 1.3, [4, 3]);
    curve(m.P, C.cyan, 2.4); c.restore();
    if (ke > 0) { line(c, m2.X(-ke), G.y + 20, m2.X(-ke), G.y + G.h - 26, C.red, 1, [3, 3]); if (G.w > 200) text(c, `−V0 = −${fmt(ke, 2)} V`, m2.X(-ke) + 3, G.y + 32, C.red, 9); }
    circle(c, m2.X(clamp(m.V, -Vr, Vr)), m2.Y(cur), 5, C.amber, C.white, 1.3);
    if (G.w > 200) text(c, ke > 0 ? 'dashed: half the power' : 'no photocurrent', G.x + G.w - 10, G.y + G.h - 32, C.dim, 9, 'right');
  },
  readouts(s, v) {
    const m = peSel(v, s), E = photonEv(m.f), ke = keMax(m.f, m.phi), f0 = m.phi / H_EV;
    return [
      { label: 'Photon energy hf', value: E, unit: 'eV', digits: 3 },
      { label: 'Wavelength λ', value: (C_LIGHT / (m.f * 1e14)) * 1e9, unit: 'nm', digits: 0 },
      { label: 'Work function φ', value: m.phi, unit: 'eV', digits: 2 },
      { label: 'Threshold frequency f0 = φ/h', value: f0 / 1e14, unit: '×10¹⁴ Hz', digits: 3 },
      { label: 'Emission', value: ke > 0 ? 'electrons emitted' : 'none (f below threshold)' },
      { label: 'KEmax = hf − φ', value: ke, unit: 'eV', digits: 3 },
      { label: 'Stopping potential V0', value: ke, unit: 'V', digits: 3 },
      { label: 'Fastest electron speed', value: Math.sqrt((2 * ke * E_CHG) / M_E) / 1e6, unit: '×10⁶ m/s', digits: 3 },
      { label: 'Saturation current', value: ke > 0 ? satCurrentUA(m.P, m.f) : 0, unit: 'µA', digits: 3 },
      { label: 'Applied voltage (live)', value: m.V, unit: 'V', digits: 2 },
      { label: 'Photocurrent at V', value: photoCurrentUA(m.V, m.f, m.P, m.phi), unit: 'µA', digits: 3 },
      { label: 'Electrons reaching collector / turned back', value: `${s.reach} / ${s.back}` },
    ];
  },
  equations(s, v) {
    const m = peSel(v, s), E = photonEv(m.f), ke = keMax(m.f, m.phi);
    return [
      `E=hf=(4.136\\times10^{-15}\\,\\mathrm{eV\\,s})(${fmt(m.f, 1)}\\times10^{14}\\,\\mathrm{Hz})=${fmt(E, 3)}\\ \\mathrm{eV}`,
      ke > 0 ? `KE_{\\max}=hf-\\phi=${fmt(E, 3)}-${fmt(m.phi, 2)}=${fmt(ke, 3)}\\ \\mathrm{eV}=eV_0\\Rightarrow V_0=${fmt(ke, 3)}\\ \\mathrm{V}` : `hf=${fmt(E, 3)}\\ \\mathrm{eV}<\\phi=${fmt(m.phi, 2)}\\ \\mathrm{eV}\\Rightarrow \\text{no emission},\\ f<f_0=\\phi/h`,
      `f_0=\\dfrac{\\phi}{h}=${fmt(m.phi / H_EV / 1e14, 3)}\\times10^{14}\\ \\mathrm{Hz},\\qquad \\dfrac{d\\,KE_{\\max}}{df}=h`,
      `I(V)=I_{\\mathrm{sat}}\\left(1-\\dfrac{|V|}{V_0}\\right)^{2}\\ (-V_0<V<0),\\quad I_{\\mathrm{sat}}\\propto \\dfrac{P}{hf}`,
    ];
  },
});

/* ================================================================== */
/*  3. Special relativity                                              */
/* ================================================================== */
export const gammaOf = (b: number) => 1 / Math.sqrt(1 - b * b);
/** Lorentz transform of an event (x, ct) to a frame moving at +beta: x' = g(x - b ct), ct' = g(ct - b x). */
export const lorentz = (x: number, ct: number, b: number): [number, number] => { const g = gammaOf(b); return [g * (x - b * ct), g * (ct - b * x)]; };
/** Light-clock mirror-to-mirror photon height (0..1) after proper time tau for a clock with round trip 2. */
export const lightClockY = (tau: number) => { const q = ((tau % 2) + 2) % 2; return 1 - Math.abs(1 - q); };
interface RelP { b: number; g: number; L0: number; xE: number; ctE: number; sim: boolean }
const relPar = (v: Values): RelP => { const b = clamp(num(v, 'beta'), 0, 0.995); return { b, g: gammaOf(b), L0: num(v, 'L0'), xE: num(v, 'xE'), ctE: num(v, 'ctE'), sim: bool(v, 'sim') }; };
interface RelS { t: number }

export const specialRelativity = defineSim<RelS>({
  id: 'special_relativity', title: 'Special Relativity: Time Dilation, Length Contraction and the Lorentz Transformation',
  ...meta('Physics', 'Advanced', 'Modern Physics', 'Special relativity', 'Light clock, Lorentz transformation, Minkowski spacetime diagram', LV),
  covers: ['Time dilation', 'Length contraction', 'Lorentz transformation', 'Relativity of simultaneity', 'Minkowski spacetime diagram', 'Light clock', 'Invariant spacetime interval'],
  tags: ['special relativity', 'Einstein', 'Lorentz factor', 'gamma', 'light clock', 'spacetime diagram', 'Minkowski', 'simultaneity', 'B.Sc physics', 'JEE advanced', 'M.Sc physics', 'twin paradox'],
  learningObjectives: ['Derive time dilation from the longer diagonal path of a photon in a moving light clock and read γ off the tick counts.', 'Read length contraction, time dilation and simultaneity from the tilted axes of the spacetime diagram.', 'Transform an event between frames and verify that ct² − x² is unchanged.'],
  assumptions: ['Inertial frames in one space dimension, standard configuration (origins coincide, relative velocity along +x); units are light-seconds and seconds (c = 1).', 'Accelerations are ignored: the moving clock and rod are already at constant velocity.'],
  blurb: 'Two identical light clocks tick side by side, one at rest and one moving at v/c; the moving one lags by γ. The Minkowski diagram shows the tilted axes of the moving frame, simultaneity lines and a Lorentz-transformed event.',
  hint: 'γ = 1/√(1−β²). Moving light clock: photon vertical speed c/γ, so one tick lasts γT0 in the lab. Rod of proper length L0 appears L0/γ in the lab. x\' = γ(x−βct), ct\' = γ(ct−βx); axes ct\' is the line x = βct and x\' is ct = βx; hyperbolas ct²−x² = const calibrate both frames equally. Simultaneity lines of the moving frame are tilted; in its frame the lab clock runs slow too.',
  params: [
    { kind: 'number', id: 'beta', label: 'Relative speed β = v/c', min: 0, max: 0.99, step: 0.01, value: 0.8, digits: 2 },
    { kind: 'number', id: 'L0', label: 'Rod proper length L0', min: 1, max: 6, step: 0.5, value: 3, unit: 'ls', digits: 1 },
    { kind: 'number', id: 'xE', label: 'Event P position x (lab frame)', min: -5, max: 5, step: 0.25, value: 2, unit: 'ls', digits: 2 },
    { kind: 'number', id: 'ctE', label: 'Event P time ct (lab frame)', min: -2, max: 8, step: 0.25, value: 3, unit: 'ls', digits: 2 },
    { kind: 'toggle', id: 'sim', label: 'Show simultaneity lines of the moving frame', value: true },
  ],
  actions: [{ id: 'restart', label: 'Restart both clocks at t = 0' }],
  dt: 1 / 60, previewSeconds: 3,
  init() { return { t: 0.3 }; },
  action(s) { s.t = 0; },
  step(s, _v, dt) { s.t += dt; if (s.t > 9000) s.t = 0; },
  draw(c, s, v, w, h) {
    bg(c, w, h); const p = relPar(v), { b, g } = p, g8 = 8, compact = w < 560 || h < 340;
    let P: Rect, D: Rect, Rb: Rect | null = null;
    if (compact) { const h1 = Math.round((h - 3 * g8) * 0.46); P = R(g8, g8, w - 2 * g8, h1); D = R(g8, 2 * g8 + h1, w - 2 * g8, h - 3 * g8 - h1); }
    else { const w1 = Math.round((w - 3 * g8) * 0.46), h1 = Math.round((h - 3 * g8) * 0.74); P = R(g8, g8, w1, h1); Rb = R(g8, 2 * g8 + h1, w1, h - 3 * g8 - h1); D = R(2 * g8 + w1, g8, w - 3 * g8 - w1, h - 2 * g8); }
    const fs = P.w < 260 ? 9 : 11;
    // ---- light clocks (lab frame)
    panel(c, P); text(c, 'Light clocks as seen in the lab frame', P.x + 8, P.y + 13, C.text, fs, 'left', 'alphabetic', true);
    const lh = (P.h - 22) / 2, u = Math.max(12, Math.min(lh - 30, P.w * 0.2)), x0 = P.x + 34, span = Math.max(30, P.w - 80);
    const lanes = [{ lab: 'A: at rest', tau: s.t, bx: 0, col: C.green, n: Math.floor(s.t / 2) }, { lab: `B: moving at ${fmt(b, 2)} c`, tau: s.t / g, bx: b * s.t * u, col: C.orange, n: Math.floor(s.t / (2 * g)) }];
    lanes.forEach((ln, i) => {
      const yTop = P.y + 24 + i * lh + 6, yBot = yTop + u, wrap = Math.floor(ln.bx / span), xc = x0 + (ln.bx - wrap * span);
      text(c, ln.lab, P.x + 8, yTop - 5, ln.col, fs - 1, 'left', 'alphabetic', true);
      text(c, `ticks: ${ln.n}`, P.x + P.w - 8, yTop - 5, ln.col, fs - 1, 'right', 'alphabetic', true);
      line(c, x0 - 14, yBot + 2, x0 + span + 14, yBot + 2, 'rgba(148,163,184,0.2)', 1);
      if (i === 1 && b > 1e-6) {
        const pts: [number, number][] = [], t1 = s.t, t0 = Math.max(0, wrap * (span / u) / b), nS = 140;
        for (let k = 0; k <= nS; k++) { const tt = t0 + ((t1 - t0) * k) / nS; pts.push([x0 + b * tt * u - wrap * span, yBot - lightClockY(tt / g) * u]); }
        polyline(c, pts, 'rgba(251,146,60,0.55)', 1.2);
      }
      line(c, xc - 14, yTop, xc + 14, yTop, '#94a3b8', 3); line(c, xc - 14, yBot, xc + 14, yBot, '#94a3b8', 3);
      circle(c, xc, yBot - lightClockY(ln.tau) * u, 4.5, C.amber, C.white, 1);
    });
    if (P.w > 220) text(c, `t = ${fmt(s.t, 2)} s   B proper time τ = ${fmt(s.t / g, 2)} s`, P.x + 8, P.y + P.h - 6, C.dim, fs - 1);
    if (Rb) {
      panel(c, Rb); text(c, 'Rod: proper length vs measured in lab (to scale)', Rb.x + 8, Rb.y + 13, C.text, fs - 1, 'left', 'alphabetic', true);
      const k = (Rb.w - 44) / Math.max(p.L0, 1), bh = Math.max(6, (Rb.h - 30) / 2 - 5);
      c.fillStyle = 'rgba(34,211,238,0.35)'; c.fillRect(Rb.x + 20, Rb.y + 20, p.L0 * k, bh); c.strokeStyle = C.cyan; c.strokeRect(Rb.x + 20, Rb.y + 20, p.L0 * k, bh);
      c.fillStyle = 'rgba(251,146,60,0.45)'; c.fillRect(Rb.x + 20, Rb.y + 26 + bh, (p.L0 / g) * k, bh); c.strokeStyle = C.orange; c.strokeRect(Rb.x + 20, Rb.y + 26 + bh, (p.L0 / g) * k, bh);
      text(c, `L0 = ${fmt(p.L0, 2)} ls (rest)`, Rb.x + 24, Rb.y + 20 + bh * 0.5 + 4, C.white, 9); text(c, `L = L0/γ = ${fmt(p.L0 / g, 2)} ls (moving)`, Rb.x + 24, Rb.y + 26 + bh * 1.5 + 4, C.white, 9);
    }
    // ---- spacetime diagram (equal scales on both axes so light rays are 45 degrees)
    const ix = D.x + 34, iy = D.y + 20, iw = Math.max(1, D.w - 42), ih = Math.max(1, D.h - 46), k = ih / 12, X = (x: number) => ix + iw / 2 + x * k, Y = (ct: number) => iy + ih - (ct + 3) * k;
    const S = (xp: number, ctp: number): [number, number] => [g * (xp + b * ctp), g * (ctp + b * xp)];
    const sp = (xp: number, ctp: number): [number, number] => { const q = S(xp, ctp); return [X(q[0]), Y(q[1])]; };
    panel(c, D); text(c, 'Spacetime diagram (lab frame S, moving frame S′)', D.x + 8, D.y + 13, C.text, fs, 'left', 'alphabetic', true);
    c.save(); c.beginPath(); c.rect(ix, iy, iw, ih); c.clip();
    const hx = iw / (2 * k) + 1;
    for (let n = Math.ceil(-hx); n <= hx; n++) line(c, X(n), iy, X(n), iy + ih, C.grid);
    for (let n = -3; n <= 9; n++) line(c, ix, Y(n), ix + iw, Y(n), C.grid);
    // calibration hyperbolas ct^2 - x^2 = k^2
    for (const kk of [2, 4, 6]) { const pts: [number, number][] = []; for (let i = -30; i <= 30; i++) { const a = i * 0.08; pts.push([X(kk * Math.sinh(a)), Y(kk * Math.cosh(a))]); } polyline(c, pts, 'rgba(167,139,250,0.35)', 1); }
    line(c, ix, Y(0), ix + iw, Y(0), C.axis, 1.2); line(c, X(0), iy, X(0), iy + ih, C.axis, 1.2);
    for (const sg of [1, -1]) line(c, X(sg * 30), Y(30), X(0), Y(0), 'rgba(251,191,36,0.7)', 1.2, [5, 4]);
    // rod worldlines x' = 0 and x' = L0, shaded
    { const a0 = -3, a1 = 9, q: [number, number][] = [[X(b * a0), Y(a0)], [X(b * a1), Y(a1)], [X(b * a1 + p.L0 / g), Y(a1)], [X(b * a0 + p.L0 / g), Y(a0)]]; c.fillStyle = 'rgba(34,211,238,0.12)'; c.beginPath(); q.forEach((z, i) => (i ? c.lineTo(z[0], z[1]) : c.moveTo(z[0], z[1]))); c.closePath(); c.fill(); polyline(c, [q[3], q[2]], C.cyan, 1.4); }
    // moving-frame axes
    const a1 = sp(-30, 0), a2 = sp(30, 0), b1 = sp(0, -30), b2 = sp(0, 30);
    polyline(c, [a1, a2], C.orange, 1.6); polyline(c, [b1, b2], C.orange, 1.6);
    for (let n = -9; n <= 9; n++) if (n !== 0) { const q1 = sp(n, 0), q2 = sp(0, n); circle(c, q1[0], q1[1], 2, C.orange); circle(c, q2[0], q2[1], 2, C.orange); }
    // proper-time ticks (every 2 s) of A and B
    for (let n = 0; n <= 4; n++) { circle(c, X(0), Y(2 * n), 3.5, C.green); const q = sp(0, 2 * n); circle(c, q[0], q[1], 3.5, C.orange, C.white, 0.8); }
    // lab present time and the moving-frame simultaneity line through B's event
    const tNow = s.t % 9, bx = b * tNow;
    line(c, ix, Y(tNow), ix + iw, Y(tNow), 'rgba(52,211,153,0.7)', 1.2);
    circle(c, X(0), Y(tNow), 4.5, C.green, C.white, 1); circle(c, X(bx), Y(tNow), 4.5, C.orange, C.white, 1);
    if (p.sim) { line(c, X(-30), Y(tNow + b * (-30 - bx)), X(30), Y(tNow + b * (30 - bx)), C.pink, 1.2, [5, 4]); const ya = tNow * (1 - b * b); circle(c, X(0), Y(ya), 4, C.pink, C.white, 1); }
    // lab length of the rod at the present time
    polyline(c, [[X(bx), Y(tNow)], [X(bx + p.L0 / g), Y(tNow)]], C.cyan, 3.5);
    // event P with parallel-axis projections
    const [xp, cp] = lorentz(p.xE, p.ctE, b);
    { const f1 = sp(xp, 0), f2 = sp(0, cp), pp: [number, number] = [X(p.xE), Y(p.ctE)]; polyline(c, [pp, f1], 'rgba(251,191,36,0.7)', 1, [3, 3]); polyline(c, [pp, f2], 'rgba(251,191,36,0.7)', 1, [3, 3]); circle(c, pp[0], pp[1], 5, C.amber, C.white, 1.3); }
    c.restore();
    text(c, 'x (ls)', ix + iw - 4, Y(0) - 4, C.dim, 9, 'right'); text(c, 'ct (s)', X(0) + 4, iy + 10, C.dim, 9);
    text(c, 'ct′', clamp(X(b * 8.4) + 4, ix + 2, ix + iw - 22), Y(8.4) + 4, C.orange, 10, 'left', 'alphabetic', true);
    text(c, 'x′', ix + iw - 18, clamp(Y(b * (iw / (2 * k)) * 1) - 6, iy + 8, iy + ih - 4), C.orange, 10, 'left', 'alphabetic', true);
    text(c, 'P', X(p.xE) + 7, Y(p.ctE) - 6, C.amber, 11, 'left', 'alphabetic', true);
    if (D.w > 260) text(c, 'light cone', X(2.2), Y(2.8), C.amber, 9);
    text(c, `P: (${fmt(p.xE, 2)}, ${fmt(p.ctE, 2)}) → (x′, ct′) = (${fmt(xp, 2)}, ${fmt(cp, 2)})`, D.x + 8, D.y + D.h - 6, C.amber, fs - 1);
  },
  readouts(s, v) {
    const p = relPar(v), { b, g } = p, [xp, cp] = lorentz(p.xE, p.ctE, b), inter = p.ctE * p.ctE - p.xE * p.xE, tNow = s.t % 9;
    return [
      { label: 'β = v/c', value: b, digits: 3 },
      { label: 'Lorentz factor γ', value: g, digits: 4 },
      { label: 'Lab time t', value: s.t, unit: 's', digits: 2 },
      { label: 'Ticks: A (rest) / B (moving)', value: `${Math.floor(s.t / 2)} / ${Math.floor(s.t / (2 * g))}` },
      { label: 'Moving clock reads τ = t/γ', value: s.t / g, unit: 's', digits: 3 },
      { label: 'Rod length in lab L = L0/γ', value: p.L0 / g, unit: 'ls', digits: 3 },
      { label: 'A seen from B at the same B-instant', value: tNow * (1 - b * b), unit: 's', digits: 3 },
      { label: 'Event P in S′: x′', value: xp, unit: 'ls', digits: 3 },
      { label: 'Event P in S′: ct′', value: cp, unit: 's', digits: 3 },
      { label: 'Invariant interval ct² − x² (S = S′)', value: inter, unit: 'ls²', digits: 3 },
      { label: 'Check ct′² − x′²', value: cp * cp - xp * xp, unit: 'ls²', digits: 3 },
      { label: 'Type of separation from origin', value: Math.abs(inter) < 1e-9 ? 'lightlike' : inter > 0 ? 'timelike' : 'spacelike' },
    ];
  },
  equations(s, v) {
    const p = relPar(v), { b, g } = p, [xp, cp] = lorentz(p.xE, p.ctE, b);
    return [
      `\\gamma=\\dfrac{1}{\\sqrt{1-\\beta^2}}=\\dfrac{1}{\\sqrt{1-${fmt(b, 2)}^2}}=${fmt(g, 4)},\\qquad \\Delta t=\\gamma\\,\\Delta\\tau,\\ \\ L=\\dfrac{L_0}{\\gamma}=${fmt(p.L0 / g, 3)}\\ \\mathrm{ls}`,
      `x'=\\gamma(x-\\beta ct)=${fmt(xp, 3)},\\qquad ct'=\\gamma(ct-\\beta x)=${fmt(cp, 3)}`,
      `(ct)^2-x^2=(ct')^2-x'^2=${fmt(p.ctE * p.ctE - p.xE * p.xE, 3)}\\ \\mathrm{ls^2}`,
      `T_{\\mathrm{tick}}=\\dfrac{2d}{c\\sqrt{1-\\beta^2}}=\\gamma T_0=${fmt(2 * g, 3)}\\ \\mathrm{s}\\ \\ (T_0=2\\ \\mathrm{s}\\text{ for }d=1\\ \\mathrm{ls})`,
    ];
  },
});
export { TAU };
