// Real browser capture/WAV conversion with synthetic microphone hardware. ASR and
// chat replies are deterministic network fixtures: no paid calls or live-world edits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
const root=path.resolve(new URL('..',import.meta.url).pathname), scratch=fs.mkdtempSync(path.join(os.tmpdir(),'viv-microphone-'));
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const base='http://127.0.0.1:'+port,env={...process.env,VIV_DATA_DIR:scratch,VIV_HOST:'127.0.0.1',PORT:String(port),MOCK_PROVIDERS:'1',HYPRLAB_API_KEY:'',OPENROUTER_API_KEY:'',MUSIC_AUTOSTART:'0',MUSIC_API_URL:'http://127.0.0.1:1'};
let browser,server,logs='';
try {
  execFileSync(process.execPath,['scripts/seed_demo.js'],{cwd:root,env,stdio:'pipe'});
  server=spawn(process.execPath,['server/index.js'],{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']});
  for(const stream of [server.stdout,server.stderr])stream.on('data',b=>logs=(logs+b).slice(-5000));
  for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const ctx=await browser.newContext({viewport:{width:1280,height:900},permissions:['microphone']});
  await ctx.addInitScript(()=>{
    localStorage.setItem('viv_lang','en');localStorage.setItem('viv_living_display','en');localStorage.setItem('viv_tts',JSON.stringify({prepare:false,autoplay:false,innerVoice:false,musicOn:false}));
    window.testStreams=[];window.testMicDelay=0;window.testMicError=null;
    const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async c=>{if(window.testMicError){const name=window.testMicError;window.testMicError=null;throw new DOMException('Test device failure',name);}const stream=await original(c);window.testStreams.push(stream);if(window.testMicDelay)await new Promise(r=>setTimeout(r,window.testMicDelay));return stream;};
    const Recorder=window.MediaRecorder;window.testRecorders=[];
    window.MediaRecorder=class extends Recorder {constructor(...args){super(...args);window.testRecorders.push(this);}};
  });
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let asrCount=0,answer='A spoken question.',delay=0,asrError=false,uploads=[];
  await ctx.route('**/api/asr',async route=>{
    asrCount++;const payload=route.request().postDataBuffer();uploads.push(payload?.includes(Buffer.from('RIFF')));
    const text=answer,wait=delay,error=asrError;if(wait)await new Promise(r=>setTimeout(r,wait));
    try{await route.fulfill({status:error?503:200,contentType:'application/json',body:JSON.stringify(error?{error:{message:'Test transcription unavailable'}}:{text})});}catch{}
  });
  assert.equal((await ctx.request.post(base+'/api/auth/login',{data:{email:'demo@vivarium.local',password:'alice-and-bob'}})).status(),200);
  await page.goto(base);await page.waitForFunction(()=>typeof attachMic==='function'&&!!S.user);
  await page.evaluate(()=>{
    window.testSent=[];const box=document.createElement('section');box.id='mic-test';box.style.cssText='position:fixed;inset:80px 20px auto;z-index:30000;background:white;padding:20px;max-width:480px';
    box.innerHTML='<div class="field" id="test-field"><input id="test-input" aria-label="Test draft"><button id="test-send">Send</button></div><div class="field" id="other-field"><input id="other-input"><button id="other-send">Ask</button></div>';
    document.body.append(box);
    for(const prefix of ['test','other']){const input=document.getElementById(prefix+'-input'),send=document.getElementById(prefix+'-send');send.onclick=()=>{window.testSent.push({prefix,text:input.value});input.value='';};input.onkeydown=e=>{if(e.key==='Enter')send.click();};attachMic(document.getElementById(prefix+'-field'),input,{submit:send});}
  });
  const field=page.locator('#test-field'),input=page.locator('#test-input'),mic=field.locator('.micbtn');
  const count=()=>page.evaluate(()=>window.testSent.length);
  const stopped=()=>page.waitForFunction(()=>window.testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
  const start=async f=>{await f.locator('.micbtn').click();await f.locator('.micbtn.rec').waitFor();await page.waitForTimeout(220);};
  await input.fill('Keep this draft.');await start(field);
  assert.deepEqual(await field.locator('[data-mic-action]').allTextContents(),['Cancel','Transcribe only','Transcribe & send']);
  await input.press('Enter');assert.equal(await count(),0,'Enter cannot send a partial draft while recording');
  await field.locator('[data-mic-action="cancel"]').click();await stopped();assert.equal(asrCount,0);assert.equal(await input.inputValue(),'Keep this draft.');
  await start(field);await field.locator('[data-mic-action="text"]').click();await field.locator('.mic-actions').waitFor({state:'detached'});await stopped();
  assert.equal(await input.inputValue(),'Keep this draft. A spoken question.');assert.equal(await count(),0);
  await start(field);await field.locator('[data-mic-action="send"]').dblclick();await page.waitForFunction(()=>window.testSent.length===1);await stopped();
  assert.equal(await input.inputValue(),'');assert.deepEqual(await page.evaluate(()=>testSent[0]),{prefix:'test',text:'Keep this draft. A spoken question. A spoken question.'});
  // Cancel a pending HTTP transcription: no late text, no submission, original draft survives.
  delay=700;await input.fill('Still here.');await start(field);const old=asrCount;
  await field.locator('[data-mic-action="send"]').click();await page.waitForFunction(()=>document.querySelector('#test-field .mic-status')?.textContent==='Transcribing…');
  for(let i=0;i<30&&asrCount===old;i++)await page.waitForTimeout(25);assert.equal(asrCount,old+1);
  await field.locator('[data-mic-action="cancel"]').click();await page.waitForTimeout(850);await stopped();assert.equal(await count(),1);assert.equal(await input.inputValue(),'Still here.');delay=0;
  // Opening cancellation with a delayed permission grant releases the eventually arriving stream.
  await page.evaluate(()=>window.testMicDelay=500);await mic.click();await field.locator('[data-mic-action="cancel"]').click();await page.waitForTimeout(650);await stopped();await page.evaluate(()=>window.testMicDelay=0);
  // Empty/error transcripts never send existing draft text; the next take works normally.
  for(const mode of ['empty','error']){answer=mode==='empty'?' ':'Recovered.';asrError=mode==='error';await start(field);await field.locator('[data-mic-action="send"]').click();await field.locator('.mic-actions').waitFor({state:'detached'});assert.equal(await count(),1);assert.equal(await input.inputValue(),'Still here.');}
  answer='Recovered.';asrError=false;
  await page.evaluate(()=>window.testMicError='NotAllowedError');await mic.click();await field.locator('.mic-actions').waitFor({state:'detached'});await start(field);
  // A recorder stopping itself (including the 60-second limit) waits for an explicit choice.
  const beforeLimit=asrCount;await page.evaluate(()=>window.testRecorders.at(-1).stop());await field.locator('.mic-status').filter({hasText:'Recording stopped'}).waitFor();assert.equal(asrCount,beforeLimit);assert.equal(await count(),1);
  await field.locator('[data-mic-action="text"]').click();await field.locator('.mic-actions').waitFor({state:'detached'});assert.equal(await input.inputValue(),'Still here. Recovered.');
  // Starting another composer cancels the first; closing the active one frees its device.
  await start(field);await start(page.locator('#other-field'));assert.equal(await field.locator('.mic-actions').count(),0);await page.evaluate(()=>document.querySelector('#mic-test').remove());await stopped();assert.equal(await count(),1);
  console.log('PASS real MediaRecorder/WAV, cancel, draft-only, exactly-once voice-send, Enter guard, cancelled ASR, delayed permission, empty/error/retry, stop-limit review, multiple composers and cleanup');

  // Exercise production wiring, not just the shared component, with actual scene dialogs.
  const r=await ctx.request.post(base+'/api/living/towns',{data:{population:10,seed:73,scenario:'bennington'},timeout:120000});assert.equal(r.status(),200,await r.text());const {worldId}=await r.json(),prefix='/api/living/worlds/'+worldId;
  const {sims}=await(await ctx.request.get(base+prefix+'/sims?limit=10')).json(),sim=sims[0];
  await ctx.route('**/api/living/worlds/*/places/*/music',route=>route.fulfill({status:200,contentType:'application/json',body:'{"music":null}'}));
  await page.goto(base+'/#/stage?w='+worldId);await page.locator('#stage-root').waitFor();
  answer='What would help this person?';const sent=[];
  for(const suffix of ['/dr-well','/sims/'+sim.id+'/inner','/sims/'+sim.id+'/talk'])await ctx.route('**'+prefix+suffix,async route=>{
    if(route.request().method()!=='POST')return route.continue();sent.push({suffix,body:route.request().postDataJSON()});
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({reply:'Voice message received.',references:[],state:sim.state,changed:false})});
  });
  await ctx.route('**/api/worlds/'+worldId+'/gm-chat',async route=>{if(route.request().method()!=='POST')return route.continue();sent.push({suffix:'/gm-chat',body:route.request().postDataJSON()});await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({reply:'Voice message received.',actions:[]})});});
  await page.evaluate(id=>livingDrWell(id),sim.id);await page.locator('#well-field .micbtn').waitFor();
  await start(page.locator('#well-field'));await page.screenshot({path:'artifacts/expanded-world/microphone-actions-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/expanded-world/microphone-actions-mobile.png'});
  for(const b of await page.locator('#well-field [data-mic-action]').all()){assert(await b.isVisible());const box=await b.boundingBox();assert(box.x>=0&&box.x+box.width<=392&&box.y+box.height<=844);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  await page.locator('#well-field [data-mic-action="send"]').click();await page.locator('.well-message.assistant').filter({hasText:'Voice message received.'}).waitFor();assert.equal(sent.length,1);assert.equal(sent[0].suffix,'/dr-well');assert.equal(sent[0].body.message,answer);
  await page.locator('[data-well-close]').click();await page.setViewportSize({width:1280,height:900});
  await page.evaluate(id=>livingJump({type:"character",id}),sim.id);await page.evaluate(id=>mindModal(id),sim.id);await page.locator('#iv-field .micbtn').waitFor();await start(page.locator('#iv-field'));await page.locator('#iv-field [data-mic-action="send"]').click();await page.waitForFunction(()=>[...document.querySelectorAll('#iv-log .assistant')].some(e=>e.textContent.includes('Voice message received.')));assert.equal(sent.length,2);assert.equal(sent[1].suffix,'/sims/'+sim.id+'/inner');
  await page.evaluate(()=>document.querySelectorAll('.modal-bg').forEach(e=>e.remove()));
  await page.evaluate(c=>livingTalkModal(c),{id:sim.id,name:sim.name,state:sim.state});await start(page.locator('#lw-talk-input').locator('..'));await page.locator('[data-mic-action="send"]').click();await page.locator('#lw-talk-log').filter({hasText:'Voice message received.'}).waitFor();assert.equal(sent.length,3);assert.equal(sent[2].suffix,'/sims/'+sim.id+'/talk');
  await page.evaluate(()=>document.querySelectorAll('.modal-bg').forEach(e=>e.remove()));
  await page.evaluate(()=>gmChatOverlay());await page.locator('#gmc-field .micbtn').waitFor();await start(page.locator('#gmc-field'));await page.locator('#gmc-field [data-mic-action="send"]').click();await page.waitForFunction(()=>document.querySelector('#gmc-log')?.textContent.includes('Voice message received.'));assert.equal(sent.length,4);assert.equal(sent[3].suffix,'/gm-chat');
  await page.evaluate(()=>document.querySelectorAll('.modal-bg').forEach(e=>e.remove()));
  await page.evaluate(c=>{window.testApplied=[];interventionModal([c],value=>window.testApplied.push(value));},{id:sim.id,name:sim.name});await start(page.locator('#iv-field'));await page.locator('#iv-field [data-mic-action="send"]').click();await page.waitForFunction(()=>window.testApplied.length===1);assert.equal(await page.evaluate(()=>testApplied[0].text),answer);assert.equal(await page.locator('#iv-text').count(),0);
  await stopped();assert(uploads.length>0&&uploads.every(Boolean),'recordings uploaded as normalized WAV');assert.deepEqual(errors,[]);
  console.log('PASS production Dr. Well, Inner Voice, talk, GM, intervention voice-send; all three actions fit a 390px screen; no JavaScript errors');
} finally {
  await browser?.close();if(server)try{process.kill(-server.pid,'SIGTERM');}catch{}
  fs.rmSync(scratch,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
