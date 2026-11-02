// E2E: reading aloud never scrolls the app frame (ribbon stays visible); clicking a word reads from there (on by default).
const { chromium } = await import('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const pg = await (await b.newContext({ viewport: { width: 1300, height: 700 } })).newPage(); pg.setDefaultTimeout(8000);
const errs = []; pg.on('pageerror', e => errs.push(e.message)); let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fail++; };
await pg.addInitScript(() => { const q = []; window.__spoken = q; const synth = window.speechSynthesis; const orig = synth.speak.bind(synth); synth.speak = u => { q.push(u.text); try { orig(u); } catch { /* */ } }; });
await pg.goto(BASE + '/'); await pg.waitForTimeout(1000); await pg.click('[data-testid=nav-notebook]'); await pg.waitForTimeout(600);
const tabTop = () => pg.locator('button:text-is("Voice")').first().evaluate(e => Math.round(e.getBoundingClientRect().top));
const t0 = await tabTop();
await pg.click('[data-seg="c-0"]', { position: { x: 20, y: 8 } }); await pg.waitForTimeout(600);
ok('clicking a word reads aloud', (await pg.evaluate(() => window.__spoken.length)) > 0);
ok('ribbon still in place after click-read', (await tabTop()) === t0);
await pg.evaluate(() => window.speechSynthesis.cancel());
await pg.click('button:text-is("Voice")'); await pg.click('button:has-text("Page")'); await pg.waitForTimeout(1500);
ok('ribbon tabs stay in place while reading', (await tabTop()) === t0, `${t0} -> ${await tabTop()}`);
await pg.evaluate(() => window.speechSynthesis.cancel());
// a browser whose speech never starts: the student must see a message on the Home tab, not just a highlight
const pg2 = await (await b.newContext({ viewport: { width: 1300, height: 700 } })).newPage(); pg2.setDefaultTimeout(9000);
await pg2.addInitScript(() => { window.speechSynthesis.speak = () => {}; window.speechSynthesis.cancel = () => {}; });
await pg2.goto(BASE + '/'); await pg2.waitForTimeout(800); await pg2.click('[data-testid=nav-notebook]'); await pg2.waitForTimeout(500);
await pg2.click('[data-seg="c-0"]', { position: { x: 20, y: 8 } });
await pg2.waitForSelector('[data-testid=reader-error]', { timeout: 9000 }).then(async () => ok('silent browser: error shown on the Home tab', /No sound came out/.test(await pg2.textContent('[data-testid=reader-error]')))).catch(() => ok('silent browser: error shown on the Home tab', false, 'no error toast'));
await pg2.click('[data-testid=reader-error] button:has-text("Voice options")'); await pg2.click('[data-testid=voice-test]'); await pg2.waitForSelector('[data-testid=voice-diag]', { timeout: 9000 }).then(async () => ok('Test voice button explains what the browser did', /voices found/.test(await pg2.textContent('[data-testid=voice-diag]')))).catch(() => ok('Test voice button explains what the browser did', false, 'no diagnosis'));
ok('no page errors', errs.length === 0, errs.join('|')); await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
