/* Study rooms: share a deck and run a live quiz challenge with classmates, no server.
   The protocol is transport-agnostic. Transports: BroadcastChannel (other tabs on this device, works offline) and a WebRTC data
   channel set up by copying a short code between two devices on the same network (no signalling server). */
export type Msg =
  | { t: 'hello'; from: string; name: string }
  | { t: 'deck'; from: string; topic: string; cards: { front: string; back: string }[] }
  | { t: 'challenge'; from: string; id: string; topic: string; questions: { q: string; options: string[]; answer: number }[] }
  | { t: 'result'; from: string; name: string; id: string; score: number; n: number; ms: number };
export interface Transport { send(m: string): void; onMessage(fn: (m: string) => void): void; close(): void }

export interface Board { name: string; score: number; n: number; ms: number }
export class Room {
  me: string; name: string; peers = new Map<string, string>(); inbox: { topic: string; cards: { front: string; back: string }[]; from: string }[] = []; challenge: { id: string; topic: string; questions: Extract<Msg, { t: 'challenge' }>['questions']; from: string } | null = null; results: Record<string, Board> = {};
  private tr: Transport[] = []; onChange: () => void = () => {};
  constructor(name: string, id = Math.random().toString(36).slice(2, 10)) { this.name = name.trim().slice(0, 30) || 'Student'; this.me = id; }
  attach(t: Transport) { this.tr.push(t); t.onMessage(raw => this.recv(raw)); const hi = () => this.send({ t: 'hello', from: this.me, name: this.name }); hi(); setTimeout(hi, 800); }
  private send(m: Msg) { const s = JSON.stringify(m); for (const t of this.tr) { try { t.send(s); } catch { /* peer gone */ } } }
  private recv(raw: string) {
    let m: Msg; try { m = JSON.parse(raw); } catch { return; } if (!m || typeof m !== 'object' || (m as { from?: string }).from === this.me) return;
    if (m.t === 'hello') { const isNew = !this.peers.has(m.from); this.peers.set(m.from, String(m.name).slice(0, 30)); if (isNew) this.send({ t: 'hello', from: this.me, name: this.name }); }
    else if (m.t === 'deck') { if (!Array.isArray(m.cards) || m.cards.length > 300) return; this.inbox.push({ topic: String(m.topic).slice(0, 60), from: this.peers.get(m.from) ?? 'someone', cards: m.cards.filter(c => c && typeof c.front === 'string' && typeof c.back === 'string').map(c => ({ front: c.front.slice(0, 400), back: c.back.slice(0, 400) })) }); }
    else if (m.t === 'challenge') { if (!Array.isArray(m.questions) || m.questions.length > 30) return; const qs = m.questions.filter(q => q && typeof q.q === 'string' && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length).map(q => ({ q: q.q.slice(0, 300), options: q.options.slice(0, 6).map(o => String(o).slice(0, 200)), answer: q.answer })); if (qs.length) { this.challenge = { id: String(m.id).slice(0, 20), topic: String(m.topic).slice(0, 60), questions: qs, from: this.peers.get(m.from) ?? 'someone' }; this.results = {}; } }
    else if (m.t === 'result') { if (this.challenge && m.id === this.challenge.id && Number.isFinite(m.score) && Number.isFinite(m.n) && m.n > 0 && m.score >= 0 && m.score <= m.n) this.results[m.from] = { name: String(m.name).slice(0, 30), score: m.score | 0, n: m.n | 0, ms: Math.max(0, m.ms | 0) }; }
    this.onChange();
  }
  shareDeck(topic: string, cards: { front: string; back: string }[]) { this.send({ t: 'deck', from: this.me, topic, cards: cards.slice(0, 300) }); }
  startChallenge(topic: string, questions: Extract<Msg, { t: 'challenge' }>['questions']) { const id = Math.random().toString(36).slice(2, 8); this.challenge = { id, topic, questions, from: 'you' }; this.results = {}; this.send({ t: 'challenge', from: this.me, id, topic, questions }); this.onChange(); }
  submit(score: number, n: number, ms: number) { if (!this.challenge) return; this.results[this.me] = { name: this.name, score, n, ms }; this.send({ t: 'result', from: this.me, name: this.name, id: this.challenge.id, score, n, ms }); this.onChange(); }
  leaderboard(): Board[] { return Object.values(this.results).sort((a, b) => b.score - a.score || a.ms - b.ms); }
  close() { for (const t of this.tr) t.close(); this.tr = []; }
}
export const broadcastTransport = (room: string): Transport | null => { if (typeof BroadcastChannel === 'undefined') return null; const ch = new BroadcastChannel('nm-room-' + room.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24)); return { send: m => ch.postMessage(m), onMessage: fn => { ch.onmessage = e => { if (typeof e.data === 'string') fn(e.data); }; }, close: () => ch.close() }; };

/* ---- WebRTC with manual code exchange (same network, no server) ---- */
const enc = (o: unknown) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))); const dec = (s: string) => JSON.parse(decodeURIComponent(escape(atob(s.trim()))));
function wrap(dc: RTCDataChannel): Transport { let fn: (m: string) => void = () => {}; dc.onmessage = e => { if (typeof e.data === 'string') fn(e.data); }; return { send: m => { if (dc.readyState === 'open') dc.send(m); }, onMessage: f => { fn = f; }, close: () => dc.close() }; }
const waitIce = (pc: RTCPeerConnection) => new Promise<void>(res => { if (pc.iceGatheringState === 'complete') return res(); const t = setTimeout(res, 2500); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });
export class P2P {
  pc: RTCPeerConnection; private dc: RTCDataChannel | null = null; ready: Promise<Transport>; private resolve!: (t: Transport) => void;
  constructor() { this.pc = new RTCPeerConnection({ iceServers: [] }); this.ready = new Promise(r => { this.resolve = r; }); this.pc.ondatachannel = e => { this.dc = e.channel; this.dc.onopen = () => this.resolve(wrap(this.dc!)); }; }
  /** Host step 1: returns the invitation code to give to the other device. */
  async invite(): Promise<string> { this.dc = this.pc.createDataChannel('room'); this.dc.onopen = () => this.resolve(wrap(this.dc!)); await this.pc.setLocalDescription(await this.pc.createOffer()); await waitIce(this.pc); return enc(this.pc.localDescription); }
  /** Guest: paste the invitation, get the reply code. */
  async accept(code: string): Promise<string> { await this.pc.setRemoteDescription(dec(code)); await this.pc.setLocalDescription(await this.pc.createAnswer()); await waitIce(this.pc); return enc(this.pc.localDescription); }
  /** Host step 2: paste the guest’s reply. */
  async finish(code: string) { await this.pc.setRemoteDescription(dec(code)); }
}
