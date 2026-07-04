// Dev/test-only endpoints. Mounted ONLY when TEST_MODE=1 and not in production.
import { db, now } from '../db.js';
import * as auth from '../auth.js';

export default async function testRoutes(app) {
  app.get('/api/test/mailbox', async () => ({ mailbox: auth.mailbox.slice(-20).reverse() }));
  app.post('/api/test/login-as', async (req, reply) => {
    const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(req.body?.email || '').toLowerCase());
    if (!u) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'no such user' } });
    reply.setCookie('vsession', auth.createSession(u.id), { path: '/', httpOnly: true, sameSite: 'lax' });
    return { ok: true };
  });
  app.post('/api/test/verify-user', async (req) => {
    db.prepare('UPDATE users SET email_verified_at=? WHERE email=?').run(now(), String(req.body?.email || '').toLowerCase());
    return { ok: true };
  });
  app.get('/api/test/memory/:worldId', async (req) => {
    const { contextEstimate, ctxConfig } = await import('../gm.js');
    const cfg = ctxConfig();
    const w = db.prepare('SELECT active_branch_id FROM worlds WHERE id=?').get(req.params.worldId);
    return {
      window: cfg.tickWindow, budget: cfg.contextBudget,
      estimate: contextEstimate(req.params.worldId, w?.active_branch_id),
      chunks: db.prepare('SELECT level,start_idx,end_idx,length(text) len,substr(text,1,150) preview FROM memory_chunks WHERE world_id=? ORDER BY level DESC, start_idx ASC').all(req.params.worldId),
    };
  });
}
