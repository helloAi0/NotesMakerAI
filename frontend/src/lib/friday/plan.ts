/**
 * FRIDAY action plans: a user instruction (typed or spoken) becomes a JSON plan of typed steps, shown step-by-step in the UI
 * and executed against the virtual file system and the live app.
 *   "go to folder Inbox, capture the document there, move it into the PDF processing section, and generate a summary report"
 * Planner order: language model (when one is reachable) → built-in clause grammar (always available, fully offline).
 * Every plan is validated before it runs, and every step reports honestly whether it worked.
 */
import { VFS, basename, dirname, join, normPath, LIB_ROOT } from './vfs';
import type { VNode } from './vfs';
import { summarize, keyTerms, sentences } from '../textTools';

export type Action = 'fs.cd' | 'fs.ls' | 'fs.tree' | 'fs.mkdir' | 'fs.capture' | 'fs.move' | 'fs.copy' | 'fs.delete' | 'fs.rename' | 'fs.find' | 'doc.summarize' | 'report.generate' | 'app.command';
export const ACTIONS: Action[] = ['fs.cd', 'fs.ls', 'fs.tree', 'fs.mkdir', 'fs.capture', 'fs.move', 'fs.copy', 'fs.delete', 'fs.rename', 'fs.find', 'doc.summarize', 'report.generate', 'app.command'];
export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export interface PlanStep { id: string; action: Action; label: string; args: Record<string, string>; status: StepStatus; message?: string; data?: unknown; ms?: number }
export interface Plan { version: 1; goal: string; planner: 'offline' | 'model'; steps: PlanStep[] }
export interface PlanCtx { cwd: string; captured: string[]; last: string[] }
export const newCtx = (cwd = '/'): PlanCtx => ({ cwd, captured: [], last: [] });

/* ================================================================== */
/*  Offline planner                                                    */
/* ================================================================== */
const VERBS = 'go|open|enter|cd|navigate|capture|grab|pick|take|select|fetch|collect|pull|move|put|send|transfer|place|shift|copy|duplicate|generate|create|make|produce|write|build|prepare|compile|summari[sz]e|delete|remove|trash|discard|rename|find|locate|search|list|show|display|save|export|add|set|run|press|turn|read|explain';
/** Split one instruction into clauses on commas, semicolons, arrows, “then”, “and then”, “after that”, “finally” and “and <verb>”. */
export function splitClauses(text: string): string[] {
  const t = text.replace(/\s+/g, ' ').trim().replace(/^(?:(?:hey|ok(?:ay)?|hi)\s+)?friday[\s,:!-]+/i, '').replace(/^please[\s,]+/i, '').replace(/[.!?]+$/, '');
  const marked = t
    .replace(/\s*(?:->|→|=>|;)\s*/g, '|')
    .replace(/,?\s+(?:and\s+then|and\s+after\s+that|after\s+that|afterwards|then|next|finally|lastly|and\s+finally)\s+/gi, '|')
    .replace(new RegExp(`,\\s*(?:and\\s+)?(?=(?:please\\s+)?(?:${VERBS})\\b)`, 'gi'), '|')
    .replace(new RegExp(`\\s+and\\s+(?=(?:${VERBS})\\b)`, 'gi'), '|');
  return marked.split('|').map(s => s.replace(/^(?:and|then|please|friday|hey friday|ok(?:ay)?|now|also)[ ,]+/i, '').trim()).filter(Boolean);
}
const PRON = /^(?:it|them|that|this|those|these|the (?:same )?(?:document|file|pdf|doc|one|files|documents|pdfs)|that (?:document|file|pdf)|this (?:document|file|pdf))$/i;
const clean = (s: string) => s.replace(/^(?:the|a|an|my)\s+/i, '').replace(/\s+(?:folder|directory|section|module|area)$/i, m => m).trim();
const stripDirWords = (s: string) => s.replace(/\b(?:the|a|an|my|folder|directory|dir|section|module|area)\b/gi, ' ').replace(/\s+/g, ' ').trim();

interface Hints { vfs?: VFS; cwd: string; created: Set<string> }
const dirKnown = (spec: string, h: Hints) => !!h.vfs?.resolveDir(stripDirWords(spec) || spec, h.cwd) || h.created.has(stripDirWords(spec).toLowerCase());

/** Parse a single clause into a plan step (never throws). */
export function parseClause(clause: string, n: number, h: Hints): PlanStep {
  const c = clause.trim(); const id = `s${n}`; let m: RegExpMatchArray | null;
  const mk = (action: Action, label: string, args: Record<string, string> = {}): PlanStep => ({ id, action, label, args, status: 'pending' });
  // folder creation
  if ((m = c.match(/^(?:create|make|add|new)\s+(?:a\s+|the\s+)?(?:new\s+)?(?:folder|directory|dir)\s+(?:called\s+|named\s+)?["“']?(.+?)["”']?(?:\s+(?:in|inside|under)\s+(?:the\s+)?(.+))?$/i)))
    { const nm = m[1].trim(); h.created.add(nm.toLowerCase()); return mk('fs.mkdir', `Create folder “${nm}”`, { name: nm, ...(m[2] ? { in: m[2].trim() } : {}) }); }
  // tree / list / find
  if (/^(?:show|print|display|draw)\s+(?:me\s+)?(?:the\s+)?(?:file\s+|folder\s+|directory\s+)?tree\b/i.test(c)) return mk('fs.tree', 'Show the folder tree');
  if ((m = c.match(/^(?:list|show|display|ls|dir)\s+(?:me\s+)?(?:all\s+)?(?:the\s+)?(?:files|documents|contents?|everything|what(?:'s| is) (?:in|inside))(?:\s+(?:in|of|inside)\s+(.+))?$/i)) || (m = c.match(/^what(?:'s| is)\s+(?:in|inside)\s+(.+)$/i)) || (m = c.match(/^(?:list|show)\s+(?:the\s+)?(?:folder|directory)\s+(.+)$/i)))
    return mk('fs.ls', `List ${m[1] ? m[1].trim() : 'the current folder'}`, m[1] ? { dir: m[1].trim() } : {});
  if ((m = c.match(/^(?:find|locate|look\s+for|search\s+for)\s+(?:the\s+|a\s+|my\s+)?(?:file|document|pdf|doc)s?\s+(?:named\s+|called\s+|about\s+)?(.+)$/i))) return mk('fs.find', `Find “${m[1].trim()}”`, { query: m[1].trim() });
  // rename
  if ((m = c.match(/^rename\s+(?:the\s+)?(?:file\s+|folder\s+)?(.+?)\s+(?:to|as)\s+(.+)$/i))) return mk('fs.rename', `Rename ${m[1].trim()} → ${m[2].trim()}`, { what: PRON.test(m[1].trim()) ? '$captured' : m[1].trim(), to: m[2].trim() });
  // summary report (before "make/create" folder rules above are already handled)
  if ((m = c.match(/^(?:generate|create|make|produce|write|build|prepare|compile|save|export)\s+(?:me\s+)?(?:a\s+|an\s+|the\s+)?(?:(?:short|brief|quick|detailed|full|complete)\s+)?(?:summary\s+report|report|summary|digest|abstract|overview|brief)(?:\s+(?:of|for|on|about)\s+(.+?))?(?:\s+(?:in|into|to|under)\s+(?:the\s+)?(.+))?$/i)))
    { const of = m[1]?.trim(); return mk('report.generate', `Generate a summary report${of && !PRON.test(of) ? ` of ${of}` : ''}`, { of: !of || PRON.test(of) ? '$captured' : of, ...(m[2] ? { to: m[2].trim() } : {}) }); }
  if ((m = c.match(/^(?:summari[sz]e|digest|brief me on|tl;?dr)\s+(.+)$/i)) && (PRON.test(m[1].trim()) || h.vfs?.resolveFiles(m[1].trim(), h.cwd).length)) return mk('doc.summarize', `Summarise ${PRON.test(m[1].trim()) ? 'the captured document' : m[1].trim()}`, { what: PRON.test(m[1].trim()) ? '$captured' : m[1].trim() });
  // move / copy
  if ((m = c.match(/^(?:move|put|send|transfer|drop|place|file|shift|relocate)\s+(.+?)\s+(?:in|into|to|under|inside|onto|over to)\s+(?:the\s+)?(.+)$/i))) { const what = m[1].trim(), to = m[2].trim(); return mk('fs.move', `Move ${PRON.test(what) ? 'it' : what} → ${to}`, { what: PRON.test(what) ? '$captured' : what, to }); }
  if ((m = c.match(/^(?:copy|duplicate|clone)\s+(.+?)\s+(?:in|into|to|under|inside)\s+(?:the\s+)?(.+)$/i))) { const what = m[1].trim(); return mk('fs.copy', `Copy ${PRON.test(what) ? 'it' : what} → ${m[2].trim()}`, { what: PRON.test(what) ? '$captured' : what, to: m[2].trim() }); }
  // delete (to Trash)
  if ((m = c.match(/^(?:delete|remove|trash|discard|get rid of)\s+(?:the\s+)?(?:file\s+|folder\s+|document\s+)?(.+)$/i)) && (PRON.test(m[1].trim()) || h.vfs?.resolveFiles(m[1].trim(), h.cwd).length || dirKnown(m[1], h))) return mk('fs.delete', `Move ${PRON.test(m[1].trim()) ? 'it' : m[1].trim()} to Trash`, { what: PRON.test(m[1].trim()) ? '$captured' : m[1].trim() });
  // capture
  if ((m = c.match(/^(?:capture|grab|pick(?:\s+up)?|take|select|get|fetch|collect|pull(?:\s+out)?|snag|acquire)\s+(.+?)(?:\s+(?:from|in|inside|out of)\s+(?:the\s+)?(?:folder\s+|directory\s+)?(.+?))?(?:\s+(?:there|here))?$/i)) && !/^(?:me|a note|notes)\b/i.test(m[1])) {
    const what = m[1].replace(/\s+(?:there|here)$/i, '').trim(); const from = m[2]?.trim();
    if (!/^(?:a |an )?(?:screenshot|picture|photo|snapshot)/i.test(what)) return mk('fs.capture', `Capture ${PRON.test(what) || /^(?:the )?(?:document|file|pdf|doc)$/i.test(what) ? 'the document' : what}${from ? ` from ${from}` : ' in the current folder'}`, { what: what, ...(from ? { from } : {}) });
  }
  // navigate
  {
    const nav = c.match(/^(?:go|navigate|switch|change|move)\s+(?:in)?to\s+(?:the\s+)?(?:(folder|directory|dir)\s+)?(.+)$/i) ?? c.match(/^(?:open|enter)\s+(?:the\s+)?(folder|directory|dir)\s+(.+)$/i);
    const cd = c.match(/^(?:cd|chdir)\s+(.+)$/i);
    const explicit = !!nav?.[1] || !!cd, spec = (cd ? cd[1] : nav?.[2] ?? '').trim();
    if (spec && (explicit || dirKnown(spec, h) || /\b(?:folder|directory|section)\b/i.test(spec))) { h.created.add(stripDirWords(spec).toLowerCase()); return mk('fs.cd', `Go to ${spec}`, { dir: spec }); }
  }
  if ((m = c.match(/^go\s+back$/i)) && h.vfs) return mk('app.command', 'Go back', { command: c });
  return mk('app.command', c.length > 60 ? c.slice(0, 58) + '…' : c, { command: c });
}
export function planOffline(goal: string, vfs?: VFS, ctx: PlanCtx = newCtx()): Plan {
  const h: Hints = { vfs, cwd: ctx.cwd, created: new Set() };
  const steps = splitClauses(goal).map((c, i) => parseClause(c, i + 1, h));
  return { version: 1, goal, planner: 'offline', steps };
}
/** True when the plan does something other than hand every clause to the app command interpreter. */
export const hasFsSteps = (p: Plan) => p.steps.some(s => s.action !== 'app.command');

/* ================================================================== */
/*  Model planner (optional)                                           */
/* ================================================================== */
export const PLAN_SCHEMA_DOC = `Return ONLY JSON: {"steps":[{"action":"<one of: ${ACTIONS.join(' | ')}>","label":"short human label","args":{...}}]}
Actions and args (all values are strings):
- fs.cd {dir}                      change the working folder
- fs.ls {dir?}                     list a folder
- fs.tree {}                       show the folder tree
- fs.mkdir {name, in?}             create a folder
- fs.capture {what, from?}         select file(s) (name, "the document", "latest", "all pdfs") from a folder; remembered as $captured
- fs.move {what, to}               move file(s)/folder; what may be "$captured"
- fs.copy {what, to}
- fs.delete {what}                 moves to /Trash (recoverable)
- fs.rename {what, to}
- fs.find {query}
- doc.summarize {what}             summarise a file (what may be "$captured")
- report.generate {of, to?}        write a summary report (markdown) into /Reports; of may be "$captured"
- app.command {command}            anything else in the app: open a simulation, set a parameter, write a note, add a task, open a screen ...`;
export function validatePlan(raw: unknown, goal: string): Plan | null {
  const arr = (raw as { steps?: unknown })?.steps; if (!Array.isArray(arr) || !arr.length || arr.length > 14) return null; const steps: PlanStep[] = [];
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i] as { action?: unknown; args?: unknown; label?: unknown }; if (typeof s?.action !== 'string' || !(ACTIONS as string[]).includes(s.action)) return null;
    const args: Record<string, string> = {}; if (s.args && typeof s.args === 'object') for (const [k, v] of Object.entries(s.args as Record<string, unknown>)) if (typeof v === 'string' || typeof v === 'number') args[k] = String(v).slice(0, 400);
    const need: Record<Action, string[]> = { 'fs.cd': ['dir'], 'fs.ls': [], 'fs.tree': [], 'fs.mkdir': ['name'], 'fs.capture': ['what'], 'fs.move': ['what', 'to'], 'fs.copy': ['what', 'to'], 'fs.delete': ['what'], 'fs.rename': ['what', 'to'], 'fs.find': ['query'], 'doc.summarize': ['what'], 'report.generate': [], 'app.command': ['command'] };
    if (need[s.action as Action].some(k => !args[k])) return null;
    steps.push({ id: `s${i + 1}`, action: s.action as Action, label: typeof s.label === 'string' && s.label.trim() ? s.label.trim().slice(0, 100) : s.action, args, status: 'pending' });
  }
  return { version: 1, goal, planner: 'model', steps };
}

/* ================================================================== */
/*  Executor                                                           */
/* ================================================================== */
export interface ExecDeps {
  vfs: VFS;
  runApp: (command: string) => Promise<{ ok: boolean; message: string }>;
  summarizer?: (text: string, title: string) => Promise<string | null>;
  now?: () => Date;
  onUpdate?: (plan: Plan, ctx: PlanCtx) => void;
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const sizeText = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n > 1024 ? `${Math.round(n / 1024)} KB` : `${n} chars`);

function resolveWhat(what: string, ctx: PlanCtx, vfs: VFS): VNode[] {
  if (what === '$captured') return (ctx.captured.length ? ctx.captured : ctx.last).map(p => vfs.stat(p)).filter((n): n is VNode => !!n);
  if (what === '$last') return ctx.last.map(p => vfs.stat(p)).filter((n): n is VNode => !!n);
  const files = vfs.resolveFiles(what, ctx.cwd); if (files.length) return files;
  const d = vfs.resolveDir(stripDirWords(what) || what, ctx.cwd); return d ? [vfs.stat(d.path)!].filter(Boolean) : [];
}
export function buildReport(node: VNode, text: string, opts: { abstract?: string | null; when: Date; planGoal?: string }): string {
  const words = (text.match(/\S+/g) ?? []).length, ss = sentences(text), top = summarize(text, 5), terms = keyTerms(text, 10);
  const heads = text.split(/\n/).map(l => l.trim()).filter(l => /^(?:#{1,3}\s+|\d+(?:\.\d+)*\s+[A-Z]|[A-Z][A-Z -]{6,}$)/.test(l) && l.length < 90).slice(0, 12);
  const when = opts.when.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  return [`# Summary report: ${node.name}`, '', `*Generated by FRIDAY on ${when}*`, '', '## Source', `- File: \`${node.path}\``, `- Type: ${node.mime}${node.pages ? ` · ${plural(node.pages, 'page')}` : ''}`, `- Size: ${sizeText(node.size)} · ${words.toLocaleString()} words · ${plural(ss.length, 'sentence')}`, '',
    '## Overview', ...(opts.abstract ? [opts.abstract.trim(), ''] : []), ...(top.length ? top.map(s => `- ${s}`) : ['- This file has no readable text to summarise (it may be scanned images).']), '',
    '## Key terms', terms.length ? terms.map(t => `\`${t}\``).join(' · ') : '—', '',
    ...(heads.length ? ['## Outline', ...heads.map(h => `- ${h.replace(/^#+\s*/, '')}`), ''] : []),
    '## Provenance', `- Created from the request: “${opts.planGoal ?? 'summary report'}”`, '- Extractive summary built locally on this device' + (opts.abstract ? '; the abstract above was written by the connected language model.' : '.'), ''].join('\n');
}

/** Run a plan step by step. The plan object is mutated in place (status/message) and `onUpdate` fires after every change. */
export async function executePlan(plan: Plan, ctx: PlanCtx, d: ExecDeps): Promise<{ ok: boolean; done: number; failed: number }> {
  const { vfs } = d; await vfs.ready(); let stop = false; let done = 0, failed = 0;
  const emit = () => d.onUpdate?.(plan, ctx);
  for (const step of plan.steps) {
    if (stop) { step.status = 'skipped'; step.message = 'Skipped because an earlier step failed.'; emit(); continue; }
    step.status = 'running'; emit(); const t0 = Date.now();
    const fail = (m: string) => { step.status = 'failed'; step.message = m; failed++; stop = true; }; const ok = (m: string, data?: unknown) => { step.status = 'done'; step.message = m; step.data = data; done++; };
    try {
      const a = step.args;
      switch (step.action) {
        case 'fs.cd': { const r = vfs.resolveDir(stripDirWords(a.dir) || a.dir, ctx.cwd); if (!r) { const near = vfs.walk('/', 3).filter(n => n.type === 'dir').slice(0, 8).map(n => n.path).join(', '); fail(`I could not find a folder like “${a.dir}”. Folders I can see: ${near}.`); } else { ctx.cwd = r.path; ctx.captured = []; ok(`Now in ${r.path} (${plural(vfs.list(r.path).length, 'item')}).`); } break; }
        case 'fs.ls': { const dir = a.dir ? vfs.resolveDir(stripDirWords(a.dir) || a.dir, ctx.cwd)?.path : ctx.cwd; if (!dir) fail(`No folder like “${a.dir}”.`); else { const l = vfs.list(dir); ok(l.length ? `${dir}: ${l.map(n => n.name + (n.type === 'dir' ? '/' : '')).join(', ')}` : `${dir} is empty.`, l.map(n => n.path)); } break; }
        case 'fs.tree': ok('Folder tree:\n' + vfs.tree('/', 3)); break;
        case 'fs.mkdir': { const base = a.in ? vfs.resolveDir(stripDirWords(a.in) || a.in, ctx.cwd)?.path ?? ctx.cwd : ctx.cwd; const r = await vfs.mkdir(join(base, a.name.replace(/[\\]/g, '/'))); if (r.ok) { ctx.last = [r.path]; ok(r.message); } else fail(r.message); break; }
        case 'fs.capture': {
          const from = a.from ? vfs.resolveDir(stripDirWords(a.from) || a.from, ctx.cwd)?.path : ctx.cwd; if (!from) { fail(`I could not find the folder “${a.from}”.`); break; }
          const hits = vfs.resolveFiles(a.what, from, { recursive: false }).length ? vfs.resolveFiles(a.what, from, { recursive: false }) : vfs.resolveFiles(a.what, from);
          if (!hits.length) { const have = vfs.list(from).filter(n => n.type === 'file').map(n => n.name).slice(0, 6).join(', '); fail(`No matching document in ${from}${have ? `. Files there: ${have}` : ' (the folder has no files)'}.`); break; }
          ctx.captured = hits.map(h => h.path); ctx.last = ctx.captured; ok(`Captured ${hits.map(h => `“${h.name}”`).join(', ')} from ${from}.`, ctx.captured); break;
        }
        case 'fs.move': case 'fs.copy': {
          const items = resolveWhat(a.what, ctx, vfs); if (!items.length) { fail(a.what === '$captured' ? 'Nothing is captured yet. Capture a document first.' : `I could not find “${a.what}”.`); break; }
          let dst = vfs.resolveDir(stripDirWords(a.to) || a.to, ctx.cwd)?.path; if (!dst) { const nm = stripDirWords(a.to) || a.to; if (/^[A-Za-z0-9 _.-]{1,40}$/.test(nm) && /\b(?:folder|directory|section)\b/i.test(a.to)) { const r = await vfs.mkdir(join('/', nm)); if (r.ok) dst = r.path; } } if (!dst) { fail(`I could not find the destination “${a.to}”.`); break; }
          const msgs: string[] = [], moved: string[] = []; let bad = '';
          for (const it of items) { const r = step.action === 'fs.move' ? await vfs.move(it.path, dst) : await vfs.copy(it.path, dst); if (!r.ok) { bad = r.message; break; } msgs.push(r.message); if (r.path) moved.push(r.path); }
          if (bad) fail(bad); else { ctx.captured = moved.length ? moved : ctx.captured; ctx.last = moved; ok(msgs.join(' '), moved); } break;
        }
        case 'fs.delete': { const items = resolveWhat(a.what, ctx, vfs); if (!items.length) { fail(`I could not find “${a.what}”.`); break; } const out: string[] = []; for (const it of items) { const r = await vfs.remove(it.path); if (!r.ok) { fail(r.message); break; } out.push(r.message); } if (step.status === 'running') ok(out.join(' ')); break; }
        case 'fs.rename': { const items = resolveWhat(a.what, ctx, vfs); if (items.length !== 1) { fail(items.length ? 'Name exactly one item to rename.' : `I could not find “${a.what}”.`); break; } const r = await vfs.rename(items[0].path, a.to); if (r.ok) { ctx.captured = ctx.captured.map(p => (p === items[0].path ? r.path! : p)); ok(r.message); } else fail(r.message); break; }
        case 'fs.find': { const r = vfs.find(a.query, '/', 8); r.length ? ok(`Found ${plural(r.length, 'match')}: ${r.map(x => `${x.node.path}${x.why === 'content' ? ' (in text)' : ''}`).join(', ')}`, r.map(x => x.node.path)) : fail(`Nothing matches “${a.query}”.`); break; }
        case 'doc.summarize': {
          const items = resolveWhat(a.what, ctx, vfs).filter(n => n.type === 'file'); if (!items.length) { fail(a.what === '$captured' ? 'Nothing is captured yet.' : `I could not find “${a.what}”.`); break; }
          const parts: string[] = []; for (const it of items.slice(0, 3)) { const text = vfs.readText(it.path) ?? ''; if (text.trim().length < 40) { parts.push(`“${it.name}” has no readable text (scanned?).`); continue; } const s = (await d.summarizer?.(text, it.name)) || summarize(text, 4).map(x => '• ' + x).join('\n'); parts.push(`**${it.name}**\n${s}`); }
          ctx.last = items.map(i => i.path); ok(parts.join('\n\n')); break;
        }
        case 'report.generate': {
          const items = resolveWhat(a.of || '$captured', ctx, vfs).filter(n => n.type === 'file'); if (!items.length) { fail((a.of || '$captured') === '$captured' ? 'There is no captured document to report on. Capture one first.' : `I could not find “${a.of}”.`); break; }
          const outDir = a.to ? vfs.resolveDir(stripDirWords(a.to) || a.to, ctx.cwd)?.path ?? '/Reports' : '/Reports'; const made: string[] = [];
          for (const it of items.slice(0, 5)) { const text = vfs.readText(it.path) ?? ''; const abs = text.trim().length > 200 ? await d.summarizer?.(text, it.name).catch(() => null) : null; const md = buildReport(it, text, { abstract: abs, when: (d.now ?? (() => new Date()))(), planGoal: plan.goal }); const p = vfs.uniquePath(outDir, `Summary - ${it.name.replace(/\.[^.]+$/, '')}.md`); await vfs.writeText(p, md, { mime: 'text/markdown' }); made.push(p); }
          ctx.last = made; ok(`Wrote ${made.map(basename).map(n => `“${n}”`).join(', ')} to ${dirname(made[0])}.`, made); break;
        }
        case 'app.command': { const r = await d.runApp(a.command); r.ok ? ok(r.message || 'Done.') : fail(r.message || 'That did not work.'); break; }
      }
    } catch (e) { fail(`Unexpected error: ${(e as Error).message}`); }
    step.ms = Date.now() - t0; emit();
  }
  return { ok: failed === 0, done, failed };
}
export const planJson = (p: Plan) => JSON.stringify({ version: p.version, goal: p.goal, planner: p.planner, steps: p.steps.map(s => ({ id: s.id, action: s.action, args: s.args, status: s.status, ...(s.message ? { message: s.message.slice(0, 160) } : {}) })) }, null, 2);
export { LIB_ROOT, normPath };
