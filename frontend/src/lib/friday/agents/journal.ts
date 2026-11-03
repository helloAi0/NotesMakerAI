/**
 * Undo journal for file actions. An action is bracketed with begin()/end(); the journal diffs the virtual file system before and after, stores the
 * inverse, and `undo()` restores it exactly. Risky plans are flagged first so FRIDAY can ask before doing them.
 */
import type { VFS, VNode } from '../vfs';
import { LIB_ROOT } from '../vfs';
import type { KV } from '../learn';
export interface Change { path: string; before: VNode | null; after: VNode | null }
export interface JEntry { id: string; t: number; label: string; changes: Change[]; undone?: boolean; lossy?: boolean }
const strip = (n: VNode | null): VNode | null => (n ? { ...n } : null);
const snap = (v: VFS) => { const m = new Map<string, VNode>(); for (const n of v.walk('/', 14)) if (!(n.path === LIB_ROOT || n.path.startsWith(LIB_ROOT + '/'))) m.set(n.path, n); return m; };
export class Journal {
  entries: JEntry[] = []; private subs = new Set<() => void>(); private v: VFS; private kv?: KV; private key: string;
  constructor(v: VFS, kv?: KV, key = 'nm_friday_journal') { this.v = v; this.kv = kv; this.key = key; try { const a = JSON.parse(kv?.get(key) || '[]'); if (Array.isArray(a)) this.entries = a; } catch { /* fresh */ } }
  subscribe(f: () => void) { this.subs.add(f); return () => { this.subs.delete(f); }; }
  private persist() {
    const slim = this.entries.slice(-40).map(e => ({ ...e, changes: e.changes.map(c => ({ path: c.path, before: c.before && !c.before.blob ? c.before : c.before ? { ...c.before, blob: undefined } : null, after: c.after ? { ...c.after, blob: undefined } : null })), lossy: e.lossy || e.changes.some(c => c.before?.blob) }));
    let s = JSON.stringify(slim); while (s.length > 600_000 && slim.length > 1) { slim.shift(); s = JSON.stringify(slim); } try { this.kv?.set(this.key, s); } catch { /* quota */ } this.subs.forEach(f => f());
  }
  async begin(label: string) {
    await this.v.ready(); const before = snap(this.v);
    return { end: async (): Promise<JEntry | null> => {
      const after = snap(this.v); const changes: Change[] = [];
      for (const [p, n] of after) { const b = before.get(p); if (!b) changes.push({ path: p, before: null, after: strip(n) }); else if (b.modified !== n.modified || b.size !== n.size || b.text !== n.text || b.parent !== n.parent) changes.push({ path: p, before: strip(b), after: strip(n) }); }
      for (const [p, b] of before) if (!after.has(p)) changes.push({ path: p, before: strip(b), after: null });
      if (!changes.length) return null; const e: JEntry = { id: `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, t: Date.now(), label, changes }; this.entries.push(e); this.persist(); return e;
    } };
  }
  last(): JEntry | null { for (let i = this.entries.length - 1; i >= 0; i--) if (!this.entries[i].undone) return this.entries[i]; return null; }
  /** Undo the most recent action (or a named one). Folders restored before their files; created paths removed deepest first. */
  async undo(id?: string): Promise<{ ok: boolean; message: string; restored: number }> {
    const e = id ? this.entries.find(x => x.id === id) : this.last(); if (!e || e.undone) return { ok: false, message: 'Nothing to undo.', restored: 0 };
    const dels = e.changes.filter(c => c.before === null).map(c => c.path).sort((a, b) => b.length - a.length);
    const puts = e.changes.filter(c => c.before !== null).map(c => c.before as VNode).sort((a, b) => a.path.length - b.path.length);
    await this.v.restore(puts, dels); e.undone = true; this.persist();
    const lost = e.changes.some(c => c.before && c.before.type === 'file' && !c.before.blob && c.before.mime && /pdf|image|octet/.test(c.before.mime) && !c.before.text);
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
