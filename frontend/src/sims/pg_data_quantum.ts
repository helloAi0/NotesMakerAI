import { defineSim, num, str, bool } from './types';
import type { Values, EducationLevel, AnySim } from './types';
import { C, TAU, arrow, circle, clamp, fmt, hsl, line, panel, plot, polyline, text } from './draw';
import type { Ctx, Rect } from './draw';

/* ------------------------------------------------------------------ */
/*  Shared local helpers                                               */
/* ------------------------------------------------------------------ */

function makeRng(seed: number) {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const n = () => {
    let x = 0;
    while (x === 0) x = u();
    return Math.sqrt(-2 * Math.log(x)) * Math.cos(TAU * u());
  };
  const exp = (rate: number) => -Math.log(1 - u()) / rate;
  return { u, n, exp };
}
type Rng = ReturnType<typeof makeRng>;

const PG: EducationLevel[] = ['M.Tech', 'M.Sc'];
const PGUG: EducationLevel[] = ['M.Tech', 'M.Sc', 'B.Tech', 'B.Sc'];

/** Three-panel layout: A = main (square-ish), B and C = secondary panels. */
function lay3(w: number, h: number): { A: Rect; B: Rect; C: Rect; wide: boolean } {
  if (w >= 520) {
    const a = Math.min(h - 16, w * 0.46);
    const rw = w - a - 24, rh = (h - 24) / 2;
    return { A: { x: 8, y: 8, w: a, h: a }, B: { x: a + 16, y: 8, w: rw, h: rh }, C: { x: a + 16, y: 16 + rh, w: rw, h: rh }, wide: true };
  }
  const ah = Math.min(w - 16, h * 0.52);
  const bw = (w - 18) / 2, bh = h - ah - 18;
  return { A: { x: (w - ah) / 2, y: 6, w: ah, h: ah }, B: { x: 6, y: ah + 12, w: bw, h: bh }, C: { x: w / 2 + 3, y: ah + 12, w: bw, h: bh }, wide: false };
}

function textBox(c: Ctx, r: Rect, title: string, rows: string[], colors?: string[]) {
  panel(c, r);
  const size = r.w < 230 ? 9 : 11;
  text(c, title, r.x + 8, r.y + 14, C.text, size + 1, 'left', 'alphabetic', true);
  const lh = size + 4, maxRows = Math.max(0, Math.floor((r.h - 24) / lh)), maxCh = Math.floor((r.w - 16) / (size * 0.56));
  rows.slice(0, maxRows).forEach((s, i) => text(c, s.length > maxCh ? s.slice(0, Math.max(1, maxCh - 1)) + '…' : s, r.x + 8, r.y + 30 + i * lh, colors?.[i] ?? C.dim, size));
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const powmod = (b: number, e: number, m: number) => { let r = 1; b %= m; while (e > 0) { if (e & 1) r = (r * b) % m; b = (b * b) % m; e >>= 1; } return r; };

/* ================================================================== */
/*  1. Markov Chain Monte Carlo (Metropolis-Hastings)                  */
/* ================================================================== */

const MG = 48, MDOM = 4;
function mcDens(kind: string, x: number, y: number): number {
  if (kind === 'bimodal') return Math.exp(-((x + 1.5) ** 2 + (y + 1) ** 2) / (2 * 0.55 * 0.55)) + Math.exp(-((x - 1.5) ** 2 + (y - 1) ** 2) / (2 * 0.55 * 0.55));
  if (kind === 'banana') return Math.exp(-(x * x) / (2 * 1.4 * 1.4) - (y - 0.3 * x * x + 1) ** 2 / (2 * 0.35 * 0.35));
  const rho = 0.95, s2 = 1.3 * 1.3;
  return Math.exp(-(x * x - 2 * rho * x * y + y * y) / (2 * s2 * (1 - rho * rho)));
}
interface McS { rng: Rng; x: number; y: number; n: number; acc: number; hist: number[]; cnt: number; sx: number; sx2: number; trail: [number, number][]; trace: number[]; grid: Float32Array; marg: number[]; last: [number, number] | null; lastOk: boolean }
function mcInit(v: Values): McS {
  const kind = str(v, 'target');
  const grid = new Float32Array(MG * MG); const marg = new Array(MG).fill(0); let mx = 0, tot = 0;
  for (let j = 0; j < MG; j++) for (let i = 0; i < MG; i++) { const d = mcDens(kind, -MDOM + ((i + 0.5) * 2 * MDOM) / MG, -MDOM + ((j + 0.5) * 2 * MDOM) / MG); grid[j * MG + i] = d; mx = Math.max(mx, d); marg[i] += d; tot += d; }
  for (let k = 0; k < grid.length; k++) grid[k] /= mx;
  const bw = (2 * MDOM) / MG; for (let i = 0; i < MG; i++) marg[i] = marg[i] / (tot * bw);
  return { rng: makeRng(7), x: kind === 'banana' ? 3 : -3, y: kind === 'bimodal' ? 3 : -3, n: 0, acc: 0, hist: new Array(MG).fill(0), cnt: 0, sx: 0, sx2: 0, trail: [], trace: [], grid, marg, last: null, lastOk: false };
}
export const mcmc = defineSim<McS>({
  id: 'pg-mcmc-metropolis', title: 'MCMC: Metropolis–Hastings', subject: 'Math', status: 'interactive_derivation',
  educationLevels: PG, difficulty: 'Advanced', category: 'Statistics', topic: 'Markov Chain Monte Carlo', subtopic: 'Random-walk Metropolis sampling of a 2-D density',
  covers: ['Markov Chain Monte Carlo'], tags: ['MCMC', 'Metropolis', 'sampling', 'Bayesian', 'acceptance rate', 'burn-in', 'GATE DA'],
  learningObjectives: ['See how a random-walk chain visits a target density and why the histogram converges to the marginal.', 'Tune the proposal width and watch acceptance rate, autocorrelation and mixing trade off.', 'Understand burn-in and why correlated targets mix slowly.'],
  assumptions: ['Symmetric Gaussian proposal, so the Hastings correction cancels.', 'The target densities are known only up to a constant, as in real Bayesian problems.', 'Single chain; convergence diagnostics such as R-hat need several chains.'],
  blurb: 'A random walker proposes a step and accepts it with probability min(1, π(x′)/π(x)). Watch the visited points trace out the target and compare the histogram with the exact marginal.',
  hint: 'Random-walk Metropolis. Too small a step gives high acceptance but slow diffusion (high autocorrelation); too large a step gives low acceptance. Optimal acceptance about 0.234 in high dimensions, about 0.35 to 0.45 in 2D. Correlated and banana-shaped targets mix slowly. Burn-in removes the initial transient.',
  params: [
    { kind: 'select', id: 'target', label: 'Target density', value: 'bimodal', resetOnChange: true, options: [{ value: 'bimodal', label: 'Two modes' }, { value: 'banana', label: 'Banana' }, { value: 'correlated', label: 'Correlated (ρ=0.95)' }] },
    { kind: 'number', id: 'sigma', label: 'Proposal width σ', min: 0.05, max: 3, step: 0.05, value: 0.6 },
    { kind: 'number', id: 'spf', label: 'Steps per frame', min: 1, max: 200, step: 1, value: 8 },
    { kind: 'number', id: 'burn', label: 'Burn-in', min: 0, max: 2000, step: 50, value: 300, unit: 'steps' },
  ],
  actions: [{ id: 'reset', label: 'Restart chain' }],
  dt: 1 / 30, previewSeconds: 6,
  init: mcInit,
  action(s, v) { Object.assign(s, mcInit(v)); },
  step(s, v) {
    const kind = str(v, 'target'), sg = num(v, 'sigma'), burn = num(v, 'burn');
    for (let k = 0; k < num(v, 'spf'); k++) {
      const xp = s.x + sg * s.rng.n(), yp = s.y + sg * s.rng.n();
      const ratio = mcDens(kind, xp, yp) / Math.max(1e-300, mcDens(kind, s.x, s.y));
      const ok = s.rng.u() < Math.min(1, ratio);
      s.last = [xp, yp]; s.lastOk = ok;
      if (ok) { s.x = xp; s.y = yp; s.acc++; }
      s.n++;
      s.trace.push(s.x); if (s.trace.length > 1500) s.trace.shift();
      if (s.n % 3 === 0) { s.trail.push([s.x, s.y]); if (s.trail.length > 500) s.trail.shift(); }
      if (s.n > burn) { const bi = Math.floor(((s.x + MDOM) / (2 * MDOM)) * MG); if (bi >= 0 && bi < MG) s.hist[bi]++; s.cnt++; s.sx += s.x; s.sx2 += s.x * s.x; }
    }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const L = lay3(w, h);
    panel(c, L.A);
    const cell = L.A.w / MG;
    for (let j = 0; j < MG; j++) for (let i = 0; i < MG; i++) { const d = s.grid[j * MG + i]; if (d > 0.02) { c.fillStyle = `rgba(96,165,250,${(0.08 + 0.55 * d).toFixed(3)})`; c.fillRect(L.A.x + i * cell, L.A.y + L.A.h - (j + 1) * cell, cell + 0.5, cell + 0.5); } }
    const X = (x: number) => L.A.x + ((x + MDOM) / (2 * MDOM)) * L.A.w, Y = (y: number) => L.A.y + L.A.h - ((y + MDOM) / (2 * MDOM)) * L.A.h;
    s.trail.forEach((p, i) => circle(c, X(p[0]), Y(p[1]), 1.6, `rgba(251,191,36,${0.25 + 0.6 * (i / s.trail.length)})`));
    if (s.last) { line(c, X(s.x), Y(s.y), X(s.last[0]), Y(s.last[1]), s.lastOk ? C.green : C.red, 1.2); circle(c, X(s.last[0]), Y(s.last[1]), 3, undefined, s.lastOk ? C.green : C.red, 1.5); }
    circle(c, X(s.x), Y(s.y), 4, C.white, C.amber, 1.5);
    text(c, 'target density (blue) and chain (amber)', L.A.x + 6, L.A.y + 12, C.dim, 9);
    // trace of x
    const tr = s.trace.slice(-300);
    const mb = plot(c, L.B, [0, 300], [-MDOM, MDOM], { title: 'Trace of x', xlabel: 'last 300 steps', xstep: 100, ystep: 2 });
    polyline(c, tr.map((y, i) => [mb.X(i), mb.Y(y)] as [number, number]), C.amber, 1.6);
    // histogram vs exact marginal
    const hb = plot(c, L.C, [-MDOM, MDOM], [0, Math.max(0.6, ...s.marg) * 1.15], { title: 'Marginal of x: chain vs exact', xlabel: 'x', ystep: 0.2 });
    const bw = (2 * MDOM) / MG;
    if (s.cnt > 0) s.hist.forEach((n, i) => { const d = n / (s.cnt * bw); c.fillStyle = 'rgba(52,211,153,0.55)'; c.fillRect(hb.X(-MDOM + i * bw), hb.Y(d), Math.max(1, hb.X(bw) - hb.X(0) - 1), hb.Y(0) - hb.Y(d)); });
    polyline(c, s.marg.map((d, i) => [hb.X(-MDOM + (i + 0.5) * bw), hb.Y(d)] as [number, number]), C.amber, 2);
  },
  readouts(s, v) {
    const m = s.cnt ? s.sx / s.cnt : 0, sd = s.cnt ? Math.sqrt(Math.max(0, s.sx2 / s.cnt - m * m)) : 0;
    const t = s.trace; let ac = 0;
    if (t.length > 50) { const mu = t.reduce((a, b) => a + b, 0) / t.length; let a0 = 0, a1 = 0; for (let i = 0; i < t.length; i++) { a0 += (t[i] - mu) ** 2; if (i) a1 += (t[i] - mu) * (t[i - 1] - mu); } ac = a0 > 0 ? a1 / a0 : 0; }
    return [{ label: 'Acceptance rate', value: s.n ? s.acc / s.n : 0, digits: 3 }, { label: 'Steps', value: s.n, digits: 0 }, { label: 'Mean of x (post burn-in)', value: m, digits: 3 }, { label: 'Std of x', value: sd, digits: 3 }, { label: 'Lag-1 autocorrelation', value: ac, digits: 3 }, { label: 'Width σ', value: num(v, 'sigma'), digits: 2 }];
  },
  equations: (s, v) => [String.raw`\alpha(x\to x')=\min\!\left(1,\frac{\pi(x')}{\pi(x)}\right),\quad x'=x+\sigma\,\xi,\ \xi\sim\mathcal N(0,I)`, String.raw`\hat a=\frac{\text{accepted}}{\text{steps}}=\frac{${s.acc}}{${s.n || 1}}=${fmt(s.n ? s.acc / s.n : 0, 3)},\qquad \sigma=${fmt(num(v, 'sigma'), 2)}`],
  derivation: {
    targetEquation: '\\pi(x)\\,P(x\\to x\')=\\pi(x\')\\,P(x\'\\to x)',
    problemStatement: 'Show that the Metropolis acceptance rule leaves the target density π stationary (detailed balance).',
    assumptions: ['The proposal is symmetric: q(x′|x) = q(x|x′).', 'π(x) > 0 wherever the chain can move.', 'x ≠ x′ (staying put trivially satisfies the condition).'],
    variableDefinitions: [{ symbol: '\\pi(x)', meaning: 'Target (stationary) density, known up to a constant' }, { symbol: 'q(x\'|x)', meaning: 'Proposal density' }, { symbol: '\\alpha(x,x\')', meaning: 'Acceptance probability' }, { symbol: 'P(x\\to x\')', meaning: 'Transition density of the chain' }],
    startingPrinciple: 'Detailed balance is sufficient for π to be stationary: π(x)P(x→x′) = π(x′)P(x′→x).',
    steps: [
      { stepNumber: 1, title: 'Write the transition density', math: 'P(x\\to x\')=q(x\'|x)\\,\\alpha(x,x\')', explanation: 'To move from x to x′ the chain must propose x′ and then accept it.', highlightKey: 'proposal' },
      { stepNumber: 2, title: 'Use a symmetric proposal', math: '\\pi(x)\\,q(x\'|x)\\,\\alpha(x,x\')=\\pi(x\')\\,q(x\'|x)\\,\\alpha(x\',x)', explanation: 'Because q(x′|x) = q(x|x′), the proposal densities appear on both sides and cancel.', justification: 'Symmetry of a Gaussian random-walk proposal.' },
      { stepNumber: 3, title: 'Reduce to the acceptance probabilities', math: '\\pi(x)\\,\\alpha(x,x\')=\\pi(x\')\\,\\alpha(x\',x)', explanation: 'Only the acceptance rule has to satisfy this identity.' },
      { stepNumber: 4, title: 'Check the Metropolis choice', math: '\\alpha(x,x\')=\\min\\!\\left(1,\\tfrac{\\pi(x\')}{\\pi(x)}\\right)\\Rightarrow\\ \\text{if }\\pi(x\')\\ge\\pi(x):\\ \\pi(x)\\cdot 1=\\pi(x\')\\cdot\\tfrac{\\pi(x)}{\\pi(x\')}=\\pi(x)', explanation: 'When π(x′) ≥ π(x) the forward move is always accepted and the reverse acceptance is the ratio π(x)/π(x′); both sides equal π(x). The other case is symmetric.', intermediateResult: '\\pi(x)\\alpha(x,x\')=\\pi(x\')\\alpha(x\',x)' },
    ],
    finalResult: '\\alpha=\\min\\left(1,\\pi(x\')/\\pi(x)\\right)\\ \\text{satisfies detailed balance, so }\\pi\\text{ is stationary.}',
    physicalInterpretation: 'Only ratios of π are needed, so the unknown normalising constant never has to be computed.',
  },
});

/* ================================================================== */
/*  2. Bayesian network (exact inference by enumeration)               */
/* ================================================================== */

type Ev = [number, number, number, number]; // C, S, R, W: -1 none, 1 true, 0 false
interface BnS { ev: Ev }
const BN_NAMES = ['Cloudy', 'Sprinkler', 'Rain', 'Wet grass'];
function bnPos(w: number, h: number): [number, number][] {
  const top = 40, bot = h * 0.62;
  return [[w * 0.5, top + 14], [w * 0.22, (top + bot) / 2 + 10], [w * 0.78, (top + bot) / 2 + 10], [w * 0.5, bot]];
}
function bnPosterior(v: Values, ev: Ev) {
  const pc = num(v, 'pc'), psC = num(v, 'psc'), psN = num(v, 'psn'), prC = num(v, 'prc'), prN = num(v, 'prn'), pw = [num(v, 'w00'), num(v, 'w01'), num(v, 'w10'), num(v, 'w11')];
  const post = [0, 0, 0, 0]; let Z = 0;
  for (let st = 0; st < 16; st++) {
    const C0 = (st >> 3) & 1, S = (st >> 2) & 1, R = (st >> 1) & 1, W = st & 1; const a = [C0, S, R, W];
    if (ev.some((e, i) => e !== -1 && e !== a[i])) continue;
    const p = (C0 ? pc : 1 - pc) * (S ? (C0 ? psC : psN) : 1 - (C0 ? psC : psN)) * (R ? (C0 ? prC : prN) : 1 - (C0 ? prC : prN)) * (W ? pw[S * 2 + R] : 1 - pw[S * 2 + R]);
    Z += p; for (let i = 0; i < 4; i++) if (a[i]) post[i] += p;
  }
  return { post: post.map(x => (Z > 0 ? x / Z : 0)), Z };
}
export const bayesNet = defineSim<BnS>({
  id: 'pg-bayes-network', title: 'Bayesian Network Inference', subject: 'Math', status: 'interactive_derivation',
  educationLevels: PG, difficulty: 'Advanced', category: 'Probabilistic models', topic: 'Bayesian-network conditional dependencies', subtopic: 'Exact inference and explaining away',
  covers: ['Bayesian-network conditional dependencies'], tags: ['Bayes', 'belief network', 'explaining away', 'conditional independence', 'inference', 'graphical model'],
  learningObjectives: ['Click nodes to set evidence and watch every posterior update by exact enumeration.', 'See explaining away: wet grass raises the chance of rain, but learning the sprinkler was on lowers it again.', 'Relate the graph structure to the factorisation of the joint distribution.'],
  assumptions: ['Classic 4-node textbook network with binary variables.', 'Exact inference by summing all 16 joint states; real networks use smarter algorithms.', 'Conditional probability tables are adjustable but illustrative.'],
  blurb: 'Click a node to cycle its evidence (unknown, true, false). Every other node shows its exact posterior probability. Try wet grass, then add the sprinkler.',
  hint: 'Network Cloudy -> Sprinkler, Cloudy -> Rain, (Sprinkler, Rain) -> Wet grass. Joint P(C,S,R,W)=P(C)P(S|C)P(R|C)P(W|S,R). Observing wet grass raises P(rain) and P(sprinkler); then observing the sprinkler on lowers P(rain): explaining away. Sprinkler and Rain are dependent through Cloudy and become dependent through the common effect Wet grass once it is observed.',
  params: [
    { kind: 'number', id: 'pc', label: 'P(Cloudy)', min: 0.05, max: 0.95, step: 0.05, value: 0.5 },
    { kind: 'number', id: 'psc', label: 'P(Sprinkler | Cloudy)', min: 0, max: 1, step: 0.05, value: 0.1 },
    { kind: 'number', id: 'psn', label: 'P(Sprinkler | not Cloudy)', min: 0, max: 1, step: 0.05, value: 0.5 },
    { kind: 'number', id: 'prc', label: 'P(Rain | Cloudy)', min: 0, max: 1, step: 0.05, value: 0.8 },
    { kind: 'number', id: 'prn', label: 'P(Rain | not Cloudy)', min: 0, max: 1, step: 0.05, value: 0.2 },
    { kind: 'number', id: 'w00', label: 'P(Wet | no S, no R)', min: 0, max: 1, step: 0.01, value: 0 },
    { kind: 'number', id: 'w01', label: 'P(Wet | no S, R)', min: 0, max: 1, step: 0.01, value: 0.9 },
    { kind: 'number', id: 'w10', label: 'P(Wet | S, no R)', min: 0, max: 1, step: 0.01, value: 0.9 },
    { kind: 'number', id: 'w11', label: 'P(Wet | S and R)', min: 0, max: 1, step: 0.01, value: 0.99 },
  ],
  actions: [{ id: 'clear', label: 'Clear evidence' }, { id: 'wet', label: 'Observe wet grass' }, { id: 'wetS', label: 'Wet grass + sprinkler on' }],
  previewSeconds: 0,
  init() { return { ev: [-1, -1, -1, -1] }; },
  preview(s) { s.ev = [-1, -1, -1, 1]; },
  action(s, _v, id) { s.ev = id === 'clear' ? [-1, -1, -1, -1] : id === 'wet' ? [-1, -1, -1, 1] : [-1, 1, -1, 1]; },
  step() { /* static */ },
  pointer(s, _v, e) {
    if (e.kind !== 'down') return;
    const ps = bnPos(e.w, e.h);
    ps.forEach((p, i) => { if (Math.hypot(e.x - p[0], e.y - p[1]) < 30) { s.ev[i] = s.ev[i] === -1 ? 1 : s.ev[i] === 1 ? 0 : -1; } });
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const ps = bnPos(w, h), { post, Z } = bnPosterior(v, s.ev);
    const edges = [[0, 1], [0, 2], [1, 3], [2, 3]];
    edges.forEach(([a, b]) => arrow(c, ps[a][0], ps[a][1] + 24, ps[b][0], ps[b][1] - 24, C.dim, 1.5, 7));
    const R = Math.min(30, w * 0.075);
    ps.forEach((p, i) => {
      const e = s.ev[i];
      circle(c, p[0], p[1], R, e === 1 ? 'rgba(52,211,153,0.35)' : e === 0 ? 'rgba(248,113,113,0.35)' : C.panel2, e === -1 ? C.dim : e === 1 ? C.green : C.red, e === -1 ? 1.5 : 3);
      text(c, `${Math.round(post[i] * 100)}%`, p[0], p[1] + 4, C.white, w < 400 ? 11 : 14, 'center', 'alphabetic', true);
      text(c, BN_NAMES[i], p[0], p[1] - R - 5, C.text, w < 400 ? 9 : 11, 'center', 'alphabetic', true);
      text(c, e === -1 ? 'unknown' : e === 1 ? 'TRUE (evidence)' : 'FALSE (evidence)', p[0], p[1] + R + 12, e === -1 ? C.dim : e === 1 ? C.green : C.red, 9, 'center');
    });
    const r: Rect = { x: 8, y: h * 0.62 + 40, w: w - 16, h: h - h * 0.62 - 48 };
    textBox(c, r, 'Posterior P(node = true | evidence)', [
      `Cloudy ${fmt(post[0], 3)}   Sprinkler ${fmt(post[1], 3)}   Rain ${fmt(post[2], 3)}   Wet ${fmt(post[3], 3)}`,
      `P(evidence) = ${fmt(Z, 4)}.  Click nodes to change evidence.`,
      'Explaining away: Wet=T then Sprinkler=T lowers Rain.',
    ], [C.amber, C.dim, C.dim]);
  },
  readouts(s, v) {
    const { post, Z } = bnPosterior(v, s.ev);
    return [{ label: 'P(Cloudy | e)', value: post[0], digits: 3 }, { label: 'P(Sprinkler | e)', value: post[1], digits: 3 }, { label: 'P(Rain | e)', value: post[2], digits: 3 }, { label: 'P(Wet grass | e)', value: post[3], digits: 3 }, { label: 'P(evidence)', value: Z, digits: 4 }, { label: 'Evidence', value: s.ev.map((e, i) => (e === -1 ? '' : `${BN_NAMES[i][0]}=${e ? 'T' : 'F'}`)).filter(Boolean).join(' ') || 'none' }];
  },
  equations: (s, v) => { const { post } = bnPosterior(v, s.ev); return [String.raw`P(C,S,R,W)=P(C)\,P(S\mid C)\,P(R\mid C)\,P(W\mid S,R)`, String.raw`P(\text{Rain}\mid e)=\frac{\sum_{\text{consistent states with R}}P}{\sum_{\text{consistent states}}P}=${fmt(post[2], 3)}`]; },
  derivation: {
    targetEquation: 'P(R\\mid W)=\\dfrac{P(W\\mid R)P(R)}{P(W)}',
    problemStatement: 'Compute the probability of rain given that the grass is wet, using the network factorisation.',
    assumptions: ['The graph encodes the conditional independences used in the factorisation.', 'All variables are binary.'],
    variableDefinitions: [{ symbol: 'C,S,R,W', meaning: 'Cloudy, Sprinkler, Rain, Wet grass (binary)' }, { symbol: 'e', meaning: 'Observed evidence' }],
    startingPrinciple: 'Bayes theorem together with the joint distribution factorised along the graph.',
    steps: [
      { stepNumber: 1, title: 'Factorise the joint', math: 'P(C,S,R,W)=P(C)P(S|C)P(R|C)P(W|S,R)', explanation: 'Each node depends only on its parents.' },
      { stepNumber: 2, title: 'Condition on the evidence', math: 'P(R=r\\mid W=1)=\\dfrac{\\sum_{c,s}P(c,s,r,W{=}1)}{\\sum_{c,s,r\'}P(c,s,r\',W{=}1)}', explanation: 'Sum out the unobserved variables in numerator and denominator.', justification: 'Marginalisation and the definition of conditional probability.' },
      { stepNumber: 3, title: 'Explaining away', math: 'P(R\\mid W{=}1,S{=}1)<P(R\\mid W{=}1)', explanation: 'Once the sprinkler is known to be on, it already explains the wet grass, so rain becomes less likely (for the default tables).' },
    ],
    finalResult: 'P(R\\mid e)=\\dfrac{\\sum_{\\text{states consistent with }e\\text{ and }R=1}P}{\\sum_{\\text{states consistent with }e}P}',
    physicalInterpretation: 'Two causes become dependent once their common effect is observed.',
  },
});

/* ================================================================== */
/*  3. Expectation-Maximization for a Gaussian mixture                 */
/* ================================================================== */

interface Gc { pi: number; mx: number; my: number; sxx: number; sxy: number; syy: number }
interface EmS { pts: [number, number][]; resp: number[][]; comps: Gc[]; ll: number[]; phase: 'E' | 'M'; clock: number; iter: number; done: boolean; K: number; seed: number }
function gpdf(c: Gc, x: number, y: number) {
  const det = c.sxx * c.syy - c.sxy * c.sxy, dx = x - c.mx, dy = y - c.my;
  const q = (c.syy * dx * dx - 2 * c.sxy * dx * dy + c.sxx * dy * dy) / det;
  return Math.exp(-0.5 * q) / (TAU * Math.sqrt(det));
}
function emE(s: EmS) {
  let ll = 0;
  s.pts.forEach((p, n) => { let tot = 0; const r = s.comps.map(k => k.pi * gpdf(k, p[0], p[1])); r.forEach(x => (tot += x)); tot = Math.max(tot, 1e-300); s.resp[n] = r.map(x => x / tot); ll += Math.log(tot); });
  s.ll.push(ll);
}
function emM(s: EmS) {
  const N = s.pts.length;
  s.comps = s.comps.map((_k, j) => {
    let Nk = 0, mx = 0, my = 0;
    s.pts.forEach((p, n) => { const r = s.resp[n][j]; Nk += r; mx += r * p[0]; my += r * p[1]; });
    Nk = Math.max(Nk, 1e-9); mx /= Nk; my /= Nk;
    let sxx = 0, sxy = 0, syy = 0;
    s.pts.forEach((p, n) => { const r = s.resp[n][j]; sxx += r * (p[0] - mx) ** 2; sxy += r * (p[0] - mx) * (p[1] - my); syy += r * (p[1] - my) ** 2; });
    return { pi: Nk / N, mx, my, sxx: sxx / Nk + 0.01, sxy: sxy / Nk, syy: syy / Nk + 0.01 };
  });
}
function emInit(v: Values, seedShift = 0): EmS {
  const rng = makeRng(11 + num(v, 'seed') * 7 + seedShift), Kt = num(v, 'ktrue'), K = num(v, 'K'), sep = num(v, 'sep');
  const centers: [number, number][] = Array.from({ length: Kt }, (_, i) => [sep * Math.cos((TAU * i) / Kt + 0.5), sep * Math.sin((TAU * i) / Kt + 0.5)]);
  const pts: [number, number][] = [];
  for (let n = 0; n < 240; n++) { const k = n % Kt, sx = 0.7 + 0.35 * ((k * 3) % 3), sy = 0.6 + 0.3 * ((k * 2) % 3), rot = k; const a = rng.n() * sx, b = rng.n() * sy; pts.push([centers[k][0] + a * Math.cos(rot) - b * Math.sin(rot), centers[k][1] + a * Math.sin(rot) + b * Math.cos(rot)]); }
  const comps: Gc[] = Array.from({ length: K }, () => { const p = pts[Math.floor(rng.u() * pts.length)]; return { pi: 1 / K, mx: p[0], my: p[1], sxx: 2.5, sxy: 0, syy: 2.5 }; });
  const s: EmS = { pts, resp: [], comps, ll: [], phase: 'E', clock: 0, iter: 0, done: false, K, seed: seedShift };
  emE(s); return s;
}
export const emCluster = defineSim<EmS>({
  id: 'pg-em-gmm', title: 'Expectation–Maximization Clustering', subject: 'Math', status: 'interactive_derivation',
  educationLevels: PG, difficulty: 'Advanced', category: 'Machine learning', topic: 'Expectation–Maximization clustering', subtopic: 'Gaussian mixture model fitted by EM',
  covers: ['Expectation–Maximization clustering'], tags: ['EM', 'GMM', 'Gaussian mixture', 'soft clustering', 'log-likelihood', 'unsupervised learning'],
  learningObjectives: ['Alternate the E-step (soft assignments) and the M-step (re-estimated means and covariances).', 'Verify that the log-likelihood never decreases.', 'See how initialisation and the chosen number of components change the fit.'],
  assumptions: ['Full-covariance Gaussians in 2-D with a tiny diagonal regulariser (0.01) for stability.', 'EM finds a local optimum, not necessarily the global one.', 'Synthetic data from Gaussian clusters with a seeded random generator.'],
  blurb: 'Points are coloured by how responsible each Gaussian is for them. Watch the ellipses slide and stretch while the log-likelihood climbs. Restart from a new initialisation to see local optima.',
  hint: 'EM for a Gaussian mixture. E-step: responsibilities r_nk = pi_k N(x_n|mu_k,Sigma_k)/sum_j. M-step: N_k=sum r_nk, mu_k, Sigma_k weighted by r, pi_k=N_k/N. Log-likelihood is non-decreasing. Wrong K or poor initialisation gives merged or split clusters. Compare K=true K with other K.',
  params: [
    { kind: 'number', id: 'K', label: 'Components K to fit', min: 1, max: 5, step: 1, value: 3, resetOnChange: true },
    { kind: 'number', id: 'ktrue', label: 'True clusters in data', min: 1, max: 4, step: 1, value: 3, resetOnChange: true },
    { kind: 'number', id: 'sep', label: 'Cluster separation', min: 1, max: 5, step: 0.1, value: 3, resetOnChange: true },
    { kind: 'number', id: 'seed', label: 'Random seed', min: 1, max: 9, step: 1, value: 1, resetOnChange: true },
    { kind: 'number', id: 'rate', label: 'Iterations per second', min: 0.3, max: 4, step: 0.1, value: 1 },
  ],
  actions: [{ id: 'step', label: 'Step (E or M)' }, { id: 'reinit', label: 'New initialisation' }],
  dt: 1 / 30, previewSeconds: 4,
  init: v => emInit(v),
  action(s, v, id) {
    if (id === 'reinit') { Object.assign(s, emInit(v, s.seed + 1)); return; }
    s.clock = 1;
  },
  step(s, v, dt) {
    if (s.done) return;
    s.clock += dt * num(v, 'rate') * 2;
    if (s.clock < 1) return;
    s.clock = 0;
    if (s.phase === 'E') { s.phase = 'M'; emM(s); } else { emE(s); s.phase = 'E'; s.iter++; const n = s.ll.length; if (n > 2 && Math.abs(s.ll[n - 1] - s.ll[n - 2]) < 1e-5) s.done = true; }
  },
  draw(c, s, _v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const L = lay3(w, h);
    panel(c, L.A);
    const R = 7, X = (x: number) => L.A.x + ((x + R) / (2 * R)) * L.A.w, Y = (y: number) => L.A.y + L.A.h - ((y + R) / (2 * R)) * L.A.h;
    const col = (k: number) => k * 70 + 20;
    s.pts.forEach((p, n) => { let hs = 0, sx = 0, sy = 0, best = 0; s.resp[n].forEach((r, k) => { if (r > s.resp[n][best]) best = k; hs += r; sx += r * Math.cos((col(k) * Math.PI) / 180); sy += r * Math.sin((col(k) * Math.PI) / 180); }); void hs; const hue = (Math.atan2(sy, sx) * 180) / Math.PI; circle(c, X(p[0]), Y(p[1]), 2.4, hsl(((hue % 360) + 360) % 360, 80, 60)); });
    s.comps.forEach((k, j) => {
      const a = 0.5 * Math.atan2(2 * k.sxy, k.sxx - k.syy), m = (k.sxx + k.syy) / 2, d = Math.sqrt(((k.sxx - k.syy) / 2) ** 2 + k.sxy ** 2);
      const l1 = Math.sqrt(Math.max(m + d, 1e-6)) * 2, l2 = Math.sqrt(Math.max(m - d, 1e-6)) * 2;
      c.save(); c.translate(X(k.mx), Y(k.my)); c.rotate(-a); c.beginPath(); c.ellipse(0, 0, (l1 * L.A.w) / (2 * R), (l2 * L.A.w) / (2 * R), 0, 0, TAU); c.strokeStyle = hsl(col(j), 90, 70); c.lineWidth = 2.2; c.stroke(); c.restore();
      circle(c, X(k.mx), Y(k.my), 3.5, C.white);
    });
    text(c, s.phase === 'E' ? 'next: M-step (re-fit)' : 'next: E-step (assign)', L.A.x + 6, L.A.y + 12, C.amber, 10, 'left', 'alphabetic', true);
    const n = s.ll.length, lo = Math.min(...s.ll), hi = Math.max(...s.ll);
    const m2 = plot(c, L.B, [0, Math.max(10, n)], [lo - 5, hi + 5 + (hi - lo) * 0.05], { title: 'Log-likelihood vs iteration', xlabel: 'iteration' });
    polyline(c, s.ll.map((y, i) => [m2.X(i), m2.Y(y)] as [number, number]), C.green, 2.4);
    textBox(c, L.C, 'Fitted mixture', s.comps.map((k, j) => `k${j + 1}: π=${fmt(k.pi, 2)} μ=(${fmt(k.mx, 1)},${fmt(k.my, 1)})`), s.comps.map((_k, j) => hsl(col(j), 90, 70)));
  },
  readouts: s => [{ label: 'Iteration', value: s.iter, digits: 0 }, { label: 'Log-likelihood', value: s.ll[s.ll.length - 1], digits: 2 }, { label: 'Change in last E-step', value: s.ll.length > 1 ? s.ll[s.ll.length - 1] - s.ll[s.ll.length - 2] : 0, digits: 5 }, { label: 'Status', value: s.done ? 'converged' : s.phase === 'E' ? 'running (E next)' : 'running (M next)' }, { label: 'BIC', value: -2 * s.ll[s.ll.length - 1] + (s.K * 6 - 1) * Math.log(s.pts.length), digits: 1 }],
  equations: s => [String.raw`r_{nk}=\frac{\pi_k\,\mathcal N(x_n\mid\mu_k,\Sigma_k)}{\sum_j\pi_j\,\mathcal N(x_n\mid\mu_j,\Sigma_j)}`, String.raw`\mu_k=\frac{\sum_n r_{nk}x_n}{N_k},\quad \pi_k=\frac{N_k}{N},\qquad \ln L=${fmt(s.ll[s.ll.length - 1], 2)}`],
});

/* ================================================================== */
/*  4. Brownian motion                                                 */
/* ================================================================== */

interface BrS { rng: Rng; x: number[]; y: number[]; x0: number[]; y0: number[]; t: number; hist: [number, number][]; trails: [number, number][][]; n: number }
const BW = 20; // box width in micrometres
function bDiff(v: Values) { return (1.380649e-23 * num(v, 'T')) / (6 * Math.PI * num(v, 'eta') * 1e-3 * num(v, 'r') * 1e-9) * 1e12; }
export const brownian = defineSim<BrS>({
  id: 'pg-brownian-motion', title: 'Brownian Motion & Diffusion', subject: 'Physics', status: 'interactive_derivation',
  educationLevels: PGUG, difficulty: 'Intermediate', category: 'Stochastic processes', topic: 'Brownian motion', subtopic: 'Mean squared displacement and the Stokes–Einstein relation',
  covers: ['Brownian motion'], tags: ['Einstein', 'diffusion coefficient', 'MSD', 'Wiener process', 'Stokes-Einstein', 'colloid'],
  learningObjectives: ['Verify that mean squared displacement grows linearly in time, MSD = 4Dt in 2-D.', 'Compute D from temperature, viscosity and particle radius with the Stokes–Einstein relation.', 'Distinguish the straight-line MSD of diffusion from ballistic motion.'],
  assumptions: ['Overdamped Langevin dynamics (no inertia, no hydrodynamic memory).', 'Spherical particles in a uniform fluid, no interactions between particles.', 'Periodic box so displacements are unbounded; MSD uses unwrapped positions.'],
  blurb: 'Colloidal particles jiggle under random kicks. The average squared distance they travel grows in proportion to time, and the slope gives the diffusion coefficient D = kT/(6πηr).',
  hint: 'Brownian motion simulated by dx = sqrt(2 D dt) xi (Euler-Maruyama). MSD in d dimensions = 2 d D t, so 4Dt in 2D. D from Stokes-Einstein: kT/(6 pi eta r). Smaller particles, hotter or less viscous fluid diffuse faster. Single trajectories look like fractals; only the ensemble average is smooth.',
  params: [
    { kind: 'number', id: 'T', label: 'Temperature', min: 273, max: 373, step: 1, value: 300, unit: 'K' },
    { kind: 'number', id: 'eta', label: 'Viscosity', min: 0.3, max: 5, step: 0.1, value: 1, unit: 'mPa·s' },
    { kind: 'number', id: 'r', label: 'Particle radius', min: 20, max: 1000, step: 10, value: 100, unit: 'nm' },
    { kind: 'number', id: 'n', label: 'Particles', min: 20, max: 300, step: 10, value: 120, resetOnChange: true },
  ],
  dt: 1 / 60, previewSeconds: 6,
  init(v) {
    const n = num(v, 'n'), rng = makeRng(3);
    const x = Array.from({ length: n }, () => rng.u() * BW), y = Array.from({ length: n }, () => rng.u() * BW);
    return { rng, x, y, x0: x.slice(), y0: y.slice(), t: 0, hist: [[0, 0]], trails: Array.from({ length: 6 }, (_, i) => [[x[i], y[i]]]), n: 0 };
  },
  step(s, v, dt) {
    const sg = Math.sqrt(2 * bDiff(v) * dt);
    let msd = 0;
    for (let i = 0; i < s.x.length; i++) { s.x[i] += sg * s.rng.n(); s.y[i] += sg * s.rng.n(); msd += (s.x[i] - s.x0[i]) ** 2 + (s.y[i] - s.y0[i]) ** 2; }
    s.t += dt; s.n++;
    for (let i = 0; i < 6; i++) { s.trails[i].push([s.x[i], s.y[i]]); if (s.trails[i].length > 160) s.trails[i].shift(); }
    if (s.n % 6 === 0) s.hist.push([s.t, msd / s.x.length]);
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const L = lay3(w, h); panel(c, L.A);
    const k = L.A.w / BW, wrap = (q: number) => ((q % BW) + BW) % BW;
    s.x.forEach((_x, i) => circle(c, L.A.x + wrap(s.x[i]) * k, L.A.y + wrap(s.y[i]) * k, i < 6 ? 4.5 : 2.2, i < 6 ? C.amber : 'rgba(96,165,250,0.7)'));
    s.trails.forEach((tr, i) => { let seg: [number, number][] = []; const flush = () => { if (seg.length > 1) polyline(c, seg, hsl(40 + i * 30, 90, 60, 0.8), 1.2); seg = []; }; tr.forEach((p, j) => { if (j && (Math.abs(wrap(p[0]) - wrap(tr[j - 1][0])) > BW / 2 || Math.abs(wrap(p[1]) - wrap(tr[j - 1][1])) > BW / 2)) flush(); seg.push([L.A.x + wrap(p[0]) * k, L.A.y + wrap(p[1]) * k]); }); flush(); });
    text(c, `box ${BW} × ${BW} µm (periodic)`, L.A.x + 6, L.A.y + 12, C.dim, 9);
    const D = bDiff(v), tmax = Math.max(5, s.t * 1.05), last = s.hist[s.hist.length - 1][1];
    const m = plot(c, L.B, [0, tmax], [0, Math.max(4 * D * tmax, last) * 1.1 + 1e-9], { title: 'Mean squared displacement (µm²)', xlabel: 'time (s)' });
    polyline(c, [[m.X(0), m.Y(0)], [m.X(tmax), m.Y(4 * D * tmax)]], C.dim, 1.6, [5, 4]);
    polyline(c, s.hist.map(p => [m.X(p[0]), m.Y(p[1])] as [number, number]), C.green, 2.2);
    textBox(c, L.C, 'Stokes–Einstein', [`D = kT / (6πηr)`, `= ${fmt(D, 3)} µm²/s`, `MSD = 4Dt (dashed)`, `measured D = ${fmt(s.t > 0.3 ? last / (4 * s.t) : 0, 3)} µm²/s`], [C.dim, C.amber, C.dim, C.green]);
  },
  readouts: (s, v) => { const last = s.hist[s.hist.length - 1][1]; return [{ label: 'D (theory)', value: bDiff(v), unit: 'µm²/s', digits: 3 }, { label: 'D (from MSD)', value: s.t > 0.3 ? last / (4 * s.t) : 0, unit: 'µm²/s', digits: 3 }, { label: 'MSD', value: last, unit: 'µm²', digits: 2 }, { label: 'RMS displacement', value: Math.sqrt(last), unit: 'µm', digits: 2 }, { label: 'Time', value: s.t, unit: 's', digits: 1 }]; },
  equations: (_s, v) => [String.raw`\langle r^2\rangle=2dDt=4Dt,\qquad D=\frac{k_BT}{6\pi\eta r}=${fmt(bDiff(v), 3)}\ \mu\text{m}^2/\text{s}`],
  derivation: {
    targetEquation: '\\langle r^2\\rangle=2dDt',
    problemStatement: 'Show that the mean squared displacement of a random walker grows linearly with time.',
    assumptions: ['Steps are independent with zero mean.', 'Variance of each coordinate per time step is 2Dδt.'],
    variableDefinitions: [{ symbol: 'D', meaning: 'Diffusion coefficient', unit: 'µm²/s' }, { symbol: 'd', meaning: 'Number of dimensions' }, { symbol: 'N', meaning: 'Number of time steps, t = Nδt' }],
    startingPrinciple: 'The position is the sum of N independent random steps.',
    steps: [
      { stepNumber: 1, title: 'Sum of independent steps', math: 'x(t)=\\sum_{i=1}^{N}\\delta x_i', explanation: 'Displacement along one axis is the sum of N random steps.' },
      { stepNumber: 2, title: 'Variances add', math: '\\langle x^2\\rangle=N\\langle\\delta x^2\\rangle=N\\cdot 2D\\,\\delta t=2Dt', explanation: 'Cross terms vanish because steps are independent with zero mean, so variances add.', justification: 'Independence of steps.' },
      { stepNumber: 3, title: 'Add the dimensions', math: '\\langle r^2\\rangle=\\sum_{k=1}^{d}\\langle x_k^2\\rangle=2dDt', explanation: 'Each Cartesian component contributes equally.' },
    ],
    finalResult: '\\langle r^2\\rangle=2dDt\\ \\Rightarrow\\ \\langle r^2\\rangle=4Dt\\ \\text{in 2-D}',
    dimensionalCheck: '[D][t] = (length²/time)(time) = length².',
    physicalInterpretation: 'Distance grows like √t, not t: diffusion is slow over long distances.',
  },
});

/* ================================================================== */
/*  5. Random walks (1D, 2D, 3D)                                       */
/* ================================================================== */

interface RwS { rng: Rng; pos: Int32Array; dim: number; returned: Uint8Array; nRet: number; n: number; clock: number; paths: [number, number][][]; rms: [number, number][]; ret: [number, number][] }
const RW_N = 400;
function rwInit(v: Values): RwS {
  const dim = Number(str(v, 'dim'));
  return { rng: makeRng(5), pos: new Int32Array(RW_N * 3), dim, returned: new Uint8Array(RW_N), nRet: 0, n: 0, clock: 0, paths: Array.from({ length: 8 }, () => [[0, 0]]), rms: [[0, 0]], ret: [[0, 0]] };
}
export const randomWalk = defineSim<RwS>({
  id: 'pg-random-walks', title: 'Random Walks: 1-D, 2-D, 3-D', subject: 'Math', status: 'active',
  educationLevels: PGUG, difficulty: 'Intermediate', category: 'Stochastic processes', topic: 'Random walks', subtopic: 'Diffusive spread and Pólya recurrence',
  covers: ['Random walks'], tags: ['Polya', 'recurrence', 'diffusion', 'binomial', 'central limit theorem', 'Markov chain'],
  learningObjectives: ['Confirm RMS distance grows as √n and the spread of positions becomes Gaussian.', 'Measure the fraction of walkers that have returned to the origin.', 'Compare 1-D and 2-D recurrence with the transient 3-D case (Pólya).'],
  assumptions: ['Unit steps along a randomly chosen axis (simple lattice walk).', '400 walkers: return fractions fluctuate by a few percent.', 'The 2-D return fraction rises very slowly towards 1 (logarithmically), so it looks small for a long time.'],
  blurb: '400 walkers take unit steps along random axes. See the cloud of positions spread like √n, and watch what fraction of walkers ever come back to their start: almost all in 1-D, slowly in 2-D, only about a third in 3-D.',
  hint: 'Lattice random walk in d dimensions: mean squared distance equals n, so RMS = sqrt(n); each coordinate has variance n/d and the histogram tends to a Gaussian (central limit theorem). Polya: the walk is recurrent in 1D and 2D (returns with probability 1) and transient in 3D with return probability about 0.3405. A bias p only applies in 1D.',
  params: [
    { kind: 'select', id: 'dim', label: 'Dimension', value: '2', resetOnChange: true, options: [{ value: '1', label: '1-D' }, { value: '2', label: '2-D' }, { value: '3', label: '3-D' }] },
    { kind: 'number', id: 'rate', label: 'Steps per second', min: 2, max: 120, step: 1, value: 30 },
    { kind: 'number', id: 'p', label: 'Right-step probability (1-D only)', min: 0.1, max: 0.9, step: 0.05, value: 0.5, resetOnChange: true },
  ],
  dt: 1 / 30, previewSeconds: 8,
  init: rwInit,
  step(s, v, dt) {
    s.clock += dt * num(v, 'rate');
    while (s.clock >= 1 && s.n < 6000) {
      s.clock -= 1; s.n++;
      for (let i = 0; i < RW_N; i++) {
        let ax: number, sg: number;
        if (s.dim === 1) { ax = 0; sg = s.rng.u() < num(v, 'p') ? 1 : -1; } else { ax = Math.floor(s.rng.u() * s.dim); sg = s.rng.u() < 0.5 ? 1 : -1; }
        s.pos[i * 3 + ax] += sg;
        if (!s.returned[i] && s.pos[i * 3] === 0 && s.pos[i * 3 + 1] === 0 && s.pos[i * 3 + 2] === 0) { s.returned[i] = 1; s.nRet++; }
      }
      for (let k = 0; k < 8; k++) s.paths[k].push([s.pos[k * 3], s.dim === 1 ? s.n : s.pos[k * 3 + 1]]);
      let m = 0; for (let i = 0; i < RW_N; i++) m += s.pos[i * 3] ** 2 + s.pos[i * 3 + 1] ** 2 + s.pos[i * 3 + 2] ** 2;
      s.rms.push([s.n, Math.sqrt(m / RW_N)]); s.ret.push([s.n, s.nRet / RW_N]);
    }
  },
  draw(c, s, _v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const L = lay3(w, h);
    let ext = 5; s.paths.forEach(p => p.forEach(q => { ext = Math.max(ext, Math.abs(q[0]), s.dim === 1 ? 0 : Math.abs(q[1])); }));
    const ye = s.dim === 1 ? Math.max(10, s.n * 1.05) : ext * 1.1;
    const ma = plot(c, L.A, [-ext * 1.1, ext * 1.1], s.dim === 1 ? [0, ye] : [-ye, ye], { title: s.dim === 1 ? 'Position vs step (8 walkers)' : `Paths of 8 walkers (x–y projection, ${s.dim}-D)`, ygrid: undefined } as never);
    s.paths.forEach((p, i) => polyline(c, p.map(q => [ma.X(q[0]), ma.Y(q[1])] as [number, number]), hsl(30 + i * 40, 85, 62, 0.9), 1.4));
    // histogram of x
    const sd = Math.sqrt(Math.max(1, s.n) / s.dim), xr = Math.max(4, sd * 3.2), nb = 31, counts = new Array(nb).fill(0);
    for (let i = 0; i < RW_N; i++) { const b = Math.floor(((s.pos[i * 3] + xr) / (2 * xr)) * nb); if (b >= 0 && b < nb) counts[b]++; }
    const bwid = (2 * xr) / nb, theo = (x: number) => (RW_N * bwid * Math.exp(-(x * x) / (2 * sd * sd))) / (Math.sqrt(TAU) * sd);
    const ymax = Math.max(5, ...counts, theo(0)) * 1.15;
    const mb = plot(c, L.B, [-xr, xr], [0, ymax], { title: 'Histogram of x', xlabel: 'x' });
    counts.forEach((n, i) => { c.fillStyle = 'rgba(96,165,250,0.6)'; c.fillRect(mb.X(-xr + i * bwid) + 1, mb.Y(n), Math.max(1, mb.X(bwid) - mb.X(0) - 1), mb.Y(0) - mb.Y(n)); });
    const pts: [number, number][] = []; for (let i = 0; i <= 60; i++) { const x = -xr + (2 * xr * i) / 60; pts.push([mb.X(x), mb.Y(theo(x))]); }
    polyline(c, pts, C.amber, 2);
    const nmax = Math.max(20, s.n);
    const mc = plot(c, L.C, [0, nmax], [0, Math.sqrt(nmax) * 1.1], { title: 'RMS distance (green) vs √n (dashed)', xlabel: 'steps n' });
    const th: [number, number][] = []; for (let i = 0; i <= 40; i++) { const n = (nmax * i) / 40; th.push([mc.X(n), mc.Y(Math.sqrt(n))]); }
    polyline(c, th, C.dim, 1.6, [5, 4]); polyline(c, s.rms.map(p => [mc.X(p[0]), mc.Y(p[1])] as [number, number]), C.green, 2.2);
  },
  readouts: s => [{ label: 'Steps taken', value: s.n, digits: 0 }, { label: 'RMS distance', value: s.rms[s.rms.length - 1][1], digits: 2 }, { label: '√n (theory)', value: Math.sqrt(s.n), digits: 2 }, { label: 'Returned to origin', value: (s.nRet / RW_N) * 100, unit: '%', digits: 1 }, { label: 'Pólya return probability', value: s.dim === 3 ? '≈ 34.05 %' : '100 % (as n → ∞)' }],
  equations: s => [String.raw`\langle r^2\rangle=n\ \Rightarrow\ r_{\text{rms}}=\sqrt n=${fmt(Math.sqrt(s.n), 2)},\qquad \sigma_x^2=\frac{n}{d}`, String.raw`P_{\text{return}}(d{=}1,2)=1,\qquad P_{\text{return}}(d{=}3)\approx0.3405`],
});
