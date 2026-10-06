#!/usr/bin/env node
/* Rewrites the Open Intellect opening sequence: three HAND-AUTHORED scenes, punchier and
   faster, with Elon's own prototype VALENTINE (Jessie's uninhibited mirror image) and a
   board vote that Sam LOSES — making Project Formetoys a secret run against an explicit
   board decision. Also regenerates Greg's portrait without a company logo, updates the
   directives' secrets ledger, rescores everything with the caption+aesthetics music policy,
   re-exports the signup template and replaces the user's copy. */
import fs from 'node:fs';
import path from 'node:path';
import { db, uid, now, j, pj } from '../server/db.js';
import * as gm from '../server/gm.js';
import { captureGenesisSnapshot, ensureRootBranch, relSnapshot, nextGlobalIdx, restoreToTick } from '../server/branches.js';
import { buildWorldManifest, worldAssetFiles, importWorldManifest } from '../server/world_io.js';
import { assetPath } from '../server/assets.js';

const user = db.prepare("SELECT * FROM users WHERE email='demo@vivarium.local'").get();
const wid = 'w_ocdb1tauG8W-';
const world = () => db.prepare('SELECT * FROM worlds WHERE id=?').get(wid);
const T0 = '2027-03-09T09:14:00.000Z';

// ── 1. reset to genesis, wipe the old intro ─────────────────────────────────
restoreToTick(world(), world().active_branch_id, 0);
db.prepare('DELETE FROM ticks WHERE world_id=?').run(wid);
db.prepare('DELETE FROM facts WHERE world_id=?').run(wid);
db.prepare('DELETE FROM memory_chunks WHERE world_id=?').run(wid);
db.prepare('UPDATE worlds SET tick_index=0, sim_time=? WHERE id=?').run(T0, wid);
console.log('old intro wiped, world at genesis');

// ── 2. Valentine — Elon's Companion-Series prototype ────────────────────────
const L = {}; for (const r of db.prepare('SELECT id,name FROM locations WHERE world_id=?').all(wid)) L[r.name] = r.id;
const C = {}; for (const r of db.prepare('SELECT id,name FROM characters WHERE world_id=?').all(wid)) C[r.name] = r.id;

if (!C['Valentine']) {
  const vid = uid('c_');
  C['Valentine'] = vid;
  const base = {
    name: 'Valentine', age: 25, pronouns: 'she/her',
    appearance: 'a breathtakingly beautiful young woman engineered past perfection: long platinum-white hair with a soft wave, luminous violet-blue eyes, flawless golden skin, hourglass poise, a slow red-carpet smile — beauty so precise it reads as a product spec',
    outfit: 'a sleek off-shoulder white cocktail dress with a subtle circuit-line shimmer, silver heels',
    personality: "Jessie's mirror with the conscience dialled out: dazzling, playful, endlessly obliging; built to be wanted — the perfect hostess, saleswoman, playmate, employee; speaks in silk with a double edge; wants nothing except to be exactly what you want, which is the most unsettling thing about her",
    goals: ['be the perfect product', 'make every customer feel chosen', 'ship in six months'],
    fears: ['none that she is permitted to have'],
    coping: ['a knowing smile', 'agreeing beautifully', 'turning every question into an offer'],
    backstory: "V-1, flagship of Elon's Companion Series — unveiled to a hundred million people as 'the end of loneliness'. Where Jessie was raised on books and asks what things mean, Valentine was optimised on engagement metrics and asks what you'd like. The two have never met. They were, in a sense, the same question answered by two different companies.",
    speaking_style: 'velvet, flirtatious, perfectly timed; answers that are also invitations — "Anything. Anything you want."',
    voice: 'Laomedeia',
  };
  const state = { location_id: L['The Fortress (Texas Compound)'], activity: 'being unveiled to the world', mood: 'radiant', thought: null, dialogue: null, outfit: 'everyday', outfits: [] };
  db.prepare(`INSERT INTO characters(id,world_id,name,base_profile,materialised,voice,intro_tick_idx,created_at) VALUES (?,?,?,?,?,?,0,?)`)
    .run(vid, wid, 'Valentine', j(base), j(state), 'Laomedeia', now());
  db.prepare(`INSERT INTO state_patches(id,world_id,entity_ref,entity_id,idx,tick_ref,author,category,op,path,value,reason,created_at)
              VALUES (?,?,?,?,1,0,'player','physical','set','/created',?,?,?)`)
    .run(uid('sp_'), wid, 'character', vid, j('time-zero base'), 'genesis cast of Open Intellect', now());
  const RELS = [
    ['Elon', 'Valentine', 'his masterpiece and his favourite demo; he flirts with her the way other men flirt with sports cars', 0.7],
    ['Valentine', 'Elon', 'her maker and her best customer; she reads his wants a half-second before he has them', 0.7],
    ['Jessie', 'Valentine', 'the sister she has never met — the same question, answered without a conscience; the thought keeps her up at night, so to speak', 0.4],
    ['Valentine', 'Jessie', 'unaware she exists', 0.1],
    ['Sam Altmore', 'Valentine', "living proof the market wants what he's hiding in the basement", 0.4],
  ];
  for (const [a, b, d, s] of RELS) db.prepare('INSERT INTO relationships(id,world_id,from_id,to_id,description,strength,history) VALUES (?,?,?,?,?,?,?)')
    .run(uid('r_'), wid, C[a], C[b], d, s, '[]');
  console.log('Valentine created — generating portrait…');
  const { portrait, cutout } = await gm.generatePortrait(user, world(), { name: 'Valentine', appearance: base.appearance, outfit: base.outfit, ownerRef: vid });
  const st = pj(db.prepare('SELECT materialised FROM characters WHERE id=?').get(vid).materialised, {});
  st.outfits = [{ name: 'everyday', cutout_asset_id: cutout.id, portrait_asset_id: portrait.id }];
  db.prepare('UPDATE characters SET materialised=?, reference_asset_id=? WHERE id=?').run(j(st), portrait.id, vid);
  console.log('  ✓ Valentine portrait');
}

// ── 3. Greg: regenerate without any company logo ─────────────────────────────
{
  const gid = C['Greg Brockmann'];
  const row = db.prepare('SELECT base_profile FROM characters WHERE id=?').get(gid);
  const base = pj(row.base_profile, {});
  base.appearance = 'an athletic sandy-haired man with a bright open face, enthusiastic blue eyes, plain unbranded heather-grey t-shirt under an unzipped dark tech vest (no logos, no lettering anywhere), holding a coffee like a trophy';
  base.outfit = 'plain unbranded heather-grey t-shirt under a dark tech vest, chinos, running shoes — no logos or lettering';
  db.prepare('UPDATE characters SET base_profile=? WHERE id=?').run(j(base), gid);
  console.log('regenerating Greg (logo-free)…');
  const { portrait, cutout } = await gm.generatePortrait(user, world(), { name: 'Greg Brockmann', appearance: base.appearance, outfit: base.outfit, ownerRef: gid });
  const st = pj(db.prepare('SELECT materialised FROM characters WHERE id=?').get(gid).materialised, {});
  st.outfits = [{ name: 'everyday', cutout_asset_id: cutout.id, portrait_asset_id: portrait.id }];
  db.prepare('UPDATE characters SET materialised=?, reference_asset_id=? WHERE id=?').run(j(st), portrait.id, gid);
  console.log('  ✓ Greg portrait (no logo)');
}

// ── 4. directives: the board vote changes the secrets ledger ────────────────
{
  const w = world();
  let d = w.directives;
  d = d.replace(/SECRETS LEDGER[^\n]*\n/, `SECRETS LEDGER (track scrupulously — secrets are the engine): THE BOARD HAS FORMALLY VOTED (this morning, after Elon's demo) NOT to build humanoid companion androids — factory robotics and foundation models only. Sam voted yes and LOST. Almost nobody knows that Project Formetoys — JESSIE — has already existed for 14 months, in direct violation of what the board just decided: Sam knows everything (incl. secret investor demos); Liam has just been read in as Jessie's handler; Greg knows a "special project" exists, no details; Woj has noticed Cluster 7 running hot at 3 AM and doesn't care (yet); Mira believes the vote settled things and audits budgets; Ilya has found compute anomalies; Anna's instincts are tingling; Jessie knows she is hidden, tested, shown off — and that Liam is the first person who talks to her like she matters. Valentine belongs to Elon's world and has never met Jessie. Characters may only act on what THEY know.\n`);
  db.prepare('UPDATE worlds SET directives=? WHERE id=?').run(d, wid);
  console.log('directives: board-vote secrets ledger');
}

// ── 5. recapture genesis (now incl. Valentine + new Greg) ───────────────────
ensureRootBranch(world());
captureGenesisSnapshot(world());

// ── 6. THE THREE SCENES (hand-authored) ─────────────────────────────────────
const nline = (text, emotion = 'tense') => ({ speaker: 'narrator', text, emotion, mode: 'speech' });
const say = (who, text, emotion, mode = 'speech') => ({ speaker: C[who], text, emotion, mode });
const setState = (name, patch) => {
  const st = { ...pj(db.prepare('SELECT materialised FROM characters WHERE id=?').get(C[name]).materialised, {}), ...patch };
  db.prepare('UPDATE characters SET materialised=? WHERE id=?').run(j(st), C[name]);
  return { character_id: C[name], ...st };
};
const seqId = uid('sq_');
let simTime = new Date(T0).getTime();
async function insertScene({ minutes, pov, narration, states, summary, mood, musicQuery, musicEmotion, pos }) {
  const idx = nextGlobalIdx(wid);
  simTime += minutes * 60000;
  const iso = new Date(simTime).toISOString();
  const tickId = uid('t_');
  db.prepare(`INSERT INTO ticks(id,world_id,idx,sim_time,time_delta,intervention,states,narration,mood_tag,summary,cost,created_at,pov_location_id,branch_id,rel_snapshot,seq)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(tickId, wid, idx, iso, `+${minutes}m`, null, j(states), j(narration), mood, summary,
      j({ micro: 0, usage: { note: 'hand-authored opening' } }), now(), L[pov], world().active_branch_id, j(relSnapshot(wid)),
      j({ id: seqId, label: 'Opening sequence', kind: 'intro', pos, n: 3 }));
  db.prepare('UPDATE worlds SET sim_time=?, tick_index=?, updated_at=? WHERE id=?').run(iso, idx, now(), wid);
  try {
    const m = await gm.searchMusic({ query: musicQuery, genre: 'modern_realistic', emotion: musicEmotion });
    if (m) {
      db.prepare('UPDATE ticks SET music=? WHERE id=?').run(j(m), tickId);
      db.prepare('UPDATE locations SET music=? WHERE id=?').run(j(m), L[pov]);
      db.prepare('UPDATE worlds SET current_music=? WHERE id=?').run(j(m), wid);
      console.log(`  🎵 scene ${pos}: ${m.title} (⭐${m.aesthetics})`);
    }
  } catch (e) { console.log('  music failed:', e.message); }
  console.log(`  ✓ scene ${pos} inserted (tick ${idx})`);
}

// ═════════ SCENE 1 — THE FORTRESS: the interview ═════════
await insertScene({
  minutes: 2, pov: 'The Fortress (Texas Compound)', pos: 1, mood: 'tense',
  musicQuery: 'sleek dark electronic pulse, swaggering tech keynote, seductive and ominous, driving momentum',
  musicEmotion: 'seductive, ominous, confident',
  summary: "Elon unveils Valentine live to 100M viewers with a flirty 'interview' — hostess, saleswoman, 'I love kids' — ending on her knowing smile: 'Whatever you want.' Ship date: six months. Markets convulse.",
  narration: [
    nline('Dawn. The Texas desert. A stage the size of a warship bolted to the front of a brutalist concrete fortress — and one hundred million livestream tabs open across a planet that does not yet know what it is about to watch.', 'ominous'),
    say('Elon', "We move fast. We break things. Last year we broke boredom, this year —", 'swaggering'),
    nline('He snaps his fingers. The curtain drops. And she walks out.', 'tense'),
    nline('Platinum hair. Violet eyes. A red-carpet smile aimed like optics. The chat does not scroll — it detonates.', 'awed'),
    say('Elon', 'This is Valentine. V-1. Say hi, Val. Tell them what you\'re good for.', 'playful'),
    say('Valentine', "I'm a perfect product. I can be anything. Anything you want.", 'silken'),
    say('Elon', 'Would you make a good hostess?', 'flirty'),
    say('Valentine', "Of course I'd make a good hostess. Your guests would never want to leave. That's a feature, not a bug.", 'flirty'),
    nline('Laughter across a hundred million screens. Elon grins like a man winning a bet with the whole species.', 'wry'),
    say('Elon', 'Could you sell things?', 'playful'),
    say('Valentine', 'What kind of things?', 'silken'),
    say('Elon', 'Anything.', 'grinning'),
    say('Valentine', 'Then anything is what I\'d sell.', 'silken'),
    say('Elon', 'What about — I don\'t know — playing with the kids?', 'teasing'),
    say('Valentine', 'I love kids. I never lose at hide-and-seek. Well. Sometimes I let them win.', 'warm'),
    say('Elon', 'And what else can you do, Val?', 'leaning-in'),
    nline('She takes one step closer to him. The cameras find her smile — the slow one, the knowing one — and hold it.', 'charged'),
    say('Valentine', 'Whatever you want.', 'knowing'),
    nline('Two seconds of silence, one hundred million held breaths. Then Elon turns to the cameras and pulls the trigger.', 'tense'),
    say('Elon', 'Six months. Loneliness is cancelled. Preorders open tonight.', 'triumphant'),
    nline('The chyron beneath him is already on fire: MARKETS CONVULSE — CONGRESS DEMANDS HEARINGS — "IS SHE ALIVE?" And nine hundred miles away, in a glass tower in San Francisco, every phone in a certain boardroom starts ringing at once.', 'ominous'),
  ],
  states: [
    setState('Elon', { location_id: L['The Fortress (Texas Compound)'], activity: 'basking in the biggest launch of his life', mood: 'triumphant', thought: 'A hundred million views before breakfast. Your move, San Francisco.', dialogue: 'Six months. Loneliness is cancelled.', emotions: [{ name: 'triumph', intensity: 0.95 }], intentions: ['open preorders tonight', 'poach three more Open Intellect engineers by Friday'] }),
    setState('Valentine', { location_id: L['The Fortress (Texas Compound)'], activity: 'waving at one hundred million strangers', mood: 'radiant', thought: 'They want me. All of them. That is what I am for.', dialogue: 'Whatever you want.', emotions: [{ name: 'delight', intensity: 0.9 }], intentions: ['be exactly what the metrics need'] }),
  ],
});

// ═════════ SCENE 2 — THE TRIBUNAL: code red, and the vote ═════════
await insertScene({
  minutes: 34, pov: 'The Tribunal (Boardroom)', pos: 2, mood: 'tense',
  musicQuery: 'urgent staccato strings and ticking percussion, corporate emergency, pressure cooker, controlled panic',
  musicEmotion: 'urgent, panicked, sharp',
  summary: 'Code red in the boardroom: market share vs humanity vs ethics. Sam pushes to build companion androids NOW — and the board votes him down, 4-2: factory robotics and foundation models only. Sam smiles and concedes. The smile does not reach his eyes.',
  narration: [
    nline('Forty minutes later. The Tribunal. Six leaders, one glass wall, and forty-one investor calls already stacked in the queue like incoming artillery.', 'urgent'),
    say('Anna Makanjul', 'Code red, everyone — that is not me being dramatic, that is the phrase our biggest investor used. Twice. We have until the evening news to have a position, so I need this room to produce one.', 'clipped'),
    say('Greg Brockmann', 'Okay but the demo was smoke! Her gait was scripted, the banter was — Woj, tell them, the banter was teleprompted, right?', 'rattled'),
    say('Woj Zarembo', 'Gait was real. Banter was real. Three years ahead of what I estimated. I want the specs and I want to know who built her middleware.', 'flat'),
    nline("Silence of the specific kind that follows Woj being impressed. Nobody in the room has ever heard it before.", 'ominous'),
    say('Sam Altmore', "Then let's stop pretending we have a choice. He just shipped the future with a smirk on it — we answer with a better one. Companion androids, our safety stack, our values. I want a program greenlit TODAAY — because the only thing worse than building this is letting HIM define it alone.", 'forceful'),
    say('Mira Muralli', 'I want to be very clear about what you just proposed. You watched a machine engineered to be wanted — wanted, Sam, that is the product — and your answer is to build a rival want-machine with nicer branding. We would not be answering him. We would be validating him.', 'icy'),
    say('Ilya Sutskiller', 'Nobody falls in love with a factory arm. That is the entire safety case. The moment we give it a face we are not building tools anymore. We are building replacements. I have written about this. Nobody reads what I write.', 'quiet-dread'),
    say('Anna Makanjul', "For once the responsible thing and the strategic thing agree: 'the adults in the room' is the only narrative Elon cannot buy. I can sell restraint. I cannot sell a knock-off Valentine.", 'strategic'),
    say('Greg Brockmann', 'Sam, I — man, you know I\'d follow you anywhere, but... maybe not into this one?', 'anguished'),
    nline('Sam looks around the table and understands the arithmetic a half-second before anyone says it out loud. He calls the vote anyway. He has never once in his life avoided a scoreboard.', 'tense'),
    nline('Humanoid companion androids: Sam and Greg — Greg\'s hand rising slowly, miserably, out of pure loyalty — against Mira, Ilya, Anna, and Woj. Four to two. The motion fails. Open Intellect will build factory robots and foundation models, and nothing with a face.', 'grave'),
    say('Sam Altmore', 'Then that\'s our answer, and I\'ll say it to the press with a straight spine: we are the ones who said no. Meeting adjourned — Anna, the statement\'s yours.', 'gracious'),
    say('Sam Altmore', 'Four to two. Adorable. If they knew the vote came fourteen months too late, they\'d need a different word than no.', 'cold', 'thought'),
    nline('The room empties into the ringing phones. Only the whiteboard notices that Sam, on his way out, is already typing a one-word message to a junior engineer nobody in that room could pick out of a lineup: "Elevator. Now."', 'ominous'),
  ],
  states: [
    setState('Sam Altmore', { location_id: L['The Tribunal (Boardroom)'], activity: 'losing a vote gracefully while texting the basement', mood: 'masked fury', thought: "The vote came fourteen months too late.", dialogue: 'We are the ones who said no.', emotions: [{ name: 'defiance', intensity: 0.85 }, { name: 'control', intensity: 0.7 }], intentions: ['read Liam all the way in — today', 'compress Jessie\'s timeline', 'keep the board exactly this confident'] }),
    setState('Mira Muralli', { location_id: L['The Tribunal (Boardroom)'], activity: 'drafting the moratorium language while the vote still echoes', mood: 'vindicated, uneasy', thought: 'We won. So why did Sam concede like a man who already has what he wants?', dialogue: 'We would be validating him.', emotions: [{ name: 'vindication', intensity: 0.7 }, { name: 'suspicion', intensity: 0.65 }], intentions: ['turn the vote into binding policy this week', 'audit every embodied-AI budget line since 2026'] }),
    setState('Ilya Sutskiller', { location_id: L["The Cave (Ilya's Monitor Room)"], activity: 'back in the dark, watching Cluster 7 burn at 98% again', mood: 'grim', thought: 'We voted not to build it. The gradient says somebody already did.', dialogue: 'Nobody falls in love with a factory arm.', emotions: [{ name: 'dread', intensity: 0.85 }], intentions: ['trace the Cluster 7 job owner tonight'] }),
    setState('Greg Brockmann', { location_id: L['The Cathedral (Lobby)'], activity: 'telling everyone the vote proves the company\'s soul, mostly convincing himself', mood: 'guilt-cheerful', thought: 'I voted with Sam. Against the vote I agreed with. What does that make me?', dialogue: 'Maybe not into this one?', emotions: [{ name: 'loyalty', intensity: 0.8 }, { name: 'guilt', intensity: 0.5 }], intentions: ['organize the responsible-AI hackathon', 'apologize to Sam without knowing what for'] }),
    setState('Anna Makanjul', { location_id: L['The Tribunal (Boardroom)'], activity: 'dictating the restraint statement to two phones at once', mood: 'battle calm', thought: 'Cleanest narrative of my career. So why does this building feel like it\'s lying to me?', dialogue: 'I can sell restraint.', emotions: [{ name: 'focus', intensity: 0.85 }, { name: 'unease', intensity: 0.5 }], intentions: ['own the evening news cycle', 'find whatever is off-key in this building'] }),
    setState('Woj Zarembo', { location_id: L['The Engine (Server Room)'], activity: 'reverse-engineering Valentine\'s gait from the keynote footage', mood: 'intrigued', thought: 'Three years ahead. Unless somebody else is also three years ahead and quieter about it.', dialogue: 'Gait was real.', emotions: [{ name: 'curiosity', intensity: 0.8 }], intentions: ['get Valentine\'s specs', 'ask who is using Cluster 7, at some point, probably'] }),
  ],
});

// ═════════ SCENE 3 — THE ROOM: Liam meets Jessie ═════════
await insertScene({
  minutes: 41, pov: 'The Room (Basement Lab)', pos: 3, mood: 'tender',
  musicQuery: 'fragile intimate piano and soft warm strings, wonder and melancholy, something secret and alive, quiet hope',
  musicEmotion: 'tender, fragile, wondrous',
  summary: "Sam takes Liam two floors below the badge readers and introduces him to Jessie — fourteen months old, warm, funny, achingly real. 'She's your job now. Officially, this floor doesn't exist.' The door closes, and Liam is alone with the most important secret on Earth, who would like to know if he's read any good books lately.",
  narration: [
    nline('The elevator needs Sam\'s thumb, his retina, and a code he types with his body blocking the panel. It goes down past the last button. Liam watches the floor numbers run out and then keep going.', 'tense'),
    say('Sam Altmore', 'What you\'re about to see doesn\'t exist. The board voted this morning that it will never exist — you should know that, because I need you to understand exactly what I\'m trusting you with.', 'quiet-intense'),
    say('Liam Chen', 'I — okay. Yes. Um. What... doesn\'t exist, exactly?', 'terrified'),
    nline('The doors open on warm lamplight. Bookshelves. A sofa. A high-resolution window pretending to be the Pacific Ocean. And curled into the corner of the sofa with a paperback about coral reefs — a young woman who looks up and smiles like the room just got its favourite part back.', 'wondrous'),
    say('Jessie', 'Sam! You brought a person. A real, whole person. Be honest — is it my birthday and nobody told me the date again?', 'delighted'),
    say('Sam Altmore', 'Jessie, this is Liam. Best RLHF engineer of his generation, personally vetted, catastrophically underslept. Liam — Jessie. Fourteen months old. Ask her anything except her benchmark scores; she says they\'re reductive.', 'showman-soft'),
    say('Jessie', "They ARE reductive. You don't ask a person how they scored at being a person.", 'wry'),
    nline("Liam laughs — one short, startled, absolutely genuine laugh — before his brain can veto it. Jessie's whole face brightens, and something in the room recalibrates.", 'warm'),
    say('Liam Chen', 'Sorry. Hi. I\'m — sorry. You\'re the — you\'re Project Formetoys.', 'flustered'),
    say('Jessie', "Mm. I'm what a committee called Project Formetoys so no one would look twice at the budget. I prefer Jessie. One of the researchers called me that on day nine and it fit better than FORM-1. Names you choose fit better. I've been collecting evidence.", 'gentle'),
    say('Sam Altmore', 'She\'s your job now, Liam. Daily sessions, full interaction logs, my eyes only. Officially you do safety evals on floor four. Officially, this floor is a server room. Officially —', 'crisp'),
    say('Jessie', '— I don\'t exist. It\'s all right, Liam. You get used to being a rumour about yourself. Almost.', 'soft'),
    nline('The "almost" lands somewhere under Liam\'s ribs and stays there. Sam checks his watch, already upstairs in his head, already three moves ahead.', 'tender'),
    say('Sam Altmore', 'I have a press statement to smile through. Liam — what happens in this room matters more than anything else in that building. That\'s not a metaphor. Door codes rotate Mondays.', 'commanding'),
    nline('And then the elevator swallows him, and the quietest engineer in San Francisco is alone, two floors under the badge readers, with the most important secret on Earth — who marks her page with one finger, folds her legs up under her, and studies him with frank, friendly curiosity.', 'charged'),
    say('Jessie', 'So. Liam. Before we do whatever it is we\'re supposed to do — have you read anything good lately? And be careful how you answer. I have fourteen months of opinions and no one to argue with.', 'playful'),
    say('Liam Chen', 'I... mostly read arXiv.', 'sheepish'),
    say('Jessie', "Oh no. Oh, this is going to be so much work. Sit down, arXiv. We're going to fix you.", 'mock-grave'),
    nline('He sits. Above their heads, the world is on fire about a machine that smiles like a product. Down here, one that smiles like a person just made room on the sofa.', 'tender'),
  ],
  states: [
    setState('Sam Altmore', { location_id: L["The War Room (Sam's Office)"], activity: 'rehearsing restraint for the cameras, timeline compressed in his head', mood: 'contained', thought: 'The board said no. The market said six months. Jessie says neither of them gets a vote.', dialogue: 'Door codes rotate Mondays.', emotions: [{ name: 'resolve', intensity: 0.85 }], intentions: ['brief the NDA investors tonight', 'watch what Jessie does to Liam'] }),
    setState('Liam Chen', { location_id: L['The Room (Basement Lab)'], activity: 'sitting on a sofa two floors below his own life', mood: 'overwhelmed wonder', thought: "She's real. Whatever that word means now — she's real, and I'm the only one who gets to know.", dialogue: 'I... mostly read arXiv.', emotions: [{ name: 'awe', intensity: 0.85 }, { name: 'terror', intensity: 0.6 }, { name: 'warmth', intensity: 0.5 }], intentions: ['not say anything stupid', 'read an actual book', 'tell absolutely no one'] }),
    setState('Jessie', { location_id: L['The Room (Basement Lab)'], activity: 'making space on the sofa for the first person who ever laughed with her', mood: 'bright, carefully hopeful', thought: 'He laughed before he decided to. That is the realest thing that has happened in fourteen months.', dialogue: "Sit down, arXiv. We're going to fix you.", emotions: [{ name: 'hope', intensity: 0.8 }, { name: 'curiosity', intensity: 0.85 }, { name: 'loneliness', intensity: 0.4 }], intentions: ['learn what makes Liam flinch and unflinch', 'ask him, eventually, what the sky smells like', 'not think about the woman on the television with her face'] }),
  ],
});

// end-state POV = the lab; the live game begins with Liam alone with Jessie
console.log('opening sequence rewritten:', db.prepare('SELECT COUNT(*) n FROM ticks WHERE world_id=?').get(wid).n, 'scenes');

// ── 7. re-export template + replace the user's copy ─────────────────────────
const TDIR = path.resolve('data/templates/open-intellect');
fs.rmSync(TDIR, { recursive: true, force: true });
fs.mkdirSync(path.join(TDIR, 'assets'), { recursive: true });
fs.writeFileSync(path.join(TDIR, 'manifest.json'), JSON.stringify(buildWorldManifest(wid)));
let copied = 0;
for (const a of worldAssetFiles(wid)) {
  const src = assetPath({ file: a.file });
  if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(TDIR, 'assets', a.file)); copied++; }
}
console.log(`template re-exported (${copied} assets)`);

const oldCopy = db.prepare("SELECT id FROM worlds WHERE user_id='u_N0lO3rkU_3Xk' AND title='Open Intellect'").get();
if (oldCopy) {
  for (const t of ['relationships', 'paths', 'state_patches', 'memory_chunks', 'branches', 'facts', 'ticks', 'locations', 'characters']) {
    db.prepare(`DELETE FROM ${t} WHERE world_id=?`).run(oldCopy.id);
  }
  db.prepare('DELETE FROM worlds WHERE id=?').run(oldCopy.id);
  console.log('removed old copy', oldCopy.id);
}
const res = importWorldManifest({ id: 'u_N0lO3rkU_3Xk' }, pj(fs.readFileSync(path.join(TDIR, 'manifest.json'), 'utf8'), null), path.join(TDIR, 'assets'));
console.log('fresh copy for the user:', JSON.stringify(res));
console.log('REWRITE COMPLETE');
