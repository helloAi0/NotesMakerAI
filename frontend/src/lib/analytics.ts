/* Consent-gated usage analytics. OFF by default. With consent, only counters and day-level activity are kept (never note text),
   and — only if a pilot endpoint is set — are POSTed. The same numbers can be exported as a file for a pilot. */
import { defaultKV } from './friday/learn';
import type { KV } from './friday/learn';
const DAY = 86400000;
export interface AnCfg { consent: boolean; endpoint: string; anonId: string; firstSeen: number }
const K = 'nm_an_cfg', D = 'nm_an_data';
const rid = () => Array.from({ length: 12 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
export function getCfg(kv: KV = defaultKV()): AnCfg { try { const c = JSON.parse(kv.get(K) || '{}'); return { consent: !!c.consent, endpoint: c.endpoint ?? '', anonId: c.anonId || rid(), firstSeen: c.firstSeen || Date.now() }; } catch { return { consent: false, endpoint: '', anonId: rid(), firstSeen: Date.now() }; } }
export function setCfg(p: Partial<AnCfg>, kv: KV = defaultKV()) { kv.set(K, JSON.stringify({ ...getCfg(kv), ...p })); }
interface Data { days: Record<string, Record<string, number>>; first: Record<string, number> }
const load = (kv: KV): Data => { try { const d = JSON.parse(kv.get(D) || '{}'); return { days: d.days ?? {}, first: d.first ?? {} }; } catch { return { days: {}, first: {} }; } };
const dkey = (t: number) => new Date(t).toISOString().slice(0, 10);
/** Count an event. Does nothing without consent. */
export function track(name: string, o: { kv?: KV; now?: number } = {}) {
  const kv = o.kv ?? defaultKV(); const c = getCfg(kv); if (!c.consent) return; const now = o.now ?? Date.now(); const d = load(kv); const k = dkey(now);
  d.days[k] = d.days[k] ?? {}; d.days[k][name] = (d.days[k][name] ?? 0) + 1; if (!d.first[name]) d.first[name] = now;
  const keys = Object.keys(d.days).sort(); for (const x of keys.slice(0, Math.max(0, keys.length - 120))) delete d.days[x]; kv.set(D, JSON.stringify(d));
}
export interface Summary { consent: boolean; firstSeen: number; activeDays: number; activation: { reachedFirstQuiz: boolean; minutesToFirstQuiz: number | null }; retention: { d1: boolean; d7: boolean; d28: boolean }; totals: Record<string, number> }
export function summary(o: { kv?: KV; now?: number } = {}): Summary {
  const kv = o.kv ?? defaultKV(); const c = getCfg(kv); const d = load(kv); const days = Object.keys(d.days).sort(); const first = days[0] ? new Date(days[0]).getTime() : c.firstSeen; const totals: Record<string, number> = {};
  for (const v of Object.values(d.days)) for (const [k, n] of Object.entries(v)) totals[k] = (totals[k] ?? 0) + n;
  const active = (from: number, to: number) => days.some(x => { const t = new Date(x).getTime(); return t >= first + from * DAY && t < first + to * DAY; });
  const fq = d.first['quiz_done'], fs = d.first['session_start'];
  return { consent: c.consent, firstSeen: first, activeDays: days.length, activation: { reachedFirstQuiz: !!fq, minutesToFirstQuiz: fq && fs ? Math.max(0, Math.round((fq - fs) / 60000)) : null }, retention: { d1: active(1, 2), d7: active(7, 8), d28: active(28, 29) }, totals };
}
export async function flush(o: { kv?: KV; send?: typeof fetch } = {}): Promise<boolean> {
  const kv = o.kv ?? defaultKV(); const c = getCfg(kv); if (!c.consent || !/^https:\/\//.test(c.endpoint)) return false;
  try { const r = await (o.send ?? fetch)(c.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: c.anonId, summary: summary({ kv }) }), keepalive: true }); return r.ok; } catch { return false; }
}
