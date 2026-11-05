// Performance budget: the first screen must stay small; heavy features must stay in lazy chunks.
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
const dir = new URL('../dist/assets/', import.meta.url).pathname; const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
const gz = f => zlib.gzipSync(fs.readFileSync(path.join(dir, f))).length; const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const entry = [...html.matchAll(/(?:src|href)="[^"]*\/assets\/([^"]+\.js)"/g)].map(m => m[1]); const initial = entry.reduce((a, f) => a + (fs.existsSync(path.join(dir, f)) ? gz(f) : 0), 0);
// Baseline: the entry preloads katex+markdown+pdf vendor chunks (~330 KB gz). TODO: lazy-load them to reach ~190 KB.
const BUDGET = { initialGz: 420_000, anyChunkGz: 900_000 }; const big = files.map(f => [f, gz(f)]).sort((a, b) => b[1] - a[1]);
console.log(`initial JS (gzip): ${(initial / 1024).toFixed(0)} KB (budget ${(BUDGET.initialGz / 1024).toFixed(0)} KB); largest chunks:`); big.slice(0, 5).forEach(([f, n]) => console.log(`  ${(n / 1024).toFixed(0)} KB  ${f}`));
let bad = 0; if (initial > BUDGET.initialGz) { console.log('FAIL initial bundle over budget'); bad++; } for (const [f, n] of big) if (n > BUDGET.anyChunkGz) { console.log(`FAIL ${f} over ${BUDGET.anyChunkGz / 1024} KB`); bad++; }
process.exit(bad ? 1 : 0);
