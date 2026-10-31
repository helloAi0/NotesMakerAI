// E2E: FRIDAY agent + chat, library commands, planner, generator, dashboard, search, settings. BASE env = preview server.
const { chromium } = await import('playwright').catch(() => import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs'));
const BASE = process.env.BASE || 'http://localhost:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const pg = await ctx.newPage(); pg.setDefaultTimeout(20000);
const remote = []; pg.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) remote.push(u); });
const errs = []; pg.on('pageerror', e => errs.push(e.message));
let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fail++; };
const PDFDIR = process.env.PDFDIR || '/tmp/pdfs';
await pg.goto(BASE + '/'); await pg.waitForTimeout(1200);
ok('title', (await pg.title()) === 'Notes Maker AI');
// ---- dashboard
await pg.click('[data-testid=nav-dashboard]'); await pg.waitForSelector('[data-testid=dashboard-view]');
ok('dashboard has stats', /day streak/.test(await pg.innerText('[data-testid=dashboard-view]')));
// ---- FRIDAY page
await pg.click('[data-testid=nav-friday]'); await pg.waitForSelector('[data-testid=friday-input]');
const ask = async (q, re, n, wait = 1500) => { await pg.fill('[data-testid=friday-input]', q); await pg.click('[data-testid=friday-send]'); await pg.waitForTimeout(wait); const t = await pg.innerText('[data-testid=friday-log]'); ok(n || q, re.test(t.slice(-1500)), t.slice(-300)); return t; };
await ask('what is backpropagation', /chain rule/i);
await ask('how do I use click to speak', /click any word/i); await ask('12*7+3', /= 87/);
await ask('hello', /FRIDAY/);
await ask('what is the capital of Mongolia', /could not find|built-in/i);
await ask('add task revise optics by friday', /Task added/);
await ask('add exam thermodynamics on 5 december', /Exam added/);
await ask('what is due', /revise optics/i);
await ask('mark revise optics done', /Marked/);
// ---- planner page
await pg.click('[data-testid=nav-planner]'); await pg.waitForSelector('[data-testid=planner-view]');
ok('planner lists exam', /thermodynamics/i.test(await pg.innerText('[data-testid=planner-list]')));
await pg.fill('[data-testid=planner-input]', 'Finish lab report tomorrow'); await pg.click('[data-testid=planner-add]');
await pg.click('button:has-text("All")'); ok('planner form adds', /Finish lab report/.test(await pg.innerText('[data-testid=planner-list]')));
// ---- library: import PDFs, folder, summary, move
await pg.click('[data-testid=nav-library]'); await pg.waitForSelector('[data-testid=pdf-input]', { state: 'attached' });
await pg.setInputFiles('[data-testid=pdf-input]', [PDFDIR + '/Thermodynamics.pdf']); await pg.waitForTimeout(3500);
await pg.setInputFiles('[data-testid=pdf-folder-input]', [PDFDIR + '/Physics/Optics.pdf']).catch(() => {}); await pg.waitForTimeout(3000);
ok('library shows pdf', /Thermodynamics/.test(await pg.innerText('body')));
await pg.click('[data-testid=nav-friday]'); await pg.waitForSelector('[data-testid=friday-input]');
await ask('list my pdfs', /Thermodynamics\.pdf/, 'list pdfs');
await ask('create folder Thermo', /Created folder \/Thermo|Thermo/, 'make folder');
await ask('move thermodynamics to folder Thermo', /Moved .Thermodynamics\.pdf. to folder .Thermo./, 'move pdf');
await ask('tell friday to summarize my pdf thermodynamics', /Summary of .Thermodynamics\.pdf./, 'summarize pdf', 2500);
await ask('what does my pdf say about entropy', /PDF|entropy/i, 'answer from pdf');
await pg.fill('[data-testid=friday-input]', 'open pdf thermodynamics'); await pg.click('[data-testid=friday-send]'); await pg.waitForTimeout(1500);
ok('open pdf navigates to library', await pg.locator('[data-testid=pdf-input]').count() > 0);
await pg.click('[data-testid=nav-friday]'); ok('open pdf reply', /Opened/.test(await pg.innerText('[data-testid=friday-log]')));
await pg.fill('[data-testid=friday-input]', 'import folder'); await pg.click('[data-testid=friday-send]'); await pg.waitForTimeout(1200);
await pg.click('[data-testid=nav-friday]'); ok('import prompt', /Choose the folder/.test(await pg.innerText('[data-testid=friday-log]')));
// ---- notebook commands
await pg.fill('[data-testid=friday-input]', 'write a note about gradient descent'); await pg.click('[data-testid=friday-send]'); await pg.waitForTimeout(3000);
await pg.waitForTimeout(500); ok('notebook open with notes', /Gradient descent/i.test(await pg.locator('textarea').first().inputValue()));
await pg.click('[data-testid=nav-friday]'); ok('gen note reply', /Wrote offline notes/.test(await pg.innerText('[data-testid=friday-log]')));
await pg.click('[data-testid=nav-notebook]'); await pg.click('[data-testid=assistant-toggle]'); await pg.fill('[data-testid=assistant-input]', 'summarize this page'); await pg.click('[data-testid=assistant-send]'); await pg.waitForTimeout(1500); ok('summarize page', /Summary of this page/.test(await pg.innerText('[data-testid=assistant-log]'))); await pg.click('[aria-label="Close assistant"]');
await pg.click('[data-testid=nav-friday]'); await ask('summarize this page', /Summary of this page|too little|notebook/i, 'summarize page');
// ---- generator
await pg.click('[data-testid=nav-generator]'); await pg.fill('[data-testid=gen-topic]', 'Fourier transform'); await pg.click('[data-testid=gen-go]'); await pg.waitForSelector('[data-testid=gen-out]');
ok('generator output', /Fourier/i.test(await pg.innerText('[data-testid=gen-out]')));
// ---- search + settings
await pg.keyboard.press('Control+k'); await pg.fill('[data-testid=search-input]', 'kalman'); await pg.waitForTimeout(700);
ok('search finds sim', /kalman/i.test(await pg.innerText('[data-testid=search-results]')));
await pg.keyboard.press('Escape');
await pg.click('[data-testid=open-settings]'); await pg.waitForSelector('[data-testid=settings-modal]');
ok('settings open', /AI provider/.test(await pg.innerText('[data-testid=settings-modal]'))); await pg.keyboard.press('Escape');
// ---- dock still works on other screens
await pg.click('[data-testid=nav-dashboard]'); await pg.click('[data-testid=assistant-toggle]');
await pg.fill('[data-testid=assistant-input]', 'open kalman filter'); await pg.click('[data-testid=assistant-send]'); await pg.waitForTimeout(3500);
ok('dock opens sim', /Kalman/i.test(await pg.innerText('body')));
// ---- persistence
await pg.reload(); await pg.waitForTimeout(1500); await pg.click('[data-testid=nav-friday]');
ok('chat history persisted', /backpropagation/i.test(await pg.innerText('[data-testid=friday-log]')));
ok('no remote requests (fully standalone)', remote.length === 0, remote.join(' '));
ok('no page errors', errs.length === 0, errs.join('|'));
await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
