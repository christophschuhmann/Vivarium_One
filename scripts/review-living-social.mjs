// Read-only review of the migrated demo: no tick and no provider request.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.LIVING_REVIEW_URL||'http://127.0.0.1:8891',world=process.env.LIVING_REVIEW_WORLD||'w_91U9o3pjdbRG';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1050}});await context.addInitScript(()=>localStorage.setItem('viv_tts',JSON.stringify({prepare:false,autoplay:false,innerVoice:false,musicOn:false})));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  assert.equal((await context.request.post(base+'/api/auth/login',{data:{email:'demo@vivarium.local',password:'alice-and-bob'}})).status(),200);
  const snapshot=async()=> (await context.request.get(base+'/api/living/worlds/'+world)).json(),before=await snapshot();
  await page.goto(base+'/#/atlas?w='+world);await page.locator('#lw-atlas .lnode').first().waitFor();
  const graph=await (await context.request.get(base+'/api/living/worlds/'+world+'/map')).json(),n=graph.nodes.find(n=>n.kind==='neighborhood');
  await page.locator(`#lw-atlas [data-id="${n.id}"]`).dblclick();await page.locator('#lw-world-selection').getByText(n.community.ritual,{exact:true}).waitFor();
  await page.screenshot({path:'artifacts/living-world/social-neighborhood.png'});
  await page.goto(base+'/#/cast?w='+world);await page.locator('#lw-explore-grid [data-resident]').first().click();await page.locator('.lw-social-profile').waitFor();await page.locator('.lw-relationship').first().waitFor();
  await page.screenshot({path:'artifacts/living-world/social-profile.png'});
  const relative=page.locator('[data-relative]').first(),otherId=await relative.getAttribute('data-relative');await relative.click();await page.locator('#lw-journal').waitFor();
  const other=await (await context.request.get(base+'/api/living/worlds/'+world+'/sims/'+otherId)).json();await page.locator('.drawer h2').getByText(other.sim.name+' · '+other.sim.age,{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/living-world/social-profile-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await page.locator('img,svg image').count()<=50);
  const after=await snapshot();assert.equal(after.simulation.seconds,before.simulation.seconds);assert.equal(after.simulation.version,before.simulation.version);assert.deepEqual(errors,[]);
  fs.writeFileSync('artifacts/living-world/social-ui-review.json',JSON.stringify({population:before.population,neighborhood:n.name,profileLinksWork:true,clockUnchanged:true,imageLimit:50,errors},null,2)+'\n');
  console.log('PASS migrated demo neighborhood identity, personal motives and relationship profile links on desktop/mobile; world unchanged.');
}finally{await browser.close();}
