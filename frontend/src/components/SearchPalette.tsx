import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { searchEverything } from '../lib/friday';
import { send } from '../lib/friday/brain';
import { cap } from '../lib/agentBus';

type Groups = Awaited<ReturnType<typeof searchEverything>>['groups'];
/** Global search (Ctrl+K): simulations, concepts, notes, PDFs and app help. Picking a result lets FRIDAY open it. */
export default function SearchPalette({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: string }) {
  const [q, setQ] = useState(initial); const [groups, setGroups] = useState<Groups>([]); const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(initial); setTimeout(() => ref.current?.focus(), 30); } }, [open, initial]);
  useEffect(() => { if (!open) return; const t = setTimeout(() => { if (q.trim().length < 2) { setGroups([]); return; } void searchEverything(q).then(r => setGroups(r.groups)); }, 150); return () => clearTimeout(t); }, [q, open]);
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [open, onClose]);
  if (!open) return null;
  const pick = (title: string, cmd?: string) => { onClose(); if (cmd) void send(cmd); else { cap('app')?.navigate('friday'); void send(`explain ${title}`); } };
  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/50 flex items-start justify-center p-3 pt-[10vh]" onClick={onClose} role="dialog" aria-modal="true" aria-label="Search" data-testid="search-palette">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 border-b"><Search className="w-4 h-4 text-slate-400" /><input ref={ref} data-testid="search-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search simulations, concepts, notes, PDFs, help…" className="flex-1 py-3 text-sm outline-none" /><button onClick={onClose} aria-label="Close search" className="p-1 hover:bg-slate-100 rounded"><X className="w-4 h-4" /></button></div>
        <div className="max-h-[60vh] overflow-y-auto p-2" data-testid="search-results">
          {q.trim().length < 2 && <p className="text-xs text-slate-500 p-3">Type at least two letters. Tip: press Ctrl+K anywhere.</p>}
          {q.trim().length >= 2 && !groups.length && <p className="text-sm text-slate-500 p-3">Nothing matched “{q}”. Try FRIDAY (Alt+A) for questions.</p>}
          {groups.map(g => <div key={g.kind} className="mb-2"><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 px-2 py-1">{g.kind}</div>{g.items.map((it, i) => <button key={i} onClick={() => pick(it.title, it.cmd)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-amber-50"><div className="text-sm font-medium text-slate-800">{it.title}{it.where ? <span className="text-xs font-normal text-slate-500"> · {it.where}</span> : null}</div><div className="text-xs text-slate-500 line-clamp-2">{it.snippet}</div></button>)}</div>)}
        </div>
      </div>
    </div>
  );
}
