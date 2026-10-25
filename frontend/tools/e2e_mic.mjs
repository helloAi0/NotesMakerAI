import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
const check=(n,ok)=>console.log(ok?'PASS':'FAIL',n);
const exe = { executablePath: '/opt/pw-browsers/chromium' };
async function open(args, perms) {
  const b = await chromium.launch({ ...exe, args }).catch(() => chromium.launch({ args }));
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, permissions: perms });
  const pg = await ctx.newPage(); pg.setDefaultTimeout(8000);
  await pg.addInitScript(() => { window.__recs = []; window.SpeechRecognition = function () { const r = this; r.start = () => { window.__recs.push(r); setTimeout(() => r.onstart && r.onstart(), 0); }; r.stop = () => setTimeout(() => r.onend && r.onend(), 0); r.abort = r.stop; }; });
  await pg.goto('http://localhost:5199/'); await pg.waitForTimeout(500); await pg.click('button:has-text("Voice")'); return { b, pg };
}
// 1. working (fake) microphone
let { b, pg } = await open(['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], ['microphone']);
await pg.click('button:has-text("Test microphone")'); await pg.waitForTimeout(500);
check('level meter shown while listening', await pg.isVisible('text=Speak now'));
await pg.waitForSelector('text=Microphone works', { timeout: 7000 }).then(() => check('fake mic detected as working', true)).catch(() => check('fake mic detected as working', false));
await b.close();
// 2. permission denied
({ b, pg } = await open(['--use-fake-device-for-media-stream', '--deny-permission-prompts'], []));
await pg.click('button:has-text("Test microphone")');
await pg.waitForSelector('text=/permission was denied|No microphone|Could not open/', { timeout: 6000 }).then(async () => check('denied/blocked mic gives clear guidance: ' + (await pg.locator('text=/permission was denied|No microphone|Could not open/').first().innerText()).slice(0, 60), true)).catch(() => check('denied mic message', false));
// 3. recognizer errors
for (const [err, re] of [['not-allowed', /permission was denied/], ['audio-capture', /No microphone/], ['network', /network connection/], ['no-speech', /No speech was heard/]]) {
  await pg.click('button:has-text("Start dictation")').catch(() => {}); await pg.waitForTimeout(150);
  await pg.evaluate(e => { const r = window.__recs.at(-1); r && r.onerror && r.onerror({ error: e }); r && r.onend && r.onend(); }, err); await pg.waitForTimeout(200);
  check(`dictation error "${err}" shown`, await pg.locator(`text=${re.source.replace(/\\/g, '')}`).first().isVisible().catch(() => false));
  await pg.click('button:has-text("Stop")').catch(() => {}); await pg.click('button:has-text("Cancel")').catch(() => {});
}
await b.close();
