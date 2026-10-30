import { SIMS } from '../src/sims/registry.ts';
import { resolveCurriculum, unknownCatalogIds } from '../src/sims/curriculumCatalog.ts';
const r = resolveCurriculum(SIMS), bad = unknownCatalogIds(SIMS), planned = r.filter(t => t.status === 'planned');
if (process.argv.includes('-v')) for (const t of r) console.log(`[${t.band}] ${t.title} -> ${t.sims.map(s => s.id).join(', ')}`);
console.log('topics', r.length, 'planned', planned.length, 'unknown ids', bad.length);
if (bad.length) console.log(bad.join('\n'));
const used = new Set(r.flatMap(t => t.sims.map(s => s.id))); console.log('sims referenced by the catalog:', used.size, 'of', SIMS.length);
if (planned.length || bad.length) process.exit(1);
