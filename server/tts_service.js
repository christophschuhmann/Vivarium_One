// ─────────────────────────────────────────────────────────────────────────────
// TTS synthesis service — the ONE place a narration line becomes audio.
//
// Shared by two callers so caching & provider dispatch can never diverge:
//   • POST /api/tts                (live playback in the Stage)
//   • the story-bundle exporter    (server/routes/api.js /export/story/prepare)
//
// Behaviour by engine (settings.tts_provider, see server/providers.js):
//   gemini   — `voice` is a prebuilt Gemini voice name, `style` a performance
//              direction; the identity lives in the voice name.
//   laionbox — the reference clip that gets cloned is chosen LANGUAGE-AWARE
//              (a reference spoken in another language makes the model produce
//              gibberish — the reported DE-text-on-EN-reference bug):
//                1. a character's UPLOADED clip (voice_ref_asset_id) wins if set
//                   (the player accepted responsibility for its language);
//                2. otherwise the character's `voice` (a Gemini voice name)
//                   resolves to a VOICE PROFILE — a curated identity with one
//                   clean reference per language (server/voice_profiles.js) —
//                   and the clip for `lang` is used;
//                3. narrator lines resolve the same way from the narrator's
//                   chosen voice name. Nothing throws for a missing reference
//                   any more: profiles always resolve (same-gender fallback).
//
// CACHE: kind='audio' assets keyed by `<cacheVoice>|<style>|<text>` where
// cacheVoice embeds the engine + reference identity + LANGUAGE
// (`laionbox:profile:<Voice>:<lang>` or `laionbox:<refAssetId>` for uploads),
// so switching engines, languages, or re-uploading a voice never serves a
// stale clip. export_cues.cueCacheVoice() mirrors this key — keep in lockstep.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import { db, pj } from './db.js';
import { tts, getTtsProvider } from './providers.js';
import { preflight, debitCall, EST } from './credits.js';
import { saveAsset, getAsset, assetPath, findCached } from './assets.js';
import { logCall } from './telemetry.js';
import { referenceFor } from './voice_profiles.js';

const httpErr = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });

// Synthesise (or fetch from cache) one line of speech for `user`.
// Returns { assetId, cached, genMs, seconds }.
export async function synthesizeLine(user, { text, voice = 'Sulafat', style = '', characterId = null, lang = 'en', surface = 'tts' }) {
  if (!text) throw httpErr(400, 'NO_TEXT', 'Nothing to say.');
  const provider = getTtsProvider();

  // resolve the LAIONBox reference clip (language-aware; see header comment)
  let referenceB64 = null, cacheToken = null;
  if (provider === 'laionbox') {
    let speakerVoice = voice;                       // narrator default: the requested voice name
    if (characterId) {
      const c = db.prepare(`SELECT c.* FROM characters c JOIN worlds w ON w.id=c.world_id WHERE c.id=? AND w.user_id=?`).get(characterId, user.id);
      if (!c) throw httpErr(404, 'NOT_FOUND', 'Character not found.');
      if (c.voice_ref_asset_id) {
        // player-uploaded custom reference wins (language is their call)
        const refAsset = getAsset(c.voice_ref_asset_id);
        if (refAsset) { referenceB64 = fs.readFileSync(assetPath(refAsset)).toString('base64'); cacheToken = refAsset.id; }
      }
      speakerVoice = c.voice || voice;
    }
    if (!referenceB64) {
      const ref = referenceFor(speakerVoice, lang);
      referenceB64 = fs.readFileSync(ref.file).toString('base64');
      cacheToken = ref.cacheToken;                  // 'profile:<Voice>:<lang>'
    }
  }

  const cacheVoice = provider === 'laionbox' ? `laionbox:${cacheToken}` : voice;
  // FULL string, never truncated: long styles (~500 chars) once pushed the text clean out of
  // a sliced key, making ALL same-style narrator lines share one cached clip across worlds
  // (the "wrong world's audio plays" bug). SQLite TEXT is unbounded; exact match is cheap.
  const cacheKey = `${cacheVoice}|${style}|${text}`;
  const cached = findCached('audio', cacheKey);
  if (cached) return { assetId: cached.id, cached: true, genMs: 0, seconds: pj(cached.meta, {}).seconds || null };

  preflight(user.id, EST.tts());
  const t0 = Date.now();
  const res = await tts(String(text).slice(0, 600), { voice, style, referenceB64 });
  const genMs = Date.now() - t0;
  debitCall(user.id, res, 'tts');
  const a = saveAsset({ userId: user.id, kind: 'audio', prompt: cacheKey, buffer: res.buffer, mime: 'audio/mpeg', meta: { seconds: res.meter?.seconds, genMs, voice: cacheVoice, style, text } });
  logCall({ userId: user.id, kind: 'tts', surface, request: { text, voice: cacheVoice, style, provider }, response: { seconds: res.meter?.seconds }, assetId: a.id, provider: res.provider, model: res.model, rawUsd: res.rawUsd, meter: res.meter });
  return { assetId: a.id, cached: false, genMs, seconds: res.meter?.seconds ?? null };
}
