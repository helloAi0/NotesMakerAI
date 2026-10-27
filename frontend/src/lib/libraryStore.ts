/** Persistent PDF library: documents live in IndexedDB (survive refresh, work offline); folders are a list in localStorage. */
export interface StoredDoc { id: string; name: string; size: string; pages: number; textContent: string; pageTexts: string[]; uploadDate: string; folder: string }
const DB = 'notesmaker_library', STORE = 'docs', FKEY = 'nm_lib_folders';
let dbp: Promise<IDBDatabase> | null = null;
const open = () => dbp ??= new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => { const db = await open(); return new Promise((res, rej) => { const r = f(db.transaction(STORE, mode).objectStore(STORE)); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };
export const notifyLibrary = () => window.dispatchEvent(new Event('nm:library'));

export async function listDocs(): Promise<StoredDoc[]> { try { const all = await tx('readonly', s => s.getAll() as IDBRequest<StoredDoc[]>); return all.sort((a, b) => b.uploadDate.localeCompare(a.uploadDate)); } catch { return []; } }
export async function saveDoc(d: StoredDoc) { try { await tx('readwrite', s => s.put(d)); } catch { /* private mode / quota */ } notifyLibrary(); }
export async function removeDoc(id: string) { try { await tx('readwrite', s => s.delete(id)); } catch { /* ignore */ } notifyLibrary(); }
export async function moveDoc(id: string, folder: string) { const d = (await tx('readonly', s => s.get(id) as IDBRequest<StoredDoc | undefined>).catch(() => undefined)); if (!d) return false; await saveDoc({ ...d, folder }); return true; }

export function listFolders(): string[] { try { return JSON.parse(localStorage.getItem(FKEY) || '[]'); } catch { return []; } }
export function addFolder(name: string): string { const n = name.trim().replace(/\s+/g, ' ').slice(0, 40); if (!n) return ''; const f = listFolders(); const hit = f.find(x => x.toLowerCase() === n.toLowerCase()); if (hit) return hit; try { localStorage.setItem(FKEY, JSON.stringify([...f, n])); } catch { /* ignore */ } notifyLibrary(); return n; }
export async function removeFolder(name: string) { try { localStorage.setItem(FKEY, JSON.stringify(listFolders().filter(f => f !== name))); } catch { /* ignore */ } for (const d of await listDocs()) if (d.folder === name) await saveDoc({ ...d, folder: '' }); notifyLibrary(); }

/** Extract the text of a PDF locally (pdf.js worker is bundled, not fetched from a CDN). */
export async function extractPdf(file: File | ArrayBuffer): Promise<{ pages: number; pageTexts: string[] }> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise, pageTexts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) { const c = await (await pdf.getPage(i)).getTextContent(); pageTexts.push(c.items.map((it) => ('str' in it ? it.str : '')).join(' ')); }
  if (pageTexts.reduce((n, p) => n + p.trim().length, 0) < 200) throw new Error('No selectable text found. This looks like a scanned PDF (images of pages). Run OCR on it first, then upload again.');
  return { pages: pdf.numPages, pageTexts };
}
export const pageBlockText = (t: string, i: number) => `--- Page ${i + 1} ---\n${t}\n\n`;
export async function importPdf(file: File, folder = ''): Promise<StoredDoc> {
  const { pages, pageTexts } = await extractPdf(file);
  const d: StoredDoc = { id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: file.name, size: `${(file.size / 1048576).toFixed(1)} MB`, pages, textContent: pageTexts.map(pageBlockText).join(''), pageTexts, uploadDate: new Date().toISOString(), folder };
  await saveDoc(d); return d;
}
