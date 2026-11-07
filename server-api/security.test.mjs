import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { createServer } from './server.mjs';
const file = '/tmp/nm-sec-' + process.pid + '.json';
const srv = createServer({ dataFile: file, secret: 'z'.repeat(32) }); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}`;
test.after(() => { srv.close(); fs.rmSync(file, { force: true }); });
const call = async (m, p, body, tok) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body && JSON.stringify(body) }); return { s: r.status, j: await r.json().catch(() => ({})), h: r.headers }; };
test('health and security headers', async () => { const r = await call('GET', '/healthz'); assert.equal(r.s, 200); assert.equal(r.j.ok, true); assert.equal(r.h.get('x-frame-options'), 'DENY'); assert.match(r.h.get('strict-transport-security'), /max-age/); assert.equal(r.h.get('x-content-type-options'), 'nosniff'); });
test('password change revokes old tokens; wrong current password rejected', async () => {
  const t1 = (await call('POST', '/register', { email: 'p@x.in', password: 'firstpass1' })).j.token; const t2 = (await call('POST', '/login', { email: 'p@x.in', password: 'firstpass1' })).j.token;
  assert.equal((await call('POST', '/me/password', { current: 'nope', next: 'secondpass2' }, t1)).s, 401);
  assert.equal((await call('POST', '/me/password', { current: 'firstpass1', next: 'short' }, t1)).s, 400);
  const c = await call('POST', '/me/password', { current: 'firstpass1', next: 'secondpass2' }, t1); assert.equal(c.s, 200);
  assert.equal((await call('GET', '/me', null, t2)).s, 401, 'other device signed out'); assert.equal((await call('GET', '/me', null, t1)).s, 401, 'old token dead');
  assert.equal((await call('GET', '/me', null, c.j.token)).s, 200, 'new token works');
  assert.equal((await call('POST', '/login', { email: 'p@x.in', password: 'firstpass1' })).s, 401); assert.equal((await call('POST', '/login', { email: 'p@x.in', password: 'secondpass2' })).s, 200);
  const o = await call('POST', '/me/logout-all', {}, c.j.token); assert.equal((await call('GET', '/me', null, c.j.token)).s, 401); assert.equal((await call('GET', '/me', null, o.j.token)).s, 200);
});
test('tampered or missing tokens are rejected', async () => { const t = (await call('POST', '/register', { email: 'q@x.in', password: 'firstpass1' })).j.token; assert.equal((await call('GET', '/me', null, t.slice(0, -2) + 'xx')).s, 401); assert.equal((await call('GET', '/me')).s, 401); });
test('email verification and password reset (fake mailer)', async () => {
  const mails = []; const f2 = file + '.mail'; const s2 = createServer({ dataFile: f2, secret: 'm'.repeat(32), allowOrigin: 'https://app.example', mailer: async m => { mails.push(m); } }); await new Promise(r => s2.listen(0, '127.0.0.1', r)); const b2 = `http://127.0.0.1:${s2.address().port}`;
  const c = async (m, p, body, tok) => { const r = await fetch(b2 + p, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body && JSON.stringify(body) }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
  const tokOf = i => mails[i].text.match(/#(?:verify|reset)=([\w.-]+)/)[1];
  assert.equal((await c('GET', '/auth/config')).j.email, true);
  const r = await c('POST', '/register', { email: 'v@x.in', password: 'firstpass1' }); assert.equal(r.j.verifyEmailSent, true); assert.equal(r.j.user.verified, false); assert.match(mails[0].text, /https:\/\/app\.example\/#verify=/);
  assert.equal((await c('POST', '/market/listings', { title: 't', body: 'x'.repeat(250), price: 10, upi: 'cc@okbank', rights: true }, r.j.token)).s, 403, 'unverified cannot publish');
  assert.equal((await c('GET', '/me', null, tokOf(0))).s, 401, 'email tokens never act as sessions');
  assert.equal((await c('POST', '/verify', { token: 'garbage' })).s, 400); assert.equal((await c('POST', '/verify', { token: tokOf(0) })).s, 200);
  assert.equal((await c('POST', '/market/listings', { title: 'Verified notes', body: 'x'.repeat(250), price: 10, upi: 'cc@okbank', rights: true }, r.j.token)).s, 201, 'verified can publish');
  // forgot: no account enumeration, one-time link
  assert.equal((await c('POST', '/forgot', { email: 'nobody@x.in' })).s, 200); assert.equal(mails.length, 1, 'no mail for unknown address'); assert.equal((await c('POST', '/forgot', { email: 'v@x.in' })).s, 200); assert.equal(mails.length, 2);
  const rt = tokOf(1); assert.equal((await c('POST', '/reset', { token: rt, password: 'short' })).s, 400); assert.equal((await c('POST', '/reset', { token: rt, password: 'brandnewpass9' })).s, 200);
  assert.equal((await c('POST', '/reset', { token: rt, password: 'anotherpass10' })).s, 400, 'link works once'); assert.equal((await c('GET', '/me', null, r.j.token)).s, 401, 'old sessions revoked');
  assert.equal((await c('POST', '/login', { email: 'v@x.in', password: 'brandnewpass9' })).s, 200); s2.close(); fs.rmSync(f2, { force: true });
});
test('without a mail provider: reset is honestly unavailable and sign-up still works', async () => { assert.equal((await call('GET', '/auth/config')).j.email, false); assert.equal((await call('POST', '/forgot', { email: 'a@b.in' })).s, 501); const r = await call('POST', '/register', { email: 'nm@x.in', password: 'firstpass1' }); assert.equal(r.j.user.verified, true); });
test('sqlite storage: persists across restarts, imports old JSON, survives a crash mid-write', async () => {
  const sq = '/tmp/nm-sqlite-' + process.pid + '.sqlite'; const legacy = sq.replace('.sqlite', '.json'); fs.writeFileSync(legacy, JSON.stringify({ users: { 'old@x.in': { email: 'old@x.in', name: 'Old', role: 'student', salt: 'aa', hash: 'bb', created: 1, tv: 0, verified: true } } }));
  const boot = async () => { const s = createServer({ dataFile: sq, secret: 's'.repeat(32) }); await new Promise(r => s.listen(0, '127.0.0.1', r)); const b = `http://127.0.0.1:${s.address().port}`; return { s, c: async (m, p, body, tok) => { const r = await fetch(b + p, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body && JSON.stringify(body) }); return { s: r.status, j: await r.json().catch(() => ({})) }; } }; };
  let a = await boot(); assert.equal((await a.c('GET', '/healthz')).j.users, 1, 'old JSON imported'); const t = (await a.c('POST', '/register', { email: 'new@x.in', password: 'firstpass1' })).j.token; assert.ok(t); a.s.close(); await new Promise(r => setTimeout(r, 50));
  a = await boot(); assert.equal((await a.c('GET', '/healthz')).j.users, 2, 'data survived restart'); assert.equal((await a.c('GET', '/me', null, t)).s, 200, 'same sessions valid after restart'); a.s.close(); await new Promise(r => setTimeout(r, 50)); for (const f of [sq, sq + '-wal', sq + '-shm', legacy]) fs.rmSync(f, { force: true });
});
