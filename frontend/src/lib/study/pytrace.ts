/* Algorithm & pointer visualizer: a small, safe Python-subset interpreter that records every step (variables, the objects they point to,
   output). Nothing is eval()'d: code is tokenised, parsed and run by this file with step / recursion limits. Supported: ints, floats, strings,
   lists, dicts, None, classes with __init__ and methods (nodes, linked lists, trees), functions and recursion, if/elif/else, while, for,
   break/continue/return, tuple unpacking, slicing, and common builtins. C++ is NOT executed: use cppToPythonPrompt with an AI and review the result. */
export class PyError extends Error { line: number; constructor(msg: string, line: number) { super(msg); this.line = line; } }
type Tok = { t: 'num' | 'str' | 'fstr' | 'name' | 'op' | 'nl' | 'indent' | 'dedent' | 'eof'; v: string; line: number };
const KW = new Set(['def', 'class', 'return', 'if', 'elif', 'else', 'while', 'for', 'in', 'not', 'and', 'or', 'is', 'None', 'True', 'False', 'break', 'continue', 'pass', 'lambda', 'import', 'from', 'global']);
function lex(src: string, line0 = 1): Tok[] {
  const out: Tok[] = []; const ind = [0]; let depth = 0; const lines = src.replace(/\t/g, '    ').split('\n');
  for (let ln = 0; ln < lines.length; ln++) {
    const L = lines[ln]; let i = 0; const line = ln + line0;
    if (!depth) { if (!L.trim() || L.trim().startsWith('#')) continue; let sp = 0; while (L[sp] === ' ') sp++; if (sp > ind[ind.length - 1]) { ind.push(sp); out.push({ t: 'indent', v: '', line }); } else while (sp < ind[ind.length - 1]) { ind.pop(); out.push({ t: 'dedent', v: '', line }); } if (sp !== ind[ind.length - 1]) throw new PyError('inconsistent indentation', line); i = sp; }
    while (i < L.length) {
      const c = L[i];
      if (c === ' ') { i++; continue; } if (c === '#') break;
      if (/\d/.test(c) || (c === '.' && /\d/.test(L[i + 1] ?? ''))) { const m = L.slice(i).match(/^(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)/i)!; out.push({ t: 'num', v: m[0], line }); i += m[0].length; continue; }
      if ((c === 'f' || c === 'F') && (L[i + 1] === '"' || L[i + 1] === "'")) { const q = L[i + 1]; let j = i + 2, s = ''; while (j < L.length && L[j] !== q) { if (L[j] === '\\') { j++; s += ({ n: '\n', t: '\t' } as Record<string, string>)[L[j]] ?? L[j]; } else s += L[j]; j++; } if (j >= L.length) throw new PyError('unterminated string', line); out.push({ t: 'fstr', v: s, line }); i = j + 1; continue; }
      if (/[A-Za-z_]/.test(c)) { const m = L.slice(i).match(/^\w+/)!; out.push({ t: 'name', v: m[0], line }); i += m[0].length; continue; }
      if (c === '"' || c === "'") { let j = i + 1, s = ''; while (j < L.length && L[j] !== c) { if (L[j] === '\\') { j++; s += ({ n: '\n', t: '\t' } as Record<string, string>)[L[j]] ?? L[j]; } else s += L[j]; j++; } if (j >= L.length) throw new PyError('unterminated string', line); out.push({ t: 'str', v: s, line }); i = j + 1; continue; }
      const three = L.slice(i, i + 3), two = L.slice(i, i + 2); const op = ['**=', '//=', '...'].includes(three) ? three : ['==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '//', '**', '->'].includes(two) ? two : c;
      if (!'+-*/%=<>!()[]{},:.;@'.includes(op[0])) throw new PyError(`unexpected character ${JSON.stringify(c)}`, line);
      if ('([{'.includes(op)) depth++; if (')]}'.includes(op)) depth = Math.max(0, depth - 1); out.push({ t: 'op', v: op, line }); i += op.length;
    }
    if (!depth) out.push({ t: 'nl', v: '', line });
  }
  while (ind.length > 1) { ind.pop(); out.push({ t: 'dedent', v: '', line: lines.length }); } out.push({ t: 'eof', v: '', line: lines.length }); return out;
}
/* ---------------- AST ---------------- */
type E = { k: string; line: number; [x: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type S = E;
class Parser {
  p = 0; ts: Tok[]; constructor(ts: Tok[]) { this.ts = ts; }
  get t() { return this.ts[Math.min(this.p, this.ts.length - 1)]; } is(v: string) { return (this.t.t === 'op' || this.t.t === 'name') && this.t.v === v; } eat(v: string) { if (this.is(v)) { this.p++; return true; } return false; }
  need(v: string) { if (!this.eat(v)) throw new PyError(`expected '${v}' but found '${this.t.v || this.t.t}'`, this.t.line); }
  program(): S[] { const b: S[] = []; while (this.t.t !== 'eof') { if (this.t.t === 'nl') { this.p++; continue; } b.push(...this.stmt()); } return b; }
  block(): S[] { this.need(':'); if (this.t.t !== 'nl') return this.simple(); this.p++; if ((this.t.t as string) !== 'indent') throw new PyError('expected an indented block', this.t.line); this.p++; const b: S[] = []; while ((this.t.t as string) !== 'dedent' && (this.t.t as string) !== 'eof') { if (this.t.t === 'nl') { this.p++; continue; } b.push(...this.stmt()); } this.p++; return b; }
  simple(): S[] { const o: S[] = [this.small()]; while (this.eat(';')) { if (this.t.t === 'nl') break; o.push(this.small()); } if (this.t.t === 'nl') this.p++; return o; }
  stmt(): S[] {
    const line = this.t.line;
    if (this.eat('if')) { const test = this.expr(); const body = this.block(); const orelse: S[] = []; let cur = orelse; while (this.is('elif')) { const l = this.t.line; this.p++; const t2 = this.expr(); const b2 = this.block(); const n: S = { k: 'if', line: l, test: t2, body: b2, orelse: [] }; cur.push(n); cur = n.orelse; } if (this.eat('else')) cur.push(...this.block()); return [{ k: 'if', line, test, body, orelse }]; }
    if (this.eat('while')) { const test = this.expr(); return [{ k: 'while', line, test, body: this.block() }]; }
    if (this.eat('for')) { const target = this.target(); this.need('in'); const it = this.exprList(); return [{ k: 'for', line, target, iter: it, body: this.block() }]; }
    if (this.eat('def')) { const name = this.t.v; this.p++; this.need('('); const params: string[] = [], defs: (E | null)[] = []; while (!this.is(')')) { if (this.t.t !== 'name') throw new PyError('bad parameter list', this.t.line); params.push(this.t.v); this.p++; defs.push(this.eat('=') ? this.expr() : null); if (!this.eat(',')) break; } this.need(')'); if (this.eat('->')) this.expr(); return [{ k: 'def', line, name, params, defs, body: this.block() }]; }
    if (this.eat('class')) { const name = this.t.v; this.p++; if (this.eat('(')) { while (!this.is(')')) this.p++; this.p++; } return [{ k: 'class', line, name, body: this.block() }]; }
    return this.simple();
  }
  small(): S {
    const line = this.t.line;
    if (this.eat('return')) return { k: 'return', line, value: this.t.t === 'nl' || this.is(';') ? null : this.exprList() };
    if (this.eat('break')) return { k: 'break', line }; if (this.eat('continue')) return { k: 'continue', line }; if (this.eat('pass')) return { k: 'pass', line };
    if (this.eat('global')) { const names: string[] = []; while (this.t.t === 'name') { names.push(this.t.v); this.p++; if (!this.eat(',')) break; } return { k: 'global', line, names }; }
    if (this.is('import') || this.is('from')) { while (this.t.t !== 'nl' && this.t.t !== 'eof') this.p++; return { k: 'pass', line }; }
    const e = this.exprList();
    for (const op of ['+=', '-=', '*=', '/=', '//=', '%=', '**=']) if (this.eat(op)) return { k: 'aug', line, target: e, op: op.slice(0, -1), value: this.exprList() };
    if (this.is('=')) { const targets = [e]; let v = e; while (this.eat('=')) { v = this.exprList(); targets.push(v); } targets.pop(); return { k: 'assign', line, targets, value: v }; }
    return { k: 'expr', line, value: e };
  }
  target(): E { const line = this.t.line; const first = this.postfix(); if (this.is(',')) { const items = [first]; while (this.eat(',')) { if (this.is('in')) break; items.push(this.postfix()); } return { k: 'tuple', line, items }; } return first; }
  exprList(): E { const line = this.t.line; const first = this.expr(); if (!this.is(',')) return first; const items = [first]; while (this.eat(',')) { if (this.t.t === 'nl' || this.is('=') || this.is(')') || this.is(':')) break; items.push(this.expr()); } return { k: 'tuple', line, items }; }
  expr(): E { if (this.is('lambda')) { const line = this.t.line; this.p++; const params: string[] = []; while (!this.is(':')) { if (this.t.t !== 'name') throw new PyError('bad lambda parameters', this.t.line); params.push(this.t.v); this.p++; this.eat(','); } this.p++; return { k: 'lambda', line, params, body: this.expr() }; } const c = this.or(); if (this.is('if')) { const line = this.t.line; this.p++; const test = this.or(); this.need('else'); return { k: 'ifexp', line, test, a: c, b: this.expr() }; } return c; }
  or(): E { let l = this.and(); while (this.is('or')) { const line = this.t.line; this.p++; l = { k: 'bool', line, op: 'or', a: l, b: this.and() }; } return l; }
  and(): E { let l = this.not(); while (this.is('and')) { const line = this.t.line; this.p++; l = { k: 'bool', line, op: 'and', a: l, b: this.not() }; } return l; }
  not(): E { if (this.is('not')) { const line = this.t.line; this.p++; return { k: 'not', line, a: this.not() }; } return this.cmp(); }
  cmp(): E { let l = this.arith(); const ops: string[] = [], rest: E[] = []; for (;;) { let op = ''; if (['==', '!=', '<', '>', '<=', '>='].includes(this.t.v) && this.t.t === 'op') op = this.t.v; else if (this.is('in')) op = 'in'; else if (this.is('not') && this.ts[this.p + 1]?.v === 'in') { op = 'not in'; this.p++; } else if (this.is('is')) { op = this.ts[this.p + 1]?.v === 'not' ? (this.p++, 'is not') : 'is'; } else break; this.p++; ops.push(op); rest.push(this.arith()); } return ops.length ? { k: 'cmp', line: l.line, first: l, ops, rest } : l; }
  arith(): E { let l = this.term(); while ((this.is('+') || this.is('-')) && this.t.t === 'op') { const op = this.t.v, line = this.t.line; this.p++; l = { k: 'bin', line, op, a: l, b: this.term() }; } return l; }
  term(): E { let l = this.unary(); while (this.t.t === 'op' && ['*', '/', '//', '%'].includes(this.t.v)) { const op = this.t.v, line = this.t.line; this.p++; l = { k: 'bin', line, op, a: l, b: this.unary() }; } return l; }
  unary(): E { if (this.t.t === 'op' && (this.t.v === '-' || this.t.v === '+')) { const op = this.t.v, line = this.t.line; this.p++; return { k: 'neg', line, op, a: this.unary() }; } return this.power(); }
  power(): E { const l = this.postfix(); if (this.is('**')) { const line = this.t.line; this.p++; return { k: 'bin', line, op: '**', a: l, b: this.unary() }; } return l; }
  postfix(): E {
    let e = this.atom();
    for (;;) {
      const line = this.t.line;
      if (this.eat('(')) { const args: E[] = [], kws: { name: string; value: E }[] = []; while (!this.is(')')) { if (this.t.t === 'name' && this.ts[this.p + 1]?.t === 'op' && this.ts[this.p + 1].v === '=') { const name = this.t.v; this.p += 2; kws.push({ name, value: this.expr() }); } else args.push(this.comp(this.expr())); if (!this.eat(',')) break; } this.need(')'); e = { k: 'call', line, fn: e, args, kws }; }
      else if (this.eat('[')) { let lo: E | null = null, hi: E | null = null, slice = false; if (!this.is(':')) lo = this.expr(); if (this.eat(':')) { slice = true; if (!this.is(']')) hi = this.expr(); } this.need(']'); e = slice ? { k: 'slice', line, obj: e, lo, hi } : { k: 'index', line, obj: e, idx: lo }; }
      else if (this.eat('.')) { const name = this.t.v; this.p++; e = { k: 'attr', line, obj: e, name }; } else break;
    } return e;
  }
  /** [x for ...] / generator argument: turns `elt for t in it if c` into a list comprehension node */
  comp(elt: E): E {
    if (!this.is('for')) return elt; const line = elt.line; const clauses: { target: E; iter: E; conds: E[] }[] = [];
    while (this.eat('for')) { const target = this.target(); this.need('in'); const iter = this.or(); const conds: E[] = []; while (this.eat('if')) conds.push(this.or()); clauses.push({ target, iter, conds }); }
    return { k: 'comp', line, elt, clauses };
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
    if (t.t === 'num') { this.p++; return { k: 'num', line, v: Number(t.v), float: /[.e]/i.test(t.v) }; }
    if (t.t === 'fstr') { this.p++; return this.fstring(t.v, line); }
    if (t.t === 'str') { this.p++; let s = t.v; while (this.t.t === 'str') { s += this.t.v; this.p++; } return { k: 'str', line, v: s }; }
    if (t.t === 'name') { this.p++; if (t.v === 'None') return { k: 'none', line }; if (t.v === 'True' || t.v === 'False') return { k: 'bool0', line, v: t.v === 'True' }; if (KW.has(t.v)) throw new PyError(`unexpected '${t.v}'`, line); return { k: 'name', line, name: t.v }; }
    if (this.eat('(')) { if (this.eat(')')) return { k: 'tuple', line, items: [] }; const e = this.comp(this.exprList()); this.need(')'); return e; }
    if (this.eat('[')) { const items: E[] = []; while (!this.is(']')) { const e = this.expr(); if (this.is('for') && !items.length) { const c = this.comp(e); this.need(']'); return c; } items.push(e); if (!this.eat(',')) break; } this.need(']'); return { k: 'list', line, items }; }
    if (this.eat('{')) { const keys: E[] = [], vals: E[] = []; while (!this.is('}')) { keys.push(this.expr()); this.need(':'); vals.push(this.expr()); if (!this.eat(',')) break; } this.need('}'); return { k: 'dict', line, keys, vals }; }
    throw new PyError(`unexpected '${t.v || t.t}'`, line);
  }
}
/* ---------------- values ---------------- */
let NEXT = 1;
class PList { id = NEXT++; items: V[]; tuple: boolean; constructor(items: V[], tuple = false) { this.items = items; this.tuple = tuple; } }
class PDict { id = NEXT++; map = new Map<string, [V, V]>(); }
class PClass { id = NEXT++; name: string; methods: Map<string, PFunc>; constructor(name: string, methods: Map<string, PFunc>) { this.name = name; this.methods = methods; } }
class PObj { id = NEXT++; attrs = new Map<string, V>(); cls: PClass; constructor(cls: PClass) { this.cls = cls; } }
class PFunc { id = NEXT++; name: string; params: string[]; defs: (V | undefined)[]; body: S[] | E; closure: Scope | null; isLambda: boolean; self?: PObj; constructor(name: string, params: string[], defs: (V | undefined)[], body: S[] | E, closure: Scope | null, isLambda = false) { this.name = name; this.params = params; this.defs = defs; this.body = body; this.closure = closure; this.isLambda = isLambda; } }
type V = number | string | boolean | null | PList | PDict | PObj | PClass | PFunc | { builtin: string };
class Scope { vars = new Map<string, V>(); globals?: Set<string>; parent: Scope | null; label: string; constructor(parent: Scope | null = null, label = 'global') { this.parent = parent; this.label = label; } get(n: string): V | undefined { return this.vars.has(n) ? this.vars.get(n) : this.parent?.get(n); } }
class Ret { v: V; constructor(v: V) { this.v = v; } } class Brk {} class Cont {}
const isRef = (v: V): v is PList | PDict | PObj | PClass | PFunc => typeof v === 'object' && v !== null && !('builtin' in v);
const key = (v: V): string => (isRef(v) ? (v instanceof PList && v.tuple ? 't(' + v.items.map(key).join(',') + ')' : 'id' + v.id) : typeof v + ':' + String(v));
export const fmt = (v: V, depth = 0): string => v === null ? 'None' : v === true ? 'True' : v === false ? 'False' : typeof v === 'string' ? (depth ? `'${v}'` : v) : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(+v.toPrecision(12))) : v instanceof PList ? (v.tuple ? '(' : '[') + v.items.map(x => fmt(x, 1)).join(', ') + (v.tuple && v.items.length === 1 ? ',)' : v.tuple ? ')' : ']') : v instanceof PDict ? '{' + [...v.map.values()].map(([k, x]) => `${fmt(k, 1)}: ${fmt(x, 1)}`).join(', ') + '}' : v instanceof PObj ? `<${v.cls.name} object>` : v instanceof PClass ? `<class ${v.name}>` : v instanceof PFunc ? `<function ${v.name}>` : '<builtin>';
const truthy = (v: V): boolean => v === null ? false : typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : typeof v === 'string' ? v.length > 0 : v instanceof PList ? v.items.length > 0 : v instanceof PDict ? v.map.size > 0 : true;

const cmpV = (a: V, b: V): number => { if (a instanceof PList && b instanceof PList) { for (let i = 0; i < Math.min(a.items.length, b.items.length); i++) { const c = cmpV(a.items[i], b.items[i]); if (c) return c; } return a.items.length - b.items.length; } return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0; };
function fmtSpec(v: V, spec: string, line: number): string {
  if (!spec) return fmt(v); const m = spec.match(/^([<>^])?(\d+)?(,)?(?:\.(\d+))?([dfs%e]?)$/); if (!m) throw new PyError(`unsupported format spec '${spec}'`, line);
  let out: string; const [, al, w, comma, prec, ty] = m;
  if (ty === 'f' || ty === '%' || ty === 'e') { if (typeof v !== 'number') throw new PyError('format spec needs a number', line); out = ty === 'e' ? v.toExponential(prec ? +prec : 6) : (ty === '%' ? v * 100 : v).toFixed(prec ? +prec : 6) + (ty === '%' ? '%' : ''); }
  else if (ty === 'd') { if (typeof v !== 'number' || !Number.isInteger(v)) throw new PyError("format 'd' needs an integer", line); out = String(v); }
  else if (prec && typeof v === 'number') out = String(+v.toPrecision(+prec)); else out = fmt(v);
  if (comma && typeof v === 'number') out = out.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (w) { const n = +w; out = (al ?? (typeof v === 'number' ? '>' : '<')) === '<' ? out.padEnd(n) : al === '^' ? out.padStart(Math.floor((n + out.length) / 2)).padEnd(n) : out.padStart(n); }
  return out;
}
/* ---------------- trace model ---------------- */
export type Cell = { prim: string } | { ref: number };
export interface HeapObj { id: number; type: 'list' | 'tuple' | 'dict' | 'object' | 'class' | 'function'; label: string; items: { k: string; v: Cell }[] }
export interface Frame { name: string; vars: { name: string; v: Cell }[] }
export interface Step { n: number; line: number; frames: Frame[]; heap: HeapObj[]; out: string; note: string; changed: string[] }
export interface Trace { steps: Step[]; error?: { message: string; line: number }; truncated: boolean; output: string }
const MAX_STEPS = 1500, MAX_DEPTH = 80, MAX_LOOP_WORK = 200000, CAP = 40;

export function trace(src: string, o: { maxSteps?: number } = {}): Trace {
  const max = o.maxSteps ?? MAX_STEPS; NEXT = 1; const steps: Step[] = []; let out = ''; let work = 0; let truncated = false; let curLine = 0; const stack: Scope[] = []; let prevSig = new Map<string, string>();
  const g = new Scope(null, 'global'); stack.push(g);
  class Stop extends Error {}
  const cell = (v: V): Cell => (isRef(v) ? { ref: v.id } : { prim: fmt(v, 1) });
  const snapshot = (note: string): void => {
    const heap = new Map<number, HeapObj>(); const walk = (v: V) => { if (!isRef(v) || heap.has(v.id)) return;
      if (v instanceof PList) { const shown = v.items.slice(0, CAP); const items = shown.map((x, i) => ({ k: String(i), v: cell(x) })); if (v.items.length > CAP) items.push({ k: '…', v: { prim: `+${v.items.length - CAP} more` } }); heap.set(v.id, { id: v.id, type: v.tuple ? 'tuple' : 'list', label: v.tuple ? 'tuple' : 'list', items }); shown.forEach(walk); }
      else if (v instanceof PDict) { const all = [...v.map.values()]; const shown = all.slice(0, CAP); const items = shown.map(([k, x]) => ({ k: fmt(k, 1), v: cell(x) })); if (all.length > CAP) items.push({ k: '…', v: { prim: `+${all.length - CAP} more` } }); heap.set(v.id, { id: v.id, type: 'dict', label: 'dict', items }); for (const [k, x] of shown) { walk(k); walk(x); } }
      else if (v instanceof PObj) { heap.set(v.id, { id: v.id, type: 'object', label: v.cls.name, items: [...v.attrs].map(([k, x]) => ({ k, v: cell(x) })) }); for (const x of v.attrs.values()) walk(x); }
      else if (v instanceof PClass) heap.set(v.id, { id: v.id, type: 'class', label: `class ${v.name}`, items: [] }); else if (v instanceof PFunc) heap.set(v.id, { id: v.id, type: 'function', label: `function ${v.name}`, items: [] }); };
    const frames: Frame[] = stack.map(s => ({ name: s.label, vars: [...s.vars].filter(([, v]) => !(v instanceof PClass) && !(v instanceof PFunc && !v.self && s === g)).map(([name, v]) => { walk(v); return { name, v: cell(v) }; }) }));
    const sig = new Map<string, string>(); for (const f of frames) for (const v of f.vars) sig.set(f.name + '.' + v.name, JSON.stringify(v.v)); for (const h of heap.values()) for (const it of h.items) sig.set(`#${h.id}[${it.k}]`, JSON.stringify(it.v));
    const changed = [...sig].filter(([k, v]) => prevSig.get(k) !== v).map(([k]) => k); prevSig = sig;
    steps.push({ n: steps.length, line: curLine, frames, heap: [...heap.values()].filter(h => h.type !== 'class' && h.type !== 'function'), out, note, changed });
    if (steps.length >= max) { truncated = true; throw new Stop(); }
  };
  function err(m: string, line = curLine): never { throw new PyError(m, line); }
  const num = (v: V, line: number): number => { if (typeof v === 'boolean') return v ? 1 : 0; if (typeof v !== 'number') err(`unsupported operand type: ${typeName(v)}`, line); return v as number; };
  const typeName = (v: V) => v === null ? 'NoneType' : typeof v === 'number' ? (Number.isInteger(v) ? 'int' : 'float') : typeof v === 'string' ? 'str' : typeof v === 'boolean' ? 'bool' : v instanceof PList ? (v.tuple ? 'tuple' : 'list') : v instanceof PDict ? 'dict' : v instanceof PObj ? v.cls.name : 'function';
  const eq = (a: V, b: V): boolean => a === b || (isRef(a) && isRef(b) && a instanceof PList && b instanceof PList && a.items.length === b.items.length && a.items.every((x, i) => eq(x, b.items[i])));
  const iter = (v: V, line: number): V[] => v instanceof PList ? [...v.items] : typeof v === 'string' ? [...v] : v instanceof PDict ? [...v.map.values()].map(([k]) => k) : err(`'${typeName(v)}' object is not iterable`, line);
  const tick = () => { if (++work > MAX_LOOP_WORK) { truncated = true; throw new Stop(); } };

  const call = (f: V, args: V[], line: number, kw: Map<string, V> = new Map()): V => {
    if (f instanceof PClass) { const obj = new PObj(f); const init = f.methods.get('__init__'); if (init) call(Object.assign(Object.create(PFunc.prototype), init, { self: obj }), args, line, kw); else if (args.length || kw.size) err(`${f.name}() takes no arguments`, line); return obj; }
    if (f && typeof f === 'object' && 'builtin' in f) return builtin(f.builtin, args, line, kw);
    if (!(f instanceof PFunc)) return err(`'${typeName(f)}' object is not callable`, line);
    if (stack.length > MAX_DEPTH) err('maximum recursion depth exceeded (RecursionError)', line);
    const sc = new Scope(f.closure ?? g, f.name + '()'); const params = f.self ? f.params.slice(1) : f.params; const defs = f.self ? f.defs.slice(1) : f.defs;
    if (f.self) sc.vars.set(f.params[0], f.self); if (args.length > params.length) err(`${f.name}() takes ${params.length} arguments but ${args.length} were given`, line);
    for (const k of kw.keys()) if (!params.includes(k)) err(`${f.name}() got an unexpected keyword argument '${k}'`, line);
    params.forEach((p, i) => { const v = i < args.length ? args[i] : kw.has(p) ? kw.get(p) : defs[i]; if (v === undefined) err(`${f.name}() missing argument '${p}'`, line); sc.vars.set(p, v as V); });
    if (f.isLambda) { stack.push(sc); try { return ev(f.body as E, sc); } finally { stack.pop(); } }
    stack.push(sc); snapshot(`call ${f.name}(${args.map(a => fmt(a, 1)).join(', ')})`);
    try { run(f.body as S[], sc); } catch (e) { if (e instanceof Ret) { return e.v; } throw e; } finally { stack.pop(); }
    return null;
  };
  const method = (obj: V, name: string, args: V[], line: number, kw: Map<string, V> = new Map()): V | undefined => {
    if (obj instanceof PList && !obj.tuple) { switch (name) {
      case 'append': obj.items.push(args[0]); return null; case 'pop': { if (!obj.items.length) err('pop from empty list', line); const i = args.length ? num(args[0], line) : obj.items.length - 1; return obj.items.splice(i < 0 ? obj.items.length + i : i, 1)[0]; }
      case 'insert': obj.items.splice(Math.min(Math.max(0, num(args[0], line)), obj.items.length), 0, args[1]); return null; case 'remove': { const i = obj.items.findIndex(x => eq(x, args[0])); if (i < 0) err('list.remove(x): x not in list', line); obj.items.splice(i, 1); return null; }
      case 'extend': obj.items.push(...iter(args[0], line)); return null; case 'reverse': obj.items.reverse(); return null; case 'index': { const i = obj.items.findIndex(x => eq(x, args[0])); if (i < 0) err('value is not in list', line); return i; }
      case 'sort': { const keyf = kw.get('key'); const keys = new Map<V, V>(); const kf = (x: V) => (keyf ? (keys.has(x) ? keys.get(x)! : (keys.set(x, call(keyf, [x], line)), keys.get(x)!)) : x); obj.items = [...obj.items].map((x, i) => ({ x, i, k: kf(x) })).sort((a, b) => cmpV(a.k, b.k) || a.i - b.i).map(o => o.x); if (truthy(kw.get('reverse') ?? false)) obj.items.reverse(); return null; } case 'copy': return new PList([...obj.items]); case 'count': return obj.items.filter(x => eq(x, args[0])).length; } }
    if (obj instanceof PList && obj.tuple && name === 'index') return obj.items.findIndex(x => eq(x, args[0]));
    if (obj instanceof PDict) { switch (name) { case 'keys': return new PList([...obj.map.values()].map(([k]) => k)); case 'values': return new PList([...obj.map.values()].map(([, v]) => v)); case 'items': return new PList([...obj.map.values()].map(([k, v]) => new PList([k, v], true)));
      case 'get': return obj.map.get(key(args[0]))?.[1] ?? (args[1] ?? null); case 'pop': { const e = obj.map.get(key(args[0])); if (!e) { if (args.length > 1) return args[1]; err(`KeyError: ${fmt(args[0], 1)}`, line); } obj.map.delete(key(args[0])); return e![1]; } } }
    if (typeof obj === 'string') { switch (name) { case 'upper': return obj.toUpperCase(); case 'lower': return obj.toLowerCase(); case 'split': return new PList(obj.split(args.length ? String(args[0]) : /\s+/).filter((x, _i, a) => args.length || a.length > 1 || x)); case 'join': return iter(args[0], line).map(x => String(x)).join(obj); case 'strip': return obj.trim(); case 'startswith': return obj.startsWith(String(args[0])); case 'endswith': return obj.endsWith(String(args[0])); case 'find': return obj.indexOf(String(args[0])); } }
    return undefined;
  };
  const builtin = (n: string, a: V[], line: number, kw: Map<string, V> = new Map()): V => { switch (n) {
    case 'print': { out += a.map(x => fmt(x)).join(kw.has('sep') ? fmt(kw.get('sep') as V) : ' ') + (kw.has('end') ? fmt(kw.get('end') as V) : '\n'); return null; } case 'len': { const x = a[0]; if (x instanceof PList) return x.items.length; if (x instanceof PDict) return x.map.size; if (typeof x === 'string') return x.length; return err(`object of type '${typeName(x)}' has no len()`, line); }
    case 'range': { const [s, e, st] = a.length === 1 ? [0, num(a[0], line), 1] : [num(a[0], line), num(a[1], line), a[2] === undefined ? 1 : num(a[2], line)]; if (!st) err('range() step must not be zero', line); const r: V[] = []; for (let i = s; st > 0 ? i < e : i > e; i += st) { r.push(i); if (r.length > 100000) err('range too large', line); } return new PList(r); }
    case 'abs': return Math.abs(num(a[0], line)); case 'int': return typeof a[0] === 'string' ? (Number.isNaN(parseInt(a[0], 10)) ? err(`invalid literal for int(): '${a[0]}'`, line) : parseInt(a[0], 10)) : Math.trunc(num(a[0], line)); case 'float': return Number(a[0] as number); case 'str': return fmt(a[0]); case 'bool': return truthy(a[0]);
    case 'min': case 'max': { const xs = a.length === 1 ? iter(a[0], line) : a; if (!xs.length) err(`${n}() arg is an empty sequence`, line); const kf = kw.get('key'); const k = (x: V) => (kf ? call(kf, [x], line) : x); return xs.reduce((m, x) => ((n === 'min' ? cmpV(k(x), k(m)) < 0 : cmpV(k(x), k(m)) > 0) ? x : m)); }
    case 'sum': return iter(a[0], line).reduce((s: number, x) => s + num(x, line), 0); case 'sorted': { const lst = new PList([...iter(a[0], line)]); method(lst, 'sort', [], line, kw); return lst; } case 'list': return new PList(a.length ? iter(a[0], line) : []); case 'isinstance': return a[0] instanceof PObj && a[1] instanceof PClass && a[0].cls === a[1];
    case 'dict': return new PDict(); case 'round': return a[1] === undefined ? Math.round(num(a[0], line)) : +num(a[0], line).toFixed(num(a[1], line)); case 'enumerate': return new PList(iter(a[0], line).map((x, i) => new PList([i, x], true))); case 'reversed': return new PList(iter(a[0], line).reverse()); case 'zip': { const ls = a.map(x => iter(x, line)); return new PList(Array.from({ length: Math.min(...ls.map(l => l.length)) }, (_, i) => new PList(ls.map(l => l[i]), true))); }
    case 'any': return iter(a[0], line).some(truthy); case 'all': return iter(a[0], line).every(truthy);
    default: return err(`name '${n}' is not defined`, line); } };
  const BUILTINS = new Set(['any', 'all', 'print', 'len', 'range', 'abs', 'int', 'float', 'str', 'bool', 'min', 'max', 'sum', 'sorted', 'list', 'isinstance', 'dict', 'round', 'enumerate', 'reversed', 'zip']);
  const lookup = (n: string, sc: Scope, line: number): V => { const v = sc.globals?.has(n) ? g.vars.get(n) : sc.get(n); if (v !== undefined) return v; if (BUILTINS.has(n)) return { builtin: n }; return err(`name '${n}' is not defined`, line); };
  const bin = (op: string, a: V, b: V, line: number): V => {
    if (op === '+') { if (typeof a === 'string' && typeof b === 'string') return a + b; if (a instanceof PList && b instanceof PList) return new PList([...a.items, ...b.items], a.tuple); }
    if (op === '*' && a instanceof PList && typeof b === 'number') { const r: V[] = []; for (let i = 0; i < b; i++) r.push(...a.items); return new PList(r); } if (op === '*' && typeof a === 'string' && typeof b === 'number') return a.repeat(Math.max(0, b)); if (op === '%' && typeof a === 'string') return a.replace('%s', fmt(b)).replace('%d', fmt(b));
    const x = num(a, line), y = num(b, line);
    switch (op) { case '+': return x + y; case '-': return x - y; case '*': return x * y; case '/': if (y === 0) err('division by zero (ZeroDivisionError)', line); return x / y; case '//': if (y === 0) err('integer division by zero (ZeroDivisionError)', line); return Math.floor(x / y); case '%': if (y === 0) err('modulo by zero (ZeroDivisionError)', line); return ((x % y) + y) % y; case '**': return Math.pow(x, y); }
    return err('bad operator ' + op, line);
  };
  const ev = (e: E, sc: Scope): V => { tick(); switch (e.k) {
    case 'num': return e.v; case 'str': return e.v; case 'none': return null; case 'bool0': return e.v; case 'name': return lookup(e.name, sc, e.line);
    case 'list': return new PList(e.items.map((x: E) => ev(x, sc))); case 'tuple': return new PList(e.items.map((x: E) => ev(x, sc)), true);
    case 'dict': { const d = new PDict(); e.keys.forEach((k: E, i: number) => { const kv = ev(k, sc); d.map.set(key(kv), [kv, ev(e.vals[i], sc)]); }); return d; }
    case 'neg': { const v = num(ev(e.a, sc), e.line); return e.op === '-' ? -v : v; } case 'not': return !truthy(ev(e.a, sc));
    case 'bool': { const l = ev(e.a, sc); return e.op === 'and' ? (truthy(l) ? ev(e.b, sc) : l) : (truthy(l) ? l : ev(e.b, sc)); }
    case 'ifexp': return truthy(ev(e.test, sc)) ? ev(e.a, sc) : ev(e.b, sc); case 'lambda': return new PFunc('lambda', e.params, e.params.map(() => undefined), e.body, sc, true);
    case 'bin': return bin(e.op, ev(e.a, sc), ev(e.b, sc), e.line);
    case 'cmp': { let l = ev(e.first, sc); for (let i = 0; i < e.ops.length; i++) { const r = ev(e.rest[i], sc); const op = e.ops[i]; let ok: boolean;
      if (op === '==') ok = eq(l, r); else if (op === '!=') ok = !eq(l, r); else if (op === 'is') ok = l === r; else if (op === 'is not') ok = l !== r; else if (op === 'in' || op === 'not in') { const has = r instanceof PDict ? r.map.has(key(l)) : r instanceof PList ? r.items.some(x => eq(x, l)) : typeof r === 'string' ? r.includes(String(l)) : err('argument is not iterable', e.line); ok = op === 'in' ? has : !has; }
      else { if (typeof l !== typeof r && !(typeof l === 'boolean' || typeof r === 'boolean')) err(`'${op}' not supported between ${typeName(l)} and ${typeName(r)}`, e.line); const a = l as number, b = r as number; ok = op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b; }
      if (!ok) return false; l = r; } return true; }
    case 'index': { const o = ev(e.obj, sc), i = ev(e.idx, sc); if (o instanceof PList) { const n = num(i, e.line); const k = n < 0 ? o.items.length + n : n; if (k < 0 || k >= o.items.length) err('list index out of range (IndexError)', e.line); return o.items[k]; } if (o instanceof PDict) { const h = o.map.get(key(i)); if (!h) err(`KeyError: ${fmt(i, 1)}`, e.line); return h![1]; } if (typeof o === 'string') { const n = num(i, e.line); const k = n < 0 ? o.length + n : n; if (k < 0 || k >= o.length) err('string index out of range', e.line); return o[k]; } return err(`'${typeName(o)}' object is not subscriptable`, e.line); }
    case 'slice': { const o = ev(e.obj, sc); const len = o instanceof PList ? o.items.length : typeof o === 'string' ? o.length : err('cannot slice', e.line); const f = (x: E | null, d: number) => { if (!x) return d; let n = num(ev(x, sc), e.line); if (n < 0) n += len; return Math.min(Math.max(n, 0), len); }; const lo = f(e.lo, 0), hi = f(e.hi, len); return o instanceof PList ? new PList(o.items.slice(lo, hi), o.tuple) : (o as string).slice(lo, hi); }
    case 'attr': { const o = ev(e.obj, sc); if (o instanceof PObj) { if (o.attrs.has(e.name)) return o.attrs.get(e.name)!; const m = o.cls.methods.get(e.name); if (m) return Object.assign(Object.create(PFunc.prototype), m, { self: o }); err(`'${o.cls.name}' object has no attribute '${e.name}' (AttributeError)`, e.line); } if (o === null) err(`'NoneType' object has no attribute '${e.name}' (AttributeError): a None pointer was followed`, e.line); return err(`'${typeName(o)}' object has no attribute '${e.name}' (methods can only be called, like x.append(1))`, e.line); }
    case 'fstr': return e.parts.map((p: string | { e: E; spec: string; conv: string }) => (typeof p === 'string' ? p : p.conv === 'r' ? fmt(ev(p.e, sc), 1) : fmtSpec(ev(p.e, sc), p.spec, e.line))).join('');
    case 'comp': { const res: V[] = []; const inner = new Scope(sc, sc.label); const loop = (ci: number) => { const c = e.clauses[ci]; for (const x of iter(ev(c.iter, inner), e.line)) { tick(); assign(c.target, x, inner); if (!c.conds.every((q: E) => truthy(ev(q, inner)))) continue; if (ci + 1 < e.clauses.length) loop(ci + 1); else res.push(ev(e.elt, inner)); } }; loop(0); return new PList(res); }
    case 'call': { const kw = new Map<string, V>(); for (const k of e.kws ?? []) kw.set(k.name, ev(k.value, sc)); if (e.fn.k === 'attr') { const o = ev(e.fn.obj, sc); if (!(o instanceof PObj)) { if (o === null) err(`'NoneType' object has no attribute '${e.fn.name}' (AttributeError): a None pointer was followed`, e.line); const args = e.args.map((x: E) => ev(x, sc)); const r = method(o, e.fn.name, args, e.line, kw); if (r === undefined) err(`'${typeName(o)}' object has no method '${e.fn.name}'`, e.line); return r; } } return call(ev(e.fn, sc), e.args.map((x: E) => ev(x, sc)), e.line, kw); }
  } return err('unsupported expression', e.line); };
  const assign = (t: E, v: V, sc: Scope) => {
    if (t.k === 'name') { (sc.globals?.has(t.name) ? g : sc).vars.set(t.name, v); return; }
    if (t.k === 'tuple') { const xs = iter(v, t.line); if (xs.length !== t.items.length) err(`cannot unpack ${xs.length} values into ${t.items.length} names`, t.line); t.items.forEach((x: E, i: number) => assign(x, xs[i], sc)); return; }
    if (t.k === 'index') { const o = ev(t.obj, sc), i = ev(t.idx, sc); if (o instanceof PList && !o.tuple) { const n = num(i, t.line); const k = n < 0 ? o.items.length + n : n; if (k < 0 || k >= o.items.length) err('list assignment index out of range (IndexError)', t.line); o.items[k] = v; return; } if (o instanceof PDict) { o.map.set(key(i), [i, v]); return; } err(`'${typeName(o)}' object does not support item assignment`, t.line); }
    if (t.k === 'attr') { const o = ev(t.obj, sc); if (o === null) err(`cannot set attribute '${t.name}' on None (AttributeError)`, t.line); if (!(o instanceof PObj)) err('can only set attributes on objects', t.line); o.attrs.set(t.name, v); return; }
    err('cannot assign to this expression', t.line);
  };
  const run = (body: S[], sc: Scope): void => { for (const s of body) { curLine = s.line; tick();
    switch (s.k) {
      case 'expr': ev(s.value, sc); snapshot(`line ${s.line}`); break; case 'pass': break;
      case 'global': (sc.globals ??= new Set()); for (const nm of s.names) sc.globals.add(nm); break;
      case 'assign': { const v = ev(s.value, sc); for (const t of s.targets) assign(t, v, sc); snapshot(describe(s)); break; }
      case 'aug': { const cur = ev(s.target, sc); if (s.op === '+' && cur instanceof PList && !cur.tuple) cur.items.push(...iter(ev(s.value, sc), s.line)); else assign(s.target, bin(s.op, cur, ev(s.value, sc), s.line), sc); snapshot(`line ${s.line}`); break; }
      case 'if': snapshot(`if: checking the condition on line ${s.line}`); if (truthy(ev(s.test, sc))) run(s.body, sc); else run(s.orelse, sc); break;
      case 'while': { for (;;) { curLine = s.line; if (!truthy(ev(s.test, sc))) break; snapshot('while: condition is True'); try { run(s.body, sc); } catch (e) { if (e instanceof Brk) break; if (e instanceof Cont) continue; throw e; } } break; }
      case 'for': { const xs = iter(ev(s.iter, sc), s.line); for (const x of xs) { curLine = s.line; assign(s.target, x, sc); snapshot(`for: next item ${fmt(x, 1)}`); try { run(s.body, sc); } catch (e) { if (e instanceof Brk) break; if (e instanceof Cont) continue; throw e; } } break; }
      case 'def': sc.vars.set(s.name, new PFunc(s.name, s.params, s.defs.map((d: E | null) => (d ? ev(d, sc) : undefined)), s.body, sc)); break;
      case 'class': { const cs = new Scope(sc); run(s.body, cs); const ms = new Map<string, PFunc>(); for (const [k, v] of cs.vars) if (v instanceof PFunc) ms.set(k, v); sc.vars.set(s.name, new PClass(s.name, ms)); break; }
      case 'return': { const v = s.value ? ev(s.value, sc) : null; snapshot(`return ${fmt(v, 1)}`); throw new Ret(v); } case 'break': throw new Brk(); case 'continue': throw new Cont();
    } } };
  const describe = (s: S): string => { const t = s.targets[0]; return t.k === 'name' ? `${t.name} is set` : t.k === 'attr' ? `pointer/field .${t.name} is set` : t.k === 'index' ? 'an element is set' : `line ${s.line}`; };
  try { const prog = new Parser(lex(src)).program(); snapshot('start'); run(prog, g); snapshot('done'); }
  catch (e) { if (e instanceof Stop) { /* limit reached */ } else if (e instanceof PyError) { const last = steps[steps.length - 1]; if (last) steps.push({ ...last, n: steps.length, line: e.line, note: 'Error: ' + e.message, changed: [] }); return { steps, error: { message: e.message, line: e.line }, truncated, output: last?.out ?? out + '' }; } else if (e instanceof Ret || e instanceof Brk || e instanceof Cont) { /* stray at top level */ } else { const last = steps[steps.length - 1]; const msg = 'Could not run this code (' + String((e as Error)?.message ?? e).slice(0, 80) + '). Check the syntax near the highlighted line.'; return { steps, error: { message: msg, line: last?.line ?? 1 }, truncated, output: last?.out ?? out }; } }
  return { steps, truncated, output: out };
}
export const cppToPythonPrompt = (code: string) => `Translate this C++ data-structure code into equivalent simple Python that uses only: classes with __init__, lists, dicts, while/for loops, if/else, functions, and None for null pointers (a node pointer becomes an attribute that is None or another object). Keep the same variable and field names. Add a small main section that exercises the code and prints the result. Return ONLY the Python code.\n\n${code}`;
export const EXAMPLES: { name: string; code: string }[] = [
  { name: 'Linked list: reverse', code: `class Node:\n    def __init__(self, val):\n        self.val = val\n        self.next = None\n\nhead = Node(1)\nhead.next = Node(2)\nhead.next.next = Node(3)\n\nprev = None\ncur = head\nwhile cur:\n    nxt = cur.next\n    cur.next = prev\n    prev = cur\n    cur = nxt\nhead = prev\nprint(head.val)\n` },
  { name: 'Dynamic array: grow', code: `class DynArray:\n    def __init__(self):\n        self.cap = 2\n        self.size = 0\n        self.data = [0, 0]\n    def push(self, x):\n        if self.size == self.cap:\n            new = [0] * (self.cap * 2)\n            for i in range(self.size):\n                new[i] = self.data[i]\n            self.data = new\n            self.cap = self.cap * 2\n        self.data[self.size] = x\n        self.size += 1\n\na = DynArray()\nfor v in [10, 20, 30, 40, 50]:\n    a.push(v)\nprint(a.size, a.cap)\n` },
  { name: 'Binary search tree: insert', code: `class T:\n    def __init__(self, k):\n        self.k = k\n        self.left = None\n        self.right = None\n\ndef insert(root, k):\n    if root is None:\n        return T(k)\n    if k < root.k:\n        root.left = insert(root.left, k)\n    else:\n        root.right = insert(root.right, k)\n    return root\n\nroot = None\nfor k in [5, 3, 8, 1, 4]:\n    root = insert(root, k)\nprint(root.k)\n` },
  { name: 'Bubble sort', code: `a = [5, 2, 9, 1]\nn = len(a)\nfor i in range(n):\n    for j in range(n - 1 - i):\n        if a[j] > a[j + 1]:\n            a[j], a[j + 1] = a[j + 1], a[j]\nprint(a)\n` },
];
