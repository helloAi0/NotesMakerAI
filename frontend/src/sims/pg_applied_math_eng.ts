import { defineSim, num, str, bool, PG_ALL, UG_ENG } from './types';
import type { EducationLevel, Difficulty, SimSubject } from './types';
import { C, TAU, clamp, fmt, line, plot, polyline, text, circle } from './draw';

const meta = (subject: SimSubject, difficulty: Difficulty, category: string, topic: string, subtopic: string, levels: EducationLevel[] = [...PG_ALL, ...UG_ENG, 'B.Sc']) => ({
  subject, status: 'active' as const, educationLevels: levels, difficulty, category, topic, subtopic,
});
type T = { t: number };
const tick = { dt: 1 / 30, previewSeconds: 2, init: (): T => ({ t: 0 }), step: (s: T, _v: unknown, dt: number) => { s.t += dt; } };

/* ================= Blasius boundary layer ================= */
let blasiusCache: { eta: number[]; fp: number[] } | null = null;
function blasius() {
  if (blasiusCache) return blasiusCache;
  // f''' + 0.5 f f'' = 0, f(0)=f'(0)=0, f''(0)=0.33206 ; RK4 in eta
  let f = 0, g = 0, h = 0.332057; const eta: number[] = [0], fp: number[] = [0], d = 0.02;
  const F = (y: number[]) => [y[1], y[2], -0.5 * y[0] * y[2]];
  for (let i = 0; i < 500; i++) { const y = [f, g, h], k1 = F(y), k2 = F(y.map((q, j) => q + 0.5 * d * k1[j])), k3 = F(y.map((q, j) => q + 0.5 * d * k2[j])), k4 = F(y.map((q, j) => q + d * k3[j])); f += (d / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); g += (d / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]); h += (d / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]); eta.push((i + 1) * d); fp.push(g); }
  return (blasiusCache = { eta, fp });
}
export const blasiusLayer = defineSim<T>({
  id: 'blasius_boundary_layer', title: 'Laminar Boundary Layer on a Flat Plate: Blasius Solution',
  ...meta('Engineering', 'Advanced', 'Fluid Mechanics', 'Boundary Layers', 'Blasius similarity solution, δ99, skin friction, transition'),
  covers: ['Boundary layer', 'Blasius solution', 'Boundary layer thickness', 'Skin friction coefficient', 'Reynolds number', 'Laminar to turbulent transition', 'Similarity solution', 'No-slip condition'],
  tags: ['fluid mechanics', 'aerodynamics', 'GATE ME', 'GATE AE', 'M.Tech', 'boundary layer theory', 'Prandtl'],
  learningObjectives: ['See δ ∝ √(νx/U) grows along the plate.', 'Compute local skin friction and see where Re_x ≈ 5×10⁵ would trigger transition.'],
  assumptions: ['Zero-pressure-gradient, steady, incompressible laminar flow over a semi-infinite flat plate; f(η) solved by RK4 shooting (f″(0)=0.33206).'],
  blurb: 'Fluid with free-stream speed U meets a flat plate. The boundary layer thickens as √x; the similarity profile u/U = f′(η) comes from solving f‴+½ff″=0 numerically.',
  hint: 'η=y√(U/νx). δ₉₉≈4.91x/√Re_x. Cf=0.664/√Re_x. Transition to turbulence is expected near Re_x≈5×10⁵.',
  params: [
    { kind: 'number', id: 'U', label: 'Free-stream speed U (m/s)', min: 0.1, max: 60, step: 0.1, value: 5, digits: 1 },
    { kind: 'select', id: 'fluid', label: 'Fluid', value: 'air', options: [{ value: 'air', label: 'Air (ν = 1.5×10⁻⁵ m²/s)' }, { value: 'water', label: 'Water (ν = 1.0×10⁻⁶ m²/s)' }] },
    { kind: 'number', id: 'x', label: 'Station x along plate (m)', min: 0.01, max: 2, step: 0.01, value: 0.5, digits: 2 },
  ],
  ...tick,
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const U = num(v, 'U'), nu = str(v, 'fluid') === 'air' ? 1.5e-5 : 1e-6, x0 = num(v, 'x'), B = blasius();
    const del = (x: number) => (4.91 * x) / Math.sqrt(Math.max(1e-9, (U * x) / nu)), dmax = del(2), A = { x: 8, y: 8, w: w * 0.58, h: h - 16 };
    const m = plot(c, A, [0, 2], [0, dmax * 1.4 * 1000], { title: 'δ₉₉(x) growth (mm)', xlabel: 'x (m)' }); polyline(c, Array.from({ length: 101 }, (_, i) => [m.X((2 * i) / 100), m.Y(del((2 * i) / 100 + 1e-6) * 1000)] as [number, number]), C.amber, 2.5);
    circle(c, m.X(x0), m.Y(del(x0) * 1000), 5, C.red, C.white); const rx = (U * x0) / nu; if ((U * 0.01) / nu < 5e5 && rx > 5e5) text(c, 'beyond Re_x = 5×10⁵: expect transition', A.x + 50, A.y + 40, C.red, 11);
    const xt = nu * 5e5 / U; if (xt < 2) { line(c, m.X(xt), m.Y(0), m.X(xt), m.Y(dmax * 1.4 * 1000), C.red, 1, [4, 4]); text(c, 'x_transition', m.X(xt) + 3, m.Y(dmax * 1.3 * 1000), C.red, 10); }
    const P = { x: A.x + A.w + 10, y: 8, w: w - A.w - 26, h: h - 16 }, mp = plot(c, P, [0, 1], [0, 8], { title: `u/U vs η at x = ${fmt(x0, 2)} m`, xlabel: 'u/U', ylabel: 'η = y√(U/νx)' });
    polyline(c, B.eta.filter(e => e <= 8).map((e, i) => [mp.X(B.fp[i]), mp.Y(e)] as [number, number]), C.cyan, 2.5); line(c, mp.X(0), mp.Y(4.91), mp.X(1), mp.Y(4.91), C.dim, 1, [4, 3]); text(c, 'δ₉₉ (η = 4.91)', mp.X(0.05), mp.Y(4.91) - 4, C.dim, 10);
  },
  readouts(_s, v) { const U = num(v, 'U'), nu = str(v, 'fluid') === 'air' ? 1.5e-5 : 1e-6, x = num(v, 'x'), Re = (U * x) / nu; return [{ label: 'Re_x', value: Re.toExponential(2) }, { label: 'δ₉₉', value: fmt((4.91 * x) / Math.sqrt(Re) * 1000, 2) + ' mm' }, { label: 'Local Cf', value: fmt(0.664 / Math.sqrt(Re), 5) }, { label: 'Regime at x', value: Re < 5e5 ? 'laminar' : 'transitional/turbulent (model invalid)' }]; },
  equations() { return ['f\'\'\'+\\tfrac12ff\'\'=0,\\ f(0)=f\'(0)=0,\\ f\'(\\infty)=1', '\\delta_{99}\\approx\\dfrac{4.91\\,x}{\\sqrt{Re_x}}', 'C_f=\\dfrac{0.664}{\\sqrt{Re_x}}']; },
});

/* ================= Airfoil lift (thin-airfoil theory + stall) ================= */
function naca4(m: number, p: number, t: number, n = 60): { up: [number, number][]; lo: [number, number][]; camber: [number, number][] } {
  const up: [number, number][] = [], lo: [number, number][] = [], camber: [number, number][] = [];
  for (let i = 0; i <= n; i++) { const x = 0.5 * (1 - Math.cos((Math.PI * i) / n)), yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4); let yc = 0, dy = 0; if (p > 0 && m > 0) { if (x < p) { yc = (m / (p * p)) * (2 * p * x - x * x); dy = ((2 * m) / (p * p)) * (p - x); } else { yc = (m / ((1 - p) ** 2)) * (1 - 2 * p + 2 * p * x - x * x); dy = ((2 * m) / ((1 - p) ** 2)) * (p - x); } } const th = Math.atan(dy); up.push([x - yt * Math.sin(th), yc + yt * Math.cos(th)]); lo.push([x + yt * Math.sin(th), yc - yt * Math.cos(th)]); camber.push([x, yc]); }
  return { up, lo, camber };
}
function airfoilCL(alpha: number, m: number, p: number) {
  const a0 = -(m * 100) * 0.0175 * 0.95 * (p > 0 ? 1 : 0) * 1; // zero-lift angle (rad) approx −camber·1.0: thin-airfoil estimate −2m·(~0.9)
  const CLa = 2 * Math.PI, ast = 0.26 + m * 2, a = (alpha * Math.PI) / 180, lin = CLa * (a - (m > 0 ? -2.0 * m * 0.95 * 1 : 0) * 1);
  void a0; const clmax = CLa * (ast + 2 * m * 0.95) * 0.9; // linear up to stall, then smooth drop to flat-plate-like
  if (lin > clmax) return Math.max(0.5 * Math.sin(2 * Math.max(a, 0)) + 0.1, clmax * (1 - 1.6 * (lin / CLa - (clmax / CLa))));
  if (lin < -clmax) return -Math.max(0.5 * Math.sin(2 * Math.max(-a, 0)) + 0.1, clmax * 0.5);
  return lin;
}
export const airfoil = defineSim<T>({
  id: 'airfoil_lift_drag_stall', title: 'Airfoil Aerodynamics: NACA 4-digit Section, Lift, Induced Drag & Stall',
  ...meta('Engineering', 'Advanced', 'Aerospace', 'Aerodynamics', 'Thin-airfoil theory, lift curve slope, stall, induced drag, finite wing'),
  covers: ['Airfoil', 'NACA 4-digit', 'Lift coefficient', 'Thin airfoil theory', 'Stall', 'Induced drag', 'Aspect ratio', 'Lift curve slope', 'Camber'],
  tags: ['aerospace', 'aerodynamics', 'GATE AE', 'M.Tech', 'wing', 'lift', 'ISRO'],
  learningObjectives: ['Relate camber to the zero-lift angle and CL = 2π(α−α₀).', 'See lift collapse after stall and induced drag CL²/(πeAR) grow.'],
  assumptions: ['Thin-airfoil CL (2π slope, camber-shifted α₀ ≈ −2m) with an EMPIRICAL stall model; finite-wing drag CD = CD₀ + CL²/(π e AR); incompressible ISA sea-level air. Not a CFD result.'],
  blurb: 'Pick a NACA 4-digit shape (camber, thickness) and angle of attack. The sim shows the section, the lift vector, CL(α) with stall, and lift/drag for a finite wing.',
  hint: 'L=½ρV²S·CL. Thin airfoil: CL=2π(α−α₀); α₀≈−2×camber (rad). Stall reduces CL beyond ≈14-16°. Induced drag CDi=CL²/(πeAR).',
  params: [
    { kind: 'number', id: 'alpha', label: 'Angle of attack α (°)', min: -6, max: 24, step: 0.5, value: 6, digits: 1 },
    { kind: 'number', id: 'm', label: 'Max camber (% chord)', min: 0, max: 6, step: 0.5, value: 2, digits: 1 },
    { kind: 'number', id: 'tt', label: 'Thickness (% chord)', min: 6, max: 24, step: 1, value: 12, digits: 0 },
    { kind: 'number', id: 'V', label: 'Airspeed V (m/s)', min: 10, max: 120, step: 1, value: 50, digits: 0 },
    { kind: 'number', id: 'AR', label: 'Wing aspect ratio', min: 3, max: 20, step: 0.5, value: 8, digits: 1 },
  ],
  ...tick,
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const m = num(v, 'm') / 100, tt = num(v, 'tt') / 100, al = num(v, 'alpha'), af = naca4(m, 0.4, tt), cx = w * 0.04 + 10, cy = h * 0.4, sc = Math.min(w * 0.42, 330), a = (-al * Math.PI) / 180;
    const T = (p: [number, number]): [number, number] => { const x = p[0] - 0.25, y = p[1]; return [cx + sc * 0.25 + sc * (x * Math.cos(a) - y * Math.sin(a)), cy - sc * (x * Math.sin(a) + y * Math.cos(a))]; };
    for (let k = -3; k <= 3; k++) { c.strokeStyle = 'rgba(34,211,238,0.35)'; c.lineWidth = 1; c.beginPath(); for (let i = 0; i <= 40; i++) { const x = -0.2 + (1.5 * i) / 40, dy = k * 0.11 + (k === 0 ? 0 : 0), sh = Math.exp(-((x - 0.45) ** 2) / 0.12) * (0.07 + 0.2 * Math.max(0, al) / 15) * Math.sign(k + 0.1); const px = cx + sc * x - 0, py = cy - sc * (dy + sh); if (i === 0) c.moveTo(px, py); else c.lineTo(px, py); } c.stroke(); }
    c.fillStyle = 'rgba(245,158,11,0.9)'; c.beginPath(); [...af.up, ...af.lo.slice().reverse()].forEach((p, i) => { const [x, y] = T(p); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath(); c.fill();
    const CL = airfoilCL(al, m, 0.4), [lx, ly] = T([0.25, 0.0]); const Ls = clamp(CL, -1.5, 2.2) * 50; line(c, lx, ly, lx, ly - Ls, C.green, 3); text(c, `L  CL=${fmt(CL, 2)}`, lx + 6, ly - Ls, C.green, 11);
    const B = { x: w * 0.54, y: 8, w: w * 0.44, h: h * 0.5 }, mb = plot(c, B, [-6, 24], [-1, 2.2], { title: 'CL(α)', xlabel: 'α (°)', zeroAxis: true }); polyline(c, Array.from({ length: 121 }, (_, i) => { const x = -6 + (30 * i) / 120; return [mb.X(x), mb.Y(airfoilCL(x, m, 0.4))] as [number, number]; }), C.cyan, 2.5); circle(c, mb.X(al), mb.Y(CL), 5, C.red, C.white);
    const D = { x: B.x, y: B.y + B.h + 8, w: B.w, h: h - B.h - 24 }, md = plot(c, D, [0, 2], [0, 0.4], { title: 'drag polar CD(CL)', xlabel: 'CL' }); polyline(c, Array.from({ length: 41 }, (_, i) => { const q = (2 * i) / 40; return [md.X(q), md.Y(Math.min(0.4, 0.012 + (q * q) / (Math.PI * 0.85 * num(v, 'AR'))))] as [number, number]; }), C.amber, 2);
  },
  readouts(_s, v) { const CL = airfoilCL(num(v, 'alpha'), num(v, 'm') / 100, 0.4), AR = num(v, 'AR'), CD = 0.012 + (CL * CL) / (Math.PI * 0.85 * AR), q = 0.5 * 1.225 * num(v, 'V') ** 2; return [{ label: 'CL', value: fmt(CL, 3) }, { label: 'CD (wing)', value: fmt(CD, 4) }, { label: 'L/D', value: fmt(CL / CD, 1) }, { label: 'Lift per m² of wing', value: fmt(q * CL, 0) + ' N/m²' }, { label: 'State', value: num(v, 'alpha') > 14 + num(v, 'm') * 30 ? 'stalled' : 'attached flow' }]; },
  equations() { return ['C_L\\approx2\\pi(\\alpha-\\alpha_{L=0})', 'L=\\tfrac12\\rho V^2S\\,C_L', 'C_D=C_{D0}+\\dfrac{C_L^2}{\\pi e\\,AR}']; },
});

/* ================= Multi-stage rocket ================= */
function payload(dv: number, N: number, Isp: number, eps: number): number { const c2 = 9.80665 * Isp, lam = Math.exp(-(dv / N) / c2), per = (lam - eps) / (1 - eps); return per <= 0 ? 0 : Math.pow(per, N); }
export const rocketStaging = defineSim<T>({
  id: 'rocket_staging_payload', title: 'Rocket Staging: Tsiolkovsky Equation, Structural Fraction & Payload',
  ...meta('Engineering', 'Advanced', 'Aerospace', 'Rocket Propulsion', 'Rocket equation, staging, structural coefficient, payload fraction'),
  covers: ['Tsiolkovsky rocket equation', 'Multistage rocket', 'Structural coefficient', 'Payload fraction', 'Specific impulse', 'Delta-v', 'Staging', 'Mass ratio'],
  tags: ['aerospace', 'GATE AE', 'ISRO', 'M.Tech', 'propulsion', 'launch vehicle'],
  learningObjectives: ['See why one stage cannot reach orbit with realistic structure.', 'Optimise the number of stages for a payload requirement.'],
  assumptions: ['Equal Isp and structural fraction ε in every stage; Δv split equally; no gravity or drag losses (those add ≈1.5–2 km/s to the required Δv).'],
  blurb: 'Required Δv, specific impulse and structural fraction decide how much of the lift-off mass can be payload. Compare 1, 2, 3 and 4 stages.',
  hint: 'Per stage: m_f/m_0 = (λ−ε)/(1−ε)·, λ=e^{−Δv/(g₀Isp)}. Payload fraction = Π over stages. Too few stages: structure dominates; many stages: diminishing returns.',
  params: [{ kind: 'number', id: 'dv', label: 'Required Δv (km/s)', min: 2, max: 14, step: 0.1, value: 9.4, digits: 1 }, { kind: 'number', id: 'isp', label: 'Isp (s)', min: 200, max: 460, step: 5, value: 330, digits: 0 }, { kind: 'number', id: 'eps', label: 'Structural fraction ε', min: 0.04, max: 0.25, step: 0.005, value: 0.08, digits: 3 }, { kind: 'number', id: 'N', label: 'Number of stages', min: 1, max: 5, step: 1, value: 2, digits: 0 }],
  ...tick,
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const isp = num(v, 'isp'), eps = num(v, 'eps'), N = Math.round(num(v, 'N')), dv = num(v, 'dv') * 1000;
    const m = plot(c, { x: 8, y: 8, w: w * 0.62, h: h - 16 }, [2, 14], [0, 12], { title: 'payload fraction (%) vs required Δv (km/s)', xlabel: 'Δv (km/s)' }); const cols = [C.red, C.amber, C.green, C.cyan, '#a78bfa'];
    for (let n = 1; n <= 5; n++) polyline(c, Array.from({ length: 121 }, (_, i) => { const x = 2 + (12 * i) / 120; return [m.X(x), m.Y(Math.min(12, 100 * payload(x * 1000, n, isp, eps)))] as [number, number]; }), cols[n - 1], n === N ? 3.5 : 1.3);
    for (let n = 1; n <= 5; n++) text(c, `${n} stage${n > 1 ? 's' : ''}`, m.X(13.9), m.Y(Math.min(11.5, 100 * payload(13900, n, isp, eps))) - 6 - n * 11, cols[n - 1], 10, 'right'); line(c, m.X(dv / 1000), m.Y(0), m.X(dv / 1000), m.Y(12), C.white, 1, [4, 4]);
    const bx = w * 0.68, bh = h - 80, f = payload(dv, N, isp, eps), per = (Math.exp(-(dv / N) / (9.80665 * isp)) - eps) / (1 - eps);
    text(c, `${N}-stage vehicle, lift-off mass = 100 %`, bx, 22, C.text, 11, 'left', 'alphabetic', true); let y = 34, mass = 1; for (let k = 0; k < N; k++) { const mk = mass, st = mk * (1 - per) ; const hh = Math.max(4, bh * mk * 0.9 * (1 - per) * 1.0); c.fillStyle = cols[k]; c.fillRect(bx, y, 40, Math.max(3, hh * 0.9)); text(c, `stage ${k + 1}: ${fmt(st * 100, 1)} %`, bx + 48, y + 10, C.dim, 10); y += Math.max(3, hh * 0.9) + 3; mass *= per; } c.fillStyle = C.white; c.fillRect(bx, y, 40, Math.max(4, bh * f)); text(c, `payload ${fmt(f * 100, 2)} %`, bx + 48, y + 12, C.white, 11, 'left', 'alphabetic', true);
  },
  readouts(_s, v) { const f = payload(num(v, 'dv') * 1000, Math.round(num(v, 'N')), num(v, 'isp'), num(v, 'eps')), best = [1, 2, 3, 4, 5].reduce((b, n) => (payload(num(v, 'dv') * 1000, n, num(v, 'isp'), num(v, 'eps')) > payload(num(v, 'dv') * 1000, b, num(v, 'isp'), num(v, 'eps')) ? n : b), 1); return [{ label: 'Payload fraction', value: f > 0 ? fmt(f * 100, 2) + ' %' : 'infeasible (0 %)' }, { label: 'Exhaust velocity', value: fmt(9.80665 * num(v, 'isp'), 0) + ' m/s' }, { label: 'Best stage count here', value: best }, { label: 'Single-stage max Δv', value: fmt(-9.80665 * num(v, 'isp') * Math.log(num(v, 'eps')) / 1000, 2) + ' km/s' }]; },
  equations() { return ['\\Delta v=I_{sp}g_0\\ln\\dfrac{m_0}{m_f}', '\\dfrac{m_{payload}}{m_0}=\\prod_i\\dfrac{\\lambda_i-\\varepsilon}{1-\\varepsilon},\\ \\lambda_i=e^{-\\Delta v_i/(g_0I_{sp})}']; },
});

/* ================= Lorenz attractor ================= */
interface LzS { a: number[]; b: number[]; ta: [number, number][]; tb: [number, number][]; sep: number[]; t: number }
const lz = (p: number[], s: number, r: number, b: number) => [s * (p[1] - p[0]), p[0] * (r - p[2]) - p[1], p[0] * p[1] - b * p[2]];
function rk4Lz(p: number[], d: number, s: number, r: number, b: number) { const k1 = lz(p, s, r, b), k2 = lz(p.map((q, i) => q + 0.5 * d * k1[i]), s, r, b), k3 = lz(p.map((q, i) => q + 0.5 * d * k2[i]), s, r, b), k4 = lz(p.map((q, i) => q + d * k3[i]), s, r, b); return p.map((q, i) => q + (d / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])); }
export const lorenz = defineSim<LzS>({
  id: 'lorenz_chaos_sensitivity', title: 'Lorenz System: Strange Attractor & Sensitive Dependence on Initial Conditions',
  ...meta('Math', 'Advanced', 'Dynamical Systems', 'Chaos', 'Lorenz equations, attractor, Lyapunov divergence, bifurcation in ρ'),
  covers: ['Chaos', 'Lorenz system', 'Strange attractor', 'Sensitive dependence on initial conditions', 'Lyapunov exponent', 'Nonlinear dynamics', 'Bifurcation', 'Butterfly effect'],
  tags: ['M.Sc', 'nonlinear dynamics', 'differential equations', 'JAM', 'chaos theory', 'weather'],
  learningObjectives: ['See two almost identical starts diverge exponentially.', 'Change ρ to find the transition from fixed points to chaos (ρ≈24.74).'],
  assumptions: ['Classic Lorenz equations integrated with RK4 (step 0.005); separation measured in 3-D Euclidean distance.'],
  blurb: 'Two points start 10⁻⁶ apart on the Lorenz attractor. Watch the paths separate until they are unrelated; the log-separation plot has the slope of the largest Lyapunov exponent.',
  hint: 'ẋ=σ(y−x), ẏ=x(ρ−z)−y, ż=xy−βz. Classic σ=10, ρ=28, β=8/3 gives λ₁≈0.9. For ρ<1 origin stable; 1<ρ<24.74 two stable fixed points; above → chaos.',
  params: [{ kind: 'number', id: 'rho', label: 'ρ (Rayleigh number)', min: 0.5, max: 50, step: 0.5, value: 28, digits: 1, resetOnChange: true }, { kind: 'number', id: 'sigma', label: 'σ', min: 1, max: 20, step: 0.5, value: 10, digits: 1, resetOnChange: true }, { kind: 'number', id: 'beta', label: 'β', min: 0.5, max: 6, step: 0.1, value: 2.667, digits: 2, resetOnChange: true }, { kind: 'number', id: 'd0', label: 'Initial separation (log10)', min: -9, max: -2, step: 0.5, value: -6, digits: 1, resetOnChange: true }],
  dt: 1 / 30, previewSeconds: 10,
  init(v) { const d = Math.pow(10, num(v, 'd0')); return { a: [1, 1, 1], b: [1 + d, 1, 1], ta: [], tb: [], sep: [], t: 0 }; },
  step(s, v, dt) { const n = Math.ceil(dt / 0.005) * 2, h = dt / n; for (let i = 0; i < n; i++) { s.a = rk4Lz(s.a, h, num(v, 'sigma'), num(v, 'rho'), num(v, 'beta')); s.b = rk4Lz(s.b, h, num(v, 'sigma'), num(v, 'rho'), num(v, 'beta')); } s.t += dt; for (const [arr, p] of [[s.ta, s.a], [s.tb, s.b]] as [[number, number][], number[]][]) { arr.push([p[0], p[2]]); if (arr.length > 500) arr.shift(); } s.sep.push(Math.log10(Math.max(1e-12, Math.hypot(s.a[0] - s.b[0], s.a[1] - s.b[1], s.a[2] - s.b[2])))); if (s.sep.length > 900) s.sep.shift(); },
  draw(c, s, _v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const m = plot(c, { x: 8, y: 8, w: w * 0.55, h: h - 16 }, [-25, 25], [0, 50], { title: 'x–z projection: path A (cyan), path B (amber)', xlabel: 'x', ylabel: 'z' });
    polyline(c, s.ta.map(p => [m.X(p[0]), m.Y(p[1])] as [number, number]), C.cyan, 1.4); polyline(c, s.tb.map(p => [m.X(p[0]), m.Y(p[1])] as [number, number]), C.amber, 1.4); if (s.ta.length) { const p = s.ta[s.ta.length - 1], q = s.tb[s.tb.length - 1]; circle(c, m.X(p[0]), m.Y(p[1]), 4, C.cyan, C.white); circle(c, m.X(q[0]), m.Y(q[1]), 4, C.amber, C.white); }
    const B = { x: w * 0.55 + 16, y: 8, w: w * 0.45 - 24, h: h * 0.55 }, mb = plot(c, B, [0, 900], [-9, 2], { title: 'log₁₀ separation vs time', xlabel: 'time →' }); polyline(c, s.sep.map((q, i) => [mb.X(i), mb.Y(clamp(q, -9, 2))] as [number, number]), C.red, 2);
  },
  readouts(s) { const n = s.sep.length, sl = n > 100 ? (s.sep[Math.min(n - 1, 200)] - s.sep[0]) / (Math.min(n - 1, 200) / 30) * Math.LN10 : 0; return [{ label: 'Separation', value: (s.sep.length ? Math.pow(10, s.sep[s.sep.length - 1]) : 0).toExponential(2) }, { label: 'Time', value: fmt(s.t, 1) }, { label: 'Early growth rate (≈ λ₁)', value: fmt(sl, 2) + ' /time' }]; },
  equations() { return ['\\dot x=\\sigma(y-x),\\ \\dot y=x(\\rho-z)-y,\\ \\dot z=xy-\\beta z', '\\delta(t)\\approx\\delta_0e^{\\lambda_1t}']; },
});

/* ================= Mandelbrot / Julia ================= */
let fracKey = '', fracImg: Uint16Array | null = null;
const FW = 140, FH = 100;
export const fractal = defineSim<T>({
  id: 'mandelbrot_julia_explorer', title: 'Complex Dynamics: Mandelbrot Set & Julia Sets (z → z² + c)',
  ...meta('Math', 'Advanced', 'Complex Analysis', 'Complex Dynamics', 'Escape-time iteration, Mandelbrot set, Julia sets, connectedness'),
  covers: ['Mandelbrot set', 'Julia set', 'Complex iteration', 'Escape time', 'Fractal', 'Complex dynamics', 'Connectedness locus', 'Iteration of quadratic maps'],
  tags: ['M.Sc', 'complex analysis', 'fractals', 'JAM', 'dynamical systems', 'chaos'],
  learningObjectives: ['Relate points c in the Mandelbrot set to connected Julia sets.', 'See how iteration count controls boundary detail.'],
  assumptions: ['Escape radius 2; colouring by smoothed-free integer escape count; 140×100 raster for speed.'],
  blurb: 'Colour each point by how fast z→z²+c escapes. Switch between the Mandelbrot set (vary c) and Julia sets (fixed c), and zoom in.',
  hint: 'c ∈ M ⟺ the orbit of 0 stays bounded ⟺ J_c is connected. Escape radius 2: if |z|>2 the orbit diverges.',
  params: [{ kind: 'select', id: 'mode', label: 'Set', value: 'mandel', options: [{ value: 'mandel', label: 'Mandelbrot' }, { value: 'julia', label: 'Julia' }] }, { kind: 'number', id: 'cr', label: 'Julia c (real)', min: -1.5, max: 1.5, step: 0.01, value: -0.8, digits: 2 }, { kind: 'number', id: 'ci', label: 'Julia c (imag)', min: -1.5, max: 1.5, step: 0.01, value: 0.156, digits: 2 }, { kind: 'number', id: 'zoom', label: 'Zoom', min: 1, max: 40, step: 0.5, value: 1, digits: 1 }, { kind: 'number', id: 'it', label: 'Max iterations', min: 20, max: 300, step: 10, value: 80, digits: 0 }, { kind: 'number', id: 'cx', label: 'Centre x', min: -2, max: 1, step: 0.01, value: -0.5, digits: 2 }],
  ...tick,
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const key = ['mode', 'cr', 'ci', 'zoom', 'it', 'cx'].map(k => v[k]).join('|'), mode = str(v, 'mode');
    if (key !== fracKey || !fracImg) { fracKey = key; fracImg = new Uint16Array(FW * FH); const z0 = num(v, 'zoom'), maxIt = Math.round(num(v, 'it')), cx0 = mode === 'mandel' ? num(v, 'cx') : 0, sc = 3 / z0; for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) { const x0 = cx0 + ((i / FW) - 0.5) * sc * (FW / FH), y0 = ((j / FH) - 0.5) * sc; let zr = mode === 'mandel' ? 0 : x0, zi = mode === 'mandel' ? 0 : y0; const cr = mode === 'mandel' ? x0 : num(v, 'cr'), ci = mode === 'mandel' ? y0 : num(v, 'ci'); let k = 0; for (; k < maxIt && zr * zr + zi * zi <= 4; k++) { const t = zr * zr - zi * zi + cr; zi = 2 * zr * zi + ci; zr = t; } fracImg[j * FW + i] = k; } }
    const cw = Math.min((w - 16) / FW, (h - 16) / FH), ox = 8, oy = 8, maxIt = Math.round(num(v, 'it'));
    for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) { const k = fracImg[j * FW + i]; c.fillStyle = k >= maxIt ? '#020617' : `hsl(${(210 + 6 * k) % 360},85%,${25 + (55 * k) / maxIt}%)`; c.fillRect(ox + i * cw, oy + j * cw, cw + 0.5, cw + 0.5); }
    text(c, mode === 'mandel' ? 'Mandelbrot set (black = bounded)' : `Julia set, c = ${fmt(num(v, 'cr'), 2)} + ${fmt(num(v, 'ci'), 2)}i`, ox + 6, oy + 16, C.white, 12, 'left', 'alphabetic', true);
  },
  readouts(_s, v) { const n = fracImg ? [...fracImg].filter(k => k >= Math.round(num(v, 'it'))).length : 0; return [{ label: 'Points bounded (in set)', value: fmt((100 * n) / (FW * FH), 1) + ' %' }, { label: 'Mode', value: str(v, 'mode') }, { label: 'Zoom', value: fmt(num(v, 'zoom'), 1) + '×' }]; },
  equations() { return ['z_{n+1}=z_n^2+c', 'M=\\{c:\\ |z_n(c)|\\not\\to\\infty,\\ z_0=0\\}', '|z_n|>2\\Rightarrow\\text{escapes}']; },
});

/* ================= Multi-slit diffraction ================= */
export const slitDiffraction = defineSim<T>({
  id: 'fraunhofer_multislit', title: 'Fraunhofer Diffraction: Single, Double and N-slit Patterns',
  ...meta('Physics', 'Intermediate', 'Optics', 'Wave Optics', 'Fraunhofer diffraction, single-slit envelope, interference fringes, diffraction grating'),
  covers: ['Fraunhofer diffraction', 'Single slit diffraction', 'Double slit interference', 'Diffraction grating', 'Missing orders', 'Resolving power', 'Intensity pattern', 'Wave optics'],
  tags: ['optics', 'B.Sc', 'JAM', 'CSIR NET', 'physics', 'grating', 'Young'],
  learningObjectives: ['Combine single-slit envelope with N-slit interference.', 'Find the missing orders when d/a is an integer and the grating’s narrowing peaks with N.'],
  assumptions: ['Far-field scalar wave optics; ideal thin slits; small angles for the screen mapping.'],
  blurb: 'Light of chosen wavelength passes through N slits of width a and spacing d. The pattern is the interference term multiplied by the single-slit envelope.',
  hint: 'I=I₀ sinc²β·[sin(Nγ)/(N sinγ)]², β=πa sinθ/λ, γ=πd sinθ/λ. Missing order m when d/a=m/k. More slits → sharper principal maxima.',
  params: [{ kind: 'number', id: 'lam', label: 'Wavelength (nm)', min: 380, max: 750, step: 5, value: 550, digits: 0 }, { kind: 'number', id: 'a', label: 'Slit width a (µm)', min: 1, max: 30, step: 0.5, value: 5, digits: 1 }, { kind: 'number', id: 'd', label: 'Slit spacing d (µm)', min: 5, max: 100, step: 0.5, value: 20, digits: 1 }, { kind: 'number', id: 'N', label: 'Number of slits', min: 1, max: 12, step: 1, value: 2, digits: 0 }],
  ...tick,
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const lam = num(v, 'lam') * 1e-9, a = num(v, 'a') * 1e-6, d = Math.max(num(v, 'd'), num(v, 'a')) * 1e-6, N = Math.round(num(v, 'N')), TH = 0.12;
    const I = (th: number) => { const s = Math.sin(th), be = (Math.PI * a * s) / lam, ga = (Math.PI * d * s) / lam, env = Math.abs(be) < 1e-9 ? 1 : (Math.sin(be) / be) ** 2, den = Math.sin(ga), arr = Math.abs(den) < 1e-9 ? 1 : (Math.sin(N * ga) / (N * den)) ** 2; return env * arr; };
    const m = plot(c, { x: 8, y: 8, w: w - 16, h: h * 0.62 }, [-TH * 1000, TH * 1000], [0, 1.05], { title: 'I(θ)/I₀  (dashed = single-slit envelope)', xlabel: 'θ (mrad)' });
    polyline(c, Array.from({ length: 601 }, (_, i) => { const th = -TH + (2 * TH * i) / 600; return [m.X(th * 1000), m.Y(I(th))] as [number, number]; }), C.amber, 2); polyline(c, Array.from({ length: 301 }, (_, i) => { const th = -TH + (2 * TH * i) / 300, be = (Math.PI * a * Math.sin(th)) / lam; return [m.X(th * 1000), m.Y(Math.abs(be) < 1e-9 ? 1 : (Math.sin(be) / be) ** 2)] as [number, number]; }), C.dim, 1, [4, 3]);
    const y0 = h * 0.62 + 24, hh = h - y0 - 10, rgb = wl(num(v, 'lam')); for (let i = 0; i < w - 16; i++) { const th = -TH + (2 * TH * i) / (w - 17), k = Math.pow(I(th), 0.6); c.fillStyle = `rgb(${Math.round(rgb[0] * k)},${Math.round(rgb[1] * k)},${Math.round(rgb[2] * k)})`; c.fillRect(8 + i, y0, 1.5, hh); }
  },
  readouts(_s, v) { const a = num(v, 'a'), d = Math.max(num(v, 'd'), a), lam = num(v, 'lam') / 1000, ratio = d / a, th1 = Math.asin(clamp(lam / d, -1, 1)); return [{ label: 'First maximum angle (m=1)', value: fmt((th1 * 180) / Math.PI, 2) + '°' }, { label: 'First single-slit zero', value: lam / a <= 1 ? fmt((Math.asin(lam / a) * 180) / Math.PI, 2) + '°' : 'none (a < λ)' }, { label: 'd / a', value: fmt(ratio, 2) + (Math.abs(ratio - Math.round(ratio)) < 1e-6 && ratio > 1 ? ' → missing orders ×' + Math.round(ratio) : '') }, { label: 'Orders visible', value: Math.floor(d / lam) * 2 + 1 }]; },
  equations() { return ['I(\\theta)=I_0\\left(\\dfrac{\\sin\\beta}{\\beta}\\right)^2\\left(\\dfrac{\\sin N\\gamma}{N\\sin\\gamma}\\right)^2', '\\beta=\\dfrac{\\pi a\\sin\\theta}{\\lambda},\\ \\gamma=\\dfrac{\\pi d\\sin\\theta}{\\lambda}', 'd\\sin\\theta=m\\lambda']; },
});
function wl(nm: number): [number, number, number] { const t = (a: number, b: number) => clamp((nm - a) / (b - a), 0, 1); const r = nm < 440 ? 1 - t(380, 440) : nm < 510 ? 0 : nm < 580 ? t(510, 580) : 1, g = nm < 440 ? 0 : nm < 490 ? t(440, 490) : nm < 580 ? 1 : nm < 645 ? 1 - t(580, 645) : 0, b = nm < 490 ? 1 : nm < 510 ? 1 - t(490, 510) : 0; return [255 * r, 255 * g, 255 * b]; }

/* ================= Explicit heat-equation stability ================= */
interface FdS { u: number[]; t: number; n: number; diverged: boolean; steps: number; r: number }
export const fdmStability = defineSim<FdS>({
  id: 'ftcs_heat_stability', title: 'Numerical PDEs: Explicit (FTCS) Heat Equation & the r ≤ ½ Stability Limit',
  ...meta('Math', 'Advanced', 'Numerical Analysis', 'Finite Differences', 'FTCS scheme, stability, von Neumann analysis, truncation error', [...PG_ALL, ...UG_ENG, 'B.Sc']),
  covers: ['Finite difference method', 'FTCS scheme', 'Numerical stability', 'Von Neumann stability analysis', 'Heat equation', 'CFL condition', 'Truncation error', 'Diffusion number'],
  tags: ['numerical methods', 'PDE', 'M.Sc', 'M.Tech', 'GATE', 'computational physics', 'stability'],
  learningObjectives: ['See the explicit scheme blow up when r=αΔt/Δx² > ½.', 'Compare the numerical solution with the exact decaying sine.'],
  assumptions: ['u_t = α u_xx on [0,1], u(0)=u(1)=0, initial u=sin(πx); dimensionless α=1; exact solution e^{−π²t}sin(πx).'],
  blurb: 'Step the 1-D heat equation forward with the explicit scheme. Choose the diffusion number r: below ½ the profile decays like the exact solution, above ½ rounding errors grow into a sawtooth.',
  hint: 'u_i^{n+1}=u_i^n+r(u_{i+1}−2u_i+u_{i−1}). Von Neumann: amplification G=1−4r sin²(kΔx/2); |G|≤1 for all k iff r≤½.',
  params: [{ kind: 'number', id: 'r', label: 'Diffusion number r = αΔt/Δx²', min: 0.05, max: 0.7, step: 0.01, value: 0.45, digits: 2, resetOnChange: true }, { kind: 'number', id: 'n', label: 'Grid points', min: 10, max: 60, step: 1, value: 30, digits: 0, resetOnChange: true }, { kind: 'number', id: 'spd', label: 'Time steps per frame', min: 1, max: 20, step: 1, value: 2, digits: 0 }],
  actions: [{ id: 'reset', label: 'Restart' }],
  dt: 1 / 30, previewSeconds: 3,
  init(v) { const n = Math.round(num(v, 'n')); return { u: Array.from({ length: n + 1 }, (_, i) => Math.sin((Math.PI * i) / n) + 0.001 * Math.sin(37.1 * i)), t: 0, n, diverged: false, steps: 0, r: num(v, 'r') }; },
  action(s, v) { Object.assign(s, { u: Array.from({ length: s.n + 1 }, (_, i) => Math.sin((Math.PI * i) / s.n) + 0.001 * Math.sin(37.1 * i)), t: 0, diverged: false, steps: 0, r: num(v, 'r') }); },
  step(s, v) { if (s.diverged) return; const r = num(v, 'r'), n = s.n; for (let k = 0; k < num(v, 'spd'); k++) { const nu = s.u.slice(); for (let i = 1; i < n; i++) nu[i] = s.u[i] + r * (s.u[i + 1] - 2 * s.u[i] + s.u[i - 1]); nu[0] = nu[n] = 0; s.u = nu; s.steps++; s.t += (r / (n * n)) * 1; if (s.u.some(q => !Number.isFinite(q) || Math.abs(q) > 1e3)) { s.diverged = true; break; } } },
  draw(c, s, _v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const lim = s.diverged ? 1e3 : Math.max(1.2, ...s.u.map(Math.abs)) * 1.1, m = plot(c, { x: 8, y: 8, w: w - 16, h: h - 16 }, [0, 1], [-lim, lim], { title: `u(x,t): numerical (amber) vs exact (green), step ${s.steps}`, xlabel: 'x', zeroAxis: true });
    polyline(c, Array.from({ length: 101 }, (_, i) => [m.X(i / 100), m.Y(Math.exp(-(Math.PI ** 2) * s.t) * Math.sin(Math.PI * (i / 100)))] as [number, number]), C.green, 2, [5, 4]); polyline(c, s.u.map((q, i) => [m.X(i / s.n), m.Y(clamp(q, -lim, lim))] as [number, number]), C.amber, 2.5); s.u.forEach((q, i) => circle(c, m.X(i / s.n), m.Y(clamp(q, -lim, lim)), 2.2, C.amber));
    if (s.diverged) text(c, 'DIVERGED — scheme unstable (r > ½)', w / 2, 40, C.red, 14, 'center', 'alphabetic', true);
  },
  readouts(s) { const mid = s.u[Math.round(s.n / 2)], ex = Math.exp(-(Math.PI ** 2) * s.t); return [{ label: 'Stability (r ≤ ½)', value: s.r <= 0.5 ? 'stable' : 'UNSTABLE' }, { label: 'Status', value: s.diverged ? 'diverged' : 'running' }, { label: 'Midpoint numerical', value: s.diverged ? '∞' : fmt(mid, 4) }, { label: 'Midpoint exact', value: fmt(ex, 4) }]; },
  equations() { return ['u_i^{n+1}=u_i^n+r\\,(u_{i+1}^n-2u_i^n+u_{i-1}^n)', 'G(k)=1-4r\\sin^2\\!\\tfrac{k\\Delta x}{2},\\quad |G|\\le1\\iff r\\le\\tfrac12']; },
});

/* ================= ODE solvers: Euler vs Heun vs RK4 ================= */
export const odeSolvers = defineSim<T>({
  id: 'ode_solvers_euler_rk4', title: 'Numerical ODE Solvers: Euler, Heun & RK4 on the Harmonic Oscillator',
  ...meta('Math', 'Intermediate', 'Numerical Analysis', 'ODE Integration', 'Order of accuracy, energy drift, step-size dependence', [...PG_ALL, ...UG_ENG, 'B.Sc', 'BCA']),
  covers: ['Euler method', 'Runge-Kutta method', 'Heun method', 'Order of accuracy', 'Global truncation error', 'Energy drift', 'Step size', 'Numerical integration of ODEs'],
  tags: ['numerical methods', 'GATE', 'M.Sc', 'differential equations', 'simulation', 'B.Tech'],
  learningObjectives: ['See that Euler spirals outward (energy grows), Heun less so, RK4 hardly at all.', 'Check the error scaling h, h², h⁴ with the step size.'],
  assumptions: ['x″=−x, x(0)=1, v(0)=0, exact x=cos t; fixed step h; no adaptive step control.'],
  blurb: 'Integrate the same oscillator with three methods using the same step h. Compare each trajectory with cos t, and watch the energy error and the order of accuracy.',
  hint: 'Euler is O(h) (global error ∝ h), Heun O(h²), RK4 O(h⁴). For oscillations, explicit Euler adds energy each step by (1+h²).',
  params: [{ kind: 'number', id: 'h', label: 'Step size h', min: 0.01, max: 0.8, step: 0.01, value: 0.2, digits: 2 }, { kind: 'number', id: 'T', label: 'End time', min: 2, max: 60, step: 1, value: 20, digits: 0 }],
  ...tick,
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const T = num(v, 'T'), sol = odeRun(num(v, 'h'), T), m = plot(c, { x: 8, y: 8, w: w * 0.62, h: h - 16 }, [0, T], [-2, 2], { title: 'x(t): exact (white), Euler (red), Heun (amber), RK4 (cyan)', xlabel: 't', zeroAxis: true });
    polyline(c, Array.from({ length: 400 }, (_, i) => [m.X((T * i) / 399), m.Y(Math.cos((T * i) / 399))] as [number, number]), C.white, 1.5, [4, 3]); for (const [k, col] of [['eu', C.red], ['he', C.amber], ['rk', C.cyan]] as const) polyline(c, sol[k].map(([t, x]) => [m.X(t), m.Y(clamp(x, -2, 2))] as [number, number]), col, 2);
    const e = ['eu', 'he', 'rk'].map(k => sol[k as 'eu'].map(([, , E]) => E)), B = { x: w * 0.62 + 16, y: 8, w: w * 0.38 - 24, h: h - 16 }, mb = plot(c, B, [0, T], [0.5, 2], { title: 'energy E/E₀ (should be 1)', xlabel: 't' }); [C.red, C.amber, C.cyan].forEach((col, i) => polyline(c, sol[(['eu', 'he', 'rk'] as const)[i]].map(([t], j) => [mb.X(t), mb.Y(clamp(e[i][j], 0.5, 2))] as [number, number]), col, 2));
  },
  readouts(_s, v) { const T = num(v, 'T'), sol = odeRun(num(v, 'h'), T), err = (k: 'eu') => { const p = sol[k][sol[k].length - 1]; return Math.abs(p[1] - Math.cos(p[0])); }; return [{ label: 'Euler end error', value: err('eu').toExponential(2) }, { label: 'Heun end error', value: err('he' as 'eu').toExponential(2) }, { label: 'RK4 end error', value: err('rk' as 'eu').toExponential(2) }, { label: 'Steps', value: Math.round(T / num(v, 'h')) }]; },
  equations() { return ['\\text{Euler: }y_{n+1}=y_n+hf(t_n,y_n)', '\\text{RK4: }y_{n+1}=y_n+\\tfrac h6(k_1+2k_2+2k_3+k_4)', '\\text{global error}\\sim O(h),\\,O(h^2),\\,O(h^4)']; },
});
function odeRun(h: number, T: number) {
  const N = Math.max(1, Math.round(T / h)), f = (y: number[]) => [y[1], -y[0]], E = (y: number[]) => (y[0] * y[0] + y[1] * y[1]) / 1, out = { eu: [] as [number, number, number][], he: [] as [number, number, number][], rk: [] as [number, number, number][] };
  let a = [1, 0], b = [1, 0], c2 = [1, 0]; for (const k of ['eu', 'he', 'rk'] as const) out[k].push([0, 1, 1]);
  for (let n = 1; n <= N; n++) { const t = n * h; const ka = f(a); a = [a[0] + h * ka[0], a[1] + h * ka[1]]; const k1 = f(b), p = [b[0] + h * k1[0], b[1] + h * k1[1]], k2 = f(p); b = [b[0] + (h / 2) * (k1[0] + k2[0]), b[1] + (h / 2) * (k1[1] + k2[1])]; const r1 = f(c2), r2 = f([c2[0] + (h / 2) * r1[0], c2[1] + (h / 2) * r1[1]]), r3 = f([c2[0] + (h / 2) * r2[0], c2[1] + (h / 2) * r2[1]]), r4 = f([c2[0] + h * r3[0], c2[1] + h * r3[1]]); c2 = [c2[0] + (h / 6) * (r1[0] + 2 * r2[0] + 2 * r3[0] + r4[0]), c2[1] + (h / 6) * (r1[1] + 2 * r2[1] + 2 * r3[1] + r4[1])]; out.eu.push([t, a[0], E(a)]); out.he.push([t, b[0], E(b)]); out.rk.push([t, c2[0], E(c2)]); }
  return out;
}

/* ================= Coupled oscillators ================= */
export const coupledOsc = defineSim<T>({
  id: 'coupled_oscillators_modes', title: 'Coupled Oscillators: Normal Modes, Beats & Energy Exchange',
  ...meta('Physics', 'Intermediate', 'Classical Mechanics', 'Oscillations', 'Two coupled masses, normal modes, beat frequency, energy transfer'),
  covers: ['Coupled oscillators', 'Normal modes', 'Beats', 'Energy transfer', 'Normal coordinates', 'Eigenfrequencies', 'Weak coupling', 'Small oscillations'],
  tags: ['classical mechanics', 'B.Sc', 'M.Sc', 'JAM', 'CSIR NET', 'oscillations', 'eigenvalue'],
  learningObjectives: ['Find ω₁=√(k/m) (in phase) and ω₂=√((k+2κ)/m) (antiphase).', 'See beats at ω₂−ω₁ when only one mass is displaced.'],
  assumptions: ['Two equal masses and three springs (outer k, coupling κ), undamped, small oscillations, exact analytic solution.'],
  blurb: 'Two masses joined by a coupling spring. Excite a normal mode and each mass oscillates at one frequency; displace only one and the energy sloshes between them in beats.',
  hint: 'Normal coordinates q₁=(x₁+x₂)/√2 (in phase, ω₁²=k/m), q₂=(x₁−x₂)/√2 (antiphase, ω₂²=(k+2κ)/m). Beat period 2π/(ω₂−ω₁).',
  params: [{ kind: 'select', id: 'mode', label: 'Initial condition', value: 'beat', options: [{ value: 'm1', label: 'Mode 1 (in phase)' }, { value: 'm2', label: 'Mode 2 (anti-phase)' }, { value: 'beat', label: 'Only mass 1 displaced (beats)' }] }, { kind: 'number', id: 'k', label: 'Outer spring k (N/m)', min: 1, max: 40, step: 1, value: 10, digits: 0 }, { kind: 'number', id: 'kc', label: 'Coupling spring κ (N/m)', min: 0.2, max: 20, step: 0.2, value: 1.5, digits: 1 }, { kind: 'number', id: 'm', label: 'Mass m (kg)', min: 0.2, max: 5, step: 0.1, value: 1, digits: 1 }],
  ...tick, dt: 1 / 60,
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const k = num(v, 'k'), kc = num(v, 'kc'), mm = num(v, 'm'), w1 = Math.sqrt(k / mm), w2 = Math.sqrt((k + 2 * kc) / mm), md = str(v, 'mode'), xs = (t: number): [number, number] => md === 'm1' ? [Math.cos(w1 * t), Math.cos(w1 * t)] : md === 'm2' ? [Math.cos(w2 * t), -Math.cos(w2 * t)] : [0.5 * (Math.cos(w1 * t) + Math.cos(w2 * t)), 0.5 * (Math.cos(w1 * t) - Math.cos(w2 * t))];
    const [x1, x2] = xs(s.t), y0 = h * 0.22, L = w - 40, px = (x: number, i: number) => 20 + (L * (i + 1)) / 3 + x * L * 0.08;
    line(c, 20, y0, 20, y0 + 30, C.dim, 3); line(c, w - 20, y0, w - 20, y0 + 30, C.dim, 3); const sp = (a: number, b: number, col: string) => { c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(a, y0 + 15); for (let i = 1; i < 12; i++) c.lineTo(a + ((b - a) * i) / 12, y0 + 15 + (i % 2 ? -9 : 9)); c.lineTo(b, y0 + 15); c.stroke(); };
    sp(20, px(x1, 0) - 14, C.dim); sp(px(x1, 0) + 14, px(x2, 1) - 14, C.amber); sp(px(x2, 1) + 14, w - 20, C.dim); c.fillStyle = C.cyan; c.fillRect(px(x1, 0) - 14, y0 + 1, 28, 28); c.fillStyle = C.green; c.fillRect(px(x2, 1) - 14, y0 + 1, 28, 28);
    const T = 4 * Math.PI / Math.min(w2 - w1 + 0.01, w1) * 1; const m = plot(c, { x: 8, y: h * 0.38, w: w - 16, h: h * 0.58 }, [Math.max(0, s.t - 8), Math.max(8, s.t)], [-1.1, 1.1], { title: 'x₁ (cyan) and x₂ (green) vs t', xlabel: 't (s)', zeroAxis: true }); void T;
    for (const [idx, col] of [[0, C.cyan], [1, C.green]] as const) polyline(c, Array.from({ length: 200 }, (_, i) => { const t = Math.max(0, s.t - 8) + (8 * i) / 199; return [m.X(t), m.Y(xs(t)[idx])] as [number, number]; }), col, 2);
  },
  readouts(_s, v) { const k = num(v, 'k'), kc = num(v, 'kc'), mm = num(v, 'm'), w1 = Math.sqrt(k / mm), w2 = Math.sqrt((k + 2 * kc) / mm); return [{ label: 'ω₁ (in phase)', value: fmt(w1, 3) + ' rad/s' }, { label: 'ω₂ (anti-phase)', value: fmt(w2, 3) + ' rad/s' }, { label: 'Beat period', value: fmt((2 * Math.PI) / (w2 - w1), 2) + ' s' }, { label: 'Coupling strength', value: fmt(kc / (k + kc), 2) }]; },
  equations() { return ['\\omega_1=\\sqrt{k/m},\\quad\\omega_2=\\sqrt{(k+2\\kappa)/m}', 'x_{1,2}=\\tfrac12[\\cos\\omega_1t\\pm\\cos\\omega_2t]', 'T_{beat}=\\dfrac{2\\pi}{\\omega_2-\\omega_1}']; },
});

/* ================= Monte Carlo integration ================= */
interface McS { n: number; inside: number; est: number[]; pts: [number, number, boolean][]; sum: number; sum2: number }
export const monteCarlo = defineSim<McS>({
  id: 'monte_carlo_integration', title: 'Monte Carlo Integration: Estimating π and the 1/√N Error Law',
  ...meta('Math', 'Intermediate', 'Numerical Analysis', 'Monte Carlo Methods', 'Random sampling, convergence rate, standard error', [...PG_ALL, ...UG_ENG, 'B.Sc', 'BCA']),
  covers: ['Monte Carlo method', 'Numerical integration', 'Law of large numbers', 'Standard error', 'Convergence rate', 'Random sampling', 'Variance', 'Estimating pi'],
  tags: ['numerical methods', 'statistics', 'M.Sc', 'simulation', 'probability', 'BCA', 'data science'],
  learningObjectives: ['See the estimate converge like 1/√N, not 1/N.', 'Relate the spread to the standard error σ/√N.'],
  assumptions: ['Uniform samples in the unit square; π = 4·(fraction inside the quarter circle); pseudo-random numbers from Math.random.'],
  blurb: 'Throw random darts at a square with a quarter circle. The fraction landing inside estimates π/4. The error shrinks only as 1/√N — 100× more points for 10× more accuracy.',
  hint: 'p̂ = k/N, Var = p(1−p)/N, so the standard error of π̂ = 4√(p(1−p)/N) ≈ 1.64/√N.',
  params: [{ kind: 'number', id: 'rate', label: 'Points per frame', min: 1, max: 2000, step: 1, value: 40, digits: 0 }],
  actions: [{ id: 'reset', label: 'Restart' }],
  dt: 1 / 30, previewSeconds: 4, init() { return { n: 0, inside: 0, est: [], pts: [], sum: 0, sum2: 0 }; }, action(s) { Object.assign(s, { n: 0, inside: 0, est: [], pts: [], sum: 0, sum2: 0 }); },
  step(s, v) { for (let i = 0; i < num(v, 'rate'); i++) { const x = Math.random(), y = Math.random(), ins = x * x + y * y <= 1; s.n++; if (ins) s.inside++; if (s.pts.length < 1500 && i < 60) s.pts.push([x, y, ins]); } s.est.push((4 * s.inside) / Math.max(1, s.n)); if (s.est.length > 400) s.est.shift(); },
  draw(c, s, _v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const sz = Math.min(h - 16, w * 0.4); c.strokeStyle = C.axis; c.strokeRect(8, 8, sz, sz); c.beginPath(); c.arc(8, 8 + sz, sz, -Math.PI / 2, 0); c.stroke(); for (const [x, y, ins] of s.pts) circle(c, 8 + x * sz, 8 + sz - y * sz, 1.6, ins ? C.cyan : C.red);
    const m = plot(c, { x: sz + 20, y: 8, w: w - sz - 28, h: h - 16 }, [0, Math.max(10, s.est.length)], [2.8, 3.5], { title: 'π̂ estimate (green = true π, band = ±2 s.e.)', xlabel: 'frame' }); line(c, m.X(0), m.Y(Math.PI), m.X(Math.max(10, s.est.length)), m.Y(Math.PI), C.green, 1.5, [4, 3]); polyline(c, s.est.map((e, i) => [m.X(i), m.Y(clamp(e, 2.8, 3.5))] as [number, number]), C.amber, 2);
  },
  readouts(s) { const p = s.inside / Math.max(1, s.n), est = 4 * p, se = 4 * Math.sqrt((p * (1 - p)) / Math.max(1, s.n)); return [{ label: 'Points N', value: s.n }, { label: 'π̂', value: fmt(est, 5) }, { label: 'Actual error', value: s.n ? fmt(Math.abs(est - Math.PI), 5) : '—' }, { label: 'Standard error', value: s.n ? fmt(se, 5) : '—' }]; },
  equations() { return ['\\hat\\pi=\\dfrac{4k}{N}', '\\mathrm{SE}(\\hat\\pi)=4\\sqrt{\\dfrac{p(1-p)}{N}}\\approx\\dfrac{1.64}{\\sqrt N}']; },
});
void bool; void TAU;
