// Admin API — separate realm, fully audited.
import fs from 'node:fs';
import { db, uid, now, j, pj, getSetting, setSetting } from '../db.js';
import * as auth from '../auth.js';
import { requireAdmin, httpErr } from '../auth.js';
import { record, toMicro, toCredits } from '../credits.js';
import { getAsset, assetPath } from '../assets.js';

// Full cascade cleanup for a user: assets on disk + every child table that lacks a
// DB-level ON DELETE CASCADE to worlds/users (see memory notes — several were added
// ad hoc across features and never wired into the schema's cascade chain).
function deleteUserCompletely(userId) {
  const worldIds = db.prepare('SELECT id FROM worlds WHERE user_id=?').all(userId).map(r => r.id);
  const assets = db.prepare('SELECT file FROM assets WHERE user_id=?').all(userId);
  const tx = db.transaction(() => {
    for (const wid of worldIds) {
      for (const t of ['relationships', 'paths', 'state_patches', 'memory_chunks', 'branches']) {
        db.prepare(`DELETE FROM ${t} WHERE world_id=?`).run(wid);
      }
    }
    for (const t of ['assets', 'chat_logs', 'credit_ledger', 'provider_calls', 'video_jobs']) {
      db.prepare(`DELETE FROM ${t} WHERE user_id=?`).run(userId);
    }
    db.prepare('DELETE FROM users WHERE id=?').run(userId); // cascades sessions, auth_tokens, worlds (-> characters, locations, ticks)
  });
  tx();
  for (const a of assets) fs.rmSync(assetPath({ file: a.file }), { force: true });
}

function audit(adminId, action, target, payload = {}) {
  db.prepare('INSERT INTO admin_audit(id,admin_id,action,target,payload,created_at) VALUES (?,?,?,?,?,?)')
    .run(uid('au_'), adminId, action, target, j(payload), now());
}

export default async function adminRoutes(app) {
  app.post('/admin/api/login', async (req, reply) => {
    const u = auth.login(req.body?.email, req.body?.password);
    if (u.role !== 'admin') throw httpErr(403, 'NOT_ADMIN', 'This account has no admin access.');
    reply.setCookie('asession', auth.createSession(u.id, 'admin'), { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 2 * 3600 });
    audit(u.id, 'login', u.email);
    return { ok: true, admin: { email: u.email, displayName: u.display_name } };
  });
  app.post('/admin/api/logout', async (req, reply) => {
    if (req.cookies?.asession) auth.destroySession(req.cookies.asession);
    reply.clearCookie('asession', { path: '/' });
    return { ok: true };
  });
  app.get('/admin/api/me', async (req) => {
    const a = requireAdmin(req);
    return { admin: { email: a.email, displayName: a.display_name } };
  });

  app.get('/admin/api/stats', async (req) => {
    requireAdmin(req);
    const users = db.prepare(`SELECT COUNT(*) n FROM users WHERE role='player'`).get().n;
    const worlds = db.prepare('SELECT COUNT(*) n FROM worlds').get().n;
    const ticks = db.prepare('SELECT COUNT(*) n FROM ticks').get().n;
    const spend = db.prepare(`SELECT reason, COUNT(*) calls, SUM(-delta) micro, SUM(raw_cost_usd) usd FROM credit_ledger WHERE delta<0 GROUP BY reason ORDER BY micro DESC`).all()
      .map(r => ({ reason: r.reason, calls: r.calls, credits: toCredits(r.micro || 0), rawUsd: +(r.usd || 0).toFixed(4) }));
    const byDay = db.prepare(`SELECT substr(created_at,1,10) day, SUM(CASE WHEN delta<0 THEN -delta ELSE 0 END) spent, SUM(CASE WHEN delta>0 THEN delta ELSE 0 END) granted
                              FROM credit_ledger GROUP BY day ORDER BY day DESC LIMIT 14`).all()
      .map(r => ({ day: r.day, spent: toCredits(r.spent || 0), granted: toCredits(r.granted || 0) }));
    const topUsers = db.prepare(`SELECT u.email, SUM(-l.delta) micro FROM credit_ledger l JOIN users u ON u.id=l.user_id WHERE l.delta<0 GROUP BY u.id ORDER BY micro DESC LIMIT 8`).all()
      .map(r => ({ email: r.email, credits: toCredits(r.micro || 0) }));
    return { users, worlds, ticks, spend, byDay, topUsers, pricing: getSetting('pricing') };
  });

  app.get('/admin/api/users', async (req) => {
    requireAdmin(req);
    const q = `%${(req.query.q || '').toLowerCase()}%`;
    const rows = db.prepare(`SELECT * FROM users WHERE email LIKE ? OR lower(display_name) LIKE ? ORDER BY created_at DESC LIMIT 200`).all(q, q);
    return { users: rows.map(u => ({
      id: u.id, email: u.email, displayName: u.display_name, role: u.role, status: u.status,
      verified: !!u.email_verified_at, credits: toCredits(u.credit_balance), dailyCap: toCredits(u.daily_cap),
      worlds: db.prepare('SELECT COUNT(*) n FROM worlds WHERE user_id=?').get(u.id).n,
      lifetimeSpend: toCredits(db.prepare('SELECT COALESCE(SUM(-delta),0) s FROM credit_ledger WHERE user_id=? AND delta<0').get(u.id).s),
      lastActive: u.last_active_at, createdAt: u.created_at,
    })) };
  });
  app.post('/admin/api/users', async (req) => {
    const a = requireAdmin(req);
    const u = auth.signup({ email: req.body?.email, password: req.body?.password || uid('pw_'), displayName: req.body?.displayName || 'New player' });
    if (req.body?.preVerified) db.prepare('UPDATE users SET email_verified_at=? WHERE id=?').run(now(), u.id);
    audit(a.id, 'create_user', u.email, {});
    return { ok: true, userId: u.id };
  });
  app.get('/admin/api/users/:id/ledger', async (req) => {
    requireAdmin(req);
    const rows = db.prepare('SELECT * FROM credit_ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 300').all(req.params.id);
    return { ledger: rows.map(r => ({ at: r.created_at, credits: toCredits(r.delta), reason: r.reason, model: r.model, rawUsd: r.raw_cost_usd, meter: pj(r.meter, {}), by: r.created_by })) };
  });
  app.post('/admin/api/users/:id/credits', async (req) => {
    const a = requireAdmin(req);
    const target = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!target) throw httpErr(404, 'NOT_FOUND', 'User not found.');
    const credits = Number(req.body?.credits);
    if (!Number.isFinite(credits) || credits === 0) throw httpErr(400, 'BAD_AMOUNT', 'Give a non-zero credit amount.');
    record(target.id, { delta: toMicro(credits), reason: credits > 0 ? 'admin_grant' : 'admin_revoke', createdBy: a.email });
    audit(a.id, credits > 0 ? 'grant_credits' : 'revoke_credits', target.email, { credits, reason: req.body?.reason || '' });
    return { ok: true, newBalance: toCredits(db.prepare('SELECT credit_balance FROM users WHERE id=?').get(target.id).credit_balance) };
  });
  app.patch('/admin/api/users/:id', async (req) => {
    const a = requireAdmin(req);
    const target = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!target) throw httpErr(404, 'NOT_FOUND', 'User not found.');
    const b = req.body || {};
    if (b.status) db.prepare('UPDATE users SET status=? WHERE id=?').run(b.status === 'suspended' ? 'suspended' : 'active', target.id);
    if (b.dailyCapCredits != null) db.prepare('UPDATE users SET daily_cap=? WHERE id=?').run(toMicro(Number(b.dailyCapCredits)), target.id);
    if (b.verify) db.prepare('UPDATE users SET email_verified_at=? WHERE id=?').run(now(), target.id);
    audit(a.id, 'update_user', target.email, b);
    return { ok: true };
  });
  app.delete('/admin/api/users/:id', async (req) => {
    const a = requireAdmin(req);
    const target = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!target) throw httpErr(404, 'NOT_FOUND', 'User not found.');
    if (target.role === 'admin') throw httpErr(400, 'CANT_DELETE_ADMIN', 'Cannot delete an admin account.');
    deleteUserCompletely(target.id);
    audit(a.id, 'delete_user', target.email, {});
    return { ok: true };
  });

  app.get('/admin/api/model-routes', async (req) => {
    requireAdmin(req);
    return {
      routes: db.prepare('SELECT * FROM model_routes').all().map(r => ({ ...r, unit_cost: pj(r.unit_cost, {}), params: pj(r.params, {}) })),
      ttsProvider: getSetting('tts_provider') || 'gemini',   // which TTS engine is live (see below)
    };
  });
  // Switch the app-wide TTS engine: 'gemini' (prebuilt voices) | 'laionbox' (self-hosted voice
  // cloning — characters then need reference-voice clips, managed by the players in-game).
  // Probes the LAIONBox /health endpoint before enabling it so the admin can't switch to a dead box.
  app.patch('/admin/api/tts-provider', async (req) => {
    const a = requireAdmin(req);
    const provider = req.body?.provider === 'laionbox' ? 'laionbox' : 'gemini';
    if (provider === 'laionbox') {
      const r = db.prepare(`SELECT base_url FROM model_routes WHERE role='tts_laionbox'`).get();
      try {
        const h = await fetch(`${r.base_url}/health`, { signal: AbortSignal.timeout(8000) }).then(x => x.json());
        if (h.status !== 'ok') throw new Error('status ' + h.status);
      } catch (e) {
        throw httpErr(502, 'LAIONBOX_DOWN', `LAIONBox server is not reachable (${e.message}) — not switching.`);
      }
    }
    setSetting('tts_provider', provider);
    audit(a.id, 'set_tts_provider', provider, {});
    return { ok: true, ttsProvider: provider };
  });
  app.patch('/admin/api/model-routes/:role', async (req) => {
    const a = requireAdmin(req);
    const r = db.prepare('SELECT * FROM model_routes WHERE role=?').get(req.params.role);
    if (!r) throw httpErr(404, 'NOT_FOUND', 'Route not found.');
    const b = req.body || {};
    db.prepare(`UPDATE model_routes SET model=COALESCE(?,model), base_url=COALESCE(?,base_url),
                unit_cost=COALESCE(?,unit_cost), enabled=COALESCE(?,enabled) WHERE role=?`)
      .run(b.model, b.baseUrl, b.unitCost ? j(b.unitCost) : null, b.enabled == null ? null : (b.enabled ? 1 : 0), r.role);
    audit(a.id, 'update_model_route', r.role, b);
    return { ok: true };
  });
  app.patch('/admin/api/pricing', async (req) => {
    const a = requireAdmin(req);
    const p = { ...getSetting('pricing'), ...(req.body || {}) };
    setSetting('pricing', p);
    audit(a.id, 'update_pricing', 'pricing', p);
    return { pricing: p };
  });

  // ---------- context / memory tuning ----------
  // Live config + fleet-wide context stats + a real per-tick token average from the ledger.
  app.get('/admin/api/context', async (req) => {
    requireAdmin(req);
    const cfg = { tickWindow: 50, memChunk: 5, contextBudget: 200000, compressionRatio: 0.5, ...(getSetting('context_config') || {}) };
    // real API-reported usage across the last 200 ticks (any world)
    const rows = db.prepare(`SELECT meter FROM credit_ledger WHERE reason='tick_llm' ORDER BY created_at DESC LIMIT 200`).all();
    let inSum = 0, outSum = 0, n = 0;
    for (const r of rows) { const u = pj(r.meter, {}).usage || pj(r.meter, {}); if (u.prompt_tokens) { inSum += u.prompt_tokens; outSum += u.completion_tokens || 0; n++; } }
    // worlds with the most ticks (candidates worth inspecting)
    const worlds = db.prepare(`SELECT w.id, w.title, w.tick_index, u.email FROM worlds w JOIN users u ON u.id=w.user_id ORDER BY w.tick_index DESC LIMIT 30`).all();
    return {
      config: cfg,
      defaults: { tickWindow: 50, memChunk: 5, contextBudget: 200000, compressionRatio: 0.5 },
      usage: n ? { samples: n, avgInput: Math.round(inSum / n), avgOutput: Math.round(outSum / n), avgTotal: Math.round((inSum + outSum) / n) } : null,
      worlds,
    };
  });
  app.get('/admin/api/context/:worldId', async (req) => {
    requireAdmin(req);
    const { contextBreakdown } = await import('../gm.js');
    const b = contextBreakdown(req.params.worldId);
    if (!b) throw httpErr(404, 'NOT_FOUND', 'World not found.');
    return b;
  });
  app.patch('/admin/api/context', async (req) => {
    const a = requireAdmin(req);
    const b = req.body || {};
    const cur = { tickWindow: 50, memChunk: 5, contextBudget: 200000, compressionRatio: 0.5, ...(getSetting('context_config') || {}) };
    const next = {
      tickWindow: Math.max(2, Math.min(500, Math.round(+b.tickWindow || cur.tickWindow))),
      memChunk: Math.max(2, Math.min(50, Math.round(+b.memChunk || cur.memChunk))),
      contextBudget: Math.max(10000, Math.round(+b.contextBudget || cur.contextBudget)),
      compressionRatio: Math.max(0.2, Math.min(0.9, +b.compressionRatio || cur.compressionRatio)),
    };
    setSetting('context_config', next);
    audit(a.id, 'update_context_config', 'context', next);
    return { config: next };
  });
  // ---------- prompt transparency & editing ----------
  // Shows every prompt template the app sends to models, plus the EXACT system/user prompt
  // of the most recent real tick (from telemetry — zero doc-drift), and lets the admin edit
  // the storytelling core block that is injected into every tick.
  app.get('/admin/api/prompts', async (req) => {
    requireAdmin(req);
    const gm = await import('../gm.js');
    const ec = await import('../export_cues.js');
    const lastTick = db.prepare(`SELECT request FROM provider_calls WHERE surface='tick' ORDER BY created_at DESC LIMIT 1`).get();
    let lastSys = null, lastUser = null;
    try { const msgs = pj(lastTick?.request, []); lastSys = msgs[0]?.content || null; lastUser = (msgs[1]?.content || '').slice(0, 4000); } catch {}
    return {
      gmCore: { current: gm.gmCoreDirectives(), default: gm.GM_CORE_DEFAULT, customised: gm.gmCoreDirectives() !== gm.GM_CORE_DEFAULT },
      lastTick: { system: lastSys, userPreview: lastUser },
      tts: {
        gemini: { narrator: ec.NARRATOR_STYLE, character: ec.CHARACTER_STYLE_TEMPLATE, note: 'Gemini overacts by default — these calm/measured templates rein it in (winners of the judged narrator experiment).' },
        laionbox: { narrator: ec.LAIONBOX_NARRATOR_STYLE, character: ec.LAIONBOX_CHARACTER_TEMPLATE, note: 'LAIONBox is naturalistic and emotionally clamped — these vivid templates push it to make feelings audible.' },
        thoughtSuffix: ec.THOUGHT_SUFFIX,
      },
    };
  });
  app.patch('/admin/api/prompts', async (req) => {
    const a = requireAdmin(req);
    const text = String(req.body?.gmCore ?? '').slice(0, 4000);
    setSetting('gm_core_directives', text);   // empty string → gmCoreDirectives() falls back to default
    audit(a.id, 'update_gm_core', 'prompts', { length: text.length });
    const gm = await import('../gm.js');
    return { gmCore: { current: gm.gmCoreDirectives(), default: gm.GM_CORE_DEFAULT } };
  });

  app.get('/admin/api/audit', async (req) => {
    requireAdmin(req);
    return { audit: db.prepare('SELECT * FROM admin_audit ORDER BY created_at DESC LIMIT 200').all().map(r => ({ ...r, payload: pj(r.payload, {}) })) };
  });
  app.get('/admin/api/mailbox', async (req) => {
    requireAdmin(req);
    return { mailbox: auth.mailbox.slice(-50).reverse() };
  });

  // ---------- data explorer: everything a user has ever generated ----------
  app.get('/admin/api/users/:id/calls', async (req) => {
    requireAdmin(req);
    const kind = req.query.kind || null, surface = req.query.surface || null;
    const before = req.query.before || now();
    const limit = Math.min(200, +(req.query.limit || 60));
    let sql = `SELECT id,kind,surface,world_id,tick_ref,asset_id,provider,model,raw_cost_usd,meter,created_at,
               substr(request,1,220) request_preview, substr(response,1,220) response_preview
               FROM provider_calls WHERE user_id=? AND created_at<?`;
    const params = [req.params.id, before];
    if (kind) { sql += ' AND kind=?'; params.push(kind); }
    if (surface) { sql += ' AND surface=?'; params.push(surface); }
    sql += ' ORDER BY created_at DESC LIMIT ?'; params.push(limit);
    const rows = db.prepare(sql).all(...params);
    return { calls: rows.map(r => ({ ...r, meter: pj(r.meter, {}) })) };
  });
  app.get('/admin/api/calls/:callId', async (req) => {
    requireAdmin(req);
    const c = db.prepare('SELECT * FROM provider_calls WHERE id=?').get(req.params.callId);
    if (!c) throw httpErr(404, 'NOT_FOUND', 'Call not found.');
    return { call: { ...c, request: pj(c.request, c.request), response: pj(c.response, c.response), meter: pj(c.meter, {}), meta: pj(c.meta, {}) } };
  });
  app.get('/admin/api/users/:id/summary', async (req) => {
    requireAdmin(req);
    const uidP = req.params.id;
    const counts = db.prepare('SELECT kind, COUNT(*) n, SUM(raw_cost_usd) usd FROM provider_calls WHERE user_id=? GROUP BY kind').all(uidP);
    const worlds = db.prepare('SELECT id, title, tick_index, status, created_at FROM worlds WHERE user_id=? ORDER BY created_at DESC').all(uidP);
    const assets = db.prepare('SELECT kind, COUNT(*) n FROM assets WHERE user_id=? GROUP BY kind').all(uidP);
    const chatTurns = db.prepare('SELECT COUNT(*) n FROM chat_logs WHERE user_id=?').get(uidP).n;
    return { counts, worlds, assets, chatTurns };
  });
  app.get('/admin/api/users/:id/chatlogs', async (req) => {
    requireAdmin(req);
    const rows = db.prepare('SELECT * FROM chat_logs WHERE user_id=? ORDER BY created_at DESC LIMIT 300').all(req.params.id);
    return { logs: rows };
  });
  app.get('/admin/api/assets/:id', async (req, reply) => {
    requireAdmin(req);
    const a = getAsset(req.params.id);
    if (!a) throw httpErr(404, 'NOT_FOUND', 'Asset not found.');
    reply.type(a.mime);
    return reply.send(fs.createReadStream(assetPath(a)));
  });

  function buildUserExport(userId) {
    const user = db.prepare('SELECT id,email,display_name,role,status,credit_balance,created_at,last_active_at FROM users WHERE id=?').get(userId);
    if (!user) return null;
    const worlds = db.prepare('SELECT * FROM worlds WHERE user_id=?').all(userId).map(w => ({
      ...w, genesis_state: pj(w.genesis_state, null),
      characters: db.prepare('SELECT * FROM characters WHERE world_id=?').all(w.id).map(c => ({ ...c, base_profile: pj(c.base_profile, {}), materialised: pj(c.materialised, {}) })),
      locations: db.prepare('SELECT * FROM locations WHERE world_id=?').all(w.id),
      paths: db.prepare('SELECT * FROM paths WHERE world_id=?').all(w.id),
      relationships: db.prepare('SELECT * FROM relationships WHERE world_id=?').all(w.id).map(r => ({ ...r, history: pj(r.history, []), attributes: pj(r.attributes, {}) })),
      branches: db.prepare('SELECT * FROM branches WHERE world_id=?').all(w.id),
      ticks: db.prepare('SELECT * FROM ticks WHERE world_id=?').all(w.id).map(t => ({ ...t, states: pj(t.states, []), narration: pj(t.narration, []), intervention: pj(t.intervention), rel_snapshot: pj(t.rel_snapshot, null), cost: pj(t.cost, {}) })),
      memory_chunks: db.prepare('SELECT * FROM memory_chunks WHERE world_id=?').all(w.id),
      state_patches: db.prepare('SELECT * FROM state_patches WHERE world_id=?').all(w.id).map(p => ({ ...p, value: pj(p.value) })),
    }));
    const providerCalls = db.prepare('SELECT * FROM provider_calls WHERE user_id=? ORDER BY created_at').all(userId)
      .map(c => ({ ...c, request: pj(c.request, c.request), response: pj(c.response, c.response), meter: pj(c.meter, {}), meta: pj(c.meta, {}), assetUrl: c.asset_id ? `/admin/api/assets/${c.asset_id}` : null }));
    const chatLogs = db.prepare('SELECT * FROM chat_logs WHERE user_id=? ORDER BY created_at').all(userId);
    const ledger = db.prepare('SELECT * FROM credit_ledger WHERE user_id=? ORDER BY created_at').all(userId).map(l => ({ ...l, meter: pj(l.meter, {}) }));
    const assets = db.prepare('SELECT id,world_id,kind,prompt,mime,w,h,meta,created_at FROM assets WHERE user_id=?').all(userId)
      .map(a => ({ ...a, meta: pj(a.meta, {}), url: `/admin/api/assets/${a.id}` }));
    return { exported_at: now(), user, worlds, provider_calls: providerCalls, chat_logs: chatLogs, credit_ledger: ledger, assets };
  }
  app.get('/admin/api/users/:id/export', async (req, reply) => {
    const a = requireAdmin(req);
    const data = buildUserExport(req.params.id);
    if (!data) throw httpErr(404, 'NOT_FOUND', 'User not found.');
    audit(a.id, 'export_user_data', data.user.email, {});
    reply.header('Content-Disposition', `attachment; filename="vivarium-export-${data.user.email}.json"`);
    return data;
  });
  // Full-corpus export for offline analysis: GET /admin/api/export (all users) or ?userId= for one.
  app.get('/admin/api/export', async (req, reply) => {
    const a = requireAdmin(req);
    if (req.query.userId) {
      const data = buildUserExport(req.query.userId);
      if (!data) throw httpErr(404, 'NOT_FOUND', 'User not found.');
      audit(a.id, 'export_user_data', data.user.email, {});
      return data;
    }
    const ids = db.prepare('SELECT id FROM users').all().map(r => r.id);
    audit(a.id, 'export_all_data', 'all users', { count: ids.length });
    reply.header('Content-Disposition', `attachment; filename="vivarium-export-all.json"`);
    return { exported_at: now(), users: ids.map(buildUserExport) };
  });
}
