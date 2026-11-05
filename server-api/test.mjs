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
