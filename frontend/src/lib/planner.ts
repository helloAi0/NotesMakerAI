/** Study planner store (localStorage) + natural-language due-date parsing. Pure helpers are exported for tests. */
export interface Task { id: string; title: string; due: string; subject: string; kind: 'task' | 'exam'; done: boolean; created: number }
const KEY = 'nm_planner_tasks';
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => iso(new Date());
const read = (): Task[] => { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
const write = (t: Task[]) => { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* quota */ } window.dispatchEvent(new Event('nm:planner')); };
export const listTasks = (): Task[] => read().sort((a, b) => Number(a.done) - Number(b.done) || (a.due || '9999').localeCompare(b.due || '9999') || a.created - b.created);
export function addTask(t: Partial<Task> & { title: string }): Task {
  const task: Task = { id: Math.random().toString(36).slice(2, 10), title: t.title.trim().slice(0, 140), due: t.due ?? '', subject: t.subject ?? '', kind: t.kind ?? 'task', done: false, created: Date.now() };
  write([...read(), task]); return task;
}
export const setDone = (id: string, done: boolean) => write(read().map(t => (t.id === id ? { ...t, done } : t)));
export const removeTask = (id: string) => write(read().filter(t => t.id !== id));
export const replaceAll = (t: Task[]) => write(t);
export const findTask = (q: string): Task | null => { const w = q.toLowerCase().split(/\s+/).filter(x => x.length > 2); let best: Task | null = null, bs = 0; for (const t of read()) { const h = t.title.toLowerCase(); const s = w.filter(x => h.includes(x)).length / Math.max(1, w.length); if (s > bs) { bs = s; best = t; } } return bs >= 0.5 ? best : null; };

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10, a: 1 };
/** Pull a due date out of free text: "revise optics by friday", "exam on 5 dec", "essay due tomorrow", "lab report in 3 days". */
export function parseDue(text: string, now = new Date()): { title: string; due: string } {
  let s = ' ' + text.trim() + ' '; let d: Date | null = null; const cut = (re: RegExp) => { s = s.replace(re, ' '); };
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate()); let m: RegExpMatchArray | null;
  if ((m = s.match(/\s(?:by|on|before|due|for|until|till)?\s*(\d{4})-(\d{2})-(\d{2})\b/i))) { d = new Date(+m[1], +m[2] - 1, +m[3]); cut(new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); }
  else if ((m = s.match(/\s(?:by|on|before|due|for|until|till)?\s*(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\b/i))) { const mi = MONTHS.findIndex(x => x.startsWith(m![2].toLowerCase().slice(0, 3))); d = new Date(base.getFullYear(), mi, +m[1]); if (d < base) d.setFullYear(d.getFullYear() + 1); cut(new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')); }
  else if ((m = s.match(/\s(?:by|on|before|due|for|until|till)?\s*(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i))) { const mi = MONTHS.findIndex(x => x.startsWith(m![1].toLowerCase().slice(0, 3))); d = new Date(base.getFullYear(), mi, +m[2]); if (d < base) d.setFullYear(d.getFullYear() + 1); cut(new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')); }
  else if ((m = s.match(/\s(?:by|on|before|due|for|until|till)?\s*\b(today|tonight|tomorrow|day after tomorrow)\b/i))) { d = addDays(base, /^today|tonight/i.test(m[1]) ? 0 : /^tomorrow/i.test(m[1]) ? 1 : 2); cut(new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')); }
  else if ((m = s.match(/\s(?:due\s+)?in\s+(\d+|one|two|three|four|five|six|seven|ten|a)\s+(day|week|month)s?\b/i))) { const n = NUM[m[1].toLowerCase()] ?? +m[1]; d = m[2].toLowerCase() === 'day' ? addDays(base, n) : m[2].toLowerCase() === 'week' ? addDays(base, 7 * n) : new Date(base.getFullYear(), base.getMonth() + n, base.getDate()); cut(new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')); }
  else if ((m = s.match(/\s(?:by|on|before|due|for|until|till)?\s*(next\s+|this\s+|coming\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i))) { const wd = DAYS.indexOf(m[2].toLowerCase()); let diff = (wd - base.getDay() + 7) % 7; if (/next/i.test(m[1] ?? '') && diff < 7) diff += diff === 0 ? 7 : 0; if (/next/i.test(m[1] ?? '') && diff > 0 && diff < 7 && wd > base.getDay()) diff += 0; d = addDays(base, diff); cut(new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')); }
  else if ((m = s.match(/\s(?:by|due|for)?\s*(?:this|end of the|next)\s+week(?:end)?\b/i))) { d = addDays(base, (5 - base.getDay() + 7) % 7); cut(new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')); }
  const title = s.replace(/\s+(?:by|on|before|due|for|until|till)\s*$/i, ' ').replace(/\s+/g, ' ').trim().replace(/^[:\-–\s]+|[,.\s]+$/g, '');
  return { title: title ? title[0].toUpperCase() + title.slice(1) : '', due: d ? iso(d) : '' };
}
export const label = (due: string, now = new Date()): string => {
  if (!due) return 'No date'; const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); const [y, mo, da] = due.split('-').map(Number); const t = new Date(y, mo - 1, da).getTime();
  const diff = Math.round((t - b) / 86400000); if (diff === 0) return 'Today'; if (diff === 1) return 'Tomorrow'; if (diff === -1) return 'Yesterday'; if (diff < 0) return `${-diff} days overdue`;
  if (diff < 7) return DAYS[new Date(t).getDay()][0].toUpperCase() + DAYS[new Date(t).getDay()].slice(1); return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
