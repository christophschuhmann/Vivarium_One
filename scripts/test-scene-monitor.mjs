import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import net from 'node:net';import {spawn,execFileSync} from 'node:child_process';import {chromium} from 'playwright';
const root=path.resolve(new URL('..',import.meta.url).pathname),scratch=fs.mkdtempSync(path.join(os.tmpdir(),'viv-scene-monitor-'));
process.env.VIV_DATA_DIR=scratch;process.env.VIV_SECRET='scene-monitor-test';process.env.MOCK_PROVIDERS='1';
execFileSync(process.execPath,['scripts/seed_demo.js'],{cwd:root,env:process.env,stdio:'pipe'});
const {db}=await import('../server/living/schema.js'),{createTown,loadTown,advanceTown}=await import('../server/living/engine.js'),{stageView}=await import('../server/living/vivarium.js'),{sceneManifest,historyScene}=await import('../server/living/scene-history.js'),{withPrincipal}=await import('../server/byok.js'),{closeOpenSims}=await import('../server/living/open_sims.js'),{buildWorldManifest,importWorldManifest}=await import('../server/world_io.js');
const user=db.prepare("SELECT * FROM users WHERE email='demo@vivarium.local'").get();let browser,server;
try{
 const {worldId}=await createTown(user,{population:10,seed:73,scenario:'bennington'}),town=loadTown(worldId),anchor=town.people.find(p=>p.anchored),start=town.world.seconds;
 db.prepare('UPDATE lw_sims SET anchored=0 WHERE world_id=?').run(worldId);db.prepare('UPDATE lw_sims SET anchored=1 WHERE id=?').run(anchor.id);
 let captured,callCount=0;
 const out=await withPrincipal(user,()=>advanceTown(user,worldId,{minutes:60,story:true,intervention:{kind:'event',targetId:anchor.id,text:'A letter offers an opportunity that needs a careful reply.'},modelCall:async messages=>{
   callCount++;const c=captured=JSON.parse(messages[1].content),landing=c.landingScenes.find(s=>s.anchoredSimIds.includes(anchor.id));assert(landing,'An anchor has an explicit landing scene');
   const status=landing.events.find(e=>e.at===c.end&&e.cast.some(s=>s.id===anchor.id));assert(status,'An ongoing task still has an end-of-step event');
   const earlier=c.events.find(e=>e.type==='intervention');
   const speech=Array.from({length:8},(_,i)=>({speaker:i%2?anchor.id:'narrator',locationId:landing.locationId,eventId:status.eventId,mode:'speech',text:i===7?'The final decision is still open, but the next practical step is clear.':'Present scene beat '+(i+1)+': the current task continues while the invitation remains a possibility to consider.'}));
   return {usage:{prompt_tokens:1000,completion_tokens:500},content:JSON.stringify({story:'A letter arrives.\n\nThe invitation offers a possibility, and the present task still needs attention.',thoughts:c.requiredThoughtSimIds.map(id=>({simId:id,eventId:c.events.find(e=>e.participants.includes(id)).id,text:'I consider what this recorded moment means for my next step.'})),narration:speech,flashbacks:[{simId:anchor.id,eventId:earlier.id,title:'The invitation arrives',narration:[{speaker:'narrator',text:earlier.description,mode:'speech'},{speaker:anchor.id,text:'I need to consider this before I reply.',mode:'speech'}]}]})};
 }}));
 assert.equal(callCount,1);assert.equal(out.metrics.rejections.length,0);assert.equal(out.metrics.promptTokens,1000);assert.equal(out.metrics.completionTokens,500);
 const manifest=sceneManifest(worldId,out.beatId);assert.equal(manifest.length,2);const current=manifest.find(s=>s.kind==='present'),frame=historyScene(worldId,out.beatId,current.key);assert.equal(frame.tick.narration.length,8);assert.match(frame.tick.narration.at(-1).text,/final decision/);
 // The original live preview loses a speaker after they leave. Recorded speech
 // must still retain the name and voice, never degrade to narrator stars.
 const location=frame.locations[0].id,away=town.people.find(p=>p.id!==anchor.id&&p.state.location_id!==location);
 db.prepare('INSERT INTO lw_scene_lines VALUES (?,?,?,?,?,?,?,?)').run(worldId,out.beatId,captured.events.find(e=>e.participants.includes(anchor.id)).id,location,away.id,'A recorded line from a colleague who has left.','speech','calm');
 const view=await stageView(db.prepare('SELECT * FROM worlds WHERE id=?').get(worldId),{place:location});assert(view.characters.some(c=>c.id===away.id));assert(view.sceneManifest.length===2);
 const copy=importWorldManifest(user,buildWorldManifest(worldId),null),copied=db.prepare('SELECT * FROM lw_scene_frames WHERE world_id=?').get(copy.worldId),cp=JSON.parse(copied.payload);assert(cp.characters.every(c=>c.id!==anchor.id));assert.equal(cp.tick.narration.length,8);
 assert.equal(historyScene(copy.worldId,out.beatId,current.key),null);assert.equal(loadTown(worldId).world.seconds,start+3600);
 console.log('PASS explicit end-state events, single-call complete landing scene, immutable snapshots/export remapping, speaker metadata beyond current cast, timing tokens and foreign scene isolation');

 if(process.argv.includes('--browser')){
   const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));const base='http://127.0.0.1:'+port;
   server=spawn(process.execPath,['server/index.js'],{cwd:root,env:{...process.env,PORT:String(port),VIV_HOST:'127.0.0.1',HYPRLAB_API_KEY:'',OPENROUTER_API_KEY:'',MUSIC_AUTOSTART:'0',MUSIC_API_URL:'http://127.0.0.1:1'},detached:true,stdio:'ignore'});
   for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
   browser=await chromium.launch({headless:true,args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:1280,height:960}});
   await context.addInitScript(()=>{localStorage.setItem('viv_lang','en');localStorage.setItem('viv_living_display','en');localStorage.setItem('viv_tts',JSON.stringify({prepare:false,autoplay:false,innerVoice:false,musicOn:false}));});await context.route('**/places/*/music',r=>r.fulfill({json:{music:null}}));
   assert.equal((await context.request.post(base+'/api/auth/login',{data:{email:'demo@vivarium.local',password:'alice-and-bob'}})).status(),200);
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/#/stage?w='+worldId+'&sim='+anchor.id);await page.locator('#stage-root').waitFor();
   await page.locator('#lw-scenes').click();await page.locator('.lw-history-card').first().waitFor();assert.equal(await page.locator('.lw-history-card').count(),2);
   await page.locator('#lw-history-next').click();await page.locator('.lw-history-script').filter({hasText:'final decision'}).waitFor();assert.equal(await page.locator('.lw-history-script .lw-script-beat').count(),8);
   await page.screenshot({path:'artifacts/expanded-world/scene-monitor-desktop.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/expanded-world/scene-monitor-mobile.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
   await page.locator('#lw-history-play').click();await page.locator('#cine-seek').waitFor();await page.waitForFunction(()=>livingReel?.index===1&&document.querySelector('#storylines')?.textContent.includes('final decision'));
   await page.locator('#cine-prev').click();await page.waitForFunction(()=>livingReel?.index===0&&document.querySelector('#storylines')?.textContent.includes('careful reply'));
   await page.locator('#cine-seek').evaluate(el=>{el.value='1';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForFunction(()=>livingReel?.index===1&&document.querySelector('#storylines')?.textContent.includes('final decision'));
   await context.route('**/history/*/scenes/*',async route=>{await new Promise(r=>setTimeout(r,200));try{await route.continue();}catch{}});
   await page.locator('#cine-prev').click();await page.locator('#cine-seek').evaluate(el=>{el.value='1';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForTimeout(700);await page.waitForFunction(()=>livingReel?.index===1&&document.querySelector('#storylines')?.textContent.includes('final decision'));
   for(const id of ['#cine-prev','#cine-next','#cine-exit']){const b=await page.locator(id).boundingBox();assert(b&&b.x>=0&&b.x+b.width<=392&&b.y+b.height<=844,id);}
   await page.waitForTimeout(600);await page.screenshot({path:'artifacts/expanded-world/scene-replay-mobile.png'});assert.equal(await page.locator('#storylines .sline').first().evaluate(el=>getComputedStyle(el).color),'rgb(239, 234, 255)');await page.locator('#cine-exit').click();await page.waitForFunction(()=>!livingReel&&!document.querySelector('#cine-hud'));await page.locator('#lw-scenes').waitFor();
   const saved=await(await context.request.get(base+'/api/living/worlds/'+worldId)).json();assert.equal(saved.simulation.seconds,start+3600);assert.equal(saved.simulation.version,out.version);assert.deepEqual(errors,[]);
   const cross=await context.request.get(base+'/api/living/worlds/'+copy.worldId+'/history/'+out.beatId+'/scenes/'+encodeURIComponent(current.key));assert.equal(cross.status(),404);
   console.log('PASS actual scene monitor, filmstrip, all dialogue, historical Stage playback, previous/seek/return controls, mobile layout, no clock changes or browser errors');
 }
}finally{await browser?.close();if(server)try{process.kill(-server.pid,'SIGTERM');}catch{}closeOpenSims();db.close();fs.rmSync(scratch,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
