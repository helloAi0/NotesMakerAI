import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import { box, btn, dark, saveFile, useAI, imageToJpeg } from './ui';
import { Material, Msg } from './shared';
import { LANGS } from '../../lib/platform/langs';
import { flip, ui, FLIP_MAX_CHARS } from '../../lib/study/bhasha';
import type { FlipResult } from '../../lib/study/bhasha';
import { BOARDS, board, notesPrompt, trickPrompt, parsePyq, pyqPatterns } from '../../lib/study/examboards';
import type { BoardId } from '../../lib/study/examboards';
import { SCAN_PROMPT, parseScan, layoutGraph, checkLatex, toMarkdown, toLatexDocument } from '../../lib/study/mathocr';
import type { Scan } from '../../lib/study/mathocr';
import { Narrator, cleanForSpeech } from '../../lib/study/interrupt';
import { splitSentences } from '../../lib/lecture';
import { useDictation } from '../../lib/useVoice';
import { parseJsonLoose } from '../../lib/aiClient';
const MarkdownView = lazy(() => import('../MarkdownView'));
const Md = ({ text }: { text: string }) => <Suspense fallback={<div className="text-xs">Loading…</div>}><MarkdownView text={text} /></Suspense>;
const INDIAN = LANGS.filter(l => ['hi', 'mr', 'bn', 'ta', 'te'].includes(l.code));

/* ---------------- speak (browser voices) ---------------- */
/** reads long text as a queue of short sentences (browsers cut a single long utterance off after ~15 s) and stops when the tab is left */
function useSpeaker() {
  const [speaking, setSpeaking] = useState(false); const [note, setNote] = useState(''); const run = useRef(0);
  const stop = () => { run.current++; try { window.speechSynthesis.cancel(); } catch { /* ignore */ } setSpeaking(false); };
  useEffect(() => () => { run.current++; try { window.speechSynthesis.cancel(); } catch { /* ignore */ } }, []);
  const say = (text: string, bcp: string, rate = 1) => {
    if (typeof speechSynthesis === 'undefined') { setNote('This browser cannot speak.'); return; }
    const vs = speechSynthesis.getVoices(); const v = vs.find(x => x.lang.replace('_', '-').toLowerCase() === bcp.toLowerCase()) ?? vs.find(x => x.lang.toLowerCase().startsWith(bcp.slice(0, 2).toLowerCase()));
    setNote(v ? '' : `No ${bcp} voice is installed on this device, so it may sound wrong or stay silent. Install one in your system language settings.`);
    const parts = splitSentences(cleanForSpeech(text)).slice(0, 400); if (!parts.length) return; const my = ++run.current; speechSynthesis.cancel(); setSpeaking(true);
    parts.forEach((p, i) => { const u = new SpeechSynthesisUtterance(p); u.lang = bcp; u.rate = rate; if (v) u.voice = v; u.onend = () => { if (run.current === my && i === parts.length - 1) setSpeaking(false); }; u.onerror = () => { if (run.current === my) setSpeaking(false); }; speechSynthesis.speak(u); });
  };
  return { speaking, note, say, stop };
}

/* ---------------- 1. Bhasha ---------------- */
export function Bhasha({ material, setMaterial, onResult, res, setRes }: { material: string; setMaterial: (s: string) => void; onResult: (t: string) => void; res: FlipResult | null; setRes: (r: FlipResult | null) => void }) {
  const ai = useAI(); const sp = useSpeaker(); const [lang, setLang] = useState(res?.lang ?? 'hi'); const [mode, setMode] = useState<'notes' | 'translate'>('notes'); const [uiLang, setUiLang] = useState('en'); const abort = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const run = async () => { setErr(''); setRes(null); if (!material.trim()) { setErr('Add some material first.'); return; } if (!ai.ready()) { setErr('Add an AI key or a local model in Settings first.'); return; } setBusy(ui(uiLang, 'working')); const ac = new AbortController(); abort.current = ac; try { const r = await flip(material, lang, ai.gen, { mode, signal: ac.signal, onProgress: (d, t) => setBusy(`${ui(uiLang, 'working')} ${d}/${t}`) }); if (r.failed >= r.chunks) setErr('The AI could not be reached, so nothing was translated. Check your key and internet, then try again.'); else { setRes(r); onResult(r.text); } } catch (e) { setErr((e as Error).message); } abort.current = null; setBusy(''); };
  const l = INDIAN.find(x => x.code === lang)!;
  return (
    <div className="space-y-3" data-testid="bhasha">
      <div className={box}><div className="flex gap-2 flex-wrap items-center text-xs"><label>Interface language <select value={uiLang} onChange={e => setUiLang(e.target.value)} className="border rounded px-1 py-1" aria-label="Interface language" data-testid="bh-ui">{[{ code: 'en', native: 'English' }, ...INDIAN].map(x => <option key={x.code} value={x.code}>{x.native}</option>)}</select></label><span className="text-slate-500">Buttons below switch language. The rest of the app stays English (partly translated, wording not yet reviewed by native speakers).</span></div>
        <Material value={material} onChange={setMaterial} label={ui(uiLang, 'upload')} /></div>
      <div className={box}><div className="flex gap-2 items-center flex-wrap"><label className="text-xs">{ui(uiLang, 'language')} <select value={lang} onChange={e => setLang(e.target.value)} className="border rounded px-2 py-1" aria-label="Target language" data-testid="bh-lang">{INDIAN.map(x => <option key={x.code} value={x.code}>{x.native} ({x.name})</option>)}</select></label>
        <select value={mode} onChange={e => setMode(e.target.value as 'notes' | 'translate')} className="border rounded px-2 py-1 text-xs" aria-label="Mode" data-testid="bh-mode"><option value="notes">Make study notes</option><option value="translate">Translate faithfully</option></select>
        <button className={dark} disabled={!!busy} onClick={() => void run()} data-testid="bh-go">{busy || ui(uiLang, 'make')}</button>{busy && <button className={btn} onClick={() => abort.current?.abort()} data-testid="bh-cancel">{ui(uiLang, 'stop')}</button>}</div>{material.length > FLIP_MAX_CHARS && <div className="text-xs text-amber-800" role="status">This is long ({material.length.toLocaleString()} characters). Only the first {FLIP_MAX_CHARS.toLocaleString()} will be converted to keep it fast and cheap: split the PDF into parts.</div>}<Msg m={err} bad /></div>
      {res && <div className={box} data-testid="bh-out"><div className="flex gap-2 flex-wrap items-center"><b>{ui(uiLang, 'notes')} · {l.native}</b>
        <button className={btn} onClick={() => (sp.speaking ? sp.stop() : sp.say(res.text, l.bcp))} data-testid="bh-listen">{sp.speaking ? ui(uiLang, 'stop') : ui(uiLang, 'listen')}</button>
        <button className={btn} onClick={() => saveFile(`notes-${lang}.md`, res.text)}>Download .md</button><button className={btn} onClick={() => void navigator.clipboard?.writeText(res.text)}>Copy</button></div>
        <div className="text-xs text-slate-600" data-testid="bh-stats">{ui(uiLang, 'terms')}: {res.termsKept} of {res.termsTotal} protected terms kept. {res.truncated ? `Only the first ${res.usedChars.toLocaleString()} characters were converted. ` : ''}{res.repaired ? `${res.repaired} section(s) needed a second try. ` : ''}{res.failed ? `${res.failed} section(s) could not be translated and were left in English. ` : ''}Check important facts against your textbook: AI can make mistakes.</div><Msg m={sp.note} />
        <div className="border rounded p-2 bg-slate-50 max-h-96 overflow-auto"><Md text={res.text} /></div></div>}
    </div>
  );
}

/* ---------------- 2. Exam engines ---------------- */
export function Boards({ material, setMaterial, onResult, out, setOut }: { material: string; setMaterial: (s: string) => void; onResult: (t: string) => void; out: string; setOut: (s: string) => void }) {
  const ai = useAI(); const [id, setId] = useState<BoardId>('cbse'); const [lang, setLang] = useState('English'); const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const [py, setPy] = useState(''); const [qs, setQs] = useState<{ q: string; options: string[]; answer: string; trap: string; solution: string }[]>([]); const [topic, setTopic] = useState('');
  const b = board(id); const pat = useMemo(() => (py.trim() ? pyqPatterns(parsePyq(py)) : null), [py]);
  const need = () => { if (!material.trim()) { setErr('Add some material first.'); return false; } if (!ai.ready()) { setErr('Add an AI key or a local model in Settings first.'); return false; } setErr(''); return true; };
  const make = async () => { if (!need()) return; setBusy('Writing…'); try { const t = await ai.gen(notesPrompt(id, material, lang)); setOut(t); onResult(t); } catch (e) { setErr((e as Error).message); } setBusy(''); };
  const trick = async () => { if (!need()) return; setBusy('Setting questions…'); try { const j = parseJsonLoose<typeof qs>(await ai.gen(trickPrompt(id, topic || 'the material', material))); const good = (Array.isArray(j) ? j : []).filter(x => x && typeof x.q === 'string' && x.q.trim()).slice(0, 8); setQs(good); if (!good.length) setErr('The AI did not return usable questions. Try again, or give it a narrower topic.'); } catch (e) { setErr('Could not read the questions: ' + (e as Error).message); } setBusy(''); };
  return (
    <div className="space-y-3" data-testid="boards">
      <div className={box}><div className="flex gap-2 flex-wrap items-center">{BOARDS.map(x => <button key={x.id} onClick={() => setId(x.id)} aria-pressed={id === x.id} data-testid={`board-${x.id}`} className={`px-3 py-1.5 rounded border text-sm ${id === x.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}>{x.name}</button>)}</div>
        <div className="text-xs text-slate-600" data-testid="board-info"><b>{b.name}:</b> {b.practice}. {b.pattern} Check the official source before relying on it: {b.checkOfficial}.</div><Material value={material} onChange={setMaterial} />{material.length > 12000 && <div className="text-xs text-amber-800" role="status">Only the first 12,000 characters are used for exam notes. Paste one chapter at a time.</div>}
        <div className="flex gap-2 flex-wrap items-center"><select value={lang} onChange={e => setLang(e.target.value)} className="border rounded px-2 py-1 text-xs" aria-label="Notes language" data-testid="board-lang">{['English', ...INDIAN.map(x => x.name)].map(x => <option key={x}>{x}</option>)}</select>
          <button className={dark} disabled={!!busy} onClick={() => void make()} data-testid="board-make">{busy || `Make ${b.name} notes`}</button><input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Topic for practice questions" className="border rounded px-2 py-1 text-xs" aria-label="Topic" /><button className={btn} disabled={!!busy} onClick={() => void trick()} data-testid="board-trick">{b.style === 'trick' ? 'Trick questions' : 'Practice questions'}</button></div><Msg m={err} bad /></div>
      {out && <div className={box} data-testid="board-out"><div className="flex gap-2"><b>{b.name} notes</b><button className={btn} onClick={() => saveFile(`${id}-notes.md`, out)}>Download .md</button></div><div className="border rounded p-2 bg-slate-50 max-h-96 overflow-auto"><Md text={out} /></div></div>}
      {qs.length > 0 && <div className={box} data-testid="board-qs"><b>Practice questions (made by AI, not past papers)</b>{qs.map((q, i) => <details key={i} className="border rounded p-2"><summary className="cursor-pointer">{i + 1}. {q.q}</summary>{q.options?.length > 0 && <ul className="list-disc ml-5">{q.options.map((o, k) => <li key={k}>{o}</li>)}</ul>}<div className="text-xs mt-1"><b>Answer:</b> {q.answer}<br /><b>Trap:</b> {q.trap}<br /><b>Solution:</b> {q.solution}</div></details>)}</div>}
      <div className={box}><b>Previous-year question patterns</b><div className="text-xs text-slate-600">No question papers are bundled with the app. Paste the previous-year questions you have (one per line, year headings like “2021” optional) and the app finds what repeats in <i>your</i> sample.</div>
        <textarea value={py} onChange={e => setPy(e.target.value)} rows={5} className="w-full border rounded p-2 text-sm" aria-label="Previous year questions" placeholder={'2022\n1. Calculate the entropy change …\n2. Derive the efficiency of …'} data-testid="pyq-text" />
        {pat && <div data-testid="pyq-out" className="text-xs space-y-1"><div>{pat.verdict}</div>{pat.topics.length > 0 && <div className="flex gap-1 flex-wrap">{pat.topics.map(t => <span key={t.term} className="px-2 py-0.5 rounded bg-amber-100">{t.term} ×{t.count}{t.years > 1 ? ` (${t.years} yrs)` : ''}</span>)}</div>}<div>{pat.types.map(t => `${t.type}: ${t.count}`).join(' · ')}</div></div>}</div>
    </div>
  );
}

/* ---------------- 3. Handwriting → LaTeX / diagram ---------------- */
const Tex = ({ tex }: { tex: string }) => { const html = useMemo(() => { try { return katex.renderToString(tex, { throwOnError: false, displayMode: true, strict: 'ignore' }); } catch { return ''; } }, [tex]); return <span dangerouslySetInnerHTML={{ __html: html }} />; };
export function Scan_() {
  const ai = useAI(); const [scan, setScan] = useState<Scan | null>(null); const [img, setImg] = useState(''); const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const [sel, setSel] = useState('');
  const seq = useRef(0); const onFile = async (f?: File) => { if (!f) return; const my = ++seq.current; setErr(''); setScan(null); setSel(''); setBusy('Reading the photo…'); try { const url = await imageToJpeg(f); if (my !== seq.current) return; setImg(url); if (!ai.ready()) throw new Error('Reading handwriting needs a vision-capable model: add an AI key (Gemini, OpenAI, Claude) or a local vision model in Settings.'); const sc = parseScan(await ai.vision(url, SCAN_PROMPT)); if (my === seq.current) setScan(sc); } catch (e) { if (my === seq.current) setErr(/decode|image|load/i.test((e as Error).message) ? 'That photo could not be opened. Use a JPG or PNG (iPhone HEIC photos: set Camera → Formats → Most Compatible, or screenshot it).' : (e as Error).message); } if (my === seq.current) setBusy(''); };
  const edit = (i: number, latex: string) => setScan(s => (s ? { ...s, equations: s.equations.map((e, k) => (k === i ? { ...e, latex, ...checkLatex(latex), unsure: false } : e)) } : s));
  const lay = useMemo(() => (scan && scan.nodes.length ? layoutGraph(scan.nodes, scan.edges) : null), [scan]);
  const pos = (id: string) => lay!.nodes.find(n => n.id === id)!;
  return (
    <div className="space-y-3" data-testid="scan">
      <div className={box}><div className="text-xs text-slate-600">Take a photo of your notebook page (flat, bright, dark ink). Equations become LaTeX; boxes-and-arrows become a diagram you can click and fix. Nothing is solved or corrected: it transcribes what you wrote.</div>
        <input type="file" accept="image/*" capture="environment" onChange={e => void onFile(e.target.files?.[0])} aria-label="Photo of notebook page" data-testid="scan-file" /><Msg m={busy} /><Msg m={err} bad /></div>
      {scan && <div className="grid md:grid-cols-2 gap-3" data-testid="scan-out">
        {img && <img src={img} alt="Your notebook page" className="border rounded max-h-80 object-contain bg-white" />}
        <div className={box}>{scan.warnings.map(w => <div key={w} className="text-xs text-amber-800" role="status">⚠ {w}</div>)}
          {scan.equations.map((e, i) => <div key={i} className={`border rounded p-2 ${e.unsure || !e.valid ? 'border-amber-500' : ''}`}><div className="overflow-x-auto">{e.valid ? <Tex tex={e.latex} /> : <span className="text-red-700 text-xs">{e.error}</span>}</div><input value={e.latex} onChange={ev => edit(i, ev.target.value)} className="w-full border rounded px-2 py-1 font-mono text-xs mt-1" aria-label={`LaTeX for equation ${i + 1}`} data-testid={`eq-${i}`} /></div>)}
          {scan.text && <div className="text-xs">Text: {scan.text}</div>}
          <div className="flex gap-2 flex-wrap"><button className={btn} onClick={() => void navigator.clipboard?.writeText(toLatexDocument(scan))} data-testid="scan-copy">Copy LaTeX</button><button className={btn} onClick={() => saveFile('scan.md', toMarkdown(scan))}>Download .md</button></div></div>
        {lay && <div className={`${box} md:col-span-2 overflow-auto`} data-testid="scan-diagram"><b>Diagram</b> <span className="text-xs text-slate-500">(click a box to edit its label; layout is automatic)</span>
          <svg width={lay.width} height={lay.height} role="img" aria-label="Diagram from your notebook"><defs><marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#475569" /></marker></defs>
            {scan.edges.map((e, i) => { const a = pos(e.from), b = pos(e.to); const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y; return <g key={i}><path d={`M${x1},${y1} C${x1},${y1 + 25} ${x2},${y2 - 25} ${x2},${y2}`} fill="none" stroke="#475569" markerEnd="url(#arr)" />{e.label && <text x={(x1 + x2) / 2 + 4} y={(y1 + y2) / 2} fontSize="11" fill="#334155">{e.label}</text>}</g>; })}
            {lay.nodes.map(n => <g key={n.id} onClick={() => setSel(n.id)} style={{ cursor: 'pointer' }} data-testid={`node-${n.id}`}>{n.shape === 'decision' ? <polygon points={`${n.x + n.w / 2},${n.y} ${n.x + n.w},${n.y + n.h / 2} ${n.x + n.w / 2},${n.y + n.h} ${n.x},${n.y + n.h / 2}`} fill={sel === n.id ? '#fde68a' : '#fff'} stroke="#334155" /> : <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.shape === 'start' ? 22 : 6} fill={sel === n.id ? '#fde68a' : '#fff'} stroke="#334155" />}<text x={n.x + n.w / 2} y={n.y + n.h / 2 + 4} textAnchor="middle" fontSize="12" fill="#0f172a">{n.label.slice(0, 22)}</text><title>{n.label}</title></g>)}</svg>
          {sel && <input value={scan.nodes.find(n => n.id === sel)?.label ?? ''} onChange={e => setScan(s => (s ? { ...s, nodes: s.nodes.map(n => (n.id === sel ? { ...n, label: e.target.value } : n)) } : s))} className="border rounded px-2 py-1 text-xs w-64" aria-label="Edit box label" data-testid="node-edit" />}</div>}
      </div>}
    </div>
  );
}

/* ---------------- 4. Voice tutor with interruption ---------------- */
export function VoiceTutor({ material, setMaterial }: { material: string; setMaterial: (s: string) => void }) {
  const ai = useAI(); const [lang, setLang] = useState('en'); const [, force] = useState(0); const [msg, setMsg] = useState(''); const [typed, setTyped] = useState(''); const [heard, setHeard] = useState('');
  const nref = useRef<Narrator | null>(null); const langRef = useRef(lang); useEffect(() => { langRef.current = lang; }, [lang]);
  const bcp = lang === 'en' ? 'en-IN' : INDIAN.find(x => x.code === lang)!.bcp; const rateRef = useRef(1);
  const utt = useRef(0); const speak = (text: string) => { try { const my = ++utt.current; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = bcp; u.rate = rateRef.current; u.onend = () => { if (utt.current === my) nref.current?.ended(); }; u.onerror = () => { /* cancelled or no voice: the Narrator waits for the next command */ }; speechSynthesis.speak(u); } catch { /* no speech */ } };
  const interruptRef = useRef<(s: string) => void>(() => {});
  const dict = useDictation(text => { setHeard(text); interruptRef.current(text); });
  const sentences = useMemo(() => splitSentences(cleanForSpeech(material)).slice(0, 200), [material]);
  const start = () => { if (!sentences.length) { setMsg('Add some material first.'); return; } nref.current?.stop(); const n = new Narrator(sentences, { speak: t => speak(t), stopSpeaking: () => { utt.current++; try { speechSynthesis.cancel(); } catch { /* ignore */ } }, setRate: r => { rateRef.current = r; }, onChange: () => force(x => x + 1) }, ai.gen, lang === 'en' ? 'English' : INDIAN.find(x => x.code === lang)!.name); nref.current = n; setMsg(''); n.start(); };
  const interrupt = async (said: string) => { const n = nref.current; if (!n) { setMsg('Start the lesson first.'); return; } if (!ai.ready()) { setMsg('Explaining again needs an AI model (Settings). Commands like pause, continue, slower still work.'); } const r = await n.interrupt(said); setMsg(r.message); };
  useEffect(() => { interruptRef.current = s => void interrupt(s); });
  useEffect(() => () => { try { speechSynthesis.cancel(); } catch { /* ignore */ } }, []);
  const n = nref.current; const listening = dict.state === 'listening' || dict.state === 'starting';
  return (
    <div className="space-y-3" data-testid="voice-tutor">
      <div className={box}><Material value={material} onChange={setMaterial} /><div className="flex gap-2 flex-wrap items-center"><select value={lang} onChange={e => setLang(e.target.value)} className="border rounded px-2 py-1 text-xs" aria-label="Voice language" data-testid="vt-lang"><option value="en">English</option>{INDIAN.map(x => <option key={x.code} value={x.code}>{x.native}</option>)}</select>
        <button className={dark} onClick={start} data-testid="vt-start">Start lesson</button><button className={btn} onClick={() => n?.pause()} disabled={n?.state !== 'speaking'} data-testid="vt-pause">Pause</button><button className={btn} onClick={() => n?.resume()} disabled={n?.state !== 'paused'} data-testid="vt-resume">Continue</button><button className={btn} onClick={() => n?.stop()}>Stop</button></div></div>
      {n && <div className={box} data-testid="vt-now"><div className="text-xs text-slate-500">Reading — {n.state}{n.rewrites ? ` · ${n.rewrites} part(s) re-explained for you` : ''}</div>
        <div className="max-h-48 overflow-auto text-sm leading-relaxed">{n.sentences.map((s, i) => <span key={i} className={i === n.i ? 'bg-amber-200 rounded px-0.5' : ''}>{s} </span>)}</div></div>}
      <div className={box}><b>Interrupt</b><div className="text-xs text-slate-600">Press the mic and say, for example: “Wait, explain that enthalpy part again with an easier example.” Or type it. Also understood: pause, continue, next, go back, slower, faster, stop. A few Hindi words work too (ruko, dobara samjhao, aasan, udaharan, dheere, aage, band karo). Other Indian languages: say or type the request in English.</div>
        <div className="flex gap-2 flex-wrap items-center"><button className={listening ? 'px-3 py-1.5 rounded bg-red-600 text-white text-sm' : dark} onClick={() => { if (listening) dict.stop(); else { nref.current?.pause(); dict.start(); } }} data-testid="vt-mic">{listening ? 'Listening… tap to stop' : '🎤 Interrupt'}</button>
          <input value={typed} onChange={e => setTyped(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && typed.trim()) { void interrupt(typed); setTyped(''); } }} placeholder="or type: explain entropy again with an example" className="border rounded px-2 py-1 text-sm flex-1 min-w-48" aria-label="Type an interruption" data-testid="vt-typed" /><button className={btn} onClick={() => { if (typed.trim()) { void interrupt(typed); setTyped(''); } }} data-testid="vt-send">Send</button></div>
        {heard && <div className="text-xs">Heard: “{heard}”</div>}{dict.error && <Msg m={dict.error} bad />}<Msg m={msg} /></div>
    </div>
  );
}
