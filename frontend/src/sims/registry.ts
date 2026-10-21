import type { AnySim, SimSubject } from './types';
import { projectile, pendulum, springSim, collisions, orbits } from './physics1';
import { interference, refraction, lens, buoyancy, decay } from './physics2';
import { gas, ph, beer, greenhouse, selection, predprey, diffusion } from './science';
import { fourier, trig, galton, regression, quadratic } from './maths';

export const SIMS: AnySim[] = [
  projectile, pendulum, springSim, collisions, orbits, interference, refraction, lens, buoyancy, decay,
  gas, ph, beer, greenhouse, selection, predprey, diffusion,
  fourier, trig, galton, regression, quadratic,
];

export const SIM_SUBJECTS: SimSubject[] = ['Physics', 'Chemistry', 'Earth Science', 'Biology', 'Math'];
