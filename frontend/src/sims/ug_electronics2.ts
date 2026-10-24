import { defineSim, num, str, bool, UG_ENG } from './types';
import type { EducationLevel, Difficulty } from './types';
import { C, TAU, circle, clamp, fmt, line, plot, polyline, text, deg } from './draw';

const meta = (levels: EducationLevel[], difficulty: Difficulty, category: string, topic: string, subtopic: string) => ({
  subject: 'Electronics' as const, status: 'active' as const, educationLevels: levels, difficulty, category, topic, subtopic,
});
const ENG: EducationLevel[] = [...UG_ENG, 'B.Sc'];

/* ================================================================== */
/*  PID control                                                        */
/* ================================================================== */
interface PidS { t: number; x1: number; x2: number; integ: number; prevE: number; hist: { t: number; r: number; y: number; u: number }[]; acc: number; stepT: number; stepV: number }
const PLANTS: Record<string, string> = { second: 'Second-order (ωn = 2, ζ = 0.3)', lag: 'First-order lag (τ = 1 s)', integ: 'Integrator + lag (motor position)', unstable: 'Unstable pole (e^{t})' };
export const pid = defineSim<PidS>({
  id: 'pid_control', title: 'PID Controller Tuning: Step Response of a Closed Loop',
  ...meta(ENG, 'Intermediate', 'Control Systems', 'Control Systems', 'PID controller, step response, overshoot and settling'),
  covers: ['PID controller', 'Step response', 'Overshoot', 'Settling time', 'Steady-state error', 'Integral windup'],
  tags: ['GATE', 'control', 'EE', 'ECE', 'instrumentation', 'Ziegler-Nichols', 'Kp Ki Kd', 'feedback'],
  learningObjectives: ['See what P, I and D each do to rise time, overshoot and steady-state error.', 'Read overshoot, rise time and settling time from the response.', 'Recognise instability and integral windup.'],
  assumptions: ['Continuous-time plant simulated with a small fixed step; controller output is limited to ±20 (actuator saturation) with simple anti-windup clamping.'],
  blurb: 'Close a feedback loop around a plant and tune Kp, Ki and Kd. The reference toggles between 0 and 1; the measured overshoot, rise time and settling time update after each step.',
  hint: 'u = Kp e + Ki ∫e dt + Kd de/dt. Larger Kp: faster but more overshoot. Ki removes steady-state error but can cause oscillation/windup. Kd adds damping. The unstable plant needs enough Kp to be stabilised.',
  params: [
    { kind: 'select', id: 'plant', label: 'Plant', value: 'second', options: Object.entries(PLANTS).map(([k, n]) => ({ value: k, label: n })), resetOnChange: true },
    { kind: 'number', id: 'kp', label: 'Kp', min: 0, max: 30, step: 0.1, value: 4, digits: 1 },
    { kind: 'number', id: 'ki', label: 'Ki', min: 0, max: 30, step: 0.1, value: 2, digits: 1 },
    { kind: 'number', id: 'kd', label: 'Kd', min: 0, max: 10, step: 0.05, value: 0.6, digits: 2 },
    { kind: 'number', id: 'per', label: 'Reference period', min: 4, max: 20, step: 1, value: 10, unit: 's', digits: 0 },
    { kind: 'toggle', id: 'dist', label: 'Load disturbance (+0.3)', value: false },
  ],
  actions: [{ id: 'reset', label: 'Reset' }],
  dt: 1 / 500, previewSeconds: 12,
  init() { return { t: 0, x1: 0, x2: 0, integ: 0, prevE: 0, hist: [], acc: 0, stepT: 0, stepV: 1 }; },
  action(s) { s.x1 = 0; s.x2 = 0; s.integ = 0; s.prevE = 0; s.hist = []; s.t = 0; s.stepT = 0; },
  step(s, v, dt) {
    const per = num(v, 'per'), r = Math.floor(s.t / (per / 2)) % 2 === 0 ? 1 : 0;
    if (Math.floor(s.t / (per / 2)) !== Math.floor((s.t - dt) / (per / 2))) s.stepT = s.t;
    const y = str(v, 'plant') === 'second' || str(v, 'plant') === 'integ' ? s.x1 : s.x1, e = r - y;
    s.integ = clamp(s.integ + e * dt, -20 / Math.max(num(v, 'ki'), 0.1), 20 / Math.max(num(v, 'ki'), 0.1));
    const d = (e - s.prevE) / dt; s.prevE = e;
    const u = clamp(num(v, 'kp') * e + num(v, 'ki') * s.integ + num(v, 'kd') * d, -20, 20) + (bool(v, 'dist') ? -0.3 : 0);
    const kind = str(v, 'plant');
    if (kind === 'second') { const wn = 2, z = 0.3; const a = wn * wn * u - 2 * z * wn * s.x2 - wn * wn * s.x1; s.x2 += a * dt; s.x1 += s.x2 * dt; }
    else if (kind === 'lag') { s.x1 += ((u - s.x1) / 1) * dt; }
    else if (kind === 'integ') { s.x2 += ((u - s.x2) / 0.5) * dt; s.x1 += s.x2 * dt; }
    else { s.x1 += (s.x1 + u) * dt; }
    s.x1 = clamp(s.x1, -50, 50); s.t += dt; s.acc += dt;
    if (s.acc > 0.04) { s.acc = 0; s.hist.push({ t: s.t, r, y: s.x1, u }); if (s.hist.length > 700) s.hist.shift(); }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const t0 = s.hist.length ? s.hist[0].t : 0, t1 = Math.max(s.t, t0 + 10), top = { x: 8, y: 8, w: w - 16, h: h * 0.62 }, bot = { x: 8, y: h * 0.62 + 16, w: w - 16, h: h * 0.38 - 24 };
    const ymax = Math.max(1.6, ...s.hist.map(q => q.y)), ymin = Math.min(-0.2, ...s.hist.map(q => q.y));
    const m = plot(c, top, [t0, t1], [Math.max(ymin, -3), Math.min(ymax, 4)], { title: 'Output y and reference r', xlabel: '', ystep: 0.5 });
    polyline(c, s.hist.map(q => [m.X(q.t), m.Y(clamp(q.r, -3, 4))] as [number, number]), 'rgba(148,163,184,0.9)', 1.5, [5, 3]); polyline(c, s.hist.map(q => [m.X(q.t), m.Y(clamp(q.y, -3, 4))] as [number, number]), C.cyan, 2.2);
    const m2 = plot(c, bot, [t0, t1], [-20, 20], { title: 'Control effort u', xlabel: 'time (s)', ystep: 10 }); polyline(c, s.hist.map(q => [m2.X(q.t), m2.Y(q.u)] as [number, number]), C.amber, 1.6);
    void v;
  },
  readouts(s) {
    // analyse the most recent rising step
    const per = s.hist.length > 4 ? 0 : 0; void per;
    const st = s.stepT; const seg = s.hist.filter(q => q.t >= st && q.r === 1);
    if (seg.length < 5) return [{ label: 'Waiting for a full step…', value: '' }];
    const yfin = seg[seg.length - 1].y, peak = Math.max(...seg.map(q => q.y)), os = Math.max(0, (peak - 1) * 100);
    const tr = seg.find(q => q.y >= 0.9)?.t, tr1 = seg.find(q => q.y >= 0.1)?.t;
    let ts = NaN; for (let i = seg.length - 1; i >= 0; i--) if (Math.abs(seg[i].y - 1) > 0.02) { ts = seg[Math.min(i + 1, seg.length - 1)].t - st; break; }
    return [{ label: 'Overshoot', value: os, unit: '%', digits: 1 }, { label: 'Rise time (10-90 %)', value: tr && tr1 ? tr - tr1 : 'not reached', unit: tr && tr1 ? 's' : '', digits: 2 }, { label: 'Settling (±2 %)', value: Number.isFinite(ts) ? ts : 'not settled', unit: Number.isFinite(ts) ? 's' : '', digits: 2 },
      { label: 'Final error', value: Math.abs(1 - yfin), digits: 3 }];
  },
  equations(_s, v) { return ['u(t) = K_p e + K_i\\!\\int e\\,dt + K_d \\dfrac{de}{dt}', `K_p=${fmt(num(v, 'kp'), 1)},\\ K_i=${fmt(num(v, 'ki'), 1)},\\ K_d=${fmt(num(v, 'kd'), 2)}`]; },
});

/* ================================================================== */
/*  Bode plot & stability margins                                      */
/* ================================================================== */
interface BdS { t: number }
function loopGain(sys: string, K: number, p1: number, p2: number, Td: number, w: number): [number, number] {
  // returns [magnitude, phase rad]
  const jw = (re: number, im: number) => ({ re, im }); const mul = (a: { re: number; im: number }, b: { re: number; im: number }) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
  const div = (a: { re: number; im: number }, b: { re: number; im: number }) => { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; };
  let L = jw(K, 0);
  if (sys === 'type1') L = div(L, mul(jw(0, w), mul(jw(1, w / p1), jw(1, w / p2))));
  else if (sys === 'type0') L = div(L, mul(jw(1, w / p1), mul(jw(1, w / p2), jw(1, w / (p2 * 3)))));
  else L = div(L, mul(jw(0, w), mul(jw(1, w / p1), jw(1, w / p2)))), L = mul(L, jw(1, w / (p1 * 0.5))); // type1 + lead zero
  const dly = { re: Math.cos(w * Td), im: -Math.sin(w * Td) }; L = mul(L, dly);
  return [Math.hypot(L.re, L.im), Math.atan2(L.im, L.re)];
}
function margins(sys: string, K: number, p1: number, p2: number, Td: number) {
  let wgc = NaN, wpc = NaN, prev: [number, number] | null = null, unwrap = 0, prevPh = 0;
  const data: { w: number; mag: number; ph: number }[] = [];
  for (let i = 0; i <= 600; i++) {
    const w = 10 ** (-2 + (i / 600) * 5); const [m, ph0] = loopGain(sys, K, p1, p2, Td, w); let ph = ph0 + unwrap; if (i > 0 && Math.abs(ph - prevPh) > Math.PI) { unwrap += ph > prevPh ? -TAU : TAU; ph = ph0 + unwrap; }
    prevPh = ph; data.push({ w, mag: 20 * Math.log10(m), ph: deg(ph) });
    if (prev && Number.isNaN(wgc) && prev[0] >= 1 && m < 1) wgc = w; if (prev && Number.isNaN(wpc) && deg(prevPh) > -180 && deg(ph) <= -180 && i > 0) wpc = w; prev = [m, ph];
  }
  const g = (w: number) => data.reduce((b, q) => (Math.abs(Math.log(q.w / w)) < Math.abs(Math.log(b.w / w)) ? q : b), data[0]);
  return { data, wgc, wpc, pm: Number.isFinite(wgc) ? 180 + g(wgc).ph : NaN, gm: Number.isFinite(wpc) ? -g(wpc).mag : NaN };
}
export const bode = defineSim<BdS>({
  id: 'bode_margins', title: 'Bode Plot: Gain Margin & Phase Margin',
  ...meta(ENG, 'Advanced', 'Control Systems', 'Control Systems', 'Frequency response and relative stability'),
  covers: ['Bode plot', 'Gain margin', 'Phase margin', 'Gain crossover frequency', 'Time delay and stability', 'Relative stability'],
  tags: ['GATE', 'control', 'EE', 'ECE', 'frequency response', 'open loop', 'Nyquist', 'corner frequency'],
  learningObjectives: ['Read the gain crossover and phase crossover frequencies from the Bode plot.', 'Compute phase margin PM = 180° + ∠L(jωgc) and gain margin.', 'See how gain K and time delay erode the margins and eventually cause instability.'],
  assumptions: ['Open-loop transfer functions with real poles and an optional pure delay; unity negative feedback.'],
  blurb: 'Build an open-loop transfer function, raise the gain or add delay and watch the crossover frequencies and margins move. A negative phase margin means the closed loop is unstable.',
  hint: 'L(s) = K / [s (1+s/p1)(1+s/p2)] · e^{−sTd}. At gain crossover |L|=0 dB; PM = 180°+∠L. At phase crossover ∠L=−180°; GM = −|L|dB. Stable if PM>0 and GM>0 dB.',
  params: [
    { kind: 'select', id: 'sys', label: 'System type', value: 'type1', options: [{ value: 'type1', label: 'Type 1: K/[s(1+s/p1)(1+s/p2)]' }, { value: 'type0', label: 'Type 0: K/[(1+s/p1)(1+s/p2)(1+s/3p2)]' }, { value: 'lead', label: 'Type 1 with lead zero' }] },
    { kind: 'number', id: 'K', label: 'Gain K', min: 0.1, max: 200, step: 0.1, value: 4, digits: 1 },
    { kind: 'number', id: 'p1', label: 'Pole p1', min: 0.1, max: 20, step: 0.1, value: 1, unit: 'rad/s', digits: 1 },
    { kind: 'number', id: 'p2', label: 'Pole p2', min: 0.5, max: 100, step: 0.5, value: 5, unit: 'rad/s', digits: 1 },
    { kind: 'number', id: 'Td', label: 'Time delay', min: 0, max: 1, step: 0.01, value: 0, unit: 's', digits: 2 },
  ],
  dt: 1 / 30, previewSeconds: 0, init() { return { t: 0 }; }, step() { /* static */ },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const sys = str(v, 'sys'), r = margins(sys, num(v, 'K'), num(v, 'p1'), num(v, 'p2'), num(v, 'Td'));
    const A = { x: 8, y: 8, w: w - 16, h: h * 0.5 - 12 }, B = { x: 8, y: h * 0.5 + 4, w: w - 16, h: h * 0.5 - 12 };
    const mags = r.data.map(q => q.mag), phs = r.data.map(q => q.ph), my: [number, number] = [Math.floor(Math.max(Math.min(...mags), -80) / 20) * 20, Math.ceil(Math.min(Math.max(...mags), 80) / 20) * 20], py: [number, number] = [Math.floor(Math.max(Math.min(...phs), -360) / 45) * 45, Math.max(45, Math.ceil(Math.max(...phs) / 45) * 45)];
    const lg = (x: number) => Math.log10(x);
    const ma = plot(c, A, [-2, 3], my, { title: 'Magnitude (dB)', ystep: 20, xstep: 1 }); const pa = plot(c, B, [-2, 3], py, { title: 'Phase (°)', xlabel: 'log₁₀ ω (rad/s)', ystep: 90, xstep: 1 });
    polyline(c, r.data.map(q => [ma.X(lg(q.w)), ma.Y(clamp(q.mag, my[0], my[1]))] as [number, number]), C.cyan, 2.2); polyline(c, r.data.map(q => [pa.X(lg(q.w)), pa.Y(clamp(q.ph, py[0], py[1]))] as [number, number]), C.amber, 2.2);
    line(c, ma.X(-2), ma.Y(0), ma.X(3), ma.Y(0), C.red, 1, [4, 3]); line(c, pa.X(-2), pa.Y(-180), pa.X(3), pa.Y(-180), C.red, 1, [4, 3]);
    if (Number.isFinite(r.wgc)) { line(c, ma.X(lg(r.wgc)), ma.Y(my[0]), ma.X(lg(r.wgc)), ma.Y(my[1]), C.green, 1, [3, 3]); line(c, pa.X(lg(r.wgc)), pa.Y(py[0]), pa.X(lg(r.wgc)), pa.Y(py[1]), C.green, 1, [3, 3]); circle(c, pa.X(lg(r.wgc)), pa.Y(-180 + r.pm), 4.5, C.green); text(c, `PM ${fmt(r.pm, 0)}°`, pa.X(lg(r.wgc)) + 6, pa.Y(-180 + r.pm) - 6, C.green, 11, 'left', 'alphabetic', true); }
    if (Number.isFinite(r.wpc)) { line(c, ma.X(lg(r.wpc)), ma.Y(my[0]), ma.X(lg(r.wpc)), ma.Y(my[1]), C.pink, 1, [3, 3]); circle(c, ma.X(lg(r.wpc)), ma.Y(-r.gm), 4.5, C.pink); text(c, `GM ${fmt(r.gm, 1)} dB`, ma.X(lg(r.wpc)) + 6, ma.Y(-r.gm) - 6, C.pink, 11, 'left', 'alphabetic', true); }
    text(c, Number.isFinite(r.pm) && r.pm > 0 && (Number.isNaN(r.gm) || r.gm > 0) ? 'closed loop STABLE' : 'closed loop UNSTABLE / marginal', w - 16, 24, Number.isFinite(r.pm) && r.pm > 0 && (Number.isNaN(r.gm) || r.gm > 0) ? C.green : C.red, 12, 'right', 'alphabetic', true);
  },
  readouts(_s, v) {
    const r = margins(str(v, 'sys'), num(v, 'K'), num(v, 'p1'), num(v, 'p2'), num(v, 'Td')), ok = Number.isFinite(r.pm) ? r.pm > 0 && (Number.isNaN(r.gm) || r.gm > 0) : true;
    return [{ label: 'Gain crossover ωgc', value: Number.isFinite(r.wgc) ? r.wgc : 'none', unit: Number.isFinite(r.wgc) ? 'rad/s' : '', digits: 2 }, { label: 'Phase margin', value: Number.isFinite(r.pm) ? r.pm : 'n/a', unit: Number.isFinite(r.pm) ? '°' : '', digits: 1 }, { label: 'Phase crossover ωpc', value: Number.isFinite(r.wpc) ? r.wpc : 'none', unit: Number.isFinite(r.wpc) ? 'rad/s' : '', digits: 2 },
      { label: 'Gain margin', value: Number.isFinite(r.gm) ? r.gm : 'infinite', unit: Number.isFinite(r.gm) ? 'dB' : '', digits: 1 }, { label: 'Closed loop', value: ok ? 'stable' : 'unstable' }];
  },
  equations(_s, v) { return ['\\text{PM} = 180^\\circ + \\angle L(j\\omega_{gc}),\\quad \\text{GM} = -20\\log|L(j\\omega_{pc})|', `K = ${fmt(num(v, 'K'), 1)},\\ T_d = ${fmt(num(v, 'Td'), 2)}\\ \\text{s}`]; },
});

/* ================================================================== */
/*  Op-amp circuits                                                    */
/* ================================================================== */
interface OaS { t: number; vo: number; hist: { t: number; vi: number; vo: number }[]; acc: number }
const OAMODES: Record<string, string> = { inv: 'Inverting amplifier', non: 'Non-inverting amplifier', int: 'Integrator (RC feedback)', dif: 'Differentiator', buf: 'Voltage follower' };
export const opamp = defineSim<OaS>({
  id: 'opamp_circuits', title: 'Op-Amp Circuits: Gain, Integration & Saturation',
  ...meta(ENG, 'Intermediate', 'Analog Electronics', 'Analog Electronics', 'Ideal op-amp configurations and output saturation'),
  covers: ['Inverting amplifier', 'Non-inverting amplifier', 'Op-amp integrator', 'Op-amp differentiator', 'Virtual short', 'Output saturation'],
  tags: ['GATE', 'ECE', 'EE', 'analog', 'virtual ground', 'closed loop gain', 'slew rate', 'clipping'],
  learningObjectives: ['Compute closed-loop gain: −Rf/Rin (inverting), 1+Rf/Rin (non-inverting).', 'See an integrator turn a square wave into a triangle (and drift into saturation).', 'Recognise clipping at the supply rails.'],
  assumptions: ['Ideal op-amp (infinite gain and bandwidth, zero input current) with output limited to ±(Vcc − 1.5 V).', 'Differentiator output is band-limited by a small series resistor in the model.'],
  blurb: 'Pick a configuration, choose resistors and a signal, and watch the output follow the ideal op-amp equations until it hits the supply rails.',
  hint: 'Virtual short: V+ = V−. Inverting: Vout = −(Rf/Rin) Vin. Non-inverting: Vout = (1 + Rf/Rin) Vin. Integrator: Vout = −(1/RC)∫Vin dt. Output clips at the rails.',
  params: [
    { kind: 'select', id: 'mode', label: 'Circuit', value: 'inv', options: Object.entries(OAMODES).map(([k, n]) => ({ value: k, label: n })), resetOnChange: true },
    { kind: 'select', id: 'wave', label: 'Input signal', value: 'sine', options: [{ value: 'sine', label: 'Sine' }, { value: 'square', label: 'Square' }, { value: 'tri', label: 'Triangle' }] },
    { kind: 'number', id: 'Vp', label: 'Input amplitude', min: 0.1, max: 5, step: 0.1, value: 1, unit: 'V', digits: 1 },
    { kind: 'number', id: 'f', label: 'Frequency', min: 10, max: 5000, step: 10, value: 500, unit: 'Hz', digits: 0 },
    { kind: 'number', id: 'Rin', label: 'Rin', min: 1, max: 100, step: 1, value: 10, unit: 'kΩ', digits: 0 },
    { kind: 'number', id: 'Rf', label: 'Rf', min: 1, max: 1000, step: 1, value: 40, unit: 'kΩ', digits: 0 },
    { kind: 'number', id: 'Cf', label: 'C (integrator/differentiator)', min: 1, max: 200, step: 1, value: 20, unit: 'nF', digits: 0 },
    { kind: 'number', id: 'Vcc', label: 'Supply ±Vcc', min: 5, max: 18, step: 1, value: 12, unit: 'V', digits: 0 },
  ],
  dt: 1 / 48000, previewSeconds: 0.01,
  init() { return { t: 0, vo: 0, hist: [], acc: 0 }; },
  step(s, v, dt) {
    const f = num(v, 'f'), Vp = num(v, 'Vp'), ph = (s.t * f) % 1, wave = str(v, 'wave');
    const vi = wave === 'sine' ? Vp * Math.sin(TAU * ph) : wave === 'square' ? (ph < 0.5 ? Vp : -Vp) : Vp * (ph < 0.25 ? 4 * ph : ph < 0.75 ? 2 - 4 * ph : 4 * ph - 4);
    const Rin = num(v, 'Rin') * 1e3, Rf = num(v, 'Rf') * 1e3, Cf = num(v, 'Cf') * 1e-9, rail = num(v, 'Vcc') - 1.5, mode = str(v, 'mode');
    let vo = s.vo;
    if (mode === 'inv') vo = -(Rf / Rin) * vi; else if (mode === 'non') vo = (1 + Rf / Rin) * vi; else if (mode === 'buf') vo = vi;
    else if (mode === 'int') { vo = s.vo - (vi / (Rin * Cf)) * dt; } else { const prev = (s as unknown as { pv?: number }).pv ?? vi; vo = -Rf * Cf * ((vi - prev) / dt); (s as unknown as { pv?: number }).pv = vi; vo = s.vo + (vo - s.vo) * 0.2; }
    s.vo = clamp(vo, -rail, rail); s.t += dt; s.acc += dt;
    if (s.acc > 1 / (f * 200)) { s.acc = 0; s.hist.push({ t: s.t, vi, vo: s.vo }); if (s.hist.length > 900) s.hist.shift(); }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const f = num(v, 'f'), t1 = s.hist.length ? s.hist[s.hist.length - 1].t : 0, span = 4 / f, rail = num(v, 'Vcc') - 1.5, lim = Math.max(rail * 1.1, 2);
    const P = { x: 8, y: 8, w: w - 16, h: h - 16 }; const m = plot(c, P, [(t1 - span) * 1000, t1 * 1000], [-lim, lim], { title: `${OAMODES[str(v, 'mode')]}: Vin (cyan) and Vout (amber)`, xlabel: 'time (ms)', zeroAxis: true, ystep: lim > 10 ? 5 : 2 });
    const vis = s.hist.filter(q => q.t >= t1 - span);
    polyline(c, vis.map(q => [m.X(q.t * 1000), m.Y(q.vi)] as [number, number]), C.cyan, 1.8); polyline(c, vis.map(q => [m.X(q.t * 1000), m.Y(q.vo)] as [number, number]), C.amber, 2.4);
    line(c, m.X((t1 - span) * 1000), m.Y(rail), m.X(t1 * 1000), m.Y(rail), C.red, 1, [4, 3]); line(c, m.X((t1 - span) * 1000), m.Y(-rail), m.X(t1 * 1000), m.Y(-rail), C.red, 1, [4, 3]); text(c, '+Vsat', P.x + 40, m.Y(rail) - 3, C.red, 9); text(c, '−Vsat', P.x + 40, m.Y(-rail) + 11, C.red, 9);
    const clip = vis.some(q => Math.abs(q.vo) >= rail - 1e-6); if (clip) text(c, 'CLIPPING', P.x + P.w - 12, P.y + 34, C.red, 12, 'right', 'alphabetic', true);
  },
  readouts(s, v) {
    const Rin = num(v, 'Rin'), Rf = num(v, 'Rf'), mode = str(v, 'mode'), pk = s.hist.length ? Math.max(...s.hist.map(q => Math.abs(q.vo))) : 0;
    const gain = mode === 'inv' ? -Rf / Rin : mode === 'non' ? 1 + Rf / Rin : mode === 'buf' ? 1 : NaN;
    return [{ label: 'Closed-loop gain', value: Number.isFinite(gain) ? gain : 'frequency dependent', digits: 2 }, { label: 'Gain in dB', value: Number.isFinite(gain) ? 20 * Math.log10(Math.abs(gain)) : '-', unit: Number.isFinite(gain) ? 'dB' : '', digits: 1 }, { label: 'Peak output', value: pk, unit: 'V', digits: 2 }, { label: 'Rails', value: `±${fmt(num(v, 'Vcc') - 1.5, 1)} V` }, { label: 'Integrator RC', value: num(v, 'Rin') * 1e3 * num(v, 'Cf') * 1e-9 * 1000, unit: 'ms', digits: 3 }];
  },
  equations(_s, v) { const mode = str(v, 'mode'); return [mode === 'inv' ? 'V_o = -\\dfrac{R_f}{R_{in}}V_{in}' : mode === 'non' ? 'V_o = \\left(1+\\dfrac{R_f}{R_{in}}\\right)V_{in}' : mode === 'int' ? 'V_o = -\\dfrac{1}{R C}\\int V_{in}\\,dt' : mode === 'dif' ? 'V_o = -R C\\,\\dfrac{dV_{in}}{dt}' : 'V_o = V_{in}']; },
});

/* ================================================================== */
/*  Rectifier with filter                                              */
/* ================================================================== */
interface RcS { t: number; vc: number; hist: { t: number; vs: number; vo: number }[]; acc: number }
export const rectifier = defineSim<RcS>({
  id: 'rectifier_filter', title: 'Rectifier with Capacitor Filter: Ripple & Conduction Angle',
  ...meta(ENG, 'Intermediate', 'Power Electronics', 'Analog Electronics', 'Half-wave and full-wave rectifiers, smoothing capacitor'),
  covers: ['Half-wave rectifier', 'Full-wave rectifier', 'Ripple voltage', 'Capacitor filter', 'Diode conduction angle', 'Peak inverse voltage'],
  tags: ['GATE', 'ECE', 'EE', 'power supply', 'bridge rectifier', 'smoothing', 'diode drop', 'ripple factor'],
  learningObjectives: ['See the capacitor charge only near the peaks and discharge through the load.', 'Estimate ripple Vr ≈ Ipeak/(f·C) and see how C, R and f change it.', 'Compare half-wave and full-wave.'],
  assumptions: ['Ideal diode with a constant 0.7 V drop; ideal sinusoidal source with no series resistance.'],
  blurb: 'A sine source feeds a diode rectifier with a smoothing capacitor and a load resistor. The output voltage, ripple and the short diode conduction pulses are simulated from the circuit equations.',
  hint: 'Diode conducts when |vs|−0.7 > vc. Otherwise C discharges through R: vc′ = −vc/RC. Ripple ≈ Vpk/(f_r R C), f_r = f (half-wave) or 2f (full-wave).',
  params: [
    { kind: 'select', id: 'type', label: 'Rectifier', value: 'full', options: [{ value: 'half', label: 'Half-wave' }, { value: 'full', label: 'Full-wave (bridge)' }] },
    { kind: 'number', id: 'Vp', label: 'Source peak', min: 5, max: 30, step: 0.5, value: 12, unit: 'V', digits: 1 },
    { kind: 'number', id: 'f', label: 'Mains frequency', min: 40, max: 400, step: 10, value: 50, unit: 'Hz', digits: 0 },
    { kind: 'number', id: 'C', label: 'Capacitor C', min: 0, max: 4700, step: 10, value: 470, unit: 'µF', digits: 0 },
    { kind: 'number', id: 'R', label: 'Load R', min: 10, max: 2000, step: 10, value: 220, unit: 'Ω', digits: 0 },
  ],
  dt: 1 / 20000, previewSeconds: 0.2,
  init() { return { t: 0, vc: 0, hist: [], acc: 0 }; },
  step(s, v, dt) {
    const f = num(v, 'f'), Vp = num(v, 'Vp'), vs = Vp * Math.sin(TAU * f * s.t), full = str(v, 'type') === 'full', src = (full ? Math.abs(vs) : Math.max(vs, 0)) - 0.7, C_ = num(v, 'C') * 1e-6, R = num(v, 'R');
    if (C_ < 1e-9) s.vc = Math.max(src, 0); else { if (src > s.vc) s.vc = src; else s.vc -= (s.vc / (R * C_)) * dt; }
    s.t += dt; s.acc += dt; if (s.acc > 1 / (f * 250)) { s.acc = 0; s.hist.push({ t: s.t, vs, vo: s.vc }); if (s.hist.length > 1100) s.hist.shift(); }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const f = num(v, 'f'), Vp = num(v, 'Vp'), t1 = s.hist.length ? s.hist[s.hist.length - 1].t : 0, span = 4 / f, P = { x: 8, y: 8, w: w - 16, h: h - 16 };
    const m = plot(c, P, [(t1 - span) * 1000, t1 * 1000], [-Vp * 1.1, Vp * 1.1], { title: 'Source (cyan) and output voltage (amber)', xlabel: 'time (ms)', zeroAxis: true });
    const vis = s.hist.filter(q => q.t >= t1 - span); polyline(c, vis.map(q => [m.X(q.t * 1000), m.Y(q.vs)] as [number, number]), 'rgba(34,211,238,0.6)', 1.4); polyline(c, vis.map(q => [m.X(q.t * 1000), m.Y(q.vo)] as [number, number]), C.amber, 2.6);
    if (vis.length) { const mx = Math.max(...vis.map(q => q.vo)), mn = Math.min(...vis.map(q => q.vo)); text(c, `ripple (pk-pk) ${fmt(mx - mn, 2)} V`, P.x + P.w - 10, P.y + 34, C.red, 11, 'right'); }
  },
  readouts(s, v) {
    const vis = s.hist.filter(q => q.t > s.t - 4 / num(v, 'f')); if (!vis.length) return [{ label: 'Starting…', value: '' }];
    const mx = Math.max(...vis.map(q => q.vo)), mn = Math.min(...vis.map(q => q.vo)), avg = vis.reduce((a, q) => a + q.vo, 0) / vis.length, fr = str(v, 'type') === 'full' ? 2 * num(v, 'f') : num(v, 'f');
    return [{ label: 'Peak output', value: mx, unit: 'V', digits: 2 }, { label: 'Average (DC)', value: avg, unit: 'V', digits: 2 }, { label: 'Ripple pk-pk', value: mx - mn, unit: 'V', digits: 2 }, { label: 'Ripple factor', value: avg > 0 ? (mx - mn) / (2 * Math.sqrt(3)) / avg : 0, digits: 3 }, { label: 'Approx. ripple (formula)', value: num(v, 'C') > 0 ? mx / (fr * num(v, 'R') * num(v, 'C') * 1e-6) : 'no filter', unit: num(v, 'C') > 0 ? 'V' : '', digits: 2 }, { label: 'PIV (diode)', value: str(v, 'type') === 'full' ? num(v, 'Vp') : 2 * num(v, 'Vp'), unit: 'V', digits: 1 }];
  },
  equations(_s, v) { const fr = str(v, 'type') === 'full' ? 2 * num(v, 'f') : num(v, 'f'); return ['V_r \\approx \\dfrac{V_{pk}}{f_r R C}', `f_r = ${fr}\\ \\text{Hz}`]; },
});

/* ================================================================== */
/*  BJT common-emitter load line                                       */
/* ================================================================== */
interface BjS { t: number }
export const bjt = defineSim<BjS>({
  id: 'bjt_load_line', title: 'BJT Common-Emitter: Output Characteristics, Load Line & Q-Point',
  ...meta(ENG, 'Intermediate', 'Analog Electronics', 'Analog Electronics', 'BJT biasing, DC load line, saturation and cutoff'),
  covers: ['BJT output characteristics', 'DC load line', 'Q-point', 'Saturation and cutoff', 'Early effect', 'Transistor as a switch'],
  tags: ['GATE', 'ECE', 'EE', 'biasing', 'active region', 'beta', 'common emitter', 'amplifier'],
  learningObjectives: ['Draw the DC load line Vce = Vcc − Ic·Rc and find the Q-point on a base-current curve.', 'Identify cutoff, active and saturation regions.', 'See when a swing is clipped.'],
  assumptions: ['Simple model: Ic = β·Ib·(1 + Vce/VA) in active region; saturation below Vce(sat) = 0.2 V; no temperature effects.'],
  blurb: 'Choose the base current and collector resistor. The Q-point is where the load line crosses the characteristic for that base current; a signal swing is drawn to show clipping near saturation and cutoff.',
  hint: 'Load line: Ic = (Vcc − Vce)/Rc. Active: Ic ≈ β Ib (1+Vce/VA). Saturation when the load line forces Ic > β Ib; cutoff at Ib=0. Best symmetric swing: Q near mid load line.',
  params: [
    { kind: 'number', id: 'Vcc', label: 'Supply Vcc', min: 3, max: 24, step: 0.5, value: 12, unit: 'V', digits: 1 },
    { kind: 'number', id: 'Rc', label: 'Collector resistor Rc', min: 100, max: 5000, step: 50, value: 1000, unit: 'Ω', digits: 0 },
    { kind: 'number', id: 'Ib', label: 'Base current Ib', min: 0, max: 100, step: 1, value: 40, unit: 'µA', digits: 0 },
    { kind: 'number', id: 'beta', label: 'Current gain β', min: 20, max: 300, step: 5, value: 100, digits: 0 },
    { kind: 'number', id: 'ibs', label: 'Signal swing (peak Ib)', min: 0, max: 60, step: 1, value: 15, unit: 'µA', digits: 0 },
    { kind: 'number', id: 'VA', label: 'Early voltage VA', min: 20, max: 200, step: 5, value: 80, unit: 'V', digits: 0 },
  ],
  dt: 1 / 60, previewSeconds: 0.5, init() { return { t: 0 }; }, step(s, _v, dt) { s.t += dt; },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const Vcc = num(v, 'Vcc'), Rc = num(v, 'Rc'), beta = num(v, 'beta'), VA = num(v, 'VA'), icsat = Vcc / Rc * 1000, ymax = Math.max(icsat * 1.1, 2);
    const ic = (Ib: number, Vce: number) => Vce < 0.2 ? (beta * Ib * 1e-3 * (1 + 0.2 / VA)) * (Vce / 0.2) : beta * Ib * 1e-3 * (1 + Vce / VA); // mA, Ib in µA
    const P = { x: 8, y: 8, w: w - 16, h: h - 16 }, m = plot(c, P, [0, Vcc * 1.05], [0, ymax], { title: 'Ic (mA) vs Vce (V)', xlabel: 'Vce (V)' });
    for (let k = 1; k <= 8; k++) { const Ib = k * 12.5; const pts: [number, number][] = []; for (let x = 0; x <= Vcc * 1.05; x += Vcc / 120) pts.push([m.X(x), m.Y(clamp(ic(Ib, x), 0, ymax))]); polyline(c, pts, 'rgba(148,163,184,0.3)', 1); }
    const Ib = num(v, 'Ib'); const solve = (ib: number) => { let lo = 0, hi = Vcc; for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (ic(ib, mid) > (Vcc - mid) / Rc * 1000) hi = mid; else lo = mid; } const Vce = (lo + hi) / 2; return { Vce, Ic: (Vcc - Vce) / Rc * 1000 }; };
    const pts: [number, number][] = []; for (let x = 0; x <= Vcc * 1.05; x += Vcc / 120) pts.push([m.X(x), m.Y(clamp(ic(Ib, x), 0, ymax))]); polyline(c, pts, C.cyan, 2.2);
    line(c, m.X(0), m.Y(icsat), m.X(Vcc), m.Y(0), C.amber, 2.2); text(c, 'DC load line', m.X(Vcc * 0.55), m.Y(icsat * 0.45) - 8, C.amber, 11);
    const q = solve(Ib); circle(c, m.X(q.Vce), m.Y(q.Ic), 6, C.red, C.white, 1.5); text(c, 'Q', m.X(q.Vce) + 8, m.Y(q.Ic) - 6, C.red, 12, 'left', 'alphabetic', true);
    const sw = num(v, 'ibs'), lo = solve(Math.max(0, Ib - sw)), hi = solve(Ib + sw); circle(c, m.X(lo.Vce), m.Y(lo.Ic), 3.5, C.green); circle(c, m.X(hi.Vce), m.Y(hi.Ic), 3.5, C.green); line(c, m.X(lo.Vce), m.Y(lo.Ic), m.X(hi.Vce), m.Y(hi.Ic), C.green, 3);
    const ph = Math.sin(s.t * 3), cur = solve(Math.max(0, Ib + sw * ph)); circle(c, m.X(cur.Vce), m.Y(cur.Ic), 4.5, C.white);
  },
  readouts(_s, v) {
    const Vcc = num(v, 'Vcc'), Rc = num(v, 'Rc'), beta = num(v, 'beta'), Ib = num(v, 'Ib'), VA = num(v, 'VA'), icf = (ib: number, Vce: number) => Vce < 0.2 ? beta * ib * 1e-3 * (Vce / 0.2) : beta * ib * 1e-3 * (1 + Vce / VA);
    let lo = 0, hi = Vcc; for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (icf(Ib, mid) > (Vcc - mid) / Rc * 1000) hi = mid; else lo = mid; } const Vce = (lo + hi) / 2, Ic = (Vcc - Vce) / Rc * 1000;
    const region = Ib === 0 ? 'cutoff' : Vce <= 0.25 ? 'saturation' : 'active';
    return [{ label: 'Region', value: region }, { label: 'Vce at Q', value: Vce, unit: 'V', digits: 2 }, { label: 'Ic at Q', value: Ic, unit: 'mA', digits: 2 }, { label: 'Ic(sat)', value: Vcc / Rc * 1000, unit: 'mA', digits: 2 }, { label: 'Power in transistor', value: Vce * Ic, unit: 'mW', digits: 1 }, { label: 'Mid-load-line Ib would be', value: (Vcc / Rc * 1000 / 2) / (beta * 1e-3), unit: 'µA', digits: 0 }];
  },
  equations(_s, v) { return ['V_{ce} = V_{cc} - I_c R_c', `I_{c(sat)} = \\dfrac{V_{cc}}{R_c} = ${fmt(num(v, 'Vcc') / num(v, 'Rc') * 1000, 2)}\\ \\text{mA}`, 'I_c \\approx \\beta I_b\\,(1+V_{ce}/V_A)']; },
});

/* ================================================================== */
/*  Sampling & aliasing                                                */
/* ================================================================== */
interface SaS { t: number }
export const sampling = defineSim<SaS>({
  id: 'sampling_aliasing', title: 'Sampling Theorem: Nyquist Rate & Aliasing',
  ...meta(ENG, 'Intermediate', 'Signals and Systems', 'Digital Signal Processing', 'Sampling, reconstruction and aliasing'),
  covers: ['Sampling theorem', 'Nyquist rate', 'Aliasing', 'Signal reconstruction', 'Anti-aliasing filter', 'ADC'],
  tags: ['GATE', 'ECE', 'EE', 'DSP', 'folding frequency', 'sinc interpolation', 'undersampling', 'wagon wheel'],
  learningObjectives: ['Sample a sine at fs and see it reconstructed correctly only if fs > 2f.', 'Compute the alias frequency |f − k·fs|.', 'See why an anti-aliasing filter is needed before an ADC.'],
  assumptions: ['Ideal impulse sampling and ideal (sinc) reconstruction over the displayed window; edge effects at the window ends are visible.'],
  blurb: 'A sine wave is sampled at the rate you choose. Below the Nyquist rate the samples fit a slower fake sine: the alias. The reconstruction and the spectrum show exactly what happens.',
  hint: 'Sampling at fs maps frequency f to the alias fa = |f − round(f/fs)·fs|. Perfect reconstruction needs fs > 2 f_max. Anti-aliasing low-pass filters remove frequencies above fs/2 before sampling.',
  params: [
    { kind: 'number', id: 'f', label: 'Signal frequency f', min: 1, max: 40, step: 0.5, value: 9, unit: 'Hz', digits: 1 },
    { kind: 'number', id: 'fs', label: 'Sampling rate fs', min: 4, max: 80, step: 0.5, value: 20, unit: 'Hz', digits: 1 },
    { kind: 'toggle', id: 'rec', label: 'Show sinc reconstruction', value: true },
    { kind: 'toggle', id: 'fil', label: 'Anti-aliasing filter on', value: false },
  ],
  dt: 1 / 60, previewSeconds: 0, init() { return { t: 0 }; }, step() { /* static */ },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const f = num(v, 'f'), fs = num(v, 'fs'), fil = bool(v, 'fil') && f > fs / 2, amp = fil ? 0 : 1, T = 1; const P = { x: 8, y: 8, w: w - 16, h: h * 0.62 };
    const m = plot(c, P, [0, T], [-1.3, 1.3], { title: 'Signal, samples and reconstruction', xlabel: 'time (s)', zeroAxis: true });
    polyline(c, Array.from({ length: 401 }, (_, i) => [m.X(i / 400), m.Y(amp * Math.sin(TAU * f * (i / 400)))] as [number, number]), C.cyan, 1.8);
    const N = Math.floor(T * fs), sam: [number, number][] = []; for (let n = 0; n <= N; n++) sam.push([n / fs, amp * Math.sin(TAU * f * (n / fs))]);
    if (bool(v, 'rec')) { const pts: [number, number][] = []; for (let i = 0; i <= 400; i++) { const t = i / 400; let y = 0; for (const [tn, xn] of sam) { const a = fs * (t - tn); y += xn * (Math.abs(a) < 1e-9 ? 1 : Math.sin(Math.PI * a) / (Math.PI * a)); } pts.push([m.X(t), m.Y(clamp(y, -1.3, 1.3))]); } polyline(c, pts, C.amber, 2.2, [6, 3]); }
    for (const [tn, xn] of sam) { line(c, m.X(tn), m.Y(0), m.X(tn), m.Y(xn), 'rgba(248,113,113,0.6)', 1); circle(c, m.X(tn), m.Y(xn), 3.5, C.red); }
    const S = { x: 8, y: P.y + P.h + 8, w: w - 16, h: h - P.h - 24 }; const sm = plot(c, S, [0, 50], [0, 1.2], { title: 'Spectrum (Hz)', xlabel: '', ystep: 1, xstep: 10 });
    const fa = Math.abs(f - Math.round(f / fs) * fs);
    line(c, sm.X(f), sm.Y(0), sm.X(f), sm.Y(amp ? 1 : 0.02), C.cyan, 3); if (amp) { line(c, sm.X(fa), sm.Y(0), sm.X(fa), sm.Y(0.85), fa === f ? C.cyan : C.amber, 3); }
    line(c, sm.X(fs / 2), sm.Y(0), sm.X(fs / 2), sm.Y(1.2), C.green, 1.2, [4, 3]); text(c, 'fs/2', sm.X(fs / 2) + 3, sm.Y(1.1), C.green, 10); text(c, f > fs / 2 && !fil ? `ALIAS at ${fmt(fa, 1)} Hz` : fil ? 'filtered out' : 'OK: f < fs/2', S.x + S.w - 10, S.y + 14, f > fs / 2 && !fil ? C.red : C.green, 11, 'right', 'alphabetic', true);
  },
  readouts(_s, v) { const f = num(v, 'f'), fs = num(v, 'fs'), fa = Math.abs(f - Math.round(f / fs) * fs); return [{ label: 'Nyquist rate 2f', value: 2 * f, unit: 'Hz', digits: 1 }, { label: 'Folding frequency fs/2', value: fs / 2, unit: 'Hz', digits: 1 }, { label: 'Apparent (alias) frequency', value: bool(v, 'fil') && f > fs / 2 ? 0 : fa, unit: 'Hz', digits: 2 }, { label: 'Samples per cycle', value: fs / f, digits: 2 }, { label: 'Aliased?', value: f > fs / 2 && !bool(v, 'fil') ? 'YES' : 'no' }]; },
  equations(_s, v) { const f = num(v, 'f'), fs = num(v, 'fs'); return ['f_s > 2 f_{max}', `f_{alias} = |f - k f_s| = |${fmt(f, 1)} - ${Math.round(f / fs)}\\times ${fmt(fs, 1)}| = ${fmt(Math.abs(f - Math.round(f / fs) * fs), 2)}\\ \\text{Hz}`]; },
});

/* ================================================================== */
/*  RC / RL transient & filters                                        */
/* ================================================================== */
interface RfS { t: number; vc: number; hist: { t: number; vin: number; vo: number }[]; acc: number }
export const rcfilter = defineSim<RfS>({
  id: 'rc_filter_transient', title: 'RC Circuit: Time Constant, Low-pass & High-pass Response',
  ...meta(ENG, 'Beginner', 'Circuit Analysis', 'Network Analysis', 'First-order RC circuit transient and frequency response'),
  covers: ['RC time constant', 'Low-pass filter', 'High-pass filter', 'Cutoff frequency', 'Step response', 'Frequency response'],
  tags: ['GATE', 'ECE', 'EE', 'first order', '-3 dB', 'charging discharging', 'differentiator', 'integrator'],
  learningObjectives: ['Relate τ = RC to charging: 63 % in one τ, ~99 % in 5τ.', 'See a square wave smoothed (low-pass) or differentiated (high-pass).', 'Read the −3 dB cutoff fc = 1/(2πRC) on the magnitude plot.'],
  assumptions: ['Ideal R and C, voltage source with zero internal resistance, no load on the output.'],
  blurb: 'A square wave drives an RC network. Choose low-pass or high-pass, adjust R, C and the input frequency and compare the time response with the Bode magnitude curve.',
  hint: 'vc′ = (vin − vc)/RC. Low-pass output = vc, high-pass output = vin − vc. τ=RC, fc=1/(2πτ), |H|=1/√(1+(f/fc)²) for low-pass. If the period ≫ τ the output reaches the input; if ≪ τ it averages (LP) or passes only edges (HP).',
  params: [
    { kind: 'select', id: 'mode', label: 'Output taken across', value: 'lp', options: [{ value: 'lp', label: 'Capacitor (low-pass)' }, { value: 'hp', label: 'Resistor (high-pass)' }] },
    { kind: 'number', id: 'R', label: 'R', min: 1, max: 100, step: 1, value: 10, unit: 'kΩ', digits: 0 },
    { kind: 'number', id: 'Cn', label: 'C', min: 1, max: 1000, step: 1, value: 100, unit: 'nF', digits: 0 },
    { kind: 'number', id: 'f', label: 'Input frequency', min: 10, max: 5000, step: 10, value: 200, unit: 'Hz', digits: 0 },
  ],
  dt: 1 / 100000, previewSeconds: 0.03,
  init() { return { t: 0, vc: 0, hist: [], acc: 0 }; },
  step(s, v, dt) {
    const f = num(v, 'f'), vin = ((s.t * f) % 1) < 0.5 ? 1 : 0, tau = num(v, 'R') * 1e3 * num(v, 'Cn') * 1e-9;
    s.vc += ((vin - s.vc) / tau) * Math.min(dt, tau / 5); if (dt > tau / 5) s.vc += ((vin - s.vc) / tau) * (dt - tau / 5);
    s.t += dt; s.acc += dt; if (s.acc > 1 / (f * 250)) { s.acc = 0; s.hist.push({ t: s.t, vin, vo: str(v, 'mode') === 'lp' ? s.vc : vin - s.vc }); if (s.hist.length > 1100) s.hist.shift(); }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const f = num(v, 'f'), tau = num(v, 'R') * 1e3 * num(v, 'Cn') * 1e-9, fc = 1 / (TAU * tau), t1 = s.hist.length ? s.hist[s.hist.length - 1].t : 0, span = 3 / f;
    const A = { x: 8, y: 8, w: w * 0.58, h: h - 16 }, m = plot(c, A, [(t1 - span) * 1000, t1 * 1000], [-0.1, 1.15], { title: 'Input (grey) and output (amber)', xlabel: 'time (ms)', ystep: 0.25 });
    const vis = s.hist.filter(q => q.t >= t1 - span); polyline(c, vis.map(q => [m.X(q.t * 1000), m.Y(q.vin)] as [number, number]), 'rgba(148,163,184,0.7)', 1.5); polyline(c, vis.map(q => [m.X(q.t * 1000), m.Y(q.vo)] as [number, number]), C.amber, 2.4);
    const B = { x: A.x + A.w + 8, y: 8, w: w - A.w - 24, h: h - 16 }, mb = plot(c, B, [1, 5], [-40, 5], { title: '|H| (dB) vs log₁₀ f', xlabel: 'log₁₀ f (Hz)', ystep: 10, xstep: 1 });
    const H = (ff: number) => { const r = ff / fc; return str(v, 'mode') === 'lp' ? 1 / Math.sqrt(1 + r * r) : r / Math.sqrt(1 + r * r); };
    polyline(c, Array.from({ length: 101 }, (_, i) => { const lf = 1 + (i / 100) * 4; return [mb.X(lf), mb.Y(clamp(20 * Math.log10(H(10 ** lf)), -40, 5))] as [number, number]; }), C.cyan, 2.2);
    line(c, mb.X(Math.log10(fc)), mb.Y(-40), mb.X(Math.log10(fc)), mb.Y(5), C.green, 1, [4, 3]); text(c, `fc ${fmt(fc, 0)} Hz`, mb.X(Math.log10(fc)) + 3, mb.Y(-34), C.green, 10);
    circle(c, mb.X(Math.log10(f)), mb.Y(clamp(20 * Math.log10(H(f)), -40, 5)), 5, C.red, C.white, 1.5);
  },
  readouts(_s, v) { const tau = num(v, 'R') * 1e3 * num(v, 'Cn') * 1e-9, fc = 1 / (TAU * tau), f = num(v, 'f'), r = f / fc, H = str(v, 'mode') === 'lp' ? 1 / Math.sqrt(1 + r * r) : r / Math.sqrt(1 + r * r); return [{ label: 'Time constant τ', value: tau * 1000, unit: 'ms', digits: 3 }, { label: 'Cutoff fc', value: fc, unit: 'Hz', digits: 1 }, { label: 'Gain at input f', value: H, digits: 3 }, { label: 'Gain', value: 20 * Math.log10(H), unit: 'dB', digits: 1 }, { label: 'Half-period / τ', value: 1 / (2 * f) / tau, digits: 2 }, { label: 'Phase', value: str(v, 'mode') === 'lp' ? -deg(Math.atan(r)) : 90 - deg(Math.atan(r)), unit: '°', digits: 0 }]; },
  equations(_s, v) { const tau = num(v, 'R') * 1e3 * num(v, 'Cn') * 1e-9; return ['\\tau = RC,\\quad f_c = \\dfrac{1}{2\\pi R C}', `\\tau = ${fmt(tau * 1000, 3)}\\ \\text{ms},\\ f_c = ${fmt(1 / (TAU * tau), 1)}\\ \\text{Hz}`, 'v_c(t) = V\\left(1 - e^{-t/\\tau}\\right)']; },
});

export const UG_ELECTRONICS2_SIMS = [pid, bode, opamp, rectifier, bjt, sampling, rcfilter];
