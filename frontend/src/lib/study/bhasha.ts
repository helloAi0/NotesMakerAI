/* Bhasha flip: English study material -> notes in an Indian language, technical terms kept in English.
   Technical terms, formulas, numbers+units and acronyms are masked with tokens before the model sees the text and restored afterwards, so the
   model cannot translate or corrupt them. Anything it drops is detected and repaired. The AI call is injected (works with any provider / local model). */
import { langByCode } from '../platform/langs';

export type Gen = (prompt: string) => Promise<string>;
export interface Masked { text: string; terms: string[] }

const UNIT = '(?:m|cm|mm|km|kg|g|mg|s|ms|N|J|W|V|A|Hz|K|mol|Pa|L|mL|C|F|T|eV|rad)(?:\\/s\\^?\\d?|\\^-?\\d|\\u00b2|\\u00b3)?';
const PATTERNS: RegExp[] = [
  /\$\$[\s\S]+?\$\$|\$[^$\n]+\$/g,                                   // LaTeX
  /\b[A-Za-z]\w*(?:\([^)\n]*\))?\s*=\s*[^\s,;.][^\n,;]*?(?=[.;,\n]|$)/g, // equations like F = m a, PV = nRT
  new RegExp(`\\b\\d+(?:\\.\\d+)?\\s?${UNIT}\\b`, 'g'),                // 9.8 m/s^2
  /\b[A-Z]{2,}[a-z]?\d*\b/g,                                          // DNA, ROS, CPU, JEE
  /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s(?:Law|Laws|Theorem|Principle|Effect|Equation|Cycle|Constant|Rule|Number|Series|Reaction|Process|Transform|Inequality|Hypothesis)\b/g, // named laws; place/person names are NOT masked
  /\b\w+(?:-\w+)*\([^)\n]*\)/g,                                       // f(x), malloc(n)
];
/** words that are technical in most STEM texts even when lower-case */
export const GLOSSARY = ['entropy', 'enthalpy', 'voltage', 'current', 'resistance', 'capacitor', 'inductor', 'transistor', 'diode', 'momentum', 'velocity', 'acceleration', 'torque', 'photon', 'electron', 'proton', 'neutron', 'isotope', 'catalyst', 'enzyme', 'mitosis', 'meiosis', 'ribosome', 'algorithm', 'pointer', 'array', 'stack', 'queue', 'recursion', 'derivative', 'integral', 'matrix', 'eigenvalue', 'vector', 'scalar', 'polynomial', 'logarithm', 'thermodynamics', 'diffraction', 'refraction', 'interference', 'wavelength', 'frequency', 'amplitude', 'osmosis', 'photosynthesis', 'genome', 'allele', 'covalent', 'ionic', 'oxidation', 'reduction', 'electrolysis', 'inertia'];

export function maskTerms(text: string, extra: string[] = []): Masked {
  const terms: string[] = []; const idx = new Map<string, number>();
  const tok = (s: string) => { let i = idx.get(s); if (i === undefined) { i = terms.length; terms.push(s); idx.set(s, i); } return `⟦${i}⟧`; };
  let out = text;
  const keepSpace = (m: string) => { const t = m.trim(); if (!t || m.includes('⟦')) return m; return m.slice(0, m.indexOf(t)) + tok(t) + m.slice(m.indexOf(t) + t.length); };
  for (const re of PATTERNS) out = out.replace(re, keepSpace);
  const words = [...new Set([...GLOSSARY, ...extra.map(e => e.trim()).filter(Boolean)])].sort((a, b) => b.length - a.length);
  for (const w of words) out = out.replace(new RegExp(`(?<![\\w⟦])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w⟧])`, 'gi'), m => tok(m));
  return { text: out, terms };
}
/** models sometimes write token numbers in Indic digits: normalise before reading them */
const DIGITS = '०१२३४५६७८९০১২৩৪৫৬৭৮৯௦௧௨௩௪௫௬௭௮௯౦౧౨౩౪౫౬౭౮౯';
const asciiNum = (s: string) => [...s].map(c => { const i = DIGITS.indexOf(c); return i < 0 ? c : String(i % 10); }).join('');
const TOKEN = /⟦\s*([0-9০-৯௦-௯౦-౯०-९]+)\s*⟧/g;
export const unmask = (text: string, terms: string[]) => text.replace(TOKEN, (m, i) => terms[+asciiNum(i)] ?? m);
/** tokens present in the source but missing from the model output */
export const missingTokens = (src: string, out: string): number[] => { const have = new Set([...out.matchAll(TOKEN)].map(m => +asciiNum(m[1]))); return [...new Set([...src.matchAll(/⟦(\d+)⟧/g)].map(m => +m[1]))].filter(i => !have.has(i)); };

export function chunkText(text: string, max = 1400): string[] {
  const paras = text.replace(/\r/g, '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean); const out: string[] = []; let cur = '';
  for (const p of paras) { if (p.length > max) { if (cur) { out.push(cur); cur = ''; } for (const s of p.match(/[^.!?।]+[.!?।]?\s*/g) ?? [p]) { if ((cur + s).length > max && cur) { out.push(cur.trim()); cur = ''; } cur += s; } continue; } if ((cur + '\n\n' + p).length > max && cur) { out.push(cur); cur = p; } else cur = cur ? cur + '\n\n' + p : p; }
  if (cur.trim()) out.push(cur.trim()); return out;
}

export interface FlipResult { lang: string; text: string; chunks: number; repaired: number; failed: number; termsKept: number; termsTotal: number; truncated: boolean; usedChars: number }
export const FLIP_MAX_CHARS = 30000;
export const flipPrompt = (langCode: string, masked: string, mode: 'notes' | 'translate') => {
  const l = langByCode(langCode); if (!l) throw new Error('unsupported language');
  return `You are an expert teacher writing for Indian students.
${mode === 'notes' ? `Turn the passage into clear, well-structured study notes` : 'Translate the passage faithfully'} in ${l.name} (${l.native}), written in its own script.
STRICT RULES:
- Tokens like ⟦3⟧ stand for technical terms, formulas or quantities. Copy every token EXACTLY as it is, where it belongs in the sentence. Never translate, remove, merge or renumber them.
- Do not add facts that are not in the passage. Do not invent examples.
- Use short sentences and simple everyday ${l.name}. Use "-" bullets for lists.
Return only the ${l.name} text.

PASSAGE:
${masked}`;
};

export async function flip(source: string, langCode: string, gen: Gen, o: { mode?: 'notes' | 'translate'; terms?: string[]; onProgress?: (done: number, total: number) => void; concurrency?: number; maxChars?: number; signal?: AbortSignal } = {}): Promise<FlipResult> {
  const mode = o.mode ?? 'notes'; const cap = o.maxChars ?? FLIP_MAX_CHARS; const truncated = source.length > cap; const chunks = chunkText(truncated ? source.slice(0, cap) : source); const results: string[] = new Array(chunks.length).fill(''); let repaired = 0, failed = 0, kept = 0, total = 0, done = 0;
  const work = async (i: number) => {
    if (o.signal?.aborted) { results[i] = ''; return; }
    const m = maskTerms(chunks[i], o.terms); total += m.terms.length; let out = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      try { out = await gen(flipPrompt(langCode, m.text, mode)); } catch { out = ''; }
      if (out.trim() && !missingTokens(m.text, out).length) break; if (attempt === 0 && out.trim()) repaired++;
    }
    if (!out.trim()) { failed++; results[i] = chunks[i]; kept += m.terms.length; } // keep the original English rather than losing content
    else { const miss = missingTokens(m.text, out); if (miss.length) out += `\n\n(${miss.map(k => m.terms[k]).join(', ')})`; kept += m.terms.length; results[i] = unmask(out, m.terms); }
    o.onProgress?.(++done, chunks.length);
  };
  const q = [...chunks.keys()]; await Promise.all(Array.from({ length: Math.min(o.concurrency ?? 3, q.length) }, async () => { for (let i = q.shift(); i !== undefined; i = q.shift()) { if (o.signal?.aborted) break; await work(i); } }));
  if (o.signal?.aborted) throw new Error('Stopped.');
  return { lang: langCode, text: results.filter(Boolean).join('\n\n'), chunks: chunks.length, repaired, failed, termsKept: kept, termsTotal: total, truncated, usedChars: Math.min(source.length, cap) };
}

/** Interface labels for the Study Studio. First-pass wording: needs review by native speakers before wide release. */
export const UI_STR: Record<string, Record<'upload' | 'make' | 'listen' | 'stop' | 'language' | 'notes' | 'working' | 'terms', string>> = {
  en: { upload: 'Upload a PDF or paste text', make: 'Make notes', listen: 'Listen', stop: 'Stop', language: 'Language', notes: 'Notes', working: 'Working…', terms: 'Technical terms kept in English' },
  hi: { upload: 'PDF अपलोड करें या टेक्स्ट पेस्ट करें', make: 'नोट्स बनाएँ', listen: 'सुनें', stop: 'रोकें', language: 'भाषा', notes: 'नोट्स', working: 'काम हो रहा है…', terms: 'तकनीकी शब्द अंग्रेज़ी में रखे गए' },
  mr: { upload: 'PDF अपलोड करा किंवा मजकूर पेस्ट करा', make: 'नोट्स तयार करा', listen: 'ऐका', stop: 'थांबवा', language: 'भाषा', notes: 'नोट्स', working: 'काम सुरू आहे…', terms: 'तांत्रिक शब्द इंग्रजीतच ठेवले' },
  bn: { upload: 'PDF আপলোড করুন বা লেখা পেস্ট করুন', make: 'নোট তৈরি করুন', listen: 'শুনুন', stop: 'থামুন', language: 'ভাষা', notes: 'নোট', working: 'কাজ চলছে…', terms: 'প্রযুক্তিগত শব্দ ইংরেজিতেই রাখা হয়েছে' },
  ta: { upload: 'PDF பதிவேற்றவும் அல்லது உரையை ஒட்டவும்', make: 'குறிப்புகள் உருவாக்கு', listen: 'கேள்', stop: 'நிறுத்து', language: 'மொழி', notes: 'குறிப்புகள்', working: 'வேலை நடக்கிறது…', terms: 'தொழில்நுட்பச் சொற்கள் ஆங்கிலத்திலேயே' },
  te: { upload: 'PDF అప్‌లోడ్ చేయండి లేదా టెక్స్ట్ అతికించండి', make: 'నోట్స్ తయారు చేయి', listen: 'వినండి', stop: 'ఆపండి', language: 'భాష', notes: 'నోట్స్', working: 'పని జరుగుతోంది…', terms: 'సాంకేతిక పదాలు ఆంగ్లంలోనే ఉంచబడ్డాయి' },
};
export const ui = (code: string, k: keyof (typeof UI_STR)['en']) => (UI_STR[code] ?? UI_STR.en)[k];
