// Unit test: dictation delivers a partial phrase when the user presses stop, and fails loudly when recognition cannot work.
import assert from 'node:assert/strict';
let last: any = null;
class FakeRec { lang = ''; continuous = true; interimResults = true; maxAlternatives = 1; onstart: any; onresult: any; onerror: any; onend: any; started = 0;
  constructor() { last = this; }
  start() { this.started++; setTimeout(() => this.onstart?.(), 0); } stop() { setTimeout(() => this.onend?.(), 5); } abort() { setTimeout(() => this.onend?.(), 0); } }
(globalThis as any).window = { webkitSpeechRecognition: FakeRec };
const { SpeechToTextController } = await import('../src/lib/speechUtils.ts');
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const res = (txt: string, fin: boolean) => ({ resultIndex: 0, results: [Object.assign([{ transcript: txt }], { isFinal: fin, length: 1 })] });
{ // 1. interim-only phrase, then stop → delivered as final
  const got: string[] = []; const c = new SpeechToTextController({ onFinal: t => got.push(t) }); c.start(); await wait(10);
  last.onresult(res('hello world', false)); c.stop(); await wait(40); assert.deepEqual(got, ['hello world']); assert.equal(c.status, 'idle'); console.log('PASS stop delivers partial phrase');
}
{ // 2. final result is delivered once, not duplicated at end
  const got: string[] = []; const c = new SpeechToTextController({ onFinal: t => got.push(t) }); c.start(); await wait(10);
  last.onresult(res('first', false)); last.onresult(res('first phrase', true)); c.stop(); await wait(40); assert.deepEqual(got, ['first phrase']); console.log('PASS no duplicate after final');
}
{ // 3. network error stops the restart loop and reports a clear message
  const errs: string[] = []; const c = new SpeechToTextController({ onError: m => errs.push(m) }); c.start(); await wait(10);
  last.onerror({ error: 'network' }); last.onend(); await wait(20); assert.ok(/Chrome or Edge/.test(errs[0])); assert.equal(c.status, 'idle'); console.log('PASS network error ends session with advice');
}
{ // 4. sessions that keep closing instantly are reported, not "listening" forever
  const errs: string[] = []; const c = new SpeechToTextController({ onError: m => errs.push(m) }); c.start(); await wait(10);
  for (let i = 0; i < 4; i++) { last.onend(); await wait(10); } assert.ok(errs.some(m => /keeps closing/.test(m)), JSON.stringify(errs)); assert.equal(c.status, 'idle'); console.log('PASS instant-close loop detected');
}
console.log('stt OK');
