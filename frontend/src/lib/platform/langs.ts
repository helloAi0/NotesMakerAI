/* Indian-language tutoring helpers: which languages are supported, detecting the script of a reply so it is spoken with the right voice,
   telling the model which language to teach in, and an honest report of which voices this device actually has. */
export interface Lang { code: string; bcp: string; name: string; native: string; script: RegExp }
export const LANGS: Lang[] = [
  { code: 'hi', bcp: 'hi-IN', name: 'Hindi', native: 'हिन्दी', script: /[ऀ-ॿ]/ }, { code: 'mr', bcp: 'mr-IN', name: 'Marathi', native: 'मराठी', script: /[ऀ-ॿ]/ },
  { code: 'ta', bcp: 'ta-IN', name: 'Tamil', native: 'தமிழ்', script: /[஀-௿]/ }, { code: 'te', bcp: 'te-IN', name: 'Telugu', native: 'తెలుగు', script: /[ఀ-౿]/ },
  { code: 'bn', bcp: 'bn-IN', name: 'Bengali', native: 'বাংলা', script: /[ঀ-৿]/ }, { code: 'gu', bcp: 'gu-IN', name: 'Gujarati', native: 'ગુજરાતી', script: /[઀-૿]/ },
  { code: 'kn', bcp: 'kn-IN', name: 'Kannada', native: 'ಕನ್ನಡ', script: /[ಀ-೿]/ }, { code: 'ml', bcp: 'ml-IN', name: 'Malayalam', native: 'മലയാളം', script: /[ഀ-ൿ]/ },
  { code: 'pa', bcp: 'pa-IN', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', script: /[਀-੿]/ }, { code: 'ur', bcp: 'ur-PK', name: 'Urdu', native: 'اردو', script: /[؀-ۿ]/ },
];
export const langByCode = (c: string) => LANGS.find(l => l.code === c || l.bcp === c) ?? null;
const MR_WORDS = /(आहे|आणि|नाही|काय|तुम्ही|मला|होते|करा|आपण|म्हणून|कसे)/g, HI_WORDS = /(है|और|नहीं|क्या|आप|मुझे|था|करें|हम|इसलिए|कैसे|हैं)/g;
/** Language of a text by its script. Devanagari is Hindi or Marathi: decided by common function words, Hindi when unclear. null = Latin script/unknown. */
export function detectLang(text: string): Lang | null {
  const t = text.replace(/[\s\d\p{P}]+/gu, ''); if (t.length < 3) return null;
  const counts = LANGS.filter(l => l.code !== 'mr').map(l => ({ l, n: [...t].filter(ch => l.script.test(ch)).length })).sort((a, b) => b.n - a.n)[0];
  if (!counts || counts.n < Math.max(3, t.length * 0.3)) return null;
  if (counts.l.code === 'hi') { const mr = (text.match(MR_WORDS) ?? []).length, hi = (text.match(HI_WORDS) ?? []).length; return langByCode(mr > hi ? 'mr' : 'hi'); }
  return counts.l;
}
/** Instruction added to the model’s system prompt. Formulas and technical terms stay recognisable. */
export function tutorInstruction(code: string): string {
  const l = langByCode(code); if (!l) return '';
  return `Reply in ${l.name} (${l.native}) using its own script. Keep formulas, symbols, units and widely used English technical terms (like “entropy”, “voltage”) as they are, and explain them in ${l.name}. Use simple, short sentences suitable for a student.`;
}
export const getTutorLang = (): string => { try { return localStorage.getItem('nm_tutor_lang') || ''; } catch { return ''; } };
export const setTutorLang = (c: string) => { try { localStorage.setItem('nm_tutor_lang', c); } catch { /* ignore */ } };

/** A few fixed phrases so core feedback works even with no language model. */
export const PHRASES: Record<string, { correct: string; retry: string; unsure: string; revise: string }> = {
  hi: { correct: 'सही!', retry: 'बिल्कुल नहीं, फिर से कोशिश करें।', unsure: 'मुझे इस बारे में पक्का नहीं पता।', revise: 'आइए दोहराते हैं।' },
  mr: { correct: 'बरोबर!', retry: 'अगदी नाही, पुन्हा प्रयत्न करा.', unsure: 'मला याबद्दल खात्री नाही.', revise: 'चला उजळणी करूया.' },
  ta: { correct: 'சரி!', retry: 'சரியல்ல, மீண்டும் முயலுங்கள்.', unsure: 'இதைப் பற்றி எனக்கு உறுதியாகத் தெரியவில்லை.', revise: 'மீண்டும் படிப்போம்.' },
  te: { correct: 'సరైనది!', retry: 'సరిగ్గా లేదు, మళ్ళీ ప్రయత్నించండి.', unsure: 'దీని గురించి నాకు ఖచ్చితంగా తెలియదు.', revise: 'మళ్ళీ చదువుకుందాం.' },
  bn: { correct: 'ঠিক!', retry: 'ঠিক হয়নি, আবার চেষ্টা করুন।', unsure: 'এই বিষয়ে আমি নিশ্চিত নই।', revise: 'চলুন আবার পড়ি।' },
  gu: { correct: 'સાચું!', retry: 'બરાબર નથી, ફરી પ્રયત્ન કરો.', unsure: 'મને આ વિશે ખાતરી નથી.', revise: 'ચાલો ફરી વાંચીએ.' },
  kn: { correct: 'ಸರಿ!', retry: 'ಸರಿಯಲ್ಲ, ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.', unsure: 'ಇದರ ಬಗ್ಗೆ ನನಗೆ ಖಚಿತವಿಲ್ಲ.', revise: 'ಮತ್ತೆ ಓದೋಣ.' },
  ml: { correct: 'ശരി!', retry: 'ശരിയല്ല, വീണ്ടും ശ്രമിക്കൂ.', unsure: 'ഇതിനെക്കുറിച്ച് എനിക്ക് ഉറപ്പില്ല.', revise: 'നമുക്ക് വീണ്ടും പഠിക്കാം.' },
  pa: { correct: 'ਸਹੀ!', retry: 'ਠੀਕ ਨਹੀਂ, ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।', unsure: 'ਮੈਨੂੰ ਇਸ ਬਾਰੇ ਪੱਕਾ ਨਹੀਂ ਪਤਾ।', revise: 'ਆਓ ਦੁਬਾਰਾ ਪੜ੍ਹੀਏ।' },
  ur: { correct: 'درست!', retry: 'ٹھیک نہیں، دوبارہ کوشش کریں۔', unsure: 'مجھے اس بارے میں یقین نہیں۔', revise: 'آئیے دوبارہ پڑھیں۔' },
  en: { correct: 'Correct!', retry: 'Not quite, try again.', unsure: 'I’m not sure about this one.', revise: 'Let’s revise.' },
};
export const phrase = (code: string, k: keyof (typeof PHRASES)['en']) => (PHRASES[code] ?? PHRASES.en)[k];

export interface VoiceReport { lang: Lang; voice: string | null; offline: boolean; advice: string }
/** Which voice this device would use for each language, and what to do when there is none. */
export function voiceReport(voices: { name: string; lang: string; localService: boolean }[]): VoiceReport[] {
  return LANGS.map(l => { const base = l.code; const ok = voices.filter(v => v.lang.toLowerCase().replace('_', '-').split('-')[0] === base); const best = ok.find(v => v.localService) ?? ok[0] ?? null;
    return { lang: l, voice: best?.name ?? null, offline: !!best?.localService, advice: !best ? `No ${l.name} voice on this device. Install one in your system settings (Windows: Settings → Time & language → Speech → Add voices; Android: Settings → Text-to-speech; macOS: System Settings → Accessibility → Spoken Content). Chrome and Edge also offer online voices.` : best.localService ? 'Works offline.' : 'This voice is online-only: it needs internet and sends the spoken text to the browser vendor.' }; });
}
