// Resets the "Alice & Bob" demo world to its pristine seeded starting point:
// deletes the world with ALL derived rows and assets, then re-runs the seed.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, ASSET_DIR } from '../server/db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const world = db.prepare(`SELECT w.* FROM worlds w JOIN users u ON u.id=w.user_id WHERE u.email='demo@vivarium.local' AND w.title='Alice & Bob'`).get();

if (world) {
  const assets = db.prepare('SELECT file FROM assets WHERE world_id=?').all(world.id);
  const tx = db.transaction(() => {
    for (const t of ['relationships', 'paths', 'state_patches', 'memory_chunks', 'chat_logs', 'assets', 'branches', 'video_jobs', 'provider_calls']) {
      db.prepare(`DELETE FROM ${t} WHERE world_id=?`).run(world.id);
    }
    db.prepare('DELETE FROM worlds WHERE id=?').run(world.id); // cascades characters, locations, ticks
  });
  tx();
  for (const a of assets) fs.rmSync(path.join(ASSET_DIR, a.file), { force: true });
  fs.rmSync(path.join(path.dirname(ASSET_DIR), 'tmp_export'), { recursive: true, force: true });
  console.log(`deleted world ${world.id} (+${assets.length} asset files)`);
} else {
  console.log('no existing demo world');
}
db.close();
execFileSync('node', [path.join(ROOT, 'scripts', 'seed_demo.js')], { stdio: 'inherit' });
console.log('demo world reset complete');
