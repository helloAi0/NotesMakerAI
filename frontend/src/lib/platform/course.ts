/* FRIDAY for institutions: a teacher pastes a syllabus (and optional lecture material) and gets a COURSE PACK:
   units → flashcards → quiz-ready deck, matched simulation assignments, and a week-by-week exam plan.
   A pack is one small JSON file a student imports; nothing needs a server. */
import { Deck, cardsFromText, DAY } from '../friday/agents/tutor';
import type { Card } from '../friday/agents/tutor';
import { relatedness } from './model';
import type { SimInfo } from './model';
import { checksum } from '../friday/agents/report';

export interface Unit { title: string; topics: string[] }
export interface PackCard { front: string; back: string; kind: Card['kind']; source?: string }
export interface PackUnit extends Unit { cards: PackCard[]; sims: { id: string; title: string; why: string }[] }
export interface Week { week: number; label: string; units: string[]; tasks: string[] }
export interface Pack { kind: 'nm-course'; v: 1; title: string; created: number; examAt: number | null; units: PackUnit[]; plan: Week[]; checksum: string }

/** “Unit 1: Thermodynamics — heat, work, entropy” / “1. Kinematics” / “## Optics” (+ bullet or comma-separated subtopics below). */
export function parseSyllabus(text: string): Unit[] {
  const units: Unit[] = []; let cur: Unit | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\t/g, '  '); const t = line.trim(); if (!t) continue;
    const head = t.match(/^(?:#{1,3}\s+|(?:unit|module|chapter|topic|week)\s*[-\d.ivx]*\s*[:.)-]\s*|\d{1,2}[.)]\s+)(.+)$/i) ?? (/^[A-Z][^.!?]{2,60}$/.test(t) && !/^[-•*]/.test(t) && !/^\s/.test(line) && t.split(/\s+/).length <= 8 && !cur ? [t, t] : null);
    const indented = /^\s{2,}|^[-•*]\s+/.test(line);
    if (head && !(indented && cur)) { const [title, rest] = splitTitle(head[1]); cur = { title, topics: rest }; units.push(cur); continue; }
    if (cur) { const items = t.replace(/^[-•*]\s*/, '').split(/[;,]\s*/).map(x => x.trim()).filter(x => x.length > 1 && x.length < 80); cur.topics.push(...items); }
  }
  return units.filter(u => u.title.length > 1).slice(0, 40).map(u => ({ title: u.title.slice(0, 80), topics: [...new Set(u.topics)].slice(0, 30) }));
}
function splitTitle(s: string): [string, string[]] { const m = s.split(/\s+[—–:-]\s+/); return m.length > 1 ? [m[0].trim(), m.slice(1).join(', ').split(/[;,]\s*/).map(x => x.trim()).filter(Boolean)] : [s.trim(), []]; }

export function buildCourse(o: { title: string; syllabus: string; material?: string; sims: SimInfo[]; weeks?: number; examAt?: number | null; now?: number }): Pack | { error: string } {
  const now = o.now ?? Date.now(); const units = parseSyllabus(o.syllabus); if (!units.length) return { error: 'I could not find any units. Write one unit per line, for example “Unit 1: Thermodynamics — heat, work, entropy”.' };
  const paras = (o.material ?? '').split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z])/).map(p => p.trim()).filter(p => p.length > 30);
  const used = new Set<string>(); const out: PackUnit[] = units.map(u => {
    const key = [u.title, ...u.topics].join(' '); const mine = paras.filter(p => relatedness(u.title, p) >= 0.5 || u.topics.some(t => relatedness(t, p) >= 0.6)); const text = mine.join(' ');
    const cards = text ? cardsFromText(text, u.title, 'course material', now).map(c => ({ front: c.front, back: c.back, kind: c.kind, source: c.source })) : [];
    const sims = o.sims.map(s => ({ s, r: Math.max(relatedness(key, [s.title, s.subject ?? '', ...(s.tags ?? [])].join(' ')), ...u.topics.map(t => relatedness(t, [s.title, ...(s.tags ?? [])].join(' ')) * 0.9)) })).filter(x => x.r >= 0.34 && !used.has(x.s.id)).sort((a, b) => b.r - a.r).slice(0, 2);
    sims.forEach(x => used.add(x.s.id)); return { ...u, cards, sims: sims.map(x => ({ id: x.s.id, title: x.s.title, why: `matches “${u.title}”` })) };
  });
  const weeks = Math.max(1, Math.min(26, o.weeks ?? (o.examAt ? Math.max(1, Math.ceil((o.examAt - now) / (7 * DAY))) : Math.max(2, out.length))));
  const body = { kind: 'nm-course' as const, v: 1 as const, title: o.title.trim().slice(0, 80) || 'Course', created: now, examAt: o.examAt ?? null, units: out, plan: examPlan(out, weeks) };
  return { ...body, checksum: checksum(JSON.stringify([body.kind, body.title, body.created, body.units.map(u => [u.title, u.cards.length, u.sims.length]), body.plan.length])) };
}
/** Spread the units over the weeks; the last ~20% of the weeks are revision and mock exams. */
export function examPlan(units: PackUnit[], weeks: number): Week[] {
  const rev = weeks >= 4 ? Math.max(1, Math.round(weeks * 0.2)) : 0; const learn = weeks - rev; const plan: Week[] = [];
  for (let w = 1; w <= learn; w++) {
    const a = Math.floor(((w - 1) * units.length) / learn), b = Math.max(a + 1, Math.floor((w * units.length) / learn)); const us = units.slice(a, Math.min(units.length, b));
    plan.push({ week: w, label: `Learn: ${us.map(u => u.title).join(', ') || 'catch-up'}`, units: us.map(u => u.title), tasks: [...us.flatMap(u => [`Review ${u.cards.length || 'the'} flashcards for ${u.title}`, ...u.sims.map(s => `Predict-and-run “${s.title}”`)]), 'Take a 10-question quiz on this week’s units'] });
  }
  for (let r = 1; r <= rev; r++) plan.push({ week: learn + r, label: r === rev ? 'Final revision and mock exam' : 'Revision of weak topics', units: units.map(u => u.title), tasks: [r === rev ? 'Sit a full timed mock exam, then review the error-pattern report' : 'Take a mock exam from your weak topics', 'Redo every question you got wrong', 'Review all cards that are due']});
  return plan;
}
export const encodePack = (p: Pack) => JSON.stringify(p, null, 2);
export function parsePack(text: string): { ok: true; pack: Pack } | { ok: false; why: string } {
  let j: Partial<Pack>; try { j = JSON.parse(text); } catch { return { ok: false, why: 'not a valid course pack file' }; }
  if (!j || j.kind !== 'nm-course' || j.v !== 1 || !Array.isArray(j.units) || !Array.isArray(j.plan)) return { ok: false, why: 'not a Notes Maker course pack' };
  const units = j.units.slice(0, 60).map(u => ({ title: String(u?.title ?? '').slice(0, 80), topics: (Array.isArray(u?.topics) ? u.topics : []).map(String).slice(0, 40).map(x => x.slice(0, 80)), cards: (Array.isArray(u?.cards) ? u.cards : []).slice(0, 400).filter(c => c && typeof c.front === 'string' && typeof c.back === 'string').map(c => ({ front: c.front.slice(0, 400), back: c.back.slice(0, 400), kind: (['def', 'formula', 'cloze', 'qa'].includes(c.kind) ? c.kind : 'qa') as Card['kind'], source: typeof c.source === 'string' ? c.source.slice(0, 80) : undefined })), sims: (Array.isArray(u?.sims) ? u.sims : []).slice(0, 10).map(s => ({ id: String(s?.id ?? ''), title: String(s?.title ?? '').slice(0, 80), why: String(s?.why ?? '').slice(0, 120) })) })).filter(u => u.title);
  if (!units.length) return { ok: false, why: 'the pack has no units' };
  const plan = (j.plan as Week[]).slice(0, 60).map(w => ({ week: w.week | 0, label: String(w.label ?? '').slice(0, 160), units: (Array.isArray(w.units) ? w.units : []).map(String).slice(0, 60), tasks: (Array.isArray(w.tasks) ? w.tasks : []).map(x => String(x).slice(0, 200)).slice(0, 30) }));
  const body = { kind: 'nm-course' as const, v: 1 as const, title: String(j.title ?? 'Course').slice(0, 80), created: Number(j.created) || 0, examAt: Number.isFinite(j.examAt) ? (j.examAt as number) : null, units, plan };
  const ck = checksum(JSON.stringify([body.kind, body.title, body.created, units.map(u => [u.title, (j.units as PackUnit[]).find(x => String(x?.title ?? '').slice(0, 80) === u.title)?.cards?.length ?? 0, (j.units as PackUnit[]).find(x => String(x?.title ?? '').slice(0, 80) === u.title)?.sims?.length ?? 0]), plan.length]));
  if (ck !== j.checksum) return { ok: false, why: 'the file was edited or damaged (checksum mismatch)' };
  return { ok: true, pack: { ...body, checksum: ck } };
}
/** Student side: put the pack’s cards in the deck (as brand-new cards) and its exam date in the planner. */
export function importPack(deck: Deck, p: Pack, now = Date.now()): { cards: number; units: number; exam: boolean } {
  let n = 0; for (const u of p.units) n += deck.add(u.cards.map((c, i) => ({ id: `pk${now.toString(36)}${i}${Math.random().toString(36).slice(2, 6)}`, topic: u.title, front: c.front, back: c.back, kind: c.kind, source: c.source ?? p.title, created: now, due: now, S: 0, D: 0, reps: 0, lapses: 0, state: 'new' as const })));
  if (p.examAt && p.examAt > now) deck.addExam(p.title, p.examAt); return { cards: n, units: p.units.length, exam: !!p.examAt && p.examAt > now };
}
