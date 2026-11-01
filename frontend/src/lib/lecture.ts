/**
 * Lecture-to-Notes engine (Phase 9). Pure functions, no network:
 *  - parseTranscript: YouTube "Show transcript" copy-paste, SRT, WebVTT, [mm:ss] lines or plain text
 *  - buildNotes: topic segmentation (lexical cohesion), titles, summaries, bullets, formulas, definitions, key terms
 * An optional AI pass (aiRefine) rewrites the sections with the user's own key.
 */
import { generate, geminiModels, parseJsonLoose, pMap, concurrencyFor } from './aiClient';
import type { AiConfig } from './aiClient';

export interface Cue { t: number; text: string }
export interface Formula { text: string; spoken?: boolean }
export interface Definition { term: string; meaning: string }
export interface Section {
  id: number; start: number; end: number; title: string; summary: string; bullets: string[];
  formulas: Formula[]; definitions: Definition[]; text: string; cues: Cue[];
}
export interface LectureNotes {
  source?: string; title: string; videoId: string | null; timed: boolean; duration: number;
  overview: string[]; keyTerms: string[]; sections: Section[]; cues: Cue[];
}

/* ---------------- helpers ---------------- */
export function youtubeId(input: string): string | null {
  const s = input.trim(); if (!s) return null;
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|shorts\/|live\/|watch\?(?:[^#]*&)?v=))([\w-]{11})/);
  return m ? m[1] : null;
}
export function fmtTime(sec: number): string {
  sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
const toSec = (stamp: string): number => { const p = stamp.split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
const clean = (t: string) => t.replace(/<[^>]+>/g, '').replace(/\[(?:music|applause|laughter|silence)\]/gi, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

/* ---------------- transcript parsing ---------------- */
const ARROW = /^(\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d+)?\s*-->\s*/;
const STAMP = /^[[(]?((?:\d{1,2}:)?\d{1,2}:\d{2})(?:[.,]\d+)?[\])]?\s*[-–—:]?\s*(.*)$/;

export function parseTranscript(raw: string): { cues: Cue[]; timed: boolean } {
  const lines = raw.replace(/\r/g, '').replace(/^WEBVTT.*$/m, '').split('\n').map(l => l.trim());
  const cues: Cue[] = []; let cur: Cue | null = null; let sawStamp = false;
  const flush = () => { if (cur) { cur.text = clean(cur.text); if (cur.text) cues.push(cur); } cur = null; };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]; if (!l) { if (cur && ARROWSEEN.has(cur)) flush(); continue; }
    if (/^\d+$/.test(l) && lines[i + 1] && ARROW.test(lines[i + 1])) continue; // SRT index
    if (/^(?:NOTE|STYLE|Kind:|Language:)/.test(l) && !cur) continue;
    if (ARROW.test(l)) { flush(); const m = l.match(/^((?:\d{1,2}:)?\d{1,2}:\d{2})/)!; cur = { t: toSec(m[1]), text: '' }; ARROWSEEN.add(cur); sawStamp = true; continue; }
    const m = l.match(STAMP);
    if (m && !(cur && ARROWSEEN.has(cur))) { flush(); sawStamp = true; cur = { t: toSec(m[1]), text: m[2] }; continue; }
    if (cur) cur.text += ' ' + l; else if (!sawStamp) { cur = { t: 0, text: l }; }
  }
  flush();
  if (sawStamp && cues.length) {
    cues.sort((a, b) => a.t - b.t);
    return { cues, timed: true };
  }
  // plain text: sentences, with times estimated at 150 words per minute
  const sents = splitSentences(clean(raw.replace(/\n+/g, ' '))); let words = 0; const out: Cue[] = [];
  for (const s of sents) { out.push({ t: Math.round(words / 2.5), text: s }); words += s.split(/\s+/).length; }
  return { cues: out, timed: false };
}
const ARROWSEEN = new WeakSet<Cue>();

export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?।]+(?:[.!?।]+(?=\s|$)|$)/g) || [text]).map(s => s.trim()).filter(s => s.length > 1);
}

/* ---------------- language helpers ---------------- */
const STOP = new Set(('a an the and or but if then so of to in on at by for with from as is are was were be been being am do does did done have has had having it its this that these those there here we you i he she they them our your their my me us not no yes can could will would shall should may might must just very really also too than into onto over under about above below up down out off again once only own same such some any each few more most other both all what which who whom whose when where why how let lets us okay ok now well like going gonna want need get got one two three first next then thing things know see look say said says right actually basically today welcome back everyone guys hello hi thanks thank please yeah because while during before after between through using use used der die das den dem des ein eine einer einen einem und oder aber ist sind war waren nicht kein keine zu von mit auf für fur ich du er sie es wir ihr sich auch an im als wie wenn dann so noch nur schon bei nach aus über uber um was wer wo hier dass dies diese dieser auch sehr mal ja nein bitte danke hallo है हैं और का की के में को से पर यह वह एक हम आप तो भी ही कि जो था थी थे हो').split(/\s+/));
const FILLER = /\b(subscribe|like and|hit the bell|welcome back|welcome to|in this video|see you (?:in|next)|thanks for watching|sponsor|patreon|comment below|click the)\b/i;
const stem = (w: string) => w.replace(/(?:ing|edly|ed|es|s)$/, m => (w.length - m.length >= 4 ? '' : m));
export function tokens(text: string): string[] {
  return (text.toLowerCase().normalize('NFKD').match(/[\p{L}\p{N}]+/gu) || []).filter(w => w.length > 2 && !STOP.has(w)).map(stem);
}
const tf = (toks: string[]) => { const m = new Map<string, number>(); for (const t of toks) m.set(t, (m.get(t) || 0) + 1); return m; };
const cosine = (a: Map<string, number>, b: Map<string, number>) => { let d = 0, na = 0, nb = 0; for (const [k, v] of a) { na += v * v; const w = b.get(k); if (w) d += v * w; } for (const v of b.values()) nb += v * v; return na && nb ? d / Math.sqrt(na * nb) : 0; };

/* ---------------- segmentation ---------------- */
export function segment(cues: Cue[]): number[] {
  // returns the index of the first cue of every section
  const n = cues.length; if (n < 8) return [0];
  const dur = Math.max(1, cues[n - 1].t - cues[0].t);
  const words = cues.reduce((a, c) => a + c.text.split(/\s+/).length, 0); if (words < 220) return [0];
  const want = Math.max(2, Math.min(12, Math.round(dur / 270))) || 2;
  const k = Math.max(3, Math.min(12, Math.round(n / 14)));
  const toks = cues.map(c => tokens(c.text));
  const sim: number[] = new Array(n).fill(1);
  for (let i = 2; i < n - 1; i++) {
    const L = tf(toks.slice(Math.max(0, i - k), i).flat()), R = tf(toks.slice(i, Math.min(n, i + k)).flat());
    sim[i] = cosine(L, R);
  }
  // depth score: how far the similarity at i sits below its neighbours' peaks
  const depth = sim.map((s, i) => { let l = s, r = s; for (let j = i; j >= 0 && sim[j] >= l; j--) l = sim[j]; for (let j = i; j < n && sim[j] >= r; j++) r = sim[j]; return (l - s) + (r - s); });
  const minGap = Math.max(4, Math.floor(n / (want * 2.2))), minSecs = Math.min(90, dur / (want * 2));
  const order = depth.map((d, i) => [d, i] as const).filter(([, i]) => i >= 3 && i <= n - 3).sort((a, b) => b[0] - a[0]);
  const picked: number[] = [0];
  for (const [d, i] of order) {
    if (picked.length >= want) break; if (d <= 0.02) break;
    if (picked.every(p => Math.abs(p - i) >= minGap && Math.abs(cues[p].t - cues[i].t) >= minSecs)) picked.push(i);
  }
  return picked.sort((a, b) => a - b);
}

/* ---------------- formulas and definitions ---------------- */
const SPOKEN_OPS: [RegExp, string][] = [[/\bdivided by\b/gi, '/'], [/\bover\b/gi, '/'], [/\bmultiplied by\b/gi, '×'], [/\btimes\b/gi, '×'], [/\bplus\b/gi, '+'], [/\bminus\b/gi, '−'], [/\bsquared\b/gi, '²'], [/\bcubed\b/gi, '³'], [/\bto the power (?:of )?(\w+)\b/gi, '^$1'], [/\bsquare root of\b/gi, '√'], [/\bequals\b|\bis equal to\b/gi, '=']];
const GREEK: [RegExp, string][] = [[/\bdelta\b\s*/gi, 'Δ'], [/\btheta\b/gi, 'θ'], [/\bomega\b/gi, 'ω'], [/\blambda\b/gi, 'λ'], [/\bmu\b/gi, 'μ'], [/\bsigma\b/gi, 'σ'], [/\bpi\b/gi, 'π'], [/\balpha\b/gi, 'α'], [/\bbeta\b/gi, 'β'], [/\bgamma\b/gi, 'γ'], [/\brho\b/gi, 'ρ'], [/\bepsilon\b/gi, 'ε']];
const MATHTOK = /^(?:[A-Za-zΔθωλμσπαβγρε]{1,3}\d?|\d+(?:\.\d+)?|[=+\-−×/²³√^()]|\^\w+)$/;
function spokenToSymbols(s: string): string { let t = s; for (const [re, r] of SPOKEN_OPS) t = t.replace(re, ` ${r} `); for (const [re, r] of GREEK) t = t.replace(re, r); return t.replace(/\s+/g, ' ').replace(/\s*([²³])/g, '$1').replace(/√\s+/g, '√').trim(); }

export function findFormulas(text: string): Formula[] {
  const out: Formula[] = []; const seen = new Set<string>(); const add = (f: string, spoken = false) => { const k = f.replace(/\s+/g, '').toLowerCase(); if (!seen.has(k) && f.length <= 60) { seen.add(k); out.push({ text: f, spoken }); } };
  // written: ΔU = Q - W, H = U + PV, F = ma, E = mc^2
  for (const m of text.matchAll(/(?:^|[\s(:,;])([A-Za-zΔ∆θωλμσπ][A-Za-z0-9_]{0,5}(?:\([A-Za-z0-9,]+\))?\s*=\s*[-−+]?[A-Za-z0-9Δ∆θωλμσπ√(][A-Za-z0-9Δ∆θωλμσπ_^²³√()*/×·+\-−\s.]{0,36}?)(?=[.,;:!?]\s|[.,;:!?]$|$|\s(?:and|where|which|so|then|is|but|here)\b)/g)) {
    const f = m[1].trim().replace(/∆/g, 'Δ'); if (/\d{2,}\s*$/.test(f) && !/[A-Za-z]/.test(f.split('=')[1] || '')) continue; if (f.split(/\s+/).length <= 9) add(f);
  }
  // spoken: "delta U equals Q minus W", "Cp minus Cv equals R"
  const side = (x: string) => spokenToSymbols(x).split(/\s+/);
  const mathy = (t: string[]) => t.length >= 1 && t.length <= 11 && t.every(k => MATHTOK.test(k)) && t.some(k => /[A-Za-z\d]/.test(k));
  for (const m of text.matchAll(/\b((?:delta\s+)?[A-Za-z]{1,2}(?:\s+(?:minus|plus|times|over|divided by)\s+(?:delta\s+)?[A-Za-z]{1,2}){0,2})\s+(?:equals|is equal to)\s+([^.,;?!]{1,70})/gi)) {
    const l = side(m[1]), r = side(m[2]);
    if (mathy(r) && /[+−×/²³√^]|^[A-Za-z\d]{1,3}$/.test(r.join(' '))) add(`${l.join(' ').replace(/Δ\s+/g, 'Δ')} = ${r.join(' ')}`.replace(/\s+/g, ' '), true);
  }
  // spoken definition of a symbol: "the letter H for enthalpy, defined as U plus PV"
  for (const m of text.matchAll(/\b(?:letter|symbol)\s+([A-Za-z]{1,2})\b[^.!?]{0,40}?,?\s+defined as\s+([^.,;?!]{1,40})|\b([A-Z])\s+(?:is\s+)?defined as\s+([^.,;?!]{1,40})/g)) { const r = side(m[2] ?? m[4]); if (mathy(r) && r.some(k => /^[+−×/^]$/.test(k))) add(`${m[1] ?? m[3]} = ${r.join(' ')}`, true); }
  return out.slice(0, 6);
}

export function findDefinitions(sentences: string[]): Definition[] {
  const out: Definition[] = []; const seen = new Set<string>();
  const add = (term: string, meaning: string) => { term = term.replace(/^(?:the|a|an)\s+/i, '').trim(); const k = term.toLowerCase(); if (term.length < 3 || term.length > 40 || seen.has(k) || STOP.has(k) || term.split(/\s+/).length > 4) return; seen.add(k); out.push({ term: term.charAt(0).toUpperCase() + term.slice(1), meaning: meaning.trim().replace(/^[,;:\s]+/, '') }); };
  for (const s of sentences) {
    let m = s.match(/^(?:so,?\s+|now,?\s+|and\s+)?(?:the\s+)?([\w'’ -]{3,40}?)\s+(?:is|are)\s+(?:formally\s+)?(?:defined|described) as\s+(.{8,170})/i); if (m) { add(m[1], m[2].replace(/[.!?]+$/, '')); continue; }
    m = s.match(/\b(?:we|let's|let us|you)\s+(?:can\s+)?(?:define|call|name)\s+(?:this\s+|the\s+|it\s+)?([\w'’ -]{3,40}?)\s+(?:as|to be)\s+(.{8,170})/i); if (m) { add(m[1], m[2].replace(/[.!?]+$/, '')); continue; }
    m = s.match(/\b([A-Z][\w'’-]*(?:\s+[\w'’-]+){0,2})\s+(?:means|refers to|denotes|stands for)\s+(.{6,170})/); if (m) { add(m[1], m[2].replace(/[.!?]+$/, '')); continue; }
    m = s.match(/\b(?:called|known as|named|termed)\s+(?:the\s+)?([A-Za-z][\w'’-]*(?:\s+[A-Za-z][\w'’-]*){0,2})\b[^.!?]*/i); if (m && s.length < 260) { const term = m[1].replace(/\s+(?:and|which|that|we|is|are|we'll|it)\b.*$/i, ''); if (term && !/^(?:the|a|an|this|that|it|so|something)$/i.test(term)) add(term, s.replace(/[.!?]+$/, '')); }
  }
  return out.slice(0, 5);
}

/* ---------------- notes ---------------- */
function scoreSentences(sents: string[], df: Map<string, number>, nDocs: number): number[] {
  return sents.map((s, i) => {
    const tk = tokens(s); if (tk.length < 4) return 0; if (FILLER.test(s)) return -1;
    let sc = 0; for (const t of tk) sc += Math.log(1 + nDocs / (1 + (df.get(t) || 0)));
    const lenPenalty = tk.length > 38 ? 0.6 : 1; return (sc / Math.sqrt(tk.length)) * lenPenalty * (i === 0 ? 1.15 : 1) * (/[=]|\b(?:defined|law|rule|theorem|principle|equation|formula|important|key|remember|note that)\b/i.test(s) ? 1.25 : 1);
  });
}
const trim = (s: string, n = 190) => { s = s.replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; const cut = s.slice(0, n); return cut.slice(0, Math.max(cut.lastIndexOf(' '), 60)).replace(/[,;:\s]+$/, '') + '…'; };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function buildNotes(raw: string, urlOrId = '', title = ''): LectureNotes {
  const { cues, timed } = parseTranscript(raw); const videoId = youtubeId(urlOrId);
  if (!cues.length) return { title: title || 'Lecture', videoId, timed, duration: 0, overview: [], keyTerms: [], sections: [], cues };
  const starts = segment(cues); const dur = Math.max(cues[cues.length - 1].t + 5, 1);
  const groups = starts.map((s, i) => cues.slice(s, starts[i + 1] ?? cues.length));
  const sentsPer = groups.map(g => g.flatMap(c => splitSentences(c.text)));
  // document frequency across sections (a section is a "document")
  const df = new Map<string, number>(); for (const ss of sentsPer) for (const t of new Set(tokens(ss.join(' ')))) df.set(t, (df.get(t) || 0) + 1);
  const nDocs = groups.length;
  const sections: Section[] = groups.map((g, i) => {
    const sents = sentsPer[i], text = g.map(c => c.text).join(' '), sc = scoreSentences(sents, df, nDocs);
    const ranked = sents.map((s, j) => [sc[j], j] as const).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]);
    const sumIdx = ranked.slice(0, text.length > 900 ? 2 : 1).map(([, j]) => j).sort((a, b) => a - b);
    const bulIdx = ranked.filter(([, j]) => !sumIdx.includes(j)).slice(0, Math.min(5, Math.max(2, Math.round(sents.length / 5)))).map(([, j]) => j).sort((a, b) => a - b);
    const formulas = findFormulas(text), definitions = findDefinitions(sents);
    const tt = tf(tokens(text)); const kw = [...tt.entries()].map(([w, c]) => [c * Math.log(1 + nDocs / (1 + (df.get(w) || 0))), w] as const).sort((a, b) => b[0] - a[0]);
    const surface = (w: string) => { const m = text.match(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*`, 'i')); return m ? m[0] : w; };
    const defTitle = definitions[0]?.term;
    // key phrase: the most characteristic pair of neighbouring content words (e.g. "internal energy", "heat capacity")
    const words = (text.toLowerCase().match(/[\p{L}\p{N}']+|[.!?,;:]/gu) || []); const pairs = new Map<string, number>();
    for (let w = 0; w < words.length - 1; w++) { const a = words[w], b = words[w + 1]; if (a.length < 3 || b.length < 3 || STOP.has(a) || STOP.has(b) || /^[.!?,;:]$/.test(a + b)) continue; const k = `${a} ${b}`; pairs.set(k, (pairs.get(k) || 0) + 1); }
    const idf = (w: string) => Math.log(1 + nDocs / (1 + (df.get(stem(w)) || 0)));
    const phrase = [...pairs.entries()].filter(([, c]) => c >= 2).map(([k, c]) => [c * (idf(k.split(' ')[0]) + idf(k.split(' ')[1])), k] as const).sort((a, b) => b[0] - a[0])[0]?.[1];
    const k = kw.slice(0, 3).map(([, w]) => cap(surface(w))); const titled = (x: string) => x.split(' ').map(cap).join(' ');
    const t = defTitle && defTitle.split(/\s+/).length <= 3 ? (phrase && !phrase.includes(defTitle.toLowerCase()) && !defTitle.toLowerCase().includes(phrase.split(' ')[0]) ? `${defTitle} and ${titled(phrase)}` : defTitle) : phrase ? titled(phrase) : k.length >= 2 ? `${k[0]} and ${k[1]}` : (k[0] || `Part ${i + 1}`);
    const bullets = bulIdx.map(j => trim(sents[j])); for (const f of formulas.slice(0, 2)) { if (!bullets.some(b => b.includes(f.text))) bullets.push(`Formula: ${f.text}`); }
    return { id: i, start: g[0].t, end: groups[i + 1]?.[0].t ?? dur, title: t, summary: trim(sumIdx.map(j => sents[j]).join(' '), 260) || trim(text, 200), bullets, formulas, definitions, text, cues: g };
  });
  // disambiguate duplicate titles
  const seen = new Map<string, number>(); for (const s of sections) { const n = (seen.get(s.title) || 0) + 1; seen.set(s.title, n); if (n > 1) s.title += ` (${n})`; }
  const allText = cues.map(c => c.text).join(' '), all = tf(tokens(allText));
  const keyTerms = [...all.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => { const m = allText.match(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*`, 'i')); return cap(m ? m[0] : w); });
  const overview = sections.map(s => `${s.title}: ${trim(s.summary, 120)}`);
  const t = title || (sections[0] ? `Lecture: ${sections[0].title}${sections.length > 1 ? ` … ${sections[sections.length - 1].title}` : ''}` : 'Lecture');
  return { title: t, videoId, timed, duration: dur, overview, keyTerms, sections, cues };
}

/* ---------------- export ---------------- */
export function toMarkdown(n: LectureNotes): string {
  const L: string[] = [`# ${n.title}`, ''];
  if (n.videoId) L.push(`Video: https://youtu.be/${n.videoId}`, '');
  if (n.keyTerms.length) L.push(`**Key terms:** ${n.keyTerms.join(', ')}`, '');
  for (const s of n.sections) {
    const link = n.videoId && n.timed ? ` ([watch](https://youtu.be/${n.videoId}?t=${s.start}))` : '';
    L.push(`## [${fmtTime(s.start)}] ${s.title}${link}`, '', s.summary, '');
    for (const b of s.bullets) L.push(`- ${b}`); if (s.bullets.length) L.push('');
    if (s.formulas.length) { L.push('**Formulas**', ''); for (const f of s.formulas) L.push(`- \`${f.text}\``); L.push(''); }
    if (s.definitions.length) { L.push('**Definitions**', ''); for (const d of s.definitions) L.push(`- **${d.term}**: ${d.meaning}`); L.push(''); }
  }
  return L.join('\n').trimEnd() + '\n';
}
/** Plain text for the notebook's typed notes (no markdown symbols). */
export function toNotebookText(n: LectureNotes): string {
  const L: string[] = ['', n.title.toUpperCase()];
  if (n.keyTerms.length) L.push(`Key terms: ${n.keyTerms.join(', ')}`);
  for (const s of n.sections) {
    L.push('', `[${fmtTime(s.start)}] ${s.title}:`, s.summary); for (const b of s.bullets) L.push(`• ${b}`);
    for (const f of s.formulas) L.push(`Formula: ${f.text}`); for (const d of s.definitions) L.push(`Definition — ${d.term}: ${d.meaning}`);
  }
  return L.join('\n') + '\n';
}

/* ---------------- optional AI rewrite ---------------- */
export async function aiRefine(cfg: AiConfig, n: LectureNotes, onProgress?: (done: number, total: number) => void): Promise<LectureNotes> {
  let done = 0;
  const settled = await pMap(n.sections, concurrencyFor(cfg), async (s) => {
    const prompt = `You are writing study notes from one part of a lecture transcript (${fmtTime(s.start)}–${fmtTime(s.end)}).\nReturn ONLY JSON: {"title": string (max 6 words), "summary": string (1-2 sentences), "bullets": string[] (3-6 short key points), "formulas": string[] (equations exactly as stated, in plain text), "definitions": [{"term": string, "meaning": string}]}\nUse only what the transcript says. Do not invent formulas.\n\nTRANSCRIPT:\n${s.text.slice(0, 9000)}`;
    try { const j = parseJsonLoose<{ title?: string; summary?: string; bullets?: string[]; formulas?: string[]; definitions?: Definition[] }>(await generate(cfg, prompt, { stream: false })); onProgress?.(++done, n.sections.length);
      return { ...s, title: j.title?.trim() || s.title, summary: j.summary?.trim() || s.summary, bullets: Array.isArray(j.bullets) && j.bullets.length ? j.bullets.map(String).slice(0, 6) : s.bullets, formulas: Array.isArray(j.formulas) ? j.formulas.map(f => ({ text: String(f) })).slice(0, 6) : s.formulas, definitions: Array.isArray(j.definitions) ? j.definitions.filter(d => d && d.term && d.meaning).map(d => ({ term: String(d.term), meaning: String(d.meaning) })).slice(0, 5) : s.definitions } as Section;
    } catch { onProgress?.(++done, n.sections.length); return s; }
  });
  const res = settled.map((r, i) => (r.status === 'fulfilled' ? r.value : n.sections[i]));
  return { ...n, sections: res, overview: res.map(s => `${s.title}: ${trim(s.summary, 120)}`) };
}

/* ---------------- built-in sample so the studio can be tried offline ---------------- */
export const SAMPLE_TRANSCRIPT = `0:00
Welcome back everyone. Today we are going to begin our discussion on thermodynamics.
0:12
Thermodynamics studies how energy moves in macroscopic systems, and it is used in engines, refrigerators and power plants.
0:30
First we must define our boundaries. The system is the part of the universe we are studying, and the surroundings are everything else.
0:55
An open system exchanges both matter and energy with the surroundings, a closed system exchanges only energy, and an isolated system exchanges neither.
1:25
A cup of coffee with no lid is an open system. A sealed thermos is close to an isolated system.
1:50
Every system has a state described by properties such as pressure, volume and temperature, and these properties help us describe the system fully.
2:15
This leads us directly into the first law of thermodynamics, which is fundamentally the law of conservation of energy.
2:40
It states that energy cannot be created or destroyed, only transformed from one form to another.
3:10
The mathematical formulation of this is delta U equals Q minus W.
3:30
Here U is the internal energy of the system, Q is the heat added to the system and W is the work done by the system.
4:10
If you heat a gas inside a piston, part of the heat raises the internal energy and the rest is used as work to push the piston.
5:00
For an isolated system Q and W are both zero, so the internal energy stays constant. The first law is the bookkeeping rule for energy.
6:00
Remember the sign convention: heat added to the system is positive, and work done by the system is positive.
7:00
In an isothermal process the temperature is constant, so the internal energy of an ideal gas does not change and all the heat becomes work.
8:00
In an adiabatic process there is no heat exchange, so the work done by the gas comes entirely from its internal energy.
8:45
Now, let's talk about a new state function called enthalpy. We use the letter H for enthalpy, defined as U plus PV.
9:30
Enthalpy is incredibly useful when dealing with processes at constant pressure, because the heat absorbed equals the change in enthalpy.
10:30
So at constant pressure delta H equals Q. This is why chemists measure reaction heat as an enthalpy change.
11:40
Next is heat capacity. The heat capacity is the amount of heat needed to raise the temperature of a substance by one degree.
12:40
We distinguish the heat capacity at constant volume, called Cv, from the heat capacity at constant pressure, called Cp.
13:40
Cp is always larger than Cv for a gas because at constant pressure some heat is also used to expand the gas against the surroundings.
14:40
For an ideal gas the two are related by Cp minus Cv equals R, where R is the gas constant.
15:20
That is all for today. Next time we will look at the second law and entropy.`;

/* ---------------- read a public YouTube video with Gemini (needs the user's own Gemini key) ---------------- */
export async function aiTranscribeVideo(cfg: AiConfig, videoId: string, signal?: AbortSignal): Promise<string> {
  if (cfg.provider !== 'gemini') throw new Error('Reading a video from its link needs a Gemini key. Add one in Settings, or paste the transcript instead.');
  const prompt = 'Transcribe the speech in this video. Write one line every 10 to 20 seconds. Start each line with its time in square brackets, like [00:00] or [1:02:30], then the words spoken, in the language spoken. Output only these lines and nothing else. If there is no speech, output exactly: [no speech]';
  const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ file_data: { file_uri: `https://www.youtube.com/watch?v=${videoId}` } }, { text: prompt }] }] });
  const base = 'https://generativelanguage.googleapis.com/v1beta'; let last = 'Gemini could not read this video.';
  for (const model of geminiModels({ ...cfg, speed: 'fast' })) {
    const res = await fetch(`${base}/models/${model}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey.trim() }, body, signal });
    if (!res.ok) {
      const t = await res.text().catch(() => ''); let msg = t.slice(0, 240); try { msg = JSON.parse(t)?.error?.message || msg; } catch { /* keep raw */ }
      if (res.status === 429) throw new Error('Gemini says the rate limit is reached. Wait a minute and try again.');
      if (res.status === 401 || res.status === 403 || /API key/i.test(msg)) throw new Error('Gemini rejected the key. Check it in Settings.');
      last = `Gemini could not read this video (${res.status}): ${msg.slice(0, 160)}. Only public videos work; private, members-only or age-restricted videos do not.`;
      if (res.status === 404 || res.status === 400) continue; throw new Error(last);
    }
    const j = await res.json(); const text = (j?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('').trim();
    if (!text || /^\[?no speech\]?\.?$/i.test(text)) throw new Error('Gemini found no speech in that video.');
    return text;
  }
  throw new Error(last);
}
