import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'vivarium-biography-'));process.env.VIV_DATA_DIR=scratch;process.env.VIV_SECRET='isolated-biography-regression-secret';process.env.MOCK_PROVIDERS='0';
const {db}=await import('../server/living/schema.js'),{encryptSecret,withPrincipal}=await import('../server/byok.js');
const {createTown,loadTown,authorBiographies,advanceTown,busy}=await import('../server/living/engine.js');
const {converse}=await import('../server/living/vivarium.js'),{closeOpenSims}=await import('../server/living/open_sims.js');
const {relationshipLabels}=await import('../server/living/relationship-labels.js');
const stamp=new Date().toISOString();db.prepare('INSERT INTO users(id,email,display_name,email_verified_at,created_at,hypr_key,or_enabled) VALUES (?,?,?,?,?,?,1)').run('test','test@local.test','Test',stamp,stamp,encryptSecret('fake-provider-key'));
const user=db.prepare('SELECT * FROM users WHERE id=?').get('test');let behavior='partial',bioCalls=0,storyFails=false,invalidId;
const realFetch=globalThis.fetch,reply=content=>Response.json({choices:[{message:{content:typeof content==='string'?content:JSON.stringify(content)}}],usage:{prompt_tokens:100,completion_tokens:100}});
globalThis.fetch=async(url,options)=>{
 assert.equal(new URL(url).hostname,'api.hyprlab.io');const messages=JSON.parse(options.body).messages,system=messages[0].content,ctx=JSON.parse(messages.at(-1).content);
 if(system.includes('fictional biographies')){
  bioCalls++;
  if(behavior==='blocked')return Response.json({error:{message:'This model does not support biographies'}},{status:400});
  if(behavior==='cancel'){await new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));}
  if(behavior==='invalid')return reply({biographies:ctx.people.slice(0,1).map(p=>({id:invalidId,text:p.existing}))});
  if(behavior==='broken')return reply('{"biographies":[');
  return reply({biographies:(behavior==='partial'&&bioCalls===1?ctx.people.slice(0,1):ctx.people).map(p=>({id:p.id,text:p.existing+' Ein sorgfältig ausgearbeiteter Hintergrund mit nachvollziehbaren Wünschen und vertrauten Beziehungen.'}))});
 }
 if(system.includes('Living World Storyteller')){if(storyFails)return Response.json({error:{message:'Story service unavailable'}},{status:503});return reply({story:'Ein ruhiger Morgen.',thoughts:ctx.owned.map(id=>({simId:id,eventId:ctx.events.find(e=>e.participants.includes(id)).id,text:'Ich überlege, was mir heute wichtig ist.',confidence:.7})),reflections:[],narration:[]});}
 return reply({reply:'Ich möchte einen ruhigen Moment haben.',thought:'Ich fühle mich gehört.',mood:'hopeful'});
};
const tick=(id,opts)=>withPrincipal(user,()=>advanceTown(user,id,opts));
try{
 const {worldId}=await createTown(user,{population:10}),people=loadTown(worldId).people.slice(0,2),originals=people.map(p=>p.biography);
 const result=await authorBiographies(user,people);assert.equal(result.calls,2);assert.equal(bioCalls,2);assert.ok(people.every(p=>p.biography_mode==='written'&&p.biography.length>100));
 // Missing entries never partially change the supplied batch.
 const batch=loadTown(worldId).people.slice(0,2);behavior='invalid';invalidId=batch[0].id;await assert.rejects(authorBiographies(user,batch),e=>e.code==='BIOGRAPHY_RESPONSE_INVALID');assert.deepEqual(batch.map(p=>p.biography),originals);assert.ok(batch.every(p=>p.biography_mode==='written_pending'));
 behavior='broken';await assert.rejects(authorBiographies(user,batch),e=>e.code==='BIOGRAPHY_RESPONSE_INVALID');assert.deepEqual(batch.map(p=>p.biography),originals);
 // Reproduce the reported error while chat and the Storyteller remain available.
 behavior='blocked';const before=loadTown(worldId),chat=await converse(user,worldId,batch[0].id,{message:'Was brauchst du gerade?',channel:'inner',lang:'de'});assert.match(chat.reply,/ruhigen/);assert.equal(loadTown(worldId).world.seconds,before.world.seconds);
 const beforeTick=loadTown(worldId),beforeCalls=bioCalls,step=await tick(worldId,{minutes:5,story:true,intervention:{kind:'idea',targetId:batch[0].id,text:'Überlege, wie du jemandem helfen kannst.'}}),after=loadTown(worldId);
 assert.equal(after.world.seconds,beforeTick.world.seconds+300);assert.equal(step.metrics.warnings[0].code,'BIOGRAPHY_DEFERRED');assert.ok(step.metrics.modelCalls>0);assert.ok(bioCalls>beforeCalls);assert.ok(after.people.slice(0,2).every(p=>p.biography_mode==='written_deferred'));assert.deepEqual(after.people.slice(0,2).map(p=>p.biography),originals);
 assert.equal(db.prepare("SELECT count(*) n FROM lw_events WHERE world_id=? AND type='intervention'").get(worldId).n,1);assert.equal(db.prepare("SELECT count(*) n FROM lw_events WHERE world_id=? AND type='initialization_authored_background'").get(worldId).n,0);
 const deferredCalls=bioCalls;await tick(worldId,{minutes:1,story:true});assert.equal(bioCalls,deferredCalls,'A deferred biography must not be retried on every tick');
 // A failure in the actual Storyteller still rolls the whole proposal back.
 db.prepare("UPDATE lw_sims SET biography_mode='written_pending' WHERE id=?").run(batch[0].id);const rollback=loadTown(worldId),eventCount=db.prepare('SELECT count(*) n FROM lw_events WHERE world_id=?').get(worldId).n;storyFails=true;await assert.rejects(tick(worldId,{minutes:1,story:true}),/LLM 503/);assert.deepEqual(loadTown(worldId),rollback);assert.equal(db.prepare('SELECT count(*) n FROM lw_events WHERE world_id=?').get(worldId).n,eventCount);assert.equal(busy.has(worldId),false);storyFails=false;
 behavior='cancel';const controller=new AbortController(),pending=tick(worldId,{minutes:1,story:true,signal:controller.signal});setTimeout(()=>controller.abort(),100);await assert.rejects(pending);assert.deepEqual(loadTown(worldId),rollback);assert.equal(busy.has(worldId),false);
 // Explicit profile retry can complete the deferred task without changing history.
 behavior='success';const retried=loadTown(worldId).people.slice(0,2);await authorBiographies(user,retried);assert.ok(retried.every(p=>p.biography_mode==='written'));
 const peopleById=new Map(),person=(id,gender,parents=[],partner=null,status='single')=>{const p={id,gender,age:30,family:{parent_ids:parents,partner_id:partner,relationship_status:status}};peopleById.set(id,p);return p;};
 const great=person('great','male'),grand=person('grand','female',['great']),mother=person('mother','female',['grand']),uncle=person('uncle','male',['grand']),a=person('a','female',['mother']),sibling=person('sibling','male',['mother']),cousin=person('cousin','male',['uncle']),husband=person('husband','male',[],'a','married');a.family.partner_id=husband.id;a.family.relationship_status='married';
 for(const [target,label] of [[mother,'Mutter'],[grand,'Großmutter'],[great,'Urgroßvater'],[uncle,'Onkel'],[sibling,'Bruder'],[cousin,'Cousin'],[husband,'Ehemann']])assert.ok(relationshipLabels(a,target,{},peopleById).includes(label));
 assert.deepEqual(relationshipLabels(mother,a,{},peopleById),['Tochter']);assert.deepEqual(relationshipLabels(husband,a,{},peopleById),['Ehefrau']);assert.deepEqual(relationshipLabels(a,person('colleague','male'),{background:{contexts:['Coworker','Friend']}},peopleById),['Kollege','Freund']);assert.deepEqual(relationshipLabels(a,person('interest','female'),{attraction:.4},peopleById),['Romantisches Interesse']);assert.deepEqual(relationshipLabels(a,person('foe','male'),{kind:'Enemy'},peopleById),['Feind']);assert.deepEqual(relationshipLabels(a,person('tense','male'),{tension:.7},peopleById),['Konflikt']);
 console.log('PASS partial and malformed biography responses, bounded retry, atomic batches, reported provider error with working inner chat, intervention and five-minute commit, retained background and visible deferral, no repeated automatic costs, Storyteller rollback and cancellation, explicit retry, directional kinship and social labels');
}finally{globalThis.fetch=realFetch;closeOpenSims();db.close();fs.rmSync(scratch,{recursive:true,force:true});}
