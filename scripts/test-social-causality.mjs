// Behavioral regressions discovered by reviewing complete multi-day journals.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.VIV_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'viv-causal-'));
const {db}=await import('../server/living/schema.js');
const {createTown,loadTown}=await import('../server/living/engine.js');
const {growRomanticNeed}=await import('../server/living/romance.js');
const {applySocialDynamics,socialMotivations}=await import('../server/living/social-dynamics.js');
const {completedSocial}=await import('../server/living/cognition.js');
const {encounterContext,socialEpisodeEligible}=await import('../server/living/expanded/tom.js');
const {SOCIAL_CATALOG}=await import('../server/living/expanded/catalog.js');
const {economicDraft}=await import('../server/living/expanded/economy.js');
const {openSims,closeOpenSims}=await import('../server/living/open_sims.js');
const user={id:'causal-audit'};db.prepare('INSERT INTO users(id,email,display_name,created_at) VALUES (?,?,?,?)').run(user.id,'causal@local','Audit',new Date().toISOString());
try{
 const {worldId}=await createTown(user,{population:100,seed:73,scenario:'bennington'}),town=loadTown(worldId),d=economicDraft(town);
 const adults=town.people.filter(p=>p.age>=18);
 for(const p of town.people){for(let i=0;i<4320;i++)growRomanticNeed(p);assert.ok(p.state.needs.romantic_affection<.9);if(p.age<14)assert.equal(p.state.needs.romantic_affection,0);if(p.age<18)assert.ok(p.state.needs.romantic_affection<=.35);}
 const values=adults.map(p=>p.state.needs.romantic_affection);assert.ok(Math.max(...values)-Math.min(...values)>.25,'Individual desire remains varied over three days');
 const a=adults[0],b=adults[1];let seq=0;
 const event=category=>({id:'audit-'+seq++,end:30000+seq*60,participants:[a.id,b.id],facts:{category,outcome:'accepted'},description:'A real exchange.'});
 a.state.needs.social=.5;b.state.needs.social=.5;
 const conflict=event('argue');applySocialDynamics(town,conflict);completedSocial(a,conflict,conflict.end);
 assert.ok(a.state.needs.social>.5,'Argument does not satisfy social warmth');assert.ok(conflict.facts.wellbeingEffects[a.id].R<0);
 assert.ok(a.state.socialDynamics.unresolved[b.id]?.sourceEventId===conflict.id,'Hurt references its real event');
 assert.ok(socialMotivations(a,b,d).unresolvedStrain>0,'Remembered conflict affects the next choice');
 const strain=a.state.socialDynamics.unresolved[b.id].severity;applySocialDynamics(town,event('greet'));assert.equal(a.state.socialDynamics.unresolved[b.id].severity,strain,'Greeting cannot erase specific hurt');
 applySocialDynamics(town,event('reconcile'));assert.ok(a.state.socialDynamics.unresolved[b.id].severity<strain,'Accepted repair eases strain gradually');
 const boundary=event('set_boundary'),before=a.state.needs.social;completedSocial(a,boundary,boundary.end);assert.equal(a.state.needs.social,before,'Boundary is neither hostility nor automatic affection');
 const rejected=event('ask_date');rejected.facts.outcome='declined';const beforeReject=JSON.stringify(a.state.socialDynamics.unresolved);applySocialDynamics(town,rejected);assert.equal(JSON.stringify(a.state.socialDynamics.unresolved),beforeReject,'Refusal creates no misconduct thread');
 const hurt=event('share_news');hurt.facts.responseStyle={style:'active_destructive',responderId:b.id};const prior=a.state.needs.social;completedSocial(a,hurt,hurt.end);assert.ok(a.state.needs.social>prior);assert.ok(hurt.facts.wellbeingEffects[a.id].R<0,'Dismissive response cannot be a PERMA relationship reward');
 const child=town.people.find(p=>p.age>=3&&p.age<6),parent=town.byId.get(child.profile.family.parent_ids[0]);
 const atHome={id:'family',participants:[child.id,parent.id],end:32000,location_id:child.profile.home.living,facts:{category:'ask_help',outcome:'accepted'}};
 assert.equal(encounterContext(child,parent,town,atHome).topic,'family');
 for(const row of SOCIAL_CATALOG.filter(r=>/Erwachsene Kinder|Senioren,/.test(r.context)))assert.equal(socialEpisodeEligible(row,child,parent,town,atHome,d),false,'Child cannot get adult retirement topic');
 const peer=town.people.find(p=>p.age>=3&&p.age<6&&p.id!==child.id),actor=p=>({...p,family:p.profile.family,workplace_id:p.profile.workplace_id,psychology:p.state.psychology,needs:p.state.needs,affect:p.state.affect});
 const result=await openSims('social',{now:32000,pairs:[{a:actor(child),b:actor(peer),category:'coordinate_work',seed:73,eventId:'preschool-work'}]});assert.equal(result[0].allowed,false,'A shared preschool is not an adult workplace');
 const {put}=await import('../server/living/expanded/store.js');
 const {householdOf}=await import('../server/living/expanded/economy.js');
 const {expandedActionAllowed,completedExpandedAction}=await import('../server/living/expanded/life.js');
 const h=householdOf(d,a);h.payload.taskState||={};h.payload.taskState.laundry=0;
 a.state.location_id=a.profile.home.living;
 const stale=put(d,'obligation',{catalogId:'A016',assigneeId:a.id,status:'accepted',destinationId:a.state.location_id,operator:'laundry'});
 a.state.economy.activeObligationId=stale.id;
 assert.equal(expandedActionAllowed(d,a,'leisure_expanded_obligation',32000),false,'Already cleared laundry cannot restart as an active task');
 const failure=event('small_talk');failure.facts.action='leisure_expanded_obligation';assert.equal(completedExpandedAction(d,a,failure,900,32000).failed,true);assert.equal(stale.payload.status,'needs_resources');assert.ok(failure.facts.failure);assert.equal(a.state.economy.activeObligationId,undefined);
 const baths=[...town.places.values()].filter(p=>/_expanded_(carehome|shelter)_bath$/.test(p.id));assert.equal(baths.length,2);for(const bath of baths)assert.ok(bath.affordances.includes('shower'),'Residential care and shelter must allow washing');
 console.log('PASS three-day desire variation and all age caps; conflict/repair/consent causality; PERMA and warmth agree; grounded age/context topics; preschool social roles.');
}finally{closeOpenSims();db.close();fs.rmSync(process.env.VIV_DATA_DIR,{recursive:true,force:true});}
