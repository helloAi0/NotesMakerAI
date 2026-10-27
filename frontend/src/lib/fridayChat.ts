/** Shared FRIDAY conversation (dock + full page use the same history). Persisted locally. */
import { parseCommand } from './voiceIntents';
import { runCommand, helpText, isCommandLike, setLastOutput } from './agentRuntime';
import type { Chip, StepResult } from './agentRuntime';
import { fridayAsk } from './friday';
import { touch } from './activity';

export interface Msg { id: number; who: 'you' | 'bot'; text: string; steps?: (StepResult | null)[]; total?: number; chips?: Chip[]; sources?: { kind: string; title: string; where?: string }[]; mode?: 'offline' | 'ai'; via?: 'voice' | 'text'; t: number }
const KEY = 'nm_friday_chat';
const WELCOME: Msg = { id: 0, who: 'bot', t: 0, text: 'Hi, I am FRIDAY. I can run the app for you — “Open AI segmentation → go to the image processing module → set model to U-Net → run simulation”, “write a note about Fourier series”, “summarize my pdf thermodynamics”, “add task revise optics by Friday” — and answer study questions from my built-in STEM knowledge, your notes and your PDFs. Type or press the mic.', chips: [{ label: 'What can you do?', cmd: 'help' }, { label: 'Explain gradient descent', cmd: 'explain gradient descent' }, { label: 'List my PDFs', cmd: 'list my pdfs' }, { label: 'What is due?', cmd: 'what is due' }] };
let msgs: Msg[] = (() => { try { const a = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(a) && a.length) return a as Msg[]; } catch { /* fresh */ } return [WELCOME]; })();
let busy = false; let nextId = Math.max(1, ...msgs.map(m => m.id + 1));
const subs = new Set<() => void>(); const replySubs = new Set<(m: Msg) => void>();
const emit = () => { try { localStorage.setItem(KEY, JSON.stringify(msgs.filter(m => m.t !== -1).slice(-60).map(m => ({ ...m, steps: m.steps?.map(s => s ?? null) })))); } catch { /* quota */ } subs.forEach(f => f()); };
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const getMsgs = () => msgs; export const isBusy = () => busy;
export const onReply = (f: (m: Msg) => void) => { replySubs.add(f); return () => { replySubs.delete(f); }; };
export function clearChat() { msgs = [WELCOME]; emit(); }
const add = (m: Omit<Msg, 'id' | 't'>) => { const x: Msg = { ...m, id: nextId++, t: Date.now() }; msgs = [...msgs, x]; emit(); return x.id; };
const patch = (id: number, f: (m: Msg) => Msg) => { msgs = msgs.map(m => (m.id === id ? f(m) : m)); emit(); };
const botDone = (id: number) => { const m = msgs.find(x => x.id === id); if (m) replySubs.forEach(f => f(m)); };

export async function send(raw: string, via: 'voice' | 'text' = 'text') {
  const q = raw.trim(); if (!q || busy) return; busy = true; subs.forEach(f => f()); touch('ask');
  add({ who: 'you', text: q, via });
  try {
    const steps = parseCommand(q); const only = steps.length === 1 ? steps[0].intent : null;
    if (only?.kind === 'help') { const id = add({ who: 'bot', text: helpText(), chips: [{ label: 'Open FRIDAY chat', cmd: 'open friday' }] }); botDone(id); }
    else if (isCommandLike(q) || only?.kind === 'explain' || only?.kind === 'search') {
      const id = add({ who: 'bot', text: '', steps: [], total: steps.length });
      const res = await runCommand(q, (i, total, r) => patch(id, m => { const st = [...(m.steps ?? [])]; st[i] = r; return { ...m, steps: st, total }; }));
      const last = res[res.length - 1]; const fail = res.find(r => !r.ok);
      const single = steps.length === 1;
      patch(id, m => ({ ...m, steps: single ? undefined : m.steps, text: fail ? (single ? fail.message : `Stopped: ${fail.message}`) : single ? last?.message ?? '' : `Done: ${res.length} steps completed.`, chips: res.flatMap(r => r.chips ?? []).slice(0, 5) }));
      botDone(id);
    } else {
      const hist = msgs.filter(m => m.text && m.id !== 0).slice(-8).map(m => ({ who: m.who, text: m.text }));
      const a = await fridayAsk(q, hist); setLastOutput(a.text);
      const id = add({ who: 'bot', text: a.text + (a.note ? `\n\n(${a.note})` : ''), chips: a.chips, sources: a.sources, mode: a.mode }); botDone(id);
    }
  } catch (e) { add({ who: 'bot', text: `Something went wrong: ${(e as Error).message}` }); }
  finally { busy = false; subs.forEach(f => f()); }
}
