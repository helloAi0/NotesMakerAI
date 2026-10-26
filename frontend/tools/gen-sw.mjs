// Run after `vite build`: writes the list of built files into dist/sw.js so the app works fully offline.
import fs from 'fs'; import path from 'path';
const dist = path.resolve('dist'); const out = [];
const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : out.push('./' + path.relative(dist, p).split(path.sep).join('/')); } };
walk(dist);
const files = out.filter(f => f !== './sw.js');
const sw = path.join(dist, 'sw.js'); let s = fs.readFileSync(sw, 'utf8');
s = s.replace('__PRECACHE__', JSON.stringify(['./', ...files])).replace('__VERSION__', String(Date.now()));
fs.writeFileSync(sw, s); console.log(`sw.js: precaching ${files.length} files`);
