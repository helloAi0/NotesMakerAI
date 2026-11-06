import assert from 'node:assert/strict';
import { parseInterrupt, findTarget, Narrator, rewritePrompt, toSpoken } from '../src/lib/study/interrupt.ts';
import { parseScan, layoutGraph, checkLatex, cleanLatex, toMarkdown, toLatexDocument } from '../src/lib/study/mathocr.ts';
import { decide, swipe, queue, summary, tomorrowMorning } from '../src/lib/study/swipe.ts';
import { testDeck, cardsFromText, DAY } from '../src/lib/friday/agents/tutor.ts';

// ---- interruption parsing
let p = parseInterrupt('Wait, explain that enthalpy part again with an easier example');
assert.equal(p.wait, true); assert.equal(p.intent, 'simpler'); assert.ok(p.flags.example && p.flags.simpler); assert.match(p.focus, /enthalpy/);
assert.equal(parseInterrupt('stop').intent, 'stop'); assert.equal(parseInterrupt('wait').intent, 'pause'); assert.equal(parseInterrupt('okay continue').intent, 'resume'); assert.equal(parseInterrupt('next').intent, 'next'); assert.equal(parseInterrupt('go back').intent, 'back');
assert.equal(parseInterrupt('speak slower please').intent, 'slower'); assert.equal(parseInterrupt('too slow').intent, 'faster'); assert.equal(parseInterrupt('the weather is nice').intent, 'none'); assert.equal(parseInterrupt('').intent, 'none');
assert.equal(parseInterrupt('stop, explain entropy again').intent, 'explain', 'stop + question is a question'); assert.equal(parseInterrupt('give me an analogy for entropy').intent, 'example'); assert.ok(parseInterrupt('explain in detail the second law').flags.deeper);
assert.equal(parseInterrupt('I do not understand the carnot cycle').intent, 'explain'); assert.match(parseInterrupt('I do not understand the carnot cycle').focus, /carnot cycle/);
// ---- target finding
const S = ['Thermodynamics studies heat and work.', 'Enthalpy is the heat content of a system at constant pressure.', 'Entropy measures disorder.', 'The second law says entropy increases.'];
assert.deepEqual(findTarget(S, 'enthalpy', 3), { index: 1, confident: true }); assert.equal(findTarget(S, 'entropy', 1).index, 2); assert.deepEqual(findTarget(S, '', 2), { index: 2, confident: false }); assert.equal(findTarget(S, 'photosynthesis', 2).confident, false);
assert.match(rewritePrompt(S, 1, p), /simpler words[\s\S]*concrete everyday example[\s\S]*>>> Enthalpy is[\s\S]*<<</); assert.equal(toSpoken('**Hi** `x`\n\n# there'), 'Hi x there');
// ---- narrator end-to-end with fake speaker + fake model
const spoken: string[] = []; let stops = 0, rate = 1;
const hooks = { speak: (t: string) => { spoken.push(t); }, stopSpeaking: () => { stops++; }, setRate: (r: number) => { rate = r; } };
const gen = async (pr: string) => { assert.match(pr, /Enthalpy is the heat content/); return 'Enthalpy is like the total energy in a cup of hot tea. When the tea cools it gives that heat out.'; };
const n = new Narrator(S, hooks, gen); n.start(); assert.equal(spoken[0], S[0]); n.ended(); assert.equal(spoken[1], S[1]);
const r = await n.interrupt('Wait, explain that enthalpy part again with an easier example'); assert.equal(r.ok, true); assert.equal(stops, 1); assert.equal(n.sentences.length, 5); assert.match(n.sentences[1], /cup of hot tea/); assert.equal(spoken.at(-1), n.sentences[1]); assert.equal(n.state, 'speaking'); assert.equal(n.rewrites, 1);
n.ended(); assert.match(spoken.at(-1)!, /gives that heat out/);
assert.equal((await n.interrupt('speak slower')).ok, true); assert.equal(rate, 0.8); assert.equal((await n.interrupt('blah blah')).ok, false); assert.equal(n.state, 'speaking');
await n.interrupt('wait'); assert.equal(n.state, 'paused'); await n.interrupt('continue'); assert.equal(n.state, 'speaking');
const down = new Narrator(S, hooks, async () => { throw new Error('503'); }); down.start(1); const rd = await down.interrupt('explain enthalpy again'); assert.equal(rd.ok, false); assert.equal(down.state, 'paused'); assert.deepEqual(down.sentences, S, 'notes unchanged when the AI fails'); assert.match(rd.message, /unchanged/);
const vague = new Narrator(S, hooks, async () => 'Think of heat as money you can spend.'); vague.start(3); const rv = await vague.interrupt('explain photosynthesis again'); assert.match(rv.message, /not sure which part/);
const last = new Narrator(['One.'], hooks, gen); last.start(); last.ended(); assert.equal(last.state, 'idle');

// ---- math OCR parsing
const raw = '```json\n{"kind":"mixed","equations":[{"latex":"$$x^2 + 5x + 6 = 0$$"},{"latex":"\\\\frac{a}{b","unsure":true},"E = mc^2"],"nodes":[{"id":"1","label":"Start","shape":"start"},{"id":"2","label":"x > 0 ?","shape":"decision"},{"id":"3","label":"Print x"}],"edges":[{"from":"1","to":"2"},{"from":"2","to":"3","label":"yes"},{"from":"2","to":"9"}],"text":"my rough notes"}\n```';
const s = parseScan(raw); assert.equal(s.equations.length, 3); assert.equal(s.equations[0].latex, 'x^2 + 5x + 6 = 0'); assert.equal(s.equations[0].valid, true); assert.equal(s.equations[1].valid, false); assert.ok(s.equations[1].error); assert.equal(s.equations[2].valid, true);
assert.equal(s.edges.length, 2, 'edge to unknown node dropped'); assert.ok(s.warnings.some(w => /dropped/.test(w)) && s.warnings.some(w => /not valid LaTeX/.test(w)) && s.warnings.some(w => /hard to read/.test(w)));
assert.equal(parseScan('sorry I cannot').kind, 'unknown'); assert.ok(parseScan('nope').warnings.length >= 2); assert.equal(checkLatex('\\frac{1}{2}').valid, true); assert.equal(cleanLatex('\\[ y=mx \\]'), 'y=mx');
assert.match(toMarkdown(s), /\$\$x\^2 \+ 5x \+ 6 = 0\$\$[\s\S]*flowchart TD[\s\S]*1 -->\s?2|-->\|yes\| 3/); assert.ok(!toLatexDocument(s).includes('frac{a}{b'));
const L = layoutGraph(s.nodes, s.edges); assert.equal(L.nodes.length, 3); const ys = L.nodes.map(x => x.y); assert.ok(ys[0] < ys[1] && ys[1] < ys[2], 'top to bottom'); assert.ok(L.nodes.every(x => x.x >= 0 && x.x + x.w <= L.width));
const cyc = layoutGraph([{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }], [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }]); assert.equal(cyc.nodes.length, 2, 'cycles do not hang');

// ---- swipe
assert.equal(decide(120, 10), 'right'); assert.equal(decide(-120, 10), 'left'); assert.equal(decide(30, 0), null); assert.equal(decide(10, -160), 'up'); assert.equal(decide(-10, 160), null);
const d = testDeck(); const t0 = new Date('2026-11-05T10:00:00').getTime(); d.add(['Entropy','Enthalpy','Catalyst','Osmosis'].map((w, i) => ({ id: 'c' + i, topic: 'Chem', front: 'What is ' + w + '?', back: w + ' answer', kind: 'qa' as const, created: t0, due: t0, S: 0, D: 0, reps: 0, lapses: 0, state: 'new' as const })));
const q = queue(d, 'Chem', t0 + 1); assert.ok(q.length >= 2); const a = q[0], b = q[1];
const la = swipe(d, a.id, 'left', t0 + 5000)!; assert.equal(la.due, tomorrowMorning(t0 + 5000)); assert.equal(new Date(la.due).getHours(), 8); assert.ok(la.due - (t0 + 5000) > 15 * 3600000 - 1 && la.due - t0 < 2 * DAY);
assert.equal(d.cards().find(c => c.id === a.id)!.due, la.due, 'persisted on the deck');
const rb = swipe(d, b.id, 'right', t0 + 6000)!; assert.ok(rb.due > t0 + DAY - 1, 'remembered goes by the normal schedule'); assert.equal(d.mistakes().length, 0);
assert.ok(!queue(d, 'Chem', t0 + 7000).some(c => c.id === a.id || c.id === b.id), 'swiped cards leave today\'s queue'); assert.ok(queue(d, 'Chem', tomorrowMorning(t0 + 5000) + 1).some(c => c.id === a.id), 'forgotten card is back tomorrow');
assert.deepEqual(summary(['left', 'right', 'right', 'up']), { n: 4, remembered: 3, forgot: 1, pct: 75 }); assert.equal(swipe(d, 'nope', 'left'), null);
console.log('voice + ocr + swipe OK');
