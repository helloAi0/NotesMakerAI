import { defineSim, num, str, PG_ALL, UG_ENG } from './types';
import type { EducationLevel } from './types';
import { C, circle, clamp, fmt, panel, plot, polyline, text } from './draw';

const LV: EducationLevel[] = [...PG_ALL, ...UG_ENG, 'B.Sc'];
const N = 40;
const NP = N * N;

/* ---------- deterministic RNG so a scene is reproducible ---------- */
function rng(seed: number) {
  let a = (seed * 2654435761) >>> 0 || 1;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const g = () => { const x = Math.max(1e-9, u()), y = u(); return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * y); };
  return { u, g };
}

interface Scene { clean: Float32Array; img: Float32Array; gt: Uint8Array }

function boxBlur(src: Float32Array, r: number): Float32Array {
  if (r <= 0) return Float32Array.from(src);
  const out = new Float32Array(NP);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let a = 0, n = 0;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const yy = y + j, xx = x + i; if (yy >= 0 && yy < N && xx >= 0 && xx < N) { a += src[yy * N + xx]; n++; } }
    out[y * N + x] = a / n;
  }
  return out;
}

function makeScene(seed: number, nObj: number, noise: number, blur: number): Scene {
  const R = rng(seed + 1);
  const clean = new Float32Array(NP), gt = new Uint8Array(NP);
  const gx = (R.u() - 0.5) * 0.12, gy = (R.u() - 0.5) * 0.12;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) clean[y * N + x] = 0.28 + gx * (x / N) + gy * (y / N);
  for (let k = 0; k < nObj; k++) {
    const cx = 6 + R.u() * (N - 12), cy = 6 + R.u() * (N - 12), r = 4 + R.u() * 4, isRect = R.u() < 0.4, inten = 0.68 + R.u() * 0.2;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const inside = isRect ? Math.abs(x - cx) <= r && Math.abs(y - cy) <= r * 0.8 : (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
      if (inside) { clean[y * N + x] = inten; gt[y * N + x] = 1; }
    }
  }
  let img = boxBlur(clean, Math.round(blur));
  const out = new Float32Array(NP);
  for (let i = 0; i < NP; i++) out[i] = clamp(img[i] + R.g() * noise, 0, 1);
  img = out;
  return { clean, img, gt };
}

/* ---------- classical models ---------- */
function otsu(img: Float32Array): { mask: Uint8Array; t: number; hist: number[] } {
  const B = 32, hist = Array(B).fill(0);
  for (let i = 0; i < NP; i++) hist[Math.min(B - 1, Math.floor(img[i] * B))]++;
  let best = -1, bt = 0.5; const total = NP; let sumAll = 0;
  for (let b = 0; b < B; b++) sumAll += b * hist[b];
  let wB = 0, sumB = 0;
  for (let b = 0; b < B - 1; b++) {
    wB += hist[b]; sumB += b * hist[b];
    const wF = total - wB; if (wB === 0 || wF === 0) continue;
    const mB = sumB / wB, mF = (sumAll - sumB) / wF, between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; bt = (b + 1) / B; }
  }
  const mask = new Uint8Array(NP); for (let i = 0; i < NP; i++) mask[i] = img[i] >= bt ? 1 : 0;
  return { mask, t: bt, hist };
}

function kmeans2(img: Float32Array): { mask: Uint8Array; c0: number; c1: number } {
  let c0 = 0.2, c1 = 0.8;
  for (let it = 0; it < 12; it++) {
    let s0 = 0, n0 = 0, s1 = 0, n1 = 0;
    for (let i = 0; i < NP; i++) { if (Math.abs(img[i] - c0) <= Math.abs(img[i] - c1)) { s0 += img[i]; n0++; } else { s1 += img[i]; n1++; } }
    if (n0) c0 = s0 / n0; if (n1) c1 = s1 / n1;
  }
  const mask = new Uint8Array(NP); for (let i = 0; i < NP; i++) mask[i] = Math.abs(img[i] - c1) < Math.abs(img[i] - c0) ? 1 : 0;
  return { mask, c0, c1 };
}

function regionGrow(img: Float32Array, tol: number): Uint8Array {
  const sm = boxBlur(img, 1); let mx = 0; for (let i = 0; i < NP; i++) mx = Math.max(mx, sm[i]);
  const mask = new Uint8Array(NP), stack: number[] = []; let sum = 0, cnt = 0;
  for (let i = 0; i < NP; i++) if (sm[i] >= mx * 0.93) { mask[i] = 1; stack.push(i); sum += img[i]; cnt++; }
  const mean = cnt ? sum / cnt : 0.7;
  while (stack.length) {
    const p = stack.pop()!, x = p % N, y = (p - x) / N;
    const nb = [x > 0 ? p - 1 : -1, x < N - 1 ? p + 1 : -1, y > 0 ? p - N : -1, y < N - 1 ? p + N : -1];
    for (const q of nb) if (q >= 0 && !mask[q] && Math.abs(sm[q] - mean) < tol) { mask[q] = 1; stack.push(q); }
  }
  return mask;
}

/* ---------- U-Net-style model: fixed multi-scale encoder + trained 1x1 decoder head ---------- */
const NF = 7;
function features(img: Float32Array): Float32Array {
  const e1 = boxBlur(img, 1), e2 = boxBlur(img, 3), bott = boxBlur(img, 7); // encoder levels: 3x3, 7x7, 15x15 (bottleneck)
  const f = new Float32Array(NP * NF);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, xl = x > 0 ? i - 1 : i, xr = x < N - 1 ? i + 1 : i, yu = y > 0 ? i - N : i, yd = y < N - 1 ? i + N : i;
    const gm = Math.hypot(e1[xr] - e1[xl], e1[yd] - e1[yu]);
    const o = i * NF;
    f[o] = img[i]; f[o + 1] = e1[i]; f[o + 2] = e2[i]; f[o + 3] = bott[i]; f[o + 4] = e1[i] - bott[i]; f[o + 5] = gm * 4; f[o + 6] = e2[i] - e1[i];
  }
  return f;
}
const sig = (z: number) => 1 / (1 + Math.exp(-clamp(z, -30, 30)));
function predictProb(f: Float32Array, w: number[]): Float32Array {
  const p = new Float32Array(NP);
  for (let i = 0; i < NP; i++) { let z = w[NF]; for (let k = 0; k < NF; k++) z += w[k] * f[i * NF + k]; p[i] = sig(z); }
  return p;
}

interface Metric { iou: number; dice: number; prec: number; rec: number; tp: number; fp: number; fn: number; tn: number }
function metric(pred: Uint8Array, gt: Uint8Array): Metric {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (let i = 0; i < NP; i++) { if (pred[i] && gt[i]) tp++; else if (pred[i]) fp++; else if (gt[i]) fn++; else tn++; }
  const iou = tp + fp + fn ? tp / (tp + fp + fn) : 1, dice = 2 * tp + fp + fn ? (2 * tp) / (2 * tp + fp + fn) : 1;
  return { iou, dice, prec: tp + fp ? tp / (tp + fp) : 0, rec: tp + fn ? tp / (tp + fn) : 0, tp, fp, fn, tn };
}

const MODELS = [
  { value: 'otsu', label: 'Otsu threshold' },
  { value: 'kmeans', label: 'K-means (k=2)' },
  { value: 'region', label: 'Region growing' },
  { value: 'unet', label: 'U-Net-style (trained)' },
];

interface SegS {
  seed: number; key: string; scene: Scene; smooth: Float32Array; grad: Float32Array;
  trainKey: string; train: { f: Float32Array; y: Uint8Array }[]; w: number[]; epoch: number; loss: number[];
  masks: Record<string, Uint8Array>; met: Record<string, Metric>; thr: number; hist: number[]; t: number;
}
const sceneKey = (v: Record<string, number | string | boolean>) => `${num(v, 'objs')}|${num(v, 'noise')}|${num(v, 'blur')}`;

function initTrain(s: SegS, v: Record<string, number | string | boolean>) {
  s.trainKey = sceneKey(v); s.train = [];
  for (let k = 0; k < 6; k++) { const sc = makeScene(1000 + k * 17, num(v, 'objs'), num(v, 'noise'), num(v, 'blur')); s.train.push({ f: features(sc.img), y: sc.gt }); }
  s.w = [0, 0, 0, 0, 0, 0, 0, 0]; s.epoch = 0; s.loss = [];
}

function trainEpochs(s: SegS, lr: number, n: number) {
  const M = s.train.length * NP;
  for (let e = 0; e < n; e++) {
    const g = Array(NF + 1).fill(0); let L = 0;
    for (const t of s.train) {
      for (let i = 0; i < NP; i++) {
        let z = s.w[NF]; for (let k = 0; k < NF; k++) z += s.w[k] * t.f[i * NF + k];
        const p = sig(z), d = p - t.y[i];
        L -= t.y[i] ? Math.log(p + 1e-9) : Math.log(1 - p + 1e-9);
        for (let k = 0; k < NF; k++) g[k] += d * t.f[i * NF + k]; g[NF] += d;
      }
    }
    for (let k = 0; k <= NF; k++) s.w[k] -= (lr * g[k]) / M * 20;
    s.loss.push(L / M); s.epoch++;
  }
}

function recompute(s: SegS, v: Record<string, number | string | boolean>) {
  const img = s.scene.img;
  const o = otsu(img), k = kmeans2(img), rg = regionGrow(img, num(v, 'tol'));
  const f = features(img), pr = predictProb(f, s.w), un = new Uint8Array(NP);
  for (let i = 0; i < NP; i++) un[i] = pr[i] >= 0.5 ? 1 : 0;
  s.masks = { otsu: o.mask, kmeans: k.mask, region: rg, unet: un };
  s.met = {}; for (const m of MODELS) s.met[m.value] = metric(s.masks[m.value], s.scene.gt);
  s.thr = o.t; s.hist = o.hist;
  s.smooth = boxBlur(img, 1);
  s.grad = new Float32Array(NP);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; s.grad[i] = Math.hypot(s.smooth[x < N - 1 ? i + 1 : i] - s.smooth[x > 0 ? i - 1 : i], s.smooth[y < N - 1 ? i + N : i] - s.smooth[y > 0 ? i - N : i]) * 3; }
}

function build(seed: number, v: Record<string, number | string | boolean>): SegS {
  const scene = makeScene(seed, num(v, 'objs'), num(v, 'noise'), num(v, 'blur'));
  const s = { seed, key: sceneKey(v) + '|' + String(num(v, 'tol')), scene, t: 0, loss: [], epoch: 0, w: [0, 0, 0, 0, 0, 0, 0, 0], train: [], trainKey: '', masks: {}, met: {}, thr: 0.5, hist: [], smooth: new Float32Array(NP), grad: new Float32Array(NP) } as SegS;
  initTrain(s, v); trainEpochs(s, num(v, 'lr'), 5); recompute(s, v);
  return s;
}

function gridDraw(c: CanvasRenderingContext2D, x0: number, y0: number, size: number, title: string, color: (i: number) => string) {
  const cs = size / N;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { c.fillStyle = color(y * N + x); c.fillRect(x0 + x * cs, y0 + y * cs, cs + 0.6, cs + 0.6); }
  c.strokeStyle = 'rgba(148,163,184,0.4)'; c.lineWidth = 1; c.strokeRect(x0, y0, size, size);
  text(c, title, x0 + size / 2, y0 - 5, C.text, 11, 'center', 'alphabetic', true);
}
const grey = (v: number) => { const g = Math.round(clamp(v, 0, 1) * 255); return `rgb(${g},${g},${g})`; };

export const aiSegmentationLab = defineSim<SegS>({
  id: 'ai_segmentation_lab', title: 'AI Image Segmentation Lab: Thresholding, K-means, Region Growing & U-Net-style Network',
  subject: 'Computer Science', status: 'active', educationLevels: LV, difficulty: 'Advanced', category: 'Computer Vision', topic: 'Image Segmentation', subtopic: 'Image processing, classical vs learned segmentation, IoU / Dice evaluation',
  covers: ['Image segmentation', 'Otsu thresholding', 'K-means clustering', 'Region growing', 'U-Net', 'Encoder-decoder network', 'IoU and Dice score', 'Image noise and blur', 'Convolution filtering'],
  tags: ['AI segmentation', 'image processing', 'computer vision', 'U-Net', 'medical imaging', 'M.Tech', 'deep learning', 'semantic segmentation', 'Otsu', 'IoU', 'Dice'],
  learningObjectives: ['Follow the pipeline: image → pre-processing (smoothing, gradient, histogram) → segmentation model → evaluation.', 'Compare Otsu, K-means, region growing and a learned encoder-decoder on the same noisy image.', 'Measure quality with IoU and Dice and see how noise and blur hurt classical methods.', 'See how a decoder head trained on separate images combines multi-scale encoder features.'],
  assumptions: ['Synthetic 40×40 grey-scale scenes (bright discs/rectangles on a dim background) with exact ground-truth masks.', '"U-Net-style" here means a FIXED multi-scale encoder (3×3, 7×7 and 15×15 box filters = skip features + bottleneck, gradient magnitude) with a decoder head (logistic regression on those features) TRAINED by gradient descent on 6 separate images. It is not a full deep U-Net with learned convolutions.', 'Everything runs locally in your browser; no pretrained weights or network calls.'],
  blurb: 'Choose a module (Image processing → Segmentation → Evaluation) and a model (Otsu, K-means, region growing or a U-Net-style network). Add noise and blur to a synthetic scene and watch IoU / Dice change.',
  hint: 'Image processing: smoothing (box filter), gradient magnitude and the intensity histogram. Segmentation: Otsu picks the threshold maximising between-class variance; K-means clusters intensities; region growing floods from the brightest seeds; the U-Net-style model learns a per-pixel classifier on multi-scale encoder features (skip connections = fine scale, bottleneck = context). Evaluation: IoU = TP/(TP+FP+FN), Dice = 2TP/(2TP+FP+FN).',
  params: [
    { kind: 'select', id: 'module', label: 'Module', value: 'seg', options: [{ value: 'imageprocessing', label: 'Image processing' }, { value: 'seg', label: 'Segmentation' }, { value: 'eval', label: 'Evaluation' }] },
    { kind: 'select', id: 'model', label: 'Model', value: 'otsu', options: MODELS },
    { kind: 'number', id: 'noise', label: 'Noise σ', min: 0, max: 0.4, step: 0.01, value: 0.12, digits: 2, resetOnChange: true },
    { kind: 'number', id: 'blur', label: 'Blur radius (px)', min: 0, max: 3, step: 1, value: 1, digits: 0, resetOnChange: true },
    { kind: 'number', id: 'objs', label: 'Number of objects', min: 1, max: 6, step: 1, value: 3, digits: 0, resetOnChange: true },
    { kind: 'number', id: 'tol', label: 'Region-growing tolerance', min: 0.05, max: 0.5, step: 0.01, value: 0.2, digits: 2 },
    { kind: 'number', id: 'lr', label: 'U-Net learning rate', min: 0.05, max: 2, step: 0.05, value: 0.6, digits: 2 },
  ],
  actions: [{ id: 'newimage', label: 'New random image' }, { id: 'retrain', label: 'Re-train U-Net head' }],
  dt: 1 / 20, previewSeconds: 4,
  init(v) { return build(7, v); },
  action(s, v, id) {
    if (id === 'newimage') { const n = build(s.seed + 13, v); Object.assign(s, n); }
    if (id === 'retrain') { initTrain(s, v); trainEpochs(s, num(v, 'lr'), 3); recompute(s, v); }
  },
  step(s, v) {
    s.t++;
    if (s.trainKey !== sceneKey(v)) { initTrain(s, v); }
    if (s.epoch < 160) { trainEpochs(s, num(v, 'lr'), 4); }
    if (s.epoch < 164 || s.t % 20 === 0) recompute(s, v);
    if (s.scene && s.key.split('|').slice(0, 3).join('|') !== sceneKey(v)) { const n = build(s.seed, v); Object.assign(s, n); }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const mod = str(v, 'module'), model = str(v, 'model'), mask = s.masks[model] ?? s.masks.otsu, gt = s.scene.gt;
    const label = MODELS.find(m => m.value === model)?.label ?? model;
    const sz = Math.max(60, Math.min((w - 50) / 4, (h - 80) / 1.5, 170)), oy = 44;
    const gap = Math.max(6, (w - 4 * sz) / 5);
    const X = (k: number) => gap + k * (sz + gap);
    if (mod === 'imageprocessing') {
      text(c, 'Module 1 · Image processing (pre-processing before segmentation)', 10, 16, C.amber, 12, 'left', 'alphabetic', true);
      gridDraw(c, X(0), oy, sz, 'clean scene', i => grey(s.scene.clean[i]));
      gridDraw(c, X(1), oy, sz, `captured (blur+noise)`, i => grey(s.scene.img[i]));
      gridDraw(c, X(2), oy, sz, 'smoothed 3×3', i => grey(s.smooth[i]));
      gridDraw(c, X(3), oy, sz, 'gradient magnitude', i => grey(s.grad[i]));
      const R = { x: 10, y: oy + sz + 22, w: Math.min(w - 20, 420), h: Math.max(60, h - oy - sz - 30) };
      const mx = Math.max(1, ...s.hist), m = plot(c, R, [0, 1], [0, mx], { title: 'Intensity histogram & Otsu threshold', xlabel: 'intensity' });
      s.hist.forEach((cnt, b) => { const x0 = m.X(b / 32), x1 = m.X((b + 1) / 32); c.fillStyle = 'rgba(34,211,238,0.55)'; c.fillRect(x0, m.Y(cnt), Math.max(1, x1 - x0 - 1), m.Y(0) - m.Y(cnt)); });
      c.strokeStyle = C.amber; c.lineWidth = 2; c.beginPath(); c.moveTo(m.X(s.thr), m.Y(0)); c.lineTo(m.X(s.thr), m.Y(mx)); c.stroke();
    } else if (mod === 'eval') {
      text(c, 'Module 3 · Evaluation (IoU / Dice vs ground truth)', 10, 16, C.amber, 12, 'left', 'alphabetic', true);
      const R = { x: 10, y: 26, w: Math.min(w * 0.55, 380), h: Math.min(h - 36, 220) };
      panel(c, R, C.panel); const bw = (R.w - 40) / MODELS.length;
      text(c, 'IoU (solid) and Dice (light)', R.x + 8, R.y + 14, C.text, 11, 'left', 'alphabetic', true);
      MODELS.forEach((m, i) => {
        const x = R.x + 20 + i * bw, mt = s.met[m.value], bh = R.h - 60;
        c.fillStyle = m.value === model ? C.amber : C.cyan; c.fillRect(x, R.y + 24 + bh * (1 - mt.iou), bw * 0.4, bh * mt.iou);
        c.fillStyle = 'rgba(148,163,184,0.7)'; c.fillRect(x + bw * 0.42, R.y + 24 + bh * (1 - mt.dice), bw * 0.4, bh * mt.dice);
        text(c, fmt(mt.iou, 2), x + bw * 0.2, R.y + 20 + bh * (1 - mt.iou), C.text, 9, 'center');
        text(c, m.label.split(' ')[0], x + bw * 0.4, R.y + R.h - 26, m.value === model ? C.amber : C.dim, 10, 'center');
      });
      const G = { x: R.x + R.w + 10, y: 26, w: Math.max(100, w - R.w - 30), h: 120 };
      const lm = Math.max(0.3, ...s.loss), pm = plot(c, G, [0, Math.max(20, s.loss.length)], [0, lm], { title: 'U-Net head training loss', xlabel: 'epoch' });
      polyline(c, s.loss.map((l, i) => [pm.X(i), pm.Y(l)] as [number, number]), C.green, 2);
      const mt = s.met[model];
      text(c, `${label}: TP ${mt.tp}  FP ${mt.fp}  FN ${mt.fn}  TN ${mt.tn}`, G.x, G.y + G.h + 20, C.text, 11);
      text(c, `precision ${fmt(mt.prec, 2)}   recall ${fmt(mt.rec, 2)}`, G.x, G.y + G.h + 36, C.dim, 11);
    } else {
      text(c, `Module 2 · Segmentation — model: ${label}`, 10, 16, C.amber, 12, 'left', 'alphabetic', true);
      gridDraw(c, X(0), oy, sz, 'input image', i => grey(s.scene.img[i]));
      gridDraw(c, X(1), oy, sz, 'ground truth', i => (gt[i] ? C.green : '#0f172a'));
      gridDraw(c, X(2), oy, sz, `prediction`, i => (mask[i] ? C.cyan : '#0f172a'));
      gridDraw(c, X(3), oy, sz, 'errors (red FP, amber FN)', i => (mask[i] && gt[i] ? 'rgba(34,197,94,0.8)' : mask[i] ? '#ef4444' : gt[i] ? '#f59e0b' : '#0f172a'));
      const mt = s.met[model], y2 = oy + sz + 28;
      text(c, `IoU ${fmt(mt.iou, 3)}   Dice ${fmt(mt.dice, 3)}   precision ${fmt(mt.prec, 2)}   recall ${fmt(mt.rec, 2)}`, 10, y2, C.text, 12, 'left', 'alphabetic', true);
      if (model === 'otsu') text(c, `Otsu threshold = ${fmt(s.thr, 2)} (maximises between-class variance)`, 10, y2 + 18, C.dim, 11);
      if (model === 'kmeans') text(c, 'two intensity centroids found by Lloyd iterations', 10, y2 + 18, C.dim, 11);
      if (model === 'region') text(c, `grow from brightest seeds while |I − mean| < ${fmt(num(v, 'tol'), 2)}`, 10, y2 + 18, C.dim, 11);
      if (model === 'unet') {
        text(c, `decoder head trained ${s.epoch} epochs on 6 other images · final loss ${fmt(s.loss[s.loss.length - 1] ?? 0, 3)}`, 10, y2 + 18, C.dim, 11);
        const enc = ['raw', '3×3', '7×7', '15×15 (bottleneck)', 'skip−bottleneck', '|∇|', '7×7−3×3'];
        text(c, 'learned weights: ' + enc.map((e, k) => `${e} ${fmt(s.w[k], 1)}`).join(' · '), 10, y2 + 34, C.dim, 10);
      }
      circle(c, w - 14, 14, 4, s.epoch < 160 && model === 'unet' ? C.amber : C.green);
    }
  },
  readouts(s, v) {
    const model = str(v, 'model'), mt = s.met[model] ?? s.met.otsu;
    return [
      { label: 'Model', value: MODELS.find(m => m.value === model)?.label ?? model },
      { label: 'IoU', value: fmt(mt.iou, 3) }, { label: 'Dice', value: fmt(mt.dice, 3) },
      { label: 'Precision', value: fmt(mt.prec, 3) }, { label: 'Recall', value: fmt(mt.rec, 3) },
      { label: 'Best model (IoU)', value: MODELS.reduce((b, m) => (s.met[m.value].iou > s.met[b.value].iou ? m : b), MODELS[0]).label },
      { label: 'U-Net head epochs', value: String(s.epoch) },
    ];
  },
  equations(s, v) {
    const mt = s.met[str(v, 'model')] ?? s.met.otsu;
    return ['\\text{IoU}=\\dfrac{TP}{TP+FP+FN}=' + fmt(mt.iou, 3), '\\text{Dice}=\\dfrac{2TP}{2TP+FP+FN}=' + fmt(mt.dice, 3), '\\sigma_B^2(t)=w_0(t)\\,w_1(t)\\,[\\mu_0(t)-\\mu_1(t)]^2\\;\\Rightarrow\\;t^*=\\arg\\max_t\\sigma_B^2', 'p(\\mathbf x)=\\sigma(\\mathbf w^\\top\\phi(\\mathbf x)+b),\\;\\phi=\\text{multi-scale encoder features}'];
  },
});
