import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Mic, MicOff, Send, Volume2, VolumeX, CheckCircle2, XCircle, Loader2, Trash2, Bot, BookOpen } from 'lucide-react';
import { useDictation, useReader } from '../lib/useVoice';
import { splitSentences } from '../lib/speechUtils';
import { subscribe, getMsgs, isBusy, send, onReply, clearChat, WELCOME } from '../lib/fridayChat';
import type { Msg, Track } from '../lib/fridayChat';
import { llmConfig } from '../lib/friday';
import VoicePicker from './VoicePicker';

const SUGGEST: Record<Track, string[]> = {
  agent: ['Help', 'Open AI segmentation -> go to the image processing module -> set model to U-Net -> run simulation', 'Write a note about Fourier series', 'List my PDFs', 'What is due this week?'],
  research: ['Explain backpropagation', 'Derive the heat equation', 'What is the Carnot efficiency?', 'How do I add a simulation to my notebook?', 'Explain eigenvalues'],
};

/** FRIDAY chat UI used by the floating dock (variant "dock") and the full page (variant "page"). */
export default function FridayChat({ variant, prefix, onClose, track }: { variant: 'dock' | 'page'; prefix: string; onClose?: () => void; track: Track }) {
  const all = useSyncExternalStore(subscribe, getMsgs); const msgs = [WELCOME[track], ...all.filter(m => m.track === track)]; const busy = useSyncExternalStore(subscribe, isBusy);
  const [text, setText] = useState(''); const [showVoice, setShowVoice] = useState(false);
  const [speak, setSpeak] = useState(() => { try { return localStorage.getItem('nm_assistant_speak') === '1'; } catch { return false; } });
  const reader = useReader(); const logRef = useRef<HTMLDivElement>(null); const speakRef = useRef(speak); speakRef.current = speak;
  const dict = useDictation(t => { void send(t, 'voice', track); });
  const listening = dict.state === 'listening' || dict.state === 'starting';
  const ai = llmConfig();
  useEffect(() => onReply((m: Msg) => { if (m.track !== track || !speakRef.current || !reader.supported) return; const t = (m.text || '').replace(/[“”•→*#_`]/g, ' ').slice(0, 700); const segs = splitSentences(t).slice(0, 8).map((s, i) => ({ id: `f${m.id}-${i}`, text: s })); if (segs.length) reader.playFrom(segs, 0); }), [reader, track]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [msgs]);
  useEffect(() => { try { localStorage.setItem('nm_assistant_speak', speak ? '1' : '0'); } catch { /* ignore */ } if (!speak) reader.stop(); }, [speak]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { dict.cancel(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleMic = useCallback(() => { if (listening) dict.stop(); else { window.dispatchEvent(new Event('nm:stop-dictation')); reader.stop(); dict.start(); } }, [listening, dict, reader]);
  const page = variant === 'page';
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className={`flex items-center gap-2 px-3 py-2 ${page ? 'bg-white border-b border-amber-200' : 'bg-slate-900 text-white'}`}>
        <Bot className={`w-5 h-5 ${page ? 'text-amber-600' : 'text-amber-400'}`} />
        <div className="flex-1 leading-tight min-w-0"><div className="font-bold text-sm">FRIDAY · {track === 'research' ? 'Research Knowledge Engine' : 'Agentic Voice Controller'}</div><div className={`text-[10px] truncate ${page ? 'text-slate-500' : 'text-slate-300'}`}>{ai ? `AI connected (${ai.provider}) + built-in knowledge` : 'offline · built-in STEM knowledge, your notes & PDFs'}</div></div>
        <button onClick={() => setShowVoice(v => !v)} aria-label="Voice settings" title="Voice settings" className={`p-1.5 rounded ${page ? 'hover:bg-slate-100' : 'hover:bg-slate-700'}`}>🗣</button>
        <button onClick={() => setSpeak(v => !v)} aria-label={speak ? 'Mute spoken replies' : 'Speak replies'} title={speak ? 'Spoken replies on' : 'Spoken replies off'} className={`p-1.5 rounded ${page ? 'hover:bg-slate-100' : 'hover:bg-slate-700'}`}>{speak ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}</button>
        <button onClick={() => { if (confirm('Clear this conversation?')) clearChat(track); }} aria-label="Clear chat" title="Clear chat" className={`p-1.5 rounded ${page ? 'hover:bg-slate-100' : 'hover:bg-slate-700'}`}><Trash2 className="w-4 h-4" /></button>
        {onClose && <button onClick={onClose} aria-label="Close assistant" className="p-1.5 rounded hover:bg-slate-700 text-lg leading-none">×</button>}
      </div>
      {showVoice && <div className="px-3 py-2 bg-white border-b"><VoicePicker reader={reader} /></div>}
      <div ref={logRef} data-testid={`${prefix}-log`} className={`flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5 bg-slate-50 ${page ? 'text-sm md:p-6' : 'text-[13px]'}`} aria-live="polite">
        {msgs.map(m => (
          <div key={m.id} className={m.who === 'you' ? 'flex justify-end' : 'flex'}>
            <div className={`max-w-[92%] ${page ? 'md:max-w-[75%]' : ''} rounded-2xl px-3 py-2 whitespace-pre-wrap break-words ${m.who === 'you' ? 'bg-amber-600 text-white rounded-br-sm' : 'bg-white border border-slate-200 rounded-bl-sm'}`}>
              {m.via === 'voice' && <span className="text-[10px] opacity-80 block">🎙 heard</span>}
              {m.steps && (
                <ol className="space-y-1 mb-1">
                  {Array.from({ length: m.total ?? m.steps.length }).map((_, i) => { const r = m.steps![i]; return (
                    <li key={i} className="flex gap-1.5 items-start">{r ? (r.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-px" /> : <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-px" />) : <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0 mt-px" />}<span className={r && !r.ok ? 'text-red-700' : ''}>{r ? r.message : '…'}</span></li>); })}
                </ol>
              )}
              {m.text && <div className={m.steps ? 'text-[12px] text-slate-500 border-t pt-1' : ''}>{m.text}</div>}
              {m.mode === 'ai' && <div className="text-[10px] text-amber-700 mt-1">answered with your AI provider</div>}
              {m.sources && m.sources.length > 0 && <div className="text-[10px] text-slate-500 mt-1.5 flex flex-wrap gap-x-2 items-center"><BookOpen className="w-3 h-3" />{m.sources.slice(0, 5).map((s, i) => <span key={i}>{s.title}{s.where ? ` · ${s.where}` : ''}</span>)}</div>}
              {m.chips && m.chips.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{m.chips.map((c, i) => <button key={i} onClick={() => void send(c.cmd, 'text', track)} disabled={busy} className="px-2 py-1 rounded-full border border-amber-300 bg-amber-50 text-amber-900 text-[11px] hover:bg-amber-100 disabled:opacity-50">{c.label}</button>)}</div>}
            </div>
          </div>
        ))}
        {busy && <div className="text-[12px] text-slate-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> thinking…</div>}
        {listening && <div className="text-[12px] text-red-600 animate-pulse">● listening… {dict.interim && <span className="text-slate-600">“{dict.interim}”</span>}</div>}
        {dict.error && <div className="text-[12px] text-red-600">{dict.error}</div>}
        {reader.error && <div className="text-[12px] text-red-600">{reader.error}</div>}
      </div>
      <div className="px-2 pt-1.5 flex gap-1.5 overflow-x-auto bg-white border-t">
        {SUGGEST[track].map(s => <button key={s} onClick={() => void send(s, 'text', track)} disabled={busy} className="shrink-0 text-[11px] px-2 py-1 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50">{s.length > 34 ? s.slice(0, 32) + '…' : s}</button>)}
      </div>
      <form className="flex items-center gap-1.5 p-2 bg-white" onSubmit={e => { e.preventDefault(); const t = text; setText(''); void send(t, 'text', track); }}>
        <button type="button" onClick={toggleMic} disabled={!dict.supported} aria-label={listening ? 'Stop listening' : 'Start voice input'} title={dict.supported ? (listening ? 'Stop listening' : 'Speak to FRIDAY') : 'Voice input is not supported in this browser (use Chrome or Edge)'} className={`p-2 rounded-full border ${listening ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-700 border-slate-300'} disabled:opacity-40`}>{listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}</button>
        <input data-testid={`${prefix}-input`} value={text} onChange={e => setText(e.target.value)} placeholder={track === 'research' ? 'Ask a study question…' : 'Tell FRIDAY what to do…'} className="flex-1 min-w-0 px-3 py-2 rounded-full border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
        <button data-testid={`${prefix}-send`} type="submit" disabled={busy || !text.trim()} aria-label="Send" className="p-2 rounded-full bg-amber-600 text-white disabled:opacity-40"><Send className="w-4 h-4" /></button>
      </form>
    </div>
  );
}
