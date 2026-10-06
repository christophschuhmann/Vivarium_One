import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'living-social-'));process.env.VIV_DATA_DIR=scratch;
const {db,j}=await import('../server/db.js');await import('../server/living/schema.js');
const {generateTown}=await import('../server/living/generate.js');
const {createTown,advanceTown,loadTown}=await import('../server/living/engine.js');
const {socialDestination,neighborhoodOf,socialPerspective}=await import('../server/living/social.js');
const {upgradeNeighborhoods}=await import('../server/living/upgrade.js');
const {openSims,closeOpenSims}=await import('../server/living/open_sims.js');
const user={id:'social-test'};db.prepare('INSERT INTO users(id,email,display_name,created_at) VALUES (?,?,?,?)').run(user.id,'social@test','Social test',new Date().toISOString());
try{
  const large=await generateTown('large',{population:500,seed:73}),repeat=await generateTown('repeat',{population:500,seed:73});
  const neighborhoods=large.places.filter(p=>p.kind==='neighborhood');assert.equal(new Set(neighborhoods.map(p=>p.name)).size,neighborhoods.length);assert.ok(neighborhoods.every(p=>!/^Nachbarschaft \d/.test(p.name)));
  assert.deepEqual(large.places.map(p=>p.name),repeat.places.map(p=>p.name));assert.deepEqual(large.people.map(p=>p.profile.social),repeat.people.map(p=>p.profile.social));
  const byId=new Map(large.people.map(p=>[p.id,p])),places=new Map(large.places.map(p=>[p.id,p]));let friendships=0,coworkers=0,school=0,degree=0;
  for(const p of large.people){degree=Math.max(degree,Object.keys(p.relations).length);assert.ok(p.profile.social.wish);assert.ok(p.profile.neighborhood.name);for(const [id,r] of Object.entries(p.relations)){
    const other=byId.get(id);assert.ok(other);assert.ok(other.relations[p.id]);
    if(r.background?.label==='Friend')friendships++;
    if(r.background?.contexts?.includes('Coworker')){coworkers++;assert.equal(p.workplace_id,other.workplace_id);assert.ok(p.age>=18&&other.age>=18);}
    if(r.background?.contexts?.includes('Classmate')){school++;assert.ok(p.age<18&&other.age<18);assert.ok(Math.abs(p.age-other.age)<=4);}
    if(r.background?.contexts?.includes('Neighbor'))assert.equal(neighborhoodOf(p,places).id,neighborhoodOf(other,places).id);
  }}
  assert.ok(friendships>100);assert.ok(coworkers>100);assert.ok(school>20);assert.ok(degree<=12);
  // A personal care motive changes weighted choices, without bypassing consent checks.
  const a=large.people[0],b=large.people[1],actor=p=>({...p,psychology:p.state.psychology,needs:p.state.needs,profile:p.profile});
  const pairs=Array.from({length:240},(_,i)=>({a:actor(a),b:actor(b),seed:'care-test-'+i,eventId:'care-'+i}));
  const plain=structuredClone(pairs);for(const pair of plain)delete pair.a.profile.social;
  const caring=structuredClone(pairs);for(const pair of caring)pair.a.profile.social.motive='care';
  const baseline=await openSims('social',{pairs:plain,now:27000}),care=await openSims('social',{pairs:caring,now:27000});
  const careCount=results=>results.filter(r=>['offer_help','comfort','check_in'].includes(r.category)).length;
  assert.ok(careCount(care)>careCount(baseline)+5);
  const replay=await openSims('replay_social',{people:[actor(a),actor(b)],now:27100,events:[{id:'supported-contact',participants:[a.id,b.id],category:'check_in',outcome:'accepted',time:27100}]});
  assert.deepEqual(replay[a.id].relations[b.id].background,a.relations[b.id].background);assert.equal(replay[a.id].relations[b.id].last_evidence_id,'supported-contact');
  // A mutual visit uses real graph edges and actually reaches the friend's living room.
  const {worldId}=await createTown(user,{population:10});let town=loadTown(worldId);
  const host=town.people[0],guest=town.people.find(p=>p.household_id!==host.household_id&&p.age>=18&&!(town.people.some(q=>q.age<3&&q.profile.family.parent_ids.includes(p.id))));
  for(const p of [host,guest]){p.relations={};p.state.location_id=p.profile.home.living;p.state.route=null;p.state.action=null;p.state.needs=Object.fromEntries(Object.keys(p.state.needs).map(k=>[k,.1]));}
  const edge={kind:'Friend',closeness:.9,trust:.9,respect:.7,tension:0,attraction:0};host.relations[guest.id]={...edge};guest.relations[host.id]={...edge};
  let time;for(let day=0;day<20;day++){const at=day*86400+17*3600;if(socialDestination(town,host,at)&&socialDestination(town,host,at)===socialDestination(town,guest,at)){time=at;break;}}
  assert.ok(time!==undefined);const destination=socialDestination(town,guest,time);
  db.prepare('DELETE FROM lw_relations WHERE world_id=? AND (from_id=? OR from_id=?)').run(worldId,host.id,guest.id);
  for(const p of [host,guest]){db.prepare('UPDATE lw_sims SET state=?,location_id=? WHERE id=?').run(j(p.state),p.state.location_id,p.id);for(const [id,r] of Object.entries(p.relations))db.prepare('INSERT INTO lw_relations VALUES (?,?,?,?)').run(worldId,p.id,id,j(r));}
  db.prepare('UPDATE lw_worlds SET seconds=? WHERE world_id=?').run(time,worldId);
  await advanceTown(user,worldId,{minutes:20,story:false});town=loadTown(worldId);
  assert.ok(db.prepare("SELECT 1 FROM lw_events WHERE world_id=? AND type='arrival' AND location_id=? AND json_extract(participants,'$[0]')=?").get(worldId,destination,guest.id));
  assert.ok(!town.byId.get(guest.id).state.route||town.byId.get(guest.id).state.route.destination===destination);
  // Migration preserves old names given by users, authored biographies, physical states,
  // numeric relationships, evidence and every old journal entry; repeat is a no-op.
  const legacy=await createTown(user,{population:20,seed:73}),id=legacy.worldId;
  db.prepare("UPDATE lw_worlds SET rules='{}' WHERE world_id=?").run(id);
  const n=db.prepare("SELECT id FROM lw_places WHERE world_id=? AND kind='neighborhood'").get(id);db.prepare("UPDATE lw_places SET name='Nachbarschaft 1' WHERE id=?").run(n.id);
  const authored=db.prepare('SELECT id FROM lw_sims WHERE world_id=? ORDER BY rowid LIMIT 1').get(id);db.prepare("UPDATE lw_sims SET biography='Meine ausgearbeitete Lebensgeschichte. Ich wünsche mir mehr Zeit mit meiner Familie.',biography_mode='written' WHERE id=?").run(authored.id);
  for(const row of db.prepare('SELECT id,profile FROM lw_sims WHERE world_id=?').all(id)){const profile=JSON.parse(row.profile);delete profile.social;delete profile.neighborhood;db.prepare('UPDATE lw_sims SET profile=? WHERE id=?').run(j(profile),row.id);}
  for(const row of db.prepare('SELECT * FROM lw_relations WHERE world_id=?').all(id)){const payload=JSON.parse(row.payload);delete payload.background;db.prepare('UPDATE lw_relations SET payload=? WHERE world_id=? AND from_id=? AND to_id=?').run(j(payload),id,row.from_id,row.to_id);}
  const customDistrict=db.prepare("SELECT id FROM lw_places WHERE world_id=? AND kind='district'").get(id);db.prepare("UPDATE lw_places SET name='Mein Gartenviertel' WHERE id=?").run(customDistrict.id);
  const original=db.prepare('SELECT id,state,location_id,biography,biography_mode FROM lw_sims WHERE world_id=? ORDER BY rowid').all(id),oldJournal=db.prepare('SELECT j.rowid,j.* FROM lw_journal j JOIN lw_sims s ON s.id=j.sim_id WHERE s.world_id=? ORDER BY j.rowid').all(id),oldRelations=db.prepare('SELECT * FROM lw_relations WHERE world_id=?').all(id),oldSeconds=loadTown(id).world.seconds;
  assert.equal(upgradeNeighborhoods(id),true);assert.deepEqual(db.prepare('SELECT id,state,location_id,biography,biography_mode FROM lw_sims WHERE world_id=? ORDER BY rowid').all(id),original);assert.equal(loadTown(id).world.seconds,oldSeconds);
  assert.deepEqual(db.prepare('SELECT j.rowid,j.* FROM lw_journal j JOIN lw_sims s ON s.id=j.sim_id WHERE s.world_id=? ORDER BY j.rowid LIMIT ?').all(id,oldJournal.length),oldJournal);
  for(const r of oldRelations){const current=JSON.parse(db.prepare('SELECT payload FROM lw_relations WHERE world_id=? AND from_id=? AND to_id=?').get(id,r.from_id,r.to_id).payload);for(const [key,value] of Object.entries(JSON.parse(r.payload)))assert.deepEqual(current[key],value);}
  assert.equal(db.prepare('SELECT name FROM lw_places WHERE id=?').get(customDistrict.id).name,'Mein Gartenviertel');
  assert.equal(socialPerspective(loadTown(id).byId.get(authored.id)).wish,'Ich wünsche mir mehr Zeit mit meiner Familie.');
  const count=db.prepare('SELECT count(*) n FROM lw_events WHERE world_id=?').get(id).n,version=loadTown(id).world.version;assert.equal(upgradeNeighborhoods(id),false);assert.equal(loadTown(id).world.version,version);assert.equal(db.prepare('SELECT count(*) n FROM lw_events WHERE world_id=?').get(id).n,count);
  console.log(JSON.stringify({result:'PASS named neighborhoods, reciprocal grounded sparse ties, personal motives affect actual encounters, relationship history survives social updates, real routed friend visits, history-preserving idempotent migration',population:500,maxInitialDegree:degree,friendships,coworkers,school,careChoices:{baseline:careCount(baseline),personalMotive:careCount(care)}}));
}finally{closeOpenSims();db.close();fs.rmSync(scratch,{recursive:true,force:true});}
