#!/usr/bin/env node
/* Pre-generate intro TTS by driving the RUNNING server's /api/tts endpoint (one small request
   per line) instead of generating in-process — the standalone generator OOMs on this
   memory-starved host, but the long-lived server handles this exact load for live playback.
   This driver only does fetch + DB pointer writes (no audio buffers held), so it stays tiny.

   Run: node --env-file=.env scripts/pregen_via_http.mjs <worldId> <email> <password> [langs] */
import { db, j, pj } from '../server/db.js';
import { cueVoiceStyle } from '../server/export_cues.js';

const [wid, email, password, langsArg] = process.argv.slice(2);
const langs = (langsArg || 'en,de,fr,es').split(',');
const BASE = 'http://127.0.0.1:8890';

// login → session cookie
const lr = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
const cookie = (lr.headers.get('set-cookie') || '').split(';')[0];
if (!cookie) throw new Error('login failed');

const chars = Object.fromEntries(db.prepare('SELECT id,name,voice FROM characters WHERE world_id=?').all(wid).map(c => [c.id, c]));
const ticks = db.prepare(`SELECT id, idx, narration FROM ticks WHERE world_id=? AND seq IS NOT NULL ORDER BY idx`).all(wid);
let made = 0, reused = 0, fail = 0;

for (const t of ticks) {
  const narr = pj(t.narration, []);
  for (const n of narr) {
    if (!n.text) continue;
    const ch = n.speaker !== 'narrator' ? chars[n.speaker] : null;
    const cue = ch ? { name: ch.name, voice: ch.voice, speaker: ch.id, emotion: n.emotion || '', mode: n.mode || 'speech' }
                   : { name: null, emotion: n.emotion || '', mode: 'speech' };
    const { voice, style } = cueVoiceStyle(cue);
    n.audio = n.audio || {};
    for (const lang of langs) {
      if (n.audio[lang]) { reused++; continue; }
      const text = lang === 'en' ? n.text : (n.i18n?.[lang] || n.text);
      let ok = false;
      for (let a = 0; a < 4 && !ok; a++) {
        try {
          const r = await fetch(`${BASE}/api/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ text, voice, style, characterId: ch?.id || null, lang }) });
          const d = await r.json();
          if (!r.ok || !d.assetId) throw new Error(d.error?.message || 'no assetId');
          n.audio[lang] = d.assetId;
          db.prepare('UPDATE assets SET world_id=? WHERE id=? AND world_id IS NULL').run(wid, d.assetId);
          d.cached ? reused++ : made++;
          ok = true;
        } catch (e) { if (a === 3) { fail++; console.error(`  ✗ s${t.idx} ${lang}: ${e.message.slice(0, 60)}`); } else await new Promise(res => setTimeout(res, 1200)); }
      }
      db.prepare('UPDATE ticks SET narration=? WHERE id=?').run(j(narr), t.id);   // crash-safe per line
    }
  }
  console.log(`  ✓ scene ${t.idx} (${narr.filter(x => x.text).length} lines)`);
}
console.log(`PREGEN DONE — ${made} generated, ${reused} reused, ${fail} failed`);
