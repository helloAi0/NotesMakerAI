// Minimal Ollama/OpenAI-compatible stub for e2e: /api/tags, /v1/models, /v1/chat/completions (stream + non-stream). Port from argv or 11434.
import http from 'node:http';
const port = Number(process.argv[2] || 11434);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.url === '/api/tags') { res.writeHead(200, { ...cors, 'content-type': 'application/json' }); return res.end(JSON.stringify({ models: [{ name: 'tiny-test:1b' }, { name: 'llama3.1:8b-instruct' }] })); }
  if (req.url?.endsWith('/models')) { res.writeHead(200, { ...cors, 'content-type': 'application/json' }); return res.end(JSON.stringify({ data: [{ id: 'tiny-test:1b' }] })); }
  if (req.url?.endsWith('/audio/transcriptions')) { let n = 0; req.on('data', c => (n += c.length)); req.on('end', () => { res.writeHead(200, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify({ text: n > 2000 ? 'hello from transcription' : '' })); }); return; }
  if (req.url?.endsWith('/chat/completions')) { let body = ''; req.on('data', c => (body += c)); req.on('end', () => {
    const j = JSON.parse(body || '{}'); const text = JSON.stringify(j.messages ?? []); let out = 'MODEL-ANSWER: the energy is $E=mc^2$.';
    if (/planner of FRIDAY/.test(text)) out = JSON.stringify({ version: 1, goal: 'x', steps: [{ action: 'fs.mkdir', label: 'Create folder Planned', args: { name: 'Planned' } }, { action: 'fs.ls', label: 'List', args: {} }] });
    if (/Review the DRAFT/.test(text)) out = 'REVIEWED: ' + out;
    if (j.stream) { res.writeHead(200, { ...cors, 'content-type': 'text/event-stream' }); for (const w of out.split(' ')) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: w + ' ' } }] })}\n\n`); res.end('data: [DONE]\n\n'); }
    else { res.writeHead(200, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: out } }] })); }
  }); return; }
  res.writeHead(404, cors); res.end('no');
}).listen(port, '127.0.0.1', () => console.log('fake llm on', port));
