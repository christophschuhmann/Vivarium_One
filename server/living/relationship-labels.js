// Directional labels: the target's role relative to the selected Sim.
// Kinship comes from explicit parents, never from age or shared housing.
const family=p=>p?.profile?.family||p?.family||{};
const gendered=(p,f,m,neutral)=>p.gender==='female'?f:p.gender==='male'?m:neutral;
export function relationshipLabels(from,to,r={},lookup=()=>undefined){
  const get=typeof lookup==='function'?lookup:id=>lookup.get(id),labels=[];
  const add=s=>{if(s&&!labels.includes(s))labels.push(s);};
  const ancestors=p=>{const found=new Map(),queue=[{p,depth:0}],visited=new Set([p.id]);
    for(let i=0;i<queue.length&&i<64;i++){const {p:at,depth}=queue[i];if(depth>=6)continue;for(const id of family(at).parent_ids||[]){if(visited.has(id))continue;visited.add(id);found.set(id,depth+1);const parent=get(id);if(parent)queue.push({p:parent,depth:depth+1});}}
    return found;
  };
  const a=ancestors(from),b=ancestors(to),up=a.get(to.id),down=b.get(from.id),shared=[...a.keys()].filter(id=>b.has(id));
  if(up)add(up===1?gendered(to,'Mutter','Vater','Elternteil'):up===2?gendered(to,'Großmutter','Großvater','Großelternteil'):up===3?gendered(to,'Urgroßmutter','Urgroßvater','Urgroßelternteil'):'Vorfahr/in ('+up+' Generationen)');
  else if(down)add(down===1?gendered(to,'Tochter','Sohn','Kind'):down===2?gendered(to,'Enkelin','Enkel','Enkelkind'):down===3?gendered(to,'Urenkelin','Urenkel','Urenkelkind'):'Nachkomme ('+down+' Generationen)');
  else if(shared.some(id=>a.get(id)===1&&b.get(id)===1))add(gendered(to,'Schwester','Bruder','Geschwister'));
  else if(shared.some(id=>a.get(id)===2&&b.get(id)===1))add(gendered(to,'Tante','Onkel','Tante/Onkel'));
  else if(shared.some(id=>a.get(id)===1&&b.get(id)===2))add(gendered(to,'Nichte','Neffe','Nichte/Neffe'));
  else if(shared.some(id=>a.get(id)===2&&b.get(id)===2))add(gendered(to,'Cousine','Cousin','Cousin/Cousine'));
  const kin=r.layers?.family?.status;
  if(!labels.length){const names={parent:gendered(to,'Mutter','Vater','Elternteil'),child:gendered(to,'Tochter','Sohn','Kind'),sibling:gendered(to,'Schwester','Bruder','Geschwister'),grandparent:gendered(to,'Großmutter','Großvater','Großelternteil'),grandchild:gendered(to,'Enkelin','Enkel','Enkelkind'),great_grandparent:gendered(to,'Urgroßmutter','Urgroßvater','Urgroßelternteil'),great_grandchild:gendered(to,'Urenkelin','Urenkel','Urenkelkind'),aunt_uncle:gendered(to,'Tante','Onkel','Tante/Onkel'),niece_nephew:gendered(to,'Nichte','Neffe','Nichte/Neffe'),cousin:gendered(to,'Cousine','Cousin','Cousin/Cousine')};add(names[kin]);}
  const partner=family(from).partner_id===to.id&&family(to).partner_id===from.id,married=partner&&(family(from).relationship_status==='married'||family(to).relationship_status==='married');
  if(r.kind==='Former spouse')add('Former spouse');else if(r.kind==='Former partner')add('Former partner');
  const romance=r.layers?.romance,friendship=r.layers?.friendship,contexts=r.background?.contexts||[r.background?.label||r.kind];
  if(married)add(gendered(to,'Ehefrau','Ehemann','Ehepartner/in'));
  else if(partner||romance?.status==='established'||r.kind==='Lover')add(gendered(to,'Romantische Partnerin','Romantischer Partner','Romantische Partnerschaft'));
  else if(from.age>=14&&from.age<18&&to.age>=14&&to.age<18&&Math.abs(from.age-to.age)<=1&&!labels.length&&romance?.score>0)add('Jugendliches Schwärmen');
  else if(from.age>=18&&to.age>=18&&!labels.length&&(romance?.status==='developing'&&romance.score>0||r.attraction>=.25))add('Romantisches Interesse');
  for(const context of contexts){
    const names={Friend:gendered(to,'Freundin','Freund','Freundschaft'),Neighbor:gendered(to,'Nachbarin','Nachbar','Nachbarschaft'),Coworker:gendered(to,'Kollegin','Kollege','Arbeitskontakt'),Classmate:gendered(to,'Klassenkameradin','Klassenkamerad','Klassenkontakt'),Enemy:gendered(to,'Feindin','Feind','Feindschaft'),Rival:gendered(to,'Rivalin','Rivale','Rivalität')};add(names[context]);
  }
  if(friendship?.status==='established')add(gendered(to,'Freundin','Freund','Freundschaft'));
  if(r.kind==='Enemy'||r.layers?.rivalry?.status==='hostile')add(gendered(to,'Feindin','Feind','Feindschaft'));
  else if(r.tension>=.55)add('Konflikt');
  if(!labels.length)add(shared.length||kin&&!['none','unknown'].includes(kin)||contexts.includes('Family')?'Familie':contexts.includes('Partner')?'Partnerschaft':'Bekanntschaft');
  return labels;
}

// The request cache reads only structural identities, with a fixed upper bound.
export function relationshipLookup(db,worldId){const cache=new Map();return id=>{
  if(cache.has(id))return cache.get(id);if(cache.size>=256)return undefined;
  const row=db.prepare("SELECT id,gender,age,json_extract(profile,'$.family') family FROM lw_sims WHERE world_id=? AND id=?").get(worldId,id);
  const person=row?{...row,family:JSON.parse(row.family||'{}')}:undefined;cache.set(id,person);return person;
};}
