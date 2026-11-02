// E2E: pausing dictation (Resume + Stop offered in the ribbon and under the page, no second microphone started), Stop keeps the text, and chunks join without stray capitals.
const { chromium } = await import('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
await ctx.addInitScript(() => {
  class Rec { constructor() { (window.__all = window.__all || []).push(this); window.__rec = this; } start() { this.on = true; setTimeout(() => { this.onstart?.(); this.onaudiostart?.(); }, 20); } stop() { this.on = false; setTimeout(() => this.onend?.(), 30); } abort() { this.on = false; setTimeout(() => this.onend?.(), 0); }
    say(txt, fin) { const r = Object.assign([{ transcript: txt, confidence: 0.9 }], { isFinal: fin }); this.onsoundstart?.(); this.onspeechstart?.(); this.onresult?.({ resultIndex: 0, results: [r] }); } }
  window.SpeechRecognition = Rec; window.webkitSpeechRecognition = Rec;
});
const pg = await ctx.newPage(); pg.setDefaultTimeout(8000); const errs = []; pg.on('pageerror', e => errs.push(e.message));
let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fail++; };
await pg.goto(BASE + '/'); await pg.waitForTimeout(1000); await pg.click('[data-testid=nav-notebook]'); await pg.waitForTimeout(500);
await pg.click('button:text-is("Voice")'); await pg.click('button:has-text("Start dictation")'); await pg.waitForTimeout(300);
const ta = pg.locator('textarea').first(); const val = () => ta.inputValue();
await pg.evaluate(() => window.__rec.say('hello you can see', true)); await pg.waitForTimeout(200);
await pg.evaluate(() => window.__rec.say('Can you hear me?', true)); await pg.waitForTimeout(200);
ok('chunk joins without a stray capital', /hello you can see can you hear me\?/i.test(await val()) && !/see Can you/.test(await val()), await val());
await pg.evaluate(() => window.__rec.say('Done.', true)); await pg.evaluate(() => window.__rec.say('Next sentence starts here', true)); await pg.waitForTimeout(200);
ok('after a full stop the next sentence keeps its capital', /Done\. Next sentence starts here/.test(await val()), await val());
await pg.click('button:text-is("Pause")'); await pg.waitForTimeout(300);
ok('paused: ribbon offers Resume and Stop', (await pg.locator('[data-testid=dict-resume]').count()) === 1 && (await pg.locator('[data-testid=dict-stop-paused]').count()) === 1);
ok('paused: page button offers Resume (not a second Start)', /Resume dictation/.test(await pg.textContent('[data-testid=edit-pane-controls]')));
await pg.click('[data-testid=edit-dictate]'); await pg.waitForTimeout(300);
const active = await pg.evaluate(() => window.__all.filter(r => r.on).length); ok('Resume from the page button continues with exactly one running recogniser', active === 1 && /Stop dictation/.test(await pg.textContent('[data-testid=edit-pane-controls]')), String(active));
await pg.click('button:text-is("Pause")'); await pg.waitForTimeout(200); await pg.click('[data-testid=dict-stop-paused]'); await pg.waitForTimeout(500);
ok('Stop while paused ends dictation and keeps the text', /Next sentence starts here/.test(await val()) && (await pg.locator('button:has-text("Start dictation")').count()) === 1);
ok('no page errors', errs.length === 0, errs.join('|')); await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
