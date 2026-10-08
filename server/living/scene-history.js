import {db} from './schema.js';
import {pj} from '../db.js';
import {emotionAsset} from './asset-catalog.js';
const media=(id,variant)=>id?'/api/living/library/'+encodeURIComponent(id)+'?variant='+variant:null;
const iso=t=>new Date(Date.UTC(2026,8,21)+t*1000).toISOString();

// Minimal immutable visual snapshots: no live statistics impersonate the past.
export function makeSceneFrame({people,place,seconds,title,narration,kind='present',recording='snapshot'}){
  // Keep metadata for every speaker even when the visual crowd is capped.
  const speakers=new Set(narration.map(n=>n.speaker));
  const characters=people.filter((p,i)=>i<16||speakers.has(p.id)).map(p=>{
    const s=p.state||{},state={location_id:place.id,thought:s.thought||'',dialogue:narration.find(n=>n.speaker===p.id&&n.mode==='speech')?.text||'',outfit:'everyday',outfits:p.asset_id?[{name:'everyday',cutout_asset_id:media(emotionAsset(p.asset_id,s.affect,s.presentation),'sprite')}]:[]};
    return {id:p.id,name:p.name,age:p.age,gender:p.gender,colour:p.colour,voice:p.gender==='female'?'Leda':'Puck',state};
  });
  return {title,seconds,kind,recording,characters,locations:[{id:place.id,name:place.name,background_asset_id:media(place.asset_id,'full')}],tick:{sim_time:iso(seconds),pov_location_id:place.id,time_delta:'recorded scene',mood_tag:title,narration,states:characters.map(c=>({...c.state,character_id:c.id}))}};
}
export function finalSceneFrames(town,lines,end){
  return [...new Set(lines.map(n=>n.location_id))].map(locationId=>{
    const narration=lines.filter(n=>n.location_id===locationId).map(n=>({speaker:n.speaker,text:n.text,mode:n.mode,emotion:n.emotion}));
    const speaking=new Set(narration.map(n=>n.speaker));
    const people=town.people.filter(p=>speaking.has(p.id)||p.state.location_id===locationId).sort((a,b)=>Number(speaking.has(b.id))-Number(speaking.has(a.id))||Number(b.anchored)-Number(a.anchored));
    return makeSceneFrame({people,place:town.places.get(locationId),seconds:end,title:town.places.get(locationId).name+' · Now',narration});
  });
}
function frameRecords(worldId,beatId){
  const beat=db.prepare('SELECT * FROM lw_beats WHERE world_id=? AND id=?').get(worldId,beatId);if(!beat)return null;
  const rows=db.prepare('SELECT * FROM lw_flashbacks WHERE world_id=? AND beat_id=? ORDER BY seconds,sim_id,ordinal').all(worldId,beatId).map(r=>({key:'f.'+r.sim_id+'.'+r.ordinal,...pj(r.payload,{}),kind:'flashback',seconds:r.seconds}));
  const present=db.prepare('SELECT * FROM lw_scene_frames WHERE world_id=? AND beat_id=? ORDER BY ordinal').all(worldId,beatId);
  if(present.length)rows.push(...present.map(r=>({key:'p.'+r.ordinal,...pj(r.payload,{})})));
  else{
    // Earlier versions stored lines but no visual snapshot. Reconstruct only the
    // recorded participants/location, with neutral portraits and a clear label.
    const lines=db.prepare('SELECT l.*,e.end,e.participants FROM lw_scene_lines l JOIN lw_events e ON e.id=l.event_id WHERE l.world_id=? AND l.beat_id=? ORDER BY l.rowid').all(worldId,beatId);
    for(const id of new Set(lines.map(l=>l.location_id))){
      const group=lines.filter(l=>l.location_id===id),place=db.prepare('SELECT * FROM lw_places WHERE world_id=? AND id=?').get(worldId,id);if(!place)continue;
      const ids=[...new Set(group.flatMap(l=>pj(l.participants,[])))],people=ids.map(id=>db.prepare('SELECT id,name,age,gender,colour,asset_id FROM lw_sims WHERE world_id=? AND id=?').get(worldId,id)).filter(Boolean);
      rows.push({key:'l.'+id,...makeSceneFrame({people,place,seconds:Math.max(...group.map(l=>l.end)),title:place.name,recording:'legacy event reconstruction; current artwork, no historical statistics',narration:group.map(({speaker,text,mode,emotion})=>({speaker,text,mode,emotion}))})});
    }
  }
  return rows.sort((a,b)=>a.seconds-b.seconds||a.key.localeCompare(b.key));
}
export function sceneManifest(worldId,beatId){
  return frameRecords(worldId,beatId)?.map(f=>({key:f.key,beatId,kind:f.kind,title:f.title,seconds:f.seconds,place:f.locations?.[0]?.name,thumbnail:f.locations?.[0]?.background_asset_id?.replace('variant=full','variant=preview'),cast:(f.characters||[]).map(c=>({id:c.id,name:c.name,age:c.age,thumbnail:c.state?.outfits?.[0]?.cutout_asset_id?.replace('variant=sprite','variant=preview')})),lines:f.tick?.narration?.length||0,words:(f.tick?.narration||[]).map(n=>n.text).join(' ').split(/\s+/).filter(Boolean).length}))||[];
}
export function historyScene(worldId,beatId,key){return frameRecords(worldId,beatId)?.find(f=>f.key===key)||null;}
