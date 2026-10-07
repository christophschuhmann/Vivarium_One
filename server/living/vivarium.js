import {emotionAsset} from './asset-catalog.js';
import {projectWellbeing,removeWellbeingSources} from './wellbeing.js';
import {normalizeRomance,ROMANCE_INSTRUCTIONS,assertMinorSafeText} from './romance.js';
import {rebuildAffect,evaluateMind,reflect,mindContext,conversationReflection,REFLECTION_INSTRUCTIONS} from './cognition.js';
import {personalSocialContext} from './social.js';
// Present the same live state to the original Vivarium stage. No second simulation.
import {db} from './schema.js';
import {pj,j,uid} from '../db.js';
import {activity,currentPlaceId} from './presentation.js';
import {openSimsCatalog} from './open_sims.js';
import {busy,loadTown} from './engine.js';
import {recall} from './memory.js';
import {llmChat} from '../providers.js';
import {withPrincipal} from '../byok.js';
import {preflight,debitCall,EST} from '../credits.js';
const err=(statusCode,message)=>Object.assign(new Error(message),{statusCode});
const media=(id,variant)=>id?'/api/living/library/'+encodeURIComponent(id)+'?variant='+variant:null;
// Absence of an action is not a journey; use only committed route state.
const sceneActivity=(state,catalog)=>state.route?'is on the way':activity(state.action?.kind,catalog)||'takes a moment to decide what to do next';
export function character(p,catalog){
  const profile=pj(p.profile,{}),state=pj(p.state,{});normalizeRomance({...p,profile,state});projectWellbeing({...p,profile,state},state.wellbeing?.updated_at||0);
  return {...p,base:{...profile,age:p.age,pronouns:p.gender==='female'?'she / her':'he / him',backstory:p.biography,goals:(state.psychology?.ambitions||[]).map(a=>a.title_de||a.title||a.description||a.kind),personality:state.psychology?.big_five},voice:p.gender==='female'?'Leda':'Puck',state:{...state,activity:sceneActivity(state,catalog),intentions:[state.current_desire,state.goal?.reason,...(state.psychology?.ambitions||[]).map(a=>a.title_de||a.title||a.description||a.kind)].filter(Boolean),emotions:(state.affect?.states||[]).map(e=>({name:e.label_de||e.label||e.id,intensity:e.intensity})),perceptions:state.perceptions||{},outfit:'everyday',outfits:p.asset_id?[{name:'everyday',cutout_asset_id:media(emotionAsset(p.asset_id,state.affect?.primary),'sprite')}]:[]},intro_tick_idx:0};
}
export async function stageView(world,query={}){
  const clock=db.prepare('SELECT * FROM lw_worlds WHERE world_id=?').get(world.id),catalog=await openSimsCatalog();
  let selected=query.sim?db.prepare('SELECT * FROM lw_sims WHERE world_id=? AND id=?').get(world.id,query.sim):null;
  if(query.sim&&!selected)throw err(404,'Sim not found.');
  if(!selected&&!query.place)selected=db.prepare('SELECT * FROM lw_sims WHERE world_id=? ORDER BY anchored DESC,rowid LIMIT 1').get(world.id);
  const selectedState=pj(selected?.state,{}),journey=selected&&!selected.location_id&&selectedState.route;
  const placeId=query.place||currentPlaceId(selected||{},selectedState);
  const place=db.prepare('SELECT * FROM lw_places WHERE world_id=? AND id=?').get(world.id,placeId);
  if(!place)throw err(404,'Place not found.');
  const cast=journey&&!query.place?[selected]:db.prepare('SELECT * FROM lw_sims WHERE world_id=? AND location_id=? ORDER BY anchored DESC,name LIMIT 16').all(world.id,place.id);
  if(selected&&!cast.some(p=>p.id===selected.id)){if(selected.location_id===place.id&&cast.length===16)cast.pop();cast.unshift(selected);}
  const beat=db.prepare('SELECT * FROM lw_beats WHERE world_id=? ORDER BY version DESC LIMIT 1').get(world.id);
  const events=beat?db.prepare('SELECT * FROM lw_events WHERE world_id=? AND beat_id=? AND location_id=? ORDER BY end DESC,rowid DESC LIMIT 20').all(world.id,beat.id,place.id).reverse():[];
  const authored=beat?db.prepare('SELECT speaker,text,mode,emotion FROM lw_scene_lines WHERE world_id=? AND beat_id=? AND location_id=? ORDER BY rowid LIMIT 40').all(world.id,beat.id,place.id):[];
  const narration=authored.length?authored:events.map(e=>({speaker:'narrator',text:e.description,mode:'speech'}));
  if(!narration.length)for(const p of cast.slice(0,12))narration.push({speaker:'narrator',text:p.name+': '+sceneActivity(pj(p.state,{}),catalog)+'.'});
  return {journey:journey?{simId:selected.id,destination:db.prepare('SELECT name FROM lw_places WHERE world_id=? AND id=?').get(world.id,journey.destination)?.name}:null,world:{...world,status:'live',tick_index:clock.version,sim_time:new Date(Date.UTC(2026,8,21)+clock.seconds*1000).toISOString()},simulation:clock,characters:cast.map(p=>character(p,catalog)),locations:[{...place,type:place.kind,description:place.purpose,music:db.prepare('SELECT music FROM lw_place_music WHERE world_id=? AND location_id=?').get(world.id,place.id)?.music,background_asset_id:media(place.asset_id,'full')}],paths:[],relationships:[],population:db.prepare('SELECT count(*) n FROM lw_sims WHERE world_id=?').get(world.id).n,occupants:db.prepare('SELECT count(*) n FROM lw_sims WHERE world_id=? AND location_id=?').get(world.id,place.id).n,lastTick:{idx:beat?.version||clock.version,pov_location_id:place.id,narration,mood_tag:world.mood,time_delta:beat?'+'+Math.round((beat.end-beat.start)/60)+'m':'now'}};
}
// One detailed branch, coarse distant branches. The response itself has a hard bound.
export function graphView(worldId,{focus,depth=0}={}){
  const all=db.prepare('SELECT id,parent_id,name,kind,asset_id,anchored,landmark FROM lw_places WHERE world_id=? ORDER BY rowid').all(worldId),byId=new Map(all.map(p=>[p.id,p])),children=new Map();
  for(const p of all){if(!children.has(p.parent_id))children.set(p.parent_id,[]);children.get(p.parent_id).push(p);}
  let at=byId.get(focus)||all.find(p=>p.kind==='city');
  if(focus&&!byId.has(focus))throw err(404,'Map focus not found.');
  const ancestors=[];for(let p=at;p;p=byId.get(p.parent_id))ancestors.unshift(p);
  const level=Math.max(0,Math.min(3,Number(depth)||0)),neighborhoods=all.filter(p=>p.kind==='neighborhood'),districts=all.filter(p=>p.kind==='district');
  const neighborhood=ancestors.find(p=>p.kind==='neighborhood'),house=ancestors.find(p=>p.kind==='building'&&!p.landmark),nodes=[];
  const overview=neighborhoods.length>32&&level===0?districts:neighborhoods;
  const expandHouse=level>=2&&house,expandNeighborhood=level>=1&&neighborhood;
  for(const p of overview.slice(0,48)){if(expandNeighborhood&&p.id===neighborhood.id){nodes.push({...p,coarse:true});for(const h of (children.get(p.id)||[]).slice(0,24)){if(expandHouse&&h.id===house.id){nodes.push({...h,coarse:true});nodes.push(...(children.get(h.id)||[]).slice(0,12).map(r=>({...r,detail:true,group:h.name})));}else nodes.push({...h,detail:true,group:p.name});}}else nodes.push({...p,coarse:level>0});}
  for(const p of all.filter(p=>p.landmark).slice(0,20)){if(level>=2&&ancestors.some(a=>a.id===p.id)){nodes.push({...p,coarse:true});nodes.push(...(children.get(p.id)||[]).slice(0,12).map(r=>({...r,detail:true,group:p.name})));}else nodes.push({...p,coarse:level>0});}
  const unique=[...new Map(nodes.map(p=>[p.id,p])).values()].slice(0,60),cols=Math.min(7,Math.max(3,Math.ceil(Math.sqrt(unique.length))));
  const counts=db.prepare('SELECT location_id,count(*) n FROM lw_sims WHERE world_id=? GROUP BY location_id').all(worldId),aggregate=new Map();
  for(const {location_id,n} of counts)for(let p=byId.get(location_id);p;p=byId.get(p.parent_id))aggregate.set(p.id,(aggregate.get(p.id)||0)+n);
  const visible=new Set(unique.map(p=>p.id)),resolve=id=>{for(let p=byId.get(id);p;p=byId.get(p.parent_id))if(visible.has(p.id))return p.id;return null;},projected=new Map();
  for(const e of db.prepare('SELECT from_id,to_id FROM lw_edges WHERE world_id=?').all(worldId)){const a=resolve(e.from_id),b=resolve(e.to_id);if(a&&b&&a!==b){const key=[a,b].sort().join('|');projected.set(key,{from_id:a,to_id:b});}}
  return {focus:at.id,depth:level,ancestors:ancestors.map(({asset_id,...p})=>p),nodes:unique.map((p,i)=>({...p,x:(i%cols)*178,y:Math.floor(i/cols)*132,occupants:aggregate.get(p.id)||0,thumbnail:p.coarse||i>=40?null:media(p.asset_id,'preview'),leaf:!(children.get(p.id)||[]).length})),edges:[...projected.values()],budget:60};
}
export async function converse(user,worldId,simId,{message,lang='de',channel='inner',modelCall}={}){
  if(busy.has(worldId))throw err(409,'Wait for the current simulation step.');
  const p=db.prepare('SELECT * FROM lw_sims WHERE world_id=? AND id=?').get(worldId,simId);if(!p)throw err(404,'Sim not found.');
  if(!message?.trim())throw err(400,'Write a message first.');
  busy.add(worldId);
  try{
    const clock=db.prepare('SELECT * FROM lw_worlds WHERE world_id=?').get(worldId),state=pj(p.state,{}),profile=pj(p.profile,{}),history=chatHistory(worldId,simId,channel).slice(-12),memory=recall(simId,message),catalog=await openSimsCatalog(),town=loadTown(worldId);
    if(!modelCall)preflight(user.id,EST.chat());
    const result=await (modelCall||((messages)=>withPrincipal(user,()=>llmChat(messages,{maxTokens:1800,reasoningEffort:'low'}))))([{role:'system',content:`Respond as this Sim in language ${lang}. ${channel==='inner'?'The user is a familiar inner voice; this is private reflection.':'The user speaks to the Sim in a calm conversation.'} Time is paused. You know only your biography, perceptions and personal memories supplied. User statements about outside events are claims, not verified facts. Never teleport, create resources, rewrite physical events or reveal another Sim\'s private thoughts. Family-friendly, age-appropriate. ${ROMANCE_INSTRUCTIONS} Return JSON {reply:string,thought:string,mood:string}; keep each below 150 words. You may also return reflection:{emotions:[{id,intensity}],needsDelta,focusGoalId,reason}. ${REFLECTION_INSTRUCTIONS}`},{role:'user',content:j({name:p.name,age:p.age,biography:p.biography,profile:{job:profile.job,interests:profile.interests},...personalSocialContext(town.byId.get(simId),town),...mindContext(town.byId.get(simId)),state:{thought:state.thought,mood:state.mood,activity:activity(state.action?.kind,catalog),needs:state.needs},memory,history,message:message.slice(0,2000)})}]);
    if(!modelCall)debitCall(user.id,result,'living_conversation',{worldId});
    let output;try{output=JSON.parse(result.content.replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{throw err(502,'The conversation did not return valid JSON.');}
    assertMinorSafeText([p],output);
    if(typeof output.reply!=='string'||!output.reply.trim())throw err(502,'No valid reply.');
    const reply=output.reply.slice(0,4000),thought=typeof output.thought==='string'?output.thought.slice(0,1500):state.thought;
    db.transaction(()=>{
      if(db.prepare('SELECT version FROM lw_worlds WHERE world_id=?').get(worldId).version!==clock.version)throw err(409,'The world changed. Please retry.');
      const id=uid('le_'),previousMind={wellbeing:structuredClone(state.wellbeing),needs:structuredClone(state.needs),affect:structuredClone(state.affect),focus_goal_id:state.focus_goal_id||null,current_desire:state.current_desire||null,thought_source:state.thought_source||null,thought_at:state.thought_at||null};
      state.thought=thought;state.thought_source='conversation';state.thought_at=clock.seconds;const person={...town.byId.get(simId),state},effects=reflect(person,conversationReflection(output),{id,conversationChannel:channel},clock.seconds);evaluateMind(person,clock.seconds,catalog);
      const afterMind={wellbeing:structuredClone(state.wellbeing),needs:structuredClone(state.needs),affect:structuredClone(state.affect),focus_goal_id:state.focus_goal_id||null,current_desire:state.current_desire||null,thought_source:state.thought_source||null,thought_at:state.thought_at||null},facts={previousMind,afterMind,effects,channel,message:message.slice(0,2000),reply,previousThought:town.byId.get(simId).state.thought||null,previousMood:town.byId.get(simId).state.mood||null,newThought:thought,newMood:state.mood};
      db.prepare('INSERT INTO lw_events VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,worldId,null,clock.seconds,clock.seconds,p.location_id,'conversation',j([simId]),j(facts),'Gespräch mit '+p.name+': '+reply,'user_conversation');
      db.prepare('INSERT INTO lw_journal VALUES (?,?,?,?,?,?,?)').run(simId,id,clock.seconds,channel==='inner'?'inner_dialogue':'conversation',message.slice(0,2000)+'\n'+reply,thought||reply,.6);
      state.thought=thought;if(channel==='talk')state.dialogue=reply;
      db.prepare('UPDATE lw_sims SET state=? WHERE id=?').run(j(state),simId);db.prepare('UPDATE lw_worlds SET version=version+1 WHERE world_id=?').run(worldId);
    })();return {reply,changed:true,state:character({...p,state:j(state)},catalog).state,simTime:clock.seconds};
  }finally{busy.delete(worldId);}
}
export function chatHistory(worldId,simId,channel='inner'){
  const rows=db.prepare("SELECT facts FROM lw_events WHERE world_id=? AND type='conversation' AND json_extract(participants,'$[0]')=? AND json_extract(facts,'$.channel')=? ORDER BY rowid DESC LIMIT 100").all(worldId,simId,channel).reverse();
  return rows.flatMap(row=>{const f=pj(row.facts,{});return [{role:'user',content:f.message},{role:'assistant',content:f.reply}];});
}
export function clearChat(worldId,simId,channel='inner'){
  if(busy.has(worldId))throw err(409,'Wait for the current step.');
  const rows=db.prepare("SELECT id,facts FROM lw_events WHERE world_id=? AND type='conversation' AND json_extract(participants,'$[0]')=? AND json_extract(facts,'$.channel')=? ORDER BY rowid").all(worldId,simId,channel);
  db.transaction(()=>{for(const row of rows)db.prepare('DELETE FROM lw_events WHERE id=?').run(row.id);if(rows.length){const p=db.prepare('SELECT state FROM lw_sims WHERE id=?').get(simId),state=pj(p.state,{}),first=pj(rows[0].facts,{}),last=pj(rows.at(-1).facts,{});if(state.thought===last.newThought)state.thought=first.previousThought;if(state.mood===last.newMood)state.mood=first.previousMood;if(state.dialogue===last.reply)state.dialogue=null;
    const currentMind={wellbeing:state.wellbeing,needs:state.needs,affect:state.affect,focus_goal_id:state.focus_goal_id||null,current_desire:state.current_desire||null,thought_source:state.thought_source||null,thought_at:state.thought_at||null};
    if(!Object.hasOwn(last.afterMind||{},'wellbeing'))delete currentMind.wellbeing;
    if(first.previousMind&&last.afterMind&&j(currentMind)===j(last.afterMind))Object.assign(state,first.previousMind);
    else {const erased=new Set(rows.map(r=>r.id));for(const e of state.affect?.states||[])e.components=(e.components||[]).filter(c=>!erased.has(c.cause?.evidence_id));if(last.afterMind&&state.focus_goal_id===last.afterMind.focus_goal_id)state.focus_goal_id=first.previousMind?.focus_goal_id||null;const clock=db.prepare('SELECT seconds FROM lw_worlds WHERE world_id=?').get(worldId).seconds;rebuildAffect({state},clock);}
    // Also covers mixed legacy/new conversations whose first snapshot has no
    // PERMA field. Preserve later activity evidence; erase only these sources.
    removeWellbeingSources({state},new Set(rows.map(r=>r.id)),db.prepare('SELECT seconds FROM lw_worlds WHERE world_id=?').get(worldId).seconds,{conversationChannel:channel});
    db.prepare('UPDATE lw_sims SET state=? WHERE id=?').run(j(state),simId);db.prepare('UPDATE lw_worlds SET version=version+1 WHERE world_id=?').run(worldId);}})();return {ok:true};
}
