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
import { tts, getTtsProvider, hostedTtsCacheVoice } from './providers.js';
import { preflight, debitCall, EST } from './credits.js';
import { saveAsset, getAsset, assetPath, findCached } from './assets.js';
import { logCall } from './telemetry.js';
import { referenceFor } from './voice_profiles.js';
import { currentPrincipal } from './byok.js';
import { voiceFor } from './openrouter.js';

const httpErr = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });

// ── Engine-tolerant audio reuse ──────────────────────────────────────────────
// Every generated clip is kept forever (assets are never auto-deleted), but the
// exact cache key embeds the ENGINE identity (`Leda` vs `laionbox:profile:Leda:de`
// vs `laionbox:<uploadId>`) and the style template, both of which change when the
// admin switches TTS providers. That once made replays REGENERATE lines that were
// already voiced under the other engine (the reported bug).
//
// This lookup runs after an exact-key miss: find ANY existing clip of the SAME
// TEXT spoken by one of this speaker's known identities across engines/languages.
// The candidate set is built from the speaker's CURRENT voice, so deliberately
// recasting a character still regenerates (candidates change with the voice),
// while provider flips and style-template evolution reuse the stored audio.
export function completeAudio(asset, text) {
  return !!asset && fs.existsSync(assetPath(asset)) && (String(text).length <= 600 || pj(asset.meta, {}).spokenCharacters === String(text).length);
}

export function findReusableAudio({ text, voice, characterId = null }) {
  // Attached clips remain playable, but new requests obey the selected model and user.
  const p = currentPrincipal();
  if (!p?.id || getTtsProvider() === 'laionbox') return null;
  const token = hostedTtsCacheVoice(voice);
  return db.prepare("SELECT * FROM assets WHERE user_id=? AND kind='audio' AND json_extract(meta,'$.text')=? AND json_extract(meta,'$.voice')=? ORDER BY created_at DESC LIMIT 10").all(p.id, String(text), token).find(a=>completeAudio(a,text)) || null;
}

// Synthesise (or fetch from cache) one line of speech for `user`.
// Returns { assetId, cached, genMs, seconds }.
export async function synthesizeLine(user, { text, voice = 'Sulafat', style = '', characterId = null, lang = 'en', surface = 'tts', regenerate = false }) {
  if (typeof text !== 'string' || !text.trim()) throw httpErr(400, 'NO_TEXT', 'Nothing to say.');
  if (text.length > 12000) throw httpErr(400, 'TEXT_TOO_LONG', 'Split speech into passages of at most 12,000 characters. No text was truncated.');
  const provider = getTtsProvider();
  // BYOK: the player's own OpenRouter key + chosen TTS model/voice (server/byok.js).
  // No reference clips are involved — the voice is the model's, mapped deterministically
  // from the character's canonical (Gemini) voice so the cast stays distinguishable.
  const principal = currentPrincipal();
  const byok = !!(principal?.byok && principal.prefs?.models?.tts);

  // resolve the LAIONBox reference clip (language-aware; see header comment)
  let referenceB64 = null, cacheToken = null;
  if (!byok && provider === 'laionbox') {
    let speakerVoice = voice;                       // narrator default: the requested voice name
    if (characterId) {
      const c = db.prepare(`SELECT c.* FROM characters c JOIN worlds w ON w.id=c.world_id WHERE c.id=? AND w.user_id=?`).get(characterId, user.id) || db.prepare(`SELECT s.*,CASE WHEN s.gender='female' THEN 'Leda' ELSE 'Puck' END voice FROM lw_sims s JOIN worlds w ON w.id=s.world_id WHERE s.id=? AND w.user_id=?`).get(characterId,user.id);
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

  const cacheVoice = provider === 'laionbox' ? `${user.id}:laionbox:${cacheToken}` : hostedTtsCacheVoice(voice);
  // FULL string, never truncated: long styles (~500 chars) once pushed the text clean out of
  // a sliced key, making ALL same-style narrator lines share one cached clip across worlds
  // (the "wrong world's audio plays" bug). SQLite TEXT is unbounded; exact match is cheap.
  const cacheKey = `${cacheVoice}|${style}|${text}`;
  // A cache hit owned by ANOTHER user cannot be returned as-is: /api/assets/:id enforces
  // per-user ownership, so the requester would get a permanent 404 on exactly that line
  // (the "one broken line" bug — identical story copies across accounts share the global
  // text+voice+style cache). Mint the requester their own asset row + file copy instead:
  // still no regeneration cost, and ownership stays strict.
  const ownCopy = (src) => {
    if (src.user_id === user.id) return { assetId: src.id };
    const dup = saveAsset({ userId: user.id, kind: 'audio', prompt: src.prompt, buffer: fs.readFileSync(assetPath(src)), mime: src.mime, meta: pj(src.meta, {}) });
    console.log(`[tts] cross-user cache hit ${src.id} → copied as ${dup.id} for ${user.id}`);
    return { assetId: dup.id };
  };
  // SELF-HEAL: a cache row whose FILE is gone from disk (partial restore, crashed write,
  // manual cleanup) must fall through to regeneration — otherwise the dangling row keeps
  // winning the lookup forever and that line plays as silence/404 on every replay.
  const cached = !regenerate && findCached('audio', cacheKey, user.id);
  if (cached) {
    if (completeAudio(cached,text)) return { ...ownCopy(cached), cached: true, genMs: 0, seconds: pj(cached.meta, {}).seconds || null };
    console.warn(`[tts] cached audio ${cached.id} is missing or incomplete — regenerating "${String(text).slice(0, 60)}"`);
  }

  // exact miss → reuse a clip of the same line by the same speaker from another
  // engine/style era before paying for regeneration (see findReusableAudio)
  const reusable = !regenerate && findReusableAudio({ text, voice, characterId, preferUserId: user.id });
  if (reusable && fs.existsSync(assetPath(reusable))) return { ...ownCopy(reusable), cached: true, reused: true, genMs: 0, seconds: pj(reusable.meta, {}).seconds || null };

  preflight(user.id, EST.tts());
  const t0 = Date.now();
  const res = await tts(text, { voice, style, referenceB64 });
  const genMs = Date.now() - t0;
  debitCall(user.id, res, 'tts');
  const a = saveAsset({ userId: user.id, kind: 'audio', prompt: cacheKey, buffer: res.buffer, mime: res.mime || 'audio/mpeg', meta: { spokenCharacters:text.length, seconds: res.meter?.seconds, genMs, voice: cacheVoice, style, text, speaker: characterId || 'narrator', lang, provider: res.provider, model: res.model } });
  logCall({ userId: user.id, kind: 'tts', surface, request: { text, voice: cacheVoice, style, provider: res.provider }, response: { seconds: res.meter?.seconds }, assetId: a.id, provider: res.provider, model: res.model, rawUsd: res.rawUsd, meter: res.meter, meta: res.byok ? { byok: true } : undefined });
  return { assetId: a.id, cached: false, genMs, seconds: res.meter?.seconds ?? null };
}
