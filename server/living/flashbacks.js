// Presentation-only historical scenes. Their evidence and cast come from the
// minute ledger; playback never rewinds, re-simulates or changes the live world.
import {emotionAsset} from './asset-catalog.js';
import {MAX_FLASHBACK_LINES} from './scene-writing.js';
const media=(id,variant)=>id?'/api/living/library/'+encodeURIComponent(id)+'?variant='+variant:null;
const at=seconds=>new Date(Date.UTC(2026,8,21)+seconds*1000).toISOString();
const involved=(e,id)=>e.participants.includes(id)||(!e.facts?.private&&e.witnesses?.includes(id));
export function flashbackPlan(town,ids,events,start,end){
  const minutes=(end-start)/60,maxPerAnchor=minutes<60?0:minutes===60?1:2;
  const anchors=ids.filter(id=>town.byId.get(id)?.anchored);
  return {maxPerAnchor,anchors,policy:'Optional highlights only. One compact screenplay scene per character anchor at exactly one hour; up to two for longer advances. Each scene may use 200–300 words when needed, with explicit initiating actions, dialogue and the outcome; shorter is fine. Omit routine stretches. Use a supplied actual event before the final five minutes, never fabricate a turning point. Normal narration is the present-day landing scene, separate from these flashbacks.',candidates:maxPerAnchor?anchors.map(simId=>({simId,events:events.filter(e=>involved(e,simId)&&e.end<end-300&&e.location_id&&town.places.has(e.location_id)).sort((a,b)=>Number(b.type==='intervention')-Number(a.type==='intervention')||Number(b.type==='social')-Number(a.type==='social')||b.end-a.end).slice(0,12).sort((a,b)=>a.end-b.end).map(e=>({eventId:e.id,at:at(e.end),locationId:e.location_id,type:e.type,description:e.description.slice(0,800)}))})):[]};
}
export function validateFlashbacks(proposals,{town,events,ids,start,end}){
  const plan=flashbackPlan(town,ids,events,start,end),allowed=new Set(plan.anchors),byEvent=new Map(events.map(e=>[e.id,e])),counts=new Map(),seen=new Set(),scenes=[];
  if(!plan.maxPerAnchor)return scenes;
  for(const p of (Array.isArray(proposals)?proposals:[]).slice(0,plan.anchors.length*2+4)){
    const e=byEvent.get(p?.eventId),place=town.places.get(e?.location_id);
    if(!allowed.has(p?.simId)||!e||!place||e.end<start||e.end>=end-300||!involved(e,p.simId)||seen.has(p.simId+':'+e.id)||(counts.get(p.simId)||0)>=plan.maxPerAnchor)continue;
    const castIds=[p.simId,...e.participants.filter(id=>id!==p.simId)].filter(id=>town.byId.has(id)).slice(0,8),cast=new Set(castIds);
    const narration=(Array.isArray(p.narration)?p.narration:[]).slice(0,MAX_FLASHBACK_LINES).filter(n=>n&&typeof n.text==='string'&&n.text.trim()&&['speech','thought'].includes(n.mode)&& (n.speaker==='narrator'||cast.has(n.speaker))).map(n=>({speaker:n.speaker,text:n.text.trim().slice(0,1400),mode:n.mode,emotion:String(n.emotion||'').slice(0,80)}));
    if(!narration.length)continue;
    const ordinal=counts.get(p.simId)||0;counts.set(p.simId,ordinal+1);seen.add(p.simId+':'+e.id);
    const characters=castIds.map(id=>{
      const c=town.byId.get(id),experience=e.personalExperiences?.[id]||e.facts?.personalExperiences?.[id];
      // No end-of-hour feelings disguised as a historical snapshot. When the
      // minute record has no affect, use the neutral portrait.
      const affect=experience?.emotions?{states:experience.emotions,primary:experience.emotions[0]?.id}:null;
      const state={location_id:place.id,outfit:'everyday',outfits:c.asset_id?[{name:'everyday',cutout_asset_id:media(emotionAsset(c.asset_id,affect),'sprite')}]:[],thought:experience?.thought||'',dialogue:narration.find(n=>n.speaker===id&&n.mode==='speech')?.text||''};
      return {id,name:c.name,age:c.age,gender:c.gender,colour:c.colour,voice:c.gender==='female'?'Leda':'Puck',state};
    });
    scenes.push({simId:p.simId,eventId:e.id,ordinal,seconds:e.end,title:String(p.title||town.byId.get(p.simId).name+' · Earlier').slice(0,120),characters,locations:[{id:place.id,name:place.name,background_asset_id:media(place.asset_id,'full')}],tick:{sim_time:at(e.end),pov_location_id:place.id,time_delta:'earlier',mood_tag:'Earlier',narration,states:characters.map(c=>({...c.state,character_id:c.id}))}});
  }
  return scenes.sort((a,b)=>a.seconds-b.seconds||a.simId.localeCompare(b.simId));
}
