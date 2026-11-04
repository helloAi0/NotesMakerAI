/**
 * Undo journal for file actions. An action is bracketed with begin()/end(); the journal diffs the virtual file system before and after, stores the
 * inverse, and `undo()` restores it exactly. Risky plans are flagged first so FRIDAY can ask before doing them.
 */
import type { VFS, VNode } from '../vfs';
import { LIB_ROOT } from '../vfs';
import type { KV } from '../learn';
export interface Change { path: string; before: VNode | null; after: VNode | null; blobKey?: string }
/** Where original binary bytes are kept so undo still works after a reload (IndexedDB in the app, a Map in tests). */
export interface BlobStore { put(key: string, b: Blob): Promise<void>; get(key: string): Promise<Blob | null> }
export function idbBlobStore(): BlobStore | undefined {
  if (typeof indexedDB === 'undefined') return undefined; let dbp: Promise<IDBDatabase> | null = null;
  const open = () => (dbp ??= new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('notesmaker_journal', 1); r.onupgradeneeded = () => r.result.createObjectStore('blobs'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const run = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) => { const db = await open(); return new Promise<T>((res, rej) => { const q = f(db.transaction('blobs', mode).objectStore('blobs')); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };
  return { put: async (k, b) => { await run('readwrite', s => s.put(b, k)); }, get: async k => ((await run('readonly', s => s.get(k))) as Blob | undefined) ?? null };
}
export const memBlobStore = (): BlobStore => { const m = new Map<string, Blob>(); return { put: async (k, b) => { m.set(k, b); }, get: async k => m.get(k) ?? null }; };
export interface JEntry { id: string; t: number; label: string; changes: Change[]; undone?: boolean; lossy?: boolean }
const strip = (n: VNode | null): VNode | null => (n ? { ...n } : null);
const snap = (v: VFS) => { const m = new Map<string, VNode>(); for (const n of v.walk('/', 14)) if (!(n.path === LIB_ROOT || n.path.startsWith(LIB_ROOT + '/'))) m.set(n.path, n); return m; };
export class Journal {
  entries: JEntry[] = []; private subs = new Set<() => void>(); private v: VFS; private kv?: KV; private key: string; private blobs?: BlobStore;
  constructor(v: VFS, kv?: KV, key = 'nm_friday_journal', blobs?: BlobStore) { this.v = v; this.kv = kv; this.key = key; this.blobs = blobs; try { const a = JSON.parse(kv?.get(key) || '[]'); if (Array.isArray(a)) this.entries = a; } catch { /* fresh */ } }
  subscribe(f: () => void) { this.subs.add(f); return () => { this.subs.delete(f); }; }
  private persist() {
    const slim = this.entries.slice(-40).map(e => ({ ...e, changes: e.changes.map(c => ({ path: c.path, blobKey: c.blobKey, before: c.before ? { ...c.before, blob: undefined } : null, after: c.after ? { ...c.after, blob: undefined } : null })), lossy: e.lossy || e.changes.some(c => c.before?.blob && !c.blobKey) }));
    let s = JSON.stringify(slim); while (s.length > 600_000 && slim.length > 1) { slim.shift(); s = JSON.stringify(slim); } try { this.kv?.set(this.key, s); } catch { /* quota */ } this.subs.forEach(f => f());
  }
  async begin(label: string) {
    await this.v.ready(); const before = snap(this.v);
    return { end: async (): Promise<JEntry | null> => {
      const after = snap(this.v); const changes: Change[] = [];
      for (const [p, n] of after) { const b = before.get(p); if (!b) changes.push({ path: p, before: null, after: strip(n) }); else if (b.modified !== n.modified || b.size !== n.size || b.text !== n.text || b.parent !== n.parent) changes.push({ path: p, before: strip(b), after: strip(n) }); }
      for (const [p, b] of before) if (!after.has(p)) changes.push({ path: p, before: strip(b), after: null });
      if (!changes.length) return null; const e: JEntry = { id: `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, t: Date.now(), label, changes };
      for (const c of changes) if (c.before?.blob && this.blobs) { try { c.blobKey = `${e.id}:${c.path}`; await this.blobs.put(c.blobKey, c.before.blob); } catch { c.blobKey = undefined; } } this.entries.push(e); this.persist(); return e;
    } };
  }
  last(): JEntry | null { for (let i = this.entries.length - 1; i >= 0; i--) if (!this.entries[i].undone) return this.entries[i]; return null; }
  /** Undo the most recent action (or a named one). Folders restored before their files; created paths removed deepest first. */
  async undo(id?: string): Promise<{ ok: boolean; message: string; restored: number }> {
    const e = id ? this.entries.find(x => x.id === id) : this.last(); if (!e || e.undone) return { ok: false, message: 'Nothing to undo.', restored: 0 };
    const dels = e.changes.filter(c => c.before === null).map(c => c.path).sort((a, b) => b.length - a.length);
    const puts: VNode[] = []; for (const c of e.changes) if (c.before) { const n = { ...c.before }; if (!n.blob && c.blobKey && this.blobs) { try { const b = await this.blobs.get(c.blobKey); if (b) n.blob = b; } catch { /* bytes unavailable */ } } puts.push(n); } puts.sort((a, b) => a.path.length - b.path.length);
    await this.v.restore(puts, dels); e.undone = true; this.persist();
    const lost = puts.some(n => n.type === 'file' && !n.blob && /pdf|image|octet|audio|video|zip/.test(n.mime || '') );
    return { ok: true, message: `Undid “${e.label}” (${e.changes.length} change${e.changes.length === 1 ? '' : 's'})${e.lossy || lost ? '. Original binary file bytes could not be kept after a reload; text was restored' : ''}.`, restored: e.changes.length };
  }
  list() { return [...this.entries].reverse(); }
}
/* ---------------- ask before risky steps ---------------- */
export interface RiskStep { action: string; label: string; args: Record<string, string> }
export function riskOf(steps: RiskStep[]): string[] {
  const why: string[] = [];
  for (const s of steps) {
    const L = `${s.label} ${Object.values(s.args).join(' ')}`;
    if (s.action === 'fs.delete') why.push(`delete ${s.args.target || s.args.name || s.args.path || s.args.files || 'files'}${/permanent/i.test(L) ? ' permanently' : ''}`);
    else if (/^fs\.(move|copy|rename|capture)$/.test(s.action) && /\b(all|every|everything|\*)\b/i.test(L)) why.push(`${s.action.slice(3)} many files (“${s.label.slice(0, 50)}”)`);
  }
  const writes = steps.filter(s => /^fs\./.test(s.action) && !/^fs\.(cd|ls|tree|find)$/.test(s.action)).length; if (writes >= 6) why.push(`${writes} file operations in one go`);
  return [...new Set(why)];
}
