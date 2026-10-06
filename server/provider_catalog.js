import { PROVIDERS, operatorKey } from './byok.js';
import { createHash } from 'node:crypto';
import { catalogByKind, classify, fetchCatalog, checkKey as checkOpenRouter, GEMINI_TTS_VOICES, OPENAI_TTS_VOICES } from './openrouter.js';
const hpCaches = new Map();
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
  const models = ((await resp.json()).data || []).map(m => ({ id: m.id, name: m.id, free: false, classification: 'model-id', voices: /gemini.*tts/.test(m.id) ? GEMINI_TTS_VOICES : /tts/.test(m.id) ? OPENAI_TTS_VOICES : [] }));
  const image = m => /image|imagen|nano-banana|flux|dall-e|stable-diffusion|recraft|ideogram/.test(m.id) && !/video/.test(m.id);
  const tts = m => /tts/.test(m.id);
  const asr = m => /whisper/.test(m.id);
  const llm = m => !image(m) && !tts(m) && !asr(m) && !/video|veo-|sora|kling|seedance|embedding|rerank|music|lyria|wan-|hunyuan-video/.test(m.id);
  const catalog = { llm: models.filter(llm), image: models.filter(image), tts: models.filter(tts), asr: models.filter(asr) };
  for (const list of Object.values(catalog)) list.sort((a,b) => Number(/3\.8-flash-tts/.test(b.id)) - Number(/3\.8-flash-tts/.test(a.id)) || a.name.localeCompare(b.name));
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
