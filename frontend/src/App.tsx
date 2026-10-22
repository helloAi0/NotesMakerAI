import { useState } from 'react';
import NotebookWorkspace from './components/NotebookWorkspace';
import PdfSourceLibrary from './components/PdfSourceLibrary';
import VisualsStudio from './components/VisualsStudio';
import { BookOpen, Sparkles, Calendar, FileText, Search, PenTool, LayoutDashboard, Activity } from 'lucide-react';

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('notebook');

  return (
    <div className="min-h-screen flex bg-[#fbf9f5] font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-amber-200 bg-white/80 backdrop-blur p-6 flex flex-col justify-between shrink-0 z-50">
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
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Header */}
        <header className="h-20 border-b border-amber-200 bg-white/50 backdrop-blur px-8 flex items-center justify-between shrink-0 z-40">
          <div className="flex items-center gap-4 w-96">
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
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-sm font-medium shadow-sm transition-all"
            >
              <Sparkles className="w-4 h-4"/>
              Explore Simulations
            </button>
          </div>
        </header>

        {/* Render Active View */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'notebook' && <NotebookWorkspace />}
          
          {activeTab === 'simulations' && (
            <div className="h-full overflow-y-auto p-8 bg-slate-100">
              <VisualsStudio />
            </div>
          )}

          {activeTab === 'library' && <PdfSourceLibrary />}
          
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
    </div>
  );
}