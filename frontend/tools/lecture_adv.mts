import assert from 'node:assert/strict';
const L = await import('../src/lib/lecture.ts');
const { buildNotes, parseTranscript, fmtTime, toMarkdown } = L;
const topics = [
 ['photosynthesis','chlorophyll','sunlight','glucose','chloroplast','light reactions','carbon dioxide'],
 ['mitosis','chromosome','spindle','anaphase','cell division','prophase','centromere'],
 ['newton','force','acceleration','mass','momentum','inertia','friction'],
 ['derivative','integral','limit','function','slope','calculus','continuity'],
];
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const mk = (w: string[]) => { let s = ''; for (let i = 0; i < 14; i++) s += (i ? ' ' : '') + (rnd() < 0.55 ? w[Math.floor(rnd() * w.length)] : ['the','of','and','we','is','this','how','when'][Math.floor(rnd() * 8)]); return s; };
// 60 minutes, 4 topics of 15 min, a cue every 8 s, hour-format stamps
let raw = ''; for (let t = 0; t < 3600; t += 8) { raw += `${fmtTime(t)}\n${mk(topics[Math.min(3, Math.floor(t / 900))])}\n`; }
const t0 = performance.now(); const n = buildNotes(raw, 'https://youtu.be/k3kWU4C9m4Q'); const ms = performance.now() - t0;
console.log('60-min:', n.sections.length, 'sections', Math.round(ms) + 'ms', n.sections.map(s => fmtTime(s.start)).join(' '));
assert.ok(ms < 1500, 'fast'); assert.ok(n.sections.length >= 4 && n.sections.length <= 12);
// topic changes at 900,1800,2700: a boundary within 60s of each
for (const b of [900, 1800, 2700]) assert.ok(n.sections.some(s => Math.abs(s.start - b) <= 90), `boundary near ${b}: ${n.sections.map(s => s.start)}`);
assert.ok(fmtTime(3725) === '1:02:05' && parseTranscript('1:02:05\nhello').cues[0].t === 3725);
// no section overlaps / ordered / covers whole
for (let i = 1; i < n.sections.length; i++) assert.equal(n.sections[i].start, n.sections[i - 1].end);
// Hindi / non-latin text must not crash and must keep text
const hi = buildNotes('0:00\nआज हम ऊष्मागतिकी पढ़ेंगे\n0:10\nऊर्जा न बनाई जा सकती है न नष्ट की जा सकती है\n0:20\nयह ऊष्मागतिकी का पहला नियम है'); assert.ok(hi.sections.length >= 1 && hi.sections[0].summary.length > 5, JSON.stringify(hi.sections[0]));
// junk
for (const j of ['', '   ', '\n\n', '0:00', '--> -->', '00:00:01,000 --> 00:00:04,000', '<<<>>>', '1\n\n2\n\n3']) { const r = buildNotes(j); assert.ok(Array.isArray(r.sections)); }
// duplicate / unsorted stamps
const un = parseTranscript('0:30\nsecond\n0:10\nfirst\n0:10\nfirst again'); assert.deepEqual(un.cues.map(c => c.t), [10, 10, 30]);
// html entities / music tags / speaker tags
assert.equal(parseTranscript('0:01\nHello &amp; welcome [Music]').cues[0].text, 'Hello & welcome');
// formulas not hallucinated from prose with numbers
const f = buildNotes('0:00\nWe will meet at 5 pm. The total was 10 plus 20 which is 30 dollars. That equals a lot of fun, honestly speaking here.').sections[0].formulas; assert.equal(f.length, 0, JSON.stringify(f));
// markdown has no undefined/NaN
const md = toMarkdown(n); assert.ok(!/undefined|NaN|\[object/.test(md));
console.log('adv OK');
