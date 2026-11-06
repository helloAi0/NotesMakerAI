/* Exam engines: each board shapes how notes are written and which questions are practised.
   Structure facts below (paper pattern, marking style) are general public knowledge and are stated as approximate: boards revise them, so
   always check the latest official notification. NO previous-year questions are bundled: the student imports their own PYQ text and
   the app finds the patterns in it. */
export type BoardId = 'cbse' | 'jee-main' | 'jee-adv' | 'neet' | 'upsc' | 'gate';
export interface Board { id: BoardId; name: string; style: 'stepwise' | 'trick' | 'recall' | 'answer-writing' | 'numerical'; strip: string[]; format: string; practice: string; pattern: string; checkOfficial: string }
export const BOARDS: Board[] = [
  { id: 'cbse', name: 'CBSE Board', style: 'stepwise', strip: [], practice: 'Board-style questions of 1, 2, 3 and 5 marks',
    format: 'Write like a board answer sheet. For every numerical or derivation use these labelled steps, each worth about one mark: (1) Given data with units, (2) Formula / law used, (3) Substitution, (4) Calculation, (5) Final answer with unit. For theory questions give one mark per distinct point. Underline-worthy keywords go in **bold**.',
    pattern: 'Mix of objective, short-answer and long-answer questions with step marking (approximate).', checkOfficial: 'cbse.gov.in sample papers and marking schemes' },
  { id: 'jee-main', name: 'JEE Main', style: 'numerical', strip: ['introduction', 'history', 'biography'], practice: 'MCQs and numerical-value questions, fast and accurate',
    format: 'Compact revision notes: key formulas first, then the 5 most common question types per concept, each with a shortcut and a typical mistake. Skip long theory.',
    pattern: 'MCQs plus integer/numerical-value questions across Physics, Chemistry, Mathematics (approximate).', checkOfficial: 'jeemain.nta.nic.in' },
  { id: 'jee-adv', name: 'JEE Advanced', style: 'trick', strip: ['introduction', 'history', 'basic definition', 'biography', 'what is'], practice: 'Multi-concept, trap-heavy problems',
    format: 'Assume the student already knows the basic theory: do NOT explain basics. Give only (a) the non-obvious results and limiting cases, (b) the traps examiners use (sign conventions, hidden conditions, units, special cases), (c) 3 hard multi-concept problems with the idea that cracks each one. Be dense.',
    pattern: 'Multiple-correct, paragraph-based and numerical questions that combine concepts (approximate).', checkOfficial: 'jeeadv.ac.in' },
  { id: 'neet', name: 'NEET', style: 'recall', strip: [], practice: 'NCERT-line-based MCQs for Biology, Physics, Chemistry',
    format: 'Revision notes built around NCERT statements: bullet every fact the way NCERT states it, add a one-line mnemonic where natural, list commonly confused pairs, and end with 5 assertion-reason or statement-type MCQs.',
    pattern: 'MCQs, heavy on NCERT Biology (approximate).', checkOfficial: 'nta.ac.in/NEET' },
  { id: 'upsc', name: 'UPSC', style: 'answer-writing', strip: [], practice: 'Prelims MCQs and Mains answer writing',
    format: 'Write in UPSC style: a 2-line intro, then headed points (background, dimensions: political / economic / social / environmental, challenges, way forward), with one relevant example, scheme or committee only if it appears in the source. End with a one-line conclusion. Add 3 prelims-style statement questions.',
    pattern: 'Prelims objective statements; Mains descriptive answers of about 150-250 words (approximate).', checkOfficial: 'upsc.gov.in' },
  { id: 'gate', name: 'GATE', style: 'numerical', strip: ['introduction', 'history'], practice: 'MCQ, MSQ and numerical-answer questions',
    format: 'Concise engineering notes: definitions only if precise, key theorems and formulas, standard problem patterns with the fastest method, and common calculation traps. Finish with 3 NAT (numerical answer) and 2 MSQ questions.',
    pattern: 'MCQ, multiple-select and numerical-answer questions with negative marking on some (approximate).', checkOfficial: 'gate.iitk.ac.in / the current GATE organising institute' },
];
export const board = (id: string) => BOARDS.find(b => b.id === id) ?? BOARDS[0];

export function notesPrompt(id: BoardId, source: string, langName = 'English'): string {
  const b = board(id);
  return `You are an expert ${b.name} coach. Convert the SOURCE into exam-focused notes for ${b.name}.
${b.format}
${b.strip.length ? `Leave out generic material such as: ${b.strip.join(', ')}.` : ''}
Write in ${langName}; keep formulas and technical terms in standard English/LaTeX form.
Use only facts in the SOURCE or standard textbook knowledge. If you are unsure of something, say so instead of guessing. Do NOT claim any question appeared in a past paper.

SOURCE:
${source.slice(0, 12000)}`;
}
export const trickPrompt = (id: BoardId, topic: string, source: string, n = 5) => `Create ${n} high-difficulty ${board(id).name} practice questions on "${topic}" from the SOURCE. Each must combine at least two ideas or contain a classic trap. Return ONLY JSON: [{"q": string, "options": string[] (empty for numerical), "answer": string, "trap": string, "solution": string}]. Label them as practice questions, never as past-paper questions.\nSOURCE:\n${source.slice(0, 8000)}`;

/* ---- pattern finder on the student's own pasted previous-year questions ---- */
export interface Pyq { year?: number; q: string; marks?: number }
export function parsePyq(text: string): Pyq[] {
  const out: Pyq[] = []; let year: number | undefined;
  for (const raw of text.replace(/\r/g, '').split(/\n+/)) {
    const line = raw.trim(); if (!line) continue;
    const y = line.match(/^(?:#+\s*)?(?:year|paper|exam)?\s*[:-]?\s*((?:19|20)\d\d)\s*$/i) ?? line.match(/^\[?((?:19|20)\d\d)\]?\s*[:\-–]\s*$/); if (y) { year = +y[1]; continue; }
    const m = line.match(/^(?:\(?(?:Q\.?\s*)?\d+[.)]\s*|[-•*]\s+)?(.{12,})$/i); if (!m) continue;
    const ym = m[1].match(/\b((?:19|20)\d\d)\b/); const mk = m[1].match(/\[(\d+)\s*marks?\]|\((\d+)\s*marks?\)/i);
    out.push({ year: year ?? (ym ? +ym[1] : undefined), q: m[1].replace(/\s*[[(]\d+\s*marks?[\])]/i, '').trim(), marks: mk ? +(mk[1] ?? mk[2]) : undefined });
  }
  return out;
}
const STOP = new Set('the of a an and or in on to is are was for with from that this which what find calculate determine given value state write explain define derive show prove using its their by as at be it if then has have than also both each'.split(' '));
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !STOP.has(w));
export interface PyqPattern { qCount: number; years: number[]; topics: { term: string; count: number; share: number; years: number }[]; types: { type: string; count: number }[]; verdict: string }
export function pyqPatterns(qs: Pyq[]): PyqPattern {
  const freq = new Map<string, { n: number; years: Set<number> }>(); const types = new Map<string, number>();
  for (const q of qs) {
    const ws = words(q.q); const seen = new Set<string>(); for (let i = 0; i < ws.length; i++) for (const t of [ws[i], ws[i + 1] ? `${ws[i]} ${ws[i + 1]}` : '']) { if (!t || seen.has(t)) continue; seen.add(t); const e = freq.get(t) ?? { n: 0, years: new Set() }; e.n++; if (q.year) e.years.add(q.year); freq.set(t, e); }
    const ty = /\b(calculate|find|determine|evaluate|compute|how (?:much|many))\b/i.test(q.q) ? 'numerical' : /\b(derive|prove|show that)\b/i.test(q.q) ? 'derivation / proof' : /\b(assertion|reason|statement|which of the following)\b/i.test(q.q) ? 'statement / MCQ' : /\b(explain|discuss|describe|critically|examine|comment)\b/i.test(q.q) ? 'descriptive' : 'other';
    types.set(ty, (types.get(ty) ?? 0) + 1);
  }
  const min = Math.max(2, Math.ceil(qs.length * 0.05)); const topics = [...freq].filter(([t, e]) => e.n >= min && (t.includes(' ') || e.n >= min + 1)).map(([term, e]) => ({ term, count: e.n, share: e.n / (qs.length || 1), years: e.years.size })).sort((a, b) => b.count - a.count || b.years - a.years).slice(0, 12);
  const years = [...new Set(qs.map(q => q.year).filter((y): y is number => !!y))].sort();
  return { qCount: qs.length, years, topics, types: [...types].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    verdict: qs.length < 20 ? `Only ${qs.length} questions: patterns below are weak hints. Paste more years for a real signal.` : `Patterns from the ${qs.length} questions you pasted${years.length ? ` (${years[0]}–${years[years.length - 1]})` : ''}. They show what repeated in YOUR sample, not what will come next.` };
}
