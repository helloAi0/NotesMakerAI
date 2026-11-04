import assert from 'node:assert/strict';
import { checkSolution, solutions, clean } from '../src/lib/platform/stepcheck.ts';
// correct solution
let c = checkSolution('2x + 3 = 11\n2x = 8\nx = 4'); assert.equal(c.firstError, null, c.summary); assert.equal(c.checked, 3);
// error introduced on line 3 (8/2 = 5)
c = checkSolution('1) 2x + 3 = 11\n2) 2x = 8\n3) x = 5'); assert.equal(c.firstError, 3); assert.match(c.steps[2].note!, /Line 2 has x = 4, but this line has x = 5/);
// sign error moving a term
c = checkSolution('3x - 5 = 10\n3x = 5\nx = 5/3'); assert.equal(c.firstError, 2, c.summary);
// arithmetic chain
c = checkSolution('12 × 7 = 84\n84 + 16 = 101'); assert.equal(c.firstError, 2); assert.match(c.steps[1].note!, /works out to 100/);
// implicit multiplication and brackets
c = checkSolution('3(x + 2) = 15\n3x + 6 = 15\n3x = 9\nx = 3'); assert.equal(c.firstError, null, JSON.stringify(c.steps.map(s => [s.text, s.status, s.note])));
c = checkSolution('3(x + 2) = 15\n3x + 2 = 15'); assert.equal(c.firstError, 2);
// quadratic: x^2 - 5x + 6 = 0 → (x-2)(x-3)=0 → x = 2 or equivalently solved lines
c = checkSolution('x^2 - 5x + 6 = 0\n(x - 2)(x - 3) = 0'); assert.equal(c.firstError, null, c.summary); c = checkSolution('x^2 - 5x + 6 = 0\n(x - 2)(x + 3) = 0'); assert.equal(c.firstError, 2);
// OCR-style noise: unicode minus, ×, ÷, thousands comma, prose lines are left alone
assert.equal(clean('So, 12 × 7 = 1,008'), '12 * 7 = 1008'); c = checkSolution('Solve for x\n2x − 4 = 10\n2x = 14\nx = 7\nTherefore the answer is 7'); assert.equal(c.firstError, null); assert.equal(c.checked, 3);
// nothing checkable → honest message, no false claims
c = checkSolution('hello world\nthis is text'); assert.equal(c.checked, 0); assert.match(c.summary, /could not find/);
// identity / no solution
assert.equal(solutions('2x + 2', '2x + 2', 'x'), 'all'); assert.equal(solutions('2x + 2', '2x + 3', 'x'), 'none'); assert.deepEqual(solutions('x^2', '4', 'x'), [-2, 2]);
console.log('stepcheck OK');
