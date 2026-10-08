import './expanded/store.js';
import {db} from './schema.js';
import {j,pj,uid} from '../db.js';
const DAY=86400;
const entry=db.prepare("SELECT id,payload FROM lw_economy_entities WHERE world_id=? AND kind='memory_summary' AND owner_id=?");
const save=db.prepare('INSERT INTO lw_economy_entities(id,world_id,kind,owner_id,payload) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload');
const text=(s,n=240)=>String(s||'').replace(/\s+/g,' ').slice(0,n);
// Extractive, provenance-linked compression: no invented connections, diagnoses,
// secrets or memories. Rebuild only newly completed days and changing tiers.
function summarize(worldId,id,from,to,max=5){
 const count=db.prepare('SELECT count(*) n FROM lw_journal WHERE sim_id=? AND observed_at>=? AND observed_at<?').get(id,from,to).n;
 const records=db.prepare(`SELECT e.id,e.description,j.perception,j.interpretation,j.confidence,j.channel,j.observed_at FROM lw_journal j JOIN lw_events e ON e.id=j.event_id WHERE e.world_id=? AND j.sim_id=? AND j.observed_at>=? AND j.observed_at<? ORDER BY CASE WHEN e.type IN ('social','eviction','hired','job_lost','care_session','crime','birth','death','divorce') THEN 0 ELSE 1 END,j.observed_at DESC LIMIT 100`).all(worldId,id,from,to);
 const unique=new Map();for(const r of records){const key=text(r.description,120);if(!unique.has(key))unique.set(key,r);}const chosen=[...unique.values()].slice(0,max).sort((a,b)=>a.observed_at-b.observed_at);
 return {from,to,totalRecords:count,selectedRecords:chosen.length,facts:chosen.map(r=>({eventId:r.id,at:r.observed_at,text:text(r.description)})),memories:chosen.map(r=>({eventId:r.id,at:r.observed_at,text:text(r.interpretation||r.perception),confidence:r.confidence,channel:r.channel})),method:'salience-ranked extracts, not a complete account; retrieve omitted original records'};
}
export function refreshMemorySummaries(worldId,time,onlyId=null){
 const today=Math.floor(time/DAY),sims=onlyId?[{id:onlyId}]:db.prepare('SELECT id FROM lw_sims WHERE world_id=? AND anchored=1').all(worldId);let updated=0;
 for(const {id} of sims){if(!db.prepare('SELECT 1 FROM lw_sims WHERE world_id=? AND id=?').get(worldId,id))continue;const old=entry.get(worldId,id),value=pj(old?.payload,{});if(value.completedThroughDay===today)continue;
  const first=Math.floor((db.prepare('SELECT min(observed_at) start FROM lw_journal WHERE sim_id=?').get(id)?.start||0)/DAY),weeks=value.weeks||[];
  const completedWeeks=Math.floor(Math.max(first,today-7)/7);for(let w=Math.max(Math.floor(first/7),value.completedWeeks||0);w<completedWeeks;w++){const summary=summarize(worldId,id,w*7*DAY,(w+1)*7*DAY,6);if(summary.totalRecords)weeks.push(summary);}
  const days=[];for(let day=Math.max(first,completedWeeks*7);day<today-1;day++){const summary=summarize(worldId,id,day*DAY,(day+1)*DAY,5);if(summary.totalRecords)days.push(summary);}
  const yesterday=[];for(let h=0;h<24;h+=2){const from=(today-1)*DAY+h*3600,summary=summarize(worldId,id,from,from+7200,1);if(summary.totalRecords)yesterday.push(summary);}
  save.run(old?.id||uid('mem_'),worldId,'memory_summary',id,j({completedThroughDay:today,completedWeeks,weeks,days,yesterday,updatedAt:time}));updated++;
 }return updated;
}
export function memoryContext(worldId,id,time){
 const clock=time??db.prepare('SELECT seconds FROM lw_worlds WHERE world_id=?').get(worldId)?.seconds??0,summary=pj(entry.get(worldId,id)?.payload,{});
 const recent=db.prepare('SELECT e.id,e.description facts,j.interpretation memory,j.confidence,j.observed_at FROM lw_journal j JOIN lw_events e ON e.id=j.event_id WHERE j.sim_id=? AND e.world_id=? AND j.observed_at>=? ORDER BY j.observed_at DESC LIMIT 8').all(id,worldId,clock-DAY);
 return {recent,yesterday:summary.yesterday||[],days:summary.days||[],weeks:(summary.weeks||[]).slice(-8),olderWeeksOmitted:Math.max(0,(summary.weeks?.length||0)-8),summaryAsOf:summary.updatedAt,policy:'Author-observed facts and subjective interpretation are separate. Extracts omit details: use journal queries for older evidence. Raw records are never deleted.'};
}
export function storyNotes(worldId,id){return db.prepare("SELECT id,payload FROM lw_economy_entities WHERE world_id=? AND kind='story_note' AND owner_id=? ORDER BY coalesce(json_extract(payload,'$.importance'),.5) DESC,rowid DESC LIMIT 8").all(worldId,id).map(r=>({id:r.id,...pj(r.payload,{})}));}
export function validateStoryNote(worldId,n,allowedIds=null){
 if(!n||!db.prepare('SELECT 1 FROM lw_sims WHERE world_id=? AND id=?').get(worldId,n.simId)||allowedIds&&!allowedIds.has(n.simId)||typeof n.text!=='string'||!n.text.trim()||n.text.length>1600)throw Error('Invalid storyteller note.');
 const knownTo=Array.isArray(n.knownTo)?n.knownTo.slice(0,20):[];for(const id of knownTo)if(!db.prepare('SELECT 1 FROM lw_sims WHERE world_id=? AND id=?').get(worldId,id))throw Error('Foreign knowledge recipient.');
 return {simId:n.simId,text:n.text.trim(),title:text(n.title||'Author note',100),kind:['secret','foreshadowing','magic','motive','continuity'].includes(n.kind)?n.kind:'continuity',knownTo,importance:Math.max(0,Math.min(1,Number(n.importance)||.5)),status:'active',epistemic:'authorial note; not automatically a Sim memory or an enacted physical effect'};
}
export function writeStoryNote(worldId,n,time,source){const note=validateStoryNote(worldId,n);save.run(uid('note_'),worldId,'story_note',note.simId,j({...note,at:time,source}));}
