/* Progress reports + class view — no server needed.
   A student exports a small signed JSON report; a teacher imports many and sees the class at a glance.
   The checksum makes accidental edits and corrupt files visible; it is NOT authentication
   (anyone could re-create a report), so treat reports as self-reported until accounts exist. */
import { Deck, DAY } from './tutor';

export interface TopicStat { topic: string; mastery: number; cards: number; due: number; mistakes: number }
export interface Report { kind: 'nm-report'; v: 1; student: string; issued: number; topics: TopicStat[]; exams: { topic: string; at: number }[]; reviews30d: number; activeDays30: number; cards: number; checksum: string }

const stable = (r: Omit<Report, 'checksum'>) => JSON.stringify([r.kind, r.v, r.student, r.issued, r.topics.map(t => [t.topic, +t.mastery.toFixed(3), t.cards, t.due, t.mistakes]), r.exams.map(e => [e.topic, e.at]), r.reviews30d, r.activeDays30, r.cards]);
/** FNV-1a, 32-bit — tamper-evident only. */
export function checksum(s: string): string { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }

export function buildReport(deck: Deck, student: string, now = Date.now()): Report {
  const from = now - 30 * DAY; const body: Omit<Report, 'checksum'> = {
    kind: 'nm-report', v: 1, student: student.trim().slice(0, 60) || 'Student', issued: now,
    topics: deck.topics().map(t => deck.mastery(t, now)), exams: deck.exams().map(e => ({ topic: e.topic, at: e.at })),
    reviews30d: deck.reviewLog().filter(t => t >= from).length, activeDays30: deck.activeDays(30, now), cards: deck.cards().length,
  };
  return { ...body, checksum: checksum(stable(body)) };
}
export const encodeReport = (r: Report) => JSON.stringify(r, null, 2);

export function parseReport(text: string): { ok: true; report: Report } | { ok: false; why: string } {
  let j: unknown; try { j = JSON.parse(text); } catch { return { ok: false, why: 'not a valid report file' }; }
  const r = j as Partial<Report>; if (!r || r.kind !== 'nm-report' || r.v !== 1 || !Array.isArray(r.topics) || typeof r.student !== 'string' || typeof r.issued !== 'number') return { ok: false, why: 'not a Notes Maker report' };
  const topics = (r.topics as TopicStat[]).filter(t => t && typeof t.topic === 'string' && Number.isFinite(t.mastery)).map(t => ({ topic: t.topic.slice(0, 80), mastery: Math.min(1, Math.max(0, t.mastery)), cards: t.cards | 0, due: t.due | 0, mistakes: t.mistakes | 0 }));
  const exams = Array.isArray(r.exams) ? r.exams.filter(e => e && typeof e.topic === 'string' && Number.isFinite(e.at)) : [];
  const out: Report = { kind: 'nm-report', v: 1, student: r.student.slice(0, 60), issued: r.issued, topics, exams, reviews30d: (r.reviews30d ?? 0) | 0, activeDays30: (r.activeDays30 ?? 0) | 0, cards: (r.cards ?? 0) | 0, checksum: String(r.checksum ?? '') };
  const { checksum: c, ...body } = out; if (c !== checksum(stable(body))) return { ok: false, why: `${out.student}: file was edited or damaged (checksum mismatch)` };
  return { ok: true, report: out };
}

export interface ClassSummary {
  students: number; avgMastery: number; activeStudents: number;
  topics: { topic: string; avg: number; students: number; weak: string[] }[];
  atRisk: { student: string; why: string; urgency: number }[];
  roster: { student: string; mastery: number; activeDays30: number; cards: number; issued: number; stale: boolean }[];
}
const avgOf = (r: Report) => (r.topics.length ? r.topics.reduce((a, t) => a + t.mastery * Math.max(1, t.cards), 0) / r.topics.reduce((a, t) => a + Math.max(1, t.cards), 0) : 0);
/** Latest report per student name (case-insensitive), then class-level aggregates. */
export function classSummary(all: Report[], now = Date.now()): ClassSummary {
  const latest = new Map<string, Report>(); for (const r of all) { const k = r.student.trim().toLowerCase(); const o = latest.get(k); if (!o || r.issued > o.issued) latest.set(k, r); }
  const rs = [...latest.values()]; const by = new Map<string, { sum: number; n: number; weak: string[] }>();
  for (const r of rs) for (const t of r.topics) { const k = t.topic.toLowerCase(); const o = by.get(k) ?? { sum: 0, n: 0, weak: [] }; o.sum += t.mastery; o.n++; if (t.mastery < 0.6) o.weak.push(r.student); by.set(k, o); }
  const topics = [...by.entries()].map(([topic, o]) => ({ topic, avg: o.sum / o.n, students: o.n, weak: o.weak })).sort((a, b) => a.avg - b.avg);
  const atRisk: ClassSummary['atRisk'] = [];
  for (const r of rs) {
    const ex = r.exams.filter(e => e.at >= now - DAY).sort((a, b) => a.at - b.at)[0];
    if (ex) { const d = Math.max(0, Math.ceil((ex.at - now) / DAY)); const t = r.topics.find(x => x.topic.toLowerCase() === ex.topic.toLowerCase()); const m = t?.mastery ?? 0; if (d <= 14 && m < 0.6) atRisk.push({ student: r.student, why: `${ex.topic} exam in ${d} day${d === 1 ? '' : 's'}, mastery ${Math.round(m * 100)}%`, urgency: (1 - m) * 3 / Math.max(1, d) }); }
    if (r.activeDays30 <= 2 && r.cards > 0) atRisk.push({ student: r.student, why: `only ${r.activeDays30} active day${r.activeDays30 === 1 ? '' : 's'} in the last 30`, urgency: 0.2 });
  }
  atRisk.sort((a, b) => b.urgency - a.urgency);
  return {
    students: rs.length, avgMastery: rs.length ? rs.reduce((a, r) => a + avgOf(r), 0) / rs.length : 0, activeStudents: rs.filter(r => r.activeDays30 >= 3).length, topics, atRisk,
    roster: rs.map(r => ({ student: r.student, mastery: avgOf(r), activeDays30: r.activeDays30, cards: r.cards, issued: r.issued, stale: now - r.issued > 14 * DAY })).sort((a, b) => a.mastery - b.mastery),
  };
}
export function classCsv(s: ClassSummary): string {
  const q = (x: string | number) => `"${String(x).replace(/"/g, '""')}"`; const rows = [['student', 'avg mastery %', 'active days (30d)', 'cards', 'report date'].map(q).join(',')];
  for (const r of s.roster) rows.push([r.student, Math.round(r.mastery * 100), r.activeDays30, r.cards, new Date(r.issued).toISOString().slice(0, 10)].map(q).join(',')); return rows.join('\n');
}
