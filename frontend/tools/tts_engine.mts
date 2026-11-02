// Unit test: read-aloud engine survives a browser that drops speak() right after cancel(), retries with the default voice, and says so when nothing plays.
import assert from 'node:assert/strict';
let mode: 'ok' | 'drop-after-cancel' | 'never' | 'interrupt-first' | 'only-local' = 'ok'; let lastCancel = 0; const spoken: { text: string; voice: string }[] = []; let speakCalls = 0;
class FakeUtt { text: string; voice: any = null; lang = ''; rate = 1; pitch = 1; volume = 1; onstart: any; onend: any; onerror: any; onboundary: any; constructor(t: string) { this.text = t; } }
const synth: any = { speaking: false, pending: false, paused: false, getVoices: () => [{ name: 'Online Natural', lang: 'en-US', localService: false }, { name: 'Local David', lang: 'en-US', localService: true }],
  cancel() { lastCancel = Date.now(); this.speaking = false; },
  resume() { this.paused = false; }, pause() { this.paused = true; },
  speak(u: FakeUtt) { speakCalls++; this.speaking = true; if (process.env.DBG) console.log('speak', mode, Date.now() - lastCancel);
    if (mode === 'never') return;
    if (mode === 'drop-after-cancel' && Date.now() - lastCancel < 60) return;
    if (mode === 'only-local' && !u.voice?.localService) return;
    if (mode === 'interrupt-first' && u.voice) { setTimeout(() => u.onerror?.({ error: 'interrupted' }), 5); return; }
    spoken.push({ text: u.text, voice: u.voice?.name ?? '' }); setTimeout(() => { u.onstart?.(); setTimeout(() => { this.speaking = false; u.onend?.(); }, 15); }, 5); } };
(globalThis as any).window = { speechSynthesis: synth }; (globalThis as any).SpeechSynthesisUtterance = FakeUtt;
const { SpeechEngine } = await import('../src/lib/speechUtils.ts'); const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const mk = () => { const ev: string[] = []; const e = new SpeechEngine({ onSegment: i => ev.push('seg' + i), onEnd: () => ev.push('end'), onError: m => ev.push('err:' + m) }); e.startTimeoutMs = 120; e.voiceName = 'Online Natural'; return { e, ev }; };
{ mode = 'ok'; spoken.length = 0; const { e, ev } = mk(); e.load([{ id: 'a', text: 'Hello one.' }, { id: 'b', text: 'Hello two.' }]); e.play(0); await wait(200); assert.deepEqual(ev.filter(x => x !== 'seg0' && x !== 'seg1'), ['end']); assert.equal(spoken.length, 2); console.log('ok   plain playback reads every sentence'); }
{ mode = 'drop-after-cancel'; spoken.length = 0; const { e, ev } = mk(); e.load([{ id: 'a', text: 'First.' }]); e.play(0); await wait(30); synth.speaking = true; e.play(0); await wait(400); assert.ok(spoken.length >= 1 && ev.includes('end') && !ev.some(x => x.startsWith('err')), JSON.stringify(ev) + spoken.length); console.log('ok   click while reading: speech not dropped after cancel'); }
{ mode = 'interrupt-first'; spoken.length = 0; const { e, ev } = mk(); e.load([{ id: 'a', text: 'Retry me.' }]); e.play(0); await wait(400); assert.equal(spoken.length, 1); assert.equal(spoken[0].voice, '', 'retried with the default voice'); assert.ok(ev.includes('end') && !ev.some(x => x.startsWith('err'))); console.log('ok   chosen voice interrupted: retries with the default voice'); }
{ mode = 'only-local'; spoken.length = 0; const { e, ev } = mk(); e.load([{ id: 'a', text: 'Local only.' }]); e.play(0); await wait(900); assert.equal(spoken.length, 1); assert.equal(spoken[0].voice, 'Local David'); assert.ok(ev.includes('end') && !ev.some(x => x.startsWith('err')), JSON.stringify(ev)); console.log('ok   online + default voice silent: falls back to an installed voice'); }
{ mode = 'only-local'; const { e } = mk(); const r = await e.diagnose(); assert.equal(r.started, false); assert.equal(r.voices, 2); assert.equal(r.local, 1); console.log('ok   Test voice reports what the browser did'); }
{ mode = 'ok'; const { e } = mk(); const r = await e.diagnose(); assert.equal(r.started, true); console.log('ok   Test voice reports success'); }
{ mode = 'never'; const { e, ev } = mk(); e.load([{ id: 'a', text: 'Silent.' }]); e.play(0); await wait(1300); assert.ok(ev.some(x => /^err:No sound came out/.test(x)), JSON.stringify(ev)); assert.equal(e.status, 'idle'); assert.equal(speakCalls > 0, true); console.log('ok   nothing plays: user gets a clear message, state returns to idle'); }
console.log('tts engine OK'); process.exit(0);
