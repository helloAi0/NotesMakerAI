import type { AnySim, SimSubject } from './types';
import { projectile, pendulum, springSim, collisions, orbits } from './physics1';
import { interference, refraction, lens, buoyancy, decay } from './physics2';
import { gas, ph, beer, greenhouse, selection, predprey, diffusion } from './science';
import { fourier, trig, galton, regression, quadratic } from './maths';
import { arm2link, diffDrive } from './robotics';
import { rlcResonance, logicGates } from './circuits';
import { deepLearningOpt } from './deeplearning';

export const SIMS: AnySim[] = [
  projectile, pendulum, springSim, collisions, orbits, interference, refraction, lens, buoyancy, decay,
  gas, ph, beer, greenhouse, selection, predprey, diffusion,
  fourier, trig, galton, regression, quadratic,
  arm2link, diffDrive, rlcResonance, logicGates,
  deepLearningOpt,
];

export const SIM_SUBJECTS: SimSubject[] = [
  'Physics',
  'Robotics',
  'Electronics',
  'Math',
  'Chemistry',
  'Biology',
  'Computer Science',
  'Earth Science',
];
