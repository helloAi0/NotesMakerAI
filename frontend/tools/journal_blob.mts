import assert from 'node:assert/strict';
import { memoryVfs } from '../src/lib/friday/vfs.ts';
import { Journal, memBlobStore } from '../src/lib/friday/agents/journal.ts';
import { testKV } from '../src/lib/friday/learn.ts';
const v = memoryVfs(); await v.ready(); const kv = testKV(), blobs = memBlobStore();
await v.writeBlob('/Documents/scan.pdf', new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'application/pdf' }), 'scan text', 1);
let j = new Journal(v, kv, 'j', blobs); const act = await j.begin('delete scan'); await v.remove('/Documents/scan.pdf', true); await act.end(); assert.ok(!v.exists('/Documents/scan.pdf'));
// “reload”: a brand-new Journal reads the persisted entries; the VFS object stays (same as IndexedDB would)
j = new Journal(v, kv, 'j', blobs); const r = await j.undo(); assert.ok(r.ok, r.message); assert.ok(!/could not be kept/.test(r.message), r.message);
const n = v.stat('/Documents/scan.pdf'); assert.ok(n && n.blob, 'binary node restored'); assert.deepEqual([...new Uint8Array(await n!.blob!.arrayBuffer())], [1, 2, 3, 4, 5]); assert.equal(n!.pages, 1);
// overwrite of a binary file
const a2 = await j.begin('overwrite'); await v.writeBlob('/Documents/scan.pdf', new Blob([new Uint8Array([9, 9])], { type: 'application/pdf' }), 'new', 1); await a2.end();
j = new Journal(v, kv, 'j', blobs); await j.undo(); assert.deepEqual([...new Uint8Array(await v.stat('/Documents/scan.pdf')!.blob!.arrayBuffer())], [1, 2, 3, 4, 5]);
// in the same session the bytes are still referenced, so undo is lossless even without a blob store
const v2 = memoryVfs(); await v2.ready(); await v2.writeBlob('/a.bin', new Blob([new Uint8Array([7])], { type: 'application/octet-stream' })); const j2 = new Journal(v2, testKV(), 'k'); const a3 = await j2.begin('rm'); await v2.remove('/a.bin', true); await a3.end(); const m = await j2.undo(); assert.ok(m.ok && v2.stat('/a.bin')?.blob, m.message);
console.log('journal binary undo OK');
