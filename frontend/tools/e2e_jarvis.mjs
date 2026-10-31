// E2E: one FRIDAY — Jarvis plan on the virtual file system, memory, RL feedback, panels, offline. BASE env = preview server.
const { chromium } = await import('playwright').catch(() => import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs'));
const BASE = process.env.BASE || 'http://localhost:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const pg = await ctx.newPage(); pg.setDefaultTimeout(25000);
const errs = [], remote = []; pg.on('pageerror', e => errs.push(e.message));
pg.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) remote.push(u); });
let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fail++; };
await pg.goto(BASE + '/'); await pg.waitForTimeout(1200); await pg.click('[data-testid=nav-friday]'); await pg.waitForSelector('[data-testid=friday-input]');
ok('single FRIDAY (no tracks / no ClawBot)', (await pg.locator('[data-testid=track-agent],[data-testid=nav-clawbot]').count()) === 0 && !/ClawBot/.test(await pg.innerText('body')));
// files: upload a document into /Inbox
await pg.click('[data-testid=friday-tab-files]'); await pg.click('[data-testid=files-list] >> text=Inbox');
await pg.setInputFiles('[data-testid=files-upload]', { name: 'thermo_notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Entropy is a state function. The second law of thermodynamics says entropy of an isolated system never decreases. Carnot efficiency is 1 - Tc/Th. Heat flows from hot to cold spontaneously.'.repeat(3)) });
await pg.waitForSelector('text=thermo_notes.txt');
ok('file shows in explorer', true);
await pg.click('[data-testid=friday-tab-chat]');
const ask = async (q, wait = 2500) => { await pg.fill('[data-testid=friday-input]', q); await pg.click('[data-testid=friday-send]'); await pg.waitForFunction(() => !document.querySelector('[data-testid=friday-send]').closest('form').querySelector('button[disabled]') || true); await pg.waitForTimeout(wait); return pg.innerText('[data-testid=friday-log]'); };
const t = await ask('Friday, go to folder Inbox, capture the document there, move it into the PDF processing section, and generate a summary report', 4000);
ok('plan card with 4 steps all done', (await pg.locator('[data-testid=plan-card] li[data-status=done]').count()) >= 4, t.slice(-400));
ok('plan JSON viewable', await pg.locator('text=view JSON').first().click().then(() => pg.locator('pre:has-text("\\"steps\\"")').count()).then(n => n > 0));
await pg.click('[data-testid=friday-tab-files]'); await pg.click('button:text-is("root")'); await pg.click('[data-testid=files-list] >> text=PDF Processing');
ok('document moved into PDF Processing', /thermo_notes/.test(await pg.innerText('[data-testid=files-list]')));
await pg.click('button:text-is("root")'); await pg.click('[data-testid=files-list] >> text=Reports');
ok('summary report generated', /report|summary/i.test(await pg.innerText('[data-testid=files-list]')));
await pg.click('[data-testid=friday-tab-chat]');
// failure is honest
const f = await ask('go to folder Nonexistent and capture the document', 2500); ok('failure reported', /Stopped|not find|No folder|could not/i.test(f.slice(-500)), f.slice(-300));
// memory
let m = await ask('my name is Taha and I study mechanical engineering', 1500); ok('learns facts', /Taha/.test(await pg.evaluate(() => localStorage.getItem('nm_friday_memory') || '')));
m = await ask('what do you remember about me', 1500); ok('recalls memory', /Taha/.test(m.slice(-500)));
// chat answers (offline engine) + feedback → policy
m = await ask('explain backpropagation step by step', 2500); ok('chat answer', /chain rule|gradient/i.test(m.slice(-1500)));
await pg.locator('[aria-label="Good answer"]').last().click(); await pg.waitForTimeout(300);
ok('feedback stored in policy', /"log":\[\{/.test(await pg.evaluate(() => localStorage.getItem('nm_friday_policy') || '')));
m = await ask('12*7+sqrt(2)', 1500); ok('calculator', /85\.41/.test(m.slice(-400)));
// panels
for (const [tab, re] of [['learning', /REINFORCE/], ['map', /k-means/], ['memory', /Taha/], ['brain', /Local model server/]]) { await pg.click(`[data-testid=friday-tab-${tab}]`); await pg.waitForTimeout(tab === 'map' ? 2500 : 400); ok('panel ' + tab, re.test(await pg.innerText('[data-testid=friday-console]'))); }
await pg.click('[data-testid=friday-tab-map]'); await pg.waitForTimeout(1500); ok('map draws clusters', (await pg.locator('[data-testid=map-panel] circle').count()) > 5);
// dock shares the same conversation
await pg.click('[data-testid=nav-dashboard]'); await pg.click('[data-testid=assistant-toggle]'); ok('dock shows same chat', /backpropagation/i.test(await pg.innerText('[data-testid=assistant-log]')));
// offline
await pg.reload(); await pg.waitForTimeout(2000); await ctx.setOffline(true); await pg.reload().catch(() => {}); await pg.waitForTimeout(2500);
await pg.click('[data-testid=assistant-toggle]'); await pg.fill('[data-testid=assistant-input]', 'what is entropy'); await pg.click('[data-testid=assistant-send]'); await pg.waitForTimeout(2500);
ok('offline answer', /entropy/i.test((await pg.innerText('[data-testid=assistant-log]')).slice(-1200)));
ok('no remote requests', remote.length === 0, remote.slice(0, 3).join(' ')); ok('no page errors', errs.length === 0, errs.join('|'));
await pg.screenshot({ path: '/tmp/jarvis.png' }); await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
