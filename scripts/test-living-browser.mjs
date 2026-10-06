// Explicit local review: only the separate Living World preview on port 8891.
import assert from 'node:assert/strict';import fs from 'node:fs';import {chromium} from 'playwright';
const base=process.env.LIVING_REVIEW_URL || 'http://127.0.0.1:8891';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const login=await context.request.post(base+'/api/auth/login',{data:{email:process.env.LIVING_REVIEW_EMAIL || 'demo@vivarium.local',password:process.env.LIVING_REVIEW_PASSWORD || 'alice-and-bob'}});assert.equal(login.status(),200);
 const world=process.env.LIVING_REVIEW_WORLD || fs.readFileSync('/tmp/living-review-world','utf8').trim();await page.goto(base+'/living.html?world='+world);await page.locator('.lw-map-node').first().waitFor();
 await page.locator('[data-tab="anchors"]').click();await page.getByRole('heading',{name:'Worauf die Geschichte schaut'}).waitFor();await page.screenshot({path:'artifacts/living-world/city.png',fullPage:true});
 let r=await context.request.get(base+'/api/living/worlds/'+world+'/sims');let sims=(await r.json()).sims;const sim=sims.find(s=>s.anchored);await page.locator('[data-tab="sims"]').click();await page.locator(`[data-inspect="${sim.id}"]`).first().click();await page.locator('#sim-follow').click();await page.locator('.lw-stage-person').first().waitFor();await page.screenshot({path:'artifacts/living-world/room-and-memory.png',fullPage:true});
 assert.ok(await page.locator('.lw-stage-person img').count()>0);assert.ok(await page.locator('.lw-journal').count()>0);
 await page.locator('#sim-anchor').click();await page.waitForFunction(()=>document.querySelector('#sim-anchor')?.textContent.includes('Sim verankern'));await page.locator('#sim-anchor').click();await page.waitForFunction(()=>document.querySelector('#sim-anchor')?.textContent.includes('entfernen'));
 await page.locator('#room-anchor').click();await page.waitForFunction(()=>document.querySelector('#room-anchor')?.textContent.includes('entfernen'));
 await page.locator('[data-tab="assets"]').click();await page.locator('#asset-search').click();await page.locator('.lw-candidate').first().waitFor();assert.equal(await page.locator('.lw-candidate').count(),5);
 await page.locator('[data-tab="sims"]').click();await page.locator('#story-mode').uncheck();await page.locator('[data-advance="5"]').click();await page.waitForFunction(()=>document.querySelector('#progress')?.textContent.includes('Perspektiven'),null,{timeout:30000});
 const created=await context.request.post(base+'/api/living/towns',{data:{title:'Skalierungstest · 500 Sims',population:10,seed:41,story:false}});assert.equal(created.status(),200);const testWorld=(await created.json()).worldId;
 for(const target of [20,50,100,500]){const current=await context.request.get(base+'/api/living/worlds/'+testWorld),n=(await current.json()).population;const grow=await context.request.post(base+'/api/living/worlds/'+testWorld+'/grow',{data:{count:target-n}});assert.equal(grow.status(),200);}
 await page.goto(base+'/living.html?world='+testWorld);await page.locator('.lw-map-node').first().waitFor();
 for(let i=0;i<3;i++){const nodes=page.locator('.lw-map-node');if(await nodes.count())await nodes.first().click();await page.waitForTimeout(100);assert.ok(await page.locator('img[src]').count()<=99);}
 await page.locator('#story-mode').uncheck();await page.locator('[data-advance="5"]').click();await page.waitForFunction(()=>document.querySelector('#progress')?.textContent.includes('Perspektiven'),null,{timeout:30000});
 const count=await page.locator('img[src]').count();assert.ok(count<=99);await page.screenshot({path:'artifacts/living-world/500-sims.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/living.html?world='+world);await page.locator('.lw-map-node').first().waitFor();await page.screenshot({path:'artifacts/living-world/mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 assert.deepEqual(errors,[]);console.log('PASS map focus, transparent sprites, personal journals, toggled Sim/place anchors, top-five BM25 metadata, SSE tick, growing 10→20→50→100→500, image budget and mobile layout; active images at 500:',count);
}finally{await browser.close();}
