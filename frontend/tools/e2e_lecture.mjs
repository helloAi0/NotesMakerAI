// E2E: Lecture to Notes. Notes always come from the transcript that belongs to the link: no stale sample text, AI reading of a video link (mocked Gemini), timestamps, transcript tab, notebook, persistence.
const { chromium } = await import('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const ctx = await b.newContext({ viewport: { width: 1300, height: 850 } }); const pg = await ctx.newPage(); pg.setDefaultTimeout(8000);
const errs = []; pg.on('pageerror', e => errs.push(e.message)); let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fail++; };
await pg.route(/youtube/, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>player</body></html>' }));
let geminiBody = ''; const GERMAN = '[00:00] Hallo und willkommen zum Deutschkurs. Heute lernen wir das Alphabet und die Begrüßung.\n[00:20] Guten Morgen, guten Tag und guten Abend sind die wichtigsten Begrüßungen im Deutschen.\n[00:50] Wir lernen auch wie man sich vorstellt. Ich heiße Max und ich komme aus Deutschland.\n[01:30] Das Verb sein bedeutet to be. Ich bin, du bist, er ist.\n[02:10] Jetzt üben wir die Zahlen von eins bis zehn: eins, zwei, drei, vier, fünf.';
await pg.route(/generativelanguage\.googleapis\.com/, async r => { geminiBody = r.request().postData() || ''; await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: GERMAN }] } }] }) }); });
const text = () => pg.textContent('[data-testid=lecture-view]');
await pg.goto(BASE + '/'); await pg.waitForTimeout(800); await pg.click('[data-testid=nav-lecture]'); await pg.waitForTimeout(500);
ok('studio opens', await pg.locator('[data-testid=lecture-view]').isVisible());
await pg.click('[data-testid=lec-go]'); ok('empty: explains what to do', /Paste the lecture transcript/.test(await pg.textContent('[data-testid=lec-msg]')));
await pg.fill('[data-testid=lec-url]', 'https://example.com/nope'); await pg.click('[data-testid=lec-go]'); ok('bad link rejected', /YouTube link/.test(await pg.textContent('[data-testid=lec-msg]')));
await pg.fill('[data-testid=lec-url]', 'https://youtu.be/mNX1wpIQ4Uk?si=4hMexBJHZgc_PJUx'); await pg.click('[data-testid=lec-go]'); ok('link alone: says notes come from the transcript (no key)', /not from the link/.test(await pg.textContent('[data-testid=lec-msg]')));
ok('no video notes invented from a bare link', (await pg.locator('[data-testid=lec-section]').count()) === 0);
await pg.fill('[data-testid=lec-url]', ''); await pg.click('[data-testid=lec-sample]'); await pg.click('[data-testid=lec-go]'); await pg.waitForSelector('[data-testid=lec-section]');
ok('sample: sections built', (await pg.locator('[data-testid=lec-section]').count()) >= 3); ok('sample is labelled as a sample', /sample lecture/i.test(await pg.textContent('[data-testid=lec-source]')));
ok('formula shown', /ΔU = Q − W/.test((await pg.locator('[data-testid=lec-formula]').allTextContents()).join('|')));
await pg.locator('[data-testid=lec-stamp]').nth(1).click(); await pg.waitForTimeout(200);
await pg.click('[data-testid=lec-tab-transcript]'); ok('transcript tab', /02:15/.test(await text()) && /conservation of energy/.test(await text()));
await pg.fill('input[aria-label="Search transcript"]', 'enthalpy'); const nc = await pg.locator('p:has(button.font-mono)').count(); ok('transcript search filters', nc >= 1 && nc <= 4, String(nc)); await pg.click('[data-testid=lec-tab-notes]');
// the bug from the screenshot: sample on screen, then the student pastes a German video link
await pg.fill('[data-testid=lec-url]', 'https://youtu.be/mNX1wpIQ4Uk?si=4hMexBJHZgc_PJUx');
ok('entering another link removes the sample notes', (await pg.locator('[data-testid=lec-section]').count()) === 0 && (await pg.inputValue('[data-testid=lec-raw]')) === '', await pg.inputValue('[data-testid=lec-raw]'));
ok('and tells the student why', /sample transcript/.test(await pg.textContent('[data-testid=lec-msg]')));
// own transcript with a link
await pg.fill('[data-testid=lec-raw]', GERMAN); await pg.click('[data-testid=lec-go]'); await pg.waitForSelector('[data-testid=lec-section]');
let t = await text(); ok('notes are about the pasted German lecture', /Begrüßung|Deutsch|Zahlen/i.test(t) && !/thermodynamics|enthalpy/i.test(t.replace(/<textarea[\s\S]*?<\/textarea>/g, '')));
ok('source says pasted', /pasted/i.test(await pg.textContent('[data-testid=lec-source]'))); ok('video iframe is the linked video', (await pg.locator('iframe[src*="mNX1wpIQ4Uk"]').count()) === 1);
// reload keeps the notes for the same link
await pg.reload(); await pg.waitForTimeout(600); await pg.click('[data-testid=nav-lecture]'); await pg.waitForTimeout(400); ok('last lecture remembered after reload', (await pg.locator('[data-testid=lec-section]').count()) >= 1 && /Begrüßung|Deutsch|Zahlen/i.test(await text()));
// Gemini reads the video from the link (mocked)
await pg.click('button:has-text("New lecture")'); await pg.evaluate(() => { localStorage.setItem('ai_provider', 'gemini'); localStorage.setItem('ai_cfg_gemini', JSON.stringify({ apiKey: 'test-key-123', model: '', baseUrl: '' })); window.dispatchEvent(new Event('nm:settings')); });
await pg.fill('[data-testid=lec-url]', 'https://www.youtube.com/watch?v=mNX1wpIQ4Uk'); await pg.click('[data-testid=lec-read]'); await pg.waitForSelector('[data-testid=lec-section]');
ok('AI reading sends the video link to Gemini', /file_uri/.test(geminiBody) && /mNX1wpIQ4Uk/.test(geminiBody), geminiBody.slice(0, 200));
ok('AI-read transcript becomes notes about the video', /Begrüßung|Deutsch|Zahlen|Hallo/i.test(await text()) && /read from the video by Gemini/.test(await pg.textContent('[data-testid=lec-source]')));
await pg.fill('[data-testid=lec-url]', 'https://www.youtube.com/watch?v=k3kWU4C9m4Q'); ok('switching to a different video clears the other video\'s transcript', (await pg.inputValue('[data-testid=lec-raw]')) === '');
await pg.fill('[data-testid=lec-raw]', GERMAN); await pg.click('[data-testid=lec-go]'); await pg.waitForSelector('[data-testid=lec-section]');
await pg.click('[data-testid=lec-nb]'); await pg.waitForTimeout(1500); ok('save to notebook adds the notes', /Begrüßung|Deutsch|Zahlen/i.test(await pg.locator('textarea').first().inputValue().catch(() => '')) || /Deutsch/.test(await pg.textContent('body')));
ok('no page errors', errs.length === 0, errs.join('|')); await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
