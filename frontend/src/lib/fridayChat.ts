/** Shared FRIDAY conversation (dock + full page use the same history). Persisted locally. */
import { parseCommand } from './voiceIntents';
import { runCommand, helpText, setLastOutput } from './agentRuntime';
import type { Chip, StepResult } from './agentRuntime';
import { fridayAsk, llmConfig } from './friday';
import { agentRun, COMMAND_LANGUAGE } from './fridayAgent';
import { overlap } from './voiceIntents';
import { touch } from './activity';

export type Track = 'research' | 'agent';
export interface Msg { track?: Track; id: number; who: 'you' | 'bot'; text: string; steps?: (StepResult | null)[]; total?: number; chips?: Chip[]; sources?: { kind: string; title: string; where?: string }[]; mode?: 'offline' | 'ai'; via?: 'voice' | 'text'; t: number }
const KEY = 'nm_friday_chat';
export const WELCOME: Record<Track, Msg> = {
  research: { id: -1, who: 'bot', t: 0, track: 'research', text: 'Research Knowledge Engine: ask any study question, a derivation, a formula, or how a part of this app works. I answer offline from the built-in STEM knowledge, your notes, your PDFs and every simulation, and show my sources. With an AI key in Settings I can answer anything.', chips: [{ label: 'Explain gradient descent', cmd: 'explain gradient descent' }, { label: 'Derive the heat equation', cmd: 'derive the heat equation' }, { label: 'How do I use click to speak?', cmd: 'how do I use click to speak' }, { label: 'What is entropy?', cmd: 'what is entropy' }] },
  agent: { id: -2, who: 'bot', t: 0, track: 'agent', text: 'Agentic OS / File Voice Controller: tell me what to do, by typing or with the mic, and I will operate the app. Chain steps with “then” or “->”. Try: “Open AI segmentation -> go to the image processing module -> set model to U-Net -> run simulation”, “create folder Thermo then move thermodynamics to folder Thermo”, “write a note about Fourier series”, “add task revise optics by Friday”.', chips: [{ label: 'What can you do?', cmd: 'help' }, { label: 'List my PDFs', cmd: 'list my pdfs' }, { label: 'What is due?', cmd: 'what is due' }, { label: 'Open settings', cmd: 'open settings' }] },
};
let msgs: Msg[] = (() => { try { const a = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(a)) return (a as Msg[]).filter(m => m.id > 0).map(m => ({ ...m, track: m.track ?? 'agent' })); } catch { /* fresh */ } return []; })();
let busy = false; let nextId = Math.max(1, ...msgs.map(m => m.id + 1));
const subs = new Set<() => void>(); const replySubs = new Set<(m: Msg) => void>();
const emit = () => { try { localStorage.setItem(KEY, JSON.stringify(msgs.filter(m => m.t !== -1).slice(-60).map(m => ({ ...m, steps: m.steps?.map(s => s ?? null) })))); } catch { /* quota */ } subs.forEach(f => f()); };
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const getMsgs = () => msgs; export const isBusy = () => busy;
export const onReply = (f: (m: Msg) => void) => { replySubs.add(f); return () => { replySubs.delete(f); }; };
export function clearChat(track?: Track) { msgs = track ? msgs.filter(m => m.track !== track) : []; emit(); }
let curTrack: Track = 'agent';
const add = (m: Omit<Msg, 'id' | 't'>) => { const x: Msg = { ...m, track: m.track ?? curTrack, id: nextId++, t: Date.now() }; msgs = [...msgs, x]; emit(); return x.id; };
const patch = (id: number, f: (m: Msg) => Msg) => { msgs = msgs.map(m => (m.id === id ? f(m) : m)); emit(); };
const botDone = (id: number) => { const m = msgs.find(x => x.id === id); if (m) replySubs.forEach(f => f(m)); };

function suggestions(q: string): Chip[] {
  const scored = COMMAND_LANGUAGE.map(c => ({ c, sc: overlap(q, c) })).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 3);
  return scored.filter(x => !/[<|]/.test(x.c)).map(x => ({ label: x.c, cmd: x.c })).concat([{ label: 'Ask in Research track', cmd: '__research__ ' + q }]).slice(0, 4);
}

export async function send(raw: string, via: 'voice' | 'text' = 'text', track: Track = 'agent') {
  let q = raw.trim(); if (!q || busy) return;
  if (q.startsWith('__research__ ')) { q = q.slice(13); track = 'research'; }
  busy = true; curTrack = track; subs.forEach(f => f()); touch('ask');
  add({ who: 'you', text: q, via });
  try {
    const steps = parseCommand(q); const only = steps.length === 1 ? steps[0].intent : null;
    if (track === 'research') {
      if (only?.kind === 'help') { const id = add({ who: 'bot', text: 'Ask me anything about STEM topics, derivations, formulas, your notes and PDFs, or how this app works. For actions (open a simulation, write notes, move PDFs) switch to the Agent track.' }); botDone(id); }
      else {
        const hist = msgs.filter(m => m.track === 'research' && m.text).slice(-8).map(m => ({ who: m.who, text: m.text }));
        const a = await fridayAsk(q.replace(/^derive\b/i, 'derive and explain'), hist); setLastOutput(a.text);
        const id = add({ who: 'bot', text: a.text + (a.note ? `\n\n(${a.note})` : ''), chips: a.chips, sources: a.sources, mode: a.mode }); botDone(id);
      }
    } else if (only?.kind === 'help') { const id = add({ who: 'bot', text: helpText(), chips: [{ label: 'Open FRIDAY chat', cmd: 'open friday' }] }); botDone(id); }
    else {
      const unknown = steps.some(x => x.intent.kind === 'unknown');
      if (unknown && llmConfig()) {
        const id = add({ who: 'bot', text: '', steps: [], total: 0 }); let n = 0;
        const res = await agentRun(q, { step: r => patch(id, m => { const st = [...(m.steps ?? []), r]; n = st.length; return { ...m, steps: st, total: st.length }; }), say: t => patch(id, m => ({ ...m, text: t })) });
        patch(id, m => ({ ...m, text: res ? res.summary : m.text, steps: n ? m.steps : undefined })); botDone(id);
      } else if (unknown && steps.length === 1) {
        const id = add({ who: 'bot', text: `I did not recognise that as a command. ${llmConfig() ? '' : 'Offline I understand structured commands; add an AI key in Settings and I can plan free-form goals myself. '}Closest commands:`, chips: suggestions(q) }); botDone(id);
      } else {
        const id = add({ who: 'bot', text: '', steps: [], total: steps.length });
        const res = await runCommand(q, (i, total, r) => patch(id, m => { const st = [...(m.steps ?? [])]; st[i] = r; return { ...m, steps: st, total }; }));
        const last = res[res.length - 1]; const fail = res.find(r => !r.ok); const single = steps.length === 1;
        patch(id, m => ({ ...m, steps: single ? undefined : m.steps, text: fail ? (single ? fail.message : `Stopped: ${fail.message}`) : single ? last?.message ?? '' : `Done: ${res.length} steps completed.`, chips: res.flatMap(r => r.chips ?? []).slice(0, 5) }));
        botDone(id);
      }
    }
  } catch (e) { add({ who: 'bot', text: `Something went wrong: ${(e as Error).message}` }); }
  finally { busy = false; subs.forEach(f => f()); }
}
