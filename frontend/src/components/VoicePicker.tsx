import { useMemo, useState } from 'react';
import { groupVoices, TONE_PRESETS } from '../lib/voiceProfiles';
import { SPEECH_LANGS } from '../lib/useVoice';

interface Reader { voices: SpeechSynthesisVoice[]; voiceName: string; rate: number; pitch: number; lang: string; setVoice: (n: string) => void; setRate: (r: number) => void; setPitch: (p: number) => void; setLang: (l: string) => void }

/** Voice customization: accent-grouped voice list with gender, speed, pitch and tone presets. */
export default function VoicePicker({ reader }: { reader: Reader }) {
  const [offlineOnly, setOfflineOnly] = useState(true);
  const [gender, setGender] = useState<'Any' | 'Female' | 'Male'>('Any');
  const groups = useMemo(() => groupVoices(reader.voices, { offlineOnly, gender }), [reader.voices, offlineOnly, gender]);
  const total = groups.reduce((n, [, v]) => n + v.length, 0);
  const sel = 'border rounded px-1.5 py-1';
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs" data-testid="voice-picker">
      <select value={reader.voiceName} onChange={e => reader.setVoice(e.target.value)} aria-label="Voice" className={`${sel} max-w-[210px]`}>
        <option value="">Default voice</option>
        {groups.map(([accent, vs]) => (
          <optgroup key={accent} label={accent}>
            {vs.map(v => <option key={v.name} value={v.name}>{v.name} · {v.gender}{v.offline ? '' : ' · online'}</option>)}
          </optgroup>
        ))}
      </select>
      <select value={gender} onChange={e => setGender(e.target.value as 'Any' | 'Female' | 'Male')} aria-label="Voice gender" className={sel}>
        <option value="Any">Any gender</option><option value="Female">Female</option><option value="Male">Male</option>
      </select>
      <select value={reader.lang} onChange={e => reader.setLang(e.target.value)} aria-label="Speech language" className={sel}>
        <option value="">Any language</option>{SPEECH_LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
      <select aria-label="Tone preset" defaultValue="" onChange={e => { const t = TONE_PRESETS.find(x => x.id === e.target.value); if (t) { reader.setRate(t.rate); reader.setPitch(t.pitch); } }} className={sel}>
        <option value="" disabled>Tone…</option>{TONE_PRESETS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      <label className="flex items-center gap-1">Speed <input type="range" min={0.5} max={2} step={0.05} value={reader.rate} onChange={e => reader.setRate(Number(e.target.value))} className="w-20" aria-label="Speed" /> {reader.rate.toFixed(2)}×</label>
      <label className="flex items-center gap-1">Pitch <input type="range" min={0.5} max={1.8} step={0.05} value={reader.pitch} onChange={e => reader.setPitch(Number(e.target.value))} className="w-20" aria-label="Pitch" /> {reader.pitch.toFixed(2)}</label>
      <label className="flex items-center gap-1 cursor-pointer" title="Offline voices are installed on your computer and work without internet. Online voices (marked) need a connection."><input type="checkbox" checked={offlineOnly} onChange={e => setOfflineOnly(e.target.checked)} /> Offline voices only</label>
      <span className="text-[11px] text-slate-500">{total} voice{total === 1 ? '' : 's'} available on this device</span>
    </div>
  );
}
