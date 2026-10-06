// Server entry point: boots Fastify, serves the SPA from web/, registers the three route
// realms (player /api, operator /admin/api, and /api/test when TEST_MODE=1). Importing
// ./db.js runs the schema + migrations + seed rows as a side effect before anything listens.
// Config via env: PORT, VIV_DATA_DIR, HYPRLAB_API_KEY, TEST_MODE, MOCK_PROVIDERS (.env.example).
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fstatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import apiRoutes from './routes/api.js';
import adminRoutes from './routes/admin.js';
import testRoutes from './routes/test.js';
import './db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = Fastify({ logger: { level: 'info' }, bodyLimit: 12 * 1024 * 1024 });

await app.register(cookie);
// Generous global ceiling so save-game ZIP imports (tens of MB of images) fit; individual
// routes tighten this per-request (ASR caps at 8 MB via its own req.file limit).
await app.register(multipart, { limits: { fileSize: 300 * 1024 * 1024 } });
// SPA files: `no-cache` = the browser may keep a copy but MUST revalidate before using it
// (cheap 304s via Last-Modified). Without this, browsers heuristically cache app.js and a
// reload can silently run WEEKS-old game code after a deploy. (An already-open tab still
// runs whatever it loaded — a plain reload now always brings it current.)
await app.register(fstatic, { root: path.join(ROOT, 'web'), prefix: '/', cacheControl: false, setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') });
// Voice-profile reference clips (assets/voice_profiles/<Voice>/<lang>.mp3) — served for the
// in-game profile picker's ▶ preview. Public but non-sensitive (curated dataset excerpts);
// content changes rarely, so an hour of caching is fine.
await app.register(fstatic, { root: path.join(ROOT, 'assets', 'voice_profiles'), prefix: '/voice-profiles/', decorateReply: false, cacheControl: false, setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=3600') });

// naive per-IP rate limit on auth + generation endpoints
const buckets = new Map();
app.addHook('onRequest', async (req, reply) => {
  const sensitive = /^\/(api\/auth\/(login|signup|verify)|admin\/api\/login)/.test(req.url);
  const gen = /^\/api\/(worlds\/[^/]+\/(ticks|populate|forge)|tts|asr|characters\/[^/]+\/outfits|locations\/[^/]+\/background)/.test(req.url);
  if (!sensitive && !gen) return;
  const k = `${req.ip}|${sensitive ? 'auth' : 'gen'}`;
  const nowMs = Date.now();
  const b = buckets.get(k) || { n: 0, reset: nowMs + 60000 };
  if (nowMs > b.reset) { b.n = 0; b.reset = nowMs + 60000; }
  b.n++; buckets.set(k, b);
  if (b.n > (sensitive ? 15 : 40)) {
    reply.code(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many requests — give it a minute.' } });
  }
});

app.setErrorHandler((err, req, reply) => {
  const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  if (status >= 500) app.log.error(err);
  reply.code(status).send({ error: { code: err.code || 'INTERNAL', message: status >= 500 ? 'Something went wrong on our side.' : err.message } });
});

await app.register(apiRoutes);
await app.register(adminRoutes);
if (process.env.TEST_MODE === '1' && process.env.NODE_ENV !== 'production') await app.register(testRoutes);

// SPA fallbacks
app.setNotFoundHandler((req, reply) => {
  if (req.url.startsWith('/api') || req.url.startsWith('/admin/api')) {
    return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'No such endpoint.' } });
  }
  reply.type('text/html').sendFile(req.url.startsWith('/admin') ? 'admin.html' : 'index.html');
});

const port = Number(process.env.PORT || 8890);
await app.listen({ port, host: '0.0.0.0' });
console.log(`Vivarium listening on :${port}  (TEST_MODE=${process.env.TEST_MODE || '0'}, MOCK_PROVIDERS=${process.env.MOCK_PROVIDERS || '0'})`);
