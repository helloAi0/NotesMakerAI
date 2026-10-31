/**
 * FRIDAY's brain, pure and offline (no DOM, no registry import, so it can be unit-tested with tsx).
 * Retrieval = BM25 over glossary + app guide + simulations + the user's notes + PDF pages.
 * Answers are composed from the best passages and always carry their sources; if nothing relevant exists it says so.
 */
import { Bm25, summarize, tokens } from './textTools';
import type { Doc } from './textTools';
import { GLOSSARY } from '../data/glossary';
import { APP_GUIDE } from '../data/appGuide';

export type Kind = 'glossary' | 'guide' | 'sim' | 'note' | 'pdf';
export interface Chip { label: string; cmd: string }
export interface KDoc extends Doc { kind: Kind; title: string; cmd?: string; where?: string }
export interface SimLike { id: string; title: string; blurb: string; hint: string; tags?: string[]; covers?: string[]; topic?: string; subtopic?: string; category?: string; learningObjectives?: string[]; assumptions?: string[]; educationLevels?: string[]; subject?: string }
export interface Answer { text: string; chips: Chip[]; sources: { kind: Kind; title: string; where?: string }[]; found: boolean; kind: 'answer' | 'calc' | 'chat' | 'none'; context: string }

export function baseDocs(sims: SimLike[]): KDoc[] {
  const out: KDoc[] = [];
  GLOSSARY.forEach(([term, subject, def, sim], i) => out.push({ id: `g${i}`, kind: 'glossary', title: term, text: `${subject}. ${def}`, cmd: sim ? `open ${sim}` : undefined, where: subject }));
  APP_GUIDE.forEach(([title, body, chips], i) => out.push({ id: `a${i}`, kind: 'guide', title, text: body, cmd: chips?.[0]?.[1], where: 'App guide' }));
  for (const s of sims) out.push({ id: `s${s.id}`, kind: 'sim', title: s.title, text: [s.blurb, s.hint, s.topic, s.subtopic, s.category, ...(s.tags ?? []), ...(s.covers ?? []), ...(s.learningObjectives ?? []), ...(s.assumptions ?? [])].filter(Boolean).join('. '), cmd: `open ${s.title}`, where: 'Simulation' });
  return out;
}

/* ---------- safe calculator ---------- */
const FN: Record<string, (x: number) => number> = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, ln: Math.log, log: Math.log10, exp: Math.exp, abs: Math.abs };
export function calc(src: string): number | null {
  const s = src.toLowerCase().replace(/×|\bx\b(?=\s*\d)/g, '*').replace(/÷/g, '/').replace(/\^/g, '**').replace(/\bpi\b|π/g, String(Math.PI)).replace(/\btimes\b/g, '*').replace(/\bplus\b/g, '+').replace(/\bminus\b/g, '-').replace(/\bdivided by\b|\bover\b/g, '/').replace(/\bsquared\b/g, '**2').replace(/\bcubed\b/g, '**3').replace(/(\d),(?=\d{3}\b)/g, '$1');
  const t = s.match(/\d+\.?\d*(?:e[+-]?\d+)?|\*\*|[a-z]+|[-+*/%()]/g); if (!t || t.join('') !== s.replace(/\s+/g, '')) return null;
  let i = 0; const bad = () => { throw new Error('x'); };
  const prim = (): number => {
    const x = t[i++]; if (x === undefined) return bad() as never;
    if (x === '(') { const v = add(); if (t[i++] !== ')') bad(); return v; }
    if (x === '-') return -pow(); if (x === '+') return pow();
    if (/^\d/.test(x)) return parseFloat(x);
    if (x === 'e') return Math.E;
    if (FN[x]) { if (t[i++] !== '(') bad(); const v = add(); if (t[i++] !== ')') bad(); return FN[x](v); }
    return bad() as never;
  };
  const pow = (): number => { const b = prim(); if (t[i] === '**') { i++; return Math.pow(b, pow()); } return b; };
  const mul = (): number => { let v = pow(); while (t[i] === '*' || t[i] === '/' || t[i] === '%') { const o = t[i++]; const r = pow(); v = o === '*' ? v * r : o === '/' ? v / r : v % r; } return v; };
  const add = (): number => { let v = mul(); while (t[i] === '+' || t[i] === '-') { const o = t[i++]; const r = mul(); v = o === '+' ? v + r : v - r; } return v; };
  try { const v = add(); if (i !== t.length || !Number.isFinite(v)) return null; return v; } catch { return null; }
}
const fmtNum = (v: number) => (Number.isInteger(v) && Math.abs(v) < 1e15 ? String(v) : Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-4 && v !== 0) ? v.toExponential(6).replace(/\.?0+e/, 'e') : String(+v.toPrecision(10)));

/* ---------- small talk ---------- */
function smallTalk(q: string): string | null {
  const n = q.toLowerCase().replace(/[^a-z\s']/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(hi|hello|hey|yo|good (morning|afternoon|evening)|namaste)( friday)?$/.test(n)) return 'Hello! I am FRIDAY. Ask me any study question, tell me to open a simulation, write a note, organise your PDFs or plan your week. Say “help” for examples.';
  if (/^(thanks|thank you|thx|ty|cheers)( friday)?$/.test(n)) return 'You are welcome! Anything else?';
  if (/\b(who are you|what are you|your name|what is friday|what s friday)\b/.test(n)) return 'I am FRIDAY, the assistant built into Notes Maker AI. I can operate the app for you (open simulations, set parameters, write notes, manage PDFs and your study plan) and answer study questions from my built-in STEM knowledge, your notes and your PDFs. With an AI key in Settings I can also answer anything with a full language model.';
  if (/\b(what can you do|what do you do)\b/.test(n)) return 'I can: (1) run the app by voice or text, (2) explain concepts, formulas and simulations, (3) search your notes and PDFs, (4) summarise a PDF or your notebook page, (5) write notes on a topic, (6) manage folders and your study plan. Say “help” for examples.';
  return null;
}

/* ---------- answering ---------- */
const MIN_SCORE = 2.2;
const trim = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);
export interface Index { all: Bm25<KDoc> }
export const buildIndex = (base: KDoc[], dyn: KDoc[]): Index => ({ all: new Bm25([...base, ...dyn], 4) });
const mineBoost = (h: { doc: KDoc; score: number }) => ({ doc: h.doc, score: h.score * (h.doc.kind === 'pdf' || h.doc.kind === 'note' ? 1.25 : 1) });

export function retrieve(ix: Index, q: string, k = 6): { doc: KDoc; score: number }[] {
  const all = ix.all.search(q, k * 3).map(mineBoost).sort((a, b) => b.score - a.score).slice(0, k * 2);
  // many words ⇒ a larger score is natural; require the best hit to clear a bar that grows mildly with query length
  const qn = new Set(tokens(q)).size; const bar = MIN_SCORE + Math.max(0, qn - 3) * 0.35;
  return all.length && all[0].score >= bar ? all.filter(h => h.score >= all[0].score * 0.3).slice(0, k) : [];
}

export function contextFor(hits: { doc: KDoc }[], q: string, chars = 3500): string {
  let out = ''; for (const h of hits) { const body = h.doc.kind === 'pdf' || h.doc.kind === 'note' ? summarize(h.doc.text, 4, q).join(' ') || h.doc.text.slice(0, 700) : h.doc.text; const part = `[${h.doc.kind}: ${h.doc.title}${h.doc.where ? ' — ' + h.doc.where : ''}]\n${trim(body, 900)}\n\n`; if (out.length + part.length > chars) break; out += part; }
  return out;
}

export function ask(ix: Index, q: string): Answer {
  const none = (text: string, kind: Answer['kind'] = 'none'): Answer => ({ text, chips: [{ label: 'Help', cmd: 'help' }], sources: [], found: false, kind, context: '' });
  const talk = smallTalk(q); if (talk) return { ...none(talk, 'chat'), found: true };
  const expr = q.replace(/^\s*(?:what\s+is|what's|whats|calculate|compute|evaluate|solve|find|how much is)\s*/i, '').replace(/[=?]+\s*$/, '').trim();
  if (/\d/.test(expr) && /[-+*/^×÷%]|\b(plus|minus|times|divided|over|squared|cubed|sqrt|sin|cos|tan|ln|log|exp)\b/i.test(expr)) {
    const v = calc(expr); if (v != null) return { text: `${expr} = ${fmtNum(v)}`, chips: [], sources: [], found: true, kind: 'calc', context: '' };
  }
  const pc = expr.match(/^(-?\d+(?:\.\d+)?)\s*(?:%|percent|per cent)\s+of\s+(.+)$/i); if (pc) { const v = calc(`(${pc[1]}/100)*(${pc[2].replace(/,/g, '')})`); if (v != null) return { text: `${pc[1]}% of ${pc[2]} = ${fmtNum(v)}`, chips: [], sources: [], found: true, kind: 'calc', context: '' }; }
  let hits = retrieve(ix, q); if (hits.length) { // relevance gate: the best document must actually contain the meaningful words of the question
    const STOP = new Set(['what', 'whats', 'which', 'when', 'where', 'does', 'with', 'about', 'explain', 'tell', 'show', 'give', 'please', 'this', 'that', 'there', 'their', 'have', 'from', 'into', 'how', 'why', 'the', 'and', 'are', 'for', 'can', 'you', 'your', 'mean', 'means', 'work', 'works', 'define', 'describe', 'step', 'steps', 'simple', 'simply', 'example', 'examples', 'briefly', 'detail', 'detailed', 'easy', 'easily', 'short']);
    const qt = (q.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter(w => !STOP.has(w)); const hay = (hits[0].doc.title + ' ' + hits[0].doc.text).toLowerCase();
    if (qt.length && qt.filter(w => hay.includes(w.slice(0, Math.max(4, w.length - 2)))).length / qt.length < 0.4) hits = [];
  }
  if (hits.length && /^\s*(?:integrate|differentiate|solve|simplify|factori[sz]e|expand|prove|find the (?:integral|derivative|roots?))\b/i.test(q) && !['glossary', 'pdf', 'note'].includes(hits[0].doc.kind)) hits = []; // symbolic work needs a model; do not hand back an unrelated simulation
  if (!hits.length) return none('I could not find that in my built-in knowledge, your notes or your PDFs. Try different words, add the relevant PDF to the library, or add an AI key in Settings so I can answer any question with a full language model.');
  const top = hits[0].doc; const lines: string[] = []; const chips: Chip[] = []; const sources: Answer['sources'] = [];
  const src = (d: KDoc) => { if (!sources.some(s => s.title === d.title && s.kind === d.kind)) sources.push({ kind: d.kind, title: d.title, where: d.where }); };
  const chip = (d: KDoc) => { if (d.cmd && chips.length < 4 && !chips.some(c => c.cmd === d.cmd)) chips.push({ label: d.kind === 'sim' ? `Open “${trim(d.title, 28)}”` : d.kind === 'glossary' ? `Try: ${trim(d.cmd.replace(/^open /, ''), 24)}` : d.title.length > 26 ? 'Do it' : d.title, cmd: d.cmd }); };
  if (top.kind === 'glossary') { lines.push(`${top.title} (${top.where}): ${top.text.replace(/^[^.]*\.\s*/, '')}`); src(top); chip(top); }
  else if (top.kind === 'guide') { lines.push(`${top.title}: ${top.text}`); src(top); chip(top); for (const [t, , c] of APP_GUIDE) if (t === top.title) c?.slice(0, 3).forEach(([label, cmd]) => { if (!chips.some(x => x.cmd === cmd)) chips.push({ label, cmd }); }); }
  else if (top.kind === 'sim') { lines.push(`The simulation “${top.title}” covers this: ${top.text.split('. ').slice(0, 2).join('. ')}.`); src(top); chip(top); }
  else { const ss = summarize(top.text, 3, q); lines.push(`From ${top.kind === 'pdf' ? 'your PDF' : 'your notes'} “${top.title}”${top.where ? ` (${top.where})` : ''}:\n${(ss.length ? ss : [top.text.slice(0, 400)]).map(s => '• ' + trim(s, 280)).join('\n')}`); src(top); chip(top); }
  const more = hits.slice(1).filter(h => h.doc.title !== top.title);
  const gl = more.filter(h => h.doc.kind === 'glossary' && h.score >= hits[0].score * 0.7).slice(0, 2); if (gl.length && top.kind === 'glossary') { lines.push('Also related: ' + gl.map(h => h.doc.title).join(', ') + '.'); gl.forEach(h => src(h.doc)); }
  for (const h of more) { if (h.doc.kind === 'sim') { chip(h.doc); src(h.doc); } }
  const mine = more.filter(h => (h.doc.kind === 'pdf' || h.doc.kind === 'note') && top.kind !== h.doc.kind).slice(0, 2);
  for (const h of mine) { const s = summarize(h.doc.text, 1, q)[0]; if (s) { lines.push(`In your ${h.doc.kind === 'pdf' ? 'PDF' : 'notes'} “${h.doc.title}”${h.doc.where ? ` (${h.doc.where})` : ''}: ${trim(s, 240)}`); src(h.doc); } }
  return { text: lines.join('\n\n'), chips, sources, found: true, kind: 'answer', context: contextFor(hits, q) };
}

/** Offline structured notes on a topic, built from glossary + simulations + the user's own material. */
export function composeNotes(ix: Index, topic: string, depth: 'brief' | 'standard' | 'detailed' = 'standard'): { text: string; found: boolean } {
  const hits = retrieve(ix, topic, 10); const gl = hits.filter(h => h.doc.kind === 'glossary'); const sims = hits.filter(h => h.doc.kind === 'sim'); const mine = hits.filter(h => h.doc.kind === 'pdf' || h.doc.kind === 'note');
  if (!gl.length && !sims.length && !mine.length) return { text: '', found: false };
  const nG = depth === 'brief' ? 1 : depth === 'standard' ? 2 : 4; const out: string[] = [`# ${topic.replace(/\b\w/g, c => c.toUpperCase())}`, ''];
  gl.slice(0, nG).forEach((h, i) => { const def = h.doc.text.replace(/^[^.]*\.\s*/, ''); out.push(i === 0 ? '## Definition' : `## ${h.doc.title}`, def, ''); if (i === 0 && depth !== 'brief') { const pts = def.split(/(?<=[.;])\s+/).slice(1).filter(s => s.length > 20).slice(0, 3); if (pts.length) { out.push('## Key points', ...pts.map(p => '• ' + p), ''); } } });
  if (depth !== 'brief' && gl.length > nG) out.push('## Related ideas', ...gl.slice(nG, nG + 4).map(h => `• ${h.doc.title}: ${trim(h.doc.text.replace(/^[^.]*\.\s*/, ''), 160)}`), '');
  if (sims.length) out.push('## See it in action (Visuals Studio)', ...sims.slice(0, depth === 'brief' ? 1 : 3).map(h => `• ${h.doc.title}: ${trim(h.doc.text.split('. ')[0], 160)}`), '');
  if (mine.length && depth !== 'brief') out.push('## From your own material', ...mine.slice(0, 3).flatMap(h => summarize(h.doc.text, 2, topic).map(s => `• ${trim(s, 220)} (${h.doc.title}${h.doc.where ? ', ' + h.doc.where : ''})`)), '');
  out.push('## Self-check', `• Explain “${topic}” in two sentences without looking.`, `• Write one worked example and one common mistake.`);
  return { text: out.join('\n').trim(), found: true };
}

export function searchAllDocs(ix: Index, q: string, k = 12): { doc: KDoc; score: number }[] {
  return ix.all.search(q, k * 2).map(mineBoost).sort((a, b) => b.score - a.score).slice(0, k);
}
