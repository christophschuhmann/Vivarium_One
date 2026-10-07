// Long-term transitions are dated events, never yearly jumps over minute life.
// Partnership and housing agreements are separate. Neither grants sexual consent.
import {rng} from '../random.js';
import {put,touch,account,balance,rows} from './store.js';
import {householdOf,ownAccount} from './economy.js';
import {currentEducation} from './education.js';
import {calendarDate} from './catalog.js';
import {housingAssessment,moveHousehold} from './housing.js';
import {decideApplication} from './applications.js';
import {joinHouseholds} from './households.js';
import {addFeeling} from '../cognition.js';
import {recordExperience} from '../wellbeing.js';
import {prepareSocialDynamics,romanticCompatible} from '../social-dynamics.js';
const DAY=86400;
const state=p=>p.state.lifeProgression||=( {version:1,lastReviewDay:null,history:[]} );
function remember(p,e){const s=state(p);s.history.push({at:e.end,type:e.type,eventId:e.id,description:e.description});s.history=s.history.slice(-32);}
function endEmployment(d,p,time,reason){const c=d.contracts.get(p.id);if(!c)return;c.payload.status=reason;c.payload.endedAt=time;touch(d,c);d.contracts.delete(p.id);p.state.economy.employmentId=null;const vacant=d.jobs.find(job=>job.payload.firmId===c.payload.firmId&&job.payload.title===c.payload.job);if(vacant){vacant.payload.slots++;touch(d,vacant);}/* Earned wages remain on the ended contract for payroll. */}
function unrelated(a,b,d){
 const ancestors=p=>{const seen=new Set(),queue=[...(p.profile.family.parent_ids||[])];for(let i=0;i<queue.length&&i<128;i++){const id=queue[i];if(seen.has(id))continue;seen.add(id);queue.push(...(d.people.get(id)?.profile.family.parent_ids||[]));}return seen;};
 const left=ancestors(a),right=ancestors(b);return !left.has(b.id)&&!right.has(a.id)&&![...left].some(id=>right.has(id))&&!/family|parent|child|sibling|cousin|aunt|uncle|grand/i.test(a.relations[b.id]?.kind||'');
}
export function birthdayTransition(d,p,time,emit){
 const s=state(p);let course=currentEducation(p);const previous=s.lastAge??p.age-1;s.lastAge=p.age;
 if(course&&((course.kind==='kindergarten'&&p.age>=6)||(course.kind==='primary'&&p.age>=11))){course.status='progressed_without_new_qualification';course.actualEndedAt=time;p.profile.education.currentId=null;course=null;}
 if(p.age>=18&&previous<18){
  const prior=p.state.socialDynamics;delete p.state.socialDynamics;const adult=prepareSocialDynamics(p,d.town.world.seed);if(prior)Object.assign(adult,prior,{appearance:adult.appearance,preferences:adult.preferences});
  const e=emit('adult_transition',p,time,{private:true,age:p.age});
  if(!course&&!d.contracts.has(p.id)){p.profile.job='Unemployed';p.profile.workplace_id=null;}
  if(course)p.profile.job='Student';
  e.description=p.name+' reaches adulthood. Existing study continues until its real requirements are met; otherwise job applications and an independently affordable home become options. No qualification, job or money is granted by a birthday.';remember(p,e);
  const other=d.people.get(p.profile.family.partner_id);
  // At an 18th birthday, a still-minor peer relationship is paused. The existing
  // friendship and factual history remain; no adult/minor romantic simulation.
  if(other?.age<18){for(const [a,b] of [[p,other],[other,p]]){a.profile.family.partner_id=null;a.profile.family.relationship_status='friendship';const r=a.relations[b.id];if(r){r.attraction=0;r.kind='Friend';r.layers||={};r.layers.romance={score:0,status:'none'};}}const ev=emit('romance_age_boundary',p,time,{private:true},[other.id]);ev.description=p.name+' and '+other.name+' keep their friendship; romantic interaction is paused because they are in different age bands.';remember(p,ev);remember(other,ev);}
 }
 if(p.age>=66&&previous<66){endEmployment(d,p,time,'retirement');p.profile.job='Retired';p.profile.workplace_id=null;p.state.economy.previousJob=p.state.career?.job||p.state.economy.previousJob;p.state.career={...p.state.career,job:'Retired'};const e=emit('retirement',p,time,{private:true});e.description=p.name+' retires from regular employment. Earned wages remain payable; pension income, interests and relationships continue.';remember(p,e);}
 // A child who has no enrollment receives an age-appropriate place, not a degree.
 if(p.age>=3&&p.age<18&&!course){const venue=d.calendar.payload.venues[p.age<6?'kindergarten':'school'];if(venue){const kind=p.age<6?'kindergarten':p.age<11?'primary':'secondary',date=calendarDate(time).toISOString().slice(0,10),year=Number(date.slice(0,4)),endAge=kind==='kindergarten'?6:kind==='primary'?11:18;const entry={id:p.id+'_edu_enroll_'+time,kind,institution:d.town.places.get(venue.building)?.name||'Community school',institutionId:venue.building,town:'Bennington',field:kind==='kindergarten'?'Early learning':'General education',startDate:date,endDate:(year+Math.max(1,endAge-p.age))+'-07-31',status:'enrolled',qualification:null,plannedQualification:kind==='secondary'?'High school diploma':kind==='primary'?'Elementary education':'Early learning',grade:null,gradeScale:'GPA 0–4 (game approximation)',origin:'actual_enrollment',observedHours:0};p.profile.education.history.push(entry);p.profile.education.currentId=entry.id;p.profile.workplace_id=venue.rooms[0];p.profile.facility={buildingId:venue.building,rooms:{hall:venue.rooms[0],wc:venue.bath}};p.profile.job=p.age<6?'Kindergartener':'Pupil';const e=emit('education_enrolled',p,time,{courseId:entry.id,private:true});e.description=p.name+' enrolls at '+entry.institution+' for '+entry.field+'. Attendance and learning will be recorded from today.';remember(p,e);}}
}
export function splitAdultHousehold(d,p,time,emit,{reason='independent_home'}={}){
 const old=householdOf(d,p);if(p.age<18||!old||old.payload.members.length<2||p.state.careSupport||p.state.economy.parentalCare)return {ok:false};
 const remaining=old.payload.members.filter(id=>id!==p.id);if(!remaining.some(id=>d.people.get(id)?.age>=18)||p.state.economy.elderCareTargets?.length)return {ok:false};
 if(remaining.some(id=>{const child=d.people.get(id);return child.age<18&&child.profile.family.parent_ids?.includes(p.id)&&!child.profile.family.parent_ids.some(parentId=>parentId!==p.id&&remaining.includes(parentId));}))return {ok:false};
 // A split does not take shared savings, transfer debt or move children. Existing
 // family obligations remain; leases/property claims stay with the original home.
 const h=put(d,'household',{originalId:p.id+'_independent_'+time,members:[p.id],sharedBy:[p.id],propertyId:null,leaseId:null,stratum:old.payload.stratum,food:{basic:0,standard:0,premium:0},budget:{utilities:13800,foodTarget:18000,irregularReserve:10000},housingStatus:'looking',goals:[],origin:reason},{ownerId:p.id}),joint=account(d,'household',h.id);h.payload.jointAccountId=joint.id;touch(d,h);d.households.set(h.id,h);
 old.payload.members=remaining;old.payload.sharedBy=old.payload.sharedBy.filter(id=>id!==p.id);old.payload.budget.utilities=11000+remaining.length*2800;old.payload.budget.foodTarget=remaining.length*18000;touch(d,old);p.state.economy.householdId=h.id;
 for(const task of rows(d,'obligation'))if(task.payload.assigneeId===p.id&&task.payload.householdId===old.id&&['accepted','working'].includes(task.payload.status)&&!['work','care'].includes(task.payload.operator)){task.payload.householdId=h.id;touch(d,task);}
 const e=emit('independent_household',p,time,{fromHouseholdId:old.id,toHouseholdId:h.id,reason,private:true});e.description=p.name+' establishes a separate household budget using their own savings. Shared money, existing debts and children stay with the original household; the current room remains temporary accommodation until a housing application succeeds.';remember(p,e);return {ok:true,household:h,previous:old};
}
export function progressionDaily(d,time,emit){
 const day=Math.floor(time/DAY),hour=time/3600%24;if(hour<18)return;
 for(const p of d.people.values()){
  const s=state(p);if(s.lastReviewDay===day)continue;s.lastReviewDay=day;s.lastAge??=p.age;
  if(p.age<18)continue;
  const draw=rng(d.town.world.seed+':life-progress:'+p.profile.seed_key+':'+day),partner=d.people.get(p.profile.family.partner_id);
  if(partner&&partner.age>=18){const r=p.relations[partner.id]||{},other=partner.relations[p.id]||{};if(p.id<partner.id){
   const strained=(r.tension||0)>.65&&(r.trust||0)<.3||(other.tension||0)>.65&&(other.trust||0)<.3;
   s.strainedSince=strained?(s.strainedSince??time):null;
   if(strained&&time-s.strainedSince>=14*DAY&&draw()<.08){const married=p.profile.family.relationship_status==='married';const e=emit(married?'divorce':'partnership_ended',p,time,{private:true,reason:'sustained_conflict',strainSince:s.strainedSince},[partner.id]);e.description=p.name+' and '+partner.name+' end their '+(married?'marriage':'partnership')+' after sustained conflict. Housing, property, parenting and debts require separate arrangements; ending the relationship changes none of them automatically.';for(const [a,b] of [[p,partner],[partner,p]]){a.profile.family.partner_id=null;a.profile.family.relationship_status=married?'divorced':'single';state(a).separatedAt=time;const rel=a.relations[b.id];if(rel){rel.kind=married?'Former spouse':'Former partner';rel.layers||={};rel.layers.romance={score:0,status:'ended'};rel.attraction=0;}remember(a,e);addFeeling(a,'sadness',.4,time,{kind:'separation',text:e.description,evidence_id:e.id});recordExperience(a,e,time,'relationship_change',{P:-.025,R:-.04,M:-.01},e.description);}continue;}
   const h=householdOf(d,p),h2=householdOf(d,partner);if(h?.payload.members.length===1&&h2?.payload.members.length===1&&h.id!==h2.id&&r.trust>.7&&other.trust>.7&&r.closeness>.7&&other.closeness>.7){s.homeAgreementSince??=time;if(time-s.homeAgreementSince>=30*DAY&&draw()<.025){const joined=joinHouseholds(d,p,partner,time,emit,{consentingAdultIds:[p.id,partner.id]});if(joined.ok)s.homeAgreementSince=null;}}else s.homeAgreementSince=null;
  }}else if(!partner&&(!s.separatedAt||time-s.separatedAt>30*DAY)&&draw()<.035){
   const candidates=Object.entries(p.relations).map(([id,r])=>({q:d.people.get(id),r})).filter(({q,r})=>q&&q.age>=18&&romanticCompatible(p,q)&&!q.profile.family.partner_id&&unrelated(p,q,d)&&r.trust>.6&&r.closeness>.6&&r.attraction>.25&&(q.relations[p.id]?.attraction||0)>.25&&(q.relations[p.id]?.trust||0)>.6&&(q.relations[p.id]?.closeness||0)>.6&&(r.tension||0)<.25).sort((a,b)=>b.r.closeness-a.r.closeness);
   const q=candidates[0]?.q;if(q){const e=emit('partnership_started',p,time,{private:true,agreement:'mutual_adult_interest'},[q.id]);e.description=p.name+' and '+q.name+' choose to begin dating after mutual interest and a trusting friendship. Their households and finances remain independent; each future intimate interaction still requires its own consent.';for(const [a,b] of [[p,q],[q,p]]){a.profile.family.partner_id=b.id;a.profile.family.relationship_status='dating';a.relations[b.id].kind='Partner';remember(a,e);recordExperience(a,e,time,'partnership',{P:.02,R:.03,M:.01},e.description);}}}
  // Move out only with an independent deposit + buffer and an actual accepted
  // listing. Rejected applications leave the original household unchanged.
  const h=householdOf(d,p),parents=p.profile.family.parent_ids||[],wantsOwnHome=!p.profile.family.partner_id&&h?.payload.members.length>1&&(parents.some(id=>h.payload.members.includes(id))||s.separatedAt)&&!p.state.careSupport&&!p.state.economy.parentalCare;
  if(wantsOwnHome&&draw()<.035&&(!s.lastMoveSearch||time-s.lastMoveSearch>7*DAY)){
   s.lastMoveSearch=time;const contract=d.contracts.get(p.id),income=contract?.payload.grossMonthlyCents||0,available=balance(d,ownAccount(d,p)),offer=[...d.properties.values()].filter(x=>x.payload.listed&&!x.payload.residents.length&&x.payload.capacity>=1&&x.payload.rentCents<income*.22&&available>x.payload.rentCents*3+50000).sort((a,b)=>a.payload.rentCents-b.payload.rentCents)[0];
   if(offer){
    // Assess the prospective budget without silently taking family funds.
    const own={...h,payload:{...h.payload,members:[p.id],sharedBy:[p.id],leaseId:null,propertyId:null,jointAccountId:null,budget:{utilities:13800,foodTarget:18000,irregularReserve:10000}}};d.households.set(h.id,own);let result;try{result=housingAssessment(d,p,offer,time);}finally{d.households.set(h.id,h);}if(result.eligible){
     const decision=decideApplication(d,p,'housing',offer.id,time,result,emit);if(decision.ok){const split=splitAdultHousehold(d,p,time,emit);if(split.ok){const moved=moveHousehold(d,split.household,offer,time,emit);if(!moved.ok)throw new Error('Accepted independent home became unavailable');decision.event.facts.contractId=moved.leaseId;}}}
   }
  }
 }
}
