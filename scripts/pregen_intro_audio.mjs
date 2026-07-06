#!/usr/bin/env node
/* Pre-generate the opening-sequence TTS for every language and bundle it with the scenario,
   so the intro never has to synthesise audio at play time (instant, free, works for every
   account after template import). Each narration line gets line.audio = {en,de,fr,es} → an
   audio asset id; those assets are world-scoped so the template export copies them per user,
   and world_io remaps the ids on import. The client plays line.audio[lang] directly.

   Run: node --env-file=.env scripts/pregen_intro_audio.mjs [worldId] [langs csv]
   e.g. node --env-file=.env scripts/pregen_intro_audio.mjs w_ocdb1tauG8W- en,de,fr,es */
import { db, j, pj } from '../server/db.js';
import { synthesizeLine } from '../server/tts_service.js';
import { cueVoiceStyle } from '../server/export_cues.js';

const wid = process.argv[2] || 'w_ocdb1tauG8W-';
const langs = (process.argv[3] || 'en,de,fr,es').split(',');
const world = db.prepare('SELECT * FROM worlds WHERE id=?').get(wid);
const user = db.prepare('SELECT * FROM users WHERE id=?').get(world.user_id);
const chars = Object.fromEntries(db.prepare('SELECT id,name,voice FROM characters WHERE world_id=?').all(wid).map(c => [c.id, c]));

const ticks = db.prepare(`SELECT id, idx, narration FROM ticks WHERE world_id=? AND seq IS NOT NULL ORDER BY idx`).all(wid);
console.log(`pre-generating audio for ${ticks.length} scenes × ${langs.length} langs`);

let made = 0, reused = 0;
for (const t of ticks) {
  const narr = pj(t.narration, []);
  for (const n of narr) {
    if (!n.text) continue;
    const ch = n.speaker !== 'narrator' ? chars[n.speaker] : null;
    // voice + style exactly as the export/playback pipeline computes them
    const cue = ch
      ? { name: ch.name, voice: ch.voice, speaker: ch.id, emotion: n.emotion || '', mode: n.mode || 'speech' }
      : { name: null, emotion: n.emotion || '', mode: 'speech' };
    const { voice, style } = cueVoiceStyle(cue);
    n.audio = n.audio || {};
    for (const lang of langs) {
      if (n.audio[lang]) { reused++; continue; }   // already have it — skip (resumable)
      const text = lang === 'en' ? n.text : (n.i18n?.[lang] || n.text);
      let done = false;
      for (let attempt = 0; attempt < 4 && !done; attempt++) {   // Gemini intermittently returns empty audio
        try {
          const r = await synthesizeLine(user, { text, voice, style, characterId: ch?.id || null, lang, surface: 'intro_pregen' });
          n.audio[lang] = r.assetId;
          db.prepare('UPDATE assets SET world_id=? WHERE id=? AND world_id IS NULL').run(wid, r.assetId);
          r.cached ? reused++ : made++;
          done = true;
        } catch (e) {
          if (attempt === 3) console.error(`  ✗ scene ${t.idx} ${lang}: ${e.message.slice(0, 80)}`);
          else await new Promise(res => setTimeout(res, 1500));
        }
      }
      db.prepare('UPDATE ticks SET narration=? WHERE id=?').run(j(narr), t.id);   // persist each line (crash-safe)
    }
  }
  db.prepare('UPDATE ticks SET narration=? WHERE id=?').run(j(narr), t.id);
  console.log(`  ✓ scene ${t.idx} (${narr.filter(x => x.text).length} lines)`);
}
console.log(`PREGEN DONE — ${made} generated, ${reused} reused from cache`);
