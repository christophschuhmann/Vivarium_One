import {DIRECTOR_ACTIONS,extraActionTypes,validateDirectorAction,applyDirectorAction} from './director-actions.js';
import {refreshMemorySummaries} from './memory-tiers.js';
import {worldTools,agenticChat} from './agent-tools.js';
import {ROMANCE_INSTRUCTIONS,assertMinorSafeText} from './romance.js';
import {db} from './schema.js';
import {uid,j,pj,now} from '../db.js';
import {busy,authorBiographies,recordBiography} from './engine.js';
import {stageView} from './vivarium.js';
import {llmChat} from '../providers.js';
import {withPrincipal} from '../byok.js';
import {preflight,debitCall,EST} from '../credits.js';
const error=(code,message)=>Object.assign(new Error(message),{statusCode:code});
export async function directorChat(user,world,message,lang='de',modelCall,perspective){
  if(!message.trim())throw error(400,'Write a message first.');
  const view=await stageView(world,perspective?.type==='character'?{sim:perspective.id}:perspective?.type==='location'?{place:perspective.id}:{}),anchors=db.prepare('SELECT id,name,age,biography FROM lw_sims WHERE world_id=? AND anchored=1 LIMIT 20').all(world.id),places=db.prepare('SELECT id,name,kind FROM lw_places WHERE world_id=? AND anchored=1 LIMIT 20').all(world.id),history=db.prepare("SELECT role,content FROM chat_logs WHERE world_id=? AND surface='gm_chat' ORDER BY rowid DESC LIMIT 16").all(world.id).reverse();
  if(!modelCall)preflight(user.id,EST.chat());
  const result=await agenticChat([{role:'system',content:`You are the Vivarium Living World director. Answer in ${lang}. Discuss the supplied town, personal perspectives and plausible narrative direction. There is no player/NPC distinction. Time remains paused. Propose only supported changes and never claim they already happened. Return strict JSON {reply:string,actions:[{type:'set_anchor',kind:'sim'|'place',id,enabled:boolean}|{type:'write_biography',id,instruction:string}]}. Use retrieval to find other residents, places, evidence and resources. Proposed changes must be explicitly requested by the user; research itself never changes the world. You can target retrieved IDs in this world. Do not confuse private beliefs or author notes with witnessed events. Do not fabricate stored events. Authored backgrounds preserve age, household and family facts. ${ROMANCE_INSTRUCTIONS} ${DIRECTOR_ACTIONS}`},{role:'user',content:j({title:world.title,population:view.population,clock:view.world.sim_time,viewedSims:view.characters.map(c=>({id:c.id,name:c.name,age:c.age,thought:c.state.thought,needs:c.state.needs})),viewedPlaces:view.locations.map(p=>({id:p.id,name:p.name})),anchors,placeAnchors:places,history,message:message.slice(0,4000)})}],modelCall||(messages=>withPrincipal(user,()=>llmChat(messages,{maxTokens:4000,reasoningEffort:'low'}))),worldTools(world.id),{onCall:r=>{if(!modelCall)debitCall(user.id,r,'living_director',{worldId:world.id});}});
  let output;try{output=JSON.parse(result.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g,''));}catch{throw error(502,'Invalid director response.');}
  assertMinorSafeText(view.characters,output);
  if(typeof output.reply!=='string')throw error(502,'No director reply.');
  const simIds=new Set(db.prepare('SELECT id FROM lw_sims WHERE world_id=?').all(world.id).map(p=>p.id)),placeIds=new Set(db.prepare('SELECT id FROM lw_places WHERE world_id=?').all(world.id).map(p=>p.id));
  const actions=(Array.isArray(output.actions)?output.actions:[]).slice(0,8).filter(a=>a.type==='set_anchor'&&typeof a.enabled==='boolean'&&(a.kind==='sim'?simIds.has(a.id):a.kind==='place'&&placeIds.has(a.id))||a.type==='write_biography'&&simIds.has(a.id)&&typeof a.instruction==='string'||extraActionTypes.has(a.type)&&(a.type==='rename_place'?placeIds:simIds).has(a.id)).filter(a=>{if(!extraActionTypes.has(a.type))return true;try{validateDirectorAction(world.id,a);return true;}catch{return false;}});
  for(const action of actions)action.name=[...view.characters,...anchors,...view.locations,...places].find(p=>p.id===action.id)?.name;
  const out={reply:output.reply.slice(0,7000),actions};db.transaction(()=>{for(const [role,content] of [['user',message.slice(0,4000)],['assistant',j(out)]])db.prepare('INSERT INTO chat_logs VALUES (?,?,?,?,?,?,?)').run(uid('chat_'),user.id,world.id,'gm_chat',role,content,now());})();return out;
}
export async function directorApply(user,world,actions){
  if(busy.has(world.id))throw error(409,'Wait for the current step.');
  if(!Array.isArray(actions)||actions.length>8)throw error(400,'Invalid director actions.');
  // Validate the complete request before any mutation or paid biography call.
  for(const a of actions){if(extraActionTypes.has(a.type)){validateDirectorAction(world.id,a);continue;}const table=a.type==='write_biography'?'lw_sims':a.type==='set_anchor'&&['sim','place'].includes(a.kind)?(a.kind==='sim'?'lw_sims':'lw_places'):null;if(!table||!db.prepare('SELECT 1 FROM '+table+' WHERE world_id=? AND id=?').get(world.id,a.id)||a.type==='set_anchor'&&typeof a.enabled!=='boolean'||a.type==='write_biography'&&typeof a.instruction!=='string')throw error(400,'Unsupported or foreign director action.');}
  busy.add(world.id);try{
    const prepared=[];for(const a of actions)if(a.type==='write_biography'){const p=db.prepare('SELECT * FROM lw_sims WHERE id=?').get(a.id);p.profile=pj(p.profile,{});p.state=pj(p.state,{});await authorBiographies(user,[p],a.instruction.slice(0,3000));prepared.push(p);}
    db.transaction(()=>{db.prepare('UPDATE lw_worlds SET version=version+1 WHERE world_id=?').run(world.id);const clock=db.prepare('SELECT version,seconds FROM lw_worlds WHERE world_id=?').get(world.id);for(const a of actions)if(a.type==='set_anchor'){const table=a.kind==='sim'?'lw_sims':'lw_places';db.prepare('UPDATE '+table+' SET anchored=? WHERE id=?').run(+a.enabled,a.id);if(a.kind==='sim'&&a.enabled)db.prepare("UPDATE lw_sims SET biography_mode='written_pending' WHERE id=? AND biography_mode='procedural'").run(a.id);db.prepare('INSERT INTO lw_anchor_audit(world_id,entity_id,kind,enabled,version) VALUES (?,?,?,?,?)').run(world.id,a.id,a.kind,+a.enabled,clock.version);}for(const a of actions)if(extraActionTypes.has(a.type))applyDirectorAction(world.id,a,clock.seconds);for(const a of actions)if(a.type==='set_anchor'&&a.kind==='sim'&&a.enabled)refreshMemorySummaries(world.id,clock.seconds,a.id);for(const p of prepared){db.prepare("UPDATE lw_sims SET biography=?,biography_mode='written' WHERE id=?").run(p.biography,p.id);recordBiography(world.id,p,clock.seconds);}})();
    return {results:actions.map(a=>({ok:true,summary:a.type==='write_biography'?'Biography updated.':a.type==='set_anchor'?'Anchor '+(a.enabled?'enabled.':'disabled.'):'Applied '+a.type.replaceAll('_',' ')+'.'}))};
  }finally{busy.delete(world.id);}
}
