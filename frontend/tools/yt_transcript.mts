// Unit test: YouTube caption helper (formatting, errors, HTTP handler) with a stand-in for the YouTube client.
import assert from 'node:assert/strict';
const { fetchTranscript, segmentsToText, stamp, mountTranscriptApi } = await import('../server/ytTranscript.ts');
assert.equal(stamp(0), '[00:00]'); assert.equal(stamp(135000), '[02:15]'); assert.equal(stamp(3725000), '[1:02:05]');
assert.equal(segmentsToText([{ startMs: 0, text: 'Hallo  Welt' }, { startMs: 4000, text: ' ' }, { startMs: 9000, text: 'zwei' }]), '[00:00] Hallo Welt\n[00:09] zwei');
const mk = (segs: unknown[] | 'throw') => ({ Innertube: { create: async () => ({ getInfo: async () => ({ getTranscript: async () => { if (segs === 'throw') throw new Error('Transcript panel not found'); return { transcript: { content: { body: { initial_segments: segs } } } }; } }) }) } });
const ok = await fetchTranscript('mNX1wpIQ4Uk', mk([{ start_ms: '0', snippet: { text: 'So, in the next 25 minutes,' } }, { start_ms: '2000', snippet: { text: "I'm going to take you" } }, { type: 'header' }]));
assert.equal(ok.lines, 2); assert.equal(ok.text, "[00:00] So, in the next 25 minutes,\n[00:02] I'm going to take you");
await assert.rejects(() => fetchTranscript('mNX1wpIQ4Uk', mk('throw')), /no readable captions/); await assert.rejects(() => fetchTranscript('mNX1wpIQ4Uk', mk([])), /no captions/); await assert.rejects(() => fetchTranscript('bad', mk([])), /not a YouTube video id/);
// HTTP handler
let handler: any; mountTranscriptApi({ use: (_p: string, f: any) => { handler = f; } }, mk([{ start_ms: '1000', snippet: { text: 'hi' } }]));
const call = (url: string) => new Promise<{ code: number; body: any; hdr: Record<string, string> }>(r => { const hdr: Record<string, string> = {}; const res = { statusCode: 200, setHeader: (k: string, v: string) => { hdr[k] = v; }, end: (b: string) => r({ code: res.statusCode, body: JSON.parse(b), hdr }) }; handler({ url }, res); });
let r = await call('/?v=mNX1wpIQ4Uk'); assert.equal(r.code, 200); assert.equal(r.body.text, '[00:01] hi'); assert.match(r.hdr['content-type'], /json/);
r = await call('/?v=nope'); assert.equal(r.code, 502); assert.equal(r.body.ok, false);
console.log('yt transcript OK'); process.exit(0);
