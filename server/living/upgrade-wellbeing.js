import path from 'node:path';import {db,pj,j} from '../db.js';import './schema.js';
import {loadTown} from './engine.js';import {projectWellbeing,WELLBEING_VERSION} from './wellbeing.js';
export async function upgradeAllWellbeing(){
 const pending=db.prepare("SELECT world_id FROM lw_worlds WHERE coalesce(json_extract(rules,'$.wellbeingVersion'),0)<?").all(WELLBEING_VERSION);if(!pending.length)return {worlds:0};
 const backup=path.join(path.dirname(db.name),'before-perma-'+Date.now()+'.db');await db.backup(backup);
 db.transaction(()=>{for(const row of pending){const town=loadTown(row.world_id);for(const p of town.people){
   // Start from current state; do not invent past happiness reports or successes.
   projectWellbeing(p,town.world.seconds);db.prepare('UPDATE lw_sims SET state=? WHERE id=?').run(j(p.state),p.id);
 }db.prepare('UPDATE lw_worlds SET rules=?,version=version+1 WHERE world_id=?').run(j({...pj(town.world.rules,{}),wellbeingVersion:WELLBEING_VERSION}),row.world_id);}})();return {worlds:pending.length,backup};
}
