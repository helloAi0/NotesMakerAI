import type { SimSubject, EducationLevel, AnySim } from './types';

/**
 * Honest curriculum roadmap. A topic is "working" ONLY when at least one registered simulation
 * really covers it (matched against the simulation's own title/covers/tags/topic metadata).
 * Everything else is "planned" and is never presented as functional.
 */
export type CoverageStatus = 'working' | 'planned';
export type LevelBand = 'School 8–10' | 'School 11–12' | 'Undergraduate' | 'Postgraduate';

export interface CurriculumTopic {
  title: string;
  subject: SimSubject;
  band: LevelBand;
  keywords: string[]; // any one (lowercase) found in a sim's metadata text counts as coverage
}
export interface ResolvedTopic extends CurriculumTopic { status: CoverageStatus; sims: AnySim[]; levels: EducationLevel[] }

const T = (subject: SimSubject, band: LevelBand, title: string, ...keywords: string[]): CurriculumTopic => ({ subject, band, title, keywords });
const S1: LevelBand = 'School 8–10', S2: LevelBand = 'School 11–12', UG: LevelBand = 'Undergraduate', PG: LevelBand = 'Postgraduate';

export const CURRICULUM: CurriculumTopic[] = [
  // ---------- School Physics ----------
  T('Physics', S1, 'Motion graphs (distance/velocity–time)', 'motion graph', 'velocity-time'),
  T('Physics', S1, 'Newton’s laws & inclined plane', 'incline', 'newton’s laws', 'newton\'s laws'),
  T('Physics', S1, 'Pendulum & simple harmonic motion', 'pendulum', 'simple harmonic'),
  T('Physics', S1, 'Buoyancy & Archimedes principle', 'buoyancy', 'archimedes'),
  T('Physics', S1, 'Reflection & refraction of light', 'snell', 'refraction'),
  T('Physics', S1, 'Lenses and image formation', 'lens'),
  T('Physics', S1, 'Sound waves', 'sound'),
  T('Physics', S1, 'Ohm’s law & simple circuits', 'ohm'),
  T('Physics', S2, 'Projectile motion', 'projectile'),
  T('Physics', S2, 'Collisions, momentum & energy', 'collisions'),
  T('Physics', S2, 'Orbits & Kepler’s laws', 'kepler', 'orbit'),
  T('Physics', S2, 'Wave interference & double slit', 'interference', 'double-slit'),
  T('Physics', S2, 'Radioactive decay', 'radioactive', 'half-life'),
  T('Physics', S2, 'Bohr model & hydrogen spectrum', 'bohr'),
  T('Physics', S2, 'Gas laws & kinetic theory', 'gas laws'),
  T('Physics', S2, 'Electromagnetic induction', 'faraday', 'induction'),
  T('Physics', S2, 'Photoelectric effect', 'photoelectric'),
  T('Electronics', UG, 'RLC AC circuits & resonance', 'rlc'),
  // ---------- School Chemistry ----------
  T('Chemistry', S1, 'Acids, bases and pH', 'ph & acid'),
  T('Chemistry', S2, 'Acid–base titration curves', 'titration'),
  T('Chemistry', S2, 'Chemical equilibrium & Le Chatelier', 'le chatelier', 'equilibrium'),
  T('Chemistry', S2, 'Molecular geometry (VSEPR)', 'vsepr'),
  T('Chemistry', S2, 'Reaction rates & Arrhenius equation', 'arrhenius'),
  T('Chemistry', S2, 'Electrochemical cells & Nernst equation', 'nernst', 'galvanic'),
  T('Chemistry', S2, 'Maxwell–Boltzmann distribution', 'maxwell'),
  T('Chemistry', S2, 'Atomic structure & spectra', 'bohr'),
  T('Chemistry', S1, 'Periodic table trends', 'periodic'),
  T('Chemistry', S2, 'Organic reaction mechanisms', 'mechanism', 'sn2'),
  // ---------- School Biology / Earth ----------
  T('Biology', S1, 'Mitosis and cell cycle', 'mitosis'),
  T('Biology', S1, 'Photosynthesis factors', 'photosynthesis'),
  T('Biology', S2, 'Mendelian genetics (Punnett square)', 'mendel', 'punnett'),
  T('Biology', S2, 'Enzyme kinetics', 'enzyme'),
  T('Biology', S2, 'Natural selection & evolution', 'natural selection'),
  T('Biology', S2, 'Predator–prey population dynamics', 'predator'),
  T('Biology', S2, 'Osmosis and diffusion', 'osmosis', 'diffusion'),
  T('Biology', S2, 'Human heart & circulation', 'heart', 'circulation'),
  T('Earth Science', S1, 'Seasons and Earth’s axial tilt', 'axial tilt', 'seasons'),
  T('Earth Science', S1, 'Moon phases and eclipses', 'moon phase', 'eclipse'),
  T('Earth Science', S2, 'Seismic waves & earthquakes', 'seismic'),
  T('Earth Science', S2, 'Greenhouse effect', 'greenhouse', 'climate energy'),
  T('Earth Science', S2, 'Plate tectonics', 'plate motion'),
  // ---------- School Maths ----------
  T('Math', S1, 'Quadratic functions & parabola', 'quadratic'),
  T('Math', S1, 'Trigonometric functions (unit circle)', 'trigonometr', 'unit circle'),
  T('Math', S2, 'Probability & the normal curve', 'galton', 'normal distribution'),
  T('Math', S2, 'Linear regression & correlation', 'regression', 'line of best fit'),
  T('Math', S2, 'Limits, derivatives and tangents', 'derivative', 'tangent'),
  T('Math', S2, 'Definite integrals / area under curve', 'riemann', 'integral'),
  T('Math', S2, 'Conic sections', 'conic section'),
  T('Math', S2, 'Vectors and 3-D geometry', 'vector'),
  // ---------- Undergraduate ----------
  T('Math', UG, 'Fourier series & synthesis', 'fourier'),
  T('Math', UG, 'Eigenvalues & linear transformations', 'eigen'),
  T('Math', UG, 'Differential equations (phase plane)', 'phase plane', 'differential equation'),
  T('Math', UG, 'Taylor series approximation', 'taylor'),
  T('Math', UG, 'Central limit theorem & sampling', 'central limit'),
  T('Math', UG, 'Break-even & inventory (business maths)', 'break-even', 'economic order'),
  T('Math', UG, 'Numerical methods (Newton–Raphson, ODE solvers)', 'newton-raphson', 'rk4', 'runge'),
  T('Physics', UG, 'Wave mechanics: Huygens principle', 'huygens'),
  T('Physics', UG, 'Quantum tunnelling / particle in a box', 'tunnel', 'particle in a box'),
  T('Physics', UG, 'Special relativity', 'relativity'),
  T('Physics', UG, 'Beer–Lambert law / spectroscopy', 'lambert'),
  T('Engineering', UG, 'Beam bending & shear/moment diagrams', 'beam'),
  T('Engineering', UG, 'Mohr’s circle (stress transformation)', 'mohr'),
  T('Engineering', UG, 'Four-bar linkage kinematics', 'four-bar', 'linkage'),
  T('Engineering', UG, 'Pipe flow & Reynolds number', 'reynolds'),
  T('Engineering', UG, 'Truss analysis / method of joints', 'truss'),
  T('Engineering', UG, 'Fluid statics & Bernoulli', 'bernoulli equation', 'bernoulli’s principle'),
  T('Electronics', UG, 'Op-amp circuits', 'op-amp', 'opamp'),
  T('Electronics', UG, 'Rectifier with filter', 'rectifier'),
  T('Electronics', UG, 'BJT load line / biasing', 'bjt', 'load line'),
  T('Electronics', UG, 'RC / RL transient response', 'rc filter', 'transient'),
  T('Electronics', UG, 'Sampling theorem & aliasing', 'aliasing'),
  T('Electronics', UG, 'p–n junction & diode', 'p-n junction', 'depletion'),
  T('Electronics', UG, 'Logic gates & Karnaugh maps', 'karnaugh', 'logic gate'),
  T('Electronics', UG, 'Three-phase power systems', 'three-phase'),
  T('Electronics', UG, 'MOSFET characteristics', 'mosfet'),
  T('Computer Science', UG, 'Sorting algorithms & complexity', 'sorting'),
  T('Computer Science', UG, 'Graph search / shortest path', 'dijkstra', 'a*,'),
  T('Computer Science', UG, 'Queueing theory', 'queue'),
  T('Computer Science', UG, 'Finite automata / Turing machines', 'automata', 'turing'),
  T('Computer Science', UG, 'Neural network training', 'multilayer perceptron', 'backpropagation'),
  T('Computer Science', UG, 'Cache / page replacement', 'page replacement', 'cache'),
  T('Security', UG, 'RSA public-key cryptography', 'rsa'),
  T('Security', UG, 'Diffie–Hellman key exchange', 'diffie'),
  T('Security', UG, 'Hash functions & avalanche effect', 'hash function'),
  T('Security', UG, 'Classical ciphers & frequency analysis', 'caesar', 'frequency analysis'),
  T('Materials', UG, 'Stress–strain & tensile test', 'tensile', 'young'),
  T('Materials', UG, 'X-ray diffraction (Bragg’s law)', 'bragg'),
  T('Materials', UG, 'Phase diagrams & lever rule', 'lever rule'),
  T('Chemistry', UG, 'Chemical kinetics & integrated rate laws', 'rate law', 'arrhenius'),
  T('Chemistry', UG, 'Molecular orbital theory', 'molecular orbital'),
  T('Biology', UG, 'Hardy–Weinberg equilibrium', 'hardy'),
  // ---------- Postgraduate ----------
  T('Robotics', PG, 'Manipulator Jacobian & singularities', 'jacobian'),
  T('Robotics', PG, 'Trajectory generation', 'trajectory'),
  T('Robotics', PG, 'Grid path planning (A*, Dijkstra)', 'a* search', 'path planning'),
  T('Robotics', PG, 'Sampling-based planning (RRT)', 'rrt'),
  T('Robotics', PG, 'Kalman filter state estimation', 'kalman'),
  T('Robotics', PG, 'Inverted pendulum balancing control', 'inverted pendulum'),
    T('Robotics', PG, 'Particle filter / SLAM', 'particle filter', 'slam'),
  T('Robotics', PG, 'Model-predictive control / LQR design', 'lqr', 'model predictive'),
  T('Computer Science', PG, 'Convolutional neural networks', 'convolution'),
  T('Computer Science', PG, 'Transformer attention', 'attention'),
  T('Computer Science', PG, 'Reinforcement learning (Q-learning)', 'q-learning', 'reinforcement'),
  T('Quantum', PG, 'Band theory (Kronig–Penney)', 'kronig'),
  T('Quantum', PG, 'Qubit & Bloch sphere', 'bloch sphere', 'qubit'),
  T('Quantum', PG, 'Quantum harmonic oscillator', 'harmonic oscillator'),
  T('Materials', PG, 'Diffusion in solids (Fick’s laws)', 'fick'),
  T('Materials', PG, 'Dislocations & strengthening', 'dislocation'),
  T('Engineering', PG, 'Finite-element beam / truss analysis', 'finite element'),
  T('Engineering', PG, 'Computational fluid dynamics (basic)', 'navier', 'cfd'),
  T('Math', PG, 'Markov chains & stationary distribution', 'markov'),
  T('Math', PG, 'Monte-Carlo integration / MCMC', 'monte carlo', 'monte-carlo'),
  T('Math', PG, 'Optimisation: gradient descent landscapes', 'gradient descent'),
  T('Electronics', PG, 'Digital filter design (FIR/IIR)', 'fir filter', 'iir filter'),
  T('Electronics', PG, 'Communication systems: modulation (AM/FM/QAM)', 'modulation'),
  T('Security', PG, 'Elliptic-curve cryptography', 'elliptic'),
  T('Physics', S2, 'Work, energy & conservation (skate park)', 'work-energy', 'skatepark'),
  T('Physics', S2, 'Polarisation & Malus’ law', 'polarization'),
  T('Physics', S2, 'Single-slit diffraction', 'single-slit'),
  T('Physics', PG, 'Brownian motion', 'brownian'),
  T('Physics', UG, 'Electromagnetic plane waves', 'plane-wave', 'plane wave'),
  T('Electronics', PG, 'Waveguide modes', 'waveguide'),
  T('Electronics', PG, 'Smith chart & impedance matching', 'smith chart'),
  T('Electronics', UG, 'Control: PID step response', 'pid controller'),
  T('Electronics', UG, 'Control: Bode plot & stability margins', 'bode plot'),
  T('Engineering', UG, 'Forced vibration & resonance (mechanical)', 'forced vibration'),
  T('Engineering', UG, 'Transient heat conduction', 'transient conduction', 'heat equation'),
  T('Engineering', UG, 'Thermodynamic cycles (Otto, Diesel, Brayton)', 'otto cycle', 'brayton'),
  T('Math', UG, 'Matrix transformations', 'matrix-transform', 'matrix transform'),
  T('Math', PG, 'Bayesian networks', 'bayesian-network', 'bayesian network'),
  T('Math', PG, 'Expectation–Maximisation clustering', 'expectation'),
  T('Computer Science', PG, 'Gradient descent on loss surfaces', 'loss surface', 'gradient descent'),
  T('Robotics', PG, 'Differential-drive mobile robot', 'differential drive'),
  T('Robotics', PG, 'Two-link arm kinematics', 'arm-2link'),
  T('Math', UG, 'Single-variable calculus: tangent & limit', 'tangent-limit'),
  T('Physics', S1, 'Springs, Hooke’s law & oscillation', 'spring'),
  T('Math', UG, 'Singular value decomposition (SVD)', 'svd'),
];

const simText = (s: AnySim) => [s.id, s.title, s.topic, s.subtopic, s.category, ...(s.covers ?? []), ...(s.tags ?? [])].join(' | ').toLowerCase();
const BAND_LEVELS: Record<LevelBand, EducationLevel[]> = {
  'School 8–10': ['Class 8', 'Class 9', 'Class 10'], 'School 11–12': ['Class 11', 'Class 12'], Undergraduate: ['B.Sc', 'B.Tech', 'BCA', 'BBA'], Postgraduate: ['M.Sc', 'M.Tech'],
};

export function resolveCurriculum(sims: AnySim[]): ResolvedTopic[] {
  const texts = sims.map(s => [s, simText(s)] as const);
  return CURRICULUM.map(t => {
    const hits = texts.filter(([sm, tx]) => t.keywords.some(k => tx.includes(k))).map(([s]) => s);
    return { ...t, levels: BAND_LEVELS[t.band], status: hits.length ? 'working' : 'planned', sims: hits.slice(0, 4) } as ResolvedTopic;
  });
}
