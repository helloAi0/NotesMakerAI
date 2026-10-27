import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { register } from './lib/agentBus';
import { touch } from './lib/activity';
import ErrorBoundary from './components/ErrorBoundary';
import type { ViewId } from './lib/agentBus';

// Each big screen is its own chunk, downloaded the first time it is opened.
const NotebookWorkspace = lazy(() => import('./components/NotebookWorkspace'));
const PdfSourceLibrary = lazy(() => import('./components/PdfSourceLibrary'));
const VisualsStudio = lazy(() => import('./components/VisualsStudio'));
const AssistantDock = lazy(() => import('./components/AssistantDock'));
const FridayView = lazy(() => import('./components/FridayView'));
const DashboardView = lazy(() => import('./components/DashboardView'));
const PlannerView = lazy(() => import('./components/PlannerView'));
const GeneratorView = lazy(() => import('./components/GeneratorView'));
const SettingsModal = lazy(() => import('./components/SettingsModal'));
const SearchPalette = lazy(() => import('./components/SearchPalette'));
const Loading = () => <div className="h-full flex items-center justify-center text-sm text-slate-500 p-8">Loading…</div>;
import { BookOpen, Sparkles, Calendar, FileText, Search, PenTool, LayoutDashboard, Activity, Menu, X, Bot, Settings, Wifi, WifiOff } from 'lucide-react';

const NAV: [ViewId, string, typeof BookOpen][] = [['dashboard', 'Dashboard', LayoutDashboard], ['friday', 'FRIDAY Assistant', Bot], ['generator', 'AI Note Generator', Sparkles], ['notebook', 'Digital Notebook', PenTool], ['simulations', 'Visuals Studio', Activity], ['planner', 'Study Planner', Calendar], ['library', 'PDF & Source Library', FileText]];

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTabRaw] = useState('notebook');
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => { touch(); const on = () => setOnline(true), off = () => setOnline(false); window.addEventListener('online', on); window.addEventListener('offline', off); const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); } }; window.addEventListener('keydown', k); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.removeEventListener('keydown', k); }; }, []);
  const setActiveTab = (t: string) => { setActiveTabRaw(t); setMenuOpen(false); };
  const viewRef = useRef(activeTab); viewRef.current = activeTab;
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
              <p className="text-xs text-amber-700 font-medium">Learn Anything. See Everything.</p>
            </div>
          </div>

          <nav className="space-y-2" aria-label="Main">
            {NAV.map(([id, name, Icon]) => (
              <button key={id} data-testid={`nav-${id}`} onClick={() => setActiveTab(id)} aria-current={activeTab === id ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === id ? 'bg-amber-100 text-amber-900' : 'text-slate-600 hover:bg-slate-100'}`}>
                <Icon className="w-5 h-5 text-amber-700"/>{name}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200">
          <p className="text-xs font-semibold text-amber-900 flex items-center gap-1">{online ? <Wifi className="w-3 h-3"/> : <WifiOff className="w-3 h-3"/>} {online ? 'Online' : 'Offline'}</p>
          <p className="text-xs text-amber-700 mt-1">{online ? 'Works offline too: data stays on this device.' : 'Offline mode — all core features work.'}</p>
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
                placeholder="Search topics, notes, or simulations..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)} aria-label="Search (Ctrl+K)" data-testid="header-search"
                className="w-full pl-10 pr-4 py-2 bg-amber-50/50 border border-amber-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <button onClick={() => setSearchOpen(true)} aria-label="Search" className="sm:hidden p-2 rounded-lg border border-amber-200 bg-white text-amber-800"><Search className="w-4 h-4"/></button>
            <button onClick={() => window.dispatchEvent(new Event('nm:open-settings'))} aria-label="Settings" title="Settings (AI key, backup)" data-testid="open-settings" className="p-2 rounded-lg border border-amber-200 bg-white text-amber-800 hover:bg-amber-50"><Settings className="w-4 h-4"/></button>
            <button 
              onClick={() => setActiveTab('simulations')}
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-medium shadow-sm transition-all"
            >
              <Sparkles className="w-4 h-4"/>
              <span className="hidden xs:inline sm:inline">Explore Simulations</span><span className="sm:hidden">Sims</span>
            </button>
          </div>
        </header>

        {/* Render Active View */}
        <div className="flex-1 overflow-hidden">
          <ErrorBoundary resetKey={activeTab}>
          <Suspense fallback={<Loading />}>
            {activeTab === 'dashboard' && <DashboardView go={setActiveTab as (v: ViewId) => void} />}
            {activeTab === 'friday' && <FridayView />}
            {activeTab === 'generator' && <GeneratorView />}
            {activeTab === 'notebook' && <NotebookWorkspace />}
            {activeTab === 'simulations' && (
              <div className="h-full overflow-y-auto p-3 md:p-8 bg-slate-100">
                <VisualsStudio />
              </div>
            )}
            {activeTab === 'planner' && <PlannerView />}
            {activeTab === 'library' && <PdfSourceLibrary />}
          </Suspense>
          </ErrorBoundary>
        </div>
      </main>
      <Suspense fallback={null}><AssistantDock hidden={activeTab === 'friday'} /><SettingsModal /><SearchPalette open={searchOpen} onClose={() => { setSearchOpen(false); setSearchQuery(''); }} initial={searchQuery} /></Suspense>
    </div>
  );
}