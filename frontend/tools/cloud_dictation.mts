// Unit test: AI-transcription dictation timing logic (phrase end, live previews, instant commit, ordering) with a fake clock, mic and network.
import assert from 'node:assert/strict';
let clock = 1000; const realNow = performance.now.bind(performance); void realNow;
(performance as any).now = () => clock;
let proc: any = null; let reqs: { t: number }[] = []; let latency = 0; let nextText = 'hello world';
class FakeAC { sampleRate = 16000; destination = {}; async resume() {} async close() {} createMediaStreamSource() { return { connect() {}, disconnect() {} }; } createScriptProcessor() { proc = { connect() {}, disconnect() {}, onaudioprocess: null as any }; return proc; } createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; } }
(globalThis as any).window = { isSecureContext: true, AudioContext: FakeAC };
let gum = 0; Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices: { getUserMedia: async () => { gum++; return { getTracks: () => [{ stop() {} }] }; } } }, configurable: true });
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {} }, configurable: true });
(globalThis as any).FormData = class { append() {} }; (globalThis as any).Blob = class {};
(globalThis as any).fetch = async () => { reqs.push({ t: clock }); const txt = nextText; await new Promise(r => setTimeout(r, latency)); return { ok: true, status: 200, json: async () => ({ text: txt }), text: async () => '' }; };
const { CloudDictationController } = await import('../src/lib/cloudDictation.ts');
const cfg = { provider: 'custom', apiKey: '', model: '', baseUrl: 'http://x/v1', speed: 'fast' } as any;
const frame = (amp: number) => { const f = new Float32Array(2048); for (let i = 0; i < f.length; i++) f[i] = amp * Math.sin(i / 5); return f; };
const feed = async (amp: number, n: number) => { for (let i = 0; i < n; i++) { clock += 128; proc.onaudioprocess({ inputBuffer: { getChannelData: () => frame(amp) } }); await new Promise(r => setTimeout(r, 12)); } };
const run = async (label: string, body: (c: any, got: { fin: string[]; int: string[] }) => Promise<void>) => {
  reqs = []; const got = { fin: [] as string[], int: [] as string[] }; const c = new CloudDictationController(() => cfg, { onFinal: t => got.fin.push(t), onInterim: t => { if (t) got.int.push(t); } });
  await c.start(); assert.ok(proc, 'mic opened'); await body(c, got); c.cancel(); console.log('ok  ', label, `(requests ${reqs.length}, finals ${got.fin.length}, previews ${got.int.length})`);
};
await run('speak 1.5 s then pause: previews shown, phrase committed once, at most one request in the pause', async (c, got) => {
  latency = 5; await feed(0.3, 12); assert.ok(got.int.length >= 1, 'live preview while speaking'); const before = reqs.length;
  await feed(0, 6); await new Promise(r => setTimeout(r, 60));
  assert.deepEqual(got.fin, ['hello world']); assert.ok(reqs.length <= before + 1, `at most one speculative request during the pause, then no separate final request (${before} -> ${reqs.length})`);
});
await run('words said after the last preview force a real final request', async (c, got) => {
  latency = 5; await feed(0.3, 6); await new Promise(r => setTimeout(r, 30)); nextText = 'hello world again';
  await feed(0, 1); await feed(0.3, 2); await feed(0, 6); await new Promise(r => setTimeout(r, 80));
  assert.equal(got.fin.length, 1); assert.ok(/hello/.test(got.fin[0]));
});
await run('two phrases arrive in order', async (c, got) => {
  latency = 5; nextText = 'first phrase'; await feed(0.3, 8); await feed(0, 6); nextText = 'second phrase'; await feed(0.3, 8); await feed(0, 6); await new Promise(r => setTimeout(r, 120));
  assert.deepEqual(got.fin, ['first phrase', 'second phrase']);
});
await run('Stop while speaking keeps the phrase', async (c, got) => {
  latency = 5; nextText = 'cut short'; await feed(0.3, 8); await new Promise(r => setTimeout(r, 40)); c.stop(); await new Promise(r => setTimeout(r, 200));
  assert.deepEqual(got.fin, ['cut short']);
});
await run('silence and a quick cough produce nothing', async (c, got) => { latency = 5; await feed(0, 10); await feed(0.3, 1); await feed(0, 8); await new Promise(r => setTimeout(r, 60)); assert.deepEqual(got.fin, []); });
await run('hallucinated "Thank you." is dropped', async (c, got) => { latency = 5; nextText = 'Thank you.'; await feed(0.3, 8); await feed(0, 6); await new Promise(r => setTimeout(r, 80)); assert.deepEqual(got.fin, []); });
await run('start() while paused resumes, it does not open a second microphone', async (c) => { const before = gum; await feed(0.3, 3); c.pause(); await c.start(); assert.equal(gum, before, 'getUserMedia not called again'); assert.equal(c.status, 'listening'); });
console.log('cloud dictation OK'); process.exit(0);
