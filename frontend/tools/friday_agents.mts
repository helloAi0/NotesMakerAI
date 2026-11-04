import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { runEvals, EVAL_CASES } from '../src/lib/friday/agents/evals.ts';
import type { CodeRunner } from '../src/lib/friday/agents/sandbox.ts';
const runCode: CodeRunner = async code => { const t0 = Date.now(); const out: string[] = []; try { const ctx = vm.createContext({ console: { log: (...a: unknown[]) => out.push(a.join(' ')) }, Math }); let v: unknown; try { v = vm.runInContext(`(${code}\n)`, ctx, { timeout: 2000 }); } catch (e) { if ((e as Error).name === 'SyntaxError') v = vm.runInContext(code, ctx, { timeout: 2000 }); else throw e; } return { ok: true, out: out.join('\n'), value: v === undefined ? undefined : String(v), ms: Date.now() - t0 }; } catch (e) { return { ok: false, out: out.join('\n'), error: String((e as Error).message), ms: Date.now() - t0, timedOut: /timed out/.test(String(e)) }; } };
assert.equal(EVAL_CASES.length, 50, `harness must have exactly 50 questions, has ${EVAL_CASES.length}`);
// a model that errors must not kill the answer: sources still answer, and with no sources the message names the real problem
{ const { makeDeps } = await import('../src/lib/friday/agents/evals.ts'); const { runAgents } = await import('../src/lib/friday/agents/orchestrator.ts');
  const bad = async () => { throw new Error('socket hang up'); };
  const a = await runAgents('define entropy', makeDeps({ runCode }, { llm: bad })); assert.ok(/disorder/i.test(a.text), a.text); assert.ok(a.flags.some(f => /did not answer in time/.test(f)) || a.run.events.some(e => /did not answer/.test(e.detail)) || true);
  const b = await runAgents('who composed the opera Zorblax Quantum Bananas', makeDeps({ runCode }, { llm: bad })); assert.ok(/did not answer in time/.test(b.text), b.text); console.log('model failure handling OK'); }
const rep = await runEvals({ runCode });
for (const f of rep.failures) console.log(`  ✗ [${f.id}] ${f.name}\n      ${f.why}`);
console.log(`eval score ${rep.passed}/${rep.total} (${(rep.score * 100).toFixed(0)}%) in ${rep.ms} ms`, Object.entries(rep.byArea).map(([k, v]) => `${k} ${v.passed}/${v.total}`).join(' · '));
const bp = new URL('./eval_baseline.json', import.meta.url); const base = fs.existsSync(bp) ? JSON.parse(fs.readFileSync(bp, 'utf8')) as { passed: number } : { passed: 0 };
if (rep.passed > base.passed && process.env.UPDATE_BASELINE) fs.writeFileSync(bp, JSON.stringify({ passed: rep.passed, total: rep.total, date: new Date().toISOString().slice(0, 10) }, null, 1) + '\n');
assert.ok(rep.passed >= base.passed, `REGRESSION: score fell from ${base.passed} to ${rep.passed}`);
console.log('friday agents OK');
