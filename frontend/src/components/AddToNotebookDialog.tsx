import { useState } from 'react';
import { X, Check, BookOpen, Camera, FileText, Table2, PlayCircle, Sparkles } from 'lucide-react';
import type { AnySim, Readout, Values } from '../sims/types';
import { saveExperimentRecord, type ExperimentRecord, type ExperimentSaveOption } from '../lib/experimentStore';

interface AddToNotebookDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sim: AnySim;
  currentValues: Values;
  readouts: Readout[];
  equations?: string[];
  canvasDataUrl?: string;
  notebookTitle?: string;
  currentPage?: number;
  onNavigateToNotebook?: () => void;
}

export default function AddToNotebookDialog({
  isOpen,
  onClose,
  sim,
  currentValues,
  readouts,
  equations,
  canvasDataUrl,
  notebookTitle = 'Human Anatomy & Physiology Notebook',
  currentPage = 1,
  onNavigateToNotebook,
}: AddToNotebookDialogProps) {
  const [destNotebook, setDestNotebook] = useState(notebookTitle);
  const [destPage, setDestPage] = useState(currentPage);
  const [options, setOptions] = useState<Record<ExperimentSaveOption, boolean>>({
    all: true,
    snapshot: true,
    summary: true,
    results: true,
    interactive: true,
  });
  const [observation, setObservation] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  if (!isOpen) return null;

  const toggleOption = (key: ExperimentSaveOption) => {
    if (key === 'all') {
      const next = !options.all;
      setOptions({
        all: next,
        snapshot: next,
        summary: next,
        results: next,
        interactive: next,
      });
    } else {
      const updated = { ...options, [key]: !options[key] };
      updated.all = updated.snapshot && updated.summary && updated.results && updated.interactive;
      setOptions(updated);
    }
  };

  const handleSave = () => {
    const selectedOptions: ExperimentSaveOption[] = [];
    if (options.snapshot) selectedOptions.push('snapshot');
    if (options.summary) selectedOptions.push('summary');
    if (options.results) selectedOptions.push('results');
    if (options.interactive) selectedOptions.push('interactive');
    if (options.all) selectedOptions.push('all');

    const parameters = sim.params.map(p => ({
      id: p.id,
      label: p.label,
      value: currentValues[p.id],
      unit: p.kind === 'number' ? p.unit : undefined,
    }));

    const savedReadouts = readouts.map(r => ({
      label: r.label,
      value: r.value,
      unit: r.unit,
    }));

    const record: ExperimentRecord = {
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      simId: sim.id,
      simTitle: sim.title,
      subject: sim.subject,
      category: sim.category,
      educationLevels: sim.educationLevels,
      timestamp: new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      notebookTitle: destNotebook,
      pageNumber: Number(destPage),
      snapshotUrl: options.snapshot ? canvasDataUrl : undefined,
      objective: sim.learningObjectives?.[0] || sim.blurb,
      summary: sim.blurb,
      parameters,
      rawValues: { ...currentValues },
      readouts: savedReadouts,
      equations: equations || [],
      observations: observation.trim() || 'Experiment conducted with current parameter configurations.',
      conclusion: `Observed outputs with ${parameters.map(p => `${p.label}: ${p.value}${p.unit ? ` ${p.unit}` : ''}`).slice(0, 3).join(', ')}.`,
      assumptions: sim.assumptions,
      saveOptions: selectedOptions,
    };

    saveExperimentRecord(record);
    setIsSaved(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Add Experiment to Notebook</h3>
              <p className="text-xs text-slate-400">{sim.title} · {sim.subject}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {isSaved ? (
            <div className="text-center py-8 space-y-4">
              <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-100">Experiment Saved to Notebook!</h4>
                <p className="text-slate-400 mt-1">
                  Saved into <strong className="text-amber-300">{destNotebook}</strong> (Page {destPage}).
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium"
                >
                  Stay in Simulation
                </button>
                {onNavigateToNotebook && (
                  <button
                    onClick={() => {
                      onClose();
                      onNavigateToNotebook();
                    }}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-semibold flex items-center gap-2"
                  >
                    View in Notebook <BookOpen className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Destination selector */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-slate-300 font-semibold">Destination Notebook</label>
                  <input
                    type="text"
                    value={destNotebook}
                    onChange={(e) => setDestNotebook(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Page Number</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={destPage}
                    onChange={(e) => setDestPage(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* What to save checklist */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-semibold">Experiment Material to Include</label>
                  <button
                    type="button"
                    onClick={() => toggleOption('all')}
                    className="text-amber-400 hover:underline text-[11px]"
                  >
                    {options.all ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => toggleOption('snapshot')}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                      options.snapshot
                        ? 'bg-amber-500/10 border-amber-500/50 text-amber-200'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400'
                    }`}
                  >
                    <Camera className="w-4 h-4 shrink-0" />
                    <div>
                      <p className="font-semibold text-slate-200">Visual Snapshot</p>
                      <p className="text-[10px] text-slate-400">Live canvas image</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleOption('summary')}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                      options.summary
                        ? 'bg-amber-500/10 border-amber-500/50 text-amber-200'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400'
                    }`}
                  >
                    <FileText className="w-4 h-4 shrink-0" />
                    <div>
                      <p className="font-semibold text-slate-200">Experiment Summary</p>
                      <p className="text-[10px] text-slate-400">Objectives & setup</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleOption('results')}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                      options.results
                        ? 'bg-amber-500/10 border-amber-500/50 text-amber-200'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400'
                    }`}
                  >
                    <Table2 className="w-4 h-4 shrink-0" />
                    <div>
                      <p className="font-semibold text-slate-200">Calculated Results</p>
                      <p className="text-[10px] text-slate-400">Live computed readouts</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleOption('interactive')}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                      options.interactive
                        ? 'bg-amber-500/10 border-amber-500/50 text-amber-200'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400'
                    }`}
                  >
                    <PlayCircle className="w-4 h-4 shrink-0" />
                    <div>
                      <p className="font-semibold text-slate-200">Interactive Simulation</p>
                      <p className="text-[10px] text-slate-400">Reopen with saved params</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Snapshot Preview */}
              {options.snapshot && canvasDataUrl && (
                <div className="space-y-1">
                  <label className="text-slate-400 text-[11px] font-medium">Captured Visual Snapshot</label>
                  <div className="relative aspect-[16/9] w-full max-h-36 rounded-xl overflow-hidden border border-slate-700 bg-slate-950">
                    <img src={canvasDataUrl} alt="Snapshot preview" className="w-full h-full object-contain" />
                  </div>
                </div>
              )}

              {/* Student Observation Input */}
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Student Observation & Lab Takeaways
                </label>
                <textarea
                  rows={2}
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  placeholder="Record what you observed, what surprised you, or your hypothesis test results..."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!isSaved && (
          <div className="px-6 py-3 border-t border-slate-800 bg-slate-900 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              {readouts.length} live outputs · {sim.params.length} parameters captured
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-semibold shadow-md flex items-center gap-2"
              >
                <Check className="w-4 h-4" /> Save to Notebook
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
