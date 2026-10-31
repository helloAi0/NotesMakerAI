import { useEffect, useState } from 'react';
import { Flame, NotebookPen, FileText, Activity, Bot, Calendar, Sparkles, Wifi, WifiOff } from 'lucide-react';
import { stats } from '../lib/activity';
import { listTasks, today, label } from '../lib/planner';
import { listDocs } from '../lib/libraryStore';
import { noteDocs } from '../lib/friday';
import { SIMS } from '../sims/registry';
import type { ViewId } from '../lib/agentBus';
import { send } from '../lib/friday/brain';

/** Home screen: everything is computed from data on this device. */
export default function DashboardView({ go }: { go: (v: ViewId) => void }) {
  const [, tick] = useState(0); const [pdfs, setPdfs] = useState(0); const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { const r = () => tick(n => n + 1); const on = () => setOnline(true), off = () => setOnline(false); ['nm:planner', 'nm:activity', 'nm:library'].forEach(e => window.addEventListener(e, r)); window.addEventListener('online', on); window.addEventListener('offline', off); void listDocs().then(d => setPdfs(d.length)); return () => { ['nm:planner', 'nm:activity', 'nm:library'].forEach(e => window.removeEventListener(e, r)); window.removeEventListener('online', on); window.removeEventListener('offline', off); }; }, []);
  const st = stats(); const t0 = today(); const open = listTasks().filter(t => !t.done); const upcoming = open.slice(0, 5); const overdue = open.filter(t => t.due && t.due < t0).length;
  const notes = noteDocs().length; const max = Math.max(1, ...st.week.map(w => w.n));
  const uni = SIMS.filter(s => (s.educationLevels ?? []).some(l => /under|post|grad/i.test(String(l)))); const pool = uni.length ? uni : SIMS; const pick = pool[Math.floor(Date.now() / 86400000) % pool.length];
  const hour = new Date().getHours(); const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const card = (icon: React.ReactNode, v: string | number, k: string, onClick?: () => void) => <button onClick={onClick} className="bg-white rounded-xl border border-slate-200 p-4 text-left hover:border-amber-400 transition"><div className="flex items-center gap-2 text-amber-700 mb-1">{icon}</div><div className="text-2xl font-bold text-slate-800">{v}</div><div className="text-xs text-slate-500">{k}</div></button>;
  return (
    <div className="h-full overflow-y-auto p-3 md:p-8 bg-slate-100" data-testid="dashboard-view"><div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-2xl font-bold text-slate-800">{greet}!</h2><p className="text-sm text-slate-600">{st.streak > 0 ? `You are on a ${st.streak}-day study streak.` : 'Start a streak today: open a simulation or write a note.'}</p></div>
        <span className={`text-xs px-3 py-1 rounded-full border flex items-center gap-1 ${online ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-200 border-slate-300 text-slate-700'}`}>{online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}{online ? 'Online' : 'Offline — everything still works'}</span></div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {card(<Flame className="w-5 h-5" />, st.streak, 'day streak')}
        {card(<Activity className="w-5 h-5" />, `${st.simsExplored}/${SIMS.length}`, 'simulations explored', () => go('simulations'))}
        {card(<NotebookPen className="w-5 h-5" />, notes, 'note pages', () => go('notebook'))}
        {card(<FileText className="w-5 h-5" />, pdfs, 'PDFs in library', () => go('library'))}
        {card(<Calendar className="w-5 h-5" />, open.length, overdue ? `open tasks · ${overdue} overdue` : 'open tasks', () => go('planner'))}
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <section className="bg-white rounded-2xl border border-slate-200 p-4 md:col-span-2"><h3 className="font-semibold text-slate-700 text-sm mb-3">Your week</h3>
          <div className="flex items-end gap-2 h-28" role="img" aria-label="Activity over the last seven days">{st.week.map((w, i) => <div key={i} className="flex-1 flex flex-col items-center gap-1"><div className="w-full rounded-t bg-amber-500/80" style={{ height: `${Math.max(4, w.n / max * 100)}%` }} title={`${w.n} actions`} /><span className="text-[10px] text-slate-500">{w.label}</span></div>)}</div></section>
        <section className="bg-white rounded-2xl border border-slate-200 p-4"><h3 className="font-semibold text-slate-700 text-sm mb-2">Up next</h3>
          {upcoming.length ? <ul className="space-y-1.5 text-sm">{upcoming.map(t => <li key={t.id} className="flex justify-between gap-2"><span className="truncate">{t.title}</span><span className={`text-xs shrink-0 ${t.due && t.due < t0 ? 'text-red-600' : 'text-slate-500'}`}>{label(t.due)}</span></li>)}</ul> : <p className="text-xs text-slate-500">Nothing planned. Say “add task …” to FRIDAY.</p>}
          <button onClick={() => go('planner')} className="mt-3 text-xs text-amber-700 font-semibold hover:underline">Open planner →</button></section>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <section className="bg-white rounded-2xl border border-slate-200 p-4"><h3 className="font-semibold text-slate-700 text-sm mb-2 flex items-center gap-1"><Sparkles className="w-4 h-4 text-amber-600" /> Try today</h3><p className="font-medium text-slate-800">{pick.title}</p><p className="text-xs text-slate-600 mb-3">{pick.blurb}</p><button onClick={() => { go('simulations'); void send(`open ${pick.title}`); }} className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold">Open simulation</button></section>
        <section className="bg-white rounded-2xl border border-slate-200 p-4"><h3 className="font-semibold text-slate-700 text-sm mb-2 flex items-center gap-1"><Bot className="w-4 h-4 text-amber-600" /> Quick actions</h3><div className="flex flex-wrap gap-2 text-xs">
          {[['Ask FRIDAY', () => go('friday')], ['New note', () => go('notebook')], ['Generate notes', () => go('generator')], ['Import PDFs', () => { go('library'); void send('import pdfs'); }], ['Explore simulations', () => go('simulations')]].map(([l, f]) => <button key={l as string} onClick={f as () => void} className="px-3 py-1.5 rounded-full border border-amber-300 bg-amber-50 text-amber-900 font-semibold hover:bg-amber-100">{l as string}</button>)}</div></section>
      </div>
    </div></div>
  );
}
