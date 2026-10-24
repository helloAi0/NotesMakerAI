import { defineSim, num, str, bool, UG_ENG } from './types';
import type { EducationLevel, Difficulty } from './types';
import { C, TAU, arrow, circle, clamp, fmt, line, panel, plot, polyline, text, deg, rad } from './draw';

const meta = (levels: EducationLevel[], difficulty: Difficulty, category: string, topic: string, subtopic: string) => ({
  subject: 'Engineering' as const, status: 'active' as const, educationLevels: levels, difficulty, category, topic, subtopic,
});
const ENG: EducationLevel[] = [...UG_ENG, 'B.Sc'];

/* ================================================================== */
/*  Beam bending                                                       */
/* ================================================================== */
interface BmS { t: number }
function beamSolve(v: { L: number; P: number; a: number; w: number; EI: number; kind: string }) {
  const { L, P, a, w, EI, kind } = v, n = 200, dx = L / n;
  const x: number[] = [], V: number[] = [], M: number[] = [], y: number[] = [];
  let R1 = 0, R2 = 0;
  if (kind === 'ss') { R2 = (P * a + (w * L * L) / 2) / L; R1 = P + w * L - R2; }
  for (let i = 0; i <= n; i++) {
    const xi = i * dx; x.push(xi);
    if (kind === 'ss') {
      V.push(R1 - w * xi - (xi > a ? P : 0));
      M.push(R1 * xi - (w * xi * xi) / 2 - (xi > a ? P * (xi - a) : 0));
    } else { // cantilever fixed at x = 0, free at L; sign: sagging positive means hogging negative here
      V.push(P * (xi < a ? 1 : 0) + w * (L - xi));
      M.push(-(P * (xi < a ? a - xi : 0) + (w * (L - xi) * (L - xi)) / 2));
    }
  }
  // integrate y'' = M/EI
  const th: number[] = [0], yy: number[] = [0];
  for (let i = 1; i <= n; i++) { th.push(th[i - 1] + (M[i - 1] + M[i]) / 2 / EI * dx); yy.push(yy[i - 1] + (th[i - 1] + th[i]) / 2 * dx); }
  if (kind === 'ss') { const slope = -yy[n] / L; for (let i = 0; i <= n; i++) y.push(yy[i] + slope * x[i]); } else for (let i = 0; i <= n; i++) y.push(yy[i]);
  // y positive downward for loads downward: sagging (M>0) gives y'' > 0 -> y below the chord is negative, so flip sign
  const defl = y.map(q => -q);
  return { x, V, M, defl, R1, R2, Mmax: Math.max(...M.map(Math.abs)), dmax: Math.max(...defl.map(Math.abs)) };
}
const bmV = (v: Record<string, number | string | boolean>) => {
  const b = num(v, 'b') / 1000, h = num(v, 'h') / 1000, I = (b * h ** 3) / 12;
  return { L: num(v, 'L'), P: num(v, 'P') * 1000, a: clamp(num(v, 'a'), 0, num(v, 'L')), w: num(v, 'w') * 1000, EI: num(v, 'E') * 1e9 * I, kind: str(v, 'kind'), I, h };
};
export const beam = defineSim<BmS>({
  id: 'beam_bending', title: 'Beam Bending: Shear Force, Bending Moment & Deflection',
  ...meta(ENG, 'Intermediate', 'Strength of Materials', 'Mechanics of Solids', 'SFD, BMD and elastic curve of beams'),
  covers: ['Shear force diagram', 'Bending moment diagram', 'Beam deflection', 'Flexure formula', 'Euler-Bernoulli beam'],
  tags: ['GATE', 'strength of materials', 'SOM', 'civil', 'mechanical', 'simply supported', 'cantilever', 'section modulus'],
  learningObjectives: ['Draw SFD and BMD for a point load plus UDL and see V = dM/dx.', 'Compute maximum bending stress σ = M·y/I.', 'See how depth h (I ∝ h³) controls deflection.'],
  assumptions: ['Euler-Bernoulli theory: small deflections, linear elastic, shear deformation neglected.', 'Rectangular section; deflection is drawn exaggerated.'],
  blurb: 'Load a beam with a point load and a uniformly distributed load. Shear force, bending moment and the deflected shape are computed by numerical integration of M/EI.',
  hint: 'Simply supported: reactions from equilibrium; V = dM/dx; EI y″ = M. Cantilever has fixed support at left. σmax = Mmax·(h/2)/I. Deflection scales as 1/(E I) and I = bh³/12.',
  params: [
    { kind: 'select', id: 'kind', label: 'Support', value: 'ss', options: [{ value: 'ss', label: 'Simply supported' }, { value: 'cant', label: 'Cantilever (fixed at left)' }] },
    { kind: 'number', id: 'L', label: 'Span L', min: 1, max: 10, step: 0.5, value: 6, unit: 'm', digits: 1 },
    { kind: 'number', id: 'P', label: 'Point load P', min: 0, max: 100, step: 1, value: 20, unit: 'kN', digits: 0 },
    { kind: 'number', id: 'a', label: 'Load position from left', min: 0, max: 10, step: 0.25, value: 2.5, unit: 'm', digits: 2 },
    { kind: 'number', id: 'w', label: 'UDL w', min: 0, max: 30, step: 1, value: 5, unit: 'kN/m', digits: 0 },
    { kind: 'number', id: 'E', label: 'Young modulus E', min: 20, max: 210, step: 5, value: 200, unit: 'GPa', digits: 0 },
    { kind: 'number', id: 'b', label: 'Width b', min: 50, max: 400, step: 10, value: 150, unit: 'mm', digits: 0 },
    { kind: 'number', id: 'h', label: 'Depth h', min: 50, max: 600, step: 10, value: 300, unit: 'mm', digits: 0 },
  ],
  dt: 1 / 30, previewSeconds: 0,
  init() { return { t: 0 }; }, step() { /* static */ },
  draw(c, _s, v, w, hh) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, hh);
    const p = bmV(v), r = beamSolve(p), L = p.L, X0 = 40, X1 = w - 24, mx = (x: number) => X0 + (x / L) * (X1 - X0);
    const by = hh * 0.2;
    // beam + deflection (exaggerated)
    const scale = r.dmax > 0 ? 26 / r.dmax : 0;
    const pts: [number, number][] = r.x.map((x, i) => [mx(x), by + r.defl[i] * scale]);
    c.strokeStyle = 'rgba(148,163,184,0.35)'; c.lineWidth = 6; c.beginPath(); c.moveTo(X0, by); c.lineTo(X1, by); c.stroke();
    polyline(c, pts, C.cyan, 5);
    if (p.kind === 'ss') { for (const x of [X0, X1]) { c.beginPath(); c.moveTo(x, by + 4); c.lineTo(x - 9, by + 20); c.lineTo(x + 9, by + 20); c.closePath(); c.fillStyle = C.amber; c.fill(); } }
    else { c.fillStyle = C.amber; c.fillRect(X0 - 8, by - 22, 8, 44); }
    if (p.P > 0) arrow(c, mx(p.a), by - 40, mx(p.a), by - 6, C.red, 3, 8);
    if (p.w > 0) for (let k = 0; k <= 16; k++) { const x = X0 + (k / 16) * (X1 - X0); arrow(c, x, by - 24, x, by - 8, 'rgba(251,191,36,0.8)', 1.4, 4); }
    text(c, `P = ${num(v, 'P')} kN`, mx(p.a), by - 46, C.red, 10, 'center');
    const H = (hh - hh * 0.33 - 18) / 2, G1 = { x: 6, y: hh * 0.33, w: w - 12, h: H }, G2 = { x: 6, y: hh * 0.33 + H + 10, w: w - 12, h: H };
    const vmax = Math.max(...r.V.map(Math.abs), 1) / 1000, mm = Math.max(r.Mmax, 1) / 1000;
    const g1 = plot(c, G1, [0, L], [-vmax * 1.15, vmax * 1.15], { title: 'Shear force V (kN)', zeroAxis: true, ystep: vmax });
    polyline(c, r.x.map((x, i) => [g1.X(x), g1.Y(r.V[i] / 1000)] as [number, number]), C.green, 2);
    const g2 = plot(c, G2, [0, L], p.kind === 'ss' ? [-mm * 0.15, mm * 1.15] : [-mm * 1.15, mm * 0.15], { title: 'Bending moment M (kN·m)', zeroAxis: true, ystep: mm });
    polyline(c, r.x.map((x, i) => [g2.X(x), g2.Y(r.M[i] / 1000)] as [number, number]), C.amber, 2);
    const imax = r.M.reduce((b, q, i) => (Math.abs(q) > Math.abs(r.M[b]) ? i : b), 0); circle(c, g2.X(r.x[imax]), g2.Y(r.M[imax] / 1000), 4, C.red);
    void TAU;
  },
  readouts(_s, v) {
    const p = bmV(v), r = beamSolve(p), sigma = (r.Mmax * (p.h / 2)) / p.I;
    return [{ label: 'Reaction at left', value: p.kind === 'ss' ? r.R1 / 1000 : (p.P * (p.a < p.L ? 1 : 0) + p.w * p.L) / 1000, unit: 'kN', digits: 2 }, { label: 'Reaction at right', value: p.kind === 'ss' ? r.R2 / 1000 : 0, unit: 'kN', digits: 2 },
      { label: 'Max |M|', value: r.Mmax / 1000, unit: 'kN·m', digits: 2 }, { label: 'Max bending stress', value: sigma / 1e6, unit: 'MPa', digits: 1 }, { label: 'Max deflection', value: r.dmax * 1000, unit: 'mm', digits: 2 }, { label: 'I', value: p.I * 1e12 / 1e6, unit: '×10⁶ mm⁴', digits: 1 }];
  },
  equations(_s, v) {
    const p = bmV(v), r = beamSolve(p);
    return ['\\dfrac{dM}{dx} = V,\\quad EI\\,\\dfrac{d^2y}{dx^2} = M', `\\sigma_{max} = \\dfrac{M_{max}\\,(h/2)}{I} = ${fmt((r.Mmax * (p.h / 2)) / p.I / 1e6, 1)}\\ \\text{MPa}`, `I = \\dfrac{bh^3}{12} = ${fmt(p.I * 1e12, 0)}\\ \\text{mm}^4`];
  },
});

/* ================================================================== */
/*  Mohr's circle                                                      */
/* ================================================================== */
interface MoS { t: number }
function mohr(sx: number, sy: number, txy: number, th: number) {
  const c0 = (sx + sy) / 2, R = Math.hypot((sx - sy) / 2, txy), s1 = c0 + R, s2 = c0 - R, tp = 0.5 * Math.atan2(2 * txy, sx - sy);
  const a = rad(th), sxp = c0 + ((sx - sy) / 2) * Math.cos(2 * a) + txy * Math.sin(2 * a), txp = -((sx - sy) / 2) * Math.sin(2 * a) + txy * Math.cos(2 * a), syp = sx + sy - sxp;
  return { c0, R, s1, s2, tp, sxp, syp, txp };
}
export const mohrCircle = defineSim<MoS>({
  id: 'mohr_circle', title: "Mohr's Circle: Plane Stress Transformation",
  ...meta(ENG, 'Advanced', 'Strength of Materials', 'Mechanics of Solids', 'Principal stresses and maximum shear'),
  covers: ["Mohr's circle", 'Principal stresses', 'Maximum shear stress', 'Plane stress transformation', 'Stress element rotation'],
  tags: ['GATE', 'SOM', 'civil', 'mechanical', 'aerospace', 'principal planes', 'von Mises', 'Tresca'],
  learningObjectives: ['Construct the circle from σx, σy, τxy and read σ₁, σ₂, τmax.', 'See that rotating the element by θ moves the point by 2θ on the circle.', 'Find the principal plane angle.'],
  assumptions: ['Plane stress (σz = 0); tension positive; shear sign: τxy positive clockwise on the x face is plotted downward in the usual textbook sense (Mohr convention).'],
  blurb: 'Enter the stresses on an element and rotate the element. A point travels around Mohr\'s circle at twice the rotation angle, showing the normal and shear stress on any plane.',
  hint: 'Centre (σx+σy)/2, radius √(((σx−σy)/2)²+τxy²). σ1,2 = centre ± R; τmax = R; principal angle tan 2θp = 2τxy/(σx−σy). Transformation: σx′ = centre + ((σx−σy)/2)cos2θ + τxy sin2θ.',
  params: [
    { kind: 'number', id: 'sx', label: 'σx', min: -100, max: 100, step: 1, value: 60, unit: 'MPa', digits: 0 },
    { kind: 'number', id: 'sy', label: 'σy', min: -100, max: 100, step: 1, value: -20, unit: 'MPa', digits: 0 },
    { kind: 'number', id: 'txy', label: 'τxy', min: -80, max: 80, step: 1, value: 40, unit: 'MPa', digits: 0 },
    { kind: 'number', id: 'th', label: 'Element rotation θ', min: -90, max: 90, step: 1, value: 25, unit: '°', digits: 0 },
  ],
  dt: 1 / 30, previewSeconds: 0, init() { return { t: 0 }; }, step() { /* static */ },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const sx = num(v, 'sx'), sy = num(v, 'sy'), txy = num(v, 'txy'), th = num(v, 'th'), m = mohr(sx, sy, txy, th);
    const P = { x: 8, y: 8, w: w * 0.62, h: h - 16 }; const iw = P.w - 42, ih = P.h - 46, kk = Math.min(iw, ih) / (2 * Math.max(m.R * 1.25, 30));
    const mp = plot(c, P, [m.c0 - iw / (2 * kk), m.c0 + iw / (2 * kk)], [-ih / (2 * kk), ih / (2 * kk)], { title: 'Mohr plane: σ (MPa) → , τ ↓', xlabel: 'σ' });
    const span = Math.max(iw, ih) / kk;
    const X = mp.X, Y = (t: number) => mp.Y(-t);
    c.beginPath(); for (let k = 0; k <= 120; k++) { const a = (k / 120) * TAU, px = X(m.c0 + m.R * Math.cos(a)), py = Y(m.R * Math.sin(a)); if (k === 0) c.moveTo(px, py); else c.lineTo(px, py); } c.strokeStyle = C.cyan; c.lineWidth = 2; c.stroke();
    line(c, X(m.c0 - span), Y(0), X(m.c0 + span), Y(0), C.axis, 1);
    const A: [number, number] = [X(sx), Y(txy)], B: [number, number] = [X(sy), Y(-txy)];
    line(c, A[0], A[1], B[0], B[1], 'rgba(148,163,184,0.7)', 1.5, [4, 3]); circle(c, A[0], A[1], 4, C.blue); circle(c, B[0], B[1], 4, C.blue); text(c, 'X', A[0] + 6, A[1] - 4, C.blue, 10); text(c, 'Y', B[0] + 6, B[1] + 12, C.blue, 10);
    const a2 = Math.atan2(txy, (sx - sy) / 2) + rad(2 * th); // rotation by 2θ (clockwise on screen when τ down)
    const Q: [number, number] = [X(m.c0 + m.R * Math.cos(a2)), Y(m.R * Math.sin(a2))], Q2: [number, number] = [X(m.c0 - m.R * Math.cos(a2)), Y(-m.R * Math.sin(a2))];
    line(c, Q[0], Q[1], Q2[0], Q2[1], C.amber, 2); circle(c, Q[0], Q[1], 5.5, C.amber, C.white, 1.5); circle(c, Q2[0], Q2[1], 4, C.amber);
    circle(c, X(m.s1), Y(0), 4, C.green); circle(c, X(m.s2), Y(0), 4, C.green); text(c, 'σ₁', X(m.s1) + 5, Y(0) - 6, C.green, 10); text(c, 'σ₂', X(m.s2) - 18, Y(0) - 6, C.green, 10); circle(c, X(m.c0), Y(0), 3, C.white);
    // element
    const E = { x: P.x + P.w + 8, y: 8, w: w - P.w - 24, h: h - 16 }; panel(c, E); const ex = E.x + E.w / 2, ey = E.y + E.h / 2, sz = Math.min(E.w, E.h) * 0.2;
    c.save(); c.translate(ex, ey); c.rotate(-rad(th)); c.fillStyle = 'rgba(96,165,250,0.25)'; c.fillRect(-sz, -sz, 2 * sz, 2 * sz); c.strokeStyle = C.blue; c.lineWidth = 2; c.strokeRect(-sz, -sz, 2 * sz, 2 * sz);
    const arrowN = (val: number, dir: number) => { if (Math.abs(val) < 1) return; const L2 = clamp(Math.abs(val) / 100, 0.15, 1) * sz * 0.9, sg = val > 0 ? 1 : -1; if (dir === 0) { arrow(c, sz + (sg < 0 ? L2 : 0), 0, sz + (sg > 0 ? L2 : 0), 0, C.red, 2.2, 6); arrow(c, -sz - (sg < 0 ? L2 : 0), 0, -sz - (sg > 0 ? L2 : 0), 0, C.red, 2.2, 6); } else { arrow(c, 0, -sz - (sg < 0 ? L2 : 0), 0, -sz - (sg > 0 ? L2 : 0), C.red, 2.2, 6); arrow(c, 0, sz + (sg < 0 ? L2 : 0), 0, sz + (sg > 0 ? L2 : 0), C.red, 2.2, 6); } };
    arrowN(m.sxp, 0); arrowN(m.syp, 1); c.restore();
    text(c, `θ = ${th}°`, E.x + 8, E.y + 16, C.amber, 11, 'left', 'alphabetic', true); text(c, `σx′ = ${fmt(m.sxp, 1)}  τx′y′ = ${fmt(m.txp, 1)}`, E.x + 8, E.y + E.h - 8, C.text, 10);
  },
  readouts(_s, v) {
    const m = mohr(num(v, 'sx'), num(v, 'sy'), num(v, 'txy'), num(v, 'th'));
    return [{ label: 'σ₁ (max principal)', value: m.s1, unit: 'MPa', digits: 1 }, { label: 'σ₂ (min principal)', value: m.s2, unit: 'MPa', digits: 1 }, { label: 'τmax', value: m.R, unit: 'MPa', digits: 1 }, { label: 'Principal angle θp', value: deg(m.tp), unit: '°', digits: 1 },
      { label: "σx′ at θ", value: m.sxp, unit: 'MPa', digits: 1 }, { label: "τx′y′ at θ", value: m.txp, unit: 'MPa', digits: 1 }, { label: 'von Mises (plane)', value: Math.sqrt(m.s1 * m.s1 - m.s1 * m.s2 + m.s2 * m.s2), unit: 'MPa', digits: 1 }];
  },
  equations(_s, v) {
    const m = mohr(num(v, 'sx'), num(v, 'sy'), num(v, 'txy'), num(v, 'th'));
    return ['\\sigma_{1,2} = \\dfrac{\\sigma_x+\\sigma_y}{2} \\pm \\sqrt{\\left(\\dfrac{\\sigma_x-\\sigma_y}{2}\\right)^2+\\tau_{xy}^2}', `\\sigma_1 = ${fmt(m.s1, 1)},\\ \\sigma_2 = ${fmt(m.s2, 1)},\\ \\tau_{max} = ${fmt(m.R, 1)}\\ \\text{MPa}`, '\\tan 2\\theta_p = \\dfrac{2\\tau_{xy}}{\\sigma_x - \\sigma_y}'];
  },
});

/* ================================================================== */
/*  Four-bar linkage                                                   */
/* ================================================================== */
interface FbS { th: number; trace: [number, number][]; dir: number }
function fourBar(a: number, b: number, c_: number, d: number, th: number, open: number) {
  // ground pivots O2=(0,0), O4=(d,0); crank a at angle th
  const Ax = a * Math.cos(th), Ay = a * Math.sin(th), dx = d - Ax, dy = -Ay, D = Math.hypot(dx, dy);
  if (D > b + c_ || D < Math.abs(b - c_) || D === 0) return null;
  const l = (b * b - c_ * c_ + D * D) / (2 * D), hh = Math.sqrt(Math.max(0, b * b - l * l)), ux = dx / D, uy = dy / D;
  const Bx = Ax + l * ux - open * hh * uy, By = Ay + l * uy + open * hh * ux;
  return { A: [Ax, Ay] as [number, number], B: [Bx, By] as [number, number], D };
}
export const fourbar = defineSim<FbS>({
  id: 'four_bar_linkage', title: 'Four-Bar Linkage: Grashof Condition & Coupler Curve',
  ...meta(ENG, 'Intermediate', 'Theory of Machines', 'Kinematics of Machines', 'Four-bar mechanism, Grashof criterion, coupler curves'),
  covers: ['Four-bar linkage', 'Grashof criterion', 'Crank-rocker', 'Coupler curve', 'Transmission angle'],
  tags: ['GATE', 'TOM', 'KOM', 'mechanical', 'double rocker', 'drag link', 'mechanism synthesis'],
  learningObjectives: ['Apply Grashof: s + l ≤ p + q for continuous rotation.', 'Classify the mechanism as crank-rocker, drag-link or double-rocker.', 'Trace the coupler-point path and read the transmission angle.'],
  assumptions: ['Rigid planar links, frictionless pins, kinematics only (no forces).', 'Linkage is drawn in one assembly mode.'],
  blurb: 'Set the four link lengths. The simulation checks Grashof\'s condition, classifies the linkage and draws the path traced by a point on the coupler as the crank turns.',
  hint: 'Link lengths a (input crank), b (coupler), c (output), d (ground). Grashof: s+l ≤ p+q, where s shortest, l longest. If the shortest link is the crank/ground the crank can rotate fully. Transmission angle is the angle between coupler and output link; keep it between about 40° and 140°.',
  params: [
    { kind: 'number', id: 'a', label: 'Crank a', min: 20, max: 150, step: 1, value: 40, unit: 'mm', digits: 0 },
    { kind: 'number', id: 'b', label: 'Coupler b', min: 40, max: 250, step: 1, value: 120, unit: 'mm', digits: 0 },
    { kind: 'number', id: 'c', label: 'Rocker c', min: 40, max: 250, step: 1, value: 100, unit: 'mm', digits: 0 },
    { kind: 'number', id: 'd', label: 'Ground d', min: 40, max: 250, step: 1, value: 110, unit: 'mm', digits: 0 },
    { kind: 'number', id: 'cp', label: 'Coupler point offset', min: -80, max: 80, step: 1, value: 40, unit: 'mm', digits: 0 },
    { kind: 'number', id: 'rpm', label: 'Crank speed', min: 5, max: 60, step: 1, value: 20, unit: 'rpm', digits: 0 },
  ],
  dt: 1 / 60, previewSeconds: 6,
  init() { return { th: 0.3, trace: [], dir: 1 }; },
  step(s, v, dt) {
    const a = num(v, 'a'), b = num(v, 'b'), c_ = num(v, 'c'), d = num(v, 'd');
    const n = fourBar(a, b, c_, d, s.th + s.dir * dt * (num(v, 'rpm') * TAU / 60), 1);
    if (n) s.th += s.dir * dt * (num(v, 'rpm') * TAU / 60); else { s.dir = -s.dir; s.th += s.dir * dt * (num(v, 'rpm') * TAU / 60) * 2; }
    const f = fourBar(a, b, c_, d, s.th, 1); if (!f) return;
    const dx = f.B[0] - f.A[0], dy = f.B[1] - f.A[1], L = Math.hypot(dx, dy) || 1, off = num(v, 'cp');
    const px = f.A[0] + dx / 2 - (dy / L) * off, py = f.A[1] + dy / 2 + (dx / L) * off; s.trace.push([px, py]); if (s.trace.length > 900) s.trace.shift();
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const a = num(v, 'a'), b = num(v, 'b'), c_ = num(v, 'c'), d = num(v, 'd'), f = fourBar(a, b, c_, d, s.th, 1);
    const ext = a + b + c_ + d, sc = Math.min(w, h * 1.4) / (Math.max(d, b + a, c_ + 40) * 2.2 + 1) * 1.15; void ext;
    const ox = w * 0.5 - (d * sc) / 2, oy = h * 0.62, P = (x: number, y: number): [number, number] => [ox + x * sc, oy - y * sc];
    if (s.trace.length > 1) polyline(c, s.trace.map(([x, y]) => P(x, y)), 'rgba(167,139,250,0.85)', 1.6);
    const O2 = P(0, 0), O4 = P(d, 0); line(c, O2[0], O2[1], O4[0], O4[1], C.dim, 2, [6, 4]);
    for (const q of [O2, O4]) { circle(c, q[0], q[1], 6, C.amber); }
    if (!f) { text(c, 'Linkage cannot assemble at this crank angle (lengths do not close)', w / 2, 24, C.red, 12, 'center'); return; }
    const A = P(...f.A), B = P(...f.B);
    line(c, O2[0], O2[1], A[0], A[1], C.green, 5); line(c, A[0], A[1], B[0], B[1], C.cyan, 5); line(c, B[0], B[1], O4[0], O4[1], C.pink, 5);
    for (const q of [A, B]) circle(c, q[0], q[1], 5, C.white);
    const last = s.trace[s.trace.length - 1]; if (last) { const q = P(...last); circle(c, q[0], q[1], 5, C.purple, C.white, 1.5); }
    const tr = Math.acos(clamp(((b * b + c_ * c_ - f.D * f.D) / (2 * b * c_)), -1, 1)); text(c, `transmission angle ${fmt(deg(tr), 0)}°`, 10, 20, deg(tr) < 40 || deg(tr) > 140 ? C.red : C.green, 12);
  },
  readouts(s, v) {
    const a = num(v, 'a'), b = num(v, 'b'), c_ = num(v, 'c'), d = num(v, 'd'), ls = [a, b, c_, d].sort((x, y) => x - y), grash = ls[0] + ls[3] <= ls[1] + ls[2];
    let type = 'Non-Grashof: triple-rocker (no link rotates fully)'; if (grash) { const sh = [a, b, c_, d].indexOf(ls[0]); type = sh === 0 ? 'Grashof: crank-rocker' : sh === 3 ? 'Grashof: drag-link (double crank)' : sh === 2 ? 'Grashof: rocker-crank' : 'Grashof: double-rocker (coupler shortest)'; }
    const f = fourBar(a, b, c_, d, s.th, 1);
    return [{ label: 'Class', value: type }, { label: 's + l', value: ls[0] + ls[3], unit: 'mm', digits: 0 }, { label: 'p + q', value: ls[1] + ls[2], unit: 'mm', digits: 0 }, { label: 'Crank angle', value: ((deg(s.th) % 360) + 360) % 360, unit: '°', digits: 0 },
      { label: 'Transmission angle', value: f ? deg(Math.acos(clamp((b * b + c_ * c_ - f.D * f.D) / (2 * b * c_), -1, 1))) : 'cannot assemble', unit: f ? '°' : '', digits: 0 }];
  },
  equations(_s, v) { const ls = [num(v, 'a'), num(v, 'b'), num(v, 'c'), num(v, 'd')].sort((x, y) => x - y); return ['s + l \\le p + q \\;\\Rightarrow\\; \\text{Grashof}', `${ls[0]} + ${ls[3]} = ${ls[0] + ls[3]} \\ \\text{vs}\\ ${ls[1]} + ${ls[2]} = ${ls[1] + ls[2]}`]; },
});

/* ================================================================== */
/*  Forced damped vibration                                            */
/* ================================================================== */
interface VbS { t: number; x: number; v: number; hist: [number, number][] }
export const vibration = defineSim<VbS>({
  id: 'forced_vibration', title: 'Forced Damped Vibration: Resonance & Magnification Factor',
  ...meta(ENG, 'Intermediate', 'Mechanical Vibrations', 'Vibrations', 'Single-degree-of-freedom forced response'),
  covers: ['Forced vibration', 'Resonance', 'Damping ratio', 'Magnification factor', 'Phase lag', 'Transient and steady-state response'],
  tags: ['GATE', 'mechanical', 'civil', 'aerospace', 'transmissibility', 'natural frequency', 'seismic', 'bridge'],
  learningObjectives: ['Find the natural frequency ωn = √(k/m) and damping ratio ζ.', 'See the amplitude peak near r = ω/ωn = 1, lower for larger ζ.', 'Observe the phase moving from 0° to 180° through resonance.'],
  assumptions: ['Linear SDOF mass-spring-damper with sinusoidal force F₀ sin ωt.'],
  blurb: 'A mass on a spring and damper is driven by a sinusoidal force. The time response shows the start-up transient dying out; the frequency-response curve shows the resonance peak for your damping.',
  hint: 'm x″ + c x′ + k x = F0 sin ωt. ωn=√(k/m), ζ=c/(2√(km)). Steady amplitude X = (F0/k)/√((1−r²)²+(2ζr)²), phase φ = atan2(2ζr, 1−r²). Peak ≈ 1/(2ζ) near r=1.',
  params: [
    { kind: 'number', id: 'm', label: 'Mass m', min: 0.5, max: 20, step: 0.5, value: 2, unit: 'kg', digits: 1, resetOnChange: true },
    { kind: 'number', id: 'k', label: 'Stiffness k', min: 50, max: 2000, step: 10, value: 500, unit: 'N/m', digits: 0 },
    { kind: 'number', id: 'zeta', label: 'Damping ratio ζ', min: 0.01, max: 1.5, step: 0.01, value: 0.1, digits: 2 },
    { kind: 'number', id: 'r', label: 'Frequency ratio r = ω/ωn', min: 0.1, max: 3, step: 0.01, value: 0.9, digits: 2 },
    { kind: 'number', id: 'F0', label: 'Force amplitude F₀', min: 1, max: 50, step: 1, value: 10, unit: 'N', digits: 0 },
  ],
  dt: 1 / 480, previewSeconds: 6,
  init() { return { t: 0, x: 0, v: 0, hist: [] }; },
  step(s, v, dt) {
    const m = num(v, 'm'), k = num(v, 'k'), z = num(v, 'zeta'), wn = Math.sqrt(k / m), cc = 2 * z * Math.sqrt(k * m), w = num(v, 'r') * wn, F = num(v, 'F0');
    const acc = (t: number, x: number, vv: number) => (F * Math.sin(w * t) - cc * vv - k * x) / m;
    const k1v = acc(s.t, s.x, s.v), k1x = s.v, k2v = acc(s.t + dt / 2, s.x + k1x * dt / 2, s.v + k1v * dt / 2), k2x = s.v + k1v * dt / 2, k3v = acc(s.t + dt / 2, s.x + k2x * dt / 2, s.v + k2v * dt / 2), k3x = s.v + k2v * dt / 2, k4v = acc(s.t + dt, s.x + k3x * dt, s.v + k3v * dt), k4x = s.v + k3v * dt;
    s.x += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x); s.v += (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v); s.t += dt;
    if (Math.round(s.t / dt) % 8 === 0) { s.hist.push([s.t, s.x]); if (s.hist.length > 800) s.hist.shift(); }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const m = num(v, 'm'), k = num(v, 'k'), z = num(v, 'zeta'), wn = Math.sqrt(k / m), F = num(v, 'F0'), xs = F / k;
    const A = { x: 8, y: 8, w: w * 0.55, h: h * 0.55 }; const t0 = s.hist.length ? s.hist[0][0] : 0, t1 = Math.max(s.t, t0 + 4);
    const mp = plot(c, A, [t0, t1], [-xs * 12, xs * 12], { title: 'Displacement x(t) (m)', zeroAxis: true, xlabel: 'time (s)', ystep: xs * 6 });
    polyline(c, s.hist.map(([t, x]) => [mp.X(t), mp.Y(clamp(x, -xs * 12, xs * 12))] as [number, number]), C.cyan, 1.8);
    const Bx = { x: A.x + A.w + 8, y: 8, w: w - A.w - 24, h: h * 0.55 }; const rr: [number, number] = [0, 3];
    const MF = (r: number, zz: number) => 1 / Math.sqrt((1 - r * r) ** 2 + (2 * zz * r) ** 2);
    const mf = plot(c, Bx, rr, [0, Math.min(10, Math.max(3, MF(1, Math.max(z, 0.1)) * 1.2))], { title: 'Magnification vs r', xlabel: 'r = ω/ωn' });
    for (const zz of [0.05, 0.2, 0.5, 1]) { const q: [number, number][] = []; for (let r = 0.02; r <= 3; r += 0.03) q.push([mf.X(r), mf.Y(MF(r, zz))]); polyline(c, q, 'rgba(148,163,184,0.4)', 1); }
    const q: [number, number][] = []; for (let r = 0.02; r <= 3; r += 0.03) q.push([mf.X(r), mf.Y(Math.min(MF(r, z), 10))]); polyline(c, q, C.amber, 2.2); const rcur = num(v, 'r'); circle(c, mf.X(rcur), mf.Y(Math.min(MF(rcur, z), 10)), 5, C.red, C.white, 1.5);
    // mass spring animation
    const D = { x: 8, y: h * 0.55 + 16, w: w - 16, h: h * 0.45 - 24 }; panel(c, D); const cy = D.y + D.h / 2, x0 = D.x + 60, pos = D.x + D.w * 0.55 + clamp(s.x / (xs * 12), -1, 1) * D.w * 0.3;
    line(c, D.x + 20, cy - 30, D.x + 20, cy + 30, C.axis, 4); polyline(c, Array.from({ length: 41 }, (_, i) => [x0 + ((pos - 20 - x0) * i) / 40, cy + (i % 2 ? -8 : 8) * (i === 0 || i === 40 ? 0 : 1)] as [number, number]), C.cyan, 2);
    c.fillStyle = C.blue; c.fillRect(pos - 20, cy - 20, 40, 40); text(c, `${m} kg`, pos, cy + 4, C.white, 10, 'center'); arrow(c, pos + 28, cy, pos + 28 + clamp(F * Math.sin(num(v, 'r') * wn * s.t) * 1.2, -40, 40), cy, C.red, 2.5, 7);
    text(c, `ωn = ${fmt(wn, 2)} rad/s`, D.x + 8, D.y + 16, C.dim, 10);
  },
  readouts(_s, v) {
    const m = num(v, 'm'), k = num(v, 'k'), z = num(v, 'zeta'), r = num(v, 'r'), wn = Math.sqrt(k / m), mf = 1 / Math.sqrt((1 - r * r) ** 2 + (2 * z * r) ** 2);
    return [{ label: 'Natural frequency ωn', value: wn, unit: 'rad/s', digits: 2 }, { label: 'fn', value: wn / TAU, unit: 'Hz', digits: 2 }, { label: 'Drive frequency ω', value: r * wn, unit: 'rad/s', digits: 2 }, { label: 'Magnification factor', value: mf, digits: 2 },
      { label: 'Steady amplitude', value: mf * num(v, 'F0') / k * 1000, unit: 'mm', digits: 2 }, { label: 'Phase lag', value: deg(Math.atan2(2 * z * r, 1 - r * r)), unit: '°', digits: 0 }, { label: 'Damping c', value: 2 * z * Math.sqrt(k * m), unit: 'N·s/m', digits: 2 }];
  },
  equations(_s, v) { const z = num(v, 'zeta'), r = num(v, 'r'); return ['m\\ddot{x} + c\\dot{x} + kx = F_0 \\sin\\omega t', `\\dfrac{X}{F_0/k} = \\dfrac{1}{\\sqrt{(1-r^2)^2 + (2\\zeta r)^2}} = ${fmt(1 / Math.sqrt((1 - r * r) ** 2 + (2 * z * r) ** 2), 2)}`]; },
});

/* ================================================================== */
/*  1-D transient heat conduction                                      */
/* ================================================================== */
const MATS: Record<string, { n: string; a: number }> = { cu: { n: 'Copper', a: 1.11e-4 }, al: { n: 'Aluminium', a: 9.7e-5 }, st: { n: 'Steel', a: 1.2e-5 }, gl: { n: 'Glass', a: 3.4e-7 }, wd: { n: 'Wood', a: 1.8e-7 } };
interface HtS { T: number[]; t: number }
const NH = 60;
export const heat1d = defineSim<HtS>({
  id: 'heat_conduction_1d', title: 'Transient Heat Conduction in a Slab (Fourier Number)',
  ...meta(ENG, 'Intermediate', 'Heat Transfer', 'Heat Transfer', 'Unsteady 1-D conduction, thermal diffusivity, Fourier number'),
  covers: ['Transient conduction', 'Thermal diffusivity', 'Fourier number', 'Heat equation', 'Boundary conditions'],
  tags: ['GATE', 'mechanical', 'chemical', 'civil', 'finite difference', 'Biot number', 'semi-infinite', 'time constant'],
  learningObjectives: ['See heat diffuse as ∂T/∂t = α ∂²T/∂x².', 'Relate time to the Fourier number Fo = αt/L².', 'Compare materials: α sets how fast the interior responds.'],
  assumptions: ['1-D slab, constant properties, no heat generation, explicit finite-difference solution.', 'Left face held at hot temperature; right face either insulated or held cold.'],
  blurb: 'A slab starts uniform. One face is suddenly heated. The temperature profile evolves by solving the heat equation, with the Fourier number telling you how far diffusion has reached.',
  hint: 'Heat equation ∂T/∂t = α ∂²T/∂x². Fo = αt/L². The profile is nearly steady for Fo ≳ 0.5. Explicit scheme is stable for α·Δt/Δx² ≤ 0.5.',
  params: [
    { kind: 'select', id: 'mat', label: 'Material', value: 'st', options: Object.entries(MATS).map(([k, m]) => ({ value: k, label: `${m.n} (α = ${m.a.toExponential(1)} m²/s)` })), resetOnChange: true },
    { kind: 'number', id: 'L', label: 'Thickness L', min: 0.01, max: 0.5, step: 0.01, value: 0.1, unit: 'm', digits: 2 },
    { kind: 'number', id: 'Th', label: 'Hot face temperature', min: 50, max: 500, step: 10, value: 200, unit: '°C', digits: 0, resetOnChange: true },
    { kind: 'number', id: 'T0', label: 'Initial temperature', min: 0, max: 50, step: 1, value: 20, unit: '°C', digits: 0, resetOnChange: true },
    { kind: 'select', id: 'bc', label: 'Right face', value: 'ins', options: [{ value: 'ins', label: 'Insulated' }, { value: 'cold', label: 'Held at initial T' }] },
    { kind: 'number', id: 'speed', label: 'Time speed-up', min: 1, max: 2000, step: 1, value: 200, digits: 0 },
  ],
  actions: [{ id: 'restart', label: 'Restart' }],
  dt: 1 / 60, previewSeconds: 4,
  init(v) { return { T: Array.from({ length: NH + 1 }, (_, i) => (i === 0 ? num(v, 'Th') : num(v, 'T0'))), t: 0 }; },
  step(s, v, dt) {
    const a = MATS[str(v, 'mat')].a, L = num(v, 'L'), dx = L / NH, sim = dt * num(v, 'speed'), dts = 0.4 * dx * dx / a; let rem = sim;
    while (rem > 1e-12) { const h = Math.min(rem, dts), r = (a * h) / (dx * dx), T = s.T, n = T.slice();
      for (let i = 1; i < NH; i++) n[i] = T[i] + r * (T[i - 1] - 2 * T[i] + T[i + 1]);
      n[0] = num(v, 'Th'); n[NH] = str(v, 'bc') === 'ins' ? n[NH - 1] : num(v, 'T0'); s.T = n; rem -= h; s.t += h; }
  },
  action(s, v, id) { if (id === 'restart') { s.T = Array.from({ length: NH + 1 }, (_, i) => (i === 0 ? num(v, 'Th') : num(v, 'T0'))); s.t = 0; } },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const Th = num(v, 'Th'), T0 = num(v, 'T0'), L = num(v, 'L');
    const slab = { x: 14, y: 14, w: w - 28, h: h * 0.2 };
    for (let i = 0; i < NH; i++) { const f = clamp((s.T[i] - T0) / Math.max(Th - T0, 1), 0, 1); c.fillStyle = `hsl(${240 - 240 * f},85%,${35 + 20 * f}%)`; c.fillRect(slab.x + (i / NH) * slab.w, slab.y, slab.w / NH + 1, slab.h); }
    c.strokeStyle = C.axis; c.lineWidth = 1.5; c.strokeRect(slab.x, slab.y, slab.w, slab.h); text(c, 'hot face', slab.x + 4, slab.y + slab.h + 12, C.red, 10); text(c, str(v, 'bc') === 'ins' ? 'insulated' : 'cold face', slab.x + slab.w - 4, slab.y + slab.h + 12, C.dim, 10, 'right');
    const P = { x: 8, y: slab.y + slab.h + 22, w: w - 16, h: h - slab.y - slab.h - 30 }; const mp = plot(c, P, [0, L * 100], [T0 - 5, Th + 10], { title: `Temperature profile  (t = ${fmt(s.t, s.t < 100 ? 1 : 0)} s)`, xlabel: 'distance x (cm)' });
    polyline(c, s.T.map((T, i) => [mp.X((i / NH) * L * 100), mp.Y(T)] as [number, number]), C.amber, 2.4);
    const Fo = (MATS[str(v, 'mat')].a * s.t) / (L * L); const lx = mp.X(Math.min(Math.sqrt(4 * MATS[str(v, 'mat')].a * s.t) * 100, L * 100)); line(c, lx, mp.Y(T0 - 5), lx, mp.Y(Th + 10), 'rgba(34,211,238,0.6)', 1, [4, 3]); text(c, 'penetration √(4αt)', lx + 3, mp.Y(Th * 0.2 + T0 * 0.8), C.cyan, 9);
    text(c, `Fo = ${fmt(Fo, 3)}`, P.x + P.w - 10, P.y + 14, C.text, 11, 'right', 'alphabetic', true);
  },
  readouts(s, v) { const a = MATS[str(v, 'mat')].a, L = num(v, 'L'); return [{ label: 'Elapsed time', value: s.t, unit: 's', digits: 1 }, { label: 'Fourier number', value: (a * s.t) / (L * L), digits: 3 }, { label: 'Diffusivity α', value: a, unit: 'm²/s', digits: 2 }, { label: 'Midplane T', value: s.T[NH / 2], unit: '°C', digits: 1 }, { label: 'Characteristic time L²/α', value: (L * L) / a, unit: 's', digits: 0 }]; },
  equations(s, v) { const a = MATS[str(v, 'mat')].a, L = num(v, 'L'); return ['\\dfrac{\\partial T}{\\partial t} = \\alpha\\,\\dfrac{\\partial^2 T}{\\partial x^2}', `Fo = \\dfrac{\\alpha t}{L^2} = ${fmt((a * s.t) / (L * L), 3)}`]; },
});

/* ================================================================== */
/*  Thermodynamic cycles                                               */
/* ================================================================== */
interface CyS { t: number }
const Rg = 287, cv = 718, cp = 1005, gam = cp / cv;
function cyclePts(kind: string, r: number, Q: number) {
  // per kg of air, state points as arrays of [v, P] along each process
  const T1 = 300, P1 = 100e3; const path: [number, number][] = []; const add = (v: number, T: number) => path.push([v, (Rg * T) / v]);
  let eta = 0, Qin = Q, Qout = 0, wnet = 0;
  if (kind === 'brayton') {
    const T2 = T1 * r ** ((gam - 1) / gam), T3 = T2 + Q / cp, T4 = T3 / r ** ((gam - 1) / gam); const Pr = r * P1;
    const P2 = Pr; for (let i = 0; i <= 40; i++) { const T = T1 * (T2 / T1) ** (i / 40); path.push([(Rg * T) / (P1 * (T / T1) ** (gam / (gam - 1))), P1 * (T / T1) ** (gam / (gam - 1))]); }
    for (let i = 1; i <= 20; i++) { const T = T2 + ((T3 - T2) * i) / 20; path.push([(Rg * T) / P2, P2]); }
    for (let i = 1; i <= 40; i++) { const T = T3 * (T4 / T3) ** (i / 40); const P = P2 * (T / T3) ** (gam / (gam - 1)); path.push([(Rg * T) / P, P]); }
    for (let i = 1; i <= 20; i++) { const T = T4 + ((T1 - T4) * i) / 20; path.push([(Rg * T) / P1, P1]); }
    Qout = cp * (T4 - T1); wnet = Q - Qout; eta = wnet / Q; return { path, eta, Qin, Qout, wnet, Tmax: T3, label: ['1', '2', '3', '4'] };
  }
  const v1 = (Rg * T1) / P1, v2 = v1 / r; const T2 = T1 * r ** (gam - 1);
  for (let i = 0; i <= 40; i++) { const v = v1 + ((v2 - v1) * i) / 40; add(v, T1 * (v1 / v) ** (gam - 1)); }
  let T3: number, v3: number;
  if (kind === 'otto') { T3 = T2 + Q / cv; v3 = v2; for (let i = 1; i <= 20; i++) { const T = T2 + ((T3 - T2) * i) / 20; add(v2, T); } }
  else { T3 = T2 + Q / cp; v3 = v2 * (T3 / T2); for (let i = 1; i <= 20; i++) { const T = T2 + ((T3 - T2) * i) / 20; add((v2 * T) / T2, T); } }
  for (let i = 1; i <= 40; i++) { const v = v3 + ((v1 - v3) * i) / 40; add(v, T3 * (v3 / v) ** (gam - 1)); }
  const T4 = T3 * (v3 / v1) ** (gam - 1); for (let i = 1; i <= 20; i++) { const T = T4 + ((T1 - T4) * i) / 20; add(v1, T); }
  Qout = cv * (T4 - T1); wnet = Q - Qout; eta = wnet / Q; return { path, eta, Qin, Qout, wnet, Tmax: T3, label: ['1', '2', '3', '4'] };
}
export const thermoCycle = defineSim<CyS>({
  id: 'thermo_cycles', title: 'Air-Standard Cycles: Otto, Diesel & Brayton on the P-v Diagram',
  ...meta(ENG, 'Intermediate', 'Thermodynamics', 'Thermodynamics', 'Air-standard power cycles, efficiency and net work'),
  covers: ['Otto cycle', 'Diesel cycle', 'Brayton cycle', 'Thermal efficiency', 'P-v diagram', 'Compression ratio'],
  tags: ['GATE', 'mechanical', 'IC engine', 'gas turbine', 'air standard', 'net work', 'heat rejection'],
  learningObjectives: ['Trace each process on the P-v diagram and see net work as the enclosed area.', 'Compare how compression/pressure ratio changes efficiency.', 'Explain why Otto efficiency η = 1 − r^(1−γ) depends only on r.'],
  assumptions: ['Cold-air-standard cycle: ideal gas, cv = 718, cp = 1005 J/kg·K, reversible processes, heat addition replaces combustion.'],
  blurb: 'Pick a cycle, a compression ratio and the heat added per kg of air. The P-v loop is computed process by process and the efficiency is compared with the ideal formula.',
  hint: 'Otto: 1-2 isentropic compression, 2-3 heat at constant v, 3-4 isentropic expansion, 4-1 heat rejected at constant v: η=1−r^{1−γ}. Diesel: heat at constant P (cut-off ratio). Brayton: pressure ratio rp, η=1−rp^{(1−γ)/γ}.',
  params: [
    { kind: 'select', id: 'kind', label: 'Cycle', value: 'otto', options: [{ value: 'otto', label: 'Otto (petrol)' }, { value: 'diesel', label: 'Diesel' }, { value: 'brayton', label: 'Brayton (gas turbine)' }] },
    { kind: 'number', id: 'r', label: 'Compression / pressure ratio', min: 3, max: 25, step: 0.5, value: 9, digits: 1 },
    { kind: 'number', id: 'Q', label: 'Heat added', min: 300, max: 2000, step: 50, value: 1000, unit: 'kJ/kg', digits: 0 },
  ],
  dt: 1 / 60, previewSeconds: 2, init() { return { t: 0 }; }, step(s, _v, dt) { s.t += dt; },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const kind = str(v, 'kind'), cyc = cyclePts(kind, num(v, 'r'), num(v, 'Q') * 1000);
    const vs = cyc.path.map(q => q[0]), ps = cyc.path.map(q => q[1] / 1e5), P = { x: 8, y: 8, w: w * 0.68, h: h - 16 };
    const mp = plot(c, P, [0, Math.max(...vs) * 1.08], [0, Math.max(...ps) * 1.1], { title: 'P–v diagram', xlabel: 'specific volume v (m³/kg)' });
    c.beginPath(); cyc.path.forEach(([x, y], i) => { const px = mp.X(x), py = mp.Y(y / 1e5); if (i === 0) c.moveTo(px, py); else c.lineTo(px, py); }); c.closePath(); c.fillStyle = 'rgba(34,211,238,0.16)'; c.fill();
    polyline(c, cyc.path.map(([x, y]) => [mp.X(x), mp.Y(y / 1e5)] as [number, number]), C.cyan, 2.4);
    const n = cyc.path.length, idx = Math.floor((s.t * 0.25 % 1) * n), q = cyc.path[idx]; circle(c, mp.X(q[0]), mp.Y(q[1] / 1e5), 6, C.amber, C.white, 1.5);
    const marks = kind === 'brayton' ? [0, 40, 60, 100] : [0, 40, 60, 100]; marks.forEach((i, k) => { const p = cyc.path[Math.min(i, n - 1)]; text(c, String(k + 1), mp.X(p[0]) + 6, mp.Y(p[1] / 1e5) - 6, C.text, 12, 'left', 'alphabetic', true); });
    const B = { x: P.x + P.w + 8, y: 8, w: w - P.w - 24, h: h - 16 }; panel(c, B);
    const items: [string, string, string][] = [['Qin', `${fmt(cyc.Qin / 1000, 0)} kJ/kg`, C.red], ['Qout', `${fmt(cyc.Qout / 1000, 0)} kJ/kg`, C.blue], ['Wnet', `${fmt(cyc.wnet / 1000, 0)} kJ/kg`, C.green], ['η', `${fmt(cyc.eta * 100, 1)} %`, C.amber]];
    items.forEach(([a, b, col], i) => { text(c, a, B.x + 10, B.y + 28 + i * 40, C.dim, 11); text(c, b, B.x + 10, B.y + 46 + i * 40, col, 14, 'left', 'alphabetic', true); });
  },
  readouts(_s, v) {
    const kind = str(v, 'kind'), r = num(v, 'r'), cyc = cyclePts(kind, r, num(v, 'Q') * 1000), ideal = kind === 'otto' ? 1 - r ** (1 - gam) : kind === 'brayton' ? 1 - r ** ((1 - gam) / gam) : null;
    return [{ label: 'Heat in', value: cyc.Qin / 1000, unit: 'kJ/kg', digits: 0 }, { label: 'Heat rejected', value: cyc.Qout / 1000, unit: 'kJ/kg', digits: 0 }, { label: 'Net work', value: cyc.wnet / 1000, unit: 'kJ/kg', digits: 0 }, { label: 'Efficiency', value: cyc.eta * 100, unit: '%', digits: 1 },
      { label: 'Formula (Otto/Brayton)', value: ideal === null ? 'depends on cut-off ratio' : `${fmt(ideal * 100, 1)} %` }, { label: 'Peak temperature', value: cyc.Tmax, unit: 'K', digits: 0 }];
  },
  equations(_s, v) { const k = str(v, 'kind'), r = num(v, 'r'); return k === 'otto' ? [`\\eta_{Otto} = 1 - r^{1-\\gamma} = ${fmt((1 - r ** (1 - gam)) * 100, 1)}\\%`, '\\gamma = c_p/c_v = 1.4'] : k === 'brayton' ? [`\\eta_{Brayton} = 1 - r_p^{(\\gamma-1)/\\gamma} = ${fmt((1 - r ** ((1 - gam) / gam)) * 100, 1)}\\%`] : ['\\eta_{Diesel} = 1 - \\dfrac{1}{r^{\\gamma-1}}\\dfrac{r_c^{\\gamma}-1}{\\gamma(r_c - 1)}']; },
});

/* ================================================================== */
/*  Pipe flow                                                          */
/* ================================================================== */
const FLUIDS: Record<string, { n: string; rho: number; mu: number }> = { water: { n: 'Water 20 °C', rho: 998, mu: 1.0e-3 }, air: { n: 'Air 20 °C', rho: 1.2, mu: 1.8e-5 }, oil: { n: 'SAE 30 oil', rho: 890, mu: 0.29 }, gly: { n: 'Glycerin', rho: 1260, mu: 1.4 } };
interface PfS { t: number; ps: { x: number; y: number }[] }
export const pipeflow = defineSim<PfS>({
  id: 'pipe_flow_reynolds', title: 'Pipe Flow: Reynolds Number, Velocity Profile & Pressure Drop',
  ...meta(ENG, 'Intermediate', 'Fluid Mechanics', 'Fluid Mechanics', 'Laminar vs turbulent flow in pipes, Darcy-Weisbach'),
  covers: ['Reynolds number', 'Laminar flow', 'Turbulent flow', 'Velocity profile in pipe', 'Darcy friction factor', 'Pressure drop'],
  tags: ['GATE', 'civil', 'mechanical', 'chemical', 'Hagen-Poiseuille', 'Blasius', 'head loss', 'Moody'],
  learningObjectives: ['Compute Re = ρvD/μ and classify the flow (laminar < 2300).', 'Compare the parabolic laminar profile with the flatter turbulent profile.', 'Use f = 64/Re or the Blasius relation to find the pressure drop.'],
  assumptions: ['Fully developed flow in a smooth circular pipe; turbulent profile u/umax = (1−r/R)^{1/7}; Blasius f = 0.316 Re^{−1/4} for 4000 < Re < 10⁵.', 'Transitional zone (2300-4000) shown with an interpolated friction factor.'],
  blurb: 'Choose a fluid, pipe diameter and mean velocity. Re decides whether the profile is the parabola of laminar flow or the flat profile of turbulent flow, and the pressure drop follows.',
  hint: 'Re = ρ V D/μ. Laminar (Re<2300): parabolic profile, f=64/Re, Δp = 32 μ L V / D². Turbulent: flatter profile, Blasius f≈0.316Re^-0.25. Δp = f (L/D) ρV²/2.',
  params: [
    { kind: 'select', id: 'fluid', label: 'Fluid', value: 'water', options: Object.entries(FLUIDS).map(([k, f]) => ({ value: k, label: f.n })) },
    { kind: 'number', id: 'D', label: 'Pipe diameter D', min: 5, max: 300, step: 1, value: 50, unit: 'mm', digits: 0 },
    { kind: 'number', id: 'V', label: 'Mean velocity V', min: 0.001, max: 10, step: 0.001, value: 0.5, unit: 'm/s', digits: 3 },
    { kind: 'number', id: 'Lp', label: 'Pipe length', min: 1, max: 200, step: 1, value: 20, unit: 'm', digits: 0 },
  ],
  dt: 1 / 60, previewSeconds: 3,
  init() { return { t: 0, ps: Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 2 - 1 })) }; },
  step(s, v, dt) {
    const f = FLUIDS[str(v, 'fluid')], D = num(v, 'D') / 1000, V = num(v, 'V'), Re = (f.rho * V * D) / f.mu, turb = Re > 3000;
    for (const p of s.ps) { const u = turb ? 1.22 * V * (1 - Math.abs(p.y)) ** (1 / 7) : 2 * V * (1 - p.y * p.y); p.x += (u / Math.max(V, 1e-6)) * dt * 0.35; if (turb) p.y = clamp(p.y + (Math.random() - 0.5) * 0.08, -0.98, 0.98); if (p.x > 1) { p.x = 0; p.y = Math.random() * 1.9 - 0.95; } }
    s.t += dt;
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const f = FLUIDS[str(v, 'fluid')], D = num(v, 'D') / 1000, V = num(v, 'V'), Re = (f.rho * V * D) / f.mu, turb = Re > 3000;
    const px = 14, pw = w * 0.62, py = 30, ph = h * 0.5, cy = py + ph / 2; c.fillStyle = 'rgba(96,165,250,0.12)'; c.fillRect(px, py, pw, ph); c.strokeStyle = C.axis; c.lineWidth = 3; line(c, px, py, px + pw, py, C.axis, 3); line(c, px, py + ph, px + pw, py + ph, C.axis, 3);
    for (const p of s.ps) circle(c, px + p.x * pw, cy + p.y * (ph / 2), 2.2, turb ? C.orange : C.cyan);
    // profile at right of pipe
    const gx = px + pw + 10; const pts: [number, number][] = []; for (let i = -50; i <= 50; i++) { const y = i / 50, u = turb ? 1.22 * (1 - Math.abs(y)) ** (1 / 7) : 2 * (1 - y * y); pts.push([gx + (u / 2.3) * (w - gx - 12), cy + y * (ph / 2)]); }
    polyline(c, pts, C.green, 2.4); line(c, gx, py, gx, py + ph, C.axis, 1); text(c, 'u(r)', gx + 4, py - 6, C.green, 10);
    text(c, turb ? 'TURBULENT (flat profile, eddies)' : Re > 2300 ? 'TRANSITIONAL' : 'LAMINAR (parabolic profile)', px, 20, turb ? C.orange : C.cyan, 12, 'left', 'alphabetic', true);
    // Re gauge
    const gy = py + ph + 40, gw = w - 28; panel(c, { x: 14, y: gy - 16, w: gw, h: 58 }); const rm = 10000, X = (r: number) => 22 + clamp(r / rm, 0, 1) * (gw - 16);
    c.fillStyle = 'rgba(34,211,238,0.35)'; c.fillRect(22, gy, X(2300) - 22, 12); c.fillStyle = 'rgba(251,191,36,0.35)'; c.fillRect(X(2300), gy, X(4000) - X(2300), 12); c.fillStyle = 'rgba(251,146,60,0.35)'; c.fillRect(X(4000), gy, 22 + gw - 16 - X(4000), 12);
    circle(c, X(Re), gy + 6, 7, C.white, C.red, 2); text(c, `Re = ${Re < 100 ? fmt(Re, 1) : fmt(Re, 0)}`, X(Re), gy - 4, C.white, 11, 'center', 'alphabetic', true); text(c, '2300', X(2300), gy + 26, C.dim, 9, 'center'); text(c, '4000', X(4000), gy + 26, C.dim, 9, 'center');
  },
  readouts(_s, v) {
    const f = FLUIDS[str(v, 'fluid')], D = num(v, 'D') / 1000, V = num(v, 'V'), L = num(v, 'Lp'), Re = (f.rho * V * D) / f.mu;
    const fr = Re < 2300 ? 64 / Re : Re < 4000 ? 64 / 2300 + ((0.316 * 4000 ** -0.25 - 64 / 2300) * (Re - 2300)) / 1700 : 0.316 * Re ** -0.25, dp = fr * (L / D) * (f.rho * V * V) / 2;
    return [{ label: 'Reynolds number', value: Re, digits: 0 }, { label: 'Regime', value: Re < 2300 ? 'laminar' : Re < 4000 ? 'transitional' : 'turbulent' }, { label: 'Darcy friction factor f', value: fr, digits: 4 }, { label: 'Pressure drop Δp', value: dp / 1000, unit: 'kPa', digits: 3 },
      { label: 'Head loss', value: dp / (f.rho * 9.81), unit: 'm of fluid', digits: 3 }, { label: 'Flow rate', value: (Math.PI / 4) * D * D * V * 1000, unit: 'L/s', digits: 3 }, { label: 'Max/mean velocity', value: Re < 2300 ? 2 : 1.22, digits: 2 }];
  },
  equations(_s, v) { const f = FLUIDS[str(v, 'fluid')], Re = (f.rho * num(v, 'V') * num(v, 'D') / 1000) / f.mu; return ['Re = \\dfrac{\\rho V D}{\\mu}', `Re = ${fmt(Re, 0)}`, '\\Delta p = f\\,\\dfrac{L}{D}\\,\\dfrac{\\rho V^2}{2}']; },
});

export const UG_MECH_SIMS = [beam, mohrCircle, fourbar, vibration, heat1d, thermoCycle, pipeflow];
void bool;
