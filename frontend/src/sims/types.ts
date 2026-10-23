/* ------------------------------------------------------------------ */
/*  Original simulation framework: shared types                        */
/*  Every simulation is a plain object: parameters + init/step/draw.   */
/*  The SimPlayer component runs it, draws it and adds the tools       */
/*  (play/pause, speed, data log, equations, AI tutor).                */
/* ------------------------------------------------------------------ */

export type SimSubject =
  | 'Physics'
  | 'Chemistry'
  | 'Biology'
  | 'Math'
  | 'Earth Science'
  | 'Electronics'
  | 'Robotics'
  | 'Computer Science'
  | 'Engineering'
  | 'Materials'
  | 'Quantum'
  | 'Security';

export type EducationLevel =
  | 'Class 8'
  | 'Class 9'
  | 'Class 10'
  | 'Class 11'
  | 'Class 12'
  | 'B.Tech'
  | 'B.Sc'
  | 'BBA'
  | 'BCA'
  | 'M.Tech'
  | 'M.Sc';

export type EducationCategory = 'All' | 'School' | 'Undergraduate' | 'Postgraduate';

export const SCHOOL_8_10: EducationLevel[] = ['Class 8', 'Class 9', 'Class 10'];
export const SCHOOL_11_12: EducationLevel[] = ['Class 11', 'Class 12'];
export const SCHOOL_ALL: EducationLevel[] = ['Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'];
export const UG_ENG: EducationLevel[] = ['B.Tech'];
export const UG_SCI: EducationLevel[] = ['B.Sc', 'B.Tech'];
export const PG_ALL: EducationLevel[] = ['M.Tech', 'M.Sc'];

export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export type ParamValue = number | string | boolean;
export type Values = Record<string, ParamValue>;

interface ParamBase {
  id: string;
  label: string;
  /** Rebuild the simulation from scratch when this changes. */
  resetOnChange?: boolean;
  /** Short help shown under the control. */
  help?: string;
}
export interface NumberParam extends ParamBase { kind: 'number'; min: number; max: number; step: number; value: number; unit?: string; digits?: number }
export interface SelectParam extends ParamBase { kind: 'select'; options: { value: string; label: string }[]; value: string }
export interface ToggleParam extends ParamBase { kind: 'toggle'; value: boolean }
export type Param = NumberParam | SelectParam | ToggleParam;

export interface Readout { label: string; value: number | string; unit?: string; digits?: number }

export interface PointerEvt { kind: 'down' | 'move' | 'up'; x: number; y: number; w: number; h: number }

export type SimStatus = 'active' | 'interactive_derivation' | 'planned';

export interface DerivationStep {
  stepNumber: number;
  title: string;
  math: string; // LaTeX
  explanation: string;
  justification?: string;
  intermediateResult?: string;
  highlightKey?: string; // used to link to region of animation
}

export interface DerivationPlan {
  targetEquation: string;
  problemStatement: string;
  assumptions: string[];
  variableDefinitions: { symbol: string; meaning: string; unit?: string }[];
  startingPrinciple: string;
  steps: DerivationStep[];
  finalResult: string;
  dimensionalCheck?: string;
  physicalInterpretation?: string;
}

export interface SimDef<S> {
  id: string;
  title: string;
  subject: SimSubject;
  status?: SimStatus;
  derivation?: DerivationPlan;
  /** Curriculum category e.g. 'Kinematics', 'Circuits', 'Robotics', 'Thermodynamics' */
  category?: string;
  /** Supported education levels */
  educationLevels?: EducationLevel[];
  /** Difficulty level */
  difficulty?: Difficulty;
  /** Extra search words (course names, exam names, synonyms) used by the Studio search. */
  tags?: string[];
  /** Exact curriculum-topic phrases (from the master topic list) that this simulation genuinely teaches. */
  covers?: string[];
  /** Subject topic and subtopic */
  topic?: string;
  subtopic?: string;
  /** Explicit learning objectives for students */
  learningObjectives?: string[];
  /** Known assumptions & scientific model limitations */
  assumptions?: string[];
  /** Whether canvas snapshot capture is supported (default true) */
  supportsSnapshot?: boolean;
  /** Whether saved parameters can be restored interactively (default true) */
  supportsRestore?: boolean;
  /** One or two sentences shown on the card and above the simulation. */
  blurb: string;
  /** Background for the AI tutor: what the simulation models and what is worth exploring. */
  hint: string;
  params: Param[];
  actions?: { id: string; label: string }[];
  /** Fixed physics time step in seconds (default 1/240). */
  dt?: number;
  /** Simulated seconds to run before drawing the card thumbnail. */
  previewSeconds?: number;
  init(v: Values): S;
  step(s: S, v: Values, dt: number): void;
  draw(c: CanvasRenderingContext2D, s: S, v: Values, w: number, h: number): void;
  readouts(s: S, v: Values): Readout[];
  /** LaTeX strings with the current numbers filled in. */
  equations?(s: S, v: Values): string[];
  action?(s: S, v: Values, id: string): void;
  pointer?(s: S, v: Values, e: PointerEvt): void;
  /** Called once after init() when building a thumbnail, e.g. to fire the cannon. */
  preview?(s: S, v: Values): void;
}

/** Keeps the registry simple: every simulation has its own state type. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySim = SimDef<any>;

export function defineSim<S>(d: SimDef<S>): AnySim {
  return d as AnySim;
}

export const defaultsOf = (params: Param[]): Values => {
  const v: Values = {};
  for (const p of params) v[p.id] = p.value;
  return v;
};

export const num = (v: Values, id: string) => v[id] as number;
export const str = (v: Values, id: string) => v[id] as string;
export const bool = (v: Values, id: string) => v[id] as boolean;
