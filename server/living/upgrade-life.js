import path from 'node:path';
import {db,DATA_DIR,j,pj,uid} from '../db.js';
import {openSimsCatalog} from './open_sims.js';
import {expandFacilities,assignFacilities} from './facilities.js';
import {LIFE_VERSION,prepareMind,evaluateMind,completedActivity,completedSocial} from './cognition.js';
export function upgradeLife(worldId,catalog){
  const clock=db.prepare('SELECT * FROM lw_worlds WHERE world_id=?').get(worldId);if(!clock)return false;
  const rules=pj(clock.rules,{});if(rules.lifeVersion>=LIFE_VERSION)return false;
  const places=db.prepare('SELECT * FROM lw_places WHERE world_id=? ORDER BY rowid').all(worldId).map(p=>({...p,affordances:pj(p.affordances,[])})),edges=db.prepare('SELECT from_id,to_id,seconds FROM lw_edges WHERE world_id=?').all(worldId),oldIds=new Set(places.map(p=>p.id));
  const people=db.prepare('SELECT * FROM lw_sims WHERE world_id=? ORDER BY rowid').all(worldId).map(p=>({...p,profile:pj(p.profile,{}),state:pj(p.state,{})})),byId=new Map(people.map(p=>[p.id,p]));
  expandFacilities(places,edges);assignFacilities(people,places,{seed:clock.seed});
  const oldProgress=new Map();for(const p of people){prepareMind(p,clock.seconds);oldProgress.set(p.id,new Map(p.state.psychology.ambitions.map(a=>[a.id,a.progress])));for(const a of p.state.psychology.ambitions){a.progress=a.initial_progress||0;a.practice_seconds=0;}}
  // Reconstruct measurements from retained evidence, never invent past achievements.
  for(const row of db.prepare("SELECT id,type,end,facts,description,participants FROM lw_events WHERE world_id=? AND type IN ('action_completed','social') ORDER BY end,rowid").all(worldId)){
    const e={...row,facts:pj(row.facts,{}),participants:pj(row.participants,[])};
    for(const id of e.participants){const p=byId.get(id);if(!p)continue;
      if(e.type==='action_completed')completedActivity(p,e,catalog.actions[e.facts.action]?.duration||0,{},e.end);
      else completedSocial(p,e,e.end);
    }
  }
  for(const p of people){for(const a of p.state.psychology.ambitions){a.progress=Math.max(a.progress,oldProgress.get(p.id).get(a.id)||0);a.completed=a.progress>=1;}evaluateMind(p,clock.seconds,catalog);}
  db.transaction(()=>{
    if(db.prepare('SELECT version FROM lw_worlds WHERE world_id=?').get(worldId).version!==clock.version)throw new Error('World changed during life upgrade.');
    for(const p of places){if(oldIds.has(p.id))db.prepare('UPDATE lw_places SET name=? WHERE id=?').run(p.name,p.id);else db.prepare('INSERT INTO lw_places(id,world_id,parent_id,name,kind,purpose,asset_id,x,y,capacity,anchored,landmark,affordances) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(p.id,worldId,p.parent_id,p.name,p.kind,p.purpose,p.asset_id,p.x,p.y,p.capacity,0,p.landmark,j(p.affordances));}
    for(const e of edges)db.prepare('INSERT OR IGNORE INTO lw_edges VALUES (?,?,?,?)').run(worldId,e.from_id,e.to_id,e.seconds);
    for(const p of people){db.prepare('UPDATE lw_sims SET state=?,profile=? WHERE id=?').run(j(p.state),j(p.profile),p.id);const id=uid('le_'),text='Gefühle werden aus meinem gegenwärtigen Zustand bewertet; messbarer Zielfortschritt wurde aus meinen erhaltenen Ereignissen übernommen. Neue Gebäudeabschnitte ergänzen meine Umgebung.';
      db.prepare('INSERT INTO lw_events VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,worldId,null,clock.seconds,clock.seconds,p.location_id,'initialization_life_model',j([p.id]),j({coverage:'state_model_upgrade',progressPolicy:'retained_events_only',preservesExistingEvents:true}),text,'state_model_upgrade');
      db.prepare('INSERT INTO lw_journal VALUES (?,?,?,?,?,?,?)').run(p.id,id,clock.seconds,'initialization',text,'Mein Zustand wird genauer dargestellt; meine früheren Erlebnisse bleiben unverändert.',1);
    }
    db.prepare('UPDATE lw_worlds SET rules=?,version=version+1 WHERE world_id=?').run(j({...rules,lifeVersion:LIFE_VERSION}),worldId);
  })();return true;
}
export async function upgradeAllLife(){
  const pending=db.prepare('SELECT world_id,rules FROM lw_worlds').all().filter(w=>(pj(w.rules,{}).lifeVersion||0)<LIFE_VERSION);if(!pending.length)return {worlds:0};
  const backup=path.join(DATA_DIR,'before-life-model-'+Date.now()+'.db');await db.backup(backup);const catalog=await openSimsCatalog();
  for(const w of pending)upgradeLife(w.world_id,catalog);return {worlds:pending.length,backup};
}
