// Notes Maker AI — reference accounts server. Zero dependencies (Node 20+).
// Accounts (scrypt), signed bearer tokens, roles, classes with join codes, student progress reports to a class, and encrypted-blob sync.
// It is a REFERENCE implementation: JSON-file storage, no TLS (put it behind a TLS proxy), basic rate limiting. Read README.md before deploying.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MAX_BODY = 2_000_000, TOKEN_TTL = 7 * 24 * 3600 * 1000;
export function createServer({ dataFile = './data.json', secret = process.env.NM_SECRET || '', allowOrigin = process.env.NM_ORIGIN || '', now = () => Date.now() } = {}) {
  if (!secret || secret.length < 16) throw new Error('Set NM_SECRET to a random string of at least 16 characters.');
  let db = { users: {}, classes: {}, reports: {}, blobs: {}, listings: {}, purchases: {}, inbox: {}, links: {}, chats: {} };
  try { db = { ...db, ...JSON.parse(fs.readFileSync(dataFile, 'utf8')) }; } catch { /* new database */ }
  const save = () => { fs.mkdirSync(path.dirname(path.resolve(dataFile)), { recursive: true }); const tmp = dataFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, dataFile); };
  const hits = new Map(); const limited = (key, max, ms) => { const t = now(); const a = (hits.get(key) ?? []).filter(x => t - x < ms); a.push(t); hits.set(key, a); return a.length > max; };
  const b64u = b => Buffer.from(b).toString('base64url');
  const sign = (p) => { const body = b64u(JSON.stringify(p)); return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`; };
  const verify = (tok) => { const [body, sig] = String(tok || '').split('.'); if (!body || !sig) return null; const ok = crypto.createHmac('sha256', secret).update(body).digest('base64url'); if (sig.length !== ok.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(ok))) return null; try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > now() ? p : null; } catch { return null; } };
  const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
  const clean = (s, n) => String(s ?? '').replace(/[<>]/g, '').trim().slice(0, n);

  const routes = {
    'POST /register': (b) => {
      const email = clean(b.email, 120).toLowerCase(), pw = String(b.password ?? ''), role = b.role === 'teacher' ? 'teacher' : 'student';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return [400, { error: 'Enter a valid email.' }]; if (pw.length < 8) return [400, { error: 'Password must be at least 8 characters.' }]; if (db.users[email]) return [409, { error: 'That email is already registered.' }];
      const salt = crypto.randomBytes(16).toString('hex'); db.users[email] = { email, name: clean(b.name, 60) || email.split('@')[0], role, salt, hash: hash(pw, salt), created: now() }; save();
      return [201, { token: sign({ sub: email, role, exp: now() + TOKEN_TTL }), user: pub(db.users[email]) }];
    },
    'POST /login': (b, _u, ip) => {
      if (limited('login:' + ip, 10, 60_000)) return [429, { error: 'Too many attempts. Wait a minute.' }]; const u = db.users[clean(b.email, 120).toLowerCase()]; const pw = String(b.password ?? '');
      const ok = u && crypto.timingSafeEqual(Buffer.from(hash(pw, u.salt)), Buffer.from(u.hash)); if (!ok) return [401, { error: 'Wrong email or password.' }];
      return [200, { token: sign({ sub: u.email, role: u.role, exp: now() + TOKEN_TTL }), user: pub(u) }];
    },
    'GET /me': (_b, u) => [200, { user: pub(u) }],
    'POST /classes': (b, u) => { if (u.role !== 'teacher') return [403, { error: 'Only teachers can create classes.' }]; const code = crypto.randomBytes(3).toString('hex').toUpperCase(); db.classes[code] = { code, name: clean(b.name, 80) || 'Class', teacher: u.email, students: [], created: now() }; save(); return [201, { class: db.classes[code] }]; },
    'GET /classes': (_b, u) => [200, { classes: Object.values(db.classes).filter(c => (u.role === 'teacher' ? c.teacher === u.email : c.students.includes(u.email))) }],
    'POST /classes/join': (b, u) => { const c = db.classes[clean(b.code, 10).toUpperCase()]; if (!c) return [404, { error: 'No class with that code.' }]; if (u.role !== 'student') return [403, { error: 'Only students can join a class.' }]; if (!c.students.includes(u.email)) c.students.push(u.email); save(); return [200, { class: { code: c.code, name: c.name } }]; },
    'POST /classes/report': (b, u) => { const c = db.classes[clean(b.code, 10).toUpperCase()]; if (!c || !c.students.includes(u.email)) return [403, { error: 'Join the class first.' }]; const r = b.report; if (!r || r.kind !== 'nm-report' || !Array.isArray(r.topics)) return [400, { error: 'Not a progress report.' }]; (db.reports[c.code] ??= {})[u.email] = { ...r, student: u.name, receivedAt: now() }; save(); return [200, { ok: true }]; },
    'GET /classes/dashboard': (_b, u, _ip, q) => { const c = db.classes[clean(q.get('code'), 10).toUpperCase()]; if (!c || c.teacher !== u.email) return [403, { error: 'Not your class.' }]; return [200, { class: { code: c.code, name: c.name, students: c.students.length }, reports: Object.values(db.reports[c.code] ?? {}) }]; },
    'PUT /sync': (b, u) => { if (typeof b.blob !== 'string' || b.blob.length > 1_500_000) return [400, { error: 'Send {blob: "<encrypted string>"} under 1.5 MB.' }]; db.blobs[u.email] = { blob: b.blob, at: now() }; save(); return [200, { at: db.blobs[u.email].at }]; },
    'GET /sync': (_b, u) => [200, db.blobs[u.email] ?? { blob: null, at: 0 }],
    'DELETE /me': (_b, u) => { for (const [k, l] of Object.entries(db.listings)) if (l.author === u.email) delete db.listings[k]; delete db.inbox[u.email]; for (const [k, v] of Object.entries(db.chats)) if (v === u.email) delete db.chats[k]; delete db.users[u.email]; delete db.blobs[u.email]; for (const r of Object.values(db.reports)) delete r[u.email]; for (const c of Object.values(db.classes)) c.students = c.students.filter(s => s !== u.email); if (u.role === 'teacher') for (const k of Object.keys(db.classes)) if (db.classes[k].teacher === u.email) { delete db.classes[k]; delete db.reports[k]; } save(); return [200, { deleted: true }]; },
    /* ---------- notes marketplace (UPI direct to the creator; the server never touches money) ---------- */
    'GET /market/listings': (_b, _u, _ip, q) => { const subj = clean(q.get('subject'), 40).toLowerCase(), term = clean(q.get('q'), 60).toLowerCase(); return [200, { listings: Object.values(db.listings).filter(l => !l.hidden && (!subj || l.subject.toLowerCase() === subj) && (!term || (l.title + ' ' + l.subject).toLowerCase().includes(term))).sort((a, b) => b.created - a.created).slice(0, 100).map(l => ({ ...lpub(l), sales: confirmedSales(l.id) })) }]; },
    'POST /market/listings': (b, u) => {
      if (limited('list:' + u.email, 10, 3_600_000)) return [429, { error: 'Too many listings this hour.' }]; const price = Math.round(Number(b.price) || 0); const title = clean(b.title, 90), body = String(b.body ?? '').slice(0, 400_000);
      if (title.length < 4) return [400, { error: 'Give the notes a title of at least 4 characters.' }]; if (body.length < 200) return [400, { error: 'Notes are too short to sell or share (min 200 characters).' }];
      if (price !== 0 && (price < 5 || price > 500)) return [400, { error: 'Price must be free (0) or between ₹5 and ₹500.' }];
      const upi = clean(b.upi, 80); if (price > 0 && !/^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z]{2,32}$/.test(upi)) return [400, { error: 'Enter a valid UPI ID like name@bank to receive payments.' }];
      const id = crypto.randomBytes(5).toString('hex'); db.listings[id] = { id, title, subject: clean(b.subject, 40) || 'General', board: clean(b.board, 20), lang: clean(b.lang, 6) || 'en', price, upi: price ? upi : '', author: u.email, authorName: u.name, preview: body.slice(0, 400), body, created: now(), hidden: false, reports: [] }; save(); return [201, { listing: lpub(db.listings[id]) }];
    },
    'GET /market/listing': (_b, u, _ip, q) => { const l = db.listings[clean(q.get('id'), 20)]; if (!l || l.hidden) return [404, { error: 'Not found.' }]; if (l.price === 0 || l.author === u.email || hasPaid(l.id, u.email)) return [200, { listing: { ...lpub(l), body: l.body }, unlocked: true }]; return [200, { listing: lpub(l), unlocked: false, pay: { upi: l.upi, amount: l.price, note: 'Pay in your UPI app, then send the 12-digit UTR. The creator confirms and the notes unlock.' } }]; },
    'POST /market/purchase': (b, u) => {
      const l = db.listings[clean(b.id, 20)]; if (!l || l.hidden || l.price === 0) return [404, { error: 'Not a paid listing.' }]; if (l.author === u.email) return [400, { error: 'These are your own notes.' }]; const utr = String(b.utr ?? '').trim(); if (!/^\d{12}$/.test(utr)) return [400, { error: 'A UPI reference (UTR) is 12 digits.' }];
      if (Object.values(db.purchases).some(p => p.utr === utr)) return [409, { error: 'That UTR was already used.' }]; if (hasPaid(l.id, u.email) || Object.values(db.purchases).some(p => p.listing === l.id && p.buyer === u.email && p.status === 'pending')) return [409, { error: 'You already have a purchase for this.' }];
      const id = crypto.randomBytes(5).toString('hex'); db.purchases[id] = { id, listing: l.id, buyer: u.email, buyerName: u.name, utr, amount: l.price, status: 'pending', created: now() }; save(); return [201, { purchase: db.purchases[id], message: 'Sent to the creator for confirmation.' }]; },
    'POST /market/confirm': (b, u) => { const p = db.purchases[clean(b.purchase, 20)]; const l = p && db.listings[p.listing]; if (!p || l.author !== u.email) return [403, { error: 'Not your sale.' }]; p.status = b.accept === false ? 'rejected' : 'confirmed'; p.decided = now(); save(); return [200, { purchase: p }]; },
    'GET /market/mine': (_b, u) => { const mine = Object.values(db.listings).filter(l => l.author === u.email); const ids = new Set(mine.map(l => l.id)); return [200, { listings: mine.map(l => ({ ...lpub(l), sales: confirmedSales(l.id) })), incoming: Object.values(db.purchases).filter(p => ids.has(p.listing)), bought: Object.values(db.purchases).filter(p => p.buyer === u.email).map(p => ({ ...p, title: db.listings[p.listing]?.title })) }]; },
    'POST /market/report': (b, u) => { const l = db.listings[clean(b.id, 20)]; if (!l) return [404, { error: 'Not found.' }]; if (!l.reports.includes(u.email)) l.reports.push(u.email); if (l.reports.length >= 3) l.hidden = true; save(); return [200, { ok: true, hidden: l.hidden }]; },
    'POST /market/unlist': (b, u) => { const l = db.listings[clean(b.id, 20)]; if (!l || l.author !== u.email) return [403, { error: 'Not yours.' }]; l.hidden = true; save(); return [200, { ok: true }]; },
    /* ---------- bot inbox: Telegram / WhatsApp messages land here, the app pulls them ---------- */
    'POST /bot/link': (_b, u) => { const code = crypto.randomBytes(3).toString('hex').toUpperCase(); db.links[code] = { email: u.email, exp: now() + 600_000 }; save(); return [201, { code, expiresInSec: 600 }]; },
    'POST /bot/claim': (b, _u, ip, _q, h) => { if (!botOk(h)) return [401, { error: 'Bad bot key.' }]; if (limited('claim:' + ip, 30, 60_000)) return [429, { error: 'Slow down.' }]; const l = db.links[clean(b.code, 10).toUpperCase()]; if (!l || l.exp < now()) return [404, { error: 'That code is wrong or expired. Make a new one in the app.' }]; db.chats[clean(b.chat, 60)] = l.email; delete db.links[clean(b.code, 10).toUpperCase()]; save(); return [200, { ok: true }]; },
    'POST /bot/push': (b, _u, _ip, _q, h) => { if (!botOk(h)) return [401, { error: 'Bad bot key.' }]; const email = db.chats[clean(b.chat, 60)]; if (!email) return [404, { error: 'This chat is not linked.' }]; const box = (db.inbox[email] ??= []); const items = (Array.isArray(b.items) ? b.items : []).slice(0, 10); for (const it of items) { const kind = ['task', 'link', 'note'].includes(it.kind) ? it.kind : 'note'; box.push({ id: crypto.randomBytes(4).toString('hex'), kind, title: clean(it.title, 200), due: /^\d{4}-\d{2}-\d{2}$/.test(it.due || '') ? it.due : '', url: /^https?:\/\//.test(it.url || '') ? clean(it.url, 300) : '', text: clean(it.text, 2000), source: clean(b.source, 20) || 'bot', t: now() }); } if (box.length > 200) box.splice(0, box.length - 200); save(); return [200, { ok: true, queued: items.length }]; },
    'GET /inbox': (_b, u) => [200, { items: db.inbox[u.email] ?? [] }],
    'POST /inbox/ack': (b, u) => { const ids = new Set(Array.isArray(b.ids) ? b.ids.map(String) : []); db.inbox[u.email] = (db.inbox[u.email] ?? []).filter(i => !ids.has(i.id)); save(); return [200, { ok: true }]; },
  };
  const lpub = l => ({ id: l.id, title: l.title, subject: l.subject, board: l.board, lang: l.lang, price: l.price, authorName: l.authorName, preview: l.preview, created: l.created, chars: l.body.length });
  const hasPaid = (id, email) => Object.values(db.purchases).some(p => p.listing === id && p.buyer === email && p.status === 'confirmed');
  const confirmedSales = id => Object.values(db.purchases).filter(p => p.listing === id && p.status === 'confirmed').length;
  const botOk = h => { const k = process.env.NM_BOT_KEY || ''; const got = String(h['x-bot-key'] || ''); return k.length >= 16 && got.length === k.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(k)); };
  const pub = u => ({ email: u.email, name: u.name, role: u.role });
  const PUBLIC = new Set(['POST /register', 'POST /login', 'GET /market/listings', 'POST /bot/claim', 'POST /bot/push']);
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin; const send = (code, obj) => { const h = { 'content-type': 'application/json', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' }; if (allowOrigin && origin === allowOrigin) { h['access-control-allow-origin'] = origin; h['vary'] = 'origin'; h['access-control-allow-headers'] = 'authorization,content-type'; h['access-control-allow-methods'] = 'GET,POST,PUT,DELETE'; } res.writeHead(code, h); res.end(JSON.stringify(obj)); };
    try {
      if (req.method === 'OPTIONS') return send(204, {}); const url = new URL(req.url, 'http://x'); const key = `${req.method} ${url.pathname}`; const fn = routes[key]; if (!fn) return send(404, { error: 'Not found.' });
      let body = {}; if (req.method === 'POST' || req.method === 'PUT') { const chunks = []; let n = 0; for await (const c of req) { n += c.length; if (n > MAX_BODY) { const sock = req.socket; res.on('finish', () => sock && sock.destroy()); res.writeHead(413, { 'content-type': 'application/json', connection: 'close' }); return res.end(JSON.stringify({ error: 'Request too large.' })); } chunks.push(c); } try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return send(400, { error: 'Invalid JSON.' }); } }
      let user = null; if (!PUBLIC.has(key)) { const p = verify((req.headers.authorization || '').replace(/^Bearer\s+/i, '')); user = p && db.users[p.sub]; if (!user) return send(401, { error: 'Sign in first.' }); }
      const [code, out] = fn(body, user, req.socket.remoteAddress || 'x', url.searchParams, req.headers); send(code, out);
    } catch (e) { send(500, { error: 'Server error.' }); console.error(e); }
  });
  return server;
}
if (import.meta.url === `file://${process.argv[1]}`) { const port = Number(process.env.PORT || 8787); createServer({ dataFile: process.env.NM_DATA || './data.json' }).listen(port, () => console.log(`Notes Maker accounts server on :${port}`)); }
