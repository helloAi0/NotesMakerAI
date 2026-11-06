import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from './server.mjs';
const file = '/tmp/nm-server-test-' + process.pid + '.json'; let clock = 1_000_000;
const srv = createServer({ dataFile: file, secret: 'x'.repeat(32), allowOrigin: 'https://app.example', now: () => clock });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}`;
const call = async (method, path, body, tok, hdr = {}) => { const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...hdr }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: await r.json().catch(() => ({})), h: r.headers }; };
test.after(() => { srv.close(); fs.rmSync(file, { force: true }); });
let teacher, student, code;
test('register validates and hashes', async () => {
  assert.equal((await call('POST', '/register', { email: 'bad', password: 'longenough1' })).s, 400); assert.equal((await call('POST', '/register', { email: 'a@b.co', password: 'short' })).s, 400);
  const t = await call('POST', '/register', { email: 'Teacher@School.edu', password: 'teacher-pass-1', role: 'teacher', name: 'Ms Rao' }); assert.equal(t.s, 201); teacher = t.j.token; assert.equal(t.j.user.role, 'teacher');
  const s = await call('POST', '/register', { email: 'asha@school.edu', password: 'student-pass-1' }); assert.equal(s.s, 201); student = s.j.token; assert.equal(s.j.user.role, 'student', 'role defaults to student');
  assert.equal((await call('POST', '/register', { email: 'asha@school.edu', password: 'student-pass-1' })).s, 409);
  const raw = fs.readFileSync(file, 'utf8'); assert.ok(!/teacher-pass-1|student-pass-1/.test(raw), 'passwords are never stored');
});
test('login, wrong password, rate limit', async () => {
  assert.equal((await call('POST', '/login', { email: 'asha@school.edu', password: 'student-pass-1' })).s, 200); assert.equal((await call('POST', '/login', { email: 'asha@school.edu', password: 'nope-nope-nope' })).s, 401); assert.equal((await call('POST', '/login', { email: 'ghost@x.co', password: 'whatever123' })).s, 401);
  let last = 0; for (let i = 0; i < 12; i++) last = (await call('POST', '/login', { email: 'asha@school.edu', password: 'bad' + i })).s; assert.equal(last, 429); clock += 61_000; assert.equal((await call('POST', '/login', { email: 'asha@school.edu', password: 'student-pass-1' })).s, 200);
});
test('auth is required and tokens cannot be forged or expired', async () => {
  assert.equal((await call('GET', '/me')).s, 401); assert.equal((await call('GET', '/me', null, 'abc.def')).s, 401); const forged = student.split('.')[0] + '.' + teacher.split('.')[1]; assert.equal((await call('GET', '/me', null, forged)).s, 401);
  const body = JSON.parse(Buffer.from(student.split('.')[0], 'base64url')); body.role = 'teacher'; const tamper = Buffer.from(JSON.stringify(body)).toString('base64url') + '.' + student.split('.')[1]; assert.equal((await call('GET', '/me', null, tamper)).s, 401);
  assert.equal((await call('GET', '/me', null, student)).j.user.email, 'asha@school.edu'); const saved = clock; clock += 8 * 24 * 3600 * 1000; assert.equal((await call('GET', '/me', null, student)).s, 401, 'expired'); clock = saved;
});
test('classes: only teachers create, students join, reports reach only the right teacher', async () => {
  assert.equal((await call('POST', '/classes', { name: 'x' }, student)).s, 403); const c = await call('POST', '/classes', { name: 'Physics 101' }, teacher); assert.equal(c.s, 201); code = c.j.class.code;
  assert.equal((await call('POST', '/classes/report', { code, report: { kind: 'nm-report', topics: [] } }, student)).s, 403, 'must join first'); assert.equal((await call('POST', '/classes/join', { code: 'ZZZZZZ' }, student)).s, 404); assert.equal((await call('POST', '/classes/join', { code }, teacher)).s, 403);
  assert.equal((await call('POST', '/classes/join', { code: code.toLowerCase() }, student)).s, 200);
  const rep = { kind: 'nm-report', v: 1, student: 'Fake Name', topics: [{ topic: 'Optics', mastery: 0.4, cards: 5, due: 2, mistakes: 1 }], exams: [], reviews30d: 9, activeDays30: 4, cards: 5, issued: 1 }; assert.equal((await call('POST', '/classes/report', { code, report: rep }, student)).s, 200); assert.equal((await call('POST', '/classes/report', { code, report: { nope: 1 } }, student)).s, 400);
  const d = await call('GET', `/classes/dashboard?code=${code}`, null, teacher); assert.equal(d.s, 200); assert.equal(d.j.reports.length, 1); assert.equal(d.j.reports[0].student, 'asha', 'student name comes from the account, not the file');
  const other = (await call('POST', '/register', { email: 'other@school.edu', password: 'teacher-pass-2', role: 'teacher' })).j.token; assert.equal((await call('GET', `/classes/dashboard?code=${code}`, null, other)).s, 403, "another teacher cannot see this class"); assert.equal((await call('GET', `/classes/dashboard?code=${code}`, null, student)).s, 403);
  assert.equal((await call('GET', '/classes', null, student)).j.classes.length, 1);
});
test('sync stores an encrypted blob per user only', async () => {
  assert.equal((await call('GET', '/sync', null, student)).j.blob, null); assert.equal((await call('PUT', '/sync', { blob: 'ciphertext-abc' }, student)).s, 200); assert.equal((await call('GET', '/sync', null, student)).j.blob, 'ciphertext-abc'); assert.equal((await call('GET', '/sync', null, teacher)).j.blob, null);
  assert.equal((await call('PUT', '/sync', { blob: 'x'.repeat(1_600_000) }, student)).s, 400); assert.equal((await call('PUT', '/sync', { notblob: 1 }, student)).s, 400);
});
test('hardening: size cap, bad JSON, CORS allowlist, unknown routes', async () => {
  const big = await fetch(base + '/login', { method: 'POST', body: 'x'.repeat(2_100_000) }); assert.equal(big.status, 413); const bad = await fetch(base + '/login', { method: 'POST', body: '{oops' }); assert.equal(bad.status, 400); assert.equal((await call('GET', '/nothing')).s, 404);
  assert.equal((await call('GET', '/me', null, student, { origin: 'https://app.example' })).h.get('access-control-allow-origin'), 'https://app.example'); assert.equal((await call('GET', '/me', null, student, { origin: 'https://evil.example' })).h.get('access-control-allow-origin'), null);
  assert.throws(() => createServer({ secret: 'short' }), /NM_SECRET/);
});
test('persistence and account deletion (privacy right)', async () => {
  const srv2 = createServer({ dataFile: file, secret: 'x'.repeat(32), now: () => clock }); await new Promise(r => srv2.listen(0, '127.0.0.1', r)); const b2 = `http://127.0.0.1:${srv2.address().port}`;
  const r = await fetch(b2 + '/me', { headers: { authorization: 'Bearer ' + student } }); assert.equal(r.status, 200, 'data survives a restart'); srv2.close();
  assert.equal((await call('DELETE', '/me', null, student)).s, 200); assert.equal((await call('GET', '/me', null, student)).s, 401); assert.ok(!/asha@school/.test(fs.readFileSync(file, 'utf8')), 'account and its data are gone');
});

/* ---------- marketplace + bot inbox ---------- */
process.env.NM_BOT_KEY = 'k'.repeat(24); process.env.NM_REPORT_AGE_MS = '0';
const mk = async (email) => { const r = await call('POST', '/register', { email, password: 'market-pass-1', name: email.split('@')[0] }); return r.j.token; };
const body = 'Thermodynamics revision. '.repeat(20);
test('marketplace: publish, browse, UPI purchase, unlock', async () => {
  const sel = await mk('creator@x.in'), buy = await mk('buyer@x.in'), other = await mk('other@x.in');
  assert.equal((await call('POST', '/market/listings', { title: 'Thermo free', body, price: 0 }, sel)).s, 400, 'rights confirmation is required'); assert.equal((await call('POST', '/market/listings', { title: 'ab', body }, sel)).s, 400); assert.equal((await call('POST', '/market/listings', { title: 'Thermo notes', body: 'short' }, sel)).s, 400);
  assert.equal((await call('POST', '/market/listings', { title: 'Thermo notes', body, price: 3, upi: 'a@b', rights: true }, sel)).s, 400, 'price under 5'); assert.equal((await call('POST', '/market/listings', { title: 'Thermo notes', body, price: 50, rights: true }, sel)).s, 400, 'paid needs UPI id');
  const paid = (await call('POST', '/market/listings', { title: 'Thermo premium', subject: 'Physics', body, price: 50, upi: 'creator@okbank', rights: true }, sel)); assert.equal(paid.s, 201); const free = (await call('POST', '/market/listings', { title: 'Thermo free', subject: 'Physics', body, price: 0, rights: true }, sel)).j.listing;
  const list = await call('GET', '/market/listings?subject=physics'); assert.equal(list.s, 200, 'browsing needs no account'); assert.equal(list.j.listings.length, 2); assert.ok(list.j.listings.every(l => !('body' in l) && !('upi' in l)), 'list shows previews only, never body or UPI id');
  assert.equal((await call('GET', '/market/listings?q=premium')).j.listings.length, 1);
  assert.equal((await call('GET', `/market/listing?id=${free.id}`, null, buy)).j.unlocked, true);
  const locked = await call('GET', `/market/listing?id=${paid.j.listing.id}`, null, buy); assert.equal(locked.j.unlocked, false); assert.ok(!locked.j.listing.body); assert.equal(locked.j.pay.upi, 'creator@okbank'); assert.equal(locked.j.pay.amount, 50);
  assert.equal((await call('POST', '/market/purchase', { id: paid.j.listing.id, utr: '123' }, buy)).s, 400); const pur = await call('POST', '/market/purchase', { id: paid.j.listing.id, utr: '412345678901' }, buy); assert.equal(pur.s, 201);
  assert.equal((await call('POST', '/market/purchase', { id: paid.j.listing.id, utr: '412345678901' }, other)).s, 409, 'UTR cannot be reused');
  assert.equal((await call('GET', `/market/listing?id=${paid.j.listing.id}`, null, buy)).j.unlocked, false, 'still locked until confirmed');
  assert.equal((await call('POST', '/market/confirm', { purchase: pur.j.purchase.id }, other)).s, 403, 'only the creator confirms'); assert.equal((await call('POST', '/market/confirm', { purchase: pur.j.purchase.id }, buy)).s, 403);
  assert.equal((await call('POST', '/market/confirm', { purchase: pur.j.purchase.id }, sel)).s, 200);
  const un = await call('GET', `/market/listing?id=${paid.j.listing.id}`, null, buy); assert.equal(un.j.unlocked, true); assert.ok(un.j.listing.body.length > 200); assert.equal((await call('GET', `/market/listing?id=${paid.j.listing.id}`, null, other)).j.unlocked, false);
  const mine = await call('GET', '/market/mine', null, sel); assert.equal(mine.j.listings.find(l => l.id === paid.j.listing.id).sales, 1); assert.equal((await call('GET', '/market/mine', null, buy)).j.bought.length, 1);
  const r3 = await mk('r3@x.in'); for (const t of [other, buy, r3]) await call('POST', '/market/report', { id: free.id }, t); assert.equal((await call('GET', '/market/listings?q=free')).j.listings.length, 0, '3 reports hide a listing');
  assert.equal((await call('POST', '/market/unlist', { id: paid.j.listing.id }, other)).s, 403); assert.equal((await call('POST', '/market/unlist', { id: paid.j.listing.id }, sel)).s, 200);
  const raw = fs.readFileSync(file, 'utf8'); assert.ok(!/market-pass-1/.test(raw));
});
test('bot inbox: link a chat, push items, app pulls and acknowledges', async () => {
  const me = await mk('botuser@x.in'); const KEY = { 'x-bot-key': process.env.NM_BOT_KEY };
  const lk = await call('POST', '/bot/link', {}, me); assert.equal(lk.s, 201); assert.match(lk.j.code, /^[0-9A-F]{6}$/);
  assert.equal((await call('POST', '/bot/claim', { code: lk.j.code, chat: 'tg:42' })).s, 401, 'bot key required'); assert.equal((await call('POST', '/bot/claim', { code: 'ZZZZZZ', chat: 'tg:42' }, null, KEY)).s, 404);
  assert.equal((await call('POST', '/bot/push', { chat: 'tg:42', items: [{ kind: 'note', text: 'x' }] }, null, KEY)).s, 404, 'unlinked chat'); assert.equal((await call('POST', '/bot/claim', { code: lk.j.code, chat: 'tg:42' }, null, KEY)).s, 200); assert.equal((await call('POST', '/bot/claim', { code: lk.j.code, chat: 'tg:43' }, null, KEY)).s, 404, 'code is single use');
  assert.equal((await call('POST', '/bot/push', { chat: 'tg:42', source: 'telegram', items: [{ kind: 'task', title: 'Revise ROS 2 commands <b>', due: '2026-11-06' }, { kind: 'link', url: 'https://youtu.be/abc', title: 'lecture' }, { kind: 'link', url: 'javascript:alert(1)', title: 'bad' }] }, null, KEY)).j.queued, 3);
  const inbox = (await call('GET', '/inbox', null, me)).j.items; assert.equal(inbox.length, 3); assert.equal(inbox[0].title, 'Revise ROS 2 commands b'); assert.equal(inbox[0].due, '2026-11-06'); assert.equal(inbox[2].url, '', 'non-http link dropped');
  await call('POST', '/inbox/ack', { ids: [inbox[0].id, inbox[1].id] }, me); assert.equal((await call('GET', '/inbox', null, me)).j.items.length, 1);
  const other = await mk('nobody@x.in'); assert.equal((await call('GET', '/inbox', null, other)).j.items.length, 0, 'inbox is per user');
});

test('audit: reports need an aged account, bot unlink/status, purchase status, claim brute-force limit', async () => {
  const sel = await mk('aud-creator@x.in'), rep = await mk('aud-reporter@x.in'), buy = await mk('aud-buyer@x.in'); const KEY = { 'x-bot-key': process.env.NM_BOT_KEY };
  const l = (await call('POST', '/market/listings', { title: 'Audit notes', body, price: 20, upi: 'cc@okbank', rights: true }, sel)).j.listing;
  process.env.NM_REPORT_AGE_MS = '86400000'; assert.equal((await call('POST', '/market/report', { id: l.id }, rep)).s, 403, 'brand-new accounts cannot mass-report'); process.env.NM_REPORT_AGE_MS = '0';
  assert.equal((await call('POST', '/market/report', { id: l.id }, sel)).s, 400, 'cannot report your own listing');
  assert.equal((await call('GET', `/market/listing?id=${l.id}`, null, buy)).j.purchase, null); await call('POST', '/market/purchase', { id: l.id, utr: '555555555555' }, buy); assert.equal((await call('GET', `/market/listing?id=${l.id}`, null, buy)).j.purchase.status, 'pending');
  const p = (await call('GET', '/market/mine', null, sel)).j.incoming[0]; await call('POST', '/market/confirm', { purchase: p.id, accept: false }, sel); assert.equal((await call('GET', `/market/listing?id=${l.id}`, null, buy)).j.purchase.status, 'rejected'); assert.equal((await call('POST', '/market/purchase', { id: l.id, utr: '666666666666' }, buy)).s, 201, 'after a rejection the buyer may retry with a correct UTR');
  const me = await mk('aud-bot@x.in'); assert.equal((await call('GET', '/bot/status', null, me)).j.linked, 0); const lk = (await call('POST', '/bot/link', {}, me)).j.code; await call('POST', '/bot/claim', { code: lk, chat: 'tg:900' }, null, KEY); assert.equal((await call('GET', '/bot/status', null, me)).j.linked, 1);
  assert.equal((await call('POST', '/bot/unlink', {}, me)).j.unlinked, 1); assert.equal((await call('POST', '/bot/push', { chat: 'tg:900', items: [{ kind: 'note', text: 'x' }] }, null, KEY)).s, 404, 'unlinked chats stop delivering');
  let last = 0; for (let i = 0; i < 7; i++) last = (await call('POST', '/bot/claim', { code: 'ABCDEF', chat: 'tg:brute' }, null, KEY)).s; assert.equal(last, 429, 'guessing codes from one chat is throttled');
  assert.equal((await call('POST', '/bot/claim', { code: lk, chat: 'tg:other' }, null, KEY)).s, 404);
});
