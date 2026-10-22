import { useState } from 'react';
import { Sparkles, BookOpen, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';

interface AIGeneratorViewProps {
  onNotesGenerated: (notesData: any) => void;
}

export default function AIGeneratorView({ onNotesGenerated }: AIGeneratorViewProps) {
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState('College');
  const [style, setStyle] = useState('Detailed Textbook');
  const [loading, setLoading] = useState(false);
  const [outline, setOutline] = useState<string[] | null>(null);

  const handleGenerateOutline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/ai/outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, level, style })
      });
      const data = await res.json();
      setOutline(data.outline);
    } catch (err) {
      // Fallback outline if backend is offline
      setOutline([
        `1. Introduction to ${topic}`,
        `2. Core Theoretical Foundations`,
        `3. Mathematical Analysis & Formulas`,
        `4. Practical Applications & Examples`,
        `5. Chapter Summary & Quiz`
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptOutline = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/ai/generate-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, level, style })
      });
      const data = await res.json();
      onNotesGenerated(data);
    } catch (err) {
      onNotesGenerated({
        title: topic,
        level,
        style,
        sections: [
          { heading: `Introduction to ${topic}`, content: "Generated study notes content based on local fallback." }
        ]
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 bg-[#fbf9f5] p-10 overflow-y-auto">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm mb-1">
            <Sparkles className="w-4 h-4" /> Phase 4 AI Study Generator
          </div>
          <h1 className="text-3xl font-bold text-slate-800">Generate Structured Study Notes</h1>
          <p className="text-slate-600 text-sm mt-1">Enter any topic and customize your learning level and note style.</p>
        </div>

        {/* Generator Form */}
        <form onSubmit={handleGenerateOutline} className="bg-white p-8 rounded-2xl border border-amber-200 shadow-sm space-y-6">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Topic or Subject Question</label>
            <input 
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Isaac Newton and Universal Gravitation or Quantum Superposition"
              className="w-full px-4 py-3 bg-amber-50/40 border border-amber-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Learning Level</label>
              <select 
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full px-4 py-3 bg-amber-50/40 border border-amber-200 rounded-xl text-sm focus:outline-none"
              >
                <option value="Beginner">Beginner / Elementary</option>
                <option value="School">High School Level</option>
                <option value="College">College / Undergraduate</option>
                <option value="Advanced">Advanced / Research</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Note Style</label>
              <select 
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full px-4 py-3 bg-amber-50/40 border border-amber-200 rounded-xl text-sm focus:outline-none"
              >
                <option value="Detailed Textbook">Detailed Textbook Notes</option>
                <option value="Concise Revision">Concise Revision Sheet</option>
                <option value="Cornell Notes">Cornell Notes Format</option>
                <option value="Exam Prep">Exam Preparation Guide</option>
              </select>
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3.5 rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generate Topic Outline
          </button>
        </form>

        {/* Generated Outline Preview */}
        {outline && (
          <div className="bg-white p-8 rounded-2xl border border-amber-200 shadow-sm space-y-6 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-600" /> Proposed Topic Outline
              </h3>
              <span className="text-xs bg-amber-100 text-amber-800 font-semibold px-3 py-1 rounded-full">
                {level} • {style}
              </span>
            </div>

            <div className="space-y-3">
              {outline.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-amber-50/50 rounded-xl border border-amber-100 text-sm font-medium text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                  {item}
                </div>
              ))}
            </div>

            <button 
              onClick={handleAcceptOutline}
              disabled={loading}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3.5 rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              Create Notebook from Outline
            </button>
          </div>
        )}
      </div>
    </div>
  );
}