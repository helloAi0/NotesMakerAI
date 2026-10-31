import type { DictationMode } from '../lib/useVoice';

interface Dict { mode: DictationMode; setMode: (m: DictationMode) => void; engine: 'browser' | 'cloud'; notice: string; state: string }
/** Choose how speech becomes text: the browser's recogniser, or AI transcription with the user's key (works in any browser). */
export default function DictationEngine({ dict }: { dict: Dict }) {
  return (
    <div className="flex flex-col gap-0.5" data-testid="dictation-engine">
      <label className="flex items-center gap-1 text-[11px] text-slate-600">Engine
        <select value={dict.mode} onChange={e => dict.setMode(e.target.value as DictationMode)} aria-label="Dictation engine" className="border rounded px-1.5 py-1 text-[11px] bg-white">
          <option value="auto">Auto (browser, then AI)</option>
          <option value="browser">Browser speech recognition</option>
          <option value="cloud">AI transcription (your key)</option>
        </select>
      </label>
      {dict.state !== 'idle' && <span className="text-[10px] text-slate-500">Using: {dict.engine === 'cloud' ? 'AI transcription' : 'browser recogniser'}</span>}
      {dict.notice && <span className="text-[11px] text-emerald-700 max-w-[250px]">{dict.notice}</span>}
    </div>
  );
}
