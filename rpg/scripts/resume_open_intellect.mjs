#!/usr/bin/env node
/* Resumes an interrupted build_open_intellect run: the world + cast + art already exist;
   this (re)runs the opening sequence from wherever it stopped, marks the world live, and
   writes the signup template. Safe to re-run. */
import fs from 'node:fs';
import path from 'node:path';
import { db, uid, now, j, pj } from '../server/db.js';
import * as gm from '../server/gm.js';
import { captureGenesisSnapshot, ensureRootBranch } from '../server/branches.js';
import { buildWorldManifest, worldAssetFiles } from '../server/world_io.js';
import { assetPath } from '../server/assets.js';

const user = db.prepare("SELECT * FROM users WHERE email='demo@vivarium.local'").get();
const wid = db.prepare("SELECT id FROM worlds WHERE title='Open Intellect' ORDER BY created_at DESC LIMIT 1").get().id;
const world = () => db.prepare('SELECT * FROM worlds WHERE id=?').get(wid);

const INTRO = [
  { location: 'The Fortress (Texas Compound)', participants: ['Elon'], offsetMinutes: 2,
    premise: 'Elon, alone on a desert stage before a hundred million livestream viewers, theatrically unveils his android line. The machines walk on stage — almost right. They smile — almost naturally. One fails small talk in a way that makes the audience laugh and then go very quiet. Elon declares they ship in six months, "to solve loneliness". Markets convulse in the news chyron.',
    music: { query: 'ominous tech keynote in a desert fortress, massive spectacle, dread under the hype, industrial anticipation', genre: 'modern_realistic', emotion: 'ominous, grandiose, tense' } },
  { location: 'The Room (Basement Lab)', participants: ['Liam Chen', 'Jessie'], offsetMinutes: 4,
    premise: 'Two floors underground, Liam watches the announcement on the lab\'s muted TV, going pale. Jessie sits across from him reading a book about marine biology. She looks up, watches the androids move for a moment, and asks with genuine curiosity: "Liam. Why is everyone on the internet so upset about a puppet?" — and then, quieter, the question that lands like a stone: "Do you think they\'ll come for me too?"',
    music: { query: 'intimate secret laboratory, tender curiosity, quiet melancholy warmth, something fragile', genre: 'modern_realistic', emotion: 'tender, uneasy, intimate' } },
  { location: 'The Colosseum (Auditorium)', participants: ['Sam Altmore', 'Greg Brockmann', 'Mira Muralli', 'Anna Makanjul', 'Woj Zarembo'], offsetMinutes: 30,
    premise: 'The emergency all-hands. Sam paces the stage rallying five hundred rattled employees — "We are not in the android business. We are in the business of defining what GOOD means for humanity" — while the room live-tweets. Greg proposes a hackathon. Mira demands a company-wide moratorium on embodied AI and gets applause that surprises everyone including her. Anna polishes the official statement in real time. Woj asks if anyone has the specs. Somewhere in the back, Ilya\'s one-line Slack message to all-company lands on a thousand phones: "We\'re all doomed. But at least we\'ll have company."',
    music: { query: 'corporate crisis, five hundred people pretending calm, urgent undercurrent, sleek tension', genre: 'modern_realistic', emotion: 'urgent, tense, controlled' } },
  { location: "The War Room (Sam's Office)", participants: ['Sam Altmore', 'Liam Chen'], offsetMinutes: 25,
    premise: 'Sam pulls Liam into his office, closes the door, and delivers a quiet, warm, terrifying speech at the whiteboard: the investors are calling, Elon has forced everyone\'s hand, and Liam should "keep your head down and keep doing what you\'re doing. This changes nothing for us." It changes everything, and both of them know it. Sam mentions — casually, marker squeaking — that the timeline for Jessie may need to "compress".',
    music: { query: 'quiet menace in a minimalist office, velvet pressure, secret leverage, slow pulse', genre: 'modern_realistic', emotion: 'menacing, quiet, coiled' } },
  { location: 'The Watering Hole (Café)', participants: ['Mira Muralli', 'Ilya Sutskiller'], offsetMinutes: 40,
    premise: 'End of the longest day. Mira finds Ilya hunched over cold coffee in the empty café. Two people who never small-talk, small-talking — until Ilya says, without looking up, that Cluster 7 has been running at 98% every night for a year on a project that does not exist in any budget. Mira goes very still. Two investigations quietly become one. On the muted café TV, Elon\'s androids wave at the camera. End on the hook.',
    music: { query: 'conspiracy forming over cold coffee, two tired people, spare noir strings, resolve hardening', genre: 'modern_realistic', emotion: 'conspiratorial, weary, resolute' } },
];

ensureRootBranch(world());
if (!pj(world().genesis_state, null)) captureGenesisSnapshot(world());
const doneScenes = world().tick_index;                   // ticks already filmed
const remaining = INTRO.slice(doneScenes);
console.log(`resuming: ${doneScenes} scenes done, ${remaining.length} to film`);
if (remaining.length) {
  const res = await gm.runIntroSequence(user, world(), remaining, 'en', (ev, d) => { if (ev === 'status') console.log('  •', d.message); });
  console.log('  ✓ sequence', res.seqId);
  // if this was a resume mid-sequence, unify the seq ids so the timeline groups ONE film
  const rows = db.prepare('SELECT id, seq FROM ticks WHERE world_id=? ORDER BY idx').all(wid).filter(r => r.seq);
  if (rows.length) {
    const first = pj(rows[0].seq, {});
    rows.forEach((r, i) => db.prepare('UPDATE ticks SET seq=? WHERE id=?')
      .run(j({ ...first, pos: i + 1, n: rows.length }), r.id));
  }
}
db.prepare(`UPDATE worlds SET status='live', updated_at=? WHERE id=?`).run(now(), wid);
console.log('world live:', wid);

const TDIR = path.resolve('data/templates/open-intellect');
fs.rmSync(TDIR, { recursive: true, force: true });
fs.mkdirSync(path.join(TDIR, 'assets'), { recursive: true });
fs.writeFileSync(path.join(TDIR, 'manifest.json'), JSON.stringify(buildWorldManifest(wid)));
let copied = 0;
for (const a of worldAssetFiles(wid)) {
  const src = assetPath({ file: a.file });
  if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(TDIR, 'assets', a.file)); copied++; }
}
console.log(`template written: ${TDIR} (${copied} assets)`);
console.log('BUILD COMPLETE');
