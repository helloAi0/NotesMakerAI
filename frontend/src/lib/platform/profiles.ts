/* Local profiles and roles. This is NOT authentication: it lives in the browser, so anyone with the device can change it.
   It separates what a student and a teacher SEE, adds an optional PIN to the teacher area, and puts the right name on reports.
   Real accounts (server, passwords, class membership) are the next step: see server-api/. */
import { defaultKV } from '../friday/learn';
import type { KV } from '../friday/learn';
export type Role = 'student' | 'teacher';
export interface Profile { id: string; name: string; role: Role; salt?: string; pin?: string }
const K = 'nm_profile';
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
export async function hashPin(pin: string, salt: string): Promise<string> { const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']); return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100_000, hash: 'SHA-256' }, base, 256)); }
export const getProfile = (kv: KV = defaultKV()): Profile | null => { try { const p = JSON.parse(kv.get(K) || 'null'); return p && (p.role === 'student' || p.role === 'teacher') && typeof p.name === 'string' ? p : null; } catch { return null; } };
export async function saveProfile(p: { name: string; role: Role; pin?: string }, kv: KV = defaultKV()): Promise<Profile> {
  const prof: Profile = { id: getProfile(kv)?.id ?? Math.random().toString(36).slice(2, 10), name: p.name.trim().slice(0, 60) || (p.role === 'teacher' ? 'Teacher' : 'Student'), role: p.role };
  if (p.role === 'teacher' && p.pin) { if (!/^\d{4,8}$/.test(p.pin)) throw new Error('The PIN must be 4 to 8 digits.'); prof.salt = Math.random().toString(36).slice(2); prof.pin = await hashPin(p.pin, prof.salt); }
  kv.set(K, JSON.stringify(prof)); try { localStorage.setItem('nm_student_name', prof.name); } catch { /* ignore */ } return prof;
}
export async function checkPin(p: Profile, pin: string): Promise<boolean> { return !p.pin || !p.salt || (await hashPin(pin, p.salt)) === p.pin; }
export const clearProfile = (kv: KV = defaultKV()) => kv.set(K, 'null');
export const TEACHER_VIEWS = new Set(['teach']);
/** Students do not see the Teach area; with no profile yet everything is visible. */
export const canOpen = (role: Role | null, view: string) => role !== 'student' || !TEACHER_VIEWS.has(view);
