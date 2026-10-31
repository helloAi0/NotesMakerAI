import { useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';

/** Lets the person verify on THEIR device that the microphone works before dictating. */
export default function MicTest() {
  const [state, setState] = useState<'idle' | 'asking' | 'live' | 'ok' | 'quiet' | 'error'>('idle');
  const [level, setLevel] = useState(0);
  const [msg, setMsg] = useState('');
  const stopRef = useRef<() => void>(() => {});
  const [scan, setScan] = useState<{ id: string; label: string; peak: number }[] | null>(null); const [scanMsg, setScanMsg] = useState(''); const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<{ id: string; label: string }[]>([]); const [dev, setDev] = useState(() => { try { return localStorage.getItem('nm_mic_device') || ''; } catch { return ''; } }); const [used, setUsed] = useState(''); const [defLabel, setDefLabel] = useState('');
  const refreshDevices = async () => { try { const all = await navigator.mediaDevices.enumerateDevices(); setDevices(all.filter(d => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications').map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }))); setDefLabel(all.find(d => d.kind === 'audioinput' && d.deviceId === 'default')?.label.replace(/^Default - /, '') ?? ''); } catch { /* ignore */ } };

  /** Opens EVERY microphone at once for 5 s and picks the one that actually hears you (the Windows default is often a virtual mic such as DroidCam). */
  const findBest = async () => {
    setScanMsg(''); setScanning(true);
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true }); probe.getTracks().forEach(t => t.stop()); // permission, so labels are visible
      const all = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; const ctx = new AC(); await ctx.resume();
      const rows: { id: string; label: string; peak: number; an?: AnalyserNode; stream?: MediaStream }[] = [];
      for (const d of all) { const row: (typeof rows)[number] = { id: d.deviceId, label: d.label || 'Microphone', peak: 0 }; try { const st = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: d.deviceId } } }); const an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(st).connect(an); row.an = an; row.stream = st; } catch { row.peak = -1; } rows.push(row); }
      setScan(rows.map(r => ({ id: r.id, label: r.label, peak: r.peak }))); const buf = new Uint8Array(512); const t0 = performance.now();
      await new Promise<void>(res => { const tick = () => { for (const r of rows) if (r.an) { r.an.getByteTimeDomainData(buf); let m = 0; for (const b of buf) m = Math.max(m, Math.abs(b - 128) / 128); r.peak = Math.max(r.peak, m); } setScan(rows.map(r => ({ id: r.id, label: r.label, peak: r.peak }))); if (performance.now() - t0 > 5000) res(); else requestAnimationFrame(tick); }; tick(); });
      rows.forEach(r => r.stream?.getTracks().forEach(t => t.stop())); void ctx.close();
      const best = [...rows].sort((a, b) => b.peak - a.peak)[0];
      if (!best || best.peak < 0.05) setScanMsg('None of your microphones picked up sound. Speak while the bars run, move closer, and make sure the headset is not muted (check its own mute button).');
      else { setDev(best.id); try { localStorage.setItem('nm_mic_device', best.id); } catch { /* ignore */ } setScanMsg(`Found it: “${best.label}”. Dictation now uses this microphone with AI transcription.`); window.dispatchEvent(new Event('nm:mic-chosen')); }
      void refreshDevices();
    } catch (e) { setScanMsg(`Could not scan microphones (${(e as DOMException).name || (e as Error).message}). Allow the microphone in the address bar.`); }
    finally { setScanning(false); }
  };

  useEffect(() => { if (typeof navigator !== 'undefined' && navigator.mediaDevices) queueMicrotask(() => { void refreshDevices(); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async () => {
    setMsg('');
    if (!window.isSecureContext) { setState('error'); setMsg('The microphone only works on https:// or http://localhost. Open the app from localhost or an HTTPS address.'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setState('error'); setMsg('This browser cannot access a microphone.'); return; }
    setState('asking');
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: dev ? { deviceId: { exact: dev } } : true }); setUsed(stream.getAudioTracks()[0]?.label ?? ''); void refreshDevices(); } catch (e) {
      const n = (e as DOMException).name; setState('error');
      setMsg(n === 'NotAllowedError' || n === 'SecurityError' ? 'Microphone permission was denied. Click the lock icon in the address bar and allow the microphone, then try again.'
        : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'No microphone was found. Plug one in or check your system sound settings.'
        : n === 'NotReadableError' ? 'The microphone is busy or blocked by another app. Close other apps using it and retry.' : `Could not open the microphone (${n}).`);
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC(); void ctx.resume(); const an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize); let peak = 0; let raf = 0; const t0 = performance.now(); setState('live');
    const stop = (final: boolean) => { cancelAnimationFrame(raf); stream.getTracks().forEach(t => t.stop()); void ctx.close(); if (final) { setLevel(0); setState(peak > 0.05 ? 'ok' : 'quiet'); } };
    stopRef.current = () => stop(false);
    const tick = () => { an.getByteTimeDomainData(buf); let m = 0; for (const b of buf) m = Math.max(m, Math.abs(b - 128) / 128); peak = Math.max(peak, m); setLevel(m);
      if (performance.now() - t0 > 4000) stop(true); else raf = requestAnimationFrame(tick); };
    tick();
  };

  return (
    <div className="flex flex-col gap-1">
      {devices.length > 0 && <select value={dev} onChange={e => { setDev(e.target.value); try { if (e.target.value) localStorage.setItem('nm_mic_device', e.target.value); else localStorage.removeItem('nm_mic_device'); } catch { /* ignore */ } }} aria-label="Microphone to test" className="border rounded px-1.5 py-1 max-w-[250px] text-[11px]"><option value="">System default{defLabel ? ` (${defLabel})` : ''}</option>{devices.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select>}
      {/droidcam|virtual|obs|vb-?audio|cable|iriun|epoccam|snap|elgato wave link|stereo mix/i.test(defLabel) && <span className="text-[11px] text-amber-700 max-w-[250px]">Your Windows default microphone is “{defLabel}”, which is a virtual/phone microphone, not your headset. Press <b>Find my microphone</b>.</span>}
      <button onClick={() => void findBest()} disabled={scanning} data-testid="find-mic" className="px-2 py-1.5 rounded bg-amber-600 text-white font-semibold flex items-center gap-1 w-fit disabled:opacity-60"><Mic className="w-3.5 h-3.5" /> {scanning ? 'Speak now…' : 'Find my microphone'}</button>
      {scan && <div className="flex flex-col gap-0.5 max-w-[260px]" data-testid="mic-scan">{scan.map(r => <div key={r.id} className="text-[10px] text-slate-600"><div className="truncate">{r.label}{r.peak < 0 ? ' (unavailable)' : ''}</div><div className="h-1.5 rounded bg-slate-200 overflow-hidden"><div className="h-1.5 bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, r.peak * 250))}%` }} /></div></div>)}</div>}
      {scanMsg && <span className="text-[11px] text-slate-700 max-w-[260px]">{scanMsg}</span>}
      <button onClick={run} disabled={state === 'asking' || state === 'live'} className="px-2 py-1.5 rounded bg-slate-100 border border-slate-300 font-semibold flex items-center gap-1 w-fit disabled:opacity-60"><Mic className="w-3.5 h-3.5" /> Test microphone</button>
      {state === 'live' && (<div className="w-40"><div className="h-2 rounded bg-slate-200 overflow-hidden"><div className="h-2 bg-emerald-500" style={{ width: `${Math.min(100, level * 250)}%` }} /></div><span className="text-[11px] text-slate-600">Speak now… (4 s)</span></div>)}
      {state === 'ok' && <span className="text-[11px] text-emerald-700">Microphone works: sound detected.</span>}
      {(state === 'ok' || state === 'quiet') && used && <span className="text-[11px] text-slate-600 max-w-[250px]">Tested: {used}</span>}
      {state === 'quiet' && <span className="text-[11px] text-amber-700 max-w-[250px]">Almost no sound reached this device. Pick another microphone in the list above and test again. The one that shows sound must be set as the Windows default input (Settings → System → Sound → Input), because browser dictation always listens to the Windows default.</span>}
      {state === 'error' && <span className="text-[11px] text-red-600 max-w-[260px]">{msg}</span>}
    </div>
  );
}
