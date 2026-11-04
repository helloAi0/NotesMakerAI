import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Play, RotateCcw, Check, X } from 'lucide-react';
import { runStore, deck, reminders, journal, agentsEnabled, setAgentsEnabled } from '../lib/friday/agentsRuntime';
import { AGENTS, AGENT_LABEL, PERMS, replay } from '../lib/friday/agents/core';
import type { Run } from '../lib/friday/agents/core';
import { retrievability, DAY } from '../lib/friday/agents/tutor';
import type { Card, Quiz } from '../lib/friday/agents/tutor';
import { runEvals, evalHistory, EVAL_CASES } from '../lib/friday/agents/evals';
import type { EvalReport } from '../lib/friday/agents/evals';
import { browserRunner } from '../lib/friday/agents/sandbox';
import { defaultKV } from '../lib/friday/learn';
import { parseExam } from '../lib/friday/agents/tutor';
import { parseWhen } from '../lib/friday/agents/when';
import * as router from '../lib/friday/route';

const useRuns = () => useSyncExternalStore(f => runStore.subscribe(f), () => runStore.runs);
const COL: Record<string, string> = { pending: 'bg-slate-100 text-slate-500', running: 'bg-amber-100 text-amber-800', done: 'bg-emerald-100 text-emerald-800', failed: 'bg-red-100 text-red-800', skipped: 'bg-slate-100 text-slate-400' };

/* ---------------- agents: who exists, what each may do, live trace + replay ---------------- */
export function AgentsPanel({ focusRun }: { focusRun?: string }) {
  const runs = useRuns(); const [on, setOn] = useState(agentsEnabled()); const [sel, setSel] = useState<string | undefined>(focusRun); const [step, setStep] = useState<number | null>(null); const [playing, setPlaying] = useState(false);
  const run: Run | undefined = runs.find(r => r.id === (sel ?? focusRun)) ?? runs[runs.length - 1]; const n = run?.events.length ?? 0; const upTo = step ?? n; const st = useMemo(() => (run ? replay(run, upTo) : {}), [run, upTo]);
  useEffect(() => { if (!playing || !run) return; if ((step ?? 0) >= run.events.length) { queueMicrotask(() => setPlaying(false)); return; } const t = setTimeout(() => setStep(s => (s ?? 0) + 1), 350); return () => clearTimeout(t); }, [playing, step, run]);
  const tok = (r: Run) => r.totalTokens;
  return (
    <div className="p-4 overflow-y-auto h-full bg-white text-sm space-y-4" data-testid="agents-panel">
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={on} onChange={e => { setAgentsEnabled(e.target.checked); setOn(e.target.checked); }} data-testid="agents-toggle" /> <b>Multi-agent mode</b> (Planner → Researcher / Solver / Tutor / Sim Operator in parallel → Critic → Scribe / Memory Keeper). Off = the single-pass pipeline.</label>
      <div className="grid sm:grid-cols-2 gap-2">{AGENTS.map(a => <div key={a} className="border rounded p-2 text-xs"><div className="font-semibold">{AGENT_LABEL[a]}</div><div className="text-slate-600">{PERMS[a].about}</div><div className="mt-1 text-[10px] text-slate-500">tools: {PERMS[a].tools.join(', ')} · ≤{PERMS[a].maxSteps} steps · ≤{PERMS[a].maxMs / 1000}s</div></div>)}</div>
      <div className="flex items-center gap-2 flex-wrap"><h3 className="font-semibold text-xs">Live trace</h3>
        <select value={run?.id ?? ''} onChange={e => { setSel(e.target.value); setStep(null); }} className="border rounded px-1 py-0.5 text-xs max-w-[60%]" data-testid="run-select">{[...runs].reverse().map(r => <option key={r.id} value={r.id}>{r.goal.slice(0, 50)} · {r.ms} ms</option>)}</select>
        {runs.length > 0 && <button onClick={() => { runStore.clear(); setStep(null); }} className="text-xs text-red-700 underline">Clear</button>}</div>
      {!run ? <div className="text-xs text-slate-500">No runs yet. Ask FRIDAY a question in Chat; every agent step shows up here.</div> : <>
        <div className="text-xs text-slate-600" data-testid="run-summary">{run.tasks.length} tasks · {run.ms} ms · ~{tok(run)} tokens · {run.failures} issue(s) · confidence {Math.round((run.confidence ?? 0) * 100)}%{run.unsure ? ' · unsure' : ''}</div>
        <ul className="space-y-1" data-testid="task-list">{run.tasks.map(t => <li key={t.id} className="flex items-center gap-2 text-xs border rounded px-2 py-1"><span className={`px-1.5 rounded ${COL[st[t.id] ?? t.status] ?? COL.pending}`}>{st[t.id] ?? t.status}</span><b>{AGENT_LABEL[t.agent]}</b><span className="text-slate-500 truncate flex-1">{t.goal.slice(0, 60)}</span><span className="text-slate-400">{t.ms} ms · {t.steps} steps{t.deps.length ? ` · after ${t.deps.join(',')}` : ''}</span></li>)}</ul>
        <div className="flex items-center gap-2 text-xs"><button onClick={() => { setStep(0); setPlaying(true); }} className="px-2 py-1 border rounded flex items-center gap-1" data-testid="replay"><Play className="w-3 h-3" /> Replay</button><input type="range" min={0} max={n} value={upTo} onChange={e => { setPlaying(false); setStep(+e.target.value); }} className="flex-1" aria-label="Trace position" /><span>{upTo}/{n}</span>{step !== null && <button onClick={() => { setStep(null); setPlaying(false); }} className="underline">live</button>}</div>
        <ol className="text-[11px] font-mono border rounded divide-y max-h-72 overflow-y-auto" data-testid="events">{run.events.slice(0, upTo).map(e => <li key={e.i} className={`px-2 py-1 ${e.type === 'fail' || e.type === 'denied' || e.type === 'budget' ? 'bg-red-50 text-red-800' : e.type === 'flag' ? 'bg-amber-50 text-amber-900' : ''}`}><span className="text-slate-400">{String(e.t).padStart(4)}ms</span> {e.agent ? <b>{AGENT_LABEL[e.agent]}</b> : <b>run</b>} <span className="text-slate-500">{e.type}{e.tool ? `:${e.tool}` : ''}</span> {e.detail}{e.tokens ? ` (~${e.tokens} tok)` : ''}</li>)}</ol></>}
    </div>
  );
}

/* ---------------- tutor ---------------- */
export function TutorPanel() {
  const [, force] = useState(0); const bump = () => force(x => x + 1); const now = Date.now(); const [cur, setCur] = useState<Card | null>(null); const [shown, setShown] = useState(false); const [quiz, setQuiz] = useState<Quiz[] | null>(null); const [qi, setQi] = useState(0); const [pick, setPick] = useState<number | null>(null); const [score, setScore] = useState(0);
  const [last, setLast] = useState(''); const [topic, setTopic] = useState(''); const [when, setWhen] = useState(''); const [rem, setRem] = useState('');
  const due = deck.due(now, 50); const mast = deck.topics().map(t => deck.mastery(t, now)); const nud = deck.nudges(now); const card = cur ?? due[0] ?? null;
  const grade = (g: 1 | 2 | 3 | 4) => { if (!card) return; deck.review(card.id, g); setCur(null); setShown(false); bump(); };
  const answer = (i: number) => { if (!quiz || pick !== null) return; setPick(i); const q = quiz[qi]; if (i === q.answer) setScore(s => s + 1); else deck.recordMistake({ topic: q.topic, question: q.q, given: q.options[i], correct: q.options[q.answer] }); deck.review(q.cardId, i === q.answer ? 3 : 1); };
  const sel = 'border rounded px-2 py-1 text-xs';
  return (
    <div className="p-4 overflow-y-auto h-full bg-white text-sm space-y-4" data-testid="tutor-panel">
      <div className="border rounded p-2 bg-amber-50 text-xs space-y-1" data-testid="nudges"><b>Nudges</b>{nud.length ? nud.slice(0, 5).map((n, i) => <div key={i}>• {n}</div>) : <div className="text-slate-500">Nothing urgent. Add an exam date or make flashcards.</div>}</div>
      <div className="grid sm:grid-cols-3 gap-2 text-center text-xs"><div className="border rounded p-2"><div className="text-lg font-bold" data-testid="tutor-cards">{deck.cards().length}</div>cards</div><div className="border rounded p-2"><div className="text-lg font-bold" data-testid="tutor-due">{due.length}</div>due now</div><div className="border rounded p-2"><div className="text-lg font-bold">{deck.mistakes().length}</div>mistakes logged</div></div>
      {mast.length > 0 && <div className="space-y-1" data-testid="mastery">{mast.map(m => <div key={m.topic} className="text-xs"><div className="flex justify-between"><span>{m.topic} <span className="text-slate-400">· {m.cards} cards · {m.due} due</span></span><span>{Math.round(m.mastery * 100)}%</span></div><div className="h-2 bg-slate-100 rounded"><div className={`h-2 rounded ${m.mastery < 0.5 ? 'bg-red-500' : m.mastery < 0.7 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.round(m.mastery * 100)}%` }} /></div></div>)}</div>}
      <div className="border rounded p-3" data-testid="review">{card ? <>
        <div className="text-[10px] uppercase text-slate-500 mb-1">{card.topic} · {card.state} · stability {card.S.toFixed(1)}d{card.last ? ` · recall ${Math.round(retrievability((now - card.last) / DAY, card.S) * 100)}%` : ''}</div>
        <div className="font-medium mb-2">{card.front}</div>{shown ? <><div className="bg-slate-50 border rounded p-2 mb-2 text-sm" data-testid="card-back">{card.back}</div><div className="flex gap-1.5">{([['Again', 1], ['Hard', 2], ['Good', 3], ['Easy', 4]] as const).map(([l, g]) => <button key={l} onClick={() => grade(g)} className="px-3 py-1 border rounded hover:bg-slate-50" data-testid={`grade-${l.toLowerCase()}`}>{l}</button>)}</div></> : <button onClick={() => setShown(true)} className="px-3 py-1 border rounded bg-slate-900 text-white" data-testid="show-answer">Show answer</button>}
      </> : <div className="text-xs text-slate-500">No cards due. In Chat say “make flashcards from my notes on <i>topic</i>”, or add notes first.</div>}</div>
      <div className="border rounded p-3 text-xs space-y-2"><div className="flex gap-2 flex-wrap items-center"><b>Quiz</b><input value={topic} onChange={e => setTopic(e.target.value)} placeholder="topic (optional)" className={sel} data-testid="quiz-topic" /><button onClick={() => { const q = deck.quiz(topic.trim() || null, 5); setLast(''); setQuiz(q.length ? q : null); setQi(0); setPick(null); setScore(0); if (!q.length) alert('Make a few flashcards first.'); }} className="px-2 py-1 border rounded" data-testid="quiz-start">Start 5 questions</button></div>
        {last && !quiz && <div className="font-medium text-emerald-700" data-testid="quiz-result">{last}</div>}{quiz && quiz[qi] && <div data-testid="quiz"><div className="font-medium mb-1">{qi + 1}/{quiz.length}. {quiz[qi].q}</div>{quiz[qi].options.map((o, i) => <button key={i} onClick={() => answer(i)} className={`block w-full text-left border rounded px-2 py-1 mb-1 ${pick !== null ? (i === quiz[qi].answer ? 'bg-emerald-50 border-emerald-400' : i === pick ? 'bg-red-50 border-red-400' : '') : 'hover:bg-slate-50'}`}>{'ABCD'[i]}) {o}{pick !== null && i === quiz[qi].answer ? ' ✓' : ''}</button>)}{pick !== null && <button onClick={() => { if (qi + 1 < quiz.length) { setQi(qi + 1); setPick(null); } else { deck.recordQuiz(quiz[0]?.topic, score, quiz.length); setLast(`Score ${score}/${quiz.length}`); setQuiz(null); bump(); } }} className="px-2 py-1 border rounded">{qi + 1 < quiz.length ? 'Next' : 'Finish'}</button>}</div>}</div>
      <div className="border rounded p-3 text-xs space-y-2"><b>Exam dates</b>{deck.exams().map(e => <div key={e.id} className="flex items-center gap-2"><span className="flex-1">{e.topic} — {new Date(e.at).toLocaleDateString()}</span><button onClick={() => { deck.removeExam(e.id); bump(); }} aria-label="Remove exam"><X className="w-3 h-3" /></button></div>)}
        <form className="flex gap-2 flex-wrap" onSubmit={ev => { ev.preventDefault(); const x = parseExam(`my ${when}`, now) ?? parseExam(`${when} exam`, now); if (x) { deck.addExam(x.topic, x.at); setWhen(''); bump(); } else alert('Try: “thermodynamics exam on 12 nov” or “signals exam in 5 days”.'); }}><input value={when} onChange={e => setWhen(e.target.value)} placeholder="thermodynamics exam in 5 days" className={`${sel} flex-1`} data-testid="exam-input" /><button className="px-2 py-1 border rounded" data-testid="exam-add">Add</button></form></div>
      <div className="border rounded p-3 text-xs space-y-2"><b>Reminders</b> <span className="text-slate-500">(shown while the app is open)</span>{reminders.upcoming().map(r => <div key={r.id} className="flex items-center gap-2"><span className="flex-1">{r.text} — {new Date(r.at).toLocaleString()}</span><button onClick={() => { reminders.remove(r.id); bump(); }} aria-label="Remove reminder"><X className="w-3 h-3" /></button></div>)}
        <form className="flex gap-2" onSubmit={ev => { ev.preventDefault(); const w = parseWhen(rem, now, 9); if (w) { reminders.add(rem.replace(w.matched, '').replace(/\s+/g, ' ').trim() || 'Study', w.at); setRem(''); bump(); try { if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission(); } catch { /* ignore */ } } else alert('Include a time, e.g. “revise enthalpy tomorrow at 6pm”.'); }}><input value={rem} onChange={e => setRem(e.target.value)} placeholder="revise enthalpy tomorrow at 6pm" className={`${sel} flex-1`} data-testid="rem-input" /><button className="px-2 py-1 border rounded" data-testid="rem-add">Add</button></form></div>
      <div className="border rounded p-3 text-xs"><b>Undo journal</b> {journal.list().length === 0 ? <span className="text-slate-500">No file actions yet.</span> : <ul className="mt-1 space-y-1">{journal.list().slice(0, 6).map(j => <li key={j.id} className="flex items-center gap-2"><span className={`flex-1 ${j.undone ? 'line-through text-slate-400' : ''}`}>{j.label} · {j.changes.length} change(s)</span>{!j.undone && <button onClick={() => { void journal.undo(j.id).then(bump); }} className="px-1.5 border rounded flex items-center gap-1"><RotateCcw className="w-3 h-3" />Undo</button>}</li>)}</ul>}</div>
    </div>
  );
}

/* ---------------- evals ---------------- */
export function EvalsPanel() {
  const kv = defaultKV(); const [hist, setHist] = useState<EvalReport[]>(() => evalHistory(kv)); const [busy, setBusy] = useState(false); const [prog, setProg] = useState(0); const [last, setLast] = useState<EvalReport | null>(null);
  const run = async () => { setBusy(true); setProg(0); const r = await runEvals({ runCode: browserRunner }, { kv, label: router.getRoutePref(), onProgress: i => setProg(i) }); setLast(r); setHist(evalHistory(kv)); setBusy(false); };
  const W = 320, H = 60; const pts = hist.map((h, i) => `${i ? 'L' : 'M'}${(hist.length > 1 ? (i / (hist.length - 1)) * W : 0).toFixed(1)},${(H - h.score * H).toFixed(1)}`).join(' ');
  return (
    <div className="p-4 overflow-y-auto h-full bg-white text-sm space-y-3" data-testid="evals-panel">
      <p className="text-xs text-slate-600">{EVAL_CASES.length} fixed questions run through the real agents against a fixed mini-corpus (offline, deterministic). Run it after any change; the score history shows whether FRIDAY got better or worse.</p>
      <button onClick={() => void run()} disabled={busy} className="px-3 py-1.5 rounded bg-slate-900 text-white text-xs disabled:opacity-50" data-testid="evals-run">{busy ? `Running ${prog}/${EVAL_CASES.length}…` : `Run ${EVAL_CASES.length} questions`}</button>
      {last && <div data-testid="evals-result"><div className="text-lg font-bold" data-testid="evals-score">{last.passed}/{last.total} <span className="text-sm font-normal text-slate-500">({Math.round(last.score * 100)}% · {last.ms} ms)</span></div><div className="flex flex-wrap gap-2 text-xs my-1">{Object.entries(last.byArea).map(([k, v]) => <span key={k} className={`px-2 py-0.5 rounded ${v.passed === v.total ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{k} {v.passed}/{v.total}</span>)}</div>
        {last.failures.map(f => <div key={f.id} className="text-xs text-red-800 border border-red-200 rounded p-1.5 mb-1"><X className="w-3 h-3 inline" /> {f.name}: {f.why}</div>)}{!last.failures.length && <div className="text-xs text-emerald-700"><Check className="w-3 h-3 inline" /> all passed</div>}</div>}
      {hist.length > 1 && <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16 border rounded bg-slate-50" role="img" aria-label="Score history"><path d={pts} fill="none" stroke="#059669" strokeWidth="2" /></svg>}
      <div className="text-[11px] text-slate-500">{hist.length} run(s) stored on this device.</div>
    </div>
  );
}
