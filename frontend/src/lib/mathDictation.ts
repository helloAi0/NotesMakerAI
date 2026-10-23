/* ------------------------------------------------------------------ */
/*  Spoken mathematics -> validated LaTeX                              */
/*                                                                     */
/*  A small, explicit grammar (no AI, no eval). The result is always   */
/*  LaTeX text that is rendered by KaTeX; nothing is ever executed.    */
/*  When the phrase can reasonably mean two different things (for      */
/*  example "one over x plus one") every plausible reading is returned */
/*  and `needsChoice` is true, so the UI can ask the student instead   */
/*  of silently picking one.                                           */
/* ------------------------------------------------------------------ */

import katex from 'katex';

export interface MathCandidate {
  latex: string;
  /** Short human description of this reading. */
  label: string;
}

export interface MathDictationResult {
  ok: boolean;
  /** The best reading first. Always at least one candidate when ok. */
  candidates: MathCandidate[];
  /** True when two or more forcing interpretations exist and the student must choose. */
  needsChoice: boolean;
  /** The cleaned phrase that was parsed (shown so students can see what was heard). */
  heard: string;
  warnings: string[];
}

/* ------------------------------ AST -------------------------------- */

type N =
  | { k: 'num'; v: string }
  | { k: 'sym'; v: string }
  | { k: 'sum'; terms: { op: string; n: N }[] }
  | { k: 'prod'; fs: { op: string; n: N }[] }
  | { k: 'frac'; a: N; b: N; spoken?: boolean }
  | { k: 'pow'; b: N; e: N; spoken?: boolean; whole?: boolean }
  | { k: 'sub'; b: N; s: N; amb?: boolean }
  | { k: 'sqrt'; n: N; idx?: string }
  | { k: 'fn'; name: string; arg?: N; pow?: N; spoken?: boolean; base?: N; paren?: boolean }
  | { k: 'group'; n: N }
  | { k: 'tex'; v: string }
  | { k: 'rel'; parts: N[]; ops: string[] }
  | { k: 'neg'; n: N }
  | { k: 'abs'; n: N; norm?: boolean }
  | { k: 'accent'; cmd: string; n: N }
  | { k: 'post'; n: N; s: string }
  | { k: 'big'; head: string; lo?: N; hi?: N; body: N; diff?: string }
  | { k: 'lim'; v: N; to: N; body: N; dir?: string }
  | { k: 'matrix'; rows: N[][]; det?: boolean };

/* ----------------------------- lexicon ----------------------------- */

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ORD: Record<string, number> = { second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const GREEK = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega'];
const GREEK_UPPER: Record<string, string> = { gamma: '\\Gamma', delta: '\\Delta', theta: '\\Theta', lambda: '\\Lambda', xi: '\\Xi', pi: '\\Pi', sigma: '\\Sigma', phi: '\\Phi', psi: '\\Psi', omega: '\\Omega' };
const FUNCS: Record<string, string> = {
  sin: '\\sin', cos: '\\cos', tan: '\\tan', sec: '\\sec', csc: '\\csc', cot: '\\cot', sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh',
  arcsin: '\\arcsin', arccos: '\\arccos', arctan: '\\arctan', ln: '\\ln', log: '\\log', exp: '\\exp',
};
const RELS: Record<string, string> = { eq: '=', neq: '\\neq', lt: '<', gt: '>', leq: '\\leq', geq: '\\geq', approx: '\\approx', propto: '\\propto', implies: '\\Rightarrow', iff: '\\Leftrightarrow', elem: '\\in' };
/** Letters that are usually function names when followed by "of" (f of x). */
const FN_LETTERS = new Set(['f', 'g', 'h', 'k', 'p', 'q', 'u', 'v', 'w', 'F', 'G', 'H']);

const PHRASES: [RegExp, string][] = [
  [/\bis not equal to\b|\bnot equal to\b|\bdoes not equal\b/gi, ' neq '],
  [/\bless than or equal to\b/gi, ' leq '],
  [/\bgreater than or equal to\b|\bmore than or equal to\b/gi, ' geq '],
  [/\bless than\b/gi, ' lt '],
  [/\bgreater than\b|\bmore than\b/gi, ' gt '],
  [/\bis approximately equal to\b|\bapproximately equal to\b|\bis approximately\b|\bapproximately\b/gi, ' approx '],
  [/\bis proportional to\b|\bproportional to\b/gi, ' propto '],
  [/\bis equal to\b|\bequals sign\b|\bequal sign\b|\bequal to\b|\bequals\b|\bequal\b|\bis\b/gi, ' eq '],
  [/\bplus or minus\b/gi, ' pm '],
  [/\bplus\b|\badd\b/gi, ' plus '],
  [/\bminus\b|\bnegative\b|\bsubtract\b|\bless\b/gi, ' minus '],
  [/\bmultiplied by\b|\btimes\b|\bmultiply by\b/gi, ' times '],
  [/\bdivided by\b/gi, ' div '],
  [/\bdot product\b/gi, ' dot '],
  [/\bcross product\b/gi, ' cross '],
  [/\braised to the power of\b|\bto the power of\b|\braised to the power\b|\braised to the\b|\braised to\b|\bto the power\b|\bto the\b/gi, ' pow '],
  [/\bsquare root of\b|\bthe square root\b|\bsquare root\b|\broot of\b/gi, ' sqrt '],
  [/\bcube root of\b|\bcube root\b/gi, ' cbrt '],
  [/\bend square root\b|\bend root\b|\bend of root\b/gi, ' endroot '],
  [/\bwith respect to\b|\bw\.? ?r\.? ?t\.?\b/gi, ' wrt '],
  [/\bopen parenthesis\b|\bleft parenthesis\b|\bopen bracket\b|\bleft bracket\b|\bopen paren\b|\bthe quantity\b|\bquantity\b|\bopen brace\b|\bstart bracket\b/gi, ' lp '],
  [/\bclose parenthesis\b|\bright parenthesis\b|\bclose bracket\b|\bright bracket\b|\bclose paren\b|\bend quantity\b|\bend bracket\b|\bclose brace\b|\bunquote\b/gi, ' rp '],
  [/\ball over\b/gi, ' allover '],
  [/\bend fraction\b/gi, ' endfraction '],
  [/\bend absolute value\b|\bend modulus\b/gi, ' endabs '],
  [/\bend matrix\b/gi, ' endmatrix '],
  [/\bgoes to\b|\btends to\b|\bapproaches\b|\bapproach\b/gi, ' approach '],
  [/\bsecond partial derivative\b|\bsecond partial\b/gi, ' pderiv2 '],
  [/\bpartial derivative\b|\bpartial\b/gi, ' pderiv '],
  [/\bsecond derivative\b/gi, ' deriv2 '],
  [/\bderivative\b/gi, ' deriv '],
  [/\bintegral\b|\bintegrate\b/gi, ' integral '],
  [/\bsummation\b|\bsum\b/gi, ' sum '],
  [/\bproduct from\b|\bproduct over\b/gi, ' prod from '],
  [/\babsolute value of\b|\babsolute value\b|\bmodulus of\b|\bmodulus\b|\bmagnitude of\b|\bmagnitude\b/gi, ' abs '],
  [/\bnorm of\b|\bnorm\b/gi, ' norm '],
  [/\bfactorial\b/gi, ' fact '],
  [/\bgradient of\b|\bgrad of\b|\bgrad\b/gi, ' grad '],
  [/\bdivergence of\b|\bdivergence\b/gi, ' divop '],
  [/\bcurl of\b|\bcurl\b/gi, ' curlop '],
  [/\blaplacian of\b|\blaplacian\b/gi, ' lapop '],
  [/\bdel\b|\bnabla\b/gi, ' nabla '],
  [/\binverse sine\b|\barc sine\b|\barcsine\b/gi, ' arcsin '],
  [/\binverse cosine\b|\barc cosine\b|\barccosine\b/gi, ' arccos '],
  [/\binverse tangent\b|\barc tangent\b|\barctangent\b/gi, ' arctan '],
  [/\bhyperbolic sine\b|\bsinh\b/gi, ' sinh '],
  [/\bhyperbolic cosine\b|\bcosh\b/gi, ' cosh '],
  [/\bhyperbolic tangent\b|\btanh\b/gi, ' tanh '],
  [/\bnatural logarithm\b|\bnatural log\b|\bln\b/gi, ' ln '],
  [/\blogarithm\b|\blog\b/gi, ' log '],
  [/\bsine\b|\bsin\b/gi, ' sin '],
  [/\bcosine\b|\bcos\b/gi, ' cos '],
  [/\btangent\b|\btan\b/gi, ' tan '],
  [/\bsecant\b/gi, ' sec '],
  [/\bcosecant\b/gi, ' csc '],
  [/\bcotangent\b/gi, ' cot '],
  [/\bexponential of\b|\bexponential\b/gi, ' exp '],
  [/\bgoes\b/gi, ' '],
  [/\bdegrees\b|\bdegree\b/gi, ' degree '],
  [/\bpercent\b/gi, ' percent '],
  [/\bsubscript\b|\bsub\b/gi, ' sub '],
  [/\bunit vector\b/gi, ' unitvec '],
  [/\bnew row\b|\bnext row\b|\bsemicolon\b/gi, ' row '],
  [/\bnext column\b|\bnext\b/gi, ' next '],
  [/\bdouble prime\b/gi, ' dprime '],
];

const SYMBOLS: [RegExp, string][] = [
  [/²/g, ' squared '], [/³/g, ' cubed '], [/√/g, ' sqrt '], [/π/g, ' pi '], [/×/g, ' times '], [/÷/g, ' div '],
  [/∫/g, ' integral '], [/∑/g, ' sum '], [/≤/g, ' leq '], [/≥/g, ' geq '], [/≠/g, ' neq '], [/≈/g, ' approx '], [/∞/g, ' infinity '],
  [/θ/g, ' theta '], [/α/g, ' alpha '], [/β/g, ' beta '], [/λ/g, ' lambda '], [/μ/g, ' mu '], [/ω/g, ' omega '], [/Δ/g, ' capital delta '],
  [/\^/g, ' pow '], [/\+/g, ' plus '], [/[−–—]/g, ' minus '], [/(?<=\w|\))\s*-\s*(?=\w|\()/g, ' minus '], [/^\s*-/g, ' minus '], [/=/g, ' eq '],
  [/\//g, ' over '], [/\*/g, ' times '], [/\(/g, ' lp '], [/\)/g, ' rp '], [/</g, ' lt '], [/>/g, ' gt '],
];

/* ---------------------------- tokenizer ---------------------------- */

function mergeNumbers(tokens: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  const isUnit = (t: string) => t in UNITS;
  while (i < tokens.length) {
    const t = tokens[i].toLowerCase();
    if (!(t in UNITS) && !(t in TENS)) { out.push(tokens[i]); i++; continue; }
    // "hundred"/"thousand" can start a phrase only after a unit, so a bare unit/tens begins here
    let total = 0, cur = 0, j = i, lastKind: 'u' | 't' | 'h' | 'k' | '' = '';
    while (j < tokens.length) {
      const w = tokens[j].toLowerCase();
      if (isUnit(w)) {
        if (lastKind === 'u' || (lastKind === 't' && UNITS[w] >= 10) || (lastKind === '' && false)) break;
        if (lastKind === 't' && UNITS[w] === 0) break;
        cur += UNITS[w]; lastKind = 'u';
      } else if (w in TENS) {
        if (lastKind === 'u' || lastKind === 't') break;
        cur += TENS[w]; lastKind = 't';
      } else if (w === 'hundred' && (lastKind === 'u' || lastKind === 't') && cur < 100) {
        cur *= 100; lastKind = 'h';
      } else if (w === 'thousand' && (lastKind === 'u' || lastKind === 't' || lastKind === 'h')) {
        total += cur * 1000; cur = 0; lastKind = 'k';
      } else if (w === 'and' && (lastKind === 'h' || lastKind === 'k') && j + 1 < tokens.length && (tokens[j + 1].toLowerCase() in UNITS || tokens[j + 1].toLowerCase() in TENS)) {
        j++; continue;
      } else break;
      j++;
    }
    let numStr = String(total + cur);
    // decimals: "three point one four"
    if (j < tokens.length && tokens[j].toLowerCase() === 'point' && j + 1 < tokens.length && (tokens[j + 1].toLowerCase() in UNITS) && UNITS[tokens[j + 1].toLowerCase()] < 10) {
      let k = j + 1, frac = '';
      while (k < tokens.length && tokens[k].toLowerCase() in UNITS && UNITS[tokens[k].toLowerCase()] < 10) { frac += UNITS[tokens[k].toLowerCase()]; k++; }
      numStr += '.' + frac; j = k;
    }
    out.push(numStr);
    i = j;
  }
  return out;
}

function tokenize(spoken: string): string[] {
  let s = ' ' + spoken.replace(/\s+/g, ' ') + ' ';
  s = s.replace(/(\d)\.(\d)/g, '$1DECPT$2');
  for (const [re, rep] of SYMBOLS) s = s.replace(re, rep);
  s = s.replace(/[,;:?!"“”]/g, ' ').replace(/\.(?=\s)/g, ' ').replace(/DECPT/g, '.');
  for (const [re, rep] of PHRASES) s = s.replace(re, rep);
  s = s.replace(/\b(the|then|of the|a value of|let|suppose|where|is given by)\b/gi, m => (/^of the$/i.test(m) ? ' of ' : ' '));
  let toks = s.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const t of toks) {
    const m = t.match(/^(\d+(?:\.\d+)?)([A-Za-z]+)$/);
    if (m) { out.push(m[1], m[2]); continue; }
    if (/^d[xyztruvw]$/.test(t)) { out.push('d', t[1]); continue; }
    out.push(t);
  }
  toks = mergeNumbers(out);
  // "capital delta" -> single token keeps meaning
  return toks;
}

/* ------------------------------ parser ------------------------------ */

const isNum = (t?: string) => !!t && /^\d+(\.\d+)?$/.test(t);
const isLetter = (t?: string) => !!t && /^[A-Za-z]$/.test(t);
const isGreek = (t?: string) => !!t && GREEK.includes(t.toLowerCase());
const isFnName = (t?: string) => !!t && t.toLowerCase() in FUNCS;
const ATOM_WORDS = new Set([
  'sqrt', 'cbrt', 'lp', 'abs', 'norm', 'vector', 'unitvec', 'integral', 'sum', 'prod', 'limit', 'deriv', 'deriv2', 'pderiv', 'pderiv2', 'grad',
  'divop', 'curlop', 'lapop', 'nabla', 'fraction', 'matrix', 'determinant', 'infinity', 'capital', 'minus',
]);

class Parser {
  i = 0;
  noAll = 0;
  warnings: string[] = [];
  t: string[];
  opts: { sqrtTight: boolean };
  constructor(t: string[], opts: { sqrtTight: boolean }) { this.t = t; this.opts = opts; }

  peek(o = 0): string | undefined { return this.t[this.i + o]; }
  pk(o = 0): string | undefined { return this.t[this.i + o]?.toLowerCase(); }
  next(): string { return this.t[this.i++]; }
  eof() { return this.i >= this.t.length; }

  startsAtom(): boolean {
    const t = this.peek(); const lo = this.pk();
    if (t === undefined) return false;
    if (isNum(t) || isLetter(t) || isGreek(t) || isFnName(t)) return true;
    if (lo && ATOM_WORDS.has(lo)) return lo !== 'minus';
    return false;
  }

  sub(tokens: string[]): Parser {
    const p = new Parser(tokens, this.opts);
    p.warnings = this.warnings;
    return p;
  }

  parseTop(): N {
    const n = this.parseRel();
    while (!this.eof()) {
      const t = this.next();
      if (t.toLowerCase() === 'rp') { this.warnings.push('Unmatched closing parenthesis was ignored.'); continue; }
      this.warnings.push(`Did not understand "${t}" and skipped it.`);
      if (this.startsAtom()) {
        const more = this.parseRel();
        return { k: 'rel', parts: [n, more], ops: [''] } as N;
      }
    }
    return n;
  }

  parseRel(): N {
    const parts: N[] = [this.parseSum()];
    const ops: string[] = [];
    while (!this.eof() && this.pk() && this.pk()! in RELS) {
      ops.push(RELS[this.next().toLowerCase()]);
      parts.push(this.parseSum());
    }
    return ops.length ? { k: 'rel', parts, ops } : parts[0];
  }

  parseSum(): N {
    const terms: { op: string; n: N }[] = [];
    let op = '';
    if (this.pk() === 'minus') { this.next(); op = '-'; } else if (this.pk() === 'plus') this.next(); else if (this.pk() === 'pm') { this.next(); op = '\\pm'; }
    terms.push({ op, n: this.parseProd() });
    while (this.pk() === 'plus' || this.pk() === 'minus' || this.pk() === 'pm') {
      const w = this.next().toLowerCase();
      terms.push({ op: w === 'plus' ? '+' : w === 'minus' ? '-' : '\\pm', n: this.parseProd() });
    }
    let res: N = terms.length === 1 && terms[0].op === '' ? terms[0].n : { k: 'sum', terms };
    // "a plus b whole squared"
    if (res.k === 'sum') {
      const last = res.terms[res.terms.length - 1].n;
      if (last.k === 'pow' && last.whole && res.terms.length >= 2) {
        const first = res.terms.slice(0, -1);
        res = { k: 'pow', b: { k: 'group', n: { k: 'sum', terms: [...first, { op: res.terms[res.terms.length - 1].op, n: last.b }] } }, e: last.e };
      }
    } else if (res.k === 'pow' && res.whole) {
      res = { k: 'pow', b: res.b, e: res.e };
    }
    if (this.pk() === 'allover' && !this.noAll) {
      this.next();
      const den = this.parseSum();
      res = { k: 'frac', a: res, b: den };
    }
    return res;
  }

  parseProd(): N {
    const fs: { op: string; n: N }[] = [{ op: '', n: this.parseFactor() }];
    const asNode = (): N => (fs.length === 1 ? fs[0].n : { k: 'prod', fs: fs.map(f => ({ ...f })) });
    for (;;) {
      const lo = this.pk();
      if (lo === 'times' || lo === 'div' || lo === 'dot' || lo === 'cross') {
        this.next();
        fs.push({ op: lo === 'times' ? '\\times' : lo === 'div' ? '\\div' : lo === 'dot' ? '\\cdot' : '\\times', n: this.parseFactor() });
      } else if (lo === 'over') {
        this.next();
        const den = this.parseImplicitRun();
        const fr: N = { k: 'frac', a: asNode(), b: den, spoken: true };
        fs.length = 0; fs.push({ op: '', n: fr });
      } else if (lo === 'choose') {
        this.next();
        const kk = this.parseFactor();
        const nn = asNode();
        const bn: N = { k: 'tex', v: `\\binom{${render(strip(nn))}}{${render(strip(kk))}}` };
        fs.length = 0; fs.push({ op: '', n: bn });
      } else if (this.startsAtom() && !(lo === 'integral' && false)) {
        fs.push({ op: '', n: this.parseFactor() });
      } else break;
    }
    return mergeIndexed(asNode());
  }

  parseImplicitRun(): N {
    const fs: N[] = [this.parseFactor()];
    while (this.startsAtom() && !isFnName(this.peek()) && !['integral', 'sum', 'prod', 'limit'].includes(this.pk()!)) fs.push(this.parseFactor());
    return fs.length === 1 ? fs[0] : { k: 'prod', fs: fs.map(n => ({ op: '', n })) };
  }

  parseFactor(): N {
    let n = this.parseAtom();
    for (;;) {
      const lo = this.pk();
      if (lo === 'squared') { this.next(); n = { k: 'pow', b: n, e: { k: 'num', v: '2' }, spoken: true }; }
      else if (lo === 'cubed') { this.next(); n = { k: 'pow', b: n, e: { k: 'num', v: '3' }, spoken: true }; }
      else if (lo === 'whole' && (this.pk(1) === 'squared' || this.pk(1) === 'cubed' || this.pk(1) === 'pow')) {
        this.next();
        const w = this.next().toLowerCase();
        const e: N = w === 'squared' ? { k: 'num', v: '2' } : w === 'cubed' ? { k: 'num', v: '3' } : this.parseExponent();
        n = { k: 'pow', b: n, e, whole: true, spoken: true };
      }
      else if (lo === 'pow') { this.next(); n = { k: 'pow', b: n, e: this.parseExponent(), spoken: true }; }
      else if (lo === 'sub') { this.next(); n = { k: 'sub', b: n, s: this.parseSubscript() }; }
      else if (lo === 'prime') { this.next(); n = { k: 'post', n, s: "'" }; }
      else if (lo === 'dprime') { this.next(); n = { k: 'post', n, s: "''" }; }
      else if (lo === 'fact') { this.next(); n = { k: 'post', n, s: '!' }; }
      else if (lo === 'degree') { this.next(); n = { k: 'post', n, s: '^\\circ' }; }
      else if (lo === 'percent') { this.next(); n = { k: 'post', n, s: '\\%' }; }
      else if (lo === 'hat') { this.next(); n = { k: 'accent', cmd: '\\hat', n }; }
      else if (lo === 'bar') { this.next(); n = { k: 'accent', cmd: '\\bar', n }; }
      else if (lo === 'tilde') { this.next(); n = { k: 'accent', cmd: '\\tilde', n }; }
      else if (lo === 'inverse') { this.next(); n = { k: 'pow', b: n, e: { k: 'sum', terms: [{ op: '-', n: { k: 'num', v: '1' } }] } }; }
      else if (lo === 'transpose') { this.next(); n = { k: 'pow', b: n, e: { k: 'sym', v: '\\mathsf{T}' } }; }
      else break;
    }
    return n;
  }

  parseExponent(): N {
    let neg = false;
    if (this.pk() === 'minus') { this.next(); neg = true; }
    let base: N;
    const lo = this.pk();
    if (lo && lo in ORD) { this.next(); base = { k: 'num', v: String(ORD[lo]) }; }
    else if (lo === 'lp') base = this.parseAtom();
    else base = this.parseAtom();
    // exponent may itself be squared/cubed: e to the x squared
    while (this.pk() === 'squared' || this.pk() === 'cubed') {
      const w = this.next().toLowerCase();
      base = { k: 'pow', b: base, e: { k: 'num', v: w === 'squared' ? '2' : '3' } };
    }
    return neg ? { k: 'sum', terms: [{ op: '-', n: base }] } : base;
  }

  parseSubscript(): N {
    const lo = this.pk();
    if (lo === 'lp') return this.parseAtom();
    if (isNum(this.peek()) || isLetter(this.peek()) || isGreek(this.peek())) return this.parseAtom();
    if (lo === 'minus') { this.next(); return { k: 'sum', terms: [{ op: '-', n: this.parseAtom() }] }; }
    this.warnings.push('A subscript was expected after "sub".');
    return { k: 'num', v: '0' };
  }

  /** Collect tokens until a delimiter token (at the same level) and return them. */
  takeUntil(stop: (t: string) => boolean): string[] {
    const out: string[] = []; let depth = 0;
    while (!this.eof()) {
      const t = this.peek()!; const lo = t.toLowerCase();
      if (lo === 'lp') depth++;
      if (lo === 'rp') { if (depth === 0) break; depth--; }
      if (depth === 0 && stop(lo)) break;
      out.push(this.next());
    }
    return out;
  }

  parseAtom(): N {
    const t = this.peek();
    if (t === undefined) { this.warnings.push('The phrase ended before the expression was complete.'); return { k: 'num', v: '0' }; }
    const lo = t.toLowerCase();

    if (isNum(t)) {
      this.next();
      // "2 by 2 matrix"
      if (this.pk() === 'by' && isNum(this.peek(1)) && this.pk(2) === 'matrix') {
        const r = Number(t), c = Number(this.peek(1)); this.i += 2; return this.parseMatrix(r, c);
      }
      return { k: 'num', v: t };
    }
    if (lo === 'minus') { this.next(); return { k: 'neg', n: this.parseFactor() }; }
    if (lo === 'plus') { this.next(); return this.parseFactor(); }
    if (lo === 'capital') {
      this.next(); const nx = this.next();
      if (!nx) return { k: 'sym', v: 'X' };
      if (GREEK.includes(nx.toLowerCase())) return { k: 'sym', v: GREEK_UPPER[nx.toLowerCase()] ?? `\\${nx.toLowerCase()}` };
      return { k: 'sym', v: nx.toUpperCase().slice(0, 1) };
    }
    if (isGreek(t)) { this.next(); return { k: 'sym', v: lo === 'epsilon' ? '\\varepsilon' : lo === 'phi' ? '\\varphi' : `\\${lo}` }; }
    if (lo === 'infinity') { this.next(); return { k: 'sym', v: '\\infty' }; }
    if (lo === 'lp') {
      this.next();
      const inner = this.parseRel();
      if (this.pk() === 'rp') this.next(); else this.warnings.push('A parenthesis was opened but never closed; it was closed automatically.');
      return { k: 'group', n: inner };
    }
    if (lo === 'sqrt' || lo === 'cbrt') {
      this.next();
      let arg: N;
      this.noAll++;
      try { arg = this.opts.sqrtTight ? this.parseProd() : this.parseSum(); } finally { this.noAll--; }
      if (this.pk() === 'endroot') this.next();
      return { k: 'sqrt', n: arg, idx: lo === 'cbrt' ? '3' : undefined };
    }
    if (isFnName(t)) return this.parseFn();
    if (lo === 'abs' || lo === 'norm') {
      this.next();
      if (this.pk() === 'of') this.next();
      const arg = this.parseSum();
      if (this.pk() === 'endabs') this.next();
      return { k: 'abs', n: arg, norm: lo === 'norm' };
    }
    if (lo === 'vector') { this.next(); return { k: 'accent', cmd: '\\vec', n: this.parseAtom() }; }
    if (lo === 'unitvec') { this.next(); return { k: 'accent', cmd: '\\hat', n: this.parseAtom() }; }
    if (lo === 'integral') return this.parseIntegral();
    if (lo === 'sum' || lo === 'prod') return this.parseBigOp();
    if (lo === 'limit') return this.parseLimit();
    if (lo === 'deriv' || lo === 'deriv2' || lo === 'pderiv' || lo === 'pderiv2') return this.parseDerivative();
    if (lo === 'grad') { this.next(); return { k: 'prod', fs: [{ op: '', n: { k: 'sym', v: '\\nabla' } }, { op: '', n: this.parseFactor() }] }; }
    if (lo === 'divop') { this.next(); return { k: 'prod', fs: [{ op: '', n: { k: 'sym', v: '\\nabla' } }, { op: '\\cdot', n: this.parseFactor() }] }; }
    if (lo === 'curlop') { this.next(); return { k: 'prod', fs: [{ op: '', n: { k: 'sym', v: '\\nabla' } }, { op: '\\times', n: this.parseFactor() }] }; }
    if (lo === 'lapop') { this.next(); return { k: 'prod', fs: [{ op: '', n: { k: 'pow', b: { k: 'sym', v: '\\nabla' }, e: { k: 'num', v: '2' } } }, { op: '', n: this.parseFactor() }] }; }
    if (lo === 'nabla') { this.next(); return { k: 'sym', v: '\\nabla' }; }
    if (lo === 'fraction') {
      this.next();
      const num = this.parseSum();
      if (this.pk() === 'over') this.next(); else this.warnings.push('"fraction" needs "over" between top and bottom.');
      const den = this.parseSum();
      if (this.pk() === 'endfraction') this.next();
      return { k: 'frac', a: num, b: den };
    }
    if (lo === 'determinant') { this.next(); if (this.pk() === 'of') this.next(); const m = this.parseAtom(); if (m.k === 'matrix') m.det = true; return m; }
    if (lo === 'matrix') { this.next(); return this.parseMatrix(0, 0); }
    if (lo === 'd' || t === 'd') {
      // "d y by d x" / "d y over d x"
      const a = this.peek(1), by = this.pk(2), d2 = this.peek(3), b = this.peek(4);
      if (a && (by === 'by' || by === 'over') && d2 === 'd' && b) {
        this.i += 5; return { k: 'tex', v: `\\frac{d${tex1(a)}}{d${tex1(b)}}` };
      }
    }
    if (isLetter(t)) {
      this.next();
      const sym: N = { k: 'sym', v: t };
      // f of x
      if (this.pk() === 'of' && FN_LETTERS.has(t) && (this.startsAtomAt(1))) {
        this.next();
        const arg = this.parseFactor();
        return { k: 'fn', name: t, arg, paren: true, spoken: true };
      }
      return sym;
    }
    // unknown word
    this.next();
    this.warnings.push(`Did not understand "${t}" and skipped it.`);
    if (this.startsAtom()) return this.parseAtom();
    return { k: 'num', v: '0' };
  }

  startsAtomAt(o: number): boolean {
    const save = this.i; this.i += o; const r = this.startsAtom(); this.i = save; return r;
  }

  parseFn(): N {
    const name = this.next().toLowerCase();
    const node: Extract<N, { k: 'fn' }> = { k: 'fn', name: FUNCS[name] };
    if (this.pk() === 'squared') { this.next(); node.pow = { k: 'num', v: '2' }; }
    else if (this.pk() === 'cubed') { this.next(); node.pow = { k: 'num', v: '3' }; }
    else if (this.pk() === 'pow' && !isNum(this.peek(1)) === false) { this.next(); node.pow = this.parseExponent(); }
    if (name === 'log' && this.pk() === 'base') { this.next(); node.base = this.parseAtom(); }
    if (this.pk() === 'of') this.next();
    if (this.eof() || !this.startsAtom()) { return node; }
    if (this.pk() === 'lp') { node.arg = this.parseAtom(); node.paren = true; }
    else { node.arg = this.parseFactor(); node.spoken = true; }
    return node;
  }

  parseIntegral(): N {
    this.next();
    let lo: N | undefined, hi: N | undefined;
    if (this.pk() === 'from') {
      this.next();
      const loT = this.takeUntil(x => x === 'to');
      lo = this.sub(loT).parseSum();
      if (this.pk() === 'to') this.next(); else this.warnings.push('The integral limits need "to" between lower and upper.');
      const hasOf = this.t.slice(this.i).some(x => x.toLowerCase() === 'of');
      const hiT = hasOf ? this.takeUntil(x => x === 'of') : null;
      hi = hiT ? this.sub(hiT).parseSum() : this.parseFactor();
    }
    if (this.pk() === 'of') this.next();
    // locate the differential "d x"
    let end = -1;
    for (let k = this.i; k < this.t.length - 1; k++) {
      if (this.t[k] === 'd' && (isLetter(this.t[k + 1]) || isGreek(this.t[k + 1]))) {
        const after = this.t[k + 2]?.toLowerCase();
        if (after === undefined || after in RELS || after === 'rp' || after === 'plus' || after === 'minus' || after === 'endabs') { end = k; break; }
      }
    }
    if (end < 0) {
      this.warnings.push('No differential like "d x" was heard at the end of the integral.');
      const body = this.parseSum();
      return { k: 'big', head: '\\int', lo, hi, body };
    }
    const bodyT = this.t.slice(this.i, end);
    const body = bodyT.length ? this.sub(bodyT).parseSum() : { k: 'num', v: '1' } as N;
    const v = this.t[end + 1];
    this.i = end + 2;
    return { k: 'big', head: '\\int', lo, hi, body, diff: isGreek(v) ? `\\${v.toLowerCase()}` : v };
  }

  parseBigOp(): N {
    const head = this.next().toLowerCase() === 'sum' ? '\\sum' : '\\prod';
    let lo: N | undefined, hi: N | undefined;
    if (this.pk() === 'from') {
      this.next();
      const loT = this.takeUntil(x => x === 'to');
      lo = this.sub(loT).parseRel();
      if (this.pk() === 'to') this.next();
      const hasOf = this.t.slice(this.i).some(x => x.toLowerCase() === 'of');
      const hiT = hasOf ? this.takeUntil(x => x === 'of') : null;
      hi = hiT ? this.sub(hiT).parseSum() : this.parseFactor();
    }
    if (this.pk() === 'of') this.next();
    const body = this.parseSum();
    return { k: 'big', head, lo, hi, body };
  }

  parseLimit(): N {
    this.next();
    if (this.pk() === 'as') this.next();
    const v = this.parseAtom();
    if (this.pk() === 'approach' || this.pk() === 'to' || this.pk() === 'pow') this.next(); else this.warnings.push('A limit needs "approaches" (for example "x approaches zero").');
    const toT = this.takeUntil(x => x === 'of');
    let dir: string | undefined;
    const low = toT.map(x => x.toLowerCase());
    if (low.length >= 2 && low[low.length - 2] === 'from' && (low[low.length - 1] === 'right' || low[low.length - 1] === 'above')) { dir = '^+'; toT.length -= 2; }
    else if (low.length >= 2 && low[low.length - 2] === 'from' && (low[low.length - 1] === 'left' || low[low.length - 1] === 'below')) { dir = '^-'; toT.length -= 2; }
    const to = this.sub(toT).parseSum();
    if (this.pk() === 'of') this.next(); else this.warnings.push('Say "of" before the expression the limit applies to.');
    const body = this.parseSum();
    return { k: 'lim', v, to, body, dir };
  }

  parseDerivative(): N {
    const w = this.next().toLowerCase();
    const partial = w.startsWith('p');
    const order = w.endsWith('2') ? 2 : 1;
    if (this.pk() === 'of') this.next();
    const numT = this.takeUntil(x => x === 'wrt');
    const expr = this.sub(numT).parseSum();
    let vr = 'x';
    if (this.pk() === 'wrt') { this.next(); const a = this.parseAtom(); vr = render(a); } else this.warnings.push('Say "with respect to" followed by the variable; x was assumed.');
    const d = partial ? '\\partial' : 'd';
    const simple = expr.k === 'sym' || expr.k === 'num' || expr.k === 'sub' || expr.k === 'accent' || (expr.k === 'fn' && expr.paren);
    const top = order === 2 ? `${d}^2` : d;
    const bot = order === 2 ? `${d} ${vr}^2` : `${d} ${vr}`;
    return { k: 'tex', v: simple ? `\\frac{${top} ${render(expr)}}{${bot}}` : `\\frac{${top}}{${bot}}\\left(${render(expr)}\\right)` };
  }

  parseMatrix(r: number, c: number): N {
    const toks = this.takeUntil(x => x === 'endmatrix');
    if (this.pk() === 'endmatrix') this.next();
    const low = toks.map(x => x.toLowerCase());
    let rows: N[][] = [];
    if (low.includes('next') || low.includes('row')) {
      let cur: N[] = []; let buf: string[] = [];
      const flushEntry = () => { if (buf.length) { cur.push(this.sub(buf).parseSum()); buf = []; } };
      for (const tk of toks) {
        const l = tk.toLowerCase();
        if (l === 'next') flushEntry();
        else if (l === 'row') { flushEntry(); if (cur.length) rows.push(cur); cur = []; }
        else buf.push(tk);
      }
      flushEntry(); if (cur.length) rows.push(cur);
    } else {
      const sp = this.sub(toks); const ents: N[] = [];
      while (!sp.eof()) ents.push(sp.parseFactor());
      if (r && c) { for (let i = 0; i < r; i++) rows.push(ents.slice(i * c, (i + 1) * c)); }
      else rows = [ents];
    }
    if (r && c && rows.length !== r) this.warnings.push(`Expected ${r} rows but heard ${rows.length}.`);
    const width = Math.max(1, ...rows.map(x => x.length));
    if (rows.some(x => x.length !== width)) this.warnings.push('The matrix rows have different lengths; check the entries.');
    return { k: 'matrix', rows };
  }
}

function tex1(t: string): string { return isGreek(t) ? `\\${t.toLowerCase()}` : t; }

/** x followed by a single digit: indexed variable by default, product as the alternative. */
function mergeIndexed(n: N): N {
  if (n.k !== 'prod') return n;
  const out: { op: string; n: N }[] = [];
  for (let i = 0; i < n.fs.length; i++) {
    const cur = n.fs[i]; const nx = n.fs[i + 1];
    if (cur.n.k === 'sym' && /^[A-Za-z]$/.test(cur.n.v) && nx && nx.op === '' && nx.n.k === 'num' && /^\d$/.test(nx.n.v)) {
      out.push({ op: cur.op, n: { k: 'sub', b: cur.n, s: nx.n, amb: true } }); i++;
    } else out.push(cur);
  }
  return out.length === 1 ? out[0].n : { k: 'prod', fs: out };
}

/* ----------------------------- renderer ---------------------------- */

const strip = (n: N): N => (n.k === 'group' ? strip(n.n) : n);

function cat(a: string, b: string): string {
  if (!a) return b;
  if (/\\[A-Za-z]+$/.test(a) && /^[A-Za-z0-9]/.test(b)) return `${a} ${b}`;
  return a + b;
}
const simpleTok = (s: string) => /^([A-Za-z0-9]|\\[A-Za-z]+)$/.test(s);
const sup = (s: string) => (simpleTok(s) ? `^${s}` : `^{${s}}`);
const subs = (s: string) => (simpleTok(s) ? `_${s}` : `_{${s}}`);
const needsParensAsBase = (n: N) => ['sum', 'prod', 'frac', 'rel', 'neg', 'big', 'lim', 'pow'].includes(n.k) || (n.k === 'fn' && !!n.arg && !n.paren) || n.k === 'abs' && false;

export function render(n: N): string {
  switch (n.k) {
    case 'num': return n.v;
    case 'sym': return n.v;
    case 'tex': return n.v;
    case 'group': return `\\left(${render(n.n)}\\right)`;
    case 'neg': return '-' + render(n.n);
    case 'sum': {
      let s = '';
      n.terms.forEach((t, i) => {
        const body = render(t.n);
        if (i === 0) s = t.op === '-' ? '-' + body : t.op === '\\pm' ? cat('\\pm', body) : body;
        else s += t.op === '+' ? '+' + body : t.op === '-' ? '-' + body : cat('\\pm', body);
      });
      return s;
    }
    case 'prod': {
      let s = '';
      n.fs.forEach((f, i) => {
        const body = render(f.n);
        if (i === 0) { s = body; return; }
        if (f.op === '') s = cat(s, body);
        else s += ` ${f.op} ${body}`;
      });
      return s;
    }
    case 'frac': return `\\frac{${render(strip(n.a))}}{${render(strip(n.b))}}`;
    case 'pow': {
      const base = needsParensAsBase(n.b) ? `\\left(${render(n.b)}\\right)` : render(n.b);
      return base + sup(render(strip(n.e)));
    }
    case 'sub': return render(n.b) + subs(render(strip(n.s)));
    case 'sqrt': return n.idx ? `\\sqrt[${n.idx}]{${render(strip(n.n))}}` : `\\sqrt{${render(strip(n.n))}}`;
    case 'fn': {
      if (n.paren && !n.name.startsWith('\\')) return `${n.name}\\left(${render(strip(n.arg!))}\\right)`;
      let head = n.name;
      if (n.base) head += subs(render(n.base));
      if (n.pow) head += sup(render(strip(n.pow)));
      if (!n.arg) return head;
      return n.paren ? `${head}\\left(${render(strip(n.arg))}\\right)` : cat(head, render(n.arg));
    }
    case 'rel': {
      let s = render(n.parts[0]);
      n.ops.forEach((op, i) => { s = cat(s, op === '' ? '' : op) ; s = cat(s, render(n.parts[i + 1])); });
      return s;
    }
    case 'abs': return n.norm ? `\\left\\|${render(n.n)}\\right\\|` : `\\left|${render(n.n)}\\right|`;
    case 'accent': return `${n.cmd}{${render(strip(n.n))}}`;
    case 'post': return (needsParensAsBase(n.n) ? `\\left(${render(n.n)}\\right)` : render(n.n)) + n.s;
    case 'big': {
      let s = n.head;
      if (n.lo) s += subs(render(strip(n.lo)));
      if (n.hi) s += sup(render(strip(n.hi)));
      s = cat(s, render(n.body));
      if (n.diff) s += `\\,d${n.diff}`;
      return s;
    }
    case 'lim': return `\\lim_{${render(n.v)}\\to ${render(strip(n.to))}${n.dir ?? ''}}${cat('', render(n.body))}`;
    case 'matrix': {
      const body = n.rows.map(r => r.map(c => render(c)).join(' & ')).join(' \\\\ ');
      return `\\begin{${n.det ? 'vmatrix' : 'bmatrix'}}${body}\\end{${n.det ? 'vmatrix' : 'bmatrix'}}`;
    }
  }
}

/* --------------------------- ambiguity logic ------------------------ */

interface Alt { node: N; label: string; forcing: boolean }

const isBareAtom = (n: N): boolean => n.k === 'sym' || n.k === 'num' || (n.k === 'prod' && n.fs.every(f => f.n.k === 'sym' || f.n.k === 'num'));
const hasPower = (n: N): boolean => n.k === 'pow';

function sumOwnAlts(n: Extract<N, { k: 'sum' }>): Alt[] {
  const out: Alt[] = [];
  const T = n.terms;
  // a plus b squared  ->  (a + b)^2
  const last = T[T.length - 1];
  if (T.length >= 2 && last.n.k === 'pow' && last.n.spoken && isBareAtom(last.n.b) && T.slice(0, -1).every(t => isBareAtom(t.n) && !hasPower(t.n))) {
    const merged: N = { k: 'sum', terms: [...T.slice(0, -1), { op: last.op, n: last.n.b }] };
    out.push({ node: { k: 'pow', b: { k: 'group', n: merged }, e: last.n.e }, label: 'The power applies to the whole sum, (a + b)²', forcing: true });
  }
  T.forEach((t, i) => {
    // one over x plus one
    if (t.n.k === 'frac' && t.n.spoken) {
      if (i < T.length - 1) {
        const restTerms = T.slice(i + 1);
        const denSum: N = { k: 'sum', terms: [{ op: '', n: t.n.b }, ...restTerms] };
        const newTerms = [...T.slice(0, i), { op: t.op, n: { k: 'frac', a: t.n.a, b: denSum } as N }];
        out.push({ node: newTerms.length === 1 && newTerms[0].op === '' ? newTerms[0].n : { k: 'sum', terms: newTerms }, label: 'Everything after "over" is the denominator', forcing: true });
      }
      if (i > 0) {
        const numSum: N = { k: 'sum', terms: [...T.slice(0, i), { op: t.op, n: t.n.a }] };
        const newTerms = [{ op: '', n: { k: 'frac', a: numSum, b: t.n.b } as N }, ...T.slice(i + 1)];
        out.push({ node: newTerms.length === 1 ? newTerms[0].n : { k: 'sum', terms: newTerms }, label: 'Everything before "over" is the numerator', forcing: true });
      }
    }
    // sine x plus y
    if (t.n.k === 'fn' && t.n.spoken && t.n.arg && i < T.length - 1) {
      const wide: N = { k: 'sum', terms: [{ op: '', n: t.n.arg }, ...T.slice(i + 1)] };
      const newTerms = [...T.slice(0, i), { op: t.op, n: { ...t.n, arg: { k: 'group', n: wide }, paren: true, spoken: false } as N }];
      out.push({ node: newTerms.length === 1 && newTerms[0].op === '' ? newTerms[0].n : { k: 'sum', terms: newTerms }, label: 'The function applies to the whole sum after it', forcing: true });
    }
  });
  return out;
}

function variantsOf(n: N): Alt[] {
  const out: Alt[] = [];
  const sub = (child: N, rebuild: (c: N) => N) => { for (const a of variantsOf(child)) out.push({ ...a, node: rebuild(a.node) }); };
  switch (n.k) {
    case 'sum':
      out.push(...sumOwnAlts(n));
      n.terms.forEach((t, i) => sub(t.n, c => ({ k: 'sum', terms: n.terms.map((x, j) => (j === i ? { ...x, n: c } : x)) })));
      break;
    case 'prod': n.fs.forEach((f, i) => sub(f.n, c => ({ k: 'prod', fs: n.fs.map((x, j) => (j === i ? { ...x, n: c } : x)) }))); break;
    case 'rel': n.parts.forEach((p, i) => sub(p, c => ({ k: 'rel', ops: n.ops, parts: n.parts.map((x, j) => (j === i ? c : x)) }))); break;
    case 'group': sub(n.n, c => ({ k: 'group', n: c })); break;
    case 'frac': sub(n.a, c => ({ ...n, a: c })); sub(n.b, c => ({ ...n, b: c })); break;
    case 'pow': sub(n.b, c => ({ ...n, b: c })); sub(n.e, c => ({ ...n, e: c })); break;
    case 'sqrt': sub(n.n, c => ({ ...n, n: c })); break;
    case 'fn': if (n.arg) sub(n.arg, c => ({ ...n, arg: c })); break;
    case 'abs': sub(n.n, c => ({ ...n, n: c })); break;
    case 'big': sub(n.body, c => ({ ...n, body: c })); break;
    case 'lim': sub(n.body, c => ({ ...n, body: c })); break;
    case 'sub':
      if (n.amb) out.push({ node: { k: 'prod', fs: [{ op: '', n: n.s }, { op: '', n: n.b }] }, label: `Read as ${render(n.s)} times ${render(n.b)}, not an index`, forcing: true });
      break;
    default: break;
  }
  return out;
}

/* ------------------------------ public API ------------------------- */

function validLatex(tex: string): boolean {
  try { katex.renderToString(tex, { throwOnError: true, strict: 'ignore' }); return true; } catch { return false; }
}

export function dictateMath(spoken: string): MathDictationResult {
  const heardToks = tokenize(spoken);
  const heard = heardToks.join(' ');
  if (!heardToks.length) return { ok: false, candidates: [], needsChoice: false, heard, warnings: ['Nothing was heard.'] };
  const warnings: string[] = [];
  const base = new Parser(heardToks, { sqrtTight: false });
  let ast: N;
  try { ast = base.parseTop(); } catch (e) { return { ok: false, candidates: [], needsChoice: false, heard, warnings: [`Could not parse: ${(e as Error).message}`] }; }
  warnings.push(...base.warnings);
  if (base.warnings.some(w => w.startsWith('Did not understand'))) {
    return { ok: false, candidates: [], needsChoice: false, heard, warnings: [...new Set(warnings), 'Some words are not math words, so no equation was produced. Edit the text and try again.'] };
  }

  const candidates: MathCandidate[] = [];
  const seen = new Set<string>();
  const push = (node: N, label: string) => {
    const latex = render(node);
    if (seen.has(latex) || !validLatex(latex)) return;
    seen.add(latex); candidates.push({ latex, label });
  };
  push(ast, 'As spoken');
  const alts = variantsOf(ast);
  const forcing = alts.filter(a => a.forcing);
  for (const a of alts.slice(0, 4)) push(a.node, a.label);
  // a tighter reading of "square root of ..." is listed as an alternative but does not force a choice
  if (heardToks.some(t => t.toLowerCase() === 'sqrt' || t.toLowerCase() === 'cbrt')) {
    const tight = new Parser(heardToks, { sqrtTight: true }); const t = tight.parseTop();
    push(t, 'The root covers only the next term');
  }
  const needsChoice = forcing.length > 0 && candidates.length > 1;
  return { ok: candidates.length > 0, candidates, needsChoice, heard, warnings: [...new Set(warnings)] };
}

/** Quick helper used by tests and by the toolbar's "insert template" buttons. */
export function isValidLatex(tex: string): boolean { return validLatex(tex); }
