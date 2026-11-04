import { useRef, useState } from 'react';
import { Upload, Download, Users, FileText } from 'lucide-react';
import { deck } from '../lib/friday/agentsRuntime';
import { cardsFromText } from '../lib/friday/agents/tutor';
import { buildReport, encodeReport, parseReport, classSummary, classCsv } from '../lib/friday/agents/report';
import type { Report } from '../lib/friday/agents/report';

const goTab = (t: string) => window.dispatchEvent(new CustomEvent('nm:friday-tab', { detail: t }));
const save = (name: string, text: string, type = 'application/json') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
const NAME = 'nm_student_name';
const getName = () => { try { return localStorage.getItem(NAME) || ''; } catch { return ''; } };

export function ClassPanel() {
  const [, force] = useState(0); const bump = () => force(x => x + 1);
  /* ---- quick start ---- */
  const [topic, setTopic] = useState(''); const [text, setText] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const readFile = async (f: File) => {
    setBusy(true); setMsg('');
    try {
      if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') { const { extractPdf } = await import('../lib/libraryStore'); const r = await extractPdf(f); setText(r.pageTexts.join('\n\n')); }
      else setText(await f.text());
      if (!topic) setTopic(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 40));
    } catch { setMsg('Could not read that file. Try pasting the text instead.'); }
    setBusy(false);
  };
  const build = () => {
    const t = topic.trim() || 'my notes'; const cs = cardsFromText(text, t, 'quick start'); if (!cs.length) { setMsg('I found no definitions or formulas to turn into cards. Try notes with sentences like “X is …” or “X = …”.'); return; }
    const n = deck.add(cs); setMsg(`Made ${n} flashcard${n === 1 ? '' : 's'} for “${t}”. Starting your quiz…`); bump(); setTimeout(() => goTab('tutor'), 600);
  };
  /* ---- student report ---- */
  const [name, setName] = useState(getName());
  const exportReport = () => { try { localStorage.setItem(NAME, name); } catch { /* ignore */ } const r = buildReport(deck, name || 'Student'); save(`report-${r.student.replace(/\W+/g, '-').toLowerCase()}-${new Date(r.issued).toISOString().slice(0, 10)}.json`, encodeReport(r)); };
  const mine = buildReport(deck, name || 'Student');
  /* ---- teacher view ---- */
  const [reports, setReports] = useState<Report[]>([]); const [errs, setErrs] = useState<string[]>([]); const inp = useRef<HTMLInputElement>(null);
  const load = async (files: FileList | null) => {
    if (!files) return; const ok: Report[] = [], bad: string[] = [];
    for (const f of Array.from(files)) { const p = parseReport(await f.text()); if (p.ok) ok.push(p.report); else bad.push(`${f.name}: ${p.why}`); }
    setReports(r => [...r, ...ok]); setErrs(bad);
  };
  const sum = classSummary(reports); const pct = (x: number) => `${Math.round(x * 100)}%`;
  const bar = (x: number) => <span className="inline-block w-20 h-2 bg-slate-200 rounded align-middle"><span className={`block h-2 rounded ${x < 0.5 ? 'bg-red-500' : x < 0.75 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: pct(x) }} /></span>;
  const card = 'border rounded p-3 text-xs space-y-2';
  return (
    <div className="p-4 overflow-y-auto h-full bg-white text-sm space-y-4" data-testid="class-panel">
      <section className={card} data-testid="quickstart">
        <div className="flex items-center gap-2"><FileText className="w-4 h-4" /><b>Quick start: notes → flashcards → quiz in under 2 minutes</b></div>
        <div className="flex gap-2 flex-wrap items-center">
          <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="topic (e.g. thermodynamics)" className="border rounded px-2 py-1" data-testid="qs-topic" />
          <label className="px-2 py-1 border rounded cursor-pointer flex items-center gap-1"><Upload className="w-3 h-3" /> PDF or text file<input type="file" accept=".pdf,.txt,.md,text/plain,application/pdf" className="hidden" data-testid="qs-file" onChange={e => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ''; }} /></label>
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={4} placeholder="…or paste your notes here" className="w-full border rounded p-2" data-testid="qs-text" />
        <div className="flex items-center gap-2"><button onClick={build} disabled={busy || !text.trim()} className="px-3 py-1.5 rounded bg-slate-900 text-white disabled:opacity-50" data-testid="qs-build">{busy ? 'Reading…' : 'Make cards and start'}</button><span className="text-emerald-700" data-testid="qs-msg">{msg}</span></div>
      </section>

      <section className={card} data-testid="my-report">
        <div className="flex items-center gap-2"><Download className="w-4 h-4" /><b>My progress report</b></div>
        <p className="text-slate-600">Share this small file with your teacher. It contains topic mastery, exam dates and study activity — never your notes.</p>
        <div className="flex gap-2 flex-wrap items-center"><input value={name} onChange={e => setName(e.target.value)} placeholder="your name" className="border rounded px-2 py-1" data-testid="rep-name" /><button onClick={exportReport} className="px-3 py-1.5 rounded border" data-testid="rep-export">Export report</button></div>
        <div className="text-slate-500" data-testid="rep-preview">{mine.cards} cards · {mine.topics.length} topic(s) · {mine.activeDays30} active day(s) in the last 30</div>
      </section>

      <section className={card} data-testid="teacher">
        <div className="flex items-center gap-2"><Users className="w-4 h-4" /><b>Class dashboard (teacher)</b></div>
        <p className="text-slate-600">Import your students’ report files. Everything stays on this device. Reports are self-reported (checked for damage, not for identity).</p>
        <div className="flex gap-2 flex-wrap"><button onClick={() => inp.current?.click()} className="px-3 py-1.5 rounded border" data-testid="cls-import">Import reports…</button><input ref={inp} type="file" multiple accept=".json,application/json" className="hidden" data-testid="cls-file" onChange={e => { void load(e.target.files); e.target.value = ''; }} />
          {reports.length > 0 && <><button onClick={() => save('class-summary.csv', classCsv(sum), 'text/csv')} className="px-3 py-1.5 rounded border" data-testid="cls-csv">Download CSV</button><button onClick={() => { setReports([]); setErrs([]); }} className="text-red-700 underline">Clear</button></>}</div>
        {errs.map((e, i) => <div key={i} className="text-red-700" data-testid="cls-err">{e}</div>)}
        {sum.students > 0 && <div data-testid="cls-summary" className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center"><div className="border rounded p-2"><div className="text-lg font-bold" data-testid="cls-n">{sum.students}</div>students</div><div className="border rounded p-2"><div className="text-lg font-bold">{pct(sum.avgMastery)}</div>avg mastery</div><div className="border rounded p-2"><div className="text-lg font-bold">{sum.activeStudents}</div>active (3+ days)</div></div>
          {sum.atRisk.length > 0 && <div className="border border-red-200 bg-red-50 rounded p-2" data-testid="cls-risk"><b>Needs attention</b>{sum.atRisk.slice(0, 8).map((r, i) => <div key={i}>• {r.student}: {r.why}</div>)}</div>}
          <div><b>Weakest topics</b>{sum.topics.slice(0, 8).map(t => <div key={t.topic} className="flex items-center gap-2 py-0.5"><span className="w-32 truncate">{t.topic}</span>{bar(t.avg)}<span>{pct(t.avg)}</span><span className="text-slate-400">{t.weak.length ? `${t.weak.length} below 60%` : ''}</span></div>)}</div>
          <div><b>Students</b>{sum.roster.map(r => <div key={r.student} className="flex items-center gap-2 py-0.5"><span className="w-32 truncate">{r.student}</span>{bar(r.mastery)}<span>{pct(r.mastery)}</span><span className="text-slate-400">{r.activeDays30}d active{r.stale ? ' · report is old' : ''}</span></div>)}</div>
        </div>}
      </section>
    </div>
  );
}
