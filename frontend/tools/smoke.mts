// Numeric smoke test (no browser): npx tsx tools/smoke.mts <sims-file-without-ext>
// Runs every simulation exported from src/sims/<file>.ts for 10 simulated seconds, draws on a stub canvas at two sizes,
// and reports non-finite readouts and thrown errors.
import { defaultsOf } from '../src/sims/types.ts';
const file = process.argv[2];
const m: Record<string, unknown> = await import(`../src/sims/${file}.ts`);
const noop = () => {};
const ctx: any = new Proxy({}, { get: (_t, k) => k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : noop, set: () => true });
const sims: any[] = [];
for (const v of Object.values(m)) { if (Array.isArray(v)) sims.push(...v.filter((x: any) => x && x.init && x.draw)); else if ((v as any)?.init && (v as any)?.draw) sims.push(v); }
const uniq = [...new Set(sims)]; sims.length = 0; sims.push(...uniq);
let bad = 0; const ids = new Set<string>();
for (const sim of sims) {
  try {
    if (ids.has(sim.id)) throw new Error('duplicate id ' + sim.id); ids.add(sim.id);
    const v = defaultsOf(sim.params); const s = sim.init(v); sim.preview?.(s, v);
    const dt = sim.dt ?? 1 / 240; const n = Math.round(10 / dt);
    for (let i = 0; i < n; i++) sim.step(s, v, dt);
    sim.draw(ctx, s, v, 700, 440); sim.draw(ctx, s, v, 360, 300);
    const r = sim.readouts(s, v); sim.equations?.(s, v);
    for (const a of sim.actions ?? []) { sim.action?.(s, v, a.id); sim.step(s, v, dt); sim.draw(ctx, s, v, 700, 440); }
    for (const p of sim.params) { // sweep every numeric param to its extremes
      if (p.kind !== 'number') continue;
      for (const val of [p.min, p.max]) { const v2 = { ...v, [p.id]: val }; const s2 = p.resetOnChange ? sim.init(v2) : sim.init(v); for (let i = 0; i < 2 / dt; i++) sim.step(s2, v2, dt); sim.draw(ctx, s2, v2, 700, 440); const r2 = sim.readouts(s2, v2); sim.equations?.(s2, v2); const b2 = r2.filter((x: any) => typeof x.value === 'number' && !Number.isFinite(x.value)); if (b2.length) { bad++; console.log(`  ${sim.id}: param ${p.id}=${val} -> non-finite ${b2.map((b: any) => b.label)}`); } }
    }
    const nf = r.filter((x: any) => typeof x.value === 'number' && !Number.isFinite(x.value));
    if (nf.length) { bad++; console.log(sim.id, 'NON-FINITE', nf.map((b: any) => b.label)); } else console.log(sim.id.padEnd(22), 'ok');
  } catch (e: any) { bad++; console.log(sim.id, 'ERROR', e.message); }
}
console.log(`${sims.length} sims, ${bad} problems`);
process.exit(bad ? 1 : 0);
