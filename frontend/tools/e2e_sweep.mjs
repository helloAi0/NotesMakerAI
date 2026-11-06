// Visits every view, every Study Studio tab and every app language at desktop and phone width; fails on any console error, page error, failed request or horizontal overflow.
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://127.0.0.1:5300'; const VIEWS = ['dashboard', 'friday', 'generator', 'notebook', 'lecture', 'simulations', 'planner', 'library', 'practice', 'progress', 'teach', 'studio', 'platform'];
const TABS = ['bhasha', 'boards', 'scan', 'voice', 'code', 'swipe', 'market', 'bot'];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch()); let bad = 0; const fail = m => { bad++; console.log('FAIL ' + m); };
for (const [name, vp] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 780 }]]) {
  const ctx = await b.newContext({ viewport: vp }); const pg = await ctx.newPage(); let where = 'load';
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource.*(favicon|manifest)|net::ERR_(INTERNET|NAME|CONNECTION)/.test(m.text())) fail(`[${name}] console @${where}: ${m.text().slice(0, 160)}`); });
  pg.on('pageerror', e => fail(`[${name}] pageerror @${where}: ${String(e).slice(0, 160)}`));
  pg.on('requestfailed', r => { if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(r.url())) return; fail(`[${name}] request failed @${where}: ${r.url()}`); });
  await pg.addInitScript(() => { try { localStorage.setItem('nm_tour_done', '1'); } catch { /* */ } });
  await pg.goto(BASE); await pg.waitForTimeout(800);
  const nav = async id => { if (name === 'phone') { const o = await pg.$('[aria-label="Open menu"]'); if (o) await o.click().catch(() => {}); } await pg.click(`[data-testid=nav-${id}]`, { timeout: 4000 }); await pg.waitForTimeout(500); };
  const overflow = async what => { const o = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (o > 2) fail(`[${name}] horizontal overflow ${o}px @${what}`); };
  for (const v of VIEWS) { where = v; try { await nav(v); } catch { fail(`[${name}] cannot open view ${v}`); continue; } await pg.waitForTimeout(400); await overflow(v); const txt = await pg.evaluate(() => document.body.innerText.length); if (txt < 40) fail(`[${name}] view ${v} looks empty`); if (await pg.$('text=Something went wrong')) fail(`[${name}] error boundary in ${v}`); }
  await nav('studio'); for (const t of TABS) { where = 'studio/' + t; try { await pg.click(`[data-testid=studio-tab-${t}]`, { timeout: 3000 }); await pg.waitForTimeout(500); await overflow(where); if (await pg.$('text=Something went wrong')) fail(`[${name}] error boundary in ${where}`); } catch { fail(`[${name}] cannot open ${where}`); } }
  if (name === 'desktop') {
    for (const c of ['hi', 'mr', 'bn', 'ta', 'te', 'en']) { where = 'lang/' + c; await pg.selectOption('[data-testid=ui-lang]', c); await pg.waitForTimeout(250); const lang = await pg.evaluate(() => document.documentElement.lang); if (lang !== c) fail(`html lang ${lang} != ${c}`); const side = await pg.textContent('[data-testid=nav-dashboard]'); if (c !== 'en' && /^\s*Dashboard\s*$/.test(side)) fail(`nav not translated for ${c}`); if (c === 'en' && !/Dashboard/.test(side)) fail('English not restored'); await overflow(where); }
    await pg.selectOption('[data-testid=ui-lang]', 'ta'); await pg.reload(); await pg.waitForTimeout(800); if (!/டாஷ்போர்டு/.test(await pg.textContent('[data-testid=nav-dashboard]'))) fail('language choice not remembered after reload');
  }
  await ctx.close();
}
await b.close(); console.log(bad ? `${bad} problem(s)` : 'SWEEP CLEAN'); process.exit(bad ? 1 : 0);
