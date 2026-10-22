import { defineSim, num, str, bool } from './types';
import { circle, line, panel, text, clamp } from './draw';

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

interface DLState {
  w1: number;
  w2: number;
  v1: number;
  v2: number;
  grad1: number;
  grad2: number;
  loss: number;
  history: { w1: number; w2: number; loss: number }[];
  stepCount: number;
  isDragging: boolean;
}

function computeLossAndGrad(w1: number, w2: number, surface: string): { loss: number; g1: number; g2: number } {
  if (surface === 'rosenbrock') {
    // Banana / Rosenbrock function: (1 - w1)^2 + 100 * (w2 - w1^2)^2 (scaled down for visualization)
    const scale = 0.1;
    const a = 1 - w1;
    const b = w2 - w1 * w1;
    const loss = scale * (a * a + 10 * b * b);
    const g1 = scale * (-2 * a - 40 * b * w1);
    const g2 = scale * (20 * b);
    return { loss, g1: clamp(g1, -20, 20), g2: clamp(g2, -20, 20) };
  } else if (surface === 'saddle_point') {
    // Saddle surface: w1^2 - w2^2 + 0.5 * w2^4
    const loss = 0.5 * (w1 * w1 - 0.8 * w2 * w2 + 0.2 * Math.pow(w2, 4) + 2);
    const g1 = w1;
    const g2 = -0.8 * w2 + 0.8 * Math.pow(w2, 3);
    return { loss, g1: clamp(g1, -15, 15), g2: clamp(g2, -15, 15) };
  } else {
    // Convex quadratic bowl: 0.5 * (2*w1^2 + 0.8*w2^2)
    const loss = 0.5 * (2.2 * w1 * w1 + 0.9 * w2 * w2);
    const g1 = 2.2 * w1;
    const g2 = 0.9 * w2;
    return { loss, g1, g2 };
  }
}

export const deepLearningOpt = defineSim<DLState>({
  id: 'deep-learning-opt',
  title: 'Neural Network Loss Surface & Gradient Descent',
  subject: 'Computer Science',
  category: 'Machine Learning & Optimization',
  educationLevels: ['B.Tech', 'B.Sc', 'M.Tech', 'M.Sc'],
  difficulty: 'Advanced',
  topic: 'Machine Learning',
  subtopic: 'Gradient Descent Optimization',
  status: 'active',
  learningObjectives: [
    'Observe how learning rate η governs convergence, oscillations, or divergence in loss surfaces.',
    'Compare Standard SGD with Momentum-based trajectory smoothing.',
    'Examine local gradients ∇L(w₁, w₂) and the geometric path across quadratic bowls and saddle points.',
    'Understand that high-dimensional neural losses differ from 2D convex toy surfaces.',
  ],
  assumptions: [
    '2D educational parameter space representing two weight parameters (w₁, w₂).',
    'Continuous, differentiable loss functions computed on batch synthetic targets.',
    'Real bounded numerical updates; not an empirical benchmark for production deep networks.',
  ],
  supportsSnapshot: true,
  supportsRestore: true,
  blurb: 'Visualize gradient descent across 2D neural network loss surfaces. Adjust learning rate, switch between SGD and Momentum, inspect parameter trajectories, and track convergence.',
  hint: 'Drag the yellow parameter marker to any position on the contour map. Increase the learning rate to see overshoot oscillations, or enable momentum to bypass shallow valleys.',
  params: [
    {
      kind: 'select',
      id: 'surface',
      label: 'Loss Surface',
      value: 'quadratic',
      options: [
        { value: 'quadratic', label: 'Convex Quadratic Bowl' },
        { value: 'rosenbrock', label: 'Rosenbrock Valley' },
        { value: 'saddle_point', label: 'Non-Convex Saddle Point' },
      ],
      resetOnChange: true,
    },
    {
      kind: 'select',
      id: 'optimizer',
      label: 'Optimization Algorithm',
      value: 'sgd',
      options: [
        { value: 'sgd', label: 'Standard SGD (w = w - η∇L)' },
        { value: 'momentum', label: 'Polyak Momentum (β = 0.85)' },
      ],
    },
    {
      kind: 'number',
      id: 'lr',
      label: 'Learning Rate (η)',
      min: 0.01,
      max: 0.8,
      step: 0.01,
      value: 0.08,
      digits: 2,
      help: 'Large η causes oscillation or divergence; small η converges very slowly.',
    },
    {
      kind: 'toggle',
      id: 'showVectors',
      label: 'Show Gradient Vectors',
      value: true,
    },
    {
      kind: 'toggle',
      id: 'showPath',
      label: 'Show Parameter History Path',
      value: true,
    },
  ],
  actions: [
    { id: 'step', label: 'Single Step' },
    { id: 'reset', label: 'Reset Weights' },
  ],
  derivation: {
    targetEquation: 'w_{t+1} = w_t - \\eta \\nabla L(w_t)',
    problemStatement: 'Derivation of First-Order Gradient Descent Parameter Update Rule',
    assumptions: [
      'Loss function L(w) is continuously differentiable with Lipschitz-continuous gradients.',
      'Learning rate η is sufficiently small: 0 < η < 2/L_max.',
      'Direction of steepest descent is given by the negative gradient -∇L(w).',
    ],
    variableDefinitions: [
      { symbol: 'w_t', meaning: 'Model parameter vector at step t', unit: 'dimensionless' },
      { symbol: 'L(w)', meaning: 'Scalar loss / objective function', unit: 'loss units' },
      { symbol: '\\nabla L(w)', meaning: 'Gradient vector [∂L/∂w₁, ∂L/∂w₂]ᵀ', unit: 'loss/weight' },
      { symbol: '\\eta', meaning: 'Learning rate (step size hyperparameter)', unit: 'step scale' },
      { symbol: 'v_t', meaning: 'Momentum velocity buffer', unit: 'velocity' },
    ],
    startingPrinciple: 'First-order Taylor expansion of multivariate loss L(w + Δw)',
    steps: [
      {
        stepNumber: 1,
        title: 'First-Order Taylor Series Expansion',
        math: 'L(w + \\Delta w) \\approx L(w) + \\nabla L(w)^T \\Delta w',
        explanation: 'For a tiny parameter perturbation Δw, the change in loss ΔL is governed by the inner product of the gradient and the step direction.',
        justification: 'Higher-order terms O(||Δw||²) are negligible in a sufficiently small local neighborhood.',
        intermediateResult: '\\Delta L \\approx \\nabla L(w)^T \\Delta w',
        highlightKey: 'gradient',
      },
      {
        stepNumber: 2,
        title: 'Maximizing Loss Decrease (Steepest Descent)',
        math: '\\min_{\\|\\Delta w\\| \\le \\epsilon} \\nabla L(w)^T \\Delta w \\implies \\Delta w^* = -\\epsilon \\frac{\\nabla L(w)}{\\|\\nabla L(w)\\|}',
        explanation: 'By the Cauchy-Schwarz inequality, the inner product is minimized when Δw points directly opposite to the gradient ∇L(w).',
        justification: 'The unit vector maximizing negative rate of change is -∇L / ||∇L||.',
        intermediateResult: 'u^* = -\\frac{\\nabla L}{\\|\\nabla L\\|}',
      },
      {
        stepNumber: 3,
        title: 'Proportional Step Size and Update Rule',
        math: 'w_{t+1} = w_t - \\eta \\nabla L(w_t)',
        explanation: 'Scaling the perturbation proportionally to the gradient magnitude yields the standard Gradient Descent update equation.',
        justification: 'Near stationary points where ||∇L|| → 0, updates automatically diminish, preventing endless overshoot.',
        intermediateResult: 'w_{t+1} - w_t = -\\eta \\nabla L(w_t)',
      },
      {
        stepNumber: 4,
        title: 'Momentum Extension for Valleys and Oscillation',
        math: 'v_{t+1} = \\beta v_t + \\eta \\nabla L(w_t), \\quad w_{t+1} = w_t - v_{t+1}',
        explanation: 'Momentum maintains an exponentially decaying running average of past gradients, dampening oscillations perpendicular to ravines.',
        justification: 'Acts as physical inertia (mass), allowing parameters to push through flat plateaus and saddle regions.',
        intermediateResult: 'v_{t+1} = \\beta v_t + \\eta \\nabla L(w_t)',
      },
    ],
    finalResult: 'w_{t+1} = w_t - \\eta \\nabla L(w_t) \\quad \\text{with} \\quad \\lim_{t \\to \\infty} \\nabla L(w_t) = \\mathbf{0}',
    dimensionalCheck: 'Dimension of Δw matches parameter vector w; η has dimensions of [weight] / [loss/weight] = [weight² / loss].',
    physicalInterpretation: 'Parameters roll down the loss landscape like a heavy ball influenced by gravity and viscous friction.',
  },
  dt: 1 / 60,
  previewSeconds: 1.5,
  init(v) {
    const surface = str(v, 'surface');
    const startW1 = surface === 'rosenbrock' ? -1.2 : surface === 'saddle_point' ? 0.3 : 2.2;
    const startW2 = surface === 'rosenbrock' ? 1.0 : surface === 'saddle_point' ? -1.8 : 2.0;
    const { loss, g1, g2 } = computeLossAndGrad(startW1, startW2, surface);
    return {
      w1: startW1,
      w2: startW2,
      v1: 0,
      v2: 0,
      grad1: g1,
      grad2: g2,
      loss,
      history: [{ w1: startW1, w2: startW2, loss }],
      stepCount: 0,
      isDragging: false,
    };
  },
  step(s, v, _dt) {
    if (s.isDragging) return;

    // Perform an optimization step every 2 frames for clear visualization
    const surface = str(v, 'surface');
    const optimizer = str(v, 'optimizer');
    const lr = num(v, 'lr');

    const { loss, g1, g2 } = computeLossAndGrad(s.w1, s.w2, surface);
    s.loss = loss;
    s.grad1 = g1;
    s.grad2 = g2;

    if (optimizer === 'momentum') {
      const beta = 0.85;
      s.v1 = beta * s.v1 + lr * g1;
      s.v2 = beta * s.v2 + lr * g2;
      s.w1 -= s.v1;
      s.w2 -= s.v2;
    } else {
      s.w1 -= lr * g1;
      s.w2 -= lr * g2;
    }

    s.w1 = clamp(s.w1, -3.2, 3.2);
    s.w2 = clamp(s.w2, -3.2, 3.2);

    s.stepCount++;
    if (s.history.length > 250) s.history.shift();
    s.history.push({ w1: s.w1, w2: s.w2, loss: s.loss });
  },
  action(s, v, id) {
    if (id === 'reset') {
      const surface = str(v, 'surface');
      s.w1 = surface === 'rosenbrock' ? -1.2 : surface === 'saddle_point' ? 0.3 : 2.2;
      s.w2 = surface === 'rosenbrock' ? 1.0 : surface === 'saddle_point' ? -1.8 : 2.0;
      s.v1 = 0;
      s.v2 = 0;
      s.history = [{ w1: s.w1, w2: s.w2, loss: s.loss }];
      s.stepCount = 0;
    } else if (id === 'step') {
      const surface = str(v, 'surface');
      const optimizer = str(v, 'optimizer');
      const lr = num(v, 'lr');
      const { loss, g1, g2 } = computeLossAndGrad(s.w1, s.w2, surface);
      s.loss = loss;
      s.grad1 = g1;
      s.grad2 = g2;
      if (optimizer === 'momentum') {
        const beta = 0.85;
        s.v1 = beta * s.v1 + lr * g1;
        s.v2 = beta * s.v2 + lr * g2;
        s.w1 -= s.v1;
        s.w2 -= s.v2;
      } else {
        s.w1 -= lr * g1;
        s.w2 -= lr * g2;
      }
      s.w1 = clamp(s.w1, -3.2, 3.2);
      s.w2 = clamp(s.w2, -3.2, 3.2);
      s.stepCount++;
      s.history.push({ w1: s.w1, w2: s.w2, loss: s.loss });
    }
  },
  pointer(s, _v, e) {
    // Map mouse click to contour area
    const contourW = e.w * 0.58;
    const contourH = e.h * 0.72;
    const originX = contourW / 2;
    const originY = 30 + contourH / 2;

    if (e.kind === 'down' || e.kind === 'move') {
      if (e.x < contourW && e.y >= 30 && e.y <= 30 + contourH) {
        if (e.kind === 'down') s.isDragging = true;
        if (s.isDragging) {
          const scale = 50;
          s.w1 = clamp((e.x - originX) / scale, -3, 3);
          s.w2 = clamp(-(e.y - originY) / scale, -3, 3);
          s.v1 = 0;
          s.v2 = 0;
          s.history = [{ w1: s.w1, w2: s.w2, loss: s.loss }];
        }
      }
    } else if (e.kind === 'up') {
      s.isDragging = false;
    }
  },
  draw(c, s, v, w, h) {
    c.fillStyle = '#0f172a';
    c.fillRect(0, 0, w, h);

    const surface = str(v, 'surface');
    const showVectors = bool(v, 'showVectors');
    const showPath = bool(v, 'showPath');

    // 1. CONTOUR LANDSCAPE (Left 60% of canvas)
    const contourW = Math.min(w * 0.58, 480);
    const contourH = Math.min(h * 0.72, 360);
    const originX = contourW / 2;
    const originY = 30 + contourH / 2;
    const scale = 50;

    drawPanel(c, 10, 10, contourW - 10, contourH + 30, { fill: '#1e293b', stroke: '#334155' });
    drawText(c, `2D Parameter Space (w₁, w₂) — ${surface}`, 20, 26, { color: '#f59e0b', size: 12, bold: true });

    // Draw grid axes
    c.strokeStyle = '#334155';
    c.lineWidth = 1;
    line(c, 20, originY, contourW - 10, originY, '#475569', 1);
    line(c, originX, 35, originX, 30 + contourH, '#475569', 1);

    drawText(c, 'w₁ →', contourW - 35, originY - 6, { color: '#94a3b8', size: 10 });
    drawText(c, 'w₂ ↑', originX + 6, 45, { color: '#94a3b8', size: 10 });

    // Render contour rings
    c.save();
    c.beginPath();
    c.rect(12, 32, contourW - 14, contourH + 6);
    c.clip();

    // Sample contour rings
    const ringLevels = [0.1, 0.4, 0.9, 1.8, 3.2, 5.0, 7.5];
    ringLevels.forEach((level, idx) => {
      c.strokeStyle = `rgba(59, 130, 246, ${0.15 + idx * 0.08})`;
      c.lineWidth = 1;
      c.beginPath();
      for (let th = 0; th <= Math.PI * 2; th += 0.1) {
        let r1 = 0;
        let r2 = 0;
        if (surface === 'rosenbrock') {
          r1 = Math.cos(th) * Math.sqrt(level * 3);
          r2 = r1 * r1 + Math.sin(th) * Math.sqrt(level * 0.5);
        } else if (surface === 'saddle_point') {
          r1 = Math.cos(th) * Math.sqrt(level * 2);
          r2 = Math.sin(th) * Math.sqrt(level * 1.5);
        } else {
          r1 = Math.cos(th) * Math.sqrt(level / 1.1);
          r2 = Math.sin(th) * Math.sqrt(level / 0.45);
        }
        const px = originX + r1 * scale;
        const py = originY - r2 * scale;
        if (th === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
      c.stroke();
    });

    // Draw Trajectory Path
    if (showPath && s.history.length > 1) {
      c.strokeStyle = '#f59e0b';
      c.lineWidth = 2;
      c.beginPath();
      s.history.forEach((pt, i) => {
        const px = originX + pt.w1 * scale;
        const py = originY - pt.w2 * scale;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      });
      c.stroke();

      // Draw faint step dots
      s.history.forEach((pt, i) => {
        if (i % 3 === 0) {
          const px = originX + pt.w1 * scale;
          const py = originY - pt.w2 * scale;
          circle(c, px, py, 2, '#d97706');
        }
      });
    }

    // Current point marker
    const curX = originX + s.w1 * scale;
    const curY = originY - s.w2 * scale;

    // Glowing circle
    circle(c, curX, curY, 8, '#f59e0b', '#ffffff', 2);
    circle(c, curX, curY, 13, undefined, 'rgba(245, 158, 11, 0.4)', 2);

    // Draw gradient vector arrow
    if (showVectors) {
      const arrowLen = Math.min(Math.hypot(s.grad1, s.grad2) * 14, 55);
      const angle = Math.atan2(-s.grad2, s.grad1);
      // Arrow points in NEGATIVE gradient direction (descent)
      const targetX = curX - Math.cos(angle) * arrowLen;
      const targetY = curY + Math.sin(angle) * arrowLen;

      c.strokeStyle = '#ef4444';
      c.lineWidth = 2.5;
      line(c, curX, curY, targetX, targetY, '#ef4444', 2.5);
      circle(c, targetX, targetY, 3, '#ef4444');
      drawText(c, '-∇L', targetX + 4, targetY - 4, { color: '#ef4444', size: 10, bold: true });
    }

    c.restore();

    // 2. FORWARD NEURAL NETWORK DIAGRAM (Right Panel)
    const rightX = contourW + 15;
    const rightW = w - rightX - 10;
    drawPanel(c, rightX, 10, rightW, 160, { fill: '#1e293b', stroke: '#334155' });
    drawText(c, 'Computation Graph & Feedforward Model', rightX + 12, 26, { color: '#38bdf8', size: 11, bold: true });

    // Neural nodes
    const nY1 = 65;
    const nY2 = 115;
    const inX = rightX + 35;
    const hX = rightX + rightW * 0.45;
    const outX = rightX + rightW - 40;

    // Inputs x1, x2
    circle(c, inX, nY1, 14, '#0f172a', '#38bdf8', 2);
    drawText(c, 'x₁', inX, nY1, { color: '#38bdf8', size: 11, align: 'center', baseline: 'middle', bold: true });
    circle(c, inX, nY2, 14, '#0f172a', '#38bdf8', 2);
    drawText(c, 'x₂', inX, nY2, { color: '#38bdf8', size: 11, align: 'center', baseline: 'middle', bold: true });

    // Hidden node (weighted sum)
    circle(c, hX, (nY1 + nY2) / 2, 18, '#0f172a', '#f59e0b', 2);
    drawText(c, 'Σ, σ', hX, (nY1 + nY2) / 2, { color: '#f59e0b', size: 11, align: 'center', baseline: 'middle', bold: true });

    // Output node
    circle(c, outX, (nY1 + nY2) / 2, 16, '#0f172a', '#10b981', 2);
    drawText(c, 'Loss', outX, (nY1 + nY2) / 2, { color: '#10b981', size: 10, align: 'center', baseline: 'middle', bold: true });

    // Synaptic connections with weights w1, w2
    line(c, inX + 14, nY1, hX - 18, (nY1 + nY2) / 2, '#94a3b8', 1.5);
    drawText(c, `w₁=${s.w1.toFixed(2)}`, (inX + hX) / 2 - 8, nY1 - 4, { color: '#f59e0b', size: 9 });

    line(c, inX + 14, nY2, hX - 18, (nY1 + nY2) / 2, '#94a3b8', 1.5);
    drawText(c, `w₂=${s.w2.toFixed(2)}`, (inX + hX) / 2 - 8, nY2 + 10, { color: '#f59e0b', size: 9 });

    line(c, hX + 18, (nY1 + nY2) / 2, outX - 16, (nY1 + nY2) / 2, '#10b981', 1.5);
    drawText(c, `ŷ`, (hX + outX) / 2, (nY1 + nY2) / 2 - 6, { color: '#10b981', size: 10 });

    // 3. LOSS HISTORY PLOT (Bottom Right)
    const plotY = 180;
    const plotH = h - plotY - 15;
    drawPanel(c, rightX, plotY, rightW, plotH, { fill: '#1e293b', stroke: '#334155' });
    drawText(c, 'Loss Curve L(w) over Iterations', rightX + 12, plotY + 16, { color: '#10b981', size: 11, bold: true });

    if (s.history.length > 1) {
      const maxL = Math.max(...s.history.map(pt => pt.loss), 1);
      const minL = Math.min(...s.history.map(pt => pt.loss), 0);
      const rangeL = Math.max(maxL - minL, 0.1);

      c.strokeStyle = '#10b981';
      c.lineWidth = 2;
      c.beginPath();
      s.history.forEach((pt, i) => {
        const px = rightX + 15 + (i / (s.history.length - 1)) * (rightW - 30);
        const py = plotY + plotH - 15 - ((pt.loss - minL) / rangeL) * (plotH - 40);
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      });
      c.stroke();

      drawText(c, `Current Loss: ${s.loss.toFixed(4)}`, rightX + 15, plotY + plotH - 6, { color: '#38bdf8', size: 10, bold: true });
      drawText(c, `Min: ${minL.toFixed(3)}`, rightX + rightW - 65, plotY + plotH - 6, { color: '#94a3b8', size: 9 });
    } else {
      drawText(c, 'Waiting for parameter steps...', rightX + 30, plotY + plotH / 2, { color: '#64748b', size: 11 });
    }
  },
  readouts(s, _v) {
    const gradMag = Math.hypot(s.grad1, s.grad2);
    return [
      { label: 'Loss L(w₁, w₂)', value: s.loss, digits: 4 },
      { label: 'Weight w₁', value: s.w1, digits: 3 },
      { label: 'Weight w₂', value: s.w2, digits: 3 },
      { label: '||∇L|| Gradient Norm', value: gradMag, digits: 3 },
      { label: 'Iteration Steps', value: s.stepCount },
      { label: 'Status', value: gradMag < 0.05 ? 'Converged at Min' : 'Optimizing Descent' },
    ];
  },
  equations(s, v) {
    const lr = num(v, 'lr');
    return [
      String.raw`w_{t+1} = w_t - \eta \nabla L(w_t)`,
      String.raw`\begin{bmatrix} w_1 \\ w_2 \end{bmatrix}_{t+1} = \begin{bmatrix} ${s.w1.toFixed(2)} \\ ${s.w2.toFixed(2)} \end{bmatrix} - ${lr.toFixed(2)} \begin{bmatrix} ${s.grad1.toFixed(2)} \\ ${s.grad2.toFixed(2)} \end{bmatrix}`,
      String.raw`L(w_1, w_2) = ${s.loss.toFixed(4)} \qquad \|\nabla L\| = ${Math.hypot(s.grad1, s.grad2).toFixed(3)}`,
    ];
  },
});
