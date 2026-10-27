import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import FridayChat from './FridayChat';

/** Floating FRIDAY: available on every screen (Alt+A). Shares its conversation with the full FRIDAY page. */
export default function AssistantDock({ hidden = false }: { hidden?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.altKey && e.key.toLowerCase() === 'a') { e.preventDefault(); setOpen(o => !o); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  if (hidden) return null;
  if (!open) return (
    <button data-testid="assistant-toggle" onClick={() => setOpen(true)} aria-label="Open FRIDAY (Alt+A)" title="FRIDAY (Alt+A)" className="no-print fixed right-3 bottom-14 md:bottom-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-full bg-slate-900 text-white shadow-xl hover:bg-slate-800 text-sm font-semibold">
      <Bot className="w-5 h-5 text-amber-400" /> FRIDAY
    </button>
  );
  return (
    <div data-testid="assistant-panel" className="no-print fixed right-2 md:right-4 bottom-2 md:bottom-4 z-[60] w-[calc(100vw-1rem)] max-w-[26rem] h-[min(36rem,calc(100vh-5rem))] flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-slate-300 bg-white">
      <FridayChat variant="dock" prefix="assistant" onClose={() => setOpen(false)} />
    </div>
  );
}
