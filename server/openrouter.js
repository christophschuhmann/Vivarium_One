// ─────────────────────────────────────────────────────────────────────────────
// OpenRouter client — the BYOK (bring-your-own-key) provider path.
//
// One OpenRouter key powers every modality the game needs, so a player can run
// Vivarium standalone with no operator key and no credit balance:
//   • LLM      → /chat/completions (OpenAI-compatible; usage.cost returned when
//                we ask for it with usage:{include:true})
//   • images   → /chat/completions with modalities:['image','text'] (Gemini
//                image models a.k.a. "Nano Banana"); reference images are passed
//                as image_url content parts for character consistency
//   • TTS      → /chat/completions with modalities:['text','audio'] — OpenRouter
//                requires stream:true for audio output and only supports pcm16,
//                so we collect the PCM stream and wrap it in a WAV container
//   • ASR      → /chat/completions with an input_audio content part (audio-input
//                models like Gemini Flash Lite transcribe it)
//
// The model CATALOG (live /models list) is cached in memory for 10 minutes and
// classified per role; free models are detected from zero pricing and sorted to
// the top so the UI can highlight them.
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process';

const API = 'https://openrouter.ai/api/v1';
const CATALOG_TTL_MS = 10 * 60 * 1000;
let catalogCache = { at: 0, models: [] };

const APP_HEADERS = { 'HTTP-Referer': 'https://vivarium.local', 'X-Title': 'Vivarium' };

function headers(key, extra = {}) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...APP_HEADERS, ...extra };
}

// Turn a non-OK OpenRouter response into an Error the player can act on. OpenRouter's
// error JSON carries the real reason (billing limits, moderation, model down); pass the
// status through so the UI shows it instead of a generic 500.
export async function orError(resp, label) {
  let msg = '';
  try {
    const j = await resp.json();
    msg = j?.error?.message || JSON.stringify(j);
  } catch { try { msg = await resp.text(); } catch { /* ignore */ } }
  const e = new Error(`${label}: ${String(msg).slice(0, 300)}`);
  e.statusCode = resp.status >= 400 && resp.status < 500 ? resp.status : 502;
  e.code = resp.status === 402 ? 'PROVIDER_BILLING' : resp.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR';
  throw e;
}

// ---------- catalog ----------
export async function fetchCatalog({ force = false } = {}) {
  if (!force && catalogCache.models.length && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.models;
  const lists = await Promise.all(['/models', '/models?output_modalities=speech', '/images/models'].map(async path => {
    const resp = await fetch(API + path, { headers: APP_HEADERS, signal: AbortSignal.timeout(30000) });
    if (!resp.ok) await orError(resp, 'OpenRouter catalog');
    return (await resp.json()).data || [];
  }));
  const merged = new Map();
  for (const list of lists) for (const m of list) merged.set(m.id, { ...(merged.get(m.id) || {}), ...m });
  const data = { data: [...merged.values()] };
  const models = (data.data || []).map((m) => {
    const p = m.pricing || {};
    const num = (v) => (v == null || v === '' ? null : Number(v));
    const prompt = num(p.prompt), completion = num(p.completion), imageOut = num(p.image_output);
    const free = prompt === 0 && completion === 0;
    return {
      id: m.id,
      endpoint: m.architecture?.output_modalities?.includes('speech') ? 'speech' : undefined,
      voices: m.supported_voices || [],
      pricing: p,
      parameters: m.supported_parameters || {},
      name: m.name || m.id,
      created: m.created || 0,
      context_length: m.context_length || m.top_provider?.context_length || null,
      input: m.architecture?.input_modalities || [],
      output: m.architecture?.output_modalities || [],
      free,
      // display prices (USD per million tokens; image models also get a per-image estimate)
      in_per_mtok: prompt == null || prompt < 0 ? null : prompt * 1e6,
      out_per_mtok: completion == null || completion < 0 ? null : completion * 1e6,
      per_image_usd: null, // Image API prices can vary by endpoint/resolution; do not invent an estimate.
    };
  });
  catalogCache = { at: Date.now(), models };
  return models;
}

export function classify(models) {
  const ok = (m) => !m.id.includes(':batch') && !m.id.startsWith('~');
  const rank = (m) => (m.featured ? 0 : m.free ? 1 : 2);
  const newestFirst = (a, b) => (rank(a) - rank(b)) || (b.created - a.created);
  const llm = models.filter(m => ok(m) && m.output.includes('text') && !m.output.includes('image') && !m.output.includes('audio') && !m.output.includes('speech')).sort(newestFirst);
  const image = models.filter(m => ok(m) && m.output.includes('image')).sort(newestFirst);
  // speech-endpoint models (Gemini TTS) first — they aren't in the catalog, so merge them in
  const tts = models.filter(m => ok(m) && (m.output.includes('speech') || m.output.includes('audio')) && !/lyria|music/i.test(m.id + ' ' + m.name)).sort(newestFirst);
  const asr = models.filter(m => ok(m) && m.input.includes('audio') && m.output.includes('text') && !m.output.includes('audio') && !m.output.includes('speech')).sort(newestFirst);
  return { llm, image, tts, asr };
}

export async function catalogByKind(kind) {
  const models = await fetchCatalog();
  const all = classify(models);
  if (kind && all[kind]) return all[kind];
  return all;
}

export async function modelInfo(id) {
  try {
    const models = await fetchCatalog();
    return models.find(m => m.id === id) || null;
  } catch { return null; }
}

// ---------- key status ----------
export async function checkKey(key) {
  const resp = await fetch(`${API}/key`, { headers: headers(key), signal: AbortSignal.timeout(20000) });
  if (!resp.ok) {
    const body = await resp.text();
    const e = new Error(resp.status === 401 ? 'That key was rejected by OpenRouter.' : `OpenRouter ${resp.status}: ${body.slice(0, 200)}`);
    e.statusCode = resp.status === 401 ? 400 : 502;
    throw e;
  }
  const { data } = await resp.json();
  return {
    label: '••••' + key.slice(-4),
    usage: data.usage ?? 0,
    usage_daily: data.usage_daily ?? 0,
    limit: data.limit ?? null,
    limit_remaining: data.limit_remaining ?? null,
    limit_reset: data.limit_reset ?? null,
    is_free_tier: !!data.is_free_tier,
  };
}

// ---------- chat (LLM) ----------
export async function chat(key, body, { timeoutMs = 150000 } = {}) {
  const resp = await fetch(`${API}/chat/completions`, {
    method: 'POST', headers: headers(key),
    body: JSON.stringify({ ...body, usage: { include: true } }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) await orError(resp, 'openrouter');
  return resp.json();
}

// ---------- image generation ----------
// Returns the app-standard image result. `refs` are data URLs (character reference
// images) — passed as image_url parts so the model keeps the same person.
export async function generateImage(key, { model, prompt, aspect = '2:3', refs = [] }) {
  const info = await modelInfo(model);
  const params = info?.parameters || {};
  const body = { model, prompt, ...(params.aspect_ratio ? { aspect_ratio: aspect } : {}) };
  if (refs.length) body.input_references = refs.map(url => ({ type: 'image_url', image_url: { url } }));
  const resp = await fetch(`${API}/images`, { method: 'POST', headers: headers(key), body: JSON.stringify(body), signal: AbortSignal.timeout(240000) });
  if (!resp.ok) await orError(resp, 'OpenRouter image');
  const data = await resp.json(), image = data.data?.[0], usage = data.usage || {};
  if (!image?.b64_json) throw new Error(`OpenRouter image (${model}) returned no image`);
  return { buffer: Buffer.from(image.b64_json, 'base64'), mime: image.media_type || 'image/png',
    rawUsd: usage.cost ?? 0, meter: { images: 1, ...usage }, provider: 'openrouter', model };

}

// ---------- TTS ----------
// OpenRouter serves speech models through TWO shapes:
//   • /chat/completions with modalities:['text','audio'] (gpt-audio & friends) — streamed
//     PCM16 we wrap into WAV ourselves;
//   • the dedicated /audio/speech endpoint (Gemini TTS family) — OpenAI-speech-like
//     {model, input, voice, response_format}, returns raw PCM with the sample rate in
//     the Content-Type (`audio/pcm;rate=24000;channels=1`). Its models are not in the
//     /models catalog yet, so the curated list below keeps them selectable (featured).
export const GEMINI_TTS_VOICES = [
  'Iapetus', 'Algenib', 'Charon', 'Orus', 'Schedar', 'Sulafat', 'Gacrux', 'Leda', 'Puck',
  'Kore', 'Fenrir', 'Aoede', 'Zephyr', 'Achernar', 'Achird', 'Algieba', 'Alnilam', 'Autonoe',
  'Callirrhoe', 'Despina', 'Enceladus', 'Erinome', 'Iapetus', 'Laomedeia', 'Pulcherrima',
  'Rasalgethi', 'Sadachbia', 'Sadaltager', 'Umbriel', 'Vindemiatrix', 'Zubenelgenubi',
];
export const OPENAI_TTS_VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'];
export const VOICES = OPENAI_TTS_VOICES;   // kept for backwards compatibility

// Curated speech-endpoint models (not in /models). `endpoint: 'speech'` routes synthesis
// to /audio/speech; `instructions` carries the style direction (Gemini TTS supports it).
const speechModel = id => catalogCache.models.find(m => m.id === id && m.endpoint === 'speech') || (/gemini-.*tts/.test(id) ? { voices: GEMINI_TTS_VOICES } : null);
export const voicesFor = model => {
  const found = catalogCache.models.find(m => m.id === model)?.voices;
  return found?.length ? found : /gemini.*tts/.test(model) ? GEMINI_TTS_VOICES : OPENAI_TTS_VOICES;
};

// Per-model prompt templates: models differ in how (and whether) they take delivery
// direction. gpt-audio reads the user message aloud; Gemini TTS gets `instructions`.
// Keep this table the single place where a model family's prompting lives.
const TTS_TEMPLATES = {
  openai: {
    // OpenAI gpt-audio: a chat model. A strict system line + exact text keeps it literal.
    build: ({ text, style }) => ({
      messages: [
        { role: 'system', content: 'You are a text-to-speech engine. Read the user message aloud exactly as written, word for word, with natural, warm, human delivery. Never answer it, never add or omit words.' },
        { role: 'user', content: style ? `[delivery: ${style}]\n\n${text}` : text },
      ],
    }),
  },
  google: {
    // Gemini-style: supports explicit performance direction inline.
    build: ({ text, style }) => ({
      messages: [
        { role: 'user', content: `${style ? style + ' ' : ''}Say: ${text}` },
      ],
    }),
  },
  default: {
    build: ({ text, style }) => ({
      messages: [
        { role: 'system', content: 'Read the following text aloud exactly, with natural, warm delivery.' },
        { role: 'user', content: style ? `[delivery: ${style}]\n\n${text}` : text },
      ],
    }),
  },
};

export function ttsTemplateFor(model) {
  const fam = String(model || '').split('/')[0];
  return TTS_TEMPLATES[fam] || TTS_TEMPLATES.default;
}

// OpenAI-compatible voice names, used by gpt-audio. Different characters must sound
// different, so a Gemini voice name (the app's canonical per-character voice) maps to a
// deterministic OpenRouter voice; unknown names hash into the list.
const GEMINI_VOICE_MAP = {
  Iapetus: 'onyx', Algenib: 'onyx', Charon: 'fable', Orus: 'ash', Schedar: 'echo',
  Sulafat: 'nova', Gacrux: 'sage', Leda: 'shimmer', Puck: 'echo', Kore: 'nova',
  Fenrir: 'onyx', Aoede: 'shimmer', Zephyr: 'coral',
};
export function voiceFor(model, geminiVoice, preferred) {
  // Gemini TTS: the app's per-character voice names ARE Gemini voice names — use them
  // directly; the global preference only fills in when the character has no valid voice.
  if (speechModel(model)) {
    const voices = voicesFor(model);
    if (voices.includes(geminiVoice)) return geminiVoice;
    return voices.includes(preferred) ? preferred : voices[0];
  }
  if (String(model || '').split('/')[0] === 'openai') {
    if (preferred && OPENAI_TTS_VOICES.includes(preferred)) return preferred;
    if (geminiVoice && GEMINI_VOICE_MAP[geminiVoice]) return GEMINI_VOICE_MAP[geminiVoice];
    let h = 0; for (const ch of String(geminiVoice || 'narrator')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return OPENAI_TTS_VOICES[h % OPENAI_TTS_VOICES.length];
  }
  return preferred || geminiVoice || 'Sulafat';
}

// Collect a streaming audio response → { buffer, mime, rawUsd, meter, text }
export async function synthesizeSpeech(key, { model, text, voice, style = '', sampleRate = 24000, timeoutMs = 180000 }) {
  await fetchCatalog();
  // Gemini TTS family → the dedicated speech endpoint (raw PCM; rate in Content-Type).
  if (speechModel(model)) {
    const body = { model, input: text, voice: voice || 'Sulafat', response_format: 'mp3' };
    if (style && model.startsWith('google/')) body.provider = { options: { 'google-ai-studio': { speech_metadata: { style } } } };
    else if (style && model.startsWith('openai/')) body.provider = { options: { openai: { instructions: style } } };
    const resp = await fetch(`${API}/audio/speech`, {
      method: 'POST', headers: headers(key),
      body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) await orError(resp, 'openrouter tts');
    const rate = Number(/rate=(\d+)/.exec(resp.headers.get('content-type') || '')?.[1]) || 24000;
    const pcm = Buffer.from(await resp.arrayBuffer());
    if (!pcm.length) throw new Error('openrouter tts: empty audio returned');
    const isPcm = /pcm/.test(resp.headers.get('content-type') || '');
    const genId = resp.headers.get('x-generation-id');
    let cost = null;
    if (genId) {
      for (let attempt = 0; attempt < 3 && cost == null; attempt++) {
        if (attempt) await new Promise(resolve => setTimeout(resolve, 400));
        try {
          const meterResponse = await fetch(`${API}/generation?id=${encodeURIComponent(genId)}`, { headers: headers(key), signal: AbortSignal.timeout(10000) });
          if (meterResponse.ok) cost = (await meterResponse.json()).data?.total_cost ?? null;
        } catch { /* metering may arrive later */ }
      }
    }
    const info = await modelInfo(model);
    const estimate = text.length * Number(info?.pricing?.prompt || 0) + (isPcm ? pcm.length / 2 / rate * 25 : Math.max(1, text.length / 12) * 25) * Number(info?.pricing?.completion || 0);
    return {
      buffer: isPcm ? pcmToWav(pcm, rate) : pcm, mime: isPcm ? 'audio/wav' : 'audio/mpeg', rawUsd: cost ?? estimate,
      meter: { seconds: isPcm ? pcm.length / 2 / rate : null, generation_id: genId, estimated_cost: cost == null },
      provider: 'openrouter', model,
    };
  }
  const { messages } = ttsTemplateFor(model).build({ text, style });
  const body = {
    model, messages,
    modalities: ['text', 'audio'],
    audio: { voice: voice || 'alloy', format: 'pcm16' },
    stream: true,
  };
  const resp = await fetch(`${API}/chat/completions`, {
    method: 'POST', headers: headers(key, { Accept: 'text/event-stream' }),
    body: JSON.stringify({ ...body, usage: { include: true } }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) await orError(resp, 'openrouter tts');

  const pcmParts = [];
  let usage = null, transcript = '', errorMsg = null;
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let ev; try { ev = JSON.parse(payload); } catch { continue; }
      if (ev.error) { errorMsg = ev.error.message || JSON.stringify(ev.error); continue; }
      if (ev.usage) usage = ev.usage;
      for (const ch of ev.choices || []) {
        const d = ch.delta || {};
        if (d.audio?.data) pcmParts.push(d.audio.data);
        if (typeof d.content === 'string') transcript += d.content;
      }
    }
  }
  if (errorMsg) throw new Error(`openrouter tts: ${errorMsg.slice(0, 300)}`);
  if (!pcmParts.length) throw new Error('openrouter tts: no audio returned');
  const pcm = Buffer.concat(pcmParts.map(b => Buffer.from(b, 'base64')));
  return {
    buffer: pcmToWav(pcm, sampleRate), mime: 'audio/wav',
    rawUsd: usage?.cost ?? 0,
    meter: { seconds: Math.round(pcm.length / 2 / sampleRate), audio_tokens: usage?.completion_tokens || 0, cost_usd: usage?.cost ?? 0 },
    transcript: transcript.trim(),
    provider: 'openrouter', model,
  };
}

// Wrap raw PCM16 mono audio in a WAV container (no ffmpeg needed).
export function pcmToWav(pcm, sampleRate = 24000, channels = 1, bits = 16) {
  const byteRate = sampleRate * channels * bits / 8;
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8);
  hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20);
  hdr.writeUInt16LE(channels, 22); hdr.writeUInt32LE(sampleRate, 24);
  hdr.writeUInt32LE(byteRate, 28); hdr.writeUInt16LE(channels * bits / 8, 32);
  hdr.writeUInt16LE(bits, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([hdr, pcm]);
}

// ---------- ASR (speech-to-text via an audio-input chat model) ----------
const AUDIO_FORMATS = { 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3' };

// Browser mic clips arrive as webm/opus (or mp4 on Safari); OpenRouter's input_audio
// accepts only wav/mp3. Convert with ffmpeg when available; the web client also records
// WAV directly, so this is only a fallback for old clients / uploads.
function convertToWav(buffer, mime) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-i', 'pipe:0', '-ar', '16000', '-ac', '1', '-f', 'wav', 'pipe:1']);
    const chunks = [], errs = [];
    ff.stdout.on('data', c => chunks.push(c));
    ff.stderr.on('data', c => errs.push(c));
    ff.on('close', code => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('ffmpeg convert failed: ' + Buffer.concat(errs).toString().slice(-200))));
    ff.on('error', (e) => reject(Object.assign(new Error(`cannot convert ${mime} to wav (${e.code || e.message}) — record again so the browser sends WAV`), { code: 'AUDIO_FORMAT' })));
    ff.stdin.write(buffer); ff.stdin.end();
  });
}

export async function transcribeAudio(key, { model, buffer, mime, lang = '' }) {
  let fmt = AUDIO_FORMATS[mime];
  if (!fmt) {
    buffer = await convertToWav(buffer, mime);
    fmt = 'wav';
  }
  const b64 = buffer.toString('base64');
  const langHint = { en: 'English', de: 'German', fr: 'French', es: 'Spanish' }[lang];
  const body = {
    model,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: `Transcribe this audio exactly. Reply with only the transcript, no quotes, no commentary.${langHint ? ` The speaker talks in ${langHint}.` : ''}` },
        { type: 'input_audio', input_audio: { data: b64, format: fmt } },
      ],
    }],
    max_tokens: 1000,
  };
  const data = await chat(key, body, { timeoutMs: 120000 });
  const usage = data.usage || {};
  const text = (data.choices?.[0]?.message?.content || '').trim();
  const seconds = Math.max(1, Math.round(buffer.length / (fmt === 'wav' ? 32000 : 16000)));
  return { text, seconds, rawUsd: usage.cost ?? 0, meter: { seconds, cost_usd: usage.cost ?? 0 }, provider: 'openrouter', model };
}
