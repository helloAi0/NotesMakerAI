/* ClawBot wire protocol + the pure reducer that turns server events into UI state. */

export type NodeId = 'parse' | 'retrieve' | 'ingest_web' | 'generate' | 'critic' | 'finalize';
export const NODE_IDS: NodeId[] = ['parse', 'retrieve', 'ingest_web', 'generate', 'critic', 'finalize'];
export type NodeStatus = 'idle' | 'active' | 'done' | 'error';
export type Mode = 'online' | 'offline';
export type Phase = 'idle' | 'running' | 'done' | 'error' | 'cancelled';

export const NODE_LABEL: Record<NodeId, { title: string; active: string; hint: string }> = {
  parse: { title: 'Plan', active: 'Planning…', hint: 'Decides: memory, web or direct answer' },
  retrieve: { title: 'Recall', active: 'Searching memory…', hint: 'Cosine search in local ChromaDB' },
  ingest_web: { title: 'Scrape', active: 'Scraping…', hint: 'Headless browser → Markdown → vectors' },
  generate: { title: 'Generate', active: 'Generating…', hint: 'Streams the draft answer' },
  critic: { title: 'Reflect', active: 'Reflecting…', hint: 'Schema + LLM critique; may loop back' },
  finalize: { title: 'Finalize', active: 'Finalizing…', hint: 'Accepts the best draft' },
};

export interface NodeState { status: NodeStatus; visits: number; durationMs?: number; note?: string; startedAt?: number }
export interface SourceRef { n: number; source: string; score: number }
export interface Critique {
  verdict?: 'pass' | 'revise'; score?: number; grounded?: boolean; answers_question?: boolean; needs_more_context?: boolean;
  issues?: string[]; suggestions?: string[]; passed?: boolean;
}
export interface ResultPayload {
  answer: string; passed: boolean; route: string | null; revisions: number; sources: SourceRef[]; critique: Critique | null; error: string | null;
}
export interface LogEntry { id: number; t: number; kind: 'node' | 'info' | 'error'; text: string }

export interface RunState {
  phase: Phase;
  runId: string | null;
  question: string;
  mode: Mode;
  nodes: Record<NodeId, NodeState>;
  activeNode: NodeId | null;
  path: NodeId[];                       // node visit order (drives edge highlighting)
  text: string;                         // streaming text of the current draft
  draftNo: number;                      // 0 = first draft, 1+ = revisions
  tokens: number;
  result: ResultPayload | null;
  error: string | null;
  log: LogEntry[];
  lastSeq: number;
  seqGaps: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export type ServerEvent = { event: string; seq?: number; [k: string]: unknown };

export type Action =
  | { type: 'ask'; question: string; mode: Mode; now: number }
  | { type: 'server'; ev: ServerEvent; now: number }
  | { type: 'local-error'; message: string; now: number }
  | { type: 'connection-lost'; now: number }
  | { type: 'reset' };

const blankNodes = (): Record<NodeId, NodeState> =>
  Object.fromEntries(NODE_IDS.map(n => [n, { status: 'idle' as NodeStatus, visits: 0 }])) as Record<NodeId, NodeState>;

export const initialRun = (mode: Mode = 'online'): RunState => ({
  phase: 'idle', runId: null, question: '', mode, nodes: blankNodes(), activeNode: null, path: [], text: '', draftNo: 0, tokens: 0,
  result: null, error: null, log: [], lastSeq: 0, seqGaps: 0, startedAt: null, finishedAt: null,
});

const MAX_LOG = 250;
let logId = 0;
const addLog = (s: RunState, kind: LogEntry['kind'], text: string, t: number): LogEntry[] =>
  [...s.log, { id: ++logId, t, kind, text }].slice(-MAX_LOG);

const isNode = (x: unknown): x is NodeId => typeof x === 'string' && (NODE_IDS as string[]).includes(x);
const num = (x: unknown, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const str = (x: unknown, d = '') => (typeof x === 'string' ? x : d);

export function parseResult(ev: ServerEvent): ResultPayload {
  const sources = Array.isArray(ev.sources) ? (ev.sources as unknown[]).flatMap(s => {
    const o = s as Record<string, unknown>;
    return o && typeof o === 'object' ? [{ n: num(o.n), source: str(o.source), score: num(o.score) }] : [];
  }) : [];
  const c = ev.critique && typeof ev.critique === 'object' ? (ev.critique as Critique) : null;
  return { answer: str(ev.answer), passed: ev.passed === true, route: typeof ev.route === 'string' ? ev.route : null,
    revisions: num(ev.revisions), sources, critique: c, error: typeof ev.error === 'string' ? ev.error : null };
}

export function reduce(s: RunState, a: Action): RunState {
  switch (a.type) {
    case 'reset': return initialRun(s.mode);
    case 'ask':
      return { ...initialRun(a.mode), phase: 'running', question: a.question, startedAt: a.now,
        log: addLog(initialRun(a.mode), 'info', `Question sent (${a.mode})`, a.now) };
    case 'local-error':
      return { ...s, phase: 'error', error: a.message, activeNode: null, finishedAt: a.now, log: addLog(s, 'error', a.message, a.now) };
    case 'connection-lost':
      if (s.phase !== 'running') return s;
      return { ...s, phase: 'error', error: 'Connection to ClawBot was lost during the run.', activeNode: null, finishedAt: a.now,
        nodes: Object.fromEntries(NODE_IDS.map(n => [n, s.nodes[n].status === 'active' ? { ...s.nodes[n], status: 'error' as NodeStatus } : s.nodes[n]])) as Record<NodeId, NodeState>,
        log: addLog(s, 'error', 'Connection lost mid-run', a.now) };
    case 'server': {
      const ev = a.ev;
      let st = s;
      if (typeof ev.seq === 'number') {
        const gap = st.lastSeq > 0 && ev.seq !== st.lastSeq + 1;
        st = { ...st, lastSeq: ev.seq, seqGaps: st.seqGaps + (gap ? 1 : 0) };
      }
      // frames of a different run (e.g. a late event after cancel + new ask) are ignored
      const rid = typeof ev.run_id === 'string' ? ev.run_id : null;
      if (rid && st.runId && rid !== st.runId && ev.event !== 'run_start') return st;
      switch (ev.event) {
        case 'run_start':
          return st.phase === 'running' ? { ...st, runId: rid, mode: ev.mode === 'offline' ? 'offline' : 'online' } : st;
        case 'node_start': {
          if (!isNode(ev.node) || st.phase !== 'running') return st;
          const n = ev.node;
          const prev = st.nodes[n];
          const nodes = { ...st.nodes, [n]: { ...prev, status: 'active' as NodeStatus, visits: prev.visits + 1, startedAt: a.now, note: undefined } };
          for (const k of NODE_IDS) if (k !== n && nodes[k].status === 'active') nodes[k] = { ...nodes[k], status: 'done' };
          const startsNewDraft = n === 'generate';
          return { ...st, nodes, activeNode: n, path: [...st.path, n],
            text: startsNewDraft ? '' : st.text, draftNo: startsNewDraft && prev.visits > 0 ? st.draftNo + 1 : st.draftNo,
            log: addLog(st, 'node', `${NODE_LABEL[n].active}`, a.now) };
        }
        case 'token': {
          if (st.phase !== 'running') return st;
          const t = str(ev.text);
          return t ? { ...st, text: st.text + t, tokens: st.tokens + 1 } : st;
        }
        case 'node_end': {
          if (!isNode(ev.node)) return st;
          const n = ev.node;
          const failed = typeof ev.error === 'string' && ev.error.length > 0;
          const nodes = { ...st.nodes, [n]: { ...st.nodes[n], status: (failed ? 'error' : 'done') as NodeStatus,
            durationMs: num(ev.duration_ms), note: str(ev.note) } };
          return { ...st, nodes, activeNode: st.activeNode === n ? null : st.activeNode,
            log: addLog(st, failed ? 'error' : 'node', `${NODE_LABEL[n].title}: ${failed ? str(ev.error) : str(ev.note) || 'done'} (${num(ev.duration_ms)} ms)`, a.now) };
        }
        case 'result': {
          const r = parseResult(ev);
          return { ...st, phase: r.error && !r.answer ? 'error' : 'done', result: r, text: r.answer || st.text, activeNode: null,
            error: r.error, finishedAt: a.now,
            nodes: Object.fromEntries(NODE_IDS.map(n => [n, st.nodes[n].status === 'active' ? { ...st.nodes[n], status: 'done' as NodeStatus } : st.nodes[n]])) as Record<NodeId, NodeState>,
            log: addLog(st, 'info', r.passed ? 'Answer accepted by critic' : 'Answer returned without passing review', a.now) };
        }
        case 'cancelled':
          return { ...st, phase: 'cancelled', activeNode: null, finishedAt: a.now,
            nodes: Object.fromEntries(NODE_IDS.map(n => [n, st.nodes[n].status === 'active' ? { ...st.nodes[n], status: 'idle' as NodeStatus } : st.nodes[n]])) as Record<NodeId, NodeState>,
            log: addLog(st, 'info', 'Run cancelled', a.now) };
        case 'error':
          return { ...st, phase: 'error', error: str(ev.message, 'Unknown server error'), activeNode: null, finishedAt: a.now,
            log: addLog(st, 'error', `${str(ev.code, 'error')}: ${str(ev.message)}`, a.now) };
        case 'mode':
          return { ...st, mode: ev.mode === 'offline' ? 'offline' : 'online' };
        default:
          return st;                    // ready, pong, state: no UI change
      }
    }
  }
}

/** Edges the run has actually traversed, e.g. "parse>retrieve". */
export function traversedEdges(path: NodeId[]): Set<string> {
  const out = new Set<string>();
  for (let i = 1; i < path.length; i++) out.add(`${path[i - 1]}>${path[i]}`);
  return out;
}

export function httpBase(wsUrl: string): string {
  try {
    const u = new URL(wsUrl);
    u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
    u.pathname = u.pathname.replace(/\/ws\/?$/, '') || '/';
    u.search = ''; u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch { return ''; }
}
