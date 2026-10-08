import {socialImpact} from './social-effects.js';
// PERMA-inspired fictional wellbeing, NOT the validated PERMA-Profiler.
// Scores never authorize actions/consent and are not money, morality or diagnosis.
// Every experience contribution belongs to this Sim and references a real event.
export const WELLBEING_VERSION=1;
export const PERMA_KEYS=['P','E','R','M','A'];
export const PERMA_LABELS={P:'Positive Gefühle',E:'Engagement',R:'Beziehungen',M:'Sinn & Zugehörigkeit',A:'Erlebtes Gelingen'};
const clamp=n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:.5));
const halfDays={P:2,E:5,R:14,M:21,A:10};
const positive=new Set(['contentment','affection','hope_enthusiasm_optimism','pride','interest','relief']);
const distress=new Set(['fear','distress','sadness','anger','disappointment','embarrassment']);
// Parsed snapshots are normalized once; repeated minute projections reuse a
// bounded per-day cache. Weak collections never become durable game state.
const validated=new WeakSet(),dayCache=new WeakMap();
function zeroDay(){return Object.fromEntries(PERMA_KEYS.map(k=>[k,{plus:0,minus:0,plusRaw:0,minusRaw:0}]));}
function addDay(day,e){for(const k of PERMA_KEYS){const raw=Number(e.delta[k])||0,value=raw*Math.pow(.5,-(e.at-Math.floor(e.at/86400)*86400)/(86400*halfDays[k])),side=value>=0?'plus':'minus';day[k][side]+=value;day[k][side+'Raw']+=Math.abs(raw);}}
function archive(w,e){const day=String(Math.floor(e.at/86400)),group=e.erasableGroup||'experience';w.historyDays||={};w.historyDays[day]||={};const target=w.historyDays[day][group]||={values:zeroDay(),sources:[],count:0};addDay(target.values,e);target.sources=target.sources.concat(e.eventId).slice(-3);target.count++;}

export function ensureWellbeing(p,time){
 let w=p.state.wellbeing;
 if(w?.version!==WELLBEING_VERSION){
   const own=Object.values(p.relations||{}).slice(0,24),trust=own.length?own.reduce((s,r)=>s+(r.trust??.5),0)/own.length:.5;
   w=p.state.wellbeing={version:WELLBEING_VERSION,baseline:{P:.5,E:.5,R:clamp(.5+(trust-.5)*.12),M:.5,A:.5},scores:{},initialized_at:time,updated_at:time,origin:'current_state_initialization',evidence:[]};
 }
 // Bound imported/legacy fields as well as ordinary generated state.
 if(!validated.has(w)){
  w.baseline=Object.fromEntries(PERMA_KEYS.map(k=>[k,clamp(w.baseline?.[k]??.5)]));
  w.evidence=(Array.isArray(w.evidence)?w.evidence:[]).filter(e=>e&&typeof e.eventId==='string'&&Number.isFinite(e.at)&&e.delta&&typeof e.delta==='object').slice(-128);
  for(const e of w.evidence)e.delta=Object.fromEntries(PERMA_KEYS.map(k=>[k,Math.max(-.04,Math.min(.04,Number.isFinite(e.delta[k])?e.delta[k]:0))]));
  w.historyDays||={};for(const [day,groups] of Object.entries(w.historyDays)){if(!/^-?\d+$/.test(day)){delete w.historyDays[day];continue;}for(const group of Object.values(groups)){group.values=Object.fromEntries(PERMA_KEYS.map(k=>[k,Object.fromEntries(['plus','minus','plusRaw','minusRaw'].map(f=>[f,Math.max(f==='minus'?-100:0,Math.min(100,Number(group.values?.[k]?.[f])||0))]))]));group.sources=(group.sources||[]).filter(x=>typeof x==='string').slice(-3);}}
  validated.add(w);
 }
 return w;
}
export function projectWellbeing(p,time){
 const w=ensureWellbeing(p,time);let cached=dayCache.get(w.evidence);
 if(!cached||cached.latest>time){
  const byDay=new Map();let latest=-Infinity;
  for(const [key,groups] of Object.entries(w.historyDays||{})){const day=Number(key);if(day>Math.floor(time/86400))continue;const values=zeroDay();for(const group of Object.values(groups))for(const k of PERMA_KEYS)for(const f of ['plus','minus','plusRaw','minusRaw'])values[k][f]+=group.values[k][f];byDay.set(day,values);}
  for(const e of w.evidence){if(e.at>time)continue;latest=Math.max(latest,e.at);const day=Math.floor(e.at/86400);if(!byDay.has(day))byDay.set(day,Object.fromEntries(PERMA_KEYS.map(k=>[k,{plus:0,minus:0,plusRaw:0,minusRaw:0}])));
   for(const k of PERMA_KEYS){const value=e.delta[k]*Math.pow(.5,-(e.at-day*86400)/(86400*halfDays[k])),side=value>=0?'plus':'minus';byDay.get(day)[k][side]+=value;byDay.get(day)[k][side+'Raw']+=Math.abs(e.delta[k]);}
  }
  cached={byDay,latest};if(w.evidence.every(e=>e.at<=time))dayCache.set(w.evidence,cached);
 }
 const scores={...w.baseline};for(const [at,day] of cached.byDay)for(const k of PERMA_KEYS){const decay=Math.pow(.5,(time-at*86400)/(86400*halfDays[k]));scores[k]+=decay*((day[k].plusRaw?Math.min(.08,day[k].plusRaw)*day[k].plus/day[k].plusRaw:0)+(day[k].minusRaw?Math.min(.10,day[k].minusRaw)*day[k].minus/day[k].minusRaw:0));}
 // Experiences saturate instead of repeated routine chores inevitably filling
 // every pillar to 100. This preserves individual baselines and room for setbacks.
 if(p.state.life)for(const k of PERMA_KEYS){const change=scores[k]-w.baseline[k],linear=change>=0?.08:.10,tail=change>=0?.12:.20,absolute=Math.abs(change);scores[k]=w.baseline[k]+Math.sign(change)*(absolute<=linear?absolute:linear+tail*Math.tanh((absolute-linear)/tail));}
 // Short-term affect belongs in P, not a global overwrite of all five pillars.
 const feelings=p.state.affect?.states||[],joy=Math.max(0,...feelings.filter(e=>positive.has(e.id)).map(e=>clamp(Number(e.intensity)||0))),strain=Math.max(0,...feelings.filter(e=>distress.has(e.id)).map(e=>clamp(Number(e.intensity)||0)));
 const needs=p.state.needs||{},bodily=Math.max(...['hunger','thirst','bladder','fatigue','hygiene','comfort'].map(k=>Number(needs[k])||0));scores.P+=joy*.04-strain*.06-Math.max(0,bodily-.55)*.08;
 w.scores=Object.fromEntries(PERMA_KEYS.map(k=>[k,clamp(scores[k])]));w.summary=PERMA_KEYS.reduce((s,k)=>s+w.scores[k],0)/5;w.updated_at=time;return w;
}
export function recordExperience(p,event,time,channel,delta,reason){
 const w=ensureWellbeing(p,time);if(!event?.id||w.evidence.some(e=>e.eventId===event.id&&e.channel===channel))return null;
 const changes=Object.fromEntries(PERMA_KEYS.map(k=>[k,Math.max(-.04,Math.min(.04,delta[k]||0))]));
 if(!Object.values(changes).some(Boolean))return null;
 w.evidence.push({eventId:event.id,at:time,channel,...(event.conversationChannel?{erasableGroup:'conversation_'+event.conversationChannel}:{}),delta:changes,reason:(String(event.description||'').slice(0,90)+(event.description?' — ':'')+reason).slice(0,220)});while(w.evidence.length>128)archive(w,w.evidence.shift());for(const day of Object.keys(w.historyDays||{}))if(+day<Math.floor(time/86400)-365)delete w.historyDays[day];w.evidence=w.evidence.slice();projectWellbeing(p,time);return changes;
}
export function activityWellbeing(p,event,duration,goalGain,time){
 const kind=event.facts.action,scale=Math.min(2,Math.max(0,duration)/1800),interests=p.profile?.interests||[];
 const liked=interests.some(i=>({reading:/read/,craft:/creative|craft|paint/,gardening:/garden/,music:/instrument|music/,walking:/stroll|walk|hike/,cooking:/cook|bake/,socializing:/community|board_games|friends/}[i]||/$a/).test(kind));
 const active=!['wait','sleep','toilet','shower','eat','drink','relax'].includes(kind),learning=['school_day','kindergarten_day','read','creative_hobby'].includes(kind),gain=Math.max(0,Number(goalGain)||0);
 return recordExperience(p,event,time,'activity',{P:liked?.004*scale:0,E:active?.008*scale*(liked?1.4:1):0,M:gain>0?.004*scale:0,A:gain>0?Math.min(.02,.003+gain*.8):learning?.003*scale:0},liked?'Eine tatsächlich ausgeübte passende Tätigkeit verbindet Interesse und Engagement.':gain>0?'Ein tatsächlicher eigener Zielschritt stärkt Sinn und erlebtes Gelingen.':'Eine tatsächlich ausgeübte Tätigkeit bietet Engagement; sie behauptet keinen erfundenen Erfolg.');
}
export function socialWellbeing(p,event,time){
 const category=event.facts.category,impact=socialImpact(event,p.id),accepted=event.facts.outcome==='accepted',hostile=['conflict','hurt'].includes(impact.quality),care=['offer_help','comfort','check_in','reconcile','apologize'].includes(category);
 return recordExperience(p,event,time,'social',!accepted?(event.participants?.[0]===p.id?{P:-.003}:{}):hostile?{P:-.009,R:-.012}:impact.quality==='mixed'?{E:.002}:{P:.006,R:category==='greet'?.003:.012,M:care?.007:0,E:['play_together','share_interest','collaborate_project'].includes(category)?.008:0},!accepted?'Eine abgelehnte Begegnung kann enttäuschen; sie beweist keine schlechte Beziehung.':hostile?'Ein selbst erlebter konflikthafter Austausch belastet Gefühle und Beziehungserleben.':care?'Eine tatsächlich erlebte zugewandte Begegnung stärkt Verbundenheit und das Gefühl, füreinander da zu sein.':'Ein tatsächlich erlebter freiwilliger Kontakt stärkt Beziehungserleben.');
}
export function reflectionWellbeing(p,effects,event,time){
 const feelings=effects.emotions||[],value=feelings.reduce((n,e)=>n+(positive.has(e.id)?1:distress.has(e.id)?-1:0)*e.intensity,0)/Math.max(1,feelings.length);
 // A subjective response can affect P; it cannot invent mastery, meaning,
 // friendships, wealth or accomplishments simply by supplying model numbers.
 return recordExperience(p,event,time,'reflection',{P:value*.012},'Die eigene begrenzte emotionale Deutung eines wirklichen Ereignisses beeinflusst positive Gefühle.');
}
export function removeWellbeingSources(p,ids,time,{conversationChannel}={}){const w=ensureWellbeing(p,time);w.evidence=w.evidence.filter(e=>!ids.has(e.eventId));if(conversationChannel)for(const groups of Object.values(w.historyDays||{}))delete groups['conversation_'+conversationChannel];return projectWellbeing(p,time);}
export function wellbeingContext(p){const w=p.state.wellbeing;return w?{scores:w.scores,summary:w.summary,interpretation:'PERMA-inspired game heuristic, not a diagnosis; higher means better supported wellbeing',recentOwnSources:w.evidence.slice(-5).map(({eventId,channel,reason})=>({eventId,channel,reason}))}:null;}
