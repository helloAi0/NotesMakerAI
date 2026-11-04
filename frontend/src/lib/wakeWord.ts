/**
 * “Hey Friday” wake word. Uses the browser's SpeechRecognition (Chrome/Edge) in continuous mode, so it only listens while this page is open and
 * the toggle is on. In Chrome/Edge that recogniser streams audio to the browser vendor's speech service; it is not an on-device keyword spotter.
 */
export const WAKE_RE = /\b(?:hey|hi|hello|ok|okay|yo|a)\s*[,.]?\s*(?:friday|fry day|fri day|friyay|fridays)\b[\s,.:;!?-]*/i;
/** Returns the words spoken after the wake phrase ('' when only the wake phrase was said), or null when there is no wake phrase. */
export function matchWake(transcript: string): string | null { const m = transcript.match(WAKE_RE); return m ? transcript.slice((m.index ?? 0) + m[0].length).trim() : null; }
interface Rec { lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: unknown) => void) | null; onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null; start(): void; stop(): void; abort(): void }
type RecCtor = new () => Rec;
export const wakeSupported = () => typeof window !== 'undefined' && !!((window as unknown as { SpeechRecognition?: RecCtor }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: RecCtor }).webkitSpeechRecognition);
export class WakeListener {
  private rec: Rec | null = null; private on = false; private handled = -1; private restartAt = 0;
  onWake: (rest: string) => void = () => undefined; onState: (s: 'off' | 'listening' | 'error', msg?: string) => void = () => undefined;
  get running() { return this.on; }
  start(lang = 'en-US') {
    if (this.on) return; const C = ((window as unknown as { SpeechRecognition?: RecCtor }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: RecCtor }).webkitSpeechRecognition); if (!C) { this.onState('error', 'Wake word needs Chrome or Edge.'); return; }
    this.on = true; const make = () => {
      const r = new C(); r.lang = lang; r.continuous = true; r.interimResults = true; this.rec = r; this.handled = -1;
      r.onresult = (e: unknown) => { const ev = e as { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }; for (let i = ev.resultIndex; i < ev.results.length; i++) { const res = ev.results[i]; const t = res[0].transcript; const rest = matchWake(t); if (rest === null) continue; if (res.isFinal || rest.split(/\s+/).filter(Boolean).length >= 3 || rest === '') { if (this.handled === i) continue; if (!res.isFinal && rest === '') { continue; } this.handled = i; this.onWake(rest); } } };
      r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.on = false; this.onState('error', 'Microphone permission is blocked, so the wake word cannot listen.'); } };
      r.onend = () => { if (!this.on) { this.onState('off'); return; } const wait = Math.max(0, 400 - (Date.now() - this.restartAt)); this.restartAt = Date.now(); setTimeout(() => { if (this.on) { try { make(); } catch { /* retry on next end */ } } }, wait); };
      try { r.start(); this.onState('listening'); } catch (e) { this.on = false; this.onState('error', (e as Error).message); }
    }; this.restartAt = Date.now(); make();
  }
  stop() { this.on = false; try { this.rec?.abort(); } catch { /* already stopped */ } this.rec = null; this.onState('off'); }
}
