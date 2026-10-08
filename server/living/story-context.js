// These are deterministic, display-only projections. Full state, journals and
// author notes remain in the database and are available through the agent tools.
const list = x => Array.isArray(x) ? x : [];
const text = (x,n) => typeof x === 'string' ? x.slice(0,n) : x;
const pick = (x,keys) => x && typeof x === 'object' ? Object.fromEntries(keys.filter(k=>x[k]!==undefined).map(k=>[k,x[k]])) : x;
const round = x => {
  if(typeof x==='number')return Number.isInteger(x)?x:Math.round(x*1000)/1000;
  if(Array.isArray(x))return x.map(round);
  if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).filter(([,v])=>v!==undefined).map(([k,v])=>[k,round(v)]));
  return x;
};
export function compactStoryContext(context) {
  const owned=new Set(context.owned),important=new Set(context.sims.filter(p=>p.id===context.intervention?.targetId||(context.field.reasons[p.id]||[]).some(r=>/anchor/.test(r))).map(p=>p.id));
  const neighborhoodValues=new Map();
  let sims=context.sims.map(p=>{
    const focused=important.has(p.id),resources=p.resources||{},education=resources.ownEducation||{};
    const expectations=p.socialExpectations||{},route=p.route;
    const rank=r=>(owned.has(r.id)?3:0)+(r.tension||0)*3+(r.closeness||0)+( /partner|spouse|parent|child|mother|father|husband|wife/i.test(r.kind||'')?2:0);
    const orderedRelations=list(p.relationships).slice().sort((a,b)=>rank(b)-rank(a));
    const relations=orderedRelations.slice(0,focused?12:6).map((r,i)=>({...pick(r,['id','name','kind','closeness','trust','tension','lastInteraction']),background:r.background&&(focused||i<2||r.tension>.3)?{source:r.background.source,sharedHistory:text(r.background.sharedHistory,focused?400:160),thread:text(r.background.thread,180),topic:r.background.topic}:undefined}));
    const memory={...p.memory,recent:list(p.memory?.recent).slice().sort((a,b)=>Number(!/arriv|depart/i.test(b.type||b.description||b.facts||''))-Number(!/arriv|depart/i.test(a.type||a.description||a.facts||''))).slice(0,focused?8:3).map(r=>({eventId:r.eventId||r.id,at:r.observed_at,channel:r.channel,confidence:r.confidence,facts:text(r.facts||r.description,focused?650:320),memory:text(r.memory||r.interpretation,focused?650:320)}))};
    const neighborhoodKey=JSON.stringify(p.neighborhood);if(p.neighborhood&&!neighborhoodValues.has(neighborhoodKey))neighborhoodValues.set(neighborhoodKey,{id:'area-'+neighborhoodValues.size,...p.neighborhood});
    return {...p,biography:text(p.biography,focused?1800:450),ownThought:undefined,neighborhood:p.neighborhood?neighborhoodValues.get(neighborhoodKey).id:undefined,
      relationshipCoverage:{shown:relations.length,total:list(p.relationships).length,policy:'Prioritized present contacts, family, closeness and tension; retrieve others with relations.'},
      initialBackground:pick(p.initialBackground,['source','kind','title','thought','otherId']),
      aptitudes:{attributes:p.aptitudes?.attributes,social_skills:p.aptitudes?.social_skills,last_check:pick(p.aptitudes?.last_check,['task','grade','roll','threshold','eventId'])},
      relationships:relations,
      // Current intensities and actual causes matter; repeated ontology/component
      // definitions and per-Sim copies of explanatory UI text do not.
      emotions:{primary:p.emotions?.primary,updated_at:p.emotions?.updated_at,states:list(p.emotions?.states).map(e=>({id:e.id,intensity:e.intensity,activated_at:e.activated_at,expires_at:e.expires_at,causes:list(e.causes).slice(-3).map(c=>typeof c==='string'?text(c,240):pick(c,['text','description','eventId','source','at','weight']))})),self_narrative:text(p.emotions?.self_narrative,300)},
      wellbeing:{scores:p.wellbeing?.scores,summary:p.wellbeing?.summary,recentOwnSources:list(p.wellbeing?.recentOwnSources).slice(-2).map(e=>({...e,reason:text(e.reason,250)}))},
      goals:list(p.goals).map(g=>pick(g,['id','kind','title','activity','progress','completed','practice_seconds','progress_source','last_evidence_id','motivation'])),
      route:route?{from:route.from,destination:route.destination,next:route.path?.[route.index||0],remaining:route.remaining,guardianId:route.guardianId,transport:route.transport}:null,
      lifeCircumstances:pick(p.lifeCircumstances,['origin','style','optimism','support','agency','gratitude','materialism','statusDrive','stress','conditions','talents','currentEpisode']),
      resources:{...resources,householdForecast:pick(resources.householdForecast,['at','incomeCents','plannedCostCents','reserveCents','marginCents','availableCents','arrearsCents']),ownEducation:{current:education.current,latestQualification:pick(education.history?.at(-1),['qualification','institution','field','endDate','grade'])},ownBudgetReview:pick(resources.ownBudgetReview,['at','security','projectedCents','text','sourceEventId'])},
      socialExpectations:{perspective:expectations.perspective,contacts:list(expectations.contacts).slice().sort((a,b)=>Number(owned.has(b.subjectId))-Number(owned.has(a.subjectId))).slice(0,focused?8:3).map(c=>({subjectId:c.subjectId,subjectName:c.subjectName,topics:Object.fromEntries(Object.entries(c.topics||{}).map(([key,v])=>[key,{probabilities:v.probabilities,thought:text(v.thought,500),updatedAt:v.updatedAt,lastEncounter:pick(v.lastEncounter,['category','outcome','initiatorId','witness','remote','audience']),sourceRefs:list(v.sourceRefs).slice(-1)}]))}))},
      sharedGoals:list(p.sharedGoals).filter(r=>r.goals?.length).sort((a,b)=>Number(owned.has(b.simId))-Number(owned.has(a.simId))).slice(0,focused?8:3).map(r=>({simId:r.simId,goals:r.goals.map(g=>pick(g,['id','kind','title']))})),
      memory,
      // Never drop knownTo/epistemic boundaries or unresolved author notes.
      storytellerNotes:p.storytellerNotes,
    };
  });
  // Supporting contacts need an actionable profile, not full copies of every
  // ontology and personal finance explanation. Anchors keep the richer view.
  sims=sims.map(p=>important.has(p.id)?p:{
    ...pick(p,['id','name','age','biographyMode','profile','personality','skills','needs','aptitudes','location','route','romancePolicy','focusGoalId','publicManner','storytellerNotes','neighborhood','relationshipCoverage']),
    biography:text(p.biography,300),thought:text(p.thought,240),currentDesire:text(p.currentDesire,180),
    action:pick(p.action,['kind','started','until','progressSeconds','event_id']),
    emotions:{primary:p.emotions?.primary,states:list(p.emotions?.states).slice(0,5).map(e=>({id:e.id,intensity:e.intensity,causes:list(e.causes).slice(-1)}))},
    goals:list(p.goals).map(g=>pick(g,['id','kind','title','activity','progress','motivation','completed'])),dailyGoals:{items:list(p.dailyGoals?.items).map(g=>pick(g,['id','kind','target','value','unit']))},
    relationships:list(p.relationships).slice(0,4).map(r=>({...pick(r,['id','name','kind','closeness','trust','tension']),background:r.background?{thread:text(r.background.thread,120)}:undefined})),
    lifeCircumstances:pick(p.lifeCircumstances,['style','optimism','support','agency','stress','conditions','currentEpisode']),
    resources:{...pick(p.resources,['cashCents','householdForecast','ownEducation']),security:p.resources?.ownBudgetReview?.security},
    wellbeing:{scores:p.wellbeing?.scores,summary:p.wellbeing?.summary},
    socialExpectations:{perspective:p.socialExpectations?.perspective,contacts:list(p.socialExpectations?.contacts).slice(0,2).map(c=>({subjectId:c.subjectId,topics:Object.fromEntries(Object.entries(c.topics||{}).slice(0,2).map(([k,v])=>[k,{probabilities:v.probabilities,thought:text(v.thought,180)}]))}))},
    sharedGoals:list(p.sharedGoals).slice(0,3).map(r=>({simId:r.simId,goals:r.goals.map(g=>({kind:g.kind,title:text(g.title,80)}))})),communication:{...pick(p.communication,['ambition','prosociality','communicationPractice','preferences','unresolved']),responses:list(p.communication?.responses).slice(-2),recentCollaborations:list(p.communication?.recentCollaborations).slice(-2)},
    memory:{recent:list(p.memory?.recent).slice(0,2),earlierHighlights:list(p.memory?.earlierHighlights).slice(-1)}
  });
  // Keep every selected event and every contact. Only the personal interpretations
  // of this batch's Sims are relevant here; others can be retrieved when needed.
  const events=context.events.map(e=>{
    const personal=['arrival','departure','action_started','action_completed'].includes(e.type)?null:(e.personalExperiences||e.facts?.personalExperiences);
    return {...e,world_id:undefined,facts:{...e.facts,personalExperiences:undefined},
      personalExperiences:personal?Object.fromEntries(Object.entries(personal).filter(([id])=>owned.has(id)).map(([id,v])=>[id,{...v,interpretation:text(v.interpretation,400)}])):undefined};
  });
  return round({...context,sims,events,places:list(context.places).map(p=>({...p,actions:p.actions?.map(a=>typeof a==='string'?a:pick(a,['id','kind','name']))})),neighborhoods:[...neighborhoodValues.values()],
    contextPolicy:{version:2,condensed:true,importantSimIds:[...important],rules:'Current needs, skills, traits, emotions, goals, risks and author notes retained. Supporting contacts use compact actionable profiles, with full evidence retrievable. Neighbor relationships, shared goals and memories prioritize present contacts, family and tension; counts indicate omitted relationships. Education history reduced to latest qualification; routes to next hop and destination; repeated ontology definitions and Bayesian counters omitted. Floats rounded to three decimals for narration only. Recent memory is excerpted, never rewritten. Facts, beliefs and author-only notes remain separate. Use sim/journal/relations/entities/notes tools for complete evidence. Only requiredThoughtSimIds require model-written thoughts (anchors and direct social contacts); other detailed profiles and their procedural perspectives remain available; other selected Sims retain their complete procedural perspectives and may be narrated when relevant.',counts:{sims:sims.length,events:events.length}},
  });
}
