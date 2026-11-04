/* Photo / handwriting problem solving: find the exact line where a worked solution goes wrong.
   The text comes from OCR (or a vision model, or typing); the checking is done by recomputation, not by asking a model:
   • “12 × 7 = 84”          → both sides are evaluated and compared
   • “2x + 3 = 11” → “2x = 8” → “x = 5” → the solution set of each equation is computed; a step that changes it is the error. */
import { calc } from '../fridayCore';

export interface Step { n: number; text: string; kind: 'equation' | 'arith' | 'text'; status: 'ok' | 'error' | 'unchecked'; note?: string }
export interface Check { steps: Step[]; firstError: number | null; summary: string; checked: number }
const FUNCS = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'ln', 'log', 'exp', 'abs', 'pi']);

export function clean(line: string): string {
  return line.replace(/^\s*(?:step\s*)?\(?\d{1,2}[.):]\s+/i, '').replace(/^\s*(?:=>|⇒|→|∴|so|therefore|hence|thus)[,:]?\s+/i, '').replace(/[−–—]/g, '-').replace(/[×·✕]/g, '*').replace(/÷/g, '/').replace(/＝/g, '=').replace(/√\s*\(?(\d+(?:\.\d+)?)\)?/g, 'sqrt($1)').replace(/(\d)\s*\^\s*(\d)/g, '$1^$2').replace(/(\d),(\d{3})/g, '$1$2').trim();
}
/** insert implicit multiplication: 2x → 2*x, 3(x+1) → 3*(x+1), x(…), )( , )x */
function explicit(src: string): string | null {
  const t = src.match(/\d+\.?\d*(?:e[+-]?\d+)?|[a-z]+|\*\*|[-+*/^%()=]|\S/gi); if (!t) return null; const out: string[] = []; let prev = '';
  for (const raw of t) {
    const tok = raw; const isNum = /^\d/.test(tok), isId = /^[a-z]+$/i.test(tok), isFn = isId && FUNCS.has(tok.toLowerCase()), isOpen = tok === '(';
    const prevVal = /^\d/.test(prev) || prev === ')' || (/^[a-z]+$/i.test(prev) && !FUNCS.has(prev.toLowerCase()) || prev.toLowerCase() === 'pi');
    if (prev && prevVal && (isId || isOpen || (isNum && /^[a-z]+$/i.test(prev)))) out.push('*');
    if (isId && !isFn && tok.length > 1 && tok.toLowerCase() !== 'pi') { for (const [i, ch] of [...tok].entries()) { if (i) out.push('*'); out.push(ch); } } else out.push(tok);
    prev = tok;
  }
  return out.join('');
}
const varsOf = (s: string) => [...new Set((s.match(/[a-z]+/gi) ?? []).filter(w => !FUNCS.has(w.toLowerCase())).flatMap(w => [...w.toLowerCase()]))];
function evalAt(expr: string, v: string | null, x: number): number | null { const e = explicit(expr); if (e === null) return null; const sub = v ? e.replace(new RegExp(`\\b${v}\\b`, 'gi'), `(${x})`) : e; return calc(sub.replace(/\^/g, '**')); }
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
const fmtN = (x: number) => String(Math.round(x * 1e6) / 1e6);

/** Solutions of lhs = rhs in one variable when it is linear or quadratic; null if we cannot tell. */
export function solutions(lhs: string, rhs: string, v: string): number[] | 'all' | 'none' | null {
  const f = (x: number) => { const a = evalAt(lhs, v, x), b = evalAt(rhs, v, x); return a === null || b === null ? null : a - b; };
  const f0 = f(0), f1 = f(1), fm = f(-1), f2 = f(2); if ([f0, f1, fm, f2].some(z => z === null || !Number.isFinite(z))) return null;
  const A = (f1! + fm!) / 2 - f0!, B = (f1! - fm!) / 2, C = f0!; if (!near(A * 4 + B * 2 + C, f2!)) return null; // not a polynomial of degree ≤ 2
  if (near(A, 0)) { if (near(B, 0)) return near(C, 0) ? 'all' : 'none'; return [-C / B]; }
  const d = B * B - 4 * A * C; if (d < -1e-9) return 'none'; if (near(d, 0)) return [-B / (2 * A)]; return [(-B - Math.sqrt(d)) / (2 * A), (-B + Math.sqrt(d)) / (2 * A)].sort((p, q) => p - q);
}
const same = (a: ReturnType<typeof solutions>, b: ReturnType<typeof solutions>) => a !== null && b !== null && (typeof a === 'string' || typeof b === 'string' ? a === b : a.length === b.length && a.every((x, i) => near(x, b[i])));
const show = (s: ReturnType<typeof solutions>, v: string) => (s === 'all' ? 'every value' : s === 'none' ? 'no solution' : s === null ? '?' : s.map(x => `${v} = ${fmtN(x)}`).join(' or '));

export function checkSolution(text: string): Check {
  const raw = text.split(/\r?\n/).map(clean).filter(l => l.length > 0); const steps: Step[] = []; let prev: { sol: ReturnType<typeof solutions>; v: string; n: number } | null = null; let first: number | null = null; let checked = 0;
  raw.forEach((l, i) => {
    const n = i + 1; const parts = l.split('=').map(s => s.trim()); const st: Step = { n, text: l, kind: 'text', status: 'unchecked' }; steps.push(st);
    if (parts.length < 2 || parts.some(p => !p) || !/[\d]/.test(l) || /[a-z]{4,}\s+[a-z]{3,}/i.test(l)) return;
    const vs = varsOf(l);
    if (vs.length === 0) { // arithmetic chain: every part must equal the first
      const vals = parts.map(p => evalAt(p, null, 0)); if (vals.some(v => v === null)) return; st.kind = 'arith'; checked++;
      const bad = vals.findIndex(v => !near(v!, vals[0]!)); if (bad < 0) st.status = 'ok'; else { st.status = 'error'; st.note = `“${parts.slice(0, bad).join(' = ')}” works out to ${fmtN(vals[0]!)}, but you wrote ${parts[bad]} (= ${fmtN(vals[bad]!)}).`; if (first === null) first = n; } return;
    }
    if (vs.length === 1 && parts.length === 2) {
      const v = vs[0]; const sol = solutions(parts[0], parts[1], v); if (sol === null) return; st.kind = 'equation'; checked++;
      if (prev && prev.v === v && !same(prev.sol, sol)) { st.status = 'error'; st.note = `Line ${prev.n} has ${show(prev.sol, v)}, but this line has ${show(sol, v)}. A correct step never changes the answer, so check what you did to both sides between these lines.`; if (first === null) first = n; }
      else st.status = 'ok';
      prev = { sol, v, n };
    }
  });
  const summary = !checked ? 'I could not find any equations or calculations I can check. Make sure each step is on its own line, or fix the text above.' : first === null ? `Every line I could check (${checked}) is consistent. ${checked < raw.length ? `${raw.length - checked} line(s) were text I cannot verify.` : ''}`.trim() : `The first mistake is on line ${first}. Lines before it are consistent.`;
  return { steps, firstError: first, summary, checked };
}
