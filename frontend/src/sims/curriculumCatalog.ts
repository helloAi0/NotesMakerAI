import type { SimSubject, EducationLevel, AnySim } from './types';

/**
 * Curriculum roadmap. Every topic names the EXACT simulation id(s) that teach it (no keyword guessing), so a topic is
 * "working" only when each listed id is a registered, real simulation. tools/catalog.mts fails if any id is unknown.
 */
export type CoverageStatus = 'working' | 'planned';
export type LevelBand = 'School 8–10' | 'School 11–12' | 'Undergraduate' | 'Postgraduate';

export interface CurriculumTopic {
  title: string;
  subject: SimSubject;
  band: LevelBand;
  simIds: string[]; // registered simulation ids that teach this topic
}
export interface ResolvedTopic extends CurriculumTopic { status: CoverageStatus; sims: AnySim[]; levels: EducationLevel[] }

const T = (subject: SimSubject, band: LevelBand, title: string, ...simIds: string[]): CurriculumTopic => ({ subject, band, title, simIds });
const S1: LevelBand = 'School 8–10', S2: LevelBand = 'School 11–12', UG: LevelBand = 'Undergraduate', PG: LevelBand = 'Postgraduate';

export const CURRICULUM: CurriculumTopic[] = [
  T('Physics', S1, 'Motion graphs (distance/velocity–time)', 'motiongraphs'),
  T('Physics', S1, 'Newton’s laws & inclined plane', 'incline'),
  T('Physics', S1, 'Pendulum & simple harmonic motion', 'pendulum'),
  T('Physics', S1, 'Buoyancy & Archimedes principle', 'buoyancy'),
  T('Physics', S1, 'Reflection & refraction of light', 'refraction'),
  T('Physics', S1, 'Lenses and image formation', 'lens'),
  T('Physics', S1, 'Sound waves', 'sound'),
  T('Physics', S1, 'Ohm’s law & simple circuits', 'ohms_law_circuits'),
  T('Physics', S2, 'Projectile motion', 'projectile'),
  T('Physics', S2, 'Collisions, momentum & energy', 'collisions'),
  T('Physics', S2, 'Orbits & Kepler’s laws', 'orbits', 'hohmann_transfer_orbit'),
  T('Physics', S2, 'Wave interference & double slit', 'interference', 'young-double-slit'),
  T('Physics', S2, 'Radioactive decay', 'decay'),
  T('Physics', S2, 'Bohr model & hydrogen spectrum', 'bohr_hydrogen', 'hydrogen_radial_orbitals'),
  T('Physics', S2, 'Gas laws & kinetic theory', 'gas'),
  T('Physics', S2, 'Electromagnetic induction', 'faraday_induction'),
  T('Physics', S2, 'Photoelectric effect', 'photoelectric_effect'),
  T('Electronics', UG, 'RLC AC circuits & resonance', 'circuits-rlc-resonance'),
  T('Chemistry', S1, 'Acids, bases and pH', 'ph'),
  T('Chemistry', S2, 'Acid–base titration curves', 'acid_base_titration'),
  T('Chemistry', S2, 'Chemical equilibrium & Le Chatelier', 'equilibrium_lechatelier'),
  T('Chemistry', S2, 'Molecular geometry (VSEPR)', 'vsepr_geometry'),
  T('Chemistry', S2, 'Reaction rates & Arrhenius equation', 'collision_arrhenius'),
  T('Chemistry', S2, 'Electrochemical cells & Nernst equation', 'galvanic_nernst'),
  T('Chemistry', S2, 'Maxwell–Boltzmann distribution', 'maxwell_boltzmann'),
  T('Chemistry', S2, 'Atomic structure & spectra', 'bohr_hydrogen', 'hydrogen_radial_orbitals'),
  T('Chemistry', S1, 'Periodic table trends', 'periodic_table_trends'),
  T('Chemistry', S2, 'Organic reaction mechanisms', 'organic_sn_e_mechanisms'),
  T('Biology', S1, 'Mitosis and cell cycle', 'mitosis_stages'),
  T('Biology', S1, 'Photosynthesis factors', 'photosynthesis_factors'),
  T('Biology', S2, 'Mendelian genetics (Punnett square)', 'mendel_punnett'),
  T('Biology', S2, 'Enzyme kinetics', 'enzyme_kinetics'),
  T('Biology', S2, 'Natural selection & evolution', 'selection', 'hardy_weinberg'),
  T('Biology', S2, 'Predator–prey population dynamics', 'predprey'),
  T('Biology', S2, 'Osmosis and diffusion', 'diffusion'),
  T('Biology', S2, 'Human heart & circulation', 'cardiac_cycle'),
  T('Earth Science', S1, 'Seasons and Earth’s axial tilt', 'seasons_axial_tilt'),
  T('Earth Science', S1, 'Moon phases and eclipses', 'moon_phases_eclipses'),
  T('Earth Science', S2, 'Seismic waves & earthquakes', 'seismic_waves'),
  T('Earth Science', S2, 'Greenhouse effect', 'greenhouse'),
  T('Earth Science', S2, 'Plate tectonics', 'plate_tectonics'),
  T('Math', S1, 'Quadratic functions & parabola', 'quadratic'),
  T('Math', S1, 'Trigonometric functions (unit circle)', 'trig'),
  T('Math', S2, 'Probability & the normal curve', 'galton', 'central_limit_theorem'),
  T('Math', S2, 'Linear regression & correlation', 'regression'),
  T('Math', S2, 'Limits, derivatives and tangents', 'tangent-limit', 'ftc-area-function'),
  T('Math', S2, 'Definite integrals / area under curve', 'riemann-sums', 'ftc-area-function'),
  T('Math', S2, 'Conic sections', 'conic_sections'),
  T('Math', S2, 'Vectors and 3-D geometry', 'vectors-3d-dot-cross'),
  T('Math', UG, 'Fourier series & synthesis', 'fourier'),
  T('Math', UG, 'Eigenvalues & linear transformations', 'eigen-explorer', 'matrix-transform'),
  T('Math', UG, 'Differential equations (phase plane)', 'ode-slope-field', 'phase-portrait-2x2', 'lorenz_chaos_sensitivity'),
  T('Math', UG, 'Taylor series approximation', 'taylor_series'),
  T('Math', UG, 'Central limit theorem & sampling', 'central_limit_theorem'),
  T('Math', UG, 'Break-even & inventory (business maths)', 'break_even_eoq'),
  T('Math', UG, 'Numerical methods (Newton–Raphson, ODE solvers)', 'ode_solvers_euler_rk4', 'ode-slope-field'),
  T('Physics', UG, 'Wave mechanics: Huygens principle', 'huygens'),
  T('Physics', UG, 'Quantum tunnelling / particle in a box', 'quantum_tunnelling_barrier', 'particle_in_box_states'),
  T('Physics', UG, 'Special relativity', 'special_relativity'),
  T('Physics', UG, 'Beer–Lambert law / spectroscopy', 'beer'),
  T('Engineering', UG, 'Beam bending & shear/moment diagrams', 'beam_bending', 'fem_beam_truss'),
  T('Engineering', UG, 'Mohr’s circle (stress transformation)', 'mohr_circle'),
  T('Engineering', UG, 'Four-bar linkage kinematics', 'four_bar_linkage'),
  T('Engineering', UG, 'Pipe flow & Reynolds number', 'pipe_flow_reynolds'),
  T('Engineering', UG, 'Truss analysis / method of joints', 'truss_method_of_joints'),
  T('Engineering', UG, 'Fluid statics & Bernoulli', 'fluid_statics_bernoulli'),
  T('Electronics', UG, 'Op-amp circuits', 'opamp_circuits'),
  T('Electronics', UG, 'Rectifier with filter', 'rectifier_filter'),
  T('Electronics', UG, 'BJT load line / biasing', 'bjt_load_line'),
  T('Electronics', UG, 'RC / RL transient response', 'rc_filter_transient'),
  T('Electronics', UG, 'Sampling theorem & aliasing', 'sampling_aliasing'),
  T('Electronics', UG, 'p–n junction & diode', 'pn_junction_depletion'),
  T('Electronics', UG, 'Logic gates & Karnaugh maps', 'circuits-digital-logic', 'karnaugh_map_minimiser'),
  T('Electronics', UG, 'Three-phase power systems', 'three_phase_power_systems'),
  T('Electronics', UG, 'MOSFET characteristics', 'mosfet_iv_characteristics', 'cmos_inverter_vtc_delay'),
  T('Computer Science', UG, 'Sorting algorithms & complexity', 'sorting_algorithms_race'),
  T('Computer Science', UG, 'Graph search / shortest path', 'graph_shortest_path_mst', 'grid_path_planning'),
  T('Computer Science', UG, 'Queueing theory', 'mm1_queue'),
  T('Computer Science', UG, 'Finite automata / Turing machines', 'automata_turing'),
  T('Computer Science', UG, 'Neural network training', 'mlp_decision_boundary', 'nn_weights_visualizer'),
  T('Computer Science', UG, 'Cache / page replacement', 'cache_page_replacement'),
  T('Security', UG, 'RSA public-key cryptography', 'rsa_toy_walkthrough'),
  T('Security', UG, 'Diffie–Hellman key exchange', 'diffie_hellman_toy'),
  T('Security', UG, 'Hash functions & avalanche effect', 'hash_avalanche_effect'),
  T('Security', UG, 'Classical ciphers & frequency analysis', 'caesar_frequency_analysis'),
  T('Materials', UG, 'Stress–strain & tensile test', 'stress_strain_tensile'),
  T('Materials', UG, 'X-ray diffraction (Bragg’s law)', 'bragg_diffraction'),
  T('Materials', UG, 'Phase diagrams & lever rule', 'phase_diagram_lever'),
  T('Chemistry', UG, 'Chemical kinetics & integrated rate laws', 'collision_arrhenius'),
  T('Chemistry', UG, 'Molecular orbital theory', 'molecular_orbital_theory'),
  T('Biology', UG, 'Hardy–Weinberg equilibrium', 'hardy_weinberg'),
  T('Robotics', PG, 'Manipulator Jacobian & singularities', 'jacobian_3link', 'robot_arm_6dof_fk_ik'),
  T('Robotics', PG, 'Trajectory generation', 'trajectory_profiles'),
  T('Robotics', PG, 'Grid path planning (A*, Dijkstra)', 'grid_path_planning'),
  T('Robotics', PG, 'Sampling-based planning (RRT)', 'rrt_planner'),
  T('Robotics', PG, 'Kalman filter state estimation', 'kalman_filter'),
  T('Robotics', PG, 'Inverted pendulum balancing control', 'inverted_pendulum_cart'),
  T('Robotics', PG, 'Particle filter / SLAM', 'particle_filter_lidar_localisation'),
  T('Robotics', PG, 'Model-predictive control / LQR design', 'inverted_pendulum_cart'),
  T('Computer Science', PG, 'Convolutional neural networks', 'cnn_convolution', 'ai_segmentation_lab'),
  T('Computer Science', PG, 'Transformer attention', 'self_attention_heatmap'),
  T('Computer Science', PG, 'Reinforcement learning (Q-learning)', 'q_learning_gridworld'),
  T('Quantum', PG, 'Band theory (Kronig–Penney)', 'kronig_penney_bands'),
  T('Quantum', PG, 'Qubit & Bloch sphere', 'bloch_sphere_qubit_gates'),
  T('Quantum', PG, 'Quantum harmonic oscillator', 'qho_eigenstates_classical'),
  T('Materials', PG, 'Diffusion in solids (Fick’s laws)', 'fick_diffusion_carburising'),
  T('Materials', PG, 'Dislocations & strengthening', 'dislocations_strengthening'),
  T('Engineering', PG, 'Finite-element beam / truss analysis', 'fem_beam_truss'),
  T('Engineering', PG, 'Computational fluid dynamics (basic)', 'viscous_channel_flow', 'navier_stokes_lbm_cylinder'),
  T('Math', PG, 'Markov chains & stationary distribution', 'pg-mcmc-metropolis', 'pagerank_power_iteration'),
  T('Math', PG, 'Monte-Carlo integration / MCMC', 'monte_carlo_integration', 'pg-mcmc-metropolis'),
  T('Math', PG, 'Optimisation: gradient descent landscapes', 'deep-learning-opt'),
  T('Electronics', PG, 'Digital filter design (FIR/IIR)', 'fir_windowed_sinc'),
  T('Electronics', PG, 'Communication systems: modulation (AM/FM/QAM)', 'modulation_am_fm_qam'),
  T('Security', PG, 'Elliptic-curve cryptography', 'elliptic_curve_crypto'),
  T('Physics', S2, 'Work, energy & conservation (skate park)', 'skatepark'),
  T('Physics', S2, 'Polarisation & Malus’ law', 'polarization-malus'),
  T('Physics', S2, 'Single-slit diffraction', 'single-slit'),
  T('Physics', PG, 'Brownian motion', 'pg-brownian-motion'),
  T('Physics', UG, 'Electromagnetic plane waves', 'ug-em-plane-wave'),
  T('Electronics', PG, 'Waveguide modes', 'ug-waveguide-modes'),
  T('Electronics', PG, 'Smith chart & impedance matching', 'ug-smith-chart'),
  T('Electronics', UG, 'Control: PID step response', 'pid_control'),
  T('Electronics', UG, 'Control: Bode plot & stability margins', 'bode_margins'),
  T('Engineering', UG, 'Forced vibration & resonance (mechanical)', 'forced_vibration'),
  T('Engineering', UG, 'Transient heat conduction', 'heat_conduction_1d', 'ftcs_heat_stability'),
  T('Engineering', UG, 'Thermodynamic cycles (Otto, Diesel, Brayton)', 'otto_diesel_brayton_cycles', 'thermo_cycles'),
  T('Math', UG, 'Matrix transformations', 'matrix-transform'),
  T('Math', PG, 'Bayesian networks', 'pg-bayes-network'),
  T('Math', PG, 'Expectation–Maximisation clustering', 'pg-em-gmm'),
  T('Computer Science', PG, 'Gradient descent on loss surfaces', 'deep-learning-opt', 'mlp_decision_boundary'),
  T('Robotics', PG, 'Differential-drive mobile robot', 'robotics-diff-drive'),
  T('Robotics', PG, 'Two-link arm kinematics', 'robotics-arm-2link'),
  T('Math', UG, 'Single-variable calculus: tangent & limit', 'tangent-limit'),
  T('Physics', S1, 'Springs, Hooke’s law & oscillation', 'spring'),
  T('Math', UG, 'Singular value decomposition (SVD)', 'svd-explorer', 'pca_principal_axes'),
];

const BAND_LEVELS: Record<LevelBand, EducationLevel[]> = {
  'School 8–10': ['Class 8', 'Class 9', 'Class 10'], 'School 11–12': ['Class 11', 'Class 12'], Undergraduate: ['B.Sc', 'B.Tech', 'BCA', 'BBA'], Postgraduate: ['M.Sc', 'M.Tech'],
};

export function resolveCurriculum(sims: AnySim[]): ResolvedTopic[] {
  const byId = new Map(sims.map(s => [s.id, s] as const));
  return CURRICULUM.map(t => {
    const hits = t.simIds.map(id => byId.get(id)).filter((s): s is AnySim => !!s);
    return { ...t, levels: BAND_LEVELS[t.band], status: hits.length ? 'working' : 'planned', sims: hits } as ResolvedTopic;
  });
}
/** Ids named by the catalog that are not registered simulations (must be empty). */
export function unknownCatalogIds(sims: AnySim[]): string[] {
  const have = new Set(sims.map(s => s.id));
  return CURRICULUM.flatMap(t => t.simIds.filter(id => !have.has(id)).map(id => `${t.title}: ${id}`));
}
