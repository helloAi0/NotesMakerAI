import { defineSim, num, str, bool } from './types';
import { C, TAU, clamp, fmt, line, plot, polyline, text, circle, arrow, gauss } from './draw';
import { meta, mulberry, ticks } from './univ_util';

/* ============================ Black–Scholes with Greeks ============================ */
const phi = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(TAU);
function Ncdf(x: number) { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989422804014327 * Math.exp(-x * x / 2), p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); return x >= 0 ? 1 - p : p; }
export function blackScholes(S: number, K: number, T: number, r: number, sig: number, call: boolean) {
  T = Math.max(T, 1e-4); sig = Math.max(sig, 1e-4); const sq = sig * Math.sqrt(T), d1 = (Math.log(S / K) + (r + sig * sig / 2) * T) / sq, d2 = d1 - sq, e = Math.exp(-r * T);
  const price = call ? S * Ncdf(d1) - K * e * Ncdf(d2) : K * e * Ncdf(-d2) - S * Ncdf(-d1);
  const delta = call ? Ncdf(d1) : Ncdf(d1) - 1, gamma = phi(d1) / (S * sq), vega = S * phi(d1) * Math.sqrt(T), thetaYr = -S * phi(d1) * sig / (2 * Math.sqrt(T)) + (call ? -r * K * e * Ncdf(d2) : r * K * e * Ncdf(-d2)), rho = (call ? 1 : -1) * K * T * e * Ncdf(call ? d2 : -d2);
  return { price, delta, gamma, vega, theta: thetaYr / 365, rho, d1, d2 };
}
const bsArgs = (v: Record<string, number | string | boolean>) => [num(v, 'S'), num(v, 'K'), num(v, 'T'), num(v, 'r') / 100, num(v, 'sig') / 100, str(v, 'type') === 'call'] as const;
export const blackScholesSim = defineSim<{ t: number }>({
  id: 'black_scholes_greeks', title: 'Black–Scholes Option Pricing with Live Greeks',
  ...meta('Math', 'Intermediate', 'Quantitative Finance', 'Option Pricing', 'Black–Scholes formula, put–call parity, delta, gamma, theta, vega, rho'),
  covers: ['Black–Scholes', 'Option pricing', 'Greeks', 'Delta', 'Gamma', 'Theta', 'Vega', 'Put–call parity', 'Volatility', 'Quantitative finance'],
  tags: ['finance', 'derivatives', 'options', 'BBA', 'MBA finance', 'quant', 'CFA', 'stochastic calculus'],
  learningObjectives: ['Price European calls and puts and see value vs. the intrinsic payoff.', 'Read delta, gamma, theta, vega and rho and how they change with spot, volatility and time.', 'Verify put–call parity C − P = S − K·e^{−rT}.'],
  assumptions: ['European options on a non-dividend-paying asset; constant volatility and risk-free rate; log-normal prices; no transaction costs. Theta is per calendar day, vega per 1 % volatility, rho per 1 % rate.'],
  blurb: 'Change spot, strike, expiry, rate and volatility and watch the Black–Scholes price and all five Greeks respond; pick which Greek to plot against the spot price.',
  hint: 'C = S·N(d₁) − K e^{−rT} N(d₂), d₁ = [ln(S/K) + (r + σ²/2)T]/(σ√T), d₂ = d₁ − σ√T. Delta = N(d₁) for calls; gamma and vega are largest at-the-money; theta (time decay) accelerates near expiry.',
  params: [
    { kind: 'select', id: 'type', label: 'Option type', value: 'call', options: [{ value: 'call', label: 'Call' }, { value: 'put', label: 'Put' }] },
    { kind: 'number', id: 'S', label: 'Spot price S', min: 20, max: 200, step: 0.5, value: 100, digits: 1 },
    { kind: 'number', id: 'K', label: 'Strike K', min: 20, max: 200, step: 0.5, value: 100, digits: 1 },
    { kind: 'number', id: 'T', label: 'Time to expiry T (years)', min: 0.02, max: 3, step: 0.01, value: 0.5, digits: 2 },
    { kind: 'number', id: 'r', label: 'Risk-free rate r (%)', min: 0, max: 15, step: 0.1, value: 4, digits: 1 },
    { kind: 'number', id: 'sig', label: 'Volatility σ (%)', min: 2, max: 120, step: 0.5, value: 25, digits: 1 },
    { kind: 'select', id: 'greek', label: 'Plot Greek', value: 'delta', options: [{ value: 'delta', label: 'Delta Δ' }, { value: 'gamma', label: 'Gamma Γ' }, { value: 'theta', label: 'Theta Θ (per day)' }, { value: 'vega', label: 'Vega (per 1 % vol)' }, { value: 'rho', label: 'Rho ρ (per 1 % rate)' }] },
  ],
  dt: 1 / 20, previewSeconds: 1, init() { return { t: 0 }; }, step(s, _v, dt) { s.t += dt; },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const [S, K, T, r, sg, call] = bsArgs(v), Smin = Math.max(1, K * 0.4), Smax = K * 1.8, N = 120, xs = Array.from({ length: N + 1 }, (_, i) => Smin + ((Smax - Smin) * i) / N);
    const A = { x: 8, y: 8, w: w * 0.5 - 12, h: h - 16 }, price = xs.map(x => blackScholes(x, K, T, r, sg, call).price), pay = xs.map(x => (call ? Math.max(x - K, 0) : Math.max(K - x, 0))), ymax = Math.max(...price, ...pay, 1) * 1.1;
    const m = plot(c, A, [Smin, Smax], [0, ymax], { title: 'Option value vs spot', xlabel: 'S', ylabel: 'value' }); polyline(c, xs.map((x, i) => [m.X(x), m.Y(pay[i])] as [number, number]), C.dim, 1.5, [5, 4]); polyline(c, xs.map((x, i) => [m.X(x), m.Y(price[i])] as [number, number]), C.cyan, 2.5);
    const cur = blackScholes(S, K, T, r, sg, call); circle(c, m.X(clamp(S, Smin, Smax)), m.Y(cur.price), 5, C.amber, C.white, 1.5); line(c, m.X(K), m.Y(0), m.X(K), m.Y(ymax), C.pink, 1, [3, 3]); text(c, 'K', m.X(K) + 3, m.Y(ymax) + 12, C.pink, 10);
    const g = str(v, 'greek') as 'delta' | 'gamma' | 'theta' | 'vega' | 'rho', scale = g === 'vega' || g === 'rho' ? 0.01 : 1, gv = xs.map(x => (blackScholes(x, K, T, r, sg, call)[g] as number) * scale), lo = Math.min(0, ...gv), hi = Math.max(0.001, ...gv), B = { x: w * 0.5 + 4, y: 8, w: w * 0.5 - 12, h: h - 16 };
    const mg = plot(c, B, [Smin, Smax], [lo * 1.1, hi * 1.1], { title: `${g[0].toUpperCase() + g.slice(1)} vs spot`, xlabel: 'S', zeroAxis: true }); polyline(c, xs.map((x, i) => [mg.X(x), mg.Y(gv[i])] as [number, number]), C.green, 2.5); circle(c, mg.X(clamp(S, Smin, Smax)), mg.Y((cur[g] as number) * scale), 5, C.amber, C.white, 1.5);
  },
  readouts(_s, v) { const [S, K, T, r, sg, call] = bsArgs(v), o = blackScholes(S, K, T, r, sg, call), cc = blackScholes(S, K, T, r, sg, true).price, pp = blackScholes(S, K, T, r, sg, false).price; return [{ label: call ? 'Call price' : 'Put price', value: o.price, digits: 4 }, { label: 'Delta Δ', value: o.delta, digits: 4 }, { label: 'Gamma Γ', value: o.gamma, digits: 5 }, { label: 'Theta Θ (per day)', value: o.theta, digits: 4 }, { label: 'Vega (per 1 % vol)', value: o.vega / 100, digits: 4 }, { label: 'Rho (per 1 % rate)', value: o.rho / 100, digits: 4 }, { label: 'Put–call parity error', value: Math.abs(cc - pp - (S - K * Math.exp(-r * T))), digits: 8 }, { label: 'd₁ / d₂', value: `${fmt(o.d1, 3)} / ${fmt(o.d2, 3)}` }]; },
  equations() { return ['C=S\\,N(d_1)-Ke^{-rT}N(d_2)', 'd_1=\\dfrac{\\ln(S/K)+(r+\\sigma^2/2)T}{\\sigma\\sqrt T},\\ d_2=d_1-\\sigma\\sqrt T', 'C-P=S-Ke^{-rT}']; },
});

/* ============================ Bullwhip effect ============================ */
const STAGES = ['Retailer', 'Wholesaler', 'Distributor', 'Factory'];
interface BW { t: number; dem: number[]; ord: number[][]; hist: number[][]; sPrev: number[]; rng: () => number; acc: { a: number } }
function bwBuild(): BW { return { t: 0, dem: [], ord: STAGES.map(() => []), hist: STAGES.map(() => []), sPrev: STAGES.map(() => NaN), rng: mulberry(17), acc: { a: 0 } }; }
function bwTick(s: BW, L: number, p: number, sd: number, share: boolean, shock: boolean) {
  const base = 100 + (shock && s.t >= 30 ? 20 : 0), d0 = Math.max(0, base + sd * (s.rng() + s.rng() + s.rng() - 1.5) * 2); s.dem.push(d0); let inflow = d0;
  for (let i = 0; i < STAGES.length; i++) {
    const seen = share ? d0 : inflow; s.hist[i].push(seen); if (s.hist[i].length > p) s.hist[i].shift(); const m = s.hist[i].reduce((a, b) => a + b, 0) / s.hist[i].length, S = (L + 1) * m;
    const q = Math.max(0, seen + (Number.isNaN(s.sPrev[i]) ? 0 : S - s.sPrev[i])); s.sPrev[i] = S; s.ord[i].push(q); inflow = q;
  }
  s.t++; for (const a of [s.dem, ...s.ord]) if (a.length > 200) a.shift();
}
const variance = (a: number[]) => { if (a.length < 3) return 0; const m = a.reduce((x, y) => x + y, 0) / a.length; return a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1); };
export const bullwhip = defineSim<BW>({
  id: 'bullwhip_effect_supply_chain', title: 'Bullwhip Effect: Order Variability Amplifying Up a Four-Stage Supply Chain',
  ...meta('Engineering', 'Intermediate', 'Supply Chain & Operations', 'Inventory Dynamics', 'Order-up-to policy, demand forecasting, lead time, variance amplification, information sharing'),
  covers: ['Bullwhip effect', 'Supply chain management', 'Order-up-to policy', 'Demand forecasting', 'Lead time', 'Inventory control', 'Variance amplification', 'Information sharing'],
  tags: ['supply chain', 'operations', 'beer game', 'Forrester effect', 'BBA', 'MBA', 'industrial engineering', 'Lee Padmanabhan Whang'],
  learningObjectives: ['See orders swing wider at every stage upstream even though consumer demand is nearly steady.', 'Relate amplification to lead time L and the forecast window p (Chen et al.: Var(q)/Var(d) ≥ 1 + 2L/p + 2L²/p²).', 'Show that sharing consumer demand with every stage removes most of the bullwhip.'],
  assumptions: ['Retailer → wholesaler → distributor → factory; each stage forecasts with a p-period moving average and orders up to (L+1)·forecast; zero shipping loss, no capacity limit, no batching, no price fluctuations; consumer demand = 100 + noise (optional +20 % step at t = 30).'],
  blurb: 'Consumer demand is nearly flat, yet each stage up the chain orders more erratically. Change lead time, forecast window and information sharing to see why.',
  hint: 'Order-up-to level S_t = (L+1)·m̂_t; order q_t = d_t + S_t − S_{t−1}. Forecast noise is multiplied by (L+1) and passed upstream, so variance compounds: for one stage Var(q)/Var(d) ≥ 1 + 2L/p + 2L²/p².',
  params: [
    { kind: 'number', id: 'L', label: 'Replenishment lead time L (periods)', min: 0, max: 6, step: 1, value: 3, digits: 0 },
    { kind: 'number', id: 'p', label: 'Forecast window p (periods)', min: 2, max: 20, step: 1, value: 5, digits: 0 },
    { kind: 'number', id: 'sd', label: 'Consumer-demand noise σ', min: 0, max: 15, step: 0.5, value: 5, digits: 1 },
    { kind: 'toggle', id: 'share', label: 'Share consumer demand with every stage', value: false },
    { kind: 'toggle', id: 'shock', label: 'Add +20 % demand step at t = 30', value: false },
  ],
  actions: [{ id: 'reset', label: 'Restart' }],
  dt: 1 / 20, previewSeconds: 25, init() { return bwBuild(); }, action(s) { Object.assign(s, bwBuild()); },
  step(s, v, dt) { ticks(s.acc, dt, 0.1, () => bwTick(s, Math.round(num(v, 'L')), Math.round(num(v, 'p')), num(v, 'sd'), bool(v, 'share'), bool(v, 'shock'))); },
  draw(c, s, _v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const all = [s.dem, ...s.ord].flat(), hi = Math.max(140, ...all) * 1.05, lo = Math.max(0, Math.min(60, ...all) * 0.9);
    const A = { x: 8, y: 8, w: w * 0.64, h: h - 16 }, m = plot(c, A, [0, 200], [lo, hi], { title: 'Orders placed per period', xlabel: 'time (recent periods)' }); const cols = [C.green, C.cyan, C.amber, C.red];
    polyline(c, s.dem.map((d, i) => [m.X(i + 200 - s.dem.length), m.Y(d)] as [number, number]), C.white, 1.2, [3, 3]); s.ord.forEach((o, k) => polyline(c, o.map((d, i) => [m.X(i + 200 - o.length), m.Y(d)] as [number, number]), cols[k], 1.6));
    const B = { x: A.x + A.w + 8, y: 8, w: w - A.w - 24, h: h - 16 }; if (B.w > 90) { const vd = variance(s.dem) || 1; const ratios = s.ord.map(o => Math.sqrt(variance(o) / vd)); const mx = Math.max(2, ...ratios) * 1.1; text(c, 'Std-dev amplification', B.x, B.y + 12, C.text, 11, 'left', 'alphabetic', true); ratios.forEach((r, i) => { const y = B.y + 28 + i * 34; c.fillStyle = cols[i]; c.fillRect(B.x, y, Math.max(2, (B.w - 4) * r / mx), 14); text(c, `${STAGES[i]}  ×${fmt(r, 2)}`, B.x, y + 28, C.dim, 10); }); }
    text(c, 'white dashed = consumer demand', A.x + 40, A.y + 32, C.dim, 10);
  },
  readouts(s, v) { const vd = variance(s.dem) || 1, L = num(v, 'L'), p = num(v, 'p'); return [{ label: 'Retailer amplification (σ ratio)', value: Math.sqrt(variance(s.ord[0]) / vd), digits: 2 }, { label: 'Factory amplification (σ ratio)', value: Math.sqrt(variance(s.ord[3]) / vd), digits: 2 }, { label: 'Variance ratio at factory', value: variance(s.ord[3]) / vd, digits: 1 }, { label: 'Theoretical one-stage lower bound', value: 1 + (2 * L) / p + (2 * L * L) / (p * p), digits: 2 }, { label: 'Information sharing', value: bool(v, 'share') ? 'on' : 'off' }]; },
  equations() { return ['\\dfrac{\\mathrm{Var}(q)}{\\mathrm{Var}(d)}\\ge1+\\dfrac{2L}{p}+\\dfrac{2L^2}{p^2}', 'q_t=d_t+S_t-S_{t-1},\\ S_t=(L+1)\\hat\\mu_t']; },
});

/* ============================ Nash equilibrium ============================ */
type G2 = { A: number[][]; B: number[][]; name: string };
const GAMES: Record<string, G2> = {
  pd: { name: 'Prisoner’s Dilemma', A: [[-1, -3], [0, -2]], B: [[-1, 0], [-3, -2]] }, stag: { name: 'Stag Hunt', A: [[4, 0], [3, 2]], B: [[4, 3], [0, 2]] }, chicken: { name: 'Chicken (Hawk–Dove)', A: [[0, -1], [1, -10]], B: [[0, 1], [-1, -10]] },
  pennies: { name: 'Matching Pennies', A: [[1, -1], [-1, 1]], B: [[-1, 1], [1, -1]] }, bos: { name: 'Battle of the Sexes', A: [[3, 0], [0, 2]], B: [[2, 0], [0, 3]] },
};
function gameOf(v: Record<string, number | string | boolean>): G2 { const k = str(v, 'game'); if (k !== 'custom') return GAMES[k] ?? GAMES.pd; return { name: 'Custom game', A: [[num(v, 'a11'), num(v, 'a12')], [num(v, 'a21'), num(v, 'a22')]], B: [[num(v, 'b11'), num(v, 'b12')], [num(v, 'b21'), num(v, 'b22')]] }; }
export function nashAnalysis(g: G2) {
  const { A, B } = g, pure: [number, number][] = []; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) if (A[i][j] >= A[1 - i][j] && B[i][j] >= B[i][1 - j]) pure.push([i, j]);
  const dq = B[0][0] - B[1][0] - B[0][1] + B[1][1], dp = A[0][0] - A[0][1] - A[1][0] + A[1][1]; let mixed: [number, number] | null = null;
  if (Math.abs(dq) > 1e-9 && Math.abs(dp) > 1e-9) { const p = (B[1][1] - B[1][0]) / dq, q = (A[1][1] - A[0][1]) / dp; if (p > 1e-9 && p < 1 - 1e-9 && q > 1e-9 && q < 1 - 1e-9) mixed = [p, q]; }
  return { pure, mixed };
}
export const nashEquilibrium = defineSim<{ t: number }>({
  id: 'nash_equilibrium_matrix_games', title: 'Game Theory: Nash Equilibria of 2×2 Matrix Games (Pure & Mixed)',
  ...meta('Math', 'Intermediate', 'Game Theory', 'Non-cooperative Games', 'Payoff matrix, best response, dominant strategy, pure and mixed Nash equilibrium'),
  covers: ['Nash equilibrium', 'Game theory', 'Best response', 'Dominant strategy', 'Mixed strategy', 'Prisoner’s dilemma', 'Payoff matrix', 'Zero-sum game'],
  tags: ['game theory', 'economics', 'BBA', 'MBA', 'operations research', 'strategic form', 'Stag hunt', 'Chicken'],
  learningObjectives: ['Find pure Nash equilibria by checking each player’s best response.', 'Compute the mixed equilibrium from indifference conditions and see it as the intersection of best-response lines.', 'Contrast equilibrium with the socially best outcome (Prisoner’s Dilemma).'],
  assumptions: ['Two players, two actions each, simultaneous moves, complete information, payoffs in the matrix; row player = A (blue), column player = B (orange).'],
  blurb: 'Pick a classic game or edit your own payoff matrix. Pure equilibria are highlighted, the best-response plot shows every equilibrium as an intersection, and you can try your own mixed strategies.',
  hint: 'A cell is a Nash equilibrium if neither player gains by deviating alone. In a mixed equilibrium each player randomises so the opponent is indifferent: p* = (b₂₂−b₂₁)/(b₁₁−b₂₁−b₁₂+b₂₂), q* = (a₂₂−a₁₂)/(a₁₁−a₁₂−a₂₁+a₂₂).',
  params: [
    { kind: 'select', id: 'game', label: 'Game', value: 'pd', options: [...Object.entries(GAMES).map(([value, g]) => ({ value, label: g.name })), { value: 'custom', label: 'Custom payoffs' }] },
    { kind: 'number', id: 'p', label: 'Row plays action 1 with probability p', min: 0, max: 1, step: 0.01, value: 0.5, digits: 2 }, { kind: 'number', id: 'q', label: 'Column plays action 1 with probability q', min: 0, max: 1, step: 0.01, value: 0.5, digits: 2 },
    { kind: 'number', id: 'a11', label: 'Custom A(1,1)', min: -10, max: 10, step: 1, value: 3, digits: 0 }, { kind: 'number', id: 'a12', label: 'Custom A(1,2)', min: -10, max: 10, step: 1, value: 0, digits: 0 }, { kind: 'number', id: 'a21', label: 'Custom A(2,1)', min: -10, max: 10, step: 1, value: 5, digits: 0 }, { kind: 'number', id: 'a22', label: 'Custom A(2,2)', min: -10, max: 10, step: 1, value: 1, digits: 0 },
    { kind: 'number', id: 'b11', label: 'Custom B(1,1)', min: -10, max: 10, step: 1, value: 3, digits: 0 }, { kind: 'number', id: 'b12', label: 'Custom B(1,2)', min: -10, max: 10, step: 1, value: 5, digits: 0 }, { kind: 'number', id: 'b21', label: 'Custom B(2,1)', min: -10, max: 10, step: 1, value: 0, digits: 0 }, { kind: 'number', id: 'b22', label: 'Custom B(2,2)', min: -10, max: 10, step: 1, value: 1, digits: 0 },
  ],
  dt: 1 / 20, previewSeconds: 1, init() { return { t: 0 }; }, step(s, _v, dt) { s.t += dt; },
  draw(c, _s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const g = gameOf(v), { pure, mixed } = nashAnalysis(g), cw = Math.min((w * 0.5 - 40) / 2, 110), ch = Math.min(70, (h - 120) / 2), x0 = 30, y0 = 50;
    text(c, g.name, 10, 16, C.text, 13, 'left', 'alphabetic', true); text(c, 'Column player B →', x0 + cw, y0 - 22, C.orange, 11, 'center'); ['Action 1', 'Action 2'].forEach((l, j) => text(c, l, x0 + cw * (j + 0.5) + cw * 0 + 0, y0 - 6, C.dim, 10, 'center')); text(c, 'Row A', 6, y0 + ch, C.blue, 11);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const x = x0 + j * cw, y = y0 + i * ch, ne = pure.some(p => p[0] === i && p[1] === j); c.fillStyle = ne ? 'rgba(52,211,153,0.25)' : 'rgba(148,163,184,0.08)'; c.fillRect(x, y, cw - 2, ch - 2); c.strokeStyle = ne ? C.green : C.axis; c.lineWidth = ne ? 2.5 : 1; c.strokeRect(x, y, cw - 2, ch - 2); const aBest = g.A[i][j] >= g.A[1 - i][j], bBest = g.B[i][j] >= g.B[i][1 - j]; text(c, String(g.A[i][j]), x + cw * 0.3, y + ch * 0.62, C.blue, aBest ? 18 : 14, 'center', 'alphabetic', aBest); text(c, String(g.B[i][j]), x + cw * 0.72, y + ch * 0.62, C.orange, bBest ? 18 : 14, 'center', 'alphabetic', bBest); }
    text(c, 'bold = best response to the other’s action · green cell = pure Nash equilibrium', 10, y0 + 2 * ch + 18, C.dim, 10);
    const p = num(v, 'p'), q = num(v, 'q'); let ea = 0, eb = 0; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const pr = (i === 0 ? p : 1 - p) * (j === 0 ? q : 1 - q); ea += pr * g.A[i][j]; eb += pr * g.B[i][j]; } text(c, `Your mix → E[A] = ${fmt(ea, 2)}, E[B] = ${fmt(eb, 2)}`, 10, y0 + 2 * ch + 36, C.text, 11);
    const P = { x: w * 0.5 + 6, y: 8, w: w * 0.5 - 14, h: h - 16 }, m = plot(c, P, [0, 1], [0, 1], { title: 'Best responses (intersections = Nash equilibria)', xlabel: 'q = P(column plays 1)', ylabel: 'p = P(row plays 1)' });
    const rowBR: [number, number][] = [], colBR: [number, number][] = []; for (let i = 0; i <= 100; i++) { const q2 = i / 100, d = q2 * g.A[0][0] + (1 - q2) * g.A[0][1] - (q2 * g.A[1][0] + (1 - q2) * g.A[1][1]); rowBR.push([q2, d > 1e-9 ? 1 : d < -1e-9 ? 0 : 0.5]); const p2 = i / 100, e = p2 * g.B[0][0] + (1 - p2) * g.B[1][0] - (p2 * g.B[0][1] + (1 - p2) * g.B[1][1]); colBR.push([e > 1e-9 ? 1 : e < -1e-9 ? 0 : 0.5, p2]); }
    polyline(c, rowBR.map(a => [m.X(a[0]), m.Y(a[1])] as [number, number]), C.blue, 2.5); polyline(c, colBR.map(a => [m.X(a[0]), m.Y(a[1])] as [number, number]), C.orange, 2.5);
    pure.forEach(([i, j]) => circle(c, m.X(j === 0 ? 1 : 0), m.Y(i === 0 ? 1 : 0), 6, C.green, C.white, 1.5)); if (mixed) circle(c, m.X(mixed[1]), m.Y(mixed[0]), 6, C.pink, C.white, 1.5); circle(c, m.X(q), m.Y(p), 4, C.amber, C.white, 1);
  },
  readouts(_s, v) { const g = gameOf(v), { pure, mixed } = nashAnalysis(g); return [{ label: 'Pure Nash equilibria', value: pure.length ? pure.map(([i, j]) => `(${i + 1},${j + 1}) payoffs ${g.A[i][j]}, ${g.B[i][j]}`).join('; ') : 'none' }, { label: 'Mixed equilibrium (p*, q*)', value: mixed ? `(${fmt(mixed[0], 3)}, ${fmt(mixed[1], 3)})` : 'none (or degenerate)' }, { label: 'Pareto-best cell (sum of payoffs)', value: (() => { let b = [0, 0], s = -1e9; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) if (g.A[i][j] + g.B[i][j] > s) { s = g.A[i][j] + g.B[i][j]; b = [i, j]; } return `(${b[0] + 1},${b[1] + 1})`; })() }]; },
  equations() { return ['u_i(s_i^*,s_{-i}^*)\\ge u_i(s_i,s_{-i}^*)\\ \\forall s_i', 'p^*=\\dfrac{b_{22}-b_{21}}{b_{11}-b_{21}-b_{12}+b_{22}}']; },
});

/* ============================ DNA sequence alignment ============================ */
const SEQS: Record<string, [string, string]> = { classic: ['GCATGCT', 'GATTACA'], gene: ['ACGTACGTAC', 'ACGTCGTAC'], motif: ['TTGACGGATCGA', 'GGATCGATTA'], snp: ['ATGGCGTACCTAGG', 'ATGGCATACCTAGG'] };
interface AL { H: number[][]; tb: number[][]; a: string; b: string; mode: string; key: string; filled: number; acc: { a: number }; path: [number, number][]; top: string; mid: string; bot: string; score: number }
function alBuild(v: Record<string, number | string | boolean>): AL {
  const [a, b] = SEQS[str(v, 'seq')] ?? SEQS.classic, ma = num(v, 'match'), mi = num(v, 'mismatch'), gp = num(v, 'gap'), local = str(v, 'mode') === 'local', n = a.length, m = b.length;
  const H = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0)), tb = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0)); // tb: 0 stop, 1 diag, 2 up, 3 left
  if (!local) { for (let i = 1; i <= n; i++) { H[i][0] = i * gp; tb[i][0] = 2; } for (let j = 1; j <= m; j++) { H[0][j] = j * gp; tb[0][j] = 3; } }
  let best = 0, bi = n, bj = m;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) { const d = H[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? ma : mi), u = H[i - 1][j] + gp, l = H[i][j - 1] + gp; let v2 = d, t = 1; if (u > v2) { v2 = u; t = 2; } if (l > v2) { v2 = l; t = 3; } if (local && v2 <= 0) { v2 = 0; t = 0; } H[i][j] = v2; tb[i][j] = t; if (local && v2 > best) { best = v2; bi = i; bj = j; } }
  let i = local ? bi : n, j = local ? bj : m; const path: [number, number][] = [[i, j]]; let top = '', mid = '', bot = '';
  while (i > 0 || j > 0) { const t = tb[i][j]; if (local && (t === 0 || H[i][j] === 0)) break; if (t === 1) { top = a[i - 1] + top; bot = b[j - 1] + bot; mid = (a[i - 1] === b[j - 1] ? '|' : '·') + mid; i--; j--; } else if (t === 2) { top = a[i - 1] + top; bot = '-' + bot; mid = ' ' + mid; i--; } else if (t === 3) { top = '-' + top; bot = b[j - 1] + bot; mid = ' ' + mid; j--; } else break; path.push([i, j]); }
  return { H, tb, a, b, mode: local ? 'local' : 'global', key: JSON.stringify([str(v, 'seq'), ma, mi, gp, local]), filled: 0, acc: { a: 0 }, path, top, mid, bot, score: local ? best : H[n][m] };
}
export const dnaAlignment = defineSim<AL>({
  id: 'dna_sequence_alignment_dp', title: 'Bioinformatics: DNA Sequence Alignment by Dynamic Programming (Needleman–Wunsch & Smith–Waterman)',
  ...meta('Biology', 'Intermediate', 'Bioinformatics', 'Sequence Alignment', 'Dynamic programming matrix, traceback, global vs local alignment, scoring and gap penalties'),
  covers: ['Sequence alignment', 'Needleman–Wunsch', 'Smith–Waterman', 'Dynamic programming', 'Global alignment', 'Local alignment', 'Gap penalty', 'Bioinformatics', 'DNA'],
  tags: ['bioinformatics', 'computational biology', 'BLAST', 'DP', 'genomics', 'M.Sc biotech', 'GATE BT', 'GATE CS'],
  learningObjectives: ['Fill the DP matrix H(i,j) = max{diag + s, up + gap, left + gap} cell by cell.', 'Trace back from the end (global) or the best cell (local) to read the alignment.', 'See how match, mismatch and gap scores change the optimal alignment.'],
  assumptions: ['Linear gap penalty, simple match/mismatch scoring (no substitution matrices such as BLOSUM, no affine gaps); sequences up to 14 nt; ties broken diagonal > up > left.'],
  blurb: 'Watch the dynamic-programming matrix fill for two DNA sequences, then follow the traceback to see the best global or local alignment.',
  hint: 'Global (Needleman–Wunsch): start H(i,0)=i·gap, take H(n,m). Local (Smith–Waterman): floor every cell at 0, take the maximum cell. Complexity O(nm).',
  params: [
    { kind: 'select', id: 'seq', label: 'Sequence pair', value: 'classic', options: [{ value: 'classic', label: 'GCATGCT vs GATTACA (textbook)' }, { value: 'gene', label: 'Gene with a deletion' }, { value: 'motif', label: 'Shared motif GGATCGA' }, { value: 'snp', label: 'Single-nucleotide change' }] },
    { kind: 'select', id: 'mode', label: 'Alignment', value: 'global', options: [{ value: 'global', label: 'Global (Needleman–Wunsch)' }, { value: 'local', label: 'Local (Smith–Waterman)' }] },
    { kind: 'number', id: 'match', label: 'Match score', min: 1, max: 5, step: 1, value: 1, digits: 0 }, { kind: 'number', id: 'mismatch', label: 'Mismatch score', min: -5, max: 0, step: 1, value: -1, digits: 0 }, { kind: 'number', id: 'gap', label: 'Gap penalty', min: -5, max: -1, step: 1, value: -1, digits: 0 },
    { kind: 'number', id: 'speed', label: 'Cells filled per second', min: 2, max: 120, step: 1, value: 25, digits: 0 },
  ],
  actions: [{ id: 'replay', label: 'Replay filling' }],
  dt: 1 / 30, previewSeconds: 12, init(v) { return alBuild(v); }, action(s) { s.filled = 0; },
  step(s, v, dt) { if (s.key !== JSON.stringify([str(v, 'seq'), num(v, 'match'), num(v, 'mismatch'), num(v, 'gap'), str(v, 'mode') === 'local'])) Object.assign(s, alBuild(v)); const total = s.a.length * s.b.length; ticks(s.acc, dt, 1 / num(v, 'speed'), () => { if (s.filled < total) s.filled++; }, 60); },
  draw(c, s, _v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const n = s.a.length, m = s.b.length, cs = Math.min((w * 0.62) / (m + 2), (h - 90) / (n + 2), 40), x0 = 16, y0 = 14; let hi = 1, lo = 0; for (const r of s.H) for (const x of r) { hi = Math.max(hi, x); lo = Math.min(lo, x); }
    const done = s.filled >= n * m; const isFilled = (i: number, j: number) => i === 0 || j === 0 ? s.mode === 'global' || true : (i - 1) * m + j <= s.filled;
    text(c, '', 0, 0); for (let j = 0; j < m; j++) text(c, s.b[j], x0 + (j + 2.5) * cs, y0 + cs * 0.65, C.orange, 13, 'center', 'alphabetic', true); for (let i = 0; i < n; i++) text(c, s.a[i], x0 + cs * 0.5, y0 + (i + 2) * cs + cs * 0.65, C.blue, 13, 'center', 'alphabetic', true);
    for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) { const x = x0 + (j + 1) * cs, y = y0 + (i + 1) * cs; if (!isFilled(i, j)) { c.fillStyle = 'rgba(148,163,184,0.06)'; c.fillRect(x + 1, y + 1, cs - 2, cs - 2); continue; } const t = (s.H[i][j] - lo) / (hi - lo || 1); c.fillStyle = `rgba(52,211,153,${0.08 + 0.6 * t})`; c.fillRect(x + 1, y + 1, cs - 2, cs - 2); if (cs > 18) text(c, String(s.H[i][j]), x + cs / 2, y + cs / 2 + 4, C.text, Math.min(12, cs * 0.4), 'center'); }
    if (done) { s.path.forEach(([i, j], k) => { const x = x0 + (j + 1) * cs + cs / 2, y = y0 + (i + 1) * cs + cs / 2; circle(c, x, y, 3.5, C.amber); if (k > 0) { const [pi, pj] = s.path[k - 1]; line(c, x0 + (pj + 1) * cs + cs / 2, y0 + (pi + 1) * cs + cs / 2, x, y, C.amber, 2); } }); }
    const px = x0 + (m + 2) * cs + 14; if (w - px > 100) { text(c, `${s.mode === 'local' ? 'Smith–Waterman' : 'Needleman–Wunsch'}`, px, y0 + 14, C.text, 12, 'left', 'alphabetic', true); if (done) { [s.top, s.mid, s.bot].forEach((t, k) => text(c, t.split('').join(' '), px, y0 + 44 + k * 20, [C.blue, C.dim, C.orange][k], 14, 'left', 'alphabetic', k !== 1)); text(c, `score = ${s.score}`, px, y0 + 120, C.green, 13, 'left', 'alphabetic', true); } else text(c, `filling… ${s.filled} / ${n * m}`, px, y0 + 44, C.dim, 12); }
  },
  readouts(s) { const L = s.mid.length, matches = s.mid.split('').filter(x => x === '|').length, gaps = s.top.split('').filter(x => x === '-').length + s.bot.split('').filter(x => x === '-').length; return [{ label: 'Alignment score', value: s.score, digits: 0 }, { label: 'Alignment length', value: L, digits: 0 }, { label: 'Identity', value: L ? (100 * matches) / L : 0, unit: '%', digits: 0 }, { label: 'Gaps', value: gaps, digits: 0 }, { label: 'Matrix cells', value: (s.a.length + 1) * (s.b.length + 1), digits: 0 }]; },
  equations() { return ['H_{i,j}=\\max\\{H_{i-1,j-1}+s(a_i,b_j),\\ H_{i-1,j}+g,\\ H_{i,j-1}+g\\}', 'H_{i,j}\\leftarrow\\max(0,\\cdot)\\ \\text{(local)}']; },
});

/* ============================ Monte-Carlo localisation with LiDAR ============================ */
type Seg = [number, number, number, number];
const WALLS: Seg[] = [[0, 0, 10, 0], [10, 0, 10, 7], [10, 7, 0, 7], [0, 7, 0, 0], [2.6, 2.0, 4.6, 2.0], [4.6, 2.0, 4.6, 3.8], [4.6, 3.8, 2.6, 3.8], [2.6, 3.8, 2.6, 2.0], [6.8, 5.2, 8.6, 6.3], [7.5, 0, 7.5, 1.6]];
const RMAX = 8;
function castRay(x: number, y: number, a: number): number { const dx = Math.cos(a), dy = Math.sin(a); let best = RMAX; for (const [x1, y1, x2, y2] of WALLS) { const sx = x2 - x1, sy = y2 - y1, den = dx * sy - dy * sx; if (Math.abs(den) < 1e-9) continue; const t = ((x1 - x) * sy - (y1 - y) * sx) / den, u = ((x1 - x) * dy - (y1 - y) * dx) / den; if (t > 0 && u >= 0 && u <= 1 && t < best) best = t; } return best; }
const freeSpot = (x: number, y: number) => x > 0.3 && x < 9.7 && y > 0.3 && y < 6.7 && !(x > 2.3 && x < 4.9 && y > 1.7 && y < 4.1) && !(x > 7.2 && x < 7.8 && y < 1.9);
interface P { x: number; y: number; th: number; w: number }
interface MS { px: number[]; pts: P[]; rx: number; ry: number; rth: number; ex: number; ey: number; err: number[]; neff: number; scan: number[]; rng: () => number; acc: { a: number }; t: number }
function mclInit(n: number, seed: number): MS { const rng = mulberry(seed), pts: P[] = []; while (pts.length < n) { const x = rng() * 10, y = rng() * 7; if (freeSpot(x, y)) pts.push({ x, y, th: rng() * TAU, w: 1 / n }); } return { px: [], pts, rx: 6.2, ry: 3.5, rth: Math.PI / 2, ex: 5, ey: 3.5, err: [], neff: n, scan: [], rng, acc: { a: 0 }, t: 0 }; }
const BEAMS = 16;
function mclTick(s: MS, n: number, sl: number, so: number) {
  const dt = 0.1, v = 1.0, om = 0.4, g = () => (s.rng() + s.rng() + s.rng() - 1.5) * 2;
  s.rth += om * dt; s.rx += v * Math.cos(s.rth) * dt; s.ry += v * Math.sin(s.rth) * dt; if (!freeSpot(s.rx, s.ry)) { s.rx -= v * Math.cos(s.rth) * dt; s.ry -= v * Math.sin(s.rth) * dt; s.rth += 0.3; }
  s.scan = Array.from({ length: BEAMS }, (_, k) => clamp(castRay(s.rx, s.ry, s.rth + (k / BEAMS) * TAU) + sl * g(), 0.05, RMAX));
  while (s.pts.length < n) s.pts.push({ ...s.pts[Math.floor(s.rng() * s.pts.length)], w: 1 / n }); if (s.pts.length > n) s.pts.length = n;
  let wsum = 0; for (const p of s.pts) { p.th += om * dt + so * 0.3 * g() * dt * 3; const d = v * dt + so * g() * dt; p.x += Math.cos(p.th) * d; p.y += Math.sin(p.th) * d; if (!freeSpot(p.x, p.y)) { p.w = 0; continue; } let ll = 0; for (let k = 0; k < BEAMS; k += 1) { const z = castRay(p.x, p.y, p.th + (k / BEAMS) * TAU); ll += ((z - s.scan[k]) ** 2) / (2 * (sl * sl + 0.04)); } p.w = Math.exp(-ll / 3); wsum += p.w; }
  if (wsum < 1e-300) { for (const p of s.pts) p.w = 1 / s.pts.length; } else for (const p of s.pts) p.w /= wsum;
  let w2 = 0; for (const p of s.pts) w2 += p.w * p.w; s.neff = 1 / Math.max(w2, 1e-12);
  let ex = 0, ey = 0; for (const p of s.pts) { ex += p.w * p.x; ey += p.w * p.y; } s.ex = ex; s.ey = ey; s.err.push(Math.hypot(ex - s.rx, ey - s.ry)); if (s.err.length > 300) s.err.shift();
  if (s.neff < s.pts.length / 2) { const N = s.pts.length, out: P[] = [], step = 1 / N; let u = s.rng() * step, cum = s.pts[0].w, i = 0; for (let k = 0; k < N; k++) { while (u > cum && i < N - 1) { i++; cum += s.pts[i].w; } const p = s.pts[i]; out.push({ x: p.x + 0.02 * g(), y: p.y + 0.02 * g(), th: p.th + 0.02 * g(), w: 1 / N }); u += step; } s.pts = out; }
  s.t++;
}
export const mclLocalisation = defineSim<MS>({
  id: 'particle_filter_lidar_localisation', title: 'Autonomous Navigation: Particle-Filter (Monte-Carlo) Localisation with LiDAR Scans',
  ...meta('Robotics', 'Advanced', 'Autonomous Navigation', 'Probabilistic Robotics', 'Particle filter, LiDAR likelihood, resampling, effective sample size, kidnapped robot'),
  covers: ['Particle filter', 'Monte Carlo localization', 'SLAM', 'LiDAR', 'Resampling', 'Effective sample size', 'Probabilistic robotics', 'Kidnapped robot problem'],
  tags: ['SLAM', 'localisation', 'AMCL', 'ROS', 'LiDAR', 'autonomous vehicles', 'Thrun', 'M.Tech robotics'],
  learningObjectives: ['Watch a cloud of particles converge on the robot’s true pose from a completely uniform start (global localisation).', 'Relate the LiDAR likelihood, effective sample size and resampling to estimation accuracy.', 'Trigger a “kidnapping” and see the filter recover.'],
  assumptions: ['Known map (so this is localisation, the “L” of SLAM; mapping is not estimated), 16-beam 360° LiDAR with Gaussian range noise, differential-drive-like motion with Gaussian odometry noise, systematic resampling when N_eff < N/2.'],
  blurb: 'A robot circles a room with a box obstacle, scanning with LiDAR. Hundreds of particles start spread everywhere and converge on its true pose.',
  hint: 'Weight w_i ∝ exp(−Σ_k (z_k − ẑ_k(x_i))² / 2σ²): particles whose predicted scan matches the real one gain weight. Resample when N_eff = 1/Σw² drops below N/2. Symmetric rooms cause multi-modal beliefs until the box breaks the symmetry.',
  params: [
    { kind: 'number', id: 'n', label: 'Particles N', min: 50, max: 500, step: 10, value: 200, digits: 0 },
    { kind: 'number', id: 'sl', label: 'LiDAR noise σ (m)', min: 0.02, max: 0.6, step: 0.01, value: 0.1, digits: 2 },
    { kind: 'number', id: 'so', label: 'Odometry noise', min: 0, max: 1, step: 0.02, value: 0.2, digits: 2 },
  ],
  actions: [{ id: 'kidnap', label: 'Kidnap the robot' }, { id: 'reset', label: 'Restart (uniform particles)' }],
  dt: 1 / 20, previewSeconds: 15, init(v) { return mclInit(Math.round(num(v, 'n')), 3); },
  action(s, v, id) { if (id === 'reset') Object.assign(s, mclInit(Math.round(num(v, 'n')), 3 + s.t)); if (id === 'kidnap') { let x = 1, y = 1; do { x = s.rng() * 10; y = s.rng() * 7; } while (!freeSpot(x, y) || Math.hypot(x - 7.6, y - 3.5) < 2.5); s.rx = x; s.ry = y; s.rth = s.rng() * TAU; } },
  step(s, v, dt) { ticks(s.acc, dt, 0.1, () => mclTick(s, Math.round(num(v, 'n')), num(v, 'sl'), num(v, 'so')), 6); },
  draw(c, s, _v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const sc = Math.min((w * 0.68) / 10, (h - 16) / 7), ox = 8, oy = 8, X = (x: number) => ox + x * sc, Y = (y: number) => oy + y * sc;
    for (const [x1, y1, x2, y2] of WALLS) line(c, X(x1), Y(y1), X(x2), Y(y2), C.axis, 2.5);
    for (const p of s.pts) circle(c, X(p.x), Y(p.y), 1.8, `rgba(34,211,238,${clamp(0.25 + p.w * s.pts.length * 0.3, 0.25, 1)})`);
    s.scan.forEach((z, k) => { const a = s.rth + (k / BEAMS) * TAU; line(c, X(s.rx), Y(s.ry), X(s.rx + Math.cos(a) * z), Y(s.ry + Math.sin(a) * z), 'rgba(248,113,113,0.25)', 1); circle(c, X(s.rx + Math.cos(a) * z), Y(s.ry + Math.sin(a) * z), 2.2, C.red); });
    circle(c, X(s.rx), Y(s.ry), 6, C.green, C.white, 1.5); arrow(c, X(s.rx), Y(s.ry), X(s.rx + Math.cos(s.rth) * 0.7), Y(s.ry + Math.sin(s.rth) * 0.7), C.white, 2, 6); circle(c, X(s.ex), Y(s.ey), 6, undefined, C.amber, 2.5);
    const P2 = { x: ox + 10 * sc + 10, y: 8, w: w - ox - 10 * sc - 18, h: h * 0.5 }; if (P2.w > 110) { const m = plot(c, P2, [0, 300], [0, 4], { title: 'Position error (m)', xlabel: 'time steps' }); polyline(c, s.err.map((e, i) => [m.X(i + 300 - s.err.length), m.Y(Math.min(4, e))] as [number, number]), C.amber, 1.5); text(c, 'green = true robot · amber ring = estimate · cyan = particles · red = LiDAR hits', P2.x, P2.y + P2.h + 24, C.dim, 10); }
  },
  readouts(s) { const rec = s.err.slice(-30), rms = rec.length ? Math.sqrt(rec.reduce((a, b) => a + b * b, 0) / rec.length) : NaN; return [{ label: 'Position error (RMS, last 3 s)', value: rms, unit: 'm', digits: 2 }, { label: 'Effective sample size N_eff', value: s.neff, digits: 0 }, { label: 'Particles', value: s.pts.length, digits: 0 }, { label: 'Converged (error < 0.3 m)', value: rec.length && rms < 0.3 ? 'yes' : 'not yet' }, { label: 'Time steps', value: s.t, digits: 0 }]; },
  equations() { return ['w_i\\propto\\exp\\!\\Big(-\\sum_k\\dfrac{(z_k-\\hat z_k(x_i))^2}{2\\sigma^2}\\Big)', 'N_{eff}=\\dfrac{1}{\\sum_i w_i^2}']; },
});

/* ============================ Planar quadcopter ============================ */
interface QD { x: number; z: number; th: number; vx: number; vz: number; om: number; t: number; hx: number[]; hz: number[]; tx: number[]; tz: number[]; f1: number; f2: number; acc: { a: number } }
function qdBuild(): QD { return { x: 0, z: 1, th: 0, vx: 0, vz: 0, om: 0, t: 0, hx: [], hz: [], tx: [], tz: [], f1: 0, f2: 0, acc: { a: 0 } }; }
function qdTarget(v: Record<string, number | string | boolean>, t: number) { const k = Math.floor(t / 6) % 2; return k === 0 ? [0, num(v, 'zt')] : [num(v, 'xt'), num(v, 'zt') + 1]; }
export const quadcopter = defineSim<QD>({
  id: 'quadcopter_planar_state_space', title: 'Drone Dynamics: Planar Quadcopter State-Space Model with Cascaded PD Control',
  ...meta('Robotics', 'Advanced', 'Drone Dynamics & Control', 'Multirotor Control', 'Rigid-body equations, thrust and torque, hover linearisation, cascaded attitude/position PD control, wind disturbance'),
  covers: ['Quadcopter dynamics', 'State-space model', 'PD control', 'Attitude control', 'Cascaded control', 'Thrust', 'Hover linearisation', 'Drone', 'UAV'],
  tags: ['drone', 'UAV', 'multirotor', 'control systems', 'state space', 'PID', 'aerospace', 'M.Tech'],
  learningObjectives: ['Write the planar quadrotor as ẋ = f(x,u) with states (x, z, θ, ẋ, ż, θ̇) and inputs total thrust T and pitch torque τ.', 'See why horizontal motion requires tilting (underactuation) and how an inner attitude loop is nested in an outer position loop.', 'Tune gains and observe overshoot, damping, saturation and wind rejection.'],
  assumptions: ['2-D (x–z plane) rigid body, no rotor dynamics, drag or ground effect; inertia I = m·l²/3; thrust limited to TWR·m·g; hover-linearised model: ẍ ≈ −gθ, z̈ = T/m − g, θ̈ = τ/I.'],
  blurb: 'A planar quadcopter follows alternating position targets with a cascaded PD controller. Change mass, gains and wind and watch the response.',
  hint: 'Nonlinear: ẍ = −(T/m) sin θ, z̈ = (T/m) cos θ − g, θ̈ = τ/I. Outer loop turns position error into a desired tilt θ_d = −(a_x/g); inner loop turns tilt error into torque; altitude loop sets thrust.',
  params: [
    { kind: 'number', id: 'm', label: 'Mass m (kg)', min: 0.2, max: 3, step: 0.05, value: 1, digits: 2 }, { kind: 'number', id: 'l', label: 'Arm length l (m)', min: 0.1, max: 0.5, step: 0.01, value: 0.25, digits: 2 },
    { kind: 'number', id: 'kz', label: 'Altitude Kp', min: 1, max: 40, step: 0.5, value: 12, digits: 1 }, { kind: 'number', id: 'kdz', label: 'Altitude Kd', min: 0, max: 20, step: 0.5, value: 6, digits: 1 },
    { kind: 'number', id: 'kx', label: 'Position Kp', min: 0.2, max: 6, step: 0.1, value: 1.6, digits: 1 }, { kind: 'number', id: 'kdx', label: 'Position Kd', min: 0, max: 8, step: 0.1, value: 2.4, digits: 1 },
    { kind: 'number', id: 'kt', label: 'Attitude Kp', min: 5, max: 200, step: 1, value: 80, digits: 0 }, { kind: 'number', id: 'kdt', label: 'Attitude Kd', min: 0, max: 40, step: 0.5, value: 14, digits: 1 },
    { kind: 'number', id: 'xt', label: 'Target x (m)', min: -5, max: 5, step: 0.1, value: 3, digits: 1 }, { kind: 'number', id: 'zt', label: 'Target altitude z (m)', min: 0.5, max: 5, step: 0.1, value: 2, digits: 1 },
    { kind: 'number', id: 'wind', label: 'Wind force (N)', min: -3, max: 3, step: 0.1, value: 0, digits: 1 }, { kind: 'number', id: 'twr', label: 'Thrust-to-weight limit', min: 1.2, max: 4, step: 0.1, value: 2.2, digits: 1 },
  ],
  actions: [{ id: 'reset', label: 'Restart from hover' }],
  dt: 1 / 240, previewSeconds: 8, init() { return qdBuild(); }, action(s) { Object.assign(s, qdBuild()); },
  step(s, v, dt) {
    const m = num(v, 'm'), l = num(v, 'l'), I = (m * l * l) / 3, g = 9.81, [xt, zt] = qdTarget(v, s.t);
    const ax = clamp(num(v, 'kx') * (xt - s.x) - num(v, 'kdx') * s.vx, -4, 4), thd = clamp(-ax / g, -0.6, 0.6), az = num(v, 'kz') * (zt - s.z) - num(v, 'kdz') * s.vz;
    const T = clamp((m * (g + az)) / Math.max(0.5, Math.cos(s.th)), 0, num(v, 'twr') * m * g), tau = clamp(I * (num(v, 'kt') * (thd - s.th) - num(v, 'kdt') * s.om), -2 * m * g * l, 2 * m * g * l);
    s.f1 = clamp(T / 2 + tau / (2 * l), 0, 1e9); s.f2 = clamp(T / 2 - tau / (2 * l), 0, 1e9);
    const ddx = (-T * Math.sin(s.th) + num(v, 'wind')) / m, ddz = (T * Math.cos(s.th)) / m - g, ddt = tau / I; s.vx += ddx * dt; s.vz += ddz * dt; s.om += ddt * dt; s.x += s.vx * dt; s.z += s.vz * dt; s.th += s.om * dt; if (s.z < 0) { s.z = 0; s.vz = Math.max(0, s.vz); } s.t += dt;
    s.acc.a += dt; if (s.acc.a >= 0.05) { s.acc.a = 0; s.hx.push(s.x); s.hz.push(s.z); s.tx.push(xt); s.tz.push(zt); for (const a of [s.hx, s.hz, s.tx, s.tz]) if (a.length > 300) a.shift(); }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const A = { x: 8, y: 8, w: w * 0.55, h: h - 16 }, m = plot(c, A, [-6, 6], [0, 6], { title: 'x–z plane', xlabel: 'x (m)', ylabel: 'z (m)' }); const [xt, zt] = qdTarget(v, s.t);
    circle(c, m.X(xt), m.Y(zt), 7, undefined, C.green, 2); polyline(c, s.hx.map((x, i) => [m.X(clamp(x, -6, 6)), m.Y(clamp(s.hz[i], 0, 6))] as [number, number]), 'rgba(251,191,36,0.5)', 1.5);
    const L = num(v, 'l') * 3.2, cx = m.X(clamp(s.x, -6, 6)), cy = m.Y(clamp(s.z, 0, 6)), ux = Math.cos(s.th), uy = -Math.sin(s.th), px = m.X(1) - m.X(0); const a = [cx - ux * L * px, cy - uy * L * px], b = [cx + ux * L * px, cy + uy * L * px]; line(c, a[0], a[1], b[0], b[1], C.white, 4);
    const nx = Math.sin(s.th), ny = Math.cos(s.th), g = 9.81 * num(v, 'm'); for (const [p, f, col] of [[a, s.f1, C.cyan], [b, s.f2, C.pink]] as [number[], number, string][]) { const len = clamp((f / g) * 30, 0, 80); arrow(c, p[0], p[1] + 0, p[0] + nx * len * 0, p[1] - ny * len, col, 3, 6); } circle(c, cx, cy, 5, C.amber);
    const B = { x: A.x + A.w + 8, y: 8, w: w - A.w - 24, h: (h - 24) / 2 }; if (B.w > 110) { const mx = plot(c, B, [0, 300], [-6, 6], { title: 'x (amber) and target (green)', zeroAxis: true }); polyline(c, s.tx.map((x, i) => [mx.X(i), mx.Y(x)] as [number, number]), C.green, 1, [4, 3]); polyline(c, s.hx.map((x, i) => [mx.X(i), mx.Y(clamp(x, -6, 6))] as [number, number]), C.amber, 1.6); const mz = plot(c, { ...B, y: B.y + B.h + 8 }, [0, 300], [0, 6], { title: 'z (cyan) and target' }); polyline(c, s.tz.map((x, i) => [mz.X(i), mz.Y(x)] as [number, number]), C.green, 1, [4, 3]); polyline(c, s.hz.map((x, i) => [mz.X(i), mz.Y(clamp(x, 0, 6))] as [number, number]), C.cyan, 1.6); }
  },
  readouts(s, v) { const [xt, zt] = qdTarget(v, s.t); return [{ label: 'Position (x, z)', value: `(${fmt(s.x, 2)}, ${fmt(s.z, 2)}) m` }, { label: 'Target', value: `(${fmt(xt, 1)}, ${fmt(zt, 1)}) m` }, { label: 'Tilt θ', value: (s.th * 180) / Math.PI, unit: '°', digits: 1 }, { label: 'Rotor thrusts F₁ / F₂', value: `${fmt(s.f1, 1)} / ${fmt(s.f2, 1)} N` }, { label: 'Total thrust / weight', value: (s.f1 + s.f2) / (num(v, 'm') * 9.81), digits: 2 }, { label: 'Position error', value: Math.hypot(xt - s.x, zt - s.z), unit: 'm', digits: 2 }]; },
  equations() { return ['m\\ddot x=-T\\sin\\theta,\\ \\ m\\ddot z=T\\cos\\theta-mg,\\ \\ I\\ddot\\theta=\\tau', '\\dot{\\mathbf x}\\approx\\begin{bmatrix}0&I\\\\ A_{\\theta}&0\\end{bmatrix}\\mathbf x+B\\mathbf u,\\ \\ \\ddot x\\approx-g\\theta', '\\tau=I\\,[K_p(\\theta_d-\\theta)-K_d\\dot\\theta]']; },
});

/* ============================ 6-DOF robot arm: forward & inverse kinematics ============================ */
type M4 = number[];
const mI = (): M4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mm = (a: M4, b: M4): M4 => { const o = Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j]; return o; };
const Rz = (q: number): M4 => { const c = Math.cos(q), s = Math.sin(q); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }, Ry = (q: number): M4 => { const c = Math.cos(q), s = Math.sin(q); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]; }, Rx = (q: number): M4 => { const c = Math.cos(q), s = Math.sin(q); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]; };
const Tr = (x: number, y: number, z: number): M4 => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
const D1 = 0.35, L2 = 0.45, L3 = 0.4, L4 = 0.12, L5 = 0.1;
export function armFK(q: number[]): { pts: [number, number, number][]; R: M4 } {
  const chain: M4[] = [Rz(q[0]), Tr(0, 0, D1), Ry(q[1]), Tr(L2, 0, 0), Ry(q[2]), Tr(L3, 0, 0), Rx(q[3]), Ry(q[4]), Tr(L4, 0, 0), Rx(q[5]), Tr(L5, 0, 0)]; let T = mI(); const pts: [number, number, number][] = [[0, 0, 0]];
  for (const M of chain) { T = mm(T, M); pts.push([T[3], T[7], T[11]]); } return { pts, R: T };
}
const tool = (q: number[]) => { const p = armFK(q).pts; return p[p.length - 1]; };
function inv3(m: number[][]): number[][] | null { const [[a, b, c], [d, e, f], [g, h, i]] = m, A = e * i - f * h, B = -(d * i - f * g), Cc = d * h - e * g, det = a * A + b * B + c * Cc; if (Math.abs(det) < 1e-12) return null; return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [Cc / det, -(a * h - b * g) / det, (a * e - b * d) / det]]; }
function jacobian(q: number[]): number[][] { const p0 = tool(q), J: number[][] = [[], [], []]; for (let i = 0; i < 6; i++) { const q2 = q.slice(); q2[i] += 1e-6; const p1 = tool(q2); for (let r = 0; r < 3; r++) J[r][i] = (p1[r] - p0[r]) / 1e-6; } return J; }
export function ikStep(q: number[], target: [number, number, number], lam = 0.05, maxStep = 0.15): { q: number[]; err: number } {
  const p = tool(q), e = [target[0] - p[0], target[1] - p[1], target[2] - p[2]], J = jacobian(q), JJt = [0, 1, 2].map(i => [0, 1, 2].map(j => J[i].reduce((a, _, k) => a + J[i][k] * J[j][k], 0) + (i === j ? lam * lam : 0))), inv = inv3(JJt);
  const err = Math.hypot(e[0], e[1], e[2]); if (!inv) return { q, err }; const y = inv.map(r => r[0] * e[0] + r[1] * e[1] + r[2] * e[2]); let dq = Array.from({ length: 6 }, (_, k) => J[0][k] * y[0] + J[1][k] * y[1] + J[2][k] * y[2]); const mx = Math.max(...dq.map(Math.abs)); if (mx > maxStep) dq = dq.map(d => (d * maxStep) / mx);
  return { q: q.map((x, k) => clamp(x + dq[k], -2.9, 2.9)), err };
}
interface AR { q: number[]; iters: number; err: number; az: number }
export const arm6dof = defineSim<AR>({
  id: 'robot_arm_6dof_fk_ik', title: 'Kinematics Systems: 6-DOF Robot Arm Forward & Inverse Kinematics',
  ...meta('Robotics', 'Advanced', 'Robot Kinematics', 'Serial Manipulators', 'Homogeneous transforms, forward kinematics, damped-least-squares inverse kinematics, Jacobian, singularities, workspace'),
  covers: ['Forward kinematics', 'Inverse kinematics', '6-DOF manipulator', 'Homogeneous transformation', 'Jacobian', 'Singularity', 'Damped least squares', 'Robotic arm', 'Workspace'],
  tags: ['robotics', 'manipulator', 'PUMA', 'DH parameters', 'Jacobian', 'M.Tech robotics', 'GATE', 'mechatronics'],
  learningObjectives: ['Compute the tool position by multiplying joint transforms (forward kinematics).', 'Solve for joint angles numerically (Jacobian damped least squares) and watch the error shrink.', 'Recognise singular poses (low manipulability) and unreachable targets.'],
  assumptions: ['Spherical-wrist 6R arm (link lengths 0.35, 0.45, 0.40, 0.12, 0.10 m); IK solves tool POSITION only (not orientation) with ±166° joint limits; no collision checking.'],
  blurb: 'Drive a six-joint arm by joint angles (forward kinematics) or give it a target point and let the Jacobian solver find the joint angles (inverse kinematics).',
  hint: 'T = Rz(q₁)·Tz(d₁)·Ry(q₂)·Tx(L₂)·Ry(q₃)·Tx(L₃)·Rx(q₄)·Ry(q₅)·Tx(L₄)·Rx(q₆)·Tx(L₅). IK: Δq = Jᵀ(JJᵀ + λ²I)⁻¹ e repeated until the tool reaches the target. Manipulability w = √det(JJᵀ) → 0 at singularities.',
  params: [
    { kind: 'select', id: 'mode', label: 'Mode', value: 'ik', options: [{ value: 'ik', label: 'Inverse kinematics (reach a target)' }, { value: 'fk', label: 'Forward kinematics (set joints)' }] },
    { kind: 'number', id: 'tx', label: 'Target x (m)', min: -1, max: 1, step: 0.01, value: 0.6, digits: 2 }, { kind: 'number', id: 'ty', label: 'Target y (m)', min: -1, max: 1, step: 0.01, value: 0.3, digits: 2 }, { kind: 'number', id: 'tz', label: 'Target z (m)', min: 0, max: 1.2, step: 0.01, value: 0.5, digits: 2 },
    ...[1, 2, 3, 4, 5, 6].map(i => ({ kind: 'number' as const, id: `q${i}`, label: `Joint ${i} (°)`, min: -165, max: 165, step: 1, value: i === 2 ? 30 : i === 3 ? -60 : 0, digits: 0 })),
    { kind: 'number', id: 'az', label: 'View azimuth (°)', min: -180, max: 180, step: 5, value: -35, digits: 0 },
  ],
  actions: [{ id: 'home', label: 'Home pose' }], dt: 1 / 30, previewSeconds: 3,
  init(v) { return { q: [1, 2, 3, 4, 5, 6].map(i => (num(v, `q${i}`) * Math.PI) / 180), iters: 0, err: 0, az: 0 }; },
  action(s) { s.q = [0, 0.5, -1, 0, 0.5, 0]; },
  step(s, v) { if (str(v, 'mode') === 'fk') { s.q = [1, 2, 3, 4, 5, 6].map(i => (num(v, `q${i}`) * Math.PI) / 180); s.err = 0; return; } const tgt: [number, number, number] = [num(v, 'tx'), num(v, 'ty'), num(v, 'tz')]; for (let k = 0; k < 6; k++) { const r = ikStep(s.q, tgt); s.q = r.q; s.err = r.err; s.iters++; } },
  draw(c, s, v, w, h) {
    c.fillStyle = C.bg; c.fillRect(0, 0, w, h); const { pts } = armFK(s.q), az = (num(v, 'az') * Math.PI) / 180, sc = Math.min(w * 0.5, h) / 1.7;
    const proj = (p: [number, number, number], cx: number, cy: number): [number, number] => { const x = p[0] * Math.cos(az) - p[1] * Math.sin(az), y = p[0] * Math.sin(az) + p[1] * Math.cos(az); return [cx + x * sc * 0.9 + y * sc * 0.35, cy - p[2] * sc + y * sc * 0.25 + 0]; };
    const cx = w * 0.27, cy = h * 0.78; for (let g = -10; g <= 10; g++) { const a = proj([g * 0.1, -1, 0], cx, cy), b = proj([g * 0.1, 1, 0], cx, cy), a2 = proj([-1, g * 0.1, 0], cx, cy), b2 = proj([1, g * 0.1, 0], cx, cy); line(c, a[0], a[1], b[0], b[1], C.grid); line(c, a2[0], a2[1], b2[0], b2[1], C.grid); }
    const P = pts.map(p => proj(p, cx, cy)); for (let i = 0; i < P.length - 1; i++) line(c, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1], i < 2 ? C.cyan : i < 4 ? C.blue : C.amber, 6 - Math.min(i, 4) * 0.7); P.forEach((p, i) => circle(c, p[0], p[1], i === P.length - 1 ? 5 : 4, i === P.length - 1 ? C.red : C.white));
    if (str(v, 'mode') === 'ik') { const t = proj([num(v, 'tx'), num(v, 'ty'), num(v, 'tz')], cx, cy); circle(c, t[0], t[1], 8, undefined, C.green, 2); line(c, t[0] - 11, t[1], t[0] + 11, t[1], C.green, 1); line(c, t[0], t[1] - 11, t[0], t[1] + 11, C.green, 1); }
    const px = w * 0.56, pw = w - px - 8; if (pw > 120) { const m = plot(c, { x: px, y: 8, w: pw, h: h * 0.52 }, [-1, 1], [0, 1.3], { title: 'Side view (x–z)', xlabel: 'x (m)' }); polyline(c, pts.map(p => [m.X(Math.hypot(p[0], p[1]) * Math.sign(p[0] || 1)), m.Y(p[2])] as [number, number]), C.amber, 3); const tl = pts[pts.length - 1]; circle(c, m.X(Math.hypot(tl[0], tl[1]) * Math.sign(tl[0] || 1)), m.Y(tl[2]), 5, C.red); text(c, `tool (${fmt(tl[0], 2)}, ${fmt(tl[1], 2)}, ${fmt(tl[2], 2)}) m`, px + 8, h * 0.52 + 26, C.text, 11); text(c, str(v, 'mode') === 'ik' ? `IK error ${fmt(s.err * 1000, 1)} mm after ${s.iters} iterations` : 'forward kinematics', px + 8, h * 0.52 + 44, s.err < 0.002 || str(v, 'mode') === 'fk' ? C.green : C.amber, 11); }
  },
  readouts(s, v) { const t = tool(s.q), J = jacobian(s.q), JJt = [0, 1, 2].map(i => [0, 1, 2].map(j => J[i].reduce((a, _, k) => a + J[i][k] * J[j][k], 0))), det = JJt[0][0] * (JJt[1][1] * JJt[2][2] - JJt[1][2] * JJt[2][1]) - JJt[0][1] * (JJt[1][0] * JJt[2][2] - JJt[1][2] * JJt[2][0]) + JJt[0][2] * (JJt[1][0] * JJt[2][1] - JJt[1][1] * JJt[2][0]), w = Math.sqrt(Math.max(0, det)); const reach = L2 + L3 + L4 + L5;
    return [{ label: 'Tool position (x, y, z)', value: `(${fmt(t[0], 3)}, ${fmt(t[1], 3)}, ${fmt(t[2], 3)}) m` }, { label: 'IK position error', value: str(v, 'mode') === 'ik' ? s.err * 1000 : 0, unit: 'mm', digits: 2 }, { label: 'Manipulability √det(JJᵀ)', value: w, digits: 4 }, { label: 'Near singularity', value: w < 0.02 ? 'YES (low manipulability)' : 'no' }, { label: 'Joint angles (°)', value: s.q.map(x => Math.round((x * 180) / Math.PI)).join(', ') }, { label: 'Max reach from shoulder', value: reach, unit: 'm', digits: 2 }]; },
  equations() { return ['{}^0T_6=\\prod_{i=1}^{6}{}^{i-1}T_i(q_i)', '\\Delta\\mathbf q=J^{T}(JJ^{T}+\\lambda^{2}I)^{-1}\\mathbf e', 'w=\\sqrt{\\det(JJ^{T})}']; },
});
void gauss;
