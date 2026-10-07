import {rng} from './random.js';
import {SOCIAL_VERSION} from './neighborhoods.js';
const interests={reading:'Reading',cooking:'Cooking',walking:'Walking',craft:'Crafts',gardening:'Gardening',socializing:'Socializing',music:'Music'};
export const interestLabel=key=>interests[key]||key;
const motives=[
  ['belonging','Wants to feel included without having to prove themselves all the time.','Pays close attention to whether others have time to connect.'],
  ['care','Wants to be there for people they trust and learn to accept help too.','Checks in when someone may need support.'],
  ['recognition','Wants their ideas and efforts to be appreciated.','Enjoys genuine interest and is sensitive to being overlooked.'],
  ['stability','Wants reliable relationships and a calmer daily life.','Needs some time alone after a busy stretch.'],
  ['independence','Wants to make their own choices while staying connected to others.','Tries to set boundaries kindly.'],
  ['curiosity','Wants to learn something new and share experiences with others.','Finds it easy to start a conversation around shared interests.']
];
export function neighborhoodOf(p,places){let at=p.household_id;for(let i=0;at&&i<16;i++){const place=places.get(at);if(place?.kind==='neighborhood')return place;at=place?.parent_id;}return null;}
const familyOf=p=>p.profile.family||p.family||{};
const workOf=p=>p.profile.workplace_id||p.workplace_id;
const kin=(a,b)=>familyOf(a).parent_ids?.includes(b.id)||familyOf(b).parent_ids?.includes(a.id)||(familyOf(a).parent_ids||[]).some(id=>familyOf(b).parent_ids?.includes(id));
function historyFor(a,b,kind,topic){
  if(kind==='Partner')return 'Shared everyday decisions and small, dependable gestures bring them together; they would like to spend more time with each other.';
  if(kind==='Family')return a.age<18||b.age<18?'Shared meals, everyday help, and gradually becoming more independent shape this family.':'Family offers support, while each person also wants their own choices to be taken seriously.';
  if(kind==='Classmate')return 'They know each other from school and have helped one another with a task.';
  if(kind==='Coworker')return 'They have worked through a difficult task together, though their working styles do not always match.';
  if(kind==='Friend')return topic?'Repeated encounters and a shared interest in '+interestLabel(topic)+' have helped them grow closer.':'They became friends through everyday encounters and listen to one another.';
  return 'They know each other from around the neighborhood; a small act of neighborly help made it easier to meet.';
}
// Bounded buckets/window searches: no population-wide all-to-all initialization.
export function weaveSocial(people,placeList,identities,{seed=73,existing=false}={}){
  const places=placeList instanceof Map?placeList:new Map(placeList.map(p=>[p.id,p])),byId=new Map(people.map(p=>[p.id,p]));
  const buckets=new Map(),group=(key,p)=>{if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(p);};
  for(const p of people){
    p.relations ||= {};const n=neighborhoodOf(p,places),identity=identities[n?.id];
    if(!p.profile.social){const r=rng(seed+':motive:'+(p.profile.seed_key||p.seed_key)),m=motives[Math.floor(r()*motives.length)];
      p.profile.social={version:SOCIAL_VERSION,motive:m[0],wish:p.age<3?'Wants closeness, safety, and the freedom to explore through play.':p.age<12?['Wants to make friends and try new things together.','Wants to make something of their own and have support along the way.'][Math.floor(r()*2)]:m[1],sensitivity:p.age<12?'Needs dependable caregivers and age-appropriate freedom.':m[2],background:p.age<18?'Is finding their place among family, learning, and friendships.':p.age>=66?'Has lived through many changes and wants to share what they have learned without being defined only by the past.':['Grew up here and hopes to find new possibilities in familiar routines.','Slowly built a circle of familiar people after moving here.','Learned to value small, dependable gestures after a difficult period in life.'][Math.floor(r()*3)],origin:existing?'supplemental_procedural_background':'procedural_initialization'};
      if(existing&&p.biography_mode==='written')Object.assign(p.profile.social,{wish:'Personal wishes are drawn from the written biography and the Sim’s own thoughts.',sensitivity:'Personal boundaries and close relationships are understood from the Sim’s own perspective.',background:'The written biography and lived events remain the foundation.'});
    }
    if(n)p.profile.neighborhood={id:n.id,name:n.name,...identity};
    const ageBand=p.age<6?'small':p.age<12?'child':p.age<18?'teen':'adult';
    if(n)group('home:'+n.id+':'+ageBand,p);
    if(workOf(p)&&p.age>=6)group('work:'+workOf(p)+':'+ageBand,p);
    if(n&&p.age>=6)for(const interest of new Set(p.profile.interests))group('interest:'+n.id+':'+ageBand+':'+interest,p);
  }
  const link=(a,b,kind,topic=null)=>{
    if(a.id===b.id||a.age<3||b.age<3)return;
    const family=a.household_id===b.household_id||kin(a,b),prior=a.relations[b.id];
    // Existing lived ties keep every numeric value and evidence ID.
    if(!prior&&!family&&(Object.keys(a.relations).length>=12||Object.keys(b.relations).length>=12))return;
    const r=rng(seed+':tie:'+ [a.profile.seed_key||a.seed_key,b.profile.seed_key||b.seed_key].sort().join(':'));
    const tension=family?(r()<.22?.10:0):kind==='Coworker'&&r()<.24?.12:kind==='Neighbor'&&r()<.15?.07:0;
    const history=existing&&(a.biography_mode==='written'||b.biography_mode==='written')?'This relationship is an initial connection; specific shared experiences come only from the biographies and personal logs.':historyFor(a,b,kind,topic),bond=kind==='Friend'?.56:kind==='Classmate'?.40:kind==='Coworker'?.34:.25;
    for(const [viewer,target] of [[a,b],[b,a]]){
      let rel=viewer.relations[target.id];
      if(!rel)rel=viewer.relations[target.id]={kind,closeness:bond+r()*.08,trust:.38+r()*.20,respect:.48,attraction:0,tension,layers:{friendship:{score:bond,status:kind==='Friend'?'established':'developing'},...(kind==='Coworker'?{coworker:{score:.5,status:'shared_workplace'}}:{})}};
      if(!rel.background){rel.background={source:existing?'supplemental_procedural_background':'procedural_initialization',label:kind,sharedHistory:history,topic,thread:tension?'Reliability and personal space are sensitive topics.':'Wants to keep the connection active in everyday life.'};if(!existing&&family)rel.tension=Math.max(rel.tension||0,tension);}
      const contexts=rel.background.contexts ||= [rel.background.label];if(!contexts.includes(kind))contexts.push(kind);
      if(!existing&&kind==='Partner'){rel.closeness=Math.max(rel.closeness,.60+r()*.15);rel.trust=Math.max(rel.trust,.62+r()*.12);}
      if(!existing&&kind==='Friend'&&!family){rel.kind='Friend';rel.background.label=kind;rel.background.sharedHistory=history;rel.background.topic=topic;rel.closeness=Math.max(rel.closeness,bond);rel.trust=Math.max(rel.trust,.48);rel.layers||={};rel.layers.friendship={score:.6,status:'established'};}
    }
  };
  for(const p of people)for(const id of Object.keys(p.relations)){const other=byId.get(id);if(other&&(p.household_id===other.household_id||kin(p,other)))link(p,other,familyOf(p).partner_id===other.id?'Partner':'Family');}
  for(const [key,members] of buckets)for(let i=0;i<members.length;i++){
    const a=members[i];for(let distance=1;distance<=3;distance++){
      const b=members[(i+distance)%members.length];if(b===a||b.household_id===a.household_id)continue;
      if(a.age<18&&b.age<18&&Math.abs(a.age-b.age)>4)continue;
      const shared=a.profile.interests.find(t=>b.profile.interests.includes(t)),kind=key.startsWith('work:')?(a.age<18?'Classmate':'Coworker'):key.startsWith('interest:')?'Friend':'Neighbor';
      link(a,b,kind,shared);break;
    }
  }
  return people;
}
export function socialBackground(p,byId){
  const ties=Object.entries(p.relations).filter(([id,r])=>byId.has(id)&&r.background).sort((a,b)=>(b[1].closeness||0)-(a[1].closeness||0)).slice(0,3);
  return `${p.profile.social.background} ${p.profile.social.wish} ${p.profile.social.sensitivity} ${ties.map(([id,r])=>`${byId.get(id).name}: ${r.background.sharedHistory}`).join(' ')}`;
}
export function socialPerspective(p){
  const social=p.profile.social,englishPlaceholder=typeof social?.wish==='string'&&social.wish.startsWith('Personal wishes are drawn from'),legacyGermanPlaceholder=typeof social?.wish==='string'&&social.wish.startsWith('Die persönlichen Wünsche ergeben sich');
  if(!social||p.biography_mode!=='written'||(!englishPlaceholder&&!legacyGermanPlaceholder))return social;
  // Use the Sim's already-written words, without inferring a new life history.
  const sentences=(String(p.state?.thought||'')+' '+String(p.biography||'')).match(/[^.!?]+[.!?]?/g)||[];
  const wish=sentences.map(s=>s.trim()).find(s=>s.length<=400&&(/\b(want(?:s|ed|ing)?|wish(?:es|ed)?|long(?:s|ed|ing)?|need(?:s|ed|ing)?|aspir(?:e|es|ed|ing))\b/i.test(s)||/\b(möchte|wünsch\w*|sehn\w*|brauche|Wunsch|Bestreben)\b/i.test(s)));
  return wish?{...social,wish,wishSource:/[äöüÄÖÜß]/i.test(wish)?'eigene Gedanken und ausgearbeitete Biografie':'the Sim’s own thoughts and written biography'}:social;
}
export function personalSocialContext(p,town){return {neighborhood:p.profile.neighborhood,social:socialPerspective(p),relationships:Object.entries(p.relations).sort((a,b)=>(b[1].closeness||0)-(a[1].closeness||0)).slice(0,12).map(([id,r])=>({id,name:town.byId.get(id)?.name,kind:r.background?.label||r.kind,closeness:r.closeness,trust:r.trust,tension:r.tension,background:r.background,lastInteraction:r.last_interaction}))};}
export function socialDestination(town,p,time){
  const hour=time/3600%24,day=Math.floor(time/86400),weekday=day%7<5;
  if(p.age<12||hour<(weekday?17:14)||hour>=19)return null;
  // A mutual plan has one host/destination so friends do not swap houses forever.
  const candidates=Object.entries(p.relations).filter(([id,r])=>{const b=town.byId.get(id);return b&&b.age>=12&&b.household_id!==p.household_id&&r.closeness>=.35&&r.trust>=.3&&(r.tension||0)<.35;}).sort(([a],[b])=>a.localeCompare(b));
  for(const [id] of candidates){const b=town.byId.get(id),keys=[p.profile.seed_key,b.profile.seed_key].sort(),draw=rng(town.world.seed+':meet:'+keys.join(':')+':'+day);
    if(draw()>.25)continue;
    const host=p.id<b.id?p:b,home=host.profile.home.living;const guardian=(host.profile.family.parent_ids||[]).map(id=>town.byId.get(id)).find(q=>q?.age>=18);
    if(host.age<18&&(!guardian||!Object.values(guardian.profile.home).includes(guardian.state.location_id)))continue;
    // No unavailable/busy/in-transit household or private room is a visit target.
    if(!Object.values(host.profile.home).includes(host.state.location_id)&&host.id!==p.id)continue;
    if(['sleep','toilet','shower'].includes(host.state.action?.kind)||p.state.needs.fatigue>.7)continue;
    // Both peers must select this same plan; a different earlier plan takes priority.
    const earlier=Object.entries(b.relations).filter(([other,r])=>other!==p.id&&town.byId.get(other)?.age>=12&&town.byId.get(other)?.household_id!==b.household_id&&r.closeness>=.35&&r.trust>=.3&&(r.tension||0)<.35).sort(([a],[b])=>a.localeCompare(b));
    if(earlier.some(([other])=>other.localeCompare(p.id)<0&&rng(town.world.seed+':meet:'+ [b.profile.seed_key,town.byId.get(other).profile.seed_key].sort().join(':')+':'+day)()<=.25))continue;
    return home;
  }
  const n=p.profile.neighborhood;
  if(n&&rng(town.world.seed+':ritual:'+n.id+':'+day)()<.4&&hour>=17&&hour<18){return [...town.places.values()].find(q=>q.kind==='room'&&q.purpose.includes(n.meetingPurpose))?.id||null;}
  return null;
}
export function conversationDescription(a,b,category,outcome,remote=false){
  const topic=a.profile.interests.find(t=>b.profile.interests.includes(t)),what={greet:'greet one another',small_talk:'catch up on everyday news',share_interest:'talk about '+(topic?interestLabel(topic):'their interests'),offer_help:'discuss an offer of support',ask_help:'talk about a request for help',ask_advice:'ask for advice',tell_joke:'try to make each other laugh',compliment:'exchange a compliment',apologize:'offer an apology',check_in:'ask how the other is doing',confide:'have a private conversation',invite_activity:'discuss doing something together',celebrate:'share their excitement',play_together:'play a game together',coordinate_work:'coordinate at work',set_boundary:'talk about personal boundaries',gossip:'exchange rumors whose accuracy is unknown',reconcile:'try to work through a strain',comfort:'offer comfort',deep_talk:'make time for a personal conversation',argue:'clash over different expectations',debate:'discuss differing opinions',teen_romantic_talk:'talk gently about an age-appropriate first crush',teen_date:'go on a harmless, age-appropriate date and have a pleasant conversation',adult_private_intimacy:'share a private, consensual affectionate moment; details remain private',flirt:'flirt gently',ask_date:'bring up an invitation to a date',express_affection:'show affection for one another',phone_call:'call to see how the other is doing',ask_favor:'talk about a small favor',collaborate_project:'develop an idea together',share_news:'share news',make_plans:'make plans together',invite_to_dinner:'discuss an invitation to dinner',tell_story:'tell a story',tease:'tease each other playfully',challenge:'challenge each other to a friendly contest',persuade:'try to win each other over to an idea',provoke:'provoke one another with a pointed remark',undermine:'criticize their shared work'}[category]||'talk with one another';
  return `${a.name} and ${b.name} ${remote&&category!=='phone_call'?'talk by phone and ':''}${what}. ${outcome==='declined'?'The invitation is declined, and the boundary is respected.':'Both take part in the exchange.'}`;
}
export function socialInterpretation(p,event){
  if(event.facts.outcome==='declined')return p.profile.social?.motive==='belonging'?'This touches my wish to feel included. Maybe the timing was wrong; I can’t know for sure.':'The other person does not want this contact right now. I respect that, even though I feel disappointed.';
  const category=event.facts.category;
  if(['argue','provoke','undermine'].includes(category))return 'We clashed. I don’t feel fully understood, and I’d like to talk more clearly and calmly later.';
  if(category==='gossip')return 'These are unverified claims. I cannot tell from them what actually happened.';
  if(['apologize','reconcile','set_boundary'].includes(category))return 'The conversation makes our boundaries and wishes clearer. Trust still takes time.';
  if(['offer_help','ask_help','comfort','check_in'].includes(category))return 'It feels good to have support and attention; I don’t have to carry everything alone.';
  return p.profile.social?.motive==='recognition'?'I’m glad my thoughts are being heard.':'This shared moment makes me feel a little more connected; I don’t know how the other person experienced it.';
}
