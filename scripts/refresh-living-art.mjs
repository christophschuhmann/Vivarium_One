// Explicit, reversible artwork-only repair. No clocks, biographies or life events
// change. Run against a backup first; --apply is required to write anything.
import {db,pj} from '../server/db.js';
import {characterCandidates,catalogEntry,neutralAsset} from '../server/living/asset-catalog.js';
import {assignNeighborhoodArtwork} from '../server/living/bennington.js';
import {rng} from '../server/living/random.js';
const worldId=process.argv.find(a=>a.startsWith('--world='))?.slice(8);
if(!worldId)throw new Error('Usage: node --env-file=.env scripts/refresh-living-art.mjs --world=ID [--apply]');
if(!db.prepare("SELECT 1 FROM worlds WHERE id=? AND simulation_mode='living'").get(worldId))throw new Error('Living world not found.');
const changes=[];
for(const p of db.prepare('SELECT id,age,gender,asset_id,profile FROM lw_sims WHERE world_id=?').all(worldId)){
 const profile=pj(p.profile,{}),old=catalogEntry(p.asset_id);if(!old||profile.artwork?.manual)continue;
 const candidates=characterCandidates({age:p.age,gender:p.gender,heritage:old.ethnicity});if(!candidates.length)continue;
 // Preserve a suitable face; replace only a too-young/old automatic casting or
 // a job-outfit row chosen by the old truncated catalog query.
 const same=candidates.find(a=>a.identityId===old.identity_id),picked=same||candidates[Math.floor(rng(profile.seed_key+':age-portrait')()*candidates.length)];
 const id=neutralAsset(picked.id);if(id===p.asset_id)continue;
 changes.push({kind:'sim',id:p.id,previous:p.asset_id,next:id,age:p.age,imageAge:picked.imageAge});
}
const places=db.prepare("SELECT * FROM lw_places WHERE world_id=? AND kind='neighborhood' ORDER BY rowid").all(worldId),before=new Map(places.map(p=>[p.id,p.asset_id]));
assignNeighborhoodArtwork(places);
for(const p of places)if(p.asset_id!==before.get(p.id))changes.push({kind:'place',id:p.id,name:p.name,previous:before.get(p.id),next:p.asset_id});
if(process.argv.includes('--apply'))db.transaction(()=>{
 if(db.prepare("SELECT 1 FROM living_turbo_jobs WHERE world_id=? AND status IN ('running','cancelling')").get(worldId))throw new Error('Stop Turbo before repairing artwork.');
 for(const c of changes)db.prepare(`UPDATE ${c.kind==='sim'?'lw_sims':'lw_places'} SET asset_id=? WHERE world_id=? AND id=? AND asset_id=?`).run(c.next,worldId,c.id,c.previous);
})();
console.log(JSON.stringify({worldId,applied:process.argv.includes('--apply'),simChanges:changes.filter(c=>c.kind==='sim').length,placeChanges:changes.filter(c=>c.kind==='place').length,changes},null,2));
db.close();
