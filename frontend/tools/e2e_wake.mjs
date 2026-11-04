// E2E: “Hey Friday” wake word with a scripted SpeechRecognition.
const { chromium } = await import('playwright').catch(() => import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs'));
const BASE = process.env.BASE || 'http://localhost:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] }).catch(() => chromium.launch());
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['microphone'] }); const pg = await ctx.newPage(); pg.setDefaultTimeout(15000);
await pg.addInitScript(() => { window.__recs = []; class R { constructor() { this.running = false; window.__recs.push(this); } start() { this.running = true; } stop() { this.running = false; setTimeout(() => this.onend && this.onend(), 0); } abort() { this.stop(); } }
  window.SpeechRecognition = R; window.webkitSpeechRecognition = R; window.__say = (t, final = true) => { const r = window.__recs.filter(x => x.running).pop(); if (!r) return false; const res = [{ transcript: t }]; res.isFinal = final; r.onresult({ resultIndex: 0, results: [res] }); return true; }; });
const errs = []; pg.on('pageerror', e => errs.push(e.message));
let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fail++; };
await pg.goto(BASE + '/'); await pg.waitForTimeout(800); await pg.click('[data-testid=nav-friday]'); await pg.waitForSelector('[data-testid=friday-wake]');
await pg.click('[data-testid=friday-wake]'); await pg.waitForTimeout(500); ok('wake listener starts', /Hey Friday/.test(await pg.innerText('[data-testid=wake-status]')));
ok('unrelated speech ignored', await pg.evaluate(() => window.__say('see you on friday')) && (await pg.locator('[data-testid=friday-reply]').count()) === 0);
await pg.evaluate(() => window.__say('hey friday what is 12 times 7')); await pg.waitForTimeout(2500);
const t = await pg.locator('[data-testid=friday-reply]').last().innerText().catch(() => ''); ok('“Hey Friday <question>” is answered', /84/.test(t), t.slice(0, 120));
await pg.click('[data-testid=friday-wake]'); await pg.waitForTimeout(300); ok('wake word off stops listening', (await pg.evaluate(() => window.__recs.filter(r => r.running).length)) === 0);
ok('no page errors', errs.length === 0, errs.join('|')); await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
