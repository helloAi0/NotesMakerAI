// E2E: click-to-speak (word level, selection, typing box, handwriting OCR), live streaming dictation, voice formatting.
const { chromium } = await import('playwright').catch(() => import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs'));
const BASE = process.env.BASE || 'http://localhost:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const pg = await b.newPage({ viewport: { width: 1400, height: 1000 } }); pg.setDefaultTimeout(30000);
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.addInitScript(() => {
  window.__spoken = []; window.__recs = [];
  const synth = { speaking: false, paused: false, getVoices() { return []; }, addEventListener() {}, removeEventListener() {}, speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onstart && u.onstart({}), 0); }, cancel() {}, pause() {}, resume() {} };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  window.SpeechRecognition = function () { const r = this; r.start = () => { window.__recs.push(r); setTimeout(() => r.onstart && r.onstart(), 0); }; r.stop = () => setTimeout(() => r.onend && r.onend(), 0); r.abort = r.stop; };
});
let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fail++; };
const tab = async (n) => { await pg.getByRole('button', { name: n, exact: true }).first().click(); await pg.waitForTimeout(150); };
const mode = async (n) => { await tab('Home'); await pg.getByRole('button', { name: n, exact: true }).first().click(); await pg.waitForTimeout(250); };
const last = () => pg.evaluate(() => window.__spoken[window.__spoken.length - 1] || '');
const clear = () => pg.evaluate(() => { window.__spoken.length = 0; });
await pg.goto(BASE + '/'); await pg.waitForTimeout(1200);

// --- 1. type notes in edit mode, then switch to read mode
await mode('Edit');
await pg.fill('textarea', 'Alpha beta gamma. Delta epsilon zeta eta.\nSecond line theta iota kappa.');
await mode('Read'); await pg.waitForTimeout(300);

// --- 2. click a WORD in read mode -> reading starts exactly at that word
const wordBox = async (text) => pg.evaluate((t) => { const w = document.createTreeWalker(document.querySelector('[data-seg^="n0-"]').parentElement.parentElement, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const i = n.textContent.indexOf(t); if (i >= 0) { const r = document.createRange(); r.setStart(n, i + 1); r.setEnd(n, i + 2); const q = r.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; } } return null; }, text);
await clear(); let bx = await wordBox('epsilon'); await pg.mouse.click(bx.x, bx.y); await pg.waitForTimeout(300);
let sp = await last(); ok('click on word "epsilon" starts reading at epsilon', /^epsilon zeta eta/i.test(sp), JSON.stringify(sp));
await clear(); bx = await wordBox('Alpha'); await pg.mouse.click(bx.x, bx.y); await pg.waitForTimeout(300);
sp = await last(); ok('click on first word reads the whole sentence', /^Alpha beta gamma/.test(sp), JSON.stringify(sp));
ok('reader bar visible with stop', await pg.locator('[data-testid=reader-bar]').isVisible());

// --- 3. highlight (select) a word -> reading starts from the selection start
await clear(); bx = await wordBox('kappa'); await pg.mouse.dblclick(bx.x, bx.y); await pg.waitForTimeout(400);
sp = await last(); ok('double-click highlight on "kappa" reads from kappa', /^kappa/i.test(sp), JSON.stringify(sp));
await pg.mouse.click(5, 5); 

// --- 4. toggle off disables
await tab('Voice'); await pg.locator('[data-testid=click-speak-toggle]').uncheck(); await clear();
bx = await wordBox('Delta'); await pg.mouse.click(bx.x, bx.y); await pg.waitForTimeout(250); ok('toggle off: no speech on click', (await pg.evaluate(() => window.__spoken.length)) === 0);
await pg.locator('[data-testid=click-speak-toggle]').check();

// --- 5. click inside the typing box (edit mode) -> read from the clicked word
await mode('Edit'); await clear();
await pg.evaluate(() => { const ta = document.querySelector('textarea'), p = ta.value.indexOf('zeta') + 2; ta.focus(); ta.setSelectionRange(p, p); ta.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
await pg.waitForTimeout(300); sp = await pg.evaluate(() => window.__spoken.join(' | '));
ok('click in typing box reads from the word under the caret', /^zeta eta/i.test(sp), sp);

// --- 6. live streaming dictation into the editor
await tab('Voice'); await pg.click('button:has-text("Start dictation")'); await pg.waitForTimeout(300);
const say = (t, fin) => pg.evaluate(([t, fin]) => window.__recs[0].onresult({ resultIndex: 0, results: [Object.assign([{ transcript: t, confidence: 0.9 }], { isFinal: fin })] }), [t, fin]);
await say('streaming live words', false); await pg.waitForTimeout(250);
let ta = await pg.inputValue('textarea'); ok('interim words appear in the editor while speaking', /streaming live words/.test(ta), ta.slice(-60));
await say('heading Newton laws new line bullet force equals mass times acceleration full stop', true); await pg.waitForTimeout(300);
ta = await pg.inputValue('textarea'); ok('interim replaced (not duplicated) by formatted final', !/streaming live words/.test(ta) && (ta.match(/Newton laws/g) || []).length === 1, ta.slice(-120));
console.log('FULL:', JSON.stringify(ta)); ok('spoken formatting parsed (# heading, - bullet, period)', /# Newton laws/.test(ta) && /\n- Force equals mass times acceleration\./.test(ta), JSON.stringify(ta.slice(-100)));
await pg.getByRole('button', { name: /^Stop$/ }).first().click().catch(() => {});

// --- 7. handwriting -> OCR -> click handwritten word
await mode('Read'); await tab('Draw');
await pg.evaluate(() => { const c = document.querySelector('canvas'), x = c.getContext('2d'); x.fillStyle = '#000'; x.font = 'bold 70px Arial'; x.fillText('HELLO WORLD', 60, 900); x.fillText('SIMULATION LAB', 60, 1000); c.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });
await pg.locator('[data-testid=ocr-run]').click();
await pg.waitForFunction(() => /Recognised|No writing|could not/.test(document.querySelector('[data-testid=ocr-msg]')?.textContent || ''), null, { timeout: 120000 });
const msg = await pg.locator('[data-testid=ocr-msg]').innerText(); console.log('ocr:', msg);
ok('handwriting recognised offline', /Recognised/.test(msg), msg);
await mode('Read'); await pg.waitForTimeout(300); await clear();
const words = await pg.locator('[data-testid=ocr-word]').evaluateAll(els => els.map(e => e.getAttribute('title')));
console.log('ocr words:', words.join(' ').slice(0, 200));
const n = await pg.locator('[data-testid=ocr-word]').count(); ok('handwritten words are clickable', n >= 3, String(n));
const wi = words.findIndex(t => /WORLD/i.test(t || '')); if (wi >= 0) { await pg.locator('[data-testid=ocr-word]').nth(wi).click(); await pg.waitForTimeout(300); sp = await last(); ok('click handwritten "WORLD" reads from WORLD', /^WORLD/i.test(sp), JSON.stringify(sp)); } else ok('found handwritten WORLD', false, words.join(','));
ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await pg.screenshot({ path: '/tmp/speak.png' });
await b.close(); console.log(fail ? 'FAILED ' + fail : 'ALL PASS'); process.exit(fail ? 1 : 0);
