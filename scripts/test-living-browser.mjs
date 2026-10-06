// Browser integration with an isolated server and fixture provider catalog.
// Creates its own database and a tiny music fixture; never targets production.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import Database from 'better-sqlite3';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'vivarium-browser-'));
const children=[];let browser;
async function port(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
const gamePort=await port(),musicPort=await port(),base=`http://127.0.0.1:${gamePort}`;
const music=path.join(scratch,'music-library');fs.mkdirSync(path.join(music,'indices'),{recursive:true});fs.mkdirSync(path.join(music,'tars'));
// The audio fixture remains separate from the real downloaded collection.
const audio=Buffer.alloc(8192,1);fs.writeFileSync(path.join(music,'tars/fixture.tar'),audio);
fs.writeFileSync(path.join(music,'README.md'),'Isolated test music, no production assets.');
fs.writeFileSync(path.join(music,'audio-index.json'),JSON.stringify({schema_version:1,shards:[{file:'tars/fixture.tar',bytes:audio.length}],tracks:{1:{tar:'tars/fixture.tar',offset:0,bytes:audio.length}}}));
const metadata=new Database(path.join(music,'indices/rpg_metadata.db'));
metadata.exec(`CREATE TABLE tracks(row_id INTEGER PRIMARY KEY,title,subset,tags_text,mood_text,score_average,play_count,upvote_count,duration_seconds,music_whisper_caption,audio_url,has_singing,evoked_emotions,nsfw_overall_label);CREATE TABLE genre_situations(row_id,genre_key,genre_name,situations);`);
metadata.prepare('INSERT INTO tracks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(1,'Fixture quiet home piano','test','piano calm','peaceful',8,0,0,180,'quiet library peaceful study piano morning home cosy calm','','no','calm','likely_sfw');
metadata.prepare('INSERT INTO genre_situations VALUES (?,?,?,?)').run(1,'modern_realistic','Modern realistic',JSON.stringify(['quiet library peaceful study piano morning home cosy calm']));metadata.close();
const env={...process.env,VIV_DATA_DIR:scratch,VIV_HOST:'127.0.0.1',MOCK_PROVIDERS:'0',PORT:String(gamePort),MUSIC_API_URL:`http://127.0.0.1:${musicPort}`,MUSIC_PORT:String(musicPort),MUSIC_DATA_DIR:music,MUSIC_CONTROL_TOKEN:'fixture-control-token',HYPRLAB_API_KEY:'fixture-central-key',OPENROUTER_API_KEY:''};
execFileSync(process.execPath,[path.join(root,'scripts/seed_demo.js')],{cwd:root,env,stdio:'pipe'});
const dbURL=pathToFileURL(path.join(root,'server/db.js')).href;
execFileSync(process.execPath,['--input-type=module','-e',`import {db,setSetting} from ${JSON.stringify(dbURL)};setSetting('local_owner_user_id',db.prepare("SELECT id FROM users WHERE email='demo@vivarium.local'").get().id);db.prepare("UPDATE users SET credit_balance=0 WHERE role='player'").run();db.close();`],{cwd:root,env});
execFileSync(process.execPath,['--input-type=module','-e',`import {db} from ${JSON.stringify(dbURL)};import {encryptSecret} from ${JSON.stringify(pathToFileURL(path.join(root,'server/byok.js')).href)};db.prepare("UPDATE users SET hypr_key=?,or_enabled=1 WHERE email='demo@vivarium.local'").run(encryptSecret('fixture-personal-key'));db.close();`],{cwd:root,env});
const preload=path.join(scratch,'provider-fixture.mjs');
fs.writeFileSync(preload,`import fs from 'node:fs';const real=globalThis.fetch;const models=JSON.parse(fs.readFileSync(${JSON.stringify(path.join(root,'config/hyprlab_models.json'))})).models;globalThis.fetch=async(url,opts)=>{const u=new URL(url);if(u.hostname!=='api.hyprlab.io')return real(url,opts);if(u.pathname.endsWith('/models'))return Response.json({data:models});const b=JSON.parse(opts.body),messages=b.messages||[],system=messages[0]?.content||'',ctx=JSON.parse(messages.at(-1)?.content||'{}');let content;if(system.includes('fictional biographies'))content={biographies:ctx.people.map(p=>({id:p.id,text:p.existing+' Ein freundlicher Nachbar mit sorgfältig entwickelten Motiven, prägenden Erinnerungen und guten Gründen für den Alltag.'}))};else if(system.includes('Living World Storyteller')){const first=ctx.events.find(e=>e.participants.includes(ctx.owned[0]));content={story:'Ein freundlicher Morgen.',thoughts:ctx.owned.map(id=>({simId:id,eventId:ctx.events.find(e=>e.participants.includes(id)).id,text:'Ich freue mich auf die Begegnungen des Tages.',confidence:.7})),narration:[{speaker:ctx.owned[0],eventId:first.id,locationId:first.location_id,mode:'speech',text:'Guten Morgen!',emotion:'friendly'}]};}else if(system.includes('Living World director'))content={reply:'Ich kann den Anker der ersten Figur lösen.',actions:[{type:'set_anchor',kind:'sim',id:ctx.viewedSims[0].id,enabled:false}]};else content={reply:'Danke für die Frage. Ich freue mich auf einen ruhigen Tag.',thought:'Eine freundliche Frage tut gut.',mood:'hopeful'};return Response.json({choices:[{message:{content:JSON.stringify(content)}}],usage:{prompt_tokens:100,completion_tokens:100}});};`);
function start(args){const child=spawn(process.execPath,args,{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']});let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',data=>logs=(logs+data).slice(-5000));children.push(child);return ()=>logs;}
const gameLogs=start(['--import',preload,'server/index.js']);start(['server/music_server.js']);
async function ready(url){for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('Fixture server did not start: '+gameLogs());}
try {
 await Promise.all([ready(base),ready(env.MUSIC_API_URL+'/api/stats')]);
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await context.addInitScript(()=>localStorage.setItem('viv_tts',JSON.stringify({prepare:false,autoplay:false,innerVoice:false,musicOn:false})));
 const login=await context.request.post(base+'/api/auth/login',{data:{email:'demo@vivarium.local',password:'alice-and-bob'}});assert.equal(login.status(),200);
 const created=await context.request.post(base+'/api/living/towns',{data:{population:500,title:'Browser town',seed:73}});assert.equal(created.status(),200);const world=(await created.json()).worldId;
 const snapshot=async()=> (await context.request.get(base+'/api/living/worlds/'+world)).json();
 await page.goto(base+'/living.html?world='+world);await page.locator('#stage-root').waitFor();await page.locator('#lw-anchor-next').waitFor();assert.ok(page.url().includes('#/stage'));
 assert.ok(await page.locator('.stage-char').count()>0);assert.ok(await page.locator('img,svg image').count()<=50);
 const anchorBefore=await snapshot(),navAnchors=await (await context.request.get(base+'/api/living/worlds/'+world+'/map/anchors')).json();
 assert.equal(await page.locator('.lw-minimap').count(),0);
 await page.locator('#lw-anchor-next').click();await page.waitForFunction(id=>!livingJump.busy&&stageState.pov.id===id,navAnchors.anchors[1].id);
 await page.keyboard.press('ArrowLeft');await page.waitForFunction(id=>stageState.pov.id===id&&!livingJump.busy,navAnchors.anchors[0].id);
 assert.equal((await snapshot()).simulation.seconds,anchorBefore.simulation.seconds);
 // A building anchor has a real scene destination, even though it is a group on the map.
 const allPlaces=await (await context.request.get(base+'/api/living/worlds/'+world+'/map')).json();
 const landmark=allPlaces.nodes.find(n=>n.landmark);
 assert.equal((await context.request.put(base+'/api/living/worlds/'+world+'/anchors',{data:{kind:'place',id:landmark.id,enabled:true}})).status(),200);
 await page.reload();await page.locator('#lw-play-anchor-filter').selectOption('place');await page.locator('#lw-anchor-next').click();await page.waitForFunction(()=>stageState.pov.type==='location'&&!livingJump.busy);
 assert.equal((await snapshot()).simulation.seconds,anchorBefore.simulation.seconds);
 await page.locator('#lw-play-anchor-filter').selectOption('sim');await page.locator('#lw-anchor-next').click();await page.waitForFunction(()=>stageState.pov.type==='character'&&!livingJump.busy);
 // A traveller's true location stays null, but their scene and Mind remain accessible.
 const fixtureDB=new Database(path.join(scratch,'vivarium.db'));
 const travellingId=await page.evaluate(()=>stageState.pov.id),traveller=fixtureDB.prepare('SELECT state,location_id FROM lw_sims WHERE id=?').get(travellingId),travelState=JSON.parse(traveller.state);
 const routeNode=fixtureDB.prepare('SELECT parent_id FROM lw_places WHERE id=(SELECT household_id FROM lw_sims WHERE id=?)').get(travellingId).parent_id;
 travelState.location_id=null;travelState.route={from:traveller.location_id,destination:traveller.location_id,index:1,path:[{id:routeNode,seconds:120},{id:traveller.location_id,seconds:120}],remaining:60};
 fixtureDB.prepare('UPDATE lw_sims SET state=?,location_id=NULL WHERE id=?').run(JSON.stringify(travelState),travellingId);
 await page.evaluate(async()=>stageScreen());await page.locator('.stage-char.pov').waitFor();assert.ok(await page.locator('.lw-name-tag').getByText('unterwegs',{exact:false}).count()>0);await page.locator('.stage-char.pov').click();await page.locator('#lw-talk').waitFor();await page.locator('.modal-bg .x').click();
 assert.equal(fixtureDB.prepare('SELECT location_id FROM lw_sims WHERE id=?').get(travellingId).location_id,null);
 fixtureDB.prepare('UPDATE lw_sims SET state=?,location_id=? WHERE id=?').run(traveller.state,traveller.location_id,travellingId);fixtureDB.close();await page.evaluate(async()=>stageScreen());
 await page.locator('#pl').click();await page.locator('#lw-picker-map .lnode').first().waitFor();assert.ok(await page.locator('img,svg image').count()<=50);await page.locator('.modal-bg .x').click();
 await page.locator('.stage-char').first().click();await page.locator('.mind-cols').waitFor();assert.equal(await page.locator('#lw-stats').count(),1);
 const lockedPov=await page.evaluate(()=>stageState.pov.id);await page.locator('#iv-in').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>stageState.pov.id),lockedPov);
 const before=await snapshot();await page.locator('#iv-in').fill('Wie geht es dir heute?');await page.locator('#iv-send').click();await page.locator('#iv-log').getByText('Danke für die Frage.',{exact:false}).waitFor();assert.equal((await snapshot()).simulation.seconds,before.simulation.seconds);
 await page.locator('#lw-talk').click();await page.locator('#lw-talk-input').fill('Erzähl mir etwas über deine Wünsche.');await page.locator('#lw-talk-send').click();await page.locator('#lw-talk-log').getByText('Danke für die Frage.',{exact:false}).waitFor();assert.equal((await snapshot()).simulation.seconds,before.simulation.seconds);
 await page.locator('.modal-bg').last().locator('.x').click();await page.locator('#lw-stats').click();await page.locator('#lw-journal .attr').first().waitFor();assert.ok(await page.locator('.lw-stat progress').count()>=8);await page.locator('#lw-close-profile').click();
 await page.locator('#intervene').click();await page.locator('#iv-text').fill('Ein freundlicher Brief kommt an.');await page.locator('#iv-go').click();await page.locator('#veil .thinking-veil').waitFor({state:'hidden'});assert.equal((await snapshot()).simulation.seconds,before.simulation.seconds+60);assert.ok(await page.locator('#storylines').getByText('Guten Morgen!',{exact:false}).count()>0);
 await page.locator('#gm-chip').click();await page.locator('#gmc-in').fill('Ändere den Erzählfokus.');await page.locator('#gmc-send').click();await page.locator('.gmc-card [data-apply]').waitFor();const anchoredBefore=(await snapshot()).anchors.sims.length;await page.locator('.gmc-card [data-apply]').click();await page.getByText('✓ Applied',{exact:true}).waitFor();assert.equal((await snapshot()).anchors.sims.length,anchoredBefore-1);await page.locator('.gmc-x').click();
 await page.goto(base+'/#/atlas?w='+world);await page.locator('#lw-atlas .lnode').first().waitFor();
 const overview=await (await context.request.get(base+'/api/living/worlds/'+world+'/map')).json(),neighborhood=overview.nodes.find(n=>n.kind==='neighborhood'),second=overview.nodes.filter(n=>n.kind==='neighborhood').at(-1);
 await page.locator(`#lw-atlas [data-id="${neighborhood.id}"]`).dblclick();await page.locator(`[data-group="${neighborhood.id}"]`).waitFor();
 const expanded=await (await context.request.get(base+'/api/living/worlds/'+world+'/map?expanded='+encodeURIComponent(JSON.stringify([neighborhood.id])))).json(),house=expanded.nodes.find(n=>n.kind==='building'&&!n.landmark);
 await page.locator(`#lw-atlas [data-id="${house.id}"]`).dblclick();await page.locator(`[data-group="${house.id}"]`).waitFor();assert.ok(await page.locator('img,svg image').count()<=50);
 assert.ok(await page.locator('#lw-atlas .lw-group-boundary').count()>=2);
 await page.locator(`#lw-atlas [data-collapse="${house.id}"]`).click();await page.locator(`[data-group="${house.id}"]`).waitFor({state:'detached'});assert.equal(await page.locator(`[data-group="${neighborhood.id}"]`).count(),1);
 await page.locator(`#lw-atlas [data-id="${house.id}"]`).dblclick();await page.locator(`[data-group="${house.id}"]`).waitFor();
 // Every child is geometrically contained in its circular group, including nested rooms.
 assert.ok(await page.evaluate(()=>{const g=lwCircleLayout;return !!g;}));
 await page.locator('#lw-atlas [data-fit]').click();
 // Open a second neighborhood using the controller's public expansion path, as a sidebar reveal does.
 await page.evaluate(async id=>{await document.querySelector('#lw-atlas').livingMap.expand(id);},second.id);
 await page.locator(`[data-group="${second.id}"]`).waitFor();await page.locator(`[data-group="${neighborhood.id}"]`).waitFor({state:'detached'});
 await page.evaluate(async id=>document.querySelector('#lw-atlas').livingMap.expand(id),neighborhood.id);await page.locator(`[data-group="${neighborhood.id}"]`).waitFor();assert.equal(await page.locator(`[data-group="${second.id}"]`).count(),1);
 assert.ok(await page.evaluate(()=>{const graph=document.querySelector('#lw-atlas').livingMap.getGraph(),by=new Map(graph.nodes.map(n=>[n.id,n]));return graph.nodes.every(n=>!n.parent_id||Math.hypot(n.x-by.get(n.parent_id).x,n.y-by.get(n.parent_id).y)+n.r<by.get(n.parent_id).r);}));
 // Party roster: four names plus the full-list overlay, then a paused double-click jump.
 const partyDB=new Database(path.join(scratch,'vivarium.db')),partyRows=partyDB.prepare('SELECT id,state,location_id FROM lw_sims WHERE world_id=? ORDER BY id LIMIT 8').all(world);
 const houseData=await (await context.request.get(base+'/api/living/worlds/'+world+'/map?expanded='+encodeURIComponent(JSON.stringify([house.id])))).json(),partyRoom=houseData.nodes.find(n=>n.parent_id===house.id&&n.kind==='room');
 for(const s of partyRows){const state=JSON.parse(s.state);state.location_id=partyRoom.id;state.route=null;partyDB.prepare('UPDATE lw_sims SET location_id=?,state=? WHERE id=?').run(partyRoom.id,JSON.stringify(state),s.id);}
 await page.evaluate(async id=>document.querySelector('#lw-atlas').livingMap.expand(id),house.id);await page.locator(`[data-group="${house.id}"]`).waitFor();
 const partyNode=page.locator(`#lw-atlas [data-id="${partyRoom.id}"]`);await partyNode.locator('[data-presence-more]').waitFor();assert.equal(await partyNode.locator('[data-person]').count(),4);await page.screenshot({path:path.join(root,'artifacts/living-world/circular-party-fixture.png')});
 assert.ok(await partyNode.locator('[data-avatar]').count()>=1);assert.ok(await page.locator('img,svg image').count()<=50);
 await partyNode.locator('[data-presence-more]').click();await page.locator('#lw-presence-list .lw-presence-row').first().waitFor();assert.ok(await page.locator('#lw-presence-list .lw-presence-row').count()>=8);await page.locator('.modal-bg .x').click();
 const clockBeforeJump=(await snapshot()).simulation.seconds;
 await partyNode.click({position:{x:88,y:18}});assert.ok(page.url().includes('/atlas'));await partyNode.dblclick({position:{x:88,y:18}});await page.locator('#stage-root').waitFor();assert.equal(await page.evaluate(()=>stageState.pov.id),partyRoom.id);assert.equal((await snapshot()).simulation.seconds,clockBeforeJump);
 for(const s of partyRows)partyDB.prepare('UPDATE lw_sims SET location_id=?,state=? WHERE id=?').run(s.location_id,s.state,s.id);partyDB.close();
 await page.goto(base+'/#/atlas?w='+world);await page.locator('#lw-atlas .lnode').first().waitFor();
 // Search includes Sims without anchors.
 const nonAnchor=await (await context.request.get(base+'/api/living/worlds/'+world+'/sims?anchored=0&limit=1')).json();await page.locator('#lw-world-search').fill(nonAnchor.sims[0].name);await page.locator('#lw-world-results').getByText(nonAnchor.sims[0].name,{exact:true}).waitFor();
 await page.locator('#lw-world-search').fill('Library');await page.locator('[data-result]').first().waitFor();await page.locator('[data-result]').first().click();await page.locator('#lw-world-selection').getByRole('heading',{name:/Library|Bibliothek/}).waitFor();
 assert.ok(await page.locator('#lw-world-anchors .lw-anchor-row').count()>=1);
 assert.ok(await page.locator('img,svg image').count()<=50);
 await page.locator('#lw-atlas [data-city]').click();await page.waitForFunction(()=>document.querySelectorAll('#lw-atlas .lw-circle-group').length===0);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await page.locator('img,svg image').count()<=50);await page.setViewportSize({width:1440,height:1050});
 await page.goto(base+'/#/cast?w='+world);await page.locator('#lw-explore-grid [data-resident]').first().waitFor();assert.equal(await page.locator('#lw-explore-grid [data-resident]').count(),18);
 await page.locator('#lw-explore-anchor').selectOption('0');await page.waitForFunction(()=>document.querySelector('#lw-explore-total')?.textContent.startsWith('499'));await page.locator('#lw-explore-age').selectOption('70:120');await page.waitForFunction(()=>Array.from(document.querySelectorAll('#lw-explore-grid [data-resident] small:first-of-type')).every(n=>parseInt(n.textContent)>=70)&&document.querySelectorAll('#lw-explore-grid [data-resident]').length>0);
 await page.locator('#lw-explore-reset').click();await page.waitForFunction(()=>document.querySelector('#lw-explore-total')?.textContent.startsWith('500'));await page.locator('#lw-explore-family').fill(nonAnchor.sims[0].name.split(' ').slice(1).join(' '));await page.waitForTimeout(300);await page.locator('#lw-explore-first').fill(nonAnchor.sims[0].name.split(' ')[0]);await page.locator('#lw-explore-grid').getByText(nonAnchor.sims[0].name,{exact:true}).waitFor();await page.locator('#lw-explore-grid [data-resident]').first().click();await page.locator('#lw-journal').waitFor();await page.locator('#lw-close-profile').click();
 await page.locator('#lw-browse').click();await page.locator('#lw-sim-list .cast-tile').first().waitFor();assert.equal(await page.locator('#lw-sim-list .cast-tile').count(),12);await page.locator('#lw-next').click();await page.waitForFunction(()=>document.querySelector('#lw-count')?.textContent.includes('13–24'));assert.ok(await page.locator('img,svg image').count()<=50);await page.locator('.modal-bg .x').click();
 await page.goto(base+'/#/stage?w='+world);await page.locator('#lw-anchor-next').waitFor();await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await page.locator('img,svg image').count()<=50);assert.deepEqual(errors,[]);
 console.log('PASS isolated original stage and sprites, mind and Stats, paused private/talk conversations, intervention narration and clock commit, original GM reviewed anchor changes, 500-Sim circular atlas with independent expansions, bilingual search, travelling Sim views and paused anchor navigation, party attendance overlay, Sim portraits, filtered full resident explorer, double-click scene jumps, least-recently-used collapse, shared 50-image budget and mobile layout');
 await context.close();
}finally{
 await browser?.close();await Promise.all(children.map(child=>new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);try{process.kill(-child.pid,'SIGTERM');}catch{}setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}resolve();},2000).unref();})));fs.rmSync(scratch,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
