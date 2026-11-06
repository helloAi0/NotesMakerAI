/* Swipe-style active recall. Right = remembered, left = forgot. Forgotten cards are due again tomorrow morning (not in 10 minutes), remembered cards
   use the normal spaced-repetition schedule. Pure logic; the gesture lives in the component. */
import type { Deck, Grade, Card } from '../friday/agents/tutor';
export type Dir = 'left' | 'right' | 'up';
export const THRESHOLD = 90;
/** pointer drag -> decision. up = easy */
export function decide(dx: number, dy: number, threshold = THRESHOLD): Dir | null { if (dy < -threshold * 1.3 && Math.abs(dy) > Math.abs(dx)) return 'up'; if (dx >= threshold) return 'right'; if (dx <= -threshold) return 'left'; return null; }
export function tomorrowMorning(now: number, hour = 8): number { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(hour, 0, 0, 0); return d.getTime(); }
export function swipe(deck: Deck, id: string, dir: Dir, now = Date.now()): Card | null {
  const g: Grade = dir === 'left' ? 1 : dir === 'up' ? 4 : 3; const c = deck.review(id, g, now); if (!c) return null;
  if (dir === 'left') { const cs = deck.cards(); const i = cs.findIndex(x => x.id === id); if (i >= 0) { cs[i] = { ...cs[i], due: tomorrowMorning(now) }; deck.add([]); /* persists */ return cs[i]; } }
  return c;
}
export function queue(deck: Deck, topic: string | null, now = Date.now(), limit = 30): Card[] { return deck.due(now, 500).filter(c => !topic || c.topic === topic).slice(0, limit); }
export const summary = (log: Dir[]) => { const r = log.filter(d => d !== 'left').length; return { n: log.length, remembered: r, forgot: log.length - r, pct: log.length ? Math.round((r / log.length) * 100) : 0 }; };

/** copy of a card before it is swiped, so a slip of the thumb can be undone */
export const peek = (deck: Deck, id: string): Card | null => { const c = deck.cards().find(x => x.id === id); return c ? { ...c } : null; };
export function restore(deck: Deck, before: Card): boolean { const cs = deck.cards(); const i = cs.findIndex(x => x.id === before.id); if (i < 0) return false; cs[i] = { ...before }; deck.add([]); return true; }
