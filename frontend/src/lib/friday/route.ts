/**
 * FRIDAY's language-model router. One brain, three engines, chosen automatically and shown honestly in the UI:
 *   1. LOCAL  — an open-weights model on this computer through Ollama (http://localhost:11434) or any OpenAI-compatible server such as vLLM / LM Studio / llama.cpp.
 *               Works with no internet and no API key; this is the route that gives Claude/Gemini-class conversation fully offline.
 *   2. CLOUD  — a provider key saved in Settings (Gemini, OpenAI, Anthropic, OpenRouter, custom). Only used when "Online" is on.
 *   3. OFFLINE ENGINE — FRIDAY's built-in retrieval + calculator + composer. Always available; limited to what is in its knowledge and your files.
 * A failed engine falls through to the next one; the reply records which engine really answered.
 */
import { generate } from '../aiClient';
import type { AiConfig, GenOpts } from '../aiClient';
import { llmConfig } from '../friday';

export type RoutePref = 'auto' | 'local' | 'cloud' | 'offline';
export type Engine = 'local' | 'cloud' | 'offline';
export interface LocalCfg { kind: 'ollama' | 'openai'; url: string; model: string }
const K = { route: 'nm_friday_route', local: 'nm_friday_local', online: 'nm_friday_online', deep: 'nm_friday_deep', web: 'nm_friday_web' };
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

export const getRoutePref = (): RoutePref => { const v = get(K.route); return v === 'local' || v === 'cloud' || v === 'offline' ? v : 'auto'; };
export const setRoutePref = (p: RoutePref) => set(K.route, p);
export const isOnline = () => get(K.online) !== '0' && (typeof navigator === 'undefined' || navigator.onLine !== false);
export const setOnline = (v: boolean) => set(K.online, v ? '1' : '0');
/** Wikipedia recall for every question is opt-in (default off) so nothing leaves the device unless asked. */
export const getWeb = () => get(K.web) === '1';
export const setWeb = (v: boolean) => set(K.web, v ? '1' : '0');
export const getDeep = () => get(K.deep) === '1';
export const setDeep = (v: boolean) => set(K.deep, v ? '1' : '0');
export function getLocal(): LocalCfg | null { try { const j = JSON.parse(get(K.local) || 'null'); return j && j.url ? { kind: j.kind === 'openai' ? 'openai' : 'ollama', url: String(j.url), model: String(j.model || '') } : null; } catch { return null; } }
export const setLocal = (c: LocalCfg | null) => set(K.local, c ? JSON.stringify(c) : '');

const trimUrl = (u: string) => u.trim().replace(/\/+$/, '');
/** The OpenAI-compatible base URL for a local server (Ollama serves it under /v1). */
export const localBase = (c: LocalCfg) => { const u = trimUrl(c.url); return /\/v1$/.test(u) ? u : `${u}/v1`; };
export function localAsAi(c: LocalCfg): AiConfig { return { provider: 'custom', apiKey: 'local', model: c.model, baseUrl: localBase(c), speed: 'fast' }; }

async function fetchJson(url: string, ms = 1800): Promise<unknown> { const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms); try { const r = await fetch(url, { signal: ac.signal }); if (!r.ok) throw new Error(String(r.status)); return await r.json(); } finally { clearTimeout(t); } }
export interface Found { kind: 'ollama' | 'openai'; url: string; models: string[] }
/** Probe the usual local ports (and an optional custom URL) for a running model server. Never throws. */
export async function detectLocal(extra?: string): Promise<Found[]> {
  const probes: { kind: 'ollama' | 'openai'; url: string }[] = [{ kind: 'ollama', url: 'http://localhost:11434' }, { kind: 'ollama', url: 'http://127.0.0.1:11434' }, { kind: 'openai', url: 'http://localhost:8000' }, { kind: 'openai', url: 'http://localhost:1234' }, { kind: 'openai', url: 'http://localhost:8080' }];
  if (extra?.trim()) probes.unshift({ kind: /11434/.test(extra) ? 'ollama' : 'openai', url: trimUrl(extra).replace(/\/v1$/, '') });
  const out: Found[] = []; const seen = new Set<string>();
  await Promise.all(probes.map(async p => { try {
    if (p.kind === 'ollama') { const j = (await fetchJson(`${p.url}/api/tags`)) as { models?: { name: string }[] }; const key = p.url.replace('127.0.0.1', 'localhost'); if (seen.has(key)) return; seen.add(key); out.push({ kind: 'ollama', url: p.url, models: (j.models ?? []).map(m => m.name) }); }
    else { const j = (await fetchJson(`${p.url}/v1/models`)) as { data?: { id: string }[] }; out.push({ kind: 'openai', url: p.url, models: (j.data ?? []).map(m => m.id) }); }
  } catch { /* not running */ } }));
  return out;
}
/** Pick the best model name from an installed list (prefers instruct/chat models of a useful size). */
export function pickModel(models: string[]): string {
  const rank = (m: string) => { const l = m.toLowerCase(); let s = 0; if (/instruct|chat|it\b/.test(l)) s += 2; if (/llama3|llama-3|qwen|mistral|gemma|phi|deepseek|gpt-oss/.test(l)) s += 3; if (/embed|nomic|bge|minilm|whisper|clip|vision-only/.test(l)) s -= 10; const sz = l.match(/(\d+(?:\.\d+)?)b\b/); if (sz) { const b = +sz[1]; s += b >= 7 && b <= 34 ? 3 : b >= 3 ? 2 : 0; } return s; };
  return [...models].sort((a, b) => rank(b) - rank(a))[0] ?? '';
}

export interface Resolved { engine: Engine; cfg: AiConfig | null; label: string; reason: string }
let localHealth: { ok: boolean; at: number } | null = null;
export async function localReachable(force = false): Promise<boolean> {
  const c = getLocal(); if (!c) return false; if (!force && localHealth && Date.now() - localHealth.at < 30_000) return localHealth.ok;
  let ok = false; try { await fetchJson(c.kind === 'ollama' ? `${trimUrl(c.url).replace(/\/v1$/, '')}/api/tags` : `${localBase(c)}/models`, 1500); ok = true; } catch { ok = false; }
  localHealth = { ok, at: Date.now() }; return ok;
}
/** Decide which engines are allowed right now and in which order. */
export async function plan(): Promise<{ order: Resolved[]; pref: RoutePref }> {
  const pref = getRoutePref(), online = isOnline(), order: Resolved[] = []; const lc = getLocal(), cloud = llmConfig();
  const local: Resolved | null = lc && (await localReachable()) ? { engine: 'local', cfg: localAsAi(lc), label: `Local model · ${lc.model || 'default'}`, reason: 'running on this computer' } : null;
  const cl: Resolved | null = cloud && online ? { engine: 'cloud', cfg: cloud, label: `Cloud · ${cloud.provider}${cloud.model ? ' · ' + cloud.model : ''}`, reason: 'your saved API key' } : null;
  const off: Resolved = { engine: 'offline', cfg: null, label: 'Offline engine', reason: 'built-in knowledge, your notes and PDFs' };
  if (pref === 'offline') order.push(off); else if (pref === 'local') { if (local) order.push(local); order.push(off); } else if (pref === 'cloud') { if (cl) order.push(cl); if (local) order.push(local); order.push(off); } else { if (local) order.push(local); if (cl) order.push(cl); order.push(off); }
  return { order, pref };
}
export async function current(): Promise<Resolved> { return (await plan()).order[0]; }

export interface Gen { text: string; engine: Engine; label: string; note?: string }
/** Run a prompt through the first engine that works. Returns null when only the offline engine remains (caller composes the answer itself). */
export async function route(prompt: string, opts: GenOpts = {}): Promise<Gen | null> {
  const { order } = await plan(); let note = '';
  for (const r of order) {
    if (r.engine === 'offline' || !r.cfg) break;
    try { const text = await generate(r.cfg, prompt, { retries: 0, timeoutMs: r.engine === 'local' ? 120_000 : 45_000, maxTokens: 1400, ...opts }); if (text.trim()) return { text: text.trim(), engine: r.engine, label: r.label, note: note || undefined }; note = `${r.label} returned nothing`; }
    catch (e) { note = `${r.label} failed (${(e as Error).message.slice(0, 90)})`; if (r.engine === 'local') localHealth = { ok: false, at: Date.now() }; }
  }
  return note ? { text: '', engine: 'offline', label: 'Offline engine', note } : null;
}

/* ---------------- web recall (Online mode only) ---------------- */
export interface WebHit { title: string; url: string; extract: string }
/** Wikipedia (CORS-enabled, no key). Used only when Online is on; failures are silent and reported by the caller. */
export async function webRecall(q: string, n = 2): Promise<WebHit[]> {
  if (!isOnline()) return [];
  try {
    const s = (await fetchJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=${n}&format=json&origin=*`, 5000)) as { query?: { search?: { title: string }[] } };
    const titles = (s.query?.search ?? []).map(x => x.title).slice(0, n); if (!titles.length) return [];
    const e = (await fetchJson(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exchars=900&titles=${encodeURIComponent(titles.join('|'))}&format=json&origin=*`, 5000)) as { query?: { pages?: Record<string, { title: string; extract?: string }> } };
    return Object.values(e.query?.pages ?? {}).filter(p => p.extract).map(p => ({ title: p.title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`, extract: p.extract!.trim() }));
  } catch { return []; }
}
