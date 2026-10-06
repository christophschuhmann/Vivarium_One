import {db} from './schema.js';
import {uid,j,pj,now} from '../db.js';
import {generateTown,rng} from './generate.js';
import {openSims,openSimsCatalog} from './open_sims.js';
import {llmChat} from '../providers.js';
import {withPrincipal} from '../byok.js';
import {preflight,debitCall,EST} from '../credits.js';
import {recall} from './memory.js';
import {activity,thought as actionThought} from './presentation.js';
import {libraryDigest} from './library.js';
import {SOCIAL_VERSION} from './neighborhoods.js';
import {socialDestination,personalSocialContext,conversationDescription,socialInterpretation} from './social.js';
import {LIFE_VERSION,prepareMind,evaluateMind,emotionalRate,motivationBias,completedActivity,completedSocial,reflect,mindContext,REFLECTION_INSTRUCTIONS,proceduralThought,conversationReflection} from './cognition.js';
import {dutyDestination,serviceDestination} from './facilities.js';
const clamp=n=>Math.max(0,Math.min(1,n));
export const busy=new Set();
const ACTIONS=['eat','drink','toilet','shower','sleep','relax','read','garden','work','stroll','wait','creative_hobby','school_day','kindergarten_day','community_meet'];
const kinds=catalog=>ACTIONS.concat(Object.keys(catalog.actions).filter(k=>k.startsWith('leisure_')));
const iso=seconds=>new Date(Date.UTC(2026,8,21)+seconds*1000).toISOString();
export function loadTown(worldId) {
  const world=db.prepare('SELECT * FROM lw_worlds WHERE world_id=?').get(worldId);
  if(!world)throw Object.assign(new Error('Living world not found'),{statusCode:404});
  const places=new Map(db.prepare('SELECT * FROM lw_places WHERE world_id=?').all(worldId).map(p=>[p.id,{...p,affordances:pj(p.affordances,[])}]));
  const people=db.prepare('SELECT * FROM lw_sims WHERE world_id=? ORDER BY rowid').all(worldId).map(p=>({...p,profile:pj(p.profile,{}),state:pj(p.state,{})}));
  const byId=new Map(people.map(p=>[p.id,p]));
  for(const p of people)p.relations={};
  for(const relation of db.prepare('SELECT * FROM lw_relations WHERE world_id=?').all(worldId))if(byId.has(relation.from_id))byId.get(relation.from_id).relations[relation.to_id]=pj(relation.payload,{});
  const graph=new Map();
  for(const edge of db.prepare('SELECT * FROM lw_edges WHERE world_id=?').all(worldId)) {if(!graph.has(edge.from_id))graph.set(edge.from_id,[]);graph.get(edge.from_id).push({id:edge.to_id,seconds:edge.seconds});}
  return {world,places,people,byId,graph};
}
export async function createTown(user,options={}) {
  const population=Number(options.population ?? 10),seed=Number(options.seed ?? 73);
  if(!Number.isInteger(population)||population<2||population>500||!Number.isSafeInteger(seed))throw Object.assign(new Error('Choose 2–500 Sims and an integer seed.'),{statusCode:400});
  const worldId=uid('w_'),town=await generateTown(worldId,{population,seed,title:String(options.title || 'Lindenstadt').slice(0,80)});
  if(options.story)await authorBiographies(user,town.people.filter(p=>p.anchored));
  db.transaction(()=>{
    db.prepare("INSERT INTO worlds(id,user_id,title,sim_time,status,simulation_mode,created_at,updated_at) VALUES (?,?,?,?,'live','living',?,?)").run(worldId,user.id,String(options.title || 'Lindenstadt').slice(0,80),iso(27000),now(),now());
    db.prepare('INSERT INTO lw_worlds(world_id,seed,rules) VALUES (?,?,?)').run(worldId,seed,j({...town.catalog.manifest,assetLibrary:libraryDigest(),socialVersion:SOCIAL_VERSION,lifeVersion:LIFE_VERSION,neighborhoods:town.identities}));
    for(const p of town.places)db.prepare('INSERT INTO lw_places(id,world_id,parent_id,name,kind,purpose,asset_id,x,y,capacity,anchored,landmark,affordances) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(p.id,worldId,p.parent_id,p.name,p.kind,p.purpose,p.asset_id,p.x,p.y,p.capacity,p.anchored,p.landmark,j(p.affordances));
    for(const e of town.edges)db.prepare('INSERT INTO lw_edges VALUES (?,?,?,?)').run(worldId,e.from_id,e.to_id,e.seconds);
    for(const p of town.people){
      const profile={...p.profile,family:p.family,home:p.home,workplace_id:p.workplace_id,preferences:p.preferences,seed_key:p.seed_key};
      db.prepare('INSERT INTO lw_sims(id,world_id,household_id,name,age,gender,asset_id,colour,anchored,biography_mode,biography,profile,state,location_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(p.id,worldId,p.household_id,p.name,p.age,p.gender,p.asset_id,p.colour,p.anchored,p.biography_mode,p.biography,j(profile),j(p.state),p.location_id);
      for(const [other,relation] of Object.entries(p.relations))db.prepare('INSERT INTO lw_relations VALUES (?,?,?,?)').run(worldId,p.id,other,j(relation));
      for(const [type,text] of [['identity',p.biography],['family',p.family.parent_ids.length?'Kennt die eigene Familie und fühlt sich hier zu Hause.':'Hat das eigene Zuhause und vertraute Kontakte.'],['goal',p.state.psychology.ambitions.map(a=>a.title).join('; ')]]){
        const id=uid('le_');insertEvent({id,world_id:worldId,start:27000,end:27000,type:'initialization_'+type,location_id:p.location_id,participants:[p.id],facts:{coverage:'initialized_background',biographyMode:p.biography_mode},description:text,source:p.biography_mode==='written'?'authored_initialization':'procedural_initialization'},[{simId:p.id,perception:text,interpretation:type==='goal'?'Das möchte ich verfolgen.':'So erinnere ich mich an meinen bisherigen Lebensweg.',channel:'initialization',confidence:1}]);
      }
    }
  })();
  return {worldId,population,households:town.households.length,locations:town.places.length};
}
function parseModel(text) {const clean=String(text).replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,'');try{return JSON.parse(clean);}catch{throw Object.assign(new Error('Das Modell hat kein vollständiges gültiges JSON geliefert. Der Schritt wurde nicht gespeichert. Bitte erneut versuchen oder das Modell wechseln.'),{statusCode:502});}}
export async function authorBiographies(user,people,instruction='') {
  if(!people.length)return;
  preflight(user.id,EST.chat());
  const result=await withPrincipal(user,()=>llmChat([{role:'system',content:'Write plausible emotionally intelligent fictional biographies in German. Return JSON {biographies:[{id,text}]}. Preserve supplied ages, jobs, family IDs, social background and home facts. Never invent incest, sexual content about minors, or real past world events. These are authored initial backgrounds, not witnessed events. 120–180 words per person. Output only strict valid JSON with escaped line breaks.'},{role:'user',content:j({instruction,people:people.map(p=>({id:p.id,name:p.name,age:p.age,job:p.profile.job,family:p.family || p.profile.family,social:p.profile.social,neighborhood:p.profile.neighborhood,goals:(p.psychology || p.state?.psychology)?.ambitions,existing:p.biography}))})}],{maxTokens:Math.min(14000,people.length*1400+5000),reasoningEffort:'low',temperature:.6}));
  debitCall(user.id,result,'living_biography');
  const output=parseModel(result.content);
  for(const person of people){const bio=output.biographies?.find(b=>b.id===person.id);if(typeof bio?.text!=='string'||bio.text.length<100)throw new Error('The model did not provide all requested biographies.');person.biography=bio.text.slice(0,5000);person.biography_mode='written';}
}
export function findRoute(town,from,to) {
  if(from===to)return [];
  const queue=[from],previous=new Map([[from,null]]);
  for(let i=0;i<queue.length;i++)for(const edge of town.graph.get(queue[i]) || []){
    if(previous.has(edge.id))continue;previous.set(edge.id,{from:queue[i],seconds:edge.seconds});queue.push(edge.id);
    if(edge.id===to){const steps=[];let at=to;while(previous.get(at)){const e=previous.get(at);steps.unshift({id:at,seconds:e.seconds});at=e.from;}return steps;}
  }return null;
}
function actor(p){return {id:p.id,age:p.age,household_id:p.household_id,profile:p.profile,family:p.profile.family,workplace_id:p.profile.workplace_id,preferences:p.profile.preferences,psychology:p.state.psychology,needs:p.state.needs,relations:p.relations,affect:p.state.affect,career:p.state.career,skills:p.state.skills};}
function availableActions(place,catalog,p) {
  if(!place)return ['wait'];
  return kinds(catalog).filter(kind=>{
    if(kind==='work'&&(p.age<18||p.profile.job==='Retired'))return false;
    if(kind==='school_day'&&(p.age<6||p.age>=18)||kind==='kindergarten_day'&&(p.age<3||p.age>=6))return false;
    if(p.age<3 && !['eat','drink','toilet','shower','sleep','relax','wait'].includes(kind))return false;
    if(p.age<18&&/party|date|karaoke|live_music|shop_for_fun/.test(kind))return false;
    const objects=catalog.actions[kind].object_kinds;return kind!=='wait'&&(!objects.length||objects.some(k=>place.affordances.includes(k)));
  });
}
function contains(town,placeId,ancestor){let at=placeId;for(let i=0;at&&i<12;i++){if(at===ancestor)return true;at=town.places.get(at)?.parent_id;}return false;}
function scheduledDestination(town,p,time) {
  const hour=time/3600%24,weekday=Math.floor(time/86400)%7<5,home=p.profile.home;
  if(p.age<3)return hour>=20||hour<7?home.bed:home.living;
  if(hour>=22||hour<7)return home.bed;
  if(weekday&&hour>=8&&hour< (p.age<18?14:16)&&p.profile.workplace_id)return dutyDestination(p,time);
  const social=socialDestination(town,p,time);if(social)return social;
  if(weekday&&hour>=16&&hour<18 || !weekday&&hour>=10&&hour<12){const familyPlan=p.age<12?town.byId.get(p.profile.family.parent_ids[0]) || p:p,draw=rng(`${town.world.seed}:outing:${familyPlan.profile.seed_key}:${Math.floor(time/86400)}`);if(draw()>(weekday?.45:.65))return home.living;const interests=familyPlan.profile.interests,purpose=interests.includes('reading')?'public library':interests.some(k=>['walking','gardening'].includes(k))?'town park':interests.some(k=>['socializing','music'].includes(k))?'shopping street cafe':null;return purpose?[...town.places.values()].find(l=>l.kind==='room'&&l.purpose.includes(purpose))?.id || home.living:home.living;}
  return home.living;
}
function interpretation(p,event) {
  if(event.type==='social')return socialInterpretation(p,event);
  if(event.type==='arrival')return 'Ich bin hier angekommen und kann mich neu orientieren.';
  if(event.type==='action_completed')return 'Das hat mir geholfen, meinen Alltag und meine Ziele zu verfolgen.';
  return p.state.thought || 'Ich nehme wahr, was gerade um mich herum geschieht.';
}
export function insertEvent(event,entries) {
  db.prepare('INSERT INTO lw_events(id,world_id,beat_id,start,end,location_id,type,participants,facts,description,source) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(event.id,event.world_id,event.beat_id || null,event.start,event.end,event.location_id,event.type,j(event.participants),j(event.facts),event.description,event.source);
  for(const entry of entries)db.prepare('INSERT INTO lw_journal VALUES (?,?,?,?,?,?,?)').run(entry.simId,event.id,event.end,entry.channel,entry.perception,entry.interpretation,entry.confidence);
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
export async function advanceTown(user,worldId,{minutes=5,story=true,expectedVersion,intervention,modelCall,signal,onProgress=()=>{}}={}) {
  if(typeof story!=='boolean')throw Object.assign(new Error('Choose whether to use the Storyteller.'),{statusCode:400});
  if(!Number.isInteger(minutes)||minutes<1||minutes>60)throw Object.assign(new Error('Advance 1–60 minutes at a time.'),{statusCode:400});
  if(busy.has(worldId))throw Object.assign(new Error('A tick is already running.'),{statusCode:409});
  busy.add(worldId);
  try {
    const started=performance.now(),town=loadTown(worldId),catalog=await openSimsCatalog(),before=town.world.version,end=town.world.seconds+minutes*60;
    if(expectedVersion!==undefined&&expectedVersion!==before)throw Object.assign(new Error('The world changed. Refresh before advancing.'),{statusCode:409});
    const events=[],presence=new Map(),initialStates=new Map(town.people.map(p=>[p.id,structuredClone(p.state)])),initialRelations=new Map(town.people.map(p=>[p.id,structuredClone(p.relations)])),youngByHouse=new Map();
    for(const child of town.people)if(child.age<3){if(!youngByHouse.has(child.household_id))youngByHouse.set(child.household_id,[]);youngByHouse.get(child.household_id).push(child);}
    const event=(type,p,time,facts={},others=[],location=p.state.location_id)=>{
      const description=type==='arrival'?`${p.name} kommt in ${town.places.get(location)?.name} an.`:type==='departure'?`${p.name} geht von ${town.places.get(location)?.name} nach ${town.places.get(facts.destination)?.name}.`:type==='action_completed'?`${p.name} beendet: ${activity(facts.action,catalog)}.`:`${p.name}: ${activity(facts.action,catalog)}.`;
      const e={id:worldId+'_e_'+(before+1)+'_'+events.length,world_id:worldId,start:time,end:time,location_id:location,type,participants:[p.id,...others],facts,description,source:'procedural',journal:[]};events.push(e);return e;
    };
    for(const p of town.people){p.state.dialogue=null;prepareMind(p,town.world.seconds,{seed:town.world.seed});evaluateMind(p,town.world.seconds,catalog);}
    let interventionSim=null;
    if(intervention){
      if(typeof intervention.text!=='string'||!intervention.text.trim()||!['event','idea','condition','directorial'].includes(intervention.kind))throw Object.assign(new Error('Invalid intervention.'),{statusCode:400});
      if(intervention.targetId||intervention.target){interventionSim=town.people.find(p=>p.id===intervention.targetId||p.name===intervention.target);if(!interventionSim)throw Object.assign(new Error('Intervention target not found.'),{statusCode:400});}
      const targets=interventionSim?[interventionSim]:town.people.filter(p=>p.anchored||town.places.get(p.state.location_id)?.anchored);
      for(const p of targets){const e=event('intervention',p,town.world.seconds,{kind:intervention.kind,text:intervention.text.slice(0,2000),status:intervention.kind==='event'?'authored_event':'direction'});e.description=intervention.kind==='event'?intervention.text.slice(0,2000):'Regieimpuls: '+intervention.text.slice(0,2000);e.source='user_intervention';}
    }
    town.transitFields=new Map();
    const notePresence=time=>{const locations=new Map();for(const p of town.people){let location=p.state.location_id;const route=p.state.route;if(!location&&route){const from=route.index?route.path[route.index-1].id:route.from,to=route.path[route.index || 0].id;location='edge:'+[from,to].sort().join('~');town.transitFields.set(location,{from,to});}if(location){if(!locations.has(location))locations.set(location,[]);locations.get(location).push(p.id);}}presence.set(time,locations);return locations;};
    notePresence(town.world.seconds);
    const bias=await openSims('bias',{people:town.people.map(actor),kinds:kinds(catalog),now:town.world.seconds});
    for(let time=town.world.seconds+60;time<=end;time+=60) {
      const occupancy=new Map();for(const p of town.people)if(p.state.location_id)occupancy.set(p.state.location_id,(occupancy.get(p.state.location_id)||0)+1);
      const reservations=new Set(town.people.filter(p=>p.state.action?.resource).map(p=>p.state.action.resource));
      const escort=new Map();
      for(const child of town.people.filter(p=>p.age<12&&p.age>=3&&!p.state.route&&!['sleep','toilet','shower','eat','drink'].includes(p.state.action?.kind))){
        const destination=scheduledDestination(town,child,time),guardian=child.profile.family.parent_ids.map(id=>town.byId.get(id)).find(p=>p&&p.state.location_id===child.state.location_id&&!p.state.route&&p.id!==youngByHouse.get(p.household_id)?.[0]?.profile.family.parent_ids[0]&&!['sleep','toilet','shower','eat','drink'].includes(p.state.action?.kind)&&Math.max(...Object.values(p.state.needs))<.6);
        if(destination!==child.state.location_id&&guardian&&Math.max(...Object.values(child.state.needs))<.6){escort.set(guardian.id,destination);escort.set(child.id,destination);}
      }
      for(let i=0;i<town.people.length;i++) {
        const p=town.people[i],state=p.state,place=town.places.get(state.location_id),draw=rng(`${town.world.seed}:${p.profile.seed_key}:${time}`);
        for(const [need,rate] of Object.entries(catalog.rates)){const asleep=state.action?.kind==='sleep',change=asleep?(need==='fatigue'?-.12:need==='comfort'?-.04:rate*.2):rate*emotionalRate(p,need);state.needs[need]=clamp((state.needs[need]||0)+change/60);}
        evaluateMind(p,time,catalog);
        if(state.route){
          if(state.route.atNode){occupancy.set(state.location_id,(occupancy.get(state.location_id)||1)-1);state.location_id=null;state.route.atNode=false;}
          state.route.remaining-=60;
          if(state.route.remaining<=0){const goal=state.route.path[state.route.index || 0].id,slots=occupancy.get(goal)||0;
            if(slots>=town.places.get(goal).capacity){state.route.remaining=60;proceduralThought(p,'Ich warte, bis am Ziel Platz frei wird.',time);continue;}
            state.location_id=goal;occupancy.set(goal,slots+1);event('arrival',p,time,{from:state.route.from,guardianId:state.route.guardianId,transport:state.route.transport});state.route.index=(state.route.index||0)+1;
            if(state.route.index<state.route.path.length){state.route.remaining=Math.max(60,state.route.path[state.route.index].seconds);state.route.atNode=true;continue;}state.route=null;
          }else continue;
        }
        const commitment=p.id===youngByHouse.get(p.household_id)?.[0]?.profile.family.parent_ids[0]?p.profile.home.living:scheduledDestination(town,p,time);
        if(state.goal&&commitment===p.profile.workplace_id&&state.goal.destination!==commitment&&!['eat','drink','toilet','shower','sleep'].includes(state.goal.kind)&&!(p.age>=18&&state.goal.kind==='work')){const e=event('goal_deferred',p,time,{reason:'scheduled_commitment',destination:state.goal.destination});e.description=`${p.name} stellt ein Freizeitvorhaben zurück, um die geplante Schule oder Arbeit wahrzunehmen.`;state.goal=null;}
        if(state.action){
          const caregiving=p.id===youngByHouse.get(p.household_id)?.[0]?.profile.family.parent_ids[0],duty=caregiving?p.profile.home.living:scheduledDestination(town,p,time),interrupt=Math.max(state.needs.bladder,state.needs.hunger,state.needs.thirst)>.92&&!['eat','drink','toilet'].includes(state.action.kind)||escort.has(p.id)&&!['sleep','toilet','shower','eat','drink'].includes(state.action.kind)||!state.goal&&duty===p.profile.workplace_id&&state.location_id!==duty&&!['sleep','toilet','shower','eat','drink'].includes(state.action.kind)&&!(state.action.kind==='read'&&state.needs.fun>.6);
          if(state.action.until>time&&!interrupt)continue;
          if(state.action.until<=time){const relief={};for(const [need,value] of Object.entries(catalog.actions[state.action.kind]?.relief || {})){const beforeNeed=state.needs[need];state.needs[need]=clamp(beforeNeed-value*(state.action.kind==='sleep'?Math.min(1,(state.action.until-state.action.started)/catalog.actions.sleep.duration):1));relief[need]=beforeNeed-state.needs[need];}
            const e=event('action_completed',p,time,{action:state.action.kind});completedActivity(p,e,state.action.until-state.action.started,relief,time);
          }else event('action_interrupted',p,time,{action:state.action.kind,reason:'commitment'});
          reservations.delete(state.action.resource);state.action=null;
        }
        const at=town.places.get(state.location_id),actions=availableActions(at,catalog,p);
        const primary={eat:'hunger',drink:'thirst',toilet:'bladder',shower:'hygiene',sleep:'fatigue',read:'fun',relax:'comfort'};
        let urgent=actions.filter(k=>primary[k]&&state.needs[primary[k]]>.8).sort((a,b)=>state.needs[primary[b]]-state.needs[primary[a]])[0];
        if(state.goal?.expires<=time)state.goal=null;
        let destination=escort.get(p.id) || state.goal?.destination || scheduledDestination(town,p,time);
        const young=youngByHouse.get(p.household_id)||[];
        if(p.id===young[0]?.profile.family.parent_ids[0])destination=p.profile.home.living; // parental care instead of leaving small children alone
        if(p.age<12&&destination!==state.location_id&&!escort.has(p.id)&&!Object.values(p.profile.home).includes(destination)&&!contains(town,destination,p.household_id)&&destination!==p.profile.workplace_id&&!Object.values(p.profile.facility?.rooms||{}).includes(destination))destination=state.location_id;
        if(!urgent){
          if(state.needs.bladder>.7)destination=serviceDestination(town,p,'bath');
          else if(state.needs.hunger>.65||state.needs.thirst>.7)destination=serviceDestination(town,p,'kitchen');
          else if(state.needs.fatigue>.8)destination=p.profile.home.bed;
          else if(state.needs.hygiene>.7)destination=p.profile.home.bath;
          else if(state.needs.fun>.85||state.needs.comfort>.85)destination=serviceDestination(town,p,'living');
        }
        if(!urgent&&destination!==state.location_id){
          const path=findRoute(town,state.location_id,destination);
          if(path?.length){const from=state.location_id;event('departure',p,time,{destination,path:path.map(s=>s.id)},[],from);state.route={from,destination,path,index:0,remaining:Math.max(60,path[0].seconds),guardianId:p.age<12&&escort.has(p.id)?p.profile.family.parent_ids.find(id=>escort.has(id)):null,transport:p.age<12&&(!contains(town,from,p.household_id)||!contains(town,destination,p.household_id))?(escort.has(p.id)?'guardian_accompanied':p.profile.facility&&contains(town,from,p.profile.facility.buildingId)&&contains(town,destination,p.profile.facility.buildingId)?'supervised_school_activity':'supervised_school_transport'):null};state.location_id=null;occupancy.set(from,(occupancy.get(from)||1)-1);proceduralThought(p,p.age<12?(state.route.transport==='guardian_accompanied'?'Ich gehe mit meiner Bezugsperson mit.':state.route.transport==='supervised_school_transport'?'Ich fahre mit dem betreuten Schultransport.':state.route.transport==='supervised_school_activity'?'Ich gehe im betreuten Schul- oder Kindergartenbereich weiter.':'Ich gehe in den nächsten Raum meines Zuhauses.'):'Ich mache mich auf den Weg zu meinem nächsten Vorhaben.',time);continue;}
        }
        let kind=urgent || (state.goal?.destination===state.location_id?state.goal.kind:null) || (state.location_id===p.profile.workplace_id?(p.age<6?'kindergarten_day':p.age<18?'school_day':'work'):time/3600%24>=22||time/3600%24<7?'sleep':null);
        if(kind&&!actions.includes(kind))kind=null;
        if(!kind){const scored=actions.map(kind=>({kind,score:Object.entries(catalog.actions[kind].relief).reduce((n,[need,relief])=>n+state.needs[need]*relief,0)+(bias[i][kind]||0)*.3+motivationBias(p,kind)+draw()*.22})).sort((a,b)=>b.score-a.score);kind=scored[0]?.kind || 'wait';}
        const resource=['toilet','shower'].includes(kind)?state.location_id+':bath':null;
        if(resource&&reservations.has(resource))kind='wait';else if(resource)reservations.add(resource);
        if(at?.purpose.includes('bathroom')&&!['toilet','shower','drink','wait'].includes(kind))kind='wait';
        state.action={kind,started:time,until:time+(kind==='sleep'&&time/3600%24>=7&&time/3600%24<21?1800:catalog.actions[kind].duration),resource:kind==='wait'?null:resource,source:'procedural'};proceduralThought(p,actionThought(kind,catalog),time);
        if(state.goal?.destination===state.location_id&&state.goal.kind===kind){state.action.source='storyteller';state.thought=state.goal.reason;state.thought_source='storyteller';state.thought_at=time;state.goal=null;}
        const object=catalog.actions[kind].object_kinds.find(o=>at?.affordances.includes(o)) || null;
        const e=event('action_started',p,time,{action:kind,object});e.description=`${p.name}: ${activity(kind,catalog)}${object?' · '+(({desk:'am Schreibtisch',bookshelf:'am Bücherregal',table:'am Tisch',bed:'am Bett',sofa:'auf dem Sofa',toilet:'in einem privaten Bad',shower:'in einem privaten Bad',fridge:'in der Küche',sink:'am Waschbecken',park_marker:'im Park',planter:'bei den Pflanzen'})[object] || object):''}.`;
        state.action.event_id=e.id;evaluateMind(p,time,catalog);
      }
      const current=notePresence(time),pairs=[],used=new Set();
      for(const [location,ids] of current) {
        if(!town.places.has(location)||town.places.get(location).purpose.includes('bathroom'))continue;
        const available=ids.map(id=>town.byId.get(id)).filter(p=>p.age>=3&&time-p.state.last_social>=1200&&!['sleep','toilet','shower'].includes(p.state.action?.kind));
        for(let i=0;i<available.length;i++){const a=available[i];if(used.has(a.id))continue;
          if(rng(`${town.world.seed}:social:${a.profile.seed_key}:${time}`)()>.14)continue;
          const score=b=>{const r=a.relations[b.id],last=r?.last_interaction;return (r?.closeness||0)*.3+(r?.tension||0)*.1+(a.profile.interests.some(k=>b.profile.interests.includes(k))?.08:0)+(last!=null&&time-last<7200?-.2:0)+rng(`${time}:peer:${a.profile.seed_key}:${b.profile.seed_key}`)()*.18;};
          // Scan a bounded local window plus known co-present contacts, not the whole population per Sim.
          const candidates=new Map(available.slice(Math.max(0,i-6),i+7).filter(b=>b.id!==a.id&&!used.has(b.id)).map(b=>[b.id,b]));
          for(const id of Object.keys(a.relations).slice(0,16)){const b=town.byId.get(id);if(b&&b.state.location_id===location&&b.age>=3&&!used.has(id)&&time-b.state.last_social>=1200&&!['sleep','toilet','shower'].includes(b.state.action?.kind))candidates.set(id,b);}
          const b=[...candidates.values()].sort((b,c)=>score(c)-score(b))[0];if(!b)continue;
          const id=worldId+'_e_'+(before+1)+'_'+(events.length+pairs.length);pairs.push({a:actor(a),b:actor(b),seed:town.world.seed+':'+a.profile.seed_key+':'+b.profile.seed_key+':'+time,eventId:id,location,aId:a.id,bId:b.id});used.add(a.id);used.add(b.id);
        }
      }
      // Remote contacts are explicit and involve an already-known person.
      for(const a of town.people)if(!used.has(a.id)&&a.age>=12&&time-a.state.last_social>=1800&&a.state.needs.social>.6&&rng(`${town.world.seed}:phone:${a.profile.seed_key}:${time}`)()<.035){
        const id=Object.keys(a.relations).filter(id=>{const b=town.byId.get(id);return b&&b.age>=12&&b.state.location_id&&b.state.location_id!==a.state.location_id&&!used.has(id)&&!['sleep','toilet','shower'].includes(b.state.action?.kind)&&time-b.state.last_social>=1800;}).sort((b,c)=>(a.relations[c].trust||0)-(a.relations[b].trust||0))[0];if(!id||!a.state.location_id||['sleep','toilet','shower'].includes(a.state.action?.kind))continue;const b=town.byId.get(id);
        const eventId=worldId+'_e_'+(before+1)+'_'+(events.length+pairs.length);pairs.push({a:actor(a),b:actor(b),category:'phone_call',seed:town.world.seed+':'+a.profile.seed_key+':'+b.profile.seed_key+':'+time,eventId,location:a.state.location_id,aId:a.id,bId:b.id,remote:true});used.add(a.id);used.add(b.id);
      }
      if(pairs.length){const results=await openSims('social',{pairs,now:time});
        for(let i=0;i<pairs.length;i++){const pair=pairs[i],result=results[i];if(!result.allowed)continue;const a=town.byId.get(pair.aId),b=town.byId.get(pair.bId);
          const e=event('social',a,time,{category:result.category,outcome:result.outcome,remote:!!pair.remote,consent:result.consent},[b.id],pair.location);e.description=conversationDescription(a,b,result.category,result.outcome,!!pair.remote);
          if(result.outcome==='accepted'&&result.category==='express_affection'&&a.age>=18&&b.age>=18&&a.profile.family.partner_id===b.id&&town.places.get(pair.location)?.purpose.includes('bedroom')&&current.get(pair.location)?.length===2){e.facts.private=true;e.description=`${a.name} und ${b.name} genießen einen privaten, liebevollen Moment miteinander. Einzelheiten bleiben privat.`;}
          e.socialPair=pair;e.socialResult=result;
          // Later encounters in this step see earlier relationship changes.
          for(const [id,patch] of Object.entries(result.patch))town.byId.get(id).relations={...town.byId.get(id).relations,...patch.relations};
          a.state.last_social=b.state.last_social=time;
          // Relief is applied only after the final, consent-checked event is accepted.
        }
      }
    }
    for(const p of town.people)if(!events.some(e=>e.participants.includes(p.id))){const e=event('status',p,end,{action:p.state.action?.kind || 'travel',destination:p.state.route?.destination});e.description=`${p.name} ${p.state.route?'ist auf dem Weg nach '+town.places.get(p.state.route.destination)?.name:'bleibt in '+town.places.get(p.state.location_id)?.name+' und '+(activity(p.state.action?.kind,catalog) || 'orientiert sich')}.`;}
    for(const e of events)if(e.type==='social'&&!e.facts.remote&&!e.facts.private){const nearby=presence.get(e.end)?.get(e.location_id)||[],index=nearby.indexOf(e.participants[0]);e.witnesses=nearby.slice(Math.max(0,index-2),index+3).filter(id=>!e.participants.includes(id));}
    const wasAnchored=interventionSim?.anchored;if(interventionSim)interventionSim.anchored=1;
    const cpuMs=performance.now()-started,fields=allocateFields(town,events,presence),selected=new Set(fields.flatMap(f=>f.members));
    if(interventionSim)interventionSim.anchored=wasAnchored;
    onProgress({phase:'procedural',eligible:selected.size,fields:fields.length,events:events.length});
    const sceneLines=[],stories=[],rejections=[],modelJournal=new Map(),authored=[],reflections=new Map(),toneReflections=new Map();let calls=0;
    if(story&&selected.size){
      preflight(user.id,EST.tick()*fields.reduce((n,f)=>n+Math.ceil(f.members.length/24),0));
      const pendingBiography=town.people.filter(p=>selected.has(p.id)&&p.biography_mode==='written_pending');
      if(!modelCall)for(let i=0;i<pendingBiography.length;i+=6){await authorBiographies(user,pendingBiography.slice(i,i+6));authored.push(...pendingBiography.slice(i,i+6));}
      const call=modelCall || (messages=>withPrincipal(user,()=>llmChat(messages,{maxTokens:10000,reasoningEffort:'low',temperature:.7,signal})));
      for(const field of fields)for(let offset=0;offset<field.members.length;offset+=24){
        if(signal?.aborted)throw new Error('Tick cancelled before commit.');onProgress({phase:'storyteller',field:field.id,processed:calls*24,eligible:selected.size});
        const ids=field.members.slice(offset,offset+24),owned=new Set(ids),allRelevant=events.filter(e=>[...e.participants,...e.witnesses || []].some(id=>owned.has(id))),contextEvents=new Map();for(const id of ids){const personal=allRelevant.filter(e=>e.participants.includes(id)||e.witnesses?.includes(id));for(const e of personal.slice(-12).concat(personal.filter(e=>e.type==='social')))contextEvents.set(e.id,e);}const relevant=[...contextEvents.values()].sort((a,b)=>a.end-b.end),cohort=ids.map(id=>{
          const p=town.byId.get(id);return {id,name:p.name,age:p.age,biography:p.biography.slice(0,1800),profile:{job:p.profile.job,family:p.profile.family,interests:p.profile.interests,home:p.profile.home,workplace_id:p.profile.workplace_id},...personalSocialContext(p,town),...mindContext(p),action:p.state.action,location:p.state.location_id,route:p.state.route,ownThought:p.state.thought,
            memory:recall(id,(town.places.get(p.state.location_id)?.purpose || '')+' '+p.profile.interests.join(' '))};});
        const result=await call([{role:'system',content:`You are the Living World Storyteller. German family-friendly life simulation. There is no player/NPC distinction. All selected Sims receive equal causal care. Return strict valid JSON only, with escaped line breaks. Story at most 300 words, each thought at most 50 words. Return JSON {story:string,thoughts:[{simId,eventId,text,confidence}],reflections:[{simId,eventId,emotions:[{id,intensity}],needsDelta,focusGoalId,reason}],revisions:[{eventId,category}],intentions:[{simId,kind,destinationId,reason}],narration:[{speaker,locationId,eventId,text,mode,emotion}]}. Narration contains short scene lines: speaker is an owned Sim ID or narrator, locationId and eventId reference a supplied actual event at that place, mode is speech or thought. Use dialogue where a supported encounter occurs; avoid inventing new physical actions. The procedural events are provisional but physically constrained. Social revisions may choose a different supported category at the SAME place/time with the SAME participants; consent is checked by the coordinator. Intentions influence FUTURE actions only; respect school and work commitments rather than sending pupils home for leisure during class: kind is one of ${kinds(catalog).join(',')}, destinationId is a supplied place ID. Do not teleport, change ages/family/resources, invent witnessed events or give one Sim another's private knowledge. Thoughts must reference events that this Sim participated in or witnessed. Separate uncertain beliefs from fact. Respect declined contact; adult romance only for consenting unrelated adults. Use the supplied neighborhood character, each Sim's own wishes and known relationship background to ground emotional stakes. Relationship backgrounds are initialized or supplemental backstories, never newly witnessed events. Do not treat a Sim's private motive as knowledge held by their conversation partner. Show emotional intelligence, grounded small surprises, mutual help, hobbies and goals. Avoid generic repetitive scenes. Every owned Sim should have a contextual thought. Other batches share the same field but you may only write owned Sims. Missing details remain unmodeled, not retroactively invented. ${REFLECTION_INSTRUCTIONS}`},{role:'user',content:j({start:town.world.seconds,end,intervention:intervention?{kind:intervention.kind,text:intervention.text.slice(0,2000),targetId:interventionSim?.id}:null,startTime:iso(town.world.seconds),endTime:iso(end),owned:ids,field:{id:field.id,totalMembers:field.members.length,reasons:Object.fromEntries(ids.map(id=>[id,field.reasons[id]]))},sims:cohort,eventCoverage:{committedAfterValidation:allRelevant.length,provided:relevant.length,policy:'recent personal events plus all actual contacts; omitted details remain in each personal journal'},events:relevant.map(({journal,socialPair,socialResult,...e})=>e),places:[...new Set(cohort.flatMap(p=>[p.location,p.profile.home?.living,p.profile.home?.kitchen,p.profile.home?.bath,p.profile.home?.bed,p.profile.workplace_id]).filter(Boolean))].map(id=>({id,name:town.places.get(id)?.name,actions:availableActions(town.places.get(id),catalog,town.byId.get(ids[0]))})),socialCategories:Object.keys(catalog.social)})}]);
        calls++;if(!modelCall)debitCall(user.id,result,'living_storyteller',{worldId});
        const output=parseModel(result.content);if(typeof output.story==='string')stories.push(output.story.slice(0,12000));
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
        for(const revision of output.revisions || []){const e=events.find(e=>e.id===revision.eventId);if(!e?.socialPair||!owned.has(e.participants[0])||!catalog.social[revision.category]){rejections.push('Invalid social rewrite');continue;}
          const results=await openSims('social',{now:e.end,pairs:[{...e.socialPair,category:revision.category,outcome:e.facts.outcome}]});if(!results[0].allowed){rejections.push('Social rewrite violates relationship constraints');continue;}e.facts.category=results[0].category;e.facts.outcome=results[0].outcome;e.socialResult=results[0];e.description=conversationDescription(town.byId.get(e.participants[0]),town.byId.get(e.participants[1]),e.facts.category,e.facts.outcome,!!e.facts.remote);e.source='storyteller_revised';
        }
        for(const intention of output.intentions || []){const p=town.byId.get(intention.simId);if(!owned.has(intention.simId)||!kinds(catalog).includes(intention.kind)||!town.places.has(intention.destinationId)||!availableActions(town.places.get(intention.destinationId),catalog,p).includes(intention.kind)||!findRoute(town,p.state.location_id || p.state.route?.destination,intention.destinationId)){rejections.push('Invalid or unreachable intention');continue;}p.state.goal={kind:intention.kind,destination:intention.destinationId,reason:String(intention.reason || '').slice(0,500),expires:end+3600,source:'storyteller'};}
      }
    }
    // Apply each social event once, in causal order, after all model rewrites are validated.
    const workEvents=events.filter(e=>e.type==='action_completed'&&e.facts.action==='work');
    if(workEvents.length){const updates=await openSims('careers',{people:workEvents.map(e=>({...actor(town.byId.get(e.participants[0])),duration:catalog.actions.work.duration,now:e.end,eventId:e.id}))});for(let i=0;i<updates.length;i++){const p=town.byId.get(workEvents[i].participants[0]);p.state.career=updates[i].career;p.state.skills=updates[i].skills;}}
    const socialEvents=events.filter(e=>e.socialResult);
    // Replay the final validated encounters from the original relations exactly once.
    for(const p of town.people)p.relations=initialRelations.get(p.id);
    for(const e of socialEvents)if(e.facts.outcome==='accepted')for(const id of e.participants)town.byId.get(id).state.needs.social=clamp(town.byId.get(id).state.needs.social-.18);
    if(socialEvents.length){const ids=[...new Set(socialEvents.flatMap(e=>e.participants))],changes=await openSims('replay_social',{now:end,people:ids.map(id=>actor(town.byId.get(id))),events:socialEvents.map(e=>({id:e.id,participants:e.participants,category:e.facts.category,outcome:e.facts.outcome,time:e.end}))});for(const [id,change] of Object.entries(changes)){const p=town.byId.get(id);p.relations=change.relations;p.state.psychology=change.psychology;p.state.affect=change.affect;}}
    for(const e of socialEvents)for(const id of e.participants)completedSocial(town.byId.get(id),e,e.end);
    for(const [id,value] of toneReflections)if(!reflections.has(id))reflections.set(id,value);
    for(const [id,{proposal,event:e}] of reflections){const effects=reflect(town.byId.get(id),proposal,e,end);(e.facts.mentalEffects||={})[id]=effects;}
    for(const p of town.people)evaluateMind(p,end,catalog);
    for(const e of events){
      for(const id of e.participants){const p=town.byId.get(id),thought=modelJournal.get(id+':'+e.id);e.journal.push({simId:id,channel:e.facts.remote?'telephone':'direct',perception:e.description,interpretation:thought?.text || interpretation(p,e),confidence:thought?.confidence ?? .65});}
      if(!e.facts.private)for(const id of e.witnesses || []){const thought=modelJournal.get(id+':'+e.id);e.journal.push({simId:id,channel:'nearby_observation',perception:e.description,interpretation:thought?.text || 'Ich habe diesen Austausch in meiner Nähe mitbekommen. Die privaten Absichten kenne ich nicht.',confidence:thought?.confidence ?? .5});}
    }
    const beatId=uid('lb_'),metrics={population:town.people.length,events:events.length,journalEntries:events.reduce((n,e)=>n+e.journal.length,0),eligible:selected.size,fields:fields.length,modelCalls:calls,cpuMs:Math.round(cpuMs),totalMs:Math.round(performance.now()-started),rejections};
    db.transaction(()=>{
      if(signal?.aborted)throw new Error('Tick cancelled before commit.');
      if(db.prepare('SELECT version FROM lw_worlds WHERE world_id=?').get(worldId).version!==before)throw Object.assign(new Error('Stale proposal rejected.'),{statusCode:409});
      const changes=[];
      for(const p of town.people){changes.push({id:p.id,patches:stateDiff(initialStates.get(p.id),p.state)});db.prepare('UPDATE lw_sims SET state=?,location_id=?,biography=?,biography_mode=? WHERE id=?').run(j(p.state),p.state.location_id,p.biography,p.biography_mode,p.id);for(const [other,relation] of Object.entries(p.relations))db.prepare('INSERT INTO lw_relations VALUES (?,?,?,?) ON CONFLICT(world_id,from_id,to_id) DO UPDATE SET payload=excluded.payload').run(worldId,p.id,other,j(relation));}
      db.prepare('INSERT INTO lw_beats VALUES (?,?,?,?,?,?,?,?,?,?)').run(beatId,worldId,before+1,town.world.seconds,end,story?'hybrid':'procedural_test',j(fields),j(stories),j(changes),j(metrics));
      for(const e of events)insertEvent({...e,beat_id:beatId},e.journal);
      for(const line of sceneLines)db.prepare('INSERT INTO lw_scene_lines VALUES (?,?,?,?,?,?,?,?)').run(worldId,beatId,line.event_id,line.location_id,line.speaker,line.text,line.mode,line.emotion);
      for(const p of authored)recordBiography(worldId,p,end,beatId);
      db.prepare('UPDATE lw_worlds SET version=?,seconds=? WHERE world_id=?').run(before+1,end,worldId);
      db.prepare('UPDATE worlds SET sim_time=?,tick_index=?,updated_at=? WHERE id=?').run(iso(end),before+1,now(),worldId);
    })();
    return {version:before+1,simTime:iso(end),metrics,story:stories,fields};
  }finally{busy.delete(worldId);}
}
function stateDiff(before,after,path='') {
  if(j(before)===j(after))return [];
  if(before&&after&&typeof before==='object'&&typeof after==='object')return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(key=>stateDiff(before[key],after[key],path+'/'+key));
  return [{path,before:before??null,after:after??null}];
}

export function recordBiography(worldId,p,time,beatId=null){insertEvent({id:uid('le_'),world_id:worldId,beat_id:beatId,start:time,end:time,type:'initialization_authored_background',location_id:p.state.location_id,participants:[p.id],facts:{coverage:'authored_background',doesNotRewriteWitnessedEvents:true},description:p.biography,source:'authored_initialization'},[{simId:p.id,channel:'initialization',perception:p.biography,interpretation:'Mein Ausgangshintergrund wurde ausgearbeitet. Bereits erlebte Ereignisse bleiben erhalten.',confidence:1}]);}
