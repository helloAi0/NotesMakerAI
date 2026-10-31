/**
 * FRIDAY — the one assistant. This module is its brain: a single conversation, a visible reasoning pipeline, one set of tools.
 *
 *   Perceive → Plan → (Act | Recall → Reason → Critique) → Learn
 *
 *  ACT   : instructions become a JSON plan (virtual files + app controls) that is executed step by step with live status.
 *  CHAT  : questions are answered by the routed language model (local → cloud → offline engine) with memory, your notes/PDFs,
 *          optional web recall, a style chosen by the reinforcement-learning policy, and a critic pass.
 *  LEARN : 👍/👎/regenerate/copy become rewards for the policy; durable facts go to memory; the knowledge map re-clusters your content.
 */
import { getIndex, noteDocs, pdfDocsIndex } from '../friday';
import { ask as askCore, baseDocs, calc } from '../fridayCore';
import type { KDoc } from '../fridayCore';
import { runOne, helpText, setLastOutput } from '../agentRuntime';
import { parseCommand } from '../voiceIntents';
import { snapshot, COMMAND_LANGUAGE } from '../fridayAgent';
import { parseJsonLoose } from '../aiClient';
import { SIMS } from '../../sims/registry';
import { touch } from '../activity';
import { vfs } from './vfs';
import { listFolders, addFolder } from '../libraryStore';
import { planOffline, executePlan, validatePlan, hasFsSteps, newCtx, PLAN_SCHEMA_DOC } from './plan';
import type { Plan, PlanCtx } from './plan';
import { MemoryStore, extractFacts, Policy, classify, STRATEGY_STYLE, REWARD, STRATEGIES } from './learn';
import type { Strategy, Ctx } from './learn';
import { clusterCorpus, nearestCluster } from './cluster';
import type { KnowledgeMap } from './cluster';
import * as router from './route';
import type { Engine, WebHit } from './route';

export interface Chip { label: string; cmd: string }
export type NodeId = 'perceive' | 'plan' | 'recall' | 'reason' | 'act' | 'critic' | 'learn';
export interface PipeNode { id: NodeId; label: string; status: 'idle' | 'active' | 'done' | 'skipped' | 'error'; detail?: string; ms?: number }
export interface Msg {
  id: number; who: 'you' | 'bot'; text: string; t: number; via?: 'voice' | 'text';
  plan?: Plan; chips?: Chip[]; sources?: { kind: string; title: string; where?: string; url?: string }[];
  engine?: Engine; engineLabel?: string; strategy?: Strategy; ctx?: Ctx; confidence?: number; notes?: string[];
  feedback?: 'up' | 'down'; streaming?: boolean; question?: string; pipe?: PipeNode[];
}
const KEY = 'nm_friday_chat_v2';
const NODE_LABELS: Record<NodeId, string> = { perceive: 'Perceive', plan: 'Plan', recall: 'Recall', reason: 'Reason', act: 'Act', critic: 'Critic', learn: 'Learn' };
const freshPipe = (): PipeNode[] => (Object.keys(NODE_LABELS) as NodeId[]).map(id => ({ id, label: NODE_LABELS[id], status: 'idle' }));

export const memory = new MemoryStore(); export const policy = new Policy();
export const planCtx: PlanCtx = newCtx('/');
let msgs: Msg[] = (() => { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? (a as Msg[]).map(m => ({ ...m, streaming: false })) : []; } catch { return []; } })();
let busy = false, nextId = Math.max(1, ...msgs.map(m => m.id + 1)), pipe: PipeNode[] = freshPipe();
const subs = new Set<() => void>(), replySubs = new Set<(m: Msg) => void>();
const emit = () => { try { localStorage.setItem(KEY, JSON.stringify(msgs.slice(-80).map(m => ({ ...m, pipe: undefined })))); } catch { /* quota */ } subs.forEach(f => f()); };
const tick = () => subs.forEach(f => f());
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const getMsgs = () => msgs; export const isBusy = () => busy; export const getPipe = () => pipe;
export const onReply = (f: (m: Msg) => void) => { replySubs.add(f); return () => { replySubs.delete(f); }; };
export function clearChat() { msgs = []; emit(); }
const add = (m: Omit<Msg, 'id' | 't'>) => { const x: Msg = { ...m, id: nextId++, t: Date.now() }; msgs = [...msgs, x]; emit(); return x.id; };
const patch = (id: number, f: (m: Msg) => Msg, persist = true) => { msgs = msgs.map(m => (m.id === id ? f(m) : m)); persist ? emit() : tick(); };
const done = (id: number) => { const m = msgs.find(x => x.id === id); if (m) replySubs.forEach(f => f(m)); };
const node = (id: NodeId, status: PipeNode['status'], detail?: string) => { pipe = pipe.map(n => (n.id === id ? { ...n, status, detail: detail ?? n.detail } : n)); tick(); };
const resetPipe = () => { pipe = freshPipe(); tick(); };

const clonePlan = (p: Plan): Plan => ({ ...p, steps: p.steps.map(s => ({ ...s, args: { ...s.args } })) });
const IMPERATIVE = /^(?:please\s+)?(?:open|go|set|run|create|make|add|write|move|copy|put|capture|grab|generate|delete|remove|rename|find|list|show|start|stop|turn|increase|decrease|press|click|save|import|export|summari[sz]e|read|mark|navigate|switch|select|change|play|pause|reset|build|prepare|compile|send|fetch|take|pick)\b/i;
const SELF_EXPLAIN = /\b(this|current|the) (simulation|sim|page|screen|graph|chart)\b|\bwhat am i (looking|seeing)\b/i;

/* ---------------- knowledge map (clustering) ---------------- */
let mapCache: { at: number; map: KnowledgeMap; n: number } | null = null;
export async function knowledgeItems() {
  const dyn: KDoc[] = [...noteDocs(), ...(await pdfDocsIndex())]; await vfs().ready();
  const files = vfs().walk('/', 8).filter(n => n.type === 'file' && n.text && n.text.length > 80).map(n => ({ id: `f:${n.path}`, title: n.name, kind: 'file', text: n.text! }));
  const base = baseDocs(SIMS as never[]).filter(d => d.kind === 'sim' || d.kind === 'glossary').map(d => ({ id: d.id, title: d.title, kind: d.kind, text: d.text }));
  const asked = msgs.filter(m => m.who === 'you' && m.text.length > 12).slice(-30).map(m => ({ id: `q:${m.id}`, title: m.text.slice(0, 40), kind: 'chat', text: m.text }));
  return [...dyn.map(d => ({ id: d.id, title: d.title, kind: d.kind, text: d.text })), ...files, ...asked, ...base].slice(0, 320);
}
export async function knowledgeMap(force = false): Promise<KnowledgeMap> {
  const items = await knowledgeItems(); if (!force && mapCache && Date.now() - mapCache.at < 60_000 && mapCache.n === items.length) return mapCache.map;
  const map = clusterCorpus(items, { kMax: 9, seed: 7 }); mapCache = { at: Date.now(), map, n: items.length }; return map;
}

/* ---------------- prompts ---------------- */
const PERSONA = 'You are FRIDAY, the single AI assistant inside the web app “Notes Maker AI” (digital notebook, 170+ interactive STEM simulations, PDF library, study planner and a virtual file system). You are one assistant: you hold natural conversations on any topic, explain and derive mathematics and science (write formulas in LaTeX with $…$ and $$…$$), write and debug code in fenced blocks, translate, plan and solve problems. Requests to operate the app or the user’s files are executed by your action engine before you answer. Be accurate and honest: if you are unsure, say so; never invent sources, citations or file contents. Reply in the language the user writes in.';
function buildPrompt(q: string, o: { strategy: Strategy; prefs: string; mem: string[]; context: string; web: WebHit[]; history: { who: string; text: string }[]; topic?: string; draft?: string }): string {
  const conv = o.history.slice(-8).map(m => `${m.who === 'you' ? 'User' : 'FRIDAY'}: ${m.text.slice(0, 600)}`).join('\n');
  return [PERSONA, `STYLE: ${STRATEGY_STYLE[o.strategy]} ${o.prefs}`.trim(), o.mem.length ? `WHAT YOU REMEMBER ABOUT THE USER:\n${o.mem.map(x => '- ' + x).join('\n')}` : '', o.topic ? `The user’s knowledge map places this question near the topic cluster: ${o.topic}.` : '',
    o.context ? `CONTEXT FROM THE USER’S APP (notes, PDFs, simulations, glossary; use it when relevant and name the source):\n${o.context}` : '', o.web.length ? `WEB (Wikipedia extracts; cite the title when you use them):\n${o.web.map(w => `[${w.title}] ${w.extract}`).join('\n\n')}` : '',
    conv ? `CONVERSATION SO FAR:\n${conv}` : '', `User: ${q}`, 'FRIDAY:'].filter(Boolean).join('\n\n');
}

/* ---------------- critic ---------------- */
export function critique(q: string, text: string, ctx: Ctx, o: { engine: Engine; found: boolean; sources: number }): { confidence: number; notes: string[]; text: string } {
  const notes: string[] = []; let conf = o.engine === 'offline' ? (o.found ? 0.55 + Math.min(0.3, o.sources * 0.08) : 0.2) : 0.8; let out = text;
  if (!text.trim()) { notes.push('empty answer'); conf = 0; }
  if (ctx === 'compute') { const v = calc(q.replace(/^(?:calculate|compute|evaluate|what is|what's|solve)\s+/i, '')); if (v !== null && Number.isFinite(v)) { const shown = (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number); if (shown.length && !shown.some(x => Math.abs(x - v) <= 1e-6 * Math.max(1, Math.abs(v)))) { out += `\n\n**Calculator check:** the exact value is ${Number(v.toPrecision(12))}. If this differs from the figure above, trust the calculator.`; conf = Math.min(conf, 0.5); notes.push('numeric mismatch caught'); } else { conf = Math.max(conf, 0.9); notes.push('verified by calculator'); } } }
  if (/\b(as an ai|i cannot browse|i don't have access)\b/i.test(text)) { conf -= 0.1; notes.push('hedged'); }
  if (o.engine === 'offline' && !o.found) notes.push('limited knowledge offline');
  return { confidence: Math.max(0, Math.min(1, conf)), notes, text: out };
}

/* ---------------- main entry ---------------- */
function suggestions(q: string): Chip[] {
  const w = new Set(q.toLowerCase().split(/\W+/).filter(x => x.length > 2)); const sc = COMMAND_LANGUAGE.filter(c => !/[<|]/.test(c)).map(c => ({ c, s: c.toLowerCase().split(/\W+/).filter(x => w.has(x)).length })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 4);
  return sc.map(x => ({ label: x.c, cmd: x.c }));
}
async function summarizer(text: string, title: string): Promise<string | null> {
  if (text.length < 300) return null; const r = await router.route(`Summarise the document “${title}” in 5 sentences for a student, then list 5 key terms. Use only the text below; do not invent anything.\n\nTEXT:\n${text.slice(0, 9000)}`, { stream: false, maxTokens: 500 }).catch(() => null); return r && r.text ? r.text : null;
}
async function modelPlan(goal: string): Promise<Plan | null> {
  const cur = await router.current(); if (cur.engine === 'offline') return null; await vfs().ready();
  const p = `You are the planner of FRIDAY, an assistant that operates a web app and a virtual file system. Convert the USER REQUEST into a minimal JSON plan.\n\n${PLAN_SCHEMA_DOC}\n\napp.command uses these shapes exactly:\n${COMMAND_LANGUAGE.map(c => '- ' + c).join('\n')}\n\nCURRENT FOLDER: ${planCtx.cwd}\nFILE TREE:\n${vfs().tree('/', 3).slice(0, 1500)}\nAPP STATE:\n${snapshot()}\n\nUSER REQUEST: ${goal}\nJSON:`;
  const r = await router.route(p, { json: true, stream: false, maxTokens: 800 }).catch(() => null); if (!r?.text) return null;
  try { return validatePlan(parseJsonLoose(r.text), goal); } catch { return null; }
}

export async function send(raw: string, via: 'voice' | 'text' = 'text', opts: { regenOf?: number } = {}) {
  const q = raw.trim(); if (!q || busy) return;
  busy = true; resetPipe(); touch('ask'); const t0 = Date.now();
  if (!opts.regenOf) add({ who: 'you', text: q, via });
  try {
    node('perceive', 'active');
    // ---- memory commands + durable facts
    const lower = q.toLowerCase().replace(/[?.!]+$/, '');
    if (/^(?:what do you (?:remember|know) about me|show (?:my )?memor(?:y|ies)|what('?s| is) in your memory)$/.test(lower)) { const all = memory.all(); node('perceive', 'done'); const id = add({ who: 'bot', text: all.length ? 'Here is what I remember (stored only on this device):\n' + all.slice(0, 25).map(m => `• ${m.text}`).join('\n') + '\n\nSay “forget <word>” or “forget everything” to remove items.' : 'I do not remember anything about you yet. Tell me your name, what you study, or say “remember that …”.' }); done(id); return; }
    { const f = lower.match(/^forget\s+(?:about\s+)?(.+)$/); if (f) { const n = memory.forget(f[1]); node('perceive', 'done'); const id = add({ who: 'bot', text: n ? `Forgotten: removed ${n} memor${n === 1 ? 'y' : 'ies'}.` : `I had nothing stored about “${f[1]}”.` }); done(id); return; } }
    const { facts, explicit } = extractFacts(q); for (const x of facts) memory.add(x, /prefers/.test(x) ? 'preference' : 'fact');
    node('perceive', 'done', facts.length ? `remembered ${facts.length} fact(s)` : undefined);
    if (explicit && facts.length) { const id = add({ who: 'bot', text: `Got it, I will remember: ${facts[0]}.` }); done(id); node('learn', 'done', 'memory updated'); return; }

    // ---- decide: act or chat
    node('plan', 'active'); await vfs().ready(); const steps = parseCommand(q);
    const kinds = steps.map(s => s.intent.kind); const known = steps.length > 0 && steps.some(s => s.intent.kind !== 'unknown' && !(s.intent.kind === 'explain' && !SELF_EXPLAIN.test(s.raw))) && !steps.every(s => s.intent.kind === 'explain' && !SELF_EXPLAIN.test(s.raw));
    let plan = planOffline(q, vfs(), planCtx); let fsPlan = hasFsSteps(plan);
    const libMove = q.match(/\b(?:move|put|file)\b.*\b(?:to|into)\s+(?:the\s+)?folder\s+["“']?([^"”',.]+?)["”']?\s*$/i); // PDF-library folders keep their own command
    const libFolder = !!libMove && listFolders().some(f => f.toLowerCase() === libMove[1].trim().toLowerCase()); if (libFolder) fsPlan = false;
    if (kinds.length === 1 && kinds[0] === 'help' && !fsPlan) { node('plan', 'skipped'); const id = add({ who: 'bot', text: helpText() + '\n\nFiles: “go to folder Inbox, capture the document there, move it into the PDF processing section, and generate a summary report”. Memory: “remember that my exam is on Friday”. Anything else: just ask.', chips: [{ label: 'Show the file tree', cmd: 'show the tree' }, { label: 'What do you remember?', cmd: 'what do you remember about me' }] }); done(id); return; }
    let acting = fsPlan || known; if (libFolder) { plan = { version: 1, goal: q, planner: 'offline', steps: [{ id: 's1', action: 'app.command', label: q, args: { command: q }, status: 'pending' }] }; acting = true; }
    if (!acting && IMPERATIVE.test(q)) { const mp = await modelPlan(q); if (mp) { plan = mp; acting = true; } }
    if (acting) {
      node('plan', 'done', `${plan.steps.length} step(s) · ${plan.planner} planner`); node('recall', 'skipped'); node('reason', 'skipped'); node('act', 'active');
      const id = add({ who: 'bot', text: '', plan: clonePlan(plan), pipe: undefined }); const chips: Chip[] = [];
      const res = await executePlan(plan, planCtx, { vfs: vfs(), summarizer, runApp: async c => { const r = await runOne(c); if (r.chips) chips.push(...r.chips); if (r.ok && r.message) setLastOutput(r.message); return { ok: r.ok, message: r.message }; }, onUpdate: p => patch(id, m => ({ ...m, plan: clonePlan(p) }), false) });
      for (const st of plan.steps) if (st.action === 'fs.mkdir' && st.status === 'done' && !st.args.in && st.args.name) addFolder(st.args.name);
      node('act', res.ok ? 'done' : 'error', `${res.done} done${res.failed ? `, ${res.failed} failed` : ''}`); node('critic', 'active');
      const failedStep = plan.steps.find(s => s.status === 'failed'); const sugg = failedStep?.action === 'app.command' ? suggestions(failedStep.args.command) : [];
      const outputs = plan.steps.filter(s => s.status === 'done' && s.message && /^(?:fs\.(?:ls|tree|find)|doc\.summarize)$/.test(s.action)).map(s => s.message!).join('\n\n');
      const reportPaths = plan.steps.filter(s => s.action === 'report.generate' && s.status === 'done').flatMap(s => (s.data as string[]) ?? []);
      const summary = res.ok ? (plan.steps.length === 1 ? plan.steps[0].message ?? 'Done.' : `Done: ${res.done} of ${plan.steps.length} steps completed.`) : `Stopped at step ${plan.steps.indexOf(failedStep!) + 1}: ${failedStep?.message ?? 'a step failed'}`;
      node('critic', res.ok ? 'done' : 'error', res.ok ? 'all steps verified' : 'failure reported honestly');
      patch(id, m => ({ ...m, text: [summary, outputs && plan.steps.length > 1 ? outputs : ''].filter(Boolean).join('\n\n'), plan: clonePlan(plan), chips: [...(reportPaths.length ? [{ label: 'Open the report', cmd: `__open_file__ ${reportPaths[0]}` }] : []), ...sugg, ...chips.slice(0, 4)], confidence: res.ok ? 1 : 0.3 }));
      node('learn', 'done', 'episode stored'); memory.add(`Asked FRIDAY to: ${q.slice(0, 90)}`, 'episode'); done(id); return;
    }
    node('plan', 'done', 'conversation'); node('act', 'skipped');

    // ---- CHAT: recall → reason → critic
    node('recall', 'active'); const ctxClass = classify(q); const ix = await getIndex(); const off = askCore(ix, q);
    const mem = memory.recall(q, 4).map(m => m.text); let web: WebHit[] = []; let topic: string | undefined;
    try { const map = await knowledgeMap(); const nc = nearestCluster(map, q); if (nc) topic = nc.cluster.label; } catch { /* map is optional */ }
    const wantWeb = router.isOnline() && (router.getWeb() || /\b(wikipedia|look up online|search the web|search online)\b/i.test(q));
    if (wantWeb) web = await router.webRecall(q.replace(/\b(wikipedia|look up online|search the web|please)\b/gi, '').trim() || q);
    node('recall', 'done', `${off.sources.length} local source(s)${web.length ? ` · ${web.length} web` : ''}${mem.length ? ` · ${mem.length} memory` : ''}${topic ? ` · topic: ${topic}` : ''}`);

    node('reason', 'active'); const strategy: Strategy = opts.regenOf ? (STRATEGIES.filter(s => s !== msgs.find(m => m.id === opts.regenOf)?.strategy)[Math.floor(Math.random() * (STRATEGIES.length - 1))]) : policy.pick(ctxClass);
    const id = add({ who: 'bot', text: '', streaming: true, strategy, ctx: ctxClass, question: q }); const hist = msgs.filter(m => m.id !== id && m.text).slice(-10).map(m => ({ who: m.who, text: m.text }));
    let text = off.text, engine: Engine = 'offline', label = 'Offline engine', note = ''; const sources = [...off.sources.map(s => ({ ...s })), ...web.map(w => ({ kind: 'web', title: w.title, url: w.url, where: 'Wikipedia' }))];
    if (off.kind === 'calc') { node('reason', 'done', 'calculator'); }
    else {
      const prompt = buildPrompt(q, { strategy, prefs: policy.prefText(), mem, context: off.context, web, history: hist, topic });
      const g = await router.route(prompt, { stream: true, onText: s => patch(id, m => ({ ...m, text: s }), false) });
      if (g && g.text) { text = g.text; engine = g.engine; label = g.label; if (router.getDeep() && engine !== 'offline') { node('critic', 'active', 'deep review'); const r2 = await router.route(`Review the DRAFT answer to the user’s question for factual, mathematical or logical errors and for missing steps. Return only the corrected, final answer in the same style (no commentary about the review).\n\nQUESTION: ${q}\n\nDRAFT:\n${text}`, { stream: false }).catch(() => null); if (r2?.text) text = r2.text; } }
      else if (g?.note) note = g.note;
      node('reason', 'done', `${label}${STRATEGY_STYLE[strategy] ? ' · ' + strategy : ''}`);
    }
    if (engine === 'offline' && !off.found && off.kind !== 'calc' && off.kind !== 'chat') text = `${off.text}\n\nI am answering from my built-in knowledge only. For open-ended questions, code, or long derivations, connect a language model: run \`ollama pull llama3.1\` and press “Find local model” in the Brain panel (works with no internet), or add an API key in Settings.`;
    node('critic', 'active'); const cr = critique(q, text, ctxClass, { engine, found: off.found, sources: sources.length }); text = cr.text; node('critic', 'done', `confidence ${Math.round(cr.confidence * 100)}%${cr.notes.length ? ' · ' + cr.notes.join(', ') : ''}`);
    setLastOutput(text); patch(id, m => ({ ...m, text, streaming: false, engine, engineLabel: label, confidence: cr.confidence, notes: [...cr.notes, ...(note ? [note] : [])], sources: sources.slice(0, 6), chips: off.chips.slice(0, 4) }));
    node('learn', 'done', 'awaiting your feedback'); memory.add(`Asked about: ${q.slice(0, 90)}`, 'episode'); done(id);
  } catch (e) { const id = add({ who: 'bot', text: `Something went wrong: ${(e as Error).message}` }); done(id); node('act', 'error'); }
  finally { busy = false; void t0; tick(); }
}

/* ---------------- feedback → reinforcement ---------------- */
export type Reason = 'too_long' | 'too_short' | 'too_technical' | 'too_simple' | 'wrong';
export function feedback(id: number, kind: 'up' | 'down', reason?: Reason) {
  const m = msgs.find(x => x.id === id); if (!m || !m.strategy || !m.ctx) return;
  policy.reward(m.ctx, m.strategy, kind === 'up' ? REWARD.up : REWARD.down); if (reason && reason !== 'wrong') policy.prefer(reason);
  patch(id, x => ({ ...x, feedback: kind })); if (kind === 'up' && m.question) memory.add(`Good answer style for “${m.question.slice(0, 50)}”: ${m.strategy}`, 'episode');
}
export function copied(id: number) { const m = msgs.find(x => x.id === id); if (m?.strategy && m.ctx && !m.feedback) policy.reward(m.ctx, m.strategy, REWARD.copy); }
export async function regenerate(id: number) { const m = msgs.find(x => x.id === id); if (!m?.question || busy) return; if (m.strategy && m.ctx) policy.reward(m.ctx, m.strategy, REWARD.regenerate); await send(m.question, 'text', { regenOf: id }); }
export async function runChip(cmd: string) { if (cmd.startsWith('__open_file__ ')) { window.dispatchEvent(new CustomEvent('nm:friday-open-file', { detail: cmd.slice(14) })); return; } await send(cmd, 'text'); }
export const welcome = () => { const n = memory.name(); return `${n ? `Hello ${n}. ` : 'Hello. '}I am FRIDAY, the only assistant here. Talk or type: I can chat about anything, explain and derive maths and science, write code, run your simulations, and manage your files, for example “go to folder Inbox, capture the document there, move it into the PDF processing section, and generate a summary report”.`; };
