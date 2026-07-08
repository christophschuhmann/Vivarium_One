// Accounts: scrypt password hashing, email verification (dev mailbox), sessions.
import { scryptSync, timingSafeEqual, randomBytes, randomInt } from 'node:crypto';
import { db, uid, now } from './db.js';
import { record, toMicro } from './credits.js';
import { getSetting } from './db.js';

export const mailbox = []; // dev/test outbox (no SMTP configured): {to, subject, code, at}

export function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(pw, salt, 64).toString('hex');
}
export function verifyPassword(pw, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const test = scryptSync(pw, salt, 64);
  return timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

export function sendMail(to, subject, body, code) {
  mailbox.push({ to, subject, body, code, at: now() });
  if (mailbox.length > 200) mailbox.shift();
  console.log(`[mail] to=${to} subject="${subject}" code=${code ?? '-'}`);
}

export function signup({ email, password, displayName, rating }) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpErr(400, 'INVALID_EMAIL', 'Please enter a valid email address.');
  if (!password || password.length < 8) throw httpErr(400, 'WEAK_PASSWORD', 'Password needs at least 8 characters.');
  if (!displayName || !displayName.trim()) throw httpErr(400, 'NAME_REQUIRED', 'Please tell us what to call you.');
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) throw httpErr(409, 'EMAIL_TAKEN', 'That email is already registered — try signing in.');
  const id = uid('u_');
  const pricing = getSetting('pricing');
  db.prepare(`INSERT INTO users(id,email,password_hash,display_name,role,status,credit_balance,daily_cap,rating,created_at)
              VALUES (?,?,?,?,'player','active',0,?,?,?)`)
    .run(id, email, hashPassword(password), displayName.trim(), toMicro(pricing.default_daily_cap_credits),
      rating === 'teen' ? 'teen' : 'adult', now());   // content rating: teen = PG fade-to-black prompts
  record(id, { delta: toMicro(pricing.signup_bonus_credits), reason: 'signup_bonus', createdBy: 'system' });
  issueVerification(id, email);
  return { id, email };
}

export function issueVerification(userId, email) {
  const code = String(randomInt(100000, 999999));
  db.prepare(`INSERT INTO auth_tokens(id,user_id,kind,code,expires_at) VALUES (?,?,?,?,?)`)
    .run(uid('tk_'), userId, 'verify_email', code, new Date(Date.now() + 24 * 3600e3).toISOString());
  sendMail(email, 'Your Vivarium verification code', `Welcome to Vivarium! Your code is ${code}`, code);
}

export function verifyEmail(email, code) {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').toLowerCase());
  if (!u) throw httpErr(400, 'BAD_CODE', 'That code did not match.');
  const tk = db.prepare(`SELECT * FROM auth_tokens WHERE user_id=? AND kind='verify_email' AND code=? AND used_at IS NULL AND expires_at>?`)
    .get(u.id, String(code || '').trim(), now());
  if (!tk) throw httpErr(400, 'BAD_CODE', 'That code did not match or has expired.');
  db.prepare('UPDATE auth_tokens SET used_at=? WHERE id=?').run(now(), tk.id);
  db.prepare('UPDATE users SET email_verified_at=? WHERE id=?').run(now(), u.id);
  return u;
}

export function login(email, password) {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').toLowerCase());
  if (!u || !verifyPassword(password || '', u.password_hash)) throw httpErr(401, 'BAD_LOGIN', 'Email or password did not match.');
  if (u.status !== 'active') throw httpErr(403, 'SUSPENDED', 'This account is suspended.');
  return u;
}

export const ADMIN_TTL_MS = 24 * 3600e3;   // 24h admin session — sliding (see touchAdminSession)
export function createSession(userId, realm = 'player') {
  const id = uid('s_') + randomBytes(24).toString('base64url');
  const ttl = realm === 'admin' ? ADMIN_TTL_MS : 7 * 24 * 3600e3;
  db.prepare('INSERT INTO sessions(id,user_id,realm,expires_at,created_at) VALUES (?,?,?,?,?)')
    .run(id, userId, realm, new Date(Date.now() + ttl).toISOString(), now());
  return id;
}
// Sliding renewal: push a still-valid admin session's expiry back out to the full 24h on
// every authenticated admin request, so continuous use never logs out. Returns false if the
// session is missing/expired (nothing to renew). Idle sessions still lapse after 24h.
export function touchAdminSession(token) {
  if (!token) return false;
  const s = db.prepare("SELECT id FROM sessions WHERE id=? AND realm='admin' AND expires_at>?").get(token, now());
  if (!s) return false;
  db.prepare('UPDATE sessions SET expires_at=? WHERE id=?').run(new Date(Date.now() + ADMIN_TTL_MS).toISOString(), token);
  return true;
}
export function getSession(token, realm = 'player') {
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE id=? AND realm=? AND expires_at>?').get(token, realm, now());
  if (!s) return null;
  const u = db.prepare('SELECT * FROM users WHERE id=? AND status=\'active\'').get(s.user_id);
  if (!u) return null;
  db.prepare('UPDATE users SET last_active_at=? WHERE id=?').run(now(), u.id);
  return u;
}
export function destroySession(token) { db.prepare('DELETE FROM sessions WHERE id=?').run(token); }

export function httpErr(status, code, message) {
  const e = new Error(message); e.statusCode = status; e.code = code; return e;
}

// Fastify helpers
export function requireUser(req) {
  const u = getSession(req.cookies?.vsession, 'player');
  if (!u) throw httpErr(401, 'UNAUTHENTICATED', 'Please sign in.');
  return u;
}
export function requireVerified(req) {
  const u = requireUser(req);
  if (!u.email_verified_at) throw httpErr(403, 'NOT_VERIFIED', 'Please verify your email first.');
  return u;
}
export function requireAdmin(req) {
  const u = getSession(req.cookies?.asession, 'admin');
  if (!u || u.role !== 'admin') throw httpErr(401, 'UNAUTHENTICATED', 'Admin sign-in required.');
  return u;
}
