import { Bot } from 'lucide-react';
import FridayChat from './FridayChat';

/** Full-page FRIDAY: chat with the study helper about the app or any subject. */
export default function FridayView() {
  return (
    <div className="h-full flex flex-col md:flex-row bg-slate-100 min-h-0">
      <aside className="md:w-72 shrink-0 p-4 md:p-6 bg-white md:border-r border-b md:border-b-0 border-amber-200 overflow-y-auto max-h-48 md:max-h-none">
        <div className="flex items-center gap-2 mb-2"><div className="p-2 rounded-xl bg-slate-900 text-amber-400"><Bot className="w-5 h-5" /></div><h2 className="font-bold text-slate-800">FRIDAY</h2></div>
        <p className="text-xs text-slate-600 mb-3">Your study assistant and app agent. Ask about any STEM topic, how this app works, or tell it what to do.</p>
        <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li>“Explain Fourier transform”</li><li>“How do I use click to speak?”</li><li>“Open Kalman filter → set noise to 3 → run”</li><li>“Summarize my pdf thermodynamics”</li><li>“Create folder Physics”, “move thermo notes to Physics”</li><li>“Write a note about Laplace transform”</li><li>“Add task revise optics by Friday”</li><li>“12*7+sqrt(2)”</li>
        </ul>
      </aside>
      <section className="flex-1 min-w-0 min-h-0 flex flex-col"><FridayChat variant="page" prefix="friday" /></section>
    </div>
  );
}
