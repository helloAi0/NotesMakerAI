/**
 * Voice/text command understanding: fully offline, rule based (no network, no model download).
 * parseCommand("Open AI segmentation -> go to the image processing module -> set model to U-Net -> run simulation")
 * returns four typed steps that agentRuntime executes against the live app.
 */
import type { ViewId } from './agentBus';
import type { AnySim, Param } from '../sims/types';

export type Intent =
  | { kind: 'navigate'; view: ViewId }
  | { kind: 'open_sim'; query: string }
  | { kind: 'close_sim' }
  | { kind: 'goto_module'; name: string }
  | { kind: 'set_param'; param: string; value: string }
  | { kind: 'adjust_param'; param: string; dir: 1 | -1; amount?: string }
  | { kind: 'toggle_param'; param: string; on: boolean }
  | { kind: 'run' } | { kind: 'play' } | { kind: 'pause' } | { kind: 'reset' } | { kind: 'step' }
  | { kind: 'speed'; factor?: number; value?: number }
  | { kind: 'action'; name: string }
  | { kind: 'add_to_notebook' }
  | { kind: 'insert_text'; text: string }
  | { kind: 'read_aloud' } | { kind: 'stop_reading' }
  | { kind: 'goto_page'; n?: number; delta?: number }
  | { kind: 'explain'; q: string }
  | { kind: 'search'; q: string }
  | { kind: 'help' }
  | { kind: 'list_pdfs' } | { kind: 'summarize_pdf'; q: string } | { kind: 'open_pdf'; q: string }
  | { kind: 'make_folder'; name: string } | { kind: 'move_pdf'; q: string; folder: string } | { kind: 'import_pdfs'; folder: boolean }
  | { kind: 'gen_note'; topic: string } | { kind: 'summarize_page' }
  | { kind: 'add_task'; text: string; exam: boolean } | { kind: 'whats_due'; range: 'today' | 'tomorrow' | 'week' | 'all' } | { kind: 'complete_task'; q: string }
  | { kind: 'open_settings' } | { kind: 'insert_last' }
  | { kind: 'unknown'; raw: string };
export interface Step { raw: string; intent: Intent }

/* ---------- normalisation ---------- */
const ALIASES: [RegExp, string][] = [
  [/\bu[\s-]?net\b/g, 'unet'], [/\bk[\s-]?means\b/g, 'kmeans'], [/\bk[\s-]?nn\b/g, 'knn'], [/\bres[\s-]?net\b/g, 'resnet'],
  [/\bfast fourier transform\b/g, 'fft'], [/\bartificial intelligence\b/g, 'ai'], [/\bsegmentation\b/g, 'segmentation'],
  [/\bimage processing\b/g, 'imageprocessing'], [/\bneural networks?\b/g, 'neural'], [/\bp[\s-]?i[\s-]?d\b/g, 'pid'], [/\bl[\s-]?q[\s-]?r\b/g, 'lqr'],
];
export function norm(s: string): string {
  let t = ' ' + s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9.%+\-\s]/g, ' ') + ' ';
  for (const [re, to] of ALIASES) t = t.replace(re, to);
  return t.replace(/[-]/g, ' ').replace(/\s+/g, ' ').trim();
}
const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'in', 'on', 'for', 'and', 'my', 'this', 'that', 'it', 'please', 'simulation', 'simulations', 'sim', 'lab', 'module', 'section', 'tab', 'stage', 'panel', 'page', 'screen', 'open', 'launch', 'load', 'go', 'show', 'me', 'with', 'using', 'setting', 'parameter', 'value', 'slider', 'is', 'be', 'at']);
const stem = (w: string) => w.replace(/(ing|ers|er|ies|es|s)$/, m => (m === 'ies' ? 'y' : '')).replace(/^(.{3,}?)e$/, '$1');
export const tokens = (s: string) => norm(s).split(' ').filter(w => w && !STOP.has(w)).map(stem);

/** 0..1 how well the query words appear in the text. */
export function overlap(query: string, text: string): number {
  const q = tokens(query); if (!q.length) return 0;
  const t = new Set(tokens(text)); const joined = norm(text);
  let hit = 0; for (const w of q) if (t.has(w) || (w.length > 3 && joined.includes(w))) hit++;
  return hit / q.length;
}

/* ---------- numbers ---------- */
const ONES: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
export function parseNumber(s: string): number | null {
  const t = s.toLowerCase().replace(/,/g, '').trim();
  const m = t.match(/-?\d+(\.\d+)?/); if (m) { const v = parseFloat(m[0]); return /\b(minus|negative)\b/.test(t) && v > 0 ? -v : v; }
  const w = t.replace(/-/g, ' ').split(/\s+/); let total = 0, cur = 0, seen = false, neg = false, frac = '', inFrac = false;
  for (const x of w) {
    if (x === 'minus' || x === 'negative') { neg = true; continue; }
    if (x === 'point' || x === 'dot') { inFrac = true; continue; }
    if (x === 'half') { return neg ? -0.5 : 0.5; }
    if (x in ONES) { seen = true; if (inFrac) frac += ONES[x]; else cur += ONES[x]; }
    else if (x in TENS && !inFrac) { seen = true; cur += TENS[x]; }
    else if (x === 'hundred' && !inFrac) { seen = true; cur = (cur || 1) * 100; }
    else if (x === 'thousand' && !inFrac) { seen = true; total += (cur || 1) * 1000; cur = 0; }
  }
  if (!seen) return null; const v = total + cur + (frac ? parseFloat('0.' + frac) : 0); return neg ? -v : v;
}

/* ---------- chain splitting ---------- */
const FILLER = /^(?:(?:hey|ok|okay)\s+)?(?:notes|computer|assistant|jarvis|friday)[,:]?\s+|^(?:tell|ask) (?:friday|jarvis|the assistant) to\s+|^(?:please|kindly|now|then|and|so|just|can you|could you|would you|i want to|i would like to|i d like to|lets|let us)\s+/i;
export function splitChain(text: string): string[] {
  let t = text.replace(/[→⇒➔➜]/g, ' | ').replace(/-{1,2}>|=>/g, ' | ').replace(/\s>\s/g, ' | ');
  t = t.replace(/\s+(?:and then|then|after that|afterwards|next|finally|followed by)\s+/gi, ' | ');
  t = t.replace(/\s+and\s+(?=(?:open|go to|set|run|start|play|pause|reset|select|choose|change|increase|decrease|turn|add|save|read|stop|show|press|click|use|write|type|insert|dictate|summari[sz]e|create|make|move|import|upload|list|mark|complete|explain|search|find|generate|remind|close|go back)\b)/gi, ' | ');
  t = t.replace(/[.;]\s+(?=[A-Za-z])/g, ' | ').replace(/,\s+(?=(?:open|go to|set|run|start|select|choose|change|increase|decrease|turn|add|save|read|stop|press|click|use|summari[sz]e|create|move|import|list|mark|generate|remind|close)\b)/gi, ' | ');
  return t.split('|').map(s => s.replace(/[.,!?]+$/g, '').trim()).filter(Boolean);
}

const VIEWS: [ViewId, RegExp][] = [
  ['notebook', /^(digital )?(notebook|notes|note book|my notes)$/],
  ['simulations', /^(visuals? studio|visuals?|simulation(s)?( library| lab| studio| home)?|sim(s)? library|studio)$/],
  ['library', /^(pdf( and| &)? (source )?library|source library|pdf library|library|pdfs?)$/],
  ['dashboard', /^(dashboard|home( page)?|main( menu| page)?)$/],
  ['friday', /^(friday|friday chat|chat( with friday)?|ai assistant|study assistant|assistant( chat)?|chat ?bot)$/],
  ['planner', /^(study )?(planner|plan|schedule|tasks|to ?do( list)?)$/],
  ['generator', /^(ai )?(note )?generator|ai note generator$/],
];
export function viewFromName(name: string): ViewId | null {
  const n = norm(name).replace(/^(the|my) /, '');
  for (const [v, re] of VIEWS) if (re.test(n)) return v; return null;
}

/* ---------- single step ---------- */
export function parseStep(raw: string): Intent {
  let s = raw.trim(); for (let i = 0; i < 3; i++) s = s.replace(FILLER, '').trim();
  const n = norm(s); if (!n) return { kind: 'unknown', raw };
  let m: RegExpMatchArray | null;

  if (/^(go back|back|exit|close|leave|quit)( to)?( the)?( simulation| sim)?( library| home| list)?$/.test(n) && !/notebook/.test(n)) return { kind: 'close_sim' };
  if (/^(add|save|put|send|store|export)( this| it| the)?( simulation| experiment| result| results| snapshot)?( to| in| into| on)( the| my)? notebook$/.test(n) || /^add to notebook$/.test(n)) return { kind: 'add_to_notebook' };
  if ((m = n.match(/^(?:go to|open|goto|show|switch to|turn to)\s+page\s+(.+)$/))) { const v = parseNumber(m[1]); if (v != null) return { kind: 'goto_page', n: v }; }
  if (/^(next|following) page$/.test(n)) return { kind: 'goto_page', delta: 1 };
  if (/^(previous|prior|last|back) page$/.test(n)) return { kind: 'goto_page', delta: -1 };
  if (/^(stop|quit|pause|cancel|end)( the)? (reading|speaking|talking|narration|voice)$|^(be quiet|silence|shut up)$/.test(n)) return { kind: 'stop_reading' };
  if (/^(read|speak|narrate)( this| the| my| out)?( page| notes| note| aloud| out loud)?( aloud| out loud)?$/.test(n) || /^read (it )?(aloud|out loud)$/.test(n)) return { kind: 'read_aloud' };

  // ---- FRIDAY agent: settings, PDFs / folders, notes, planner (must run before the generic explain/open/write rules)
  if (/^(add|put|save|insert|write|paste)( the| this| that| it)?( summary| notes?| answer| text| output)( of it| of that)? (to|into|in|on) (my |the )?(notebook|note book|notes|page)$/.test(n)) return { kind: 'insert_last' };
  if (/^(open|show|go to|change|edit)( the| my)? (settings|preferences|ai settings|api keys?|ai keys?|voice settings)$/.test(n)) return { kind: 'open_settings' };
  if (/^(summari[sz]e|summary of|tldr|sum up|recap)( this| the| my| current)? (page|note|notes|notebook)$/.test(n)) return { kind: 'summarize_page' };
  if ((m = n.match(/^(?:summari[sz]e|summary of|sum up|recap|take (?:out )?(?:the )?summary (?:out )?(?:of|from)|get (?:the )?summary (?:of|from)|give me (?:the )?summary (?:of|from)|extract (?:the )?summary (?:of|from))\s+(?:my |the |this )?(?:pdf |document |file )?(.+?)(?:\s+(?:pdf|document|file))?$/)) && !/^(this|it|page|notes?|notebook|simulation|sim)$/.test(m[1])) return { kind: 'summarize_pdf', q: m[1] };
  if (/^(?:take|get|give me|extract|make|do)(?: out)? (?:the |a )?summary(?: out)?(?: of (?:it|this|that|the pdf|the document|the file))?$/.test(n)) return { kind: 'summarize_pdf', q: '' };
  if (/^(list|show|what are|what is in)( me)?( all)?( of)?( my| the)? (pdfs?|documents|files|pdf library|library|folders|pdf folders)( i have| in (my )?library)?$/.test(n)) return { kind: 'list_pdfs' };
  if ((m = n.match(/^(?:create|make|add|new)\s+(?:a |an )?(?:new )?folder(?: called| named| with name| for)?\s+(.+)$/)) || (m = n.match(/^(?:create|make|add|new)\s+(.+?)\s+folder$/))) return { kind: 'make_folder', name: s.replace(/^.*?folder\s*(?:called|named|with name|for)?\s*/i, '').trim() || m[1] };
  if (/^(import|upload|add|load|bring in|put|take|move)( in)?( my| some| a| the| this| that| whole)* ?(pdfs?|files?|documents?|folders?|pdf folders?)( from (my )?(computer|device|laptop|phone))?( (in|into|to|onto) (my |the )?(pdf( and source)?( section| library| folder)?|library|source library))?$/.test(n) && !/notebook/.test(n)) return { kind: 'import_pdfs', folder: /folder/.test(n.split(/ (in|into|to|onto) /)[0]) };
  if ((m = n.match(/^(?:move|put|file|copy|transfer|store|add|shift)\s+(?:the |my |this )?(?:pdf |file |document )?(.+?)\s+(?:in ?to|to|under|in)\s+(?:the |my )?(?:pdf )?(?:folder |section )?(.+?)(?:\s+(?:folder|section))?$/)) && !/^(notebook|planner|note book|page \d+|visuals?|studio)/.test(m[2]) && !/notebook|planner|\bpage\b/.test(m[1])) return { kind: 'move_pdf', q: m[1].replace(/\b(pdf|file|document)s?\b/g, '').trim() || m[1], folder: m[2] };
  if (/^(take|put|move|import|upload|add|bring|copy)\b.*\bfolders?\b.*\b(pdf|library|source)\b/.test(n) && !/notebook/.test(n)) return { kind: 'import_pdfs', folder: true };
  if (!/^(?:open|read|show|view|display)\s+(?:the |my )?(?:pdf )?(?:and )?(?:source )?(?:library|folders?|pdfs?)$/.test(n) && ((m = n.match(/^(?:open|read|show|view|display)\s+(?:the |my )?pdf\s+(.+)$/)) || (m = n.match(/^(?:open|read|show|view|display)\s+(?:the |my )?(.+?)\s+(?:pdf|document)$/)))) return { kind: 'open_pdf', q: m[1] };
  if ((m = n.match(/^(?:write|make|create|generate|draft|compose|prepare|take|build|give me|put together)(?: me| up| down)?(?: a| an| some| the)?(?: short| quick| brief| detailed| complete| full| good| study)* (?:notes?|summary|study notes|revision notes|cheat ?sheet) (?:on|about|for|of|regarding)\s+(.+)$/))) return { kind: 'gen_note', topic: s.replace(/^.*?\b(?:on|about|for|of|regarding)\s+/i, '').trim() || m[1] };
  if ((m = n.match(/^(?:remind me to|dont let me forget to|do not forget to)\s+(.+)$/))) return { kind: 'add_task', text: m[1], exam: false };
  if ((m = n.match(/^(?:add|create|new|make|schedule|set|put)\s+(?:a |an |new |my )*(task|todo|to do|reminder|exam|test|quiz|assignment|deadline|homework|revision)\s*(?:to|for|:|called|named)?\s*(.+)$/))) return { kind: 'add_task', text: s.replace(/^\s*\S+\s+(?:(?:a|an|new|my)\s+)*\S+\s*(?:to|for|:|called|named)?\s*/i, '').replace(/\s+(?:to|in|on)\s+(?:my |the )?(?:study )?(?:planner|plan|schedule|tasks|list)$/i, '').trim() || m[2], exam: /^(exam|test|quiz)$/.test(m[1]) };
  if (/^(what|whats|what s)( is| are)?( my)?( due| coming up| pending| left| on)( today| tomorrow| this week| soon)?$/.test(n) || /^(show|list|view|check|read)( me| out)?( my| the)? (tasks|todos|to dos|deadlines|assignments|schedule|study plan|plan|planner)( for (today|tomorrow|this week))?$/.test(n)) return { kind: 'whats_due', range: /tomorrow/.test(n) ? 'tomorrow' : /today/.test(n) ? 'today' : /week|soon/.test(n) ? 'week' : 'all' };
  if ((m = n.match(/^(?:mark|set|tick|check off|check|complete|finish|done with)\s+(?:task\s+)?(.+?)\s+(?:as\s+)?(?:done|complete|completed|finished)$/)) || (m = n.match(/^(?:complete|finish|tick off|check off|done with)\s+(?:task\s+)?(.+)$/))) return { kind: 'complete_task', q: m[1] };
  if (/^(explain|describe|summari[sz]e|what is|whats|what am i|tell me|why|how does|how do)\b/.test(n)) return { kind: 'explain', q: s };
  if (/^(help|what can you do|what can i say|commands|show commands)\b/.test(n)) return { kind: 'help' };
  if ((m = n.match(/^(search|find|look up|look for|lookup)( for)? (.+)$/))) return { kind: 'search', q: m[3] };
  if ((m = n.match(/^(?:write|type|insert|dictate|note|jot down|add note|note down)(?: that)?\s+(.+)$/)) && !/\bto (the |my )?notebook$/.test(n)) return { kind: 'insert_text', text: s.replace(/^\s*\S+(?:\s+(?:down|that|note))?\s+/i, '') };

  // go to the <x> module / section / tab / stage (inside the open simulation)
  if ((m = n.match(/^(?:go to|open|switch to|move to|jump to|select|show|enter|navigate to|take me to)\s+(?:the\s+)?(.+?)\s+(module|section|tab|stage|panel|part|step|phase|mode|view|screen|page)$/)) && !viewFromName(m[1] + ' ' + m[2]) && !viewFromName(m[1])) return { kind: 'goto_module', name: m[1] };

  // "run simulation" / "start it" with no specific name = run what is open (must come before navigation)
  if (/^(run|start|execute|begin|simulate|launch|play|fire)( the| this| my)?( simulation| simulator| sim| experiment| model| analysis| it| now| again| pipeline| segmentation| inference)*$/.test(n)) return { kind: /^play/.test(n) ? 'play' : 'run' };

  // navigation / opening a simulation
  if ((m = n.match(/^(open|go to|goto|navigate to|switch to|take me to|show me|show|launch|load|start|bring up|run)\s+(?:the\s+|my\s+)?(.+)$/))) {
    const verb = m[1], rest = m[2];
    const v = viewFromName(rest); if (v) return { kind: 'navigate', view: v };
    if (/^(it|this|that|the simulation|simulation|sim|the sim|simulation now|experiment|the experiment|the model|model|simulation again)$/.test(rest) && /^(run|start|launch|load)$/.test(verb)) return { kind: verb === 'run' || verb === 'start' ? 'run' : 'play' };
    if (verb === 'show' && /^(me )?(the )?(explanation|help)/.test(rest)) return { kind: 'help' };
    if (/^(show|go to|goto)$/.test(verb) && !/(simulation|sim|lab)\b/.test(rest) && rest.split(' ').length <= 1) { /* "show grid" -> toggle */ return { kind: 'toggle_param', param: rest, on: true }; }
    return { kind: 'open_sim', query: rest.replace(/\b(simulation|simulator|sim|lab|module|experiment|model)\b/g, '').trim() || rest };
  }

  if ((m = n.match(/^(?:set|change|switch|select|choose|pick|make|adjust|put|update)\s+(?:the\s+)?(.+?)\s+(?:to|as|=|equals?|equal to|into|be|at)\s+(.+)$/))) return { kind: 'set_param', param: m[1], value: m[2] };
  if ((m = n.match(/^(?:use|select|choose|pick|apply|try|switch to|change to)\s+(?:the\s+)?(.+)$/))) return { kind: 'set_param', param: '', value: m[1] };
  if ((m = n.match(/^(increase|raise|boost|bump up|turn up|up|decrease|reduce|lower|bump down|turn down|down|decrement)\s+(?:the\s+)?(.+?)(?:\s+by\s+(.+))?$/))) return { kind: 'adjust_param', param: m[2], dir: /^(increase|raise|boost|bump up|turn up|up)$/.test(m[1]) ? 1 : -1, amount: m[3] };
  if ((m = n.match(/^(?:turn|switch)\s+(on|off)\s+(?:the\s+)?(.+)$/))) return { kind: 'toggle_param', param: m[2], on: m[1] === 'on' };
  if ((m = n.match(/^(enable|disable|hide|activate|deactivate)\s+(?:the\s+)?(.+)$/))) return { kind: 'toggle_param', param: m[2], on: /^(enable|activate)$/.test(m[1]) };

  if (/^(faster|speed up|fast forward|hurry)$/.test(n)) return { kind: 'speed', factor: 2 };
  if (/^(slower|slow down|slow motion)$/.test(n)) return { kind: 'speed', factor: 0.5 };
  if ((m = n.match(/^(?:set )?(?:the )?speed(?: to)? (.+?)(?: x| times)?$/))) { const v = parseNumber(m[1]); if (v != null) return { kind: 'speed', value: v }; }
  if (/^(run|start|execute|begin|simulate|go|play|launch|fire|do it|run it|run again|rerun)( the| this)?( simulation| sim| experiment| model| analysis| it| now| again| segmentation| pipeline)*$/.test(n) || /^(run|start|execute|begin)\b/.test(n)) return { kind: /^(play|resume)/.test(n) ? 'play' : 'run' };
  if (/^(pause|stop|halt|freeze|hold)( the| this)?( simulation| sim| it| everything)?$/.test(n)) return { kind: 'pause' };
  if (/^(resume|continue|unpause|keep going|carry on)( the| this)?( simulation| sim)?$/.test(n)) return { kind: 'play' };
  if (/^(reset|restart|start over|clear|reinitiali[sz]e|new run)( the| this)?( simulation| sim| it| everything)?$/.test(n)) return { kind: 'reset' };
  if (/^(step|single step|next step|step forward|advance)( once)?$/.test(n)) return { kind: 'step' };
  if ((m = n.match(/^(?:press|click|tap|hit|push|trigger|do|use|perform)\s+(?:the\s+)?(.+?)(?:\s+button)?$/))) return { kind: 'action', name: m[1] };
  return { kind: 'unknown', raw };
}

export function parseCommand(text: string): Step[] {
  text = text.replace(/^\s*(?:(?:hey|ok|okay)\s+)?(?:notes|computer|assistant|jarvis|friday)\s*[,:]?\s+/i, '');
  return splitChain(text).map(raw => ({ raw, intent: parseStep(raw) }));
}

/** True when an utterance should be treated as a command and not typed into the notes (while dictating). */
export function looksLikeCommand(text: string): boolean {
  if (/(->|→|=>)/.test(text)) return true;
  if (/^\s*(?:hey |ok |okay )?(?:notes|computer|assistant|jarvis|friday|command)\b/i.test(text)) return true;
  return false;
}

/* ---------- resolving names against what is on screen ---------- */
export function resolveSim<T extends AnySim>(query: string, sims: T[]): { sim: T; score: number } | null {
  let best: { sim: T; score: number } | null = null;
  for (const sim of sims) {
    const title = overlap(query, sim.title), idm = overlap(query, sim.id.replace(/[_-]/g, ' '));
    const meta = Math.max(overlap(query, [...(sim.tags ?? []), ...(sim.covers ?? [])].join(' ')), overlap(query, `${sim.topic} ${sim.subtopic} ${sim.category}`));
    const score = Math.max(title * 1.0, idm * 0.95, meta * 0.8) + (title > 0 && meta > 0 ? 0.05 : 0);
    if (score > (best?.score ?? 0)) best = { sim, score };
  }
  return best && best.score >= 0.5 ? best : null;
}
export function resolveParam(name: string, params: Param[]): Param | null {
  let best: Param | null = null, bs = 0;
  for (const p of params) { const sc = Math.max(overlap(name, p.label), overlap(name, p.id) * 0.9, norm(p.label) === norm(name) ? 1.2 : 0); if (sc > bs) { bs = sc; best = p; } }
  return bs >= 0.5 ? best : null;
}
export function resolveOption(value: string, p: Param & { kind: 'select' }): { value: string; label: string } | null {
  const v = norm(value); let best: { value: string; label: string } | null = null, bs = 0;
  for (const o of p.options) { const sc = norm(o.label) === v || norm(o.value) === v ? 2 : Math.max(overlap(value, o.label), overlap(value, o.value) * 0.9, norm(o.label).includes(v) && v.length > 1 ? 0.9 : 0); if (sc > bs) { bs = sc; best = o; } }
  return best && bs >= 0.5 ? best : null;
}
export function parseBool(v: string): boolean | null {
  const n = norm(v); if (/^(on|true|yes|enable|enabled|show|shown|visible|active)$/.test(n)) return true; if (/^(off|false|no|disable|disabled|hide|hidden|inactive)$/.test(n)) return false; return null;
}
