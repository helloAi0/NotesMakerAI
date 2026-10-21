import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, ArrowLeft, ExternalLink, Maximize2, Atom, FlaskConical, Dna, Sigma, Globe, Activity, Clock, Sparkles,
} from 'lucide-react';
import InteractiveVisualizer from './InteractiveVisualizer';
import {
  PHET_SIMS, SUBJECTS, PHET_HOME, simRunUrl, simPageUrl, simLicenseUrl, simThumbUrl,
} from '../data/phetSims';
import type { PhetSim, Subject } from '../data/phetSims';

const BUILTIN = 'built-in-projectile';
const RECENT_KEY = 'phet_recent';

const SUBJECT_ICON: Record<Subject, typeof Atom> = {
  Physics: Atom,
  Chemistry: FlaskConical,
  Biology: Dna,
  Math: Sigma,
  'Earth Science': Globe,
};

const SUBJECT_TINT: Record<Subject, string> = {
  Physics: 'from-blue-500/25 to-indigo-500/10 text-blue-300',
  Chemistry: 'from-emerald-500/25 to-teal-500/10 text-emerald-300',
  Biology: 'from-rose-500/25 to-orange-500/10 text-rose-300',
  Math: 'from-amber-500/25 to-yellow-500/10 text-amber-300',
  'Earth Science': 'from-cyan-500/25 to-sky-500/10 text-cyan-300',
};

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
}

function SimCard({ sim, onOpen }: { sim: PhetSim; onOpen: () => void }) {
  const [imgOk, setImgOk] = useState(true);
  const main = sim.subjects[0];
  const Icon = SUBJECT_ICON[main];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-amber-500 transition-all focus:outline-none focus:ring-2 focus:ring-amber-500"
    >
      <div className={`relative aspect-[16/10] bg-gradient-to-br ${SUBJECT_TINT[main]} flex items-center justify-center overflow-hidden`}>
        {imgOk ? (
          <img
            src={simThumbUrl(sim.slug)}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgOk(false)}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <Icon className="w-10 h-10 opacity-70" />
        )}
      </div>
      <div className="p-3">
        <p className="text-xs font-bold text-slate-800 leading-snug">{sim.title}</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {sim.subjects.map(s => (
            <span key={s} className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{s}</span>
          ))}
        </div>
      </div>
    </button>
  );
}

function PhetViewer({ sim, onBack }: { sim: PhetSim; onBack: () => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setSlow(false);
    const t = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(t);
  }, [sim.slug]);

  const fullscreen = () => { frameRef.current?.requestFullscreen?.().catch(() => { /* not allowed */ }); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:border-slate-400 px-3 py-1.5 rounded-lg">
          <ArrowLeft className="w-3.5 h-3.5" /> All simulations
        </button>
        <h2 className="text-base font-bold text-slate-900 flex-1 min-w-0 truncate">{sim.title}</h2>
        <button onClick={fullscreen} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:border-slate-400 px-3 py-1.5 rounded-lg">
          <Maximize2 className="w-3.5 h-3.5" /> Full screen
        </button>
        <a href={simPageUrl(sim.slug)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg">
          <ExternalLink className="w-3.5 h-3.5" /> Teaching resources
        </a>
      </div>

      <div className="relative w-full h-[72vh] min-h-[520px] bg-slate-100 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <iframe
          ref={frameRef}
          key={sim.slug}
          src={simRunUrl(sim.slug)}
          title={`${sim.title} (PhET Interactive Simulation)`}
          onLoad={() => setLoaded(true)}
          allow="fullscreen; autoplay"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full border-0"
        />
        {!loaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-100/90 text-slate-600 pointer-events-none">
            <Clock className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-xs font-semibold">Loading {sim.title}...</p>
            {slow && (
              <p className="text-[11px] max-w-sm text-center leading-relaxed">
                Taking a while. Simulations load from PhET's servers, so you need an internet connection (turn off any VPN or ad-blocker for this page if it never loads).
              </p>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed">
        Simulation by{' '}
        <a href="https://phet.colorado.edu" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-700">PhET Interactive Simulations</a>,
        University of Colorado Boulder, used under PhET's licence terms (
        <a href={simLicenseUrl(sim.slug)} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-700">see this simulation's licence</a>
        ). If the simulation stays blank,{' '}
        <a href={simRunUrl(sim.slug)} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-700">open it in a new tab</a>.
      </p>
    </div>
  );
}

export default function VisualsStudio() {
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState<'All' | Subject>('All');
  const [open, setOpen] = useState<string | null>(null); // a slug, BUILTIN, or null for the catalogue
  const [recent, setRecent] = useState<string[]>(readRecent);
  const rootRef = useRef<HTMLDivElement>(null);

  // Opening a simulation or going back should show the top of the panel, not wherever the list was scrolled to.
  useEffect(() => { rootRef.current?.scrollIntoView({ block: 'start' }); }, [open]);

  const bySlug = useMemo(() => new Map(PHET_SIMS.map(s => [s.slug, s])), []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PHET_SIMS.filter(s =>
      (subject === 'All' || s.subjects.includes(subject)) &&
      (!q || s.title.toLowerCase().includes(q) || s.slug.includes(q) || s.subjects.some(x => x.toLowerCase().includes(q))),
    );
  }, [query, subject]);

  const openSim = (slug: string) => {
    setOpen(slug);
    if (slug === BUILTIN) return;
    const next = [slug, ...recent.filter(r => r !== slug)].slice(0, 6);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };

  const openedSim = open && open !== BUILTIN ? bySlug.get(open) : undefined;
  const recentSims = recent.map(r => bySlug.get(r)).filter((s): s is PhetSim => !!s);
  const filtering = query.trim() !== '' || subject !== 'All';

  return (
    <div ref={rootRef} className="w-full max-w-6xl mx-auto space-y-5">
      {open === BUILTIN ? (
        <div className="space-y-3">
          <button onClick={() => setOpen(null)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:border-slate-400 px-3 py-1.5 rounded-lg">
            <ArrowLeft className="w-3.5 h-3.5" /> All simulations
          </button>
          <div className="flex justify-center"><InteractiveVisualizer /></div>
        </div>
      ) : openedSim ? (
        <PhetViewer sim={openedSim} onBack={() => setOpen(null)} />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-600" /> Interactive Visual Learning Studio
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {PHET_SIMS.length} interactive simulations from PhET, plus our own projectile simulator. Pick one to explore it live.
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search: pendulum, circuits, pH, fractions..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['All', ...SUBJECTS] as const).map(s => {
              const Icon = s === 'All' ? Activity : SUBJECT_ICON[s];
              const count = s === 'All' ? PHET_SIMS.length : PHET_SIMS.filter(x => x.subjects.includes(s)).length;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSubject(s)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    subject === s ? 'border-amber-500 bg-amber-50 text-amber-900 shadow-sm' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {s} <span className="text-[10px] font-normal opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          {!filtering && (
            <button
              type="button"
              onClick={() => openSim(BUILTIN)}
              className="w-full text-left flex items-center gap-3 bg-white border border-slate-200 hover:border-amber-500 rounded-xl p-3 shadow-sm transition-all"
            >
              <span className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/25 to-indigo-500/10 flex items-center justify-center"><Activity className="w-5 h-5 text-blue-300" /></span>
              <span>
                <span className="block text-xs font-bold text-slate-800">Projectile Motion Simulator (built in)</span>
                <span className="block text-[11px] text-slate-500">Our own kinematics simulator. Works offline.</span>
              </span>
            </button>
          )}

          {!filtering && recentSims.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Continue exploring</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {recentSims.map(s => <SimCard key={s.slug} sim={s} onOpen={() => openSim(s.slug)} />)}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {filtering ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'All simulations'}
            </h3>
            {results.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {results.map(s => <SimCard key={s.slug} sim={s} onOpen={() => openSim(s.slug)} />)}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-300 rounded-xl">
                No simulation matches "{query}". Try a broader word such as "wave", "circuit" or "fraction".
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed pt-2">
            Simulations by{' '}
            <a href={PHET_HOME} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-700">PhET Interactive Simulations</a>,
            University of Colorado Boulder. They run from PhET's servers and need an internet connection.
          </p>
        </>
      )}
    </div>
  );
}