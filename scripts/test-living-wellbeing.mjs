// Isolated semantic tests: own experience, five separate pillars, causal rollback.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'living-perma-'));process.env.VIV_DATA_DIR=scratch;
const {db,j}=await import('../server/db.js');await import('../server/living/schema.js');
const {createTown,loadTown,advanceTown}=await import('../server/living/engine.js');
const {openSimsCatalog,closeOpenSims}=await import('../server/living/open_sims.js');
const {completedActivity,completedSocial,reflect,mindContext}=await import('../server/living/cognition.js');
const {projectWellbeing,activityWellbeing,socialWellbeing}=await import('../server/living/wellbeing.js');
const {upgradeAllWellbeing}=await import('../server/living/upgrade-wellbeing.js');
const {converse,clearChat}=await import('../server/living/vivarium.js');
const {buildWorldManifest,importWorldManifest}=await import('../server/world_io.js');
const user={id:'perma-test'};db.prepare('INSERT INTO users(id,email,display_name,created_at,credit_balance) VALUES (?,?,?,?,?)').run(user.id,'perma@test','PERMA',new Date().toISOString(),999999999);
const save=p=>db.prepare('UPDATE lw_sims SET state=?,location_id=? WHERE id=?').run(j(p.state),p.state.location_id,p.id);
const scores=p=>structuredClone(p.state.wellbeing.scores),event=(id,facts)=>({id,type:'test_fixture',facts,description:'Ein selbst erlebter Moment.'});
try{
 const catalog=await openSimsCatalog(),created=await createTown(user,{population:20,seed:73}),wid=created.worldId;let town=loadTown(wid);
 assert.ok(town.people.every(p=>p.state.wellbeing?.version===1&&p.state.wellbeing.evidence.length===0));
 const original=town.people.find(p=>p.age>=18&&p.profile.workplace_id),clock=town.world.seconds;
 const person=()=>{const p=structuredClone(original);p.state.affect={states:[]};p.state.needs=Object.fromEntries(Object.keys(p.state.needs).map(k=>[k,.1]));delete p.state.wellbeing;projectWellbeing(p,clock);return p;};
 const p=person(),base=scores(p);p.profile.interests=['reading'];p.state.psychology.ambitions=[{id:'hobby_test',kind:'hobby',title:'Zeit zum Lesen',progress:.1,target_seconds:144000}];
 const hobby=event('own_hobby',{action:'read'});completedActivity(p,hobby,1800,{},clock+1800);projectWellbeing(p,clock+1800);
 for(const k of ['P','E','M','A'])assert.ok(p.state.wellbeing.scores[k]>base[k],k);assert.equal(p.state.wellbeing.scores.R,base.R);assert.ok(hobby.facts.goalProgress.length);
 const evidenceCount=p.state.wellbeing.evidence.length;activityWellbeing(p,hobby,1800,.02,clock+1800);assert.equal(p.state.wellbeing.evidence.length,evidenceCount);
 const beforeLove=person(),care=event('own_care',{category:'offer_help',outcome:'accepted'});completedSocial(beforeLove,care,clock);assert.ok(beforeLove.state.wellbeing.scores.R>base.R&&beforeLove.state.wellbeing.scores.M>base.M);
 const conflict=person();completedSocial(conflict,event('own_conflict',{category:'argue',outcome:'accepted'}),clock);assert.ok(conflict.state.wellbeing.scores.R<base.R);
 const declined=person();completedSocial(declined,event('own_decline',{category:'offer_help',outcome:'declined'}),clock);assert.equal(declined.state.wellbeing.scores.R,base.R);
 // Money, a wish or an arbitrary model score is not an accomplished experience.
 const wealthy=person();wealthy.state.money=1e9;wealthy.state.wealth=1e9;projectWellbeing(wealthy,clock);assert.deepEqual(scores(wealthy),base);
 const suggestion=person();reflect(suggestion,{wellbeing:{P:1,E:1,R:1,M:1,A:1},focusGoalId:'invented',emotions:[]},event('mere_wish',{}),clock);assert.deepEqual(scores(suggestion),base);
 const response=person();reflect(response,{emotions:[{id:'hope_enthusiasm_optimism',intensity:.6}],wellbeing:{A:1,R:1}},event('own_response',{}),clock);assert.ok(response.state.wellbeing.scores.P>base.P);for(const k of ['E','R','M','A'])assert.equal(response.state.wellbeing.scores[k],base[k]);assert.ok(mindContext(response).wellbeing.recentOwnSources.length);
 const hungry=person();hungry.state.needs.hunger=.95;projectWellbeing(hungry,clock);assert.ok(hungry.state.wellbeing.scores.P<base.P);for(const k of ['E','R','M','A'])assert.equal(hungry.state.wellbeing.scores[k],base[k]);
 const capped=person();for(let i=0;i<120;i++)socialWellbeing(capped,event('support_'+i,{category:'offer_help',outcome:'accepted'}),clock);
 assert.ok(Math.abs(capped.state.wellbeing.scores.R-base.R-.08)<1e-10);const now=scores(capped);projectWellbeing(capped,clock);assert.deepEqual(scores(capped),now);projectWellbeing(capped,clock+14*86400);assert.ok(Math.abs(capped.state.wellbeing.scores.R-base.R-.04)<1e-10);
 const one=person(),two=person();for(let i=0;i<3;i++){const e=event('timing_'+i,{category:'offer_help',outcome:'accepted'});socialWellbeing(one,e,clock+i*86400);socialWellbeing(two,e,clock+i*86400);projectWellbeing(two,clock+i*86400+1000);}projectWellbeing(one,clock+3*86400);projectWellbeing(two,clock+3*86400);assert.deepEqual(scores(one),scores(two));
 for(let i=120;i<300;i++)socialWellbeing(capped,event('support_'+i,{category:'offer_help',outcome:'accepted'}),clock+14*86400);assert.equal(capped.state.wellbeing.evidence.length,128);
 // Real engine completion commits source IDs in this Sim's journal atomically.
 original.state.action={kind:'work',started:clock-catalog.actions.work.duration+60,until:clock+60};original.state.location_id=original.profile.workplace_id;original.state.route=null;original.state.needs=Object.fromEntries(Object.keys(original.state.needs).map(k=>[k,.1]));save(original);
 await advanceTown(user,wid,{minutes:1,story:false});town=loadTown(wid);let worker=town.byId.get(original.id);
 assert.ok(worker.state.wellbeing.evidence.some(e=>e.channel==='activity'));for(const sim of town.people)for(const e of sim.state.wellbeing.evidence)assert.ok(db.prepare('SELECT 1 FROM lw_journal WHERE sim_id=? AND event_id=?').get(sim.id,e.eventId));
 const chatCall=async messages=>{const context=JSON.parse(messages[1].content);assert.ok(context.wellbeing.scores&&context.wellbeing.recentOwnSources);return {content:j({reply:'Danke, das hilft mir.',thought:'Ich fühle mich etwas zuversichtlicher.',reflection:{emotions:[{id:'hope_enthusiasm_optimism',intensity:.6}],needsDelta:{social:-.04}}})};};
 const before=structuredClone(worker.state.wellbeing),seconds=town.world.seconds;
 await converse(user,wid,worker.id,{channel:'inner',message:'Wie geht es dir?',modelCall:chatCall});worker=loadTown(wid).byId.get(worker.id);assert.ok(worker.state.wellbeing.evidence.some(e=>e.channel==='reflection'));assert.equal(loadTown(wid).world.seconds,seconds);
 clearChat(wid,worker.id);worker=loadTown(wid).byId.get(worker.id);assert.deepEqual(worker.state.wellbeing,before);
 // Clearing a conversation after a later activity preserves that real activity.
 await converse(user,wid,worker.id,{channel:'inner',message:'Viel Erfolg heute.',modelCall:chatCall});worker=loadTown(wid).byId.get(worker.id);const conversationIds=worker.state.wellbeing.evidence.filter(e=>e.channel==='reflection').map(e=>e.eventId);
 worker.state.action={kind:'work',started:seconds-catalog.actions.work.duration+60,until:seconds+60};worker.state.location_id=worker.profile.workplace_id;worker.state.route=null;save(worker);await advanceTown(user,wid,{minutes:1,story:false});
 const workSources=loadTown(wid).byId.get(worker.id).state.wellbeing.evidence.filter(e=>e.channel==='activity').map(e=>e.eventId);clearChat(wid,worker.id);worker=loadTown(wid).byId.get(worker.id);assert.deepEqual(worker.state.wellbeing.evidence.filter(e=>e.channel==='activity').map(e=>e.eventId),workSources);assert.ok(worker.state.wellbeing.evidence.every(e=>!conversationIds.includes(e.eventId)));
 // Snapshot duplication remaps all retained own source IDs, not only scores.
 const copied=importWorldManifest(user,buildWorldManifest(wid),null),copy=loadTown(copied.worldId);for(const sim of copy.people)for(const e of sim.state.wellbeing.evidence){assert.ok(db.prepare('SELECT 1 FROM lw_journal WHERE sim_id=? AND event_id=?').get(sim.id,e.eventId));assert.ok(!town.people.some(old=>old.state.wellbeing.evidence.some(source=>source.eventId===e.eventId)));}
 // Legacy upgrade creates no historical happiness and preserves every fact/clock.
 const legacy=await createTown(user,{population:10,seed:456}),legacyId=legacy.worldId;db.prepare("UPDATE lw_worlds SET rules=json_remove(rules,'$.wellbeingVersion') WHERE world_id=?").run(legacyId);db.prepare("UPDATE lw_sims SET state=json_remove(state,'$.wellbeing') WHERE world_id=?").run(legacyId);
 const factsBefore=db.prepare('SELECT * FROM lw_events WHERE world_id=? ORDER BY rowid').all(legacyId),physical=loadTown(legacyId).people.map(s=>[s.id,s.state.needs,s.state.location_id,s.biography,s.state.psychology]);const legacyClock=loadTown(legacyId).world.seconds;
 const upgraded=await upgradeAllWellbeing();assert.equal(upgraded.worlds,1);assert.ok(fs.existsSync(upgraded.backup));const after=loadTown(legacyId);assert.equal(after.world.seconds,legacyClock);assert.deepEqual(after.people.map(s=>[s.id,s.state.needs,s.state.location_id,s.biography,s.state.psychology]),physical);assert.deepEqual(db.prepare('SELECT * FROM lw_events WHERE world_id=? ORDER BY rowid').all(legacyId),factsBefore);assert.ok(after.people.every(s=>s.state.wellbeing.evidence.length===0));assert.equal((await upgradeAllWellbeing()).worlds,0);
 console.log('PASS PERMA: own actual activities/goal steps/contact; separate pillars; no money or invented-model-score bonus; mood/need pressure, daily caps, decay, bounded memory; journal-linked atomic engine effects; paused conversations and selective rollback; source-preserving snapshot remap; backed-up idempotent legacy migration.');
}finally{closeOpenSims();db.close();fs.rmSync(scratch,{recursive:true,force:true});}
