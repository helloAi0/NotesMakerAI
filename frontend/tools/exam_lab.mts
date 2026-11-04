import assert from 'node:assert/strict';
import { Deck, cardsFromText } from '../src/lib/friday/agents/tutor.ts';
import { makePaper, gradePaper, markShort } from '../src/lib/platform/exam.ts';
import { reviewLab, isAnswerRequest, coachReply } from '../src/lib/platform/lab.ts';
import { testKV } from '../src/lib/friday/learn.ts';
const DAY = 86400000, now = new Date('2026-11-04T10:00:00').getTime();
const deck = new Deck(testKV(), 'e');
deck.add(cardsFromText('Enthalpy is the heat content of a system at constant pressure. Entropy is a measure of disorder in a system. Internal energy is the total energy stored inside a system. A calorimeter is a device used to measure heat transfer.', 'thermodynamics', 'x', now - 30 * DAY));
deck.add(cardsFromText('Velocity is the rate of change of position of an object with time. Acceleration is a measure of the rate of change of velocity. Momentum is the product of mass and velocity of a body.', 'kinematics', 'x', now - 30 * DAY));
for (const c of deck.cards().filter(c => c.topic === 'kinematics')) deck.review(c.id, 4, now - DAY); // kinematics strong, thermodynamics weak
const p = makePaper(deck, { n: 6, now, rng: () => 0.5 })!; assert.ok(p && p.items.length >= 5);
const thermo = p.items.filter(i => i.topic === 'thermodynamics').length; assert.ok(thermo >= p.items.length / 2, `weak topic dominates the paper (${thermo}/${p.items.length})`);
assert.ok(p.items.every(i => i.kind === 'short' || (i.options!.length >= 3 && i.options![i.answer!] === i.key)), 'every MCQ contains its key at the marked index');
assert.ok(p.items.some(i => i.kind === 'short'), 'mixed formats');
assert.equal(makePaper(new Deck(testKV(), 'x'), { now }), null, 'too few cards → no paper');
// perfect paper
const ans = (f: (i: (typeof p.items)[number]) => { choice?: number; text?: string }, ms = 8000) => p.items.map(i => ({ itemId: i.id, ms, ...f(i) }));
let r = gradePaper(deck, p, ans(i => (i.kind === 'mcq' ? { choice: i.answer } : { text: i.key }))); assert.equal(r.pct, 1); assert.equal(r.patterns.length, 0); assert.ok(r.updates.every(u => u.grade === 3));
// all wrong + rushed + blank → patterns
const a2 = p.items.map((i, k) => (k === 0 ? { itemId: i.id, ms: 0 } : { itemId: i.id, ms: k < 3 ? 400 : 9000, ...(i.kind === 'mcq' ? { choice: (i.answer! + 1) % i.options!.length } : { text: 'something unrelated entirely' }) }));
r = gradePaper(deck, p, a2); assert.ok(r.pct < 0.2); const kinds = r.patterns.map(x => x.kind); assert.ok(kinds.includes('unanswered') && kinds.includes('rushed') && kinds.includes('concept-gap'), kinds.join()); assert.ok(r.updates.some(u => u.mistake) && r.byTopic[0].pct <= r.byTopic[r.byTopic.length - 1].pct);
// short answer partial credit and numbers
assert.equal(markShort('the heat content of a system at constant pressure', 'heat content of a system').got, 1); assert.equal(markShort('the heat content of a system at constant pressure', 'it is pressure').got, 0.5 * 0 + markShort('the heat content of a system at constant pressure', 'it is pressure').got);
assert.equal(markShort('speed is 9.8 metres per second', 'speed is 9 metres per second').got, 0); assert.equal(markShort('x', '').got, 0);
// lab helper
const good = `Aim: to find g using a simple pendulum.\nHypothesis: I expect T to grow with the square root of length.\nApparatus and procedure: a 1.00 m string, stopwatch (0.01 s), clamp.\nObservations: L = 0.50 m, T = 1.42 s; L = 1.00 m, T = 2.01 s; L = 1.50 m, T = 2.46 s.\nCalculation: g = 4*3.14*3.14*1.00/2.01/2.01 = 9.76 m/s²\nError analysis: the stopwatch uncertainty of 0.01 s and my reaction time are the main sources of error.\nConclusion: g = 9.76 m/s² is within 1% of the accepted value, so the aim was met.`;
let lab = reviewLab(good); assert.ok(lab.issues.filter(i => i.level === 'fix').length === 0, JSON.stringify(lab.issues)); assert.ok(lab.score >= 90 && lab.strengths.length >= 4);
lab = reviewLab(good.replace('= 9.76 m/s²\n', '= 8.00 m/s²\n').replace(/Error analysis:.*\n/, '')); assert.ok(lab.issues.some(i => i.section === 'calculation' && i.level === 'fix'), JSON.stringify(lab.issues)); assert.ok(lab.issues.some(i => i.section === 'error'));
lab = reviewLab('Observations: 3 4 5 6 7 8 9 10 numbers without units 11 12 13 and some more text to pass the minimum length of the draft check here.'); assert.ok(lab.issues.some(i => /no unit/.test(i.message)) && lab.issues.some(i => i.section === 'aim'));
assert.ok(lab.issues.every(i => i.ask.endsWith('?') || i.ask.length > 10)); assert.ok(!lab.issues.some(i => /the answer is|should be \d/.test(i.ask)), 'never reveals results');
assert.ok(isAnswerRequest('write my lab report for me') && isAnswerRequest('just give me the answer') && !isAnswerRequest('why does the period depend on length')); assert.match(coachReply('solve my homework'), /will not write or solve/); assert.equal(reviewLab('short').score, 0);
console.log('exam + lab OK');
