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
for (const [code, re, line] of [['a = [1]\nb = a[5]', /index out of range/, 2], ['x = y + 1', /name 'y' is not defined/, 1], ['n = None\nn.next', /None pointer/, 2], ['1 / 0', /division by zero/, 1], ['def f(:\n  pass', /expected|unexpected|bad parameter/, 1], ['x = [i for i in y]', /name 'y' is not defined/, 1], ['def f():\n    return f()\nf()', /recursion/i, 2]] as const) {
  const r = trace(code); assert.ok(r.error, code); assert.match(r.error!.message, re); assert.equal(r.error!.line, line, code); }
// limits
const inf = trace('while True:\n    x = 1\n'); assert.equal(inf.truncated, true); assert.ok(inf.steps.length <= 1500);
const busy = trace('x = 0\nwhile True:\n    x = x + 1\n', { maxSteps: 50 }); assert.equal(busy.steps.length, 50);
assert.equal(trace('# just a comment\n\n').steps.length, 2);
// safety: no access to host objects
for (const bad of ['import os\nos.system("ls")', '__import__("os")', 'eval("1")', 'open("/etc/passwd")', 'x = [].__class__']) { const r = trace(bad); assert.ok(r.error, bad + ' must fail'); }
assert.match(cppToPythonPrompt('int main(){}'), /Return ONLY the Python code/);
// ---- audit additions: f-strings, comprehensions, kwargs, global, in-place list +=, big lists, error step
const val2 = (t: ReturnType<typeof trace>, n: string) => (last(t).frames[0].vars.find(v => v.name === n)?.v as { prim: string }).prim;
t = trace('x = 3\nname = "Ravi"\ns = f"{name} has {x * 2} marks, pi={3.14159:.2f} {x:>4}|{{ok}}"\nsq = [i * i for i in range(5) if i % 2 == 0]\ntot = sum(i for i in range(4))\npairs = [(a, b) for a in range(2) for b in range(2)]\nprint("a", "b", sep="-", end="!")\nsrt = sorted([3, 1, 2], reverse=True)\nw = sorted(["bb", "a", "ccc"], key=lambda z: len(z))\nm = max([1, 5, 3], key=lambda z: -z)\n');
assert.equal(t.error, undefined, JSON.stringify(t.error)); assert.equal(val2(t, 's'), "'Ravi has 6 marks, pi=3.14    3|{ok}'"); assert.equal(t.output, 'a-b!'); assert.equal(val2(t, 'tot'), '6'); assert.equal(val2(t, 'm'), '1');
const ref = (n: string) => (last(t).frames[0].vars.find(v => v.name === n)!.v as { ref: number }).ref; const items = (n: string) => last(t).heap.find(h => h.id === ref(n))!.items.map(i => (i.v as { prim: string }).prim).join(',');
assert.equal(items('sq'), '0,4,16'); assert.equal(items('srt'), '3,2,1'); assert.equal(items('w'), "'a','bb','ccc'"); assert.equal(last(t).heap.find(h => h.id === ref('pairs'))!.items.length, 4);
t = trace('count = 0\ndef bump():\n    global count\n    count += 1\nbump()\nbump()\n'); assert.equal(val2(t, 'count'), '2', 'global is honoured');
t = trace('def f(a, b=2, *, c=3):\n    return a + b + c\nr = f(1, c=10)\n'); assert.ok(t.error, 'keyword-only marker is not supported and says so'); t = trace('def f(a, b=2, c=3):\n    return a + b + c\nr = f(1, c=10)\nq = f(b=5, a=1)\n'); assert.equal(t.error, undefined); assert.equal(val2(t, 'r'), '13'); assert.equal(val2(t, 'q'), '9'); assert.match(trace('def f(a):\n    return a\nf(1, z=2)').error!.message, /unexpected keyword/);
t = trace('a = [1]\nb = a\nb += [2]\nc = a + [3]\n'); assert.equal(items('a'), '1,2', 'list += mutates in place (aliasing)');; assert.equal(items('c'), '1,2,3');
t = trace('big = list(range(5000))\nbig.append(1)\n'); assert.ok(last(t).heap.find(h => h.id === ref('big'))!.items.length <= 41, 'large lists are capped in each step'); assert.match(JSON.stringify(last(t).heap), /\+\d+ more/);
t = trace('x = 1\ny = x / 0\n'); assert.equal(last(t).note.startsWith('Error:'), true); assert.equal(last(t).line, 2, 'the final step points at the failing line');
t = trace('d = {"a": 1}\nfor k, v in d.items():\n    d[k] = v + 1\ns = "x"\ns += "y"\nt2 = (1, 2)\nu, w = t2\n'); assert.equal(t.error, undefined, JSON.stringify(t.error)); assert.equal(val2(t, 's'), "'xy'");
t = trace('class A:\n    def __init__(self, n):\n        self.n = n\n    def inc(self, by=1):\n        self.n += by\n        return self\na = A(1).inc().inc(by=5)\n'); assert.equal(t.error, undefined, JSON.stringify(t.error)); const ao = last(t).heap.find(h => h.id === ref('a'))!; assert.equal((ao.items[0].v as { prim: string }).prim, '7', 'method chaining + kwargs');
assert.ok(trace('x = f"{1 +}"').error, 'bad f-string expression is an error, not a crash'); assert.ok(trace('x = f"{abc"').error); assert.ok(trace('print(f"{3:q}")').error);
assert.ok(trace('x = (1,\n  2').error, 'unclosed bracket'); assert.ok(trace('if True:\nx = 1').error, 'missing indent'); assert.ok(trace('x = "abc').error); assert.ok(trace('def f():\n  return 1\n    y = 2').error);
assert.equal(trace('').steps.length, 2); assert.equal(trace('\n\n   \n').error, undefined);

import { describeError } from '../src/lib/study/pytrace';
{ const o = (c: string) => { const t = trace(c); assert.equal(t.error, undefined, c + ' -> ' + JSON.stringify(t.error)); return t.output; };
assert.equal(o('print(5.0, 10/2, 1e-5)'), '5.0 5.0 1e-05\n'); assert.equal(o('print(2**100)'), '1267650600228229401496703205376\n'); assert.equal(o('print(9007199254740993+1)'), '9007199254740994\n');
assert.equal(o('import math\nprint(math.factorial(25))'), '15511210043330985984000000\n'); assert.equal(o('s={1,2}\ns.add(2)\nprint(s|{5})'), '{1, 2, 5}\n');
assert.equal(o('try:\n  1/0\nexcept ZeroDivisionError as e:\n  print("c",e)\nfinally:\n  print("f")'), 'c division by zero\nf\n');
assert.equal(o('class A(Exception): pass\ntry:\n  raise A("hi")\nexcept Exception as e:\n  print(e)'), 'hi\n');
assert.equal(o('import heapq\nh=[]\nheapq.heappush(h,3)\nheapq.heappush(h,1)\nprint(heapq.heappop(h))'), '1\n');
assert.equal(o('a=[1,2,3,4,5]\nprint(a[::2], {x%2 for x in range(5)})'), '[1, 3, 5] {0, 1}\n');
const e = trace('a=[1]\nprint(a[5])'); assert.equal(describeError(e.error!), 'IndexError: list index out of range'); assert.ok(trace('with open("x") as f:\n  pass').error, 'with unsupported, clear error'); }
console.log('pytrace OK');
