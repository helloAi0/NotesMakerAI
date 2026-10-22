// speechUtils.ts: Speech-to-Text, Math Dictation Parser, Equation-aware Text-to-Speech

export interface RecognitionState {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  interimTranscript: string;
  error?: string;
}

export type SpeechGrammarCandidate = {
  latex: string;
  label: string;
  confidence: number;
};

// Check if browser supports speech recognition
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

// -------------------------------------------------------------------------
// SPEECH TO TEXT NOTE WRITING ENGINE
// -------------------------------------------------------------------------

export class SpeechToTextController {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognition: any = null;
  private isListening = false;
  private lang = 'en-US';

  constructor(
    private onTranscript: (finalText: string, interimText: string) => void,
    private onStateChange: (state: RecognitionState) => void,
    lang = 'en-US'
  ) {
    this.lang = lang;
    this.initRecognition();
  }

  private initRecognition() {
    if (!isSpeechRecognitionSupported()) {
      this.onStateChange({
        isListening: false,
        isSupported: false,
        transcript: '',
        interimTranscript: '',
        error: 'Speech recognition is not supported in this browser. You can type or paste notes manually.',
      });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SpeechRec();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.lang;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          final += item[0].transcript;
        } else {
          interim += item[0].transcript;
        }
      }
      this.onTranscript(final, interim);
      this.onStateChange({
        isListening: this.isListening,
        isSupported: true,
        transcript: final,
        interimTranscript: interim,
      });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.recognition.onerror = (event: any) => {
      let message = 'Speech recognition error';
      if (event.error === 'not-allowed') {
        message = 'Microphone access was denied. Please allow microphone permissions in browser settings.';
      } else if (event.error === 'no-speech') {
        message = 'No speech was detected. Please try speaking closer to the microphone.';
      } else if (event.error === 'network') {
        message = 'Network error during speech recognition.';
      }
      this.isListening = false;
      this.onStateChange({
        isListening: false,
        isSupported: true,
        transcript: '',
        interimTranscript: '',
        error: message,
      });
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.onStateChange({
        isListening: false,
        isSupported: true,
        transcript: '',
        interimTranscript: '',
      });
    };
  }

  public setLanguage(lang: string) {
    this.lang = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  public start() {
    if (!this.recognition) this.initRecognition();
    if (!this.recognition) return;
    try {
      this.isListening = true;
      this.recognition.start();
      this.onStateChange({
        isListening: true,
        isSupported: true,
        transcript: '',
        interimTranscript: '',
      });
    } catch {
      // already started
    }
  }

  public stop() {
    if (!this.recognition) return;
    try {
      this.isListening = false;
      this.recognition.stop();
    } catch {
      // ignore
    }
  }
}

// -------------------------------------------------------------------------
// SPEECH TO EQUATION: VERBAL MATH PARSER
// -------------------------------------------------------------------------

export function parseSpokenMathToLatex(spoken: string): { latex: string; candidates: SpeechGrammarCandidate[] } {
  let s = spoken.trim().toLowerCase();
  if (!s) return { latex: '', candidates: [] };

  // Normalize filler words and phrases
  s = s.replace(/\bthe quantity\b/g, '');
  s = s.replace(/\bthe expression\b/g, '');

  const candidates: SpeechGrammarCandidate[] = [];

  // 1. Integrals: "integral from a to b of f(x) d x"
  // e.g., "integral from zero to one of x squared d x" -> \int_{0}^{1} x^2 \, dx
  const integralMatch = s.match(/integral\s+(?:from\s+([a-z0-9_]+)\s+to\s+([a-z0-9_]+)\s+of\s+)?(.+?)(?:\s+d\s*([a-z]))?$/i);
  if (s.startsWith('integral') && integralMatch) {
    const lower = convertMathWords(integralMatch[1] || '0');
    const upper = convertMathWords(integralMatch[2] || '1');
    const integrand = convertMathWords(integralMatch[3] || 'x^2');
    const variable = integralMatch[4] || 'x';
    const latex = `\\int_{${lower}}^{${upper}} ${integrand} \\, d${variable}`;
    candidates.push({ latex, label: 'Definite Integral', confidence: 0.95 });
    return { latex, candidates };
  }

  // 2. Partial Derivatives: "partial derivative of u with respect to t"
  // -> \frac{\partial u}{\partial t}
  const partialMatch = s.match(/(?:partial\s+derivative|partial)\s+(?:of\s+)?([a-z0-9_\(\)]+)\s+with\s+respect\s+to\s+([a-z0-9_]+)/i);
  if (partialMatch) {
    const num = convertMathWords(partialMatch[1]);
    const den = convertMathWords(partialMatch[2]);
    const latex = `\\frac{\\partial ${num}}{\\partial ${den}}`;
    candidates.push({ latex, label: 'Partial Derivative', confidence: 0.95 });
    return { latex, candidates };
  }

  // 3. Ordinary Derivatives: "derivative of y with respect to x"
  const derivMatch = s.match(/(?:derivative)\s+(?:of\s+)?([a-z0-9_\(\)]+)\s+with\s+respect\s+to\s+([a-z0-9_]+)/i);
  if (derivMatch) {
    const num = convertMathWords(derivMatch[1]);
    const den = convertMathWords(derivMatch[2]);
    const latex = `\\frac{d ${num}}{d ${den}}`;
    candidates.push({ latex, label: 'Ordinary Derivative', confidence: 0.95 });
    return { latex, candidates };
  }

  // 4. Limits: "limit as x approaches zero of sine x over x"
  const limitMatch = s.match(/limit\s+as\s+([a-z])\s+approaches\s+([a-z0-9_]+)\s+of\s+(.+)$/i);
  if (limitMatch) {
    const varName = limitMatch[1];
    const target = convertMathWords(limitMatch[2]);
    const expr = convertMathWords(limitMatch[3]);
    const latex = `\\lim_{${varName} \\to ${target}} ${expr}`;
    candidates.push({ latex, label: 'Limit expression', confidence: 0.95 });
    return { latex, candidates };
  }

  // 5. Square Root: "square root of x squared plus y squared"
  // -> \sqrt{x^2 + y^2}
  if (s.includes('square root of') || s.includes('root of')) {
    const body = s.replace(/^(?:the\s+)?(?:square\s+root|root)\s+of\s+/, '');
    const convertedBody = convertMathWords(body);
    const latex = `\\sqrt{${convertedBody}}`;
    candidates.push({ latex, label: 'Square Root', confidence: 0.95 });
    return { latex, candidates };
  }

  // 6. Generic math parsing:
  // e.g. "f of x equals x squared plus two x plus one"
  const latex = convertMathWords(s);
  candidates.push({ latex, label: 'Standard Formula', confidence: 0.9 });

  // Check ambiguity e.g. "a plus b squared" -> (a+b)^2 vs a + b^2
  if (s.includes('whole squared') || s.includes('all squared')) {
    // Already handled in convertMathWords
  } else if (s.match(/([a-z0-9]+)\s+plus\s+([a-z0-9]+)\s+squared/)) {
    const m = s.match(/([a-z0-9]+)\s+plus\s+([a-z0-9]+)\s+squared/)!;
    candidates.push({
      latex: `(${m[1]} + ${m[2]})^2`,
      label: `(${m[1]} + ${m[2]})² (whole squared)`,
      confidence: 0.85,
    });
    candidates.push({
      latex: `${m[1]} + ${m[2]}^2`,
      label: `${m[1]} + ${m[2]}² (only second term squared)`,
      confidence: 0.85,
    });
  }

  return { latex, candidates };
}

// Convert common mathematical spoken idioms into clean LaTeX
function convertMathWords(raw: string): string {
  let s = raw.trim();

  // Basic function notation
  s = s.replace(/\bf\s+of\s+([a-z])\b/gi, 'f($1)');
  s = s.replace(/\bg\s+of\s+([a-z])\b/gi, 'g($1)');
  s = s.replace(/\bh\s+of\s+([a-z])\b/gi, 'h($1)');
  s = s.replace(/\bu\s+of\s+([a-z])\b/gi, 'u($1)');
  s = s.replace(/\bv\s+of\s+([a-z])\b/gi, 'v($1)');

  // Equality and relations
  s = s.replace(/\bis\s+equal\s+to\b/gi, '=');
  s = s.replace(/\bequals\b/gi, '=');
  s = s.replace(/\bequal\b/gi, '=');
  s = s.replace(/\bis\s+less\s+than\s+or\s+equal\s+to\b/gi, '\\le');
  s = s.replace(/\bis\s+greater\s+than\s+or\s+equal\s+to\b/gi, '\\ge');
  s = s.replace(/\bis\s+less\s+than\b/gi, '<');
  s = s.replace(/\bis\s+greater\s+than\b/gi, '>');
  s = s.replace(/\bplus\s+or\s+minus\b/gi, '\\pm');

  // Fractions / divisions: "a over b" -> \frac{a}{b}
  s = s.replace(/([a-z0-9\^\{\}\\]+)\s+over\s+([a-z0-9\^\{\}\\]+)/gi, '\\frac{$1}{$2}');
  s = s.replace(/\bdivided\s+by\b/gi, '/');

  // Trig and transcendental
  s = s.replace(/\bsine\b/gi, '\\sin');
  s = s.replace(/\bcosine\b/gi, '\\cos');
  s = s.replace(/\btangent\b/gi, '\\tan');
  s = s.replace(/\blog\b/gi, '\\log');
  s = s.replace(/\bnatural\s+log\b/gi, '\\ln');
  s = s.replace(/\bexponential\b/gi, '\\exp');

  // Powers
  s = s.replace(/\bwhole\s+squared\b/gi, '^2');
  s = s.replace(/\ball\s+squared\b/gi, '^2');
  s = s.replace(/([a-z0-9_\(\)]+)\s+squared\b/gi, '$1^2');
  s = s.replace(/([a-z0-9_\(\)]+)\s+cubed\b/gi, '$1^3');
  s = s.replace(/([a-z0-9_\(\)]+)\s+(?:to\s+the\s+power\s+of|raised\s+to)\s+([a-z0-9_-]+)/gi, '$1^{$2}');

  // Greek letters
  s = s.replace(/\balpha\b/gi, '\\alpha');
  s = s.replace(/\bbeta\b/gi, '\\beta');
  s = s.replace(/\bgamma\b/gi, '\\gamma');
  s = s.replace(/\bdelta\b/gi, '\\delta');
  s = s.replace(/\btheta\b/gi, '\\theta');
  s = s.replace(/\blambda\b/gi, '\\lambda');
  s = s.replace(/\bpi\b/gi, '\\pi');
  s = s.replace(/\bsigma\b/gi, '\\sigma');
  s = s.replace(/\bomega\b/gi, '\\omega');
  s = s.replace(/\bphi\b/gi, '\\phi');
  s = s.replace(/\bpsi\b/gi, '\\psi');

  // Number words to digits
  s = s.replace(/\bzero\b/gi, '0');
  s = s.replace(/\bone\b/gi, '1');
  s = s.replace(/\btwo\b/gi, '2');
  s = s.replace(/\bthree\b/gi, '3');
  s = s.replace(/\bfour\b/gi, '4');
  s = s.replace(/\bfive\b/gi, '5');
  s = s.replace(/\bsix\b/gi, '6');
  s = s.replace(/\bseven\b/gi, '7');
  s = s.replace(/\beight\b/gi, '8');
  s = s.replace(/\bnine\b/gi, '9');
  s = s.replace(/\bten\b/gi, '10');

  // Operators
  s = s.replace(/\bplus\b/gi, '+');
  s = s.replace(/\bminus\b/gi, '-');
  s = s.replace(/\btimes\b/gi, '\\cdot');
  s = s.replace(/\bmultiplied\s+by\b/gi, '\\cdot');

  // Number followed immediately by variable: "2 x" -> "2x"
  s = s.replace(/(\d+)\s+([a-z])/gi, '$1$2');

  return s;
}

// -------------------------------------------------------------------------
// EQUATION-AWARE TEXT-TO-SPEECH NARRATION ENGINE
// -------------------------------------------------------------------------

export function convertLatexToSpokenWords(latex: string): string {
  let s = latex.trim();

  // Common physics equations substitutions
  if (s === 'F=ma' || s === 'F = ma') return 'Force equals mass multiplied by acceleration.';
  if (s.includes('E = mc^2') || s.includes('E=mc^2')) return 'Energy equals mass times the speed of light squared.';

  // Integrals: \int_{a}^{b} f(x) \, dx
  s = s.replace(/\\int_\{?([^\}^_]+)\}?\^\{?([^\}]+)\}?\s*(.+?)\s*\\,?\s*d([a-z])/gi, (_match, a, b, integrand, v) => {
    return `The integral of ${convertLatexToSpokenWords(integrand)}, from ${a} to ${b}, with respect to ${v}`;
  });

  // Partial derivatives: \frac{\partial u}{\partial t}
  s = s.replace(/\\frac\{\\partial\s*([^\}]+)\}\{\\partial\s*([^\}]+)\}/gi, (_match, num, den) => {
    return `The partial derivative of ${num} with respect to ${den}`;
  });

  // Derivatives: \frac{d u}{d t}
  s = s.replace(/\\frac\{d\s*([^\}]+)\}\{d\s*([^\}]+)\}/gi, (_match, num, den) => {
    return `The derivative of ${num} with respect to ${den}`;
  });

  // Fractions: \frac{a}{b}
  s = s.replace(/\\frac\{1\}\{2\}/gi, 'one half');
  s = s.replace(/\\frac\{1\}\{3\}/gi, 'one third');
  s = s.replace(/\\frac\{1\}\{4\}/gi, 'one fourth');
  s = s.replace(/\\frac\{([^\}]+)\}\{([^\}]+)\}/gi, '$1 over $2');

  // Limits: \lim_{x \to 0}
  s = s.replace(/\\lim_\{?([a-z])\s*\\to\s*([^\}]+)\}?/gi, 'the limit as $1 approaches $2 of');

  // Square roots: \sqrt{x}
  s = s.replace(/\\sqrt\{([^\}]+)\}/gi, 'the square root of $1');

  // Powers
  s = s.replace(/\^2\b/gi, ' squared');
  s = s.replace(/\^3\b/gi, ' cubed');
  s = s.replace(/\^\{?([^\}]+)\}?/gi, ' to the power of $1');

  // Greek letters
  s = s.replace(/\\theta/gi, 'theta');
  s = s.replace(/\\alpha/gi, 'alpha');
  s = s.replace(/\\beta/gi, 'beta');
  s = s.replace(/\\omega/gi, 'omega');
  s = s.replace(/\\pi/gi, 'pi');
  s = s.replace(/\\sigma/gi, 'sigma');
  s = s.replace(/\\lambda/gi, 'lambda');

  // Math symbols
  s = s.replace(/\\sin/gi, 'sine');
  s = s.replace(/\\cos/gi, 'cosine');
  s = s.replace(/\\tan/gi, 'tangent');
  s = s.replace(/\\cdot/gi, ' times ');
  s = s.replace(/\\times/gi, ' times ');
  s = s.replace(/\\pm/gi, ' plus or minus ');
  s = s.replace(/\\approx/gi, ' is approximately ');
  s = s.replace(/=/g, ' equals ');
  s = s.replace(/\+/g, ' plus ');
  s = s.replace(/-/g, ' minus ');
  s = s.replace(/\//g, ' divided by ');

  // Clean remaining LaTeX backslashes or braces
  s = s.replace(/[{}\\]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

export class VoiceNarrationController {
  private synth: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private rate = 1.0;
  private pitch = 1.0;

  constructor(
    private onPlayStateChange?: (isPlaying: boolean, isPaused: boolean) => void,
    private onProgress?: (charIndex: number, textLength: number) => void
  ) {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.loadVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  private loadVoices() {
    if (!this.synth) return;
    this.voices = this.synth.getVoices();
    if (!this.selectedVoice && this.voices.length > 0) {
      // Prefer an English natural/neural voice if available
      const preferred = this.voices.find(v => (v.name.includes('Natural') || v.name.includes('Google') || v.lang.startsWith('en')) && !v.name.includes('eSpeak'));
      this.selectedVoice = preferred || this.voices[0];
    }
  }

  public getVoices(): SpeechSynthesisVoice[] {
    if (this.voices.length === 0 && this.synth) {
      this.loadVoices();
    }
    return this.voices;
  }

  public setVoice(voiceName: string) {
    const v = this.voices.find(x => x.name === voiceName);
    if (v) this.selectedVoice = v;
  }

  public setRate(rate: number) {
    this.rate = Math.max(0.5, Math.min(2.0, rate));
  }

  public setPitch(pitch: number) {
    this.pitch = Math.max(0.5, Math.min(1.5, pitch));
  }

  public speak(rawText: string, onEnd?: () => void) {
    if (!this.synth) return;

    // Cancel any previous or queued utterance to prevent audio overlap
    this.synth.cancel();

    // Prepare equation-aware narration text:
    // If text contains $...$ LaTeX spans, convert them to natural math words!
    const spokenText = rawText.replace(/\$([^\$]+)\$/g, (_match, mathContent) => {
      return ` ${convertLatexToSpokenWords(mathContent)} `;
    });

    const utterance = new SpeechSynthesisUtterance(spokenText);
    if (this.selectedVoice) utterance.voice = this.selectedVoice;
    utterance.rate = this.rate;
    utterance.pitch = this.pitch;

    utterance.onstart = () => {
      this.onPlayStateChange?.(true, false);
    };

    utterance.onpause = () => {
      this.onPlayStateChange?.(true, true);
    };

    utterance.onresume = () => {
      this.onPlayStateChange?.(true, false);
    };

    utterance.onboundary = (e) => {
      this.onProgress?.(e.charIndex, spokenText.length);
    };

    utterance.onend = () => {
      this.onPlayStateChange?.(false, false);
      this.currentUtterance = null;
      onEnd?.();
    };

    utterance.onerror = () => {
      this.onPlayStateChange?.(false, false);
      this.currentUtterance = null;
    };

    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  }

  public pause() {
    if (this.synth && this.synth.speaking && !this.synth.paused) {
      this.synth.pause();
      this.onPlayStateChange?.(true, true);
    }
  }

  public resume() {
    if (this.synth && this.synth.paused) {
      this.synth.resume();
      this.onPlayStateChange?.(true, false);
    }
  }

  public stop() {
    if (this.synth) {
      this.synth.cancel();
      this.currentUtterance = null;
      this.onPlayStateChange?.(false, false);
    }
  }
}
