/**
 * FRIDAY agent core: typed task board, per-agent permissions with step/time budgets, and a trace log that can be replayed.
 * Pure TypeScript (no DOM) so it runs identically in the app and in unit tests.
 */
export type AgentName = 'planner' | 'researcher' | 'tutor' | 'solver' | 'simop' | 'scribe' | 'critic' | 'memory';
export const AGENTS: AgentName[] = ['planner', 'researcher', 'tutor', 'solver', 'simop', 'scribe', 'critic', 'memory'];
export const AGENT_LABEL: Record<AgentName, string> = { planner: 'Planner', researcher: 'Researcher', tutor: 'Tutor', solver: 'Solver', simop: 'Sim Operator', scribe: 'Scribe', critic: 'Critic', memory: 'Memory Keeper' };

/* ---------------- permissions ---------------- */
export type Tool = 'llm' | 'retrieve' | 'memory.read' | 'memory.write' | 'fs.read' | 'fs.write' | 'code.run' | 'calc' | 'sim.control' | 'deck.read' | 'deck.write' | 'web';
export interface Perm { tools: Tool[]; maxSteps: number; maxMs: number; about: string }
/** Least privilege: only the Scribe may write files, only the Solver may run code, only the Memory Keeper writes memory, only the Tutor writes the study deck. */
export const PERMS: Record<AgentName, Perm> = {
  planner: { tools: ['llm', 'memory.read'], maxSteps: 3, maxMs: 8000, about: 'splits a request into steps and picks the agent for each' },
  researcher: { tools: ['llm', 'retrieve', 'memory.read', 'fs.read', 'web'], maxSteps: 6, maxMs: 20000, about: 'searches PDFs, lecture notes, files and memory; answers with citations' },
  tutor: { tools: ['llm', 'retrieve', 'deck.read', 'deck.write', 'memory.read'], maxSteps: 6, maxMs: 15000, about: 'quizzes, flashcards, mistakes and review schedule' },
  solver: { tools: ['llm', 'calc', 'code.run'], maxSteps: 8, maxMs: 25000, about: 'computes maths and runs code in a sandbox so answers are calculated, not recited' },
  simop: { tools: ['sim.control'], maxSteps: 10, maxMs: 20000, about: 'opens a simulation, sets parameters and reads the numbers' },
  scribe: { tools: ['llm', 'fs.read', 'fs.write'], maxSteps: 8, maxMs: 15000, about: 'writes and organises notebook pages and files (undo journal on every change)' },
  critic: { tools: ['llm', 'calc', 'retrieve'], maxSteps: 6, maxMs: 15000, about: 'checks answers against sources and recomputes numbers; says “I’m not sure” on disagreement' },
  memory: { tools: ['memory.read', 'memory.write'], maxSteps: 6, maxMs: 4000, about: 'decides what to remember, update or forget' },
};
export class PermissionError extends Error { agent: AgentName; tool: Tool; constructor(agent: AgentName, tool: Tool) { super(`${AGENT_LABEL[agent]} is not allowed to use ${tool}`); this.agent = agent; this.tool = tool; this.name = 'PermissionError'; } }
export class BudgetError extends Error { agent: AgentName; kind: 'steps' | 'time'; constructor(agent: AgentName, kind: 'steps' | 'time') { super(`${AGENT_LABEL[agent]} exceeded its ${kind === 'steps' ? 'step' : 'time'} budget`); this.agent = agent; this.kind = kind; this.name = 'BudgetError'; } }

/* ---------------- task board ---------------- */
export interface Citation { kind: string; title: string; where?: string; quote?: string; score?: number; n?: number }
export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export interface Task {
  id: string; agent: AgentName; goal: string; inputs: Record<string, unknown>; deps: string[]; status: TaskStatus;
  text?: string; data?: unknown; confidence?: number; citations?: Citation[]; error?: string; flags?: string[];
  startedAt?: number; endedAt?: number; steps: number; tokens: number;
}
/** Typed messages on the shared board: every agent talks through these, never through free text. */
export type BoardMsg =
  | { type: 'task'; task: Pick<Task, 'id' | 'agent' | 'goal' | 'deps'> }
  | { type: 'inputs'; taskId: string; inputs: Record<string, unknown> }
  | { type: 'result'; taskId: string; text: string; data?: unknown; citations?: Citation[] }
  | { type: 'confidence'; taskId: string; value: number; reasons: string[] };
export class Board {
  tasks = new Map<string, Task>(); log: { t: number; msg: BoardMsg }[] = []; private now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; }
  post(msg: BoardMsg) {
    this.log.push({ t: this.now(), msg });
    if (msg.type === 'task') this.tasks.set(msg.task.id, { ...msg.task, inputs: {}, status: 'pending', steps: 0, tokens: 0 });
    else { const t = this.tasks.get(msg.taskId); if (!t) throw new Error(`unknown task ${msg.taskId}`); if (msg.type === 'inputs') t.inputs = { ...t.inputs, ...msg.inputs }; else if (msg.type === 'result') { t.text = msg.text; t.data = msg.data; t.citations = msg.citations; } else { t.confidence = Math.max(0, Math.min(1, msg.value)); t.flags = [...(t.flags ?? []), ...msg.reasons]; } }
  }
  get(id: string) { return this.tasks.get(id); }
  all() { return [...this.tasks.values()]; }
  ready(): Task[] { return this.all().filter(t => t.status === 'pending' && t.deps.every(d => { const s = this.tasks.get(d)?.status; return s === 'done' || s === 'failed' || s === 'skipped'; })); }
  depResults(t: Task): Task[] { return t.deps.map(d => this.tasks.get(d)).filter((x): x is Task => !!x && x.status === 'done'); }
}

/* ---------------- trace ---------------- */
export type TraceType = 'run' | 'start' | 'tool' | 'end' | 'fail' | 'denied' | 'budget' | 'flag' | 'confirm' | 'note';
export interface TraceEvent { i: number; t: number; agent?: AgentName; taskId?: string; type: TraceType; tool?: string; detail: string; ms?: number; tokens?: number }
export interface Run {
  id: string; goal: string; t0: number; ms: number; status: 'running' | 'done' | 'failed'; events: TraceEvent[];
  tasks: { id: string; agent: AgentName; goal: string; deps: string[]; status: TaskStatus; ms: number; steps: number; tokens: number; confidence?: number; error?: string }[];
  answer?: string; confidence?: number; unsure?: boolean; totalTokens: number; failures: number;
}
export const estimateTokens = (s: string) => Math.ceil(s.length / 4);
export class Trace {
  run: Run; private now: () => number;
  constructor(goal: string, now: () => number = Date.now, id = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`) { this.now = now; this.run = { id, goal, t0: now(), ms: 0, status: 'running', events: [], tasks: [], totalTokens: 0, failures: 0 }; }
  add(e: Omit<TraceEvent, 'i' | 't'>) { const ev: TraceEvent = { ...e, i: this.run.events.length, t: this.now() - this.run.t0 }; this.run.events.push(ev); if (e.tokens) this.run.totalTokens += e.tokens; if (e.type === 'fail' || e.type === 'denied' || e.type === 'budget') this.run.failures++; return ev; }
  finish(board: Board, answer: string, confidence: number, unsure: boolean) {
    this.run.ms = this.now() - this.run.t0; this.run.answer = answer; this.run.confidence = confidence; this.run.unsure = unsure;
    this.run.tasks = board.all().map(t => ({ id: t.id, agent: t.agent, goal: t.goal, deps: t.deps, status: t.status, ms: t.startedAt && t.endedAt ? t.endedAt - t.startedAt : 0, steps: t.steps, tokens: t.tokens, confidence: t.confidence, error: t.error }));
    this.run.status = board.all().some(t => t.agent === 'critic' && t.status === 'done') ? 'done' : 'failed'; return this.run;
  }
}
/** Replay: the state of every task after the first `upTo` trace events (drives the Trace tab's scrubber). */
export function replay(run: Run, upTo: number): Record<string, 'pending' | 'running' | 'done' | 'failed'> {
  const st: Record<string, 'pending' | 'running' | 'done' | 'failed'> = {}; for (const t of run.tasks) st[t.id] = 'pending';
  for (const e of run.events.slice(0, upTo)) { if (!e.taskId) continue; if (e.type === 'start') st[e.taskId] = 'running'; else if (e.type === 'end') st[e.taskId] = 'done'; else if (e.type === 'fail' || e.type === 'budget') st[e.taskId] = 'failed'; }
  return st;
}

/* ---------------- guard: every tool call goes through here ---------------- */
export class Guard {
  steps = 0; tokens = 0; private deadline: number; agent: AgentName; task: Task; private trace: Trace; private now: () => number; private perms: Record<AgentName, Perm>;
  constructor(agent: AgentName, task: Task, trace: Trace, now: () => number = Date.now, perms: Record<AgentName, Perm> = PERMS) { this.agent = agent; this.task = task; this.trace = trace; this.now = now; this.perms = perms; this.deadline = now() + perms[agent].maxMs; }
  can(tool: Tool) { return this.perms[this.agent].tools.includes(tool); }
  /** Run one tool call: checks permission, step and time budget, times it, records it, and meters tokens for model calls. */
  async use<T>(tool: Tool, detail: string, fn: () => Promise<T> | T, size?: (r: T) => string): Promise<T> {
    if (!this.can(tool)) { this.trace.add({ agent: this.agent, taskId: this.task.id, type: 'denied', tool, detail: `${detail} — denied` }); throw new PermissionError(this.agent, tool); }
    const p = this.perms[this.agent];
    if (this.steps >= p.maxSteps) { this.trace.add({ agent: this.agent, taskId: this.task.id, type: 'budget', tool, detail: `step budget ${p.maxSteps} used up` }); throw new BudgetError(this.agent, 'steps'); }
    const left = this.deadline - this.now();
    if (left <= 0) { this.trace.add({ agent: this.agent, taskId: this.task.id, type: 'budget', tool, detail: 'time budget used up' }); throw new BudgetError(this.agent, 'time'); }
    this.steps++; this.task.steps = this.steps; const t0 = this.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const r = await Promise.race([Promise.resolve().then(fn), new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new BudgetError(this.agent, 'time')), left); })]);
      const tok = tool === 'llm' ? estimateTokens(detail) + estimateTokens(size ? size(r) : typeof r === 'string' ? r : '') : 0; this.tokens += tok; this.task.tokens = this.tokens;
      this.trace.add({ agent: this.agent, taskId: this.task.id, type: 'tool', tool, detail: detail.slice(0, 160), ms: this.now() - t0, tokens: tok || undefined }); return r;
    } catch (e) {
      if (e instanceof BudgetError) this.trace.add({ agent: this.agent, taskId: this.task.id, type: 'budget', tool, detail: 'time budget used up' });
      else this.trace.add({ agent: this.agent, taskId: this.task.id, type: 'fail', tool, detail: `${detail.slice(0, 100)} — ${(e as Error).message.slice(0, 100)}`, ms: this.now() - t0 });
      throw e;
    } finally { if (timer) clearTimeout(timer); }
  }
  flag(detail: string) { this.trace.add({ agent: this.agent, taskId: this.task.id, type: 'flag', detail }); }
}
