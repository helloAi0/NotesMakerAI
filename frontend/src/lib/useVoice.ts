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
  const [pitch, setPitchState] = useState(1);
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
    supported: eng.supported, state, index, segId, count, error, voices, rate, pitch, voiceName, lang,
    onSegment: (f: (id: string) => void) => { segIdCb.current = f; },
    playFrom,
    pause: () => eng.pause(), resume: () => eng.resume(), stop: () => { eng.stop(); setIndex(-1); setSegId(''); },
    next: () => eng.next(), prev: () => eng.prev(), replay: () => eng.replay(),
    setRate: (r: number) => { setRateState(r); eng.setRate(r); },
    setPitch: (p: number) => { setPitchState(p); eng.setPitch(p); },
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
  { code: 'hi-IN', label: 'Hindi' }, { code: 'ar-SA', label: 'Arabic' }, { code: 'gu-IN', label: 'Gujarati' }, { code: 'mr-IN', label: 'Marathi' },
  { code: 'ta-IN', label: 'Tamil' }, { code: 'te-IN', label: 'Telugu' }, { code: 'bn-IN', label: 'Bengali' },
  { code: 'es-ES', label: 'Spanish' }, { code: 'fr-FR', label: 'French' }, { code: 'de-DE', label: 'German' },
];

/** Spoken formatting for note dictation: punctuation, line breaks, headings, bullets, numbered lists, bold/italic, brackets, symbols. */
export function applyVoiceCommands(text: string, prevChar: string): string {
  let t = ' ' + text.trim() + ' ';
  const R = (re: RegExp, to: string | ((...a: string[]) => string)) => { t = t.replace(re, to as string); };
  // structure
  R(/\s+\b(?:new paragraph|next paragraph)\b\s*/gi, '\n\n'); R(/\s+\b(?:new line|next line|line break)\b\s*/gi, '\n');
  R(/\s+\b(?:main heading|heading one|heading|title)\b[:,]?\s+([^\n.]+?)(?=\s+\b(?:new line|new paragraph|end heading)\b|\s*$|[.\n])/gi, '\n\n# $1\n');
  R(/\s+\b(?:sub ?heading|heading two|section)\b[:,]?\s+([^\n.]+?)(?=\s+\b(?:new line|new paragraph|end heading)\b|\s*$|[.\n])/gi, '\n\n## $1\n');
  R(/\s+\bend heading\b\s*/gi, '\n');
  R(/\s+\b(?:bullet(?: point)?|next bullet|bullet next)\b[:,]?\s*/gi, '\n- ');
  R(/\s+\b(?:number (one|two|three|four|five|six|seven|eight|nine|ten)|next number)\b[:,]?\s*/gi, (_m: string, w?: string) => '\n' + (w ? ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 } as Record<string, number>)[w.toLowerCase()] : '•') + '. ');
  R(/\s+\b(?:block quote|quote block)\b[:,]?\s*/gi, '\n> ');
  R(/\s+\b(?:horizontal rule|divider)\b\s*/gi, '\n\n---\n\n');
  // inline emphasis: "bold X end bold", "italic X end italic"
  R(/\s+\bbold\b\s+(.+?)\s+\b(?:end bold|stop bold|unbold)\b/gi, ' **$1**'); R(/\s+\bitalic\b\s+(.+?)\s+\b(?:end italic|stop italic)\b/gi, ' *$1*');
  R(/\s+\b(?:code|inline code)\b\s+(.+?)\s+\bend code\b/gi, ' `$1`');
  // punctuation & symbols
  R(/\s*\b(?:full stop|period)\b/gi, '.'); R(/\s*\bcomma\b/gi, ','); R(/\s*\bquestion mark\b/gi, '?'); R(/\s*\bexclamation (?:mark|point)\b/gi, '!');
  R(/\s*\bcolon\b/gi, ':'); R(/\s*\bsemi ?colon\b/gi, ';'); R(/\s+\b(?:open (?:bracket|parenthesis|paren))\b\s*/gi, ' ('); R(/\s*\b(?:close (?:bracket|parenthesis|paren))\b/gi, ')');
  R(/\s+\bopen (?:quote|quotes)\b\s*/gi, ' "'); R(/\s*\bclose (?:quote|quotes)\b/gi, '"'); R(/\s+\b(?:hyphen|dash)\b\s+/gi, '-'); R(/\s+\bslash\b\s+/gi, '/');
  R(/\s+\bpercent(?: sign)?\b/gi, '%'); R(/\s+\bequal sign\b\s+/gi, ' = '); R(/\s+\bplus sign\b\s*/gi, ' + ');
  R(/ *\n */g, '\n'); R(/\n{3,}/g, '\n\n'); R(/[ ]{2,}/g, ' ');
  t = t.trim();
  if (!prevChar || /[.!?\n]/.test(prevChar)) t = t.charAt(0).toUpperCase() + t.slice(1);
  t = t.replace(/([.!?]\s+|\n(?:[-#>]+ |\d+\. )?)([a-z])/g, (_m, a, b) => a + b.toUpperCase());
  const lead = prevChar && !/\s/.test(prevChar) && !/^[\n.,!?;:)]/.test(t) ? ' ' : '';
  return lead + t;
}
