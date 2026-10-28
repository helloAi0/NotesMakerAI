import { useState } from 'react';
import { BookOpenText, Cpu, ArrowLeft } from 'lucide-react';
import FridayChat from './FridayChat';
import type { Track } from '../lib/fridayChat';

const CARDS: { id: Track; icon: typeof Cpu; title: string; sub: string; points: string[] }[] = [
  { id: 'research', icon: BookOpenText, title: 'Research Knowledge Engine', sub: 'Academic help, STEM derivations, “how does this app work?”', points: ['Works offline with sources', 'Searches your notes and PDFs', 'AI key = answers on anything'] },
  { id: 'agent', icon: Cpu, title: 'Agentic OS / File Voice Controller', sub: 'Speak or type: FRIDAY operates the app for you', points: ['Open sims, set parameters, run', 'Write notes, move and summarise PDFs', 'Planner, settings, chained steps'] },
];

/** FRIDAY's two tracks. variant "dock": choice screen first, then the chat; variant "page": tabs. */
export default function FridayTracks({ variant, prefix, onClose }: { variant: 'dock' | 'page'; prefix: string; onClose?: () => void }) {
  const [track, setTrack] = useState<Track | null>(() => { try { const t = localStorage.getItem('nm_friday_track'); return variant === 'page' ? ((t as Track) || 'research') : null; } catch { return variant === 'page' ? 'research' : null; } });
  const pick = (t: Track | null) => { setTrack(t); try { if (t) localStorage.setItem('nm_friday_track', t); } catch { /* ignore */ } };
  if (!track) return (
    <div data-testid="friday-choice" className="flex flex-col h-full bg-slate-50">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 text-white"><span className="font-bold text-sm">FRIDAY: choose a track</span>{onClose && <button onClick={onClose} aria-label="Close assistant" className="p-1.5 rounded hover:bg-slate-700 text-lg leading-none">×</button>}</div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {CARDS.map(c => <button key={c.id} data-testid={`track-${c.id}`} onClick={() => pick(c.id)} className="w-full text-left rounded-2xl border border-slate-300 bg-white p-3 hover:border-amber-500 hover:shadow transition">
          <div className="flex items-center gap-2 font-bold text-slate-800"><c.icon className="w-5 h-5 text-amber-600" />{c.title}</div><p className="text-xs text-slate-600 mt-1">{c.sub}</p><ul className="text-[11px] text-slate-500 mt-2 list-disc pl-4">{c.points.map(p => <li key={p}>{p}</li>)}</ul></button>)}
      </div>
    </div>);
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className={`flex gap-1 px-2 pt-2 ${variant === 'page' ? 'bg-white' : 'bg-slate-900'}`} role="tablist">
        {variant === 'dock' && <button onClick={() => pick(null)} aria-label="Back to track choice" className="p-1.5 text-slate-300 hover:text-white"><ArrowLeft className="w-4 h-4" /></button>}
        {CARDS.map(c => <button key={c.id} role="tab" aria-selected={track === c.id} data-testid={`tab-${c.id}`} onClick={() => pick(c.id)} className={`px-3 py-1.5 rounded-t-lg text-xs font-semibold flex items-center gap-1 ${track === c.id ? 'bg-slate-50 text-slate-900' : variant === 'page' ? 'text-slate-500 hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-800'}`}><c.icon className="w-3.5 h-3.5" />{c.id === 'research' ? 'Research' : 'Agent'}</button>)}
      </div>
      <div className="flex-1 min-h-0"><FridayChat key={track} variant={variant} prefix={prefix} onClose={onClose} track={track} /></div>
    </div>);
}
