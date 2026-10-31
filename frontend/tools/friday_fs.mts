import assert from 'node:assert/strict';
import { memoryVfs, normPath, nameScore } from '../src/lib/friday/vfs.ts';
import { planOffline, executePlan, newCtx, splitClauses, validatePlan, planJson, hasFsSteps } from '../src/lib/friday/plan.ts';
const LOREM = 'Thermodynamics studies heat and work. The first law states that energy is conserved in every process. The second law of thermodynamics states that the entropy of an isolated system never decreases. A Carnot engine has the maximum possible efficiency between two reservoirs, equal to one minus the ratio of the cold to hot temperature. Entropy is a measure of disorder. Heat flows spontaneously from hot to cold bodies. Enthalpy is the heat content of a system at constant pressure.';
const mkv = async () => { const v = memoryVfs(); await v.ready(); await v.mkdir('/Inbox/Physics'); await v.writeText('/Inbox/Thermodynamics Notes.pdf', LOREM, { mime: 'application/pdf', pages: 4 }); await v.writeText('/Inbox/readme.txt', 'hello world this is a tiny file about nothing in particular at all.'); await v.writeText('/Documents/Optics.pdf', 'Light is an electromagnetic wave. Refraction obeys Snell law. Lenses form images. '.repeat(6), { mime: 'application/pdf', pages: 2 }); return v; };
const run = async (v: Awaited<ReturnType<typeof mkv>>, goal: string, cwd = '/') => { const ctx = newCtx(cwd); const plan = planOffline(goal, v, ctx); const r = await executePlan(plan, ctx, { vfs: v, runApp: async c => ({ ok: true, message: 'app:' + c }) }); return { plan, ctx, r }; };
// path + names
assert.equal(normPath('/a//b/../c/'), '/a/c'); assert.ok(nameScore('thermodynamics', 'Thermodynamics Notes.pdf') >= 0.8); assert.ok(nameScore('pdf processing section', 'PDF Processing') >= 0.9); assert.ok(nameScore('reports', 'Documents') < 0.3);
// clause splitting
assert.deepEqual(splitClauses('go to folder Inbox, capture the document there, move it into the PDF processing section, and generate a summary report'), ['go to folder Inbox', 'capture the document there', 'move it into the PDF processing section', 'generate a summary report']);
assert.deepEqual(splitClauses('Open AI segmentation -> go to the image processing module -> set model to U-Net -> run simulation').length, 4);
assert.equal(splitClauses('create folder Thermo then move thermodynamics to folder Thermo').length, 2);
// the headline scenario
{ const v = await mkv(); const { plan, ctx, r } = await run(v, 'Friday, go to folder Inbox, capture the document there, move it into the PDF processing section, and generate a summary report');
  assert.deepEqual(plan.steps.map(s => s.action), ['fs.cd', 'fs.capture', 'fs.move', 'report.generate'], JSON.stringify(plan.steps.map(s => [s.action, s.args])));
  assert.ok(r.ok, plan.steps.map(s => `${s.action}:${s.status}:${s.message}`).join('\n')); assert.ok(plan.steps.every(s => s.status === 'done'));
  assert.ok(v.exists('/PDF Processing/Thermodynamics Notes.pdf'), 'moved'); assert.ok(!v.exists('/Inbox/Thermodynamics Notes.pdf'), 'gone from inbox');
  const rep = v.list('/Reports'); assert.equal(rep.length, 1); const md = v.readText(rep[0].path)!; assert.ok(md.includes('# Summary report: Thermodynamics Notes.pdf') && md.includes('entropy') && md.includes('## Key terms') && md.includes('4 pages'), md);
  assert.equal(ctx.cwd, '/Inbox'); const j = JSON.parse(planJson(plan)); assert.equal(j.steps.length, 4); assert.equal(j.steps[3].status, 'done'); }
// failure stops and skips
{ const v = await mkv(); const { plan, r } = await run(v, 'go to folder Nowhere Land, capture the document, generate a summary report'); assert.ok(!r.ok); assert.equal(plan.steps[0].status, 'failed'); assert.equal(plan.steps[1].status, 'skipped'); assert.equal(plan.steps[2].status, 'skipped'); assert.ok(v.list('/Reports').length === 0); }
// capture by name from another folder + copy + rename + delete -> trash + find + mkdir
{ const v = await mkv(); let x = await run(v, 'capture optics from documents, copy it to inbox'); assert.ok(x.r.ok, JSON.stringify(x.plan.steps)); assert.ok(v.exists('/Inbox/Optics.pdf') && v.exists('/Documents/Optics.pdf'));
  x = await run(v, 'rename Optics to Light Basics', '/Documents'); assert.ok(x.r.ok, JSON.stringify(x.plan.steps.map(s => s.message))); assert.ok(v.exists('/Documents/Light Basics.pdf'));
  x = await run(v, 'delete readme', '/Inbox'); assert.ok(x.r.ok); assert.ok(v.list('/Trash').some(n => /readme/.test(n.name)) && !v.exists('/Inbox/readme.txt'));
  x = await run(v, 'create folder Archive then move thermodynamics to folder Archive', '/Inbox'); assert.ok(x.r.ok, JSON.stringify(x.plan.steps.map(s => s.message))); assert.ok(v.exists('/Inbox/Archive/Thermodynamics Notes.pdf'));
  x = await run(v, 'find the file entropy'); assert.ok(x.r.ok && /Thermodynamics/.test(x.plan.steps[0].message!)); x = await run(v, 'show the tree'); assert.ok(/Inbox/.test(x.plan.steps[0].message!)); }
// system folders protected, permanent delete only from trash
{ const v = await mkv(); const r = await v.remove('/Documents'); assert.ok(!r.ok); const t = await v.remove('/Inbox/readme.txt'); assert.ok(t.ok && t.path!.startsWith('/Trash/')); const p = await v.remove(t.path!, true); assert.ok(p.ok && !v.exists(t.path!)); }
// move folder with children, no move into self
{ const v = await mkv(); const m = await v.move('/Inbox', '/Documents'); assert.ok(m.ok && v.exists('/Documents/Inbox/Thermodynamics Notes.pdf') && !v.exists('/Inbox')); const bad = await v.move('/Documents', '/Documents/Inbox'); assert.ok(!bad.ok); }
// app commands pass through
{ const v = await mkv(); const x = await run(v, 'open Kalman filter -> set noise to 3 -> run simulation'); assert.ok(x.plan.steps.every(s => s.action === 'app.command')); assert.ok(!hasFsSteps(x.plan)); assert.equal(x.plan.steps[1].message, 'app:set noise to 3'); }
// pronoun without capture fails honestly
{ const v = await mkv(); const x = await run(v, 'move it into reports'); assert.ok(!x.r.ok && /Nothing is captured/.test(x.plan.steps[0].message!)); }
// model-plan validation
assert.ok(validatePlan({ steps: [{ action: 'fs.cd', args: { dir: 'Inbox' } }, { action: 'fs.capture', args: { what: 'the document' } }, { action: 'fs.move', args: { what: '$captured', to: 'PDF Processing' } }, { action: 'report.generate', args: {} }] }, 'g'));
assert.equal(validatePlan({ steps: [{ action: 'rm -rf', args: {} }] }, 'g'), null); assert.equal(validatePlan({ steps: [{ action: 'fs.move', args: { what: 'x' } }] }, 'g'), null); assert.equal(validatePlan({ steps: [] }, 'g'), null); assert.equal(validatePlan('nope', 'g'), null);
console.log('friday fs/plan OK');
