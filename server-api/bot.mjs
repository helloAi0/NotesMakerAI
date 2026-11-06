// Companion bot for Telegram (long polling) and WhatsApp Cloud API (webhook).
// Students forward YouTube links, type "remind me to revise ROS 2 commands tomorrow" or send a voice note; the bot turns each into an inbox item
// on the Notes Maker server, and the app pulls the inbox into the planner / library. The bot never sees notes, only what is sent to it.
// Run:  NM_API=https://your-server NM_BOT_KEY=... TELEGRAM_TOKEN=... node bot.mjs          (Telegram)
// WhatsApp needs a Meta Business account; see README. Both are UNTESTED against the real services in this repo (tests use fakes).
import crypto from 'node:crypto';
import http from 'node:http';
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']; const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function parseDue(text, now = new Date()) {
  const t = text.toLowerCase(); const base = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const add = n => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
  let m, due = null, rx = null;
  if ((m = t.match(/\bday after tomorrow\b/))) { due = add(2); rx = m[0]; } else if ((m = t.match(/\b(tomorrow|tmrw|tmr)\b/))) { due = add(1); rx = m[0]; } else if ((m = t.match(/\b(today|tonight)\b/))) { due = add(0); rx = m[0]; }
  else if ((m = t.match(/\bin (\d{1,2}) (day|days|week|weeks)\b/))) { due = add(+m[1] * (m[2].startsWith('w') ? 7 : 1)); rx = m[0]; }
  else if ((m = t.match(/\b(?:on |by |this |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/))) { const w = DAYS.indexOf(m[1]); let n = (w - base.getDay() + 7) % 7; if (n === 0) n = 7; /* the same weekday means next week */ due = add(n); rx = m[0]; }
  else if ((m = t.match(/\b(?:on |by )?(\d{1,2})(?:st|nd|rd|th)? (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/))) { let d = new Date(base.getFullYear(), MON.indexOf(m[2]), +m[1]); if (d < base) d = new Date(base.getFullYear() + 1, MON.indexOf(m[2]), +m[1]); due = d; rx = m[0]; }
  return due ? { due: iso(due), rest: text.replace(new RegExp(rx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ').replace(/\s+/g, ' ').trim() } : { due: '', rest: text.trim() };
}
const YT = /(https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)[\w-]{11}[^\s]*)/i;
/** one chat message -> { items, reply } */
export function parseMessage(raw, now = new Date()) {
  const text = String(raw ?? '').trim(); if (!text) return { items: [], reply: 'Send me a YouTube link, a note, or “remind me to … tomorrow”.' };
  const items = []; const yt = text.match(YT);
  if (yt) { const note = text.replace(yt[0], '').trim(); items.push({ kind: 'link', url: yt[0], title: note || 'YouTube lecture', text: 'Make notes from this lecture (Lecture to Notes).' }); return { items, reply: 'Saved the video. Open Lecture to Notes in the app to turn it into notes, cards and a quiz.' }; }
  const rem = text.match(/^\s*(?:please\s+)?(?:remind me|reminder|remember|set a reminder|add task|todo|to-?do)\s*(?:to|that|about|:)?\s*(.+)$/i);
  if (rem) { const { due, rest } = parseDue(rem[1], now); const title = rest.replace(/^(to|that)(\s+|$)/i, '').replace(/[\s,.-]+$/, ''); if (!title) return { items: [], reply: 'What should I remind you about?' }; items.push({ kind: 'task', title: title[0].toUpperCase() + title.slice(1), due }); return { items, reply: due ? `Added “${title}” for ${due}. It will show in your planner.` : `Added “${title}”. (No date found: say “tomorrow”, “friday” or “12 nov” to set one.)` }; }
  const u = text.match(/https?:\/\/\S+/); if (u) { items.push({ kind: 'link', url: u[0], title: text.replace(u[0], '').trim() || u[0], text: '' }); return { items, reply: 'Saved the link to your library inbox.' }; }
  items.push({ kind: 'note', title: text.slice(0, 80), text }); return { items, reply: 'Saved as a note in your workspace inbox.' };
}
/* ---------- bridge to the Notes Maker server ---------- */
export function createBridge({ api, botKey, fetchImpl = fetch, transcribe = null, now = () => new Date() }) {
  const post = async (path, body) => { const r = await fetchImpl(api + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bot-key': botKey }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, j }; };
  /** chat: 'tg:123' | 'wa:9198...'; msg: { text?, voice?: {bytes, mime} } ; returns the reply text */
  return async function handle(chat, msg, source) {
    let text = msg.text ?? '';
    if (msg.voice) { if (!transcribe) return 'Voice notes need a transcription key on the bot (NM_GEMINI_KEY). Please type it for now.'; try { text = await transcribe(msg.voice); } catch { return 'I could not transcribe that voice note. Please try again or type it.'; } if (!text.trim()) return 'I could not hear anything in that voice note.'; }
    const link = text.trim().match(/^\/?(?:start|link)\s+([0-9a-f]{6})$/i);
    if (link) { const r = await post('/bot/claim', { code: link[1], chat }); return r.ok ? 'Linked! Anything you send here now appears in your Notes Maker inbox.' : (r.j.error || 'Linking failed.'); }
    if (/^\/?(start|help)$/i.test(text.trim())) return 'To link: in the app open Platform → Bot, press “Get link code”, and send me: /link CODE';
    const { items, reply } = parseMessage(text, now()); if (!items.length) return reply;
    const r = await post('/bot/push', { chat, source, items });
    if (r.status === 404) return 'This chat is not linked yet. In the app open Platform → Bot, press “Get link code”, then send /link CODE here.';
    if (!r.ok) return 'The study server did not accept that (' + r.status + '). Try again in a minute.';
    return (msg.voice ? `Heard: “${text.trim().slice(0, 120)}”\n` : '') + reply;
  };
}
/* ---------- Telegram ---------- */
export function telegram({ token, handle, fetchImpl = fetch, transcribe }) {
  const base = `https://api.telegram.org/bot${token}`; const call = async (m, b) => (await (await fetchImpl(`${base}/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json());
  const download = async (fileId) => { const f = await call('getFile', { file_id: fileId }); const r = await fetchImpl(`https://api.telegram.org/file/bot${token}/${f.result.file_path}`); return Buffer.from(await r.arrayBuffer()); };
  async function onUpdate(u) {
    const m = u.message; if (!m) return; if (m.chat.type && m.chat.type !== 'private') { await call('sendMessage', { chat_id: m.chat.id, text: 'For your privacy I only work in a private chat with you. Message me directly.' }); return; }
    const chat = 'tg:' + m.chat.id; let msg = { text: m.text ?? m.caption ?? '' };
    if (m.voice || m.audio) { const v = m.voice ?? m.audio; try { msg = { voice: { bytes: await download(v.file_id), mime: v.mime_type || 'audio/ogg' } }; } catch { /* handled below */ } }
    const reply = await handle(chat, msg, 'telegram'); await call('sendMessage', { chat_id: m.chat.id, text: reply });
  }
  async function run(signal) { let offset = 0; while (!signal?.aborted) { try { const r = await call('getUpdates', { offset, timeout: 30 }); for (const u of r.result ?? []) { offset = u.update_id + 1; await onUpdate(u).catch(e => console.error('update failed', e.message)); } } catch (e) { console.error('poll failed', e.message); await new Promise(r => setTimeout(r, 5000)); } } }
  return { onUpdate, run };
}
/* ---------- WhatsApp Cloud API ---------- */
export function whatsapp({ appSecret, verifyToken, accessToken, phoneId, handle, fetchImpl = fetch }) {
  const sigOk = (raw, header) => { if (!appSecret) return false; const want = 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw).digest('hex'); return typeof header === 'string' && header.length === want.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(want)); };
  const verify = q => (q.get('hub.mode') === 'subscribe' && verifyToken && q.get('hub.verify_token') === verifyToken ? [200, q.get('hub.challenge')] : [403, 'forbidden']);
  async function onWebhook(raw, sigHeader) {
    if (!sigOk(raw, sigHeader)) return [401, 'bad signature']; let p; try { p = JSON.parse(raw); } catch { return [400, 'bad json']; }
    for (const e of p.entry ?? []) for (const c of e.changes ?? []) for (const m of c.value?.messages ?? []) {
      let msg = null; if (m.type === 'text') msg = { text: m.text?.body ?? '' };
      else if (m.type === 'audio') { try { const meta = await (await fetchImpl(`https://graph.facebook.com/v20.0/${m.audio.id}`, { headers: { authorization: `Bearer ${accessToken}` } })).json(); const bin = await fetchImpl(meta.url, { headers: { authorization: `Bearer ${accessToken}` } }); msg = { voice: { bytes: Buffer.from(await bin.arrayBuffer()), mime: m.audio.mime_type || 'audio/ogg' } }; } catch { msg = { text: '' }; } }
      if (!msg) continue; const reply = await handle('wa:' + m.from, msg, 'whatsapp');
      await fetchImpl(`https://graph.facebook.com/v20.0/${phoneId}/messages`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ messaging_product: 'whatsapp', to: m.from, type: 'text', text: { body: reply } }) });
    }
    return [200, 'ok'];
  }
  return { verify, onWebhook, sigOk };
}
/** minimal HTTP server for the WhatsApp Cloud API webhook: GET = Meta's verification handshake, POST = messages (HMAC-signed by Meta) */
export function serveWhatsApp(wa, port = 8788) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x'); const done = (c, b) => { res.writeHead(c, { 'content-type': 'text/plain' }); res.end(b); };
    if (url.pathname !== '/webhook') return done(404, 'not found'); if (req.method === 'GET') { const [c, b] = wa.verify(url.searchParams); return done(c, b); }
    if (req.method !== 'POST') return done(405, 'method');
    const chunks = []; let size = 0; for await (const c of req) { size += c.length; if (size > 1_000_000) { req.destroy(); return; } chunks.push(c); }
    try { const [c, b] = await wa.onWebhook(Buffer.concat(chunks).toString('utf8'), req.headers['x-hub-signature-256']); done(c, b); } catch (e) { console.error('webhook failed', e.message); done(500, 'error'); }
  }).listen(port);
}
/** Gemini audio transcription (optional) */
export const geminiTranscriber = (key, fetchImpl = fetch) => async ({ bytes, mime }) => { const r = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ parts: [{ text: 'Transcribe this voice note exactly. Return only the words spoken.' }, { inline_data: { mime_type: mime, data: Buffer.from(bytes).toString('base64') } }] }] }) }); if (!r.ok) throw new Error('transcribe ' + r.status); const j = await r.json(); return String(j?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim(); };

// `node bot.mjs --check` verifies every real connection in a minute, without sending any message to anyone.
export async function doctor(env, fetchImpl = fetch) {
  const out = []; const add = (name, ok, detail) => out.push({ name, ok, detail });
  const jget = async (url, init) => { try { const r = await fetchImpl(url, init); return { s: r.status, j: await r.json().catch(() => ({})) }; } catch (e) { return { s: 0, j: {}, err: String(e?.message || e).slice(0, 80) }; } };
  const api = String(env.NM_API || '').replace(/\/+$/, '');
  if (!api) add('Notes Maker server', false, 'NM_API is not set.'); else { const r = await jget(api + '/market/config'); add('Notes Maker server', r.s === 200, r.s === 200 ? `reachable (online payments ${r.j.gateway ? 'ON' : 'off'})` : `cannot reach ${api} (${r.err || 'HTTP ' + r.s})`); }
  if (!env.NM_BOT_KEY || env.NM_BOT_KEY.length < 16) add('Bot key', false, 'NM_BOT_KEY must be at least 16 characters and match the server.');
  else if (api) { const r = await jget(api + '/bot/push', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bot-key': env.NM_BOT_KEY }, body: JSON.stringify({ chat: 'doctor-check', items: [] }) }); add('Bot key', r.s === 404, r.s === 404 ? 'accepted by the server' : r.s === 401 ? 'REJECTED: the key differs from the server NM_BOT_KEY' : `unexpected answer (HTTP ${r.s})`); }
  if (env.TELEGRAM_TOKEN) {
    const me = await jget(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/getMe`); add('Telegram token', !!me.j.ok, me.j.ok ? `bot @${me.j.result?.username}` : 'Telegram rejected the token (check it with @BotFather).');
    if (me.j.ok) { const w = await jget(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/getWebhookInfo`); const has = !!w.j.result?.url; add('Telegram polling', !has, has ? 'a webhook is set on this bot, which blocks polling. Remove it with deleteWebhook.' : 'no webhook set (polling will work)'); }
  } else add('Telegram', true, 'skipped (TELEGRAM_TOKEN not set)');
  if (env.WA_TOKEN && env.WA_PHONE_ID) { const w = await jget(`https://graph.facebook.com/v20.0/${encodeURIComponent(env.WA_PHONE_ID)}?fields=display_phone_number,verified_name`, { headers: { authorization: 'Bearer ' + env.WA_TOKEN } }); add('WhatsApp number', w.s === 200 && !!w.j.id, w.s === 200 ? `${w.j.display_phone_number || w.j.id}` : 'Meta rejected the token or phone number id.'); if (!env.WA_APP_SECRET || !env.WA_VERIFY_TOKEN) add('WhatsApp webhook secrets', false, 'WA_APP_SECRET and WA_VERIFY_TOKEN are required.'); }
  else add('WhatsApp', true, 'skipped (WA_TOKEN / WA_PHONE_ID not set)');
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--check')) { const r = await doctor(process.env); for (const x of r) console.log((x.ok ? 'OK   ' : 'FAIL ') + x.name + ': ' + x.detail); process.exit(r.every(x => x.ok) ? 0 : 1); }
  const { NM_API, NM_BOT_KEY, TELEGRAM_TOKEN, NM_GEMINI_KEY, WA_APP_SECRET, WA_VERIFY_TOKEN, WA_TOKEN, WA_PHONE_ID, WA_PORT } = process.env; const wantWa = WA_APP_SECRET && WA_VERIFY_TOKEN && WA_TOKEN && WA_PHONE_ID;
  if (!NM_API || !NM_BOT_KEY || (!TELEGRAM_TOKEN && !wantWa)) { console.error('Set NM_API, NM_BOT_KEY and TELEGRAM_TOKEN (and/or WA_APP_SECRET, WA_VERIFY_TOKEN, WA_TOKEN, WA_PHONE_ID).'); process.exit(1); }
  const handle = createBridge({ api: NM_API, botKey: NM_BOT_KEY, transcribe: NM_GEMINI_KEY ? geminiTranscriber(NM_GEMINI_KEY) : null });
  if (wantWa) { serveWhatsApp(whatsapp({ appSecret: WA_APP_SECRET, verifyToken: WA_VERIFY_TOKEN, accessToken: WA_TOKEN, phoneId: WA_PHONE_ID, handle }), Number(WA_PORT || 8788)); console.log('WhatsApp webhook on /webhook (put HTTPS in front of it)'); }
  if (TELEGRAM_TOKEN) { console.log('Telegram bot running'); telegram({ token: TELEGRAM_TOKEN, handle }).run(); }
}
