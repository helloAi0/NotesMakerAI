import { useState } from 'react';
import {
  Play, Trash2, Camera, Sparkles, BookOpen, Clock, Check, Edit2
} from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { ExperimentRecord } from '../lib/experimentStore';
import { updateExperimentObservation, renameExperimentTitle } from '../lib/experimentStore';

interface ExperimentCardProps {
  record: ExperimentRecord;
  onReopen: (simId: string, rawValues?: Record<string, string | number | boolean>) => void;
  onDelete: (id: string) => void;
}

function KatexEquation({ tex }: { tex: string }) {
  let html = '';
  let failed = false;
  try {
    html = katex.renderToString(tex, { throwOnError: false, displayMode: true });
  } catch {
    failed = true;
  }
  if (failed) return <div className="text-xs font-mono py-1">{tex}</div>;
  return <div className="overflow-x-auto text-xs py-1" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function ExperimentCard({ record, onReopen, onDelete }: ExperimentCardProps) {
  const [observation, setObservation] = useState(record.observations || '');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState(record.simTitle);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const handleObservationBlur = () => {
    updateExperimentObservation(record.id, observation);
    setSaveStatus('Observation saved');
    setTimeout(() => setSaveStatus(null), 2000);
  };

  const handleTitleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      renameExperimentTitle(record.id, title.trim());
      setIsEditingTitle(false);
    }
  };

  const hasSnapshot = record.saveOptions?.includes('snapshot') && record.snapshotUrl;
  const hasResults = record.saveOptions?.includes('results') && record.readouts?.length > 0;
  const hasSummary = record.saveOptions?.includes('summary');
  const hasInteractive = record.saveOptions?.includes('interactive');

  return (
    <div className="bg-white/95 rounded-2xl border-2 border-amber-200/90 shadow-md hover:shadow-lg transition-all overflow-hidden p-6 text-slate-800 space-y-4 font-sans select-text">
      {/* 1. Header Bar */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            {isEditingTitle ? (
              <form onSubmit={handleTitleSubmit} className="flex items-center gap-2">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="px-2 py-1 text-sm font-bold border border-amber-400 rounded-lg focus:outline-none"
                  autoFocus
                />
                <button type="submit" className="text-xs bg-amber-600 text-white px-2 py-1 rounded">Save</button>
              </form>
            ) : (
              <div className="flex items-center gap-1.5">
                <h4 className="text-base font-bold text-slate-900 tracking-tight">{record.simTitle}</h4>
                <button
                  onClick={() => setIsEditingTitle(true)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                  title="Rename experiment"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
              {record.subject}
            </span>
            {record.category && (
              <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                {record.category}
              </span>
            )}
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {record.timestamp}
            </span>
          </div>
          {record.objective && (
            <p className="text-xs text-slate-600 italic">Objective: {record.objective}</p>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {hasInteractive && (
            <button
              onClick={() => onReopen(record.simId, record.rawValues)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 px-3.5 py-1.5 rounded-xl shadow-sm transition-all active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-current" /> Reopen Interactive Sim
            </button>
          )}
          <button
            onClick={() => onDelete(record.id)}
            className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
            title="Remove from notebook"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Visual Snapshot */}
      {hasSnapshot && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
            <Camera className="w-3.5 h-3.5 text-amber-600" />
            <span>Captured Experiment Visualization</span>
          </div>
          <div className="relative aspect-[16/9] w-full max-h-72 rounded-xl overflow-hidden border border-slate-200 bg-slate-950 shadow-inner">
            <img src={record.snapshotUrl} alt={record.simTitle} className="w-full h-full object-contain" />
          </div>
        </div>
      )}

      {/* 3. Setup Parameters Grid */}
      {hasSummary && record.parameters && record.parameters.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Configured Setup Parameters</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {record.parameters.map((p) => (
              <div key={p.id} className="p-2 rounded-lg bg-slate-50 border border-slate-200/70">
                <p className="text-[10px] text-slate-500 truncate">{p.label}</p>
                <p className="text-xs font-mono font-bold text-slate-900">
                  {typeof p.value === 'boolean' ? (p.value ? 'Yes' : 'No') : String(p.value)}
                  {p.unit ? <span className="font-normal text-[10px] text-slate-500"> {p.unit}</span> : null}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Live Calculated Results */}
      {hasResults && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Experimental Results & Calculations</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {record.readouts.map((r, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/80">
                <p className="text-[10px] text-amber-900 font-medium truncate">{r.label}</p>
                <p className="text-sm font-mono font-bold text-slate-900">
                  {typeof r.value === 'number' ? r.value.toFixed(2) : String(r.value)}
                  {r.unit ? <span className="text-[10px] font-normal text-amber-800"> {r.unit}</span> : null}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Scientific Principles & Equations */}
      {record.equations && record.equations.length > 0 && (
        <div className="space-y-1 rounded-xl bg-slate-50 border border-slate-200 p-3">
          <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Scientific Principles & Governing Equations</p>
          {record.equations.map((eq, i) => (
            <KatexEquation key={i} tex={eq} />
          ))}
        </div>
      )}

      {/* 6. Student Observations & Notes */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" /> Student Observations & Notes
          </label>
          {saveStatus && (
            <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
              <Check className="w-3 h-3" /> {saveStatus}
            </span>
          )}
        </div>
        <textarea
          rows={2}
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          onBlur={handleObservationBlur}
          placeholder="Add your experimental observations, analysis, and takeaways here..."
          className="w-full px-3 py-2 text-xs bg-amber-50/30 border border-amber-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
        />
      </div>

      {/* 7. Assumptions & Source Limitations */}
      {record.assumptions && record.assumptions.length > 0 && (
        <div className="pt-2 border-t border-slate-100 flex items-start gap-2 text-[10px] text-slate-400">
          <BookOpen className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
          <span>Assumptions & Model Scope: {record.assumptions.join(' · ')}</span>
        </div>
      )}
    </div>
  );
}
