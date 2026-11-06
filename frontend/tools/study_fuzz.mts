// Deterministic fuzzing of every parser that takes untrusted text (student input or model output). Nothing may throw; round trips must be exact.
import assert from 'node:assert/strict';
import { trace, EXAMPLES } from '../src/lib/study/pytrace.ts';
import { maskTerms, unmask } from '../src/lib/study/bhasha.ts';
import { parseInterrupt, findTarget, cleanForSpeech } from '../src/lib/study/interrupt.ts';
import { parseScan, layoutGraph, toMarkdown } from '../src/lib/study/mathocr.ts';
import { parsePyq, pyqPatterns } from '../src/lib/study/examboards.ts';
// @ts-expect-error plain JS module
import { parseMessage, parseDue } from '../../server-api/bot.mjs';
let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const mutate = (s: string, frags: string[]) => { const k = 1 + Math.floor(rnd() * 4); for (let j = 0; j < k; j++) { const pos = Math.floor(rnd() * (s.length + 1)); const op = rnd(); if (op < 0.5) s = s.slice(0, pos) + pick(frags) + s.slice(pos); else if (op < 0.8) s = s.slice(0, pos) + s.slice(pos + 1 + Math.floor(rnd() * 3)); else s = s.slice(0, pos) + s.slice(Math.floor(rnd() * s.length)); } return s; };
// python tracer
const progs = [...EXAMPLES.map(e => e.code), 'a = [1,2,3]\nfor i in range(3):\n    a[i] += 1\nprint(f"{a}")\n', 'd = {}\nd["x"] = [1]\nd["x"].append(2)\nprint(len(d))\n'];
const pf = ['', '(', ')', '[', ']', '{', '}', ':', '=', '==', '.', ',', 'None', '"', "'", '\n', '    ', 'x', '1', 'def ', 'class ', 'for ', 'in ', 'if ', 'else', 'return', 'lambda', '**', '//', '%', '-', 'f"', '{', '}}', '[i for i in', 'global ', 'print(', 'self.', '0'];
for (let n = 0; n < 3000; n++) { const t0 = performance.now(); const r = trace(mutate(pick(progs), pf)); assert.ok(Array.isArray(r.steps)); assert.ok(performance.now() - t0 < 2000, 'a run must finish quickly'); }
// masking round trip on messy text
const tf = ['⟦', '⟧', '$', '=', 'F = ma', 'DNA', '9.8 m/s', 'f(x)', '\n\n', '  ', 'Second Law', 'entropy', '😀', '\\frac{1}{2}', '()', '$$']; for (let n = 0; n < 3000; n++) { const s = mutate('The entropy of DNA obeys F = ma and $x^2$ at 9.8 m/s^2 for f(x) = 3.\n\nNewton Second Law holds.', tf); const m = maskTerms(s); assert.equal(unmask(m.text, m.terms), s.replace(/⟦\s*\d+\s*⟧/g, x => x), 'mask round trip'); }
// interruption + OCR + PYQ + bot parsing
const wf = ['wait', 'explain', 'again', 'easier', 'example', 'stop', 'the', 'enthalpy', 'रुको', 'dobara', '', ' ', '?', '!!', 'अ', '\n', 'slower', 'next', 'go back']; const S = ['Enthalpy is heat.', 'Entropy is disorder.', 'ऊष्मा क्या है।'];
for (let n = 0; n < 3000; n++) { const s = mutate('wait explain that enthalpy part again', wf); const p = parseInterrupt(s); assert.ok(typeof p.intent === 'string'); const t = findTarget(S, p.focus, n % 3); assert.ok(t.index >= 0 && t.index < 3); cleanForSpeech(s); }
const jf = ['{', '}', '[', ']', '"', ',', ':', 'null', '1', '"latex"', '"nodes"', '"edges"', '"id"', '\\\\', '$', 'true', '{"id":1}', '"from":1']; const sc0 = '{"kind":"mixed","equations":[{"latex":"x^2"}],"nodes":[{"id":"1","label":"A"},{"id":"2","label":"B"}],"edges":[{"from":"1","to":"2"}]}';
for (let n = 0; n < 3000; n++) { const sc = parseScan(mutate(sc0, jf)); layoutGraph(sc.nodes, sc.edges); toMarkdown(sc); }
const qf = ['\n', '2019', '1.', 'Q2.', '[3 marks]', 'Calculate', 'entropy', ' ', '###', '- ', '(5 marks)']; for (let n = 0; n < 2000; n++) pyqPatterns(parsePyq(mutate('2019\n1. Calculate the entropy change of a gas. [3 marks]\n2. Derive the Carnot efficiency.\n', qf)));
const bf = ['remind me to ', 'tomorrow', 'friday', 'https://youtu.be/dQw4w9WgXcQ', 'in 3 days', '12 nov', '\n', ' ', 'today', 'note', '😀', 'on ', 'next ', '99 feb']; for (let n = 0; n < 3000; n++) { const r = parseMessage(mutate('remind me to revise ROS 2 commands tomorrow', bf), new Date(2026, 10, 5)); assert.ok(Array.isArray(r.items) && typeof r.reply === 'string'); for (const it of r.items) if (it.due) assert.match(it.due, /^\d{4}-\d{2}-\d{2}$/); parseDue(mutate('submit on friday', bf), new Date(2026, 11, 31)); }
console.log('study fuzz OK');
