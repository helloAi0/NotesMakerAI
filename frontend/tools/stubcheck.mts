// Finds incomplete simulations: blank canvas, no readouts, duplicate/missing params. npx tsx tools/stubcheck.mts
import { defaultsOf } from '../src/sims/types.ts';
let ops = 0; const noop = () => {};
const ctx: any = new Proxy({}, { get: (_t, k: string) => {
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
  if (k === 'measureText') return () => ({ width: 10 });
  if (k === 'canvas') return { width: 700, height: 440 };
  return () => { if (/^(fill|stroke|fillRect|strokeRect|fillText|strokeText|drawImage|putImageData|arc|lineTo|rect)$/.test(k)) ops++; };
}, set: () => true });
import { SIMS } from '../src/sims/registry.ts';
const sims: any[] = SIMS.map((x: any) => ({ ...x, __file: x.id }));
const bad: string[] = [];
for (const sim of sims) {
  const issues: string[] = [];
  const ids = sim.params.map((p: any) => p.id); const dup = ids.filter((x: string, i: number) => ids.indexOf(x) !== i);
  if (dup.length) issues.push('duplicate param ids ' + [...new Set(dup)].join(','));
  const v = defaultsOf(sim.params);
  try {
    const s = sim.init(v); const dt = sim.dt ?? 1 / 240; for (let i = 0; i < Math.round(1 / dt); i++) sim.step(s, v, dt);
    ops = 0; sim.draw(ctx, s, v, 700, 440); if (ops < 8) issues.push(`draws almost nothing (${ops} ops)`);
    const r = sim.readouts ? sim.readouts(s, v) : []; if (!r || r.length === 0) issues.push('no readouts');
    if (!sim.equations || !sim.equations(s, v)?.length) issues.push('no equations');
  } catch (e: any) { issues.push('throws: ' + e.message); }
  if (issues.length) bad.push(`${sim.id} (${sim.__file}): ${issues.join('; ')}`);
}
console.log(`${sims.length} sims checked, ${bad.length} with problems`); console.log(bad.join('\n')); process.exit(bad.length ? 1 : 0);
