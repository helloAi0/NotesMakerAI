import assert from 'node:assert/strict';
import { matchWake } from '../src/lib/wakeWord.ts';
assert.equal(matchWake('hey friday'), ''); assert.equal(matchWake('Hey Friday, what is entropy'), 'what is entropy'); assert.equal(matchWake('ok friday open the kalman filter'), 'open the kalman filter');
assert.equal(matchWake('hi friday!'), ''); assert.equal(matchWake('see you on friday'), null); assert.equal(matchWake('friday is the last day'), null); assert.equal(matchWake('what is hey'), null);
console.log('wake word matcher OK');
