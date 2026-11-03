import { defaultKV } from '../learn';
import type { KV } from '../learn';
import { parseWhen } from './when';
export interface Reminder { id: string; text: string; at: number; done: boolean; fired?: boolean }
export class Reminders {
  items: Reminder[]; private kv: KV; private key: string; constructor(kv: KV = defaultKV(), key = 'nm_friday_reminders') { this.kv = kv; this.key = key; try { const a = JSON.parse(kv.get(key) || '[]'); this.items = Array.isArray(a) ? a : []; } catch { this.items = []; } }
  private save() { this.kv.set(this.key, JSON.stringify(this.items.slice(-200))); }
  add(text: string, at: number) { const r: Reminder = { id: `rm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, text: text.trim().slice(0, 200), at, done: false }; this.items.push(r); this.save(); return r; }
  /** Due and not yet shown. Marks them as fired so each reminder is shown once. */
  due(now = Date.now()): Reminder[] { const d = this.items.filter(r => !r.done && !r.fired && r.at <= now); if (d.length) { d.forEach(r => { r.fired = true; }); this.save(); } return d; }
  complete(id: string) { const r = this.items.find(x => x.id === id); if (r) { r.done = true; this.save(); } }
  upcoming(now = Date.now()) { return this.items.filter(r => !r.done && r.at > now).sort((a, b) => a.at - b.at); }
  remove(id: string) { this.items = this.items.filter(r => r.id !== id); this.save(); }
}
/** “remind me to revise enthalpy tomorrow at 6pm” */
export function parseReminder(text: string, now = Date.now()): { text: string; at: number } | null {
  const m = text.match(/\bremind me (?:to |about |that )?(.+)/i); if (!m) return null; const w = parseWhen(m[1], now, 9); if (!w) return null;
  const what = m[1].replace(w.matched, '').replace(/\b(?:at|on|in|by|next|this)\s*$/i, '').replace(/\s+/g, ' ').replace(/[\s,.;]+$/, '').trim(); return what ? { text: what, at: w.at } : null;
}
