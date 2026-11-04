import assert from 'node:assert/strict';
import { Deck, cardsFromText } from '../src/lib/friday/agents/tutor.ts';
import { StudentModel, buildGraph, explainConcept, recommend, outcomes, relatedness } from '../src/lib/platform/model.ts';
import { testKV } from '../src/lib/friday/learn.ts';
const DAY = 86400000, now = new Date('2026-11-04T10:00:00').getTime();
const deck = new Deck(testKV(), 'd'); const model = new StudentModel(testKV(), 'm');
deck.add(cardsFromText('Enthalpy is the heat content of a system at constant pressure. Entropy is a measure of disorder in a system.', 'thermodynamics', 'x', now - 30 * DAY));
deck.add(cardsFromText('Velocity is the rate of change of position of an object with time. Acceleration is a measure of the rate of change of velocity.', 'kinematics', 'x', now - 30 * DAY));
for (const c of deck.cards().filter(c => c.topic === 'kinematics')) deck.review(c.id, 4, now - DAY);
deck.recordMistake({ topic: 'thermodynamics', question: 'What is enthalpy?', given: 'x', correct: 'y' }, now); deck.recordMistake({ topic: 'thermodynamics', question: 'What is enthalpy?', given: 'x', correct: 'y' }, now);
deck.addExam('thermodynamics', now + 3 * DAY);
model.record({ type: 'sim', ref: 'carnot', topic: 'thermodynamics', t: now - DAY });
const sims = [{ id: 'carnot', title: 'Carnot heat engine thermodynamics', subject: 'Physics', tags: ['entropy'] }, { id: 'pendulum', title: 'Pendulum', subject: 'Physics' }];
const g = buildGraph({ deck, events: model.events(), sims, notes: [{ title: 'Thermodynamics lecture 1', text: 'enthalpy and entropy' }, { title: 'Grocery', text: 'milk' }], now });
const kinds = (k: string) => g.nodes.filter(n => n.kind === k).map(n => n.label);
assert.deepEqual(kinds('concept').sort(), ['kinematics', 'thermodynamics']); assert.equal(kinds('sim').length, 1); assert.deepEqual(kinds('note'), ['Thermodynamics lecture 1']); assert.equal(kinds('mistake').length, 1);
assert.ok(!g.nodes.some(n => n.label === 'Pendulum'), 'sim never run is not in the graph');
const ex = explainConcept(g, 'thermodynamics', now)!; assert.ok(ex.mistakes.length === 1 && ex.sims.length === 1 && ex.notes.length === 1, JSON.stringify(ex)); assert.ok(/missed|Review/.test(ex.next));
assert.equal(recommend(g, 1)[0].topic, 'thermodynamics');
assert.ok(relatedness('heat engines', 'Carnot heat engine') >= 0.9 && relatedness('optics', 'Carnot heat engine') === 0);
// outcomes: a rising quiz curve and honest "no evidence" when there is little data
assert.equal(outcomes(new StudentModel(testKV(), 'z'), now).evidence, 'none');
const sc = [2, 3, 3, 6, 8, 9]; sc.forEach((s, i) => model.record({ type: 'quiz', score: s, n: 10, t: now - (10 - i) * DAY }));
for (let i = 0; i < 12; i++) model.record({ type: 'review', grade: i % 4 === 0 ? 1 : 3, elapsed: i < 6 ? 0.5 : 8, t: now - i * 3600_000 });
[0.3, 0.5, 0.7].forEach((a, i) => { (model as any).s.mast.push({ t: now - (9 - i * 3) * DAY, avg: a, topics: 2 }); });
const o = outcomes(model, now); assert.ok(o.quiz.gain! > 0.4, JSON.stringify(o.quiz)); assert.equal(o.evidence, 'usable'); assert.ok(o.retention[0].recalled !== null && o.retention[3].recalled !== null);
assert.equal(o.masteryGrowth.from, 0.3); assert.ok(o.timeSaved.assumptions.length >= 1);
// persistence
const kv = testKV(); const a = new StudentModel(kv, 'p'); a.record({ type: 'note', t: now }); assert.equal(new StudentModel(kv, 'p').events().length, 1);
// snapshot: one per day
a.snapshot(deck, now); a.snapshot(deck, now + 3600_000); assert.equal(a.masteryHistory().length, 1);
console.log('platform model OK');
