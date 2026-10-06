import {searchAssets} from './library.js';
import {rng} from './random.js';
const plans={
  'Schule':{main:'Klassenraum A',hall:'Schulflur',rooms:[['classb','Klassenraum B','school classroom desks books',['school_student_chair','teacher_station','desk','bookshelf'],180],['canteen','Schulmensa','school cafeteria dining room',['fridge','table','sink'],180],['staff','Lehrerzimmer','school staff room office',['teacher_station','desk','sofa','sink'],30],['yard','Schulhof','school playground outdoor garden',['park_marker','bench','community_table'],250]]},
  'Kindergarten':{main:'Gruppenraum',hall:'Garderobe & Flur',rooms:[['play','Spielzimmer','children playroom kindergarten toys',['kindergarten_mat','table','sofa'],80],['canteen','Kinderküche','kindergarten kitchen dining',['fridge','table','sink'],80],['yard','Spielgarten','kindergarten playground garden',['kindergarten_mat','park_marker','bench'],100]]},
  'Campus & Labor':{main:'Forschungslabor',hall:'Institutsflur',rooms:[['seminar','Seminarraum','university lecture seminar classroom',['desk','bookshelf','lab_bench'],100],['study','Arbeitsbibliothek','university library reading room',['bookshelf','desk','lab_bench'],100],['canteen','Campusmensa','university cafeteria dining',['fridge','table','sink'],150]]},
  'Bibliothek':{main:'Ausleihe & Lesesaal',hall:'Bibliotheksfoyer',rooms:[['quiet','Stiller Leseraum','public library quiet reading room',['bookshelf','desk','sofa'],60],['study','Lernraum','library study workspace',['desk','bookshelf'],80],['children','Kinderbibliothek','children library reading room',['bookshelf','table','sofa'],50]]},
  'Rathaus':{main:'Bürgerbüro',hall:'Rathausfoyer',rooms:[['council','Sitzungsraum','town hall meeting room',['townhall_desk','desk','table'],80],['office','Verwaltung','town hall office',['townhall_desk','desk'],80],['lounge','Personalraum','office staff break room kitchen',['fridge','table','sofa','sink'],40]]},
  'Praxis':{main:'Behandlungszimmer',hall:'Wartebereich',rooms:[['consult','Sprechzimmer','medical clinic consultation room',['clinic_station','desk','bed','sink'],25],['office','Praxisbüro','medical office clinic',['clinic_station','desk'],25],['lounge','Personalraum','clinic staff break room kitchen',['fridge','table','sofa','sink'],25]]},
  'Feuerwache':{main:'Werkstatt',hall:'Wachflur',rooms:[['garage','Fahrzeughalle','fire station workshop garage',['fire_station','desk'],80],['training','Schulungsraum','fire station training classroom',['fire_station','desk','bookshelf'],80],['lounge','Gemeinschaftsküche','fire station kitchen dining room',['fridge','table','sofa','sink'],80]]},
  'Café & Läden':{main:'Gastraum',hall:'Ladenpassage',rooms:[['kitchen','Backstube','bakery kitchen',['bakery_oven','cafe_counter','shop_counter','fridge','table','sink'],80],['shop','Nachbarschaftsladen','shopping street shop interior',['shop_counter','cafe_counter','table'],80],['terrace','Caféterrasse','outdoor cafe terrace street',['cafe_counter','shop_counter','table','bench'],100]]},
  'Park':{main:'Parkwiese',hall:'Parkwege',rooms:[['playground','Spielplatz','town park playground',['park_marker','bench','community_table'],200],['garden','Gemeinschaftsgarten','town park community garden',['park_marker','planter','bench','community_table'],200],['picnic','Picknickplatz','town park picnic area',['park_marker','table','fridge','fountain','bench','community_table'],200]]}
};
export function expandFacilities(places,edges){
  const added=[],existing=new Set(places.map(p=>p.id));
  const connect=(a,b,seconds=15)=>{for(const [from_id,to_id] of [[a,b],[b,a]])if(!edges.some(e=>e.from_id===from_id&&e.to_id===to_id))edges.push({from_id,to_id,seconds});};
  for(const building of [...places]){const plan=plans[building.name];if(building.kind!=='building'||!building.landmark||!plan)continue;
    const main=places.find(p=>p.parent_id===building.id&&p.kind==='room');if(!main)continue;
    if(main.name===building.name+' · Hauptraum')main.name=building.name+' · '+plan.main;
    const add=(key,name,purpose,affordances,capacity)=>{const id=building.id+'_space_'+key;if(existing.has(id))return id;
      const asset=searchAssets(purpose)[0],p={id,world_id:building.world_id,parent_id:building.id,name:building.name+' · '+name,kind:'room',purpose,affordances,capacity,asset_id:asset?.id||main.asset_id,x:0,y:0,anchored:0,landmark:0};places.push(p);added.push(p);existing.add(id);return id;};
    const hall=add('hall',plan.hall,building.purpose+' public hallway corridor',['bench','sink'],300);connect(building.id,hall);connect(hall,main.id);
    for(const [key,name,purpose,objects,capacity] of plan.rooms)connect(hall,add(key,name,purpose,objects,capacity));
    connect(hall,add('wc','Toiletten','public bathroom restroom toilet',['toilet','sink'],3));
  }
  return added;
}
export function assignFacilities(people,places,{seed=73}={}){
  const byId=new Map(places.map(p=>[p.id,p])),children=new Map();for(const p of places){if(!children.has(p.parent_id))children.set(p.parent_id,[]);children.get(p.parent_id).push(p);}
  for(const p of people){const profile=p.profile,work=byId.get(profile.workplace_id||p.workplace_id),building=work&&byId.get(work.parent_id);if(!building||!plans[building.name])continue;
    const rooms=children.get(building.id)||[],roomKeys=Object.fromEntries(rooms.filter(r=>r.id.startsWith(building.id+'_space_')).map(r=>[r.id.slice((building.id+'_space_').length),r.id]));
    profile.facility={buildingId:building.id,rooms:roomKeys};
    if(building.name==='Schule'&&roomKeys.classb&&(p.age>=12&&p.age<18||profile.job==='Teacher'&&rng(seed+':class:'+(profile.seed_key||p.seed_key))()>.5)){if(profile.workplace_id)profile.workplace_id=roomKeys.classb;else p.workplace_id=roomKeys.classb;}
  }
}
export function dutyDestination(p,time){
  const hour=time/3600%24,f=p.profile.facility;
  if(f&&(p.age>=3&&p.age<18)&&hour>=11&&hour<11.5)return f.rooms.canteen||p.profile.workplace_id;
  if(f&&p.age>=3&&p.age<18&&hour>=10&&hour<10.25)return f.rooms.yard||f.rooms.hall||p.profile.workplace_id;
  return p.profile.workplace_id;
}
export function serviceDestination(town,p,need){
  const objects={bath:['toilet'],kitchen:['fridge'],living:['sofa','bench','bookshelf']},wanted=objects[need]||[];
  const at=town.places.get(p.state.location_id),building=at?.kind==='building'?at:town.places.get(at?.parent_id);
  if(building?.kind==='building'){
    const candidate=[...town.places.values()].find(q=>q.parent_id===building.id&&q.kind==='room'&&wanted.some(k=>q.affordances.includes(k)));
    if(candidate)return candidate.id;
  }
  return p.profile.home[need];
}
