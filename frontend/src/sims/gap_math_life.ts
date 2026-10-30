/* Gap-fillers: plate tectonics, conic sections, Taylor series, Hardy–Weinberg. */
import { defineSim, SCHOOL_11_12, UG_SCI } from './types';
import type { EducationLevel } from './types';
import { C, TAU, clamp, fmt, line, plot, polyline, text, circle, arrow, panel, bars } from './draw';
import type { Ctx, Rect } from './draw';
import { meta, mulberry } from './univ_util';

const bg = (c: Ctx, w: number, h: number) => { c.fillStyle = C.bg; c.fillRect(0, 0, w, h); };
const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w: Math.max(30, w), h: Math.max(30, h) });
const clip = (c: Ctx, r: Rect) => { c.beginPath(); c.rect(r.x + 34, r.y + 20, Math.max(1, r.w - 42), Math.max(1, r.h - 46)); c.clip(); };

/* ================================================================== */
/*  1. Plate tectonics                                                 */
/* ================================================================== */
export type Boundary = 'divergent' | 'convergent_oc' | 'convergent_cc' | 'transform';
interface PtS { t: number; quakes: { x: number; y: number; age: number; mag: number }[]; slip: number; stress: number; rng: () => number; accNext: number; offset: number; hist: number[] }

export const BOUNDARY_INFO: Record<Boundary, { name: string; rel: string; hazards: string }> = {
  divergent: { name: 'Divergent (mid-ocean ridge)', rel: 'plates move apart; magma rises, new crust forms', hazards: 'shallow quakes, basaltic volcanism, sea-floor spreading' },
  convergent_oc: { name: 'Convergent: oceanic–continental (subduction)', rel: 'dense oceanic plate dives under the continent', hazards: 'deep megathrust quakes, trench, volcanic arc' },
  convergent_cc: { name: 'Convergent: continental–continental (collision)', rel: 'two buoyant plates collide and crumple', hazards: 'large shallow quakes, fold mountains, no subduction volcanism' },
  transform: { name: 'Transform (strike-slip)', rel: 'plates slide past each other horizontally', hazards: 'shallow quakes from stick–slip, no volcanism' },
};
/** Elastic-rebound model: stress accumulates at rate v and is released when it exceeds the strength (stick–slip). */
export const stressAfter = (stress: number, rate: number, dt: number, strength: number): { stress: number; slipped: number } => {
  const s = stress + rate * dt;
  return s >= strength ? { stress: 0, slipped: s } : { stress: s, slipped: 0 };
};
/** Moment magnitude from released elastic energy proxy: Mw = (2/3)(log10 M0 - 9.1), M0 = G A d. */
export const momentMagnitude = (areaKm2: number, slipM: number, G = 3e10) => (2 / 3) * (Math.log10(G * areaKm2 * 1e6 * slipM) - 9.1);

export const plateTectonics = defineSim<PtS>({
  id: 'plate_tectonics', title: 'Plate Tectonics: Boundaries, Mantle Convection and Earthquakes',
  ...meta('Earth Science', 'Intermediate', 'Geology', 'Plate tectonics', 'Plate boundaries, subduction, sea-floor spreading, stick–slip earthquakes', [...SCHOOL_11_12, 'Class 9', 'Class 10', 'B.Sc']),
  covers: ['Plate tectonics', 'Plate boundaries', 'Sea-floor spreading', 'Subduction', 'Mantle convection', 'Earthquakes and volcanoes', 'Elastic rebound theory'],
  tags: ['tectonic plates', 'volcano', 'earthquake', 'continental drift', 'subduction zone', 'mid ocean ridge', 'CBSE geography', 'earth science', 'lithosphere'],
  learningObjectives: ['Distinguish divergent, convergent and transform boundaries by relative plate motion.', 'Link mantle convection to plate motion and to where quakes and volcanoes occur.', 'Explain how stress builds and is released in stick–slip earthquakes, and how magnitude relates to slip and fault area.'],
  assumptions: ['Two-dimensional schematic cross-sections with exaggerated vertical scale.', 'Earthquakes follow a simple elastic-rebound stick–slip model with a random strength jitter, not a real fault-physics code.'],
  blurb: 'Cross-section of a plate boundary driven by a mantle convection cell: plates move, crust is created or destroyed, and stress builds then releases as earthquakes.',
  hint: 'Pick a boundary. Plate speed sets how fast elastic stress accumulates; fault strength sets how big the quakes are. Mw = 2/3 (log10 M0 − 9.1) with M0 = G·A·d.',
  params: [
    { kind: 'select', id: 'type', label: 'Boundary type', value: 'convergent_oc', options: [{ value: 'divergent', label: 'Divergent (ridge)' }, { value: 'convergent_oc', label: 'Convergent: ocean–continent' }, { value: 'convergent_cc', label: 'Convergent: continent–continent' }, { value: 'transform', label: 'Transform' }] },
    { kind: 'number', id: 'speed', label: 'Plate speed', min: 1, max: 15, step: 0.5, value: 6, unit: 'cm/yr', digits: 1 },
    { kind: 'number', id: 'strength', label: 'Fault strength (stress to rupture)', min: 20, max: 200, step: 5, value: 80, digits: 0 },
    { kind: 'number', id: 'area', label: 'Rupture area', min: 10, max: 5000, step: 10, value: 400, unit: 'km²', digits: 0 },
    { kind: 'number', id: 'tscale', label: 'Time compression', min: 1, max: 100, step: 1, value: 20, unit: '×(kyr/s)', digits: 0 },
    { kind: 'toggle', id: 'conv', label: 'Show mantle convection cell', value: true },
  ],
  actions: [{ id: 'restart', label: 'Reset the cross-section' }],
  dt: 1 / 60, previewSeconds: 3,
  init() { return { t: 0, quakes: [], slip: 0, stress: 0, rng: mulberry(7), accNext: 0, offset: 0, hist: [] }; },
  action(s) { s.t = 0; s.quakes = []; s.slip = 0; s.stress = 0; s.offset = 0; s.hist = []; },
  step(s, v, dt) {
    const speed = v.speed as number, str0 = v.strength as number, ts = v.tscale as number;
    s.t += dt; s.offset = (s.offset + speed * dt * 4) % 1000;
    const jitter = 0.7 + 0.6 * s.rng();
    const r = stressAfter(s.stress, speed * 6 * (ts / 20), dt, str0 * jitter);
    s.stress = r.stress;
    if (r.slipped > 0 && (v.type as Boundary) !== 'divergent' || (r.slipped > 0 && s.rng() < 0.4)) {
      const d = (r.slipped / 60) * (speed / 6 + 0.3);
      const mag = momentMagnitude(v.area as number, d);
      s.slip = d;
      const px = (v.type === 'convergent_oc' ? -0.15 + 0.45 * s.rng() : (s.rng() - 0.5) * 0.2);
      s.quakes.push({ x: px, y: v.type === 'convergent_oc' ? 0.1 + 0.3 * s.rng() : 0.08 + 0.12 * s.rng(), age: 0, mag });
    }
    for (const q of s.quakes) q.age += dt;
    s.quakes = s.quakes.filter(q => q.age < 3).slice(-12);
  },
  draw(c, s, v, w, h) {
    bg(c, w, h); const type = v.type as Boundary, A = R(8, 8, w - 16, h * 0.7), G = R(8, h * 0.7 + 14, w - 16, h * 0.3 - 22);
    panel(c, A); const cx = A.x + A.w / 2, top = A.y + A.h * 0.38, sp = (v.speed as number) / 15, ph = s.offset;
    c.save(); c.beginPath(); c.rect(A.x, A.y, A.w, A.h); c.clip();
    // sky / ocean
    const grad = c.createLinearGradient(0, A.y, 0, top); grad.addColorStop(0, '#0e2a47'); grad.addColorStop(1, '#16507a'); c.fillStyle = type === 'convergent_cc' || type === 'transform' ? '#10243d' : grad; c.fillRect(A.x, A.y, A.w, top - A.y);
    // mantle
    c.fillStyle = '#7c2d12'; c.fillRect(A.x, top + 26, A.w, A.y + A.h - top - 26);
    // lithosphere polygons
    const crust = (pts: [number, number][], col: string) => { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fillStyle = col; c.fill(); c.strokeStyle = 'rgba(0,0,0,0.4)'; c.stroke(); };
    const mv = Math.sin(s.t * 0.8) * 0; void mv;
    const drift = (s.t * sp * 14) % 14;
    if (type === 'divergent') {
      const gap = 10 + (s.t * sp * 5) % 40;
      crust([[A.x, top], [cx - gap, top - 6], [cx - gap, top + 30], [A.x, top + 30]], '#475569'); crust([[cx + gap, top - 6], [A.x + A.w, top], [A.x + A.w, top + 30], [cx + gap, top + 30]], '#475569');
      // new crust stripes
      for (let i = 0; i < 6; i++) { const k = ((i * 40 + ph * 0.5) % 240); const stripe = i % 2 ? '#1e293b' : '#334155'; c.fillStyle = stripe; c.fillRect(cx - gap - k * 0.9 - 12, top + 2, 12, 26); c.fillRect(cx + gap + k * 0.9, top + 2, 12, 26); }
      c.fillStyle = '#f97316'; c.beginPath(); c.moveTo(cx - gap, top + 30); c.lineTo(cx - gap, top - 4); c.lineTo(cx, top - 24); c.lineTo(cx + gap, top - 4); c.lineTo(cx + gap, top + 30); c.fill();
      arrow(c, cx - 40, top - 40, cx - 90 - drift, top - 40, C.green, 2, 8); arrow(c, cx + 40, top - 40, cx + 90 + drift, top - 40, C.green, 2, 8);
    } else if (type === 'convergent_oc') {
      // continental plate right, oceanic left sliding under
      crust([[cx, top - 30], [A.x + A.w, top - 40], [A.x + A.w, top + 30], [cx, top + 30]], '#78716c');
      crust([[A.x, top + 6], [cx - 30, top + 6], [cx + 20, top + 30], [A.x + A.w * 0.8, A.y + A.h - 20], [A.x + A.w * 0.8 - 28, A.y + A.h - 14], [cx - 30, top + 34], [A.x, top + 34]], '#334155');
      c.fillStyle = '#0b1b2e'; c.beginPath(); c.moveTo(cx - 50, top + 6); c.lineTo(cx - 28, top + 20); c.lineTo(cx - 10, top + 6); c.fill();
      circle(c, cx + 60, top - 38, 0.1); c.fillStyle = '#a16207'; c.beginPath(); c.moveTo(cx + 40, top - 32); c.lineTo(cx + 70, top - 66); c.lineTo(cx + 100, top - 34); c.fill();
      if ((s.t * 2) % 1 < 0.6) { c.fillStyle = 'rgba(251,146,60,0.9)'; c.beginPath(); c.arc(cx + 70, top - 70 - ((s.t * 20) % 18), 4, 0, TAU); c.fill(); }
      arrow(c, cx - 140, top - 14, cx - 60 + drift, top - 14, C.green, 2, 8);
      for (let i = 0; i < 6; i++) { const f = (i * 0.17 + s.t * 0.05) % 1; circle(c, cx - 10 + f * (A.w * 0.3), top + 30 + f * (A.h * 0.45), 2, C.amber); }
    } else if (type === 'convergent_cc') {
      const sh = Math.min(30, (s.t * sp * 4) % 60);
      crust([[A.x, top - 6], [cx - 6, top - 6], [cx - 6, top + 40], [A.x, top + 40]], '#78716c'); crust([[cx + 6, top - 6], [A.x + A.w, top - 6], [A.x + A.w, top + 40], [cx + 6, top + 40]], '#92877d');
      for (const sgn of [-1, 1]) { c.fillStyle = '#a8a29e'; c.beginPath(); c.moveTo(cx, top - 6); c.lineTo(cx + sgn * 70, top - 6); c.lineTo(cx + sgn * 20, top - 40 - sh); c.lineTo(cx, top - 44 - sh); c.fill(); }
      arrow(c, cx - 120, top - 22, cx - 50 + drift, top - 22, C.green, 2, 8); arrow(c, cx + 120, top - 22, cx + 50 - drift, top - 22, C.green, 2, 8);
    } else {
      const off = (s.t * sp * 20) % 60;
      c.fillStyle = '#475569'; c.fillRect(A.x + 10, top - 10 + off * 0, A.w / 2 - 14, 18); c.fillRect(cx + 4, top + 10, A.w / 2 - 14, 18);
      c.fillStyle = '#1f2937'; c.fillRect(A.x, top - 10, A.w, 8);
      arrow(c, cx - 60, top - 24, cx - 60 + 80, top - 24, C.green, 2, 8); arrow(c, cx + 60, top + 44, cx + 60 - 80, top + 44, C.green, 2, 8);
      text(c, 'plan view: fault trace', A.x + 12, A.y + 30, C.dim, 10);
    }
    // convection cell
    if (v.conv) {
      const r = Math.min(A.w * 0.3, (A.y + A.h - top - 40) * 0.5), cy2 = top + 40 + r;
      for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU + s.t * 0.4 * (type === 'divergent' ? 1 : -1); circle(c, cx + Math.cos(a) * r * 1.3, cy2 + Math.sin(a) * r * 0.55, 3, 'rgba(253,186,116,0.8)'); }
      text(c, 'mantle convection', cx, A.y + A.h - 8, 'rgba(253,186,116,0.9)', 10, 'center');
    }
    // quakes
    for (const q of s.quakes) { const rr = q.age * 40 * Math.max(0.4, q.mag / 6), al = clamp(1 - q.age / 3, 0, 1); circle(c, cx + q.x * A.w, top + q.y * A.h, rr, undefined, `rgba(248,113,113,${al})`, 2); circle(c, cx + q.x * A.w, top + q.y * A.h, 3, C.red); }
    c.restore();
    text(c, BOUNDARY_INFO[type].name, A.x + 10, A.y + 16, C.text, 12, 'left', 'alphabetic', true);
    text(c, BOUNDARY_INFO[type].rel, A.x + 10, A.y + 30, C.dim, 10);
    // stress sawtooth
    const mx = plot(c, G, [0, 60], [0, (v.strength as number) * 1.4], { title: 'Elastic stress on fault (stick–slip)', xlabel: 'time', ylabel: 'stress' });
    c.save(); clip(c, G); const hist = s.hist; hist.push(s.stress); if (hist.length > 240) hist.shift();
    polyline(c, hist.map((y, i) => [mx.X((i / 240) * 60), mx.Y(y)] as [number, number]), C.red, 2); line(c, mx.X(0), mx.Y(v.strength as number), mx.X(60), mx.Y(v.strength as number), C.amber, 1, [4, 3]); c.restore();
  },
  readouts(s, v) {
    const type = v.type as Boundary, last = s.quakes[s.quakes.length - 1];
    return [
      { label: 'Relative plate speed', value: v.speed as number, unit: 'cm/yr', digits: 1 },
      { label: 'Stress on fault', value: s.stress, digits: 1 },
      { label: 'Last slip', value: s.slip, unit: 'm', digits: 2 },
      { label: 'Last earthquake magnitude Mw', value: last ? last.mag : 0, digits: 1 },
      { label: 'Geological time elapsed', value: s.t * (v.tscale as number), unit: 'kyr', digits: 0 },
      { label: 'Typical hazards', value: BOUNDARY_INFO[type].hazards },
    ];
  },
  equations(s, v) { return [`M_0 = G\\,A\\,d,\\qquad M_w=\\tfrac23\\left(\\log_{10}M_0-9.1\\right)=${fmt(s.quakes.length ? s.quakes[s.quakes.length - 1].mag : momentMagnitude(v.area as number, 1), 2)}`, `\\sigma(t)=\\dot\\sigma\\,t\\ \\to\\ \\text{slip when } \\sigma\\ge\\sigma_c\\ \\text{(elastic rebound)}`]; },
});

/* ================================================================== */
/*  2. Conic sections                                                  */
/* ================================================================== */
export type ConicKind = 'circle' | 'ellipse' | 'parabola' | 'hyperbola';
/** Slicing a cone of half-angle alpha with a plane making angle beta with the cone axis: e = cos(beta)/cos(alpha) (beta = 90° gives a circle, beta = alpha a parabola). */
export const conicEccentricity = (alphaDeg: number, betaDeg: number) => Math.cos((betaDeg * Math.PI) / 180) / Math.cos((alphaDeg * Math.PI) / 180);
const sweepTilt = (alpha: number, t: number) => (90 - alpha + 25) * (0.5 + 0.5 * Math.sin(t * 0.4 - Math.PI / 2));
export const classify = (e: number): ConicKind => (e < 1e-3 ? 'circle' : e < 0.999 ? 'ellipse' : e < 1.001 ? 'parabola' : 'hyperbola');
interface CoS { t: number; phase: number }
export const conicSections = defineSim<CoS>({
  id: 'conic_sections', title: 'Conic Sections: Slicing a Cone and Focus–Directrix',
  ...meta('Math', 'Intermediate', 'Coordinate Geometry', 'Conic sections', 'Circle, ellipse, parabola, hyperbola, eccentricity, foci, directrix', [...SCHOOL_11_12, 'B.Sc', 'B.Tech']),
  covers: ['Conic sections', 'Circle', 'Ellipse', 'Parabola', 'Hyperbola', 'Eccentricity', 'Foci', 'Directrix'],
  tags: ['conics', 'cone slice', 'focus directrix', 'eccentricity', 'coordinate geometry', 'CBSE class 11', 'JEE'],
  learningObjectives: ['Relate the tilt of the cutting plane to the type of conic.', 'Use eccentricity e = PF/PD to identify and draw a conic.', 'Locate foci and verify |PF1|+|PF2| = 2a (ellipse) or ||PF1|−|PF2|| = 2a (hyperbola).'],
  assumptions: ['Right circular double cone; eccentricity e = cos β / cos α, where α is the cone half-angle and β the angle between the cutting plane and the cone axis (β = 90° − tilt).'],
  blurb: 'A plane cuts a double cone; tilt it and the section morphs from circle to ellipse to parabola to hyperbola. A point traces the curve so the focus–directrix definition is verified live.',
  hint: 'Parabola occurs when the plane is parallel to the cone generator (e=1). Use the "Sweep tilt" toggle to see the family change continuously.',
  params: [
    { kind: 'number', id: 'alpha', label: 'Cone half-angle α', min: 15, max: 60, step: 1, value: 35, unit: '°', digits: 0 },
    { kind: 'number', id: 'tilt', label: 'Plane tilt from horizontal θ', min: 0, max: 85, step: 0.5, value: 20, unit: '°', digits: 1 },
    { kind: 'number', id: 'p', label: 'Semi-latus rectum ℓ (curve scale)', min: 0.5, max: 3, step: 0.1, value: 1.5, digits: 1 },
    { kind: 'toggle', id: 'sweep', label: 'Sweep tilt automatically', value: true },
    { kind: 'toggle', id: 'dir', label: 'Show directrix and focal distances', value: true },
  ],
  actions: [{ id: 'restart', label: 'Restart sweep' }],
  dt: 1 / 60, previewSeconds: 2,
  init() { return { t: 0, phase: 0 }; },
  action(s) { s.t = 0; s.phase = 0; },
  step(s, v, dt) { s.t += dt; s.phase = (s.phase + dt * 0.35) % TAU; },
  draw(c, s, v, w, h) {
    bg(c, w, h);
    const alpha = v.alpha as number, tilt = v.sweep ? clamp(sweepTilt(alpha, s.t), 0, 89) : (v.tilt as number);
    const e = conicEccentricity(alpha, 90 - tilt) , kind = classify(e);
    const A = R(8, 8, w * 0.42, h - 16), B = R(A.x + A.w + 8, 8, w - A.w - 24, h - 16);
    panel(c, A); text(c, 'Cone and cutting plane (side view)', A.x + 8, A.y + 14, C.text, 11, 'left', 'alphabetic', true);
    const cx = A.x + A.w / 2, cy = A.y + A.h / 2, H = A.h * 0.38, rw = H * Math.tan((alpha * Math.PI) / 180);
    c.strokeStyle = C.blue; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - rw, cy - H); c.lineTo(cx + rw, cy + H); c.moveTo(cx + rw, cy - H); c.lineTo(cx - rw, cy + H); c.stroke();
    const th = (tilt * Math.PI) / 180; const L = A.w * 0.46;
    c.strokeStyle = C.amber; c.lineWidth = 2.5; c.beginPath(); c.moveTo(cx - Math.cos(th) * L, cy + Math.sin(th) * L * 0.0 + H * 0.35 + Math.sin(th) * L); c.lineTo(cx + Math.cos(th) * L, cy + H * 0.35 - Math.sin(th) * L); c.stroke();
    text(c, `θ = ${fmt(tilt, 1)}°  (generator at ${fmt(90 - alpha, 1)}°)`, A.x + 8, A.y + A.h - 8, C.amber, 10);
    panel(c, B); text(c, `${kind.toUpperCase()}   e = ${e < 5 ? fmt(e, 3) : '>5'}`, B.x + 10, B.y + 16, C.text, 13, 'left', 'alphabetic', true);
    const ℓ = v.p as number, eE = Math.min(e, 8), scale = Math.min(B.w, B.h) / 13, ox = B.x + B.w / 2, oy = B.y + B.h / 2 + 4;
    // curve coordinates: focus F at the origin, r = l/(1+e cos t); view is shifted so the figure is centred
    const aE = eE < 0.999 ? ℓ / (1 - eE * eE) : eE > 1.001 ? ℓ / (eE * eE - 1) : 0;
    const off = eE < 0.999 ? eE * aE : eE > 1.001 ? 0 : ℓ / 2; // value subtracted from x then screen-centred
    const X = (x: number) => ox + (x + (eE < 0.999 ? eE * aE : eE > 1.001 ? 0 : ℓ / 2)) * scale, Y = (y: number) => oy - y * scale; void off;
    line(c, B.x + 4, oy, B.x + B.w - 4, oy, C.axis, 1); line(c, ox, B.y + 24, ox, B.y + B.h - 4, C.axis, 1);
    c.save(); c.beginPath(); c.rect(B.x + 2, B.y + 24, B.w - 4, B.h - 28); c.clip();
    let seg: [number, number][] = []; const N = 720;
    for (let i = 0; i <= N; i++) {
      const t = (TAU * i) / N, den = 1 + eE * Math.cos(t), r = ℓ / den;
      if (Math.abs(den) < 0.02 || Math.abs(r) > 60) { if (seg.length > 1) polyline(c, seg, C.green, 2.5); seg = []; continue; }
      if (den < 0 && seg.length && ℓ / (1 + eE * Math.cos(t - TAU / N)) > 0) { polyline(c, seg, C.green, 2.5); seg = []; }
      seg.push([X(r * Math.cos(t)), Y(r * Math.sin(t))]);
    }
    if (seg.length > 1) polyline(c, seg, C.green, 2.5);
    circle(c, X(0), Y(0), 4, C.amber); text(c, 'F', X(0) + 6, Y(0) - 6, C.amber, 10);
    if (eE < 0.999) { circle(c, X(-2 * eE * aE), Y(0), 4, C.amber); text(c, "F′", X(-2 * eE * aE) + 6, Y(0) - 6, C.amber, 10); }
    if (eE > 1.001) { circle(c, X(-2 * eE * aE), Y(0), 4, C.amber); text(c, "F′", X(-2 * eE * aE) + 6, Y(0) - 6, C.amber, 10); }
    const tt = 0.2 + 2.6 * Math.abs(Math.sin(s.phase * 0.5)) + (eE > 1.001 ? 0 : 0.2), tm = eE > 1.001 ? Math.min(tt, Math.acos(-1 / eE) - 0.25) : tt;
    const r = ℓ / (1 + eE * Math.cos(tm)), px = r * Math.cos(tm), py = r * Math.sin(tm), xd = ℓ / Math.max(eE, 1e-6);
    if (v.dir && eE > 1e-3) { line(c, X(xd), B.y + 24, X(xd), B.y + B.h - 4, C.purple, 1.2, [5, 4]); text(c, 'directrix', X(xd) + 4, B.y + 38, C.purple, 10); line(c, X(0), Y(0), X(px), Y(py), C.pink, 1.5); line(c, X(px), Y(py), X(xd), Y(py), C.cyan, 1.5); }
    circle(c, X(px), Y(py), 5, C.red, C.white, 1.2); c.restore();
    if (v.dir && eE > 1e-3) text(c, `PF = ${fmt(Math.hypot(px, py), 3)}   PD = ${fmt(xd - px, 3)}   PF/PD = ${fmt(Math.hypot(px, py) / Math.max(1e-9, xd - px), 3)} = e`, B.x + 10, B.y + B.h - 8, C.cyan, 10);
  },
  readouts(s, v) {
    const alpha = v.alpha as number, tilt = v.sweep ? clamp(sweepTilt(alpha, s.t), 0, 89) : (v.tilt as number), e = conicEccentricity(alpha, 90 - tilt), ℓ = v.p as number;
    const k = classify(e);
    return [
      { label: 'Conic type', value: k }, { label: 'Eccentricity e = cos β / cos α', value: e, digits: 4 }, { label: 'Plane tilt', value: tilt, unit: '°', digits: 1 },
      { label: 'Semi-major axis a', value: k === 'ellipse' || k === 'circle' ? ℓ / (1 - Math.min(e, 0.999) ** 2) : k === 'hyperbola' ? ℓ / (e * e - 1) : 'n/a', digits: 3 },
      { label: 'Focal parameter', value: ℓ, digits: 2 },
    ];
  },
  equations(s, v) { const alpha = v.alpha as number, tilt = v.sweep ? clamp(sweepTilt(alpha, s.t), 0, 89) : (v.tilt as number), e = conicEccentricity(alpha, 90 - tilt); return [`e=\\dfrac{\\cos\\beta}{\\cos\\alpha}=${fmt(e, 3)}\\ \\Rightarrow\\ \\text{${classify(e)}}`, 'r=\\dfrac{\\ell}{1+e\\cos\\theta},\\qquad \\dfrac{PF}{PD}=e', '\\dfrac{x^2}{a^2}\\pm\\dfrac{y^2}{b^2}=1,\\quad b^2=a^2|1-e^2|']; },
});

/* ================================================================== */
/*  3. Taylor series                                                   */
/* ================================================================== */
export type TFn = 'sin' | 'cos' | 'exp' | 'ln1p' | 'geo';
const FN: Record<TFn, { f: (x: number) => number; name: string; dom: [number, number]; rad: number }> = {
  sin: { f: Math.sin, name: 'sin x', dom: [-9, 9], rad: Infinity }, cos: { f: Math.cos, name: 'cos x', dom: [-9, 9], rad: Infinity },
  exp: { f: Math.exp, name: 'eˣ', dom: [-4, 4], rad: Infinity }, ln1p: { f: (x: number) => Math.log(1 + x), name: 'ln(1+x)', dom: [-0.95, 3], rad: 1 },
  geo: { f: (x: number) => 1 / (1 - x), name: '1/(1−x)', dom: [-2, 0.95], rad: 1 },
};
/** n-th derivative of each function at a. */
export function derivAt(fn: TFn, k: number, a: number): number {
  switch (fn) {
    case 'sin': return [Math.sin(a), Math.cos(a), -Math.sin(a), -Math.cos(a)][k % 4];
    case 'cos': return [Math.cos(a), -Math.sin(a), -Math.cos(a), Math.sin(a)][k % 4];
    case 'exp': return Math.exp(a);
    case 'ln1p': { if (k === 0) return Math.log(1 + a); let f = 1; for (let i = 1; i < k; i++) f *= i; return (k % 2 ? 1 : -1) * f / Math.pow(1 + a, k); }
    case 'geo': { let f = 1; for (let i = 2; i <= k; i++) f *= i; return f / Math.pow(1 - a, k + 1); }
  }
}
export function taylor(fn: TFn, n: number, a: number, x: number): number {
  let sum = 0, fact = 1, pw = 1;
  for (let k = 0; k <= n; k++) { if (k > 0) { fact *= k; pw *= (x - a); } sum += (derivAt(fn, k, a) / fact) * pw; }
  return sum;
}
interface TaS { t: number; nAnim: number }
export const taylorSeries = defineSim<TaS>({
  id: 'taylor_series', title: 'Taylor Series Approximation and Error Bound',
  ...meta('Math', 'Intermediate', 'Calculus', 'Taylor series approximation', 'Polynomial approximation, radius of convergence, Lagrange remainder', [...SCHOOL_11_12, ...UG_SCI, 'M.Sc']),
  covers: ['Taylor series', 'Maclaurin series', 'Radius of convergence', 'Lagrange remainder', 'Polynomial approximation'],
  tags: ['taylor', 'maclaurin', 'series expansion', 'calculus', 'convergence', 'remainder', 'B.Sc maths', 'engineering maths'],
  learningObjectives: ['See successive Taylor polynomials hug the function near the centre.', 'Observe the radius of convergence for ln(1+x) and 1/(1−x).', 'Compare actual error with the Lagrange bound.'],
  assumptions: ['Derivatives are exact closed forms; polynomials evaluated in double precision, so very high orders may lose precision far from the centre.'],
  blurb: 'Watch the Taylor polynomial grow term by term around any centre and see where it converges, with the error curve and Lagrange bound alongside.',
  hint: 'Increase order n or toggle Animate to add terms. ln(1+x) and 1/(1−x) diverge outside |x−a| < radius.',
  params: [
    { kind: 'select', id: 'fn', label: 'Function f(x)', value: 'sin', options: [{ value: 'sin', label: 'sin x' }, { value: 'cos', label: 'cos x' }, { value: 'exp', label: 'eˣ' }, { value: 'ln1p', label: 'ln(1+x)' }, { value: 'geo', label: '1/(1−x)' }] },
    { kind: 'number', id: 'n', label: 'Order n', min: 0, max: 25, step: 1, value: 5, digits: 0 },
    { kind: 'number', id: 'a', label: 'Centre a', min: -2, max: 2, step: 0.1, value: 0, digits: 1 },
    { kind: 'number', id: 'x0', label: 'Evaluation point x', min: -3, max: 3, step: 0.1, value: 1.5, digits: 1 },
    { kind: 'toggle', id: 'anim', label: 'Animate: add terms automatically', value: true },
  ],
  actions: [{ id: 'restart', label: 'Restart from order 0' }],
  dt: 1 / 30, previewSeconds: 3,
  init() { return { t: 0, nAnim: 0 }; },
  action(s) { s.t = 0; s.nAnim = 0; },
  step(s, v, dt) { s.t += dt; if (v.anim) s.nAnim = (s.t * 1.2) % ((v.n as number) + 1.99); },
  draw(c, s, v, w, h) {
    bg(c, w, h); const fn = v.fn as TFn, F = FN[fn], n = v.anim ? Math.floor(s.nAnim) : (v.n as number), a = clamp(v.a as number, F.dom[0] + 0.05, F.dom[1] - 0.05);
    const A = R(8, 8, w - 16, h * 0.62), B = R(8, h * 0.62 + 14, w - 16, h * 0.38 - 22);
    const xs = F.dom, ys: [number, number] = fn === 'exp' ? [-1, 12] : fn === 'sin' || fn === 'cos' ? [-3, 3] : [-4, 4];
    const m = plot(c, A, xs, ys, { title: `f(x) = ${F.name}  and Taylor polynomial P${n}(x) about a = ${fmt(a, 1)}`, grid: true, zeroAxis: true });
    c.save(); clip(c, A);
    const pf: [number, number][] = [], pp: [number, number][] = [];
    for (let i = 0; i <= 400; i++) { const x = xs[0] + ((xs[1] - xs[0]) * i) / 400; const yf = F.f(x); if (Number.isFinite(yf)) pf.push([m.X(x), m.Y(yf)]); pp.push([m.X(x), m.Y(clamp(taylor(fn, n, a, x), -50, 50))]); }
    polyline(c, pp, C.amber, 2.2); polyline(c, pf, C.cyan, 2.2);
    if (Number.isFinite(F.rad)) { for (const sg of [-1, 1]) line(c, m.X(a + sg * F.rad), A.y + 20, m.X(a + sg * F.rad), A.y + A.h - 26, C.red, 1, [4, 4]); }
    line(c, m.X(a), A.y + 20, m.X(a), A.y + A.h - 26, C.purple, 1, [2, 3]);
    const x0 = v.x0 as number; circle(c, m.X(x0), m.Y(taylor(fn, n, a, x0)), 5, C.amber, C.white, 1);
    const fx = F.f(x0); if (Number.isFinite(fx)) circle(c, m.X(x0), m.Y(fx), 4, C.cyan, C.white, 1);
    c.restore(); text(c, 'f (cyan)   Pₙ (amber)   radius of convergence (red dashed)', A.x + A.w - 8, A.y + 14, C.dim, 9, 'right');
    // error plot (log10)
    const em = plot(c, B, [0, 25], [-16, 2], { title: 'log₁₀ |f(x) − Pₙ(x)| at the chosen x versus order', xlabel: 'order n', ylabel: 'log₁₀ error' });
    c.save(); clip(c, B);
    const ep: [number, number][] = [];
    for (let k = 0; k <= 25; k++) { const xe = v.x0 as number, e = Math.abs(F.f(xe) - taylor(fn, k, a, xe)); ep.push([em.X(k), em.Y(clamp(Math.log10(e + 1e-17), -16, 2))]); }
    polyline(c, ep, C.green, 2); for (const [x, y] of ep) circle(c, x, y, 2.5, C.green);
    line(c, em.X(n), B.y + 20, em.X(n), B.y + B.h - 26, C.amber, 1, [3, 3]); c.restore();
  },
  readouts(s, v) {
    const fn = v.fn as TFn, F = FN[fn], n = v.anim ? Math.floor(s.nAnim) : (v.n as number), a = v.a as number, x0 = v.x0 as number;
    const approx = taylor(fn, n, a, x0), exact = F.f(x0), err = Math.abs(exact - approx);
    return [{ label: 'Order n', value: n, digits: 0 }, { label: 'Pₙ(x)', value: approx, digits: 6 }, { label: 'f(x) exact', value: Number.isFinite(exact) ? exact : 'undefined', digits: 6 }, { label: '|error|', value: Number.isFinite(err) ? err : 'diverged', digits: 8 }, { label: 'Radius of convergence', value: Number.isFinite(F.rad) ? F.rad : '∞' }, { label: 'Inside radius?', value: Math.abs(x0 - a) < F.rad ? 'yes — converges' : 'no — diverges' }];
  },
  equations(s, v) { const n = v.anim ? Math.floor(s.nAnim) : (v.n as number); return [`P_n(x)=\\sum_{k=0}^{${n}}\\dfrac{f^{(k)}(a)}{k!}(x-a)^k`, 'R_n(x)=\\dfrac{f^{(n+1)}(\\xi)}{(n+1)!}(x-a)^{n+1}\\quad(\\text{Lagrange})', `\\sin x=\\sum (-1)^k\\dfrac{x^{2k+1}}{(2k+1)!},\\quad e^x=\\sum\\dfrac{x^k}{k!}`]; },
});

/* ================================================================== */
/*  4. Hardy–Weinberg equilibrium and drift/selection                  */
/* ================================================================== */
export const hwGenotypes = (p: number) => ({ AA: p * p, Aa: 2 * p * (1 - p), aa: (1 - p) * (1 - p) });
/** Deterministic selection on viability: fitness AA = 1, Aa = 1 − hs, aa = 1 − s; returns next p. */
export const selectionStep = (p: number, sel: number, h: number) => { const q = 1 - p, wAA = 1, wAa = 1 - h * sel, waa = 1 - sel, wbar = p * p * wAA + 2 * p * q * wAa + q * q * waa; return (p * p * wAA + p * q * wAa) / wbar; };
export const chiSquare = (obs: [number, number, number], p: number) => { const n = obs[0] + obs[1] + obs[2], e = [n * p * p, 2 * n * p * (1 - p), n * (1 - p) * (1 - p)]; return obs.reduce((acc, o, i) => acc + (e[i] > 0 ? ((o - e[i]) ** 2) / e[i] : 0), 0); };
interface HwS { gen: number; p: number; pDet: number; traj: number[]; trajDet: number[]; counts: [number, number, number]; rng: () => number; acc: number }
export const hardyWeinberg = defineSim<HwS>({
  id: 'hardy_weinberg', title: 'Hardy–Weinberg Equilibrium, Genetic Drift and Selection',
  ...meta('Biology', 'Intermediate', 'Genetics', 'Hardy–Weinberg equilibrium', 'Allele frequencies, genotype frequencies, drift, selection, chi-square test', [...SCHOOL_11_12, 'B.Sc']),
  covers: ['Hardy–Weinberg equilibrium', 'Allele frequency', 'Genetic drift', 'Natural selection', 'Population genetics', 'Chi-square test'],
  tags: ['hardy weinberg', 'p squared 2pq q squared', 'population genetics', 'genetic drift', 'selection coefficient', 'allele frequency', 'NEET', 'CBSE biology'],
  learningObjectives: ['Compute genotype frequencies p², 2pq, q² from allele frequencies.', 'See that frequencies stay constant without evolutionary forces, and drift in small populations.', 'Test equilibrium with a chi-square statistic.'],
  assumptions: ['Diploid, random mating, non-overlapping generations, one biallelic locus; drift is Wright–Fisher binomial sampling; selection acts on viability.'],
  blurb: 'A Wright–Fisher population evolves generation by generation. Turn drift, selection and dominance on or off and watch p wander against the deterministic expectation, with a live chi-square test.',
  hint: 'With N large and s = 0, p stays put (Hardy–Weinberg). Small N makes p random-walk to fixation; s > 0 pushes p toward the fitter allele.',
  params: [
    { kind: 'number', id: 'p0', label: 'Initial allele frequency p (A)', min: 0.02, max: 0.98, step: 0.01, value: 0.5, digits: 2, resetOnChange: true },
    { kind: 'number', id: 'N', label: 'Population size N', min: 10, max: 5000, step: 10, value: 100, digits: 0 },
    { kind: 'number', id: 's', label: 'Selection coefficient s against aa', min: 0, max: 0.5, step: 0.01, value: 0, digits: 2 },
    { kind: 'number', id: 'h', label: 'Dominance h (Aa fitness loss = hs)', min: 0, max: 1, step: 0.05, value: 0, digits: 2 },
    { kind: 'number', id: 'rate', label: 'Generations per second', min: 1, max: 30, step: 1, value: 6, digits: 0 },
  ],
  actions: [{ id: 'restart', label: 'New population' }],
  dt: 1 / 30, previewSeconds: 4,
  init(v) { const p = v.p0 as number; return { gen: 0, p, pDet: p, traj: [p], trajDet: [p], counts: [0, 0, 0], rng: mulberry(Math.floor(p * 1e4) + 3), acc: 0 }; },
  action(s, v) { Object.assign(s, { gen: 0, p: v.p0 as number, pDet: v.p0 as number, traj: [v.p0 as number], trajDet: [v.p0 as number], counts: [0, 0, 0], rng: mulberry(Math.floor(Math.random() * 1e6)), acc: 0 }); },
  step(s, v, dt) {
    s.acc += dt * (v.rate as number);
    while (s.acc >= 1) {
      s.acc -= 1; s.gen++;
      const ps = selectionStep(s.p, v.s as number, v.h as number); s.pDet = selectionStep(s.pDet, v.s as number, v.h as number);
      const N = v.N as number, g = hwGenotypes(ps); let AA = 0, Aa = 0, aa = 0;
      for (let i = 0; i < N; i++) { const r = s.rng(); if (r < g.AA) AA++; else if (r < g.AA + g.Aa) Aa++; else aa++; }
      s.counts = [AA, Aa, aa]; s.p = (2 * AA + Aa) / (2 * N);
      s.traj.push(s.p); s.trajDet.push(s.pDet); if (s.traj.length > 400) { s.traj.shift(); s.trajDet.shift(); }
    }
  },
  draw(c, s, v, w, h) {
    bg(c, w, h); const A = R(8, 8, w * 0.62 - 12, h - 16), B = R(A.x + A.w + 8, 8, w - A.w - 24, h - 16);
    const m = plot(c, A, [0, Math.max(60, s.traj.length)], [0, 1], { title: 'Allele frequency p(A) per generation', xlabel: 'generation', ylabel: 'p', grid: true });
    c.save(); clip(c, A); polyline(c, s.trajDet.map((y, i) => [m.X(i), m.Y(y)] as [number, number]), C.amber, 1.6, [5, 4]); polyline(c, s.traj.map((y, i) => [m.X(i), m.Y(y)] as [number, number]), C.cyan, 2.2); c.restore();
    text(c, 'cyan: simulated (drift + selection)   amber dashed: deterministic', A.x + A.w - 8, A.y + 14, C.dim, 9, 'right');
    const g = hwGenotypes(s.p), N = v.N as number, tot = Math.max(1, s.counts[0] + s.counts[1] + s.counts[2]);
    bars(c, B, [{ label: 'AA obs', value: s.counts[0] / tot, color: C.green }, { label: 'AA exp', value: g.AA, color: 'rgba(52,211,153,0.45)' }, { label: 'Aa obs', value: s.counts[1] / tot, color: C.blue }, { label: 'Aa exp', value: g.Aa, color: 'rgba(96,165,250,0.45)' }, { label: 'aa obs', value: s.counts[2] / tot, color: C.pink }, { label: 'aa exp', value: g.aa, color: 'rgba(244,114,182,0.45)' }], 1, `Genotype frequencies (N=${N})`);
  },
  readouts(s, v) {
    const g = hwGenotypes(s.p), x2 = chiSquare(s.counts, s.p), fixed = s.p <= 0 || s.p >= 1;
    return [{ label: 'Generation', value: s.gen, digits: 0 }, { label: 'p (A)', value: s.p, digits: 4 }, { label: 'q (a)', value: 1 - s.p, digits: 4 }, { label: 'Expected p², 2pq, q²', value: `${fmt(g.AA, 3)}, ${fmt(g.Aa, 3)}, ${fmt(g.aa, 3)}` }, { label: 'χ² (df = 1)', value: x2, digits: 3 }, { label: 'Hardy–Weinberg holds? (χ² < 3.84)', value: x2 < 3.84 ? 'yes' : 'rejected at 5%' }, { label: 'Status', value: fixed ? 'allele fixed/lost' : (v.s as number) > 0 ? 'under selection' : 'neutral' }];
  },
  equations(s) { return [`p+q=1,\\qquad p^2+2pq+q^2=1`, `p_{t+1}=\\dfrac{p^2w_{AA}+pq\\,w_{Aa}}{\\bar w},\\quad \\bar w=p^2w_{AA}+2pq\\,w_{Aa}+q^2w_{aa}`, `\\mathrm{Var}(\\Delta p)=\\dfrac{p(1-p)}{2N},\\qquad \\chi^2=\\sum\\dfrac{(O-E)^2}{E}=${fmt(chiSquare(s.counts, s.p), 3)}`]; },
});
export type { EducationLevel };
