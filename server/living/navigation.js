// Bounded read-only navigation metadata; no memories or full Sim state in lists.
import {db} from './schema.js';import {pj} from '../db.js';import {currentPlaceId} from './presentation.js';
import {activityStatus} from './expanded/education.js';
import {emotionAsset} from './asset-catalog.js';
import {relationshipLabels,relationshipLookup} from './relationship-labels.js';
export function positionIndex(worldId){
 const places=new Map(db.prepare('SELECT id,parent_id,name,kind FROM lw_places WHERE world_id=?').all(worldId).map(p=>[p.id,p]));
 return sim=>{const state=sim.state&&typeof sim.state==='object'?sim.state:pj(sim.state,{route:pj(sim.route,null)}),at=currentPlaceId(sim,state),path=[];
  for(let p=places.get(at);p&&path.length<24;p=places.get(p.parent_id))path.unshift(p);
  const route=state.route,travelling=!sim.location_id&&!!route,destination=places.get(route?.destination),from=places.get(route?.from),visible=path.filter(p=>!['country','district'].includes(p.kind));
  return {revealId:at,path,locationPath:visible,locationSummary:travelling?'Unterwegs: '+(from?.name||'Start')+' → '+(destination?.name||'Ziel'):visible.map(p=>p.name).join(' › ')||'Aufenthalt unbekannt',travelling,destination:destination||null,target:{type:'character',id:sim.id}};
 };
}
export function simPosition(worldId,id){const p=db.prepare('SELECT id,name,location_id,state FROM lw_sims WHERE world_id=? AND id=?').get(worldId,id);if(!p)throw Object.assign(new Error('Sim not found.'),{statusCode:404});return {...positionIndex(worldId)(p),id:p.id,name:p.name,type:'sim'};}
export function relationsView(worldId,id,{offset=0,limit=24,anchored=''}={}){
 const center=db.prepare('SELECT id,name,age,gender,profile,state,asset_id,colour,anchored,location_id,json_extract(state,\'$.route\') route FROM lw_sims WHERE world_id=? AND id=?').get(worldId,id);if(!center)throw Object.assign(new Error('Sim not found.'),{statusCode:404});
 const start=Math.max(0,Math.min(100000,Math.floor(Number(offset)||0))),n=Math.max(1,Math.min(24,Math.floor(Number(limit)||24))),where='r.world_id=? AND r.from_id=? AND s.world_id=r.world_id'+(anchored==='1'?' AND s.anchored=1':'');
 const rows=db.prepare(`SELECT s.id,s.name,s.age,s.gender,s.profile,s.state,s.asset_id,s.colour,s.anchored,s.location_id,json_extract(s.state,'$.route') route,r.payload FROM lw_relations r JOIN lw_sims s ON s.id=r.to_id WHERE ${where} ORDER BY s.anchored DESC,json_extract(r.payload,'$.closeness') DESC,s.name LIMIT ? OFFSET ?`).all(worldId,id,n,start),locate=positionIndex(worldId),clean=p=>{const {route,payload,profile,state,...visible}=p,person={...p,profile:pj(profile,{}),state:pj(state,{})};return {...visible,activityStatus:activityStatus(person),portrait_asset_id:emotionAsset(p.asset_id,person.state.affect,person.state.presentation),...locate(p),...(payload?{relation:pj(payload,{})}:{})};};
 const get=relationshipLookup(db,worldId),from=get(id);for(const p of rows)get(p.id);
 return {center:clean(center),neighbors:rows.map(p=>{const result=clean(p);result.relation.labels=relationshipLabels(from,get(p.id),result.relation,get);return result;}),total:db.prepare('SELECT count(*) n FROM lw_relations r JOIN lw_sims s ON s.id=r.to_id WHERE '+where).get(worldId,id).n,offset:start,limit:n};
}
