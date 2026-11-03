// E2E: multi-agent FRIDAY — trace + replay, sandbox time limit, Tutor, Evals, undo, confirmation. BASE env = preview server.
const { chromium } = await import('playwright').catch(() => import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs'));
const BASE = process.env.BASE || 'http://localhost:5300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const pg = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); pg.setDefaultTimeout(20000);
const errs = []; pg.on('pageerror', e => errs.push(e.message));
let fail = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fail++; };
await pg.goto(BASE + '/'); await pg.waitForTimeout(1200); await pg.click('[data-testid=nav-friday]'); await pg.waitForSelector('[data-testid=friday-input]');
const last = async () => (await pg.locator('[data-testid=friday-reply]').last().innerText());
const ask = async (q) => { await pg.fill('[data-testid=friday-input]', q); await pg.click('[data-testid=friday-send]'); await pg.waitForFunction(() => !document.querySelector('[data-testid=friday-busy]') && !/Working:/.test(document.body.innerText), null, { timeout: 25000 }).catch(() => {}); await pg.waitForTimeout(600); return last(); };
// trace + replay
let t = await ask('what is entropy'); ok('answer cites sources', /Sources|From /.test(t), t.slice(0, 200));
await pg.locator('[data-testid=view-trace]').last().click(); await pg.waitForSelector('[data-testid=agents-panel]');
const tl = await pg.innerText('[data-testid=task-list]'); ok('trace lists Planner, Researcher and Critic', /Planner/.test(tl) && /Researcher/.test(tl) && /Critic/.test(tl), tl);
ok('trace has events', (await pg.locator('[data-testid=events] li').count()) > 5);
await pg.click('[data-testid=replay]'); await pg.waitForTimeout(500); const mid = await pg.locator('[data-testid=events] li').count(); await pg.waitForTimeout(4500); const end = await pg.locator('[data-testid=events] li').count(); ok('replay steps through events', end > mid && mid < end, `${mid}→${end}`);
// sandbox
await pg.click('[data-testid=friday-tab-chat]');
t = await ask('run this code ```console.log(2+3)```'); ok('sandbox runs code', /Ran your code/.test(t) && /\b5\b/.test(t), t.slice(0, 200));
const t0 = Date.now(); t = await ask('run this code ```while(true){}```'); ok('infinite loop is stopped by the time limit', /stopped after/.test(t) && Date.now() - t0 < 15000, t.slice(0, 200));
t = await ask('run this code ```fetch("https://example.com").then(r=>console.log(1))```'); ok('sandbox has no network', /failed|not a function|undefined|Cannot|TypeError/i.test(t), t.slice(0, 200));
// calculation is computed
t = await ask('what is 15% of 240'); ok('math computed with calculator', /36/.test(t), t.slice(0, 160));
// undo + scribe
t = await ask('write a summary of entropy to my notes file called ent.md'); ok('scribe saved file', /Saved to/.test(t), t.slice(0, 200));
await pg.click('[data-testid=friday-tab-files]'); await pg.click('[data-testid=files-list] >> text=Notes'); ok('file exists', /ent\.md/.test(await pg.innerText('[data-testid=files-list]')));
await pg.click('[data-testid=friday-tab-chat]'); t = await ask('undo'); ok('undo reports', /Undid/.test(t), t);
await pg.click('[data-testid=friday-tab-files]'); await pg.click('button:text-is("root")'); await pg.click('[data-testid=files-list] >> text=Notes'); ok('file removed by undo', !/ent\.md/.test(await pg.innerText('[data-testid=files-list]')));
// Tutor
await pg.click('[data-testid=friday-tab-files]'); await pg.click('button:text-is("root")'); await pg.click('[data-testid=files-list] >> text=Documents');
await pg.setInputFiles('[data-testid=files-upload]', { name: 'enthalpy.txt', mimeType: 'text/plain', buffer: Buffer.from('Enthalpy is the heat content of a system at constant pressure. Entropy is a measure of disorder in a system. Gibbs energy is the maximum reversible work obtainable at constant temperature and pressure. A catalyst is a substance that speeds up a reaction without being consumed. The first law states that energy is conserved: ΔU = Q − W.') });
await pg.waitForSelector('text=enthalpy.txt'); await pg.click('[data-testid=friday-tab-chat]');
t = await ask('make flashcards from my notes on enthalpy'); ok('flashcards made', /flashcard/i.test(t), t.slice(0, 200));
await pg.click('[data-testid=friday-tab-tutor]'); const nc = +(await pg.innerText('[data-testid=tutor-cards]')); ok('cards in tutor tab', nc >= 3, String(nc));
await pg.click('[data-testid=show-answer]'); await pg.click('[data-testid=grade-good]'); ok('review schedules the card', +(await pg.innerText('[data-testid=tutor-due]')) === nc - 1);
await pg.fill('[data-testid=exam-input]', 'enthalpy exam in 3 days'); await pg.click('[data-testid=exam-add]'); await pg.waitForTimeout(300);
const nud = await pg.innerText('[data-testid=nudges]'); ok('nudge names weak topic and exam', /Enthalpy is weak/.test(nud) && /exam in [23] days/.test(nud), nud);
await pg.fill('[data-testid=quiz-topic]', ''); await pg.click('[data-testid=quiz-start]'); ok('quiz shows options', (await pg.locator('[data-testid=quiz] button').count()) >= 2);
// evals in the browser (uses the real Worker sandbox)
await pg.click('[data-testid=friday-tab-evals]'); await pg.click('[data-testid=evals-run]'); await pg.waitForSelector('[data-testid=evals-score]', { timeout: 60000 });
const sc = await pg.innerText('[data-testid=evals-score]'); ok('50-question harness passes in the browser', /^50\/50/.test(sc.trim()), sc + ' ' + (await pg.innerText('[data-testid=evals-result]')).slice(0, 400));
// confirmation before delete
await pg.click('[data-testid=friday-tab-chat]'); await pg.fill('[data-testid=friday-input]', 'create a folder called Temp then delete the folder Temp'); await pg.click('[data-testid=friday-send]');
const conf = await pg.waitForSelector('text=Yes, do it', { timeout: 15000 }).then(() => true).catch(() => false); ok('asks before deleting', conf);
if (conf) { await pg.click('text=No, cancel'); await pg.waitForTimeout(800); ok('cancel changes nothing', /Cancelled/.test(await pg.innerText('body'))); }
ok('no page errors', errs.length === 0, errs.join('|')); await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
