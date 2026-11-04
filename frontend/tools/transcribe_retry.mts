import assert from 'node:assert/strict';
import { aiTranscribeVideo } from '../src/lib/lecture.ts';
const cfg = { provider: 'gemini', apiKey: 'k', model: '', speed: 'fast' } as never;
const ok = (t: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] }), { status: 200 });
const err = (c: number, m = 'busy') => new Response(JSON.stringify({ error: { message: m } }), { status: c });
const sleep = async () => {};
// 1) 503 twice then success on the same model
let n = 0; let t = await aiTranscribeVideo(cfg, 'v0UD4-67ulw', undefined, { sleep, fetch: (async () => (++n < 3 ? err(503) : ok('[00:00] hello'))) as never }); assert.equal(t, '[00:00] hello'); assert.equal(n, 3);
// 2) first model always 503, second model works
const seen: string[] = []; t = await aiTranscribeVideo(cfg, 'v0UD4-67ulw', undefined, { sleep, fetch: (async (u: string) => { seen.push(u); return /3\.5-flash-lite/.test(u) ? err(503) : ok('[00:00] second'); }) as never }); assert.equal(t, '[00:00] second'); assert.ok(seen.some(u => /3\.6-flash/.test(u)));
// 3) everything overloaded → honest message, no "only public videos" blame
await assert.rejects(aiTranscribeVideo(cfg, 'v0UD4-67ulw', undefined, { sleep, fetch: (async () => err(503)) as never }), (e: Error) => /overloaded/.test(e.message) && /not a problem with your key or the video/.test(e.message) && !/Only public/.test(e.message));
// 4) bad key stops immediately
n = 0; await assert.rejects(aiTranscribeVideo(cfg, 'v0UD4-67ulw', undefined, { sleep, fetch: (async () => { n++; return err(403, 'API key not valid'); }) as never }), /rejected the key/); assert.equal(n, 1);
// 5) a real video problem still explains itself
await assert.rejects(aiTranscribeVideo(cfg, 'v0UD4-67ulw', undefined, { sleep, fetch: (async () => err(400, 'Video unavailable')) as never }), /could not read this video/);
console.log('transcribe retry OK');
