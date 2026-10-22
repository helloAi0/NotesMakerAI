import { defineSim, num, str, bool } from './types';
import {
  C, TAU, arrow, bars, circle, clamp, deg, drawScope, fitView, fmt, hsl, line, niceStep, panel,
  polyline, rad, Scope, spring, text,
} from './draw';

/* ================================================================== */
/*  Projectile motion: drag, planets, ghost paths                      */
/* ================================================================== */

const PLANETS: Record<string, [string, number]> = {
  earth: ['Earth', 9.81], moon: ['Moon', 1.62], mars: ['Mars', 3.71], jupiter: ['Jupiter', 24.79],
};

interface PS {
  x: number; y: number; vx: number; vy: number; t: number; flying: boolean;
  trail: [number, number][]; ghosts: [number, number][][]; maxH: number; range: number; tof: number; n: number;
}
const gOf = (v: Record<string, number | string | boolean>) => PLANETS[str(v, 'planet')][1];
function fireP(s: PS, v: Record<string, number | string | boolean>) {
  if (s.trail.length > 4) { s.ghosts.push(s.trail); if (s.ghosts.length > 4) s.ghosts.shift(); }
  const sp = num(v, 'speed'), a = rad(num(v, 'angle'));
  s.x = 0; s.y = num(v, 'height'); s.vx = sp * Math.cos(a); s.vy = sp * Math.sin(a);
  s.t = 0; s.flying = true; s.trail = [[s.x, s.y]]; s.maxH = s.y; s.range = 0; s.tof = 0; s.n = 0;
}
function vacRange(v: Record<string, number | string | boolean>) {
  const g = gOf(v), sp = num(v, 'speed'), a = rad(num(v, 'angle')), h = num(v, 'height');
  const vy = sp * Math.sin(a);
  return { R: (sp * Math.cos(a) / g) * (vy + Math.sqrt(vy * vy + 2 * g * h)), H: h + (vy > 0 ? (vy * vy) / (2 * g) : 0), T: (vy + Math.sqrt(vy * vy + 2 * g * h)) / g };
}

export const projectile = defineSim<PS>({
  id: 'projectile', title: 'Projectile Lab', subject: 'Physics',
  category: 'Kinematics & Mechanics',
  educationLevels: ['Class 9', 'Class 11', 'Class 12', 'B.Tech', 'B.Sc'],
  difficulty: 'Intermediate',
  topic: '2D Motion',
  subtopic: 'Projectile Motion & Drag',
  learningObjectives: [
    'Analyze independent horizontal and vertical velocity components under gravity.',
    'Determine the launch angle that maximizes horizontal range (45° in vacuum vs <45° with drag).',
    'Compare ideal vacuum parabolas with real drag effects across different planet gravities.',
  ],
  assumptions: [
    'Uniform gravitational field g constant throughout flight.',
    'Quadratic fluid resistance model F_drag = -c|v|v.',
  ],
  supportsSnapshot: true,
  supportsRestore: true,
  blurb: 'Fire a cannon on any planet, add air drag and compare with the ideal parabola. Every shot leaves a ghost path so you can compare angles.',
  hint: 'Projectile motion with optional quadratic air drag F=-c|v|v and selectable gravity. Without drag the 45 degree angle maximises range from ground level; with drag the best angle drops below 45 degrees. Compare ghost paths.',
  params: [
    { kind: 'number', id: 'speed', label: 'Launch speed', min: 2, max: 60, step: 1, value: 25, unit: 'm/s' },
    { kind: 'number', id: 'angle', label: 'Angle', min: 0, max: 90, step: 1, value: 45, unit: '°' },
    { kind: 'number', id: 'height', label: 'Launch height', min: 0, max: 30, step: 1, value: 0, unit: 'm' },
    { kind: 'number', id: 'mass', label: 'Mass', min: 0.1, max: 20, step: 0.1, value: 2, unit: 'kg' },
    { kind: 'number', id: 'drag', label: 'Air drag c (F = c·v²)', min: 0, max: 0.4, step: 0.005, value: 0, unit: 'kg/m', digits: 3 },
    { kind: 'select', id: 'planet', label: 'World', value: 'earth', options: Object.entries(PLANETS).map(([k, p]) => ({ value: k, label: `${p[0]} (g = ${p[1]})` })) },
    { kind: 'toggle', id: 'ideal', label: 'Show ideal (no-drag) parabola', value: true },
  ],
  actions: [{ id: 'fire', label: 'Fire!' }],
  previewSeconds: 1.2,
  init(v) { const s: PS = { x: 0, y: 0, vx: 0, vy: 0, t: 0, flying: false, trail: [], ghosts: [], maxH: 0, range: 0, tof: 0, n: 0 }; fireP(s, v); return s; },
  action(s, v) { fireP(s, v); },
  step(s, v, dt) {
    if (!s.flying) return;
    const g = gOf(v), k = num(v, 'drag') / num(v, 'mass');
    const sp = Math.hypot(s.vx, s.vy);
    s.vx += -k * sp * s.vx * dt;
    s.vy += (-g - k * sp * s.vy) * dt;
    const py = s.y;
    s.x += s.vx * dt; s.y += s.vy * dt; s.t += dt;
    s.maxH = Math.max(s.maxH, s.y);
    if (++s.n % 4 === 0) s.trail.push([s.x, s.y]);
    if (s.y <= 0 && py > 0 || (s.y <= 0 && s.t > dt * 2)) {
      const f = py > 0 ? py / (py - s.y) : 0;
      s.x -= s.vx * dt * (1 - f); s.y = 0; s.flying = false; s.range = s.x; s.tof = s.t;
      s.trail.push([s.x, 0]);
    }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const vr = vacRange(v);
    let xmax = Math.max(vr.R * 1.12, 8), ymax = Math.max(vr.H * 1.25, 4);
    for (const gh of [...s.ghosts, s.trail]) for (const p of gh) { xmax = Math.max(xmax, p[0] * 1.05); ymax = Math.max(ymax, p[1] * 1.15); }
    const view = fitView({ x: 20, y: 14, w: w - 34, h: h - 40 }, -xmax * 0.04, xmax, -ymax * 0.04, ymax);
    const { X, Y } = view;
    const gs = niceStep(Math.max(xmax, ymax * 1.5), 8);
    for (let x = 0; x <= xmax; x += gs) { line(c, X(x), Y(0), X(x), Y(ymax), C.grid); text(c, `${Math.round(x)}`, X(x), Y(0) + 14, C.dim, 10, 'center'); }
    for (let y = gs; y <= ymax; y += gs) { line(c, X(0), Y(y), X(xmax), Y(y), C.grid); text(c, `${Math.round(y)}`, X(0) - 5, Y(y) + 3, C.dim, 10, 'right'); }
    c.fillStyle = '#14301f'; c.fillRect(0, Y(0), w, h - Y(0)); line(c, 0, Y(0), w, Y(0), C.green, 2);
    text(c, 'metres', X(xmax) - 4, Y(0) + 26, C.dim, 10, 'right');
    s.ghosts.forEach((gh, i) => polyline(c, gh.map(p => [X(p[0]), Y(p[1])]), hsl(210, 60, 60, 0.18 + i * 0.1), 1.5));
    if (bool(v, 'ideal') && num(v, 'drag') > 0) {
      const g = gOf(v), sp = num(v, 'speed'), a = rad(num(v, 'angle')), h0 = num(v, 'height');
      const pts: [number, number][] = [];
      for (let t = 0; t <= vr.T; t += vr.T / 80) pts.push([X(sp * Math.cos(a) * t), Y(Math.max(0, h0 + sp * Math.sin(a) * t - 0.5 * g * t * t))]);
      polyline(c, pts, C.dim, 1.5, [5, 5]);
      text(c, 'ideal (no drag)', X(vr.R) , Y(0) - 8, C.dim, 10, 'center');
    }
    polyline(c, s.trail.map(p => [X(p[0]), Y(p[1])]), C.amber, 2.5);
    // cannon and tower
    const h0 = num(v, 'height');
    if (h0 > 0) { c.fillStyle = '#334155'; c.fillRect(X(-xmax * 0.02), Y(h0), X(xmax * 0.02) - X(-xmax * 0.02), Y(0) - Y(h0)); }
    const a = rad(num(v, 'angle'));
    c.save(); c.translate(X(0), Y(h0)); c.rotate(-a);
    c.fillStyle = '#64748b'; c.fillRect(-4, -6, 34, 12); c.restore();
    circle(c, X(0), Y(h0), 9, '#475569');
    // ball
    const r = 5 + Math.cbrt(num(v, 'mass')) * 1.6;
    circle(c, X(s.x), Y(s.y), r, C.orange, C.white, 1);
    if (s.flying) {
      arrow(c, X(s.x), Y(s.y), X(s.x) + s.vx * 2.2, Y(s.y) - s.vy * 2.2, C.cyan, 2);
      arrow(c, X(s.x), Y(s.y), X(s.x), Y(s.y) + gOf(v) * 2.2, C.red, 2);
    } else if (s.range > 0) {
      line(c, X(s.range), Y(0) - 12, X(s.range), Y(0) + 4, C.amber, 2);
      text(c, `${fmt(s.range, 1)} m`, X(s.range), Y(0) - 18, C.amber, 12, 'center', 'alphabetic', true);
    }
    text(c, 'velocity', 24, 28, C.cyan, 11); text(c, 'gravity', 84, 28, C.red, 11);
  },
  readouts: (s, v) => [
    { label: 'Time', value: s.t, unit: 's' }, { label: 'Height', value: s.y, unit: 'm' },
    { label: 'Distance', value: s.x, unit: 'm' }, { label: 'Speed', value: Math.hypot(s.vx, s.vy), unit: 'm/s' },
    { label: 'Max height', value: s.maxH, unit: 'm' }, { label: 'Range', value: s.range, unit: 'm' },
    { label: 'Ideal range', value: vacRange(v).R, unit: 'm' }, { label: 'Kinetic energy', value: 0.5 * num(v, 'mass') * (s.vx * s.vx + s.vy * s.vy), unit: 'J', digits: 0 },
  ],
  equations: (_s, v) => {
    const vr = vacRange(v);
    return [
      String.raw`R_{\text{ideal}}=\frac{v_0\cos\theta}{g}\left(v_0\sin\theta+\sqrt{v_0^2\sin^2\theta+2gh}\right)=${fmt(vr.R, 1)}\ \text{m}`,
      String.raw`F_{\text{drag}}=c\,v^2=${fmt(num(v, 'drag'), 3)}\,v^2\qquad g=${gOf(v)}\ \text{m/s}^2`,
    ];
  },
});

/* ================================================================== */
/*  Pendulum: large angles, damping, drag with the mouse               */
/* ================================================================== */

interface PenS { th: number; w: number; t: number; sc: Scope; drag: boolean; lastCross: number; period: number; prevW: number }
export const pendulum = defineSim<PenS>({
  id: 'pendulum', title: 'Pendulum Explorer', subject: 'Physics',
  blurb: 'Drag the bob to any angle. At small angles the period matches 2π√(L/g); at large angles it visibly stretches. Energy bars show the exchange between kinetic and potential.',
  hint: 'Nonlinear pendulum θ\'\' = -(g/L) sinθ - b θ\'. Small-angle period T0=2π√(L/g) is independent of mass and amplitude; larger amplitude lengthens the period. Damping drains energy.',
  params: [
    { kind: 'number', id: 'L', label: 'String length', min: 0.3, max: 3, step: 0.05, value: 1.2, unit: 'm' },
    { kind: 'number', id: 'g', label: 'Gravity', min: 1, max: 25, step: 0.1, value: 9.81, unit: 'm/s²' },
    { kind: 'number', id: 'th0', label: 'Start angle', min: 5, max: 170, step: 1, value: 60, unit: '°', resetOnChange: true },
    { kind: 'number', id: 'm', label: 'Mass', min: 0.1, max: 5, step: 0.1, value: 1, unit: 'kg' },
    { kind: 'number', id: 'b', label: 'Damping', min: 0, max: 1.5, step: 0.01, value: 0.03 },
  ],
  previewSeconds: 0.7,
  init(v) { return { th: rad(num(v, 'th0')), w: 0, t: 0, sc: new Scope(2, 2400), drag: false, lastCross: -1, period: 0, prevW: 0 }; },
  step(s, v, dt) {
    if (s.drag) { s.w = 0; return; }
    const g = num(v, 'g'), L = num(v, 'L');
    s.prevW = s.w;
    s.w += (-(g / L) * Math.sin(s.th) - num(v, 'b') * s.w) * dt;
    const pth = s.th;
    s.th += s.w * dt; s.t += dt;
    if (pth < 0 && s.th >= 0) { if (s.lastCross >= 0) s.period = s.t - s.lastCross; s.lastCross = s.t; }
    if (Math.round(s.t / dt) % 6 === 0) s.sc.push(s.t, deg(s.th), 0);
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const wide = w > 520;
    const L = num(v, 'L');
    const px = wide ? w * 0.3 : w / 2, py = 28;
    const pxl = Math.min(h * (wide ? 0.62 : 0.4), (wide ? w * 0.27 : w * 0.4)) / L * 1; // pixels per metre-ish
    const len = L * pxl * 1.15;
    const bx = px + Math.sin(s.th) * len, by = py + Math.cos(s.th) * len;
    // arc guide
    c.save(); c.beginPath(); c.arc(px, py, len, Math.PI / 2 - rad(num(v, 'th0')), Math.PI / 2 + rad(num(v, 'th0'))); c.strokeStyle = C.grid; c.setLineDash([4, 5]); c.stroke(); c.restore();
    line(c, px - 40, py, px + 40, py, C.dim, 3);
    line(c, px, py, px, py + len, C.grid, 1, [3, 4]);
    line(c, px, py, bx, by, C.white, 2);
    const r = 12 + num(v, 'm') * 3;
    circle(c, bx, by, r, C.blue, C.white, 1.5);
    c.save(); c.beginPath(); c.arc(px, py, 34, Math.PI / 2 - s.th, Math.PI / 2, s.th < 0); c.strokeStyle = C.amber; c.lineWidth = 2; c.stroke(); c.restore();
    text(c, `${fmt(deg(s.th), 0)}°`, px + 8, py + 52, C.amber, 12, 'left', 'alphabetic', true);
    const g = num(v, 'g');
    arrow(c, bx, by, bx, by + g * 3.2, C.red, 2);
    // plots
    const rx = wide ? w * 0.56 : 12, rw = wide ? w * 0.42 : w - 24;
    const top = wide ? 12 : h * 0.58;
    const sh = wide ? (h - 36) * 0.5 : (h - top - 12) * 0.5 - 4;
    drawScope(c, { x: rx, y: top, w: rw, h: sh }, s.sc, [C.amber], { title: 'Angle (°) vs time (s)', window: 8 });
    const m = num(v, 'm'), L2 = L;
    const ke = 0.5 * m * L2 * L2 * s.w * s.w, pe = m * g * L2 * (1 - Math.cos(s.th));
    const E0 = m * g * L2 * (1 - Math.cos(rad(num(v, 'th0'))));
    bars(c, { x: rx, y: top + sh + 10, w: rw, h: sh }, [
      { label: 'Kinetic', value: ke, color: C.green }, { label: 'Potential', value: pe, color: C.blue }, { label: 'Total', value: ke + pe, color: C.amber },
    ], Math.max(E0, 1e-6) * 1.05, 'Energy (J)');
  },
  pointer(s, v, e) {
    if (e.kind === 'up') { s.drag = false; s.lastCross = -1; return; }
    const cvw = e.w, cvh = e.h;
    const wide = cvw > 520;
    const px = wide ? cvw * 0.3 : cvw / 2, py = 28;
    if (e.kind === 'down') {
      const L = num(v, 'L');
      const pxl = Math.min(cvh * (wide ? 0.62 : 0.4), wide ? cvw * 0.27 : cvw * 0.4) / L;
      const len = L * pxl * 1.15;
      const bx = px + Math.sin(s.th) * len, by = py + Math.cos(s.th) * len;
      if (Math.hypot(e.x - bx, e.y - by) < 40) s.drag = true;
    }
    if (s.drag) { s.th = Math.atan2(e.x - px, e.y - py); s.w = 0; s.sc.clear(); s.t = 0; }
  },
  readouts: (s, v) => {
    const T0 = TAU * Math.sqrt(num(v, 'L') / num(v, 'g'));
    return [
      { label: 'Angle', value: deg(s.th), unit: '°', digits: 1 }, { label: 'Angular speed', value: s.w, unit: 'rad/s' },
      { label: 'Small-angle T₀', value: T0, unit: 's', digits: 3 }, { label: 'Measured period', value: s.period || '-', unit: s.period ? 's' : '' },
    ];
  },
  equations: (_s, v) => [
    String.raw`\ddot\theta=-\frac{g}{L}\sin\theta-b\dot\theta`,
    String.raw`T_0=2\pi\sqrt{\frac{L}{g}}=2\pi\sqrt{\frac{${fmt(num(v, 'L'), 2)}}{${fmt(num(v, 'g'), 2)}}}=${fmt(TAU * Math.sqrt(num(v, 'L') / num(v, 'g')), 3)}\ \text{s}`,
  ],
});

/* ================================================================== */
/*  Spring-mass with damping and a driving force (resonance)           */
/* ================================================================== */

interface SpS { x: number; v: number; t: number; sc: Scope; drag: boolean; amp: number }
export const springSim = defineSim<SpS>({
  id: 'spring', title: 'Spring & Resonance', subject: 'Physics',
  blurb: 'A mass on a spring with friction and an optional driving force. Sweep the driving frequency towards the natural frequency and watch the amplitude explode.',
  hint: 'Driven damped oscillator m x\'\' + b x\' + k x = F0 cos(wt). Natural frequency w0=sqrt(k/m); resonance peak near w0; damping ratio zeta=b/(2 sqrt(km)); phase lag grows through 90 degrees at resonance.',
  params: [
    { kind: 'number', id: 'k', label: 'Spring constant k', min: 5, max: 200, step: 1, value: 60, unit: 'N/m' },
    { kind: 'number', id: 'm', label: 'Mass', min: 0.2, max: 5, step: 0.1, value: 1, unit: 'kg' },
    { kind: 'number', id: 'b', label: 'Damping b', min: 0, max: 8, step: 0.05, value: 0.4, unit: 'kg/s' },
    { kind: 'number', id: 'F0', label: 'Driving force', min: 0, max: 20, step: 0.5, value: 0, unit: 'N' },
    { kind: 'number', id: 'wd', label: 'Driving frequency', min: 0.5, max: 20, step: 0.05, value: 7.7, unit: 'rad/s' },
  ],
  previewSeconds: 2,
  init() { return { x: 0.9, v: 0, t: 0, sc: new Scope(2, 3000), drag: false, amp: 0 }; },
  step(s, v, dt) {
    if (s.drag) { s.v = 0; return; }
    const k = num(v, 'k'), m = num(v, 'm'), b = num(v, 'b');
    const F = num(v, 'F0') * Math.cos(num(v, 'wd') * s.t);
    s.v += ((-k * s.x - b * s.v + F) / m) * dt;
    s.x += s.v * dt; s.t += dt;
    s.amp = Math.max(Math.abs(s.x), s.amp * (1 - dt * 0.8));
    if (Math.round(s.t / dt) % 6 === 0) s.sc.push(s.t, s.x, F / 20);
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const k = num(v, 'k'), m = num(v, 'm');
    const trackY = h * 0.3, wallX = 24, eq = Math.min(w * 0.36, 260), pxm = Math.min(120, w * 0.2);
    c.fillStyle = '#334155'; c.fillRect(wallX - 10, trackY - 40, 10, 80);
    line(c, wallX, trackY + 26, w - 20, trackY + 26, C.dim, 2);
    line(c, wallX + eq, trackY - 50, wallX + eq, trackY + 40, C.grid, 1, [3, 4]);
    text(c, 'equilibrium', wallX + eq, trackY - 54, C.dim, 10, 'center');
    const bw = 30 + m * 8, bx = wallX + eq + s.x * pxm;
    spring(c, wallX, trackY, bx - bw / 2, trackY, 10, 10 + 0, C.cyan);
    c.fillStyle = C.blue; c.fillRect(bx - bw / 2, trackY - bw / 2, bw, bw);
    c.strokeStyle = C.white; c.strokeRect(bx - bw / 2, trackY - bw / 2, bw, bw);
    arrow(c, bx, trackY + 4, bx - k * s.x * 0.5, trackY + 4, C.red, 2);
    const F = num(v, 'F0') * Math.cos(num(v, 'wd') * s.t);
    if (Math.abs(F) > 0.2) arrow(c, bx, trackY - bw / 2 - 8, bx + F * 3, trackY - bw / 2 - 8, C.green, 2);
    text(c, 'spring force', 24, h * 0.3 + 54, C.red, 10); text(c, 'driving force', 100, h * 0.3 + 54, C.green, 10);
    const half = (w - 36) / 2;
    drawScope(c, { x: 12, y: h * 0.48, w: w - 24, h: h * 0.5 - 8 }, s.sc, [C.amber, 'rgba(52,211,153,0.6)'], { title: 'Position x (amber) and driving force (green) vs time', window: 10 });
    void half;
  },
  pointer(s, _v, e) {
    if (e.kind === 'up') { s.drag = false; return; }
    const cw = e.w, ch = e.h;
    const eq = Math.min(cw * 0.36, 260), pxm = Math.min(120, cw * 0.2), wallX = 24, trackY = ch * 0.3;
    const bx = wallX + eq + s.x * pxm;
    if (e.kind === 'down' && Math.abs(e.x - bx) < 40 && Math.abs(e.y - trackY) < 50) s.drag = true;
    if (s.drag) { s.x = clamp((e.x - wallX - eq) / pxm, -1.5, 1.5); s.v = 0; }
  },
  readouts: (s, v) => {
    const w0 = Math.sqrt(num(v, 'k') / num(v, 'm'));
    return [
      { label: 'Position', value: s.x, unit: 'm' }, { label: 'Velocity', value: s.v, unit: 'm/s' },
      { label: 'Natural ω₀', value: w0, unit: 'rad/s' }, { label: 'Damping ratio ζ', value: num(v, 'b') / (2 * Math.sqrt(num(v, 'k') * num(v, 'm'))), digits: 3 },
      { label: 'Elastic energy', value: 0.5 * num(v, 'k') * s.x * s.x, unit: 'J' }, { label: 'Kinetic energy', value: 0.5 * num(v, 'm') * s.v * s.v, unit: 'J' },
    ];
  },
  equations: (_s, v) => {
    const w0 = Math.sqrt(num(v, 'k') / num(v, 'm'));
    return [
      String.raw`m\ddot x+b\dot x+kx=F_0\cos\omega t`,
      String.raw`\omega_0=\sqrt{k/m}=${fmt(w0, 2)}\ \text{rad/s}\;\Rightarrow\; f_0=${fmt(w0 / TAU, 2)}\ \text{Hz}`,
    ];
  },
});

/* ================================================================== */
/*  1D collisions with restitution                                     */
/* ================================================================== */

interface CoS { x1: number; x2: number; v1: number; v2: number; keStart: number; pStart: number; hits: number }
export const collisions = defineSim<CoS>({
  id: 'collisions', title: 'Collision Lab', subject: 'Physics',
  blurb: 'Two carts collide on a frictionless track. Change masses, speeds and elasticity from perfectly sticky to perfectly bouncy and watch momentum and energy.',
  hint: 'One-dimensional collisions with coefficient of restitution e. Momentum is always conserved; kinetic energy only when e=1. e=0 is perfectly inelastic (stick together). Equal masses with e=1 swap velocities.',
  params: [
    { kind: 'number', id: 'm1', label: 'Mass A', min: 0.5, max: 10, step: 0.5, value: 2, unit: 'kg', resetOnChange: true },
    { kind: 'number', id: 'm2', label: 'Mass B', min: 0.5, max: 10, step: 0.5, value: 1, unit: 'kg', resetOnChange: true },
    { kind: 'number', id: 'u1', label: 'Velocity A', min: -5, max: 5, step: 0.1, value: 3, unit: 'm/s', resetOnChange: true },
    { kind: 'number', id: 'u2', label: 'Velocity B', min: -5, max: 5, step: 0.1, value: -1, unit: 'm/s', resetOnChange: true },
    { kind: 'number', id: 'e', label: 'Elasticity e', min: 0, max: 1, step: 0.05, value: 1, help: '1 = bouncy, 0 = stick together' },
  ],
  previewSeconds: 1.4,
  init(v) {
    const m1 = num(v, 'm1'), m2 = num(v, 'm2'), u1 = num(v, 'u1'), u2 = num(v, 'u2');
    return { x1: 2.5, x2: 7.5, v1: u1, v2: u2, keStart: 0.5 * m1 * u1 * u1 + 0.5 * m2 * u2 * u2, pStart: m1 * u1 + m2 * u2, hits: 0 };
  },
  step(s, v, dt) {
    const m1 = num(v, 'm1'), m2 = num(v, 'm2'), e = num(v, 'e');
    const w1 = 0.5 + Math.cbrt(m1) * 0.35, w2 = 0.5 + Math.cbrt(m2) * 0.35;
    s.x1 += s.v1 * dt; s.x2 += s.v2 * dt;
    if (s.x1 - w1 / 2 < 0) { s.x1 = w1 / 2; s.v1 = Math.abs(s.v1); }
    if (s.x2 + w2 / 2 > 10) { s.x2 = 10 - w2 / 2; s.v2 = -Math.abs(s.v2); }
    if (s.x1 + w1 / 2 > s.x2 - w2 / 2 && s.v1 > s.v2) {
      const p = m1 * s.v1 + m2 * s.v2, rel = s.v1 - s.v2;
      s.v1 = (p - m2 * e * rel) / (m1 + m2);
      s.v2 = (p + m1 * e * rel) / (m1 + m2);
      const ov = s.x1 + w1 / 2 - (s.x2 - w2 / 2);
      s.x1 -= ov * m2 / (m1 + m2); s.x2 += ov * m1 / (m1 + m2);
      s.hits++;
    }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const m1 = num(v, 'm1'), m2 = num(v, 'm2');
    const X = (x: number) => 30 + (x / 10) * (w - 60);
    const ty = h * 0.34;
    line(c, 30, ty + 30, w - 30, ty + 30, C.dim, 3);
    const draw1 = (x: number, m: number, col: string, name: string, vel: number) => {
      const bw = (0.5 + Math.cbrt(m) * 0.35) / 10 * (w - 60), bh = bw * 0.8;
      c.fillStyle = col; c.fillRect(X(x) - bw / 2, ty + 30 - bh, bw, bh);
      c.strokeStyle = C.white; c.strokeRect(X(x) - bw / 2, ty + 30 - bh, bw, bh);
      text(c, `${name} ${m}kg`, X(x), ty + 30 - bh / 2 + 4, C.bg, 12, 'center', 'alphabetic', true);
      arrow(c, X(x), ty + 30 - bh - 12, X(x) + vel * 14, ty + 30 - bh - 12, C.white, 2);
    };
    draw1(s.x1, m1, C.blue, 'A', s.v1); draw1(s.x2, m2, C.orange, 'B', s.v2);
    const bw = (w - 36) / 2;
    const pA = m1 * s.v1, pB = m2 * s.v2;
    const pmax = Math.max(Math.abs(s.pStart), m1 * Math.abs(num(v, 'u1')), m2 * Math.abs(num(v, 'u2')), 1) * 1.6;
    // momentum: signed bars
    const r1 = { x: 12, y: h * 0.58, w: bw, h: h * 0.38 };
    panel(c, r1); text(c, 'Momentum (kg·m/s)', r1.x + 8, r1.y + 14, C.text, 11, 'left', 'alphabetic', true);
    const mid = r1.y + r1.h * 0.58, sc = (r1.h * 0.34) / pmax;
    line(c, r1.x + 8, mid, r1.x + r1.w - 8, mid, C.axis);
    [['A', pA, C.blue], ['B', pB, C.orange], ['Total', pA + pB, C.amber]].forEach((it, i) => {
      const val = it[1] as number, x = r1.x + 24 + i * (r1.w - 40) / 3, bwid = 36;
      c.fillStyle = it[2] as string; c.fillRect(x, val >= 0 ? mid - val * sc : mid, bwid, Math.abs(val) * sc);
      text(c, `${it[0]} ${fmt(val, 1)}`, x + bwid / 2, r1.y + r1.h - 6, C.dim, 10, 'center');
    });
    const ke = 0.5 * m1 * s.v1 * s.v1 + 0.5 * m2 * s.v2 * s.v2;
    bars(c, { x: 24 + bw, y: h * 0.58, w: bw, h: h * 0.38 }, [
      { label: 'KE A', value: 0.5 * m1 * s.v1 * s.v1, color: C.blue }, { label: 'KE B', value: 0.5 * m2 * s.v2 * s.v2, color: C.orange },
      { label: 'Total', value: ke, color: C.amber }, { label: 'Start', value: s.keStart, color: C.dim },
    ], Math.max(s.keStart, 1e-6) * 1.1, 'Kinetic energy (J)');
  },
  readouts: (s, v) => {
    const m1 = num(v, 'm1'), m2 = num(v, 'm2');
    const ke = 0.5 * m1 * s.v1 * s.v1 + 0.5 * m2 * s.v2 * s.v2;
    return [
      { label: 'v of A', value: s.v1, unit: 'm/s' }, { label: 'v of B', value: s.v2, unit: 'm/s' },
      { label: 'Total momentum', value: m1 * s.v1 + m2 * s.v2, unit: 'kg·m/s' }, { label: 'Energy kept', value: s.keStart > 0 ? (ke / s.keStart) * 100 : 100, unit: '%', digits: 1 },
      { label: 'Collisions', value: s.hits, digits: 0 },
    ];
  },
  equations: (_s, v) => [
    String.raw`m_1v_1+m_2v_2=m_1v_1'+m_2v_2'\qquad e=\frac{v_2'-v_1'}{v_1-v_2}=${fmt(num(v, 'e'), 2)}`,
  ],
});

/* ================================================================== */
/*  Gravity & orbits with Kepler wedges                                */
/* ================================================================== */

interface OrS { x: number; y: number; vx: number; vy: number; t: number; hist: { t: number; x: number; y: number }[]; n: number }
const GM = 4 * Math.PI * Math.PI; // AU^3 / yr^2
export const orbits = defineSim<OrS>({
  id: 'orbits', title: 'Orbits & Kepler', subject: 'Physics',
  blurb: 'Launch a planet around a star. Equal-time wedges show Kepler\'s second law: the planet sweeps equal areas in equal times, so it speeds up near the star.',
  hint: 'Two-body Newtonian gravity in AU and years (GM=4pi^2). Speed factor 1.0 gives a circular orbit; <1 gives an ellipse with the start as aphelion; >sqrt2 escapes. Kepler: T^2 = a^3 (years, AU), equal areas in equal times, energy sign decides bound or unbound.',
  params: [
    { kind: 'number', id: 'r0', label: 'Start distance', min: 0.4, max: 3, step: 0.05, value: 1.5, unit: 'AU', resetOnChange: true },
    { kind: 'number', id: 'sf', label: 'Speed (1 = circular)', min: 0.3, max: 1.5, step: 0.01, value: 0.75, resetOnChange: true },
    { kind: 'number', id: 'star', label: 'Star mass', min: 0.5, max: 3, step: 0.1, value: 1, unit: '×Sun', resetOnChange: true },
    { kind: 'toggle', id: 'wedges', label: 'Show equal-time wedges', value: true },
  ],
  dt: 1 / 600, previewSeconds: 0.8,
  init(v) {
    const r0 = num(v, 'r0'), M = num(v, 'star');
    return { x: r0, y: 0, vx: 0, vy: Math.sqrt((GM * M) / r0) * num(v, 'sf'), t: 0, hist: [{ t: 0, x: r0, y: 0 }], n: 0 };
  },
  step(s, v, dt) {
    const mu = GM * num(v, 'star');
    const acc = (x: number, y: number) => { const r = Math.hypot(x, y); const f = -mu / (r * r * r); return [f * x, f * y]; };
    // velocity Verlet
    let [ax, ay] = acc(s.x, s.y);
    s.vx += 0.5 * ax * dt; s.vy += 0.5 * ay * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    [ax, ay] = acc(s.x, s.y);
    s.vx += 0.5 * ax * dt; s.vy += 0.5 * ay * dt;
    s.t += dt;
    if (++s.n % 3 === 0) { s.hist.push({ t: s.t, x: s.x, y: s.y }); if (s.hist.length > 6000) s.hist.shift(); }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = '#05070f'; c.fillRect(0, 0, w, h);
    const mu = GM * num(v, 'star');
    let ext = Math.max(num(v, 'r0') * 1.15, 1.2);
    for (const p of s.hist) ext = Math.max(ext, Math.hypot(p.x, p.y) * 1.08);
    ext = Math.min(ext, 12);
    const R = Math.min(w, h) / 2 - 14, sc = R / ext, cx = w / 2, cy = h / 2;
    for (let i = 0; i < 60; i++) { const a = (i * 97.3) % w, b = (i * 53.7) % h; circle(c, a, b, 0.7, 'rgba(255,255,255,0.35)'); }
    [0.5, 1, 2, 3].forEach(r => { if (r < ext) { c.beginPath(); c.arc(cx, cy, r * sc, 0, TAU); c.strokeStyle = C.grid; c.stroke(); text(c, `${r} AU`, cx + r * sc + 3, cy - 3, C.dim, 9); } });
    const T = (() => { const r = Math.hypot(s.x, s.y), v2 = s.vx * s.vx + s.vy * s.vy; const E = v2 / 2 - mu / r; return E < 0 ? TAU * Math.sqrt(Math.pow(-mu / (2 * E), 3) / mu) : 0; })();
    if (bool(v, 'wedges') && T > 0 && s.t > 0.1) {
      const tau = Math.max(T / 10, 0.02);
      const cols = ['rgba(96,165,250,0.35)', 'rgba(251,191,36,0.35)', 'rgba(52,211,153,0.35)'];
      for (let k = 0; k < 3; k++) {
        const t1 = s.t - k * tau * 1.0, t0 = t1 - tau;
        if (t0 < 0) break;
        const seg = s.hist.filter(p => p.t >= t0 && p.t <= t1);
        if (seg.length < 2) continue;
        c.beginPath(); c.moveTo(cx, cy);
        for (const p of seg) c.lineTo(cx + p.x * sc, cy - p.y * sc);
        c.closePath(); c.fillStyle = cols[k]; c.fill();
      }
    }
    polyline(c, s.hist.map(p => [cx + p.x * sc, cy - p.y * sc] as [number, number]), 'rgba(251,191,36,0.8)', 1.6);
    const g = c.createRadialGradient(cx, cy, 2, cx, cy, 24);
    g.addColorStop(0, '#fff7c2'); g.addColorStop(0.4, '#fbbf24'); g.addColorStop(1, 'rgba(251,191,36,0)');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, 24, 0, TAU); c.fill();
    circle(c, cx + s.x * sc, cy - s.y * sc, 6, C.cyan, C.white, 1.5);
    arrow(c, cx + s.x * sc, cy - s.y * sc, cx + s.x * sc + s.vx * 6, cy - s.y * sc - s.vy * 6, C.green, 2);
  },
  readouts: (s, v) => {
    const mu = GM * num(v, 'star'), r = Math.hypot(s.x, s.y), v2 = s.vx * s.vx + s.vy * s.vy;
    const E = v2 / 2 - mu / r, Lz = s.x * s.vy - s.y * s.vx;
    const ecc = Math.sqrt(Math.max(0, 1 + (2 * E * Lz * Lz) / (mu * mu)));
    const a = E < 0 ? -mu / (2 * E) : Infinity;
    return [
      { label: 'Distance', value: r, unit: 'AU', digits: 3 }, { label: 'Speed', value: Math.sqrt(v2) * 4.74, unit: 'km/s', digits: 1 },
      { label: 'Eccentricity', value: ecc, digits: 3 }, { label: 'Orbit', value: E < 0 ? 'bound' : 'escapes' },
      { label: 'Period', value: E < 0 ? TAU * Math.sqrt(a * a * a / mu) : '-', unit: E < 0 ? 'yr' : '', digits: 2 }, { label: 'Area rate', value: Math.abs(Lz) / 2, unit: 'AU²/yr', digits: 3 },
    ];
  },
  equations: (s, v) => {
    const mu = GM * num(v, 'star'), r = Math.hypot(s.x, s.y), v2 = s.vx * s.vx + s.vy * s.vy, E = v2 / 2 - mu / r;
    const a = E < 0 ? -mu / (2 * E) : NaN;
    return [
      String.raw`F=\frac{GMm}{r^2}\qquad \frac{dA}{dt}=\frac{L}{2m}=\text{constant}`,
      Number.isFinite(a) ? String.raw`T^2=\frac{4\pi^2}{GM}a^3\;\Rightarrow\; a=${fmt(a, 2)}\ \text{AU},\ T=${fmt(TAU * Math.sqrt(a * a * a / mu), 2)}\ \text{yr}` : String.raw`E>0\Rightarrow \text{unbound (escape)}`,
    ];
  },
});
