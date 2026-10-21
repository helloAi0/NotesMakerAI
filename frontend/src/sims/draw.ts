/* ------------------------------------------------------------------ */
/*  Drawing kit shared by every simulation (plain canvas 2D)           */
/* ------------------------------------------------------------------ */

export type Ctx = CanvasRenderingContext2D;
export interface Rect { x: number; y: number; w: number; h: number }

export const TAU = Math.PI * 2;
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const deg = (r: number) => (r * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;

/** Standard normal random number (Box-Muller). */
export function gauss(): number {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * Math.random());
}

export const C = {
  bg: '#0b1220',
  panel: '#111a2e',
  panel2: '#162238',
  grid: 'rgba(148,163,184,0.13)',
  axis: 'rgba(203,213,225,0.75)',
  text: '#e2e8f0',
  dim: '#94a3b8',
  blue: '#60a5fa',
  cyan: '#22d3ee',
  green: '#34d399',
  lime: '#a3e635',
  amber: '#fbbf24',
  orange: '#fb923c',
  red: '#f87171',
  pink: '#f472b6',
  purple: '#a78bfa',
  white: '#f8fafc',
};

export function hsl(h: number, s: number, l: number, a = 1) {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

/** Formats a number with a sensible number of digits; switches to exponent form for very big or small values. */
export function fmt(n: number, d = 2): string {
  if (!Number.isFinite(n)) return '-';
  const a = Math.abs(n);
  if (a !== 0 && (a >= 1e5 || a < 10 ** -(d + 1))) return n.toExponential(Math.max(1, d - 1));
  return n.toFixed(d);
}

/** A "nice" grid step (1, 2, 5 x 10^k) giving about `target` divisions over `span`. */
export function niceStep(span: number, target = 6): number {
  const raw = span / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pow;
}

export function line(c: Ctx, x1: number, y1: number, x2: number, y2: number, color: string = C.axis, w = 1, dash?: number[]) {
  c.save();
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.strokeStyle = color;
  c.lineWidth = w;
  if (dash) c.setLineDash(dash);
  c.stroke();
  c.restore();
}

export function circle(c: Ctx, x: number, y: number, r: number, fill?: string, stroke?: string, lw = 1) {
  c.beginPath();
  c.arc(x, y, Math.max(0, r), 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}

export function arrow(c: Ctx, x1: number, y1: number, x2: number, y2: number, color: string = C.amber, w = 2, head = 8) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 1) return;
  const a = Math.atan2(y2 - y1, x2 - x1);
  const h = Math.min(head, len * 0.6);
  c.save();
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = w;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2 - Math.cos(a) * h * 0.6, y2 - Math.sin(a) * h * 0.6);
  c.stroke();
  c.beginPath();
  c.moveTo(x2, y2);
  c.lineTo(x2 - Math.cos(a - 0.45) * h, y2 - Math.sin(a - 0.45) * h);
  c.lineTo(x2 - Math.cos(a + 0.45) * h, y2 - Math.sin(a + 0.45) * h);
  c.closePath();
  c.fill();
  c.restore();
}

export function text(
  c: Ctx, s: string, x: number, y: number, color: string = C.text, size = 12,
  align: CanvasTextAlign = 'left', baseline: CanvasTextBaseline = 'alphabetic', bold = false,
) {
  c.save();
  c.font = `${bold ? '600 ' : ''}${size}px Inter, system-ui, sans-serif`;
  c.fillStyle = color;
  c.textAlign = align;
  c.textBaseline = baseline;
  c.fillText(s, x, y);
  c.restore();
}

export function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

export function panel(c: Ctx, r: Rect, fill: string = C.panel, stroke = 'rgba(148,163,184,0.18)') {
  c.save();
  roundRect(c, r.x, r.y, r.w, r.h, 8);
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = stroke;
  c.lineWidth = 1;
  c.stroke();
  c.restore();
}

export function polyline(c: Ctx, pts: [number, number][], color: string, w = 2, dash?: number[]) {
  if (pts.length < 2) return;
  c.save();
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.strokeStyle = color;
  c.lineWidth = w;
  c.lineJoin = 'round';
  if (dash) c.setLineDash(dash);
  c.stroke();
  c.restore();
}

export interface PlotOpts {
  xlabel?: string;
  ylabel?: string;
  title?: string;
  xstep?: number;
  ystep?: number;
  grid?: boolean;
  /** Draw the x axis at y = 0 instead of at the bottom. */
  zeroAxis?: boolean;
}
export interface PlotMap { X: (x: number) => number; Y: (y: number) => number; inv: (px: number, py: number) => [number, number] }

/** Draws a framed plot area with ticks and returns data -> pixel mappings. */
export function plot(c: Ctx, r: Rect, xr: [number, number], yr: [number, number], o: PlotOpts = {}): PlotMap {
  const padL = 34, padR = 8, padT = o.title ? 20 : 8, padB = o.xlabel ? 26 : 18;
  const ix = r.x + padL, iy = r.y + padT, iw = r.w - padL - padR, ih = r.h - padT - padB;
  const X = (x: number) => ix + ((x - xr[0]) / (xr[1] - xr[0] || 1)) * iw;
  const Y = (y: number) => iy + ih - ((y - yr[0]) / (yr[1] - yr[0] || 1)) * ih;
  panel(c, r, C.panel);
  const xs = o.xstep ?? niceStep(xr[1] - xr[0], Math.max(2, iw / 70));
  const ys = o.ystep ?? niceStep(yr[1] - yr[0], Math.max(2, ih / 40));
  c.save();
  c.beginPath();
  c.rect(ix, iy, iw, ih);
  c.clip();
  if (o.grid !== false) {
    for (let x = Math.ceil(xr[0] / xs) * xs; x <= xr[1] + 1e-9; x += xs) line(c, X(x), iy, X(x), iy + ih, C.grid);
    for (let y = Math.ceil(yr[0] / ys) * ys; y <= yr[1] + 1e-9; y += ys) line(c, ix, Y(y), ix + iw, Y(y), C.grid);
  }
  c.restore();
  const axisY = o.zeroAxis && yr[0] < 0 && yr[1] > 0 ? Y(0) : iy + ih;
  line(c, ix, axisY, ix + iw, axisY, C.axis);
  line(c, ix, iy, ix, iy + ih, C.axis);
  for (let x = Math.ceil(xr[0] / xs) * xs; x <= xr[1] + 1e-9; x += xs) text(c, fmt(Math.abs(x) < 1e-9 ? 0 : x, xs < 1 ? 1 : 0), X(x), iy + ih + 12, C.dim, 9, 'center');
  for (let y = Math.ceil(yr[0] / ys) * ys; y <= yr[1] + 1e-9; y += ys) text(c, fmt(Math.abs(y) < 1e-9 ? 0 : y, ys < 1 ? 1 : 0), ix - 4, Y(y) + 3, C.dim, 9, 'right');
  if (o.title) text(c, o.title, r.x + 8, r.y + 13, C.text, 11, 'left', 'alphabetic', true);
  if (o.xlabel) text(c, o.xlabel, ix + iw / 2, r.y + r.h - 3, C.dim, 10, 'center');
  if (o.ylabel) {
    c.save();
    c.translate(r.x + 9, iy + ih / 2);
    c.rotate(-Math.PI / 2);
    text(c, o.ylabel, 0, 0, C.dim, 10, 'center');
    c.restore();
  }
  return { X, Y, inv: (px, py) => [xr[0] + ((px - ix) / iw) * (xr[1] - xr[0]), yr[0] + ((iy + ih - py) / ih) * (yr[1] - yr[0])] };
}

/** Rolling time series for small live graphs. */
export class Scope {
  t: number[] = [];
  ys: number[][] = [];
  channels: number;
  maxPts: number;
  constructor(channels: number, maxPts = 1500) {
    this.channels = channels;
    this.maxPts = maxPts;
    for (let i = 0; i < channels; i++) this.ys.push([]);
  }
  push(t: number, ...vals: number[]) {
    this.t.push(t);
    for (let i = 0; i < this.channels; i++) this.ys[i].push(vals[i] ?? 0);
    if (this.t.length > this.maxPts) {
      this.t.shift();
      for (const y of this.ys) y.shift();
    }
  }
  clear() {
    this.t = [];
    this.ys = this.ys.map(() => []);
  }
}

export function drawScope(
  c: Ctx, r: Rect, s: Scope, colors: string[],
  o: PlotOpts & { window?: number; ymin?: number; ymax?: number; labels?: string[] } = {},
) {
  const win = o.window ?? 10;
  const tNow = s.t.length ? s.t[s.t.length - 1] : 0;
  const t0 = Math.max(0, tNow - win);
  const tEnd = Math.max(win, tNow);
  const lo = tEnd - win;
  let ymin = o.ymin ?? Infinity, ymax = o.ymax ?? -Infinity;
  if (o.ymin === undefined || o.ymax === undefined) {
    for (const ch of s.ys) for (let i = 0; i < ch.length; i++) if (s.t[i] >= t0) {
      if (o.ymin === undefined) ymin = Math.min(ymin, ch[i]);
      if (o.ymax === undefined) ymax = Math.max(ymax, ch[i]);
    }
    if (!Number.isFinite(ymin) || !Number.isFinite(ymax)) { ymin = -1; ymax = 1; }
    if (ymax - ymin < 1e-9) { ymin -= 1; ymax += 1; }
    const pad = (ymax - ymin) * 0.12;
    if (o.ymin === undefined) ymin -= pad;
    if (o.ymax === undefined) ymax += pad;
  }
  const m = plot(c, r, [lo, lo + win], [ymin, ymax], { zeroAxis: true, ...o });
  c.save();
  c.beginPath();
  c.rect(r.x + 34, r.y + (o.title ? 20 : 8), r.w - 42, r.h - (o.title ? 20 : 8) - (o.xlabel ? 26 : 18));
  c.clip();
  s.ys.forEach((ch, k) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < ch.length; i++) if (s.t[i] >= lo - 0.5) pts.push([m.X(s.t[i]), m.Y(ch[i])]);
    polyline(c, pts, colors[k % colors.length], 2);
  });
  c.restore();
  if (o.labels) o.labels.forEach((lb, k) => text(c, lb, r.x + r.w - 8, r.y + 13 + k * 12, colors[k % colors.length], 10, 'right', 'alphabetic', true));
}

/** Vertical bar chart with labels. */
export function bars(c: Ctx, r: Rect, items: { label: string; value: number; color: string }[], max: number, title?: string) {
  panel(c, r, C.panel);
  if (title) text(c, title, r.x + 8, r.y + 14, C.text, 11, 'left', 'alphabetic', true);
  const top = r.y + (title ? 24 : 10), bottom = r.y + r.h - 20;
  const bw = Math.min(46, (r.w - 16) / items.length - 8);
  const gap = (r.w - 16 - bw * items.length) / (items.length + 1);
  line(c, r.x + 8, bottom, r.x + r.w - 8, bottom, C.axis);
  items.forEach((it, i) => {
    const x = r.x + 8 + gap + i * (bw + gap);
    const hgt = clamp(it.value / (max || 1), 0, 1) * (bottom - top);
    c.fillStyle = it.color;
    c.fillRect(x, bottom - hgt, bw, hgt);
    text(c, it.label, x + bw / 2, bottom + 12, C.dim, 10, 'center');
  });
}

/** Approximate RGB colour of visible light at a wavelength in nm (380-780). */
export function wavelengthToRgb(nm: number): [number, number, number] {
  let r = 0, g = 0, b = 0;
  if (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else if (nm <= 780) { r = 1; }
  let f = 1;
  if (nm < 420) f = 0.3 + (0.7 * (nm - 380)) / 40;
  else if (nm > 700) f = 0.3 + (0.7 * (780 - nm)) / 80;
  return [Math.round(255 * r * f), Math.round(255 * g * f), Math.round(255 * b * f)];
}

/** Uniform world -> screen mapping that fits a world box inside a rectangle. */
export function fitView(r: Rect, wx0: number, wx1: number, wy0: number, wy1: number) {
  const sc = Math.min(r.w / (wx1 - wx0), r.h / (wy1 - wy0));
  const ox = r.x + (r.w - sc * (wx1 - wx0)) / 2 - sc * wx0;
  const oy = r.y + r.h - (r.h - sc * (wy1 - wy0)) / 2 + sc * wy0;
  return { sc, X: (x: number) => ox + sc * x, Y: (y: number) => oy - sc * y, ix: (px: number) => (px - ox) / sc, iy: (py: number) => (oy - py) / sc };
}
export type View = ReturnType<typeof fitView>;

/** Zig-zag spring between two points. */
export function spring(c: Ctx, x1: number, y1: number, x2: number, y2: number, coils: number, amp: number, color: string = C.cyan) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const lead = Math.min(14, len * 0.15);
  const pts: [number, number][] = [[x1, y1], [x1 + ux * lead, y1 + uy * lead]];
  const n = coils * 2;
  for (let i = 1; i < n; i++) {
    const t = lead + ((len - 2 * lead) * i) / n;
    const s = i % 2 ? 1 : -1;
    pts.push([x1 + ux * t + nx * amp * s, y1 + uy * t + ny * amp * s]);
  }
  pts.push([x2 - ux * lead, y2 - uy * lead], [x2, y2]);
  polyline(c, pts, color, 2.2);
}
