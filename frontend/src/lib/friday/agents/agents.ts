/**
 * The eight FRIDAY agents. Each one is a function from (task, guard, deps) to a typed result. They never call tools directly:
 * every tool use goes through `guard.use`, which enforces that agent's permissions and its step/time budget and writes the trace.
 */
import { tokens } from '../../textTools';
import { parseCommandless } from './util';
import { Guard } from './core';
import type { AgentName, Board, Citation, Task } from './core';
import type { Retriever, Passage, Hit } from './retrieval';
import { toCitation } from './retrieval';
import { sanitize, wrapData, DATA_NOTICE } from './sanitize';
import { recomputeClaims, fixClaims, sampleAndAgree, jaccard, UNSURE } from './verify';
import type { CodeRunner } from './sandbox';
import type { Deck } from './tutor';
import { cardsFromText, parseExam } from './tutor';
import type { Journal } from './journal';
import type { VFS } from '../vfs';
import type { Reminders } from './reminders';
import { parseReminder } from './reminders';
import type { Tier } from './tiers';
import { tierFor } from './tiers';

export interface MemoryLike { recall(q: string, k: number): { text: string }[]; add(text: string, kind: 'fact' | 'preference' | 'episode'): unknown; forget(q: string): number; all(): { id: string; kind: string; text: string; t: number }[]; remove(id: string): void }
export interface Deps {
  now: () => number;
  llm?: (prompt: string, o?: { tier?: Tier; json?: boolean; temperature?: number }) => Promise<string | null>;
  retriever: () => Promise<Retriever>;
  calc: (e: string) => number | null;
  runCode: CodeRunner;
  memory: MemoryLike;
  deck: Deck;
  reminders?: Reminders;
  sim?: { run(cmd: string): Promise<{ ok: boolean; message: string }>; read(): string };
  fs?: { vfs: VFS; journal: Journal };
  confirm?: (why: string[]) => Promise<boolean>;
  offline?: (q: string) => { text: string; found: boolean };
  extractFacts: (msg: string) => { facts: string[]; explicit: boolean };
  persona?: string; style?: string; deep?: boolean; pinned?: Passage[]; // pinned = material the user attached to this question (an image's text/description)
}
export interface Out { text: string; data?: unknown; citations?: Citation[]; confidence?: number; flags?: string[] }
export interface Ctx { task: Task; guard: Guard; deps: Deps; board: Board; goal: string }
export type AgentFn = (c: Ctx) => Promise<Out>;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const tierOf = (g: string): Tier => tierFor(g);

/* ---------------- Planner ---------------- */
export interface PlanItem { agent: AgentName; goal: string; deps: string[]; why: string }
const MATH = /\d\s*[-+*/×÷^%]\s*\d|\d+\s*(?:!|%)|\b(?:sqrt|sin|cos|tan|ln|log)\b\s*\(?\d|\b\d+(?:\.\d+)?\s*(?:choose|factorial|squared|cubed)\b|\b(?:factorial|derivative|integral|integrate|differentiate)\b/i;
export function planRules(goal: string): PlanItem[] {
  const g = goal.trim(); const items: PlanItem[] = []; const add = (agent: AgentName, why: string, deps: string[] = [], gl = g) => { items.push({ agent, goal: gl, deps, why }); return `t${items.length}`; };
  const code = /```|\b(?:run|execute)\s+(?:this|the)\s+(?:code|script|program)\b/i.test(g);
  const solve = code || MATH.test(g) || /\b(?:calculate|compute|evaluate|simplify|convert|how much|how many|solve|work out)\b/i.test(g) && /\d/.test(g);
  const sim = /\bopen\b[^.]{0,60}\b(?:then|and then|and|,)\s*(?:set|change|increase|decrease|play|pause|reset)\b|\bset\b[^.]{0,30}\bto\s+-?\d(?!.*\b(?:alarm|reminder|exam)\b)(?=[^.]*\b(?:slider|noise|gain|frequency|amplitude|angle|mass|speed|voltage|temperature|rate|value|parameter)\b)|\b(?:open|launch|load|start|run)\b[^.]{0,40}\b(?:simulation|simulator|sim)\b|\bset\b[^.]{0,40}\bto\b\s*-?\d[^.]{0,40}\b(?:simulation|sim)\b|\bin (?:the )?(?:\w+ ){0,3}(?:simulation|sim)\b.*\bset\b/i.test(g);
  const remind = /\bremind me\b/i.test(g); const exam = /\b(?:exam|test|quiz|midterm)\b.*\b(?:on|in|is|tomorrow|today|next|this)\b/i.test(g) && /\bmy\b/i.test(g);
  const tutor = remind || exam || /\b(?:quiz me|test me|flash ?cards?|revis(?:e|ion)|practi[sc]e|study plan|review (?:my|the)|what should i (?:study|revise)|weak|my mistakes|spaced|due cards?)\b/i.test(g);
  const write = /\b(?:write|save|create|draft|make|put|organi[sz]e)\b[^.]{0,60}\b(?:notes?|page|file|summary|report|document|cheat ?sheet)\b[^.]{0,40}\b(?:in|to|into|as|called|named|file|folder|notebook)\b|\bsave (?:this|that|it|the answer)\b/i.test(g);
  const heavySolve = solve && !/\b(?:notes?|pdf|lecture|according to|my documents)\b/i.test(g);
  const research = (!solve && !sim && !tutor) || /\b(?:notes?|pdfs?|lectures?|documents?|textbook|sources?|according to|cite|what is|what are|define|explain|why|how does|summari[sz]e|find)\b/i.test(g) && !heavySolve && !tutor;
  const first: string[] = [];
  if (research) first.push(add('researcher', 'knowledge question: search your notes, PDFs and memory'));
  if (solve) first.push(add('solver', 'contains something to compute or run'));
  if (sim) first.push(add('simop', 'asks to operate a simulation'));
  if (tutor) first.push(add('tutor', 'study request: cards, quiz, schedule or exam'));
  const critic = add('critic', 'verify against sources and recompute numbers', first);
  if (write) add('scribe', 'asks to write the result into the notebook or a file', [critic]);
  add('memory', 'decide what to remember, update or forget', [critic]);
  return items;
}
export const AGENT_SET = new Set<AgentName>(['researcher', 'tutor', 'solver', 'simop', 'scribe', 'critic', 'memory']);
/** Accept a model-written plan only if it is well-formed: known agents, acyclic deps, critic present and last-but-memory. */
export function validateModelPlan(raw: unknown, goal: string): PlanItem[] | null {
  const steps = (raw as { steps?: unknown })?.steps; if (!Array.isArray(steps) || steps.length < 1 || steps.length > 7) return null;
  const items: PlanItem[] = []; for (const s of steps as { agent?: string; goal?: string; after?: number[]; why?: string }[]) {
    if (!s || typeof s.agent !== 'string' || !AGENT_SET.has(s.agent as AgentName)) return null; const deps = (Array.isArray(s.after) ? s.after : []).map(Number); if (deps.some(d => !Number.isInteger(d) || d < 1 || d > items.length)) return null; // only backwards references ⇒ acyclic
    items.push({ agent: s.agent as AgentName, goal: typeof s.goal === 'string' && s.goal.trim() ? s.goal.slice(0, 300) : goal, deps: deps.map(d => `t${d}`), why: String(s.why ?? 'planned by model').slice(0, 100) });
  }
  if (!items.some(i => i.agent === 'critic')) { const dep = items.map((_, i) => `t${i + 1}`).filter((_, i) => !['scribe', 'memory'].includes(items[i].agent)); items.push({ agent: 'critic', goal, deps: dep, why: 'verification is always required' }); }
  const ci = items.findIndex(i => i.agent === 'critic') + 1; items.forEach((i, k) => { if (i.agent === 'scribe' && !i.deps.includes(`t${ci}`)) i.deps.push(`t${ci}`); void k; });
  return items;
}
export const planner: AgentFn = async ({ guard, deps, goal }) => {
  const rules = planRules(goal); let plan = rules; let by = 'rules';
  if (deps.llm && goal.length > 60) {
    const p = `You are the Planner of FRIDAY. Split the REQUEST into steps and choose an agent for each. Agents: researcher (search notes/PDFs, cite), solver (compute maths / run code), simop (operate a simulation), tutor (flashcards, quiz, exam, reminders), scribe (write notes/files), critic (verify; always last of the thinking steps), memory.\nReturn ONLY JSON {"steps":[{"agent":"researcher","goal":"...","after":[],"why":"..."}]} where "after" lists earlier step numbers (1-based). Independent steps have empty "after" so they run in parallel.\nREQUEST: ${goal}\nJSON:`;
    try { const r = await guard.use('llm', p, () => deps.llm!(p, { tier: 'fast', json: true })); if (r) { const m = validateModelPlan(JSON.parse(r.replace(/^```json|```$/g, '').trim()), goal); if (m) { plan = m; by = 'model'; } } } catch { /* rules are the fallback */ }
  }
  return { text: plan.map((p, i) => `${i + 1}. ${p.agent} — ${p.why}`).join('\n'), data: { plan, by }, confidence: 0.9 };
};

/* ---------------- Researcher ---------------- */
export const researcher: AgentFn = async ({ guard, deps, goal }) => {
  const mem = await guard.use('memory.read', 'recall memory', () => deps.memory.recall(goal, 3));
  const retr = await deps.retriever(); const found = await guard.use('retrieve', `search: ${goal}`, () => retr.search(goal, 5)); const pins: Hit[] = (deps.pinned ?? []).map(p => ({ passage: p, score: 0.9, quote: p.text.slice(0, 200), via: ['attached'] })); const hits = [...pins, ...found.filter(h => !pins.some(p => p.passage.id === h.passage.id))].slice(0, 6);
  const flags: string[] = []; const clean = hits.map(h => { const c = sanitize(h.passage.text); if (c.flags.length) { flags.push(`untrusted text in “${h.passage.title}” was neutralised (${c.flags.join(', ')})`); guard.flag(`injection-like text in ${h.passage.title}: ${c.flags.join(', ')}`); } return { h, text: c.text }; });
  const citations = hits.map((h, i) => toCitation(h, i + 1)); const evidence = clean.map(c => c.text);
  const top = hits[0]?.score ?? 0; let text = '', conf = 0;
  if (deps.llm) {
    const prompt = [deps.persona ?? 'You are FRIDAY, a careful study assistant.', DATA_NOTICE, deps.style ? `STYLE: ${deps.style}` : '', mem.length ? `WHAT YOU REMEMBER ABOUT THE USER:\n${mem.map(m => '- ' + m.text).join('\n')}` : '',
      hits.length ? `SOURCES (cite as [1], [2] … ; use only these; say so if they do not answer the question):\n${clean.map((c, i) => wrapData(`[${i + 1}] ${c.h.passage.title}${c.h.passage.where ? ' · ' + c.h.passage.where : ''}`, c.text.slice(0, 1400))).join('\n')}` : 'No local sources matched. Answer from general knowledge and say that no notes or PDFs were used.', `QUESTION: ${goal}`, 'ANSWER:'].filter(Boolean).join('\n\n');
    const r = await guard.use('llm', prompt, () => deps.llm!(prompt, { tier: tierOf(goal) })); if (r?.trim()) { text = r.trim().replace(/\[(\d+)\]/g, (m, n) => (+n >= 1 && +n <= hits.length ? m : '')); conf = hits.length ? Math.min(0.92, 0.45 + top * 0.8) : 0.5; }
    if (text && deps.deep) { const rp = `Review the DRAFT answer to the user’s question for factual, mathematical or logical errors and for missing steps. Return only the corrected, final answer in the same style (no commentary about the review).\n\nQUESTION: ${goal}\n\nDRAFT:\n${text}`; const r2 = await guard.use('llm', rp, () => deps.llm!(rp, { tier: 'deep' })).catch(() => null); if (r2?.trim()) text = r2.trim().replace(/\[(\d+)\]/g, (m, n) => (+n >= 1 && +n <= hits.length ? m : '')); }
  }
  const mine = (k: string) => k === 'note' || k === 'pdf' || k === 'file';
  if (!text && !deps.llm && deps.offline && !hits.some(h => mine(h.passage.kind))) { const o = deps.offline(goal); if (o.found && o.text) { text = o.text; conf = 0.6; } }
  if (!text && hits.length) { text = clean.slice(0, 3).map((c, i) => `From **${c.h.passage.title}**${c.h.passage.where ? ` (${c.h.passage.where})` : ''}: ${c.text.slice(0, 320)} [${i + 1}]`).join('\n\n'); conf = Math.min(0.85, 0.35 + top * 0.8); }
  if (!text && deps.offline) { const o = deps.offline(goal); if (o.found && o.text) { text = o.text; conf = 0.55; } }
  return { text, data: { evidence, hits: hits.length, injected: flags.length > 0 }, citations, confidence: text ? conf : 0, flags };
};

/* ---------------- Solver ---------------- */
function exprOf(goal: string): string | null {
  const m = goal.replace(/[?]+$/, '').replace(/\b(?:calculate|compute|evaluate|what(?:'s| is)|work out|solve|simplify|please|find|the value of|value of)\b/gi, ' ').replace(/(\d)\s*(?:x|×)\s*(\d)/g, '$1*$2').replace(/×/g, '*').replace(/÷/g, '/').replace(/\bsquared\b/g, '^2').replace(/\bcubed\b/g, '^3').replace(/\s+/g, ' ').trim();
  return /\d/.test(m) && /^[\d\s.+\-*/^()%!a-z,πe]+$/i.test(m) && m.length < 120 ? m : null;
}
const PERCENT_OF = /(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/i;
export const solver: AgentFn = async ({ guard, deps, goal }) => {
  const flags: string[] = []; const block = goal.match(/```(?:js|javascript|ts|typescript)?\n?([\s\S]*?)```/i);
  if (block) { const r = await guard.use('code.run', 'run code block', () => deps.runCode(block[1], 4000)); return { text: r.ok ? `Ran your code in a sandbox (${r.ms} ms).${r.out ? '\n```\n' + r.out + '\n```' : ''}${r.value !== undefined ? `\nReturned: \`${r.value}\`` : ''}` : `The code failed in the sandbox: ${r.error}`, data: { value: r.value, out: r.out, computed: r.ok, code: block[1] }, confidence: r.ok ? 0.9 : 0.2, flags: r.timedOut ? ['code stopped by the time limit'] : [] }; }
  const pm = goal.match(PERCENT_OF); const expr = pm ? `${pm[1]}/100*${pm[2]}` : exprOf(goal);
  if (expr) { try { const v = await guard.use('calc', `calc ${expr}`, () => deps.calc(expr!)); if (v !== null && Number.isFinite(v)) { const val = Number(v.toPrecision(12)); return { text: `**${(pm ? goal.match(PERCENT_OF)![0] : expr).trim()} = ${val}**  (computed by the calculator, not recalled)`, data: { expr, value: val, computed: true }, confidence: 0.97 }; } } catch { /* fall through to code */ } }
  if (deps.llm) {
    const prompt = `Write a JavaScript snippet that COMPUTES the answer to the task below. Output ONLY code, no fences, no prose. Use console.log for the final numeric answer on the last line. No network, no imports.\nTASK: ${goal}`;
    const ag = await sampleAndAgree(async () => { const code = await guard.use('llm', prompt, () => deps.llm!(prompt, { tier: 'deep', temperature: 0.7 })); if (!code) return null; const src = code.replace(/^```(?:js|javascript)?\n?|```$/gm, '').trim(); const r = await guard.use('code.run', 'run generated code', () => deps.runCode(src, 4000)); return r.ok ? (r.out.split('\n').filter(Boolean).pop() ?? r.value ?? null) : null; }, 3, { threshold: 0.6 });
    if (ag.answer) { if (ag.unsure) flags.push(`the ${ag.samples.length} computed samples disagreed (${ag.clusters} different results)`); return { text: `**${ag.answer}**  (computed by running code in a sandbox; ${Math.round(ag.agreement * 100)}% of ${ag.samples.length} runs agreed)`, data: { value: ag.answer, computed: true, agreement: ag.agreement, samples: ag.samples }, confidence: ag.unsure ? 0.3 : 0.5 + 0.45 * ag.agreement, flags }; }
    flags.push('the model’s code did not produce a result');
  }
  return { text: '', data: { computed: false }, confidence: 0, flags: [...flags, 'nothing to compute offline: connect a model to compute free-form problems'] };
};

/* ---------------- Sim Operator ---------------- */
export const simop: AgentFn = async ({ guard, deps, goal }) => {
  if (!deps.sim) return { text: '', confidence: 0, flags: ['simulations are not available here'] };
  const cmds = parseCommandless(goal); const log: string[] = []; let ok = true;
  for (const c of cmds) { const r = await guard.use('sim.control', c, () => deps.sim!.run(c)); log.push(`${r.ok ? '✓' : '✗'} ${c} — ${r.message.split('\n')[0].slice(0, 120)}`); if (!r.ok) { ok = false; break; } }
  const state = await guard.use('sim.control', 'read values', () => deps.sim!.read()); const readings = [...state.matchAll(/([A-Za-z][\w\s./()%°-]{1,40}?)\s*[:=]\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\s*[A-Za-z%°/µΩ]*)/g)].slice(0, 12).map(m => ({ name: m[1].trim(), value: m[2].trim() }));
  return { text: `${log.join('\n')}${readings.length ? '\n\nReadings:\n' + readings.map(r => `• ${r.name}: ${r.value}`).join('\n') : ''}`, data: { readings, commands: cmds }, confidence: ok ? (readings.length ? 0.9 : 0.7) : 0.3, flags: ok ? [] : ['a simulation step failed'] };
};

/* ---------------- Tutor ---------------- */
function topicOf(goal: string): string { const m = goal.match(/\b(?:on|about|for|in|of)\s+(?:my\s+|the\s+)?([a-z][a-z0-9\s&-]{2,40}?)(?:\s+(?:notes?|lectures?|pdfs?|chapter|exam|test|quiz|please|now|today)\b|[.?!,]|$)/i); return (m?.[1] ?? '').trim().replace(/\b(?:my|the)\b/g, '').trim(); }
export const tutor: AgentFn = async ({ guard, deps, goal }) => {
  const now = deps.now(); const topic = topicOf(goal); const lines: string[] = [];
  const rem = parseReminder(goal, now); if (rem && deps.reminders) { await guard.use('deck.write', 'set reminder', () => deps.reminders!.add(rem.text, rem.at)); return { text: `Reminder set: “${rem.text}” on ${new Date(rem.at).toLocaleString()}. I will show it when the app is open at that time; it cannot fire while the app is closed.`, data: { reminder: rem }, confidence: 0.95 }; }
  const ex = parseExam(goal, now); if (ex) { await guard.use('deck.write', 'save exam date', () => deps.deck.addExam(ex.topic, ex.at)); lines.push(`Noted: ${ex.topic} exam on ${new Date(ex.at).toLocaleDateString()}. I will nudge you about weak topics as it gets closer.`); }
  if (/\b(?:flash ?cards?|make cards|cards from)\b/i.test(goal) || (/\bquiz|test me|practi[sc]e\b/i.test(goal) && !deps.deck.cards().length)) {
    const retr = await deps.retriever(); const hits = await guard.use('retrieve', `material for ${topic || goal}`, () => retr.search(topic || goal, 6)); let n = 0; const t = topic || 'general';
    for (const h of hits) { const c = sanitize(h.passage.text); await guard.use('deck.write', `cards from ${h.passage.title}`, () => { n += deps.deck.add(cardsFromText(c.text, t, `${h.passage.title}${h.passage.where ? ' · ' + h.passage.where : ''}`, now)); }); if (n >= 24) break; }
    lines.push(n ? `Made ${n} flashcard${n === 1 ? '' : 's'} on ${t} from ${hits.length} source${hits.length === 1 ? '' : 's'}.` : 'I found no material to make flashcards from. Add notes or a PDF first.');
  }
  if (/\bquiz|test me|practi[sc]e\b/i.test(goal)) { const q = await guard.use('deck.read', 'build quiz', () => deps.deck.quiz(topic || null, 5, now)); if (q.length) { lines.push(q.map((x, i) => `${i + 1}. ${x.q}\n${x.options.map((o, k) => `   ${'ABCD'[k]}) ${o}`).join('\n')}`).join('\n\n')); return { text: lines.join('\n\n'), data: { quiz: q }, confidence: 0.85 }; } lines.push('Not enough flashcards to build a quiz yet.'); }
  if (/\b(?:weak|mistakes?|study plan|schedule|revis|review|what should i|due|spaced)\b/i.test(goal) || !lines.length) {
    const nud = await guard.use('deck.read', 'read mastery', () => deps.deck.nudges(now)); const due = deps.deck.due(now, 12); const mast = deps.deck.topics().map(t => deps.deck.mastery(t, now));
    lines.push(nud.length ? nud.map(n => '• ' + n).join('\n') : 'No flashcards or exams yet. Say “make flashcards from my notes on <topic>” or “my <topic> exam is on Friday”.');
    if (mast.length) lines.push('Mastery:\n' + mast.map(m => `• ${m.topic}: ${Math.round(m.mastery * 100)}% (${m.cards} cards, ${m.due} due${m.mistakes ? `, ${m.mistakes} mistakes` : ''})`).join('\n'));
    if (due.length) lines.push(`Study plan: ${due.length} card${due.length === 1 ? '' : 's'} for the next ~${Math.max(1, Math.round(due.length / 2))} min — open the Tutor tab.`);
  }
  return { text: lines.join('\n\n'), data: { topic }, confidence: 0.85 };
};

/* ---------------- Scribe ---------------- */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'note';
export const scribe: AgentFn = async ({ guard, deps, board, task, goal }) => {
  if (!deps.fs) return { text: '', confidence: 0, flags: ['no file system here'] };
  const src = board.depResults(task).find(t => t.agent === 'critic'); if (!src?.text) return { text: 'Nothing verified to write.', confidence: 0.3 };
  const named = goal.match(/\b(?:called|named|as)\s+["“']?([\w.-]+\.(?:md|txt))\b/i)?.[1] ?? goal.match(/(?<![\w/.-])([\w-]+\.(?:md|txt))\b/i)?.[1]; const title = (goal.match(/\b(?:on|about)\s+([a-z][\w\s-]{2,40}?)(?:\s+(?:in|to|into|as|and)\b|[.?!,]|$)/i)?.[1] ?? 'FRIDAY note').trim();
  const dir = /\bnotes?\b/i.test(goal) ? '/Notes' : '/Documents'; let path = named ? (named.startsWith('/') ? named : `${dir}/${named}`) : `${dir}/${slug(title)}.md`; const v = deps.fs.vfs; await v.ready();
  if (v.exists(path)) { const ok = deps.confirm ? await deps.confirm([`overwrite ${path}`]) : false; if (!ok) path = v.uniquePath(dirOf(path), path.slice(path.lastIndexOf('/') + 1)); }
  const body = `# ${title[0].toUpperCase() + title.slice(1)}\n\n${src.text}\n\n---\n_Written by FRIDAY (Scribe), ${new Date(deps.now()).toLocaleString()}_\n`;
  const j = await deps.fs.journal.begin(`Scribe wrote ${path}`); await guard.use('fs.write', `write ${path}`, () => v.writeText(path, body)); const e = await j.end();
  return { text: `Saved to **${path}**${e ? ' — say “undo” to revert' : ''}.`, data: { path, journal: e?.id }, confidence: 0.95 };
};
const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/')) || '/';

/* ---------------- Critic ---------------- */
const sentences = (t: string) => t.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
export const critic: AgentFn = async ({ guard, deps, board, task, goal }) => {
  const parts = board.depResults(task).filter(t => !['scribe', 'memory', 'planner'].includes(t.agent)); const flags: string[] = []; let conf = 1; const sections: string[] = []; let citations: Citation[] = [];
  const failed = board.all().filter(t => task.deps.includes(t.id) && t.status === 'failed'); for (const f of failed) { flags.push(`${f.agent} failed: ${f.error ?? 'error'}`); conf = Math.min(conf, 0.4); }
  const used = parts.filter(p => p.text?.trim()); if (!used.length) return { text: 'I could not find anything in your notes, PDFs or memory about that, and no calculation or action applied. Connect a model (Brain tab) or add the material and ask again.', confidence: 0.15, flags: [...flags, 'no evidence'], data: { unsure: true } };
  const nums: { agent: string; v: number }[] = [];
  for (const p of used) {
    let text = p.text!; let c = p.confidence ?? 0.6; let cap = 1;
    const rc = await guard.use('calc', `recompute numbers from ${p.agent}`, () => recomputeClaims(text, deps.calc)); if (rc.checked) { if (rc.wrong.length) { text = fixClaims(text, rc); flags.push(`${rc.wrong.length} arithmetic claim${rc.wrong.length === 1 ? '' : 's'} from ${p.agent} were wrong and were corrected by recomputation`); cap = Math.min(cap, 0.6); } else flags.push(`${rc.checked} calculation${rc.checked === 1 ? '' : 's'} from ${p.agent} re-verified`); }
    if (p.agent === 'solver') { const d = p.data as { expr?: string; value?: number | string; computed?: boolean }; if (d?.expr && typeof d.value === 'number') { const v2 = await guard.use('calc', `independent recompute ${d.expr}`, () => deps.calc(d.expr!)); if (v2 !== null && Math.abs(v2 - d.value) > 1e-9 * Math.max(1, Math.abs(v2))) { flags.push('solver result differs from independent recomputation'); cap = Math.min(cap, 0.3); } else c = Math.max(c, 0.95); } const fv = Number(String(d?.value ?? '').replace(/[^\d.eE+-]/g, '')); if (Number.isFinite(fv)) nums.push({ agent: 'solver', v: fv }); }
    if (p.agent === 'researcher') {
      const ev = (p.data as { evidence?: string[] })?.evidence ?? []; citations = [...citations, ...(p.citations ?? [])];
      if (ev.length) { const pool = new Set(tokens(ev.join(' '))); const ss = sentences(text).filter(s => tokens(s).length >= 5 && !/^\s*(?:from|sources?)\b/i.test(s)); const weak = ss.filter(s => { const t = tokens(s); return t.filter(w => pool.has(w)).length / t.length < 0.3; });
        if (ss.length && weak.length / ss.length > 0.6) { flags.push(`${weak.length} of ${ss.length} statements are not supported by the cited sources; showing the sources’ own words instead`); text = (p.citations ?? []).slice(0, 3).map(ci => `From **${ci.title}**${ci.where ? ` (${ci.where})` : ''}: ${ci.quote} [${ci.n}]`).join('\n\n'); cap = Math.min(cap, 0.55); }
        else if (weak.length) { flags.push(`${weak.length} statement${weak.length === 1 ? '' : 's'} could not be matched to a source`); cap = Math.min(cap, 0.7 - 0.05 * weak.length); } else if (ss.length) c = Math.max(c, 0.8); }
      else if (p.citations?.length === 0) { flags.push('answer is not grounded in your notes or PDFs'); cap = Math.min(cap, 0.55); }
      if ((p.data as { injected?: boolean })?.injected) flags.push('a source contained instruction-like text; it was treated as data and ignored');
    }
    conf = Math.min(conf, c, cap); sections.push(used.length > 1 ? `**${p.agent === 'solver' ? 'Computed' : p.agent === 'researcher' ? 'From your sources' : p.agent === 'simop' ? 'Simulation' : 'Study'}**\n${text}` : text);
  }
  const rText = used.find(p => p.agent === 'researcher')?.text ?? ''; const rNum = (rText.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number); const sol = nums[0];
  if (sol && rNum.length && !!rText && !rNum.some(x => Math.abs(x - sol.v) <= 1e-6 * Math.max(1, Math.abs(sol.v))) && /\b(?:equals?|=|is|result|answer)\b/i.test(rText)) { flags.push('the researcher’s figures do not match the computed value; the computed value is the one to trust'); conf = Math.min(conf, 0.45); }
  const seen = new Set<string>(); citations = citations.filter(c => { const k = `${c.title}|${c.where}`; return !seen.has(k) && seen.add(k); }).map((c, i) => ({ ...c, n: c.n ?? i + 1 }));
  let text = sections.join('\n\n'); const unsure = conf < 0.45 || flags.some(f => /disagreed|differs|do not match/.test(f));
  if (citations.length) text += `\n\nSources: ${citations.slice(0, 5).map(c => `[${c.n}] ${c.title}${c.where ? ', ' + c.where : ''}`).join(' · ')}`;
  if (unsure) text = UNSURE + (flags.find(f => /disagreed|differs|do not match/.test(f)) ?? 'My checks did not agree, so please verify this independently.') + '\n\n' + text;
  void goal; return { text, confidence: clamp01(conf), citations, flags, data: { unsure } };
};

/* ---------------- Memory Keeper ---------------- */
export const memoryKeeper: AgentFn = async ({ guard, deps, board, task, goal }) => {
  const notes: string[] = []; const now = deps.now(); const lower = goal.toLowerCase().replace(/[?.!]+$/, '');
  const f = lower.match(/^forget\s+(?:about\s+)?(.+)$/); if (f) { const n = await guard.use('memory.write', `forget ${f[1]}`, () => deps.memory.forget(f[1])); notes.push(`forgot ${n}`); return { text: n ? `Forgotten: removed ${n} memor${n === 1 ? 'y' : 'ies'}.` : `I had nothing stored about “${f[1]}”.`, confidence: 1, data: { notes } }; }
  const { facts, explicit } = deps.extractFacts(goal); for (const x of facts) { await guard.use('memory.write', `remember: ${x}`, () => deps.memory.add(x, /prefers/.test(x) ? 'preference' : 'fact')); notes.push(`remembered: ${x}`); }
  const crit = board.depResults(task).find(t => t.agent === 'critic'); const unsure = (crit?.data as { unsure?: boolean })?.unsure;
  if (!facts.length && goal.length > 12 && !/^(?:hi|hello|thanks|thank you|ok)\b/i.test(goal)) { await guard.use('memory.write', 'episode', () => deps.memory.add(unsure ? `Could not answer well: ${goal.slice(0, 80)}` : `Asked about: ${goal.slice(0, 80)}`, 'episode')); notes.push(unsure ? 'noted a knowledge gap' : 'noted topic'); }
  const old = (await guard.use('memory.read', 'review episodes', () => deps.memory.all())).filter(m => m.kind === 'episode' && now - m.t > 45 * 86400000); if (old.length) { await guard.use('memory.write', `forget ${old.length} stale episodes`, () => { old.forEach(m => deps.memory.remove(m.id)); }); notes.push(`dropped ${old.length} stale episode(s)`); }
  return { text: explicit && facts.length ? `Got it, I will remember: ${facts[0].replace(/\bthe user's\b/gi, 'your').replace(/\bthe user\b/gi, 'you')}.` : '', confidence: 1, data: { notes } };
};

export const AGENT_FNS: Record<AgentName, AgentFn> = { planner, researcher, tutor, solver, simop, scribe, critic, memory: memoryKeeper };
export { jaccard };
