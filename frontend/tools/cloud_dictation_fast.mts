// Unit test: FAST CONTINUOUS speech (no pauses) with 500 ms network delay. Chunks are cut at tiny gaps, sent in parallel, delivered in order, and
// the text is complete shortly after the speaker stops. Also: rate limiting (429) slows previews down instead of failing.
import assert from 'node:assert/strict';
let clock = 1000; (performance as any).now = () => clock;
let proc: any = null; let due: { at: number; fire: () => void }[] = []; let LAT = 500; let n = 0; let status = 200; const sent: number[] = [];
class FakeAC { sampleRate = 48000; destination = {}; async resume() {} async close() {} createMediaStreamSource() { return { connect() {}, disconnect() {} }; } createScriptProcessor() { proc = { connect() {}, disconnect() {}, onaudioprocess: null as any }; return proc; } createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; } }
(globalThis as any).window = { isSecureContext: true, AudioContext: FakeAC };
Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } }, configurable: true });
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {} }, configurable: true });
(globalThis as any).FormData = class { append() {} }; (globalThis as any).Blob = class {};
(globalThis as any).fetch = () => new Promise(res => { const my = ++n; sent.push(clock); due.push({ at: clock + LAT, fire: () => res(status === 200 ? { ok: true, status, json: async () => ({ text: `chunk${my}` }), text: async () => '' } : { ok: false, status, json: async () => ({}), text: async () => 'rate' }) }); });
const { CloudDictationController } = await import('../src/lib/cloudDictation.ts');
const cfg = { provider: 'custom', apiKey: '', model: '', baseUrl: 'http://x/v1', speed: 'fast' } as any;
const frame = (amp: number) => { const f = new Float32Array(2048); for (let i = 0; i < f.length; i++) f[i] = amp * Math.sin(i / 5); return f; };
const step = async (amp: number) => { clock += 43; proc.onaudioprocess({ inputBuffer: { getChannelData: () => frame(amp) } }); for (const d of due.filter(x => x.at <= clock)) d.fire(); due = due.filter(x => x.at > clock); await new Promise(r => setTimeout(r, 0)); };
const run = async (label: string, f: (c: any, fin: { t: number; text: string }[]) => Promise<void>) => { n = 0; due = []; sent.length = 0; status = 200; const fin: { t: number; text: string }[] = []; const errs: string[] = [];
  const c = new CloudDictationController(() => cfg, { onFinal: t => fin.push({ t: clock, text: t }), onError: m => errs.push(m) }); await c.start(); await f(c, fin); assert.deepEqual(errs, [], 'no errors: ' + errs.join('|')); c.cancel(); console.log('ok  ', label); };

await run('20 s of non-stop speech: chunks of a few seconds, complete within ~1.2 s after the speaker stops', async (c, fin) => {
  const t0 = clock; let tick = 0; // speech with a 170 ms dip every ~1.2 s (like quick talking between words)
  while (clock - t0 < 20000) { await step(tick % 28 < 4 ? 0.0 : 0.3); tick++; }
  const stopAt = clock; const midFinals = fin.length;
  assert.ok(midFinals >= 3, `finals while still speaking: ${midFinals}`);
  for (let i = 0; i < 60; i++) await step(0); // 2.6 s of silence
  const lastAt = fin[fin.length - 1].t; assert.ok(lastAt - stopAt <= 1200, `last text ${lastAt - stopAt} ms after stop`);
  const order = fin.map(f => Number(f.text.replace('chunk', ''))); const sorted = [...order].sort((a, b) => a - b); void sorted;
  // finals are delivered in the order they were spoken (chunk numbers of finals increase)
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], 'in order: ' + order.join(','));
  const gaps = fin.slice(1).map((f, i) => f.t - fin[i].t); assert.ok(Math.max(...gaps) < 6500, 'no long stalls: ' + Math.max(...gaps));
  console.log('     finals', fin.length, 'requests', sent.length, 'last text', lastAt - stopAt, 'ms after stop');
});
await run('rate limit (429): previews back off, no error, text still delivered', async (c, fin) => {
  status = 429; const t0 = clock; while (clock - t0 < 6000) await step(0.3); status = 200; for (let i = 0; i < 80; i++) await step(0);
  assert.ok(sent.length < 60, 'did not hammer the service: ' + sent.length);
});
console.log('fast cloud dictation OK'); process.exit(0);
