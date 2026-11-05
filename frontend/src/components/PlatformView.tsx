import { useEffect, useMemo, useRef, useState } from 'react';
import { deck, runStore } from '../lib/friday/agentsRuntime';
import { evalHistory } from '../lib/friday/agents/evals';
import { defaultKV } from '../lib/friday/learn';
import { trustReport, badgeFor, reportMarkdown } from '../lib/platform/trust';
import { PluginStore, EXAMPLE, evalFormula } from '../lib/platform/plugins';
import { SIMS } from '../sims/registry';
import { LANGS, voiceReport, getTutorLang, setTutorLang, tutorInstruction, phrase } from '../lib/platform/langs';
import { getConsent, setConsent } from '../lib/platform/api';
import type { Consent } from '../lib/platform/api';
import * as an from '../lib/analytics';
import * as errs from '../lib/errors';
import { exportBackup, importBackup, browserStore } from '../lib/platform/backup';
import { getProfile, saveProfile, checkPin } from '../lib/platform/profiles';
import type { Profile, Role } from '../lib/platform/profiles';
import { PRICING, PRICING_NOTE, ROADMAP, BRIEF_STATUS, COMPETITORS, DEMO_SCRIPT } from '../lib/platform/company';
import type { Status } from '../lib/platform/company';
import { enableDemo, disableDemo, isDemo } from '../lib/platform/demo';

const box = 'border rounded p-3 text-sm space-y-2'; const btn = 'px-3 py-1.5 rounded border text-sm hover:bg-slate-50 disabled:opacity-50'; const dark = 'px-3 py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50';
const save = (name: string, text: string, type = 'application/json') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
const ST: Record<Status, string> = { live: 'bg-emerald-100 text-emerald-800', partial: 'bg-amber-100 text-amber-800', planned: 'bg-slate-100 text-slate-600' };
const Pill = ({ s }: { s: Status }) => <span className={`text-[10px] px-1.5 py-0.5 rounded ${ST[s]}`}>{s === 'live' ? 'live' : s === 'partial' ? 'partly built' : 'planned'}</span>;
const goView = (v: string) => window.dispatchEvent(new CustomEvent('nm:go', { detail: v }));

/* ---------------- Overview: investor brief + demo ---------------- */
function Overview() {
  const kv = defaultKV(); const [demo, setDemo] = useState(isDemo(kv));
  const th = evalHistory(kv); const last = th[th.length - 1];
  const facts = [[String(SIMS.length), 'interactive simulations'], [last ? `${last.passed}/${last.total}` : 'not run', 'FRIDAY answer checks (latest run on this device)'], ['0', 'pilot institutions so far (honest)'], ['offline', 'works with no internet']];
  const md = () => `# Notes Maker AI — investor brief\n\n**One line:** an offline-first AI tutor for STEM students that turns their own notes and simulations into practice, proves what they have mastered, and gives teachers a course and a pilot kit.\n\n## Status (honest)\n${BRIEF_STATUS.map(b => `- **${b.area}** (${b.status}): ${b.text}`).join('\n')}\n\n## Competitors\n${COMPETITORS.map(([n, d]) => `- ${n}: ${d}`).join('\n')}\n\n## Business model (proposed)\n${PRICING.map(t => `- ${t.name}: ${t.price} — ${t.for}`).join('\n')}\n\n## Ask\nTwo institutions for a 4–6 week pilot; pre-seed funding to run it and to build accounts and hosting.\n\n_Market size, team and financials: add your own sourced figures here._\n`;
  return (
    <div className="space-y-4" data-testid="overview">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-xs">{facts.map(([v, l]) => <div key={l} className="border rounded p-3"><div className="text-xl font-bold">{v}</div>{l}</div>)}</div>
      <div className={box}><b>Where the company stands</b>{BRIEF_STATUS.map(b => <div key={b.area} className="flex gap-2 items-start"><Pill s={b.status} /><span><b>{b.area}:</b> {b.text}</span></div>)}</div>
      <div className={box}><b>Competitors, said plainly</b>{COMPETITORS.map(([n, d]) => <div key={n} className="text-xs">• <b>{n}</b> — {d}</div>)}</div>
      <div className="flex gap-2 flex-wrap"><button className={dark} onClick={() => save('investor-brief.md', md(), 'text/markdown')} data-testid="brief-download">Download investor brief</button><a className={btn} href={`${import.meta.env.BASE_URL}landing.html`} target="_blank" rel="noreferrer">Open landing page</a></div>
      <div className={box} data-testid="demo-box"><b>3-minute demo</b>{DEMO_SCRIPT.map(s => <div key={s.sec} className="text-xs flex gap-2"><span className="font-mono text-slate-500 w-9">{s.sec}</span><span className="flex-1"><b>{s.say}</b><br /><span className="text-slate-500">{s.do}</span></span>{s.view && <button className={btn} onClick={() => goView(s.view!)}>Go</button>}</div>)}
        <div className="border-t pt-2 text-xs"><b>Demo data</b> {demo ? <span className="text-amber-800" data-testid="demo-on">ON — the numbers you see are synthetic. Say so when presenting.</span> : <span className="text-slate-600">Off. Your real data is shown.</span>}
          <div className="mt-1 flex gap-2"><button className={btn} disabled={demo} data-testid="demo-enable" onClick={() => { enableDemo(kv); location.reload(); }}>Load demo data</button><button className={btn} disabled={!demo} data-testid="demo-disable" onClick={() => { disableDemo(kv); location.reload(); }}>Restore my real data</button></div></div></div>
    </div>
  );
}

/* ---------------- Trust ---------------- */
function Trust() {
  const kv = defaultKV(); const t = useMemo(() => trustReport(evalHistory(kv), runStore.runs), []); const b = badgeFor(t); const [log, setLog] = useState(errs.errorLog(kv)); const [cfg, setCfg] = useState(errs.getCfg(kv));
  return (
    <div className="space-y-4" data-testid="trust">
      <div className={box}><div className="flex items-center gap-3 flex-wrap"><span dangerouslySetInnerHTML={{ __html: b.svg }} data-testid="trust-badge" /><span className="text-xs text-slate-600" data-testid="trust-text">{b.text}</span></div>
        <div className="flex gap-2 flex-wrap"><button className={btn} onClick={() => save('trust-badge.svg', b.svg, 'image/svg+xml')}>Download badge (SVG)</button><button className={btn} onClick={() => save('trust-report.md', reportMarkdown(t), 'text/markdown')} data-testid="trust-report">Download trust report</button><button className={btn} onClick={() => { window.dispatchEvent(new CustomEvent('nm:friday-tab', { detail: 'evals' })); goView('friday'); }}>Run the evaluation</button></div></div>
      {t.eval && <div className={box}><b>Evaluation by area</b>{t.eval.areas.map(a => <div key={a.area} className="text-xs flex gap-2"><span className="w-24">{a.area}</span><span>{a.passed}/{a.total}</span></div>)}</div>}
      <div className={box}><b>What FRIDAY checks</b><ul className="list-disc ml-5 text-xs">{t.guarantees.map(g => <li key={g}>{g}</li>)}</ul><b>Limits (stated up front)</b><ul className="list-disc ml-5 text-xs">{t.limits.map(g => <li key={g}>{g}</li>)}</ul></div>
      <div className={box} data-testid="errors"><b>Crash log (this device)</b> <span className="text-xs text-slate-500">messages only; keys are scrubbed</span>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={cfg.share} onChange={e => { errs.setCfg({ share: e.target.checked }); setCfg(errs.getCfg()); }} data-testid="err-share" /> Send crashes to my Sentry project</label>
        <input value={cfg.sentryDsn} onChange={e => { errs.setCfg({ sentryDsn: e.target.value }); setCfg(errs.getCfg()); }} placeholder="Sentry DSN (https://key@host/123)" className="border rounded px-2 py-1 text-xs w-full" aria-label="Sentry DSN" />
        {log.length === 0 ? <div className="text-xs text-slate-500">No crashes recorded.</div> : <div className="text-xs max-h-40 overflow-y-auto font-mono">{log.slice(-10).reverse().map((e, i) => <div key={i}>{new Date(e.t).toLocaleString()} · {e.where} · {e.msg}</div>)}</div>}
        <div className="flex gap-2"><button className={btn} onClick={() => { errs.clearErrors(); setLog([]); }}>Clear</button><button className={btn} onClick={() => save('crash-log.json', JSON.stringify(log, null, 2))} disabled={!log.length}>Export</button></div></div>
    </div>
  );
}

/* ---------------- Plugins ---------------- */
function Plugins() {
  const [store] = useState(() => new PluginStore()); const [, force] = useState(0); const [msg, setMsg] = useState(''); const [text, setText] = useState(''); const [calc, setCalc] = useState<Record<string, number>>({});
  const install = (t: string) => { const r = store.install(t); if (!r.ok) { setMsg(r.why); return; } for (const s of store.sims()) if (!SIMS.some(x => x.id === s.id)) SIMS.push(s); for (const d of store.decks()) deck.add(d.cards.map((c, i) => ({ id: `pl${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 5)}`, topic: d.topic, front: c.front, back: c.back, kind: 'qa' as const, source: 'plugin', created: Date.now(), due: Date.now(), S: 0, D: 0, reps: 0, lapses: 0, state: 'new' as const }))); setMsg(`${r.replaced ? 'Updated' : 'Installed'} “${r.m.name}”. Its simulations are now in Visuals Studio.`); force(x => x + 1); };
  const calcs = store.calculators();
  return (
    <div className="space-y-4" data-testid="plugins">
      <p className="text-sm text-slate-600">Plugins add simulations, flashcard decks and calculators. A plugin is a <b>JSON file of data</b>, never code: it cannot run scripts, read your notes or use the network. Formulas are evaluated by the app’s own safe calculator.</p>
      <div className={box}><div className="flex gap-2 flex-wrap"><button className={btn} data-testid="plugin-example" onClick={() => install(JSON.stringify(EXAMPLE))}>Install the example plugin</button><label className={`${btn} cursor-pointer`}>Install from file<input type="file" accept=".json" className="hidden" data-testid="plugin-file" onChange={async e => { const f = e.target.files?.[0]; if (f) install(await f.text()); e.target.value = ''; }} /></label><button className={btn} onClick={() => save('example-plugin.json', JSON.stringify(EXAMPLE, null, 2))}>Download example to edit</button></div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={4} className="w-full border rounded p-2 font-mono text-xs" placeholder="…or paste a plugin manifest here" aria-label="Plugin JSON" data-testid="plugin-text" /><button className={dark} disabled={!text.trim()} onClick={() => install(text)} data-testid="plugin-install">Install pasted plugin</button>
        {msg && <div className="text-xs" role="status" data-testid="plugin-msg">{msg}</div>}</div>
      <div className={box}><b>Installed</b>{store.list.length === 0 && <div className="text-xs text-slate-500">None yet.</div>}{store.list.map(p => <div key={p.m.id} className="text-xs flex gap-2 items-center" data-testid="plugin-item"><span className="flex-1"><b>{p.m.name}</b> v{p.m.version} · {(p.m.provides.simulations?.length ?? 0)} sims · {(p.m.provides.decks?.length ?? 0)} decks · {(p.m.provides.calculators?.length ?? 0)} calculators</span><label><input type="checkbox" checked={p.enabled} onChange={e => { store.setEnabled(p.m.id, e.target.checked); force(x => x + 1); }} /> on</label><button className={btn} onClick={() => { store.remove(p.m.id); force(x => x + 1); }}>Remove</button></div>)}</div>
      {calcs.map(c => <div key={c.id} className={box} data-testid="plugin-calc"><b>{c.name}</b><div className="flex gap-2 flex-wrap">{c.inputs.map(i => <label key={i.id} className="text-xs">{i.label}{i.unit ? ` (${i.unit})` : ''} <input type="number" value={calc[c.id + i.id] ?? i.value} onChange={e => setCalc(s => ({ ...s, [c.id + i.id]: +e.target.value }))} className="border rounded px-1 w-20" /></label>)}</div>
        {c.outputs.map(o => { const v = evalFormula(o.expr, Object.fromEntries(c.inputs.map(i => [i.id, calc[c.id + i.id] ?? i.value]))); return <div key={o.label} className="text-sm">{o.label}: <b data-testid="calc-out">{v == null ? '–' : Math.round(v * 1000) / 1000}</b> {o.unit}</div>; })}</div>)}
    </div>
  );
}

/* ---------------- Languages ---------------- */
function Languages() {
  const [lang, setLang] = useState(getTutorLang()); const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => { const f = () => setVoices(typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : []); f(); try { speechSynthesis.addEventListener('voiceschanged', f); return () => speechSynthesis.removeEventListener('voiceschanged', f); } catch { return undefined; } }, []);
  const rep = voiceReport(voices.map(v => ({ name: v.name, lang: v.lang, localService: v.localService })));
  const say = (code: string) => { try { const l = LANGS.find(x => x.code === code)!; const u = new SpeechSynthesisUtterance(`${phrase(code, 'correct')} ${phrase(code, 'revise')}`); u.lang = l.bcp; const v = voices.find(x => x.lang.toLowerCase().startsWith(code)); if (v) u.voice = v; speechSynthesis.speak(u); } catch { /* no speech */ } };
  return (
    <div className="space-y-4" data-testid="languages">
      <p className="text-sm text-slate-600">Have FRIDAY teach in your language. Replies are written in the chosen language by your AI model (cloud or local), spoken with a matching voice, and dictation uses the speech language selector in FRIDAY.</p>
      <div className={box}><label className="text-sm">Tutor language <select value={lang} onChange={e => { setLang(e.target.value); setTutorLang(e.target.value); }} className="border rounded px-2 py-1 ml-2" aria-label="Tutor language" data-testid="tutor-lang"><option value="">English</option>{LANGS.map(l => <option key={l.code} value={l.code}>{l.native} — {l.name}</option>)}</select></label>
        {lang && <div className="text-xs text-slate-600" data-testid="lang-note">Instruction sent to the model: “{tutorInstruction(lang)}” <br />Without an AI model (pure offline mode) FRIDAY’s built-in answers stay in English; only fixed feedback phrases are translated.</div>}</div>
      <div className={box}><b>Voices on this device</b><div className="text-xs text-slate-500">Offline speech needs a voice installed in your operating system. Phrases were written by the maker and should be checked by a native speaker before wide release.</div>
        {rep.map(r => <div key={r.lang.code} className="text-xs flex gap-2 items-start border-t pt-1" data-testid="voice-row"><span className="w-24 font-medium">{r.lang.native}</span><span className="flex-1">{r.voice ? <>{r.voice} — {r.advice}</> : r.advice}</span><button className={btn} disabled={!r.voice} onClick={() => say(r.lang.code)}>Hear</button></div>)}</div>
    </div>
  );
}

/* ---------------- Developers (open API) ---------------- */
function Developers() {
  const [c, setC] = useState<Consent>(getConsent());
  return (
    <div className="space-y-4" data-testid="developers">
      <div className={box}><b>Page and extension access</b><p className="text-xs text-slate-600">A small API is available as <code>window.NotesMaker</code> so extensions and embedding pages can read your progress or add cards. It is <b>off by default</b>.</p>
        <select value={c} onChange={e => { const v = e.target.value as Consent; setC(v); setConsent(v); }} className="border rounded px-2 py-1 text-sm" aria-label="API access" data-testid="api-consent"><option value="off">Off (recommended)</option><option value="read">Allow reading topics and mastery</option><option value="write">Allow reading and adding cards / plugins</option></select></div>
      <pre className="text-xs bg-slate-900 text-slate-100 rounded p-3 overflow-x-auto">{`// all calls return Promises; they reject with "Permission denied" unless allowed above
await NotesMaker.getTopics();                       // ["Thermodynamics", ...]
await NotesMaker.getMastery("Thermodynamics");      // { mastery: 0.62, cards: 14, due: 3, mistakes: 2 }
await NotesMaker.addCards("Optics", [{ front: "What is refraction?", back: "Bending of light" }]);
await NotesMaker.installPlugin(manifestObject);     // see Plugins → example
NotesMaker.on("event", fn);`}</pre>
      <div className="text-xs text-slate-600">Plugins are validated data files: simulations (parameters + formula readouts + a curve), decks and calculators. Download the example on the Plugins tab to start.</div>
    </div>
  );
}

/* ---------------- Privacy, profile, backup ---------------- */
function Privacy() {
  const kv = defaultKV(); const [cfg, setCfg] = useState(an.getCfg(kv)); const [sum, setSum] = useState(an.summary({ kv })); const [prof, setProf] = useState<Profile | null>(getProfile(kv)); const [name, setName] = useState(prof?.name ?? ''); const [role, setRole] = useState<Role>(prof?.role ?? 'student'); const [pin, setPin] = useState(''); const [pm, setPm] = useState('');
  const [pass, setPass] = useState(''); const [bm, setBm] = useState(''); const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-4" data-testid="privacy">
      <div className={box}><b>Our promise, and how you can check it</b><ul className="list-disc ml-5 text-xs"><li>Your notes, flashcards and history stay in this browser (or the desktop app). Nothing is uploaded.</li><li>The only network calls are the ones you set up: your own AI provider, your local model, YouTube captions. Check the Network tab of your browser’s developer tools.</li><li>Usage analytics and crash reports are <b>off</b> unless you switch them on below.</li><li>AI keys are never included in backups, analytics or crash reports.</li></ul><div className="text-xs text-slate-500">This is a plain description, not legal advice. Before running a pilot with minors, get a consent form checked against the rules in your country (for example India’s DPDP Act).</div></div>
      <div className={box} data-testid="profile"><b>Profile and role</b> <span className="text-xs text-slate-500">(on this device only; not a login)</span>
        <div className="flex gap-2 flex-wrap items-center"><input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className="border rounded px-2 py-1 text-sm" aria-label="Profile name" data-testid="prof-name" /><select value={role} onChange={e => setRole(e.target.value as Role)} className="border rounded px-2 py-1 text-sm" aria-label="Role" data-testid="prof-role"><option value="student">Student</option><option value="teacher">Teacher</option></select>
          {role === 'teacher' && <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="PIN (4–8 digits, optional)" className="border rounded px-2 py-1 text-sm" inputMode="numeric" aria-label="Teacher PIN" data-testid="prof-pin" />}
          <button className={dark} data-testid="prof-save" onClick={async () => { try { const p = await saveProfile({ name, role, pin: pin || undefined }); setProf(p); setPm(`Saved. ${p.role === 'teacher' ? 'The Teach area ' + (p.pin ? 'now asks for your PIN.' : 'is open (no PIN set).') : 'The Teach area is hidden.'}`); window.dispatchEvent(new Event('nm:profile')); } catch (e) { setPm((e as Error).message); } }}>Save</button></div>
        <div className="text-xs" role="status" data-testid="prof-msg">{pm}{prof && !pm ? `Current: ${prof.name} (${prof.role}).` : ''}</div></div>
      <div className={box}><b>Anonymous usage statistics</b>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={cfg.consent} onChange={e => { an.setCfg({ consent: e.target.checked }); setCfg(an.getCfg()); }} data-testid="an-consent" /> Count my usage (days active, quizzes, first-quiz time). No note text, ever.</label>
        <input value={cfg.endpoint} onChange={e => { an.setCfg({ endpoint: e.target.value }); setCfg(an.getCfg()); }} placeholder="Pilot endpoint (https://…) — optional, only used with consent" className="border rounded px-2 py-1 text-xs w-full" aria-label="Pilot endpoint" />
        <div className="text-xs text-slate-600" data-testid="an-sum">Active days: {sum.activeDays} · first quiz: {sum.activation.reachedFirstQuiz ? `${sum.activation.minutesToFirstQuiz ?? '?'} min after start` : 'not yet'} · returned day 1: {sum.retention.d1 ? 'yes' : 'no'}, day 7: {sum.retention.d7 ? 'yes' : 'no'}, day 28: {sum.retention.d28 ? 'yes' : 'no'}</div>
        <div className="flex gap-2"><button className={btn} onClick={() => setSum(an.summary({ kv }))}>Refresh</button><button className={btn} onClick={() => save('usage-summary.json', JSON.stringify(an.summary({ kv }), null, 2))}>Export my numbers</button></div></div>
      <div className={box} data-testid="backup"><b>Encrypted backup</b><p className="text-xs text-slate-600">Move everything to another device. The file is encrypted with your passphrase (AES-256). Forget the passphrase and the file cannot be opened.</p>
        <div className="flex gap-2 flex-wrap items-center"><input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="passphrase (8+ characters)" className="border rounded px-2 py-1 text-sm" aria-label="Backup passphrase" data-testid="bk-pass" /><button className={dark} data-testid="bk-export" onClick={async () => { try { save('notes-maker-backup.nmbackup.json', await exportBackup(pass, browserStore())); setBm('Backup saved.'); } catch (e) { setBm((e as Error).message); } }}>Download backup</button>
          <button className={btn} onClick={() => fileRef.current?.click()} data-testid="bk-import-btn">Restore from file</button><input ref={fileRef} type="file" accept=".json" className="hidden" data-testid="bk-file" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { const r = await importBackup(await f.text(), pass, browserStore()); setBm(`Restored ${r.restored} items from ${new Date(r.at).toLocaleString()}. Reloading…`); setTimeout(() => location.reload(), 900); } catch (er) { setBm((er as Error).message); } e.target.value = ''; }} /></div>
        <div className="text-xs" role="status" data-testid="bk-msg">{bm}</div></div>
    </div>
  );
}

/* ---------------- Pricing & roadmap ---------------- */
function Pricing() {
  return (<div className="space-y-4" data-testid="pricing"><div className="text-xs bg-amber-50 border border-amber-200 rounded p-2" data-testid="pricing-note">{PRICING_NOTE}</div>
    <div className="grid md:grid-cols-3 gap-3">{PRICING.map(t => <div key={t.id} className="border rounded p-3 text-sm space-y-2"><div className="font-bold">{t.name}</div><div className="text-lg">{t.price}</div><div className="text-xs text-slate-500">{t.for}</div>{t.features.map(f => <div key={f.text} className="text-xs flex gap-1 items-start"><span>✓</span><span className="flex-1">{f.text}</span><Pill s={f.status} /></div>)}</div>)}</div></div>);
}
function Roadmap() {
  return (<div className="space-y-2" data-testid="roadmap">{ROADMAP.map(r => <div key={r.title} className="border rounded p-2 text-sm flex gap-2 items-start"><span className="w-16 text-xs text-slate-500">{r.when}</span><span className="flex-1">{r.title}{r.note && <div className="text-xs text-slate-500">{r.note}</div>}</span><Pill s={r.status} /></div>)}</div>);
}

const TABS = [['overview', 'Overview'], ['trust', 'Trust'], ['plugins', 'Plugins'], ['languages', 'Languages'], ['developers', 'Developers'], ['privacy', 'Privacy & backup'], ['pricing', 'Pricing'], ['roadmap', 'Roadmap']] as const;
export default function PlatformView() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('overview');
  return (
    <div className="h-full overflow-y-auto bg-white" data-testid="platform-view">
      <div className="px-4 md:px-8 pt-4"><h2 className="text-xl font-bold text-slate-800">Platform</h2></div>
      <div role="tablist" className="flex gap-1 px-4 md:px-8 border-b mt-2 overflow-x-auto">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} data-testid={`platform-tab-${k}`} onClick={() => setTab(k)} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 ${tab === k ? 'border-amber-600 text-amber-900 font-semibold' : 'border-transparent text-slate-600'}`}>{l}</button>)}</div>
      <div className="p-4 md:px-8 max-w-4xl">{tab === 'overview' ? <Overview /> : tab === 'trust' ? <Trust /> : tab === 'plugins' ? <Plugins /> : tab === 'languages' ? <Languages /> : tab === 'developers' ? <Developers /> : tab === 'privacy' ? <Privacy /> : tab === 'pricing' ? <Pricing /> : <Roadmap />}</div>
    </div>
  );
}
