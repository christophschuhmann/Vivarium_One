import {socialImpact} from '../social-effects.js';
import {rng} from '../random.js';
import {CONDITIONS,COMMUNITY_GROUPS,LIFE_STYLES,incomeBand} from './catalog.js';
import {ensureWellbeing,projectWellbeing,recordExperience} from '../wellbeing.js';
import {addFeeling} from '../cognition.js';
import {rows,touch,transfer,balance} from '../expanded/store.js';
import {householdForecast,householdCash,householdOf,ownAccount,fundsOf,newInvoice} from '../expanded/economy.js';
import {requestSupport,substanceUse,SUBSTANCE_TYPES} from '../expanded/community.js';
const clamp=n=>Math.max(0,Math.min(1,n)),DAY=86400;
const weighted=(items,r)=>{let n=r()*items.reduce((a,b)=>a+b.weight,0);return items.find(x=>(n-=x.weight)<0)||items.at(-1);};
export function initializePersonLife(p,seed,time){
 if(p.state.life?.version===1&&p.profile.community)return false;
 const r=rng(seed+':life-variety:'+p.profile.seed_key),family=rng(seed+':family-tone:'+p.household_id)(),style=family<.16?'secure_haven':LIFE_STYLES[1+Math.floor(r()*(LIFE_STYLES.length-1))];
 const optimism=.08+r()*.86,support=style==='secure_haven'?.75+r()*.2:.12+r()*.73;
 const life=p.state.life={version:1,origin:'initialized_fictional_background',introducedAt:time,style,optimism,support,agency:.15+r()*.75,gratitude:.05+r()*.9,materialism:style==='status_chaser'?.8+r()*.18:r()*.75,statusDrive:style==='restless_competitor'?.8+r()*.18:r(),stress:.1+r()*.4,conditions:[],talents:[],currentEpisode:null,counts:{support:0,criticism:0,positive:0,negative:0},lastDay:Math.floor(time/DAY)-1,lastHour:-1};
 const eligible=CONDITIONS.filter(c=>c.minAge<=p.age&&!['insomnia','chronic_pain'].includes(c.id));
 if(eligible.length&&r()<(p.age<18?.16:.27)){const first=weighted(eligible,r);life.conditions.push({id:first.id,label:first.label,severity:.15+r()*.6,pattern:first.pattern,support:first.support,managed:r()<.45});if(r()<.3){const second=weighted(eligible.filter(c=>c.id!==first.id),r);life.conditions.push({id:second.id,label:second.label,severity:.15+r()*.5,pattern:second.pattern,support:second.support,managed:r()<.4});}}
 for(const id of ['insomnia','chronic_pain']){const c=CONDITIONS.find(x=>x.id===id);if(p.age>=c.minAge&&r()<c.weight*(p.age>=65?1.4:1))life.conditions.push({id,label:c.label,severity:.15+r()*.5,pattern:c.pattern,support:c.support,managed:r()<.5});}
 // Substance risk is modeled only for adults. Prescribed medication is never
 // equated with misuse; recovery care uses its own funded clinical route.
 if(p.age>=18&&r()<.13){const n=r(),type=n<.56?'alcohol':n<.79?'tobacco':n<.89?'cannabis':n<.94?'opioids':n<.975?'cocaine':'sedatives';p.state.economy.health.substances[type]||={exposures:0,dependence:.2+r()*.55,craving:.1+r()*.3,abstinentDays:0,lastUseAt:null,origin:'initialized_risk_background',recovery:r()<.35};}
 if(p.age>=6&&r()<.08){const skill=['analysis','craft','music','fitness','teaching','care'][Math.floor(r()*6)];p.state.skills[skill]=Math.max(p.state.skills[skill]||0,.72+r()*.25);const attribute={analysis:'reasoning',craft:'coordination',music:'coordination',fitness:'stamina',teaching:'presence',care:'perception'}[skill];if(p.state.aptitudes?.attributes&&attribute)p.state.aptitudes.attributes[attribute]=Math.max(p.state.aptitudes.attributes[attribute]||0,82+Math.floor(r()*16));life.talents.push({skill,label:'Strong aptitude for '+skill,origin:'initialized_background'});}
 if(p.state.socialDynamics){p.state.socialDynamics.prosociality=style==='secure_haven'?.7+r()*.25:style==='status_chaser'||style==='restless_competitor'?.1+r()*.55:.25+r()*.65;p.state.socialDynamics.ambition=style==='restless_competitor'||style==='status_chaser'?.78+r()*.21:style==='content_minimalist'?.08+r()*.27:.08+r()*.85;if(p.age>=18)p.state.socialDynamics.appearance=.04+r()*.94;}
 const big=p.state.psychology.big_five;for(const key of Object.keys(big))if(r()<.14)big[key]=r()<.5?.04+r()*.15:.82+r()*.15;
 const available=COMMUNITY_GROUPS.filter(g=>p.age>=g.age&&(!g.maxAge||p.age<=g.maxAge));
 const spiritual=r()<.35;p.profile.community={orientation:spiritual?'faith_or_spiritual':'secular_or_unspecified',groups:[],origin:'fictional_membership_background'};
 for(const g of available)if((g.id==='faith'&&!spiritual)||(g.id==='secular'&&spiritual))continue;else if(r()<(p.profile.interests?.includes(g.interest)?.3:.055))p.profile.community.groups.push(g.id);
 p.profile.community.groups=p.profile.community.groups.slice(0,2);
 const w=ensureWellbeing(p,time),severity=Math.max(0,...life.conditions.map(c=>c.severity*(c.managed?.55:1)));
 const floor=style==='secure_haven'?.62:style==='guarded_survivor'?.23:style==='content_minimalist'?.56:.3;
 w.baseline={P:clamp(floor+r()*.24+optimism*.08-severity*.2),E:clamp(.22+r()*.56+life.talents.length*.08-severity*.08),R:clamp(.2+support*.65),M:clamp(.2+r()*.57+(p.profile.community.groups.length?.08:0)),A:clamp(.24+r()*.5+life.talents.length*.1)};
 if(style==='guarded_survivor'){w.baseline.E=clamp(w.baseline.E-.12);w.baseline.M=clamp(w.baseline.M-.16);w.baseline.A=clamp(w.baseline.A-.12);}w.origin='varied_fictional_background_plus_recorded_experience';projectWellbeing(p,time);return true;
}
export function calibrateDrama(d,time,{newWorld=false}={}){
 if(!d)return {people:0,households:0};let people=0,households=0;
 for(const p of d.people.values())people+=+initializePersonLife(p,d.town.world.seed,time);
 for(const h of d.households.values()){
  if(h.payload.dramaVersion===1)continue;const members=h.payload.members.map(id=>d.people.get(id)).filter(Boolean),adults=members.filter(p=>p.age>=18),n=members.length,draw=rng(d.town.world.seed+':harder-costs:'+h.payload.originalId);
  const b=h.payload.budget,property=d.entities.get(h.payload.propertyId),lease=d.entities.get(h.payload.leaseId),luxury=['upper','very_wealthy'].includes(h.payload.stratum)?1.3:1;
  h.payload.previousBudget={...b};b.utilities=Math.max(b.utilities,Math.round((18000+n*3500)*luxury));b.foodTarget=Math.max(b.foodTarget,Math.round(n*(h.payload.stratum==='financially_struggling'?22000:32000)*luxury));b.irregularReserve=Math.max(b.irregularReserve,9000+n*2500);b.transport=Math.round((9000+adults.length*10500)*luxury);b.healthOutOfPocket=adults.length*7500;b.communication=6500+adults.length*1500;
  const rent=Math.round((78000+n*17000)*(1+draw()*.18)*luxury);
  if(property){property.payload.rentCents=Math.max(property.payload.rentCents,rent);touch(d,property);}
  if(lease?.payload.status==='active'){lease.payload.previousRentCents=lease.payload.rentCents;lease.payload.rentCents=Math.max(lease.payload.rentCents,rent);lease.payload.priceRevisionAt=time;touch(d,lease);}
  h.payload.dramaVersion=1;h.payload.difficulty={mode:'dramatic',introducedAt:time,affects:'future budgets and invoices; no past payment rewritten'};touch(d,h);households++;
  // Smaller starting cushions apply only when creating a new town. Existing
  // players' balances are never seized to manufacture a more dramatic story.
  if(newWorld&&['lower_middle','middle'].includes(h.payload.stratum))for(const p of adults){const a=d.accounts.get(ownAccount(d,p)),factor=h.payload.stratum==='lower_middle'?.45:.55,amount=Math.round(a.balance_cents*(1-factor));transfer(d,a.id,fundsOf(d).external,amount,{key:{kind:'initial_cash_calibration',simId:p.id},kind:'initial_endowment_adjustment',at:time,metadata:{initializedBackground:true}});}
 }
 d.calendar.payload.dramaVersion=1;touch(d,d.calendar);return {people,households};
}
export function lifeContext(p){const s=p.state.life;if(!s)return null;return {style:s.style,optimism:s.optimism,support:s.support,agency:s.agency,gratitude:s.gratitude,materialism:s.materialism,statusDrive:s.statusDrive,stress:s.stress,conditions:s.conditions,talents:s.talents,currentEpisode:s.currentEpisode,community:p.profile.community,observedInteractions:s.counts,note:'Fictional modeled circumstances. A condition is not moral character. Private data is author context, not other Sims’ knowledge.'};}
export function lifeSocial(p,event){
 const s=p.state.life;if(!s||event.facts.outcome!=='accepted')return;
 const bad=['argue','criticize','insult','mock','threaten','reject','gossip_negative'].includes(event.facts.category)||['conflict','hurt'].includes(socialImpact(event,p.id).quality),good=['comfort','offer_help','ask_help','apologize','reconcile','express_affection','share_good_news','collaborate_project','play_together'].includes(event.facts.category);
 if(!bad&&!good)return;s.counts[bad?'criticism':'support']++;s.counts[bad?'negative':'positive']++;
 s.support=clamp(s.support+(bad?-.018:.012));s.agency=clamp(s.agency+(bad?-.008:.006));
 for(const c of s.conditions)c.severity=clamp(c.severity+(bad?['sensitivity','worry','alarm'].includes(c.pattern)?.012:.005:-.004));
 s.lastSocialEvidence={eventId:event.id,at:event.end,category:event.facts.category,otherId:event.participants.find(id=>id!==p.id)};
 recordExperience(p,event,event.end,'life_support',bad?{P:-.012,R:-.018,M:-.005}:{P:.009,R:.012,M:.01},bad?'A concrete painful exchange adds strain; the label alone does not explain anyone’s motives.':'A real bid or response provides support and a small opportunity for trust.');
}
export function lifeMinute(d,time,emit){
 if(!d?.calendar.payload.dramaVersion)return;const hour=Math.floor(time/3600),day=Math.floor(time/DAY);
 for(const p of d.people.values()){
  const s=p.state.life;if(!s)continue;
  if(s.lastHour!==hour){s.lastHour=hour;const f=p.state.economy.householdForecast||{},strain=f.marginCents<0?Math.min(.8,-f.marginCents/200000):0,severity=Math.max(0,...s.conditions.map(c=>c.severity*(c.managed?.65:1)));s.stress=clamp(.12+strain*.48+severity*.3+(p.state.needs.social||0)*.18-s.support*.15-s.optimism*.08);
   if(s.stress>.42){addFeeling(p,s.conditions.some(c=>c.pattern==='low_mood')?'sadness':'doubt',.18+s.stress*.45,time,{kind:'life_pressure',text:'Financial pressure, present symptoms and available support shape how manageable today feels.'},{key:'life:pressure',ttl:3700});}
   if(s.lastDay!==day){s.lastDay=day;const draw=rng(d.town.world.seed+':life-day:'+p.profile.seed_key+':'+day),recover=s.support*.004+(s.conditions.some(c=>c.managed)?.002:0);for(const c of s.conditions)c.severity=clamp(c.severity+(s.stress>.55?.004:0)-recover);
    const active=s.conditions.filter(c=>c.severity>.38).sort((a,b)=>b.severity-a.severity)[0];
    if(active&&draw()<active.severity*(active.managed?.30:.60)){const descriptions={low_mood:'finding it harder to look forward to ordinary activities',worry:'rechecking possible problems and struggling to let uncertainty rest',avoidance:'wanting contact but hesitating before approaching a group',alarm:'feeling unusually alert and needing reassurance about safety',rigidity:'finding uncertainty difficult and wanting a predictable sequence',episodic_mood:'noticing changes in energy and wanting to protect a stable routine',sensitivity:'feeling particularly sensitive to ambiguous reactions',attention:'finding sustained concentration harder than usual',perception:'feeling unsettled and preferring familiar support',sleep:'feeling unrested despite making time for sleep',pain:'needing to pace effort around discomfort'};
     const e=emit('health_symptoms_notice',p,time,{private:true,pattern:active.pattern,severity:active.severity});e.description=p.name+' notices '+descriptions[active.pattern]+'. Support and manageable expectations matter today.';s.symptoms={pattern:active.pattern,intensity:active.severity,until:time+8*3600,eventId:e.id};recordExperience(p,e,time,'health_experience',{P:-.02*active.severity,E:-.02*active.severity},e.description);addFeeling(p,['low_mood','pain'].includes(active.pattern)?'sadness':'doubt',.18+active.severity*.3,time,{kind:'own_health_experience',text:e.description,evidence_id:e.id},{key:'life:symptoms',ttl:8*3600});
    }
    const positive=draw()<clamp(.15+s.optimism*.2+s.support*.2-s.stress*.4),negative=!positive&&draw()<s.stress*.8;
    if(p.age>=6&&(positive||negative)){const e=emit(positive?'savoring_moment':'coping_with_pressure',p,time,{private:true,stress:s.stress,style:s.style});e.description=positive?p.name+(s.style==='content_minimalist'?' takes quiet satisfaction in a modest, sufficient routine.':' notices one worthwhile part of the day and decides to give it attention.'):p.name+' recognizes that money, responsibilities or emotional strain are narrowing the choices for today. A manageable next step matters more than pretending everything is fine.';s.counts[positive?'positive':'negative']++;s.currentEpisode={type:e.type,eventId:e.id,at:time,description:e.description};recordExperience(p,e,time,'life_appraisal',positive?{P:.018,M:.012,A:.004}:{P:-.035,E:-.02,M:-.015},e.description);}
   }
  }
  if(p.age>=18&&(time/3600)%24>=17&&(time/3600)%24<21&&s.lastRiskDay!==day&&!['work','sleep','toilet','shower'].includes(p.state.action?.kind)&&!p.state.route){s.lastRiskDay=day;const health=p.state.economy.health,draw=rng(d.town.world.seed+':life-care:'+p.profile.seed_key+':'+day),dependent=Object.entries(health.substances).find(([,x])=>x.dependence>.15);
   if((s.conditions.some(c=>c.severity>.5)||dependent)&&!health.supportPlanId&&draw()<.035+s.agency*.055)requestSupport(d,p,time,emit,{kind:'therapy'});
   if(dependent&&!health.supportPlanId){const [type,risk]=dependent;if(!risk.recovery&&draw()<.25+risk.craving*.3){const venue=['opioids','cocaine'].includes(type)?d.calendar.payload.venues.industrial?.rooms[0]:d.calendar.payload.venues.cafe?.rooms[0];if(venue){s.riskVisit={type,locationId:venue,expiresAt:time+3*3600};}}}
  }
  if(s.riskVisit&&time>s.riskVisit.expiresAt)s.riskVisit=null;
  if(s.riskVisit&&p.state.location_id===s.riskVisit.locationId&&!p.state.economy.health.supportPlanId){substanceUse(d,p,s.riskVisit.type,time,emit,{consent:true});s.riskVisit=null;}
  // Real attendance, not a calendar notification that grants fictional benefits.
  const plan=s.communityPlan;
  if(plan&&time>plan.until){if(!plan.attended){const e=emit('community_session_missed',p,time,{groupId:plan.groupId,reason:'other_commitments',private:true});e.description=p.name+' could not fit the planned group session around travel, care or other commitments.';}s.communityPlan=null;}
  if(plan&&!plan.attended&&p.state.location_id===plan.locationId&&time>=plan.start){plan.presentMinutes=(plan.presentMinutes||0)+1;if(plan.presentMinutes<15)continue;const group=COMMUNITY_GROUPS.find(g=>g.id===plan.groupId);if(group.fee&&p.age>=18){const paid=transfer(d,ownAccount(d,p),fundsOf(d).external,group.fee,{key:{kind:'club_session',simId:p.id,day,groupId:group.id},kind:'community_activity',at:time});if(!paid.ok){s.communityPlan=null;continue;}}plan.attended=true;const e=emit('community_session_attended',p,time,{groupId:group.id,locationId:plan.locationId,feeCents:p.age>=18?group.fee:0});e.description=p.name+' joins '+group.name+' at the actual meeting place, sharing an interest and making room for connection.';s.support=clamp(s.support+.01);recordExperience(p,e,time,'community',{P:.012,E:.018,R:.009,M:.02},e.description);}
 }
 // Household setbacks are uncommon, real invoices and bounded, not a fresh
 // catastrophe for every Sim every minute. Repairs compete with reserves.
 if(d.calendar.payload.lastDramaDay!==day){d.calendar.payload.lastDramaDay=day;touch(d,d.calendar);for(const h of d.households.values()){const draw=rng(d.town.world.seed+':household-setback:'+h.id+':'+day);if(draw()>.018)continue;const p=h.payload.members.map(id=>d.people.get(id)).find(p=>p.age>=18);if(!p)continue;const cost=5000+Math.round(draw()*30000),e=emit('unexpected_household_cost',p,time,{costCents:cost,householdId:h.id,private:true});e.description=p.name+' faces an unexpected essential repair costing '+(cost/100).toFixed(2)+'. Reserves, postponement or practical help now matter.';newInvoice(d,p,h,'essential_repair',cost,fundsOf(d).external,time,emit,{sourceEventId:e.id});}}
}
export function lifeDestination(d,p,time){
 const s=p.state.life;if(!s)return null;const hour=(time/3600)%24,day=Math.floor(time/DAY),weekday=day%7;if(p.state.needs.hunger>.7||p.state.needs.bladder>.65||p.state.needs.fatigue>.75)return null;
 const plan=s.communityPlan;if(plan&&time<plan.until&&time>=plan.start-1800)return plan.locationId;
 if(s.riskVisit&&!p.state.economy.health.supportPlanId)return s.riskVisit.locationId;
 if(p.age<3)return null;
 const group=COMMUNITY_GROUPS.find(g=>(p.profile.community?.groups||[]).includes(g.id)&&g.day===weekday&&hour>=g.hour-.5&&hour<g.hour+1&&s.lastGroupDay?.[g.id]!==day);if(!group)return null;
 let venue=d.calendar.payload.venues[group.venue]?.rooms?.[0];if(!venue){venue=[...d.town.places.values()].find(x=>x.kind==='room'&&x.purpose?.includes(group.venue))?.id;}if(!venue)return null;
 if(p.age<12){const guardian=p.profile.family.parent_ids.map(id=>d.people.get(id)).find(q=>q?.age>=18&&!q.state.route&&!['work','sleep'].includes(q.state.action?.kind)&&q.state.needs.fatigue<.7);if(!guardian)return null;if(!guardian.state.life)return null;guardian.state.life.communityPlan={groupId:group.id,locationId:venue,start:day*DAY+group.hour*3600,until:day*DAY+(group.hour+1)*3600,escortFor:p.id};}
 s.lastGroupDay||={};s.lastGroupDay[group.id]=day;s.communityPlan={groupId:group.id,locationId:venue,start:day*DAY+group.hour*3600,until:day*DAY+(group.hour+1)*3600};return venue;
}
