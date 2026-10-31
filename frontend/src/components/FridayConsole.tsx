import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Mic, MicOff, Send, Volume2, VolumeX, CheckCircle2, XCircle, Loader2, Trash2, Bot, BookOpen, ThumbsUp, ThumbsDown, RefreshCw, Copy, Circle, MinusCircle, Code2, Ear } from 'lucide-react';
import { useDictation, useReader, SPEECH_LANGS } from '../lib/useVoice';
import { splitSentences } from '../lib/speechUtils';
import { subscribe, getMsgs, isBusy, getPipe, send, onReply, clearChat, feedback, regenerate, copied, runChip, welcome } from '../lib/friday/brain';
import type { Msg, Reason } from '../lib/friday/brain';
import { planJson } from '../lib/friday/plan';
import * as router from '../lib/friday/route';
import MarkdownView from './MarkdownView';
import VoicePicker from './VoicePicker';
import { FilesPanel, MemoryPanel, LearningPanel, MapPanel, BrainPanel } from './FridayPanels';

type Tab = 'chat' | 'files' | 'memory' | 'learning' | 'map' | 'brain';
const TABS: [Tab, string][] = [['chat', 'Chat'], ['files', 'Files'], ['memory', 'Memory'], ['learning', 'Learning'], ['map', 'Map'], ['brain', 'Brain']];
const SUGGEST = ['Go to folder Inbox, capture the document there, move it into the PDF processing section, and generate a summary report', 'Explain backpropagation step by step', 'Open AI segmentation -> go to the image processing module -> set model to U-Net -> run simulation', 'Derive the heat equation', 'Remember that my exam is on Friday', 'What can you do?'];
const SPOKEN = SPEECH_LANGS.filter(l => ['en-US', 'en-IN', 'hi-IN', 'ar-SA', 'mr-IN', 'fr-FR', 'de-DE'].includes(l.code));
const REASONS: [Reason, string][] = [['too_long', 'Too long'], ['too_short', 'Too short'], ['too_technical', 'Too technical'], ['too_simple', 'Too simple'], ['wrong', 'Incorrect']];
const speakable = (t: string) => t.replace(/```[\s\S]*?```/g, ' code block. ').replace(/\$\$?[^$]+\$\$?/g, ' formula ').replace(/[*#_`>|•→“”]/g, ' ').replace(/\s+/g, ' ').trim();

function StepIcon({ s }: { s: string }) {
  return s === 'done' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : s === 'failed' ? <XCircle className="w-4 h-4 text-red-600 shrink-0" /> : s === 'running' ? <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" /> : s === 'skipped' ? <MinusCircle className="w-4 h-4 text-slate-400 shrink-0" /> : <Circle className="w-4 h-4 text-slate-300 shrink-0" />;
}

function Bubble({ m, busy, onSpeak, reader }: { m: Msg; busy: boolean; onSpeak: (m: Msg) => void; reader: ReturnType<typeof useReader> }) {
  const [raw, setRaw] = useState(false); const [why, setWhy] = useState(false);
  if (m.who === 'you') return <div className="flex justify-end"><div className="max-w-[88%] rounded-2xl rounded-br-sm px-3 py-2 bg-amber-600 text-white whitespace-pre-wrap break-words">{m.via === 'voice' && <span className="text-[10px] opacity-80 block">🎙 heard</span>}{m.text}</div></div>;
  return (
    <div className="flex"><div className="max-w-[96%] md:max-w-[85%] min-w-0 rounded-2xl rounded-bl-sm px-3 py-2 bg-white border border-slate-200 break-words" data-testid="friday-reply">
      {m.plan && <div className="mb-1" data-testid="plan-card">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1 flex items-center gap-2">Plan · {m.plan.steps.length} step{m.plan.steps.length === 1 ? '' : 's'}<button onClick={() => setRaw(v => !v)} className="ml-auto flex items-center gap-1 normal-case hover:text-slate-800"><Code2 className="w-3 h-3" />{raw ? 'hide JSON' : 'view JSON'}</button></div>
        <ol className="space-y-1">{m.plan.steps.map((s, i) => <li key={s.id} data-status={s.status} className="flex gap-2 items-start"><StepIcon s={s.status} /><div className="min-w-0"><div className="text-[12px] font-medium leading-tight">{i + 1}. {s.label}</div>{s.message && <div className={`text-[11px] whitespace-pre-wrap ${s.status === 'failed' ? 'text-red-700' : 'text-slate-500'}`}>{s.message.slice(0, 600)}</div>}</div></li>)}</ol>
        {raw && <pre className="mt-2 text-[10px] bg-slate-900 text-emerald-200 p-2 rounded overflow-x-auto max-h-56">{planJson(m.plan)}</pre>}
      </div>}
      {m.text && !(m.plan && m.plan.steps.length === 1 && m.plan.steps[0].status !== 'pending' && m.text.trim() === (m.plan.steps[0].message ?? '').trim()) ? <div className={m.plan ? 'border-t pt-1 mt-1' : ''}><MarkdownView text={m.text} /></div> : m.streaming ? <div className="text-slate-500 text-xs flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> thinking…</div> : null}
      {m.sources && m.sources.length > 0 && <div className="text-[10px] text-slate-500 mt-1.5 flex flex-wrap gap-x-2 items-center"><BookOpen className="w-3 h-3" />{m.sources.map((s, i) => s.url ? <a key={i} href={s.url} target="_blank" rel="noreferrer" className="underline">{s.title}</a> : <span key={i}>{s.title}{s.where ? ` · ${s.where}` : ''}</span>)}</div>}
      {m.chips && m.chips.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{m.chips.map((c, i) => <button key={i} onClick={() => void runChip(c.cmd)} disabled={busy} className="px-2 py-1 rounded-full border border-amber-300 bg-amber-50 text-amber-900 text-[11px] hover:bg-amber-100 disabled:opacity-50">{c.label.length > 60 ? c.label.slice(0, 58) + '…' : c.label}</button>)}</div>}
      {m.strategy && !m.streaming && m.text && <div className="mt-2 flex items-center gap-1 flex-wrap text-[11px] text-slate-500">
        <button aria-label="Good answer" title="Good answer: teach FRIDAY" onClick={() => feedback(m.id, 'up')} className={`p-1 rounded hover:bg-slate-100 ${m.feedback === 'up' ? 'text-emerald-600' : ''}`}><ThumbsUp className="w-3.5 h-3.5" /></button>
        <button aria-label="Bad answer" title="Bad answer: teach FRIDAY" onClick={() => { feedback(m.id, 'down'); setWhy(true); }} className={`p-1 rounded hover:bg-slate-100 ${m.feedback === 'down' ? 'text-red-600' : ''}`}><ThumbsDown className="w-3.5 h-3.5" /></button>
        <button aria-label="Regenerate" title="Try another style" onClick={() => void regenerate(m.id)} disabled={busy} className="p-1 rounded hover:bg-slate-100 disabled:opacity-40"><RefreshCw className="w-3.5 h-3.5" /></button>
        <button aria-label="Copy" title="Copy" onClick={() => { void navigator.clipboard?.writeText(m.text).catch(() => undefined); copied(m.id); }} className="p-1 rounded hover:bg-slate-100"><Copy className="w-3.5 h-3.5" /></button>
        {reader.supported && <button aria-label="Read aloud" title="Read aloud" onClick={() => onSpeak(m)} className="p-1 rounded hover:bg-slate-100"><Volume2 className="w-3.5 h-3.5" /></button>}
        <span className="ml-1">{m.engineLabel ?? 'Offline engine'} · {m.strategy}{m.confidence !== undefined ? ` · ${Math.round(m.confidence * 100)}% confident` : ''}</span>
        {m.notes && m.notes.length > 0 && <span className="text-slate-400">· {m.notes.join(', ')}</span>}
      </div>}
      {why && m.feedback === 'down' && <div className="mt-1 flex flex-wrap gap-1">{REASONS.map(([r, l]) => <button key={r} onClick={() => { feedback(m.id, 'down', r); setWhy(false); }} className="px-2 py-0.5 rounded-full border text-[11px] hover:bg-slate-100">{l}</button>)}</div>}
    </div></div>
  );
}

/** The one FRIDAY. Used by the floating dock (variant "dock") and the full page (variant "page"). */
export default function FridayConsole({ variant, prefix, onClose }: { variant: 'dock' | 'page'; prefix: string; onClose?: () => void }) {
  const all = useSyncExternalStore(subscribe, getMsgs); const busy = useSyncExternalStore(subscribe, isBusy); const pipe = useSyncExternalStore(subscribe, getPipe);
  const [tab, setTab] = useState<Tab>('chat'); const [text, setText] = useState(''); const [showVoice, setShowVoice] = useState(false); const [openPath, setOpenPath] = useState<string | undefined>();
  const [speak, setSpeak] = useState(() => { try { return localStorage.getItem('nm_assistant_speak') === '1'; } catch { return false; } });
  const [hands, setHands] = useState(false); const [engine, setEngine] = useState('…'); const [online, setOnline] = useState(router.isOnline()); const [, bump] = useState(0);
  const reader = useReader(); const logRef = useRef<HTMLDivElement>(null); const speakRef = useRef(speak); speakRef.current = speak; const handsRef = useRef(hands); handsRef.current = hands;
  const dict = useDictation(t => { void send(t, 'voice'); });
  const listening = dict.state === 'listening' || dict.state === 'starting';
  const say = useCallback((m: Msg) => { const segs = splitSentences(speakable(m.text).slice(0, 900)).slice(0, 10).map((s, i) => ({ id: `f${m.id}-${i}`, text: s })); if (segs.length) reader.playFrom(segs, 0); }, [reader]);
  const refreshEngine = useCallback(() => { void router.current().then(c => setEngine(c.label)); setOnline(router.isOnline()); bump(x => x + 1); }, []);
  useEffect(() => { refreshEngine(); }, [refreshEngine]);
  useEffect(() => onReply((m: Msg) => { if (m.who === 'bot' && m.text && (speakRef.current || handsRef.current) && reader.supported) say(m); }), [reader, say]);
  useEffect(() => { const h = (e: Event) => { setOpenPath((e as CustomEvent<string>).detail); setTab('files'); }; window.addEventListener('nm:friday-open-file', h); return () => window.removeEventListener('nm:friday-open-file', h); }, []);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [all, pipe, tab]);
  useEffect(() => { try { localStorage.setItem('nm_assistant_speak', speak ? '1' : '0'); } catch { /* ignore */ } if (!speak && !hands) reader.stop(); }, [speak]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { dict.cancel(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // hands-free conversation: after FRIDAY finishes speaking, listen again
  useEffect(() => { if (hands && !busy && !listening && reader.state === 'idle' && dict.supported && tab === 'chat') { const t = setTimeout(() => { if (handsRef.current) dict.start(); }, 700); return () => clearTimeout(t); } }, [hands, busy, listening, reader.state, dict, tab]);
  const toggleMic = useCallback(() => { if (listening) dict.stop(); else { window.dispatchEvent(new Event('nm:stop-dictation')); reader.stop(); dict.start(); } }, [listening, dict, reader]);
  const page = variant === 'page'; const ghost = page ? 'hover:bg-slate-100' : 'hover:bg-slate-700';
  const activeNode = pipe.filter(n => n.status !== 'idle');
  return (
    <div className="flex flex-col h-full min-h-0" data-testid={`${prefix}-console`}>
      <div className={`flex items-center gap-1.5 px-3 py-2 ${page ? 'bg-white border-b border-amber-200' : 'bg-slate-900 text-white'}`}>
        <Bot className={`w-5 h-5 shrink-0 ${page ? 'text-amber-600' : 'text-amber-400'}`} />
        <div className="flex-1 leading-tight min-w-0"><div className="font-bold text-sm">FRIDAY</div><button onClick={() => setTab('brain')} data-testid={`${prefix}-engine`} className={`text-[10px] truncate max-w-full text-left ${page ? 'text-slate-500' : 'text-slate-300'} hover:underline`}>{engine}{online ? '' : ' · offline mode'}</button></div>
        <button onClick={() => { router.setOnline(!online); refreshEngine(); }} aria-pressed={online} title={online ? 'Online: cloud models and Wikipedia recall allowed. Click to go offline.' : 'Offline mode. Click to allow online features.'} className={`px-2 py-1 rounded text-[10px] font-semibold border ${online ? 'border-emerald-500 text-emerald-600' : 'border-slate-400 text-slate-500'}`}>{online ? 'ONLINE' : 'OFFLINE'}</button>
        <select aria-label="Speech language" value={dict.lang} onChange={e => { dict.setLang(e.target.value); reader.setLang(e.target.value); }} className={`text-[11px] rounded border px-1 py-1 max-w-[7rem] min-w-0 ${page ? 'bg-white' : 'bg-slate-800 border-slate-600 text-white'}`}>{SPOKEN.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}</select>
        <button onClick={() => setShowVoice(v => !v)} aria-label="Voice settings" title="Voice settings" className={`p-1.5 rounded ${ghost}`}>🗣</button>
        <button onClick={() => setHands(v => !v)} aria-pressed={hands} aria-label="Hands-free conversation" title="Hands-free: FRIDAY listens, answers aloud, then listens again" className={`p-1.5 rounded ${hands ? 'bg-amber-600 text-white' : ghost}`}><Ear className="w-4 h-4" /></button>
        <button onClick={() => setSpeak(v => !v)} aria-label={speak ? 'Mute spoken replies' : 'Speak replies'} title={speak ? 'Spoken replies on' : 'Spoken replies off'} className={`p-1.5 rounded ${ghost}`}>{speak ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}</button>
        <button onClick={() => { if (confirm('Clear this conversation? (Memory and learning are kept.)')) clearChat(); }} aria-label="Clear chat" title="Clear chat" className={`p-1.5 rounded ${ghost}`}><Trash2 className="w-4 h-4" /></button>
        {onClose && <button onClick={onClose} aria-label="Close assistant" className="p-1.5 rounded hover:bg-slate-700 text-lg leading-none">×</button>}
      </div>
      <div role="tablist" className="flex bg-white border-b text-xs overflow-x-auto">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} data-testid={`${prefix}-tab-${k}`} onClick={() => setTab(k)} className={`px-3 py-1.5 whitespace-nowrap border-b-2 ${tab === k ? 'border-amber-600 text-amber-700 font-semibold' : 'border-transparent text-slate-600 hover:bg-slate-50'}`}>{l}</button>)}</div>
      {showVoice && <div className="px-3 py-2 bg-white border-b"><VoicePicker reader={reader} /></div>}
      {tab === 'chat' ? <>
        <div ref={logRef} data-testid={`${prefix}-log`} className={`flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5 bg-slate-50 ${page ? 'text-sm md:p-6' : 'text-[13px]'}`} aria-live="polite">
          {all.length === 0 && <div className="flex"><div className="max-w-[92%] rounded-2xl rounded-bl-sm px-3 py-2 bg-white border border-slate-200"><MarkdownView text={welcome()} /></div></div>}
          {all.map(m => <Bubble key={m.id} m={m} busy={busy} onSpeak={say} reader={reader} />)}
          {listening && <div className="text-[12px] text-red-600 animate-pulse">● listening… {dict.interim && <span className="text-slate-600">“{dict.interim}”</span>}</div>}
          {dict.error && <div className="text-[12px] text-red-600">{dict.error}</div>}{reader.error && <div className="text-[12px] text-red-600">{reader.error}</div>}
        </div>
        {(busy || activeNode.length > 0) && <div className="px-2 py-1 bg-white border-t flex gap-1 overflow-x-auto" data-testid="pipeline" aria-label="Reasoning pipeline">{pipe.map(n => <span key={n.id} title={n.detail ?? ''} className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border ${n.status === 'active' ? 'border-amber-500 bg-amber-50 text-amber-800 animate-pulse' : n.status === 'done' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : n.status === 'error' ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 text-slate-400'}`}>{n.label}{n.detail && n.status !== 'idle' && n.status !== 'skipped' ? ` · ${n.detail.length > 28 ? n.detail.slice(0, 26) + '…' : n.detail}` : ''}</span>)}</div>}
        <div className="px-2 pt-1.5 flex gap-1.5 overflow-x-auto bg-white border-t">{SUGGEST.map(s => <button key={s} onClick={() => void send(s, 'text')} disabled={busy} className="shrink-0 text-[11px] px-2 py-1 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50">{s.length > 36 ? s.slice(0, 34) + '…' : s}</button>)}</div>
        <form className="flex items-center gap-1.5 p-2 bg-white" onSubmit={e => { e.preventDefault(); const t = text; setText(''); void send(t, 'text'); }}>
          <button type="button" onClick={toggleMic} disabled={!dict.supported} data-testid={`${prefix}-mic`} aria-label={listening ? 'Stop listening' : 'Start voice input'} title={dict.supported ? (listening ? 'Stop listening' : 'Speak to FRIDAY') : 'Voice input is not supported in this browser (use Chrome or Edge)'} className={`p-2 rounded-full border ${listening ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-700 border-slate-300'} disabled:opacity-40`}>{listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}</button>
          <input data-testid={`${prefix}-input`} value={text} onChange={e => setText(e.target.value)} placeholder="Ask anything, or tell FRIDAY what to do…" className="flex-1 min-w-0 px-3 py-2 rounded-full border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
          <button data-testid={`${prefix}-send`} type="submit" disabled={busy || !text.trim()} aria-label="Send" className="p-2 rounded-full bg-amber-600 text-white disabled:opacity-40"><Send className="w-4 h-4" /></button>
        </form></>
        : <div className="flex-1 min-h-0">{tab === 'files' ? <FilesPanel openPath={openPath} onOpened={() => setOpenPath(undefined)} /> : tab === 'memory' ? <MemoryPanel /> : tab === 'learning' ? <LearningPanel /> : tab === 'map' ? <MapPanel /> : <BrainPanel onChange={refreshEngine} />}</div>}
    </div>
  );
}
