import test from 'node:test'; import assert from 'node:assert/strict'; import crypto from 'node:crypto'; import fs from 'node:fs';
import { createServer } from './server.mjs';
const file = '/tmp/nm-gw-test-' + process.pid + '.json'; const WH = 'whsec_' + 'x'.repeat(20); const created = [];
const fakeRzp = async (url, init) => { const b = JSON.parse(init.body); assert.match(url, /razorpay\.com\/v1\/payment_links/); assert.match(init.headers.authorization, /^Basic /); const id = 'plink_' + created.length; created.push({ id, ref: b.reference_id, amount: b.amount }); return { ok: true, json: async () => ({ id, short_url: 'https://rzp.io/i/' + id }) }; };
const srv = createServer({ dataFile: file, secret: 'x'.repeat(32), gateway: { keyId: 'rzp_test_k', keySecret: 's'.repeat(16), webhookSecret: WH, fetchImpl: fakeRzp, feePct: 10 } });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}`;
const call = async (m, p, body, tok, hdr = {}, rawBody) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...hdr }, body: rawBody ?? (body ? JSON.stringify(body) : undefined) }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
test.after(() => { srv.close(); fs.rmSync(file, { force: true }); });
const mk = async e => (await call('POST', '/register', { email: e, password: 'market-pass-1' })).j.token;
const hook = (payload, secret = WH) => { const raw = JSON.stringify(payload); return call('POST', '/webhooks/razorpay', null, null, { 'x-razorpay-signature': crypto.createHmac('sha256', secret).update(raw).digest('hex') }, raw); };
const paid = (pl, pid, amount) => ({ event: 'payment_link.paid', payload: { payment_link: { entity: { id: pl.id, reference_id: pl.ref } }, payment: { entity: { id: pid, amount, currency: 'INR' } } } });
test('gateway: checkout, signed webhook unlocks, replay-safe, forgery-safe', async () => {
  assert.equal((await call('GET', '/market/config')).j.gateway, true);
  const sel = await mk('c@x.in'), buy = await mk('b@x.in');
  const L = (await call('POST', '/market/listings', { title: 'Thermo notes', body: 'Thermodynamics revision. '.repeat(20), price: 100, upi: 'cc@okbank', rights: true }, sel)).j.listing;
  assert.equal((await call('POST', '/market/purchase', { id: L.id, utr: '123456789012' }, buy)).s, 400, 'manual UTR disabled in gateway mode');
  assert.equal((await call('POST', '/market/checkout', { id: L.id }, sel)).s, 400, 'own notes');
  const c = await call('POST', '/market/checkout', { id: L.id }, buy); assert.equal(c.s, 201); assert.match(c.j.url, /rzp\.io/); assert.equal(created[0].amount, 10000);
  assert.equal((await call('GET', '/market/listing?id=' + L.id, null, buy)).j.unlocked, false);
  assert.equal((await call('POST', '/market/confirm', { purchase: c.j.purchase }, sel)).s, 400, 'creator cannot self-confirm online sales');
  assert.equal((await hook(paid(created[0], 'pay_1', 10000), 'wrong-secret')).s, 400, 'forged signature rejected'); assert.equal((await call('GET', '/market/listing?id=' + L.id, null, buy)).j.unlocked, false);
  assert.equal((await call('POST', '/webhooks/razorpay', paid(created[0], 'pay_1', 10000))).s, 400, 'unsigned rejected');
  assert.equal((await hook(paid(created[0], 'pay_1', 10000))).s, 200); const u = await call('GET', '/market/listing?id=' + L.id, null, buy); assert.equal(u.j.unlocked, true); assert.ok(u.j.listing.body.length > 200);
  assert.equal((await hook(paid(created[0], 'pay_1', 10000))).j.duplicate, true, 'replay is idempotent');
  const e = await call('GET', '/market/earnings', null, sel); assert.equal(e.j.sales, 1); assert.equal(e.j.gross, 100); assert.equal(e.j.owed, 90);
});
test('gateway: wrong amount never unlocks', async () => {
  const sel = await mk('c2@x.in'), buy = await mk('b2@x.in'); const n = created.length;
  const L = (await call('POST', '/market/listings', { title: 'Organic notes', body: 'Organic chemistry revision. '.repeat(20), price: 50, upi: 'cc@okbank', rights: true }, sel)).j.listing;
  await call('POST', '/market/checkout', { id: L.id }, buy); await hook(paid(created[n], 'pay_2', 100));
  assert.equal((await call('GET', '/market/listing?id=' + L.id, null, buy)).j.unlocked, false);
});
test('gateway: provider failure gives a clean error', async () => {
  const bad = createServer({ dataFile: file + '2', secret: 'y'.repeat(32), gateway: { keyId: 'k', keySecret: 's', webhookSecret: WH, fetchImpl: async () => { throw new Error('down'); } } }); await new Promise(r => bad.listen(0, '127.0.0.1', r));
  const b = 'http://127.0.0.1:' + bad.address().port; const j = (m, p, body, t) => fetch(b + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: body && JSON.stringify(body) }).then(async r => ({ s: r.status, j: await r.json() }));
  const s = (await j('POST', '/register', { email: 'a@x.in', password: 'market-pass-1' })).j.token, u = (await j('POST', '/register', { email: 'u@x.in', password: 'market-pass-1' })).j.token;
  const L = (await j('POST', '/market/listings', { title: 'Notes here', body: 'x'.repeat(250), price: 20, upi: 'cc@okbank', rights: true }, s)).j.listing;
  assert.equal((await j('POST', '/market/checkout', { id: L.id }, u)).s, 502); bad.close(); fs.rmSync(file + '2', { force: true });
});
