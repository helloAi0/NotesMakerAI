// Deep audit: every view at desktop + mobile; collects console errors, page errors, failed requests, overflow, unlabeled buttons, dead clicks.
const { chromium } = await import('playwright').catch(() => import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs'));
const BASE = process.env.BASE || 'http://127.0.0.1:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const issues = [];
for (const [name, vp] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 780 }]]) {
  const ctx = await b.newContext({ viewport: vp }); const pg = await ctx.newPage(); pg.setDefaultTimeout(15000);
  const log = (w, m) => issues.push(`[${name}] ${w}: ${m}`);
  pg.on('pageerror', e => log('pageerror', e.message)); pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log('console.' + m.type(), m.text().slice(0, 200)); });
  pg.on('requestfailed', r => { if (r.url().startsWith(BASE)) log('requestfailed', r.url()); });
  pg.on('response', r => { if (r.url().startsWith(BASE) && r.status() >= 400) log('http' + r.status(), r.url()); });
  await pg.goto(BASE + '/'); await pg.waitForTimeout(1500);
  const ids = await pg.$$eval('[data-testid^=nav-]', els => els.map(e => e.getAttribute('data-testid').slice(4)));
  if (name === 'mobile') { /* mobile uses a menu or bottom bar; try opening it */ }
  for (const id of ids) {
    if (name === 'mobile') { await pg.locator('button[aria-label="Open menu"]').click({ timeout: 3000 }).catch(() => {}); await pg.waitForTimeout(300); }
    const el = pg.locator(`[data-testid=nav-${id}]`).first();
    try { await el.click({ timeout: 5000 }); } catch { log('nav not reachable', id); continue; }
    await pg.waitForTimeout(1200);
    const r = await pg.evaluate(() => {
      const doc = document.documentElement; const over = doc.scrollWidth > doc.clientWidth + 2;
      const unl = [...document.querySelectorAll('button,a,input,select,textarea')].filter(e => { const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false; const t = (e.innerText || e.getAttribute('aria-label') || e.getAttribute('title') || e.getAttribute('placeholder') || e.value || '').trim(); return !t && !e.querySelector('title') && !e.labels?.length; }).map(e => e.outerHTML.slice(0, 90));
      const small = [...document.querySelectorAll('button')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.width < 24 || r.height < 24); }).length;
      return { over, unl: unl.slice(0, 5), small, len: document.body.innerText.length };
    });
    if (r.over) log('horizontal overflow', id); if (r.unl.length) log('unlabeled controls', `${id}: ${r.unl.join(' | ')}`); if (r.len < 80) log('blank view', id);
    await pg.screenshot({ path: `/tmp/audit_${name}_${id}.png` });
  }
  await ctx.close();
}
const uniq = [...new Set(issues)]; console.log(uniq.length ? uniq.join('\n') : 'NO ISSUES'); await b.close();
