import assert from 'node:assert/strict';
import { exportBackup, importBackup, collect } from '../src/lib/platform/backup.ts';
import type { StoreLike } from '../src/lib/platform/backup.ts';
import { saveProfile, getProfile, checkPin, canOpen } from '../src/lib/platform/profiles.ts';
import { testKV } from '../src/lib/friday/learn.ts';
const mk = (o: Record<string, string>): StoreLike & { m: Map<string, string> } => { const m = new Map(Object.entries(o)); return { m, keys: () => [...m.keys()], get: k => m.get(k) ?? null, set: (k, v) => { m.set(k, v); } }; };
const a = mk({ nm_deck: '{"cards":[1,2,3]}', nm_student_model: '{"ev":[]}', notesmaker_text_Physics: 'my private notes', ai_cfg_gemini: '{"apiKey":"AIzaSECRET"}', nm_errcfg: '{"sentryDsn":"https://k@h/1"}', random_other: 'x', nm_api_token: 'tok' });
assert.deepEqual(Object.keys(collect(a)).sort(), ['nm_deck', 'nm_student_model', 'notesmaker_text_Physics']);
const file = await exportBackup('correct horse', a, 2000); assert.ok(!/private notes|AIza|cards/.test(file), 'ciphertext does not leak plaintext');
const b = mk({}); const r = await importBackup(file, 'correct horse', b); assert.equal(r.restored, 3); assert.equal(b.get('notesmaker_text_Physics'), 'my private notes'); assert.equal(b.get('ai_cfg_gemini'), null, 'API keys are never restored');
await assert.rejects(importBackup(file, 'wrong passphrase', mk({})), /Wrong passphrase/); await assert.rejects(importBackup('{bad', 'x', mk({})), /not a backup/); await assert.rejects(importBackup('{"kind":"other"}', 'x', mk({})), /not a Notes Maker backup/); await assert.rejects(exportBackup('short', a), /at least 8/);
const tampered = JSON.parse(file); tampered.data = tampered.data.slice(0, -4) + 'AAAA'; await assert.rejects(importBackup(JSON.stringify(tampered), 'correct horse', mk({})), /Wrong passphrase, or the file is damaged/);
// a hostile backup cannot write outside the app's own keys
const evil = mk({}); const f2 = await exportBackup('correct horse', mk({ nm_x: '1' }), 2000); const j = JSON.parse(f2); assert.ok((await importBackup(f2, 'correct horse', evil)).restored === 1);
// profiles
const kv = testKV(); assert.equal(getProfile(kv), null); const p = await saveProfile({ name: '  Ms Rao ', role: 'teacher', pin: '4821' }, kv); assert.equal(p.name, 'Ms Rao'); assert.ok(p.pin && p.pin !== '4821' && p.pin.length === 64, 'PIN is hashed'); assert.ok(await checkPin(p, '4821')); assert.ok(!(await checkPin(p, '1111')));
await assert.rejects(saveProfile({ name: 'x', role: 'teacher', pin: 'abc' }, kv), /4 to 8 digits/); const s = await saveProfile({ name: 'Asha', role: 'student' }, kv); assert.ok(!s.pin); assert.equal(getProfile(kv)!.id, p.id, 'id is kept');
assert.ok(canOpen('teacher', 'teach') && canOpen('student', 'practice') && !canOpen('student', 'teach') && canOpen(null, 'teach'));
console.log('backup + profiles OK');
