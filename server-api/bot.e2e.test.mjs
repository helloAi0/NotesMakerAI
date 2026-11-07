// End to end: the REAL Notes Maker server + the REAL bot code, talking to fake Telegram and fake WhatsApp (Meta) servers over HTTP.
import test from 'node:test'; import assert from 'node:assert/strict'; import http from 'node:http'; import crypto from 'node:crypto'; import fs from 'node:fs';
import { createServer } from './server.mjs'; import { startBot, isMain } from './bot.mjs';
const BOTKEY = 'bot-key-0123456789abcdef'; const file = '/tmp/nm-bote2e-' + process.pid + '.json'; const sent = { tg: [], wa: [] }; let tgQueue = []; let tgWebhookDeleted = false;
const listen = h => new Promise(r => { const s = http.createServer(h); s.listen(0, '127.0.0.1', () => r(s)); }); const body = req => new Promise(r => { let b = ''; req.on('data', c => (b += c)); req.on('end', () => r(b)); });
const tg = await listen(async (req, res) => { const raw = await body(req); const j = raw ? JSON.parse(raw) : {}; const m = req.url.split('/').pop(); const out = o => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (!req.url.includes('TESTTOKEN')) { res.writeHead(401); return res.end(JSON.stringify({ ok: false, error_code: 401, description: 'Unauthorized' })); }
  if (m === 'getMe') return out({ ok: true, result: { username: 'nm_test_bot' } }); if (m === 'deleteWebhook') { tgWebhookDeleted = true; return out({ ok: true, result: true }); }
  if (m === 'getUpdates') { if (tgQueue.length) { const u = tgQueue; tgQueue = []; return out({ ok: true, result: u }); } return setTimeout(() => out({ ok: true, result: [] }), 150); }
  if (m === 'sendMessage') { sent.tg.push(j); return out({ ok: true, result: {} }); } out({ ok: false, error_code: 404, description: 'no' }); });
const wa = await listen(async (req, res) => { const raw = await body(req); if (!/Bearer WATOKEN/.test(req.headers.authorization || '')) { res.writeHead(401); return res.end('{}'); } sent.wa.push({ url: req.url, ...JSON.parse(raw) }); res.writeHead(200); res.end('{}'); });
const env = { NM_BOT_KEY: BOTKEY, TELEGRAM_TOKEN: 'TESTTOKEN', TELEGRAM_API_BASE: `http://127.0.0.1:${tg.address().port}`, WA_APP_SECRET: 'appsecret', WA_VERIFY_TOKEN: 'verify123', WA_TOKEN: 'WATOKEN', WA_PHONE_ID: '555', WA_GRAPH_BASE: `http://127.0.0.1:${wa.address().port}` };
process.env.NM_BOT_KEY = BOTKEY; const srv = createServer({ dataFile: file, secret: 'q'.repeat(32) }); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}`;
const quiet = { log() {}, error() {} }; const bot = startBot(env, { api: base, log: quiet }); srv.attachBot(bot);
test.after(() => { bot.abort.abort(); srv.close(); tg.close(); wa.close(); fs.rmSync(file, { force: true }); });
const call = async (m, p, b, tok, h = {}, raw) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...h }, body: raw ?? (b ? JSON.stringify(b) : undefined) }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j }; };
const until = async (f, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await new Promise(r => setTimeout(r, 40)); } return false; };
let token; const upd = (id, text, chat = { id: 777, type: 'private' }) => ({ update_id: id, message: { chat, text } });
test('isMain works for real paths', () => { assert.equal(isMain(new URL('./bot.mjs', import.meta.url).href, new URL('./bot.mjs', import.meta.url).pathname), true); assert.equal(isMain('file:///x/other.mjs', '/nope'), false); });
test('telegram: starts, clears webhook, link -> remind -> inbox -> app pulls it', async () => {
  token = (await call('POST', '/register', { email: 'stu@x.in', password: 'studentpass1' })).j.token; assert.ok(token);
  assert.ok(await until(() => tgWebhookDeleted), 'polling started and webhook cleared'); assert.equal((await call('GET', '/bot/status', null, token)).j.telegram, true);
  tgQueue.push(upd(1, 'remind me to revise ROS 2 commands tomorrow')); assert.ok(await until(() => sent.tg.length >= 1)); assert.match(sent.tg[0].text, /not linked/i);
  const code = (await call('POST', '/bot/link', {}, token)).j.code; assert.match(code, /^[0-9A-F]{6}$/);
  tgQueue.push(upd(2, '/link ' + code)); assert.ok(await until(() => sent.tg.length >= 2)); assert.match(sent.tg[1].text, /Linked/);
  tgQueue.push(upd(3, 'remind me to revise ROS 2 commands tomorrow')); assert.ok(await until(() => sent.tg.length >= 3)); assert.match(sent.tg[2].text, /Added|Saved/i);
  tgQueue.push(upd(4, 'https://youtu.be/dQw4w9WgXcQ my lecture')); assert.ok(await until(() => sent.tg.length >= 4));
  const inbox = await call('GET', '/inbox', null, token); assert.equal(inbox.s, 200); const items = inbox.j.items ?? inbox.j; assert.ok(items.some(i => /ROS 2/.test(i.title ?? i.text)), JSON.stringify(inbox.j).slice(0, 300)); assert.ok(items.some(i => i.kind === 'link'));
  tgQueue.push(upd(5, 'hello', { id: -5, type: 'group' })); assert.ok(await until(() => sent.tg.length >= 5)); assert.match(sent.tg[4].text, /private/i);
});
test('whatsapp: verify handshake, signed message is processed, bad signature rejected, replies sent through Graph API', async () => {
  assert.equal((await call('GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify123&hub.challenge=CH4LL')).j, 'CH4LL'); assert.equal((await call('GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x')).s, 403);
  const code = (await call('POST', '/bot/link', {}, token)).j.code; const sign = raw => 'sha256=' + crypto.createHmac('sha256', 'appsecret').update(raw).digest('hex');
  const mk = text => JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ type: 'text', from: '919800000001', text: { body: text } }] } }] }] });
  const post = (raw, sig) => call('POST', '/webhooks/whatsapp', null, null, { 'x-hub-signature-256': sig ?? sign(raw) }, raw);
  assert.equal((await post(mk('x'), 'sha256=00')).s, 401); const n0 = sent.wa.length;
  assert.equal((await post(mk('/link ' + code))).s, 200); assert.ok(sent.wa.length > n0); assert.match(sent.wa.at(-1).text.body, /Linked/); assert.equal(sent.wa.at(-1).to, '919800000001'); assert.match(sent.wa.at(-1).url, /\/555\/messages/);
  assert.equal((await post(mk('call mom on friday'))).s, 200); assert.match(sent.wa.at(-1).text.body, /Saved/); assert.equal((await call('GET', '/bot/status', null, token)).j.whatsapp, true);
  const inbox = (await call('GET', '/inbox', null, token)).j; assert.ok(JSON.stringify(inbox).includes('call mom'));
});
test('revoked telegram token stops cleanly instead of looping', async () => { const logs = []; const b = startBot({ ...env, TELEGRAM_TOKEN: 'BAD', WA_TOKEN: '', WA_PHONE_ID: '' }, { api: base, log: { log() {}, error: (...a) => logs.push(a.join(' ')) } }); await until(() => logs.length); b.abort.abort(); assert.match(logs[0], /token rejected/i); });
