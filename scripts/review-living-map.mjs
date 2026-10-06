// Read-only UI review of an existing preview town. No provider calls or ticks.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.LIVING_REVIEW_URL||'http://127.0.0.1:8891',world=process.env.LIVING_REVIEW_WORLD||'w_XN233nJZwZSD';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1050}});
 await context.addInitScript(()=>localStorage.setItem('viv_tts',JSON.stringify({prepare:false,autoplay:false,innerVoice:false,musicOn:false})));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 assert.equal((await context.request.post(base+'/api/auth/login',{data:{email:'demo@vivarium.local',password:'alice-and-bob'}})).status(),200);
 const before=await (await context.request.get(base+'/api/living/worlds/'+world)).json();
 await page.goto(base+'/#/atlas?w='+world);await page.locator('#lw-atlas .lnode').first().waitFor();
 const graph=await (await context.request.get(base+'/api/living/worlds/'+world+'/map')).json(),groups=graph.nodes.filter(n=>n.kind==='neighborhood');
 await page.screenshot({path:'artifacts/living-world/circular-city.png'});
 await page.evaluate(async ids=>{const map=document.querySelector('#lw-atlas').livingMap;for(const id of ids)await map.expand(id);map.fit();},groups.slice(0,2).map(n=>n.id));
 await page.waitForTimeout(300);await page.screenshot({path:'artifacts/living-world/circular-neighborhoods.png'});
 const open=await page.evaluate(()=>document.querySelector('#lw-atlas').livingMap.getGraph());
 const home=open.nodes.find(n=>n.kind==='building'&&!n.landmark&&n.parent_id===groups[0].id);
 await page.evaluate(async id=>document.querySelector('#lw-atlas').livingMap.expand(id),home.id);await page.waitForTimeout(200);
 await page.screenshot({path:'artifacts/living-world/circular-house.png'});
 await page.locator('#lw-world-search').fill('Library');await page.locator('[data-result]').first().waitFor();await page.locator('[data-result]').first().click();await page.locator('#lw-world-selection').getByRole('heading',{name:/Bibliothek|Library/}).waitFor();await page.waitForTimeout(200);
 await page.screenshot({path:'artifacts/living-world/circular-search.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);await page.screenshot({path:'artifacts/living-world/circular-mobile.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await page.locator('svg image,img').count()<=50);
 await page.setViewportSize({width:1440,height:1050});await page.goto(base+'/#/cast?w='+world);await page.locator('#lw-explore-grid [data-resident]').first().waitFor();await page.screenshot({path:'artifacts/living-world/sim-explorer.png'});await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'artifacts/living-world/sim-explorer-mobile.png'});
 const after=await (await context.request.get(base+'/api/living/worlds/'+world)).json();assert.equal(after.simulation.version,before.simulation.version);assert.equal(after.simulation.seconds,before.simulation.seconds);assert.deepEqual(errors,[]);
 fs.writeFileSync('artifacts/living-world/circular-map-review.json',JSON.stringify({population:before.population,openGroups:open.expanded.length,imageLimit:50,clockUnchanged:true,errors},null,2)+'\n');
 console.log('PASS read-only circular map screenshots: city, two neighborhoods, house, Library search and mobile; simulation unchanged.');
}finally{await browser.close();}
