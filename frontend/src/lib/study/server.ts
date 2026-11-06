/* Client for the optional Notes Maker server (server-api). Everything in the app works without it; it is only needed for the marketplace and the
   Telegram/WhatsApp inbox. The token is kept on this device only. */
import { defaultKV } from '../kv';
import type { KV } from '../kv';
export interface Session { base: string; token: string; email: string; name: string }
const K = 'nm_server_session';
export const loadSession = (kv: KV = defaultKV()): Session | null => { try { const s = JSON.parse(kv.get(K) || 'null'); return s && s.base && s.token ? s : null; } catch { return null; } };
export const saveSession = (s: Session | null, kv: KV = defaultKV()) => kv.set(K, JSON.stringify(s));
export const cleanBase = (u: string) => { const t = u.trim().replace(/\/+$/, ''); if (!/^https?:\/\/[^\s/]+/.test(t)) throw new Error('Enter the server address, like https://notes.example.com'); if (/^http:\/\//.test(t) && !/^http:\/\/(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(t)) throw new Error('Use https:// for a server on the internet.'); return t; };
export class ApiFail extends Error { status: number; constructor(m: string, status: number) { super(m); this.status = status; } }
export type Fetch = typeof fetch;
export async function call<T = Record<string, unknown>>(s: { base: string; token?: string }, method: string, path: string, body?: unknown, f: Fetch = fetch): Promise<T> {
  let r: Response; try { r = await f(s.base + path, { method, headers: { 'content-type': 'application/json', ...(s.token ? { authorization: 'Bearer ' + s.token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); } catch { throw new ApiFail('Cannot reach the server. Check the address and your internet.', 0); }
  const j = await r.json().catch(() => ({})) as Record<string, unknown>; if (!r.ok) throw new ApiFail(String(j.error || (r.status === 401 ? 'Please sign in again.' : `Server error (${r.status}).`)), r.status); return j as T;
}
export async function signIn(base: string, email: string, password: string, mode: 'login' | 'register', name = '', f: Fetch = fetch): Promise<Session> {
  const b = cleanBase(base); const j = await call<{ token: string; user: { email: string; name: string } }>({ base: b }, 'POST', mode === 'login' ? '/login' : '/register', mode === 'login' ? { email, password } : { email, password, name }, f);
  return { base: b, token: j.token, email: j.user.email, name: j.user.name };
}
/* ---------- UPI ---------- */
export const validVpa = (v: string) => /^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z]{2,32}$/.test(v.trim());
export const validUtr = (v: string) => /^\d{12}$/.test(v.trim());
export const priceOk = (p: number) => p === 0 || (Number.isInteger(p) && p >= 5 && p <= 500);
/** upi://pay deep link (NPCI spec). Opens the student's own UPI app; money goes straight to the creator. */
export function upiLink(o: { pa: string; pn: string; am: number; tn: string; tr?: string }): string {
  if (!validVpa(o.pa)) throw new Error('Invalid UPI ID'); const q = new URLSearchParams({ pa: o.pa.trim(), pn: o.pn.slice(0, 40), am: o.am.toFixed(2), cu: 'INR', tn: o.tn.slice(0, 50) }); if (o.tr) q.set('tr', o.tr.slice(0, 35)); return 'upi://pay?' + q.toString().replace(/\+/g, '%20');
}
/* ---------- bot inbox -> planner / saved items ---------- */
export interface InboxItem { id: string; kind: 'task' | 'link' | 'note'; title: string; due: string; url: string; text: string; source: string; t: number }
export interface Saved { id: string; kind: 'link' | 'note'; title: string; url: string; text: string; source: string; t: number }
const SK = 'nm_inbox_saved';
export const savedItems = (kv: KV = defaultKV()): Saved[] => { try { return JSON.parse(kv.get(SK) || '[]'); } catch { return []; } };
/** applies items; returns what was done. addTask is injected so this stays testable. */
export function applyInbox(items: InboxItem[], addTask: (t: { title: string; due: string; subject: string }) => void, kv: KV = defaultKV(), existing: { title: string; due: string }[] = []): { tasks: number; saved: number; ids: string[] } {
  let tasks = 0, saved = 0; const keep = savedItems(kv); const seen = new Set(keep.map(s => s.id)); const have = new Set(existing.map(e => e.title.toLowerCase() + '|' + e.due));
  for (const it of items) {
    if (it.kind === 'task') { if (!have.has(it.title.toLowerCase() + '|' + it.due)) { addTask({ title: it.title, due: it.due, subject: 'From ' + it.source }); tasks++; } }
    else if (!seen.has(it.id)) { keep.push({ id: it.id, kind: it.kind, title: it.title, url: it.url, text: it.text, source: it.source, t: it.t }); saved++; }
  }
  kv.set(SK, JSON.stringify(keep.slice(-100))); return { tasks, saved, ids: items.map(i => i.id) };
}
export async function pullInbox(s: Session, addTask: (t: { title: string; due: string; subject: string }) => void, existing: { title: string; due: string }[], kv: KV = defaultKV(), f: Fetch = fetch) {
  const { items } = await call<{ items: InboxItem[] }>(s, 'GET', '/inbox', undefined, f); if (!items.length) return { tasks: 0, saved: 0 };
  const r = applyInbox(items, addTask, kv, existing); await call(s, 'POST', '/inbox/ack', { ids: r.ids }, f); return { tasks: r.tasks, saved: r.saved };
}

/** true when the server rejected our token (expired after 7 days, or account deleted) */
export const isAuthFail = (e: unknown) => e instanceof ApiFail && e.status === 401;
