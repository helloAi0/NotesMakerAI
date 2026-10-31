/**
 * Agent bus: a tiny registry that lets the voice agent and the help-bot drive the REAL app.
 * Each screen registers what it can do while it is mounted (navigate, open a simulation, change a slider,
 * insert text into the notebook ...). Nothing here talks to the network.
 */
import type { AnySim, Values } from '../sims/types';

export type ViewId = 'dashboard' | 'generator' | 'notebook' | 'simulations' | 'planner' | 'library' | 'friday';

export interface AppCaps {
  view: () => ViewId;
  navigate: (v: ViewId) => void;
}
export interface StudioCaps {
  openSim: (id: string) => boolean;
  closeSim: () => void;
  showCoverage: () => void;
}
export interface SimCaps {
  sim: AnySim;
  values: () => Values;
  setParam: (id: string, v: number | string | boolean) => void;
  run: () => void;          // restart from the initial state and play
  play: () => void;
  pause: () => void;
  reset: () => void;
  step: () => void;
  setSpeed: (x: number) => void;
  doAction: (id: string) => boolean;
  readouts: () => { label: string; value: string }[];
  equations: () => string[];
  addToNotebook: () => void;
  isPlaying: () => boolean;
}
export interface NotebookCaps {
  title: () => string;
  page: () => number;
  insert: (text: string) => void;     // append at the caret / end of the page
  getText: () => string;              // current page text
  allPages: () => { title: string; page: number; text: string }[];
  readAloud: () => void;
  stopReading: () => void;
  gotoPage: (n: number) => void;
  setMode: (m: 'read' | 'edit') => void;
}
export interface CapMap { app: AppCaps; studio: StudioCaps; sim: SimCaps; notebook: NotebookCaps }

const store: Partial<CapMap> = {};
const listeners = new Set<() => void>();

export function register<K extends keyof CapMap>(k: K, caps: CapMap[K]): () => void {
  store[k] = caps; listeners.forEach(f => f());
  return () => { if (store[k] === caps) { delete store[k]; listeners.forEach(f => f()); } };
}
export function cap<K extends keyof CapMap>(k: K): CapMap[K] | undefined { return store[k] as CapMap[K] | undefined; }
export function onChange(f: () => void): () => void { listeners.add(f); return () => { listeners.delete(f); }; }

/** Wait (up to ms) for a screen to mount and register itself, e.g. after navigating. */
export function waitFor<K extends keyof CapMap>(k: K, ms = 6000): Promise<CapMap[K] | undefined> {
  return new Promise(res => {
    const now = cap(k); if (now) return res(now);
    const t0 = Date.now(); const iv = setInterval(() => { const c = cap(k); if (c || Date.now() - t0 > ms) { clearInterval(iv); res(c); } }, 50);
  });
}
export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
