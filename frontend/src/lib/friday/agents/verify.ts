/** Verification: recompute every number that can be recomputed, sample several answers and keep the one most agree on, admit uncertainty. */
export interface Claim { text: string; expr: string; shown: number; expected: number | null; ok: boolean }
export interface Recheck { checked: number; wrong: Claim[]; claims: Claim[] }
const NUM = String.raw`-?\d+(?:\.\d+)?(?:e[+-]?\d+)?`;
const close = (a: number, b: number, rel = 1e-3) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));
/** Find arithmetic statements like “12 × 7 = 84” or “(3+4)*2 equals 14” in an answer and recompute them. */
export function recomputeClaims(text: string, calc: (e: string) => number | null): Recheck {
  const claims: Claim[] = []; const re = new RegExp(String.raw`((?<![\w.])[\d(](?:[\d.()\s]|[+\-*/×÷^]|\bx\b(?=\s*\d)|\b(?:sqrt|sin|cos|tan|ln|log|pi)\b)*?)\s*(?:=|equals|is equal to|≈|~=)\s*(${NUM})`, 'gi'); let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const lhs = m[1].trim(); if (!/\d/.test(lhs) || !/[+\-*/×÷^]|\bx\b|sqrt|sin|cos|tan|ln|log/i.test(lhs.replace(/^-/, ''))) continue;
    const expr = lhs.replace(/×/g, '*').replace(/÷/g, '/').replace(/(\d)\s*x\s*(\d)/gi, '$1*$2'); const shown = parseFloat(m[2]); let exp: number | null = null; try { exp = calc(expr); } catch { exp = null; }
    if (exp === null || !Number.isFinite(exp)) continue; claims.push({ text: m[0].trim(), expr, shown, expected: exp, ok: close(shown, exp, /e/i.test(m[2]) ? 1e-3 : Math.max(1e-3, 0.5 * Math.pow(10, -(m[2].split('.')[1]?.length ?? 0)) / Math.max(1, Math.abs(exp)))) });
  }
  return { checked: claims.length, wrong: claims.filter(c => !c.ok), claims };
}
export function fixClaims(text: string, r: Recheck): string { let out = text; for (const c of r.wrong) out = out.replace(c.text, `${c.expr} = ${Number((c.expected as number).toPrecision(12))}`); return out; }

/** Last number in a text, used as the “final answer” of a calculation. */
export function finalNumber(text: string): number | null { const m = [...text.matchAll(new RegExp(NUM, 'gi'))]; return m.length ? parseFloat(m[m.length - 1][0]) : null; }
const toks = (s: string) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}.\s-]/gu, ' ').split(/\s+/).filter(w => w.length > 2));
export const jaccard = (a: string, b: string) => { const A = toks(a), B = toks(b); if (!A.size && !B.size) return 1; let i = 0; A.forEach(x => { if (B.has(x)) i++; }); return i / (A.size + B.size - i || 1); };
export interface Agreement { answer: string; agreement: number; samples: string[]; clusters: number; unsure: boolean; numeric: boolean }
/** Draw n answers, group the ones that agree (same final number, or same wording), keep the biggest group. Disagreement ⇒ unsure. */
export async function sampleAndAgree(gen: (i: number) => Promise<string | null>, n = 3, o: { threshold?: number; textSim?: number } = {}): Promise<Agreement> {
  const raw = (await Promise.all(Array.from({ length: n }, (_, i) => gen(i).catch(() => null)))).filter((x): x is string => !!x && !!x.trim());
  if (!raw.length) return { answer: '', agreement: 0, samples: [], clusters: 0, unsure: true, numeric: false };
  const nums = raw.map(finalNumber); const numeric = nums.every(x => x !== null) && raw.every(r => /\d/.test(r) && r.length < 400);
  const groups: { key: number; items: string[] }[] = [];
  raw.forEach((r, i) => { const g = groups.find(x => (numeric ? close(nums[i] as number, nums[raw.indexOf(x.items[0])] as number) : jaccard(r, x.items[0]) >= (o.textSim ?? 0.5))); if (g) g.items.push(r); else groups.push({ key: i, items: [r] }); });
  groups.sort((a, b) => b.items.length - a.items.length); const best = groups[0]; const agreement = best.items.length / n;
  return { answer: best.items[0], agreement, samples: raw, clusters: groups.length, unsure: agreement < (o.threshold ?? 0.6) || (raw.length < 2 && n > 1), numeric };
}
export const UNSURE = 'I’m not sure about this one. ';
