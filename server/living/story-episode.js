// A player's time advance is one narrative episode, not one request per five
// minutes. This projection only reduces prompt detail; it never deletes events
// or replaces a Sim's complete procedural experience log.
const cut=(s,n)=>typeof s==='string'?s.slice(0,n):s;
const actors=e=>[...e.participants,...e.witnesses||[]];
const routine=new Set(['arrival','departure','action_started','action_resumed','action_completed','status']);
function importance(e,anchors){
  if(e.type==='intervention')return 100;
  const direct=e.participants.some(id=>anchors.has(id));
  return (direct?20:0)+(e.type==='social'?12:0)+(!routine.has(e.type)?9:0)+(e.type==='action_interrupted'?10:0);
}
function promptEvent(e){
  // Numerical replay internals, catalogs and duplicated whole mental states can
  // dominate a long episode. Keep causes, outcomes, privacy, consent and ages;
  // the read-only tools expose the complete original event when needed.
  const {catalog,anticipatedViews,socialViews,personalExperiences,mentalEffects,wellbeingEffects,path,...facts}=e.facts||{};
  return {id:e.id,start:e.start,end:e.end,type:e.type,location_id:e.location_id,
    participants:e.participants,witnesses:e.witnesses,source:e.source,
    description:cut(e.description,2000),facts};
}
export function storyEpisode(field,town,events,{start,end,targetId}={}){
  const owned=new Set(field.members),anchors=new Set(field.members.filter(id=>town.byId.get(id)?.anchored||id===targetId));
  const relevant=events.filter(e=>actors(e).some(id=>owned.has(id))),bySim=new Map(field.members.map(id=>[id,[]]));
  const scores=new Map(field.members.map(id=>[id,anchors.has(id)?10000:0]));
  for(const e of relevant){for(const id of actors(e))bySim.get(id)?.push(e);
    if(e.participants.some(id=>anchors.has(id)))for(const id of actors(e))if(owned.has(id))scores.set(id,scores.get(id)+importance(e,anchors));}
  for(const id of field.members){const reasons=field.reasons[id]||[];
    if(reasons.some(r=>r.startsWith('location_anchor:')))scores.set(id,scores.get(id)+200);
    if(reasons.some(r=>r.startsWith('co_presence:')))scores.set(id,scores.get(id)+50);
  }
  // Every character anchor remains detailed; use remaining detail slots for the
  // people actually involved in their encounters and anchored locations.
  const ranked=field.members.slice().sort((a,b)=>scores.get(b)-scores.get(a)||a.localeCompare(b));
  const focusIds=ranked.slice(0,Math.max(24,anchors.size)),focus=new Set(focusIds),chosen=new Map();
  const keep=e=>{if(e)chosen.set(e.id,e);};
  for(const id of field.members){
    const personal=bySim.get(id),direct=personal.filter(e=>e.participants.includes(id));
    // At least one valid, directly experienced event for every supporting Sim.
    keep(direct.at(-1));
    if(!focus.has(id))continue;
    personal.filter(e=>e.type==='intervention').forEach(keep);
    // Cover the whole requested interval, not merely its final few minutes.
    for(let bin=0;bin<6;bin++){
      const from=start+(end-start)*bin/6,to=start+(end-start)*(bin+1)/6;
      const section=personal.filter(e=>e.end>=from&&(bin===5?e.end<=to:e.end<to));
      section.sort((a,b)=>importance(b,anchors)-importance(a,anchors)||a.end-b.end).slice(0,3).forEach(keep);
    }
    direct.slice(0,1).forEach(keep);direct.slice(-2).forEach(keep);
  }
  // Intervention consequences and interruptions involving an anchor must not
  // disappear because another event ranked higher in the same time window.
  relevant.filter(e=>e.type==='intervention'||(e.participants.some(id=>anchors.has(id))&&!routine.has(e.type))).forEach(keep);
  const summaries=field.members.map(id=>{
    const p=town.byId.get(id),personal=bySim.get(id),counts={};
    for(const e of personal)counts[e.type]=(counts[e.type]||0)+1;
    return {id,name:p.name,age:p.age,location:p.state.location_id,job:p.profile.job,
      anchored:!!p.anchored,events:personal.length,counts,
      currentAction:p.state.action?.kind,feeling:p.state.affect?.primary,
      ownThought:cut(p.state.thought,220),
      urgentNeeds:Object.fromEntries(Object.entries(p.state.needs||{}).filter(([,n])=>n>=.65)),
      firstEventId:personal[0]?.id,lastEventId:personal.at(-1)?.id};
  });
  return {focusIds,events:[...chosen.values()].sort((a,b)=>a.end-b.end||a.id.localeCompare(b.id)).map(promptEvent),
    supportingSims:summaries.filter(p=>!focus.has(p.id)),
    chronology:summaries.filter(p=>focus.has(p.id)),
    coverage:{committedAfterValidation:relevant.length,provided:chosen.size,policy:'One episode for the entire requested interval. Detailed profiles for all character anchors and the most involved contacts; supporting residents remain visible as brief cards. Events are sampled across six chronological windows, with all anchor interventions and non-routine anchor events retained. Complete minute events and personal memories remain available through tools and are saved independently of narration. Only focusSimIds require model-written thoughts; supporting Sims keep their procedural perspectives unless explicitly narrated.'}};
}
