import {db} from './schema.js';
import {uid,j,pj,now} from '../db.js';
import {withPrincipal} from '../byok.js';
import {preflight,debitCall,EST} from '../credits.js';
import {llmChat} from '../providers.js';
import {worldTools,agenticChat} from './agent-tools.js';
import {DR_WELL_PROMPT} from './drama/dr-well-prompt.js';
import {ROMANCE_INSTRUCTIONS,assertMinorSafeText} from './romance.js';
export function advisorHistory(worldId){return db.prepare("SELECT role,content FROM chat_logs WHERE world_id=? AND surface='dr_well' ORDER BY rowid DESC LIMIT 16").all(worldId).reverse();}
export async function advisorChat(user,world,{message,simId,lang='en'},modelCall){
 if(typeof message!=='string'||!message.trim()||message.length>6000)throw Object.assign(Error('Write a question of up to 6,000 characters.'),{statusCode:400});
 const tools=worldTools(world.id),context=simId?await tools('sim',{id:simId}):{town:world.title,monitor:await tools('monitor')};
 if(!modelCall)preflight(user.id,EST.chat());
 const messages=[{role:'system',content:DR_WELL_PROMPT+'\n'+ROMANCE_INSTRUCTIONS+'\nPreferred language: '+(lang==='de'?'German':'English')},{role:'user',content:j({context,history:advisorHistory(world.id),message})}];
 const result=await agenticChat(messages,modelCall||(m=>withPrincipal(user,()=>llmChat(m,{maxTokens:4000,reasoningEffort:'low',allowToolCalls:true}))),tools,{onCall:r=>{if(!modelCall)debitCall(user.id,r,'dr_well',{worldId:world.id});}}),out=JSON.parse(result.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g,''));
 if(typeof out.reply!=='string')throw Error('Dr. Well did not return an answer.');
 // Only the reply and validated navigation references leave this read-only role.
 // A model-supplied actions/tool mutation object is intentionally discarded.
 const subjects=simId?db.prepare('SELECT age FROM lw_sims WHERE world_id=? AND id=?').all(world.id,simId):[];assertMinorSafeText(subjects,out);
 const references=(Array.isArray(out.references)?out.references:[]).slice(0,12).filter(r=>r&&['sim','place'].includes(r.kind)&&db.prepare('SELECT 1 FROM '+(r.kind==='sim'?'lw_sims':'lw_places')+' WHERE world_id=? AND id=?').get(world.id,r.id)).map(r=>({kind:r.kind,id:r.id,label:String(r.label||r.id).slice(0,120)}));
 const answer={reply:out.reply.slice(0,14000),references,toolUsage:result.toolUsage};db.transaction(()=>{for(const [role,content] of [['user',message],['assistant',j(answer)]])db.prepare('INSERT INTO chat_logs VALUES (?,?,?,?,?,?,?)').run(uid('chat_'),user.id,world.id,'dr_well',role,content,now());})();return answer;
}
