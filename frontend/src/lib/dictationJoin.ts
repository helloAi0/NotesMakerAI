/**
 * Dictation arrives in short chunks that the transcription service capitalises as if each began a sentence ("... saying that Hey, you can see Can you hear me?").
 * When the text before the cursor does not end a sentence, an English chunk that starts with a common function word is lower-cased.
 * Names and "I" are never touched, and other languages (German capitalises nouns) are left alone.
 */
const SMALL = new Set(('a an the and but or so then than that this these those it its is are was were be been to of in on at for with from by as if when what which who how why can could will would should do does did have has had not no my your our their his her we you they he she there here just also now well hey okay ok yes yeah oh um uh because while where whether').split(' '));
export function joinChunk(before: string, text: string, lang = 'en'): string {
  if (!/^en/i.test(lang)) return text;
  if (!before.trim() || /\n\s*$/.test(before)) return text;
  if (/[.!?…:;]["')\]]?\s*$/.test(before.trimEnd())) return text;
  const m = text.match(/^(\s*)([A-Z][a-z]*(?:'[a-z]+)?)(?![A-Za-z'])/); if (!m) return text;
  const w = m[2]; if (w === 'I' || /^I'/.test(w) || !SMALL.has(w.toLowerCase())) return text;
  return text.slice(0, m[1].length) + w.charAt(0).toLowerCase() + w.slice(1) + text.slice(m[1].length + w.length);
}
