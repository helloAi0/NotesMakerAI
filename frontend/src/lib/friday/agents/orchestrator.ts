/**
 * The orchestrator: Planner decides the steps, independent steps run in parallel on the shared board, the Critic merges and verifies,
 * then optional Scribe (writes) and Memory Keeper run. Every step is permission-checked, budgeted and traced.
 */
import { Board, Guard, Trace, AGENT_LABEL } from './core';
import type { Citation, Run, Task } from './core';
import { AGENT_FNS } from './agents';
import type { Deps, PlanItem } from './agents';
import type { KV } from '../learn';

export interface AgentResult { text: string; confidence: number; unsure: boolean; citations: Citation[]; run: Run; flags: string[]; plan: PlanItem[]; planner: string; savedPath?: string; journalId?: string; quiz?: unknown }
export interface RunOpts { timeScale?: number; onUpdate?: (run: Run, board: Board) => void; maxMs?: number; only?: PlanItem[] }

export async function runAgents(goal: string, deps: Deps, opts: RunOpts = {}): Promise<AgentResult> {
  const now = deps.now; const board = new Board(now); const trace = new Trace(goal, now); const tick = () => opts.onUpdate?.(trace.run, board); const t0 = now(); const budget = opts.maxMs ?? 90_000 * (opts.timeScale ?? deps.timeScale ?? 1);
  trace.add({ type: 'run', detail: goal.slice(0, 200) });
  const exec = async (t: Task): Promise<void> => {
    t.status = 'running'; t.startedAt = now(); trace.add({ agent: t.agent, taskId: t.id, type: 'start', detail: t.goal.slice(0, 120) }); tick();
    const guard = new Guard(t.agent, t, trace, now, undefined, opts.timeScale ?? deps.timeScale ?? 1);
    try {
      const out = await AGENT_FNS[t.agent]({ task: t, guard, deps, board, goal: t.goal });
      board.post({ type: 'result', taskId: t.id, text: out.text, data: out.data, citations: out.citations }); board.post({ type: 'confidence', taskId: t.id, value: out.confidence ?? (out.text ? 0.6 : 0), reasons: out.flags ?? [] });
      for (const f of out.flags ?? []) trace.add({ agent: t.agent, taskId: t.id, type: 'flag', detail: f });
      t.status = 'done'; t.endedAt = now(); trace.add({ agent: t.agent, taskId: t.id, type: 'end', detail: `${(out.text || '(no output)').replace(/\s+/g, ' ').slice(0, 100)} · confidence ${Math.round((t.confidence ?? 0) * 100)}%`, ms: t.endedAt - (t.startedAt ?? t.endedAt), tokens: undefined });
    } catch (e) { t.status = 'failed'; t.error = (e as Error).message; t.endedAt = now(); trace.add({ agent: t.agent, taskId: t.id, type: 'budget' === (e as Error).name ? 'budget' : 'note', detail: `${AGENT_LABEL[t.agent]} failed: ${t.error}` }); if ((e as Error).name !== 'BudgetError' && (e as Error).name !== 'PermissionError') trace.run.failures++; }
    tick();
  };
  // 1. plan
  board.post({ type: 'task', task: { id: 't0', agent: 'planner', goal, deps: [] } }); await exec(board.get('t0')!);
  let plan: PlanItem[] = opts.only ?? ((board.get('t0')?.data as { plan?: PlanItem[] })?.plan ?? []); const by = (board.get('t0')?.data as { by?: string })?.by ?? 'rules';
  if (!plan.length) { const { planRules } = await import('./agents'); plan = planRules(goal); }
  plan.forEach((p, i) => board.post({ type: 'task', task: { id: `t${i + 1}`, agent: p.agent, goal: p.goal, deps: p.deps } })); tick();
  // 2. run: everything whose dependencies are finished runs at the same time
  for (let guardLoops = 0; guardLoops < 20; guardLoops++) {
    const pending = board.all().filter(t => t.status === 'pending'); if (!pending.length) break;
    if (now() - t0 > budget) { for (const t of pending) { t.status = 'skipped'; t.error = 'overall time budget used up'; trace.add({ agent: t.agent, taskId: t.id, type: 'budget', detail: 'overall time budget used up' }); } break; }
    const ready = board.ready(); if (!ready.length) { for (const t of pending) t.status = 'skipped'; break; }
    // a task whose only job is to act on a failed critic is skipped
    const runnable = ready.filter(t => { if ((t.agent === 'scribe') && t.deps.some(d => board.get(d)?.status !== 'done')) { t.status = 'skipped'; t.error = 'nothing verified to write'; trace.add({ agent: t.agent, taskId: t.id, type: 'note', detail: 'skipped: the Critic did not finish' }); return false; } return true; });
    if (runnable.length > 1) trace.add({ type: 'note', detail: `parallel: ${runnable.map(t => AGENT_LABEL[t.agent]).join(' + ')}` });
    await Promise.all(runnable.map(exec));
  }
  const crit = board.all().find(t => t.agent === 'critic'); const sc = board.all().find(t => t.agent === 'scribe' && t.status === 'done'); const mem = board.all().find(t => t.agent === 'memory' && t.status === 'done');
  let text = crit?.text ?? ''; const unsure = !crit || crit.status !== 'done' || !!(crit.data as { unsure?: boolean })?.unsure;
  if (!crit || crit.status !== 'done') text = 'I could not finish checking that. ' + (board.all().filter(t => t.status === 'failed').map(t => `${AGENT_LABEL[t.agent]}: ${t.error}`).join('; ') || 'Please try again.');
  if (sc?.text) text += `\n\n${sc.text}`; if (mem?.text) text = `${mem.text}${text ? '\n\n' + text : ''}`;
  const tutorQuiz = (board.all().find(t => t.agent === 'tutor' && t.status === 'done')?.data as { quiz?: unknown })?.quiz;
  const result = trace.finish(board, text, crit?.confidence ?? 0, unsure); trace.add({ type: 'run', detail: `done in ${result.ms} ms · ${result.totalTokens} tokens (est.) · ${result.failures} issue(s)` }); tick();
  return { text, confidence: crit?.confidence ?? 0, unsure, citations: crit?.citations ?? [], run: result, flags: crit?.flags ?? [], plan, planner: by, savedPath: (sc?.data as { path?: string })?.path, journalId: (sc?.data as { journal?: string })?.journal, quiz: tutorQuiz };
}

/* ---------------- run history (last 20, replayable) ---------------- */
export class RunStore {
  runs: Run[] = []; private subs = new Set<() => void>(); private kv?: KV; private key: string; constructor(kv?: KV, key = 'nm_friday_runs') { this.kv = kv; this.key = key; try { const a = JSON.parse(kv?.get(key) || '[]'); if (Array.isArray(a)) this.runs = a; } catch { /* fresh */ } }
  add(r: Run) { this.runs = [...this.runs.filter(x => x.id !== r.id), r].slice(-20); try { this.kv?.set(this.key, JSON.stringify(this.runs)); } catch { /* quota */ } this.subs.forEach(f => f()); }
  subscribe(f: () => void) { this.subs.add(f); return () => { this.subs.delete(f); }; }
  clear() { this.runs = []; this.kv?.set(this.key, '[]'); this.subs.forEach(f => f()); }
}
