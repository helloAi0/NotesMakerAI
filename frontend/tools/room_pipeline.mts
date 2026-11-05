import assert from 'node:assert/strict';
import { Room } from '../src/lib/platform/room.ts';
import type { Transport } from '../src/lib/platform/room.ts';
import { lectureToEverything } from '../src/lib/platform/pipeline.ts';
import { buildNotes, SAMPLE_TRANSCRIPT } from '../src/lib/lecture.ts';
// in-memory transport pair (a "network")
function hub(n: number): Transport[] { const fns: ((m: string) => void)[] = []; return Array.from({ length: n }, (_, i) => ({ send: m => { fns.forEach((f, j) => { if (j !== i) queueMicrotask(() => f(m)); }); }, onMessage: f => { fns[i] = f; }, close: () => {} })); }
const tick = () => new Promise(r => setTimeout(r, 5));
const [ta, tb, tc] = hub(3); const a = new Room('Asha'), b = new Room('Ben'), c = new Room('Chitra'); a.attach(ta); b.attach(tb); c.attach(tc); await tick();
assert.equal(a.peers.size, 2); assert.equal(b.peers.size, 2); assert.deepEqual([...a.peers.values()].sort(), ['Ben', 'Chitra']);
a.shareDeck('Entropy', [{ front: 'What is entropy?', back: 'disorder' }, { front: 'x', back: 'y' }]); await tick(); assert.equal(b.inbox[0].cards.length, 2); assert.equal(b.inbox[0].from, 'Asha'); assert.equal(a.inbox.length, 0, 'sender does not receive its own deck');
a.startChallenge('Entropy', [{ q: 'What is entropy?', options: ['order', 'disorder'], answer: 1 }, { q: 'bad', options: ['only one'], answer: 0 }]); await tick(); assert.equal(b.challenge!.questions.length, 1, 'receiver drops malformed questions');
b.submit(1, 2, 9000); c.submit(2, 2, 12000); a.submit(2, 2, 8000); await tick();
assert.deepEqual(a.leaderboard().map(x => x.name), ['Asha', 'Chitra', 'Ben']); assert.equal(c.leaderboard().length, 3);
// hostile messages are ignored
const evil = new Room('Evil'); const [t1, t2] = hub(2); a.attach(t1); evil.attach(t2); await tick(); const before = a.leaderboard().length;
t2.send(JSON.stringify({ t: 'result', from: 'zzz', name: 'Hacker', id: a.challenge!.id, score: 999, n: 2, ms: 1 })); t2.send('not json'); t2.send(JSON.stringify({ t: 'deck', from: 'zzz', topic: 'x', cards: new Array(1000).fill({ front: 'a', back: 'b' }) })); t2.send(JSON.stringify({ t: 'result', from: 'zzz', name: 'Hacker', id: 'wrong', score: 1, n: 2, ms: 1 })); await tick();
assert.equal(a.leaderboard().length, before, 'impossible scores and wrong challenge ids rejected'); assert.equal(a.inbox.length, 0, 'oversized deck rejected');
// lecture → everything
const notes = buildNotes(SAMPLE_TRANSCRIPT, '', 'Thermodynamics lecture'); const sims = [{ id: 'carnot', title: 'Carnot heat engine', subject: 'Physics', tags: ['thermodynamics', 'entropy', 'enthalpy'] }, { id: 'cell', title: 'Cell division' }];
const ev = lectureToEverything(notes, sims, new Date('2026-11-04T10:00:00').getTime()); assert.ok(ev.cards.length >= 5, `cards ${ev.cards.length}`); assert.equal(new Set(ev.cards.map(c => c.front)).size, ev.cards.length, 'no duplicate cards'); assert.ok(ev.cards.every(c => c.topic === 'Thermodynamics lecture'));
assert.ok(ev.sims.some(s => s.id === 'carnot') && !ev.sims.some(s => s.id === 'cell')); assert.deepEqual(ev.plan.map(p => p.dayOffset).slice(0, 3), [0, 1, 3]); assert.equal(ev.plan[0].due, '2026-11-04'); assert.ok(ev.plan.some(p => /Predict-and-run/.test(p.title)));
console.log('room + pipeline OK');
