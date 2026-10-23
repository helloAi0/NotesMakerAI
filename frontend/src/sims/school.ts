import { defineSim, num, str, bool, SCHOOL_8_10, SCHOOL_ALL } from './types';
import type { AnySim, Values } from './types';
import {
  C, TAU, arrow, bars, circle, clamp, deg, drawScope, fmt, gauss, hsl, line, lerp, panel, plot, polyline, rad, rnd,
  Scope, text, wavelengthToRgb, roundRect,
} from './draw';

const G0 = 9.81;
const rgbs = (nm: number, a = 1) => { const [r, g, b] = wavelengthToRgb(nm); return `rgba(${r},${g},${b},${a})`; };
const pick = <T,>(arr: T[], i: number): T => arr[((i % arr.length) + arr.length) % arr.length];
void lerp; void gauss; void hsl; void deg; void rnd; void Scope; void drawScope; void roundRect; void pick; void rgbs; void bars; void arrow; void polyline;

/* ================================================================== */
/*  1. Motion graphs                                                   */
/* ================================================================== */

interface MgS { t: number }
function motion(v: Values, t: number) {
  const phases: [number, number][] = [[num(v, 'a1'), num(v, 't1')], [0, num(v, 't2')], [num(v, 'a3'), num(v, 't3')]];
  let x = 0, vel = num(v, 'u'), rem = t;
  for (const [a, T] of phases) {
    if (rem <= T) return { x: x + vel * rem + 0.5 * a * rem * rem, v: vel + a * rem, a };
    x += vel * T + 0.5 * a * T * T; vel += a * T; rem -= T;
  }
  return { x: x + vel * rem, v: vel, a: 0 };
}
const mgTotal = (v: Values) => num(v, 't1') + num(v, 't2') + num(v, 't3');

export const motiongraphs = defineSim<MgS>({
  id: 'motiongraphs', title: 'Motion Graphs', subject: 'Physics',
  educationLevels: SCHOOL_ALL, difficulty: 'Beginner', status: 'active',
  category: 'Kinematics', topic: 'Motion in a Straight Line', subtopic: 'Position, velocity and acceleration graphs', covers: ['Motion graphs'],
  learningObjectives: ['Relate the graphs/readings to the physical situation.', 'Predict what changes when a parameter is varied.'],
  assumptions: ['Idealised model: point masses / no air resistance unless stated.'], tags: ['NCERT', 'Class 9', 'Class 11', 'kinematics', 'motion', 'speed', 'velocity', 'acceleration'],
  blurb: 'A car speeds up, cruises and brakes. Watch how its position, speed and acceleration graphs are linked: the slope of x-t is speed, the slope of v-t is acceleration, and the area under v-t is distance.',
  hint: 'Piecewise constant acceleration motion: v=u+at, s=ut+1/2 at^2. Slope of the position-time graph equals velocity; slope of the velocity-time graph equals acceleration; area under the v-t graph equals displacement. Try a negative final acceleration (braking) and see the v-t line fall.',
  params: [
    { kind: 'number', id: 'u', label: 'Starting speed', min: 0, max: 20, step: 1, value: 2, unit: 'm/s' },
    { kind: 'number', id: 'a1', label: 'Acceleration in phase 1', min: -5, max: 5, step: 0.5, value: 3, unit: 'm/s²' },
    { kind: 'number', id: 't1', label: 'Time of phase 1', min: 1, max: 8, step: 0.5, value: 4, unit: 's' },
    { kind: 'number', id: 't2', label: 'Cruise time (no acceleration)', min: 0, max: 8, step: 0.5, value: 3, unit: 's' },
    { kind: 'number', id: 'a3', label: 'Acceleration in phase 3', min: -5, max: 5, step: 0.5, value: -4, unit: 'm/s²', help: 'Negative means braking' },
    { kind: 'number', id: 't3', label: 'Time of phase 3', min: 0.5, max: 8, step: 0.5, value: 3, unit: 's' },
  ],
  previewSeconds: 5,
  init() { return { t: 0 }; },
  step(s, v, dt) { s.t += dt; if (s.t > mgTotal(v) + 1.2) s.t = 0; },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const T = mgTotal(v), N = 80;
    let xmin = 0, xmax = 1, vmin = 0, vmax = 1, amin = 0, amax = 1;
    for (let i = 0; i <= N; i++) { const m = motion(v, (T * i) / N); xmin = Math.min(xmin, m.x); xmax = Math.max(xmax, m.x); vmin = Math.min(vmin, m.v); vmax = Math.max(vmax, m.v); amin = Math.min(amin, m.a); amax = Math.max(amax, m.a); }
    const now = motion(v, Math.min(s.t, T + 1.2));
    const wide = w > 520;
    // road
    const road = { x: 10, y: 10, w: w - 20, h: wide ? 78 : 56 };
    panel(c, road);
    const ry = road.y + road.h - 18;
    line(c, road.x + 8, ry + 6, road.x + road.w - 8, ry + 6, C.dim, 2);
    const span = Math.max(1, xmax - xmin) * 1.08;
    const RX = (x: number) => road.x + 24 + ((x - xmin) / span) * (road.w - 60);
    for (let m = Math.ceil(xmin / 10) * 10; m <= xmin + span; m += 10) { line(c, RX(m), ry + 6, RX(m), ry + 11, C.dim, 1); text(c, `${m}`, RX(m), ry + 20, C.dim, 9, 'center'); }
    const cx = RX(now.x), cw = wide ? 34 : 26;
    c.fillStyle = C.orange; roundRect(c, cx - cw / 2, ry - 14, cw, 14, 3); c.fill();
    circle(c, cx - cw / 4, ry + 1, 4, '#1e293b', C.white, 1); circle(c, cx + cw / 4, ry + 1, 4, '#1e293b', C.white, 1);
    if (Math.abs(now.v) > 0.3) arrow(c, cx + cw / 2 + 2, ry - 7, cx + cw / 2 + 2 + clamp(now.v * 2, -40, 60), ry - 7, C.cyan, 2, 6);
    text(c, `t = ${fmt(Math.min(s.t, T), 1)} s`, road.x + 10, road.y + 14, C.text, 11, 'left', 'alphabetic', true);
    // graphs
    const top = road.y + road.h + 8, availH = h - top - 8;
    const gw = wide ? (w - 20 - 16) / 3 : w - 20, gh = wide ? availH : (availH - 12) / 3;
    const rect = (i: number) => (wide ? { x: 10 + i * (gw + 8), y: top, w: gw, h: gh } : { x: 10, y: top + i * (gh + 6), w: gw, h: gh });
    const tmax = T + 1.2, tc = Math.min(s.t, tmax);
    const defs: { title: string; lo: number; hi: number; f: (m: ReturnType<typeof motion>) => number; col: string }[] = [
      { title: 'Position x (m)', lo: xmin, hi: xmax, f: m => m.x, col: C.cyan },
      { title: 'Velocity v (m/s)', lo: vmin, hi: vmax, f: m => m.v, col: C.green },
      { title: 'Acceleration a (m/s²)', lo: amin, hi: amax, f: m => m.a, col: C.amber },
    ];
    defs.forEach((d, i) => {
      const pad = (d.hi - d.lo) * 0.12 || 1;
      const m = plot(c, rect(i), [0, tmax], [d.lo - pad, d.hi + pad], { title: wide || true ? d.title : undefined, xlabel: wide ? 'time (s)' : undefined, zeroAxis: true });
      const full: [number, number][] = [], part: [number, number][] = [];
      for (let k = 0; k <= 120; k++) { const t = (tmax * k) / 120, y = d.f(motion(v, Math.min(t, tmax))); full.push([m.X(t), m.Y(y)]); if (t <= tc) part.push([m.X(t), m.Y(y)]); }
      polyline(c, full, 'rgba(148,163,184,0.35)', 1.5);
      if (i === 1 && part.length > 1) {
        c.beginPath(); c.moveTo(m.X(0), m.Y(0)); for (const p of part) c.lineTo(p[0], p[1]); c.lineTo(m.X(tc), m.Y(0)); c.closePath(); c.fillStyle = 'rgba(52,211,153,0.25)'; c.fill();
      }
      polyline(c, part, d.col, 2.5);
      const cur = d.f(now);
      circle(c, m.X(tc), m.Y(cur), 4, d.col, C.white, 1);
      if (i === 0) { const sl = now.v, dtt = 0.8; line(c, m.X(tc - dtt), m.Y(cur - sl * dtt), m.X(tc + dtt), m.Y(cur + sl * dtt), C.red, 1.5, [3, 3]); }
      if (i === 1) { const sl = now.a, dtt = 0.8; line(c, m.X(tc - dtt), m.Y(now.v - sl * dtt), m.X(tc + dtt), m.Y(now.v + sl * dtt), C.red, 1.5, [3, 3]); }
    });
  },
  readouts: (s, v) => { const m = motion(v, Math.min(s.t, mgTotal(v) + 1.2)); return [
    { label: 'Time', value: Math.min(s.t, mgTotal(v)), unit: 's', digits: 1 }, { label: 'Position', value: m.x, unit: 'm', digits: 1 },
    { label: 'Velocity', value: m.v, unit: 'm/s', digits: 1 }, { label: 'Acceleration', value: m.a, unit: 'm/s²', digits: 1 },
  ]; },
  equations: (_s, v) => [
    String.raw`v=u+at=${fmt(num(v, 'u'), 1)}+${fmt(num(v, 'a1'), 1)}\times${fmt(num(v, 't1'), 1)}=${fmt(num(v, 'u') + num(v, 'a1') * num(v, 't1'), 1)}\ \text{m/s (end of phase 1)}`,
    String.raw`s=ut+\tfrac12at^2=${fmt(num(v, 'u') * num(v, 't1') + 0.5 * num(v, 'a1') * num(v, 't1') ** 2, 1)}\ \text{m (phase 1)}`,
  ],
});

/* ================================================================== */
/*  2. Inclined plane with friction                                    */
/* ================================================================== */

interface InS { s: number; vel: number; moving: boolean; wait: number }
const LM = 6;
export const incline = defineSim<InS>({
  id: 'incline', title: 'Forces on a Slope', subject: 'Physics',
  educationLevels: SCHOOL_ALL, difficulty: 'Beginner', status: 'active',
  category: 'Dynamics', topic: "Newton's Laws and Friction", subtopic: 'Forces on an inclined plane', covers: ["Newton's laws + friction"],
  learningObjectives: ['Relate the graphs/readings to the physical situation.', 'Predict what changes when a parameter is varied.'],
  assumptions: ['Idealised model: point masses / no air resistance unless stated.'], tags: ['NCERT', 'Class 9', 'Class 11', 'friction', 'Newton laws', 'inclined plane', 'free body diagram'],
  blurb: 'A block on a ramp. Raise the ramp until gravity pulls harder than friction can hold. The arrows show weight, the push of the ramp (normal force) and friction.',
  hint: 'Block on an incline with static friction mu_s and kinetic friction mu_k. It stays at rest while tan(theta) <= mu_s; otherwise it slides with a = g(sin theta - mu_k cos theta). Normal force N = m g cos theta; weight component along slope m g sin theta. Friction opposes motion.',
  params: [
    { kind: 'number', id: 'ang', label: 'Slope angle', min: 0, max: 70, step: 1, value: 30, unit: '°' },
    { kind: 'number', id: 'm', label: 'Mass of block', min: 0.5, max: 10, step: 0.5, value: 2, unit: 'kg' },
    { kind: 'number', id: 'mus', label: 'Sticky friction (starting)', min: 0.05, max: 1.2, step: 0.01, value: 0.55 },
    { kind: 'number', id: 'muk', label: 'Sliding friction', min: 0.05, max: 1.2, step: 0.01, value: 0.35 },
    { kind: 'toggle', id: 'comp', label: 'Show weight components (dashed)', value: false },
  ],
  actions: [{ id: 'reset', label: 'Put block back' }],
  previewSeconds: 1.5,
  init() { return { s: 0, vel: 0, moving: false, wait: 0 }; },
  action(s) { s.s = 0; s.vel = 0; s.moving = false; s.wait = 0; },
  step(s, v, dt) {
    const th = rad(num(v, 'ang')), m = num(v, 'm'), N = m * G0 * Math.cos(th), mus = num(v, 'mus'), muk = Math.min(num(v, 'muk'), mus);
    if (s.wait > 0) { s.wait -= dt; if (s.wait <= 0) { s.s = 0; s.vel = 0; s.moving = false; } return; }
    if (!s.moving && m * G0 * Math.sin(th) > mus * N + 1e-9) s.moving = true;
    if (!s.moving) return;
    const a = G0 * (Math.sin(th) - muk * Math.cos(th));
    s.vel += a * dt;
    if (s.vel <= 0) { s.vel = 0; s.moving = false; return; }
    s.s += s.vel * dt;
    if (s.s >= LM - 1.2) s.wait = 1.2;
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const th = rad(num(v, 'ang')), m = num(v, 'm'), wide = w > 520;
    const Lpx = Math.min(wide ? w * 0.55 : w * 0.7, (h - 60) / Math.max(0.35, Math.sin(th)) , w * 0.8 / Math.max(0.3, Math.cos(th)));
    const pxm = Lpx / LM;
    const x0 = wide ? 30 : 20, yb = h - 30;
    const topP = { x: x0, y: yb - Lpx * Math.sin(th) }, botP = { x: x0 + Lpx * Math.cos(th), y: yb };
    c.fillStyle = '#334155'; c.beginPath(); c.moveTo(topP.x, topP.y); c.lineTo(botP.x, botP.y); c.lineTo(x0, yb); c.closePath(); c.fill();
    line(c, topP.x, topP.y, botP.x, botP.y, C.axis, 2.5); line(c, x0 - 10, yb, botP.x + 60, yb, C.dim, 2);
    // angle arc
    c.save(); c.beginPath(); c.arc(botP.x, yb, 34, Math.PI, Math.PI + th); c.strokeStyle = C.amber; c.lineWidth = 2; c.stroke(); c.restore();
    text(c, `${fmt(num(v, 'ang'), 0)}°`, botP.x - 58, yb - 6, C.amber, 12, 'center', 'alphabetic', true);
    const d = { x: Math.cos(th), y: Math.sin(th) }, n = { x: Math.sin(th), y: -Math.cos(th) };
    const bs = 14 + Math.cbrt(m) * 8;
    const pos = { x: topP.x + d.x * (0.7 + s.s) * pxm, y: topP.y + d.y * (0.7 + s.s) * pxm };
    const ctr = { x: pos.x + n.x * bs / 2, y: pos.y + n.y * bs / 2 };
    c.save(); c.translate(ctr.x, ctr.y); c.rotate(th); c.fillStyle = C.blue; c.fillRect(-bs / 2, -bs / 2, bs, bs); c.strokeStyle = C.white; c.lineWidth = 1.5; c.strokeRect(-bs / 2, -bs / 2, bs, bs); c.restore();
    const k = 62 / (m * G0), W = m * G0, N = W * Math.cos(th), mus = num(v, 'mus'), muk = Math.min(num(v, 'muk'), mus);
    const fr = s.moving ? muk * N : Math.min(W * Math.sin(th), mus * N);
    arrow(c, ctr.x, ctr.y, ctr.x, ctr.y + W * k, C.red, 2.5, 8); text(c, 'Weight', ctr.x + 6, ctr.y + W * k + 10, C.red, 11);
    arrow(c, ctr.x, ctr.y, ctr.x + n.x * N * k, ctr.y + n.y * N * k, C.green, 2.5, 8); text(c, 'Normal', ctr.x + n.x * N * k + 6, ctr.y + n.y * N * k - 4, C.green, 11);
    if (fr > 0.01) { arrow(c, ctr.x, ctr.y, ctr.x - d.x * fr * k, ctr.y - d.y * fr * k, C.amber, 2.5, 8); text(c, 'Friction', ctr.x - d.x * fr * k - 4, ctr.y - d.y * fr * k - 8, C.amber, 11, 'right'); }
    if (bool(v, 'comp')) { arrow(c, ctr.x, ctr.y, ctr.x + d.x * W * Math.sin(th) * k, ctr.y + d.y * W * Math.sin(th) * k, 'rgba(248,113,113,0.7)', 1.5, 6); arrow(c, ctr.x, ctr.y, ctr.x - n.x * N * k, ctr.y - n.y * N * k, 'rgba(248,113,113,0.7)', 1.5, 6); }
    // verdict panel
    const px = wide ? w - 215 : 10, py = wide ? 12 : 10;
    const stays = Math.tan(th) <= mus;
    panel(c, { x: px, y: py, w: 205, h: 62 });
    text(c, `tan θ = ${fmt(Math.tan(th), 2)}   sticky μ = ${fmt(mus, 2)}`, px + 10, py + 20, C.text, 11, 'left', 'alphabetic', true);
    text(c, stays ? 'Friction holds the block.' : 'Block slides down!', px + 10, py + 40, stays ? C.green : C.orange, 12, 'left', 'alphabetic', true);
    text(c, stays ? 'tan θ ≤ μ so it stays' : 'tan θ > μ so it slips', px + 10, py + 55, C.dim, 10);
  },
  readouts: (s, v) => {
    const th = rad(num(v, 'ang')), m = num(v, 'm'), W = m * G0, N = W * Math.cos(th), mus = num(v, 'mus'), muk = Math.min(num(v, 'muk'), mus);
    const fr = s.moving ? muk * N : Math.min(W * Math.sin(th), mus * N), net = s.moving ? W * Math.sin(th) - fr : 0;
    return [
      { label: 'Weight', value: W, unit: 'N', digits: 1 }, { label: 'Normal force', value: N, unit: 'N', digits: 1 },
      { label: 'Friction', value: fr, unit: 'N', digits: 1 }, { label: 'Net force', value: net, unit: 'N', digits: 1 },
      { label: 'Acceleration', value: s.moving ? G0 * (Math.sin(th) - muk * Math.cos(th)) : 0, unit: 'm/s²', digits: 2 }, { label: 'Speed', value: s.vel, unit: 'm/s', digits: 2 },
    ];
  },
  equations: (_s, v) => {
    const th = rad(num(v, 'ang')), mus = num(v, 'mus'), muk = Math.min(num(v, 'muk'), mus);
    return [
      String.raw`N=mg\cos\theta=${fmt(num(v, 'm') * G0 * Math.cos(th), 1)}\ \text{N}\qquad f_{\max}=\mu_sN=${fmt(mus * num(v, 'm') * G0 * Math.cos(th), 1)}\ \text{N}`,
      Math.tan(th) > mus ? String.raw`a=g(\sin\theta-\mu_k\cos\theta)=${fmt(G0 * (Math.sin(th) - muk * Math.cos(th)), 2)}\ \text{m/s}^2` : String.raw`\tan\theta=${fmt(Math.tan(th), 2)}\le\mu_s=${fmt(mus, 2)}\Rightarrow a=0`,
    ];
  },
});

/* ================================================================== */
/*  3. Energy skate park                                               */
/* ================================================================== */

interface SkS { x: number; v: number; E0: number; drag: boolean; preset: string; m: number }
const trackH = (k: string, x: number): number => {
  if (k === 'u') return 0.22 * (x - 5) ** 2;
  if (k === 'double') return 0.6 + 3.8 * Math.exp(-(((x - 2) / 1.1) ** 2)) + 3.0 * Math.exp(-(((x - 7.6) / 1.3) ** 2));
  return 0.0125 * ((x - 5) ** 2 - 9) ** 2;
};
const SK_START: Record<string, number> = { u: 0.8, double: 1.9, w: 0.4 };
const GRAV: Record<string, number> = { earth: 9.81, moon: 1.62, jupiter: 24.79 };
function skLayout(w: number, h: number) {
  const wide = w > 520;
  const trk = wide ? { x: 10, y: 10, w: w * 0.62, h: h - 20 } : { x: 8, y: 8, w: w - 16, h: h * 0.6 };
  const bar = wide ? { x: trk.x + trk.w + 10, y: 10, w: w - trk.w - 30, h: h - 20 } : { x: 8, y: trk.y + trk.h + 8, w: w - 16, h: h - trk.h - 24 };
  return { trk, bar };
}
const skPx = (r: { x: number; y: number; w: number; h: number }, x: number, hh: number): [number, number] => [r.x + (x / 10) * r.w, r.y + r.h - 8 - (hh / 6.2) * (r.h - 20)];
export const skatepark = defineSim<SkS>({
  id: 'skatepark', title: 'Energy Skate Park', subject: 'Physics',
  educationLevels: SCHOOL_ALL, difficulty: 'Beginner', status: 'active',
  category: 'Energy', topic: 'Work, Energy and Power', subtopic: 'Conservation of mechanical energy', covers: ['work-energy'],
  learningObjectives: ['Relate the graphs/readings to the physical situation.', 'Predict what changes when a parameter is varied.'],
  assumptions: ['Idealised model: point masses / no air resistance unless stated.'], tags: ['NCERT', 'Class 9', 'Class 11', 'energy', 'work energy', 'conservation of energy', 'friction'],
  blurb: 'A skater rolls on a track. Height energy turns into movement energy and back again. Add friction and some energy becomes heat. Drag the skater to a new starting height.',
  hint: 'Conservation of energy: PE=mgh, KE=1/2 mv^2. Without friction total mechanical energy is constant. With friction work done against friction becomes thermal energy so the skater cannot return to the starting height. On the Moon g is small so the same height gives the same speed relation v=sqrt(2gh) but slower motion.',
  params: [
    { kind: 'select', id: 'track', label: 'Track shape', value: 'u', resetOnChange: true, options: [{ value: 'u', label: 'U ramp' }, { value: 'double', label: 'Two hills' }, { value: 'w', label: 'Double bowl (W)' }] },
    { kind: 'number', id: 'm', label: 'Mass of skater', min: 20, max: 100, step: 5, value: 50, unit: 'kg' },
    { kind: 'number', id: 'mu', label: 'Friction', min: 0, max: 0.4, step: 0.01, value: 0 },
    { kind: 'select', id: 'world', label: 'Where are we?', value: 'earth', options: [{ value: 'earth', label: 'Earth (g = 9.81)' }, { value: 'moon', label: 'Moon (g = 1.62)' }, { value: 'jupiter', label: 'Jupiter (g = 24.8)' }] },
  ],
  actions: [{ id: 'restart', label: 'Back to start' }],
  previewSeconds: 1.6,
  init(v) { const k = str(v, 'track'), x = SK_START[k], g = GRAV[str(v, 'world')]; return { x, v: 0, E0: num(v, 'm') * g * trackH(k, x), drag: false, preset: k, m: num(v, 'm') }; },
  action(s, v) { s.x = SK_START[str(v, 'track')]; s.v = 0; s.E0 = num(v, 'm') * GRAV[str(v, 'world')] * trackH(str(v, 'track'), s.x); },
  step(s, v, dt) {
    if (s.drag) return;
    const k = str(v, 'track'), g = GRAV[str(v, 'world')], mu = num(v, 'mu'), e = 0.01, H = (x: number) => trackH(k, x);
    const hp = (H(s.x + e) - H(s.x - e)) / (2 * e), hpp = (H(s.x + e) - 2 * H(s.x) + H(s.x - e)) / (e * e);
    const gg = g + hpp * s.v * s.v, accG = (-hp * gg) / (1 + hp * hp), fr = mu * Math.max(0, gg) / (1 + hp * hp);
    let acc: number;
    if (Math.abs(s.v) < 0.02) { if (Math.abs(accG) <= fr) { acc = 0; s.v = 0; } else acc = accG - Math.sign(accG) * fr; }
    else acc = accG - Math.sign(s.v) * fr;
    const pv = s.v;
    s.v += acc * dt;
    if (mu > 0 && pv * s.v < 0) s.v = 0;
    s.x += s.v * dt;
    if (s.x < 0.05) { s.x = 0.05; s.v = Math.abs(s.v); }
    if (s.x > 9.95) { s.x = 9.95; s.v = -Math.abs(s.v); }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const { trk, bar } = skLayout(w, h), k = str(v, 'track'), g = GRAV[str(v, 'world')];
    panel(c, trk, '#0e1626');
    c.beginPath(); c.moveTo(trk.x, trk.y + trk.h);
    for (let x = 0; x <= 10.001; x += 0.1) { const p = skPx(trk, x, trackH(k, x)); c.lineTo(p[0], p[1]); }
    c.lineTo(trk.x + trk.w, trk.y + trk.h); c.closePath(); c.fillStyle = '#334155'; c.fill();
    const pts: [number, number][] = []; for (let x = 0; x <= 10.001; x += 0.1) pts.push(skPx(trk, x, trackH(k, x)));
    polyline(c, pts, C.axis, 3);
    const h0 = trackH(k, s.x), p = skPx(trk, s.x, h0), hp = (trackH(k, s.x + 0.01) - trackH(k, s.x - 0.01)) / 0.02;
    const ang = Math.atan2(-(skPx(trk, s.x + 0.01, trackH(k, s.x + 0.01))[1] - skPx(trk, s.x - 0.01, trackH(k, s.x - 0.01))[1]), skPx(trk, s.x + 0.01, 0)[0] - skPx(trk, s.x - 0.01, 0)[0]);
    void hp;
    c.save(); c.translate(p[0], p[1]); c.rotate(-ang); c.fillStyle = C.amber; c.fillRect(-12, -3, 24, 4); circle(c, -8, 2, 2.5, '#0b1220'); circle(c, 8, 2, 2.5, '#0b1220');
    circle(c, 0, -14, 4.5, C.pink); c.strokeStyle = C.pink; c.lineWidth = 3; c.beginPath(); c.moveTo(0, -9); c.lineTo(0, -3); c.stroke(); c.restore();
    if (s.drag) text(c, 'release to drop', p[0], p[1] - 30, C.amber, 11, 'center');
    const m = num(v, 'm'), KE = 0.5 * m * s.v * s.v * (1 + hp * hp), PE = m * g * h0, th = Math.max(0, s.E0 - KE - PE);
    const mx = Math.max(s.E0, 1) * 1.05;
    bars(c, bar, [{ label: 'Height', value: PE, color: C.blue }, { label: 'Motion', value: KE, color: C.green }, { label: 'Heat', value: th, color: C.red }, { label: 'Total', value: PE + KE + th, color: C.amber }], mx, 'Energy (J)');
  },
  pointer(s, v, e) {
    const { trk } = skLayout(e.w, e.h), k = str(v, 'track');
    const p = skPx(trk, s.x, trackH(k, s.x));
    if (e.kind === 'down' && Math.hypot(e.x - p[0], e.y - p[1]) < 34) s.drag = true;
    if (e.kind === 'up' && s.drag) { s.drag = false; s.E0 = num(v, 'm') * GRAV[str(v, 'world')] * trackH(k, s.x); s.v = 0; }
    if (s.drag && e.kind !== 'up') { s.x = clamp(((e.x - trk.x) / trk.w) * 10, 0.05, 9.95); s.v = 0; s.E0 = num(v, 'm') * GRAV[str(v, 'world')] * trackH(k, s.x); }
  },
  readouts: (s, v) => {
    const k = str(v, 'track'), g = GRAV[str(v, 'world')], hp = (trackH(k, s.x + 0.01) - trackH(k, s.x - 0.01)) / 0.02, m = num(v, 'm');
    const KE = 0.5 * m * s.v * s.v * (1 + hp * hp), PE = m * g * trackH(k, s.x);
    return [
      { label: 'Height', value: trackH(k, s.x), unit: 'm', digits: 2 }, { label: 'Speed', value: Math.abs(s.v) * Math.sqrt(1 + hp * hp), unit: 'm/s', digits: 2 },
      { label: 'Height energy', value: PE, unit: 'J', digits: 0 }, { label: 'Motion energy', value: KE, unit: 'J', digits: 0 }, { label: 'Heat made', value: Math.max(0, s.E0 - KE - PE), unit: 'J', digits: 0 },
    ];
  },
  equations: (s, v) => {
    const k = str(v, 'track'), g = GRAV[str(v, 'world')];
    return [String.raw`E_{\text{total}}=mgh+\tfrac12mv^2=${fmt(num(v, 'm'), 0)}\times${fmt(g, 2)}\times${fmt(trackH(k, s.x), 2)}+\tfrac12mv^2`, String.raw`\text{Energy lost to heat}=\mu N\times\text{distance}`];
  },
});

/* ================================================================== */
/*  4. Sound waves                                                     */
/* ================================================================== */

interface SnS { t: number }
const MEDIA: Record<string, { name: string; v: number }> = { air: { name: 'Air', v: 343 }, water: { name: 'Water', v: 1482 }, steel: { name: 'Steel', v: 5960 } };
const speedOf = (v: Values) => (str(v, 'med') === 'air' ? 331 + 0.6 * num(v, 'temp') : MEDIA[str(v, 'med')].v);
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteOf = (f: number) => { const n = Math.round(12 * Math.log2(f / 440) + 69); return `${NOTES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`; };
export const sound = defineSim<SnS>({
  id: 'sound', title: 'Sound Waves', subject: 'Physics',
  educationLevels: SCHOOL_8_10, difficulty: 'Beginner', status: 'active',
  category: 'Waves', topic: 'Sound', subtopic: 'Frequency, wavelength and loudness', covers: ['Sound waves'],
  learningObjectives: ['Relate the graphs/readings to the physical situation.', 'Predict what changes when a parameter is varied.'],
  assumptions: ['Idealised model: point masses / no air resistance unless stated.'], tags: ['NCERT', 'Class 8', 'Class 9', 'Class 10', 'sound', 'pitch', 'loudness', 'frequency', 'amplitude', 'beats'],
  blurb: 'Sound is a wave of squeezed and stretched air. See the particles bunch up (compressions) and spread out (rarefactions). Higher frequency means higher pitch; bigger amplitude means louder sound.',
  hint: 'Sound is a longitudinal wave: v = f x wavelength. Frequency sets pitch, amplitude sets loudness. Speed depends on the medium (faster in solids and liquids) and on temperature in air (about 331 + 0.6 T m/s). Two close frequencies make beats at the difference frequency. Animation is in slow motion.',
  params: [
    { kind: 'number', id: 'f1', label: 'Pitch (frequency)', min: 100, max: 800, step: 5, value: 300, unit: 'Hz' },
    { kind: 'number', id: 'amp', label: 'Loudness (amplitude)', min: 0.1, max: 1, step: 0.05, value: 0.6 },
    { kind: 'select', id: 'med', label: 'Sound travels through', value: 'air', options: Object.entries(MEDIA).map(([k, m]) => ({ value: k, label: m.name })) },
    { kind: 'number', id: 'temp', label: 'Air temperature', min: -10, max: 40, step: 1, value: 20, unit: '°C' },
    { kind: 'toggle', id: 'beats', label: 'Play a second tone (beats)', value: false },
    { kind: 'number', id: 'f2', label: 'Second tone frequency', min: 100, max: 800, step: 1, value: 306, unit: 'Hz' },
  ],
  previewSeconds: 1.2,
  init() { return { t: 0 }; },
  step(s, _v, dt) { s.t += dt; },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const f1 = num(v, 'f1'), A = num(v, 'amp'), vs = speedOf(v), lam = vs / f1, pxm = 40, lampx = Math.max(10, lam * pxm), wide = w > 520;
    const SLOW = 1 / 160, ph = TAU * f1 * SLOW * s.t;
    const rows = wide ? 5 : 4, top = 10, ph0 = wide ? 130 : 96, spx = 9;
    panel(c, { x: 8, y: top, w: w - 16, h: ph0 });
    const x0 = 30, nP = Math.floor((w - 16 - x0) / spx), D = Math.min(spx * 0.45 * 2.2, lampx / 6) * A * 1.5;
    const k = TAU / lampx;
    for (let r = 0; r < rows; r++) {
      const y = top + 14 + (r * (ph0 - 28)) / (rows - 1);
      for (let i = 0; i < nP; i++) {
        const xe = x0 + i * spx, x = xe + D * Math.sin(k * (xe - x0) - ph);
        circle(c, x, y, 2.3, hsl(200, 80, 62));
      }
    }
    // speaker
    const cone = Math.sin(-ph) * 3;
    c.fillStyle = '#475569'; c.fillRect(8, top + 6, 14, ph0 - 12); c.fillStyle = C.amber; c.beginPath(); c.moveTo(22 + cone, top + ph0 / 2 - 10); c.lineTo(30 + cone, top + ph0 / 2 - 24); c.lineTo(30 + cone, top + ph0 / 2 + 24); c.lineTo(22 + cone, top + ph0 / 2 + 10); c.closePath(); c.fill();
    // wavelength marker
    const lx = x0 + 20; if (lampx < w - 80) { line(c, lx, top + ph0 - 6, lx + lampx, top + ph0 - 6, C.green, 2); text(c, `λ = ${fmt(lam, 2)} m`, lx + lampx / 2, top + ph0 - 10, C.green, 10, 'center', 'alphabetic', true); }
    // waveform
    const wy = top + ph0 + 10, wh = h - wy - 10;
    const beats = bool(v, 'beats'), f2 = num(v, 'f2'), df = Math.abs(f2 - f1) || 1;
    const win = beats ? clamp(2 / df, 0.05, 2) : 3 / f1;
    const m = plot(c, { x: 8, y: wy, w: w - 16, h: wh }, [0, win * 1000], [-2.3, 2.3], { title: beats ? 'Two tones together: loudness rises and falls (beats)' : 'Pressure wave at one spot', xlabel: wide ? 'time (milliseconds)' : undefined, zeroAxis: true, ystep: 1 });
    const pts: [number, number][] = [];
    const tshift = (s.t * SLOW) % 1;
    for (let i = 0; i <= 600; i++) { const t = (win * i) / 600, y = A * Math.sin(TAU * f1 * (t + tshift)) + (beats ? A * Math.sin(TAU * f2 * (t + tshift)) : 0); pts.push([m.X(t * 1000), m.Y(y)]); }
    polyline(c, pts, beats ? 'rgba(96,165,250,0.8)' : C.cyan, 2);
    if (beats) { const up: [number, number][] = [], dn: [number, number][] = []; for (let i = 0; i <= 200; i++) { const t = (win * i) / 200, e = 2 * A * Math.abs(Math.cos(Math.PI * df * t)); up.push([m.X(t * 1000), m.Y(e)]); dn.push([m.X(t * 1000), m.Y(-e)]); } polyline(c, up, C.amber, 1.5, [4, 3]); polyline(c, dn, C.amber, 1.5, [4, 3]); }
  },
  readouts: (_s, v) => {
    const f1 = num(v, 'f1'), vs = speedOf(v), db = 40 + 20 * Math.log10(num(v, 'amp'));
    return [
      { label: 'Speed of sound', value: vs, unit: 'm/s', digits: 0 }, { label: 'Wavelength', value: vs / f1, unit: 'm', digits: 2 }, { label: 'Time period', value: 1000 / f1, unit: 'ms', digits: 2 },
      { label: 'Musical note', value: noteOf(f1) }, { label: 'Loudness (approx)', value: db, unit: 'dB', digits: 0 }, { label: 'Beat frequency', value: bool(v, 'beats') ? Math.abs(num(v, 'f2') - f1) : 0, unit: 'Hz', digits: 0 },
    ];
  },
  equations: (_s, v) => [String.raw`v=f\lambda\Rightarrow\lambda=\frac{${fmt(speedOf(v), 0)}}{${fmt(num(v, 'f1'), 0)}}=${fmt(speedOf(v) / num(v, 'f1'), 2)}\ \text{m}`, String.raw`T=\frac1f=${fmt(1000 / num(v, 'f1'), 2)}\ \text{ms}`],
});

export const SCHOOL_BASE_SIMS: AnySim[] = [motiongraphs, incline, skatepark, sound];
