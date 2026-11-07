/* Whole-app translation. The static dictionary (lib/i18n.ts) covers the menus; everything else on screen is translated by YOUR configured AI model in small batches and cached on this device,
   so each string costs one request ever. Only short interface text is touched: user notes, inputs, code, maths, chat answers and anything marked data-notranslate are never changed.
   Without an AI key/offline, untranslated text simply stays English. Machine translation, not reviewed by native speakers. */
import { t, getUiLang, UI_LANGS, type UiLang } from './i18n';

const NAMES: Record<string, string> = { hi: 'Hindi', mr: 'Marathi', bn: 'Bengali', ta: 'Tamil', te: 'Telugu' };
const SKIP = 'script,style,textarea,input,select,pre,code,svg,math,[contenteditable],[data-notranslate],[data-seg],.katex,.prose,[data-testid=friday-reply],[data-testid=friday-msg],[data-testid=cv-stdout],[data-testid=cv-code]';
const ATTRS = ['placeholder', 'title'] as const;
export type TStatus = 'idle' | 'working' | 'needs-ai' | 'error' | 'done';
let status: TStatus = 'idle'; const listeners = new Set<(s: TStatus) => void>();
const setStatus = (s: TStatus) => { status = s; listeners.forEach(f => f(s)); };
export const onTranslateStatus = (f: (s: TStatus) => void) => { listeners.add(f); f(status); return () => { listeners.delete(f); }; };

const origText = new WeakMap<Text, string>(), shownText = new WeakMap<Text, string>();
const origAttr = new WeakMap<Element, Record<string, string>>(), shownAttr = new WeakMap<Element, Record<string, string>>();
let cache: Record<string, string> = {}, cacheLang = '', obs: MutationObserver | null = null, timer = 0, busy = false; const pending = new Set<string>(); const failed = new Set<string>();

export const eligible = (s: string) => { const x = s.trim(); return x.length >= 2 && x.length <= 80 && /[A-Za-z]{2}/.test(x) && !/^(https?:|www\.|\S+@\S+\.\S+$)/.test(x) && !/^[\d\s.,:%/+\-–—×=()₹$]+$/.test(x); };
const load = (l: string) => { if (cacheLang === l) return; cacheLang = l; try { cache = JSON.parse(localStorage.getItem('nm_i18n_' + l) || '{}'); } catch { cache = {}; } };
const persist = () => { try { const keys = Object.keys(cache); if (keys.length > 4000) for (const k of keys.slice(0, keys.length - 4000)) delete cache[k]; localStorage.setItem('nm_i18n_' + cacheLang, JSON.stringify(cache)); } catch { /* storage full or blocked */ } };
const lookup = (key: string): string | undefined => { const d = t(key, getUiLang()); if (d !== key) return d; return cache[key]; };
const keep = (src: string, out: string) => { const lead = src.match(/^\s*/)![0], trail = src.match(/\s*$/)![0]; return lead + out + trail; };

function textOk(n: Text): boolean { const p = n.parentElement; return !!p && !p.closest(SKIP); }
function doText(n: Text, restore: boolean) {
  const cur = n.nodeValue ?? '';
  if (shownText.get(n) !== cur) { if (shownText.has(n)) shownText.delete(n); origText.set(n, cur); } // React or the user changed it: that is the new original
  const orig = origText.get(n) ?? cur;
  if (restore || getUiLang() === 'en') { if (shownText.has(n)) { n.nodeValue = orig; shownText.delete(n); } return; }
  if (!textOk(n) || !eligible(orig)) return;
  const key = orig.trim().replace(/\s+/g, ' '); const hit = lookup(key);
  if (hit) { const out = keep(orig, hit); if (n.nodeValue !== out) { n.nodeValue = out; } shownText.set(n, out); }
  else if (!failed.has(key)) pending.add(key);
}
function doAttrs(el: Element, restore: boolean) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a); if (v == null) continue; const shown = shownAttr.get(el)?.[a];
    if (shown !== v) { const o = origAttr.get(el) ?? {}; o[a] = v; origAttr.set(el, o); if (shown !== undefined) delete shownAttr.get(el)![a]; }
    const orig = origAttr.get(el)?.[a] ?? v;
    if (restore || getUiLang() === 'en') { if (shown !== undefined) { el.setAttribute(a, orig); delete shownAttr.get(el)![a]; } continue; }
    if (el.closest('[data-notranslate]') || !eligible(orig)) continue; const key = orig.trim(); const hit = lookup(key);
    if (hit) { if (v !== hit) el.setAttribute(a, hit); const s = shownAttr.get(el) ?? {}; s[a] = hit; shownAttr.set(el, s); } else if (!failed.has(key)) pending.add(key);
  }
}
function walk(root: Node, restore = false) {
  if (root.nodeType === 3) { doText(root as Text, restore); return; } if (root.nodeType !== 1) return; const el = root as Element; if (el.closest(SKIP) && el.tagName !== 'BODY') { /* skipped subtree, still restore attrs below not needed */ }
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT); let n: Node | null = tw.currentNode;
  while (n) { if (n.nodeType === 3) doText(n as Text, restore); else doAttrs(n as Element, restore); n = tw.nextNode(); }
}
const schedule = () => { if (timer) return; timer = window.setTimeout(() => { timer = 0; void flush(); }, 700); };

export function parseBatch(raw: string, n: number): string[] | null {
  const m = raw.match(/\[[\s\S]*\]/); if (!m) return null; try { const a = JSON.parse(m[0]); if (Array.isArray(a) && a.length === n && a.every(x => typeof x === 'string' && x.trim())) return a.map(String); } catch { /* fall through */ } return null;
}
const guard = (src: string, out: string) => out.length <= src.length * 5 + 20 && [...src.matchAll(/\{[^}]*\}|\d+/g)].every(m => out.includes(m[0])); // numbers and {placeholders} must survive

async function flush() {
  const lang = getUiLang(); if (lang === 'en' || busy || !pending.size) return;
  busy = true; setStatus('working');
  try {
    while (pending.size && getUiLang() === lang) {
      const batch = [...pending].slice(0, 40); batch.forEach(k => pending.delete(k));
      const prompt = `Translate these short user-interface strings from English to ${NAMES[lang]}. Natural, concise, the way a student-facing app would say it. Keep brand names (Notes Maker AI, FRIDAY), numbers, emoji, LaTeX and {placeholders} unchanged. Return ONLY a JSON array of exactly ${batch.length} strings in the same order.\n${JSON.stringify(batch)}`;
      let out: string[] | null = null; let g = null; try { const { route } = await import('./friday/route'); g = await route(prompt, { stream: false }); } catch { g = null; }
      if (!g) { pending.clear(); batch.forEach(k => failed.add(k)); setStatus('needs-ai'); break; }
      out = parseBatch(g.text, batch.length);
      if (!out) { batch.forEach(k => failed.add(k)); setStatus('error'); continue; }
      load(lang); batch.forEach((k, i) => { if (guard(k, out![i])) cache[k] = out![i]; else failed.add(k); }); persist(); if (getUiLang() === lang) walk(document.body);
    }
    if (status === 'working') setStatus('done');
  } finally { busy = false; }
}
export function applyLanguage() {
  const lang = getUiLang(); load(lang); failed.clear(); pending.clear();
  if (lang === 'en') { obs?.disconnect(); obs = null; walk(document.body, true); setStatus('idle'); return; }
  setStatus('idle'); walk(document.body);
  if (!obs) { obs = new MutationObserver(muts => { let any = false; for (const m of muts) { if (m.type === 'characterData') { doText(m.target as Text, false); any = true; } else if (m.type === 'attributes') { doAttrs(m.target as Element, false); any = true; } else m.addedNodes.forEach(nd => { walk(nd); any = true; }); } if (any && pending.size) schedule(); }); obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] }); }
  if (pending.size) schedule();
}
export const translatableLangs = UI_LANGS.filter(l => l[0] !== 'en').map(l => l[0] as UiLang);
