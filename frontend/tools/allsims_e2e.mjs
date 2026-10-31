// Opens EVERY simulation in the real UI: no errors, canvas drawn, readouts present, Play visibly changes the picture. Writes /tmp/allsims.log
const { chromium } = await import('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5300'; const list = JSON.parse((await import('node:fs')).readFileSync('/tmp/titles.json', 'utf8'));
const from = Number(process.argv[2] || 0), to = Number(process.argv[3] || list.length);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const pg = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage(); pg.setDefaultTimeout(12000);
let cur = ''; const errs = []; pg.on('pageerror', e => errs.push(`${cur}: ${e.message}`)); pg.on('console', m => m.type() === 'error' && errs.push(`${cur}: console ${m.text().slice(0, 120)}`));
await pg.goto(BASE + '/'); await pg.waitForTimeout(800); await pg.click('[data-testid=nav-simulations]'); await pg.waitForSelector('text=Interactive Simulation Library'); await pg.click('button:has-text("All Curricula")'); await pg.waitForTimeout(500);
const snap = () => pg.evaluate(() => { const c = document.querySelector('canvas'); if (!c) return null; const x = c.getContext('2d'); try { const d = x.getImageData(0, 0, c.width, c.height).data; let h = 0, nz = 0; for (let i = 0; i < d.length; i += 97) { h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0; if (d[i] + d[i + 1] + d[i + 2] > 40) nz++; } return { h, nz }; } catch { return { h: 0, nz: -1 }; } });
const bad = []; let n = 0;
for (const s of list.slice(from, to)) {
  cur = s.id; n++;
  try {
    const card = pg.locator(`main button:has-text("${s.title.slice(0, 40).replace(/"/g, '\\"')}")`).first();
    if (!(await card.count())) { await pg.fill('input[placeholder^="Search: kinematics"]', s.title.slice(0, 30)).catch(() => {}); await pg.waitForTimeout(250); }
    await pg.locator(`main button:has-text("${s.title.slice(0, 40).replace(/"/g, '\\"')}")`).first().click(); await pg.waitForSelector('canvas', { timeout: 8000 }); await pg.waitForTimeout(500);
    const a = await snap(); if (!a || a.nz === 0) bad.push(`${s.id}: blank canvas`);
    const play = pg.locator('button:has-text("Play")').first(); if (await play.count()) { await play.click(); await pg.waitForTimeout(1500); const c = await snap(); await pg.waitForTimeout(700); const d = await snap(); if (a && c && d && a.h === c.h && c.h === d.h) bad.push(`${s.id}: Play changes nothing`); }
    const txt = await pg.innerText('main'); if (!/=|Readout|Live|°|\d/.test(txt)) bad.push(`${s.id}: no readouts`);
    await pg.locator('button:has-text("Back to Simulation Library")').first().click({ timeout: 4000 }).catch(async () => { await pg.click('[data-testid=nav-simulations]'); }); await pg.waitForTimeout(250);
    const inp = pg.locator('input[placeholder^="Search: kinematics"]'); if (await inp.count()) await inp.fill('').catch(() => {});
  } catch (e) { bad.push(`${s.id}: ${e.message.split('\n')[0].slice(0, 100)}`); await pg.click('[data-testid=nav-simulations]').catch(() => {}); await pg.waitForTimeout(400); }
}
console.log(`checked ${n} sims; problems ${bad.length}; page errors ${errs.length}`); bad.forEach(x => console.log('  ' + x)); errs.slice(0, 20).forEach(x => console.log('  ERR ' + x)); await b.close();
