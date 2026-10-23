/* ------------------------------------------------------------------ */
/*  LaTeX / math text  ->  words a speech engine can read aloud        */
/*  "\int_0^1 x^2 dx = \frac13" ->                                     */
/*  "the integral of x squared, from zero to one, with respect to x,   */
/*   equals one third"                                                 */
/* ------------------------------------------------------------------ */

const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const ORD_PLURAL: Record<number, [string, string]> = { 2: ['half', 'halves'], 3: ['third', 'thirds'], 4: ['quarter', 'quarters'], 5: ['fifth', 'fifths'], 6: ['sixth', 'sixths'], 7: ['seventh', 'sevenths'], 8: ['eighth', 'eighths'], 9: ['ninth', 'ninths'], 10: ['tenth', 'tenths'] };

const GREEK: Record<string, string> = {
  alpha: 'alpha', beta: 'beta', gamma: 'gamma', delta: 'delta', epsilon: 'epsilon', varepsilon: 'epsilon', zeta: 'zeta', eta: 'eta', theta: 'theta', vartheta: 'theta', iota: 'iota', kappa: 'kappa',
  lambda: 'lambda', mu: 'mu', nu: 'nu', xi: 'xi', pi: 'pi', rho: 'rho', sigma: 'sigma', tau: 'tau', upsilon: 'upsilon', phi: 'phi', varphi: 'phi', chi: 'chi', psi: 'psi', omega: 'omega',
  Gamma: 'capital gamma', Delta: 'delta', Theta: 'capital theta', Lambda: 'capital lambda', Xi: 'capital xi', Pi: 'capital pi', Sigma: 'capital sigma', Phi: 'capital phi', Psi: 'capital psi', Omega: 'omega',
};
const FUNCS: Record<string, string> = {
  sin: 'sine', cos: 'cosine', tan: 'tangent', sec: 'secant', csc: 'cosecant', cot: 'cotangent', sinh: 'hyperbolic sine', cosh: 'hyperbolic cosine', tanh: 'hyperbolic tangent',
  arcsin: 'inverse sine', arccos: 'inverse cosine', arctan: 'inverse tangent', ln: 'natural log', log: 'log', exp: 'exponential', det: 'determinant', max: 'maximum', min: 'minimum', lim: 'limit',
};
const SYMS: Record<string, string> = {
  times: 'multiplied by', cdot: 'multiplied by', div: 'divided by', pm: 'plus or minus', mp: 'minus or plus', leq: 'is less than or equal to', le: 'is less than or equal to', geq: 'is greater than or equal to', ge: 'is greater than or equal to',
  neq: 'is not equal to', ne: 'is not equal to', approx: 'is approximately equal to', propto: 'is proportional to', infty: 'infinity', to: 'tends to', rightarrow: 'tends to', Rightarrow: 'implies', Leftrightarrow: 'if and only if',
  in: 'belongs to', partial: 'partial', nabla: 'del', circ: 'degrees', degree: 'degrees', ldots: 'and so on', cdots: 'and so on', dots: 'and so on', hbar: 'h bar', ell: 'l', angle: 'angle', perp: 'perpendicular to', parallel: 'parallel to',
  sim: 'is similar to', equiv: 'is equivalent to', cup: 'union', cap: 'intersection', forall: 'for all', exists: 'there exists', therefore: 'therefore', oint: 'the closed integral of', Re: 'real part of', Im: 'imaginary part of',
};
const UNI_SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+', 'ⁿ': 'n' };
const UNI_SUB: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₋': '-', '₊': '+', 'ₙ': 'n', 'ᵢ': 'i' };

/** Well-known formulas read the way a teacher would say them. Keys are normalised (no spaces). */
const FORMULAS: Record<string, string> = {
  'F=ma': 'Force equals mass multiplied by acceleration',
  'F=m\\cdota': 'Force equals mass multiplied by acceleration',
  'E=mc^2': 'Energy equals mass multiplied by the speed of light squared',
  'E=mc^{2}': 'Energy equals mass multiplied by the speed of light squared',
  'V=IR': 'Voltage equals current multiplied by resistance',
  'P=VI': 'Power equals voltage multiplied by current',
  'v=u+at': 'Final velocity equals initial velocity plus acceleration multiplied by time',
  'a^2+b^2=c^2': 'a squared plus b squared equals c squared',
  'PV=nRT': 'Pressure multiplied by volume equals the number of moles multiplied by the gas constant multiplied by temperature',
  'p=mv': 'Momentum equals mass multiplied by velocity',
  'KE=\\frac{1}{2}mv^2': 'Kinetic energy equals one half mass multiplied by velocity squared',
  'W=Fd': 'Work equals force multiplied by distance',
  's=ut+\\frac{1}{2}at^2': 'Displacement equals initial velocity multiplied by time, plus one half acceleration multiplied by time squared',
  'e^{i\\pi}+1=0': "Euler's identity: e to the power i pi, plus one, equals zero",
};
const FORMULA_NORM = new Map(Object.entries(FORMULAS).map(([k, v]) => [k.replace(/\s+/g, ''), v]));

export function numberWords(s: string): string {
  if (/^\d+$/.test(s)) { const n = Number(s); if (n <= 20) return SMALL[n]; return s; }
  const m = s.match(/^(\d+)\.(\d+)$/);
  if (m) return `${numberWords(m[1])} point ${m[2].split('').map(d => SMALL[Number(d)]).join(' ')}`;
  return s;
}

type Tok = { t: 'cmd' | 'ch' | 'num' | '{' | '}'; v: string };

function normaliseUnicode(s: string): string {
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ⁿ]+/g, m => `^{${[...m].map(c => UNI_SUP[c]).join('')}}`);
  s = s.replace(/[₀₁₂₃₄₅₆₇₈₉₋₊ₙᵢ]+/g, m => `_{${[...m].map(c => UNI_SUB[c]).join('')}}`);
  s = s.replace(/(\d+)\s*\/\s*(\d+)/g, '\\frac{$1}{$2}');
  const map: [RegExp, string][] = [
    [/∫/g, '\\int '], [/∑/g, '\\sum '], [/√/g, '\\sqrt '], [/π/g, '\\pi '], [/×/g, '\\times '], [/÷/g, '\\div '], [/·/g, '\\cdot '], [/≤/g, '\\leq '], [/≥/g, '\\geq '], [/≠/g, '\\neq '], [/≈/g, '\\approx '],
    [/∞/g, '\\infty '], [/∂/g, '\\partial '], [/∇/g, '\\nabla '], [/θ/g, '\\theta '], [/α/g, '\\alpha '], [/β/g, '\\beta '], [/γ/g, '\\gamma '], [/λ/g, '\\lambda '], [/μ/g, '\\mu '], [/ω/g, '\\omega '], [/Δ/g, '\\Delta '],
    [/σ/g, '\\sigma '], [/φ/g, '\\phi '], [/ρ/g, '\\rho '], [/τ/g, '\\tau '], [/ε/g, '\\epsilon '], [/→/g, '\\to '], [/°/g, '^\\circ '], [/±/g, '\\pm '], [/−/g, '-'],
  ];
  for (const [re, r] of map) s = s.replace(re, r);
  return s;
}

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(src.slice(i));
      if (m) { out.push({ t: 'cmd', v: m[1] }); i += m[0].length; continue; }
      i++; continue;
    }
    if (c === '{') { out.push({ t: '{', v: c }); i++; continue; }
    if (c === '}') { out.push({ t: '}', v: c }); i++; continue; }
    if (/\d/.test(c)) { const m = /^\d+(\.\d+)?/.exec(src.slice(i))!; out.push({ t: 'num', v: m[0] }); i += m[0].length; continue; }
    if (/\s/.test(c)) { i++; continue; }
    out.push({ t: 'ch', v: c }); i++;
  }
  return out;
}

class Speaker {
  p = 0;
  readonly toks: Tok[];
  constructor(toks: Tok[]) { this.toks = toks; }
  peek(o = 0) { return this.toks[this.p + o]; }
  more() { return this.p < this.toks.length; }

  /** Read one "argument": a braced group or a single token. */
  arg(): string {
    const t = this.peek();
    if (!t) return '';
    if (t.t === '{') { this.p++; return this.seq(true); }
    return this.atom();
  }
  rawArgTokens(): Tok[] {
    const t = this.peek();
    if (!t) return [];
    if (t.t === '{') {
      let depth = 0; const start = this.p;
      do { const k = this.toks[this.p++]; if (k.t === '{') depth++; if (k.t === '}') depth--; } while (depth > 0 && this.more());
      return this.toks.slice(start + 1, this.p - 1);
    }
    this.p++; return [t];
  }

  seq(untilBrace: boolean, stop?: (t: Tok) => boolean): string {
    const parts: string[] = [];
    while (this.more()) {
      const t = this.peek();
      if (t.t === '}') { if (untilBrace) { this.p++; break; } this.p++; continue; }
      if (stop && stop(t)) break;
      const w = this.atom();
      if (w) parts.push(w);
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  scripts(base: string, rawBase: string): string {
    let sub = '', sup = '';
    while (this.peek() && this.peek().t === 'ch' && (this.peek().v === '^' || this.peek().v === '_')) {
      const k = this.toks[this.p++].v;
      const argToks = this.rawArgTokens();
      const sp = new Speaker(argToks);
      const w = sp.seq(false);
      if (k === '^') sup = w; else sub = w;
    }
    if (!sup && !sub) return base;
    if (sup) {
      const isE = rawBase === 'e';
      const pretty = sup === 'two' ? 'squared' : sup === 'three' ? 'cubed' : sup === 'negative one' ? 'inverse' : '';
      if (sub) base = `${base} sub ${sub}`;
      if (isE && !sub) return `e to the power of ${sup}`;
      if (sup === 'degrees') return `${base} degrees`;
      if (pretty === 'inverse') return `${base} inverse`;
      if (pretty) return `${base} ${pretty}`;
      if (sup === 'T') return `${base} transpose`;
      return `${base} to the power of ${sup}`;
    }
    return `${base} sub ${sub}`;
  }

  atom(): string {
    const t = this.toks[this.p++];
    if (!t) return '';
    let word = '', raw = '';
    switch (t.t) {
      case 'num': word = numberWords(t.v); raw = t.v; break;
      case '{': word = this.seq(true); break;
      case 'ch': word = this.char(t.v); raw = t.v; if (t.v === '^' || t.v === '_') { this.p--; word = ''; this.p++; } break;
      case 'cmd': return this.command(t.v);
      default: return '';
    }
    return this.scripts(word, raw);
  }

  char(c: string): string {
    switch (c) {
      case '=': return 'equals';
      case '+': return 'plus';
      case '-': return 'minus';
      case '<': return 'is less than';
      case '>': return 'is greater than';
      case '/': return 'divided by';
      case '*': return 'multiplied by';
      case '(': return '';
      case ')': return '';
      case '[': case ']': return '';
      case '|': return 'absolute value bar';
      case "'": return 'prime';
      case '!': return 'factorial';
      case ',': case ';': case ':': case '.': case '&': return '';
      case '%': return 'percent';
      case '^': case '_': return '';
      default: return c;
    }
  }

  scriptsOnly(): { lo: string; hi: string } {
    let lo = '', hi = '';
    while (this.peek() && this.peek().t === 'ch' && (this.peek().v === '^' || this.peek().v === '_')) {
      const k = this.toks[this.p++].v;
      const sp = new Speaker(this.rawArgTokens());
      const w = sp.seq(false);
      if (k === '^') hi = w; else lo = w;
    }
    return { lo, hi };
  }

  command(name: string): string {
    if (name in GREEK) return this.scripts(GREEK[name], name);
    if (name in FUNCS && name !== 'lim') {
      const { lo, hi } = this.scriptsOnly();
      let w = FUNCS[name];
      if (hi === 'two') w += ' squared'; else if (hi) w += ` to the power of ${hi}`;
      if (lo && name === 'log') w += ` base ${lo}`;
      return w + (this.peek()?.t === '{' ? '' : '');
    }
    switch (name) {
      case 'left': case 'right': case 'big': case 'Big': case 'bigg': case 'Bigg': {
        const nx = this.peek();
        if (nx && nx.t === 'ch' && (nx.v === '(' || nx.v === ')' || nx.v === '[' || nx.v === ']' || nx.v === '.')) { this.p++; return this.scripts('', ''); }
        if (nx && nx.t === 'ch' && nx.v === '|') { this.p++; return name === 'left' ? 'the absolute value of' : ''; }
        if (nx && nx.t === 'cmd' && (nx.v === '|' || nx.v === '{' || nx.v === '}' || nx.v === 'langle' || nx.v === 'rangle')) { this.p++; return ''; }
        return '';
      }
      case ',': case ';': case ':': case '!': case ' ': case 'quad': case 'qquad': case 'displaystyle': case 'textstyle': case 'limits': case 'nolimits': return '';
      case '{': case '}': return '';
      case '|': return 'norm';
      case '\\': return '. ';
      case '%': return 'percent';
      case '&': return 'and';
      case 'frac': case 'dfrac': case 'tfrac': return this.frac();
      case 'binom': { const a = this.arg(), b = this.arg(); return `${a} choose ${b}`; }
      case 'sqrt': {
        let idx = '';
        if (this.peek() && this.peek().t === 'ch' && this.peek().v === '[') {
          this.p++; const parts: Tok[] = [];
          while (this.more() && !(this.peek().t === 'ch' && this.peek().v === ']')) parts.push(this.toks[this.p++]);
          this.p++; idx = new Speaker(parts).seq(false);
        }
        const inner = this.arg();
        const kind = idx === 'three' ? 'the cube root of' : idx ? `the ${idx}th root of` : 'the square root of';
        const simple = inner.split(' ').length <= 3;
        return this.scripts(simple ? `${kind} ${inner}` : `${kind} ${inner}, end root,`, '');
      }
      case 'int': case 'iint': case 'iiint': case 'oint': {
        const { lo, hi } = this.scriptsOnly();
        const head = name === 'oint' ? 'the closed integral of' : name === 'iint' ? 'the double integral of' : name === 'iiint' ? 'the triple integral of' : 'the integral of';
        // the body runs to the differential: "d x" (optionally after \, ) or to a relation sign
        let end = -1;
        for (let k = this.p; k < this.toks.length; k++) {
          const a = this.toks[k], b = this.toks[k + 1];
          if (a.t === 'ch' && a.v === 'd' && b && (b.t === 'ch' || b.t === 'cmd') && !(b.t === 'ch' && /[=+\-<>]/.test(b.v))) { end = k; break; }
        }
        let body: string, variable = '';
        if (end >= 0) {
          const sp = new Speaker(this.toks.slice(this.p, end));
          body = sp.seq(false);
          const v = this.toks[end + 1];
          variable = v.t === 'cmd' ? (GREEK[v.v] ?? v.v) : v.v;
          this.p = end + 2;
        } else body = this.seq(false, t => t.t === 'ch' && t.v === '=');
        let w = `${head} ${body}`.trim();
        if (lo || hi) w += `, from ${lo || 'the start'} to ${hi || 'the end'}`;
        if (variable) w += `, with respect to ${variable}`;
        return w + ',';
      }
      case 'sum': case 'prod': {
        const { lo, hi } = this.scriptsOnly();
        const head = name === 'sum' ? 'the sum' : 'the product';
        let w = head;
        if (lo) w += ` from ${lo}`;
        if (hi) w += ` to ${hi}`;
        const body = this.seq(false, t => t.t === 'ch' && t.v === '=');
        return `${w} of ${body}`.trim();
      }
      case 'lim': {
        const { lo } = this.scriptsOnly();
        const lm = lo.replace(/ tends to /, ' approaches ');
        const body = this.seq(false, t => t.t === 'ch' && t.v === '=');
        return `the limit as ${lm || 'the variable approaches a value'}, of ${body}`;
      }
      case 'vec': return `vector ${this.arg()}`;
      case 'hat': return `${this.arg()} hat`;
      case 'bar': case 'overline': return `${this.arg()} bar`;
      case 'dot': return `${this.arg()} dot`;
      case 'ddot': return `${this.arg()} double dot`;
      case 'tilde': return `${this.arg()} tilde`;
      case 'mathbf': case 'boldsymbol': return `vector ${this.arg()}`;
      case 'mathrm': case 'text': case 'mathit': case 'operatorname': case 'textbf': case 'mathsf': case 'mathcal': case 'mathbb': case 'textrm': return this.arg();
      case 'begin': {
        const env = this.rawArgTokens().map(x => x.v).join('');
        const body: Tok[] = []; let depth = 1;
        while (this.more()) { const k = this.toks[this.p++]; if (k.t === 'cmd' && k.v === 'begin') depth++; if (k.t === 'cmd' && k.v === 'end') { depth--; if (depth === 0) { this.rawArgTokens(); break; } } body.push(k); }
        const rows: Tok[][] = [[]]; for (const k of body) { if (k.t === 'cmd' && k.v === '\\') rows.push([]); else rows[rows.length - 1].push(k); }
        const spoken = rows.filter(r => r.length).map((r, i) => {
          const cells: Tok[][] = [[]]; for (const k of r) { if (k.t === 'ch' && k.v === '&') cells.push([]); else cells[cells.length - 1].push(k); }
          return `row ${numberWords(String(i + 1))}: ${cells.map(c => new Speaker(c).seq(false)).join(', ')}`;
        }).join('; ');
        const label = /vmatrix/.test(env) ? 'the determinant of the matrix' : /matrix/.test(env) ? 'the matrix' : 'the array';
        return `${label} with ${spoken}`;
      }
      case 'end': this.rawArgTokens(); return '';
      case 'langle': return 'angle bracket'; case 'rangle': return 'close angle bracket';
      case 'lvert': case 'rvert': return 'absolute value';
      case 'prime': return 'prime';
      case 'cdot': return 'multiplied by';
      default:
        if (name in SYMS) return this.scripts(SYMS[name], '');
        return '';
    }
  }

  frac(): string {
    const aT = this.rawArgTokens(), bT = this.rawArgTokens();
    const a = new Speaker(aT).seq(false), b = new Speaker(bT).seq(false);
    const flat = (t: Tok[]) => t.map(x => (x.t === 'cmd' ? '\\' + x.v : x.v)).join('');
    const fa = flat(aT), fb = flat(bT);
    // derivatives
    let m = /^\\partial(\^2)?(.*)$/.exec(fa), n = /^\\partial(.*?)(\^2)?$/.exec(fb);
    if (m && n && fb.startsWith('\\partial')) {
      const order = m[1] ? 'second ' : '';
      const num = m[2] ? new Speaker(lex(m[2])).seq(false) : '';
      return `the ${order}partial derivative${num ? ` of ${num}` : ''} with respect to ${new Speaker(lex(n[1])).seq(false)}`;
    }
    m = /^d(\^2)?(.*)$/.exec(fa); n = /^d(.+?)(\^2)?$/.exec(fb);
    if (m && n && fb.startsWith('d') && !/\\/.test(fb.slice(0, 1))) {
      const order = m[1] ? 'second ' : '';
      const num = m[2] ? new Speaker(lex(m[2])).seq(false) : '';
      return `the ${order}derivative${num ? ` of ${num}` : ''} with respect to ${new Speaker(lex(n[1])).seq(false)}`;
    }
    const na = /^\d+$/.test(fa) ? Number(fa) : NaN, nb = /^\d+$/.test(fb) ? Number(fb) : NaN;
    if (!Number.isNaN(na) && !Number.isNaN(nb) && ORD_PLURAL[nb] && na <= 20) {
      if (na === 1) return `one ${ORD_PLURAL[nb][0]}`;
      if (nb === 2) return `${numberWords(fa)} halves`;
      return `${numberWords(fa)} ${ORD_PLURAL[nb][1]}`;
    }
    const small = (w: string) => w.split(' ').length <= 3;
    if (small(a) && small(b)) return `${a} over ${b}`;
    return `the fraction with numerator ${a}, over denominator ${b},`;
  }
}

/** Convert one LaTeX (or unicode-math) expression to words. */
export function convertLatexToSpokenWords(latex: string): string {
  const key = latex.replace(/\s+/g, '').replace(/\\,|\\;|\\!/g, '');
  const known = FORMULA_NORM.get(key);
  if (known) return known;
  const toks = lex(normaliseUnicode(latex));
  let w = new Speaker(toks).seq(false);
  w = w.replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/\s+/g, ' ').replace(/,\s*$/, '').trim();
  // The "is ... to" for relations reads better as plain verbs inside equations
  w = w.replace(/\bequals\s+equals\b/g, 'equals');
  if (!/^(the|[a-z]+ ?)/i.test(w)) return w;
  return /^[a-z]{2,}/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}

/** Bare formulas that often appear in prose without $ signs. */
const BARE: [RegExp, string][] = [
  [/\bF\s*=\s*m\s*a\b/g, FORMULAS['F=ma']],
  [/\bE\s*=\s*m\s*c\s*(\^2|²)/g, FORMULAS['E=mc^2']],
  [/\bV\s*=\s*I\s*R\b/g, FORMULAS['V=IR']],
  [/\bPV\s*=\s*nRT\b/g, FORMULAS['PV=nRT']],
];

/** Prepare a paragraph for the speech engine: math spans become words, markdown noise is removed. */
export function toSpeakableText(raw: string): string {
  let s = raw;
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_m, g) => ` ${convertLatexToSpokenWords(g)}. `);
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_m, g) => ` ${convertLatexToSpokenWords(g)}. `);
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_m, g) => ` ${convertLatexToSpokenWords(g)} `);
  s = s.replace(/\$([^$\n]+?)\$/g, (_m, g) => ` ${convertLatexToSpokenWords(g)} `);
  for (const [re, rep] of BARE) s = s.replace(re, rep);
  // inline unicode math such as "∫₀¹ x² dx = 1/3" or "x² + y²"
  if (/[∫∑√²³π≤≥≈∂∇⁰¹⁴-⁹₀-₉]/.test(s)) {
    s = s.replace(/[^\n.;]*[∫∑√∂][^\n.;]*|\b[A-Za-z0-9]+[²³⁰¹⁴-⁹]+(?:\s*[+\-=]\s*[A-Za-z0-9]+[²³]*)*/g, seg => ` ${convertLatexToSpokenWords(seg.trim())} `);
  }
  s = s.replace(/[*_`#>]+/g, ' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  s = s.replace(/(\d)\s*\/\s*(\d)/g, (_m, a, b) => convertLatexToSpokenWords(`\\frac{${a}}{${b}}`));
  return s.replace(/\s+/g, ' ').trim();
}
