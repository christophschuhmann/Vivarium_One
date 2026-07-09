// Vivarium RPG seed — ACCOUNTS ONLY, no worlds. The RPG fork starts with a clean slate:
// the player's first act is creating THEIR character & world in the wizard, so unlike the
// parent game's seed_demo.js nothing pre-built is installed here.
// Run: VIV_DATA_DIR=<data dir> node scripts/seed_rpg.js
import { db, uid, now } from '../server/db.js';
import { hashPassword } from '../server/auth.js';
import { record, toMicro } from '../server/credits.js';

function ensureUser(email, password, name, role, credits, verified = true) {
  let u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!u) {
    const id = uid('u_');
    db.prepare(`INSERT INTO users(id,email,password_hash,display_name,role,status,credit_balance,daily_cap,email_verified_at,created_at)
                VALUES (?,?,?,?,?,'active',0,?,?,?)`)
      .run(id, email, hashPassword(password), name, role, toMicro(1000), verified ? now() : null, now());
    record(id, { delta: toMicro(credits), reason: 'admin_grant', createdBy: 'seed' });
    u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    console.log(`created ${role}: ${email} / ${password}`);
  } else console.log(`exists: ${email}`);
  return u;
}

ensureUser('admin@vivarium.local', 'admin-vivarium-2026', 'The Operator', 'admin', 1000);
ensureUser('demo@vivarium.local', 'alice-and-bob', 'Player One', 'player', 500);
console.log('RPG seed complete — no worlds; the wizard builds the first one.');
