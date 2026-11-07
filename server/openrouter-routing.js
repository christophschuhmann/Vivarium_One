// A model's author (e.g. DeepSeek) is different from its inference host (e.g. Baseten).
// Store only this allowlisted preference, never arbitrary provider request options.
export function normalizeRouting(value) {
  if (value == null) return {};
  const fail = () => { throw Object.assign(new Error('Invalid OpenRouter hosting preferences.'), { statusCode: 400 }); };
  if (typeof value !== 'object' || Array.isArray(value)) fail();
  const { endpoint = '', sort = 'default', allowFallbacks = true } = value;
  if (typeof endpoint !== 'string' || endpoint.length > 160 || (endpoint && !/^[a-z0-9][a-z0-9._/-]*$/i.test(endpoint))) fail();
  if (!['default', 'throughput', 'latency', 'price'].includes(sort) || typeof allowFallbacks !== 'boolean') fail();
  return { endpoint, sort, allowFallbacks };
}

export function routingBody(value) {
  const { endpoint, sort, allowFallbacks } = normalizeRouting(value);
  return { ...(sort && sort !== 'default' ? { sort } : {}),
    ...(endpoint ? allowFallbacks ? { order: [endpoint], allow_fallbacks: true }
      : { only: [endpoint], allow_fallbacks: false } : {}) };
}

const caches = new Map(), pending = new Map();
export async function modelEndpoints(model, { force = false } = {}) {
  if (typeof model !== 'string' || model.length > 200 || !/^[^/\s]+\/[^\s]+$/.test(model))
    throw Object.assign(new Error('Choose an OpenRouter model first.'), { statusCode: 400 });
  const cached = caches.get(model);
  if (!force && cached && Date.now() - cached.fetchedAt < 300000) return cached;
  if (pending.has(model)) return pending.get(model);
  const request = (async () => {
    // Fixed origin; model IDs cannot supply URLs or arbitrary paths.
    const [author, ...slug] = model.split('/');
    const response = await fetch(`https://openrouter.ai/api/v1/models/${encodeURIComponent(author)}/${encodeURIComponent(slug.join('/'))}/endpoints`, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw Object.assign(new Error(`OpenRouter hosting list unavailable (${response.status}). Refresh to retry.`), { statusCode: response.status === 404 ? 400 : 502 });
    const data = (await response.json()).data;
    const metric = value => { const n = typeof value === 'object' && value ? value.p50 : value; return n != null && Number.isFinite(Number(n)) ? Number(n) : null; };
    const result = { model, fetchedAt: Date.now(), endpoints: (data?.endpoints || []).filter(e => e.tag).map(e => ({
      id: e.tag, provider: e.provider_name || e.tag.split('/')[0], name: e.name,
      available: e.status === 0, status: e.status, quantization: e.quantization,
      contextLength: e.context_length, maxCompletionTokens: e.max_completion_tokens,
      throughput: metric(e.throughput_last_30m), latency: metric(e.latency_last_30m),
      uptime: metric(e.uptime_last_30m), pricing: e.pricing || {},
    })).sort((a,b) => a.provider.localeCompare(b.provider, 'en') || a.id.localeCompare(b.id, 'en')) };
    if (caches.size >= 200) caches.delete(caches.keys().next().value);
    caches.set(model, result); return result;
  })();
  pending.set(model, request);
  try { return await request; } finally { pending.delete(model); }
}

export async function validateRouting(config) {
  if (config.openrouter == null) return;
  if (config.provider !== 'openrouter') throw Object.assign(new Error('Hosting selection requires OpenRouter.'), { statusCode: 400 });
  config.openrouter = normalizeRouting(config.openrouter);
  if (config.openrouter.endpoint) {
    const { endpoints } = await modelEndpoints(config.model);
    if (!endpoints.some(e => e.id === config.openrouter.endpoint && e.available))
      throw Object.assign(new Error('This hosting endpoint is unavailable for the selected model. Choose another host or Automatic.'), { statusCode: 400 });
  }
}
