/* Encrypted backup: move your whole study history to another device with a passphrase. AES-256-GCM, key from PBKDF2-SHA256 (210k rounds).
   AI keys are never included. The file is useless without the passphrase; there is no way to recover a forgotten passphrase. */
export interface StoreLike { keys(): string[]; get(k: string): string | null; set(k: string, v: string): void }
export const INCLUDE = /^(nm_|notesmaker_)/; export const EXCLUDE = /(^ai_cfg_|api[_-]?key|token|secret|^nm_errcfg$)/i;
const b64 = (u: Uint8Array) => { let s = ''; u.forEach(x => { s += String.fromCharCode(x); }); return btoa(s); }; const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const ITER = 210_000;
async function keyFrom(pass: string, salt: Uint8Array, iter: number) { const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }
export function collect(s: StoreLike): Record<string, string> { const o: Record<string, string> = {}; for (const k of s.keys()) if (INCLUDE.test(k) && !EXCLUDE.test(k)) { const v = s.get(k); if (v != null && v.length < 3_000_000) o[k] = v; } return o; }
export async function exportBackup(pass: string, s: StoreLike, iter = ITER): Promise<string> {
  if (pass.length < 8) throw new Error('Use a passphrase of at least 8 characters.'); const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)); const key = await keyFrom(pass, salt, iter);
  const plain = new TextEncoder().encode(JSON.stringify({ at: Date.now(), data: collect(s) })); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  return JSON.stringify({ kind: 'nm-backup', v: 1, iter, salt: b64(salt), iv: b64(iv), data: b64(ct) });
}
export async function importBackup(file: string, pass: string, s: StoreLike): Promise<{ restored: number; at: number }> {
  let j: { kind?: string; v?: number; iter?: number; salt?: string; iv?: string; data?: string }; try { j = JSON.parse(file); } catch { throw new Error('This is not a backup file.'); } if (j.kind !== 'nm-backup' || j.v !== 1 || !j.salt || !j.iv || !j.data) throw new Error('This is not a Notes Maker backup file.');
  let plain: string; try { const key = await keyFrom(pass, unb64(j.salt), Math.min(Math.max(j.iter ?? ITER, 1000), 1_000_000)); plain = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(j.iv) as BufferSource }, key, unb64(j.data) as BufferSource)); } catch { throw new Error('Wrong passphrase, or the file is damaged.'); }
  const o = JSON.parse(plain) as { at: number; data: Record<string, string> }; let n = 0; for (const [k, v] of Object.entries(o.data ?? {})) if (INCLUDE.test(k) && !EXCLUDE.test(k) && typeof v === 'string') { s.set(k, v); n++; } return { restored: n, at: o.at };
}
export const browserStore = (): StoreLike => ({ keys: () => { const a: string[] = []; try { for (let i = 0; i < localStorage.length; i++) a.push(localStorage.key(i)!); } catch { /* blocked */ } return a; }, get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* full */ } } });
