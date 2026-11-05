import assert from 'node:assert/strict';
import { parseQuestions, makeTest, parseTest, makeResult, parseResult, pilotSummary } from '../src/lib/platform/pilot.ts';
const { questions, errors } = parseQuestions('What is 2+2? | 4 | 3 | 5\nWhat is H2O? | water | salt | air | gas\nbad line only\nUnit of force? | newton | joule'); assert.equal(questions.length, 3); assert.equal(errors.length, 1); assert.match(errors[0], /Line 3/);
assert.ok(questions.every(q => q.options.length >= 2 && q.options[q.answer] !== undefined)); assert.equal(questions[0].options[questions[0].answer], '4'); assert.equal(questions[1].options[questions[1].answer], 'water');
const test = makeTest('Pilot', questions); const rt = parseTest(JSON.stringify(test)); assert.ok(rt.ok); assert.ok(!parseTest('{"kind":"x"}').ok);
const right = test.questions.map(q => q.answer); const r1 = makeResult(test, 'pre', 'Asha', [right[0], null, null], 1); assert.equal(r1.score, 1); assert.equal(makeResult(test, 'post', 'Asha', right, 2).score, 3);
assert.ok(parseResult(JSON.stringify(r1)).ok); const forged = { ...r1, score: 3 }; const pf = parseResult(JSON.stringify(forged)); assert.ok(!pf.ok && /checksum/.test((pf as { why: string }).why)); assert.ok(!parseResult(JSON.stringify({ ...r1, score: 99 })).ok);
// 12 students: pre ~40%, post ~70%
const big = makeTest('Big', Array.from({ length: 10 }, (_, i) => ({ q: 'q' + i, options: ['a', 'b'], answer: 0 }))); const res = [];
for (let s = 0; s < 12; s++) { const pre = 3 + (s % 3), post = pre + 2 + (s % 2); res.push(makeResult(big, 'pre', 'S' + s, Array.from({ length: 10 }, (_, i) => (i < pre ? 0 : 1)), 10), makeResult(big, 'post', 'S' + s, Array.from({ length: 10 }, (_, i) => (i < post ? 0 : 1)), 20, { useful: 4, easier: 4, wouldRecommend: s < 8 ? 9 : 6, trust: 4 })); }
const sm = pilotSummary(res); assert.equal(sm.pairs, 12); assert.ok(sm.meanGainPts! > 20 && sm.meanGainPts! < 30, String(sm.meanGainPts)); assert.ok(sm.ci95![0] > 0 && sm.cohensD! > 1); assert.equal(sm.improved, 12); assert.match(sm.verdict, /not proof that the app caused it/); assert.equal(sm.survey!.nps, Math.round((8 - 4) / 12 * 100));
// small samples are not over-claimed; unpaired students are counted; latest result wins
assert.match(pilotSummary(res.slice(0, 4)).verdict, /too few/); assert.equal(pilotSummary([r1]).pairs, 0); assert.equal(pilotSummary([r1]).preOnly, 1); assert.match(pilotSummary([]).verdict, /No student/);
const noisy = []; for (let s = 0; s < 12; s++) noisy.push(makeResult(big, 'pre', 'N' + s, Array.from({ length: 10 }, (_, i) => (i < 5 ? 0 : 1)), 1), makeResult(big, 'post', 'N' + s, Array.from({ length: 10 }, (_, i) => (i < (s % 2 ? 7 : 3) ? 0 : 1)), 2)); assert.match(pilotSummary(noisy).verdict, /includes zero/);
console.log('pilot OK');
