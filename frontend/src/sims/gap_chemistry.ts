/* ------------------------------------------------------------------ */
/*  Chemistry gap-fill simulations                                     */
/*   1. periodic_table_trends            (periodic properties, Z = 1-54)*/
/*   2. organic_substitution_elimination (SN1 / SN2 / E1 / E2)          */
/*   3. integrated_rate_laws             (0th/1st/2nd order kinetics)   */
/*   4. molecular_orbital_diatomics      (MO theory, H2 ... Ne2)        */
/* ------------------------------------------------------------------ */
import { defineSim, num, str, bool, SCHOOL_8_10, SCHOOL_11_12, UG_SCI } from './types';
import type { EducationLevel } from './types';
import { C, TAU, arrow, circle, clamp, fmt, hsl, line, panel, plot, polyline, text, roundRect } from './draw';
import type { Ctx, Rect } from './draw';
import { meta, mulberry } from './univ_util';

const ease = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const sub = (n: number) => String(Math.round(n)).split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[+d]).join('');

/* ================================================================== */
/*  1. PERIODIC TABLE TRENDS                                           */
/* ================================================================== */
interface El { Z: number; sym: string; name: string; rad: number; ie: number; en: number; ea: number; mp: number; cls: 'metal' | 'metalloid' | 'nonmetal' | 'noble'; grp: number; per: number }
// [sym, name, covalent radius pm (Cordero 2008), IE1 kJ/mol, Pauling EN (NaN none), EA kJ/mol (negative = no stable anion, estimated), melting point K (NaN = n/a at 1 atm)]
const N = NaN;
const RAW: [string, string, number, number, number, number, number][] = [
  ['H', 'Hydrogen', 31, 1312, 2.20, 72.8, 14], ['He', 'Helium', 28, 2372, N, -48, N],
  ['Li', 'Lithium', 128, 520, 0.98, 59.6, 454], ['Be', 'Beryllium', 96, 900, 1.57, -48, 1560], ['B', 'Boron', 84, 801, 2.04, 26.7, 2349], ['C', 'Carbon', 76, 1086, 2.55, 121.8, 3823],
  ['N', 'Nitrogen', 71, 1402, 3.04, -7, 63], ['O', 'Oxygen', 66, 1314, 3.44, 141, 54], ['F', 'Fluorine', 57, 1681, 3.98, 328, 53], ['Ne', 'Neon', 58, 2081, N, -116, 25],
  ['Na', 'Sodium', 166, 496, 0.93, 52.8, 371], ['Mg', 'Magnesium', 141, 738, 1.31, -40, 923], ['Al', 'Aluminium', 121, 578, 1.61, 42.5, 933], ['Si', 'Silicon', 111, 787, 1.90, 134, 1687],
  ['P', 'Phosphorus', 107, 1012, 2.19, 72, 317], ['S', 'Sulfur', 105, 1000, 2.58, 200, 388], ['Cl', 'Chlorine', 102, 1251, 3.16, 349, 172], ['Ar', 'Argon', 106, 1521, N, -96, 84],
  ['K', 'Potassium', 203, 419, 0.82, 48.4, 337], ['Ca', 'Calcium', 176, 590, 1.00, 2.4, 1115], ['Sc', 'Scandium', 170, 633, 1.36, 18, 1814], ['Ti', 'Titanium', 160, 659, 1.54, 7.6, 1941],
  ['V', 'Vanadium', 153, 651, 1.63, 50.6, 2183], ['Cr', 'Chromium', 139, 653, 1.66, 64.3, 2180], ['Mn', 'Manganese', 139, 717, 1.55, -50, 1519], ['Fe', 'Iron', 132, 763, 1.83, 14.6, 1811],
  ['Co', 'Cobalt', 126, 760, 1.88, 63.7, 1768], ['Ni', 'Nickel', 124, 737, 1.91, 112, 1728], ['Cu', 'Copper', 132, 745, 1.90, 119, 1358], ['Zn', 'Zinc', 122, 906, 1.65, -58, 693],
  ['Ga', 'Gallium', 122, 579, 1.81, 41, 303], ['Ge', 'Germanium', 120, 762, 2.01, 119, 1211], ['As', 'Arsenic', 119, 947, 2.18, 78, 1090], ['Se', 'Selenium', 120, 941, 2.55, 195, 494],
  ['Br', 'Bromine', 120, 1140, 2.96, 324.6, 266], ['Kr', 'Krypton', 116, 1351, 3.00, -96, 116],
  ['Rb', 'Rubidium', 220, 403, 0.82, 46.9, 312], ['Sr', 'Strontium', 195, 550, 0.95, 5.0, 1050], ['Y', 'Yttrium', 190, 600, 1.22, 29.6, 1799], ['Zr', 'Zirconium', 175, 640, 1.33, 41.1, 2128],
  ['Nb', 'Niobium', 164, 652, 1.6, 86.1, 2750], ['Mo', 'Molybdenum', 154, 684, 2.16, 71.9, 2896], ['Tc', 'Technetium', 147, 702, 1.9, 53, 2430], ['Ru', 'Ruthenium', 146, 710, 2.2, 101, 2607],
  ['Rh', 'Rhodium', 142, 720, 2.28, 109.7, 2237], ['Pd', 'Palladium', 139, 804, 2.20, 53.7, 1828], ['Ag', 'Silver', 145, 731, 1.93, 125.6, 1235], ['Cd', 'Cadmium', 144, 868, 1.69, -68, 594],
  ['In', 'Indium', 142, 558, 1.78, 37, 430], ['Sn', 'Tin', 139, 709, 1.96, 107.3, 505], ['Sb', 'Antimony', 139, 834, 2.05, 101, 904], ['Te', 'Tellurium', 138, 869, 2.1, 190.2, 723],
  ['I', 'Iodine', 139, 1008, 2.66, 295, 387], ['Xe', 'Xenon', 140, 1170, 2.6, -77, 161],
];
const METALLOID = new Set(['B', 'Si', 'Ge', 'As', 'Sb', 'Te']);
const NOBLE = new Set(['He', 'Ne', 'Ar', 'Kr', 'Xe']);
const NONMETAL = new Set(['H', 'C', 'N', 'O', 'F', 'P', 'S', 'Cl', 'Se', 'Br', 'I']);
function groupOf(Z: number): [number, number] {
  if (Z === 1) return [1, 1];
  if (Z === 2) return [1, 18];
  const rows: [number, number, number, boolean][] = [[3, 10, 2, true], [11, 18, 3, true], [19, 36, 4, false], [37, 54, 5, false]];
  for (const [a, b, per, short] of rows) if (Z >= a && Z <= b) {
    const i = Z - a;
    if (!short) return [per, i + 1];
    return [per, i < 2 ? i + 1 : i + 11];
  }
  return [1, 1];
}
export const ELEMENTS: El[] = RAW.map((r, i) => {
  const Z = i + 1, [per, grp] = groupOf(Z);
  const cls = NOBLE.has(r[0]) ? 'noble' : METALLOID.has(r[0]) ? 'metalloid' : NONMETAL.has(r[0]) ? 'nonmetal' : 'metal';
  return { Z, sym: r[0], name: r[1], rad: r[2], ie: r[3], en: r[4], ea: r[5], mp: r[6], cls, grp, per };
});
type PropKey = 'rad' | 'ie' | 'en' | 'ea' | 'mp' | 'cls';
const PROPS: Record<PropKey, { label: string; unit: string; get: (e: El) => number; lo: number; hi: number; digits: number; up: string; down: string }> = {
  rad: { label: 'Atomic (covalent) radius', unit: 'pm', get: e => e.rad, lo: 28, hi: 220, digits: 0, up: 'Radius decreases across a period (rising effective nuclear charge Zeff pulls the same shell closer).', down: 'Radius increases down a group (extra shells; screening beats the larger nuclear charge).' },
  ie: { label: 'First ionisation energy', unit: 'kJ/mol', get: e => e.ie, lo: 400, hi: 2400, digits: 0, up: 'IE1 rises across a period (higher Zeff, smaller atom) with dips at B (2p is higher than 2s) and O (paired 2p electron repels).', down: 'IE1 falls down a group: the outer electron is further away and better shielded.' },
  en: { label: 'Electronegativity (Pauling)', unit: '', get: e => e.en, lo: 0.7, hi: 4.0, digits: 2, up: 'Electronegativity rises across a period as Zeff grows and the atom shrinks.', down: 'Electronegativity falls down a group as the bonding pair sits further from the nucleus.' },
  ea: { label: 'Electron affinity', unit: 'kJ/mol', get: e => e.ea, lo: -120, hi: 350, digits: 0, up: 'Electron affinity becomes more exothermic across a period (halogens highest); Be, N, noble gases are exceptions (full / half-full / full subshell).', down: 'Down a group EA generally falls, with the 2nd-period anomaly: F < Cl because of electron-electron repulsion in the small 2p subshell.' },
  mp: { label: 'Melting point', unit: 'K', get: e => e.mp, lo: 0, hi: 3900, digits: 0, up: 'Melting point peaks at the covalent network (C, Si) or the d-block metals mid-period, then drops sharply for molecular non-metals.', down: 'Group 1 and 17: metals melt lower and halogens melt higher down the group (stronger dispersion forces).' },
  cls: { label: 'Metallic character', unit: '', get: e => (e.cls === 'metal' ? 1 : e.cls === 'metalloid' ? 0.5 : 0), lo: 0, hi: 1, digits: 1, up: 'Metallic character decreases across a period: metals on the left, metalloids on the staircase, non-metals on the right.', down: 'Metallic character increases down a group (easier to lose outer electrons).' },
};
const CLS_COL: Record<El['cls'], string> = { metal: hsl(205, 70, 45), metalloid: hsl(45, 85, 50), nonmetal: hsl(150, 60, 40), noble: hsl(280, 50, 52) };
const EXC: Record<string, string> = {
  'ie:B': 'B < Be: 2p higher than 2s', 'ie:O': 'O < N: pair repulsion', 'ie:Al': 'Al < Mg: 3p above 3s', 'ie:S': 'S < P: pair repulsion', 'ie:Ga': 'Ga < Zn: 4p above full 3d/4s',
  'ea:Be': 'Be: filled 2s', 'ea:N': 'N: half-filled 2p', 'ea:Mg': 'Mg: filled 3s', 'ea:Zn': 'Zn: filled 4s', 'ea:Ne': 'noble gas: full shell',
  'en:Ga': 'Ga > Al: d-block contraction', 'rad:Ga': 'Ga ≈ Al: d-block contraction',
};
function propColor(p: PropKey, e: El): string {
  if (p === 'cls') return CLS_COL[e.cls];
  const v = PROPS[p].get(e);
  if (!Number.isFinite(v)) return 'rgba(100,116,139,0.35)';
  const t = clamp((v - PROPS[p].lo) / (PROPS[p].hi - PROPS[p].lo || 1), 0, 1);
  return hsl(235 - 235 * t, 70, 30 + 22 * t);
}
export function periodSeries(period: number): El[] { return ELEMENTS.filter(e => e.per === period).sort((a, b) => a.grp - b.grp); }
export function groupSeries(group: number): El[] { return ELEMENTS.filter(e => e.grp === group).sort((a, b) => a.per - b.per); }

interface PtS { t: number; sel: number; hold: number; step: number; layout: { x: number; y: number; cs: number } }
const ptSeries = (v: Record<string, number | string | boolean>) => (str(v, 'view') === 'group' ? groupSeries(Math.round(num(v, 'group'))) : periodSeries(Math.round(num(v, 'period'))));
export const periodicTrends = defineSim<PtS>({
  id: 'periodic_table_trends', title: 'Periodic Table Trends: Radius, Ionisation Energy, Electronegativity',
  ...meta('Chemistry', 'Intermediate', 'Periodic Table', 'Periodic Properties', 'Trends across periods and down groups, exceptions in ionisation energy and electron affinity', [...SCHOOL_8_10, ...SCHOOL_11_12]),
  covers: ['Periodic trends', 'Atomic radius', 'Ionisation energy', 'Electronegativity', 'Electron affinity', 'Metallic character', 'Periodic table'],
  tags: ['NCERT', 'JEE', 'NEET', 'CBSE', 'periodicity', 'Zeff', 'shielding', 'periods and groups', 'exceptions'],
  learningObjectives: ['Describe how atomic radius, ionisation energy and electronegativity change across a period and down a group.', 'Explain the dips in first ionisation energy at B (vs Be) and O (vs N) using subshell and electron-pair arguments.', 'Read element data off a colour-coded periodic table and a trend line.'],
  assumptions: ['Data are textbook values for the first 54 elements; the radius is the covalent radius (Cordero 2008) so noble gases are included.', 'Electron affinity < 0 means the anion is unbound (estimated values); melting points are at 1 atm (He has none).'],
  blurb: 'Colour the periodic table (Z = 1-54) by a property, click any element for its data, and watch Play sweep across a period while the trend line and its exceptions are explained.',
  hint: 'Zeff = Z - shielding grows across a period so atoms shrink and IE/EN rise; down a group the shell number n grows so radius grows and IE/EN fall. IE1(Be)>IE1(B) because 2p is higher than 2s; IE1(N)>IE1(O) because the paired 2p electron in O is repelled. Fluorine is the most electronegative element (3.98).',
  params: [
    { kind: 'select', id: 'prop', label: 'Property shown', value: 'ie', options: (Object.keys(PROPS) as PropKey[]).map(k => ({ value: k, label: PROPS[k].label + (PROPS[k].unit ? ` (${PROPS[k].unit})` : '') })) },
    { kind: 'select', id: 'view', label: 'Trend line along', value: 'period', options: [{ value: 'period', label: 'a period (across)' }, { value: 'group', label: 'a group (down)' }] },
    { kind: 'number', id: 'period', label: 'Period', min: 1, max: 5, step: 1, value: 2, digits: 0 },
    { kind: 'number', id: 'group', label: 'Group', min: 1, max: 18, step: 1, value: 1, digits: 0 },
    { kind: 'number', id: 'rate', label: 'Sweep speed (elements/s)', min: 0.3, max: 3, step: 0.1, value: 1, digits: 1 },
  ],
  actions: [{ id: 'restart', label: 'Restart sweep' }],
  dt: 1 / 30, previewSeconds: 2.5,
  init(v) { const ser = ptSeries(v); return { t: 0, sel: ser[0].Z, hold: 0, step: 0, layout: { x: 0, y: 0, cs: 1 } }; },
  step(s, v, dt) {
    s.t += dt;
    if (s.hold > 0) { s.hold -= dt; return; }
    const ser = ptSeries(v); if (!ser.length) return;
    s.step += dt * num(v, 'rate');
    const i = Math.floor(s.step) % ser.length;
    s.sel = ser[i].Z;
  },
  action(s, v) { s.step = 0; s.hold = 0; s.sel = ptSeries(v)[0].Z; },
  pointer(s, v, e) {
    if (e.kind === 'up') return;
    const L = s.layout; if (!(L.cs > 0)) return;
    const col = Math.floor((e.x - L.x) / L.cs), row = Math.floor((e.y - L.y) / L.cs);
    const el = ELEMENTS.find(q => q.grp === col + 1 && q.per === row + 1);
    if (el) { s.sel = el.Z; s.hold = e.kind === 'down' ? 6 : 2; const ser = ptSeries(v); const k = ser.findIndex(q => q.Z === el.Z); if (k >= 0) s.step = k + 0.01; }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const prop = (str(v, 'prop') as PropKey) in PROPS ? (str(v, 'prop') as PropKey) : 'ie', P = PROPS[prop];
    const tableH = h * 0.5, cs = Math.max(4, Math.min((w - 16) / 18, (tableH - 6) / 5));
    const tx = (w - cs * 18) / 2, ty = 6; s.layout = { x: tx, y: ty, cs };
    const sel = ELEMENTS[clamp(s.sel, 1, ELEMENTS.length) - 1], ser = ptSeries(v);
    const inSeries = new Set(ser.map(e => e.Z));
    for (const e of ELEMENTS) {
      const x = tx + (e.grp - 1) * cs, y = ty + (e.per - 1) * cs;
      c.fillStyle = propColor(prop, e); c.fillRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
      if (inSeries.has(e.Z)) { c.strokeStyle = 'rgba(248,250,252,0.55)'; c.lineWidth = 1; c.strokeRect(x + 1, y + 1, cs - 2, cs - 2); }
      if (cs >= 14) text(c, e.sym, x + cs / 2, y + cs / 2 + (cs >= 24 ? 0 : 3), C.white, Math.min(14, cs * 0.42), 'center', cs >= 24 ? 'middle' : 'alphabetic', true);
      if (cs >= 24) text(c, String(e.Z), x + 2, y + 9, 'rgba(248,250,252,0.7)', 7);
    }
    const sx = tx + (sel.grp - 1) * cs, sy = ty + (sel.per - 1) * cs;
    c.strokeStyle = C.amber; c.lineWidth = 2.5; c.strokeRect(sx, sy, cs, cs);
    // header / legend inside the empty top-centre gap of the table
    const gx = tx + 2.2 * cs, gw = 10.6 * cs;
    if (gw > 80 && cs >= 12) {
      text(c, P.label + (P.unit ? ` (${P.unit})` : ''), gx + gw / 2, ty + cs * 0.6, C.text, Math.min(12, cs * 0.45 + 2), 'center', 'alphabetic', true);
      if (prop === 'cls') ([['metal', 'metal'], ['metalloid', 'metalloid'], ['nonmetal', 'non-metal'], ['noble', 'noble gas']] as [El['cls'], string][]).forEach(([k, l], i) => { const lx = gx + (gw / 4) * i; c.fillStyle = CLS_COL[k]; c.fillRect(lx + 4, ty + cs * 0.95, 8, 8); text(c, l, lx + 15, ty + cs * 0.95 + 8, C.dim, 9); });
      else { const bw = gw - 20; for (let i = 0; i < 24; i++) { c.fillStyle = hsl(235 - 235 * (i / 23), 70, 30 + 22 * (i / 23)); c.fillRect(gx + 10 + (bw * i) / 24, ty + cs * 0.85, bw / 24 + 0.5, 7); }
        text(c, fmt(P.lo, P.digits > 1 ? 1 : 0), gx + 10, ty + cs * 0.85 + 18, C.dim, 9); text(c, fmt(P.hi, P.digits > 1 ? 1 : 0), gx + 10 + bw, ty + cs * 0.85 + 18, C.dim, 9, 'right'); }
    }
    // detail card (gap under the header, period 1-3 area centre)
    if (cs >= 20 && gw > 150) {
      const val = P.get(sel);
      text(c, `${sel.name} (Z=${sel.Z})`, gx + gw / 2, ty + cs * 2.15, C.amber, 12, 'center', 'alphabetic', true);
      text(c, prop === 'cls' ? sel.cls : Number.isFinite(val) ? `${fmt(val, P.digits)} ${P.unit}` : 'n/a', gx + gw / 2, ty + cs * 2.15 + 15, C.text, 12, 'center', 'alphabetic', true);
    }
    // ---- trend line
    const R: Rect = { x: 8, y: tableH + 8, w: w - 16, h: h - tableH - 12 };
    if (R.w < 60 || R.h < 50) return;
    const isP = str(v, 'view') !== 'group';
    const vals = ser.map(e => P.get(e));
    const fin = vals.filter(Number.isFinite);
    let lo = fin.length ? Math.min(...fin) : 0, hi = fin.length ? Math.max(...fin) : 1;
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.2; lo -= pad * 0.5; hi += pad;
    const xr: [number, number] = isP ? [ser[0].grp - 0.5, ser[ser.length - 1].grp + 0.5] : [ser[0].per - 0.5, ser[ser.length - 1].per + 0.5];
    const xv = (e: El) => (isP ? e.grp : e.per);
    const m = plot(c, R, xr, [lo, hi], { title: `${P.label}${P.unit ? ' (' + P.unit + ')' : ''} ${isP ? `across period ${Math.round(num(v, 'period'))}` : `down group ${Math.round(num(v, 'group'))}`}`, xlabel: isP ? 'group' : 'period', xstep: 1, ystep: undefined });
    const pts: [number, number][] = [];
    ser.forEach((e, i) => { if (Number.isFinite(vals[i])) pts.push([m.X(xv(e)), m.Y(vals[i])]); });
    polyline(c, pts, C.cyan, 2);
    ser.forEach((e, i) => {
      if (!Number.isFinite(vals[i])) return;
      const x = m.X(xv(e)), y = m.Y(vals[i]), isSel = e.Z === sel.Z;
      circle(c, x, y, isSel ? 6 : 3.5, isSel ? C.amber : C.cyan, isSel ? C.white : undefined, 1.5);
      if (R.w > 330) text(c, e.sym, x, y - 9, isSel ? C.amber : C.dim, 10, 'center', 'alphabetic', isSel);
      const ex = EXC[`${prop}:${e.sym}`];
      if (ex && isP && R.w > 380 && R.h > 120) text(c, ex, clamp(x, R.x + 90, R.x + R.w - 90), y + 18, C.orange, 9, 'center');
    });
    ser.forEach((e, i) => { if (!Number.isFinite(vals[i])) { const x = m.X(xv(e)); text(c, `${e.sym}: n/a`, x, R.y + R.h - 30, C.dim, 9, 'center'); } });
  },
  readouts(s, v) {
    const prop = (str(v, 'prop') as PropKey) in PROPS ? (str(v, 'prop') as PropKey) : 'ie', P = PROPS[prop];
    const e = ELEMENTS[clamp(s.sel, 1, ELEMENTS.length) - 1], isP = str(v, 'view') !== 'group';
    const val = P.get(e);
    return [
      { label: 'Selected element', value: `${e.name} (${e.sym}, Z=${e.Z})` },
      { label: 'Position', value: `Period ${e.per}, Group ${e.grp}` },
      { label: P.label, value: prop === 'cls' ? e.cls : Number.isFinite(val) ? val : 'n/a', unit: prop === 'cls' ? undefined : P.unit, digits: P.digits },
      { label: 'Class', value: e.cls === 'noble' ? 'noble gas' : e.cls },
      { label: 'Atomic radius / IE1', value: `${e.rad} pm / ${e.ie} kJ/mol` },
      { label: 'Electronegativity / EA', value: `${Number.isFinite(e.en) ? e.en.toFixed(2) : 'n/a'} / ${e.ea} kJ/mol` },
      { label: 'Trend', value: isP ? P.up : P.down },
    ];
  },
  equations(s, v) {
    const e = ELEMENTS[clamp(s.sel, 1, ELEMENTS.length) - 1];
    return ['Z_{\\mathrm{eff}} = Z - \\sigma \\;\\Rightarrow\\; \\text{radius}\\downarrow,\\ IE\\uparrow\\ \\text{across a period}', `\\mathrm{${e.sym}}(g) \\to \\mathrm{${e.sym}}^{+}(g) + e^{-}\\quad \\Delta H = IE_1 = ${e.ie}\\ \\mathrm{kJ\\,mol^{-1}}`, '\\chi_A-\\chi_B = 0.102\\sqrt{\\Delta_{AB}}\\ \\ (\\text{Pauling})'];
  },
});
