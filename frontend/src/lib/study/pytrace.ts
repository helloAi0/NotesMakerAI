/* Algorithm & pointer visualizer: a safe Python-subset interpreter that records every step (variables, the objects they point to, output).
   Nothing is eval()'d: code is tokenised, parsed and run by this file with step / recursion limits.
   Numbers follow Python: ints are exact big integers (bigint), floats are IEEE doubles and print like Python (5.0, 1e-05).
   Supported: int/float/str/bool/None, lists, tuples, dicts, sets, classes (inheritance, super()), functions, lambdas, recursion, comprehensions,
   f-strings, if/while/for(+else), try/except/else/finally/raise/assert, del, global/nonlocal, slicing with steps, keyword arguments,
   import math / random / collections (deque, defaultdict) / heapq / sys. NOT supported: *args/**kwargs, with, yield/generators, decorators,
   file/network access, input(). random is a deterministic generator (same sequence every run, not Python's). Set order is insertion order.
   C++ is NOT executed: use cppToPythonPrompt with an AI and review the result. */
export class PyError extends Error {
  line: number; type: string; obj?: PObj;
  constructor(msg: string, line: number, type = 'SyntaxError', obj?: PObj) { super(msg); this.line = line; this.type = type; this.obj = obj; }
}
/** the message people read: "IndexError: list index out of range" */
export const describeError = (e: { message: string; type?: string }) => (e.type && e.type !== 'SyntaxError' ? `${e.type}: ${e.message}` : e.message);
type Tok = { t: 'num' | 'str' | 'fstr' | 'name' | 'op' | 'nl' | 'indent' | 'dedent' | 'eof'; v: string; line: number };
const KW = new Set(['def', 'class', 'return', 'if', 'elif', 'else', 'while', 'for', 'in', 'not', 'and', 'or', 'is', 'None', 'True', 'False', 'break', 'continue', 'pass', 'lambda', 'import', 'from', 'global', 'nonlocal', 'try', 'except', 'finally', 'raise', 'assert', 'del', 'with', 'as', 'yield']);
const OPS3 = ['**=', '//=', '...', '<<=', '>>='], OPS2 = ['==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '//', '**', '->', '<<', '>>', '|=', '&=', '^='];
function lex(src: string, line0 = 1): Tok[] {
  const out: Tok[] = []; const ind = [0]; let depth = 0; const lines = src.replace(/\t/g, '    ').split('\n');
  for (let ln = 0; ln < lines.length; ln++) {
    const L = lines[ln]; let i = 0; const line = ln + line0;
    if (!depth) { if (!L.trim() || L.trim().startsWith('#')) continue; let sp = 0; while (L[sp] === ' ') sp++; if (sp > ind[ind.length - 1]) { ind.push(sp); out.push({ t: 'indent', v: '', line }); } else while (sp < ind[ind.length - 1]) { ind.pop(); out.push({ t: 'dedent', v: '', line }); } if (sp !== ind[ind.length - 1]) throw new PyError('inconsistent indentation', line, 'IndentationError'); i = sp; }
    while (i < L.length) {
      const c = L[i];
      if (c === ' ') { i++; continue; } if (c === '#') break;
      if (/\d/.test(c) || (c === '.' && /\d/.test(L[i + 1] ?? ''))) { const m = L.slice(i).match(/^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*\.?[\d_]*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/)!; out.push({ t: 'num', v: m[0].replace(/_/g, ''), line }); i += m[0].length; continue; }
      if ((c === 'f' || c === 'F') && (L[i + 1] === '"' || L[i + 1] === "'")) { const q = L[i + 1]; let j = i + 2, s = ''; while (j < L.length && L[j] !== q) { if (L[j] === '\\') { j++; s += ({ n: '\n', t: '\t' } as Record<string, string>)[L[j]] ?? L[j]; } else s += L[j]; j++; } if (j >= L.length) throw new PyError('unterminated string', line); out.push({ t: 'fstr', v: s, line }); i = j + 1; continue; }
      if (/[A-Za-z_]/.test(c)) { const m = L.slice(i).match(/^\w+/)!; out.push({ t: 'name', v: m[0], line }); i += m[0].length; continue; }
      if (c === '"' || c === "'") { let j = i + 1, s = ''; while (j < L.length && L[j] !== c) { if (L[j] === '\\') { j++; s += ({ n: '\n', t: '\t' } as Record<string, string>)[L[j]] ?? L[j]; } else s += L[j]; j++; } if (j >= L.length) throw new PyError('unterminated string', line); out.push({ t: 'str', v: s, line }); i = j + 1; continue; }
      const three = L.slice(i, i + 3), two = L.slice(i, i + 2); const op = OPS3.includes(three) ? three : OPS2.includes(two) ? two : c;
      if (!'+-*/%=<>!()[]{},:.;@|&^~'.includes(op[0])) throw new PyError(`unexpected character ${JSON.stringify(c)}`, line);
      if ('([{'.includes(op)) depth++; if (')]}'.includes(op)) depth = Math.max(0, depth - 1); out.push({ t: 'op', v: op, line }); i += op.length;
    }
    if (!depth) out.push({ t: 'nl', v: '', line });
  }
  while (ind.length > 1) { ind.pop(); out.push({ t: 'dedent', v: '', line: lines.length }); } out.push({ t: 'eof', v: '', line: lines.length }); return out;
}
/* ---------------- AST ---------------- */
type E = { k: string; line: number; [x: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type S = E;
const AUG = ['+=', '-=', '*=', '/=', '//=', '%=', '**=', '|=', '&=', '^=', '<<=', '>>='];
class Parser {
  p = 0; ts: Tok[]; constructor(ts: Tok[]) { this.ts = ts; }
  get t() { return this.ts[Math.min(this.p, this.ts.length - 1)]; } is(v: string) { return (this.t.t === 'op' || this.t.t === 'name') && this.t.v === v; } eat(v: string) { if (this.is(v)) { this.p++; return true; } return false; }
  need(v: string) { if (!this.eat(v)) throw new PyError(`expected '${v}' but found '${this.t.v || this.t.t}'`, this.t.line); }
  nameTok(): string { if (this.t.t !== 'name' || KW.has(this.t.v)) throw new PyError(`expected a name but found '${this.t.v || this.t.t}'`, this.t.line); const v = this.t.v; this.p++; return v; }
  program(): S[] { const b: S[] = []; while (this.t.t !== 'eof') { if (this.t.t === 'nl') { this.p++; continue; } b.push(...this.stmt()); } return b; }
  block(): S[] { this.need(':'); if (this.t.t !== 'nl') return this.simple(); this.p++; if ((this.t.t as string) !== 'indent') throw new PyError('expected an indented block', this.t.line, 'IndentationError'); this.p++; const b: S[] = []; while ((this.t.t as string) !== 'dedent' && (this.t.t as string) !== 'eof') { if (this.t.t === 'nl') { this.p++; continue; } b.push(...this.stmt()); } this.p++; return b; }
  simple(): S[] { const o: S[] = [this.small()]; while (this.eat(';')) { if (this.t.t === 'nl') break; o.push(this.small()); } if (this.t.t === 'nl') this.p++; return o; }
  stmt(): S[] {
    const line = this.t.line;
    if (this.eat('if')) { const test = this.expr(); const body = this.block(); const orelse: S[] = []; let cur = orelse; while (this.is('elif')) { const l = this.t.line; this.p++; const t2 = this.expr(); const b2 = this.block(); const n: S = { k: 'if', line: l, test: t2, body: b2, orelse: [] }; cur.push(n); cur = n.orelse; } if (this.eat('else')) cur.push(...this.block()); return [{ k: 'if', line, test, body, orelse }]; }
    if (this.eat('while')) { const test = this.expr(); const body = this.block(); const orelse = this.eat('else') ? this.block() : []; return [{ k: 'while', line, test, body, orelse }]; }
    if (this.eat('for')) { const target = this.target(); this.need('in'); const it = this.exprList(); const body = this.block(); const orelse = this.eat('else') ? this.block() : []; return [{ k: 'for', line, target, iter: it, body, orelse }]; }
    if (this.eat('def')) { const name = this.nameTok(); this.need('('); const params: string[] = [], defs: (E | null)[] = []; while (!this.is(')')) { if (this.is('*') || this.is('**')) throw new PyError('*args and **kwargs are not supported in the visualizer', this.t.line); params.push(this.nameTok()); if (this.eat(':')) this.expr(); defs.push(this.eat('=') ? this.expr() : null); if (!this.eat(',')) break; } this.need(')'); if (this.eat('->')) this.expr(); return [{ k: 'def', line, name, params, defs, body: this.block() }]; }
    if (this.eat('class')) { const name = this.nameTok(); let base: E | null = null; if (this.eat('(')) { if (!this.is(')')) base = this.expr(); while (!this.is(')') && this.t.t !== 'eof') this.p++; this.need(')'); } return [{ k: 'class', line, name, base, body: this.block() }]; }
    if (this.eat('try')) { const body = this.block(); const handlers: { type: E | null; name: string | null; body: S[]; line: number }[] = []; let orelse: S[] = [], fin: S[] = [];
      while (this.is('except')) { const hl = this.t.line; this.p++; let type: E | null = null, name: string | null = null; if (!this.is(':')) { type = this.expr(); if (this.eat('as')) name = this.nameTok(); } handlers.push({ type, name, body: this.block(), line: hl }); }
      if (this.eat('else')) orelse = this.block(); if (this.eat('finally')) fin = this.block(); if (!handlers.length && !fin.length) throw new PyError("expected 'except' or 'finally' after try block", this.t.line); return [{ k: 'try', line, body, handlers, orelse, fin }]; }
    if (this.is('with')) throw new PyError("'with' is not supported in the visualizer", line);
    if (this.is('yield')) throw new PyError('generators (yield) are not supported in the visualizer', line);
    if (this.is('@')) throw new PyError('decorators are not supported in the visualizer', line);
    return this.simple();
  }
  small(): S {
    const line = this.t.line;
    if (this.eat('return')) return { k: 'return', line, value: this.t.t === 'nl' || this.is(';') ? null : this.exprList() };
    if (this.eat('break')) return { k: 'break', line }; if (this.eat('continue')) return { k: 'continue', line }; if (this.eat('pass')) return { k: 'pass', line };
    if (this.eat('global') || (this.is('nonlocal') && this.p++ >= 0)) { const kind = this.ts[this.p - 1].v === 'nonlocal' ? 'nonlocal' : 'global'; const names: string[] = []; while (this.t.t === 'name') { names.push(this.t.v); this.p++; if (!this.eat(',')) break; } return { k: kind, line, names }; }
    if (this.eat('raise')) { if (this.t.t === 'nl' || this.is(';')) return { k: 'raise', line, value: null }; const v = this.expr(); if (this.eat('from')) this.expr(); return { k: 'raise', line, value: v }; }
    if (this.eat('assert')) { const test = this.expr(); const msg = this.eat(',') ? this.expr() : null; return { k: 'assert', line, test, msg }; }
    if (this.eat('del')) { const targets = [this.postfix()]; while (this.eat(',')) targets.push(this.postfix()); return { k: 'del', line, targets }; }
    if (this.eat('import')) { const items: { mod: string; as: string }[] = []; do { let mod = this.nameTok(); while (this.eat('.')) mod += '.' + this.nameTok(); items.push({ mod, as: this.eat('as') ? this.nameTok() : mod.split('.')[0] }); } while (this.eat(',')); return { k: 'import', line, items }; }
    if (this.eat('from')) { let mod = this.nameTok(); while (this.eat('.')) mod += '.' + this.nameTok(); this.need('import'); const names: { name: string; as: string }[] = []; const par = this.eat('('); do { if (par && this.is(')')) break; if (this.is('*')) throw new PyError("'from x import *' is not supported: import the names you need", line); const n = this.nameTok(); names.push({ name: n, as: this.eat('as') ? this.nameTok() : n }); } while (this.eat(',')); if (par) this.need(')'); return { k: 'from', line, mod, names }; }
    const e = this.exprList();
    for (const op of AUG) if (this.eat(op)) return { k: 'aug', line, target: e, op: op.slice(0, -1), value: this.exprList() };
    if (this.is('=')) { const targets = [e]; let v = e; while (this.eat('=')) { v = this.exprList(); targets.push(v); } targets.pop(); return { k: 'assign', line, targets, value: v }; }
    if (this.is(':') && (e.k === 'name' || e.k === 'attr')) { this.p++; this.expr(); if (this.eat('=')) return { k: 'assign', line, targets: [e], value: this.exprList() }; return { k: 'pass', line }; }
    return { k: 'expr', line, value: e };
  }
  target(): E { const line = this.t.line; const first = this.postfix(); if (this.is(',')) { const items = [first]; while (this.eat(',')) { if (this.is('in')) break; items.push(this.postfix()); } return { k: 'tuple', line, items }; } return first; }
  exprList(): E { const line = this.t.line; const first = this.expr(); if (!this.is(',')) return first; const items = [first]; while (this.eat(',')) { if (this.t.t === 'nl' || this.is('=') || this.is(')') || this.is(':') || this.t.t === 'eof') break; items.push(this.expr()); } return { k: 'tuple', line, items }; }
  expr(): E { if (this.is('lambda')) { const line = this.t.line; this.p++; const params: string[] = []; while (!this.is(':')) { params.push(this.nameTok()); this.eat(','); } this.p++; return { k: 'lambda', line, params, body: this.expr() }; } const c = this.or(); if (this.is('if')) { const line = this.t.line; this.p++; const test = this.or(); this.need('else'); return { k: 'ifexp', line, test, a: c, b: this.expr() }; } return c; }
  or(): E { let l = this.and(); while (this.is('or')) { const line = this.t.line; this.p++; l = { k: 'bool', line, op: 'or', a: l, b: this.and() }; } return l; }
  and(): E { let l = this.not(); while (this.is('and')) { const line = this.t.line; this.p++; l = { k: 'bool', line, op: 'and', a: l, b: this.not() }; } return l; }
  not(): E { if (this.is('not')) { const line = this.t.line; this.p++; return { k: 'not', line, a: this.not() }; } return this.cmp(); }
  cmp(): E { const l = this.bitor(); const ops: string[] = [], rest: E[] = []; for (;;) { let op = ''; if (['==', '!=', '<', '>', '<=', '>='].includes(this.t.v) && this.t.t === 'op') op = this.t.v; else if (this.is('in')) op = 'in'; else if (this.is('not') && this.ts[this.p + 1]?.v === 'in') { op = 'not in'; this.p++; } else if (this.is('is')) { op = this.ts[this.p + 1]?.v === 'not' ? (this.p++, 'is not') : 'is'; } else break; this.p++; ops.push(op); rest.push(this.bitor()); } return ops.length ? { k: 'cmp', line: l.line, first: l, ops, rest } : l; }
  binLevel(next: () => E, ops: string[]): E { let l = next(); while (this.t.t === 'op' && ops.includes(this.t.v)) { const op = this.t.v, line = this.t.line; this.p++; l = { k: 'bin', line, op, a: l, b: next() }; } return l; }
  bitor(): E { return this.binLevel(() => this.bitxor(), ['|']); } bitxor(): E { return this.binLevel(() => this.bitand(), ['^']); } bitand(): E { return this.binLevel(() => this.shift(), ['&']); }
  shift(): E { return this.binLevel(() => this.arith(), ['<<', '>>']); } arith(): E { return this.binLevel(() => this.term(), ['+', '-']); } term(): E { return this.binLevel(() => this.unary(), ['*', '/', '//', '%']); }
  unary(): E { if (this.t.t === 'op' && (this.t.v === '-' || this.t.v === '+' || this.t.v === '~')) { const op = this.t.v, line = this.t.line; this.p++; return { k: 'neg', line, op, a: this.unary() }; } return this.power(); }
  power(): E { const l = this.postfix(); if (this.is('**')) { const line = this.t.line; this.p++; return { k: 'bin', line, op: '**', a: l, b: this.unary() }; } return l; }
  postfix(): E {
    let e = this.atom();
    for (;;) {
      const line = this.t.line;
      if (this.eat('(')) { const args: E[] = [], kws: { name: string; value: E }[] = []; while (!this.is(')')) { if (this.is('*') || this.is('**')) throw new PyError('*args and **kwargs are not supported in the visualizer', line); if (this.t.t === 'name' && this.ts[this.p + 1]?.t === 'op' && this.ts[this.p + 1].v === '=') { const name = this.t.v; this.p += 2; kws.push({ name, value: this.expr() }); } else args.push(this.comp(this.expr())); if (!this.eat(',')) break; } this.need(')'); e = { k: 'call', line, fn: e, args, kws }; }
      else if (this.eat('[')) { let lo: E | null = null, hi: E | null = null, step: E | null = null, slice = false; if (!this.is(':')) lo = this.exprList(); if (this.eat(':')) { slice = true; if (!this.is(']') && !this.is(':')) hi = this.expr(); if (this.eat(':')) { if (!this.is(']')) step = this.expr(); } } this.need(']'); e = slice ? { k: 'slice', line, obj: e, lo, hi, step } : { k: 'index', line, obj: e, idx: lo }; }
      else if (this.eat('.')) { const name = this.t.v; if (this.t.t !== 'name') throw new PyError(`expected a name after '.'`, line); this.p++; e = { k: 'attr', line, obj: e, name }; } else break;
    } return e;
  }
  comp(elt: E, kind: 'list' | 'set' | 'dict' = 'list', val?: E): E {
    if (!this.is('for')) return elt; const line = elt.line; const clauses: { target: E; iter: E; conds: E[] }[] = [];
    while (this.eat('for')) { const target = this.target(); this.need('in'); const iter = this.or(); const conds: E[] = []; while (this.eat('if')) conds.push(this.or()); clauses.push({ target, iter, conds }); }
    return { k: 'comp', line, kind, elt, val, clauses };
  }
  fstring(raw: string, line: number): E {
    const parts: (string | { e: E; spec: string; conv: string })[] = []; let lit = ''; let i = 0;
    while (i < raw.length) { const c = raw[i];
      if (c === '{' && raw[i + 1] === '{') { lit += '{'; i += 2; continue; } if (c === '}' && raw[i + 1] === '}') { lit += '}'; i += 2; continue; }
      if (c === '{') { let d = 1, j = i + 1, q = ''; while (j < raw.length && d) { const ch = raw[j]; if (q) { if (ch === q) q = ''; } else if (ch === '"' || ch === "'") q = ch; else if ('{[('.includes(ch)) d++; else if ('}])'.includes(ch)) d--; j++; } if (d) throw new PyError('f-string: expecting }', line);
        let inner = raw.slice(i + 1, j - 1); let spec = '', conv = ''; let dq = 0, qq = ''; for (let k = 0; k < inner.length; k++) { const ch = inner[k]; if (qq) { if (ch === qq) qq = ''; continue; } if (ch === '"' || ch === "'") qq = ch; else if ('([{'.includes(ch)) dq++; else if (')]}'.includes(ch)) dq--; else if (ch === ':' && !dq) { spec = inner.slice(k + 1); inner = inner.slice(0, k); break; } }
        const cm = inner.match(/!([rs])$/); if (cm) { conv = cm[1]; inner = inner.slice(0, -2); } if (lit) { parts.push(lit); lit = ''; } const sub = new Parser(lex(inner.trim() || 'None', line)); parts.push({ e: sub.expr(), spec, conv }); i = j; continue; }
      lit += c; i++; }
    if (lit) parts.push(lit); return { k: 'fstr', line, parts };
  }
  atom(): E {
    const t = this.t, line = t.line;
    if (t.t === 'num') { this.p++; const isF = !/^0[xXbBoO]/.test(t.v) && /[.eE]/.test(t.v); return isF ? { k: 'num', line, v: Number(t.v), float: true } : { k: 'num', line, v: BigInt(t.v), float: false }; }
    if (t.t === 'fstr') { this.p++; return this.fstring(t.v, line); }
    if (t.t === 'str') { this.p++; let s = t.v; while (this.t.t === 'str') { s += this.t.v; this.p++; } return { k: 'str', line, v: s }; }
    if (t.t === 'name') { this.p++; if (t.v === 'None') return { k: 'none', line }; if (t.v === 'True' || t.v === 'False') return { k: 'bool0', line, v: t.v === 'True' }; if (KW.has(t.v)) throw new PyError(`unexpected '${t.v}'`, line); return { k: 'name', line, name: t.v }; }
    if (this.eat('(')) { if (this.eat(')')) return { k: 'tuple', line, items: [] }; const e = this.comp(this.exprList()); this.need(')'); return e; }
    if (this.eat('[')) { const items: E[] = []; while (!this.is(']')) { const e = this.expr(); if (this.is('for') && !items.length) { const c = this.comp(e); this.need(']'); return c; } items.push(e); if (!this.eat(',')) break; } this.need(']'); return { k: 'list', line, items }; }
    if (this.eat('{')) {
      if (this.eat('}')) return { k: 'dict', line, keys: [], vals: [] };
      const first = this.expr();
      if (this.eat(':')) { const v = this.expr(); if (this.is('for')) { const c = this.comp(first, 'dict', v); this.need('}'); return c; } const keys = [first], vals = [v]; while (this.eat(',')) { if (this.is('}')) break; keys.push(this.expr()); this.need(':'); vals.push(this.expr()); } this.need('}'); return { k: 'dict', line, keys, vals }; }
      if (this.is('for')) { const c = this.comp(first, 'set'); this.need('}'); return c; } const items = [first]; while (this.eat(',')) { if (this.is('}')) break; items.push(this.expr()); } this.need('}'); return { k: 'setlit', line, items };
    }
    throw new PyError(`unexpected '${t.v || t.t}'`, line);
  }
}
/* ---------------- values ---------------- */
let NEXT = 1;
class PList { id = NEXT++; items: V[]; tuple: boolean; kind = ''; constructor(items: V[], tuple = false) { this.items = items; this.tuple = tuple; } }
class PDict { id = NEXT++; map = new Map<string, [V, V]>(); factory: V | undefined; }
class PSet { id = NEXT++; map = new Map<string, V>(); }
class PClass { id = NEXT++; name: string; methods: Map<string, PFunc>; base: PClass | null; cattrs = new Map<string, V>(); builtin: boolean; constructor(name: string, methods: Map<string, PFunc>, base: PClass | null = null, builtin = false) { this.name = name; this.methods = methods; this.base = base; this.builtin = builtin; } }
class PObj { id = NEXT++; attrs = new Map<string, V>(); cls: PClass; constructor(cls: PClass) { this.cls = cls; } }
class PFunc { id = NEXT++; name: string; params: string[]; defs: (V | undefined)[]; body: S[] | E; closure: Scope | null; isLambda: boolean; self?: PObj; owner?: PClass; constructor(name: string, params: string[], defs: (V | undefined)[], body: S[] | E, closure: Scope | null, isLambda = false) { this.name = name; this.params = params; this.defs = defs; this.body = body; this.closure = closure; this.isLambda = isLambda; } }
class PModule { id = NEXT++; name: string; constructor(name: string) { this.name = name; } }
class PSuper { id = NEXT++; self: PObj; cls: PClass | null; constructor(self: PObj, cls: PClass | null) { this.self = self; this.cls = cls; } }
type Builtin = { builtin: string };
type V = bigint | number | string | boolean | null | PList | PDict | PSet | PObj | PClass | PFunc | PModule | PSuper | Builtin;
class Scope { vars = new Map<string, V>(); globals?: Set<string>; nonlocals?: Set<string>; parent: Scope | null; label: string; constructor(parent: Scope | null = null, label = 'global') { this.parent = parent; this.label = label; } get(n: string): V | undefined { return this.vars.has(n) ? this.vars.get(n) : this.parent?.get(n); } }
class Ret { v: V; constructor(v: V) { this.v = v; } } class Brk {} class Cont {}
const isBuiltin = (v: V): v is Builtin => typeof v === 'object' && v !== null && 'builtin' in v;
const isRef = (v: V): v is PList | PDict | PSet | PObj | PClass | PFunc | PModule | PSuper => typeof v === 'object' && v !== null && !isBuiltin(v);
const isNum = (v: V): v is bigint | number | boolean => typeof v === 'bigint' || typeof v === 'number' || typeof v === 'boolean';
const asNum = (v: bigint | number | boolean): bigint | number => (typeof v === 'boolean' ? (v ? 1n : 0n) : v);
function fmtFloat(v: number): string {
  if (Number.isNaN(v)) return 'nan'; if (!Number.isFinite(v)) return v > 0 ? 'inf' : '-inf';
  const a = Math.abs(v); const pad = (s: string) => s.replace(/e([+-])(\d)$/, 'e$10$2');
  if (a !== 0 && (a >= 1e16 || a < 1e-4)) return pad(v.toExponential().replace(/\.0+e/, 'e'));
  if (Number.isInteger(v)) return (Object.is(v, -0) ? '-0' : String(v)) + '.0';
  return String(v);
}
const key = (v: V): string => { if (typeof v === 'boolean') return v ? 'n1' : 'n0'; if (typeof v === 'bigint') return 'n' + v; if (typeof v === 'number') return Number.isInteger(v) && Math.abs(v) < 1e300 ? 'n' + BigInt(v) : 'f' + v; if (isRef(v)) return v instanceof PList && v.tuple ? 't(' + v.items.map(key).join(',') + ')' : 'id' + v.id; return typeof v + ':' + String(v); };
const isSub = (c: PClass | null, of: PClass): boolean => { for (let x = c; x; x = x.base) if (x === of) return true; return false; };
export const fmt = (v: V, depth = 0): string => v === null ? 'None' : v === true ? 'True' : v === false ? 'False' : typeof v === 'string' ? (depth ? `'${v.replace(/'/g, "\\'")}'` : v) : typeof v === 'bigint' ? v.toString() : typeof v === 'number' ? fmtFloat(v)
  : v instanceof PList ? (v.tuple ? '(' : '[') + v.items.map(x => fmt(x, 1)).join(', ') + (v.tuple && v.items.length === 1 ? ',)' : v.tuple ? ')' : ']')
  : v instanceof PDict ? '{' + [...v.map.values()].map(([k, x]) => `${fmt(k, 1)}: ${fmt(x, 1)}`).join(', ') + '}' : v instanceof PSet ? (v.map.size ? '{' + [...v.map.values()].map(x => fmt(x, 1)).join(', ') + '}' : 'set()')
  : v instanceof PObj ? (v.attrs.has('args') && excRoot(v.cls) ? excText(v) : `<${v.cls.name} object>`) : v instanceof PClass ? `<class '${v.name}'>` : v instanceof PFunc ? `<function ${v.name}>` : v instanceof PModule ? `<module '${v.name}'>` : '<builtin>';
const excRoot = (c: PClass | null): boolean => { for (let x = c; x; x = x.base) if (x.builtin && x.name === 'Exception') return true; return false; };
const excText = (o: PObj): string => { const a = o.attrs.get('args'); if (!(a instanceof PList)) return ''; return a.items.length === 0 ? '' : a.items.length === 1 ? fmt(a.items[0]) : fmt(new PList(a.items, true), 1); };
const truthy = (v: V): boolean => v === null ? false : typeof v === 'boolean' ? v : typeof v === 'bigint' ? v !== 0n : typeof v === 'number' ? v !== 0 : typeof v === 'string' ? v.length > 0 : v instanceof PList ? v.items.length > 0 : v instanceof PDict ? v.map.size > 0 : v instanceof PSet ? v.map.size > 0 : true;
const typeNameOf = (v: V): string => v === null ? 'NoneType' : typeof v === 'bigint' ? 'int' : typeof v === 'number' ? 'float' : typeof v === 'string' ? 'str' : typeof v === 'boolean' ? 'bool' : v instanceof PList ? (v.kind || (v.tuple ? 'tuple' : 'list')) : v instanceof PDict ? 'dict' : v instanceof PSet ? 'set' : v instanceof PObj ? v.cls.name : v instanceof PModule ? 'module' : v instanceof PClass ? 'type' : 'function';
function cmpV(a: V, b: V): number {
  if (isNum(a) && isNum(b)) { const x = asNum(a), y = asNum(b); return x < y ? -1 : x > y ? 1 : 0; }
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (a instanceof PList && b instanceof PList) { for (let i = 0; i < Math.min(a.items.length, b.items.length); i++) { const c = cmpV(a.items[i], b.items[i]); if (c) return c; } return a.items.length - b.items.length; }
  throw new PyError(`'<' not supported between instances of '${typeNameOf(a)}' and '${typeNameOf(b)}'`, 0, 'TypeError');
}
function eqV(a: V, b: V): boolean {
  if (isNum(a) && isNum(b)) { const x = asNum(a), y = asNum(b); return typeof x === 'bigint' && typeof y === 'bigint' ? x === y : Number(x) === Number(y); }
  if (a instanceof PList && b instanceof PList) return a.items.length === b.items.length && a.items.every((x, i) => eqV(x, b.items[i]));
  if (a instanceof PSet && b instanceof PSet) return a.map.size === b.map.size && [...a.map.keys()].every(k => b.map.has(k));
  if (a instanceof PDict && b instanceof PDict) return a.map.size === b.map.size && [...a.map].every(([k, [, v]]) => b.map.has(k) && eqV(v, b.map.get(k)![1]));
  return a === b;
}
function fmtSpec(v: V, spec: string, line: number): string {
  if (!spec) return fmt(v); const m = spec.match(/^(?:(.)?([<>^]))?(\d+)?(,)?(?:\.(\d+))?([dfs%eEgxXbo]?)$/); if (!m) throw new PyError(`unsupported format spec '${spec}'`, line, 'ValueError');
  const [, fill, al, w, comma, prec, ty] = m; let out: string; const f = fill ?? ' ';
  const asF = (): number => { if (!isNum(v)) throw new PyError(`format spec '${spec}' needs a number`, line, 'ValueError'); return Number(asNum(v)); };
  if (ty === 'f' || ty === '%' || ty === 'e' || ty === 'E') { const x = asF(); out = ty === 'e' || ty === 'E' ? x.toExponential(prec ? +prec : 6).replace(/e([+-])(\d)$/, 'e$10$2') : (ty === '%' ? x * 100 : x).toFixed(prec ? +prec : 6) + (ty === '%' ? '%' : ''); if (ty === 'E') out = out.toUpperCase(); }
  else if (ty === 'd') { if (typeof v !== 'bigint' && typeof v !== 'boolean') throw new PyError("Unknown format code 'd' for object of type 'float'", line, 'ValueError'); out = String(asNum(v)); }
  else if (ty === 'x' || ty === 'X' || ty === 'b' || ty === 'o') { if (typeof v !== 'bigint') throw new PyError(`Unknown format code '${ty}'`, line, 'ValueError'); out = v.toString(ty === 'b' ? 2 : ty === 'o' ? 8 : 16); if (ty === 'X') out = out.toUpperCase(); }
  else if (ty === 'g' || (prec && isNum(v) && ty === '')) out = String(+asF().toPrecision(prec ? +prec : 6)); else out = fmt(v);
  if (comma && isNum(v)) out = out.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (w) { const n = +w; const a = al ?? (isNum(v) ? '>' : '<'); out = a === '<' ? out.padEnd(n, f) : a === '^' ? out.padStart(Math.floor((n + out.length) / 2), f).padEnd(n, f) : out.padStart(n, f); }
  return out;
}
const pyRound = (x: number): number => { const r = Math.round(x); return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r; };
/* ---------------- trace model ---------------- */
export type Cell = { prim: string } | { ref: number };
export interface HeapObj { id: number; type: 'list' | 'tuple' | 'dict' | 'set' | 'deque' | 'object' | 'class' | 'function'; label: string; items: { k: string; v: Cell }[] }
export interface Frame { name: string; vars: { name: string; v: Cell }[] }
export interface Step { n: number; line: number; frames: Frame[]; heap: HeapObj[]; out: string; note: string; changed: string[] }
export interface Trace { steps: Step[]; error?: { message: string; line: number; type?: string }; truncated: boolean; output: string }
const MAX_STEPS = 1500, MAX_DEPTH = 150, MAX_LOOP_WORK = 300000, CAP = 40;
export const MODULES = ['math', 'random', 'collections', 'heapq', 'sys'];
const EXC: [string, string | null][] = [['Exception', null], ['ArithmeticError', 'Exception'], ['ZeroDivisionError', 'ArithmeticError'], ['OverflowError', 'ArithmeticError'], ['LookupError', 'Exception'], ['IndexError', 'LookupError'], ['KeyError', 'LookupError'], ['ValueError', 'Exception'], ['TypeError', 'Exception'], ['NameError', 'Exception'], ['AttributeError', 'Exception'], ['RuntimeError', 'Exception'], ['RecursionError', 'RuntimeError'], ['NotImplementedError', 'RuntimeError'], ['AssertionError', 'Exception'], ['StopIteration', 'Exception'], ['ImportError', 'Exception']];

export function trace(src: string, o: { maxSteps?: number } = {}): Trace {
  const max = o.maxSteps ?? MAX_STEPS; NEXT = 1; const steps: Step[] = []; let out = ''; let work = 0; let truncated = false; let curLine = 0; const stack: Scope[] = []; let prevSig = new Map<string, string>(); let seed = 12345;
  const g = new Scope(null, 'global'); stack.push(g); const excStack: PObj[] = [];
  class Stop extends Error {}
  const excClasses = new Map<string, PClass>(); for (const [n, b] of EXC) excClasses.set(n, new PClass(n, new Map(), b ? excClasses.get(b)! : null, true)); for (const c of excClasses.values()) g.vars.set(c.name, c);
  const cell = (v: V): Cell => (isRef(v) ? { ref: v.id } : { prim: fmt(v, 1) });
  const snapshot = (note: string): void => {
    const heap = new Map<number, HeapObj>(); const add = (id: number, type: HeapObj['type'], label: string, items: { k: string; v: Cell }[], all: V[]) => { heap.set(id, { id, type, label, items }); all.forEach(walk); };
    const walk = (v: V): void => { if (!isRef(v) || heap.has(v.id)) return;
      if (v instanceof PList) { const shown = v.items.slice(0, CAP); const items = shown.map((x, i) => ({ k: String(i), v: cell(x) })); if (v.items.length > CAP) items.push({ k: '…', v: { prim: `+${v.items.length - CAP} more` } }); add(v.id, v.kind === 'deque' ? 'deque' : v.tuple ? 'tuple' : 'list', v.kind || (v.tuple ? 'tuple' : 'list'), items, shown); }
      else if (v instanceof PDict) { const all = [...v.map.values()]; const shown = all.slice(0, CAP); const items = shown.map(([k, x]) => ({ k: fmt(k, 1), v: cell(x) })); if (all.length > CAP) items.push({ k: '…', v: { prim: `+${all.length - CAP} more` } }); add(v.id, 'dict', 'dict', items, shown.flatMap(([k, x]) => [k, x])); }
      else if (v instanceof PSet) { const all = [...v.map.values()]; const shown = all.slice(0, CAP); const items = shown.map(x => ({ k: '•', v: cell(x) })); if (all.length > CAP) items.push({ k: '…', v: { prim: `+${all.length - CAP} more` } }); add(v.id, 'set', 'set', items, shown); }
      else if (v instanceof PObj) { const at = [...v.attrs].filter(([k]) => !(excRoot(v.cls) && k === 'args' && false)); add(v.id, 'object', v.cls.name, at.map(([k, x]) => ({ k, v: cell(x) })), at.map(([, x]) => x)); } };
    const frames: Frame[] = stack.map(s => ({ name: s.label, vars: [...s.vars].filter(([n, v]) => !n.startsWith('__') && !(v instanceof PClass) && !(v instanceof PModule) && !(v instanceof PFunc && !v.self && s === g) && !isBuiltin(v)).map(([name, v]) => { walk(v); return { name, v: cell(v) }; }) }));
    const sig = new Map<string, string>(); for (const f of frames) for (const v of f.vars) sig.set(f.name + '.' + v.name, JSON.stringify(v.v)); for (const h of heap.values()) for (const it of h.items) sig.set(`#${h.id}[${it.k}]`, JSON.stringify(it.v));
    const changed = [...sig].filter(([k, v]) => prevSig.get(k) !== v).map(([k]) => k); prevSig = sig;
    steps.push({ n: steps.length, line: curLine, frames, heap: [...heap.values()], out, note, changed });
    if (steps.length >= max) { truncated = true; throw new Stop(); }
  };
  function err(m: string, line = curLine, type = 'Exception'): never { throw new PyError(m, line, type); }
  const typeName = typeNameOf;
  const toNum = (v: V, line: number): bigint | number => { if (isNum(v)) return asNum(v); return err(`unsupported operand type: '${typeName(v)}'`, line, 'TypeError'); };
  const idx = (v: V, line: number): number => { const x = toNum(v, line); if (typeof x === 'number') { if (!Number.isInteger(x)) err('indices must be integers, not float', line, 'TypeError'); return x; } return Number(x); };
  const iter = (v: V, line: number): V[] => v instanceof PList ? [...v.items] : typeof v === 'string' ? [...v] : v instanceof PDict ? [...v.map.values()].map(([k]) => k) : v instanceof PSet ? [...v.map.values()] : err(`'${typeName(v)}' object is not iterable`, line, 'TypeError');
  const tick = () => { if (++work > MAX_LOOP_WORK) { truncated = true; throw new Stop(); } };
  const findMethod = (c: PClass | null, n: string): PFunc | undefined => { for (let x = c; x; x = x.base) { const m = x.methods.get(n); if (m) return m; } return undefined; };
  const findAttr = (c: PClass | null, n: string): V | undefined => { for (let x = c; x; x = x.base) if (x.cattrs.has(n)) return x.cattrs.get(n); return undefined; };
  const bindM = (m: PFunc, self: PObj): PFunc => Object.assign(Object.create(PFunc.prototype), m, { self }) as PFunc;
  const mkExc = (name: string, msg: string): PObj => { const o2 = new PObj(excClasses.get(name) ?? excClasses.get('Exception')!); o2.attrs.set('args', new PList([msg], true)); return o2; };
  const excObj = (e: PyError): PObj => (e.obj ??= mkExc(e.type, e.message));
  const pystr = (v: V): string => { if (v instanceof PObj) { const m = findMethod(v.cls, '__str__') ?? findMethod(v.cls, '__repr__'); if (m) { const r = call(bindM(m, v), [], curLine); return typeof r === 'string' ? r : fmt(r); } } return fmt(v); };
  const key2 = (v: V): string => key(v);
  const hashable = (v: V, line: number) => { if ((v instanceof PList && !v.tuple) || v instanceof PDict || v instanceof PSet) err(`unhashable type: '${typeName(v)}'`, line, 'TypeError'); };

  function arith(op: string, a: V, b: V, line: number): V {
    if (op === '+') { if (typeof a === 'string' && typeof b === 'string') return a + b; if (a instanceof PList && b instanceof PList) { const r = new PList([...a.items, ...b.items], a.tuple); r.kind = a.kind; return r; } }
    if (op === '*') { if (a instanceof PList && isNum(b)) { const r: V[] = []; const n = Number(asNum(b)); for (let i = 0; i < n; i++) { r.push(...a.items); if (r.length > 200000) err('list too large', line, 'MemoryError'); } return new PList(r, a.tuple); } if (isNum(a) && b instanceof PList) return arith('*', b, a, line); if (typeof a === 'string' && isNum(b)) return a.repeat(Math.max(0, Number(asNum(b)))); }
    if (a instanceof PSet && b instanceof PSet) { const r = new PSet(); if (op === '|') { for (const [k, v] of a.map) r.map.set(k, v); for (const [k, v] of b.map) r.map.set(k, v); return r; } if (op === '&') { for (const [k, v] of a.map) if (b.map.has(k)) r.map.set(k, v); return r; } if (op === '-') { for (const [k, v] of a.map) if (!b.map.has(k)) r.map.set(k, v); return r; } if (op === '^') { for (const [k, v] of a.map) if (!b.map.has(k)) r.map.set(k, v); for (const [k, v] of b.map) if (!a.map.has(k)) r.map.set(k, v); return r; } }
    if (op === '%' && typeof a === 'string') { const args = b instanceof PList && b.tuple ? [...b.items] : [b]; let i = 0; return a.replace(/%([sdrf]|\.\d+f)/g, (_m, t: string) => { const x = args[i++]; return t === 's' ? pystr(x) : t === 'r' ? fmt(x, 1) : t === 'd' ? String(Number(asNum(x as bigint))) : fmtSpec(x, t.startsWith('.') ? t : '.6f', line); }); }
    if (op === '|' && a instanceof PDict && b instanceof PDict) { const r = new PDict(); for (const [k, v] of a.map) r.map.set(k, v); for (const [k, v] of b.map) r.map.set(k, v); return r; }
    if (!isNum(a) || !isNum(b)) err(`unsupported operand type(s) for ${op}: '${typeName(a)}' and '${typeName(b)}'`, line, 'TypeError');
    const x = asNum(a), y = asNum(b); const zero = (m: string): never => err(m, line, 'ZeroDivisionError');
    if (typeof x === 'bigint' && typeof y === 'bigint') {
      switch (op) { case '+': return x + y; case '-': return x - y; case '*': return x * y; case '/': if (y === 0n) zero('division by zero'); return Number(x) / Number(y);
        case '//': { if (y === 0n) zero('integer division or modulo by zero'); let q = x / y; if (x % y !== 0n && (x < 0n) !== (y < 0n)) q -= 1n; return q; } case '%': if (y === 0n) zero('integer modulo by zero'); return ((x % y) + y) % y;
        case '**': if (y < 0n) { if (x === 0n) zero('0.0 cannot be raised to a negative power'); return Math.pow(Number(x), Number(y)); } if (y > 5000n && x !== 1n && x !== 0n && x !== -1n) err('exponent too large for the visualizer', line, 'OverflowError'); return x ** y;
        case '&': return x & y; case '|': return x | y; case '^': return x ^ y; case '<<': if (y < 0n) err('negative shift count', line, 'ValueError'); if (y > 5000n) err('shift too large', line, 'OverflowError'); return x << y; case '>>': if (y < 0n) err('negative shift count', line, 'ValueError'); return x >> y; }
    } else { const p = Number(x), q = Number(y);
      switch (op) { case '+': return p + q; case '-': return p - q; case '*': return p * q; case '/': if (q === 0) zero('float division by zero'); return p / q; case '//': if (q === 0) zero('float floor division by zero'); return Math.floor(p / q); case '%': if (q === 0) zero('float modulo by zero'); return p - q * Math.floor(p / q); case '**': return Math.pow(p, q); }
      err(`unsupported operand type(s) for ${op}: 'float' and 'int'`, line, 'TypeError'); }
    return err('bad operator ' + op, line, 'SyntaxError');
  }
  const sortList = (items: V[], kw: Map<string, V>, line: number): V[] => { const keyf = kw.get('key'); const dec = items.map((x, i) => ({ x, i, k: keyf ? call(keyf, [x], line) : x })); try { dec.sort((a, b) => cmpV(a.k, b.k) || a.i - b.i); } catch (e) { if (e instanceof PyError) { e.line = line; } throw e; } let r = dec.map(d => d.x); if (kw.has('reverse') && truthy(kw.get('reverse') as V)) { /* stable reverse: reverse keeps equal items in original order */ const d2 = dec.map(d => d).sort((a, b) => cmpV(b.k, a.k) || a.i - b.i); r = d2.map(d => d.x); } return r; };
  const lcg = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
  const sift = (h: V[], i: number, line: number) => { const n = h.length; for (;;) { let m = i; const l = 2 * i + 1, r = l + 1; if (l < n && cmpV(h[l], h[m]) < 0) m = l; if (r < n && cmpV(h[r], h[m]) < 0) m = r; if (m === i) return; [h[i], h[m]] = [h[m], h[i]]; i = m; } void line; };
  const up = (h: V[], i: number) => { while (i > 0) { const p = (i - 1) >> 1; if (cmpV(h[i], h[p]) < 0) { [h[i], h[p]] = [h[p], h[i]]; i = p; } else return; } };
  const strMethod = (s: string, name: string, args: V[], line: number): V | undefined => { switch (name) {
    case 'upper': return s.toUpperCase(); case 'lower': return s.toLowerCase(); case 'title': return s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()); case 'capitalize': return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
    case 'split': { if (!args.length || args[0] === null) return new PList(s.split(/\s+/).filter(Boolean)); return new PList(s.split(String(args[0]))); } case 'join': return iter(args[0], line).map(x => { if (typeof x !== 'string') err(`sequence item: expected str instance, ${typeName(x)} found`, line, 'TypeError'); return x as string; }).join(s);
    case 'strip': return args.length ? s.replace(new RegExp(`^[${String(args[0]).replace(/[\]\\^-]/g, '\\$&')}]+|[${String(args[0]).replace(/[\]\\^-]/g, '\\$&')}]+$`, 'g'), '') : s.trim(); case 'lstrip': return s.trimStart(); case 'rstrip': return s.trimEnd();
    case 'startswith': return s.startsWith(String(args[0])); case 'endswith': return s.endsWith(String(args[0])); case 'find': return BigInt(s.indexOf(String(args[0]))); case 'index': { const i = s.indexOf(String(args[0])); if (i < 0) err('substring not found', line, 'ValueError'); return BigInt(i); }
    case 'replace': return s.split(String(args[0])).join(String(args[1])); case 'count': return BigInt(String(args[0]) === '' ? s.length + 1 : s.split(String(args[0])).length - 1);
    case 'isdigit': return /^\d+$/.test(s); case 'isalpha': return /^[A-Za-z]+$/.test(s); case 'isalnum': return /^[A-Za-z0-9]+$/.test(s); case 'isupper': return s !== s.toLowerCase() && s === s.toUpperCase(); case 'islower': return s !== s.toUpperCase() && s === s.toLowerCase(); case 'isspace': return /^\s+$/.test(s);
    case 'zfill': return s.padStart(Number(asNum(args[0] as bigint)), '0'); case 'center': { const n = Number(asNum(args[0] as bigint)); const t = Math.max(0, n - s.length); return ' '.repeat(Math.floor(t / 2)) + s + ' '.repeat(t - Math.floor(t / 2)); }
    case 'format': { let i = 0; return s.replace(/\{(\d*)(?::([^}]*))?\}/g, (_m, n: string, sp: string) => fmtSpec(args[n === '' ? i++ : +n] ?? null, sp ?? '', line)); } } return undefined; };

  const call = (f: V, args: V[], line: number, kw: Map<string, V> = new Map()): V => {
    if (f instanceof PClass) {
      const obj = new PObj(f); const init = findMethod(f, '__init__'); if (init) call(bindM(init, obj), args, line, kw);
      else if (excRoot(f)) obj.attrs.set('args', new PList([...args], true)); else if (args.length || kw.size) err(`${f.name}() takes no arguments`, line, 'TypeError');
      for (const [k, v] of cattrsOf(f)) if (!obj.attrs.has(k)) { /* class attributes stay on the class (read through the instance) */ void k; void v; }
      return obj;
    }
    if (isBuiltin(f)) return builtin(f.builtin, args, line, kw);
    if (!(f instanceof PFunc)) return err(`'${typeName(f)}' object is not callable`, line, 'TypeError');
    if (stack.length > MAX_DEPTH) err(`maximum recursion depth exceeded (the visualizer allows ${MAX_DEPTH} nested calls)`, line, 'RecursionError');
    const sc = new Scope(f.closure ?? g, f.name + '()'); const params = f.self ? f.params.slice(1) : f.params; const defs = f.self ? f.defs.slice(1) : f.defs;
    if (f.self) { sc.vars.set(f.params[0], f.self); sc.vars.set('__self__', f.self); if (f.owner) sc.vars.set('__owner__', f.owner); }
    if (args.length > params.length) err(`${f.name}() takes ${params.length} positional arguments but ${args.length} were given`, line, 'TypeError');
    for (const k of kw.keys()) if (!params.includes(k)) err(`${f.name}() got an unexpected keyword argument '${k}'`, line, 'TypeError');
    params.forEach((p, i) => { const v = i < args.length ? args[i] : kw.has(p) ? kw.get(p) : defs[i]; if (v === undefined) err(`${f.name}() missing 1 required positional argument: '${p}'`, line, 'TypeError'); sc.vars.set(p, v as V); });
    if (f.isLambda) { stack.push(sc); try { return ev(f.body as E, sc); } finally { stack.pop(); } }
    stack.push(sc); snapshot(`call ${f.name}(${args.map(a => fmt(a, 1)).join(', ')})`);
    try { run(f.body as S[], sc); } catch (e) { if (e instanceof Ret) { return e.v; } throw e; } finally { stack.pop(); }
    return null;
  };
  const cattrsOf = (c: PClass) => { const m = new Map<string, V>(); for (let x: PClass | null = c; x; x = x.base) for (const [k, v] of x.cattrs) if (!m.has(k)) m.set(k, v); return m; };
  const method = (obj: V, name: string, args: V[], line: number, kw: Map<string, V> = new Map()): V | undefined => {
    if (obj instanceof PList) {
      const tuple = obj.tuple; if (tuple && !['index', 'count'].includes(name)) return undefined;
      switch (name) {
        case 'append': obj.items.push(args[0]); return null; case 'pop': { if (!obj.items.length) err('pop from empty list', line, 'IndexError'); const i = args.length ? idx(args[0], line) : obj.items.length - 1; const k = i < 0 ? obj.items.length + i : i; if (k < 0 || k >= obj.items.length) err('pop index out of range', line, 'IndexError'); return obj.items.splice(k, 1)[0]; }
        case 'popleft': if (obj.kind !== 'deque') return undefined; if (!obj.items.length) err('pop from an empty deque', line, 'IndexError'); return obj.items.shift() as V; case 'appendleft': if (obj.kind !== 'deque') return undefined; obj.items.unshift(args[0]); return null;
        case 'insert': obj.items.splice(Math.min(Math.max(0, idx(args[0], line)), obj.items.length), 0, args[1]); return null; case 'remove': { const i = obj.items.findIndex(x => eqV(x, args[0])); if (i < 0) err('list.remove(x): x not in list', line, 'ValueError'); obj.items.splice(i, 1); return null; }
        case 'extend': obj.items.push(...iter(args[0], line)); return null; case 'reverse': obj.items.reverse(); return null; case 'clear': obj.items.length = 0; return null;
        case 'index': { const i = obj.items.findIndex(x => eqV(x, args[0])); if (i < 0) err(`${fmt(args[0], 1)} is not in list`, line, 'ValueError'); return BigInt(i); } case 'count': return BigInt(obj.items.filter(x => eqV(x, args[0])).length);
        case 'sort': obj.items = sortList(obj.items, kw, line); return null; case 'copy': { const r = new PList([...obj.items]); r.kind = obj.kind; return r; } } return undefined;
    }
    if (obj instanceof PDict) { switch (name) { case 'keys': return new PList([...obj.map.values()].map(([k]) => k)); case 'values': return new PList([...obj.map.values()].map(([, v]) => v)); case 'items': return new PList([...obj.map.values()].map(([k, v]) => new PList([k, v], true)));
      case 'get': return obj.map.get(key2(args[0]))?.[1] ?? (args[1] ?? null); case 'pop': { const e = obj.map.get(key2(args[0])); if (!e) { if (args.length > 1) return args[1]; err(fmt(args[0], 1), line, 'KeyError'); } obj.map.delete(key2(args[0])); return e![1]; }
      case 'setdefault': { const e = obj.map.get(key2(args[0])); if (e) return e[1]; const v = args[1] ?? null; obj.map.set(key2(args[0]), [args[0], v]); return v; } case 'update': { const src = args[0]; if (src instanceof PDict) for (const [k, e] of src.map) obj.map.set(k, e); else if (src) for (const it of iter(src, line)) { const p = it as PList; obj.map.set(key2(p.items[0]), [p.items[0], p.items[1]]); } return null; } case 'clear': obj.map.clear(); return null; case 'copy': { const r = new PDict(); for (const [k, e] of obj.map) r.map.set(k, e); return r; } } return undefined; }
    if (obj instanceof PSet) { switch (name) { case 'add': hashable(args[0], line); obj.map.set(key2(args[0]), args[0]); return null; case 'remove': if (!obj.map.has(key2(args[0]))) err(fmt(args[0], 1), line, 'KeyError'); obj.map.delete(key2(args[0])); return null; case 'discard': obj.map.delete(key2(args[0])); return null;
      case 'pop': { const k = obj.map.keys().next(); if (k.done) err('pop from an empty set', line, 'KeyError'); const v = obj.map.get(k.value)!; obj.map.delete(k.value); return v; } case 'clear': obj.map.clear(); return null; case 'copy': { const r = new PSet(); for (const [k, v] of obj.map) r.map.set(k, v); return r; }
      case 'update': for (const x of iter(args[0], line)) obj.map.set(key2(x), x); return null; case 'union': case 'intersection': case 'difference': case 'symmetric_difference': { const o2 = new PSet(); for (const x of iter(args[0], line)) o2.map.set(key2(x), x); return arith(({ union: '|', intersection: '&', difference: '-', symmetric_difference: '^' } as Record<string, string>)[name], obj, o2, line); }
      case 'issubset': return [...obj.map.keys()].every(k => (args[0] as PSet).map?.has(k) ?? iter(args[0], line).some(x => key2(x) === k)); case 'issuperset': return iter(args[0], line).every(x => obj.map.has(key2(x))); case 'isdisjoint': return iter(args[0], line).every(x => !obj.map.has(key2(x))); } return undefined; }
    if (typeof obj === 'string') return strMethod(obj, name, args, line);
    return undefined;
  };
  const exceptionIs = (c: PClass | null, n: string): boolean => { for (let x = c; x; x = x.base) if (x.name === n) return true; return false; };
  const moduleAttr = (m: PModule, name: string, line: number): V => {
    const fn = (): V => ({ builtin: `${m.name}.${name}` });
    if (m.name === 'math') { const c: Record<string, number> = { pi: Math.PI, e: Math.E, inf: Infinity, nan: NaN, tau: 2 * Math.PI }; if (name in c) return c[name]; if (['sqrt', 'floor', 'ceil', 'pow', 'log', 'log2', 'log10', 'exp', 'sin', 'cos', 'tan', 'atan', 'atan2', 'asin', 'acos', 'fabs', 'hypot', 'gcd', 'lcm', 'factorial', 'isqrt', 'radians', 'degrees', 'trunc', 'isclose', 'comb', 'perm'].includes(name)) return fn(); }
    if (m.name === 'random' && ['seed', 'random', 'randint', 'randrange', 'choice', 'shuffle', 'uniform'].includes(name)) return fn();
    if (m.name === 'collections' && ['deque', 'defaultdict', 'Counter'].includes(name)) return fn(); if (m.name === 'heapq' && ['heappush', 'heappop', 'heapify', 'nlargest', 'nsmallest'].includes(name)) return fn();
    if (m.name === 'sys') { if (name === 'maxsize') return 9223372036854775807n; if (name === 'setrecursionlimit') return fn(); }
    return err(`module '${m.name}' has no attribute '${name}' in the visualizer`, line, 'AttributeError');
  };
  const builtin = (n: string, a: V[], line: number, kw: Map<string, V> = new Map()): V => {
    const num0 = (i = 0) => Number(toNum(a[i], line)); const bi = (x: number) => BigInt(Math.trunc(x));
    switch (n) {
      case 'print': { out += a.map(x => pystr(x)).join(kw.has('sep') ? pystr(kw.get('sep') as V) : ' ') + (kw.has('end') ? pystr(kw.get('end') as V) : '\n'); return null; }
      case 'len': { const x = a[0]; if (x instanceof PList) return BigInt(x.items.length); if (x instanceof PDict) return BigInt(x.map.size); if (x instanceof PSet) return BigInt(x.map.size); if (typeof x === 'string') return BigInt(x.length); if (x instanceof PObj) { const m = findMethod(x.cls, '__len__'); if (m) return call(bindM(m, x), [], line); } return err(`object of type '${typeName(x)}' has no len()`, line, 'TypeError'); }
      case 'range': { const [s, e, st] = a.length === 1 ? [0, num0(0), 1] : [num0(0), num0(1), a[2] === undefined ? 1 : num0(2)]; if (!st) err('range() arg 3 must not be zero', line, 'ValueError'); const r: V[] = []; for (let i = s; st > 0 ? i < e : i > e; i += st) { r.push(BigInt(i)); if (r.length > 100000) err('range too large for the visualizer', line, 'MemoryError'); } return new PList(r); }
      case 'abs': { const x = toNum(a[0], line); return typeof x === 'bigint' ? (x < 0n ? -x : x) : Math.abs(x); }
      case 'int': { const x = a[0]; if (a.length === 0) return 0n; if (typeof x === 'string') { const base = a[1] === undefined ? 10 : num0(1); const t = x.trim().replace(/_/g, ''); const ok = base === 10 ? /^[+-]?\d+$/.test(t) : base === 16 ? /^[+-]?[0-9a-fA-F]+$/.test(t) : base === 2 ? /^[+-]?[01]+$/.test(t) : /^[+-]?[0-9a-zA-Z]+$/.test(t); if (!ok) err(`invalid literal for int() with base ${base}: '${x}'`, line, 'ValueError'); if (base === 10) return BigInt(t); const neg = t.startsWith('-'); const body = t.replace(/^[+-]/, ''); let r = 0n; for (const ch of body) r = r * BigInt(base) + BigInt(parseInt(ch, base)); return neg ? -r : r; } const v = toNum(x, line); if (typeof v === 'bigint') return v; if (!Number.isFinite(v)) err('cannot convert float infinity or NaN to integer', line, typeof v === 'number' && Number.isNaN(v) ? 'ValueError' : 'OverflowError'); return bi(v); }
      case 'float': { const x = a[0]; if (a.length === 0) return 0; if (typeof x === 'string') { const t = x.trim().toLowerCase(); if (t === 'inf' || t === '+inf' || t === 'infinity') return Infinity; if (t === '-inf') return -Infinity; if (t === 'nan') return NaN; if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/.test(t)) err(`could not convert string to float: '${x}'`, line, 'ValueError'); return Number(t); } return Number(toNum(x, line)); }
      case 'str': return a.length ? pystr(a[0]) : ''; case 'repr': return fmt(a[0], 1); case 'bool': return a.length ? truthy(a[0]) : false;
      case 'min': case 'max': { const xs = a.length === 1 ? iter(a[0], line) : a; if (!xs.length) { if (kw.has('default')) return kw.get('default') as V; err(`${n}() arg is an empty sequence`, line, 'ValueError'); } const kf = kw.get('key'); const k = (x: V) => (kf ? call(kf, [x], line) : x); return xs.reduce((m, x) => ((n === 'min' ? cmpV(k(x), k(m)) < 0 : cmpV(k(x), k(m)) > 0) ? x : m)); }
      case 'sum': { let t: bigint | number = a[1] === undefined ? 0n : toNum(a[1], line); for (const x of iter(a[0], line)) t = arith('+', t, x, line) as bigint | number; return t; }
      case 'sorted': return new PList(sortList(iter(a[0], line), kw, line)); case 'list': return new PList(a.length ? iter(a[0], line) : []); case 'tuple': return new PList(a.length ? iter(a[0], line) : [], true);
      case 'set': { const s = new PSet(); if (a.length) for (const x of iter(a[0], line)) { hashable(x, line); s.map.set(key2(x), x); } return s; } case 'frozenset': return builtin('set', a, line, kw);
      case 'dict': { const d = new PDict(); if (a[0] instanceof PDict) for (const [k, e] of a[0].map) d.map.set(k, e); else if (a[0]) for (const it of iter(a[0], line)) { const p = it as PList; d.map.set(key2(p.items[0]), [p.items[0], p.items[1]]); } for (const [k, v] of kw) d.map.set('s' + k, [k, v]); return d; }
      case 'isinstance': { const t = a[1]; const test = (c: V): boolean => { if (c instanceof PClass) return a[0] instanceof PObj && isSub(a[0].cls, c); if (isBuiltin(c)) { const nm = c.builtin; const x = a[0]; return nm === 'int' ? typeof x === 'bigint' || typeof x === 'boolean' : nm === 'float' ? typeof x === 'number' : nm === 'str' ? typeof x === 'string' : nm === 'bool' ? typeof x === 'boolean' : nm === 'list' ? x instanceof PList && !x.tuple : nm === 'tuple' ? x instanceof PList && x.tuple : nm === 'dict' ? x instanceof PDict : nm === 'set' ? x instanceof PSet : false; } return false; }; return t instanceof PList ? t.items.some(test) : test(t); }
      case 'round': { const x = toNum(a[0], line); if (a[1] === undefined || a[1] === null) return typeof x === 'bigint' ? x : bi(pyRound(x)); const nd = num0(1); if (typeof x === 'bigint') return x; const f = Math.pow(10, nd); return Math.round(x * f) / f; }
      case 'enumerate': { const st = a[1] === undefined ? 0 : num0(1); return new PList(iter(a[0], line).map((x, i) => new PList([BigInt(i + st), x], true))); } case 'reversed': return new PList(iter(a[0], line).reverse()); case 'zip': { const ls = a.map(x => iter(x, line)); return new PList(Array.from({ length: ls.length ? Math.min(...ls.map(l => l.length)) : 0 }, (_, i) => new PList(ls.map(l => l[i]), true))); }
      case 'any': return iter(a[0], line).some(truthy); case 'all': return iter(a[0], line).every(truthy); case 'map': return new PList(iter(a[1], line).map(x => call(a[0], [x], line))); case 'filter': return new PList(iter(a[1], line).filter(x => truthy(a[0] === null ? x : call(a[0], [x], line))));
      case 'chr': return String.fromCodePoint(num0()); case 'ord': { if (typeof a[0] !== 'string' || [...a[0]].length !== 1) err('ord() expected a character', line, 'TypeError'); return BigInt(a[0].codePointAt(0)!); }
      case 'divmod': return new PList([arith('//', a[0], a[1], line), arith('%', a[0], a[1], line)], true); case 'pow': return arith('**', a[0], a[1], line);
      case 'input': return err('input() is not available in the visualizer: put the values in variables', line, 'RuntimeError');
      case 'super': { const self = stack[stack.length - 1].get('__self__'); const owner = stack[stack.length - 1].get('__owner__'); if (!(self instanceof PObj) || !(owner instanceof PClass)) err('super() can only be used inside a method', line, 'RuntimeError'); return new PSuper(self as PObj, (owner as PClass).base); }
      case 'math.sqrt': { const x = num0(); if (x < 0) err('math domain error', line, 'ValueError'); return Math.sqrt(x); } case 'math.floor': return Number.isFinite(num0()) ? BigInt(Math.floor(num0())) : err('cannot convert float infinity to integer', line, 'OverflowError'); case 'math.ceil': return BigInt(Math.ceil(num0())); case 'math.trunc': return bi(num0());
      case 'math.pow': return Math.pow(num0(), num0(1)); case 'math.exp': return Math.exp(num0()); case 'math.sin': return Math.sin(num0()); case 'math.cos': return Math.cos(num0()); case 'math.tan': return Math.tan(num0()); case 'math.atan': return Math.atan(num0()); case 'math.asin': return Math.asin(num0()); case 'math.acos': return Math.acos(num0()); case 'math.atan2': return Math.atan2(num0(), num0(1));
      case 'math.fabs': return Math.abs(num0()); case 'math.hypot': return Math.hypot(...a.map((_, i) => num0(i))); case 'math.radians': return num0() * Math.PI / 180; case 'math.degrees': return num0() * 180 / Math.PI; case 'math.isclose': return Math.abs(num0() - num0(1)) <= Math.max(1e-9 * Math.max(Math.abs(num0()), Math.abs(num0(1))), 0);
      case 'math.log': { const x = num0(); if (x <= 0) err('math domain error', line, 'ValueError'); return a[1] === undefined ? Math.log(x) : Math.log(x) / Math.log(num0(1)); } case 'math.log2': { const x = num0(); if (x <= 0) err('math domain error', line, 'ValueError'); return Math.log2(x); } case 'math.log10': { const x = num0(); if (x <= 0) err('math domain error', line, 'ValueError'); return Math.log10(x); }
      case 'math.gcd': { let x = a.length ? (toNum(a[0], line) as bigint) : 0n, y = a[1] === undefined ? 0n : (toNum(a[1], line) as bigint); x = x < 0n ? -x : x; y = y < 0n ? -y : y; while (y) [x, y] = [y, x % y]; return x; } case 'math.lcm': { let x = toNum(a[0], line) as bigint, y = toNum(a[1], line) as bigint; const p = x * y; while (y) [x, y] = [y, x % y]; return x === 0n ? 0n : (p < 0n ? -p : p) / x; }
      case 'math.factorial': { const x = toNum(a[0], line); if (typeof x !== 'bigint' || x < 0n) err('factorial() only accepts non-negative integers', line, 'ValueError'); if (x > 2000n) err('factorial argument too large for the visualizer', line, 'OverflowError'); let r = 1n; for (let i = 2n; i <= x; i++) r *= i; return r; }
      case 'math.isqrt': { const x = toNum(a[0], line); if (typeof x !== 'bigint' || x < 0n) err('isqrt() argument must be a non-negative integer', line, 'ValueError'); if (x < 2n) return x; let r = BigInt(Math.floor(Math.sqrt(Number(x)))); while (r * r > x) r--; while ((r + 1n) * (r + 1n) <= x) r++; return r; }
      case 'math.comb': case 'math.perm': { const nn = toNum(a[0], line) as bigint, k = toNum(a[1], line) as bigint; if (k < 0n || nn < 0n) err('must be non-negative integers', line, 'ValueError'); if (k > nn) return 0n; let r = 1n; for (let i = 0n; i < k; i++) r = n === 'math.comb' ? (r * (nn - i)) / (i + 1n) : r * (nn - i); return r; }
      case 'random.seed': seed = num0() & 0x7fffffff; return null; case 'random.random': return lcg(); case 'random.uniform': return num0() + (num0(1) - num0()) * lcg(); case 'random.randint': { const lo = num0(), hi = num0(1); if (hi < lo) err('empty range for randint()', line, 'ValueError'); return BigInt(lo + Math.floor(lcg() * (hi - lo + 1))); } case 'random.randrange': { const lo = a.length > 1 ? num0() : 0, hi = a.length > 1 ? num0(1) : num0(); if (hi <= lo) err('empty range for randrange()', line, 'ValueError'); return BigInt(lo + Math.floor(lcg() * (hi - lo))); }
      case 'random.choice': { const xs = iter(a[0], line); if (!xs.length) err('Cannot choose from an empty sequence', line, 'IndexError'); return xs[Math.floor(lcg() * xs.length)]; } case 'random.shuffle': { const l = a[0] as PList; for (let i = l.items.length - 1; i > 0; i--) { const j = Math.floor(lcg() * (i + 1)); [l.items[i], l.items[j]] = [l.items[j], l.items[i]]; } return null; }
      case 'collections.deque': { const d = new PList(a.length ? iter(a[0], line) : []); d.kind = 'deque'; return d; } case 'collections.defaultdict': { const d = new PDict(); d.factory = a[0]; return d; } case 'collections.Counter': { const d = new PDict(); if (a.length) for (const x of iter(a[0], line)) { const e = d.map.get(key2(x)); d.map.set(key2(x), [x, ((e?.[1] ?? 0n) as bigint) + 1n]); } return d; }
      case 'heapq.heappush': { const h = a[0] as PList; h.items.push(a[1]); up(h.items, h.items.length - 1); return null; } case 'heapq.heappop': { const h = a[0] as PList; if (!h.items.length) err('index out of range', line, 'IndexError'); const top = h.items[0]; const last = h.items.pop() as V; if (h.items.length) { h.items[0] = last; sift(h.items, 0, line); } return top; } case 'heapq.heapify': { const h = a[0] as PList; for (let i = (h.items.length >> 1) - 1; i >= 0; i--) sift(h.items, i, line); return null; }
      case 'heapq.nlargest': return new PList(sortList(iter(a[1], line), new Map([['reverse', true]]), line).slice(0, num0())); case 'heapq.nsmallest': return new PList(sortList(iter(a[1], line), new Map(), line).slice(0, num0())); case 'sys.setrecursionlimit': return null;
      default: return err(`name '${n}' is not defined`, line, 'NameError'); } };
  const BUILTINS = new Set(['print', 'len', 'range', 'abs', 'int', 'float', 'str', 'repr', 'bool', 'min', 'max', 'sum', 'sorted', 'list', 'tuple', 'set', 'frozenset', 'dict', 'isinstance', 'round', 'enumerate', 'reversed', 'zip', 'any', 'all', 'map', 'filter', 'chr', 'ord', 'divmod', 'pow', 'input', 'super']);
  const lookup = (n: string, sc: Scope, line: number): V => { const v = sc.globals?.has(n) ? g.vars.get(n) : sc.get(n); if (v !== undefined) return v; if (BUILTINS.has(n)) return { builtin: n }; return err(`name '${n}' is not defined`, line, 'NameError'); };
  const getAttr = (o: V, name: string, line: number): V => {
    if (o instanceof PObj) { if (o.attrs.has(name)) return o.attrs.get(name)!; const m = findMethod(o.cls, name); if (m) return bindM(m, o); const c = findAttr(o.cls, name); if (c !== undefined) return c; if (name === '__class__') return o.cls; if (name === 'args' && excRoot(o.cls)) return new PList([], true); return err(`'${o.cls.name}' object has no attribute '${name}'`, line, 'AttributeError'); }
    if (o instanceof PClass) { const c = findAttr(o, name); if (c !== undefined) return c; const m = findMethod(o, name); if (m) return m; if (name === '__name__') return o.name; return err(`type object '${o.name}' has no attribute '${name}'`, line, 'AttributeError'); }
    if (o instanceof PModule) return moduleAttr(o, name, line);
    if (o instanceof PSuper) { const m = findMethod(o.cls, name); if (m) return bindM(m, o.self); return err(`'super' object has no attribute '${name}'`, line, 'AttributeError'); }
    if (o === null) return err(`'NoneType' object has no attribute '${name}': a None pointer was followed`, line, 'AttributeError');
    return err(`'${typeName(o)}' object has no attribute '${name}' (methods can only be called, like x.append(1))`, line, 'AttributeError');
  };
  const getItem = (o: V, i: V, line: number): V => {
    if (o instanceof PList) { const n = idx(i, line); const k = n < 0 ? o.items.length + n : n; if (k < 0 || k >= o.items.length) err(`${o.tuple ? 'tuple' : o.kind || 'list'} index out of range`, line, 'IndexError'); return o.items[k]; }
    if (o instanceof PDict) { hashable(i, line); const h = o.map.get(key2(i)); if (!h) { if (o.factory !== undefined && o.factory !== null) { const v = call(o.factory, [], line); o.map.set(key2(i), [i, v]); return v; } err(fmt(i, 1), line, 'KeyError'); } return h![1]; }
    if (typeof o === 'string') { const n = idx(i, line); const k = n < 0 ? o.length + n : n; if (k < 0 || k >= o.length) err('string index out of range', line, 'IndexError'); return o[k]; }
    if (o instanceof PObj) { const m = findMethod(o.cls, '__getitem__'); if (m) return call(bindM(m, o), [i], line); }
    return err(`'${typeName(o)}' object is not subscriptable`, line, 'TypeError');
  };
  const sliceOf = (o: V, lo: V | undefined, hi: V | undefined, st: V | undefined, line: number): V => {
    const len = o instanceof PList ? o.items.length : typeof o === 'string' ? o.length : err(`'${typeName(o)}' object is not subscriptable`, line, 'TypeError');
    const step = st === undefined || st === null ? 1 : idx(st, line); if (step === 0) err('slice step cannot be zero', line, 'ValueError'); const norm = (x: V | undefined, d: number, lowEnd: number, highEnd: number) => { if (x === undefined || x === null) return d; let n = idx(x, line); if (n < 0) n += len; return Math.min(Math.max(n, lowEnd), highEnd); };
    const idxs: number[] = []; if (step > 0) { const a0 = norm(lo, 0, 0, len), b0 = norm(hi, len, 0, len); for (let i = a0; i < b0; i += step) idxs.push(i); } else { const a0 = norm(lo, len - 1, -1, len - 1), b0 = norm(hi, -1, -1, len - 1); for (let i = a0; i > b0; i += step) idxs.push(i); }
    return o instanceof PList ? new PList(idxs.map(i => o.items[i]), o.tuple) : idxs.map(i => (o as string)[i]).join('');
  };
  const ev = (e: E, sc: Scope): V => { tick(); switch (e.k) {
    case 'num': return e.v; case 'str': return e.v; case 'none': return null; case 'bool0': return e.v; case 'name': return lookup(e.name, sc, e.line);
    case 'list': return new PList(e.items.map((x: E) => ev(x, sc))); case 'tuple': return new PList(e.items.map((x: E) => ev(x, sc)), true);
    case 'setlit': { const s = new PSet(); for (const x of e.items) { const v = ev(x, sc); hashable(v, e.line); s.map.set(key2(v), v); } return s; }
    case 'dict': { const d = new PDict(); e.keys.forEach((k: E, i: number) => { const kv = ev(k, sc); hashable(kv, e.line); d.map.set(key2(kv), [kv, ev(e.vals[i], sc)]); }); return d; }
    case 'neg': { const v = toNum(ev(e.a, sc), e.line); if (e.op === '~') return typeof v === 'bigint' ? ~v : err("bad operand type for unary ~: 'float'", e.line, 'TypeError'); return e.op === '-' ? -v : v; } case 'not': return !truthy(ev(e.a, sc));
    case 'bool': { const l = ev(e.a, sc); return e.op === 'and' ? (truthy(l) ? ev(e.b, sc) : l) : (truthy(l) ? l : ev(e.b, sc)); }
    case 'ifexp': return truthy(ev(e.test, sc)) ? ev(e.a, sc) : ev(e.b, sc); case 'lambda': return new PFunc('lambda', e.params, e.params.map(() => undefined), e.body, sc, true);
    case 'bin': return arith(e.op, ev(e.a, sc), ev(e.b, sc), e.line);
    case 'cmp': { let l = ev(e.first, sc); for (let i = 0; i < e.ops.length; i++) { const r = ev(e.rest[i], sc); const op = e.ops[i]; let ok: boolean;
      if (op === '==') ok = eqV(l, r); else if (op === '!=') ok = !eqV(l, r); else if (op === 'is') ok = l === r || (isNum(l) && isNum(r) && typeof l === typeof r && l === r); else if (op === 'is not') ok = !(l === r); else if (op === 'in' || op === 'not in') { const has = r instanceof PDict ? r.map.has(key2(l)) : r instanceof PSet ? r.map.has(key2(l)) : r instanceof PList ? r.items.some(x => eqV(x, l)) : typeof r === 'string' ? (typeof l === 'string' ? r.includes(l) : err("'in <string>' requires string as left operand", e.line, 'TypeError')) : err(`argument of type '${typeName(r)}' is not iterable`, e.line, 'TypeError'); ok = op === 'in' ? has : !has; }
      else { if (!((isNum(l) && isNum(r)) || (typeof l === 'string' && typeof r === 'string') || (l instanceof PList && r instanceof PList))) err(`'${op}' not supported between instances of '${typeName(l)}' and '${typeName(r)}'`, e.line, 'TypeError'); let c: number; try { c = cmpV(l, r); } catch (x) { if (x instanceof PyError) x.line = e.line; throw x; } ok = op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0; }
      if (!ok) return false; l = r; } return true; }
    case 'index': return getItem(ev(e.obj, sc), ev(e.idx, sc), e.line);
    case 'slice': return sliceOf(ev(e.obj, sc), e.lo ? ev(e.lo, sc) : undefined, e.hi ? ev(e.hi, sc) : undefined, e.step ? ev(e.step, sc) : undefined, e.line);
    case 'attr': return getAttr(ev(e.obj, sc), e.name, e.line);
    case 'fstr': return e.parts.map((p: string | { e: E; spec: string; conv: string }) => (typeof p === 'string' ? p : p.conv === 'r' ? fmt(ev(p.e, sc), 1) : p.spec ? fmtSpec(ev(p.e, sc), p.spec, e.line) : pystr(ev(p.e, sc)))).join('');
    case 'comp': { const lst: V[] = []; const dct = new PDict(); const st = new PSet(); const inner = new Scope(sc, sc.label); const loop = (ci: number) => { const c = e.clauses[ci]; for (const x of iter(ev(c.iter, inner), e.line)) { tick(); assign(c.target, x, inner); if (!c.conds.every((q: E) => truthy(ev(q, inner)))) continue; if (ci + 1 < e.clauses.length) loop(ci + 1); else if (e.kind === 'dict') { const k = ev(e.elt, inner); hashable(k, e.line); dct.map.set(key2(k), [k, ev(e.val, inner)]); } else if (e.kind === 'set') { const v = ev(e.elt, inner); hashable(v, e.line); st.map.set(key2(v), v); } else lst.push(ev(e.elt, inner)); } }; loop(0); return e.kind === 'dict' ? dct : e.kind === 'set' ? st : new PList(lst); }
    case 'call': { const kw = new Map<string, V>(); for (const k of e.kws ?? []) kw.set(k.name, ev(k.value, sc));
      if (e.fn.k === 'attr') { const o = ev(e.fn.obj, sc); const args = e.args.map((x: E) => ev(x, sc));
        if (o instanceof PObj || o instanceof PSuper) {
          const cls = o instanceof PObj ? o.cls : o.cls; const self = o instanceof PObj ? o : o.self;
          if (o instanceof PObj && o.attrs.has(e.fn.name)) return call(o.attrs.get(e.fn.name)!, args, e.line, kw);
          const m = findMethod(cls, e.fn.name); if (m) return call(bindM(m, self), args, e.line, kw);
          if (e.fn.name === '__init__' && (o instanceof PSuper)) { if (self && excRoot(self.cls)) self.attrs.set('args', new PList([...args], true)); return null; }
          return call(getAttr(o, e.fn.name, e.line), args, e.line, kw);
        }
        if (o === null) err(`'NoneType' object has no attribute '${e.fn.name}': a None pointer was followed`, e.line, 'AttributeError');
        if (o instanceof PModule) return call(moduleAttr(o, e.fn.name, e.line), args, e.line, kw);
        if (o instanceof PClass) return call(getAttr(o, e.fn.name, e.line), args, e.line, kw);
        const r = method(o, e.fn.name, args, e.line, kw); if (r === undefined) err(`'${typeName(o)}' object has no method '${e.fn.name}'`, e.line, 'AttributeError'); return r; }
      return call(ev(e.fn, sc), e.args.map((x: E) => ev(x, sc)), e.line, kw); }
  } return err('unsupported expression', e.line); };
  const setItem = (o: V, i: V, v: V, line: number) => {
    if (o instanceof PList && !o.tuple) { const n = idx(i, line); const k = n < 0 ? o.items.length + n : n; if (k < 0 || k >= o.items.length) err('list assignment index out of range', line, 'IndexError'); o.items[k] = v; return; }
    if (o instanceof PDict) { hashable(i, line); o.map.set(key2(i), [i, v]); return; } if (o instanceof PObj) { const m = findMethod(o.cls, '__setitem__'); if (m) { call(bindM(m, o), [i, v], line); return; } }
    err(`'${typeName(o)}' object does not support item assignment`, line, 'TypeError');
  };
  const assign = (t: E, v: V, sc: Scope) => {
    if (t.k === 'name') { if (sc.globals?.has(t.name)) { g.vars.set(t.name, v); return; } if (sc.nonlocals?.has(t.name)) { for (let p = sc.parent; p && p !== g; p = p.parent) if (p.vars.has(t.name)) { p.vars.set(t.name, v); return; } } sc.vars.set(t.name, v); return; }
    if (t.k === 'tuple') { const xs = iter(v, t.line); if (xs.length !== t.items.length) err(`cannot unpack: expected ${t.items.length} values, got ${xs.length}`, t.line, 'ValueError'); t.items.forEach((x: E, i: number) => assign(x, xs[i], sc)); return; }
    if (t.k === 'index') { setItem(ev(t.obj, sc), ev(t.idx, sc), v, t.line); return; }
    if (t.k === 'attr') { const o = ev(t.obj, sc); if (o === null) err(`cannot set attribute '${t.name}' on None`, t.line, 'AttributeError'); if (!(o instanceof PObj)) err('can only set attributes on objects', t.line, 'AttributeError'); o.attrs.set(t.name, v); return; }
    err('cannot assign to this expression', t.line, 'SyntaxError');
  };
  const loopBody = (body: S[], sc: Scope): 'break' | 'continue' | null => { try { run(body, sc); } catch (e) { if (e instanceof Brk) return 'break'; if (e instanceof Cont) return 'continue'; throw e; } return null; };
  const describe = (s: S): string => { const t = s.targets[0]; return t.k === 'name' ? `${t.name} is set` : t.k === 'attr' ? `pointer/field .${t.name} is set` : t.k === 'index' ? 'an element is set' : `line ${s.line}`; };
  const importMod = (name: string, line: number): PModule => { const root = name.split('.')[0]; if (!MODULES.includes(root)) err(`No module named '${name}' in the visualizer (available: ${MODULES.join(', ')})`, line, 'ImportError'); return new PModule(root); };
  const run = (body: S[], sc: Scope): void => { for (const s of body) { curLine = s.line; tick();
    switch (s.k) {
      case 'expr': ev(s.value, sc); snapshot(`line ${s.line}`); break; case 'pass': break;
      case 'global': (sc.globals ??= new Set()); for (const nm of s.names) sc.globals.add(nm); break; case 'nonlocal': (sc.nonlocals ??= new Set()); for (const nm of s.names) sc.nonlocals.add(nm); break;
      case 'import': for (const it of s.items) sc.vars.set(it.as, importMod(it.mod, s.line)); break;
      case 'from': { const m = importMod(s.mod, s.line); for (const it of s.names) sc.vars.set(it.as, moduleAttr(m, it.name, s.line)); break; }
      case 'assign': { const v = ev(s.value, sc); for (const t of s.targets) assign(t, v, sc); snapshot(describe(s)); break; }
      case 'aug': { const cur = ev(s.target, sc); const rhs = ev(s.value, sc); if (s.op === '+' && cur instanceof PList && !cur.tuple) cur.items.push(...iter(rhs, s.line)); else if (cur instanceof PSet && ['|', '&', '-', '^'].includes(s.op) && rhs instanceof PSet) { const r = arith(s.op, cur, rhs, s.line) as PSet; cur.map = r.map; } else assign(s.target, arith(s.op, cur, rhs, s.line), sc); snapshot(`line ${s.line}`); break; }
      case 'del': for (const t of s.targets) { if (t.k === 'name') { if (!sc.vars.delete(t.name)) err(`name '${t.name}' is not defined`, s.line, 'NameError'); } else if (t.k === 'index') { const o = ev(t.obj, sc), i = ev(t.idx, sc); if (o instanceof PList && !o.tuple) { const n = idx(i, s.line); const k = n < 0 ? o.items.length + n : n; if (k < 0 || k >= o.items.length) err('list assignment index out of range', s.line, 'IndexError'); o.items.splice(k, 1); } else if (o instanceof PDict) { if (!o.map.delete(key2(i))) err(fmt(i, 1), s.line, 'KeyError'); } else err(`'${typeName(o)}' object doesn't support item deletion`, s.line, 'TypeError'); } else err('cannot delete this expression', s.line, 'SyntaxError'); } snapshot(`line ${s.line}`); break;
      case 'assert': if (!truthy(ev(s.test, sc))) { const m = s.msg ? pystr(ev(s.msg, sc)) : ''; err(m, s.line, 'AssertionError'); } break;
      case 'raise': { if (!s.value) { const cur = excStack[excStack.length - 1]; if (!cur) err('No active exception to reraise', s.line, 'RuntimeError'); throw new PyError(excText(cur), s.line, cur.cls.name, cur); }
        let v = ev(s.value, sc); if (v instanceof PClass) v = call(v, [], s.line); if (!(v instanceof PObj) || !excRoot(v.cls)) err('exceptions must derive from BaseException', s.line, 'TypeError'); throw new PyError(excText(v), s.line, v.cls.name, v); }
      case 'try': {
        try {
          let raised = false;
          try { run(s.body, sc); }
          catch (e) {
            if (!(e instanceof PyError)) throw e; raised = true; const exc = excObj(e); let handled = false;
            for (const h of s.handlers) { const spec = h.type ? ev(h.type, sc) : null; const hit = !h.type || (spec instanceof PClass ? isSub(exc.cls, spec) : spec instanceof PList ? spec.items.some(c => c instanceof PClass && isSub(exc.cls, c)) : false);
              if (hit) { handled = true; if (h.name) sc.vars.set(h.name, exc); excStack.push(exc); curLine = h.line; snapshot(`except ${exc.cls.name}: ${excText(exc) || 'handled'}`); try { run(h.body, sc); } finally { excStack.pop(); } break; } }
            if (!handled) throw e;
          }
          if (!raised && s.orelse.length) run(s.orelse, sc);
        } finally { if (s.fin.length) run(s.fin, sc); }
        break; }
      case 'if': snapshot(`if: checking the condition on line ${s.line}`); if (truthy(ev(s.test, sc))) run(s.body, sc); else run(s.orelse, sc); break;
      case 'while': { let broke = false; for (;;) { curLine = s.line; if (!truthy(ev(s.test, sc))) break; snapshot('while: condition is True'); const r = loopBody(s.body, sc); if (r === 'break') { broke = true; break; } } if (!broke && s.orelse.length) run(s.orelse, sc); break; }
      case 'for': { const xs = iter(ev(s.iter, sc), s.line); let broke = false; for (const x of xs) { curLine = s.line; assign(s.target, x, sc); snapshot(`for: next item ${fmt(x, 1)}`); const r = loopBody(s.body, sc); if (r === 'break') { broke = true; break; } } if (!broke && s.orelse.length) run(s.orelse, sc); break; }
      case 'def': sc.vars.set(s.name, new PFunc(s.name, s.params, s.defs.map((d: E | null) => (d ? ev(d, sc) : undefined)), s.body, sc)); break;
      case 'class': { const base = s.base ? ev(s.base, sc) : null; if (base !== null && !(base instanceof PClass)) err('class base must be a class', s.line, 'TypeError'); const cs = new Scope(sc); run(s.body, cs); const ms = new Map<string, PFunc>(); const cls = new PClass(s.name, ms, base); for (const [k, v] of cs.vars) { if (v instanceof PFunc) { v.owner = cls; ms.set(k, v); } else cls.cattrs.set(k, v); } sc.vars.set(s.name, cls); break; }
      case 'return': { const v = s.value ? ev(s.value, sc) : null; snapshot(`return ${fmt(v, 1)}`); throw new Ret(v); } case 'break': throw new Brk(); case 'continue': throw new Cont();
    } } };
  try { const prog = new Parser(lex(src)).program(); snapshot('start'); run(prog, g); snapshot('done'); }
  catch (e) {
    if (e instanceof Stop) { /* limit reached */ }
    else if (e instanceof PyError) { const last = steps[steps.length - 1]; if (last) steps.push({ ...last, n: steps.length, line: e.line || last.line, note: 'Error: ' + describeError(e), changed: [] }); return { steps, error: { message: e.message, line: e.line || last?.line || 1, type: e.type }, truncated, output: last?.out ?? out }; }
    else if (e instanceof Ret || e instanceof Brk || e instanceof Cont) { /* stray at top level */ }
    else { const last = steps[steps.length - 1]; const isStack = e instanceof RangeError; const msg = isStack ? 'maximum recursion depth exceeded' : 'Could not run this code (' + String((e as Error)?.message ?? e).slice(0, 80) + '). Check the syntax near the highlighted line.'; return { steps, error: { message: msg, line: last?.line ?? 1, type: isStack ? 'RecursionError' : undefined }, truncated, output: last?.out ?? out }; }
  }
  return { steps, truncated, output: out };
}
export const cppToPythonPrompt = (code: string) => `Translate this C++ data-structure code into equivalent simple Python that uses only: classes with __init__, lists, dicts, sets, while/for loops, if/else, functions, and None for null pointers (a node pointer becomes an attribute that is None or another object). Keep the same variable and field names. Add a small main section that exercises the code and prints the result. Return ONLY the Python code.\n\n${code}`;
export const EXAMPLES: { name: string; code: string }[] = [
  { name: 'Linked list: reverse', code: `class Node:\n    def __init__(self, val):\n        self.val = val\n        self.next = None\n\nhead = Node(1)\nhead.next = Node(2)\nhead.next.next = Node(3)\n\nprev = None\ncur = head\nwhile cur:\n    nxt = cur.next\n    cur.next = prev\n    prev = cur\n    cur = nxt\nhead = prev\nprint(head.val)\n` },
  { name: 'Dynamic array: grow', code: `class DynArray:\n    def __init__(self):\n        self.cap = 2\n        self.size = 0\n        self.data = [0, 0]\n    def push(self, x):\n        if self.size == self.cap:\n            new = [0] * (self.cap * 2)\n            for i in range(self.size):\n                new[i] = self.data[i]\n            self.data = new\n            self.cap = self.cap * 2\n        self.data[self.size] = x\n        self.size += 1\n\na = DynArray()\nfor v in [10, 20, 30, 40, 50]:\n    a.push(v)\nprint(a.size, a.cap)\n` },
  { name: 'Binary search tree: insert', code: `class T:\n    def __init__(self, k):\n        self.k = k\n        self.left = None\n        self.right = None\n\ndef insert(root, k):\n    if root is None:\n        return T(k)\n    if k < root.k:\n        root.left = insert(root.left, k)\n    else:\n        root.right = insert(root.right, k)\n    return root\n\nroot = None\nfor k in [5, 3, 8, 1, 4]:\n    root = insert(root, k)\nprint(root.k)\n` },
  { name: 'Bubble sort', code: `a = [5, 2, 9, 1]\nn = len(a)\nfor i in range(n):\n    for j in range(n - 1 - i):\n        if a[j] > a[j + 1]:\n            a[j], a[j + 1] = a[j + 1], a[j]\nprint(a)\n` },
  { name: 'BFS with a queue', code: `from collections import deque\ngraph = {1: [2, 3], 2: [4], 3: [4], 4: []}\nseen = {1}\nq = deque([1])\norder = []\nwhile q:\n    n = q.popleft()\n    order.append(n)\n    for m in graph[n]:\n        if m not in seen:\n            seen.add(m)\n            q.append(m)\nprint(order)\n` },
  { name: 'Exceptions: try / except', code: `def safe_div(a, b):\n    try:\n        return a / b\n    except ZeroDivisionError:\n        return None\n    finally:\n        print("done", a, b)\n\nprint(safe_div(7, 2))\nprint(safe_div(1, 0))\n` },
];
