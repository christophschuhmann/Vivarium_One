import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.VIV_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'viv-portraits-outlooks-'));
const {db,j}=await import('../server/db.js');
const {createTown,loadTown,advanceTown}=await import('../server/living/engine.js');
const {closeOpenSims}=await import('../server/living/open_sims.js');
const {characterCandidates,catalogEntry,emotionAsset}=await import('../server/living/asset-catalog.js');
const {circleMap,searchMap}=await import('../server/living/map.js');
const {JOBS}=await import('../server/living/expanded/catalog.js');
const {adultAttraction,socialMotivations}=await import('../server/living/social-dynamics.js');
const {economicDraft}=await import('../server/living/expanded/economy.js');
const {publishClaim}=await import('../server/living/expanded/community.js');
const {relationsView}=await import('../server/living/navigation.js');
const {socialAttributes}=await import('../server/living/social-attributes.js');
const {commitEconomy}=await import('../server/living/expanded/store.js');
const {reputationFor}=await import('../server/living/expanded/community.js');
const user={id:'portrait-test'};
db.prepare('INSERT INTO users(id,email,display_name,created_at) VALUES (?,?,?,?)').run(user.id,'portrait@test','Portrait test',new Date().toISOString());
try{
 const neutral=characterCandidates({age:44,gender:'female',heritage:'white'})[0];assert.ok(neutral,'Requires the synced HF catalog');
 for(const id of ['contentment','hope_enthusiasm_optimism'])assert.equal(emotionAsset(neutral.id,{states:[{id,intensity:1}]}),neutral.id,'Satisfaction is not a forced grin');
 assert.equal(emotionAsset(neutral.id,{states:[{id:'elation',intensity:.4}]}),neutral.id);
 for(const [id,expression] of [['elation','joyful'],['anger','angry'],['fear','afraid'],['sadness','sad']]){
  const chosen=catalogEntry(emotionAsset(neutral.id,{states:[{id,intensity:.9}]}));
  assert.equal(chosen.emotion,expression);assert.equal(chosen.identity_id,neutral.identityId);assert.equal(chosen.style,neutral.style);
 }
 assert.equal(emotionAsset(neutral.id,{states:[{id:'impatience_and_irritability',intensity:.49}]}),neutral.id);
 assert.equal(catalogEntry(emotionAsset(neutral.id,{states:[{id:'impatience_and_irritability',intensity:.51}]})).emotion,'annoyed');
 const angry={updated_at:30000,states:[{id:'anger',intensity:.9}]},facade={manner:'friendly_composure',until:30100};
 assert.equal(emotionAsset(neutral.id,angry,facade),neutral.id);assert.notEqual(emotionAsset(neutral.id,{...angry,updated_at:30200},facade),neutral.id);
 for(const age of [7,16,24,44,76])for(const gender of ['male','female']){
  const candidates=characterCandidates({age,gender,heritage:'white'});assert.ok(candidates.length);
  assert.ok(candidates.every(c=>c.id.endsWith('-neutral')&&c.ageRange[0]<=age&&c.ageRange[1]>=age&&c.gender===gender));
  assert.ok(candidates.every(c=>age<18?c.imageAge<18:c.imageAge>=18));
  if([24,44].includes(age))assert.ok(candidates.every(c=>Math.abs(c.imageAge-age)<=3),'Prefer actual source age instead of a broad bin');
 }
 const {worldId}=await createTown(user,{population:1000,seed:73,scenario:'bennington'}),town=loadTown(worldId);
 const occupations=new Set(town.people.filter(p=>JOBS[p.profile.job]).map(p=>p.profile.job));assert.ok(occupations.size>=50,'A thousand residents should have many actual professions');
 const draft=economicDraft(town);
 for(const p of town.people){const spec=JOBS[p.profile.job];if(!spec||p.profile.job==='Student')continue;assert.ok(p.age>=(spec.minAge||18),p.profile.job+' must be age appropriate');assert.ok(p.state.skills[spec.skill]>=spec.minimum);if(spec.credential)assert.ok(p.state.credentials.includes(spec.credential));assert.ok(town.places.has(p.profile.workplace_id));const c=draft.contracts.get(p.id);assert.equal(c?.payload.job,p.profile.job,'Displayed job matches the actual paid contract');assert.ok(!p.biography.match(/They work as /),'Owner template uses the recorded pronouns');}
 const couples=town.people.filter(p=>p.profile.family.partner_id&&p.id<p.profile.family.partner_id),sameSex=couples.filter(p=>p.gender===town.byId.get(p.profile.family.partner_id).gender);assert.ok(sameSex.length/couples.length>.04&&sameSex.length/couples.length<.17,'Roughly 10%, not independent 50/50 partner genders');
 const adults=town.people.filter(p=>p.age>=18),a=structuredClone(adults[0]),b=structuredClone(adults.find(p=>p.household_id!==a.household_id));a.profile.family={parent_ids:[]};b.profile.family={parent_ids:[]};a.profile.romanticPreferences={genders:[b.gender]};b.profile.romanticPreferences={genders:[a.gender]};a.relations[b.id]={closeness:.5,trust:.5};
 b.state.socialDynamics.appearance=.1;const low=adultAttraction(a,b,draft);b.state.socialDynamics.appearance=.9;assert.ok(adultAttraction(a,b,draft)>low);
 const beforeReputation=socialMotivations(a,b,draft);publishClaim(draft,b,{id:'test-visible-help',end:town.world.seconds,participants:[b.id,a.id],facts:{}},{dimension:'helpfulness',value:1,statement:'Helped with a real task.',audience:[a.id]});assert.ok(socialMotivations(a,b,draft).otherReputation>beforeReputation.otherReputation);
 assert.ok(socialMotivations(a,b,draft).attraction>beforeReputation.attraction,'Known reputation changes attraction');
 publishClaim(draft,b,{id:'test-public-help',end:town.world.seconds,participants:[b.id,a.id],facts:{public:true}},{dimension:'helpfulness',value:.5,statement:'Visible mutual assistance.'});commitEconomy(draft);const currentRep=reputationFor(draft,b,b.id,town.world.seconds),visible=socialAttributes(b);assert.equal(visible.reputation,(currentRep.helpfulness+currentRep.reliability)/2);assert.ok(visible.reputation>.5,'Mind reflects new claims immediately, without waiting for the daily cache');assert.equal(socialAttributes(town.people.find(p=>p.age<18)).appearance,null);
 a.profile.romanticPreferences.genders=[];assert.equal(adultAttraction(a,b,draft),0);b.age=17;assert.equal(adultAttraction(a,b,draft),null);
 const bonds=relationsView(worldId,town.people[0].id,{limit:8});assert.ok(bonds.center.age>=0&&bonds.center.activityStatus);assert.equal(bonds.center.state,undefined,'Preview never leaks private state');assert.ok(bonds.neighbors.every(p=>p.activityStatus&&Number.isFinite(p.age)));
 console.log('Professions and couples',JSON.stringify({professions:occupations.size,couples:couples.length,sameSex:sameSex.length}));
 for(const p of town.people)for(const [id,rel] of Object.entries(p.relations))if(rel.background?.contexts?.includes('Coworker'))assert.equal(p.profile.workplace_id,town.byId.get(id).profile.workplace_id,'Colleague labels match current workplaces');
 const counts={};for(const p of town.people){const s=p.state.initialSituation;assert.ok(s);counts[s.kind]=(counts[s.kind]||0)+1;assert.equal(s.source,'initialized_background');assert.ok(p.state.affect.states.length);if(s.otherId)assert.ok(p.relations[s.otherId]);if(p.age<14)assert.equal(p.state.needs.romantic_affection,0);}
 console.log("Situation distribution",counts);assert.ok(Object.keys(counts).length>=7);assert.ok(counts.settled>100&&counts.settled<500);assert.ok(counts.comparison>20&&counts.boundaries>20&&counts.money>0);
 const masked=town.people.filter(p=>p.state.presentation).length;assert.ok(masked>30&&masked<350);
 assert.equal(db.prepare("SELECT count(*) n FROM lw_events WHERE world_id=? AND type='initialization_outlook' AND json_extract(facts,'$.coverage')='initialized_background'").get(worldId).n,1000);
 const neighborhood=[...town.places.values()].filter(p=>p.kind==='neighborhood');assert.equal(new Set(neighborhood.map(p=>p.asset_id)).size,neighborhood.length);
 const before=j(db.prepare('SELECT id,parent_id FROM lw_places WHERE world_id=?').all(worldId));let groups=0,maximum=0;
 for(const quarter of neighborhood){
  const map=circleMap(worldId,{expanded:j([quarter.id]),focus:quarter.id});assert.ok(map.expanded.includes(quarter.id));assert.deepEqual(map.refused,[]);maximum=Math.max(maximum,map.nodes.length);
  for(const block of map.nodes.filter(n=>n.kind==='block')){const opened=circleMap(worldId,{expanded:j([block.id]),focus:block.id});assert.ok(opened.expanded.includes(block.id));assert.ok(opened.nodes.length<=180);assert.ok(opened.nodes.filter(n=>n.thumbnail).length<=50);groups++;}
 }
 assert.ok(groups>0,'The real Downtown previously exceeded the expansion limit');
 const search=searchMap(worldId,'Civic counseling'),fallback=searchMap(worldId,'library');assert.ok(fallback.results.length);
 for(const result of [...search.results,...fallback.results].filter(r=>r.kind==='room')){
  const expanded=result.path.slice(0,-1).filter(p=>['district','neighborhood','building','block'].includes(p.kind)).map(p=>p.id),map=circleMap(worldId,{expanded:j(expanded),focus:result.id});assert.ok(map.nodes.some(n=>n.id===result.id),'Search must reveal actual rooms through virtual groups');
 }
 assert.equal(j(db.prepare('SELECT id,parent_id FROM lw_places WHERE world_id=?').all(worldId)),before,'Map grouping must not alter travel routes');
 const report={population:1000,professions:occupations.size,couples:couples.length,sameSexCouples:sameSex.length,attractionAndReputationAffectMotives:true,initialSituations:counts,facades:masked,uniqueNeighborhoodImages:neighborhood.length,largeGroupsOpened:groups,maximumMapNodes:maximum,expressionThresholds:true,ageMatching:true};
 fs.mkdirSync('artifacts/expanded-world',{recursive:true});fs.writeFileSync('artifacts/expanded-world/portraits-outlooks-map-review.json',JSON.stringify(report,null,2)+'\n');console.log('PASS',JSON.stringify(report));
}finally{closeOpenSims();db.close();fs.rmSync(process.env.VIV_DATA_DIR,{recursive:true,force:true});}
