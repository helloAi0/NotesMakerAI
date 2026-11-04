import assert from 'node:assert/strict';
import { Deck, cardsFromText } from '../src/lib/friday/agents/tutor.ts';
import { buildReport, encodeReport, parseReport, classSummary, classCsv } from '../src/lib/friday/agents/report.ts';
import { testKV } from '../src/lib/friday/learn.ts';
const DAY = 86400000, now = new Date('2026-11-04T10:00:00').getTime();
function student(name: string, grade: 1 | 3 | 4, days: number, exam?: [string, number], lag = 0) {
  const d = new Deck(testKV(), name); d.add(cardsFromText('Enthalpy is the heat content of a system at constant pressure. Entropy is a measure of disorder in a system.', 'enthalpy', 'x', now - 20 * DAY));
  for (let k = 0; k < days; k++) for (const c of d.cards()) d.review(c.id, grade, now - lag * DAY - (days - k) * DAY + 3600_000);
  if (exam) d.addExam(exam[0], now + exam[1] * DAY); return buildReport(d, name, now);
}
const a = student('Asha', 4, 6), b = student("Ben", 1, 1, ["enthalpy", 3], 6);
assert.ok(a.activeDays30 >= 5 && b.activeDays30 === 1);
for (const r of [a, b]) { const p = parseReport(encodeReport(r)); assert.ok(p.ok, JSON.stringify(p)); }
const bad = JSON.parse(encodeReport(a)); bad.topics[0].mastery = 1; assert.ok(!parseReport(JSON.stringify(bad)).ok, 'edited report rejected');
assert.ok(!parseReport('nope').ok && !parseReport('{"a":1}').ok);
const s = classSummary([a, b, { ...a, issued: a.issued - DAY, student: 'asha' }], now);
assert.equal(s.students, 2, 'latest per student, case-insensitive');
assert.ok(s.atRisk[0]?.student === 'Ben' && /exam in 3 days/.test(s.atRisk[0].why), JSON.stringify(s.atRisk));
assert.ok(s.topics[0].topic === 'enthalpy' && s.topics[0].weak.includes('Ben'));
assert.ok(classCsv(s).split('\n').length === 3);
console.log('report OK');
