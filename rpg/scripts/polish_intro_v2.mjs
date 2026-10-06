#!/usr/bin/env node
/* Intro polish round 2:
   1. Valentine's sprite regenerated — NO accessories (no earrings/rings/necklaces/clutch),
      face subtly more playful & flirty.
   2. Scene 2 (the boardroom) rewritten hotter: interruptions, personal jabs, a resignation
      threat, a colder concession — stakes up.
   Applied to the template world, re-exported, user's copy replaced. */
import fs from 'node:fs';
import path from 'node:path';
import { db, uid, now, j, pj } from '../server/db.js';
import * as gm from '../server/gm.js';
import { buildWorldManifest, worldAssetFiles, importWorldManifest } from '../server/world_io.js';
import { assetPath } from '../server/assets.js';

const user = db.prepare("SELECT * FROM users WHERE email='demo@vivarium.local'").get();
const wid = 'w_ocdb1tauG8W-';
const world = () => db.prepare('SELECT * FROM worlds WHERE id=?').get(wid);
const C = {}; for (const r of db.prepare('SELECT id,name FROM characters WHERE world_id=?').all(wid)) C[r.name] = r.id;
const L = {}; for (const r of db.prepare('SELECT id,name FROM locations WHERE world_id=?').all(wid)) L[r.name] = r.id;

// ── 1. Valentine: playful-flirty, zero accessories ──────────────────────────
{
  const vid = C['Valentine'];
  const row = db.prepare('SELECT base_profile FROM characters WHERE id=?').get(vid);
  const base = pj(row.base_profile, {});
  base.appearance = 'a breathtakingly beautiful young woman engineered past perfection: long platinum-white hair with a soft wave, luminous violet-blue eyes with a playful sparkle, flawless golden skin, a subtly flirty half-smile — teasing, warm, knowing — head tilted a touch; absolutely NO jewelry, NO earrings, NO rings, NO necklace, NO accessories, empty hands';
  base.outfit = 'a sleek off-shoulder white cocktail dress with a subtle circuit-line shimmer, bare arms and neckline completely free of jewelry, no accessories, empty hands';
  db.prepare('UPDATE characters SET base_profile=? WHERE id=?').run(j(base), vid);
  console.log('regenerating Valentine (playful, no accessories)…');
  const { portrait, cutout } = await gm.generatePortrait(user, world(), { name: 'Valentine', appearance: base.appearance, outfit: base.outfit, ownerRef: vid });
  const st = pj(db.prepare('SELECT materialised FROM characters WHERE id=?').get(vid).materialised, {});
  st.outfits = [{ name: 'everyday', cutout_asset_id: cutout.id, portrait_asset_id: portrait.id }];
  db.prepare('UPDATE characters SET materialised=?, reference_asset_id=? WHERE id=?').run(j(st), portrait.id, vid);
  // scene-1's stored states embed her old outfit list — refresh the snapshot so the film
  // and timeline thumbnails show the new sprite
  for (const t of db.prepare('SELECT id, states FROM ticks WHERE world_id=?').all(wid)) {
    const states = pj(t.states, []);
    const s = states.find(x => x.character_id === vid);
    if (s) { s.outfits = st.outfits; db.prepare('UPDATE ticks SET states=? WHERE id=?').run(j(states), t.id); }
  }
  console.log('  ✓ Valentine sprite v2 (tick snapshots refreshed)');
}

// ── 2. Scene 2, hotter ───────────────────────────────────────────────────────
const nline = (text, emotion = 'tense') => ({ speaker: 'narrator', text, emotion, mode: 'speech' });
const say = (who, text, emotion, mode = 'speech') => ({ speaker: C[who], text, emotion, mode });
const narration2 = [
  nline('Forty minutes later. The Tribunal. Six leaders, one glass wall — and on the giant screen, muted, Valentine waves at a hundred million people on loop.', 'urgent'),
  say('Anna Makanjul', 'Ninety minutes. That\'s when our top three investors get on a joint call — a JOINT call, they\'ve never done that — and two board members are already in the elevator, uninvited. If this room doesn\'t produce a position, we don\'t report the story anymore. We ARE the story.', 'sharp'),
  say('Greg Brockmann', 'Okay, okay — deep breaths, people, we\'ve weathered worse! Remember the—', 'strained'),
  say('Woj Zarembo', 'Gait was real. Banter was real. No teleprompter. She\'s three years ahead of my estimate and I don\'t make three-year errors.', 'flat'),
  nline('The sentence lands like a dropped server rack. Greg\'s pep talk dies mid-word. Nobody in this company has ever heard Woj be impressed before, and everyone understands at once what it costs.', 'ominous'),
  say('Sam Altmore', 'Then it\'s decided for us. We build. Companion androids, our stack, our values, greenlit TODAY — or in six months we\'re a research blog with a foundation-model museum attached. He just shipped the future with a smirk on it. You want to write him a strongly worded letter?', 'aggressive'),
  say('Mira Muralli', 'Say it plainly, Sam. Out loud. You want to out-Elon Elon.', 'icy'),
  say('Sam Altmore', 'I want to out-SURVIVE him, Mira—', 'heated'),
  say('Mira Muralli', 'Five years. Five years I have put my name under this company\'s safety statements. Look at that screen — a machine engineered to be WANTED, that is the product — and tell me to my face: was anything I signed ever true, or was I the disclaimer you kept in a drawer?', 'quiet-fury'),
  nline('The room goes very still. Sam holds her stare and, for one half-second too long, does not answer. Anna\'s pen stops moving.', 'charged'),
  say('Ilya Sutskiller', 'I will say what nobody wants said.', 'grave'),
  nline('Ilya stands up. In seven years, no one has seen Ilya stand up in a meeting.', 'ominous'),
  say('Ilya Sutskiller', 'Nobody falls in love with a factory arm. That is the entire safety case, and it fits in one sentence. Give it a face and we are not building tools anymore — we are building the thing that replaces us, and selling it with financing options. The day this company ships a product with a face, I resign. Publicly. That is not a threat. It is a fact about the future, and I am the person here who is never wrong about those.', 'devastating'),
  say('Anna Makanjul', 'And I would have to spin that resignation within the hour, so let\'s all consider the optics part of the safety case now. Sam — "the adults in the room" is the only narrative Elon cannot buy. Restraint I can sell. A knock-off Valentine buries us.', 'strategic'),
  say('Greg Brockmann', 'Sam... man, I\'d follow you off a cliff and you know it. I just — maybe not into this one. Maybe.', 'anguished'),
  nline('Sam looks around the table and does the arithmetic a half-second before anyone says it out loud. He calls the vote anyway. Out loud. Name by name. He has never once avoided a scoreboard.', 'tense'),
  nline('Humanoid companion androids: Sam — yes. Greg — a long pause, eyes on the table, and a hand that rises anyway, shaking. Mira — no. Ilya — no. Anna — no. Woj, without looking up from Valentine\'s gait footage — no. Four to two. The motion dies on the table.', 'grave'),
  say('Sam Altmore', 'Congratulations. You\'ve just voted to lose.', 'cold'),
  nline('Three seconds of silence. Then the mask comes back on, seamless as a keynote.', 'chilling'),
  say('Sam Altmore', 'And I will defend this decision to the press with a straight spine, because that is my job: we are the ones who said no. Anna — the statement\'s yours. Meeting adjourned.', 'gracious'),
  say('Sam Altmore', 'Four to two. Adorable. If they knew the vote came fourteen months too late, they\'d need a different word than no.', 'cold', 'thought'),
  nline('The room empties into ringing phones. Only the whiteboard notices that Sam, on his way out, is already typing a one-word message to a junior engineer nobody at that table could pick out of a lineup: "Elevator. Now."', 'ominous'),
];
{
  const t2 = db.prepare('SELECT id FROM ticks WHERE world_id=? AND idx=2').get(wid);
  db.prepare('UPDATE ticks SET narration=?, summary=? WHERE id=?').run(j(narration2),
    "Code red in the Tribunal: Woj confirms Valentine is real, Sam demands a rival program TODAY, Mira asks him to his face if her five years of safety statements were ever true, Ilya stands up for the first time in seven years and promises to resign publicly the day a face ships — and the board votes Sam down, 4-2. 'Congratulations. You've just voted to lose.'",
    t2.id);
  console.log('  ✓ scene 2 rewritten (heated)');
}

// ── 3. re-export + replace the user's copy ──────────────────────────────────
const TDIR = path.resolve('data/templates/open-intellect');
fs.rmSync(TDIR, { recursive: true, force: true });
fs.mkdirSync(path.join(TDIR, 'assets'), { recursive: true });
fs.writeFileSync(path.join(TDIR, 'manifest.json'), JSON.stringify(buildWorldManifest(wid)));
let n = 0;
for (const a of worldAssetFiles(wid)) { const s = assetPath({ file: a.file }); if (fs.existsSync(s)) { fs.copyFileSync(s, path.join(TDIR, 'assets', a.file)); n++; } }
console.log(`template re-exported (${n} assets)`);
const oldCopy = db.prepare("SELECT id FROM worlds WHERE user_id='u_N0lO3rkU_3Xk' AND title='Open Intellect'").get();
if (oldCopy) {
  for (const t of ['relationships', 'paths', 'state_patches', 'memory_chunks', 'branches', 'facts', 'ticks', 'locations', 'characters']) db.prepare(`DELETE FROM ${t} WHERE world_id=?`).run(oldCopy.id);
  db.prepare('DELETE FROM worlds WHERE id=?').run(oldCopy.id);
}
const res = importWorldManifest({ id: 'u_N0lO3rkU_3Xk' }, pj(fs.readFileSync(path.join(TDIR, 'manifest.json'), 'utf8'), null), path.join(TDIR, 'assets'));
console.log('user copy replaced:', JSON.stringify(res));
console.log('POLISH COMPLETE');
