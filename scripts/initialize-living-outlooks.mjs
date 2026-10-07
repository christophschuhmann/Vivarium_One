// Opt-in upgrade of an unadvanced town. Played conversations, authored biographies
// and existing outlooks survive unchanged. Back up the database before --apply.
import {db,j,pj,uid} from '../server/db.js';
import {loadTown,insertEvent} from '../server/living/engine.js';
import {seedInitialSituations} from '../server/living/initial-tensions.js';
import {openSimsCatalog,closeOpenSims} from '../server/living/open_sims.js';
const worldId=process.argv.find(a=>a.startsWith('--world='))?.slice(8);
if(!worldId)throw Error('Use --world=ID and optionally --apply');
try{
 const town=loadTown(worldId);
 if(town.world.seconds!==27000||db.prepare('SELECT 1 FROM lw_beats WHERE world_id=?').get(worldId))throw Error('Only a town before its first tick can receive an initial outlook upgrade.');
 if(db.prepare("SELECT 1 FROM living_turbo_jobs WHERE world_id=? AND status IN ('running','cancelling')").get(worldId))throw Error('Stop Turbo before upgrading.');
 const skipSimIds=new Set(db.prepare("SELECT participants FROM lw_events WHERE world_id=? AND type NOT LIKE 'initialization_%'").all(worldId).flatMap(e=>pj(e.participants,[])));
 const revisedIds=new Set(town.people.filter(p=>p.state.initialSituation).map(p=>p.id));
 const changed=seedInitialSituations(town,await openSimsCatalog(),{skipSimIds}),distribution={};
 for(const p of changed)distribution[p.state.initialSituation.kind]=(distribution[p.state.initialSituation.kind]||0)+1;
 if(process.argv.includes('--apply'))db.transaction(()=>{
  for(const p of changed){
   db.prepare('UPDATE lw_sims SET state=? WHERE world_id=? AND id=?').run(j(p.state),worldId,p.id);
   for(const [id,rel] of Object.entries(p.relations))db.prepare('UPDATE lw_relations SET payload=? WHERE world_id=? AND from_id=? AND to_id=?').run(j(rel),worldId,p.id,id);
   const text=p.state.initialSituation.title+'. '+p.state.initialSituation.thought;
   insertEvent({id:uid('le_'),world_id:worldId,start:27000,end:27000,type:revisedIds.has(p.id)?'initialization_outlook_revision':'initialization_outlook',location_id:p.state.location_id,participants:[p.id],facts:{coverage:'initialized_background',upgradeVersion:2},description:text,source:'procedural_initialization'},[{simId:p.id,perception:text,interpretation:revisedIds.has(p.id)?'Revised initial background replaces my earlier starting outlook; no event was experienced.':'My starting outlook; this is not an event I witnessed in play.',channel:'initialization',confidence:1}]);
  }
 })();
 console.log(JSON.stringify({worldId,applied:process.argv.includes('--apply'),updated:changed.length,protectedParticipants:skipSimIds.size,distribution},null,2));
}finally{closeOpenSims();db.close();}
