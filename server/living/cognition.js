import {socialImpact} from './social-effects.js';
import {economicContext} from './expanded/economy.js';
import {socialMindContext} from './expanded/tom.js';
import {projectWellbeing,activityWellbeing,socialWellbeing,reflectionWellbeing,wellbeingContext} from './wellbeing.js';
import fs from 'node:fs';
import {rng} from './random.js';
import {activity} from './presentation.js';
import {normalizeRomance,ROMANCE_POLICY,romanticCap,romanticContext} from './romance.js';
export const LIFE_VERSION=1;
const taxonomy=JSON.parse(fs.readFileSync(new URL('../../vendor/open-sims/living_world/data/emotion_taxonomy.json',import.meta.url)));
const labels=new Map(taxonomy.emotions.map(e=>[e.id,e]));
const forbidden=new Set(['intoxication_altered_states_of_consciousness','pleasure_ecstasy','malevolence_malice']);
const clamp=n=>Math.max(0,Math.min(1,n));
const hobbyActions={reading:['read','leisure_read_for_fun'],cooking:['leisure_cook_for_fun','leisure_bake_treats'],walking:['stroll','leisure_go_for_walk','leisure_hike'],craft:['creative_hobby','leisure_craft_project','leisure_paint'],gardening:['garden','leisure_garden'],socializing:['community_meet','leisure_make_friends','leisure_board_games'],music:['leisure_play_instrument','leisure_see_live_music']};
const titles={create:'Create something of my own',mastery:'Build skills through regular practice',community:'Nurture neighborhood connections',care:'Be there for the people I care about',stability:'Build a dependable daily life',career:'Grow in my work',learning:'Learn and build friendships',hobby:'Make time for my interests'};
export function prepareMind(p,time,{seed=73,newLife=false}={}){
  normalizeRomance(p,{seed});
  const s=p.state,psych=s.psychology;psych.ambitions||=[];
  for(const a of psych.ambitions){
    a.title_de ||= p.age<3?'Feel secure and explore through play':titles[a.kind]||a.title;
    a.progress=clamp(Number(a.progress)||0);a.target_seconds ||= 40*3600;
    if(newLife&&p.age>=6&&a.progress===0){a.progress=Number((.05+rng(seed+':goal:'+p.seed_key+':'+a.id)()*.25).toFixed(3));a.initial_progress=a.progress;a.progress_source='initialized_background';}
    a.practice_seconds ||= 0;
  }
  if(!psych.ambitions.length)psych.ambitions.push({id:'ambition_primary',kind:p.age<18?'learning':'stability',title_de:titles[p.age<18?'learning':'stability'],progress:0,target_seconds:40*3600,practice_seconds:0});
  dailyGoals(p,time);s.cognition_version=LIFE_VERSION;
}
export function dailyGoals(p,time){
  const day=Math.floor(time/86400),s=p.state;if(s.daily_goals?.day===day)return s.daily_goals.items;
  const interest=p.profile.interests?.[0]||'reading';
  s.daily_goals={day,items:[
    {id:'daily_care',kind:'selfcare',title:p.age<3?'Be cared for and find rest':'Take good care of myself today',target:2,value:0,unit:'actions'},
    {id:'daily_practice',kind:p.age<3?'explore':p.age<18?'learning':p.profile.job==='Retired'?'hobby':'career',title:p.age<3?'Explore while feeling safe':p.age<18?'Learn something today':p.profile.job==='Retired'?'Spend time on an interest':'Make progress on a task at work',target:15*60,value:0,unit:'seconds',interest},
    {id:'daily_connection',kind:'connection',title:p.age<3?'Feel close to my caregivers':'Share a good moment with someone',target:1,value:0,unit:'encounters'}
  ]};return s.daily_goals.items;
}
export function rebuildAffect(p,time){
  const states=(p.state.affect?.states||[]).map(e=>({...e,components:(e.components||[]).filter(c=>c.expires_at>time&&(c.intensity>0||Number.isFinite(c.adjustment)&&c.adjustment!==0))})).filter(e=>e.components.length);
  for(const e of states){
    const bodily=e.components.filter(c=>c.source==='need'),personal=e.components.filter(c=>c.source!=='need'&&!Number.isFinite(c.adjustment));
    // Reassurance changes the present response, not the facts that caused it.
    // A separate signed, journal-linked component can be removed on clear and
    // expires naturally. Words cannot suppress distress from unmet bodily needs.
    const adjustment=e.components.reduce((n,c)=>n+(Number.isFinite(c.adjustment)?c.adjustment:0),0);
    e.intensity=Math.max(0,...bodily.map(c=>c.intensity),clamp(Math.max(0,...personal.map(c=>c.intensity))+adjustment));e.causes=e.components.map(c=>c.cause);e.expires_at=Math.max(...e.components.map(c=>c.expires_at));
  }
  states.sort((a,b)=>b.intensity-a.intensity);
  p.state.affect={schema_version:2,taxonomy_id:taxonomy.taxonomy_id,states,primary:states.find(e=>e.intensity>0)?.id||null,updated_at:time};
  p.state.mood=states.find(e=>e.intensity>0)?.label||'calm';
}
function conversationFeeling(p,id,target,time,cause){
  const existing=p.state.affect?.states?.find(e=>e.id===id);
  if(!existing)return addFeeling(p,id,target,time,cause,{ttl:900});
  if(!labels.has(id)||forbidden.has(id)||id==='sexual_lust'&&(p.age<18||(p.state.needs.romantic_affection||0)<ROMANCE_POLICY.romantic_need.adult_desire_threshold)||p.age<14&&id==='infatuation')return false;
  const delta=Math.max(-.35,Math.min(.35,target-existing.intensity));if(Math.abs(delta)<.0001)return true;
  existing.components.push({key:'event:'+cause.evidence_id+':regulation:'+id,source:'event',adjustment:delta,activated_at:time,expires_at:time+900,cause:{...cause,at:time}});
  // Retain original evidence while bounding conversational modifiers separately.
  existing.components=existing.components.filter(c=>!Number.isFinite(c.adjustment)).concat(existing.components.filter(c=>Number.isFinite(c.adjustment)).slice(-12));
  rebuildAffect(p,time);return true;
}
export function goalMotivation(p,id,time=p.state.affect?.updated_at||0){
  return clamp(.5+(p.state.goal_motivation||[]).filter(e=>e.goalId===id&&e.at<=time&&e.expires_at>time).reduce((n,e)=>n+e.delta*(e.expires_at-time)/(e.expires_at-e.at),0));
}
export function projectGoalMotivation(p,time){for(const a of p.state.psychology?.ambitions||[]){if(p.state.goal_motivation)a.motivation=goalMotivation(p,a.id,time);else delete a.motivation;}}
export function addFeeling(p,id,intensity,time,cause,{ttl=900,key}={}){
  if(!labels.has(id)||forbidden.has(id)||id==='sexual_lust'&&(p.age<18||(p.state.needs.romantic_affection||0)<ROMANCE_POLICY.romantic_need.adult_desire_threshold)||p.age<14&&id==='infatuation'||!Number.isFinite(intensity)||intensity<=0)return false;
  if(p.age<18&&id==='infatuation')intensity=Math.min(ROMANCE_POLICY.romantic_need.teen_cap,intensity);
  const a=p.state.affect ||= {states:[]};a.states||=[];
  let e=a.states.find(e=>e.id===id);if(!e){const label=labels.get(id);e={id,label:label.label,label_de:label.label_de,components:[]};a.states.push(e);}
  const component={key:key||'event:'+cause.evidence_id+':'+id,source:cause.kind==='modeled_need'?'need':'event',intensity:clamp(intensity),activated_at:time,expires_at:time+ttl,cause:{...cause,at:time}};
  const components=(e.components||[]).filter(c=>c.key!==component.key&&c.expires_at>time).concat(component);e.components=components.filter(c=>!Number.isFinite(c.adjustment)).slice(-6).concat(components.filter(c=>Number.isFinite(c.adjustment)).slice(-12));rebuildAffect(p,time);return true;
}
export function evaluateMind(p,time,catalog){
  normalizeRomance(p);
  const s=p.state,n=s.needs;
  // Need/ongoing-activity components reflect NOW; completed encounters retain their own expiry.
  for(const e of s.affect?.states||[])e.components=(e.components||[]).filter(c=>c.source!=='need'&&!c.key?.startsWith('current:'));
  rebuildAffect(p,time);
  const bodily=[['bladder',.55],['hunger',.55],['thirst',.55],['hygiene',.65],['comfort',.65]];
  for(const [key,threshold] of bodily)if(n[key]>=threshold)addFeeling(p,'distress',.2+(n[key]-threshold)*1.3,time,{kind:'modeled_need',need:key,text:'A current unmet need: '+key,evidence_id:null},{key:'current:need:'+key,ttl:120});
  if(n.fatigue>.4)addFeeling(p,'fatigue_exhaustion',.16+(n.fatigue-.4)*1.3,time,{kind:'modeled_need',need:'fatigue',text:'The present situation is tiring.'},{key:'current:fatigue',ttl:120});
  if(n.social>.55)addFeeling(p,'longing',.18+(n.social-.55)*1.2,time,{kind:'modeled_need',need:'social',text:'Longs for social warmth.'},{key:'current:social',ttl:120});
  if(p.age>=14&&n.romantic_affection>(p.age<18?.2:.5))addFeeling(p,'longing',Math.min(p.age<18?.35:.65,n.romantic_affection*.6),time,{kind:'modeled_need',need:'romantic_affection',text:p.age<18?'Hopes for a kind conversation or innocent date with a peer close in age.':'Longs for freely chosen romantic closeness.'},{key:'current:romantic',ttl:120});
  if(p.age>=18&&n.romantic_affection>=ROMANCE_POLICY.romantic_need.adult_desire_threshold)addFeeling(p,'sexual_lust',Math.min(.7,n.romantic_affection*.65),time,{kind:'modeled_need',need:'romantic_affection',text:'Adult desire; every approach requires freely given consent.'},{key:'current:adult-desire',ttl:120});
  if(n.fun>.65)addFeeling(p,'impatience_and_irritability',.16+(n.fun-.65)*.8,time,{kind:'modeled_need',need:'fun',text:'Needs a change of pace.'},{key:'current:fun',ttl:120});
  const kind=s.action?.kind,doing=activity(kind,catalog);
  if(kind&&!['wait','toilet','shower','sleep'].includes(kind))addFeeling(p,['work','school_day','kindergarten_day'].includes(kind)?'concentration':'interest',.22+Math.min(.18,(s.psychology.big_five.openness||.5)*.2),time,{kind:'ongoing_activity',text:doing,category:kind,evidence_id:s.action?.event_id||null},{key:'current:activity',ttl:120});
  if(Math.max(...Object.values(n))<.55)addFeeling(p,'contentment',.2+(1-Math.max(...Object.values(n)))*.15,time,{kind:'current_state',text:'Current needs are adequately met.'},{key:'current:contentment',ttl:120});
  if(!s.affect.states.length)addFeeling(p,'contemplation',.2,time,{kind:'current_state',text:s.route?'Finding my bearings on the way to my next activity.':'Considering my next step.'},{key:'current:contemplation',ttl:120});
  const urgent=Object.entries(n).sort((a,b)=>b[1]-a[1])[0],phrases={bladder:'I should find a bathroom soon.',hunger:'I feel hungry and would like something to eat.',thirst:'I need something to drink.',fatigue:'I feel tired and need rest.',social:'I want some social warmth and a familiar connection.',romantic_affection:'I long for mutual romantic closeness; the other person is free to choose.',fun:'I need a change of pace.',hygiene:'I would like to freshen up.',comfort:'I need a more comfortable break.'};
  s.current_desire=urgent?.[1]>.55?phrases[urgent[0]]:s.goal?.reason||p.profile.social?.wish||'I want to work on my next intention.';
  if(urgent?.[1]>.7)proceduralThought(p,s.current_desire,time);
  s.affect.actual_narrative=s.affect.states.map(e=>e.label+' '+Math.round(e.intensity*100)+'%').join(' · ');
  s.affect.self_narrative=s.current_desire;
  dailyGoals(p,time);projectGoalMotivation(p,time);projectWellbeing(p,time);
}
export function proceduralThought(p,text,time){
  const s=p.state;if(['conversation','storyteller'].includes(s.thought_source)&&time-(s.thought_at||0)<900)return;
  s.thought=text;s.thought_source='procedural';s.thought_at=time;
}
export function emotionalRate(p,need){
  const states=p.state.affect?.states||[],stress=Math.max(0,...states.filter(e=>['distress','fear','anger','disappointment'].includes(e.id)).map(e=>e.intensity));
  return ['comfort','social','fatigue'].includes(need)?1+stress*.15:1;
}
function matchesAmbition(p,a,kind){
  if(a.kind==='career')return kind==='work'||kind==='leisure_expanded_holiday_work'||kind==='leisure_expanded_training';if(a.kind==='learning')return ['school_day','kindergarten_day','read','leisure_expanded_training','leisure_market_course','leisure_market_library'].includes(kind);
  if(a.kind==='hobby')return (hobbyActions[a.activity]||Object.values(hobbyActions).flat()).includes(kind);
  if(a.kind==='create')return /creative|craft|paint|write|instrument|cook|bake/.test(kind);
  if(a.kind==='mastery')return ['work','school_day','read','creative_hobby','leisure_expanded_training','leisure_expanded_obligation','leisure_market_course'].includes(kind);
  if(a.kind==='stability')return ['eat','drink','shower','sleep','relax'].includes(kind);
  return ['community_meet','leisure_volunteer','leisure_make_friends','leisure_board_games'].includes(kind);
}
export function motivationBias(p,kind){
  const goals=p.state.psychology.ambitions,focus=p.state.focus_goal_id;
  let bias=goals.some(a=>!a.completed&&matchesAmbition(p,a,kind))?.1:0;
  const motivated=goals.filter(a=>!a.completed&&matchesAmbition(p,a,kind));
  if(motivated.length)bias+=motivated.reduce((n,a)=>n+(goalMotivation(p,a.id)-.5)*.24,0)/motivated.length;
  if(goals.some(a=>a.id===focus&&matchesAmbition(p,a,kind)))bias+=.08;
  const stress=Math.max(0,...(p.state.affect?.states||[]).filter(e=>['distress','fatigue_exhaustion','anger'].includes(e.id)).map(e=>e.intensity));
  if(['relax','sleep','stroll','leisure_meditate'].includes(kind))bias+=stress*.12;
  return bias;
}
function advanceAmbition(p,a,amount,time,event){
  if(a.completed)return;const before=a.progress||0;a.practice_seconds=(a.practice_seconds||0)+amount;a.progress=clamp(before+amount/(a.target_seconds||144000));a.updated_at=time;a.last_evidence_id=event.id;
  if(a.progress>=1){a.completed=true;(event.facts.completedGoals||=[]).push({simId:p.id,id:a.id,title:a.title_de||a.title});event.description+=' '+p.name+' reaches a personal goal: '+(a.title_de||a.title)+'.';addFeeling(p,'pride',.65,time,{kind:'goal_completed',text:a.title_de||a.title,evidence_id:event.id});}
  else if(amount>0)addFeeling(p,'hope_enthusiasm_optimism',.28,time,{kind:'goal_progress',text:'A real step toward: '+(a.title_de||a.title),evidence_id:event.id});
}
export function completedActivity(p,event,duration,relief,time){
  const kind=event.facts.professionalWork?'work':event.facts.action,seconds=Math.max(0,Math.min(8*3600,duration)),beforeProgress=p.state.psychology.ambitions.reduce((n,a)=>n+(a.progress||0),0);
  for(const a of p.state.psychology.ambitions)if(matchesAmbition(p,a,kind))advanceAmbition(p,a,seconds,time,event);
  for(const g of dailyGoals(p,time)){
    const gain=g.kind==='selfcare'&&['eat','drink','shower','toilet','sleep'].includes(kind)?1:g.kind==='career'&&kind==='work'?seconds:g.kind==='learning'&&['school_day','kindergarten_day','read','leisure_expanded_training','leisure_market_course','leisure_market_library'].includes(kind)?seconds:g.kind==='hobby'&&(hobbyActions[g.interest]||[]).includes(kind)?seconds:g.kind==='explore'&&['relax','eat'].includes(kind)?seconds:0;
    const was=g.value;g.value=Math.min(g.target,g.value+gain);if(gain){g.last_evidence_id=event.id;if(was<g.target&&g.value>=g.target)addFeeling(p,'pride',.38,time,{kind:'daily_goal_completed',text:g.title,evidence_id:event.id});}
  }
  if(Math.max(0,...Object.values(relief))>.03)addFeeling(p,'relief',Math.min(.6,.25+Math.max(...Object.values(relief))*.3),time,{kind:'need_relief',text:'A real unmet need has eased after '+kind+'.',relief,evidence_id:event.id});
  event.facts.goalProgress=p.state.psychology.ambitions.filter(a=>a.last_evidence_id===event.id).map(a=>({id:a.id,progress:a.progress}));
  const perma=activityWellbeing(p,event,seconds,p.state.psychology.ambitions.reduce((n,a)=>n+(a.progress||0),0)-beforeProgress,time);if(perma)(event.facts.wellbeingEffects||={})[p.id]=perma;
}
export function completedSocial(p,event,time){
  const perma=socialWellbeing(p,event,time);if(perma)(event.facts.wellbeingEffects||={})[p.id]=perma;
  if(event.facts.outcome!=='accepted')return;
  normalizeRomance(p);
  const romantic=['flirt','ask_date','express_affection','teen_romantic_talk','teen_date','adult_private_intimacy'].includes(event.facts.category);
  if(romantic){p.state.needs.romantic_affection=Math.max(0,p.state.needs.romantic_affection-(event.facts.category==='adult_private_intimacy'?.18:.045));addFeeling(p,'infatuation',p.age<18?.25:.4,time,{kind:'social_complete',category:event.facts.category,evidence_id:event.id,text:event.description});}
  const impact=socialImpact(event,p.id),hostile=['conflict','hurt'].includes(impact.quality);
  const before=p.state.needs.social;p.state.needs.social=clamp(before-impact.warmth);
  (event.facts.socialWarmthEffects||={})[p.id]=p.state.needs.social-before;
  if(impact.quality==='warm'&&p.profile.family?.partner_id&&p.profile.family.partner_id===event.participants?.find(id=>id!==p.id))p.state.needs.romantic_affection=Math.max(0,p.state.needs.romantic_affection-.025);
  for(const a of p.state.psychology.ambitions)if(!hostile&&(a.kind==='community'||a.kind==='care'&&['check_in','offer_help','comfort','ask_help','ask_advice'].includes(event.facts.category)))advanceAmbition(p,a,300,time,event);
  const g=dailyGoals(p,time).find(g=>g.kind==='connection');if(!hostile){g.value=Math.min(g.target,g.value+1);g.last_evidence_id=event.id;}
  addFeeling(p,impact.feeling,.3,time,{kind:'social_complete',category:event.facts.category,outcome:'accepted',text:event.description,evidence_id:event.id});
}
export function romanticWitness(p,event,people,time){
  // Adult jealousy is a subjective response to an actually witnessed public
  // romantic exchange, never knowledge of another Sim's hidden intentions.
  if(p.age<18||event.facts.private||event.facts.outcome!=='accepted'||!event.witnesses?.includes(p.id)||!['flirt','ask_date','express_affection'].includes(event.facts.category))return null;
  const partner=p.profile.family?.partner_id;if(!partner||!event.participants.includes(partner)||event.participants.some(id=>people.get(id)?.age<18))return null;
  normalizeRomance(p);if(p.state.needs.romantic_affection<ROMANCE_POLICY.romantic_need.adult_desire_threshold)return null;
  const trust=p.relations[partner]?.trust||.35,intensity=Math.min(.55,.12+p.state.needs.romantic_affection*.25+(1-trust)*.12);
  const text='The exchange I saw left me uncertain. I long for romantic closeness, but I do not know their private intentions and would like to ask calmly.';
  addFeeling(p,'jealousy_envy',intensity,time,{kind:'witnessed_romantic_exchange',text,evidence_id:event.id},{ttl:900});return text;
}
export function reflect(p,proposal,event,time){
  normalizeRomance(p);
  const effects={emotions:[],needsDelta:{}};
  if(!proposal||typeof proposal!=='object')return effects;
  const seenEmotions=new Set();
  for(const e of Array.isArray(proposal.emotions)?proposal.emotions.slice(0,3):[]){if(seenEmotions.has(e?.id))continue;seenEmotions.add(e?.id);if(typeof e?.id!=='string'||typeof e.intensity!=='number'||!Number.isFinite(e.intensity))continue;
    const before=p.state.affect?.states?.find(s=>s.id===e.id)?.intensity||0;
    const intensity=Math.max(event.conversationChannel?0:.05,Math.min(p.age<18&&e.id==='infatuation'?.35:.75,e.intensity)),cause={kind:'subjective_reflection',text:String(proposal.reason||p.state.thought||'My own reaction to this event.').slice(0,240),evidence_id:event.id};
    if((event.conversationChannel?conversationFeeling:addFeeling)(p,e.id,intensity,time,cause,{ttl:900})){const after=p.state.affect.states.find(s=>s.id===e.id)?.intensity||0;effects.emotions.push({id:e.id,intensity:after,...(event.conversationChannel?{before,delta:after-before}:{})});}}
  for(const [need,value] of Object.entries(proposal.needsDelta||{})){if(!['social','romantic_affection','fun','comfort','fatigue'].includes(need)||typeof value!=='number'||!Number.isFinite(value))continue;
    const bound=need==='fatigue'?.03:.08,delta=Math.max(-bound,Math.min(bound,value)),before=p.state.needs[need];p.state.needs[need]=Math.min(need==='romantic_affection'?romanticCap(p.age):1,clamp(before+delta));effects.needsDelta[need]=p.state.needs[need]-before;}
  if(typeof proposal.focusGoalId==='string'&&p.state.psychology.ambitions.some(a=>a.id===proposal.focusGoalId&&!a.completed)){p.state.focus_goal_id=proposal.focusGoalId;effects.focusGoalId=proposal.focusGoalId;}
  if(event.conversationChannel){
    const seen=new Set();effects.goalMotivation=[];
    for(const entry of (Array.isArray(proposal.goalMotivation)?proposal.goalMotivation:[]).slice(0,3)){
      if(!entry||seen.has(entry.goalId)||!Number.isFinite(entry.delta)||!p.state.psychology.ambitions.some(a=>a.id===entry.goalId&&!a.completed))continue;
      seen.add(entry.goalId);const before=goalMotivation(p,entry.goalId,time),delta=Math.max(-.15,Math.min(.15,entry.delta));if(!delta)continue;
      p.state.goal_motivation=(p.state.goal_motivation||[]).filter(e=>e.expires_at>time).concat({goalId:entry.goalId,delta,at:time,expires_at:time+21600,eventId:event.id,reason:String(proposal.reason||'').slice(0,240)}).slice(-48);
      effects.goalMotivation.push({goalId:entry.goalId,before,after:goalMotivation(p,entry.goalId,time)});
    }
    projectGoalMotivation(p,time);
  }
  const perma=reflectionWellbeing(p,effects,event,time);if(perma)effects.wellbeingDelta=perma;projectWellbeing(p,time);
  return effects;
}
export function mindContext(p){return {lifeCircumstances:p.state.life,community:p.profile.community,initialBackground:p.state.initialSituation,publicManner:p.state.presentation?.until>p.state.affect?.updated_at?p.state.presentation:null,resources:economicContext(p),socialExpectations:socialMindContext(p),aptitudes:p.state.aptitudes,skills:p.state.skills,wellbeing:wellbeingContext(p),romancePolicy:romanticContext(p),emotions:p.state.affect,currentDesire:p.state.current_desire,goals:p.state.psychology.ambitions,dailyGoals:p.state.daily_goals,focusGoalId:p.state.focus_goal_id,needs:p.state.needs,thought:p.state.thought};}
export const REFLECTION_INSTRUCTIONS='Optional reflection/reflections may express a subjective response, never a new physical event. An entry has emotions:[{id,intensity}], needsDelta:{social,romantic_affection,fun,comfort,fatigue}, focusGoalId and reason. Use emotion IDs contentment, affection, hope_enthusiasm_optimism, pride, interest, concentration, contemplation, relief, longing, doubt, fear, distress, embarrassment, disappointment, sadness, anger or fatigue_exhaustion; intensity 0.05–0.75. All needs are urgency levels: 0 means satisfied and 1 means urgent. A positive needsDelta increases an unmet need; a negative delta provides relief. Social is social warmth; romantic_affection is a separate unmet wish for romantic affection. Romantic affection must stay 0 under 14 and <=0.35 for ages 14–17. A friendly conversation reduces warmth urgency and does not automatically satisfy romantic affection. A supportive conversation usually reduces social/comfort urgency; increasing it requires a grounded reason such as conflict or a renewed longing. Emotional needsDelta is bounded to ±0.08 (fatigue ±0.03). Never change hunger, thirst, bladder or hygiene through words. focusGoalId must be an existing supplied ambition; it directs future action and never grants completed achievement. Own PERMA wellbeing scores are read-only derived context; never return score changes or invent achievements to improve them. Keep needs, conflicting feelings, current desires and existing progress coherent; relief in one dimension need not erase another.';
export const CONVERSATION_REFLECTION_INSTRUCTIONS=`Every conversation response must include reflection:{emotions:[{id,intensity}],needsDelta:{social,romantic_affection,fun,comfort,fatigue},focusGoalId:string|null,goalMotivation:[{goalId,delta}],reason:string}. This is the playable consequence of the reply, not optional decorative text. Match the Sim's own response: a frightening disclosure can raise fear and comfort/warmth urgency; welcome reassurance can lower fear or distress, add relief or hope, and reduce those unmet needs. Consider personality, trust and current stress; words need not affect everyone equally. Return 1–3 relevant emotion IDs with their desired CURRENT intensities (0–0.75); include a lower target for an existing emotion when comfort actually eases it. A zero target means calming that feeling, not erasing the event that caused it. Do not leave all effects empty when the reply describes a meaningful emotional shift. Neutral factual exchanges may explicitly have no change. goalMotivation can encourage or discourage up to 3 supplied unfinished ambitions by -0.15 to +0.15; it changes willingness to pursue the goal, NEVER progress, practiced minutes, skill, wealth or achievement. Effects on motivation ease over six simulated hours. Only choose a focusGoalId already supplied; do not choose the same career goal automatically if a hobby or personal goal better fits. Include a concise reason linking the specific conversation to the actual reaction. `+REFLECTION_INSTRUCTIONS.replace('Optional reflection/reflections may','The required conversation reflection can').replace('intensity 0.05–0.75','intensity 0–0.75');
export function conversationReflection(output,currentState){
  const proposal=output.reflection&&typeof output.reflection==='object'&&!Array.isArray(output.reflection)?{...output.reflection}:{};
  const moods={hopeful:'hope_enthusiasm_optimism',optimistic:'hope_enthusiasm_optimism',happy:'contentment',calm:'contentment',sad:'sadness',worried:'distress',anxious:'fear',afraid:'fear',scared:'fear',frightened:'fear',terrified:'fear',uneasy:'fear',unsettled:'doubt',conflicted:'doubt',angry:'anger',friendly:'affection',warm:'affection',grateful:'gratitude',thoughtful:'contemplation',curious:'interest',tired:'fatigue_exhaustion',confident:'hope_enthusiasm_optimism',relieved:'relief',reassured:'relief',encouraged:'hope_enthusiasm_optimism',inspired:'hope_enthusiasm_optimism',discouraged:'disappointment',hurt:'sadness'};
  const emotionId=value=>{const key=String(value||'').trim().toLowerCase();return labels.has(key)?key:moods[key]||taxonomy.emotions.find(e=>e.label?.toLowerCase()===key||e.label_de?.toLowerCase()===key)?.id;};
  let emotions=(Array.isArray(proposal.emotions)?proposal.emotions:[]).filter(e=>e&&Number.isFinite(e.intensity)).map(e=>({...e,id:emotionId(e.id)})).filter(e=>e.id);
  const previous=id=>currentState?.affect?.states?.find(e=>e.id===id)?.intensity||0;
  if(!emotions.length&&(!Array.isArray(proposal.emotions)||proposal.emotions.length)){const id=emotionId(output.mood);if(id)emotions=[{id,intensity:Math.min(.75,Math.max(.35,previous(id)+.05))}];}
  // Older/provider responses may omit the structured need changes. Infer only
  // from the Sim's reported affect, never from keywords in the player's message.
  if(!proposal.needsDelta){
    const direction=e=>(e.intensity-previous(e.id))*(['affection','relief','hope_enthusiasm_optimism','contentment','gratitude'].includes(e.id)?1:['fear','distress','sadness','anger'].includes(e.id)?-1:0);
    const good=emotions.some(e=>direction(e)>.01),bad=emotions.some(e=>direction(e)<-.01);
    proposal.needsDelta=good&&!bad?{social:-.04,comfort:-.04}:bad&&!good?{social:.03,comfort:.04}:{};
  }
  return {...proposal,emotions,reason:String(proposal.reason||output.thought||output.reply||'').slice(0,500)};
}
