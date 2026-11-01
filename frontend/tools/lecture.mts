// Unit test: Lecture-to-Notes engine (transcript parsing, sectioning, formulas, definitions, export).
import assert from 'node:assert/strict';
const L = await import('../src/lib/lecture.ts');
const { SAMPLE_TRANSCRIPT, parseTranscript, buildNotes, youtubeId, fmtTime, findFormulas, toMarkdown, toNotebookText } = L;

// ids
assert.equal(youtubeId('https://www.youtube.com/watch?v=k3kWU4C9m4Q'), 'k3kWU4C9m4Q');
assert.equal(youtubeId('https://youtu.be/k3kWU4C9m4Q?t=40'), 'k3kWU4C9m4Q');
assert.equal(youtubeId('https://www.youtube.com/watch?feature=share&v=k3kWU4C9m4Q'), 'k3kWU4C9m4Q');
assert.equal(youtubeId('https://www.youtube.com/shorts/k3kWU4C9m4Q'), 'k3kWU4C9m4Q');
assert.equal(youtubeId('https://example.com/x'), null);
assert.equal(fmtTime(135), '02:15'); assert.equal(fmtTime(3725), '1:02:05');

// YouTube "Show transcript" paste
const p = parseTranscript(SAMPLE_TRANSCRIPT); assert.ok(p.timed); assert.ok(p.cues.length >= 20); assert.equal(p.cues[0].t, 0); assert.equal(p.cues.find(c => /first law/.test(c.text))!.t, 135);
// inline stamps and brackets
assert.deepEqual(parseTranscript('[00:05] hello there\n[00:09] second line').cues.map(c => c.t), [5, 9]);
// SRT
const srt = '1\n00:00:01,000 --> 00:00:04,000\nHello <i>world</i>\n\n2\n00:01:05,500 --> 00:01:08,000\nSecond line\ncontinues\n';
const ps = parseTranscript(srt); assert.deepEqual(ps.cues.map(c => [c.t, c.text]), [[1, 'Hello world'], [65, 'Second line continues']]);
// VTT
const vtt = 'WEBVTT\n\n00:00:02.000 --> 00:00:05.000\nFirst cue\n\n00:00:06.000 --> 00:00:09.000\nSecond cue\n'; assert.deepEqual(parseTranscript(vtt).cues.map(c => c.t), [2, 6]);
// plain text, timing estimated
const pl = parseTranscript('This is one sentence. And this is another sentence that is a bit longer. Third one here.'); assert.equal(pl.timed, false); assert.equal(pl.cues.length, 3); assert.ok(pl.cues[2].t >= pl.cues[1].t);

// formulas
const f = findFormulas('The formulation is delta U equals Q minus W. Also H = U + PV and we know F = ma. Then Cp minus Cv equals R.').map(x => x.text);
assert.ok(f.includes('ΔU = Q − W'), f.join('|')); assert.ok(f.some(x => /^H = U \+ PV$/.test(x)), f.join('|')); assert.ok(f.some(x => /^F = ma$/.test(x)), f.join('|'));
assert.equal(findFormulas('We have a great time. The lecture is fun and it equals nothing.').length, 0);

// notes from the sample lecture
const n = buildNotes(SAMPLE_TRANSCRIPT, 'https://www.youtube.com/watch?v=k3kWU4C9m4Q');
assert.equal(n.videoId, 'k3kWU4C9m4Q'); assert.ok(n.sections.length >= 3 && n.sections.length <= 6, `sections ${n.sections.length}`);
for (let i = 0; i < n.sections.length; i++) { const s = n.sections[i]; assert.ok(s.title && s.summary, 'title+summary'); assert.ok(s.end > s.start); if (i) assert.equal(s.start, n.sections[i - 1].end); }
assert.ok(n.sections.some(s => s.start >= 120 && s.start <= 150), 'a section starts near the first law (02:15): ' + n.sections.map(s => s.start).join(','));
assert.ok(n.sections.some(s => s.start >= 520 && s.start <= 560), 'a section starts near enthalpy (08:45): ' + n.sections.map(s => s.start).join(','));
const all = n.sections.flatMap(s => s.formulas.map(x => x.text)).join(' | '); assert.ok(/ΔU = Q − W/.test(all), all); assert.ok(/H = U \+ PV/.test(all), all);
assert.ok(n.sections.flatMap(s => s.definitions).some(d => /enthalpy/i.test(d.term)), 'enthalpy defined: ' + JSON.stringify(n.sections.flatMap(s => s.definitions)));
assert.ok(!n.sections.some(s => /welcome back/i.test(s.summary)), 'filler is not the summary');
assert.ok(n.keyTerms.length >= 4);
const md = toMarkdown(n); assert.ok(/^## \[02:\d\d\]/m.test(md) || /^## \[01:\d\d\]/m.test(md) || /^## \[0[0-9]:\d\d\]/m.test(md)); assert.ok(md.includes('https://youtu.be/k3kWU4C9m4Q?t='));
const nb = toNotebookText(n); assert.ok(!/[#*`]/.test(nb) && /Formula:/.test(nb));
// short / empty input
assert.equal(buildNotes('').sections.length, 0); assert.equal(buildNotes('Just one short line.').sections.length, 1);
console.log('lecture OK:', n.sections.map(s => `${fmtTime(s.start)} ${s.title}`).join(' / '));
