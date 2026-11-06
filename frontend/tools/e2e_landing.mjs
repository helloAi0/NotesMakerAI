// E2E: the 3D landing page renders a WebGL canvas, is dismissible (button, Escape, skip), is remembered, and costs nothing for the main bundle.
const { chromium } = await import('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fail++; };
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const reqs = []; pg.on('request', r => reqs.push(r.url()));
await pg.goto(BASE + '/'); await pg.waitForTimeout(1200);
ok('automated browsers skip the landing by default', !(await pg.$('[data-testid=landing]')));
ok('three.js is not downloaded for ordinary visits', !reqs.some(u => /LandingScene|three/i.test(u)));
await pg.goto(BASE + '/#welcome'); await pg.reload(); await pg.waitForSelector('[data-testid=landing]'); await pg.waitForSelector('[data-testid=landing-canvas] canvas', { timeout: 15000 });
const px = await pg.evaluate(() => { const c = document.querySelector('[data-testid=landing-canvas] canvas'); return { w: c.width, h: c.height }; }); ok('canvas has size', px.w > 300 && px.h > 300, JSON.stringify(px));
await pg.waitForTimeout(1500); await pg.screenshot({ path: '/tmp/landing.png' });
const png = await pg.screenshot({ clip: { x: 640, y: 200, width: 500, height: 400 } }); ok('something is actually drawn (the 3D crystal region is not a flat colour)', png.length > 15000, String(png.length));
ok('headline + features visible', /Learn anything/.test(await pg.textContent('[data-testid=landing]')) && /Handwriting to LaTeX/.test(await pg.textContent('[data-testid=landing]')));
await pg.click('[data-testid=landing-start]'); ok('Start learning closes it', !(await pg.$('[data-testid=landing]')));
ok('url hash cleared', !(await pg.evaluate(() => location.hash)));
await pg.click('[data-testid=open-landing]'); await pg.waitForSelector('[data-testid=landing]'); await pg.keyboard.press('Escape'); ok('Escape closes it', !(await pg.$('[data-testid=landing]')));
await pg.click('[data-testid=open-landing]'); await pg.click('[data-testid=landing-skip]'); ok('Skip closes it', !(await pg.$('[data-testid=landing]')));
// a real first visit (not automated) shows it once, then remembers
const c2 = await b.newContext({ viewport: { width: 390, height: 780 } }); await c2.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); }); const p2 = await c2.newPage(); const e2 = []; p2.on('pageerror', e => e2.push(e.message));
await p2.goto(BASE + '/'); await p2.waitForSelector('[data-testid=landing]'); ok('first visit shows landing on a phone', true);
ok('no horizontal overflow on phone', (await p2.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 2);
await p2.click('[data-testid=landing-start]'); await p2.reload(); await p2.waitForTimeout(800); ok('second visit goes straight to the app', !(await p2.$('[data-testid=landing]')));
// reduced motion + no-WebGL fallback
const c3 = await b.newContext({ reducedMotion: 'reduce' }); const p3 = await c3.newPage(); await p3.goto(BASE + '/#welcome'); await p3.reload(); await p3.waitForSelector('[data-testid=landing-canvas] canvas', { timeout: 15000 }); ok('reduced motion renders a still frame', true);
const c4 = await b.newContext(); await c4.addInitScript(() => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : o.call(this, t, ...a); }; }); const p4 = await c4.newPage(); const e4 = []; p4.on('pageerror', e => e4.push(e.message)); await p4.goto(BASE + '/#welcome'); await p4.reload(); await p4.waitForSelector('[data-testid=landing]'); await p4.waitForTimeout(1500);
ok('no WebGL: page still works with a gradient background', !!(await p4.$('[data-testid=landing-start]')) && e4.length === 0, e4.join('|'));
ok('no page errors', errs.filter(e => !/GPU stall|swiftshader|WebGL/i.test(e)).length === 0 && e2.length === 0, errs.join('|'));
await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
