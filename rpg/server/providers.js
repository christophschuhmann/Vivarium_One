// Model Router — the only module that talks to model providers. Injects the key,
// meters raw cost, returns results + meter. Mock mode for CI (MOCK_PROVIDERS=1).
import { db, pj, getSetting } from './db.js';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { Agent } from 'undici';

// Reasoning models (glm-5.2 with a big context) can think for MINUTES before the first
// response byte — undici's default 300 s headers timeout killed long ticks mid-flight
// (UND_ERR_HEADERS_TIMEOUT). Give provider calls a patient dispatcher.
const PATIENT = new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 });

const MOCK = process.env.MOCK_PROVIDERS === '1';
const key = (route) => {
  const k = process.env[route.key_env];
  if (!k) throw new Error(`provider key ${route.key_env} not configured`);
  return k;
};
export function route(role) {
  const r = db.prepare('SELECT * FROM model_routes WHERE role=? AND enabled=1').get(role);
  if (!r) throw new Error(`no enabled model route for role ${role}`);
  return { ...r, unit_cost: pj(r.unit_cost, {}), params: pj(r.params, {}) };
}

// ---------- LLM ----------
// The reasoning-LLM call. HyprLab exposes EVERY hosted chat model — gemini-3.5-flash,
// glm-5.2, claude-sonnet-5, … — through the same OpenAI-style /v1/chat/completions +
// Bearer endpoint (verified live for all three), so swapping models is just editing the
// `reasoning_llm` route's model string (+ unit costs) in the admin Models tab; no code
// path changes. Extraction below is defensive across providers' response quirks.
// A single LLM call may never run forever: it's capped by LLM_TIMEOUT_MS, and it also
// honours an optional external `signal` (aborted when the player reloads/leaves — see the
// /ticks route) so a generation the client walked away from stops instead of holding the
// world's tick lock. glm-5.2 legitimately takes ~2 min on the largest contexts, so the cap
// sits a little above that to catch true HANGS without killing honest slow generations.
export const LLM_TIMEOUT_MS = 150000;
export async function llmChat(messages, { maxTokens = 6000, temperature = 0.8, signal = null } = {}) {
  const r = route('reasoning_llm');
  if (MOCK) return mockLlm(messages);
  const timeout = AbortSignal.timeout(LLM_TIMEOUT_MS);
  const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let resp;
  try {
    resp = await fetch(`${r.base_url}/chat/completions`, {
      dispatcher: PATIENT, signal: abortSignal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key(r)}` },
      body: JSON.stringify({ model: r.model, messages, max_tokens: maxTokens, temperature }),
    });
  } catch (e) {
    if (timeout.aborted) throw Object.assign(new Error(`The AI model took longer than ${Math.round(LLM_TIMEOUT_MS / 1000)}s and was stopped. Try again, or switch to a faster model in the admin panel.`), { code: 'LLM_TIMEOUT', statusCode: 504 });
    if (signal?.aborted) throw Object.assign(new Error('Generation cancelled.'), { code: 'ABORTED', statusCode: 499 });
    throw e;
  }
  if (!resp.ok) throw new Error(`LLM ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0 };
  const rawUsd = (usage.prompt_tokens / 1e6) * r.unit_cost.in_per_mtok + (usage.completion_tokens / 1e6) * r.unit_cost.out_per_mtok;
  const msg = data.choices?.[0]?.message || {};
  // content may be: a plain string (usual) | an array of content blocks (Anthropic-style
  // pass-through) | empty when a reasoning model burned the whole token budget thinking.
  let content = msg.content;
  if (Array.isArray(content)) content = content.map(b => (typeof b === 'string' ? b : b.text || '')).join('');
  if ((content == null || content === '') && msg.reasoning_content) {
    throw new Error(`LLM (${r.model}) spent the whole ${maxTokens}-token budget on reasoning and returned no answer — raise maxTokens or lower reasoning effort.`);
  }
  if (content == null) throw new Error(`LLM (${r.model}) returned no content: ${JSON.stringify(data).slice(0, 200)}`);
  return { content, usage, rawUsd, provider: 'hyprlab', model: r.model };
}

export function parseJsonLoose(text) {
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  if (start > 0) t = t.slice(start);
  const end = t.lastIndexOf('}');
  if (end !== -1) t = t.slice(0, end + 1);
  return JSON.parse(t);
}

export async function llmJson(messages, opts = {}) {
  let res;
  try { res = await llmChat(messages, opts); }
  catch (e) {
    // Reasoning burn-out ("spent the whole budget on reasoning, no answer") isn't a parse
    // failure — it throws before any content exists. Retrying at the SAME cap fails
    // identically (glm-5.2 burned 14k twice on a heavy scene), so retry once at 2×.
    if (!/spent the whole/.test(e.message)) throw e;
    res = await llmChat(messages, { ...opts, maxTokens: Math.ceil((opts.maxTokens || 6000) * 2) });
  }
  try { return { ...res, json: parseJsonLoose(res.content) }; }
  catch (e) {
    // Invalid JSON is usually TRUNCATION: reasoning models spend a variable share of
    // max_tokens thinking, and a long think cuts the JSON off mid-stream. The repair
    // re-ask therefore gets a 1.5× budget — retrying with the same cap would truncate
    // identically (this exact failure killed time-skips intermittently).
    const retryOpts = { ...opts, maxTokens: Math.ceil((opts.maxTokens || 6000) * 1.5) };
    const retry = await llmChat([...messages, { role: 'assistant', content: res.content },
      { role: 'user', content: `Your previous reply was not valid JSON (${e.message}). Reply again with ONLY the corrected valid JSON object, no prose, no fences.` }], retryOpts);
    retry.rawUsd += res.rawUsd;
    retry.usage = { prompt_tokens: (res.usage.prompt_tokens || 0) + (retry.usage.prompt_tokens || 0), completion_tokens: (res.usage.completion_tokens || 0) + (retry.usage.completion_tokens || 0) };
    return { ...retry, json: parseJsonLoose(retry.content) };
  }
}

// ---------- Image ----------
export async function genImage(prompt, { aspect = '2:3', refs = [] } = {}) {
  const r = route('image');
  if (MOCK) return mockImage(aspect);
  const body = {
    model: r.model, prompt, aspect_ratio: aspect, resolution: r.params.resolution || '1K',
    google_search: false, image_search: false, response_format: 'b64_json',
  };
  if (refs.length) body.image = refs.length > 1 ? refs : refs[0];
  const resp = await fetch(`${r.base_url}/images/generations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key(r)}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`image ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  return { buffer: Buffer.from(data.data[0].b64_json, 'base64'), mime: 'image/png', rawUsd: r.unit_cost.per_image || 0.02, meter: { images: 1 }, provider: 'hyprlab', model: r.model };
}

// ---------- TTS (returns mp3 buffer) ----------
const NATURAL_DIRECTION = 'Perform this naturally and organically, like a real person speaking casually in a quiet room — mild, subtle, believable emotion; small natural pauses, breaths and micro-hesitations where a human would have them; conversational pace; never theatrical, never exaggerated.';

// Which TTS engine is live: 'gemini' (prebuilt voices, hosted) | 'laionbox' (self-hosted voice
// cloning; characters need a reference-voice clip first — see server/routes/api.js voice-ref
// endpoints). Admins flip this in the Models tab (PATCH /admin/api/tts-provider).
export function getTtsProvider() {
  return getSetting('tts_provider') === 'laionbox' ? 'laionbox' : 'gemini';
}

// ---------- TTS front door ----------
// Dispatches to the active provider. Extra options only used by LAIONBox:
//   referenceB64   — base64 reference-voice clip to clone (the character's voice_ref asset).
//                    Omitted → self-VC (LAIONBox converts its own output to itself; used for
//                    the narrator and any speaker without a stored reference).
//   speakerDesc    — DramaBox speaker description (age/gender/timbre). Only needed when there
//                    is NO reference: with a reference the identity comes from the clip and the
//                    style prompt should carry just emotion/pace/delivery.
export async function tts(text, { voice = 'Sulafat', style = '', referenceB64 = null, speakerDesc = '' } = {}) {
  if (getTtsProvider() === 'laionbox') return ttsLaionbox(text, { style, referenceB64, speakerDesc });
  return ttsGemini(text, { voice, style });
}

async function ttsGemini(text, { voice = 'Sulafat', style = '' } = {}) {
  const r = route('tts');
  if (MOCK) return mockTts();
  const prompt = `${NATURAL_DIRECTION}${style ? ' ' + style + '.' : ''} Say: ${text}`;
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    // temperature slightly below the 1.0 default for a steadier delivery. Route-param
    // tunable. (Note: the 2026-07-02 sweep showed LARGE reductions hurt — 0.3/0.6 scored
    // worse than 1.0 for narrator reliability — so keep any adjustment gentle.)
    generationConfig: { responseModalities: ['audio'], temperature: r.params.temperature ?? 0.9,
      speech_config: { voice_config: { prebuilt_voice_config: { voice_name: voice } } } },
    // Stories are adult-rated (teen accounts are constrained at the STORY level, so no
    // explicit text reaches TTS for them) — don't let the voice model's default filters
    // intermittently swallow a legitimate dark line as an empty response.
    safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT']
      .map(category => ({ category, threshold: 'BLOCK_NONE' })),
  });
  // Gemini TTS intermittently (~1% observed) answers 200 with NO audio part, and
  // occasionally 429/5xx under load. Both are transient — retry before failing the line.
  let data = null, lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(res => setTimeout(res, attempt * 800));
    const resp = await fetch(`${r.base_url}/models/${r.model}:generateContent?key=${key(r)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    });
    if (!resp.ok) {
      lastErr = new Error(`tts ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
      if (resp.status === 429 || resp.status >= 500) { console.warn(`[tts] attempt ${attempt + 1}: ${resp.status} — retrying`); continue; }
      throw lastErr;                                  // real 4xx (bad key, bad voice) — retrying won't help
    }
    const d = await resp.json();
    if (d.candidates?.[0]?.content?.parts?.find(p => p.inlineData)) { data = d; break; }
    // no audio: log WHY (finishReason / safety / an unexpected text part) so the pattern
    // behind these empties is visible in the server log, then retry
    const cand = d.candidates?.[0];
    console.warn(`[tts] attempt ${attempt + 1}: no audio in response — finishReason=${cand?.finishReason || '?'}` +
      `${d.promptFeedback ? ' promptFeedback=' + JSON.stringify(d.promptFeedback).slice(0, 120) : ''}` +
      `${cand?.content?.parts?.find(p => p.text) ? ' textPart="' + cand.content.parts.find(p => p.text).text.slice(0, 80) + '"' : ''}` +
      ` — "${String(text).slice(0, 50)}"`);
    lastErr = new Error(`tts: no audio in response (finishReason=${cand?.finishReason || 'unknown'})`);
  }
  if (!data) throw lastErr || new Error('tts: no audio in response');
  const part = data.candidates[0].content.parts.find(p => p.inlineData);
  const pcm = Buffer.from(part.inlineData.data, 'base64');
  const mp3 = await pcmToMp3(pcm);
  const um = data.usageMetadata || {};
  const rawUsd = ((um.promptTokenCount || 0) / 1e6) * r.unit_cost.in_per_mtok + ((um.candidatesTokenCount || 0) / 1e6) * r.unit_cost.out_per_mtok;
  return { buffer: mp3, mime: 'audio/mpeg', rawUsd, meter: { audio_tokens: um.candidatesTokenCount || 0, seconds: Math.round(pcm.length / 48000) }, provider: 'hyprlab', model: r.model };
}

// ---------- LAIONBox (DramaBox / LTX-2 expressive TTS + Chatterbox VC + Sidon) ----------
// Low-level client for the self-hosted server documented in laionbox-tts.txt.
// PROMPT CONVENTION (DramaBox): an ENGLISH description of speaker + delivery, with the spoken
// line(s) in DOUBLE QUOTES. Quoted text may be any of EN/DE/FR/ES — this is how the
// multilingual game path works: instructions stay English, content is in the game language.
// Output modes: raw | sidon | vc | vc_sidon. Per the product decision, all line generation runs
// 'vc_sidon' (raw → Chatterbox voice conversion toward the reference [or self-VC without one]
// → Sidon restoration), and reference-voice clips are made with 'sidon'.
export async function laionboxGenerate({ prompt, referenceB64 = null, output = 'vc_sidon', seed = null, timeoutMs = 240000 }) {
  const r = route('tts_laionbox');
  if (MOCK) return { ...mockTts(), provider: 'laionbox', model: r.model };
  const body = {
    prompt, output, return_format: 'base64',
    cfg_scale: r.params.cfg_scale ?? 2.5, stg_scale: r.params.stg_scale ?? 1.5,
    // DramaBox's automatic duration estimate runs long for our line lengths (trailing
    // silence / drawn-out delivery) — scale it down. Admin-tunable via the route params.
    duration_multiplier: r.params.duration_multiplier ?? 0.75,
  };
  if (referenceB64) body.reference_b64 = referenceB64;
  if (seed != null) body.seed = seed;
  const resp = await fetch(`${r.base_url}/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs), // single GPU, serialized — allow queueing
  });
  if (!resp.ok) throw new Error(`laionbox ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  const seconds = data.duration_sec || 0;
  // Self-hosted box → no external raw cost; the nominal internal charge comes from the
  // route's per_minute unit cost so the credit system still meters usage.
  const rawUsd = (seconds / 60) * (r.unit_cost.per_minute || 0);
  // Tail fade: LAIONBox clips carry a faint room tone that CUTS OFF hard at the end —
  // played back-to-back that produces an audible click between lines. 200 ms fade fixes it.
  const buffer = await fadeTail(Buffer.from(data.audio_base64, 'base64'));
  return {
    buffer, mime: 'audio/mpeg', rawUsd,
    meter: { seconds, output, cloned: !!referenceB64 }, provider: 'laionbox', model: r.model,
  };
}

// Fade the edges of an MP3 clip: 60 ms in, `ms` out (default 400). LAIONBox clips carry a
// REAL room tone (~-25 dB) to the very end — a short 200 ms fade of that ambience still
// reads as an abrupt cut ("click") to the ear, while Gemini's digital silence never did.
// 400 ms melts the tone away like a film dialogue edit; the 60 ms fade-in stops the tone
// popping in at chunk starts. The areverse/afade-in/areverse trick
// applies an end-fade without knowing the clip's duration up front (clips are ≤60 s, so
// the whole-file buffering that areverse implies is fine). Used on every generated line —
// abrupt clip ends (cut-off room tone) click audibly when lines play back-to-back.
export function fadeTail(mp3Buffer, ms = 400) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-f', 'mp3', '-i', 'pipe:0',
      '-af', `afade=t=in:st=0:d=0.06,areverse,afade=t=in:st=0:d=${ms / 1000},areverse`,
      '-b:a', '96k', '-f', 'mp3', 'pipe:1']);
    const chunks = [], errs = [];
    ff.stdout.on('data', c => chunks.push(c));
    ff.stderr.on('data', c => errs.push(c));
    ff.on('close', code => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('fadeTail ffmpeg failed: ' + Buffer.concat(errs).toString().slice(-200))));
    ff.on('error', reject);
    ff.stdin.write(mp3Buffer); ff.stdin.end();
  });
}

// LAIONBox line synthesis in the app's tts() shape. Builds the DramaBox prompt:
//   with reference  → "<style/emotion/pace>: \"<text>\""            (identity from the clip)
//   without         → "<speakerDesc>, <style>: \"<text>\""          (identity from words; self-VC)
// Inner double quotes in the text are swapped for typographic quotes so they can't terminate
// the quoted span the model reads.
async function ttsLaionbox(text, { style = '', referenceB64 = null, speakerDesc = '' } = {}) {
  const spoken = String(text).replace(/"/g, '”');
  const instruction = referenceB64
    ? (style || 'Natural, conversational delivery')
    : [speakerDesc, style].filter(Boolean).join(', ') || 'A pleasant adult voice, natural conversational delivery';
  const prompt = `${instruction}: "${spoken}"`;
  const output = route('tts_laionbox').params.output || 'vc_sidon';
  return laionboxGenerate({ prompt, referenceB64, output });
}

function pcmToMp3(pcm) {
  return new Promise((resolve, reject) => {
    // 200 ms end-fade baked in (same reasoning as fadeTail: hard clip ends click when
    // lines play back-to-back in the narration player)
    const ff = spawn('ffmpeg', ['-f', 's16le', '-ar', '24000', '-ac', '1', '-i', 'pipe:0',
      '-af', 'areverse,afade=t=in:st=0:d=0.2,areverse',
      '-f', 'mp3', '-b:a', '48k', 'pipe:1']);
    const chunks = [];
    ff.stdout.on('data', c => chunks.push(c));
    ff.on('close', code => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('ffmpeg failed ' + code)));
    ff.on('error', reject);
    ff.stdin.write(pcm); ff.stdin.end();
  });
}

// ---------- ASR ----------
export async function asr(buffer, mime, filename = 'audio.webm') {
  const r = route('asr');
  if (MOCK) return { text: 'mock transcription of your voice note', seconds: 3, rawUsd: 0.0002, meter: { seconds: 3 }, provider: 'hyprlab', model: r.model };
  // Defensive: strip any codecs parameter ('audio/webm;codecs=opus' → 'audio/webm') — Whisper
  // returns an empty transcription when it's present.
  const cleanMime = (mime || 'audio/webm').split(';')[0].trim() || 'audio/webm';
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: cleanMime }), filename);
  form.append('model', r.model);
  // Hard timeout so a stuck upstream request surfaces as a clean error instead of hanging.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 45000);
  let resp;
  try {
    resp = await fetch(`${r.base_url}/audio/transcriptions`, {
      method: 'POST', headers: { Authorization: `Bearer ${key(r)}` }, body: form, signal: ctl.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('asr timed out after 45s');
    throw e;
  } finally { clearTimeout(timer); }
  if (!resp.ok) throw new Error(`asr ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  const seconds = data.usage?.seconds ?? Math.ceil(data.duration ?? 1);
  return { text: data.text, seconds, rawUsd: (seconds / 60) * (r.unit_cost.per_minute || 0.0042), meter: { seconds }, provider: 'hyprlab', model: r.model };
}

// ---------- mocks (deterministic, free — used by CI) ----------
function mockLlm(messages) {
  const last = messages[messages.length - 1]?.content || '';
  let content;
  if (/archivist/i.test(messages[0]?.content || '')) {
    content = '[mock summary] ' + last.replace(/\s+/g, ' ').slice(0, Math.max(40, Math.floor(last.length / 2)));
    return { content, usage: { prompt_tokens: 50, completion_tokens: 50 }, rawUsd: 0.0005, provider: 'mock', model: 'mock-llm' };
  }
  if (/Game Master/i.test(messages[0]?.content || '') || /advance/i.test(last)) {
    content = JSON.stringify({
      characters: [
        { id: 'MOCK_CHAR_1', location_id: null, activity: 'testing the simulation', mood: 'curious', thought: 'This feels deterministic.', dialogue: 'All systems nominal.', events: [], state_patches: [] },
      ],
      relationship_updates: [], mood_tag: 'calm',
      narration: [{ speaker: 'narrator', text: 'The mock world hums along, exactly as scripted.', emotion: 'calm' }],
      summary: 'A quiet mock tick.',
    });
  } else if (/interview|Forge/i.test(messages[0]?.content || '')) {
    content = JSON.stringify({ reply: 'Lovely — tell me one fear and one dream?', ready: false, draft: { name: 'Testy', age: 25, pronouns: 'they/them', appearance: 'test appearance', personality: 'curious', goals: ['pass tests'], fears: ['flaky tests'], coping: ['retries'], backstory: 'born in CI', speaking_style: 'terse', voice: 'Sulafat', outfit: 'lab coat' } });
  } else {
    content = JSON.stringify({ ok: true, echo: last.slice(0, 60) });
  }
  return { content, usage: { prompt_tokens: 100, completion_tokens: 200 }, rawUsd: 0.001, provider: 'mock', model: 'mock-llm' };
}
function mockImage(aspect) {
  // 1x1 transparent png
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  return { buffer: png, mime: 'image/png', rawUsd: 0.0, meter: { images: 1, mock: true, aspect }, provider: 'mock', model: 'mock-image' };
}
function mockTts() {
  const mp3 = Buffer.from('SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAA', 'base64');
  return { buffer: mp3, mime: 'audio/mpeg', rawUsd: 0, meter: { seconds: 1, mock: true }, provider: 'mock', model: 'mock-tts' };
}
