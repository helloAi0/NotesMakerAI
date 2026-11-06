import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
const Scene = lazy(() => import('./LandingScene'));
const FEATURES: [string, string][] = [
  ['FRIDAY, one AI for everything', 'Chat, derive maths, write code, run simulations and manage your files by voice or text.'],
  ['Notes that read themselves', 'Type or paste, then listen with word-by-word highlighting. Works offline.'],
  ['Bhasha: your language', 'Flip notes into Hindi, Marathi, Bengali, Tamil or Telugu without losing formulas or terms.'],
  ['JEE, NEET, UPSC, GATE engines', 'Board-aware notes, memory tricks and your own previous-year question patterns.'],
  ['Handwriting to LaTeX', 'Snap a page of maths and get editable, checked LaTeX.'],
  ['See the code run', 'Step through Python with live variables, heap and call stack.'],
  ['Swipe to remember', 'Tinder-style flashcards with spaced repetition that schedules itself.'],
  ['Notes marketplace', 'Sell or buy notes with UPI or online payments. You keep the rights.'],
];
export default function Landing({ onEnter }: { onEnter: () => void }) {
  const [ok, setOk] = useState(true); const fail = useCallback(() => setOk(false), []); const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { btn.current?.focus(); const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onEnter(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onEnter]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Welcome to Notes Maker AI" data-testid="landing" className="fixed inset-0 z-[90] overflow-y-auto text-white" style={{ background: 'radial-gradient(ellipse at 70% 30%, #1e1b4b 0%, #0b1020 55%, #05070f 100%)' }}>
      <div className="relative min-h-screen">
        <div className="absolute inset-0 h-screen">{ok && <Suspense fallback={null}><Scene onFail={fail} /></Suspense>}</div>
        <header className="relative z-10 flex items-center justify-between px-5 sm:px-10 py-5"><div className="font-bold tracking-tight text-lg">Notes Maker <span className="text-amber-400">AI</span></div><button onClick={onEnter} className="text-sm text-slate-300 hover:text-white underline underline-offset-4" data-testid="landing-skip">Skip intro</button></header>
        <section className="relative z-10 px-5 sm:px-10 pt-10 sm:pt-24 pb-24 min-h-[78vh] flex flex-col justify-center max-w-3xl">
          <p className="text-amber-400 text-sm font-semibold tracking-widest uppercase mb-4">Built for Indian students</p>
          <h1 className="text-4xl sm:text-6xl font-extrabold leading-[1.05] tracking-tight">Learn anything.<br /><span className="bg-gradient-to-r from-amber-300 to-sky-300 bg-clip-text text-transparent">See everything.</span></h1>
          <p className="mt-6 text-lg text-slate-300 max-w-xl">One offline-first study workspace: an AI that explains in your language, notes that read aloud, simulations you can predict, and flashcards that schedule themselves. Your notes stay on your device.</p>
          <div className="mt-8 flex flex-wrap gap-3"><button ref={btn} onClick={onEnter} data-testid="landing-start" className="px-6 py-3 rounded-xl bg-amber-400 text-slate-900 font-bold hover:bg-amber-300 focus:outline-none focus:ring-4 focus:ring-amber-200/50">Start learning</button><a href="#features" onClick={e => { e.preventDefault(); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }); }} className="px-6 py-3 rounded-xl border border-white/25 hover:bg-white/10">See what is inside</a></div>
        </section>
        <section id="features" className="relative z-10 px-5 sm:px-10 pb-20"><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl">{FEATURES.map(([h, d]) => <div key={h} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5"><h2 className="font-semibold mb-1">{h}</h2><p className="text-sm text-slate-300">{d}</p></div>)}</div>
          <p className="mt-10 text-xs text-slate-400 max-w-2xl">FRIDAY is a set of coordinated AI helpers, not artificial general intelligence. It can make mistakes, so check important answers. No account is needed to start.</p>
          <button onClick={onEnter} className="mt-6 px-6 py-3 rounded-xl bg-amber-400 text-slate-900 font-bold hover:bg-amber-300">Open Notes Maker</button></section>
      </div>
    </div>
  );
}
