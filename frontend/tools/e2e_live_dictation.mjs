// E2E: words appear in the notebook WHILE speaking (interim results), the final phrase replaces them without duplication,
// and pressing Stop keeps a phrase the engine had not finalised. Uses a scripted SpeechRecognition.
const { chromium } = await import('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
await ctx.addInitScript(() => {
  class Rec { constructor() { window.__rec = this; } start() { this.on = true; setTimeout(() => { this.onstart?.(); this.onaudiostart?.(); }, 20); } stop() { setTimeout(() => this.onend?.(), 30); } abort() { setTimeout(() => this.onend?.(), 0); }
    say(txt, fin) { const r = Object.assign([{ transcript: txt, confidence: 0.9 }], { isFinal: fin }); this.onsoundstart?.(); this.onspeechstart?.(); this.onresult?.({ resultIndex: 0, results: [r] }); } }
  window.SpeechRecognition = Rec; window.webkitSpeechRecognition = Rec;
});
const pg = await ctx.newPage(); pg.setDefaultTimeout(8000); const errs = []; pg.on('pageerror', e => errs.push(e.message));
let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fail++; };
await pg.goto(BASE + '/'); await pg.waitForTimeout(1000); await pg.click('[data-testid=nav-notebook]'); await pg.waitForTimeout(500);
await pg.click('button:text-is("Voice")'); await pg.click('button:has-text("Start dictation")'); await pg.waitForTimeout(300);
const ta = pg.locator('textarea').first(); const val = () => ta.inputValue();
await pg.evaluate(() => window.__rec.say('the speed of', false)); await pg.waitForTimeout(150); ok('first words appear while speaking', /the speed of/.test(await val()), await val());
await pg.evaluate(() => window.__rec.say('the speed of light is', false)); await pg.waitForTimeout(150); ok('text grows live, not duplicated', (await val()).match(/the speed of/g).length === 1 && /light is/.test(await val()), await val());
ok('signal shows speech', /hearing speech/.test(await pg.innerText('[data-testid=dict-signal]')));
await pg.evaluate(() => window.__rec.say('the speed of light is constant', true)); await pg.evaluate(() => window.__rec.onresult({ resultIndex: 1, results: [Object.assign([{ transcript: 'x' }], { isFinal: true }), Object.assign([{ transcript: '' }], { isFinal: false })] })).catch(() => {}); await pg.waitForTimeout(200);
const v1 = await val(); ok('final replaces preview (once)', v1.match(/the speed of light is constant/gi)?.length === 1, v1);
await pg.evaluate(() => window.__rec.say('and a second phrase', false)); await pg.waitForTimeout(150);
await pg.click('button:has-text("Stop")'); await pg.waitForTimeout(500);
const v2 = await val(); ok('Stop keeps the unfinished phrase', /and a second phrase/.test(v2) && v2.match(/second phrase/g).length === 1, v2);
await pg.click('[aria-label=Undo]'); await pg.waitForTimeout(200); ok('undo removes the dictated phrase', !/second phrase/.test(await val()), await val());
ok('no page errors', errs.length === 0, errs.join('|')); await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
