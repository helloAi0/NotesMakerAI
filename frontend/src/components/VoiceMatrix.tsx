import { useMemo, useState } from 'react';
import { MATRIX_LANGS, MATRIX_CHARACTERS, pickVoice } from '../lib/voiceProfiles';

interface Reader { voices: SpeechSynthesisVoice[]; voiceName: string; setVoice: (n: string) => void; setRate: (r: number) => void; setPitch: (p: number) => void; setLang: (l: string) => void; supported: boolean }

/** Voice Modulation Matrix: language × gender × character. Picks the best installed voice and sets pitch and speed. */
export default function VoiceMatrix({ reader, onChange }: { reader: Reader; onChange?: () => void }) {
  const [lang, setLang] = useState('en-US'); const [gender, setGender] = useState<'Any' | 'Female' | 'Male'>('Any'); const [chr, setChr] = useState<'deep' | 'natural' | 'melodic'>('natural');
  const chosen = useMemo(() => pickVoice(reader.voices, lang, gender), [reader.voices, lang, gender]);
  const apply = (l: string, g: 'Any' | 'Female' | 'Male', c: 'deep' | 'natural' | 'melodic') => {
    const ch = MATRIX_CHARACTERS.find(x => x.id === c)!; reader.setLang(l); const v = pickVoice(reader.voices, l, g); reader.setVoice(v ? v.name : ''); reader.setRate(ch.rate); reader.setPitch(ch.pitch); onChange?.();
  };
  const btn = (on: boolean) => `px-2.5 py-1.5 rounded border text-xs font-semibold ${on ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-amber-50'}`;
  return (
    <div data-testid="voice-matrix" className="rounded-xl border border-amber-300 bg-amber-50/60 p-2.5 space-y-2 text-xs">
      <div className="font-bold text-slate-800 uppercase text-[10px] tracking-wide">Voice Modulation Matrix</div>
      <div><div className="text-[10px] font-semibold text-slate-500 mb-1">Language</div><div className="flex flex-wrap gap-1">{MATRIX_LANGS.map(l => <button key={l.code} data-testid={`vm-lang-${l.label}`} onClick={() => { setLang(l.code); apply(l.code, gender, chr); }} className={btn(lang === l.code)}>{l.label}</button>)}</div></div>
      <div className="flex flex-wrap gap-4">
        <div><div className="text-[10px] font-semibold text-slate-500 mb-1">Voice</div><div className="flex gap-1">{(['Any', 'Female', 'Male'] as const).map(g => <button key={g} data-testid={`vm-gender-${g}`} onClick={() => { setGender(g); apply(lang, g, chr); }} className={btn(gender === g)}>{g === 'Any' ? 'Any' : g}</button>)}</div></div>
        <div><div className="text-[10px] font-semibold text-slate-500 mb-1">Character</div><div className="flex flex-wrap gap-1">{MATRIX_CHARACTERS.map(c => <button key={c.id} data-testid={`vm-char-${c.id}`} onClick={() => { setChr(c.id); apply(lang, gender, c.id); }} className={btn(chr === c.id)}>{c.label}</button>)}</div></div>
      </div>
      <div data-testid="vm-status" className={chosen ? 'text-slate-600' : 'text-red-700'}>{!reader.supported ? 'Text-to-speech is not available in this browser.' : chosen ? `Using voice: ${chosen.name} (${chosen.lang}). Pitch and speed follow the character.` : `No ${MATRIX_LANGS.find(l => l.code === lang)?.label} voice is installed on this device. Add one in your system’s speech settings (Windows: Settings → Time & language → Speech; Android/iOS: Text-to-speech settings), then reload.`}</div>
    </div>
  );
}
