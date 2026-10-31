// E2E: "Find my microphone" opens every input, picks the one that hears sound, saves it and dictation then uses AI transcription with it.
const { chromium } = await import('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await b.newContext({ viewport: { width: 1300, height: 900 }, permissions: ['microphone'] });
await ctx.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); try { localStorage.setItem('ai_provider', 'custom'); localStorage.setItem('ai_cfg_custom', JSON.stringify({ apiKey: '', model: '', baseUrl: 'http://127.0.0.1:11434/v1' })); } catch { /* */ } } });
const pg = await ctx.newPage(); pg.setDefaultTimeout(20000); const errs = []; pg.on('pageerror', e => errs.push(e.message));
let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fail++; };
await pg.goto(BASE + '/'); await pg.waitForTimeout(1000); await pg.click('[data-testid=nav-notebook]'); await pg.waitForTimeout(500); await pg.click('button:text-is("Voice")');
await pg.click('[data-testid=find-mic]'); await pg.waitForSelector('[data-testid=mic-scan]'); await pg.waitForSelector('text=Found it', { timeout: 15000 }).then(() => ok('finds a working microphone', true)).catch(() => ok('finds a working microphone', false));
ok('choice saved', !!(await pg.evaluate(() => localStorage.getItem('nm_mic_device'))));
await pg.click('button:has-text("Start dictation")');
await pg.waitForFunction(() => /hello from transcription/i.test(document.querySelector('textarea').value), null, { timeout: 25000 }).then(() => ok('auto mode dictates with chosen mic via AI transcription', true)).catch(() => ok('auto mode dictates with chosen mic via AI transcription', false));
await pg.click('button:has-text("Stop")'); ok('no page errors', errs.length === 0, errs.join('|')); await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
