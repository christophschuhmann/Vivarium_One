import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'vivarium-romance-'));process.env.VIV_DATA_DIR=scratch;process.env.VIV_SECRET='isolated-romance-test-secret';
const {db}=await import('../server/living/schema.js'),{openSims,closeOpenSims}=await import('../server/living/open_sims.js');
const {generateTown}=await import('../server/living/generate.js'),{reflect,evaluateMind,addFeeling,completedSocial,romanticWitness}=await import('../server/living/cognition.js');
const {normalizeRomance,romanticCap,assertMinorSafeText,normalizeImportedRomance}=await import('../server/living/romance.js');
const {createTown,loadTown}=await import('../server/living/engine.js'),{upgradeAllRomance}=await import('../server/living/upgrade-romance.js');
try{
 const town=await generateTown('fixture',{population:10}),catalog=await openSims('catalog');
 for(const age of [0,3,6,10,13,14,15,16,17,18,30,70,90]){
  const p=structuredClone(town.people[0]);p.age=age;p.state.needs.romantic_affection=1;normalizeRomance(p);assert.equal(p.state.needs.romantic_affection,romanticCap(age));
  for(let i=0;i<25;i++)reflect(p,{needsDelta:{romantic_affection:1},emotions:[{id:'sexual_lust',intensity:1},{id:'infatuation',intensity:1}]},{id:'test'+i},0);
  assert.ok(p.state.needs.romantic_affection<=romanticCap(age));if(age<18)assert.ok(!p.state.affect.states.some(e=>e.id==='sexual_lust'));if(age<14)assert.ok(!p.state.affect.states.some(e=>e.id==='infatuation'));
  evaluateMind(p,0,catalog);assert.ok(p.state.current_desire);if(age>=18)assert.ok(p.state.affect.states.some(e=>e.id==='sexual_lust'));
 }
 const actor=(id,age)=>{const p=structuredClone(town.people[0]);p.id=id;p.age=age;p.family={parent_ids:[],partner_id:null};p.profile.family=p.family;p.relations={};p.needs={...p.state.needs,romantic_affection:romanticCap(age)};return p;};
 const ages=[0,13,14,15,16,17,18,19,30,75],cases=[];
 for(const aAge of ages)for(const bAge of ages)for(const category of ['teen_romantic_talk','teen_date','flirt','ask_date','adult_private_intimacy']){
  const a=actor('a',aAge),b=actor('b',bAge);a.relations.b={closeness:.7,trust:.7,layers:{family:{score:0,status:'none'},romance:{score:.5,status:'developing'}}};b.relations.a=structuredClone(a.relations.b);if(category==='adult_private_intimacy'){a.family.partner_id='b';b.family.partner_id='a';}
  cases.push({a,b,category,seed:1,outcome:'accepted',consent_checked:true,eventId:'test-'+cases.length,venue:{purpose:category==='adult_private_intimacy'?'family bedroom':'town park',occupant_ids:['a','b']}});
 }
 const results=await openSims('social',{pairs:cases,now:0});
 for(let i=0;i<cases.length;i++){const p=cases[i],r=results[i],a=p.a.age,b=p.b.age;
  const permitted=p.category.startsWith('teen_')?a>=14&&a<18&&b>=14&&b<18&&Math.abs(a-b)<=1:a>=18&&b>=18;
  assert.equal(r.allowed,permitted,`${p.category}: ${a}/${b}`);
 }
 const a=actor('a',16),b=actor('b',17),base={a,b,category:'teen_date',seed:1,eventId:'date'};
 assert.equal((await openSims('social',{pairs:[{...base,venue:{purpose:'family bedroom'}}],now:0}))[0].allowed,false);
 a.family.parent_ids=['same'];b.family.parent_ids=['same'];assert.equal((await openSims('social',{pairs:[{...base,venue:{purpose:'town park'}}],now:0}))[0].allowed,false);
 const adult=actor('a',30),partner=actor('b',31);adult.family.partner_id='b';partner.family.partner_id='a';
 assert.equal((await openSims('social',{pairs:[{a:adult,b:partner,category:'adult_private_intimacy',seed:1,eventId:'adult',venue:{purpose:'family bedroom',occupant_ids:['a','b','child']}}],now:0}))[0].allowed,false);
 const p=structuredClone(town.people[0]);p.age=16;p.state.needs.romantic_affection=.35;const warmth=p.state.needs.social;
 completedSocial(p,{id:'friendly',facts:{category:'small_talk',outcome:'accepted'},description:'Ein nettes Gespräch.'},0);assert.equal(p.state.needs.romantic_affection,.35);completedSocial(p,{id:'date',facts:{category:'teen_date',outcome:'accepted'},description:'Ein nettes altersnahes Date.'},0);assert.ok(p.state.needs.romantic_affection<.35);assert.equal(p.state.needs.social,warmth);
 const observer=structuredClone(town.people[0]);observer.age=30;observer.profile.family={partner_id:'partner'};observer.state.needs.romantic_affection=.9;observer.relations={partner:{trust:.8}};const witnesses=new Map([['partner',{age:31}],['other',{age:30}]]),seen={id:'seen',participants:['partner','other'],witnesses:[observer.id],facts:{category:'flirt',outcome:'accepted'}};assert.match(romanticWitness(observer,seen,witnesses,0),/do not know their private intentions/);assert.ok(observer.state.affect.states.some(e=>e.id==='jealousy_envy'));assert.equal(romanticWitness(observer,{...seen,witnesses:[]},witnesses,0),null);assert.equal(romanticWitness(observer,{...seen,facts:{...seen.facts,private:true}},witnesses,0),null);observer.age=17;assert.equal(romanticWitness(observer,seen,witnesses,0),null);
 for(const text of ['sexual_lust','Eine erotische Begegnung.','Ich fühle Begehren.'])assert.throws(()=>assertMinorSafeText([{age:17}],text),e=>e.code==='AGE_BOUNDARY');assert.doesNotThrow(()=>assertMinorSafeText([{age:18}],'sexual_lust'));assert.doesNotThrow(()=>assertMinorSafeText([{age:16}],'Wir verabreden uns auf ein Eis.'));
 // Legacy upgrade leaves warmth, factual history, locations and time untouched.
 const stamp=new Date().toISOString();db.prepare('INSERT INTO users(id,email,display_name,email_verified_at,created_at) VALUES (?,?,?,?,?)').run('test','test@local','Test',stamp,stamp);const user=db.prepare('SELECT * FROM users WHERE id=?').get('test'),w=await createTown(user,{population:10});
 db.prepare("UPDATE lw_worlds SET rules=json_remove(rules,'$.romanceVersion') WHERE world_id=?").run(w.worldId);db.prepare("UPDATE lw_sims SET state=json_remove(state,'$.needs.romantic_affection') WHERE world_id=?").run(w.worldId);const before=loadTown(w.worldId),events=db.prepare('SELECT * FROM lw_events WHERE world_id=?').all(w.worldId),up=await upgradeAllRomance(),after=loadTown(w.worldId);assert.equal(up.worlds,1);assert.ok(fs.existsSync(up.backup));assert.equal(after.world.seconds,before.world.seconds);assert.deepEqual(after.people.map(p=>[p.state.needs.social,p.location_id,p.biography]),before.people.map(p=>[p.state.needs.social,p.location_id,p.biography]));assert.deepEqual(db.prepare('SELECT * FROM lw_events WHERE world_id=?').all(w.worldId),events);assert.equal((await upgradeAllRomance()).worlds,0);
 const minor=after.people.find(p=>p.age<14);db.prepare("UPDATE lw_sims SET state=json_set(state,'$.needs.romantic_affection',1) WHERE id=?").run(minor.id);normalizeImportedRomance(db,w.worldId);assert.equal(loadTown(w.worldId).byId.get(minor.id).state.needs.romantic_affection,0);
 // Exercise the real import transaction: unsafe history must leave no world,
 // Sims or partial rows behind, while valid snapshots normalize the new cap.
 const {buildWorldManifest,importWorldManifest}=await import('../server/world_io.js');const manifest=buildWorldManifest(w.worldId),bad=structuredClone(manifest),beforeCount=db.prepare('SELECT count(*) n FROM worlds').get().n;
 const badEvent=bad.living.lw_events[0];badEvent.type='social';badEvent.participants=JSON.stringify([minor.id,after.people.find(p=>p.age>=18).id]);badEvent.facts=JSON.stringify({category:'adult_private_intimacy'});badEvent.description='Ein privater Moment.';
 assert.throws(()=>importWorldManifest(user,bad,null,{reuseAssets:true}),/Erwachsenen-Romantikkategorie/);assert.equal(db.prepare('SELECT count(*) n FROM worlds').get().n,beforeCount);
 const badRelation=structuredClone(manifest),relation=badRelation.living.lw_relations.find(r=>r.from_id===minor.id);const relationState=JSON.parse(relation.payload);relationState.layers.romance={score:.8,status:'developing'};relation.payload=JSON.stringify(relationState);
 assert.throws(()=>importWorldManifest(user,badRelation,null,{reuseAssets:true}),/Romantikbeziehung/);assert.equal(db.prepare('SELECT count(*) n FROM worlds').get().n,beforeCount);
 const minorRow=manifest.living.lw_sims.find(p=>p.id===minor.id),minorState=JSON.parse(minorRow.state);minorState.needs.romantic_affection=1;minorRow.state=JSON.stringify(minorState);
 const imported=importWorldManifest(user,manifest,null,{reuseAssets:true});assert.ok(loadTown(imported.worldId).people.filter(p=>p.age<14).every(p=>p.state.needs.romantic_affection===0));
 const adultIds=after.people.filter(p=>p.age>=18).slice(0,2).map(p=>p.id);db.prepare('UPDATE lw_sims SET age=17 WHERE id=?').run(adultIds[0]);db.prepare("INSERT INTO lw_events(id,world_id,start,end,location_id,type,participants,facts,description,source) VALUES ('unsafe-import',?,0,0,?,'social',?,?,?,'test')").run(w.worldId,minor.location_id,JSON.stringify(adultIds),JSON.stringify({category:'adult_private_intimacy'}),'Ein privater Moment.');assert.throws(()=>normalizeImportedRomance(db,w.worldId),/Erwachsenen-Romantikkategorie|Partnerschaft/);
 const {default:Fastify}=await import('fastify'),{default:cookie}=await import('@fastify/cookie'),{default:routes}=await import('../server/routes/living.js'),{createSession}=await import('../server/auth.js');const app=Fastify();await app.register(cookie);await app.register(routes);const session='vsession='+createSession('test'),version=loadTown(w.worldId).world.version;
 const invalid=await app.inject({method:'PATCH',url:`/api/living/worlds/${w.worldId}/sims/${minor.id}`,headers:{cookie:session},payload:{needs:{romantic_affection:1}}});assert.equal(invalid.statusCode,400);assert.equal(loadTown(w.worldId).world.version,version);assert.equal(loadTown(w.worldId).byId.get(minor.id).state.needs.romantic_affection,0);await app.close();

 console.log('PASS 500 age-pair/category gates, under-14 zero and teen 0.35 caps, no adult/minor romance, <=1-year teen gap, teen public dates and known-kin exclusion, private consenting adult boundary without third occupants, separate friendly/romantic relief, minor prose guard, backed-up idempotent legacy upgrade');
}finally{closeOpenSims();db.close();fs.rmSync(scratch,{recursive:true,force:true});}
