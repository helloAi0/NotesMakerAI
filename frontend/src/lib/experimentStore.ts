export interface SavedParameter {
  id: string;
  label: string;
  value: string | number | boolean;
  unit?: string;
}

export interface SavedReadout {
  label: string;
  value: string | number;
  unit?: string;
}

export type ExperimentSaveOption = 'all' | 'snapshot' | 'summary' | 'results' | 'interactive';

export interface ExperimentRecord {
  id: string;
  simId: string;
  simTitle: string;
  subject: string;
  category?: string;
  educationLevels?: string[];
  timestamp: string;
  notebookTitle: string;
  pageNumber: number;
  snapshotUrl?: string; // Data URL PNG
  objective?: string;
  summary?: string;
  parameters: SavedParameter[];
  rawValues: Record<string, string | number | boolean>;
  readouts: SavedReadout[];
  equations?: string[];
  observations: string;
  conclusion?: string;
  assumptions?: string[];
  saveOptions: ExperimentSaveOption[];
}

const STORAGE_KEY = 'notesmaker_saved_experiments';

export function loadAllExperiments(): ExperimentRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to load experiments from localStorage', err);
    return [];
  }
}

export function saveExperimentRecord(rec: ExperimentRecord): void {
  try {
    const existing = loadAllExperiments();
    // Prevent immediate duplicates within 3 seconds of the same sim on the same page
    const filtered = existing.filter(e => !(e.simId === rec.simId && e.pageNumber === rec.pageNumber && Math.abs(new Date(e.timestamp).getTime() - new Date(rec.timestamp).getTime()) < 3000));
    const next = [rec, ...filtered];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('notesmaker_experiments_updated', { detail: next }));
  } catch (err) {
    console.error('Failed to save experiment to localStorage', err);
  }
}

export function updateExperimentObservation(id: string, observations: string): void {
  try {
    const existing = loadAllExperiments();
    const updated = existing.map(e => e.id === id ? { ...e, observations } : e);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('notesmaker_experiments_updated', { detail: updated }));
  } catch (err) {
    console.error('Failed to update observation', err);
  }
}

export function renameExperimentTitle(id: string, title: string): void {
  try {
    const existing = loadAllExperiments();
    const updated = existing.map(e => e.id === id ? { ...e, simTitle: title } : e);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('notesmaker_experiments_updated', { detail: updated }));
  } catch (err) {
    console.error('Failed to rename experiment', err);
  }
}

export function deleteExperimentRecord(id: string): void {
  try {
    const existing = loadAllExperiments();
    const updated = existing.filter(e => e.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('notesmaker_experiments_updated', { detail: updated }));
  } catch (err) {
    console.error('Failed to delete experiment', err);
  }
}
