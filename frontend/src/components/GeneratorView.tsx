import { useEffect, useState } from 'react';
import { Sparkles, Loader2, NotebookPen, Copy, Save, Trash2 } from 'lucide-react';
import { fridayNotes, llmConfig } from '../lib/friday';
import { toNotebook } from '../lib/agentRuntime';
import { touch } from '../lib/activity';

interface Saved { key: string; topic: string; text: string; t: number }
const loadSaved = (): Saved[] => { const out: Saved[] = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i) || ''; if (k.startsWith('nm_gen_')) { const j = JSON.parse(localStorage.getItem(k) || '{}'); if (j.text) out.push({ key: k, topic: j.topic, text: j.text, t: j.t || 0 }); } } } catch { /* ignore */ } return out.sort((a, b) => b.t - a.t); };

/** Note generator: structured study notes on any topic. Offline from built-in knowledge + your material; richer with an AI key. */
export default function GeneratorView() {
  const [topic, setTopic] = useState(''); const [depth, setDepth] = useState<'brief' | 'standard' | 'detailed'>('standard');
  const [busy, setBusy] = useState(false); const [out, setOut] = useState(''); const [msg, setMsg] = useState(''); const [mode, setMode] = useState(''); const [saved, setSaved] = useState<Saved[]>(loadSaved);
  const [ai, setAi] = useState(!!llmConfig());
  useEffect(() => { const h = () => setAi(!!llmConfig()); window.addEventListener('nm:settings', h); return () => window.removeEventListener('nm:settings', h); }, []);
  const go = async (e: React.FormEvent) => { e.preventDefault(); const t = topic.trim(); if (!t || busy) return; setBusy(true); setMsg(''); setOut(''); touch('ask');
    try { const r = await fridayNotes(t, depth); if (!r.found) setMsg(`I have no built-in material on “${t}”. Add a PDF about it to the library, or add an AI key in Settings to generate notes on anything.`); else { setOut(r.text); setMode(r.mode); if (r.note) setMsg(r.note); } } catch (er) { setMsg((er as Error).message); } finally { setBusy(false); } };
  const save = () => { const key = `nm_gen_${Date.now()}`; try { localStorage.setItem(key, JSON.stringify({ topic, text: out, t: Date.now() })); setSaved(loadSaved()); setMsg('Saved. FRIDAY can now search it.'); } catch { setMsg('Could not save (storage full).'); } };
  const toNb = async () => { const r = await toNotebook('\n' + out.replace(/^#\s+(.+)$/gm, (_, h: string) => h.toUpperCase()).replace(/^#{2,}\s+(.+)$/gm, '$1:').replace(/\*\*/g, '') + '\n'); setMsg(r.msg); };
  return (
    <div className="h-full overflow-y-auto p-3 md:p-8 bg-slate-100" data-testid="generator-view"><div className="max-w-3xl mx-auto space-y-4">
      <div><h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Sparkles className="w-5 h-5 text-amber-600" /> AI Note Generator</h2><p className="text-sm text-slate-600">{ai ? 'AI provider connected: notes are written by your model, grounded in your material.' : 'Offline mode: notes are built from the built-in STEM knowledge, matching simulations and your own notes/PDFs. Add an AI key in Settings for notes on any topic.'}</p></div>
      <form onSubmit={go} className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-col sm:flex-row gap-2">
        <input data-testid="gen-topic" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Topic, e.g. Laplace transform" aria-label="Topic" className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-300 text-sm" />
        <select value={depth} onChange={e => setDepth(e.target.value as typeof depth)} aria-label="Depth" className="px-2 py-2 rounded-lg border border-slate-300 text-sm"><option value="brief">Brief</option><option value="standard">Standard</option><option value="detailed">Detailed</option></select>
        <button data-testid="gen-go" type="submit" disabled={busy || !topic.trim()} className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold flex items-center justify-center gap-1 disabled:opacity-40">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate</button>
      </form>
      {msg && <p role="status" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{msg}</p>}
      {out && <div className="bg-white rounded-2xl border border-slate-200 p-4"><div className="flex flex-wrap gap-2 mb-3 text-xs"><button onClick={() => void toNb()} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-semibold flex items-center gap-1"><NotebookPen className="w-3 h-3" /> Insert into notebook</button><button onClick={save} className="px-3 py-1.5 rounded-lg border border-slate-300 font-semibold flex items-center gap-1"><Save className="w-3 h-3" /> Save</button><button onClick={() => { void navigator.clipboard?.writeText(out); setMsg('Copied.'); }} className="px-3 py-1.5 rounded-lg border border-slate-300 font-semibold flex items-center gap-1"><Copy className="w-3 h-3" /> Copy</button><span className="ml-auto text-slate-400 self-center">{mode === 'ai' ? 'written by AI' : 'offline'}</span></div><pre data-testid="gen-out" className="whitespace-pre-wrap break-words font-sans text-sm text-slate-800">{out}</pre></div>}
      {saved.length > 0 && <div><h3 className="text-sm font-semibold text-slate-700 mb-2">Saved notes</h3><ul className="space-y-1.5">{saved.map(s => <li key={s.key} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm flex items-center gap-2"><button className="flex-1 text-left truncate hover:text-amber-700" onClick={() => { setTopic(s.topic); setOut(s.text); setMode('offline'); }}>{s.topic}</button><span className="text-[11px] text-slate-400">{new Date(s.t).toLocaleDateString()}</span><button aria-label="Delete saved note" onClick={() => { localStorage.removeItem(s.key); setSaved(loadSaved()); }} className="text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></li>)}</ul></div>}
    </div></div>
  );
}
