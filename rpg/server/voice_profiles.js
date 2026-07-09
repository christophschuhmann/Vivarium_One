// ─────────────────────────────────────────────────────────────────────────────
// Voice profiles — language-aware reference clips for the LAIONBox engine.
//
// WHY: LAIONBox clones whatever reference it's given. A reference spoken in
// English makes the model produce gibberish when the line's text is German —
// so the reference must MATCH THE LANGUAGE of the text. We therefore ship a
// curated profile per Gemini voice identity with one clean reference clip per
// language (EN/DE/ES/FR) in assets/voice_profiles/<Voice>/<lang>.mp3, extracted
// from the laion/gemini-2.5-pro-tts-voice-profiles dataset and quality-selected
// by an audio-LLM judge (scripts/extract_voice_profiles.py + judge_…py --select).
//
// The catalog (config/voice_profiles.json) gives each profile a human display
// name (Ian ← Iapetus, Zoe ← Zephyr, …) plus gender/age/timbre — that text is
// what the wizard/forge LLM reads to choose a fitting voice for a character.
//
// `characters.voice` continues to store the GEMINI voice name under both
// engines (single source of truth); profiles are looked up from it. Voices
// without a profile (9 catalog voices absent from the dataset) fall back to a
// same-gender default profile. A per-character UPLOADED reference
// (voice_ref_asset_id) always overrides the profile system.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROFILE_DIR = path.join(ROOT, 'assets', 'voice_profiles');

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'voice_profiles.json'), 'utf8'));
const geminiCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'gemini_tts_voices.json'), 'utf8')).voices;

// profiles keyed by DISPLAY name (Ian, Zoe, …); index by Gemini voice name too
export const PROFILES = catalog.profiles;
const byVoice = Object.fromEntries(Object.entries(PROFILES).map(([name, p]) => [p.voice, { name, ...p }]));

// Same-gender fallbacks for Gemini voices that have no extracted profile
// (chosen for their broadly neutral, pleasant timbre).
const FALLBACK = { female: 'Leda', male: 'Iapetus' };

export const SUPPORTED_LANGS = ['en', 'de', 'es', 'fr'];

// Resolve which profile serves a given Gemini voice name (always succeeds).
export function profileForVoice(voiceName) {
  if (byVoice[voiceName]) return byVoice[voiceName];
  const gender = geminiCatalog[voiceName]?.gender === 'female' ? 'female' : 'male';
  return byVoice[FALLBACK[gender]];
}

// The reference clip for (voice, lang): absolute file path + a stable cache token.
// Falls back to the profile's English clip if the language file is missing.
export function referenceFor(voiceName, lang = 'en') {
  const p = profileForVoice(voiceName);
  const l = SUPPORTED_LANGS.includes(lang) && fs.existsSync(path.join(PROFILE_DIR, p.voice, `${lang}.mp3`)) ? lang : 'en';
  return {
    profile: p.name, voice: p.voice, lang: l,
    file: path.join(PROFILE_DIR, p.voice, `${l}.mp3`),
    cacheToken: `profile:${p.voice}:${l}`,   // part of the audio cache key — one cache slot per (identity, language)
  };
}

// One-line-per-profile summary for LLM prompts (wizard/forge voice casting).
export function profilePromptList() {
  return Object.entries(PROFILES)
    .map(([name, p]) => `${p.voice} "${name}" (${p.gender}, ${p.age} — ${p.timbre})`)
    .join('\n');
}
