// One-shot upgrade of the existing demo world: bond attributes + initial inner states.
import { db, j, pj } from '../server/db.js';

const world = db.prepare(`SELECT w.* FROM worlds w JOIN users u ON u.id=w.user_id WHERE u.email='demo@vivarium.local' AND w.title='Alice & Bob'`).get();
if (!world) { console.log('no demo world'); process.exit(0); }

const chars = db.prepare('SELECT * FROM characters WHERE world_id=?').all(world.id);
const byName = Object.fromEntries(chars.map(c => [c.name, c]));

const bondAttrs = {
  [`${byName.Alice?.id}|${byName.Bob?.id}`]: {
    nature: 'young couple, two years in',
    common_goals: ['make the tiny flat feel like home', 'survive exam season together', 'a someday-trip to the coast'],
    conflicts: ["his analysing vs her wanting plain words", 'her overwork vs his worry'],
    shared_experiences: [{ tick: 0, text: 'met in a first-aid course when Bob fainted and Alice caught him' }],
  },
  [`${byName.Bob?.id}|${byName.Alice?.id}`]: {
    nature: 'young couple, two years in',
    common_goals: ['make the tiny flat feel like home', 'get through exam season', 'cook one meal she rates above her own'],
    conflicts: ['his need to reframe everything out loud', 'fear of feelings staying theoretical'],
    shared_experiences: [{ tick: 0, text: 'the first-aid course faint — he still claims it was strategic' }],
  },
};
for (const r of db.prepare('SELECT * FROM relationships WHERE world_id=?').all(world.id)) {
  const a = bondAttrs[`${r.from_id}|${r.to_id}`];
  if (a && !pj(r.attributes, {}).nature) {
    db.prepare('UPDATE relationships SET attributes=? WHERE id=?').run(j(a), r.id);
    console.log('bond attrs set', r.from_id, '→', r.to_id);
  }
}

const inner = {
  Alice: {
    emotions: [{ name: 'relieved', intensity: 0.8 }, { name: 'affectionate', intensity: 0.7 }, { name: 'tired', intensity: 0.4 }],
    perceptions: { seeing: 'Bob across the café table, steam curling off her tea', hearing: 'the espresso machine and low student chatter', feeling: 'warm mug against both palms', smell_taste: 'bergamot tea, a little too hot' },
    intentions: ['actually rest this afternoon', 'tell Bob about the third exam question'],
  },
  Bob: {
    emotions: [{ name: 'proud', intensity: 0.7 }, { name: 'content', intensity: 0.8 }],
    perceptions: { seeing: "Alice's shoulders finally dropping", hearing: 'her recounting the exam, faster and faster', feeling: 'the wobble of the café chair', smell_taste: 'burnt espresso' },
    intentions: ['walk her home the long way through the park', 'not analyse this moment out loud'],
  },
};
for (const c of chars) {
  const st = pj(c.materialised, {});
  if (!st.emotions && inner[c.name]) {
    Object.assign(st, inner[c.name]);
    db.prepare('UPDATE characters SET materialised=? WHERE id=?').run(j(st), c.id);
    console.log('inner state seeded for', c.name);
  }
}
console.log('upgrade done');
