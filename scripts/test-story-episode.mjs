import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {storyEpisode} from '../server/living/story-episode.js';
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'viv-story-episode-'));
process.env.VIV_DATA_DIR=scratch;process.env.VIV_SECRET='test-story-episode';
const {db}=await import('../server/living/schema.js');
const {createTown,advanceTown,loadTown,busy}=await import('../server/living/engine.js');
const {closeOpenSims}=await import('../server/living/open_sims.js');
const {withPrincipal,encryptSecret}=await import('../server/byok.js');
const stamp=new Date().toISOString();
db.prepare('INSERT INTO users(id,email,display_name,email_verified_at,created_at,hypr_key,or_enabled) VALUES (?,?,?,?,?,?,1)').run('episode','episode@test.local','Episode',stamp,stamp,encryptSecret('test-fixture'));
const user=db.prepare('SELECT * FROM users WHERE id=?').get('episode');
const tick=(id,opts)=>withPrincipal(user,()=>advanceTown(user,id,opts));
const answer=ctx=>({content:JSON.stringify({story:'The hour unfolds through real changes and encounters.',thoughts:ctx.requiredThoughtSimIds.map(id=>({simId:id,eventId:ctx.events.find(e=>e.participants.includes(id)).id,text:'I consider the things I actually experienced during this interval.',confidence:.6})),reflections:[],narration:[],revisions:[],intentions:[]})});
try{
 const {worldId}=await createTown(user,{population:50,seed:73}),initial=loadTown(worldId),anchor=initial.people[0];
 db.prepare('UPDATE lw_sims SET anchored=0 WHERE world_id=?').run(worldId);db.prepare('UPDATE lw_sims SET anchored=1 WHERE id=?').run(anchor.id);
 // A field larger than the old 24-Sim batch must still be a single episode.
 for(const p of initial.people.slice(1))db.prepare('INSERT OR REPLACE INTO lw_relations VALUES (?,?,?,?)').run(worldId,anchor.id,p.id,JSON.stringify({kind:'acquaintance',closeness:.1,trust:.2}));
 let count=0,context;
 const result=await tick(worldId,{minutes:60,story:true,intervention:{kind:'event',targetId:anchor.id,text:'A sudden power outage interrupts this morning.'},modelCall:async messages=>{
  count++;context=JSON.parse(messages[1].content);assert.equal(context.end-context.start,3600);
  assert.equal(context.owned.length,50);assert.equal(context.focusSimIds.length,24);assert.equal(context.supportingSims.length,26);
  assert(context.focusSimIds.includes(anchor.id));assert(context.events.some(e=>e.type==='intervention'&&e.start===initial.world.seconds));
  assert(context.events.some(e=>e.end>initial.world.seconds+1800));
  assert.equal(loadTown(worldId).world.seconds,initial.world.seconds,'all draft minute decisions precede one atomic commit');
  return answer(context);
 }});
 assert.equal(count,1);assert.equal(result.metrics.modelCalls,1);assert.equal(result.metrics.biographyCalls,0);assert.equal(result.metrics.chunks,1);
 assert.equal(loadTown(worldId).world.seconds,initial.world.seconds+3600);
 assert.equal(db.prepare("SELECT count(*) n FROM lw_events WHERE world_id=? AND type='intervention'").get(worldId).n,1);
 for(const id of context.owned)assert(db.prepare('SELECT count(*) n FROM lw_journal j JOIN lw_events e ON e.id=j.event_id WHERE j.sim_id=? AND e.start>=?').get(id,initial.world.seconds).n>0,'background Sims retain their real personal event log');
 console.log('PASS one full-hour narrative call for a 50-Sim field; minute events, intervention, focal thoughts and supporting journals retained');
 const clock=loadTown(worldId).world.seconds,version=loadTown(worldId).world.version,events=db.prepare('SELECT count(*) n FROM lw_events').get().n;
 await assert.rejects(tick(worldId,{minutes:60,story:true,modelCall:async()=>{throw Error('episode provider failure');}}),/episode provider failure/);
 assert.equal(loadTown(worldId).world.seconds,clock);assert.equal(loadTown(worldId).world.version,version);assert.equal(db.prepare('SELECT count(*) n FROM lw_events').get().n,events);assert(!busy.has(worldId));
 const controller=new AbortController();await assert.rejects(tick(worldId,{minutes:60,story:true,signal:controller.signal,modelCall:async messages=>{controller.abort();return answer(JSON.parse(messages[1].content));}}),/cancelled/i);
 assert.equal(loadTown(worldId).world.seconds,clock);assert.equal(db.prepare('SELECT count(*) n FROM lw_events').get().n,events);assert(!busy.has(worldId));
 console.log('PASS failure/cancellation after the hour draft leaves clock, version and event ledger unchanged');
 // Pure projection audit: early, middle and late events survive; unabridged
 // originals, private boundaries and interrupted-task causes are not mutated.
 const p={id:'a',name:'A',age:40,anchored:1,profile:{job:'researcher'},state:{needs:{},thought:'Private thought'}},town={byId:new Map([['a',p]])},field={members:['a'],reasons:{a:['character_anchor']}};
 const source=Array.from({length:60},(_,i)=>({id:'e'+i,start:i*60,end:i*60,type:i===30?'action_interrupted':'action_completed',participants:['a'],description:'Recorded activity '+i,facts:{action:'research',private:true,participantAges:{a:40},causeEventId:i===30?'visitor':undefined,personalExperiences:{a:{interpretation:'private'}}}}));
 const original=JSON.stringify(source),episode=storyEpisode(field,town,source,{start:0,end:3600});
 assert.equal(JSON.stringify(source),original);assert(episode.events.some(e=>e.end<600));assert(episode.events.some(e=>e.end>3000));assert.equal(episode.events.find(e=>e.id==='e30').facts.causeEventId,'visitor');assert(episode.events.every(e=>e.facts.private&&e.facts.participantAges.a===40));
 const topic=storyEpisode(field,town,[{...source[0],type:'social',description:'A and B exchange a compliment. Conversation topic: Ending an agreement.',facts:{category:'compliment',outcome:'accepted',catalog:{title:'Ending an agreement',primitive:'compliment',actualOutcome:'accepted',selectedAs:'introduced_conversation_topic_not_proof_of_catalog_trigger'}}}],{start:0,end:3600}).events[0];assert.equal(topic.facts.category,'compliment');assert(!JSON.stringify(topic).includes('Ending an agreement'));assert.match(topic.facts.conversationTopic.role,/not proof/);assert.equal(topic.facts.conversationTopic.actualInteraction,'compliment');
 console.log('PASS chronological prompt coverage, interruption causes, privacy and source immutability');
}finally{closeOpenSims();db.close();fs.rmSync(scratch,{recursive:true,force:true});}
