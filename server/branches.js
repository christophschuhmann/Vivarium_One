// Git-like tick history: undo, redo, and branching.
// A world's play-through is a DAG of branches. Each branch has a `fork_tick_idx` —
// the last tick idx it shares with its parent — and its own ticks continue the GLOBAL,
// never-reused idx counter from there. Undo/redo just moves the "head" pointer
// (world.tick_index) along the active branch; advancing from a non-head position forks
// a brand-new branch instead of overwriting the abandoned future.
import { db, uid, now, j, pj } from './db.js';

export function ensureRootBranch(world) {
  if (world.active_branch_id) {
    const b = db.prepare('SELECT * FROM branches WHERE id=?').get(world.active_branch_id);
    if (b) return b;
  }
  const id = uid('br_');
  db.prepare(`INSERT INTO branches(id,world_id,parent_branch_id,fork_tick_idx,label,created_at) VALUES (?,?,NULL,0,'Main timeline',?)`)
    .run(id, world.id, now());
  db.prepare(`UPDATE ticks SET branch_id=? WHERE world_id=? AND branch_id IS NULL`).run(id, world.id);
  db.prepare(`UPDATE memory_chunks SET branch_id=? WHERE world_id=? AND branch_id IS NULL`).run(id, world.id);
  db.prepare('UPDATE worlds SET active_branch_id=? WHERE id=?').run(id, world.id);
  world.active_branch_id = id;
  return db.prepare('SELECT * FROM branches WHERE id=?').get(id);
}

// Root-to-target chain of branches.
export function resolveLineage(branchId) {
  const chain = [];
  let b = db.prepare('SELECT * FROM branches WHERE id=?').get(branchId);
  while (b) { chain.unshift(b); b = b.parent_branch_id ? db.prepare('SELECT * FROM branches WHERE id=?').get(b.parent_branch_id) : null; }
  return chain;
}

// All ticks visible when standing on `branchId` at position `upToIdx` (default: that branch's own tip).
export function visibleTicks(worldId, branchId, upToIdx = Infinity) {
  const chain = resolveLineage(branchId);
  if (!chain.length) return [];
  const segments = chain.map((br, i) => ({ branchId: br.id, maxIdx: i < chain.length - 1 ? chain[i + 1].fork_tick_idx : upToIdx }));
  const rows = [];
  for (const seg of segments) {
    rows.push(...db.prepare('SELECT * FROM ticks WHERE world_id=? AND branch_id=? AND idx<=? ORDER BY idx').all(worldId, seg.branchId, seg.maxIdx));
  }
  return rows.sort((a, b) => a.idx - b.idx);
}

export function nextGlobalIdx(worldId) {
  return (db.prepare('SELECT COALESCE(MAX(idx),0) m FROM ticks WHERE world_id=?').get(worldId).m) + 1;
}

// Does the active branch have ticks of its OWN beyond the current head? (mid-history)
export function hasForwardTicks(worldId, branchId, afterIdx) {
  return !!db.prepare('SELECT 1 FROM ticks WHERE world_id=? AND branch_id=? AND idx>? LIMIT 1').get(worldId, branchId, afterIdx);
}

// The next tick idx forward along `branchId`'s own timeline after `afterIdx` (for redo).
export function nextOwnTick(worldId, branchId, afterIdx) {
  return db.prepare('SELECT * FROM ticks WHERE world_id=? AND branch_id=? AND idx>? ORDER BY idx ASC LIMIT 1').get(worldId, branchId, afterIdx);
}
export function prevVisibleTick(worldId, branchId, beforeIdx) {
  const vis = visibleTicks(worldId, branchId, beforeIdx - 1);
  return vis.length ? vis[vis.length - 1] : null;
}

export function captureGenesisSnapshot(world) {
  const chars = db.prepare('SELECT id, materialised FROM characters WHERE world_id=?').all(world.id)
    .map(c => ({ id: c.id, materialised: pj(c.materialised, {}) }));
  const rels = db.prepare('SELECT id, description, strength, attributes FROM relationships WHERE world_id=?').all(world.id)
    .map(r => ({ id: r.id, description: r.description, strength: r.strength, attributes: pj(r.attributes, {}) }));
  const snapshot = { characters: chars, relationships: rels, sim_time: world.sim_time };
  db.prepare('UPDATE worlds SET genesis_state=? WHERE id=?').run(j(snapshot), world.id);
  ensureRootBranch(world);
  return snapshot;
}

export function relSnapshot(worldId) {
  return db.prepare('SELECT id, description, strength, attributes FROM relationships WHERE world_id=?').all(worldId)
    .map(r => ({ id: r.id, description: r.description, strength: r.strength, attributes: pj(r.attributes, {}) }));
}

// Restore all character/relationship state + the clock to exactly `targetIdx` on `branchId`.
// targetIdx=0 restores the genesis snapshot (world creation, pre-tick).
export function restoreToTick(world, branchId, targetIdx) {
  let charStates, rels, simTime;
  if (targetIdx <= 0) {
    const snap = pj(world.genesis_state, null);
    if (!snap) throw Object.assign(new Error('This world has no captured starting point to undo back to — the earliest you can go is tick 1.'), { statusCode: 400, code: 'NO_GENESIS_SNAPSHOT' });
    charStates = Object.fromEntries(snap.characters.map(c => [c.id, c.materialised]));
    rels = snap.relationships;
    simTime = snap.sim_time;
    targetIdx = 0;
  } else {
    const vis = visibleTicks(world.id, branchId, targetIdx);
    const tick = vis.find(t => t.idx === targetIdx);
    if (!tick) throw Object.assign(new Error('That moment is not on this timeline.'), { statusCode: 400, code: 'BAD_TICK' });
    charStates = Object.fromEntries(pj(tick.states, []).map(s => [s.character_id, s]));
    rels = pj(tick.rel_snapshot, null) ?? relSnapshot(world.id); // legacy ticks predating rel_snapshot
    simTime = tick.sim_time;
  }
  const tx = db.transaction(() => {
    for (const [cid, st] of Object.entries(charStates)) {
      const clean = { ...st }; delete clean.character_id; delete clean.events;
      db.prepare('UPDATE characters SET materialised=? WHERE id=? AND world_id=?').run(j(clean), cid, world.id);
    }
    for (const r of rels) {
      db.prepare('UPDATE relationships SET description=?, strength=?, attributes=? WHERE id=? AND world_id=?')
        .run(r.description, r.strength, j(r.attributes || {}), r.id, world.id);
    }
    db.prepare('UPDATE worlds SET sim_time=?, tick_index=?, active_branch_id=?, updated_at=? WHERE id=?')
      .run(simTime, targetIdx, branchId, now(), world.id);
  });
  tx();
  return { tick_index: targetIdx, branch_id: branchId, sim_time: simTime };
}

export function listBranches(worldId) {
  const branches = db.prepare('SELECT * FROM branches WHERE world_id=? ORDER BY created_at').all(worldId);
  return branches.map(b => {
    const head = db.prepare('SELECT COALESCE(MAX(idx),?) m FROM ticks WHERE world_id=? AND branch_id=?').get(b.fork_tick_idx, worldId, b.id).m;
    const count = db.prepare('SELECT COUNT(*) n FROM ticks WHERE world_id=? AND branch_id=?').get(worldId, b.id).n;
    return { ...b, head_idx: head, own_tick_count: count };
  });
}
