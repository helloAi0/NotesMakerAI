import { useEffect, useMemo, useState } from 'react';
import { deck, studentModel } from '../lib/friday/agentsRuntime';
import { buildGraph, explainConcept, recommend, outcomes } from '../lib/platform/model';
import type { Graph, GNode, NoteInfo } from '../lib/platform/model';
import { collectNotes } from '../lib/platform/notes';
import { SIMS } from '../sims/registry';

const KIND_COL: Record<string, string> = { concept: '#b45309', mistake: '#dc2626', sim: '#2563eb', note: '#059669', exam: '#7c3aed' };
const pct = (x: number | null) => (x == null ? '–' : `${Math.round(x * 100)}%`);

function GraphSvg({ g, sel, onSel }: { g: Graph; sel: string | null; onSel: (id: string) => void }) {
  const W = 640, H = 420, cx = W / 2, cy = H / 2; const concepts = g.nodes.filter(n => n.kind === 'concept'); const pos = new Map<string, { x: number; y: number }>();
  concepts.forEach((c, i) => { const a = (i / Math.max(1, concepts.length)) * Math.PI * 2 - Math.PI / 2; const R = concepts.length === 1 ? 0 : 135; pos.set(c.id, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }); });
  const kids = new Map<string, GNode[]>(); for (const e of g.edges) { const c = pos.has(e.b) ? e.b : pos.has(e.a) ? e.a : null; if (!c) continue; const o = g.nodes.find(n => n.id === (c === e.b ? e.a : e.b)); if (o && o.kind !== 'concept') { const l = kids.get(c) ?? []; if (!l.includes(o)) l.push(o); kids.set(c, l); } }
  const place = new Map<string, { x: number; y: number }>(); for (const [c, list] of kids) { const p = pos.get(c)!; const base = Math.atan2(p.y - cy, p.x - cx); list.forEach((o, i) => { if (place.has(o.id)) return; const a = base + (i - (list.length - 1) / 2) * 0.55; place.set(o.id, { x: p.x + 62 * Math.cos(a), y: p.y + 62 * Math.sin(a) }); }); }
  const at = (id: string) => pos.get(id) ?? place.get(id);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full border rounded bg-slate-50" role="img" aria-label="Knowledge graph of your concepts, mistakes, simulations, notes and exams" data-testid="graph-svg">
      {g.edges.map((e, i) => { const a = at(e.a), b = at(e.b); return a && b ? <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#cbd5e1" strokeWidth={1 + Math.min(2, e.w)} /> : null; })}
      {g.nodes.map(n => { const p = at(n.id); if (!p) return null; const r = n.kind === 'concept' ? 14 + Math.min(10, n.weight) : 7; const m = n.mastery; const fill = n.kind === 'concept' ? (m ?? 0) < 0.5 ? '#ef4444' : (m ?? 0) < 0.75 ? '#f59e0b' : '#10b981' : KIND_COL[n.kind];
        return <g key={n.id} onClick={() => onSel(n.id)} style={{ cursor: 'pointer' }} tabIndex={0} role="button" aria-label={`${n.kind} ${n.label}`} onKeyDown={e => { if (e.key === 'Enter') onSel(n.id); }}><circle cx={p.x} cy={p.y} r={r} fill={fill} stroke={sel === n.id ? '#0f172a' : '#fff'} strokeWidth={sel === n.id ? 3 : 1.5} /><text x={p.x} y={p.y + r + 11} fontSize="10" textAnchor="middle" fill="#334155">{n.label.slice(0, 22)}</text></g>; })}
    </svg>
  );
}

export default function ProgressView() {
  const [tab, setTab] = useState<'graph' | 'outcomes'>('graph'); const [notes, setNotes] = useState<NoteInfo[]>([]); const [sel, setSel] = useState<string | null>(null); const [tick, setTick] = useState(0);
  useEffect(() => { void collectNotes().then(setNotes); const h = () => setTick(t => t + 1); window.addEventListener('nm:activity', h); return () => window.removeEventListener('nm:activity', h); }, []);
  const g = useMemo(() => buildGraph({ deck, events: studentModel.events(), sims: SIMS.map(s => ({ id: s.id, title: s.title, tags: s.tags, subject: s.subject })), notes }), [notes, tick]);
  const o = useMemo(() => outcomes(studentModel), [tick]); const rec = recommend(g, 3); const node = g.nodes.find(n => n.id === sel); const ex = node?.kind === 'concept' ? explainConcept(g, node.label) : null;
  const tabBtn = (k: typeof tab, l: string) => <button role="tab" aria-selected={tab === k} data-testid={`progress-tab-${k}`} onClick={() => setTab(k)} className={`px-4 py-2 text-sm border-b-2 ${tab === k ? 'border-amber-600 text-amber-900 font-semibold' : 'border-transparent text-slate-600'}`}>{l}</button>;
  const empty = !deck.cards().length;
  return (
    <div className="h-full overflow-y-auto bg-white" data-testid="progress-view">
      <div className="px-4 md:px-8 pt-4"><h2 className="text-xl font-bold text-slate-800">My progress</h2><p className="text-sm text-slate-600">One model of you: concepts, mistakes, simulations you ran, notes and exam dates, all linked. Stored only on this device.</p></div>
      <div role="tablist" className="flex gap-2 px-4 md:px-8 border-b mt-3">{tabBtn('graph', 'Knowledge graph')}{tabBtn('outcomes', 'Learning outcomes')}</div>
      <div className="p-4 md:px-8 space-y-4 max-w-5xl">
        {empty && <div className="border border-amber-200 bg-amber-50 rounded p-3 text-sm" data-testid="progress-empty">Nothing to show yet. Make flashcards in <b>Practice → Quick start</b> or in the Lecture tool, answer a quiz, run a simulation, and this page fills in.</div>}
        {tab === 'graph' && <>
          {rec.length > 0 && !empty && <div className="border rounded p-3 text-sm" data-testid="graph-rec"><b>Work on next</b>{rec.map(r => <div key={r.topic} className="text-slate-700">• <button className="underline" onClick={() => setSel('c:' + r.topic.toLowerCase())}>{r.topic}</button> — {r.why}</div>)}</div>}
          {g.nodes.length > 0 && <GraphSvg g={g} sel={sel} onSel={setSel} />}
          <div className="flex gap-3 flex-wrap text-xs">{Object.entries(KIND_COL).map(([k, c]) => <span key={k} className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: c }} />{k}</span>)}<span className="text-slate-500">concept colour = mastery (red weak, amber ok, green strong)</span></div>
          {node && <div className="border rounded p-3 text-sm space-y-1" data-testid="graph-detail"><b>{node.label}</b> <span className="text-slate-500">({node.kind}{node.meta ? ' · ' + node.meta : ''})</span>
            {ex && <><div>Mastery {pct(ex.mastery)}{ex.exam ? ` · exam in ${ex.exam.days} day${ex.exam.days === 1 ? '' : 's'}` : ''}</div>{ex.mistakes.length > 0 && <div>Mistakes: {ex.mistakes.join('; ')}</div>}{ex.sims.length > 0 && <div>Simulations you ran: {ex.sims.join('; ')}</div>}{ex.notes.length > 0 && <div>Notes: {ex.notes.join('; ')}</div>}<div className="text-emerald-800">Next: {ex.next}</div></>}</div>}
        </>}
        {tab === 'outcomes' && <div className="space-y-4" data-testid="outcomes">
          <div className={`rounded p-3 text-sm border ${o.evidence === 'usable' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`} data-testid="evidence-level">{o.evidence === 'none' ? 'Not enough data yet to show results. Review at least 10 cards or quiz answers.' : o.evidence === 'early' ? 'Early data. Keep using it for a couple of weeks and take several quizzes to see a real trend.' : 'Enough data for a first look at your trend.'}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-xs">
            {[['Active days (30d)', o.activeDays30], ['Cards reviewed', o.reviews], ['Quizzes', o.quizzes], ['Prediction accuracy', pct(o.predictions.right)]].map(([l, v]) => <div key={l as string} className="border rounded p-3"><div className="text-xl font-bold">{v}</div>{l}</div>)}</div>
          <div className="border rounded p-3 text-sm" data-testid="quiz-gain"><b>Quiz score</b>: {o.quiz.n === 0 ? 'no quizzes yet' : <>first {pct(o.quiz.first)} → latest {pct(o.quiz.latest)}{o.quiz.gain != null && <span className={o.quiz.gain >= 0 ? 'text-emerald-700' : 'text-red-700'}> ({o.quiz.gain >= 0 ? '+' : ''}{Math.round(o.quiz.gain * 100)} points)</span>} <span className="text-slate-500">({o.quiz.n} quiz{o.quiz.n === 1 ? '' : 'zes'})</span></>}</div>
          <div className="border rounded p-3 text-sm"><b>Retention</b> <span className="text-slate-500">— share of reviews you recalled (Good/Easy) by days since the last review</span>
            <div className="mt-2 space-y-1">{o.retention.map(r => <div key={r.label} className="flex items-center gap-2 text-xs"><span className="w-20">{r.label}</span><span className="flex-1 h-2 bg-slate-200 rounded"><span className="block h-2 rounded bg-emerald-500" style={{ width: pct(r.recalled) === '–' ? '0%' : pct(r.recalled) }} /></span><span className="w-24 text-right">{r.recalled == null ? `need ${3 - r.n > 0 ? 3 - r.n : 0}+ reviews` : `${pct(r.recalled)} (n=${r.n})`}</span></div>)}</div></div>
          <div className="border rounded p-3 text-sm"><b>Mastery over time</b>: {o.masteryGrowth.points < 2 ? 'builds up as you study on different days.' : `${pct(o.masteryGrowth.from)} → ${pct(o.masteryGrowth.to)} across ${o.masteryGrowth.points} snapshots.`}</div>
          <div className="border rounded p-3 text-sm" data-testid="time-saved"><b>Estimated time saved</b>: about {o.timeSaved.minutes} min <span className="text-slate-500">(estimate, not a measurement)</span><ul className="text-xs text-slate-500 list-disc ml-5 mt-1">{o.timeSaved.assumptions.map(a => <li key={a}>{a}</li>)}</ul></div>
        </div>}
      </div>
    </div>
  );
}
