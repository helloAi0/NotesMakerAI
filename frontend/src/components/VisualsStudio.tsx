import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, ArrowLeft, Atom, FlaskConical, Dna, Sigma,
  Globe, Activity, Sparkles, Bot, Cpu, Terminal, GraduationCap, BookOpen, Layers, Wrench, Gem, Shield, Orbit
} from 'lucide-react';
import SimPlayer from './SimPlayer';
import SimThumb from './SimThumb';
import { SIMS, SIM_SUBJECTS } from '../sims/registry';
import { resolveCurriculum } from '../sims/curriculumCatalog';
import { register } from '../lib/agentBus';
import type { LevelBand } from '../sims/curriculumCatalog';
import type { AnySim, SimSubject, Values, EducationLevel } from '../sims/types';

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

function OriginalLibrary({ notebookContext, initialSimId, initialValues, openId, setOpenId }: OriginalLibraryProps & { openId: string | null; setOpenId: (id: string | null) => void }) {
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState<'All' | SimSubject>('All');
  const [eduCategory, setEduCategory] = useState<'All' | 'University' | 'School' | 'Undergraduate' | 'Postgraduate'>('University');
  const [eduLevel, setEduLevel] = useState<string>('All');
  const [difficulty, setDifficulty] = useState<'All' | 'Beginner' | 'Intermediate' | 'Advanced'>('All');

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
        if (eduCategory === 'University') {
          if (!levels.some(l => UNDERGRAD_LEVELS.includes(l) || POSTGRAD_LEVELS.includes(l))) return false;
        } else if (eduCategory === 'School') {
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
            {(['University', 'Undergraduate', 'Postgraduate', 'School', 'All'] as const).map(cat => (
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
                {cat === 'All' ? 'All Curricula' : cat === 'University' ? 'University (UG + PG)' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Sub-level options */}
        {eduCategory !== 'All' && eduCategory !== 'University' && (
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

/* ------------------------------------------------------------------ */
/*  Curriculum coverage — honest: "working" only if a real sim covers it */
/* ------------------------------------------------------------------ */
function CoverageView({ onOpen }: { onOpen: (id: string) => void }) {
  const all = useMemo(() => resolveCurriculum(SIMS), []);
  const [band, setBand] = useState<'All' | LevelBand>('All');
  const [subject, setSubject] = useState<string>('All');
  const [status, setStatus] = useState<'All' | 'working' | 'planned'>('All');
  const [q, setQ] = useState('');
  const subjects = useMemo(() => ['All', ...Array.from(new Set(all.map(t => t.subject)))], [all]);
  const rows = all.filter(t => (band === 'All' || t.band === band) && (subject === 'All' || t.subject === subject) && (status === 'All' || t.status === status) && (!q.trim() || t.title.toLowerCase().includes(q.trim().toLowerCase())));
  const working = all.filter(t => t.status === 'working').length;
  const sel = 'text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white text-slate-700';
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="font-semibold text-slate-800 text-sm">Curriculum coverage: {working} of {all.length} topics have a working simulation; {all.length - working} are planned.</p>
        <p className="text-xs text-slate-500 mt-1">A topic is marked “working” only when a registered, tested simulation actually covers it. Planned topics have no simulation yet and cannot be opened.</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search topics…" className={`${sel} w-44`} />
          <select value={band} onChange={e => setBand(e.target.value as 'All' | LevelBand)} className={sel}>{['All', 'School 8–10', 'School 11–12', 'Undergraduate', 'Postgraduate'].map(b => <option key={b}>{b}</option>)}</select>
          <select value={subject} onChange={e => setSubject(e.target.value)} className={sel}>{subjects.map(b => <option key={b}>{b}</option>)}</select>
          <select value={status} onChange={e => setStatus(e.target.value as 'All' | 'working' | 'planned')} className={sel}><option value="All">All status</option><option value="working">Working</option><option value="planned">Planned</option></select>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {rows.map(t => (
          <div key={t.title + t.band} className={`rounded-lg border p-3 ${t.status === 'working' ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">{t.title}</p>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.status === 'working' ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-700'}`}>{t.status === 'working' ? 'WORKING' : 'PLANNED'}</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">{t.subject} · {t.band}</p>
            {t.sims.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{t.sims.map(sm => <button key={sm.id} onClick={() => onOpen(sm.id)} className="text-[11px] px-2 py-1 rounded-md bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100">▶ {sm.title.length > 44 ? sm.title.slice(0, 42) + '…' : sm.title}</button>)}</div>}
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-slate-500 p-4">No topics match these filters.</p>}
      </div>
    </div>
  );
}

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
  const [tab, setTab] = useState<'original' | 'coverage'>('original');
  const [openId, setOpenId] = useState<string | null>(initialSimId || null);
  useEffect(() => register('studio', {
    openSim: id => { if (!SIMS.some(x => x.id === id)) return false; setTab('original'); setOpenId(id); return true; },
    closeSim: () => { setTab('original'); setOpenId(null); },
    showCoverage: () => setTab('coverage'),
  }), []);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200 shadow-inner">
          {([['original', `Notes Maker Simulations (${SIMS.length})`], ['coverage', 'Curriculum Coverage']] as const).map(([k, label]) => (
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

      {tab === 'coverage' ? (
        <CoverageView onOpen={id => { setOpenId(id); setTab('original'); }} />
      ) : tab === 'original' ? (
        <OriginalLibrary
          openId={openId}
          setOpenId={setOpenId}
          notebookContext={notebookContext}
          initialSimId={initialSimId}
          initialValues={initialValues}
        />
      ) : null}
    </div>
  );
}
