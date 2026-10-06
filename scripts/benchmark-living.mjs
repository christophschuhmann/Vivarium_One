// Reproducible isolated CPU benchmark; no provider calls and no production database.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'living-benchmark-'));process.env.VIV_DATA_DIR=scratch;
const {db}=await import('../server/living/schema.js');const {createTown,advanceTown,loadTown}=await import('../server/living/engine.js');const {closeOpenSims}=await import('../server/living/open_sims.js');
const user={id:'benchmark'};db.prepare('INSERT INTO users(id,email,display_name,created_at) VALUES (?,?,?,?)').run(user.id,'bench@local','Benchmark',new Date().toISOString());
const report={generatedAt:new Date().toISOString(),node:process.version,mode:'procedural, 5-minute ticks and 24 simulated hours, no model latency',results:[]};
try{
 for(const population of [10,20,50,100,500]){
  const start=performance.now(),{worldId,households,locations}=await createTown(user,{population,seed:73}),createMs=performance.now()-start;
  const timings=[];for(let i=0;i<5;i++){const t=performance.now();await advanceTown(user,worldId,{minutes:5,story:false});timings.push(performance.now()-t);}
  const dayStart=performance.now(),samples=[];
  for(let hour=0;hour<24;hour++){await advanceTown(user,worldId,{minutes:60,story:false});if([0,4,8,15,23].includes(hour)){const town=loadTown(worldId);samples.push({hour:town.world.seconds/3600%24,atWorkOrSchool:town.people.filter(p=>p.state.location_id===p.profile.workplace_id).length,travelling:town.people.filter(p=>p.state.route).length,asleep:town.people.filter(p=>p.state.action?.kind==='sleep').length,atHome:town.people.filter(p=>Object.values(p.profile.home).includes(p.state.location_id)).length,criticalNeeds:town.people.filter(p=>Math.max(...Object.values(p.state.needs))>=.999).length});}}
  const town=loadTown(worldId),events=db.prepare('SELECT type,count(*) n FROM lw_events WHERE world_id=? GROUP BY type').all(worldId),social=db.prepare("SELECT json_extract(facts,'$.category') category,count(*) n FROM lw_events WHERE world_id=? AND type='social' GROUP BY category").all(worldId);
  const result={population,households,locations,createMs:Math.round(createMs),fiveMinuteMedianMs:Math.round(timings.sort((a,b)=>a-b)[2]),fiveMinuteMaxMs:Math.round(Math.max(...timings)),dayMs:Math.round(performance.now()-dayStart),rssMiB:Math.round(process.memoryUsage().rss/1024/1024),events,social,samples,careerHours:Number(town.people.reduce((n,p)=>n+(p.state.career.experience_hours || 0),0).toFixed(2)),journalEntries:db.prepare('SELECT count(*) n FROM lw_journal j JOIN lw_sims s ON s.id=j.sim_id WHERE s.world_id=?').get(worldId).n};
  db.pragma('wal_checkpoint(TRUNCATE)');result.databaseBytes=fs.statSync(path.join(scratch,'vivarium.db')).size;report.results.push(result);console.log(JSON.stringify(result));
 }
 const output=process.argv[2] || 'artifacts/living-world/benchmark.json';fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
}finally{closeOpenSims();db.close();fs.rmSync(scratch,{recursive:true,force:true});}
