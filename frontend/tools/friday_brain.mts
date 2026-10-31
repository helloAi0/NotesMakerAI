import assert from 'node:assert/strict';
import { MemoryStore, extractFacts, Policy, classify, testKV, STRATEGIES, softmax, REWARD } from '../src/lib/friday/learn.ts';
import { clusterCorpus, nearestCluster, kmeans, tfidf, silhouette, mulberry } from '../src/lib/friday/cluster.ts';
// ---- facts + memory
assert.deepEqual(extractFacts('my name is taha').facts, ["The user's name is Taha"]); assert.equal(extractFacts('Remember that my exam is on Friday').explicit, true);
assert.ok(extractFacts('I prefer short answers').facts[0].includes('short')); assert.deepEqual(extractFacts('what is entropy').facts, []);
{ const m = new MemoryStore(testKV()); m.add("The user's name is Taha"); m.add('The user is studying B.Tech electronics'); m.add('the user has an exam on thermodynamics next week', 'episode'); assert.equal(m.name(), 'Taha');
  assert.ok(m.recall('when is my thermodynamics exam')[0].text.includes('thermodynamics')); m.add("The user's name is Sara"); assert.equal(m.name(), 'Sara'); assert.equal(m.all().filter(x => /name is/.test(x.text)).length, 1);
  assert.equal(m.forget('thermodynamics'), 1); assert.equal(m.forget('everything'), 2); assert.equal(m.all().length, 0); }
// ---- classify
assert.equal(classify('derive the heat equation'), 'derive'); assert.equal(classify('what is entropy'), 'define'); assert.equal(classify('how do I use click to speak'), 'howto'); assert.equal(classify('explain backpropagation'), 'explain'); assert.equal(classify('calculate 5*6'), 'compute'); assert.equal(classify('hello there'), 'chat');
// ---- policy learns: a simulated user who always rewards 'stepwise' for derive and 'concise' for define
{ const kv = testKV(), p = new Policy(kv, 'k'), rng = mulberry(5); const trueBest: Record<string, string> = { derive: 'stepwise', define: 'concise' };
  for (let i = 0; i < 400; i++) for (const c of ['derive', 'define'] as const) { const s = p.pick(c, rng); const r = s === trueBest[c] ? 1 : -0.6 + (rng() - 0.5) * 0.3; p.reward(c, s, r); }
  assert.equal(p.best('derive'), 'stepwise'); assert.equal(p.best('define'), 'concise'); assert.ok(p.probs('derive')[STRATEGIES.indexOf('stepwise')] > 0.7, String(p.probs('derive')));
  const st = p.stats(); assert.ok(st.total === 300 && st.recent >= st.avgReward - 0.01); const q = new Policy(kv, 'k'); assert.equal(q.best('derive'), 'stepwise'); // persistence
  p.prefer('too_long'); p.prefer('too_long'); assert.ok(p.prefText().includes('short')); p.prefer('too_technical'); p.prefer('too_technical'); assert.ok(p.prefText().includes('simpler')); }
{ const p = new Policy(testKV(), 'z'); const pr = softmax([0, 0, 0, 0, 0]); assert.ok(Math.abs(pr[0] - 0.2) < 1e-9); p.reward('chat', 'formal', REWARD.down); assert.ok(p.probs('chat')[STRATEGIES.indexOf('formal')] < 0.2); p.reward('chat', 'concise', REWARD.up); assert.ok(p.probs('chat')[0] > 0.2); }
// ---- clustering: three clearly different topics must separate
const T = {
  thermo: ['entropy heat engine carnot cycle efficiency reservoir temperature', 'second law thermodynamics entropy heat flows hot cold', 'enthalpy pressure gas expansion work heat first law', 'carnot refrigerator heat pump coefficient performance temperature', 'ideal gas pressure volume temperature isothermal adiabatic process'],
  signals: ['fourier transform frequency spectrum sampling nyquist', 'filter frequency response bode magnitude phase cutoff', 'convolution impulse response linear time invariant system', 'sampling theorem aliasing frequency nyquist reconstruction', 'discrete fourier transform fft spectrum window leakage'],
  bio: ['mitosis cell division chromosome spindle prophase metaphase', 'dna replication enzyme polymerase strand nucleotide', 'photosynthesis chloroplast light reaction glucose carbon dioxide', 'natural selection allele evolution population fitness', 'mendel genetics allele dominant recessive punnett square'],
};
const items = Object.entries(T).flatMap(([k, a]) => a.map((t, i) => ({ id: `${k}${i}`, title: `${k} ${i}`, kind: 'note', text: t })));
{ const map = clusterCorpus(items, { seed: 3 }); assert.equal(map.k, 3, `k=${map.k}`); assert.ok(map.silhouette > 0.15, String(map.silhouette));
  const groups = new Map<number, Set<string>>(); for (const p of map.points) { (groups.get(p.cluster) ?? groups.set(p.cluster, new Set()).get(p.cluster)!).add(p.id.replace(/\d+$/, '')); } for (const g of groups.values()) assert.equal(g.size, 1, 'pure clusters');
  assert.ok(map.clusters.some(c => /entropy|heat|carnot|temperature/.test(c.terms.join(' ')))); assert.equal(map.points.length, 15); assert.ok(map.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  const nc = nearestCluster(map, 'what is the entropy of a carnot engine'); assert.ok(nc && nc.cluster.terms.some(t => /entropy|heat|carnot|temperatur/.test(t)));
  const nb = nearestCluster(map, 'allele frequency in a population'); assert.ok(nb && nb.cluster.id !== nc!.cluster.id);
  // 2-D projection separates the groups: mean intra-group distance < mean inter-group distance
  const d = (a: typeof map.points[0], b: typeof map.points[0]) => Math.hypot(a.x - b.x, a.y - b.y); let intra = 0, ni = 0, inter = 0, ne = 0; for (const a of map.points) for (const b of map.points) if (a !== b) { if (a.cluster === b.cluster) { intra += d(a, b); ni++; } else { inter += d(a, b); ne++; } } assert.ok(intra / ni < inter / ne, 'projection separates clusters'); }
assert.equal(clusterCorpus([items[0]]).k, 0); { const { rows } = tfidf(items.map(i => i.text)); const km = kmeans(rows, 3, 1); assert.equal(new Set(km.assign).size, 3); assert.ok(silhouette(rows, km.assign, 3) > 0.15); }
console.log('friday brain (memory / RL / clustering) OK');
{ // regression: an episode that quotes a fact ("Asked about: my name is …") must not overwrite the fact slot
  const m = new MemoryStore(testKV(), 'slotreg'); m.add("The user's name is Taha", 'fact'); m.add('Asked about: my name is Taha and I study physics', 'episode');
  if (!m.all().some(x => x.kind === 'fact' && /Taha/.test(x.text))) throw new Error('episode overwrote the name fact'); console.log('episode/fact slot OK');
}
