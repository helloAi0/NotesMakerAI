import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { register } from './lib/agentBus';
import type { ViewId } from './lib/agentBus';

// Each big screen is its own chunk, downloaded the first time it is opened.
const NotebookWorkspace = lazy(() => import('./components/NotebookWorkspace'));
const PdfSourceLibrary = lazy(() => import('./components/PdfSourceLibrary'));
const VisualsStudio = lazy(() => import('./components/VisualsStudio'));
const AssistantDock = lazy(() => import('./components/AssistantDock'));
const Loading = () => <div className="h-full flex items-center justify-center text-sm text-slate-500 p-8">Loading…</div>;
import { BookOpen, Sparkles, Calendar, FileText, Search, PenTool, LayoutDashboard, Activity, Menu, X } from 'lucide-react';

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTabRaw] = useState('notebook');
  const [menuOpen, setMenuOpen] = useState(false);
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

          <nav className="space-y-2">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-amber-100 text-amber-900' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <LayoutDashboard className="w-5 h-5 text-amber-700"/>
              Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('generator')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'generator' ? 'bg-amber-100 text-amber-900' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <Sparkles className="w-5 h-5 text-amber-700"/>
              AI Note Generator
            </button>
            <button 
              onClick={() => setActiveTab('notebook')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'notebook' ? 'bg-amber-100 text-amber-900' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <PenTool className="w-5 h-5 text-amber-700"/>
              Digital Notebook
            </button>
            <button 
              onClick={() => setActiveTab('simulations')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'simulations' ? 'bg-amber-100 text-amber-900' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <Activity className="w-5 h-5 text-amber-700"/>
              Visuals Studio
            </button>
            <button 
              onClick={() => setActiveTab('planner')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'planner' ? 'bg-amber-100 text-amber-900' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <Calendar className="w-5 h-5 text-amber-700"/>
              Study Planner
            </button>
            <button 
              onClick={() => setActiveTab('library')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'library' ? 'bg-amber-100 text-amber-900' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <FileText className="w-5 h-5 text-amber-700"/>
              PDF & Source Library
            </button>
          </nav>
        </div>

        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200">
          <p className="text-xs font-semibold text-amber-900">System Status</p>
          <p className="text-xs text-amber-700 mt-1">Local Development Mode Active</p>
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
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-amber-50/50 border border-amber-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
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
          <Suspense fallback={<Loading />}>
          {activeTab === 'notebook' && <NotebookWorkspace />}
          
          {activeTab === 'simulations' && (
            <div className="h-full overflow-y-auto p-3 md:p-8 bg-slate-100">
              <VisualsStudio />
            </div>
          )}

          {activeTab === 'library' && <PdfSourceLibrary />}
          </Suspense>
          
          {activeTab !== 'notebook' && activeTab !== 'simulations' && activeTab !== 'library' && (
             <div className="flex-1 flex items-center justify-center h-full bg-slate-100 text-slate-500">
                <div className="text-center">
                  <h2 className="text-xl font-bold mb-2 capitalize">{activeTab} View</h2>
                  <p className="text-sm">This view is currently under construction.</p>
                </div>
             </div>
          )}
        </div>
      </main>
      <Suspense fallback={null}><AssistantDock /></Suspense>
    </div>
  );
}