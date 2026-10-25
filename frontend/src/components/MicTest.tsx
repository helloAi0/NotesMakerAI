import { useRef, useState } from 'react';
import { Mic } from 'lucide-react';

/** Lets the person verify on THEIR device that the microphone works before dictating. */
export default function MicTest() {
  const [state, setState] = useState<'idle' | 'asking' | 'live' | 'ok' | 'quiet' | 'error'>('idle');
  const [level, setLevel] = useState(0);
  const [msg, setMsg] = useState('');
  const stopRef = useRef<() => void>(() => {});

  const run = async () => {
    setMsg('');
    if (!window.isSecureContext) { setState('error'); setMsg('The microphone only works on https:// or http://localhost. Open the app from localhost or an HTTPS address.'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setState('error'); setMsg('This browser cannot access a microphone.'); return; }
    setState('asking');
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) {
      const n = (e as DOMException).name; setState('error');
      setMsg(n === 'NotAllowedError' || n === 'SecurityError' ? 'Microphone permission was denied. Click the lock icon in the address bar and allow the microphone, then try again.'
        : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'No microphone was found. Plug one in or check your system sound settings.'
        : n === 'NotReadableError' ? 'The microphone is busy or blocked by another app. Close other apps using it and retry.' : `Could not open the microphone (${n}).`);
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC(); const an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize); let peak = 0; let raf = 0; const t0 = performance.now(); setState('live');
    const stop = (final: boolean) => { cancelAnimationFrame(raf); stream.getTracks().forEach(t => t.stop()); void ctx.close(); if (final) { setLevel(0); setState(peak > 0.05 ? 'ok' : 'quiet'); } };
    stopRef.current = () => stop(false);
    const tick = () => { an.getByteTimeDomainData(buf); let m = 0; for (const b of buf) m = Math.max(m, Math.abs(b - 128) / 128); peak = Math.max(peak, m); setLevel(m);
      if (performance.now() - t0 > 4000) stop(true); else raf = requestAnimationFrame(tick); };
    tick();
  };

  return (
    <div className="flex flex-col gap-1">
      <button onClick={run} disabled={state === 'asking' || state === 'live'} className="px-2 py-1.5 rounded bg-slate-100 border border-slate-300 font-semibold flex items-center gap-1 w-fit disabled:opacity-60"><Mic className="w-3.5 h-3.5" /> Test microphone</button>
      {state === 'live' && (<div className="w-40"><div className="h-2 rounded bg-slate-200 overflow-hidden"><div className="h-2 bg-emerald-500" style={{ width: `${Math.min(100, level * 250)}%` }} /></div><span className="text-[11px] text-slate-600">Speak now… (4 s)</span></div>)}
      {state === 'ok' && <span className="text-[11px] text-emerald-700">Microphone works: sound detected.</span>}
      {state === 'quiet' && <span className="text-[11px] text-amber-700 max-w-[240px]">The microphone opened but heard almost nothing. Check it is not muted and the right input device is selected.</span>}
      {state === 'error' && <span className="text-[11px] text-red-600 max-w-[260px]">{msg}</span>}
    </div>
  );
}
