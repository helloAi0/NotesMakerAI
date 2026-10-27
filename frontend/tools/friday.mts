// Offline test of FRIDAY's brain: npx tsx tools/friday.mts
import { baseDocs, buildIndex, ask, calc, composeNotes } from '../src/lib/fridayCore.ts';
import * as sims from '../src/sims/cs_ai_vision.ts';
import * as sims2 from '../src/sims/pg_signals_graphs.ts';
let fail = 0; const t = (n: string, ok: boolean, info = '') => { if (!ok) { fail++; console.log('FAIL', n, info); } };
const all = [...Object.values(sims), ...Object.values(sims2)].filter((s: any) => s && s.id && s.title) as any[];
const ix = buildIndex(baseDocs(all), [
  { id: 'n1', kind: 'note', title: 'My Notebook', where: 'page 1', text: 'Today I learned that the Carnot engine has the maximum possible efficiency between two reservoirs. Efficiency is one minus Tc over Th.' },
  { id: 'p1', kind: 'pdf', title: 'Thermo.pdf', where: 'page 3', text: 'The second law of thermodynamics states that entropy of an isolated system never decreases. Heat flows spontaneously from hot to cold bodies. Clausius statement and Kelvin Planck statement are equivalent.' },
]);
t('calc basic', calc('12*7+3') === 87); t('calc pow', calc('2^10') === 1024); t('calc fn', Math.abs(calc('sqrt(2)')! - 1.41421356) < 1e-6); t('calc reject', calc('alert(1)') === null); t('calc words', calc('5 plus 6 times 2') === 17);
t('calc ask', ask(ix, 'what is 12*7+3').text.includes('87'));
const q = (s: string) => ask(ix, s);
for (const [s, want] of [['what is backpropagation', 'Backpropagation'], ['explain gradient descent', 'Gradient descent'], ['what is entropy second law', 'Thermo.pdf'], ['how do I use click to speak', 'Click to speak'], ['how do I add a simulation to notebook', 'notebook'], ['what is Carnot efficiency', 'My Notebook'], ['Dijkstra shortest path', 'Dijkstra']] as const) {
  const a = q(s); t('ask ' + s, a.found && (a.text.includes(want) || a.sources.some(x => x.title.includes(want))), a.text.slice(0, 150));
}
for (const s of ['zebra quokka flibbertigibbet', 'what is the capital of Mongolia']) t('unknown ' + s, !q(s).found, q(s).text.slice(0, 100));
t('hello', q('hello').kind === 'chat'); t('who', q('who are you').text.includes('FRIDAY'));
const n = composeNotes(ix, 'gradient descent'); t('notes found', n.found && /Definition/.test(n.text), n.text); t('notes none', !composeNotes(ix, 'qwertyuiop').found);
console.log(fail ? `${fail} FAILED` : 'ALL PASS');
