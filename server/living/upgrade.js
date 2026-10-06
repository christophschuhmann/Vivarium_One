import {db,DATA_DIR,j,pj,uid} from '../db.js';
import path from 'node:path';
import {nameNeighborhoods,SOCIAL_VERSION} from './neighborhoods.js';
import {weaveSocial,socialBackground} from './social.js';
// Called before HTTP starts. Add initialized background, never rewrite lived events.
export function upgradeNeighborhoods(worldId){
  const clock=db.prepare('SELECT * FROM lw_worlds WHERE world_id=?').get(worldId);if(!clock)return false;
  const rules=pj(clock.rules,{});if(rules.socialVersion>=SOCIAL_VERSION)return false;
  const places=db.prepare('SELECT * FROM lw_places WHERE world_id=? ORDER BY rowid').all(worldId),identities=nameNeighborhoods(places,clock.seed);
  const people=db.prepare('SELECT * FROM lw_sims WHERE world_id=? ORDER BY rowid').all(worldId).map(p=>({...p,profile:pj(p.profile,{}),state:pj(p.state,{}),relations:{}})),byId=new Map(people.map(p=>[p.id,p]));
  for(const r of db.prepare('SELECT * FROM lw_relations WHERE world_id=?').all(worldId))if(byId.has(r.from_id))byId.get(r.from_id).relations[r.to_id]=pj(r.payload,{});
  weaveSocial(people,places,identities,{seed:clock.seed,existing:true});
  db.transaction(()=>{
    if(db.prepare('SELECT version FROM lw_worlds WHERE world_id=?').get(worldId).version!==clock.version)throw new Error('World changed during neighborhood upgrade.');
    for(const p of places)if(['neighborhood','district'].includes(p.kind))db.prepare('UPDATE lw_places SET name=?,purpose=? WHERE id=?').run(p.name,p.purpose,p.id);
    for(const p of people){
      db.prepare('UPDATE lw_sims SET profile=? WHERE id=?').run(j(p.profile),p.id);
      for(const [other,r] of Object.entries(p.relations))db.prepare('INSERT INTO lw_relations VALUES (?,?,?,?) ON CONFLICT(world_id,from_id,to_id) DO UPDATE SET payload=excluded.payload').run(worldId,p.id,other,j(r));
      const text=socialBackground(p,byId),id=uid('le_');
      db.prepare('INSERT INTO lw_events VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,worldId,null,clock.seconds,clock.seconds,p.location_id,'initialization_social_background',j([p.id]),j({coverage:'supplemental_procedural_background',doesNotRewriteWitnessedEvents:true}),text,'procedural_initialization');
      db.prepare('INSERT INTO lw_journal VALUES (?,?,?,?,?,?,?)').run(p.id,id,clock.seconds,'initialization',text,'Ergänzter Ausgangshintergrund; kein neu beobachtetes Ereignis. Meine bisherigen Erlebnisse bleiben bestehen.',1);
    }
    db.prepare('UPDATE lw_worlds SET rules=?,version=version+1 WHERE world_id=?').run(j({...rules,socialVersion:SOCIAL_VERSION,neighborhoods:identities}),worldId);
  })();return true;
}
export async function upgradeAllNeighborhoods(){
  const pending=db.prepare('SELECT world_id,rules FROM lw_worlds').all().filter(w=>(pj(w.rules,{}).socialVersion||0)<SOCIAL_VERSION);if(!pending.length)return {worlds:0};
  const backup=path.join(DATA_DIR,'before-social-neighborhoods-'+Date.now()+'.db');await db.backup(backup);
  for(const w of pending)upgradeNeighborhoods(w.world_id);
  return {worlds:pending.length,backup};
}
