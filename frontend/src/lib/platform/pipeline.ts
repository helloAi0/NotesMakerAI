/* Lecture → everything: one click turns a lecture’s notes into flashcards, a first quiz, simulation suggestions and a spaced study plan. */
import { cardsFromText, DAY } from '../friday/agents/tutor';
import type { Card } from '../friday/agents/tutor';
import type { LectureNotes } from '../lecture';
import { fmtTime } from '../lecture';
import { relatedness } from './model';
import type { SimInfo } from './model';

export interface PlanItem { dayOffset: number; due: string; title: string }
export interface Everything { topic: string; cards: Card[]; sims: { id: string; title: string; why: string }[]; plan: PlanItem[]; weakSections: string[] }
const isoDay = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function lectureToEverything(n: LectureNotes, sims: SimInfo[], now = Date.now()): Everything {
  const topic = (n.title || 'Lecture').slice(0, 60); const seen = new Set<string>(); const cards: Card[] = [];
  for (const s of n.sections) for (const c of cardsFromText([s.summary, ...s.bullets, ...s.definitions.map(d => `${d.term} is ${d.meaning}.`), ...s.formulas.map(f => f.text), s.text].join('. ').slice(0, 6000), topic, `${n.title} · ${fmtTime(s.start)}`, now)) { const k = c.front.toLowerCase(); if (!seen.has(k)) { seen.add(k); cards.push(c); } }
  const ranked = sims.map(x => ({ x, r: Math.max(...n.sections.map(s => relatedness(s.title, [x.title, x.subject ?? '', ...(x.tags ?? [])].join(' '))), relatedness(n.keyTerms.slice(0, 8).join(' '), [x.title, ...(x.tags ?? [])].join(' '))) })).filter(a => a.r >= 0.34).sort((a, b) => b.r - a.r).slice(0, 3);
  const simSug = ranked.map(a => ({ id: a.x.id, title: a.x.title, why: `related to “${n.sections.find(s => relatedness(s.title, a.x.title + ' ' + (a.x.tags ?? []).join(' ')) >= 0.34)?.title ?? topic}”` }));
  const steps: [number, string][] = [[0, `Review the new “${topic}” flashcards`], [1, `Take a 5-question quiz on “${topic}”`], [3, `Review “${topic}” cards that are due`], ...(simSug[0] ? [[4, `Predict-and-run “${simSug[0].title}”`] as [number, string]] : []), [7, `Mock quiz on “${topic}” (check what you forgot)`], [14, `Final review of “${topic}”`]];
  return { topic, cards, sims: simSug, plan: steps.map(([d, t]) => ({ dayOffset: d, due: isoDay(now + d * DAY), title: t })), weakSections: n.sections.filter(s => s.formulas.length + s.definitions.length === 0).map(s => s.title).slice(0, 5) };
}
