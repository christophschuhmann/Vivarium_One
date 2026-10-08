// Run while the server is stopped. No clock advance, paid calls, historical
// rewrites or cash seizure. Back up the database before --apply.
import {db} from '../server/living/schema.js';
import {loadTown} from '../server/living/engine.js';
import {economicDraft,refreshOwnResources} from '../server/living/expanded/economy.js';
import {commitEconomy} from '../server/living/expanded/store.js';
import {calibrateDrama} from '../server/living/drama/engine.js';
import {refreshMemorySummaries} from '../server/living/memory-tiers.js';
import {j} from '../server/db.js';
const apply=process.argv.includes('--apply'),results=[];
try{for(const {world_id:id} of db.prepare('SELECT world_id FROM lw_worlds').all()){
 const town=loadTown(id),d=economicDraft(town);if(!d)continue;
 const before={time:town.world.seconds,balances:j(db.prepare('SELECT id,balance_cents FROM lw_economy_accounts WHERE world_id=? ORDER BY id').all(id)),events:db.prepare('SELECT count(*) n FROM lw_events WHERE world_id=?').get(id).n};
 const result=calibrateDrama(d,town.world.seconds);if(apply&&(result.people||result.households||process.argv.includes('--refresh')))db.transaction(()=>{
  commitEconomy(d);refreshOwnResources(d,town.world.seconds);for(const p of town.people)db.prepare('UPDATE lw_sims SET state=?,profile=? WHERE world_id=? AND id=?').run(j(p.state),j(p.profile),id,p.id);
  refreshMemorySummaries(id,town.world.seconds);db.prepare('UPDATE lw_worlds SET version=version+1 WHERE world_id=?').run(id);
  if(db.prepare('SELECT seconds FROM lw_worlds WHERE world_id=?').get(id).seconds!==before.time||j(db.prepare('SELECT id,balance_cents FROM lw_economy_accounts WHERE world_id=? ORDER BY id').all(id))!==before.balances||db.prepare('SELECT count(*) n FROM lw_events WHERE world_id=?').get(id).n!==before.events)throw Error('Migration must preserve clock, cash and original events.');
 })();results.push({worldId:id,...result,applied:apply});
}console.log(JSON.stringify({results,mode:apply?'applied':'preview; stop server, back up, then run with --apply'},null,2));}finally{db.close();}
