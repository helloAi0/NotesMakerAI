/**
 * Executes parsed voice/text commands against the live app (through agentBus) and answers questions offline.
 * Every step reports honestly whether it worked; nothing is pretended.
 */
import { cap, waitFor, sleep } from './agentBus';
import { parseCommand, resolveSim, resolveParam, resolveOption, parseNumber, parseBool, overlap, norm } from './voiceIntents';
import type { Intent } from './voiceIntents';
import { SIMS } from '../sims/registry';
import { resolveCurriculum } from '../sims/curriculumCatalog';
import type { Param } from '../sims/types';
import { searchEverything, pdfList, findPdf, pdfSummary, fridayNotes, fridayAsk } from './friday';
import { addFolder, listFolders, moveDoc } from './libraryStore';
import { addTask, listTasks, setDone, findTask, parseDue, label as dueLabel, today as todayIso, iso } from './planner';
import { summarize } from './textTools';

let lastOutput = '';
/** Notebook pages are plain text: turn markdown-ish headings into readable lines. */
const plainNotes = (t: string) => t.replace(/^#\s+(.+)$/gm, (_, h: string) => h.toUpperCase()).replace(/^#{2,}\s+(.+)$/gm, '$1:').replace(/\*\*/g, '');
export const setLastOutput = (t: string) => { lastOutput = t; };
export async function toNotebook(text: string): Promise<{ ok: boolean; msg: string }> {
  const app = cap('app'); let nb = cap('notebook'); if (!nb && app) { app.navigate('notebook'); nb = await waitFor('notebook'); }
  if (!nb) return { ok: false, msg: 'Open the notebook first.' }; nb.insert(text); return { ok: true, msg: `Added to “${nb.title()}” page ${nb.page()}.` };
}
async function toLibrary() { const app = cap('app'); if (app && app.view() !== 'library') { app.navigate('library'); await sleep(350); } }

export interface StepResult { raw: string; ok: boolean; message: string; chips?: Chip[] }
export interface Chip { label: string; cmd: string }
export interface Reply { text: string; chips?: Chip[] }

const fmtVal = (p: Param, v: unknown) => (p.kind === 'select' ? (p.options.find(o => o.value === v)?.label ?? String(v)) : p.kind === 'toggle' ? (v ? 'on' : 'off') : String(Math.round(Number(v) * 1000) / 1000));
const snap = (p: Param & { kind: 'number' }, v: number) => { const c = Math.min(p.max, Math.max(p.min, v)); const k = Math.round((c - p.min) / p.step); return Math.min(p.max, Math.max(p.min, +(p.min + k * p.step).toFixed(6))); };

async function needSim(): Promise<ReturnType<typeof cap<'sim'>> | null> { const s = cap('sim') ?? (await waitFor('sim', 1200)); return s ?? null; }

async function exec(intent: Intent, raw: string): Promise<StepResult> {
  const ok = (message: string, chips?: Chip[]): StepResult => ({ raw, ok: true, message, chips });
  const no = (message: string): StepResult => ({ raw, ok: false, message });
  const app = cap('app');
  switch (intent.kind) {
    case 'navigate': {
      if (!app) return no('The app is not ready yet.');
      app.navigate(intent.view); await sleep(200); if (intent.view === 'simulations') await waitFor('studio'); if (intent.view === 'notebook') await waitFor('notebook');
      return ok(`Opened ${intent.view === 'simulations' ? 'Visuals Studio' : intent.view}.`);
    }
    case 'open_sim': {
      const hit = resolveSim(intent.query, SIMS);
      if (!hit) {
        const near = SIMS.map(s => ({ s, sc: Math.max(overlap(intent.query, s.title), overlap(intent.query, (s.tags ?? []).join(' '))) })).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 3).map(x => x.s.title);
        return no(`I could not find a simulation matching “${intent.query}”.${near.length ? ' Closest: ' + near.join('; ') + '.' : ''}`);
      }
      if (app && app.view() !== 'simulations') { app.navigate('simulations'); await sleep(150); }
      const studio = cap('studio') ?? (await waitFor('studio')); if (!studio) return no('Visuals Studio did not open.');
      if (!studio.openSim(hit.sim.id)) return no('Could not open that simulation.');
      for (let i = 0; i < 100; i++) { if (cap('sim')?.sim.id === hit.sim.id) break; await sleep(50); }
      if (cap('sim')?.sim.id !== hit.sim.id) return no(`Found “${hit.sim.title}” but it did not finish opening.`);
      await sleep(250); return ok(`Opened “${hit.sim.title}”.`);
    }
    case 'close_sim': { const st = cap('studio'); if (!st) return no('No simulation is open.'); st.closeSim(); await sleep(200); return ok('Back to the simulation library.'); }
    case 'goto_module': {
      const sim = await needSim(); if (!sim) return no('Open a simulation first.');
      const sels = sim.sim.params.filter((p): p is Param & { kind: 'select' } => p.kind === 'select');
      const modLike = sels.filter(p => /module|stage|section|tab|view|panel|mode|step|phase|pipeline/.test(norm(p.label + ' ' + p.id)));
      for (const p of [...modLike, ...sels.filter(p => !modLike.includes(p))]) { const o = resolveOption(intent.name, p); if (o) { sim.setParam(p.id, o.value); await sleep(150); return ok(`${p.label} → ${o.label}.`); } }
      return no(`This simulation has no module called “${intent.name}”.${sels.length ? ' Available: ' + sels.map(p => `${p.label}: ${p.options.map(o => o.label).join(' / ')}`).join('; ') + '.' : ''}`);
    }
    case 'set_param': case 'adjust_param': case 'toggle_param': {
      const sim = await needSim(); if (!sim) return no('Open a simulation first, then I can change its settings.');
      const params = sim.sim.params;
      let p: Param | null = intent.kind === 'set_param' && !intent.param ? null : resolveParam(intent.param, params);
      if (intent.kind === 'set_param' && !p) { // "use unet": find the select that owns this option
        for (const q of params) if (q.kind === 'select') { const o = resolveOption(intent.value, q); if (o) { p = q; break; } }
        if (!p && !intent.param) return no(`No setting offers “${intent.value}”.`);
      }
      if (!p) {
        if (intent.kind !== 'toggle_param' && /speed/.test(norm(intent.kind === 'set_param' ? intent.param : intent.param))) { const v = intent.kind === 'set_param' ? parseNumber(intent.value) : null; if (v != null) { sim.setSpeed(v); return ok(`Playback speed ${v}×.`); } }
        return no(`I could not find a setting called “${intent.kind === 'set_param' ? intent.param : intent.param}”. Settings here: ${params.map(q => q.label).join(', ')}.`);
      }
      if (p.kind === 'select') {
        if (intent.kind !== 'set_param') return no(`${p.label} is a choice list; say “set ${p.label} to …”.`);
        const o = resolveOption(intent.value, p); if (!o) return no(`${p.label} has no option “${intent.value}”. Options: ${p.options.map(x => x.label).join(', ')}.`);
        sim.setParam(p.id, o.value); return ok(`${p.label} → ${o.label}.`);
      }
      if (p.kind === 'toggle') {
        const on = intent.kind === 'toggle_param' ? intent.on : parseBool(intent.kind === 'set_param' ? intent.value : '') ?? !(sim.values()[p.id] as boolean);
        sim.setParam(p.id, on); return ok(`${p.label} ${on ? 'on' : 'off'}.`);
      }
      const cur = Number(sim.values()[p.id]); let target: number | null;
      if (intent.kind === 'set_param') { target = parseNumber(intent.value); if (target == null) return no(`“${intent.value}” is not a number for ${p.label}.`); }
      else if (intent.kind === 'adjust_param') { const amt = intent.amount ? parseNumber(intent.amount) : null; const d = amt ?? Math.max(p.step, (p.max - p.min) / 10); target = cur + intent.dir * d; }
      else return no(`${p.label} is a number; say “set ${p.label} to …”.`);
      const v = snap(p, target); sim.setParam(p.id, v);
      return ok(`${p.label} → ${fmtVal(p, v)}${p.unit ? ' ' + p.unit : ''}${v !== target ? ` (limited to ${p.min}–${p.max})` : ''}.`);
    }
    case 'run': { const s = await needSim(); if (!s) return no('Open a simulation first, then say “run simulation”.'); s.run(); await sleep(300); return ok(`Running “${s.sim.title}”.`); }
    case 'play': { const s = await needSim(); if (!s) return no('No simulation is open.'); s.play(); return ok('Playing.'); }
    case 'pause': { const s = cap('sim'); if (!s) return no('No simulation is open.'); s.pause(); return ok('Paused.'); }
    case 'reset': { const s = cap('sim'); if (!s) return no('No simulation is open.'); s.reset(); return ok('Reset to the starting state.'); }
    case 'step': { const s = cap('sim'); if (!s) return no('No simulation is open.'); s.pause(); s.step(); return ok('Advanced one step.'); }
    case 'speed': { const s = cap('sim'); if (!s) return no('No simulation is open.'); const base = intent.value ?? 1 * (intent.factor ?? 1); s.setSpeed(Math.min(8, Math.max(0.1, base))); return ok(`Playback speed ${base}×.`); }
    case 'action': {
      const s = await needSim(); if (!s) return no('Open a simulation first.');
      const a = (s.sim.actions ?? []).map(x => ({ x, sc: overlap(intent.name, x.label) })).sort((p, q) => q.sc - p.sc)[0];
      if (!a || a.sc < 0.5) return no(`This simulation has no button “${intent.name}”.${s.sim.actions?.length ? ' Buttons: ' + s.sim.actions.map(x => x.label).join(', ') + '.' : ''}`);
      s.doAction(a.x.id); return ok(`Pressed “${a.x.label}”.`);
    }
    case 'add_to_notebook': { const s = cap('sim'); if (!s) return no('Open a simulation first.'); s.addToNotebook(); return ok('Opened “Add to Notebook”: choose the page and press Save.'); }
    case 'insert_text': {
      let nb = cap('notebook'); if (!nb && app) { app.navigate('notebook'); nb = await waitFor('notebook'); }
      if (!nb) return no('Open the notebook first.'); nb.insert(intent.text); return ok(`Added to “${nb.title()}” page ${nb.page()}.`);
    }
    case 'read_aloud': { let nb = cap('notebook'); if (!nb && app) { app.navigate('notebook'); nb = await waitFor('notebook'); } if (!nb) return no('Open the notebook first.'); nb.readAloud(); return ok('Reading the page aloud.'); }
    case 'stop_reading': { cap('notebook')?.stopReading(); window.speechSynthesis?.cancel(); return ok('Stopped reading.'); }
    case 'goto_page': { const nb = cap('notebook'); if (!nb) return no('Open the notebook first.'); const n = intent.n ?? nb.page() + (intent.delta ?? 0); nb.gotoPage(Math.max(1, n)); return ok(`Page ${Math.max(1, n)}.`); }
    case 'open_settings': window.dispatchEvent(new Event('nm:open-settings')); return ok('Opened Settings (AI key, voice, backup).');
    case 'list_pdfs': {
      const docs = await pdfList(); const folders = listFolders();
      if (!docs.length) return ok('Your PDF library is empty. Say “import pdfs” or open PDF & Source Library to add some.', [{ label: 'Import PDFs', cmd: 'import pdfs' }]);
      const by = new Map<string, string[]>(); for (const d of docs) by.set(d.folder || 'No folder', [...(by.get(d.folder || 'No folder') ?? []), `${d.name} (${d.pages} p)`]);
      for (const f of folders) if (!by.has(f)) by.set(f, []);
      return ok([...by].map(([f, a]) => `${f}: ${a.length ? a.join('; ') : '(empty)'}`).join('\n'), docs.slice(0, 3).map(d => ({ label: `Summarize ${d.name.slice(0, 22)}`, cmd: `summarize my pdf ${d.name.replace(/\.pdf$/i, '')}` })));
    }
    case 'summarize_pdf': {
      const docs = await pdfList(); if (!docs.length) return no('Your PDF library is empty. Say “import pdfs” first.');
      const d = intent.q ? findPdf(intent.q, docs) : docs[0]; if (!d) return no(`I could not find a PDF matching “${intent.q}”. You have: ${docs.map(x => x.name).join(', ')}.`);
      const r = pdfSummary(d); lastOutput = `Summary of ${d.name}\n${r.text}`;
      return ok(`Summary of “${d.name}” (${d.pages} pages):\n${r.text}${r.terms.length ? `\nKey terms: ${r.terms.join(', ')}.` : ''}`, [{ label: 'Add to notebook', cmd: 'add the summary to my notebook' }, { label: 'Open PDF', cmd: `open pdf ${d.name.replace(/\.pdf$/i, '')}` }]);
    }
    case 'open_pdf': {
      const docs = await pdfList(); const d = findPdf(intent.q, docs); if (!d) return no(`I could not find a PDF matching “${intent.q}”.${docs.length ? ' You have: ' + docs.map(x => x.name).join(', ') + '.' : ''}`);
      await toLibrary(); window.dispatchEvent(new CustomEvent('nm:open-pdf', { detail: { id: d.id } })); return ok(`Opened “${d.name}” in the library.`);
    }
    case 'make_folder': { const f = addFolder(intent.name.replace(/^(called|named)\s+/i, '')); if (!f) return no('Tell me a folder name, e.g. “create folder Thermodynamics”.'); return ok(`Folder “${f}” is ready in your PDF library.`); }
    case 'move_pdf': {
      const docs = await pdfList(); const d = findPdf(intent.q, docs); if (!d) return no(`I could not find a PDF matching “${intent.q}”.${docs.length ? ' You have: ' + docs.map(x => x.name).join(', ') + '.' : ' The library is empty.'}`);
      const want = norm(intent.folder); const existing = listFolders().find(f => norm(f) === want) ?? listFolders().find(f => norm(f).includes(want) || want.includes(norm(f)));
      const f = existing ?? addFolder(intent.folder.replace(/\b\w/g, c => c.toUpperCase())); if (!f) return no('Which folder?');
      await moveDoc(d.id, f); return ok(`Moved “${d.name}” to folder “${f}”${existing ? '' : ' (created it)'}.`);
    }
    case 'import_pdfs': {
      await toLibrary(); window.dispatchEvent(new CustomEvent('nm:pick-files', { detail: { folder: intent.folder } }));
      return ok(intent.folder ? 'Choose the folder on your computer: every PDF inside is imported into your library (the browser needs you to pick it). If no dialog appeared, press “Import folder”.' : 'Choose your PDF files. If no dialog appeared, press “Upload PDFs”.');
    }
    case 'gen_note': {
      const r = await fridayNotes(intent.topic); if (!r.found || !r.text) return no(`I have no built-in material on “${intent.topic}”. Add a PDF about it, or add an AI key in Settings so I can write notes on anything.`);
      lastOutput = r.text; const w = await toNotebook('\n' + plainNotes(r.text) + '\n'); if (!w.ok) return no(w.msg);
      return ok(`Wrote ${r.mode === 'ai' ? 'AI' : 'offline'} notes on “${intent.topic}”. ${w.msg}${r.note ? ' ' + r.note : ''}`, [{ label: 'Read aloud', cmd: 'read this page aloud' }]);
    }
    case 'summarize_page': {
      const nb = cap('notebook'); if (!nb) return no('Open the notebook first.'); const t = nb.getText(); if (t.trim().length < 40) return no('This page has too little text to summarise.');
      const ss = summarize(t, 4); lastOutput = 'Summary\n' + ss.map(x => '• ' + x).join('\n'); return ok('Summary of this page:\n' + ss.map(x => '• ' + x).join('\n'), [{ label: 'Add to notebook', cmd: 'add the summary to my notebook' }]);
    }
    case 'insert_last': { if (!lastOutput) return no('There is nothing to add yet. Ask me for a summary or an answer first.'); const w = await toNotebook('\n' + plainNotes(lastOutput) + '\n'); return w.ok ? ok(w.msg) : no(w.msg); }
    case 'add_task': {
      const { title, due } = parseDue(intent.text); if (!title) return no('What is the task? e.g. “add task revise optics by Friday”.');
      const t = addTask({ title, due, kind: intent.exam ? 'exam' : 'task' }); return ok(`${intent.exam ? 'Exam' : 'Task'} added: “${t.title}”${t.due ? ` — ${dueLabel(t.due)} (${t.due})` : ' (no date)'}.`, [{ label: 'Open planner', cmd: 'open planner' }]);
    }
    case 'whats_due': {
      const all = listTasks().filter(t => !t.done); const t0 = todayIso(); const d1 = new Date(); d1.setDate(d1.getDate() + 1); const d7 = new Date(); d7.setDate(d7.getDate() + 7);
      const sel = all.filter(t => intent.range === 'all' ? true : intent.range === 'today' ? t.due && t.due <= t0 : intent.range === 'tomorrow' ? t.due === iso(d1) : t.due && t.due <= iso(d7));
      if (!sel.length) return ok(intent.range === 'all' ? 'No open tasks. Enjoy! Say “add task …” to plan something.' : 'Nothing due in that period.');
      return ok(sel.slice(0, 12).map(t => `• ${t.title} — ${dueLabel(t.due)}${t.kind === 'exam' ? ' (exam)' : ''}`).join('\n'), [{ label: 'Open planner', cmd: 'open planner' }]);
    }
    case 'complete_task': { const t = findTask(intent.q); if (!t) return no(`I could not find a task like “${intent.q}”.`); setDone(t.id, true); return ok(`Marked “${t.title}” as done.`); }
    case 'explain': {
      if (cap('sim') && (!/\w/.test(intent.q.replace(/^(explain|describe|what is|what's|tell me about|summari[sz]e)/i, '')) || /\b(this|current|simulation|sim|here|screen|doing|showing)\b/i.test(intent.q))) return ok(explainCurrent(intent.q).text);
      const a = await fridayAsk(intent.q); lastOutput = a.text; return ok(a.text, a.chips);
    }
    case 'search': { const r = await searchEverything(intent.q); return ok(r.text, r.chips); }
    case 'help': return ok(helpText());
    default: {
      // maybe the bare words are a button label of the open simulation ("shuffle", "fire")
      const s = cap('sim'); const w = norm(raw);
      if (s) { const a = (s.sim.actions ?? []).find(x => overlap(w, x.label) >= 0.99 || norm(x.label) === w); if (a) { s.doAction(a.id); return ok(`Pressed “${a.label}”.`); } }
      return no(`I did not understand “${raw}”. Say “help” for examples.`);
    }
  }
}

/** Run a spoken/typed command. Several steps can be chained with “->”, “then” or “and”. */
export async function runCommand(text: string, onStep?: (i: number, total: number, r: StepResult | null) => void): Promise<StepResult[]> {
  const steps = parseCommand(text); const out: StepResult[] = [];
  for (let i = 0; i < steps.length; i++) {
    onStep?.(i, steps.length, null);
    let r: StepResult; try { r = await exec(steps[i].intent, steps[i].raw); } catch (e) { r = { raw: steps[i].raw, ok: false, message: `Failed: ${(e as Error).message}` }; }
    out.push(r); onStep?.(i, steps.length, r);
    if (!r.ok) break; // do not run later steps on top of a failed one
    await sleep(120);
  }
  return out;
}
export const isCommandLike = (text: string) => parseCommand(text).some(s => s.intent.kind !== 'unknown' && s.intent.kind !== 'explain' && s.intent.kind !== 'search' && s.intent.kind !== 'help');

/* ---------------- offline knowledge: explain / search / help ---------------- */
const stripTex = (s: string) => s.replace(/\\(?:dfrac|frac)\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)').replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}$]/g, '').replace(/\s+/g, ' ').trim();
export function explainCurrent(q = ''): Reply {
  const s = cap('sim');
  if (!s) return { text: 'No simulation is open. Say “open <name>” (for example “open Kalman filter”) and I will explain what it shows.' };
  const sim = s.sim, vals = s.values();
  const params = sim.params.map(p => `${p.label} = ${fmtVal(p, vals[p.id])}${p.kind === 'number' && p.unit ? ' ' + p.unit : ''}`).join('; ');
  const reads = s.readouts().slice(0, 6).map(r => `${r.label}: ${r.value}`).join('; ');
  const eqs = s.equations().slice(0, 2).map(stripTex).join(' | ');
  const asked = /why|how/.test(norm(q)) ? '' : '';
  return { text: `${sim.title}. ${sim.hint || sim.blurb}\n\nRight now: ${params}.\nLive readings: ${reads || 'none yet'}.${eqs ? `\nKey relation(s): ${eqs}.` : ''}\n\nYou should be able to: ${(sim.learningObjectives ?? []).slice(0, 3).join(' ')}${sim.assumptions?.length ? `\nModel limits: ${sim.assumptions[0]}` : ''}${asked}` };
}
export function searchAll(q: string): Reply {
  const sims = SIMS.map(s => ({ s, sc: Math.max(overlap(q, s.title), overlap(q, (s.tags ?? []).concat(s.covers ?? []).join(' ')) * 0.85, overlap(q, `${s.topic} ${s.subtopic}`) * 0.7) })).filter(x => x.sc >= 0.5).sort((a, b) => b.sc - a.sc).slice(0, 5);
  const nb = cap('notebook'); const pages = (nb?.allPages() ?? []).map(p => ({ p, sc: overlap(q, p.text) })).filter(x => x.sc >= 0.5).sort((a, b) => b.sc - a.sc).slice(0, 3);
  const topics = resolveCurriculum(SIMS).filter(t => overlap(q, t.title) >= 0.5).slice(0, 3);
  const lines: string[] = []; const chips: Chip[] = [];
  if (sims.length) { lines.push('Simulations: ' + sims.map(x => x.s.title).join('; ')); sims.forEach(x => chips.push({ label: x.s.title.length > 36 ? x.s.title.slice(0, 34) + '…' : x.s.title, cmd: `open ${x.s.title}` })); }
  if (pages.length) { lines.push('In your notes: ' + pages.map(x => `“${x.p.title}” page ${x.p.page}`).join('; ')); pages.forEach(x => chips.push({ label: `Page ${x.p.page}`, cmd: `go to the notebook -> go to page ${x.p.page}` })); }
  if (topics.length) lines.push('Curriculum: ' + topics.map(t => `${t.title} (${t.status})`).join('; '));
  return { text: lines.length ? lines.join('\n') : `Nothing matched “${q}” in the simulations, your notes or the curriculum list.`, chips };
}
export function helpText(): string {
  return [
    'I run entirely in your browser (no internet needed). Examples:',
    '• “Open AI segmentation → go to the image processing module → set model to U-Net → run simulation”',
    '• “Open Kalman filter then set measurement noise to 3 and run”',
    '• “Increase learning rate by 0.1”, “turn off the grid”, “pause”, “reset”, “faster”',
    '• “Add this to my notebook”, “go to the notebook”, “go to page 2”, “read this page aloud”',
    '• “Write: the heat equation is parabolic” (adds it to your notes)',
    '• “Explain this simulation”, “search Fourier transform”',
  ].join('\n');
}
