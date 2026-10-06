// Seeds: admin account, demo player, and the fully-built "Alice & Bob" world
// using the assets generated during planning. Idempotent-ish (skips if world exists).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, uid, now, j } from '../server/db.js';
import { hashPassword } from '../server/auth.js';
import { record, toMicro } from '../server/credits.js';
import { importAssetFile } from '../server/assets.js';
import { captureGenesisSnapshot } from '../server/branches.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = (p) => path.join(ROOT, 'assets', p);

function ensureUser(email, password, name, role, credits, verified = true) {
  let u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!u) {
    const id = uid('u_');
    db.prepare(`INSERT INTO users(id,email,password_hash,display_name,role,status,credit_balance,daily_cap,email_verified_at,created_at)
                VALUES (?,?,?,?,?,'active',0,?,?,?)`)
      .run(id, email, hashPassword(password), name, role, toMicro(1000), verified ? now() : null, now());
    record(id, { delta: toMicro(credits), reason: 'admin_grant', createdBy: 'seed' });
    u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    console.log(`created ${role}: ${email} / ${password}`);
  }
  return u;
}

const admin = ensureUser('admin@vivarium.local', 'admin-vivarium-2026', 'The Operator', 'admin', 1000);
const demo = ensureUser('demo@vivarium.local', 'alice-and-bob', 'Demo Player', 'player', 500);

if (db.prepare(`SELECT id FROM worlds WHERE user_id=? AND title='Alice & Bob'`).get(demo.id)) {
  console.log('demo world already seeded'); process.exit(0);
}

const wid = uid('w_');
db.prepare(`INSERT INTO worlds(id,user_id,title,art_style,sim_time,tick_index,genre,mood,pacing,directives,status,created_at,updated_at)
            VALUES (?,?,?,?,?,0,?,?,?,?,'live',?,?)`)
  .run(wid, demo.id, 'Alice & Bob', 'anime', new Date('2026-09-15T07:30:00').toISOString(),
    'slice-of-life', 'cosy', 0.4,
    'Keep it grounded and gentle. Let small coincidences happen. Nothing should feel rushed.',
    now(), now());

const cover = importAssetFile({ userId: demo.id, worldId: wid, kind: 'cover', filePath: A('mood_cooking_together.png'), mime: 'image/png', prompt: 'cover' });
db.prepare('UPDATE worlds SET cover_asset_id=? WHERE id=?').run(cover.id, wid);

// ---- locations ----
const GROUPS = { apt: 'The Apartment', uni: 'University', town: 'Town' };
const LOCS = [
  ['living',  'Living room',        'room',   'apt',  'living_room.png',              'cozy student shared-apartment living room', 120, 150],
  ['kitchen', 'Kitchen',            'room',   'apt',  'kitchen.png',                  'small cheerful student apartment kitchen', 120, 320],
  ['bedroom', 'Bedroom',            'room',   'apt',  'bedroom.png',                  "the couple's cozy bedroom", 300, 110],
  ['bath',    'Bathroom',           'room',   'apt',  'bathroom.png',                 'small bright bathroom', 300, 280],
  ['street',  'The Street',         'public', '',     'street.png',                   'the street connecting home, town and campus', 560, 240],
  ['quad',    'Campus Quad',        'public', 'uni',  'campus_quad.png',              'sunny university campus quad', 820, 90],
  ['cafe',    'Campus Café',        'public', 'uni',  'campus_cafe_empty.png',        'the campus café where students study', 1000, 170],
  ['library', 'University Library', 'public', 'uni',  'university_library.png',       'the grand reading hall', 1010, 320],
  ['medfac',  'Hospital Ward',      'public', 'uni',  'hospital_ward.png',            'teaching-hospital ward where Alice trains', 830, 400],
  ['lab',     'Psych Lab',          'public', 'uni',  'psych_lab.png',                'the psychology lab where Bob runs studies', 840, 250],
  ['market',  'Supermarket',        'public', 'town', 'supermarket.png',              'the neighbourhood supermarket', 420, 480],
  ['restaurant','Trattoria Sole',   'public', 'town', 'italian_restaurant_empty.png', 'their favourite little Italian restaurant', 620, 520],
  ['gym',     'The Gym',            'public', 'town', 'gym.png',                      'the friendly neighbourhood gym', 800, 560],
  ['park',    'Town Park',          'public', 'town', 'park.png',                     'the park with the duck pond', 300, 560],
  ['townhall','Town Hall',          'public', 'town', 'town_hall.png',                'the small-town hall', 480, 620],
  ['court',   'Courthouse',         'public', 'town', 'courthouse.png',               'the stately courthouse', 640, 650],
];
const locId = {};
for (const [key, name, type, group, file, desc, x, y] of LOCS) {
  const id = uid('l_');
  locId[key] = id;
  const bg = importAssetFile({ userId: demo.id, worldId: wid, kind: 'background', ownerRef: id, filePath: A('locations/' + file), mime: 'image/png', prompt: `bg:${name}` });
  db.prepare('INSERT INTO locations(id,world_id,name,type,place_group,description,background_asset_id,x,y) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, wid, name, type, GROUPS[group] || '', desc, bg.id, x, y);
}
const PATHS = [
  ['bedroom', 'living', ''], ['bath', 'living', ''], ['kitchen', 'living', ''],
  ['living', 'street', 'front door'], ['street', 'quad', '15 min walk'], ['street', 'market', ''],
  ['street', 'park', ''], ['street', 'gym', ''], ['street', 'restaurant', ''],
  ['quad', 'cafe', ''], ['quad', 'library', ''], ['quad', 'lab', ''], ['quad', 'medfac', ''],
  ['park', 'townhall', ''], ['townhall', 'court', ''],
];
for (const [a, b, label] of PATHS) {
  db.prepare('INSERT INTO paths(id,world_id,from_id,to_id,label) VALUES (?,?,?,?,?)').run(uid('p_'), wid, locId[a], locId[b], label);
}

// ---- characters ----
function importOutfits(prefix, ownerRef) {
  const outfits = [];
  for (const o of ['everyday', 'sport', 'formal']) {
    const portrait = importAssetFile({ userId: demo.id, worldId: wid, kind: 'portrait', ownerRef, filePath: A(`characters/${prefix}_${o}.png`), mime: 'image/png', prompt: `${prefix} ${o}` });
    const cutout = importAssetFile({ userId: demo.id, worldId: wid, kind: 'cutout', ownerRef, filePath: A(`cutouts/${prefix}_${o}.png`), mime: 'image/png', prompt: `${prefix} ${o} cutout`, meta: { outfitName: o } });
    outfits.push({ name: o, cutout_asset_id: cutout.id, portrait_asset_id: portrait.id });
  }
  return outfits;
}

const aliceId = uid('c_');
const aliceOutfits = importOutfits('alice', aliceId);
db.prepare(`INSERT INTO characters(id,world_id,name,base_profile,materialised,reference_asset_id,voice,created_at) VALUES (?,?,?,?,?,?,?,?)`)
  .run(aliceId, wid, 'Alice', j({
    name: 'Alice', age: 21, pronouns: 'she/her',
    appearance: 'a 21-year-old woman with a soft lavender-purple bob haircut with straight bangs, big warm brown eyes, gentle smile',
    outfit: 'a pink cardigan over a cream top and blue jeans',
    personality: 'warm, driven, slightly frazzled; apologises too much; hums when she cooks',
    goals: ['become a paediatric surgeon', 'pass the anatomy module with distinction', 'learn to actually rest'],
    fears: ['doing her first real blood draw', 'letting patients down', 'burning out like her mother did'],
    coping: ['flashcards at the kitchen counter', 'humming while cooking', 'long showers'],
    backstory: 'Grew up in a small town; first in her family at university. Met Bob in a first-aid course two years ago when he fainted and she caught him.',
    speaking_style: 'quick, warm, self-interrupting; medical words slip in when nervous',
    voice: 'Leda',
  }), j({
    location_id: locId.kitchen, activity: 'cramming cardiology flashcards over coffee', mood: 'focused, a bit frazzled',
    thought: 'Anatomy exam at nine. I know this. I mostly know this.', dialogue: null, outfit: 'everyday', outfits: aliceOutfits,
  }), aliceOutfits[0].portrait_asset_id, 'Leda', now());

const bobId = uid('c_');
const bobOutfits = importOutfits('bob', bobId);
db.prepare(`INSERT INTO characters(id,world_id,name,base_profile,materialised,reference_asset_id,voice,created_at) VALUES (?,?,?,?,?,?,?,?)`)
  .run(bobId, wid, 'Bob', j({
    name: 'Bob', age: 22, pronouns: 'he/him',
    appearance: 'a 22-year-old man with short tousled dark teal-blue hair, kind eyes behind round glasses, friendly relaxed smile',
    outfit: 'a mustard-yellow t-shirt under an open teal overshirt and dark chinos',
    personality: 'calm, curious, gently ironic; over-analyses everyone including himself',
    goals: ['get into the cognition research master', 'finish his eye-tracking study', 'cook one meal Alice actually rates above her own'],
    fears: ["being better at theories than at feelings", 'public speaking at conferences', 'that Alice never rests'],
    coping: ['long runs', 'reframing things out loud', 'making tea nobody asked for'],
    backstory: 'City kid, youngest of three. Met Alice in a first-aid course where he fainted; claims it was strategic.',
    speaking_style: 'unhurried, dry humour, asks questions instead of answering',
    voice: 'Puck',   // profile-backed ("Peter") — distinct from the narrator's Iapetus
  }), j({
    location_id: locId.bedroom, activity: 'just woke up, staring at the ceiling', mood: 'sleepy, content',
    thought: 'Lecture at ten. Alice has her exam. I should make her eat something.', dialogue: null, outfit: 'everyday', outfits: bobOutfits,
  }), bobOutfits[0].portrait_asset_id, 'Puck', now());

for (const c of [aliceId, bobId]) {
  db.prepare(`INSERT INTO state_patches(id,world_id,entity_ref,entity_id,idx,tick_ref,author,category,op,path,value,reason,created_at)
              VALUES (?,?,?,?,1,0,'player','physical','set','/created',?,?,?)`)
    .run(uid('sp_'), wid, 'character', c, j('time-zero base'), 'seeded demo character', now());
}
db.prepare('INSERT INTO relationships(id,world_id,from_id,to_id,description,strength,history) VALUES (?,?,?,?,?,?,?)')
  .run(uid('r_'), wid, aliceId, bobId, "loves him; wishes he'd say things straight instead of analysing them", 0.85, '[]');
db.prepare('INSERT INTO relationships(id,world_id,from_id,to_id,description,strength,history) VALUES (?,?,?,?,?,?,?)')
  .run(uid('r_'), wid, bobId, aliceId, 'loves her; quietly worried she never rests', 0.85, '[]');

captureGenesisSnapshot(db.prepare('SELECT * FROM worlds WHERE id=?').get(wid));

console.log(`seeded world "Alice & Bob" (${wid}) for ${demo.email}`);
