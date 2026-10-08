// Transparent game heuristics inspired by personality, shared-goal and
// capitalization research. These probabilities are not clinical estimates.
import {rng} from './random.js';
import {reputationFor} from './expanded/community.js';
import {addFeeling} from './cognition.js';
import {recordExperience} from './wellbeing.js';
import {socialAttributes} from './social-attributes.js';
import {socialImpact} from './social-effects.js';
const clamp=n=>Math.max(0,Math.min(1,n));
export function preparePartnerPreferences(p,town){
 if(p.age<18||p.profile.romanticPreferences)return;
 const partner=town.byId.get(p.profile.family?.partner_id),draw=rng(town.world.seed+':partner-preference:'+p.profile.seed_key)();
 // Existing partnerships take precedence. Never rewrite a marriage or identity
 // to achieve a population ratio; new singles receive a stable individual draw.
 p.profile.romanticPreferences={genders:partner?[partner.gender]:draw<.9?[p.gender==='female'?'male':'female']:draw<.97?[p.gender]:['female','male'],source:partner?'consistent_with_existing_partnership':'initialized_individual_preference'};
}
export function prepareSocialDynamics(p,seed){
 const s=p.state;if(s.socialDynamics?.version===1)return s.socialDynamics;
 const r=rng(seed+':social-dynamics:'+p.profile.seed_key),b=s.psychology.big_five||{};
 // Fictional, overlapping preference distributions, not fixed biological laws.
 // Individuals vary much more than these small gender-associated offsets.
 const raw={appearance:.55+r()*.9+(p.gender==='male'?.2:0),warmth:.3+r(),reliability:.3+r(),competence:.15+r()*.7,status:.35+r()*.8+(p.gender==='female'?.2:0),sharedInterests:.2+r()*.8},sum=Object.values(raw).reduce((a,b)=>a+b,0);
 return s.socialDynamics={version:1,ambition:s.psychology.social_style?.drive??(.2+r()*.75),prosociality:clamp((b.agreeableness??.5)*.65+r()*.35),communicationPractice:0,appearance:p.age>=18?.2+r()*.75:null,preferences:p.age>=18?Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,v/sum])):null,knownGoals:{},responses:[],recentCollaborations:[]};
}
export function sharedGoals(a,b){
 if(!a.relations?.[b.id])return [];
 const result=[];for(const hobby of a.profile.interests||[])if(b.profile.interests?.includes(hobby))result.push({id:'hobby:'+hobby,kind:'hobby',title:'Make time for '+hobby,evidence:'shared background interests',activity:({reading:'read',gardening:'garden',craft:'creative_hobby',walking:'stroll',music:'creative_hobby'})[hobby]||'relax'});
 if(a.profile.workplace_id&&a.profile.workplace_id===b.profile.workplace_id)result.push({id:'work:'+a.profile.workplace_id,kind:'work',title:a.age<18&&b.age<18?'Learn and support each other at school':'Contribute at the same workplace or college',evidence:'current shared place of work or education',activity:a.age<18?'school_day':'work'});
 const af=a.profile.family||{},bf=b.profile.family||{};
 if(a.household_id===b.household_id)result.push({id:'home:'+a.household_id,kind:'family',title:'Care for our shared home and family',evidence:'shared household responsibilities',activity:'relax'});
 if(af.parent_ids?.includes(b.id)||bf.parent_ids?.includes(a.id))result.push({id:'care:'+ [a.id,b.id].sort().join(':'),kind:'family',title:'Support learning, growing independence and family care',evidence:'documented parent–child relationship',activity:'read'});
 return result.slice(0,6);
}
export function adultAttraction(a,b,economy=null){
 // Adult attraction is separate from consent and from friendship. Never score a
 // minor's sexual desirability, including when paired with an adult.
 if(a.age<18||b.age<18)return null;
 if(!romanticCompatible(a,b))return 0;
 const pref=a.state.socialDynamics?.preferences;if(!pref)return null;
 const rel=a.relations[b.id]||{},bf=b.state.psychology.big_five||{},shared=sharedGoals(a,b).length;
 const publicView=economy?reputationFor(economy,b,a.id):null;
 const observable={appearance:b.state.socialDynamics?.appearance??.5,warmth:rel.closeness??.3,reliability:publicView?clamp((rel.trust??.3)*.5+publicView.reliability*.5):rel.trust??.3,competence:clamp(rel.trust??.5),status:publicView?clamp(publicView.visibleStatus*.2+publicView.recognition*.4+publicView.helpfulness*.4):.5,sharedInterests:Math.min(1,shared/3)};
 return clamp(Object.entries(pref).reduce((n,[k,w])=>n+w*observable[k],0));
}
export function romanticCompatible(a,b){
 const af=a.profile.family||{},bf=b.profile.family||{};
 if(/family|parent|child|sibling|cousin|aunt|uncle|grand/i.test(a.relations?.[b.id]?.kind||''))return false;
 if(af.parent_ids?.includes(b.id)||bf.parent_ids?.includes(a.id)||af.parent_ids?.some(id=>bf.parent_ids?.includes(id)))return false;
 const allows=(p,q)=>!p.profile.romanticPreferences?.genders||p.profile.romanticPreferences.genders.includes(q.gender);
 return allows(a,b)&&allows(b,a);
}
export function driveLevels(p){
 const d=p.state.socialDynamics||{},n=p.state.needs||{},w=p.state.wellbeing?.scores||{},b=p.state.psychology?.big_five||{};
 return {connection:clamp((n.social||0)*.65+(b.extraversion??.5)*.35),achievement:clamp((d.ambition??.5)*.65+(1-(w.A??.5))*.35),recognition:clamp((d.ambition??.5)*.65+(1-(w.R??.5))*.2+(1-(d.prosociality??.5))*.15),romance:p.age>=18?clamp(n.romantic_affection||0):null};
}
export function socialMotivations(a,b,economy=null){
 const shared=sharedGoals(a,b),d=a.state.socialDynamics||{},strain=Math.max(a.state.needs.fatigue||0,a.state.needs.hunger||0),five=a.state.psychology.big_five||{},r=a.relations[b.id]||{};
 const publicView=economy?reputationFor(economy,b,a.id):null;
 return {unresolvedStrain:d.unresolved?.[b.id]?.severity||0,sharedGoals:shared.map(g=>g.kind),ambition:d.ambition??.5,prosociality:d.prosociality??.5,strain:Math.max(strain,a.state.life?.stress||0),drives:driveLevels(a),attraction:adultAttraction(a,b,economy),otherReputation:publicView?clamp((publicView.helpfulness+publicView.reliability)/2):.5,otherRecognition:publicView?.recognition||0,rivalry:clamp((d.ambition??.5)*(1-(d.prosociality??.5))*(shared.some(g=>g.kind==='work')?.6:.1)+(a.state.life?.statusDrive||0)*(a.state.life?.stress||0)*.16+(r.tension||0)*.4),extraversion:five.extraversion??.5};
}
export function responseProbabilities(p,other){
 const b=p.state.psychology.big_five||{},d=p.state.socialDynamics||{},n=p.state.needs,rel=p.relations[other.id]||{},strain=Math.max(n.hunger||0,n.fatigue||0,1-(p.state.wellbeing?.scores?.P??.5)),practice=Math.min(.2,d.communicationPractice||0);
 const constructive=clamp(.3+(b.agreeableness??.5)*.38+(rel.trust??.3)*.18+practice-strain*.2-(rel.tension||0)*.25),active=clamp(.25+(b.extraversion??.5)*.55-strain*.18);
 return {active_constructive:active*constructive,passive_constructive:(1-active)*constructive,active_destructive:active*(1-constructive),passive_destructive:(1-active)*(1-constructive)};
}
export function applySocialDynamics(town,e){
 const [a,b]=e.participants.map(id=>town.byId.get(id));if(!a||!b)return;
 for(const p of [a,b])prepareSocialDynamics(p,town.world.seed);
 if(e.facts.outcome!=='accepted')return;
 const goals=sharedGoals(a,b);e.facts.sharedGoals=goals.map(g=>({id:g.id,title:g.title,evidence:g.evidence}));
 const category=e.facts.category,cooperate=['offer_help','ask_help','collaborate_project','coordinate_work','make_plans','play_together','share_interest'].includes(category);
 if(cooperate&&goals.length){for(const [p,other] of [[a,b],[b,a]]){const d=p.state.socialDynamics;d.knownGoals[other.id]={at:e.end,eventId:e.id,goals:goals.map(g=>g.title)};const keys=Object.keys(d.knownGoals);if(keys.length>64)delete d.knownGoals[keys[0]];d.recentCollaborations.push({otherId:other.id,goal:goals[0].title,eventId:e.id,at:e.end});d.recentCollaborations=d.recentCollaborations.slice(-12);recordExperience(p,e,e.end,'shared_goal',{E:.004,R:.005,M:.005},'A real cooperative exchange connects a shared aim with mutual support.');}}
 if(['invite_activity','make_plans'].includes(category)&&goals.some(g=>g.kind==='hobby')){
  const goal=goals.find(g=>g.kind==='hobby'),room=[...town.places.values()].find(p=>p.kind==='room'&&p.purpose.includes(goal.activity==='read'?'public library':'town park'));
  if(room&&a.age>=12&&b.age>=12)for(const p of [a,b]){p.state.goal={kind:goal.activity,destination:room.id,expires:e.end+7200,reason:'We agreed to pursue our shared interest: '+goal.title,source:'accepted_shared_goal'};p.state.socialDynamics.sharedPlan={withId:p.id===a.id?b.id:a.id,goal:goal.title,locationId:room.id,expires:e.end+7200,eventId:e.id};}
 }
 if(!['celebrate','share_news','share_interest','confide','tell_story'].includes(category)){rememberSocialConsequences(town,e);return;}
 const probabilities=responseProbabilities(b,a),draw=rng(town.world.seed+':response:'+a.profile.seed_key+':'+b.profile.seed_key+':'+e.end)();let c=0,style='passive_destructive';for(const [k,v] of Object.entries(probabilities)){c+=v;if(draw<c){style=k;break;}}
 const responses={active_constructive:`${b.name} asks an interested follow-up and helps ${a.name} savor what matters about the news.`,passive_constructive:`${b.name} acknowledges the news warmly but briefly; ${a.name} is unsure whether there is room to say more.`,active_destructive:`${b.name} immediately raises problems and comparisons; ${a.name} experiences the response as deflating, though the intention is uncertain.`,passive_destructive:`${b.name} changes the subject to their own concerns; ${a.name} feels overlooked without knowing why.`};
 e.facts.responseStyle={responderId:b.id,style,probabilities};e.description+=' '+responses[style];
 const positive=style.endsWith('constructive'),strong=style.startsWith('active');const delta=positive?(strong?.018:.006):(strong?-.065:-.045);
 for(const [p,other] of [[a,b],[b,a]]){const rel=p.relations[other.id];if(rel){rel.closeness=clamp((rel.closeness||0)+delta);rel.trust=clamp((rel.trust||0)+delta*.5);}recordExperience(p,e,e.end,'response_style',{P:delta*.4,R:delta*.5},responses[style]);}
 addFeeling(a,positive?'gratitude':'disappointment',positive?.22:.2,e.end,{kind:'received_response',text:responses[style],evidence_id:e.id});
 b.state.socialDynamics.responses.push({style,otherId:a.id,at:e.end,eventId:e.id});b.state.socialDynamics.responses=b.state.socialDynamics.responses.slice(-12);
 if(style==='active_constructive')b.state.socialDynamics.communicationPractice=Math.min(.2,b.state.socialDynamics.communicationPractice+.0005);
 rememberSocialConsequences(town,e);
}
// Only actually experienced exchanges create a thread. A refusal alone is not
// misconduct, and a friendly greeting never erases a specific unresolved hurt.
// Bounded per-Sim memory keeps follow-up motives local and independent of world size.
function rememberSocialConsequences(town,e){
 for(const id of e.participants){const p=town.byId.get(id),otherId=e.participants.find(x=>x!==id),impact=socialImpact(e,id),d=p.state.socialDynamics;
  d.unresolved||={};let thread=d.unresolved[otherId];
  if(['hurt','conflict'].includes(impact.quality)){
   thread=d.unresolved[otherId]={otherId,otherName:town.byId.get(otherId).name,severity:clamp((thread?.severity||0)+.14),startedAt:thread?.startedAt??e.end,updatedAt:e.end,sourceEventId:e.id,category:e.facts.category,reason:impact.quality==='hurt'?'I felt dismissed when I tried to share something that mattered to me.':'Our exchange left a disagreement unresolved.',status:'unresolved'};
   const rel=p.relations[otherId];if(rel)rel.tension=clamp((rel.tension||0)+.045);
  }else if(thread&&['repair','warm'].includes(impact.quality)){
   const repair=impact.quality==='repair'||['offer_help','comfort','check_in'].includes(e.facts.category);
   if(repair){thread.severity=Math.max(0,thread.severity-(impact.quality==='repair'?.09:.035));thread.updatedAt=e.end;thread.lastRepairEventId=e.id;thread.status=thread.severity<.035?'easing':'unresolved';if(thread.status==='easing')delete d.unresolved[otherId];}
  }
  if(thread)(e.facts.relationshipThreads||={})[id]={...thread};
  const keys=Object.keys(d.unresolved).sort((a,b)=>d.unresolved[b].updatedAt-d.unresolved[a].updatedAt);for(const key of keys.slice(12))delete d.unresolved[key];
 }
}
export function dynamicsView(p,town,economy=null){
 prepareSocialDynamics(p,town.world.seed);
 const reputation=economy?reputationFor(economy,p,p.id,town.world.seconds):p.state.economy?.reputation;
 return {socialAttributes:socialAttributes(p,reputation),drives:driveLevels(p),partnerPreferences:p.age>=18?p.profile.romanticPreferences||null:null,attractions:p.age>=18?Object.keys(p.relations).map(id=>town.byId.get(id)).filter(q=>q?.age>=18&&romanticCompatible(p,q)).slice(0,12).map(q=>({id:q.id,name:q.name,value:adultAttraction(p,q,economy)})):[],lifeProgression:p.state.lifeProgression||null,birthDate:p.profile.birthDate,blockedNeed:p.state.blockedNeed,currentTask:p.state.action,pausedTasks:p.state.pausedTasks||[],conversation:p.state.conversation,bigFive:p.state.psychology.big_five,...p.state.socialDynamics,sharedGoals:Object.keys(p.relations).slice(0,64).map(id=>{const other=town.byId.get(id);return other?{simId:id,name:other.name,assetId:other.asset_id,goals:sharedGoals(p,other),lastCooperation:p.state.socialDynamics.recentCollaborations.filter(x=>x.otherId===id).at(-1)}:null;}).filter(x=>x?.goals.length)};
}
