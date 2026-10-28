// E2E: ClawBot dashboard against clawbot/tests/dev_server.py (fake LLM) on :8765. BASE = vite preview.
const { chromium } = await import('playwright').catch(() => import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs'));
const BASE = process.env.BASE || 'http://localhost:5300';
const WS = process.env.CLAW_WS || 'ws://127.0.0.1:8765/ws';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
const pg = await ctx.newPage(); pg.setDefaultTimeout(30000);
const errs = [], remote = []; pg.on('pageerror', e => errs.push(e.message));
pg.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('http://127.0.0.1:8765')) remote.push(u); });
let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, x); if (!c) fail++; };
const st = id => pg.getAttribute(`[data-testid=claw-node-${id}]`, 'data-status');
const label = () => pg.innerText('[data-testid=claw-step-label]');
await pg.addInitScript(u => localStorage.setItem('nm_clawbot_cfg', JSON.stringify({ url: u, token: '' })), WS);
await pg.goto(BASE + '/'); await pg.click('[data-testid=nav-clawbot]');
await pg.waitForSelector('[data-testid=claw-status][data-status=open]');
ok('connected badge', /Connected/.test(await pg.innerText('[data-testid=claw-status]')));
ok('six graph nodes rendered', (await pg.locator('[data-testid^=claw-node-]').count()) === 6);
ok('online is default', (await pg.getAttribute('[data-testid=claw-mode-online]', 'aria-pressed')) === 'true');

// ---- online run: scraping node lights up, tokens stream, graph edges highlight
await pg.fill('[data-testid=claw-input]', 'What are the latest local AI agents?'); await pg.click('[data-testid=claw-send]');
const seen = new Set(), labels = new Set(); let streamedPartial = false;
for (let i = 0; i < 200; i++) {
  for (const n of ['parse', 'retrieve', 'ingest_web', 'generate', 'critic', 'finalize']) if ((await st(n)) === 'active') seen.add(n);
  labels.add((await label()).trim());
  const t = await pg.innerText('[data-testid=claw-answer]').catch(() => '');
  if (t && !/useful/.test(t) && /ClawBot/.test(t)) streamedPartial = true;
  if (await pg.locator('[data-testid=claw-feedback]').count()) break;
  await pg.waitForTimeout(60);
}
ok('active nodes observed live', ['parse', 'ingest_web', 'generate', 'critic'].every(n => seen.has(n)), [...seen].join(','));
ok('step labels (Scraping/Generating/Reflecting)', ['Scraping…', 'Generating…', 'Reflecting…'].every(l => labels.has(l)), [...labels].join(' | '));
ok('answer streamed progressively', streamedPartial);
await pg.waitForSelector('[data-testid=claw-feedback]');
ok('final answer shown with citation chip', /ClawBot keeps memory/.test(await pg.innerText('[data-testid=claw-answer]')) && (await pg.locator('[data-testid=claw-answer] sup').count()) >= 1);
ok('web route edge highlighted', (await pg.getAttribute('[data-edge="parse>ingest_web"]', 'data-taken')) === 'true' && (await pg.getAttribute('[data-edge="critic>finalize"]', 'data-taken')) === 'true');
ok('all visited nodes done', (await st('finalize')) === 'done' && (await st('ingest_web')) === 'done');
ok('sources listed', /example\.org\/latest|notes\/clawbot/.test(await pg.innerText('[data-testid=claw-sources]')));
ok('critic passed', /Passed/.test(await pg.innerText('[data-testid=claw-critique]')));

// ---- reflection loop
await pg.fill('[data-testid=claw-input]', 'please revise this answer'); await pg.keyboard.press('Enter');
let sawRevision = false;
for (let i = 0; i < 300; i++) { if (await pg.locator('[data-testid=claw-revision]').count()) sawRevision = true; if (await pg.locator('[data-testid=claw-feedback]').count() && i > 5) break; await pg.waitForTimeout(60); }
ok('revision banner shown during loop', sawRevision);
ok('critic and generate visited twice (×2 badge)', (await pg.locator('[data-testid=claw-node-critic] text:has-text("×2")').count()) === 1 && (await pg.locator('[data-testid=claw-node-generate] text:has-text("×2")').count()) === 1);
ok('revised answer accepted', /IMPROVED/.test(await pg.innerText('[data-testid=claw-answer]')));
ok('loop edge critic>generate highlighted', (await pg.getAttribute('[data-edge="critic>generate"]', 'data-taken')) === 'true');

// ---- Online/Offline toggle keys
await pg.keyboard.press('Alt+o');
ok('Alt+O switches to offline', (await pg.getAttribute('[data-testid=claw-mode-offline]', 'aria-pressed')) === 'true' && (await pg.locator('[data-testid=claw-offline-note]').count()) === 1);
await pg.click('[data-testid=claw-mode-online]'); await pg.click('[data-testid=claw-mode-offline]');
await pg.fill('[data-testid=claw-input]', 'what are the latest developments?'); await pg.click('[data-testid=claw-send]');
await pg.waitForSelector('[data-testid=claw-feedback]');
ok('offline run never scrapes', (await st('ingest_web')) === 'idle' && (await pg.getAttribute('[data-edge="parse>ingest_web"]', 'data-taken')) === 'false');
await pg.click('[data-testid=claw-mode-online]');

// ---- feedback -> learned rules
await pg.click('[data-testid=claw-fb-edit]');
await pg.fill('[data-testid=claw-fb-text]', '- ClawBot keeps memory locally.\n- It cites sources.');
await pg.click('[data-testid=claw-fb-submit-edit]');
await pg.waitForSelector('[data-testid=claw-fb-msg]');
const fb = await pg.innerText('[data-testid=claw-fb-msg]');
ok('edit feedback learned structural rules', /Learned:.*(use_bullets|shorter)/.test(fb), fb);

// ---- cancel
await pg.fill('[data-testid=claw-input]', 'please revise: a long one'); await pg.click('[data-testid=claw-send]');
await pg.waitForSelector('[data-testid=claw-stop]'); await pg.waitForTimeout(500); await pg.click('[data-testid=claw-stop]');
await pg.waitForFunction(() => /Cancelled/.test(document.querySelector('[data-testid=claw-step-label]')?.textContent || ''));
ok('stop cancels the run', true);
ok('can ask again after cancel', await (async () => { await pg.fill('[data-testid=claw-input]', 'hello again'); await pg.click('[data-testid=claw-send]'); await pg.waitForSelector('[data-testid=claw-feedback]'); return true; })());

// ---- connection loss / reconnect
await pg.click('[data-testid=claw-settings-btn]'); await pg.fill('[data-testid=claw-url]', 'ws://127.0.0.1:1/ws'); await pg.click('[data-testid=claw-save]');
await pg.waitForSelector('[data-testid=claw-status][data-status=closed], [data-testid=claw-status][data-status=connecting]');
await pg.waitForSelector('[role=alert]');
ok('unreachable server shows guidance and disables send', /Cannot reach ClawBot/.test(await pg.innerText('[role=alert]')) && await pg.isDisabled('[data-testid=claw-send]').catch(() => true));
await pg.click('[data-testid=claw-settings-btn]'); await pg.fill('[data-testid=claw-url]', WS); await pg.click('[data-testid=claw-save]');
await pg.waitForSelector('[data-testid=claw-status][data-status=open]');
ok('reconnects after fixing URL', true);

// ---- phone width
await pg.setViewportSize({ width: 390, height: 800 });
ok('no horizontal overflow at 390px', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
ok('no remote requests', remote.length === 0, remote.join(' '));
ok('no page errors', errs.length === 0, errs.join(' | '));
await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
