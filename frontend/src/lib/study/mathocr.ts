/* Handwriting -> LaTeX / diagram. The vision model (any provider, injected) reads a photo of a notebook page and returns JSON; everything
   after that is checked locally: LaTeX is validated with KaTeX, graphs are validated and laid out by us. Unreadable parts are reported, not guessed. */
import katex from 'katex';
export type Vision = (jpegDataUrl: string, question: string) => Promise<string>;
export interface DNode { id: string; label: string; shape?: 'start' | 'process' | 'decision' | 'io' | 'component' }
export interface DEdge { from: string; to: string; label?: string }
export interface Scan { kind: 'equations' | 'flowchart' | 'circuit' | 'mixed' | 'unknown'; equations: { latex: string; valid: boolean; error?: string; unsure?: boolean }[]; nodes: DNode[]; edges: DEdge[]; text: string; warnings: string[] }

export const SCAN_PROMPT = `You are reading a photo of a student's handwritten notebook page.
Return ONLY JSON, no commentary:
{"kind":"equations"|"flowchart"|"circuit"|"mixed"|"unknown",
 "equations":[{"latex": string, "unsure": boolean}],
 "nodes":[{"id": string, "label": string, "shape": "start"|"process"|"decision"|"io"|"component"}],
 "edges":[{"from": string, "to": string, "label": string}],
 "text": string}
Rules: one equation per entry, in valid LaTeX without $ signs. Transcribe EXACTLY what is written, even if it looks wrong. If a symbol is unclear, give your best reading and set "unsure": true. Never solve or correct anything. For a flowchart give boxes as nodes and arrows as edges. For a circuit give each component as a node (label like "R1 10k") and each wire between components as an edge. "text" holds any plain words.`;

export const cleanLatex = (s: string) => s.replace(/^\s*```(?:latex|tex)?|```\s*$/g, '').replace(/^\s*(\$\$|\\\[|\\\(|\$)|(\$\$|\\\]|\\\)|\$)\s*$/g, '').trim();
export function checkLatex(tex: string): { valid: boolean; error?: string } { try { katex.renderToString(tex, { throwOnError: true, strict: 'ignore' }); return { valid: true }; } catch (e) { return { valid: false, error: String((e as Error).message).replace(/^KaTeX parse error:\s*/, '').slice(0, 140) }; } }

export function parseScan(raw: string): Scan {
  const w: string[] = []; let j: Record<string, unknown> = {};
  const m = raw.match(/\{[\s\S]*\}/); try { j = JSON.parse(m ? m[0] : raw); } catch { w.push('The model reply was not readable as data.'); }
  const eqs = (Array.isArray(j.equations) ? j.equations : []).map(e => (typeof e === 'string' ? { latex: e, unsure: false } : e as { latex?: string; unsure?: boolean })).filter(e => e && typeof e.latex === 'string' && e.latex.trim()).slice(0, 40)
    .map(e => { const latex = cleanLatex(e.latex!); const c = checkLatex(latex); return { latex, valid: c.valid, error: c.error, unsure: !!e.unsure }; });
  const nodes: DNode[] = (Array.isArray(j.nodes) ? j.nodes : []).filter((n): n is DNode => !!n && typeof (n as DNode).id !== 'undefined' && typeof (n as DNode).label === 'string').slice(0, 60).map(n => ({ id: String(n.id), label: n.label.slice(0, 60), shape: n.shape }));
  const ids = new Set(nodes.map(n => n.id)); const rawEdges = (Array.isArray(j.edges) ? j.edges : []) as DEdge[];
  const edges = rawEdges.filter(e => e && ids.has(String(e.from)) && ids.has(String(e.to))).slice(0, 120).map(e => ({ from: String(e.from), to: String(e.to), label: e.label ? String(e.label).slice(0, 30) : undefined }));
  if (rawEdges.length > edges.length) w.push(`${rawEdges.length - edges.length} arrow(s) pointed at boxes that were not found and were dropped.`);
  if (eqs.some(e => !e.valid)) w.push('Some equations are not valid LaTeX yet: fix them in the box below the preview.'); if (eqs.some(e => e.unsure)) w.push('Some symbols were hard to read: check the highlighted lines against your notebook.');
  const kindRaw = String(j.kind ?? ''); const kind = (['equations', 'flowchart', 'circuit', 'mixed', 'unknown'] as const).find(k => k === kindRaw) ?? (nodes.length && eqs.length ? 'mixed' : nodes.length ? 'flowchart' : eqs.length ? 'equations' : 'unknown');
  if (!eqs.length && !nodes.length) w.push('Nothing readable was found. Try a brighter, flatter photo with dark ink.');
  return { kind, equations: eqs, nodes, edges, text: typeof j.text === 'string' ? j.text.slice(0, 2000) : '', warnings: w };
}
export const scanImage = async (vision: Vision, dataUrl: string): Promise<Scan> => parseScan(await vision(dataUrl, SCAN_PROMPT));

/* ---- layered layout for flowcharts / circuits (longest-path layering, cycles broken) ---- */
export interface Placed extends DNode { x: number; y: number; w: number; h: number }
export function layoutGraph(nodes: DNode[], edges: DEdge[], opt: { w?: number; h?: number; gx?: number; gy?: number } = {}): { nodes: Placed[]; width: number; height: number } {
  const w = opt.w ?? 130, h = opt.h ?? 44, gx = opt.gx ?? 40, gy = opt.gy ?? 60; const depth = new Map<string, number>(); const out = new Map<string, string[]>(); const indeg = new Map<string, number>();
  for (const n of nodes) { out.set(n.id, []); indeg.set(n.id, 0); } for (const e of edges) { out.get(e.from)!.push(e.to); indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1); }
  const roots = nodes.filter(n => !indeg.get(n.id)).map(n => n.id); if (!roots.length && nodes.length) roots.push(nodes[0].id);
  const visiting = new Set<string>(); const dfs = (id: string, d: number) => { if (visiting.has(id)) return; if ((depth.get(id) ?? -1) >= d) return; depth.set(id, d); visiting.add(id); for (const t of out.get(id) ?? []) dfs(t, d + 1); visiting.delete(id); };
  for (const r of roots) dfs(r, 0); for (const n of nodes) if (!depth.has(n.id)) dfs(n.id, 0);
  const layers = new Map<number, DNode[]>(); for (const n of nodes) { const d = depth.get(n.id) ?? 0; (layers.get(d) ?? layers.set(d, []).get(d)!).push(n); }
  const maxCols = Math.max(1, ...[...layers.values()].map(l => l.length)); const width = maxCols * (w + gx) + gx; const placed: Placed[] = [];
  for (const [d, l] of layers) l.forEach((n, i) => placed.push({ ...n, w, h, x: gx + (maxCols - l.length) * (w + gx) / 2 + i * (w + gx), y: gy / 2 + d * (h + gy) }));
  return { nodes: placed, width, height: (layers.size) * (h + gy) + gy / 2 };
}
export const toLatexDocument = (s: Scan) => s.equations.filter(e => e.valid).map(e => `\\[ ${e.latex} \\]`).join('\n');
export const toMarkdown = (s: Scan) => `${s.equations.filter(e => e.valid).map(e => `$$${e.latex}$$`).join('\n\n')}${s.text ? `\n\n${s.text}` : ''}${s.nodes.length ? `\n\n\`\`\`mermaid\nflowchart TD\n${s.nodes.map(n => `  ${n.id.replace(/\W/g, '_')}["${n.label.replace(/"/g, "'")}"]`).join('\n')}\n${s.edges.map(e => `  ${e.from.replace(/\W/g, '_')} -->${e.label ? `|${e.label}|` : ''} ${e.to.replace(/\W/g, '_')}`).join('\n')}\n\`\`\`` : ''}`;
