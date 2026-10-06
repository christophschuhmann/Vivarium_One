// Read-only, bounded map projection. Street proxies refer to real simulated places.
import {db} from './schema.js';
import {pj} from '../db.js';
import {currentPlaceId} from './presentation.js';
const media=id=>id?'/api/living/library/'+encodeURIComponent(id)+'?variant=preview':null;
const error=(message)=>Object.assign(new Error(message),{statusCode:400});
function index(worldId){
  const places=db.prepare('SELECT id,parent_id,name,kind,purpose,asset_id,anchored,landmark FROM lw_places WHERE world_id=? ORDER BY rowid').all(worldId),byId=new Map(places.map(p=>[p.id,p])),children=new Map();
  for(const p of places){if(!children.has(p.parent_id))children.set(p.parent_id,[]);children.get(p.parent_id).push(p);}
  const path=id=>{const result=[];for(let p=byId.get(id);p&&result.length<24;p=byId.get(p.parent_id))result.unshift(p);return result;};
  return {places,byId,children,path};
}
export function circleMap(worldId,{expanded='[]',focus}={}){
  const {places,byId,children,path}=index(worldId);let requested;
  try{requested=JSON.parse(expanded);}catch{throw error('Expanded groups must be a JSON array.');}
  if(!Array.isArray(requested)||requested.length>24||requested.some(id=>typeof id!=='string'||!byId.has(id)))throw error('Choose at most 24 groups from this world.');
  if(focus&&!byId.has(focus))throw error('Map focus not found.');
  const city=places.find(p=>p.kind==='city'),neighborhoods=places.filter(p=>p.kind==='neighborhood');
  const rootCandidates=[...new Map([...(neighborhoods.length<=36?neighborhoods:places.filter(p=>p.kind==='district')),...places.filter(p=>p.landmark&&!path(p.parent_id).some(a=>a.landmark||['neighborhood','district'].includes(a.kind)))].map(p=>[p.id,p])).values()];
  const focusPath=new Set(path(focus).map(p=>p.id));
  const roots=[...rootCandidates].sort((a,b)=>Number(focusPath.has(b.id))-Number(focusPath.has(a.id))).slice(0,60);
  const wanted=new Set(requested),rootIds=new Set(roots.map(p=>p.id));
  // A requested house is meaningful even if its parent was not explicitly supplied.
  for(const id of requested)for(const p of path(id))if(rootIds.has(p.id)||['district','neighborhood','building'].includes(p.kind))wanted.add(p.id);
  const occupants=new Map(),anchors=new Map();
  for(const s of db.prepare('SELECT location_id,state,anchored FROM lw_sims WHERE world_id=?').all(worldId)){
    const id=currentPlaceId(s,pj(s.state,{}));
    for(const p of path(id)){occupants.set(p.id,(occupants.get(p.id)||0)+1);if(s.anchored)anchors.set(p.id,(anchors.get(p.id)||0)+1);}
  }
  const nodes=[],accepted=[],refused=[];
  const visit=(p,parent=null)=>{
    const kids=children.get(p.id)||[],canExpand=kids.length>0;
    const open=wanted.has(p.id)&&canExpand&&kids.length<=40&&nodes.length+kids.length+(['building','neighborhood'].includes(p.kind)?1:0)+roots.length<180;
    if(wanted.has(p.id)&&canExpand&&!open)refused.push(p.id);
    const n={...p,parent_id:parent,placeId:p.id,expanded:open,leaf:!canExpand,occupants:occupants.get(p.id)||0,simAnchors:anchors.get(p.id)||0,thumbnail:null};nodes.push(n);
    if(!open)return;accepted.push(p.id);
    if(p.kind==='neighborhood'&&!kids.some(k=>k.kind==='street'))nodes.push({...n,id:'map:street:'+p.id,placeId:p.id,parent_id:p.id,name:'Straße · '+p.name,kind:'street',expanded:false,leaf:true,virtual:true,thumbnail:null});
    if(p.kind==='building')nodes.push({...n,id:'map:entry:'+p.id,placeId:p.id,parent_id:p.id,name:'Eingang · '+p.name,purpose:'Zugang von der Straße zu den Räumen',kind:'entry',expanded:false,leaf:true,virtual:true,asset_id:null,thumbnail:null,landmark:0,anchored:0,simAnchors:0,occupants:0});
    for(const k of kids)visit(k,p.id);
  };
  for(const p of roots)visit(p);
  const visible=new Map(nodes.map(n=>[n.id,n]));
  const resolve=id=>{
    for(const p of path(id).reverse()){
      if(visible.has('map:entry:'+p.id))return 'map:entry:'+p.id;
      if(visible.has('map:street:'+p.id))return 'map:street:'+p.id;
      if(visible.has(p.id))return p.id;
    }return null;
  };
  const edges=new Map();
  for(const e of db.prepare('SELECT from_id,to_id FROM lw_edges WHERE world_id=?').all(worldId)){
    const a=resolve(e.from_id),b=resolve(e.to_id);
    // Containment already expresses a building's doorway-to-room hierarchy.
    // Keep its outside route at the group boundary instead of crossing every room.
    if(visible.get(a)?.expanded&&path(e.to_id).some(p=>p.id===a)||visible.get(b)?.expanded&&path(e.from_id).some(p=>p.id===b))continue;
    if(a&&b&&a!==b){const key=[a,b].sort().join('|');edges.set(key,{from_id:a,to_id:b});}
  }
  const presence=new Map();
  for(const s of db.prepare('SELECT id,name,age,asset_id,colour,anchored,location_id FROM lw_sims WHERE world_id=? AND location_id IS NOT NULL ORDER BY anchored DESC,name').all(worldId)){if(!presence.has(s.location_id))presence.set(s.location_id,[]);presence.get(s.location_id).push(s);}
  for(const n of nodes)if(n.leaf&&n.kind!=='entry'){
    const sims=presence.get(n.placeId)||[];n.presentCount=sims.length;n.occupants=sims.length;
    n.presentSims=sims.slice(0,sims.length>5?4:5).map(({location_id,...s})=>s);n.overflow=Math.max(0,sims.length-n.presentSims.length);
  }
  for(const n of nodes)n.thumbnail=null;
  const priority=n=>n.placeId===focus?0:focus&&path(n.placeId).some(p=>p.id===focus)?1:n.landmark?2:3;
  for(const n of nodes.filter(n=>!n.expanded).sort((a,b)=>priority(a)-priority(b)).slice(0,50))n.thumbnail=media(n.asset_id);
  return {omittedRoots:Math.max(0,rootCandidates.length-roots.length),city:city?.id,focus:focus||city?.id,nodes,edges:[...edges.values()],expanded:accepted,refused,budget:{nodes:180,thumbnails:50},ancestors:focus?path(focus).map(p=>({id:p.id,name:p.name,kind:p.kind})):[]};
}
const normalize=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const aliases=[['library','bibliothek'],['school','schule'],['university','universitat','universitaet','campus'],['bedroom','schlafzimmer'],['bathroom','badezimmer'],['living room','wohnzimmer'],['kitchen','kuche','kueche'],['fire','feuerwache'],['clinic','klinik'],['town hall','rathaus'],['street','strasse','straße'],['daycare','kita']];
export function searchMap(worldId,query){
  const {places,path,byId}=index(worldId),q=normalize(query).trim().slice(0,100);if(!q)return {results:[]};
  const terms=new Set([q]);for(const group of aliases)if(group.some(word=>normalize(word)===q))for(const word of group)terms.add(normalize(word));
  const score=(name,purpose='')=>{const n=normalize(name),p=normalize(purpose);return Math.max(...[...terms].map(t=>n===t?100:n.includes(t)?60:p.includes(t)?20:0));};
  const results=places.map(p=>({...p,type:'place',score:score(p.name,p.purpose),location:p.name,revealId:p.id,target:{type:'location',id:p.id}})).filter(p=>p.score>0);
  for(const s of db.prepare('SELECT id,name,location_id,state,anchored FROM lw_sims WHERE world_id=?').all(worldId)){
    const rank=score(s.name);if(!rank)continue;const loc=currentPlaceId(s,pj(s.state,{}));results.push({id:s.id,name:s.name,type:'sim',score:rank,anchored:s.anchored,location:byId.get(loc)?.name||'Unterwegs',revealId:loc,target:{type:'character',id:s.id}});
  }
  return {results:results.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,24).map(r=>({id:r.id,name:r.name,type:r.type,kind:r.kind,location:r.location,anchored:r.anchored,revealId:r.revealId,target:r.target,path:path(r.revealId).map(p=>({id:p.id,name:p.name,kind:p.kind}))}))};
}
export function mapAnchors(worldId){
  const {places,byId,children,path}=index(worldId),room=id=>{const queue=[id];while(queue.length){const p=byId.get(queue.shift());if(p?.kind==='room')return p.id;queue.push(...(children.get(p?.id)||[]).map(p=>p.id));}return id;};
  const sims=db.prepare('SELECT id,name,location_id,state,colour FROM lw_sims WHERE world_id=? AND anchored=1 ORDER BY name').all(worldId).map(s=>{
    const state=pj(s.state,{}),loc=currentPlaceId(s,state);
    return {id:s.id,name:s.name,type:'sim',colour:s.colour,location:byId.get(loc)?.name||'Unterwegs',travelling:!s.location_id,destination:byId.get(state.route?.destination)?.name,revealId:loc,path:path(loc).map(p=>({id:p.id,name:p.name,kind:p.kind})),target:{type:'character',id:s.id}};
  });
  const anchoredPlaces=places.filter(p=>p.anchored).sort((a,b)=>a.name.localeCompare(b.name)).map(p=>({id:p.id,name:p.name,type:'place',kind:p.kind,location:p.name,revealId:p.id,path:path(p.id).map(p=>({id:p.id,name:p.name,kind:p.kind})),target:{type:'location',id:room(p.id)}}));
  return {anchors:[...sims,...anchoredPlaces]};
}
