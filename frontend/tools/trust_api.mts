import assert from 'node:assert/strict';
import { trustReport, badgeFor, badgeSvg, reportMarkdown } from '../src/lib/platform/trust.ts';
import { createApi, getConsent, setConsent } from '../src/lib/platform/api.ts';
import { testKV } from '../src/lib/friday/learn.ts';
const rep = { t: Date.now(), label: 'x', score: 1, passed: 50, total: 50, ms: 200, byArea: { compute: { passed: 8, total: 8 }, safety: { passed: 7, total: 7 } }, failures: [] };
let t = trustReport([rep], [{ id: 'r', goal: 'g', t0: 0, ms: 1, status: 'done', events: [], tasks: [], confidence: 0.8, unsure: true, totalTokens: 1, failures: 0 }, { id: 'r2', goal: 'g', t0: 0, ms: 1, status: 'done', events: [], tasks: [], confidence: 0.6, totalTokens: 1, failures: 1 }] as never);
assert.equal(t.level, 'strong'); assert.equal(t.answers.runs, 2); assert.equal(t.answers.flaggedUnsure, 1); assert.ok(Math.abs(t.answers.avgConfidence! - 0.7) < 1e-9); assert.equal(t.answers.failures, 1);
assert.equal(trustReport([], []).level, 'none'); assert.equal(trustReport([{ ...rep, passed: 30, score: 0.6 }], []).level, 'tested');
assert.match(badgeFor(t).svg, /50\/50 checks/); assert.match(badgeFor(trustReport([], [])).svg, /not tested/); assert.ok(!/<script/.test(badgeSvg('a<script>', 'b&c')));
const md = reportMarkdown(t); assert.match(md, /50\/50 \(100%\)/); assert.match(md, /Limits/); assert.match(md, /not general intelligence/); assert.ok(t.limits.length >= 3, 'limits are always stated');
// API consent
const kv = testKV(); let added = 0; const api = createApi({ consent: () => getConsent(kv), topics: () => ['a'], mastery: () => ({ mastery: 0.5, cards: 2, due: 1, mistakes: 0 }), addCards: (_t, c) => { added += c.length; return c.length; }, installPlugin: () => ({ ok: true }) });
await assert.rejects(api.getTopics(), /Permission denied/); setConsent('read', kv); assert.deepEqual(await api.getTopics(), ['a']); assert.equal((await api.getMastery('a')).cards, 2); await assert.rejects(api.addCards('x', [{ front: 'a', back: 'b' }]), /"write"/);
setConsent('write', kv); assert.equal(await api.addCards('x', [{ front: 'a', back: 'b' }]), 1); assert.equal(added, 1); await assert.rejects(api.addCards('x', new Array(400).fill({ front: 'a', back: 'b' })), /at most 300/); assert.ok((await api.installPlugin({ a: 1 })).ok);
let got = 0; const off = api.on('x', () => { got++; }); api.on('x', () => { throw new Error('bad'); }); (api as never as { _emit: (e: string, d: unknown) => void })._emit('x', 1); assert.equal(got, 1); off(); (api as never as { _emit: (e: string, d: unknown) => void })._emit('x', 1); assert.equal(got, 1);
console.log('trust + api OK');
