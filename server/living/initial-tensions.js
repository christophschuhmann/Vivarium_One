// Initial conditions, never witnessed events. Deterministic and bounded by the
// Sim's actual age, relationships and own finances; no invented affairs/crimes.
import {rng} from './random.js';
import {addFeeling,evaluateMind} from './cognition.js';
import {economicDraft} from './expanded/economy.js';
import {financialOutlook} from './expanded/finances.js';

export function seedInitialSituations(town,catalog,{skipSimIds=new Set()}={}){
 const time=town.world.seconds,draft=economicDraft(town),changed=[];
 for(const p of town.people){
  if(skipSimIds.has(p.id)||p.state.initialSituation?.version>=2||p.biography_mode==='written')continue;
  if(p.state.initialSituation){
   for(const e of p.state.affect?.states||[])e.components=(e.components||[]).filter(c=>!c.key?.startsWith('initial:'));
   if(p.state.presentation?.source==='initialized_background')delete p.state.presentation;
  }
  const r=rng(town.world.seed+':initial-situation:'+p.profile.seed_key),choices=[];
  const offer=(kind,weight,title,thought,feelings,otherId=null)=>choices.push({kind,weight,title,thought,feelings,otherId});
  offer('settled',3,'A life with room for enjoyment',p.age<3?'I feel safe with familiar care.':'There are things I would still like to change, but I have room to enjoy today.',[['contentment',.44],['thankfulness_gratitude',.3]]);
  offer('anticipation',2,'Something to look forward to',p.age<3?'I want to explore, then return to someone familiar.':'I want to make time for '+(p.profile.interests?.[0]||'something I enjoy')+'. A small step today would matter to me.',[['interest',.46],['hope_enthusiasm_optimism',.34]]);
  if(p.age<3){
   offer('care',4,'Needing reassurance','I want closeness and a familiar, reassuring voice.',[['longing',.5],['distress',.32]]);
  }else{
   const ties=Object.entries(p.relations).filter(([id])=>town.byId.has(id));
   const family=ties.find(([id])=>p.profile.family?.partner_id===id)||ties.find(([id])=>town.byId.get(id).household_id===p.household_id);
   const peer=ties.find(([id,rel])=>town.byId.get(id).age>=6&&Math.abs(town.byId.get(id).age-p.age)<5&&rel.background?.contexts?.some(c=>['Classmate','Friend','Coworker'].includes(c)));
   if(family){const [id]=family,name=town.byId.get(id).name;
    offer('boundaries',2.6,p.age<12?'Wanting time and attention':'Closeness and personal space',p.age<12?`I want ${name} to make time for me, but I worry I will just be told what to do. I could ask for one thing we can enjoy together.`:`I care about ${name}, yet I want more say in our everyday decisions. I am unsure how to bring it up without making it sound like rejection.`,[['affection',.32],['impatience_and_irritability',.48],['doubt',.38]],id);
   }
   offer('belonging',2,'Uncertain about belonging',p.age<12?'I want to join in, but I am not sure they will choose me. Perhaps I can suggest a game.':'I would like someone to ask how I really am. I worry that admitting I need company would make me seem demanding.',[['longing',.53],['doubt',.36]]);
   if(peer){const [id]=peer,name=town.byId.get(id).name;
    offer('comparison',2,'Recognition feels scarce',p.age<18?`I want to be noticed as much as ${name}. I could show what I can do, but I do not want to lose a friend over a comparison.`:`I want my contribution to be noticed alongside ${name}'s. Part of me wants to impress the others before asking for help; I do not know whether ${name} sees this as a competition.`,[['jealousy_envy',.47],['doubt',.4],['hope_enthusiasm_optimism',.27]],id);
   }
   if(p.age>=18){
    const partner=town.byId.get(p.profile.family?.partner_id);
    if(partner?.age>=18)offer('different_futures',3.5,'A shared life, different priorities',`I want a change in our shared life, but I am afraid ${partner.name} will hear that as criticism of everything we have built. I have been holding back my frustration. I need to ask what matters to each of us instead of assuming we want the same future.`,[['disappointment',.58],['anger',.42],['affection',.29]],partner.id);
    const allies=ties.filter(([id,rel])=>town.byId.get(id).age>=18&&rel.closeness>.3);
    if(allies.length>=2){const [id]=allies[0],[thirdId]=allies[1],name=town.byId.get(id).name,third=town.byId.get(thirdId).name;
     offer('divided_loyalties',2.5,'Wanting support without taking sides',`I want ${third}'s support before discussing a sensitive issue with ${name}. It would be tempting to tell only my side, but that could damage their relationship. I do not know what either of them really thinks; I need to decide whether to ask openly or quietly seek allies.`,[['doubt',.56],['impatience_and_irritability',.48]],id);
    }
    const outlook=financialOutlook(draft,p,time);
    if(['tight','shortfall'].includes(outlook.security))offer('money',outlook.security==='shortfall'?5:2.5,'Keeping the household afloat',outlook.security==='shortfall'?'My current budget has a funding gap. I want to look for support or better options, but admitting the problem to people close to me feels difficult.':'My budget leaves little breathing room. I want to be generous without promising more than I can afford.',[[outlook.security==='shortfall'?'fear':'doubt',.55],['distress',.36]]);
    if(p.state.career?.status==='unemployed'||p.profile.job==='Unemployed')offer('work',4,'Wanting a fresh start','I want work that makes use of my abilities. I am trying not to treat an uncertain job search as a judgment of my worth.',[['disappointment',.54],['hope_enthusiasm_optimism',.32]]);
    if(p.age>=70)offer('autonomy',2,'Help without losing a voice','I appreciate support, but I want to stay involved in decisions about my own day. I would like to ask for company without having everything done for me.',[['doubt',.43],['affection',.3],['longing',.34]]);
   }
  }
  let draw=r()*choices.reduce((n,c)=>n+c.weight,0),chosen=choices.at(-1);
  for(const c of choices){draw-=c.weight;if(draw<=0){chosen=c;break;}}
  // The first two anchors are the player's doorway into the town. Avoid an
  // accidentally all-cheerful opening without making every resident unhappy.
  if(p.anchored&&changed.some(q=>q.anchored&&['settled','anticipation'].includes(q.state.initialSituation.kind))&&['settled','anticipation'].includes(chosen.kind))chosen=choices.find(c=>c.kind==='different_futures')||choices.find(c=>c.kind==='boundaries')||choices.find(c=>c.kind==='belonging')||chosen;
  const {weight,...situation}=chosen;
  const expiresAt=time+Math.round((2+r()*4)*3600),masked=p.age>=12&&!['settled','anticipation'].includes(chosen.kind)&&r()<.32;
  p.state.initialSituation={version:2,source:'initialized_background',at:time,...situation};
  // This is this Sim's own concern, not knowledge of another person's mind.
  p.state.thought=chosen.thought;p.state.thought_source='procedural';p.state.thought_at=time;
  if(masked)p.state.presentation={manner:'friendly_composure',reason:'I prefer to seem composed until I feel safe enough to discuss what is troubling me.',source:'initialized_background',until:expiresAt};
  if(chosen.otherId){
   const rel=p.relations[chosen.otherId];rel.tension=Math.max(rel.tension||0,(p.age>=18&&['different_futures','comparison','divided_loyalties'].includes(chosen.kind)?.42:.18)+r()*.16);
   rel.background||={};rel.background.initialConcern={source:'initialized_background',ownerId:p.id,text:chosen.thought};
  }
  for(const [id,intensity] of chosen.feelings)addFeeling(p,id,intensity+r()*.1,time,{kind:'initialized_background',text:chosen.thought,otherId:chosen.otherId},{ttl:expiresAt-time,key:'initial:'+chosen.kind+':'+id});
  evaluateMind(p,time,catalog);changed.push(p);
 }
 return changed;
}
