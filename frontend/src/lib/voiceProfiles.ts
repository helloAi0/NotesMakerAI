/** Describes the installed speech-synthesis voices (gender, accent, offline or not) and offers tone presets. */
export interface VoiceInfo { name: string; lang: string; gender: 'Female' | 'Male' | 'Neutral'; accent: string; offline: boolean }

const ACCENTS: Record<string, string> = {
  'ar-sa': 'Arabic', 'ar-eg': 'Arabic (Egypt)', 'ar-ae': 'Arabic (UAE)',
  'en-us': 'American English', 'en-gb': 'British English', 'en-in': 'Indian English', 'en-au': 'Australian English', 'en-ca': 'Canadian English', 'en-ie': 'Irish English', 'en-za': 'South African English', 'en-nz': 'New Zealand English',
  'hi-in': 'Hindi',  'gu-in': 'Gujarati', 'mr-in': 'Marathi', 'ta-in': 'Tamil', 'te-in': 'Telugu', 'bn-in': 'Bengali', 'kn-in': 'Kannada', 'ml-in': 'Malayalam', 'pa-in': 'Punjabi',
  'es-es': 'Spanish (Spain)', 'es-mx': 'Spanish (Mexico)', 'fr-fr': 'French', 'de-de': 'German', 'it-it': 'Italian', 'pt-br': 'Portuguese (Brazil)', 'ja-jp': 'Japanese', 'zh-cn': 'Chinese (Mandarin)', 'ko-kr': 'Korean', 'ru-ru': 'Russian',
};
const FEMALE = /\b(female|woman|zira|hazel|susan|samantha|victoria|karen|moira|tessa|fiona|allison|ava|serena|kate|catherine|aria|jenny|sonia|libby|natasha|neerja|heera|veena|kalpana|swara|raveena|lekha|priya|sara|elsa|helena|paulina|monica|amelie|marie|anna|yelda|google uk english female|google us english)\b/i;
const MALE = /\b(male|man|david|mark|george|james|richard|alex|daniel|fred|tom|ryan|guy|ravi|hemant|prabhat|madhur|rishi|ethan|oliver|thomas|jorge|diego|google uk english male)\b/i;

export function describeVoice(v: SpeechSynthesisVoice): VoiceInfo {
  const key = v.lang.toLowerCase().replace('_', '-');
  const accent = ACCENTS[key] ?? ACCENTS[key.split('-')[0] + '-' + key.split('-')[0]] ?? v.lang;
  const g: VoiceInfo['gender'] = FEMALE.test(v.name) && !/\bmale\b/i.test(v.name.replace(/female/i, '')) ? 'Female' : MALE.test(v.name) ? 'Male' : 'Neutral';
  return { name: v.name, lang: v.lang, gender: g, accent, offline: v.localService !== false };
}
export function groupVoices(voices: SpeechSynthesisVoice[], opts: { offlineOnly: boolean; gender: 'Any' | 'Female' | 'Male' }) {
  const groups = new Map<string, VoiceInfo[]>();
  for (const v of voices) { const d = describeVoice(v); if (opts.offlineOnly && !d.offline) continue; if (opts.gender !== 'Any' && d.gender !== opts.gender) continue; (groups.get(d.accent) ?? groups.set(d.accent, []).get(d.accent)!).push(d); }
  return [...groups.entries()].sort((a, b) => (/English/.test(a[0]) === /English/.test(b[0]) ? a[0].localeCompare(b[0]) : /English/.test(a[0]) ? -1 : 1));
}
export const TONE_PRESETS: { id: string; label: string; rate: number; pitch: number }[] = [
  { id: 'teacher', label: 'Calm teacher', rate: 0.9, pitch: 1.0 },
  { id: 'normal', label: 'Natural', rate: 1.0, pitch: 1.0 },
  { id: 'revision', label: 'Quick revision', rate: 1.35, pitch: 1.0 },
  { id: 'narrator', label: 'Deep narrator', rate: 0.95, pitch: 0.75 },
  { id: 'bright', label: 'Bright & upbeat', rate: 1.1, pitch: 1.25 },
  { id: 'slow', label: 'Slow & clear', rate: 0.7, pitch: 1.0 },
];

/** The six languages of the Voice Modulation Matrix. */
export const MATRIX_LANGS: { label: string; code: string }[] = [
  { label: 'English', code: 'en-US' }, { label: 'Hindi', code: 'hi-IN' }, { label: 'Arabic', code: 'ar-SA' }, { label: 'Marathi', code: 'mr-IN' }, { label: 'French', code: 'fr-FR' }, { label: 'German', code: 'de-DE' },
];
/** Voice character: pitch/rate presets. “Deep” = low, slow, resonant; “Melodic” = higher, lively, simple. */
export const MATRIX_CHARACTERS: { id: 'deep' | 'natural' | 'melodic'; label: string; rate: number; pitch: number }[] = [
  { id: 'deep', label: 'Deep / heavy resonant', rate: 0.85, pitch: 0.55 },
  { id: 'natural', label: 'Natural', rate: 1, pitch: 1 },
  { id: 'melodic', label: 'Simple melodic', rate: 1.05, pitch: 1.3 },
];
/** Best installed voice for a language and gender (exact language first, then same base language; offline voices preferred). */
export function pickVoice(voices: SpeechSynthesisVoice[], lang: string, gender: 'Any' | 'Female' | 'Male'): SpeechSynthesisVoice | null {
  const base = lang.split('-')[0].toLowerCase(); const ok = voices.filter(v => v.lang.toLowerCase().replace('_', '-').startsWith(base)); if (!ok.length) return null;
  const score = (v: SpeechSynthesisVoice) => { const d = describeVoice(v); return (v.lang.toLowerCase().replace('_', '-') === lang.toLowerCase() ? 4 : 0) + (gender !== 'Any' && d.gender === gender ? 8 : 0) + (gender !== 'Any' && d.gender !== 'Neutral' && d.gender !== gender ? -8 : 0) + (d.offline ? 1 : 0); };
  return [...ok].sort((a, b) => score(b) - score(a))[0];
}
