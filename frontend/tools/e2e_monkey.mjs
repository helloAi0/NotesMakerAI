// Clicks every visible button in every view and Study Studio tab (in a throwaway browser profile) and fails on any page error, error boundary or blank screen.
const { chromium } = await import('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5300';
const VIEWS = ['dashboard', 'friday', 'generator', 'notebook', 'lecture', 'simulations', 'planner', 'library', 'practice', 'progress', 'teach', 'studio', 'platform']; const TABS = ['bhasha', 'boards', 'scan', 'voice', 'code', 'swipe', 'market', 'bot'];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, permissions: [] }); const pg = await ctx.newPage(); pg.setDefaultTimeout(1500);
await pg.addInitScript(() => { window.speechSynthesis.speak = () => {}; window.open = () => null; window.confirm = () => true; window.alert = () => {}; window.prompt = () => ''; });
const errs = []; let where = ''; pg.on('pageerror', e => errs.push(`${where}: ${String(e).slice(0, 140)}`)); pg.on('dialog', d => d.dismiss().catch(() => {}));
await pg.goto(BASE + '/'); await pg.waitForTimeout(800); let clicks = 0;
async function monkey(label) {
  where = label; const n = await pg.locator('main button:visible, [data-testid]:is(button):visible').count().catch(() => 0);
  const skip = /sign out|delete|reset|clear|wipe|erase/i;
  for (let i = 0; i < Math.min(n, 30); i++) {
    const el = pg.locator('main button:visible, [data-testid]:is(button):visible').nth(i); const txt = ((await el.textContent({ timeout: 500 }).catch(() => '')) || '') + (await el.getAttribute('aria-label').catch(() => '') || '');
    if (/^nav-/.test((await el.getAttribute('data-testid').catch(() => '')) || '')) continue; if (skip.test(txt) && false) continue;
    where = `${label} > "${txt.trim().slice(0, 30)}"`; await el.click({ timeout: 800, force: false }).catch(() => {}); clicks++; await pg.waitForTimeout(40);
    if (await pg.$('text=Something went wrong')) { errs.push(`${where}: error boundary`); await pg.reload(); await pg.waitForTimeout(500); return; }
    await pg.keyboard.press('Escape').catch(() => {});
  }
}
for (const v of VIEWS) { await pg.click(`[data-testid=nav-${v}]`).catch(() => {}); await pg.waitForTimeout(400); if (v === 'studio') { for (const t of TABS) { await pg.click(`[data-testid=studio-tab-${t}]`).catch(() => {}); await pg.waitForTimeout(300); await monkey('studio/' + t); } } else await monkey(v); const len = await pg.evaluate(() => document.body.innerText.length); if (len < 40) errs.push(`${v}: blank after clicks`); }
await b.close(); console.log(`clicked ${clicks} buttons`); console.log(errs.length ? errs.slice(0, 15).join('\n') + `\n${errs.length} problem(s)` : 'MONKEY CLEAN'); process.exit(errs.length ? 1 : 0);
