import { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Volume2, VolumeX, Sparkles,
  CheckCircle2, Info, Layers, Check
} from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { DerivationPlan } from '../sims/types';
import { VoiceNarrationController, convertLatexToSpokenWords } from '../lib/speechUtils';

interface DerivationViewerProps {
  plan: DerivationPlan;
  activeStepIndex: number;
  onStepChange: (index: number) => void;
  onAddToNotebook?: (derivationText: string) => void;
}

function KatexBlock({ tex, inline = false }: { tex: string; inline?: boolean }) {
  let html = '';
  let failed = false;
  try {
    html = katex.renderToString(tex, { throwOnError: false, displayMode: !inline });
  } catch {
    failed = true;
  }
  if (failed) return <code className="text-xs font-mono text-amber-300">{tex}</code>;
  return <span className={inline ? 'inline-block' : 'block my-1.5 overflow-x-auto'} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function DerivationViewer({
  plan,
  activeStepIndex,
  onStepChange,
  onAddToNotebook,
}: DerivationViewerProps) {
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [showVariables, setShowVariables] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const narrationRef = useRef<VoiceNarrationController | null>(null);

  useEffect(() => {
    narrationRef.current = new VoiceNarrationController(
      (playing) => setIsSpeaking(playing),
      undefined
    );
    return () => {
      narrationRef.current?.stop();
    };
  }, []);

  // Stop speaking when step changes
  useEffect(() => {
    narrationRef.current?.stop();
  }, [activeStepIndex]);

  const currentStep = plan.steps[activeStepIndex] || plan.steps[0];
  const totalSteps = plan.steps.length;

  const handleSpeakStep = () => {
    if (isSpeaking) {
      narrationRef.current?.stop();
      return;
    }
    if (!narrationRef.current || !currentStep) return;

    // Convert step math and explanation to natural spoken words
    const spokenMath = convertLatexToSpokenWords(currentStep.math);
    const textToSpeak = `Step ${currentStep.stepNumber}: ${currentStep.title}. ${spokenMath}. ${currentStep.explanation}. ${currentStep.justification ? 'Justification: ' + currentStep.justification : ''}`;
    narrationRef.current.speak(textToSpeak);
  };

  const handleSaveToNotebook = () => {
    const markdown = [
      `### Mathematical Derivation: ${plan.problemStatement}`,
      `**Target Equation:** $${plan.targetEquation}$`,
      `**Starting Principle:** ${plan.startingPrinciple}`,
      `\n**Steps:**`,
      ...plan.steps.map(s => `\n**Step ${s.stepNumber} - ${s.title}:**\n$$${s.math}$$\n*${s.explanation}*${s.justification ? `\n> Justification: ${s.justification}` : ''}`),
      `\n**Final Result:** $$${plan.finalResult}$$`,
      plan.dimensionalCheck ? `**Dimensional Check:** ${plan.dimensionalCheck}` : '',
      plan.physicalInterpretation ? `**Physical Interpretation:** ${plan.physicalInterpretation}` : '',
    ].filter(Boolean).join('\n');

    onAddToNotebook?.(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/95 border-r border-slate-700/80 text-slate-100 p-4 overflow-y-auto select-text font-sans">
      {/* Header */}
      <div className="border-b border-slate-800 pb-3 mb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold tracking-wide uppercase">
            <Layers className="w-3.5 h-3.5" />
            <span>Mathematical Derivation</span>
          </div>
          <button
            onClick={handleSaveToNotebook}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-amber-600/90 hover:bg-amber-500 text-white rounded-lg shadow-sm transition-all"
            title="Save complete derivation into notebook notes"
          >
            {copied ? <Check className="w-3 h-3 text-white" /> : <Sparkles className="w-3 h-3" />}
            <span>{copied ? 'Saved to Note' : 'Add to Note'}</span>
          </button>
        </div>

        <p className="text-xs text-slate-300 font-medium mt-1.5 leading-snug">
          {plan.problemStatement}
        </p>

        {/* Target Formula Card */}
        <div className="mt-2.5 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <span className="text-[10px] text-amber-400 font-semibold block uppercase tracking-wider">Target Equation</span>
          <div className="text-center py-1 text-sm text-amber-200">
            <KatexBlock tex={plan.targetEquation} />
          </div>
        </div>
      </div>

      {/* Assumptions & Variables Toggles */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          onClick={() => setShowAssumptions(!showAssumptions)}
          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
            showAssumptions
              ? 'bg-slate-800 border-amber-500/50 text-amber-300'
              : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="flex items-center gap-1"><Info className="w-3 h-3" /> Assumptions ({plan.assumptions.length})</span>
          <span>{showAssumptions ? '▴' : '▾'}</span>
        </button>

        <button
          onClick={() => setShowVariables(!showVariables)}
          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
            showVariables
              ? 'bg-slate-800 border-amber-500/50 text-amber-300'
              : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="flex items-center gap-1"><HelpCircle className="w-3 h-3" /> Variables ({plan.variableDefinitions.length})</span>
          <span>{showVariables ? '▴' : '▾'}</span>
        </button>
      </div>

      {showAssumptions && (
        <div className="mb-3 p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs space-y-1">
          <span className="font-bold text-[10px] uppercase text-slate-400 block mb-1">Model Assumptions & Restrictions</span>
          <ul className="list-disc list-inside space-y-0.5 text-slate-300 text-[11px]">
            {plan.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {showVariables && (
        <div className="mb-3 p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs space-y-1.5">
          <span className="font-bold text-[10px] uppercase text-slate-400 block mb-1">Symbol Definitions & Units</span>
          <div className="space-y-1">
            {plan.variableDefinitions.map((v, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] border-b border-slate-700/50 pb-0.5">
                <span className="font-mono text-amber-400 font-semibold">{v.symbol}</span>
                <span className="text-slate-300">{v.meaning}</span>
                {v.unit && <span className="text-[10px] text-slate-400 font-mono">[{v.unit}]</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Starting Principle */}
      <div className="mb-3 px-2.5 py-1.5 rounded-lg bg-slate-800/40 border border-slate-700/50 text-[11px] text-slate-400">
        <span className="text-amber-400 font-semibold">Starting Principle: </span>
        <span className="text-slate-300">{plan.startingPrinciple}</span>
      </div>

      {/* Interactive Step Navigator */}
      <div className="flex-1 flex flex-col justify-between bg-slate-950/60 rounded-2xl border border-slate-800 p-3.5 space-y-3">
        {/* Step Header with TTS */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold text-xs">
              Step {currentStep.stepNumber} of {totalSteps}
            </span>
            <span className="text-xs font-semibold text-slate-200">{currentStep.title}</span>
          </div>

          <button
            onClick={handleSpeakStep}
            className={`p-1.5 rounded-lg border transition-all ${
              isSpeaking
                ? 'bg-amber-600 border-amber-400 text-white animate-pulse'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
            title={isSpeaking ? 'Stop narration' : 'Listen to step derivation and math'}
          >
            {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Step Math Box */}
        <div className="my-2 p-3 rounded-xl bg-slate-900 border border-amber-500/30 text-center shadow-inner">
          <div className="text-base text-amber-300 font-serif">
            <KatexBlock tex={currentStep.math} />
          </div>
        </div>

        {/* Step Explanation & Justification */}
        <div className="space-y-2 text-xs leading-relaxed">
          <p className="text-slate-300">
            {currentStep.explanation}
          </p>

          {currentStep.justification && (
            <div className="p-2 rounded-lg bg-slate-900/80 border-l-2 border-emerald-500 text-[11px] text-slate-400">
              <span className="font-semibold text-emerald-400">Why this holds: </span>
              {currentStep.justification}
            </div>
          )}

          {currentStep.intermediateResult && (
            <div className="p-2 rounded-lg bg-slate-900/80 border-l-2 border-amber-500 text-[11px] text-slate-400">
              <span className="font-semibold text-amber-400">Intermediate: </span>
              <KatexBlock tex={currentStep.intermediateResult} inline />
            </div>
          )}
        </div>

        {/* Step Navigation Buttons */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
          <button
            disabled={activeStepIndex <= 0}
            onClick={() => onStepChange(activeStepIndex - 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-30 disabled:pointer-events-none transition-all"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>

          {/* Dots */}
          <div className="flex items-center gap-1">
            {plan.steps.map((_, i) => (
              <button
                key={i}
                onClick={() => onStepChange(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === activeStepIndex
                    ? 'w-4 bg-amber-500'
                    : 'bg-slate-700 hover:bg-slate-500'
                }`}
                title={`Go to step ${i + 1}`}
              />
            ))}
          </div>

          <button
            disabled={activeStepIndex >= totalSteps - 1}
            onClick={() => onStepChange(activeStepIndex + 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Dimensional check & Physical interpretation footer */}
      {(plan.dimensionalCheck || plan.physicalInterpretation) && (
        <div className="mt-3 pt-2.5 border-t border-slate-800 space-y-1.5 text-[11px]">
          {plan.dimensionalCheck && (
            <div className="flex items-start gap-1.5 text-slate-400">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-300">Units Check: </strong>
                {plan.dimensionalCheck}
              </span>
            </div>
          )}
          {plan.physicalInterpretation && (
            <div className="text-slate-400 italic">
              &ldquo;{plan.physicalInterpretation}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
}
