import { SIMS } from '../src/sims/registry.ts';
const uni = SIMS.filter(s => (s.educationLevels ?? []).some(l => ['B.Tech','B.Sc','BBA','BCA','M.Tech','M.Sc'].includes(String(l))));
console.log('total', SIMS.length, 'university/PG', uni.length);
const by: Record<string, number> = {}; for (const s of uni) by[s.subject] = (by[s.subject] ?? 0) + 1; console.log(by);
