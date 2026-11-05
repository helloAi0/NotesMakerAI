// E2E: start banner, Teach (course pack, pilot kit, study rooms), Platform (trust, plugins, languages, privacy/backup/profile, pricing, demo), lecture → everything.
const { chromium } = await import('playwright').catch(() => import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs'));
const fs = await import('node:fs');
const BASE = process.env.BASE || 'http://localhost:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); const pg = await ctx.newPage(); pg.setDefaultTimeout(20000);
const errs = []; pg.on('pageerror', e => errs.push(e.message));
let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fail++; };
const dl = async (page, sel) => { const [d] = await Promise.all([page.waitForEvent('download'), page.click(sel)]); return d.path(); };
await pg.goto(BASE + '/'); await pg.waitForTimeout(800);
// ---- start banner
ok('first-run banner is shown', await pg.locator('[data-testid=start-banner]').count() === 1); await pg.click('[data-testid=start-dismiss]'); ok('banner can be dismissed', await pg.locator('[data-testid=start-banner]').count() === 0);
// ---- Teach: course pack
await pg.click('[data-testid=nav-teach]'); await pg.waitForSelector('[data-testid=teach-view]');
await pg.fill('[data-testid=course-title]', 'Physics 101'); await pg.fill('[data-testid=course-syllabus]', 'Unit 1: Thermodynamics — heat, work, entropy\nUnit 2: Kinematics\n  - velocity, acceleration\n3. Waves and Optics');
await pg.fill('[data-testid=course-material]', 'Enthalpy is the heat content of a system at constant pressure. Entropy is a measure of disorder in a system.\n\nVelocity is the rate of change of position of an object with time. Acceleration is a measure of the rate of change of velocity.');
await pg.fill('[data-testid=course-exam]', '2027-01-15'); await pg.click('[data-testid=course-build]'); await pg.waitForSelector('[data-testid=course-pack]');
const cs = await pg.innerText('[data-testid=course-summary]'); ok('course pack has units, cards and a plan', /3 units/.test(cs) && /flashcards/.test(cs) && /-week plan/.test(cs), cs);
const packPath = await dl(pg, '[data-testid=course-download]'); await pg.setInputFiles('[data-testid=course-file]', packPath); await pg.waitForTimeout(300);
ok('student can import the pack', /Added \d+ flashcards/.test(await pg.innerText('[data-testid=course-imp-msg]')), await pg.innerText('[data-testid=course-imp-msg]'));
const bad = JSON.parse(fs.readFileSync(packPath, 'utf8')); bad.units[0].title = 'Hacked'; fs.writeFileSync('/tmp/badpack.json', JSON.stringify(bad)); await pg.setInputFiles('[data-testid=course-file]', '/tmp/badpack.json'); await pg.waitForTimeout(300); ok('edited pack is rejected', /edited or damaged/.test(await pg.innerText('[data-testid=course-imp-msg]')));
// ---- Pilot kit
await pg.click('[data-testid=teach-tab-pilot]'); await pg.fill('[data-testid=pilot-qs]', 'What is 2+2? | 4 | 3 | 5\nSI unit of force? | newton | joule | watt\nH2O is? | water | salt | air'); const testPath = await dl(pg, '[data-testid=pilot-make]'); ok('pilot test parsed', /3 question/.test(await pg.innerText('[data-testid=pilot-parsed]')));
const results = [];
for (const [phase, name, correct] of [['pre', 'Asha', 1], ['post', 'Asha', 3], ['pre', 'Ben', 0], ['post', 'Ben', 2]]) {
  await pg.setInputFiles('[data-testid=pilot-testfile]', testPath); await pg.waitForSelector('[data-testid=pilot-take]'); await pg.selectOption('[data-testid=pilot-phase]', phase); await pg.fill('[data-testid=pilot-name]', name);
  const test = JSON.parse(fs.readFileSync(testPath, 'utf8')); for (let i = 0; i < 3; i++) { const q = test.questions[i]; const pick = i < correct ? q.answer : (q.answer + 1) % q.options.length; await pg.locator(`input[name=pq${i}]`).nth(pick).check(); }
  results.push(await dl(pg, '[data-testid=pilot-finish]'));
}
await pg.setInputFiles('[data-testid=pilot-resfile]', results); await pg.waitForSelector('[data-testid=pilot-summary]'); ok('two students paired', (await pg.innerText('[data-testid=pilot-pairs]')).trim() === '2'); ok('gain is shown', /\+\d+ pts/.test(await pg.innerText('[data-testid=pilot-gain]')));
ok('small sample is not over-claimed', /too few/.test(await pg.innerText('[data-testid=pilot-verdict]')), await pg.innerText('[data-testid=pilot-verdict]'));
// ---- Study rooms (two tabs, BroadcastChannel)
const pg2 = await ctx.newPage(); pg2.setDefaultTimeout(20000); pg2.on('pageerror', e => errs.push('p2:' + e.message)); await pg2.goto(BASE + '/'); await pg2.waitForTimeout(600); await pg2.click('[data-testid=nav-teach]'); await pg2.click('[data-testid=teach-tab-rooms]');
await pg.click('[data-testid=teach-tab-rooms]'); await pg.fill('[data-testid=room-name]', 'Asha'); await pg.fill('[data-testid=room-code]', 'e2e1'); await pg.click('[data-testid=room-join]'); await pg2.fill('[data-testid=room-name]', 'Ben'); await pg2.fill('[data-testid=room-code]', 'e2e1'); await pg2.click('[data-testid=room-join]');
await pg.waitForFunction(() => /Ben/.test(document.querySelector('[data-testid=room-peers]')?.textContent || '')); ok('peers see each other', true);
await pg.click('[data-testid=room-share]'); await pg2.waitForSelector('[data-testid=room-inbox]'); ok('shared deck arrives', /Asha shared/.test(await pg2.innerText('[data-testid=room-inbox]')));
await pg.click('[data-testid=room-challenge]'); await pg2.waitForSelector('[data-testid=room-quiz]'); ok('challenge arrives on the other tab', true);
for (const page of [pg, pg2]) { for (let k = 0; k < 6; k++) { await page.click('[data-testid=room-opt-0]'); await page.click('[data-testid=room-next]'); if (k < 5) await page.waitForTimeout(50); if (await page.locator('[data-testid=room-opt-0]').count() === 0) break; } }
await pg.waitForFunction(() => document.querySelectorAll('[data-testid=room-board] div').length >= 2, null, { timeout: 8000 }).then(() => ok('leaderboard shows both players', true), () => ok('leaderboard shows both players', false, 'board')); await pg2.close();
// ---- Platform
await pg.click('[data-testid=nav-platform]'); await pg.waitForSelector('[data-testid=platform-view]'); ok('overview shows an honest status', /No pilot has run yet/.test(await pg.innerText('[data-testid=overview]')));
await pg.click('[data-testid=platform-tab-trust]'); ok('trust badge is present', await pg.locator('[data-testid=trust-badge] svg').count() === 1); ok('limits are stated', /not general intelligence/.test(await pg.innerText('[data-testid=trust]')));
await pg.click('[data-testid=platform-tab-plugins]'); await pg.click('[data-testid=plugin-example]'); await pg.waitForSelector('[data-testid=plugin-item]'); ok('example plugin installs', /Installed/.test(await pg.innerText('[data-testid=plugin-msg]')));
ok('plugin calculator computes', (await pg.locator('[data-testid=calc-out]').first().innerText()).trim() === '460'); await pg.fill('[data-testid=plugin-text]', '{"kind":"nm-plugin","v":1,"id":"evil-one","name":"x","provides":{"simulations":[{"id":"s","title":"s","subject":"Physics","params":[{"id":"a","label":"a","min":0,"max":1,"step":0.1,"value":0.5}],"readouts":[{"label":"r","expr":"window.alert(1)"}]}]}}'); await pg.click('[data-testid=plugin-install]'); ok('unsafe plugin is rejected', /cannot evaluate/.test(await pg.innerText('[data-testid=plugin-msg]')));
await pg.click('[data-testid=nav-simulations]'); await pg.waitForTimeout(1200); ok('plugin simulation joins the library (178 sims)', /178 Functional Simulations/.test(await pg.innerText('body')), (await pg.innerText('body')).match(/\d+ Functional Simulations/)?.[0]);
await pg.click('[data-testid=nav-platform]'); await pg.click('[data-testid=platform-tab-languages]'); await pg.selectOption('[data-testid=tutor-lang]', 'ta'); ok('tutor language sets an instruction', /Tamil/.test(await pg.innerText('[data-testid=lang-note]'))); ok('voice report lists languages', (await pg.locator('[data-testid=voice-row]').count()) === 10);
await pg.click('[data-testid=platform-tab-developers]'); await pg.selectOption('[data-testid=api-consent]', 'read'); await pg.waitForTimeout(100);
const api1 = await pg.evaluate(async () => { try { return { topics: await window.NotesMaker.getTopics() }; } catch (e) { return { err: String(e) }; } }); ok('API works with read consent', Array.isArray(api1.topics), JSON.stringify(api1));
await pg.selectOption('[data-testid=api-consent]', 'off'); const api2 = await pg.evaluate(async () => { try { await window.NotesMaker.getTopics(); return 'allowed'; } catch (e) { return String(e); } }); ok('API denies when off', /Permission denied/.test(api2), api2);
await pg.click('[data-testid=platform-tab-pricing]'); ok('pricing says nothing can be bought', /nothing can be bought/i.test(await pg.innerText('[data-testid=pricing-note]'))); await pg.click('[data-testid=platform-tab-roadmap]'); ok('roadmap lists planned work', /planned/.test(await pg.innerText('[data-testid=roadmap]')));
// privacy: backup round trip, analytics consent, profile
await pg.click('[data-testid=platform-tab-privacy]'); await pg.fill('[data-testid=bk-pass]', 'correct horse battery'); const bkPath = await dl(pg, '[data-testid=bk-export]'); const bk = fs.readFileSync(bkPath, 'utf8'); ok('backup file is encrypted', !/thermodynamics|Physics 101/i.test(bk) && /nm-backup/.test(bk));
await pg.fill('[data-testid=bk-pass]', 'wrong passphrase!!'); await pg.setInputFiles('[data-testid=bk-file]', bkPath); await pg.waitForTimeout(600); ok('wrong passphrase is refused', /Wrong passphrase/.test(await pg.innerText('[data-testid=bk-msg]')));
await pg.check('[data-testid=an-consent]'); ok('analytics consent is explicit', await pg.isChecked('[data-testid=an-consent]'));
await pg.fill('[data-testid=prof-name]', 'Asha'); await pg.selectOption('[data-testid=prof-role]', 'student'); await pg.click('[data-testid=prof-save]'); await pg.waitForTimeout(400); ok('student role hides Teach', await pg.locator('[data-testid=nav-teach]').count() === 0);
await pg.selectOption('[data-testid=prof-role]', 'teacher'); await pg.fill('[data-testid=prof-pin]', '4821'); await pg.click('[data-testid=prof-save]'); await pg.waitForTimeout(500); await pg.click('[data-testid=nav-teach]'); await pg.waitForSelector('[data-testid=teach-gate]'); ok('teacher PIN gate appears', true);
await pg.fill('[data-testid=teach-pin]', '1111'); await pg.press('[data-testid=teach-pin]', 'Enter'); await pg.waitForTimeout(500); ok('wrong PIN is refused', await pg.locator('[data-testid=teach-gate]').count() === 1); await pg.fill('[data-testid=teach-pin]', '4821'); await pg.press('[data-testid=teach-pin]', 'Enter'); await pg.waitForSelector('[data-testid=teach-view]'); ok('right PIN opens Teach', true);
// ---- demo data (reversible)
await pg.click('[data-testid=nav-platform]'); await pg.click('[data-testid=platform-tab-overview]'); await pg.click('[data-testid=demo-enable]'); await pg.waitForLoadState('load'); await pg.waitForTimeout(1200);
await pg.click('[data-testid=nav-platform]').catch(() => {}); await pg.waitForSelector('[data-testid=demo-on]'); ok('demo data is clearly labelled', /synthetic/.test(await pg.innerText('[data-testid=demo-on]')));
await pg.click('[data-testid=nav-progress]'); await pg.click('[data-testid=progress-tab-outcomes]'); await pg.waitForSelector('[data-testid=quiz-gain]'); ok('outcomes show a quiz gain with demo data', /\+\d+ points/.test(await pg.innerText('[data-testid=quiz-gain]')), await pg.innerText('[data-testid=quiz-gain]'));
await pg.click('[data-testid=progress-tab-graph]'); await pg.waitForSelector('[data-testid=graph-rec]'); ok('graph recommends the weak exam topic', /Optics/.test(await pg.innerText('[data-testid=graph-rec]')));
await pg.click('[data-testid=nav-platform]'); await pg.click('[data-testid=demo-disable]'); await pg.waitForLoadState('load'); await pg.waitForTimeout(1000); await pg.click('[data-testid=nav-platform]').catch(() => {}); ok('real data restored', await pg.locator('[data-testid=demo-on]').count() === 0);
// ---- lecture → everything
await pg.click('[data-testid=nav-lecture]'); await pg.getByRole('button', { name: /sample lecture/i }).click(); await pg.getByRole('button', { name: /Make notes/ }).click(); await pg.waitForSelector('[data-testid=lec-everything]'); await pg.click('[data-testid=lec-everything]'); await pg.waitForFunction(() => !/Working/.test(document.querySelector('[data-testid=lec-everything-msg]')?.textContent || 'Working'));
const em = await pg.innerText('[data-testid=lec-everything-msg]'); ok('lecture becomes cards + plan', /Made \d+ flashcard/.test(em) && /study plan/.test(em), em);
ok('no page errors', errs.length === 0, errs.join('|')); await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
