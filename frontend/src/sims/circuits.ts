import { defineSim, num, str, bool } from './types';
import { circle, line, panel, text } from './draw';

function drawText(
  c: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  opts?: { color?: string; size?: number; align?: CanvasTextAlign; baseline?: CanvasTextBaseline; bold?: boolean }
) {
  text(c, s, x, y, opts?.color ?? '#e2e8f0', opts?.size ?? 12, opts?.align ?? 'left', opts?.baseline ?? 'alphabetic', opts?.bold ?? false);
}

function drawPanel(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts?: { fill?: string; stroke?: string }
) {
  panel(c, { x, y, w, h }, opts?.fill, opts?.stroke);
}

/* ================================================================== */
/*  Electronics Simulation 1: RLC Series Resonant Circuit             */
/* ================================================================== */

interface RLCState {
  t: number;
  historyV: number[];
  historyI: number[];
}

export const rlcResonance = defineSim<RLCState>({
  id: 'circuits-rlc-resonance',
  title: 'RLC AC Circuit & Resonance',
  subject: 'Electronics',
  category: 'Analog Electronics & AC Circuits',
  educationLevels: ['Class 12', 'B.Tech', 'B.Sc'],
  difficulty: 'Intermediate',
  topic: 'Alternating Current',
  subtopic: 'Series RLC Resonance & Phasors',
  learningObjectives: [
    'Observe resonance when source frequency matches the natural resonant frequency f₀ = 1/(2π√LC).',
    'Understand how inductive reactance X_L and capacitive reactance X_C vary with frequency.',
    'Analyze the impedance minimum, current peak, and phase angle shift between voltage and current.',
  ],
  assumptions: [
    'Ideal lumped linear components without parasitic resistance in inductor or leakage in capacitor.',
    'Steady-state sinusoidal excitation with zero harmonic distortion.',
  ],
  supportsSnapshot: true,
  supportsRestore: true,
  blurb: 'Explore series RLC resonance in AC circuits. Inspect live voltage and current waveforms, phase shifts, reactances, and phasor diagrams.',
  hint: 'At resonance (f = f₀), XL = XC, impedance Z reaches its minimum (= R), current I reaches its maximum, and the phase angle φ is 0°. Above resonance, the circuit is inductive; below resonance, it is capacitive.',
  params: [
    { kind: 'number', id: 'freq', label: 'Source Frequency (f)', min: 10, max: 2000, step: 10, value: 318, unit: 'Hz' },
    { kind: 'number', id: 'resistor', label: 'Resistance (R)', min: 5, max: 200, step: 5, value: 50, unit: 'Ω' },
    { kind: 'number', id: 'inductor', label: 'Inductance (L)', min: 5, max: 250, step: 5, value: 50, unit: 'mH' },
    { kind: 'number', id: 'capacitor', label: 'Capacitance (C)', min: 0.5, max: 50, step: 0.5, value: 5, unit: 'µF' },
    { kind: 'number', id: 'voltage', label: 'AC Peak Voltage (V₀)', min: 1, max: 24, step: 1, value: 10, unit: 'V' },
    { kind: 'toggle', id: 'showPhasor', label: 'Show Rotating Phasor Diagram', value: true },
  ],
  actions: [
    { id: 'tuneResonance', label: 'Tune to Resonance f₀' },
  ],
  init() {
    return { t: 0, historyV: [], historyI: [] };
  },
  action(_s, v, id) {
    if (id === 'tuneResonance') {
      const L = num(v, 'inductor') * 1e-3;
      const C = num(v, 'capacitor') * 1e-6;
      const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C));
      v['freq'] = Math.round(f0);
    }
  },
  step(s, v, dt) {
    const f = num(v, 'freq');
    const R = num(v, 'resistor');
    const L = num(v, 'inductor') * 1e-3;
    const C = num(v, 'capacitor') * 1e-6;
    const V0 = num(v, 'voltage');

    const omega = 2 * Math.PI * f;
    const XL = omega * L;
    const XC = 1 / (omega * C);
    const Z = Math.sqrt(R * R + (XL - XC) * (XL - XC));
    const I0 = V0 / Z;
    const phi = Math.atan2(XL - XC, R);

    s.t += dt;
    const vNow = V0 * Math.sin(omega * s.t);
    const iNow = I0 * Math.sin(omega * s.t - phi);

    s.historyV.push(vNow);
    s.historyI.push(iNow);
    if (s.historyV.length > 200) {
      s.historyV.shift();
      s.historyI.shift();
    }
  },
  draw(c, s, v, w, h) {
    const f = num(v, 'freq');
    const R = num(v, 'resistor');
    const L = num(v, 'inductor') * 1e-3;
    const C = num(v, 'capacitor') * 1e-6;
    const V0 = num(v, 'voltage');
    const showPhasor = bool(v, 'showPhasor');

    const omega = 2 * Math.PI * f;
    const XL = omega * L;
    const XC = 1 / (omega * C);
    const Z = Math.sqrt(R * R + (XL - XC) * (XL - XC));
    const I0 = V0 / Z;
    const phi = Math.atan2(XL - XC, R);
    const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C));

    // Dark background
    c.fillStyle = '#0a0e1a';
    c.fillRect(0, 0, w, h);

    // Waveform Scope area (left)
    const scopeW = showPhasor ? w * 0.6 : w - 40;
    const scopeH = h * 0.52;
    const scopeX = 20;
    const scopeY = 20;

    drawPanel(c, scopeX, scopeY, scopeW, scopeH, { fill: '#0f172a', stroke: '#334155' });

    // Scope center line
    const midY = scopeY + scopeH / 2;
    c.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    c.lineWidth = 1;
    line(c, scopeX, midY, scopeX + scopeW, midY);

    // Plot Voltage & Current Waves
    if (s.historyV.length > 2) {
      // Voltage wave (Amber)
      c.strokeStyle = '#f59e0b';
      c.lineWidth = 2.5;
      c.beginPath();
      for (let i = 0; i < s.historyV.length; i++) {
        const x = scopeX + (i / s.historyV.length) * scopeW;
        const y = midY - (s.historyV[i] / (V0 || 1)) * (scopeH * 0.38);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();

      // Current wave (Cyan)
      c.strokeStyle = '#38bdf8';
      c.lineWidth = 2.5;
      c.beginPath();
      for (let i = 0; i < s.historyI.length; i++) {
        const x = scopeX + (i / s.historyI.length) * scopeW;
        const normI = I0 > 0 ? (s.historyI[i] / I0) : 0;
        const y = midY - normI * (scopeH * 0.38);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }

    // Scope legend
    c.fillStyle = '#f59e0b';
    c.fillRect(scopeX + 16, scopeY + 16, 12, 4);
    drawText(c, `Voltage V(t) [Peak = ${V0.toFixed(1)} V]`, scopeX + 34, scopeY + 20, { color: '#f59e0b', size: 10, bold: true });

    c.fillStyle = '#38bdf8';
    c.fillRect(scopeX + 220, scopeY + 16, 12, 4);
    drawText(c, `Current I(t) [Peak = ${(I0 * 1000).toFixed(1)} mA]`, scopeX + 238, scopeY + 20, { color: '#38bdf8', size: 10, bold: true });

    // Phasor Diagram (right side)
    if (showPhasor) {
      const pX = scopeX + scopeW + 20;
      const pW = w - pX - 20;
      const pY = scopeY;
      const pH = scopeH;
      const pcX = pX + pW / 2;
      const pcY = pY + pH / 2;

      drawPanel(c, pX, pY, pW, pH, { fill: '#0f172a', stroke: '#334155' });
      drawText(c, 'Phasor Plane', pX + 12, pY + 20, { color: '#94a3b8', size: 10, bold: true });

      // Axes
      c.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      line(c, pX + 10, pcY, pX + pW - 10, pcY);
      line(c, pcX, pY + 10, pcX, pY + pH - 10);

      // Rotating angle
      const curAng = omega * s.t;
      const vLen = Math.min(pW, pH) * 0.38;
      const iLen = vLen * 0.85;

      // Voltage Phasor (Amber)
      const vx = pcX + vLen * Math.cos(curAng);
      const vy = pcY - vLen * Math.sin(curAng);
      c.strokeStyle = '#f59e0b';
      c.lineWidth = 3;
      line(c, pcX, pcY, vx, vy);
      circle(c, vx, vy, 4);
      c.fillStyle = '#f59e0b';
      c.fill();
      drawText(c, 'V', vx + 6, vy - 6, { color: '#f59e0b', size: 11, bold: true });

      // Current Phasor (Cyan) lagging by phi
      const ix = pcX + iLen * Math.cos(curAng - phi);
      const iy = pcY - iLen * Math.sin(curAng - phi);
      c.strokeStyle = '#38bdf8';
      c.lineWidth = 2.5;
      line(c, pcX, pcY, ix, iy);
      circle(c, ix, iy, 4);
      c.fillStyle = '#38bdf8';
      c.fill();
      drawText(c, 'I', ix + 6, iy - 6, { color: '#38bdf8', size: 11, bold: true });
    }

    // Circuit schematic & parameters panel (bottom)
    const botY = scopeY + scopeH + 16;
    const botH = h - botY - 16;
    drawPanel(c, 20, botY, w - 40, botH, { fill: '#0f172a', stroke: '#334155' });

    // Resonance proximity indicator
    const freqRatio = f / f0;
    const isAtResonance = Math.abs(freqRatio - 1) < 0.04;
    const statusColor = isAtResonance ? '#10b981' : freqRatio > 1 ? '#38bdf8' : '#f59e0b';
    const statusText = isAtResonance
      ? 'RESONANCE! XL ≈ XC, Minimum Impedance (Z = R), Maximum Current.'
      : freqRatio > 1
      ? `Inductive Region (f > f₀): XL > XC (${XL.toFixed(1)} > ${XC.toFixed(1)} Ω), Current lags Voltage.`
      : `Capacitive Region (f < f₀): XC > XL (${XC.toFixed(1)} > ${XL.toFixed(1)} Ω), Current leads Voltage.`;

    drawText(c, `Circuit State:`, 36, botY + 24, { color: '#94a3b8', size: 11 });
    drawText(c, statusText, 120, botY + 24, { color: statusColor, size: 11, bold: true });

    // Key quantities display
    drawText(c, `Resonant f₀: ${f0.toFixed(1)} Hz`, 36, botY + 48, { color: '#10b981', size: 12, bold: true });
    drawText(c, `Total Impedance Z: ${Z.toFixed(1)} Ω`, 220, botY + 48, { color: '#f8fafc', size: 12 });
    drawText(c, `Peak Current I₀: ${(I0 * 1000).toFixed(1)} mA`, 420, botY + 48, { color: '#38bdf8', size: 12, bold: true });
    drawText(c, `Phase Angle φ: ${(phi * 180 / Math.PI).toFixed(1)}°`, 620, botY + 48, { color: '#fbbf24', size: 12 });
  },
  readouts(_s, v) {
    const f = num(v, 'freq');
    const R = num(v, 'resistor');
    const L = num(v, 'inductor') * 1e-3;
    const C = num(v, 'capacitor') * 1e-6;
    const V0 = num(v, 'voltage');

    const omega = 2 * Math.PI * f;
    const XL = omega * L;
    const XC = 1 / (omega * C);
    const Z = Math.sqrt(R * R + (XL - XC) * (XL - XC));
    const I0 = V0 / Z;
    const phi = Math.atan2(XL - XC, R);
    const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C));
    const Q = (1 / R) * Math.sqrt(L / C);

    return [
      { label: 'Source Frequency (f)', value: f, unit: 'Hz', digits: 1 },
      { label: 'Resonant Frequency (f₀)', value: f0, unit: 'Hz', digits: 1 },
      { label: 'Inductive Reactance (X_L)', value: XL, unit: 'Ω', digits: 1 },
      { label: 'Capacitive Reactance (X_C)', value: XC, unit: 'Ω', digits: 1 },
      { label: 'Circuit Impedance (Z)', value: Z, unit: 'Ω', digits: 1 },
      { label: 'Peak Current (I₀)', value: I0 * 1000, unit: 'mA', digits: 2 },
      { label: 'Phase Angle (φ)', value: phi * 180 / Math.PI, unit: '°', digits: 1 },
      { label: 'Quality Factor (Q)', value: Q, digits: 2 },
    ];
  },
  equations(_s, v) {
    const f = num(v, 'freq');
    const R = num(v, 'resistor');
    const L = num(v, 'inductor') * 1e-3;
    const C = num(v, 'capacitor') * 1e-6;
    const omega = 2 * Math.PI * f;
    const XL = (omega * L).toFixed(1);
    const XC = (1 / (omega * C)).toFixed(1);
    const Z = Math.sqrt(R * R + Math.pow(omega * L - 1 / (omega * C), 2)).toFixed(1);
    const f0 = (1 / (2 * Math.PI * Math.sqrt(L * C))).toFixed(1);

    return [
      `f_0 = \\frac{1}{2\\pi\\sqrt{LC}} = \\frac{1}{2\\pi\\sqrt{(${num(v, 'inductor')}\\text{mH})(${num(v, 'capacitor')}\\mu\\text{F})}} = ${f0}\\text{ Hz}`,
      `Z = \\sqrt{R^2 + (X_L - X_C)^2} = \\sqrt{${R}^2 + (${XL} - ${XC})^2} = ${Z}\\ \\Omega`,
      `I_0 = \\frac{V_0}{Z}, \\quad \\tan\\phi = \\frac{X_L - X_C}{R}, \\quad Q = \\frac{1}{R}\\sqrt{\\frac{L}{C}}`,
    ];
  },
});

/* ================================================================== */
/*  Electronics Simulation 2: Digital Logic Gates & Truth Table       */
/* ================================================================== */

interface LogicState {
  t: number;
}

const GATE_NAMES = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR'];

function evalGate(type: string, a: boolean, b: boolean): boolean {
  switch (type) {
    case 'AND': return a && b;
    case 'OR': return a || b;
    case 'NOT': return !a;
    case 'NAND': return !(a && b);
    case 'NOR': return !(a || b);
    case 'XOR': return (a || b) && !(a && b);
    case 'XNOR': return !((a || b) && !(a && b));
    default: return false;
  }
}

export const logicGates = defineSim<LogicState>({
  id: 'circuits-digital-logic',
  title: 'Digital Logic Gates & Truth Tables',
  subject: 'Electronics',
  category: 'Digital Electronics & Computer Science',
  educationLevels: ['Class 10', 'Class 11', 'Class 12', 'BCA', 'B.Tech'],
  difficulty: 'Beginner',
  topic: 'Digital Logic',
  subtopic: 'Boolean Algebra & Logic Gates',
  learningObjectives: [
    'Understand fundamental digital logic gates: AND, OR, NOT, NAND, NOR, XOR, XNOR.',
    'Test inputs A and B and observe immediate boolean logic outputs and truth table rows.',
    'Distinguish between universal gates (NAND, NOR) and arithmetic logic gates (XOR).',
  ],
  assumptions: [
    'Ideal CMOS/TTL voltage thresholds without propagation delay or race conditions.',
  ],
  supportsSnapshot: true,
  supportsRestore: true,
  blurb: 'Experiment with boolean logic gates, toggle digital inputs A and B, and verify complete live truth tables with circuit symbols.',
  hint: 'Toggle Input A and Input B, or change the gate type. NAND and NOR are universal gates because any digital logic circuit can be built entirely using them.',
  params: [
    {
      kind: 'select',
      id: 'gate',
      label: 'Logic Gate Type',
      value: 'AND',
      options: GATE_NAMES.map(g => ({ value: g, label: `${g} Gate` })),
    },
    { kind: 'toggle', id: 'inputA', label: 'Input A (HIGH = 1 / LOW = 0)', value: true },
    { kind: 'toggle', id: 'inputB', label: 'Input B (HIGH = 1 / LOW = 0)', value: false },
  ],
  init() {
    return { t: 0 };
  },
  step(s, _v, dt) {
    s.t += dt;
  },
  draw(c, _s, v, w, h) {
    const gate = str(v, 'gate');
    const inA = bool(v, 'inputA');
    const inB = bool(v, 'inputB');
    const out = evalGate(gate, inA, inB);

    c.fillStyle = '#0f172a';
    c.fillRect(0, 0, w, h);

    // Left side: Interactive Schematic
    const schW = w * 0.52;
    drawPanel(c, 16, 16, schW, h - 32, { fill: '#1e293b', stroke: '#334155' });
    drawText(c, `${gate} Logic Gate Schematic`, 32, 40, { color: '#f8fafc', size: 14, bold: true });

    const gx = 16 + schW * 0.52;
    const gy = h * 0.48;

    // Input wires
    const inAy = gy - 32;
    const inBy = gy + 32;

    // Wire A
    c.strokeStyle = inA ? '#10b981' : '#64748b';
    c.lineWidth = 3;
    line(c, 40, inAy, gx - 45, inAy);
    circle(c, 40, inAy, 8);
    c.fillStyle = inA ? '#10b981' : '#334155';
    c.fill();
    drawText(c, `A: ${inA ? '1 (HIGH)' : '0 (LOW)'}`, 54, inAy + 4, { color: inA ? '#34d399' : '#94a3b8', size: 11, bold: true });

    // Wire B (only if not NOT gate)
    if (gate !== 'NOT') {
      c.strokeStyle = inB ? '#10b981' : '#64748b';
      c.lineWidth = 3;
      line(c, 40, inBy, gx - 45, inBy);
      circle(c, 40, inBy, 8);
      c.fillStyle = inB ? '#10b981' : '#334155';
      c.fill();
      drawText(c, `B: ${inB ? '1 (HIGH)' : '0 (LOW)'}`, 54, inBy + 4, { color: inB ? '#34d399' : '#94a3b8', size: 11, bold: true });
    }

    // Gate symbol box
    c.fillStyle = '#0f172a';
    c.strokeStyle = '#f59e0b';
    c.lineWidth = 3;
    c.beginPath();
    c.roundRect(gx - 45, gy - 55, 90, 110, 12);
    c.fill();
    c.stroke();

    drawText(c, gate, gx - 18, gy + 6, { color: '#fbbf24', size: 16, bold: true });

    // Invert bubble for NAND, NOR, XNOR, NOT
    if (['NAND', 'NOR', 'XNOR', 'NOT'].includes(gate)) {
      circle(c, gx + 49, gy, 5);
      c.fillStyle = '#0f172a';
      c.strokeStyle = '#f59e0b';
      c.lineWidth = 2;
      c.fill();
      c.stroke();
    }

    // Output wire
    const outStartX = ['NAND', 'NOR', 'XNOR', 'NOT'].includes(gate) ? gx + 54 : gx + 45;
    const outEndX = 16 + schW - 35;
    c.strokeStyle = out ? '#10b981' : '#ef4444';
    c.lineWidth = 4;
    line(c, outStartX, gy, outEndX, gy);

    // Output LED indicator
    circle(c, outEndX, gy, 14);
    c.fillStyle = out ? '#10b981' : '#ef4444';
    c.fill();
    circle(c, outEndX, gy, 18);
    c.strokeStyle = out ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.4)';
    c.stroke();

    drawText(c, `OUTPUT Q: ${out ? '1 (HIGH)' : '0 (LOW)'}`, outStartX + 10, gy - 16, {
      color: out ? '#34d399' : '#f87171',
      size: 12,
      bold: true,
    });

    // Right side: Truth Table
    const ttX = schW + 32;
    const ttW = w - ttX - 16;
    drawPanel(c, ttX, 16, ttW, h - 32, { fill: '#1e293b', stroke: '#334155' });
    drawText(c, 'Truth Table', ttX + 16, 40, { color: '#f8fafc', size: 14, bold: true });

    const rows = gate === 'NOT'
      ? [[false, !false], [true, !true]]
      : [
          [false, false, evalGate(gate, false, false)],
          [false, true, evalGate(gate, false, true)],
          [true, false, evalGate(gate, true, false)],
          [true, true, evalGate(gate, true, true)],
        ];

    // Table Header
    const rowStartY = 75;
    c.fillStyle = '#0f172a';
    c.fillRect(ttX + 16, rowStartY, ttW - 32, 28);
    c.fillStyle = '#94a3b8';

    if (gate === 'NOT') {
      drawText(c, 'Input A', ttX + 36, rowStartY + 18, { color: '#94a3b8', size: 11, bold: true });
      drawText(c, 'Output Q', ttX + 140, rowStartY + 18, { color: '#94a3b8', size: 11, bold: true });
    } else {
      drawText(c, 'Input A', ttX + 36, rowStartY + 18, { color: '#94a3b8', size: 11, bold: true });
      drawText(c, 'Input B', ttX + 100, rowStartY + 18, { color: '#94a3b8', size: 11, bold: true });
      drawText(c, 'Output Q', ttX + 170, rowStartY + 18, { color: '#94a3b8', size: 11, bold: true });
    }

    // Table Rows
    rows.forEach((r, idx) => {
      const ry = rowStartY + 36 + idx * 34;
      const isActiveRow = gate === 'NOT' ? (r[0] === inA) : (r[0] === inA && r[1] === inB);

      if (isActiveRow) {
        c.fillStyle = 'rgba(245, 158, 11, 0.2)';
        c.fillRect(ttX + 16, ry - 6, ttW - 32, 28);
        c.strokeStyle = '#f59e0b';
        c.lineWidth = 1;
        c.strokeRect(ttX + 16, ry - 6, ttW - 32, 28);
      }

      if (gate === 'NOT') {
        const aVal = r[0] ? '1' : '0';
        const qVal = r[1] ? '1' : '0';
        drawText(c, aVal, ttX + 50, ry + 12, { color: isActiveRow ? '#fbbf24' : '#f8fafc', size: 12, bold: isActiveRow });
        drawText(c, qVal, ttX + 155, ry + 12, { color: r[1] ? '#34d399' : '#f87171', size: 12, bold: true });
      } else {
        const aVal = r[0] ? '1' : '0';
        const bVal = r[1] ? '1' : '0';
        const qVal = r[2] ? '1' : '0';
        drawText(c, aVal, ttX + 50, ry + 12, { color: isActiveRow ? '#fbbf24' : '#f8fafc', size: 12, bold: isActiveRow });
        drawText(c, bVal, ttX + 115, ry + 12, { color: isActiveRow ? '#fbbf24' : '#f8fafc', size: 12, bold: isActiveRow });
        drawText(c, qVal, ttX + 185, ry + 12, { color: r[2] ? '#34d399' : '#f87171', size: 12, bold: true });
      }
    });
  },
  readouts(_s, v) {
    const gate = str(v, 'gate');
    const inA = bool(v, 'inputA');
    const inB = bool(v, 'inputB');
    const out = evalGate(gate, inA, inB);

    return [
      { label: 'Gate Selected', value: `${gate}` },
      { label: 'Input A', value: inA ? '1 (HIGH)' : '0 (LOW)' },
      { label: 'Input B', value: gate === 'NOT' ? 'N/A' : (inB ? '1 (HIGH)' : '0 (LOW)') },
      { label: 'Output (Q)', value: out ? '1 (HIGH)' : '0 (LOW)' },
      { label: 'Boolean Expression', value: gate === 'NOT' ? 'Q = ¬A' : gate === 'AND' ? 'Q = A · B' : gate === 'OR' ? 'Q = A + B' : gate === 'XOR' ? 'Q = A ⊕ B' : `Q = ${gate}(A, B)` },
    ];
  },
  equations(_s, v) {
    const gate = str(v, 'gate');
    const inA = bool(v, 'inputA') ? '1' : '0';
    const inB = bool(v, 'inputB') ? '1' : '0';
    const out = evalGate(gate, bool(v, 'inputA'), bool(v, 'inputB')) ? '1' : '0';

    if (gate === 'NOT') return [`Q = \\overline{A} = \\overline{${inA}} = ${out}`];
    if (gate === 'AND') return [`Q = A \\cdot B = ${inA} \\cdot ${inB} = ${out}`];
    if (gate === 'OR') return [`Q = A + B = ${inA} + ${inB} = ${out}`];
    if (gate === 'NAND') return [`Q = \\overline{A \\cdot B} = \\overline{${inA} \\cdot ${inB}} = ${out}`];
    if (gate === 'NOR') return [`Q = \\overline{A + B} = \\overline{${inA} + ${inB}} = ${out}`];
    if (gate === 'XOR') return [`Q = A \\oplus B = (A\\overline{B} + \\overline{A}B) = ${inA} \\oplus ${inB} = ${out}`];
    return [`Q = \\overline{A \\oplus B} = ${out}`];
  },
});
