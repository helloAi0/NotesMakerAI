import { useMemo, useState } from 'react';
import katex from 'katex';
import { Mic, Square, X, Check, Trash2, AlertTriangle } from 'lucide-react';
import { dictateMath, isValidLatex } from '../lib/mathDictation';
import { useDictation, SPEECH_LANGS } from '../lib/useVoice';
import { convertLatexToSpokenWords } from '../lib/latexSpeech';

function Preview({ tex }: { tex: string }) {
  const html = useMemo(() => {
    try { return katex.renderToString(tex, { throwOnError: true, displayMode: true, strict: 'ignore' }); } catch { return ''; }
  }, [tex]);
  if (!tex.trim()) return <p className="text-xs text-slate-400">Preview appears here.</p>;
  if (!html) return <p className="text-xs text-red-600">This LaTeX is not valid yet.</p>;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Speak (or type) an equation in words; it becomes LaTeX you can check and edit.
 * Nothing is inserted until the student presses Insert Equation. When the phrase has
 * more than one sensible reading the student must pick one.
 */
export default function EquationDictation({ onInsert, onClose }: { onInsert: (latex: string) => void; onClose: () => void }) {
  const [heard, setHeard] = useState('');
  const [choice, setChoice] = useState<number | null>(null);
  const [latex, setLatex] = useState('');
  const [converted, setConverted] = useState(false);

  const result = useMemo(() => (converted ? dictateMath(heard) : null), [converted, heard]);

  const dict = useDictation(text => { setHeard(h => (h ? h + ' ' : '') + text); setConverted(false); });

  const convert = () => {
    const r = dictateMath(heard);
    setConverted(true); setChoice(null);
    setLatex(r.ok && !r.needsChoice ? r.candidates[0].latex : '');
  };
  const pick = (i: number) => { setChoice(i); setLatex(result!.candidates[i].latex); };
  const needsPick = !!result?.needsChoice && choice === null;
  const canInsert = latex.trim() !== '' && isValidLatex(latex) && !needsPick;
  const listening = dict.state === 'listening' || dict.state === 'starting';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-label="Equation Dictation">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4 text-slate-800">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">Equation Dictation</h2>
          <button onClick={() => { dict.cancel(); onClose(); }} aria-label="Close" className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-slate-500">Say the equation in words, e.g. “integral from zero to one of x squared d x”, or just type the words below.</p>

        <div className="flex flex-wrap items-center gap-2">
          {dict.supported ? (
            listening ? (
              <button onClick={dict.stop} className="px-3 py-1.5 rounded bg-red-600 text-white text-xs font-semibold flex items-center gap-1"><Square className="w-3.5 h-3.5" /> Stop listening</button>
            ) : (
              <button onClick={dict.start} className="px-3 py-1.5 rounded bg-amber-600 text-white text-xs font-semibold flex items-center gap-1"><Mic className="w-3.5 h-3.5" /> Start speaking</button>
            )
          ) : <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">Voice input is not available in this browser (use Chrome or Edge). Type below instead.</span>}
          <select value={dict.lang} onChange={e => dict.setLang(e.target.value)} className="border rounded px-2 py-1 text-xs" aria-label="Speech language">
            {SPEECH_LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          {listening && <span className="text-xs text-red-600 animate-pulse">● listening…</span>}
        </div>
        {dict.error && <p className="text-xs text-red-600">{dict.error}</p>}

        <label className="block text-xs font-semibold">What was heard (editable)
          <textarea value={heard} onChange={e => { setHeard(e.target.value); setConverted(false); }} rows={2}
            placeholder="e.g. square root of x squared plus y squared"
            className="mt-1 w-full border rounded-lg p-2 text-sm font-normal" />
        </label>
        {dict.interim && <p className="text-xs text-slate-500 italic">…{dict.interim}</p>}

        <div className="flex gap-2">
          <button onClick={convert} disabled={!heard.trim()} className="px-3 py-1.5 rounded bg-slate-800 text-white text-xs font-semibold disabled:opacity-40">Convert to equation</button>
          <button onClick={() => { setHeard(''); setLatex(''); setConverted(false); setChoice(null); }} className="px-3 py-1.5 rounded border text-xs flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Reject / clear</button>
        </div>

        {result && !result.ok && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />
            <div>Could not turn that into an equation. {result.warnings.join(' ')}</div></div>
        )}
        {result?.ok && result.warnings.length > 0 && <p className="text-xs text-amber-700">{result.warnings.join(' ')}</p>}

        {result?.ok && result.needsChoice && (
          <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-900">This could mean more than one thing. Pick the one you meant:</p>
            {result.candidates.map((c, i) => (
              <label key={c.latex} className={`flex items-start gap-2 p-2 rounded border cursor-pointer ${choice === i ? 'border-amber-600 bg-white' : 'border-transparent hover:bg-white'}`}>
                <input type="radio" name="cand" checked={choice === i} onChange={() => pick(i)} className="mt-1" />
                <span className="flex-1"><span className="block text-[11px] text-slate-500">{c.label}</span><Preview tex={c.latex} /></span>
              </label>
            ))}
          </div>
        )}

        {(latex || (result?.ok && !result.needsChoice)) && (
          <div className="space-y-2">
            <label className="block text-xs font-semibold">LaTeX (editable)
              <input value={latex} onChange={e => setLatex(e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5 text-sm font-mono font-normal" />
            </label>
            <div className="border rounded-lg p-3 bg-slate-50 overflow-x-auto"><Preview tex={latex} /></div>
            {latex && isValidLatex(latex) && <p className="text-[11px] text-slate-500">Read aloud: {convertLatexToSpokenWords(latex)}</p>}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={() => { dict.cancel(); onClose(); }} className="px-3 py-1.5 rounded border text-xs">Cancel</button>
          <button onClick={() => { onInsert(latex.trim()); dict.cancel(); onClose(); }} disabled={!canInsert}
            className="px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold disabled:opacity-40 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Insert Equation</button>
        </div>
      </div>
    </div>
  );
}
