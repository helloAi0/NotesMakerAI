import { useEffect, useRef, useState } from 'react';
import { X, KeyRound, Download, Upload, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import { PROVIDERS, PROVIDER_IDS, loadProvider, loadSaved, saveConfig, saveProvider, loadSpeed, saveSpeed, generate } from '../lib/aiClient';
import type { ProviderId, Speed } from '../lib/aiClient';

const isData = (k: string) => k.startsWith('notesmaker_') || k.startsWith('nm_') || k === 'gemini_api_key';
const isSecret = (k: string) => k.startsWith('ai_') || k === 'gemini_api_key';

/** Settings: AI provider and key, backup/restore of local data, reset. */
export default function SettingsModal() {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<ProviderId>(loadProvider());
  const [key, setKey] = useState(''); const [model, setModel] = useState(''); const [baseUrl, setBaseUrl] = useState(''); const [speed, setSpeed] = useState<Speed>(loadSpeed());
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [withKeys, setWithKeys] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const load = (p: ProviderId) => { const s = loadSaved(p, (import.meta.env.VITE_GEMINI_API_KEY as string) || ''); setKey(s.apiKey); setModel(s.model); setBaseUrl(s.baseUrl); };
  useEffect(() => { const h = () => { const p = loadProvider(); setProvider(p); load(p); setMsg(''); setOpen(true); }; window.addEventListener('nm:open-settings', h); return () => window.removeEventListener('nm:open-settings', h); }, []);
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [open]);
  if (!open) return null;
  const info = PROVIDERS[provider];
  const save = () => { saveProvider(provider); saveSpeed(speed); saveConfig({ provider, apiKey: key.trim(), model: model.trim(), baseUrl: baseUrl.trim(), speed }); window.dispatchEvent(new Event('nm:settings')); setMsg('Saved on this device.'); };
  const test = async () => {
    save(); setBusy(true); setMsg('Testing…');
    try { const r = await generate({ provider, apiKey: key.trim(), model: model.trim(), baseUrl: baseUrl.trim(), speed }, 'Reply with the single word: ready', { stream: false, retries: 0, timeoutMs: 20000, maxTokens: 20 }); setMsg(`Connected ✓ (${r.trim().slice(0, 40)})`); }
    catch (e) { setMsg(`Could not connect: ${(e as Error).message.slice(0, 160)}`); } finally { setBusy(false); }
  };
  const exportData = () => {
    const out: Record<string, string> = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (isData(k) && (withKeys || !isSecret(k))) out[k] = localStorage.getItem(k) ?? ''; }
    const blob = new Blob([JSON.stringify({ app: 'notes-maker-ai', version: 1, exported: new Date().toISOString(), data: out }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `notes-maker-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); setMsg(`Exported ${Object.keys(out).length} items${withKeys ? ' (including AI keys — keep this file private)' : ''}.`);
  };
  const importData = async (f: File) => {
    try { const j = JSON.parse(await f.text()); if (j.app !== 'notes-maker-ai' || typeof j.data !== 'object') throw new Error('not a Notes Maker AI backup'); let n = 0; for (const [k, v] of Object.entries(j.data as Record<string, string>)) if (isData(k) && typeof v === 'string') { localStorage.setItem(k, v); n++; } setMsg(`Imported ${n} items. Reloading…`); setTimeout(() => location.reload(), 900); }
    catch (e) { setMsg(`Import failed: ${(e as Error).message}`); }
  };
  const reset = () => { if (!confirm('Delete ALL notes, tasks, chat history and settings on this device? PDFs in the library are removed too. This cannot be undone.')) return; const ks: string[] = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (isData(k) || isSecret(k)) ks.push(k); } ks.forEach(k => localStorage.removeItem(k)); try { indexedDB.databases?.().then(dbs => dbs.forEach(d => d.name && indexedDB.deleteDatabase(d.name))); } catch { /* ignore */ } setMsg('Cleared. Reloading…'); setTimeout(() => location.reload(), 900); };
  const inp = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30';
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 bg-slate-900/50" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="Settings" data-testid="settings-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b"><h2 className="font-bold text-slate-800 flex items-center gap-2"><KeyRound className="w-4 h-4 text-amber-600" /> Settings</h2><button onClick={() => setOpen(false)} aria-label="Close settings" className="p-1 rounded hover:bg-slate-100"><X className="w-4 h-4" /></button></div>
        <div className="p-5 space-y-5 text-sm">
          <section className="space-y-2">
            <h3 className="font-semibold text-slate-700">AI provider (optional)</h3>
            <p className="text-xs text-slate-500">The app works fully offline without this. A key lets FRIDAY, the note generator and the PDF tools answer anything with a language model. The key stays in this browser only.</p>
            <select value={provider} onChange={e => { const p = e.target.value as ProviderId; setProvider(p); load(p); }} className={inp} aria-label="Provider">{PROVIDER_IDS.map(p => <option key={p} value={p}>{PROVIDERS[p].label}</option>)}</select>
            <input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder={info.keyPlaceholder} className={inp} aria-label="API key" />
            {provider === 'custom' && <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="Base URL, e.g. http://localhost:11434/v1 (Ollama)" className={inp} aria-label="Base URL" />}
            <input value={model} onChange={e => setModel(e.target.value)} placeholder={`Model (blank = ${info.defaultModel || 'automatic'})`} className={inp} aria-label="Model" />
            <div className="flex items-center gap-2 text-xs"><label>Speed</label><select value={speed} onChange={e => setSpeed(e.target.value as Speed)} className="border rounded px-2 py-1"><option value="fast">Fast</option><option value="quality">Quality</option></select><span className="text-slate-500">{info.keyHelp && `Get a key: ${info.keyHelp}`} {info.note}</span></div>
            <div className="flex gap-2"><button onClick={save} className="px-3 py-2 rounded-lg bg-amber-600 text-white font-semibold">Save</button><button onClick={() => void test()} disabled={busy} className="px-3 py-2 rounded-lg border border-slate-300 font-semibold disabled:opacity-50 flex items-center gap-1">{busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Save &amp; test</button></div>
          </section>
          <section className="space-y-2 border-t pt-4">
            <h3 className="font-semibold text-slate-700">Backup &amp; restore</h3>
            <p className="text-xs text-slate-500">Notes, tasks, chat and settings live on this device. Export them to move to another device. PDFs in the library are not included; keep the originals.</p>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={withKeys} onChange={e => setWithKeys(e.target.checked)} /> Include AI keys (keep the file private)</label>
            <div className="flex gap-2 flex-wrap"><button onClick={exportData} className="px-3 py-2 rounded-lg border border-slate-300 font-semibold flex items-center gap-1"><Download className="w-3 h-3" /> Export</button><button onClick={() => file.current?.click()} className="px-3 py-2 rounded-lg border border-slate-300 font-semibold flex items-center gap-1"><Upload className="w-3 h-3" /> Import</button><input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void importData(f); e.target.value = ''; }} /></div>
          </section>
          <section className="border-t pt-4"><button onClick={reset} className="px-3 py-2 rounded-lg border border-red-300 text-red-700 font-semibold flex items-center gap-1 text-xs"><Trash2 className="w-3 h-3" /> Delete all local data</button></section>
          {msg && <p role="status" data-testid="settings-msg" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
