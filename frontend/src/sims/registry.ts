import type { AnySim, SimSubject } from './types';

/**
 * Every simulation module in this folder is picked up automatically: any export that looks
 * like a simulation (has an id, init, step and draw) is registered. To add a simulation, export
 * `defineSim({...})` from any new `*.ts` file here. Duplicate ids are ignored.
 */
const modules = import.meta.glob('./*.ts', { eager: true }) as Record<string, Record<string, unknown>>;
const SKIP = /\/(registry|types|draw|curriculumCatalog)\.ts$/;

const isSim = (x: unknown): x is AnySim => {
  const o = x as Partial<AnySim> | null;
  return !!o && typeof o === 'object' && typeof o.id === 'string' && typeof o.init === 'function' && typeof o.step === 'function' && typeof o.draw === 'function';
};

/** Original hand-written sims first (stable order), then the rest by file name. */
const FIRST = ['./physics1.ts', './physics2.ts', './science.ts', './maths.ts', './robotics.ts', './circuits.ts', './deeplearning.ts'];

function collect(): AnySim[] {
  const keys = Object.keys(modules).filter(k => !SKIP.test(k));
  keys.sort((a, b) => {
    const ia = FIRST.indexOf(a), ib = FIRST.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.localeCompare(b);
  });
  const seen = new Set<string>();
  const out: AnySim[] = [];
  for (const k of keys) {
    for (const v of Object.values(modules[k])) {
      const list = Array.isArray(v) ? v : [v];
      for (const s of list) if (isSim(s) && !seen.has(s.id)) { seen.add(s.id); out.push(s); }
    }
  }
  return out;
}

export const SIMS: AnySim[] = collect();

export const SIM_SUBJECTS: SimSubject[] = [
  'Physics', 'Chemistry', 'Biology', 'Math', 'Earth Science',
  'Engineering', 'Electronics', 'Robotics', 'Computer Science', 'Materials', 'Quantum', 'Security',
];
