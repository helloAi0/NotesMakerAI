import assert from 'node:assert/strict';
import { maskTerms, unmask, missingTokens, chunkText, flip, flipPrompt, ui, UI_STR } from '../src/lib/study/bhasha.ts';
import { LANGS } from '../src/lib/platform/langs.ts';
import { BOARDS, notesPrompt, parsePyq, pyqPatterns, board } from '../src/lib/study/examboards.ts';

// ---- masking
const src = 'The entropy of an isolated system never decreases. For an ideal gas PV = nRT where T is in K. A force of 9.8 N acts on the Second Law system. The DNA is stored. Use malloc(n) and $E=mc^2$.';
const m = maskTerms(src); assert.ok(!/entropy|DNA|malloc|9\.8 N|PV = nRT|Second Law/.test(m.text), 'terms masked: ' + m.text); assert.equal(unmask(m.text, m.terms), src, 'round trip is exact');
assert.deepEqual(missingTokens('a ⟦0⟧ b ⟦1⟧', 'x ⟦1⟧'), [0]); assert.equal(missingTokens('⟦0⟧', '⟦ 0 ⟧').length, 0, 'spaces inside tokens tolerated');
assert.equal(unmask('⟦ 1 ⟧ and ⟦9⟧', ['a', 'b']), 'b and ⟦9⟧');
assert.ok(chunkText('para one.\n\n' + 'x. '.repeat(900), 600).every(c => c.length <= 700));

// ---- flip with a fake model that "translates" but may corrupt tokens
const hi = (s: string) => s.replace(/The/g, 'यह').replace(/of/g, 'का');
let calls = 0;
const good = async (p: string) => { calls++; return 'हिन्दी: ' + hi(p.split('PASSAGE:\n')[1]); };
const r = await flip('The entropy of a system increases.\n\nThe enthalpy of reaction is measured in J.', 'hi', good);
assert.match(r.text, /entropy/); assert.match(r.text, /enthalpy/); assert.match(r.text, /हिन्दी/); assert.ok(!r.text.includes('⟦'), 'no tokens leak'); assert.equal(r.failed, 0);
// model drops a token the first time: repaired by retry
let first = true; const flaky = async (p: string) => { const t = p.split('PASSAGE:\n')[1]; if (first) { first = false; return 'हिन्दी ' + t.replace(/⟦\d+⟧/g, ''); } return 'हिन्दी ' + t; };
const r2 = await flip('The entropy rises.', 'hi', flaky); assert.equal(r2.repaired, 1); assert.match(r2.text, /entropy/);
// model keeps dropping: terms are appended, never lost
const bad = async (p: string) => 'हिन्दी पाठ ' + p.split('PASSAGE:\n')[1].replace(/⟦\d+⟧/g, ''); const r3 = await flip('The entropy rises.', 'hi', bad); assert.match(r3.text, /\(entropy\)/);
// model dies: the English original is kept
const dead = async () => { throw new Error('503'); }; const r4 = await flip('The entropy rises.', 'ta', dead); assert.equal(r4.failed, 1); assert.match(r4.text, /entropy rises/);
assert.throws(() => flipPrompt('xx', 'a', 'notes')); for (const l of ['hi', 'mr', 'bn', 'ta', 'te']) assert.ok(flipPrompt(l, 'x', 'notes').includes(LANGS.find(x => x.code === l)!.native));
for (const c of ['hi', 'mr', 'bn', 'ta', 'te']) { const l = LANGS.find(x => x.code === c)!; assert.ok(Object.keys(UI_STR.en).every(k => (UI_STR[c] as Record<string, string>)[k] && l.script.test((UI_STR[c] as Record<string, string>)[k]) || k === 'x'), 'UI strings in ' + c); }
assert.equal(ui('zz', 'make'), 'Make notes');

// ---- boards
assert.equal(BOARDS.length, 6); assert.match(notesPrompt('cbse', 'F = ma'), /Given data[\s\S]*Final answer/); assert.match(notesPrompt('jee-adv', 'x'), /do NOT explain basics/); assert.match(notesPrompt('upsc', 'x'), /way forward/); assert.match(notesPrompt('neet', 'x'), /NCERT/); assert.match(notesPrompt('gate', 'x'), /NAT/);
assert.match(notesPrompt('cbse', 'x'), /Do NOT claim any question appeared in a past paper/); assert.equal(board('nope').id, 'cbse');
const pyq = `2019\n1. Calculate the entropy change when 2 kg of ice melts at 0 C. [3 marks]\n2. Derive the efficiency of a Carnot engine.\n2020\n1. Calculate the entropy change of an ideal gas during isothermal expansion.\n2. Explain the second law of thermodynamics with examples.\n2021\nQ1. Find the efficiency of a Carnot engine working between 400 K and 300 K.\nQ2. Which of the following statements about entropy is correct?\n2022\n1. Derive the Carnot efficiency for a heat engine\n2. Calculate entropy change in free expansion of an ideal gas`;
const qs = parsePyq(pyq); assert.equal(qs.length, 8); assert.equal(qs[0].year, 2019); assert.equal(qs[0].marks, 3); assert.equal(qs[7].year, 2022);
const pt = pyqPatterns(qs); assert.ok(pt.topics.some(t => /entropy/.test(t.term)) && pt.topics.some(t => /carnot/.test(t.term)), JSON.stringify(pt.topics)); assert.deepEqual(pt.years, [2019, 2020, 2021, 2022]);
assert.equal(pt.types[0].type, 'numerical'); assert.match(pt.verdict, /weak hints/); assert.match(pyqPatterns([]).verdict, /weak hints/);
console.log('bhasha + boards OK');
