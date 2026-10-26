/**
 * Click-to-speak helpers: find which WORD of a rendered sentence the user clicked / selected,
 * and cut the sentence's source text so reading starts at exactly that word.
 * A "token" is a whitespace-separated word; a $math$ expression (or a rendered KaTeX block) counts as one token.
 */
export function sourceTokens(text: string): string[] {
  return text.match(/\$\$[^$]+\$\$|\$[^$]+\$|\S+/g) ?? [];
}

/** Index of the token (in rendered DOM order) that contains position (node, offset) inside `root`. */
export function domTokenIndex(root: HTMLElement, node: Node, offset: number): number {
  let idx = -1, glued = false, found = -1, done = false;
  const visit = (n: Node) => {
    if (done) return;
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as HTMLElement;
      if (el.classList.contains('katex')) { // one token for the whole formula (the hidden MathML copy is skipped)
        if (!glued) idx++; glued = true;
        if (el === node || el.contains(node)) { found = idx; done = true; }
        return;
      }
      for (const ch of Array.from(el.childNodes)) { visit(ch); if (done) return; }
      return;
    }
    if (n.nodeType !== Node.TEXT_NODE) return;
    const t = n.textContent ?? '';
    let i = 0;
    while (i < t.length) {
      if (/\s/.test(t[i])) { glued = false; i++; continue; }
      let j = i; while (j < t.length && !/\s/.test(t[j])) j++;
      if (!glued) idx++; glued = true;
      if (n === node && offset >= i && offset <= j) { found = idx; done = true; return; }
      i = j;
    }
    if (n === node && offset >= t.length) { found = Math.max(0, idx); done = true; }
  };
  visit(root);
  return found < 0 ? 0 : found;
}

/** The text of `text` starting at token k (clamped). */
export function sliceFromToken(text: string, k: number): string {
  const toks = sourceTokens(text);
  if (!toks.length) return text;
  return toks.slice(Math.min(Math.max(0, k), toks.length - 1)).join(' ');
}

/** Caret position under a screen point (Chrome: caretRangeFromPoint, Firefox/Safari: caretPositionFromPoint). */
export function caretAtPoint(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null; caretRangeFromPoint?: (x: number, y: number) => Range | null };
  try {
    if (d.caretPositionFromPoint) { const p = d.caretPositionFromPoint(x, y); if (p) return { node: p.offsetNode, offset: p.offset }; }
    if (d.caretRangeFromPoint) { const r = d.caretRangeFromPoint(x, y); if (r) return { node: r.startContainer, offset: r.startOffset }; }
  } catch { /* ignore */ }
  return null;
}

/** Start of the word that contains `pos` in a plain string (for the typing box). */
export function wordStart(value: string, pos: number): number {
  let p = Math.min(Math.max(0, pos), value.length);
  while (p > 0 && !/\s/.test(value[p - 1])) p--;
  return p;
}
