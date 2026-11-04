import { vfs } from '../friday/vfs';
import type { NoteInfo } from './model';
/** Every note the student has: notebook pages (localStorage) and text files in the FRIDAY file area. */
export async function collectNotes(): Promise<NoteInfo[]> {
  const out: NoteInfo[] = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i) ?? ''; if (k.startsWith('notesmaker_text_')) { const t = localStorage.getItem(k) ?? ''; if (t.trim().length > 20) out.push({ title: k.slice('notesmaker_text_'.length) || 'Notebook', text: t }); } } } catch { /* storage blocked */ }
  try { const v = vfs(); await v.ready(); for (const n of v.walk('/', 8)) if (n.type === 'file' && n.text && n.text.length > 40) out.push({ title: n.name, text: n.text }); } catch { /* ignore */ }
  return out;
}
