/** FRIDAY wiring: gathers live data (sims, notes, PDFs), asks the offline brain, and optionally a language model when a key is set. */
import { SIMS } from '../sims/registry';
import { resolveCurriculum } from '../sims/curriculumCatalog';
import { baseDocs, buildIndex, ask as askCore, composeNotes, contextFor, retrieve, searchAllDocs } from './fridayCore';
import type { Answer, Chip, Index, KDoc, SimLike } from './fridayCore';
import { listDocs } from './libraryStore';
import type { StoredDoc } from './libraryStore';
import { generate, loadProvider, loadSaved, loadSpeed } from './aiClient';
import type { AiConfig } from './aiClient';
import { summarize, keyTerms } from './textTools';

export type { Answer, Chip };
let base: KDoc[] | null = null; let pdfDocs: KDoc[] | null = null; let docsCache: StoredDoc[] = [];
if (typeof window !== 'undefined') window.addEventListener('nm:library', () => { pdfDocs = null; });

export function noteDocs(): KDoc[] {
  const out: KDoc[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || ''; if (!k.startsWith('notesmaker_text_')) continue;
      const title = k.slice('notesmaker_text_'.length); let pages: Record<string, string> = {};
      try { pages = JSON.parse(localStorage.getItem(k) || '{}'); } catch { continue; }
      for (const [p, text] of Object.entries(pages)) if (typeof text === 'string' && text.trim().length > 20) out.push({ id: `n:${k}:${p}`, kind: 'note', title, where: `page ${p}`, text, cmd: `go to page ${p}` });
    }
    for (const k of Object.keys(localStorage)) if (k.startsWith('nm_gen_')) { try { const j = JSON.parse(localStorage.getItem(k) || '{}'); if (j.text) out.push({ id: k, kind: 'note', title: j.topic || 'Generated note', where: 'saved note', text: j.text }); } catch { /* skip */ } }
  } catch { /* storage unavailable */ }
  return out;
}
export async function pdfDocsIndex(): Promise<KDoc[]> {
  if (pdfDocs) return pdfDocs;
  docsCache = await listDocs(); const out: KDoc[] = [];
  for (const d of docsCache) {
    const pages = d.pageTexts?.length ? d.pageTexts : [d.textContent]; const step = 1;
    for (let i = 0; i < pages.length; i += step) if ((pages[i] || '').trim().length > 20) out.push({ id: `p:${d.id}:${i}`, kind: 'pdf', title: d.name, where: `page ${i + 1}${d.folder ? ' · ' + d.folder : ''}`, text: pages[i], cmd: `summarize my pdf ${d.name.replace(/\.pdf$/i, '')}` });
  }
  pdfDocs = out; return out;
}
export async function getIndex(): Promise<Index> {
  if (!base) base = baseDocs(SIMS as unknown as SimLike[]);
  return buildIndex(base, [...noteDocs(), ...(await pdfDocsIndex())]);
}

export function llmConfig(): AiConfig | null {
  try {
    const provider = loadProvider(); const saved = loadSaved(provider, (import.meta.env.VITE_GEMINI_API_KEY as string) || '');
    if (provider !== 'custom' && !saved.apiKey) return null; if (provider === 'custom' && !saved.baseUrl) return null;
    if (typeof navigator !== 'undefined' && navigator.onLine === false && provider !== 'custom') return null;
    return { provider, apiKey: saved.apiKey, model: saved.model, baseUrl: saved.baseUrl, speed: loadSpeed() };
  } catch { return null; }
}
const SYSTEM = 'You are FRIDAY, the study assistant inside the offline-first web app “Notes Maker AI” (digital notebook, 100+ STEM simulations, PDF library, study planner). Answer clearly and correctly like a patient university tutor: short paragraphs, formulas in plain text, a worked example when useful. If CONTEXT is provided and relevant, use it and say which source you used; otherwise rely on your own knowledge and say if you are unsure. Never invent citations.';

export interface Reply2 extends Answer { mode: 'offline' | 'ai'; note?: string }
export async function fridayAsk(q: string, history: { who: 'you' | 'bot'; text: string }[] = []): Promise<Reply2> {
  const ix = await getIndex(); const off = askCore(ix, q);
  if (off.kind === 'calc' || off.kind === 'chat') return { ...off, mode: 'offline' };
  const cfg = llmConfig();
  if (!cfg) return { ...off, mode: 'offline', note: off.found ? undefined : undefined };
  try {
    const conv = history.slice(-6).map(m => `${m.who === 'you' ? 'Student' : 'FRIDAY'}: ${m.text.slice(0, 500)}`).join('\n');
    const text = await generate(cfg, `${SYSTEM}\n\nCONTEXT (from the student's app; may be empty):\n${off.context || '(none)'}\n\nCONVERSATION SO FAR:\n${conv || '(none)'}\n\nStudent: ${q}\nFRIDAY:`, { stream: false, retries: 1, timeoutMs: 40000, maxTokens: 900 });
    if (text.trim()) return { ...off, text: text.trim(), found: true, mode: 'ai' };
  } catch (e) { return { ...off, mode: 'offline', note: `AI request failed (${(e as Error).message.slice(0, 120)}); showing my offline answer.` }; }
  return { ...off, mode: 'offline' };
}

export async function fridayNotes(topic: string, depth: 'brief' | 'standard' | 'detailed' = 'standard'): Promise<{ text: string; mode: 'ai' | 'offline'; found: boolean; note?: string }> {
  const ix = await getIndex(); const off = composeNotes(ix, topic, depth); const cfg = llmConfig();
  if (cfg) {
    try {
      const ctx = contextFor(retrieve(ix, topic, 6), topic, 3000);
      const text = await generate(cfg, `${SYSTEM}\n\nWrite well-structured study notes on: ${topic}\nDepth: ${depth}. Use plain text with headings written as lines starting with “## ”, bullets starting with “• ”, key formulas, one worked example, common mistakes and 3 self-check questions. No markdown tables.\n\nCONTEXT:\n${ctx || '(none)'}`, { stream: false, retries: 1, timeoutMs: 60000, maxTokens: depth === 'detailed' ? 1800 : 1100 });
      if (text.trim()) return { text: text.trim(), mode: 'ai', found: true };
    } catch (e) { return { ...off, mode: 'offline', note: `AI request failed (${(e as Error).message.slice(0, 100)}); used offline notes.` }; }
  }
  return { ...off, mode: 'offline' };
}

export async function searchEverything(q: string): Promise<{ text: string; chips: Chip[]; groups: { kind: string; items: { title: string; where?: string; cmd?: string; snippet: string }[] }[] }> {
  const ix = await getIndex(); const hits = searchAllDocs(ix, q, 14);
  const label: Record<string, string> = { sim: 'Simulations', glossary: 'Concepts', guide: 'App help', note: 'Your notes', pdf: 'Your PDFs' };
  const groups = Object.keys(label).map(kind => ({ kind: label[kind], items: hits.filter(h => h.doc.kind === kind).slice(0, 4).map(h => ({ title: h.doc.title, where: h.doc.where, cmd: h.doc.cmd, snippet: (h.doc.kind === 'pdf' || h.doc.kind === 'note' ? summarize(h.doc.text, 1, q)[0] || h.doc.text.slice(0, 140) : h.doc.text.replace(/^[^.]*\.\s*/, '')).slice(0, 150) })) })).filter(g => g.items.length);
  const cur = resolveCurriculum(SIMS).filter(t => t.title.toLowerCase().includes(q.toLowerCase())).slice(0, 3);
  const text = groups.length ? groups.map(g => `${g.kind}: ${g.items.map(i => i.title + (i.where ? ` (${i.where})` : '')).join('; ')}`).join('\n') + (cur.length ? `\nCurriculum: ${cur.map(t => (t.status === 'working' ? t.title : `${t.title} (${t.status})`)).join('; ')}` : '') : `Nothing matched “${q}”.`;
  const chips: Chip[] = groups.flatMap(g => g.items.filter(i => i.cmd).slice(0, 2).map(i => ({ label: i.title.length > 30 ? i.title.slice(0, 28) + '…' : i.title, cmd: i.cmd! }))).slice(0, 6);
  return { text, chips, groups };
}

/* ---------- PDFs for the agent ---------- */
export async function pdfList(): Promise<StoredDoc[]> { docsCache = await listDocs(); return docsCache; }
export function findPdf(q: string, docs: StoredDoc[]): StoredDoc | null {
  const w = q.toLowerCase().replace(/\.pdf\b/g, '').split(/[^a-z0-9]+/).filter(x => x.length > 1 && !['pdf', 'the', 'my', 'file', 'document', 'of', 'a'].includes(x)); if (!w.length) return null;
  let best: StoredDoc | null = null, bs = 0;
  for (const d of docs) { const n = d.name.toLowerCase().replace(/[^a-z0-9]+/g, ' '); const body = (d.textContent || '').slice(0, 2000).toLowerCase(); const sc = w.filter(x => n.includes(x)).length / w.length + w.filter(x => body.includes(x)).length / w.length * 0.2; if (sc > bs) { bs = sc; best = d; } }
  return bs >= 0.5 ? best : null;
}
export function pdfSummary(d: StoredDoc, n = 6): { text: string; terms: string[] } {
  const body = (d.pageTexts?.length ? d.pageTexts.join('\n') : d.textContent) || ''; const ss = summarize(body, n);
  return { text: ss.length ? ss.map(s => '• ' + s).join('\n') : 'This PDF has no readable text (it may be scanned images).', terms: keyTerms(body, 8) };
}
