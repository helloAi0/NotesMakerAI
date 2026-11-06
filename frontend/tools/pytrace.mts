import assert from 'node:assert/strict';
import { trace, EXAMPLES, cppToPythonPrompt } from '../src/lib/study/pytrace.ts';
const last = (t: ReturnType<typeof trace>) => t.steps[t.steps.length - 1];
const val = (t: ReturnType<typeof trace>, name: string) => last(t).frames[0].vars.find(v => v.name === name)?.v;
// basics
let t = trace('x = 2\ny = x * 3 + 1\nprint(y)\nz = [1, 2, 3]\nz.append(y)\nd = {"a": 1}\nd["b"] = 2\ns = "hi" + "!"\nq = 7 // 2 + 7 % 4 + 2 ** 3\n');
assert.equal(t.error, undefined); assert.equal(t.output, '7\n'); assert.deepEqual(val(t, 'y'), { prim: '7' }); assert.deepEqual(val(t, 'q'), { prim: '14' });
const zRef = val(t, 'z') as { ref: number }; assert.equal(last(t).heap.find(h => h.id === zRef.ref)!.items.length, 4); assert.deepEqual(val(t, 's'), { prim: "'hi!'" });
// control flow + functions + recursion
t = trace('def fib(n):\n    if n < 2:\n        return n\n    return fib(n - 1) + fib(n - 2)\nr = fib(10)\ntotal = 0\nfor i in range(5):\n    if i == 3:\n        continue\n    total += i\nk = 0\nwhile True:\n    k += 1\n    if k > 4:\n        break\n');
assert.equal(t.error, undefined, JSON.stringify(t.error)); assert.deepEqual(val(t, 'r'), { prim: '55' }); assert.deepEqual(val(t, 'total'), { prim: '7' }); assert.deepEqual(val(t, 'k'), { prim: '5' });
assert.ok(t.steps.some(s => s.frames.length > 3), 'recursion shows stacked frames');
// each example runs and checks result
for (const ex of EXAMPLES) { const r = trace(ex.code); assert.equal(r.error, undefined, ex.name + ': ' + JSON.stringify(r.error)); assert.ok(r.steps.length > 5, ex.name); }
const ll = trace(EXAMPLES[0].code); assert.equal(ll.output, '3\n', 'reversed list head is 3'); const hd = last(ll).frames[0].vars.find(v => v.name === 'head')!.v as { ref: number };
const node = last(ll).heap.find(h => h.id === hd.ref)!; assert.equal(node.label, 'Node'); assert.deepEqual(node.items.find(i => i.k === 'val')!.v, { prim: '3' }); assert.ok('ref' in node.items.find(i => i.k === 'next')!.v, 'pointer to the next node');
assert.ok(ll.steps.some(s => s.changed.some(c => /\[next\]/.test(c))), 'pointer changes are highlighted');
const da = trace(EXAMPLES[1].code); assert.equal(da.output, '5 8\n'); const bs = trace(EXAMPLES[3].code); assert.equal(bs.output, '[1, 2, 5, 9]\n'); const bt = trace(EXAMPLES[2].code); assert.equal(bt.output, '5\n');
// errors are readable and carry the line
for (const [code, re, line] of [['a = [1]\nb = a[5]', /index out of range/, 2], ['x = y + 1', /name 'y' is not defined/, 1], ['n = None\nn.next', /None pointer/, 2], ['1 / 0', /division by zero/, 1], ['def f(:\n  pass', /expected|unexpected/, 2], ['x = [i for i in y]', /comprehension/, 1], ['def f():\n    return f()\nf()', /recursion/i, 2]] as const) {
  const r = trace(code); assert.ok(r.error, code); assert.match(r.error!.message, re); assert.equal(r.error!.line, line, code); }
// limits
const inf = trace('while True:\n    x = 1\n'); assert.equal(inf.truncated, true); assert.ok(inf.steps.length <= 1500);
const busy = trace('x = 0\nwhile True:\n    x = x + 1\n', { maxSteps: 50 }); assert.equal(busy.steps.length, 50);
assert.equal(trace('# just a comment\n\n').steps.length, 2);
// safety: no access to host objects
for (const bad of ['import os\nos.system("ls")', '__import__("os")', 'eval("1")', 'open("/etc/passwd")', 'x = [].__class__']) { const r = trace(bad); assert.ok(r.error, bad + ' must fail'); }
assert.match(cppToPythonPrompt('int main(){}'), /Return ONLY the Python code/);
console.log('pytrace OK');
