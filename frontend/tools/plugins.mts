import assert from 'node:assert/strict';
import { validateManifest, evalFormula, PluginStore, EXAMPLE, toSim } from '../src/lib/platform/plugins.ts';
import { makeChallenge, grade } from '../src/lib/platform/predict.ts';
import { testKV } from '../src/lib/friday/learn.ts';
assert.equal(evalFormula('volts / ohms', { volts: 12, ohms: 4 }), 3); assert.equal(evalFormula('2 * sqrt(x) + pi', { x: 9 })!.toFixed(4), (6 + Math.PI).toFixed(4)); assert.equal(evalFormula('x ^ 2', { x: -3 }), 9);
for (const evil of ['constructor', 'alert(1)', 'window.location', 'fetch("x")', 'x; y', '`${1}`', 'process', '__proto__', 'x ** 99999999999', '1/0']) assert.equal(evalFormula(evil, { x: 2 }), null, evil);
assert.equal(evalFormula('a'.repeat(300), { a: 1 }), null);
assert.ok(validateManifest(EXAMPLE).ok);
const bad = (m: object) => { const r = validateManifest(m); assert.ok(!r.ok); return (r as { why: string }).why; };
assert.match(bad({}), /not a Notes Maker plugin/); assert.match(bad({ ...EXAMPLE, id: 'Bad Id!' }), /id must be/); assert.match(bad({ ...EXAMPLE, provides: {} }), /provides nothing/);
assert.match(bad({ ...EXAMPLE, provides: { simulations: [{ ...EXAMPLE.provides.simulations![0], readouts: [{ label: 'x', expr: 'window.alert(1)' }] }] } }), /cannot evaluate/);
assert.match(bad({ ...EXAMPLE, provides: { simulations: [{ ...EXAMPLE.provides.simulations![0], params: [{ id: 'volts', label: 'V', min: 5, max: 1, step: 1, value: 3 }] }] } }), /needs numeric min < max/);
assert.match(bad({ ...EXAMPLE, provides: { simulations: [{ ...EXAMPLE.provides.simulations![0], subject: 'Cooking' }] } }), /subject must be/);
// html is stripped, caps enforced
const sneaky = validateManifest({ ...EXAMPLE, name: '<img src=x onerror=alert(1)>Name' }); assert.ok(sneaky.ok && !/[<>]/.test((sneaky as { m: { name: string } }).m.name));
// store: install / replace / persist / disable / remove
const kv = testKV(); let st = new PluginStore(kv, 'p'); const r = st.install(JSON.stringify(EXAMPLE)); assert.ok(r.ok && !r.replaced); assert.ok((st.install(JSON.stringify(EXAMPLE)) as { replaced: boolean }).replaced); assert.equal(st.list.length, 1);
st = new PluginStore(kv, 'p'); assert.equal(st.list.length, 1, 'persisted'); assert.equal(st.sims().length, 1); assert.equal(st.decks()[0].cards.length, 2); assert.equal(st.calculators()[0].outputs.length, 2);
st.setEnabled('ohms-law-lab', false); assert.equal(st.sims().length, 0); st.setEnabled('ohms-law-lab', true); assert.ok(!st.install('{oops').ok && !st.install('x'.repeat(500000)).ok);
// the plugin simulation behaves like a real sim: readouts, and the predict-run-explain feature works on it
const sim = st.sims()[0]; assert.match(sim.id, /^plugin-ohms-law-lab-ohm$/); const rd = sim.readouts(sim.init({ volts: 12, ohms: 10 }), { volts: 12, ohms: 10 }); assert.equal(rd[0].value, 1.2); assert.equal(rd[1].value, 14.4);
const ch = makeChallenge(sim, { rng: () => 0.3, seconds: 1 })!; assert.ok(ch, 'predict works on plugin sims'); assert.ok(grade(ch, { dir: ch.dir }).ok);
// drawing does not throw (stub canvas)
const calls: string[] = []; const ctx = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? {} : (...a: unknown[]) => { calls.push(String(k)); return a; }), set: () => true }) as unknown as CanvasRenderingContext2D; sim.draw(ctx, {}, { volts: 12, ohms: 10 }, 400, 300); assert.ok(calls.includes('stroke') && calls.includes('arc'));
console.log('plugins OK');
