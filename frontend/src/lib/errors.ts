/* Local error tracking. Crashes are written to a small on-device log (no notes, no keys — messages only, scrubbed).
   If the user opts in AND a Sentry DSN is configured, the same scrubbed events are sent to Sentry. */
import { defaultKV } from './friday/learn';
import type { KV } from './friday/learn';

export interface ErrEvent { t: number; msg: string; stack?: string; where: string; view?: string }
const LOG = 'nm_errlog', CFG = 'nm_errcfg';
export const scrub = (s: string) => s.replace(/(AIza[\w-]{20,}|sk-[\w-]{16,}|gsk_[\w-]{16,}|Bearer\s+[\w.-]{12,})/g, '[key]').replace(/([?&](?:key|token|apikey)=)[^&\s]+/gi, '$1[x]').slice(0, 600);
export interface ErrCfg { sentryDsn: string; share: boolean }
export const getCfg = (kv: KV = defaultKV()): ErrCfg => { try { return { sentryDsn: '', share: false, ...JSON.parse(kv.get(CFG) || '{}') }; } catch { return { sentryDsn: '', share: false }; } };
export const setCfg = (c: Partial<ErrCfg>, kv: KV = defaultKV()) => kv.set(CFG, JSON.stringify({ ...getCfg(kv), ...c }));
export const errorLog = (kv: KV = defaultKV()): ErrEvent[] => { try { const a = JSON.parse(kv.get(LOG) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
export const clearErrors = (kv: KV = defaultKV()) => kv.set(LOG, '[]');

/** Parse https://KEY@HOST/PROJECT into the Sentry envelope URL. */
export function sentryEndpoint(dsn: string): { url: string; key: string } | null { const m = dsn.trim().match(/^https:\/\/([\w]+)@([\w.-]+)\/(\d+)$/); return m ? { key: m[1], url: `https://${m[2]}/api/${m[3]}/envelope/?sentry_key=${m[1]}&sentry_version=7` } : null; }
export function envelope(dsn: string, e: ErrEvent): string {
  const id = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const ev = { event_id: id, timestamp: e.t / 1000, platform: 'javascript', level: 'error', message: e.msg, tags: { where: e.where, view: e.view ?? '' }, extra: { stack: e.stack ?? '' } };
  return [JSON.stringify({ event_id: id, dsn }), JSON.stringify({ type: 'event' }), JSON.stringify(ev)].join('\n');
}
export function report(msg: string, where: string, stack?: string, o: { kv?: KV; view?: string; send?: typeof fetch } = {}): ErrEvent {
  const kv = o.kv ?? defaultKV(); const e: ErrEvent = { t: Date.now(), msg: scrub(msg), stack: stack ? scrub(stack) : undefined, where, view: o.view };
  const log = errorLog(kv); const last = log[log.length - 1]; if (last && last.msg === e.msg && e.t - last.t < 2000) return e; // de-duplicate bursts
  log.push(e); kv.set(LOG, JSON.stringify(log.slice(-100)));
  const c = getCfg(kv); const ep = c.share ? sentryEndpoint(c.sentryDsn) : null;
  if (ep) { try { void (o.send ?? fetch)(ep.url, { method: 'POST', body: envelope(c.sentryDsn, e), keepalive: true }).catch(() => {}); } catch { /* never throw from the reporter */ } }
  return e;
}
let installed = false;
export function installErrorTracking(view: () => string) {
  if (installed || typeof window === 'undefined') return; installed = true;
  window.addEventListener('error', ev => { if (/ResizeObserver loop/.test(ev.message)) return; report(ev.message || 'Error', 'window.onerror', ev.error?.stack, { view: view() }); });
  window.addEventListener('unhandledrejection', ev => { const r = ev.reason; if (r instanceof DOMException && r.name === 'AbortError') return; report(r instanceof Error ? r.message : String(r), 'unhandledrejection', r instanceof Error ? r.stack : undefined, { view: view() }); });
}
