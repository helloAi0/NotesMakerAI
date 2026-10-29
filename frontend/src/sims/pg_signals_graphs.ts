import { defineSim, num, str, bool, PG_ALL, UG_ENG } from './types';
import type { EducationLevel, Difficulty, SimSubject } from './types';
import { C, TAU, clamp, fmt, line, plot, polyline, text, circle, gauss } from './draw';

const meta = (subject: SimSubject, difficulty: Difficulty, category: string, topic: string, subtopic: string, levels: EducationLevel[] = [...PG_ALL, ...UG_ENG]) => ({
  subject, status: 'active' as const, educationLevels: levels, difficulty, category, topic, subtopic,
});

/* ================= FFT: spectrum, windowing and leakage ================= */
function fft(re: number[], im: number[]) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -TAU / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = i + k + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
  }
}
const WIN = (n: number, N: number, t: string) => t === 'hann' ? 0.5 - 0.5 * Math.cos(TAU * n / N) : t === 'hamming' ? 0.54 - 0.46 * Math.cos(TAU * n / N) : t === 'blackman' ? 0.42 - 0.5 * Math.cos(TAU * n / N) + 0.08 * Math.cos(2 * TAU * n / N) : 1;
export const fftWindow = defineSim<{ t: number }>({
  id: 'fft_windowing_leakage', title: 'FFT & Spectral Leakage: Windowing a Two-Tone Signal',
  ...meta('Electronics', 'Advanced', 'Signal Processing', 'Discrete Fourier Transform', 'DFT, spectral leakage, window functions, resolution'),
  covers: ['Fourier transform', 'Discrete Fourier transform', 'FFT', 'Spectral leakage', 'Window function', 'Frequency resolution', 'Sampling'],
  tags: ['DSP', 'signals and systems', 'GATE', 'Hann', 'Hamming', 'Blackman', 'EE', 'ECE'],
  learningObjectives: ['See that a tone not on a DFT bin leaks into neighbouring bins.', 'Compare rectangular, Hann, Hamming and Blackman windows: main-lobe width vs side-lobe level.', 'Resolve two close tones and relate resolution to fs/N.'],
  assumptions: ['256-point radix-2 FFT of a sum of two sinusoids plus optional Gaussian noise; magnitude shown in dB relative to the peak.'],
  blurb: 'Two sine waves are sampled and transformed with a real FFT. Change frequencies, window and noise and see leakage and resolution change.',
  hint: 'X[k]=Σ x[n]w[n]e^{-j2πkn/N}. Bin spacing fs/N. A tone between bins leaks; windows trade main-lobe width (resolution) against side-lobe level (dynamic range).',
  params: [
    { kind: 'number', id: 'f1', label: 'Tone 1 frequency (Hz)', min: 5, max: 100, step: 0.5, value: 20.5, digits: 1 },
    { kind: 'number', id: 'f2', label: 'Tone 2 frequency (Hz)', min: 5, max: 100, step: 0.5, value: 26, digits: 1 },
    { kind: 'number', id: 'a2', label: 'Tone 2 amplitude', min: 0.001, max: 1, step: 0.001, value: 0.05, digits: 3 },
    { kind: 'select', id: 'win', label: 'Window', value: 'rect', options: [{ value: 'rect', label: 'Rectangular' }, { value: 'hann', label: 'Hann' }, { value: 'hamming', label: 'Hamming' }, { value: 'blackman', label: 'Blackman' }] },
    { kind: 'number', id: 'noise', label: 'Noise σ', min: 0, max: 0.3, step: 0.005, value: 0, digits: 3 },
  ],
  dt: 1 / 20, previewSeconds: 1, init() { return { t: 0 }; }, step(s, _v, dt) { s.t += dt; },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const N = 256, fs = 256, re: number[] = [], im: number[] = [], x: number[] = [];
    for (let n = 0; n < N; n++) { const g = 0; void g; const s = Math.sin(TAU * num(v, 'f1') * n / fs) + num(v, 'a2') * Math.sin(TAU * num(v, 'f2') * n / fs) + num(v, 'noise') * Math.sin(n * 12.9898) * 1.7; x.push(s); re.push(s * WIN(n, N, str(v, 'win'))); im.push(0); }
    fft(re, im);
    const mag = re.slice(0, N / 2).map((r, k) => Math.hypot(r, im[k])), mx = Math.max(...mag, 1e-12);
    const db = mag.map(m => clamp(20 * Math.log10(m / mx + 1e-9), -100, 0));
    const A = { x: 8, y: 8, w: w - 16, h: h * 0.34 }, B = { x: 8, y: A.y + A.h + 8, w: w - 16, h: h - A.h - 32 };
    const mt = plot(c, A, [0, N], [-2.2, 2.2], { title: 'windowed time signal', xlabel: 'sample n' });
    polyline(c, x.map((s, n) => [mt.X(n), mt.Y(s * 0.9)] as [number, number]), C.dim, 1);
    polyline(c, x.map((s, n) => [mt.X(n), mt.Y(s * WIN(n, N, str(v, 'win')))] as [number, number]), C.cyan, 1.5);
    const mf = plot(c, B, [0, 64], [-100, 0], { title: 'magnitude spectrum (dB)', xlabel: 'frequency (Hz)  — bin spacing 1 Hz' });
    polyline(c, db.slice(0, 65).map((d, k) => [mf.X(k), mf.Y(d)] as [number, number]), C.amber, 2);
    line(c, mf.X(num(v, 'f1')), B.y + 20, mf.X(num(v, 'f1')), B.y + B.h - 24, 'rgba(34,211,238,0.5)', 1, [4, 4]);
    line(c, mf.X(num(v, 'f2')), B.y + 20, mf.X(num(v, 'f2')), B.y + B.h - 24, 'rgba(34,197,94,0.5)', 1, [4, 4]);
  },
  readouts(_s, v) { const d = Math.abs(num(v, 'f1') - num(v, 'f2')); return [{ label: 'Bin spacing', value: '1.00 Hz' }, { label: 'Tone separation', value: `${fmt(d, 1)} Hz` }, { label: 'Tone 2 relative level', value: `${fmt(20 * Math.log10(num(v, 'a2')), 1)} dB` }, { label: 'Window', value: str(v, 'win') }]; },
  equations() { return ['X[k]=\\sum_{n=0}^{N-1}x[n]\\,w[n]\\,e^{-j2\\pi kn/N}', '\\Delta f = f_s/N', 'w_{\\text{Hann}}[n]=0.5-0.5\\cos\\left(\\tfrac{2\\pi n}{N}\\right)']; },
});

/* ================= FIR filter design (windowed sinc) ================= */
export const firDesign = defineSim<{ t: number }>({
  id: 'fir_windowed_sinc', title: 'FIR Filter Design: Windowed-Sinc Low/High/Band-pass',
  ...meta('Electronics', 'Advanced', 'Signal Processing', 'Digital Filters', 'FIR design, impulse response, frequency response'),
  covers: ['FIR filter', 'Digital filter design', 'Windowed sinc', 'Frequency response', 'Impulse response', 'Linear phase', 'Filter order'],
  tags: ['DSP', 'GATE', 'ECE', 'low-pass', 'high-pass', 'band-pass', 'M.Tech'],
  learningObjectives: ['Connect impulse response h[n] and its frequency response.', 'See how filter length sets transition width and the window sets stop-band attenuation.'],
  assumptions: ['Type-I linear-phase FIR (odd length), ideal sinc truncated and windowed; sampling frequency normalised to 1.'],
  blurb: 'Design a linear-phase FIR filter by truncating the ideal sinc response and applying a window. Watch h[n] and |H(f)| change with cut-offs, length and window.',
  hint: 'h[n]=2fc·sinc(2fc(n-M/2))·w[n]. Longer filters = sharper transition. Hamming/Blackman give lower ripple but wider transition than rectangular.',
  params: [
    { kind: 'select', id: 'type', label: 'Type', value: 'lp', options: [{ value: 'lp', label: 'Low-pass' }, { value: 'hp', label: 'High-pass' }, { value: 'bp', label: 'Band-pass' }] },
    { kind: 'number', id: 'fc', label: 'Cut-off fc (cycles/sample)', min: 0.02, max: 0.45, step: 0.005, value: 0.15, digits: 3 },
    { kind: 'number', id: 'bw', label: 'Band-pass width', min: 0.02, max: 0.2, step: 0.005, value: 0.08, digits: 3 },
    { kind: 'number', id: 'len', label: 'Length (taps)', min: 5, max: 129, step: 2, value: 31, digits: 0 },
    { kind: 'select', id: 'win', label: 'Window', value: 'hamming', options: [{ value: 'rect', label: 'Rectangular' }, { value: 'hann', label: 'Hann' }, { value: 'hamming', label: 'Hamming' }, { value: 'blackman', label: 'Blackman' }] },
  ],
  dt: 1 / 20, previewSeconds: 1, init() { return { t: 0 }; }, step(s, _v, dt) { s.t += dt; },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const L = Math.max(5, Math.round(num(v, 'len')) | 1), M = L - 1, fc = num(v, 'fc'), bw = num(v, 'bw'), type = str(v, 'type');
    const sinc = (x: number) => (Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
    const lpf = (f: number, n: number) => 2 * f * sinc(2 * f * n);
    const hh: number[] = [];
    for (let n = 0; n <= M; n++) { const m = n - M / 2; const r = type === 'lp' ? lpf(fc, m) : type === 'hp' ? (Math.abs(m) < 1e-9 ? 1 : 0) - lpf(fc, m) : lpf(Math.min(0.49, fc + bw / 2), m) - lpf(Math.max(0.005, fc - bw / 2), m); hh.push(r * WIN(n, M, str(v, 'win'))); }
    const A = { x: 8, y: 8, w: w - 16, h: h * 0.38 }, B = { x: 8, y: A.y + A.h + 8, w: w - 16, h: h - A.h - 32 };
    const mh = Math.max(0.1, ...hh.map(Math.abs)) * 1.1, m1 = plot(c, A, [0, M], [-mh, mh], { title: 'impulse response h[n]', zeroAxis: true });
    hh.forEach((val, n) => { line(c, m1.X(n), m1.Y(0), m1.X(n), m1.Y(val), C.cyan, 1.5); circle(c, m1.X(n), m1.Y(val), 2.5, C.cyan); });
    const pts: [number, number][] = [], K = 200;
    for (let k = 0; k <= K; k++) { const f = 0.5 * k / K; let re = 0, im = 0; hh.forEach((val, n) => { re += val * Math.cos(TAU * f * n); im -= val * Math.sin(TAU * f * n); }); pts.push([f, 20 * Math.log10(Math.hypot(re, im) + 1e-6)]); }
    const m2 = plot(c, B, [0, 0.5], [-90, 5], { title: '|H(f)| (dB)', xlabel: 'normalised frequency' });
    polyline(c, pts.map(([f, d]) => [m2.X(f), m2.Y(clamp(d, -90, 5))] as [number, number]), C.amber, 2);
    line(c, m2.X(fc), B.y + 20, m2.X(fc), B.y + B.h - 24, 'rgba(255,255,255,0.3)', 1, [4, 4]);
  },
  readouts(_s, v) { const L = Math.round(num(v, 'len')) | 1; return [{ label: 'Taps', value: String(L) }, { label: 'Group delay', value: `${(L - 1) / 2} samples` }, { label: 'Type', value: str(v, 'type') }]; },
  equations() { return ['h[n]=2f_c\\,\\mathrm{sinc}\\!\\left(2f_c\\left(n-\\tfrac M2\\right)\\right)w[n]', 'H(e^{j\\omega})=\\sum_{n=0}^{M}h[n]e^{-j\\omega n}', '\\tau_g=M/2']; },
});

/* ================= Graph theory runtime: Dijkstra / BFS / MST ================= */
interface GS { nodes: [number, number][]; edges: [number, number, number][]; dist: number[]; prev: number[]; done: boolean[]; order: number[]; cur: number; steps: number; mst: Set<number>; acc: number; mode: string; uf: number[] }
function mkGraph(seed: number, n: number) {
  let a = seed * 9301 + 49297; const R = () => { a = (a * 9301 + 49297) % 233280; return a / 233280; };
  const nodes: [number, number][] = []; for (let i = 0; i < n; i++) nodes.push([0.08 + 0.84 * ((i % 4) / 3) + (R() - 0.5) * 0.08, 0.1 + 0.8 * (Math.floor(i / 4) / Math.max(1, Math.ceil(n / 4) - 1)) + (R() - 0.5) * 0.08]);
  const edges: [number, number, number][] = [], seen = new Set<string>();
  const add = (i: number, j: number) => { const k = i < j ? `${i}-${j}` : `${j}-${i}`; if (i === j || seen.has(k)) return; seen.add(k); edges.push([i, j, 1 + Math.floor(R() * 9)]); };
  for (let i = 0; i < n; i++) { if (i % 4 < 3 && i + 1 < n) add(i, i + 1); if (i + 4 < n) add(i, i + 4); if (R() < 0.35 && i + 5 < n && i % 4 < 3) add(i, i + 5); }
  return { nodes, edges };
}
export const graphRuntime = defineSim<GS & { n: number; seed: number }>({
  id: 'graph_shortest_path_mst', title: 'Graph Algorithms Runtime: Dijkstra, BFS & Kruskal MST Step by Step',
  ...meta('Computer Science', 'Intermediate', 'Algorithms', 'Graph Theory', 'Shortest paths, spanning trees, algorithm run-time visualisation', [...PG_ALL, ...UG_ENG, 'B.Sc', 'BCA']),
  covers: ['Graph theory', 'Dijkstra algorithm', 'Breadth-first search', 'Minimum spanning tree', 'Kruskal algorithm', 'Greedy algorithm', 'Priority queue', 'Union-find'],
  tags: ['DSA', 'GATE', 'algorithms', 'shortest path', 'data structures', 'BCA', 'B.Tech CS'],
  learningObjectives: ['Watch Dijkstra settle nodes in order of distance.', 'Compare BFS (hops) with Dijkstra (weights).', 'See Kruskal add the cheapest edge that does not create a cycle.'],
  assumptions: ['Random weighted undirected grid-like graph with positive integer weights; source = node 0.'],
  blurb: 'Run Dijkstra, BFS or Kruskal on a random weighted graph one step at a time. Settled nodes, tentative distances and tree edges are drawn live.',
  hint: 'Dijkstra: repeatedly settle the unsettled node with smallest tentative distance and relax its edges (O((V+E) log V)). Kruskal: sort edges, add if endpoints are in different union-find sets.',
  params: [
    { kind: 'select', id: 'algo', label: 'Algorithm', value: 'dijkstra', resetOnChange: true, options: [{ value: 'dijkstra', label: 'Dijkstra' }, { value: 'bfs', label: 'BFS (unweighted)' }, { value: 'kruskal', label: 'Kruskal MST' }] },
    { kind: 'number', id: 'n', label: 'Nodes', min: 6, max: 16, step: 1, value: 12, digits: 0, resetOnChange: true },
    { kind: 'number', id: 'speed', label: 'Steps per second', min: 0.5, max: 10, step: 0.5, value: 2, digits: 1 },
  ],
  actions: [{ id: 'newgraph', label: 'New random graph' }],
  dt: 1 / 20, previewSeconds: 6,
  init(v) { const n = Math.round(num(v, 'n')), seed = 7; const g = mkGraph(seed, n); const s = { n, seed, ...g, dist: Array(n).fill(Infinity), prev: Array(n).fill(-1), done: Array(n).fill(false), order: [] as number[], cur: -1, steps: 0, mst: new Set<number>(), acc: 0, mode: str(v, 'algo'), uf: Array.from({ length: n }, (_, i) => i) }; s.dist[0] = 0; return s; },
  action(s, v, id) { if (id === 'newgraph') { const seed = s.seed + 11, g = mkGraph(seed, s.n); Object.assign(s, g, { seed, dist: Array(s.n).fill(Infinity), prev: Array(s.n).fill(-1), done: Array(s.n).fill(false), order: [], cur: -1, steps: 0, mst: new Set<number>(), acc: 0, uf: Array.from({ length: s.n }, (_, i) => i), mode: str(v, 'algo') }); s.dist[0] = 0; } },
  step(s, v, dt) {
    s.acc += dt * num(v, 'speed'); while (s.acc >= 1) { s.acc -= 1; advance(s); }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const pw = Math.min(w, h * 1.5), ox = (w - pw) / 2, ph = h - 40;
    const P = (i: number): [number, number] => [ox + s.nodes[i][0] * pw, 14 + s.nodes[i][1] * ph];
    s.edges.forEach(([a, b, wt], k) => { const [x1, y1] = P(a), [x2, y2] = P(b), inT = s.mode === 'kruskal' ? s.mst.has(k) : s.prev[b] === a || s.prev[a] === b; line(c, x1, y1, x2, y2, inT ? C.green : 'rgba(148,163,184,0.45)', inT ? 3.5 : 1.2); text(c, String(wt), (x1 + x2) / 2, (y1 + y2) / 2 - 3, C.amber, 10, 'center'); });
    s.nodes.forEach((_, i) => { const [x, y] = P(i); circle(c, x, y, 13, i === s.cur ? C.amber : s.done[i] ? 'rgba(34,197,94,0.8)' : '#1e293b', i === 0 ? C.cyan : C.white, i === 0 ? 2.5 : 1); text(c, String(i), x, y + 4, C.white, 11, 'center', 'alphabetic', true); if (s.mode !== 'kruskal') text(c, Number.isFinite(s.dist[i]) ? String(s.dist[i]) : '∞', x, y - 17, C.cyan, 10, 'center'); });
    text(c, s.mode === 'kruskal' ? `Kruskal: ${s.mst.size}/${s.n - 1} tree edges, total weight ${[...s.mst].reduce((a, k) => a + s.edges[k][2], 0)}` : `${s.mode}: settled ${s.order.length}/${s.n}  (cyan = distance from node 0, amber = current)`, 10, h - 8, C.text, 11);
  },
  readouts(s) { const reach = s.dist.filter(Number.isFinite); return [{ label: 'Steps', value: s.steps }, { label: 'Settled / tree edges', value: s.mode === 'kruskal' ? `${s.mst.size}` : `${s.order.length}` }, { label: 'Farthest reached', value: reach.length ? String(Math.max(...reach)) : '0' }]; },
  equations() { return ['d[v]\\leftarrow\\min\\bigl(d[v],\\,d[u]+w(u,v)\\bigr)', 'T_{\\text{Dijkstra}}=O\\bigl((V+E)\\log V\\bigr)', 'T_{\\text{Kruskal}}=O(E\\log E)']; },
});
function find(uf: number[], x: number): number { while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x]; } return x; }
function advance(s: GS & { n: number }) {
  if (s.mode === 'kruskal') {
    if (!s.order.length) s.order = s.edges.map((_, i) => i).sort((a, b) => s.edges[a][2] - s.edges[b][2] || a - b);
    while (s.steps < s.edges.length) { const k = s.order[s.steps++], [a, b] = s.edges[k], ra = find(s.uf, a), rb = find(s.uf, b); if (ra !== rb) { s.uf[ra] = rb; s.mst.add(k); s.cur = a; for (let i = 0; i < s.n; i++) s.done[i] = s.done[i] || i === a || i === b; return; } }
    return;
  }
  let u = -1; for (let i = 0; i < s.n; i++) if (!s.done[i] && Number.isFinite(s.dist[i]) && (u < 0 || s.dist[i] < s.dist[u])) u = i;
  if (u < 0) { s.cur = -1; return; }
  s.done[u] = true; s.cur = u; s.order.push(u); s.steps++;
  for (const [a, b, wt] of s.edges) { const [x, y] = a === u ? [a, b] : b === u ? [b, a] : [-1, -1]; if (x < 0) continue; const nd = s.dist[x] + (s.mode === 'bfs' ? 1 : wt); if (nd < s.dist[y]) { s.dist[y] = nd; s.prev[y] = x; } }
}

/* ================= Neural-network weights visualiser ================= */
interface NNS { W1: number[][]; b1: number[]; W2: number[][]; b2: number[]; X: number[][]; Y: number[]; epoch: number; loss: number[]; acc: number }
const DIGITS: string[][] = [
  ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'], ['..X..', '.XX..', '..X..', '..X..', '..X..', '..X..', '.XXX.'], ['.XXX.', 'X...X', '....X', '..XX.', '.X...', 'X....', 'XXXXX'], ['XXXX.', '....X', '....X', '.XXX.', '....X', '....X', 'XXXX.'],
];
const flat = (d: string[]) => d.flatMap(r => [...r].map(ch => (ch === 'X' ? 1 : 0)));
export const nnWeights = defineSim<NNS>({
  id: 'nn_weights_visualizer', title: 'Neural Network Weights Visualiser: What Hidden Neurons Learn',
  ...meta('Computer Science', 'Advanced', 'Machine Learning', 'Neural Networks', 'Hidden-layer feature detectors, weight matrices, training dynamics'),
  covers: ['Neural network', 'Weights and biases', 'Hidden layer', 'Feature detector', 'Backpropagation', 'Softmax', 'Cross-entropy loss', 'Gradient descent'],
  tags: ['deep learning', 'AI', 'MLP', 'interpretability', 'digit recognition', 'M.Tech', 'weights'],
  learningObjectives: ['See each hidden neuron’s 5×7 weight image evolve into a feature detector.', 'Relate loss/accuracy curves to the weight changes.', 'Add pixel noise and see robustness drop.'],
  assumptions: ['Tiny 35-6-4 network (tanh hidden, softmax output) trained on four 5×7 glyphs (1,0? style digits) with random pixel-flip augmentation; not a real MNIST model.'],
  blurb: 'A small network learns to recognise four 5×7 digit glyphs. The hidden neurons’ weights are shown as images: red = positive, blue = negative. Watch them become feature detectors.',
  hint: 'h=tanh(W1x+b1); p=softmax(W2h+b2). Each W1 row is a template; bright pixels the neuron likes. Cross-entropy gradient: (p−y)hᵀ.',
  params: [
    { kind: 'number', id: 'hid', label: 'Hidden neurons', min: 2, max: 8, step: 1, value: 6, digits: 0, resetOnChange: true },
    { kind: 'number', id: 'lr', label: 'Learning rate', min: 0.01, max: 1, step: 0.01, value: 0.15, digits: 2 },
    { kind: 'number', id: 'flip', label: 'Training noise (pixel flip prob.)', min: 0, max: 0.25, step: 0.01, value: 0.05, digits: 2 },
  ],
  actions: [{ id: 'reinit', label: 'Re-initialise weights' }],
  dt: 1 / 30, previewSeconds: 6,
  init(v) { const H = Math.round(num(v, 'hid')); return mkNN(H); },
  action(s, v) { Object.assign(s, mkNN(Math.round(num(v, 'hid')))); },
  step(s, v) {
    const H = s.b1.length, lr = num(v, 'lr'), fl = num(v, 'flip');
    for (let it = 0; it < 12; it++) {
      const k = (s.epoch * 7 + it) % 4, x = s.X[k].map((p, i) => (hash(s.epoch * 31 + it * 7 + i) < fl ? 1 - p : p)), h = s.W1.map((w, j) => Math.tanh(w.reduce((a, wi, i) => a + wi * x[i], s.b1[j])));
      const z = s.W2.map((w, o) => w.reduce((a, wi, j) => a + wi * h[j], s.b2[o])), mz = Math.max(...z), e = z.map(q => Math.exp(q - mz)), se = e.reduce((a, b) => a + b, 0), p = e.map(q => q / se);
      const dz = p.map((q, o) => q - (o === k ? 1 : 0)); s.loss.push(-Math.log(p[k] + 1e-9)); if (s.loss.length > 600) s.loss.shift();
      const dh = Array(H).fill(0).map((_, j) => dz.reduce((a, d, o) => a + d * s.W2[o][j], 0) * (1 - h[j] * h[j]));
      for (let o = 0; o < 4; o++) { for (let j = 0; j < H; j++) s.W2[o][j] -= lr * dz[o] * h[j]; s.b2[o] -= lr * dz[o]; }
      for (let j = 0; j < H; j++) { for (let i = 0; i < 35; i++) s.W1[j][i] -= lr * dh[j] * x[i]; s.b1[j] -= lr * dh[j]; }
    }
    s.epoch++; let ok = 0; for (let k = 0; k < 4; k++) ok += classify(s, s.X[k]) === k ? 1 : 0; s.acc = ok / 4;
  },
  draw(c, s, _v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const H = s.b1.length, cell = Math.max(3, Math.min((w * 0.62) / (Math.min(H, 4) * 6.5), (h * 0.5) / (Math.ceil(H / 4) * 8.5), 12));
    text(c, 'hidden-neuron weights (35 inputs each) · red + / blue −', 10, 16, C.text, 11, 'left', 'alphabetic', true);
    const mw = Math.max(0.3, ...s.W1.flat().map(Math.abs));
    s.W1.forEach((row, j) => { const ox = 10 + (j % 4) * cell * 6.5, oy = 26 + Math.floor(j / 4) * cell * 8.5; row.forEach((wv, i) => { const a = Math.min(1, Math.abs(wv) / mw); c.fillStyle = wv >= 0 ? `rgba(239,68,68,${a})` : `rgba(59,130,246,${a})`; c.fillRect(ox + (i % 5) * cell, oy + Math.floor(i / 5) * cell, cell - 0.5, cell - 0.5); }); text(c, `h${j + 1}`, ox + 2.5 * cell, oy + 7.6 * cell, C.dim, 9, 'center'); });
    const G = { x: w * 0.66, y: 6, w: w * 0.33 - 6, h: h * 0.5 }; const m = plot(c, G, [0, Math.max(50, s.loss.length)], [0, Math.max(1, ...s.loss)], { title: 'loss (recent)' });
    polyline(c, s.loss.map((l, i) => [m.X(i), m.Y(l)] as [number, number]), C.amber, 1.2);
    const by = Math.min(h - 70, 26 + Math.ceil(H / 4) * cell * 8.5 + 6); text(c, 'test glyphs → predicted class', 10, by, C.text, 11, 'left', 'alphabetic', true);
    for (let k = 0; k < 4; k++) { const ox = 10 + k * 84; DIGITS[k].forEach((r, y) => [...r].forEach((ch, x) => { c.fillStyle = ch === 'X' ? C.white : '#1e293b'; c.fillRect(ox + x * 5, by + 6 + y * 5, 4.4, 4.4); })); const pk = classify(s, s.X[k]); text(c, `→ ${pk}`, ox + 30, by + 22, pk === k ? C.green : C.red, 12, 'left', 'alphabetic', true); }
  },
  readouts(s) { return [{ label: 'Iterations', value: s.epoch * 12 }, { label: 'Accuracy on 4 glyphs', value: `${fmt(s.acc * 100, 0)} %` }, { label: 'Recent loss', value: fmt(s.loss.slice(-40).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(40, s.loss.length)), 3) }]; },
  equations() { return ['h=\\tanh(W_1\\mathbf x+\\mathbf b_1),\\quad \\mathbf p=\\mathrm{softmax}(W_2\\mathbf h+\\mathbf b_2)', 'L=-\\ln p_y', '\\dfrac{\\partial L}{\\partial W_2}=(\\mathbf p-\\mathbf y)\\mathbf h^{\\top}']; },
});
function hash(n: number) { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
function mkNN(H: number): NNS { return { W1: Array.from({ length: H }, () => Array.from({ length: 35 }, () => gauss() * 0.25)), b1: Array(H).fill(0), W2: Array.from({ length: 4 }, () => Array.from({ length: H }, () => gauss() * 0.3)), b2: Array(4).fill(0), X: DIGITS.map(flat), Y: [0, 1, 2, 3], epoch: 0, loss: [], acc: 0 }; }
function classify(s: NNS, x: number[]) { const h = s.W1.map((w, j) => Math.tanh(w.reduce((a, wi, i) => a + wi * x[i], s.b1[j]))), z = s.W2.map((w, o) => w.reduce((a, wi, j) => a + wi * h[j], s.b2[o])); return z.indexOf(Math.max(...z)); }
void bool;
