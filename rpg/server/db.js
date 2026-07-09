import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.VIV_DATA_DIR || path.join(ROOT, 'data');
export const ASSET_DIR = path.join(DATA_DIR, 'assets');
fs.mkdirSync(ASSET_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'vivarium.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT,
  display_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'player',
  status TEXT NOT NULL DEFAULT 'active', email_verified_at TEXT,
  google_sub TEXT, credit_balance INTEGER NOT NULL DEFAULT 0,
  daily_cap INTEGER NOT NULL DEFAULT 500000000,
  created_at TEXT NOT NULL, last_active_at TEXT
);
CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, code TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  realm TEXT NOT NULL DEFAULT 'player', expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, art_style TEXT NOT NULL DEFAULT 'anime',
  sim_time TEXT, tick_index INTEGER NOT NULL DEFAULT 0,
  genre TEXT DEFAULT 'slice-of-life', mood TEXT DEFAULT 'cosy',
  pacing REAL DEFAULT 0.4, directives TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'authoring', cover_asset_id TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY, world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL, base_profile TEXT NOT NULL, materialised TEXT NOT NULL,
  reference_asset_id TEXT, voice TEXT DEFAULT 'Sulafat', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS state_patches (
  id TEXT PRIMARY KEY, world_id TEXT NOT NULL, entity_ref TEXT NOT NULL, entity_id TEXT NOT NULL,
  idx INTEGER NOT NULL, tick_ref INTEGER, author TEXT NOT NULL, category TEXT NOT NULL,
  op TEXT NOT NULL, path TEXT NOT NULL, value TEXT, reason TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY, world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL, type TEXT DEFAULT 'room', place_group TEXT DEFAULT '',
  description TEXT DEFAULT '', background_asset_id TEXT, x REAL DEFAULT 0, y REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS paths (
  id TEXT PRIMARY KEY, world_id TEXT NOT NULL, from_id TEXT NOT NULL, to_id TEXT NOT NULL, label TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY, world_id TEXT NOT NULL, from_id TEXT NOT NULL, to_id TEXT NOT NULL,
  description TEXT NOT NULL, strength REAL DEFAULT 0.5, history TEXT DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS ticks (
  id TEXT PRIMARY KEY, world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL, sim_time TEXT NOT NULL, time_delta TEXT NOT NULL,
  intervention TEXT, states TEXT NOT NULL, narration TEXT NOT NULL,
  mood_tag TEXT, summary TEXT, cost TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, world_id TEXT,
  kind TEXT NOT NULL, owner_ref TEXT, prompt TEXT, prompt_hash TEXT,
  file TEXT NOT NULL, mime TEXT NOT NULL, w INTEGER, h INTEGER, meta TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, world_id TEXT, tick_ref INTEGER,
  delta INTEGER NOT NULL, reason TEXT NOT NULL, provider TEXT, model TEXT,
  raw_cost_usd REAL DEFAULT 0, meter TEXT DEFAULT '{}', created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_logs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, world_id TEXT, surface TEXT NOT NULL,
  role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS model_routes (
  role TEXT PRIMARY KEY, model TEXT NOT NULL, base_url TEXT NOT NULL,
  key_env TEXT NOT NULL DEFAULT 'HYPRLAB_API_KEY', unit_cost TEXT NOT NULL,
  params TEXT DEFAULT '{}', enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS memory_chunks (
  id TEXT PRIMARY KEY, world_id TEXT NOT NULL, level INTEGER NOT NULL DEFAULT 1,
  start_idx INTEGER NOT NULL, end_idx INTEGER NOT NULL,
  text TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memchunks_world ON memory_chunks(world_id, level, start_idx);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS admin_audit (
  id TEXT PRIMARY KEY, admin_id TEXT NOT NULL, action TEXT NOT NULL,
  target TEXT, payload TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY, world_id TEXT NOT NULL, parent_branch_id TEXT,
  fork_tick_idx INTEGER NOT NULL DEFAULT 0, label TEXT NOT NULL DEFAULT 'Main timeline',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_branches_world ON branches(world_id);
CREATE TABLE IF NOT EXISTS provider_calls (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, world_id TEXT, tick_ref INTEGER,
  kind TEXT NOT NULL, surface TEXT, request TEXT, response TEXT, asset_id TEXT,
  provider TEXT, model TEXT, raw_cost_usd REAL DEFAULT 0, meter TEXT DEFAULT '{}',
  meta TEXT DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_provcalls_user ON provider_calls(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_provcalls_world ON provider_calls(world_id, created_at);
CREATE TABLE IF NOT EXISTS video_jobs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, world_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', progress REAL DEFAULT 0, stage TEXT DEFAULT '',
  from_idx INTEGER, to_idx INTEGER, asset_id TEXT, error TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticks_world_idx ON ticks(world_id, idx);
CREATE INDEX IF NOT EXISTS idx_patches_entity ON state_patches(entity_id, idx);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON credit_ledger(user_id, created_at);
`);

// ---- lightweight migrations ----
try { db.exec(`ALTER TABLE relationships ADD COLUMN attributes TEXT DEFAULT '{}'`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE ticks ADD COLUMN pov_location_id TEXT`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE ticks ADD COLUMN branch_id TEXT`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE ticks ADD COLUMN rel_snapshot TEXT`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE worlds ADD COLUMN active_branch_id TEXT`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE worlds ADD COLUMN genesis_state TEXT`); } catch { /* exists */ }
// Cast suggestions the player DECLINED (JSON array of names, capped at ~10). Fed back into
// the Game Master's context so it doesn't keep re-suggesting the same walk-on character.
try { db.exec(`ALTER TABLE worlds ADD COLUMN cast_dismissed TEXT DEFAULT '[]'`); } catch { /* exists */ }
// Curiosity feature: per-world learning preferences {topics:[], custom:'', frequency:4}
// (topic picker on the Atlas). Facts the storyteller generates land in the `facts` table.
try { db.exec(`ALTER TABLE worlds ADD COLUMN curiosity TEXT DEFAULT '{}'`); } catch { /* exists */ }
// Account content rating: 'adult' (default) or 'teen' — teen accounts get a PG fade-to-black
// safety block appended to every story-generating prompt (see server/gm.js teenSafetyPrompt).
try { db.exec(`ALTER TABLE users ADD COLUMN rating TEXT DEFAULT 'adult'`); } catch { /* exists */ }
// When a character JOINED the story (the world's tick_index at creation). Rewinding the
// timeline below this hides them from scenes and excludes them from simulation — a
// character can't linger in scenes from before they were introduced. Genesis cast = 0.
try { db.exec(`ALTER TABLE characters ADD COLUMN intro_tick_idx INTEGER DEFAULT 0`); } catch { /* exists */ }
// Background music currently playing in this world (chosen by the GM's music tool from the
// RPG-music search server; JSON {row_id,title,url,query,genre,emotion}). Client fades it in/out.
try { db.exec(`ALTER TABLE worlds ADD COLUMN current_music TEXT`); } catch { /* exists */ }
// Per-LOCATION music memory: the track last chosen while a scene played here (JSON, same
// shape as worlds.current_music). Switching to a location with a different stored track
// crossfades the score client-side.
try { db.exec(`ALTER TABLE locations ADD COLUMN music TEXT`); } catch { /* exists */ }
// Cinematic sequence membership: ticks generated as one film (a world's opening sequence
// or a time-skip chapter) share a seq JSON {id,label,kind:'intro'|'chapter',pos,n} so the
// timeline can group them and replay the whole sequence as one piece.
try { db.exec(`ALTER TABLE ticks ADD COLUMN seq TEXT`); } catch { /* exists */ }
// The track that started playing AT this tick (JSON, when the score changed) — lets replays
// and exported films switch music at the right scenes.
try { db.exec(`ALTER TABLE ticks ADD COLUMN music TEXT`); } catch { /* exists */ }
// "Did you know" fact cards generated every Nth tick; read_at drives the unread shimmer.
db.exec(`CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY, world_id TEXT NOT NULL, tick_ref INTEGER, topic TEXT DEFAULT '',
  title TEXT NOT NULL, body TEXT NOT NULL, read_at TEXT, created_at TEXT NOT NULL
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_facts_world ON facts(world_id, created_at)`);
try { db.exec(`ALTER TABLE memory_chunks ADD COLUMN branch_id TEXT`); } catch { /* exists */ }
// Video export: which lines get voiced ('generate' = synthesise missing audio & bill the user;
// 'silent' = only reuse already-cached audio, leave the rest quiet & free). silent_lines records
// how many lines ended up quiet in the finished film so the UI can tell the user.
try { db.exec(`ALTER TABLE video_jobs ADD COLUMN audio_mode TEXT DEFAULT 'generate'`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE video_jobs ADD COLUMN silent_lines INTEGER DEFAULT 0`); } catch { /* exists */ }
// LAIONBox TTS (voice-cloning provider, see server/providers.js): each character can carry a
// REFERENCE VOICE — a short audio clip the model clones for every line. voice_ref_asset_id
// points at that clip (asset kind 'voice_ref'); voice_ref_prompt stores the DramaBox-style
// description it was generated from (age/gender/timbre…), shown & editable in the player UI.
// Both stay NULL under the Gemini provider, where characters.voice (a prebuilt name) is used.
try { db.exec(`ALTER TABLE characters ADD COLUMN voice_ref_asset_id TEXT`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE characters ADD COLUMN voice_ref_prompt TEXT`); } catch { /* exists */ }
// RPG fork: every playable world has ONE player character (the first-person protagonist) —
// the stage locks its point of view to them and the GM never decides for them.
try { db.exec(`ALTER TABLE worlds ADD COLUMN player_character_id TEXT`); } catch { /* exists */ }
// A tick can end on a DECISION STOP: the GM pauses the story at a significant choice for the
// player character and stores the question it asked the player here.
try { db.exec(`ALTER TABLE ticks ADD COLUMN decision TEXT`); } catch { /* exists */ }
// World Wizard: background scenario-builder jobs (mirrors video_jobs' shape). `log` collects a
// human-readable build diary (one line per step incl. retries/moderation fallbacks) that the
// wizard screen streams to the user while the world is being assembled.
db.exec(`CREATE TABLE IF NOT EXISTS wizard_jobs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, world_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued', progress REAL DEFAULT 0, stage TEXT DEFAULT '',
  log TEXT DEFAULT '[]', plan TEXT, error TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
)`);

// ---- default model routes & pricing policy ----
const seedRoute = db.prepare(`INSERT OR IGNORE INTO model_routes(role, model, base_url, key_env, unit_cost, params) VALUES (?,?,?,?,?,?)`);
seedRoute.run('reasoning_llm', 'gemini-3.5-flash', 'https://api.hyprlab.io/v1', 'HYPRLAB_API_KEY',
  JSON.stringify({ in_per_mtok: 0.75, out_per_mtok: 4.5 }), JSON.stringify({ max_tokens: 8000 }));
seedRoute.run('image', 'nano-banana-2', 'https://api.hyprlab.io/v1', 'HYPRLAB_API_KEY',
  JSON.stringify({ per_image: 0.02 }), JSON.stringify({ resolution: '1K' }));
seedRoute.run('tts', 'gemini-3.1-flash-tts', 'https://api.hyprlab.io/v1beta', 'HYPRLAB_API_KEY',
  JSON.stringify({ in_per_mtok: 0.5, out_per_mtok: 10 }), JSON.stringify({ temperature: 0.9 }));
seedRoute.run('asr', 'whisper-1', 'https://api.hyprlab.io/v1', 'HYPRLAB_API_KEY',
  JSON.stringify({ per_minute: 0.0042 }), JSON.stringify({}));
// LAIONBox TTS (self-hosted expressive voice-acting server, see laionbox-tts.txt). No API key —
// key_env 'NONE' means providers.js sends no auth. per_minute pricing is a NOMINAL internal
// charge (the box is self-hosted); admins tune it in the Models tab like any other route.
seedRoute.run('tts_laionbox', 'laionbox-v0.7-step19000', 'http://45.38.21.39:8930', 'NONE',
  JSON.stringify({ per_minute: 0.01 }), JSON.stringify({ cfg_scale: 2.5, stg_scale: 1.5, output: 'vc_sidon', duration_multiplier: 0.75 }));
// Which TTS engine the app uses: 'gemini' (prebuilt voices) | 'laionbox' (cloned reference
// voices). Toggled from the admin Models tab; read by providers.tts() and the client (via /api/me).
db.prepare(`INSERT OR IGNORE INTO settings(key,value) VALUES ('tts_provider', ?)`).run(JSON.stringify('gemini'));
db.prepare(`INSERT OR IGNORE INTO settings(key,value) VALUES ('pricing', ?)`)
  .run(JSON.stringify({ markup: 2.5, credits_per_usd: 100, signup_bonus_credits: 200, default_daily_cap_credits: 500, per_tick_ceiling_credits: 20 }));
// (gm_core_directives — the storytelling block in every tick prompt — intentionally has NO
// seed here: server/gm.js gmCoreDirectives() falls back to GM_CORE_DEFAULT when unset, so
// the default lives in exactly one place. The admin Prompts page writes the setting.)
// Context / memory tuning — admin-editable on the Context page (see server/gm.js ctxConfig()).
db.prepare(`INSERT OR IGNORE INTO settings(key,value) VALUES ('context_config', ?)`)
  .run(JSON.stringify({ tickWindow: 50, memChunk: 5, contextBudget: 200000, compressionRatio: 0.5 }));

export const now = () => new Date().toISOString();
export const uid = (p = '') => p + randomBytes(9).toString('base64url');
export const j = (o) => JSON.stringify(o);
export const pj = (s, fallback = null) => { try { return JSON.parse(s); } catch { return fallback; } };
export function getSetting(key) { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key); return r ? JSON.parse(r.value) : null; }
export function setSetting(key, value) { db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); }
