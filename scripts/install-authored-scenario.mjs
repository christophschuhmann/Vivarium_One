// Build a reviewed scenario entirely from existing library art and authored scenes.
// No LLM call, image generation or advancement beyond the last supplied scene.
// Usage: node --env-file=.env scripts/install-authored-scenario.mjs config/scenarios/endwell.json --email player@example.com
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { db, j, pj, uid, now, DATA_DIR } from '../server/db.js';
import { withPrincipal } from '../server/byok.js';
import { startWizardBuild, getWizardJob } from '../server/wizard.js';
import { captureGenesisSnapshot, relSnapshot } from '../server/branches.js';
import { searchMusic } from '../server/gm.js';
import { catalogEntry } from '../server/living/asset-catalog.js';

const file=process.argv[2],email=process.argv[process.argv.indexOf('--email')+1];
if(!file || !process.argv.includes('--email') || !email)throw new Error('Supply a scenario JSON path and --email for the account that will own it.');
const plan=JSON.parse(fs.readFileSync(file,'utf8'));
const user=db.prepare('SELECT * FROM users WHERE email=?').get(email);
assert.ok(user,'Create the player account before installing a scenario.');
assert.ok(!db.prepare('SELECT id FROM worlds WHERE user_id=? AND title=?').get(user.id,plan.title),'This account already has this scenario. Existing playthroughs are never overwritten.');
assert.ok(plan.characters.length<=12&&plan.locations.length<=24&&plan.chapters?.length,'Scenario exceeds builder limits or has no authored scenes.');
assert.ok(plan.directives.length<=20000,'Scenario instructions exceed the supported limit.');
const names=new Set(plan.characters.map(c=>c.name)),locations=new Set(plan.locations.map(l=>l.name));
assert.equal(names.size,plan.characters.length);assert.ok(names.has(plan.player_character));
const visuals={};
for(const [kind,entries] of [['character',plan.characters],['background',plan.locations]])entries.forEach((entry,i)=>{
  const choice=entry.visual_choice;
  assert.equal(choice?.mode,'library','Authored installs reuse reviewed library images only.');
  const image=catalogEntry(choice.assetId);assert.equal(image?.kind,kind,`Missing ${kind}: ${choice.assetId}`);
  if(kind==='character')assert.ok(entry.age>=image.age_min&&entry.age<=image.age_max,'Portrait age range mismatch.');
  visuals[kind+':'+i]=choice;
});
for(const scene of plan.chapters){assert.ok(Number.isFinite(Date.parse(scene.at)));for(const line of scene.narration)assert.ok(line.speaker==='narrator'||names.has(line.speaker));}
for(const [a,b] of plan.paths)assert.ok(locations.has(a)&&locations.has(b));
let music=null;
try{music=await searchMusic({query:'quiet suspense in an old university common room, rainy evening, uncertain trust, restrained piano and strings',genre:'modern_supernatural',emotion:'eerie, restrained, curious'});}catch{console.log('Music server unavailable; install continues without a score.');}
const job=withPrincipal(user,()=>startWizardBuild(user,plan,'en',visuals));
let built;
for(let i=0;i<1200;i++){
  built=getWizardJob(job.id);if(['done','error'].includes(built.status))break;
  await new Promise(resolve=>setTimeout(resolve,250));
}
assert.equal(built.status,'done',built.error||'Build did not finish.');
const wid=built.world_id;
const cast=db.prepare('SELECT * FROM characters WHERE world_id=?').all(wid),places=db.prepare('SELECT * FROM locations WHERE world_id=?').all(wid);
const ids=Object.fromEntries(cast.map(c=>[c.name,c.id])),placeIds=Object.fromEntries(places.map(l=>[l.name,l.id]));
for(const c of cast){assert.ok(c.reference_asset_id,`Missing portrait for ${c.name}`);assert.ok(pj(c.materialised).outfits.length>=2,'Expression variants missing.');}
for(const l of places)assert.ok(l.background_asset_id,`Missing background for ${l.name}`);
const common=placeIds['Hawthorne Common Room'];
const cell=value=>({value,since:0,reason:'Established scenario continuity'});
const idToName=Object.fromEntries(cast.map(c=>[c.id,c.name]));
db.transaction(()=>{
  for(const c of cast){
    const base=pj(c.base_profile);
    base.scenario_id=plan.scenario_id;
    if(c.name==='Sarah Chang'){base.height_cm=162;base.heritage='Vietnamese';}
    base.storyteller_notes='Respect the scenario’s separation of private interpretation, observed evidence and actual events. The character does not know Kevin’s hidden capabilities. No compelled romantic or sexual behavior.';
    if(c.name===plan.player_character)base.storyteller_notes='The player controls all new intentions and power use. His current calm does not prove that he knows the source of the sample or what anyone privately thinks.';
    db.prepare('UPDATE characters SET base_profile=? WHERE id=?').run(j(base),c.id);
  }
  // Capture a real starting point for undo; do not put future incident knowledge in it.
  captureGenesisSnapshot(db.prepare('SELECT * FROM worlds WHERE id=?').get(wid));
  const branch=db.prepare('SELECT active_branch_id FROM worlds WHERE id=?').get(wid).active_branch_id;
  let previousTime=plan.start_time;
  for(const [index,scene] of plan.chapters.entries()){
    const idx=index+1,final=index===plan.chapters.length-1;
    const states=cast.map(c=>{
      const st=pj(c.materialised),present=scene.participant_names.includes(c.name);
      st.location_id=present?common:placeIds[plan.characters.find(p=>p.name===c.name).home_location];
      if(final)Object.assign(st,structuredClone(plan.initial_minds[c.name]));
      else Object.assign(st,{activity:present?'taking part in '+scene.title.toLowerCase():'off scene',mood:present?'attentive':'occupied',thought:null,dialogue:null,emotions:[],intentions:[],perceptions:{},attributes:{}});
      st.attributes??={};
      // Private memories contain witnessed information, not the storyteller's secret causes.
      st.attributes.belief={...(st.attributes.belief||{}),known_history:cell(plan.chapters.slice(0,idx).filter(s=>s.participant_names.includes(c.name)).map(s=>s.public_summary||s.summary))};
      // Sarah did not witness the earlier conversations. Her prior knowledge is limited.
      if(c.name==='Sarah Chang')st.attributes.belief.known_history=cell(final?['Two odor complaints led to the stairwell bin. The box contains broken sample vials; ownership and composition are unknown.','The residents seem uncomfortable. Their explanations have not been verified.']:['Responsible for Hawthorne Hall’s third floor; studying for Monday’s pharmacology exam.']);
      if(c.name===plan.player_character){
        st.attributes.skill={spoken_influence:cell('Requires presence and deliberate speech. Ordinary non-intimate choices can be influenced; doubt returns over hours and days. No automatic intimate or dangerous compliance.'),delayed_wish:cell('Targeted look and concentrated intent; plausible nonsexual effects develop over 24–72 hours. Not telepathy or instant mind rewriting.')};
        st.attributes.physical={inventory:cell(['Assigned psychology textbook','Room key','Student ID'])};
        if(idx>=2)st.attributes.skill.pending_wish=cell({targets:['Francis','Tiffany','Patrick','Lucas'],aim:'Notice patterns and keep returning to the unresolved question; no sexual effect',cast_at:'2026-08-28T21:10:00Z',earliest_onset:'2026-08-29T21:10:00Z',full_development_window_end:'2026-08-31T21:10:00Z',stage:'pending; full outcome unknown',target_knows_cause:false});
      }
      if(idx>=2&&['Francis','Tiffany','Patrick','Lucas'].includes(c.name)){
        st.attributes.condition={...(st.attributes.condition||{}),unusual_attention:cell({experience:'Restlessness and heightened attention',cause:'Unknown; first-week stress and environmental factors are hypotheses, not established facts'})};
        st.attributes.belief.reassurance=cell({heard_at:'2026-08-28T21:15:00Z',claim:'First-week awkwardness need not be made into a public incident.',doubt:idx>=3?'growing with contradictory experience':'low',not_a_binding_promise:true});
      }
      st.outfit='everyday';
      if(final&&c.name==='Sarah Chang')st.outfit=st.outfits.find(o=>o.emotion==='annoyed')?.name||'everyday';
      if(final&&c.name==='Lucas')st.outfit=st.outfits.find(o=>o.emotion==='afraid')?.name||'everyday';
      const lastLine=[...scene.narration].reverse().find(n=>n.speaker===c.name);st.dialogue=lastLine?.text||null;
      return {character_id:c.id,...st,events:present?[scene.public_summary||scene.summary]:[]};
    });
    const narration=scene.narration.map(n=>({...n,speaker:n.speaker==='narrator'?'narrator':ids[n.speaker]}));
    const minutes=Math.round((Date.parse(scene.at)-Date.parse(previousTime))/60000);assert.ok(minutes>=0,'Chronicle timestamps must be ordered.');
    db.prepare('INSERT INTO ticks(id,world_id,idx,sim_time,time_delta,states,narration,mood_tag,summary,cost,created_at,pov_location_id,branch_id,rel_snapshot,seq,decision,music) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(uid('t_'),wid,idx,scene.at,'+'+minutes+'m',j(states),j(narration),final?'tense':'eerie',scene.summary,j({authored:true,llmCalls:0}),now(),common,branch,j(relSnapshot(wid)),j({id:plan.scenario_id,kind:'intro',pos:index+1,n:plan.chapters.length,label:scene.title}),scene.decision||null,music?j(music):null);
    if(final)for(const st of states){const {character_id,events,...materialised}=st;db.prepare('UPDATE characters SET materialised=? WHERE id=?').run(j(materialised),character_id);}
    previousTime=scene.at;
  }
  const final=plan.chapters.at(-1),cover=places.find(l=>l.id===common).background_asset_id;
  db.prepare("UPDATE worlds SET sim_time=?,tick_index=?,cover_asset_id=?,current_music=?,curiosity=?,status='live',updated_at=? WHERE id=?")
    .run(final.at,plan.chapters.length,cover,music?j(music):null,j({topics:[],custom:'',frequency:5}),now(),wid);
  if(music)db.prepare('UPDATE locations SET music=? WHERE id=?').run(j(music),common);
  // Typed bond descriptions remain visible in Bonds, with shared goals and disagreements.
  for(const r of db.prepare('SELECT * FROM relationships WHERE world_id=?').all(wid)){
    const isRA=[idToName[r.from_id],idToName[r.to_id]].includes('Sarah Chang');
    const attributes={nature:isRA?'resident / resident assistant':'new university acquaintances',common_goals:[isRA?'Resolve the incident without scapegoating':'Build a tolerable shared life on the floor'],conflicts:[isRA?'Privacy and trust versus the duty to investigate':'Different ways of protecting self-respect'],shared_experiences:[isRA?'Sarah’s question at the common-room doorway':'The first-week common-room conversations']};
    db.prepare('UPDATE relationships SET attributes=? WHERE id=?').run(j(attributes),r.id);
  }
  // Snapshot the final bonds so rewind/redo restores the authored endpoint exactly.
  db.prepare('UPDATE ticks SET rel_snapshot=? WHERE world_id=? AND idx=?').run(j(relSnapshot(wid)),wid,plan.chapters.length);
})();
assert.equal(db.prepare('SELECT COUNT(*) n FROM credit_ledger WHERE world_id=?').get(wid).n,0,'Authored installation unexpectedly incurred a model call.');
const result={worldId:wid,playerId:ids[plan.player_character],title:plan.title,characters:cast.length,locations:places.length,scenes:plan.chapters.length,chapter:plan.chapters.at(-1).title,adaptation:plan.adaptation_note};
fs.writeFileSync(path.join(DATA_DIR,plan.scenario_id+'.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));db.close();
