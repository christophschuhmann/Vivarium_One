import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.VIV_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'viv-minute-'));
const {db}=await import('../server/living/schema.js');
const {createTown,advanceTown,loadTown}=await import('../server/living/engine.js');
const {advanceTask,pauseTask,resumeTask}=await import('../server/living/tasks.js');
const {actionBias}=await import('../server/living/action-bias.js');
const {openSims,closeOpenSims}=await import('../server/living/open_sims.js');
const user={id:'minute-test'};db.prepare('INSERT INTO users(id,email,display_name,created_at) VALUES (?,?,?,?)').run(user.id,'minute@local','Minute test',new Date().toISOString());
try{
 const {worldId}=await createTown(user,{population:10,seed:73,scenario:'bennington'});const town=loadTown(worldId),p=town.people.find(p=>p.age>=18&&p.age<65);
 assert.ok(p);assert.ok(p.biography.includes('years old'));
 const seen=[],emit=(type,person,time,facts)=>{const e={id:'e'+seen.length,type,end:time,participants:[person.id],facts};seen.push(e);return e;};
 p.state.action={kind:'read',started:0,until:600};advanceTask(p,60);advanceTask(p,120);assert.equal(p.state.action.progressSeconds,120);
 pauseTask(p,120,emit,{reason:'Bob asks for help',bySimId:'bob'});assert.equal(p.state.action,null);assert.equal(p.state.pausedTasks[0].progressSeconds,120);
 assert.ok(resumeTask(p,'read',420,emit));assert.equal(p.state.action.until,900);advanceTask(p,480);assert.equal(p.state.action.progressSeconds,180);assert.equal(seen[0].facts.bySimId,'bob');assert.equal(seen[1].type,'action_resumed');
 const actor={psychology:p.state.psychology,preferences:p.profile.preferences};const kinds=['work','read','stroll','creative_hobby','relax','eat','garden'];const original=await openSims('bias',{people:[actor],kinds,now:27000});for(const kind of kinds)assert.ok(Math.abs(actionBias(p,kind,27000)-original[0][kind])<.00011,kind+' preserves OpenSims bias');
 const r=await advanceTown(user,worldId,{minutes:60,story:false});assert.equal(r.completedMinutes,60);assert.equal(loadTown(worldId).world.seconds,30600);
 assert.equal(db.prepare("SELECT count(*) n FROM lw_events WHERE world_id=? AND type='status'").get(worldId).n,0,'No empty per-Sim minute status journal');
 const events=db.prepare("SELECT * FROM lw_events WHERE world_id=? AND type NOT LIKE 'initialization%' ").all(worldId);
 for(const e of events)for(const id of JSON.parse(e.participants))assert.ok(db.prepare('SELECT 1 FROM lw_journal WHERE sim_id=? AND event_id=?').get(id,e.id),'Every participant remembers '+e.type);
 assert.ok(events.some(e=>JSON.parse(e.facts).personalExperiences),'Personal state at event time is preserved');
 const controller=new AbortController();await assert.rejects(advanceTown(user,worldId,{minutes:120,story:false,signal:controller.signal,onProgress:x=>{if(x.phase==='advance')controller.abort();}}),e=>e.completedMinutes===60&&/completed and saved/.test(e.message));assert.equal(loadTown(worldId).world.seconds,34200);
 // Regression: a store fridge does not supply drinking water. Severe thirst
 // must route to an actual sink rather than restarting work beside the fridge.
 const t=loadTown(worldId),worker=t.byId.get(p.id),store=[...t.places.values()].find(x=>x.kind==='room'&&x.affordances.includes('fridge')&&!x.affordances.some(a=>['sink','fountain','cafe_counter'].includes(a)));
 assert.ok(store);worker.profile.workplace_id=store.id;worker.state.location_id=store.id;worker.state.route=null;worker.state.goal=null;worker.state.needs.thirst=.98;worker.state.needs.hunger=.83;worker.state.needs.bladder=.1;worker.state.needs.fun=.1;worker.state.needs.comfort=.1;worker.state.action={kind:'work',started:t.world.seconds,until:t.world.seconds+3600};
 db.prepare('UPDATE lw_sims SET state=?,profile=?,location_id=? WHERE id=?').run(JSON.stringify(worker.state),JSON.stringify(worker.profile),store.id,p.id);
 await advanceTown(user,worldId,{minutes:10,story:false});assert.ok(loadTown(worldId).byId.get(p.id).state.needs.thirst<.3,'Drink actual water before resuming work');
 // Arrival for an ordinary meal must use the SAME threshold as routing.
 // Previously .65 routed to the kitchen but .80 was needed to select food,
 // so a scheduled class/work shift could interrupt a restarted chore each minute.
 const mealTown=loadTown(worldId),hungry=mealTown.byId.get(p.id),mealAt=mealTown.world.seconds;
 for(const key of Object.keys(hungry.state.needs))hungry.state.needs[key]=.1;
 hungry.state.needs.hunger=.69;hungry.state.location_id=hungry.profile.home.kitchen;hungry.state.route=null;hungry.state.goal=null;hungry.state.socialUntil=null;hungry.state.conversation=null;hungry.state.last_social=mealAt;
 hungry.state.action={kind:'work',started:mealAt,until:mealAt+3600};
 db.prepare('UPDATE lw_sims SET state=?,location_id=? WHERE id=?').run(JSON.stringify(hungry.state),hungry.state.location_id,p.id);
 await advanceTown(user,worldId,{minutes:10,story:false});
 const mealEvents=db.prepare("SELECT type,facts FROM lw_events WHERE world_id=? AND start>? AND participants LIKE ?").all(worldId,mealAt,'%'+p.id+'%');
 assert.ok(mealEvents.some(e=>e.type==='action_started'&&JSON.parse(e.facts).action==='eat'),'Moderate hunger selects a real meal on arrival');
 assert.ok(mealEvents.filter(e=>e.type==='action_interrupted').length<=1,'No work/meal restart loop');
 const stats={events:events.length,journals:db.prepare('SELECT count(*) n FROM lw_journal').get().n,verified:['urgent physical need routes to the matching object','retained progress','interruption cause','resumption','OpenSims bias parity','minute event memories','no empty status spam','partial advance cancellation']};fs.mkdirSync('artifacts/expanded-world',{recursive:true});fs.writeFileSync('artifacts/expanded-world/minute-engine-review.json',JSON.stringify(stats,null,2));console.log('PASS',stats);
}finally{closeOpenSims();db.close();fs.rmSync(process.env.VIV_DATA_DIR,{recursive:true,force:true});}
