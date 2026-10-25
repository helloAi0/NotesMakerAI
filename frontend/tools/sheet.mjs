// Contact sheet screenshot: node tools/sheet.mjs <file> <out.png> [t=3] [w=640] [h=380] [cols=2] [id]
// Starts its own vite dev server on a free port, renders /sim-lab.html, saves a full-page PNG and prints issues.
const { chromium } = await import('playwright').catch(() => import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs'));
import { spawn } from 'node:child_process';
const [file, out, t = '3', w = '640', h = '380', cols = '2', id = ''] = process.argv.slice(2);
const port = 5300 + Math.floor(Math.random() * 600);
const srv = spawn('npx', ['vite', '--port', String(port), '--host', '127.0.0.1', '--strictPort'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 4500));
try {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: Number(w) * Number(cols) + 60, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/sim-lab.html?file=${file}&t=${t}&w=${w}&h=${h}&cols=${cols}${id ? '&id=' + id : ''}`);
  await page.waitForFunction(() => document.title.startsWith('done'), null, { timeout: 60000 });
  console.log(await page.locator('#log').innerText(), errs.length ? 'PAGE ERRORS: ' + errs.join('; ') : '');
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
} finally { srv.kill('SIGTERM'); }
