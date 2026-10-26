import { defineSim, num, str, bool, PG_ALL, UG_ENG } from './types';
import type { EducationLevel, Difficulty, SimSubject } from './types';
import { C, TAU, clamp, fmt, line, plot, polyline, text, circle } from './draw';

const meta = (subject: SimSubject, difficulty: Difficulty, category: string, topic: string, subtopic: string, levels: EducationLevel[] = [...PG_ALL, ...UG_ENG, 'B.Sc']) => ({
  subject, status: 'active' as const, educationLevels: levels, difficulty, category, topic, subtopic,
});
type T = { t: number };
const tick = { dt: 1 / 30, previewSeconds: 2, init: () => ({ t: 0 }), step: (s: T, _v: unknown, dt: number) => { s.t += dt; } };

/* ================= Particle in a box ================= */
export const particleBox = defineSim<T>({
  id: 'particle_in_box_states', title: 'Particle in an Infinite Well: Energy Levels, Wavefunctions & Superposition',
  ...meta('Quantum', 'Intermediate', 'Quantum Mechanics', 'Bound States', 'Infinite square well, stationary states, time evolution'),
  covers: ['Particle in a box', 'Infinite square well', 'Energy quantisation', 'Wavefunction', 'Probability density', 'Superposition', 'Stationary states'],
  tags: ['quantum mechanics', 'M.Sc', 'Schrödinger', 'eigenstates', 'JAM', 'CSIR NET'],
  learningObjectives: ['Relate n to the number of nodes and E_n ∝ n².', 'Watch a superposition of n=1 and n=2 slosh back and forth.'],
  assumptions: ['1-D infinite well of width L; units ħ = m = 1; L adjustable.'],
  blurb: 'Pick two quantum numbers and a mixing weight. Pure states are stationary; a superposition has a probability density that oscillates at the beat frequency (E₂−E₁)/ħ.',
  hint: 'ψₙ=√(2/L) sin(nπx/L), Eₙ=n²π²ħ²/(2mL²). Ψ=aψ₁e^{-iE₁t}+bψₙe^{-iEₙt}; |Ψ|² oscillates at ΔE/ħ.',
  params: [
    { kind: 'number', id: 'n1', label: 'State n₁', min: 1, max: 6, step: 1, value: 1, digits: 0 },
    { kind: 'number', id: 'n2', label: 'State n₂', min: 1, max: 6, step: 1, value: 2, digits: 0 },
    { kind: 'number', id: 'mix', label: 'Weight of n₂ (0 = pure n₁)', min: 0, max: 1, step: 0.05, value: 0.5, digits: 2 },
    { kind: 'number', id: 'L', label: 'Well width L', min: 0.5, max: 3, step: 0.1, value: 1, digits: 1 },
  ],
  ...tick, dt: 1 / 30,
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const L = num(v, 'L'), n1 = Math.round(num(v, 'n1')), n2 = Math.round(num(v, 'n2')), b = Math.sqrt(num(v, 'mix')), a = Math.sqrt(1 - num(v, 'mix'));
    const E = (n: number) => (n * n * Math.PI * Math.PI) / (2 * L * L), psi = (n: number, x: number) => Math.sqrt(2 / L) * Math.sin((n * Math.PI * x) / L);
    const A = { x: 8, y: 8, w: w * 0.58, h: h - 16 }, mp = plot(c, A, [0, L], [-2.2, 2.2], { title: 'Ψ(x,t): Re (cyan), Im (violet), |Ψ|² (amber)', xlabel: 'x' });
    const re: [number, number][] = [], im: [number, number][] = [], pr: [number, number][] = [];
    for (let i = 0; i <= 120; i++) { const x = (L * i) / 120, p1 = psi(n1, x) * a, p2 = psi(n2, x) * b; const R = p1 * Math.cos(E(n1) * s.t) + p2 * Math.cos(E(n2) * s.t), I = -p1 * Math.sin(E(n1) * s.t) - p2 * Math.sin(E(n2) * s.t); re.push([mp.X(x), mp.Y(R)]); im.push([mp.X(x), mp.Y(I)]); pr.push([mp.X(x), mp.Y(R * R + I * I)]); }
    polyline(c, re, C.cyan, 2); polyline(c, im, '#a78bfa', 2); polyline(c, pr, C.amber, 2.5);
    const B = { x: A.x + A.w + 10, y: 8, w: w - A.w - 26, h: h - 16 }, mb = plot(c, B, [0, 1], [0, E(6) * 1.05], { title: 'energy levels' });
    for (let n = 1; n <= 6; n++) { line(c, mb.X(0.05), mb.Y(E(n)), mb.X(0.95), mb.Y(E(n)), n === n1 || (n === n2 && num(v, 'mix') > 0) ? C.amber : C.dim, 2); text(c, `n=${n}`, mb.X(0.5), mb.Y(E(n)) - 3, C.text, 10, 'center'); }
  },
  readouts(_s, v) { const L = num(v, 'L'), E = (n: number) => (n * n * Math.PI * Math.PI) / (2 * L * L), n1 = Math.round(num(v, 'n1')), n2 = Math.round(num(v, 'n2')); return [{ label: 'E(n₁)', value: fmt(E(n1), 3) + ' ħ²/m' }, { label: 'E(n₂)', value: fmt(E(n2), 3) + ' ħ²/m' }, { label: 'Beat period', value: n1 === n2 ? 'stationary' : fmt(TAU / Math.abs(E(n2) - E(n1)), 3) }, { label: '⟨E⟩', value: fmt((1 - num(v, 'mix')) * E(n1) + num(v, 'mix') * E(n2), 3) }]; },
  equations() { return ['\\psi_n(x)=\\sqrt{\\tfrac2L}\\sin\\tfrac{n\\pi x}{L}', 'E_n=\\dfrac{n^2\\pi^2\\hbar^2}{2mL^2}', '\\Psi(x,t)=\\sum_n c_n\\psi_n(x)e^{-iE_nt/\\hbar}']; },
});

/* ================= Quantum tunnelling through a barrier ================= */
export const tunnelling = defineSim<T>({
  id: 'quantum_tunnelling_barrier', title: 'Quantum Tunnelling: Transmission through a Rectangular Barrier',
  ...meta('Quantum', 'Advanced', 'Quantum Mechanics', 'Scattering', 'Transmission coefficient, barrier width and height, resonances'),
  covers: ['Quantum tunnelling', 'Rectangular potential barrier', 'Transmission coefficient', 'Evanescent wave', 'Scattering states', 'Resonant transmission'],
  tags: ['quantum mechanics', 'M.Sc', 'STM', 'alpha decay', 'tunnel diode', 'JAM'],
  learningObjectives: ['See that T falls exponentially with barrier width and √(V₀−E).', 'Observe T = 1 resonances when E > V₀.'],
  assumptions: ['1-D stationary scattering, exact transfer expression; ħ = m = 1.'],
  blurb: 'Change particle energy, barrier height and width and read the exact transmission coefficient T(E). The plot marks your current energy on the T(E) curve.',
  hint: 'E<V₀: T = [1+V₀² sinh²(κa)/(4E(V₀−E))]⁻¹, κ=√(2m(V₀−E))/ħ. E>V₀: sinh→sin and κ→k′, giving resonances where k′a = nπ.',
  params: [
    { kind: 'number', id: 'E', label: 'Energy E', min: 0.05, max: 4, step: 0.05, value: 0.8, digits: 2 },
    { kind: 'number', id: 'V0', label: 'Barrier height V₀', min: 0.2, max: 4, step: 0.05, value: 1.5, digits: 2 },
    { kind: 'number', id: 'a', label: 'Barrier width a', min: 0.2, max: 4, step: 0.05, value: 1.2, digits: 2 },
  ],
  ...tick,
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const V0 = num(v, 'V0'), a = num(v, 'a'), E = num(v, 'E');
    const A = { x: 8, y: 8, w: w - 16, h: h * 0.47 }, m1 = plot(c, A, [-6, 6 + a], [-1.8, 2.4], { title: '|ψ(x)|² (incident amplitude 1, shifted down 1.2) and barrier', xlabel: 'x' });
    const Tr = trans(E, V0, a), wv = tunnelWave(E, V0, a), pts: [number, number][] = [];
    for (let i = 0; i <= 300; i++) { const x = -6 + ((12 + a) * i) / 300, d = wv(x); pts.push([m1.X(x), m1.Y(Math.min(4, d) * 0.9 - 1.2)]); }
    polyline(c, pts, C.cyan, 2); c.fillStyle = 'rgba(245,158,11,0.25)'; c.fillRect(m1.X(0), m1.Y(V0 * 0.9 - 1.2 + 0.0), m1.X(a) - m1.X(0), m1.Y(-1.2) - m1.Y(V0 * 0.9 - 1.2));
    line(c, m1.X(-6), m1.Y(E * 0.9 - 1.2), m1.X(6 + a), m1.Y(E * 0.9 - 1.2), C.green, 1, [5, 4]); text(c, `E=${fmt(E, 2)}  V₀=${fmt(V0, 2)}`, A.x + 14, A.y + A.h - 8, C.dim, 10);
    const B = { x: 8, y: A.y + A.h + 8, w: w - 16, h: h - A.h - 24 }, m2 = plot(c, B, [0, 4], [0, 1.02], { title: 'transmission T(E)', xlabel: 'E' }); const cv: [number, number][] = []; for (let i = 1; i <= 200; i++) { const e = (4 * i) / 200; cv.push([m2.X(e), m2.Y(trans(e, V0, a))]); }
    polyline(c, cv, C.amber, 2); circle(c, m2.X(E), m2.Y(Tr), 5, C.red, C.white);
  },
  readouts(_s, v) { const T = trans(num(v, 'E'), num(v, 'V0'), num(v, 'a')); return [{ label: 'Transmission T', value: fmt(T, 4) }, { label: 'Reflection R', value: fmt(1 - T, 4) }, { label: 'Regime', value: num(v, 'E') < num(v, 'V0') ? 'tunnelling (E < V₀)' : 'over the barrier' }]; },
  equations() { return ['T=\\left[1+\\dfrac{V_0^2\\sinh^2(\\kappa a)}{4E(V_0-E)}\\right]^{-1},\\quad \\kappa=\\sqrt{2m(V_0-E)}/\\hbar', 'T\\approx 16\\tfrac{E}{V_0}\\left(1-\\tfrac{E}{V_0}\\right)e^{-2\\kappa a}\\ (\\kappa a\\gg1)']; },
});
type Cx = [number, number];
const cm = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a: Cx, b: Cx): Cx => { const d = b[0] * b[0] + b[1] * b[1] || 1e-30; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const cexp = (a: Cx): Cx => { const e = Math.exp(clamp(a[0], -300, 300)); return [e * Math.cos(a[1]), e * Math.sin(a[1])]; };
const cadd = (a: Cx, b: Cx): Cx => [a[0] + b[0], a[1] + b[1]];
/** exact |psi(x)|^2 for a plane wave e^{ikx} incident from the left on a rectangular barrier [0,a] (hbar=m=1) */
export function tunnelWave(E: number, V0: number, a: number): (x: number) => number {
  const k = Math.sqrt(2 * E), q: Cx = E < V0 ? [Math.sqrt(2 * (V0 - E)), 0] : E > V0 ? [0, Math.sqrt(2 * (E - V0))] : [1e-4, 0];
  const ik: Cx = [0, k], rq = cdiv(ik, q), qr = cdiv(q, ik);
  const em: Cx = cexp([-q[0] * a, -q[1] * a]), ep: Cx = cexp([q[0] * a, q[1] * a]);
  const t1 = cm(cm(em, cadd([1, 0], rq)), cadd([1, 0], qr)), t2 = cm(cm(ep, cadd([1, 0], [-rq[0], -rq[1]])), cadd([1, 0], [-qr[0], -qr[1]]));
  const den = cm(cexp([0, k * a]), [(t1[0] + t2[0]) / 2, (t1[1] + t2[1]) / 2]), t = cdiv([2, 0], den);
  const tp = cm(t, cexp([0, k * a])); // t e^{ika}
  const A = cm(cm(tp, em), [(1 + rq[0]) / 2, rq[1] / 2]), B = cm(cm(tp, ep), [(1 - rq[0]) / 2, -rq[1] / 2]), r: Cx = [A[0] + B[0] - 1, A[1] + B[1]];
  return (x: number) => {
    let p: Cx;
    if (x < 0) p = cadd(cexp([0, k * x]), cm(r, cexp([0, -k * x])));
    else if (x <= a) p = cadd(cm(A, cexp([q[0] * x, q[1] * x])), cm(B, cexp([-q[0] * x, -q[1] * x])));
    else p = cm(t, cexp([0, k * x]));
    return p[0] * p[0] + p[1] * p[1];
  };
}
export function trans(E: number, V0: number, a: number) {
  if (Math.abs(E - V0) < 1e-6) return 1 / (1 + (V0 * a * a) / 2);
  if (E < V0) { const k = Math.sqrt(2 * (V0 - E)), sh = Math.sinh(Math.min(k * a, 300)); return 1 / (1 + (V0 * V0 * sh * sh) / (4 * E * (V0 - E))); }
  const k = Math.sqrt(2 * (E - V0)), sn = Math.sin(k * a); return 1 / (1 + (V0 * V0 * sn * sn) / (4 * E * (E - V0)));
}

/* ================= 2-D Ising model ================= */
interface IsS { g: Int8Array; n: number; sweeps: number; m: number[]; e: number }
const IN = 36;
export const ising = defineSim<IsS>({
  id: 'ising_2d_metropolis', title: '2-D Ising Model: Metropolis Monte Carlo & Phase Transition',
  ...meta('Physics', 'Advanced', 'Statistical Mechanics', 'Phase Transitions', 'Ising model, magnetisation, critical temperature, Metropolis algorithm'),
  covers: ['Ising model', 'Phase transition', 'Critical temperature', 'Metropolis algorithm', 'Monte Carlo', 'Magnetisation', 'Spontaneous symmetry breaking', 'Statistical mechanics'],
  tags: ['M.Sc', 'statistical physics', 'CSIR NET', 'ferromagnet', 'Onsager', 'JAM'],
  learningObjectives: ['See spontaneous magnetisation below T_c ≈ 2.269 J/k_B and disorder above it.', 'Understand the Metropolis acceptance rule.'],
  assumptions: ['36×36 periodic lattice, J = 1, k_B = 1, zero field unless set; finite-size rounding of the transition.'],
  blurb: 'Spins ±1 flip according to the Metropolis rule. Lower the temperature through T_c ≈ 2.27 and domains coarsen into ordered magnetisation.',
  hint: 'ΔE = 2 s_i (J Σ neighbours + h). Accept if ΔE ≤ 0, else with probability e^{−ΔE/T}. |M| drops near T_c = 2J/ln(1+√2).',
  params: [
    { kind: 'number', id: 'T', label: 'Temperature T (J/k_B)', min: 0.5, max: 5, step: 0.05, value: 2.0, digits: 2 },
    { kind: 'number', id: 'h', label: 'External field h', min: -1, max: 1, step: 0.05, value: 0, digits: 2 },
    { kind: 'number', id: 'spf', label: 'Sweeps per frame', min: 1, max: 10, step: 1, value: 2, digits: 0 },
  ],
  actions: [{ id: 'hot', label: 'Randomise spins' }, { id: 'cold', label: 'All spins up' }],
  dt: 1 / 20, previewSeconds: 4,
  init() { const g = new Int8Array(IN * IN); for (let i = 0; i < g.length; i++) g[i] = Math.random() < 0.5 ? 1 : -1; return { g, n: IN, sweeps: 0, m: [], e: 0 }; },
  action(s, _v, id) { for (let i = 0; i < s.g.length; i++) s.g[i] = id === 'cold' ? 1 : Math.random() < 0.5 ? 1 : -1; s.m = []; s.sweeps = 0; },
  step(s, v) {
    const T = num(v, 'T'), hf = num(v, 'h'), g = s.g, n = IN;
    for (let sw = 0; sw < num(v, 'spf'); sw++) { for (let k = 0; k < n * n; k++) { const x = (Math.random() * n) | 0, y = (Math.random() * n) | 0, i = y * n + x, nb = g[y * n + ((x + 1) % n)] + g[y * n + ((x + n - 1) % n)] + g[((y + 1) % n) * n + x] + g[((y + n - 1) % n) * n + x], dE = 2 * g[i] * (nb + hf); if (dE <= 0 || Math.random() < Math.exp(-dE / T)) g[i] = -g[i] as 1 | -1; } s.sweeps++; }
    let M = 0, E = 0; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x; M += g[i]; E -= g[i] * (g[y * n + ((x + 1) % n)] + g[((y + 1) % n) * n + x]) + hf * g[i]; }
    s.m.push(M / (n * n)); if (s.m.length > 300) s.m.shift(); s.e = E / (n * n);
  },
  draw(c, s, _v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const sz = Math.min(h - 16, w * 0.55), cs = sz / IN;
    for (let y = 0; y < IN; y++) for (let x = 0; x < IN; x++) { c.fillStyle = s.g[y * IN + x] > 0 ? '#f59e0b' : '#1e3a8a'; c.fillRect(8 + x * cs, 8 + y * cs, cs + 0.5, cs + 0.5); }
    const G = { x: sz + 20, y: 8, w: w - sz - 28, h: h * 0.55 }, m = plot(c, G, [0, 300], [-1, 1], { title: 'magnetisation M per spin', zeroAxis: true });
    polyline(c, s.m.map((q, i) => [m.X(i), m.Y(q)] as [number, number]), C.cyan, 1.8); text(c, 'amber = +1, blue = −1', G.x, G.y + G.h + 18, C.dim, 11);
  },
  readouts(s) { const M = s.m[s.m.length - 1] ?? 0; return [{ label: '|M| per spin', value: fmt(Math.abs(M), 3) }, { label: 'Energy per spin', value: fmt(s.e, 3) }, { label: 'Sweeps', value: s.sweeps }, { label: 'T_c (Onsager)', value: '2.269' }]; },
  equations() { return ['H=-J\\sum_{\\langle ij\\rangle}s_is_j-h\\sum_is_i', 'P_{\\text{acc}}=\\min\\!\\left(1,e^{-\\Delta E/k_BT}\\right)', 'T_c=\\dfrac{2J}{k_B\\ln(1+\\sqrt2)}\\approx2.269\\,J/k_B']; },
});

/* ================= Fermi–Dirac / Bose–Einstein / Boltzmann ================= */
export const quantumStats = defineSim<T>({
  id: 'fermi_bose_boltzmann', title: 'Quantum Statistics: Fermi–Dirac vs Bose–Einstein vs Maxwell–Boltzmann',
  ...meta('Physics', 'Advanced', 'Statistical Mechanics', 'Quantum Statistics', 'Occupation numbers, Fermi energy, degeneracy'),
  covers: ['Fermi-Dirac distribution', 'Bose-Einstein distribution', 'Maxwell-Boltzmann distribution', 'Fermi energy', 'Chemical potential', 'Occupation number', 'Degenerate gas'],
  tags: ['M.Sc', 'statistical physics', 'CSIR NET', 'semiconductor', 'Fermi level', 'JAM'],
  learningObjectives: ['See the Fermi step smear over ≈ k_BT.', 'See Bose enhancement near μ and the classical limit when (E−μ) ≫ k_BT.'],
  assumptions: ['Single-particle occupation f(E) only; μ is set by the slider (not solved from particle number).'],
  blurb: 'Plot the three occupation functions together. Tune temperature and chemical potential and compare fermions, bosons and classical particles.',
  hint: 'f_FD=1/(e^{(E−μ)/kT}+1) ≤ 1; f_BE=1/(e^{(E−μ)/kT}−1) (needs E>μ); f_MB=e^{−(E−μ)/kT}. All agree when (E−μ)≫kT.',
  params: [
    { kind: 'number', id: 'kT', label: 'k_BT (eV)', min: 0.005, max: 0.5, step: 0.005, value: 0.05, digits: 3 },
    { kind: 'number', id: 'mu', label: 'μ (eV)', min: 0.2, max: 1.5, step: 0.01, value: 1, digits: 2 },
    { kind: 'toggle', id: 'fd', label: 'Fermi–Dirac', value: true }, { kind: 'toggle', id: 'be', label: 'Bose–Einstein', value: true }, { kind: 'toggle', id: 'mb', label: 'Maxwell–Boltzmann', value: true },
  ],
  ...tick,
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const kT = num(v, 'kT'), mu = num(v, 'mu'); const m = plot(c, { x: 8, y: 8, w: w - 16, h: h - 16 }, [0, 2], [0, 2], { title: 'occupation f(E)', xlabel: 'E (eV)' });
    const f = (kind: string, E: number) => { const x = (E - mu) / kT; return kind === 'fd' ? 1 / (Math.exp(clamp(x, -50, 50)) + 1) : kind === 'be' ? (x > 0.001 ? 1 / (Math.exp(clamp(x, 0, 50)) - 1) : NaN) : Math.exp(-clamp(x, -50, 50)); };
    for (const [k, col] of [['fd', C.cyan], ['be', C.green], ['mb', C.amber]] as const) { if (!bool(v, k)) continue; let seg: [number, number][] = []; for (let i = 0; i <= 400; i++) { const E = (2 * i) / 400, y = f(k, E); if (!Number.isFinite(y)) { if (seg.length) polyline(c, seg, col, 2); seg = []; continue; } seg.push([m.X(E), m.Y(Math.min(2, y))]); } if (seg.length) polyline(c, seg, col, 2); }
    line(c, m.X(mu), m.Y(0), m.X(mu), m.Y(2), C.dim, 1, [4, 4]); text(c, 'μ', m.X(mu) + 4, m.Y(1.9), C.dim, 11);
  },
  readouts(_s, v) { const kT = num(v, 'kT'); return [{ label: 'k_BT', value: fmt(kT, 3) + ' eV' }, { label: 'Fermi smearing width ≈ 4k_BT', value: fmt(4 * kT, 3) + ' eV' }, { label: 'Temperature', value: fmt(kT / 8.617e-5, 0) + ' K' }]; },
  equations() { return ['f_{FD}=\\dfrac1{e^{(E-\\mu)/k_BT}+1}', 'f_{BE}=\\dfrac1{e^{(E-\\mu)/k_BT}-1}', 'f_{MB}=e^{-(E-\\mu)/k_BT}']; },
});

/* ================= Poiseuille / Couette / boundary-layer velocity profiles ================= */
export const viscousFlow = defineSim<T>({
  id: 'viscous_channel_flow', title: 'Viscous Flow: Couette–Poiseuille Velocity Profile & Wall Shear',
  ...meta('Engineering', 'Intermediate', 'Fluid Mechanics', 'Viscous Flow', 'Couette flow, Poiseuille flow, shear stress, flow rate'),
  covers: ['Couette flow', 'Poiseuille flow', 'Navier-Stokes exact solution', 'Viscosity', 'Wall shear stress', 'Laminar flow', 'Velocity profile', 'Hagen-Poiseuille'],
  tags: ['fluid mechanics', 'GATE ME', 'GATE CE', 'M.Tech', 'laminar', 'pipe flow', 'AE', 'chemical engineering'],
  learningObjectives: ['Combine a moving wall (Couette) with a pressure gradient (Poiseuille).', 'See the parabolic profile and that flow rate ∝ h³ ΔP.'],
  assumptions: ['Steady, fully-developed, incompressible laminar flow between two infinite parallel plates; no-slip.'],
  blurb: 'Fluid flows between two plates. Drive it by moving the top plate, by a pressure gradient, or both, and watch particles follow the exact Navier–Stokes profile.',
  hint: 'μ u″ = dp/dx with u(0)=0, u(h)=U ⇒ u(y)=U y/h + (G/2μ) y(h−y), G=−dp/dx. Q = Uh/2 + G h³/(12μ). τ_w = μ du/dy|wall.',
  params: [
    { kind: 'number', id: 'U', label: 'Top-plate speed U (m/s)', min: -2, max: 2, step: 0.1, value: 0.5, digits: 1 },
    { kind: 'number', id: 'G', label: 'Pressure gradient −dp/dx (Pa/m)', min: -2000, max: 2000, step: 20, value: 600, digits: 0 },
    { kind: 'number', id: 'mu', label: 'Viscosity μ (Pa·s)', min: 0.01, max: 1, step: 0.01, value: 0.1, digits: 2 },
    { kind: 'number', id: 'h', label: 'Gap h (mm)', min: 2, max: 40, step: 1, value: 20, digits: 0 },
  ],
  ...tick, dt: 1 / 30,
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const U = num(v, 'U'), G = num(v, 'G'), mu = num(v, 'mu'), gap = num(v, 'h') / 1000;
    const u = (y: number) => U * (y / gap) + (G / (2 * mu)) * y * (gap - y), umax = Math.max(0.2, ...Array.from({ length: 41 }, (_, i) => Math.abs(u((gap * i) / 40))));
    const ch = { x: 20, y: h * 0.18, w: w * 0.55, h: h * 0.62 }; c.fillStyle = 'rgba(34,211,238,0.07)'; c.fillRect(ch.x, ch.y, ch.w, ch.h); line(c, ch.x, ch.y + ch.h, ch.x + ch.w, ch.y + ch.h, C.white, 4); line(c, ch.x, ch.y, ch.x + ch.w, ch.y, C.white, 4);
    arrowH(c, ch.x + ch.w * 0.5, ch.y - 10, U); text(c, `U = ${fmt(U, 1)} m/s`, ch.x, ch.y - 14, C.text, 11);
    const pts: [number, number][] = []; for (let i = 0; i <= 40; i++) { const y = (gap * i) / 40; pts.push([ch.x + 10 + (u(y) / umax) * 0.45 * ch.w + 0.45 * ch.w * 0.0, ch.y + ch.h - (y / gap) * ch.h]); }
    const x0 = ch.x + ch.w * 0.5; for (let i = 0; i <= 40; i += 4) { const y = (gap * i) / 40, py = ch.y + ch.h - (y / gap) * ch.h; line(c, x0, py, x0 + (u(y) / umax) * ch.w * 0.45, py, C.amber, 1.5); }
    polyline(c, pts.map(([, py], i) => [x0 + (u((gap * i) / 40) / umax) * ch.w * 0.45, py] as [number, number]), C.amber, 2.5); line(c, x0, ch.y, x0, ch.y + ch.h, C.dim, 1, [3, 3]);
    for (let k = 0; k < 18; k++) { const y = (((k * 0.618 + 0.1) % 1) * 0.94 + 0.03) * gap, x = ch.x + ((((k * 0.37) % 1) + (u(y) / umax) * s.t * 0.25) % 1 + 1) % 1 * ch.w; circle(c, x, ch.y + ch.h - (y / gap) * ch.h, 3, C.cyan); }
    text(c, 'u(y) profile', x0, ch.y + ch.h + 18, C.amber, 11, 'center');
  },
  readouts(_s, v) { const U = num(v, 'U'), G = num(v, 'G'), mu = num(v, 'mu'), gap = num(v, 'h') / 1000; return [{ label: 'Flow rate per width Q', value: fmt(U * gap / 2 + (G * gap ** 3) / (12 * mu), 6) + ' m²/s' }, { label: 'Wall shear (bottom)', value: fmt(mu * (U / gap + (G * gap) / (2 * mu)), 3) + ' Pa' }, { label: 'Wall shear (top)', value: fmt(mu * (U / gap - (G * gap) / (2 * mu)), 3) + ' Pa' }, { label: 'Reynolds Re = ρUh/μ (water-like ρ=1000)', value: fmt(Math.abs(1000 * U * gap / mu), 1) }]; },
  equations() { return ['u(y)=U\\dfrac yh+\\dfrac{G}{2\\mu}y(h-y)', 'Q=\\dfrac{Uh}{2}+\\dfrac{Gh^3}{12\\mu}', '\\tau_w=\\mu\\left.\\dfrac{du}{dy}\\right|_{y=0}']; },
});
function arrowH(c: CanvasRenderingContext2D, x: number, y: number, U: number) { const L = Math.sign(U) * Math.min(80, Math.abs(U) * 40); if (Math.abs(L) < 1) return; line(c, x, y, x + L, y, C.amber, 3); line(c, x + L, y, x + L - Math.sign(L) * 8, y - 5, C.amber, 3); line(c, x + L, y, x + L - Math.sign(L) * 8, y + 5, C.amber, 3); }

/* ================= Orbital mechanics: Kepler & Hohmann transfer ================= */
interface OrS { t: number; trail: [number, number][]; ang: number }
export const hohmann = defineSim<OrS>({
  id: 'hohmann_transfer_orbit', title: 'Orbital Mechanics: Hohmann Transfer, Vis-viva & Delta-v',
  ...meta('Engineering', 'Advanced', 'Aerospace', 'Orbital Mechanics', 'Hohmann transfer, vis-viva equation, delta-v budget, Kepler laws'),
  covers: ['Hohmann transfer', 'Vis-viva equation', 'Kepler laws', 'Delta-v', 'Elliptical orbit', 'Orbital period', 'Rocket equation', 'Specific impulse'],
  tags: ['aerospace', 'GATE AE', 'M.Tech', 'ISRO', 'satellite', 'orbit', 'Tsiolkovsky'],
  learningObjectives: ['Compute the two burns for a circular→circular transfer.', 'Relate Δv to propellant mass with the rocket equation.'],
  assumptions: ['Two-body Keplerian motion about Earth (μ = 3.986×10¹⁴ m³/s²), coplanar circular orbits, impulsive burns.'],
  blurb: 'Choose a start and target circular orbit radius. The satellite follows the exact Hohmann ellipse; readouts give both burns, transfer time and propellant fraction for your Isp.',
  hint: 'v_circ = √(μ/r); v = √(μ(2/r − 1/a)). Δv₁ = √(μ/r₁)(√(2r₂/(r₁+r₂)) − 1); Δv₂ = √(μ/r₂)(1 − √(2r₁/(r₁+r₂))); t = π√(a³/μ). m_prop/m₀ = 1 − e^{−Δv/(g₀Isp)}.',
  params: [
    { kind: 'number', id: 'r1', label: 'Start orbit altitude (km)', min: 300, max: 2000, step: 50, value: 500, digits: 0 },
    { kind: 'number', id: 'r2', label: 'Target orbit altitude (km)', min: 2000, max: 36000, step: 500, value: 35786, digits: 0 },
    { kind: 'number', id: 'isp', label: 'Specific impulse Isp (s)', min: 200, max: 460, step: 10, value: 320, digits: 0 },
    { kind: 'number', id: 'speed', label: 'Time warp (×1000)', min: 1, max: 30, step: 1, value: 8, digits: 0 },
  ],
  dt: 1 / 30, previewSeconds: 8,
  init() { return { t: 0, trail: [], ang: 0 }; },
  step(s, v, dt) { const o = orb(v); s.t += dt * num(v, 'speed') * 1000; const T = o.tt * 2 + o.p1; s.t %= o.p1 * 0.5 + o.tt + o.p2 * 0.5 + 1; void T; s.trail = s.trail.slice(-300); },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const o = orb(v), R = 6378e3, cx = w * 0.4, cy = h / 2, sc = (Math.min(w * 0.38, h * 0.46)) / o.r2;
    circle(c, cx, cy, R * sc, '#1d4ed8', '#60a5fa'); const ring = (r: number, col: string) => { c.strokeStyle = col; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, r * sc, 0, TAU); c.stroke(); }; ring(o.r1, C.cyan); ring(o.r2, C.green);
    c.strokeStyle = C.amber; c.lineWidth = 1.5; c.setLineDash([5, 4]); c.beginPath(); for (let i = 0; i <= 200; i++) { const th = (i / 200) * Math.PI, r = o.a * (1 - o.e * o.e) / (1 + o.e * Math.cos(th)), x = cx + r * sc * Math.cos(th), y = cy - r * sc * Math.sin(th); if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke(); c.setLineDash([]);
    // phases: circular parking (0.5 period) -> transfer -> circular target
    let x: number, y: number; const t1 = o.p1 * 0.5, tt = o.tt;
    if (s.t < t1) { const th = (TAU * s.t) / o.p1; x = cx + o.r1 * sc * Math.cos(th); y = cy - o.r1 * sc * Math.sin(th); }
    else if (s.t < t1 + tt) { const M = Math.PI * ((s.t - t1) / tt), th = kepler(M, o.e), r = o.a * (1 - o.e * o.e) / (1 + o.e * Math.cos(th)); x = cx + r * sc * Math.cos(th); y = cy - r * sc * Math.sin(th); }
    else { const th = Math.PI + (TAU * (s.t - t1 - tt)) / o.p2; x = cx + o.r2 * sc * Math.cos(th); y = cy - o.r2 * sc * Math.sin(th); }
    circle(c, x, y, 5, C.amber, C.white); text(c, 'burn 1 at perigee', cx + o.r1 * sc + 4, cy - 6, C.cyan, 10); text(c, 'burn 2 at apogee', cx - o.r2 * sc - 4, cy - 6, C.green, 10, 'right');
  },
  readouts(_s, v) { const o = orb(v), g0 = 9.80665, mf = 1 - Math.exp(-(o.dv1 + o.dv2) / (g0 * num(v, 'isp'))); return [{ label: 'Δv₁ (perigee burn)', value: fmt(o.dv1, 0) + ' m/s' }, { label: 'Δv₂ (apogee burn)', value: fmt(o.dv2, 0) + ' m/s' }, { label: 'Total Δv', value: fmt(o.dv1 + o.dv2, 0) + ' m/s' }, { label: 'Transfer time', value: fmt(o.tt / 3600, 2) + ' h' }, { label: 'Propellant fraction', value: fmt(mf * 100, 1) + ' % of initial mass' }]; },
  equations() { return ['v=\\sqrt{\\mu\\left(\\tfrac2r-\\tfrac1a\\right)}', '\\Delta v_1=\\sqrt{\\tfrac{\\mu}{r_1}}\\left(\\sqrt{\\tfrac{2r_2}{r_1+r_2}}-1\\right)', 't_{tr}=\\pi\\sqrt{\\tfrac{a^3}{\\mu}},\\quad \\dfrac{m_p}{m_0}=1-e^{-\\Delta v/(g_0I_{sp})}']; },
});
function orb(v: Record<string, number | string | boolean>) { const MU = 3.986004418e14, R = 6378e3, r1 = R + num(v, 'r1') * 1e3, r2 = R + Math.max(num(v, 'r2'), num(v, 'r1') + 1) * 1e3, a = (r1 + r2) / 2, e = (r2 - r1) / (r2 + r1); return { r1, r2, a, e, dv1: Math.sqrt(MU / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1), dv2: Math.sqrt(MU / r2) * (1 - Math.sqrt((2 * r1) / (r1 + r2))), tt: Math.PI * Math.sqrt((a * a * a) / MU), p1: TAU * Math.sqrt((r1 ** 3) / MU), p2: TAU * Math.sqrt((r2 ** 3) / MU) }; }
function kepler(M: number, e: number) { let E = M; for (let i = 0; i < 30; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2)); }

/* ================= Thermodynamic cycles: Otto / Diesel / Brayton ================= */
export const thermoCycles = defineSim<T>({
  id: 'otto_diesel_brayton_cycles', title: 'Thermodynamic Cycles: Otto, Diesel & Brayton on the P–V Diagram',
  ...meta('Engineering', 'Intermediate', 'Thermodynamics', 'Power Cycles', 'Air-standard cycles, efficiency, compression ratio, net work'),
  covers: ['Otto cycle', 'Diesel cycle', 'Brayton cycle', 'Air-standard cycle', 'Thermal efficiency', 'Compression ratio', 'P-V diagram', 'Isentropic process', 'Net work output'],
  tags: ['thermodynamics', 'GATE ME', 'M.Tech', 'IC engine', 'gas turbine', 'heat engine'],
  learningObjectives: ['Trace each cycle on a P–V diagram and see the enclosed area = net work.', 'Compare efficiencies versus compression ratio and cut-off.'],
  assumptions: ['Ideal-gas air standard, constant γ, reversible processes, no losses; Brayton shown with pressure ratio r_p.'],
  blurb: 'Choose Otto, Diesel or Brayton and change the compression ratio and heat addition. The shaded loop is the work; efficiency is computed from the exact state points.',
  hint: 'Otto η = 1 − r^{1−γ}. Diesel η = 1 − [r^{1−γ}(ρ^γ−1)]/[γ(ρ−1)]. Brayton η = 1 − r_p^{(1−γ)/γ}. Efficiency rises with r.',
  params: [
    { kind: 'select', id: 'cycle', label: 'Cycle', value: 'otto', options: [{ value: 'otto', label: 'Otto (petrol)' }, { value: 'diesel', label: 'Diesel' }, { value: 'brayton', label: 'Brayton (gas turbine)' }] },
    { kind: 'number', id: 'r', label: 'Compression ratio / pressure ratio', min: 2, max: 25, step: 0.5, value: 9, digits: 1 },
    { kind: 'number', id: 'q', label: 'Heat added (relative)', min: 0.5, max: 3, step: 0.1, value: 1.5, digits: 1 },
    { kind: 'number', id: 'g', label: 'γ', min: 1.1, max: 1.67, step: 0.01, value: 1.4, digits: 2 },
  ],
  ...tick,
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const cy = cyc(v), A = { x: 8, y: 8, w: w * 0.66, h: h - 16 };
    const xs = cy.pts.map(p => p[0]), ys = cy.pts.map(p => p[1]), m = plot(c, A, [0, Math.max(...xs) * 1.1], [0, Math.max(...ys) * 1.1], { title: `${str(v, 'cycle')} cycle P–V (relative units)`, xlabel: 'V', ylabel: 'P' });
    c.fillStyle = 'rgba(34,211,238,0.18)'; c.beginPath(); cy.pts.forEach(([x, y], i) => (i ? c.lineTo(m.X(x), m.Y(y)) : c.moveTo(m.X(x), m.Y(y)))); c.closePath(); c.fill();
    polyline(c, cy.pts.map(([x, y]) => [m.X(x), m.Y(y)] as [number, number]), C.amber, 2.5);
    cy.corners.forEach(([x, y], i) => { circle(c, m.X(x), m.Y(y), 4, C.white); text(c, String(i + 1), m.X(x) + 6, m.Y(y) - 6, C.text, 11, 'left', 'alphabetic', true); });
    const k = Math.floor((s.t * 0.3 % 1) * cy.pts.length); circle(c, m.X(cy.pts[k][0]), m.Y(cy.pts[k][1]), 6, C.red, C.white);
    const B = { x: A.x + A.w + 10, y: 8, w: w - A.w - 26, h: h * 0.5 }, mb = plot(c, B, [2, 25], [0, 0.8], { title: 'η vs ratio', xlabel: 'r' }); const cv: [number, number][] = []; for (let r = 2; r <= 25; r += 0.5) cv.push([mb.X(r), mb.Y(cyc({ ...v, r }).eta)]); polyline(c, cv, C.green, 2); circle(c, mb.X(num(v, 'r')), mb.Y(cy.eta), 5, C.red, C.white);
  },
  readouts(_s, v) { const cy = cyc(v); return [{ label: 'Thermal efficiency', value: fmt(cy.eta * 100, 1) + ' %' }, { label: 'Net work (relative)', value: fmt(cy.w, 3) }, { label: 'Heat in (relative)', value: fmt(cy.qin, 3) }]; },
  equations(_s, v) { const g = fmt(num(v, 'g'), 2); return [`\\eta_{Otto}=1-r^{1-\\gamma},\\ \\gamma=${g}`, '\\eta_{Diesel}=1-\\dfrac{r^{1-\\gamma}(\\rho^\\gamma-1)}{\\gamma(\\rho-1)}', '\\eta_{Brayton}=1-r_p^{(1-\\gamma)/\\gamma}', 'W_{net}=\\oint P\\,dV']; },
});
function cyc(v: Record<string, number | string | boolean>) {
  const g = num(v, 'g'), r = num(v, 'r'), qrel = num(v, 'q'), kind = str(v, 'cycle'), P1 = 1, V1 = 1, N = 40, pts: [number, number][] = [], corners: [number, number][] = [];
  const iso = (Pa: number, Va: number, Vb: number) => { for (let i = 1; i <= N; i++) { const V = Va + ((Vb - Va) * i) / N; pts.push([V, Pa * Math.pow(Va / V, g)]); } return Pa * Math.pow(Va / Vb, g); };
  const line2 = (Pa: number, Va: number, Pb: number, Vb: number) => { for (let i = 1; i <= N; i++) pts.push([Va + ((Vb - Va) * i) / N, Pa + ((Pb - Pa) * i) / N]); };
  corners.push([V1, P1]); pts.push([V1, P1]);
  if (kind === 'brayton') { const P2 = P1 * r, V2 = V1 * Math.pow(1 / r, 1 / g); pts.length = 0; pts.push([V1, P1]); for (let i = 1; i <= N; i++) { const V = V1 + ((V2 - V1) * i) / N; pts.push([V, P1 * Math.pow(V1 / V, g)]); } corners.push([V2, P2]); const T3rel = 1 + qrel, V3 = V2 * T3rel; line2(P2, V2, P2, V3); corners.push([V3, P2]); const V4 = V3 * Math.pow(P2 / P1, 1 / g); for (let i = 1; i <= N; i++) { const V = V3 + ((V4 - V3) * i) / N; pts.push([V, P2 * Math.pow(V3 / V, g)]); } corners.push([V4, P1]); line2(P1, V4, P1, V1); const eta = 1 - Math.pow(r, (1 - g) / g), qin = qrel; return { pts, corners, eta, w: eta * qin, qin }; }
  const V2 = V1 / r, P2 = iso(P1, V1, V2); corners.push([V2, P2]);
  if (kind === 'otto') { const P3 = P2 * (1 + qrel * 2); line2(P2, V2, P3, V2); corners.push([V2, P3]); iso(P3, V2, V1); corners.push([V1, P3 * Math.pow(V2 / V1, g)]); const eta = 1 - Math.pow(r, 1 - g); line2(P3 * Math.pow(V2 / V1, g), V1, P1, V1); return { pts, corners, eta, w: eta * qrel, qin: qrel }; }
  const rho = 1 + qrel * 0.6, V3 = V2 * rho; line2(P2, V2, P2, V3); corners.push([V3, P2]); iso(P2, V3, V1); corners.push([V1, P2 * Math.pow(V3 / V1, g)]); line2(P2 * Math.pow(V3 / V1, g), V1, P1, V1);
  const eta = 1 - (Math.pow(r, 1 - g) * (Math.pow(rho, g) - 1)) / (g * (rho - 1)); return { pts, corners, eta, w: eta * qrel, qin: qrel };
}

/* ================= Heat exchanger LMTD / effectiveness-NTU ================= */
export const heatExchanger = defineSim<T>({
  id: 'heat_exchanger_ntu', title: 'Heat Exchanger: Counter-flow vs Parallel-flow, LMTD & Effectiveness–NTU',
  ...meta('Engineering', 'Advanced', 'Heat Transfer', 'Heat Exchangers', 'Temperature profiles, LMTD, effectiveness-NTU method'),
  covers: ['Heat exchanger', 'LMTD', 'Effectiveness-NTU method', 'Counter-flow', 'Parallel-flow', 'Overall heat transfer coefficient', 'Heat capacity rate', 'Heat transfer'],
  tags: ['heat transfer', 'GATE ME', 'GATE CH', 'M.Tech', 'NTU', 'thermal engineering'],
  learningObjectives: ['Compare temperature profiles along parallel and counter-flow exchangers.', 'See effectiveness saturate as NTU grows.'],
  assumptions: ['Steady state, constant properties and U, no losses; single-pass concentric tube.'],
  blurb: 'Hot and cold streams exchange heat along a tube. Change flow, area and U and see exit temperatures, LMTD and effectiveness for counter-flow or parallel-flow.',
  hint: 'NTU = UA/C_min; Cr = C_min/C_max. Counter: ε=(1−e^{−NTU(1−Cr)})/(1−Cr e^{−NTU(1−Cr)}); parallel: ε=(1−e^{−NTU(1+Cr)})/(1+Cr). Q=εC_min(Th,in−Tc,in).',
  params: [
    { kind: 'select', id: 'arr', label: 'Arrangement', value: 'counter', options: [{ value: 'counter', label: 'Counter-flow' }, { value: 'parallel', label: 'Parallel-flow' }] },
    { kind: 'number', id: 'UA', label: 'UA (kW/K)', min: 0.2, max: 20, step: 0.2, value: 4, digits: 1 },
    { kind: 'number', id: 'Ch', label: 'C_hot (kW/K)', min: 0.5, max: 10, step: 0.1, value: 2, digits: 1 },
    { kind: 'number', id: 'Cc', label: 'C_cold (kW/K)', min: 0.5, max: 10, step: 0.1, value: 3, digits: 1 },
    { kind: 'number', id: 'Th', label: 'Hot inlet (°C)', min: 60, max: 200, step: 5, value: 120, digits: 0 },
    { kind: 'number', id: 'Tc', label: 'Cold inlet (°C)', min: 5, max: 50, step: 1, value: 20, digits: 0 },
  ],
  ...tick,
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const hx = hxs(v), A = { x: 8, y: 8, w: w * 0.7, h: h - 16 }, m = plot(c, A, [0, 1], [Math.min(num(v, 'Tc'), num(v, 'Th')) - 5, Math.max(num(v, 'Tc'), num(v, 'Th')) + 5], { title: 'temperature along exchanger (°C)', xlabel: 'position x/L' });
    const H: [number, number][] = [], K: [number, number][] = []; for (let i = 0; i <= 60; i++) { const x = i / 60, [a, b] = hx.prof(x); H.push([m.X(x), m.Y(a)]); K.push([m.X(x), m.Y(b)]); } polyline(c, H, C.red, 3); polyline(c, K, C.cyan, 3);
    text(c, 'hot', m.X(0.02), m.Y(num(v, 'Th')) + 14, C.red, 11); text(c, 'cold', m.X(0.9), m.Y(hx.prof(1)[1]) - 6, C.cyan, 11);
  },
  readouts(_s, v) { const hx = hxs(v); return [{ label: 'NTU', value: fmt(hx.ntu, 2) }, { label: 'Effectiveness ε', value: fmt(hx.eps, 3) }, { label: 'Heat duty Q', value: fmt(hx.q, 1) + ' kW' }, { label: 'Hot outlet', value: fmt(hx.prof(1)[0], 1) + ' °C' }, { label: 'LMTD', value: Number.isFinite(hx.lmtd) ? fmt(hx.lmtd, 1) + ' K' : 'n/a' }]; },
  equations() { return ['Q=\\varepsilon\\,C_{\\min}(T_{h,in}-T_{c,in})', 'Q=UA\\,\\Delta T_{lm},\\quad \\Delta T_{lm}=\\dfrac{\\Delta T_1-\\Delta T_2}{\\ln(\\Delta T_1/\\Delta T_2)}', '\\mathrm{NTU}=UA/C_{\\min}']; },
});
function hxs(v: Record<string, number | string | boolean>) {
  const UA = num(v, 'UA'), Ch = num(v, 'Ch'), Cc = num(v, 'Cc'), Th = num(v, 'Th'), Tc = num(v, 'Tc'), counter = str(v, 'arr') === 'counter', Cmin = Math.min(Ch, Cc), Cmax = Math.max(Ch, Cc), Cr = Cmin / Cmax, ntu = UA / Cmin;
  const eps = counter ? (Math.abs(1 - Cr) < 1e-6 ? ntu / (1 + ntu) : (1 - Math.exp(-ntu * (1 - Cr))) / (1 - Cr * Math.exp(-ntu * (1 - Cr)))) : (1 - Math.exp(-ntu * (1 + Cr))) / (1 + Cr);
  const q = eps * Cmin * (Th - Tc), Tho = Th - q / Ch, Tco = Tc + q / Cc;
  const d1 = counter ? Th - Tco : Th - Tc, d2 = counter ? Tho - Tc : Tho - Tco, lmtd = Math.abs(d1 - d2) < 1e-6 ? d1 : (d1 - d2) / Math.log(d1 / d2);
  const prof = (x: number): [number, number] => {
    if (!counter) { const dT = (Th - Tc) * Math.exp(-UA * (1 / Ch + 1 / Cc) * x), Tm = (Ch * Th + Cc * Tc) / (Ch + Cc); return [Tm + (dT * Cc) / (Ch + Cc), Tm - (dT * Ch) / (Ch + Cc)]; }
    // counter-flow, x = 0 at hot inlet / cold outlet: dTh/dx = -(UA/Ch)D, D(x)=D0 e^{-(a-b)x}, D0 = Th - Tco
    const a = UA / Ch, b = UA / Cc, lam = a - b, D0 = Th - Tco, D = D0 * Math.exp(-lam * x), Thx = Th - a * D0 * (Math.abs(lam) < 1e-9 ? x : (1 - Math.exp(-lam * x)) / lam);
    return [Thx, Thx - D];
  };
  return { ntu, eps, q, lmtd, prof };
}
