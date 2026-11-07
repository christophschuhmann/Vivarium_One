// Read-only browser checks for the installed Endwell opening. No generation requests.
import {chromium} from 'playwright';
import fs from 'node:fs';import assert from 'node:assert/strict';
const base=process.env.ENDWELL_BASE;
if(!base||!process.env.ENDWELL_WORLD||!process.env.ENDWELL_PLAYER||!process.env.RPG_TEST_EMAIL||!process.env.RPG_TEST_PASSWORD)throw new Error('Set ENDWELL_BASE, ENDWELL_WORLD, ENDWELL_PLAYER, RPG_TEST_EMAIL and RPG_TEST_PASSWORD.');
const result={worldId:process.env.ENDWELL_WORLD,playerId:process.env.ENDWELL_PLAYER};
const out=process.env.ENDWELL_SHOTS||'/tmp/endwell-browser';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:1440,height:960},timezoneId:'America/New_York'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await context.addInitScript(()=>{localStorage.setItem('viv_tts',JSON.stringify({prepare:false,autoplay:false,innerVoice:false,musicOn:false}));localStorage.setItem('viv_lang','en');});
try {
 const login=await context.request.post(base+'/api/auth/login',{data:{email:process.env.RPG_TEST_EMAIL,password:process.env.RPG_TEST_PASSWORD}});assert.equal(login.status(),200);
 const r=await context.request.get(base+'/api/worlds/'+result.worldId);assert.equal(r.status(),200);const data=await r.json();
 assert.equal(data.world.tick_index,4);assert.equal(data.world.player_character_id,result.playerId);assert.equal(data.characters.length,6);assert.equal(data.locations.length,10);assert.ok(data.world.directives.includes('Give warmth, humor'));
 for(const c of data.characters){assert.ok(c.base.age>=21);assert.ok(c.state.outfits.length>=2);if(c.id!==result.playerId)assert.doesNotMatch(JSON.stringify(c.state.attributes.belief),/wish.*established|cast_at/);}
 const present=data.characters.map(c=>c.state.location_id);assert.equal(new Set(present).size,1);
 await page.goto(base+'/#/stage?w='+result.worldId);await page.locator('#act-in').waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.stage-char img')].length===6&&[...document.querySelectorAll('.stage-char img')].every(i=>i.complete&&i.naturalWidth>0));
 assert.match(await page.locator('.rpg-identity').innerText(),/Kevin Johnson[\s\S]*Age 21/);assert.match(await page.locator('body').innerText(),/Sarah is waiting for your answer/);await page.screenshot({path:out+'/stage.png'});
 assert.equal(await page.locator('.stage-cast .bubble:visible').count(),1);assert.match(await page.locator('.stage-hud').innerText(),/20:35/);await page.evaluate(()=>localStorage.setItem('viv_rpg',JSON.stringify({adminMode:true})));const sarah=data.characters.find(c=>c.name==='Sarah Chang');await page.locator('[data-pov="'+sarah.id+'"]').click();await page.locator('.modal-bg').last().waitFor();await page.screenshot({path:out+'/sarah.png'});await page.evaluate(()=>document.querySelectorAll('.modal-bg').forEach(m=>m.remove()));
 await page.locator('#timelinebtn').click();await page.locator('.tl-card[data-t="4"]').waitFor();assert.equal(await page.locator('.tl-seqchip').count(),4);await page.locator('.tl-card[data-t="2"]').click();await page.waitForFunction(()=>document.querySelector('#tl-detail')?.textContent.includes('textbook'));await page.screenshot({path:out+'/timeline.png'});await page.evaluate(()=>document.querySelectorAll('.modal-bg').forEach(m=>m.remove()));
 for(const section of ['cast','bonds','atlas']){await page.goto(base+'/#/'+section+'?w='+result.worldId);await page.waitForTimeout(1000);await page.screenshot({path:out+'/'+section+'.png'});assert.doesNotMatch(await page.locator('body').innerText(),/cannot be loaded|Could not load/i);}
 await page.evaluate(()=>localStorage.setItem('viv_rpg',JSON.stringify({adminMode:false})));await page.setViewportSize({width:390,height:844});await page.goto(base+'/#/stage?w='+result.worldId);await page.locator('#act-in').waitFor();await page.screenshot({path:out+'/mobile.png'});assert.ok(await page.locator('body').evaluate(e=>e.scrollWidth<=innerWidth+2));
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks:'6 adults; 10 locations; full directives; private knowledge; loaded sprites; player identity; decision stop; Sarah profile; four-scene timeline; cast/bonds/map; mobile layout; no browser errors',output:out}));
}finally{await browser.close();}
