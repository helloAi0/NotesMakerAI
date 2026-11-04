/* Lab report / assignment helper that EXPLAINS rather than answers: it reviews a draft against what a marker looks for and replies with
   guiding questions. It never writes the report and never gives the final result of a calculation. */
import { calc } from '../fridayCore';
import { recomputeClaims } from '../friday/agents/verify';

export interface Issue { section: string; level: 'fix' | 'improve'; message: string; ask: string }
export interface LabReview { issues: Issue[]; strengths: string[]; sections: Record<string, boolean>; score: number }
const SEC: [string, RegExp][] = [['aim', /\b(aims?|objectives?|purpose)\b/i], ['hypothesis', /\b(hypothes|expect|predict)/i], ['method', /\b(apparatus|procedures?|methods?|setup|set-up)\b/i], ['data', /\b(observations?|data|readings?|results?|tables?)\b/i], ['calculation', /\b(calculations?|analysis)\b/i], ['error', /\b(error|uncertaint|percentage error|precision|accuracy)\b/i], ['conclusion', /\b(conclusions?|discussion|inference)\b/i]];
const UNIT = /\b(?:m\/s²?|m\/s|kg|g|mg|mm|cm|km|m|s|ms|min|h|hz|khz|mhz|n|j|kj|w|kw|v|mv|a|ma|ω|ohms?|k|°c|°|c|mol|l|ml|pa|kpa|atm|ev|db|%|rad|f|μf|uf|h)\b/i;
export function reviewLab(text: string): LabReview {
  const t = text.trim(); const issues: Issue[] = []; const strengths: string[] = []; const sections: Record<string, boolean> = {};
  if (t.length < 80) return { issues: [{ section: 'all', level: 'fix', message: 'The draft is too short to review.', ask: 'Start with your aim: what quantity are you trying to find or test, and why?' }], strengths, sections, score: 0 };
  for (const [k, re] of SEC) sections[k] = re.test(t);
  const need: [string, string, string][] = [['aim', 'No aim or objective found.', 'In one sentence: what are you measuring or testing, and what would a “yes” look like?'], ['method', 'No method or apparatus section found.', 'Could another student repeat your experiment from your description alone? What would they be missing?'], ['data', 'No observations or data found.', 'Where are your raw readings? What is each column’s quantity and unit?'], ['calculation', 'No calculation section found.', 'Which formula links your readings to the quantity you want? Write it first, then substitute.'], ['conclusion', 'No conclusion found.', 'Does your result agree with the aim? Quote one number from your data to support that.']];
  for (const [k, m, a] of need) if (!sections[k]) issues.push({ section: k, level: 'fix', message: m, ask: a }); else strengths.push(`${k[0].toUpperCase() + k.slice(1)} section present.`);
  if (!sections.error) issues.push({ section: 'error', level: 'improve', message: 'No discussion of error or uncertainty.', ask: 'What is the smallest division of your instrument, and how large is that compared with your reading? Which step introduces the biggest error?' });
  if (!sections.hypothesis) issues.push({ section: 'hypothesis', level: 'improve', message: 'No prediction or hypothesis.', ask: 'Before looking at your data, what did you expect to happen, and what theory made you expect it?' });
  const nums = [...t.matchAll(/(?<![\w.])(-?\d+(?:\.\d+)?)(\s*[a-zA-Z°μΩ%/²]{0,6})/g)]; const withUnit = nums.filter(m => UNIT.test(m[2].trim())).length;
  if (nums.length >= 6 && withUnit / nums.length < 0.25) issues.push({ section: 'data', level: 'fix', message: 'Many numbers have no unit.', ask: 'Pick three numbers from your data table: what is the unit of each? A number without a unit is not a measurement.' });
  const rc = recomputeClaims(t, calc); if (rc.wrong.length) for (const w of rc.wrong.slice(0, 3)) issues.push({ section: 'calculation', level: 'fix', message: `A calculation does not add up: “${w.text.slice(0, 60)}”.`, ask: 'Redo this step on a calculator, one operation at a time. Where does your result first differ from what is written?' }); else if (rc.checked) strengths.push(`${rc.checked} written calculation${rc.checked > 1 ? 's' : ''} checked and consistent.`);
  const concl = t.slice(Math.max(0, t.search(/\b(conclusions?|discussion)\b/i))); if (sections.conclusion && !/\d/.test(concl)) issues.push({ section: 'conclusion', level: 'improve', message: 'The conclusion quotes no numbers.', ask: 'Which one value from your results best supports your conclusion? Put it in a sentence.' });
  const fix = issues.filter(i => i.level === 'fix').length, imp = issues.length - fix; const score = Math.max(0, Math.round(100 - fix * 14 - imp * 6));
  return { issues, strengths, sections, score };
}
/** Requests for the finished answer get a coaching reply instead. */
export function isAnswerRequest(q: string): boolean { return /\b(write|do|finish|complete|solve)\b.{0,25}\b(my|the|this)\b.{0,25}\b(lab report|assignment|homework|report|answers?)\b|\bgive (me )?(the )?(final )?answers?\b|\bjust (tell|give) me the answer\b/i.test(q); }
export function coachReply(q: string): string { return isAnswerRequest(q) ? 'I will not write or solve this for you, because then you would not learn it and your teacher could not trust it. I can do something better: tell me what you have tried so far and I will point at the first step that goes wrong, ask guiding questions, or check each line of your working.' : ''; }
