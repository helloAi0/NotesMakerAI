import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Mic, MicOff, Send, X, Volume2, VolumeX, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useDictation } from '../lib/useVoice';
import { parseCommand } from '../lib/voiceIntents';
import { runCommand, explainCurrent, searchAll, helpText, isCommandLike } from '../lib/agentRuntime';
import type { Chip, StepResult } from '../lib/agentRuntime';
import { cap } from '../lib/agentBus';
import { generate, loadProvider, loadSaved, loadSpeed } from '../lib/aiClient';

interface Msg { id: number; who: 'you' | 'bot'; text: string; steps?: (StepResult | null)[]; total?: number; chips?: Chip[]; via?: 'voice' | 'text' }

const SUGGEST = ['Help', 'Open AI segmentation -> go to the image processing module -> set model to U-Net -> run simulation', 'Explain this simulation', 'Search Fourier transform'];

/** Persistent local assistant: chat + voice. Runs commands against the real app, edits the notebook, searches local data, explains the running simulation. */
export default function AssistantDock() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, who: 'bot', text: 'Hi! I am your offline study assistant. Type or speak a command, e.g. “Open AI segmentation → go to the image processing module → set model to U-Net → run simulation”. Say “help” for more.' }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(() => { try { return localStorage.getItem('nm_assistant_speak') === '1'; } catch { return false; } });
  const idRef = useRef(1);
  const logRef = useRef<HTMLDivElement>(null);
  const speakRef = useRef(speakReplies); speakRef.current = speakReplies;

  const say = useCallback((t: string) => {
    if (!speakRef.current || !('speechSynthesis' in window)) return;
    try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t.replace(/[“”•→*#_`]/g, ' ').slice(0, 400)); window.speechSynthesis.speak(u); } catch { /* ignore */ }
  }, []);
  const add = useCallback((m: Omit<Msg, 'id'>) => { const id = idRef.current++; setMsgs(a => [...a, { ...m, id }]); return id; }, []);
  const patch = useCallback((id: number, f: (m: Msg) => Msg) => setMsgs(a => a.map(m => (m.id === id ? f(m) : m))), []);

  const askModel = useCallback(async (q: string): Promise<string | null> => {
    const provider = loadProvider(); const saved = loadSaved(provider, (import.meta.env.VITE_GEMINI_API_KEY as string) || '');
    if (!saved.apiKey || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
    const nb = cap('notebook'); const ctx = `${explainCurrent().text}\n\nCurrent notebook page:\n${(nb?.getText() ?? '').slice(0, 1500)}`;
    try { return await generate({ provider, apiKey: saved.apiKey, model: saved.model, baseUrl: saved.baseUrl, speed: loadSpeed() }, `You are a concise study assistant inside an offline notes + simulation app for university students. Context:\n${ctx}\n\nStudent: ${q}\nAnswer in under 150 words; use $...$ for formulas.`, { maxTokens: 500, timeoutMs: 25000 }); } catch { return null; }
  }, []);

  const handle = useCallback(async (raw: string, via: 'voice' | 'text') => {
    const q = raw.trim(); if (!q || busy) return; setBusy(true);
    add({ who: 'you', text: q, via });
    try {
      const steps = parseCommand(q);
      const only = steps.length === 1 ? steps[0].intent : null;
      if (only?.kind === 'explain') { const r = explainCurrent(q); const noSim = !cap('sim'); const llm = noSim ? null : await askModel(q); const t = llm ?? r.text; add({ who: 'bot', text: t }); say(t); }
      else if (only?.kind === 'search') { const r = searchAll(only.q); add({ who: 'bot', text: r.text, chips: r.chips }); say(r.text.split('\n')[0]); }
      else if (only?.kind === 'help') { const t = helpText(); add({ who: 'bot', text: t }); say('Here are some things you can say.'); }
      else if (isCommandLike(q)) {
        const id = add({ who: 'bot', text: '', steps: [], total: steps.length });
        const res = await runCommand(q, (i, total, r) => patch(id, m => { const st = [...(m.steps ?? [])]; st[i] = r; return { ...m, steps: st, total }; }));
        const last = res[res.length - 1]; const fail = res.find(r => !r.ok);
        patch(id, m => ({ ...m, text: fail ? `Stopped: ${fail.message}` : res.length > 1 ? `Done: ${res.length} steps completed.` : last?.message ?? '' }));
        say(fail ? fail.message : res.length > 1 ? `Done. ${res.length} steps completed.` : last?.message ?? '');
      } else { // free question
        const llm = await askModel(q); const sr = searchAll(q);
        const t = llm ?? `I am running offline, so I can't answer open questions, but I can search and act. ${sr.chips?.length ? sr.text : 'Nothing in your notes or simulations matched.'}\nTip: add an AI key in the PDF Library tab to let me answer general questions when online.`;
        add({ who: 'bot', text: t, chips: llm ? undefined : sr.chips }); say(llm ? llm : 'I am offline; here is what I found.');
      }
    } catch (e) { add({ who: 'bot', text: `Something went wrong: ${(e as Error).message}` }); }
    finally { setBusy(false); }
  }, [add, patch, askModel, say, busy]);

  const dict = useDictation(t => { void handle(t, 'voice'); });
  const listening = dict.state === 'listening' || dict.state === 'starting';
  const toggleMic = () => { if (listening) dict.stop(); else { window.dispatchEvent(new Event('nm:stop-dictation')); dict.start(); } };

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [msgs, open]);
  useEffect(() => { try { localStorage.setItem('nm_assistant_speak', speakReplies ? '1' : '0'); } catch { /* ignore */ } }, [speakReplies]);
  useEffect(() => { if (!open && listening) dict.stop(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.altKey && e.key.toLowerCase() === 'a') { e.preventDefault(); setOpen(o => !o); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);

  if (!open) return (
    <button data-testid="assistant-toggle" onClick={() => setOpen(true)} aria-label="Open assistant (Alt+A)" title="Assistant (Alt+A)" className="no-print fixed right-3 bottom-14 md:bottom-4 z-[60] flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-amber-600 hover:bg-amber-500 text-white shadow-xl font-semibold text-sm">
      <Bot className="w-5 h-5" /> Assistant
    </button>
  );
  return (
    <div data-testid="assistant-panel" className="no-print fixed right-2 md:right-4 bottom-2 md:bottom-4 z-[60] w-[calc(100vw-1rem)] max-w-[26rem] h-[min(34rem,calc(100vh-5rem))] flex flex-col rounded-2xl bg-white border border-amber-300 shadow-2xl text-slate-800 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 text-white">
        <Bot className="w-5 h-5 text-amber-400" /><div className="flex-1 leading-tight"><div className="font-bold text-sm">Study Assistant</div><div className="text-[10px] text-slate-300">offline · voice + commands</div></div>
        <button onClick={() => setSpeakReplies(v => !v)} aria-label={speakReplies ? 'Mute spoken replies' : 'Speak replies'} title={speakReplies ? 'Spoken replies on' : 'Spoken replies off'} className="p-1.5 rounded hover:bg-slate-700">{speakReplies ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4" />}</button>
        <button onClick={() => setOpen(false)} aria-label="Close assistant" className="p-1.5 rounded hover:bg-slate-700"><X className="w-4 h-4" /></button>
      </div>
      <div ref={logRef} data-testid="assistant-log" className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-slate-50 text-[13px]">
        {msgs.map(m => (
          <div key={m.id} className={m.who === 'you' ? 'flex justify-end' : 'flex'}>
            <div className={`max-w-[90%] rounded-2xl px-3 py-2 whitespace-pre-wrap ${m.who === 'you' ? 'bg-amber-600 text-white rounded-br-sm' : 'bg-white border border-slate-200 rounded-bl-sm'}`}>
              {m.via === 'voice' && <span className="text-[10px] opacity-80 block">🎙 heard</span>}
              {m.steps && (
                <ol className="space-y-1 mb-1">
                  {Array.from({ length: m.total ?? m.steps.length }).map((_, i) => { const r = m.steps![i]; return (
                    <li key={i} className="flex gap-1.5 items-start">{r ? (r.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-px" /> : <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-px" />) : (busy && i === (m.steps!.filter(Boolean).length) ? <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0 mt-px" /> : <span className="w-4 h-4 shrink-0 rounded-full border border-slate-300 mt-px" />)}<span className={r && !r.ok ? 'text-red-700' : ''}>{r ? r.message : '…'}</span></li>); })}
                </ol>
              )}
              {m.text && <div className={m.steps ? 'text-[12px] text-slate-500 border-t pt-1' : ''}>{m.text}</div>}
              {m.chips && m.chips.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{m.chips.map((c, i) => <button key={i} onClick={() => void handle(c.cmd, 'text')} className="px-2 py-1 rounded-md bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-semibold hover:bg-amber-100">{c.label}</button>)}</div>}
            </div>
          </div>
        ))}
        {listening && <div className="text-[12px] text-red-600 animate-pulse">● listening… {dict.interim && <span className="text-slate-600 not-italic">“{dict.interim}”</span>}</div>}
        {dict.error && <div className="text-[12px] text-red-600">{dict.error}</div>}
      </div>
      <div className="px-2 pt-1.5 flex gap-1.5 overflow-x-auto bg-white border-t">
        {SUGGEST.map(s => <button key={s} onClick={() => void handle(s, 'text')} disabled={busy} className="shrink-0 text-[11px] px-2 py-1 rounded-full border border-slate-300 text-slate-700 hover:bg-amber-50 max-w-[11rem] truncate">{s}</button>)}
      </div>
      <form className="flex items-center gap-1.5 p-2 bg-white" onSubmit={e => { e.preventDefault(); const t = text; setText(''); void handle(t, 'text'); }}>
        <button type="button" onClick={toggleMic} disabled={!dict.supported} aria-label={listening ? 'Stop listening' : 'Start voice input'} title={dict.supported ? (listening ? 'Stop listening' : 'Speak a command') : 'Voice input needs Chrome or Edge'} className={`p-2 rounded-full ${listening ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-100 text-slate-700 hover:bg-amber-100'} disabled:opacity-40`}>{listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}</button>
        <input data-testid="assistant-input" value={text} onChange={e => setText(e.target.value)} placeholder="Type or say a command…" className="flex-1 px-3 py-2 rounded-full border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        <button data-testid="assistant-send" type="submit" disabled={busy || !text.trim()} aria-label="Send" className="p-2 rounded-full bg-amber-600 text-white disabled:opacity-40"><Send className="w-4 h-4" /></button>
      </form>
    </div>
  );
}
