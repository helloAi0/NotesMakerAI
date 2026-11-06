import { useCallback } from 'react';
import { generate } from '../../lib/aiClient';
import { llmConfig } from '../../lib/friday';
import { describeWithModel, readFile, loadImage, toCanvas } from '../../lib/friday/vision';

export const box = 'border rounded p-3 text-sm space-y-2'; export const btn = 'px-3 py-1.5 rounded border text-sm hover:bg-slate-50 disabled:opacity-50'; export const dark = 'px-3 py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50';
export const NEED_AI = 'Add an AI key (or a local Ollama model) in Settings first: this step needs a model.';
export const saveFile = (name: string, text: string, type = 'text/markdown') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };

/** one place that turns the configured provider into a text function (or a plain message when none is set up) */
export function useAI() {
  const gen = useCallback(async (prompt: string): Promise<string> => { const cfg = llmConfig(); if (!cfg) throw new Error(NEED_AI); return generate(cfg, prompt, { stream: false }); }, []);
  const vision = useCallback(async (url: string, q: string): Promise<string> => { const cfg = llmConfig(); if (!cfg) throw new Error(NEED_AI); return describeWithModel(cfg, url, q); }, []);
  return { gen, vision, ready: () => !!llmConfig() };
}
export async function imageToJpeg(f: File, max = 1600): Promise<string> { const url = await readFile(f); const img = await loadImage(url); return toCanvas(img, max).toDataURL('image/jpeg', 0.85); }
