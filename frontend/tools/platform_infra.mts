import assert from 'node:assert/strict';
import { resilientFetch, describeFailure, retryable } from '../src/lib/net.ts';
import * as err from '../src/lib/errors.ts';
import * as an from '../src/lib/analytics.ts';
import { testKV } from '../src/lib/friday/learn.ts';
const R = (s: number, h: Record<string, string> = {}) => new Response('x', { status: s, headers: h }); const sleep = async () => {};
// retries 503 then succeeds; never retries 400/401
let n = 0; let r = await resilientFetch('u', {}, { sleep, fetch: (async () => (++n < 3 ? R(503) : R(200))) as never }); assert.equal(r.status, 200); assert.equal(n, 3);
n = 0; r = await resilientFetch('u', {}, { sleep, fetch: (async () => { n++; return R(401); }) as never }); assert.equal(r.status, 401); assert.equal(n, 1);
n = 0; r = await resilientFetch('u', {}, { sleep, retries: 2, fetch: (async () => { n++; return R(503); }) as never }); assert.equal(r.status, 503); assert.equal(n, 3, 'returns the last response after retries');
// network error retried, then success; permanent failure throws
n = 0; r = await resilientFetch('u', {}, { sleep, fetch: (async () => { if (++n < 2) throw new TypeError('Failed to fetch'); return R(200); }) as never }); assert.equal(r.status, 200);
await assert.rejects(resilientFetch('u', {}, { sleep, retries: 1, fetch: (async () => { throw new TypeError('Failed to fetch'); }) as never }), /Failed to fetch/);
// Retry-After honoured (capped)
const delays: number[] = []; n = 0; await resilientFetch('u', {}, { sleep: async ms => { delays.push(ms); }, fetch: (async () => (++n < 2 ? R(429, { 'retry-after': '3' }) : R(200))) as never }); assert.deepEqual(delays, [3000]);
// timeout aborts a hanging request
await assert.rejects(resilientFetch('u', {}, { sleep, retries: 0, timeoutMs: 30, fetch: ((_u: string, i: RequestInit) => new Promise((_, rej) => i.signal!.addEventListener('abort', () => rej(new DOMException('a', 'AbortError'))))) as never }), /Timed out/);
// caller cancel is not retried
const ac = new AbortController(); ac.abort(); await assert.rejects(resilientFetch('u', {}, { signal: ac.signal, fetch: (async () => R(200)) as never }), (e: Error) => e.name === 'AbortError');
assert.ok(retryable(503) && retryable(429) && !retryable(400) && !retryable(404));
assert.match(describeFailure('Gemini', 503), /overloaded or down/); assert.match(describeFailure('Gemini', 429), /rate limit/); assert.match(describeFailure('Ollama', new TypeError('Failed to fetch')), /OLLAMA_ORIGINS/); assert.match(describeFailure('Whisper', new Error('Timed out after 20 s')), /did not answer in time/); assert.match(describeFailure('Gemini', 401), /Settings/);
// errors: scrubs keys, de-duplicates, caps, Sentry envelope
const kv = testKV(); err.report('boom AIzaSyA1234567890123456789012345 failed', 'test', 'at x?key=abc123', { kv }); const log = err.errorLog(kv); assert.equal(log.length, 1); assert.ok(!/AIza/.test(log[0].msg) && !/abc123/.test(log[0].stack!));
err.report('boom AIzaSyA1234567890123456789012345 failed', 'test', undefined, { kv }); assert.equal(err.errorLog(kv).length, 1, 'burst de-duplicated');
assert.equal(err.sentryEndpoint('https://abc123@o1.ingest.sentry.io/42')!.url, 'https://o1.ingest.sentry.io/api/42/envelope/?sentry_key=abc123&sentry_version=7'); assert.equal(err.sentryEndpoint('nope'), null);
let sent = 0; err.report('a', 'w', undefined, { kv, send: (async () => { sent++; return R(200); }) as never }); assert.equal(sent, 0, 'nothing is sent without opt-in');
err.setCfg({ share: true, sentryDsn: 'https://abc123@o1.ingest.sentry.io/42' }, kv); err.report('b different', 'w', undefined, { kv, send: (async (_u: string, i: RequestInit) => { sent++; assert.ok(String(i.body).split('\n').length === 3); return R(200); }) as never }); assert.equal(sent, 1);
for (let i = 0; i < 130; i++) err.report('e' + i, 'w', undefined, { kv }); assert.ok(err.errorLog(kv).length <= 100);
// analytics: off by default, counts only with consent, retention + activation
const k2 = testKV(); const t0 = new Date('2026-10-01T10:00:00Z').getTime(); an.track('session_start', { kv: k2, now: t0 }); assert.equal(an.summary({ kv: k2 }).activeDays, 0, 'no consent → nothing stored');
an.setCfg({ consent: true }, k2); an.track('session_start', { kv: k2, now: t0 }); an.track('quiz_done', { kv: k2, now: t0 + 4 * 60000 }); an.track('session_start', { kv: k2, now: t0 + 1 * 86400000 }); an.track('session_start', { kv: k2, now: t0 + 7 * 86400000 });
const s = an.summary({ kv: k2 }); assert.equal(s.activation.minutesToFirstQuiz, 4); assert.ok(s.retention.d1 && s.retention.d7 && !s.retention.d28); assert.equal(s.totals.session_start, 3);
assert.equal(await an.flush({ kv: k2, send: (async () => R(200)) as never }), false, 'no endpoint → nothing sent'); an.setCfg({ endpoint: 'https://pilot.example/ingest' }, k2); let body = ''; assert.equal(await an.flush({ kv: k2, send: (async (_u: string, i: RequestInit) => { body = String(i.body); return R(200); }) as never }), true); assert.ok(!/heat|note/i.test(body.replace(/note_made/g, '')));
console.log('platform infra OK');
