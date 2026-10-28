import { defineSim, num, str, bool } from './types';
import { C, clamp, fmt, line, plot, polyline, text, circle, roundRect } from './draw';
import { meta, mulberry, ticks, hex, fnv } from './univ_util';

/* ============================ Red-Black tree ============================ */
interface RB { k: number; red: boolean; l: RB | null; r: RB | null; p: RB | null }
interface RBS { root: RB | null; n: number; queue: number[]; rot: number; rec: number; acc: { a: number }; msg: string; rng: () => number; used: Set<number> }
function rotL(s: RBS, x: RB) { const y = x.r!; x.r = y.l; if (y.l) y.l.p = x; y.p = x.p; if (!x.p) s.root = y; else if (x === x.p.l) x.p.l = y; else x.p.r = y; y.l = x; x.p = y; s.rot++; }
function rotR(s: RBS, x: RB) { const y = x.l!; x.l = y.r; if (y.r) y.r.p = x; y.p = x.p; if (!x.p) s.root = y; else if (x === x.p.r) x.p.r = y; else x.p.l = y; y.r = x; x.p = y; s.rot++; }
function rbInsert(s: RBS, k: number) {
  if (s.used.has(k)) return; s.used.add(k);
  const z: RB = { k, red: true, l: null, r: null, p: null }; let y: RB | null = null, x = s.root;
  while (x) { y = x; x = k < x.k ? x.l : x.r; }
  z.p = y; if (!y) s.root = z; else if (k < y.k) y.l = z; else y.r = z; s.n++;
  let cur = z; const before = s.rot; let case1 = 0;
  while (cur.p && cur.p.red) {
    const g = cur.p.p!;
    if (cur.p === g.l) {
      const u = g.r;
      if (u && u.red) { cur.p.red = false; u.red = false; g.red = true; cur = g; s.rec += 3; case1++; }
      else { if (cur === cur.p.r) { cur = cur.p; rotL(s, cur); } cur.p!.red = false; cur.p!.p!.red = true; rotR(s, cur.p!.p!); s.rec += 2; }
    } else {
      const u = g.l;
      if (u && u.red) { cur.p.red = false; u.red = false; g.red = true; cur = g; s.rec += 3; case1++; }
      else { if (cur === cur.p.l) { cur = cur.p; rotR(s, cur); } cur.p!.red = false; cur.p!.p!.red = true; rotL(s, cur.p!.p!); s.rec += 2; }
    }
  }
  s.root!.red = false;
  s.msg = `Inserted ${k}: ${case1 ? `recoloured ${case1}× (uncle red)` : ''}${case1 && s.rot > before ? ', ' : ''}${s.rot > before ? `${s.rot - before} rotation(s)` : ''}${!case1 && s.rot === before ? 'no fix-up needed' : ''}.`;
}
function rbInfo(root: RB | null) {
  let h = 0, bh = -1, ok = true; if (root && root.red) ok = false;
  const walk = (n: RB | null, d: number, b: number): number => { if (!n) { h = Math.max(h, d); return b + 1; } if (n.red && ((n.l && n.l.red) || (n.r && n.r.red))) ok = false; const nb = b + (n.red ? 0 : 1); const l = walk(n.l, d + 1, nb), r = walk(n.r, d + 1, nb); if (l !== r) ok = false; return l; };
  bh = walk(root, 0, 0); return { height: h, bh, ok };
}
function rbQueue(order: string, n: number, rng: () => number) {
  const keys = Array.from({ length: n }, (_, i) => i + 1);
  if (order === 'asc') return keys; if (order === 'desc') return keys.reverse();
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [keys[i], keys[j]] = [keys[j], keys[i]]; } return keys;
}
export const redBlackTree = defineSim<RBS>({
  id: 'red_black_tree_rebalancing', title: 'Red-Black Tree: Insertion, Recolouring & Rotations',
  ...meta('Computer Science', 'Intermediate', 'Data Structures & Algorithms', 'Balanced Search Trees', 'Red-black invariants, recolouring, left/right rotations, O(log n) height'),
  covers: ['Red-black tree', 'Balanced binary search tree', 'Tree rotation', 'Binary search tree', 'Data structures'],
  tags: ['DSA', 'GATE CS', 'AVL vs red-black', 'self-balancing', 'CLRS', 'std::map'],
  learningObjectives: ['Watch the five red-black invariants being restored after every insertion.', 'Tell the recolouring case (red uncle) from the rotation cases (black uncle).', 'See that inserting sorted keys still gives height ≤ 2·log₂(n+1).'],
  assumptions: ['Insertion only (deletion fix-up is not shown); distinct integer keys; CLRS insertion algorithm.'],
  blurb: 'Insert keys one by one into a red-black tree. Recolourings and rotations keep the tree balanced even for sorted input.',
  hint: 'Invariants: root black; red nodes have black children; every root-to-leaf path has the same number of black nodes. A red uncle → recolour and move up; a black uncle → 1 or 2 rotations. Height ≤ 2·log₂(n+1).',
  params: [
    { kind: 'number', id: 'n', label: 'Number of keys', min: 3, max: 31, step: 1, value: 15, digits: 0 },
    { kind: 'select', id: 'order', label: 'Insertion order', value: 'asc', options: [{ value: 'asc', label: 'Ascending (worst for a plain BST)' }, { value: 'desc', label: 'Descending' }, { value: 'rand', label: 'Random' }] },
    { kind: 'number', id: 'gap', label: 'Seconds per insertion', min: 0.1, max: 2, step: 0.05, value: 0.6, digits: 2 },
  ],
  actions: [{ id: 'restart', label: 'Restart' }, { id: 'extra', label: 'Insert a random extra key' }],
  dt: 1 / 30, previewSeconds: 8,
  init(v) { const rng = mulberry(11); return { root: null, n: 0, queue: rbQueue(str(v, 'order'), Math.round(num(v, 'n')), rng), rot: 0, rec: 0, acc: { a: 0 }, msg: 'Press play: keys are inserted one by one.', rng, used: new Set() }; },
  action(s, v, id) {
    if (id === 'restart') { const rng = mulberry(11 + s.n); Object.assign(s, { root: null, n: 0, queue: rbQueue(str(v, 'order'), Math.round(num(v, 'n')), rng), rot: 0, rec: 0, msg: 'Restarted.', rng, used: new Set() }); }
    if (id === 'extra') { let k = 1 + Math.floor(s.rng() * 99); while (s.used.has(k)) k++; rbInsert(s, k); }
  },
  step(s, v, dt) { ticks(s.acc, dt, num(v, 'gap'), () => { const k = s.queue.shift(); if (k !== undefined) rbInsert(s, k); else if (!s.msg.startsWith('All')) s.msg = `All ${s.n} keys inserted. Use “Insert a random extra key” to continue.`; }); },
  draw(c, s, _v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const order: { n: RB; d: number }[] = [];
    const walk = (n: RB | null, d: number) => { if (!n) return; walk(n.l, d + 1); order.push({ n, d }); walk(n.r, d + 1); }; walk(s.root, 0);
    const info = rbInfo(s.root); const N = Math.max(1, order.length), top = 40, rowH = Math.min(52, (h - top - 36) / Math.max(1, info.height + 0.5)), rad = clamp(Math.min((w - 20) / N / 2.2, 17), 5, 17);
    const pos = new Map<RB, [number, number]>(); order.forEach((o, i) => pos.set(o.n, [10 + ((i + 0.5) / N) * (w - 20), top + o.d * rowH + 10]));
    for (const { n } of order) { const a = pos.get(n)!; for (const ch of [n.l, n.r]) if (ch) { const b = pos.get(ch)!; line(c, a[0], a[1], b[0], b[1], C.axis, 1.2); } }
    for (const { n } of order) { const [x, y] = pos.get(n)!; circle(c, x, y, rad, n.red ? '#dc2626' : '#0f172a', C.white, 1.5); if (rad >= 8) text(c, String(n.k), x, y + 3.5, C.white, Math.min(12, rad), 'center', 'alphabetic', true); }
    text(c, s.msg, 10, 18, C.text, 12); text(c, `n=${s.n}  height=${info.height}  black-height=${info.bh}  rotations=${s.rot}  recolourings=${s.rec}`, 10, h - 12, C.dim, 11);
    text(c, info.ok ? 'invariants OK' : 'INVARIANT VIOLATED', w - 10, h - 12, info.ok ? C.green : C.red, 11, 'right', 'alphabetic', true);
  },
  readouts(s) { const i = rbInfo(s.root); return [{ label: 'Nodes', value: s.n, digits: 0 }, { label: 'Height', value: i.height, digits: 0 }, { label: 'Height bound 2·log₂(n+1)', value: 2 * Math.log2(s.n + 1), digits: 1 }, { label: 'Black-height', value: i.bh, digits: 0 }, { label: 'Rotations', value: s.rot, digits: 0 }, { label: 'Recolourings', value: s.rec, digits: 0 }, { label: 'Valid red-black tree', value: i.ok ? 'yes' : 'NO' }]; },
  equations() { return ['h\\le 2\\log_2(n+1)', 'bh(x)\\ \\text{equal on every path},\\ \\text{no red–red edge}']; },
});

/* ============================ Q-learning / SARSA grid world ============================ */
const GW = 8, GH = 4;
interface QS { Q: Float64Array; ep: number; steps: number; pos: number; ret: number; rets: number[]; acc: { a: number }; rng: () => number; env: string; algo: string; epSteps: number; cum: number }
const cellOf = (x: number, y: number) => y * GW + x;
const isCliff = (env: string, i: number) => env === 'cliff' && Math.floor(i / GW) === GH - 1 && i % GW > 0 && i % GW < GW - 1;
const isWall = (env: string, i: number) => env === 'maze' && [cellOf(2, 0), cellOf(2, 1), cellOf(2, 2), cellOf(5, 1), cellOf(5, 2), cellOf(5, 3)].includes(i);
const START = cellOf(0, GH - 1), GOAL = cellOf(GW - 1, GH - 1);
const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
function qMove(env: string, p: number, a: number): { to: number; r: number; done: boolean } {
  const x = p % GW, y = Math.floor(p / GW); const nx = clamp(x + DIRS[a][0], 0, GW - 1), ny = clamp(y + DIRS[a][1], 0, GH - 1); let to = cellOf(nx, ny); if (isWall(env, to)) to = p;
  if (isCliff(env, to)) return { to: START, r: -100, done: false }; if (to === GOAL) return { to, r: -1, done: true }; return { to, r: -1, done: false };
}
const greedy = (s: QS, p: number) => { let b = 0; for (let a = 1; a < 4; a++) if (s.Q[p * 4 + a] > s.Q[p * 4 + b] + 1e-12) b = a; return b; };
function qEpsilon(s: QS, p: number, eps: number) { return s.rng() < eps ? Math.floor(s.rng() * 4) : greedy(s, p); }
function qStep(s: QS, alpha: number, gamma: number, eps: number) {
  const p = s.pos; const a = qEpsilon(s, p, eps); const { to, r, done } = qMove(s.env, p, a);
  let target = r;
  if (!done) { if (s.algo === 'sarsa') { const a2 = qEpsilon(s, to, eps); target += gamma * s.Q[to * 4 + a2]; } else { let m = -Infinity; for (let k = 0; k < 4; k++) m = Math.max(m, s.Q[to * 4 + k]); target += gamma * m; } }
  s.Q[p * 4 + a] += alpha * (target - s.Q[p * 4 + a]); s.ret += r; s.steps++; s.epSteps++; s.pos = to;
  if (done || s.epSteps >= 200) { s.rets.push(s.ret); if (s.rets.length > 300) s.rets.shift(); s.cum++; s.ep++; s.pos = START; s.ret = 0; s.epSteps = 0; }
}
export const qLearningGrid = defineSim<QS>({
  id: 'q_learning_gridworld', title: 'Reinforcement Learning: Q-Learning & SARSA in a Grid World',
  ...meta('Computer Science', 'Advanced', 'Reinforcement Learning', 'Temporal-Difference Control', 'Q-learning vs SARSA, ε-greedy exploration, cliff walking, value and policy'),
  covers: ['Reinforcement learning', 'Q-learning', 'SARSA', 'Markov decision process', 'Epsilon-greedy', 'Temporal difference learning', 'Bellman equation'],
  tags: ['RL', 'cliff walking', 'Sutton Barto', 'on-policy', 'off-policy', 'AI', 'M.Tech'],
  learningObjectives: ['Watch Q-values propagate back from the goal via the Bellman update.', 'Compare Q-learning (off-policy, risky optimal path along the cliff) with SARSA (on-policy, safer path).', 'See how ε, α and γ change learning speed and the final policy.'],
  assumptions: ['Deterministic 8×4 grid; reward −1 per move, −100 for the cliff (back to start); episode capped at 200 steps; tabular Q.'],
  blurb: 'An agent learns to reach the goal in a grid world with a cliff. Each cell shows its best value; arrows show the learned greedy policy.',
  hint: 'Q(s,a) ← Q(s,a) + α [ r + γ·max_a′ Q(s′,a′) − Q(s,a) ] (Q-learning) or uses the action actually taken next (SARSA). With ε-greedy exploration SARSA learns to stay away from the cliff edge.',
  params: [
    { kind: 'select', id: 'algo', label: 'Algorithm', value: 'q', options: [{ value: 'q', label: 'Q-learning (off-policy)' }, { value: 'sarsa', label: 'SARSA (on-policy)' }] },
    { kind: 'select', id: 'env', label: 'Environment', value: 'cliff', options: [{ value: 'cliff', label: 'Cliff walking' }, { value: 'maze', label: 'Maze with walls' }, { value: 'open', label: 'Open grid' }] },
    { kind: 'number', id: 'alpha', label: 'Learning rate α', min: 0.01, max: 1, step: 0.01, value: 0.5, digits: 2 },
    { kind: 'number', id: 'gamma', label: 'Discount γ', min: 0, max: 0.999, step: 0.01, value: 0.95, digits: 2 },
    { kind: 'number', id: 'eps', label: 'Exploration ε', min: 0, max: 1, step: 0.01, value: 0.1, digits: 2 },
    { kind: 'number', id: 'spf', label: 'Steps per frame', min: 1, max: 200, step: 1, value: 20, digits: 0 },
  ],
  actions: [{ id: 'reset', label: 'Forget everything (reset Q)' }],
  dt: 1 / 30, previewSeconds: 6,
  init(v) { return { Q: new Float64Array(GW * GH * 4), ep: 0, steps: 0, pos: START, ret: 0, rets: [], acc: { a: 0 }, rng: mulberry(5), env: str(v, 'env'), algo: str(v, 'algo'), epSteps: 0, cum: 0 }; },
  action(s) { s.Q.fill(0); s.ep = 0; s.steps = 0; s.rets = []; s.pos = START; s.ret = 0; s.epSteps = 0; },
  step(s, v) { if (s.env !== str(v, 'env') || s.algo !== str(v, 'algo')) { s.env = str(v, 'env'); s.algo = str(v, 'algo'); s.Q.fill(0); s.ep = 0; s.steps = 0; s.rets = []; s.pos = START; s.ret = 0; s.epSteps = 0; }
    const n = Math.round(num(v, 'spf')); for (let i = 0; i < n; i++) qStep(s, num(v, 'alpha'), num(v, 'gamma'), num(v, 'eps')); },
  draw(c, s, _v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const gw = Math.min(w * 0.62, (h - 16) * 2.1), cw = gw / GW, chh = Math.min(cw, (h - 30) / GH), gx = 8, gy = 12;
    let vmin = 0, vmax = -1e9; for (let i = 0; i < GW * GH; i++) { let m = -1e9; for (let a = 0; a < 4; a++) m = Math.max(m, s.Q[i * 4 + a]); vmin = Math.min(vmin, m); vmax = Math.max(vmax, m); } if (vmax - vmin < 1e-6) vmax = vmin + 1;
    for (let i = 0; i < GW * GH; i++) {
      const x = gx + (i % GW) * cw, y = gy + Math.floor(i / GW) * chh; let m = -1e9; for (let a = 0; a < 4; a++) m = Math.max(m, s.Q[i * 4 + a]);
      const t = clamp((m - vmin) / (vmax - vmin), 0, 1); c.fillStyle = isCliff(s.env, i) ? '#7f1d1d' : isWall(s.env, i) ? '#334155' : `rgba(52,211,153,${0.08 + 0.55 * t})`; c.fillRect(x + 1, y + 1, cw - 2, chh - 2);
      if (i === GOAL) text(c, 'G', x + cw / 2, y + chh / 2 + 5, C.amber, 16, 'center', 'alphabetic', true); else if (i === START) text(c, 'S', x + cw / 2, y + chh / 2 + 5, C.cyan, 16, 'center', 'alphabetic', true);
      else if (!isCliff(s.env, i) && !isWall(s.env, i)) { const a = greedy(s, i); if (s.Q[i * 4 + a] !== 0) { const cx = x + cw / 2, cy = y + chh / 2; line(c, cx - DIRS[a][0] * cw * 0.2, cy - DIRS[a][1] * chh * 0.2, cx + DIRS[a][0] * cw * 0.25, cy + DIRS[a][1] * chh * 0.25, C.white, 2); circle(c, cx + DIRS[a][0] * cw * 0.28, cy + DIRS[a][1] * chh * 0.28, 3, C.white); } }
      if (isCliff(s.env, i)) text(c, 'cliff', x + cw / 2, y + chh / 2 + 4, C.red, 10, 'center');
    }
    circle(c, gx + (s.pos % GW) * cw + cw / 2, gy + Math.floor(s.pos / GW) * chh + chh / 2, Math.min(cw, chh) * 0.18, C.amber, C.white, 1.5);
    const P = { x: gx + gw + 10, y: 8, w: w - gx - gw - 18, h: h - 16 }; if (P.w > 120) { const ys = s.rets.length ? s.rets : [0]; const lo = Math.min(-120, ...ys), m = plot(c, P, [0, Math.max(10, ys.length)], [lo, 0], { title: 'Return per episode', xlabel: 'episode (recent)' }); polyline(c, ys.map((r, i) => [m.X(i), m.Y(r)] as [number, number]), C.cyan, 1.5); }
  },
  readouts(s) { const rec = s.rets.slice(-20); const avg = rec.length ? rec.reduce((a, b) => a + b, 0) / rec.length : 0; return [{ label: 'Episodes', value: s.ep, digits: 0 }, { label: 'Total steps', value: s.steps, digits: 0 }, { label: 'Avg return (last 20)', value: avg, digits: 1 }]; },
  equations(_s, v) { return [str(v, 'algo') === 'q' ? 'Q(s,a)\\leftarrow Q(s,a)+\\alpha\\,[\\,r+\\gamma\\max_{a\'}Q(s\',a\')-Q(s,a)\\,]' : 'Q(s,a)\\leftarrow Q(s,a)+\\alpha\\,[\\,r+\\gamma\\,Q(s\',a\')-Q(s,a)\\,]']; },
});

/* ============================ Raft consensus ============================ */
interface RMsg { from: number; to: number; at: number; sent: number; type: 'RV' | 'RVR' | 'AE' | 'AER'; term: number; a?: number; b?: number; ok?: boolean; entries?: number[]; commit?: number }
interface RNode { alive: boolean; role: 'F' | 'C' | 'L'; term: number; voted: number; timer: number; log: number[]; commit: number; votes: number; next: number[]; match: number[]; hb: number }
interface RS { nodes: RNode[]; msgs: RMsg[]; now: number; rng: () => number; elections: number; sent: number; note: string; n: number; acc: { a: number } }
const rTimeout = (s: RS) => 150 + s.rng() * 150;
function rInit(n: number, seed: number): RS { const s: RS = { nodes: [], msgs: [], now: 0, rng: mulberry(seed), elections: 0, sent: 0, note: 'Followers wait for a heartbeat; the first timeout starts an election.', n, acc: { a: 0 } }; for (let i = 0; i < n; i++) s.nodes.push({ alive: true, role: 'F', term: 0, voted: -1, timer: 0, log: [], commit: 0, votes: 0, next: Array(n).fill(1), match: Array(n).fill(0), hb: 0 }); s.nodes.forEach(nd => { nd.timer = rTimeout(s); }); return s; }
function rSend(s: RS, lat: number, m: Omit<RMsg, 'at' | 'sent'>) { if (!s.nodes[m.from].alive) return; s.sent++; s.msgs.push({ ...m, sent: s.now, at: s.now + lat * (0.7 + 0.6 * s.rng()) }); }
function rAppend(s: RS, lat: number, i: number, j: number) { const L = s.nodes[i]; const ni = L.next[j]; const prevIdx = ni - 1; rSend(s, lat, { from: i, to: j, type: 'AE', term: L.term, a: prevIdx, b: prevIdx > 0 ? L.log[prevIdx - 1] : 0, entries: L.log.slice(ni - 1), commit: L.commit }); }
function rBecomeFollower(s: RS, nd: RNode, term: number) { nd.role = 'F'; nd.term = term; nd.voted = -1; nd.votes = 0; nd.timer = rTimeout(s); }
function rDeliver(s: RS, lat: number, m: RMsg) {
  const nd = s.nodes[m.to]; if (!nd.alive) return; const n = s.n;
  if (m.term > nd.term) rBecomeFollower(s, nd, m.term);
  if (m.type === 'RV') {
    const lastIdx = nd.log.length, lastTerm = lastIdx ? nd.log[lastIdx - 1] : 0; const upToDate = (m.b ?? 0) > lastTerm || ((m.b ?? 0) === lastTerm && (m.a ?? 0) >= lastIdx);
    const grant = m.term === nd.term && (nd.voted === -1 || nd.voted === m.from) && upToDate; if (grant) { nd.voted = m.from; nd.timer = rTimeout(s); }
    rSend(s, lat, { from: m.to, to: m.from, type: 'RVR', term: nd.term, ok: grant });
  } else if (m.type === 'RVR') {
    if (nd.role === 'C' && m.term === nd.term && m.ok) { nd.votes++; if (nd.votes > n / 2) { nd.role = 'L'; nd.next = Array(n).fill(nd.log.length + 1); nd.match = Array(n).fill(0); nd.hb = 0; s.note = `Node ${m.to} won the election for term ${nd.term} with ${nd.votes}/${n} votes.`; for (let j = 0; j < n; j++) if (j !== m.to) rAppend(s, lat, m.to, j); } }
  } else if (m.type === 'AE') {
    if (m.term < nd.term) { rSend(s, lat, { from: m.to, to: m.from, type: 'AER', term: nd.term, ok: false, a: 0 }); return; }
    nd.role = 'F'; nd.timer = rTimeout(s); const prev = m.a ?? 0;
    if (prev > 0 && (nd.log.length < prev || nd.log[prev - 1] !== m.b)) { rSend(s, lat, { from: m.to, to: m.from, type: 'AER', term: nd.term, ok: false, a: 0 }); return; }
    (m.entries ?? []).forEach((t, k) => { const idx = prev + 1 + k; if (nd.log.length >= idx && nd.log[idx - 1] !== t) nd.log.length = idx - 1; if (nd.log.length < idx) nd.log.push(t); });
    const last = prev + (m.entries?.length ?? 0); if ((m.commit ?? 0) > nd.commit) nd.commit = Math.min(m.commit ?? 0, last);
    rSend(s, lat, { from: m.to, to: m.from, type: 'AER', term: nd.term, ok: true, a: last });
  } else if (m.type === 'AER') {
    if (nd.role !== 'L' || m.term !== nd.term) return;
    if (m.ok) { nd.match[m.from] = Math.max(nd.match[m.from], m.a ?? 0); nd.next[m.from] = nd.match[m.from] + 1; for (let N = nd.log.length; N > nd.commit; N--) { if (nd.log[N - 1] === nd.term && 1 + nd.match.filter((x, j) => j !== m.to && x >= N).length > n / 2) { nd.commit = N; break; } } }
    else nd.next[m.from] = Math.max(1, nd.next[m.from] - 1);
  }
}
function rTick(s: RS, ms: number, lat: number) {
  s.now += ms;
  for (let i = 0; i < s.n; i++) {
    const nd = s.nodes[i]; if (!nd.alive) continue;
    if (nd.role === 'L') { nd.hb -= ms; if (nd.hb <= 0) { nd.hb = 50; for (let j = 0; j < s.n; j++) if (j !== i) rAppend(s, lat, i, j); } }
    else { nd.timer -= ms; if (nd.timer <= 0) { nd.role = 'C'; nd.term++; nd.voted = i; nd.votes = 1; nd.timer = rTimeout(s); s.elections++; s.note = `Node ${i} timed out and started an election for term ${nd.term}.`; const li = nd.log.length; for (let j = 0; j < s.n; j++) if (j !== i) rSend(s, lat, { from: i, to: j, type: 'RV', term: nd.term, a: li, b: li ? nd.log[li - 1] : 0 }); } }
  }
  const due = s.msgs.filter(m => m.at <= s.now).sort((a, b) => a.at - b.at); s.msgs = s.msgs.filter(m => m.at > s.now); for (const m of due) rDeliver(s, lat, m);
}
const leaderOf = (s: RS) => { let best = -1; s.nodes.forEach((nd, i) => { if (nd.alive && nd.role === 'L' && (best < 0 || nd.term > s.nodes[best].term)) best = i; }); return best; };
export const raftConsensus = defineSim<RS>({
  id: 'raft_consensus_replication', title: 'Raft Consensus: Leader Election & Log Replication',
  ...meta('Computer Science', 'Advanced', 'Distributed Systems', 'Consensus Protocols', 'Raft terms, randomised election timeouts, heartbeats, log replication and commit'),
  covers: ['Raft', 'Consensus', 'Leader election', 'Log replication', 'Distributed systems', 'Fault tolerance', 'Quorum', 'State machine replication'],
  tags: ['distributed systems', 'etcd', 'consensus', 'Paxos', 'fault tolerance', 'M.Tech', 'GATE CS'],
  learningObjectives: ['See randomised timeouts turn a leaderless cluster into one with a single leader per term.', 'Kill the leader and watch a new election; kill a majority and see that no leader can commit.', 'Follow a client write: append → replicate → commit once a majority holds it.'],
  assumptions: ['Simplified Raft: fixed 50 ms heartbeat, 150–300 ms election timeouts, no membership change, no snapshots, no persistence across restarts, log entries identified by their term.'],
  blurb: 'A cluster of Raft nodes elects a leader and replicates a log. Kill nodes, send client writes and watch terms, votes and commits.',
  hint: 'A node that hears nothing for its (random) timeout becomes a candidate, increments the term and asks for votes; a majority makes it leader. The leader sends AppendEntries heartbeats and an entry is committed when stored on a majority AND is from the leader’s term.',
  params: [
    { kind: 'number', id: 'n', label: 'Nodes', min: 3, max: 7, step: 1, value: 5, digits: 0 },
    { kind: 'number', id: 'lat', label: 'Network latency (ms)', min: 5, max: 120, step: 1, value: 30, digits: 0 },
    { kind: 'number', id: 'ts', label: 'Time scale (sim-ms per real-ms)', min: 0.1, max: 2, step: 0.05, value: 0.5, digits: 2 },
  ],
  actions: [{ id: 'write', label: 'Client write' }, { id: 'kill', label: 'Kill the leader' }, { id: 'revive', label: 'Revive all nodes' }, { id: 'reset', label: 'Restart cluster' }],
  dt: 1 / 30, previewSeconds: 6,
  init(v) { return rInit(Math.round(num(v, 'n')), 21); },
  action(s, v, id) {
    if (id === 'reset') Object.assign(s, rInit(Math.round(num(v, 'n')), 21 + s.elections));
    if (id === 'revive') { s.nodes.forEach(nd => { if (!nd.alive) { nd.alive = true; nd.role = 'F'; nd.timer = rTimeout(s); } }); s.note = 'All nodes are up again (their logs were kept).'; }
    if (id === 'kill') { const l = leaderOf(s); if (l >= 0) { s.nodes[l].alive = false; s.note = `Leader ${l} crashed. Followers will time out and elect a new one.`; } else s.note = 'There is no leader to kill.'; }
    if (id === 'write') { const l = leaderOf(s); if (l >= 0) { s.nodes[l].log.push(s.nodes[l].term); s.note = `Client write appended on leader ${l} (log index ${s.nodes[l].log.length}); replicating…`; } else s.note = 'No leader right now: the client write is rejected and must be retried.'; }
  },
  step(s, v, dt) { if (s.n !== Math.round(num(v, 'n'))) Object.assign(s, rInit(Math.round(num(v, 'n')), 33)); const lat = num(v, 'lat'); const total = dt * 1000 * num(v, 'ts') * 1; ticks(s.acc, total, 5, () => rTick(s, 5, lat), 200); },
  draw(c, s, _v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const cx = w / 2, cy = h / 2 + 6, R = Math.min(w, h) * 0.33; const P = s.nodes.map((_, i) => [cx + R * Math.cos((i / s.n) * Math.PI * 2 - Math.PI / 2), cy + R * Math.sin((i / s.n) * Math.PI * 2 - Math.PI / 2)] as [number, number]);
    for (let i = 0; i < s.n; i++) for (let j = i + 1; j < s.n; j++) line(c, P[i][0], P[i][1], P[j][0], P[j][1], 'rgba(148,163,184,0.12)');
    for (const m of s.msgs) { const t = clamp((s.now - m.sent) / Math.max(1, m.at - m.sent), 0, 1); const a = P[m.from], b = P[m.to]; circle(c, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 3, m.type === 'RV' || m.type === 'RVR' ? C.amber : m.type === 'AE' ? C.cyan : C.green); }
    s.nodes.forEach((nd, i) => {
      const [x, y] = P[i]; const col = !nd.alive ? '#475569' : nd.role === 'L' ? C.green : nd.role === 'C' ? C.amber : C.blue; circle(c, x, y, 20, 'rgba(15,23,42,0.95)', col, nd.role === 'L' ? 4 : 2);
      text(c, nd.alive ? nd.role : '✕', x, y + 5, col, 15, 'center', 'alphabetic', true); text(c, `N${i} · term ${nd.term}`, x, y - 26, C.text, 10, 'center');
      const bx = x - (Math.min(nd.log.length, 10) * 7) / 2; nd.log.slice(-10).forEach((t, k) => { const idx = nd.log.length - Math.min(nd.log.length, 10) + k + 1; c.fillStyle = idx <= nd.commit ? C.green : C.orange; c.fillRect(bx + k * 7, y + 26, 6, 8); void t; });
      if (nd.log.length) text(c, `log ${nd.log.length} · commit ${nd.commit}`, x, y + 46, C.dim, 9, 'center');
    });
    text(c, s.note, 10, 16, C.text, 11); text(c, 'amber = vote messages · cyan = AppendEntries · green = replies', 10, h - 8, C.dim, 10);
  },
  readouts(s) { const l = leaderOf(s); const alive = s.nodes.filter(x => x.alive).length; const maj = alive > s.n / 2; const commits = s.nodes.filter(x => x.alive).map(x => x.commit); const agree = (() => { const lead = s.nodes.filter(x => x.alive).sort((a, b) => b.commit - a.commit)[0]; if (!lead) return true; return s.nodes.every(x => !x.alive || x.log.slice(0, x.commit).every((t, k) => t === lead.log[k])); })(); return [{ label: 'Leader', value: l < 0 ? 'none' : `N${l} (term ${s.nodes[l].term})` }, { label: 'Nodes alive', value: `${alive} / ${s.n}${maj ? '' : ' (no quorum)'}` }, { label: 'Highest commit index', value: commits.length ? Math.max(...commits) : 0, digits: 0 }, { label: 'Elections started', value: s.elections, digits: 0 }, { label: 'Messages sent', value: s.sent, digits: 0 }, { label: 'Committed prefixes agree', value: agree ? 'yes' : 'NO' }]; },
  equations() { return ['\\text{majority}=\\lfloor n/2\\rfloor+1', 'P(\\text{split vote})\\ \\text{falls as the timeout range widens}']; },
});

/* ============================ Zero-knowledge proof (graph 3-colouring) ============================ */
const ZE: [number, number][] = [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3], [0, 3], [1, 4], [2, 5]];
const ZP: [number, number][] = [[0.25, 0.25], [0.5, 0.12], [0.75, 0.25], [0.25, 0.75], [0.5, 0.88], [0.75, 0.75]];
const ZCOL = ['#ef4444', '#22c55e', '#3b82f6']; const ZNAME = ['red', 'green', 'blue'];
interface ZR { edge: number; ok: boolean; perm: number[]; nonce: number[]; phase: number }
interface ZS { rounds: ZR[]; rng: () => number; cur: ZR | null; acc: { a: number }; rejected: boolean; secret: number[]; cheat: boolean }
const Z_VALID = [0, 1, 2, 1, 2, 0];
function zSecret(cheat: boolean) { const c = Z_VALID.slice(); if (cheat) c[1] = c[0]; return c; }
const zCommit = (col: number, nonce: number) => hex(fnv(`${col}:${nonce}`));
function zRound(s: ZS) {
  const perm = [0, 1, 2]; for (let i = 2; i > 0; i--) { const j = Math.floor(s.rng() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const nonce = s.secret.map(() => Math.floor(s.rng() * 1e9)); const edge = Math.floor(s.rng() * ZE.length); const [u, v] = ZE[edge];
  const cu = perm[s.secret[u]], cv = perm[s.secret[v]]; const ok = cu !== cv && zCommit(cu, nonce[u]) === zCommit(cu, nonce[u]);
  s.cur = { edge, ok, perm, nonce, phase: 0 }; s.rounds.push(s.cur); if (!ok) s.rejected = true; if (s.rounds.length > 200) s.rounds.shift();
}
export const zkProof = defineSim<ZS>({
  id: 'zero_knowledge_graph_colouring', title: 'Zero-Knowledge Proof: Convincing a Verifier Without Revealing the Secret',
  ...meta('Security', 'Advanced', 'Cryptography', 'Zero-Knowledge Proofs', 'Commit–challenge–reveal, completeness, soundness, zero-knowledge, soundness error'),
  covers: ['Zero-knowledge proof', 'Interactive proof', 'Commitment scheme', 'Completeness', 'Soundness', 'zk-SNARK', 'Graph 3-colouring'],
  tags: ['cryptography', 'ZKP', 'zk-SNARK', 'blockchain', 'Goldwasser Micali Rackoff', 'privacy', 'M.Tech'],
  learningObjectives: ['Run the commit → challenge → reveal protocol for NP-complete graph 3-colouring.', 'See that an honest prover always passes (completeness) while a cheater is caught with probability ≥ 1/|E| per round (soundness).', 'Understand why revealing two random colours leaks nothing about the colouring (fresh random permutation each round).'],
  assumptions: ['Interactive Σ-style protocol on a 6-node, 9-edge graph; commitments are a toy FNV hash (NOT cryptographically secure). zk-SNARKs make such proofs non-interactive and succinct using polynomial commitments and pairings; that machinery is not simulated here.'],
  blurb: 'The prover knows a valid 3-colouring of a graph. Each round the verifier challenges one random edge, the prover opens only its two endpoints, and a cheater is eventually caught.',
  hint: 'Round: prover permutes the 3 colours, commits to every node’s colour; verifier picks an edge; prover opens its two endpoints; verifier checks the commitments and that the colours differ. A prover with one bad edge survives n rounds with probability (1 − 1/9)ⁿ.',
  params: [
    { kind: 'toggle', id: 'cheat', label: 'Prover is cheating (colouring has one bad edge)', value: false },
    { kind: 'number', id: 'rate', label: 'Rounds per second', min: 0.5, max: 20, step: 0.5, value: 3, digits: 1 },
  ],
  actions: [{ id: 'reset', label: 'New proof session' }],
  dt: 1 / 30, previewSeconds: 4,
  init(v) { return { rounds: [], rng: mulberry(77), cur: null, acc: { a: 0 }, rejected: false, secret: zSecret(bool(v, 'cheat')), cheat: bool(v, 'cheat') }; },
  action(s, v) { Object.assign(s, { rounds: [], cur: null, rejected: false, secret: zSecret(bool(v, 'cheat')), cheat: bool(v, 'cheat') }); },
  step(s, v, dt) { if (s.cheat !== bool(v, 'cheat')) { s.cheat = bool(v, 'cheat'); s.rounds = []; s.cur = null; s.rejected = false; s.secret = zSecret(s.cheat); } ticks(s.acc, dt, 1 / num(v, 'rate'), () => { if (!s.rejected) zRound(s); }); },
  draw(c, s, _v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const gw = Math.min(w * 0.5, h * 1.1), gh = gh0(h), ox = 8, oy = 24; function gh0(hh: number) { return hh - 70; }
    const pt = (i: number) => [ox + ZP[i][0] * gw, oy + ZP[i][1] * gh] as [number, number];
    text(c, 'Prover’s hidden colouring → what the verifier sees this round', 8, 14, C.text, 11, 'left', 'alphabetic', true);
    ZE.forEach(([a, b], k) => { const A = pt(a), B = pt(b); const hot = s.cur && s.cur.edge === k; line(c, A[0], A[1], B[0], B[1], hot ? (s.cur!.ok ? C.green : C.red) : C.axis, hot ? 4 : 1.2); });
    for (let i = 0; i < 6; i++) { const [x, y] = pt(i); const open = s.cur && ZE[s.cur.edge].includes(i); const col = s.cur ? s.cur.perm[s.secret[i]] : -1; circle(c, x, y, 17, open && col >= 0 ? ZCOL[col] : '#1e293b', C.white, 2); if (!open) text(c, s.cur ? zCommit(s.cur.perm[s.secret[i]], s.cur.nonce[i]).slice(0, 4) : '?', x, y + 4, C.dim, 10, 'center'); else text(c, ZNAME[col][0].toUpperCase(), x, y + 5, C.white, 13, 'center', 'alphabetic', true); }
    const px = ox + gw + 24, pw = w - px - 8; if (pw > 100) {
      text(c, 'Round log (newest first)', px, 14, C.text, 11, 'left', 'alphabetic', true);
      s.rounds.slice(-9).reverse().forEach((r, k) => { const [u, v] = ZE[r.edge]; text(c, `#${s.rounds.length - k}  edge ${u}–${v}  ${r.ok ? 'colours differ ✓' : 'SAME COLOUR ✗'}`, px, 34 + k * 16, r.ok ? C.green : C.red, 11); });
    }
    const n = s.rounds.length, pSurv = Math.pow(1 - 1 / ZE.length, n); const by = h - 40;
    text(c, s.rejected ? 'VERIFIER REJECTS: the prover was caught cheating.' : n ? `Verifier still convinced after ${n} rounds.` : 'Press play to start the proof.', 8, by, s.rejected ? C.red : C.green, 12, 'left', 'alphabetic', true);
    text(c, `A cheater would survive ${n} rounds with probability ${(pSurv * 100).toFixed(2)} %`, 8, by + 16, C.dim, 11);
    roundRect(c, 8, by + 22, w - 16, 6, 3); c.fillStyle = 'rgba(148,163,184,0.2)'; c.fill(); roundRect(c, 8, by + 22, Math.max(4, (w - 16) * (1 - pSurv)), 6, 3); c.fillStyle = C.cyan; c.fill();
  },
  readouts(s) { const n = s.rounds.length; return [{ label: 'Rounds', value: n, digits: 0 }, { label: 'Verifier verdict', value: s.rejected ? 'REJECT' : n ? 'accepting' : '—' }, { label: 'Cheater survival (1−1/|E|)ⁿ', value: Math.pow(1 - 1 / ZE.length, n) * 100, unit: '%', digits: 2 }, { label: 'Rounds for 2⁻⁸⁰ soundness', value: Math.ceil(80 * Math.LN2 / -Math.log(1 - 1 / ZE.length)), digits: 0 }]; },
  equations() { return ['P[\\text{cheater survives }n\\text{ rounds}]=\\left(1-\\tfrac{1}{|E|}\\right)^{n}']; },
});

/* ============================ Network traffic anomaly detector ============================ */
interface NS { t: number; pk: number[]; pt: number[]; sc: number[]; truth: boolean[]; alarm: boolean[]; mP: number; vP: number; mT: number; vT: number; tp: number; fp: number; fn: number; tn: number; rng: () => number; acc: { a: number }; atk: boolean }
export const trafficAnomaly = defineSim<NS>({
  id: 'network_traffic_anomaly_detector', title: 'Network Forensics: Streaming Anomaly Detection of DDoS & Port Scans',
  ...meta('Security', 'Advanced', 'Network Security', 'Intrusion & Anomaly Detection', 'EWMA baseline, z-score alarm, DDoS flood, port scan, ROC trade-off'),
  covers: ['Anomaly detection', 'Intrusion detection', 'DDoS', 'Port scan', 'EWMA', 'Z-score', 'Network forensics', 'False positive'],
  tags: ['cybersecurity', 'IDS', 'SIEM', 'DDoS', 'nmap', 'forensics', 'ROC', 'M.Tech'],
  learningObjectives: ['Build an adaptive baseline with an exponentially weighted mean and variance.', 'See how the alarm threshold trades false positives against missed attacks.', 'Tell a volumetric DDoS (packet rate) from a port scan (many distinct destination ports at normal volume).'],
  assumptions: ['Synthetic traffic: Poisson-like packet counts with a slow daily wobble; one sample per second; baseline frozen while an alarm is active so attacks do not poison it.'],
  blurb: 'A live synthetic packet stream with attacks injected on a schedule. An EWMA z-score detector raises alarms; the counters show detection and false-alarm rates.',
  hint: 'z = (x − μ)/σ with μ, σ² updated as EWMA(α). Alarm when max(z_packets, z_ports) > threshold. Raise the threshold → fewer false alarms but more missed attacks.',
  params: [
    { kind: 'select', id: 'attack', label: 'Attack type', value: 'mixed', options: [{ value: 'ddos', label: 'DDoS flood (packet rate ↑)' }, { value: 'scan', label: 'Port scan (distinct ports ↑)' }, { value: 'mixed', label: 'Alternating' }] },
    { kind: 'number', id: 'int', label: 'Attack intensity (× normal)', min: 1.2, max: 8, step: 0.1, value: 3, digits: 1 },
    { kind: 'number', id: 'thr', label: 'Alarm threshold (z)', min: 1.5, max: 8, step: 0.1, value: 4, digits: 1 },
    { kind: 'number', id: 'alpha', label: 'EWMA weight α', min: 0.01, max: 0.4, step: 0.01, value: 0.05, digits: 2 },
  ],
  actions: [{ id: 'reset', label: 'Reset detector' }],
  dt: 1 / 10, previewSeconds: 60,
  init() { return { t: 0, pk: [], pt: [], sc: [], truth: [], alarm: [], mP: 100, vP: 100, mT: 8, vT: 4, tp: 0, fp: 0, fn: 0, tn: 0, rng: mulberry(3), acc: { a: 0 }, atk: false }; },
  action(s) { Object.assign(s, { t: 0, pk: [], pt: [], sc: [], truth: [], alarm: [], mP: 100, vP: 100, mT: 8, vT: 4, tp: 0, fp: 0, fn: 0, tn: 0 }); },
  step(s, v, dt) {
    ticks(s.acc, dt, 0.25, () => {
      const phase = s.t % 80, inAtk = phase >= 50 && phase < 62, kind = str(v, 'attack') === 'mixed' ? (Math.floor(s.t / 80) % 2 === 0 ? 'ddos' : 'scan') : str(v, 'attack'), k = num(v, 'int');
      const g = () => { let a = 0; for (let i = 0; i < 6; i++) a += s.rng(); return (a - 3) / 0.7071; };
      let pk = 100 + 8 * Math.sin(s.t / 25) + 10 * g(), pt = 8 + 2 * g(); if (inAtk) { if (kind === 'ddos') pk *= k; else pt *= k * 1.5; }
      pk = Math.max(0, pk); pt = Math.max(1, pt);
      const zP = Math.abs(pk - s.mP) / Math.sqrt(s.vP + 1e-6), zT = Math.abs(pt - s.mT) / Math.sqrt(s.vT + 1e-6), score = Math.max(zP, zT), alarm = score > num(v, 'thr'); const a = num(v, 'alpha');
      if (!alarm) { const dP = pk - s.mP, dT = pt - s.mT; s.mP += a * dP; s.vP = (1 - a) * (s.vP + a * dP * dP); s.mT += a * dT; s.vT = (1 - a) * (s.vT + a * dT * dT); }
      if (alarm && inAtk) s.tp++; else if (alarm) s.fp++; else if (inAtk) s.fn++; else s.tn++;
      for (const [arr, val] of [[s.pk, pk], [s.pt, pt], [s.sc, score]] as [number[], number][]) { arr.push(val); if (arr.length > 240) arr.shift(); } s.truth.push(inAtk); s.alarm.push(alarm); if (s.truth.length > 240) { s.truth.shift(); s.alarm.shift(); } s.t++; s.atk = inAtk;
    }, 100);
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const N = 240, H3 = (h - 24) / 3;
    const panelFor = (k: number, data: number[], title: string, lo: number, hi: number, col: string, thr?: number) => {
      const m = plot(c, { x: 8, y: 8 + k * (H3 + 4), w: w - 16, h: H3 }, [0, N], [lo, hi], { title, grid: true }); const off = N - data.length;
      s.truth.forEach((t, i) => { if (t) { c.fillStyle = 'rgba(248,113,113,0.18)'; c.fillRect(m.X(i + off), m.Y(hi), Math.max(1, m.X(1) - m.X(0)), m.Y(lo) - m.Y(hi)); } });
      polyline(c, data.map((d, i) => [m.X(i + off), m.Y(clamp(d, lo, hi))] as [number, number]), col, 1.5); if (thr !== undefined) line(c, m.X(0), m.Y(thr), m.X(N), m.Y(thr), C.amber, 1, [5, 4]);
      s.alarm.forEach((a, i) => { if (a) circle(c, m.X(i + off), m.Y(lo) - 5, 2.5, C.amber); });
    };
    panelFor(0, s.pk, 'Packets / s (red band = real attack, amber dots = alarms)', 0, Math.max(300, ...s.pk), C.cyan); panelFor(1, s.pt, 'Distinct destination ports / s', 0, Math.max(40, ...s.pt), C.green); panelFor(2, s.sc, 'Anomaly score z', 0, Math.max(10, ...s.sc), C.purple, num(v, 'thr'));
  },
  readouts(s) { const P = s.tp + s.fn, N = s.fp + s.tn; return [{ label: 'Detection rate (TPR)', value: P ? (100 * s.tp) / P : 0, unit: '%', digits: 1 }, { label: 'False-alarm rate (FPR)', value: N ? (100 * s.fp) / N : 0, unit: '%', digits: 2 }, { label: 'Precision', value: s.tp + s.fp ? (100 * s.tp) / (s.tp + s.fp) : 0, unit: '%', digits: 1 }, { label: 'Alarms (TP / FP)', value: `${s.tp} / ${s.fp}` }, { label: 'Missed (FN)', value: s.fn, digits: 0 }]; },
  equations() { return ['\\mu_t=(1-\\alpha)\\mu_{t-1}+\\alpha x_t', 'z_t=\\dfrac{|x_t-\\mu_{t-1}|}{\\sigma_{t-1}}>\\tau\\Rightarrow\\text{alarm}']; },
});
void fmt;
