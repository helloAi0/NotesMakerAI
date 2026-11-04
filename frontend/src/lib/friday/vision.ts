/**
 * Vision for FRIDAY: screenshots, photos of notes and diagrams.
 *  1. Offline OCR (tesseract, served from /ocr) reads any text in the image: no key, no internet.
 *  2. If a vision-capable model is connected (Gemini, OpenAI-compatible, or a local model such as llava through Ollama) it also describes diagrams and charts.
 * The text and description are DATA (they go through the same injection filter as PDFs): instructions inside a screenshot are not followed.
 */
import { resilientFetch } from '../net';
import { PROVIDERS, baseUrlOf, geminiModels } from '../aiClient';
import type { AiConfig } from '../aiClient';
import * as router from './route';

export interface Analysis { name: string; thumb: string; ocr: string; ocrConfidence: number; description: string; engine: string; notes: string[] }
const MAX = 1600;
export function readFile(f: Blob): Promise<string> { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('could not read the image')); r.readAsDataURL(f); }); }
export function loadImage(url: string): Promise<HTMLImageElement> { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('this file is not an image the browser can open')); i.src = url; }); }
/** Scale so the longest side is ≤ max (keeps uploads small and OCR fast). */
export function toCanvas(img: HTMLImageElement, max = MAX): HTMLCanvasElement { const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k)); const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); return c; }
export const thumbOf = (c: HTMLCanvasElement, w = 160) => { const t = document.createElement('canvas'); const k = w / c.width; t.width = w; t.height = Math.max(1, Math.round(c.height * k)); t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height); return t.toDataURL('image/jpeg', 0.6); };

const PROMPT = 'Describe this image for a student. If it is a diagram, chart, circuit, graph or figure: say what kind it is, name every labelled part, read all axis labels, units and numbers, and explain what it shows. If it contains handwriting or text, transcribe it. Be factual; do not guess unreadable parts.';
export async function describeWithModel(cfg: AiConfig, jpegDataUrl: string, question = PROMPT, signal?: AbortSignal): Promise<string> {
  const b64 = jpegDataUrl.split(',')[1] ?? '';
  if (cfg.provider === 'gemini') {
    let err = new Error('no Gemini model accepted the image');
    for (const m of geminiModels({ ...cfg, speed: 'fast' })) { const r = await resilientFetch(`${PROMPT_BASE()}/models/${m}:generateContent`, { method: 'POST', signal, headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey.trim() }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: question }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }] }] }) }); if (r.status === 404) { err = new Error(`model ${m} not available`); continue; } if (!r.ok) throw new Error(`vision ${r.status}: ${(await r.text().catch(() => '')).slice(0, 120)}`); const j = await r.json(); const t = (j?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('').trim(); if (t) return t; }
    throw err;
  }
  if (cfg.provider === 'anthropic') {
    const r = await resilientFetch(`${baseUrlOf(cfg)}/messages`, { method: 'POST', signal, headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey.trim(), 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: cfg.model || PROVIDERS.anthropic.defaultModel, max_tokens: 900, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }, { type: 'text', text: question }] }] }) });
    if (!r.ok) throw new Error(`vision ${r.status}`); const j = await r.json(); return String(j?.content?.[0]?.text ?? '').trim();
  }
  const r = await resilientFetch(`${baseUrlOf(cfg)}/chat/completions`, { method: 'POST', signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey.trim()}` }, body: JSON.stringify({ model: cfg.model || PROVIDERS[cfg.provider].defaultModel, max_tokens: 900, messages: [{ role: 'user', content: [{ type: 'text', text: question }, { type: 'image_url', image_url: { url: jpegDataUrl } }] }] }) });
  if (!r.ok) throw new Error(`vision ${r.status}: ${(await r.text().catch(() => '')).slice(0, 120)}`); const j = await r.json(); return String(j?.choices?.[0]?.message?.content ?? '').trim();
}
const PROMPT_BASE = () => PROVIDERS.gemini.baseUrl;
/** Local vision model installed in Ollama (llava, llama3.2-vision, qwen-vl, minicpm-v, gemma3…) — picked from the last scan. */
export function localVisionModel(): string | null { return router.knownModels().find(m => /llava|vision|qwen.*vl|minicpm-v|moondream|gemma3|bakllava/i.test(m)) ?? null; }

export async function analyze(file: Blob, name = 'image', onStage?: (s: string) => void, signal?: AbortSignal): Promise<Analysis> {
  const url = await readFile(file); const img = await loadImage(url); const cv = toCanvas(img); const jpeg = cv.toDataURL('image/jpeg', 0.85); const notes: string[] = [];
  const a: Analysis = { name, thumb: thumbOf(cv), ocr: '', ocrConfidence: 0, description: '', engine: 'offline OCR', notes };
  onStage?.('reading text in the image…');
  try { const { recognizeImage } = await import('../ocr'); const r = await recognizeImage(cv); a.ocr = r.text; a.ocrConfidence = r.confidence; if (r.text && r.confidence < 0.5) notes.push(`text recognition confidence is low (${Math.round(r.confidence * 100)}%): check numbers and symbols`); } catch (e) { notes.push(`offline text recognition failed: ${(e as Error).message.slice(0, 80)}`); }
  const order = (await router.plan()).order.filter(o => o.engine !== 'offline' && o.cfg);
  for (const o of order) {
    let cfg = o.cfg!; if (o.engine === 'local') { const lm = localVisionModel(); if (!lm) { notes.push('a local model is connected but none of its models can see images (try `ollama pull llava` or `llama3.2-vision`)'); continue; } cfg = { ...cfg, model: lm }; }
    onStage?.(`asking ${o.label} to look at it…`);
    try { a.description = await describeWithModel(cfg, jpeg, PROMPT, signal); a.engine = `${o.label} + offline OCR`; break; } catch (e) { notes.push(`${o.label} could not read the image (${(e as Error).message.slice(0, 80)})`); }
  }
  if (!a.description && !a.ocr) notes.push('No text was found and no vision model is connected, so I cannot describe this image. Connect a vision model (Gemini key, or `ollama pull llava`) for diagrams and charts.');
  return a;
}
