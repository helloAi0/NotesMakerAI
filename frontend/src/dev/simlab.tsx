/* Developer-only harness: renders simulations from a sims module as a contact sheet.
   /sim-lab.html?file=physics1&t=3&w=640&h=380&cols=2[&id=projectile][&p.speed=40]
   Not part of the production build (not linked from index.html). */
import { defaultsOf } from '../sims/types';
import type { AnySim } from '../sims/types';

const q = new URLSearchParams(location.search);
const file = q.get('file') || 'registry';
const W = Number(q.get('w') || 640), H = Number(q.get('h') || 380), T = Number(q.get('t') || 3), cols = Number(q.get('cols') || 2);
const only = q.get('id');
const mods = import.meta.glob('../sims/*.ts');

const isSim = (x: unknown): x is AnySim => !!x && typeof x === 'object' && 'init' in (x as object) && 'draw' in (x as object) && 'step' in (x as object);

async function main() {
  const root = document.getElementById('root')!;
  const loader = mods[`../sims/${file}.ts`];
  if (!loader) { root.textContent = `no module ${file}`; return; }
  const m = (await loader()) as Record<string, unknown>;
  const sims: AnySim[] = [];
  for (const v of Object.values(m)) { if (Array.isArray(v)) v.filter(isSim).forEach(s => sims.push(s)); else if (isSim(v)) sims.push(v); }
  const list = only ? sims.filter(s => s.id === only) : sims;
  const grid = document.createElement('div'); grid.className = 'g'; grid.style.gridTemplateColumns = `repeat(${cols}, ${W}px)`; root.appendChild(grid);
  const log: string[] = [];
  for (const sim of list) {
    const cell = document.createElement('div'); cell.className = 'c';
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const cap = document.createElement('div'); cap.textContent = `${sim.id} - ${sim.title}`; cap.style.margin = '4px 0 6px';
    cell.append(cap, cv); grid.appendChild(cell);
    try {
      const v = defaultsOf(sim.params);
      for (const [k, val] of q.entries()) if (k.startsWith('p.') && k.slice(2) in v) v[k.slice(2)] = typeof v[k.slice(2)] === 'number' ? Number(val) : val === 'true' ? true : val === 'false' ? false : val;
      const s = sim.init(v); sim.preview?.(s, v);
      const dt = sim.dt ?? 1 / 240; const n = Math.round(T / dt);
      for (let i = 0; i < n; i++) sim.step(s, v, dt);
      sim.draw(cv.getContext('2d')!, s, v, W, H);
      const bad = sim.readouts(s, v).filter(r => typeof r.value === 'number' && !Number.isFinite(r.value));
      sim.equations?.(s, v);
      if (bad.length) log.push(`${sim.id}: non-finite ${bad.map(b => b.label).join(',')}`);
    } catch (e) { log.push(`${sim.id}: ERROR ${(e as Error).message}`); cap.style.color = '#f87171'; cap.textContent += ' ERROR ' + (e as Error).message; }
  }
  document.title = `done ${list.length}${log.length ? ' ISSUES' : ''}`;
  const pre = document.createElement('pre'); pre.id = 'log'; pre.textContent = log.join('\n') || 'no issues'; root.appendChild(pre);
}
main();
