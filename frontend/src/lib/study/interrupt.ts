/* Conversational voice interruption. A Narrator reads notes sentence by sentence. When the student interrupts ("wait, explain the enthalpy
   part again with an easier example") it pauses, works out WHICH part they mean from their words and the sentence being read, asks the model to
   rewrite just that part the way they asked, splices the rewrite into the notes and carries on speaking from there. */
export type Gen = (prompt: string) => Promise<string>;
export type Intent = 'stop' | 'pause' | 'resume' | 'repeat' | 'explain' | 'simpler' | 'example' | 'slower' | 'faster' | 'next' | 'back' | 'none';
export interface Parsed { intent: Intent; wait: boolean; focus: string; flags: { simpler: boolean; example: boolean; deeper: boolean; shorter: boolean; analogy: boolean } }
const LEAD = /^(?:(?:hey|ok|okay|friday|um|uh|so)[,\s]+)*(?:wait|hold on|stop|one sec(?:ond)?|just a (?:sec|minute)|excuse me|sorry)?[,.\s-]*/i;
/** a few Hindi / Hinglish phrases (Devanagari or Roman) are mapped to the English commands below. Other Indian languages: type or say English. */
const HI: [RegExp, string][] = [[/आगे बढ़ो|aage badho|जारी रखो|chalu rakho/g, ' continue '], [/रुको|रुकिए|ruko|rukiye|ek minute/g, ' wait '], [/बंद करो|band karo|चुप हो जाओ|chup/g, ' stop '], [/पीछे जाओ|peeche|पिछला/g, ' go back '], [/आगे|aage|अगला|agla/g, ' next '], [/दोबारा|dobara|फिर से|phir se|firse|दुबारा/g, ' again '], [/समझाओ|समझाइए|samjhao|samjhaiye|बताओ|batao/g, ' explain '], [/आसान|aasan|asan|सरल|saral/g, ' easier '], [/उदाहरण|udaharan/g, ' example '], [/धीरे|dheere|dhire/g, ' speak slower '], [/तेज़|तेज|tez|jaldi/g, ' speed up ']];
export function parseInterrupt(raw: string): Parsed {
  const t = HI.reduce((x, [re, to]) => x.replace(re, to), raw.toLowerCase()).replace(/\s+/g, ' ').trim().replace(/[“”"']/g, '').replace(/[“”"']/g, '').replace(/\bdo not\b/g, 'dont').replace(/\bdid not\b/g, 'didnt').trim(); const wait = /^(?:\w+[,\s]+)?(wait|hold on|stop|one sec|just a (sec|min)|excuse me)\b/.test(t);
  const flags = { simpler: /\b(easier|simpler|simply|simple|basic|plain|layman|beginner|eli5|dumb it down|easy)\b/.test(t), example: /\b(example|instance|illustrat|real[- ]life|everyday)\b/.test(t), analogy: /\banalog(y|ies)\b/.test(t), deeper: /\b(in detail|deeper|more detail|elaborate|more about|expand)\b/.test(t), shorter: /\b(shorter|brief|quick(ly)?|summar|in short|tl;?dr)\b/.test(t) };
  const body = t.replace(LEAD, '').trim(); const none: Parsed = { intent: 'none', wait, focus: '', flags };
  if (!t) return none;
  if (/^(?:\w+[,\s]+)?(stop|quiet|enough|shut up|be quiet|cancel)\s*(?:it|please|now|talking|reading)?$/.test(t)) return { ...none, intent: 'stop' };
  if (/^(pause|hold on|wait)$/.test(body) || (wait && !body)) return { ...none, intent: 'pause' };
  if (/^(continue|resume|go on|carry on|keep going|go ahead|okay continue)\b/.test(body)) return { ...none, intent: 'resume' };
  if (/^(next|skip|move on|go to the next)/.test(body)) return { ...none, intent: 'next' };
  if (/^(go back|previous|back up|rewind)/.test(body)) return { ...none, intent: 'back' };
  if (/\b(slow(er)? down|too fast|speak slower|slowly)\b/.test(body)) return { ...none, intent: 'slower' };
  if (/\b(faster|speed up|too slow)\b/.test(body)) return { ...none, intent: 'faster' };
  const ask = /\b(explain|again|repeat|say that|what (?:is|does|was|do you mean)|didnt (?:get|understand)|dont (?:get|understand)|confus|clarify|elaborate|tell me more|what about|go over)\b/.test(body) || flags.simpler || flags.example || flags.analogy || flags.deeper;
  if (!ask) return { ...none };
  let focus = body.replace(/\b(please|can you|could you|would you|will you|i want you to|i dont (?:get|understand)|didnt (?:get|understand)|explain|again|repeat|say|that|this|the|part|bit|section|portion|about|with|an?|easier|simpler|simple|example|examples|analogy|in detail|more|tell me|go over|what is|what does|mean|i am|im|confused|by)\b/g, ' ').replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (focus.split(' ').length > 8) focus = focus.split(' ').slice(-6).join(' ');
  return { intent: flags.simpler ? 'simpler' : flags.example || flags.analogy ? 'example' : 'explain', wait, focus, flags };
}
const toks = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 2).map(w => w.replace(/(ing|ed|es|s)$/, ''));
/** index of the sentence the student means: best word overlap with the focus; ties and no match -> the sentence being read */
export function findTarget(sentences: string[], focus: string, current: number): { index: number; confident: boolean } {
  const f = new Set(toks(focus)); if (!f.size) return { index: current, confident: false };
  let best = current, bs = 0; sentences.forEach((s, i) => { const st = new Set(toks(s)); let n = 0; for (const w of f) if (st.has(w)) n++; const sc = n / f.size + (i <= current ? 0.05 : 0) - Math.abs(i - current) * 0.001; if (n && sc > bs) { bs = sc; best = i; } });
  return { index: best, confident: bs >= 0.5 };
}
export function rewritePrompt(context: string[], target: number, p: Parsed, langName = 'English'): string {
  const ask = [p.flags.simpler && 'much simpler words, as for a beginner', p.flags.example && 'one concrete everyday example', p.flags.analogy && 'one clear analogy', p.flags.deeper && 'more depth and detail', p.flags.shorter && 'only 1-2 short sentences'].filter(Boolean).join(', ') || 'a clearer explanation';
  return `A student is listening to study notes read aloud and interrupted. Re-explain ONLY the part marked >>> <<<, using ${ask}. Write ${langName}. 2 to 5 short spoken sentences, no bullet points, no markdown, no greeting. Keep technical terms and formulas as written; do not add facts the notes do not support.\n\nNOTES:\n${context.map((s, i) => (i === target ? `>>> ${s} <<<` : s)).join(' ')}\n\nSTUDENT SAID: "${p.focus || 'explain this again'}"`;
}
/** notes are markdown: strip symbols a speech engine would read out loud */
export const cleanForSpeech = (s: string) => s.replace(/```[\s\S]*?```/g, ' ').replace(/\$\$?([^$]+)\$\$?/g, ' $1 ').replace(/^\s*[-*•]\s+/gm, '').replace(/^#+\s*/gm, '').replace(/[*_`>|~]/g, '').replace(/\\([a-zA-Z]+)/g, '$1').replace(/\s+/g, ' ').trim();
export const toSpoken = (s: string) => s.replace(/```[\s\S]*?```/g, ' ').replace(/[*_#>`]/g, '').replace(/\s+/g, ' ').trim();

export interface NarratorHooks { speak: (text: string, i: number) => void; stopSpeaking: () => void; setRate?: (r: number) => void; onChange?: () => void }
export class Narrator {
  sentences: string[]; i = -1; state: 'idle' | 'speaking' | 'paused' | 'thinking' = 'idle'; rate = 1; log: string[] = []; rewrites = 0; private hooks: NarratorHooks; private gen: Gen; private lang: string;
  constructor(sentences: string[], hooks: NarratorHooks, gen: Gen, lang = 'English') { this.sentences = [...sentences]; this.hooks = hooks; this.gen = gen; this.lang = lang; }
  private ch() { this.hooks.onChange?.(); }
  start(from = 0) { this.i = Math.max(0, Math.min(from, this.sentences.length - 1)); this.state = this.sentences.length ? 'speaking' : 'idle'; if (this.state === 'speaking') this.hooks.speak(this.sentences[this.i], this.i); this.ch(); }
  /** called by the speech engine when the current sentence ended */
  ended() { if (this.state !== 'speaking') return; if (this.i + 1 < this.sentences.length) { this.i++; this.hooks.speak(this.sentences[this.i], this.i); } else { this.state = 'idle'; } this.ch(); }
  pause() { if (this.state === 'speaking') { this.hooks.stopSpeaking(); this.state = 'paused'; this.ch(); } }
  resume() { if (this.state === 'paused') { this.state = 'speaking'; this.hooks.speak(this.sentences[this.i], this.i); this.ch(); } }
  stop() { this.hooks.stopSpeaking(); this.state = 'idle'; this.ch(); }
  /** The student's interruption, already transcribed. Returns what the app should show. */
  async interrupt(said: string): Promise<{ ok: boolean; message: string }> {
    if (this.state === 'thinking') return { ok: false, message: 'Still working on your last question. One moment.' };
    const p = parseInterrupt(said); if (this.state === 'speaking') this.hooks.stopSpeaking(); const was = this.state; if (was === 'speaking') this.state = 'paused';
    const cont = () => { this.state = 'speaking'; this.hooks.speak(this.sentences[this.i], this.i); this.ch(); };
    switch (p.intent) {
      case 'stop': this.stop(); return { ok: true, message: 'Stopped.' };
      case 'pause': this.ch(); return { ok: true, message: 'Paused. Say “continue” when ready.' };
      case 'resume': cont(); return { ok: true, message: 'Continuing.' };
      case 'next': if (this.i + 1 < this.sentences.length) this.i++; cont(); return { ok: true, message: 'Next.' };
      case 'back': this.i = Math.max(0, this.i - 1); cont(); return { ok: true, message: 'Going back one sentence.' };
      case 'slower': this.rate = Math.max(0.5, +(this.rate - 0.2).toFixed(2)); this.hooks.setRate?.(this.rate); cont(); return { ok: true, message: `Speaking slower (${this.rate}×).` };
      case 'faster': this.rate = Math.min(2, +(this.rate + 0.2).toFixed(2)); this.hooks.setRate?.(this.rate); cont(); return { ok: true, message: `Speaking faster (${this.rate}×).` };
      case 'none': if (was === 'speaking') cont(); return { ok: false, message: 'I did not catch a request. Try “explain that again with an easier example”.' };
      default: break;
    }
    const t = findTarget(this.sentences, p.focus, Math.max(0, this.i)); this.state = 'thinking'; this.ch();
    try {
      const out = toSpoken(await this.gen(rewritePrompt(this.sentences, t.index, p, this.lang))); if (!out) throw new Error('empty');
      const fresh = out.match(/[^.!?।]+[.!?।]?/g)?.map(s => s.trim()).filter(Boolean) ?? [out];
      this.sentences.splice(t.index, 1, ...fresh); this.i = t.index; this.rewrites++; this.log.push(`${p.intent}: ${p.focus || 'current sentence'}`); cont();
      return { ok: true, message: t.confident || !p.focus ? 'Updated that part of the notes.' : `I was not sure which part you meant, so I explained the sentence being read. (“${p.focus}”)` };
    } catch { this.state = 'paused'; this.ch(); return { ok: false, message: 'The AI could not answer right now, so the notes are unchanged. Say “continue” or try again.' }; }
  }
}
