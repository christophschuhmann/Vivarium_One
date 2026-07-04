// Verifies the tick concurrency lock, then primes the demo world with a few ticks
// (including a location change) so downstream E2E suites have real history to test against.
import { db } from '../server/db.js';
import * as gm from '../server/gm.js';

const user = db.prepare("SELECT u.* FROM users u WHERE u.email='demo@vivarium.local'").get();
const world = () => db.prepare("SELECT * FROM worlds WHERE title='Alice & Bob' AND user_id=?").get(user.id);
const alice = () => db.prepare('SELECT id FROM characters WHERE world_id=? ORDER BY created_at LIMIT 1').get(world().id).id;

// ---- concurrency lock test: fire two ticks at once, second must be rejected ----
const w0 = world();
const p1 = gm.runTick(user, w0, { timeDelta: '+5m' }).then(t => ({ ok: true, idx: t.idx })).catch(e => ({ ok: false, code: e.code, msg: e.message }));
const p2 = gm.runTick(user, w0, { timeDelta: '+5m' }).then(t => ({ ok: true, idx: t.idx })).catch(e => ({ ok: false, code: e.code, msg: e.message }));
const [r1, r2] = await Promise.all([p1, p2]);
const oneRejected = [r1, r2].some(r => !r.ok && r.code === 'TICK_IN_PROGRESS');
const oneAccepted = [r1, r2].some(r => r.ok);
console.log('concurrent ticks:', r1, r2, '| lock worked:', oneRejected && oneAccepted);
if (!oneRejected || !oneAccepted) throw new Error('concurrency lock did not behave as expected');

// ---- prime with a location-changing tick so scene/pacing tests have real content ----
const t2 = await gm.runTick(user, world(), { timeDelta: '+3h', perspective: { type: 'character', id: alice() } });
console.log('primed tick', t2.idx, '@', t2.pov_location_id);

const dupes = db.prepare('SELECT world_id, idx, COUNT(*) n FROM ticks GROUP BY world_id, idx HAVING n>1').all();
console.log('duplicate ticks after concurrent test:', dupes.length);
if (dupes.length) throw new Error('UNIQUE constraint did not prevent duplicates');

console.log('\nLOCK + PRIME TEST PASSED');
process.exit(0);
