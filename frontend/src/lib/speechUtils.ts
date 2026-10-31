/* ------------------------------------------------------------------ */
/*  Speech: text-to-speech engine, speech-to-text controller.          */
/*  Everything here is browser Web Speech API. Nothing is sent to our  */
/*  own servers; the browser/OS may use its own speech service.        */
/* ------------------------------------------------------------------ */

import { convertLatexToSpokenWords, toSpeakableText } from './latexSpeech';

export { convertLatexToSpokenWords, toSpeakableText };

/* ============================ helpers ============================== */

/** Split prose into sentence-sized pieces (keeps $...$ math whole). */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n+/)) {
    const p = para.trim();
    if (!p) continue;
    // protect math and abbreviations while splitting
    const protectedText = p
      .replace(/\$[^$]*\$/g, m => m.replace(/\./g, '\u0001'))
      .replace(/\b(e\.g|i\.e|etc|vs|Fig|Eq|Dr|Mr|Mrs|approx)\./g, m => m.replace(/\./g, '\u0001'))
      .replace(/(\d)\.(\d)/g, '$1\u0001$2');
    const parts = protectedText.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [protectedText];
    for (const part of parts) {
      const s = part.replace(/\u0001/g, '.').trim();
      if (s) out.push(s);
    }
  }
  return out;
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

/* ======================= text-to-speech engine ===================== */

export interface SpeechSegment { id: string; text: string }
export type TtsState = 'idle' | 'playing' | 'paused';

export interface TtsCallbacks {
  onState?: (s: TtsState) => void;
  /** Called when a segment starts (index into the loaded list). */
  onSegment?: (index: number, seg: SpeechSegment) => void;
  /** Word-level progress inside the current segment (char index into the *spoken* text). */
  onProgress?: (index: number, charIndex: number, spokenLength: number) => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

/**
 * Reads a list of segments one at a time. Every play/seek/stop bumps a session
 * number, so a late "end" event from a cancelled utterance can never start the
 * next one: there is never more than one voice speaking.
 */
export class SpeechEngine {
  private synth: SpeechSynthesis | null = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  private segs: SpeechSegment[] = [];
  private idx = 0;
  private session = 0;
  private state: TtsState = 'idle';
  private cb: TtsCallbacks;
  voiceName = '';
  lang = '';
  rate = 1;
  pitch = 1;
  volume = 1;

  constructor(cb: TtsCallbacks = {}) {
    this.cb = cb;
  }

  get supported() { return !!this.synth; }
  get current() { return this.idx; }
  get count() { return this.segs.length; }
  get status() { return this.state; }

  setCallbacks(cb: TtsCallbacks) { this.cb = cb; }

  getVoices(): SpeechSynthesisVoice[] { return this.synth ? this.synth.getVoices() : []; }

  /** Replace the list being read (stops anything that is speaking). */
  load(segments: SpeechSegment[]) {
    this.hardStop();
    this.segs = segments;
    this.idx = 0;
  }

  private setState(s: TtsState) { if (this.state !== s) { this.state = s; this.cb.onState?.(s); } }

  private pickVoice(): SpeechSynthesisVoice | null {
    const voices = this.getVoices();
    if (!voices.length) return null;
    if (this.voiceName) { const v = voices.find(x => x.name === this.voiceName); if (v) return v; }
    if (this.lang) {
      const l = this.lang.toLowerCase();
      const v = voices.find(x => x.lang.toLowerCase() === l) ?? voices.find(x => x.lang.toLowerCase().startsWith(l.split('-')[0]));
      if (v) return v;
    }
    return null;
  }

  /** Start reading at a given segment. */
  play(startIndex = this.idx) {
    if (!this.synth) { this.cb.onError?.('Text-to-speech is not supported in this browser.'); return; }
    if (!this.segs.length) return;
    this.idx = Math.max(0, Math.min(this.segs.length - 1, startIndex));
    this.session++;
    this.synth.cancel();
    this.speakCurrent(this.session);
  }

  /** Read one piece of text on its own (e.g. a clicked sentence). */
  speakOne(seg: SpeechSegment) {
    this.load([seg]);
    this.play(0);
  }

  private speakCurrent(session: number) {
    if (!this.synth || session !== this.session) return;
    const seg = this.segs[this.idx];
    if (!seg) { this.setState('idle'); this.cb.onEnd?.(); return; }
    const spoken = toSpeakableText(seg.text) || ' ';
    const u = new SpeechSynthesisUtterance(spoken);
    const voice = this.pickVoice();
    if (voice) { u.voice = voice; u.lang = voice.lang; } else if (this.lang) u.lang = this.lang;
    u.rate = this.rate; u.pitch = this.pitch; u.volume = this.volume;
    const myIndex = this.idx;
    u.onstart = () => { if (session !== this.session) return; this.setState('playing'); this.cb.onSegment?.(myIndex, seg); };
    u.onboundary = e => { if (session === this.session) this.cb.onProgress?.(myIndex, e.charIndex, spoken.length); };
    u.onend = () => {
      if (session !== this.session) return;
      if (this.idx + 1 < this.segs.length) { this.idx++; this.speakCurrent(session); }
      else { this.setState('idle'); this.cb.onEnd?.(); }
    };
    u.onerror = e => {
      if (session !== this.session) return;
      const err = (e as SpeechSynthesisErrorEvent).error;
      if (err === 'canceled' || err === 'interrupted') return;
      this.setState('idle');
      this.cb.onError?.(err === 'not-allowed' ? 'The browser blocked audio. Click Play again.' : `Speech failed (${err ?? 'unknown'}).`);
    };
    this.setState('playing');
    this.cb.onSegment?.(myIndex, seg);
    this.synth.speak(u);
  }

  pause() { if (this.synth && this.state === 'playing') { this.synth.pause(); this.setState('paused'); } }
  resume() { if (this.synth && this.state === 'paused') { this.synth.resume(); this.setState('playing'); } }
  toggle() { if (this.state === 'playing') this.pause(); else if (this.state === 'paused') this.resume(); else this.play(this.idx); }

  stop() { this.hardStop(); this.idx = 0; }
  private hardStop() { this.session++; if (this.synth) this.synth.cancel(); this.setState('idle'); }

  next() { if (this.idx + 1 < this.segs.length) this.play(this.idx + 1); }
  prev() { this.play(Math.max(0, this.idx - 1)); }
  replay() { this.play(this.idx); }

  /** Changing rate/voice mid-sentence restarts that sentence so the change is heard at once. */
  setRate(r: number) { this.rate = Math.max(0.5, Math.min(2, r)); this.restartIfActive(); }
  setPitch(p: number) { this.pitch = Math.max(0.5, Math.min(1.8, p)); this.restartIfActive(); }
  setVoice(name: string) { this.voiceName = name; this.restartIfActive(); }
  setLang(l: string) { this.lang = l; if (!this.voiceName || !this.getVoices().find(v => v.name === this.voiceName && v.lang.toLowerCase().startsWith(l.split('-')[0].toLowerCase()))) this.voiceName = ''; this.restartIfActive(); }
  setVolume(v: number) { this.volume = Math.max(0, Math.min(1, v)); }
  private restartIfActive() { if (this.state === 'playing') this.play(this.idx); }
  destroy() { this.hardStop(); }
}

/* ======================= speech-to-text controller ================= */

type RecCtor = new () => SpeechRecognitionLike;
interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onstart: (() => void) | null; onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onresult: ((e: RecResultEvent) => void) | null;
  start(): void; stop(): void; abort(): void;
}
interface RecResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }>;
}

function recCtor(): RecCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean { return recCtor() !== null; }

export type SttState = 'idle' | 'starting' | 'listening' | 'paused';

export interface SttCallbacks {
  onState?: (s: SttState) => void;
  /** Words still being recognised; replace, don't append. */
  onInterim?: (text: string) => void;
  /** A finished phrase (with the engine's alternatives, best first). */
  onFinal?: (text: string, alternatives: string[]) => void;
  onError?: (message: string, code: string) => void;
}

const STT_ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone permission was denied. Allow the microphone in the browser address bar, or type instead.',
  'service-not-allowed': 'Speech recognition is blocked for this page. You can type instead.',
  'no-speech': 'No speech was heard. Try again, closer to the microphone.',
  'audio-capture': 'No microphone was found.',
  network: 'Speech recognition could not reach its speech service. Chrome and Edge include one; Opera, Brave and Firefox do not. Open this app in Chrome or Edge, or type instead.',
  'language-not-supported': 'That language is not supported for dictation here.',
  aborted: '',
};

/**
 * Dictation. It never touches the microphone until start() is called from a click.
 * Pause = stop listening but keep the session; resume = start again.
 */
export class SpeechToTextController {
  private rec: SpeechRecognitionLike | null = null;
  private state: SttState = 'idle';
  private wantOn = false;
  private pendingInterim = ''; // last partial phrase; delivered as final if the browser ends without finalising it
  private quickEnds = 0; private startedAt = 0;
  private cb: SttCallbacks;
  lang = 'en-US';
  continuous = true;

  constructor(cb: SttCallbacks = {}) { this.cb = cb; }
  get supported() { return isSpeechRecognitionSupported(); }
  get status() { return this.state; }
  setCallbacks(cb: SttCallbacks) { this.cb = cb; }
  private setState(s: SttState) { if (this.state !== s) { this.state = s; this.cb.onState?.(s); } }

  start() {
    const C = recCtor();
    if (!C) { this.cb.onError?.('Speech-to-text is not supported in this browser (try Chrome or Edge). You can type instead.', 'unsupported'); return; }
    if (this.state === 'listening' || this.state === 'starting') return;
    this.wantOn = true;
    this.setState('starting');
    const rec = new C();
    rec.lang = this.lang; rec.continuous = this.continuous; rec.interimResults = true; rec.maxAlternatives = 3;
    rec.onstart = () => { this.startedAt = Date.now(); this.setState('listening'); };
    rec.onresult = e => {
      let interim = ''; let gotFinal = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const alts: string[] = [];
          for (let a = 0; a < r.length; a++) alts.push(r[a].transcript.trim());
          gotFinal = true; this.quickEnds = 0; this.cb.onFinal?.(alts[0] ?? '', alts);
        } else interim += r[0].transcript;
      }
      this.pendingInterim = interim.trim() ? interim.trim() : (gotFinal ? '' : this.pendingInterim);
      this.cb.onInterim?.(interim);
    };
    rec.onerror = e => {
      const msg = STT_ERRORS[e.error] ?? `Speech recognition error (${e.error}).`;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture' || e.error === 'language-not-supported' || e.error === 'network') this.wantOn = false;
      if (msg) this.cb.onError?.(msg, e.error);
    };
    rec.onend = () => {
      this.cb.onInterim?.('');
      // The browser ended the session while a phrase was still partial (always happens on a manual stop): keep what was heard.
      if (this.pendingInterim) { const t = this.pendingInterim; this.pendingInterim = ''; this.quickEnds = 0; this.cb.onFinal?.(t, [t]); }
      // Sessions that keep ending at once without hearing anything mean recognition does not work here; stop instead of showing "listening" forever.
      if (this.wantOn && Date.now() - this.startedAt < 1500) { this.quickEnds++; if (this.quickEnds >= 3) { this.wantOn = false; this.quickEnds = 0; this.cb.onError?.('The microphone session keeps closing without hearing anything. Check the microphone permission and the input device, and use Chrome or Edge for speech recognition.', 'no-audio'); } } else if (this.wantOn) this.quickEnds = 0;
      // Browsers end continuous sessions on their own after silence; restart while the user still wants dictation.
      if (this.wantOn && this.state !== 'paused') { try { rec.start(); return; } catch { /* fall through */ } }
      this.rec = null;
      this.setState(this.state === 'paused' ? 'paused' : 'idle');
    };
    this.rec = rec;
    try { rec.start(); } catch { this.setState('idle'); this.cb.onError?.('Could not start the microphone.', 'start-failed'); }
  }

  pause() { if (this.state === 'listening') { this.setState('paused'); this.wantOn = false; try { this.rec?.stop(); } catch { /* ignore */ } } }
  resume() { if (this.state === 'paused') { this.rec = null; this.state = 'idle'; this.start(); } }
  /** Stop; a phrase that was still being processed is still delivered. */
  stop() { this.wantOn = false; try { this.rec?.stop(); } catch { /* ignore */ } if (!this.rec) this.setState('idle'); else setTimeout(() => { if (this.rec && !this.wantOn) { /* the browser never fired onend */ const t = this.pendingInterim; this.pendingInterim = ''; try { this.rec?.abort(); } catch { /* ignore */ } this.rec = null; this.cb.onInterim?.(''); this.setState('idle'); if (t) this.cb.onFinal?.(t, [t]); } }, 2500); }
  /** Stop and throw away anything not yet delivered. */
  cancel() { this.wantOn = false; this.pendingInterim = ''; try { this.rec?.abort(); } catch { /* ignore */ } this.rec = null; this.cb.onInterim?.(''); this.setState('idle'); }
}

/* ===== Backwards-compatible narration controller (DerivationViewer) ===== */

export class VoiceNarrationController {
  private engine: SpeechEngine;
  private onPlayStateChange?: (isPlaying: boolean, isPaused: boolean) => void;
  private onProgress?: (charIndex: number, textLength: number) => void;
  private done?: () => void;

  constructor(
    onPlayStateChange?: (isPlaying: boolean, isPaused: boolean) => void,
    onProgress?: (charIndex: number, textLength: number) => void,
  ) {
    this.onPlayStateChange = onPlayStateChange;
    this.onProgress = onProgress;
    this.engine = new SpeechEngine({
      onState: s => this.onPlayStateChange?.(s !== 'idle', s === 'paused'),
      onProgress: (_i, c, n) => this.onProgress?.(c, n),
      onEnd: () => { const d = this.done; this.done = undefined; d?.(); },
    });
  }

  getVoices(): SpeechSynthesisVoice[] { return this.engine.getVoices(); }
  setVoice(name: string) { this.engine.setVoice(name); }
  setRate(r: number) { this.engine.setRate(r); }
  setPitch(p: number) { this.engine.pitch = Math.max(0.5, Math.min(1.5, p)); }

  speak(rawText: string, onEnd?: () => void) {
    this.done = onEnd;
    const segs = splitSentences(rawText).map((text, i) => ({ id: String(i), text }));
    this.engine.load(segs.length ? segs : [{ id: '0', text: rawText }]);
    this.engine.play(0);
  }
  pause() { this.engine.pause(); }
  resume() { this.engine.resume(); }
  stop() { this.engine.stop(); }
}
