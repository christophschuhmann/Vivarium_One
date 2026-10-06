import {rng} from './random.js';
export {rng} from './random.js';
import {nameNeighborhoods} from './neighborhoods.js';
import {weaveSocial,socialBackground,interestLabel} from './social.js';
import {searchAssets} from './library.js';
import {openSims,openSimsCatalog} from './open_sims.js';
const names={female:['Fiona','Lea','Mira','Hana','Amira','Nora','Jana','Emma','Priya','Lina','Maya','Sofia','Aiko','Ella','Clara'],male:['Jonas','Noah','Ben','Elias','Kenji','Samir','Lukas','Ravi','Theo','Alex','Leon','Luis','Omar','Paul','Felix']};
const surnames=['Weber','Chen','Keller','Patel','Diaz','Okafor','Sato','Becker','Ali','Santos','Fischer','Tanaka','Singh','Morgan','Schmidt'];
const jobs=['Teacher','Illustrator','Programmer','Gardener','Physician','Baker','Civic planner','Carpenter','Bookseller','Researcher'];
const interests=['reading','cooking','walking','craft','gardening','socializing','music'];
const heritage=['white','white','white','white','black','latino','japanese','indian'];
const pick=(a,r)=>a[Math.floor(r()*a.length)];
export async function generateTown(worldId,{population=10,seed=73,title='Lindenstadt',neighborhoodOffset=0,reservedNames=[]}={}) {
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
  let index=0;
  while(people.length<population) {
    const requested=[3,4,2,1,1,2,3,4][index%8],count=Math.min(requested,population-people.length);
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
      const gender=k===0?'female':k===1?'male':r()<.5?'female':'male',age=k<2?(count===1&&index%5===3?18+Math.floor(r()*8):baseAge+(k===1?2:0)):Math.min(baseAge-20,index%4===1?1+Math.floor(r()*5):6+Math.floor(r()*12));
      const job=age<6?'Kindergarten child':age<18?'Pupil':age>=66?'Retired':pick(jobs,r),ethnicity=pick(heritage,r);
      const workplace=job==='Pupil'?civic.school:job==='Kindergarten child'?civic.daycare:job==='Teacher'?civic.school:job==='Researcher'?civic.campus:job==='Physician'?civic.clinic:job==='Carpenter'?civic.fire:job==='Civic planner'?civic.townhall:['Bookseller','Illustrator'].includes(job)?civic.library:['Baker','Gardener'].includes(job)?civic.cafe:job==='Retired'?null:civic.townhall;
      const asset=searchAssets(age+' '+gender,{kind:'character',age,gender,heritage:ethnicity})[Math.floor(r()*Math.min(2,5))] || searchAssets('',{kind:'character',age,gender})[0];
      const id=worldId+'_s_'+people.length,person={id,world_id:worldId,name:pick(names[gender],r)+' '+last,age,gender,household_id:home,asset_id:asset?.id || null,colour:`hsl(${Math.floor(r()*360)} 64% 46%)`,anchored:people.length<2?1:0,
        seed_key:'sim-'+people.length,profile:{job,interests:[pick(interests,r),pick(interests,r)]},family:{parent_ids:[],partner_id:null},workplace_id:workplace,
        home:rooms,preferences:Object.fromEntries(interests.map(key=>[key,.2+r()*.6])),needs:Object.fromEntries(Object.keys(catalog.rates).map(key=>[key,.1+r()*.3])),relations:{}};
      if(workplace && catalog.jobStations[job]){const place=places.find(p=>p.id===workplace);if(!place.affordances.includes(catalog.jobStations[job][0]))place.affordances.push(catalog.jobStations[job][0]);}
      members.push(person);people.push(person);
    }
    if(members.length>=2){members[0].family.partner_id=members[1].id;members[1].family.partner_id=members[0].id;members[0].family.relationship_status=members[1].family.relationship_status='married';}
    for(const person of members.slice(2))person.family.parent_ids=members.slice(0,2).map(p=>p.id);
    households.push({id:home,members:members.map(p=>p.id),rooms});index++;
  }
  const identities=nameNeighborhoods(places,seed,{offset:neighborhoodOffset,reserved:reservedNames});
  const initialized=await openSims('initialize',{people,seed});
  weaveSocial(initialized,places,identities,{seed});
  const byId=new Map(initialized.map(p=>[p.id,p]));
  const groups=new Map();for(const p of initialized){if(!groups.has(p.household_id))groups.set(p.household_id,[]);groups.get(p.household_id).push(p);}
  for(const person of initialized) {
    const relatives=groups.get(person.household_id).filter(p=>p.id!==person.id).map(p=>p.name);
    person.biography=`${person.name} ist ${person.age} Jahre alt und ${person.profile.job==='Retired'?'im Ruhestand':person.profile.job==='Pupil'?'geht zur Schule':person.profile.job==='Kindergarten child'?'besucht den Kindergarten':'arbeitet als '+person.profile.job}. ${relatives.length?'Lebt mit '+relatives.join(', ')+' im gemeinsamen Haushalt.':'Lebt allein und pflegt Kontakte in der Nachbarschaft.'} Zuhause ist ${person.profile.neighborhood?.name||'die Stadt'}. Interessiert sich für ${[...new Set(person.profile.interests)].map(interestLabel).join(' und ')}. ${socialBackground(person,byId)} Ziel: ${person.psychology.ambitions.map(a=>a.title).join('; ')}.`;
    person.biography_mode=person.anchored?'written_pending':'procedural';
    person.location_id=person.home.kitchen;
    person.state={needs:person.needs,psychology:person.psychology,career:person.career,location_id:person.location_id,action:null,route:null,goal:null,mood:'zuversichtlich',thought:'Ein neuer Tag beginnt.',last_social:-99999};
  }
  return {places,edges,people:initialized,households,city,seed,catalog,identities};
}
