// Edge-case fuzz for EVERY simulation: npx tsx tools/fuzz.mts [idSubstring]
import fs from 'fs'; import path from 'path';
import { defaultsOf } from '../src/sims/types.ts';
let nanArgs = 0; let curCall = '';
const noop = () => {};
const ctx: any = new Proxy({}, { get: (_t, k: string) => {
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
  if (k === 'measureText') return () => ({ width: 10 });
  if (k === 'canvas') return { width: 700, height: 440 };
  return (...a: any[]) => { for (const x of a) if (typeof x === 'number' && !Number.isFinite(x)) { nanArgs++; curCall = String(k) + '(' + a.map(q => typeof q === 'number' ? (Number.isFinite(q) ? +q.toFixed(1) : String(q)) : '…').join(',') + ')'; } }; },
  set: (_t, k, v) => { if (typeof v === 'number' && !Number.isFinite(v)) { nanArgs++; curCall = 'set ' + String(k); } return true; } });
const dir = path.resolve('src/sims'); const sims: any[] = []; const seen = new Set<string>();
for (const f of fs.readdirSync(dir)) { if (!f.endsWith('.ts') || /^(registry|types|draw|curriculumCatalog)\.ts$/.test(f)) continue; const m: any = await import(path.join(dir, f)); for (const v of Object.values(m)) for (const s of (Array.isArray(v) ? v : [v]) as any[]) if (s && typeof s === 'object' && s.id && typeof s.init === 'function' && typeof s.draw === 'function' && !seen.has(s.id)) { seen.add(s.id); sims.push(s); } }
const filter = process.argv[2]; let bad = 0, runs = 0;
const rng = (() => { let a = 12345; return () => (a = (a * 1664525 + 1013904223) >>> 0) / 2 ** 32; })();
const SIZES: [number, number][] = [[700, 440], [360, 300], [320, 240], [240, 160], [160, 120], [1200, 700]];
const report = (id: string, what: string) => { bad++; console.log(`  ${id}: ${what}`); };
for (const sim of sims) {
  if (filter && !sim.id.includes(filter)) continue;
  const dt = sim.dt ?? 1 / 240; const P = sim.params as any[]; const combos: Record<string, any>[] = []; const base = defaultsOf(P);
  combos.push({ ...base });
  combos.push(Object.fromEntries(P.map(p => [p.id, p.kind === 'number' ? p.min : p.kind === 'toggle' ? false : p.options[0].value])));
  combos.push(Object.fromEntries(P.map(p => [p.id, p.kind === 'number' ? p.max : p.kind === 'toggle' ? true : p.options[p.options.length - 1].value])));
  for (let k = 0; k < 8; k++) combos.push(Object.fromEntries(P.map(p => [p.id, p.kind === 'number' ? (rng() < 0.3 ? (rng() < 0.5 ? p.min : p.max) : p.min + Math.round((rng() * (p.max - p.min)) / p.step) * p.step) : p.kind === 'toggle' ? rng() < 0.5 : p.options[Math.floor(rng() * p.options.length)].value])));
  for (const v of combos) {
    runs++; const tag = JSON.stringify(v).slice(0, 140);
    try {
      nanArgs = 0; const s = sim.init(v); sim.preview?.(s, v);
      const steps = Math.min(Math.round(30 / dt), 20000);
      for (let i = 0; i < steps; i++) { sim.step(s, v, dt);
        if (i % 3000 === 1000 && sim.pointer) for (const e of [{ kind: 'down', x: -50, y: -50 }, { kind: 'move', x: 99999, y: 99999 }, { kind: 'move', x: 350, y: 220 }, { kind: 'up', x: 0, y: 0 }]) { try { sim.pointer(s, v, { ...e, w: 700, h: 440 }); } catch (err: any) { report(sim.id, `pointer ${e.kind} threw ${err.message} @ ${tag}`); } } }
      for (const [w, h] of SIZES) { sim.draw(ctx, s, v, w, h); if (nanArgs) { report(sim.id, `NaN passed to ${curCall} at ${w}x${h} @ ${tag}`); nanArgs = 0; } }
      const r = sim.readouts(s, v); for (const x of r) { if (typeof x.value === 'number' && !Number.isFinite(x.value)) report(sim.id, `readout "${x.label}" non-finite @ ${tag}`); if (typeof x.value === 'string' && /NaN|undefined|Infinity/.test(x.value)) report(sim.id, `readout "${x.label}" text "${x.value}"`); }
      for (const q of sim.equations?.(s, v) ?? []) if (/NaN|undefined|Infinity|\[object/.test(q)) report(sim.id, `equation has bad value: ${q.slice(0, 80)} @ ${tag}`);
      for (const a of sim.actions ?? []) { sim.action?.(s, v, a.id); for (let i = 0; i < 50; i++) sim.step(s, v, dt); sim.draw(ctx, s, v, 360, 300); if (nanArgs) { report(sim.id, `NaN after action ${a.id}: ${curCall}`); nanArgs = 0; } }
    } catch (e: any) { report(sim.id, `THREW ${e.message} @ ${tag}`); }
  }
}
console.log(`${sims.length} sims, ${runs} parameter combinations, ${bad} problems`); process.exit(bad ? 1 : 0);
