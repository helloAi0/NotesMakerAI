import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Check, CircleSlash, Globe, Pencil, Plug, Send, Settings2, Square, ThumbsDown, Wifi, WifiOff, X } from 'lucide-react';
import { DEFAULT_URL, loadConfig, saveConfig, useClawBotSocket } from '../hooks/useClawBotSocket';
import type { ClawBotConfig, FeedbackResult, HistoryTurn } from '../hooks/useClawBotSocket';
import { NODE_IDS, NODE_LABEL, traversedEdges } from '../lib/clawbot/protocol';
import type { Mode, NodeId, NodeState, RunState, SourceRef } from '../lib/clawbot/protocol';

/* ------------------------------------------------------------------ graph layout (SVG user units) */
const W = 860, H = 310, NW = 118, NH = 56;
const POS: Record<NodeId, [number, number]> = {
  parse: [75, 155], retrieve: [270, 70], ingest_web: [270, 240], generate: [470, 155], critic: [645, 155], finalize: [800, 155],
};
interface Edge { from: NodeId; to: NodeId; d: string; dashed?: boolean }
const L = (n: NodeId) => POS[n][0] - NW / 2, R = (n: NodeId) => POS[n][0] + NW / 2, T = (n: NodeId) => POS[n][1] - NH / 2, B = (n: NodeId) => POS[n][1] + NH / 2;
const EDGES: Edge[] = [
  { from: 'parse', to: 'retrieve', d: `M ${R('parse')} 140 C 170 140 170 70 ${L('retrieve')} 70` },
  { from: 'parse', to: 'ingest_web', d: `M ${R('parse')} 170 C 170 170 170 240 ${L('ingest_web')} 240` },
  { from: 'parse', to: 'generate', d: `M ${R('parse')} 155 L ${L('generate')} 155`, dashed: true },
  { from: 'retrieve', to: 'generate', d: `M ${R('retrieve')} 70 C 400 70 380 140 ${L('generate')} 140` },
  { from: 'retrieve', to: 'ingest_web', d: `M 252 ${B('retrieve')} L 252 ${T('ingest_web')}` },
  { from: 'ingest_web', to: 'retrieve', d: `M 288 ${T('ingest_web')} L 288 ${B('retrieve')}` },
  { from: 'ingest_web', to: 'generate', d: `M ${R('ingest_web')} 240 C 400 240 380 170 ${L('generate')} 170` },
  { from: 'generate', to: 'critic', d: `M ${R('generate')} 145 L ${L('critic')} 145` },
  { from: 'critic', to: 'generate', d: `M ${L('critic')} 168 L ${R('generate')} 168` },
  { from: 'critic', to: 'ingest_web', d: `M 640 ${B('critic')} C 640 300 330 300 ${R('ingest_web')} 252`, dashed: true },
  { from: 'critic', to: 'finalize', d: `M ${R('critic')} 155 L ${L('finalize')} 155` },
];

const STATUS_STYLE: Record<NodeState['status'], { stroke: string; fill: string; text: string }> = {
  idle: { stroke: '#334155', fill: '#0f172a', text: '#94a3b8' },
  active: { stroke: '#22d3ee', fill: '#083344', text: '#ecfeff' },
  done: { stroke: '#10b981', fill: '#022c22', text: '#d1fae5' },
  error: { stroke: '#f43f5e', fill: '#4c0519', text: '#ffe4e6' },
};

export function NodeTree({ run }: { run: RunState }) {
  const taken = useMemo(() => traversedEdges(run.path), [run.path]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img" aria-label="LangGraph execution tree" data-testid="claw-graph">
      <defs>
        {(['idle', 'taken'] as const).map(k => (
          <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={k === 'taken' ? '#34d399' : '#475569'} />
          </marker>
        ))}
        <filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      {EDGES.map(e => {
        const on = taken.has(`${e.from}>${e.to}`);
        return <path key={`${e.from}>${e.to}`} d={e.d} fill="none" stroke={on ? '#34d399' : '#334155'} strokeWidth={on ? 2.5 : 1.5}
          strokeDasharray={e.dashed && !on ? '5 5' : undefined} markerEnd={`url(#arrow-${on ? 'taken' : 'idle'})`} data-edge={`${e.from}>${e.to}`} data-taken={on} />;
      })}
      {NODE_IDS.map(id => {
        const n = run.nodes[id], st = STATUS_STYLE[n.status], [cx, cy] = POS[id];
        return (
          <g key={id} data-testid={`claw-node-${id}`} data-status={n.status} transform={`translate(${cx - NW / 2},${cy - NH / 2})`}>
            <title>{NODE_LABEL[id].hint}</title>
            <rect width={NW} height={NH} rx={12} fill={st.fill} stroke={st.stroke} strokeWidth={n.status === 'active' ? 3 : 2}
              filter={n.status === 'active' ? 'url(#glow)' : undefined} className={n.status === 'active' ? 'animate-pulse' : undefined} />
            <text x={NW / 2} y={24} textAnchor="middle" fontSize="15" fontWeight="700" fill={st.text}>{NODE_LABEL[id].title}</text>
            <text x={NW / 2} y={43} textAnchor="middle" fontSize="11" fill={st.text} opacity={0.8}>
              {n.status === 'active' ? NODE_LABEL[id].active : n.status === 'idle' ? id : n.durationMs !== undefined ? `${n.durationMs} ms` : n.status}
            </text>
            {n.visits > 1 && (<g transform={`translate(${NW - 8},-6)`}><circle r={11} fill="#f59e0b" /><text y={4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#1c1917">×{n.visits}</text></g>)}
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ small pieces */
function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const btn = (m: Mode, Icon: typeof Wifi, label: string) => (
    <button type="button" data-testid={`claw-mode-${m}`} aria-pressed={mode === m} onClick={() => onChange(m)}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${mode === m ? (m === 'online' ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white') : 'text-slate-400 hover:text-slate-200'}`}>
      <Icon className="w-4 h-4" />{label}
    </button>
  );
  return (
    <div className="flex items-center gap-2">
      <div role="group" aria-label="Agent mode" className="flex p-1 rounded-xl bg-slate-900 border border-slate-700">{btn('online', Wifi, 'Online')}{btn('offline', WifiOff, 'Offline')}</div>
      <kbd className="hidden md:inline text-[10px] text-slate-500 border border-slate-700 rounded px-1.5 py-0.5" title="Toggle mode">Alt+O</kbd>
    </div>
  );
}

function AnswerText({ text, sources, streaming }: { text: string; sources: SourceRef[]; streaming: boolean }) {
  const parts = text.split(/(\[\d{1,3}\])/g);
  return (
    <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-100" data-testid="claw-answer">
      {parts.map((p, i) => {
        const m = /^\[(\d{1,3})\]$/.exec(p);
        if (!m) return <span key={i}>{p}</span>;
        const src = sources.find(s => s.n === Number(m[1]));
        return <sup key={i} title={src ? `${src.source} (cosine ${src.score.toFixed(2)})` : 'source'} className="mx-0.5 px-1 rounded bg-cyan-900 text-cyan-200 text-[11px] font-semibold cursor-help">{m[1]}</sup>;
      })}
      {streaming && <span className="inline-block w-2 h-4 -mb-0.5 ml-0.5 bg-cyan-400 animate-pulse" aria-hidden />}
    </div>
  );
}

const fmtMs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

function SettingsPanel({ cfg, onSave, onClose }: { cfg: ClawBotConfig; onSave: (c: ClawBotConfig) => void; onClose: () => void }) {
  const [url, setUrl] = useState(cfg.url), [token, setToken] = useState(cfg.token);
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3" data-testid="claw-settings">
      <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-100">Connection</h3>
        <button aria-label="Close settings" onClick={onClose} className="text-slate-400 hover:text-slate-200"><X className="w-4 h-4" /></button></div>
      <label className="block text-xs text-slate-400">WebSocket URL
        <input data-testid="claw-url" value={url} onChange={e => setUrl(e.target.value)} placeholder={DEFAULT_URL}
          className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500" /></label>
      <label className="block text-xs text-slate-400">Access token (optional, CLAWBOT_TOKEN)
        <input data-testid="claw-token" type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off"
          className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500" /></label>
      <button data-testid="claw-save" onClick={() => { onSave({ url: url.trim() || DEFAULT_URL, token: token.trim() }); onClose(); }}
        className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold">Save &amp; reconnect</button>
      <p className="text-xs text-slate-500">Everything stays local: the server talks only to your Ollama/vLLM and your own ChromaDB.</p>
    </div>
  );
}

function FeedbackPanel({ run, onSend }: { run: RunState; onSend: (b: Parameters<ReturnType<typeof useClawBotSocket>['sendFeedback']>[0]) => Promise<FeedbackResult> }) {
  const answer = run.result?.answer ?? '';
  const [mode, setMode] = useState<'idle' | 'edit' | 'reject'>('idle');
  const [edited, setEdited] = useState(answer), [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setMode('idle'); setEdited(answer); setComment(''); setMsg(null); }, [run.runId, answer]);
  const base = { run_id: run.runId, question: run.question, generated_text: answer };
  const submit = async (body: Parameters<typeof onSend>[0]) => {
    setBusy(true); setMsg(null);
    try {
      const r = await onSend(body);
      const learned = r.stored.map(s => `${s.code} (${s.scope})`).join(', ');
      setMsg({ ok: true, text: r.stored.length ? `Learned: ${learned}${r.promoted.length ? ` · promoted to global: ${r.promoted.join(', ')}` : ''}` : r.reason ?? 'Nothing to learn from this.' });
      setMode('idle');
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
  };
  return (
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-3" data-testid="claw-feedback">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-slate-500 mr-1">Teach ClawBot</span>
        <button disabled={busy} data-testid="claw-fb-accept" onClick={() => submit({ ...base, action: 'accept' })} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm bg-slate-800 hover:bg-emerald-800 text-slate-200"><Check className="w-4 h-4" />Good</button>
        <button disabled={busy} data-testid="claw-fb-edit" onClick={() => setMode(mode === 'edit' ? 'idle' : 'edit')} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm bg-slate-800 hover:bg-cyan-800 text-slate-200"><Pencil className="w-4 h-4" />Edit</button>
        <button disabled={busy} data-testid="claw-fb-reject" onClick={() => setMode(mode === 'reject' ? 'idle' : 'reject')} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm bg-slate-800 hover:bg-rose-800 text-slate-200"><ThumbsDown className="w-4 h-4" />Reject</button>
      </div>
      {mode === 'edit' && (<div className="mt-3 space-y-2">
        <textarea data-testid="claw-fb-text" value={edited} onChange={e => setEdited(e.target.value)} rows={6} className="w-full rounded-lg bg-slate-950 border border-slate-700 p-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        <button disabled={busy || !edited.trim() || edited.trim() === answer.trim()} data-testid="claw-fb-submit-edit" onClick={() => submit({ ...base, action: 'edit', edited_text: edited })}
          className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-sm font-semibold">Save my version as a preference</button></div>)}
      {mode === 'reject' && (<div className="mt-3 space-y-2">
        <input data-testid="claw-fb-comment" value={comment} onChange={e => setComment(e.target.value)} placeholder="What was wrong? (optional)" className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500" />
        <button disabled={busy} data-testid="claw-fb-submit-reject" onClick={() => submit({ ...base, action: 'reject', comment: comment.trim() || undefined })}
          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold">Reject answer</button></div>)}
      {msg && <p role="status" data-testid="claw-fb-msg" className={`mt-2 text-xs ${msg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{msg.text}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ dashboard */
export default function ClawBotDashboard() {
  const [cfg, setCfg] = useState<ClawBotConfig>(loadConfig);
  const [showSettings, setShowSettings] = useState(false);
  const { status, attempt, mode, setMode, run, ask, cancel, reset, sendFeedback } = useClawBotSocket(cfg);
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<{ id: string; q: string; a: string; passed: boolean }[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [showLog, setShowLog] = useState(false);
  const recorded = useRef<string | null>(null);

  // finished runs become conversation history (exactly once per run)
  useEffect(() => {
    if (run.phase === 'done' && run.result?.answer && run.runId && recorded.current !== run.runId) {
      recorded.current = run.runId;
      setTurns(t => [...t.slice(-19), { id: run.runId as string, q: run.question, a: run.result!.answer, passed: run.result!.passed }]);
    }
  }, [run.phase, run.result, run.runId, run.question]);

  useEffect(() => { if (run.phase !== 'running') return; const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, [run.phase]);

  // Alt+O flips Online/Offline
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'o') { e.preventDefault(); setMode(mode === 'online' ? 'offline' : 'online'); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [mode, setMode]);

  const history = useMemo<HistoryTurn[]>(() => turns.flatMap(t => [{ role: 'user' as const, content: t.q }, { role: 'assistant' as const, content: t.a }]), [turns]);
  const submit = useCallback(() => { if (ask(input, history)) setInput(''); }, [ask, input, history]);
  const running = run.phase === 'running';
  const elapsed = run.startedAt ? ((run.finishedAt ?? now) - run.startedAt) / 1000 : 0;
  const stepLabel = running ? (run.activeNode ? NODE_LABEL[run.activeNode].active : 'Working…')
    : run.phase === 'done' ? (run.result?.passed ? 'Answer approved' : 'Answer returned (not fully approved)')
    : run.phase === 'cancelled' ? 'Cancelled' : run.phase === 'error' ? 'Error' : 'Ready';
  const connBadge = status === 'open' ? { c: 'bg-emerald-500', t: 'Connected' } : status === 'connecting' ? { c: 'bg-amber-400 animate-pulse', t: attempt ? `Reconnecting (#${attempt})…` : 'Connecting…' } : { c: 'bg-rose-500', t: 'Disconnected' };

  return (
    <div className="h-full overflow-y-auto bg-slate-950 text-slate-200" data-testid="claw-dashboard">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-600/20 text-cyan-300"><Activity className="w-6 h-6" /></div>
            <div><h2 className="text-xl font-bold text-slate-50 tracking-tight">ClawBot Core</h2>
              <p className="text-xs text-slate-500">Local agent · plan → recall/scrape → generate → reflect</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 text-sm text-slate-300" data-testid="claw-status" data-status={status}><span className={`w-2.5 h-2.5 rounded-full ${connBadge.c}`} />{connBadge.t}</span>
            <ModeToggle mode={mode} onChange={setMode} />
            <button aria-label="Connection settings" data-testid="claw-settings-btn" onClick={() => setShowSettings(s => !s)} className="p-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"><Settings2 className="w-4 h-4" /></button>
          </div>
        </header>

        {showSettings && <SettingsPanel cfg={cfg} onClose={() => setShowSettings(false)} onSave={c => { saveConfig(c); setCfg(c); }} />}
        {status !== 'open' && !showSettings && (
          <div role="alert" className="flex items-center gap-2 rounded-xl border border-amber-700/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
            <Plug className="w-4 h-4 shrink-0" /><span>Cannot reach ClawBot Core at <code className="text-amber-100">{cfg.url}</code>. Start it with <code className="text-amber-100">uvicorn core.api.server:app --port 8765</code>; this page reconnects automatically.</span>
          </div>
        )}
        {mode === 'offline' && <p className="text-xs text-amber-300 flex items-center gap-1.5" data-testid="claw-offline-note"><CircleSlash className="w-3.5 h-3.5" />Offline mode: web scraping is disabled; answers use local memory only.</p>}

        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-300">Execution graph</h3>
            <div className="flex items-center gap-3 text-sm">
              <span data-testid="claw-step-label" className={`font-semibold ${running ? 'text-cyan-300' : run.phase === 'error' ? 'text-rose-400' : 'text-slate-400'}`} aria-live="polite">{stepLabel}</span>
              {run.startedAt && <span className="text-slate-500 tabular-nums" data-testid="claw-elapsed">{elapsed.toFixed(1)} s</span>}
            </div>
          </div>
          <NodeTree run={run} />
          <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-slate-500">
            {[['#334155', 'idle'], ['#22d3ee', 'running'], ['#10b981', 'done'], ['#f43f5e', 'error']].map(([c, t]) => <span key={t} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{t}</span>)}
            <span>amber ×N = node revisited (reflection loop)</span>
          </div>
        </section>

        <div className="grid lg:grid-cols-3 gap-4">
          <section className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 flex flex-col min-h-[22rem]">
            <div className="flex-1 space-y-4 overflow-y-auto max-h-[32rem] pr-1" data-testid="claw-conversation">
              {turns.filter(t => t.id !== run.runId || running).map(t => (
                <div key={t.id} className="space-y-1.5"><p className="text-sm font-semibold text-cyan-300">{t.q}</p><p className="text-sm text-slate-400 whitespace-pre-wrap line-clamp-4">{t.a}</p></div>
              ))}
              {run.question && (
                <div className="space-y-2"><p className="text-sm font-semibold text-cyan-300" data-testid="claw-question">{run.question}</p>
                  {running && run.draftNo > 0 && <p className="text-xs text-amber-300" data-testid="claw-revision">Revision {run.draftNo}: the critic asked for a better draft</p>}
                  {(run.text || running) && <AnswerText text={run.text} sources={run.result?.sources ?? []} streaming={running && run.activeNode === 'generate'} />}
                  {run.error && <p role="alert" data-testid="claw-error" className="text-sm text-rose-400">{run.error}</p>}
                </div>
              )}
              {!run.question && turns.length === 0 && <p className="text-sm text-slate-500">Ask anything. The graph above lights up as ClawBot plans, recalls memory or scrapes the web, drafts and reflects.</p>}
            </div>
            {run.phase === 'done' && run.result && run.result.answer && <FeedbackPanel run={run} onSend={sendFeedback} />}
            <form className="mt-4 flex items-end gap-2" onSubmit={e => { e.preventDefault(); submit(); }}>
              <textarea data-testid="claw-input" value={input} onChange={e => setInput(e.target.value)} rows={2} maxLength={4000} aria-label="Question"
                placeholder={mode === 'online' ? 'Ask a question (web allowed)…' : 'Ask a question (local memory only)…'}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } if (e.key === 'Escape' && running) cancel(); }}
                className="flex-1 resize-none rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              {running
                ? <button type="button" data-testid="claw-stop" onClick={cancel} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold"><Square className="w-4 h-4" />Stop</button>
                : <button type="submit" data-testid="claw-send" disabled={!input.trim() || status !== 'open'} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-sm font-semibold"><Send className="w-4 h-4" />Send</button>}
            </form>
            {(turns.length > 0 || run.phase !== 'idle') && !running && <button onClick={() => { setTurns([]); reset(); }} className="self-start mt-2 text-xs text-slate-500 hover:text-slate-300">Clear conversation</button>}
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4" data-testid="claw-sources">
              <h3 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-1.5"><Globe className="w-4 h-4" />Sources</h3>
              {run.result?.sources.length ? (
                <ol className="space-y-1.5 text-xs">{run.result.sources.map(s => (
                  <li key={s.n} className="flex gap-2"><span className="px-1.5 rounded bg-cyan-900 text-cyan-200 font-semibold h-fit">{s.n}</span>
                    <span className="min-w-0 break-all text-slate-300">{s.source}<span className="ml-1 text-slate-500">cos {s.score.toFixed(2)}</span></span></li>))}</ol>
              ) : <p className="text-xs text-slate-500">{run.result ? 'Answered without retrieved sources.' : 'Retrieved chunks appear here.'}</p>}
            </section>
            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4" data-testid="claw-critique">
              <h3 className="text-sm font-semibold text-slate-300 mb-2">Critic</h3>
              {run.result?.critique ? (
                <div className="text-xs space-y-1.5">
                  <p className={run.result.passed ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>{run.result.passed ? 'Passed' : 'Did not pass'} · score {(run.result.critique.score ?? 0).toFixed(2)} · {run.result.revisions} revision(s)</p>
                  {(run.result.critique.issues ?? []).slice(0, 4).map((i, k) => <p key={k} className="text-slate-400">• {i}</p>)}
                </div>
              ) : <p className="text-xs text-slate-500">Verdict appears after reflection.</p>}
            </section>
            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <button className="w-full flex items-center justify-between text-sm font-semibold text-slate-300" aria-expanded={showLog} onClick={() => setShowLog(s => !s)}>
                Trace <span className="text-xs text-slate-500">{run.log.length} events{run.seqGaps ? ` · ${run.seqGaps} gap(s)` : ''}</span></button>
              {showLog && <ul className="mt-2 max-h-56 overflow-y-auto space-y-1 text-[11px] font-mono" data-testid="claw-log">{run.log.map(l => (
                <li key={l.id} className={l.kind === 'error' ? 'text-rose-400' : l.kind === 'node' ? 'text-slate-300' : 'text-slate-500'}>{run.startedAt ? `+${fmtMs(Math.max(0, l.t - run.startedAt))} ` : ''}{l.text}</li>))}</ul>}
              {run.finishedAt && run.startedAt && <p className="mt-2 text-[11px] text-slate-500">{run.tokens} tokens in {fmtMs(run.finishedAt - run.startedAt)}</p>}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
