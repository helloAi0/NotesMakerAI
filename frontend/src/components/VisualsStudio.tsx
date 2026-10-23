import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, ArrowLeft, ExternalLink, Maximize2, Atom, FlaskConical, Dna, Sigma,
  Globe, Activity, Clock, Sparkles, Bot, Cpu, Terminal, GraduationCap, BookOpen, Layers, Wrench, Gem, Shield, Orbit
} from 'lucide-react';
import SimPlayer from './SimPlayer';
import SimThumb from './SimThumb';
import { SIMS, SIM_SUBJECTS } from '../sims/registry';
import type { AnySim, SimSubject, Values, EducationLevel } from '../sims/types';
import {
  PHET_SIMS, SUBJECTS, PHET_HOME, simRunUrl, simPageUrl, simLicenseUrl, simThumbUrl,
} from '../data/phetSims';
import type { PhetSim, Subject } from '../data/phetSims';

const RECENT_KEY = 'phet_recent';

const ALL_SUBJECT_ICONS: Record<SimSubject, typeof Atom> = {
  Physics: Atom,
  Chemistry: FlaskConical,
  Biology: Dna,
  Math: Sigma,
  'Earth Science': Globe,
  Electronics: Cpu,
  Robotics: Bot,
  'Computer Science': Terminal,
  Engineering: Wrench,
  Materials: Gem,
  Quantum: Orbit,
  Security: Shield,
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
  const Icon = ALL_SUBJECT_ICONS[main] || Atom;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-amber-500 transition-all focus:outline-none focus:ring-2 focus:ring-amber-500"
    >
      <div className={`relative aspect-[16/10] bg-gradient-to-br ${SUBJECT_TINT[main] || 'from-slate-500/25 to-slate-500/10'} flex items-center justify-center overflow-hidden`}>
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
    const t = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(t);
  }, []);

  const fullscreen = () => { frameRef.current?.requestFullscreen?.().catch(() => { /* not allowed */ }); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:border-slate-400 px-3 py-1.5 rounded-lg shadow-sm">
          <ArrowLeft className="w-3.5 h-3.5" /> All simulations
        </button>
        <h2 className="text-base font-bold text-slate-900 flex-1 min-w-0 truncate">{sim.title}</h2>
        <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
          External PhET Resource
        </span>
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
                Taking a while. Simulations load from PhET's servers, so you need an internet connection.
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
        ).
      </p>
    </div>
  );
}

function PhetLibrary() {
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState<'All' | Subject>('All');
  const [open, setOpen] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const rootRef = useRef<HTMLDivElement>(null);

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
    const next = [slug, ...recent.filter(r => r !== slug)].slice(0, 6);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };

  const openedSim = open ? bySlug.get(open) : undefined;
  const recentSims = recent.map(r => bySlug.get(r)).filter((s): s is PhetSim => !!s);
  const filtering = query.trim() !== '' || subject !== 'All';

  return (
    <div ref={rootRef} className="w-full max-w-6xl mx-auto space-y-5">
      {openedSim ? (
        <PhetViewer key={openedSim.slug} sim={openedSim} onBack={() => setOpen(null)} />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Globe className="w-5 h-5 text-amber-600" /> PhET Simulation Library
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {PHET_SIMS.length} simulations from PhET Interactive Simulations. Live embedded educational references.
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
              const Icon = s === 'All' ? Activity : (ALL_SUBJECT_ICONS[s] || Atom);
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
            University of Colorado Boulder.
          </p>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Original simulations with Scalable Curriculum Filters              */
/* ------------------------------------------------------------------ */

interface OriginalLibraryProps {
  notebookContext?: {
    notebookTitle?: string;
    pageNumber?: number;
    onBackToNotebook?: () => void;
  };
  initialSimId?: string | null;
  initialValues?: Values;
}

const SCHOOL_LEVELS = ['Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'];
const UNDERGRAD_LEVELS = ['B.Tech', 'B.Sc', 'BBA', 'BCA'];
const POSTGRAD_LEVELS = ['M.Tech', 'M.Sc'];

function OriginalLibrary({ notebookContext, initialSimId, initialValues }: OriginalLibraryProps) {
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState<'All' | SimSubject>('All');
  const [eduCategory, setEduCategory] = useState<'All' | 'School' | 'Undergraduate' | 'Postgraduate'>('All');
  const [eduLevel, setEduLevel] = useState<string>('All');
  const [difficulty, setDifficulty] = useState<'All' | 'Beginner' | 'Intermediate' | 'Advanced'>('All');
  const [openId, setOpenId] = useState<string | null>(initialSimId || null);

  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => { rootRef.current?.scrollIntoView({ block: 'start' }); }, [openId]);

  const opened: AnySim | undefined = SIMS.find(x => x.id === openId);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();

    return SIMS.filter(x => {
      // 1. Subject Filter
      if (subject !== 'All' && x.subject !== subject) return false;

      // 2. Education Category Filter
      if (eduCategory !== 'All') {
        const levels = x.educationLevels || [];
        if (eduCategory === 'School') {
          const matchSchool = levels.some(l => SCHOOL_LEVELS.includes(l));
          if (!matchSchool && levels.length > 0) return false;
        } else if (eduCategory === 'Undergraduate') {
          const matchUG = levels.some(l => UNDERGRAD_LEVELS.includes(l));
          if (!matchUG && levels.length > 0) return false;
        } else if (eduCategory === 'Postgraduate') {
          const matchPG = levels.some(l => POSTGRAD_LEVELS.includes(l));
          if (!matchPG && levels.length > 0) return false;
        }
      }

      // 3. Specific Education Level Filter
      if (eduLevel !== 'All') {
        if (!x.educationLevels?.includes(eduLevel as EducationLevel)) return false;
      }

      // 4. Difficulty Filter
      if (difficulty !== 'All' && x.difficulty && x.difficulty !== difficulty) {
        return false;
      }

      // 5. Query Search
      if (q) {
        const matchTitle = x.title.toLowerCase().includes(q);
        const matchBlurb = x.blurb.toLowerCase().includes(q);
        const matchSubj = x.subject.toLowerCase().includes(q);
        const matchCat = x.category?.toLowerCase().includes(q);
        const matchTopic = x.topic?.toLowerCase().includes(q);
        const matchLevels = x.educationLevels?.some(l => l.toLowerCase().includes(q));
        if (!matchTitle && !matchBlurb && !matchSubj && !matchCat && !matchTopic && !matchLevels) {
          return false;
        }
      }

      return true;
    });
  }, [query, subject, eduCategory, eduLevel, difficulty]);

  if (opened) {
    return (
      <div ref={rootRef} className="w-full">
        <SimPlayer
          key={opened.id}
          sim={opened}
          onBack={() => setOpenId(null)}
          initialValues={opened.id === initialSimId ? initialValues : undefined}
          notebookContext={notebookContext}
        />
      </div>
    );
  }

  return (
    <div ref={rootRef} className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-600" /> Interactive Simulation Library
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              {SIMS.length} Functional Simulations
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Curriculum-integrated simulations for secondary school, undergraduate engineering, and scientific degrees.
            Featuring live equations, real physics readouts, Robotics kinematics, Circuits, and direct notebook integration.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search: kinematics, RLC, arm, orbit, pH..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
          />
        </div>
      </div>

      {/* Curriculum & Education Level Bar */}
      <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Education Level</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(['All', 'School', 'Undergraduate', 'Postgraduate'] as const).map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setEduCategory(cat);
                  setEduLevel('All');
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  eduCategory === cat
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat === 'All' ? 'All Curricula' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Sub-level options */}
        {eduCategory !== 'All' && (
          <div className="flex items-center gap-2 flex-wrap text-xs pt-1">
            <span className="text-slate-400 font-medium text-[11px]">Select Class/Degree:</span>
            <button
              onClick={() => setEduLevel('All')}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${eduLevel === 'All' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              All {eduCategory}
            </button>
            {(eduCategory === 'School' ? SCHOOL_LEVELS : eduCategory === 'Undergraduate' ? UNDERGRAD_LEVELS : POSTGRAD_LEVELS).map(lvl => (
              <button
                key={lvl}
                onClick={() => setEduLevel(lvl)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${eduLevel === lvl ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {lvl}
              </button>
            ))}
          </div>
        )}

        {/* Difficulty filter */}
        <div className="flex items-center gap-2 flex-wrap text-xs pt-1 border-t border-slate-100">
          <span className="text-slate-400 font-medium text-[11px]">Difficulty:</span>
          {(['All', 'Beginner', 'Intermediate', 'Advanced'] as const).map(diff => (
            <button
              key={diff}
              onClick={() => setDifficulty(diff)}
              className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${
                difficulty === diff ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {diff}
            </button>
          ))}
        </div>
      </div>

      {/* Subject Filter Pills */}
      <div className="flex flex-wrap gap-2">
        {(['All', ...SIM_SUBJECTS] as const).map(sj => {
          const Icon = sj === 'All' ? Activity : (ALL_SUBJECT_ICONS[sj] || Atom);
          const count = sj === 'All' ? SIMS.length : SIMS.filter(x => x.subject === sj).length;
          return (
            <button
              key={sj}
              type="button"
              onClick={() => setSubject(sj)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                subject === sj
                  ? 'border-amber-500 bg-amber-50 text-amber-900 shadow-sm'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {sj}{' '}
              <span className="text-[10px] font-normal opacity-70 bg-slate-100 px-1 rounded-full">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Simulation Grid */}
      {results.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map(x => (
            <button
              key={x.id}
              type="button"
              onClick={() => setOpenId(x.id)}
              className="group text-left bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-amber-500 transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 flex flex-col"
            >
              <div className="relative">
                <SimThumb sim={x} />
                {x.category && (
                  <span className="absolute top-2 left-2 bg-slate-900/80 backdrop-blur text-white text-[10px] font-semibold px-2 py-0.5 rounded shadow">
                    {x.category}
                  </span>
                )}
              </div>
              <div className="p-3.5 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-800 leading-snug group-hover:text-amber-700 transition-colors">
                      {x.title}
                    </p>
                    <span className="text-[10px] font-semibold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded shrink-0">
                      {x.subject}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">{x.blurb}</p>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                  <span>{x.educationLevels ? x.educationLevels.slice(0, 3).join(', ') : 'All Levels'}</span>
                  {x.difficulty && (
                    <span className="font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                      {x.difficulty}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="p-12 text-center text-xs text-slate-500 border border-dashed border-slate-300 rounded-2xl bg-white space-y-2">
          <Layers className="w-8 h-8 text-slate-400 mx-auto opacity-50" />
          <p className="font-semibold text-slate-700 text-sm">No simulation matches your filters</p>
          <p>Try clearing your search query or selecting "All Curricula" and "All Subjects".</p>
          <button
            onClick={() => {
              setQuery('');
              setSubject('All');
              setEduCategory('All');
              setEduLevel('All');
              setDifficulty('All');
            }}
            className="mt-2 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold"
          >
            Reset Filters
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export interface VisualsStudioProps {
  notebookContext?: {
    notebookTitle?: string;
    pageNumber?: number;
    onBackToNotebook?: () => void;
  };
  initialSimId?: string | null;
  initialValues?: Values;
}

export default function VisualsStudio({ notebookContext, initialSimId, initialValues }: VisualsStudioProps) {
  const [tab, setTab] = useState<'original' | 'phet'>('original');

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200 shadow-inner">
          {([['original', `Notes Maker Simulations (${SIMS.length})`], ['phet', `PhET References (${PHET_SIMS.length})`]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {notebookContext?.onBackToNotebook && (
          <button
            onClick={notebookContext.onBackToNotebook}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg border border-amber-300 shadow-sm transition-all"
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-700" /> Return to Notebook (p. {notebookContext.pageNumber ?? 1})
          </button>
        )}
      </div>

      {tab === 'original' ? (
        <OriginalLibrary
          notebookContext={notebookContext}
          initialSimId={initialSimId}
          initialValues={initialValues}
        />
      ) : (
        <PhetLibrary />
      )}
    </div>
  );
}
