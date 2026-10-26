import { tunnelWave, trans } from '../src/sims/pg_physics_eng.ts';
let bad = 0;
for (const [E, V0, a] of [[0.8, 1.5, 1.2], [2.5, 1.5, 1.2], [0.3, 3, 0.5], [1.5, 1.5, 1], [3, 1, 2]]) {
  const f = tunnelWave(E, V0, a), T = trans(E, V0, a), right = f(a + 3), eps = 1e-4;
  const cont0 = Math.abs(f(-eps) - f(eps)), contA = Math.abs(f(a - eps) - f(a + eps));
  const ok = Math.abs(right - T) < 1e-3 && cont0 < 1e-2 && contA < 1e-2; if (!ok) bad++;
  console.log(ok ? 'ok ' : 'BAD', E, V0, a, 'T', T.toFixed(4), 'wave right', right.toFixed(4), 'cont', cont0.toExponential(1), contA.toExponential(1));
}
process.exit(bad ? 1 : 0);
