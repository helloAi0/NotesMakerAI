// E2E: notebook text undo/redo (callout insert, typing, toolbar buttons and Ctrl+Z/Ctrl+Y).
const { chromium } = await import('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const pg = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage(); pg.setDefaultTimeout(8000);
const errs = []; pg.on('pageerror', e => errs.push(e.message)); let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fail++; };
await pg.goto(BASE + '/'); await pg.waitForTimeout(1000); await pg.click('[data-testid=nav-notebook]'); await pg.waitForTimeout(600);
await pg.click('button:text-is("Insert")'); await pg.click('button:has-text("Callout")'); await pg.waitForTimeout(400);
const ta = pg.locator('textarea').first(); const val = () => ta.inputValue();
ok('callout inserted', /> Note:/.test(await val()));
await pg.click('[aria-label=Undo]'); await pg.waitForTimeout(200); ok('toolbar Undo removes callout', !/> Note:/.test(await val()), await val());
await pg.click('[aria-label=Redo]'); await pg.waitForTimeout(200); ok('toolbar Redo restores callout', /> Note:/.test(await val()));
await pg.click('button:has-text("Checklist")'); await pg.waitForTimeout(300); ok('checklist inserted', /- \[ \]/.test(await val()));
await ta.focus(); await pg.keyboard.press('Control+z'); await pg.waitForTimeout(200); ok('Ctrl+Z removes checklist only', !/- \[ \]/.test(await val()) && /> Note:/.test(await val()), await val());
await pg.keyboard.press('Control+z'); await pg.waitForTimeout(200); ok('Ctrl+Z again removes callout', !/> Note:/.test(await val()));
await pg.keyboard.press('Control+y'); await pg.waitForTimeout(200); ok('Ctrl+Y redoes', /> Note:/.test(await val()));
ok('no page errors', errs.length === 0, errs.join('|')); await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
