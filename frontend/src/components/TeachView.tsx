import { useEffect, useMemo, useRef, useState } from 'react';
import { deck, studentModel } from '../lib/friday/agentsRuntime';
import { SIMS } from '../sims/registry';
import { buildCourse, encodePack, parsePack, importPack } from '../lib/platform/course';
import type { Pack } from '../lib/platform/course';
import { parseQuestions, makeTest, parseTest, makeResult, parseResult, pilotSummary } from '../lib/platform/pilot';
import type { PilotTest, PilotResult } from '../lib/platform/pilot';
import { Room, broadcastTransport, P2P } from '../lib/platform/room';
import { ClassPanel } from './ClassPanel';
import { track } from '../lib/analytics';

const box = 'border rounded p-3 text-sm space-y-2'; const btn = 'px-3 py-1.5 rounded border text-sm hover:bg-slate-50 disabled:opacity-50'; const dark = 'px-3 py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50';
const save = (name: string, text: string, type = 'application/json') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
const slug = (s: string) => s.toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'file';

/* ---------------- Course pack ---------------- */
function Course() {
  const [title, setTitle] = useState(''); const [syl, setSyl] = useState(''); const [mat, setMat] = useState(''); const [weeks, setWeeks] = useState(''); const [exam, setExam] = useState('');
  const [pack, setPack] = useState<Pack | null>(null); const [err, setErr] = useState(''); const [imp, setImp] = useState(''); const sims = useMemo(() => SIMS.map(s => ({ id: s.id, title: s.title, tags: s.tags, subject: s.subject })), []);
  const build = () => { const examAt = exam ? new Date(exam + 'T09:00:00').getTime() : null; const r = buildCourse({ title: title || 'My course', syllabus: syl, material: mat, sims, weeks: weeks ? +weeks : undefined, examAt }); if ('error' in r) { setErr(r.error); setPack(null); return; } setErr(''); setPack(r); studentModel.record({ type: 'course', n: r.units.length }); track('course_built'); };
  const readFile = async (f: File) => { if (/\.pdf$/i.test(f.name)) { const { extractPdf } = await import('../lib/libraryStore'); setMat((await extractPdf(f)).pageTexts.join('\n\n')); } else setMat(await f.text()); };
  const total = pack?.units.reduce((a, u) => a + u.cards.length, 0) ?? 0;
  return (
    <div className="space-y-4" data-testid="course">
      <p className="text-sm text-slate-600">Paste a syllabus (one unit per line). FRIDAY builds the whole course: flashcards from your material, simulation assignments and a week-by-week exam plan. You get one small file to give your students.</p>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="space-y-2"><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Course title" className="border rounded px-2 py-1 text-sm w-full" aria-label="Course title" data-testid="course-title" />
          <textarea value={syl} onChange={e => setSyl(e.target.value)} rows={8} className="w-full border rounded p-2 text-sm" placeholder={'Unit 1: Thermodynamics — heat, work, entropy\nUnit 2: Kinematics\n  - velocity, acceleration\n3. Waves and Optics'} aria-label="Syllabus" data-testid="course-syllabus" /></div>
        <div className="space-y-2"><textarea value={mat} onChange={e => setMat(e.target.value)} rows={6} className="w-full border rounded p-2 text-sm" placeholder="Optional: paste lecture notes or textbook text. Cards are made only from text that matches each unit." aria-label="Course material" data-testid="course-material" />
          <div className="flex gap-2 items-center flex-wrap text-xs"><label className={`${btn} cursor-pointer`}>Load PDF or text<input type="file" accept=".pdf,.txt,.md" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ''; }} /></label>
            <label>Weeks <input value={weeks} onChange={e => setWeeks(e.target.value.replace(/\D/g, ''))} className="border rounded px-1 py-1 w-12" inputMode="numeric" aria-label="Weeks" /></label><label>or exam date <input type="date" value={exam} onChange={e => setExam(e.target.value)} className="border rounded px-1 py-1" aria-label="Exam date" data-testid="course-exam" /></label></div></div></div>
      <button className={dark} disabled={!syl.trim()} onClick={build} data-testid="course-build">Build course pack</button>{err && <span className="text-xs text-red-700 ml-2" data-testid="course-err">{err}</span>}
      {pack && <div className={box} data-testid="course-pack"><div className="font-semibold" data-testid="course-summary">{pack.title}: {pack.units.length} units · {total} flashcards · {pack.units.reduce((a, u) => a + u.sims.length, 0)} simulation assignments · {pack.plan.length}-week plan</div>
        <div className="grid md:grid-cols-2 gap-2">{pack.units.map(u => <div key={u.title} className="border rounded p-2 text-xs"><b>{u.title}</b><div className="text-slate-500">{u.topics.slice(0, 6).join(', ')}</div><div>{u.cards.length} cards{u.cards.length === 0 ? ' (add material to get cards)' : ''}</div>{u.sims.map(s => <div key={s.id} className="text-blue-700">▶ {s.title}</div>)}</div>)}</div>
        <details><summary className="cursor-pointer">Week-by-week plan</summary>{pack.plan.map(w => <div key={w.week} className="text-xs py-1"><b>Week {w.week}: {w.label}</b><ul className="list-disc ml-5">{w.tasks.slice(0, 5).map((t, i) => <li key={i}>{t}</li>)}</ul></div>)}</details>
        <button className={btn} onClick={() => save(`course-${slug(pack.title)}.json`, encodePack(pack))} data-testid="course-download">Download pack for students</button></div>}
      <div className={box} data-testid="course-import"><b>Student: import a course pack</b><div className="flex gap-2 items-center flex-wrap"><label className={`${btn} cursor-pointer`}>Choose pack file<input type="file" accept=".json" className="hidden" data-testid="course-file" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const r = parsePack(await f.text()); if (!r.ok) setImp(r.why); else { const g = importPack(deck, r.pack); setImp(`Added ${g.cards} flashcards from ${g.units} units${g.exam ? ' and the exam date' : ''}. Open Practice → Mock exam or the Tutor to start.`); } e.target.value = ''; }} /></label><span className="text-xs" data-testid="course-imp-msg">{imp}</span></div></div>
    </div>
  );
}

/* ---------------- Pilot kit ---------------- */
function Pilot() {
  const [title, setTitle] = useState('Pilot test'); const [qs, setQs] = useState(''); const [parsed, setParsed] = useState<{ n: number; errors: string[] } | null>(null);
  const [test, setTest] = useState<PilotTest | null>(null); const [phase, setPhase] = useState<'pre' | 'post'>('pre'); const [name, setName] = useState(() => { try { return localStorage.getItem('nm_student_name') || ''; } catch { return ''; } }); const [ch, setCh] = useState<(number | null)[]>([]); const [sv, setSv] = useState({ useful: 4, easier: 4, wouldRecommend: 8, trust: 4 }); const [done, setDone] = useState('');
  const [results, setResults] = useState<PilotResult[]>([]); const [errs, setErrs] = useState<string[]>([]); const sum = useMemo(() => pilotSummary(results), [results]);
  const build = () => { const r = parseQuestions(qs); setParsed({ n: r.questions.length, errors: r.errors }); if (r.questions.length) save(`pilot-test-${slug(title)}.json`, JSON.stringify(makeTest(title, r.questions), null, 2)); };
  const fromDeck = () => { const q = deck.quiz(null, 10); setQs(q.map(x => [x.q, x.options[x.answer], ...x.options.filter((_, i) => i !== x.answer)].join(' | ')).join('\n')); };
  const finish = () => { if (!test) return; const r = makeResult(test, phase, name, ch, Date.now(), phase === 'post' ? sv : undefined); save(`pilot-${phase}-${slug(name || 'student')}.json`, JSON.stringify(r, null, 2)); setDone(`Saved your ${phase === 'pre' ? 'before' : 'after'} result: ${r.score}/${r.n}. Give the file to your teacher.`); studentModel.record({ type: 'quiz', score: r.score, n: r.n }); };
  const loadResults = async (files: FileList | null) => { if (!files) return; const ok: PilotResult[] = [], bad: string[] = []; for (const f of Array.from(files)) { const p = parseResult(await f.text()); if (p.ok) ok.push(p.r); else bad.push(`${f.name}: ${p.why}`); } setResults(r => [...r, ...ok]); setErrs(bad); };
  const pct = (x: number | null) => (x == null ? '–' : `${Math.round(x * 100)}%`);
  return (
    <div className="space-y-4" data-testid="pilot">
      <p className="text-sm text-slate-600">Run a real pilot: the same short test <b>before</b> and <b>after</b> a few weeks, plus a 4-question survey. You get the average gain with a confidence interval, and an honest verdict. Aim for 30+ students.</p>
      <div className={box}><b>1. Teacher: make the test</b><input value={title} onChange={e => setTitle(e.target.value)} className="border rounded px-2 py-1 w-full" aria-label="Test title" />
        <textarea value={qs} onChange={e => setQs(e.target.value)} rows={5} className="w-full border rounded p-2" placeholder={'One question per line: question | correct answer | wrong | wrong\nWhat is the SI unit of force? | newton | joule | watt'} aria-label="Questions" data-testid="pilot-qs" />
        <div className="flex gap-2 flex-wrap items-center"><button className={dark} disabled={!qs.trim()} onClick={build} data-testid="pilot-make">Download test file</button><button className={btn} onClick={fromDeck}>Use my flashcards as questions</button>{parsed && <span className="text-xs" data-testid="pilot-parsed">{parsed.n} question(s){parsed.errors.length ? ' · ' + parsed.errors.join(' ') : ''}</span>}</div></div>
      <div className={box}><b>2. Student: take the test</b>
        <div className="flex gap-2 items-center flex-wrap"><label className={`${btn} cursor-pointer`}>Open test file<input type="file" accept=".json" className="hidden" data-testid="pilot-testfile" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const r = parseTest(await f.text()); if (r.ok) { setTest(r.test); setCh(r.test.questions.map(() => null)); setDone(''); } else setDone(r.why); e.target.value = ''; }} /></label>
          <select value={phase} onChange={e => setPhase(e.target.value as 'pre' | 'post')} className="border rounded px-2 py-1" aria-label="Before or after" data-testid="pilot-phase"><option value="pre">Before (start of pilot)</option><option value="post">After (end of pilot)</option></select><input value={name} onChange={e => setName(e.target.value)} placeholder="your name" className="border rounded px-2 py-1" aria-label="Your name" data-testid="pilot-name" /></div>
        {test && <div className="space-y-2" data-testid="pilot-take">{test.questions.map((q, i) => <div key={i}><div className="font-medium">{i + 1}. {q.q}</div>{q.options.map((o, k) => <label key={k} className="block text-xs"><input type="radio" name={`pq${i}`} checked={ch[i] === k} onChange={() => setCh(c => c.map((v, j) => (j === i ? k : v)))} /> {o}</label>)}</div>)}
          {phase === 'post' && <div className="border-t pt-2 text-xs space-y-1"><b>Short survey</b>{([['useful', 'The app helped me study'], ['easier', 'It made studying easier'], ['trust', 'I trusted its answers']] as const).map(([k, l]) => <label key={k} className="block">{l} (1–5) <input type="number" min={1} max={5} value={sv[k]} onChange={e => setSv(s => ({ ...s, [k]: Math.max(1, Math.min(5, +e.target.value || 1)) }))} className="border rounded w-12 px-1" /></label>)}<label className="block">How likely are you to recommend it? (0–10) <input type="number" min={0} max={10} value={sv.wouldRecommend} onChange={e => setSv(s => ({ ...s, wouldRecommend: Math.max(0, Math.min(10, +e.target.value || 0)) }))} className="border rounded w-12 px-1" /></label></div>}
          <button className={dark} disabled={ch.some(c => c == null) || !name.trim()} onClick={finish} data-testid="pilot-finish">Finish and save my result</button></div>}
        {done && <div className="text-xs text-emerald-700" data-testid="pilot-done">{done}</div>}</div>
      <div className={box} data-testid="pilot-analysis"><b>3. Teacher: see the result</b><div className="flex gap-2"><label className={`${btn} cursor-pointer`}>Import result files<input type="file" multiple accept=".json" className="hidden" data-testid="pilot-resfile" onChange={e => { void loadResults(e.target.files); e.target.value = ''; }} /></label>{results.length > 0 && <button className={btn} onClick={() => setResults([])}>Clear</button>}</div>
        {errs.map((e, i) => <div key={i} className="text-xs text-red-700">{e}</div>)}
        {results.length > 0 && <div className="space-y-2" data-testid="pilot-summary"><div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-xs"><div className="border rounded p-2"><div className="text-lg font-bold" data-testid="pilot-pairs">{sum.pairs}</div>students with before+after</div><div className="border rounded p-2"><div className="text-lg font-bold">{pct(sum.meanPre)} → {pct(sum.meanPost)}</div>average score</div><div className="border rounded p-2"><div className="text-lg font-bold" data-testid="pilot-gain">{sum.meanGainPts == null ? '–' : `${sum.meanGainPts >= 0 ? '+' : ''}${Math.round(sum.meanGainPts)} pts`}</div>{sum.ci95 ? `95% CI ${Math.round(sum.ci95[0])} to ${Math.round(sum.ci95[1])}` : 'CI needs 2+ students'}</div><div className="border rounded p-2"><div className="text-lg font-bold">{sum.improved}/{sum.pairs}</div>improved</div></div>
          <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs" data-testid="pilot-verdict">{sum.verdict}</div>{sum.survey && <div className="text-xs" data-testid="pilot-survey">Survey ({sum.survey.n}): useful {sum.survey.useful.toFixed(1)}/5 · easier {sum.survey.easier.toFixed(1)}/5 · trust {sum.survey.trust.toFixed(1)}/5 · NPS {sum.survey.nps}</div>}
          <button className={btn} onClick={() => save('pilot-summary.md', `# Pilot summary\n\n- Students with before and after: ${sum.pairs}\n- Average: ${pct(sum.meanPre)} → ${pct(sum.meanPost)} (${sum.meanGainPts == null ? 'n/a' : Math.round(sum.meanGainPts) + ' points'})\n${sum.ci95 ? `- 95% confidence interval: ${Math.round(sum.ci95[0])} to ${Math.round(sum.ci95[1])} points\n` : ''}- Improved: ${sum.improved}, same: ${sum.same}, worse: ${sum.worse}\n${sum.survey ? `- Survey (n=${sum.survey.n}): useful ${sum.survey.useful.toFixed(1)}/5, easier ${sum.survey.easier.toFixed(1)}/5, trust ${sum.survey.trust.toFixed(1)}/5, NPS ${sum.survey.nps}\n` : ''}\n**Verdict:** ${sum.verdict}\n\n_Self-reported files; checksums detect edits but do not prove identity. No control group._\n`, 'text/markdown')}>Download summary</button></div>}</div>
    </div>
  );
}

/* ---------------- Study rooms ---------------- */
function Rooms() {
  const [name, setName] = useState(() => { try { return localStorage.getItem('nm_student_name') || 'Student'; } catch { return 'Student'; } }); const [code, setCode] = useState('class'); const roomRef = useRef<Room | null>(null); const [, force] = useState(0); const [joined, setJoined] = useState(false);
  const [topic, setTopic] = useState(''); const [msg, setMsg] = useState(''); const [qi, setQi] = useState(0); const [score, setScore] = useState(0); const [pick, setPick] = useState<number | null>(null); const [fin, setFin] = useState(false); const t0 = useRef(0);
  const [p2p, setP2p] = useState<P2P | null>(null); const [codeOut, setCodeOut] = useState(''); const [codeIn, setCodeIn] = useState('');
  const join = () => { roomRef.current?.close(); const r = new Room(name); r.onChange = () => force(x => x + 1); const t = broadcastTransport(code); if (t) r.attach(t); roomRef.current = r; setJoined(true); setMsg(t ? `Joined “${code}”. Other tabs on this device that join the same code will appear here.` : 'This browser has no BroadcastChannel; use a two-device link instead.'); };
  useEffect(() => () => roomRef.current?.close(), []);
  const r = roomRef.current; const topics = deck.topics();
  const startChallenge = () => { if (!r) return; const q = deck.quiz(topic || null, 6); if (q.length < 2) { setMsg('Need at least 2 flashcards for a challenge.'); return; } r.startChallenge(topic || 'Mixed', q.map(x => ({ q: x.q, options: x.options, answer: x.answer }))); setQi(0); setScore(0); setPick(null); setFin(false); t0.current = Date.now(); };
  const ans = (i: number) => { if (!r?.challenge || pick !== null) return; setPick(i); if (i === r.challenge.questions[qi].answer) setScore(s => s + 1); };
  const next = () => { if (!r?.challenge) return; if (qi + 1 < r.challenge.questions.length) { setQi(qi + 1); setPick(null); } else { r.submit(score, r.challenge.questions.length, Date.now() - t0.current); setFin(true); } };
  const ch = r?.challenge; const [seenId, setSeenId] = useState('');
  useEffect(() => { if (ch && ch.id !== seenId && ch.from !== 'you') { setSeenId(ch.id); setQi(0); setScore(0); setPick(null); setFin(false); t0.current = Date.now(); } }, [ch, seenId]);
  const connectTr = async (tr: Promise<import('../lib/platform/room').Transport>) => { const t = await tr; if (!roomRef.current) { const rr = new Room(name); rr.onChange = () => force(x => x + 1); roomRef.current = rr; setJoined(true); } roomRef.current.attach(t); setMsg('Connected to the other device.'); force(x => x + 1); };
  return (
    <div className="space-y-4" data-testid="rooms">
      <p className="text-sm text-slate-600">Study with classmates without any server. Share a deck, run a live quiz challenge, see the leaderboard. Same device: tabs with the same room code. Two devices on the same Wi-Fi: exchange two short codes.</p>
      <div className={box}><div className="flex gap-2 flex-wrap items-center"><input value={name} onChange={e => setName(e.target.value)} className="border rounded px-2 py-1" aria-label="Your name" data-testid="room-name" /><input value={code} onChange={e => setCode(e.target.value)} className="border rounded px-2 py-1 w-28" aria-label="Room code" data-testid="room-code" /><button className={dark} onClick={join} data-testid="room-join">Join room</button></div>
        <details><summary className="cursor-pointer text-xs">Connect a second device (same Wi-Fi)</summary><div className="space-y-2 text-xs mt-2"><div className="flex gap-2 flex-wrap"><button className={btn} data-testid="p2p-invite" onClick={async () => { const p = new P2P(); setP2p(p); setCodeOut(await p.invite()); void connectTr(p.ready); }}>I am the host: create invitation</button></div>
          <textarea readOnly value={codeOut} rows={2} className="w-full border rounded p-1 font-mono" aria-label="Invitation code" data-testid="p2p-out" placeholder="Invitation or reply code appears here: send it to the other device" />
          <textarea value={codeIn} onChange={e => setCodeIn(e.target.value)} rows={2} className="w-full border rounded p-1 font-mono" aria-label="Paste the other device's code" data-testid="p2p-in" placeholder="Paste the code from the other device here" />
          <div className="flex gap-2"><button className={btn} data-testid="p2p-accept" disabled={!codeIn.trim()} onClick={async () => { const p = new P2P(); setCodeOut(await p.accept(codeIn)); void connectTr(p.ready); }}>I am the guest: use invitation, make reply</button><button className={btn} data-testid="p2p-finish" disabled={!codeIn.trim() || !p2p} onClick={() => void p2p!.finish(codeIn)}>Host: use the guest’s reply</button></div></div></details>
        {msg && <div className="text-xs text-slate-600" role="status" data-testid="room-msg">{msg}</div>}</div>
      {joined && r && <>
        <div className="text-sm" data-testid="room-peers">In the room: you{[...r.peers.values()].map(p => `, ${p}`).join('')}</div>
        <div className={box}><b>Share a deck</b><div className="flex gap-2 items-center flex-wrap"><select value={topic} onChange={e => setTopic(e.target.value)} className="border rounded px-2 py-1" aria-label="Deck topic" data-testid="room-topic"><option value="">All topics</option>{topics.map(t => <option key={t}>{t}</option>)}</select>
          <button className={btn} data-testid="room-share" onClick={() => { const cs = deck.cards().filter(c => !topic || c.topic === topic); r.shareDeck(topic || 'Shared deck', cs.map(c => ({ front: c.front, back: c.back }))); setMsg(`Shared ${cs.length} cards.`); }}>Share</button><button className={dark} onClick={startChallenge} data-testid="room-challenge">Start a quiz challenge</button></div>
          {r.inbox.map((d, i) => <div key={i} className="text-xs flex gap-2 items-center" data-testid="room-inbox">📦 {d.from} shared “{d.topic}” ({d.cards.length} cards)<button className={btn} onClick={() => { const n = deck.add(d.cards.map((c, k) => ({ id: `rm${Date.now().toString(36)}${k}${Math.random().toString(36).slice(2, 5)}`, topic: d.topic, front: c.front, back: c.back, kind: 'qa' as const, source: `from ${d.from}`, created: Date.now(), due: Date.now(), S: 0, D: 0, reps: 0, lapses: 0, state: 'new' as const }))); setMsg(`Added ${n} new cards to your deck.`); r.inbox.splice(i, 1); force(x => x + 1); }}>Add to my deck</button></div>)}</div>
        {ch && <div className={box} data-testid="room-quiz"><b>Challenge: {ch.topic}</b> <span className="text-xs text-slate-500">from {ch.from}</span>
          {!fin ? <><div className="font-medium">{qi + 1}/{ch.questions.length}. {ch.questions[qi].q}</div>{ch.questions[qi].options.map((o, i) => <button key={i} onClick={() => ans(i)} data-testid={`room-opt-${i}`} className={`block w-full text-left border rounded px-2 py-1 ${pick !== null ? (i === ch.questions[qi].answer ? 'bg-emerald-50 border-emerald-400' : i === pick ? 'bg-red-50 border-red-400' : '') : 'hover:bg-slate-50'}`}>{o}</button>)}{pick !== null && <button className={dark} onClick={next} data-testid="room-next">{qi + 1 < ch.questions.length ? 'Next' : 'Finish'}</button>}</> : <div className="text-emerald-700">You scored {score}/{ch.questions.length}.</div>}
          <div data-testid="room-board"><b className="text-xs">Leaderboard</b>{r.leaderboard().map((b, i) => <div key={i} className="text-xs">{i + 1}. {b.name} — {b.score}/{b.n} ({Math.round(b.ms / 1000)} s)</div>)}{!r.leaderboard().length && <div className="text-xs text-slate-500">Waiting for results…</div>}</div></div>}
      </>}
    </div>
  );
}

const TABS = [['course', 'Course pack'], ['class', 'Class dashboard'], ['pilot', 'Pilot kit'], ['rooms', 'Study rooms']] as const;
export default function TeachView() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('course');
  return (
    <div className="h-full overflow-y-auto bg-white" data-testid="teach-view">
      <div className="px-4 md:px-8 pt-4"><h2 className="text-xl font-bold text-slate-800">Teach</h2><p className="text-sm text-slate-600">For teachers and institutions. Everything works offline; files are shared by hand, so student data never has to leave their devices.</p></div>
      <div role="tablist" className="flex gap-1 px-4 md:px-8 border-b mt-2 overflow-x-auto">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} data-testid={`teach-tab-${k}`} onClick={() => setTab(k)} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 ${tab === k ? 'border-amber-600 text-amber-900 font-semibold' : 'border-transparent text-slate-600'}`}>{l}</button>)}</div>
      <div className="p-4 md:px-8 max-w-5xl">{tab === 'course' ? <Course /> : tab === 'class' ? <div className="h-[75vh] border rounded"><ClassPanel /></div> : tab === 'pilot' ? <Pilot /> : <Rooms />}</div>
    </div>
  );
}
