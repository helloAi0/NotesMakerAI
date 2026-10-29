import { defineSim, num, str, bool, PG_ALL, UG_ENG } from './types';
import type { EducationLevel, Difficulty, SimSubject } from './types';
import { C, TAU, clamp, fmt, line, plot, polyline, text, circle } from './draw';

const meta = (subject: SimSubject, difficulty: Difficulty, category: string, topic: string, subtopic: string, levels: EducationLevel[] = [...PG_ALL, ...UG_ENG, 'B.Sc']) => ({
  subject, status: 'active' as const, educationLevels: levels, difficulty, category, topic, subtopic,
});
type T = { t: number };
const tick = { dt: 1 / 30, previewSeconds: 2, init: (): T => ({ t: 0 }), step: (s: T, _v: unknown, dt: number) => { s.t += dt; } };
function rng(seed: number) { let a = (seed * 2654435761) >>> 0 || 1; const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; const g = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, u()))) * Math.cos(TAU * u()); return { u, g }; }

/* ================= Bloch sphere ================= */
type Cx = [number, number];
const cmul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cadd = (a: Cx, b: Cx): Cx => [a[0] + b[0], a[1] + b[1]];
type Mat = [[Cx, Cx], [Cx, Cx]];
const R2 = Math.SQRT1_2;
const GATES: Record<string, Mat> = {
  X: [[[0, 0], [1, 0]], [[1, 0], [0, 0]]], Y: [[[0, 0], [0, -1]], [[0, 1], [0, 0]]], Z: [[[1, 0], [0, 0]], [[0, 0], [-1, 0]]],
  H: [[[R2, 0], [R2, 0]], [[R2, 0], [-R2, 0]]], S: [[[1, 0], [0, 0]], [[0, 0], [0, 1]]], T: [[[1, 0], [0, 0]], [[0, 0], [R2, R2]]],
};
interface BlS { a: Cx; b: Cx; hist: string[]; meas: [number, number]; seed: number }
const bloch = (s: BlS) => { const x = 2 * (s.a[0] * s.b[0] + s.a[1] * s.b[1]), y = 2 * (s.a[0] * s.b[1] - s.a[1] * s.b[0]), z = s.a[0] ** 2 + s.a[1] ** 2 - s.b[0] ** 2 - s.b[1] ** 2; return [x, y, z]; };
export const blochSphere = defineSim<BlS>({
  id: 'bloch_sphere_qubit_gates', title: 'Qubit on the Bloch Sphere: Gates, Superposition & Measurement',
  ...meta('Quantum', 'Intermediate', 'Quantum Computing', 'Single-Qubit Gates', 'Bloch vector, Pauli/Hadamard/phase gates, projective measurement'),
  covers: ['Qubit', 'Bloch sphere', 'Quantum gate', 'Hadamard gate', 'Pauli matrices', 'Superposition', 'Quantum measurement', 'Born rule', 'Phase gate'],
  tags: ['quantum computing', 'M.Sc', 'M.Tech', 'qubit', 'unitary', 'BCA', 'CS'],
  learningObjectives: ['Map |ψ⟩=cos(θ/2)|0⟩+e^{iφ}sin(θ/2)|1⟩ to a point on the sphere.', 'See gates as rotations; measure repeatedly to confirm the Born-rule probabilities.'],
  assumptions: ['Ideal noiseless single qubit; measurement collapses the state and the tally uses a seeded pseudo-random generator.'],
  blurb: 'Set the initial qubit with θ and φ, then apply X, Y, Z, H, S and T gates and watch the Bloch vector rotate. Measure many times to see the Born-rule statistics.',
  hint: 'Gates are 2×2 unitaries. X,Y,Z = π rotations about x,y,z; H swaps x↔z; S = π/2 about z; T = π/4 about z. P(0)=cos²(θ/2)=(1+z)/2.',
  params: [
    { kind: 'number', id: 'theta', label: 'Initial θ (°)', min: 0, max: 180, step: 5, value: 60, digits: 0, resetOnChange: true },
    { kind: 'number', id: 'phi', label: 'Initial φ (°)', min: 0, max: 360, step: 5, value: 45, digits: 0, resetOnChange: true },
  ],
  actions: [...Object.keys(GATES).map(g => ({ id: g, label: `Apply ${g}` })), { id: 'measure', label: 'Measure ×100' }],
  dt: 1 / 30, previewSeconds: 2,
  init(v) { const th = (num(v, 'theta') * Math.PI) / 180, ph = (num(v, 'phi') * Math.PI) / 180; return { a: [Math.cos(th / 2), 0], b: [Math.sin(th / 2) * Math.cos(ph), Math.sin(th / 2) * Math.sin(ph)], hist: [], meas: [0, 0], seed: 1 }; },
  action(s, _v, id) {
    if (id === 'measure') { const p0 = s.a[0] ** 2 + s.a[1] ** 2, R = rng(s.seed++ * 77 + 5); let n0 = 0; for (let i = 0; i < 100; i++) if (R.u() < p0) n0++; s.meas = [n0, 100 - n0]; return; }
    const G = GATES[id]; if (!G) return;
    const na = cadd(cmul(G[0][0], s.a), cmul(G[0][1], s.b)), nb = cadd(cmul(G[1][0], s.a), cmul(G[1][1], s.b)); s.a = na; s.b = nb; s.hist.push(id); if (s.hist.length > 12) s.hist.shift(); s.meas = [0, 0];
  },
  step(s, _v, dt) { void dt; },
  draw(c, s, _v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const R = Math.min(h * 0.38, w * 0.26), cx = w * 0.3, cy = h * 0.5, [x, y, z] = bloch(s), az = 0.6, el = 0.35;
    const proj = (px: number, py: number, pz: number): [number, number] => { const X1 = px * Math.cos(az) - py * Math.sin(az), Y1 = px * Math.sin(az) + py * Math.cos(az); return [cx + R * X1, cy - R * (pz * Math.cos(el) - Y1 * Math.sin(el))]; };
    c.strokeStyle = 'rgba(148,163,184,0.35)'; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
    for (const [lab, p, col] of [['x', [1, 0, 0], C.red], ['y', [0, 1, 0], C.green], ['|0⟩', [0, 0, 1], C.cyan], ['|1⟩', [0, 0, -1], C.cyan]] as [string, number[], string][]) { const [qx, qy] = proj(p[0], p[1], p[2]); line(c, cx, cy, qx, qy, col, 1, [3, 3]); text(c, lab, qx + 4, qy - 4, col, 11); }
    c.strokeStyle = 'rgba(148,163,184,0.25)'; c.beginPath(); for (let i = 0; i <= 64; i++) { const [qx, qy] = proj(Math.cos((i / 64) * TAU), Math.sin((i / 64) * TAU), 0); if (i === 0) c.moveTo(qx, qy); else c.lineTo(qx, qy); } c.stroke();
    const [vx, vy] = proj(x, y, z); line(c, cx, cy, vx, vy, C.amber, 3); circle(c, vx, vy, 6, C.amber, C.white);
    const p0 = s.a[0] ** 2 + s.a[1] ** 2, bx = w * 0.58, bw = w * 0.22;
    text(c, 'measurement probabilities', bx, 24, C.text, 12, 'left', 'alphabetic', true);
    c.fillStyle = C.cyan; c.fillRect(bx, 36, bw * p0, 20); c.fillStyle = C.green; c.fillRect(bx, 66, bw * (1 - p0), 20);
    text(c, `P(0) = ${fmt(p0, 3)}`, bx + bw + 8, 51, C.cyan, 12, 'left', 'alphabetic', true); text(c, `P(1) = ${fmt(1 - p0, 3)}`, bx + bw + 8, 81, C.green, 12, 'left', 'alphabetic', true);
    if (s.meas[0] + s.meas[1] > 0) text(c, `100 shots: |0⟩ ×${s.meas[0]}, |1⟩ ×${s.meas[1]}`, bx, 108, C.amber, 12);
    text(c, 'gates applied: ' + (s.hist.length ? s.hist.join(' → ') : 'none'), bx, 132, C.dim, 11);
    text(c, `Bloch vector (${fmt(x, 2)}, ${fmt(y, 2)}, ${fmt(z, 2)})`, bx, 152, C.text, 11);
  },
  readouts(s) { const [x, y, z] = bloch(s); return [{ label: 'P(0)', value: fmt(s.a[0] ** 2 + s.a[1] ** 2, 3) }, { label: 'Bloch vector', value: `(${fmt(x, 2)}, ${fmt(y, 2)}, ${fmt(z, 2)})` }, { label: '|r|', value: fmt(Math.hypot(x, y, z), 3) }]; },
  equations() { return ['|\\psi\\rangle=\\cos\\tfrac\\theta2|0\\rangle+e^{i\\varphi}\\sin\\tfrac\\theta2|1\\rangle', 'H=\\tfrac1{\\sqrt2}\\begin{pmatrix}1&1\\\\1&-1\\end{pmatrix}', 'P(0)=|\\langle0|\\psi\\rangle|^2=\\tfrac{1+z}{2}']; },
});

/* ================= Quantum harmonic oscillator ================= */
function qho(n: number, x: number) { let p0 = Math.pow(Math.PI, -0.25) * Math.exp(-x * x / 2); if (n === 0) return p0; let p1 = Math.SQRT2 * x * p0; for (let k = 1; k < n; k++) { const p2 = Math.sqrt(2 / (k + 1)) * x * p1 - Math.sqrt(k / (k + 1)) * p0; p0 = p1; p1 = p2; } return p1; }
export const qhoStates = defineSim<T>({
  id: 'qho_eigenstates_classical', title: 'Quantum Harmonic Oscillator: Eigenstates vs Classical Probability',
  ...meta('Quantum', 'Advanced', 'Quantum Mechanics', 'Harmonic Oscillator', 'Hermite eigenfunctions, zero-point energy, correspondence principle'),
  covers: ['Quantum harmonic oscillator', 'Hermite polynomials', 'Zero-point energy', 'Correspondence principle', 'Classical turning points', 'Quantum tunnelling', 'Energy eigenstates'],
  tags: ['quantum mechanics', 'M.Sc', 'CSIR NET', 'JAM', 'phonon', 'vibrational spectra'],
  learningObjectives: ['See E_n=(n+½)ħω and n nodes.', 'Observe leakage into the classically forbidden region and the classical limit at large n.'],
  assumptions: ['Dimensionless units ħ = m = ω = 1; 1-D oscillator; the classical curve is the time-averaged distribution 1/(π√(A²−x²)).'],
  blurb: 'Choose n and compare |ψₙ(x)|² to the classical probability density. Read the probability of finding the particle where a classical one never goes.',
  hint: 'ψₙ recurrence: ψ_{n+1}=√(2/(n+1))xψₙ−√(n/(n+1))ψ_{n−1}. Turning points ±√(2n+1). P(forbidden)=∫|ψ|² outside. It shrinks with n (correspondence principle).',
  params: [{ kind: 'number', id: 'n', label: 'Quantum number n', min: 0, max: 20, step: 1, value: 3, digits: 0 }, { kind: 'toggle', id: 'cl', label: 'Show classical density', value: true }],
  ...tick,
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const n = Math.round(num(v, 'n')), E = n + 0.5, A = Math.sqrt(2 * E), X = Math.max(6, A + 2);
    const m = plot(c, { x: 8, y: 8, w: w - 16, h: h - 16 }, [-X, X], [0, Math.max(E + 1, 3)], { title: 'V(x)=x²/2, level E, and |ψₙ|² (scaled)', xlabel: 'x' });
    const V: [number, number][] = []; for (let i = 0; i <= 100; i++) { const x = -X + (2 * X * i) / 100; V.push([m.X(x), m.Y(Math.min(x * x / 2, E + 5))]); } polyline(c, V, C.dim, 2);
    line(c, m.X(-X), m.Y(E), m.X(X), m.Y(E), C.green, 1, [5, 4]);
    const sc = 1.2; const P: [number, number][] = [], Q: [number, number][] = []; for (let i = 0; i <= 400; i++) { const x = -X + (2 * X * i) / 400, p = qho(n, x) ** 2; P.push([m.X(x), m.Y(E + sc * p)]); if (Math.abs(x) < A - 1e-3 && bool(v, 'cl')) Q.push([m.X(x), m.Y(E + sc / (Math.PI * Math.sqrt(A * A - x * x)))]); }
    polyline(c, P, C.amber, 2.5); if (Q.length) polyline(c, Q, C.cyan, 1.5, [4, 3]);
    line(c, m.X(-A), m.Y(0), m.X(-A), m.Y(E), C.red, 1, [3, 3]); line(c, m.X(A), m.Y(0), m.X(A), m.Y(E), C.red, 1, [3, 3]);
  },
  readouts(_s, v) { const n = Math.round(num(v, 'n')), A = Math.sqrt(2 * n + 1); let out = 0; const dx = 0.01; for (let x = -12; x <= 12; x += dx) if (Math.abs(x) > A) out += qho(n, x) ** 2 * dx; return [{ label: 'Energy E', value: `${n + 0.5} ħω` }, { label: 'Classical turning point', value: '±' + fmt(A, 2) }, { label: 'P(forbidden region)', value: fmt(out * 100, 2) + ' %' }, { label: 'Nodes', value: n }]; },
  equations() { return ['E_n=\\left(n+\\tfrac12\\right)\\hbar\\omega', '\\psi_n(x)=\\dfrac{1}{\\sqrt{2^nn!}}\\pi^{-1/4}H_n(x)e^{-x^2/2}', 'P_{cl}(x)=\\dfrac1{\\pi\\sqrt{A^2-x^2}}']; },
});

/* ================= Hydrogen radial wavefunctions ================= */
function lag(k: number, al: number, x: number) { if (k === 0) return 1; let a = 1, b = 1 + al - x; for (let j = 1; j < k; j++) { const c2 = ((2 * j + 1 + al - x) * b - (j + al) * a) / (j + 1); a = b; b = c2; } return b; }
function hydR(n: number, l: number): (r: number) => number { const f = (r: number) => { const rho = (2 * r) / n; return Math.pow(rho, l) * Math.exp(-rho / 2) * lag(n - l - 1, 2 * l + 1, rho); }; let I = 0; for (let r = 0; r < 120; r += 0.01) I += f(r) ** 2 * r * r * 0.01; const N = 1 / Math.sqrt(I || 1); return r => N * f(r); }
export const hydrogenRadial = defineSim<T>({
  id: 'hydrogen_radial_orbitals', title: 'Hydrogen Atom: Radial Wavefunctions R(r), P(r) & Orbital Energies',
  ...meta('Quantum', 'Advanced', 'Quantum Mechanics', 'Hydrogen Atom', 'Radial probability, nodes, ⟨r⟩, energy levels'),
  covers: ['Hydrogen atom', 'Radial wavefunction', 'Radial probability density', 'Quantum numbers', 'Orbital nodes', 'Bohr radius', 'Energy levels', 'Laguerre polynomials'],
  tags: ['quantum mechanics', 'M.Sc', 'atomic physics', 'orbitals', 'CSIR NET', 'JAM', '1s 2p 3d'],
  learningObjectives: ['Count radial nodes n−l−1.', 'Compare the most probable radius with ⟨r⟩ and with Bohr’s orbit.'],
  assumptions: ['Non-relativistic hydrogen, point nucleus, infinite nuclear mass; atomic units (a₀ = 1); normalised numerically.'],
  blurb: 'Select n and l to plot R(r) and the radial probability P(r)=r²R². See radial nodes, the most probable radius and the energy −13.6 eV/n².',
  hint: 'R_nl ∝ ρ^l e^{−ρ/2} L^{2l+1}_{n−l−1}(ρ), ρ=2r/(na₀). ⟨r⟩=a₀[3n²−l(l+1)]/2. Radial nodes = n−l−1.',
  params: [{ kind: 'number', id: 'n', label: 'Principal n', min: 1, max: 6, step: 1, value: 3, digits: 0 }, { kind: 'number', id: 'l', label: 'Angular l (≤ n−1)', min: 0, max: 5, step: 1, value: 1, digits: 0 }, { kind: 'toggle', id: 'R', label: 'Also show R(r)', value: false }],
  ...tick,
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const n = Math.round(num(v, 'n')), l = Math.min(Math.round(num(v, 'l')), n - 1), f = hydR(n, l), rmax = Math.max(8, 2.8 * n * n + 4);
    const P: [number, number][] = [], Rr: [number, number][] = []; let pm = 0.01, rm = 0.01; for (let i = 0; i <= 300; i++) { const r = (rmax * i) / 300, p = (r * f(r)) ** 2; pm = Math.max(pm, p); rm = Math.max(rm, Math.abs(f(r))); P.push([r, p]); Rr.push([r, f(r)]); }
    const m = plot(c, { x: 8, y: 8, w: w - 16, h: h - 16 }, [0, rmax], [bool(v, 'R') ? -rm * 0.5 : 0, Math.max(pm, bool(v, 'R') ? rm : 0) * 1.1], { title: `${n}${'spdfgh'[l]} orbital: 100·P(r) (amber)${bool(v, 'R') ? ', 30·R(r) (cyan)' : ''}`, xlabel: 'r (Bohr radii)', zeroAxis: true });
    polyline(c, P.map(([r, p]) => [m.X(r), m.Y(p)] as [number, number]), C.amber, 2.5); if (bool(v, 'R')) polyline(c, Rr.map(([r, p]) => [m.X(r), m.Y(p)] as [number, number]), C.cyan, 1.8);
    const rmean = (3 * n * n - l * (l + 1)) / 2; line(c, m.X(rmean), m.Y(0), m.X(rmean), m.Y(pm * 1.05), C.green, 1, [4, 4]); text(c, '⟨r⟩', m.X(rmean) + 3, m.Y(pm * 1.0), C.green, 11);
  },
  readouts(_s, v) { const n = Math.round(num(v, 'n')), l = Math.min(Math.round(num(v, 'l')), n - 1), f = hydR(n, l); let bp = 0, br = 0; for (let r = 0.01; r < 3 * n * n + 6; r += 0.02) { const p = (r * f(r)) ** 2; if (p > bp) { bp = p; br = r; } } return [{ label: 'Orbital', value: `${n}${'spdfgh'[l]}` }, { label: 'Energy', value: fmt(-13.606 / (n * n), 3) + ' eV' }, { label: 'Radial nodes', value: n - l - 1 }, { label: 'Most probable r', value: fmt(br, 2) + ' a₀' }, { label: '⟨r⟩', value: fmt((3 * n * n - l * (l + 1)) / 2, 2) + ' a₀' }]; },
  equations() { return ['E_n=-\\dfrac{13.6\\,\\text{eV}}{n^2}', 'R_{nl}\\propto\\rho^le^{-\\rho/2}L_{n-l-1}^{2l+1}(\\rho),\\ \\rho=\\tfrac{2r}{na_0}', '\\langle r\\rangle=\\tfrac{a_0}{2}[3n^2-l(l+1)]']; },
});

/* ================= Z-transform pole–zero plot ================= */
export const poleZero = defineSim<T>({
  id: 'z_transform_pole_zero', title: 'Z-Transform: Pole–Zero Plot, Stability & Frequency Response',
  ...meta('Electronics', 'Advanced', 'Signal Processing', 'Z-Transform', 'Pole-zero plot, unit circle, stability, magnitude response'),
  covers: ['Z-transform', 'Pole-zero plot', 'Unit circle', 'Stability of discrete systems', 'Frequency response', 'Notch filter', 'Resonator', 'Transfer function'],
  tags: ['DSP', 'GATE EC', 'ECE', 'digital filter', 'IIR', 'M.Tech'],
  learningObjectives: ['See |H(e^{jω})| = product of zero distances / pole distances.', 'Place conjugate poles near the unit circle for a resonator and zeros on it for a notch.'],
  assumptions: ['Second-order section with one conjugate pole pair and one conjugate zero pair; gain normalised so that the peak response is 0 dB.'],
  blurb: 'Drag the pole and zero radius and angle. The magnitude response follows the geometry: poles near the unit circle create peaks, zeros on it create notches. Poles outside make the system unstable.',
  hint: 'H(z)=Π(z−zᵢ)/Π(z−pᵢ). |H(e^{jω})| = Π|e^{jω}−zᵢ|/Π|e^{jω}−pᵢ|. Causal system is BIBO stable iff all poles satisfy |p|<1.',
  params: [
    { kind: 'number', id: 'pr', label: 'Pole radius', min: 0, max: 1.2, step: 0.01, value: 0.9, digits: 2 }, { kind: 'number', id: 'pa', label: 'Pole angle (° of fs/2·)', min: 0, max: 180, step: 1, value: 60, digits: 0 },
    { kind: 'number', id: 'zr', label: 'Zero radius', min: 0, max: 1.2, step: 0.01, value: 1, digits: 2 }, { kind: 'number', id: 'za', label: 'Zero angle (°)', min: 0, max: 180, step: 1, value: 110, digits: 0 },
  ],
  ...tick,
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const sz = Math.min(h - 16, w * 0.42), cx = 8 + sz / 2, cy = h / 2, sc = sz / 2 / 1.4;
    c.strokeStyle = C.axis; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, sc, 0, TAU); c.stroke(); line(c, cx - sz / 2, cy, cx + sz / 2, cy, C.grid); line(c, cx, cy - sz / 2, cx, cy + sz / 2, C.grid);
    const pr = num(v, 'pr'), pa = (num(v, 'pa') * Math.PI) / 180, zr = num(v, 'zr'), za = (num(v, 'za') * Math.PI) / 180;
    for (const s2 of [1, -1]) { const px = cx + sc * pr * Math.cos(pa), py = cy - s2 * sc * pr * Math.sin(pa), zx = cx + sc * zr * Math.cos(za), zy = cy - s2 * sc * zr * Math.sin(za); line(c, px - 5, py - 5, px + 5, py + 5, C.red, 2.5); line(c, px - 5, py + 5, px + 5, py - 5, C.red, 2.5); circle(c, zx, zy, 5, undefined, C.cyan, 2); }
    text(c, '× poles   ○ zeros', cx, cy + sz / 2 + 2, C.dim, 10, 'center');
    const mag = (om: number) => { const e: [number, number] = [Math.cos(om), Math.sin(om)], d = (r: number, a: number, s2: number) => Math.hypot(e[0] - r * Math.cos(a), e[1] - s2 * r * Math.sin(a)); return (d(zr, za, 1) * d(zr, za, -1)) / Math.max(1e-6, d(pr, pa, 1) * d(pr, pa, -1)); };
    let mx = 1e-9; for (let i = 0; i <= 200; i++) mx = Math.max(mx, mag((Math.PI * i) / 200));
    const m = plot(c, { x: sz + 24, y: 8, w: w - sz - 32, h: h - 16 }, [0, 180], [-60, 5], { title: '|H(e^{jω})| (dB, peak-normalised)', xlabel: 'ω (° ; 180 = Nyquist)' });
    const pts: [number, number][] = []; for (let i = 0; i <= 200; i++) pts.push([m.X(i * 0.9), m.Y(clamp(20 * Math.log10(mag((Math.PI * i) / 200) / mx + 1e-9), -60, 5))]); polyline(c, pts, pr < 1 ? C.amber : C.red, 2.5);
    if (pr >= 1) text(c, 'UNSTABLE (pole on/outside unit circle)', sz + 30, 30, C.red, 12, 'left', 'alphabetic', true);
  },
  readouts(_s, v) { return [{ label: 'Stability', value: num(v, 'pr') < 1 ? 'stable (|p| < 1)' : 'UNSTABLE (|p| ≥ 1)' }, { label: 'Resonance near', value: `${fmt(num(v, 'pa'), 0)}° of π` }, { label: 'Notch at', value: num(v, 'zr') > 0.95 ? `${fmt(num(v, 'za'), 0)}°` : 'shallow' }]; },
  equations() { return ['H(z)=\\dfrac{(z-z_1)(z-z_1^*)}{(z-p_1)(z-p_1^*)}', '|H(e^{j\\omega})|=\\dfrac{\\prod|e^{j\\omega}-z_i|}{\\prod|e^{j\\omega}-p_i|}', '|p_i|<1\\Rightarrow\\text{BIBO stable}']; },
});

/* ================= Root locus ================= */
function roots3(a2: number, a1: number, a0: number): Cx[] {
  const r: Cx[] = [[1, 0.2], [-0.8, 0.9], [-0.5, -0.7]];
  for (let it = 0; it < 80; it++) for (let i = 0; i < 3; i++) {
    let num2: Cx = [1, 0]; const z = r[i]; // p(z)=z^3+a2 z^2+a1 z+a0
    const z2 = cmul(z, z), z3 = cmul(z2, z); num2 = [z3[0] + a2 * z2[0] + a1 * z[0] + a0, z3[1] + a2 * z2[1] + a1 * z[1]];
    let den: Cx = [1, 0]; for (let j = 0; j < 3; j++) if (j !== i) den = cmul(den, [z[0] - r[j][0], z[1] - r[j][1]]);
    const d2 = den[0] * den[0] + den[1] * den[1] || 1e-30, q: Cx = [(num2[0] * den[0] + num2[1] * den[1]) / d2, (num2[1] * den[0] - num2[0] * den[1]) / d2]; r[i] = [z[0] - q[0], z[1] - q[1]];
  }
  return r;
}
export const rootLocus = defineSim<T>({
  id: 'root_locus_third_order', title: 'Root Locus: Gain, Closed-Loop Poles & Stability Limit',
  ...meta('Engineering', 'Advanced', 'Control Systems', 'Root Locus', 'Closed-loop poles vs gain, marginal stability, damping'),
  covers: ['Root locus', 'Closed-loop poles', 'Characteristic equation', 'Marginal stability', 'Critical gain', 'Damping ratio', 'Routh-Hurwitz', 'Control system stability'],
  tags: ['control systems', 'GATE EE', 'GATE EC', 'GATE IN', 'M.Tech', 'Routh', 'feedback'],
  learningObjectives: ['Watch the three closed-loop poles move as K increases and cross the jω axis at K_crit.', 'Check the Routh–Hurwitz limit K < (a+b)ab.'],
  assumptions: ['Unity negative feedback around G(s)=K/[s(s+a)(s+b)]; roots found numerically (Durand–Kerner).'],
  blurb: 'Move the gain K and see the three closed-loop poles travel on the locus. Beyond the critical gain the complex pair enters the right half-plane and the loop is unstable.',
  hint: 'Characteristic eq: s³+(a+b)s²+ab·s+K=0. Routh: stable iff 0<K<(a+b)ab; at K_crit the poles sit at ±j√(ab).',
  params: [{ kind: 'number', id: 'a', label: 'Pole a', min: 0.5, max: 5, step: 0.1, value: 1, digits: 1 }, { kind: 'number', id: 'b', label: 'Pole b', min: 0.5, max: 8, step: 0.1, value: 3, digits: 1 }, { kind: 'number', id: 'K', label: 'Gain K', min: 0, max: 60, step: 0.5, value: 6, digits: 1 }],
  ...tick,
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const a = num(v, 'a'), b = num(v, 'b'), K = num(v, 'K'), Kc = (a + b) * a * b;
    const m = plot(c, { x: 8, y: 8, w: w - 16, h: h - 16 }, [-(a + b) - 2, 4], [-6, 6], { title: 's-plane: locus (dots), closed-loop poles at K (big)', xlabel: 'Re(s)', ylabel: 'Im(s)', zeroAxis: true });
    line(c, m.X(0), m.Y(-6), m.X(0), m.Y(6), C.red, 1.5, [4, 3]);
    for (let k = 0; k <= Kc * 2.2; k += Kc / 120) for (const r of roots3(a + b, a * b, k)) circle(c, m.X(r[0]), m.Y(r[1]), 1.5, 'rgba(34,211,238,0.6)');
    for (const r of roots3(a + b, a * b, K)) circle(c, m.X(r[0]), m.Y(r[1]), 6, r[0] > 0 ? C.red : C.amber, C.white);
    for (const p of [0, -a, -b]) { line(c, m.X(p) - 5, m.Y(0) - 5, m.X(p) + 5, m.Y(0) + 5, C.white, 2); line(c, m.X(p) - 5, m.Y(0) + 5, m.X(p) + 5, m.Y(0) - 5, C.white, 2); }
  },
  readouts(_s, v) { const a = num(v, 'a'), b = num(v, 'b'), K = num(v, 'K'), rs = roots3(a + b, a * b, K), mr = Math.max(...rs.map(r => r[0])), cp = rs.find(r => Math.abs(r[1]) > 1e-3), zeta = cp ? -cp[0] / Math.hypot(cp[0], cp[1]) : 1; return [{ label: 'Critical gain K_crit', value: fmt((a + b) * a * b, 2) }, { label: 'Stability', value: mr < -1e-6 ? 'stable' : Math.abs(mr) <= 1e-6 ? 'marginal' : 'UNSTABLE' }, { label: 'Dominant damping ratio ζ', value: fmt(zeta, 3) }, { label: 'Rightmost pole Re', value: fmt(mr, 3) }]; },
  equations() { return ['1+G(s)=0\\Rightarrow s^3+(a+b)s^2+ab\\,s+K=0', 'K_{crit}=(a+b)\\,ab', '\\zeta=-\\dfrac{\\mathrm{Re}(s)}{|s|}']; },
});

/* ================= K-means clustering ================= */
interface KmS { pts: [number, number][]; cen: [number, number][]; asg: number[]; it: number; inertia: number[]; acc: number; k: number }
function blobs() { const R = rng(21), out: [number, number][] = [], ctr: [number, number][] = [[-1.6, -1], [1.5, -1.2], [0, 1.7], [2.2, 1.8]]; for (let i = 0; i < 160; i++) { const c = ctr[i % 4]; out.push([c[0] + R.g() * 0.55, c[1] + R.g() * 0.55]); } return out; }
const BLOBS = blobs();
function lloyd(pts: [number, number][], cen: [number, number][]) { const asg = pts.map(p => { let b = 0, bd = Infinity; cen.forEach((c2, j) => { const d = (p[0] - c2[0]) ** 2 + (p[1] - c2[1]) ** 2; if (d < bd) { bd = d; b = j; } }); return b; }); const nc = cen.map((c2, j) => { let sx = 0, sy = 0, n = 0; pts.forEach((p, i) => { if (asg[i] === j) { sx += p[0]; sy += p[1]; n++; } }); return (n ? [sx / n, sy / n] : c2) as [number, number]; }); const inertia = pts.reduce((a, p, i) => a + (p[0] - nc[asg[i]][0]) ** 2 + (p[1] - nc[asg[i]][1]) ** 2, 0); return { asg, nc, inertia }; }
function initCen(k: number, seed: number): [number, number][] { const R = rng(seed); return Array.from({ length: k }, () => BLOBS[Math.floor(R.u() * BLOBS.length)].slice() as [number, number]); }
export const kmeans = defineSim<KmS>({
  id: 'kmeans_clustering_elbow', title: 'K-means Clustering: Lloyd Iterations, Inertia & the Elbow Method',
  ...meta('Computer Science', 'Intermediate', 'Machine Learning', 'Unsupervised Learning', 'K-means, convergence, local minima, elbow method', [...PG_ALL, ...UG_ENG, 'B.Sc', 'BCA']),
  covers: ['K-means clustering', 'Unsupervised learning', 'Lloyd algorithm', 'Inertia', 'Elbow method', 'Centroid', 'Local minimum', 'Initialisation sensitivity'],
  tags: ['machine learning', 'AI', 'data science', 'clustering', 'M.Tech', 'BCA', 'GATE DA'],
  learningObjectives: ['Watch assignment and update steps alternate until convergence.', 'See that bad initialisation can give a local minimum; use the elbow plot to choose k.'],
  assumptions: ['160 synthetic 2-D points from 4 Gaussian blobs; random-sample initialisation; Euclidean distance.'],
  blurb: 'Each iteration assigns points to the nearest centroid then moves the centroids to the cluster means. Change k, re-seed the start and watch the inertia fall; the elbow shows the best k.',
  hint: 'Minimise Σ‖x−μ_c(x)‖². Each Lloyd step cannot increase it, but the result depends on initialisation. True k = 4 here.',
  params: [{ kind: 'number', id: 'k', label: 'Clusters k', min: 1, max: 7, step: 1, value: 4, digits: 0, resetOnChange: true }, { kind: 'number', id: 'speed', label: 'Iterations per second', min: 0.5, max: 8, step: 0.5, value: 1.5, digits: 1 }],
  actions: [{ id: 'reseed', label: 'New random start' }],
  dt: 1 / 20, previewSeconds: 6,
  init(v) { const k = Math.round(num(v, 'k')); return { pts: BLOBS, cen: initCen(k, 3), asg: BLOBS.map(() => 0), it: 0, inertia: [], acc: 0, k }; },
  action(s, v) { s.k = Math.round(num(v, 'k')); s.cen = initCen(s.k, 100 + s.it * 7 + Math.floor(Math.random() * 1000)); s.it = 0; s.inertia = []; },
  step(s, v, dt) { s.acc += dt * num(v, 'speed'); while (s.acc >= 1) { s.acc -= 1; if (s.it > 40) continue; const r = lloyd(s.pts, s.cen); s.asg = r.asg; s.cen = r.nc; s.inertia.push(r.inertia); s.it++; } },
  draw(c, s, _v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const A = { x: 8, y: 8, w: w * 0.58, h: h - 16 }, m = plot(c, A, [-3.5, 4], [-3, 3.5], { title: `k = ${s.k}, iteration ${s.it}` }), cols = ['#22d3ee', '#f59e0b', '#22c55e', '#f43f5e', '#a78bfa', '#eab308', '#fb923c'];
    s.pts.forEach((p, i) => circle(c, m.X(p[0]), m.Y(p[1]), 3, cols[s.asg[i] % 7])); s.cen.forEach((p, j) => { circle(c, m.X(p[0]), m.Y(p[1]), 7, cols[j % 7], C.white, 2); });
    const B = { x: A.x + A.w + 8, y: 8, w: w - A.w - 24, h: h * 0.45 }, mb = plot(c, B, [0, Math.max(10, s.inertia.length)], [0, Math.max(1, ...s.inertia) * 1.05], { title: 'inertia vs iteration' }); polyline(c, s.inertia.map((q, i) => [mb.X(i), mb.Y(q)] as [number, number]), C.amber, 2);
    const E = { x: B.x, y: B.y + B.h + 8, w: B.w, h: h - B.h - 32 }, el: number[] = []; for (let k = 1; k <= 7; k++) { let cen = initCen(k, 5), I = 0; for (let i = 0; i < 25; i++) { const r = lloyd(s.pts, cen); cen = r.nc; I = r.inertia; } el.push(I); }
    const me = plot(c, E, [1, 7], [0, Math.max(...el) * 1.05], { title: 'elbow (final inertia vs k)', xlabel: 'k' }); polyline(c, el.map((q, i) => [me.X(i + 1), me.Y(q)] as [number, number]), C.green, 2); el.forEach((q, i) => circle(c, me.X(i + 1), me.Y(q), 3, i + 1 === s.k ? C.red : C.green));
  },
  readouts(s) { return [{ label: 'Iteration', value: s.it }, { label: 'Inertia', value: fmt(s.inertia[s.inertia.length - 1] ?? 0, 2) }, { label: 'Converged', value: s.inertia.length > 1 && Math.abs(s.inertia[s.inertia.length - 1] - s.inertia[s.inertia.length - 2]) < 1e-9 ? 'yes' : 'not yet' }]; },
  equations() { return ['J=\\sum_{i}\\lVert x_i-\\mu_{c(i)}\\rVert^2', '\\mu_j\\leftarrow\\dfrac1{|S_j|}\\sum_{x\\in S_j}x', 'c(i)=\\arg\\min_j\\lVert x_i-\\mu_j\\rVert']; },
});

/* ================= PCA ================= */
export const pca = defineSim<T>({
  id: 'pca_principal_axes', title: 'Principal Component Analysis: Covariance, Eigenvectors & Variance Explained',
  ...meta('Math', 'Intermediate', 'Linear Algebra', 'Eigen-decomposition', 'PCA, covariance matrix, projection, dimensionality reduction', [...PG_ALL, ...UG_ENG, 'B.Sc', 'BCA']),
  covers: ['Principal component analysis', 'Covariance matrix', 'Eigenvalues and eigenvectors', 'Dimensionality reduction', 'Variance explained', 'Orthogonal projection', 'Data preprocessing'],
  tags: ['linear algebra', 'machine learning', 'data science', 'M.Sc', 'M.Tech', 'SVD', 'GATE DA'],
  learningObjectives: ['Relate the principal axes to the eigenvectors of the covariance matrix.', 'See reconstruction error when projecting onto PC1 only.'],
  assumptions: ['250 synthetic 2-D Gaussian points; sample covariance with 1/(n−1).'],
  blurb: 'A cloud of correlated points with its covariance ellipse and principal axes. Rotate or stretch the cloud and see eigenvalues, variance explained and the projection onto the first component.',
  hint: 'Σ=XᵀX/(n−1). Eigenvectors are the principal axes; eigenvalues λ are the variances along them. Variance explained = λ₁/(λ₁+λ₂). Projection error = λ₂ (sum of dropped variances).',
  params: [{ kind: 'number', id: 'ang', label: 'Cloud rotation (°)', min: 0, max: 180, step: 5, value: 35, digits: 0, resetOnChange: true }, { kind: 'number', id: 'ratio', label: 'Axis ratio σ₁/σ₂', min: 1, max: 8, step: 0.1, value: 3.5, digits: 1, resetOnChange: true }, { kind: 'toggle', id: 'proj', label: 'Project onto PC1', value: true }],
  dt: 1 / 20, previewSeconds: 1,
  init(v) { return { t: 0, ...pcaData(v) } as T; }, step(s, _v, dt) { s.t += dt; },
  draw(c, s0, v, w, h) {
    const s = s0 as unknown as { pts: [number, number][]; l1: number; l2: number; e1: [number, number]; mean: [number, number] }; c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
    const m = plot(c, { x: 8, y: 8, w: Math.min(w - 16, h * 1.2), h: h - 16 }, [-5, 5], [-4, 4], { title: 'data, principal axes (PC1 amber, PC2 cyan)' });
    if (bool(v, 'proj')) for (const p of s.pts) { const d = (p[0] - s.mean[0]) * s.e1[0] + (p[1] - s.mean[1]) * s.e1[1], q: [number, number] = [s.mean[0] + d * s.e1[0], s.mean[1] + d * s.e1[1]]; line(c, m.X(p[0]), m.Y(p[1]), m.X(q[0]), m.Y(q[1]), 'rgba(148,163,184,0.25)', 1); circle(c, m.X(q[0]), m.Y(q[1]), 1.6, C.amber); }
    for (const p of s.pts) circle(c, m.X(p[0]), m.Y(p[1]), 2.2, 'rgba(34,211,238,0.85)');
    const L1 = 2 * Math.sqrt(s.l1), L2 = 2 * Math.sqrt(s.l2), e2: [number, number] = [-s.e1[1], s.e1[0]];
    line(c, m.X(s.mean[0] - L1 * s.e1[0]), m.Y(s.mean[1] - L1 * s.e1[1]), m.X(s.mean[0] + L1 * s.e1[0]), m.Y(s.mean[1] + L1 * s.e1[1]), C.amber, 3); line(c, m.X(s.mean[0] - L2 * e2[0]), m.Y(s.mean[1] - L2 * e2[1]), m.X(s.mean[0] + L2 * e2[0]), m.Y(s.mean[1] + L2 * e2[1]), C.cyan, 3);
    const bx = Math.min(w - 16, h * 1.2) + 20; if (bx < w - 120) { text(c, 'variance explained', bx, 28, C.text, 12, 'left', 'alphabetic', true); const tot = s.l1 + s.l2; c.fillStyle = C.amber; c.fillRect(bx, 38, (w - bx - 12) * (s.l1 / tot), 18); c.fillStyle = C.cyan; c.fillRect(bx, 62, (w - bx - 12) * (s.l2 / tot), 18); text(c, `PC1 ${fmt((100 * s.l1) / tot, 1)} %`, bx + 4, 52, C.bg, 11, 'left', 'alphabetic', true); text(c, `PC2 ${fmt((100 * s.l2) / tot, 1)} %`, bx + 4, 76, C.bg, 11, 'left', 'alphabetic', true); }
  },
  readouts(s0) { const s = s0 as unknown as { l1: number; l2: number; e1: [number, number] }; return [{ label: 'λ₁ (PC1 variance)', value: fmt(s.l1, 3) }, { label: 'λ₂ (PC2 variance)', value: fmt(s.l2, 3) }, { label: 'Variance explained by PC1', value: fmt((100 * s.l1) / (s.l1 + s.l2), 1) + ' %' }, { label: 'PC1 direction', value: fmt((Math.atan2(s.e1[1], s.e1[0]) * 180) / Math.PI, 1) + '°' }]; },
  equations() { return ['\\Sigma=\\dfrac1{n-1}\\sum(x_i-\\bar x)(x_i-\\bar x)^{\\top}', '\\Sigma\\,\\mathbf e_k=\\lambda_k\\mathbf e_k', '\\text{EVR}_1=\\dfrac{\\lambda_1}{\\lambda_1+\\lambda_2}']; },
});
function pcaData(v: Record<string, number | string | boolean>) {
  const R = rng(9), th = (num(v, 'ang') * Math.PI) / 180, r = num(v, 'ratio'), pts: [number, number][] = [];
  for (let i = 0; i < 250; i++) { const a = R.g() * 1.1 * Math.sqrt(r), b = R.g() * 1.1 / Math.sqrt(r); pts.push([a * Math.cos(th) - b * Math.sin(th) + 0.3, a * Math.sin(th) + b * Math.cos(th) - 0.2]); }
  const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0, syy = 0, sxy = 0; for (const p of pts) { sxx += (p[0] - mx) ** 2; syy += (p[1] - my) ** 2; sxy += (p[0] - mx) * (p[1] - my); } sxx /= n - 1; syy /= n - 1; sxy /= n - 1;
  const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det)), l1 = tr / 2 + disc, l2 = Math.max(0, tr / 2 - disc), ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { pts, l1, l2, e1: [Math.cos(ang), Math.sin(ang)] as [number, number], mean: [mx, my] as [number, number] };
}

/* ================= Bias-variance: polynomial regression ================= */
function solve(Am: number[][], b: number[]) { const n = b.length, M = Am.map((r, i) => [...r, b[i]]); for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r; [M[i], M[p]] = [M[p], M[i]]; const d = M[i][i] || 1e-12; for (let j = i; j <= n; j++) M[i][j] /= d; for (let r = 0; r < n; r++) if (r !== i) { const f = M[r][i]; for (let j = i; j <= n; j++) M[r][j] -= f * M[i][j]; } } return M.map(r => r[n]); }
function polyFit(xs: number[], ys: number[], d: number, lam: number) { const n = d + 1, A = Array.from({ length: n }, () => Array(n).fill(0)), b = Array(n).fill(0); xs.forEach((x, k) => { for (let i = 0; i < n; i++) { b[i] += Math.pow(x, i) * ys[k]; for (let j = 0; j < n; j++) A[i][j] += Math.pow(x, i + j); } }); for (let i = 1; i < n; i++) A[i][i] += lam; A[0][0] += 1e-10; return solve(A, b); }
const pev = (co: number[], x: number) => co.reduce((a, c2, i) => a + c2 * Math.pow(x, i), 0);
export const biasVariance = defineSim<T>({
  id: 'bias_variance_polyfit', title: 'Bias–Variance Trade-off: Polynomial Regression, Overfitting & Ridge',
  ...meta('Computer Science', 'Intermediate', 'Machine Learning', 'Model Selection', 'Underfitting, overfitting, regularisation, train vs test error', [...PG_ALL, ...UG_ENG, 'B.Sc', 'BCA']),
  covers: ['Overfitting', 'Underfitting', 'Bias-variance trade-off', 'Polynomial regression', 'Ridge regularisation', 'Train and test error', 'Model complexity', 'Generalisation'],
  tags: ['machine learning', 'AI', 'M.Tech', 'regression', 'regularization', 'GATE DA', 'least squares'],
  learningObjectives: ['See training error fall monotonically while test error is U-shaped.', 'Use ridge λ to tame a high-degree fit.'],
  assumptions: ['Target y=sin(2πx) on [0,1] plus Gaussian noise; separate 200-point test set; normal-equation least squares with optional ridge penalty.'],
  blurb: 'Fit a polynomial of chosen degree to a few noisy points. Training error always drops, but the test error shows when you are overfitting; regularisation pulls the wiggles in.',
  hint: 'w=(ΦᵀΦ+λI)⁻¹Φᵀy. Low degree → high bias (underfit); high degree → high variance (overfit). Ridge shrinks weights, lowering variance at the price of bias.',
  params: [{ kind: 'number', id: 'deg', label: 'Polynomial degree', min: 0, max: 12, step: 1, value: 3, digits: 0 }, { kind: 'number', id: 'n', label: 'Training points', min: 5, max: 40, step: 1, value: 12, digits: 0, resetOnChange: true }, { kind: 'number', id: 'noise', label: 'Noise σ', min: 0, max: 0.6, step: 0.02, value: 0.2, digits: 2, resetOnChange: true }, { kind: 'number', id: 'lam', label: 'Ridge λ (log10; −6 = off)', min: -6, max: 1, step: 0.5, value: -6, digits: 1 }],
  ...tick,
  draw(c, s0, v, w, h) {
    const d = bvData(v), deg = Math.round(num(v, 'deg')), lam = num(v, 'lam') <= -6 ? 0 : Math.pow(10, num(v, 'lam')), co = polyFit(d.tx, d.ty, deg, lam), g = (x: number) => pev(co, x * 2 - 1); void s0;
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const m = plot(c, { x: 8, y: 8, w: w * 0.6, h: h - 16 }, [0, 1], [-2, 2], { title: `degree ${deg} fit`, xlabel: 'x' });
    polyline(c, Array.from({ length: 101 }, (_, i) => [m.X(i / 100), m.Y(Math.sin(TAU * (i / 100)))] as [number, number]), C.green, 2, [5, 4]); polyline(c, Array.from({ length: 101 }, (_, i) => [m.X(i / 100), m.Y(clamp(g(i / 100), -3, 3))] as [number, number]), C.amber, 2.5);
    d.tx.forEach((x, i) => circle(c, m.X((x + 1) / 2), m.Y(d.ty[i]), 3.5, C.cyan, C.white, 1));
    const B = { x: w * 0.6 + 16, y: 8, w: w * 0.4 - 24, h: h - 16 }, tr: number[] = [], te: number[] = []; for (let k = 0; k <= 12; k++) { const cf = polyFit(d.tx, d.ty, k, lam); tr.push(mse(d.tx, d.ty, cf)); te.push(mse(d.ex, d.ey, cf)); }
    const mb = plot(c, B, [0, 12], [0, 1], { title: 'MSE vs degree (clipped at 1)', xlabel: 'degree' }); polyline(c, tr.map((q, k) => [mb.X(k), mb.Y(Math.min(1, q))] as [number, number]), C.cyan, 2); polyline(c, te.map((q, k) => [mb.X(k), mb.Y(Math.min(1, q))] as [number, number]), C.red, 2); text(c, 'train', B.x + 40, B.y + 36, C.cyan, 11); text(c, 'test', B.x + 40, B.y + 50, C.red, 11); circle(c, mb.X(deg), mb.Y(Math.min(1, te[deg])), 4, C.red, C.white);
  },
  readouts(_s, v) { const d = bvData(v), deg = Math.round(num(v, 'deg')), lam = num(v, 'lam') <= -6 ? 0 : Math.pow(10, num(v, 'lam')), co = polyFit(d.tx, d.ty, deg, lam); const tr = mse(d.tx, d.ty, co), te = mse(d.ex, d.ey, co); return [{ label: 'Train MSE', value: fmt(tr, 4) }, { label: 'Test MSE', value: fmt(te, 4) }, { label: 'Diagnosis', value: te > 4 * Math.max(tr, 0.01) ? 'overfitting (variance)' : tr > 0.1 ? 'underfitting (bias)' : 'good fit' }]; },
  equations() { return ['\\mathbf w=(\\Phi^{\\top}\\Phi+\\lambda I)^{-1}\\Phi^{\\top}\\mathbf y', '\\text{MSE}=\\dfrac1N\\sum(y_i-\\hat y_i)^2', '\\mathbb E[\\text{err}]=\\text{bias}^2+\\text{variance}+\\sigma^2']; },
});
function mse(xs: number[], ys: number[], co: number[]) { return xs.reduce((a, x, i) => a + (pev(co, x) - ys[i]) ** 2, 0) / xs.length; }
function bvData(v: Record<string, number | string | boolean>) { const R = rng(33), n = Math.round(num(v, 'n')), tx: number[] = [], ty: number[] = [], ex: number[] = [], ey: number[] = []; for (let i = 0; i < n; i++) { const x = (i + 0.5) / n; tx.push(x * 2 - 1); ty.push(Math.sin(TAU * x) + R.g() * num(v, 'noise')); } const R2b = rng(77); for (let i = 0; i < 200; i++) { const x = R2b.u(); ex.push(x * 2 - 1); ey.push(Math.sin(TAU * x) + R2b.g() * num(v, 'noise')); } return { tx, ty, ex, ey }; }

/* ================= PageRank ================= */
const PR_N = 6, PR_LINKS: number[][] = [[1, 2], [2], [0, 3], [2, 4, 5], [5], [3]];
export const pageRank = defineSim<{ r: number[]; err: number[]; it: number; acc: number }>({
  id: 'pagerank_power_iteration', title: 'PageRank: Markov Chain, Damping Factor & Power Iteration',
  ...meta('Computer Science', 'Intermediate', 'Algorithms', 'Markov Chains', 'PageRank, stationary distribution, power iteration, damping', [...PG_ALL, ...UG_ENG, 'B.Sc', 'BCA']),
  covers: ['PageRank', 'Markov chain', 'Stationary distribution', 'Power iteration', 'Damping factor', 'Random surfer', 'Eigenvector', 'Web graph'],
  tags: ['algorithms', 'data science', 'linear algebra', 'search engine', 'M.Sc', 'GATE', 'BCA'],
  learningObjectives: ['See the rank vector converge to the dominant eigenvector of the Google matrix.', 'See how damping d changes the ranking and the convergence rate.'],
  assumptions: ['Fixed 6-page directed graph; uniform teleportation; no dangling nodes.'],
  blurb: 'A random surfer follows links with probability d and teleports otherwise. Iterate rₜ₊₁ = d·M·rₜ + (1−d)/N and watch the ranks settle.',
  hint: 'r = d M r + (1−d)/N·1, M column-stochastic. Convergence rate ≈ d^k, so d close to 1 converges slowly. Page 2 and 3 collect many in-links.',
  params: [{ kind: 'number', id: 'd', label: 'Damping factor d', min: 0, max: 0.99, step: 0.01, value: 0.85, digits: 2 }, { kind: 'number', id: 'speed', label: 'Iterations per second', min: 0.5, max: 10, step: 0.5, value: 2, digits: 1 }],
  actions: [{ id: 'reset', label: 'Restart iteration' }],
  dt: 1 / 20, previewSeconds: 5, init() { return { r: Array(PR_N).fill(1 / PR_N), err: [], it: 0, acc: 0 }; }, action(s) { s.r = Array(PR_N).fill(1 / PR_N); s.err = []; s.it = 0; },
  step(s, v, dt) { s.acc += dt * num(v, 'speed'); while (s.acc >= 1) { s.acc -= 1; if (s.it > 80) continue; const d = num(v, 'd'), nr = Array(PR_N).fill((1 - d) / PR_N); PR_LINKS.forEach((o, i) => o.forEach(j => { nr[j] += (d * s.r[i]) / o.length; })); s.err.push(nr.reduce((a, x, i) => a + Math.abs(x - s.r[i]), 0)); s.r = nr; s.it++; } },
  draw(c, s, _v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const pos: [number, number][] = [[0.15, 0.3], [0.32, 0.12], [0.35, 0.62], [0.58, 0.45], [0.72, 0.15], [0.75, 0.7]], pw = w * 0.55, ph = h - 20, P = (i: number): [number, number] => [10 + pos[i][0] * pw / 0.85, 10 + pos[i][1] * ph / 0.85];
    PR_LINKS.forEach((o, i) => o.forEach(j => { const [x1, y1] = P(i), [x2, y2] = P(j), a = Math.atan2(y2 - y1, x2 - x1), r = 14 + s.r[j] * 60; const ex = x2 - r * Math.cos(a), ey = y2 - r * Math.sin(a); line(c, x1, y1, ex, ey, 'rgba(148,163,184,0.7)', 1.5); line(c, ex, ey, ex - 8 * Math.cos(a - 0.4), ey - 8 * Math.sin(a - 0.4), 'rgba(148,163,184,0.9)', 1.5); line(c, ex, ey, ex - 8 * Math.cos(a + 0.4), ey - 8 * Math.sin(a + 0.4), 'rgba(148,163,184,0.9)', 1.5); }));
    s.r.forEach((q, i) => { const [x, y] = P(i); circle(c, x, y, 10 + q * 60, 'rgba(245,158,11,0.75)', C.white); text(c, `${i}`, x, y + 4, C.bg, 12, 'center', 'alphabetic', true); text(c, fmt(q, 3), x, y + 24 + q * 60, C.text, 10, 'center'); });
    const B = { x: pw + 24, y: 8, w: w - pw - 32, h: h - 16 }, m = plot(c, B, [0, 80], [-6, 0], { title: 'log10 change per iteration', xlabel: 'iteration' }); polyline(c, s.err.map((e, i) => [m.X(i), m.Y(clamp(Math.log10(e + 1e-9), -6, 0))] as [number, number]), C.cyan, 2);
  },
  readouts(s) { const o = s.r.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]); return [{ label: 'Top page', value: `page ${o[0][1]} (${fmt(o[0][0], 3)})` }, { label: 'Sum of ranks', value: fmt(s.r.reduce((a, b) => a + b, 0), 4) }, { label: 'Iteration', value: s.it }, { label: 'Last change', value: s.err.length ? s.err[s.err.length - 1].toExponential(1) : '—' }]; },
  equations() { return ['\\mathbf r_{t+1}=d\\,M\\mathbf r_t+\\dfrac{1-d}{N}\\mathbf 1', 'G=dM+\\dfrac{1-d}{N}\\mathbf 1\\mathbf 1^{\\top}', '\\mathbf r=G\\mathbf r']; },
});

/* ================= Self-attention heat-map ================= */
const TOK = ['the', 'robot', 'moved', 'the', 'red', 'box'];
function embed(tok: string, i: number): number[] { return Array.from({ length: 8 }, (_, k) => Math.sin((tok.charCodeAt(0) * 7 + tok.length * 13 + k * 2.3) * 1.7) + 0.35 * Math.cos(i * (k + 1) * 0.6)); }
export const attention = defineSim<T>({
  id: 'self_attention_heatmap', title: 'Transformer Self-Attention: Scaled Dot-Product Heat-map',
  ...meta('Computer Science', 'Advanced', 'Machine Learning', 'Transformers', 'Queries, keys, values, softmax temperature, causal mask'),
  covers: ['Self-attention', 'Transformer', 'Scaled dot-product attention', 'Softmax', 'Causal mask', 'Queries keys and values', 'Multi-head attention', 'Large language model'],
  tags: ['deep learning', 'AI', 'NLP', 'LLM', 'M.Tech', 'attention', 'GPT', 'BERT'],
  learningObjectives: ['Compute softmax(QKᵀ/√d)V and read the weight matrix.', 'See the effect of temperature and a causal mask (decoder) on who can attend to whom.'],
  assumptions: ['Random, untrained projection matrices and hand-made token embeddings — this shows the MECHANICS of attention, not what a trained language model attends to. 8-D embeddings, 3 independent heads.'],
  blurb: 'Six tokens attend to each other through queries and keys. Change the head, temperature and masking and read each row of attention weights (rows sum to 1).',
  hint: 'A=softmax(QKᵀ/(√dₖ·τ)); output = A V. Causal masking sets future positions to −∞. Lower τ gives sharper (more peaked) attention.',
  params: [{ kind: 'select', id: 'head', label: 'Head', value: '0', options: [{ value: '0', label: 'Head 1' }, { value: '1', label: 'Head 2' }, { value: '2', label: 'Head 3' }] }, { kind: 'number', id: 'tau', label: 'Temperature τ', min: 0.2, max: 4, step: 0.1, value: 1, digits: 1 }, { kind: 'toggle', id: 'causal', label: 'Causal mask (decoder)', value: false }],
  ...tick,
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const A = attn(v), n = TOK.length, sz = Math.min(h - 70, w * 0.55), cs = sz / n, ox = 70, oy = 44;
    text(c, 'attention weights  (row = query token, column = key token)', 10, 18, C.text, 12, 'left', 'alphabetic', true);
    for (let i = 0; i < n; i++) { text(c, TOK[i], ox - 6, oy + i * cs + cs / 2 + 4, C.text, 11, 'right'); text(c, TOK[i], ox + i * cs + cs / 2, oy - 6, C.text, 11, 'center'); for (let j = 0; j < n; j++) { const a = A[i][j]; c.fillStyle = `rgba(245,158,11,${0.06 + 0.94 * a})`; c.fillRect(ox + j * cs, oy + i * cs, cs - 2, cs - 2); text(c, fmt(a, 2), ox + j * cs + cs / 2, oy + i * cs + cs / 2 + 4, a > 0.5 ? C.bg : C.text, 11, 'center'); } }
    const bx = ox + sz + 20; if (bx < w - 100) { text(c, 'entropy per row (bits)', bx, oy + 6, C.text, 11, 'left', 'alphabetic', true); A.forEach((r, i) => { const H = -r.reduce((a, p) => a + (p > 1e-9 ? p * Math.log2(p) : 0), 0); c.fillStyle = C.cyan; c.fillRect(bx, oy + 16 + i * 22, Math.max(2, (w - bx - 20) * H / Math.log2(n)), 14); text(c, fmt(H, 2), bx + 4, oy + 27 + i * 22, C.bg, 10); }); }
  },
  readouts(_s, v) { const A = attn(v); const H = A.map(r => -r.reduce((a, p) => a + (p > 1e-9 ? p * Math.log2(p) : 0), 0)); let bi = 0, bj = 0, bm = 0; A.forEach((r, i) => r.forEach((p, j) => { if (i !== j && p > bm) { bm = p; bi = i; bj = j; } })); return [{ label: 'Mean row entropy', value: fmt(H.reduce((a, b) => a + b, 0) / H.length, 2) + ' bits' }, { label: 'Strongest cross-token link', value: `${TOK[bi]} → ${TOK[bj]} (${fmt(bm, 2)})` }, { label: 'Row sums', value: A.every(r => Math.abs(r.reduce((a, b) => a + b, 0) - 1) < 1e-9) ? 'all = 1' : 'error' }]; },
  equations() { return ['\\text{Attn}(Q,K,V)=\\mathrm{softmax}\\!\\left(\\dfrac{QK^{\\top}}{\\tau\\sqrt{d_k}}\\right)V', 'Q=XW_Q,\\ K=XW_K,\\ V=XW_V', '\\text{causal: } A_{ij}=0\\ (j>i)']; },
});
function attn(v: Record<string, number | string | boolean>): number[][] {
  const hd = Number(str(v, 'head')), R = rng(500 + hd * 31), d = 8, dk = 4, X = TOK.map((t, i) => embed(t, i)), mk = () => Array.from({ length: d }, () => Array.from({ length: dk }, () => R.g() * 0.7)), WQ = mk(), WK = mk();
  const mm = (x: number[], W: number[][]) => Array.from({ length: dk }, (_, k) => x.reduce((a, xi, i) => a + xi * W[i][k], 0)), Q = X.map(x => mm(x, WQ)), K = X.map(x => mm(x, WK)), tau = num(v, 'tau');
  return Q.map((q, i) => { const sc = K.map((k, j) => (bool(v, 'causal') && j > i ? -Infinity : q.reduce((a, qi, m) => a + qi * k[m], 0) / (Math.sqrt(dk) * tau))), mx = Math.max(...sc), e = sc.map(x => (x === -Infinity ? 0 : Math.exp(x - mx))), s = e.reduce((a, b) => a + b, 0); return e.map(x => x / s); });
}
