/** Small natural-language date parser (English): “in 3 days”, “tomorrow at 6pm”, “friday”, “12 nov”, “2026-11-20”. */
const DAY = 86400000; const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']; const WD = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export interface When { at: number; matched: string; hasTime: boolean }
function atTime(base: Date, h: number, m: number) { const d = new Date(base); d.setHours(h, m, 0, 0); return d.getTime(); }
export function parseWhen(text: string, now = Date.now(), defaultHour = 9): When | null {
  const s = text.toLowerCase(); const base = new Date(now); let m: RegExpMatchArray | null;
  const time = s.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\bat\s+(\d{1,2})(?::(\d{2}))\b/); let h = defaultHour, mi = 0, hasTime = false;
  if (time) { hasTime = true; if (time[3]) { h = +time[1] % 12 + (time[3] === 'pm' ? 12 : 0); mi = +(time[2] ?? 0); } else { h = +time[4]; mi = +time[5]; } }
  if ((m = s.match(/\bin\s+(\d+|an?|half an?)\s*(minute|min|hour|hr|day|week)s?\b/))) { const n = /half/.test(m[1]) ? 0.5 : /^an?$/.test(m[1]) ? 1 : +m[1]; const u = /min/.test(m[2]) ? 60000 : /h/.test(m[2]) ? 3600000 : /day/.test(m[2]) ? DAY : 7 * DAY; const at = now + n * u; return { at: u >= DAY ? atTime(new Date(at), h, mi) : at, matched: m[0], hasTime: u < DAY || hasTime }; }
  if ((m = s.match(/\btomorrow\b/))) return { at: atTime(new Date(now + DAY), h, mi), matched: m[0], hasTime };
  if ((m = s.match(/\b(?:today|tonight)\b/))) return { at: atTime(base, /tonight/.test(m[0]) && !time ? 20 : h, mi), matched: m[0], hasTime: hasTime || /tonight/.test(m[0]) };
  if ((m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) return { at: atTime(new Date(+m[1], +m[2] - 1, +m[3]), h, mi), matched: m[0], hasTime };
  if ((m = s.match(new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(${MON.join('|')})[a-z]*\b|\b(${MON.join('|')})[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b`)))) { const day = +(m[1] ?? m[4]); const mon = MON.indexOf((m[2] ?? m[3]).slice(0, 3)); let d = new Date(base.getFullYear(), mon, day); if (d.getTime() < now - DAY) d = new Date(base.getFullYear() + 1, mon, day); return { at: atTime(d, h, mi), matched: m[0], hasTime }; }
  if ((m = s.match(new RegExp(String.raw`\b(next|this|on)?\s*(${WD.join('|')})\b`)))) { const target = WD.indexOf(m[2]); let add = (target - base.getDay() + 7) % 7; if (add === 0 || m[1] === 'next') add = add === 0 ? 7 : add + (m[1] === 'next' && add < 7 ? 0 : 0); return { at: atTime(new Date(now + add * DAY), h, mi), matched: m[0].trim(), hasTime }; }
  if (hasTime && time) { let at = atTime(base, h, mi); if (at < now) at += DAY; return { at, matched: time[0], hasTime }; }
  return null;
}
export const daysUntil = (at: number, now = Date.now()) => Math.max(0, Math.ceil((at - now) / DAY));
