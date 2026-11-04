import assert from 'node:assert/strict';
import http from 'node:http';
import { transcribeWav } from '../src/lib/cloudDictation.ts';
// A stub that speaks the same HTTP protocol as faster-whisper-server / whisper.cpp's OpenAI-compatible server / LocalAI: POST /v1/audio/transcriptions (multipart) → {text}
let seen: { url?: string; auth?: string; ct?: string; body?: string } = {};
const srv = http.createServer((req, res) => { const chunks: Buffer[] = []; req.on('data', c => chunks.push(c)); req.on('end', () => { const b = Buffer.concat(chunks); seen = { url: req.url, auth: req.headers.authorization, ct: String(req.headers['content-type']), body: b.toString('latin1') }; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ text: ' hello from local whisper ' })); }); });
await new Promise<void>(r => srv.listen(0, '127.0.0.1', r)); const port = (srv.address() as { port: number }).port;
const wav = new Uint8Array(44 + 3200); wav.set([0x52, 0x49, 0x46, 0x46], 0);
const text = await transcribeWav({ provider: 'custom', apiKey: '', model: 'Systran/faster-whisper-small', baseUrl: `http://127.0.0.1:${port}/v1`, speed: 'fast' }, wav, 'en-US');
assert.equal(text, 'hello from local whisper'); assert.equal(seen.url, '/v1/audio/transcriptions'); assert.ok(/multipart\/form-data/.test(seen.ct!)); assert.equal(seen.auth, undefined, 'no key is sent to a keyless local server');
assert.ok(/name="file"; filename="speech.wav"/.test(seen.body!) && /name="model"\r\n\r\nSystran\/faster-whisper-small/.test(seen.body!) && /name="language"\r\n\r\nen/.test(seen.body!), seen.body!.slice(0, 400));
srv.close(); console.log('local Whisper protocol OK');
