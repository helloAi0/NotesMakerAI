// E2E: the Electron desktop shell — serves the app, hides to the tray instead of quitting, and reminders still fire while the window is hidden.
import { spawn } from 'node:child_process'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const { chromium } = await import('playwright').catch(() => import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs'));
const D = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'desktop'); const electron = path.join(D, 'node_modules', '.bin', 'electron');
const port = 47999, dbg = 9333; const env = { ...process.env, NM_PORT: String(port), NM_TEST: '1' };
const args = ['.', '--no-sandbox', `--remote-debugging-port=${dbg}`]; const p = process.env.DISPLAY ? spawn(electron, args, { cwd: D, env, stdio: 'pipe' }) : spawn('xvfb-run', ['-a', electron, ...args], { cwd: D, env, stdio: 'pipe' });
let log = ''; p.stdout.on('data', d => (log += d)); p.stderr.on('data', d => (log += d));
let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fail++; }; const sleep = ms => new Promise(r => setTimeout(r, ms));
let b; for (let i = 0; i < 40 && !b; i++) { await sleep(500); b = await chromium.connectOverCDP(`http://127.0.0.1:${dbg}`).catch(() => null); }
if (!b) { console.log('FAIL could not attach to Electron\n' + log.slice(-800)); p.kill(); process.exit(1); }
let pg = b.contexts()[0].pages()[0]; for (let i = 0; i < 20 && !pg; i++) { await sleep(300); pg = b.contexts()[0].pages()[0]; }
await pg.waitForSelector('[data-testid=nav-friday]', { timeout: 30000 });
ok('desktop shell serves the app', new RegExp('127\\.0\\.0\\.1:' + port).test(pg.url()));
ok('preload exposes the desktop bridge', await pg.evaluate(() => !!(window.nmDesktop && window.nmDesktop.isDesktop)));
ok('page cannot reach node', await pg.evaluate(() => typeof require === 'undefined' && typeof process === 'undefined'));
await pg.click('[data-testid=nav-friday]'); await pg.fill('[data-testid=friday-input]', 'what is 12 * 7'); await pg.click('[data-testid=friday-send]');
ok('FRIDAY works inside the desktop app', await pg.waitForFunction(() => /84/.test(document.body.innerText), null, { timeout: 15000 }).then(() => true).catch(() => false));
await pg.evaluate(() => localStorage.setItem('nm_friday_reminders', JSON.stringify([{ id: 'r1', text: 'revise enthalpy', at: Date.now() + 3000, done: false }])));
await pg.reload(); await pg.waitForSelector('[data-testid=nav-friday]');
await pg.evaluate(() => window.nmDesktopTest.closeWindow()); await sleep(600);
const st = await pg.evaluate(() => window.nmDesktopTest.state()); ok('closing the window hides it instead of quitting', st.exists && st.visible === false && p.exitCode === null, JSON.stringify(st));
await sleep(26000); const st2 = await pg.evaluate(() => window.nmDesktopTest.state()); ok('native notification raised while the window is hidden', st2.visible === false && st2.notes.some(n => /enthalpy/.test(n.body)), JSON.stringify(st2));
p.kill('SIGTERM'); await sleep(500); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
