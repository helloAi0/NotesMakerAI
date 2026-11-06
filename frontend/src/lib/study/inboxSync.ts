/* Keeps the planner in step with the chat bot even when the Study Studio is closed: pulls the inbox shortly after start, every 5 minutes, and when the
   tab regains focus. Does nothing unless the student has signed in to a server. */
import { loadSession, saveSession, pullInbox, isAuthFail } from './server';
import type { Session } from './server';
export type Task = { title: string; due: string; subject: string };
export function startInboxSync(addTask: (t: Task) => void, listTasks: () => { title: string; due: string }[], opts: { every?: number; first?: number; load?: () => Session | null; pull?: typeof pullInbox; onAuthFail?: () => void } = {}): () => void {
  let busy = false; const load = opts.load ?? (() => loadSession()); const pull = opts.pull ?? pullInbox;
  const tick = async () => { const s = load(); if (!s || busy || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return; busy = true; try { await pull(s, addTask, listTasks()); } catch (e) { if (isAuthFail(e)) { (opts.onAuthFail ?? (() => saveSession(null)))(); } } finally { busy = false; } };
  const first = setTimeout(() => void tick(), opts.first ?? 4000); const iv = setInterval(() => void tick(), opts.every ?? 300_000); const vis = () => { if (document.visibilityState === 'visible') void tick(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', vis);
  return () => { clearTimeout(first); clearInterval(iv); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', vis); };
}
