// E2E: reading aloud never scrolls the app frame (ribbon stays visible); click-to-speak is off by default.
const { chromium } = await import('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const pg = await (await b.newContext({ viewport: { width: 1300, height: 700 } })).newPage(); pg.setDefaultTimeout(8000);
const errs = []; pg.on('pageerror', e => errs.push(e.message)); let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fail++; };
await pg.addInitScript(() => { const q = []; window.__spoken = q; const synth = window.speechSynthesis; const orig = synth.speak.bind(synth); synth.speak = u => { q.push(u.text); try { orig(u); } catch { /* */ } }; });
await pg.goto(BASE + '/'); await pg.waitForTimeout(1000); await pg.click('[data-testid=nav-notebook]'); await pg.waitForTimeout(600);
const tabTop = () => pg.locator('button:text-is("Voice")').first().evaluate(e => Math.round(e.getBoundingClientRect().top));
const t0 = await tabTop();
ok('click-to-speak off by default', await pg.evaluate(() => localStorage.getItem('nm_click_speak2') !== '1'));
await pg.click('[data-seg="c-0"]', { position: { x: 20, y: 8 } }).catch(() => {}); await pg.waitForTimeout(400);
ok('clicking text does not speak', (await pg.evaluate(() => window.__spoken.length)) === 0);
await pg.click('button:text-is("Voice")'); await pg.click('button:has-text("Page")'); await pg.waitForTimeout(1500);
ok('ribbon tabs stay in place while reading', (await tabTop()) === t0, `${t0} -> ${await tabTop()}`);
await pg.evaluate(() => window.speechSynthesis.cancel());
ok('no page errors', errs.length === 0, errs.join('|')); await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
