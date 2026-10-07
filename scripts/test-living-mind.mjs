import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'living-mind-'));process.env.VIV_DATA_DIR=scratch;
const {db,j}=await import('../server/db.js');await import('../server/living/schema.js');
const {createTown,advanceTown,loadTown,findRoute}=await import('../server/living/engine.js');
const {openSimsCatalog,closeOpenSims}=await import('../server/living/open_sims.js');
const {evaluateMind,emotionalRate,motivationBias}=await import('../server/living/cognition.js');
const {converse,clearChat}=await import('../server/living/vivarium.js');
const {upgradeLife}=await import('../server/living/upgrade-life.js');
const user={id:'mind-test'};db.prepare('INSERT INTO users(id,email,display_name,created_at,credit_balance) VALUES (?,?,?,?,?)').run(user.id,'mind@test','Mind test',new Date().toISOString(),999999999);
const save=p=>db.prepare('UPDATE lw_sims SET state=?,location_id=? WHERE id=?').run(j(p.state),p.state.location_id,p.id);
try{
  const catalog=await openSimsCatalog(),created=await createTown(user,{population:20,seed:73}),wid=created.worldId;let town=loadTown(wid);
  assert.ok(town.people.every(p=>p.state.affect.states.length&&p.state.current_desire&&p.state.daily_goals.items.length===3));assert.ok(town.people.filter(p=>p.age>=6).every(p=>p.state.psychology.ambitions.every(a=>a.progress>0&&a.progress_source==='initialized_background')));
  const school=[...town.places.values()].find(p=>p.name==='Schule'),rooms=[...town.places.values()].filter(p=>p.parent_id===school.id);assert.ok(rooms.length>=7);assert.ok(rooms.some(p=>p.name.includes('Klassenraum B'))&&rooms.some(p=>p.name.toLowerCase().includes('mensa'))&&rooms.some(p=>p.name.includes('Toiletten')));
  for(const room of rooms)assert.ok(findRoute(town,school.id,room.id).length);
  // Urgent modeled needs produce emotions and actual public-toilet use during duty.
  const pupil=town.people.find(p=>p.age>=6&&p.age<18),time=9*3600;
  pupil.state.location_id=pupil.profile.workplace_id;pupil.state.needs={...pupil.state.needs,hunger:.3,thirst:.3,bladder:.96,fatigue:.4};pupil.state.action={kind:'school_day',started:time-600,until:time+7200};pupil.state.route=null;
  evaluateMind(pupil,time,catalog);assert.ok(pupil.state.affect.states.some(e=>e.id==='distress'));assert.match(pupil.state.current_desire,/bathroom/);
  const calm=structuredClone(pupil);calm.state.affect={states:[]};assert.ok(emotionalRate(pupil,'fatigue')>emotionalRate(calm,'fatigue'));assert.equal(emotionalRate(pupil,'bladder'),1);
  save(pupil);db.prepare('UPDATE lw_worlds SET seconds=? WHERE world_id=?').run(time,wid);await advanceTown(user,wid,{minutes:10,story:false});town=loadTown(wid);
  assert.ok(db.prepare("SELECT 1 FROM lw_events WHERE world_id=? AND type='departure' AND json_extract(participants,'$[0]')=? AND json_extract(facts,'$.destination')=?").get(wid,pupil.id,pupil.profile.facility.rooms.wc));assert.ok(town.byId.get(pupil.id).state.needs.bladder<.96);
  assert.ok(db.prepare("SELECT 1 FROM lw_events WHERE world_id=? AND type='action_completed' AND json_extract(participants,'$[0]')=? AND json_extract(facts,'$.action')='toilet'").get(wid,pupil.id));
  // A completed actual work action advances the daily goal and the relevant ambition.
  const worker=town.people.find(p=>p.age>=18&&p.profile.workplace_id&&p.profile.job!=='Teacher'),beforeWork=worker.state.psychology.ambitions.find(a=>a.kind==='career').progress;
  worker.state.location_id=worker.profile.workplace_id;worker.state.action={kind:'work',started:town.world.seconds-catalog.actions.work.duration+60,until:town.world.seconds+60};worker.state.route=null;worker.state.needs=Object.fromEntries(Object.keys(worker.state.needs).map(k=>[k,.1]));save(worker);
  await advanceTown(user,wid,{minutes:1,story:false});town=loadTown(wid);const working=town.byId.get(worker.id);assert.ok(working.state.psychology.ambitions.find(a=>a.kind==='career').progress>beforeWork);assert.ok(working.state.daily_goals.items.find(g=>g.kind==='career').value>0);assert.ok(working.state.affect.states.some(e=>['hope_enthusiasm_optimism','pride'].includes(e.id)));
  // Anchored storytelling receives coherent state and returns bounded, witnessed feedback.
  const story=await createTown(user,{population:10,seed:123}),plain=await createTown(user,{population:10,seed:123});await advanceTown(user,plain.worldId,{minutes:1,story:false});
  let reflectedId;
  const result=await advanceTown(user,story.worldId,{minutes:1,story:true,modelCall:async messages=>{const ctx=JSON.parse(messages[1].content);assert.ok(ctx.sims.every(s=>s.emotions.states.length&&s.goals.length&&s.dailyGoals.items.length));reflectedId=ctx.owned[0];const event=ctx.events.find(e=>e.participants.includes(reflectedId));return {content:j({story:'Ein nachdenklicher Moment.',thoughts:ctx.owned.map(id=>({simId:id,eventId:ctx.events.find(e=>e.participants.includes(id)).id,text:'Das Gespräch beschäftigt mich; ich möchte mein Vorhaben weiterverfolgen.',confidence:.7})),reflections:[{simId:reflectedId,eventId:event.id,emotions:[{id:'fear',intensity:1},{id:'sexual_lust',intensity:.9}],needsDelta:{hunger:-1,bladder:-1,social:1,fatigue:1},focusGoalId:ctx.sims[0].goals[0].id},{simId:'foreign',eventId:event.id,emotions:[{id:'anger',intensity:.5}]}]})};}});
  let st=loadTown(story.worldId),p=st.byId.get(reflectedId),baseline=loadTown(plain.worldId).people.find(q=>q.profile.seed_key===p.profile.seed_key);
  assert.ok(p.state.affect.states.some(e=>e.id==='fear'&&e.intensity===.75));assert.ok(!p.state.affect.states.some(e=>e.id==='sexual_lust'));assert.ok(Math.abs(p.state.needs.hunger-baseline.state.needs.hunger)<.001);assert.ok(p.state.needs.social-baseline.state.needs.social<=.081);assert.ok(p.state.needs.fatigue-baseline.state.needs.fatigue<=.031);assert.ok(result.metrics.rejections.some(r=>r.includes('reflection')));assert.equal(p.state.thought_source,'storyteller');
  const goal=p.state.psychology.ambitions[0];assert.equal(p.state.focus_goal_id,goal.id);assert.ok(motivationBias(p,'relax')>=0);
  // Paused inner dialogue updates real mental state, carries current goals/feelings,
  // preserves physical needs and rolls back its own effects on explicit clear.
  const beforeChat=structuredClone(p.state),clock=st.world.seconds;
  const chat=await converse(user,story.worldId,p.id,{channel:'inner',message:'Was beschäftigt dich gerade?',modelCall:async messages=>{const ctx=JSON.parse(messages[1].content);assert.ok(ctx.emotions.states.length&&ctx.goals.length&&ctx.currentDesire);return {content:j({reply:'Ich möchte mich erst sammeln und dann weitermachen.',thought:'Ich nehme mir den freundlichen Zuspruch zu Herzen.',reflection:{emotions:[{id:'hope_enthusiasm_optimism',intensity:.6}],needsDelta:{social:-.06,hunger:-1},focusGoalId:goal.id}})};}});
  p=loadTown(story.worldId).byId.get(p.id);assert.equal(loadTown(story.worldId).world.seconds,clock);assert.equal(p.state.needs.hunger,beforeChat.needs.hunger);assert.ok(p.state.affect.states.some(e=>e.id==='hope_enthusiasm_optimism'&&e.intensity===.6));assert.equal(chat.changed,true);
  clearChat(story.worldId,p.id);p=loadTown(story.worldId).byId.get(p.id);assert.deepEqual(p.state.needs,beforeChat.needs);assert.equal(p.state.thought,beforeChat.thought);
  // Old worlds recover measured progress from retained events; old facts remain intact.
  db.prepare("UPDATE lw_worlds SET rules=json_remove(rules,'$.lifeVersion') WHERE world_id=?").run(wid);
  const legacy=loadTown(wid);for(const p of legacy.people){for(const a of p.state.psychology.ambitions){a.progress=0;a.initial_progress=0;a.practice_seconds=0;}save(p);}
  const eventsBefore=db.prepare('SELECT * FROM lw_events WHERE world_id=? ORDER BY rowid').all(wid),physical=loadTown(wid).people.map(p=>[p.id,p.state.needs,p.state.location_id,p.state.route,p.state.action,p.biography,p.anchored]),seconds=loadTown(wid).world.seconds;
  assert.equal(upgradeLife(wid,catalog),true);const upgraded=loadTown(wid);assert.deepEqual(upgraded.people.map(p=>[p.id,p.state.needs,p.state.location_id,p.state.route,p.state.action,p.biography,p.anchored]),physical);assert.equal(upgraded.world.seconds,seconds);for(const event of eventsBefore)assert.deepEqual(db.prepare('SELECT * FROM lw_events WHERE id=?').get(event.id),event);assert.ok(upgraded.byId.get(worker.id).state.psychology.ambitions.find(a=>a.kind==='career').progress>0);assert.equal(upgradeLife(wid,catalog),false);
  console.log('PASS current needs/feelings, real public room use, actual ambition/day-goal progress, emotional action bias, bounded witnessed Storyteller feedback, paused mental dialogue and clearing, evidence-only idempotent upgrade with retained physical state/history');
}finally{closeOpenSims();db.close();fs.rmSync(scratch,{recursive:true,force:true});}
