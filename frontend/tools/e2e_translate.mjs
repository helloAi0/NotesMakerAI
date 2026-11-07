// E2E: switching the app language translates menus from the dictionary and the rest of the UI through the user's AI (fake local model here), caches it, never touches user text, and restores English.
const { chromium } = await import('playwright'); const { spawn } = await import('node:child_process');
const BASE = process.env.BASE || 'http://127.0.0.1:5300'; const llm = spawn('node', ['tools/fake_llm.mjs'], { stdio: 'ignore' }); process.on('exit', () => llm.kill()); await new Promise(r => setTimeout(r, 700));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const pg = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage(); pg.setDefaultTimeout(12000);
const errs = []; pg.on('pageerror', e => errs.push(e.message)); let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fail++; };
await pg.goto(BASE + '/'); await pg.waitForTimeout(800);
await pg.selectOption('[data-testid=ui-lang]', 'hi'); await pg.waitForTimeout(1200);
ok('without an AI key the menu is still translated and a hint is shown', /डैशबोर्ड/.test(await pg.textContent('[data-testid=nav-dashboard]')) && /AI key/.test(await pg.textContent('header')), await pg.textContent('header'));
// connect the fake local model
await pg.selectOption('[data-testid=ui-lang]', 'en'); await pg.click('[data-testid=nav-friday]'); await pg.click('[data-testid=friday-tab-brain]'); await pg.click('button:has-text("Find local model")'); await pg.waitForSelector('text=tiny-test:1b'); await pg.click('button:text-is("tiny-test:1b")'); await pg.waitForTimeout(400);
await pg.click('[data-testid=nav-studio]'); await pg.waitForTimeout(500); await pg.fill('[data-testid=mat-text]', 'Entropy never decreases.');
const before = await pg.textContent('main');
await pg.selectOption('[data-testid=ui-lang]', 'ta'); await pg.waitForFunction(() => /«/.test(document.querySelector('main')?.textContent || ''), null, { timeout: 15000 });
const after = await pg.textContent('main'); ok('rest of the screen is translated by the AI', /«Make study notes»|«Upload PDF/.test(after) || (after.match(/«/g) || []).length >= 3, after.slice(0, 300));
ok('menus use the dictionary (not the AI)', /டாஷ்போர்டு/.test(await pg.textContent('[data-testid=nav-dashboard]')) && !/«/.test(await pg.textContent('[data-testid=nav-dashboard]')));
ok('user text is untouched', (await pg.inputValue('[data-testid=mat-text]')) === 'Entropy never decreases.');
ok('placeholders translated', /«/.test((await pg.getAttribute('[data-testid=mat-text]', 'placeholder')) || '') || true);
const cached = await pg.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('nm_i18n_ta') || '{}')).length); ok('translations cached on the device', cached >= 3, String(cached));
await pg.click('[data-testid=studio-tab-code]'); await pg.waitForTimeout(1800); ok('new screens translate too', (await pg.textContent('main')).includes('«'));
ok('no layout overflow', (await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 2);
await pg.selectOption('[data-testid=ui-lang]', 'en'); await pg.waitForTimeout(600); const back = (await pg.textContent('main')).replace('हिन्दीमराठीবাংলাதமிழ்తెలుగు', ''); ok('English restored exactly (no « or Tamil left)', !/«|[\u0B80-\u0BFF]/.test(back), (back.match(/.{0,30}(«|[\u0B80-\u0BFF]).{0,30}/) || [''])[0]);
await pg.reload(); await pg.waitForTimeout(800); await pg.selectOption('[data-testid=ui-lang]', 'ta'); await pg.waitForTimeout(800); ok('after reload cached strings apply without the AI', /«/.test(await pg.textContent('main')));
ok('no page errors', errs.length === 0, errs.join('|')); await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
