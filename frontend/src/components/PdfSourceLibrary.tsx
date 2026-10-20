import React, { useState } from 'react';
import {
  FileText, UploadCloud, Search, BookOpen, CheckCircle2, Clock, Sparkles, Send,
  Trash2, Key, Check, X, AlertTriangle, RefreshCw, Settings2,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import {
  PROVIDERS, PROVIDER_IDS, docLimits, concurrencyFor, loadProvider, loadSaved, loadSpeed, saveConfig, saveProvider,
  saveSpeed, generate, listModels, pMap, parseJsonLoose, friendlyError, withTimeout,
} from '../lib/aiClient';
import type { AiConfig, ProviderId, Speed } from '../lib/aiClient';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DocumentItem {
  id: string;
  name: string;
  size: string;
  pages: number;
  status: 'Uploading' | 'Extracting' | 'Ready' | 'Error';
  textContent: string;
  pageTexts: string[];
  uploadDate: string;
  errorMsg?: string;
}

interface FormulaVariable { symbol: string; meaning: string; unit?: string | null }
interface FormulaBreakdown { part: string; explanation: string }
interface FormulaItem {
  name: string;
  latex: string;
  plainText?: string;
  page?: number | null;
  confidence?: 'exact' | 'reconstructed';
  purpose: string;
  variables: FormulaVariable[];
  breakdown?: FormulaBreakdown[];
  example?: string | null;
}
interface FormulaResult { hasFormulas: boolean; formulas: FormulaItem[]; partial?: boolean; total?: number; done?: number; failed?: number }

type Audience = 'school' | 'undergraduate' | 'postgraduate' | 'competitive';
type Difficulty = 'easy' | 'medium' | 'hard' | 'mixed';
type QuestionType = 'mcq' | 'short' | 'long' | 'mixed';

interface QuizConfig {
  audience: Audience;
  classLevel: string;
  ugYear: string;
  pgYear: string;
  exam: string;
  difficulty: Difficulty;
  questionType: QuestionType;
  count: number;
}

interface QuizQuestion {
  type: 'mcq' | 'short' | 'long';
  question: string;
  options?: string[];
  correctIndex?: number;
  answer: string;
  keyPoints?: string[];
  marks: number;
  explanation?: string;
  page?: number | null;
}
interface QuizSet { label: string; questions: QuizQuestion[]; note?: string }

interface DocResults { summary?: string; formulas?: FormulaResult; quiz?: QuizSet }
type GenTab = 'summary' | 'formulas' | 'quiz';
type TabKey = 'qa' | 'summary' | 'formulas' | 'questions';

interface EvalState { loading?: boolean; score?: number; outOf?: number; feedback?: string; error?: string }

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const AUDIENCES: { id: Audience; label: string }[] = [
  { id: 'school', label: 'School' },
  { id: 'undergraduate', label: 'Undergraduate' },
  { id: 'postgraduate', label: 'Postgraduate' },
  { id: 'competitive', label: 'Competitive exam' },
];
const CLASSES = Array.from({ length: 12 }, (_, i) => String(i + 1));
const UG_YEARS = ['1st year', '2nd year', '3rd year', '4th year'];
const PG_YEARS = ['1st year', '2nd year', 'PhD / research scholar'];
const EXAMS = ['JEE Main', 'JEE Advanced', 'NEET', 'GATE', 'UPSC (Prelims)', 'CAT', 'GRE', 'Other competitive exam'];
const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
  { id: 'mixed', label: 'Mixed' },
];
const QUESTION_TYPES: { id: QuestionType; label: string; hint: string }[] = [
  { id: 'mcq', label: 'MCQ', hint: 'Auto-graded' },
  { id: 'short', label: 'Short answer', hint: '2-3 marks each' },
  { id: 'long', label: 'Long answer', hint: '5-10 marks each' },
  { id: 'mixed', label: 'Mixed paper', hint: 'MCQ + short + long' },
];

/* ------------------------------------------------------------------ */
/*  Helpers: document text selection                                   */
/* ------------------------------------------------------------------ */

const pageBlock = (text: string, i: number) => `--- Page ${i + 1} ---\n${text}\n\n`;

function chunkPages(pages: string[], maxChars: number): { text: string; from: number; to: number }[] {
  const chunks: { text: string; from: number; to: number }[] = [];
  let buf = '';
  let from = 1;
  pages.forEach((p, i) => {
    const block = pageBlock(p, i);
    if (buf && buf.length + block.length > maxChars) {
      chunks.push({ text: buf, from, to: i });
      buf = '';
      from = i + 1;
    }
    buf += block;
  });
  if (buf) chunks.push({ text: buf, from, to: pages.length });
  return chunks;
}

/** Whole document if it fits, otherwise evenly spaced slices from start to end. */
function spreadSample(pages: string[], maxChars: number): string {
  const blocks = pages.map((p, i) => pageBlock(p, i));
  const total = blocks.reduce((n, b) => n + b.length, 0);
  if (total <= maxChars) return blocks.join('');
  const windows = 8;
  const perWindow = Math.floor(maxChars / windows);
  const size = Math.ceil(blocks.length / windows);
  const parts: string[] = [];
  for (let w = 0; w < windows; w++) {
    let used = 0;
    let part = '';
    for (const b of blocks.slice(w * size, (w + 1) * size)) {
      if (used + b.length > perWindow) break;
      part += b;
      used += b.length;
    }
    if (part) parts.push(part);
  }
  return parts.join('\n[... part of the document omitted ...]\n\n');
}

/** Text of pages [from, to) keeping the real page numbers, capped at maxChars. */
function segmentText(pages: string[], from: number, to: number, maxChars: number): string {
  let out = '';
  for (let i = from; i < to; i++) {
    const block = pageBlock(pages[i], i);
    if (out && out.length + block.length > maxChars) break;
    out += block;
  }
  return out;
}

const MATH_SIGNAL = /[=\u2211\u222b\u2202\u221a\u00b1\u2248\u2260\u2264\u2265\u00d7\u00f7\u221e\u2207\u0394\u03c0\u03c3\u03bc\u03bb\u03b8\u03c9\u03b1\u03b2\u03b3\u03b4\u03b5]|\\frac|\^\s*[\d{(a-z]|\b(?:sin|cos|tan|log|ln|exp|lim)\s*\(/gi;

/** Rough count of math-like symbols on a page, used to skip pages that cannot contain formulas. */
const mathScore = (text: string) => (text.match(MATH_SIGNAL) ?? []).length;

function dedupeFormulas(list: FormulaItem[]): FormulaItem[] {
  const seen = new Set<string>();
  return list.filter(f => {
    const key = cleanLatex(f.latex).replace(/\s+/g, '').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Calls fn at most once per `ms` while text streams in, so long answers do not re-render hundreds of times. */
function throttled(fn: (t: string) => void, ms = 120) {
  let last = 0;
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    push(t: string) {
      pending = t;
      const now = Date.now();
      if (now - last >= ms) { last = now; pending = null; fn(t); }
      else if (!timer) {
        timer = setTimeout(() => {
          timer = undefined;
          if (pending !== null) { last = Date.now(); const v = pending; pending = null; fn(v); }
        }, ms);
      }
    },
    flush(t: string) { if (timer) clearTimeout(timer); timer = undefined; pending = null; fn(t); },
    cancel() { if (timer) clearTimeout(timer); timer = undefined; pending = null; },
  };
}

const STOPWORDS = new Set(['the', 'and', 'for', 'are', 'was', 'what', 'which', 'who', 'how', 'why', 'when', 'where', 'does', 'did', 'this', 'that', 'with', 'from', 'about', 'into', 'have', 'has', 'can', 'you', 'your', 'tell', 'explain', 'give']);

/** Whole document if it fits, otherwise the pages that best match the question. */
function selectRelevantPages(pages: string[], query: string, maxChars: number): string {
  const blocks = pages.map((p, i) => pageBlock(p, i));
  const total = blocks.reduce((n, b) => n + b.length, 0);
  if (total <= maxChars) return blocks.join('');

  const terms = query.toLowerCase().split(/[^a-z0-9À-ɏ]+/).filter(t => t.length > 2 && !STOPWORDS.has(t));
  const scored = blocks.map((b, i) => {
    const lower = b.toLowerCase();
    let score = 0;
    for (const t of terms) {
      let idx = lower.indexOf(t);
      let hits = 0;
      while (idx !== -1 && hits < 10) { hits++; idx = lower.indexOf(t, idx + t.length); }
      score += hits;
    }
    return { i, score };
  });
  if (scored.every(s => s.score === 0)) return spreadSample(pages, maxChars);

  scored.sort((a, b) => b.score - a.score);
  const chosen: number[] = [];
  let used = 0;
  for (const s of scored) {
    if (s.score === 0) break;
    if (used + blocks[s.i].length > maxChars) continue;
    chosen.push(s.i);
    used += blocks[s.i].length;
  }
  chosen.sort((a, b) => a - b);
  return chosen.map(i => blocks[i]).join('');
}

/* ------------------------------------------------------------------ */
/*  Prompts                                                            */
/* ------------------------------------------------------------------ */

const SUMMARY_STRUCTURE = `
Use these markdown sections (## headings), in this order. Leave out any section that does not apply instead of filling it with generic text:

## Overview
What the document is (book / research paper / lecture notes / report ...), its subject, the author if stated, its purpose and intended audience. 3-5 sentences.

## Key Takeaways
6-10 bullet points with the most important ideas a reader must remember.

## Detailed Summary
Follow the document's own structure. Use a ### sub-heading for every chapter / section (add the page range, e.g. "(pp. 12-25)"). Under each: the main argument, the important explanations, definitions, evidence, data and conclusions, in clear prose or bullets. For a research paper cover: problem and motivation, method, results, discussion, limitations.

## Key Terms & Concepts
A markdown table with columns: Term | Meaning | Page.

## Important Examples, Data & Findings
The concrete examples, numbers, case studies or experiments worth remembering.

## Cautions & Common Mistakes
Only if the document warns about pitfalls, misconceptions or limitations.

## Final Takeaway
A short paragraph on what to remember and who benefits most from reading it.`;

const SUMMARY_RULES = `
Rules:
- Use ONLY information in the document. Never invent facts, numbers or quotes.
- Cite page numbers like (p. 7) wherever you can; the document text contains "--- Page N ---" markers.
- Write in clear English. If the document is in another language, still write in English and keep important terms in the original language in brackets.
- Be thorough: this summary replaces reading the document, so do not skip chapters or sections.`;

const summaryPrompt = (name: string, pageCount: number, text: string, target: number) => `
You are an expert academic summarizer. Write a complete, well-organized summary of the document "${name}" (${pageCount} pages).
${SUMMARY_STRUCTURE}
${SUMMARY_RULES}
- Length: about ${target} words in total. Be efficient: no filler, no repetition.

DOCUMENT TEXT:
${text}`;

const notesPrompt = (name: string, from: number, to: number, text: string) => `
You are reading part of the document "${name}" (pages ${from}-${to}). Write detailed study notes for these pages only: the chapters/sections they contain, main arguments, definitions, key terms, examples, data and conclusions. Cite page numbers like (p. 7). Use ONLY the text given. Use markdown.

TEXT (pages ${from}-${to}):
${text}`;

const summaryFromNotesPrompt = (name: string, pageCount: number, notes: string, target: number) => `
You are an expert academic summarizer. Below are detailed notes taken from consecutive parts of the document "${name}" (${pageCount} pages). Combine them into one complete, well-organized summary of the whole document.
${SUMMARY_STRUCTURE}
${SUMMARY_RULES}
- Length: about ${target} words in total. Be efficient: no filler, no repetition.

NOTES:
${notes}`;

const qaPrompt = (context: string, question: string) => `
You are FRIDAY, an educational AI. Answer the question using ONLY the document text below.
- If the answer is not in the text, say "I cannot find this in the document."
- Answer directly and concisely (a short paragraph or a few bullets). Do not repeat the question.
- Cite the pages you used like (p. 3); the text has "--- Page N ---" markers.
- If the question is a general one such as "what is in this PDF", give a short overview of its contents.

DOCUMENT TEXT:
${context}

QUESTION: ${question}`;

const formulaPrompt = (name: string, text: string) => `
You are a meticulous scientist and teacher. Find every formula in the pages below, from the document "${name}". "Formula" means a mathematical formula or equation, an inequality, a physical or chemical law written as an equation, a chemical reaction equation, a statistical or financial formula, or an algorithm complexity expression that the document itself states.

Strict rules:
- Only include formulas that really appear in the text. Never invent or add formulas from your own knowledge.
- The text was extracted from a PDF, so equations are often garbled (symbols split, subscripts and fractions flattened). Reconstruct each formula carefully into valid LaTeX. Set "confidence" to "exact" if the text was clean and "reconstructed" if you had to interpret garbled text.
- If the pages contain no formulas, return {"formulas": []}.
- Keep every text field SHORT so the answer is fast: "purpose" 1-2 sentences, each variable "meaning" under 12 words, each "breakdown" explanation 1 sentence, "example" only if it is a quick numeric one (otherwise null).

For each formula return an object with these keys:
- "name": what the formula is called, or a short descriptive name
- "latex": the formula in LaTeX, WITHOUT $ delimiters
- "plainText": the formula in plain text, e.g. "F = m * a"
- "page": the page number where it appears (integer) or null
- "confidence": "exact" or "reconstructed"
- "purpose": what the formula computes and why the document uses it
- "variables": array of {"symbol": LaTeX for the symbol, "meaning": what it represents, "unit": unit or null}, covering EVERY symbol in the formula
- "breakdown": array of {"part": LaTeX of one term / factor / operator group, "explanation": what that part does}, walking through the formula piece by piece
- "example": a short worked numeric example, or null

Return ONLY JSON: {"formulas": [ ... ]}

TEXT:
${text}`;

function describeAudience(c: QuizConfig): string {
  switch (c.audience) {
    case 'school': return `a school student in Class ${c.classLevel}`;
    case 'undergraduate': return `an undergraduate (bachelor's) student in their ${c.ugYear}`;
    case 'postgraduate': return `a postgraduate student (${c.pgYear})`;
    default: return `a candidate preparing for ${c.exam}`;
  }
}

function quizLabel(c: QuizConfig): string {
  const who =
    c.audience === 'school' ? `Class ${c.classLevel}` :
    c.audience === 'undergraduate' ? `Undergraduate, ${c.ugYear}` :
    c.audience === 'postgraduate' ? `Postgraduate, ${c.pgYear}` : c.exam;
  const type = QUESTION_TYPES.find(t => t.id === c.questionType)?.label ?? '';
  return `${who} · ${c.difficulty[0].toUpperCase()}${c.difficulty.slice(1)} · ${type} · ${c.count} questions`;
}

function questionMix(c: QuizConfig): { mcq: number; short: number; long: number } {
  const n = c.count;
  if (c.questionType === 'mcq') return { mcq: n, short: 0, long: 0 };
  if (c.questionType === 'short') return { mcq: 0, short: n, long: 0 };
  if (c.questionType === 'long') return { mcq: 0, short: 0, long: n };
  const mcq = Math.round(n * 0.5);
  const short = Math.min(n - mcq, Math.round(n * 0.3));
  return { mcq, short, long: Math.max(0, n - mcq - short) };
}

const DIFFICULTY_TEXT: Record<Difficulty, string> = {
  easy: 'Easy: direct recall and basic understanding of definitions and facts.',
  medium: 'Medium: understanding and application; some reasoning and connecting ideas.',
  hard: 'Hard: analysis, multi-step reasoning, tricky distractors and application to unfamiliar situations.',
  mixed: 'Mixed: roughly 30% easy, 40% medium, 30% hard, in random order.',
};

function quizPrompt(
  name: string,
  c: QuizConfig,
  text: string,
  mix: { mcq: number; short: number; long: number },
  range?: { from: number; to: number },
): string {
  const total = mix.mcq + mix.short + mix.long;
  return `
You are an expert exam-paper setter. Create part of a practice paper from the document "${name}"${range ? ` (use pages ${range.from}-${range.to})` : ''}.

Student: ${describeAudience(c)}.
Difficulty: ${DIFFICULTY_TEXT[c.difficulty]}
Total questions: exactly ${total}, made up of ${mix.mcq} MCQ, ${mix.short} short-answer and ${mix.long} long-answer questions.

Rules:
- Every question must be answerable from the document's content. Do not use outside facts. Match vocabulary, depth and question style to the student's level (and, for competitive exams, to that exam's style).
- Cover different topics; no two questions may test the same fact.
- MCQ: exactly 4 options written as plain text WITHOUT "A)" / "1." prefixes, exactly one correct, plausible distractors. "correctIndex" is the 0-based index of the correct option. marks = 1.
- Short answer: answer expected in 2-4 sentences, marks 2-3.
- Long answer: answer expected in a structured paragraph or points, marks 5-10 depending on difficulty.
- For short and long questions give "answer" (a model answer) and "keyPoints" (3-5 short marking points).
- For MCQ, "answer" is the text of the correct option.
- "explanation": ONE or TWO sentences on why the correct answer is right. Keep it short.
- "page": the main page the question is based on (integer) or null.

Return ONLY a JSON array, no other text:
[{"type":"mcq","question":"...","options":["...","...","...","..."],"correctIndex":0,"answer":"...","marks":1,"explanation":"...","page":3},
 {"type":"short","question":"...","answer":"...","keyPoints":["..."],"marks":3,"explanation":"...","page":5}]

DOCUMENT TEXT:
${text}`;
}

/* ------------------------------------------------------------------ */
/*  Markdown rendering                                                 */
/* ------------------------------------------------------------------ */

const mdComponents: any = {
  h1: ({ node, ...p }: any) => <h2 className="text-lg font-bold text-slate-900 mt-6 mb-2" {...p} />,
  h2: ({ node, ...p }: any) => <h2 className="text-base font-bold text-slate-900 mt-7 mb-2 pb-1 border-b border-slate-200" {...p} />,
  h3: ({ node, ...p }: any) => <h3 className="text-sm font-bold text-slate-900 mt-4 mb-1" {...p} />,
  h4: ({ node, ...p }: any) => <h4 className="text-sm font-semibold text-slate-800 mt-3 mb-1" {...p} />,
  p: ({ node, ...p }: any) => <p className="text-sm text-slate-700 leading-relaxed my-2" {...p} />,
  ul: ({ node, ...p }: any) => <ul className="list-disc pl-5 my-2 space-y-1 text-sm text-slate-700" {...p} />,
  ol: ({ node, ...p }: any) => <ol className="list-decimal pl-5 my-2 space-y-1 text-sm text-slate-700" {...p} />,
  strong: ({ node, ...p }: any) => <strong className="font-semibold text-slate-900" {...p} />,
  blockquote: ({ node, ...p }: any) => <blockquote className="border-l-4 border-amber-500 pl-3 my-2 text-sm text-slate-600 italic" {...p} />,
  code: ({ node, ...p }: any) => <code className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded text-xs" {...p} />,
  table: ({ node, ...p }: any) => (
    <div className="overflow-x-auto my-3">
      <table className="min-w-full text-xs border border-slate-200 rounded" {...p} />
    </div>
  ),
  th: ({ node, ...p }: any) => <th className="bg-slate-100 text-left font-semibold text-slate-800 px-3 py-2 border border-slate-200" {...p} />,
  td: ({ node, ...p }: any) => <td className="px-3 py-2 border border-slate-200 text-slate-700 align-top" {...p} />,
};

function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={mdComponents}>
      {text}
    </ReactMarkdown>
  );
}

const cleanLatex = (s: string) => s.trim().replace(/^\${1,2}/, '').replace(/\${1,2}$/, '').trim();

/* ------------------------------------------------------------------ */
/*  Small UI pieces                                                    */
/* ------------------------------------------------------------------ */

function LoadingPanel({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
      <Clock className="w-8 h-8 animate-spin text-amber-500" />
      <p className="text-xs font-semibold">{text}</p>
      {sub && <p className="text-[11px]">{sub}</p>}
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="max-w-2xl mx-auto my-8 p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 space-y-3">
      <p className="flex items-center gap-2 text-sm font-bold"><AlertTriangle className="w-4 h-4" /> Something went wrong</p>
      <p className="text-xs leading-relaxed break-words">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold">
          <RefreshCw className="w-3.5 h-3.5" /> Try again
        </button>
      )}
    </div>
  );
}

function Chip({ active, onClick, children, hint }: { active: boolean; onClick: () => void; children: React.ReactNode; hint?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all text-left ${
        active ? 'border-amber-500 bg-amber-50 text-amber-900 shadow-sm' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
      }`}
    >
      {children}
      {hint && <span className="block text-[10px] font-normal text-slate-500">{hint}</span>}
    </button>
  );
}

function FormulaCard({ f, index }: { f: FormulaItem; index: number }) {
  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-500">#{index + 1}</span>
        <h3 className="text-sm font-bold text-slate-900 flex-1 min-w-0">{f.name}</h3>
        {f.page ? <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">Page {f.page}</span> : null}
        {f.confidence === 'reconstructed' && (
          <span className="text-[10px] font-semibold bg-orange-100 text-orange-800 px-2 py-0.5 rounded" title="The PDF text was garbled, so this formula was reconstructed. Check it against the page.">
            Reconstructed - verify on page
          </span>
        )}
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="overflow-x-auto text-center py-2">
          <Markdown text={`$$\n${cleanLatex(f.latex)}\n$$`} />
          {f.plainText && <p className="text-[11px] text-slate-500 font-mono">{f.plainText}</p>}
        </div>

        <div>
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">What it does</h4>
          <p className="text-sm text-slate-700 leading-relaxed">{f.purpose}</p>
        </div>

        {f.variables?.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Every symbol explained</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border border-slate-200">
                <thead>
                  <tr className="bg-slate-100 text-left text-slate-800">
                    <th className="px-3 py-2 border border-slate-200">Symbol</th>
                    <th className="px-3 py-2 border border-slate-200">Meaning</th>
                    <th className="px-3 py-2 border border-slate-200">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {f.variables.map((v, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 border border-slate-200 whitespace-nowrap"><Markdown text={`$${cleanLatex(v.symbol)}$`} /></td>
                      <td className="px-3 py-2 border border-slate-200 text-slate-700">{v.meaning}</td>
                      <td className="px-3 py-2 border border-slate-200 text-slate-600">{v.unit || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {f.breakdown && f.breakdown.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Part by part</h4>
            <ul className="space-y-2">
              {f.breakdown.map((b, i) => (
                <li key={i} className="flex gap-3 text-sm text-slate-700">
                  <span className="shrink-0 bg-slate-100 rounded px-2 py-0.5 text-xs"><Markdown text={`$${cleanLatex(b.part)}$`} /></span>
                  <span className="leading-relaxed">{b.explanation}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {f.example && (
          <div className="p-3 bg-amber-500/10 border-l-4 border-amber-600 rounded-lg">
            <h4 className="text-xs font-bold text-amber-900 mb-1">Worked example</h4>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{f.example}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function PdfSourceLibrary() {
  // The key can also come from a .env.local file: VITE_GEMINI_API_KEY=your_key
  const envKey: string = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
  const [cfg, setCfg] = useState<AiConfig>(() => {
    const provider = loadProvider();
    return { provider, speed: loadSpeed(), ...loadSaved(provider, envKey) };
  });
  const provider = cfg.provider;
  const [showKeyInput, setShowKeyInput] = useState(!cfg.apiKey);
  const [keyStatus, setKeyStatus] = useState<'none' | 'testing' | 'valid' | 'invalid'>('none');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keyLog, setKeyLog] = useState<string[]>([]);
  const [modelList, setModelList] = useState<string[]>([]);

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [ragQuery, setRagQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [ragAnswer, setRagAnswer] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('qa');

  const [results, setResults] = useState<Record<string, DocResults>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingTab, setGeneratingTab] = useState<GenTab | ''>('');
  const [generatingDocId, setGeneratingDocId] = useState('');
  const [progress, setProgress] = useState('');
  const [tabError, setTabError] = useState<{ tab: GenTab; message: string } | null>(null);

  const [qCfg, setQCfg] = useState<QuizConfig>({
    audience: 'undergraduate',
    classLevel: '10',
    ugYear: '1st year',
    pgYear: '1st year',
    exam: 'JEE Main',
    difficulty: 'medium',
    questionType: 'mcq',
    count: 10,
  });
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [evals, setEvals] = useState<Record<number, EvalState>>({});

  const selectedDoc = documents.find(d => d.id === selectedDocId);
  const lim = docLimits(cfg);
  const docResults: DocResults = (selectedDocId && results[selectedDocId]) || {};
  const quiz = docResults.quiz;

  const resetQuizAnswers = () => { setUserAnswers({}); setQuizSubmitted(false); setEvals({}); };

  /* ---------------- API key ---------------- */

  const resetKeyState = () => { setKeyStatus('none'); setKeyError(null); setKeyLog([]); };

  const updateCfg = (patch: Partial<AiConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    saveConfig(next);
    if ('apiKey' in patch || 'model' in patch || 'baseUrl' in patch) resetKeyState();
  };

  const changeProvider = (p: ProviderId) => {
    saveProvider(p);
    setCfg({ provider: p, speed: cfg.speed, ...loadSaved(p, envKey) });
    setModelList([]);
    resetKeyState();
  };

  const changeSpeed = (sp: Speed) => { saveSpeed(sp); setCfg(c => ({ ...c, speed: sp })); };

  const testApiKey = async () => {
    if (!cfg.apiKey.trim()) { setKeyError('Paste your API key first.'); return; }
    setKeyStatus('testing');
    setKeyError(null);

    // Every attempt is written to this log so you can see exactly what the service answered.
    const lines: string[] = [];
    const log = (line: string) => {
      lines.push(line);
      console.log('[API key test]', line);
      setKeyLog([...lines]);
    };
    setKeyLog([]);

    try {
      await withTimeout(generate(cfg, 'Reply with the single word: OK', { timeoutMs: 25_000, retries: 0, maxModels: 3, log }), 120_000);
      setKeyStatus('valid');
      saveConfig(cfg);
      listModels(cfg).then(setModelList);
      setTimeout(() => setShowKeyInput(false), 2500);
    } catch (e: any) {
      console.error('Key test failed:', e);
      setKeyError(friendlyError(e));
      setKeyStatus('invalid');
    }
  };

  /* ---------------- Upload ---------------- */

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allows uploading the same file again later
    if (!file) return;

    const newDocId = `doc-${Date.now()}`;
    setDocuments(prev => [{
      id: newDocId,
      name: file.name,
      size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      pages: 0,
      status: 'Extracting',
      textContent: '',
      pageTexts: [],
      uploadDate: 'Just now',
    }, ...prev]);
    setSelectedDocId(newDocId);
    setRagAnswer(null);
    setTabError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pageTexts: string[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        pageTexts.push(content.items.map((item: any) => item.str ?? '').join(' '));
      }

      const totalChars = pageTexts.reduce((n, p) => n + p.trim().length, 0);
      if (totalChars < 200) {
        throw new Error('No selectable text found. This looks like a scanned PDF (images of pages). Run OCR on it first, then upload again.');
      }

      const fullText = pageTexts.map((p, i) => pageBlock(p, i)).join('');
      setDocuments(prev => prev.map(d => d.id === newDocId
        ? { ...d, status: 'Ready', pages: pdf.numPages, textContent: fullText, pageTexts }
        : d));
    } catch (error: any) {
      console.error('PDF Error:', error);
      setDocuments(prev => prev.map(d => d.id === newDocId
        ? { ...d, status: 'Error', errorMsg: error?.message || 'Could not read this PDF.' }
        : d));
    }
  };

  /* ---------------- Ask FRIDAY ---------------- */

  const handleRagSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ragQuery.trim() || !selectedDoc || selectedDoc.status !== 'Ready') return;
    if (!cfg.apiKey.trim()) { setRagAnswer('Add and verify your API key (top right) first.'); setShowKeyInput(true); return; }

    setIsSearching(true);
    setRagAnswer('');
    const live = throttled(setRagAnswer);

    try {
      const context = selectRelevantPages(selectedDoc.pageTexts, ragQuery, lim.qa);
      const text = await generate(cfg, qaPrompt(context, ragQuery), { onText: live.push });
      live.flush(text);
    } catch (err: any) {
      live.cancel();
      setRagAnswer(prev => (prev ? prev + '\n\n' : '') + '**Error:** ' + friendlyError(err));
    } finally {
      setIsSearching(false);
    }
  };

  /* ---------------- Summary / Formulas / Quiz ---------------- */

  const patchResults = (docId: string, patch: Partial<DocResults>) =>
    setResults(prev => ({ ...prev, [docId]: { ...prev[docId], ...patch } }));

  const buildSummary = async (doc: DocumentItem) => {
    const live = throttled(t => patchResults(doc.id, { summary: t }));
    const words = doc.textContent.split(/\s+/).length;
    const target = Math.min(1800, Math.max(450, Math.round(words / 6)));
    try {
      let text: string;
      if (doc.textContent.length <= lim.single) {
        text = await generate(cfg, summaryPrompt(doc.name, doc.pages, doc.textContent, target), { onText: live.push });
      } else {
        const chunks = chunkPages(doc.pageTexts, lim.chunk);
        let done = 0;
        setProgress(`Reading ${chunks.length} parts of the document at the same time...`);
        const settled = await pMap(chunks, concurrencyFor(cfg), async c => {
          const notes = await generate(cfg, notesPrompt(doc.name, c.from, c.to, c.text));
          done++;
          setProgress(`Read ${done} of ${chunks.length} parts...`);
          return notes;
        });
        const bad = settled.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
        if (bad) throw bad.reason;
        const notes = settled.map(r => (r as PromiseFulfilledResult<string>).value);
        setProgress('Writing the final summary...');
        text = await generate(cfg, summaryFromNotesPrompt(doc.name, doc.pages, notes.join('\n\n'), target), { onText: live.push });
      }
      live.flush(text);
    } catch (e) {
      live.cancel();
      throw e;
    }
  };

  const buildFormulas = async (doc: DocumentItem) => {
    // Only pages that contain math-like symbols are sent to the AI. No such pages = instant answer, no request at all.
    const candidates = doc.pageTexts.map((t, i) => ({ t, i })).filter(p => mathScore(p.t) >= 2);
    if (candidates.length === 0) {
      patchResults(doc.id, { formulas: { hasFormulas: false, formulas: [] } });
      return;
    }

    const batches: string[] = [];
    let cur = '';
    for (const p of candidates) {
      const block = pageBlock(p.t, p.i);
      if (cur && cur.length + block.length > 18_000) { batches.push(cur); cur = ''; }
      cur += block;
    }
    if (cur) batches.push(cur);

    const found: FormulaItem[] = [];
    let done = 0;
    let failed = 0;
    let firstErr: unknown;
    const publish = () => {
      const formulas = dedupeFormulas(found).map(f => ({ ...f, variables: Array.isArray(f.variables) ? f.variables : [] }));
      patchResults(doc.id, {
        formulas: { hasFormulas: formulas.length > 0, formulas, partial: done + failed < batches.length, total: batches.length, done, failed },
      });
      setProgress(`Scanned ${done + failed} of ${batches.length} parts · ${formulas.length} formula${formulas.length === 1 ? '' : 's'} so far`);
    };
    publish();

    await pMap(batches, concurrencyFor(cfg), async batch => {
      try {
        const raw = await generate(cfg, formulaPrompt(doc.name, batch), { json: true });
        const parsed = parseJsonLoose<{ formulas?: FormulaItem[] } | FormulaItem[]>(raw);
        const list = Array.isArray(parsed) ? parsed : parsed.formulas ?? [];
        found.push(...list.filter(f => f && typeof f.latex === 'string' && f.latex.trim()));
        done++;
      } catch (e) {
        failed++;
        firstErr ??= e;
      }
      publish(); // results appear as soon as each part is finished
    });

    if (failed === batches.length) {
      patchResults(doc.id, { formulas: undefined });
      throw firstErr;
    }
  };

  const buildQuiz = async (doc: DocumentItem) => {
    const qc: QuizConfig = { ...qCfg, count: Math.min(30, Math.max(1, Math.round(qCfg.count || 10))) };
    const mix = questionMix(qc);
    const types: ('mcq' | 'short' | 'long')[] = [
      ...Array<'mcq'>(mix.mcq).fill('mcq'),
      ...Array<'short'>(mix.short).fill('short'),
      ...Array<'long'>(mix.long).fill('long'),
    ];

    // Several small requests run at the same time instead of one big one.
    const nBatches = Math.min(6, Math.max(1, Math.ceil(qc.count / 5)));
    const perBatch: ('mcq' | 'short' | 'long')[][] = Array.from({ length: nBatches }, () => []);
    types.forEach((t, i) => perBatch[i % nBatches].push(t));

    const shortDoc = doc.textContent.length < 12_000;
    const segSize = Math.ceil(doc.pageTexts.length / nBatches);
    const jobs = perBatch.map((ts, b) => {
      const from = b * segSize;
      const to = Math.min(doc.pageTexts.length, from + segSize);
      const bm = { mcq: ts.filter(t => t === 'mcq').length, short: ts.filter(t => t === 'short').length, long: ts.filter(t => t === 'long').length };
      const whole = nBatches === 1 || shortDoc || from >= to;
      return {
        mix: bm,
        range: whole ? undefined : { from: from + 1, to },
        text: whole ? spreadSample(doc.pageTexts, lim.quiz) : segmentText(doc.pageTexts, from, to, Math.floor(lim.quiz / 2)),
      };
    }).filter(j => j.mix.mcq + j.mix.short + j.mix.long > 0);

    let done = 0;
    setProgress(`Writing ${qc.count} questions in ${jobs.length} part${jobs.length === 1 ? '' : 's'} at the same time...`);
    const settled = await pMap(jobs, concurrencyFor(cfg), async j => {
      const raw = await generate(cfg, quizPrompt(doc.name, qc, j.text, j.mix, j.range), { json: true });
      done++;
      setProgress(`Finished ${done} of ${jobs.length} parts...`);
      const parsed = parseJsonLoose<QuizQuestion[] | { questions: QuizQuestion[] }>(raw);
      return Array.isArray(parsed) ? parsed : parsed.questions ?? [];
    });

    const rejected = settled.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
    const list = settled.flatMap(r => (r.status === 'fulfilled' ? r.value : []));

    const questions = list
      .filter(q => q && typeof q.question === 'string')
      .map(q => ({ ...q, marks: Number(q.marks) || (q.type === 'mcq' ? 1 : q.type === 'short' ? 3 : 5) }))
      .filter(q => {
        if (q.type === 'mcq') {
          return Array.isArray(q.options) && q.options.length >= 2 &&
            typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex < q.options.length;
        }
        return q.type === 'short' || q.type === 'long';
      });

    if (questions.length === 0) throw rejected[0]?.reason ?? new Error('The AI did not return usable questions. Please try again.');
    const note = questions.length < qc.count
      ? `${questions.length} of ${qc.count} questions were generated${rejected.length ? ' (some parts failed)' : ''}. Use "Change settings" to generate again.`
      : undefined;
    patchResults(doc.id, { quiz: { label: quizLabel(qc), questions, note } });
    resetQuizAnswers();
  };

  const runGeneration = async (tab: GenTab) => {
    const doc = selectedDoc;
    if (!doc || doc.status !== 'Ready') return;
    if (!cfg.apiKey.trim()) {
      setTabError({ tab, message: 'Add and verify your API key (top right) first.' });
      setShowKeyInput(true);
      return;
    }

    setIsGenerating(true);
    setGeneratingTab(tab);
    setGeneratingDocId(doc.id);
    setTabError(null);
    setProgress('');

    try {
      if (tab === 'summary') {
        patchResults(doc.id, { summary: undefined });
        await buildSummary(doc);
      } else if (tab === 'formulas') {
        patchResults(doc.id, { formulas: undefined });
        await buildFormulas(doc);
      } else {
        await buildQuiz(doc);
      }
    } catch (err: any) {
      console.error(`${tab} generation failed:`, err);
      setTabError({ tab, message: friendlyError(err) });
    } finally {
      setIsGenerating(false);
      setGeneratingTab('');
      setGeneratingDocId('');
      setProgress('');
    }
  };

  const openTab = (tab: TabKey) => {
    setActiveTab(tab);
    if (isGenerating || !selectedDoc || selectedDoc.status !== 'Ready') return;
    if (tab === 'summary' && !docResults.summary) runGeneration('summary');
    if (tab === 'formulas' && !docResults.formulas) runGeneration('formulas');
  };

  const evaluateAnswer = async (idx: number, q: QuizQuestion) => {
    const answer = (userAnswers[idx] ?? '').trim();
    if (!answer) { setEvals(p => ({ ...p, [idx]: { error: 'Write an answer first.' } })); return; }
    setEvals(p => ({ ...p, [idx]: { loading: true } }));
    try {
      const prompt = `
You are a fair examiner. Grade the student's answer using the marking points.
Question (${q.marks} marks): ${q.question}
Model answer: ${q.answer}
Marking points: ${(q.keyPoints ?? []).join(' | ')}
Student's answer: ${answer}

Return ONLY JSON: {"score": <number from 0 to ${q.marks}, halves allowed>, "feedback": "2-4 sentences: what was correct, what is missing or wrong"}`;
      const raw = await generate(cfg, prompt, { json: true });
      const r = parseJsonLoose<{ score: number; feedback: string }>(raw);
      const score = Math.max(0, Math.min(q.marks, Number(r.score) || 0));
      setEvals(p => ({ ...p, [idx]: { score, outOf: q.marks, feedback: r.feedback } }));
    } catch (err: any) {
      setEvals(p => ({ ...p, [idx]: { error: friendlyError(err) } }));
    }
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const remaining = documents.filter(d => d.id !== id);
    setDocuments(remaining);
    setResults(prev => { const { [id]: _removed, ...rest } = prev; return rest; });
    if (selectedDocId === id) {
      setSelectedDocId(remaining[0]?.id || '');
      setRagAnswer(null);
      setTabError(null);
      resetQuizAnswers();
    }
  };

  const selectDoc = (id: string) => {
    setSelectedDocId(id);
    setRagAnswer(null);
    setTabError(null);
    resetQuizAnswers();
  };

  /* ---------------- Derived values ---------------- */

  const isBusyHere = (tab: GenTab) => isGenerating && generatingTab === tab && generatingDocId === selectedDocId;
  const errorFor = (tab: GenTab) => (tabError && tabError.tab === tab ? tabError.message : null);

  const mcqIndexes = quiz ? quiz.questions.map((q, i) => (q.type === 'mcq' ? i : -1)).filter(i => i >= 0) : [];
  const allMcqAnswered = mcqIndexes.every(i => userAnswers[i] !== undefined);
  const mcqCorrect = quiz ? mcqIndexes.filter(i => Number(userAnswers[i]) === quiz.questions[i].correctIndex).length : 0;
  const hasWritten = quiz ? quiz.questions.some(q => q.type !== 'mcq') : false;
  const totalMarks = quiz ? quiz.questions.reduce((n, q) => n + q.marks, 0) : 0;

  /* ---------------- Render ---------------- */

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 font-sans">

      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-600" /> PDF Intelligence (Powered by {PROVIDERS[provider].label})
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Upload real PDFs. Extract text. Generate grounded summaries, formulas, and interactive exams.
          </p>
        </div>

        <div className="flex items-start gap-4">
          {showKeyInput ? (
            <div className="flex flex-col gap-1.5 w-96">
              <div className="flex items-center gap-2">
                <select
                  value={cfg.provider}
                  onChange={(e) => changeProvider(e.target.value as ProviderId)}
                  className="flex-1 bg-slate-100 border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-700"
                >
                  {PROVIDER_IDS.map(id => (
                    <option key={id} value={id}>{PROVIDERS[id].label}</option>
                  ))}
                </select>
                {cfg.provider === 'gemini' && (
                  <select
                    value={cfg.speed}
                    onChange={(e) => changeSpeed(e.target.value as Speed)}
                    title="Fast uses the quickest Gemini model first. Quality uses the smartest one first."
                    className="bg-slate-100 border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-700"
                  >
                    <option value="fast">Fast</option>
                    <option value="quality">Quality</option>
                  </select>
                )}
              </div>
              <p className="text-[10px] text-slate-500 leading-snug">
                {PROVIDERS[cfg.provider].note} Get a key: {PROVIDERS[cfg.provider].keyHelp}
              </p>
              {cfg.provider === 'custom' && (
                <input
                  type="text"
                  placeholder="Base URL, e.g. https://api.groq.com/openai/v1"
                  value={cfg.baseUrl}
                  onChange={(e) => updateCfg({ baseUrl: e.target.value })}
                  className="bg-slate-100 border border-slate-300 rounded-lg px-3 py-1.5 text-xs outline-none"
                />
              )}
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-300">
                <Key className="w-4 h-4 text-slate-500 ml-2" />
                <input
                  type="password"
                  placeholder={PROVIDERS[cfg.provider].keyPlaceholder}
                  value={cfg.apiKey}
                  onChange={(e) => updateCfg({ apiKey: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') testApiKey(); }}
                  className="bg-transparent text-xs outline-none flex-1 min-w-0"
                />
                <button
                  onClick={testApiKey}
                  disabled={keyStatus === 'testing'}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold text-white transition-colors ${
                    keyStatus === 'valid' ? 'bg-emerald-600' :
                    keyStatus === 'invalid' ? 'bg-red-600' : 'bg-slate-800'
                  }`}
                >
                  {keyStatus === 'testing' ? 'Testing...' :
                   keyStatus === 'valid' ? 'Verified!' :
                   keyStatus === 'invalid' ? 'Retry' : 'Verify Key'}
                </button>
              </div>
              <input
                type="text"
                list="ai-model-list"
                placeholder={`Model: ${PROVIDERS[cfg.provider].defaultModel || 'automatic (recommended)'}`}
                value={cfg.model}
                onChange={(e) => updateCfg({ model: e.target.value })}
                className="bg-slate-100 border border-slate-300 rounded-lg px-3 py-1.5 text-xs outline-none"
              />
              <datalist id="ai-model-list">
                {modelList.map(m => <option key={m} value={m} />)}
              </datalist>
              {keyError && (
                <p className="text-[10px] text-red-500 break-words leading-snug">{keyError}</p>
              )}
              {keyLog.length > 0 && (
                <pre className="text-[10px] leading-snug text-slate-600 bg-slate-100 border border-slate-300 rounded p-2 whitespace-pre-wrap break-words">{keyLog.join('\n')}</pre>
              )}
            </div>
          ) : (
            <span
              className="text-xs font-semibold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 cursor-pointer"
              onClick={() => setShowKeyInput(true)}
              title="Click to change provider, key or model"
            >
              <CheckCircle2 className="w-3 h-3" /> API Key Active · {PROVIDERS[cfg.provider].label}
              {(cfg.model.trim() || PROVIDERS[cfg.provider].defaultModel) ? ` · ${cfg.model.trim() || PROVIDERS[cfg.provider].defaultModel}` : ''}
            </span>
          )}

          <label className="cursor-pointer bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm transition-all">
            <UploadCloud className="w-4 h-4" /> Upload Document
            <input type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden p-6 gap-6">

        {/* Left Column: Document List */}
        <div className="w-80 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden shrink-0">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Your Library</span>
            <span className="text-xs font-semibold text-slate-500">{documents.length} Files</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                onClick={() => selectDoc(doc.id)}
                className={`p-3 rounded-xl border transition-all cursor-pointer relative group ${
                  doc.id === selectedDocId ? 'border-amber-500 bg-amber-50/60 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <FileText className={`w-5 h-5 shrink-0 mt-0.5 ${doc.id === selectedDocId ? 'text-amber-600' : 'text-slate-400'}`} />
                  <div className="flex-1 min-w-0 pr-6">
                    <p className="text-xs font-bold text-slate-800 truncate">{doc.name}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{doc.pages} pages • {doc.size}</p>
                    <div className="mt-2 flex items-center justify-between">
                      {doc.status === 'Ready' ? (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Extracted</span>
                      ) : doc.status === 'Error' ? (
                        <span className="text-[10px] font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full flex items-center gap-1"><X className="w-3 h-3" /> Error</span>
                      ) : (
                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1"><Clock className="w-3 h-3 animate-spin" /> {doc.status}</span>
                      )}
                    </div>
                  </div>
                </div>
                <button onClick={(e) => handleDelete(e, doc.id)} className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: AI Workspace */}
        <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          {selectedDoc ? (
            <>
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-slate-900 truncate">{selectedDoc.name}</h2>
                  <p className="text-[11px] text-slate-500">
                    {selectedDoc.status === 'Ready'
                      ? `Text extracted · ${selectedDoc.pages} pages · ~${Math.round(selectedDoc.textContent.split(/\s+/).length / 100) * 100} words`
                      : selectedDoc.status === 'Error' ? 'Could not read this file' : 'Extracting text...'}
                  </p>
                </div>
                <div className="flex gap-1 bg-slate-200 p-1 rounded-lg text-xs font-semibold shrink-0">
                  <button onClick={() => openTab('qa')} className={`px-3 py-1 rounded-md transition-all ${activeTab === 'qa' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>Ask FRIDAY</button>
                  <button onClick={() => openTab('summary')} className={`px-3 py-1 rounded-md transition-all ${activeTab === 'summary' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>Summary</button>
                  <button onClick={() => openTab('formulas')} className={`px-3 py-1 rounded-md transition-all ${activeTab === 'formulas' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>Formulas</button>
                  <button onClick={() => openTab('questions')} className={`px-3 py-1 rounded-md transition-all ${activeTab === 'questions' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>Practice Quiz</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">

                {selectedDoc.status === 'Error' && <ErrorPanel message={selectedDoc.errorMsg || 'Could not read this PDF.'} />}
                {selectedDoc.status !== 'Ready' && selectedDoc.status !== 'Error' && <LoadingPanel text="Extracting text from your PDF..." />}

                {selectedDoc.status === 'Ready' && activeTab === 'qa' && (
                  <div className="max-w-3xl mx-auto space-y-6">
                    <form onSubmit={handleRagSearch} className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                        <input
                          type="text"
                          value={ragQuery}
                          onChange={(e) => setRagQuery(e.target.value)}
                          placeholder={`Ask a question about ${selectedDoc.name}...`}
                          className="w-full pl-9 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                      <button type="submit" disabled={isSearching} className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm disabled:opacity-50">
                        <Send className="w-3.5 h-3.5" /> {isSearching ? 'Thinking...' : 'Ask FRIDAY'}
                      </button>
                    </form>

                    {ragAnswer !== null && (
                      <div className="p-5 bg-amber-500/10 border-l-4 border-amber-600 rounded-xl space-y-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                          <Sparkles className="w-4 h-4 text-amber-600" /> FRIDAY
                          {isSearching && <Clock className="w-3 h-3 animate-spin text-amber-600" />}
                        </div>
                        {ragAnswer ? <Markdown text={ragAnswer} /> : <p className="text-xs text-slate-500">Reading the document...</p>}
                      </div>
                    )}
                  </div>
                )}

                {selectedDoc.status === 'Ready' && activeTab === 'summary' && (
                  <div className="max-w-4xl mx-auto">
                    {docResults.summary ? (
                      <div>
                        <div className="flex items-center justify-between">
                          {isBusyHere('summary')
                            ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700"><Clock className="w-3.5 h-3.5 animate-spin" /> Writing...</span>
                            : <span />}
                          <button onClick={() => runGeneration('summary')} disabled={isGenerating} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-50">
                            <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                          </button>
                        </div>
                        {errorFor('summary') && <ErrorPanel message={errorFor('summary')!} onRetry={() => runGeneration('summary')} />}
                        <Markdown text={docResults.summary} />
                      </div>
                    ) : errorFor('summary') ? (
                      <ErrorPanel message={errorFor('summary')!} onRetry={() => runGeneration('summary')} />
                    ) : isBusyHere('summary') ? (
                      <LoadingPanel
                        text="FRIDAY is reading the document..."
                        sub={progress || 'The summary appears here as soon as it starts writing.'}
                      />
                    ) : (
                      <p className="text-sm text-slate-500">Summary not generated yet.</p>
                    )}
                  </div>
                )}

                {selectedDoc.status === 'Ready' && activeTab === 'formulas' && (
                  <div className="max-w-4xl mx-auto">
                    {docResults.formulas ? (() => {
                      const fr = docResults.formulas!;
                      return (
                        <div className="space-y-5">
                          {fr.partial && (
                            <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                              <Clock className="w-3.5 h-3.5 animate-spin" /> {progress || 'Scanning the document for formulas...'}
                            </div>
                          )}
                          {!fr.partial && (fr.failed ?? 0) > 0 && (
                            <div className="flex items-center justify-between gap-3 text-xs text-orange-800 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                              <span>{fr.failed} of {fr.total} parts of the document could not be scanned, so some formulas may be missing.</span>
                              <button onClick={() => runGeneration('formulas')} disabled={isGenerating} className="font-semibold underline disabled:opacity-50">Scan again</button>
                            </div>
                          )}
                          {fr.hasFormulas ? (
                            <>
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-slate-600">
                                  {fr.formulas.length} formula{fr.formulas.length === 1 ? '' : 's'} found in "{selectedDoc.name}"
                                </p>
                                <button onClick={() => runGeneration('formulas')} disabled={isGenerating} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-50">
                                  <RefreshCw className="w-3.5 h-3.5" /> Re-scan
                                </button>
                              </div>
                              {fr.formulas.map((f, i) => <FormulaCard key={i} f={f} index={i} />)}
                            </>
                          ) : fr.partial ? null : (
                            <div className="max-w-xl mx-auto my-10 p-6 border border-slate-200 rounded-xl bg-slate-50 text-center space-y-2">
                              <p className="text-sm font-bold text-slate-800">No formulas found</p>
                              <p className="text-xs text-slate-600 leading-relaxed">
                                There are no formulas or equations in "{selectedDoc.name}". If you expected some, the equations may be stored as images in the PDF, which text extraction cannot read.
                              </p>
                              <button onClick={() => runGeneration('formulas')} disabled={isGenerating} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-50">
                                <RefreshCw className="w-3.5 h-3.5" /> Scan again
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })() : errorFor('formulas') ? (
                      <ErrorPanel message={errorFor('formulas')!} onRetry={() => runGeneration('formulas')} />
                    ) : isBusyHere('formulas') ? (
                      <LoadingPanel text="Checking the document for formulas..." sub={progress} />
                    ) : (
                      <p className="text-sm text-slate-500">Formulas not generated yet.</p>
                    )}
                  </div>
                )}

                {selectedDoc.status === 'Ready' && activeTab === 'questions' && (
                  <div className="max-w-4xl mx-auto space-y-6">
                    {isBusyHere('quiz') ? (
                      <LoadingPanel text="Setting your practice paper..." sub={progress || 'Questions are drawn from the whole document.'} />
                    ) : !quiz ? (
                      <div className="space-y-5">
                        {errorFor('quiz') && <ErrorPanel message={errorFor('quiz')!} />}
                        <div className="bg-slate-50 border border-slate-200 p-6 rounded-xl space-y-5">
                          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Settings2 className="w-4 h-4 text-amber-600" /> Set up your exam</h3>

                          <div className="space-y-2">
                            <p className="text-xs font-bold text-slate-700">Who is it for?</p>
                            <div className="flex flex-wrap gap-2">
                              {AUDIENCES.map(a => (
                                <Chip key={a.id} active={qCfg.audience === a.id} onClick={() => setQCfg(c => ({ ...c, audience: a.id }))}>{a.label}</Chip>
                              ))}
                            </div>
                          </div>

                          {qCfg.audience === 'school' && (
                            <div className="space-y-2">
                              <p className="text-xs font-bold text-slate-700">Which class?</p>
                              <div className="flex flex-wrap gap-2">
                                {CLASSES.map(n => (
                                  <Chip key={n} active={qCfg.classLevel === n} onClick={() => setQCfg(c => ({ ...c, classLevel: n }))}>Class {n}</Chip>
                                ))}
                              </div>
                            </div>
                          )}
                          {qCfg.audience === 'undergraduate' && (
                            <div className="space-y-2">
                              <p className="text-xs font-bold text-slate-700">Which year?</p>
                              <div className="flex flex-wrap gap-2">
                                {UG_YEARS.map(y => (
                                  <Chip key={y} active={qCfg.ugYear === y} onClick={() => setQCfg(c => ({ ...c, ugYear: y }))}>{y}</Chip>
                                ))}
                              </div>
                            </div>
                          )}
                          {qCfg.audience === 'postgraduate' && (
                            <div className="space-y-2">
                              <p className="text-xs font-bold text-slate-700">Which year?</p>
                              <div className="flex flex-wrap gap-2">
                                {PG_YEARS.map(y => (
                                  <Chip key={y} active={qCfg.pgYear === y} onClick={() => setQCfg(c => ({ ...c, pgYear: y }))}>{y}</Chip>
                                ))}
                              </div>
                            </div>
                          )}
                          {qCfg.audience === 'competitive' && (
                            <div className="space-y-2">
                              <p className="text-xs font-bold text-slate-700">Which exam?</p>
                              <div className="flex flex-wrap gap-2">
                                {EXAMS.map(x => (
                                  <Chip key={x} active={qCfg.exam === x} onClick={() => setQCfg(c => ({ ...c, exam: x }))}>{x}</Chip>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="space-y-2">
                            <p className="text-xs font-bold text-slate-700">Paper difficulty</p>
                            <div className="flex flex-wrap gap-2">
                              {DIFFICULTIES.map(d => (
                                <Chip key={d.id} active={qCfg.difficulty === d.id} onClick={() => setQCfg(c => ({ ...c, difficulty: d.id }))}>{d.label}</Chip>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <p className="text-xs font-bold text-slate-700">Question type</p>
                            <div className="flex flex-wrap gap-2">
                              {QUESTION_TYPES.map(t => (
                                <Chip key={t.id} active={qCfg.questionType === t.id} hint={t.hint} onClick={() => setQCfg(c => ({ ...c, questionType: t.id }))}>{t.label}</Chip>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <p className="text-xs font-bold text-slate-700">How many questions? (1-30)</p>
                            <div className="flex flex-wrap items-center gap-2">
                              {[5, 10, 15, 20].map(n => (
                                <Chip key={n} active={qCfg.count === n} onClick={() => setQCfg(c => ({ ...c, count: n }))}>{n}</Chip>
                              ))}
                              <input
                                type="number"
                                min={1}
                                max={30}
                                value={qCfg.count || ''}
                                onChange={(e) => setQCfg(c => ({ ...c, count: Number(e.target.value) }))}
                                className="w-20 bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs"
                              />
                            </div>
                          </div>

                          <button onClick={() => runGeneration('quiz')} disabled={isGenerating} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg text-xs font-bold shadow-sm disabled:opacity-50">
                            Generate Practice Paper
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="flex flex-wrap justify-between items-center gap-2 border-b pb-2">
                          <div>
                            <h3 className="text-lg font-bold text-slate-900">Practice Paper</h3>
                            <p className="text-xs font-semibold text-amber-600">{quiz.label} · {totalMarks} marks</p>
                            {quiz.note && <p className="text-[11px] text-orange-700 mt-0.5">{quiz.note}</p>}
                          </div>
                          <button
                            onClick={() => { setResults(prev => ({ ...prev, [selectedDocId]: { ...prev[selectedDocId], quiz: undefined } })); resetQuizAnswers(); }}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
                          >
                            <Settings2 className="w-3.5 h-3.5" /> Change settings
                          </button>
                        </div>

                        {quiz.questions.map((q, idx) => {
                          const isMcq = q.type === 'mcq';
                          const mcqRight = isMcq && Number(userAnswers[idx]) === q.correctIndex;
                          const ev = evals[idx];
                          return (
                            <div key={idx} className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-sm font-bold text-slate-800">{idx + 1}. {q.question}</p>
                                <span className="shrink-0 text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                  {q.marks} mark{q.marks === 1 ? '' : 's'}
                                </span>
                              </div>

                              {isMcq ? (
                                <div className="space-y-2">
                                  {(q.options ?? []).map((opt, oIdx) => {
                                    const chosen = userAnswers[idx] === String(oIdx);
                                    const showRight = quizSubmitted && oIdx === q.correctIndex;
                                    const showWrong = quizSubmitted && chosen && oIdx !== q.correctIndex;
                                    return (
                                      <label
                                        key={oIdx}
                                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border ${
                                          showRight ? 'border-emerald-500 bg-emerald-50' :
                                          showWrong ? 'border-red-400 bg-red-50' :
                                          chosen ? 'border-amber-500 bg-amber-50' : 'border-transparent hover:bg-slate-50'
                                        }`}
                                      >
                                        <input
                                          type="radio"
                                          name={`q${idx}`}
                                          checked={chosen}
                                          onChange={() => setUserAnswers(prev => ({ ...prev, [idx]: String(oIdx) }))}
                                          disabled={quizSubmitted}
                                          className="w-4 h-4 text-amber-600"
                                        />
                                        <span className="text-xs text-slate-700"><b>{String.fromCharCode(65 + oIdx)}.</b> {opt}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              ) : (
                                <textarea
                                  value={userAnswers[idx] ?? ''}
                                  onChange={(e) => setUserAnswers(prev => ({ ...prev, [idx]: e.target.value }))}
                                  disabled={quizSubmitted}
                                  rows={q.type === 'long' ? 7 : 3}
                                  placeholder="Write your answer here..."
                                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                              )}

                              {quizSubmitted && isMcq && (
                                <div className={`mt-3 p-3 rounded-lg text-xs ${mcqRight ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                                  <p className="flex items-center gap-2 font-bold">
                                    {mcqRight ? <><Check className="w-4 h-4" /> Correct!</> : <><X className="w-4 h-4" /> Incorrect. Correct answer: {String.fromCharCode(65 + (q.correctIndex ?? 0))}. {q.options?.[q.correctIndex ?? 0]}</>}
                                  </p>
                                  {q.explanation && <p className="mt-1 leading-relaxed">{q.explanation}</p>}
                                  {q.page ? <p className="mt-1 opacity-75">Source: page {q.page}</p> : null}
                                </div>
                              )}

                              {quizSubmitted && !isMcq && (
                                <div className="mt-3 space-y-3">
                                  <div className="p-3 rounded-lg text-xs bg-slate-50 border border-slate-200 text-slate-800 space-y-2">
                                    <p className="font-bold">Model answer</p>
                                    <p className="leading-relaxed whitespace-pre-wrap">{q.answer}</p>
                                    {q.keyPoints && q.keyPoints.length > 0 && (
                                      <>
                                        <p className="font-bold pt-1">Marking points</p>
                                        <ul className="list-disc pl-5 space-y-0.5">
                                          {q.keyPoints.map((k, i) => <li key={i}>{k}</li>)}
                                        </ul>
                                      </>
                                    )}
                                    {q.explanation && <p className="pt-1 leading-relaxed">{q.explanation}</p>}
                                    {q.page ? <p className="opacity-75">Source: page {q.page}</p> : null}
                                  </div>

                                  {ev?.score !== undefined ? (
                                    <div className="p-3 rounded-lg text-xs bg-amber-50 border border-amber-200 text-amber-900">
                                      <p className="font-bold">AI score: {ev.score} / {ev.outOf}</p>
                                      <p className="mt-1 leading-relaxed">{ev.feedback}</p>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-3">
                                      <button
                                        onClick={() => evaluateAnswer(idx, q)}
                                        disabled={ev?.loading}
                                        className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                                      >
                                        {ev?.loading ? 'Checking...' : 'Check my answer with AI'}
                                      </button>
                                      {ev?.error && <span className="text-[11px] text-red-600">{ev.error}</span>}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {quizSubmitted && mcqIndexes.length > 0 && (
                          <div className="p-4 rounded-xl bg-slate-800 text-white text-sm font-bold">
                            MCQ score: {mcqCorrect} / {mcqIndexes.length}
                            {hasWritten && <span className="block text-xs font-normal mt-1 opacity-80">Use "Check my answer with AI" on the written questions to get marks for them.</span>}
                          </div>
                        )}

                        {!quizSubmitted ? (
                          <button
                            onClick={() => setQuizSubmitted(true)}
                            disabled={!allMcqAnswered}
                            className="w-full bg-amber-600 hover:bg-amber-700 text-white py-3 rounded-xl font-bold shadow-sm disabled:opacity-50"
                          >
                            {allMcqAnswered ? 'Submit Answers' : 'Answer every MCQ to submit'}
                          </button>
                        ) : (
                          <button onClick={() => runGeneration('quiz')} disabled={isGenerating} className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold shadow-sm disabled:opacity-50">
                            Generate a New Paper (same settings)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs space-y-4">
              <FileText className="w-12 h-12 text-slate-300" />
              <p>No document selected. Upload a PDF to begin real AI analysis.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}