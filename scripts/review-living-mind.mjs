// Read-only inspection of current feelings/goals and public rooms in the preview.
import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from 'playwright';
const base=process.env.LIVING_REVIEW_URL||'http://127.0.0.1:8891',world=process.env.LIVING_REVIEW_WORLD||'w_91U9o3pjdbRG';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1050}});await context.addInitScript(()=>localStorage.setItem('viv_tts',JSON.stringify({prepare:false,autoplay:false,innerVoice:false,musicOn:false})));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 assert.equal((await context.request.post(base+'/api/auth/login',{data:{email:'demo@vivarium.local',password:'alice-and-bob'}})).status(),200);
 const snapshot=async()=> (await context.request.get(base+'/api/living/worlds/'+world)).json(),before=await snapshot();
 await page.goto(base+'/#/stage?w='+world);await page.locator('.stage-char').first().click();await page.locator('.lw-mind-goals').waitFor();
 await page.locator('.modal-bg').evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished));});assert.ok(await page.locator('.mind-box.emotions .emo-row').count()>0);assert.equal(await page.locator('.lw-daily-goal').count(),3);await page.screenshot({path:'artifacts/living-world/current-mind.png'});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await page.locator('.mind-cols').evaluate(el=>el.scrollWidth<=el.clientWidth));await page.screenshot({path:'artifacts/living-world/current-mind-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1050});await page.locator('#lw-stats').click();await page.locator('#lw-journal').waitFor();await page.locator('.drawer-bg').evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished));});await page.screenshot({path:'artifacts/living-world/current-goals.png'});await page.locator('#lw-close-profile').click();
 await page.goto(base+'/#/atlas?w='+world);await page.locator('#lw-atlas .lnode').first().waitFor();await page.locator('#lw-world-search').fill('Schule');await page.locator('[data-result]').first().waitFor();
 await page.locator('[data-result]').first().click();
 // Find and expand the actual school building, independent of search ordering.
 const graph=await (await context.request.get(base+'/api/living/worlds/'+world+'/map')).json(),school=graph.nodes.find(n=>n.name==='Schule');assert.ok(school);
 await page.evaluate(async id=>document.querySelector('#lw-atlas').livingMap.expand(id),school.id);await page.locator(`[data-group="${school.id}"]`).waitFor();await page.evaluate(()=>document.querySelector('#lw-atlas').livingMap.fit());
 const expanded=await page.evaluate(()=>document.querySelector('#lw-atlas').livingMap.getGraph()),rooms=expanded.nodes.filter(p=>p.parent_id===school.id&&p.kind==='room');assert.ok(rooms.length>=7);assert.ok(await page.locator('img,svg image').count()<=50);await page.screenshot({path:'artifacts/living-world/school-rooms.png'});
 const after=await snapshot();assert.equal(after.simulation.seconds,before.simulation.seconds);assert.equal(after.simulation.version,before.simulation.version);assert.deepEqual(errors,[]);
 fs.writeFileSync('artifacts/living-world/mind-ui-review.json',JSON.stringify({population:before.population,currentFeelings:true,dailyGoals:3,schoolRooms:rooms.map(p=>p.name),clockUnchanged:true,imageLimit:50,mobileOverflow:false,errors},null,2)+'\n');console.log('PASS current Mind/goal views, desktop/mobile and expanded school rooms; preview unchanged.');
}finally{await browser.close();}
