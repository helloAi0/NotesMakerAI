// E2E: FRIDAY routes to a local OpenAI/Ollama-compatible server (tools/fake_llm.mjs on :11434), streams, plans and reviews.
const { chromium } = await import('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const pg = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); pg.setDefaultTimeout(20000);
const errs = []; pg.on('pageerror', e => errs.push(e.message));
let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fail++; };
await pg.goto(BASE + '/'); await pg.waitForTimeout(1200); await pg.click('[data-testid=nav-friday]');
await pg.click('[data-testid=friday-tab-brain]'); await pg.click('button:has-text("Find local model")'); await pg.waitForSelector('text=tiny-test:1b');
ok('detects local server and models', await pg.locator('text=llama3.1:8b-instruct').count() > 0);
await pg.click('button:text-is("tiny-test:1b")'); await pg.waitForTimeout(500);
ok('engine reads Local model', /Local model/.test(await pg.innerText('[data-testid=brain-panel]')));
await pg.click('[data-testid=friday-tab-chat]');
const ask = async q => { const n = await pg.locator('[data-testid=friday-reply]').count(); await pg.fill('[data-testid=friday-input]', q); await pg.click('[data-testid=friday-send]'); await pg.waitForFunction(k => document.querySelectorAll('[data-testid=friday-reply]').length > k && !document.querySelector('[data-testid=friday-reply]:last-of-type .animate-spin'), n); await pg.waitForTimeout(1200); return pg.locator('[data-testid=friday-reply]').last().innerText(); };
let t = await ask('what is the capital of France'); ok('answers from local model', /MODEL-ANSWER/.test(t), t.slice(0, 200)); ok('label shows local engine', /Local model/.test(t));
ok('math rendered with KaTeX', await pg.locator('[data-testid=friday-reply] .katex').count() > 0);
t = await ask('please create a folder called Planned and list files'); ok('model planner or offline planner makes folder', /Planned/.test(t), t.slice(0, 300));
await pg.click('[data-testid=friday-tab-brain]'); await pg.check('text=Deep thinking'); await pg.click('[data-testid=friday-tab-chat]');
t = await ask('explain energy of a photon'); ok('deep thinking second pass', /REVIEWED/.test(t), t.slice(0, 200));
// routing preference: offline only must not call the server
await pg.click('[data-testid=friday-tab-brain]'); await pg.selectOption('[data-testid=brain-panel] select', 'offline'); await pg.click('[data-testid=friday-tab-chat]');
t = await ask('what is the capital of Spain'); ok('offline preference bypasses model', !/MODEL-ANSWER/.test(t), t.slice(0, 120));
ok('no page errors', errs.length === 0, errs.join('|')); await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
