/* ================================================================== */
/*  Undergraduate engineering mathematics simulations (B.Sc / B.Tech) */
/*  Export: UG_MATH_SIMS                                              */
/* ================================================================== */
import { defineSim, num, str, bool } from './types';
import type { AnySim, EducationLevel, Values } from './types';
import {
  C, TAU, arrow, circle, clamp, deg, drawScope, fitView, fmt, hsl, line, panel, plot, polyline, rad, Scope, text,
} from './draw';
import type { Ctx, Rect } from './draw';

const BT: EducationLevel[] = ['B.Tech'];
const BSBT: EducationLevel[] = ['B.Sc', 'B.Tech'];
const BSBTMS: EducationLevel[] = ['B.Sc', 'B.Tech', 'M.Sc'];

const R2 = (n: number, d = 2) => fmt(n, d);
const wide = (w: number) => w >= 520;

/** Draws text inside a corner of a canvas with a dark backing so labels never collide with plots. */
function label(c: Ctx, s: string, x: number, y: number, color: string = C.dim, size = 11, align: CanvasTextAlign = 'left') {
  text(c, s, x, y, color, size, align);
}

/* ------------------------------------------------------------------ */
/*  Small linear algebra helpers                                       */
/* ------------------------------------------------------------------ */

type M2 = [number, number, number, number];

function eig2(a: number, b: number, c: number, d: number) {
  const tr = a + d, det = a * d - b * c, disc = (tr * tr) / 4 - det;
  if (disc < -1e-12) return { real: false as const, l1: tr / 2, l2: tr / 2, im: Math.sqrt(-disc), v1: [0, 0] as [number, number], v2: [0, 0] as [number, number], tr, det };
  const sq = Math.sqrt(Math.max(0, disc));
  const l1 = tr / 2 + sq, l2 = tr / 2 - sq;
  const vec = (l: number): [number, number] => {
    let v: [number, number];
    if (Math.abs(b) > 1e-9) v = [b, l - a];
    else if (Math.abs(c) > 1e-9) v = [l - d, c];
    else v = Math.abs(l - a) < Math.abs(l - d) ? [1, 0] : [0, 1];
    const n = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / n, v[1] / n];
  };
  return { real: true as const, l1, l2, im: 0, v1: vec(l1), v2: vec(l2), tr, det };
}

/** Jacobi eigen-decomposition for a symmetric matrix. Returns eigenvalues (descending) and eigenvectors as columns. */
function jacobiEig(Ain: number[][]) {
  const n = Ain.length;
  const A = Ain.map(r => r.slice());
  const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j): number => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = cs * akp - sn * akq; A[k][q] = sn * akp + cs * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = cs * apk - sn * aqk; A[q][k] = sn * apk + cs * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = cs * vkp - sn * vkq; V[k][q] = sn * vkp + cs * vkq; }
    }
  }
  const idx = Array.from({ length: n }, (_, i) => i).sort((i, j) => A[j][j] - A[i][i]);
  return { vals: idx.map(i => A[i][i]), vecs: Array.from({ length: n }, (_, r) => idx.map(i => V[r][i])) };
}

/* ================================================================== */
/*  1. Matrix transformations                                          */
/* ================================================================== */

interface MtS { m: M2; last: number[]; drag: number; t: number }
const mtView = (w: number, h: number) => fitView({ x: 8, y: 8, w: w - 16, h: h - 16 }, -5, 5, -3.8, 3.8);
function mtSync(s: MtS, v: Values) {
  const cur = ['a', 'b', 'c', 'd'].map(k => num(v, k));
  if (cur.some((x, i) => x !== s.last[i])) { s.m = cur as M2; s.last = cur; }
}
export const matrixTransform = defineSim<MtS>({
  id: 'matrix-transform', title: 'Matrix Transformations', subject: 'Math', status: 'active',
  category: 'Linear Algebra', topic: 'Linear maps', subtopic: 'Matrix as a transformation of the plane',
  educationLevels: BSBT, difficulty: 'Beginner',
  tags: ['engineering mathematics', 'linear algebra', 'determinant', 'GATE', 'shear', 'rotation', 'reflection'],
  covers: ['Matrix transformations'],
  learningObjectives: [
    'See the columns of a 2x2 matrix as the images of the basis vectors.',
    'Interpret the determinant as the signed area scale factor of the unit square.',
    'Recognise rotations, scalings, shears and reflections from the matrix entries.',
  ],
  assumptions: ['The map is linear and acts on column vectors in the plane; the origin never moves.'],
  blurb: 'Drag the tips of the two basis vectors and watch the whole grid bend. The determinant is the signed area of the unit square after the transformation.',
  hint: 'A 2x2 matrix sends i-hat to its first column and j-hat to its second column; every grid line stays straight and evenly spaced. det A is the area scale factor, negative means orientation flips (a reflection component), zero means the plane collapses onto a line (singular matrix).',
  params: [
    { kind: 'number', id: 'a', label: 'a  (top-left)', min: -3, max: 3, step: 0.05, value: 1.2, digits: 2 },
    { kind: 'number', id: 'b', label: 'b  (top-right)', min: -3, max: 3, step: 0.05, value: -0.6, digits: 2 },
    { kind: 'number', id: 'c', label: 'c  (bottom-left)', min: -3, max: 3, step: 0.05, value: 0.6, digits: 2 },
    { kind: 'number', id: 'd', label: 'd  (bottom-right)', min: -3, max: 3, step: 0.05, value: 0.9, digits: 2 },
    { kind: 'toggle', id: 'morph', label: 'Animate morph from identity', value: true },
  ],
  actions: [{ id: 'rot', label: 'Rotate 30°' }, { id: 'shear', label: 'Shear' }, { id: 'refl', label: 'Reflect' }],
  previewSeconds: 2.5,
  init(v) { const m = ['a', 'b', 'c', 'd'].map(k => num(v, k)); return { m: m as M2, last: m, drag: -1, t: 0 }; },
  action(s, _v, id) {
    const [a, b, c, d] = s.m;
    let n: M2 = s.m;
    if (id === 'rot') { const k = Math.cos(rad(30)), sn = Math.sin(rad(30)); n = [k * a - sn * c, k * b - sn * d, sn * a + k * c, sn * b + k * d]; }
    if (id === 'shear') n = [a + 0.5 * c, b + 0.5 * d, c, d];
    if (id === 'refl') n = [a, b, -c, -d];
    s.m = n.map(x => clamp(x, -4, 4)) as M2;
  },
  step(s, v, dt) { mtSync(s, v); s.t += dt; },
  draw(c, s, v, w, h) {
    mtSync(s, v);
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const V = mtView(w, h);
    const f = bool(v, 'morph') ? 0.5 - 0.5 * Math.cos(s.t * 0.9) : 1;
    const [a, b, cc, d] = [1 + (s.m[0] - 1) * f, s.m[1] * f, s.m[2] * f, 1 + (s.m[3] - 1) * f];
    const T = (x: number, y: number): [number, number] => [V.X(a * x + b * y), V.Y(cc * x + d * y)];
    c.save(); c.beginPath(); c.rect(8, 8, w - 16, h - 16); c.clip();
    for (let i = -8; i <= 8; i++) {
      line(c, V.X(i), V.Y(-8), V.X(i), V.Y(8), 'rgba(148,163,184,0.10)'); line(c, V.X(-8), V.Y(i), V.X(8), V.Y(i), 'rgba(148,163,184,0.10)');
      const p1 = T(i, -8), p2 = T(i, 8), q1 = T(-8, i), q2 = T(8, i);
      const col = i === 0 ? C.axis : 'rgba(96,165,250,0.45)';
      line(c, p1[0], p1[1], p2[0], p2[1], col, i === 0 ? 1.6 : 1); line(c, q1[0], q1[1], q2[0], q2[1], col, i === 0 ? 1.6 : 1);
    }
    const det = a * d - b * cc;
    const sq = [T(0, 0), T(1, 0), T(1, 1), T(0, 1)];
    c.beginPath(); sq.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
    c.fillStyle = det >= 0 ? 'rgba(52,211,153,0.28)' : 'rgba(244,114,182,0.32)'; c.fill(); c.strokeStyle = det >= 0 ? C.green : C.pink; c.lineWidth = 2; c.stroke();
    const o = T(0, 0), i1 = T(1, 0), j1 = T(0, 1);
    arrow(c, o[0], o[1], i1[0], i1[1], C.red, 3, 10); arrow(c, o[0], o[1], j1[0], j1[1], C.green, 3, 10);
    circle(c, i1[0], i1[1], 6, C.red, C.white, 1.5); circle(c, j1[0], j1[1], 6, C.green, C.white, 1.5);
    c.restore();
    label(c, 'î → first column', 16, 24, C.red, 11); label(c, 'ĵ → second column', 16, 40, C.green, 11);
    label(c, `det = ${R2(det)}   (area ×${R2(Math.abs(det))}${det < 0 ? ', orientation flipped' : ''})`, w - 14, 24, det >= 0 ? C.green : C.pink, 12, 'right');
    label(c, 'drag the coloured tips', w - 14, 40, C.dim, 10, 'right');
  },
  pointer(s, v, e) {
    mtSync(s, v);
    const V = mtView(e.w, e.h);
    if (e.kind === 'up') { s.drag = -1; return; }
    if (e.kind === 'down') {
      const d0 = Math.hypot(V.X(s.m[0]) - e.x, V.Y(s.m[2]) - e.y), d1 = Math.hypot(V.X(s.m[1]) - e.x, V.Y(s.m[3]) - e.y);
      s.drag = Math.min(d0, d1) < 24 ? (d0 <= d1 ? 0 : 1) : -1;
    }
    if (s.drag >= 0) {
      const x = clamp(Math.round(V.ix(e.x) * 20) / 20, -4, 4), y = clamp(Math.round(V.iy(e.y) * 20) / 20, -4, 4);
      s.m = s.drag === 0 ? [x, s.m[1], y, s.m[3]] : [s.m[0], x, s.m[2], y];
    }
  },
  readouts: (s) => [
    { label: 'det A', value: s.m[0] * s.m[3] - s.m[1] * s.m[2], digits: 3 }, { label: 'trace A', value: s.m[0] + s.m[3], digits: 3 },
    { label: 'î → ', value: `(${R2(s.m[0])}, ${R2(s.m[2])})` }, { label: 'ĵ → ', value: `(${R2(s.m[1])}, ${R2(s.m[3])})` },
    { label: 'Invertible?', value: Math.abs(s.m[0] * s.m[3] - s.m[1] * s.m[2]) > 1e-3 ? 'yes' : 'no (singular)' },
  ],
  equations: (s) => {
    const [a, b, c, d] = s.m;
    return [
      String.raw`A=\begin{bmatrix}${R2(a)}&${R2(b)}\\${R2(c)}&${R2(d)}\end{bmatrix},\qquad A\hat\imath=\begin{bmatrix}${R2(a)}\\${R2(c)}\end{bmatrix},\ A\hat\jmath=\begin{bmatrix}${R2(b)}\\${R2(d)}\end{bmatrix}`,
      String.raw`\det A=ad-bc=${R2(a * d - b * c, 3)}=\text{signed area of the image of the unit square}`,
    ];
  },
});

/* ================================================================== */
/*  2. Eigenvalues and eigenvectors (+ power iteration)                */
/* ================================================================== */

interface EgS { p: [number, number]; trail: [number, number][]; it: number; clock: number }
const egView = (w: number, h: number) => fitView({ x: 8, y: 8, w: w - 16, h: h - 16 }, -5, 5, -3.8, 3.8);
export const eigenSim = defineSim<EgS>({
  id: 'eigen-explorer', title: 'Eigenvalues & Eigenvectors', subject: 'Math', status: 'interactive_derivation',
  category: 'Linear Algebra', topic: 'Eigen-analysis', subtopic: 'Invariant directions and power iteration',
  educationLevels: BSBTMS, difficulty: 'Intermediate',
  tags: ['engineering mathematics', 'GATE', 'eigenvalue', 'characteristic polynomial', 'power method', 'diagonalisation'],
  covers: ['Eigenvalues and eigenvectors'],
  learningObjectives: [
    'Identify eigenvectors as directions that a matrix only stretches (or flips).',
    'Connect eigenvalues to the roots of the characteristic polynomial.',
    'Watch power iteration converge to the dominant eigenvector at rate |λ2/λ1|.',
  ],
  assumptions: ['Real 2x2 matrices. With complex eigenvalues there is no invariant real direction, so the power iteration rotates and does not converge.'],
  derivation: {
    targetEquation: '\\det(A-\\lambda I)=0',
    problemStatement: 'Find the scalars λ and non-zero vectors v with Av = λv for a 2×2 matrix A.',
    assumptions: ['A is a real 2×2 matrix.', 'v ≠ 0 (the zero vector is trivially a solution of every equation Av = λv).'],
    variableDefinitions: [
      { symbol: 'A', meaning: 'Square matrix (the linear map)' },
      { symbol: '\\lambda', meaning: 'Eigenvalue: the stretch factor along an eigenvector' },
      { symbol: '\\mathbf v', meaning: 'Eigenvector: a direction left unchanged by A' },
    ],
    startingPrinciple: 'Definition of an eigenpair, A v = λ v',
    steps: [
      { stepNumber: 1, title: 'Write the eigen-equation', math: 'A\\mathbf v=\\lambda\\mathbf v', explanation: 'A eigenvector is only scaled by A, never rotated off its line.', justification: 'Definition of an eigenpair.', highlightKey: 'eigen_def' },
      { stepNumber: 2, title: 'Move everything to one side', math: '(A-\\lambda I)\\mathbf v=\\mathbf 0', explanation: 'Since λv = λIv, subtract and factor out v.', justification: 'Identity matrix leaves a vector unchanged.', highlightKey: 'eigen_def' },
      { stepNumber: 3, title: 'Require a non-zero solution', math: '\\det(A-\\lambda I)=0', explanation: 'A homogeneous system has a non-zero solution only when its matrix is singular, i.e. its determinant vanishes.', justification: 'Invertible matrices only map 0 to 0.', highlightKey: 'char_poly' },
      { stepNumber: 4, title: 'Expand for a 2×2 matrix', math: '\\lambda^2-\\operatorname{tr}(A)\\,\\lambda+\\det A=0', explanation: 'For A=[[a,b],[c,d]]: (a−λ)(d−λ)−bc = λ² − (a+d)λ + (ad−bc).', justification: 'Direct expansion of the 2×2 determinant.', highlightKey: 'char_poly' },
      { stepNumber: 5, title: 'Solve the quadratic', math: '\\lambda_{1,2}=\\frac{\\operatorname{tr}A}{2}\\pm\\sqrt{\\frac{(\\operatorname{tr}A)^2}{4}-\\det A}', explanation: 'Real distinct roots give two invariant lines; a negative discriminant gives a complex pair (rotation-like behaviour).', justification: 'Quadratic formula.', highlightKey: 'eigenvalues' },
    ],
    finalResult: '\\lambda_{1,2}=\\tfrac12\\operatorname{tr}A\\pm\\sqrt{\\tfrac14(\\operatorname{tr}A)^2-\\det A}',
    dimensionalCheck: 'λ is a pure number (a scale factor); the product λ1λ2 equals det A and the sum equals tr A.',
    physicalInterpretation: 'Along an eigenvector the transformation is just stretching by λ; the ellipse image of the unit circle has its axes along eigenvectors only when A is symmetric.',
  },
  blurb: 'Every direction on the circle is mapped by A. Directions that stay on their own line are eigenvectors. Power iteration repeatedly applies A and lines the vector up with the dominant one.',
  hint: 'Eigenvectors satisfy Av = λv. For a real 2x2 matrix the eigenvalues are roots of λ² − tr λ + det = 0; complex roots mean no real invariant direction. Power iteration multiplies by A and renormalises; the error shrinks by |λ2/λ1| each step.',
  params: [
    { kind: 'number', id: 'a', label: 'a  (top-left)', min: -3, max: 3, step: 0.1, value: 2, digits: 1 },
    { kind: 'number', id: 'b', label: 'b  (top-right)', min: -3, max: 3, step: 0.1, value: 1, digits: 1 },
    { kind: 'number', id: 'c', label: 'c  (bottom-left)', min: -3, max: 3, step: 0.1, value: 0.5, digits: 1 },
    { kind: 'number', id: 'd', label: 'd  (bottom-right)', min: -3, max: 3, step: 0.1, value: 1.5, digits: 1 },
    { kind: 'number', id: 'rate', label: 'Power-iteration speed', min: 0.2, max: 3, step: 0.1, value: 1, unit: 'steps/s', digits: 1 },
  ],
  actions: [{ id: 'rand', label: 'New start vector' }],
  previewSeconds: 4,
  init() { return { p: [Math.cos(1.2), Math.sin(1.2)], trail: [], it: 0, clock: 0 }; },
  action(s) { const a = Math.random() * TAU; s.p = [Math.cos(a), Math.sin(a)]; s.trail = []; s.it = 0; },
  step(s, v, dt) {
    s.clock += dt * num(v, 'rate');
    if (s.clock < 1) return;
    s.clock = 0;
    const a = num(v, 'a'), b = num(v, 'b'), cc = num(v, 'c'), d = num(v, 'd');
    s.trail.push(s.p); if (s.trail.length > 14) s.trail.shift();
    const x = a * s.p[0] + b * s.p[1], y = cc * s.p[0] + d * s.p[1], n = Math.hypot(x, y) || 1;
    s.p = [x / n, y / n]; s.it++;
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const V = egView(w, h), a = num(v, 'a'), b = num(v, 'b'), cc = num(v, 'c'), d = num(v, 'd');
    const E = eig2(a, b, cc, d);
    c.save(); c.beginPath(); c.rect(8, 8, w - 16, h - 16); c.clip();
    for (let i = -6; i <= 6; i++) { line(c, V.X(i), V.Y(-6), V.X(i), V.Y(6), 'rgba(148,163,184,0.08)'); line(c, V.X(-6), V.Y(i), V.X(6), V.Y(i), 'rgba(148,163,184,0.08)'); }
    line(c, V.X(-6), V.Y(0), V.X(6), V.Y(0), C.axis); line(c, V.X(0), V.Y(-4), V.X(0), V.Y(4), C.axis);
    const circ: [number, number][] = [], ell: [number, number][] = [];
    for (let k = 0; k <= 72; k++) { const t = (k / 72) * TAU, x = Math.cos(t), y = Math.sin(t); circ.push([V.X(x), V.Y(y)]); ell.push([V.X(a * x + b * y), V.Y(cc * x + d * y)]); }
    polyline(c, circ, 'rgba(148,163,184,0.7)', 1.5); polyline(c, ell, C.cyan, 2);
    for (let k = 0; k < 16; k++) { const t = (k / 16) * TAU, x = Math.cos(t), y = Math.sin(t); line(c, V.X(x), V.Y(y), V.X(a * x + b * y), V.Y(cc * x + d * y), 'rgba(148,163,184,0.18)'); }
    if (E.real) {
      [[E.v1, E.l1, C.amber], [E.v2, E.l2, C.pink]].forEach(([vv, l, col]) => {
        const ev = vv as [number, number], lam = l as number;
        line(c, V.X(-5 * ev[0]), V.Y(-5 * ev[1]), V.X(5 * ev[0]), V.Y(5 * ev[1]), col as string, 1.2, [6, 5]);
        arrow(c, V.X(0), V.Y(0), V.X(ev[0]), V.Y(ev[1]), col as string, 2.5, 9);
        arrow(c, V.X(0), V.Y(0), V.X(lam * ev[0]), V.Y(lam * ev[1]), col as string, 3.5, 11);
        label(c, `λ=${R2(lam)}`, V.X(lam * ev[0]) + 8, V.Y(lam * ev[1]) - 6, col as string, 11);
      });
    }
    s.trail.forEach((p, i) => circle(c, V.X(1.6 * p[0]), V.Y(1.6 * p[1]), 2 + i * 0.2, `rgba(248,250,252,${0.08 + i * 0.04})`));
    arrow(c, V.X(0), V.Y(0), V.X(1.6 * s.p[0]), V.Y(1.6 * s.p[1]), C.white, 3, 11);
    circle(c, V.X(1.6 * s.p[0]), V.Y(1.6 * s.p[1]), 5, C.white);
    c.restore();
    label(c, E.real ? 'dashed lines: eigen-directions' : 'complex eigenvalues: no real invariant direction', 16, 24, E.real ? C.amber : C.red, 11);
    label(c, 'cyan: image of the unit circle', 16, 40, C.cyan, 11); label(c, 'white: power-iteration vector', 16, 56, C.white, 11);
  },
  readouts: (s, v) => {
    const a = num(v, 'a'), b = num(v, 'b'), cc = num(v, 'c'), d = num(v, 'd'), E = eig2(a, b, cc, d);
    const Ap = [a * s.p[0] + b * s.p[1], cc * s.p[0] + d * s.p[1]], ray = Ap[0] * s.p[0] + Ap[1] * s.p[1];
    let err: number | string = '-';
    if (E.real) { const dom = Math.abs(E.l1) >= Math.abs(E.l2) ? E.v1 : E.v2; const ang = Math.acos(clamp(Math.abs(dom[0] * s.p[0] + dom[1] * s.p[1]), 0, 1)); err = deg(ang); }
    return [
      { label: 'λ₁', value: E.real ? E.l1 : `${R2(E.l1)} + ${R2(E.im)}i`, digits: 3 }, { label: 'λ₂', value: E.real ? E.l2 : `${R2(E.l2)} − ${R2(E.im)}i`, digits: 3 },
      { label: 'trace / det', value: `${R2(E.tr)} / ${R2(E.det)}` }, { label: 'Iterations', value: s.it, digits: 0 },
      { label: 'Rayleigh quotient', value: ray, digits: 4 }, { label: 'Angle to dominant eigvec', value: err, unit: typeof err === 'number' ? '°' : '', digits: 2 },
      { label: '|λ₂/λ₁| (rate)', value: E.real ? Math.min(Math.abs(E.l1), Math.abs(E.l2)) / (Math.max(Math.abs(E.l1), Math.abs(E.l2)) || 1) : '-', digits: 3 },
    ];
  },
  equations: (_s, v) => {
    const E = eig2(num(v, 'a'), num(v, 'b'), num(v, 'c'), num(v, 'd'));
    return [
      String.raw`\lambda^2-(${R2(E.tr)})\lambda+(${R2(E.det)})=0`,
      E.real ? String.raw`\lambda_1=${R2(E.l1, 3)},\quad \lambda_2=${R2(E.l2, 3)},\quad \lambda_1\lambda_2=\det A,\ \lambda_1+\lambda_2=\operatorname{tr}A` : String.raw`\lambda=${R2(E.l1, 3)}\pm ${R2(E.im, 3)}\,i`,
    ];
  },
});

/* ================================================================== */
/*  3. Singular Value Decomposition                                    */
/* ================================================================== */

const PATTERNS: Record<string, number[][]> = {};
function pattern(name: string): number[][] {
  if (PATTERNS[name]) return PATTERNS[name];
  const n = 8, M: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (name === 'face') {
      const eye = (i === 2 && (j === 2 || j === 5)) ? 1 : 0, mouth = (i === 5 && j >= 2 && j <= 5) || (i === 4 && (j === 1 || j === 6)) ? 1 : 0, ring = Math.hypot(i - 3.5, j - 3.5) > 3 && Math.hypot(i - 3.5, j - 3.5) < 4.2 ? 0.6 : 0;
      M[i][j] = Math.min(1, eye + mouth + ring);
    } else if (name === 'gradient') M[i][j] = (i + j) / 14 + 0.15 * Math.sin(i * 1.3) * Math.cos(j * 0.9);
    else M[i][j] = ((i + j) % 2 === 0 ? 0.9 : 0.1) * (i < 4 ? 1 : 0.55) + (i === j ? 0.2 : 0);
  }
  PATTERNS[name] = M;
  return M;
}
const svdCache: Record<string, { sig: number[]; U: number[][]; V: number[][] }> = {};
function svdOf(name: string) {
  if (svdCache[name]) return svdCache[name];
  const A = pattern(name), n = A.length;
  const AtA = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => A.reduce((a, r) => a + r[i] * r[j], 0)));
  const { vals, vecs } = jacobiEig(AtA);
  const sig = vals.map(x => Math.sqrt(Math.max(0, x)));
  const U = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let k = 0; k < n; k++) if (sig[k] > 1e-9) for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += A[i][j] * vecs[j][k]; U[i][k] = s / sig[k]; }
  return (svdCache[name] = { sig, U, V: vecs });
}
function lowRank(name: string, k: number) {
  const { sig, U, V } = svdOf(name), n = sig.length;
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => { let s = 0; for (let q = 0; q < k; q++) s += sig[q] * U[i][q] * V[j][q]; return s; }));
}
export const svdSim = defineSim<{ t: number }>({
  id: 'svd-explorer', title: 'Singular Value Decomposition', subject: 'Math', status: 'active',
  category: 'Linear Algebra', topic: 'SVD', subtopic: 'Ellipse geometry and low-rank approximation',
  educationLevels: ['B.Tech', 'M.Tech', 'M.Sc'], difficulty: 'Advanced',
  tags: ['engineering mathematics', 'SVD', 'low rank', 'image compression', 'PCA', 'singular values', 'GATE'],
  covers: ['Singular Value Decomposition'],
  learningObjectives: [
    'See that any matrix maps the unit circle to an ellipse whose semi-axes are the singular values.',
    'Relate singular values to the eigenvalues of AᵀA.',
    'Use the Eckart–Young idea: truncating small singular values gives the best low-rank approximation.',
  ],
  assumptions: ['Left: real 2×2 matrix. Right: a fixed 8×8 grey-scale pattern decomposed numerically with the Jacobi method applied to AᵀA.'],
  blurb: 'The unit circle becomes an ellipse; the semi-axes are the singular values σ. On the right an 8×8 picture is rebuilt from only its k strongest singular values.',
  hint: 'A = UΣVᵀ. For the 2x2 matrix the ellipse axes have lengths σ1 ≥ σ2 along directions u1, u2; v1, v2 are the circle directions that map onto them. σ_i² are the eigenvalues of AᵀA. Keeping the k largest singular values gives the best rank-k approximation; the Frobenius error is sqrt of the sum of the discarded σ².',
  params: [
    { kind: 'number', id: 'a', label: 'a', min: -3, max: 3, step: 0.1, value: 1.6, digits: 1 },
    { kind: 'number', id: 'b', label: 'b', min: -3, max: 3, step: 0.1, value: 0.8, digits: 1 },
    { kind: 'number', id: 'c', label: 'c', min: -3, max: 3, step: 0.1, value: 0.4, digits: 1 },
    { kind: 'number', id: 'd', label: 'd', min: -3, max: 3, step: 0.1, value: 1.0, digits: 1 },
    { kind: 'select', id: 'pic', label: 'Picture', value: 'face', options: [{ value: 'face', label: 'Face' }, { value: 'gradient', label: 'Smooth gradient' }, { value: 'check', label: 'Checkerboard' }] },
    { kind: 'number', id: 'k', label: 'Rank kept (k)', min: 1, max: 8, step: 1, value: 3 },
  ],
  previewSeconds: 0.2,
  init() { return { t: 0 }; },
  step(s, _v, dt) { s.t += dt; },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const a = num(v, 'a'), b = num(v, 'b'), cc = num(v, 'c'), d = num(v, 'd');
    const p = a * a + cc * cc, q = a * b + cc * d, r = b * b + d * d;
    const m1 = (p + r) / 2 + Math.sqrt(((p - r) / 2) ** 2 + q * q), m2 = Math.max(0, (p + r) / 2 - Math.sqrt(((p - r) / 2) ** 2 + q * q));
    const s1 = Math.sqrt(m1), s2 = Math.sqrt(m2), phi = 0.5 * Math.atan2(2 * q, p - r);
    const vv1: [number, number] = [Math.cos(phi), Math.sin(phi)], vv2: [number, number] = [-Math.sin(phi), Math.cos(phi)];
    const isW = wide(w);
    const L: Rect = isW ? { x: 8, y: 8, w: w * 0.46 - 12, h: h - 16 } : { x: 8, y: 8, w: w - 16, h: h * 0.5 - 12 };
    panel(c, L);
    const V = fitView({ x: L.x + 6, y: L.y + 6, w: L.w - 12, h: L.h - 12 }, -3.4, 3.4, -3.4, 3.4);
    c.save(); c.beginPath(); c.rect(L.x, L.y, L.w, L.h); c.clip();
    line(c, V.X(-4), V.Y(0), V.X(4), V.Y(0), C.grid); line(c, V.X(0), V.Y(-4), V.X(0), V.Y(4), C.grid);
    const circ: [number, number][] = [], ell: [number, number][] = [];
    for (let k = 0; k <= 72; k++) { const t = (k / 72) * TAU, x = Math.cos(t), y = Math.sin(t); circ.push([V.X(x), V.Y(y)]); ell.push([V.X(a * x + b * y), V.Y(cc * x + d * y)]); }
    polyline(c, circ, 'rgba(148,163,184,0.7)', 1.4); polyline(c, ell, C.cyan, 2.4);
    [[vv1, s1, C.amber], [vv2, s2, C.pink]].forEach(([vec, sg, col]) => {
      const ve = vec as [number, number], sig = sg as number;
      const u = sig > 1e-9 ? [(a * ve[0] + b * ve[1]) / sig, (cc * ve[0] + d * ve[1]) / sig] : [0, 0];
      arrow(c, V.X(0), V.Y(0), V.X(ve[0]), V.Y(ve[1]), col as string, 2, 8);
      arrow(c, V.X(0), V.Y(0), V.X(sig * u[0]), V.Y(sig * u[1]), col as string, 3.4, 11);
    });
    c.restore();
    label(c, `σ₁=${R2(s1)}  σ₂=${R2(s2)}`, L.x + 8, L.y + 16, C.amber, 11);
    label(c, 'grey v → coloured σu', L.x + 8, L.y + L.h - 8, C.dim, 10);
    // right: image
    const k = Math.round(num(v, 'k')), name = str(v, 'pic'), A = pattern(name), Ak = lowRank(name, k), { sig } = svdOf(name);
    const R: Rect = isW ? { x: L.x + L.w + 10, y: 8, w: w - L.w - 26, h: h - 16 } : { x: 8, y: L.y + L.h + 10, w: w - 16, h: h - L.h - 26 };
    const cell = Math.max(6, Math.min(isW ? (R.w - 20) / 17 : (R.h - 40) / 8, isW ? (R.h - 110) / 8 : 22));
    const draw8 = (M: number[][], x0: number, y0: number, ttl: string) => {
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { const g = Math.round(clamp(M[i][j], 0, 1) * 235 + 10); c.fillStyle = `rgb(${g},${g},${g})`; c.fillRect(x0 + j * cell, y0 + i * cell, cell, cell); }
      c.strokeStyle = C.axis; c.strokeRect(x0, y0, cell * 8, cell * 8); label(c, ttl, x0, y0 - 4, C.text, 11);
    };
    panel(c, R);
    const y0 = R.y + 22;
    draw8(A, R.x + 10, y0, 'original 8×8'); draw8(Ak, R.x + 10 + cell * 8 + 12, y0, `rank ${k}`);
    const by = y0 + cell * 8 + 16;
    const bh = R.y + R.h - by - 14;
    if (bh > 24) {
      const bw = Math.min(26, (R.w - 20) / 8 - 4);
      sig.forEach((sv, i) => {
        const hh = (sv / sig[0]) * (bh - 12); c.fillStyle = i < k ? C.amber : 'rgba(148,163,184,0.45)'; c.fillRect(R.x + 10 + i * (bw + 4), by + bh - hh, bw, hh);
        label(c, `σ${i + 1}`, R.x + 10 + i * (bw + 4) + bw / 2, by + bh + 11, C.dim, 9, 'center');
      });
    }
  },
  readouts: (_s, v) => {
    const a = num(v, 'a'), b = num(v, 'b'), cc = num(v, 'c'), d = num(v, 'd'), p = a * a + cc * cc, q = a * b + cc * d, r = b * b + d * d;
    const m1 = (p + r) / 2 + Math.sqrt(((p - r) / 2) ** 2 + q * q), m2 = Math.max(0, (p + r) / 2 - Math.sqrt(((p - r) / 2) ** 2 + q * q));
    const k = Math.round(num(v, 'k')), { sig } = svdOf(str(v, 'pic')), tot = sig.reduce((x, y) => x + y * y, 0);
    const kept = sig.slice(0, k).reduce((x, y) => x + y * y, 0);
    return [
      { label: 'σ₁', value: Math.sqrt(m1), digits: 3 }, { label: 'σ₂', value: Math.sqrt(m2), digits: 3 }, { label: '|det| = σ₁σ₂', value: Math.sqrt(m1 * m2), digits: 3 },
      { label: 'Condition number', value: m2 > 1e-12 ? Math.sqrt(m1 / m2) : 'infinite', digits: 2 },
      { label: 'Picture energy kept', value: (kept / tot) * 100, unit: '%', digits: 2 }, { label: 'Frobenius error', value: Math.sqrt(Math.max(0, tot - kept)), digits: 4 },
    ];
  },
  equations: (_s, v) => [
    String.raw`A=U\Sigma V^{T},\qquad \sigma_i^2=\text{eigenvalues of }A^{T}A`,
    String.raw`A_k=\sum_{i=1}^{${Math.round(num(v, 'k'))}}\sigma_i\,\mathbf u_i\mathbf v_i^{T},\qquad \|A-A_k\|_F=\sqrt{\textstyle\sum_{i>k}\sigma_i^2}`,
  ],
});

/* ================================================================== */
/*  4. Vector spaces: span, basis, independence                        */
/* ================================================================== */

interface VsS { t: number }
function proj3(p: [number, number, number], yaw: number, el: number): [number, number] {
  const x1 = p[0] * Math.cos(yaw) - p[1] * Math.sin(yaw), y1 = p[0] * Math.sin(yaw) + p[1] * Math.cos(yaw);
  return [x1, p[2] * Math.cos(el) + y1 * Math.sin(el)];
}
export const vectorSpace = defineSim<VsS>({
  id: 'vector-space', title: 'Span, Basis & Independence', subject: 'Math', status: 'active',
  category: 'Linear Algebra', topic: 'Vector spaces', subtopic: 'Linear independence, span and rank in R³',
  educationLevels: BSBT, difficulty: 'Intermediate',
  tags: ['engineering mathematics', 'GATE', 'linear independence', 'basis', 'rank', 'span', 'determinant'],
  covers: ['Vector spaces'],
  learningObjectives: [
    'Decide linear independence in R³ with the scalar triple product.',
    'See span(u, v) as a plane and recognise when w lies in it.',
    'Link rank, determinant and the volume of the parallelepiped.',
  ],
  assumptions: ['u and v are unit vectors in the xy-plane; n = (0,0,1) is the third basis direction, and w = a·u + b·v + c·n.'],
  blurb: 'u and v span a plane. Vector w is a·u + b·v + c·n: when the out-of-plane part c reaches zero, w falls into the plane and the three vectors become dependent (volume 0).',
  hint: 'Three vectors in R³ are independent exactly when det[u v w] ≠ 0 (non-zero volume). Here det = c·sin(θ). When c = 0, w is a combination of u and v, so rank drops from 3 to 2. If θ = 0 or 180° then u and v themselves are parallel and the rank drops further.',
  params: [
    { kind: 'number', id: 'th', label: 'Angle between u and v', min: 0, max: 180, step: 1, value: 70, unit: '°' },
    { kind: 'number', id: 'ca', label: 'a  (w along u)', min: -2, max: 2, step: 0.05, value: 0.8, digits: 2 },
    { kind: 'number', id: 'cb', label: 'b  (w along v)', min: -2, max: 2, step: 0.05, value: 0.6, digits: 2 },
    { kind: 'number', id: 'cc', label: 'c  (w out of the plane)', min: -2, max: 2, step: 0.05, value: 1.1, digits: 2 },
    { kind: 'toggle', id: 'spin', label: 'Rotate camera', value: true },
  ],
  actions: [{ id: 'flat', label: 'Put w in the plane (c = 0)' }],
  previewSeconds: 1,
  init() { return { t: 0 }; },
  action(_s, v) { v.cc = 0; },
  step(s, v, dt) { if (bool(v, 'spin')) s.t += dt * 0.35; },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const th = rad(num(v, 'th')), A = num(v, 'ca'), B = num(v, 'cb'), Cc = num(v, 'cc');
    const yaw = 0.7 + s.t, el = 0.55;
    const isW = wide(w), area: Rect = isW ? { x: 8, y: 8, w: w * 0.68, h: h - 16 } : { x: 8, y: 8, w: w - 16, h: h - 16 };
    const sc = Math.min(area.w, area.h) / 6.2, ox = area.x + area.w / 2, oy = area.y + area.h * 0.55;
    const P = (p: [number, number, number]): [number, number] => { const q = proj3(p, yaw, el); return [ox + q[0] * sc, oy - q[1] * sc]; };
    const u: [number, number, number] = [1, 0, 0], vv: [number, number, number] = [Math.cos(th), Math.sin(th), 0], n: [number, number, number] = [0, 0, 1];
    const add = (...ps: [number, number, number][]): [number, number, number] => [ps.reduce((a, p) => a + p[0], 0), ps.reduce((a, p) => a + p[1], 0), ps.reduce((a, p) => a + p[2], 0)];
    const mul = (k: number, p: [number, number, number]): [number, number, number] => [k * p[0], k * p[1], k * p[2]];
    // plane
    const corners = [add(mul(-2, u), mul(-2, vv)), add(mul(2, u), mul(-2, vv)), add(mul(2, u), mul(2, vv)), add(mul(-2, u), mul(2, vv))].map(P);
    c.beginPath(); corners.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fillStyle = 'rgba(96,165,250,0.12)'; c.fill(); c.strokeStyle = 'rgba(96,165,250,0.5)'; c.stroke();
    for (let k = -2; k <= 2; k++) { const a1 = P(add(mul(k, u), mul(-2, vv))), a2 = P(add(mul(k, u), mul(2, vv))), b1 = P(add(mul(-2, u), mul(k, vv))), b2 = P(add(mul(2, u), mul(k, vv))); line(c, a1[0], a1[1], a2[0], a2[1], 'rgba(96,165,250,0.25)'); line(c, b1[0], b1[1], b2[0], b2[1], 'rgba(96,165,250,0.25)'); }
    const O = P([0, 0, 0]);
    // parallelepiped of u v w
    const wv = add(mul(A, u), mul(B, vv), mul(Cc, n));
    const pts: [number, number, number][] = [[0, 0, 0], u, vv, wv, add(u, vv), add(u, wv), add(vv, wv), add(u, vv, wv)];
    const edges = [[0, 1], [0, 2], [0, 3], [1, 4], [1, 5], [2, 4], [2, 6], [3, 5], [3, 6], [4, 7], [5, 7], [6, 7]];
    edges.forEach(([i, j]) => { const p1 = P(pts[i]), p2 = P(pts[j]); line(c, p1[0], p1[1], p2[0], p2[1], 'rgba(251,191,36,0.28)', 1, [3, 3]); });
    // components of w
    const c1 = P(mul(A, u)), c2 = P(add(mul(A, u), mul(B, vv))), c3 = P(wv);
    line(c, O[0], O[1], c1[0], c1[1], 'rgba(248,113,113,0.6)', 1.5, [5, 4]); line(c, c1[0], c1[1], c2[0], c2[1], 'rgba(52,211,153,0.6)', 1.5, [5, 4]); line(c, c2[0], c2[1], c3[0], c3[1], 'rgba(167,139,250,0.8)', 1.5, [5, 4]);
    const tu = P(mul(1.5, u)), tv = P(mul(1.5, vv));
    arrow(c, O[0], O[1], tu[0], tu[1], C.red, 3, 10); arrow(c, O[0], O[1], tv[0], tv[1], C.green, 3, 10); arrow(c, O[0], O[1], c3[0], c3[1], C.amber, 3.5, 11);
    label(c, 'u', tu[0] + 6, tu[1], C.red, 13); label(c, 'v', tv[0] + 6, tv[1], C.green, 13); label(c, 'w', c3[0] + 6, c3[1] - 4, C.amber, 13);
    const det = Cc * Math.sin(th), indep = Math.abs(det) > 0.02;
    label(c, indep ? 'u, v, w independent: span = all of R³' : 'dependent: w lies in span(u, v) (a plane)', area.x + 10, area.y + 18, indep ? C.green : C.red, 12);
    if (isW) {
      panel(c, { x: area.x + area.w + 10, y: 8, w: w - area.w - 26, h: h - 16 });
      const bx = area.x + area.w + 20; let by = 34;
      label(c, 'Rank', bx, by, C.dim, 11); by += 30; text(c, `${Math.abs(Math.sin(th)) < 0.02 ? (Math.hypot(A, B, Cc) < 1e-9 ? 0 : 1) : indep ? 3 : 2}`, bx, by, C.amber, 30, 'left', 'alphabetic', true); by += 26;
      label(c, 'det[u v w]', bx, by, C.dim, 11); by += 18; text(c, R2(det, 3), bx, by, indep ? C.green : C.red, 16, 'left', 'alphabetic', true); by += 26;
      label(c, 'volume', bx, by, C.dim, 11); by += 18; text(c, R2(Math.abs(det), 3), bx, by, C.text, 16, 'left', 'alphabetic', true);
    }
  },
  readouts: (_s, v) => {
    const th = rad(num(v, 'th')), det = num(v, 'cc') * Math.sin(th), indep = Math.abs(det) > 0.02;
    return [
      { label: 'det[u v w]', value: det, digits: 3 }, { label: 'Volume', value: Math.abs(det), digits: 3 },
      { label: 'Rank', value: Math.abs(Math.sin(th)) < 0.02 ? 1 : indep ? 3 : 2, digits: 0 }, { label: 'Independent?', value: indep ? 'yes' : 'no' },
      { label: 'Length of w', value: Math.hypot(num(v, 'ca') + num(v, 'cb') * Math.cos(th), num(v, 'cb') * Math.sin(th), num(v, 'cc')), digits: 3 },
    ];
  },
  equations: (_s, v) => [
    String.raw`\mathbf w=${R2(num(v, 'ca'))}\,\mathbf u+${R2(num(v, 'cb'))}\,\mathbf v+${R2(num(v, 'cc'))}\,\mathbf n`,
    String.raw`\det[\mathbf u\ \mathbf v\ \mathbf w]=\mathbf w\cdot(\mathbf u\times\mathbf v)=c\sin\theta=${R2(num(v, 'cc') * Math.sin(rad(num(v, 'th'))), 3)}`,
  ],
});

/* ================================================================== */
/*  5. Differential equations: slope field, Euler vs RK4 vs exact      */
/* ================================================================== */

interface OdeDef { label: string; f: (x: number, y: number) => number; exact: (x: number, y0: number) => number; yr: [number, number]; tex: string }
const ODES: Record<string, OdeDef> = {
  lin: { label: "y' = x − y", f: (x, y) => x - y, exact: (x, y0) => x - 1 + (y0 + 1) * Math.exp(-x), yr: [-3, 4], tex: "y'=x-y" },
  logi: { label: "y' = y(1 − y)  (logistic)", f: (_x, y) => y * (1 - y), exact: (x, y0) => (y0 === 0 ? 0 : 1 / (1 + ((1 - y0) / y0) * Math.exp(-x))), yr: [-1, 2], tex: "y'=y(1-y)" },
  gauss: { label: "y' = −2xy", f: (x, y) => -2 * x * y, exact: (x, y0) => y0 * Math.exp(-x * x), yr: [-3, 3], tex: "y'=-2xy" },
  grow: { label: "y' = y − x²", f: (x, y) => y - x * x, exact: (x, y0) => x * x + 2 * x + 2 + (y0 - 2) * Math.exp(x), yr: [-4, 6], tex: "y'=y-x^2" },
  osc: { label: "y' = sin x − y", f: (x, y) => Math.sin(x) - y, exact: (x, y0) => (Math.sin(x) - Math.cos(x)) / 2 + (y0 + 0.5) * Math.exp(-x), yr: [-2, 2.5], tex: "y'=\\sin x-y" },
};
interface OdS { y0: number; last: number; t: number }
const odeNum = (f: OdeDef['f'], y0: number, h: number, X: number, rk: boolean) => {
  const pts: [number, number][] = [[0, y0]]; let x = 0, y = y0; const n = Math.max(1, Math.round(X / h)), hh = X / n;
  for (let i = 0; i < n; i++) {
    if (rk) { const k1 = f(x, y), k2 = f(x + hh / 2, y + (hh / 2) * k1), k3 = f(x + hh / 2, y + (hh / 2) * k2), k4 = f(x + hh, y + hh * k3); y += (hh / 6) * (k1 + 2 * k2 + 2 * k3 + k4); } else y += hh * f(x, y);
    x += hh; pts.push([x, y]);
  }
  return pts;
};
export const odeSim = defineSim<OdS>({
  id: 'ode-slope-field', title: 'ODE Solver: Euler vs RK4', subject: 'Math', status: 'active',
  category: 'Differential Equations', topic: 'First-order ODEs', subtopic: 'Slope fields and numerical methods',
  educationLevels: BSBT, difficulty: 'Intermediate',
  tags: ['engineering mathematics', 'GATE', 'differential equations', 'Euler method', 'Runge-Kutta', 'slope field', 'numerical methods'],
  covers: ['Differential equations'],
  learningObjectives: [
    'Read a slope field as the direction of the solution at every point.',
    'Compare the first-order Euler method with fourth-order Runge–Kutta against the exact solution.',
    'See how the global error scales with the step size h (≈ h for Euler, ≈ h⁴ for RK4).',
  ],
  assumptions: ['Fixed-step explicit methods; the logistic equation with y0 < 0 blows up in finite time so the exact curve leaves the window.'],
  blurb: 'Click anywhere on the left edge to choose y(0). The short segments are the slope field; the amber Euler path and the cyan RK4 path are compared with the exact (dashed white) solution.',
  hint: 'Euler: y_{n+1} = y_n + h f(x_n, y_n), global error O(h). RK4 uses four slope samples per step and has error O(h^4). Halving h roughly halves Euler error and divides RK4 error by 16. Stiff or blow-up problems break fixed-step methods.',
  params: [
    { kind: 'select', id: 'eq', label: 'Equation', value: 'lin', options: Object.entries(ODES).map(([k, o]) => ({ value: k, label: o.label })) },
    { kind: 'number', id: 'h', label: 'Step size h', min: 0.05, max: 1, step: 0.05, value: 0.5, digits: 2 },
    { kind: 'number', id: 'y0', label: 'Initial value y(0)', min: -2, max: 3, step: 0.1, value: 1, digits: 1 },
  ],
  actions: [{ id: 'replay', label: 'Replay' }],
  previewSeconds: 4,
  init(v) { return { y0: num(v, 'y0'), last: num(v, 'y0'), t: 0 }; },
  action(s) { s.t = 0; },
  step(s, v, dt) { if (num(v, 'y0') !== s.last) { s.y0 = num(v, 'y0'); s.last = s.y0; } s.t += dt; },
  draw(c, s, v, w, h) {
    if (num(v, 'y0') !== s.last) { s.y0 = num(v, 'y0'); s.last = s.y0; }
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const od = ODES[str(v, 'eq')], X = 5, hh = num(v, 'h');
    const area: Rect = { x: 8, y: 8, w: w - 16, h: h - 16 };
    const m = plot(c, area, [0, X], od.yr, { xlabel: 'x', ylabel: 'y', xstep: 1 });
    const reveal = Math.min(X, s.t * 1.3);
    c.save(); c.beginPath(); c.rect(area.x + 34, area.y + 8, area.w - 42, area.h - 26); c.clip();
    for (let i = 0; i <= 24; i++) for (let j = 0; j <= 14; j++) {
      const x = (X * i) / 24, y = od.yr[0] + ((od.yr[1] - od.yr[0]) * j) / 14, sl = od.f(x, y), dx = 0.05;
      const px = m.X(x + dx) - m.X(x), py = m.Y(y + sl * dx) - m.Y(y), L = Math.hypot(px, py) || 1;
      const k = Math.min(9, 0.4 * (area.w / 24));
      line(c, m.X(x) - (px / L) * k, m.Y(y) - (py / L) * k, m.X(x) + (px / L) * k, m.Y(y) + (py / L) * k, 'rgba(148,163,184,0.35)', 1);
    }
    const draw = (pts: [number, number][], col: string, wd: number, dots: boolean) => {
      const seg: [number, number][] = [];
      for (const [x, y] of pts) { if (x > reveal + 1e-9) break; if (Number.isFinite(y) && Math.abs(y) < 1e3) seg.push([m.X(x), m.Y(y)]); }
      polyline(c, seg, col, wd); if (dots) seg.forEach(p => circle(c, p[0], p[1], 3, col));
    };
    const ex: [number, number][] = []; for (let i = 0; i <= 200; i++) { const x = (X * i) / 200; ex.push([x, od.exact(x, s.y0)]); }
    draw(ex, C.white, 1.6, false);
    draw(odeNum(od.f, s.y0, hh, X, false), C.amber, 2.2, true);
    draw(odeNum(od.f, s.y0, hh, X, true), C.cyan, 2.2, true);
    c.restore();
    circle(c, m.X(0), m.Y(clamp(s.y0, od.yr[0], od.yr[1])), 6, C.green, C.white, 1.5);
    label(c, 'Euler', area.x + area.w - 12, area.y + 22, C.amber, 11, 'right'); label(c, 'RK4', area.x + area.w - 12, area.y + 36, C.cyan, 11, 'right'); label(c, 'exact', area.x + area.w - 12, area.y + 50, C.white, 11, 'right');
  },
  pointer(s, v, e) {
    if (e.kind === 'up') return;
    const od = ODES[str(v, 'eq')];
    const top = 8 + 8, bot = e.h - 8 - 18; // approximate inner plot rect used by plot()
    const y = od.yr[1] - ((e.y - top) / (bot - top)) * (od.yr[1] - od.yr[0]);
    s.y0 = clamp(Math.round(y * 10) / 10, od.yr[0], od.yr[1]); s.t = 0;
  },
  readouts: (s, v) => {
    const od = ODES[str(v, 'eq')], X = 5, h = num(v, 'h');
    const ex = od.exact(X, s.y0), eu = odeNum(od.f, s.y0, h, X, false).pop()![1], rk = odeNum(od.f, s.y0, h, X, true).pop()![1];
    return [
      { label: 'Exact y(5)', value: ex, digits: 4 }, { label: 'Euler y(5)', value: eu, digits: 4 }, { label: 'RK4 y(5)', value: rk, digits: 4 },
      { label: 'Euler error', value: Math.abs(eu - ex), digits: 5 }, { label: 'RK4 error', value: Math.abs(rk - ex), digits: 7 }, { label: 'Steps', value: Math.round(X / h), digits: 0 },
    ];
  },
  equations: (s, v) => [
    String.raw`${ODES[str(v, 'eq')].tex},\quad y(0)=${R2(s.y0, 1)}`,
    String.raw`\text{Euler: }y_{n+1}=y_n+h f(x_n,y_n),\qquad \text{RK4: }y_{n+1}=y_n+\tfrac h6\,(k_1+2k_2+2k_3+k_4)`,
  ],
});

/* ================================================================== */
/*  6. Linear systems: phase portraits and classification              */
/* ================================================================== */

interface PpS { x0: [number, number]; p: [number, number]; trail: [number, number][] }
const ppRect = (w: number, h: number): Rect => (wide(w) ? { x: 8, y: 8, w: w * 0.62, h: h - 16 } : { x: 8, y: 8, w: w - 16, h: h * 0.64 });
function ppInt(A: number[], x0: [number, number], T: number, dt = 0.02, R = 5): [number, number][] {
  const pts: [number, number][] = [x0]; let x = x0[0], y = x0[1];
  const f = (a: number, b: number): [number, number] => [A[0] * a + A[1] * b, A[2] * a + A[3] * b];
  for (let t = 0; t < T; t += dt) {
    const k1 = f(x, y), k2 = f(x + 0.5 * dt * k1[0], y + 0.5 * dt * k1[1]), k3 = f(x + 0.5 * dt * k2[0], y + 0.5 * dt * k2[1]), k4 = f(x + dt * k3[0], y + dt * k3[1]);
    x += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); y += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    if (Math.abs(x) > R * 1.3 || Math.abs(y) > R * 1.3) break;
    pts.push([x, y]);
  }
  return pts;
}
function classify(A: number[]) {
  const tr = A[0] + A[3], det = A[0] * A[3] - A[1] * A[2], D = tr * tr - 4 * det;
  if (det < -1e-6) return 'Saddle (unstable)';
  if (Math.abs(det) <= 1e-6) return 'Degenerate (line of equilibria)';
  if (Math.abs(tr) < 1e-6 && det > 0) return 'Centre (neutrally stable)';
  if (D < -1e-6) return tr < 0 ? 'Stable spiral' : 'Unstable spiral';
  if (Math.abs(D) <= 1e-6) return tr < 0 ? 'Stable degenerate / star node' : 'Unstable degenerate / star node';
  return tr < 0 ? 'Stable node' : 'Unstable node';
}
export const phasePortrait = defineSim<PpS>({
  id: 'phase-portrait-2x2', title: 'Phase Portraits of x′ = Ax', subject: 'Math', status: 'active',
  category: 'Differential Equations', topic: 'Linear systems', subtopic: 'Eigenvalue classification of equilibria',
  educationLevels: BSBT, difficulty: 'Intermediate',
  tags: ['engineering mathematics', 'GATE', 'phase plane', 'stability', 'node', 'saddle', 'spiral', 'trace determinant'],
  covers: ['Differential equations'],
  learningObjectives: [
    'Classify the origin as node, saddle, spiral or centre from trace and determinant.',
    'Relate the eigenvalues of A to the shape and stability of trajectories.',
    'Locate the system on the trace–determinant plane.',
  ],
  assumptions: ['Autonomous linear system x′ = Ax with constant real 2×2 matrix; trajectories integrated with RK4 and clipped to the window.'],
  blurb: 'Change the four entries of A and the picture of all trajectories reshapes itself. Drag in the plane to start your own trajectory; the small chart shows where (trace, det) sits.',
  hint: 'With τ = trace and Δ = det: Δ<0 saddle; Δ>0 and τ²>4Δ node; τ²<4Δ spiral; τ=0 centre. Stable if τ<0 and Δ>0. Eigenvalues are (τ ± sqrt(τ²−4Δ))/2; real parts decide growth or decay, imaginary parts decide rotation.',
  params: [
    { kind: 'number', id: 'a', label: 'a', min: -3, max: 3, step: 0.1, value: -0.5, digits: 1 },
    { kind: 'number', id: 'b', label: 'b', min: -3, max: 3, step: 0.1, value: 2, digits: 1 },
    { kind: 'number', id: 'c', label: 'c', min: -3, max: 3, step: 0.1, value: -2, digits: 1 },
    { kind: 'number', id: 'd', label: 'd', min: -3, max: 3, step: 0.1, value: -0.5, digits: 1 },
  ],
  actions: [{ id: 'saddle', label: 'Saddle' }, { id: 'center', label: 'Centre' }],
  previewSeconds: 3,
  init() { return { x0: [2.5, 0.5], p: [2.5, 0.5], trail: [] }; },
  action(_s, v, id) { if (id === 'saddle') { v.a = 1; v.b = 1; v.c = 2; v.d = -1; } else { v.a = 0; v.b = 1; v.c = -1; v.d = 0; } },
  step(s, v, dt) {
    const A = ['a', 'b', 'c', 'd'].map(k => num(v, k)), f = (x: number, y: number): [number, number] => [A[0] * x + A[1] * y, A[2] * x + A[3] * y];
    const k1 = f(...s.p), k2 = f(s.p[0] + 0.5 * dt * k1[0], s.p[1] + 0.5 * dt * k1[1]);
    s.p = [s.p[0] + dt * k2[0], s.p[1] + dt * k2[1]];
    s.trail.push(s.p); if (s.trail.length > 90) s.trail.shift();
    if (Math.hypot(...s.p) > 7 || Math.hypot(...s.p) < 0.05) { s.p = s.x0; s.trail = []; }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const A = ['a', 'b', 'c', 'd'].map(k => num(v, k)), R = ppRect(w, h);
    const m = plot(c, R, [-5, 5], [-5, 5], { zeroAxis: true, xstep: 2.5, ystep: 2.5 });
    c.save(); c.beginPath(); c.rect(R.x + 34, R.y + 8, R.w - 42, R.h - 26); c.clip();
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
      const x = i * 1.1, y = j * 1.1, fx = A[0] * x + A[1] * y, fy = A[2] * x + A[3] * y, L = Math.hypot(fx, fy);
      if (L < 1e-9) continue;
      const k = 11; arrow(c, m.X(x), m.Y(y), m.X(x) + (fx / L) * k, m.Y(y) - (fy / L) * k, 'rgba(148,163,184,0.35)', 1, 4);
    }
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU, seed: [number, number] = [4.2 * Math.cos(a), 4.2 * Math.sin(a)];
      polyline(c, ppInt(A, seed, 6).map(p => [m.X(p[0]), m.Y(p[1])] as [number, number]), 'rgba(96,165,250,0.55)', 1.4);
      polyline(c, ppInt(A.map(x => -x), seed, 6).map(p => [m.X(p[0]), m.Y(p[1])] as [number, number]), 'rgba(96,165,250,0.3)', 1.1);
    }
    const E = eig2(A[0], A[1], A[2], A[3]);
    if (E.real) [E.v1, E.v2].forEach((ev, i) => line(c, m.X(-6 * ev[0]), m.Y(-6 * ev[1]), m.X(6 * ev[0]), m.Y(6 * ev[1]), i ? C.pink : C.amber, 1.4, [6, 5]));
    polyline(c, ppInt(A, s.x0, 8).map(p => [m.X(p[0]), m.Y(p[1])] as [number, number]), C.green, 2.4);
    polyline(c, s.trail.map(p => [m.X(p[0]), m.Y(p[1])] as [number, number]), C.white, 2);
    circle(c, m.X(s.p[0]), m.Y(s.p[1]), 5, C.white); circle(c, m.X(s.x0[0]), m.Y(s.x0[1]), 5, undefined, C.green, 2);
    c.restore();
    // trace-determinant inset
    const tr = A[0] + A[3], det = A[0] * A[3] - A[1] * A[2];
    const I: Rect = wide(w) ? { x: R.x + R.w + 10, y: 8, w: w - R.w - 26, h: Math.min(h * 0.55, w - R.w - 26) } : { x: 8, y: R.y + R.h + 8, w: w * 0.5 - 12, h: h - R.h - 24 };
    if (I.h > 60 && I.w > 70) {
      const tm = plot(c, I, [-6, 6], [-6, 9], { title: 'trace–determinant', xstep: 6, ystep: 5, zeroAxis: true });
      const par: [number, number][] = []; for (let t = -6; t <= 6; t += 0.4) par.push([tm.X(t), tm.Y((t * t) / 4)]);
      polyline(c, par, C.amber, 1.6); circle(c, tm.X(clamp(tr, -6, 6)), tm.Y(clamp(det, -6, 9)), 5, C.green, C.white, 1.5);
    }
    const lab = classify(A);
    label(c, lab, wide(w) ? R.x + R.w + 12 : w * 0.5 + 6, wide(w) ? Math.min(h * 0.55, w - R.w - 26) + 36 : R.y + R.h + 22, /Stable|Centre/.test(lab) ? C.green : C.red, 12);
  },
  pointer(s, _v, e) {
    if (e.kind === 'up') return;
    const R = ppRect(e.w, e.h), ix = R.x + 34, iw = R.w - 42, iy = R.y + 8, ih = R.h - 26;
    const x = clamp(-5 + ((e.x - ix) / iw) * 10, -4.6, 4.6), y = clamp(5 - ((e.y - iy) / ih) * 10, -4.6, 4.6);
    s.x0 = [x, y]; s.p = [x, y]; s.trail = [];
  },
  readouts: (_s, v) => {
    const A = ['a', 'b', 'c', 'd'].map(k => num(v, k)), E = eig2(A[0], A[1], A[2], A[3]);
    return [
      { label: 'Type', value: classify(A) }, { label: 'trace τ', value: E.tr, digits: 2 }, { label: 'det Δ', value: E.det, digits: 2 },
      { label: 'λ₁', value: E.real ? E.l1 : `${R2(E.l1)} + ${R2(E.im)}i`, digits: 3 }, { label: 'λ₂', value: E.real ? E.l2 : `${R2(E.l2)} − ${R2(E.im)}i`, digits: 3 },
    ];
  },
  equations: (_s, v) => {
    const E = eig2(num(v, 'a'), num(v, 'b'), num(v, 'c'), num(v, 'd'));
    return [
      String.raw`\dot{\mathbf x}=\begin{bmatrix}${R2(num(v, 'a'), 1)}&${R2(num(v, 'b'), 1)}\\${R2(num(v, 'c'), 1)}&${R2(num(v, 'd'), 1)}\end{bmatrix}\mathbf x`,
      E.real ? String.raw`\lambda=${R2(E.l1, 3)},\ ${R2(E.l2, 3)}\quad\Rightarrow\quad \mathbf x(t)=c_1e^{\lambda_1t}\mathbf v_1+c_2e^{\lambda_2t}\mathbf v_2` : String.raw`\lambda=${R2(E.l1, 3)}\pm ${R2(E.im, 3)}i\ \Rightarrow\ \text{growth }e^{${R2(E.l1, 2)}t}\text{, rotation }${R2(E.im, 2)}\text{ rad/s}`,
    ];
  },
});

/* ------------------------------------------------------------------ */

export const UG_MATH_SIMS_A: AnySim[] = [matrixTransform, eigenSim, svdSim, vectorSpace, odeSim, phasePortrait];
void hsl; void drawScope; void Scope;
