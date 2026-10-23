import { useCallback, useEffect, useRef, useState } from 'react';
import { SpeechEngine, SpeechToTextController, type SpeechSegment, type SttState, type TtsState } from './speechUtils';

/** Text-to-speech state for a component. One engine per component, cleaned up on unmount. */
export function useReader() {
  const [state, setState] = useState<TtsState>('idle');
  const [index, setIndex] = useState(-1);
  const [segId, setSegId] = useState('');
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [rate, setRateState] = useState(1);
  const [voiceName, setVoiceName] = useState('');
  const [lang, setLangState] = useState('');
  const segIdCb = useRef<((id: string) => void) | null>(null);
  const engRef = useRef<SpeechEngine | null>(null);
  if (!engRef.current) engRef.current = new SpeechEngine();
  const eng = engRef.current;

  useEffect(() => {
    eng.setCallbacks({
      onState: setState,
      onSegment: (i, s) => { setIndex(i); setSegId(s.id); segIdCb.current?.(s.id); },
      onEnd: () => { setIndex(-1); setSegId(''); },
      onError: setError,
    });
    const load = () => setVoices(eng.getVoices());
    load();
    if (eng.supported) window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => { if (eng.supported) window.speechSynthesis.removeEventListener('voiceschanged', load); eng.destroy(); };
  }, [eng]);

  const playFrom = useCallback((segs: SpeechSegment[], i = 0) => { setError(''); setCount(segs.length); eng.load(segs); eng.play(i); }, [eng]);
  return {
    supported: eng.supported, state, index, segId, count, error, voices, rate, voiceName, lang,
    onSegment: (f: (id: string) => void) => { segIdCb.current = f; },
    playFrom,
    pause: () => eng.pause(), resume: () => eng.resume(), stop: () => { eng.stop(); setIndex(-1); setSegId(''); },
    next: () => eng.next(), prev: () => eng.prev(), replay: () => eng.replay(),
    setRate: (r: number) => { setRateState(r); eng.setRate(r); },
    setVoice: (n: string) => { setVoiceName(n); eng.setVoice(n); },
    setLang: (l: string) => { setLangState(l); eng.setLang(l); },
    clearError: () => setError(''),
  };
}

/** Dictation. The microphone is only opened when start() is called from a click. */
export function useDictation(onFinal: (text: string, alternatives: string[]) => void) {
  const [state, setState] = useState<SttState>('idle');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const [lang, setLangState] = useState('en-US');
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;
  const ctl = useRef<SpeechToTextController | null>(null);
  if (!ctl.current) ctl.current = new SpeechToTextController();
  const c = ctl.current;
  useEffect(() => {
    c.setCallbacks({ onState: setState, onInterim: setInterim, onFinal: (t, a) => finalRef.current(t, a), onError: m => setError(m) });
    return () => c.cancel();
  }, [c]);
  return {
    supported: c.supported, state, interim, error, lang,
    start: () => { setError(''); c.lang = lang; c.start(); },
    pause: () => c.pause(), resume: () => c.resume(), stop: () => c.stop(), cancel: () => c.cancel(),
    setLang: (l: string) => { setLangState(l); c.lang = l; },
    clearError: () => setError(''),
  };
}

export const SPEECH_LANGS: { code: string; label: string }[] = [
  { code: 'en-US', label: 'English (US)' }, { code: 'en-GB', label: 'English (UK)' }, { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'Hindi' }, { code: 'gu-IN', label: 'Gujarati' }, { code: 'mr-IN', label: 'Marathi' },
  { code: 'ta-IN', label: 'Tamil' }, { code: 'te-IN', label: 'Telugu' }, { code: 'bn-IN', label: 'Bengali' },
  { code: 'es-ES', label: 'Spanish' }, { code: 'fr-FR', label: 'French' }, { code: 'de-DE', label: 'German' },
];

/** Spoken punctuation / layout commands for note dictation. */
export function applyVoiceCommands(text: string, prevChar: string): string {
  let t = text.trim();
  t = t.replace(/\b(new paragraph)\b/gi, '\n\n').replace(/\b(new line|next line)\b/gi, '\n');
  t = t.replace(/\s*\b(full stop|period)\b/gi, '.').replace(/\s*\bcomma\b/gi, ',').replace(/\s*\bquestion mark\b/gi, '?')
    .replace(/\s*\bexclamation (mark|point)\b/gi, '!').replace(/\s*\bcolon\b/gi, ':').replace(/\s*\bsemicolon\b/gi, ';');
  t = t.replace(/ *\n */g, '\n');
  if (!prevChar || /[.!?\n]/.test(prevChar)) t = t.charAt(0).toUpperCase() + t.slice(1);
  const lead = prevChar && !/\s/.test(prevChar) && !/^[\n.,!?;:]/.test(t) ? ' ' : '';
  return lead + t;
}
