import { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Sliders, Activity, Info } from 'lucide-react';

export default function InteractiveVisualizer() {
  // Physics State
  const [angle, setAngle] = useState(45);
  const [velocity, setVelocity] = useState(20);
  const [isRunning, setIsRunning] = useState(false);
  const [time, setTime] = useState(0);
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([]);
  
  // Refs for animation loop
  const requestRef = useRef<number>(0);
  const previousTimeRef = useRef<number>(0);

  // Constants
  const G = 9.81; // Gravity
  const SCALE = 10; // 1 meter = 10 pixels
  const START_X = 60; // Canvas start X
  const START_Y = 340; // Canvas start Y (ground level)

  const angleRad = (angle * Math.PI) / 180;
  const vx = velocity * Math.cos(angleRad);
  const vy = velocity * Math.sin(angleRad);
  const flightTime = (2 * vy) / G;

  // Animation Loop
  useEffect(() => {
    const animate = (timestamp: number) => {
      if (previousTimeRef.current !== undefined) {
        const dt = (timestamp - previousTimeRef.current) / 1000;
        
        setTime((prevTime) => {
          const nextTime = prevTime + dt;
          
          if (nextTime >= flightTime) {
            setIsRunning(false);
            return flightTime;
          }

          // Add to trail
          const currentX = vx * nextTime;
          const currentY = vy * nextTime - 0.5 * G * nextTime * nextTime;
          setTrail((prev) => [...prev, { x: currentX, y: currentY }]);

          return nextTime;
        });
      }
      previousTimeRef.current = timestamp;
      
      if (isRunning) {
        requestRef.current = requestAnimationFrame(animate);
      }
    };

    if (isRunning) {
      previousTimeRef.current = performance.now();
      requestRef.current = requestAnimationFrame(animate);
    }

    return () => cancelAnimationFrame(requestRef.current);
  }, [isRunning, flightTime, vx, vy]);

  const resetSim = () => {
    setIsRunning(false);
    setTime(0);
    setTrail([]);
  };

  const startSim = () => {
    if (time >= flightTime) resetSim();
    setIsRunning(true);
  };

  // Calculate current position
  const currentX = vx * time;
  const currentY = Math.max(0, vy * time - 0.5 * G * time * time);

  // Convert to SVG coordinates
  const svgX = START_X + currentX * SCALE;
  const svgY = START_Y - currentY * SCALE;

  return (
    <div className="w-full max-w-5xl mx-auto bg-slate-50 border border-slate-200 rounded-2xl shadow-xl overflow-hidden flex flex-col font-sans">
      {/* Header */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Projectile Motion Simulator</h2>
            <p className="text-xs text-slate-500">Adjust parameters to observe kinematic trajectories.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full border border-emerald-200">Physics Engine Active</span>
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 p-6 gap-6">
        {/* Left Control Panel */}
        <div className="w-full md:w-64 flex flex-col gap-6">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-slate-500" /> Parameters
            </h3>
            
            <div className="space-y-5">
              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-2">
                  <span>Initial Velocity</span>
                  <span className="bg-slate-100 px-2 py-0.5 rounded text-blue-700">{velocity} m/s</span>
                </div>
                <input 
                  type="range" min="5" max="40" value={velocity} 
                  onChange={(e) => { setVelocity(Number(e.target.value)); resetSim(); }}
                  className="w-full accent-blue-600 cursor-pointer" 
                  disabled={isRunning}
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-2">
                  <span>Launch Angle</span>
                  <span className="bg-slate-100 px-2 py-0.5 rounded text-blue-700">{angle}°</span>
                </div>
                <input 
                  type="range" min="10" max="85" value={angle} 
                  onChange={(e) => { setAngle(Number(e.target.value)); resetSim(); }}
                  className="w-full accent-blue-600 cursor-pointer" 
                  disabled={isRunning}
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
            <button 
              onClick={isRunning ? () => setIsRunning(false) : startSim}
              className={`w-full py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm ${
                isRunning ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isRunning ? <><Pause className="w-4 h-4"/> Pause</> : <><Play className="w-4 h-4"/> Launch Projectile</>}
            </button>
            <button 
              onClick={resetSim}
              className="w-full py-2.5 rounded-lg text-sm font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4"/> Reset
            </button>
          </div>

          {/* Real-time Data */}
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-inner">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Telemetry Data</h3>
            <div className="space-y-2 font-mono text-xs text-emerald-400">
              <div className="flex justify-between border-b border-slate-800 pb-1">
                <span className="text-slate-500">Time (t)</span>
                <span>{time.toFixed(2)} s</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-1">
                <span className="text-slate-500">Distance (x)</span>
                <span>{currentX.toFixed(2)} m</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-1">
                <span className="text-slate-500">Height (y)</span>
                <span>{currentY.toFixed(2)} m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Max Height</span>
                <span>{((vy * vy) / (2 * G)).toFixed(2)} m</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Viewport (SVG Canvas) */}
        <div className="flex-1 bg-[#1e293b] rounded-xl border border-slate-800 shadow-inner relative overflow-hidden flex flex-col">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#334155_1px,transparent_1px),linear-gradient(to_bottom,#334155_1px,transparent_1px)] bg-[size:20px_20px] opacity-20"></div>
          
          <svg width="100%" height="100%" viewBox="0 0 600 400" className="relative z-10 w-full h-full">
            {/* Axes */}
            <line x1={START_X} y1={START_Y} x2="560" y2={START_Y} stroke="#64748b" strokeWidth="2" />
            <line x1={START_X} y1={START_Y} x2={START_X} y2="40" stroke="#64748b" strokeWidth="2" />
            
            {/* Axis Labels */}
            <text x="560" y={START_Y + 15} fill="#94a3b8" fontSize="12" textAnchor="end">Distance (m)</text>
            <text x={START_X - 10} y="40" fill="#94a3b8" fontSize="12" textAnchor="end">Height (m)</text>

            {/* Predicted Trajectory (Ghost Line) */}
            <path 
              d={Array.from({ length: 40 }).map((_, i) => {
                const t = (i / 39) * flightTime;
                const px = START_X + (vx * t) * SCALE;
                const py = START_Y - (vy * t - 0.5 * G * t * t) * SCALE;
                return `${i === 0 ? 'M' : 'L'} ${px} ${py}`;
              }).join(' ')}
              fill="none" stroke="#475569" strokeWidth="2" strokeDasharray="4 4" 
            />

            {/* Actual Trail */}
            <path 
              d={trail.map((p, i) => {
                const px = START_X + p.x * SCALE;
                const py = START_Y - p.y * SCALE;
                return `${i === 0 ? 'M' : 'L'} ${px} ${py}`;
              }).join(' ')}
              fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" 
            />

            {/* Launch Angle Vector */}
            <line 
              x1={START_X} y1={START_Y} 
              x2={START_X + 50 * Math.cos(angleRad)} 
              y2={START_Y - 50 * Math.sin(angleRad)} 
              stroke="#f59e0b" strokeWidth="2" 
            />
            <text 
              x={START_X + 60 * Math.cos(angleRad)} 
              y={START_Y - 60 * Math.sin(angleRad)} 
              fill="#f59e0b" fontSize="12" fontWeight="bold"
            >{angle}°</text>

            {/* The Projectile */}
            <circle cx={svgX} cy={svgY} r="8" fill="#ef4444" className="shadow-lg" />
            <circle cx={svgX} cy={svgY} r="12" fill="transparent" stroke="#ef4444" strokeWidth="2" opacity="0.5" />
          </svg>
          
          <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
             <div className="flex items-start gap-2 bg-slate-800/80 backdrop-blur text-slate-300 p-3 rounded-lg text-xs max-w-md">
                <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <p>Assumes standard gravity (9.81 m/s²) and negligible air resistance. Trajectory follows perfect parabolas.</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}