/* Pilot kit: the same short test before and after (and a survey) → a paired before/after report a teacher can show an investor.
   Honest by design: it reports sample size, a confidence interval and the limits (no control group). */
import { checksum } from '../friday/agents/report';

export interface PilotQ { q: string; options: string[]; answer: number }
export interface PilotTest { kind: 'nm-pilot-test'; v: 1; id: string; title: string; questions: PilotQ[] }
export interface PilotResult { kind: 'nm-pilot-result'; v: 1; testId: string; phase: 'pre' | 'post'; student: string; score: number; n: number; takenAt: number; survey?: Survey; checksum: string }
export interface Survey { useful: number; easier: number; wouldRecommend: number; trust: number; comment?: string } // 1–5 each; recommend 0–10 as nps

/** Teacher writes questions as: “Question? | right option | wrong | wrong | wrong”, one per line. */
export function parseQuestions(text: string): { questions: PilotQ[]; errors: string[] } {
  const questions: PilotQ[] = [], errors: string[] = [];
  text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach((l, i) => {
    const p = l.split('|').map(x => x.trim()).filter(Boolean); if (p.length < 3) { errors.push(`Line ${i + 1}: need a question and at least two options separated by |`); return; }
    const [q, right, ...wrong] = p; const opts = [right, ...wrong].slice(0, 5); const pos = (q.length + right.length + i) % opts.length; const arr = [...wrong.slice(0, 4)]; arr.splice(pos, 0, right); questions.push({ q: q.slice(0, 300), options: arr.map(o => o.slice(0, 200)), answer: pos });
  });
  return { questions: questions.slice(0, 50), errors };
}
export const makeTest = (title: string, questions: PilotQ[]): PilotTest => ({ kind: 'nm-pilot-test', v: 1, id: checksum(title + questions.map(q => q.q).join('|')), title: title.slice(0, 80), questions });
export function parseTest(text: string): { ok: true; test: PilotTest } | { ok: false; why: string } {
  try { const j = JSON.parse(text) as PilotTest; if (j?.kind !== 'nm-pilot-test' || !Array.isArray(j.questions) || !j.questions.length) return { ok: false, why: 'not a pilot test file' }; const qs = j.questions.slice(0, 50).filter(q => typeof q?.q === 'string' && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length).map(q => ({ q: q.q.slice(0, 300), options: q.options.slice(0, 5).map(o => String(o).slice(0, 200)), answer: q.answer })); return qs.length ? { ok: true, test: { kind: 'nm-pilot-test', v: 1, id: String(j.id).slice(0, 20), title: String(j.title ?? '').slice(0, 80), questions: qs } } : { ok: false, why: 'no valid questions' }; } catch { return { ok: false, why: 'not a valid pilot test file' }; }
}
const body = (r: Omit<PilotResult, 'checksum'>) => JSON.stringify([r.testId, r.phase, r.student, r.score, r.n, r.takenAt, r.survey ? [r.survey.useful, r.survey.easier, r.survey.wouldRecommend, r.survey.trust] : null]);
export function makeResult(test: PilotTest, phase: 'pre' | 'post', student: string, choices: (number | null)[], now = Date.now(), survey?: Survey): PilotResult {
  const score = test.questions.reduce((s, q, i) => s + (choices[i] === q.answer ? 1 : 0), 0); const r = { kind: 'nm-pilot-result' as const, v: 1 as const, testId: test.id, phase, student: student.trim().slice(0, 60) || 'Student', score, n: test.questions.length, takenAt: now, survey };
  return { ...r, checksum: checksum(body(r)) };
}
export function parseResult(text: string): { ok: true; r: PilotResult } | { ok: false; why: string } {
  try { const j = JSON.parse(text) as PilotResult; if (j?.kind !== 'nm-pilot-result' || (j.phase !== 'pre' && j.phase !== 'post') || !Number.isFinite(j.score) || !Number.isFinite(j.n) || j.n <= 0 || j.score < 0 || j.score > j.n) return { ok: false, why: 'not a valid pilot result' }; const { checksum: c, ...rest } = j; return c === checksum(body(rest)) ? { ok: true, r: j } : { ok: false, why: `${String(j.student).slice(0, 30)}: file was edited or damaged (checksum mismatch)` }; } catch { return { ok: false, why: 'not a valid pilot result file' }; }
}
const T95: Record<number, number> = { 1: 12.71, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228, 12: 2.179, 15: 2.131, 20: 2.086, 25: 2.06, 30: 2.042, 40: 2.021, 60: 2.0, 120: 1.98 };
const tcrit = (df: number) => { const ks = Object.keys(T95).map(Number).sort((a, b) => a - b); for (const k of ks) if (df <= k) return T95[k]; return 1.96; };
export interface PilotSummary {
  testId: string | null; pairs: number; preOnly: number; postOnly: number; meanPre: number | null; meanPost: number | null; meanGainPts: number | null; ci95: [number, number] | null; cohensD: number | null; improved: number; same: number; worse: number;
  survey: { n: number; useful: number; easier: number; trust: number; nps: number | null } | null; verdict: string; students: { student: string; pre: number; post: number }[];
}
export function pilotSummary(results: PilotResult[]): PilotSummary {
  const last = (phase: 'pre' | 'post') => { const m = new Map<string, PilotResult>(); for (const r of results.filter(x => x.phase === phase)) { const k = r.student.toLowerCase(); const o = m.get(k); if (!o || r.takenAt > o.takenAt) m.set(k, r); } return m; };
  const pre = last('pre'), post = last('post'); const pairs = [...pre].filter(([k]) => post.has(k)).map(([k, a]) => ({ student: a.student, pre: a.score / a.n, post: post.get(k)!.score / post.get(k)!.n }));
  const n = pairs.length; const diffs = pairs.map(p => p.post - p.pre); const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length; const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  const surveys = results.filter(r => r.phase === 'post' && r.survey).map(r => r.survey!); const nps = surveys.length ? Math.round((surveys.filter(s => s.wouldRecommend >= 9).length - surveys.filter(s => s.wouldRecommend <= 6).length) / surveys.length * 100) : null;
  const sdd = n >= 2 ? sd(diffs) : NaN; const md = n ? mean(diffs) : null; const ci = n >= 2 && Number.isFinite(sdd) ? ([(md! - tcrit(n - 1) * sdd / Math.sqrt(n)) * 100, (md! + tcrit(n - 1) * sdd / Math.sqrt(n)) * 100] as [number, number]) : null;
  const d = n >= 2 && sdd > 0 ? md! / sdd : null; const improved = diffs.filter(x => x > 0.0001).length, worse = diffs.filter(x => x < -0.0001).length;
  const verdict = n === 0 ? 'No student has both a before and an after result yet.' : n < 10 ? `Only ${n} paired student${n === 1 ? '' : 's'}: too few to claim anything. Treat this as a trial run and aim for 30 or more.` : ci && ci[0] > 0 ? `Scores rose by ${Math.round(md! * 100)} points on average (95% CI ${Math.round(ci[0])} to ${Math.round(ci[1])}) across ${n} students. Without a control group this shows improvement, not proof that the app caused it.` : `The average change is ${Math.round(md! * 100)} points but the confidence interval includes zero, so the result is not clear yet.`;
  return { testId: results[0]?.testId ?? null, pairs: n, preOnly: [...pre].filter(([k]) => !post.has(k)).length, postOnly: [...post].filter(([k]) => !pre.has(k)).length, meanPre: n ? mean(pairs.map(p => p.pre)) : null, meanPost: n ? mean(pairs.map(p => p.post)) : null, meanGainPts: md == null ? null : md * 100, ci95: ci, cohensD: d, improved, same: n - improved - worse, worse,
    survey: surveys.length ? { n: surveys.length, useful: mean(surveys.map(s => s.useful)), easier: mean(surveys.map(s => s.easier)), trust: mean(surveys.map(s => s.trust)), nps } : null, verdict, students: pairs };
}
