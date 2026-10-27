import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, GraduationCap, CheckCircle2, Circle, AlertTriangle } from 'lucide-react';
import { addTask, listTasks, removeTask, setDone, parseDue, today, label } from '../lib/planner';
import type { Task } from '../lib/planner';

/** Study planner: tasks and exams with due dates. Add with a form or in plain words ("revise optics by friday"). */
export default function PlannerView() {
  const [tasks, setTasks] = useState<Task[]>(() => listTasks());
  const [text, setText] = useState(''); const [due, setDue] = useState(''); const [exam, setExam] = useState(false); const [filter, setFilter] = useState<'open' | 'all' | 'done'>('open');
  useEffect(() => { const h = () => setTasks(listTasks()); window.addEventListener('nm:planner', h); window.addEventListener('storage', h); return () => { window.removeEventListener('nm:planner', h); window.removeEventListener('storage', h); }; }, []);
  const submit = (e: React.FormEvent) => { e.preventDefault(); const p = parseDue(text); const title = p.title || text.trim(); if (!title) return; addTask({ title, due: due || p.due, kind: exam ? 'exam' : 'task' }); setText(''); setDue(''); setExam(false); };
  const t0 = today(); const open = tasks.filter(t => !t.done); const done = tasks.filter(t => t.done);
  const overdue = open.filter(t => t.due && t.due < t0); const pct = tasks.length ? Math.round(done.length / tasks.length * 100) : 0;
  const shown = useMemo(() => (filter === 'open' ? open : filter === 'done' ? done : tasks), [filter, tasks]); // eslint-disable-line react-hooks/exhaustive-deps
  const nextExam = open.filter(t => t.kind === 'exam' && t.due >= t0).sort((a, b) => a.due.localeCompare(b.due))[0];
  return (
    <div className="h-full overflow-y-auto p-3 md:p-8 bg-slate-100" data-testid="planner-view"><div className="max-w-3xl mx-auto space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        {[['Open', open.length], ['Overdue', overdue.length], ['Done', done.length], ['Progress', pct + '%']].map(([k, v]) => <div key={k as string} className={`bg-white rounded-xl border p-3 ${k === 'Overdue' && overdue.length ? 'border-red-300' : 'border-slate-200'}`}><div className="text-2xl font-bold text-slate-800">{v}</div><div className="text-xs text-slate-500">{k}</div></div>)}
      </div>
      {nextExam && <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-sm text-amber-900 flex items-center gap-2"><GraduationCap className="w-4 h-4" /> Next exam: <b>{nextExam.title}</b> — {label(nextExam.due)} ({nextExam.due})</div>}
      <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-col sm:flex-row gap-2">
        <input data-testid="planner-input" value={text} onChange={e => setText(e.target.value)} placeholder="e.g. Revise thermodynamics by Friday" aria-label="New task" className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-300 text-sm" />
        <input type="date" value={due} onChange={e => setDue(e.target.value)} aria-label="Due date" className="px-2 py-2 rounded-lg border border-slate-300 text-sm" />
        <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={exam} onChange={e => setExam(e.target.checked)} /> Exam</label>
        <button data-testid="planner-add" type="submit" disabled={!text.trim()} className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold flex items-center justify-center gap-1 disabled:opacity-40"><Plus className="w-4 h-4" /> Add</button>
      </form>
      <div className="flex gap-1 text-xs">{(['open', 'all', 'done'] as const).map(f => <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-full border ${filter === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-300'}`}>{f[0].toUpperCase() + f.slice(1)}</button>)}</div>
      <ul className="space-y-2" data-testid="planner-list">
        {shown.length === 0 && <li className="text-sm text-slate-500 bg-white rounded-xl border border-dashed border-slate-300 p-6 text-center">{tasks.length ? 'Nothing here.' : 'No tasks yet. Add one above, or tell FRIDAY: “add task revise optics by Friday”.'}</li>}
        {shown.map(t => { const late = !t.done && t.due && t.due < t0; return (
          <li key={t.id} className={`bg-white rounded-xl border px-3 py-2 flex items-center gap-3 ${late ? 'border-red-300' : 'border-slate-200'}`}>
            <button onClick={() => setDone(t.id, !t.done)} aria-label={t.done ? 'Mark as not done' : 'Mark as done'} className="text-amber-600">{t.done ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}</button>
            <div className="flex-1 min-w-0"><div className={`text-sm ${t.done ? 'line-through text-slate-400' : 'text-slate-800'} break-words`}>{t.kind === 'exam' && <GraduationCap className="inline w-4 h-4 mr-1 text-amber-700" />}{t.title}</div><div className={`text-[11px] flex items-center gap-1 ${late ? 'text-red-600' : 'text-slate-500'}`}>{late && <AlertTriangle className="w-3 h-3" />}{label(t.due)}{t.due ? ` · ${t.due}` : ''}</div></div>
            <button onClick={() => removeTask(t.id)} aria-label={`Delete ${t.title}`} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
          </li>); })}
      </ul>
    </div></div>
  );
}
