// E2E: touching a line reads aloud. Every click on the typed-notes line's full height and width (including between words and on the spare line height) starts reading from the nearest word.
const { chromium } = await import('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const pg = await (await b.newContext({ viewport: { width: 1300, height: 1000 } })).newPage(); pg.setDefaultTimeout(8000);
const errs = []; pg.on('pageerror', e => errs.push(e.message)); let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fail++; };
await pg.addInitScript(() => { window.__spoken = []; const s = window.speechSynthesis; s.speak = u => { window.__spoken.push(u.text); }; s.cancel = () => {}; });
await pg.goto(BASE + '/'); await pg.waitForTimeout(800); await pg.click('[data-testid=nav-notebook]'); await pg.waitForTimeout(500);
await pg.click('button:has-text("Edit")'); await pg.locator('textarea').first().fill('Human anatomy and physiological mechanism study notes.\nSecond line about the heart.'); await pg.click('button:has-text("Read")'); await pg.waitForTimeout(500);
const r = await pg.evaluate(() => { const sp = document.querySelector('[data-seg="n0-0"]'); const d = sp.parentElement.getBoundingClientRect(), q = sp.getClientRects()[0]; return { x: q.x, y: d.y, w: q.width, h: d.height, spanH: q.height }; });
ok('the line box is taller than the text (the old dead zone exists)', r.h > r.spanH, JSON.stringify(r));
let hit = 0, tot = 0; const miss = [];
for (let yy = 1; yy < r.h; yy += 4) for (let xx = 2; xx < r.w; xx += 14) { await pg.evaluate(() => { window.__spoken.length = 0; }); await pg.mouse.click(r.x + xx, r.y + yy); await pg.waitForTimeout(60); tot++; if (await pg.evaluate(() => window.__spoken.length)) hit++; else miss.push([Math.round(xx), Math.round(yy)]); }
ok(`every touch on the line reads (${hit}/${tot})`, hit === tot, JSON.stringify(miss.slice(0, 6)));
await pg.evaluate(() => { window.__spoken.length = 0; }); await pg.mouse.click(r.x + r.w / 2, r.y + 2); await pg.waitForTimeout(100);
const said = await pg.evaluate(() => window.__spoken[0] || ''); ok('reading starts from the touched word, not the sentence start', said.length > 0 && said.length < 'Human anatomy and physiological mechanism study notes.'.length, said);
ok('no page errors', errs.length === 0, errs.join('|')); await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
