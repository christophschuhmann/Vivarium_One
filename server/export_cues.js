// ─────────────────────────────────────────────────────────────────────────────
// Story cue assembly — the SINGLE SOURCE OF TRUTH for the "film script" of a
// world's whole history, shared by every consumer so they can never drift:
//   1. GET  /api/worlds/:id/export/cues            → dev/preview endpoint
//   2. GET  /api/worlds/:id/export/story           → the story-bundle ZIP
//      (played offline by web/player.html — the shipped standalone player)
//   3. POST /api/worlds/:id/export/story/preflight → counting un-voiced lines
//   4. POST /api/worlds/:id/export/story/prepare   → generating that audio
//
// A "cue" is one beat of the film. Two kinds:
//   • transition — a title card ("Meanwhile, at the Café", "3 hours later"): no audio.
//   • line       — one narration line: narrator prose OR a character's speech/thought.
//                  These are the only cues that carry audio.
//
// The exact voice+style for each line is computed once, here, so the preflight's
// cache-hit check always matches what synthesis (server/tts_service.js) produces.
// ─────────────────────────────────────────────────────────────────────────────
import { db, pj } from './db.js';
import { visibleTicks } from './branches.js';

// Narrator delivery direction — based on the measured winner of scripts/tts_narrator_experiment.py
// (documentary/deadpan framing; see config/narrator_tts_experiment.json), hand-tuned 2026-07-04
// ("audio book" framing + explicit no-emphasis close). Kept BYTE-IDENTICAL to the client default
// in web/app.js (DEFAULT_NARRATOR_STYLE) so exported audio shares the live playback cache.
export const NARRATOR_STYLE =
  'Speak in a plain, measured, matter-of-fact audio book narrator tone — calm and pleasant but emotionally reserved, the way a documentary narrator or audiobook reader speaks. No dramatization, no character acting, no exaggerated emotional inflection, no vocal bursts of any kind (no gasping, laughing, sighing aloud). Even, steady pacing throughout. Meassured speech without any emphasis!';
export const NARRATOR_VOICE = 'Iapetus'; // best-tested calm narrator (87.5% hit-rate); see the experiment doc

const UNIT_WORDS = { s: 'second', m: 'minute', h: 'hour', d: 'day', w: 'week' };
function describeDelta(delta) {
  const m = /^\+(\d+)([smhdw])$/.exec(delta);
  if (!m) return 'Later';
  const n = +m[1];
  return `${n} ${UNIT_WORDS[m[2]]}${n === 1 ? '' : 's'} later`;
}
const fmtClock = (iso) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });

// Delivery templates — kept BYTE-IDENTICAL to web/app.js (ttsStyleFor at default prefs):
// live Stage playback and the export pipeline must build the exact same style string so
// they share one audio cache — a line the player already heard is exported for free.
//
// PROVIDER-SPECIFIC: the two engines need OPPOSITE coaching. Gemini TTS overacts by
// default → the calm/measured templates rein it in (the judged-experiment winners).
// LAIONBox is naturalistic and emotionally CLAMPED → it needs vivid, emphatic direction
// (name the emotions, ask for audible feeling) or every line comes out flat.
export const CHARACTER_STYLE_TEMPLATE = 'In character (currently feeling {mood}). Natural, conversational, believably human delivery with mild, real-feeling emotion — like a real person talking, not a stage performance.';
export const THOUGHT_SUFFIX = ' A private inner thought — half-murmured, intimate, as if speaking only to oneself.';
export const LAIONBOX_NARRATOR_STYLE = 'An engaged, expressive storyteller: warm and vivid, colouring every sentence with the scene\'s emotion — wonder sounds wondrous, tension tightens the voice, joy lifts it. Clear, articulate speech with dynamic, lively intonation and audible emotional presence throughout.';
export const LAIONBOX_CHARACTER_TEMPLATE = 'In character, feeling {mood} — and SHOWING it vividly in the voice: strong emotional expression, dynamic intonation, audible feelings (a smile you can hear, a tremble of worry, sparkling excitement), natural vocal reactions where they fit. Emotionally rich and alive, expressive enough to be truly felt.';

// The exact voice + performance direction a given line cue is voiced with. The preflight
// hashes (voice|style|text) to look the clip up in the audio cache; synthesis sends the
// identical triple. THEY MUST STAY IN LOCKSTEP — hence one function (and the client
// mirror in web/app.js ttsStyleFor, at default preferences).
export function cueVoiceStyle(cue) {
  const laion = getTtsProvider() === 'laionbox';
  if (cue.name) {
    const tpl = laion ? LAIONBOX_CHARACTER_TEMPLATE : CHARACTER_STYLE_TEMPLATE;
    const style = tpl.replace('{mood}', cue.emotion || 'calm') +
      (cue.mode === 'thought' ? THOUGHT_SUFFIX : '');
    return { voice: cue.voice || 'Sulafat', style };
  }
  // narrator line — emotion hint is a light touch for Gemini, an explicit direction for LAIONBox
  const style = laion
    ? LAIONBOX_NARRATOR_STYLE + (cue.emotion ? ` The emotional colour of this passage: ${cue.emotion} — let it be heard.` : '')
    : NARRATOR_STYLE + (cue.emotion ? ` A faint touch of ${cue.emotion}.` : '');
  return { voice: NARRATOR_VOICE, style };
}

// Cache key must match server/tts_service.js synthesizeLine EXACTLY (kind='audio',
// prompt=this key). Never truncate: a sliced key once dropped the text entirely for long
// styles, colliding every same-style line onto one clip (the cross-world stale-audio bug).
export function ttsCacheKey(voice, style, text) {
  return `${voice}|${style}|${text}`;
}

// Provider-aware "voice" component of the cache key for a cue — mirrors
// server/tts_service.js synthesizeLine EXACTLY:
//   gemini   → the prebuilt voice name from cueVoiceStyle()
//   laionbox → 'laionbox:<voice_ref_asset_id>' when the character has an uploaded custom
//              reference; otherwise 'laionbox:profile:<Voice>:<lang>' — the language-aware
//              voice-profile reference (see server/voice_profiles.js). Narrator lines
//              resolve the narrator voice's profile the same way.
import { getTtsProvider } from './providers.js';
import { referenceFor } from './voice_profiles.js';
export function cueCacheVoice(cue, lang = 'en') {
  const { voice } = cueVoiceStyle(cue);
  if (getTtsProvider() !== 'laionbox') return voice;
  if (cue.name) {
    const c = db.prepare('SELECT voice_ref_asset_id FROM characters WHERE id=?').get(cue.speaker);
    if (c?.voice_ref_asset_id) return `laionbox:${c.voice_ref_asset_id}`;
  }
  return `laionbox:${referenceFor(voice, lang).cacheToken}`;
}

// Build the full ordered cue list for a world/branch up to toIdx. Pure read; no side effects.
export function assembleCues(worldId, branchId, toIdx) {
  const world = db.prepare('SELECT * FROM worlds WHERE id=?').get(worldId);
  if (!world) return { world: null, cues: [] };
  const characters = db.prepare('SELECT id,name,voice,materialised FROM characters WHERE world_id=?').all(worldId)
    .map(c => ({ id: c.id, name: c.name, voice: c.voice, state: pj(c.materialised, {}) }));
  const locations = db.prepare('SELECT id,name,background_asset_id FROM locations WHERE world_id=?').all(worldId);
  const ticks = visibleTicks(worldId, branchId, toIdx)
    .map(t => ({ ...t, states: pj(t.states, []), narration: pj(t.narration, []) }));
  const genesisSimTime = pj(world.genesis_state, null)?.sim_time || null;

  const locById = Object.fromEntries(locations.map(l => [l.id, l]));
  const charById = Object.fromEntries(characters.map(c => [c.id, c]));
  // Sprite AT THE TIME of a tick: every tick's `states` snapshot embeds the character's
  // outfit name AND outfit list as they were in that scene — resolve from there, falling
  // back to the character's current state only for very old ticks that predate outfit
  // snapshots. (Resolving from current state was the exported-player bug: every scene
  // showed whatever the character wears TODAY, e.g. rain gear in the opening breakfast.)
  const cutoutAt = (tickState, c) => {
    const list = (tickState?.outfits?.length ? tickState.outfits : c.state?.outfits) || [];
    const want = tickState?.outfit || c.state?.outfit;
    const o = list.find(x => x.name === want) || list[0];
    return o ? `/api/assets/${o.cutout_asset_id}` : '';
  };
  const bgUrl = (loc) => loc?.background_asset_id ? `/api/assets/${loc.background_asset_id}` : '';

  const cues = [];
  let prevLoc = null;
  ticks.forEach((t, i) => {
    const loc = locById[t.pov_location_id] || locations[0] || null;
    const locChanged = prevLoc && loc && prevLoc.id !== loc.id;
    if (i === 0) {
      cues.push({ type: 'transition', kind: 'location', label: world.title, sub: `${loc?.name || ''} · ${fmtClock(genesisSimTime || t.sim_time)}`, bgUrl: bgUrl(loc), fromBgUrl: bgUrl(loc) });
    } else if (locChanged) {
      cues.push({ type: 'transition', kind: 'location', label: `Meanwhile, at ${loc.name}`, sub: `${describeDelta(t.time_delta)} · ${fmtClock(t.sim_time)}`, bgUrl: bgUrl(loc), fromBgUrl: bgUrl(prevLoc) });
    } else {
      cues.push({ type: 'transition', kind: 'time', label: describeDelta(t.time_delta), sub: fmtClock(t.sim_time), bgUrl: bgUrl(loc), fromBgUrl: bgUrl(loc) });
    }
    const presentStates = (t.states || []).filter(s => loc && s.location_id === loc.id && charById[s.character_id]);
    (t.narration || []).forEach((n) => {
      const isNarrator = n.speaker === 'narrator' || !charById[n.speaker];
      cues.push({
        type: 'line', tickIdx: t.idx, bgUrl: bgUrl(loc),
        present: presentStates.map(s => ({ id: s.character_id, name: charById[s.character_id].name, cutout: cutoutAt(s, charById[s.character_id]) })),
        speaker: isNarrator ? 'narrator' : n.speaker,
        name: isNarrator ? null : charById[n.speaker].name,
        voice: isNarrator ? null : (charById[n.speaker].voice || 'Sulafat'),
        text: n.text, mode: n.mode || 'speech', emotion: n.emotion || '',
      });
    });
    prevLoc = loc;
  });
  return { world: { title: world.title }, cues };
}
