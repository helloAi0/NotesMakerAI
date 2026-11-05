/** Tiny key-value store (localStorage with an in-memory fallback). Kept dependency-free so it can be used on the first screen without loading anything else. */
export interface KV { get(k: string): string | null; set(k: string, v: string): void }
export const memKV = (): KV => { const m = new Map<string, string>(); return { get: k => m.get(k) ?? null, set: (k, v) => { m.set(k, v); } }; };
const lsKV = (): KV => ({ get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* quota */ } } });
export const defaultKV = (): KV => (typeof localStorage !== 'undefined' ? lsKV() : memKV());
