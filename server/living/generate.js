import {BENNINGTON,benningtonHouseholds,benningtonName,benningtonHeritage,localizeBennington} from './bennington.js';
import {rng} from './random.js';
export {rng} from './random.js';
import {nameNeighborhoods} from './neighborhoods.js';
import {weaveSocial,socialBackground,interestLabel} from './social.js';
import {searchAssets} from './library.js';
import {sampleOccupation,refreshBiographyPronouns} from './occupations.js';
import {characterCandidates} from './asset-catalog.js';
import {openSims,openSimsCatalog} from './open_sims.js';
import {prepareMind,evaluateMind} from './cognition.js';
import {expandFacilities,assignFacilities} from './facilities.js';
const names={female:['Fiona','Lea','Mira','Hana','Amira','Nora','Jana','Emma','Priya','Lina','Maya','Sofia','Aiko','Ella','Clara'],male:['Jonas','Noah','Ben','Elias','Kenji','Samir','Lukas','Ravi','Theo','Alex','Leon','Luis','Omar','Paul','Felix']};
const surnames=['Weber','Chen','Keller','Patel','Diaz','Okafor','Sato','Becker','Ali','Santos','Fischer','Tanaka','Singh','Morgan','Schmidt'];
const jobs=['Teacher','Illustrator','Programmer','Gardener','Physician','Baker','Civic planner','Carpenter','Bookseller','Researcher'];
const interests=['reading','cooking','walking','craft','gardening','socializing','music'];
const heritage=['white','white','white','white','black','latino','japanese','indian'];
const pick=(a,r)=>a[Math.floor(r()*a.length)];
export async function generateTown(worldId,{population=10,seed=73,title='Lindenstadt',neighborhoodOffset=0,reservedNames=[],scenario}={}) {
  const isBennington=scenario==='bennington',cohorts=isBennington?benningtonHouseholds(population,seed):null;
  const r=rng(seed),catalog=await openSimsCatalog(),places=[],edges=[],people=[],households=[],childCounts=new Map();
  const add=(key,parent,name,kind,purpose,affordances=[],extra={})=>{
    const id=worldId+'_l_'+key,index=childCounts.get(parent)||0;childCounts.set(parent,index+1);
    const asset=searchAssets(purpose+' '+name)[0];
    const place={id,world_id:worldId,parent_id:parent,name,kind,purpose,asset_id:asset?.id || null,x:90+index%6*190,y:80+Math.floor(index/6)*165,capacity:20,anchored:0,landmark:0,affordances,...extra};places.push(place);return id;
  };
  const connect=(a,b,seconds)=>{edges.push({from_id:a,to_id:b,seconds},{from_id:b,to_id:a,seconds});};
  const country=add('country',null,'Vivarium','country','modern country');
  const city=add('city',country,title,'city','small town quiet shopping street park');
  const districts=[],neighborhoods=[];
  const ensureNeighborhood=index=>{
    while(neighborhoods.length<=index){const i=neighborhoods.length,d=Math.floor(i/3);
      if(!districts[d])districts[d]=add('district'+d,city,['Nordviertel','Gartenviertel','Flussviertel'][d%3]+' '+(d+1),'district','residential neighborhood modern small town street');
      const id=add('neighborhood'+i,districts[d],'Nachbarschaft '+(i+1),'neighborhood','quiet residential street houses trees', ['street','bench'],{capacity:500});neighborhoods.push(id);
      if(i)connect(neighborhoods[i-1],id,180);
    }return neighborhoods[index];
  };
  ensureNeighborhood(0);
  const civic={};
  for(const [key,name,purpose,objects] of [
    ['school','Schule','school classroom children',['school_student_chair','teacher_station','desk','bookshelf','sink']],
    ['daycare','Kindergarten','children playroom kindergarten',['kindergarten_mat','table','sofa','sink']],
    ['campus','Campus & Labor','university campus laboratory',['lab_bench','desk','bookshelf']],
    ['library','Bibliothek','public library reading room',['bookshelf','desk','sink']],
    ['townhall','Rathaus','town hall office civic',['townhall_desk','desk','sink']],
    ['clinic','Praxis','hospital medical clinic',['clinic_station','desk','sink']],
    ['fire','Feuerwache','fire station workshop',['fire_station','desk','sink']],
    ['park','Park','town park garden trees playground',['park_marker','bench','planter','fountain','community_table']],
    ['cafe','Café & Läden','shopping street cafe bakery',['cafe_counter','shop_counter','table','sink']]]) {
    const building=add(key,city,name,'building',purpose,[],{landmark:1,capacity:150});
    civic[key]=add(key+'room',building,name+' · Hauptraum','room',purpose,objects,{capacity:key==='school'?180:key==='daycare'?80:key==='park'?500:100});
    connect(neighborhoods[0],building,120);connect(building,civic[key],30);
  }
  let index=0;const usedSimNames=new Set();
  while(people.length<population) {
    const requested=cohorts?.[index]?.ages.length||[3,4,2,1,1,2,3,4][index%8],count=Math.min(requested,population-people.length);
    const street=ensureNeighborhood(Math.floor(index/24)),last=pick(surnames,r),home=add('home'+index,street,'Haus '+(index+1)+' · '+last,'building','family house residential exterior entrance',[],{capacity:8});
    connect(street,home,45);
    const rooms={};
    for(const [key,name,purpose,objects,cap] of [
      ['living','Wohnzimmer','cozy family living room',['sofa','table','bookshelf','desk'],8],
      ['kitchen','Küche','family kitchen breakfast',['fridge','counter','sink','table'],5],
      ['bath','Bad','family bathroom shower',['toilet','shower','sink'],1],
      ['bed','Schlafzimmer','family bedroom double bed',['bed','desk','wardrobe'],count+1]]) {
      rooms[key]=add('home'+index+key,home,name+' · Haus '+(index+1),'room',purpose,objects,{capacity:cap});connect(home,rooms[key],15);
    }
    const seniors=count<=2&&index%7===5,baseAge=seniors?68+Math.floor(r()*15):26+Math.floor(r()*25),members=[];
    for(let k=0;k<count;k++) {
      const gender=isBennington?(k===1&&(cohorts?.[index]?.parents||0)>=2?(rng(seed+':couple:'+index)()<.1?members[0].gender:members[0].gender==='female'?'male':'female'):(rng(seed+':gender:'+people.length)()<.514?'female':'male')):(k===0?'female':k===1?'male':r()<.5?'female':'male'),age=cohorts?.[index]?.ages[k]??(k<2?(count===1&&index%5===3?18+Math.floor(r()*8):baseAge+(k===1?2:0)):Math.min(baseAge-20,index%4===1?1+Math.floor(r()*5):6+Math.floor(r()*12)));
      const legacyJob=age<6?'Kindergarten child':age<18?'Pupil':age>=66?'Retired':pick(jobs,r);
      const generatedJob=isBennington&&age>=18&&age<66?sampleOccupation(age,seed,'sim-'+people.length):legacyJob;
      // A separate deterministic draw preserves the existing world's identity
      // stream. New young adults can be students; qualified careers requiring
      // many years of study cannot start with a fictitious finished degree at 18.
      const tooYoungForDegree=(generatedJob==='Physician' && age<25)||(['Teacher','Researcher'].includes(generatedJob)&&age<22);
      const job=age>=18&&age<24&&(tooYoungForDegree || rng(seed+':study-phase:'+people.length)()<.4)?'Student':generatedJob,ethnicity=isBennington?benningtonHeritage(people.length,seed):pick(heritage,r);
      const workplace=job==='Pupil'?civic.school:job==='Kindergarten child'?civic.daycare:job==='Teacher'?civic.school:['Researcher','Student'].includes(job)?civic.campus:job==='Physician'?civic.clinic:job==='Carpenter'?civic.fire:job==='Civic planner'?civic.townhall:['Bookseller','Illustrator'].includes(job)?civic.library:['Baker','Gardener'].includes(job)?civic.cafe:job==='Retired'?null:civic.townhall;
      const librarySkins=characterCandidates({age,gender,heritage:ethnicity});const candidates=librarySkins.length?librarySkins:searchAssets('',{kind:'character',age,gender,heritage:ethnicity});const asset=pick(candidates,r);
      const id=worldId+'_s_'+people.length,person={id,world_id:worldId,name:isBennington?benningtonName(gender,people.length,index,seed):pick(names[gender],r)+' '+last,age,gender,household_id:home,asset_id:asset?.id || null,colour:`hsl(${Math.floor(r()*360)} 64% 46%)`,anchored:people.length<2?1:0,
        seed_key:'sim-'+people.length,profile:{job,pronouns:gender==='female'?'she/her':'he/him',...(isBennington?{locale:'en',heritage:ethnicity}:{}),interests:[pick(interests,r),pick(interests,r)]},family:{parent_ids:[],partner_id:null},workplace_id:workplace,
        home:rooms,preferences:Object.fromEntries(interests.map(key=>[key,.2+r()*.6])),needs:Object.fromEntries(Object.keys(catalog.rates).map(key=>[key,.1+r()*.3])),relations:{}};
      if(workplace && catalog.jobStations[job]){const place=places.find(p=>p.id===workplace);if(!place.affordances.includes(catalog.jobStations[job][0]))place.affordances.push(catalog.jobStations[job][0]);}
      if(isBennington){let attempt=0;while(usedSimNames.has(person.name)&&attempt<80){attempt++;person.name=benningtonName(gender,people.length+attempt*population,index,seed);}if(usedSimNames.has(person.name)){const parts=person.name.split(" ");person.name=parts[0]+" "+String.fromCharCode(65+Math.floor(people.length/26)%26)+String.fromCharCode(65+people.length%26)+". "+parts.slice(1).join(" ");}usedSimNames.add(person.name);}
      members.push(person);people.push(person);
    }
    const parentCount=cohorts?.[index]?.parents??Math.min(2,members.length);
    if(parentCount>=2){members[0].family.partner_id=members[1].id;members[1].family.partner_id=members[0].id;members[0].family.relationship_status=members[1].family.relationship_status='married';}
    for(const person of members.slice(parentCount))person.family.parent_ids=members.slice(0,parentCount).map(p=>p.id);
    households.push({id:home,members:members.map(p=>p.id),rooms});index++;
  }
  const identities=nameNeighborhoods(places,seed,{offset:neighborhoodOffset,reserved:reservedNames});
  expandFacilities(places,edges);assignFacilities(people,places,{seed});
  if(isBennington)localizeBennington(places,edges,people,identities,worldId);
  const initialized=await openSims('initialize',{people,seed});
  weaveSocial(initialized,places,identities,{seed});
  const byId=new Map(initialized.map(p=>[p.id,p]));
  const groups=new Map();for(const p of initialized){if(!groups.has(p.household_id))groups.set(p.household_id,[]);groups.get(p.household_id).push(p);}
  for(const person of initialized) {
    const relatives=groups.get(person.household_id).filter(p=>p.id!==person.id).map(p=>p.name);
    person.biography=`${person.name} ist ${person.age} Jahre alt und ${person.profile.job==='Retired'?'im Ruhestand':person.profile.job==='Student'?'studiert':person.profile.job==='Pupil'?'geht zur Schule':person.profile.job==='Kindergarten child'?'besucht den Kindergarten':'arbeitet als '+person.profile.job}. ${relatives.length?'Lebt mit '+relatives.join(', ')+' im gemeinsamen Haushalt.':'Lebt allein und pflegt Kontakte in der Nachbarschaft.'} Zuhause ist ${person.profile.neighborhood?.name||'die Stadt'}. Interessiert sich für ${[...new Set(person.profile.interests)].map(interestLabel).join(' und ')}. ${socialBackground(person,byId)} Ziel: ${person.psychology.ambitions.map(a=>a.title).join('; ')}.`;
    if(isBennington){person.biography=`${person.name} is ${person.age} years old. ${person.profile.job==='Retired'?'They are retired.':person.profile.job==='Pupil'?'They attend school.':person.profile.job==='Kindergarten child'?'They receive early childhood care.':person.profile.job==='Student'?'They study at college.':'They work as a '+person.profile.job+'.'} ${relatives.length?'Their household includes '+relatives.join(', ')+'.':'They live independently.'} Home is in ${person.profile.neighborhood?.name||'Bennington'}. They enjoy ${[...new Set(person.profile.interests)].join(' and ')}. ${socialBackground(person,byId)} Their ambitions include ${person.psychology.ambitions.map(a=>a.title).join("; ")}. This is a fictional initial background, not a record of events already simulated.`;}
    if(isBennington)person.biography=refreshBiographyPronouns(person);
    if(person.age>=18){const partner=byId.get(person.family.partner_id),draw=rng(seed+':partner-preference:'+person.seed_key)();person.profile.romanticPreferences={genders:partner?[partner.gender]:draw<.9?[person.gender==='female'?'male':'female']:draw<.97?[person.gender]:['female','male'],source:'initialized_individual_preference'};}
    person.biography_mode=person.anchored?'written_pending':'procedural';
    person.location_id=person.home.kitchen;
    person.state={needs:person.needs,psychology:person.psychology,career:person.career,location_id:person.location_id,action:null,route:null,goal:null,mood:'zuversichtlich',thought:isBennington?'A new day begins. I want to make time for my responsibilities and someone I care about.':'Ein neuer Tag beginnt.',last_social:-99999};
    prepareMind(person,27000,{seed,newLife:true});evaluateMind(person,27000,catalog);
  }
  return {places,edges,people:initialized,households,city,seed,catalog,identities,...(isBennington?{scenario:BENNINGTON}:{})};
}
