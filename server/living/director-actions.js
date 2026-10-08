import {db} from './schema.js';
import {j,pj,uid} from '../db.js';
import {normalizeRomance,assertMinorSafeText} from './romance.js';
import {validateStoryNote,writeStoryNote} from './memory-tiers.js';
import {loadEconomy,transfer,commitEconomy} from './expanded/store.js';
export const DIRECTOR_ACTIONS=`Additional explicit, player-reviewed changes: {type:'edit_sim',id,needs?:{existingNeed:0..1},skills?:{existingSkill:0..1},attributes?:{existingAttribute:0..100},thought?:string}; {type:'move_sim',id,locationId}; {type:'adjust_cash',id,amountCents:integer,reason:string}; {type:'edit_relationship',id,otherId,closeness?:0..1,trust?:0..1,tension?:0..1}; {type:'rename_place',id,name}; {type:'story_note',id,title,text,kind,knownTo:[]}. These are proposals, never already applied. Do not propose changes without an explicit instruction. Values are absolute except adjust_cash, which is a signed change. No identity, age, consent, sexual preference or family rewrites. A deliberate move is an authorial relocation and cancels travel/actions. Money adjustments have a balanced external ledger entry. Notes are privileged author metadata, not automatically anyone's belief.`;
export const extraActionTypes=new Set(['edit_sim','move_sim','adjust_cash','edit_relationship','rename_place','story_note']);
export function validateDirectorAction(worldId,a){
 if(!extraActionTypes.has(a?.type))throw Error('Unsupported director action');
 const table=a.type==='rename_place'?'lw_places':'lw_sims',row=db.prepare('SELECT * FROM '+table+' WHERE world_id=? AND id=?').get(worldId,a.id);if(!row)throw Error('Target does not belong to this world.');
 const p={...row,state:pj(row.state,{}),profile:pj(row.profile,{})};
 if(a.type==='edit_sim'){
  let count=0;for(const [field,source,max] of [['needs',p.state.needs,1],['skills',p.state.skills,1],['attributes',p.state.aptitudes?.attributes,100]])if(a[field]!==undefined){if(!a[field]||typeof a[field]!=='object'||Array.isArray(a[field]))throw Error('Invalid attribute changes.');for(const [key,n] of Object.entries(a[field])){if(!Object.hasOwn(source||{},key)||!Number.isFinite(n)||n<0||n>max)throw Error('Unsupported value: '+key);count++;}}
  if(a.thought!==undefined){if(typeof a.thought!=='string'||a.thought.length>1000)throw Error('Invalid authored thought');count++;}if(!count)throw Error('Choose a change.');assertMinorSafeText([p],{thought:a.thought});
 }
 if(a.type==='move_sim'&&!db.prepare("SELECT 1 FROM lw_places WHERE world_id=? AND id=? AND kind='room'").get(worldId,a.locationId))throw Error('Choose a real room in this world.');
 if(a.type==='adjust_cash'&&(!Number.isSafeInteger(a.amountCents)||!a.amountCents||Math.abs(a.amountCents)>100000000||typeof a.reason!=='string'||a.reason.length<3||a.reason.length>500))throw Error('Supply a signed amount in cents, up to one million, and a reason.');
 if(a.type==='edit_relationship'){if(a.otherId===a.id||!db.prepare('SELECT 1 FROM lw_sims WHERE world_id=? AND id=?').get(worldId,a.otherId))throw Error('Choose another Sim in this world.');let n=0;for(const k of ['closeness','trust','tension'])if(a[k]!==undefined){if(!Number.isFinite(a[k])||a[k]<0||a[k]>1)throw Error('Relationships use 0–1.');n++;}if(!n)throw Error('Choose a relationship value.');}
 if(a.type==='rename_place'&&(typeof a.name!=='string'||!a.name.trim()||a.name.length>160))throw Error('Use a place name of 1–160 characters.');
 if(a.type==='story_note'){validateStoryNote(worldId,{...a,simId:a.id});assertMinorSafeText([p],{text:a.text});}
 return p;
}
// Caller validates ALL actions, then holds the world lock and a DB transaction.
export function applyDirectorAction(worldId,a,time){
 const p=validateDirectorAction(worldId,a);let eventText;
 if(a.type==='story_note'){writeStoryNote(worldId,{...a,simId:a.id},time,'game_master');return;}
 if(a.type==='rename_place'){db.prepare('UPDATE lw_places SET name=? WHERE world_id=? AND id=?').run(a.name.trim(),worldId,a.id);return;}
 if(a.type==='edit_sim'){Object.assign(p.state.needs,a.needs);Object.assign(p.state.skills,a.skills);Object.assign(p.state.aptitudes.attributes,a.attributes);if(a.thought!==undefined)p.state.thought=a.thought;normalizeRomance(p);eventText='The author explicitly revised selected present-state values for '+p.name+'. This is an intervention, not earned practice or a new historical experience.';}
 if(a.type==='move_sim'){p.state.location_id=a.locationId;p.state.route=null;p.state.action=null;p.state.socialUntil=0;p.state.conversation=null;p.state.pausedTasks=[];eventText='The author explicitly relocated '+p.name+' to another room. No journey is implied.';}
 if(a.type==='adjust_cash'){
  const d=loadEconomy(worldId),personal=[...d.accounts.values()].find(x=>x.owner_id===p.id&&x.kind==='personal'),external=[...d.accounts.values()].find(x=>x.kind==='external');if(!personal||!external)throw Error('The required accounts are missing.');
  const result=transfer(d,a.amountCents>0?external.id:personal.id,a.amountCents>0?personal.id:external.id,Math.abs(a.amountCents),{key:{kind:'director_adjustment',nonce:uid('god_')},kind:'director_adjustment',at:time,metadata:{reason:a.reason,simId:a.id}});if(!result.ok)throw Error('The requested withdrawal exceeds available funds.');commitEconomy(d);p.state.economy.cashCents=personal.balance_cents;eventText='An explicit authorial cash adjustment of '+(a.amountCents/100).toFixed(2)+' was made for '+p.name+': '+a.reason;
 }
 if(a.type==='edit_relationship'){
  const row=db.prepare('SELECT payload FROM lw_relations WHERE world_id=? AND from_id=? AND to_id=?').get(worldId,a.id,a.otherId),r=pj(row?.payload,{kind:'Acquaintance',closeness:0,trust:.5,tension:0});for(const k of ['closeness','trust','tension'])if(a[k]!==undefined)r[k]=a[k];r.authorRevision={at:time,source:'game_master'};db.prepare('INSERT INTO lw_relations VALUES (?,?,?,?) ON CONFLICT(world_id,from_id,to_id) DO UPDATE SET payload=excluded.payload').run(worldId,a.id,a.otherId,j(r));eventText='The author revised '+p.name+'’s perspective on a relationship. The other person’s feelings were not automatically changed.';
 }
 db.prepare('UPDATE lw_sims SET state=?,location_id=? WHERE world_id=? AND id=?').run(j(p.state),p.state.location_id,worldId,p.id);
 const id=uid('le_');db.prepare('INSERT INTO lw_events VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,worldId,null,time,time,p.state.location_id,'author_intervention',j([p.id]),j({action:a.type,authorial:true}),eventText,'game_master');db.prepare('INSERT INTO lw_journal VALUES (?,?,?,?,?,?,?)').run(p.id,id,time,'author_intervention',eventText,'My present circumstances were explicitly changed by the author; this is not a recollection of an ordinary event.',1);
}
