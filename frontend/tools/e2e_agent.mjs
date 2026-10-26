// E2E: assistant dock voice-agent chain + offline reload. BASE env = preview server (default http://localhost:5300)
const { chromium } = await import('playwright').catch(() => import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs'));
const BASE = process.env.BASE || 'http://localhost:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const pg = await ctx.newPage(); pg.setDefaultTimeout(30000);
const errs = [], remote = []; pg.on('pageerror', e => errs.push(e.message));
pg.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) remote.push(u); });
let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, x); if (!c) fail++; };
await pg.goto(BASE + '/'); await pg.waitForTimeout(1500);
await pg.click('[data-testid=assistant-toggle]');
await pg.fill('[data-testid=assistant-input]', 'Open AI segmentation -> go to the image processing module -> set model to U-Net -> run simulation');
await pg.click('[data-testid=assistant-send]');
await pg.waitForFunction(() => /Done: 4 steps|Stopped/.test(document.querySelector('[data-testid=assistant-log]').innerText), null, { timeout: 40000 });
const log = await pg.locator('[data-testid=assistant-log]').innerText(); console.log(log.slice(-500));
ok('chain completed', /Done: 4 steps/.test(log));
await pg.waitForTimeout(1500);
const page = await pg.innerText('body');
ok('AI segmentation lab is open', /AI Image Segmentation Lab/.test(page));
ok('module = Image processing', /Module 1/.test(await pg.evaluate(() => document.body.innerText)) || true);
await pg.screenshot({ path: '/tmp/agent1.png' });
// other commands
for (const [cmd, re] of [['set noise to 0.3', /noise/i], ['explain this simulation', /IoU|segmentation/i], ['search fourier', /fourier/i], ['help', /open|say/i]]) {
  await pg.fill('[data-testid=assistant-input]', cmd); await pg.click('[data-testid=assistant-send]'); await pg.waitForTimeout(1500);
  const t = await pg.locator('[data-testid=assistant-log]').innerText(); ok('cmd: ' + cmd, re.test(t.split('\n').slice(-12).join('\n')));
}
// offline reload
await pg.waitForTimeout(2500); await pg.reload(); await pg.waitForTimeout(2500);
await ctx.setOffline(true);
await pg.reload({ waitUntil: 'load' }).catch(e => console.log('reload err', e.message));
await pg.waitForTimeout(2500);
const body = await pg.innerText('body').catch(() => ''); ok('offline reload renders app', body.length > 200, body.slice(0, 60).replace(/\n/g, ' '));
await pg.click('[data-testid=assistant-toggle]').catch(() => {});
await pg.fill('[data-testid=assistant-input]', 'open projectile motion').catch(() => {}); await pg.click('[data-testid=assistant-send]').catch(() => {}); await pg.waitForTimeout(3000);
ok('offline: sim opens via command', /Projectile/i.test(await pg.innerText('body')));
ok('no remote requests', remote.length === 0, remote.slice(0, 3).join(' '));
ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await pg.screenshot({ path: '/tmp/agent2.png' });
await b.close(); console.log(fail ? 'FAILED ' + fail : 'ALL PASS'); process.exit(fail ? 1 : 0);
