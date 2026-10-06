import path from 'node:path';
import {db,pj,j} from '../db.js';
import './schema.js';
import {normalizeRomance,ROMANCE_POLICY} from './romance.js';
export async function upgradeAllRomance(){
 const pending=db.prepare("SELECT world_id,seed,rules FROM lw_worlds WHERE coalesce(json_extract(rules,'$.romanceVersion'),0)<?").all(ROMANCE_POLICY.version);
 if(!pending.length)return {worlds:0};
 const backup=path.join(path.dirname(db.name),'before-romantic-needs-'+Date.now()+'.db');await db.backup(backup);
 db.transaction(()=>{for(const w of pending){for(const row of db.prepare('SELECT id,age,profile,state FROM lw_sims WHERE world_id=?').all(w.world_id)){
   const p={...row,profile:pj(row.profile,{}),state:pj(row.state,{})};normalizeRomance(p,{seed:w.seed});
   // Initialize only the new dimension and enforce the age cap. Existing warmth,
   // events, journal, achievements, locations and simulation time stay intact.
   db.prepare('UPDATE lw_sims SET state=? WHERE id=?').run(j(p.state),p.id);
 }db.prepare('UPDATE lw_worlds SET rules=?,version=version+1 WHERE world_id=?').run(j({...pj(w.rules,{}),romanceVersion:ROMANCE_POLICY.version}),w.world_id);}})();
 return {worlds:pending.length,backup};
}
