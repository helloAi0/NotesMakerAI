import { defineSim, num, str } from './types';
import { C, TAU, clamp, fmt, line, plot, polyline, text, circle, hsl } from './draw';
import { meta, mulberry, ticks } from './univ_util';

/* ============================ CMOS inverter ============================ */
const mosI = (vgs: number, vds: number, vt: number, beta: number) => { const vov = vgs - vt; if (vov <= 0 || vds <= 0) return 0; return vds < vov ? beta * (vov * vds - vds * vds / 2) : 0.5 * beta * vov * vov; };
function cmosVout(vin: number, vdd: number, vtn: number, vtp: number, bn: number, bp: number) {
  let lo = 0, hi = vdd; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; const f = mosI(vin, m, vtn, bn) - mosI(vdd - vin, vdd - m, vtp, bp); if (f > 0) hi = m; else lo = m; } return (lo + hi) / 2;
}
function cmosRegion(vin: number, vout: number, vdd: number, vtn: number, vtp: number) {
  const n = vin <= vtn ? 'cutoff' : vout < vin - vtn ? 'triode' : 'saturation'; const p = vdd - vin <= vtp ? 'cutoff' : vdd - vout < vdd - vin - vtp ? 'triode' : 'saturation'; return { n, p };
}
function cmosAnalyse(v: Record<string, number | string | boolean>) {
  const vdd = num(v, 'vdd'), vtn = Math.min(num(v, 'vtn'), vdd * 0.45), vtp = Math.min(num(v, 'vtp'), vdd * 0.45), bn = 0.5, bp = bn / num(v, 'ratio'), cl = num(v, 'cl');
  const N = 300, vin: number[] = [], vo: number[] = []; for (let i = 0; i <= N; i++) { const x = (vdd * i) / N; vin.push(x); vo.push(cmosVout(x, vdd, vtn, vtp, bn, bp)); }
  let vm = vdd / 2; for (let i = 1; i <= N; i++) if (vo[i] <= vin[i] && vo[i - 1] > vin[i - 1]) { const a = vo[i - 1] - vin[i - 1], b = vo[i] - vin[i]; vm = vin[i - 1] + (vdd / N) * (a / (a - b)); break; }
  let vil = vtn, vih = vdd - vtp; for (let i = 1; i <= N; i++) { const g = (vo[i] - vo[i - 1]) / (vdd / N); if (g <= -1) { vil = vin[i]; break; } } for (let i = N; i >= 1; i--) { const g = (vo[i] - vo[i - 1]) / (vdd / N); if (g <= -1) { vih = vin[i - 1]; break; } }
  let ipk = 0; for (let i = 0; i <= N; i++) ipk = Math.max(ipk, mosI(vin[i], vo[i], vtn, bn));
  const trans = (rise: boolean) => { let v0 = rise ? 0 : vdd; const vi = rise ? vdd : 0; const out: [number, number][] = [[0, v0]]; let tp = NaN; const dt = 0.05, T = 600; for (let t = 0; t < T; t += dt) { const i = mosI(vi, v0, vtn, bn) - mosI(vdd - vi, vdd - v0, vtp, bp); const k1 = i / cl; v0 = clamp(v0 + (rise ? -1 : 1) * 0 + k1 * dt, 0, vdd); const tt = t + dt; if (Number.isNaN(tp) && (rise ? v0 <= vdd / 2 : v0 >= vdd / 2)) tp = tt; if (Math.round(tt / dt) % 10 === 0) out.push([tt, v0]); } return { out, tp }; };
  // note: input rises 0→Vdd ⇒ output falls (tpHL); input falls ⇒ output rises (tpLH)
  const hl = trans(true), lh = trans(false);
  return { vdd, vtn, vtp, bn, bp, vin, vo, vm, vil, vih, ipk, hl, lh, nml: vil, nmh: vdd - vih };
}
export const cmosInverter = defineSim<{ t: number }>({
  id: 'cmos_inverter_vtc_delay', title: 'CMOS Inverter: Voltage Transfer Characteristic, Noise Margins & Propagation Delay',
  ...meta('Electronics', 'Advanced', 'VLSI Design', 'CMOS Logic', 'VTC, switching threshold, noise margins, short-circuit current, tpHL / tpLH'),
  covers: ['CMOS inverter', 'Voltage transfer characteristic', 'Noise margin', 'Switching threshold', 'Propagation delay', 'VLSI', 'MOSFET regions'],
  tags: ['VLSI', 'CMOS', 'GATE ECE', 'digital IC', 'noise margin', 'tpd', 'M.Tech VLSI'],
  learningObjectives: ['Identify the five operating regions of the NMOS/PMOS pair along the VTC.', 'See how the βn/βp ratio shifts the switching threshold V_M away from V_DD/2.', 'Relate load capacitance and drive strength to tpHL, tpLH and the average delay.'],
  assumptions: ['Long-channel square-law (Shichman–Hodges) MOSFETs without channel-length modulation, body effect or velocity saturation; βn = 0.5 mA/V²; step input; lumped load C_L.'],
  blurb: 'Plot the CMOS inverter’s VTC from the square-law model, read off V_M, V_IL, V_IH and noise margins, and simulate the output delay into a load capacitor.',
  hint: 'V_out solves I_n = I_p. Gain = −1 at V_IL and V_IH. V_M ≈ (V_DD − |V_tp| + V_tn√(βn/βp)) / (1 + √(βn/βp)). t_p ≈ C_L·V_DD / (2·I_avg).',
  params: [
    { kind: 'number', id: 'vdd', label: 'Supply V_DD (V)', min: 1, max: 5, step: 0.1, value: 3.3, digits: 1 },
    { kind: 'number', id: 'vtn', label: 'NMOS threshold V_tn (V)', min: 0.2, max: 1.2, step: 0.05, value: 0.6, digits: 2 },
    { kind: 'number', id: 'vtp', label: 'PMOS threshold |V_tp| (V)', min: 0.2, max: 1.2, step: 0.05, value: 0.6, digits: 2 },
    { kind: 'number', id: 'ratio', label: 'Strength ratio βn / βp', min: 0.2, max: 5, step: 0.05, value: 1, digits: 2 },
    { kind: 'number', id: 'cl', label: 'Load capacitance C_L (fF)', min: 1, max: 100, step: 1, value: 20, digits: 0 },
    { kind: 'number', id: 'vin', label: 'Probe input V_in (V)', min: 0, max: 5, step: 0.01, value: 1.2, digits: 2 },
  ],
  dt: 1 / 20, previewSeconds: 1, init() { return { t: 0 }; }, step(s, _v, dt) { s.t += dt; },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const a = cmosAnalyse(v), vin = clamp(num(v, 'vin'), 0, a.vdd);
    const A = { x: 8, y: 8, w: w * 0.5 - 12, h: h - 16 }, m = plot(c, A, [0, a.vdd], [0, a.vdd], { title: 'Voltage transfer characteristic', xlabel: 'V_in (V)', ylabel: 'V_out (V)' });
    line(c, m.X(0), m.Y(0), m.X(a.vdd), m.Y(a.vdd), C.dim, 1, [4, 4]); polyline(c, a.vin.map((x, i) => [m.X(x), m.Y(a.vo[i])] as [number, number]), C.cyan, 2.5);
    for (const [x, col, lab] of [[a.vil, C.amber, 'V_IL'], [a.vih, C.amber, 'V_IH'], [a.vm, C.pink, 'V_M']] as [number, string, string][]) { line(c, m.X(x), m.Y(0), m.X(x), m.Y(a.vdd), col, 1, [3, 3]); text(c, lab, m.X(x) + 3, m.Y(a.vdd) + 12, col, 10); }
    const vo = cmosVout(vin, a.vdd, a.vtn, a.vtp, a.bn, a.bp), reg = cmosRegion(vin, vo, a.vdd, a.vtn, a.vtp); circle(c, m.X(vin), m.Y(vo), 5, C.red, C.white, 1.5);
    text(c, `NMOS ${reg.n} · PMOS ${reg.p}`, A.x + 40, A.y + A.h - 34, C.text, 10);
    const B = { x: w * 0.5 + 4, y: 8, w: w * 0.5 - 12, h: h - 16 }, tmax = Math.max(20, Math.min(600, 6 * Math.max(a.hl.tp || 100, a.lh.tp || 100))), mt = plot(c, B, [0, tmax], [0, a.vdd], { title: 'Step response into C_L', xlabel: 't (ps)', ylabel: 'V_out (V)' });
    polyline(c, a.hl.out.filter(p => p[0] <= tmax).map(p => [mt.X(p[0]), mt.Y(p[1])] as [number, number]), C.red, 2); polyline(c, a.lh.out.filter(p => p[0] <= tmax).map(p => [mt.X(p[0]), mt.Y(p[1])] as [number, number]), C.green, 2);
    line(c, mt.X(0), mt.Y(a.vdd / 2), mt.X(tmax), mt.Y(a.vdd / 2), C.dim, 1, [4, 4]); text(c, 'tpHL (red) · tpLH (green)', B.x + 40, B.y + 30, C.dim, 10);
  },
  readouts(_s, v) { const a = cmosAnalyse(v); return [{ label: 'Switching threshold V_M', value: a.vm, unit: 'V', digits: 3 }, { label: 'V_IL / V_IH', value: `${fmt(a.vil, 2)} / ${fmt(a.vih, 2)} V` }, { label: 'Noise margins NM_L / NM_H', value: `${fmt(a.nml, 2)} / ${fmt(a.nmh, 2)} V` }, { label: 'tpHL', value: a.hl.tp, unit: 'ps', digits: 1 }, { label: 'tpLH', value: a.lh.tp, unit: 'ps', digits: 1 }, { label: 'Average delay', value: (a.hl.tp + a.lh.tp) / 2, unit: 'ps', digits: 1 }, { label: 'Peak short-circuit current', value: a.ipk, unit: 'mA', digits: 3 }]; },
  equations() { return ['I_n=\\tfrac{\\beta_n}{2}(V_{in}-V_{tn})^2=I_p=\\tfrac{\\beta_p}{2}(V_{DD}-V_{in}-|V_{tp}|)^2', 'V_M=\\dfrac{V_{DD}-|V_{tp}|+V_{tn}\\sqrt{\\beta_n/\\beta_p}}{1+\\sqrt{\\beta_n/\\beta_p}}', 't_p=\\tfrac12(t_{pHL}+t_{pLH})']; },
});

/* ============================ Carnot cycle ============================ */
const RG = 8.314;
function carnot(v: Record<string, number | string | boolean>) {
  const th = num(v, 'th'), tc = Math.min(num(v, 'tc'), th - 20), gam = Number(str(v, 'gas')), n = num(v, 'n'), v1 = num(v, 'v1') / 1000, r = num(v, 'r');
  const v2 = v1 * r, k = Math.pow(th / tc, 1 / (gam - 1)), v3 = v2 * k, v4 = v1 * k;
  const qh = n * RG * th * Math.log(r), qc = n * RG * tc * Math.log(r); return { th, tc, gam, n, v1, v2, v3, v4, qh, qc, w: qh - qc, eta: 1 - tc / th, ds: n * RG * Math.log(r), s0: 0 };
}
export const carnotCycle = defineSim<{ t: number }>({
  id: 'carnot_cycle_pv_ts', title: 'Carnot Cycle: P–V and T–S Diagrams, Heat, Work & Maximum Efficiency',
  ...meta('Physics', 'Intermediate', 'Thermodynamics', 'Heat Engines', 'Carnot cycle, reversible isothermal & adiabatic processes, entropy, η = 1 − Tc/Th'),
  covers: ['Carnot cycle', 'Heat engine', 'Second law of thermodynamics', 'Entropy', 'Isothermal process', 'Adiabatic process', 'Carnot efficiency'],
  tags: ['thermodynamics', 'heat engine', 'GATE ME', 'T-S diagram', 'P-V diagram', 'JEE', 'B.Tech'],
  learningObjectives: ['Follow one ideal gas through two isotherms and two adiabats on both the P–V and T–S diagrams.', 'See that the area enclosed on P–V is the net work and on T–S the net heat.', 'Verify η = W/Q_h = 1 − T_c/T_h: it depends only on the two reservoir temperatures.'],
  assumptions: ['Reversible cycle of n moles of an ideal gas with constant γ; no friction or heat leaks. Real engines are always below this limit.'],
  blurb: 'A piston animates one full Carnot cycle while the P–V and T–S diagrams are drawn together, with the heat, work and efficiency worked out from the temperatures.',
  hint: 'Isothermal expansion at T_h absorbs Q_h = nRT_h ln(V₂/V₁); adiabats follow T V^{γ−1} = const; isothermal compression at T_c rejects Q_c = nRT_c ln(V₂/V₁). η = 1 − T_c/T_h.',
  params: [
    { kind: 'number', id: 'th', label: 'Hot reservoir T_h (K)', min: 300, max: 1200, step: 10, value: 800, digits: 0 },
    { kind: 'number', id: 'tc', label: 'Cold reservoir T_c (K)', min: 100, max: 600, step: 10, value: 300, digits: 0 },
    { kind: 'number', id: 'r', label: 'Isothermal expansion ratio V₂/V₁', min: 1.2, max: 6, step: 0.1, value: 2.5, digits: 1 },
    { kind: 'number', id: 'v1', label: 'Initial volume V₁ (L)', min: 1, max: 20, step: 0.5, value: 4, digits: 1 },
    { kind: 'number', id: 'n', label: 'Amount of gas n (mol)', min: 0.05, max: 2, step: 0.05, value: 0.5, digits: 2 },
    { kind: 'select', id: 'gas', label: 'Gas', value: '1.4', options: [{ value: '1.4', label: 'Diatomic (γ = 1.4)' }, { value: '1.667', label: 'Monatomic (γ = 5/3)' }] },
    { kind: 'number', id: 'speed', label: 'Animation speed', min: 0.1, max: 3, step: 0.1, value: 1, digits: 1 },
  ],
  dt: 1 / 60, previewSeconds: 3, init() { return { t: 0 }; }, step(s, v, dt) { s.t += dt * num(v, 'speed'); },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const k = carnot(v); const P = (vol: number, T: number) => k.n * RG * T / vol / 1000; const gam = k.gam;
    const pts = (a: number, b: number, f: (x: number) => [number, number]) => Array.from({ length: 61 }, (_, i) => f(a + ((b - a) * i) / 60));
    const seg: [number, number][][] = [pts(k.v1, k.v2, x => [x, P(x, k.th)]), pts(k.v2, k.v3, x => [x, P(k.v2, k.th) * Math.pow(k.v2 / x, gam)]), pts(k.v3, k.v4, x => [x, P(x, k.tc)]), pts(k.v4, k.v1, x => [x, P(k.v4, k.tc) * Math.pow(k.v4 / x, gam)])];
    const all = seg.flat(); const Pmax = Math.max(...all.map(p => p[1])) * 1.1, Vmax = k.v3 * 1.1, Vmin = k.v1 * 0.85;
    const A = { x: 8, y: 8, w: w * 0.55 - 12, h: h * 0.82 - 8 }, m = plot(c, A, [Vmin * 1000, Vmax * 1000], [0, Pmax], { title: 'P–V diagram', xlabel: 'V (L)', ylabel: 'P (kPa)' });
    const cols = [C.red, C.amber, C.blue, C.cyan]; seg.forEach((sg, i) => polyline(c, sg.map(p => [m.X(p[0] * 1000), m.Y(p[1])] as [number, number]), cols[i], 2.5));
    ['1', '2', '3', '4'].forEach((l, i) => { const p = i === 0 ? seg[0][0] : seg[i - 1][60]; circle(c, m.X(p[0] * 1000), m.Y(p[1]), 4, C.white); text(c, l, m.X(p[0] * 1000) + 6, m.Y(p[1]) - 6, C.white, 11, 'left', 'alphabetic', true); });
    const B = { x: w * 0.55 + 4, y: 8, w: w * 0.45 - 12, h: h * 0.82 - 8 }, S1 = 0, S2 = k.ds, mt = plot(c, B, [S1 - k.ds * 0.15, S2 + k.ds * 0.15], [0, k.th * 1.15], { title: 'T–S diagram', xlabel: 'S (J/K, relative)', ylabel: 'T (K)' });
    polyline(c, [[S1, k.th], [S2, k.th], [S2, k.tc], [S1, k.tc], [S1, k.th]].map(p => [mt.X(p[0]), mt.Y(p[1])] as [number, number]), C.green, 2.5);
    c.fillStyle = 'rgba(52,211,153,0.15)'; c.fillRect(mt.X(S1), mt.Y(k.th), mt.X(S2) - mt.X(S1), mt.Y(k.tc) - mt.Y(k.th));
    const lens = seg.map(sg => sg.length), tot = 4; const ph = (s.t * 0.25) % 1 * tot, i = Math.min(3, Math.floor(ph)), f = ph - i, pp = seg[i][Math.round(f * (lens[i] - 1))]; circle(c, m.X(pp[0] * 1000), m.Y(pp[1]), 6, C.white, C.red, 2);
    const T = i === 0 ? k.th : i === 2 ? k.tc : i === 1 ? k.th * Math.pow(k.v2 / pp[0], gam - 1) : k.tc * Math.pow(k.v4 / pp[0], gam - 1), Sx = i === 0 ? S1 + f * k.ds : i === 1 ? S2 : i === 2 ? S2 - f * k.ds : S1; circle(c, mt.X(Sx), mt.Y(T), 6, C.white, C.green, 2);
    text(c, ['1→2 isothermal expansion: heat in', '2→3 adiabatic expansion: cools', '3→4 isothermal compression: heat out', '4→1 adiabatic compression: heats'][i], 10, h - 14, C.text, 12, 'left', 'alphabetic', true);
  },
  readouts(_s, v) { const k = carnot(v); return [{ label: 'Efficiency η = 1 − Tc/Th', value: k.eta * 100, unit: '%', digits: 1 }, { label: 'Heat absorbed Q_h', value: k.qh, unit: 'J', digits: 0 }, { label: 'Heat rejected Q_c', value: k.qc, unit: 'J', digits: 0 }, { label: 'Net work W = Q_h − Q_c', value: k.w, unit: 'J', digits: 0 }, { label: 'W / Q_h (check)', value: (k.w / k.qh) * 100, unit: '%', digits: 1 }, { label: 'Entropy change per isotherm', value: k.ds, unit: 'J/K', digits: 2 }]; },
  equations(_s, v) { const k = carnot(v); return ['\\eta=1-\\dfrac{T_c}{T_h}=' + fmt(k.eta, 3), 'Q_h=nRT_h\\ln\\dfrac{V_2}{V_1},\\quad TV^{\\gamma-1}=\\text{const}', '\\oint \\dfrac{\\delta Q}{T}=0']; },
});

/* ============================ NMR / IR spectra ============================ */
interface Pk { ppm: number; h: number; m: 's' | 'd' | 't' | 'q' | 'm'; l: string }
interface Band { cm: number; w: number; d: number; l: string }
interface Mol { name: string; formula: string; C: number; H: number; nmr: Pk[]; ir: Band[] }
const MOLS: Record<string, Mol> = {
  ethanol: { name: 'Ethanol', formula: 'C₂H₆O', C: 2, H: 6, nmr: [{ ppm: 1.22, h: 3, m: 't', l: 'CH₃' }, { ppm: 2.6, h: 1, m: 's', l: 'OH (variable)' }, { ppm: 3.69, h: 2, m: 'q', l: 'CH₂–O' }], ir: [{ cm: 3350, w: 220, d: 0.65, l: 'O–H stretch (broad)' }, { cm: 2960, w: 50, d: 0.45, l: 'C–H stretch' }, { cm: 1050, w: 40, d: 0.7, l: 'C–O stretch' }] },
  acetone: { name: 'Acetone', formula: 'C₃H₆O', C: 3, H: 6, nmr: [{ ppm: 2.17, h: 6, m: 's', l: 'CH₃–C=O' }], ir: [{ cm: 2970, w: 40, d: 0.25, l: 'C–H stretch' }, { cm: 1715, w: 28, d: 0.85, l: 'C=O stretch (ketone)' }, { cm: 1365, w: 25, d: 0.45, l: 'CH₃ bend' }] },
  ethylacetate: { name: 'Ethyl acetate', formula: 'C₄H₈O₂', C: 4, H: 8, nmr: [{ ppm: 1.26, h: 3, m: 't', l: 'CH₃–CH₂' }, { ppm: 2.05, h: 3, m: 's', l: 'CH₃–C=O' }, { ppm: 4.12, h: 2, m: 'q', l: 'O–CH₂' }], ir: [{ cm: 2980, w: 40, d: 0.3, l: 'C–H stretch' }, { cm: 1740, w: 26, d: 0.9, l: 'C=O stretch (ester)' }, { cm: 1240, w: 40, d: 0.8, l: 'C–O stretch' }, { cm: 1050, w: 30, d: 0.55, l: 'O–C–C stretch' }] },
  toluene: { name: 'Toluene', formula: 'C₇H₈', C: 7, H: 8, nmr: [{ ppm: 2.34, h: 3, m: 's', l: 'Ar–CH₃' }, { ppm: 7.2, h: 5, m: 'm', l: 'Ar–H' }], ir: [{ cm: 3030, w: 35, d: 0.3, l: 'aromatic C–H' }, { cm: 2920, w: 35, d: 0.3, l: 'CH₃ C–H' }, { cm: 1605, w: 18, d: 0.4, l: 'C=C ring' }, { cm: 1495, w: 20, d: 0.55, l: 'C=C ring' }, { cm: 730, w: 22, d: 0.8, l: 'C–H oop (mono-subst.)' }, { cm: 695, w: 18, d: 0.75, l: 'ring bend' }] },
  benzaldehyde: { name: 'Benzaldehyde', formula: 'C₇H₆O', C: 7, H: 6, nmr: [{ ppm: 7.6, h: 5, m: 'm', l: 'Ar–H' }, { ppm: 10.0, h: 1, m: 's', l: 'CHO' }], ir: [{ cm: 3060, w: 30, d: 0.25, l: 'aromatic C–H' }, { cm: 2820, w: 25, d: 0.3, l: 'aldehyde C–H' }, { cm: 2730, w: 25, d: 0.3, l: 'aldehyde C–H (Fermi)' }, { cm: 1700, w: 26, d: 0.9, l: 'C=O (conjugated)' }, { cm: 1600, w: 18, d: 0.4, l: 'C=C ring' }] },
  aceticacid: { name: 'Acetic acid', formula: 'C₂H₄O₂', C: 2, H: 4, nmr: [{ ppm: 2.1, h: 3, m: 's', l: 'CH₃' }, { ppm: 11.4, h: 1, m: 's', l: 'COOH (variable)' }], ir: [{ cm: 3000, w: 400, d: 0.6, l: 'O–H (very broad, dimer)' }, { cm: 1710, w: 30, d: 0.9, l: 'C=O stretch (acid)' }, { cm: 1290, w: 40, d: 0.6, l: 'C–O stretch' }, { cm: 930, w: 60, d: 0.4, l: 'O–H bend (broad)' }] },
};
const PASCAL: Record<string, number[]> = { s: [1], d: [1, 1], t: [1, 2, 1], q: [1, 3, 3, 1], m: [1, 2, 3, 2, 1] };
function nmrLines(p: Pk, mhz: number): { x: number; a: number }[] { const J = p.m === 'm' ? 6 : 7, co = PASCAL[p.m], sum = co.reduce((a, b) => a + b, 0); return co.map((c, i) => ({ x: p.ppm + ((i - (co.length - 1) / 2) * (p.m === 'm' ? 14 : J)) / mhz, a: (p.h * c) / sum })); }
export const nmrIr = defineSim<{ t: number }>({
  id: 'nmr_ir_spectrum_interpretation', title: 'Organic Spectroscopy: ¹H NMR and IR Spectrum Interpretation',
  ...meta('Chemistry', 'Intermediate', 'Organic Chemistry', 'Spectroscopy', 'Chemical shift, integration, n+1 splitting, IR functional-group bands, degrees of unsaturation'),
  covers: ['NMR spectroscopy', 'Infrared spectroscopy', 'Chemical shift', 'Spin–spin splitting', 'Functional group identification', 'Degrees of unsaturation', 'Structure determination'],
  tags: ['organic chemistry', 'spectroscopy', 'NMR', 'IR', 'structure elucidation', 'CSIR NET', 'B.Sc', 'M.Sc'],
  learningObjectives: ['Read chemical shift, integration and n+1 multiplicity from a ¹H NMR spectrum.', 'Match IR absorption bands to functional groups (O–H, C=O, C–H, C–O).', 'Combine the two spectra with degrees of unsaturation to identify the molecule.'],
  assumptions: ['Idealised first-order spectra: J ≈ 7 Hz, Lorentzian lines, shifts and band positions typical for CDCl₃ / neat liquid; OH and COOH shifts vary with concentration; aromatic multiplets simplified.'],
  blurb: 'Pick a small organic molecule and view its simulated ¹H NMR (shift, integral, splitting) or IR spectrum, then work out which groups are present.',
  hint: 'NMR: shift δ (ppm) = (ν − ν_TMS)/spectrometer MHz; an n-neighbour CH group splits a peak into n+1 lines; peak area ∝ number of H. IR: strong band 1650–1800 cm⁻¹ = C=O; broad 3200–3600 = O–H.',
  params: [
    { kind: 'select', id: 'mol', label: 'Compound', value: 'ethylacetate', options: Object.entries(MOLS).map(([value, m]) => ({ value, label: `${m.name} (${m.formula})` })) },
    { kind: 'select', id: 'mode', label: 'Spectrum', value: 'nmr', options: [{ value: 'nmr', label: '¹H NMR' }, { value: 'ir', label: 'Infrared (IR)' }] },
    { kind: 'number', id: 'mhz', label: 'NMR spectrometer (MHz)', min: 60, max: 600, step: 10, value: 400, digits: 0 },
    { kind: 'number', id: 'lw', label: 'NMR line width (Hz)', min: 0.5, max: 8, step: 0.5, value: 1.5, digits: 1 },
  ],
  dt: 1 / 20, previewSeconds: 1, init() { return { t: 0 }; }, step(s, _v, dt) { s.t += dt; },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const mol = MOLS[str(v, 'mol')] ?? MOLS.ethanol, A = { x: 8, y: 8, w: w - 16, h: h - 70 };
    if (str(v, 'mode') === 'nmr') {
      const mhz = num(v, 'mhz'), lw = num(v, 'lw') / mhz / 2, m = plot(c, A, [12, 0], [0, 1.15], { title: `${mol.name}: ¹H NMR (${mhz} MHz) — δ (ppm), TMS = 0`, xlabel: 'δ (ppm)', grid: true });
      const lines = mol.nmr.flatMap(p => nmrLines(p, mhz)); const amax = Math.max(...lines.map(l => l.a)); const N = 700, ys: number[] = [];
      for (let i = 0; i <= N; i++) { const x = (12 * i) / N; let y = 0; for (const l of lines) y += (l.a / amax) * (lw * lw) / ((x - l.x) ** 2 + lw * lw); ys.push(y); } const ymax = Math.max(...ys);
      polyline(c, ys.map((y, i) => [m.X((12 * i) / N), m.Y((y / ymax) * 0.85)] as [number, number]), C.cyan, 1.8);
      mol.nmr.forEach(p => { const x = m.X(p.ppm); line(c, x, m.Y(0), x, m.Y(0) + 3, C.amber); text(c, `${p.h}H ${p.m === 's' ? 'singlet' : p.m === 'd' ? 'doublet' : p.m === 't' ? 'triplet' : p.m === 'q' ? 'quartet' : 'multiplet'}`, x, m.Y(1.02), C.amber, 10, 'center', 'alphabetic', true); text(c, p.l, x, m.Y(0.96), C.dim, 9, 'center'); });
    } else {
      const m = plot(c, A, [4000, 400], [0, 100], { title: `${mol.name}: IR spectrum`, xlabel: 'wavenumber (cm⁻¹)', ylabel: '% transmittance', grid: true });
      const N = 800, pts: [number, number][] = []; for (let i = 0; i <= N; i++) { const x = 4000 - (3600 * i) / N; let t = 95; for (const b of mol.ir) t -= 95 * b.d * Math.exp(-0.5 * ((x - b.cm) / (b.w / 2.355)) ** 2); pts.push([m.X(x), m.Y(Math.max(2, t))]); } polyline(c, pts, C.green, 1.8);
      if (A.w > 300) { line(c, m.X(1500), m.Y(0), m.X(1500), m.Y(100), C.dim, 1, [4, 4]); text(c, 'fingerprint region ←', m.X(1500) - 4, m.Y(100) + 12, C.dim, 9, 'right'); }
      mol.ir.forEach((b, i) => { const x = m.X(b.cm); text(c, `${b.cm}`, x, m.Y(95 - 95 * b.d) + 12, C.amber, 9, 'center', 'alphabetic', true); text(c, b.l, x, m.Y(95 - 95 * b.d) + 24 + (i % 2) * 11, C.dim, 9, 'center'); });
    }
    text(c, `${mol.formula}: degrees of unsaturation = ${(2 * mol.C + 2 - mol.H) / 2}`, 10, h - 36, C.text, 12, 'left', 'alphabetic', true); text(c, 'Tip: switch between NMR and IR, then predict the structure from both.', 10, h - 18, C.dim, 11);
  },
  readouts(_s, v) { const mol = MOLS[str(v, 'mol')] ?? MOLS.ethanol; return [{ label: 'Formula', value: mol.formula }, { label: 'Degrees of unsaturation', value: (2 * mol.C + 2 - mol.H) / 2, digits: 0 }, { label: 'Distinct ¹H environments', value: mol.nmr.length, digits: 0 }, { label: 'Total H in spectrum', value: mol.nmr.reduce((a, p) => a + p.h, 0), digits: 0 }, { label: 'Strong IR bands', value: mol.ir.filter(b => b.d > 0.5).map(b => b.cm).join(', ') + ' cm⁻¹' }]; },
  equations() { return ['\\delta=\\dfrac{\\nu-\\nu_{TMS}}{\\nu_{0}}\\times10^{6}\\ \\text{ppm}', '\\text{lines}=n+1,\\quad \\text{DoU}=\\dfrac{2C+2-H}{2}']; },
});

/* ============================ 2-D Ising model ============================ */
const IL = 48, TCI = 2 / Math.log(1 + Math.SQRT2);
interface IS { spin: Int8Array; rng: () => number; mHist: number[]; eHist: number[]; sweeps: number }
function isingInit(hot: boolean, seed: number): IS { const rng = mulberry(seed), spin = new Int8Array(IL * IL); for (let i = 0; i < spin.length; i++) spin[i] = hot ? (rng() < 0.5 ? 1 : -1) : 1; return { spin, rng, mHist: [], eHist: [], sweeps: 0 }; }
function isingSweep(s: IS, T: number, h: number) { const { spin, rng } = s; for (let k = 0; k < IL * IL; k++) { const x = Math.floor(rng() * IL), y = Math.floor(rng() * IL), i = y * IL + x; const nb = spin[y * IL + ((x + 1) % IL)] + spin[y * IL + ((x + IL - 1) % IL)] + spin[((y + 1) % IL) * IL + x] + spin[((y + IL - 1) % IL) * IL + x]; const dE = 2 * spin[i] * (nb + h); if (dE <= 0 || rng() < Math.exp(-dE / Math.max(T, 1e-3))) spin[i] = -spin[i] as 1 | -1; } s.sweeps++; }
function isingStats(s: IS, h: number) { let m = 0, e = 0; for (let y = 0; y < IL; y++) for (let x = 0; x < IL; x++) { const i = y * IL + x; m += s.spin[i]; e += -s.spin[i] * (s.spin[y * IL + ((x + 1) % IL)] + s.spin[((y + 1) % IL) * IL + x]) - h * s.spin[i]; } return { m: m / (IL * IL), e: e / (IL * IL) }; }
const onsager = (T: number) => (T < TCI ? Math.pow(1 - Math.pow(Math.sinh(2 / T), -4), 0.125) : 0);
export const isingModel = defineSim<IS>({
  id: 'ising_model_phase_transition', title: 'Ising Model: Ferromagnetic Phase Transition (Metropolis Monte Carlo)',
  ...meta('Physics', 'Advanced', 'Statistical Mechanics', 'Phase Transitions', 'Metropolis algorithm, spontaneous magnetisation, critical temperature T_c = 2.269 J/k_B, hysteresis'),
  covers: ['Ising model', 'Phase transition', 'Statistical mechanics', 'Monte Carlo method', 'Metropolis algorithm', 'Spontaneous magnetisation', 'Critical temperature', 'Ferromagnetism'],
  tags: ['stat mech', 'Onsager', 'critical phenomena', 'Monte Carlo', 'ferromagnet', 'M.Sc physics', 'GATE PH'],
  learningObjectives: ['See domains form below T_c and dissolve above it.', 'Compare the simulated |m|(T) with Onsager’s exact curve for the 2-D lattice.', 'Apply an external field h and observe magnetisation reversal.'],
  assumptions: ['48×48 square lattice, periodic boundaries, J = k_B = 1, single-spin-flip Metropolis dynamics; finite-size effects round the transition near T_c.'],
  blurb: 'A 48×48 grid of ±1 spins evolves under Metropolis Monte Carlo. Lower the temperature through T_c ≈ 2.269 and watch ordered domains appear.',
  hint: 'Flip a random spin with probability min(1, e^{−ΔE/T}). Onsager: |m| = [1 − sinh⁻⁴(2/T)]^{1/8} for T < T_c = 2/ln(1+√2) ≈ 2.269. Near T_c fluctuations and correlation length diverge (critical slowing down).',
  params: [
    { kind: 'number', id: 'T', label: 'Temperature T (J/k_B)', min: 0.3, max: 5, step: 0.05, value: 2.0, digits: 2 },
    { kind: 'number', id: 'h', label: 'External field h (J)', min: -1, max: 1, step: 0.05, value: 0, digits: 2 },
    { kind: 'number', id: 'spf', label: 'Sweeps per frame', min: 1, max: 20, step: 1, value: 2, digits: 0 },
  ],
  actions: [{ id: 'hot', label: 'Randomise (T = ∞)' }, { id: 'cold', label: 'All spins up (T = 0)' }],
  dt: 1 / 20, previewSeconds: 3, init() { const s = isingInit(true, 9); return s; },
  action(s, _v, id) { Object.assign(s, isingInit(id === 'hot', 9 + s.sweeps)); },
  step(s, v) { const n = Math.round(num(v, 'spf')); for (let i = 0; i < n; i++) isingSweep(s, num(v, 'T'), num(v, 'h')); const st = isingStats(s, num(v, 'h')); s.mHist.push(st.m); s.eHist.push(st.e); if (s.mHist.length > 200) { s.mHist.shift(); s.eHist.shift(); } },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const side = Math.min(h - 16, w * 0.5), cs = side / IL;
    for (let y = 0; y < IL; y++) for (let x = 0; x < IL; x++) { c.fillStyle = s.spin[y * IL + x] > 0 ? '#fbbf24' : '#1e3a8a'; c.fillRect(8 + x * cs, 8 + y * cs, Math.ceil(cs), Math.ceil(cs)); }
    const px = side + 20, pw = w - px - 8; if (pw < 80) return; const H2 = (h - 24) / 2;
    const m1 = plot(c, { x: px, y: 8, w: pw, h: H2 }, [0.3, 5], [0, 1.05], { title: '|m| vs T (curve = Onsager exact)', xlabel: 'T' }); polyline(c, Array.from({ length: 200 }, (_, i) => { const T = 0.3 + (4.7 * i) / 199; return [m1.X(T), m1.Y(onsager(T))] as [number, number]; }), C.green, 2); line(c, m1.X(TCI), m1.Y(0), m1.X(TCI), m1.Y(1.05), C.red, 1, [4, 4]); text(c, 'T_c', m1.X(TCI) + 3, m1.Y(1.0), C.red, 10);
    const mm = s.mHist.length ? Math.abs(s.mHist.slice(-20).reduce((a, b) => a + Math.abs(b), 0) / Math.min(20, s.mHist.length)) : 0; circle(c, m1.X(num(v, 'T')), m1.Y(mm), 5, C.white, C.amber, 2);
    const m2 = plot(c, { x: px, y: 16 + H2, w: pw, h: H2 }, [0, 200], [-1.05, 1.05], { title: 'magnetisation m(t)', xlabel: 'sweeps (recent)', zeroAxis: true }); polyline(c, s.mHist.map((m, i) => [m2.X(i + 200 - s.mHist.length), m2.Y(m)] as [number, number]), C.cyan, 1.5);
  },
  readouts(s, v) { const st = isingStats(s, num(v, 'h')), T = num(v, 'T'); return [{ label: 'Magnetisation m', value: st.m, digits: 3 }, { label: 'Energy per spin', value: st.e, unit: 'J', digits: 3 }, { label: 'Phase (h = 0)', value: T < TCI ? 'ordered (ferromagnet)' : 'disordered (paramagnet)' }, { label: 'Onsager |m| at this T', value: onsager(T), digits: 3 }, { label: 'T_c (exact)', value: TCI, unit: 'J/k_B', digits: 4 }, { label: 'Sweeps', value: s.sweeps, digits: 0 }]; },
  equations() { return ['H=-J\\sum_{\\langle ij\\rangle}s_is_j-h\\sum_i s_i', 'P_{flip}=\\min(1,e^{-\\Delta E/k_BT})', 'k_BT_c=\\dfrac{2J}{\\ln(1+\\sqrt2)}\\approx2.269\\,J']; },
});

/* ============================ N-body gravity ============================ */
interface Body { x: number; y: number; vx: number; vy: number; m: number }
interface NBS { b: Body[]; trails: [number, number][][]; preset: string; e0: number; t: number; seed: number }
const accel = (b: Body[], eps: number) => b.map((bi, i) => { let ax = 0, ay = 0; b.forEach((bj, j) => { if (i === j) return; const dx = bj.x - bi.x, dy = bj.y - bi.y, r2 = dx * dx + dy * dy + eps * eps, inv = bj.m / (r2 * Math.sqrt(r2)); ax += dx * inv; ay += dy * inv; }); return [ax, ay]; });
const energyNB = (b: Body[], eps: number) => { let k = 0, u = 0; b.forEach((bi, i) => { k += 0.5 * bi.m * (bi.vx ** 2 + bi.vy ** 2); for (let j = i + 1; j < b.length; j++) { const dx = bi.x - b[j].x, dy = bi.y - b[j].y; u -= (bi.m * b[j].m) / Math.sqrt(dx * dx + dy * dy + eps * eps); } }); return k + u; };
function nbInit(preset: string, n: number, seed: number): Body[] {
  if (preset === 'figure8') return [{ x: -0.97000436, y: 0.24308753, vx: 0.466203685, vy: 0.43236573, m: 1 }, { x: 0.97000436, y: -0.24308753, vx: 0.466203685, vy: 0.43236573, m: 1 }, { x: 0, y: 0, vx: -0.93240737, vy: -0.86473146, m: 1 }];
  if (preset === 'solar') { const M = 1000, out: Body[] = [{ x: 0, y: 0, vx: 0, vy: 0, m: M }]; [[12, 0.5, 0], [20, 1, 1.2], [32, 0.8, 2.5], [48, 2, 4]].forEach(([r, m, ph]) => { const v = Math.sqrt(M / r); out.push({ x: r * Math.cos(ph), y: r * Math.sin(ph), vx: -v * Math.sin(ph), vy: v * Math.cos(ph), m }); }); return out; }
  if (preset === 'binary') { const m = 50, d = 8, v = Math.sqrt((m * 2) / (4 * d)) * 0.999; const out: Body[] = [{ x: -d / 2, y: 0, vx: 0, vy: -v, m }, { x: d / 2, y: 0, vx: 0, vy: v, m }]; const vp = Math.sqrt((2 * m) / 30); out.push({ x: 30, y: 0, vx: 0, vy: vp, m: 0.1 }); return out; }
  const rng = mulberry(seed), out: Body[] = []; for (let i = 0; i < n; i++) { const r = 4 + rng() * 14, a = rng() * TAU; out.push({ x: r * Math.cos(a), y: r * Math.sin(a), vx: -Math.sin(a) * 0.35 + (rng() - 0.5) * 0.15, vy: Math.cos(a) * 0.35 + (rng() - 0.5) * 0.15, m: 0.6 + rng() * 1.6 }); } const px = out.reduce((a, b) => a + b.m * b.vx, 0) / out.reduce((a, b) => a + b.m, 0), py = out.reduce((a, b) => a + b.m * b.vy, 0) / out.reduce((a, b) => a + b.m, 0); out.forEach(b => { b.vx -= px; b.vy -= py; }); return out;
}
function nbBuild(v: Record<string, number | string | boolean>, seed: number): NBS { const p = str(v, 'preset'), b = nbInit(p, Math.round(num(v, 'n')), seed); return { b, trails: b.map(() => []), preset: p + '/' + Math.round(num(v, 'n')), e0: energyNB(b, p === 'figure8' ? 0 : num(v, 'eps')), t: 0, seed }; }
export const nBody = defineSim<NBS>({
  id: 'n_body_gravity_simulator', title: 'N-Body Gravitational Simulator: Figure-8 Choreography, Planetary Systems & Clusters',
  ...meta('Physics', 'Advanced', 'Astrophysics', 'Celestial Mechanics', 'Newtonian N-body problem, leapfrog (symplectic) integration, energy conservation, chaos'),
  covers: ['N-body problem', 'Three-body problem', 'Gravitation', 'Orbital mechanics', 'Symplectic integrator', 'Conservation of energy', 'Chaos', 'Astrophysics'],
  tags: ['astrophysics', 'celestial mechanics', 'leapfrog', 'figure-eight', 'Chenciner Montgomery', 'GATE PH', 'M.Sc'],
  learningObjectives: ['See the stable figure-8 three-body choreography and how fragile it is to small changes.', 'Check how well a kick-drift-kick (leapfrog) integrator conserves total energy.', 'Watch a binary star perturb a planet, and a cluster scatter bodies by close encounters.'],
  assumptions: ['Newtonian gravity in 2-D with G = 1 (code units), optional Plummer softening ε, fixed-step leapfrog; no collisions or relativity. Close encounters need small ε or smaller steps.'],
  blurb: 'Integrate Newton’s law of gravitation for several bodies. Choose the famous figure-8 orbit, a solar-system-like system, a binary with a planet, or a random cluster.',
  hint: 'a_i = Σ_j G m_j (r_j − r_i)/(|r_j − r_i|² + ε²)^{3/2}. Leapfrog (KDK) is symplectic: energy error stays bounded. Chaotic systems amplify tiny differences exponentially.',
  params: [
    { kind: 'select', id: 'preset', label: 'System', value: 'figure8', options: [{ value: 'figure8', label: 'Figure-8 three-body orbit' }, { value: 'solar', label: 'Star + 4 planets' }, { value: 'binary', label: 'Binary star + planet' }, { value: 'cluster', label: 'Random cluster' }] },
    { kind: 'number', id: 'n', label: 'Bodies (cluster only)', min: 3, max: 12, step: 1, value: 6, digits: 0 },
    { kind: 'number', id: 'eps', label: 'Softening ε', min: 0, max: 1, step: 0.01, value: 0.05, digits: 2 },
    { kind: 'number', id: 'dtc', label: 'Time step', min: 0.0005, max: 0.02, step: 0.0005, value: 0.004, digits: 4 },
    { kind: 'number', id: 'spf', label: 'Steps per frame', min: 1, max: 60, step: 1, value: 8, digits: 0 },
    { kind: 'number', id: 'trail', label: 'Trail length', min: 0, max: 600, step: 10, value: 250, digits: 0 },
  ],
  actions: [{ id: 'reset', label: 'Restart this system' }, { id: 'nudge', label: 'Nudge one body (butterfly effect)' }],
  dt: 1 / 30, previewSeconds: 4,
  init(v) { return nbBuild(v, 5); },
  action(s, v, id) { if (id === 'reset') Object.assign(s, nbBuild(v, s.seed)); if (id === 'nudge') { s.b[0].vx += 1e-3; s.e0 = energyNB(s.b, str(v, 'preset') === 'figure8' ? 0 : num(v, 'eps')); } },
  step(s, v) {
    if (s.preset !== str(v, 'preset') + '/' + Math.round(num(v, 'n'))) Object.assign(s, nbBuild(v, s.seed)); const eps = str(v, 'preset') === 'figure8' ? 1e-3 : num(v, 'eps'), dt = num(v, 'dtc') * (str(v, 'preset') === 'solar' || str(v, 'preset') === 'binary' ? 4 : 1), n = Math.round(num(v, 'spf'));
    for (let k = 0; k < n; k++) { let a = accel(s.b, eps); s.b.forEach((p, i) => { p.vx += 0.5 * dt * a[i][0]; p.vy += 0.5 * dt * a[i][1]; p.x += dt * p.vx; p.y += dt * p.vy; }); a = accel(s.b, eps); s.b.forEach((p, i) => { p.vx += 0.5 * dt * a[i][0]; p.vy += 0.5 * dt * a[i][1]; }); s.t += dt; }
    const L = Math.round(num(v, 'trail')); s.b.forEach((p, i) => { s.trails[i].push([p.x, p.y]); while (s.trails[i].length > L) s.trails[i].shift(); });
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const eps = str(v, 'preset') === 'figure8' ? 1e-3 : num(v, 'eps'); let R = 1; s.b.forEach(p => { R = Math.max(R, Math.hypot(p.x, p.y)); }); R = str(v, 'preset') === 'figure8' ? 1.6 : str(v, 'preset') === 'solar' ? 55 : str(v, 'preset') === 'binary' ? 36 : Math.min(R * 1.1, 80); const sc = Math.min(w, h) / 2 / R * 0.92, cx = w / 2, cy = h / 2;
    s.trails.forEach((tr, i) => polyline(c, tr.map(p => [cx + p[0] * sc, cy + p[1] * sc] as [number, number]), hsl((i * 67) % 360, 80, 60, 0.7), 1.4));
    s.b.forEach((p, i) => { const r = clamp(3 + Math.cbrt(p.m) * 2.2, 3, 12); circle(c, cx + p.x * sc, cy + p.y * sc, str(v, 'preset') === 'solar' && i === 0 ? 10 : r, hsl((i * 67) % 360, 85, 62), C.white, 1); });
    text(c, `t = ${fmt(s.t, 2)}   ΔE/|E₀| = ${fmt((energyNB(s.b, eps) - s.e0) / Math.abs(s.e0 || 1) * 100, 4)} %`, 10, h - 10, C.dim, 11);
  },
  readouts(s, v) { const eps = str(v, 'preset') === 'figure8' ? 1e-3 : num(v, 'eps'), e = energyNB(s.b, eps); let px = 0, py = 0, L = 0; s.b.forEach(p => { px += p.m * p.vx; py += p.m * p.vy; L += p.m * (p.x * p.vy - p.y * p.vx); }); return [{ label: 'Bodies', value: s.b.length, digits: 0 }, { label: 'Total energy', value: e, digits: 5 }, { label: 'Energy drift', value: ((e - s.e0) / Math.abs(s.e0 || 1)) * 100, unit: '%', digits: 4 }, { label: 'Angular momentum L', value: L, digits: 4 }, { label: 'Net momentum |p|', value: Math.hypot(px, py), digits: 4 }, { label: 'Simulated time', value: s.t, digits: 2 }]; },
  equations() { return ['\\ddot{\\mathbf r}_i=\\sum_{j\\ne i}\\dfrac{Gm_j(\\mathbf r_j-\\mathbf r_i)}{(|\\mathbf r_j-\\mathbf r_i|^2+\\varepsilon^2)^{3/2}}', 'E=\\sum\\tfrac12 m_iv_i^2-\\sum_{i<j}\\dfrac{Gm_im_j}{\\sqrt{r_{ij}^2+\\varepsilon^2}}']; },
});

/* ============================ Lattice-Boltzmann Navier–Stokes: flow past a cylinder ============================ */
const NX = 140, NY = 56, CX = [0, 1, 0, -1, 0, 1, -1, -1, 1], CY = [0, 0, 1, 0, -1, 1, 1, -1, -1], WT = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36], OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6], U0 = 0.08, DIA = 14, CYL = { x: 36, y: NY / 2 + 1 };
const feq = (i: number, rho: number, ux: number, uy: number) => { const cu = 3 * (CX[i] * ux + CY[i] * uy); return WT[i] * rho * (1 + cu + 0.5 * cu * cu - 1.5 * (ux * ux + uy * uy)); };
interface LB { f: Float32Array; g: Float32Array; solid: Uint8Array; rho: Float32Array; ux: Float32Array; uy: Float32Array; steps: number; cd: number; cl: number; liftHist: number[]; crossings: number[]; blew: boolean; re: number }
function lbInit(re: number): LB {
  const N = NX * NY, f = new Float32Array(N * 9), solid = new Uint8Array(N); for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) { if ((x - CYL.x) ** 2 + (y - CYL.y) ** 2 <= (DIA / 2) ** 2) solid[y * NX + x] = 1; for (let i = 0; i < 9; i++) f[(y * NX + x) * 9 + i] = feq(i, 1, U0, 0); }
  return { f, g: new Float32Array(N * 9), solid, rho: new Float32Array(N).fill(1), ux: new Float32Array(N).fill(U0), uy: new Float32Array(N), steps: 0, cd: 0, cl: 0, liftHist: [], crossings: [], blew: false, re };
}
function lbStep(s: LB, re: number) {
  const nu = (U0 * DIA) / re, tau = 3 * nu + 0.5, om = 1 / tau, { f, g, solid } = s; let fx = 0, fy = 0;
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    const n = y * NX + x, b = n * 9; if (solid[n]) continue; let rho = 0, ux = 0, uy = 0; for (let i = 0; i < 9; i++) { const q = f[b + i]; rho += q; ux += q * CX[i]; uy += q * CY[i]; } ux /= rho; uy /= rho; s.rho[n] = rho; s.ux[n] = ux; s.uy[n] = uy;
    for (let i = 0; i < 9; i++) { const post = f[b + i] + om * (feq(i, rho, ux, uy) - f[b + i]); const xn = x + CX[i], yn = y + CY[i]; if (xn < 0 || xn >= NX || yn < 0 || yn >= NY) continue; const nn = yn * NX + xn; if (solid[nn]) { g[b + OPP[i]] = post; fx += 2 * post * CX[i]; fy += 2 * post * CY[i]; } else g[nn * 9 + i] = post; }
  }
  for (let y = 0; y < NY; y++) { for (let i = 0; i < 9; i++) { g[(y * NX) * 9 + i] = feq(i, 1, U0, 0); g[(y * NX + NX - 1) * 9 + i] = g[(y * NX + NX - 2) * 9 + i]; } }
  for (let x = 0; x < NX; x++) for (let i = 0; i < 9; i++) { g[x * 9 + i] = feq(i, 1, U0, 0); g[((NY - 1) * NX + x) * 9 + i] = feq(i, 1, U0, 0); }
  s.f = g; s.g = f; s.steps++; const norm = 0.5 * U0 * U0 * DIA; s.cd += 0.02 * (fx / norm - s.cd); const cl = fy / norm; s.cl += 0.1 * (cl - s.cl);
  if (s.steps % 10 === 0) { s.liftHist.push(s.cl); if (s.liftHist.length > 300) s.liftHist.shift(); const n = s.liftHist.length; if (n > 2 && s.liftHist[n - 2] < 0 && s.liftHist[n - 1] >= 0) { s.crossings.push(s.steps); if (s.crossings.length > 8) s.crossings.shift(); } }
  const mid = s.ux[(NY / 2) * NX + NX - 6]; if (!Number.isFinite(mid) || Math.abs(mid) > 0.5) s.blew = true;
}
const heat = (t: number) => { t = clamp(t, 0, 1); return `hsl(${240 - 240 * t},85%,${25 + 35 * t}%)`; };
export const lbmCylinder = defineSim<LB>({
  id: 'navier_stokes_lbm_cylinder', title: 'Navier–Stokes Flow Past a Cylinder: Laminar, Vortex Shedding & Drag (Lattice Boltzmann)',
  ...meta('Engineering', 'Advanced', 'Fluid Mechanics', 'Computational Fluid Dynamics', 'Reynolds number, von Kármán vortex street, drag coefficient, Strouhal number, lattice Boltzmann D2Q9'),
  covers: ['Navier–Stokes equations', 'Reynolds number', 'Vortex shedding', 'Drag coefficient', 'Strouhal number', 'Laminar flow', 'Lattice Boltzmann method', 'Computational fluid dynamics', 'Flow past a cylinder'],
  tags: ['CFD', 'fluid dynamics', 'von Karman', 'LBM', 'D2Q9', 'GATE ME', 'turbulence onset', 'M.Tech'],
  learningObjectives: ['Watch the flow change from steady symmetric wake (low Re) to an alternating von Kármán vortex street (Re ≳ 50).', 'Read the drag coefficient and the Strouhal number St = fD/U from the simulation.', 'Compare speed, vorticity and pressure views of the same Navier–Stokes solution.'],
  assumptions: ['2-D incompressible-limit lattice-Boltzmann (D2Q9, BGK) with U₀ = 0.08, cylinder D = 14 cells in a 140×56 channel with far-field top/bottom boundaries, so blockage (25 %) raises St and C_d above free-stream values. Re ≤ 140 for numerical stability; true 3-D turbulence is not captured.'],
  blurb: 'A real Navier–Stokes solver (lattice Boltzmann) pushes fluid past a cylinder. Raise the Reynolds number to see the wake become unstable and shed vortices.',
  hint: 'Re = U·D/ν. Below Re ≈ 47 the wake is steady; above it vortices shed alternately with Strouhal number St ≈ 0.2. Drag coefficient C_d = F_x /(½ρU²D) falls with Re. Colour: speed |u|, vorticity ω = ∂v/∂x − ∂u/∂y, or pressure.',
  params: [
    { kind: 'number', id: 're', label: 'Reynolds number Re', min: 5, max: 140, step: 1, value: 100, digits: 0 },
    { kind: 'select', id: 'view', label: 'Show', value: 'vort', options: [{ value: 'speed', label: 'Speed |u|' }, { value: 'vort', label: 'Vorticity ω' }, { value: 'press', label: 'Pressure' }] },
    { kind: 'number', id: 'spf', label: 'LBM steps per frame', min: 1, max: 30, step: 1, value: 10, digits: 0 },
  ],
  actions: [{ id: 'reset', label: 'Restart flow' }],
  dt: 1 / 30, previewSeconds: 8,
  init(v) { return lbInit(num(v, 're')); },
  action(s, v) { Object.assign(s, lbInit(num(v, 're'))); },
  step(s, v) { if (s.blew) { Object.assign(s, lbInit(Math.min(num(v, 're'), 100))); } if (Math.abs(s.re - num(v, 're')) > 0.5) { s.re = num(v, 're'); s.crossings = []; } const n = Math.round(num(v, 'spf')); for (let k = 0; k < n; k++) lbStep(s, s.re); },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const cs = Math.min((w - 16) / NX, (h - 90) / NY), ox = (w - NX * cs) / 2, oy = 8, mode = str(v, 'view');
    for (let y = 1; y < NY - 1; y++) for (let x = 1; x < NX - 1; x++) { const n = y * NX + x; if (s.solid[n]) continue; let t: number;
      if (mode === 'speed') t = Math.hypot(s.ux[n], s.uy[n]) / (U0 * 1.8); else if (mode === 'press') t = 0.5 + ((s.rho[n] - 1) / 3) * 25; else t = 0.5 + ((s.uy[n + 1] - s.uy[n - 1]) - (s.ux[n + NX] - s.ux[n - NX])) * 0.5 * 9; c.fillStyle = heat(t); c.fillRect(ox + x * cs, oy + y * cs, Math.ceil(cs), Math.ceil(cs)); }
    circle(c, ox + CYL.x * cs, oy + CYL.y * cs, (DIA / 2) * cs, '#e2e8f0', C.white, 1);
    const P = { x: 8, y: oy + NY * cs + 4, w: w - 16, h: h - oy - NY * cs - 8 }; if (P.h > 50) { const m = plot(c, P, [0, 300], [-1.2, 1.2], { title: 'Lift coefficient C_l (oscillation = vortex shedding)', zeroAxis: true }); polyline(c, s.liftHist.map((l, i) => [m.X(i), m.Y(clamp(l, -1.2, 1.2))] as [number, number]), C.cyan, 1.5); }
    if (s.blew) text(c, 'numerical instability: restarting at lower Re', 12, 20, C.red, 12);
  },
  readouts(s) { let st = NaN; if (s.crossings.length >= 3) { const per = (s.crossings[s.crossings.length - 1] - s.crossings[0]) / (s.crossings.length - 1); st = (DIA / per) * U0 / U0 * (1 / 1); st = DIA / per; } const nu = (U0 * DIA) / s.re; return [{ label: 'Reynolds number', value: s.re, digits: 0 }, { label: 'Kinematic viscosity ν (lattice)', value: nu, digits: 4 }, { label: 'Drag coefficient C_d (smoothed)', value: s.cd, digits: 2 }, { label: 'Strouhal number St = fD/U', value: Number.isFinite(st) ? st : 'measuring…', digits: 3 }, { label: 'Flow regime', value: s.re < 47 ? 'steady wake' : s.re < 140 ? 'periodic vortex shedding' : 'transitional' }, { label: 'LBM steps', value: s.steps, digits: 0 }]; },
  equations() { return ['\\partial_t\\mathbf u+(\\mathbf u\\!\\cdot\\!\\nabla)\\mathbf u=-\\tfrac1\\rho\\nabla p+\\nu\\nabla^2\\mathbf u', 'Re=\\dfrac{UD}{\\nu},\\ \\ C_d=\\dfrac{F_x}{\\tfrac12\\rho U^2D},\\ \\ St=\\dfrac{fD}{U}', '\\nu=\\tfrac13\\left(\\tau-\\tfrac12\\right)']; },
});
