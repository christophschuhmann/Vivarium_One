// ─────────────────────────────────────────────────────────────────────────────
// Whole-world save/restore as a self-contained ZIP.
//
// EXPORT (buildWorldManifest + the /export/zip route in api.js):
//   Produces a manifest object holding EVERY durable game-state row for one world
//   (world, characters, locations, paths, relationships, branches, ticks,
//    memory_chunks, state_patches, assets) with their original ids intact. The route
//   then zips manifest.json together with every asset's binary under assets/<id>.<ext>.
//   NOT included: credit_ledger / provider_calls / chat_logs (per-user usage & telemetry,
//   not part of the game), and ephemeral TTS playback audio (world-less cache, regenerable).
//
// IMPORT (importWorldManifest):
//   Recreates the world for the importing user. EVERY id is remapped to a fresh one, so a
//   bundle can be imported even while a copy still exists, and re-imported repeatedly, with
//   zero primary-key or cross-reference collisions. Remapping is done in two layers:
//     1. explicit foreign-key COLUMNS (world_id, from_id, branch_id, reference_asset_id, …)
//     2. a generic DEEP WALK of every JSON blob (materialised state, tick states/narration,
//        rel_snapshot, genesis_state, attributes, …) that swaps any string equal to a known
//        old id for its new id. This is safe because ids are 14-char typed-random tokens
//        (`c_…`, `a_…`, `l_…`) that never appear as substrings of prose or of each other, so
//        a blanket value-swap can't corrupt narrative text or names (e.g. intervention.target
//        is a character *name*, never an id, and is left untouched).
//
// Everything runs inside a single DB transaction; asset files are copied after it commits.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { db, uid, now, j, pj, ASSET_DIR } from './db.js';

export const BUNDLE_FORMAT = 'vivarium-world-zip';
export const BUNDLE_VERSION = 1;

// All game-state tables that hang off a world, in dependency-free insert order.
const WORLD_TABLES = [
  'worlds', 'characters', 'locations', 'paths', 'relationships',
  'branches', 'ticks', 'memory_chunks', 'state_patches', 'assets',
];

// Assemble the complete, id-preserving manifest for one world.
export function buildWorldManifest(worldId) {
  const world = db.prepare('SELECT * FROM worlds WHERE id=?').get(worldId);
  if (!world) return null;
  const q = (sql) => db.prepare(sql).all(worldId);
  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exported_at: now(),
    world,
    characters: q('SELECT * FROM characters WHERE world_id=?'),
    locations: q('SELECT * FROM locations WHERE world_id=?'),
    paths: q('SELECT * FROM paths WHERE world_id=?'),
    relationships: q('SELECT * FROM relationships WHERE world_id=?'),
    branches: q('SELECT * FROM branches WHERE world_id=?'),
    ticks: q('SELECT * FROM ticks WHERE world_id=?'),
    memory_chunks: q('SELECT * FROM memory_chunks WHERE world_id=?'),
    state_patches: q('SELECT * FROM state_patches WHERE world_id=?'),
    // asset ROWS only (metadata); the binaries are added to the zip separately by the route
    assets: q('SELECT * FROM assets WHERE world_id=?'),
  };
}

// The list of asset {id, file} pairs whose binaries the zip must include.
export function worldAssetFiles(worldId) {
  return db.prepare('SELECT id, file FROM assets WHERE world_id=?').all(worldId);
}

// Recursively replace any string that is a known old id with its new id, everywhere in a
// parsed-JSON value. Keys are never ids, so only values are remapped.
function remapDeep(value, idMap) {
  if (typeof value === 'string') return idMap.get(value) || value;
  if (Array.isArray(value)) return value.map((v) => remapDeep(v, idMap));
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = remapDeep(value[k], idMap);
    return out;
  }
  return value;
}

// Remap a JSON-string column: parse → deep-remap → re-stringify. Passes through null/blank.
function remapJsonCol(str, idMap) {
  if (str == null || str === '') return str;
  const parsed = pj(str, undefined);
  if (parsed === undefined) return str; // not JSON — leave as-is
  return j(remapDeep(parsed, idMap));
}
const remapId = (v, idMap) => (v == null ? v : (idMap.get(v) || v));

// Restore a world from a manifest + a directory of unzipped asset binaries, owned by `user`.
// Returns the new world id.
export function importWorldManifest(user, manifest, unpackedAssetsDir) {
  if (!manifest || manifest.format !== BUNDLE_FORMAT) {
    throw Object.assign(new Error('This file is not a Vivarium world bundle.'), { statusCode: 400, code: 'BAD_BUNDLE' });
  }
  if (!manifest.world) {
    throw Object.assign(new Error('The bundle is missing its world data.'), { statusCode: 400, code: 'BAD_BUNDLE' });
  }

  // ── build the old→new id map across every entity that carries a primary key ──
  const idMap = new Map();
  const freshen = (rows, prefix) => { for (const r of rows || []) if (r?.id) idMap.set(r.id, uid(prefix + '_')); };
  idMap.set(manifest.world.id, uid('w_'));
  freshen(manifest.characters, 'c');
  freshen(manifest.locations, 'l');
  freshen(manifest.paths, 'p');
  freshen(manifest.relationships, 'r');
  freshen(manifest.branches, 'br');
  freshen(manifest.ticks, 't');
  freshen(manifest.memory_chunks, 'mc');
  freshen(manifest.state_patches, 'sp');
  freshen(manifest.assets, 'a');

  const newWorldId = idMap.get(manifest.world.id);

  // ── stage every row with columns + JSON blobs remapped (no DB writes yet) ──
  const w = manifest.world;
  const worldRow = {
    id: newWorldId, user_id: user.id,
    title: w.title, art_style: w.art_style, sim_time: w.sim_time, tick_index: w.tick_index,
    genre: w.genre, mood: w.mood, pacing: w.pacing, directives: w.directives,
    status: w.status, cover_asset_id: remapId(w.cover_asset_id, idMap),
    active_branch_id: remapId(w.active_branch_id, idMap),
    genesis_state: remapJsonCol(w.genesis_state, idMap),
    created_at: w.created_at, updated_at: now(),
  };
  const chars = (manifest.characters || []).map((c) => ({
    id: idMap.get(c.id), world_id: newWorldId, name: c.name,
    base_profile: remapJsonCol(c.base_profile, idMap),
    materialised: remapJsonCol(c.materialised, idMap),
    reference_asset_id: remapId(c.reference_asset_id, idMap),
    voice: c.voice, created_at: c.created_at,
    // LAIONBox cloned-voice reference (clip asset id + the DramaBox prompt it came from);
    // null in bundles exported before the LAIONBox feature or under the Gemini engine.
    voice_ref_asset_id: remapId(c.voice_ref_asset_id ?? null, idMap),
    voice_ref_prompt: c.voice_ref_prompt ?? null,
  }));
  const locs = (manifest.locations || []).map((l) => ({
    id: idMap.get(l.id), world_id: newWorldId, name: l.name, type: l.type,
    place_group: l.place_group, description: l.description,
    background_asset_id: remapId(l.background_asset_id, idMap), x: l.x, y: l.y,
  }));
  const paths = (manifest.paths || []).map((p) => ({
    id: idMap.get(p.id), world_id: newWorldId, from_id: remapId(p.from_id, idMap), to_id: remapId(p.to_id, idMap), label: p.label,
  }));
  const rels = (manifest.relationships || []).map((r) => ({
    id: idMap.get(r.id), world_id: newWorldId, from_id: remapId(r.from_id, idMap), to_id: remapId(r.to_id, idMap),
    description: r.description, strength: r.strength,
    history: remapJsonCol(r.history, idMap), attributes: remapJsonCol(r.attributes, idMap),
  }));
  const branchRows = (manifest.branches || []).map((b) => ({
    id: idMap.get(b.id), world_id: newWorldId, parent_branch_id: remapId(b.parent_branch_id, idMap),
    fork_tick_idx: b.fork_tick_idx, label: b.label, created_at: b.created_at,
  }));
  const tickRows = (manifest.ticks || []).map((t) => ({
    id: idMap.get(t.id), world_id: newWorldId, idx: t.idx, sim_time: t.sim_time, time_delta: t.time_delta,
    intervention: remapJsonCol(t.intervention, idMap), states: remapJsonCol(t.states, idMap),
    narration: remapJsonCol(t.narration, idMap), mood_tag: t.mood_tag, summary: t.summary,
    cost: t.cost, created_at: t.created_at, pov_location_id: remapId(t.pov_location_id, idMap),
    branch_id: remapId(t.branch_id, idMap), rel_snapshot: remapJsonCol(t.rel_snapshot, idMap),
  }));
  const memRows = (manifest.memory_chunks || []).map((mchunk) => ({
    id: idMap.get(mchunk.id), world_id: newWorldId, branch_id: remapId(mchunk.branch_id, idMap),
    level: mchunk.level, start_idx: mchunk.start_idx, end_idx: mchunk.end_idx, text: mchunk.text, created_at: mchunk.created_at,
  }));
  const patchRows = (manifest.state_patches || []).map((p) => ({
    id: idMap.get(p.id), world_id: newWorldId, entity_ref: p.entity_ref, entity_id: remapId(p.entity_id, idMap),
    idx: p.idx, tick_ref: p.tick_ref, author: p.author, category: p.category, op: p.op, path: p.path,
    value: remapJsonCol(p.value, idMap), reason: p.reason, created_at: p.created_at,
  }));
  // Asset rows: keep original filename EXTENSION, mint a new file named <newId>.<ext>.
  const assetRows = (manifest.assets || []).map((a) => {
    const newId = idMap.get(a.id);
    const ext = (a.file && a.file.includes('.')) ? a.file.split('.').pop() : 'bin';
    return {
      _oldFile: a.file, id: newId, user_id: user.id, world_id: newWorldId,
      kind: a.kind, owner_ref: remapId(a.owner_ref, idMap), prompt: a.prompt, prompt_hash: a.prompt_hash,
      file: `${newId}.${ext}`, mime: a.mime, w: a.w, h: a.h, meta: remapJsonCol(a.meta, idMap), created_at: a.created_at,
    };
  });

  // ── commit rows atomically ──
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO worlds(id,user_id,title,art_style,sim_time,tick_index,genre,mood,pacing,directives,status,cover_asset_id,active_branch_id,genesis_state,created_at,updated_at)
      VALUES (@id,@user_id,@title,@art_style,@sim_time,@tick_index,@genre,@mood,@pacing,@directives,@status,@cover_asset_id,@active_branch_id,@genesis_state,@created_at,@updated_at)`).run(worldRow);
    const ins = (sql, rows) => { const st = db.prepare(sql); for (const r of rows) st.run(r); };
    ins(`INSERT INTO characters(id,world_id,name,base_profile,materialised,reference_asset_id,voice,created_at,voice_ref_asset_id,voice_ref_prompt)
         VALUES (@id,@world_id,@name,@base_profile,@materialised,@reference_asset_id,@voice,@created_at,@voice_ref_asset_id,@voice_ref_prompt)`, chars);
    ins(`INSERT INTO locations(id,world_id,name,type,place_group,description,background_asset_id,x,y)
         VALUES (@id,@world_id,@name,@type,@place_group,@description,@background_asset_id,@x,@y)`, locs);
    ins(`INSERT INTO paths(id,world_id,from_id,to_id,label) VALUES (@id,@world_id,@from_id,@to_id,@label)`, paths);
    ins(`INSERT INTO relationships(id,world_id,from_id,to_id,description,strength,history,attributes)
         VALUES (@id,@world_id,@from_id,@to_id,@description,@strength,@history,@attributes)`, rels);
    ins(`INSERT INTO branches(id,world_id,parent_branch_id,fork_tick_idx,label,created_at)
         VALUES (@id,@world_id,@parent_branch_id,@fork_tick_idx,@label,@created_at)`, branchRows);
    ins(`INSERT INTO ticks(id,world_id,idx,sim_time,time_delta,intervention,states,narration,mood_tag,summary,cost,created_at,pov_location_id,branch_id,rel_snapshot)
         VALUES (@id,@world_id,@idx,@sim_time,@time_delta,@intervention,@states,@narration,@mood_tag,@summary,@cost,@created_at,@pov_location_id,@branch_id,@rel_snapshot)`, tickRows);
    ins(`INSERT INTO memory_chunks(id,world_id,branch_id,level,start_idx,end_idx,text,created_at)
         VALUES (@id,@world_id,@branch_id,@level,@start_idx,@end_idx,@text,@created_at)`, memRows);
    ins(`INSERT INTO state_patches(id,world_id,entity_ref,entity_id,idx,tick_ref,author,category,op,path,value,reason,created_at)
         VALUES (@id,@world_id,@entity_ref,@entity_id,@idx,@tick_ref,@author,@category,@op,@path,@value,@reason,@created_at)`, patchRows);
    ins(`INSERT INTO assets(id,user_id,world_id,kind,owner_ref,prompt,prompt_hash,file,mime,w,h,meta,created_at)
         VALUES (@id,@user_id,@world_id,@kind,@owner_ref,@prompt,@prompt_hash,@file,@mime,@w,@h,@meta,@created_at)`,
         assetRows.map(({ _oldFile, ...row }) => row));
  });
  tx();

  // ── copy asset binaries into the live asset store (after the row commit) ──
  let missing = 0;
  for (const a of assetRows) {
    const src = a._oldFile ? path.join(unpackedAssetsDir, path.basename(a._oldFile)) : null;
    const dst = path.join(ASSET_DIR, a.file);
    if (src && fs.existsSync(src)) fs.copyFileSync(src, dst);
    else missing++; // asset row imported but its binary was absent from the zip → broken image; tolerated
  }

  return { worldId: newWorldId, title: worldRow.title, assets: assetRows.length, missingAssetBinaries: missing };
}
