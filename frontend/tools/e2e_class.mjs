// E2E: quick start (notes → cards → quiz), student report export, teacher class dashboard (incl. tampered file).
const { chromium } = await import('playwright').catch(() => import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs'));
const BASE = process.env.BASE || 'http://localhost:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); const pg = await ctx.newPage(); pg.setDefaultTimeout(15000);
const errs = []; pg.on('pageerror', e => errs.push(e.message));
let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fail++; };
await pg.goto(BASE + '/'); await pg.waitForTimeout(800); await pg.click('[data-testid=nav-friday]'); await pg.waitForTimeout(500);
await pg.click('[data-testid=friday-tab-class]'); await pg.waitForSelector('[data-testid=class-panel]');
const notes = 'Enthalpy is the heat content of a system at constant pressure. Entropy is a measure of disorder in a system. Power = work / time. Velocity is the rate of change of position.';
await pg.fill('[data-testid=qs-topic]', 'thermodynamics'); await pg.fill('[data-testid=qs-text]', notes); await pg.click('[data-testid=qs-build]');
await pg.waitForSelector('[data-testid=tutor-panel]', { timeout: 5000 }).then(() => ok('quick start opens the Tutor', true), () => ok('quick start opens the Tutor', false));
const nc = parseInt(await pg.innerText('[data-testid=tutor-cards]'), 10); ok('flashcards were created', nc >= 2, String(nc));
// review a few cards so the report has activity
for (let i = 0; i < 2; i++) { const shown = await pg.locator('[data-testid=review] button').filter({ hasText: /show|reveal/i }).first(); if (await shown.count()) await shown.click().catch(() => {}); const good = pg.getByRole('button', { name: 'Good', exact: true }); if (await good.count()) await good.click().catch(() => {}); }
await pg.click('[data-testid=friday-tab-class]'); await pg.waitForSelector('[data-testid=my-report]');
ok('report preview shows the topic', /1 topic/.test(await pg.innerText('[data-testid=rep-preview]')) || /topic/.test(await pg.innerText('[data-testid=rep-preview]')), await pg.innerText('[data-testid=rep-preview]'));
await pg.fill('[data-testid=rep-name]', 'Asha Rao');
const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-testid=rep-export]')]); const path = await dl.path(); const fs = await import('node:fs'); const txt = fs.readFileSync(path, 'utf8');
const j = JSON.parse(txt); ok('report downloaded with name and no note text', j.student === 'Asha Rao' && !/heat content/.test(txt), txt.slice(0, 120));
// teacher import: the good report, a second student, a tampered one, garbage
const mk = (o) => ({ name: o.n, mimeType: 'application/json', buffer: Buffer.from(o.t) });
const tam = JSON.parse(txt); tam.student = 'Tamper'; tam.topics[0].mastery = 1;
const ben = JSON.parse(txt); ben.student = 'Ben'; // student name changed without checksum → also invalid
await pg.setInputFiles('[data-testid=cls-file]', [mk({ n: 'asha.json', t: txt }), mk({ n: 'tamper.json', t: JSON.stringify(tam) }), mk({ n: 'junk.json', t: 'hello' }), mk({ n: 'ben.json', t: JSON.stringify(ben) })]);
await pg.waitForSelector('[data-testid=cls-summary]');
ok('only the valid report is counted', (await pg.innerText('[data-testid=cls-n]')).trim() === '1');
const e = await pg.locator('[data-testid=cls-err]').allInnerTexts(); ok('edited and invalid files are rejected with a reason', e.length === 3 && e.some(x => /checksum/.test(x)) && e.some(x => /not a valid report/.test(x)), e.join('|'));
const [csv] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-testid=cls-csv]')]); const c = fs.readFileSync(await csv.path(), 'utf8'); ok('CSV has header + 1 student', c.split('\n').length === 2 && /Asha Rao/.test(c), c);
ok('no page errors', errs.length === 0, errs.join('|')); await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
