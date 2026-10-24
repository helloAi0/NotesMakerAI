import { defineSim, num, str, bool, PG_ALL, UG_ENG } from './types';
import type { EducationLevel, Difficulty, SimSubject } from './types';
import { C, TAU, arrow, circle, clamp, fmt, gauss, line, panel, plot, polyline, text, deg, rnd } from './draw';

const meta = (subject: SimSubject, levels: EducationLevel[], difficulty: Difficulty, category: string, topic: string, subtopic: string) => ({
  subject, status: 'active' as const, educationLevels: levels, difficulty, category, topic, subtopic,
});
const PGB: EducationLevel[] = [...PG_ALL, ...UG_ENG];

/* ================================================================== */
/*  3-link arm: Jacobian, manipulability, singularities                */
/* ================================================================== */
interface J3S { q: [number, number, number]; target: [number, number] | null }
const LL = [1, 0.8, 0.5];
function fk3(q: number[]) { const a1 = q[0], a2 = a1 + q[1], a3 = a2 + q[2]; const p1: [number, number] = [LL[0] * Math.cos(a1), LL[0] * Math.sin(a1)], p2: [number, number] = [p1[0] + LL[1] * Math.cos(a2), p1[1] + LL[1] * Math.sin(a2)], p3: [number, number] = [p2[0] + LL[2] * Math.cos(a3), p2[1] + LL[2] * Math.sin(a3)]; return [[0, 0], p1, p2, p3] as [number, number][]; }
function jac3(q: number[]) { const p = fk3(q), e = p[3]; return [0, 1, 2].map(i => [-(e[1] - p[i][1]), e[0] - p[i][0]]); /* columns as [dx,dy] per joint */ }
function jjT(q: number[]) { const cols = jac3(q); let a = 0, b = 0, d = 0; for (const [x, y] of cols) { a += x * x; b += x * y; d += y * y; } return { a, b, d }; }
export const jacobian3 = defineSim<J3S>({
  id: 'jacobian_3link', title: '3-Link Planar Arm: Jacobian, Manipulability Ellipse & Singularities',
  ...meta('Robotics', PGB, 'Advanced', 'Manipulator Kinematics', 'Robot Kinematics', 'Velocity kinematics, Jacobian, singularities, manipulability'),
  covers: ['Jacobian', 'Manipulability ellipse', 'Kinematic singularity', 'Redundant manipulator', 'Damped least squares inverse kinematics'],
  tags: ['M.Tech', 'robotics', 'GATE', 'Yoshikawa', 'redundancy', 'pseudo-inverse', 'workspace'],
  learningObjectives: ['See how the Jacobian maps joint rates to end-effector velocity.', 'Interpret the manipulability ellipse: long axis = easy direction, short axis = hard direction.', 'Watch the ellipse collapse at a singularity (arm fully stretched or folded).'],
  assumptions: ['Planar 3R arm with link lengths 1, 0.8, 0.5; position Jacobian (2×3) only; IK uses damped least squares (λ = 0.05).'],
  blurb: 'Drag the target anywhere. The arm follows with damped-least-squares inverse kinematics while the manipulability ellipse shows in which directions the hand can move fast and in which it is nearly stuck.',
  hint: 'v = J(q) q̇ with J 2×3. Manipulability w = √det(J Jᵀ) — the ellipse axes are singular values of J. When the arm is stretched out w → 0 (singular): one direction of motion is lost. Redundancy (3 joints for 2D) lets the arm self-move in the null space.',
  params: [
    { kind: 'toggle', id: 'ell', label: 'Show manipulability ellipse', value: true },
    { kind: 'toggle', id: 'null', label: 'Null-space posture optimisation (maximise w)', value: false },
    { kind: 'number', id: 'gain', label: 'Tracking gain', min: 1, max: 20, step: 1, value: 8, digits: 0 },
  ],
  actions: [{ id: 'stretch', label: 'Stretch arm (singular)' }, { id: 'home', label: 'Reset posture' }],
  dt: 1 / 120, previewSeconds: 2,
  init() { return { q: [0.6, 0.9, 0.7], target: [1.2, 1.0] }; },
  action(s, _v, id) { if (id === 'stretch') { s.q = [0.3, 0.0, 0.0]; s.target = [fk3(s.q)[3][0], fk3(s.q)[3][1]]; } else { s.q = [0.6, 0.9, 0.7]; s.target = [1.2, 1.0]; } },
  pointer(s, _v, e) { if (e.kind !== 'up') { const sc = Math.min(e.w, e.h) / 5.4; s.target = [(e.x - e.w * 0.38) / sc, (e.h * 0.55 - e.y) / sc]; } },
  step(s, v, dt) {
    if (!s.target) return; const p = fk3(s.q)[3], ex = s.target[0] - p[0], ey = s.target[1] - p[1], cols = jac3(s.q), lam = 0.05, K = num(v, 'gain');
    const { a, b, d } = jjT(s.q), A = a + lam * lam, D = d + lam * lam, det = A * D - b * b; // (JJᵀ+λ²I)⁻¹ e
    const wx = (D * ex - b * ey) / det, wy = (-b * ex + A * ey) / det; const dq = cols.map(([x, y]) => x * wx + y * wy);
    if (bool(v, 'null')) { const h = 1e-3, w0 = (q: number[]) => { const m = jjT(q); return Math.sqrt(Math.max(m.a * m.d - m.b * m.b, 0)); }; const g = [0, 1, 2].map(i => { const q2 = s.q.slice(); q2[i] += h; return (w0(q2) - w0(s.q)) / h; }); const Jp = cols; const proj = [0, 1, 2].map(i => g[i]); // project gradient onto null space of J
      const Jg = [0, 1].map(r => Jp.reduce((acc, c, i) => acc + c[r] * proj[i], 0)); const wv = [(D * Jg[0] - b * Jg[1]) / det, (-b * Jg[0] + A * Jg[1]) / det]; const corr = Jp.map(([x, y]) => x * wv[0] + y * wv[1]); for (let i = 0; i < 3; i++) dq[i] += 2 * (proj[i] - corr[i]); }
    for (let i = 0; i < 3; i++) s.q[i] += clamp(K * dq[i] * dt, -0.05, 0.05);
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const sc = Math.min(w, h) / 5.4, ox = w * 0.38, oy = h * 0.55, P = (p: [number, number]): [number, number] => [ox + p[0] * sc, oy - p[1] * sc];
    c.beginPath(); c.arc(ox, oy, 2.3 * sc, 0, TAU); c.strokeStyle = C.grid; c.setLineDash([4, 4]); c.stroke(); c.setLineDash([]);
    const pts = fk3(s.q).map(P); if (s.target) { const t = P(s.target); circle(c, t[0], t[1], 6, undefined, C.pink, 2); line(c, t[0] - 9, t[1], t[0] + 9, t[1], C.pink, 1); line(c, t[0], t[1] - 9, t[0], t[1] + 9, C.pink, 1); }
    const { a, b, d } = jjT(s.q); const tr = a + d, dt2 = Math.sqrt(Math.max((a - d) ** 2 / 4 + b * b, 0)), l1 = tr / 2 + dt2, l2 = Math.max(tr / 2 - dt2, 0), th = 0.5 * Math.atan2(2 * b, a - d);
    if (bool(v, 'ell')) { c.save(); c.translate(pts[3][0], pts[3][1]); c.rotate(-th); c.beginPath(); c.ellipse(0, 0, Math.sqrt(l1) * sc * 0.5, Math.max(Math.sqrt(l2) * sc * 0.5, 0.5), 0, 0, TAU); c.fillStyle = 'rgba(52,211,153,0.22)'; c.fill(); c.strokeStyle = C.green; c.lineWidth = 2; c.stroke(); c.restore(); }
    for (let i = 0; i < 3; i++) line(c, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], [C.cyan, C.blue, C.purple][i], 7);
    for (const p of pts) circle(c, p[0], p[1], 5, C.white); circle(c, pts[3][0], pts[3][1], 6, C.amber, C.white, 1.5);
    const wm = Math.sqrt(Math.max(a * d - b * b, 0)); const R = { x: w * 0.7, y: 12, w: w * 0.28, h: 60 }; panel(c, R); text(c, 'manipulability w', R.x + 8, R.y + 16, C.dim, 10); c.fillStyle = wm < 0.15 ? C.red : C.green; c.fillRect(R.x + 8, R.y + 28, clamp(wm / 1, 0, 1) * (R.w - 16), 12); text(c, fmt(wm, 3), R.x + 8, R.y + 54, C.text, 11);
    if (wm < 0.15) text(c, 'NEAR SINGULARITY', w * 0.5, h - 12, C.red, 13, 'center', 'alphabetic', true);
    text(c, 'drag the pink target', 10, 18, C.dim, 10);
  },
  readouts(s) { const { a, b, d } = jjT(s.q), tr = a + d, dt2 = Math.sqrt(Math.max((a - d) ** 2 / 4 + b * b, 0)), s1 = Math.sqrt(tr / 2 + dt2), s2 = Math.sqrt(Math.max(tr / 2 - dt2, 0)); const p = fk3(s.q)[3]; return [{ label: 'End-effector x', value: p[0], digits: 2 }, { label: 'End-effector y', value: p[1], digits: 2 }, { label: 'Manipulability w', value: s1 * s2, digits: 3 }, { label: 'σ₁ (max)', value: s1, digits: 3 }, { label: 'σ₂ (min)', value: s2, digits: 3 }, { label: 'Condition number', value: s2 > 1e-6 ? s1 / s2 : 'infinite (singular)', digits: 1 }, { label: 'Joint 2 angle', value: deg(s.q[1]), unit: '°', digits: 0 }]; },
  equations(s) { const { a, b, d } = jjT(s.q); return ['\\dot{\\mathbf{x}} = J(\\mathbf{q})\\,\\dot{\\mathbf{q}}', `w = \\sqrt{\\det(JJ^T)} = ${fmt(Math.sqrt(Math.max(a * d - b * b, 0)), 3)}`, '\\dot{\\mathbf q} = J^T(JJ^T+\\lambda^2 I)^{-1}\\,\\mathbf e']; },
});

/* ================================================================== */
/*  Trajectory profiles                                                */
/* ================================================================== */
interface TrS { t: number }
function prof(kind: string, D: number, T: number, vmaxFrac: number, t: number): [number, number, number] {
  const u = clamp(t / T, 0, 1);
  if (kind === 'cubic') return [D * (3 * u * u - 2 * u ** 3), (D / T) * (6 * u - 6 * u * u), (D / (T * T)) * (6 - 12 * u)];
  if (kind === 'quintic') return [D * (10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5), (D / T) * (30 * u ** 2 - 60 * u ** 3 + 30 * u ** 4), (D / (T * T)) * (60 * u - 180 * u ** 2 + 120 * u ** 3)];
  const vm = vmaxFrac * (D / T) * 2, va = D / T; const vv = Math.max(Math.min(vm, 2 * va * 0.999), va * 1.0001); const ta = T - D / vv, acc = vv / ta; // trapezoid
  if (t <= 0) return [0, 0, acc]; if (t >= T) return [D, 0, 0];
  if (t < ta) return [0.5 * acc * t * t, acc * t, acc]; if (t < T - ta) return [0.5 * acc * ta * ta + vv * (t - ta), vv, 0]; const tr = T - t; return [D - 0.5 * acc * tr * tr, acc * tr, -acc];
}
export const trajectory = defineSim<TrS>({
  id: 'trajectory_profiles', title: 'Joint Trajectory Planning: Cubic, Quintic & Trapezoidal Profiles',
  ...meta('Robotics', PGB, 'Intermediate', 'Motion Planning', 'Trajectory Generation', 'Point-to-point trajectories with rest-to-rest boundary conditions'),
  covers: ['Cubic polynomial trajectory', 'Quintic trajectory', 'Trapezoidal velocity profile', 'Jerk', 'Boundary conditions'],
  tags: ['M.Tech', 'robotics', 'motion control', 'CNC', 'S-curve', 'rest-to-rest', 'acceleration limit'],
  learningObjectives: ['Compare position, velocity and acceleration of the three standard profiles.', 'See why cubic has non-zero end acceleration and quintic does not.', 'Find peak velocity and acceleration to size a motor.'],
  assumptions: ['Rest-to-rest motion over a fixed duration T; trapezoidal profile symmetric.'],
  blurb: 'Move a joint a distance D in time T. Pick a profile and see position, velocity and acceleration together with the peak values that an actuator would have to deliver.',
  hint: 'Cubic: q(u) = D(3u²−2u³): zero end velocities but acceleration jumps at the ends. Quintic adds zero end accelerations (smoother, peak a = 5.77 D/T²). Trapezoid: constant acceleration, cruise, constant deceleration (min peak velocity for given peak acceleration).',
  params: [
    { kind: 'select', id: 'kind', label: 'Profile', value: 'quintic', options: [{ value: 'cubic', label: 'Cubic' }, { value: 'quintic', label: 'Quintic' }, { value: 'trap', label: 'Trapezoidal' }] },
    { kind: 'number', id: 'D', label: 'Distance D', min: 0.1, max: 3, step: 0.1, value: 1.5, unit: 'rad', digits: 1 },
    { kind: 'number', id: 'T', label: 'Duration T', min: 0.5, max: 6, step: 0.1, value: 3, unit: 's', digits: 1 },
    { kind: 'number', id: 'cru', label: 'Trapezoid cruise speed (× average)', min: 1.1, max: 1.95, step: 0.05, value: 1.5, digits: 2 },
  ],
  dt: 1 / 60, previewSeconds: 1, init() { return { t: 0 }; }, step(s, v, dt) { s.t = (s.t + dt) % (num(v, 'T') + 0.8); },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const kind = str(v, 'kind'), D = num(v, 'D'), T = num(v, 'T'), cru = num(v, 'cru') / 2;
    const gh = (h - 28) / 3, mk = (i: number, title: string, f: (t: number) => number, col: string, mn: number, mxv: number) => { const R = { x: 8, y: 6 + i * (gh + 6), w: w * 0.7, h: gh }; const m = plot(c, R, [0, T], [mn, mxv], { title, ystep: (mxv - mn) / 3 }); const pts: [number, number][] = []; for (let k = 0; k <= 120; k++) { const t = (k / 120) * T; pts.push([m.X(t), m.Y(f(t))]); } polyline(c, pts, col, 2.2); const tt = Math.min(s.t, T); circle(c, m.X(tt), m.Y(f(tt)), 4.5, C.amber, C.white, 1); };
    const samp = Array.from({ length: 121 }, (_, k) => prof(kind, D, T, cru, (k / 120) * T)); const mxV = Math.max(...samp.map(q => Math.abs(q[1])), 0.1), mxA = Math.max(...samp.map(q => Math.abs(q[2])), 0.1);
    mk(0, 'Position q (rad)', t => prof(kind, D, T, cru, t)[0], C.cyan, 0, D * 1.1); mk(1, 'Velocity (rad/s)', t => prof(kind, D, T, cru, t)[1], C.green, 0, mxV * 1.15); mk(2, 'Acceleration (rad/s²)', t => prof(kind, D, T, cru, t)[2], C.amber, -mxA * 1.15, mxA * 1.15);
    const Q = { x: w * 0.7 + 18, y: 6, w: w * 0.3 - 26, h: h - 12 }; panel(c, Q); const ang = prof(kind, D, T, cru, Math.min(s.t, T))[0]; const cx = Q.x + Q.w / 2, cy = Q.y + Q.h / 2, r = Math.min(Q.w, Q.h) * 0.36;
    c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.strokeStyle = C.grid; c.stroke(); line(c, cx, cy, cx + r * Math.cos(-ang), cy + r * Math.sin(-ang), C.amber, 5); circle(c, cx, cy, 5, C.white); text(c, `${fmt(deg(ang), 0)}°`, cx, Q.y + Q.h - 8, C.text, 11, 'center');
  },
  readouts(_s, v) { const kind = str(v, 'kind'), D = num(v, 'D'), T = num(v, 'T'), s = Array.from({ length: 241 }, (_, k) => prof(kind, D, T, num(v, 'cru') / 2, (k / 240) * T)); return [{ label: 'Peak velocity', value: Math.max(...s.map(q => Math.abs(q[1]))), unit: 'rad/s', digits: 3 }, { label: 'Peak acceleration', value: Math.max(...s.map(q => Math.abs(q[2]))), unit: 'rad/s²', digits: 3 }, { label: 'Average velocity D/T', value: D / T, unit: 'rad/s', digits: 3 }, { label: 'End acceleration', value: Math.abs(s[240][2]), unit: 'rad/s²', digits: 3 }, { label: 'Peak vel / average', value: Math.max(...s.map(q => Math.abs(q[1]))) / (D / T), digits: 2 }]; },
  equations(_s, v) { const k = str(v, 'kind'); return [k === 'cubic' ? 'q(t) = D(3u^2 - 2u^3),\\ u = t/T' : k === 'quintic' ? 'q(t) = D(10u^3 - 15u^4 + 6u^5)' : 'q(t)=\\tfrac12 a t^2,\\ v_{max}t,\\ D-\\tfrac12 a (T-t)^2']; },
});

/* ================================================================== */
/*  Grid path planning: A*, Dijkstra, greedy                            */
/* ================================================================== */
interface PpS { grid: number[][]; start: [number, number]; goal: [number, number]; frontier: number[]; closed: Set<number>; g: Map<number, number>; parent: Map<number, number>; path: number[]; done: boolean; open: Set<number>; algo: string; expanded: number; drag: number; step: number }
const GW = 24, GH = 14;
function setupPlan(s: PpS, algo: string) { s.algo = algo; s.frontier = [s.start[1] * GW + s.start[0]]; s.closed = new Set(); s.g = new Map([[s.frontier[0], 0]]); s.parent = new Map(); s.path = []; s.done = false; s.open = new Set(s.frontier); s.expanded = 0; }
export const pathPlanning = defineSim<PpS>({
  id: 'grid_path_planning', title: 'Path Planning: A*, Dijkstra and Greedy Best-First on a Grid',
  ...meta('Robotics', PGB, 'Intermediate', 'Motion Planning', 'Search-based Planning', 'A*, Dijkstra, heuristics and optimality'),
  covers: ['A* search', "Dijkstra's algorithm", 'Greedy best-first search', 'Admissible heuristic', 'Occupancy grid planning'],
  tags: ['M.Tech', 'robotics', 'AI', 'GATE', 'navigation', 'shortest path', 'heuristic', 'BFS'],
  learningObjectives: ['See that Dijkstra explores in all directions, A* is guided by the heuristic, greedy ignores path cost.', 'Compare nodes expanded and path length (optimality) for the three algorithms.', 'Draw obstacles and watch the planner react.'],
  assumptions: ['8-connected grid, move cost 1 (straight) and √2 (diagonal); octile heuristic (admissible for A*).'],
  blurb: 'Click cells to paint obstacles and drag the green start / red goal. Run A*, Dijkstra or greedy search and compare how many cells each one has to expand to find a path.',
  hint: 'f = g + h. Dijkstra: h = 0. Greedy: f = h (fast, not optimal). A* with admissible h is optimal. Expanded count shows search effort.',
  params: [
    { kind: 'select', id: 'algo', label: 'Algorithm', value: 'astar', options: [{ value: 'astar', label: 'A*' }, { value: 'dijkstra', label: "Dijkstra" }, { value: 'greedy', label: 'Greedy best-first' }], resetOnChange: true },
    { kind: 'number', id: 'speed', label: 'Expansions per frame', min: 1, max: 30, step: 1, value: 4, digits: 0 },
    { kind: 'select', id: 'tool', label: 'Click tool', value: 'wall', options: [{ value: 'wall', label: 'Toggle wall' }, { value: 'start', label: 'Move start' }, { value: 'goal', label: 'Move goal' }] },
  ],
  actions: [{ id: 'rerun', label: 'Re-run search' }, { id: 'clear', label: 'Clear walls' }, { id: 'maze', label: 'Random walls' }],
  dt: 1 / 30, previewSeconds: 8,
  init(v) { const grid = Array.from({ length: GH }, () => Array(GW).fill(0)); for (let y = 2; y < 11; y++) grid[y][11] = 1; for (let x = 11; x < 18; x++) grid[10][x] = 1; const s = { grid, start: [3, 6] as [number, number], goal: [20, 6] as [number, number], frontier: [], closed: new Set<number>(), g: new Map<number, number>(), parent: new Map<number, number>(), path: [], done: false, open: new Set<number>(), algo: str(v, 'algo'), expanded: 0, drag: 0, step: 0 }; setupPlan(s, str(v, 'algo')); return s; },
  action(s, v, id) { if (id === 'clear') for (const r of s.grid) r.fill(0); if (id === 'maze') for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) s.grid[y][x] = Math.random() < 0.25 ? 1 : 0; s.grid[s.start[1]][s.start[0]] = 0; s.grid[s.goal[1]][s.goal[0]] = 0; setupPlan(s, str(v, 'algo')); },
  pointer(s, v, e) {
    if (e.kind === 'up') return; const cw = e.w / GW, ch = (e.h - 24) / GH, x = Math.floor(e.x / cw), y = Math.floor((e.y - 24) / ch); if (x < 0 || y < 0 || x >= GW || y >= GH) return; const tool = str(v, 'tool');
    if (tool === 'start') { s.start = [x, y]; s.grid[y][x] = 0; } else if (tool === 'goal') { s.goal = [x, y]; s.grid[y][x] = 0; } else if (e.kind === 'down' || (e.kind === 'move' && s.drag !== y * GW + x)) { if (!((x === s.start[0] && y === s.start[1]) || (x === s.goal[0] && y === s.goal[1]))) s.grid[y][x] = s.grid[y][x] ? 0 : 1; s.drag = y * GW + x; }
    setupPlan(s, str(v, 'algo'));
  },
  step(s, v) {
    if (s.algo !== str(v, 'algo')) setupPlan(s, str(v, 'algo')); if (s.done) return;
    const hh = (i: number) => { const x = i % GW, y = Math.floor(i / GW), dx = Math.abs(x - s.goal[0]), dy = Math.abs(y - s.goal[1]); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); }; const gi = s.goal[1] * GW + s.goal[0];
    for (let k = 0; k < num(v, 'speed'); k++) {
      if (!s.frontier.length) { s.done = true; return; }
      let bi = 0, bf = Infinity; s.frontier.forEach((n, i) => { const g = s.g.get(n)!, f = s.algo === 'dijkstra' ? g : s.algo === 'greedy' ? hh(n) : g + hh(n); if (f < bf - 1e-9 || (Math.abs(f - bf) < 1e-9 && hh(n) < hh(s.frontier[bi]))) { bf = f; bi = i; } });
      const cur = s.frontier.splice(bi, 1)[0]; s.open.delete(cur); s.closed.add(cur); s.expanded++;
      if (cur === gi) { const p = [cur]; let q = cur; while (s.parent.has(q)) { q = s.parent.get(q)!; p.push(q); } s.path = p.reverse(); s.done = true; return; }
      const cx = cur % GW, cy = Math.floor(cur / GW);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH || s.grid[ny][nx]) continue; if (dx && dy && (s.grid[cy][nx] || s.grid[ny][cx])) continue; const ni = ny * GW + nx; if (s.closed.has(ni)) continue; const ng = s.g.get(cur)! + (dx && dy ? Math.SQRT2 : 1); if (!s.g.has(ni) || ng < s.g.get(ni)!) { s.g.set(ni, ng); s.parent.set(ni, cur); if (!s.open.has(ni)) { s.open.add(ni); s.frontier.push(ni); } } }
    }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const cw = w / GW, ch = (h - 24) / GH; text(c, `${str(v, 'algo') === 'astar' ? 'A*' : str(v, 'algo') === 'dijkstra' ? 'Dijkstra' : 'Greedy'}: expanded ${s.expanded} cells${s.done ? (s.path.length ? `, path length ${fmt(pathLen(s.path), 1)}` : ', NO PATH') : ' …'}`, 8, 16, C.text, 12, 'left', 'alphabetic', true);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { const i = y * GW + x; c.fillStyle = s.grid[y][x] ? '#334155' : s.closed.has(i) ? 'rgba(96,165,250,0.35)' : s.open.has(i) ? 'rgba(52,211,153,0.35)' : 'rgba(30,41,59,0.55)'; c.fillRect(x * cw + 1, 24 + y * ch + 1, cw - 2, ch - 2); }
    if (s.path.length) polyline(c, s.path.map(i => [(i % GW + 0.5) * cw, 24 + (Math.floor(i / GW) + 0.5) * ch] as [number, number]), C.amber, 3.5);
    circle(c, (s.start[0] + 0.5) * cw, 24 + (s.start[1] + 0.5) * ch, Math.min(cw, ch) * 0.35, C.green, C.white, 1.5); circle(c, (s.goal[0] + 0.5) * cw, 24 + (s.goal[1] + 0.5) * ch, Math.min(cw, ch) * 0.35, C.red, C.white, 1.5);
  },
  readouts(s) { return [{ label: 'Algorithm', value: s.algo === 'astar' ? 'A*' : s.algo === 'dijkstra' ? 'Dijkstra' : 'Greedy' }, { label: 'Cells expanded', value: s.expanded, digits: 0 }, { label: 'Frontier size', value: s.frontier.length, digits: 0 }, { label: 'Path length', value: s.path.length ? pathLen(s.path) : s.done ? 'no path' : 'searching', digits: 2 }, { label: 'Status', value: s.done ? (s.path.length ? 'found' : 'unreachable') : 'searching' }]; },
  equations() { return ['f(n) = g(n) + h(n)', 'h(n) = (dx+dy) + (\\sqrt2 - 2)\\min(dx,dy)']; },
});
function pathLen(p: number[]) { let L = 0; for (let i = 1; i < p.length; i++) { const dx = Math.abs((p[i] % GW) - (p[i - 1] % GW)), dy = Math.abs(Math.floor(p[i] / GW) - Math.floor(p[i - 1] / GW)); L += dx && dy ? Math.SQRT2 : 1; } return L; }

/* ================================================================== */
/*  Kalman filter                                                      */
/* ================================================================== */
interface KfS { t: number; x: number; v: number; xe: number; ve: number; P: [number, number, number, number]; hist: { t: number; x: number; z: number; xe: number; sd: number }[]; se: number; sm: number; n: number }
export const kalman = defineSim<KfS>({
  id: 'kalman_filter', title: 'Kalman Filter: Tracking a Moving Target from Noisy Measurements',
  ...meta('Robotics', PGB, 'Advanced', 'State Estimation', 'Estimation and Filtering', 'Linear Kalman filter, process vs measurement noise'),
  covers: ['Kalman filter', 'Kalman gain', 'Process noise and measurement noise', 'Covariance', 'Sensor fusion'],
  tags: ['M.Tech', 'robotics', 'GATE', 'control', 'estimation', 'GPS', 'constant velocity model', 'tracking'],
  learningObjectives: ['See how the filter balances its prediction and the noisy measurement.', 'Understand the Kalman gain: high when measurements are trusted, low when not.', 'Compare filtered error with raw measurement error.'],
  assumptions: ['1-D constant-velocity target with random acceleration; Gaussian noise; the filter knows the true noise levels unless you mistune R/Q.'],
  blurb: 'A target moves with random accelerations and a sensor reports its position with noise. The Kalman filter (state: position and velocity) smooths the measurements; tune its noise settings and watch the lag/jitter trade-off.',
  hint: 'Predict: x⁻=Fx, P⁻=FPFᵀ+Q. Update: K=P⁻Hᵀ(HP⁻Hᵀ+R)⁻¹, x=x⁻+K(z−Hx⁻), P=(I−KH)P⁻. Large assumed R → smooth but laggy; large assumed Q → trusts measurements, noisy.',
  params: [
    { kind: 'number', id: 'rtrue', label: 'True sensor noise σ', min: 0.1, max: 5, step: 0.1, value: 1.5, digits: 1 },
    { kind: 'number', id: 'qtrue', label: 'True random acceleration σ', min: 0, max: 2, step: 0.05, value: 0.4, digits: 2 },
    { kind: 'number', id: 'rf', label: 'Filter assumed R (σ)', min: 0.1, max: 10, step: 0.1, value: 1.5, digits: 1 },
    { kind: 'number', id: 'qf', label: 'Filter assumed Q (σ acc)', min: 0.01, max: 3, step: 0.01, value: 0.4, digits: 2 },
  ],
  actions: [{ id: 'reset', label: 'Restart' }],
  dt: 1 / 20, previewSeconds: 20,
  init() { return { t: 0, x: 0, v: 1, xe: 0, ve: 0, P: [10, 0, 0, 10], hist: [], se: 0, sm: 0, n: 0 }; },
  action(s) { s.t = 0; s.x = 0; s.v = 1; s.xe = 0; s.ve = 0; s.P = [10, 0, 0, 10]; s.hist = []; s.se = 0; s.sm = 0; s.n = 0; },
  step(s, v, dt) {
    s.v += gauss() * num(v, 'qtrue') * dt * 2 - 0.02 * (s.v - 1) * dt; s.x += s.v * dt; s.t += dt; const z = s.x + gauss() * num(v, 'rtrue');
    const q = num(v, 'qf') ** 2, r = num(v, 'rf') ** 2, [p00, p01, p10, p11] = s.P; const xp = s.xe + s.ve * dt, vp = s.ve;
    const a00 = p00 + dt * (p01 + p10) + dt * dt * p11 + (q * dt ** 4) / 4, a01 = p01 + dt * p11 + (q * dt ** 3) / 2, a10 = p10 + dt * p11 + (q * dt ** 3) / 2, a11 = p11 + q * dt * dt;
    const S = a00 + r, K0 = a00 / S, K1 = a10 / S, y = z - xp; s.xe = xp + K0 * y; s.ve = vp + K1 * y; s.P = [(1 - K0) * a00, (1 - K0) * a01, a10 - K1 * a00, a11 - K1 * a01];
    s.se += (s.xe - s.x) ** 2; s.sm += (z - s.x) ** 2; s.n++; s.hist.push({ t: s.t, x: s.x, z, xe: s.xe, sd: Math.sqrt(Math.max(s.P[0], 0)) }); if (s.hist.length > 400) s.hist.shift();
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const hs = s.hist, t0 = hs.length ? hs[0].t : 0, t1 = Math.max(s.t, t0 + 5), xs = hs.flatMap(q => [q.x, q.z]), lo = Math.min(...xs, 0) - 3, hi = Math.max(...xs, 10) + 3;
    const P = { x: 8, y: 8, w: w - 16, h: h * 0.72 }, m = plot(c, P, [t0, t1], [lo, hi], { title: 'Position: truth, measurements, Kalman estimate (±1σ)', xlabel: 'time (s)' });
    c.beginPath(); hs.forEach((q, i) => { const px = m.X(q.t), py = m.Y(q.xe + q.sd); if (i === 0) c.moveTo(px, py); else c.lineTo(px, py); }); for (let i = hs.length - 1; i >= 0; i--) c.lineTo(m.X(hs[i].t), m.Y(hs[i].xe - hs[i].sd)); c.closePath(); c.fillStyle = 'rgba(52,211,153,0.2)'; c.fill();
    for (const q of hs) circle(c, m.X(q.t), m.Y(q.z), 1.6, 'rgba(248,113,113,0.8)'); polyline(c, hs.map(q => [m.X(q.t), m.Y(q.x)] as [number, number]), C.white, 1.8); polyline(c, hs.map(q => [m.X(q.t), m.Y(q.xe)] as [number, number]), C.green, 2.4);
    const B = { x: 8, y: P.y + P.h + 10, w: w - 16, h: h - P.h - 26 }; panel(c, B); const rm = Math.sqrt(s.sm / Math.max(s.n, 1)), re = Math.sqrt(s.se / Math.max(s.n, 1)), mx = Math.max(rm, re, 0.1);
    text(c, `RMS error — raw measurement ${fmt(rm, 2)}`, B.x + 10, B.y + 18, C.red, 11); c.fillStyle = C.red; c.fillRect(B.x + 10, B.y + 24, (rm / mx) * (B.w - 20), 8); text(c, `Kalman estimate ${fmt(re, 2)}`, B.x + 10, B.y + 50, C.green, 11); c.fillStyle = C.green; c.fillRect(B.x + 10, B.y + 56, (re / mx) * (B.w - 20), 8); void v;
  },
  readouts(s) { const K0 = s.P[0] / (s.P[0] + 1); return [{ label: 'Estimated position', value: s.xe, digits: 2 }, { label: 'Estimated velocity', value: s.ve, digits: 2 }, { label: 'Position std σ', value: Math.sqrt(Math.max(s.P[0], 0)), digits: 2 }, { label: 'RMS error: raw', value: Math.sqrt(s.sm / Math.max(s.n, 1)), digits: 2 }, { label: 'RMS error: Kalman', value: Math.sqrt(s.se / Math.max(s.n, 1)), digits: 2 }, { label: 'Noise reduction', value: s.n ? Math.sqrt(s.sm / s.n) / Math.max(Math.sqrt(s.se / s.n), 1e-9) : 1, unit: '×', digits: 2 }, { label: 'Gain-ish (P/(P+1))', value: K0, digits: 2 }]; },
  equations() { return ['\\hat x^- = F\\hat x,\\quad P^- = FPF^T + Q', 'K = P^-H^T(HP^-H^T+R)^{-1}', '\\hat x = \\hat x^- + K(z - H\\hat x^-)']; },
});

/* ================================================================== */
/*  RRT                                                                */
/* ================================================================== */
interface RrS { nodes: { x: number; y: number; p: number }[]; obs: { x: number; y: number; r: number }[]; goal: [number, number]; start: [number, number]; path: number[]; found: boolean; iter: number }
const segFree = (a: [number, number], b: [number, number], obs: { x: number; y: number; r: number }[]) => { for (const o of obs) { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9, t = clamp(((o.x - a[0]) * dx + (o.y - a[1]) * dy) / L2, 0, 1), px = a[0] + t * dx - o.x, py = a[1] + t * dy - o.y; if (px * px + py * py < o.r * o.r) return false; } return true; };
export const rrt = defineSim<RrS>({
  id: 'rrt_planner', title: 'RRT / RRT*-style Sampling-Based Motion Planning',
  ...meta('Robotics', PGB, 'Advanced', 'Motion Planning', 'Sampling-based Planning', 'Rapidly-exploring Random Trees and goal bias'),
  covers: ['RRT', 'Sampling-based planning', 'Goal bias', 'Step size', 'Probabilistic completeness', 'Path shortcutting'],
  tags: ['M.Tech', 'robotics', 'configuration space', 'obstacle avoidance', 'random tree', 'PRM'],
  learningObjectives: ['See how RRT grows by sampling a random point and extending the nearest node toward it.', 'Understand goal bias and step size trade-offs.', 'Compare the raw tree path with the shortcut-smoothed path.'],
  assumptions: ['Point robot in a 2-D world with circular obstacles; straight-line edges; plain RRT (no rewiring) plus an optional shortcut smoothing pass.'],
  blurb: 'The tree explores a cluttered 2-D world from the green start to the red goal. Click to add obstacles, change the step size and goal bias, and see how quickly (or whether) a path is found.',
  hint: 'Loop: sample q_rand (goal with probability p), find nearest tree node, step toward it by δ if the edge is collision-free. Stop when within goal radius. Small δ = reliable but slow; large goal bias = fast in open space, can get stuck behind obstacles.',
  params: [
    { kind: 'number', id: 'step', label: 'Step size δ', min: 10, max: 80, step: 1, value: 28, unit: 'px', digits: 0 },
    { kind: 'number', id: 'bias', label: 'Goal bias', min: 0, max: 0.5, step: 0.01, value: 0.08, digits: 2 },
    { kind: 'number', id: 'rate', label: 'Samples per frame', min: 1, max: 40, step: 1, value: 6, digits: 0 },
    { kind: 'toggle', id: 'smooth', label: 'Shortcut-smooth the path', value: true },
  ],
  actions: [{ id: 'restart', label: 'Restart tree' }, { id: 'clearobs', label: 'Clear obstacles' }],
  dt: 1 / 30, previewSeconds: 6,
  init() { return { start: [40, 220], goal: [620, 120], nodes: [{ x: 40, y: 220, p: -1 }], obs: [{ x: 250, y: 180, r: 55 }, { x: 330, y: 80, r: 45 }, { x: 420, y: 250, r: 60 }, { x: 500, y: 130, r: 40 }, { x: 180, y: 70, r: 35 }], path: [], found: false, iter: 0 }; },
  action(s, _v, id) { if (id === 'clearobs') s.obs = []; s.nodes = [{ x: s.start[0], y: s.start[1], p: -1 }]; s.path = []; s.found = false; s.iter = 0; },
  pointer(s, _v, e) { if (e.kind === 'down') { const sx = 700 / e.w, sy = 440 / e.h; s.obs.push({ x: e.x * sx * (e.w / 700), y: e.y * sy * (e.h / 440), r: 30 }); s.nodes = [{ x: s.start[0], y: s.start[1], p: -1 }]; s.path = []; s.found = false; } },
  step(s, v) {
    if (s.found) return;
    for (let k = 0; k < num(v, 'rate'); k++) {
      s.iter++; const q: [number, number] = Math.random() < num(v, 'bias') ? s.goal : [rnd(0, 700), rnd(0, 440)]; let bi = 0, bd = Infinity; s.nodes.forEach((n, i) => { const d = (n.x - q[0]) ** 2 + (n.y - q[1]) ** 2; if (d < bd) { bd = d; bi = i; } });
      const n = s.nodes[bi], d = Math.sqrt(bd) || 1, st = Math.min(num(v, 'step'), d), nx: [number, number] = [n.x + ((q[0] - n.x) / d) * st, n.y + ((q[1] - n.y) / d) * st];
      if (nx[0] < 0 || nx[0] > 700 || nx[1] < 0 || nx[1] > 440 || !segFree([n.x, n.y], nx, s.obs)) continue; s.nodes.push({ x: nx[0], y: nx[1], p: bi });
      if (Math.hypot(nx[0] - s.goal[0], nx[1] - s.goal[1]) < 22 && segFree(nx, s.goal, s.obs)) { s.nodes.push({ x: s.goal[0], y: s.goal[1], p: s.nodes.length - 1 }); let i = s.nodes.length - 1; const p: number[] = []; while (i >= 0) { p.push(i); i = s.nodes[i].p; } s.path = p.reverse(); s.found = true; return; }
    }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const sx = w / 700, sy = h / 440, T = (x: number, y: number): [number, number] => [x * sx, y * sy];
    for (const o of s.obs) { const [x, y] = T(o.x, o.y); circle(c, x, y, o.r * Math.min(sx, sy), '#334155', C.dim, 1.5); }
    c.strokeStyle = 'rgba(96,165,250,0.45)'; c.lineWidth = 1; c.beginPath(); for (const n of s.nodes) if (n.p >= 0) { const a = T(n.x, n.y), b = T(s.nodes[n.p].x, s.nodes[n.p].y); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); } c.stroke();
    if (s.found) { let pts = s.path.map(i => [s.nodes[i].x, s.nodes[i].y] as [number, number]); polyline(c, pts.map(p => T(...p)), 'rgba(251,191,36,0.5)', 2, [4, 3]); if (bool(v, 'smooth')) { pts = smooth(pts, s.obs); polyline(c, pts.map(p => T(...p)), C.amber, 3.5); } }
    circle(c, ...T(...s.start), 7, C.green, C.white, 1.5); circle(c, ...T(...s.goal), 7, C.red, C.white, 1.5); circle(c, ...T(...s.goal), 22 * sx, undefined, 'rgba(248,113,113,0.5)', 1);
    text(c, `${s.nodes.length} nodes, ${s.iter} samples${s.found ? ' - path found' : ' - searching'}`, 8, 16, C.text, 12, 'left', 'alphabetic', true);
  },
  readouts(s, v) { const raw = s.path.map(i => [s.nodes[i].x, s.nodes[i].y] as [number, number]), len = (p: [number, number][]) => p.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0); const sm = raw.length ? smooth(raw, s.obs) : []; return [{ label: 'Tree nodes', value: s.nodes.length, digits: 0 }, { label: 'Samples drawn', value: s.iter, digits: 0 }, { label: 'Found', value: s.found ? 'yes' : 'not yet' }, { label: 'Raw path length', value: raw.length ? len(raw) : '-', unit: raw.length ? 'px' : '', digits: 0 }, { label: bool(v, 'smooth') ? 'Smoothed length' : 'Straight-line distance', value: raw.length && bool(v, 'smooth') ? len(sm) : Math.hypot(s.goal[0] - s.start[0], s.goal[1] - s.start[1]), unit: 'px', digits: 0 }]; },
  equations(_s, v) { return ['q_{new} = q_{near} + \\delta\\,\\dfrac{q_{rand}-q_{near}}{\\lVert q_{rand}-q_{near}\\rVert}', `\\delta = ${num(v, 'step')}\\ \\text{px},\\ p_{goal} = ${fmt(num(v, 'bias'), 2)}`]; },
});
function smooth(p: [number, number][], obs: { x: number; y: number; r: number }[]) { const out: [number, number][] = [p[0]]; let i = 0; while (i < p.length - 1) { let j = p.length - 1; while (j > i + 1 && !segFree(p[i], p[j], obs)) j--; out.push(p[j]); i = j; } return out; }

/* ================================================================== */
/*  Inverted pendulum on a cart                                        */
/* ================================================================== */
interface IpS { x: number; v: number; th: number; w: number; t: number; fell: boolean; u: number; hist: { t: number; th: number }[] }
export const cartpole = defineSim<IpS>({
  id: 'inverted_pendulum_cart', title: 'Inverted Pendulum on a Cart: State-Feedback Balancing',
  ...meta('Robotics', PGB, 'Advanced', 'Control of Robots', 'Nonlinear Systems and Stabilisation', 'Unstable equilibrium, state feedback, disturbance rejection'),
  covers: ['Inverted pendulum', 'State feedback', 'Unstable equilibrium', 'Disturbance rejection', 'Balancing robot', 'Nonlinear dynamics'],
  tags: ['M.Tech', 'robotics', 'control', 'LQR', 'Segway', 'cart-pole', 'stabilisation', 'GATE'],
  learningObjectives: ['See that the upright position is unstable and needs feedback.', 'Tune position and angle gains; find the minimum angle gain that balances.', 'Test robustness by pushing the pole.'],
  assumptions: ['Frictionless cart, massless rod with point mass, full nonlinear equations simulated; force limited to ±40 N.'],
  blurb: 'A cart must balance a pole that wants to fall over. State feedback u = −(kx x + kv v + kθ θ + kω ω) acts on the cart; click to push the pole and test the controller.',
  hint: 'Nonlinear cart-pole dynamics. Feedback must push the cart under the falling pole: kθ and kω must be large enough (negative-feedback sign chosen so that positive θ moves the cart toward the lean). Too aggressive → force saturation / oscillation.',
  params: [
    { kind: 'number', id: 'kth', label: 'Angle gain kθ', min: 0, max: 150, step: 1, value: 60, digits: 0 },
    { kind: 'number', id: 'kw', label: 'Angular-rate gain kω', min: 0, max: 40, step: 0.5, value: 12, digits: 1 },
    { kind: 'number', id: 'kx', label: 'Position gain kx', min: 0, max: 20, step: 0.5, value: 3, digits: 1 },
    { kind: 'number', id: 'kv', label: 'Velocity gain kv', min: 0, max: 20, step: 0.5, value: 5, digits: 1 },
    { kind: 'number', id: 'L', label: 'Pole length', min: 0.3, max: 1.5, step: 0.05, value: 0.8, unit: 'm', digits: 2 },
  ],
  actions: [{ id: 'push', label: 'Push pole' }, { id: 'reset', label: 'Reset' }],
  dt: 1 / 500, previewSeconds: 4,
  init() { return { x: 0, v: 0, th: 0.1, w: 0, t: 0, fell: false, u: 0, hist: [] }; },
  action(s, _v, id) { if (id === 'push') s.w += 1.2; else { s.x = 0; s.v = 0; s.th = 0.1; s.w = 0; s.fell = false; s.t = 0; s.hist = []; } },
  pointer(s, _v, e) { if (e.kind === 'down') s.w += e.x > e.w / 2 ? 1.2 : -1.2; },
  step(s, v, dt) {
    if (s.fell) return; const Mc = 1, m = 0.2, L = num(v, 'L'), g = 9.81;
    const u = clamp(num(v, 'kth') * s.th + num(v, 'kw') * s.w + num(v, 'kx') * s.x + num(v, 'kv') * s.v, -40, 40); s.u = u;
    const sn = Math.sin(s.th), cs = Math.cos(s.th), den = Mc + m * sn * sn;
    const acc = (u + m * sn * (L * s.w * s.w - g * cs)) / den, ang = (-u * cs - m * L * s.w * s.w * sn * cs + (Mc + m) * g * sn) / (L * den);
    s.v += acc * dt; s.x += s.v * dt; s.w += ang * dt; s.th += s.w * dt; s.t += dt; s.x = clamp(s.x, -3.5, 3.5); if (Math.abs(s.x) >= 3.5) s.v = 0;
    if (Math.abs(s.th) > 1.2) s.fell = true; if (Math.round(s.t / dt) % 10 === 0) { s.hist.push({ t: s.t, th: s.th }); if (s.hist.length > 400) s.hist.shift(); }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const L = num(v, 'L'), gy = h * 0.58, sc = w / 8; const cx = w / 2 + s.x * sc;
    line(c, 10, gy + 14, w - 10, gy + 14, C.axis, 2); line(c, w / 2, gy + 10, w / 2, gy + 20, C.dim, 1); c.fillStyle = C.blue; c.fillRect(cx - 28, gy - 10, 56, 24); circle(c, cx - 16, gy + 16, 6, '#0f172a', C.dim, 1.5); circle(c, cx + 16, gy + 16, 6, '#0f172a', C.dim, 1.5);
    const px = cx + Math.sin(s.th) * L * sc * 1.1, py = gy - 10 - Math.cos(s.th) * L * sc * 1.1; line(c, cx, gy - 10, px, py, s.fell ? C.red : C.amber, 5); circle(c, px, py, 9, s.fell ? C.red : C.pink, C.white, 1.5);
    arrow(c, cx, gy + 38, cx + clamp(s.u, -40, 40) * 1.5, gy + 38, C.green, 3, 8); text(c, 'cart force u', cx, gy + 54, C.dim, 10, 'center');
    const G = { x: 8, y: 8, w: w - 16, h: h * 0.28 }; const m = plot(c, G, [Math.max(0, s.t - 6), Math.max(6, s.t)], [-1.3, 1.3], { title: 'Pole angle θ (rad)', zeroAxis: true, ystep: 0.5 }); polyline(c, s.hist.map(q => [m.X(q.t), m.Y(clamp(q.th, -1.3, 1.3))] as [number, number]), C.cyan, 2);
    if (s.fell) text(c, 'THE POLE FELL — increase kθ / kω or press Reset', w / 2, h - 14, C.red, 13, 'center', 'alphabetic', true); else text(c, 'click left/right half to push the pole', w / 2, h - 10, C.dim, 10, 'center');
  },
  readouts(s) { return [{ label: 'Angle θ', value: deg(s.th), unit: '°', digits: 1 }, { label: 'Angular rate', value: s.w, unit: 'rad/s', digits: 2 }, { label: 'Cart position', value: s.x, unit: 'm', digits: 2 }, { label: 'Cart force', value: s.u, unit: 'N', digits: 1 }, { label: 'Time balanced', value: s.t, unit: 's', digits: 1 }, { label: 'State', value: s.fell ? 'fell' : 'balancing' }]; },
  equations(_s, v) { return ['u = k_\\theta\\theta + k_\\omega\\dot\\theta + k_x x + k_v \\dot x', `(M+m\\sin^2\\theta)\\ddot x = u + m\\sin\\theta\\,(L\\dot\\theta^2 - g\\cos\\theta)`, `k_\\theta = ${num(v, 'kth')},\\ k_\\omega = ${fmt(num(v, 'kw'), 1)}`]; },
});

/* ================================================================== */
/*  Neural network decision boundary                                   */
/* ================================================================== */
interface NnS { X: [number, number][]; y: number[]; W1: number[][]; b1: number[]; W2: number[]; b2: number; loss: number[]; epoch: number; key: string; grid: Float32Array | null; gAcc: number }
const makeData = (kind: string, n = 160) => { const X: [number, number][] = [], y: number[] = []; for (let i = 0; i < n; i++) { const c = i % 2; let p: [number, number];
  if (kind === 'moons') { const a = Math.random() * Math.PI; p = c ? [1 - Math.cos(a), 0.5 - Math.sin(a)] : [Math.cos(a), Math.sin(a)]; p = [(p[0] - 0.5) * 1.8, (p[1] - 0.25) * 2.2]; }
  else if (kind === 'circles') { const a = Math.random() * TAU, r = c ? 0.45 : 1; p = [Math.cos(a) * r, Math.sin(a) * r]; }
  else if (kind === 'xor') { p = [rnd(-1, 1), rnd(-1, 1)]; y.push(p[0] * p[1] > 0 ? 1 : 0); X.push([p[0] + gauss() * 0.04, p[1] + gauss() * 0.04]); continue; }
  else { const r = Math.random() * 0.95 + 0.05, a = r * 3.2 * 1.9 + (c ? Math.PI : 0); p = [r * Math.cos(a), r * Math.sin(a)]; }
  X.push([p[0] + gauss() * 0.06, p[1] + gauss() * 0.06]); y.push(c); } return { X, y }; };
export const mlp = defineSim<NnS>({
  id: 'mlp_decision_boundary', title: 'Neural Network Training: Decision Boundary Evolving Live',
  ...meta('Computer Science', PGB, 'Intermediate', 'Machine Learning', 'Neural Networks', 'Backpropagation, hidden units and non-linear classification'),
  covers: ['Multilayer perceptron', 'Backpropagation', 'Decision boundary', 'Learning rate', 'Overfitting and capacity', 'Non-linear separability'],
  tags: ['M.Tech', 'AI', 'ML', 'deep learning', 'XOR', 'spiral dataset', 'tanh', 'gradient descent'],
  learningObjectives: ['See that a single neuron cannot separate XOR / circles but a hidden layer can.', 'Watch the boundary bend as the loss falls.', 'Explore how hidden units and learning rate change convergence.'],
  assumptions: ['One hidden layer with tanh units and a sigmoid output; full-batch gradient descent on 160 points; no validation split.'],
  blurb: 'A small neural network learns to separate two classes of 2-D points. The colour map shows its decision boundary changing as gradient descent runs; change the data set, hidden units and learning rate.',
  hint: 'Forward: h=tanh(W1x+b1), p=σ(w2·h+b2). Loss = binary cross-entropy. Backprop computes gradients and the weights move opposite to them. With 1-2 hidden units XOR/circles fail; spirals need ~8+.',
  params: [
    { kind: 'select', id: 'data', label: 'Dataset', value: 'circles', options: [{ value: 'circles', label: 'Circles' }, { value: 'xor', label: 'XOR' }, { value: 'moons', label: 'Moons' }, { value: 'spiral', label: 'Spiral' }] },
    { kind: 'number', id: 'hid', label: 'Hidden units', min: 1, max: 16, step: 1, value: 6, digits: 0 },
    { kind: 'number', id: 'lr', label: 'Learning rate', min: 0.01, max: 1.5, step: 0.01, value: 0.3, digits: 2 },
    { kind: 'number', id: 'spf', label: 'Epochs per frame', min: 1, max: 40, step: 1, value: 4, digits: 0 },
  ],
  actions: [{ id: 'reinit', label: 'Re-initialise weights' }],
  dt: 1 / 30, previewSeconds: 8,
  init(v) { const { X, y } = makeData(str(v, 'data')), H = num(v, 'hid'); return { X, y, W1: Array.from({ length: H }, () => [gauss() * 0.7, gauss() * 0.7]), b1: Array(H).fill(0), W2: Array.from({ length: H }, () => gauss() * 0.7), b2: 0, loss: [], epoch: 0, key: `${str(v, 'data')}${H}`, grid: null, gAcc: 0 }; },
  action(s, v) { const H = num(v, 'hid'); s.W1 = Array.from({ length: H }, () => [gauss() * 0.7, gauss() * 0.7]); s.b1 = Array(H).fill(0); s.W2 = Array.from({ length: H }, () => gauss() * 0.7); s.b2 = 0; s.loss = []; s.epoch = 0; },
  step(s, v) {
    const H = num(v, 'hid'), key = `${str(v, 'data')}${H}`; if (key !== s.key) { const { X, y } = makeData(str(v, 'data')); s.X = X; s.y = y; s.W1 = Array.from({ length: H }, () => [gauss() * 0.7, gauss() * 0.7]); s.b1 = Array(H).fill(0); s.W2 = Array.from({ length: H }, () => gauss() * 0.7); s.b2 = 0; s.loss = []; s.epoch = 0; s.key = key; }
    const lr = num(v, 'lr'), N = s.X.length;
    for (let e = 0; e < num(v, 'spf'); e++) {
      const gW1 = s.W1.map(() => [0, 0]), gb1 = Array(H).fill(0), gW2 = Array(H).fill(0); let gb2 = 0, L = 0;
      for (let i = 0; i < N; i++) { const [x1, x2] = s.X[i], h = s.W1.map((w, j) => Math.tanh(w[0] * x1 + w[1] * x2 + s.b1[j])); const z = h.reduce((a, q, j) => a + q * s.W2[j], s.b2), p = 1 / (1 + Math.exp(-z)); L += -(s.y[i] * Math.log(p + 1e-9) + (1 - s.y[i]) * Math.log(1 - p + 1e-9)); const dz = p - s.y[i]; gb2 += dz; for (let j = 0; j < H; j++) { gW2[j] += dz * h[j]; const dh = dz * s.W2[j] * (1 - h[j] * h[j]); gW1[j][0] += dh * x1; gW1[j][1] += dh * x2; gb1[j] += dh; } }
      for (let j = 0; j < H; j++) { s.W1[j][0] -= (lr * gW1[j][0]) / N * 4; s.W1[j][1] -= (lr * gW1[j][1]) / N * 4; s.b1[j] -= (lr * gb1[j]) / N * 4; s.W2[j] -= (lr * gW2[j]) / N * 4; } s.b2 -= (lr * gb2) / N * 4; s.epoch++; if (s.epoch % 2 === 0) { s.loss.push(L / N); if (s.loss.length > 300) s.loss.shift(); }
    }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const H = num(v, 'hid'), P = { x: 8, y: 8, w: Math.min(h - 16, w * 0.62), h: h - 16 }, g = 28, cell = P.w / g;
    for (let iy = 0; iy < g; iy++) for (let ix = 0; ix < g; ix++) { const x1 = -1.6 + (ix + 0.5) / g * 3.2, x2 = 1.6 - (iy + 0.5) / g * 3.2, z = s.W1.reduce((a, wv, j) => a + s.W2[j] * Math.tanh(wv[0] * x1 + wv[1] * x2 + s.b1[j]), s.b2), p = 1 / (1 + Math.exp(-z)); c.fillStyle = `rgba(${Math.round(248 * (1 - p) + 52 * p)},${Math.round(113 * (1 - p) + 211 * p)},${Math.round(113 * (1 - p) + 153 * p)},0.45)`; c.fillRect(P.x + ix * cell, P.y + iy * cell * (P.h / P.w), cell + 1, cell * (P.h / P.w) + 1); }
    for (let i = 0; i < s.X.length; i++) circle(c, P.x + ((s.X[i][0] + 1.6) / 3.2) * P.w, P.y + ((1.6 - s.X[i][1]) / 3.2) * P.h, 3.4, s.y[i] ? C.green : C.red, C.white, 0.8);
    const G = { x: P.x + P.w + 10, y: 8, w: w - P.w - 26, h: h * 0.5 }; const m = plot(c, G, [Math.max(0, s.loss.length - 150), Math.max(s.loss.length, 20)], [0, Math.max(0.8, ...s.loss)], { title: 'Training loss', xlabel: 'epoch / 2', ystep: 0.25 }); polyline(c, s.loss.map((l, i) => [m.X(i), m.Y(l)] as [number, number]), C.amber, 2);
    const acc = s.X.filter((p, i) => { const z = s.W1.reduce((a, wv, j) => a + s.W2[j] * Math.tanh(wv[0] * p[0] + wv[1] * p[1] + s.b1[j]), s.b2); return (z > 0 ? 1 : 0) === s.y[i]; }).length / s.X.length; text(c, `accuracy ${fmt(acc * 100, 0)} %`, G.x, G.y + G.h + 22, acc > 0.95 ? C.green : C.amber, 13, 'left', 'alphabetic', true); text(c, `epochs ${s.epoch}, hidden units ${H}`, G.x, G.y + G.h + 42, C.dim, 11);
  },
  readouts(s, v) { const acc = s.X.filter((p, i) => { const z = s.W1.reduce((a, wv, j) => a + s.W2[j] * Math.tanh(wv[0] * p[0] + wv[1] * p[1] + s.b1[j]), s.b2); return (z > 0 ? 1 : 0) === s.y[i]; }).length / s.X.length; const H = num(v, 'hid'); return [{ label: 'Epoch', value: s.epoch, digits: 0 }, { label: 'Loss', value: s.loss.length ? s.loss[s.loss.length - 1] : NaN, digits: 4 }, { label: 'Accuracy', value: acc * 100, unit: '%', digits: 1 }, { label: 'Parameters', value: H * 4 + 1, digits: 0 }]; },
  equations() { return ['h = \\tanh(W_1\\mathbf x + \\mathbf b_1),\\quad p = \\sigma(\\mathbf w_2\\!\\cdot\\!\\mathbf h + b_2)', 'L = -\\dfrac1N\\sum y\\ln p + (1-y)\\ln(1-p)', 'W \\leftarrow W - \\eta\\,\\dfrac{\\partial L}{\\partial W}']; },
});

/* ================================================================== */
/*  Convolution filters                                                */
/* ================================================================== */
interface CvS { t: number }
const IMG = (() => { const n = 12, im = Array.from({ length: n }, () => Array(n).fill(0)); for (let y = 2; y < 10; y++) for (let x = 2; x < 10; x++) im[y][x] = 0.25; for (let x = 2; x < 10; x++) { im[2][x] = 1; } for (let y = 2; y < 10; y++) im[y][9] = 1; for (let i = 0; i < 8; i++) { const x = 8 - Math.floor(i * 0.55), y = 3 + i; if (x >= 0 && x < n && y < n) im[y][x] = 1; } return im; })();
const KERNELS: Record<string, { n: string; k: number[][] }> = { vert: { n: 'Vertical edge (Sobel x)', k: [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]] }, horiz: { n: 'Horizontal edge (Sobel y)', k: [[-1, -2, -1], [0, 0, 0], [1, 2, 1]] }, blur: { n: 'Box blur', k: [[1 / 9, 1 / 9, 1 / 9], [1 / 9, 1 / 9, 1 / 9], [1 / 9, 1 / 9, 1 / 9]] }, sharp: { n: 'Sharpen', k: [[0, -1, 0], [-1, 5, -1], [0, -1, 0]] }, diag: { n: 'Diagonal (learned-like)', k: [[2, 1, 0], [1, 0, -1], [0, -1, -2]] } };
function conv(k: number[][], stride: number) { const out: number[][] = []; for (let y = 0; y + 2 < 12; y += stride) { const r: number[] = []; for (let x = 0; x + 2 < 12; x += stride) { let a = 0; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) a += IMG[y + i][x + j] * k[i][j]; r.push(a); } out.push(r); } return out; }
export const convolution = defineSim<CvS>({
  id: 'cnn_convolution', title: 'Convolutional Neural Networks: Kernels, Feature Maps, ReLU & Pooling',
  ...meta('Computer Science', PGB, 'Intermediate', 'Machine Learning', 'Convolutional Neural Networks', 'Convolution, stride, activation and pooling'),
  covers: ['Convolution', 'Kernel / filter', 'Feature map', 'Stride', 'ReLU', 'Max pooling', 'Edge detection'],
  tags: ['M.Tech', 'AI', 'deep learning', 'computer vision', 'Sobel', 'CNN', 'image processing'],
  learningObjectives: ['See a 3×3 kernel slide over an image and produce a feature map.', 'Compare edge, blur and sharpen kernels and what they detect.', 'Understand ReLU and max-pooling shrinking the map while keeping strong responses.'],
  assumptions: ['Single 12×12 grey-scale image, one filter, valid convolution (no padding).'],
  blurb: 'Pick a 3×3 kernel and watch it slide across a small image. The feature map shows where the pattern matches; ReLU and max-pooling then keep only the strongest responses.',
  hint: 'Output(y,x) = Σ kernel(i,j)·image(y+i, x+j). Sobel kernels respond to edges, blur averages, sharpen boosts differences. ReLU = max(0,·). Max pool 2×2 halves the size.',
  params: [
    { kind: 'select', id: 'k', label: 'Kernel', value: 'vert', options: Object.entries(KERNELS).map(([k, o]) => ({ value: k, label: o.n })) },
    { kind: 'number', id: 'stride', label: 'Stride', min: 1, max: 3, step: 1, value: 1, digits: 0 },
    { kind: 'toggle', id: 'relu', label: 'Apply ReLU', value: true },
    { kind: 'toggle', id: 'pool', label: 'Max-pool 2×2', value: true },
  ],
  dt: 1 / 20, previewSeconds: 2, init() { return { t: 0 }; }, step(s, _v, dt) { s.t += dt; },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const K = KERNELS[str(v, 'k')].k, st = num(v, 'stride'); let fm = conv(K, st); if (bool(v, 'relu')) fm = fm.map(r => r.map(x => Math.max(0, x))); let pooled: number[][] = []; if (bool(v, 'pool')) for (let y = 0; y + 1 < fm.length; y += 2) { const r: number[] = []; for (let x = 0; x + 1 < fm[0].length; x += 2) r.push(Math.max(fm[y][x], fm[y][x + 1], fm[y + 1][x], fm[y + 1][x + 1])); pooled.push(r); }
    const draw = (m: number[][], x0: number, y0: number, size: number, title: string, hl?: [number, number, number]) => { const n = m.length, cw = size / Math.max(n, m[0]?.length ?? 1); const mx = Math.max(...m.flat().map(Math.abs), 0.001); text(c, title, x0, y0 - 6, C.dim, 10); m.forEach((r, y) => r.forEach((val, x) => { const t = val / mx; c.fillStyle = t >= 0 ? `rgba(34,211,238,${Math.min(1, t)})` : `rgba(248,113,113,${Math.min(1, -t)})`; c.fillRect(x0 + x * cw, y0 + y * cw, cw - 1, cw - 1); })); c.strokeStyle = C.axis; c.strokeRect(x0, y0, cw * (m[0]?.length ?? 0), cw * n); if (hl) { c.strokeStyle = C.amber; c.lineWidth = 2; c.strokeRect(x0 + hl[0] * cw, y0 + hl[1] * cw, hl[2] * cw, hl[2] * cw); c.lineWidth = 1; } };
    const sz = Math.min(w * 0.27, h * 0.5), oy = 30; const nOut = fm.length * fm[0].length, idx = Math.floor(s.t * 6) % nOut, oxp = idx % fm[0].length, oyp = Math.floor(idx / fm[0].length);
    draw(IMG, 10, oy, sz, 'input image 12×12', [oxp * st, oyp * st, 3]); draw(fm, 10 + sz + 20, oy, sz * (fm.length / 12) * 1.2 > sz ? sz : sz * Math.max(fm.length / 10, 0.5), `feature map ${fm.length}×${fm[0].length}`, [oxp, oyp, 1]);
    if (pooled.length) draw(pooled, 10 + 2 * sz + 40, oy, sz * 0.6, `pooled ${pooled.length}×${pooled[0].length}`);
    const kx = 10, ky = oy + sz + 36, kw = 36; text(c, 'kernel', kx, ky - 6, C.dim, 10); K.forEach((r, y) => r.forEach((val, x) => { c.fillStyle = val >= 0 ? `rgba(34,211,238,${Math.min(1, Math.abs(val) / 2 + 0.1)})` : `rgba(248,113,113,${Math.min(1, Math.abs(val) / 2 + 0.1)})`; c.fillRect(kx + x * kw, ky + y * kw, kw - 2, kw - 2); text(c, fmt(val, Math.abs(val) < 1 && val !== 0 ? 2 : 0), kx + x * kw + kw / 2, ky + y * kw + kw / 2 + 4, C.white, 10, 'center'); }));
    let a = 0; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) a += IMG[oyp * st + i][oxp * st + j] * K[i][j]; text(c, `value at highlighted window = ${fmt(a, 2)}`, kx + 3 * kw + 16, ky + 40, C.amber, 12, 'left', 'alphabetic', true);
  },
  readouts(_s, v) { const fm = conv(KERNELS[str(v, 'k')].k, num(v, 'stride')), flat = fm.flat(); return [{ label: 'Feature map size', value: `${fm.length} × ${fm[0].length}` }, { label: 'Strongest response', value: Math.max(...flat), digits: 2 }, { label: 'Weakest response', value: Math.min(...flat), digits: 2 }, { label: 'Kernel sum', value: KERNELS[str(v, 'k')].k.flat().reduce((a, b) => a + b, 0), digits: 2 }, { label: 'Parameters (1 filter)', value: 9, digits: 0 }]; },
  equations() { return ['(I * K)(y,x) = \\sum_{i,j} K(i,j)\\,I(y+i,\\,x+j)', '\\text{ReLU}(z) = \\max(0, z)']; },
});

export const PG_ROBOTICS_AI_SIMS = [jacobian3, trajectory, pathPlanning, kalman, rrt, cartpole, mlp, convolution];
void arrow;
