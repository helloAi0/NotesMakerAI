// Storage for the Notes Maker server. Two backends behind one tiny interface { load(), save(db) }:
//   JSON file (default, simplest)            NM_DATA=./data.json
//   SQLite (durable, transactional, WAL)     NM_DATA=./data.sqlite   (uses Node's built-in node:sqlite; Node 22.5+; single server instance)
// Each top-level collection (users, listings, ...) is one row, written in one transaction only when it changed. An existing JSON file is imported on first SQLite start.
import fs from 'node:fs'; import path from 'node:path';
export const isSqlite = spec => /\.(sqlite3?|db)$/i.test(spec) || /^sqlite:/i.test(spec);
export function openStore(spec) {
  if (!isSqlite(spec)) return {
    kind: 'json', load: () => { try { return JSON.parse(fs.readFileSync(spec, 'utf8')); } catch { return {}; } },
    save: db => { fs.mkdirSync(path.dirname(path.resolve(spec)), { recursive: true }); const tmp = spec + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, spec); },
  };
  const file = spec.replace(/^sqlite:/i, ''); fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  let DatabaseSync; try { ({ DatabaseSync } = process.getBuiltinModule ? process.getBuiltinModule('node:sqlite') : null) ?? {}; } catch { /* old Node */ }
  if (!DatabaseSync) throw new Error('SQLite storage needs Node 22.5 or newer (node:sqlite). Use a .json NM_DATA path instead.');
  const d = new DatabaseSync(file); d.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
  const last = new Map(); const get = d.prepare('SELECT k, v FROM kv'), put = d.prepare('INSERT INTO kv(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'), del = d.prepare('DELETE FROM kv WHERE k = ?');
  return {
    kind: 'sqlite', file,
    load() { const out = {}; for (const r of get.all()) { last.set(r.k, r.v); out[r.k] = JSON.parse(r.v); } const legacy = file.replace(/\.(sqlite3?|db)$/i, '.json'); if (!Object.keys(out).length && fs.existsSync(legacy)) { try { const j = JSON.parse(fs.readFileSync(legacy, 'utf8')); console.log('Importing', legacy, 'into SQLite'); return j; } catch { /* ignore */ } } return out; },
    save(db) { const ch = []; for (const [k, v] of Object.entries(db)) { const s = JSON.stringify(v); if (last.get(k) !== s) ch.push([k, s]); } const gone = [...last.keys()].filter(k => !(k in db)); if (!ch.length && !gone.length) return; d.exec('BEGIN'); try { for (const [k, s] of ch) put.run(k, s); for (const k of gone) del.run(k); d.exec('COMMIT'); } catch (e) { d.exec('ROLLBACK'); throw e; } for (const [k, s] of ch) last.set(k, s); for (const k of gone) last.delete(k); },
    close() { d.close(); },
  };
}
