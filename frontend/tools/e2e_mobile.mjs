const { chromium } = await import('playwright').catch(() => import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs'));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
const out = process.argv[2] || '/tmp/m';
for (const [name, w, h] of [['phone', 375, 667], ['small', 320, 568], ['tablet', 768, 1024]]) {
  const pg = await b.newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  pg.setDefaultTimeout(45000); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto((process.env.BASE || 'http://localhost:5199') + '/'); await pg.waitForTimeout(500);
  const over = async (label) => { const r = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, main: (() => { const m = document.querySelector('main'); return m ? m.getBoundingClientRect().width : 0; })() })); console.log(name, label.padEnd(18), `page ${r.sw}/${r.cw}`, `main ${Math.round(r.main)}px`, r.sw > r.cw + 1 ? 'HORIZONTAL OVERFLOW' : 'ok'); await pg.screenshot({ path: `${out}_${name}_${label.replace(/\W/g,'')}.png` }); };
  await over('home');
  for (const [lab, sel] of [['notebook', 'Digital Notebook'], ['visuals', 'Visuals Studio']]) { if (w < 768) { await pg.click('button[aria-label="Open menu"]'); await pg.waitForTimeout(250); const bx = await pg.locator('aside').boundingBox(); if (!bx || bx.x < -1) console.log(name, 'MENU DID NOT OPEN'); } await pg.locator(`aside button:has-text("${sel}")`).first().click().catch(e => console.log('nav click failed', sel)); await pg.waitForTimeout(400); await over(lab); }
  await pg.click('button:has-text("Curriculum Coverage")').catch(() => {}); await pg.waitForTimeout(300); await over('coverage');
  await pg.click('button:has-text("Notes Maker Simulations")').catch(() => {}); await pg.waitForTimeout(300);
  await pg.locator('text=Projectile').first().click().catch(() => {}); await pg.waitForTimeout(700); await over('sim');
  console.log(name, 'errors', errs.slice(0, 3));
  await pg.close();
}
await b.close();
