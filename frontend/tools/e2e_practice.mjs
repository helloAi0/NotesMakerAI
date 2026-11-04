// E2E: Practice (predict, mock exam, check my work, lab) + My Progress (graph, outcomes).
const { chromium } = await import('playwright').catch(() => import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs'));
const BASE = process.env.BASE || 'http://localhost:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const pg = await ctx.newPage(); pg.setDefaultTimeout(20000);
const errs = []; pg.on('pageerror', e => errs.push(e.message));
let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fail++; };
await pg.goto(BASE + '/'); await pg.waitForTimeout(800);
// seed flashcards through the real Quick start
await pg.click('[data-testid=nav-friday]'); await pg.waitForTimeout(400); await pg.click('[data-testid=friday-tab-class]');
await pg.fill('[data-testid=qs-topic]', 'thermodynamics'); await pg.fill('[data-testid=qs-text]', 'Enthalpy is the heat content of a system at constant pressure. Entropy is a measure of disorder in a system. Internal energy is the total energy stored inside a system. A calorimeter is a device used to measure heat transfer. Power = work / time. Velocity is the rate of change of position of an object with time.'); await pg.click('[data-testid=qs-build]'); await pg.waitForSelector('[data-testid=tutor-panel]');
// ---- Check my work
await pg.click('[data-testid=nav-practice]'); await pg.waitForSelector('[data-testid=practice-view]'); await pg.click('[data-testid=practice-tab-check]');
await pg.fill('[data-testid=cw-text]', '1) 2x + 3 = 11\n2) 2x = 8\n3) x = 5'); await pg.click('[data-testid=cw-check]');
const sm = await pg.innerText('[data-testid=cw-summary]'); ok('finds the exact wrong line', /first mistake is on line 3/.test(sm), sm);
ok('error line is explained', (await pg.locator('[data-testid=cw-line-error]').innerText()).includes('Line 2 has x = 4'));
await pg.fill('[data-testid=cw-text]', '2x + 3 = 11\n2x = 8\nx = 4'); await pg.click('[data-testid=cw-check]'); ok('correct solution passes', /consistent/.test(await pg.innerText('[data-testid=cw-summary]')));
// ---- Predict
await pg.click('[data-testid=practice-tab-predict]'); await pg.fill('[data-testid=pred-search]', 'projectile'); await pg.getByRole('button', { name: /Projectile/ }).first().click();
await pg.waitForSelector('[data-testid=pred-card]'); ok('a prediction question appears', /you change/.test(await pg.innerText('[data-testid=pred-question]')));
await pg.click('[data-testid=pred-up]'); await pg.click('[data-testid=pred-lock]'); await pg.waitForSelector('[data-testid=pred-result]');
const hl = await pg.innerText('[data-testid=pred-headline]'); ok('result compares prediction and reality', /Right|Not quite/.test(hl), hl);
ok('tally updates', /1\/1|0\/1/.test(await pg.innerText('[data-testid=pred-tally]')));
await pg.click('[data-testid=pred-watch]'); await pg.waitForSelector('[data-testid=pred-sim] canvas'); ok('simulation is shown with the new setting', true);
await pg.click('[data-testid=pred-random]'); await pg.waitForSelector('[data-testid=pred-card]'); ok('Surprise me gives another question', true);
// ---- Mock exam
await pg.click('[data-testid=practice-tab-exam]'); await pg.selectOption('[data-testid=exam-n]', '5'); await pg.click('[data-testid=exam-start]'); await pg.waitForSelector('[data-testid=exam-run]');
ok('timer is shown', /\d+:\d\d/.test(await pg.innerText('[data-testid=exam-timer]')));
for (let k = 0; k < 5; k++) { if (await pg.locator('[data-testid=exam-opt-0]').count()) await pg.click('[data-testid=exam-opt-0]'); else await pg.fill('[data-testid=exam-text]', 'heat content of a system'); if (k < 4) await pg.click('[data-testid=exam-next]'); }
await pg.click('[data-testid=exam-submit]'); await pg.waitForSelector('[data-testid=exam-result]'); ok('exam is graded', /\d+\/\d+/.test(await pg.innerText('[data-testid=exam-score]')));
// ---- Lab
await pg.click('[data-testid=practice-tab-lab]'); await pg.fill('[data-testid=lab-text]', 'Observations: L = 0.50 m, T = 1.42 s; L = 1.00 m, T = 2.01 s. Calculation: 4*3*3 = 40. Conclusion: it worked and I am happy with the experiment overall.'); await pg.click('[data-testid=lab-review]');
await pg.waitForSelector('[data-testid=lab-result]'); const issues = await pg.locator('[data-testid=lab-issue]').allInnerTexts(); ok('lab review lists issues with guiding questions', issues.length >= 2 && issues.some(t => /Ask yourself/.test(t)), issues.join('|').slice(0, 150)); ok('wrong arithmetic is flagged', issues.some(t => /does not add up/.test(t)));
await pg.fill('[data-testid=lab-ask]', 'write my lab report'); await pg.press('[data-testid=lab-ask]', 'Enter'); ok('answer requests get coaching, not an answer', /will not write or solve/.test(await pg.innerText('[data-testid=lab-coach]')));
// ---- Progress
await pg.click('[data-testid=nav-progress]'); await pg.waitForSelector('[data-testid=progress-view]'); await pg.waitForSelector('[data-testid=graph-svg]'); ok('knowledge graph is drawn', (await pg.locator('[data-testid=graph-svg] circle').count()) >= 1);
await pg.locator('[data-testid=graph-svg] g').first().click(); ok('clicking a concept shows its detail', /Mastery/.test(await pg.innerText('[data-testid=graph-detail]')));
await pg.click('[data-testid=progress-tab-outcomes]'); await pg.waitForSelector('[data-testid=outcomes]'); ok('outcomes show an honest evidence level', /data|Early|Enough/.test(await pg.innerText('[data-testid=evidence-level]')));
ok('time saved is labelled as an estimate', /estimate/i.test(await pg.innerText('[data-testid=time-saved]')));
ok('no page errors', errs.length === 0, errs.join('|')); await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
