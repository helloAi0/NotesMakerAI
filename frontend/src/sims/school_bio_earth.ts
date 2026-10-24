import { defineSim, num, str, bool, SCHOOL_11_12, SCHOOL_ALL } from './types';
import type { EducationLevel, Difficulty, SimSubject } from './types';
import { C, TAU, arrow, circle, clamp, fmt, line, panel, plot, polyline, text, deg, rad } from './draw';

const meta = (subject: SimSubject, levels: EducationLevel[], difficulty: Difficulty, category: string, topic: string, subtopic: string) => ({
  subject, status: 'active' as const, educationLevels: levels, difficulty, category, topic, subtopic,
});
const L = (...l: EducationLevel[]) => l;

/* ================================================================== */
/*  Mitosis                                                            */
/* ================================================================== */
interface MiS { t: number }
const PHASES = ['Interphase (S: DNA copied)', 'Prophase', 'Metaphase', 'Anaphase', 'Telophase', 'Cytokinesis'];
export const mitosis = defineSim<MiS>({
  id: 'mitosis_stages', title: 'Mitosis: Stages of Cell Division',
  ...meta('Biology', [...SCHOOL_ALL, 'B.Sc'], 'Beginner', 'Cell Cycle', 'Cell Cycle and Cell Division', 'Phases of mitosis'),
  covers: ['Mitosis', 'Cell cycle', 'Chromosome number and DNA content', 'Metaphase plate'],
  tags: ['NCERT', 'NEET', 'prophase', 'anaphase', 'telophase', 'spindle', 'chromatid', 'cytokinesis'],
  learningObjectives: ['Order the stages of mitosis and say what happens in each.', 'Track chromosome number and DNA amount (2C → 4C → 2C).', 'Explain why the two daughter cells are genetically identical.'],
  assumptions: ['Schematic animal cell with 2n chromosomes drawn as paired chromatids; timing is not to scale.'],
  blurb: 'Watch one cell divide through the phases of mitosis. Choose the number of chromosomes, scrub the stage yourself or let it play, and follow the DNA content per cell.',
  hint: 'Interphase S-phase doubles DNA (2C to 4C). Prophase: chromatin condenses, spindle forms. Metaphase: chromosomes line up on the plate. Anaphase: sister chromatids separate. Telophase/cytokinesis: two cells each with 2n chromosomes (2C).',
  params: [
    { kind: 'number', id: 'n2', label: 'Chromosomes in the parent cell (2n)', min: 2, max: 12, step: 2, value: 6, digits: 0 },
    { kind: 'toggle', id: 'auto', label: 'Play automatically', value: true },
    { kind: 'number', id: 'ph', label: 'Stage (when paused)', min: 0, max: 5.99, step: 0.01, value: 2, digits: 2 },
  ],
  dt: 1 / 60, previewSeconds: 7,
  init() { return { t: 0 }; },
  step(s, v, dt) { if (bool(v, 'auto')) s.t += dt; },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const prog = bool(v, 'auto') ? (s.t / 2.6) % 6 : num(v, 'ph'), ph = Math.floor(prog), f = prog - ph, n = num(v, 'n2');
    const cx = w * 0.5, cy = h * 0.5, R = Math.min(w, h) * 0.34;
    const drawCell = (x: number, y: number, rx: number, ry: number) => { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = 'rgba(34,211,238,0.12)'; c.fill(); c.strokeStyle = C.cyan; c.lineWidth = 2; c.stroke(); };
    const chrom = (x: number, y: number, ang: number, dup: boolean, col: string, len = 15) => {
      c.save(); c.translate(x, y); c.rotate(ang); c.strokeStyle = col; c.lineWidth = 4; c.lineCap = 'round';
      if (dup) { line(c, -3, -len, -3, len, col, 4); line(c, 3, -len, 3, len, col, 4); circle(c, 0, 0, 3, C.white); } else line(c, 0, -len, 0, len, col, 4);
      c.restore();
    };
    const cols = [C.pink, C.amber, C.green, C.purple, C.orange, C.blue];
    const pairs = n / 2;
    if (ph <= 4 && !(ph === 4 && f > 0.55)) {
      const stretch = ph === 4 ? 1 + f * 0.7 : 1;
      drawCell(cx, cy, R * stretch, R);
      if (ph === 0) { circle(c, cx, cy, R * 0.45, 'rgba(167,139,250,0.25)', C.purple, 1.5); for (let i = 0; i < n; i++) { const a = (i / n) * TAU; chrom(cx + Math.cos(a) * R * 0.22, cy + Math.sin(a) * R * 0.22, a, f > 0.5, cols[i % 6], 9); } }
      if (ph === 1) { if (f < 0.5) circle(c, cx, cy, R * 0.45 * (1 - f), 'rgba(167,139,250,0.2)', C.purple, 1.5); for (let i = 0; i < n; i++) { const a = (i / n) * TAU + 1; chrom(cx + Math.cos(a) * R * 0.3, cy + Math.sin(a) * R * 0.3, a + f * 2, true, cols[i % 6]); } circle(c, cx - R * (0.5 + f * 0.4), cy, 4, C.white); circle(c, cx + R * (0.5 + f * 0.4), cy, 4, C.white); }
      if (ph === 2) { for (let k = 0; k < 10; k++) { const yy = (k - 4.5) * R * 0.13; line(c, cx - R * 0.9, cy, cx, cy + yy, 'rgba(226,232,240,0.28)'); line(c, cx + R * 0.9, cy, cx, cy + yy, 'rgba(226,232,240,0.28)'); } for (let i = 0; i < n; i++) chrom(cx, cy + ((i - (n - 1) / 2) * R * 1.4) / Math.max(n, 6) * 1.1, Math.PI / 2, true, cols[i % 6], 14); circle(c, cx - R * 0.9, cy, 4, C.white); circle(c, cx + R * 0.9, cy, 4, C.white); }
      if (ph === 3) { for (let i = 0; i < n; i++) { const yy = cy + ((i - (n - 1) / 2) * R * 1.4) / Math.max(n, 6) * 1.1, d = R * 0.12 + f * R * 0.55; chrom(cx - d, yy, Math.PI / 2 - 0.4, false, cols[i % 6], 13); chrom(cx + d, yy, Math.PI / 2 + 0.4, false, cols[i % 6], 13); } circle(c, cx - R * 0.9, cy, 4, C.white); circle(c, cx + R * 0.9, cy, 4, C.white); }
      if (ph === 4) { for (let i = 0; i < n; i++) { const yy = cy + ((i - (n - 1) / 2) * R * 1.4) / Math.max(n, 6) * 0.7; for (const sd of [-1, 1]) chrom(cx + sd * R * (0.6 + f * 0.35) * stretch * 0.9, yy, 0, false, cols[i % 6], 10 - f * 4); } c.beginPath(); c.moveTo(cx, cy - R); c.quadraticCurveTo(cx - R * 0.05 * f * 10, cy, cx, cy + R); c.strokeStyle = 'rgba(34,211,238,0.5)'; c.stroke(); }
    } else {
      const gap = 0.2 + (f - 0.55) * 0.3; const rx = R * 0.7, off = R * (0.78 + gap);
      for (const sd of [-1, 1]) { drawCell(cx + sd * off, cy, rx, R * 0.9); circle(c, cx + sd * off, cy, R * 0.42, 'rgba(167,139,250,0.25)', C.purple, 1.5); for (let i = 0; i < n; i++) { const a = (i / n) * TAU; chrom(cx + sd * off + Math.cos(a) * R * 0.2, cy + Math.sin(a) * R * 0.2, a, false, cols[i % 6], 7); } }
    }
    void pairs;
    text(c, PHASES[ph], 12, 24, C.text, 14, 'left', 'alphabetic', true);
    text(c, ph === 0 ? 'DNA replicates; each chromosome becomes two sister chromatids' : ph === 1 ? 'chromatin condenses, nuclear envelope breaks down, spindle forms' : ph === 2 ? 'chromosomes align on the metaphase plate' : ph === 3 ? 'sister chromatids are pulled to opposite poles' : ph === 4 ? 'nuclei re-form; chromosomes decondense' : 'cytoplasm divides: two identical daughter cells', 12, h - 12, C.dim, 11);
    for (let i = 0; i < 6; i++) { c.fillStyle = i === ph ? C.amber : 'rgba(148,163,184,0.35)'; c.fillRect(w - 110 + i * 17, 14, 14, 6); }
  },
  readouts(s, v) {
    const prog = bool(v, 'auto') ? (s.t / 2.6) % 6 : num(v, 'ph'), ph = Math.floor(prog), n = num(v, 'n2');
    const dna = ph === 0 ? (prog % 1 > 0.5 ? '4C' : '2C → 4C') : ph <= 3 ? '4C' : ph === 4 ? '4C → 2C' : '2C (each cell)';
    return [{ label: 'Phase', value: PHASES[ph] }, { label: 'Chromosomes (parent 2n)', value: n, digits: 0 }, { label: 'Chromatids per cell', value: ph <= 2 ? 2 * n : ph === 3 ? 2 * n : n, digits: 0 }, { label: 'DNA content', value: dna },
      { label: 'Chromosomes per daughter', value: n, digits: 0 }];
  },
  equations(_s, v) { return [`2n = ${num(v, 'n2')} \\ \\Rightarrow\\ \\text{each daughter cell: } 2n = ${num(v, 'n2')}`, '\\text{G}_1 \\to \\text{S}(2C\\to 4C) \\to \\text{G}_2 \\to \\text{M}']; },
});

/* ================================================================== */
/*  Photosynthesis limiting factors                                    */
/* ================================================================== */
interface PsS { t: number }
const photo = (I: number, co2: number, T: number) => {
  const li = I / (I + 250), cc = co2 / (co2 + 250), tf = Math.exp(-(((T - 28) / 11) ** 2)) * (T > 45 ? 0.2 : 1);
  return { li, cc, tf, rate: Math.min(100, (100 / 0.85) * Math.min(li, cc, 1) * Math.min(1, tf * 1.05)) };
};
export const photosynthesis = defineSim<PsS>({
  id: 'photosynthesis_factors', title: 'Photosynthesis: Light, CO₂ and Temperature as Limiting Factors',
  ...meta('Biology', [...SCHOOL_ALL, 'B.Sc'], 'Intermediate', 'Plant Physiology', 'Photosynthesis in Higher Plants', "Blackman's law of limiting factors"),
  covers: ['Limiting factors', 'Photosynthesis', "Blackman's law", 'Light saturation', 'Effect of temperature on enzymes'],
  tags: ['NCERT', 'NEET', 'rate of photosynthesis', 'light intensity', 'CO2 concentration', 'temperature optimum', 'compensation point'],
  learningObjectives: ['Read the rate-vs-light curve and find the saturation level.', 'Identify which factor is limiting under the current settings.', 'Explain the temperature optimum using enzyme denaturation.'],
  assumptions: ['Smooth empirical model (saturating light and CO₂ response times a bell-shaped temperature factor), not a leaf-level biochemical model.', 'Rates are relative (100 = best conditions shown).'],
  blurb: 'Change light intensity, CO₂ and temperature and watch the relative rate of photosynthesis. The simulation tells you which factor is limiting at that moment.',
  hint: 'Rate rises with light then plateaus (saturation); the same for CO₂. Temperature has an optimum near 25-30 °C; above it enzymes denature. The factor in shortest supply limits the rate.',
  params: [
    { kind: 'number', id: 'I', label: 'Light intensity', min: 0, max: 2000, step: 25, value: 400, unit: 'µmol/m²/s', digits: 0 },
    { kind: 'number', id: 'co2', label: 'CO₂ concentration', min: 0, max: 1000, step: 10, value: 400, unit: 'ppm', digits: 0 },
    { kind: 'number', id: 'T', label: 'Temperature', min: 5, max: 50, step: 1, value: 25, unit: '°C', digits: 0 },
  ],
  dt: 1 / 60, previewSeconds: 1,
  init() { return { t: 0 }; }, step(s, _v, dt) { s.t += dt; },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const I = num(v, 'I'), co2 = num(v, 'co2'), T = num(v, 'T'), cur = photo(I, co2, T);
    const pw = (w - 32) / 3, ph = h * 0.58;
    const mk = (i: number, title: string, xr: [number, number], f: (x: number) => number, x0: number, xl: string) => {
      const r = { x: 8 + i * (pw + 8), y: 8, w: pw, h: ph }; const m = plot(c, r, xr, [0, 100], { title, xlabel: xl, ystep: 25 });
      const pts: [number, number][] = []; for (let k = 0; k <= 80; k++) { const x = xr[0] + (k / 80) * (xr[1] - xr[0]); pts.push([m.X(x), m.Y(f(x))]); } polyline(c, pts, C.green, 2.2);
      circle(c, m.X(x0), m.Y(f(x0)), 5, C.amber, C.white, 1.5);
    };
    mk(0, 'Light', [0, 2000], x => photo(x, co2, T).rate, I, 'µmol/m²/s'); mk(1, 'CO₂', [0, 1000], x => photo(I, x, T).rate, co2, 'ppm'); mk(2, 'Temperature', [5, 50], x => photo(I, co2, x).rate, T, '°C');
    // leaf with bubbles
    const ly = ph + 24, lh = h - ly - 12; panel(c, { x: 8, y: ly, w: w - 16, h: lh });
    const lim = cur.li <= cur.cc && cur.li <= cur.tf ? 'light' : cur.cc <= cur.tf ? 'CO₂' : 'temperature';
    c.beginPath(); c.moveTo(60, ly + lh / 2); c.quadraticCurveTo(w * 0.25, ly + 4, w * 0.5, ly + lh / 2); c.quadraticCurveTo(w * 0.25, ly + lh - 4, 60, ly + lh / 2); c.fillStyle = `rgba(52,211,153,${0.25 + 0.5 * cur.rate / 100})`; c.fill(); c.strokeStyle = C.green; c.lineWidth = 2; c.stroke();
    const nb = Math.round(cur.rate / 7); for (let i = 0; i < nb; i++) { const ph2 = (s.t * 0.7 + i / Math.max(nb, 1)) % 1; circle(c, w * 0.3 + Math.sin(i * 7.1) * 50, ly + lh - ph2 * lh, 2 + (i % 3), 'rgba(186,230,253,0.8)'); }
    text(c, `Relative rate ${fmt(cur.rate, 0)}`, w * 0.55, ly + 26, C.text, 14, 'left', 'alphabetic', true);
    text(c, `limiting factor: ${cur.rate < 3 ? 'none (nothing is happening)' : lim}`, w * 0.55, ly + 48, C.amber, 12);
    text(c, `O₂ bubbles ∝ rate`, w * 0.55, ly + 68, C.dim, 10);
  },
  readouts(_s, v) {
    const cur = photo(num(v, 'I'), num(v, 'co2'), num(v, 'T')); const lim = cur.li <= cur.cc && cur.li <= cur.tf ? 'light' : cur.cc <= cur.tf ? 'CO₂' : 'temperature';
    return [{ label: 'Relative rate', value: cur.rate, digits: 1 }, { label: 'Limiting factor', value: lim }, { label: 'Light factor', value: cur.li, digits: 2 }, { label: 'CO₂ factor', value: cur.cc, digits: 2 }, { label: 'Temperature factor', value: cur.tf, digits: 2 }];
  },
  equations() { return ['6CO_2 + 6H_2O \\xrightarrow{\\text{light}} C_6H_{12}O_6 + 6O_2', '\\text{rate} \\propto f(\\text{light})\\cdot f(CO_2)\\cdot f(T)']; },
});

/* ================================================================== */
/*  Mendelian genetics: Punnett square with sampling                   */
/* ================================================================== */
interface PuS { counts: Record<string, number>; n: number }
const CROSSES: Record<string, { p1: string; p2: string; dihybrid: boolean }> = {
  'Aa x Aa': { p1: 'Aa', p2: 'Aa', dihybrid: false }, 'Aa x aa': { p1: 'Aa', p2: 'aa', dihybrid: false }, 'AA x aa': { p1: 'AA', p2: 'aa', dihybrid: false },
  'AaBb x AaBb': { p1: 'AaBb', p2: 'AaBb', dihybrid: true }, 'AaBb x aabb': { p1: 'AaBb', p2: 'aabb', dihybrid: true },
};
const gametes = (g: string) => (g.length === 2 ? [g[0], g[1]] : [g[0] + g[2], g[0] + g[3], g[1] + g[2], g[1] + g[3]]);
const pheno = (g: string) => (g.length === 2 ? (/[A-Z]/.test(g) ? 'Dominant' : 'recessive') : `${/[A]/.test(g.slice(0, 2)) ? 'A_' : 'aa'}${/[B]/.test(g.slice(2)) ? 'B_' : 'bb'}`);
const sortGeno = (g: string) => (g.length === 2 ? g.split('').sort().join('') : g.slice(0, 2).split('').sort().join('') + g.slice(2).split('').sort().join(''));
const offspring = (a: string, b: string): string[] => { const ga = gametes(a), gb = gametes(b), out: string[] = []; for (const x of ga) for (const y of gb) out.push(a.length === 2 ? sortGeno(x + y) : sortGeno(x[0] + y[0] + x[1] + y[1])); return out; };
export const punnett = defineSim<PuS>({
  id: 'mendel_punnett', title: "Mendelian Inheritance: Punnett Square & Real Ratios",
  ...meta('Biology', [...SCHOOL_ALL, 'B.Sc'], 'Intermediate', 'Genetics', 'Principles of Inheritance and Variation', "Mendel's monohybrid and dihybrid crosses"),
  covers: ["Mendel's laws", 'Punnett square', 'Monohybrid cross', 'Dihybrid cross', 'Genotype and phenotype ratio', 'Test cross'],
  tags: ['NCERT', 'NEET', '3:1', '9:3:3:1', 'segregation', 'independent assortment', 'test cross'],
  learningObjectives: ['Fill a Punnett square from the parental gametes.', 'Compare expected ratios (3:1, 9:3:3:1) with real random samples.', 'See that small families deviate from the ratio but large samples approach it.'],
  assumptions: ['Complete dominance, independent assortment, no linkage; offspring are sampled randomly.'],
  blurb: 'Choose the parental cross, then breed random offspring. The Punnett square shows the expected ratio; the bar chart shows what really turned up in your sample.',
  hint: 'Aa x Aa gives 3 dominant : 1 recessive (1 AA : 2 Aa : 1 aa). AaBb x AaBb gives 9:3:3:1. Random sampling shows sampling error: ratios converge as n grows.',
  params: [{ kind: 'select', id: 'cross', label: 'Cross', value: 'Aa x Aa', options: Object.keys(CROSSES).map(k => ({ value: k, label: k })), resetOnChange: true }],
  actions: [{ id: 'one', label: 'Breed 1 offspring' }, { id: 'ten', label: 'Breed 10' }, { id: 'hundred', label: 'Breed 100' }, { id: 'clear', label: 'Clear' }],
  dt: 1 / 30, previewSeconds: 0,
  init() { return { counts: {}, n: 0 }; },
  step() { /* event driven */ },
  action(s, v, id) {
    const cr = CROSSES[str(v, 'cross')]; if (id === 'clear') { s.counts = {}; s.n = 0; return; }
    const pool = offspring(cr.p1, cr.p2), k = id === 'one' ? 1 : id === 'ten' ? 10 : 100;
    for (let i = 0; i < k; i++) { const g = pool[Math.floor(Math.random() * pool.length)]; const ph = pheno(g); s.counts[ph] = (s.counts[ph] ?? 0) + 1; const gk = 'g:' + g; s.counts[gk] = (s.counts[gk] ?? 0) + 1; s.n++; }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const cr = CROSSES[str(v, 'cross')], ga = gametes(cr.p1), gb = gametes(cr.p2), pool = offspring(cr.p1, cr.p2);
    const gs = Math.min((h * 0.8) / (ga.length + 1), (w * 0.45) / (gb.length + 1), 60), x0 = 14, y0 = 40;
    text(c, `${cr.p1}  ×  ${cr.p2}`, x0, 22, C.text, 14, 'left', 'alphabetic', true);
    gb.forEach((g, j) => text(c, g, x0 + gs * (j + 1.5), y0 + gs * 0.6, C.amber, 13, 'center', 'alphabetic', true));
    ga.forEach((g, i) => text(c, g, x0 + gs * 0.5, y0 + gs * (i + 1.6), C.cyan, 13, 'center', 'alphabetic', true));
    ga.forEach((a, i) => gb.forEach((b, j) => { const g = cr.dihybrid ? sortGeno(a[0] + b[0] + a[1] + b[1]) : sortGeno(a + b); const dom = pheno(g); c.fillStyle = dom.startsWith('Dom') || dom === 'A_B_' ? 'rgba(52,211,153,0.28)' : dom === 'recessive' || dom === 'aabb' ? 'rgba(248,113,113,0.28)' : 'rgba(251,191,36,0.25)'; c.fillRect(x0 + gs * (j + 1), y0 + gs * (i + 1), gs - 2, gs - 2); text(c, g, x0 + gs * (j + 1.5), y0 + gs * (i + 1.5) + 4, C.text, gs < 40 ? 9 : 11, 'center'); }));
    // phenotype bars
    const keys = cr.dihybrid ? ['A_B_', 'A_bb', 'aaB_', 'aabb'] : ['Dominant', 'recessive'];
    const exp = keys.map(k => pool.filter(g => pheno(g) === k).length / pool.length);
    const R = { x: w * 0.52, y: 10, w: w * 0.46, h: h - 20 }; panel(c, R);
    text(c, `Phenotypes (n = ${s.n})`, R.x + 8, R.y + 16, C.text, 12, 'left', 'alphabetic', true);
    const bw = (R.w - 24) / keys.length;
    keys.forEach((k, i) => {
      const obs = s.n ? (s.counts[k] ?? 0) / s.n : 0, bx = R.x + 12 + i * bw, base = R.y + R.h - 28, top = R.y + 36, H = base - top;
      c.fillStyle = 'rgba(148,163,184,0.25)'; c.fillRect(bx + 6, base - exp[i] * H, bw - 12, exp[i] * H); c.fillStyle = C.cyan; c.fillRect(bx + 14, base - obs * H, bw - 28, obs * H);
      text(c, k, bx + bw / 2, base + 14, C.dim, 10, 'center'); text(c, `${fmt(obs * 100, 0)}%`, bx + bw / 2, base - obs * H - 4, C.text, 10, 'center');
    });
    text(c, 'grey = expected, blue = observed', R.x + 8, R.y + R.h - 6, C.dim, 9);
  },
  readouts(s, v) {
    const cr = CROSSES[str(v, 'cross')], pool = offspring(cr.p1, cr.p2); const keys = cr.dihybrid ? ['A_B_', 'A_bb', 'aaB_', 'aabb'] : ['Dominant', 'recessive'];
    return [{ label: 'Offspring bred', value: s.n, digits: 0 }, ...keys.map(k => ({ label: `${k}: expected / observed`, value: `${fmt(100 * pool.filter(g => pheno(g) === k).length / pool.length, 1)}% / ${s.n ? fmt(100 * (s.counts[k] ?? 0) / s.n, 1) : '-'}%` }))];
  },
  equations(_s, v) { const cr = CROSSES[str(v, 'cross')]; return cr.dihybrid ? ['AaBb \\times AaBb \\Rightarrow 9:3:3:1'] : [cr.p1 === 'Aa' && cr.p2 === 'Aa' ? 'Aa \\times Aa \\Rightarrow 1\\,AA : 2\\,Aa : 1\\,aa = 3:1' : `${cr.p1} \\times ${cr.p2}`]; },
});

/* ================================================================== */
/*  Enzyme kinetics                                                    */
/* ================================================================== */
interface EnS { S: number }
const mmRate = (S: number, Vmax: number, Km: number, I: number, Ki: number, kind: string) => kind === 'competitive' ? Vmax * S / (Km * (1 + I / Ki) + S) : kind === 'noncompetitive' ? (Vmax / (1 + I / Ki)) * S / (Km + S) : Vmax * S / (Km + S);
export const enzyme = defineSim<EnS>({
  id: 'enzyme_kinetics', title: 'Enzyme Kinetics: Michaelis-Menten & Inhibition',
  ...meta('Biology', L('Class 12', 'B.Sc', 'B.Tech'), 'Advanced', 'Biochemistry', 'Enzymes', 'Michaelis-Menten kinetics, Lineweaver-Burk plot, inhibitors'),
  covers: ['Michaelis-Menten equation', 'Km and Vmax', 'Competitive inhibition', 'Non-competitive inhibition', 'Lineweaver-Burk plot'],
  tags: ['NEET', 'biochemistry', 'enzyme', 'substrate concentration', 'double reciprocal', 'Ki'],
  learningObjectives: ['Read Km (half-maximal substrate) and Vmax from the saturation curve.', 'Distinguish competitive from non-competitive inhibition on both plots.', 'Use the Lineweaver-Burk intercepts to extract Km and Vmax.'],
  assumptions: ['Steady-state single-substrate enzyme; reversible inhibition with a single Ki.'],
  blurb: 'Raise the substrate concentration and see the reaction velocity saturate. Add an inhibitor and compare how competitive and non-competitive inhibition change Km and Vmax.',
  hint: 'v = Vmax[S]/(Km+[S]). Competitive inhibitor raises apparent Km (Vmax unchanged, overcome by more substrate). Non-competitive lowers Vmax (Km unchanged). Lineweaver-Burk: 1/v = (Km/Vmax)(1/S) + 1/Vmax.',
  params: [
    { kind: 'number', id: 'S', label: 'Substrate [S]', min: 0.05, max: 10, step: 0.05, value: 1, unit: 'mM', digits: 2 },
    { kind: 'number', id: 'Vmax', label: 'Vmax', min: 1, max: 20, step: 0.5, value: 10, unit: 'µmol/min', digits: 1 },
    { kind: 'number', id: 'Km', label: 'Km', min: 0.2, max: 5, step: 0.1, value: 1.5, unit: 'mM', digits: 1 },
    { kind: 'select', id: 'inh', label: 'Inhibitor', value: 'competitive', options: [{ value: 'none', label: 'None' }, { value: 'competitive', label: 'Competitive' }, { value: 'noncompetitive', label: 'Non-competitive' }] },
    { kind: 'number', id: 'I', label: 'Inhibitor [I]', min: 0, max: 10, step: 0.1, value: 2, unit: 'mM', digits: 1 },
    { kind: 'toggle', id: 'lb', label: 'Show Lineweaver-Burk', value: true },
  ],
  dt: 1 / 30, previewSeconds: 0,
  init() { return { S: 1 }; }, step() { /* static */ },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const S = num(v, 'S'), Vm = num(v, 'Vmax'), Km = num(v, 'Km'), I = num(v, 'I'), kind = str(v, 'inh'), Ki = 1.5;
    const A = { x: 8, y: 8, w: bool(v, 'lb') ? w * 0.52 : w - 16, h: h - 16 };
    const m = plot(c, A, [0, 10], [0, Vm * 1.1], { title: 'Velocity vs substrate', xlabel: '[S] (mM)' });
    const curve = (fn: (x: number) => number, col: string, dash?: number[]) => { const p: [number, number][] = []; for (let k = 0; k <= 100; k++) { const x = k / 10; p.push([m.X(x), m.Y(fn(x))]); } polyline(c, p, col, 2.2, dash); };
    curve(x => mmRate(x, Vm, Km, 0, Ki, 'none'), 'rgba(148,163,184,0.8)', [5, 4]); if (kind !== 'none') curve(x => mmRate(x, Vm, Km, I, Ki, kind), C.red); else curve(x => mmRate(x, Vm, Km, 0, Ki, 'none'), C.cyan);
    line(c, m.X(0), m.Y(Vm), m.X(10), m.Y(Vm), 'rgba(251,191,36,0.5)', 1, [3, 3]); text(c, 'Vmax', m.X(9.8), m.Y(Vm) - 4, C.amber, 10, 'right');
    const v0 = mmRate(S, Vm, Km, kind === 'none' ? 0 : I, Ki, kind); circle(c, m.X(S), m.Y(v0), 5.5, C.amber, C.white, 1.5);
    text(c, 'dashed = no inhibitor', A.x + A.w - 8, A.y + 34, C.dim, 10, 'right');
    if (bool(v, 'lb')) {
      const B = { x: A.x + A.w + 8, y: 8, w: w - A.w - 32, h: h - 16 }; const xs = 1 / 0.2;
      const mb = plot(c, B, [-1.2 / Km - 0.2, xs], [-0.5 / Vm, 1.2 * (1 + (kind === 'competitive' ? 1 + I / Ki : kind === 'noncompetitive' ? I / Ki : 0)) / Vm * 2], { title: 'Lineweaver-Burk', xlabel: '1/[S]', zeroAxis: true });
      const draw = (Kapp: number, Vapp: number, col: string, dash?: number[]) => { const f = (x: number) => (Kapp / Vapp) * x + 1 / Vapp; polyline(c, [[mb.X(-1 / Kapp - 0.1), mb.Y(f(-1 / Kapp - 0.1))], [mb.X(xs), mb.Y(f(xs))]], col, 2, dash); };
      draw(Km, Vm, 'rgba(148,163,184,0.8)', [5, 4]);
      if (kind !== 'none') draw(kind === 'competitive' ? Km * (1 + I / Ki) : Km, kind === 'noncompetitive' ? Vm / (1 + I / Ki) : Vm, C.red);
    }
  },
  readouts(_s, v) {
    const Vm = num(v, 'Vmax'), Km = num(v, 'Km'), I = num(v, 'I'), kind = str(v, 'inh'), Ki = 1.5, S = num(v, 'S');
    const Kapp = kind === 'competitive' ? Km * (1 + I / Ki) : Km, Vapp = kind === 'noncompetitive' ? Vm / (1 + I / Ki) : Vm;
    return [{ label: 'Velocity v', value: mmRate(S, Vm, Km, kind === 'none' ? 0 : I, Ki, kind), unit: 'µmol/min', digits: 2 }, { label: 'Apparent Km', value: kind === 'none' ? Km : Kapp, unit: 'mM', digits: 2 }, { label: 'Apparent Vmax', value: kind === 'none' ? Vm : Vapp, unit: 'µmol/min', digits: 2 }, { label: 'v / Vmax', value: mmRate(S, Vm, Km, kind === 'none' ? 0 : I, Ki, kind) / Vm, digits: 2 }];
  },
  equations(_s, v) { return ['v = \\dfrac{V_{max}[S]}{K_m + [S]}', `\\dfrac{1}{v} = \\dfrac{K_m}{V_{max}}\\dfrac{1}{[S]} + \\dfrac{1}{V_{max}}`, `K_m = ${fmt(num(v, 'Km'), 1)}\\ \\text{mM},\\ V_{max}=${fmt(num(v, 'Vmax'), 1)}`]; },
});

/* ================================================================== */
/*  Seismic waves: locate an earthquake                                */
/* ================================================================== */
interface SeS { t: number; running: boolean }
const VP = 6.0, VS = 3.5; // km/s crust
export const seismic = defineSim<SeS>({
  id: 'seismic_waves', title: 'Earthquake Waves: P and S Arrival & Epicentre Distance',
  ...meta('Earth Science', [...SCHOOL_ALL, 'B.Sc'], 'Intermediate', 'Geology', 'Earth Interior and Seismology', 'P and S waves, S-P interval, epicentre location'),
  covers: ['P waves and S waves', 'Seismograph', 'S-P time interval', 'Epicentre location', 'Plate tectonics earthquakes'],
  tags: ['NCERT', 'geography', 'seismology', 'focus', 'epicentre', 'primary secondary waves', 'Richter'],
  learningObjectives: ['Explain why P waves (faster, compressional) arrive before S waves.', 'Compute epicentre distance from the S-P lag.', 'Locate an epicentre by combining distances from three stations.'],
  assumptions: ['Constant wave speeds in a uniform crust (P 6.0, S 3.5 km/s); straight-line travel; flat 2D map.'],
  blurb: 'An earthquake strikes at a chosen place. Wavefronts spread out; three seismic stations record P and S arrivals, and the S-P gap gives each station\'s distance to the epicentre.',
  hint: 'Distance = (t_S − t_P) · vP·vS/(vP − vS). Three circles around three stations intersect at the epicentre. S waves cannot travel through liquids (outer core).',
  params: [
    { kind: 'number', id: 'vp', label: 'P-wave speed', min: 4, max: 8, step: 0.1, value: VP, unit: 'km/s', digits: 1 },
    { kind: 'number', id: 'vs', label: 'S-wave speed', min: 2, max: 4.5, step: 0.1, value: VS, unit: 'km/s', digits: 1 },
    { kind: 'toggle', id: 'circ', label: 'Show distance circles from S-P', value: true },
  ],
  actions: [{ id: 'quake', label: 'Trigger earthquake' }],
  dt: 1 / 60, previewSeconds: 0,
  init() { return { t: 0, running: true }; },
  step(s, _v, dt) { if (s.running) { s.t += dt * 12; if (s.t > 90) s.t = 0; } },
  action(s, _v, id) { if (id === 'quake') { s.t = 0; s.running = true; } },
  pointer(s, _v, e) { if (e.kind === 'down') { (s as unknown as { ex?: number; ey?: number }).ex = e.x / e.w; (s as unknown as { ex?: number; ey?: number }).ey = e.y / e.h; } },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const sx = s as unknown as { ex?: number; ey?: number }; const vp = num(v, 'vp'), vs = num(v, 'vs');
    const M = { x: 8, y: 8, w: w * 0.5, h: h - 16 }; panel(c, M);
    const km = 400, pxk = Math.min(M.w, M.h) / km; const ox = M.x + M.w / 2 - (km * pxk) / 2, oy = M.y + M.h / 2 - (km * pxk) / 2;
    const ex = sx.ex != null ? clamp((sx.ex * w - ox) / pxk, 20, 380) : 150, ey = sx.ey != null ? clamp((sx.ey * h - oy) / pxk, 20, 380) : 180;
    const st = [[60, 60], [340, 90], [200, 340]];
    c.strokeStyle = C.grid; for (let k = 0; k <= 4; k++) { line(c, ox + k * 100 * pxk, oy, ox + k * 100 * pxk, oy + km * pxk, C.grid); line(c, ox, oy + k * 100 * pxk, ox + km * pxk, oy + k * 100 * pxk, C.grid); }
    text(c, 'click map to move the epicentre (400 km square)', M.x + 8, M.y + M.h - 6, C.dim, 9);
    const tt = s.running ? s.t : 0;
    if (s.running) { for (const [vv, col] of [[vp, C.cyan], [vs, C.amber]] as const) { c.beginPath(); c.arc(ox + ex * pxk, oy + ey * pxk, vv * tt * pxk, 0, TAU); c.strokeStyle = col; c.lineWidth = 2; c.stroke(); } }
    circle(c, ox + ex * pxk, oy + ey * pxk, 5, C.red, C.white, 1.5);
    const traces = st.map(([x, y]) => { const d = Math.hypot(x - ex, y - ey); return { x, y, d, tp: d / vp, ts: d / vs }; });
    traces.forEach((q, i) => { c.save(); c.translate(ox + q.x * pxk, oy + q.y * pxk); c.beginPath(); c.moveTo(0, -8); c.lineTo(7, 6); c.lineTo(-7, 6); c.closePath(); c.fillStyle = C.green; c.fill(); c.restore(); text(c, `S${i + 1}`, ox + q.x * pxk + 9, oy + q.y * pxk + 4, C.green, 10);
      if (bool(v, 'circ') && s.running && tt > q.ts) { c.beginPath(); c.arc(ox + q.x * pxk, oy + q.y * pxk, ((q.ts - q.tp) * vp * vs / (vp - vs)) * pxk, 0, TAU); c.strokeStyle = 'rgba(52,211,153,0.6)'; c.lineWidth = 1.2; c.stroke(); } });
    // seismograms
    const G = { x: M.x + M.w + 8, y: 8, w: w - M.w - 24, h: (h - 24) / 3 };
    traces.forEach((q, i) => {
      const r = { x: G.x, y: G.y + i * (G.h + 4), w: G.w, h: G.h }; panel(c, r); const T = 70, mx = (t: number) => r.x + 8 + (t / T) * (r.w - 16), my = r.y + r.h / 2;
      line(c, r.x + 8, my, r.x + r.w - 8, my, C.grid); const pts: [number, number][] = [];
      for (let t = 0; t <= Math.min(tt, T); t += 0.25) { let a = 0; if (t > q.tp) a += Math.exp(-(t - q.tp) / 4) * Math.sin((t - q.tp) * 6) * 0.35; if (t > q.ts) a += Math.exp(-(t - q.ts) / 7) * Math.sin((t - q.ts) * 3.2) * 0.85; pts.push([mx(t), my - a * r.h * 0.38]); }
      if (pts.length > 1) polyline(c, pts, C.cyan, 1.4);
      text(c, `S${i + 1}: S−P = ${fmt(q.ts - q.tp, 1)} s → d = ${fmt((q.ts - q.tp) * vp * vs / (vp - vs), 0)} km`, r.x + 6, r.y + 12, C.text, 9);
    });
  },
  readouts(s, v) {
    const sx = s as unknown as { ex?: number }; void sx; const vp = num(v, 'vp'), vs = num(v, 'vs');
    return [{ label: 'Distance per second of S-P lag', value: vp * vs / (vp - vs), unit: 'km/s', digits: 2 }, { label: 'Elapsed (model time)', value: s.running ? s.t : 0, unit: 's', digits: 1 }, { label: 'P/S speed ratio', value: vp / vs, digits: 2 }];
  },
  equations(_s, v) { const vp = num(v, 'vp'), vs = num(v, 'vs'); return ['d = (t_S - t_P)\\,\\dfrac{v_P v_S}{v_P - v_S}', `d = ${fmt(vp * vs / (vp - vs), 2)}\\,(t_S - t_P)\\ \\text{km}`]; },
});

/* ================================================================== */
/*  Seasons                                                            */
/* ================================================================== */
interface SnS { day: number }
export const seasons = defineSim<SnS>({
  id: 'seasons_axial_tilt', title: "Earth's Seasons: Axial Tilt, Declination & Day Length",
  ...meta('Earth Science', [...SCHOOL_ALL, 'B.Sc'], 'Beginner', 'Astronomy', 'Earth, Sun and Seasons', 'Axial tilt, solstices, equinoxes, day length'),
  covers: ['Seasons', 'Axial tilt', 'Solstice and equinox', 'Length of day vs latitude', 'Solar declination'],
  tags: ['NCERT', 'geography', 'tropic of cancer', 'midnight sun', 'sun angle', 'insolation'],
  learningObjectives: ['Explain that seasons come from the 23.5° tilt, not from distance to the Sun.', 'Read day length at any latitude through the year.', 'Find the noon Sun altitude = 90° − |latitude − declination|.'],
  assumptions: ['Circular orbit; declination follows a sinusoid δ = ε sin(2π(d−80)/365); atmospheric refraction ignored.'],
  blurb: 'Move through the year and watch the tilted Earth orbit the Sun. The day-length curve and noon Sun height update for the latitude you choose; change the tilt to see a world with different seasons.',
  hint: 'Declination δ = tilt·sin(2π(d−80)/365). Day length: cos H = −tanφ tanδ, hours = 2H/15°. At the Arctic circle in June the Sun does not set. Noon altitude = 90° − |φ − δ|.',
  params: [
    { kind: 'number', id: 'day', label: 'Day of year', min: 1, max: 365, step: 1, value: 172, digits: 0 },
    { kind: 'number', id: 'lat', label: 'Latitude', min: -90, max: 90, step: 1, value: 28, unit: '°', digits: 0 },
    { kind: 'number', id: 'tilt', label: 'Axial tilt', min: 0, max: 60, step: 0.5, value: 23.5, unit: '°', digits: 1 },
    { kind: 'toggle', id: 'auto', label: 'Animate the year', value: false },
  ],
  dt: 1 / 60, previewSeconds: 0,
  init(v) { return { day: num(v, 'day') }; },
  step(s, v, dt) { if (bool(v, 'auto')) s.day = (s.day + dt * 20) % 365; else s.day = num(v, 'day'); },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const tilt = num(v, 'tilt'), lat = num(v, 'lat'), d = s.day; const dec = tilt * Math.sin(TAU * (d - 80) / 365);
    const O = { x: 8, y: 8, w: w * 0.46, h: h - 16 }; panel(c, O); const cx = O.x + O.w / 2, cy = O.y + O.h / 2, R = Math.min(O.w, O.h) * 0.36;
    circle(c, cx, cy, 16, C.amber); c.beginPath(); c.ellipse(cx, cy, R, R * 0.45, 0, 0, TAU); c.strokeStyle = 'rgba(148,163,184,0.4)'; c.stroke();
    const a = TAU * (d - 80) / 365 + Math.PI; const ex = cx + Math.cos(a) * R, ey = cy + Math.sin(a) * R * 0.45;
    circle(c, ex, ey, 10, C.blue); const tx = Math.sin(rad(tilt)) * 22; line(c, ex - tx, ey - 22, ex + tx, ey + 22, C.white, 2);
    text(c, 'Sun', cx, cy + 30, C.dim, 10, 'center'); text(c, `day ${Math.round(d)}`, O.x + 8, O.y + 16, C.text, 12, 'left', 'alphabetic', true);
    text(c, `declination δ = ${fmt(dec, 1)}°`, O.x + 8, O.y + O.h - 8, C.amber, 11);
    const P = { x: O.x + O.w + 8, y: 8, w: w - O.w - 24, h: h * 0.55 };
    const m = plot(c, P, [0, 365], [0, 24], { title: `Day length at latitude ${lat}°`, xlabel: 'day of year', ystep: 6 });
    const dl = (day: number) => { const dd = rad(tilt * Math.sin(TAU * (day - 80) / 365)), x = -Math.tan(rad(lat)) * Math.tan(dd); return x >= 1 ? 0 : x <= -1 ? 24 : (2 * deg(Math.acos(x))) / 15; };
    const pts: [number, number][] = []; for (let k = 1; k <= 365; k += 3) pts.push([m.X(k), m.Y(dl(k))]); polyline(c, pts, C.cyan, 2.2); circle(c, m.X(d), m.Y(dl(d)), 5, C.amber, C.white, 1.5);
    const Q = { x: P.x, y: P.y + P.h + 8, w: P.w, h: h - P.h - 24 }; panel(c, Q);
    const alt = 90 - Math.abs(lat - dec); const gx = Q.x + Q.w / 2, gy = Q.y + Q.h - 16;
    line(c, Q.x + 10, gy, Q.x + Q.w - 10, gy, C.axis, 2); const L2 = Math.min(Q.w * 0.4, Q.h * 0.8); const ang = rad(clamp(alt, 0, 90));
    arrow(c, gx - Math.cos(ang) * L2, gy - Math.sin(ang) * L2, gx, gy - 2, C.amber, 2.5, 9); text(c, `noon Sun altitude ${fmt(Math.max(alt, 0), 1)}°`, Q.x + 8, Q.y + 16, C.text, 11, 'left', 'alphabetic', true);
  },
  readouts(s, v) {
    const tilt = num(v, 'tilt'), lat = num(v, 'lat'), d = s.day, dec = tilt * Math.sin(TAU * (d - 80) / 365), x = -Math.tan(rad(lat)) * Math.tan(rad(dec));
    const hrs = x >= 1 ? 0 : x <= -1 ? 24 : (2 * deg(Math.acos(x))) / 15;
    return [{ label: 'Declination', value: dec, unit: '°', digits: 1 }, { label: 'Day length', value: hrs, unit: 'h', digits: 2 }, { label: 'Noon Sun altitude', value: Math.max(90 - Math.abs(lat - dec), 0), unit: '°', digits: 1 }, { label: 'Season (north)', value: dec > tilt * 0.7 ? 'summer' : dec < -tilt * 0.7 ? 'winter' : (d > 80 && d < 172 ? 'spring' : d >= 172 && d < 266 ? 'summer-autumn' : d >= 266 && d < 355 ? 'autumn' : 'winter-spring') }];
  },
  equations(s, v) { const tilt = num(v, 'tilt'); const dec = tilt * Math.sin(TAU * (s.day - 80) / 365); return ['\\delta = \\varepsilon \\sin\\!\\left(\\dfrac{2\\pi (d-80)}{365}\\right)', `\\delta = ${fmt(dec, 1)}^\\circ`, '\\cos H = -\\tan\\varphi\\,\\tan\\delta,\\quad \\text{day length} = \\dfrac{2H}{15^\\circ/\\text{h}}']; },
});

/* ================================================================== */
/*  Moon phases & eclipses                                             */
/* ================================================================== */
interface MoS { a: number }
export const moonPhases = defineSim<MoS>({
  id: 'moon_phases_eclipses', title: 'Moon Phases & Eclipses',
  ...meta('Earth Science', [...SCHOOL_ALL], 'Beginner', 'Astronomy', 'The Sun-Earth-Moon System', 'Phases of the Moon, solar and lunar eclipses'),
  covers: ['Phases of the Moon', 'Solar eclipse', 'Lunar eclipse', 'Lunar orbit inclination', 'Sidereal and synodic month'],
  tags: ['NCERT', 'new moon', 'full moon', 'umbra', 'penumbra', 'nodes', 'waxing waning'],
  learningObjectives: ['Link the Moon\'s position in its orbit to the part of its lit face we see.', 'Explain why eclipses do not happen every month (orbit tilt of about 5°).', 'Tell lunar from solar eclipse conditions.'],
  assumptions: ['Circular orbits; sizes and distances not to scale; tilt exaggerated in the side view.'],
  blurb: 'The Moon orbits Earth under sunlight from the left. See the phase from Earth, the top view of the geometry and a side view that shows why most new and full moons miss the shadow.',
  hint: 'Illuminated fraction = (1 − cos θ)/2 where θ is the Sun-Earth-Moon elongation. Eclipse needs new/full moon near an orbital node (|Moon latitude| small). Synodic month 29.53 days.',
  params: [
    { kind: 'number', id: 'age', label: 'Moon age', min: 0, max: 29.5, step: 0.1, value: 7, unit: 'days', digits: 1 },
    { kind: 'number', id: 'node', label: 'Node angle (orbit tilt phase)', min: 0, max: 360, step: 1, value: 20, unit: '°', digits: 0 },
    { kind: 'toggle', id: 'auto', label: 'Animate', value: true },
  ],
  dt: 1 / 60, previewSeconds: 3,
  init(v) { return { a: num(v, 'age') / 29.53 * TAU }; },
  step(s, v, dt) { if (bool(v, 'auto')) s.a = (s.a + dt * 0.5) % TAU; else s.a = num(v, 'age') / 29.53 * TAU; },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const T = { x: 8, y: 8, w: w * 0.5, h: h * 0.62 }; panel(c, T); const cx = T.x + T.w / 2 + 10, cy = T.y + T.h / 2, R = Math.min(T.w, T.h) * 0.34;
    text(c, 'sunlight →', T.x + 8, T.y + 16, C.amber, 11); for (let k = 0; k < 7; k++) arrow(c, T.x + 8, T.y + 30 + k * ((T.h - 50) / 6), T.x + 34, T.y + 30 + k * ((T.h - 50) / 6), 'rgba(251,191,36,0.6)', 1.5, 5);
    circle(c, cx, cy, 15, C.blue); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.strokeStyle = C.grid; c.stroke();
    const mx = cx - Math.cos(s.a) * R, my = cy - Math.sin(s.a) * R; // age 0 = new moon: moon between Earth and Sun (left)
    c.beginPath(); c.arc(mx, my, 8, Math.PI / 2, Math.PI * 1.5); c.fillStyle = '#e2e8f0'; c.fill(); c.beginPath(); c.arc(mx, my, 8, -Math.PI / 2, Math.PI / 2); c.fillStyle = '#334155'; c.fill();
    text(c, 'top view (not to scale)', T.x + 8, T.y + T.h - 6, C.dim, 9);
    const el = s.a, illum = (1 - Math.cos(el)) / 2;
    // phase disc
    const D = { x: T.x + T.w + 8, y: 8, w: w - T.w - 24, h: h * 0.62 }; panel(c, D); const dx = D.x + D.w / 2, dy = D.y + D.h / 2, r = Math.min(D.w, D.h) * 0.34;
    circle(c, dx, dy, r, '#1e293b', C.dim, 1);
    const waxing = Math.sin(s.a) >= 0, k = Math.cos(s.a), sgn = waxing ? 1 : -1;
    c.save(); c.beginPath(); c.arc(dx, dy, r, 0, TAU); c.clip();
    c.fillStyle = '#f1f5f9'; c.beginPath(); c.arc(dx, dy, r, -Math.PI / 2, Math.PI / 2, !waxing); c.closePath(); c.fill();
    c.fillStyle = k > 0 ? '#1e293b' : '#f1f5f9'; c.beginPath(); c.ellipse(dx, dy, Math.abs(k) * r, r, 0, 0, TAU); c.fill();
    void sgn;
    c.restore(); text(c, 'as seen from Earth', D.x + D.w / 2, D.y + D.h - 8, C.dim, 10, 'center');
    // side view
    const S = { x: 8, y: T.y + T.h + 8, w: w - 16, h: h - T.h - 24 }; panel(c, S); const sy = S.y + S.h / 2, node = rad(num(v, 'node'));
    const lat = Math.sin(s.a + node) * 5.1; const ex0 = S.x + S.w * 0.5; const scx = S.w * 0.38;
    line(c, S.x + 10, sy, S.x + S.w - 10, sy, C.axis, 1); circle(c, ex0, sy, 8, C.blue); circle(c, S.x + 30, sy, 10, C.amber);
    const mxs = ex0 - Math.cos(s.a) * scx, mys = sy - lat * (S.h / 2 / 7); circle(c, mxs, mys, 5, '#e2e8f0'); text(c, 'side view: orbit tilted 5.1° (exaggerated)', S.x + 10, S.y + S.h - 5, C.dim, 9);
    const newM = Math.cos(s.a) > 0.985, fullM = Math.cos(s.a) < -0.985, near = Math.abs(lat) < 1.2;
    const ev = newM ? (near ? 'SOLAR ECLIPSE' : 'New moon: shadow passes above/below') : fullM ? (near ? 'LUNAR ECLIPSE' : 'Full moon: misses Earth\'s shadow') : '';
    if (ev) text(c, ev, S.x + S.w - 10, S.y + 18, near ? C.red : C.dim, 12, 'right', 'alphabetic', true);
    void illum;
  },
  readouts(s, v) {
    const age = (s.a / TAU) * 29.53, illum = (1 - Math.cos(s.a)) / 2, name = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'][Math.round((s.a / TAU) * 8) % 8];
    const lat = Math.sin(s.a + rad(num(v, 'node'))) * 5.1; return [{ label: 'Phase', value: name }, { label: 'Moon age', value: age, unit: 'days', digits: 1 }, { label: 'Illuminated', value: illum * 100, unit: '%', digits: 0 }, { label: 'Moon ecliptic latitude', value: lat, unit: '°', digits: 2 }];
  },
  equations(s) { return ['f = \\dfrac{1-\\cos\\theta}{2}', `f = ${fmt((1 - Math.cos(s.a)) / 2, 2)},\\ \\theta = ${fmt(deg(s.a), 0)}^\\circ`]; },
});

export const SCHOOL_BIO_EARTH_SIMS = [mitosis, photosynthesis, punnett, enzyme, seismic, seasons, moonPhases];
void SCHOOL_11_12;
