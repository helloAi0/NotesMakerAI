/* CS / chemistry gap-fillers: finite automata & Turing machines, cache / page replacement, molecular-orbital theory. */
import { defineSim, UG_ENG, PG_ALL, SCHOOL_11_12 } from './types';
import type { EducationLevel } from './types';
import { C, TAU, clamp, fmt, line, plot, polyline, text, circle, arrow, panel } from './draw';
import type { Ctx, Rect } from './draw';
import { meta, mulberry } from './univ_util';

const bg = (c: Ctx, w: number, h: number) => { c.fillStyle = C.bg; c.fillRect(0, 0, w, h); };
const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w: Math.max(30, w), h: Math.max(30, h) });
const clip = (c: Ctx, r: Rect) => { c.beginPath(); c.rect(r.x + 34, r.y + 20, Math.max(1, r.w - 42), Math.max(1, r.h - 46)); c.clip(); };

/* ================================================================== */
/*  1. Finite automata and Turing machines                             */
/* ================================================================== */
export type MachineId = 'dfa3' | 'nfa01' | 'tminc' | 'tmpal';
export interface Cfg { machine: MachineId; states: string[]; head: number; tape: string[]; status: 'run' | 'accept' | 'reject'; steps: number; note: string }
export const BLANK = '_';
export const PRESETS: Record<MachineId, string[]> = {
  dfa3: ['110', '1001', '111', '10101', '11000', '1011'],
  nfa01: ['1101', '0110', '00101', '1', '0101', '11'],
  tminc: ['1011', '111', '0', '1001', '11111', '100'],
  tmpal: ['abba', 'aba', 'ab', 'babab', 'aabbaa', 'abbb'],
};
export const MACHINE_INFO: Record<MachineId, { name: string; kind: string; desc: string; nodes: Record<string, [number, number]>; edges: [string, string, string][]; accepting: string[]; start: string }> = {
  dfa3: { name: 'DFA: binary number divisible by 3', kind: 'DFA', desc: 'State = remainder mod 3 of the prefix read; reading bit b maps r → (2r + b) mod 3.', nodes: { q0: [0.2, 0.5], q1: [0.5, 0.25], q2: [0.8, 0.5] }, edges: [['q0', 'q0', '0'], ['q0', 'q1', '1'], ['q1', 'q2', '0'], ['q1', 'q0', '1'], ['q2', 'q1', '0'], ['q2', 'q2', '1']], accepting: ['q0'], start: 'q0' },
  nfa01: { name: 'NFA: strings ending in 01', kind: 'NFA', desc: 'Nondeterministically guess where the final 01 starts; accept if any branch reaches s2 at the end of input.', nodes: { s0: [0.2, 0.5], s1: [0.5, 0.5], s2: [0.8, 0.5] }, edges: [['s0', 's0', '0,1'], ['s0', 's1', '0'], ['s1', 's2', '1']], accepting: ['s2'], start: 's0' },
  tminc: { name: 'Turing machine: binary incrementer', kind: 'TM', desc: 'Scan right to the end, then add 1 with carry moving left (1→0 carry, 0/blank→1 halt).', nodes: { scan: [0.25, 0.5], carry: [0.65, 0.5], halt: [0.92, 0.5] }, edges: [['scan', 'scan', '0,1 → R'], ['scan', 'carry', '_ → L'], ['carry', 'carry', '1→0, L'], ['carry', 'halt', '0→1 | _→1']], accepting: ['halt'], start: 'scan' },
  tmpal: { name: 'Turing machine: palindromes over {a,b}', kind: 'TM', desc: 'Erase the leftmost symbol, run to the right end and compare it with the last; repeat on the shrinking tape.', nodes: { q0: [0.1, 0.5], qA: [0.3, 0.2], qB: [0.3, 0.8], qA2: [0.55, 0.2], qB2: [0.55, 0.8], q3: [0.7, 0.5], acc: [0.92, 0.3], rej: [0.92, 0.75] }, edges: [['q0', 'qA', 'a→_ R'], ['q0', 'qB', 'b→_ R'], ['q0', 'acc', '_'], ['qA', 'qA2', '_ L'], ['qB', 'qB2', '_ L'], ['qA2', 'q3', 'a→_ L'], ['qB2', 'q3', 'b→_ L'], ['qA2', 'acc', '_'], ['qB2', 'acc', '_'], ['qA2', 'rej', 'b'], ['qB2', 'rej', 'a'], ['q3', 'q0', '_ R']], accepting: ['acc'], start: 'q0' },
};
export function initCfg(machine: MachineId, input: string): Cfg {
  const info = MACHINE_INFO[machine];
  if (machine === 'dfa3' || machine === 'nfa01') return { machine, states: [info.start], head: 0, tape: input.split(''), status: 'run', steps: 0, note: 'start' };
  return { machine, states: [info.start], head: 1, tape: [BLANK, ...input.split(''), BLANK], status: 'run', steps: 0, note: 'start' };
}
export function stepCfg(cf: Cfg): Cfg {
  if (cf.status !== 'run') return cf;
  const info = MACHINE_INFO[cf.machine], st = cf.states[0], tape = cf.tape.slice(); let head = cf.head, note = '', states = cf.states, status: Cfg['status'] = 'run';
  if (cf.machine === 'dfa3') {
    if (head >= tape.length) { status = info.accepting.includes(st) ? 'accept' : 'reject'; return { ...cf, status, note: status === 'accept' ? 'input consumed in accepting state' : 'input consumed in non-accepting state' }; }
    const b = +tape[head], r = +st[1], nr = (2 * r + b) % 3; states = [`q${nr}`]; note = `δ(q${r}, ${b}) = q${nr}  (2·${r}+${b} mod 3)`; head++;
    if (head >= tape.length) status = nr === 0 ? 'accept' : 'reject';
  } else if (cf.machine === 'nfa01') {
    if (head >= tape.length) { status = states.includes('s2') ? 'accept' : 'reject'; return { ...cf, status }; }
    const b = tape[head], next = new Set<string>(); for (const s of states) { if (s === 's0') { next.add('s0'); if (b === '0') next.add('s1'); } if (s === 's1' && b === '1') next.add('s2'); }
    states = [...next].sort(); note = `read ${b}: {${cf.states.join(',')}} → {${states.join(',') || '∅'}}`; head++;
    if (head >= tape.length) status = states.includes('s2') ? 'accept' : 'reject'; else if (!states.length) status = 'reject';
  } else if (cf.machine === 'tminc') {
    const sym = tape[head];
    if (st === 'scan') { if (sym === '0' || sym === '1') { head++; note = `scan right over ${sym}`; } else { states = ['carry']; head--; note = 'end of number: start carry'; } }
    else if (st === 'carry') { if (sym === '1') { tape[head] = '0'; head--; note = '1+1 = 0 carry 1'; } else { tape[head] = '1'; states = ['halt']; status = 'accept'; note = sym === '0' ? '0+1 = 1, done' : 'blank → write leading 1, done'; } }
  } else {
    const sym = tape[head];
    const set = (ns: string, w: string, d: number, n: string) => { tape[head] = w; states = [ns]; head += d; note = n; };
    if (head < 0) { head = 0; tape.unshift(BLANK); } if (head >= tape.length) tape.push(BLANK);
    switch (st) {
      case 'q0': if (sym === 'a') set('qA', BLANK, 1, 'erase leading a, remember a'); else if (sym === 'b') set('qB', BLANK, 1, 'erase leading b, remember b'); else { states = ['acc']; status = 'accept'; note = 'tape empty: palindrome'; } break;
      case 'qA': case 'qB': if (sym === 'a' || sym === 'b') { head++; note = 'run right'; } else { states = [st + '2']; head--; note = 'reached the end, step back to last symbol'; } break;
      case 'qA2': case 'qB2': { const want = st === 'qA2' ? 'a' : 'b'; if (sym === want) set('q3', BLANK, -1, `last symbol ${want} matches`); else if (sym === BLANK) { states = ['acc']; status = 'accept'; note = 'only the middle symbol was left'; } else { states = ['rej']; status = 'reject'; note = `last symbol ${sym} ≠ ${want}`; } break; }
      case 'q3': if (sym === BLANK) { states = ['q0']; head++; note = 'back at the left blank'; } else { head--; note = 'run left'; } break;
    }
    if (head < 0) { tape.unshift(BLANK); head = 0; } if (head >= tape.length) tape.push(BLANK);
  }
  return { ...cf, states, head, tape, status, steps: cf.steps + 1, note };
}
/** Run to completion; returns the final config (used by the checker). */
export function runMachine(machine: MachineId, input: string, limit = 5000): Cfg { let cf = initCfg(machine, input); for (let i = 0; i < limit && cf.status === 'run'; i++) cf = stepCfg(cf); return cf; }

interface AuS { cf: Cfg; acc: number; hold: number; off: number }
const inputOf = (m: MachineId, k: number, off = 0) => PRESETS[m][(clamp(k - 1, 0, PRESETS[m].length - 1) + off) % PRESETS[m].length];
export const automataTuring = defineSim<AuS>({
  id: 'automata_turing', title: 'Finite Automata and Turing Machines: Step-Through Simulator',
  ...meta('Computer Science', 'Intermediate', 'Theory of Computation', 'Finite automata / Turing machines', 'DFA, NFA subset tracking, Turing machine tape and head', [...UG_ENG, 'BCA', 'B.Sc', ...PG_ALL]),
  covers: ['Finite automata', 'DFA', 'NFA', 'Turing machines', 'Regular languages', 'Tape and head', 'Decidability basics'],
  tags: ['automata', 'turing machine', 'DFA', 'NFA', 'TOC', 'theory of computation', 'state machine', 'GATE CS', 'formal languages', 'palindrome', 'divisible by 3'],
  learningObjectives: ['Trace a DFA/NFA on an input, watching the current state(s).', 'See a Turing machine read, write and move on its tape.', 'Predict accept/reject before the machine halts.'],
  assumptions: ['Machines are fixed teaching examples with deterministic (DFA, TM) or set-based (NFA) execution; the tape is unbounded in both directions.'],
  blurb: 'Pick a machine and an input string and watch the state diagram highlight, the input pointer or tape head move, and the verdict appear. Four complete machines: DFA, NFA, binary-increment TM and palindrome TM.',
  hint: 'Try the palindrome TM on "ab" (rejects) and "abba" (accepts). For the DFA, state names are remainders mod 3 of the binary prefix.',
  params: [
    { kind: 'select', id: 'machine', label: 'Machine', value: 'dfa3', resetOnChange: true, options: [{ value: 'dfa3', label: 'DFA: divisible by 3' }, { value: 'nfa01', label: 'NFA: ends with 01' }, { value: 'tminc', label: 'TM: binary +1' }, { value: 'tmpal', label: 'TM: palindrome' }] },
    { kind: 'number', id: 'input', label: 'Test input number (1–6)', min: 1, max: 6, step: 1, value: 1, digits: 0, resetOnChange: true },
    { kind: 'number', id: 'rate', label: 'Steps per second', min: 0.5, max: 12, step: 0.5, value: 2.5, digits: 1 },
    { kind: 'toggle', id: 'loop', label: 'Loop through all test inputs', value: true },
    { kind: 'toggle', id: 'notes', label: 'Show transition explanations', value: true },
  ],
  actions: [{ id: 'restart', label: 'Restart on this input' }],
  dt: 1 / 30, previewSeconds: 2,
  init(v) { const m = v.machine as MachineId; return { cf: initCfg(m, inputOf(m, v.input as number)), acc: 0, hold: 0, off: 0 }; },
  action(s, v) { const m = v.machine as MachineId; s.cf = initCfg(m, inputOf(m, v.input as number, s.off)); s.hold = 0; },
  step(s, v, dt) {
    const m = v.machine as MachineId; if (s.cf.machine !== m || (s.cf.steps === 0 && s.cf.tape.join('').replace(/_/g, '') !== inputOf(m, v.input as number, s.off))) { s.off = 0; s.cf = initCfg(m, inputOf(m, v.input as number)); s.hold = 0; }
    if (s.cf.status !== 'run') { s.hold += dt; if (s.hold > 2.2 && v.loop) { s.off = (s.off + 1) % PRESETS[m].length; s.cf = initCfg(m, inputOf(m, v.input as number, s.off)); s.hold = 0; } return; }
    s.acc += dt * (v.rate as number); while (s.acc >= 1) { s.acc -= 1; s.cf = stepCfg(s.cf); }
  },
  draw(c, s, v, w, h) {
    bg(c, w, h); const cf = s.cf, info = MACHINE_INFO[cf.machine], A = R(8, 8, w - 16, h * 0.56), T = R(8, h * 0.56 + 14, w - 16, h * 0.44 - 22); panel(c, A); panel(c, T);
    text(c, info.name, A.x + 10, A.y + 16, C.text, 12, 'left', 'alphabetic', true);
    const P = (n: string): [number, number] => [A.x + info.nodes[n][0] * A.w, A.y + 22 + info.nodes[n][1] * (A.h - 36)], r = Math.max(14, Math.min(24, A.h / 9));
    const seen = new Set<string>();
    for (const [a, b, lab] of info.edges) {
      const [x1, y1] = P(a), [x2, y2] = P(b); const active = cf.states.includes(a) && cf.status === 'run';
      const col = active ? C.amber : 'rgba(148,163,184,0.6)';
      if (a === b) { c.strokeStyle = col; c.lineWidth = 1.6; c.beginPath(); c.arc(x1, y1 - r - 7, 9, 0, TAU); c.stroke(); text(c, lab, x1, y1 - r - 22, col, 10, 'center'); continue; }
      const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d, rev = seen.has(`${b}>${a}`); seen.add(`${a}>${b}`);
      const off = rev ? 26 : (cf.machine === 'tmpal' ? 8 : 0), cxp = (x1 + x2) / 2 + nx * off, cyp = (y1 + y2) / 2 + ny * off, ux1 = (cxp - x1), uy1 = (cyp - y1), l1 = Math.hypot(ux1, uy1) || 1, ux2 = (cxp - x2), uy2 = (cyp - y2), l2 = Math.hypot(ux2, uy2) || 1;
      const sx = x1 + (ux1 / l1) * r, sy = y1 + (uy1 / l1) * r, ex = x2 + (ux2 / l2) * (r + 3), ey = y2 + (uy2 / l2) * (r + 3);
      c.strokeStyle = col; c.lineWidth = 1.6; c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(cxp, cyp, ex, ey); c.stroke();
      const ang = Math.atan2(ey - cyp, ex - cxp); c.fillStyle = col; c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex - 8 * Math.cos(ang - 0.4), ey - 8 * Math.sin(ang - 0.4)); c.lineTo(ex - 8 * Math.cos(ang + 0.4), ey - 8 * Math.sin(ang + 0.4)); c.fill();
      text(c, lab, cxp + nx * 8, cyp + ny * 8 + 3, col, 9, 'center');
    }
    for (const n of Object.keys(info.nodes)) {
      const [x, y] = P(n), cur = cf.states.includes(n), acc = info.accepting.includes(n), bad = n === 'rej';
      circle(c, x, y, r, cur ? (cf.status === 'accept' ? 'rgba(52,211,153,0.5)' : cf.status === 'reject' ? 'rgba(248,113,113,0.5)' : 'rgba(251,191,36,0.4)') : C.panel2, bad ? C.red : cur ? C.amber : C.axis, cur ? 3 : 1.5); if (acc) circle(c, x, y, r - 4, undefined, C.green, 1.5);
      text(c, n, x, y + 4, C.text, Math.min(12, r * 0.55), 'center', 'alphabetic', true);
      if (n === info.start) arrow(c, x - r - 22, y, x - r - 2, y, C.axis, 1.5, 6);
    }
    // tape / input
    const cells = Math.max(8, cf.tape.length), cw = Math.min(40, (T.w - 40) / Math.min(cells, 18)), tx = T.x + 20, ty = T.y + 40;
    text(c, cf.machine.startsWith('tm') ? 'Tape (head ▼)' : 'Input string (pointer ▼ = next symbol)', T.x + 10, T.y + 16, C.text, 11, 'left', 'alphabetic', true);
    const show = Math.floor((T.w - 40) / cw), start = clamp(cf.head - Math.floor(show / 2), 0, Math.max(0, cf.tape.length - show));
    for (let i = start; i < Math.min(cf.tape.length, start + show); i++) { const x = tx + (i - start) * cw, isH = i === cf.head && !(cf.head >= cf.tape.length); c.fillStyle = isH ? 'rgba(251,191,36,0.25)' : C.panel2; c.fillRect(x, ty, cw - 2, 30); c.strokeStyle = isH ? C.amber : C.axis; c.strokeRect(x, ty, cw - 2, 30); text(c, cf.tape[i], x + cw / 2 - 1, ty + 21, i < cf.head && !cf.machine.startsWith('tm') ? C.dim : C.text, 15, 'center', 'alphabetic', true); if (isH) text(c, '▼', x + cw / 2 - 1, ty - 4, C.amber, 14, 'center'); }
    if (v.notes) text(c, cf.note, T.x + 10, T.y + T.h - 30, C.cyan, 11);
    const verdict = cf.status === 'run' ? `running… step ${cf.steps}` : cf.status === 'accept' ? `ACCEPT after ${cf.steps} steps` : `REJECT after ${cf.steps} steps`;
    text(c, verdict, T.x + 10, T.y + T.h - 10, cf.status === 'accept' ? C.green : cf.status === 'reject' ? C.red : C.amber, 12, 'left', 'alphabetic', true);
  },
  readouts(s) {
    const cf = s.cf, info = MACHINE_INFO[cf.machine], input = cf.machine.startsWith('tm') ? cf.tape.join('').replace(/_/g, '') : cf.tape.join('');
    return [{ label: 'Machine', value: info.kind }, { label: cf.machine.startsWith('tm') ? 'Tape contents' : 'Input string', value: input || '(empty)' }, { label: 'Current state(s)', value: cf.states.join(', ') || '∅' }, { label: 'Steps taken', value: cf.steps, digits: 0 }, { label: 'Verdict', value: cf.status === 'run' ? 'running' : cf.status }, { label: 'Description', value: info.desc }];
  },
  equations(s) { const cf = s.cf; return cf.machine === 'dfa3' ? ['\\delta(r,b)=(2r+b)\\bmod 3,\\qquad L=\\{w\\in\\{0,1\\}^*:\\ (w)_2\\equiv0\\ (\\mathrm{mod}\\ 3)\\}'] : cf.machine === 'nfa01' ? ['\\hat\\delta(S,a)=\\bigcup_{q\\in S}\\delta(q,a),\\quad L=(0|1)^*01'] : ['\\delta:\\ Q\\times\\Gamma\\to Q\\times\\Gamma\\times\\{L,R\\},\\qquad (q,\\ a)\\mapsto(q\',\\ a\',\\ D)']; },
});

/* ================================================================== */
/*  2. Cache / page replacement                                        */
/* ================================================================== */
export type Policy = 'fifo' | 'lru' | 'lfu' | 'opt' | 'clock';
export interface CacheStep { page: number; frames: (number | null)[]; hit: boolean; evicted: number | null; hand?: number }
export function simulateCache(refs: number[], nFrames: number, policy: Policy): { steps: CacheStep[]; faults: number } {
  const frames: (number | null)[] = new Array(nFrames).fill(null), loadT: number[] = new Array(nFrames).fill(0), lastT: number[] = new Array(nFrames).fill(0), freq: number[] = new Array(nFrames).fill(0), ref: number[] = new Array(nFrames).fill(0);
  let hand = 0, faults = 0; const steps: CacheStep[] = [];
  refs.forEach((p, t) => {
    const idx = frames.indexOf(p);
    if (idx >= 0) { lastT[idx] = t; freq[idx]++; ref[idx] = 1; steps.push({ page: p, frames: frames.slice(), hit: true, evicted: null, hand }); return; }
    faults++; let victim = frames.indexOf(null), evicted: number | null = null;
    if (victim < 0) {
      const ix = frames.map((_, i) => i);
      if (policy === 'fifo') victim = ix.reduce((a, b) => (loadT[b] < loadT[a] ? b : a));
      else if (policy === 'lru') victim = ix.reduce((a, b) => (lastT[b] < lastT[a] ? b : a));
      else if (policy === 'lfu') victim = ix.reduce((a, b) => (freq[b] < freq[a] || (freq[b] === freq[a] && loadT[b] < loadT[a]) ? b : a));
      else if (policy === 'opt') { const nxt = (pg: number) => { const k = refs.indexOf(pg, t + 1); return k < 0 ? Infinity : k; }; victim = ix.reduce((a, b) => (nxt(frames[b]!) > nxt(frames[a]!) ? b : a)); }
      else { while (ref[hand]) { ref[hand] = 0; hand = (hand + 1) % nFrames; } victim = hand; hand = (hand + 1) % nFrames; }
      evicted = frames[victim];
    }
    frames[victim] = p; loadT[victim] = t; lastT[victim] = t; freq[victim] = 1; ref[victim] = 1;
    steps.push({ page: p, frames: frames.slice(), hit: false, evicted, hand });
  });
  return { steps, faults };
}
export const BELADY = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
export function refString(pattern: string, len: number, seed: number): number[] {
  const rng = mulberry(seed + 11), out: number[] = [];
  for (let i = 0; i < len; i++) {
    if (pattern === 'belady') out.push(BELADY[i % BELADY.length]);
    else if (pattern === 'loop') out.push((i % 6) + 1);
    else if (pattern === 'locality') out.push(rng() < 0.8 ? 1 + Math.floor(rng() * 3) : 4 + Math.floor(rng() * 6));
    else if (pattern === 'sequential') out.push((i % 12) + 1);
    else out.push(1 + Math.floor(rng() * 9));
  }
  return out;
}
const POLICY_NAMES: Record<Policy, string> = { fifo: 'FIFO', lru: 'LRU (least recently used)', lfu: 'LFU (least frequently used)', opt: 'OPT (Belady optimal)', clock: 'Clock (second chance)' };
interface CaS { t: number; k: number }
export const cachePageReplacement = defineSim<CaS>({
  id: 'cache_page_replacement', title: 'Cache and Page Replacement: FIFO, LRU, LFU, Clock and Optimal',
  ...meta('Computer Science', 'Intermediate', 'Operating Systems', 'Cache / page replacement', 'Page faults, replacement policies, locality of reference, Belady’s anomaly', [...UG_ENG, 'BCA', 'B.Sc', ...PG_ALL]),
  covers: ['Page replacement', 'Cache replacement policy', 'FIFO', 'LRU', 'LFU', 'Optimal page replacement', 'Clock algorithm', 'Belady’s anomaly', 'Locality of reference', 'Page fault rate'],
  tags: ['page replacement', 'cache', 'LRU', 'FIFO', 'virtual memory', 'belady anomaly', 'operating system', 'GATE CS', 'hit ratio', 'page fault'],
  learningObjectives: ['Trace frame contents and faults for each policy.', 'Compare hit ratios on loops, random access and locality-heavy reference strings.', 'Reproduce Belady’s anomaly with FIFO on the classic string.'],
  assumptions: ['Demand paging with a fixed number of frames; every reference is a single page; faults cost the same; ties in LFU are broken by oldest load.'],
  blurb: 'Reference string runs through the frames one access at a time. Hits are green, faults red, evictions are shown, and a curve of faults versus frame count reveals Belady’s anomaly.',
  hint: 'Select pattern "Belady string" with FIFO and compare 3 vs 4 frames: faults go UP (9 → 10). OPT is the lower bound; LRU wins on locality.',
  params: [
    { kind: 'select', id: 'policy', label: 'Replacement policy', value: 'lru', options: (Object.keys(POLICY_NAMES) as Policy[]).map(k => ({ value: k, label: POLICY_NAMES[k] })) },
    { kind: 'select', id: 'pattern', label: 'Reference pattern', value: 'belady', resetOnChange: true, options: [{ value: 'belady', label: 'Belady classic string' }, { value: 'locality', label: 'Locality (80/20 hot set)' }, { value: 'loop', label: 'Loop over 6 pages' }, { value: 'sequential', label: 'Sequential scan' }, { value: 'random', label: 'Uniform random' }] },
    { kind: 'number', id: 'frames', label: 'Frames', min: 1, max: 8, step: 1, value: 3, digits: 0 },
    { kind: 'number', id: 'len', label: 'References', min: 12, max: 48, step: 2, value: 24, digits: 0, resetOnChange: true },
    { kind: 'number', id: 'seed', label: 'Random seed', min: 1, max: 99, step: 1, value: 7, digits: 0, resetOnChange: true },
    { kind: 'number', id: 'rate', label: 'References per second', min: 0.5, max: 12, step: 0.5, value: 3, digits: 1 },
  ],
  actions: [{ id: 'restart', label: 'Replay the string' }],
  dt: 1 / 30, previewSeconds: 3,
  init() { return { t: 0, k: 0 }; },
  action(s) { s.t = 0; s.k = 0; },
  step(s, v, dt) { s.t += dt; const n = v.len as number; s.k = Math.floor(s.t * (v.rate as number)) % (n + 4); },
  draw(c, s, v, w, h) {
    bg(c, w, h); const refs = refString(v.pattern as string, v.len as number, v.seed as number), nf = v.frames as number, pol = v.policy as Policy, sim = simulateCache(refs, nf, pol), k = Math.min(s.k, refs.length - 1);
    const A = R(8, 8, w - 16, h * 0.58), G = R(8, h * 0.58 + 14, w - 16, h * 0.42 - 22); panel(c, A);
    const cols = refs.length, cw = Math.min(34, (A.w - 70) / cols), x0 = A.x + 56, y0 = A.y + 44, rh = Math.min(30, (A.h - 90) / (nf + 1));
    text(c, `${POLICY_NAMES[pol]} — ${nf} frames`, A.x + 10, A.y + 16, C.text, 12, 'left', 'alphabetic', true);
    text(c, 'ref', A.x + 10, y0 + 18, C.dim, 10); for (let f = 0; f < nf; f++) text(c, `F${f + 1}`, A.x + 10, y0 + rh * (f + 1) + 18, C.dim, 10);
    for (let i = 0; i <= k; i++) {
      const st = sim.steps[i], x = x0 + i * cw; c.fillStyle = C.panel2; c.fillRect(x, y0, cw - 2, rh - 2); text(c, String(st.page), x + cw / 2 - 1, y0 + rh * 0.65, C.white, 12, 'center', 'alphabetic', true);
      for (let f = 0; f < nf; f++) { const val = st.frames[f], changed = val === st.page && !st.hit; c.fillStyle = changed ? 'rgba(248,113,113,0.35)' : st.hit && val === st.page ? 'rgba(52,211,153,0.35)' : 'rgba(30,41,59,0.9)'; c.fillRect(x, y0 + rh * (f + 1), cw - 2, rh - 2); if (val !== null) text(c, String(val), x + cw / 2 - 1, y0 + rh * (f + 1) + rh * 0.65, C.text, 12, 'center'); }
      text(c, st.hit ? '✓' : '✗', x + cw / 2 - 1, y0 + rh * (nf + 1) + 14, st.hit ? C.green : C.red, 13, 'center', 'alphabetic', true);
      if (i === k) { c.strokeStyle = C.amber; c.lineWidth = 2; c.strokeRect(x - 1, y0 - 1, cw, rh * (nf + 1)); }
    }
    const cur = sim.steps[k], faults = sim.steps.slice(0, k + 1).filter(x => !x.hit).length;
    text(c, cur.hit ? `page ${cur.page}: HIT` : `page ${cur.page}: FAULT${cur.evicted !== null ? `, evict page ${cur.evicted}` : ' (free frame)'}`, A.x + A.w - 10, A.y + 16, cur.hit ? C.green : C.red, 12, 'right', 'alphabetic', true);
    text(c, `faults so far ${faults}   hits ${k + 1 - faults}   hit ratio ${fmt(((k + 1 - faults) / (k + 1)) * 100, 1)}%`, A.x + 10, A.y + A.h - 10, C.cyan, 11);
    // faults vs frames
    const pols: Policy[] = ['fifo', 'lru', 'lfu', 'opt', 'clock'], cols2: Record<Policy, string> = { fifo: C.red, lru: C.green, lfu: C.purple, opt: C.amber, clock: C.cyan }, maxF = refs.length;
    const m = plot(c, G, [1, 8], [0, maxF], { title: 'Page faults vs number of frames (all policies, same string)', xlabel: 'frames', ylabel: 'faults', grid: true });
    c.save(); clip(c, G); for (const p of pols) { const pts = Array.from({ length: 8 }, (_, i) => [m.X(i + 1), m.Y(simulateCache(refs, i + 1, p).faults)] as [number, number]); polyline(c, pts, cols2[p], p === pol ? 3 : 1.4); if (p === pol) pts.forEach(([x, y]) => circle(c, x, y, 3, cols2[p])); } c.restore();
    pols.forEach((p, i) => { text(c, p.toUpperCase(), G.x + G.w - 12 - (pols.length - 1 - i) * 46, G.y + 14, cols2[p], 10, 'right', 'alphabetic', true); });
  },
  readouts(s, v) {
    const refs = refString(v.pattern as string, v.len as number, v.seed as number), sim = simulateCache(refs, v.frames as number, v.policy as Policy), opt = simulateCache(refs, v.frames as number, 'opt').faults, k = Math.min(s.k, refs.length - 1), st = sim.steps[k];
    const anomaly = (v.policy === 'fifo') ? [1, 2, 3, 4, 5, 6, 7, 8].filter(f => f > 1 && simulateCache(refs, f, 'fifo').faults > simulateCache(refs, f - 1, 'fifo').faults).join(', ') : '';
    return [{ label: 'Current reference', value: st.page, digits: 0 }, { label: 'Result', value: st.hit ? 'hit' : st.evicted === null ? 'fault (free frame)' : `fault, evicted ${st.evicted}` }, { label: 'Total faults (whole string)', value: sim.faults, digits: 0 }, { label: 'Hit ratio (whole string)', value: ((refs.length - sim.faults) / refs.length) * 100, unit: '%', digits: 1 }, { label: 'OPT lower bound on faults', value: opt, digits: 0 }, { label: 'Distance above optimal', value: sim.faults - opt, digits: 0 }, ...(v.policy === 'fifo' ? [{ label: "Belady anomaly (faults ↑ with more frames) at frames", value: anomaly || 'none' }] : [])];
  },
  equations(s, v) { const refs = refString(v.pattern as string, v.len as number, v.seed as number), f = simulateCache(refs, v.frames as number, v.policy as Policy).faults; return [`\\text{hit ratio}=1-\\dfrac{\\text{faults}}{\\text{refs}}=1-\\dfrac{${f}}{${refs.length}}=${fmt(1 - f / refs.length, 3)}`, 'T_{\\mathrm{eff}}=h\\,T_{\\mathrm{hit}}+(1-h)\\,T_{\\mathrm{miss}}', '\\text{OPT evicts } \\arg\\max_p\\ \\text{next-use}(p)\\quad(\\text{minimum possible faults})']; },
});

/* ================================================================== */
/*  3. Molecular orbital theory (homonuclear diatomics)                */
/* ================================================================== */
export interface MO { id: string; label: string; kind: 's' | 'ps' | 'pp'; anti: boolean; deg: number }
/** MO energy order (valence). Z≤7 (B2, C2, N2) have π2p below σ2p because of s–p mixing; O2, F2, Ne2 do not. */
export function moOrder(Z: number): MO[] {
  if (Z <= 2) return [{ id: 's1', label: 'σ1s', kind: 's', anti: false, deg: 1 }, { id: 's1*', label: 'σ*1s', kind: 's', anti: true, deg: 1 }];
  const base: MO[] = [{ id: 's2', label: 'σ2s', kind: 's', anti: false, deg: 1 }, { id: 's2*', label: 'σ*2s', kind: 's', anti: true, deg: 1 }];
  const pi: MO = { id: 'pi', label: 'π2p', kind: 'pp', anti: false, deg: 2 }, sg: MO = { id: 'sg', label: 'σ2p', kind: 'ps', anti: false, deg: 1 }, pia: MO = { id: 'pi*', label: 'π*2p', kind: 'pp', anti: true, deg: 2 }, sga: MO = { id: 'sg*', label: 'σ*2p', kind: 'ps', anti: true, deg: 1 };
  return Z <= 7 ? [...base, pi, sg, pia, sga] : [...base, sg, pi, pia, sga];
}
export const MOLECULES: { sym: string; Z: number; ve: number }[] = [{ sym: 'H₂', Z: 1, ve: 2 }, { sym: 'He₂', Z: 2, ve: 4 }, { sym: 'Li₂', Z: 3, ve: 2 }, { sym: 'Be₂', Z: 4, ve: 4 }, { sym: 'B₂', Z: 5, ve: 6 }, { sym: 'C₂', Z: 6, ve: 8 }, { sym: 'N₂', Z: 7, ve: 10 }, { sym: 'O₂', Z: 8, ve: 12 }, { sym: 'F₂', Z: 9, ve: 14 }, { sym: 'Ne₂', Z: 10, ve: 16 }];
/** Aufbau + Hund: returns electron count per spatial orbital (each orbital listed with its occupancy up/down). */
export function fillMO(Z: number, ve: number): { mo: MO; orbs: [number, number][] }[] {
  const order = moOrder(Z); let left = ve; const out = order.map(mo => ({ mo, orbs: Array.from({ length: mo.deg }, () => [0, 0] as [number, number]) }));
  for (const lev of out) {
    // Hund: first one electron (spin up) in each degenerate orbital, then pair
    for (const o of lev.orbs) if (left > 0) { o[0] = 1; left--; }
    for (const o of lev.orbs) if (left > 0) { o[1] = 1; left--; }
  }
  return out;
}
export function moProperties(Z: number, ve: number) {
  const f = fillMO(Z, ve); let nb = 0, na = 0, unpaired = 0;
  for (const l of f) for (const o of l.orbs) { const e = o[0] + o[1]; if (l.mo.anti) na += e; else nb += e; if (e === 1) unpaired++; }
  const bondOrder = (nb - na) / 2;
  const config = f.filter(l => l.orbs.some(o => o[0] + o[1] > 0)).map(l => `${l.mo.label}${sup(l.orbs.reduce((a, o) => a + o[0] + o[1], 0))}`).join(' ');
  return { bondOrder, unpaired, magnetic: unpaired > 0 ? 'paramagnetic' : 'diamagnetic', config, nb, na };
}
const sup = (n: number) => String(n).split('').map(d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]).join('');
/** H2+ LCAO in atomic units (Szabo & Ostlund): overlap S, Coulomb J, exchange K, E± = −½ − (J ± K)/(1 ± S) + 1/R. */
export const lcaoS = (R: number) => Math.exp(-R) * (1 + R + (R * R) / 3);
export const lcaoJ = (R: number) => 1 / R - (1 + 1 / R) * Math.exp(-2 * R);
export const lcaoK = (R: number) => (1 + R) * Math.exp(-R);
export const lcaoE = (R: number, sign: 1 | -1) => -0.5 - (lcaoJ(R) + sign * lcaoK(R)) / (1 + sign * lcaoS(R)) + 1 / R;
export const lcaoEquilibrium = () => { let best = 2, e = Infinity; for (let r = 0.8; r < 8; r += 0.001) { const E = lcaoE(r, 1); if (E < e) { e = E; best = r; } } return { R: best, E: e }; };
const HARTREE_EV = 27.2114;
interface MoS { t: number }
export const molecularOrbitalTheory = defineSim<MoS>({
  id: 'molecular_orbital_theory', title: 'Molecular Orbital Theory: Homonuclear Diatomics, Bond Order and Magnetism',
  ...meta('Chemistry', 'Intermediate', 'Chemical Bonding', 'Molecular orbital theory', 'LCAO, bonding and antibonding orbitals, bond order, paramagnetism', [...SCHOOL_11_12, 'B.Sc', 'B.Tech', 'M.Sc']),
  covers: ['Molecular orbital theory', 'LCAO', 'Bonding and antibonding orbitals', 'Bond order', 'Paramagnetism and diamagnetism', 'σ and π orbitals', 's–p mixing'],
  tags: ['MOT', 'molecular orbital', 'bond order', 'O2 paramagnetic', 'N2', 'LCAO', 'sigma pi', 'antibonding', 'CBSE class 11', 'JEE', 'NEET', 'chemical bonding'],
  learningObjectives: ['Fill the MO diagram of H₂ … Ne₂ by Aufbau and Hund’s rule.', 'Compute bond order and magnetic behaviour (why O₂ is paramagnetic).', 'See how overlap changes bonding/antibonding energies with internuclear distance (H₂⁺ LCAO).'],
  assumptions: ['Valence MOs only; σ2p/π2p order switches at N₂/O₂ because of s–p mixing. The R-dependence uses the exact LCAO integrals for H₂⁺ and scales the diagram’s splitting qualitatively for other molecules.'],
  blurb: 'Choose a molecule, watch electrons fill the molecular orbital diagram, read bond order and magnetism, and breathe the internuclear distance to see the LCAO bonding and antibonding energy curves.',
  hint: 'Compare N₂ (bond order 3, diamagnetic) with O₂ (order 2, two unpaired electrons) and C₂ (order 2, all paired). The curve shows the H₂⁺ bonding minimum near R = 2.5 a₀.',
  params: [
    { kind: 'select', id: 'mol', label: 'Molecule', value: 'O₂', options: MOLECULES.map(m => ({ value: m.sym, label: m.sym })) },
    { kind: 'number', id: 'R', label: 'Internuclear distance R', min: 0.8, max: 7, step: 0.05, value: 2.5, unit: 'a₀', digits: 2 },
    { kind: 'toggle', id: 'breathe', label: 'Oscillate R (bond vibration)', value: true },
    { kind: 'toggle', id: 'lobes', label: 'Show orbital shapes', value: true },
    { kind: 'toggle', id: 'fill', label: 'Animate electron filling', value: true },
  ],
  actions: [{ id: 'restart', label: 'Re-fill electrons' }],
  dt: 1 / 60, previewSeconds: 4,
  init() { return { t: 0 }; },
  action(s) { s.t = 0; },
  step(s, v, dt) { s.t += dt; void v; },
  draw(c, s, v, w, h) {
    bg(c, w, h); const mol = MOLECULES.find(m => m.sym === v.mol) ?? MOLECULES[7], Rr = v.breathe ? clamp((v.R as number) + 0.8 * Math.sin(s.t * 1.6), 0.8, 7) : (v.R as number);
    const A = R(8, 8, w * 0.6 - 12, h - 16), B = R(A.x + A.w + 8, 8, w - A.w - 24, h - 16); panel(c, A);
    const fill = fillMO(mol.Z, mol.ve), prop = moProperties(mol.Z, mol.ve), levels = fill.length, ys0 = A.y + 40, ys1 = A.y + A.h - 40;
    // energy positions: base index with splitting scaled by LCAO overlap (shape from H2+ curves)
    const e0 = lcaoE(2.5, 1), e1 = lcaoE(2.5, -1), scale = (R_: number, sign: 1 | -1) => (lcaoE(R_, sign) - (-0.5)) / (sign === 1 ? Math.abs(e0 + 0.5) : Math.abs(e1 + 0.5));
    void scale; const split = clamp((lcaoE(Rr, -1) - lcaoE(Rr, 1)) / (e1 - e0), 0.2, 2.2);
    const pairs = mol.Z <= 2 ? 1 : 4; void pairs;
    const nAtom = mol.Z <= 2 ? 1 : 2; // atomic manifolds: 1s, or 2s + 2p
    const mid = (A.x + A.w) / 2, ax = A.x + 50, bx = A.x + A.w - 50, lw = 74;
    text(c, `${v.mol}   bond order ${fmt(prop.bondOrder, 1)}   ${prop.magnetic}`, A.x + 10, A.y + 16, C.text, 13, 'left', 'alphabetic', true);
    const total = fill.reduce((a, l) => a + l.orbs.reduce((q, o) => q + o[0] + o[1], 0), 0); const shown = v.fill ? Math.min(total, Math.floor((s.t * 2.2) % (total + 3))) : total; let placed = 0;
    // atomic levels
    const atomY = (kind: 's' | 'p') => (nAtom === 1 ? (ys0 + ys1) / 2 : kind === 's' ? ys1 - 20 : ys0 + 24);
    const alvl = nAtom === 1 ? [{ k: 's' as const, lab: '1s' }] : [{ k: 's' as const, lab: '2s' }, { k: 'p' as const, lab: '2p' }];
    for (const a of alvl) for (const x of [ax, bx]) { line(c, x - 20, atomY(a.k), x + 20, atomY(a.k), C.dim, 2); text(c, a.lab, x, atomY(a.k) + 14, C.dim, 10, 'center'); }
    // MO levels: energy rank positions
    const n = levels;
    fill.forEach((lev, li) => {
      const frac = li / Math.max(1, n - 1), baseY = ys1 - 8 - frac * (ys1 - ys0 - 16);
      // adjust by splitting: bonding pulled down, antibonding pushed up (relative to atomic manifold centre)
      const centre = lev.mo.kind === 's' ? atomY('s') : atomY('p'), dir = lev.mo.anti ? -1 : 1, nominal = baseY, y = nAtom === 1 ? (ys0 + ys1) / 2 + (lev.mo.anti ? -1 : 1) * 60 * split : centre + (nominal - centre) * (0.55 + 0.45 * split);
      const yy = clamp(y, A.y + 30, A.y + A.h - 22); void dir;
      line(c, mid - lw / 2, yy, mid + lw / 2, yy, lev.mo.anti ? C.red : C.cyan, 2.4); text(c, lev.mo.label, mid + lw / 2 + 8, yy + 4, C.text, 11, 'left', 'alphabetic', true);
      for (const [x, tx2] of [[ax, mid - lw / 2], [bx, mid + lw / 2]]) line(c, x + (x < mid ? 20 : -20), (lev.mo.kind === 's' ? atomY('s') : atomY('p')), tx2, yy, 'rgba(148,163,184,0.2)', 1, [3, 4]);
      const k = lev.orbs.length;
      lev.orbs.forEach((o, oi) => { const ox2 = mid + (oi - (k - 1) / 2) * 30 - 0, oy2 = yy - 16; for (let sp = 0; sp < 2; sp++) { if (o[sp] && placed < shown) { placed++; arrow(c, ox2 - 4 + sp * 9, sp ? oy2 + 1 : oy2 + 15, ox2 - 4 + sp * 9, sp ? oy2 + 15 : oy2 + 1, sp ? C.cyan : C.amber, 2, 4); } else if (o[sp]) placed++; } });
      if (v.lobes) drawLobes(c, A.x + 18 + (lev.mo.kind === 's' ? 0 : 0), yy, lev.mo, 0.5 + 0.4 * (1 - Math.min(1, Rr / 6)));
    });
    // right panel: LCAO curve
    panel(c, B); const m = plot(c, B, [0.8, 7], [-0.2, 0.6], { title: 'H₂⁺ LCAO energy vs R (hartree, relative to H + H⁺)', xlabel: 'R (a₀)', ylabel: 'E + ½', grid: true, zeroAxis: true });
    c.save(); clip(c, B); const pe = (sg: 1 | -1) => Array.from({ length: 140 }, (_, i) => { const r = 0.8 + (6.2 * i) / 139; return [m.X(r), m.Y(clamp(lcaoE(r, sg) + 0.5, -0.2, 0.6))] as [number, number]; });
    polyline(c, pe(1), C.cyan, 2.5); polyline(c, pe(-1), C.red, 2.5); line(c, m.X(Rr), B.y + 20, m.X(Rr), B.y + B.h - 26, C.amber, 1.2, [4, 3]); circle(c, m.X(Rr), m.Y(clamp(lcaoE(Rr, 1) + 0.5, -0.2, 0.6)), 4.5, C.amber, C.white, 1); circle(c, m.X(Rr), m.Y(clamp(lcaoE(Rr, -1) + 0.5, -0.2, 0.6)), 4.5, C.amber, C.white, 1); c.restore();
    text(c, 'σ (bonding)', B.x + B.w - 10, B.y + 30, C.cyan, 10, 'right'); text(c, 'σ* (antibonding)', B.x + B.w - 10, B.y + 44, C.red, 10, 'right');
  },
  readouts(s, v) {
    const mol = MOLECULES.find(m => m.sym === v.mol) ?? MOLECULES[7], p = moProperties(mol.Z, mol.ve), eq = lcaoEquilibrium(), R_ = v.breathe ? clamp((v.R as number) + 0.8 * Math.sin(s.t * 1.6), 0.8, 7) : (v.R as number);
    return [{ label: 'Valence electrons', value: mol.ve, digits: 0 }, { label: 'Configuration', value: p.config }, { label: 'Bonding / antibonding electrons', value: `${p.nb} / ${p.na}` }, { label: 'Bond order', value: p.bondOrder, digits: 1 }, { label: 'Unpaired electrons', value: p.unpaired, digits: 0 }, { label: 'Magnetism', value: p.magnetic }, { label: 'Stable molecule?', value: p.bondOrder > 0 ? 'yes (bond order > 0)' : 'no — no net bonding' }, { label: 'Internuclear distance R', value: R_, unit: 'a₀', digits: 2 }, { label: 'Overlap S(R)', value: lcaoS(R_), digits: 4 }, { label: 'H₂⁺ bonding energy at R', value: (lcaoE(R_, 1) + 0.5) * HARTREE_EV, unit: 'eV', digits: 3 }, { label: 'H₂⁺ equilibrium (LCAO)', value: `R = ${fmt(eq.R, 2)} a₀, D = ${fmt((-(eq.E + 0.5)) * HARTREE_EV, 2)} eV` }];
  },
  equations(s, v) { const mol = MOLECULES.find(m => m.sym === v.mol) ?? MOLECULES[7], p = moProperties(mol.Z, mol.ve); return ['\\psi_\\pm=\\dfrac{\\phi_A\\pm\\phi_B}{\\sqrt{2(1\\pm S)}},\\qquad E_\\pm=-\\tfrac12-\\dfrac{J\\pm K}{1\\pm S}+\\dfrac1R', `\\text{BO}=\\tfrac12\\,(n_b-n_a)=\\tfrac12(${p.nb}-${p.na})=${fmt(p.bondOrder, 1)}`, 'S(R)=e^{-R}\\left(1+R+\\tfrac{R^2}{3}\\right)']; },
});
function drawLobes(c: Ctx, x: number, y: number, mo: MO, k: number) {
  const r = 7 + 4 * k, plus = 'rgba(96,165,250,0.75)', minus = 'rgba(248,113,113,0.75)';
  const ell = (cx: number, cy: number, rx: number, ry: number, col: string) => { c.fillStyle = col; c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, TAU); c.fill(); };
  if (mo.kind === 'pp') { if (!mo.anti) { ell(x + 4, y - 6, r, 4, plus); ell(x + 4, y + 6, r, 4, minus); ell(x + 4 + 0, y - 6, r * 0.9, 3, plus); } else { ell(x - 8, y, r * 0.55, 6, plus); ell(x + 14, y, r * 0.55, 6, minus); ell(x - 8, y + 0, r * 0.4, 8, plus); ell(x + 14, y, r * 0.4, 8, minus); } }
  else if (!mo.anti) { ell(x - 4, y, r * 0.8, 6, plus); ell(x + 12, y, r * 0.8, 6, plus); }
  else { ell(x - 8, y, r * 0.7, 6, plus); ell(x + 16, y, r * 0.7, 6, minus); }
  line(c, x + 2, y - 10, x + 2, y + 10, 'rgba(255,255,255,0.0)', 1);
}
export type { EducationLevel };
