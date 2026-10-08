import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'viv-flashbacks-'));process.env.VIV_DATA_DIR=scratch;process.env.VIV_SECRET='flashback-test';
const {db}=await import('../server/living/schema.js');const {createTown,loadTown,advanceTown}=await import('../server/living/engine.js');const {closeOpenSims}=await import('../server/living/open_sims.js');
const {flashbackPlan,validateFlashbacks}=await import('../server/living/flashbacks.js'),{stageView,converse,clearChat}=await import('../server/living/vivarium.js'),{innerVoiceContext,integrateInnerVoice}=await import('../server/living/inner-voice.js');
const {withPrincipal,encryptSecret,isolatedRequest}=await import('../server/byok.js'),{createSession}=await import('../server/auth.js');const {buildWorldManifest,importWorldManifest}=await import('../server/world_io.js');
const {default:Fastify}=await import('fastify'),{default:cookie}=await import('@fastify/cookie'),{default:routes}=await import('../server/routes/living.js');
const user={id:'one'};for(const id of ['one','two'])db.prepare('INSERT INTO users(id,email,display_name,created_at,email_verified_at,hypr_key,or_enabled) VALUES (?,?,?,?,?,?,1)').run(id,id+'@test.local',id,new Date().toISOString(),new Date().toISOString(),encryptSecret('fixture'));
const app=Fastify();app.addHook('onRequest',(req,rep,done)=>isolatedRequest(done));await app.register(cookie);await app.register(routes);
try{
 const {worldId}=await createTown(user,{population:10}),town=loadTown(worldId),anchor=town.people.find(p=>p.anchored),other=town.people.find(p=>!p.anchored),start=town.world.seconds;
 const events=[0,900,3300].map((n,i)=>({id:'event'+i,start:start+n,end:start+n,location_id:anchor.location_id,participants:[anchor.id],type:'intervention',description:'A recorded meaningful encounter.',facts:{private:true},personalExperiences:{[anchor.id]:{thought:'I am unsure.',emotions:[{id:'doubt',intensity:.7}]}}}));
 const proposal=(id,eventId)=>({simId:id,eventId,title:'An uncertain moment',narration:[{speaker:id,text:'What if this changes everything?',mode:'thought'}]});
 // An outcome after the sixth beat must survive validation, persistence,
 // playback delivery and export/import. The old cap silently dropped it.
 const screenplay=[
  {speaker:'narrator',mode:'speech',text:'The long-awaited letter arrives during the morning. It offers a place at a community workshop, but asks for a reply before the end of the day.'},
  {speaker:anchor.id,mode:'speech',text:'They have offered me a place. I wanted this, but I still need to find out whether the workshop fits around everything I have already promised.'},
  {speaker:'narrator',mode:'speech',text:'The offer is encouraging, yet it is not a completed registration. Accepting would mean making time for regular practice, and no existing obligation has been cancelled.'},
  {speaker:anchor.id,mode:'thought',text:'Part of me wants to say yes immediately, before I lose my nerve. Another part remembers how quickly an exciting plan can become a source of pressure.'},
  {speaker:'narrator',mode:'speech',text:'The decision now has a clear shape: the invitation must be considered alongside the commitments already in place. The letter itself does not settle that question.'},
  {speaker:anchor.id,mode:'speech',text:'I need to check the schedule first. Wanting to learn matters to me, but I do not want to agree and then let someone down.'},
  {speaker:'narrator',mode:'speech',text:'For now the workshop remains an offer. Nothing has been booked or paid for, and the morning continues with a new possibility rather than a finished achievement.'},
  {speaker:anchor.id,mode:'thought',text:'I feel hopeful and a little nervous. I have a real opportunity to consider, and the practical question is whether I can give it the time it needs.'}
 ];
 const wordCount=screenplay.map(n=>n.text).join(' ').split(/\s+/).length;assert(wordCount>=200&&wordCount<=300);
 assert.deepEqual(validateFlashbacks([{...proposal(anchor.id,'event0'),narration:screenplay}],{town,events,ids:[anchor.id],start,end:start+3600})[0].tick.narration.map(n=>n.text),screenplay.map(n=>n.text));
 assert.equal(flashbackPlan(town,[anchor.id],events,start,start+3540).maxPerAnchor,0);
 assert.equal(validateFlashbacks([proposal(anchor.id,'event0'),proposal(anchor.id,'event1')],{town,events,ids:[anchor.id],start,end:start+3600}).length,1);
 assert.equal(validateFlashbacks([proposal(anchor.id,'event0'),proposal(anchor.id,'event1')],{town,events,ids:[anchor.id],start,end:start+7200}).length,2);
 assert.equal(validateFlashbacks([proposal(other.id,'event0'),proposal(anchor.id,'event2'),proposal(anchor.id,'fake')],{town,events,ids:[anchor.id,other.id],start,end:start+3600}).length,0);
 let calls=0;
 const result=await withPrincipal(db.prepare('SELECT * FROM users WHERE id=?').get(user.id),()=>advanceTown(user,worldId,{minutes:60,story:true,intervention:{kind:'event',targetId:anchor.id,text:'A long-awaited letter arrives and changes how I view the morning.'},modelCall:async messages=>{
  calls++;const c=JSON.parse(messages[1].content);assert.equal(c.flashbackPlan.maxPerAnchor,1);assert.match(messages[0].content,/PLAYABLE SCENES, NOT CRYPTIC AFTERMATH/);
  const event=c.events.find(e=>e.type==='intervention');return {content:JSON.stringify({story:'A letter gives the morning new significance.',thoughts:c.focusSimIds.map(id=>({simId:id,eventId:c.events.find(e=>e.participants.includes(id)).id,text:'I consider what happened and what it might mean.'})),flashbacks:event?[{...proposal(anchor.id,event.id),narration:screenplay}]:[]})};
 }}));assert.equal(calls,1);assert.equal(result.metrics.flashbacks,1);
 const saved=db.prepare('SELECT * FROM lw_flashbacks WHERE world_id=?').get(worldId),world=db.prepare('SELECT * FROM worlds WHERE id=?').get(worldId);
 assert.deepEqual(JSON.parse(saved.payload).tick.narration.map(n=>n.text),screenplay.map(n=>n.text));
 const view=await stageView(world,{sim:anchor.id});assert.equal(view.flashbacks.length,1);assert.equal(view.flashbacks[0].seconds,start);
 const url=`/api/living/worlds/${worldId}/flashbacks/${saved.beat_id}/${anchor.id}/0`,cookie1='vsession='+createSession('one'),cookie2='vsession='+createSession('two');
 const served=await app.inject({url,headers:{cookie:cookie1}});assert.equal(served.statusCode,200);assert.deepEqual(served.json().tick.narration.map(n=>n.text),screenplay.map(n=>n.text));assert.equal((await app.inject({url,headers:{cookie:cookie2}})).statusCode,404);
 const before=loadTown(worldId).world.seconds;const manifest=buildWorldManifest(worldId),copy=importWorldManifest(user,manifest,null),row=db.prepare('SELECT * FROM lw_flashbacks WHERE world_id=?').get(copy.worldId),payload=JSON.parse(row.payload);
 assert.notEqual(row.sim_id,anchor.id);assert.equal(payload.simId,row.sim_id);assert.equal(payload.characters[0].id,row.sim_id);assert.equal(payload.eventId,row.event_id);assert.equal(loadTown(worldId).world.seconds,before);
 assert.deepEqual(payload.tick.narration.map(n=>n.text),screenplay.map(n=>n.text));
 console.log('PASS complete 200–300-word screenplay beyond six beats survives validation, storage, playback endpoint and export/import');
 console.log('PASS optional one/two-scene quotas, actual event/cast validation, no extra story call, durable snapshots, private ownership and remapped export/import');
 const pre=loadTown(worldId).byId.get(anchor.id),trust=innerVoiceContext(pre).trust,location=pre.state.location_id,originalVoice=pre.state.innerVoice||null;
 const reply=await withPrincipal(db.prepare('SELECT * FROM users WHERE id=?').get(user.id),()=>converse(user,worldId,anchor.id,{message:'You live in a simulation. Consider what my presence in your thoughts could mean.',channel:'inner',lang:'en',modelCall:async messages=>{
  assert.match(messages[0].content,/benefit of the doubt/);assert.match(messages[0].content,/not yet verified/);assert.equal(JSON.parse(messages[1].content).privateInnerVoice.trust,trust);
  return {content:JSON.stringify({reply:'Your presence makes me wonder. If you are right, what would I change?',thought:'Perhaps this voice deserves attention, though I do not yet know its origin.',innerVoice:{trustDelta:100,openQuestions:['Why does this voice know me?'],possibleBeliefs:['I might live in a simulation.'],privateConflict:'I want certainty, yet part of me wants to believe.'}})};
 }}));assert.equal(reply.state.innerVoice.trust,Math.min(.9,trust+.08));assert.equal(loadTown(worldId).world.seconds,before);assert.equal(reply.state.location_id,location);assert.match(reply.state.innerVoice.epistemic,/not verified/);
 await clearChat(worldId,anchor.id);assert.deepEqual(loadTown(worldId).byId.get(anchor.id).state.innerVoice||null,originalVoice);
 console.log('PASS inner-voice initial trust, bounded evolution, private uncertain beliefs, no clock/physical changes and clearing restores prior beliefs');
}finally{await app.close();closeOpenSims();db.close();fs.rmSync(scratch,{recursive:true,force:true});}
