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
