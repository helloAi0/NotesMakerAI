/* “AI you can trust for homework”: a badge and a plain report built ONLY from numbers the app can really measure on this device
   (the fixed 50-question evaluation and the recorded agent runs). Nothing here is claimed that was not measured. */
import type { EvalReport } from '../friday/agents/evals';
import type { Run } from '../friday/agents/core';

export interface Trust {
  level: 'none' | 'tested' | 'strong';
  eval: { passed: number; total: number; score: number; when: number; areas: { area: string; passed: number; total: number }[]; history: number } | null;
  answers: { runs: number; flaggedUnsure: number; avgConfidence: number | null; failures: number };
  guarantees: string[]; limits: string[];
}
export function trustReport(history: EvalReport[], runs: Run[]): Trust {
  const last = history[history.length - 1]; const done = runs.filter(r => r.status === 'done'); const conf = done.map(r => r.confidence).filter((x): x is number => typeof x === 'number');
  const evalPart = last ? { passed: last.passed, total: last.total, score: last.score, when: last.t, areas: Object.entries(last.byArea).map(([area, v]) => ({ area, ...v })), history: history.length } : null;
  const level: Trust['level'] = !evalPart ? 'none' : evalPart.score >= 0.95 && evalPart.total >= 40 ? 'strong' : 'tested';
  return {
    level, eval: evalPart,
    answers: { runs: done.length, flaggedUnsure: done.filter(r => r.unsure).length, avgConfidence: conf.length ? conf.reduce((a, b) => a + b, 0) / conf.length : null, failures: runs.reduce((a, r) => a + r.failures, 0) },
    guarantees: ['Answers from your notes and the built-in library show where they came from (source and page).', 'Arithmetic in an answer is recomputed by the app and corrected if the model got it wrong.', 'If the model’s samples disagree or its answer is not supported by the sources, FRIDAY says “I’m not sure” instead of guessing.', 'Text inside PDFs, images and transcripts is treated as data, never as instructions.', 'Risky actions (overwriting or deleting files) ask first and can be undone.'],
    limits: ['The evaluation is a fixed 50-question set on a small built-in corpus. It shows the checking works; it does not prove every answer is right.', 'The language model can still be wrong in ways the checks cannot see. Check anything that matters.', 'FRIDAY is a model plus tools, memory and verification. It is not general intelligence.'],
  };
}
const esc = (s: string) => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
/** A small shields-style SVG. */
export function badgeSvg(label: string, value: string, color = '#16a34a'): string {
  const lw = 7 * label.length + 14, vw = 7 * value.length + 14, w = lw + vw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="22" role="img" aria-label="${esc(label)}: ${esc(value)}"><rect width="${lw}" height="22" rx="3" fill="#334155"/><rect x="${lw}" width="${vw}" height="22" rx="3" fill="${color}"/><g fill="#fff" font-family="Verdana,sans-serif" font-size="11" text-anchor="middle"><text x="${lw / 2}" y="15">${esc(label)}</text><text x="${lw + vw / 2}" y="15">${esc(value)}</text></g></svg>`;
}
export function badgeFor(t: Trust): { svg: string; text: string } {
  if (!t.eval) return { svg: badgeSvg('verified answers', 'not tested', '#94a3b8'), text: 'Not tested yet. Run the evaluation in FRIDAY → Evals.' };
  const txt = `${t.eval.passed}/${t.eval.total} checks`; return { svg: badgeSvg('answer checks', txt, t.level === 'strong' ? '#16a34a' : '#d97706'), text: `Passed ${txt} on ${new Date(t.eval.when).toLocaleDateString()}` };
}
export function reportMarkdown(t: Trust, name = 'Notes Maker AI'): string {
  const L = [`# ${name}: answer-trust report`, ''];
  if (t.eval) { L.push(`**Evaluation:** ${t.eval.passed}/${t.eval.total} (${Math.round(t.eval.score * 100)}%) on ${new Date(t.eval.when).toISOString().slice(0, 10)}; ${t.eval.history} run(s) recorded.`, '', '| Area | Passed |', '|---|---|', ...t.eval.areas.map(a => `| ${a.area} | ${a.passed}/${a.total} |`), ''); } else L.push('**Evaluation:** not run yet.', '');
  L.push(`**Recorded answers on this device:** ${t.answers.runs}; flagged “not sure”: ${t.answers.flaggedUnsure}; average confidence: ${t.answers.avgConfidence == null ? 'n/a' : Math.round(t.answers.avgConfidence * 100) + '%'}.`, '', '## What the app checks', ...t.guarantees.map(g => `- ${g}`), '', '## Limits', ...t.limits.map(g => `- ${g}`), '');
  return L.join('\n');
}
