import { PROVIDERS, operatorKey } from './byok.js';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { catalogByKind, classify, fetchCatalog, checkKey as checkOpenRouter, GEMINI_TTS_VOICES, OPENAI_TTS_VOICES } from './openrouter.js';
const hpCaches = new Map();
const hpSnapshot = JSON.parse(fs.readFileSync(new URL('../config/hyprlab_models.json', import.meta.url), 'utf8'));
const hpKinds = new Map(hpSnapshot.models.map(model => [model.id, model]));
export function classifyHyprlab(models) {
  const catalog = { llm: [], image: [], tts: [], asr: [] };
  for (const raw of models) {
    const known = hpKinds.get(raw.id);
    // The provider's /models response has no modalities. Use its dashboard's explicit
    // endpoint categories instead of treating every unrecognized name as a chat model.
    const role = known?.role;
    if (!role || !catalog[role]) continue;
    const id = raw.id;
    catalog[role].push({ id, name: raw.name || id, provider: raw.owned_by || known.provider,
      free: id.startsWith('free:'), classification: 'hyprlab-dashboard',
      voices: role === 'tts' ? /gemini/.test(id) ? GEMINI_TTS_VOICES : /eleven/.test(id) ? [] : OPENAI_TTS_VOICES : [],
      ...(id === 'gemini-3.8-flash-tts' || id === 'gemini-3.8-flash-lite-tts' ? { in_per_mtok: 0.25, out_per_mtok: /lite/.test(id) ? 3 : 4.5 } : {}),
      ...(id === 'nano-banana-2-lite' ? { per_image: 0.0168 } : {}) });
  }
  for (const list of Object.values(catalog)) list.sort((a,b) => Number(b.id === 'gemini-3.8-flash-tts') - Number(a.id === 'gemini-3.8-flash-tts') || a.name.localeCompare(b.name));
  return catalog;
}
export async function checkProviderKey(provider, key) {
  if (!key || !PROVIDERS[provider]) throw Object.assign(new Error('API-Schlüssel fehlt.'), { statusCode: 400 });
  if (provider === 'openrouter') return checkOpenRouter(key);
  const resp = await fetch(PROVIDERS.hyprlab.base + '/models', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
  if (!resp.ok) throw Object.assign(new Error(`HyprLab hat den Schlüssel abgelehnt (${resp.status}).`), { statusCode: resp.status === 401 || resp.status === 403 ? 400 : 502 });
  return { models: (await resp.json()).data?.length || 0 };
}
export async function providerCatalog(provider, key = operatorKey(provider), { force = false } = {}) {
  if (provider === 'openrouter') return classify(await fetchCatalog({force}));
  if (provider !== 'hyprlab') throw Object.assign(new Error('Unbekannter Anbieter.'), { statusCode: 400 });
  if (!key) throw Object.assign(new Error('Bitte zuerst einen HyprLab-Schlüssel hinterlegen.'), { statusCode: 400 });
  const cacheId = createHash('sha256').update(key).digest('hex');
  const hpCache = hpCaches.get(cacheId);
  if (!force && hpCache && Date.now() - hpCache.at < 600000) return hpCache.catalog;
  const resp = await fetch(PROVIDERS.hyprlab.base + '/models', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30000) });
  if (!resp.ok) throw Object.assign(new Error(`HyprLab-Katalog nicht verfügbar (${resp.status}).`), { statusCode: 502 });
  const catalog = classifyHyprlab((await resp.json()).data || []);
  if (hpCaches.size > 100) hpCaches.delete(hpCaches.keys().next().value);
  hpCaches.set(cacheId, { at: Date.now(), catalog }); return catalog;
}
export async function validateRoles(roles, getKey, previous = {}) {
  const catalogs = new Map();
  for (const [role, config] of Object.entries(roles)) {
    if (!['llm','image','tts','asr'].includes(role) || !PROVIDERS[config?.provider] || typeof config.model !== 'string') throw Object.assign(new Error('Ungültige Modellkonfiguration.'), { statusCode: 400 });
    if (previous[role]?.provider === config.provider && previous[role]?.model === config.model) continue;
    if (!catalogs.has(config.provider)) catalogs.set(config.provider, await providerCatalog(config.provider, getKey(config.provider)));
    if (!catalogs.get(config.provider)[role].some(m => m.id === config.model)) throw Object.assign(new Error(`${config.model} ist für ${role} nicht im ${PROVIDERS[config.provider].label}-Katalog verfügbar.`), { statusCode: 400 });
  }
}
