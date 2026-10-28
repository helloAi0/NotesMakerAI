/** Small shared helpers for the university-track simulations (seeded RNG, fixed-tick accumulator, metadata). */
import type { EducationLevel, Difficulty, SimSubject } from './types';
import { PG_ALL, UG_ENG } from './types';

export const mulberry = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const meta = (subject: SimSubject, difficulty: Difficulty, category: string, topic: string, subtopic: string, levels: EducationLevel[] = [...UG_ENG, ...PG_ALL, 'B.Sc']) => ({
  subject, status: 'active' as const, educationLevels: levels, difficulty, category, topic, subtopic,
});
/** Runs `fn` once per `tick` seconds of simulated time (at most `max` times per call so a long frame cannot freeze the page). */
export function ticks(acc: { a: number }, dt: number, tick: number, fn: () => void, max = 40) { acc.a += dt; let n = 0; while (acc.a >= tick && n < max) { acc.a -= tick; fn(); n++; } if (acc.a > tick * max) acc.a = 0; }
export const hex = (n: number, d = 6) => (n >>> 0).toString(16).padStart(8, '0').slice(0, d);
export const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
