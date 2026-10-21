/* ------------------------------------------------------------------ */
/*  PhET Interactive Simulations catalogue                             */
/*  Simulations are created by PhET, University of Colorado Boulder    */
/*  (https://phet.colorado.edu). They are loaded live from PhET's      */
/*  own servers and are not copied into this project.                  */
/* ------------------------------------------------------------------ */

export type Subject = 'Physics' | 'Chemistry' | 'Biology' | 'Math' | 'Earth Science';

export const SUBJECTS: Subject[] = ['Physics', 'Chemistry', 'Biology', 'Math', 'Earth Science'];

export interface PhetSim {
  slug: string;        // the name PhET uses in its URLs
  title: string;
  subjects: Subject[]; // first one is the main subject
}

const P: Subject[] = ['Physics'];
const C: Subject[] = ['Chemistry'];
const B: Subject[] = ['Biology'];
const M: Subject[] = ['Math'];

export const PHET_SIMS: PhetSim[] = [
  // ---- Physics ----
  { slug: 'balancing-act', title: 'Balancing Act', subjects: P },
  { slug: 'balloons-and-static-electricity', title: 'Balloons and Static Electricity', subjects: P },
  { slug: 'bending-light', title: 'Bending Light', subjects: P },
  { slug: 'blackbody-spectrum', title: 'Blackbody Spectrum', subjects: P },
  { slug: 'buoyancy', title: 'Buoyancy', subjects: P },
  { slug: 'buoyancy-basics', title: 'Buoyancy: Basics', subjects: P },
  { slug: 'capacitor-lab-basics', title: 'Capacitor Lab: Basics', subjects: P },
  { slug: 'charges-and-fields', title: 'Charges and Fields', subjects: P },
  { slug: 'circuit-construction-kit-ac', title: 'Circuit Construction Kit: AC', subjects: P },
  { slug: 'circuit-construction-kit-ac-virtual-lab', title: 'Circuit Construction Kit: AC - Virtual Lab', subjects: P },
  { slug: 'circuit-construction-kit-black-box-study', title: 'Circuit Construction Kit: Black Box Study', subjects: P },
  { slug: 'circuit-construction-kit-dc', title: 'Circuit Construction Kit: DC', subjects: P },
  { slug: 'circuit-construction-kit-dc-virtual-lab', title: 'Circuit Construction Kit: DC - Virtual Lab', subjects: P },
  { slug: 'collision-lab', title: 'Collision Lab', subjects: P },
  { slug: 'color-vision', title: 'Color Vision', subjects: P },
  { slug: 'coulombs-law', title: "Coulomb's Law", subjects: P },
  { slug: 'density', title: 'Density', subjects: P },
  { slug: 'energy-forms-and-changes', title: 'Energy Forms and Changes', subjects: P },
  { slug: 'energy-skate-park', title: 'Energy Skate Park', subjects: P },
  { slug: 'energy-skate-park-basics', title: 'Energy Skate Park: Basics', subjects: P },
  { slug: 'faradays-electromagnetic-lab', title: "Faraday's Electromagnetic Lab", subjects: P },
  { slug: 'faradays-law', title: "Faraday's Law", subjects: P },
  { slug: 'fluid-pressure-and-flow', title: 'Fluid Pressure and Flow', subjects: P },
  { slug: 'forces-and-motion-basics', title: 'Forces and Motion: Basics', subjects: P },
  { slug: 'fourier-making-waves', title: 'Fourier: Making Waves', subjects: ['Physics', 'Math'] },
  { slug: 'friction', title: 'Friction', subjects: P },
  { slug: 'generator', title: 'Generator', subjects: P },
  { slug: 'geometric-optics', title: 'Geometric Optics', subjects: P },
  { slug: 'geometric-optics-basics', title: 'Geometric Optics: Basics', subjects: P },
  { slug: 'gravity-and-orbits', title: 'Gravity and Orbits', subjects: ['Physics', 'Earth Science'] },
  { slug: 'gravity-force-lab', title: 'Gravity Force Lab', subjects: P },
  { slug: 'gravity-force-lab-basics', title: 'Gravity Force Lab: Basics', subjects: P },
  { slug: 'hookes-law', title: "Hooke's Law", subjects: P },
  { slug: 'john-travoltage', title: 'John Travoltage', subjects: P },
  { slug: 'keplers-laws', title: "Kepler's Laws", subjects: ['Physics', 'Earth Science'] },
  { slug: 'magnet-and-compass', title: 'Magnet and Compass', subjects: P },
  { slug: 'magnets-and-electromagnets', title: 'Magnets and Electromagnets', subjects: P },
  { slug: 'masses-and-springs', title: 'Masses & Springs', subjects: P },
  { slug: 'masses-and-springs-basics', title: 'Masses & Springs: Basics', subjects: P },
  { slug: 'my-solar-system', title: 'My Solar System', subjects: ['Physics', 'Earth Science'] },
  { slug: 'normal-modes', title: 'Normal Modes', subjects: P },
  { slug: 'ohms-law', title: "Ohm's Law", subjects: P },
  { slug: 'optics-lab', title: 'Optics Lab', subjects: P },
  { slug: 'pendulum-lab', title: 'Pendulum Lab', subjects: P },
  { slug: 'photoelectric-effect', title: 'Photoelectric Effect', subjects: P },
  { slug: 'projectile-motion', title: 'Projectile Motion', subjects: P },
  { slug: 'quantum-bound-states', title: 'Quantum Bound States', subjects: P },
  { slug: 'quantum-coin-toss', title: 'Quantum Coin Toss', subjects: P },
  { slug: 'quantum-measurement', title: 'Quantum Measurement', subjects: P },
  { slug: 'quantum-wave-interference', title: 'Quantum Wave Interference', subjects: P },
  { slug: 'resistance-in-a-wire', title: 'Resistance in a Wire', subjects: P },
  { slug: 'rutherford-scattering', title: 'Rutherford Scattering', subjects: P },
  { slug: 'sound-waves', title: 'Sound Waves', subjects: P },
  { slug: 'under-pressure', title: 'Under Pressure', subjects: P },
  { slug: 'vector-addition', title: 'Vector Addition', subjects: ['Physics', 'Math'] },
  { slug: 'vector-addition-equations', title: 'Vector Addition: Equations', subjects: ['Physics', 'Math'] },
  { slug: 'wave-interference', title: 'Wave Interference', subjects: P },
  { slug: 'wave-on-a-string', title: 'Wave on a String', subjects: P },
  { slug: 'waves-intro', title: 'Waves Intro', subjects: P },
  { slug: 'xray-diffraction', title: 'X-Ray Diffraction', subjects: P },
  { slug: 'alpha-decay', title: 'Alpha Decay', subjects: ['Physics', 'Chemistry'] },
  { slug: 'beta-decay', title: 'Beta Decay', subjects: ['Physics', 'Chemistry'] },
  { slug: 'models-of-the-hydrogen-atom', title: 'Models of the Hydrogen Atom', subjects: ['Physics', 'Chemistry'] },
  { slug: 'molecules-and-light', title: 'Molecules and Light', subjects: ['Physics', 'Chemistry', 'Earth Science'] },
  { slug: 'greenhouse-effect', title: 'Greenhouse Effect', subjects: ['Earth Science', 'Physics'] },

  // ---- Chemistry ----
  { slug: 'acid-base-solutions', title: 'Acid-Base Solutions', subjects: C },
  { slug: 'atomic-interactions', title: 'Atomic Interactions', subjects: ['Chemistry', 'Physics'] },
  { slug: 'balancing-chemical-equations', title: 'Balancing Chemical Equations', subjects: C },
  { slug: 'beers-law-lab', title: "Beer's Law Lab", subjects: C },
  { slug: 'build-a-molecule', title: 'Build a Molecule', subjects: C },
  { slug: 'build-a-nucleus', title: 'Build a Nucleus', subjects: ['Chemistry', 'Physics'] },
  { slug: 'build-an-atom', title: 'Build an Atom', subjects: C },
  { slug: 'concentration', title: 'Concentration', subjects: C },
  { slug: 'diffusion', title: 'Diffusion', subjects: ['Chemistry', 'Biology'] },
  { slug: 'gas-properties', title: 'Gas Properties', subjects: ['Chemistry', 'Physics'] },
  { slug: 'gases-intro', title: 'Gases Intro', subjects: ['Chemistry', 'Physics'] },
  { slug: 'isotopes-and-atomic-mass', title: 'Isotopes and Atomic Mass', subjects: C },
  { slug: 'molarity', title: 'Molarity', subjects: C },
  { slug: 'molecule-polarity', title: 'Molecule Polarity', subjects: C },
  { slug: 'molecule-shapes', title: 'Molecule Shapes', subjects: C },
  { slug: 'molecule-shapes-basics', title: 'Molecule Shapes: Basics', subjects: C },
  { slug: 'ph-scale', title: 'pH Scale', subjects: C },
  { slug: 'ph-scale-basics', title: 'pH Scale: Basics', subjects: C },
  { slug: 'reactants-products-and-leftovers', title: 'Reactants, Products and Leftovers', subjects: C },
  { slug: 'states-of-matter', title: 'States of Matter', subjects: ['Chemistry', 'Physics'] },
  { slug: 'states-of-matter-basics', title: 'States of Matter: Basics', subjects: ['Chemistry', 'Physics'] },

  // ---- Biology ----
  { slug: 'eating-exercise-and-energy', title: 'Eating & Exercise', subjects: B },
  { slug: 'gene-expression-essentials', title: 'Gene Expression Essentials', subjects: B },
  { slug: 'membrane-transport', title: 'Membrane Transport', subjects: B },
  { slug: 'natural-selection', title: 'Natural Selection', subjects: B },
  { slug: 'neuron', title: 'Neuron', subjects: B },

  // ---- Math and statistics ----
  { slug: 'area-builder', title: 'Area Builder', subjects: M },
  { slug: 'area-model-algebra', title: 'Area Model Algebra', subjects: M },
  { slug: 'area-model-decimals', title: 'Area Model Decimals', subjects: M },
  { slug: 'area-model-introduction', title: 'Area Model Introduction', subjects: M },
  { slug: 'area-model-multiplication', title: 'Area Model Multiplication', subjects: M },
  { slug: 'arithmetic', title: 'Arithmetic', subjects: M },
  { slug: 'build-a-fraction', title: 'Build a Fraction', subjects: M },
  { slug: 'calculus-grapher', title: 'Calculus Grapher', subjects: M },
  { slug: 'center-and-variability', title: 'Center and Variability', subjects: M },
  { slug: 'curve-fitting', title: 'Curve Fitting', subjects: M },
  { slug: 'equality-explorer', title: 'Equality Explorer', subjects: M },
  { slug: 'equality-explorer-basics', title: 'Equality Explorer: Basics', subjects: M },
  { slug: 'equality-explorer-two-variables', title: 'Equality Explorer: Two Variables', subjects: M },
  { slug: 'estimation', title: 'Estimation', subjects: M },
  { slug: 'expression-exchange', title: 'Expression Exchange', subjects: M },
  { slug: 'fraction-comparison', title: 'Fraction Comparison', subjects: M },
  { slug: 'fraction-matcher', title: 'Fraction Matcher', subjects: M },
  { slug: 'fractions-equality', title: 'Fractions: Equality', subjects: M },
  { slug: 'fractions-intro', title: 'Fractions: Intro', subjects: M },
  { slug: 'fractions-mixed-numbers', title: 'Fractions: Mixed Numbers', subjects: M },
  { slug: 'function-builder', title: 'Function Builder', subjects: M },
  { slug: 'function-builder-basics', title: 'Function Builder: Basics', subjects: M },
  { slug: 'graphing-lines', title: 'Graphing Lines', subjects: M },
  { slug: 'graphing-quadratics', title: 'Graphing Quadratics', subjects: M },
  { slug: 'graphing-slope-intercept', title: 'Graphing Slope-Intercept', subjects: M },
  { slug: 'least-squares-regression', title: 'Least-Squares Regression', subjects: M },
  { slug: 'make-a-ten', title: 'Make a Ten', subjects: M },
  { slug: 'mean-share-and-balance', title: 'Mean: Share and Balance', subjects: M },
  { slug: 'number-compare', title: 'Number Compare', subjects: M },
  { slug: 'number-line-distance', title: 'Number Line: Distance', subjects: M },
  { slug: 'number-line-integers', title: 'Number Line: Integers', subjects: M },
  { slug: 'number-line-operations', title: 'Number Line: Operations', subjects: M },
  { slug: 'number-pairs', title: 'Number Pairs', subjects: M },
  { slug: 'number-play', title: 'Number Play', subjects: M },
  { slug: 'plinko-probability', title: 'Plinko Probability', subjects: M },
  { slug: 'projectile-data-lab', title: 'Projectile Data Lab', subjects: ['Math', 'Physics'] },
  { slug: 'projectile-sampling-distributions', title: 'Projectile Sampling Distributions', subjects: ['Math', 'Physics'] },
  { slug: 'proportion-playground', title: 'Proportion Playground', subjects: M },
  { slug: 'quadrilateral', title: 'Quadrilateral', subjects: M },
  { slug: 'ratio-and-proportion', title: 'Ratio and Proportion', subjects: M },
  { slug: 'trig-tour', title: 'Trig Tour', subjects: M },
  { slug: 'unit-rates', title: 'Unit Rates', subjects: M },
];

/* ---------------- URLs on PhET's own servers ---------------- */

const BASE = 'https://phet.colorado.edu';

/** The runnable HTML5 simulation (English). */
export const simRunUrl = (slug: string) => `${BASE}/sims/html/${slug}/latest/${slug}_en.html`;
/** PhET's own page for the simulation (description, teaching resources, license). */
export const simPageUrl = (slug: string) => `${BASE}/en/simulations/${slug}`;
export const simLicenseUrl = (slug: string) => `${BASE}/en/simulations/${slug}/license`;
/** Preview image. PhET publishes one per simulation; if it is missing the card shows a plain tile. */
export const simThumbUrl = (slug: string) => `${BASE}/sims/html/${slug}/latest/${slug}-600.png`;
export const PHET_HOME = `${BASE}/en/simulations/filter?type=html`;