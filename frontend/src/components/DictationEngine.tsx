import { useState } from 'react';
import type { DictationMode } from '../lib/useVoice';
import { llmConfig } from '../lib/friday';
import { canTranscribe } from '../lib/cloudDictation';
import { generate, loadSaved, saveConfig, saveProvider, loadSpeed } from '../lib/aiClient';
import type { ProviderId } from '../lib/aiClient';

interface Dict { mode: DictationMode; setMode: (m: DictationMode) => void; engine: 'browser' | 'cloud'; notice: string; state: string }

/** Key status + one-field setup, so AI transcription never depends on hunting through Settings. */
function KeyBox() {
  const [, bump] = useState(0); const cfg = llmConfig(); const ok = canTranscribe(cfg);
  const [prov, setProv] = useState<ProviderId>('gemini'); const [key, setKey] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    const k = key.trim(); if (!k) { setMsg('Paste your API key first.'); return; } setBusy(true); setMsg('Testing…');
    const saved = loadSaved(prov); const next = { provider: prov, apiKey: k, model: saved.model, baseUrl: saved.baseUrl, speed: loadSpeed() };
    try { await generate(next, 'Reply with the single word: ready', { stream: false, retries: 0, timeoutMs: 20000, maxTokens: 20 }); saveProvider(prov); saveConfig(next); window.dispatchEvent(new Event('nm:settings')); setKey(''); setMsg('Key works and is saved on this device.'); bump(x => x + 1); }
    catch (e) { setMsg(`That key did not work: ${(e as Error).message.slice(0, 120)}`); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-1 border rounded p-2 bg-slate-50" data-testid="dict-key">
      <span className={`text-[11px] font-semibold ${ok.ok ? 'text-emerald-700' : 'text-amber-700'}`}>{ok.ok ? `AI key ready: ${cfg!.provider}` : (ok.why ?? 'No AI key saved yet.')}</span>
      {!ok.ok && <div className="flex gap-1 flex-wrap">
        <select value={prov} onChange={e => setProv(e.target.value as ProviderId)} aria-label="Provider" className="border rounded px-1 py-1 text-[11px] bg-white"><option value="gemini">Gemini</option><option value="openai">OpenAI</option></select>
        <input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="Paste API key" aria-label="API key" className="border rounded px-1.5 py-1 text-[11px] flex-1 min-w-[110px]" />
        <button onClick={() => void save()} disabled={busy} className="px-2 py-1 rounded bg-slate-900 text-white text-[11px] font-semibold disabled:opacity-60">Save &amp; test</button>
      </div>}
      {msg && <span className="text-[11px] text-slate-700">{msg}</span>}
    </div>
  );
}

/** Choose how speech becomes text: the browser's recogniser, or AI transcription with the user's key (works in any browser). */
export default function DictationEngine({ dict }: { dict: Dict }) {
  return (
    <div className="flex flex-col gap-1" data-testid="dictation-engine">
      <label className="flex items-center gap-1 text-[11px] text-slate-600">Engine
        <select value={dict.mode} onChange={e => dict.setMode(e.target.value as DictationMode)} aria-label="Dictation engine" className="border rounded px-1.5 py-1 text-[11px] bg-white">
          <option value="auto">Auto (browser, then AI)</option>
          <option value="browser">Browser speech recognition</option>
          <option value="cloud">AI transcription (your key)</option>
        </select>
      </label>
      <KeyBox />
      {dict.state !== 'idle' && <span className="text-[10px] text-slate-500">Using: {dict.engine === 'cloud' ? 'AI transcription' : 'browser recogniser'}</span>}
    </div>
  );
}
