import assert from 'node:assert/strict';
import { parseSyllabus, buildCourse, encodePack, parsePack, importPack, examPlan } from '../src/lib/platform/course.ts';
import { Deck } from '../src/lib/friday/agents/tutor.ts';
import { testKV } from '../src/lib/friday/learn.ts';
const DAY = 86400000, now = new Date('2026-11-04T10:00:00').getTime();
const syl = `Unit 1: Thermodynamics — heat, work, entropy
Unit 2: Kinematics
  - velocity, acceleration
  - projectile motion
3. Waves and Optics
## Electrostatics
Coulomb's law; electric field`;
const u = parseSyllabus(syl); assert.deepEqual(u.map(x => x.title), ['Thermodynamics', 'Kinematics', 'Waves and Optics', 'Electrostatics']); assert.deepEqual(u[0].topics, ['heat', 'work', 'entropy']); assert.ok(u[1].topics.includes('projectile motion')); assert.ok(u[3].topics.includes('Coulomb\'s law'));
assert.deepEqual(parseSyllabus('just some random words'), [{ title: 'just some random words', topics: [] }].filter(x => x.title.split(' ').length <= 8 && /^[A-Z]/.test(x.title))); // lowercase prose is not a unit
const material = `Enthalpy is the heat content of a system at constant pressure. Entropy is a measure of disorder in a system.\n\nVelocity is the rate of change of position of an object with time. Acceleration is a measure of the rate of change of velocity.\n\nCooking dinner takes about an hour.`;
const sims = [{ id: 'carnot', title: 'Carnot heat engine', subject: 'Physics', tags: ['thermodynamics', 'entropy'] }, { id: 'projectile', title: 'Projectile Lab', subject: 'Physics', tags: ['kinematics'] }, { id: 'cell', title: 'Cell division', subject: 'Biology' }];
const p = buildCourse({ title: 'Physics 101', syllabus: syl, material, sims, examAt: now + 42 * DAY, now }); if ('error' in p) throw new Error(p.error);
assert.equal(p.units.length, 4); assert.ok(p.units[0].cards.length >= 1 && p.units[1].cards.length >= 1, 'cards come from the matching material only'); assert.ok(p.units.every(x => x.cards.every(c => !/dinner/.test(c.front + c.back))));
assert.deepEqual(p.units[0].sims.map(s => s.id), ['carnot']); assert.deepEqual(p.units[1].sims.map(s => s.id), ['projectile']); assert.ok(!p.units.some(x => x.sims.some(s => s.id === 'cell')));
assert.equal(p.plan.length, 6); assert.match(p.plan[5].label, /mock exam/); assert.ok(p.plan[0].tasks.some(t => /Predict-and-run/.test(t)) || p.plan[1].tasks.some(t => /Predict-and-run/.test(t)));
assert.ok(p.plan.slice(0, 5).flatMap(w => w.units).length >= 4, 'every unit is scheduled');
assert.match((buildCourse({ title: 'x', syllabus: '   ', sims, now }) as { error: string }).error, /could not find any units/);
// export → import round trip, tamper detection
const txt = encodePack(p); const r = parsePack(txt); assert.ok(r.ok, JSON.stringify(r)); const bad = JSON.parse(txt); bad.units[0].cards.push({ front: 'x', back: 'y', kind: 'qa' }); assert.ok(!parsePack(JSON.stringify(bad)).ok); assert.ok(!parsePack('nope').ok && !parsePack('{"kind":"nm-course"}').ok);
const deck = new Deck(testKV(), 'c'); const got = importPack(deck, (r as { pack: typeof p }).pack, now); assert.ok(got.cards >= 2 && got.exam); assert.equal(importPack(deck, (r as { pack: typeof p }).pack, now).cards, 0, 'importing twice adds nothing'); assert.ok(deck.exams().some(e => e.topic === 'Physics 101')); assert.ok(deck.topics().includes('Thermodynamics') && deck.cards().every(c => c.state === 'new'));
assert.equal(examPlan(p.units, 2).length, 2); assert.equal(examPlan(p.units, 8).filter(w => /revision|mock/i.test(w.label)).length, 2);
console.log('course OK');
