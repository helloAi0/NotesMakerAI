import { useEffect, useRef, useState } from 'react';
import { Clapperboard, Link as LinkIcon, Play, AlignLeft, FileText, Sparkles, BookOpen, ExternalLink, NotebookPen, Copy, Download, Save, Loader2, Search, Upload, Wand2, Trash2 } from 'lucide-react';
import { SAMPLE_TRANSCRIPT, aiRefine, aiTranscribeVideo, buildNotes, fmtTime, toMarkdown, toNotebookText, youtubeId } from '../lib/lecture';
import type { LectureNotes } from '../lib/lecture';
import { llmConfig } from '../lib/friday';
import { toNotebook } from '../lib/agentRuntime';
import { touch } from '../lib/activity';

const KEY = 'nm_lecture_last';
/** rawFor: which video the transcript belongs to: 'sample', a YouTube id (read by AI), or '' when the student pasted it. */
interface Stored { url: string; raw: string; rawFor: string }
const load = (): Stored => {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || '{}'); const url = String(j.url || ''), raw = String(j.raw || ''); let rawFor = String(j.rawFor || '');
    if (!rawFor && raw.trim() === SAMPLE_TRANSCRIPT.trim()) rawFor = 'sample';
    // A transcript that belongs to another video than the link now in the box must not be used for it.
    const id = youtubeId(url); if (rawFor === 'sample' && url.trim()) return { url, raw: '', rawFor: '' }; if (rawFor && rawFor !== 'sample' && id && id !== idOf(rawFor)) return { url, raw: '', rawFor: '' };
    return { url, raw, rawFor };
  } catch { return { url: '', raw: '', rawFor: '' }; }
};

/**
 * Lecture to Notes (Phase 9). Paste a YouTube link and the lecture transcript (or load an .srt/.vtt/.txt file) and get
 * timestamped sections, summaries, formulas, definitions and key terms. Everything is computed on this device;
 * an AI key (optional) rewrites the sections. Clicking a timestamp seeks the embedded video.
 */
const withSource = (n: LectureNotes, rawFor: string): LectureNotes => ({ ...n, source: rawFor === 'sample' ? 'Built-in sample lecture (not linked to any video)' : rawFor ? (rawFor.startsWith('cc:') ? 'YouTube captions fetched from the link' : 'Transcript read from the video by Gemini') : 'Transcript you pasted or loaded' });
const idOf = (rawFor: string) => rawFor.replace(/^cc:/, '');
/** Captions through the local dev server (fast). Returns null when the server cannot do it (static hosting, no captions, offline). */
async function fetchCaptions(id: string, signal: AbortSignal): Promise<{ text: string } | { error: string } | null> {
  try { const r = await fetch(`/api/yt-transcript?v=${id}`, { signal }); if (!/json/.test(r.headers.get('content-type') || '')) return null; const j = await r.json(); return j.ok ? { text: String(j.text) } : { error: String(j.error || 'No captions.') }; } catch { return null; }
}

export default function LectureNotesStudio() {
  const [init] = useState(load);
  const [url, setUrl] = useState(init.url); const [raw, setRaw] = useState(init.raw); const [rawFor, setRawFor] = useState(init.rawFor);
  const [notes, setNotes] = useState<LectureNotes | null>(() => (init.raw.trim() ? withSource(buildNotes(init.raw, init.url), init.rawFor) : null));
  const [tab, setTab] = useState<'notes' | 'transcript'>('notes');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [ai, setAi] = useState(!!llmConfig()); const [aiBusy, setAiBusy] = useState('');
  const [play, setPlay] = useState(0); const [q, setQ] = useState('');
  const frame = useRef<HTMLIFrameElement>(null); const fileRef = useRef<HTMLInputElement>(null);
  const vid = notes?.videoId ?? youtubeId(url);
  useEffect(() => { const h = () => setAi(!!llmConfig()); window.addEventListener('nm:settings', h); return () => window.removeEventListener('nm:settings', h); }, []);

  // follow the YouTube player's clock so the active section and transcript line are highlighted
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (!/youtube(?:-nocookie)?\.com$/.test(new URL(e.origin).hostname) || e.source !== frame.current?.contentWindow) return;
      try { const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; const t = d?.info?.currentTime ?? d?.info?.progressState?.current; if (typeof t === 'number') setPlay(t); } catch { /* not ours */ }
    };
    window.addEventListener('message', h); return () => window.removeEventListener('message', h);
  }, []);
  const post = (func: string, args: unknown[] = []) => { try { frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*'); } catch { /* offline or blocked */ } };
  const listen = () => { try { frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'); } catch { /* ignore */ } };
  const seek = (sec: number) => { setPlay(sec); post('seekTo', [sec, true]); post('playVideo'); };

    const build = (text: string, forId: string) => {
    const n = withSource(buildNotes(text, url), forId);
    if (!n.sections.length) { setMsg('I could not find any text in that transcript.'); return; }
    setNotes(n); setTab('notes'); setPlay(0); void import('../lib/friday/agentsRuntime').then(m => m.studentModel.record({ type: 'lecture', ref: forId, topic: n.title })).catch(() => {}); try { localStorage.setItem(KEY, JSON.stringify({ url, raw: text, rawFor: forId })); } catch { setMsg('Notes built, but this browser has no room left to remember them.'); return; }
    setMsg(`Built ${n.sections.length} section${n.sections.length > 1 ? 's' : ''} from ${n.cues.length} transcript lines${n.timed ? '' : ' (no timestamps found, so times are estimated at normal speaking speed)'}.`);
  };
  const abortRef = useRef<AbortController | null>(null); const [secs, setSecs] = useState(0);
  useEffect(() => { if (!busy) return; setSecs(0); const t = setInterval(() => setSecs(x => x + 1), 1000); return () => clearInterval(t); }, [busy]);
  const cancel = () => { abortRef.current?.abort(); };
  /** Link -> transcript. 1) YouTube captions through the local server (seconds). 2) Gemini watching the video (minutes for a long lecture). */
  const readVideo = async () => {
    const id = youtubeId(url); if (!id) { setMsg('Paste a YouTube link first.'); return; }
    const ac = new AbortController(); abortRef.current = ac; setBusy(true); setMsg('Fetching the captions from YouTube…');
    try {
      const cc = await fetchCaptions(id, ac.signal);
      if (cc && 'text' in cc) { setRaw(cc.text); setRawFor('cc:' + id); build(cc.text, 'cc:' + id); return; }
      const cfg = llmConfig();
      if (!cfg || cfg.provider !== 'gemini') { setMsg(`${cc && 'error' in cc ? cc.error + ' ' : cc === null ? 'Captions can only be fetched while running “npm run dev” with internet. ' : ''}Paste the transcript instead (YouTube: ⋯ More → Show transcript → copy), or add a Gemini key so Gemini can watch the video.`); return; }
      setMsg(`${cc && 'error' in cc ? 'No captions were available. ' : ''}Gemini is watching the video and writing its transcript. A long lecture can take several minutes: you can cancel and paste the transcript instead.`);
      const t = await aiTranscribeVideo(cfg, id, ac.signal, { onStatus: m => m && setMsg(m) }); setRaw(t); setRawFor(id); build(t, id);
    } catch (e) { setMsg(ac.signal.aborted ? 'Cancelled.' : (e as Error).message); } finally { setBusy(false); abortRef.current = null; }
  };
  const onUrl = (v: string) => {
    setUrl(v); const id = youtubeId(v);
    if (v.trim() && raw.trim() && (rawFor === 'sample' || (rawFor && id && id !== idOf(rawFor)))) { setRaw(''); setRawFor(''); setNotes(null); setMsg(rawFor === 'sample' ? 'Removed the sample transcript because you entered your own link. Paste that video’s transcript, or press “Read the video with AI”.' : 'Removed the old transcript because it belongs to a different video. Paste this video’s transcript, or press “Read the video with AI”.'); }
  };
  const generate = (e?: React.FormEvent) => {
    e?.preventDefault(); setMsg('');
    if (url.trim() && !youtubeId(url)) { setMsg('That does not look like a YouTube link. Paste a link such as https://www.youtube.com/watch?v=… (or leave it empty to work from the transcript only).'); return; }
    if (!raw.trim()) { if (youtubeId(url)) { void readVideo(); return; } setMsg(youtubeId(url) ? 'The notes are made from the transcript, not from the link. Paste the transcript below (YouTube: ⋯ More → Show transcript → copy), load an .srt/.vtt file, or press “Get transcript from link”.' : 'Paste the lecture transcript below first. On YouTube: ⋯ (More) → Show transcript → select the text → copy. Or load an .srt / .vtt / .txt file.'); return; }
    setBusy(true); touch('ask');
    setTimeout(() => { build(raw, rawFor); setBusy(false); }, 30);
  };
  const loadSample = () => { setRaw(SAMPLE_TRANSCRIPT); setRawFor('sample'); setUrl(''); setNotes(null); setMsg('Sample thermodynamics lecture loaded (it is not a real video). Press Make notes.'); };
  const onFile = async (f?: File | null) => { if (!f) return; const t = await f.text(); setRaw(t); setRawFor(''); setMsg(`Loaded ${f.name} (${t.length.toLocaleString()} characters). Press Make notes.`); };
  const clear = () => { setNotes(null); setRaw(''); setRawFor(''); setUrl(''); setMsg(''); try { localStorage.removeItem(KEY); } catch { /* ignore */ } };
  const [everything, setEverything] = useState('');
  const makeEverything = async () => {
    if (!notes) return; setEverything('Working…');
    try {
      const [{ lectureToEverything }, rt, { SIMS }, planner] = await Promise.all([import('../lib/platform/pipeline'), import('../lib/friday/agentsRuntime'), import('../sims/registry'), import('../lib/planner')]);
      const ev = lectureToEverything(notes, SIMS.map(s => ({ id: s.id, title: s.title, tags: s.tags, subject: s.subject })));
      const added = rt.deck.add(ev.cards); for (const p of ev.plan) planner.addTask({ title: p.title, due: p.due, subject: ev.topic, kind: 'task' });
      setEverything(`Made ${added} flashcard${added === 1 ? '' : 's'}${ev.sims.length ? `, found ${ev.sims.length} related simulation${ev.sims.length > 1 ? 's' : ''} (${ev.sims.map(x => x.title).join(', ')})` : ''} and a ${ev.plan.length}-step study plan in your Planner. Open Practice or the Tutor to start your first quiz.`);
    } catch (e) { setEverything(`Could not do that: ${(e as Error).message}`); }
  };
  const refine = async () => {
    const cfg = llmConfig(); if (!cfg || !notes) { setMsg('Add an AI key in Settings to rewrite the notes with AI.'); return; }
    setAiBusy('0%'); try { const r = await aiRefine(cfg, notes, (d, t) => setAiBusy(`${Math.round(d / t * 100)}%`)); setNotes(r); setMsg('Sections rewritten by your AI model. Check the formulas against the video.'); } catch (e) { setMsg(`AI rewrite failed: ${(e as Error).message}`); } finally { setAiBusy(''); }
  };
  const md = notes ? toMarkdown(notes) : '';
  const toNb = async () => { if (!notes) return; const r = await toNotebook(toNotebookText(notes)); setMsg(r.msg); };
  const save = () => { if (!notes) return; try { localStorage.setItem(`nm_gen_lec_${Date.now()}`, JSON.stringify({ topic: notes.title, text: md, t: Date.now() })); setMsg('Saved. FRIDAY can now search these notes (Note Generator → Saved notes).'); } catch { setMsg('Could not save (storage full).'); } };
  const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' })); a.download = `${(notes?.title || 'lecture').replace(/[^\w]+/g, '-').slice(0, 50)}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const activeSec = notes ? [...notes.sections].reverse().find(s => play >= s.start)?.id ?? 0 : 0;
  const ql = q.trim().toLowerCase();
  const stampBtn = (t: number, cls = '') => <button type="button" onClick={() => seek(t)} title="Jump to this time in the video" className={`font-mono text-[11px] font-bold text-red-700 hover:underline ${cls}`}>{fmtTime(t)}</button>;

  return (
    <div className="h-full overflow-y-auto md:overflow-hidden flex flex-col bg-slate-100" data-testid="lecture-view">
      <div className="bg-white border-b border-slate-200 px-4 md:px-8 py-3 flex items-center gap-3 shrink-0">
        <div className="p-2 bg-red-100 text-red-600 rounded-lg"><Clapperboard className="w-5 h-5" /></div>
        <div className="min-w-0"><h1 className="text-lg md:text-xl font-bold text-slate-900">Lecture to Notes</h1><p className="text-xs text-slate-500">Turn a lecture transcript into timestamped sections, formulas, definitions and a summary. Works offline.</p></div>
        {notes && <button onClick={clear} className="ml-auto text-xs flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"><Trash2 className="w-3 h-3" /> New lecture</button>}
      </div>

      <div className="md:flex-1 md:min-h-0 flex flex-col md:flex-row gap-4 p-3 md:p-5">
        {/* left: input + player */}
        <div className="w-full md:w-[42%] shrink-0 md:shrink flex flex-col gap-3 md:min-h-0 md:overflow-y-auto">
          <form onSubmit={generate} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex flex-col gap-2">
            <label htmlFor="lec-url" className="text-xs font-bold text-slate-700 uppercase tracking-wider">YouTube link (optional)</label>
            <div className="relative"><LinkIcon className="w-4 h-4 absolute left-3 top-3 text-slate-400" /><input id="lec-url" data-testid="lec-url" value={url} onChange={e => onUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500" /></div>
            <label htmlFor="lec-raw" className="text-xs font-bold text-slate-700 uppercase tracking-wider mt-1">Transcript</label>
            <textarea id="lec-raw" data-testid="lec-raw" value={raw} onChange={e => { setRaw(e.target.value); if (rawFor) setRawFor(''); }} rows={7} placeholder={'Paste the transcript here. Timestamps like 0:00, [02:15] or SRT/VTT are kept.\nOn YouTube: ⋯ More → Show transcript → copy.'} className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 resize-y" />
            <div className="flex flex-wrap gap-2 items-center">
              <button data-testid="lec-go" type="submit" disabled={busy} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Make notes</button>
              {vid && !busy && <button type="button" data-testid="lec-read" onClick={() => void readVideo()} title="Fetches YouTube's own captions (seconds). If there are none, Gemini can watch the video (slow)." className="px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1 border-red-300 text-red-700 bg-red-50 hover:bg-red-100"><Wand2 className="w-3.5 h-3.5" /> Get transcript from link</button>}
              {busy && <button type="button" data-testid="lec-cancel" onClick={cancel} className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold hover:bg-slate-50">Cancel ({secs}s)</button>}
              <button type="button" onClick={() => fileRef.current?.click()} className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold flex items-center gap-1 hover:bg-slate-50"><Upload className="w-3.5 h-3.5" /> Load .srt / .vtt / .txt</button>
              <button type="button" data-testid="lec-sample" onClick={loadSample} className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold hover:bg-slate-50">Try a sample lecture</button>
              <input ref={fileRef} type="file" accept=".srt,.vtt,.txt,.md,text/plain" className="hidden" onChange={e => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
            {everything && <p role="status" data-testid="lec-everything-msg" className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{everything}</p>}
            {msg && <p role="status" data-testid="lec-msg" className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{msg}</p>}
          </form>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden relative aspect-video min-h-[200px] shrink-0">
            {vid ? <iframe ref={frame} onLoad={listen} title="YouTube video player" src={`https://www.youtube-nocookie.com/embed/${vid}?enablejsapi=1&rel=0&origin=${encodeURIComponent(window.location.origin)}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="absolute inset-0 w-full h-full border-0" />
              : <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 text-center px-4"><Clapperboard className="w-10 h-10 mb-2 opacity-30" /><p className="text-sm font-medium">Paste a YouTube link to load the video here.</p><p className="text-xs mt-1">The notes work without a video too.</p></div>}
          </div>
          {vid && <p className="text-[11px] text-slate-500 -mt-1">The video needs an internet connection. If it does not load, <a className="text-red-700 underline inline-flex items-center gap-0.5" href={`https://youtu.be/${vid}?t=${Math.floor(play)}`} target="_blank" rel="noreferrer">open it on YouTube <ExternalLink className="w-3 h-3" /></a>. Timestamps in the notes still work.</p>}
        </div>

        {/* right: notes / transcript */}
        <div className="w-full md:w-[58%] bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col md:overflow-hidden shrink-0 md:shrink min-h-[360px] md:min-h-0">
          {!notes ? <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 text-center"><BookOpen className="w-12 h-12 mb-3 text-slate-300" /><p className="text-sm font-medium">Your lecture notes will appear here.</p><p className="text-xs mt-1 max-w-sm">Paste a transcript, or press “Try a sample lecture” to see how it works.</p></div> : <>
            <div className="flex border-b border-slate-200 bg-slate-50 shrink-0" role="tablist">
              {([['notes', 'Structured Notes', FileText], ['transcript', 'Full Transcript', AlignLeft]] as const).map(([id, label, Icon]) => <button key={id} role="tab" aria-selected={tab === id} data-testid={`lec-tab-${id}`} onClick={() => setTab(id)} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 ${tab === id ? 'text-red-700 bg-white border-b-2 border-red-600' : 'text-slate-500 hover:bg-slate-100'}`}><Icon className="w-4 h-4" /> {label}</button>)}
            </div>
            <div className="flex-1 md:overflow-y-auto p-4 md:p-6 bg-slate-50">
              {tab === 'notes' && <div className="space-y-5 max-w-2xl mx-auto">
                <div className="border-b border-slate-200 pb-3">
                  <h2 className="text-lg font-bold text-slate-900" data-testid="lec-title">{notes.title}</h2>
                  {notes.source && <p data-testid="lec-source" className="text-[11px] mt-1 inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-900">Source: {notes.source}</p>}
                  <p className="text-xs text-slate-500 mt-0.5">{notes.sections.length} section{notes.sections.length > 1 ? 's' : ''} · {fmtTime(notes.duration)}{notes.timed ? '' : ' (estimated)'}</p>
                  {notes.keyTerms.length > 0 && <p className="text-xs text-slate-700 mt-2"><span className="font-semibold">Key terms:</span> {notes.keyTerms.join(' · ')}</p>}
                  <div className="flex flex-wrap gap-2 mt-3 text-xs">
                    <button data-testid="lec-nb" onClick={() => void toNb()} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-semibold flex items-center gap-1"><NotebookPen className="w-3 h-3" /> Save to Notebook</button>
                    <button onClick={save} className="px-3 py-1.5 rounded-lg border border-slate-300 font-semibold flex items-center gap-1"><Save className="w-3 h-3" /> Save</button>
                    <button onClick={() => { void navigator.clipboard?.writeText(md); setMsg('Notes copied as Markdown.'); }} className="px-3 py-1.5 rounded-lg border border-slate-300 font-semibold flex items-center gap-1"><Copy className="w-3 h-3" /> Copy</button>
                    <button onClick={download} className="px-3 py-1.5 rounded-lg border border-slate-300 font-semibold flex items-center gap-1"><Download className="w-3 h-3" /> .md</button>
                    <button data-testid="lec-everything" onClick={() => void makeEverything()} title="Flashcards, a first quiz, simulation suggestions and a spaced study plan from this lecture" className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-900 text-sm font-semibold">Make cards, quiz &amp; study plan</button>
                    <button data-testid="lec-ai" onClick={() => void refine()} disabled={!!aiBusy} title={ai ? 'Rewrite titles, summaries and key points with your AI model' : 'Add an AI key in Settings to enable'} className={`px-3 py-1.5 rounded-lg border font-semibold flex items-center gap-1 ${ai ? 'border-red-300 text-red-700 bg-red-50' : 'border-slate-200 text-slate-400'}`}>{aiBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} {aiBusy ? `Rewriting ${aiBusy}` : 'Improve with AI'}</button>
                  </div>
                </div>
                {notes.sections.map(s => (
                  <section key={s.id} data-testid="lec-section" aria-current={activeSec === s.id && play > 0 ? 'true' : undefined} className={`bg-white p-5 rounded-xl border shadow-sm relative transition-colors ${activeSec === s.id && play > 0 ? 'border-red-400 ring-2 ring-red-100' : 'border-slate-200 hover:border-red-300'}`}>
                    <button data-testid="lec-stamp" onClick={() => seek(s.start)} title="Jump to this time in the video" className="absolute -left-2 -top-3 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-md flex items-center gap-1 hover:bg-red-700"><Play className="w-3 h-3" /> {fmtTime(s.start)}</button>
                    <h3 className="text-sm font-bold text-slate-800 mb-1 mt-1">{s.title} <span className="font-normal text-[11px] text-slate-400">{fmtTime(s.start)}–{fmtTime(s.end)}</span></h3>
                    <p className="text-xs text-slate-600 mb-3">{s.summary}</p>
                    {s.bullets.length > 0 && <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4 marker:text-red-400">{s.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
                    {s.formulas.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{s.formulas.map((f, i) => <code key={i} data-testid="lec-formula" className="px-2 py-1 rounded-md bg-slate-900 text-amber-300 text-xs">{f.text}</code>)}</div>}
                    {s.definitions.length > 0 && <dl className="mt-3 space-y-1 text-xs border-t border-slate-100 pt-2">{s.definitions.map((d, i) => <div key={i}><dt className="inline font-semibold text-red-800">{d.term}: </dt><dd className="inline text-slate-700">{d.meaning}</dd></div>)}</dl>}
                  </section>
                ))}
              </div>}
              {tab === 'transcript' && <div className="max-w-2xl mx-auto">
                <div className="relative mb-3"><Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} aria-label="Search transcript" placeholder="Search the transcript" className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-xl" /></div>
                <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm text-sm leading-relaxed text-slate-700">
                  {notes.cues.filter(c => !ql || c.text.toLowerCase().includes(ql)).map((c, i, arr) => { const next = notes.cues[notes.cues.indexOf(c) + 1]; const on = play >= c.t && (!next || play < next.t) && play > 0; void arr; return <p key={i} className={`mb-3 rounded px-1 ${on ? 'bg-red-50' : ''}`}>{stampBtn(c.t, 'mr-2')}{c.text}</p>; })}
                </div>
              </div>}
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}
