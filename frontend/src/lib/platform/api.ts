/* Public JavaScript API: window.NotesMaker. Reading progress or adding cards needs the student’s permission (off by default). */
import { defaultKV } from '../friday/learn';
import type { KV } from '../friday/learn';
export type Consent = 'off' | 'read' | 'write';
const K = 'nm_api_consent';
export const getConsent = (kv: KV = defaultKV()): Consent => { const v = kv.get(K); return v === 'read' || v === 'write' ? v : 'off'; };
export const setConsent = (c: Consent, kv: KV = defaultKV()) => kv.set(K, c);
export interface ApiDeps {
  consent: () => Consent; topics: () => string[]; mastery: (topic: string) => { mastery: number; cards: number; due: number; mistakes: number };
  addCards: (topic: string, cards: { front: string; back: string }[]) => number; installPlugin: (json: string) => { ok: boolean; why?: string };
}
export interface NotesMakerApi { version: string; getTopics(): Promise<string[]>; getMastery(topic: string): Promise<{ mastery: number; cards: number; due: number; mistakes: number }>; addCards(topic: string, cards: { front: string; back: string }[]): Promise<number>; installPlugin(manifest: object | string): Promise<{ ok: boolean; why?: string }>; on(event: string, fn: (d: unknown) => void): () => void }
export function createApi(d: ApiDeps): NotesMakerApi {
  const need = (lvl: 'read' | 'write') => { const c = d.consent(); if (c === 'off' || (lvl === 'write' && c !== 'write')) throw new Error(`Permission denied: the student has not allowed "${lvl}" access (Platform → Developers).`); };
  const subs = new Map<string, Set<(x: unknown) => void>>();
  const api: NotesMakerApi = {
    version: '1', getTopics: async () => { need('read'); return d.topics(); }, getMastery: async t => { need('read'); return d.mastery(String(t)); },
    addCards: async (t, cards) => { need('write'); if (!Array.isArray(cards) || cards.length > 300) throw new Error('addCards needs an array of at most 300 cards'); return d.addCards(String(t).slice(0, 60), cards.map(c => ({ front: String(c.front).slice(0, 400), back: String(c.back).slice(0, 400) }))); },
    installPlugin: async m => { need('write'); return d.installPlugin(typeof m === 'string' ? m : JSON.stringify(m)); },
    on: (e, fn) => { const s = subs.get(e) ?? new Set(); s.add(fn); subs.set(e, s); return () => { s.delete(fn); }; },
  };
  (api as unknown as { _emit: (e: string, x: unknown) => void })._emit = (e, x) => subs.get(e)?.forEach(f => { try { f(x); } catch { /* a bad listener must not break the app */ } });
  return api;
}
