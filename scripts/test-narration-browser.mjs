// Real browser audio + production narration/reel UI. Network audio is a short
// deterministic WAV; isolated world, no paid calls and no live database changes.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';import {chromium} from 'playwright';
const root=path.resolve(new URL('..',import.meta.url).pathname),scratch=fs.mkdtempSync(path.join(os.tmpdir(),'viv-narration-browser-'));
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const base='http://127.0.0.1:'+port,env={...process.env,VIV_DATA_DIR:scratch,VIV_HOST:'127.0.0.1',PORT:String(port),MOCK_PROVIDERS:'1',HYPRLAB_API_KEY:'',OPENROUTER_API_KEY:'',MUSIC_AUTOSTART:'0',MUSIC_API_URL:'http://127.0.0.1:1'};
const pcm=Buffer.alloc(16000),wav=Buffer.alloc(44+pcm.length);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);pcm.copy(wav,44);
let browser,server,logs='';
try{
 execFileSync(process.execPath,['scripts/seed_demo.js'],{cwd:root,env,stdio:'pipe'});
 server=spawn(process.execPath,['server/index.js'],{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']});for(const s of [server.stdout,server.stderr])s.on('data',b=>logs=(logs+b).slice(-5000));
 for(let i=0;i<150;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const ctx=await browser.newContext({viewport:{width:1280,height:900}});
 await ctx.addInitScript(()=>{
  localStorage.setItem('viv_lang','en');localStorage.setItem('viv_living_display','en');localStorage.setItem('viv_tts',JSON.stringify({prepare:false,autoplay:false,innerVoice:false,musicOn:false}));
  const Original=window.Audio;window.audioEvents=[];
  window.Audio=function(url){const audio=new Original(url);for(const event of ['playing','ended','error'])audio.addEventListener(event,()=>audioEvents.push({url,event,at:performance.now(),time:audio.currentTime,duration:audio.duration}));return audio;};
 });
 const page=await ctx.newPage(),errors=[],requests=[],assets=new Map(),counts=new Map();let blockSecond=true;
 page.on('pageerror',e=>errors.push(e.message));
 await ctx.route('**/api/tts',async route=>{
  const b=route.request().postDataJSON();requests.push(b);const id='speech-'+requests.length;const n=(counts.get(b.text)||0)+1;counts.set(b.text,n);
  if(b.text.startsWith('Slow'))await new Promise(r=>setTimeout(r,650));
  if(b.text==='Fail second.'&&blockSecond||b.text.startsWith('Inner failure'))return route.fulfill({status:503,contentType:'application/json',body:'{"error":{"message":"Temporary test failure"}}'});
  assets.set(id,{text:b.text,corrupt:b.text==='Corrupt first.'&&!b.regenerate});
  await route.fulfill({contentType:'application/json',body:JSON.stringify({assetId:id,seconds:.5})});
 });
 await ctx.route('**/api/assets/speech-*',route=>{const a=assets.get(new URL(route.request().url()).pathname.split('/').at(-1));return route.fulfill({contentType:a?.corrupt?'application/octet-stream':'audio/wav',body:a?.corrupt?Buffer.from('broken'):wav});});
 await ctx.route('**/api/living/worlds/*/places/*/music',route=>route.fulfill({contentType:'application/json',body:'{"music":null}'}));
 assert.equal((await ctx.request.post(base+'/api/auth/login',{data:{email:'demo@vivarium.local',password:'alice-and-bob'}})).status(),200);
 await page.goto(base);await page.waitForFunction(()=>typeof setupNarrationPlayer==='function'&&!!S.user);
 await page.evaluate(()=>{
  const d=document.createElement('div');d.id='speech-fixture';d.style.cssText='position:fixed;inset:90px 10px auto;z-index:30000;background:white;padding:20px';d.innerHTML='<button id="tts-play">▶</button><button id="tts-pause">⏸</button><button id="tts-replay">Replay</button><input type="checkbox" id="tts-auto"><div id="storylines"></div><span id="clicked-line">Do not replace my text</span>';document.body.append(d);
  window.installLines=texts=>{const lines=texts.map(text=>({speaker:'narrator',mode:'speech',text}));document.querySelector('#storylines').innerHTML=renderNarration(lines,[]);setupNarrationPlayer(lines,[]);};
 });
 const completed=()=>page.waitForFunction(()=>!player.active&&player.failedAt==null,{},{timeout:20000});
 const endedTexts=async()=>{const urls=await page.evaluate(()=>audioEvents.filter(e=>e.event==='ended').map(e=>e.url));return urls.map(url=>assets.get(url.split('/').at(-1))?.text);};
 const reset=()=>page.evaluate(()=>{stopNarration();audioEvents.length=0;});
 const long='A complete sentence with meaning. '.repeat(37)+'Keep this unpunctuated final fragment';
 const chunks=await page.evaluate(t=>factChunks(t),long);assert.equal(chunks.join(' '),long);assert(chunks.every(t=>t.length<=480));
 await page.evaluate(()=>installLines([]));assert(await page.locator('#tts-play').isDisabled());
 await page.evaluate(t=>installLines([t,'The final spoken line.']),long);assert(await page.locator('#tts-play').isEnabled());await page.locator('#tts-play').click();await completed();assert.deepEqual(await endedTexts(),[...chunks,'The final spoken line.']);
 assert(await page.evaluate(()=>audioEvents.filter(e=>e.event==='ended').every(e=>e.time>=e.duration-.03)));
 console.log('PASS actual audio reaches every end, lossless long text/final fragment and empty-to-speaking scene');

 await reset();await page.evaluate(()=>installLines(['Good first.','Fail second.','Good last.']));await page.locator('#tts-play').click();await page.waitForFunction(()=>player.failedAt===1);assert.deepEqual(await endedTexts(),['Good first.']);blockSecond=false;await page.locator('#tts-play').click();await completed();assert.deepEqual(await endedTexts(),['Good first.','Fail second.','Good last.']);
 await reset();await page.evaluate(()=>installLines(['Corrupt first.','After corrupt.']));await page.locator('#tts-play').click();await completed();assert.deepEqual(await endedTexts(),['Corrupt first.','After corrupt.']);assert(requests.some(b=>b.text==='Corrupt first.'&&b.regenerate));
 console.log('PASS synthesis failure holds its passage and retry resumes there; corrupt clip regenerates without skipping');

 await reset();await page.evaluate(()=>installLines(['Slow paused.']));await page.locator('#tts-play').click();await page.locator('#tts-pause').click();await page.waitForTimeout(850);assert.equal((await page.evaluate(()=>audioEvents.filter(e=>e.event==='playing'))).length,0);await page.locator('#tts-pause').click();await completed();assert.deepEqual(await endedTexts(),['Slow paused.']);
 await reset();await page.evaluate(()=>{installLines(['Slow obsolete.']);document.querySelector('#tts-play').click();});await page.waitForTimeout(100);await page.evaluate(()=>installLines(['Fresh replacement.']));await page.locator('#tts-play').click();await completed();await page.waitForTimeout(700);assert.deepEqual(await endedTexts(),['Fresh replacement.']);
 await reset();await page.evaluate(()=>speakTextChunks('Clicked line stays intact.',null,document.querySelector('#clicked-line')));assert.equal(await page.locator('#clicked-line').textContent(),'Do not replace my text');assert.deepEqual(await endedTexts(),['Clicked line stays intact.']);
 await reset();await page.evaluate(()=>speakTextChunks('Inner failure. '.repeat(45)+'Never play this tail',null,null));assert.deepEqual(await endedTexts(),[]);
 console.log('PASS pause during loading, stale request isolation, clicked-text preservation and failed Inner Voice stops');

 await page.evaluate(()=>{document.querySelector('#speech-fixture').remove();document.querySelectorAll('.toast').forEach(e=>e.remove());});
 const create=await ctx.request.post(base+'/api/living/towns',{data:{population:10,seed:73,scenario:'bennington'},timeout:120000});assert.equal(create.status(),200,await create.text());const {worldId}=await create.json(),prefix='/api/living/worlds/'+worldId;
 const snapshot=await(await ctx.request.get(base+prefix)).json();let reelFetches=0;
 await ctx.route('**/api/worlds/'+worldId+'*',async route=>{const response=await route.fetch(),body=await response.json();body.flashbacks=[0,1].map(i=>({beat_id:'fixture',sim_id:body.characters[0].id,ordinal:i,title:'Historical moment '+i}));await route.fulfill({json:body});});
 await ctx.route('**'+prefix+'/flashbacks/**',async route=>{
  reelFetches++;const ordinal=Number(route.request().url().split('/').at(-1));
  const body=await(await ctx.request.get(base+prefix+'/view')).json(),c=body.characters[0],loc=body.locations[0];
  await route.fulfill({json:{title:'Historical moment '+ordinal,characters:[c],locations:[loc],tick:{sim_time:'2026-09-21T08:00:00.000Z',pov_location_id:loc.id,narration:[{speaker:'narrator',text:'Historical passage '+ordinal+'.',mode:'speech'}],states:[{...c.state,character_id:c.id}]}}});
 });
 await page.goto(base+'/#/stage?w='+worldId);await page.locator('#stage-root').waitFor();await page.locator('#lw-recap').waitFor();
 const pov=await page.evaluate(()=>({...stageState.pov}));
 await page.locator('#lw-recap').click();await page.locator('.story-meta').filter({hasText:'Historical moment 0'}).waitFor();assert.equal(reelFetches,1);assert.equal(await page.locator('#stage-cast .stage-char').count(),1);assert.equal(await page.locator('.lw-anchor-nav').isVisible(),false);assert.equal(await page.locator('.here-rail').isVisible(),false);assert.equal(await page.locator('#advance').isVisible(),false);
 await page.waitForTimeout(650);assert.equal(reelFetches,1,'silent reel waits for reading');
 await page.screenshot({path:'artifacts/expanded-world/flashback-playback-desktop.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/expanded-world/flashback-playback-mobile.png'});for(const id of ['#cine-next','#cine-exit']){const b=await page.locator(id).boundingBox();assert(b&&b.x>=0&&b.x+b.width<=392&&b.y+b.height<=844);}await page.setViewportSize({width:1280,height:900});
 await page.locator('#cine-next').click();await page.locator('.story-meta').filter({hasText:'Historical moment 1'}).waitFor();assert.equal(reelFetches,2);await page.locator('#cine-next').click();await page.waitForFunction(()=>!livingReel&&!document.querySelector('#cine-hud'));await page.locator('#lw-recap').waitFor();assert.deepEqual(await page.evaluate(()=>({...stageState.pov})),pov);
 assert.equal((await(await ctx.request.get(base+prefix)).json()).simulation.seconds,snapshot.simulation.seconds);
 await page.evaluate(()=>saveTtsPrefs({autoplay:true}));await page.locator('#lw-recap').click();await page.waitForFunction(()=>!!livingReel);await page.waitForFunction(()=>!livingReel,{},{timeout:20000});await page.waitForFunction(()=>audioEvents.filter(e=>e.event==='ended'&&e.url.includes('speech-')).length>=2);
 await page.evaluate(()=>{stopNarration();saveTtsPrefs({autoplay:false});});await page.locator('#lw-recap').click();await page.locator('#cine-next').waitFor();await page.evaluate(()=>location.hash='#/worlds');await page.waitForFunction(()=>!livingReel&&!document.querySelector('#stage-root'));await page.waitForTimeout(400);assert.equal(await page.locator('#stage-root').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS lazy historical frames, manual/automatic playback, current-scene restoration, unchanged clock, navigation cancellation and no browser errors');
}catch(e){console.error(logs);throw e;}finally{await browser?.close();if(server)try{process.kill(-server.pid,'SIGTERM');}catch{}fs.rmSync(scratch,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
