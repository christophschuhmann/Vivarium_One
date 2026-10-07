// Real images and a large town, in a disposable database. No provider calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';import {chromium} from 'playwright';
const root=path.resolve(new URL('..',import.meta.url).pathname),scratch=fs.mkdtempSync(path.join(os.tmpdir(),'viv-portrait-ui-'));
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const base='http://127.0.0.1:'+port,env={...process.env,VIV_DATA_DIR:scratch,VIV_HOST:'127.0.0.1',PORT:String(port),MOCK_PROVIDERS:'1',HYPRLAB_API_KEY:'',OPENROUTER_API_KEY:'',MUSIC_API_URL:'http://127.0.0.1:1',MUSIC_AUTOSTART:'0'};
let browser,server,logs='';
try{
 execFileSync(process.execPath,['scripts/seed_demo.js'],{cwd:root,env,stdio:'pipe'});
 server=spawn(process.execPath,['server/index.js'],{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']});for(const s of [server.stdout,server.stderr])s.on('data',b=>logs=(logs+b).slice(-5000));
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=500)errors.push(r.status()+' '+r.url());});
 await ctx.route('**/api/living/worlds/*/places/*/music',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({music:null})})); // Music has its own integration suite.
 await ctx.addInitScript(()=>{localStorage.setItem('viv_lang','en');localStorage.setItem('viv_living_display','en');localStorage.setItem('viv_tts',JSON.stringify({prepare:false,autoplay:false,musicOn:false}));});
 assert.equal((await ctx.request.post(base+'/api/auth/login',{data:{email:'demo@vivarium.local',password:'alice-and-bob'}})).status(),200);
 const create=await ctx.request.post(base+'/api/living/towns',{data:{population:1000,seed:73,scenario:'bennington'},timeout:120000});assert.equal(create.status(),200);const {worldId}=await create.json();
 await page.goto(base+'/#/atlas?w='+worldId);await page.locator('#lw-atlas .lnode').first().waitFor();
 const downtown=page.locator('#lw-atlas .lnode').filter({has:page.locator('.lw-circle-label',{hasText:/^Downtown$/})});await downtown.locator('[data-expand]').click();
 await page.waitForFunction(()=>document.querySelector('#lw-atlas').livingMap.getGraph().nodes.some(n=>n.name==='Downtown'&&n.expanded));
 const map=await page.evaluate(()=>document.querySelector('#lw-atlas').livingMap.getGraph());assert.deepEqual(map.refused,[]);assert.ok(map.nodes.some(n=>n.kind==='block'));assert.ok(await page.locator('#lw-atlas image').count()<=50);
 const block=map.nodes.find(n=>n.kind==='block');await page.evaluate(id=>document.querySelector('#lw-atlas').livingMap.expand(id),block.id);
 const blocks=await page.evaluate(()=>document.querySelector('#lw-atlas').livingMap.getGraph());assert.ok(blocks.expanded.includes(block.id));
 await page.screenshot({path:'artifacts/expanded-world/downtown-expanded.png'});
 const places=blocks.nodes.filter(n=>n.kind==='building'&&!n.expanded);const building=places.find(n=>n.parent_id===block.id)||places[0];
 await page.evaluate(id=>document.querySelector('#lw-atlas').livingMap.expand(id),building.id);
 const room=await page.evaluate(()=>document.querySelector('#lw-atlas').livingMap.getGraph().nodes.find(n=>n.kind==='room'&&n.asset_id));assert.ok(room);
 // A real room has select-on-click, scene-on-double-click semantics.
 const node=page.locator('#lw-atlas [data-id="'+room.id+'"]');await node.dispatchEvent('click');assert.ok(page.url().includes('/atlas'));await node.dispatchEvent('dblclick');await page.locator('#stage-root').waitFor();assert.ok(page.url().includes('/stage'));
 await page.locator('#lw-anchor-next').click();await page.waitForFunction(()=>!livingJump.busy&&!!document.querySelector('.stage-char'));
 await page.locator('.stage-char').first().click();await page.locator('#iv-in').waitFor();
 assert.equal(await page.locator('.lw-mind [data-social-attribute=reputation]').count(),1);assert.equal(await page.locator('.lw-mind [data-social-attribute=attractiveness]').count(),1);
 assert.match(await page.locator('.lw-mind-identity').innerText(),/years/);assert.match(await page.locator('.lw-mind-identity').innerText(),/Female|Male/);
 assert.ok(await page.locator('.lw-mind-heading-face').count());assert.ok(await page.locator('.lw-mind-feelings progress').count());
 assert.ok(await page.locator('#iv-in').evaluate(el=>el.getBoundingClientRect().bottom<innerHeight),'Conversation input should be visible without scrolling');
 assert.ok(await page.locator('.lw-mind-feelings').evaluate(el=>el.getBoundingClientRect().top<innerHeight/2));
 const help=await page.evaluate(()=>Object.entries(EX_CONCEPTS).filter(([k])=>!EX_CONCEPTS_EN[k]).map(([k])=>k));assert.deepEqual(help,[]);
 await page.locator('[data-concept="emotion"]').first().click();const card=await page.getByRole('dialog').innerText();assert.match(card,/How this works in Vivarium/);assert.doesNotMatch(card,/Spielwerte|Erklärung|Bedürfnis/);await page.locator('.ex-learning button').click();
 await page.screenshot({path:'artifacts/expanded-world/mind-identity-emotions.png'});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('#iv-in').evaluate(el=>el.getBoundingClientRect().bottom<innerHeight));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'artifacts/expanded-world/mind-identity-mobile.png'});
 await page.setViewportSize({width:1440,height:1000});const focused=await page.locator('[data-character-id]').first().getAttribute('data-character-id');
 await page.locator('.lw-mind [data-character-section=views]').click();await page.locator('#ex-content [data-social-attribute=reputation]').waitFor();assert.match(await page.locator('#ex-content').innerText(),/What drives my next move/);assert.ok((await page.locator('#ex-sim-picker').getAttribute('aria-label')).includes('Switch Sim:'));
 await page.locator('#ex-profile').click();await page.locator('#lw-profile-goals').waitFor();await page.waitForTimeout(150);const profile=await page.locator('.lw-profile').innerText();assert.doesNotMatch(profile,/Ausgangshintergrund|Minuten Praxis|Gerade wichtig|Sinn & Zugehörigkeit|Erlebtes Gelingen|Stunden Erfahrung/);assert.match(profile,/Starting background/);assert.match(profile,/Meaning & belonging/);
 await page.locator('#lw-profile-bonds').click();await page.locator('#lw-bond-center').waitFor();assert.equal(await page.locator('#lw-bond-center').getAttribute('data-sim'),focused);assert.ok(await page.locator('.lw-bond-meta').count()>2);assert.match(await page.locator('#lw-bond-svg').textContent(),/years/);await page.waitForTimeout(500);await page.waitForFunction(()=>[...document.querySelectorAll('#lw-bond-anchors img')].every(i=>i.complete&&i.naturalWidth>0),null,{timeout:90000});const urls=await page.locator('#lw-bond-svg image').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));for(const url of urls)assert.equal((await ctx.request.get(base+url)).status(),200);await page.waitForTimeout(300);assert.match(await page.locator('.lw-world-heading h1').innerText(),/Relationship network/);await page.screenshot({path:'artifacts/expanded-world/bonds-social-attributes.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS 1,000-Sim Downtown expansion, virtual groups, real-room scene jump, English help and visible identity/emotions/Inner Voice on desktop and mobile.');
}finally{await browser?.close();if(server)try{process.kill(-server.pid,'SIGTERM');}catch{}fs.rmSync(scratch,{recursive:true,force:true});if(logs.includes('Error'))console.error(logs);}
