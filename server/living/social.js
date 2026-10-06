import {rng} from './random.js';
import {SOCIAL_VERSION} from './neighborhoods.js';
const interests={reading:'Lesen',cooking:'Kochen',walking:'Spaziergänge',craft:'Handwerk',gardening:'Gärtnern',socializing:'Geselligkeit',music:'Musik'};
export const interestLabel=key=>interests[key]||key;
const motives=[
  ['belonging','Möchte dazugehören, ohne sich ständig beweisen zu müssen.','Achtet besonders darauf, ob andere Zeit für einen Kontakt haben.'],
  ['care','Möchte für vertraute Menschen da sein und selbst Hilfe annehmen lernen.','Fragt nach, wenn jemand Unterstützung braucht.'],
  ['recognition','Wünscht sich Anerkennung für die eigenen Ideen und Mühen.','Freut sich über echtes Interesse, reagiert empfindlich auf Übergehen.'],
  ['stability','Wünscht sich verlässliche Beziehungen und einen ruhigeren Alltag.','Braucht nach Trubel etwas Zeit für sich.'],
  ['independence','Möchte eigene Entscheidungen treffen und trotzdem verbunden bleiben.','Versucht, freundlich Grenzen zu setzen.'],
  ['curiosity','Möchte etwas Neues lernen und Erfahrungen mit anderen teilen.','Kommt über gemeinsame Interessen leicht ins Gespräch.']
];
export function neighborhoodOf(p,places){let at=p.household_id;for(let i=0;at&&i<16;i++){const place=places.get(at);if(place?.kind==='neighborhood')return place;at=place?.parent_id;}return null;}
const familyOf=p=>p.profile.family||p.family||{};
const workOf=p=>p.profile.workplace_id||p.workplace_id;
const kin=(a,b)=>familyOf(a).parent_ids?.includes(b.id)||familyOf(b).parent_ids?.includes(a.id)||(familyOf(a).parent_ids||[]).some(id=>familyOf(b).parent_ids?.includes(id));
function historyFor(a,b,kind,topic){
  if(kind==='Partner')return 'Gemeinsame Alltagsentscheidungen und verlässliche kleine Gesten verbinden beide; Zeit füreinander bleibt ein Wunsch.';
  if(kind==='Family')return a.age<18||b.age<18?'Gemeinsame Mahlzeiten, Hilfe im Alltag und das schrittweise Selbstständigwerden prägen die Familie.':'Die Familie gibt Rückhalt; zugleich möchte jeder mit eigenen Entscheidungen ernst genommen werden.';
  if(kind==='Classmate')return 'Kennen sich aus dem Schulalltag und haben sich bei einer Aufgabe gegenseitig geholfen.';
  if(kind==='Coworker')return 'Haben schon gemeinsam eine schwierige Aufgabe bewältigt; ihre Arbeitsweisen sind nicht immer gleich.';
  if(kind==='Friend')return topic?'Aus wiederholten Begegnungen und dem gemeinsamen Interesse an '+interestLabel(topic)+' ist Vertrautheit gewachsen.':'Haben sich bei alltäglichen Begegnungen angefreundet und hören einander zu.';
  return 'Kennen sich von Begegnungen in ihrer Wohngegend; eine kleine nachbarschaftliche Hilfe hat den ersten Kontakt erleichtert.';
}
// Bounded buckets/window searches: no population-wide all-to-all initialization.
export function weaveSocial(people,placeList,identities,{seed=73,existing=false}={}){
  const places=placeList instanceof Map?placeList:new Map(placeList.map(p=>[p.id,p])),byId=new Map(people.map(p=>[p.id,p]));
  const buckets=new Map(),group=(key,p)=>{if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(p);};
  for(const p of people){
    p.relations ||= {};const n=neighborhoodOf(p,places),identity=identities[n?.id];
    if(!p.profile.social){const r=rng(seed+':motive:'+(p.profile.seed_key||p.seed_key)),m=motives[Math.floor(r()*motives.length)];
      p.profile.social={version:SOCIAL_VERSION,motive:m[0],wish:p.age<3?'Wünscht sich Nähe, Sicherheit und spielerisches Entdecken.':p.age<12?['Möchte Freunde finden und gemeinsam Neues ausprobieren.','Möchte selbst etwas schaffen und dabei Unterstützung bekommen.'][Math.floor(r()*2)]:m[1],sensitivity:p.age<12?'Braucht verlässliche Bezugspersonen und altersgerechte Freiräume.':m[2],background:p.age<18?'Findet zwischen Familie, Lernen und Freundschaften den eigenen Platz.':p.age>=66?'Hat viele Veränderungen erlebt und möchte Erfahrungen teilen, ohne nur auf die Vergangenheit reduziert zu werden.':['Ist hier aufgewachsen und möchte dem vertrauten Alltag neue Möglichkeiten geben.','Hat sich nach einem Umzug langsam ein eigenes Netz vertrauter Menschen aufgebaut.','Hat nach einer anstrengenden Lebensphase gelernt, kleine verlässliche Gesten zu schätzen.'][Math.floor(r()*3)],origin:existing?'supplemental_procedural_background':'procedural_initialization'};
      if(existing&&p.biography_mode==='written')Object.assign(p.profile.social,{wish:'Die persönlichen Wünsche ergeben sich aus der ausgearbeiteten Biografie und den eigenen Gedanken.',sensitivity:'Persönliche Grenzen und vertraute Beziehungen werden aus der eigenen Perspektive betrachtet.',background:'Die ausgearbeitete Biografie und bereits erlebte Ereignisse bleiben maßgeblich.'});
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
    const history=existing&&(a.biography_mode==='written'||b.biography_mode==='written')?'Diese Beziehung ist als Ausgangskontakt angelegt; konkrete gemeinsame Erlebnisse ergeben sich ausschließlich aus Biografie und persönlichen Protokollen.':historyFor(a,b,kind,topic),bond=kind==='Friend'?.56:kind==='Classmate'?.40:kind==='Coworker'?.34:.25;
    for(const [viewer,target] of [[a,b],[b,a]]){
      let rel=viewer.relations[target.id];
      if(!rel)rel=viewer.relations[target.id]={kind,closeness:bond+r()*.08,trust:.38+r()*.20,respect:.48,attraction:0,tension,layers:{friendship:{score:bond,status:kind==='Friend'?'established':'developing'},...(kind==='Coworker'?{coworker:{score:.5,status:'shared_workplace'}}:{})}};
      if(!rel.background){rel.background={source:existing?'supplemental_procedural_background':'procedural_initialization',label:kind,sharedHistory:history,topic,thread:tension?'Verlässlichkeit und persönliche Freiräume sind ein empfindliches Thema.':'Möchte den Kontakt im Alltag lebendig halten.'};if(!existing&&family)rel.tension=Math.max(rel.tension||0,tension);}
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
  const social=p.profile.social;if(!social||p.biography_mode!=='written'||typeof social.wish!=='string'||!social.wish.startsWith('Die persönlichen Wünsche ergeben sich'))return social;
  // Use the Sim's already-written words, without inferring a new life history.
  const sentences=(String(p.state?.thought||'')+' '+String(p.biography||'')).match(/[^.!?]+[.!?]?/g)||[];
  const wish=sentences.map(s=>s.trim()).find(s=>s.length<=400&&/\b(möchte|wünsch\w*|sehn\w*|brauche|Wunsch|Bestreben)\b/i.test(s));
  return wish?{...social,wish,wishSource:'eigene Gedanken und ausgearbeitete Biografie'}:social;
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
  const topic=a.profile.interests.find(t=>b.profile.interests.includes(t)),what={greet:'begrüßen sich',small_talk:'tauschen Alltagsneuigkeiten aus',share_interest:'sprechen über '+(topic?interestLabel(topic):'ihre Interessen'),offer_help:'besprechen ein Angebot zur Unterstützung',ask_help:'sprechen über eine Bitte um Hilfe',ask_advice:'fragen nach Rat',tell_joke:'versuchen, den anderen zum Lachen zu bringen',compliment:'machen einander ein Kompliment',apologize:'sprechen eine Entschuldigung an',check_in:'fragen, wie es dem anderen geht',confide:'suchen ein vertrauliches Gespräch',invite_activity:'besprechen eine gemeinsame Unternehmung',celebrate:'teilen ihre Freude',play_together:'suchen ein gemeinsames Spiel',coordinate_work:'stimmen sich bei der Arbeit ab',set_boundary:'sprechen persönliche Grenzen an',gossip:'tauschen Gerüchte aus, deren Wahrheitsgehalt offen bleibt',reconcile:'versuchen, eine Spannung zu klären',comfort:'bieten Trost an',deep_talk:'nehmen sich Zeit für ein persönliches Gespräch',argue:'geraten über unterschiedliche Vorstellungen aneinander',debate:'diskutieren unterschiedliche Meinungen',flirt:'flirten behutsam',ask_date:'sprechen eine Einladung zu einem Date an',express_affection:'zeigen einander Zuneigung',phone_call:'erkundigen sich telefonisch nach dem anderen',ask_favor:'sprechen über eine kleine Gefälligkeit',collaborate_project:'entwickeln gemeinsam eine Idee',share_news:'erzählen sich Neuigkeiten',make_plans:'stimmen gemeinsame Pläne ab',invite_to_dinner:'besprechen eine Einladung zum Essen',tell_story:'erzählen eine Geschichte',tease:'ziehen einander spielerisch auf',challenge:'fordern einander zu einem kleinen Wettstreit heraus',persuade:'versuchen, einander für eine Idee zu gewinnen',provoke:'reizen einander mit einer zugespitzten Bemerkung',undermine:'sprechen kritisch über die gemeinsame Arbeit'}[category]||'sprechen miteinander';
  return `${a.name} und ${b.name} ${remote&&category!=='phone_call'?'telefonieren und ':''}${what}. ${outcome==='declined'?'Der Kontaktwunsch wird abgelehnt; die Grenze wird respektiert.':'Beide lassen sich auf diesen Austausch ein.'}`;
}
export function socialInterpretation(p,event){
  if(event.facts.outcome==='declined')return p.profile.social?.motive==='belonging'?'Das trifft meinen Wunsch dazuzugehören. Vielleicht war der Zeitpunkt ungünstig; ich weiß es nicht.':'Die andere Person möchte diesen Kontakt gerade nicht. Ich respektiere das, auch wenn ich enttäuscht bin.';
  const category=event.facts.category;
  if(['argue','provoke','undermine'].includes(category))return 'Wir sind aneinandergeraten. Ich fühle mich nicht ganz verstanden und möchte später klarer und ruhiger sprechen.';
  if(category==='gossip')return 'Das sind unbestätigte Behauptungen. Ich kann daraus nicht wissen, was tatsächlich passiert ist.';
  if(['apologize','reconcile','set_boundary'].includes(category))return 'Das Gespräch macht unsere Grenzen und Wünsche klarer. Vertrauen braucht trotzdem Zeit.';
  if(['offer_help','ask_help','comfort','check_in'].includes(category))return 'Es tut gut, dass Unterstützung und Aufmerksamkeit möglich sind; ich muss nicht alles allein tragen.';
  return p.profile.social?.motive==='recognition'?'Es freut mich, mit meinen Gedanken wahrgenommen zu werden.':'Der gemeinsame Moment gibt mir etwas Verbundenheit; wie die andere Person ihn erlebt, weiß ich nicht.';
}
