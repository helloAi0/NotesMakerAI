import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { register } from './lib/agentBus';
import { touch } from './lib/activity';
import ErrorBoundary from './components/ErrorBoundary';
import { installErrorTracking } from './lib/errors';
import { track } from './lib/analytics';
import { getProfile, checkPin, canOpen } from './lib/platform/profiles';
import type { Profile } from './lib/platform/profiles';
import type { ViewId } from './lib/agentBus';

// Each big screen is its own chunk, downloaded the first time it is opened.
const NotebookWorkspace = lazy(() => import('./components/NotebookWorkspace'));
const PdfSourceLibrary = lazy(() => import('./components/PdfSourceLibrary'));
const VisualsStudio = lazy(() => import('./components/VisualsStudio'));
const AssistantDock = lazy(() => import('./components/AssistantDock'));
const FridayView = lazy(() => import('./components/FridayView'));
const DashboardView = lazy(() => import('./components/DashboardView'));
const PlannerView = lazy(() => import('./components/PlannerView'));
const LectureNotesStudio = lazy(() => import('./components/LectureNotesStudio'));
const PracticeView = lazy(() => import('./components/PracticeView'));
const PlatformView = lazy(() => import('./components/PlatformView'));
const StudioView = lazy(() => import('./components/StudioView'));
const TeachView = lazy(() => import('./components/TeachView'));
const ProgressView = lazy(() => import('./components/ProgressView'));
const GeneratorView = lazy(() => import('./components/GeneratorView'));
const SettingsModal = lazy(() => import('./components/SettingsModal'));
const SearchPalette = lazy(() => import('./components/SearchPalette'));
function TeachGate({ children }: { children: React.ReactNode }) {
  const p = getProfile(); const [ok, setOk] = useState(() => { try { return !p?.pin || sessionStorage.getItem('nm_teach_ok') === '1'; } catch { return !p?.pin; } }); const [pin, setPin] = useState(''); const [bad, setBad] = useState(false);
  if (ok) return <>{children}</>;
  return <div className="h-full flex items-center justify-center p-6 bg-slate-100"><form className="bg-white border rounded-2xl p-6 max-w-sm w-full text-center space-y-3" data-testid="teach-gate" onSubmit={async e => { e.preventDefault(); if (await checkPin(p as Profile, pin)) { try { sessionStorage.setItem('nm_teach_ok', '1'); } catch { /* ignore */ } setOk(true); } else setBad(true); }}>
    <h2 className="font-bold">Teacher area</h2><p className="text-sm text-slate-600">Enter your PIN. (A convenience lock on this device, not account security.)</p>
    <input value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setBad(false); }} inputMode="numeric" type="password" aria-label="PIN" className="border rounded px-3 py-2 w-full text-center" data-testid="teach-pin" />{bad && <div className="text-xs text-red-700" role="alert">Wrong PIN.</div>}<button className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold">Open</button></form></div>;
}
function StartBanner({ go }: { go: (v: string) => void }) {
  const t = useT();
  const [show, setShow] = useState(() => { try { return localStorage.getItem('nm_tour_done') !== '1'; } catch { return false; } });
  if (!show) return null; const done = () => { try { localStorage.setItem('nm_tour_done', '1'); } catch { /* ignore */ } setShow(false); };
  return <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs flex items-center gap-3 flex-wrap" role="region" aria-label="Getting started" data-testid="start-banner"><span className="flex-1"><b>{t('New here?')}</b> {t('Reach your first quiz in 2 minutes: paste notes or drop a PDF, get flashcards, then take a quiz.')}</span>
    <button className="px-3 py-1 rounded bg-amber-600 text-white font-semibold" data-testid="start-go" onClick={() => { done(); go('friday'); setTimeout(() => window.dispatchEvent(new CustomEvent('nm:friday-tab', { detail: 'class' })), 300); }}>{t('Start')}</button><button className="underline" onClick={() => { done(); go('practice'); }}>{t('Try a simulation prediction')}</button><button className="underline text-slate-500" onClick={done} data-testid="start-dismiss">{t('Dismiss')}</button></div>;
}
initLang();
const Loading = () => <div className="h-full flex items-center justify-center text-sm text-slate-500 p-8">Loading…</div>;
import { useT, UI_LANGS, getUiLang, setUiLang, initLang } from './lib/i18n';
import { BookOpen, Sparkles, Calendar, FileText, Search, PenTool, LayoutDashboard, Activity, Menu, X, Bot, Settings, Wifi, WifiOff, Clapperboard, Target, TrendingUp, GraduationCap, Rocket } from 'lucide-react';

const NAV: [ViewId, string, typeof BookOpen][] = [['dashboard', 'Dashboard', LayoutDashboard], ['friday', 'FRIDAY Assistant', Bot], ['generator', 'AI Note Generator', Sparkles], ['notebook', 'Digital Notebook', PenTool], ['lecture', 'Lecture to Notes', Clapperboard], ['simulations', 'Visuals Studio', Activity], ['planner', 'Study Planner', Calendar], ['library', 'PDF & Source Library', FileText], ['practice', 'Practice', Target], ['progress', 'My Progress', TrendingUp], ['teach', 'Teach', GraduationCap], ['studio', 'Study Studio', Sparkles], ['platform', 'Platform', Rocket]];

export default function App() {
  const t = useT();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTabRaw] = useState('notebook');
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const viewRef = useRef(activeTab); useEffect(() => { viewRef.current = activeTab; }, [activeTab]);
  useEffect(() => { let stop = () => {}; let dead = false; let has = false; try { has = !!localStorage.getItem('nm_server_session'); } catch { /* ignore */ } if (!has) return; void Promise.all([import('./lib/study/inboxSync'), import('./lib/planner')]).then(([m, p]) => { if (!dead) stop = m.startInboxSync(t => p.addTask(t), p.listTasks); }).catch(() => {}); return () => { dead = true; stop(); }; }, []);
  useEffect(() => { installErrorTracking(() => viewRef.current); track('session_start'); void import('./lib/platform/boot').then(m => m.bootPlatform()).catch(() => {}); touch(); const on = () => setOnline(true), off = () => setOnline(false); window.addEventListener('online', on); window.addEventListener('offline', off); const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); } }; window.addEventListener('keydown', k); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.removeEventListener('keydown', k); }; }, []);
  const setActiveTab = (t: string) => { setActiveTabRaw(t); setMenuOpen(false); };
  useEffect(() => { const h = (e: Event) => { const v = (e as CustomEvent<string>).detail; if (typeof v === 'string') setActiveTabRaw(v); }; window.addEventListener('nm:go', h); return () => window.removeEventListener('nm:go', h); }, []);
  const [role, setRole] = useState(() => getProfile()?.role ?? null); useEffect(() => { const h = () => setRole(getProfile()?.role ?? null); window.addEventListener('nm:profile', h); return () => window.removeEventListener('nm:profile', h); }, []);
  useEffect(() => register('app', { view: () => viewRef.current as ViewId, navigate: v => { setActiveTabRaw(v); setMenuOpen(false); } }), []);

  return (
    <div className="min-h-screen flex bg-[#fbf9f5] font-sans">
      {menuOpen && <div className="fixed inset-0 bg-slate-900/40 z-40 md:hidden" onClick={() => setMenuOpen(false)} />}
      {/* Sidebar Navigation: a slide-in drawer on phones, fixed column from md up */}
      <aside className={`fixed md:static inset-y-0 left-0 w-64 max-w-[80vw] border-r border-amber-200 bg-white md:bg-white/80 md:backdrop-blur p-6 flex flex-col justify-between shrink-0 z-50 overflow-y-auto transition-transform duration-200 ${menuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div>
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-amber-600 text-white rounded-xl shadow-md">
              <BookOpen className="w-6 h-6"/>
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight text-slate-800">Notes Maker AI</h1>
              <p className="text-xs text-amber-700 font-medium">{t('Learn Anything. See Everything.')}</p>
            </div>
          </div>

          <nav className="space-y-2" aria-label="Main">
            {NAV.filter(([id]) => canOpen(role, id)).map(([id, name, Icon]) => (
              <button key={id} data-testid={`nav-${id}`} onClick={() => setActiveTab(id)} aria-current={activeTab === id ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === id ? 'bg-amber-100 text-amber-900' : 'text-slate-600 hover:bg-slate-100'}`}>
                <Icon className="w-5 h-5 text-amber-700"/>{t(name)}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200">
          <p className="text-xs font-semibold text-amber-900 flex items-center gap-1">{online ? <Wifi className="w-3 h-3"/> : <WifiOff className="w-3 h-3"/>} {online ? t('Online') : t('Offline')}</p>
          <p className="text-xs text-amber-700 mt-1">{online ? t('Works offline too: data stays on this device.') : t('Offline mode — all core features work.')}</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        {/* Top Header */}
        <header className="h-14 md:h-20 border-b border-amber-200 bg-white/50 backdrop-blur px-3 md:px-8 flex items-center justify-between gap-2 shrink-0 z-30">
          <button aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen(o => !o)} className="md:hidden p-2 rounded-lg border border-amber-200 bg-white text-amber-800">
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="hidden sm:flex items-center gap-4 w-full max-w-sm md:w-96">
            <div className="relative w-full">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400"/>
              <input 
                type="text"
                placeholder={t('Search topics, notes, or simulations...')}
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)} aria-label="Search (Ctrl+K)" data-testid="header-search"
                className="w-full pl-10 pr-4 py-2 bg-amber-50/50 border border-amber-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <button onClick={() => setSearchOpen(true)} aria-label="Search" className="sm:hidden p-2 rounded-lg border border-amber-200 bg-white text-amber-800"><Search className="w-4 h-4"/></button>
            <select value={getUiLang()} onChange={e => setUiLang(e.target.value)} aria-label="App language" data-testid="ui-lang" className="border border-amber-200 rounded-lg bg-white text-amber-900 text-xs py-2 px-1 max-w-24">{UI_LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
            <button onClick={() => window.dispatchEvent(new Event('nm:open-settings'))} aria-label="Settings" title="Settings (AI key, backup)" data-testid="open-settings" className="p-2 rounded-lg border border-amber-200 bg-white text-amber-800 hover:bg-amber-50"><Settings className="w-4 h-4"/></button>
            <button 
              onClick={() => setActiveTab('simulations')}
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-medium shadow-sm transition-all"
            >
              <Sparkles className="w-4 h-4"/>
              <span className="hidden xs:inline sm:inline">{t('Explore Simulations')}</span><span className="sm:hidden">{t('Sims')}</span>
            </button>
          </div>
        </header>

        <StartBanner go={setActiveTab} />
        {/* Render Active View */}
        <div className="flex-1 overflow-hidden">
          <ErrorBoundary resetKey={activeTab}>
          <Suspense fallback={<Loading />}>
            {activeTab === 'dashboard' && <DashboardView go={setActiveTab as (v: ViewId) => void} />}
            {activeTab === 'friday' && <FridayView />}
            {activeTab === 'generator' && <GeneratorView />}
            {activeTab === 'notebook' && <NotebookWorkspace />}
            {activeTab === 'lecture' && <LectureNotesStudio />}
            {activeTab === 'simulations' && (
              <div className="h-full overflow-y-auto p-3 md:p-8 bg-slate-100">
                <VisualsStudio />
              </div>
            )}
            {activeTab === 'planner' && <PlannerView />}
            {activeTab === 'practice' && <PracticeView />}
            {activeTab === 'progress' && <ProgressView />}
            {activeTab === 'teach' && <TeachGate><TeachView /></TeachGate>}
            {activeTab === 'platform' && <PlatformView />}
            {activeTab === 'studio' && <StudioView />}
            {activeTab === 'library' && <PdfSourceLibrary />}
          </Suspense>
          </ErrorBoundary>
        </div>
      </main>
      <Suspense fallback={null}><AssistantDock hidden={activeTab === 'friday'} /><SettingsModal /><SearchPalette open={searchOpen} onClose={() => { setSearchOpen(false); setSearchQuery(''); }} initial={searchQuery} /></Suspense>
    </div>
  );
}