/* Demo data for presentations. It is SYNTHETIC, always switched on explicitly, always labelled, and fully reversible:
   your real deck and history are copied aside first and put back when you switch it off. */
import { Deck, cardsFromText, DAY } from '../friday/agents/tutor';
import { StudentModel } from './model';
import type { KV } from '../friday/learn';
export const DECK_KEY = 'nm_friday_deck', MODEL_KEY = 'nm_student_model', BACKUP = 'nm_demo_backup', FLAG = 'nm_demo';
const TEXT: Record<string, string> = {
  Thermodynamics: 'Enthalpy is the heat content of a system at constant pressure. Entropy is a measure of disorder in a system. Internal energy is the total energy stored inside a system. A calorimeter is a device used to measure heat transfer. Heat capacity is the amount of heat needed to raise the temperature of a substance by one degree.',
  Kinematics: 'Velocity is the rate of change of position of an object with time. Acceleration is a measure of the rate of change of velocity. Displacement is the shortest distance between the start and end points. Momentum is the product of mass and velocity of a body.',
  Optics: 'Refraction is the bending of light as it passes between two media. Diffraction is the spreading of waves as they pass through an opening. A lens is a transparent object that focuses or spreads light. Focal length is the distance between a lens and its focus.',
};
export const isDemo = (kv: KV) => kv.get(FLAG) === '1';
export function enableDemo(kv: KV, now = Date.now()): { cards: number } {
  if (isDemo(kv)) return { cards: 0 }; kv.set(BACKUP, JSON.stringify({ deck: kv.get(DECK_KEY), model: kv.get(MODEL_KEY) }));
  const dkv = new MemKV(), mkv = new MemKV(); const d = new Deck(dkv, 'd'); const m = new StudentModel(mkv, 'm'); d.onEvent = e => m.record(e); let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (const [t, text] of Object.entries(TEXT)) d.add(cardsFromText(text, t, 'demo', now - 28 * DAY));
  const LAST: Record<string, number> = { Kinematics: 0, Thermodynamics: 3, Optics: 16 }; const strength: Record<string, number> = { Kinematics: 0.9, Thermodynamics: 0.55, Optics: 0.35 };
  for (let day = 27; day >= 0; day--) { if (rnd() < 0.25) continue; const t0 = now - day * DAY + 10 * 3600_000; for (const c of d.cards()) { if (rnd() < 0.45 || day < (LAST[c.topic] ?? 0)) continue; const p = Math.min(0.95, (strength[c.topic] ?? 0.6) * (0.55 + (28 - day) / 28 * 0.5)); const g = rnd() < p ? (rnd() < 0.3 ? 4 : 3) : 1; d.review(c.id, g as 1 | 3 | 4, t0 + Math.floor(rnd() * 3600_000)); } if (day % 5 === 0) { const n = 10; const sc = Math.round(n * Math.min(0.95, 0.35 + (28 - day) / 28 * 0.5 + rnd() * 0.08)); d.recordQuiz(undefined, sc, n, t0 + 1800_000); } m.snapshot(d, t0 + 7200_000); }
  d.recordMistake({ topic: 'Optics', question: 'What is refraction?', given: 'reflection', correct: 'bending of light' }, now - 2 * DAY); d.recordMistake({ topic: 'Optics', question: 'What is refraction?', given: 'reflection', correct: 'bending of light' }, now - DAY); d.addExam('Optics', now + 3 * DAY);
  m.record({ type: 'sim', ref: 'projectile', topic: 'Kinematics', t: now - 3 * DAY }); m.record({ type: 'predict', ref: 'projectile', topic: 'Kinematics', ok: true, t: now - 3 * DAY }); m.record({ type: 'predict', ref: 'pendulum', topic: 'Kinematics', ok: false, t: now - 2 * DAY });
  kv.set(DECK_KEY, dkv.get('d') ?? '{}'); kv.set(MODEL_KEY, mkv.get('m') ?? '{}'); kv.set(FLAG, '1'); return { cards: d.cards().length };
}
export function disableDemo(kv: KV): boolean { if (!isDemo(kv)) return false; try { const b = JSON.parse(kv.get(BACKUP) || '{}'); kv.set(DECK_KEY, b.deck ?? ''); kv.set(MODEL_KEY, b.model ?? ''); } catch { /* keep going */ } kv.set(FLAG, '0'); kv.set(BACKUP, ''); return true; }
class MemKV implements KV { m = new Map<string, string>(); get(k: string) { return this.m.get(k) ?? null; } set(k: string, v: string) { this.m.set(k, v); } }
