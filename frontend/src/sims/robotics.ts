import { defineSim, num, str, bool } from './types';
import { circle, line, panel, text, rad, deg, TAU } from './draw';

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
/*  Robotics Simulation 1: Two-Link Robotic Arm Kinematics (FK & IK)  */
/* ================================================================== */

interface ArmState {
  t1: number; // joint 1 angle (rad)
  t2: number; // joint 2 angle (rad)
  targetX: number;
  targetY: number;
  reachable: boolean;
  history: [number, number][];
  isDragging: boolean;
}

export const arm2link = defineSim<ArmState>({
  id: 'robotics-arm-2link',
  title: 'Two-Link Robotic Arm Kinematics',
  subject: 'Robotics',
  category: 'Manipulators & Kinematics',
  educationLevels: ['B.Tech', 'B.Sc', 'M.Tech'],
  difficulty: 'Intermediate',
  topic: 'Robot Kinematics',
  subtopic: 'Forward & Inverse Kinematics',
  learningObjectives: [
    'Understand Forward Kinematics (FK): mapping joint space (θ₁, θ₂) to Cartesian workspace (x, y).',
    'Explore Inverse Kinematics (IK) and the non-linear algebraic solutions for elbow-up vs elbow-down.',
    'Identify workspace boundaries and kinematic singularities where the Jacobian loses rank.',
  ],
  assumptions: [
    'Planar 2-DOF revolute-revolute (RR) manipulator in 2D Euclidean space.',
    'Rigid links with zero deflection and ideal frictionless joints.',
  ],
  supportsSnapshot: true,
  supportsRestore: true,
  derivation: {
    targetEquation: '\\cos\\theta_2 = \\frac{x^2 + y^2 - L_1^2 - L_2^2}{2 L_1 L_2}',
    problemStatement: '2-DOF Planar Robot Arm Forward and Inverse Kinematics Derivation',
    assumptions: [
      'Two rigid revolute links of lengths L₁ and L₂ constrained to 2D plane.',
      'Joint 1 is fixed at Cartesian origin (0, 0); zero joint backlash or bending.',
      'Target point (x, y) must reside within reachable annulus: |L₁ - L₂| ≤ r ≤ L₁ + L₂.',
    ],
    variableDefinitions: [
      { symbol: 'L_1, L_2', meaning: 'Link lengths of arm segments', unit: 'mm' },
      { symbol: '\\theta_1, \\theta_2', meaning: 'Joint 1 and joint 2 rotation angles', unit: 'rad / °' },
      { symbol: '(x, y)', meaning: 'End-effector Cartesian workspace position', unit: 'mm' },
      { symbol: 'J', meaning: 'Kinematic Jacobian matrix [∂(x,y)/∂(θ₁,θ₂)]', unit: 'length/rad' },
    ],
    startingPrinciple: 'Vector chain addition in Cartesian coordinates and Law of Cosines on the triangular link configuration',
    steps: [
      {
        stepNumber: 1,
        title: 'Forward Kinematics Equations',
        math: 'x = L_1 \\cos\\theta_1 + L_2 \\cos(\\theta_1 + \\theta_2), \\quad y = L_1 \\sin\\theta_1 + L_2 \\sin(\\theta_1 + \\theta_2)',
        explanation: 'The end-effector position is obtained by projecting link 1 and link 2 onto the Cartesian X and Y axes.',
        justification: 'Vector addition of link displacement vectors r = r₁ + r₂.',
        intermediateResult: '\\mathbf{p} = \\mathbf{p}_1 + \\mathbf{R}(\\theta_1) \\mathbf{p}_2',
        highlightKey: 'forward_kinematics',
      },
      {
        stepNumber: 2,
        title: 'Sum of Squared Coordinates (Radial Distance)',
        math: 'x^2 + y^2 = L_1^2 + L_2^2 + 2 L_1 L_2 (\\cos\\theta_1 \\cos(\\theta_1+\\theta_2) + \\sin\\theta_1 \\sin(\\theta_1+\\theta_2))',
        explanation: 'Squaring and adding x² and y² collapses the trigonometric terms using the angle-difference identity cos(A - B) = cos A cos B + sin A sin B.',
        justification: 'Pythagorean trigonometric identity cos² φ + sin² φ = 1.',
        intermediateResult: 'x^2 + y^2 = L_1^2 + L_2^2 + 2 L_1 L_2 \\cos\\theta_2',
        highlightKey: 'distance',
      },
      {
        stepNumber: 3,
        title: 'Solving for Elbow Joint Angle θ₂',
        math: '\\cos\\theta_2 = \\frac{x^2 + y^2 - L_1^2 - L_2^2}{2 L_1 L_2} \\implies \\theta_2 = \\operatorname{atan2}(\\pm \\sqrt{1 - \\cos^2\\theta_2}, \\cos\\theta_2)',
        explanation: 'Isolating cos θ₂ gives the elbow angle. The ± sign distinguishes the Elbow-Up (+) and Elbow-Down (-) dual kinematic postures.',
        justification: 'The Law of Cosines applies directly to the triangle formed by origin, elbow, and end-effector.',
        intermediateResult: '\\theta_2 = \\operatorname{atan2}(\\pm \\sin\\theta_2, \\cos\\theta_2)',
        highlightKey: 'elbow_angle',
      },
      {
        stepNumber: 4,
        title: 'Solving for Shoulder Joint Angle θ₁',
        math: '\\theta_1 = \\operatorname{atan2}(y, x) - \\operatorname{atan2}(L_2 \\sin\\theta_2, L_1 + L_2 \\cos\\theta_2)',
        explanation: 'Joint 1 angle equals the angle of the target line minus the internal angle between link 1 and the target chord.',
        justification: 'Algebraic decomposition of the coupled trigonometric system.',
        intermediateResult: '\\theta_1 = \\beta - \\alpha',
        highlightKey: 'shoulder_angle',
      },
    ],
    finalResult: '\\theta_2 = \\arccos\\left(\\frac{x^2+y^2-L_1^2-L_2^2}{2L_1L_2}\\right), \\quad \\theta_1 = \\operatorname{atan2}(y, x) - \\operatorname{atan2}(L_2 \\sin\\theta_2, L_1 + L_2 \\cos\\theta_2)',
    dimensionalCheck: 'Inverse trigonometric arguments are dimensionless ratios of squared lengths [L² / L²].',
    physicalInterpretation: 'Multiple joint configurations (elbow-up and elbow-down) can reach the exact same Cartesian coordinate.',
  },
  blurb: 'Control a 2-DOF robotic manipulator in joint space or Cartesian space. Explore forward & inverse kinematics, workspace boundaries, and coordinate frames.',
  hint: 'In Forward Kinematics you set θ₁ and θ₂ directly. In Inverse Kinematics, you position the end-effector (or drag it) and the simulation calculates the geometric joint angles. If the target is beyond L₁+L₂, it is out of reach.',
  params: [
    {
      kind: 'select',
      id: 'mode',
      label: 'Control Mode',
      value: 'forward',
      options: [
        { value: 'forward', label: 'Forward Kinematics (Joint Angles)' },
        { value: 'inverse', label: 'Inverse Kinematics (Target X, Y)' },
      ],
    },
    { kind: 'number', id: 'theta1', label: 'Joint 1 Angle (θ₁)', min: -180, max: 180, step: 1, value: 35, unit: '°' },
    { kind: 'number', id: 'theta2', label: 'Joint 2 Angle (θ₂)', min: -170, max: 170, step: 1, value: 55, unit: '°' },
    { kind: 'number', id: 'targetX', label: 'Target X', min: -250, max: 250, step: 2, value: 140, unit: 'mm' },
    { kind: 'number', id: 'targetY', label: 'Target Y', min: -250, max: 250, step: 2, value: 120, unit: 'mm' },
    { kind: 'number', id: 'l1', label: 'Link 1 Length (L₁)', min: 60, max: 160, step: 5, value: 120, unit: 'mm' },
    { kind: 'number', id: 'l2', label: 'Link 2 Length (L₂)', min: 40, max: 140, step: 5, value: 100, unit: 'mm' },
    {
      kind: 'select',
      id: 'elbow',
      label: 'IK Solution Branch',
      value: 'up',
      options: [
        { value: 'up', label: 'Elbow Up (θ₂ > 0)' },
        { value: 'down', label: 'Elbow Down (θ₂ < 0)' },
      ],
    },
    { kind: 'toggle', id: 'showWorkspace', label: 'Show Reachable Workspace Envelope', value: true },
    { kind: 'toggle', id: 'showFrames', label: 'Show Joint Coordinate Frames', value: true },
  ],
  actions: [
    { id: 'reachTest', label: 'Center Target' },
    { id: 'clearTrail', label: 'Clear Trail' },
  ],
  init(v) {
    const s: ArmState = {
      t1: rad(num(v, 'theta1')),
      t2: rad(num(v, 'theta2')),
      targetX: num(v, 'targetX'),
      targetY: num(v, 'targetY'),
      reachable: true,
      history: [],
      isDragging: false,
    };
    return s;
  },
  action(s, v, id) {
    if (id === 'reachTest') {
      const l1 = num(v, 'l1');
      const l2 = num(v, 'l2');
      s.targetX = Math.round((l1 + l2) * 0.65);
      s.targetY = Math.round((l1 + l2) * 0.45);
    } else if (id === 'clearTrail') {
      s.history = [];
    }
  },
  pointer(s, _v, e) {
    if (e.kind === 'down' || (e.kind === 'move' && s.isDragging)) {
      s.isDragging = true;
      const cx = e.w * 0.45;
      const cy = e.h * 0.55;
      const tx = e.x - cx;
      const ty = -(e.y - cy);
      s.targetX = tx;
      s.targetY = ty;
    } else if (e.kind === 'up') {
      s.isDragging = false;
    }
  },
  step(s, v) {
    const mode = str(v, 'mode');
    const l1 = num(v, 'l1');
    const l2 = num(v, 'l2');

    if (mode === 'forward') {
      s.t1 = rad(num(v, 'theta1'));
      s.t2 = rad(num(v, 'theta2'));
      s.reachable = true;
    } else {
      const tx = s.targetX;
      const ty = s.targetY;
      const r2 = tx * tx + ty * ty;
      const r = Math.sqrt(r2);
      const maxReach = l1 + l2;
      const minReach = Math.abs(l1 - l2);

      if (r > maxReach || r < minReach || r < 1e-4) {
        s.reachable = false;
        const clampedR = Math.max(minReach + 1, Math.min(maxReach - 0.5, r));
        const scale = clampedR / (r || 1);
        const ptx = tx * scale;
        const pty = ty * scale;
        const cosT2 = (ptx * ptx + pty * pty - l1 * l1 - l2 * l2) / (2 * l1 * l2);
        const clampedCos = Math.max(-1, Math.min(1, cosT2));
        const elbowSign = str(v, 'elbow') === 'down' ? -1 : 1;
        s.t2 = elbowSign * Math.acos(clampedCos);
        s.t1 = Math.atan2(pty, ptx) - Math.atan2(l2 * Math.sin(s.t2), l1 + l2 * Math.cos(s.t2));
      } else {
        s.reachable = true;
        const cosT2 = (r2 - l1 * l1 - l2 * l2) / (2 * l1 * l2);
        const clampedCos = Math.max(-1, Math.min(1, cosT2));
        const elbowSign = str(v, 'elbow') === 'down' ? -1 : 1;
        s.t2 = elbowSign * Math.acos(clampedCos);
        s.t1 = Math.atan2(ty, tx) - Math.atan2(l2 * Math.sin(s.t2), l1 + l2 * Math.cos(s.t2));
      }
    }

    const eeX = l1 * Math.cos(s.t1) + l2 * Math.cos(s.t1 + s.t2);
    const eeY = l1 * Math.sin(s.t1) + l2 * Math.sin(s.t1 + s.t2);
    s.history.push([eeX, eeY]);
    if (s.history.length > 250) s.history.shift();
  },
  draw(c, s, v, w, h) {
    const l1 = num(v, 'l1');
    const l2 = num(v, 'l2');
    const showWk = bool(v, 'showWorkspace');
    const showFrames = bool(v, 'showFrames');
    const mode = str(v, 'mode');

    c.fillStyle = '#0a0f1d';
    c.fillRect(0, 0, w, h);

    const bx = w * 0.44;
    const by = h * 0.56;

    // Grid
    c.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    c.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      line(c, x, 0, x, h);
    }
    for (let y = 0; y < h; y += 40) {
      line(c, 0, y, w, y);
    }

    // Workspace envelope
    if (showWk) {
      const maxR = l1 + l2;
      const minR = Math.abs(l1 - l2);
      c.save();
      c.beginPath();
      c.arc(bx, by, maxR, 0, TAU);
      if (minR > 1) {
        c.arc(bx, by, minR, TAU, 0, true);
      }
      c.fillStyle = 'rgba(56, 189, 248, 0.06)';
      c.fill();
      c.strokeStyle = 'rgba(56, 189, 248, 0.25)';
      c.setLineDash([4, 4]);
      c.lineWidth = 1;
      circle(c, bx, by, maxR);
      if (minR > 5) circle(c, bx, by, minR);
      c.restore();
    }

    const j1x = bx + l1 * Math.cos(s.t1);
    const j1y = by - l1 * Math.sin(s.t1);
    const eeX = j1x + l2 * Math.cos(s.t1 + s.t2);
    const eeY = j1y - l2 * Math.sin(s.t1 + s.t2);

    // End-effector trajectory trail
    if (s.history.length > 2) {
      c.save();
      c.strokeStyle = '#f59e0b';
      c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i < s.history.length; i++) {
        const px = bx + s.history[i][0];
        const py = by - s.history[i][1];
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.stroke();
      c.restore();
    }

    // Target marker in IK mode
    if (mode === 'inverse') {
      const tx = bx + s.targetX;
      const ty = by - s.targetY;
      c.save();
      c.strokeStyle = s.reachable ? '#10b981' : '#ef4444';
      c.lineWidth = 2;
      c.setLineDash([3, 3]);
      line(c, tx - 12, ty, tx + 12, ty);
      line(c, tx, ty - 12, tx, ty + 12);
      circle(c, tx, ty, 8);
      c.fillStyle = s.reachable ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
      c.fill();
      c.restore();
      drawText(c, s.reachable ? 'Target (Reachable)' : 'Target (Out of Workspace)', tx + 14, ty - 8, {
        color: s.reachable ? '#34d399' : '#f87171',
        size: 11,
      });
    }

    // Base pedestal
    c.fillStyle = '#334155';
    c.fillRect(bx - 30, by, 60, 24);
    c.fillStyle = '#1e293b';
    c.fillRect(bx - 24, by + 4, 48, 16);

    // Link 1
    c.save();
    c.strokeStyle = '#38bdf8';
    c.lineWidth = 14;
    c.lineCap = 'round';
    line(c, bx, by, j1x, j1y);
    c.strokeStyle = '#0284c7';
    c.lineWidth = 6;
    line(c, bx, by, j1x, j1y);
    c.restore();

    // Link 2
    c.save();
    c.strokeStyle = '#a855f7';
    c.lineWidth = 10;
    c.lineCap = 'round';
    line(c, j1x, j1y, eeX, eeY);
    c.strokeStyle = '#7e22ce';
    c.lineWidth = 4;
    line(c, j1x, j1y, eeX, eeY);
    c.restore();

    // Base joint
    circle(c, bx, by, 12, '#64748b');
    circle(c, bx, by, 5, '#f8fafc');

    // Joint 1
    circle(c, j1x, j1y, 9, '#38bdf8');
    circle(c, j1x, j1y, 4, '#0f172a');

    // End effector gripper
    c.save();
    c.translate(eeX, eeY);
    c.rotate(- (s.t1 + s.t2));
    c.fillStyle = '#fbbf24';
    c.fillRect(-4, -6, 8, 12);
    c.fillStyle = '#d97706';
    c.fillRect(4, -8, 8, 4);
    c.fillRect(4, 4, 8, 4);
    c.restore();

    // Coordinate frames {X, Y}
    if (showFrames) {
      c.strokeStyle = '#ef4444';
      c.lineWidth = 2;
      line(c, bx, by, bx + 35, by);
      c.strokeStyle = '#22c55e';
      line(c, bx, by, bx, by - 35);
      drawText(c, 'X₀', bx + 38, by + 4, { color: '#ef4444', size: 10, bold: true });
      drawText(c, 'Y₀', bx - 14, by - 38, { color: '#22c55e', size: 10, bold: true });

      const t1 = s.t1;
      c.strokeStyle = '#ef4444';
      line(c, j1x, j1y, j1x + 30 * Math.cos(t1), j1y - 30 * Math.sin(t1));
      c.strokeStyle = '#22c55e';
      line(c, j1x, j1y, j1x - 30 * Math.sin(t1), j1y - 30 * Math.cos(t1));
      drawText(c, 'X₁', j1x + 34 * Math.cos(t1), j1y - 34 * Math.sin(t1), { color: '#ef4444', size: 9 });

      const t12 = s.t1 + s.t2;
      c.strokeStyle = '#f59e0b';
      line(c, eeX, eeY, eeX + 25 * Math.cos(t12), eeY - 25 * Math.sin(t12));
      drawText(c, 'EE', eeX + 12, eeY - 12, { color: '#fbbf24', size: 11, bold: true });
    }

    // Status panel
    drawPanel(c, 14, 14, 260, 80, { fill: 'rgba(15, 23, 42, 0.85)', stroke: '#334155' });
    drawText(c, `Mode: ${mode === 'forward' ? 'Forward Kinematics (FK)' : 'Inverse Kinematics (IK)'}`, 24, 32, {
      color: '#f8fafc',
      size: 11,
      bold: true,
    });
    drawText(c, `θ₁ = ${deg(s.t1).toFixed(1)}°   |   θ₂ = ${deg(s.t2).toFixed(1)}°`, 24, 52, { color: '#38bdf8', size: 11 });
    drawText(c, `End-Effector: (${((eeX - bx)).toFixed(1)}, ${(-(eeY - by)).toFixed(1)}) mm`, 24, 72, {
      color: s.reachable ? '#34d399' : '#f87171',
      size: 11,
      bold: true,
    });
  },
  readouts(s, v) {
    const l1 = num(v, 'l1');
    const l2 = num(v, 'l2');
    const eeX = l1 * Math.cos(s.t1) + l2 * Math.cos(s.t1 + s.t2);
    const eeY = l1 * Math.sin(s.t1) + l2 * Math.sin(s.t1 + s.t2);
    const r = Math.hypot(eeX, eeY);
    const maxR = l1 + l2;
    const minR = Math.abs(l1 - l2);

    return [
      { label: 'Joint 1 (θ₁)', value: deg(s.t1), unit: '°', digits: 1 },
      { label: 'Joint 2 (θ₂)', value: deg(s.t2), unit: '°', digits: 1 },
      { label: 'End-Effector X', value: eeX, unit: 'mm', digits: 1 },
      { label: 'End-Effector Y', value: eeY, unit: 'mm', digits: 1 },
      { label: 'Radial Reach (R)', value: r, unit: 'mm', digits: 1 },
      { label: 'Max Workspace', value: maxR, unit: 'mm', digits: 0 },
      { label: 'Min Workspace', value: minR, unit: 'mm', digits: 0 },
      { label: 'Kinematic Reachable', value: s.reachable ? 'VALID' : 'OUT OF REACH' },
    ];
  },
  equations(s, v) {
    const l1 = num(v, 'l1');
    const l2 = num(v, 'l2');
    const t1Deg = deg(s.t1).toFixed(1);
    const t2Deg = deg(s.t2).toFixed(1);
    const eeX = (l1 * Math.cos(s.t1) + l2 * Math.cos(s.t1 + s.t2)).toFixed(1);
    const eeY = (l1 * Math.sin(s.t1) + l2 * Math.sin(s.t1 + s.t2)).toFixed(1);

    return [
      `x = L_1 \\cos(\\theta_1) + L_2 \\cos(\\theta_1 + \\theta_2) = ${l1}\\cos(${t1Deg}^\\circ) + ${l2}\\cos(${t1Deg}^\\circ + ${t2Deg}^\\circ) = ${eeX}\\text{ mm}`,
      `y = L_1 \\sin(\\theta_1) + L_2 \\sin(\\theta_1 + \\theta_2) = ${l1}\\sin(${t1Deg}^\\circ) + ${l2}\\sin(${t1Deg}^\\circ + ${t2Deg}^\\circ) = ${eeY}\\text{ mm}`,
      `\\cos(\\theta_2) = \\frac{x^2 + y^2 - L_1^2 - L_2^2}{2 L_1 L_2}, \\quad \\theta_1 = \\text{atan2}(y, x) - \\text{atan2}(L_2 \\sin\\theta_2, L_1 + L_2 \\cos\\theta_2)`,
    ];
  },
});

/* ================================================================== */
/*  Robotics Simulation 2: Differential Drive Mobile Robot & Odometry  */
/* ================================================================== */

interface DiffDriveState {
  x: number; // m
  y: number; // m
  theta: number; // rad
  v: number; // m/s
  omega: number; // rad/s
  distance: number; // m
  trail: [number, number][];
}

export const diffDrive = defineSim<DiffDriveState>({
  id: 'robotics-diff-drive',
  title: 'Differential Drive Mobile Robot',
  subject: 'Robotics',
  category: 'Mobile Robotics & Odometry',
  educationLevels: ['B.Tech', 'B.Sc', 'M.Tech'],
  difficulty: 'Intermediate',
  topic: 'Mobile Robotics',
  subtopic: 'Kinematics & Dead Reckoning',
  learningObjectives: [
    'Understand non-holonomic mobile robot constraints and unicycle kinematic model.',
    'Observe how independent left and right wheel velocities create forward motion, pure rotation, and arcs.',
    'Locate the Instantaneous Center of Curvature (ICC) and calculate turning radius.',
  ],
  assumptions: [
    'Pure rolling without wheel slip or skid (ideal non-holonomic constraint).',
    'Planar ground motion with rigid chassis and symmetric track width W.',
  ],
  supportsSnapshot: true,
  supportsRestore: true,
  blurb: 'Simulate mobile robot wheel kinematics, heading angle, Instantaneous Center of Curvature (ICC), and dead-reckoning trajectory.',
  hint: 'When vL = vR, the robot moves in a straight line. When vL = -vR, it rotates in place (ICC is at center). When wheel velocities differ, it moves in a circular arc of radius R = (W/2)*(vR+vL)/(vR-vL).',
  params: [
    { kind: 'number', id: 'vL', label: 'Left Wheel Speed (v_L)', min: -1.5, max: 1.5, step: 0.1, value: 0.5, unit: 'm/s' },
    { kind: 'number', id: 'vR', label: 'Right Wheel Speed (v_R)', min: -1.5, max: 1.5, step: 0.1, value: 0.8, unit: 'm/s' },
    { kind: 'number', id: 'width', label: 'Track Width (W)', min: 0.2, max: 0.8, step: 0.05, value: 0.4, unit: 'm' },
    { kind: 'toggle', id: 'showIcc', label: 'Show Instantaneous Center of Curvature (ICC)', value: true },
    { kind: 'toggle', id: 'showSensors', label: 'Show Ultrasonic Proximity Rays', value: true },
  ],
  actions: [
    { id: 'resetPose', label: 'Reset Position' },
    { id: 'spinInPlace', label: 'Spin in Place' },
  ],
  init() {
    return {
      x: 0,
      y: 0,
      theta: 0,
      v: 0,
      omega: 0,
      distance: 0,
      trail: [[0, 0]],
    };
  },
  action(s, v, id) {
    if (id === 'resetPose') {
      s.x = 0;
      s.y = 0;
      s.theta = 0;
      s.distance = 0;
      s.trail = [[0, 0]];
    } else if (id === 'spinInPlace') {
      v['vL'] = -0.6;
      v['vR'] = 0.6;
    }
  },
  step(s, v, dt) {
    const vL = num(v, 'vL');
    const vR = num(v, 'vR');
    const W = num(v, 'width');

    const linearV = (vR + vL) / 2;
    const angularW = (vR - vL) / W;

    s.v = linearV;
    s.omega = angularW;

    s.x += linearV * Math.cos(s.theta) * dt;
    s.y += linearV * Math.sin(s.theta) * dt;
    s.theta += angularW * dt;
    s.distance += Math.abs(linearV) * dt;

    const last = s.trail[s.trail.length - 1];
    if (!last || Math.hypot(s.x - last[0], s.y - last[1]) > 0.04) {
      s.trail.push([s.x, s.y]);
      if (s.trail.length > 300) s.trail.shift();
    }
  },
  draw(c, s, v, w, h) {
    const W = num(v, 'width');
    const showIcc = bool(v, 'showIcc');
    const showSensors = bool(v, 'showSensors');

    c.fillStyle = '#0f172a';
    c.fillRect(0, 0, w, h);

    const scale = 140; // 1 m = 140 px
    const cx = w * 0.5;
    const cy = h * 0.5;

    // Arena grid
    c.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    c.lineWidth = 1;
    for (let x = -4; x <= 4; x += 0.5) {
      const px = cx + x * scale;
      line(c, px, 0, px, h);
    }
    for (let y = -4; y <= 4; y += 0.5) {
      const py = cy - y * scale;
      line(c, 0, py, w, py);
    }

    // Trajectory trail
    if (s.trail.length > 1) {
      c.save();
      c.strokeStyle = '#38bdf8';
      c.lineWidth = 3;
      c.beginPath();
      for (let i = 0; i < s.trail.length; i++) {
        const px = cx + s.trail[i][0] * scale;
        const py = cy - s.trail[i][1] * scale;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.stroke();
      c.restore();
    }

    const rx = cx + s.x * scale;
    const ry = cy - s.y * scale;

    // ICC
    const vL = num(v, 'vL');
    const vR = num(v, 'vR');
    if (showIcc && Math.abs(vR - vL) > 0.05) {
      const R_icc = (W / 2) * ((vR + vL) / (vR - vL));
      const iccX = rx - R_icc * scale * Math.sin(s.theta);
      const iccY = ry - R_icc * scale * Math.cos(s.theta);

      c.save();
      c.strokeStyle = 'rgba(245, 158, 11, 0.5)';
      c.setLineDash([4, 4]);
      c.lineWidth = 1.5;
      line(c, rx, ry, iccX, iccY);
      circle(c, iccX, iccY, Math.abs(R_icc * scale));
      circle(c, iccX, iccY, 5, '#f59e0b');
      drawText(c, `ICC (R = ${R_icc.toFixed(2)}m)`, iccX + 8, iccY - 6, { color: '#f59e0b', size: 10, bold: true });
      c.restore();
    }

    // Robot Chassis & Wheels
    c.save();
    c.translate(rx, ry);
    c.rotate(-s.theta);

    if (showSensors) {
      c.strokeStyle = 'rgba(74, 222, 128, 0.4)';
      c.lineWidth = 1;
      [-0.4, 0, 0.4].forEach(offsetAngle => {
        c.save();
        c.rotate(-offsetAngle);
        line(c, 24, 0, 90, 0);
        c.restore();
      });
    }

    const bodyW = W * scale * 0.85;
    const bodyL = W * scale * 0.95;
    c.fillStyle = '#1e293b';
    c.strokeStyle = '#475569';
    c.lineWidth = 2;
    c.fillRect(-bodyL * 0.5, -bodyW * 0.5, bodyL, bodyW);
    c.strokeRect(-bodyL * 0.5, -bodyW * 0.5, bodyL, bodyW);

    c.fillStyle = '#f97316';
    c.beginPath();
    c.moveTo(bodyL * 0.5, 0);
    c.lineTo(bodyL * 0.25, -bodyW * 0.25);
    c.lineTo(bodyL * 0.25, bodyW * 0.25);
    c.closePath();
    c.fill();

    c.fillStyle = '#0f172a';
    c.strokeStyle = '#38bdf8';
    c.lineWidth = 2;
    c.fillRect(-bodyL * 0.35, -bodyW * 0.55 - 6, bodyL * 0.7, 10);
    c.strokeRect(-bodyL * 0.35, -bodyW * 0.55 - 6, bodyL * 0.7, 10);

    c.fillRect(-bodyL * 0.35, bodyW * 0.55 - 4, bodyL * 0.7, 10);
    c.strokeRect(-bodyL * 0.35, bodyW * 0.55 - 4, bodyL * 0.7, 10);

    circle(c, bodyL * 0.38, 0, 5, '#94a3b8');

    c.strokeStyle = '#ef4444';
    c.lineWidth = 2;
    line(c, 0, 0, 30, 0);
    c.strokeStyle = '#22c55e';
    line(c, 0, 0, 0, -25);
    c.restore();

    // Data Overlay
    drawPanel(c, 14, 14, 250, 75, { fill: 'rgba(15, 23, 42, 0.85)', stroke: '#334155' });
    drawText(c, `Mobile Robot Odometry`, 24, 32, { color: '#f8fafc', size: 11, bold: true });
    drawText(c, `v = ${s.v.toFixed(2)} m/s   |   ω = ${deg(s.omega).toFixed(1)} °/s`, 24, 50, { color: '#38bdf8', size: 11 });
    drawText(c, `Position: (${s.x.toFixed(2)}, ${s.y.toFixed(2)}) m  θ = ${deg(s.theta).toFixed(1)}°`, 24, 68, {
      color: '#fbbf24',
      size: 11,
      bold: true,
    });
  },
  readouts(s, v) {
    const W = num(v, 'width');
    const vL = num(v, 'vL');
    const vR = num(v, 'vR');
    const diff = Math.abs(vR - vL);
    const R_icc = diff > 0.01 ? (W / 2) * ((vR + vL) / (vR - vL)) : Infinity;

    return [
      { label: 'Linear Velocity (v)', value: s.v, unit: 'm/s', digits: 2 },
      { label: 'Angular Velocity (ω)', value: s.omega, unit: 'rad/s', digits: 2 },
      { label: 'Heading (θ)', value: deg(s.theta), unit: '°', digits: 1 },
      { label: 'Position X', value: s.x, unit: 'm', digits: 2 },
      { label: 'Position Y', value: s.y, unit: 'm', digits: 2 },
      { label: 'Distance Traveled', value: s.distance, unit: 'm', digits: 2 },
      { label: 'Turning Radius (R_icc)', value: Number.isFinite(R_icc) ? R_icc : '∞ (Straight)', unit: Number.isFinite(R_icc) ? 'm' : '' },
    ];
  },
  equations(s, v) {
    const vL = num(v, 'vL').toFixed(2);
    const vR = num(v, 'vR').toFixed(2);
    const W = num(v, 'width').toFixed(2);
    const vVal = s.v.toFixed(2);
    const wVal = s.omega.toFixed(2);

    return [
      `v = \\frac{v_R + v_L}{2} = \\frac{${vR} + ${vL}}{2} = ${vVal}\\text{ m/s}`,
      `\\omega = \\frac{v_R - v_L}{W} = \\frac{${vR} - (${vL})}{${W}} = ${wVal}\\text{ rad/s}`,
      `\\dot{x} = v \\cos\\theta, \\quad \\dot{y} = v \\sin\\theta, \\quad R_{\\text{ICC}} = \\frac{W}{2}\\frac{v_R + v_L}{v_R - v_L}`,
    ];
  },
});
