/** Offline handwriting / print recognition (tesseract.js). Worker, wasm core and English model are served from /ocr (copied from node_modules), never from a CDN. */
export interface OcrWord { text: string; x0: number; y0: number; x1: number; y1: number; line: number }
export interface OcrResult { words: OcrWord[]; lines: string[] }

 
let workerP: Promise<any> | null = null;
const base = () => (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/') + 'ocr/';

async function getWorker() {
  if (!workerP) {
    workerP = (async () => {
      const T = await import('tesseract.js');
      const b = base(), abs = (p: string) => new URL(p, window.location.origin).toString();
      return T.createWorker('eng', 1, { workerPath: abs(b + 'worker.min.js'), corePath: abs(b), langPath: abs(b), gzip: true, workerBlobURL: false });
    })().catch(e => { workerP = null; throw e; });
  }
  return workerP;
}

/** Turn the ink layer (transparent canvas with coloured strokes) into black-on-white for recognition. */
export function inkToBlackOnWhite(src: HTMLCanvasElement, scale = 1.5): HTMLCanvasElement {
  const out = document.createElement('canvas'); out.width = Math.round(src.width * scale); out.height = Math.round(src.height * scale);
  const c = out.getContext('2d', { willReadFrequently: true })!; c.fillStyle = '#fff'; c.fillRect(0, 0, out.width, out.height); c.drawImage(src, 0, 0, out.width, out.height);
  const im = c.getImageData(0, 0, out.width, out.height), d = im.data, ref = document.createElement('canvas'); ref.width = out.width; ref.height = out.height;
  const rc = ref.getContext('2d', { willReadFrequently: true })!; rc.drawImage(src, 0, 0, out.width, out.height); const a = rc.getImageData(0, 0, out.width, out.height).data;
  for (let i = 0; i < d.length; i += 4) { const ink = a[i + 3] > 150; d[i] = d[i + 1] = d[i + 2] = ink ? 0 : 255; d[i + 3] = 255; }
  c.putImageData(im, 0, 0); return out;
}

export async function recognize(canvas: HTMLCanvasElement, scale = 1.5): Promise<OcrResult> {
  const prepared = inkToBlackOnWhite(canvas, scale), worker = await getWorker();
  const res = await worker.recognize(prepared, {}, { blocks: true });
  const words: OcrWord[] = [], lines: string[] = []; let li = 0;
   
  for (const b of (res.data.blocks ?? []) as any[]) for (const p of b.paragraphs ?? []) for (const l of p.lines ?? []) {
    const ws: string[] = [];
    for (const w of l.words ?? []) { const t = String(w.text ?? '').trim(); if (!t || (w.confidence ?? 0) < 20) continue; words.push({ text: t, x0: w.bbox.x0 / scale, y0: w.bbox.y0 / scale, x1: w.bbox.x1 / scale, y1: w.bbox.y1 / scale, line: li }); ws.push(t); }
    if (ws.length) { lines.push(ws.join(' ')); li++; }
  }
  return { words, lines };
}

export async function terminateOcr() { if (workerP) { try { (await workerP).terminate(); } catch { /* ignore */ } workerP = null; } }

/** Recognise printed text or neat handwriting in an ordinary photo or screenshot (greyscale + contrast stretch, no ink assumption). */
export async function recognizeImage(img: HTMLCanvasElement): Promise<{ text: string; confidence: number }> {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0);
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data; let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) { const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000; d[i] = y; if (y < lo) lo = y; if (y > hi) hi = y; }
  const k = hi - lo > 20 ? 255 / (hi - lo) : 1; for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, (d[i] - lo) * k)); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } g.putImageData(im, 0, 0);
  const worker = await getWorker(); const res = await worker.recognize(c); return { text: String(res.data.text ?? '').replace(/\n{3,}/g, '\n\n').trim(), confidence: Number(res.data.confidence ?? 0) / 100 };
}
