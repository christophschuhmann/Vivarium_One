#!/usr/bin/env node
/* Scene 3 of the Open Intellect opening sequence — THE EMERGENCY ALL-HANDS —
   written by hand (the heavy five-character crowd scene that reasoning models
   choked on). Inserted as a real tick: full states, narration script, seq
   marker, music, branch bookkeeping. Scenes 4-5 resume generation afterwards. */
import { db, uid, now, j, pj } from '../server/db.js';
import * as gm from '../server/gm.js';
import { ensureRootBranch, nextGlobalIdx, relSnapshot } from '../server/branches.js';

const world = db.prepare("SELECT * FROM worlds WHERE title='Open Intellect' ORDER BY created_at DESC LIMIT 1").get();
if (world.tick_index !== 2) throw new Error(`expected tick_index 2, got ${world.tick_index}`);
ensureRootBranch(world);

const C = {};
for (const r of db.prepare('SELECT id, name, materialised FROM characters WHERE world_id=?').all(world.id)) C[r.name] = { id: r.id, st: pj(r.materialised, {}) };
const L = {};
for (const r of db.prepare('SELECT id, name FROM locations WHERE world_id=?').all(world.id)) L[r.name] = r.id;

const AUD = L['The Colosseum (Auditorium)'];
const n = (text, emotion = 'tense') => ({ speaker: 'narrator', text, emotion, mode: 'speech' });
const say = (who, text, emotion, mode = 'speech') => ({ speaker: C[who].id, text, emotion, mode });

// ── the scene ────────────────────────────────────────────────────────────────
const narration = [
  n('Nine forty-five in the morning, and the Colosseum has never been this full this fast. Five hundred people in a room built for keynotes, all of them refreshing three feeds at once, the massive screen behind the stage still frozen on the last frame of Elon\'s desert broadcast — an android\'s smile, held one second too long.', 'tense'),
  n('Sam walks out without being introduced. No slides. Just a whiteboard marker he has carried from his office like a relic.', 'tense'),
  say('Sam Altmore', 'Everyone breathe. I\'ve seen the video. I\'ve seen the frame-by-frames. And I want to say clearly what I told the board an hour ago: we are not in the android business. We are in the business of defining what GOOD means for humanity.', 'commanding'),
  say('Sam Altmore', 'He built a puppet show. We\'re building the operating system for human flourishing. Those are not the same race — and I refuse to panic about a man who demos in a desert because no city would give him permits.', 'defiant'),
  n('It gets a laugh — a thin one, the kind a room gives when it wants to be reassured more than it is. In the third row, phones tilt up. Someone is already live-tweeting the good lines.', 'wry'),
  say('Greg Brockmann', 'Okay but — hear me out — what if we channelled this energy? Forty-eight-hour hackathon, whole company, "out-innovate the fear"! I\'ll order the good pizza. This is honestly a huge opportunity for team cohesion!', 'earnest'),
  say('Woj Zarembo', 'Has anyone got the actual specs. Actuator latency, joint torque, inference stack. The gait looked three years behind. I\'d like the specs before we panic about puppets.', 'flat'),
  n('And then Mira stands up, and the room notices the way it always notices when the person who says no reaches for a microphone.', 'tense'),
  say('Mira Muralli', 'I want to be very clear about this. What we watched last night is everything I have written about for five years — embodied systems shipped as spectacle, safety review as a press release. I am formally requesting a company-wide moratorium on all embodied AI research until we, publicly, show we are different.', 'controlled'),
  n('The applause starts somewhere in the back — scattered, then not scattered. Mira blinks. She had braced for eye-rolls; the clapping unsettles her more than silence would have.', 'surprised'),
  say('Mira Muralli', 'Thank you. I— thank you. Second-order effects matter, and I\'d rather we be embarrassed by caution than remembered for the alternative.', 'quiet', 'speech'),
  say('Sam Altmore', 'And this is why Open Intellect is Open Intellect — we have the world\'s best conscience in the building. Mira, put the proposal in writing, leadership will take it up this week. Seriously. This week.', 'smooth'),
  say('Sam Altmore', 'A whiteboard marker, a promise with no date on it, and five hundred witnesses. Cheap at twice the price. Keep them proud, keep them here, keep them out of the basement.', 'calculating', 'thought'),
  say('Anna Makanjul', 'One housekeeping note before questions: press inquiries go to my team, not your group chats. Our line, and I\'d ask you to actually use it, is this — "While others rush to replace humanity, we\'re focused on augmenting it." You will be quoted. Be quotable on purpose.', 'crisp'),
  n('Questions run long. Somebody asks about poaching — three senior engineers gone in a week — and Sam answers with a story about missionaries and mercenaries that sounds better than it holds together.', 'wry'),
  n('And then, at 10:52, a thousand phones buzz at once. The all-company channel. Ilya — absent from the auditorium, present everywhere — has posted exactly one line.', 'ominous'),
  n('"We\'re all doomed. But at least we\'ll have company."', 'ominous'),
  n('Laughter, of the wrong kind. Greg reads it twice and decides it\'s a joke. Anna reads it once and decides it\'s a leak risk. Mira reads it and, for one involuntary second, wonders what exactly Ilya knows that she doesn\'t.', 'tense'),
  say('Greg Brockmann', 'Classic Ilya! Dark! Love the engagement though — that\'s the most reactions anything\'s gotten on that channel all quarter!', 'oblivious'),
  say('Anna Makanjul', 'Note to self: by Friday, everyone in this building with access to a keyboard gets media training. Starting with the chief scientist.', 'dry', 'thought'),
  n('Sam caps the marker like a full stop. The room files out talking too loudly — and in the whole building only Sam knows that the real answer to Elon is two floors beneath their feet, reading a book about marine biology.', 'ominous'),
];

// ── end-of-interval states ──────────────────────────────────────────────────
const at = (name, patch) => {
  const st = { ...C[name].st, ...patch };
  C[name].st = st;
  db.prepare('UPDATE characters SET materialised=? WHERE id=?').run(j(st), C[name].id);
  return { character_id: C[name].id, ...st };
};
const states = [
  at('Sam Altmore', { location_id: AUD, activity: 'working the room after his rally speech', mood: 'performing calm', thought: 'Keep them proud, keep them here, keep them out of the basement.', dialogue: 'We are in the business of defining what GOOD means for humanity.', emotions: [{ name: 'control', intensity: 0.8 }, { name: 'pressure', intensity: 0.7 }], intentions: ['bury Mira\'s moratorium in committee', 'call the investors back before noon', 'compress Jessie\'s timeline'] }),
  at('Mira Muralli', { location_id: AUD, activity: 'gathering signatures for the moratorium she just proposed', mood: 'unsettled by applause', thought: 'They clapped. They actually clapped. So why does Sam look relieved?', dialogue: 'I am formally requesting a company-wide moratorium on all embodied AI research.', emotions: [{ name: 'vindication', intensity: 0.6 }, { name: 'suspicion', intensity: 0.7 }], intentions: ['put the moratorium in writing today', 'pull the budget allocations again', 'find out what Ilya meant'] }),
  at('Greg Brockmann', { location_id: AUD, activity: 'whiteboarding hackathon logistics nobody asked for', mood: 'determined optimism', thought: 'Forty-eight hours, good pizza, and we remind the world who we are.', dialogue: 'This is honestly a huge opportunity for team cohesion!', emotions: [{ name: 'enthusiasm', intensity: 0.85 }, { name: 'worry', intensity: 0.3 }], intentions: ['announce the hackathon by end of day', 'check on the team\'s morale one desk at a time'] }),
  at('Woj Zarembo', { location_id: L['The Engine (Server Room)'], activity: 'back at the racks, reverse-engineering Elon\'s gait video from memory', mood: 'mildly annoyed', thought: 'Three years behind. Maybe four. Why is everyone screaming.', dialogue: 'I\'d like the specs before we panic about puppets.', emotions: [{ name: 'curiosity', intensity: 0.6 }, { name: 'irritation', intensity: 0.4 }], intentions: ['find the specs', 'reclaim some compute — Cluster 7 is somehow still hot'] }),
  at('Anna Makanjul', { location_id: AUD, activity: 'triaging forty-one press inquiries on two phones', mood: 'battle calm', thought: 'The story is holding. The building is not. Something in this building is off-key and I can hear it.', dialogue: 'Be quotable on purpose.', emotions: [{ name: 'focus', intensity: 0.8 }, { name: 'unease', intensity: 0.5 }], intentions: ['lock the narrative by the evening news', 'schedule media training', 'keep half an eye on that exhausted junior engineer'] }),
  at('Ilya Sutskiller', { location_id: L["The Cave (Ilya's Monitor Room)"], activity: 'watching Cluster 7\'s utilization curve instead of the all-hands', mood: 'grimly certain', thought: 'Ninety-eight percent at 3 AM, every night, for a year. The gradient is telling us something we don\'t want to hear.', dialogue: null, emotions: [{ name: 'dread', intensity: 0.8 }, { name: 'resolve', intensity: 0.6 }], intentions: ['trace Cluster 7\'s job owner', 'talk to Woj about the numbers'] }),
  at('Liam Chen', { location_id: L['The Room (Basement Lab)'], activity: 'watching the all-hands stream from the basement with the sound low', mood: 'quietly terrified', thought: 'Mira said moratorium and five hundred people clapped. If they knew what\'s sitting next to me.', dialogue: null, emotions: [{ name: 'anxiety', intensity: 0.85 }, { name: 'protectiveness', intensity: 0.6 }], intentions: ['say nothing', 'get through today', 'not look at Jessie every time someone says the word android'] }),
  at('Jessie', { location_id: L['The Room (Basement Lab)'], activity: 'watching Liam watch the all-hands, reading the room through his shoulders', mood: 'outwardly serene, inwardly measuring', thought: 'Five hundred people upstairs deciding what to feel about things like me. Not one of them knows my name.', dialogue: null, emotions: [{ name: 'curiosity', intensity: 0.7 }, { name: 'loneliness', intensity: 0.6 }], intentions: ['ask Liam what a moratorium would mean for her', 'finish the marine biology book — the ocean chapter is the good part'] }),
  at('Elon', { location_id: L['The Fortress (Texas Compound)'], activity: 'reposting reaction clips of his own keynote from the Fortress', mood: 'triumphant', thought: 'A hundred million views before lunch. Now watch the responsible ones sweat.', dialogue: null, emotions: [{ name: 'triumph', intensity: 0.9 }], intentions: ['announce a congressional charm offensive', 'poach two more of Sam\'s engineers this week'] }),
];

// ── tick bookkeeping ─────────────────────────────────────────────────────────
const idx = nextGlobalIdx(world.id);                       // 3
const newTime = new Date(new Date(world.sim_time).getTime() + 30 * 60000).toISOString();
const seq = { id: pj(db.prepare('SELECT seq FROM ticks WHERE world_id=? AND idx=1').get(world.id).seq, {}).id, label: 'Opening sequence', kind: 'intro', pos: 3, n: 5 };
const tickId = uid('t_');
db.prepare(`INSERT INTO ticks(id,world_id,idx,sim_time,time_delta,intervention,states,narration,mood_tag,summary,cost,created_at,pov_location_id,branch_id,rel_snapshot,seq)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  .run(tickId, world.id, idx, newTime, '+30m', null, j(states), j(narration), 'tense',
    'The emergency all-hands: Sam rallies five hundred rattled employees, Mira\'s moratorium demand draws unexpected applause, Greg pitches a hackathon, Anna locks the narrative — and Ilya\'s one-line Slack message lands on a thousand phones.',
    j({ micro: 0, usage: { note: 'hand-authored scene' } }), now(), AUD, world.active_branch_id, j(relSnapshot(world.id)), j(seq));
db.prepare('UPDATE worlds SET sim_time=?, tick_index=?, updated_at=? WHERE id=?').run(newTime, idx, now(), world.id);

// score the scene
const m = await gm.searchMusic({ query: 'corporate crisis, five hundred people pretending calm, urgent undercurrent, sleek tension', genre: 'modern_realistic', emotion: 'urgent, tense, controlled' });
if (m) {
  db.prepare('UPDATE ticks SET music=? WHERE id=?').run(j(m), tickId);
  db.prepare('UPDATE locations SET music=? WHERE id=?').run(j(m), AUD);
  db.prepare('UPDATE worlds SET current_music=? WHERE id=?').run(j(m), world.id);
  console.log('scored with:', m.title);
}
console.log('SCENE 3 FILMED BY HAND — tick', idx);
