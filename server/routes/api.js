// Player API — every UI action is exactly one endpoint here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { db, uid, now, j, pj, DATA_DIR } from '../db.js';
import * as auth from '../auth.js';
import { requireUser, requireVerified, httpErr } from '../auth.js';
import { toCredits, preflight, debitCall, EST, spentToday, balance } from '../credits.js';
import * as gm from '../gm.js';
import { asr, getTtsProvider, laionboxGenerate } from '../providers.js';   // line TTS itself lives in tts_service.js
import { getAsset, assetPath, saveAsset, findCached } from '../assets.js';
import { logCall } from '../telemetry.js';
import * as branches from '../branches.js';
import { assembleCues, cueVoiceStyle, ttsCacheKey, cueCacheVoice } from '../export_cues.js';
import { synthesizeLine, findReusableAudio } from '../tts_service.js';
import { PROFILES } from '../voice_profiles.js';
import { buildWorldManifest, worldAssetFiles, importWorldManifest } from '../world_io.js';
import { wizardChat, estimatePlan, startWizardBuild, getWizardJob } from '../wizard.js';

// Temp scratch for zip pack/unpack; cleaned per request.
const EXPORT_TMP = path.join(DATA_DIR, 'tmp_export');
// web/ directory (player.html lives there and is copied into every story bundle) —
// derived from this file's location, independent of any VIV_DATA_DIR override
const ROOT_WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');
fs.mkdirSync(EXPORT_TMP, { recursive: true });
function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'], ...opts });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(-400)}`)));
    p.on('error', reject);
  });
}

// Import the bundled starter scenario for a user (idempotent enough: call once per account).
const TEMPLATE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'templates', 'open-intellect');
export function importTemplateWorld(userId) {
  const mf = path.join(TEMPLATE_DIR, 'manifest.json');
  if (!fs.existsSync(mf)) return null;                      // no template built on this install
  const manifest = pj(fs.readFileSync(mf, 'utf8'), null);
  if (!manifest) return null;
  return importWorldManifest({ id: userId }, manifest, path.join(TEMPLATE_DIR, 'assets'));
}

const publicUser = (u) => ({ id: u.id, email: u.email, displayName: u.display_name, verified: !!u.email_verified_at, credits: Math.floor(toCredits(u.credit_balance) * 10) / 10, role: u.role, rating: u.rating || 'adult' });

// Propagate a character's current outfit list into every tick's state snapshot, so a
// regenerated / deleted sprite shows up in EXISTING scenes (films, replays, the timeline read
// the sprite from the tick snapshot, not the live character). Matches outfits by name.
function syncOutfitsToTicks(worldId, charId, outfits) {
  for (const t of db.prepare('SELECT id, states FROM ticks WHERE world_id=?').all(worldId)) {
    const states = pj(t.states, []);
    const s = states.find(x => x.character_id === charId);
    if (!s) continue;
    // keep the scene's worn-outfit name; refresh the image ids from the current list
    const byName = new Map((outfits || []).map(o => [o.name, o]));
    s.outfits = (s.outfits || []).map(o => byName.get(o.name) || o);
    // add any brand-new outfits too (so a fresh sprite is available), and drop deleted ones
    for (const o of outfits || []) if (!s.outfits.some(x => x.name === o.name)) s.outfits.push(o);
    s.outfits = s.outfits.filter(o => byName.has(o.name));
    if (!byName.has(s.outfit)) s.outfit = outfits?.[0]?.name || s.outfit;
    db.prepare('UPDATE ticks SET states=? WHERE id=?').run(j(states), t.id);
  }
}

function ownWorld(user, id) {
  const w = db.prepare('SELECT * FROM worlds WHERE id=? AND user_id=?').get(id, user.id);
  if (!w) throw httpErr(404, 'NOT_FOUND', 'World not found.');
  return w;
}
const charOut = (c) => ({
  id: c.id, name: c.name, voice: c.voice, base: pj(c.base_profile, {}), state: pj(c.materialised, {}),
  intro_tick_idx: c.intro_tick_idx || 0,   // when they joined — the client hides them below this
  reference_asset_id: c.reference_asset_id,
  // LAIONBox cloned-voice state (null under Gemini): the assigned reference clip + the
  // DramaBox description it was generated from (players can view/edit it in the voice popup)
  voice_ref_asset_id: c.voice_ref_asset_id || null,
  voice_ref_prompt: c.voice_ref_prompt || null,
});

export default async function apiRoutes(app) {
  // ---------- auth ----------
  app.post('/api/auth/signup', async (req, reply) => {
    const { email, password, displayName, rating } = req.body || {};
    const u = auth.signup({ email, password, displayName, rating });
    // every new account starts with the "Open Intellect" demo scenario (a full template
    // world incl. cast, art and the cinematic opening sequence) — imported in the background
    // so signup stays instant; see scripts/build_open_intellect.mjs for how it's made.
    setImmediate(() => { try { importTemplateWorld(u.id); } catch (e) { console.error('[template]', e.message); } });
    return { ok: true, userId: u.id, message: 'Check your email for a 6-digit verification code.' };
  });
  app.post('/api/auth/verify', async (req, reply) => {
    const u = auth.verifyEmail(req.body?.email, req.body?.code);
    reply.setCookie('vsession', auth.createSession(u.id), { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 7 * 86400 });
    return { ok: true, user: publicUser({ ...u, email_verified_at: now() }) };
  });
  app.post('/api/auth/resend', async (req) => {
    const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(req.body?.email || '').toLowerCase());
    if (u && !u.email_verified_at) auth.issueVerification(u.id, u.email);
    return { ok: true };
  });
  app.post('/api/auth/login', async (req, reply) => {
    const u = auth.login(req.body?.email, req.body?.password);
    reply.setCookie('vsession', auth.createSession(u.id), { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 7 * 86400 });
    return { ok: true, user: publicUser(u) };
  });
  app.post('/api/auth/logout', async (req, reply) => {
    if (req.cookies?.vsession) auth.destroySession(req.cookies.vsession);
    reply.clearCookie('vsession', { path: '/' });
    return { ok: true };
  });
  app.get('/api/auth/google', async (req, reply) => {
    if (!process.env.GOOGLE_CLIENT_ID) throw httpErr(501, 'OAUTH_NOT_CONFIGURED', 'Google sign-in is not configured on this server yet — use email sign-up.');
    const redirect = `${req.protocol}://${req.headers.host}/api/auth/google/callback`;
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirect, response_type: 'code', scope: 'openid email profile' });
    reply.redirect(url);
  });

  app.get('/api/me', async (req) => {
    const u = requireUser(req);
    // ttsProvider tells the client which voice UI to show: Gemini voice names vs
    // LAIONBox reference-voice management (generate/upload/confirm a cloned voice).
    return { user: publicUser(u), spentToday: toCredits(spentToday(u.id)), ttsProvider: getTtsProvider() };
  });
  app.get('/api/me/ledger', async (req) => {
    const u = requireUser(req);
    const rows = db.prepare('SELECT * FROM credit_ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 200').all(u.id);
    return { ledger: rows.map(r => ({ at: r.created_at, credits: toCredits(r.delta), reason: r.reason, model: r.model, meter: pj(r.meter, {}) })) };
  });

  // Generate (or regenerate) a world's cover/preview image for the home cards. Prompt is
  // player-editable in the 🎬 Direction modal; default is derived from the world identity.
  app.post('/api/worlds/:id/cover', async (req) => {
    const u = requireVerified(req);
    const w = ownWorld(u, req.params.id);
    const prompt = String(req.body?.prompt || `cinematic key art for a story called "${w.title}", genre ${w.genre}, mood ${w.mood}`).slice(0, 600)
      + ',  -  warm & bright colors, very nice HQ Anime style, ghiblhi style, cinematic key art poster, dramatic lighting, widescreen';
    preflight(u.id, EST.image());
    const { genImage } = await import('../providers.js');
    const res = await genImage(prompt, { aspect: '16:9' });
    debitCall(u.id, res, 'cover', { worldId: w.id });
    const a = saveAsset({ userId: u.id, worldId: w.id, kind: 'cover', prompt, buffer: res.buffer, mime: 'image/png' });
    db.prepare('UPDATE worlds SET cover_asset_id=?, updated_at=? WHERE id=?').run(a.id, now(), w.id);
    return { coverId: a.id };
  });

  // Default world-direction text (for the 🎬 modal's reset button — single source: gm.js).
  app.get('/api/world-direction-default', async (req) => {
    requireUser(req);
    return { directives: gm.DEFAULT_WORLD_DIRECTIVES };
  });

  // ---------- curiosity ("Did you know" learning cards) ----------
  // Per-world preferences: which topics to learn about, how often a fact is due.
  app.patch('/api/worlds/:id/curiosity', async (req) => {
    const u = requireUser(req);
    const w = ownWorld(u, req.params.id);
    const b = req.body || {};
    const cfg = {
      topics: (Array.isArray(b.topics) ? b.topics : []).map(t => String(t).slice(0, 60)).slice(0, 20),
      custom: String(b.custom || '').slice(0, 300),
      frequency: Math.max(1, Math.min(20, +b.frequency || 4)),
    };
    db.prepare('UPDATE worlds SET curiosity=?, updated_at=? WHERE id=?').run(j(cfg), now(), w.id);
    return { curiosity: cfg };
  });
  app.get('/api/worlds/:id/facts', async (req) => {
    const u = requireUser(req);
    const w = ownWorld(u, req.params.id);
    const rows = db.prepare('SELECT * FROM facts WHERE world_id=? ORDER BY created_at DESC LIMIT 50').all(w.id);
    return { facts: rows, unread: rows.filter(r => !r.read_at).length, curiosity: gm.curiosityCfg(w) };
  });
  app.post('/api/facts/:id/read', async (req) => {
    const u = requireUser(req);
    const f = db.prepare('SELECT f.* FROM facts f JOIN worlds w ON w.id=f.world_id WHERE f.id=? AND w.user_id=?').get(req.params.id, u.id);
    if (!f) throw httpErr(404, 'NOT_FOUND', 'Fact not found.');
    if (!f.read_at) db.prepare('UPDATE facts SET read_at=? WHERE id=?').run(now(), f.id);
    return { ok: true };
  });

  // ---------- worlds ----------
  app.get('/api/worlds', async (req) => {
    const u = requireUser(req);
    const rows = db.prepare('SELECT * FROM worlds WHERE user_id=? ORDER BY updated_at DESC').all(u.id);
    return { worlds: rows.map(w => ({
      ...w,
      characters: db.prepare('SELECT id,name,reference_asset_id FROM characters WHERE world_id=?').all(w.id),
      // worlds with a cinematic cold open get a "▶ From the beginning" button on their card
      has_intro: !!db.prepare(`SELECT 1 FROM ticks WHERE world_id=? AND seq LIKE '%"kind":"intro"%' LIMIT 1`).get(w.id),
    })) };
  });
  app.post('/api/worlds', async (req) => {
    const u = requireVerified(req);
    const id = uid('w_');
    const title = (req.body?.title || 'Untitled world').slice(0, 80);
    db.prepare(`INSERT INTO worlds(id,user_id,title,art_style,sim_time,directives,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, u.id, title, req.body?.artStyle || 'anime', new Date('2026-09-15T07:30:00').toISOString(), gm.DEFAULT_WORLD_DIRECTIVES, now(), now());
    return { world: db.prepare('SELECT * FROM worlds WHERE id=?').get(id) };
  });
  app.get('/api/worlds/:id', async (req) => {
    const u = requireUser(req);
    const w = ownWorld(u, req.params.id);
    return {
      world: w,
      characters: db.prepare('SELECT * FROM characters WHERE world_id=?').all(w.id).map(charOut),
      locations: db.prepare('SELECT * FROM locations WHERE world_id=?').all(w.id),
      paths: db.prepare('SELECT * FROM paths WHERE world_id=?').all(w.id),
      relationships: db.prepare('SELECT * FROM relationships WHERE world_id=?').all(w.id).map(r => ({ ...r, history: pj(r.history, []), attributes: pj(r.attributes, {}) })),
    };
  });
  app.patch('/api/worlds/:id', async (req) => {
    const u = requireUser(req);
    const w = ownWorld(u, req.params.id);
    const b = req.body || {};
    db.prepare(`UPDATE worlds SET title=COALESCE(?,title), genre=COALESCE(?,genre), mood=COALESCE(?,mood),
                pacing=COALESCE(?,pacing), directives=COALESCE(?,directives), updated_at=? WHERE id=?`)
      .run(b.title, b.genre, b.mood, b.pacing, b.directives, now(), w.id);
    return { world: db.prepare('SELECT * FROM worlds WHERE id=?').get(w.id) };
  });
  app.delete('/api/worlds/:id', async (req) => {
    const u = requireUser(req);
    const w = ownWorld(u, req.params.id);
    const assets = db.prepare('SELECT file FROM assets WHERE world_id=?').all(w.id);
    const tx = db.transaction(() => {
      for (const t of ['relationships', 'paths', 'state_patches', 'memory_chunks', 'chat_logs', 'assets', 'branches', 'video_jobs', 'provider_calls']) {
        db.prepare(`DELETE FROM ${t} WHERE world_id=?`).run(w.id);
      }
      db.prepare('DELETE FROM worlds WHERE id=?').run(w.id); // cascades characters, locations, ticks
    });
    tx();
    for (const a of assets) fs.rmSync(assetPath({ file: a.file }), { force: true });
    return { ok: true };
  });

  // ---------- forge ----------
  app.post('/api/worlds/:id/forge/chat', async (req) => {
    const u = requireVerified(req);
    const w = ownWorld(u, req.params.id);
    const out = await gm.forgeChat(u, w, String(req.body?.message || ''), req.body?.history || [], req.body?.lang || 'en');
    return out;
  });
  app.post('/api/worlds/:id/forge/portrait', async (req) => {
    const u = requireVerified(req);
    const w = ownWorld(u, req.params.id);
    const d = req.body?.draft || {};
    if (!d.name || !d.appearance) throw httpErr(400, 'DRAFT_INCOMPLETE', 'The draft needs at least a name and appearance.');
    const { portrait, cutout } = await gm.generatePortrait(u, w, {
      name: d.name, appearance: d.appearance, outfit: d.outfit || 'casual everyday clothes', refAssetId: req.body?.refAssetId || null });
    return { portraitId: portrait.id, cutoutId: cutout.id };
  });
  app.post('/api/worlds/:id/characters', async (req) => {
    const u = requireVerified(req);
    const w = ownWorld(u, req.params.id);
    const d = req.body?.draft || {};
    if (!d.name) throw httpErr(400, 'DRAFT_INCOMPLETE', 'Character needs a name.');
    // HARD DEDUP by name (case-insensitive): a slow accept once let repeated clicks create
    // the same character five times. The client also guards its button, but this assertion
    // is the guarantee — one name, one cast member, per world.
    if (db.prepare('SELECT 1 FROM characters WHERE world_id=? AND LOWER(name)=LOWER(?)').get(w.id, String(d.name).trim()))
      throw httpErr(409, 'CHAR_EXISTS', `${String(d.name).trim()} is already in the cast — each character can exist only once. (If the first click seemed stuck: adding takes ~15s while their bonds are drafted.)`);
    const id = uid('c_');
    // Spawn location: the client sends the player-approved choice (body.homeLocationId,
    // pre-suggested by the Forge assistant via draft.home_location). Falls back to a
    // location matching the draft's home_location NAME, then to the world's first location.
    const byId = req.body?.homeLocationId && db.prepare('SELECT id FROM locations WHERE id=? AND world_id=?').get(req.body.homeLocationId, w.id);
    const byName = !byId && d.home_location && db.prepare('SELECT id FROM locations WHERE world_id=? AND LOWER(name)=LOWER(?)').get(w.id, String(d.home_location));
    const homeLoc = byId || byName || db.prepare('SELECT id FROM locations WHERE world_id=? LIMIT 1').get(w.id);
    const state = {
      location_id: d.home_location_id || homeLoc?.id || null, activity: 'settling in', mood: 'calm',
      thought: null, dialogue: null, outfit: 'everyday',
      outfits: req.body?.cutoutId ? [{ name: 'everyday', cutout_asset_id: req.body.cutoutId, portrait_asset_id: req.body?.portraitId || null }] : [],
    };
    // intro_tick_idx: they JOIN THE STORY now — rewinding below this hides them (consistency)
    db.prepare(`INSERT INTO characters(id,world_id,name,base_profile,materialised,reference_asset_id,voice,intro_tick_idx,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id, w.id, d.name, j(d), j(state), req.body?.portraitId || null, d.voice && d.voice.split(' ')[0] || 'Sulafat', w.tick_index, now());
    db.prepare(`INSERT INTO state_patches(id,world_id,entity_ref,entity_id,idx,tick_ref,author,category,op,path,value,reason,created_at)
                VALUES (?,?,?,?,1,0,'player','physical','set','/created',?,?,?)`)
      .run(uid('sp_'), w.id, 'character', id, j('time-zero base'), 'character created in the Forge', now());
    // If this name was on the declined-cast-suggestions list (player said "not now" once but
    // then created them after all), clear the stale entry so the GM's context stays truthful.
    const dismissed = pj(w.cast_dismissed, []).filter(n => String(n).toLowerCase() !== d.name.toLowerCase());
    if (dismissed.length !== pj(w.cast_dismissed, []).length) db.prepare('UPDATE worlds SET cast_dismissed=? WHERE id=?').run(j(dismissed), w.id);
    // Draft the newcomer's bonds to the existing cast right away (best-effort — see gm.js).
    let bondsCreated = 0;
    try { bondsCreated = await gm.draftBondsForNewCharacter(u, w, id); }
    catch (e) { console.error('[bonds] draft for new character failed:', e.message); }
    return { character: charOut(db.prepare('SELECT * FROM characters WHERE id=?').get(id)), bondsCreated };
  });
  app.patch('/api/characters/:id', async (req) => {
    const u = requireUser(req);
    const c = db.prepare(`SELECT c.* FROM characters c JOIN worlds w ON w.id=c.world_id WHERE c.id=? AND w.user_id=?`).get(req.params.id, u.id);
    if (!c) throw httpErr(404, 'NOT_FOUND', 'Character not found.');
    if (req.body?.base) db.prepare('UPDATE characters SET base_profile=?, name=? WHERE id=?').run(j(req.body.base), req.body.base.name || c.name, c.id);
    if (req.body?.voice) db.prepare('UPDATE characters SET voice=? WHERE id=?').run(req.body.voice, c.id);
    // Selecting a voice PROFILE (LAIONBox) also drops any uploaded custom reference —
    // otherwise the upload would keep overriding the newly chosen profile (see tts_service).
    if (req.body?.clearVoiceRef) db.prepare('UPDATE characters SET voice_ref_asset_id=NULL, voice_ref_prompt=NULL WHERE id=?').run(c.id);
    if (req.body?.name && !req.body?.base) {
      const base = pj(c.base_profile, {}); base.name = String(req.body.name).slice(0, 60);
      db.prepare('UPDATE characters SET name=?, base_profile=? WHERE id=?').run(base.name, j(base), c.id);
    }
    if (req.body?.location_id) {
      const loc = db.prepare('SELECT id,name FROM locations WHERE id=? AND world_id=?').get(req.body.location_id, c.world_id);
      if (!loc) throw httpErr(400, 'BAD_LOCATION', 'That location is not in this world.');
      const st = pj(c.materialised, {}); const fromName = db.prepare('SELECT name FROM locations WHERE id=?').get(st.location_id)?.name || 'nowhere';
      st.location_id = loc.id;
      if (req.body.activity) st.activity = String(req.body.activity).slice(0, 120);
      db.prepare('UPDATE characters SET materialised=? WHERE id=?').run(j(st), c.id);
      const w = db.prepare('SELECT tick_index FROM worlds WHERE id=?').get(c.world_id);
      const pidx = (db.prepare('SELECT COALESCE(MAX(idx),0) m FROM state_patches WHERE entity_id=?').get(c.id).m) + 1;
      db.prepare(`INSERT INTO state_patches(id,world_id,entity_ref,entity_id,idx,tick_ref,author,category,op,path,value,reason,created_at)
                  VALUES (?,?,?,?,?,?,'player','physical','set','/location',?,?,?)`)
        .run(uid('sp_'), c.world_id, 'character', c.id, pidx, w.tick_index, j(loc.name), `moved from ${fromName} to ${loc.name} by the player`, now());
    }
    return { character: charOut(db.prepare('SELECT * FROM characters WHERE id=?').get(c.id)) };
  });
  app.delete('/api/characters/:id', async (req) => {
    const u = requireUser(req);
    const c = db.prepare(`SELECT c.* FROM characters c JOIN worlds w ON w.id=c.world_id WHERE c.id=? AND w.user_id=?`).get(req.params.id, u.id);
    if (!c) throw httpErr(404, 'NOT_FOUND', 'Character not found.');
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM relationships WHERE from_id=? OR to_id=?').run(c.id, c.id);
      db.prepare('DELETE FROM state_patches WHERE entity_id=?').run(c.id);
      db.prepare('DELETE FROM characters WHERE id=?').run(c.id);
    });
    tx();
    return { ok: true };
  });
  app.get('/api/characters/:id/patches', async (req) => {
    const u = requireUser(req);
    const rows = db.prepare(`SELECT p.* FROM state_patches p JOIN worlds w ON w.id=p.world_id WHERE p.entity_id=? AND w.user_id=? ORDER BY p.idx DESC LIMIT 100`).all(req.params.id, u.id);
    return { patches: rows.map(p => ({ ...p, value: pj(p.value) })) };
  });
  app.post('/api/characters/:id/patches', async (req) => {
    const u = requireVerified(req);
    const c = db.prepare(`SELECT c.*, w.tick_index FROM characters c JOIN worlds w ON w.id=c.world_id WHERE c.id=? AND w.user_id=?`).get(req.params.id, u.id);
    if (!c) throw httpErr(404, 'NOT_FOUND', 'Character not found.');
    const b = req.body || {};
    const pidx = (db.prepare('SELECT COALESCE(MAX(idx),0) m FROM state_patches WHERE entity_id=?').get(c.id).m) + 1;
    db.prepare(`INSERT INTO state_patches(id,world_id,entity_ref,entity_id,idx,tick_ref,author,category,op,path,value,reason,created_at)
                VALUES (?,?,?,?,?,?,'player',?,?,?,?,?,?)`)
      .run(uid('sp_'), c.world_id, 'character', c.id, pidx, c.tick_index, b.category || 'condition', b.op || 'set', b.path || '/', j(b.value ?? null), b.reason || 'god-edit', now());
    const st = pj(c.materialised, {});
    if (b.category === 'emotion' && b.path === '/mood') st.mood = b.value;
    if (b.category === 'condition') { st.conditions = st.conditions || []; if (b.op !== 'remove') st.conditions.push(b.value); else st.conditions = st.conditions.filter(x => x !== b.value); }
    db.prepare('UPDATE characters SET materialised=? WHERE id=?').run(j(st), c.id);
    return { ok: true };
  });
  app.post('/api/characters/:id/outfits', async (req) => {
    const u = requireVerified(req);
    const c = db.prepare(`SELECT c.* FROM characters c JOIN worlds w ON w.id=c.world_id WHERE c.id=? AND w.user_id=?`).get(req.params.id, u.id);
    if (!c) throw httpErr(404, 'NOT_FOUND', 'Character not found.');
    const w = db.prepare('SELECT * FROM worlds WHERE id=?').get(c.world_id);
    const base = pj(c.base_profile, {});
    const name = String(req.body?.name || 'new outfit').slice(0, 40);
    const st = pj(c.materialised, {});
    const refCut = (st.outfits || []).find(o => o.name === 'everyday');
    const refPortrait = refCut?.portrait_asset_id || c.reference_asset_id;
    const { portrait, cutout } = await gm.generatePortrait(u, w, {
      name: c.name, appearance: base.appearance || '', outfit: req.body?.description || name,
      outfitName: name, refAssetId: refPortrait, ownerRef: c.id,
      // the sprite manager sends the player-edited image prompt (see web/app.js #sm-cap)
      rawPrompt: req.body?.rawPrompt ? String(req.body.rawPrompt).slice(0, 800) : null });
    // Store the LOOK METADATA with the sprite: description (what it shows) and optional
    // emotion tag. Both ride inside materialised.outfits, which is part of the character
    // state the Game Master reads every tick — so it can pick & reuse existing sprites
    // ("outfit" field by name) that match the scene's dress AND mood.
    // SPRITE-LOSS FIX: `st` was read BEFORE the ~30 s image generation. A tick finishing
    // meanwhile rewrites materialised — re-read the freshest state NOW so we append to the
    // current outfit list instead of resurrecting a stale one (which dropped sprites).
    const fresh = pj(db.prepare('SELECT materialised FROM characters WHERE id=?').get(c.id).materialised, {});
    const entry = {
      name, cutout_asset_id: cutout.id, portrait_asset_id: portrait.id,
      description: String(req.body?.description || name).slice(0, 200),
      ...(req.body?.emotion ? { emotion: String(req.body.emotion).slice(0, 40) } : {}),
    };
    // replace mode (sprite manager "regenerate with a new caption"): swap the entry in
    // place under the same name instead of appending a duplicate
    const ix = req.body?.replace ? (fresh.outfits || []).findIndex(o => o.name.toLowerCase() === name.toLowerCase()) : -1;
    if (ix >= 0) fresh.outfits[ix] = entry;
    else fresh.outfits = [...(fresh.outfits || []), entry];
    db.prepare('UPDATE characters SET materialised=? WHERE id=?').run(j(fresh), c.id);
    syncOutfitsToTicks(c.world_id, c.id, fresh.outfits);   // show the new/updated sprite in existing scenes
    return { outfit: { name, cutout_asset_id: cutout.id, portrait_asset_id: portrait.id } };
  });
  // ---------- Inner voice (talk inside a character's head; see gm.innerVoiceChat) ----------
  const ownChar = (u, id) => {
    const c = db.prepare(`SELECT c.*, w.user_id uid FROM characters c JOIN worlds w ON w.id=c.world_id WHERE c.id=? AND w.user_id=?`).get(id, u.id);
    if (!c) throw httpErr(404, 'NOT_FOUND', 'Character not found.');
    return c;
  };
  app.post('/api/characters/:id/inner-voice', async (req) => {
    const u = requireVerified(req);
    const c = ownChar(u, req.params.id);
    const w = db.prepare('SELECT * FROM worlds WHERE id=?').get(c.world_id);
    return gm.innerVoiceChat(u, w, c, String(req.body?.message || '').slice(0, 2000), req.body?.lang || 'en');
  });
  app.get('/api/characters/:id/inner-voice', async (req) => {
    const u = requireUser(req);
    const c = ownChar(u, req.params.id);
    const rows = db.prepare(`SELECT role, content, created_at FROM chat_logs WHERE world_id=? AND surface=? ORDER BY created_at ASC LIMIT 200`).all(c.world_id, `inner:${c.id}`);
    return { history: rows };
  });
  // Clear = the dialogue never happened: rows deleted, nothing reaches the next tick.
  app.delete('/api/characters/:id/inner-voice', async (req) => {
    const u = requireUser(req);
    const c = ownChar(u, req.params.id);
    db.prepare(`DELETE FROM chat_logs WHERE world_id=? AND surface=?`).run(c.world_id, `inner:${c.id}`);
    return { ok: true };
  });

  // Sprite manager: remove one sprite from the gallery. The generated images stay in the
  // asset store (kept for analysis / possible re-attachment); only the gallery entry goes.
  app.delete('/api/characters/:id/outfits/:name', async (req) => {
    const u = requireUser(req);
    const c = db.prepare(`SELECT c.* FROM characters c JOIN worlds w ON w.id=c.world_id WHERE c.id=? AND w.user_id=?`).get(req.params.id, u.id);
    if (!c) throw httpErr(404, 'NOT_FOUND', 'Character not found.');
    const st = pj(c.materialised, {});
    const name = decodeURIComponent(req.params.name);
    const list = st.outfits || [];
    if (list.length <= 1) throw httpErr(400, 'LAST_SPRITE', 'A character needs at least one sprite — regenerate it instead of deleting.');
    const ix = list.findIndex(o => o.name.toLowerCase() === name.toLowerCase());
    if (ix < 0) throw httpErr(404, 'NOT_FOUND', 'No sprite with that name.');
    list.splice(ix, 1);
    st.outfits = list;
    if ((st.outfit || '') .toLowerCase() === name.toLowerCase()) st.outfit = list[0].name;   // they were wearing it
    db.prepare('UPDATE characters SET materialised=? WHERE id=?').run(j(st), c.id);
    syncOutfitsToTicks(c.world_id, c.id, st.outfits);   // drop the deleted sprite from existing scenes
    return { ok: true, outfits: list.map(o => o.name) };
  });

  // ---------- relationships ----------
  app.post('/api/worlds/:id/relationships', async (req) => {
    const u = requireVerified(req);
    const w = ownWorld(u, req.params.id);
    const b = req.body || {};
    const id = uid('r_');
    db.prepare('INSERT INTO relationships(id,world_id,from_id,to_id,description,strength) VALUES (?,?,?,?,?,?)')
      .run(id, w.id, b.fromId, b.toId, b.description || 'acquaintance', b.strength ?? 0.5);
    return { relationship: db.prepare('SELECT * FROM relationships WHERE id=?').get(id) };
  });
  app.patch('/api/relationships/:id', async (req) => {
    const u = requireUser(req);
    const r = db.prepare(`SELECT r.* FROM relationships r JOIN worlds w ON w.id=r.world_id WHERE r.id=? AND w.user_id=?`).get(req.params.id, u.id);
    if (!r) throw httpErr(404, 'NOT_FOUND', 'Bond not found.');
    db.prepare('UPDATE relationships SET description=COALESCE(?,description), strength=COALESCE(?,strength) WHERE id=?')
      .run(req.body?.description, req.body?.strength, r.id);
    if (req.body?.attributes && typeof req.body.attributes === 'object') {
      const attrs = { ...pj(r.attributes, {}), ...req.body.attributes };
      db.prepare('UPDATE relationships SET attributes=? WHERE id=?').run(j(attrs), r.id);
    }
    return { ok: true };
  });
  app.delete('/api/relationships/:id', async (req) => {
    const u = requireUser(req);
    db.prepare(`DELETE FROM relationships WHERE id=? AND world_id IN (SELECT id FROM worlds WHERE user_id=?)`).run(req.params.id, u.id);
    return { ok: true };
  });

  // ---------- locations & paths ----------
  app.post('/api/worlds/:id/locations', async (req) => {
    const u = requireVerified(req);
    const w = ownWorld(u, req.params.id);
    const b = req.body || {};
    const id = uid('l_');
    db.prepare('INSERT INTO locations(id,world_id,name,type,place_group,description,x,y) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, w.id, b.name || 'New place', b.type || 'room', b.placeGroup || '', b.description || '', b.x ?? Math.random() * 600, b.y ?? Math.random() * 400);
    return { location: db.prepare('SELECT * FROM locations WHERE id=?').get(id) };
  });
  // One-shot accept for a GM location suggestion: create the location, wire the proposed
  // path connections, and paint the background — all in one call (the overlay's "Yes").
  app.post('/api/worlds/:id/locations/from-suggestion', async (req) => {
    const u = requireVerified(req);
    const w = ownWorld(u, req.params.id);
    const b = req.body || {};
    const name = String(b.name || '').trim().slice(0, 60);
    if (!name) throw httpErr(400, 'NO_NAME', 'The place needs a name.');
    if (db.prepare('SELECT 1 FROM locations WHERE world_id=? AND LOWER(name)=LOWER(?)').get(w.id, name)) throw httpErr(409, 'EXISTS', 'A place with that name already exists.');
    // place it near its first connection on the map so the Atlas stays readable
    const anchor = b.connectTo?.[0] && db.prepare('SELECT x,y FROM locations WHERE id=? AND world_id=?').get(b.connectTo[0], w.id);
    const id = uid('l_');
    db.prepare('INSERT INTO locations(id,world_id,name,type,place_group,description,x,y) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, w.id, name, 'public', '', String(b.description || '').slice(0, 400),
        (anchor?.x ?? 300) + 120 + Math.random() * 80, (anchor?.y ?? 300) + 60 + Math.random() * 80);
    for (const toId of (b.connectTo || []).slice(0, 3)) {
      if (db.prepare('SELECT 1 FROM locations WHERE id=? AND world_id=?').get(toId, w.id))
        db.prepare('INSERT INTO paths(id,world_id,from_id,to_id,label) VALUES (?,?,?,?,?)').run(uid('p_'), w.id, id, toId, '');
    }
    const loc = db.prepare('SELECT * FROM locations WHERE id=?').get(id);
    const bg = await gm.generateBackground(u, w, loc);   // metered like any background
    return { location: db.prepare('SELECT * FROM locations WHERE id=?').get(id), backgroundId: bg.id };
  });

  app.patch('/api/locations/:id', async (req) => {
    const u = requireUser(req);
    const l = db.prepare(`SELECT l.* FROM locations l JOIN worlds w ON w.id=l.world_id WHERE l.id=? AND w.user_id=?`).get(req.params.id, u.id);
    if (!l) throw httpErr(404, 'NOT_FOUND', 'Location not found.');
    const b = req.body || {};
    db.prepare('UPDATE locations SET name=COALESCE(?,name), description=COALESCE(?,description), place_group=COALESCE(?,place_group), x=COALESCE(?,x), y=COALESCE(?,y) WHERE id=?')
      .run(b.name, b.description, b.placeGroup, b.x, b.y, l.id);
    return { ok: true };
  });
  app.post('/api/locations/:id/background', async (req) => {
    const u = requireVerified(req);
    const l = db.prepare(`SELECT l.*, w.user_id uid FROM locations l JOIN worlds w ON w.id=l.world_id WHERE l.id=? AND w.user_id=?`).get(req.params.id, u.id);
    if (!l) throw httpErr(404, 'NOT_FOUND', 'Location not found.');
    const w = db.prepare('SELECT * FROM worlds WHERE id=?').get(l.world_id);
    const bg = await gm.generateBackground(u, w, l);
    return { backgroundId: bg.id };
  });
  app.post('/api/worlds/:id/paths', async (req) => {
    const u = requireVerified(req);
    const w = ownWorld(u, req.params.id);
    const id = uid('p_');
    db.prepare('INSERT INTO paths(id,world_id,from_id,to_id,label) VALUES (?,?,?,?,?)')
      .run(id, w.id, req.body?.fromId, req.body?.toId, req.body?.label || '');
    return { path: db.prepare('SELECT * FROM paths WHERE id=?').get(id) };
  });

  // ---------- Game Master chat (out-of-character assistant; see server/gm.js gmChat) ----------
  // One turn: full world context + capped rolling history → {reply, actions[]}. Actions are
  // PROPOSALS only; nothing changes until the player approves via /gm-apply.
  app.post('/api/worlds/:id/gm-chat', async (req) => {
    const u = requireVerified(req);
    const w = ownWorld(u, req.params.id);
    return gm.gmChat(u, w, String(req.body?.message || '').slice(0, 4000), req.body?.lang || 'en');
  });
  // Execute the player-APPROVED actions (may generate images — can take a minute).
  app.post('/api/worlds/:id/gm-apply', async (req) => {
    const u = requireVerified(req);
    const w = ownWorld(u, req.params.id);
    const results = await gm.gmApplyActions(u, w, req.body?.actions || []);
    return { results };
  });
  // The overlay's persisted conversation (newest last; the model itself only sees ~20k tokens).
  app.get('/api/worlds/:id/gm-chat', async (req) => {
    const u = requireUser(req);
    const w = ownWorld(u, req.params.id);
    const rows = db.prepare(`SELECT role, content, created_at FROM chat_logs WHERE world_id=? AND surface='gm_chat' ORDER BY created_at ASC LIMIT 300`).all(w.id);
    return { history: rows };
  });

  // ---------- World Wizard (chat-driven scenario generator; see server/wizard.js) ----------
  // One chat turn: the assistant refines a structured plan; every reply carrying a plan also
  // carries a server-computed credit estimate (never LLM-computed).
  app.post('/api/wizard/chat', async (req) => {
    const u = requireVerified(req);
    const out = await wizardChat(u, String(req.body?.message || ''), req.body?.history || [], req.body?.lang || 'en');
    if (out.estimate) delete out.estimate._estMicro; // internal preflight number, not for clients
    return out;
  });
  // Kick the agentic background build after the player approved the estimate.
  // Validates + preflights credits synchronously; the heavy work runs async (poll the job).
  app.post('/api/wizard/build', async (req) => {
    const u = requireVerified(req);
    const job = startWizardBuild(u, req.body?.plan, req.body?.lang || 'en');
    return { jobId: job.id };
  });
  app.get('/api/wizard/jobs/:id', async (req) => {
    const u = requireUser(req);
    const jb = getWizardJob(req.params.id);
    if (!jb || jb.user_id !== u.id) throw httpErr(404, 'NOT_FOUND', 'No such build job.');
    return { job: { id: jb.id, status: jb.status, progress: jb.progress, stage: jb.stage, error: jb.error, worldId: jb.world_id, log: pj(jb.log, []) } };
  });

  // ---------- populate ----------
  app.post('/api/worlds/:id/populate', async (req) => {
    const u = requireVerified(req);
    const w = ownWorld(u, req.params.id);
    const suggestions = await gm.populate(u, w, String(req.body?.request || ''));
    return { suggestions };
  });

  // ---------- genesis & ticks ----------
  app.post('/api/worlds/:id/genesis', async (req) => {
    const u = requireVerified(req);
    const w = ownWorld(u, req.params.id);
    for (const p of req.body?.placement || []) {
      const c = db.prepare('SELECT * FROM characters WHERE id=? AND world_id=?').get(p.characterId, w.id);
      if (!c) continue;
      const st = pj(c.materialised, {});
      if (p.locationId) st.location_id = p.locationId;
      if (p.activity) st.activity = p.activity;
      db.prepare('UPDATE characters SET materialised=? WHERE id=?').run(j(st), c.id);
    }
    branches.captureGenesisSnapshot(w);
    db.prepare(`UPDATE worlds SET status='live', updated_at=? WHERE id=?`).run(now(), w.id);
    return { ok: true };
  });

  app.post('/api/worlds/:id/ticks', async (req, reply) => {
    const u = requireVerified(req);
    const w = ownWorld(u, req.params.id);
    if (w.status !== 'live') throw httpErr(400, 'NOT_LIVE', 'Press Begin in Genesis first.');
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const send = (event, data) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const hb = setInterval(() => send('status', { message: 'still thinking…' }), 9000);
    try {
      // runChapter decides: small skip (or animation disabled) → one classic tick;
      // large skip → planner + several scene-ticks, each streamed the moment it's ready
      // (body.chapter = { animate, detail } from the player's time-skip settings).
      const tick = await gm.runChapter(u, w, req.body || {}, send);
      send('done', { credits: Math.floor(toCredits(db.prepare('SELECT credit_balance FROM users WHERE id=?').get(u.id).credit_balance) * 10) / 10, tick_idx: tick.idx, branch_id: tick.branch_id, branched: tick.branched });
      setImmediate(() => gm.runMemoryMaintenance(u, w).catch(() => {}));   // background summarisation
    } catch (e) {
      // also log server-side — SSE errors are otherwise invisible in the server logs
      console.error(`[tick] world=${w.id} delta=${req.body?.timeDelta} failed:`, e.code || '', e.message);
      send('error', { code: e.code || 'TICK_FAILED', message: e.message });
    } finally { clearInterval(hb); reply.raw.end(); }
  });
  app.get('/api/worlds/:id/ticks', async (req) => {
    const u = requireUser(req);
    const w = ownWorld(u, req.params.id);
    const after = Number(req.query.after ?? -1);
    branches.ensureRootBranch(w);
    const rows = branches.visibleTicks(w.id, w.active_branch_id, w.tick_index).filter(t => t.idx > after).slice(0, 80);
    return { ticks: rows.map(t => ({ ...t, states: pj(t.states, []), narration: pj(t.narration, []), intervention: pj(t.intervention), cost: pj(t.cost, {}) })) };
  });

  // ---------- time travel: undo / redo / branch ----------
  app.get('/api/worlds/:id/branches', async (req) => {
    const u = requireUser(req);
    const w = ownWorld(u, req.params.id);
    branches.ensureRootBranch(w);
    const list = branches.listBranches(w.id);
    const canUndo = w.tick_index > 0;
    const canRedo = !!branches.nextOwnTick(w.id, w.active_branch_id, w.tick_index);
    return { branches: list, activeBranchId: w.active_branch_id, tickIndex: w.tick_index, canUndo, canRedo };
  });
  app.patch('/api/worlds/:id/branches/:branchId', async (req) => {
    const u = requireUser(req);
    ownWorld(u, req.params.id);
    if (req.body?.label) db.prepare('UPDATE branches SET label=? WHERE id=? AND world_id=?').run(String(req.body.label).slice(0, 60), req.params.branchId, req.params.id);
    return { ok: true };
  });
  app.post('/api/worlds/:id/undo', async (req) => {
    const u = requireUser(req);
    const w = ownWorld(u, req.params.id);
    branches.ensureRootBranch(w);
    const steps = Math.max(1, Math.min(200, +(req.body?.steps || 1)));
    let branchId = w.active_branch_id, at = w.tick_index;
    for (let i = 0; i < steps; i++) {
      const prev = branches.prevVisibleTick(w.id, branchId, at);
      at = prev ? prev.idx : 0;
      if (at === 0) break;
    }
    const result = branches.restoreToTick(w, branchId, at);
    return { ok: true, ...result };
  });
  app.post('/api/worlds/:id/redo', async (req) => {
    const u = requireUser(req);
    const w = ownWorld(u, req.params.id);
    branches.ensureRootBranch(w);
    const steps = Math.max(1, Math.min(200, +(req.body?.steps || 1)));
    let at = w.tick_index;
    for (let i = 0; i < steps; i++) {
      const next = branches.nextOwnTick(w.id, w.active_branch_id, at);
      if (!next) break;
      at = next.idx;
    }
    const result = branches.restoreToTick(w, w.active_branch_id, at);
    return { ok: true, ...result };
  });
  app.post('/api/worlds/:id/timetravel', async (req) => {
    const u = requireUser(req);
    const w = ownWorld(u, req.params.id);
    branches.ensureRootBranch(w);
    const targetBranch = req.body?.branchId || w.active_branch_id;
    const targetIdx = Number(req.body?.tickIdx ?? 0);
    if (!db.prepare('SELECT 1 FROM branches WHERE id=? AND world_id=?').get(targetBranch, w.id)) throw httpErr(404, 'NOT_FOUND', 'No such timeline.');
    const result = branches.restoreToTick(w, targetBranch, targetIdx);
    return { ok: true, ...result };
  });

  // ── Branching from a PAST tick where not-everyone-had-been-introduced-yet ────────────────
  // Info the client needs to decide whether to prompt before advancing: are we positioned
  // before some character joined (so an alternative branch here should not include them)?
  app.get('/api/worlds/:id/branch-precheck', async (req) => {
    const u = requireUser(req);
    const w = ownWorld(u, req.params.id);
    const atIdx = req.query.tickIdx != null ? Number(req.query.tickIdx) : w.tick_index;
    const future = db.prepare('SELECT id,name,intro_tick_idx FROM characters WHERE world_id=? AND COALESCE(intro_tick_idx,0) > ? ORDER BY intro_tick_idx')
      .all(w.id, atIdx).map(c => ({ id: c.id, name: c.name, intro_tick_idx: c.intro_tick_idx }));
    return { atIdx, futureCharacters: future, hasForward: branches.hasForwardTicks(w.id, w.active_branch_id, atIdx) };
  });

  // Option A — strip the not-yet-introduced characters from THIS world (destructive to the
  // abandoned futures where they lived), so the alternative branch starts without them.
  app.post('/api/worlds/:id/strip-future-chars', async (req) => {
    const u = requireVerified(req);
    const w = ownWorld(u, req.params.id);
    const atIdx = req.body?.tickIdx != null ? Number(req.body.tickIdx) : w.tick_index;
    const future = db.prepare('SELECT id,name FROM characters WHERE world_id=? AND COALESCE(intro_tick_idx,0) > ?').all(w.id, atIdx);
    const ids = future.map(c => c.id);
    const tx = db.transaction(() => {
      for (const id of ids) {
        db.prepare('DELETE FROM relationships WHERE world_id=? AND (from_id=? OR to_id=?)').run(w.id, id, id);
        db.prepare('DELETE FROM paths WHERE world_id=? AND (from_id=? OR to_id=?)').run(w.id, id, id);
        db.prepare('DELETE FROM characters WHERE id=? AND world_id=?').run(id, w.id);
      }
    });
    tx();
    return { ok: true, removed: future.map(c => c.name) };
  });

  // Option B — CLEAN COPY: duplicate the world, keep only the history up to `tickIdx` on the
  // chosen lineage (flattened to one branch), drop every not-yet-introduced character, and
  // leave the original completely untouched. The copy is a pristine timeline to explore from.
  app.post('/api/worlds/:id/fork-clean', async (req) => {
    const u = requireVerified(req);
    const w = ownWorld(u, req.params.id);
    branches.ensureRootBranch(w);
    const targetBranch = req.body?.branchId || w.active_branch_id;
    const targetIdx = req.body?.tickIdx != null ? Number(req.body.tickIdx) : w.tick_index;
    if (!db.prepare('SELECT 1 FROM branches WHERE id=? AND world_id=?').get(targetBranch, w.id)) throw httpErr(404, 'NOT_FOUND', 'No such timeline.');

    const keptTickIds = new Set(branches.visibleTicks(w.id, targetBranch, targetIdx).map(t => t.id));
    const manifest = buildWorldManifest(w.id);
    // characters that exist at this point
    manifest.characters = (manifest.characters || []).filter(c => (c.intro_tick_idx || 0) <= targetIdx);
    const keptChars = new Set(manifest.characters.map(c => c.id));
    // flatten kept ticks onto ONE fresh root branch
    manifest.ticks = (manifest.ticks || []).filter(t => keptTickIds.has(t.id)).map(t => ({ ...t, branch_id: targetBranch }));
    manifest.branches = [{ id: targetBranch, world_id: w.id, parent_branch_id: null, fork_tick_idx: 0, label: `Branch from tick ${targetIdx}`, created_at: now() }];
    manifest.relationships = (manifest.relationships || []).filter(r => keptChars.has(r.from_id) && keptChars.has(r.to_id));
    manifest.paths = (manifest.paths || []);   // location links: harmless to keep
    manifest.memory_chunks = (manifest.memory_chunks || []).filter(mc => mc.end_idx <= targetIdx).map(mc => ({ ...mc, branch_id: targetBranch }));
    manifest.state_patches = (manifest.state_patches || []).filter(p => p.idx <= targetIdx);
    // prune the genesis snapshot to kept characters so the copy has no ghost of future cast
    let genesis = pj(manifest.world.genesis_state, null);
    if (genesis) {
      if (Array.isArray(genesis.characters)) genesis.characters = genesis.characters.filter(c => keptChars.has(c.id));
      manifest.world = { ...manifest.world, genesis_state: JSON.stringify(genesis) };
    }
    manifest.world = { ...manifest.world, tick_index: targetIdx, active_branch_id: targetBranch, status: 'live',
      title: `${manifest.world.title} · branch @${targetIdx}` };

    const res = importWorldManifest(u, manifest, null, { reuseAssets: true });   // shares the original's asset files
    return { ok: true, worldId: res.worldId, title: manifest.world.title };
  });

  // ---------- voice ----------
  app.post('/api/asr', async (req) => {
    const u = requireVerified(req);
    preflight(u.id, EST.asr());
    const file = await req.file({ limits: { fileSize: 8 * 1024 * 1024 } }); // tight cap for mic clips
    if (!file) throw httpErr(400, 'NO_AUDIO', 'No audio uploaded.');
    const buf = await file.toBuffer();
    if (buf.length > 8 * 1024 * 1024) throw httpErr(400, 'TOO_LARGE', 'Audio too large (max ~60s).');
    const mime = file.mimetype || 'audio/webm';
    const inputAsset = saveAsset({ userId: u.id, kind: 'asr_input', prompt: null, buffer: buf, mime: mime.includes('mp4') ? 'audio/mp4' : mime.includes('mpeg') ? 'audio/mpeg' : 'audio/webm' });
    const res = await asr(buf, mime, file.filename || 'clip.webm');
    debitCall(u.id, res, 'asr');
    logCall({ userId: u.id, kind: 'asr', surface: 'stage_mic', request: { inputAssetId: inputAsset.id, mime }, response: { text: res.text, seconds: res.seconds }, assetId: inputAsset.id, provider: res.provider, model: res.model, rawUsd: res.rawUsd, meter: res.meter });
    return { text: res.text, seconds: res.seconds };
  });
  // Text → speech. All engine dispatch, LAIONBox reference-clip resolution, caching and
  // metering live in server/tts_service.js synthesizeLine() — shared with the story-bundle
  // exporter so live playback and exports can never drift apart.
  app.post('/api/tts', async (req) => {
    const u = requireVerified(req);
    // lang picks the LANGUAGE-MATCHED voice-profile reference under LAIONBox (a mismatched
    // reference makes the cloning model babble); ignored under Gemini.
    const { text, voice = 'Sulafat', style = '', characterId = null, lang = 'en' } = req.body || {};
    return synthesizeLine(u, { text, voice, style, characterId, lang, surface: 'tts' });
  });

  // Voice-profile catalog for the client UI (picker) — display names, attributes, and
  // which languages each profile has reference clips for. See server/voice_profiles.js.
  app.get('/api/voice-profiles', async (req) => {
    requireUser(req);
    return { profiles: PROFILES };
  });

  // Player declined a Game-Master cast suggestion ("introduce Charlie?") — remember the
  // name (capped list) so the GM's context stops it from re-suggesting the same walk-on.
  app.post('/api/worlds/:id/cast-dismiss', async (req) => {
    const u = requireUser(req);
    const w = ownWorld(u, req.params.id);
    const name = String(req.body?.name || '').trim().slice(0, 60);
    if (!name) throw httpErr(400, 'NO_NAME', 'Which name?');
    const list = pj(w.cast_dismissed, []).filter(n => String(n).toLowerCase() !== name.toLowerCase());
    list.push(name);
    db.prepare('UPDATE worlds SET cast_dismissed=? WHERE id=?').run(j(list.slice(-10)), w.id);
    return { ok: true };
  });

  // ---------- LAIONBox reference voices ----------
  // Under the LAIONBox engine every character speaks through a CLONED REFERENCE CLIP.
  // Flow (mirrors the player popup in web/app.js voiceRefModal):
  //   1. generate — build a DramaBox description (age/gender/timbre; auto-drafted from the
  //      character's profile, editable by the player), synthesise a candidate clip (output
  //      'sidon' for a clean reference), save it as asset kind 'voice_ref' but DON'T assign.
  //   2. the player listens → confirm assigns it to the character (voice_ref_asset_id),
  //      or they regenerate with an edited prompt / a new random seed.
  //   3. upload — alternatively the player uploads their own clip; assigned immediately.
  // The character's dialogue lines then pass reference_b64 + run vc_sidon (see providers.js).

  // Draft a sensible default DramaBox voice description from the character's profile.
  function draftVoicePrompt(c) {
    const base = pj(c.base_profile, {});
    const gender = /she\b|her\b/i.test(base.pronouns || '') ? 'woman' : /he\b|him\b/i.test(base.pronouns || '') ? 'man' : 'person';
    const age = base.age ? `${base.age}-year-old` : 'adult';
    return `A ${age} ${gender}, natural clear timbre, ${(base.personality || 'warm and friendly').split(';')[0].trim()}, speaking at a relaxed conversational pace`;
  }

  app.post('/api/characters/:id/voice-ref/generate', async (req) => {
    const u = requireVerified(req);
    const c = db.prepare(`SELECT c.* FROM characters c JOIN worlds w ON w.id=c.world_id WHERE c.id=? AND w.user_id=?`).get(req.params.id, u.id);
    if (!c) throw httpErr(404, 'NOT_FOUND', 'Character not found.');
    preflight(u.id, EST.tts());
    const prompt = String(req.body?.prompt || c.voice_ref_prompt || draftVoicePrompt(c)).slice(0, 500);
    // A fixed, phoneme-rich sample line so every candidate is comparable when listening.
    const sample = req.body?.sampleText || `Hello! My name is ${c.name}. It is a bright morning, and I have quite a lot on my mind today.`;
    const t0 = Date.now();
    const res = await laionboxGenerate({
      prompt: `${prompt}: "${String(sample).replace(/"/g, '”')}"`,
      output: 'sidon',                       // clean restored clip = good cloning reference
      seed: req.body?.seed ?? undefined,     // omit → random, so "regenerate" varies
    });
    debitCall(u.id, res, 'voice_ref_gen', { worldId: c.world_id });
    const a = saveAsset({ userId: u.id, worldId: c.world_id, kind: 'voice_ref', ownerRef: c.id, prompt, buffer: res.buffer, mime: 'audio/mpeg', meta: { seconds: res.meter?.seconds, sample } });
    logCall({ userId: u.id, worldId: c.world_id, kind: 'tts', surface: 'voice_ref_gen', request: { prompt, sample }, response: { seconds: res.meter?.seconds }, assetId: a.id, provider: res.provider, model: res.model, rawUsd: res.rawUsd, meter: res.meter });
    return { assetId: a.id, prompt, seconds: res.meter?.seconds, genMs: Date.now() - t0 };
  });

  // Assign a previously generated candidate as THE character voice.
  app.post('/api/characters/:id/voice-ref/confirm', async (req) => {
    const u = requireVerified(req);
    const c = db.prepare(`SELECT c.* FROM characters c JOIN worlds w ON w.id=c.world_id WHERE c.id=? AND w.user_id=?`).get(req.params.id, u.id);
    if (!c) throw httpErr(404, 'NOT_FOUND', 'Character not found.');
    const a = getAsset(req.body?.assetId);
    if (!a || a.user_id !== u.id || a.kind !== 'voice_ref' || a.owner_ref !== c.id) throw httpErr(400, 'BAD_ASSET', 'That clip is not a voice candidate for this character.');
    db.prepare('UPDATE characters SET voice_ref_asset_id=?, voice_ref_prompt=? WHERE id=?').run(a.id, req.body?.prompt || a.prompt || null, c.id);
    return { ok: true, voiceRefAssetId: a.id };
  });

  // Upload the player's own reference audio; assigned to the character immediately.
  app.post('/api/characters/:id/voice-ref/upload', async (req) => {
    const u = requireVerified(req);
    const c = db.prepare(`SELECT c.* FROM characters c JOIN worlds w ON w.id=c.world_id WHERE c.id=? AND w.user_id=?`).get(req.params.id, u.id);
    if (!c) throw httpErr(404, 'NOT_FOUND', 'Character not found.');
    const file = await req.file({ limits: { fileSize: 15 * 1024 * 1024 } });
    if (!file) throw httpErr(400, 'NO_AUDIO', 'No audio uploaded.');
    const buf = await file.toBuffer();
    const mime = (file.mimetype || '').includes('wav') ? 'audio/mpeg' : 'audio/mpeg'; // stored as-is; LAIONBox accepts any ffmpeg-readable format
    const a = saveAsset({ userId: u.id, worldId: c.world_id, kind: 'voice_ref', ownerRef: c.id, prompt: 'uploaded by player', buffer: buf, mime, meta: { uploaded: true, originalName: file.filename } });
    db.prepare('UPDATE characters SET voice_ref_asset_id=?, voice_ref_prompt=? WHERE id=?').run(a.id, 'uploaded by player', c.id);
    return { ok: true, voiceRefAssetId: a.id };
  });

  // Full branch-scoped tick timeline for the export renderer (no pagination cap).
  app.get('/api/worlds/:id/export/timeline', async (req) => {
    const u = requireUser(req);
    const w = ownWorld(u, req.params.id);
    branches.ensureRootBranch(w);
    const branchId = req.query.branchId || w.active_branch_id;
    const toIdx = req.query.toIdx != null ? Number(req.query.toIdx) : w.tick_index;
    if (!db.prepare('SELECT 1 FROM branches WHERE id=? AND world_id=?').get(branchId, w.id)) throw httpErr(404, 'NOT_FOUND', 'No such timeline.');
    const rows = branches.visibleTicks(w.id, branchId, toIdx);
    const genesis = pj(w.genesis_state, null);
    return { ticks: rows.map(t => ({ ...t, states: pj(t.states, []), narration: pj(t.narration, []), intervention: pj(t.intervention) })), genesisSimTime: genesis?.sim_time || null };
  });

  // Cue list for the export renderer / preview page (single source of truth: export_cues.js).
  app.get('/api/worlds/:id/export/cues', async (req) => {
    const u = requireUser(req);
    const w = ownWorld(u, req.params.id);
    branches.ensureRootBranch(w);
    const branchId = req.query.branchId || w.active_branch_id;
    const toIdx = req.query.toIdx != null ? Number(req.query.toIdx) : w.tick_index;
    return assembleCues(w.id, branchId, toIdx);
  });

  // ---------- STORY BUNDLE export (replaced the old MP4 video export) ----------
  // A story bundle is a small self-playing ZIP: story.json (the cue script — the same
  // assembleCues output the Stage/exports share), media/ (64 kbps mono MP3 per voiced
  // line + only the images the script actually shows) and player.html (a fully
  // self-contained offline player — open it in any browser, pick the zip, watch the
  // whole story with audio; no server, no dependencies). Three endpoints:
  //   1. POST …/export/story/preflight — how many lines lack audio + generation cost,
  //      so the player can choose "generate missing" vs "leave silent" (same dialog
  //      the video export used).
  //   2. POST …/export/story/prepare   — SSE; generates ALL missing line audio through
  //      the shared tts_service (cache-filling), streaming per-line progress. Done
  //      first so the download itself is fast and can't stall behind generation.
  //   3. GET  …/export/story           — builds the zip from whatever audio is cached
  //      NOW (missing lines stay silent and are counted in story.json), deflate -9.
  // Cache lookup for one cue's audio: exact engine-aware key first, then the
  // engine-tolerant fallback (same text + same speaker identity under a previous
  // provider/style era — see tts_service.findReusableAudio). Keeps preflight,
  // prepare and the ZIP builder agreeing on what counts as "already voiced".
  const lookupCueAudio = (cue, lang) => {
    const { voice, style } = cueVoiceStyle(cue);
    return findCached('audio', ttsCacheKey(cueCacheVoice(cue, lang), style, cue.text))
      || findReusableAudio({ text: cue.text, voice, characterId: cue.name ? cue.speaker : null });
  };

  app.post('/api/worlds/:id/export/story/preflight', async (req) => {
    const u = requireUser(req);
    const w = ownWorld(u, req.params.id);
    branches.ensureRootBranch(w);
    const lang = req.body?.lang || 'en';   // which language's profile references count as "cached"
    const { cues } = assembleCues(w.id, w.active_branch_id, w.tick_index);
    const lines = cues.filter(c => c.type === 'line' && c.text && c.text.trim());
    let cached = 0, missing = 0;
    for (const cue of lines) {
      if (lookupCueAudio(cue, lang)) cached++; else missing++;
    }
    const estMicro = missing * EST.tts();        // conservative per-line ceiling
    return {
      totalLines: lines.length, cachedLines: cached, missingLines: missing,
      estCredits: Math.ceil(toCredits(estMicro)),
      balance: Math.floor(toCredits(balance(u.id))),
      canAfford: balance(u.id) >= estMicro,
    };
  });

  // Generate every missing line's audio, streaming progress over SSE (the stream also keeps
  // proxies/tunnels from timing out during a long generation run). Lines whose character has
  // no reference voice (LAIONBox 409) are skipped and reported — they'll export silent.
  app.post('/api/worlds/:id/export/story/prepare', async (req, reply) => {
    const u = requireVerified(req);
    const w = ownWorld(u, req.params.id);
    branches.ensureRootBranch(w);
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const send = (event, data) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      const lang = req.query?.lang || 'en';   // profile-reference language for LAIONBox lines
      const { cues } = assembleCues(w.id, w.active_branch_id, w.tick_index);
      const lines = cues.filter(c => c.type === 'line' && c.text && c.text.trim());
      let done = 0, generated = 0, skipped = 0;
      for (const cue of lines) {
        const { voice, style } = cueVoiceStyle(cue);
        if (!lookupCueAudio(cue, lang)) {
          try {
            const r = await synthesizeLine(u, { text: cue.text, voice, style, characterId: cue.name ? cue.speaker : null, lang, surface: 'story_export' });
            if (!r.cached) generated++;
          } catch (e) { skipped++; }     // no credits → this line stays silent
        }
        done++;
        send('progress', { done, total: lines.length, generated, skipped });
      }
      send('done', { generated, skipped });
    } catch (e) {
      send('error', { code: e.code || 'PREPARE_FAILED', message: e.message });
    } finally { reply.raw.end(); }
  });

  app.get('/api/worlds/:id/export/story', async (req, reply) => {
    const u = requireUser(req);
    const w = ownWorld(u, req.params.id);
    branches.ensureRootBranch(w);
    if (w.tick_index < 1) throw httpErr(400, 'NOTHING_TO_EXPORT', 'Advance at least one tick before exporting the story.');
    const lang = req.query?.lang || 'en';   // must match preflight/prepare so cache lookups agree
    const { world: worldMeta, cues } = assembleCues(w.id, w.active_branch_id, w.tick_index);
    const work = path.join(EXPORT_TMP, uid('st_'));
    const mediaDir = path.join(work, 'media');
    fs.mkdirSync(mediaDir, { recursive: true });
    try {
      // collect every image the script shows (backgrounds + character cut-outs), copied once
      const wantedImages = new Map();  // assetId → media filename
      const mediaRef = (url) => {      // '/api/assets/<id>' → 'media/<id>.<ext>' (and remember to copy it)
        const id = String(url || '').split('/').pop();
        if (!id) return '';
        if (!wantedImages.has(id)) {
          const a = getAsset(id);
          if (!a) return '';
          wantedImages.set(id, `${id}.${(a.file.split('.').pop() || 'png')}`);
        }
        return `media/${wantedImages.get(id)}`;
      };
      let silentLines = 0;
      const outCues = [];
      for (let i = 0; i < cues.length; i++) {
        const cue = cues[i];
        if (cue.type === 'transition') {
          outCues.push({ ...cue, bgUrl: mediaRef(cue.bgUrl), fromBgUrl: mediaRef(cue.fromBgUrl) });
          continue;
        }
        // line cue: attach its cached audio (re-encoded to 64 kbps mono for size), else silent
        let audio = null, audioSeconds = null;
        if (cue.text && cue.text.trim()) {
          const cachedA = lookupCueAudio(cue, lang);
          if (cachedA) {
            audio = `media/line_${i}.mp3`;
            audioSeconds = pj(cachedA.meta, {}).seconds || null;
            await runCmd('ffmpeg', ['-y', '-i', assetPath(cachedA), '-ac', '1', '-b:a', '64k', path.join(mediaDir, `line_${i}.mp3`)]);
          } else silentLines++;
        }
        outCues.push({
          ...cue, audio, seconds: audioSeconds,
          bgUrl: mediaRef(cue.bgUrl),
          present: (cue.present || []).map(p => ({ ...p, cutout: mediaRef(p.cutout) })),
        });
      }
      for (const [id, fname] of wantedImages) {
        const a = getAsset(id);
        if (a && fs.existsSync(assetPath(a))) fs.copyFileSync(assetPath(a), path.join(mediaDir, fname));
      }
      const story = {
        format: 'vivarium-story', version: 1, title: worldMeta?.title || w.title,
        exported_at: now(), ticks: w.tick_index, silentLines, cues: outCues,
      };
      fs.writeFileSync(path.join(work, 'story.json'), JSON.stringify(story));
      // ship the offline player inside the bundle so the zip is fully self-sufficient
      fs.copyFileSync(path.join(ROOT_WEB, 'player.html'), path.join(work, 'player.html'));
      const zipPath = path.join(work, 'story.zip');
      await runCmd('zip', ['-r', '-q', '-9', 'story.zip', 'story.json', 'player.html', 'media'], { cwd: work });
      const buf = fs.readFileSync(zipPath);
      const safe = (w.title || 'story').replace(/\W+/g, '-').slice(0, 40);
      reply.header('Content-Disposition', `attachment; filename="${safe}.vivarium-story.zip"`);
      reply.type('application/zip');
      return reply.send(buf);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  });

  // ---------- whole-world save/restore as a ZIP ----------
  // Export: manifest.json (all game-state rows, ids intact) + every asset binary under assets/.
  // See server/world_io.js for the full contract. Buffered (worlds are tens of MB) then cleaned.
  app.get('/api/worlds/:id/export/zip', async (req, reply) => {
    const u = requireUser(req);
    const w = ownWorld(u, req.params.id);
    const manifest = buildWorldManifest(w.id);
    if (!manifest) throw httpErr(404, 'NOT_FOUND', 'World not found.');
    const work = path.join(EXPORT_TMP, uid('zx_'));
    const assetsDir = path.join(work, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    try {
      fs.writeFileSync(path.join(work, 'manifest.json'), JSON.stringify(manifest));
      for (const a of worldAssetFiles(w.id)) {
        const src = assetPath({ file: a.file });
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(assetsDir, a.file));
      }
      const zipPath = path.join(work, 'world.zip');
      await runCmd('zip', ['-r', '-q', '-0', 'world.zip', 'manifest.json', 'assets'], { cwd: work });
      const buf = fs.readFileSync(zipPath);
      const safe = (w.title || 'world').replace(/\W+/g, '-').slice(0, 40);
      reply.header('Content-Disposition', `attachment; filename="${safe}.vivarium.zip"`);
      reply.type('application/zip');
      return reply.send(buf);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  });

  // Import: upload a .vivarium.zip → recreate the world for this user with all-fresh ids
  // (safe to import even while a copy still exists, and to re-import repeatedly). world_io.js
  // handles the id remap; here we just unpack the zip and hand it the manifest + assets dir.
  app.post('/api/worlds/import', async (req) => {
    const u = requireVerified(req);
    const file = await req.file({ limits: { fileSize: 300 * 1024 * 1024 } });
    if (!file) throw httpErr(400, 'NO_FILE', 'No file uploaded.');
    const buf = await file.toBuffer();
    const work = path.join(EXPORT_TMP, uid('zi_'));
    const unpacked = path.join(work, 'unpacked');
    fs.mkdirSync(unpacked, { recursive: true });
    try {
      const zipPath = path.join(work, 'in.zip');
      fs.writeFileSync(zipPath, buf);
      // -o overwrite, -q quiet; unzip refuses paths escaping the target dir, so this is safe.
      await runCmd('unzip', ['-o', '-q', zipPath, '-d', unpacked]).catch(() => {
        throw httpErr(400, 'BAD_ZIP', 'That file could not be read as a Vivarium world zip.');
      });
      const manifestPath = path.join(unpacked, 'manifest.json');
      if (!fs.existsSync(manifestPath)) throw httpErr(400, 'BAD_BUNDLE', 'The zip has no manifest.json — not a Vivarium world bundle.');
      const manifest = pj(fs.readFileSync(manifestPath, 'utf8'), null);
      if (!manifest) throw httpErr(400, 'BAD_BUNDLE', 'The manifest could not be parsed.');
      const result = importWorldManifest(u, manifest, path.join(unpacked, 'assets'));
      return { ok: true, ...result };
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  });

  // ---------- assets ----------
  // Player-facing music search (the wizard's score picker): top-5 candidates whose audio is
  // actually available locally, with proxied preview URLs.
  app.post('/api/music/search', async (req) => {
    requireVerified(req);
    const b = req.body || {};
    // same policy as the storyteller's tool: top-10 by CAPTION similarity (or BM25 keyword
    // matching for the manual search bar), available only, sorted by aesthetics score
    const field = b.field === 'bm25_caption' ? 'bm25_caption' : 'caption';
    const body = { query: [String(b.query || '').slice(0, 200), String(b.emotion || '').slice(0, 80)].filter(Boolean).join(', '), genre: gm.MUSIC_GENRES.includes(b.genre) ? b.genre : '', search_field: field, top_k: 10, singing_filter: 'no_singing', nsfw_filter: 'sfw_only', rank_by: 'similarity' };
    const r = await fetch(`${gm.MUSIC_API}/api/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (!r || !r.ok) throw httpErr(503, 'MUSIC_DOWN', 'The music server is not reachable right now.');
    const { results } = await r.json();
    const out = [];
    for (const t of (results || []).slice(0, 10)) {
      try {
        const h = await fetch(`${gm.MUSIC_API}/api/audio/${t.row_id}`, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
        if (h.ok) out.push({ row_id: t.row_id, title: t.title, url: `/api/music/audio/${t.row_id}`, duration: t.duration_seconds, tags: (t.tags_text || '').slice(0, 80), upvotes: t.upvote_count || 0, aesthetics: t.score_average != null ? +(+t.score_average).toFixed(2) : null });
      } catch { /* skip unavailable */ }
    }
    out.sort((a2, b2) => (b2.aesthetics ?? 0) - (a2.aesthetics ?? 0));
    return { candidates: out.slice(0, field === 'bm25_caption' ? 5 : 6) };
  });
  // Own soundtrack upload (mp3/ogg/m4a) → a normal asset; playable via /api/assets/:id.
  app.post('/api/music/upload', async (req) => {
    const u = requireVerified(req);
    const file = await req.file();
    if (!file) throw httpErr(400, 'NO_FILE', 'Attach an audio file.');
    const buf = await file.toBuffer();
    if (buf.length > 25 * 1024 * 1024) throw httpErr(400, 'TOO_BIG', 'Keep uploads under 25 MB.');
    const a = saveAsset({ userId: u.id, kind: 'music', prompt: `upload:${file.filename}`, buffer: buf, mime: file.mimetype || 'audio/mpeg', meta: { filename: file.filename } });
    return { assetId: a.id, url: `/api/assets/${a.id}`, title: (file.filename || 'my track').replace(/\.[^.]+$/, '') };
  });
  // Apply the wizard's per-scene score choices to an intro sequence: set each tick's music
  // (replay switches there), the scene location's remembered track, and the world's current.
  app.post('/api/worlds/:id/intro-music', async (req) => {
    const u = requireVerified(req);
    const w = ownWorld(u, req.params.id);
    const choices = Array.isArray(req.body?.choices) ? req.body.choices.slice(0, 12) : [];
    let lastMusic = null;
    for (const ch of choices) {
      const t = db.prepare('SELECT * FROM ticks WHERE world_id=? AND idx=?').get(w.id, +ch.tickIdx);
      if (!t) continue;
      if (ch.carry) {                       // carry the previous scene's track over
        if (lastMusic) db.prepare('UPDATE ticks SET music=NULL WHERE id=?').run(t.id);
        continue;
      }
      const m = ch.music && ch.music.url ? {
        row_id: ch.music.row_id ?? null, title: String(ch.music.title || 'track').slice(0, 120),
        url: String(ch.music.url).slice(0, 300), query: String(ch.music.query || '').slice(0, 200),
        genre: String(ch.music.genre || '').slice(0, 40), emotion: String(ch.music.emotion || '').slice(0, 80),
      } : null;
      db.prepare('UPDATE ticks SET music=? WHERE id=?').run(m ? j(m) : null, t.id);
      if (m) {
        lastMusic = m;
        if (t.pov_location_id) db.prepare('UPDATE locations SET music=? WHERE id=?').run(j(m), t.pov_location_id);
      }
    }
    if (lastMusic) db.prepare('UPDATE worlds SET current_music=? WHERE id=?').run(j(lastMusic), w.id);
    return { ok: true };
  });

  // ── Intro-scene editor: rewrite one opening scene's script/summary/music by hand ──
  // The player edits narration lines (speaker, text, emotion, speech/thought), the scene
  // summary and the scene's score in an overlay editor; changes persist on the tick so
  // films, replays and exports all honour them.
  app.patch('/api/worlds/:id/intro-scene', async (req) => {
    const u = requireVerified(req);
    const w = ownWorld(u, req.params.id);
    const b = req.body || {};
    const t = db.prepare('SELECT * FROM ticks WHERE world_id=? AND idx=?').get(w.id, +b.tickIdx);
    if (!t || !t.seq) throw httpErr(404, 'NOT_A_SCENE', 'That tick is not part of a sequence.');
    const castIds = new Set(db.prepare('SELECT id FROM characters WHERE world_id=?').all(w.id).map(c => c.id));
    const LANGS = ['de', 'fr', 'es'];
    if (Array.isArray(b.narration)) {
      const clean = b.narration.slice(0, 40).map(n => {
        const line = {
          speaker: n.speaker === 'narrator' || castIds.has(n.speaker) ? n.speaker : 'narrator',
          text: String(n.text || '').trim().slice(0, 600),
          emotion: String(n.emotion || '').slice(0, 40),
          mode: n.mode === 'thought' && n.speaker !== 'narrator' ? 'thought' : 'speech',
        };
        // per-line translations {de,fr,es} — kept so a language toggle plays the right text
        if (n.i18n && typeof n.i18n === 'object') {
          const i18n = {};
          for (const lg of LANGS) if (n.i18n[lg]) i18n[lg] = String(n.i18n[lg]).slice(0, 600);
          if (Object.keys(i18n).length) line.i18n = i18n;
        }
        return line;
      }).filter(n => n.text);
      if (!clean.length) throw httpErr(400, 'EMPTY_SCENE', 'A scene needs at least one line.');
      db.prepare('UPDATE ticks SET narration=? WHERE id=?').run(j(clean), t.id);
    }
    if (typeof b.summary === 'string') db.prepare('UPDATE ticks SET summary=? WHERE id=?').run(b.summary.trim().slice(0, 300), t.id);
    // background: choosing the scene's location sets which backdrop shows
    if (b.pov_location_id && db.prepare('SELECT 1 FROM locations WHERE id=? AND world_id=?').get(b.pov_location_id, w.id)) {
      db.prepare('UPDATE ticks SET pov_location_id=? WHERE id=?').run(b.pov_location_id, t.id);
    }
    // per-character sprite selection: update the outfit named in the tick's state snapshot
    if (b.sprites && typeof b.sprites === 'object') {
      const states = pj(t.states, []);
      for (const [cid, outfitName] of Object.entries(b.sprites)) {
        const s = states.find(x => x.character_id === cid);
        if (s && (s.outfits || []).some(o => o.name === outfitName)) s.outfit = outfitName;
      }
      db.prepare('UPDATE ticks SET states=? WHERE id=?').run(j(states), t.id);
    }
    if (b.music?.url) {
      const cur = pj(t.music, {}) || {};
      const music = {
        row_id: b.music.row_id ?? null, title: String(b.music.title || 'track').slice(0, 120), url: String(b.music.url).slice(0, 300),
        query: cur.query || '', genre: cur.genre || '', emotion: cur.emotion || '',
        candidates: Array.isArray(b.candidates) ? b.candidates.slice(0, 5) : (cur.candidates || []),
      };
      db.prepare('UPDATE ticks SET music=? WHERE id=?').run(j(music), t.id);
      if (t.pov_location_id) db.prepare('UPDATE locations SET music=? WHERE id=?').run(j(music), t.pov_location_id);
      const newest = db.prepare('SELECT idx FROM ticks WHERE world_id=? AND music IS NOT NULL ORDER BY idx DESC LIMIT 1').get(w.id);
      if (newest && newest.idx === t.idx) db.prepare('UPDATE worlds SET current_music=? WHERE id=?').run(j(music), w.id);
    }
    return { ok: true };
  });

  // Auto-translate the whole opening sequence into de/fr/es (per-line i18n on each tick).
  app.post('/api/worlds/:id/translate-intro', async (req) => {
    const u = requireVerified(req);
    const w = ownWorld(u, req.params.id);
    const idxs = db.prepare(`SELECT idx FROM ticks WHERE world_id=? AND seq IS NOT NULL ORDER BY idx`).all(w.id).map(r => r.idx);
    if (!idxs.length) throw httpErr(404, 'NO_INTRO', 'This world has no opening sequence.');
    return gm.translateIntro(u, w, idxs, req.body?.langs || ['de', 'fr', 'es']);
  });

  // Scene-craft assistant chat (editor right panel): proposes narration + optional location.
  app.post('/api/worlds/:id/intro-assist', async (req) => {
    const u = requireVerified(req);
    const w = ownWorld(u, req.params.id);
    const t = db.prepare('SELECT * FROM ticks WHERE world_id=? AND idx=?').get(w.id, +req.body?.tickIdx);
    if (!t) throw httpErr(404, 'NOT_A_SCENE', 'Scene not found.');
    return gm.introAssist(u, w, t, req.body?.narration || null, String(req.body?.message || '').slice(0, 2000), req.body?.history || [], req.body?.lang || 'en');
  });

  // Re-pick the score (the 🎶 widget): persist the player's choice as the world's current
  // track, the given location's remembered track, and the most recent music-bearing tick on
  // the active lineage (so sequence replays honour the choice too). Non-picked candidates
  // stay attached for future re-picks.
  app.post('/api/worlds/:id/music-choice', async (req) => {
    const u = requireVerified(req);
    const w = ownWorld(u, req.params.id);
    const b = req.body || {};
    if (!b.music?.url) throw httpErr(400, 'NO_TRACK', 'Pick a track.');
    const cur = pj(w.current_music, {}) || {};
    const music = {
      row_id: b.music.row_id ?? null, title: String(b.music.title || 'track').slice(0, 120),
      url: String(b.music.url).slice(0, 300),
      query: cur.query || '', genre: cur.genre || '', emotion: cur.emotion || '',
      candidates: Array.isArray(b.candidates) ? b.candidates.slice(0, 5) : (cur.candidates || []),
    };
    db.prepare('UPDATE worlds SET current_music=?, updated_at=? WHERE id=?').run(j(music), now(), w.id);
    if (b.locationId && db.prepare('SELECT 1 FROM locations WHERE id=? AND world_id=?').get(b.locationId, w.id))
      db.prepare('UPDATE locations SET music=? WHERE id=?').run(j(music), b.locationId);
    // the tick that carries the currently-active score: explicit idx, else newest with music
    const t = b.tickIdx != null
      ? db.prepare('SELECT id FROM ticks WHERE world_id=? AND idx=?').get(w.id, +b.tickIdx)
      : db.prepare('SELECT id FROM ticks WHERE world_id=? AND music IS NOT NULL ORDER BY idx DESC LIMIT 1').get(w.id);
    if (t) db.prepare('UPDATE ticks SET music=? WHERE id=?').run(j(music), t.id);
    return { ok: true, music };
  });

  // ---------- background music (proxied same-origin so it works through HTTPS tunnels) ----------
  // Streams a track from the local RPG-music search server (see server/gm.js MUSIC_API).
  app.get('/api/music/audio/:rowId', async (req, reply) => {
    requireUser(req);
    const rid = String(req.params.rowId).replace(/[^0-9]/g, '');
    const up = await fetch(`${gm.MUSIC_API}/api/audio/${rid}`, { signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (!up || !up.ok) throw httpErr(404, 'NO_TRACK', 'That track is not available.');
    reply.header('Cache-Control', 'private, max-age=31536000, immutable');
    reply.type(up.headers.get('content-type') || 'audio/mpeg');
    const { Readable } = await import('node:stream');
    return reply.send(Readable.fromWeb(up.body));
  });

  app.get('/api/assets/:id', async (req, reply) => {
    const u = requireUser(req);
    const a = getAsset(req.params.id);
    if (!a || a.user_id !== u.id) throw httpErr(404, 'NOT_FOUND', 'Asset not found.');
    reply.header('Cache-Control', 'private, max-age=31536000, immutable');
    // ?w=320 → downscaled variant for thumbnails (timeline filmstrip). Generated once with
    // ffmpeg, cached on disk next to the original as <file>_w<N>.<ext>. PNG stays PNG
    // (cut-out sprites need their transparency); everything else becomes the original mime.
    const w = Math.min(1024, Math.max(0, parseInt(req.query?.w, 10) || 0));
    if (w && a.mime.startsWith('image/')) {
      const orig = assetPath(a);
      // only cut-out sprites need their alpha channel — everything else compresses to a
      // small JPEG (a 320px background is ~20KB as JPEG vs ~150KB as PNG)
      const alpha = a.kind === 'cutout';
      const ext = alpha ? 'png' : 'jpg';
      const thumb = `${orig}_w${w}.${ext}`;
      if (!fs.existsSync(thumb)) {
        try { await runCmd('ffmpeg', ['-y', '-i', orig, '-vf', alpha ? `premultiply=inplace=1,scale=${w}:-1,unpremultiply=inplace=1` : `scale=${w}:-1`, ...(alpha ? [] : ['-q:v', '5']), thumb]); }
        catch { reply.type(a.mime); return reply.send(fs.createReadStream(orig)); }   // fall back to full size
      }
      reply.type(alpha ? 'image/png' : 'image/jpeg');
      return reply.send(fs.createReadStream(thumb));
    }
    reply.type(a.mime);
    return reply.send(fs.createReadStream(assetPath(a)));
  });
}
