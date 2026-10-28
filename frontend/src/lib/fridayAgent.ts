/**
 * FRIDAY's autonomous loop (needs an AI provider key): observe the app → ask the model for a plan expressed in FRIDAY's own
 * command language → execute it with the real app controls → observe again, up to a few rounds, until the goal is done.
 * Without a key FRIDAY still runs every structured command offline (see agentRuntime); this loop adds free-form goals.
 */
import { cap } from './agentBus';
import { runOne, setLastOutput } from './agentRuntime';
import type { StepResult } from './agentRuntime';
import { llmConfig, pdfList } from './friday';
import { listFolders } from './libraryStore';
import { listTasks } from './planner';
import { generate } from './aiClient';
import { parseJsonLoose } from './aiClient';

export const COMMAND_LANGUAGE = [
  'open <simulation name>', 'go back', 'go to the <module/tab name> module', 'set <parameter> to <value>', 'increase|decrease <parameter> by <n>', 'turn on|off <toggle>', 'press <button name>', 'run simulation', 'pause', 'reset', 'step', 'faster', 'slower',
  'open notebook|dashboard|generator|planner|pdf library|visuals studio|friday', 'go to page <n>', 'write <text to add to the notebook page>', 'write a note about <topic>', 'summarize this page', 'read this page aloud', 'stop reading', 'add this to my notebook', 'add the summary to my notebook',
  'list my pdfs', 'create folder <name>', 'move <pdf name> to folder <name>', 'summarize my pdf <name>', 'open pdf <name>', 'import pdfs', 'import folder',
  'add task <text> by <date>', 'add exam <text> on <date>', 'what is due this week', 'mark <task> done', 'explain this simulation', 'search <words>', 'open settings',
];

export function snapshot(): string {
  const app = cap('app'), sim = cap('sim'), nb = cap('notebook');
  const lines = [`view: ${app?.view() ?? 'unknown'}`];
  if (sim) lines.push(`open simulation: ${sim.sim.title}`, 'parameters: ' + sim.sim.params.map(p => `${p.label} [id ${p.id}] = ${String(sim.values()[p.id])}${p.kind === 'select' ? ' (options: ' + p.options.map(o => o.label).join(' | ') + ')' : p.kind === 'number' ? ` (range ${p.min}..${p.max})` : ''}`).join('; '), 'buttons: ' + (sim.sim.actions ?? []).map(a => a.label).join(', '), 'readouts: ' + sim.readouts().slice(0, 6).map(r => `${r.label}=${r.value}`).join('; '));
  if (nb) lines.push(`notebook: ${nb.title()} page ${nb.page()}; text: ${nb.getText().slice(0, 600).replace(/\s+/g, ' ')}`);
  lines.push(`pdf folders: ${listFolders().join(', ') || '(none)'}`);
  const open = listTasks().filter(t => !t.done).slice(0, 6); lines.push(`open tasks: ${open.map(t => `${t.title}${t.due ? ' (' + t.due + ')' : ''}`).join('; ') || '(none)'}`);
  return lines.join('\n');
}

export interface AgentReport { step: (r: StepResult) => void; say: (t: string) => void }
export async function agentRun(goal: string, rep: AgentReport, maxRounds = 4): Promise<{ ok: boolean; summary: string } | null> {
  const cfg = llmConfig(); if (!cfg) return null;
  const docs = await pdfList(); const history: string[] = []; let finalSay = '';
  for (let round = 1; round <= maxRounds; round++) {
    const prompt = `You are FRIDAY, an autonomous agent that operates the web app "Notes Maker AI" by issuing short commands in its command language. Achieve the user's GOAL with as few commands as possible.\n\nCOMMAND LANGUAGE (use these shapes exactly, one command per array item):\n${COMMAND_LANGUAGE.map(c => '- ' + c).join('\n')}\n\nCURRENT APP STATE:\n${snapshot()}\nPDFs in library: ${docs.map(d => d.name + (d.folder ? ` [folder ${d.folder}]` : '')).join('; ') || '(none)'}\n\nGOAL: ${goal}\n\nPREVIOUS ROUNDS:\n${history.join('\n') || '(none yet)'}\n\nRespond with ONLY JSON: {"commands": ["..."], "say": "one short sentence to the user", "done": true|false}. Set done=true when the goal is achieved or cannot be achieved. Never invent parameter or file names that are not in the state. If information is missing, set commands to [] and ask in "say".`;
    let plan: { commands?: string[]; say?: string; done?: boolean };
    try { plan = parseJsonLoose(await generate(cfg, prompt, { json: true, stream: false, retries: 1, timeoutMs: 45000, maxTokens: 700 })); } catch (e) { return { ok: false, summary: `I could not reach the AI planner (${(e as Error).message.slice(0, 120)}). Structured commands still work offline.` }; }
    const cmds = Array.isArray(plan.commands) ? plan.commands.filter(c => typeof c === 'string' && c.trim()).slice(0, 8) : []; if (plan.say) { finalSay = plan.say; rep.say(plan.say); }
    let failed = false; const out: string[] = [];
    for (const c of cmds) { const r = await runOne(c); rep.step(r); out.push(`${r.ok ? 'OK' : 'FAILED'}: ${c} → ${r.message.slice(0, 160)}`); if (r.message && r.ok) setLastOutput(r.message); if (!r.ok) { failed = true; break; } }
    history.push(`Round ${round}: ${out.join(' | ') || '(no commands)'}`);
    if (plan.done && !failed) return { ok: true, summary: finalSay || 'Done.' };
    if (!cmds.length) return { ok: !failed, summary: finalSay || 'I need more information to continue.' };
  }
  return { ok: false, summary: finalSay || 'I stopped after several rounds without finishing; tell me what to adjust.' };
}
