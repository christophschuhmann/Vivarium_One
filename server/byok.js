// ─────────────────────────────────────────────────────────────────────────────
// Bring-Your-Own-Key (BYOK) — per-user OpenRouter credentials.
//
// Players may run the whole game on their own OpenRouter key instead of the
// operator's central key + credit ledger. This module owns:
//   • secret encryption at rest (AES-256-GCM; master secret from VIV_SECRET or a
//     random per-install secret generated once in settings.byok_secret)
//   • per-user preference normalisation (model per role + TTS voice)
//   • the request-scoped "principal" (AsyncLocalStorage) that lets ANY provider
//     call — however deep inside gm.js/wizard.js/tts_service.js — resolve to the
//     calling player's own key and model picks without threading a user object
//     through every function signature. auth.requireUser() enters the principal
//     once per request; background jobs started inside that request inherit it.
//
// SECURITY: the raw key NEVER leaves the server after saving — the API only
// returns a masked preview. Use VIV_SECRET to keep the master secret outside database backups.
// Without it, the installation secret is stored in the settings table.
// ─────────────────────────────────────────────────────────────────────────────
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getSetting, setSetting, pj } from './db.js';

// ---------- secret storage ----------
let derivedKey = null;
function masterKey() {
  if (derivedKey) return derivedKey;
  let secret = process.env.VIV_SECRET;
  if (!secret) {
    secret = getSetting('byok_secret');
    if (!secret) { secret = randomBytes(32).toString('hex'); setSetting('byok_secret', secret); }
  }
  derivedKey = scryptSync(secret, 'vivarium-byok-v1', 32);
  return derivedKey;
}

export function encryptSecret(plain) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', masterKey(), iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64url')}:${c.getAuthTag().toString('base64url')}:${ct.toString('base64url')}`;
}

export function decryptSecret(blob) {
  try {
    const [v, iv, tag, ct] = String(blob).split(':');
    if (v !== 'v1') return null;
    const d = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
  } catch { return null; }
}

export function maskKey(k) { return k ? '••••' + String(k).slice(-4) : null; }
export const ROLES = ['llm', 'image', 'tts', 'asr'];
export const PROVIDERS = {
  hyprlab: { label: 'HyprLab', base: 'https://api.hyprlab.io/v1', env: 'HYPRLAB_API_KEY', defaults: { llm: 'gemini-3.5-flash', image: 'nano-banana-2', tts: 'gemini-3.8-flash-tts', asr: 'whisper-1' } },
  openrouter: { label: 'OpenRouter', base: 'https://openrouter.ai/api/v1', env: 'OPENROUTER_API_KEY', defaults: { llm: 'meta/muse-spark-1.3-contributor', image: 'google/gemini-3.1-flash-lite-image', tts: 'google/gemini-3.8-flash-tts', asr: 'google/gemini-3.1-flash-lite' } },
};
export const FALLBACK_DEFAULTS = { ...PROVIDERS.openrouter.defaults, tts_voice: 'Sulafat' };
export function byokPolicy() { return { enabled: true, defaults: FALLBACK_DEFAULTS, ...(getSetting('byok') || {}) }; }
export function normalizePrefs(raw) {
  const p = raw && typeof raw === 'object' ? raw : {}, models = p.models || p, out = {};
  for (const role of ROLES) if (typeof models[role] === 'string' && models[role].trim()) out[role] = models[role].trim().slice(0, 160);
  if (typeof (p.tts_voice ?? p.ttsVoice) === 'string') out.tts_voice = (p.tts_voice ?? p.ttsVoice).trim().slice(0, 60);
  return out;
}
export function prefsFor(user, policy = byokPolicy()) {
  const old = normalizePrefs(pj(user?.or_prefs, {})), saved = pj(user?.provider_prefs, {}) || {};
  const roles = {}, models = {};
  const connected = Object.keys(PROVIDERS).filter(provider => userKey(user, provider));
  const defaultProvider = connected.length === 1 ? connected[0] : 'openrouter';
  for (const role of ROLES) {
    const selected = saved.roles?.[role];
    // Older preferences may still name the other provider after a key was removed.
    // One connected account powers every role; never fall back to an operator key.
    roles[role] = selected && (connected.length !== 1 || selected.provider === defaultProvider)
      ? selected : { provider: defaultProvider, model: defaultProvider === 'openrouter' ? old[role] || policy.defaults?.[role] || FALLBACK_DEFAULTS[role] : PROVIDERS.hyprlab.defaults[role] };
    models[role] = roles[role].model;
  }
  return { roles, models, tts_voice: saved.ttsVoice || old.tts_voice || 'Sulafat' };
}
export function userKey(user, provider = 'openrouter') { return decryptSecret(user?.[provider === 'hyprlab' ? 'hypr_key' : 'or_key']); }
export function operatorKey(provider) {
  if (!PROVIDERS[provider]) return null;
  const stored = getSetting('provider_credentials')?.[provider];
  return stored ? decryptSecret(stored) : process.env[PROVIDERS[provider].env] || null;
}
export function byokActive(user, policy = byokPolicy()) {
  if (!policy.enabled || !user?.or_enabled) return false;
  const prefs = prefsFor(user, policy);
  return ROLES.every(role => !!userKey(user, prefs.roles[role].provider));
}
export function resolvePersonalRoles(user, roles) {
  const connected = Object.keys(PROVIDERS).filter(provider => userKey(user, provider));
  if (connected.length !== 1) return roles;
  const provider = connected[0];
  return Object.fromEntries(Object.entries(roles).map(([role, selected]) => [role,
    selected.provider === provider ? selected : { provider, model: PROVIDERS[provider].defaults[role] }]));
}
const als = new AsyncLocalStorage();
export function principalOf(user, policy = byokPolicy()) {
  if (!user) return null;
  const active = byokActive(user, policy);
  return { id: user.id, byok: active, requestedOwn: !!(user.or_enabled && policy.enabled), key: active ? userKey(user) : null,
    keys: active ? Object.fromEntries(Object.keys(PROVIDERS).map(p => [p, userKey(user, p)])) : {}, prefs: prefsFor(user, policy) };
}
export function enterPrincipal(user, policy) { const p = principalOf(user, policy); als.enterWith(p); return p; }
export function withPrincipal(user, fn, policy) { return als.run(principalOf(user, policy), fn); }
export function isolatedRequest(done) { als.run(null, done); }
export function currentPrincipal() { return als.getStore() || null; }
