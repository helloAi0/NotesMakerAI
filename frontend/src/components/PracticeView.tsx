import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { deck, studentModel } from '../lib/friday/agentsRuntime';
import { SIMS } from '../sims/registry';
import { makeChallenge, grade, explainGap } from '../lib/platform/predict';
import type { Challenge, Dir, Grade } from '../lib/platform/predict';
import { makePaper, gradePaper } from '../lib/platform/exam';
import type { Paper, Answer, Result } from '../lib/platform/exam';
import { checkSolution } from '../lib/platform/stepcheck';
import type { Check } from '../lib/platform/stepcheck';
import { reviewLab, coachReply } from '../lib/platform/lab';
import type { LabReview } from '../lib/platform/lab';
import { buildGraph, recommend, relatedness } from '../lib/platform/model';
import { collectNotes } from '../lib/platform/notes';
import { track } from '../lib/analytics';
import { describeFailure } from '../lib/net';

const SimPlayer = lazy(() => import('./SimPlayer'));
const box = 'border rounded p-3 text-sm space-y-2'; const btn = 'px-3 py-1.5 rounded border text-sm hover:bg-slate-50 disabled:opacity-50'; const dark = 'px-3 py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50';

/* ---------------- Predict → Run → Explain ---------------- */
function Predict() {
  const [q, setQ] = useState(''); const [simId, setSimId] = useState(''); const [c, setC] = useState<Challenge | null>(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const [dir, setDir] = useState<Dir | null>(null); const [ratio, setRatio] = useState(''); const [res, setRes] = useState<{ g: Grade; e: ReturnType<typeof explainGap> } | null>(null); const [watch, setWatch] = useState(false);
  const [tally, setTally] = useState(() => { const p = studentModel.events('predict'); return { n: p.length, ok: p.filter(e => e.ok).length }; });
  const matches = useMemo(() => (q.trim() ? SIMS.filter(s => (s.title + ' ' + (s.tags ?? []).join(' ') + ' ' + s.subject).toLowerCase().includes(q.toLowerCase())).slice(0, 8) : []), [q]);
  const start = (id: string) => {
    const sim = SIMS.find(s => s.id === id); if (!sim) return; setBusy(true); setMsg('Preparing a challenge…'); setC(null); setRes(null); setDir(null); setRatio(''); setWatch(false); setSimId(id);
    setTimeout(() => { const ch = makeChallenge(sim); setBusy(false); if (!ch) { setMsg(`“${sim.title}” has no parameter I can safely turn into a prediction question (it may be random or need a button press). Try another.`); return; } setMsg(''); setC(ch); }, 30);
  };
  const surprise = async (weak: boolean) => {
    let pool = SIMS; if (weak) { const g = buildGraph({ deck, events: studentModel.events(), sims: [], notes: await collectNotes() }); const top = recommend(g, 3).map(r => r.topic); const hit = SIMS.filter(s => top.some(t => relatedness(t, [s.title, s.subject, ...(s.tags ?? [])].join(' ')) >= 0.5)); if (hit.length) pool = hit; else setMsg('No simulation matches your weak topics yet, so here is a random one.'); }
    for (let i = 0; i < 6; i++) { const s = pool[Math.floor(Math.random() * pool.length)]; const ch = makeChallenge(s, { budgetMs: 500 }); if (ch) { setC(ch); setSimId(s.id); setRes(null); setDir(null); setRatio(''); setWatch(false); if (!weak || pool !== SIMS) setMsg(''); return; } } setMsg('Could not build a challenge just now. Try again.');
  };
  const lock = () => {
    if (!c || !dir) return; const sim = SIMS.find(s => s.id === c.simId); const p = { dir, ratio: ratio.trim() && Number.isFinite(+ratio) ? +ratio : undefined }; const g = grade(c, p); setRes({ g, e: explainGap(c, p, g, sim) });
    studentModel.record({ type: 'predict', ref: c.simId, topic: c.topic, ok: g.ok }); track('prediction'); setTally(t => ({ n: t.n + 1, ok: t.ok + (g.ok ? 1 : 0) }));
    if (!g.ok) deck.recordMistake({ topic: c.topic, question: `Predict: ${c.readout.label} when ${c.param.label} changes (${c.simTitle})`, given: dir, correct: c.dir });
  };
  const sim = c ? SIMS.find(s => s.id === c.simId) : undefined;
  return (
    <div className="space-y-3" data-testid="predict">
      <p className="text-sm text-slate-600">Predict what a simulation will do <i>before</i> you run it. Then see the real result and where your thinking differed. This is how experts learn physics.</p>
      <div className="flex gap-2 flex-wrap items-center"><input value={q} onChange={e => setQ(e.target.value)} placeholder="search a simulation (e.g. pendulum)" className="border rounded px-2 py-1 text-sm" data-testid="pred-search" aria-label="Search simulations" />
        <button className={btn} onClick={() => void surprise(false)} data-testid="pred-random">Surprise me</button><button className={btn} onClick={() => void surprise(true)} data-testid="pred-weak">From my weak topics</button>
        <span className="text-xs text-slate-500" data-testid="pred-tally">{tally.n ? `${tally.ok}/${tally.n} predictions right` : 'no predictions yet'}</span></div>
      {matches.length > 0 && <div className="flex gap-1 flex-wrap">{matches.map(s => <button key={s.id} className={btn} onClick={() => { setQ(''); start(s.id); }}>{s.title}</button>)}</div>}
      {msg && <div className="text-xs text-amber-800" role="status" data-testid="pred-msg">{msg}</div>}
      {c && <div className={box} data-testid="pred-card">
        <div className="font-medium" data-testid="pred-question">{c.question}</div>
        <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Your prediction">{(['up', 'down', 'same'] as Dir[]).map(d => <button key={d} role="radio" aria-checked={dir === d} disabled={!!res} onClick={() => setDir(d)} data-testid={`pred-${d}`} className={`${btn} ${dir === d ? 'bg-amber-100 border-amber-500' : ''}`}>{d === 'up' ? 'Increases' : d === 'down' ? 'Decreases' : 'Stays about the same'}</button>)}</div>
        {!res && <div className="flex gap-2 items-center flex-wrap text-xs"><label>Optional: by what factor? (new ÷ old) <input value={ratio} onChange={e => setRatio(e.target.value)} className="border rounded px-2 py-1 w-20" inputMode="decimal" data-testid="pred-ratio" /></label><button className={dark} disabled={!dir} onClick={lock} data-testid="pred-lock">Lock in and run</button></div>}
        {res && <div className="space-y-1" data-testid="pred-result"><div className={`font-semibold ${res.g.ok ? 'text-emerald-700' : 'text-red-700'}`} data-testid="pred-headline">{res.e.headline}</div>{res.e.lines.map((l, i) => <div key={i} className="text-slate-700">{l}</div>)}<div className="text-indigo-800">Think about it: {res.e.ask}</div>
          <div className="flex gap-2 flex-wrap pt-1"><button className={btn} onClick={() => setWatch(w => !w)} data-testid="pred-watch">{watch ? 'Hide simulation' : 'Watch it in the simulation'}</button><button className={btn} onClick={() => start(simId)} data-testid="pred-again">Another question on this simulation</button></div></div>}
      </div>}
      {c && res && watch && sim && <div className="border rounded overflow-hidden h-[520px]" data-testid="pred-sim"><Suspense fallback={<div className="p-4 text-sm">Loading simulation…</div>}><SimPlayer sim={sim} onBack={() => setWatch(false)} initialValues={c.newValues} /></Suspense></div>}
      {busy && <div className="text-xs text-slate-500">Running the simulation twice to find a fair question…</div>}
    </div>
  );
}

/* ---------------- Exam mode ---------------- */
function Exam() {
  const [n, setN] = useState(10); const [paper, setPaper] = useState<Paper | null>(null); const [ans, setAns] = useState<Record<string, Answer>>({}); const [i, setI] = useState(0); const [left, setLeft] = useState(0); const [res, setRes] = useState<Result | null>(null); const [msg, setMsg] = useState('');
  const t0 = useRef(0); const qStart = useRef(0); const paperRef = useRef<Paper | null>(null); const ansRef = useRef(ans); ansRef.current = ans;
  const finish = (p: Paper | null = paperRef.current) => { if (!p) return; const r = gradePaper(deck, p, p.items.map(it => ansRef.current[it.id] ?? { itemId: it.id, ms: 0 })); for (const u of r.updates) { deck.review(u.cardId, u.grade); if (u.mistake) deck.recordMistake(u.mistake); } studentModel.record({ type: 'mock', score: r.score, n: r.max, ok: r.pct >= 0.5 }); track('mock_exam'); setRes(r); setPaper(null); paperRef.current = null; };
  useEffect(() => { if (!paper) return; const t = setInterval(() => { const l = Math.max(0, paper.minutes * 60 - Math.round((Date.now() - t0.current) / 1000)); setLeft(l); if (l === 0) finish(paper); }, 500); return () => clearInterval(t); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [paper]);
  const start = () => { const p = makePaper(deck, { n }); if (!p) { setMsg('You need at least 3 flashcards first. Open Quick start (Teach → Class) and turn some notes into cards.'); return; } setMsg(''); setRes(null); setAns({}); setI(0); setPaper(p); paperRef.current = p; t0.current = Date.now(); qStart.current = Date.now(); setLeft(p.minutes * 60); };
  const put = (it: Paper['items'][number], v: { choice?: number; text?: string }) => setAns(a => ({ ...a, [it.id]: { ...a[it.id], itemId: it.id, ms: a[it.id]?.ms ?? 0, ...v } }));
  const go = (k: number) => { if (!paper) return; const it = paper.items[i]; setAns(a => ({ ...a, [it.id]: { ...(a[it.id] ?? { itemId: it.id }), ms: (a[it.id]?.ms ?? 0) + (Date.now() - qStart.current) } as Answer })); qStart.current = Date.now(); setI(Math.max(0, Math.min(paper.items.length - 1, k))); };
  const mm = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  if (paper) { const it = paper.items[i]; const a = ans[it.id]; return (
    <div className="space-y-3" data-testid="exam-run"><div className="flex justify-between text-sm"><b>Question {i + 1}/{paper.items.length} <span className="text-slate-500 font-normal">· {it.topic} · {it.marks} mark{it.marks > 1 ? 's' : ''}</span></b><span className={left < 60 ? 'text-red-700 font-bold' : ''} aria-live="off" data-testid="exam-timer">{mm(left)}</span></div>
      <div className={box}><div className="font-medium" data-testid="exam-q">{it.q}</div>
        {it.kind === 'mcq' ? it.options!.map((o, k) => <button key={k} onClick={() => put(it, { choice: k })} aria-pressed={a?.choice === k} data-testid={`exam-opt-${k}`} className={`block w-full text-left border rounded px-2 py-1.5 ${a?.choice === k ? 'bg-amber-100 border-amber-500' : 'hover:bg-slate-50'}`}>{'ABCD'[k]}) {o}</button>) : <textarea value={a?.text ?? ''} onChange={e => put(it, { text: e.target.value })} rows={3} className="w-full border rounded p-2" placeholder="Type your answer" aria-label="Your answer" data-testid="exam-text" />}</div>
      <div className="flex gap-2"><button className={btn} disabled={i === 0} onClick={() => go(i - 1)}>Previous</button>{i + 1 < paper.items.length ? <button className={dark} onClick={() => go(i + 1)} data-testid="exam-next">Next</button> : null}<button className={`${btn} ml-auto`} onClick={() => { go(i); setTimeout(() => finish(), 0); }} data-testid="exam-submit">Submit paper</button></div>
      <div className="flex gap-1 flex-wrap">{paper.items.map((x, k) => <button key={x.id} onClick={() => go(k)} aria-label={`Go to question ${k + 1}`} className={`w-7 h-7 text-xs rounded border ${k === i ? 'border-slate-900' : ''} ${ans[x.id]?.choice != null || ans[x.id]?.text ? 'bg-emerald-100' : ''}`}>{k + 1}</button>)}</div></div>); }
  return (
    <div className="space-y-3" data-testid="exam">
      <p className="text-sm text-slate-600">A timed mock paper built from <b>your weak topics</b>, marked automatically, with a report on <i>how</i> you lose marks.</p>
      <div className="flex gap-2 items-center text-sm"><label>Questions <select value={n} onChange={e => setN(+e.target.value)} className="border rounded px-1 py-1" data-testid="exam-n">{[5, 10, 15, 20].map(x => <option key={x}>{x}</option>)}</select></label><button className={dark} onClick={start} data-testid="exam-start">Start mock exam</button></div>
      {msg && <div className="text-xs text-amber-800" data-testid="exam-msg">{msg}</div>}
      {res && <div className={box} data-testid="exam-result"><div className="text-lg font-bold" data-testid="exam-score">{res.score}/{res.max} <span className="text-sm font-normal text-slate-500">({Math.round(res.pct * 100)}%)</span></div>
        <div>{res.byTopic.map(t => <div key={t.topic} className="flex items-center gap-2 text-xs"><span className="w-28 truncate">{t.topic}</span><span className="flex-1 h-2 bg-slate-200 rounded"><span className={`block h-2 rounded ${t.pct < 0.5 ? 'bg-red-500' : t.pct < 0.75 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.round(t.pct * 100)}%` }} /></span><span>{Math.round(t.pct * 100)}%</span></div>)}</div>
        {res.patterns.length > 0 ? <div className="bg-amber-50 border border-amber-200 rounded p-2" data-testid="exam-patterns"><b>Where you lose marks</b>{res.patterns.map(p => <div key={p.kind}>• {p.advice}</div>)}</div> : <div className="text-emerald-700">No error pattern found. Nice, steady paper.</div>}
        <details><summary className="cursor-pointer">Review every question</summary>{res.items.map(m => <div key={m.item.id} className={`text-xs border-l-4 pl-2 my-1 ${m.ok ? 'border-emerald-500' : 'border-red-500'}`}><b>{m.item.q}</b><div>Your answer: {m.given || '(none)'} {m.why && `— ${m.why}`}</div>{!m.ok && <div>Correct: {m.item.key}</div>}</div>)}</details>
        <div className="text-xs text-slate-500">Your cards and mistake list were updated from this paper.</div></div>}
    </div>
  );
}

/* ---------------- Check my work (photo / typed) ---------------- */
function CheckWork() {
  const [text, setText] = useState(''); const [out, setOut] = useState<Check | null>(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [conf, setConf] = useState<number | null>(null);
  const load = async (f: File) => {
    setBusy(true); setMsg('Reading the photo…'); setOut(null);
    try { const { analyze } = await import('../lib/friday/vision'); const a = await analyze(f, f.name, s => setMsg(s)); setText(a.ocr || a.description || ''); setConf(a.ocrConfidence); setMsg(a.ocr.trim() ? 'Check that the text below matches your writing, fix any misread symbols, then press Check.' : 'No text was found in that photo. Type your steps below instead.'); } catch (e) { setMsg(describeFailure('The AI service', e)); } setBusy(false);
  };
  const run = () => { const r = checkSolution(text); setOut(r); studentModel.record({ type: 'photo', ok: r.firstError == null && r.checked > 0, n: r.checked }); track('work_checked'); };
  return (
    <div className="space-y-3" data-testid="checkwork">
      <p className="text-sm text-slate-600">Upload a photo of your worked solution (or type it). I recompute every line and show you the <b>first line where it goes wrong</b>. Printed text reads well; handwriting often needs a quick fix below.</p>
      <div className="flex gap-2 items-center flex-wrap"><label className={`${btn} cursor-pointer`}>Choose a photo<input type="file" accept="image/*" capture="environment" className="hidden" data-testid="cw-file" onChange={e => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ''; }} /></label><span className="text-xs text-slate-500" role="status" data-testid="cw-msg">{busy ? 'Working…' : msg}</span>{conf != null && conf < 60 && <span className="text-xs text-amber-700">Low reading confidence ({Math.round(conf)}%): please check the text.</span>}</div>
      <textarea value={text} onChange={e => { setText(e.target.value); setOut(null); }} rows={7} placeholder={'One step per line, e.g.\n2x + 3 = 11\n2x = 8\nx = 5'} className="w-full border rounded p-2 font-mono text-sm" aria-label="Your working" data-testid="cw-text" />
      <button className={dark} disabled={!text.trim()} onClick={run} data-testid="cw-check">Check my steps</button>
      {out && <div className={box} data-testid="cw-result"><div className={`font-semibold ${out.firstError ? 'text-red-700' : out.checked ? 'text-emerald-700' : 'text-slate-700'}`} data-testid="cw-summary">{out.summary}</div>
        {out.steps.map(s => <div key={s.n} className={`flex gap-2 items-start text-xs font-mono ${s.status === 'error' ? 'bg-red-50' : ''}`} data-testid={`cw-line-${s.status}`}><span className="w-4">{s.status === 'ok' ? '✓' : s.status === 'error' ? '✗' : '·'}</span><span className="w-5 text-slate-400">{s.n}</span><span className="flex-1"><span>{s.text}</span>{s.note && <div className="font-sans text-red-800 mt-0.5">{s.note}</div>}</span></div>)}</div>}
    </div>
  );
}

/* ---------------- Lab report helper ---------------- */
function Lab() {
  const [text, setText] = useState(''); const [rev, setRev] = useState<LabReview | null>(null); const [ask, setAsk] = useState(''); const [coach, setCoach] = useState('');
  return (
    <div className="space-y-3" data-testid="lab">
      <p className="text-sm text-slate-600">Paste your lab report or assignment draft. I will tell you what a marker would flag and ask guiding questions. I <b>won’t write it or give the final answer</b> for you.</p>
      <textarea value={text} onChange={e => { setText(e.target.value); setRev(null); }} rows={10} className="w-full border rounded p-2 text-sm" placeholder="Aim: …&#10;Apparatus: …&#10;Observations: …&#10;Calculation: …&#10;Conclusion: …" aria-label="Your draft" data-testid="lab-text" />
      <button className={dark} disabled={!text.trim()} onClick={() => { const r = reviewLab(text); setRev(r); studentModel.record({ type: 'lab', n: r.issues.length }); track('lab_review'); }} data-testid="lab-review">Review my draft</button>
      {rev && <div className={box} data-testid="lab-result"><div className="font-semibold" data-testid="lab-score">Draft readiness {rev.score}/100</div>{rev.strengths.map(s => <div key={s} className="text-emerald-700">✓ {s}</div>)}
        {rev.issues.map((x, k) => <div key={k} className={`border-l-4 pl-2 ${x.level === 'fix' ? 'border-red-500' : 'border-amber-400'}`} data-testid="lab-issue"><div className="font-medium">{x.message}</div><div className="text-indigo-800">Ask yourself: {x.ask}</div></div>)}{!rev.issues.length && <div className="text-emerald-700">Nothing for me to flag. Read it once aloud before submitting.</div>}</div>}
      <form className="flex gap-2 items-center text-sm" onSubmit={e => { e.preventDefault(); setCoach(coachReply(ask) || 'Good question. Paste your attempt above and press Review. If you are stuck on a step, use “Check my work” to find the exact line.'); }}><input value={ask} onChange={e => setAsk(e.target.value)} placeholder="Ask for help (e.g. write my report)" className="border rounded px-2 py-1 flex-1" aria-label="Ask for help" data-testid="lab-ask" /><button className={btn}>Ask</button></form>
      {coach && <div className="text-sm bg-indigo-50 border border-indigo-200 rounded p-2" data-testid="lab-coach">{coach}</div>}
    </div>
  );
}

const TABS = [['predict', 'Predict & run'], ['exam', 'Mock exam'], ['check', 'Check my work'], ['lab', 'Lab report help']] as const;
export default function PracticeView() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('predict');
  return (
    <div className="h-full overflow-y-auto bg-white" data-testid="practice-view">
      <div className="px-4 md:px-8 pt-4"><h2 className="text-xl font-bold text-slate-800">Practice</h2></div>
      <div role="tablist" className="flex gap-1 px-4 md:px-8 border-b mt-2 overflow-x-auto">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} data-testid={`practice-tab-${k}`} onClick={() => setTab(k)} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 ${tab === k ? 'border-amber-600 text-amber-900 font-semibold' : 'border-transparent text-slate-600'}`}>{l}</button>)}</div>
      <div className="p-4 md:px-8 max-w-4xl">{tab === 'predict' ? <Predict /> : tab === 'exam' ? <Exam /> : tab === 'check' ? <CheckWork /> : <Lab />}</div>
    </div>
  );
}
