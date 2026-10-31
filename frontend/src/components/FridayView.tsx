import { Bot } from 'lucide-react';
import FridayConsole from './FridayConsole';

/** Full-page FRIDAY: the single assistant for chat, voice, files, simulations and study. */
export default function FridayView() {
  return (
    <div className="h-full flex flex-col md:flex-row bg-slate-100 min-h-0">
      <aside className="hidden md:block md:w-72 shrink-0 p-4 md:p-6 bg-white md:border-r border-b md:border-b-0 border-amber-200 overflow-y-auto md:max-h-none">
        <div className="flex items-center gap-2 mb-2"><div className="p-2 rounded-xl bg-slate-900 text-amber-400"><Bot className="w-5 h-5" /></div><h2 className="font-bold text-slate-800">FRIDAY</h2></div>
        <p className="text-xs text-slate-600 mb-3">One assistant for everything: conversation, maths and code, voice in six languages, your files, your simulations.</p>
        <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li>“Go to folder Inbox, capture the document there, move it into PDF Processing and generate a summary report”</li><li>“Explain Fourier transform”, “derive the heat equation”</li><li>“Open Kalman filter → set noise to 3 → run”</li><li>“Remember that my exam is on Friday”</li><li>“Write a Python function for binary search”</li>
        </ul>
        <p className="text-[11px] text-slate-500 mt-3">Not true AGI: a language model plus tools, memory and a learned answer style. Connect a local model in the Brain tab for full offline conversation.</p>
      </aside>
      <section className="flex-1 min-w-0 min-h-0 flex flex-col"><FridayConsole variant="page" prefix="friday" /></section>
    </div>
  );
}
