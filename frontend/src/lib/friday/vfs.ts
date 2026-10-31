/**
 * FRIDAY virtual file system: a real directory tree persisted in IndexedDB (works offline, survives refresh).
 * The PDF library is mounted read-through under /PDF Library so FRIDAY can navigate, capture and move those documents too.
 * Falls back to an in-memory store when IndexedDB is unavailable (private mode, unit tests).
 */
import { listDocs, listFolders, moveDoc, saveDoc, addFolder } from '../libraryStore';
import type { StoredDoc } from '../libraryStore';

export type NodeType = 'dir' | 'file';
export interface VNode {
  path: string; name: string; parent: string; type: NodeType; mime: string; size: number; created: number; modified: number;
  text?: string;            // extracted / plain text content
  blob?: Blob;              // original bytes for binary uploads
  pages?: number;
  source?: { kind: 'lib'; docId: string }; // virtual node mirrored from the PDF library
  readonly?: boolean;
}
export const ROOT = '/';
export const LIB_ROOT = '/PDF Library';
export const DEFAULT_DIRS = ['/Documents', '/Inbox', '/PDF Processing', '/Reports', '/Captures', '/Notes', '/Trash'];

/* ---------------- path helpers ---------------- */
export function normPath(p: string): string {
  const parts: string[] = [];
  for (const seg of p.replace(/\\/g, '/').split('/')) { if (!seg || seg === '.') continue; if (seg === '..') parts.pop(); else parts.push(seg.trim()); }
  return '/' + parts.join('/');
}
export const dirname = (p: string) => { const n = normPath(p); const i = n.lastIndexOf('/'); return i <= 0 ? '/' : n.slice(0, i); };
export const basename = (p: string) => { const n = normPath(p); return n === '/' ? '/' : n.slice(n.lastIndexOf('/') + 1); };
export const join = (a: string, b: string) => normPath(b.startsWith('/') ? b : `${a}/${b}`);
const lc = (s: string) => s.toLowerCase();
const isLib = (p: string) => p === LIB_ROOT || p.startsWith(LIB_ROOT + '/');

/* ---------------- fuzzy naming ---------------- */
const FILLER = new Set(['the', 'a', 'an', 'my', 'this', 'that', 'those', 'these', 'folder', 'directory', 'dir', 'section', 'module', 'area', 'file', 'document', 'doc', 'pdf', 'named', 'called', 'in', 'into', 'to', 'of', 'there', 'here', 'our', 'your', 'its']);
export const nameTokens = (s: string, dropFiller = true) => lc(s).replace(/\.[a-z0-9]{1,5}$/, '').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w && (!dropFiller || !FILLER.has(w))).map(w => w.replace(/(ing|es|s)$/, m => (w.length > 4 ? '' : m)));
export function nameScore(query: string, name: string): number {
  const q = nameTokens(query), n = nameTokens(name, false); if (!q.length || !n.length) return 0;
  const qs = q.join(' '), ns = n.join(' '); if (qs === ns) return 1;
  const hit = q.filter(w => n.some(x => x === w || (w.length > 3 && (x.startsWith(w) || w.startsWith(x))))).length;
  let sc = hit / q.length * 0.8 + (hit / n.length) * 0.2; if (ns.includes(qs)) sc = Math.max(sc, 0.9); return Math.min(1, sc);
}

/* ---------------- storage backends ---------------- */
interface Backend { all(): Promise<VNode[]>; put(n: VNode): Promise<void>; del(path: string): Promise<void> }
const memBackend = (): Backend => { const m = new Map<string, VNode>(); return { all: async () => [...m.values()], put: async n => { m.set(n.path, n); }, del: async p => { m.delete(p); } }; };
const idbBackend = (): Backend => {
  let dbp: Promise<IDBDatabase> | null = null;
  const open = () => (dbp ??= new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('notesmaker_vfs', 1); r.onupgradeneeded = () => r.result.createObjectStore('nodes', { keyPath: 'path' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const run = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) => { const db = await open(); return new Promise<T>((res, rej) => { const r = f(db.transaction('nodes', mode).objectStore('nodes')); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };
  return { all: () => run('readonly', s => s.getAll() as IDBRequest<VNode[]>), put: async n => { await run('readwrite', s => s.put(n)); }, del: async p => { await run('readwrite', s => s.delete(p)); } };
};

/* ---------------- the file system ---------------- */
export class VFS {
  private nodes = new Map<string, VNode>(); private lib: StoredDoc[] = []; private be: Backend; private subs = new Set<() => void>(); private ver = 0; private ready$: Promise<void>; private useLib: boolean;
  constructor(be?: Backend, mountLibrary = true) {
    this.useLib = mountLibrary; this.be = be ?? (typeof indexedDB !== 'undefined' ? idbBackend() : memBackend());
    this.ready$ = this.init();
    if (typeof window !== 'undefined' && mountLibrary) window.addEventListener('nm:library', () => { void this.refreshLib(); });
  }
  private async init() {
    try { for (const n of await this.be.all()) this.nodes.set(n.path, n); } catch { this.be = memBackend(); }
    for (const d of DEFAULT_DIRS) if (!this.nodes.has(d)) await this.mk(d);
    await this.refreshLib();
  }
  ready() { return this.ready$; }
  version() { return this.ver; }
  subscribe(f: () => void) { this.subs.add(f); return () => { this.subs.delete(f); }; }
  private emit() { this.ver++; this.subs.forEach(f => f()); }
  async refreshLib() { if (!this.useLib) return; try { this.lib = await listDocs(); } catch { this.lib = []; } this.emit(); }

  /* ---- virtual library mount ---- */
  private libNode(d: StoredDoc): VNode { const folder = d.folder ? `${LIB_ROOT}/${d.folder}` : LIB_ROOT, t = d.uploadDate ? Date.parse(d.uploadDate) || 0 : 0; return { path: `${folder}/${d.name}`, name: d.name, parent: folder, type: 'file', mime: 'application/pdf', size: d.textContent.length, created: t, modified: t, text: d.textContent, pages: d.pages, source: { kind: 'lib', docId: d.id }, readonly: false }; }
  private libDirs(): VNode[] { return listFolders().map(f => ({ path: `${LIB_ROOT}/${f}`, name: f, parent: LIB_ROOT, type: 'dir' as const, mime: 'inode/directory', size: 0, created: 0, modified: 0 })); }
  private libRootNode(): VNode { return { path: LIB_ROOT, name: 'PDF Library', parent: '/', type: 'dir', mime: 'inode/directory', size: 0, created: 0, modified: 0, readonly: false }; }

  /* ---- reads ---- */
  stat(p: string): VNode | null {
    const n = normPath(p); if (n === '/') return { path: '/', name: '/', parent: '/', type: 'dir', mime: 'inode/directory', size: 0, created: 0, modified: 0 };
    if (isLib(n)) { if (n === LIB_ROOT) return this.libRootNode(); const d = this.libDirs().find(x => x.path === n); if (d) return d; return this.lib.map(x => this.libNode(x)).find(x => x.path === n) ?? null; }
    return this.nodes.get(n) ?? null;
  }
  exists(p: string) { return !!this.stat(p); }
  isDir(p: string) { return this.stat(p)?.type === 'dir'; }
  list(dir: string): VNode[] {
    const d = normPath(dir); const out: VNode[] = [];
    if (d === '/') { out.push(...[...this.nodes.values()].filter(n => n.parent === '/'), ...(this.useLib ? [this.libRootNode()] : [])); }
    else if (isLib(d)) { if (d === LIB_ROOT) { out.push(...this.libDirs(), ...this.lib.filter(x => !x.folder).map(x => this.libNode(x))); } else { const f = basename(d); out.push(...this.lib.filter(x => x.folder === f).map(x => this.libNode(x))); } }
    else out.push(...[...this.nodes.values()].filter(n => n.parent === d));
    return out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.type === 'dir' ? -1 : 1));
  }
  walk(dir = '/', depth = 8): VNode[] { const out: VNode[] = []; const rec = (d: string, k: number) => { for (const n of this.list(d)) { out.push(n); if (n.type === 'dir' && k < depth) rec(n.path, k + 1); } }; rec(normPath(dir), 0); return out; }
  readText(p: string): string | null { const n = this.stat(p); return n && n.type === 'file' ? n.text ?? '' : null; }
  tree(dir = '/', depth = 3): string {
    const lines: string[] = []; const rec = (d: string, pre: string, k: number) => { const kids = this.list(d); kids.forEach((n, i) => { const last = i === kids.length - 1; lines.push(`${pre}${last ? '└── ' : '├── '}${n.name}${n.type === 'dir' ? '/' : ''}`); if (n.type === 'dir' && k < depth) rec(n.path, pre + (last ? '    ' : '│   '), k + 1); }); }; lines.push(normPath(dir)); rec(normPath(dir), '', 0); return lines.join('\n');
  }

  /* ---- fuzzy resolution ---- */
  /** Resolve a spoken/typed folder reference such as "the pdf processing section" or "/Documents/Physics". */
  resolveDir(spec: string, cwd = '/'): { path: string; score: number } | null {
    const s = spec.trim(); if (!s) return null;
    if (/^(root|\/|home)$/i.test(s)) return { path: '/', score: 1 };
    if (/^(here|this folder|current( folder| directory)?|where i am)$/i.test(s)) return { path: normPath(cwd), score: 1 };
    if (/^(\.\.|up|parent( folder)?|back)$/i.test(s)) return { path: dirname(cwd), score: 1 };
    if (s.includes('/') || s.startsWith('~')) { const p = normPath(s.startsWith('/') ? s : s.startsWith('~') ? s.slice(1) : join(cwd, s)); if (this.isDir(p)) return { path: p, score: 1 }; }
    let best: { path: string; score: number } | null = null;
    for (const n of this.walk('/', 6)) { if (n.type !== 'dir') continue; let sc = nameScore(s, n.name); if (n.parent === normPath(cwd)) sc += 0.05; if (n.path.startsWith(normPath(cwd) + '/')) sc += 0.02; if (!best || sc > best.score) best = { path: n.path, score: sc }; }
    return best && best.score >= 0.6 ? best : null;
  }
  /** Find files in a directory (recursively) matching a fuzzy name; special words pick by recency. */
  resolveFiles(spec: string, dir: string, opts: { recursive?: boolean } = {}): VNode[] {
    const files = (opts.recursive === false ? this.list(dir) : this.walk(dir, 6)).filter(n => n.type === 'file'); const s = spec.trim().toLowerCase();
    if (!s || /^(it|them|that|this|one|document|file|pdf|doc|the document|the file|the pdf|a document|any|all|everything|all (the )?(files|documents|pdfs))$/.test(s)) {
      if (/^(all|everything|them)/.test(s)) return files;
      // a single "document": prefer real documents (pdf/office/markdown) over scratch files, then the most recently changed
      const isDoc = (f: VNode) => (/pdf|word|officedocument|markdown/i.test(f.mime) || /\.(pdf|docx?|md|pptx?)$/i.test(f.name) ? 1 : 0);
      return [...files].sort((a, b) => isDoc(b) - isDoc(a) || b.modified - a.modified).slice(0, 1);
    }
    if (/^(the )?(latest|newest|most recent|last)( (document|file|pdf|doc|one))?$/.test(s)) return [...files].sort((a, b) => b.modified - a.modified).slice(0, 1);
    if (/^(the )?(oldest|first)( (document|file|pdf|doc|one))?$/.test(s)) return [...files].sort((a, b) => a.modified - b.modified).slice(0, 1);
    const ext = s.match(/^(?:all |the |any )?(pdf|txt|md|text|image|docx?)s?(?: files?| documents?)?$/); if (ext) { const e = ext[1]; return files.filter(f => (e === 'pdf' ? /pdf$/i.test(f.mime) || /\.pdf$/i.test(f.name) : e === 'image' ? /^image\//.test(f.mime) : e === 'doc' || e === 'docx' ? /\.docx?$/i.test(f.name) : /\.(txt|md)$/i.test(f.name))); }
    const scored = files.map(f => ({ f, sc: nameScore(s, f.name) })).filter(x => x.sc >= 0.5).sort((a, b) => b.sc - a.sc); return scored.slice(0, 5).map(x => x.f);
  }
  find(query: string, dir = '/', k = 12): { node: VNode; score: number; why: 'name' | 'content' }[] {
    const out: { node: VNode; score: number; why: 'name' | 'content' }[] = []; const qt = nameTokens(query); const re = qt.length ? qt : [lc(query)];
    for (const n of this.walk(dir, 8)) { const ns = nameScore(query, n.name); if (ns >= 0.5) { out.push({ node: n, score: ns, why: 'name' }); continue; } if (n.type === 'file' && n.text) { const t = lc(n.text); const hits = re.filter(w => t.includes(w)).length; if (hits && hits / re.length >= 0.6) out.push({ node: n, score: 0.3 + 0.2 * (hits / re.length), why: 'content' }); } }
    return out.sort((a, b) => b.score - a.score).slice(0, k);
  }

  /* ---- writes ---- */
  private async mk(path: string) { const n = normPath(path); const node: VNode = { path: n, name: basename(n), parent: dirname(n), type: 'dir', mime: 'inode/directory', size: 0, created: Date.now(), modified: Date.now() }; this.nodes.set(n, node); await this.be.put(node); }
  async mkdir(path: string): Promise<{ ok: boolean; path: string; message: string }> {
    await this.ready(); const n = normPath(path);
    if (isLib(n)) { if (n === LIB_ROOT) return { ok: true, path: n, message: 'The PDF library root already exists.' }; const f = addFolder(basename(n)); await this.refreshLib(); return f ? { ok: true, path: `${LIB_ROOT}/${f}`, message: `Created library folder “${f}”.` } : { ok: false, path: n, message: 'Could not create that library folder.' }; }
    if (this.stat(n)) return { ok: true, path: n, message: `${n} already exists.` };
    const parts = n.split('/').filter(Boolean); let cur = '';
    for (const p of parts) { cur += '/' + p; const ex = this.nodes.get(cur); if (ex && ex.type === 'file') return { ok: false, path: n, message: `${cur} is a file, not a folder.` }; if (!ex) await this.mk(cur); }
    this.emit(); return { ok: true, path: n, message: `Created folder ${n}.` };
  }
  async writeText(path: string, text: string, extra: Partial<VNode> = {}): Promise<VNode> {
    await this.ready(); const n = normPath(path); await this.mkdir(dirname(n)); const now = Date.now(); const prev = this.nodes.get(n);
    const node: VNode = { path: n, name: basename(n), parent: dirname(n), type: 'file', mime: /\.md$/i.test(n) ? 'text/markdown' : 'text/plain', size: text.length, created: prev?.created ?? now, modified: now, text, ...extra };
    this.nodes.set(n, node); await this.be.put(node); this.emit(); return node;
  }
  async writeBlob(path: string, blob: Blob, text = '', pages?: number): Promise<VNode> { return this.writeText(path, text, { blob, mime: blob.type || 'application/octet-stream', size: blob.size, pages }); }
  uniquePath(dir: string, name: string): string { let p = join(dir, name); if (!this.stat(p)) return p; const m = name.match(/^(.*?)(\.[^.]*)?$/)!; for (let i = 2; i < 1000; i++) { p = join(dir, `${m[1]} (${i})${m[2] ?? ''}`); if (!this.stat(p)) return p; } return p; }
  async remove(path: string, permanent = false): Promise<{ ok: boolean; message: string; path?: string }> {
    await this.ready(); const n = normPath(path); const node = this.stat(n); if (!node) return { ok: false, message: `${n} does not exist.` };
    if (n === '/' || DEFAULT_DIRS.includes(n) || n === LIB_ROOT) return { ok: false, message: `${n} is a system folder and cannot be deleted.` };
    if (isLib(n)) return { ok: false, message: 'Library documents are removed from the PDF Library screen, not from here.' };
    if (!permanent && !n.startsWith('/Trash/')) { const dst = this.uniquePath('/Trash', node.name); const r = await this.move(n, dst); return r.ok ? { ok: true, message: `Moved ${node.name} to /Trash (recoverable).`, path: dst } : r; }
    const kill = [node, ...(node.type === 'dir' ? this.walk(n, 12) : [])]; for (const k of kill) { this.nodes.delete(k.path); await this.be.del(k.path); } this.emit(); return { ok: true, message: `Permanently deleted ${node.name}.` };
  }
  /** Move a file or folder. `dst` may be an existing directory (then the source name is kept) or a full target path. */
  async move(src: string, dst: string): Promise<{ ok: boolean; message: string; path?: string }> {
    await this.ready(); const s = normPath(src), node = this.stat(s); if (!node) return { ok: false, message: `${s} does not exist.` };
    const d0 = normPath(dst); const dstIsDir = this.isDir(d0); const target = dstIsDir ? join(d0, node.name) : d0;
    if (s === target) return { ok: true, message: `${node.name} is already there.`, path: s };
    if (node.type === 'dir' && (target === s || target.startsWith(s + '/'))) return { ok: false, message: 'A folder cannot be moved into itself.' };
    // library-aware branches
    if (node.source?.kind === 'lib') {
      if (isLib(target)) { const folder = dirname(target) === LIB_ROOT ? '' : basename(dirname(target)); const ok = await moveDoc(node.source.docId, folder); await this.refreshLib(); return ok ? { ok: true, message: `Moved “${node.name}” to the PDF library folder ${folder || '(top level)'}.`, path: target } : { ok: false, message: 'The library document could not be moved.' }; }
      const copy = await this.writeText(this.uniquePath(dstIsDir ? d0 : dirname(target), dstIsDir ? node.name : basename(target)), node.text ?? '', { mime: 'application/pdf', pages: node.pages, source: undefined }); return { ok: true, message: `Copied “${node.name}” (${node.pages ?? '?'} pages of text) into ${dirname(copy.path)}. The original stays in the PDF Library.`, path: copy.path };
    }
    if (isLib(target)) { if (node.type === 'dir') return { ok: false, message: 'Folders cannot be moved into the PDF library.' }; const folder = dirname(target) === LIB_ROOT ? '' : basename(dirname(target)); if (folder) addFolder(folder); const d: StoredDoc = { id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: node.name, size: `${(node.size / 1048576).toFixed(1)} MB`, pages: node.pages ?? 1, textContent: node.text ?? '', pageTexts: [node.text ?? ''], uploadDate: new Date().toISOString(), folder }; await saveDoc(d); await this.remove(s, true); await this.refreshLib(); return { ok: true, message: `Imported “${node.name}” into the PDF library${folder ? ` folder ${folder}` : ''}.`, path: `${folder ? `${LIB_ROOT}/${folder}` : LIB_ROOT}/${node.name}` }; }
    if (this.stat(target) && !dstIsDir) return { ok: false, message: `${target} already exists.` };
    await this.mkdir(dirname(target)); const finalTarget = this.stat(target) ? this.uniquePath(dirname(target), basename(target)) : target;
    const moved: VNode[] = node.type === 'dir' ? [node, ...this.walk(s, 12)] : [node];
    for (const m of moved) { this.nodes.delete(m.path); await this.be.del(m.path); const np = finalTarget + m.path.slice(s.length); const nn: VNode = { ...m, path: np, name: basename(np), parent: dirname(np), modified: Date.now() }; this.nodes.set(np, nn); await this.be.put(nn); }
    this.emit(); return { ok: true, message: `Moved ${node.name} → ${dirname(finalTarget)}.`, path: finalTarget };
  }
  async copy(src: string, dst: string): Promise<{ ok: boolean; message: string; path?: string }> {
    await this.ready(); const s = normPath(src), node = this.stat(s); if (!node) return { ok: false, message: `${s} does not exist.` }; if (node.type === 'dir') return { ok: false, message: 'Copying whole folders is not supported; copy the files inside.' };
    const d0 = normPath(dst); const target = this.isDir(d0) ? this.uniquePath(d0, node.name) : this.uniquePath(dirname(d0), basename(d0));
    if (isLib(target)) return { ok: false, message: 'Use move to import into the PDF library.' };
    const c = await this.writeText(target, node.text ?? '', { mime: node.mime, size: node.size, blob: node.blob, pages: node.pages }); return { ok: true, message: `Copied ${node.name} → ${dirname(c.path)}.`, path: c.path };
  }
  async rename(path: string, newName: string): Promise<{ ok: boolean; message: string; path?: string }> {
    const n = normPath(path), node = this.stat(n); if (!node) return { ok: false, message: `${n} does not exist.` }; let nm = newName.trim().replace(/[\\/]/g, '-'); if (node.type === 'file' && !/\.[A-Za-z0-9]{1,5}$/.test(nm)) nm += (node.name.match(/\.[A-Za-z0-9]{1,5}$/)?.[0] ?? ''); if (!nm) return { ok: false, message: 'Give the new name.' };
    if (node.source?.kind === 'lib') return { ok: false, message: 'Rename library documents from the PDF Library screen.' };
    const target = join(node.parent, nm); if (this.stat(target)) return { ok: false, message: `${target} already exists.` }; const r = await this.move(n, target); return r.ok ? { ...r, message: `Renamed ${node.name} → ${nm}.` } : r;
  }
  stats() { const all = this.walk('/', 12); return { files: all.filter(n => n.type === 'file').length, dirs: all.filter(n => n.type === 'dir').length, bytes: all.reduce((a, n) => a + (n.type === 'file' ? n.size : 0), 0) }; }
}

let shared: VFS | null = null;
export const vfs = (): VFS => (shared ??= new VFS());
/** Fresh isolated instance (tests). */
export const memoryVfs = (): VFS => new VFS(memBackend(), false);
