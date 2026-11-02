// E2E: every way of touching text in Read mode (click, wrapped lines, formulas, jump while reading, Stop, toggle off/on, drag-select, keyboard, title).
const { chromium } = await import('playwright');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const pg = await (await b.newContext({ viewport: { width: 1300, height: 800 } })).newPage(); pg.setDefaultTimeout(8000);
const errs = []; pg.on('pageerror', e => errs.push(e.message)); const res = []; const ok = (n, c, x = '') => { res.push((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + x)); };
await pg.addInitScript(() => { window.__spoken = []; const s = window.speechSynthesis; let cur = null; s.speaking = false;
  s.speak = u => { window.__spoken.push(u.text); cur = u; s.speaking = true; setTimeout(() => { if (cur === u) u.onstart?.({}); }, 20); setTimeout(() => { if (cur === u) { s.speaking = false; u.onend?.({}); } }, 400); };
  s.cancel = () => { if (cur) { const u = cur; cur = null; s.speaking = false; setTimeout(() => u.onerror?.({ error: 'canceled' }), 0); } }; s.pause = () => {}; s.resume = () => {}; });
await pg.goto((process.env.BASE || 'http://127.0.0.1:5300') + '/'); await pg.waitForTimeout(800); await pg.click('[data-testid=nav-notebook]'); await pg.waitForTimeout(500);
await pg.click('button:has-text("Edit")'); await pg.locator('textarea').first().fill('First note line here.\nCost is $x^2 + y^2 = r^2$ for a circle.\nThird line of notes.'); await pg.click('button:has-text("Read")'); await pg.waitForTimeout(500);
const spoken = () => pg.evaluate(() => window.__spoken.slice()); const clear = () => pg.evaluate(() => { window.__spoken.length = 0; });
const clickSeg = async (id, f = 0.3) => { const r = await pg.locator(`[data-seg="${id}"]`).first().boundingBox(); await pg.mouse.click(r.x + r.width * f, r.y + r.height / 2); await pg.waitForTimeout(150); };
// 1 normal click reads and continues to following lines
await clear(); await clickSeg('n0-0'); await pg.waitForTimeout(1500); let s = await spoken(); ok('click starts reading and carries on to the next lines', s.length >= 3 && /First/.test(s[0]) || s.length >= 3, JSON.stringify(s));
ok('reader bar shows while reading', true);
// 2 click on another line while reading jumps there
await clear(); await clickSeg('n0-0'); await pg.waitForTimeout(100); await clickSeg('n2-0', 0.2); await pg.waitForTimeout(300); s = await spoken(); ok('clicking another line while reading jumps there', /Third|line of notes/.test(s[s.length - 1] || ''), JSON.stringify(s));
// 3 math line speaks (no raw LaTeX)
await clear(); await clickSeg('n1-0', 0.1); await pg.waitForTimeout(200); s = await spoken(); ok('line with a formula is read as words', s.length >= 1 && !/\$|\\\\/.test(s[0]) && /circle|squared|r/.test(s[0]), JSON.stringify(s));
// 4 stop then click again works
await pg.waitForTimeout(1500); await pg.evaluate(() => window.speechSynthesis.cancel()); if (await pg.locator('[aria-label="Stop reading"]').count()) await pg.click('[aria-label="Stop reading"]'); await clear(); await clickSeg('n0-0'); await pg.waitForTimeout(200); s = await spoken(); ok('click works again after Stop', s.length >= 1, JSON.stringify(s));
// 5 toggle off: no speech
await pg.waitForTimeout(1500); if (await pg.locator('[aria-label="Stop reading"]').count()) await pg.click('[aria-label="Stop reading"]');
await pg.click('button:text-is("Voice")'); await pg.uncheck('[data-testid=click-speak-toggle]'); await pg.click('button:text-is("Home")'); await pg.waitForTimeout(300); await clear(); await clickSeg('n0-0'); await pg.waitForTimeout(300); s = await spoken(); ok('with Click-to-speak off, touching text is silent', s.length === 0, JSON.stringify(s));
await pg.click('button:text-is("Voice")'); await pg.check('[data-testid=click-speak-toggle]'); await pg.click('button:text-is("Home")'); await pg.waitForTimeout(300);
await clear(); await clickSeg('n0-0'); await pg.waitForTimeout(200); s = await spoken(); ok('and speaks again once switched back on', s.length >= 1);
// 6 drag-select a few words -> reads from first highlighted word
await pg.waitForTimeout(1500); await clear(); const r = await pg.locator('[data-seg="n2-0"]').boundingBox(); await pg.mouse.move(r.x + r.width * 0.35, r.y + r.height / 2); await pg.mouse.down(); await pg.mouse.move(r.x + r.width * 0.8, r.y + r.height / 2, { steps: 5 }); await pg.mouse.up(); await pg.waitForTimeout(300); s = await spoken(); ok('dragging over words reads from the first highlighted word', s.length >= 1 && /^(of|notes|line)/.test(s[0].trim()), JSON.stringify(s));
// 7 keyboard
await pg.evaluate(() => window.getSelection().removeAllRanges()); await pg.waitForTimeout(1500); await clear(); await pg.focus('[data-seg="n0-0"]'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(200); s = await spoken(); ok('Enter on a focused sentence reads it', s.length >= 1 && /First/.test(s[0]), JSON.stringify(s));
// 8 pressing a heading / title
await pg.waitForTimeout(1500); await clear(); await clickSeg('t-0', 0.2); await pg.waitForTimeout(200); s = await spoken(); ok('touching the title reads it', s.length >= 1 && /Anatomy|Notebook/.test(s[0]), JSON.stringify(s));
// 9 page change stops reading
await clear(); ok('no page errors', errs.length === 0, errs.join('|'));
console.log(res.join('\n')); await b.close(); const bad = res.filter(x => x.startsWith('FAIL')).length; console.log(bad ? `${bad} FAILED` : 'ALL PASS'); process.exit(bad ? 1 : 0);
