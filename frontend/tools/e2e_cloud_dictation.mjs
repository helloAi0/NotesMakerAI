// E2E: AI-transcription dictation. Fake microphone (browser flag) -> VAD -> OpenAI-compatible /audio/transcriptions stub (tools/fake_llm.mjs :11434).
const { chromium } = await import('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await b.newContext({ viewport: { width: 1300, height: 900 }, permissions: ['microphone'] });
await ctx.addInitScript(() => { try { localStorage.setItem('ai_provider', 'custom'); localStorage.setItem('ai_cfg_custom', JSON.stringify({ apiKey: '', model: '', baseUrl: 'http://127.0.0.1:11434/v1' })); localStorage.setItem('nm_dictation_engine', 'cloud'); } catch { /* */ } });
const pg = await ctx.newPage(); pg.setDefaultTimeout(15000); const errs = []; pg.on('pageerror', e => errs.push(e.message));
let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fail++; };
await pg.goto(BASE + '/'); await pg.waitForTimeout(1000); await pg.click('[data-testid=nav-notebook]'); await pg.waitForTimeout(500); await pg.click('button:text-is("Voice")');
await pg.click('[data-testid=mic-setup-toggle]'); ok('engine selector shows AI transcription', (await pg.locator('[aria-label="Dictation engine"]').inputValue()) === 'cloud');
await pg.click('[data-testid=mic-setup-toggle]'); await pg.click('button:has-text("Start dictation")'); await pg.waitForTimeout(500);
ok('microphone opened (signal line visible)', await pg.locator('[data-testid=dict-signal]').count() > 0);
const ta = pg.locator('textarea').first();
await pg.waitForFunction(() => /hello from transcription/.test(document.querySelector('textarea').value), null, { timeout: 25000 }).then(() => ok('transcribed text appears in the notebook while dictating', true)).catch(async () => ok('transcribed text appears in the notebook while dictating', false, await ta.inputValue() + ' | ' + (await pg.locator('[data-testid=dictation-engine]').innerText())));
await pg.click('button:has-text("Stop")'); await pg.waitForTimeout(2500);
const v = await ta.inputValue(); ok('text kept after Stop', /hello from transcription/i.test(v), v);
ok('no page errors', errs.length === 0, errs.join('|')); await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
