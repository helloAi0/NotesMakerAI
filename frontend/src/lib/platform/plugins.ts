/* Open plugin system. A plugin is a JSON manifest — DATA, never code — so a plugin can add content but cannot run scripts,
   read your notes or touch the network. It can provide:
     • simulations   : parameters + formula readouts + a curve (evaluated with the app’s own safe calculator)
     • decks         : flashcards for a topic or subject
     • calculators   : named input → output tools
   Everything is validated and size-capped before it is stored. */
import { calc } from '../fridayCore';
import { defaultKV } from '../friday/learn';
import type { KV } from '../friday/learn';
import type { AnySim, SimSubject, Values, Param } from '../../sims/types';

export interface PSimParam { id: string; label: string; min: number; max: number; step: number; value: number; unit?: string }
export interface PReadout { label: string; expr: string; unit?: string; digits?: number }
export interface PSim { id: string; title: string; subject: SimSubject; blurb: string; hint?: string; params: PSimParam[]; readouts: PReadout[]; plot?: { x: string; y: string; label?: string }; equations?: string[] }
export interface PDeck { topic: string; cards: { front: string; back: string }[] }
export interface PCalc { id: string; name: string; inputs: { id: string; label: string; value: number; unit?: string }[]; outputs: PReadout[] }
export interface Manifest { kind: 'nm-plugin'; v: 1; id: string; name: string; version: string; author?: string; description?: string; provides: { simulations?: PSim[]; decks?: PDeck[]; calculators?: PCalc[] } }

const SUBJECTS: SimSubject[] = ['Physics', 'Chemistry', 'Biology', 'Math', 'Earth Science', 'Electronics', 'Robotics', 'Computer Science', 'Engineering', 'Materials', 'Quantum', 'Security'];
const FN = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'ln', 'log', 'exp', 'abs', 'sqrt', 'pi']);
const ID = /^[a-z][a-z0-9_]{0,23}$/; const slug = /^[a-z0-9][a-z0-9-]{1,39}$/;
const str = (x: unknown, n: number) => String(x ?? '').replace(/[<>]/g, '').slice(0, n);
const fin = (x: unknown) => typeof x === 'number' && Number.isFinite(x);

/** Evaluate a formula using only the given variables and the calculator’s functions. Returns null on anything unexpected. */
export function evalFormula(expr: string, vars: Record<string, number>): number | null {
  if (expr.length > 200) return null; let bad = false;
  const sub = expr.replace(/[A-Za-z_][A-Za-z0-9_]*/g, w => { const k = w.toLowerCase(); if (k in vars) return `(${vars[k]})`; if (FN.has(k)) return k; bad = true; return w; });
  if (bad || /[^\d\s.+\-*/^%()a-z]/i.test(sub.replace(/e[+-]?\d/gi, '0'))) return null; const v = calc(sub.replace(/\^/g, '**').replace(/\(\s*(-?[\d.eE+-]+)\s*\)/g, (_m, n) => (Number(n) < 0 ? `(0-${String(n).slice(1)})` : `(${n})`))); return v !== null && Number.isFinite(v) ? v : null;
}

export function validateManifest(j: unknown): { ok: true; m: Manifest } | { ok: false; why: string } {
  const o = j as Partial<Manifest> | null; if (!o || o.kind !== 'nm-plugin' || o.v !== 1) return { ok: false, why: 'not a Notes Maker plugin (kind must be "nm-plugin", v 1)' };
  if (!slug.test(String(o.id))) return { ok: false, why: 'id must be 2–40 characters: lowercase letters, digits and dashes' }; if (!str(o.name, 60).trim()) return { ok: false, why: 'name is required' };
  const pr = o.provides; if (!pr || typeof pr !== 'object') return { ok: false, why: 'provides is required' }; const out: Manifest = { kind: 'nm-plugin', v: 1, id: o.id!, name: str(o.name, 60), version: str(o.version || '1.0.0', 16), author: str(o.author, 60), description: str(o.description, 240), provides: {} };
  for (const s of (pr.simulations ?? []).slice(0, 20)) {
    if (!ID.test(String(s?.id))) return { ok: false, why: `simulation id “${str(s?.id, 20)}” is invalid` }; if (!SUBJECTS.includes(s.subject)) return { ok: false, why: `simulation ${s.id}: subject must be one of ${SUBJECTS.join(', ')}` };
    const params: PSimParam[] = []; for (const p of (s.params ?? []).slice(0, 8)) { if (!ID.test(String(p?.id)) || !fin(p.min) || !fin(p.max) || !fin(p.step) || !fin(p.value) || p.max <= p.min || p.step <= 0 || p.value < p.min || p.value > p.max) return { ok: false, why: `simulation ${s.id}: parameter “${str(p?.id, 20)}” needs numeric min < max, step > 0 and value inside the range` }; params.push({ id: p.id, label: str(p.label || p.id, 40), min: p.min, max: p.max, step: p.step, value: p.value, unit: str(p.unit, 10) }); }
    if (!params.length) return { ok: false, why: `simulation ${s.id}: at least one parameter is required` }; const dv = Object.fromEntries(params.map(p => [p.id, p.value]));
    const ro: PReadout[] = []; for (const r of (s.readouts ?? []).slice(0, 8)) { if (evalFormula(String(r?.expr), dv) === null) return { ok: false, why: `simulation ${s.id}: readout “${str(r?.label, 30)}” has a formula I cannot evaluate (use only your parameter ids, numbers, + - * / ^ ( ) and sin cos tan sqrt ln log exp abs pi)` }; ro.push({ label: str(r.label, 40), expr: String(r.expr), unit: str(r.unit, 10), digits: r.digits != null && fin(r.digits) ? Math.max(0, Math.min(6, r.digits | 0)) : 3 }); }
    if (!ro.length) return { ok: false, why: `simulation ${s.id}: at least one readout is required` };
    let plot: PSim['plot']; if (s.plot) { if (!params.some(p => p.id === s.plot!.x) || evalFormula(String(s.plot.y), dv) === null) return { ok: false, why: `simulation ${s.id}: plot needs x = one of your parameter ids and a valid y formula` }; plot = { x: s.plot.x, y: String(s.plot.y), label: str(s.plot.label, 40) }; }
    (out.provides.simulations ??= []).push({ id: s.id, title: str(s.title || s.id, 60), subject: s.subject, blurb: str(s.blurb, 240), hint: str(s.hint, 400), params, readouts: ro, plot, equations: (s.equations ?? []).slice(0, 4).map(e => str(e, 120)) });
  }
  for (const d of (pr.decks ?? []).slice(0, 20)) { const cards = (d?.cards ?? []).slice(0, 300).filter(c => c && str(c.front, 400).trim() && str(c.back, 400).trim()).map(c => ({ front: str(c.front, 400), back: str(c.back, 400) })); if (!str(d?.topic, 60).trim() || !cards.length) return { ok: false, why: 'every deck needs a topic and at least one card with a front and a back' }; (out.provides.decks ??= []).push({ topic: str(d.topic, 60), cards }); }
  for (const c of (pr.calculators ?? []).slice(0, 20)) { if (!ID.test(String(c?.id))) return { ok: false, why: `calculator id “${str(c?.id, 20)}” is invalid` }; const ins = (c.inputs ?? []).slice(0, 8); if (!ins.length || ins.some(i => !ID.test(String(i?.id)) || !fin(i.value))) return { ok: false, why: `calculator ${c.id}: inputs need an id and a numeric default` }; const dv = Object.fromEntries(ins.map(i => [i.id, i.value])); const outs = (c.outputs ?? []).slice(0, 8); if (!outs.length || outs.some(r => evalFormula(String(r?.expr), dv) === null)) return { ok: false, why: `calculator ${c.id}: an output formula cannot be evaluated` }; (out.provides.calculators ??= []).push({ id: c.id, name: str(c.name || c.id, 60), inputs: ins.map(i => ({ id: i.id, label: str(i.label || i.id, 40), value: i.value, unit: str(i.unit, 10) })), outputs: outs.map(r => ({ label: str(r.label, 40), expr: String(r.expr), unit: str(r.unit, 10), digits: 3 })) }); }
  if (!out.provides.simulations && !out.provides.decks && !out.provides.calculators) return { ok: false, why: 'the plugin provides nothing (add simulations, decks or calculators)' };
  return { ok: true, m: out };
}

/** Turn a declarative plugin simulation into a normal simulation object the studio and predict feature can run. */
export function toSim(p: PSim, pluginId: string): AnySim {
  const params: Param[] = p.params.map(x => ({ kind: 'number', id: x.id, label: x.label, min: x.min, max: x.max, step: x.step, value: x.value, unit: x.unit }));
  const vals = (v: Values) => Object.fromEntries(p.params.map(x => [x.id, Number(v[x.id] ?? x.value)]));
  return {
    id: `plugin-${pluginId}-${p.id}`, title: p.title, subject: p.subject, blurb: p.blurb || `${p.title} (plugin)`, hint: p.hint || p.blurb, tags: ['plugin', pluginId], params, status: 'active', category: 'Plugins',
    init: () => ({}), step: () => {},
    readouts: (_s: unknown, v: Values) => p.readouts.map(r => ({ label: r.label, value: evalFormula(r.expr, vals(v)) ?? NaN, unit: r.unit, digits: r.digits ?? 3 })),
    equations: () => p.equations ?? [],
    draw: (c: CanvasRenderingContext2D, _s: unknown, v: Values, w: number, h: number) => {
      c.fillStyle = '#f8fafc'; c.fillRect(0, 0, w, h); const m = 40; c.strokeStyle = '#94a3b8'; c.lineWidth = 1; c.beginPath(); c.moveTo(m, 10); c.lineTo(m, h - m); c.lineTo(w - 10, h - m); c.stroke(); c.fillStyle = '#334155'; c.font = '12px sans-serif';
      if (!p.plot) { c.fillText(p.title, m, 24); return; } const px = p.params.find(q => q.id === p.plot!.x)!; const base = vals(v); const N = 80; const pts: [number, number][] = [];
      for (let i = 0; i <= N; i++) { const x = px.min + ((px.max - px.min) * i) / N; const y = evalFormula(p.plot.y, { ...base, [px.id]: x }); if (y !== null) pts.push([x, y]); }
      if (pts.length < 2) { c.fillText('No curve for these settings', m + 8, 30); return; } const ys = pts.map(q => q[1]); let lo = Math.min(...ys), hi = Math.max(...ys); if (hi === lo) { hi += 1; lo -= 1; }
      const X = (x: number) => m + ((x - px.min) / (px.max - px.min)) * (w - m - 14), Y = (y: number) => h - m - ((y - lo) / (hi - lo)) * (h - m - 24);
      c.strokeStyle = '#2563eb'; c.lineWidth = 2; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)))); c.stroke();
      const cy = evalFormula(p.plot.y, base); if (cy !== null) { c.fillStyle = '#dc2626'; c.beginPath(); c.arc(X(base[px.id]), Y(cy), 5, 0, 7); c.fill(); }
      c.fillStyle = '#334155'; c.fillText(`${p.plot.label || p.plot.y} vs ${px.label}`, m + 6, 16); c.fillText(String(Math.round(lo * 100) / 100), 2, h - m); c.fillText(String(Math.round(hi * 100) / 100), 2, 22);
    },
  } as unknown as AnySim;
}

export interface Installed { m: Manifest; at: number; enabled: boolean }
const KEY = 'nm_plugins';
export class PluginStore {
  private kv: KV; private key: string; list: Installed[];
  constructor(kv: KV = defaultKV(), key = KEY) { this.kv = kv; this.key = key; try { const a = JSON.parse(kv.get(key) || '[]'); this.list = Array.isArray(a) ? a.filter((x: Installed) => validateManifest(x?.m).ok) : []; } catch { this.list = []; } }
  private save() { this.kv.set(this.key, JSON.stringify(this.list)); }
  install(text: string, now = Date.now()): { ok: true; m: Manifest; replaced: boolean } | { ok: false; why: string } {
    if (text.length > 400_000) return { ok: false, why: 'plugin file is too large (limit 400 KB)' }; let j: unknown; try { j = JSON.parse(text); } catch { return { ok: false, why: 'not valid JSON' }; }
    const v = validateManifest(j); if (!v.ok) return v; const i = this.list.findIndex(x => x.m.id === v.m.id); const rec = { m: v.m, at: now, enabled: true }; if (i >= 0) this.list[i] = rec; else this.list.push(rec); if (this.list.length > 30) this.list.shift(); this.save(); return { ok: true, m: v.m, replaced: i >= 0 };
  }
  remove(id: string) { this.list = this.list.filter(x => x.m.id !== id); this.save(); }
  setEnabled(id: string, on: boolean) { const p = this.list.find(x => x.m.id === id); if (p) { p.enabled = on; this.save(); } }
  sims(): AnySim[] { return this.list.filter(p => p.enabled).flatMap(p => (p.m.provides.simulations ?? []).map(s => toSim(s, p.m.id))); }
  decks(): PDeck[] { return this.list.filter(p => p.enabled).flatMap(p => p.m.provides.decks ?? []); }
  calculators(): PCalc[] { return this.list.filter(p => p.enabled).flatMap(p => p.m.provides.calculators ?? []); }
}
export const EXAMPLE: Manifest = { kind: 'nm-plugin', v: 1, id: 'ohms-law-lab', name: 'Ohm’s law lab', version: '1.0.0', author: 'Example', description: 'A formula simulation, a flashcard deck and a calculator.',
  provides: {
    simulations: [{ id: 'ohm', title: 'Ohm’s law: V = I R', subject: 'Electronics', blurb: 'Change the resistance and see the current and power.', hint: 'Current falls as resistance rises when voltage is fixed.', params: [{ id: 'volts', label: 'Voltage', min: 1, max: 24, step: 1, value: 12, unit: 'V' }, { id: 'ohms', label: 'Resistance', min: 1, max: 100, step: 1, value: 10, unit: 'Ω' }], readouts: [{ label: 'Current', expr: 'volts / ohms', unit: 'A', digits: 3 }, { label: 'Power', expr: 'volts^2 / ohms', unit: 'W', digits: 3 }], plot: { x: 'ohms', y: 'volts / ohms', label: 'Current' }, equations: ['I = V / R', 'P = V^2 / R'] }],
    decks: [{ topic: 'Ohm’s law', cards: [{ front: 'State Ohm’s law', back: 'Current is proportional to voltage: V = I R.' }, { front: 'What is the unit of resistance?', back: 'The ohm (Ω).' }] }],
    calculators: [{ id: 'power', name: 'Electrical power', inputs: [{ id: 'v', label: 'Voltage', value: 230, unit: 'V' }, { id: 'i', label: 'Current', value: 2, unit: 'A' }], outputs: [{ label: 'Power', expr: 'v * i', unit: 'W' }, { label: 'Resistance', expr: 'v / i', unit: 'Ω' }] }],
  } };
