import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Pause, Play, RotateCcw, StepForward, Camera, Download,
  Sparkles, Send, Table2, Loader2, BookOpen, ChevronRight, Info, CheckCircle2, Layers
} from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { AnySim, Readout, Values } from '../sims/types';
import { defaultsOf } from '../sims/types';
import { generate, loadProvider, loadSaved, loadSpeed, friendlyError } from '../lib/aiClient';
import MarkdownView from './MarkdownView';
import AddToNotebookDialog from './AddToNotebookDialog';
import DerivationViewer from './DerivationViewer';

const fmtVal = (r: Readout) => {
  if (typeof r.value === 'string') return r.value;
  if (!Number.isFinite(r.value)) return '-';
  const d = r.digits ?? 2;
  const a = Math.abs(r.value);
  return a !== 0 && (a >= 1e6 || a < 1e-3) ? r.value.toExponential(2) : r.value.toFixed(d);
};

function Tex({ src }: { src: string }) {
  const html = useMemo(() => {
    try { return katex.renderToString(src, { throwOnError: false, displayMode: true }); } catch { return src; }
  }, [src]);
  return <div className="overflow-x-auto text-slate-800" dangerouslySetInnerHTML={{ __html: html }} />;
}

interface Row { t: number; vals: Readout[] }

export interface SimPlayerProps {
  sim: AnySim;
  onBack: () => void;
  initialValues?: Values;
  notebookContext?: {
    notebookTitle?: string;
    pageNumber?: number;
    onBackToNotebook?: () => void;
  };
}

export default function SimPlayer({ sim, onBack, initialValues, notebookContext }: SimPlayerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 700, h: 440 });
  const stateRef = useRef<unknown>(null);
  
  const mergedDefaults = useMemo(() => {
    const def = defaultsOf(sim.params);
    return initialValues ? { ...def, ...initialValues } : def;
  }, [sim, initialValues]);

  const valsRef = useRef<Values>(mergedDefaults);
  const playRef = useRef(true);
  const speedRef = useRef(1);
  const simTime = useRef(0);

  const [vals, setVals] = useState<Values>(mergedDefaults);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [reads, setReads] = useState<Readout[]>([]);
  const [eqs, setEqs] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [snapshotUrl, setSnapshotUrl] = useState<string | undefined>(undefined);
  const [showTheory, setShowTheory] = useState(false);
  const [showDerivation, setShowDerivation] = useState(Boolean(sim.derivation));
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  const handleDerivationAddToNotebook = (derivationText: string) => {
    const title = notebookContext?.notebookTitle || 'Digital Notebook';
    const page = notebookContext?.pageNumber || 1;
    try {
      const key = `notesmaker_text_${title}`;
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      const cur = saved[page] || '';
      saved[page] = cur ? `${cur}\n\n${derivationText}` : derivationText;
      localStorage.setItem(key, JSON.stringify(saved));
    } catch (e) {
      void e;
    }
  };

  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const [aiErr, setAiErr] = useState('');

  const rebuild = useCallback(() => {
    stateRef.current = sim.init(valsRef.current);
    simTime.current = 0;
  }, [sim]);

  // reset on sim change
  useEffect(() => {
    valsRef.current = mergedDefaults;
    rebuild();
  }, [mergedDefaults, rebuild]);

  useEffect(() => { playRef.current = playing; }, [playing]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  // canvas sizing
  useEffect(() => {
    const el = wrapRef.current, cv = cvRef.current;
    if (!el || !cv) return;
    const fit = () => {
      const w = Math.max(280, Math.floor(el.clientWidth));
      const h = Math.round(Math.min(560, Math.max(300, w * 0.62)));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      sizeRef.current = { w, h };
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.height = `${h}px`;
      cv.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // main loop
  useEffect(() => {
    let raf = 0, last = performance.now(), acc = 0, uiT = 0;
    const dt = sim.dt ?? 1 / 240;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const cv = cvRef.current;
      const s = stateRef.current;
      if (!cv || s == null) return;
      const frame = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (playRef.current) {
        acc += frame * speedRef.current;
        let n = 0;
        while (acc >= dt && n < 400) {
          sim.step(s, valsRef.current, dt);
          simTime.current += dt;
          acc -= dt;
          n++;
        }
        if (n === 400) acc = 0;
      }
      const c = cv.getContext('2d');
      if (c) sim.draw(c, s, valsRef.current, sizeRef.current.w, sizeRef.current.h);
      if (now - uiT > 120) {
        uiT = now;
        setReads(sim.readouts(s, valsRef.current));
        if (sim.equations) setEqs(sim.equations(s, valsRef.current));
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sim]);

  const setParam = (id: string, v: number | string | boolean, resets?: boolean) => {
    valsRef.current = { ...valsRef.current, [id]: v };
    setVals(valsRef.current);
    if (resets) rebuild();
  };

  const stepOnce = () => {
    const s = stateRef.current;
    if (s == null) return;
    const dt = sim.dt ?? 1 / 240;
    for (let i = 0; i < 12; i++) { sim.step(s, valsRef.current, dt); simTime.current += dt; }
  };

  const point = (e: React.PointerEvent<HTMLCanvasElement>, kind: 'down' | 'move' | 'up') => {
    if (!sim.pointer || stateRef.current == null) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (kind === 'down') e.currentTarget.setPointerCapture(e.pointerId);
    sim.pointer(stateRef.current, valsRef.current, { kind, x: e.clientX - r.left, y: e.clientY - r.top, w: sizeRef.current.w, h: sizeRef.current.h });
  };

  const record = () => setRows(r => [...r.slice(-199), { t: simTime.current, vals: sim.readouts(stateRef.current, valsRef.current) }]);
  const csv = () => {
    if (!rows.length) return;
    const head = ['time_s', ...rows[0].vals.map(v => `${v.label}${v.unit ? ` (${v.unit})` : ''}`)];
    const body = rows.map(r => [r.t.toFixed(3), ...r.vals.map(v => (typeof v.value === 'number' ? String(v.value) : `"${v.value}"`))].join(','));
    const blob = new Blob([[head.map(h => `"${h}"`).join(','), ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${sim.id}-data.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const png = () => {
    cvRef.current?.toBlob(b => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `${sim.id}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  };

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || asking) return;
    const provider = loadProvider();
    const saved = loadSaved(provider, (import.meta.env.VITE_GEMINI_API_KEY as string) || '');
    if (!saved.apiKey) {
      setAiErr('Add an AI key first: open the PDF Library tab, choose a provider and save a key. The tutor uses the same key.');
      return;
    }
    setAiErr('');
    setAnswer('');
    setAsking(true);
    const state = reads.map(r => `${r.label} = ${fmtVal(r)}${r.unit ? ' ' + r.unit : ''}`).join('; ');
    const params = sim.params.map(p => `${p.label} = ${String(vals[p.id])}`).join('; ');
    const prompt = `You are a friendly physics/science tutor inside an interactive simulation.
Simulation: ${sim.title}. ${sim.hint}
Current settings: ${params}.
Live readings: ${state}.
Student asks: ${text}
Answer in at most 180 words, referring to the actual numbers above. Use LaTeX with $...$ for formulas. If useful, suggest one specific slider change to try.`;
    try {
      const out = await generate(
        { provider, apiKey: saved.apiKey, model: saved.model, baseUrl: saved.baseUrl, speed: loadSpeed() },
        prompt,
        { maxTokens: 700, onText: setAnswer, timeoutMs: 30000 },
      );
      setAnswer(out);
    } catch (e) {
      setAiErr(friendlyError(e));
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="w-full">
      {/* 1. Breadcrumb navigation */}
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
        <button onClick={onBack} className="hover:text-amber-600 transition-colors font-medium">
          Visuals Studio
        </button>
        <ChevronRight className="w-3 h-3 text-slate-400" />
        <span>{sim.subject}</span>
        <ChevronRight className="w-3 h-3 text-slate-400" />
        <span className="font-semibold text-slate-800">{sim.title}</span>
      </div>

      {/* 2. Top action navigation bar */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Simulation Library
          </button>
          {notebookContext?.onBackToNotebook && (
            <button
              onClick={notebookContext.onBackToNotebook}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg border border-amber-300 shadow-sm transition-all"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-700" /> Back to Notebook (p. {notebookContext.pageNumber ?? 1})
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {sim.derivation && (
            <button
              onClick={() => setShowDerivation(!showDerivation)}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                showDerivation
                  ? 'bg-amber-100 border-amber-400 text-amber-900 shadow-sm'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-amber-600" />
              <span>{showDerivation ? 'Derivation Studio Active' : 'Show 3-Panel Derivation'}</span>
            </button>
          )}
          <button
            onClick={() => setShowTheory(!showTheory)}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
              showTheory
                ? 'bg-blue-50 border-blue-300 text-blue-900'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Info className="w-3.5 h-3.5" /> Objectives & Theory
          </button>
          <button
            onClick={() => {
              const url = cvRef.current?.toDataURL('image/png');
              setSnapshotUrl(url);
              setShowAddModal(true);
            }}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 px-4 py-1.5 rounded-lg shadow-sm transition-all active:scale-95"
          >
            <Sparkles className="w-4 h-4" /> Add to Notebook
          </button>
        </div>
      </div>

      {/* 3. Title & metadata */}
      <div className="flex items-center gap-2.5 flex-wrap mb-1">
        <h2 className="text-xl font-bold text-slate-900 leading-tight">{sim.title}</h2>
        <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
          {sim.subject}
        </span>
        {sim.difficulty && (
          <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
            {sim.difficulty}
          </span>
        )}
        {sim.category && (
          <span className="text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
            {sim.category}
          </span>
        )}
        {sim.educationLevels && sim.educationLevels.length > 0 && (
          <span className="text-[10px] font-normal text-slate-500">
            Levels: {sim.educationLevels.join(', ')}
          </span>
        )}
      </div>

      <p className="text-xs text-slate-600 mb-3 max-w-3xl leading-relaxed">{sim.blurb}</p>

      {/* Learning Objectives Drawer */}
      {showTheory && (
        <div className="mb-4 p-4 rounded-xl border border-blue-200 bg-blue-50/50 space-y-2 animate-in fade-in">
          {sim.learningObjectives && sim.learningObjectives.length > 0 && (
            <div>
              <p className="text-xs font-bold text-blue-900 uppercase tracking-wide mb-1">Learning Objectives</p>
              <ul className="space-y-1">
                {sim.learningObjectives.map((obj, idx) => (
                  <li key={idx} className="text-xs text-slate-700 flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                    <span>{obj}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {sim.assumptions && sim.assumptions.length > 0 && (
            <div className="pt-2 border-t border-blue-200">
              <p className="text-[11px] font-bold text-blue-900 uppercase tracking-wide mb-1">Model Assumptions & Limitations</p>
              <ul className="list-disc list-inside text-[11px] text-slate-600 space-y-0.5">
                {sim.assumptions.map((assump, idx) => (
                  <li key={idx}>{assump}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 3-PART VISUAL LEARNING STUDIO LAYOUT: PANEL 1 (Derivation) - PANEL 2 (Animation Canvas) - PANEL 3 (Parameters & Measurements) */}
      <div className={`grid gap-4 ${
        showDerivation && sim.derivation
          ? 'grid-cols-1 lg:grid-cols-[330px_minmax(0,1fr)_280px]'
          : 'grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]'
      }`}>
        {/* PANEL 1: Step-by-Step Mathematical Derivation Engine */}
        {showDerivation && sim.derivation && (
          <div className="rounded-2xl overflow-hidden border border-slate-800 shadow-xl bg-slate-900 min-h-[580px] max-h-[780px] flex flex-col">
            <DerivationViewer
              plan={sim.derivation}
              activeStepIndex={activeStepIndex}
              onStepChange={setActiveStepIndex}
              onAddToNotebook={handleDerivationAddToNotebook}
            />
          </div>
        )}

        {/* PANEL 2: Interactive Animation Canvas & Controls */}
        <div className="min-w-0">
          <div ref={wrapRef} className="rounded-xl overflow-hidden border border-slate-200 bg-slate-950">
            <canvas
              ref={cvRef}
              className="block w-full touch-none"
              style={{ cursor: sim.pointer ? 'crosshair' : 'default' }}
              onPointerDown={e => point(e, 'down')}
              onPointerMove={e => point(e, 'move')}
              onPointerUp={e => point(e, 'up')}
              onPointerCancel={e => point(e, 'up')}
            />
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button onClick={() => setPlaying(p => !p)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-semibold">
              {playing ? <Pause size={15} /> : <Play size={15} />} {playing ? 'Pause' : 'Play'}
            </button>
            <button onClick={stepOnce} disabled={playing} title="Advance a few milliseconds" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm disabled:opacity-40">
              <StepForward size={15} /> Step
            </button>
            <button onClick={rebuild} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm">
              <RotateCcw size={15} /> Restart
            </button>
            {sim.actions?.map(a => (
              <button key={a.id} onClick={() => { if (stateRef.current == null) return; sim.action?.(stateRef.current, valsRef.current, a.id); valsRef.current = { ...valsRef.current }; setVals(valsRef.current); }} className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold">
                {a.label}
              </button>
            ))}
            <div className="flex items-center gap-1 ml-auto">
              {[0.25, 0.5, 1, 2, 4].map(s => (
                <button key={s} onClick={() => setSpeed(s)} className={`px-2 py-1.5 rounded-md text-xs font-medium border ${speed === s ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300'}`}>
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {sim.pointer && <p className="text-xs text-slate-500 mt-2">Tip: you can drag things directly on the canvas.</p>}

          {eqs.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Live equations</p>
              {eqs.map((e, i) => <Tex key={i} src={e} />)}
            </div>
          )}

          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={15} className="text-amber-500" />
              <p className="text-sm font-semibold text-slate-800">Ask the AI tutor about what you see</p>
            </div>
            <div className="flex gap-2">
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && ask(q)}
                placeholder="e.g. Why did the range change when I raised the angle?"
                className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-800"
              />
              <button onClick={() => ask(q)} disabled={asking || !q.trim()} className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm disabled:opacity-40 inline-flex items-center gap-1.5">
                {asking ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Ask
              </button>
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {['Explain what is happening right now', 'What should I try next?', 'Give me a quiz question about this'].map(s => (
                <button key={s} onClick={() => { setQ(s); ask(s); }} className="text-xs px-2.5 py-1 rounded-full border border-slate-300 text-slate-600 bg-white hover:bg-slate-50">{s}</button>
              ))}
            </div>
            {aiErr && <p className="text-xs text-red-500 mt-2">{aiErr}</p>}
            {answer && <div className="mt-2"><MarkdownView text={answer} /></div>}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Controls</p>
            <div className="space-y-3">
              {sim.params.map(p => {
                if (p.kind === 'number') {
                  const v = vals[p.id] as number;
                  return (
                    <div key={p.id}>
                      <div className="flex justify-between text-xs text-slate-600 mb-1">
                        <span>{p.label}</span>
                        <span className="font-mono text-slate-800">{v.toFixed(p.digits ?? (p.step < 1 ? 2 : 0))}{p.unit ? ` ${p.unit}` : ''}</span>
                      </div>
                      <input type="range" min={p.min} max={p.max} step={p.step} value={v} onChange={e => setParam(p.id, parseFloat(e.target.value), p.resetOnChange)} className="w-full accent-amber-500" />
                      {p.help && <p className="text-[11px] text-slate-400 mt-0.5">{p.help}</p>}
                    </div>
                  );
                }
                if (p.kind === 'select') {
                  return (
                    <div key={p.id}>
                      <label className="text-xs text-slate-600 block mb-1">{p.label}</label>
                      <select value={vals[p.id] as string} onChange={e => setParam(p.id, e.target.value, p.resetOnChange)} className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-800">
                        {p.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  );
                }
                return (
                  <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={vals[p.id] as boolean} onChange={e => setParam(p.id, e.target.checked, p.resetOnChange)} className="accent-amber-500" />
                    {p.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Live readings</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {reads.map(r => (
                <div key={r.label}>
                  <p className="text-[11px] text-slate-500 leading-tight">{r.label}</p>
                  <p className="text-sm font-mono font-semibold text-slate-900">{fmtVal(r)}{r.unit ? <span className="text-[11px] font-normal text-slate-500"> {r.unit}</span> : null}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              <button onClick={() => { record(); setShowLog(true); }} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700"><Table2 size={13} /> Record row</button>
              <button onClick={png} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700"><Camera size={13} /> Save image</button>
            </div>
          </div>

          {showLog && (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Data log ({rows.length})</p>
                <div className="flex gap-2">
                  <button onClick={csv} disabled={!rows.length} className="inline-flex items-center gap-1 text-xs text-blue-600 disabled:opacity-40"><Download size={12} /> CSV</button>
                  <button onClick={() => setRows([])} className="text-xs text-slate-500">Clear</button>
                </div>
              </div>
              <div className="max-h-48 overflow-auto text-[11px]">
                {rows.length === 0 ? <p className="text-slate-400">Press "Record row" to capture the current numbers.</p> : (
                  <table className="min-w-full">
                    <thead><tr className="text-left text-slate-500"><th className="pr-2">t</th>{rows[0].vals.map(v => <th key={v.label} className="pr-2 font-medium">{v.label}</th>)}</tr></thead>
                    <tbody>{rows.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100 text-slate-700">
                        <td className="pr-2 font-mono">{r.t.toFixed(2)}</td>
                        {r.vals.map(v => <td key={v.label} className="pr-2 font-mono">{fmtVal(v)}</td>)}
                      </tr>
                    ))}</tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      <AddToNotebookDialog
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        sim={sim}
        currentValues={vals}
        readouts={reads}
        equations={eqs}
        canvasDataUrl={snapshotUrl}
        notebookTitle={notebookContext?.notebookTitle}
        currentPage={notebookContext?.pageNumber}
        onNavigateToNotebook={notebookContext?.onBackToNotebook}
      />
    </div>
  );
}
