import {advisorChat,advisorHistory} from '../living/advisor.js';
import {worldMonitor,worldTools} from '../living/agent-tools.js';
import {refreshMemorySummaries} from '../living/memory-tiers.js';
import {prepareSocialDynamics} from '../living/social-dynamics.js';
import {explorerCatalog,compileExplorerFilters,explorerMatches} from '../living/explorer-filters.js';
import {refreshBiographyPronouns} from '../living/occupations.js';
import {socialAttributes} from '../living/social-attributes.js';
import {startTurbo,turboStatus,cancelTurbo,stopTurboWorkers} from '../living/turbo.js';
import {catalogSearch,catalogStats,materializeAsset,catalogEntry} from '../living/asset-catalog.js';
import {ensureLocationMusic} from '../living/music.js';
import { activityStatus } from '../living/expanded/education.js';
import {initializeNewPopulation} from '../living/expanded/population.js';
import {projectWellbeing} from '../living/wellbeing.js';
import {normalizeRomance,romanticCap} from '../living/romance.js';
import fs from 'node:fs';
import {positionIndex,simPosition,relationsView} from '../living/navigation.js';
import {relationshipLabels,relationshipLookup} from '../living/relationship-labels.js';
import {circleMap,searchMap,mapAnchors} from '../living/map.js';
import {evaluateMind} from '../living/cognition.js';
import {activity} from '../living/presentation.js';
import {openSimsCatalog} from '../living/open_sims.js';
import {db} from '../living/schema.js';
import {requireUser,requireVerified,httpErr} from '../auth.js';
import {uid,j,pj,now} from '../db.js';
import {createTown,advanceTown,loadTown,authorBiographies,recordBiography,busy} from '../living/engine.js';
import {generateTown} from '../living/generate.js';
import {weaveSocial,socialPerspective} from '../living/social.js';
import {library,assetFile,searchAssets} from '../living/library.js';
import {llmChat} from '../providers.js';
import {withPrincipal} from '../byok.js';
import {preflight,debitCall,EST} from '../credits.js';
import {stageView,graphView,character,converse,chatHistory,clearChat} from '../living/vivarium.js';
const limit=(value,max=50)=>Math.max(1,Math.min(max,Number(value)||20));
function own(req,verified=false){const user=verified?requireVerified(req):requireUser(req);const world=db.prepare('SELECT * FROM worlds WHERE id=? AND user_id=? AND simulation_mode=\'living\'').get(req.params.worldId,user.id);if(!world)throw httpErr(404,'NOT_FOUND','Living world not found.');return {user,world};}
function mutable(req){const result=own(req,true);if(busy.has(result.world.id))throw httpErr(409,'WORLD_BUSY','Wait for the current tick to finish.');return result;}
const simView=p=>{const person={...p,profile:pj(p.profile,{}),state:pj(p.state,{})};normalizeRomance(person);projectWellbeing(person,person.state.wellbeing?.updated_at||0);if(person.profile.social)person.profile.social=socialPerspective(person);prepareSocialDynamics(person,db.prepare('SELECT seed FROM lw_worlds WHERE world_id=?').get(p.world_id)?.seed||73);if(person.profile.locale==='en'&&person.biography_mode!=='written')person.biography=refreshBiographyPronouns(person);person.activityStatus=activityStatus(person);person.state.socialAttributes=socialAttributes(person);return person;};
export default async function livingRoutes(app) {
  app.get('/api/living/worlds/:worldId/flashbacks/:beatId/:simId/:ordinal',async req=>{const {world}=own(req);const row=db.prepare('SELECT payload FROM lw_flashbacks WHERE world_id=? AND beat_id=? AND sim_id=? AND ordinal=?').get(world.id,req.params.beatId,req.params.simId,Number(req.params.ordinal));if(!row)throw httpErr(404,'NOT_FOUND','Flashback not found.');return pj(row.payload,{});});
  app.get('/api/living/worlds/:worldId/monitor',async req=>worldMonitor(own(req).world.id));
  app.get('/api/living/worlds/:worldId/monitor/residents',async req=>worldTools(own(req).world.id)('search_sims',{incomeClass:req.query.incomeClass,limit:20,offset:Number(req.query.offset)||0}));
  app.get('/api/living/worlds/:worldId/dr-well',async req=>({history:advisorHistory(own(req).world.id)}));
  app.post('/api/living/worlds/:worldId/dr-well',async req=>{const {user,world}=own(req,true);return advisorChat(user,world,req.body||{});});
  app.addHook('onClose',async()=>stopTurboWorkers());
  app.get('/api/living/worlds/:worldId/turbo',async req=>{const {world}=own(req);return {job:turboStatus(world.id)};});
  app.post('/api/living/worlds/:worldId/turbo',async req=>{const {user,world}=own(req,true);return {job:startTurbo(user,world.id,Number(req.body?.minutes))};});
  app.delete('/api/living/worlds/:worldId/turbo',async req=>{const {world}=own(req,true);return {job:cancelTurbo(world.id)};});
  app.post('/api/living/worlds/:worldId/places/:id/music',async req=>{
    const {world}=own(req,true),place=db.prepare("SELECT id,purpose,name FROM lw_places WHERE world_id=? AND id=? AND kind='room'").get(world.id,req.params.id);
    if(!place)throw httpErr(404,'NOT_FOUND','Choose a location in this world.');
    const query=req.body?.query;
    if(query!==undefined&&(typeof query!=='string'||!query.trim()||query.length>400))throw httpErr(400,'BAD_QUERY','Music query must be 1–400 characters.');
    return {music:await ensureLocationMusic(world.id,place,query?.trim())};
  });
  app.get('/api/living/worlds/:worldId/history',async req=>{const {world}=own(req);return {beats:db.prepare('SELECT version,start,end,story,metrics FROM lw_beats WHERE world_id=? ORDER BY version DESC LIMIT 40').all(world.id).map(b=>({...b,story:pj(b.story,[]),metrics:pj(b.metrics,{})}))};});
  app.get('/api/living/worlds/:worldId/view',async req=>stageView(own(req).world,req.query));
  app.get('/api/living/worlds/:worldId/graph',async req=>graphView(own(req).world.id,req.query));
  app.get('/api/living/worlds/:worldId/map',async req=>circleMap(own(req).world.id,req.query));
  app.get('/api/living/worlds/:worldId/map/search',async req=>searchMap(own(req).world.id,req.query.q));
  app.get('/api/living/worlds/:worldId/map/anchors',async req=>mapAnchors(own(req).world.id));
  for(const channel of ['inner','talk']){
    app.get('/api/living/worlds/:worldId/sims/:id/'+channel,async req=>{const {world}=own(req);if(!db.prepare('SELECT 1 FROM lw_sims WHERE world_id=? AND id=?').get(world.id,req.params.id))throw httpErr(404,'NOT_FOUND','Sim not found.');return {history:chatHistory(world.id,req.params.id,channel)};});
    app.post('/api/living/worlds/:worldId/sims/:id/'+channel,async req=>{const {user,world}=mutable(req);return converse(user,world.id,req.params.id,{message:String(req.body?.message||''),lang:req.body?.lang,channel});});
    app.delete('/api/living/worlds/:worldId/sims/:id/'+channel,async req=>{const {world}=mutable(req);if(!db.prepare('SELECT 1 FROM lw_sims WHERE world_id=? AND id=?').get(world.id,req.params.id))throw httpErr(404,'NOT_FOUND','Sim not found.');return clearChat(world.id,req.params.id,channel);});
  }
  app.patch('/api/living/worlds/:worldId/sims/:id',async req=>{
    const catalog=await openSimsCatalog();
    const {world}=mutable(req),p=db.prepare('SELECT * FROM lw_sims WHERE world_id=? AND id=?').get(world.id,req.params.id);if(!p)throw httpErr(404,'NOT_FOUND','Sim not found.');const state=pj(p.state,{}),b=req.body||{};normalizeRomance({...p,profile:pj(p.profile,{}),state});
    if(b.location_id&&!db.prepare("SELECT 1 FROM lw_places WHERE world_id=? AND id=? AND kind='room'").get(world.id,b.location_id))throw httpErr(400,'BAD_PLACE','Choose a room.');
    if(b.needs)for(const [key,value] of Object.entries(b.needs)){if(!(key in state.needs)||typeof value!=='number'||value<0||value>1)throw httpErr(400,'BAD_NEED','Needs must be between 0 and 1.');if(key==='romantic_affection'&&value>romanticCap(p.age))throw httpErr(400,'AGE_BOUNDARY','Romantische Zuneigung: unter 14 immer 0; 14–17 höchstens 0,35.');state.needs[key]=value;}
    if(b.location_id){state.location_id=b.location_id;state.route=null;state.action=null;}
    db.transaction(()=>{const clock=db.prepare('SELECT seconds FROM lw_worlds WHERE world_id=?').get(world.id),id=uid('le_');evaluateMind({...p,profile:pj(p.profile,{}),state},clock.seconds,catalog);db.prepare('UPDATE lw_sims SET state=?,location_id=?,name=? WHERE id=?').run(j(state),state.location_id,String(b.name||p.name).slice(0,100),p.id);db.prepare('INSERT INTO lw_events VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,world.id,null,clock.seconds,clock.seconds,state.location_id,'user_edit',j([p.id]),j({changes:{location_id:b.location_id,needs:b.needs,name:b.name}}),'Eine ausdrückliche Intervention verändert meinen aktuellen Zustand.','user_intervention');db.prepare('INSERT INTO lw_journal VALUES (?,?,?,?,?,?,?)').run(p.id,id,clock.seconds,'intervention','Mein Zustand wurde durch eine Intervention verändert.','Diese Veränderung ist Teil meines tatsächlichen Protokolls.',1);db.prepare('UPDATE lw_worlds SET version=version+1 WHERE world_id=?').run(world.id);})();return {ok:true};
  });
  app.post('/api/living/towns',async req=>createTown(requireVerified(req),req.body || {}));
  app.get('/api/living/library/search',async req=>{const user=requireUser(req),q=req.query||{},excludeIdentities=[];if(q.unusedWorld){if(!db.prepare('SELECT 1 FROM worlds WHERE id=? AND user_id=?').get(q.unusedWorld,user.id))throw httpErr(404,'NOT_FOUND','World not found');for(const p of db.prepare('SELECT DISTINCT asset_id FROM lw_sims WHERE world_id=?').all(q.unusedWorld)){const entry=catalogEntry(p.asset_id);if(entry)excludeIdentities.push(entry.identity_id);}}return {items:catalogSearch(q.q,{...q,excludeIdentities}),...catalogStats()};});
  app.get('/api/living/library',async req=>{requireUser(req);const external=catalogStats();return {...external,count:library().length+external.count,characters:library().filter(e=>e.kind==='character').length+external.characters,ready:true};});
  app.get('/api/living/library/:id',async(req,reply)=>{requireUser(req);const file=assetFile(req.params.id,req.query?.variant)||await materializeAsset(req.params.id,req.query?.variant||'preview');if(!file)throw httpErr(404,'MISSING_ASSET','Library media missing. Run the sprite preparation script.');const handle=fs.openSync(file,'r'),magic=Buffer.alloc(2);try{fs.readSync(handle,magic,0,2,0);}finally{fs.closeSync(handle);}reply.header('Cache-Control','private, max-age=86400').type(magic[0]===255&&magic[1]===216?'image/jpeg':'image/png');return reply.send(fs.createReadStream(file));});
  app.get('/api/living/worlds/:worldId',async req=>{
    const {world}=own(req),simulation=db.prepare('SELECT * FROM lw_worlds WHERE world_id=?').get(world.id),latest=db.prepare('SELECT version,fields,story,metrics FROM lw_beats WHERE world_id=? ORDER BY version DESC LIMIT 1').get(world.id);
    return {world,simulation:{...simulation,rules:pj(simulation.rules,{})},population:db.prepare('SELECT count(*) n FROM lw_sims WHERE world_id=?').get(world.id).n,
      households:db.prepare('SELECT count(DISTINCT household_id) n FROM lw_sims WHERE world_id=?').get(world.id).n,
      locations:db.prepare('SELECT count(*) n FROM lw_places WHERE world_id=?').get(world.id).n,
      anchors:{sims:db.prepare('SELECT id,name,location_id FROM lw_sims WHERE world_id=? AND anchored=1 ORDER BY name LIMIT 100').all(world.id),places:db.prepare('SELECT id,name,kind FROM lw_places WHERE world_id=? AND anchored=1 ORDER BY name LIMIT 100').all(world.id)},
      roots:db.prepare('SELECT id,name,kind FROM lw_places WHERE world_id=? AND parent_id IS NULL').all(world.id),city:db.prepare("SELECT id FROM lw_places WHERE world_id=? AND kind='city' LIMIT 1").get(world.id)?.id,
      latest:latest?{...latest,fields:pj(latest.fields,[]),story:pj(latest.story,[]),metrics:pj(latest.metrics,{})}:null,busy:busy.has(world.id)};
  });
  app.get('/api/living/worlds/:worldId/places',async req=>{
    const {world}=own(req),parent=req.query?.parent;const n=limit(req.query.limit,64),offset=Math.max(0,Number(req.query.offset)||0),columns='id,parent_id,name,kind,purpose,asset_id,x,y,capacity,anchored,landmark';
    if(!db.prepare('SELECT 1 FROM lw_places WHERE id=? AND world_id=?').get(parent,world.id))throw httpErr(404,'NOT_FOUND','Place not found.');
    const children=db.prepare(`SELECT ${columns},(SELECT count(*) FROM lw_sims s WHERE s.location_id=lw_places.id) occupants FROM lw_places WHERE world_id=? AND parent_id=? ORDER BY rowid LIMIT ? OFFSET ?`).all(world.id,parent,n,offset),ancestors=[];
    let current=parent;for(let i=0;current&&i<12;i++){const place=db.prepare(`SELECT ${columns} FROM lw_places WHERE id=? AND world_id=?`).get(current,world.id);if(!place)break;ancestors.unshift(place);current=place.parent_id;}
    const landmarks=db.prepare(`SELECT ${columns} FROM lw_places WHERE world_id=? AND landmark=1 ORDER BY rowid LIMIT 32`).all(world.id);
    const overview=db.prepare(`SELECT ${columns} FROM lw_places WHERE world_id=? AND kind IN ('district','neighborhood') ORDER BY rowid LIMIT 64`).all(world.id);
    return {children,ancestors,landmarks,overview,total:db.prepare('SELECT count(*) n FROM lw_places WHERE world_id=? AND parent_id=?').get(world.id,parent).n,offset,limit:n};
  });
  app.get('/api/living/worlds/:worldId/sims/filters',async req=>{const {world}=own(req);return {...explorerCatalog,neighborhoods:db.prepare("SELECT id,name FROM lw_places WHERE world_id=? AND kind='neighborhood' ORDER BY rowid").all(world.id)};});
  app.get('/api/living/worlds/:worldId/sims',async req=>{
    const {world}=own(req),query=req.query || {},n=limit(query.limit,50),offset=Math.max(0,Number(query.offset)||0),where=['s.world_id=?'],args=[world.id];
    if(query.search){where.push('s.name LIKE ?');args.push('%'+String(query.search).slice(0,100)+'%');}
    if(query.place){if(!db.prepare('SELECT 1 FROM lw_places WHERE world_id=? AND id=?').get(world.id,query.place))throw httpErr(404,'NOT_FOUND','Place not found.');where.push('s.location_id=?');args.push(query.place);}
    if(query.anchored==='0')where.push('s.anchored=0');
    for(const [key,op] of [['minAge','>='],['maxAge','<=']])if(query[key]!==undefined&&query[key]!==''){const age=Number(query[key]);if(!Number.isInteger(age)||age<0||age>120)throw httpErr(400,'BAD_AGE','Choose an age from 0 to 120.');where.push('s.age'+op+'?');args.push(age);}
    if(query.firstName){where.push("(CASE WHEN instr(s.name,' ')>0 THEN substr(s.name,1,instr(s.name,' ')-1) ELSE s.name END) LIKE ?");args.push('%'+String(query.firstName).slice(0,80)+'%');}
    if(query.familyName){where.push("substr(s.name,instr(s.name,' ')+1) LIKE ?");args.push('%'+String(query.familyName).slice(0,80)+'%');}
    if(query.neighborhood){
      if(!db.prepare("SELECT 1 FROM lw_places WHERE world_id=? AND id=? AND kind='neighborhood'").get(world.id,query.neighborhood))throw httpErr(404,'BAD_NEIGHBORHOOD','Neighborhood not found.');
      where.push("coalesce(json_extract(s.profile,'$.home.living'),s.household_id) IN (WITH RECURSIVE home_places(id) AS (SELECT id FROM lw_places WHERE world_id=? AND id=? UNION SELECT p.id FROM lw_places p JOIN home_places h ON p.parent_id=h.id WHERE p.world_id=?) SELECT id FROM home_places)");args.push(world.id,query.neighborhood,world.id);
    }
    if(query.anchored==='1')where.push('s.anchored=1');
    const advanced=compileExplorerFilters(query.filters,world.id);where.push(...advanced.where);args.push(...advanced.args);
    const sql=where.join(' AND '),extra=advanced.selections.length?','+advanced.selections.join(','):'';
    const catalog=await openSimsCatalog();
    const {rows,total}=db.transaction(()=>({
      rows:db.prepare(`${advanced.cte}SELECT s.id,s.name,s.age,s.gender,s.asset_id,s.colour,s.anchored,s.location_id,s.household_id,s.profile,s.state,json_extract(s.state,'$.route') route,json_extract(s.state,'$.action.kind') activity,json_extract(s.state,'$.thought') thought,p.name location${extra} FROM lw_sims s LEFT JOIN lw_places p ON p.id=s.location_id${advanced.joins} WHERE ${sql} ORDER BY s.name,s.id LIMIT ? OFFSET ?`).all(...advanced.prefixArgs,...advanced.selectionArgs,...args,n,offset),
      total:db.prepare(`${advanced.cte}SELECT count(*) n FROM lw_sims s${advanced.joins} WHERE ${sql}`).get(...advanced.prefixArgs,...args).n
    }))();
    const locate=positionIndex(world.id);return {sims:rows.map(s=>{const matches=explorerMatches(s,advanced.rules),{route,profile,state,...visible}=s;const p={...s,profile:pj(profile,{}),state:pj(state,{})};return {...visible,...locate(s),activityStatus:activityStatus(p),activityText:activity(s.activity,catalog),...(matches.length?{matches}:{})};}),total,offset,limit:n};
  });
  app.get('/api/living/worlds/:worldId/sims/:id/position',async req=>simPosition(own(req).world.id,req.params.id));
  app.get('/api/living/worlds/:worldId/sims/:id/relations',async req=>relationsView(own(req).world.id,req.params.id,req.query));
  app.get('/api/living/worlds/:worldId/sims/:id',async req=>{
    const {world}=own(req),p=db.prepare('SELECT * FROM lw_sims WHERE world_id=? AND id=?').get(world.id,req.params.id);if(!p)throw httpErr(404,'NOT_FOUND','Sim not found.');
    const relations=db.prepare('SELECT r.to_id,r.payload,s.name FROM lw_relations r JOIN lw_sims s ON s.id=r.to_id WHERE r.world_id=? AND r.from_id=? ORDER BY json_extract(r.payload,\'$.closeness\') DESC LIMIT 30').all(world.id,p.id).map(r=>({...r,payload:pj(r.payload,{})}));
    const get=relationshipLookup(db,world.id);get(p.id);for(const r of relations)get(r.to_id);for(const r of relations)r.payload.labels=relationshipLabels(get(p.id),get(r.to_id),r.payload,get);
    const n=limit(req.query?.limit,50),before=Number(req.query?.before)||Number.MAX_SAFE_INTEGER;
    const journal=db.prepare('SELECT j.rowid cursor,j.*,e.type,e.start,e.end,e.location_id,e.facts,e.description,e.source FROM lw_journal j JOIN lw_events e ON e.id=j.event_id WHERE j.sim_id=? AND j.rowid<? ORDER BY j.rowid DESC LIMIT ?').all(p.id,before,n).map(e=>({...e,facts:pj(e.facts,{})}));
    return {sim:simView(p),relations,journal,nextCursor:journal.length===n?journal.at(-1).cursor:null};
  });
  app.put('/api/living/worlds/:worldId/anchors',async req=>{
    const {world}=mutable(req),b=req.body || {},kind=b.kind;if(!['sim','place'].includes(kind)||typeof b.enabled!=='boolean')throw httpErr(400,'BAD_ANCHOR','Choose a Sim or location anchor.');
    const table=kind==='sim'?'lw_sims':'lw_places';if(!db.prepare(`SELECT 1 FROM ${table} WHERE world_id=? AND id=?`).get(world.id,b.id))throw httpErr(404,'NOT_FOUND','Anchor entity not found.');
    db.transaction(()=>{db.prepare(`UPDATE ${table} SET anchored=? WHERE id=?`).run(+b.enabled,b.id);if(kind==='sim'&&b.enabled)db.prepare("UPDATE lw_sims SET biography_mode='written_pending' WHERE id=? AND biography_mode='procedural'").run(b.id);db.prepare('UPDATE lw_worlds SET version=version+1 WHERE world_id=?').run(world.id);const version=db.prepare('SELECT version FROM lw_worlds WHERE world_id=?').get(world.id).version;db.prepare('INSERT INTO lw_anchor_audit(world_id,entity_id,kind,enabled,version) VALUES (?,?,?,?,?)').run(world.id,b.id,kind,+b.enabled,version);if(kind==='sim'&&b.enabled)refreshMemorySummaries(world.id,db.prepare('SELECT seconds FROM lw_worlds WHERE world_id=?').get(world.id).seconds,b.id);})();return {ok:true};
  });
  app.post('/api/living/worlds/:worldId/ticks',async(req,reply)=>{
    const {user,world}=own(req,true);
    if(!String(req.headers.accept || '').includes('text/event-stream'))return advanceTown(user,world.id,{minutes:req.body?.minutes ?? 5,story:req.body?.story ?? true,expectedVersion:req.body?.expectedVersion,intervention:req.body?.intervention});
    reply.hijack();reply.raw.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive'});
    const controller=new AbortController();let finished=false;
    const send=(event,data)=>{if(!finished)reply.raw.write('event: '+event+'\ndata: '+j(data)+'\n\n');};
    reply.raw.on('close',()=>{if(!finished)controller.abort();});
    const heartbeat=setInterval(()=>send('status',{phase:'thinking'}),9000);
    try{const result=await advanceTown(user,world.id,{minutes:req.body?.minutes ?? 5,story:req.body?.story ?? true,expectedVersion:req.body?.expectedVersion,intervention:req.body?.intervention,signal:controller.signal,onProgress:data=>send('status',data)});send('done',result);}catch(error){req.log.warn({worldId:world.id,code:error.code||'LIVING_TICK_FAILED',reason:error.message,providerDiagnostics:error.diagnostics},'Living World tick failed before commit');send('error',{message:error.message});}finally{finished=true;clearInterval(heartbeat);reply.raw.end();}
  });
  app.post('/api/living/worlds/:worldId/sims/:id/biography',async req=>{
    const {user,world}=mutable(req),p=db.prepare('SELECT * FROM lw_sims WHERE world_id=? AND id=?').get(world.id,req.params.id);if(!p)throw httpErr(404,'NOT_FOUND','Sim not found.');busy.add(world.id);
    try{const person=simView(p);await authorBiographies(user,[person],String(req.body?.instruction || '').slice(0,3000));db.transaction(()=>{db.prepare('UPDATE lw_sims SET biography=?,biography_mode=? WHERE id=?').run(person.biography,'written',p.id);db.prepare('UPDATE lw_worlds SET version=version+1 WHERE world_id=?').run(world.id);recordBiography(world.id,person,db.prepare('SELECT seconds FROM lw_worlds WHERE world_id=?').get(world.id).seconds);})();return {ok:true,biography:person.biography};}finally{busy.delete(world.id);}
  });
  app.get('/api/living/worlds/:worldId/assets/search',async req=>{own(req);const q=req.query || {};return {candidates:searchAssets(q.query,{kind:q.kind,age:Number(q.age),gender:q.gender,heritage:q.heritage})};});
  app.post('/api/living/worlds/:worldId/assets/choose',async req=>{
    const {user,world}=mutable(req),b=req.body || {},table=b.kind==='sim'?'lw_sims':b.kind==='place'?'lw_places':null;if(!table)throw httpErr(400,'BAD_KIND','Choose a Sim or place.');
    const entity=db.prepare(`SELECT * FROM ${table} WHERE world_id=? AND id=?`).get(world.id,b.id);if(!entity)throw httpErr(404,'NOT_FOUND','Entity not found.');
    const candidates=searchAssets(String(b.caption || entity.purpose || entity.name).slice(0,800),{kind:b.kind==='sim'?'character':'background',age:entity.age,gender:entity.gender});if(!candidates.length)throw httpErr(409,'NO_LIBRARY','Load the Living World asset library first.');
    busy.add(world.id);try{let selected=b.assetId || candidates[0].id;
    if(b.useModel){preflight(user.id,EST.chat());const result=await withPrincipal(user,()=>llmChat([{role:'system',content:'Choose the best matching image from the supplied metadata. Return JSON {id,reason}; only supplied IDs are valid. Respect the intended setting and age. You cannot change the caption or invent a new image.'},{role:'user',content:j({caption:b.caption || entity.purpose || entity.name,candidates})}],{maxTokens:600}));debitCall(user.id,result,'living_asset_choice',{worldId:world.id});selected=JSON.parse(result.content.replace(/^```json\s*|\s*```$/g,'')).id;}
    if(!candidates.some(c=>c.id===selected))throw httpErr(400,'BAD_ASSET','Choose one of the five candidates.');db.transaction(()=>{db.prepare(`UPDATE ${table} SET asset_id=? WHERE id=?`).run(selected,entity.id);if(b.kind==='sim'){const profile=pj(entity.profile,{});profile.artwork={...profile.artwork,manual:true};db.prepare('UPDATE lw_sims SET profile=? WHERE id=?').run(j(profile),entity.id);}})();return {ok:true,id:selected,candidates};}finally{busy.delete(world.id);}
  });
  app.post('/api/living/worlds/:worldId/grow',async req=>{
    const {world}=mutable(req),count=db.prepare('SELECT count(*) n FROM lw_sims WHERE world_id=?').get(world.id).n,add=Number(req.body?.count);
    if(!Number.isInteger(add)||add<1||count+add>2000)throw httpErr(400,'BAD_POPULATION','Add enough Sims to reach at most 2000.');busy.add(world.id);
    try{
      const existing=loadTown(world.id),prefix=world.id+'_x'+count,generated=await generateTown(prefix,{population:add,scenario:pj(existing.world.rules,{}).scenario?.id||'generic',seed:existing.world.seed+count,title:world.title,neighborhoodOffset:[...existing.places.values()].filter(p=>p.kind==='neighborhood').length,reservedNames:[...existing.places.values()].filter(p=>['neighborhood','district'].includes(p.kind)).map(p=>p.name)}),map=new Map();
      for(const place of generated.places)if(['country','city'].includes(place.kind)||place.landmark||place.parent_id&&generated.places.find(p=>p.id===place.parent_id)?.landmark){const match=[...existing.places.values()].find(p=>p.kind===place.kind&&(['country','city'].includes(place.kind)||p.name===place.name));if(match)map.set(place.id,match.id);}
      const rename=value=>typeof value==='string'?map.get(value)||value:Array.isArray(value)?value.map(rename):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rename(v)])):value;
      const houseOffset=db.prepare('SELECT count(DISTINCT household_id) n FROM lw_sims WHERE world_id=?').get(world.id).n;
      const fresh=generated.places.filter(p=>!map.has(p.id)).map(p=>({...rename(p),world_id:world.id}));
      for(const p of fresh)p.name=p.name.replace(/Haus (\d+)/g,(_,n)=>'Haus '+(houseOffset+Number(n)));
      const firstNew=fresh.find(p=>p.kind==='neighborhood'),firstOld=[...existing.places.values()].find(p=>p.kind==='neighborhood');
      db.transaction(()=>{
        for(const p of fresh)db.prepare('INSERT INTO lw_places(id,world_id,parent_id,name,kind,purpose,asset_id,x,y,capacity,anchored,landmark,affordances) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(p.id,world.id,p.parent_id,p.name,p.kind,p.purpose,p.asset_id,p.x,p.y,p.capacity,0,p.landmark,j(p.affordances));
        const edge=db.prepare('INSERT OR IGNORE INTO lw_edges VALUES (?,?,?,?)');for(const e of generated.edges){const a=map.get(e.from_id)||e.from_id,b=map.get(e.to_id)||e.to_id;if(a!==b)edge.run(world.id,a,b,e.seconds);}if(firstNew&&firstOld){edge.run(world.id,firstNew.id,firstOld.id,180);edge.run(world.id,firstOld.id,firstNew.id,180);}
        for(const original of generated.people){const p=rename(original),profile={...p.profile,family:p.family,home:p.home,workplace_id:p.workplace_id,preferences:p.preferences,seed_key:'extension-'+count+'-'+p.seed_key};
          delete p.state.wellbeing;projectWellbeing(p,existing.world.seconds);
          db.prepare('INSERT INTO lw_sims(id,world_id,household_id,name,age,gender,asset_id,colour,anchored,biography_mode,biography,profile,state,location_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(p.id,world.id,p.household_id,p.name,p.age,p.gender,p.asset_id,p.colour,0,'procedural',p.biography,j(profile),j(p.state),p.state.location_id);
          for(const [other,relation] of Object.entries(p.relations))db.prepare('INSERT INTO lw_relations VALUES (?,?,?,?)').run(world.id,p.id,other,j(relation));
          const id=uid('le_');db.prepare('INSERT INTO lw_events VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,world.id,null,existing.world.seconds,existing.world.seconds,p.state.location_id,'initialization_expansion',j([p.id]),j({coverage:'initialized_background'}),p.biography,'procedural_initialization');db.prepare('INSERT INTO lw_journal VALUES (?,?,?,?,?,?,?)').run(p.id,id,existing.world.seconds,'initialization',p.biography,'Mein bisheriger Lebensweg ist als Ausgangshintergrund angelegt.',1);
        }
        initializeNewPopulation(loadTown(world.id));
        const rules={...pj(existing.world.rules,{}),neighborhoods:{...pj(existing.world.rules,{}).neighborhoods,...generated.identities}},combined=loadTown(world.id);
        weaveSocial(combined.people,combined.places,rules.neighborhoods,{seed:existing.world.seed,existing:true});
        for(const p of combined.people){db.prepare('UPDATE lw_sims SET profile=? WHERE id=?').run(j(p.profile),p.id);for(const [other,r] of Object.entries(p.relations))db.prepare('INSERT INTO lw_relations VALUES (?,?,?,?) ON CONFLICT(world_id,from_id,to_id) DO UPDATE SET payload=excluded.payload').run(world.id,p.id,other,j(r));}
        db.prepare('UPDATE lw_worlds SET version=version+1,rules=? WHERE world_id=?').run(j(rules),world.id);
      })();return {ok:true,population:count+add};
    }finally{busy.delete(world.id);}
  });
}
