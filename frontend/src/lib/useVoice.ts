import { useCallback, useEffect, useRef, useState } from 'react';
import { SpeechEngine, SpeechToTextController, type SpeechSegment, type SttState, type TtsState } from './speechUtils';
import { CloudDictationController, canTranscribe } from './cloudDictation';
import { llmConfig } from './friday';

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

export type DictationMode = 'auto' | 'browser' | 'cloud';
const MODE_KEY = 'nm_dictation_engine';
export const getDictationMode = (): DictationMode => { try { const v = localStorage.getItem(MODE_KEY); return v === 'browser' || v === 'cloud' ? v : 'auto'; } catch { return 'auto'; } };
export const setDictationMode = (m: DictationMode) => { try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ } };
const FALLBACK_CODES = new Set(['network', 'service-not-allowed', 'no-sound', 'no-audio', 'unsupported', 'language-not-supported']);

/**
 * Dictation. The microphone is only opened when start() is called from a click.
 * Two engines: the browser's own speech recognition, or AI transcription with the user's key (works in every browser and
 * with the microphone chosen in "Test microphone"). In "auto" mode the second takes over when the first cannot hear anything.
 */
export function useDictation(onFinal: (text: string, alternatives: string[]) => void) {
  const [state, setState] = useState<SttState>('idle');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [signal, setSignal] = useState<'none' | 'audio' | 'sound' | 'speech'>('none');
  const [lang, setLangState] = useState('en-US');
  const [mode, setModeState] = useState<DictationMode>(getDictationMode());
  const [engine, setEngine] = useState<'browser' | 'cloud'>('browser');
  const finalRef = useRef(onFinal); finalRef.current = onFinal;
  const modeRef = useRef(mode); modeRef.current = mode; const langRef = useRef(lang); langRef.current = lang;
  const ctl = useRef<SpeechToTextController | null>(null); const cloud = useRef<CloudDictationController | null>(null);
  if (!ctl.current) ctl.current = new SpeechToTextController();
  if (!cloud.current) cloud.current = new CloudDictationController(() => llmConfig());
  const c = ctl.current, cc = cloud.current; const active = useRef<'browser' | 'cloud'>('browser');
  const cloudOk = () => canTranscribe(llmConfig()).ok;
  useEffect(() => {
    const common = { onState: (s: SttState) => { setState(s); if (s === 'idle') setSignal('none'); }, onSignal: setSignal, onInterim: setInterim, onFinal: (t: string, a: string[]) => finalRef.current(t, a) };
    cc.setCallbacks({ ...common, onError: m => setError(m) });
    c.setCallbacks({ ...common, onError: (m, code) => {
      if (modeRef.current === 'auto' && FALLBACK_CODES.has(code ?? '') && cloudOk()) { c.cancel(); active.current = 'cloud'; setEngine('cloud'); setNotice('Browser dictation could not hear you, so FRIDAY switched to AI transcription with your key.'); cc.lang = langRef.current; void cc.start(); return; }
      setError(m + (cloudOk() ? '' : ' Tip: add a Gemini or OpenAI key in Settings to use AI transcription instead.')); } });
    return () => { c.cancel(); cc.cancel(); };
  }, [c, cc]);
  const cur = () => (active.current === 'cloud' ? cc : c);
  return {
    supported: c.supported || cc.supported, state, interim, error, notice, lang, signal, mode, engine,
    start: () => {
      setError(''); setNotice(''); const m = modeRef.current;
      let chosen = ''; try { chosen = localStorage.getItem('nm_mic_device') || ''; } catch { /* ignore */ }
      const useCloud = m === 'cloud' || (m === 'auto' && cloudOk() && (!c.supported || !!chosen)); // the browser recogniser can only use the Windows default microphone
      if (m === 'auto' && chosen && !cloudOk()) setNotice('You chose a specific microphone, but browser dictation can only use the Windows default one. Add a Gemini or OpenAI key in Settings to dictate with the chosen microphone.');
      active.current = useCloud ? 'cloud' : 'browser'; setEngine(active.current);
      if (useCloud) { cc.lang = lang; void cc.start(); } else { c.lang = lang; c.start(); }
    },
    pause: () => cur().pause(), resume: () => cur().resume(), stop: () => cur().stop(), cancel: () => { c.cancel(); cc.cancel(); },
    setLang: (l: string) => { setLangState(l); c.lang = l; cc.lang = l; },
    setMode: (m: DictationMode) => { setDictationMode(m); setModeState(m); },
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
