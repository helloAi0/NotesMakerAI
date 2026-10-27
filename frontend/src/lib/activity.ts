/** Tiny local activity log for the dashboard: days active (streak) and simulations explored. Nothing leaves the device. */
const KEY = 'nm_activity';
interface Act { days: Record<string, number>; sims: string[]; asked: number }
const load = (): Act => { try { const a = JSON.parse(localStorage.getItem(KEY) || '{}'); return { days: a.days ?? {}, sims: a.sims ?? [], asked: a.asked ?? 0 }; } catch { return { days: {}, sims: [], asked: 0 }; } };
const save = (a: Act) => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* ignore */ } };
const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function touch(kind?: 'sim' | 'ask', id?: string) {
  const a = load(); const k = day(); a.days[k] = (a.days[k] ?? 0) + 1;
  const keys = Object.keys(a.days).sort(); if (keys.length > 400) for (const x of keys.slice(0, keys.length - 400)) delete a.days[x];
  if (kind === 'sim' && id && !a.sims.includes(id)) a.sims.push(id); if (kind === 'ask') a.asked++;
  save(a); window.dispatchEvent(new Event('nm:activity'));
}
export function stats() {
  const a = load(); let streak = 0; const d = new Date(); if (!a.days[day(d)]) d.setDate(d.getDate() - 1);
  while (a.days[day(d)]) { streak++; d.setDate(d.getDate() - 1); }
  const week: { label: string; n: number }[] = []; for (let i = 6; i >= 0; i--) { const x = new Date(); x.setDate(x.getDate() - i); week.push({ label: x.toLocaleDateString(undefined, { weekday: 'short' }), n: a.days[day(x)] ?? 0 }); }
  return { streak, simsExplored: a.sims.length, asked: a.asked, week, exploredIds: a.sims };
}
