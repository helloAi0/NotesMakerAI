const { chromium } = await import('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const pg = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); pg.setDefaultTimeout(20000);
const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push('console: ' + m.text().slice(0, 150)));
await pg.goto(BASE + '/'); await pg.waitForTimeout(1200); await pg.click('[data-testid=nav-friday]');
const qs = JSON.parse(process.argv[2]);
for (const q of qs) { await pg.click('[data-testid=nav-friday]'); await pg.waitForTimeout(300); const before = await pg.locator('[data-testid=friday-reply]').count(); await pg.fill('[data-testid=friday-input]', q, { timeout: 4000 }).catch(async e => { console.log("FILL FAIL", e.message.slice(0,80), errs); await pg.screenshot({ path: "/tmp/crash.png" }); process.exit(1); }); await pg.click('[data-testid=friday-send]'); await pg.waitForFunction(n => document.querySelectorAll('[data-testid=friday-reply]').length > n, before, { timeout: 25000 }).catch(() => {}); await pg.waitForTimeout(1200);
  const t = await pg.locator('[data-testid=friday-reply]').last().innerText().catch(() => '(none)'); console.log('\n### ' + q + '\n' + t.replace(/\n+/g, '\n').slice(0, 420)); }
console.log('\nERRORS:', errs); await b.close();
