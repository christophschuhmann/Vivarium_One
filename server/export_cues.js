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

// Character delivery template + thought suffix — kept BYTE-IDENTICAL to web/app.js
// (DEFAULT_CHARACTER_STYLE / THOUGHT_SUFFIX / ttsStyleFor): live Stage playback and the
// export pipeline must build the exact same style string so they share one audio cache —
// a line the player already heard is exported for free, never re-billed.
export const CHARACTER_STYLE_TEMPLATE = 'In character (currently feeling {mood}). Natural, conversational, believably human delivery with mild, real-feeling emotion — like a real person talking, not a stage performance.';
export const THOUGHT_SUFFIX = ' A private inner thought — half-murmured, intimate, as if speaking only to oneself.';

// The exact voice + performance direction a given line cue is voiced with. The preflight
// hashes (voice|style|text) to look the clip up in the audio cache; synthesis sends the
// identical triple. THEY MUST STAY IN LOCKSTEP — hence one function (and the client
// mirror in web/app.js ttsStyleFor, at default preferences).
export function cueVoiceStyle(cue) {
  if (cue.name) {
    const style = CHARACTER_STYLE_TEMPLATE.replace('{mood}', cue.emotion || 'calm') +
      (cue.mode === 'thought' ? THOUGHT_SUFFIX : '');
    return { voice: cue.voice || 'Sulafat', style };
  }
  // narrator line
  const style = NARRATOR_STYLE + (cue.emotion ? ` A faint touch of ${cue.emotion}.` : '');
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
  const cutoutUrl = (c) => {
    const st = c.state || {};
    const o = (st.outfits || []).find(x => x.name === st.outfit) || (st.outfits || [])[0];
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
    const present = (t.states || []).filter(s => loc && s.location_id === loc.id).map(s => s.character_id).filter(id => charById[id]);
    (t.narration || []).forEach((n) => {
      const isNarrator = n.speaker === 'narrator' || !charById[n.speaker];
      cues.push({
        type: 'line', tickIdx: t.idx, bgUrl: bgUrl(loc),
        present: present.map(id => ({ id, name: charById[id].name, cutout: cutoutUrl(charById[id]) })),
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
