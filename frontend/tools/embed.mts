import assert from 'node:assert/strict';
import http from 'node:http';
import { Retriever, ollamaEmbedder, openaiEmbedder } from '../src/lib/friday/agents/retrieval.ts';
import { CORPUS } from '../src/lib/friday/agents/evals.ts';
// a stub embedding server: “synonym-aware” vectors (words of one concept share a dimension), so a query with NO shared words can still match
const CONCEPTS = [['disorder', 'chaos', 'randomness', 'entropy'], ['split', 'divide', 'division', 'mitosis'], ['voltage', 'potential', 'volts'], ['aliasing', 'undersample', 'nyquist', 'sampling']];
const vec = (t: string) => { const v = new Array(CONCEPTS.length).fill(0); for (const w of t.toLowerCase().split(/\W+/)) { const i = CONCEPTS.findIndex(c => c.includes(w)); if (i >= 0) v[i] += 1; } return v; };
let calls = 0, mode: 'ok' | 'down' = 'ok';
const srv = http.createServer((req, res) => { let b = ''; req.on('data', c => (b += c)); req.on('end', () => { calls++; if (mode === 'down') { res.statusCode = 500; res.end('x'); return; } const j = JSON.parse(b); const inp: string[] = Array.isArray(j.input) ? j.input : [j.input]; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(req.url!.includes('/embeddings') ? { data: inp.map(t => ({ embedding: vec(t) })) } : { embeddings: inp.map(vec) })); }); });
await new Promise<void>(r => srv.listen(0, '127.0.0.1', r)); const port = (srv.address() as { port: number }).port;
const q = 'what causes chaos in a closed system'; // shares no word with the entropy passage except "system"
{ const r = new Retriever(CORPUS, ollamaEmbedder(`http://127.0.0.1:${port}`, 'stub-embed')); const h = await r.search('chaos randomness', 3); assert.ok(r.embedderUsed, 'embedding model used'); assert.ok(h[0].via.includes('embedding'), h[0].via.join()); assert.equal(h[0].passage.where, 'page 4', `${h[0].passage.title} ${h[0].passage.where}`); assert.ok(calls >= 2); }
{ const r = new Retriever(CORPUS, openaiEmbedder(`http://127.0.0.1:${port}`, 'k', 'stub')); const h = await r.search('undersample a waveform', 3); assert.ok(r.embedderUsed); assert.equal(h[0].passage.title, 'Signals and Systems.pdf'); assert.equal(h[0].passage.where, 'page 12'); }
{ mode = 'down'; const r = new Retriever(CORPUS, ollamaEmbedder(`http://127.0.0.1:${port}`, 'stub')); const h = await r.search('what is mitosis', 3); assert.ok(h.length && h[0].passage.title === 'Biology Revision', 'falls back to built-in search when the embedding server fails'); assert.ok(!r.embedderUsed); }
void q; srv.close(); console.log('embedding model integration OK');
