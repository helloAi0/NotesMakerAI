import { useEffect, useRef } from 'react';
import type { AnySim } from '../sims/types';
import { defaultsOf } from '../sims/types';

/** Draws a still frame of a live simulation (run for a moment so it is not empty). */
export default function SimThumb({ sim }: { sim: AnySim }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const W = 640, H = 380, dpr = 1;
    cv.width = W * dpr;
    cv.height = H * dpr;
    const c = cv.getContext('2d');
    if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    try {
      const v = defaultsOf(sim.params);
      const s = sim.init(v);
      sim.preview?.(s, v);
      const dt = sim.dt ?? 1 / 240;
      const n = Math.round((sim.previewSeconds ?? 1.5) / dt);
      for (let i = 0; i < n; i++) sim.step(s, v, dt);
      sim.draw(c, s, v, W, H);
    } catch {
      c.fillStyle = '#0b1220';
      c.fillRect(0, 0, W, H);
    }
  }, [sim]);
  return <canvas ref={ref} className="w-full h-auto block rounded-t-xl" style={{ aspectRatio: '320 / 190' }} />;
}
