// Which simulations look identical before and after Play? npx tsx tools/animcheck.mts
import fs from 'fs'; import path from 'path';
import { defaultsOf } from '../src/sims/types.ts';
let sig = '';
const noop = () => {};
const ctx: any = new Proxy({}, { get: (_t, k: string) => {
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
  if (k === 'measureText') return () => ({ width: 10 });
  if (k === 'canvas') return { width: 700, height: 440 };
  return (...a: any[]) => { sig += String(k) + a.map(x => typeof x === 'number' ? Math.round(x * 10) / 10 : typeof x === 'string' ? x : '').join(',') + ';'; };
}, set: (_t, k, v) => { sig += String(k) + '=' + (typeof v === 'string' ? v : typeof v === 'number' ? Math.round(v * 10) / 10 : '') + ';'; return true; } });
const dir = path.resolve('src/sims'); const sims: any[] = []; const seen = new Set<string>();
for (const f of fs.readdirSync(dir)) { if (!f.endsWith('.ts') || /^(registry|types|draw|curriculumCatalog|univ_util)\.ts$/.test(f)) continue; const m: any = await import(path.join(dir, f)); for (const x of Object.values(m)) for (const s of (Array.isArray(x) ? x : [x]) as any[]) if (s && typeof s === 'object' && s.id && s.init && s.step && s.draw && !seen.has(s.id)) { seen.add(s.id); sims.push(s); } }
const still: string[] = [];
for (const sim of sims) {
  const v = defaultsOf(sim.params); const s = sim.init(v); const dt = sim.dt ?? 1 / 240;
  sig = ''; sim.draw(ctx, s, v, 700, 440); const a = sig;
  const frames = Math.round(3 / dt); let mid = '';
  for (let i = 0; i < frames; i++) { sim.step(s, v, dt); if (i === Math.floor(frames / 2)) { sig = ''; sim.draw(ctx, s, v, 700, 440); mid = sig; } }
  sig = ''; sim.draw(ctx, s, v, 700, 440); const b = sig;
  if (a === b && a === mid) still.push(`${sim.id}  [${sim.subject}]`);
}
console.log(`${sims.length} sims; ${still.length} look identical after 3 s of Play:`); console.log(still.join('\n'));

// ---- does the Play auto-sweep actually change the picture? (min vs max of the swept control)
import { SWEEP } from '../src/sims/sweepMap.ts';
const dead: string[] = []; let checked = 0;
for (const sim of sims) {
  const spec = (sim as any).sweep ?? SWEEP[sim.id]; if (!spec) continue; checked++;
  const base = defaultsOf(sim.params); const draw = (v: any) => { const s = sim.init(v); const dt = sim.dt ?? 1 / 240; for (let i = 0; i < 20; i++) sim.step(s, v, dt); sig = ''; sim.draw(ctx, s, v, 700, 440); return sig; };
  let A = '', B = '';
  if (typeof spec === 'string' && spec.startsWith('toggles:')) { const ids = spec.slice(8).split(','); A = draw({ ...base, ...Object.fromEntries(ids.map(i => [i, false])) }); B = draw({ ...base, ...Object.fromEntries(ids.map(i => [i, true])) }); }
  else if (typeof spec === 'string' && spec.startsWith('select:')) { const p: any = sim.params.find((q: any) => q.id === spec.slice(7)); const o = p.options; A = draw({ ...base, [p.id]: o[0].value }); B = draw({ ...base, [p.id]: o[o.length - 1].value }); }
  else if (typeof spec === 'string' && spec.startsWith('action:')) continue;
  else { const id = typeof spec === 'string' ? spec : (spec as any).param; const p: any = sim.params.find((q: any) => q.id === id); if (!p) { dead.push(`${sim.id}: swept param '${id}' not found`); continue; } A = draw({ ...base, [id]: p.min }); B = draw({ ...base, [id]: p.min + (p.max - p.min) * 0.3 }); }
  if (A === B) dead.push(`${sim.id}: sweeping ${JSON.stringify(spec)} changes nothing`);
}
console.log(`sweep check: ${checked} sweepable sims, ${dead.length} ineffective`); console.log(dead.join('\n'));
