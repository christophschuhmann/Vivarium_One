import {prepareSocialDynamics,applySocialDynamics,sharedGoals,socialMotivations} from './social-dynamics.js';
import {actionBias} from './action-bias.js';
import {advanceTask,taskDuration,pauseTask,resumeTask,canInterruptForContact,beginConversation} from './tasks.js';
import {rememberedMusic,proposeMusic,commitMusic} from './music.js';
import {db} from './schema.js';
import {uid,j,pj,now} from '../db.js';
import {generateTown,rng} from './generate.js';
import {openSims,openSimsCatalog} from './open_sims.js';
import {llmChat,parseJsonLoose} from '../providers.js';
import {withPrincipal} from '../byok.js';
import {preflight,debitCall,EST} from '../credits.js';
import {recall} from './memory.js';
import {activity,thought as actionThought} from './presentation.js';
import {libraryDigest} from './library.js';
import {growRomanticNeed,ROMANCE_INSTRUCTIONS,assertMinorSafeText} from './romance.js';
import {SOCIAL_VERSION} from './neighborhoods.js';
import {socialDestination,personalSocialContext,conversationDescription,socialInterpretation} from './social.js';
import {LIFE_VERSION,prepareMind,evaluateMind,emotionalRate,motivationBias,completedActivity,completedSocial,romanticWitness,reflect,mindContext,REFLECTION_INSTRUCTIONS,proceduralThought,conversationReflection} from './cognition.js';
import {dutyDestination,serviceDestination} from './facilities.js';
import {initializeExpansion,economicDraft,commitEconomy,refreshOwnResources,installActions,actionAllowed,expandedMinute,expandedDestination,chooseExpandedAction,expandedDuration,completeExpanded,finalizedSocial,prepareSocialProposal,packMeal,startMobility,foodDestination} from './expanded/index.js';
import {economicContext} from './expanded/economy.js';
import {socialMindContext,expectationBias} from './expanded/tom.js';
const clamp=n=>Math.max(0,Math.min(1,n));
export const busy=new Set();
const ACTIONS=['eat','drink','toilet','shower','sleep','relax','read','garden','work','stroll','wait','creative_hobby','school_day','kindergarten_day','community_meet'];
const kinds=catalog=>ACTIONS.concat(Object.keys(catalog.actions).filter(k=>k.startsWith('leisure_')));
const iso=seconds=>new Date(Date.UTC(2026,8,21)+seconds*1000).toISOString();
export function loadTown(worldId) {
  const world=prepared('SELECT * FROM lw_worlds WHERE world_id=?').get(worldId);
  if(!world)throw Object.assign(new Error('Living world not found'),{statusCode:404});
  const places=new Map(prepared('SELECT * FROM lw_places WHERE world_id=?').all(worldId).map(p=>[p.id,{...p,affordances:pj(p.affordances,[])}]));
  const people=prepared('SELECT * FROM lw_sims WHERE world_id=? ORDER BY rowid').all(worldId).map(p=>({...p,profile:pj(p.profile,{}),state:pj(p.state,{})}));
  const byId=new Map(people.map(p=>[p.id,p]));
  for(const p of people)p.relations={};
  for(const relation of prepared('SELECT * FROM lw_relations WHERE world_id=?').all(worldId))if(byId.has(relation.from_id))byId.get(relation.from_id).relations[relation.to_id]=pj(relation.payload,{});
  const graph=new Map();
  for(const edge of prepared('SELECT * FROM lw_edges WHERE world_id=?').all(worldId)) {if(!graph.has(edge.from_id))graph.set(edge.from_id,[]);graph.get(edge.from_id).push({id:edge.to_id,seconds:edge.seconds});}
  return {world,places,people,byId,graph};
}
export async function createTown(user,options={}) {
  const population=Number(options.population ?? 10),seed=Number(options.seed ?? 73);
  if(!Number.isInteger(population)||population<2||population>2000||!Number.isSafeInteger(seed))throw Object.assign(new Error('Choose 2–2000 Sims and an integer seed.'),{statusCode:400});
  const worldId=uid('w_'),town=await generateTown(worldId,{population,seed,title:String(options.title || (options.scenario==='bennington'?'Bennington, Vermont':'Lindenstadt')).slice(0,80),scenario:options.scenario});
  if(options.story)await authorBiographies(user,town.people.filter(p=>p.anchored));
  db.transaction(()=>{
    prepared("INSERT INTO worlds(id,user_id,title,sim_time,status,simulation_mode,created_at,updated_at) VALUES (?,?,?,?,'live','living',?,?)").run(worldId,user.id,String(options.title || (options.scenario==='bennington'?'Bennington, Vermont':'Lindenstadt')).slice(0,80),iso(27000),now(),now());
    prepared('INSERT INTO lw_worlds(world_id,seed,rules) VALUES (?,?,?)').run(worldId,seed,j({...town.catalog.manifest,minuteEngineVersion:2,language:'en',scenario:town.scenario||null,currency:town.scenario?.currency||'EUR',assetLibrary:libraryDigest(),socialVersion:SOCIAL_VERSION,lifeVersion:LIFE_VERSION,romanceVersion:1,wellbeingVersion:1,neighborhoods:town.identities}));
    for(const p of town.places)prepared('INSERT INTO lw_places(id,world_id,parent_id,name,kind,purpose,asset_id,x,y,capacity,anchored,landmark,affordances) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(p.id,worldId,p.parent_id,p.name,p.kind,p.purpose,p.asset_id,p.x,p.y,p.capacity,p.anchored,p.landmark,j(p.affordances));
    for(const e of town.edges)prepared('INSERT INTO lw_edges VALUES (?,?,?,?)').run(worldId,e.from_id,e.to_id,e.seconds);
    for(const p of town.people){
      const profile={...p.profile,family:p.family,home:p.home,workplace_id:p.workplace_id,preferences:p.preferences,seed_key:p.seed_key};
      prepared('INSERT INTO lw_sims(id,world_id,household_id,name,age,gender,asset_id,colour,anchored,biography_mode,biography,profile,state,location_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(p.id,worldId,p.household_id,p.name,p.age,p.gender,p.asset_id,p.colour,p.anchored,p.biography_mode,p.biography,j(profile),j(p.state),p.location_id);
      for(const [other,relation] of Object.entries(p.relations))prepared('INSERT INTO lw_relations VALUES (?,?,?,?)').run(worldId,p.id,other,j(relation));

    }
    initializeExpansion(loadTown(worldId));
    // Record the final initialized employment, after public services are staffed.
    // Initial background is not a real job change and must not contradict itself.
    for(const p of loadTown(worldId).people){
      const original=town.people.find(q=>q.id===p.id),oldJob=original.profile.job;
      if(p.biography_mode==='procedural'&&oldJob!==p.profile.job){
        p.biography=p.biography.replace('They work as a '+oldJob+'.',p.profile.job==='Unemployed'?'They are currently looking for work.':'They work as a '+p.profile.job+'.').replaceAll('Grow as a '+oldJob,'Develop a sustainable working life');
        for(const goal of p.state.psychology.ambitions||[])for(const key of ['title','title_de'])if(goal[key])goal[key]=goal[key].replace('Grow as a '+oldJob,'Develop a sustainable working life');
        prepared('UPDATE lw_sims SET biography=?,state=? WHERE id=?').run(p.biography,j(p.state),p.id);
      }
      for(const [type,text] of [['identity',p.biography],['family',p.profile.family.parent_ids.length?'Knows their family and their home.':'Has a home and familiar social contacts.'],['goal',p.state.psychology.ambitions.map(a=>a.title).join('; ')]]){
        const id=uid('le_');insertEvent({id,world_id:worldId,start:27000,end:27000,type:'initialization_'+type,location_id:p.state.location_id,participants:[p.id],facts:{coverage:'initialized_background',biographyMode:p.biography_mode},description:text,source:p.biography_mode==='written'?'authored_initialization':'procedural_initialization'},[{simId:p.id,perception:text,interpretation:type==='goal'?'This is something I want to work toward.':'This is how I remember my life so far.',channel:'initialization',confidence:1}]);
      }
    }
  })();
  return {worldId,population,households:town.households.length,locations:prepared('SELECT count(*) n FROM lw_places WHERE world_id=?').get(worldId).n};
}
function parseModel(text) {const clean=String(text).replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,'');try{return JSON.parse(clean);}catch{throw Object.assign(new Error('Das Modell hat kein vollständiges gültiges JSON geliefert. Der Schritt wurde nicht gespeichert. Bitte erneut versuchen oder das Modell wechseln.'),{statusCode:502});}}
export async function authorBiographies(user,people,instruction='',{signal}={}) {
  if(!people.length)return;
  preflight(user.id,EST.chat());
  const written=new Map();let calls=0;
  // A missing ID or malformed answer is a response error, not a model capability.
  // Retry only missing entries once; do not apply a half-complete batch.
  for(let attempt=0;attempt<2&&written.size<people.length;attempt++){
    const missing=people.filter(p=>!written.has(p.id));
    const result=await withPrincipal(user,()=>llmChat([{role:'system',content:'Write plausible emotionally intelligent fictional biographies in English. Return JSON {biographies:[{id,text}]}, exactly one entry for EVERY supplied person, copying each id verbatim. Preserve supplied ages, jobs, family IDs, social background and home facts. Never invent incest, sexual content about minors, or real past world events. These are authored initial backgrounds, not witnessed events. 120–180 words per person. Output only strict valid JSON with escaped line breaks. '+ROMANCE_INSTRUCTIONS},{role:'user',content:j({instruction,people:missing.map(p=>({id:p.id,name:p.name,age:p.age,job:p.profile.job,family:p.family || p.profile.family,social:p.profile.social,neighborhood:p.profile.neighborhood,goals:(p.psychology || p.state?.psychology)?.ambitions,existing:p.biography}))})}],{maxTokens:Math.min(14000,missing.length*1400+5000),reasoningEffort:'low',temperature:.6,signal}));
    calls++;debitCall(user.id,result,'living_biography');
    let output;try{output=parseJsonLoose(result.content);}catch{continue;}
    if(!Array.isArray(output?.biographies))continue;
    for(const person of missing){const matches=output.biographies.filter(b=>b?.id===person.id);if(matches.length===1&&typeof matches[0].text==='string'&&matches[0].text.trim().length>=100){assertMinorSafeText([person],matches[0].text);written.set(person.id,matches[0].text.trim().slice(0,5000));}}
  }
  if(written.size!==people.length)throw Object.assign(new Error('Die Biografie-Antwort war unvollständig oder kein gültiges JSON. Der vorhandene Hintergrund wurde beibehalten. Im Profil kannst du die Biografie erneut ausarbeiten.'),{code:'BIOGRAPHY_RESPONSE_INVALID',statusCode:502});
  for(const person of people){person.biography=written.get(person.id);person.biography_mode='written';}
  return {calls};
}
const statementCache=new Map();
function prepared(sql){let statement=statementCache.get(sql);if(!statement){statement=db.prepare(sql);statementCache.set(sql,statement);}return statement;}
export function findRoute(town,from,to) {
  if(from===to)return [];
  const queue=[from],previous=new Map([[from,null]]);
  for(let i=0;i<queue.length;i++)for(const edge of town.graph.get(queue[i]) || []){
    if(previous.has(edge.id))continue;previous.set(edge.id,{from:queue[i],seconds:edge.seconds});queue.push(edge.id);
    if(edge.id===to){const steps=[];let at=to;while(previous.get(at)){const e=previous.get(at);steps.unshift({id:at,seconds:e.seconds});at=e.from;}return steps;}
  }return null;
}
function actor(p){return {id:p.id,age:p.age,household_id:p.household_id,profile:p.profile,family:p.profile.family,workplace_id:p.profile.workplace_id,preferences:p.profile.preferences,psychology:p.state.psychology,needs:p.state.needs,relations:p.relations,affect:p.state.affect,expectation_bias:Object.fromEntries(Object.keys(p.relations).slice(0,24).map(id=>[id,Object.fromEntries(['offer_help','comfort','check_in','reconcile','apologize','argue','provoke','small_talk'].map(k=>[k,expectationBias(p,id,k)]))])),career:p.state.career,skills:p.state.skills};}
function availableActions(place,catalog,p,d=null,time=0) {
  if(!place)return ['wait'];
  return kinds(catalog).filter(kind=>{
    if(!actionAllowed(d,p,kind,place.id,time))return false;
    if(kind==='work'&&(p.age<18||p.profile.job==='Retired'))return false;
    if(kind==='school_day'&&(p.age<6||p.age>=18)||kind==='kindergarten_day'&&(p.age<3||p.age>=6))return false;
    if(p.age<3 && !['eat','drink','toilet','shower','sleep','relax','wait'].includes(kind))return false;
    if(p.age<18&&/party|date|karaoke|live_music|shop_for_fun/.test(kind))return false;
    const objects=catalog.actions[kind].object_kinds;return kind!=='wait'&&(!objects.length||objects.some(k=>place.affordances.includes(k)));
  });
}
function contains(town,placeId,ancestor){let at=placeId;for(let i=0;at&&i<12;i++){if(at===ancestor)return true;at=town.places.get(at)?.parent_id;}return false;}
function scheduledDestination(town,p,time) {
  const extra=expandedDestination(town.expansion,p,time);if(extra)return extra;
  const hour=time/3600%24,weekday=Math.floor(time/86400)%7<5,home=p.profile.home;
  if(p.age<3)return hour>=20||hour<7?home.bed:home.living;
  if(hour>=22||hour<7)return home.bed;
  if(weekday&&hour>=8&&hour< (p.age<18?14:16)&&p.profile.workplace_id)return dutyDestination(p,time);
  const social=socialDestination(town,p,time);if(social)return social;
  if(weekday&&hour>=16&&hour<18 || !weekday&&hour>=10&&hour<12){const familyPlan=p.age<12?town.byId.get(p.profile.family.parent_ids[0]) || p:p,draw=rng(`${town.world.seed}:outing:${familyPlan.profile.seed_key}:${Math.floor(time/86400)}`);if(draw()>(weekday?.45:.65))return home.living;const interests=familyPlan.profile.interests,purpose=interests.includes('reading')?'public library':interests.some(k=>['walking','gardening'].includes(k))?'town park':interests.some(k=>['socializing','music'].includes(k))?'shopping street cafe':null;return purpose?[...town.places.values()].find(l=>l.kind==='room'&&l.purpose.includes(purpose))?.id || home.living:home.living;}
  return home.living;
}
function interpretation(p,event) {
  if(event.type==='social')return event.facts.socialViews?.[p.id]?.thought||socialInterpretation(p,event);
  if(event.type==='arrival')return 'I have arrived and can take in my surroundings.';
  if(event.type==='action_completed')return 'I have completed a real step in my daily life and goals.';
  return p.state.thought || 'I am noticing what is happening around me.';
}
export function insertEvent(event,entries) {
  prepared('INSERT INTO lw_events(id,world_id,beat_id,start,end,location_id,type,participants,facts,description,source) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(event.id,event.world_id,event.beat_id || null,event.start,event.end,event.location_id,event.type,j(event.participants),j(event.facts),event.description,event.source);
  for(const entry of entries)prepared('INSERT INTO lw_journal VALUES (?,?,?,?,?,?,?)').run(entry.simId,event.id,event.end,entry.channel,entry.perception,entry.interpretation,entry.confidence);
}
export function allocateFields(town,events,presence) {
  const selected=new Map(),links=new Map();
  const add=(id,reason)=>{if(!selected.has(id))selected.set(id,new Set());selected.get(id).add(reason);};
  for(const p of town.people)if(p.anchored)add(p.id,'character_anchor');
  for(const [,locations] of presence)for(const [location,ids] of locations){
    const edge=town.transitFields?.get(location);let at=edge?.from || location,anchor=null;while(at){if(town.places.get(at)?.anchored&&(!edge||contains(town,edge.to,at))){anchor=at;break;}at=town.places.get(at)?.parent_id;}
    const anchored=ids.find(id=>town.byId.get(id).anchored);
    if(anchor||anchored){for(const id of ids)add(id,anchor?'location_anchor:'+anchor:'co_presence:'+anchored);for(const a of ids){if(!links.has(a))links.set(a,new Set());if(a!==ids[0]){links.get(a).add(ids[0]);links.get(ids[0]).add(a);}}}
  }
  const contacts=events.filter(e=>e.type==='social');
  // Contact closure is limited to accepted physical/telephone encounters, never global rumor.
  let changed=true;while(changed){changed=false;for(const e of contacts)if(e.participants.some(id=>selected.has(id)))for(const id of e.participants)if(!selected.has(id)){add(id,'contact:'+e.id);changed=true;}}
  for(const e of contacts)if(e.participants.some(id=>selected.has(id)))for(const a of e.participants){if(!links.has(a))links.set(a,new Set());for(const b of e.participants)if(a!==b)links.get(a).add(b);}
  const visited=new Set(),fields=[];
  for(const id of selected.keys())if(!visited.has(id)){const members=[],queue=[id];visited.add(id);for(let i=0;i<queue.length;i++){members.push(queue[i]);for(const next of links.get(queue[i]) || [])if(selected.has(next)&&!visited.has(next)){visited.add(next);queue.push(next);}}fields.push({id:'field-'+fields.length,members,reasons:Object.fromEntries(members.map(id=>[id,[...selected.get(id)]]))});}
  return fields;
}
// Keep one world mutation lock over all chunks. Each successful chunk is durable;
// cancellation reports the already-completed duration instead of implying rollback.
export async function advanceTown(user,worldId,options={}) {
  const minutes=options.minutes??5;
  if(!Number.isInteger(minutes)||minutes<1||minutes>(options.turbo?525600:1440))throw Object.assign(new Error(options.turbo?'Turbo supports up to 365 days.':'Advance 1–1440 minutes at a time.'),{statusCode:400});
  if(busy.has(worldId))throw Object.assign(new Error('A tick is already running.'),{statusCode:409});
  busy.add(worldId);let completed=0,version=options.expectedVersion,last;const results=[],started=performance.now();
  try{
    while(completed<minutes){if(options.signal?.aborted)throw new Error('Advance cancelled.');const amount=Math.min(options.story===false?60:5,minutes-completed);
      last=await advanceSlice(user,worldId,{...options,minutes:amount,expectedVersion:version,intervention:completed?undefined:options.intervention,onProgress:data=>options.onProgress?.({...data,completedMinutes:completed,totalMinutes:minutes})});
      completed+=amount;version=last.version;results.push(last);options.onProgress?.({phase:'advance',completedMinutes:completed,totalMinutes:minutes});await new Promise(resolve=>setImmediate(resolve));
    }
    return {...last,completedMinutes:completed,metrics:{...last.metrics,minutes:completed,chunks:results.length,events:results.reduce((n,r)=>n+r.metrics.events,0),journalEntries:results.reduce((n,r)=>n+r.metrics.journalEntries,0),modelCalls:results.reduce((n,r)=>n+r.metrics.modelCalls,0),cpuMs:results.reduce((n,r)=>n+r.metrics.cpuMs,0),totalMs:Math.round(performance.now()-started),warnings:results.flatMap(r=>r.metrics.warnings||[]),rejections:results.flatMap(r=>r.metrics.rejections||[])},story:results.flatMap(r=>r.story)};
  }catch(error){if(completed){error.completedMinutes=completed;error.message+=` ${completed} of ${minutes} minutes were completed and saved.`;}throw error;}finally{busy.delete(worldId);}
}
async function advanceSlice(user,worldId,{minutes=5,story=true,expectedVersion,intervention,modelCall,signal,onProgress=()=>{}}={}) {
  if(typeof story!=='boolean')throw Object.assign(new Error('Choose whether to use the Storyteller.'),{statusCode:400});
  if(!Number.isInteger(minutes)||minutes<1||minutes>60)throw Object.assign(new Error('Advance 1–60 minutes at a time.'),{statusCode:400});
  try {
    const started=performance.now(),town=loadTown(worldId),catalog=installActions(await openSimsCatalog()),before=town.world.version,end=town.world.seconds+minutes*60;
    if(expectedVersion!==undefined&&expectedVersion!==before)throw Object.assign(new Error('The world changed. Refresh before advancing.'),{statusCode:409});
    const expansion=town.expansion=economicDraft(town);
    const events=[],eventCounts=new Map(),presence=new Map(),initialStates=new Map(town.people.map(p=>[p.id,structuredClone(p.state)])),youngByHouse=new Map();
    for(const child of town.people)if(child.age<3){if(!youngByHouse.has(child.household_id))youngByHouse.set(child.household_id,[]);youngByHouse.get(child.household_id).push(child);}
    const event=(type,p,time,facts={},others=[],location=p.state.location_id)=>{
      const description=type==='arrival'?`${p.name} arrives at ${town.places.get(location)?.name}.`:type==='departure'?`${p.name} leaves ${town.places.get(location)?.name} for ${town.places.get(facts.destination)?.name}.`:type==='action_completed'?`${p.name} finishes: ${activity(facts.action,catalog)}.`:`${p.name}: ${activity(facts.action,catalog)}.`;
      const eventKey=time+':'+type+':'+p.id,ordinal=eventCounts.get(eventKey)||0;eventCounts.set(eventKey,ordinal+1);
      const e={id:worldId+'_e_'+time+'_'+type+'_'+p.profile.seed_key+'_'+ordinal,world_id:worldId,start:time,end:time,location_id:location,type,participants:[p.id,...others],facts:{...facts,participantAges:Object.fromEntries([p.id,...others].map(id=>[id,town.byId.get(id)?.age]))},description,source:'procedural',journal:[]};events.push(e);return e;
    };
    for(const p of town.people){prepareSocialDynamics(p,town.world.seed);p.state.dialogue=null;prepareMind(p,town.world.seconds,{seed:town.world.seed});evaluateMind(p,town.world.seconds,catalog);}
    let interventionSim=null;
    if(intervention){
      if(typeof intervention.text!=='string'||!intervention.text.trim()||!['event','idea','condition','directorial'].includes(intervention.kind))throw Object.assign(new Error('Invalid intervention.'),{statusCode:400});
      if(intervention.targetId||intervention.target){interventionSim=town.people.find(p=>p.id===intervention.targetId||p.name===intervention.target);if(!interventionSim)throw Object.assign(new Error('Intervention target not found.'),{statusCode:400});}
      const targets=interventionSim?[interventionSim]:town.people.filter(p=>p.anchored||town.places.get(p.state.location_id)?.anchored);
      for(const p of targets){const e=event('intervention',p,town.world.seconds,{kind:intervention.kind,text:intervention.text.slice(0,2000),status:intervention.kind==='event'?'authored_event':'direction'});e.description=intervention.kind==='event'?intervention.text.slice(0,2000):'Regieimpuls: '+intervention.text.slice(0,2000);e.source='user_intervention';}
    }
    town.transitFields=new Map();
    const notePresence=time=>{const locations=new Map();for(const p of town.people){let location=p.state.location_id;const route=p.state.route;if(!location&&route){const from=route.index?route.path[route.index-1].id:route.from,to=route.path[route.index || 0].id;location='edge:'+[from,to].sort().join('~');town.transitFields.set(location,{from,to});}if(location){if(!locations.has(location))locations.set(location,[]);locations.get(location).push(p.id);}}if(story)presence.set(time,locations);return locations;};
    notePresence(town.world.seconds);
    for(let time=town.world.seconds+60;time<=end;time+=60) {
      if(signal?.aborted)throw new Error('Tick cancelled before commit.');
      const minuteEventStart=events.length;
      expandedMinute(expansion,time,event);
      const occupancy=new Map();for(const p of town.people)if(p.state.location_id)occupancy.set(p.state.location_id,(occupancy.get(p.state.location_id)||0)+1);
      const reservations=new Set(town.people.filter(p=>p.state.action?.resource).map(p=>p.state.action.resource));
      const escort=new Map();
      for(const child of town.people.filter(p=>p.age<12&&p.age>=3&&!p.state.route&&!['sleep','toilet','shower','eat','drink'].includes(p.state.action?.kind))){
        const destination=scheduledDestination(town,child,time),guardian=child.profile.family.parent_ids.map(id=>town.byId.get(id)).find(p=>p&&p.state.location_id===child.state.location_id&&!p.state.route&&p.id!==youngByHouse.get(p.household_id)?.[0]?.profile.family.parent_ids[0]&&!['sleep','toilet','shower','eat','drink'].includes(p.state.action?.kind)&&Math.max(...Object.values(p.state.needs))<.6);
        if(destination!==child.state.location_id&&guardian&&Math.max(...Object.values(child.state.needs))<.6){escort.set(guardian.id,destination);escort.set(child.id,destination);}
      }
      for(let i=0;i<town.people.length;i++) {
        const p=town.people[i],state=p.state,place=town.places.get(state.location_id),draw=rng(`${town.world.seed}:${p.profile.seed_key}:${time}`);
        advanceTask(p,time);
        for(const [need,rate] of Object.entries(catalog.rates)){const asleep=state.action?.kind==='sleep',change=asleep?(need==='fatigue'?-.12:need==='comfort'?-.04:rate*.2):rate*emotionalRate(p,need);state.needs[need]=clamp((state.needs[need]||0)+change/60);}
        growRomanticNeed(p);evaluateMind(p,time,catalog);
        if(state.route){
          if(state.route.atNode){occupancy.set(state.location_id,(occupancy.get(state.location_id)||1)-1);state.location_id=null;state.route.atNode=false;}
          state.route.remaining-=60;
          if(state.route.remaining<=0){const goal=state.route.path[state.route.index || 0].id,slots=occupancy.get(goal)||0;
            if(slots>=town.places.get(goal).capacity){state.route.remaining=60;proceduralThought(p,'I will wait until there is room at my destination.',time);continue;}
            state.location_id=goal;occupancy.set(goal,slots+1);event('arrival',p,time,{from:state.route.from,guardianId:state.route.guardianId,transport:state.route.transport});state.route.index=(state.route.index||0)+1;
            if(state.route.index<state.route.path.length){state.route.remaining=Math.max(60,state.route.path[state.route.index].seconds);state.route.atNode=true;continue;}state.route=null;
          }else continue;
        }
        if(state.socialUntil>time&&Math.max(state.needs.bladder,state.needs.hunger,state.needs.thirst)<.93)continue;
        if(state.conversation){const conversation=state.conversation;const e=event('conversation_ended',p,time,{...conversation});e.facts.reason=state.socialUntil>time?'urgent_need':'finished';e.description=p.name+(state.socialUntil>time?' ends the conversation to attend to an urgent physical need.':' finishes the conversation and considers what to do next.');const other=town.byId.get(conversation.withId);if(other?.state.conversation?.eventId===conversation.eventId)other.state.socialUntil=Math.min(other.state.socialUntil,time);state.conversation=null;state.socialUntil=null;}
        const commitment=p.id===youngByHouse.get(p.household_id)?.[0]?.profile.family.parent_ids[0]?p.profile.home.living:scheduledDestination(town,p,time);
        if(state.goal&&commitment===p.profile.workplace_id&&state.goal.destination!==commitment&&!['eat','drink','toilet','shower','sleep'].includes(state.goal.kind)&&!(p.age>=18&&state.goal.kind==='work')){const e=event('goal_deferred',p,time,{reason:'scheduled_commitment',destination:state.goal.destination});e.description=`${p.name} defers a leisure plan to meet a school or work commitment.`;state.goal=null;}
        if(state.action){
          if(state.action.kind==='sleep'&&time/3600%24>=7&&time/3600%24<10&&state.needs.fatigue<.3)state.action.until=Math.min(state.action.until,time);
          const caregiving=p.id===youngByHouse.get(p.household_id)?.[0]?.profile.family.parent_ids[0],duty=caregiving?p.profile.home.living:scheduledDestination(town,p,time),interrupt=Math.max(state.needs.bladder,state.needs.hunger,state.needs.thirst)>.92&&!['eat','drink','toilet'].includes(state.action.kind)||escort.has(p.id)&&!['sleep','toilet','shower','eat','drink'].includes(state.action.kind)||!state.goal&&duty===p.profile.workplace_id&&state.location_id!==duty&&!['sleep','toilet','shower','eat','drink'].includes(state.action.kind)&&!((catalog.actions[state.action.kind]?.relief.fun>0&&state.needs.fun>.6)||(catalog.actions[state.action.kind]?.relief.comfort>0&&state.needs.comfort>.6));
          if(state.action.until>time&&!interrupt)continue;
          if(state.action.until<=time){const duration=state.action.progressSeconds??(state.action.until-state.action.started),e=event('action_completed',p,time,{action:state.action.kind,durationSeconds:duration,taskId:state.action.taskId,plannedSeconds:state.action.plannedSeconds}),result=completeExpanded(expansion,p,e,duration),relief={};
            if(result.ok){for(const [need,value] of Object.entries(catalog.actions[state.action.kind]?.relief || {})){const beforeNeed=state.needs[need];state.needs[need]=clamp(beforeNeed-value*(state.action.kind==='sleep'?Math.min(1,duration/catalog.actions.sleep.duration):1));relief[need]=beforeNeed-state.needs[need];}completedActivity(p,e,duration,relief,time);}
            else{e.type='action_failed';e.facts.completed=false;e.description=p.name+' kann '+activity(state.action.kind,catalog)+' nicht abschließen: '+(e.facts.failure||'die tatsächlichen Voraussetzungen oder Ressourcen fehlen')+'.';}
          }else{const resource=state.action.resource;pauseTask(p,time,event,{reason:Math.max(state.needs.bladder,state.needs.hunger,state.needs.thirst)>.92?'an urgent physical need':'a scheduled commitment'});reservations.delete(resource);}
          if(state.action)reservations.delete(state.action.resource);state.action=null;
        }
        const at=town.places.get(state.location_id),actions=availableActions(at,catalog,p,expansion,time);
        // Resolve the strongest physical need even if its object is in another room.
        // A locally available fun activity must not mask hunger or a full bladder
        // and repeatedly restart after the resulting urgent interruption.
        const primary={eat:'hunger',drink:'thirst',toilet:'bladder',shower:'hygiene',sleep:'fatigue'};
        const strongest=Object.keys(primary).filter(k=>state.needs[primary[k]]>.8).sort((a,b)=>state.needs[primary[b]]-state.needs[primary[a]])[0];
        let urgent=actions.includes(strongest)?strongest:null;
        if(state.goal?.expires<=time)state.goal=null;
        let destination=escort.get(p.id) || state.goal?.destination || scheduledDestination(town,p,time);
        const young=youngByHouse.get(p.household_id)||[];
        if(p.id===young[0]?.profile.family.parent_ids[0])destination=town.byId.get(p.state.economy?.infantCareTargetId)?.state.location_id || p.profile.home.living; // parental care instead of leaving small children alone
        if(p.age<12&&destination!==state.location_id&&!escort.has(p.id)&&!Object.values(p.profile.home).includes(destination)&&!contains(town,destination,p.household_id)&&destination!==p.profile.workplace_id&&!Object.values(p.profile.facility?.rooms||{}).includes(destination))destination=state.location_id;
        if(!urgent){
          if(strongest)destination=strongest==='eat'?foodDestination(expansion,p,time,serviceDestination(town,p,'kitchen')):strongest==='drink'?serviceDestination(town,p,'water'):strongest==='toilet'?serviceDestination(town,p,'bath'):strongest==='sleep'?p.profile.home.bed:p.profile.home.bath;
          else if(state.needs.bladder>.7)destination=serviceDestination(town,p,'bath');
          else if(state.needs.hunger>.65||state.needs.thirst>.7)destination=state.needs.hunger>.65?foodDestination(expansion,p,time,serviceDestination(town,p,'kitchen')):serviceDestination(town,p,'water');
          else if(state.needs.fatigue>.8)destination=p.profile.home.bed;
          else if(state.needs.hygiene>.7)destination=p.profile.home.bath;
          else if(state.needs.fun>.85||state.needs.comfort>.85)destination=serviceDestination(town,p,'living');
        }
        if(!urgent&&destination!==state.location_id){
          const path=findRoute(town,state.location_id,destination);
          if(path?.length){const from=state.location_id;packMeal(expansion,p,from,destination,time,event);event('departure',p,time,{destination,path:path.map(s=>s.id)},[],from);const mobility=expansion?startMobility(expansion,p,from,destination,time,event):null;state.route={...(mobility?{ticketEventId:mobility.ticketEventId,mobility:mobility.kind}:{}),from,destination,path,index:0,remaining:Math.max(60,path[0].seconds),guardianId:p.age<12&&escort.has(p.id)?p.profile.family.parent_ids.find(id=>escort.has(id)):null,transport:p.age<12&&(!contains(town,from,p.household_id)||!contains(town,destination,p.household_id))?(escort.has(p.id)?'guardian_accompanied':p.profile.facility&&contains(town,from,p.profile.facility.buildingId)&&contains(town,destination,p.profile.facility.buildingId)?'supervised_school_activity':'supervised_school_transport'):null};state.location_id=null;occupancy.set(from,(occupancy.get(from)||1)-1);proceduralThought(p,p.age<12?(state.route.transport==='guardian_accompanied'?'I am going with my caregiver.':state.route.transport==='supervised_school_transport'?'I am taking supervised school transport.':state.route.transport==='supervised_school_activity'?'I am moving through the supervised school or childcare area.':'I am going to another room at home.'):'I am on my way to the next thing I want to do.',time);continue;}
        }
        if(strongest&&!urgent&&destination===state.location_id){
          if(state.blockedNeed?.kind!==strongest){const e=event('need_blocked',p,time,{need:primary[strongest],action:strongest,private:true});e.description=`${p.name} needs ${({eat:'a meal',drink:'drinking water',toilet:'a free toilet',shower:'washing facilities',sleep:'a place to rest'})[strongest]}, but the required resources are not currently available. Other plans pause while they look for an accessible option.`;state.blockedNeed={kind:strongest,since:time,eventId:e.id,reason:e.description};}
          // Keep checking resources each minute, but do not fabricate an activity
          // or log the same unavailable meal once a minute. Scarcity stays real.
          state.action=null;continue;
        }
        if(state.blockedNeed){const e=event('need_plan_resumed',p,time,{need:primary[state.blockedNeed.kind],private:true});e.description=`${p.name} can resume a concrete plan for their physical needs.`;delete state.blockedNeed;}
        const expandedKind=chooseExpandedAction(expansion,p,time);
        let kind=urgent || (state.goal?.destination===state.location_id?state.goal.kind:null) || (state.location_id===p.profile.workplace_id?(p.age<6?'kindergarten_day':p.age<18?'school_day':expandedKind==='leisure_expanded_study'?expandedKind:expandedKind&&expansion.entities.get(p.state.economy.activeObligationId)?.payload.operator==='work'?expandedKind:'work'):time/3600%24>=22||time/3600%24<7?'sleep':expandedKind);
        if(kind&&!actions.includes(kind))kind=null;
        if(!kind){const scored=actions.map(kind=>({kind,score:Object.entries(catalog.actions[kind].relief).reduce((n,[need,relief])=>n+state.needs[need]*relief,0)+actionBias(p,kind,time)*.3+motivationBias(p,kind)+draw()*.22})).sort((a,b)=>b.score-a.score);kind=scored[0]?.kind || 'wait';}
        if(resumeTask(p,kind,time,event))continue;
        let resource=null;if(['toilet','shower'].includes(kind)){const slots=Math.max(1,Math.min(8,at.capacity)),candidate=Array.from({length:slots},(_,i)=>state.location_id+':bath:'+i).find(key=>!reservations.has(key));if(!candidate)kind='wait';else{resource=candidate;reservations.add(resource);}}
        if(at?.purpose.includes('bathroom')&&!['toilet','shower','drink','wait'].includes(kind))kind='wait';
        state.action={kind,started:time,until:time+(kind==='sleep'&&time/3600%24>=7&&time/3600%24<21?1800:taskDuration(p,kind,expandedDuration(expansion,p,kind,catalog.actions[kind].duration),time,town.world.seed)),resource:kind==='wait'?null:resource,source:'procedural'};proceduralThought(p,actionThought(kind,catalog),time);
        state.action.taskId=p.profile.seed_key+':'+kind+':'+time;state.action.plannedSeconds=state.action.until-time;state.action.progressSeconds=0;state.action.lastProgressAt=time;
        if(state.goal?.destination===state.location_id&&state.goal.kind===kind){state.action.source='storyteller';state.thought=state.goal.reason;state.thought_source='storyteller';state.thought_at=time;state.goal=null;}
        const object=catalog.actions[kind].object_kinds.find(o=>at?.affordances.includes(o)) || null;
        const e=event('action_started',p,time,{action:kind,object,taskId:state.action.taskId,plannedSeconds:state.action.plannedSeconds});e.description=`${p.name}: ${activity(kind,catalog)}${object?' · '+(({desk:'at the desk',bookshelf:'at the bookcase',table:'at the table',bed:'by the bed',sofa:'on the sofa',toilet:'in a private bathroom',shower:'in a private bathroom',fridge:'in the kitchen',sink:'at the sink',park_marker:'in the park',planter:'beside the plants'})[object] || object):''}.`;
        state.action.event_id=e.id;evaluateMind(p,time,catalog);
      }
      const current=notePresence(time),pairs=[],used=new Set();
      for(const [location,ids] of current) {
        if(!town.places.has(location)||town.places.get(location).purpose.includes('bathroom'))continue;
        const available=ids.map(id=>town.byId.get(id)).filter(p=>p.age>=3&&!(p.state.socialUntil>time)&&time-p.state.last_social>=1200&&!['sleep','toilet','shower'].includes(p.state.action?.kind));
        for(let i=0;i<available.length;i++){const a=available[i];if(used.has(a.id))continue;
          if(rng(`${town.world.seed}:social:${a.profile.seed_key}:${time}`)()>(.035+(a.state.psychology.big_five?.extraversion??.5)*.18+Math.max(0,a.state.needs.social-.5)*.12))continue;
          const score=b=>{const r=a.relations[b.id],last=r?.last_interaction;return (r?.closeness||0)*.3+(r?.tension||0)*.1+Math.min(.16,sharedGoals(a,b).length*.04)+(last!=null&&time-last<7200?-.2:0)+rng(`${time}:peer:${a.profile.seed_key}:${b.profile.seed_key}`)()*.18;};
          // Scan a bounded local window plus known co-present contacts, not the whole population per Sim.
          const candidates=new Map(available.slice(Math.max(0,i-6),i+7).filter(b=>b.id!==a.id&&!used.has(b.id)).map(b=>[b.id,b]));
          for(const id of Object.keys(a.relations).slice(0,16)){const b=town.byId.get(id);if(b&&b.state.location_id===location&&b.age>=3&&!used.has(id)&&time-b.state.last_social>=1200&&!['sleep','toilet','shower'].includes(b.state.action?.kind))candidates.set(id,b);}
          const b=[...candidates.values()].sort((b,c)=>score(c)-score(b))[0];if(!b||!canInterruptForContact(a,b,time,town.world.seed,'small_talk')||!canInterruptForContact(b,a,time,town.world.seed,'small_talk'))continue;
          const id=worldId+'_social_'+time+'_'+a.profile.seed_key;pairs.push({a:{...actor(a),social_motivations:socialMotivations(a,b,expansion)},b:actor(b),seed:town.world.seed+':'+a.profile.seed_key+':'+b.profile.seed_key+':'+time,eventId:id,location,venue:{purpose:town.places.get(location).purpose,occupant_ids:ids},aId:a.id,bId:b.id});used.add(a.id);used.add(b.id);
        }
      }
      // Remote contacts are explicit and involve an already-known person.
      for(const a of town.people)if(!used.has(a.id)&&a.age>=12&&!a.state.route&&!(a.state.socialUntil>time)&&!['sleep','toilet','shower','eat','drink'].includes(a.state.action?.kind)&&time-a.state.last_social>=1800&&a.state.needs.social>.6&&rng(`${town.world.seed}:phone:${a.profile.seed_key}:${time}`)()<.035){
        const id=Object.keys(a.relations).filter(id=>{const b=town.byId.get(id);return b&&b.age>=12&&b.state.location_id&&b.state.location_id!==a.state.location_id&&!used.has(id)&&!['sleep','toilet','shower'].includes(b.state.action?.kind)&&time-b.state.last_social>=1800;}).sort((b,c)=>(a.relations[c].trust||0)-(a.relations[b].trust||0))[0];if(!id||!a.state.location_id||['sleep','toilet','shower'].includes(a.state.action?.kind))continue;const b=town.byId.get(id);if(!canInterruptForContact(a,b,time,town.world.seed,'phone_call')||!canInterruptForContact(b,a,time,town.world.seed,'phone_call'))continue;
        const eventId=worldId+'_social_'+time+'_'+a.profile.seed_key;pairs.push({a:{...actor(a),social_motivations:socialMotivations(a,b,expansion)},b:actor(b),category:'phone_call',seed:town.world.seed+':'+a.profile.seed_key+':'+b.profile.seed_key+':'+time,eventId,location:a.state.location_id,aId:a.id,bId:b.id,remote:true});used.add(a.id);used.add(b.id);
      }
      if(pairs.length){const results=await openSims('social',{pairs,now:time});
        for(let i=0;i<pairs.length;i++){const pair=pairs[i],result=results[i];if(!result.allowed)continue;const a=town.byId.get(pair.aId),b=town.byId.get(pair.bId);
          const e=event('social',a,time,{category:result.category,outcome:result.outcome,remote:!!pair.remote,consent:result.consent,...(result.category==='adult_private_intimacy'?{private:true}:{})},[b.id],pair.location);e.description=conversationDescription(a,b,result.category,result.outcome,!!pair.remote);
          if(result.outcome==='accepted'&&result.category==='express_affection'&&a.age>=18&&b.age>=18&&a.profile.family.partner_id===b.id&&town.places.get(pair.location)?.purpose.includes('bedroom')&&current.get(pair.location)?.length===2){e.facts.private=true;e.description=`${a.name} and ${b.name} share a private affectionate moment. Details remain private.`;}
          if(!e.facts.private&&!e.facts.remote)e.witnesses=(current.get(pair.location)||[]).filter(id=>!e.participants.includes(id)).slice(0,5);prepareSocialProposal(expansion,town,e);e.socialPair=pair;e.socialResult=result;
          a.state.last_social=b.state.last_social=time;
          if(result.outcome==='accepted')beginConversation(a,b,e,result.duration,event);
        }
      }
      // Finalize within this minute: the next decision sees the actual outcome.
      const acceptedEvents=events.slice(minuteEventStart).filter(e=>e.socialResult);
      if(acceptedEvents.length){const ids=[...new Set(acceptedEvents.flatMap(e=>e.participants))];const changes=await openSims('replay_social',{now:time,people:ids.map(id=>actor(town.byId.get(id))),events:acceptedEvents.map(e=>({id:e.id,participants:e.participants,category:e.facts.category,outcome:e.facts.outcome,time:e.end}))});for(const [id,change] of Object.entries(changes)){const p=town.byId.get(id);p.relations=change.relations;p.state.psychology=change.psychology;p.state.affect=change.affect;}}
      for(const e of acceptedEvents){if(e.facts.outcome==='accepted')for(const id of e.participants){const p=town.byId.get(id);p.state.needs.social=clamp(p.state.needs.social-.18);}finalizedSocial(expansion,town,e);applySocialDynamics(town,e);for(const id of e.participants)completedSocial(town.byId.get(id),e,time);}
      const work=events.slice(minuteEventStart).filter(e=>e.type==='action_completed'&&(e.facts.action==='work'||e.facts.professionalWork||e.facts.action==='leisure_expanded_holiday_work'));
      if(work.length){const updates=await openSims('careers',{people:work.map(e=>({...actor(town.byId.get(e.participants[0])),duration:e.facts.durationSeconds,now:time,eventId:e.id}))});for(let i=0;i<updates.length;i++){const p=town.byId.get(work[i].participants[0]);p.state.career=updates[i].career;p.state.skills=updates[i].skills;}}
      for(const e of events.slice(minuteEventStart)){if(pj(town.world.rules,{}).currency==='USD')e.description=e.description.replaceAll(' €',' USD');e.personalExperiences={};for(const id of [...e.participants,...e.witnesses||[]]){const p=town.byId.get(id);if(!p)continue;const direct=e.participants.includes(id);e.personalExperiences[id]={interpretation:direct?interpretation(p,e):'I noticed this exchange nearby. I do not know their private intentions.',thought:p.state.thought,needs:{...p.state.needs},emotions:(p.state.affect?.states||[]).slice(0,3).map(x=>({id:x.id,intensity:x.intensity})),confidence:direct?.65:.5};}}
      if((time-town.world.seconds)%600===0){onProgress({phase:'minutes',completed:(time-town.world.seconds)/60,total:minutes});await new Promise(resolve=>setImmediate(resolve));}
    }

    const wasAnchored=interventionSim?.anchored;if(interventionSim)interventionSim.anchored=1;
    const cpuMs=performance.now()-started,fields=story?allocateFields(town,events,presence):[],selected=new Set(fields.flatMap(f=>f.members));
    if(interventionSim)interventionSim.anchored=wasAnchored;
    // Context-only observations let the Storyteller address a quiet anchored Sim.
    // Without a new authored reflection these never create personal journal rows.
    for(const p of town.people)if(story&&selected.has(p.id)&&!events.some(e=>e.participants.includes(p.id))){const e=event('status',p,end,{action:p.state.action?.kind||'travel',contextOnly:true});e.description=p.name+(p.state.route?' is traveling toward '+town.places.get(p.state.route.destination)?.name:' remains at '+town.places.get(p.state.location_id)?.name+' and '+(activity(p.state.action?.kind,catalog)||'considers what to do next'))+'.';}
    onProgress({phase:'procedural',eligible:selected.size,fields:fields.length,events:events.length});
    const musicSnapshot=new Map(prepared('SELECT location_id,music FROM lw_place_music WHERE world_id=?').all(worldId).map(r=>[r.location_id,r.music])),musicProposals=new Map();
    const sceneLines=[],stories=[],rejections=[],warnings=[],modelJournal=new Map(),authored=[],reflections=new Map(),toneReflections=new Map();let calls=0,biographyCalls=0;
    if(story&&selected.size){
      preflight(user.id,EST.tick()*fields.reduce((n,f)=>n+Math.ceil(f.members.length/24),0));
      const pendingBiography=town.people.filter(p=>selected.has(p.id)&&p.biography_mode==='written_pending');
      if(!modelCall)for(let i=0;i<pendingBiography.length;i+=6){
        const batch=pendingBiography.slice(i,i+6);onProgress({phase:'biography',eligible:batch.length});
        try{const result=await authorBiographies(user,batch,'',{signal});biographyCalls+=result.calls;authored.push(...batch);}
        catch(error){
          if(signal?.aborted||error.code==='ABORTED')throw error;
          // Optional background enrichment must not block an otherwise valid scene.
          // Keep the real initial background and expose the deferred task in the UI.
          for(const p of batch)p.biography_mode='written_deferred';
          warnings.push({code:'BIOGRAPHY_DEFERRED',simIds:batch.map(p=>p.id),message:'Die Biografie von '+batch.map(p=>p.name).join(', ')+' konnte nicht ausgearbeitet werden. Der Storyteller verwendet den vorhandenen Hintergrund. Erneut versuchen: Profil → Biografie ausarbeiten.'});
          onProgress({phase:'biography_deferred',message:warnings.at(-1).message});
        }
      }
      const call=modelCall || (messages=>withPrincipal(user,()=>llmChat(messages,{maxTokens:10000,reasoningEffort:'low',temperature:.7,signal})));
      for(const field of fields)for(let offset=0;offset<field.members.length;offset+=24){
        if(signal?.aborted)throw new Error('Tick cancelled before commit.');onProgress({phase:'storyteller',field:field.id,processed:calls*24,eligible:selected.size});
        const ids=field.members.slice(offset,offset+24),owned=new Set(ids),allRelevant=events.filter(e=>[...e.participants,...e.witnesses || []].some(id=>owned.has(id))),contextEvents=new Map();for(const id of ids){const personal=allRelevant.filter(e=>e.participants.includes(id)||e.witnesses?.includes(id));for(const e of personal.slice(-12).concat(personal.filter(e=>e.type==='social')))contextEvents.set(e.id,e);}const relevant=[...contextEvents.values()].sort((a,b)=>a.end-b.end),cohort=ids.map(id=>{
          const p=town.byId.get(id);return {id,name:p.name,age:p.age,biography:p.biography.slice(0,1800),profile:{job:p.profile.job,family:p.profile.family,interests:p.profile.interests,home:p.profile.home,workplace_id:p.profile.workplace_id},...personalSocialContext(p,town),...mindContext(p),resources:economicContext(p),socialExpectations:socialMindContext(p),aptitudes:p.state.aptitudes,skills:p.state.skills,action:p.state.action,location:p.state.location_id,route:p.state.route,ownThought:p.state.thought,personality:p.state.psychology.big_five,sharedGoals:Object.keys(p.relations).slice(0,16).map(id=>({simId:id,goals:town.byId.has(id)?sharedGoals(p,town.byId.get(id)):[]})).filter(x=>x.goals.length),communication:p.state.socialDynamics,
            memory:recall(id,(town.places.get(p.state.location_id)?.purpose || '')+' '+p.profile.interests.join(' '))};});
        const result=await call([{role:'system',content:`You are the Living World Storyteller. English family-friendly life simulation. There is no player/NPC distinction. All selected Sims receive equal causal care. Return strict valid JSON only, with escaped line breaks. Story at most 300 words, each thought at most 50 words. Return JSON {story:string,thoughts:[{simId,eventId,text,confidence}],reflections:[{simId,eventId,emotions:[{id,intensity}],needsDelta,focusGoalId,reason}],revisions:[{eventId,category}],intentions:[{simId,kind,destinationId,reason}],music:[{locationId,query}],narration:[{speaker,locationId,eventId,text,mode,emotion}]}. Music is optional: only propose a changed instrumental search query when the scene mood actually changes, and only for a room currently occupied by an owned Sim. Only use IDs from musicEligibleLocations; if that list is empty, return music:[]. Do not repeat unchanged music each tick. Narration contains short scene lines: speaker is an owned Sim ID or narrator, locationId and eventId reference a supplied actual event at that place, mode is speech or thought. Use dialogue where a supported encounter occurs; avoid inventing new physical actions. The supplied procedural events have already caused subsequent minute decisions. Preserve their facts and outcomes. Return an empty revisions array. Interpret their emotional meaning and propose future intentions to reconcile tension or develop opportunities. Intentions influence FUTURE actions only; respect school and work commitments rather than sending pupils home for leisure during class: kind is one of ${kinds(catalog).join(',')}, destinationId is a supplied place ID. Do not teleport, change ages/family/resources, invent witnessed events or give one Sim another's private knowledge. Thoughts must reference events that this Sim participated in or witnessed. Separate uncertain beliefs from fact. Respect declined contact. ${ROMANCE_INSTRUCTIONS} Use the supplied neighborhood character, each Sim's own wishes and known relationship background to ground emotional stakes. Relationship backgrounds are initialized or supplemental backstories, never newly witnessed events. Do not treat a Sim's private motive as knowledge held by their conversation partner. Show emotional intelligence, grounded small surprises, mutual help, hobbies and goals. Avoid generic repetitive scenes. Every owned Sim should have a contextual thought. Other batches share the same field but you may only write owned Sims. Missing details remain unmodeled, not retroactively invented. ${REFLECTION_INSTRUCTIONS}`},{role:'user',content:j({start:town.world.seconds,end,intervention:intervention?{kind:intervention.kind,text:intervention.text.slice(0,2000),targetId:interventionSim?.id}:null,startTime:iso(town.world.seconds),endTime:iso(end),owned:ids,field:{id:field.id,totalMembers:field.members.length,reasons:Object.fromEntries(ids.map(id=>[id,field.reasons[id]]))},sims:cohort,eventCoverage:{committedAfterValidation:allRelevant.length,provided:relevant.length,policy:'recent personal events plus all actual contacts; omitted details remain in each personal journal'},events:relevant.map(({journal,socialPair,socialResult,...e})=>e),musicEligibleLocations:[...new Set(cohort.map(p=>p.location).filter(id=>town.places.get(id)?.kind==='room'))],currentMusic:cohort.filter(p=>town.places.get(p.location)?.kind==='room').map(p=>({locationId:p.location,query:pj(musicSnapshot.get(p.location),{})?.query||null})),places:[...new Set(cohort.flatMap(p=>[p.location,p.profile.home?.living,p.profile.home?.kitchen,p.profile.home?.bath,p.profile.home?.bed,p.profile.workplace_id]).filter(Boolean))].map(id=>({id,name:town.places.get(id)?.name,actions:availableActions(town.places.get(id),catalog,town.byId.get(ids[0]))})),socialCategories:Object.keys(catalog.social)})}]);
        calls++;if(!modelCall)debitCall(user.id,result,'living_storyteller',{worldId});
        const output=parseModel(result.content);assertMinorSafeText(ids.map(id=>town.byId.get(id)),output);if(typeof output.story==='string')stories.push(output.story.slice(0,12000));
        for(const suggestion of (Array.isArray(output.music)?output.music:[]).slice(0,4)){
          if(!suggestion||typeof suggestion!=='object'){rejections.push('Invalid music proposal');continue;}
          const place=town.places.get(suggestion.locationId),query=typeof suggestion.query==='string'?suggestion.query.trim():'';
          if(!place||place.kind!=='room'||!cohort.some(p=>p.location===place.id)||!query||query.length>400){rejections.push('Invalid music location or query');continue;}
          if(musicProposals.has(place.id)||pj(musicSnapshot.get(place.id),{})?.query===query)continue;
          try{const music=await proposeMusic(place,query,'storyteller');if(music)musicProposals.set(place.id,music);}
          catch(error){warnings.push({code:'MUSIC_UNAVAILABLE',message:'Die bisherige Ortsmusik bleibt erhalten; die neue Suche ist derzeit nicht verfügbar.'});}
        }
        for(const line of Array.isArray(output.narration)?output.narration.slice(0,48):[]){
          const e=relevant.find(e=>e.id===line.eventId),speaker=town.byId.get(line.speaker);
          if(!e||e.location_id!==line.locationId||!town.places.has(line.locationId)||typeof line.text!=='string'||!line.text.trim()||!['speech','thought'].includes(line.mode)||(line.speaker!=='narrator'&&(!owned.has(line.speaker)||!e.participants.includes(line.speaker)))){rejections.push('Invalid scene line');continue;}
          sceneLines.push({event_id:e.id,location_id:line.locationId,speaker:line.speaker,text:line.text.slice(0,1200),mode:line.mode,emotion:String(line.emotion||'').slice(0,80)});
          if(speaker&&line.mode==='speech'&&speaker.state.location_id===line.locationId)speaker.state.dialogue=line.text.slice(0,1200);
          if(speaker&&!toneReflections.has(speaker.id)){const proposal=conversationReflection({mood:line.emotion,thought:line.text});if(proposal.emotions?.length)toneReflections.set(speaker.id,{proposal,event:e});}
        }
        for(const thought of output.thoughts || []){const e=events.find(e=>e.id===thought.eventId);if(!owned.has(thought.simId)||!(e?.participants.includes(thought.simId)||e?.witnesses?.includes(thought.simId))||typeof thought.text!=='string'||thought.text.trim().length<8){rejections.push('Unwitnessed or foreign thought');continue;}modelJournal.set(thought.simId+':'+e.id,{text:thought.text.slice(0,1000),confidence:Math.max(.05,Math.min(.95,Number(thought.confidence)||.6))});town.byId.get(thought.simId).state.thought=thought.text.slice(0,1000);town.byId.get(thought.simId).state.thought_source='storyteller';town.byId.get(thought.simId).state.thought_at=end;}
        for(const proposal of Array.isArray(output.reflections)?output.reflections.slice(0,24):[]){const e=events.find(e=>e.id===proposal.eventId);if(!owned.has(proposal.simId)||!(e?.participants.includes(proposal.simId)||e?.witnesses?.includes(proposal.simId))||reflections.has(proposal.simId)){rejections.push('Unwitnessed, foreign or duplicate mental reflection');continue;}reflections.set(proposal.simId,{proposal,event:e});}
        if(ids.some(id=>![...modelJournal.keys()].some(key=>key.startsWith(id+':'))))throw Object.assign(new Error('Der Storyteller hat nicht für alle ausgewählten Sims eine gültige persönliche Perspektive geliefert. Der Schritt wurde nicht gespeichert.'),{statusCode:502});
        for(const revision of output.revisions || [])rejections.push('Historical social effects are already causal; propose a future intention instead.');
        for(const intention of output.intentions || []){const p=town.byId.get(intention.simId);if(!owned.has(intention.simId)||!kinds(catalog).includes(intention.kind)||!town.places.has(intention.destinationId)||!availableActions(town.places.get(intention.destinationId),catalog,p,expansion,end).includes(intention.kind)||!findRoute(town,p.state.location_id || p.state.route?.destination,intention.destinationId)){rejections.push('Invalid or unreachable intention');continue;}p.state.goal={kind:intention.kind,destination:intention.destinationId,reason:String(intention.reason || '').slice(0,500),expires:end+3600,source:'storyteller'};}
      }
    }
    const socialEvents=events.filter(e=>e.socialResult);
    for(const [id,value] of toneReflections)if(!reflections.has(id))reflections.set(id,value);
    for(const [id,{proposal,event:e}] of reflections){const effects=reflect(town.byId.get(id),proposal,e,end);(e.facts.mentalEffects||={})[id]=effects;}
    const romanticInterpretations=new Map();for(const e of socialEvents)for(const id of e.witnesses||[]){const p=town.byId.get(id),text=romanticWitness(p,e,town.byId,end);if(text){romanticInterpretations.set(id+':'+e.id,text);proceduralThought(p,text,end);}}
    if(expansion)refreshOwnResources(expansion,end);
    for(const p of town.people)evaluateMind(p,end,catalog);
    for(const e of events){
      if(e.personalExperiences)e.facts.personalExperiences=e.personalExperiences;
      for(const id of e.participants){const p=town.byId.get(id),thought=modelJournal.get(id+':'+e.id);if(e.type==='status'&&!thought)continue;e.journal.push({simId:id,channel:e.facts.remote?'telephone':'direct',perception:e.description,interpretation:thought?.text || e.personalExperiences?.[id]?.interpretation || interpretation(p,e),confidence:thought?.confidence ?? e.personalExperiences?.[id]?.confidence ?? .65});}
      if(!e.facts.private)for(const id of e.witnesses || []){const thought=modelJournal.get(id+':'+e.id);e.journal.push({simId:id,channel:'nearby_observation',perception:e.description,interpretation:thought?.text || romanticInterpretations.get(id+':'+e.id) || 'I noticed this exchange nearby. I do not know their private intentions.',confidence:thought?.confidence ?? .5});}
    }
    const beatId=uid('lb_'),metrics={population:town.people.length,events:events.length,journalEntries:events.reduce((n,e)=>n+e.journal.length,0),eligible:selected.size,fields:fields.length,modelCalls:calls,biographyCalls,cpuMs:Math.round(cpuMs),totalMs:Math.round(performance.now()-started),rejections,warnings};
    db.transaction(()=>{
      if(signal?.aborted)throw new Error('Tick cancelled before commit.');
      if(prepared('SELECT version FROM lw_worlds WHERE world_id=?').get(worldId).version!==before)throw Object.assign(new Error('Stale proposal rejected.'),{statusCode:409});
      const changes=[];
      for(const p of town.people){changes.push({id:p.id,patches:stateDiff(initialStates.get(p.id),p.state)});prepared('UPDATE lw_sims SET state=?,location_id=?,biography=?,biography_mode=?,profile=?,age=?,household_id=? WHERE id=?').run(j(p.state),p.state.location_id,p.biography,p.biography_mode,j(p.profile),p.age,p.household_id,p.id);for(const [other,relation] of Object.entries(p.relations))prepared('INSERT INTO lw_relations VALUES (?,?,?,?) ON CONFLICT(world_id,from_id,to_id) DO UPDATE SET payload=excluded.payload').run(worldId,p.id,other,j(relation));}
      prepared('INSERT INTO lw_beats VALUES (?,?,?,?,?,?,?,?,?,?)').run(beatId,worldId,before+1,town.world.seconds,end,story?'hybrid':'procedural_test',j(fields),j(stories),j(changes),j(metrics));
      for(const e of events)insertEvent({...e,beat_id:beatId},e.journal);
      for(const line of sceneLines)prepared('INSERT INTO lw_scene_lines VALUES (?,?,?,?,?,?,?,?)').run(worldId,beatId,line.event_id,line.location_id,line.speaker,line.text,line.mode,line.emotion);
      for(const p of authored)recordBiography(worldId,p,end,beatId);
      for(const [placeId,music] of musicProposals)commitMusic(worldId,placeId,music,musicSnapshot.get(placeId)||null);
      if(expansion)commitEconomy(expansion);
      prepared('UPDATE lw_worlds SET version=?,seconds=? WHERE world_id=?').run(before+1,end,worldId);
      prepared('UPDATE worlds SET sim_time=?,tick_index=?,updated_at=? WHERE id=?').run(iso(end),before+1,now(),worldId);
    })();
    return {version:before+1,simTime:iso(end),metrics,story:stories,fields};
  }finally{}
}

export function stateDiff(before,after,path='') {
  if(j(before)===j(after))return [];
  if(Array.isArray(before)&&Array.isArray(after)&&Math.max(before.length,after.length)>8){
    // Recent evidence/contact lists rotate. Preserve a reversible splice rather
    // than re-storing the whole 128-entry before/after ring at every tick.
    const first=j(after[0]),drop=before.findIndex(x=>j(x)===first),overlap=before.length-drop;
    if(drop>=0&&overlap>=4&&overlap<=after.length&&before.slice(drop).every((x,i)=>j(x)===j(after[i])))return [{path,op:'array_shift_append',removed:before.slice(0,drop),added:after.slice(overlap),beforeLength:before.length,afterLength:after.length}];
    return [{path,before,after}];
  }
  if(before&&after&&typeof before==='object'&&typeof after==='object')return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(key=>stateDiff(before[key],after[key],path+'/'+key));
  return [{path,before:before??null,after:after??null}];
}

export function recordBiography(worldId,p,time,beatId=null){insertEvent({id:uid('le_'),world_id:worldId,beat_id:beatId,start:time,end:time,type:'initialization_authored_background',location_id:p.state.location_id,participants:[p.id],facts:{coverage:'authored_background',doesNotRewriteWitnessedEvents:true},description:p.biography,source:'authored_initialization'},[{simId:p.id,channel:'initialization',perception:p.biography,interpretation:'Mein Ausgangshintergrund wurde ausgearbeitet. Bereits erlebte Ereignisse bleiben erhalten.',confidence:1}]);}
