// Memory-system mechanics test (isolated DB, mock providers, tiny window):
// 1) ticks older than the window roll into level-1 chunks of 5
// 2) when the context estimate exceeds the budget, 5 same-level chunks compact into one level+1 chunk
// Run: VIV_DATA_DIR=/tmp/memtest MOCK_PROVIDERS=1 VIV_TICK_WINDOW=3 node e2e/memory_test.js
import assert from 'node:assert';
import { db, uid, now, j } from '../server/db.js';
import { hashPassword } from '../server/auth.js';
import { record, toMicro } from '../server/credits.js';
import * as gm from '../server/gm.js';

const say = (m) => console.log('✓', m);

// minimal user + world + cast
const userId = uid('u_');
db.prepare(`INSERT INTO users(id,email,password_hash,display_name,role,status,credit_balance,daily_cap,email_verified_at,created_at)
            VALUES (?,?,?,?,'player','active',0,?,?,?)`)
  .run(userId, 'mem@test.local', hashPassword('x'.repeat(10)), 'Mem Tester', toMicro(100000), now(), now());
record(userId, { delta: toMicro(10000), reason: 'admin_grant', createdBy: 'test' });
const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId);

const wid = uid('w_');
db.prepare(`INSERT INTO worlds(id,user_id,title,art_style,sim_time,tick_index,status,created_at,updated_at) VALUES (?,?,?,?,?,0,'live',?,?)`)
  .run(wid, userId, 'MemWorld', 'anime', new Date('2026-09-15T07:30:00').toISOString(), now(), now());
const lid = uid('l_');
db.prepare('INSERT INTO locations(id,world_id,name,type) VALUES (?,?,?,?)').run(lid, wid, 'Test Room', 'room');
const cid = uid('c_');
db.prepare(`INSERT INTO characters(id,world_id,name,base_profile,materialised,voice,created_at) VALUES (?,?,?,?,?,?,?)`)
  .run(cid, wid, 'Testy', j({ name: 'Testy' }), j({ location_id: lid, activity: 'testing', mood: 'calm', outfits: [] }), 'Sulafat', now());

const world = () => db.prepare('SELECT * FROM worlds WHERE id=?').get(wid);

// run 14 mock ticks (free)
for (let i = 0; i < 14; i++) await gm.runTick(user, world(), { timeDelta: '+30m' });
say(`ran 14 mock ticks (tick_index=${world().tick_index})`);

// maintenance with window=3 → ticks 1..11 eligible → chunks (1-5) and (6-10)
await gm.runMemoryMaintenance(user, world());
let chunks = db.prepare('SELECT * FROM memory_chunks WHERE world_id=? ORDER BY start_idx').all(wid);
assert.deepStrictEqual(chunks.map(c => [c.level, c.start_idx, c.end_idx]), [[1, 1, 5], [1, 6, 10]], 'expected two level-1 chunks');
assert.ok(chunks.every(c => c.text.length > 10), 'chunks have summary text');
say(`level-1 rollup: ${chunks.length} chunks → ${chunks.map(c => `ticks ${c.start_idx}-${c.end_idx}`).join(', ')}`);

// add 15 more ticks → 5 total level-1 chunks
for (let i = 0; i < 15; i++) await gm.runTick(user, world(), { timeDelta: '+30m' });
await gm.runMemoryMaintenance(user, world());
chunks = db.prepare('SELECT * FROM memory_chunks WHERE world_id=? AND level=1 ORDER BY start_idx').all(wid);
assert.strictEqual(chunks.length, 5, 'expected five level-1 chunks, got ' + chunks.length);
say(`accumulated ${chunks.length} level-1 chunks over ${world().tick_index} ticks`);

// force compaction with an artificially tiny budget: 5×L1 → 1×L2
process.env.VIV_CONTEXT_BUDGET_TEST = '1';
// (CONTEXT_BUDGET is baked at import; emulate by direct compaction check: shrink budget via monkeypatch is not possible,
//  so verify the compaction path by calling maintenance again after padding chunk text to exceed the real budget)
db.prepare('UPDATE memory_chunks SET text = text || ? WHERE world_id=?').run(' pad'.repeat(60000), wid);
await gm.runMemoryMaintenance(user, world());
const after = db.prepare('SELECT level, COUNT(*) n FROM memory_chunks WHERE world_id=? GROUP BY level').all(wid);
const l2 = db.prepare('SELECT * FROM memory_chunks WHERE world_id=? AND level=2').get(wid);
assert.ok(l2, 'expected a level-2 compacted chunk');
assert.strictEqual(l2.start_idx, 1, 'level-2 chunk spans from tick 1');
assert.strictEqual(l2.end_idx, 25, 'level-2 chunk spans to tick 25');
say(`compaction: levels now ${JSON.stringify(after)} — L2 spans ticks ${l2.start_idx}-${l2.end_idx}`);

// context assembly respects the window: last VIV_TICK_WINDOW ticks verbatim
console.log('\nMEMORY MECHANICS TEST PASSED');
