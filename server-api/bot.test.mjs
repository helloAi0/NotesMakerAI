import test from 'node:test'; import assert from 'node:assert/strict'; import crypto from 'node:crypto'; import fs from 'node:fs';
import { parseDue, parseMessage, createBridge, telegram, whatsapp, serveWhatsApp } from './bot.mjs'; import { createServer } from './server.mjs';
const NOW = new Date(2026, 10, 5, 10); // Thu 5 Nov 2026
test('due dates', () => {
  assert.deepEqual(parseDue('revise ROS 2 commands tomorrow', NOW), { due: '2026-11-06', rest: 'revise ROS 2 commands' }); assert.equal(parseDue('submit lab on friday', NOW).due, '2026-11-06'); assert.equal(parseDue('exam on monday', NOW).due, '2026-11-09'); assert.equal(parseDue('read ch 3 in 3 days', NOW).due, '2026-11-08'); assert.equal(parseDue('viva on 12 nov', NOW).due, '2026-11-12'); assert.equal(parseDue('thing on 2 nov', NOW).due, '2027-11-02', 'past dates roll to next year'); assert.equal(parseDue('call mom today', NOW).due, '2026-11-05'); assert.equal(parseDue('just a note', NOW).due, ''); assert.equal(parseDue('plan day after tomorrow', NOW).due, '2026-11-07');
});
test('messages', () => {
  let r = parseMessage('Remind me to revise ROS 2 commands tomorrow', NOW); assert.deepEqual(r.items, [{ kind: 'task', title: 'Revise ROS 2 commands', due: '2026-11-06' }]); assert.match(r.reply, /2026-11-06/);
  r = parseMessage('https://youtu.be/dQw4w9WgXcQ thermodynamics lecture', NOW); assert.equal(r.items[0].kind, 'link'); assert.equal(r.items[0].title, 'thermodynamics lecture'); assert.match(r.items[0].url, /youtu\.be/);
  r = parseMessage('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30', NOW); assert.equal(r.items[0].kind, 'link'); assert.equal(parseMessage('https://example.com/a', NOW).items[0].kind, 'link'); assert.equal(parseMessage('osmosis is movement of water', NOW).items[0].kind, 'note');
  assert.equal(parseMessage('remind me to', NOW).items.length, 0); assert.equal(parseMessage('', NOW).items.length, 0); assert.equal(parseMessage('remind me to call sir', NOW).items[0].due, ''); assert.match(parseMessage('remind me to call sir', NOW).reply, /No date found/);
});
test('end to end with the real server and a fake Telegram / WhatsApp', async () => {
  process.env.NM_BOT_KEY = 'b'.repeat(24); const file = '/tmp/nm-bot-' + process.pid + '.json'; const srv = createServer({ dataFile: file, secret: 's'.repeat(32) }); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const api = `http://127.0.0.1:${srv.address().port}`;
  try {
    const reg = await (await fetch(api + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@b.co', password: 'longenough1' }) })).json(); const auth = { authorization: 'Bearer ' + reg.token, 'content-type': 'application/json' };
    const handle = createBridge({ api, botKey: process.env.NM_BOT_KEY, now: () => NOW, transcribe: async ({ bytes }) => (bytes.toString() === 'VOICE' ? 'remind me to revise ROS 2 commands tomorrow' : '') });
    assert.match(await handle('tg:1', { text: 'remind me to x tomorrow' }, 'telegram'), /not linked/);
    const { code } = await (await fetch(api + '/bot/link', { method: 'POST', headers: auth, body: '{}' })).json(); assert.match(await handle('tg:1', { text: '/link ' + code }, 'telegram'), /Linked/); assert.match(await handle('tg:2', { text: '/link ' + code }, 'telegram'), /wrong or expired/);
    const sent = []; const fakeTg = async (url, o) => { const m = url.split('/').pop(); if (m === 'sendMessage') { sent.push(JSON.parse(o.body).text); return { json: async () => ({ ok: true }) }; } if (m === 'getFile') return { json: async () => ({ result: { file_path: 'v.oga' } }) }; return { arrayBuffer: async () => Buffer.from('VOICE') }; };
    const tg = telegram({ token: 'T', handle, fetchImpl: fakeTg }); await tg.onUpdate({ update_id: 1, message: { chat: { id: 1 }, text: 'https://youtu.be/dQw4w9WgXcQ ros lecture' } }); await tg.onUpdate({ update_id: 2, message: { chat: { id: 1 }, voice: { file_id: 'f', mime_type: 'audio/ogg' } } }); await tg.onUpdate({ update_id: 3, edited_message: {} });
    assert.equal(sent.length, 2); assert.match(sent[1], /Heard: “remind me to revise ROS 2 commands tomorrow”[\s\S]*2026-11-06/);
    const inbox = (await (await fetch(api + '/inbox', { headers: auth })).json()).items; assert.equal(inbox.length, 2); assert.equal(inbox[0].kind, 'link'); assert.equal(inbox[1].title, 'Revise ROS 2 commands'); assert.equal(inbox[1].due, '2026-11-06'); assert.equal(inbox[1].source, 'telegram');
    assert.match(await createBridge({ api, botKey: process.env.NM_BOT_KEY })('tg:1', { voice: { bytes: Buffer.from('x'), mime: 'audio/ogg' } }, 'telegram'), /transcription key/);
    assert.match(await createBridge({ api, botKey: 'wrong-key-wrong-key-1' })('tg:1', { text: 'hello' }, 'telegram'), /did not accept/);
    // WhatsApp: signature, verify, messages
    const out = []; const wa = whatsapp({ appSecret: 'sec', verifyToken: 'vt', accessToken: 'AT', phoneId: 'PID', handle, fetchImpl: async (u, o) => { out.push([u, o?.body]); return { json: async () => ({}) }; } });
    assert.deepEqual(wa.verify(new URLSearchParams('hub.mode=subscribe&hub.verify_token=vt&hub.challenge=77')), [200, '77']); assert.equal(wa.verify(new URLSearchParams('hub.mode=subscribe&hub.verify_token=no&hub.challenge=77'))[0], 403);
    const raw = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: '919999', type: 'text', text: { body: 'hello wa' } }] } }] }] }); const sig = 'sha256=' + crypto.createHmac('sha256', 'sec').update(raw).digest('hex');
    assert.equal((await wa.onWebhook(raw, 'sha256=bad'))[0], 401); assert.equal((await wa.onWebhook(raw, undefined))[0], 401); assert.equal((await wa.onWebhook(raw, sig))[0], 200); assert.match(out.at(-1)[1], /not linked/);
    // audit: groups are refused, real HTTP webhook with signature, oversize body, wrong path
    const sent2 = []; const tg2 = telegram({ token: 'T', handle, fetchImpl: async (u, o) => { sent2.push(JSON.parse(o.body).text); return { json: async () => ({}) }; } }); await tg2.onUpdate({ update_id: 9, message: { chat: { id: -5, type: 'group' }, text: 'remind me to x tomorrow' } }); assert.match(sent2[0], /private chat/); assert.equal((await (await fetch(api + '/inbox', { headers: auth })).json()).items.length, 2, 'nothing was queued from the group');
    const hook = serveWhatsApp(wa, 0); await new Promise(r => hook.once('listening', r)); const hu = `http://127.0.0.1:${hook.address().port}/webhook`;
    try { assert.equal(await (await fetch(hu + '?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=abc')).text(), 'abc'); assert.equal((await fetch(hu + '?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=abc')).status, 403);
      assert.equal((await fetch(hu, { method: 'POST', body: raw, headers: { 'x-hub-signature-256': sig } })).status, 200); assert.equal((await fetch(hu, { method: 'POST', body: raw, headers: { 'x-hub-signature-256': 'sha256=00' } })).status, 401); assert.equal((await fetch(hu.replace('/webhook', '/x'))).status, 404); assert.equal((await fetch(hu, { method: 'PUT' })).status, 405);
      assert.equal((await fetch(hu, { method: 'POST', body: 'not json', headers: { 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', 'sec').update('not json').digest('hex') } })).status, 400); } finally { hook.close(); }
    assert.equal(parseDue('exam on thursday', NOW).due, '2026-11-12', 'same weekday means next week'); assert.equal(parseDue('exam on Friday evening', NOW).due, '2026-11-06');
  } finally { srv.close(); fs.rmSync(file, { force: true }); }
});
