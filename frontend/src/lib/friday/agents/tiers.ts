/** Model tiers: a small fast model routes and answers easy things; the big model is kept for hard problems. */
export type Tier = 'fast' | 'deep';
export function tierFor(goal: string): Tier {
  const g = goal.trim();
  if (g.length > 220 || /```/.test(g)) return 'deep';
  if (/\b(derive|derivation|prove|proof|step[- ]by[- ]step|algorithm|implement|write (?:a |the )?(?:code|program|function|script)|debug|integral|differential equation|eigen|optimi[sz]e|analy[sz]e|compare and|essay|design|architecture|why does|explain why|in depth|in detail)\b/i.test(g)) return 'deep';
  if (/[∫∑∏√≈≠≤≥]|\\(?:int|sum|frac)|\bd[a-z]\/d[a-z]\b/.test(g)) return 'deep';
  return 'fast';
}
const size = (m: string) => { const x = m.toLowerCase().match(/(\d+(?:\.\d+)?)\s*b\b/); return x ? +x[1] : m.toLowerCase().includes('mini') || m.toLowerCase().includes('tiny') || m.toLowerCase().includes('small') ? 3 : null; };
const chat = (m: string) => !/embed|nomic|bge|minilm|whisper|clip|rerank/i.test(m);
/** Smallest and largest chat models among those installed (null when fewer than two sizes exist). */
export function pickTiers(models: string[]): { small: string; big: string } | null {
  const c = models.filter(chat).map(m => ({ m, s: size(m) })).filter((x): x is { m: string; s: number } => x.s !== null).sort((a, b) => a.s - b.s);
  if (c.length < 2 || c[0].s === c[c.length - 1].s) return null; return { small: c[0].m, big: c[c.length - 1].m };
}
