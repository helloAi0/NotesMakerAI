// Runs before `npm run dev/build`: if you pulled new code that added a dependency, install it automatically.
import fs from 'node:fs'; import { execSync } from 'node:child_process';
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')); const missing = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(d => !fs.existsSync(new URL(`../node_modules/${d}/package.json`, import.meta.url)));
if (missing.length) { console.log('Installing missing packages:', missing.join(', ')); execSync('npm install', { stdio: 'inherit' }); }
