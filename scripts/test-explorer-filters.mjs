// End-to-end search audit against a separate database. No provider calls or live ticks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'viv-explorer-'));
Object.assign(process.env,{VIV_DATA_DIR:scratch,VIV_SECRET:'explorer-test-secret',MOCK_PROVIDERS:'1',HYPRLAB_API_KEY:'fixture-key',OPENROUTER_API_KEY:'',VIV_HOST:'127.0.0.1'});
const {db}=await import('../server/living/schema.js');
const {createTown}=await import('../server/living/engine.js');
const {closeOpenSims}=await import('../server/living/open_sims.js');
const {createSession}=await import('../server/auth.js');
const {socialAttributes}=await import('../server/living/social-attributes.js');
const stamp=new Date().toISOString();
for(const id of ['explorer','outsider'])db.prepare('INSERT INTO users(id,email,display_name,email_verified_at,created_at) VALUES(?,?,?,?,?)').run(id,id+'@test.local',id,stamp,stamp);
const user=db.prepare('SELECT * FROM users WHERE id=?').get('explorer');
let server,browser;let logs='';
try{
 const {worldId}=await createTown(user,{population:100,seed:73,scenario:'bennington'});
 const portServer=net.createServer();await new Promise(r=>portServer.listen(0,'127.0.0.1',r));const port=portServer.address().port;await new Promise(r=>portServer.close(r));
 const base='http://127.0.0.1:'+port,url=base+'/api/living/worlds/'+worldId+'/sims';
 server=spawn(process.execPath,['server/index.js'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});for(const s of [server.stdout,server.stderr])s.on('data',x=>logs=(logs+x).slice(-5000));
 let ready=false;for(let i=0;i<200;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,50));}assert.ok(ready,logs);
 const people=db.prepare('SELECT * FROM lw_sims WHERE world_id=? ORDER BY rowid').all(worldId),ids=people.map(p=>p.id),time=db.prepare('SELECT seconds FROM lw_worlds WHERE world_id=?').get(worldId).seconds;
 db.transaction(()=>{
  db.prepare('DELETE FROM lw_relations WHERE world_id=?').run(worldId);db.prepare("DELETE FROM lw_economy_entities WHERE world_id=? AND kind='claim'").run(worldId);
  people.forEach((p,i)=>{
   const s=JSON.parse(p.state),profile=JSON.parse(p.profile);s.needs.hunger=i/100;s.needs.social=(100-i)/100;s.needs.romantic_affection=.9;
   s.affect={states:[{id:'contentment',intensity:.99},{id:'anger',intensity:i/100,expires_at:time+1000},{id:'fear',intensity:.9,expires_at:time-1}]};
   s.aptitudes.attributes.reasoning=i;s.aptitudes.social_skills.empathy=100-i;s.skills.cooking=i/100;s.socialDynamics.appearance=i/100;s.psychology.big_five.extraversion=i/100;
   s.psychology.ambitions=[{id:'career',kind:'career',title:'Grow in my work',progress:i/100},{id:'hobby',kind:'hobby',title:'Learn music',progress:(100-i)/100}];
   profile.family.partner_id=i<4?ids[i%2===0?i+1:i-1]:null;profile.family.relationship_status=i<2?'married':i<4?'dating':i===4?'divorced':'single';
   db.prepare('UPDATE lw_sims SET name=?,age=?,profile=?,state=? WHERE id=?').run('Resident '+String(i).padStart(3,'0'),i===98?12:i===99?16:30,JSON.stringify(profile),JSON.stringify(s),p.id);
  });
  const rel=(from,to,payload)=>db.prepare('INSERT INTO lw_relations VALUES(?,?,?,?)').run(worldId,ids[from],ids[to],JSON.stringify(payload));
  rel(5,0,{closeness:.8,trust:.8,tension:.1});rel(6,0,{closeness:.1,trust:.2,tension:.8});rel(0,6,{closeness:.1,trust:.2,tension:.8});rel(5,7,{closeness:.6,trust:.7,attraction:.6});
  const claim=(id,subject,extra)=>db.prepare('INSERT INTO lw_economy_entities VALUES(?,?,?,?,?)').run(id,worldId,'claim',null,JSON.stringify({subjectId:ids[subject],dimension:'helpfulness',value:.8,confidence:1,public:true,expiresAt:time+500,...extra}));
  claim('good',0,{});claim('bad',1,{dimension:'reliability',value:-.5});claim('expired',0,{expiresAt:time-1});claim('retracted',0,{retracted:true});claim('unknown',0,{public:false,audience:[ids[5]]});
 })();
 const before=JSON.stringify(db.prepare('SELECT seconds,version FROM lw_worlds WHERE world_id=?').get(worldId)),journalBefore=db.prepare('SELECT count(*) n FROM lw_journal').get().n;
 const session=createSession('explorer'),cookie='vsession='+session;
 const query=async(rules=[],extra={},who=cookie)=>{const params=new URLSearchParams({limit:'50',...extra,filters:JSON.stringify(rules)});const response=await fetch(url+'?'+params,{headers:{cookie:who}});return {status:response.status,data:await response.json()};};
 const search=async(rules=[],extra={})=>{const r=await query(rules,extra);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
 const range=(category,field,min,max)=>({category,field,min,max});
 const expectNames=(result,indexes)=>assert.deepEqual(result.sims.map(s=>s.name),indexes.map(i=>'Resident '+String(i).padStart(3,'0')));
 let r=await search([range('emotion','anger',70,80)]);expectNames(r,Array.from({length:11},(_,i)=>i+70));assert.equal(r.sims[0].matches[0].value,70,'find secondary, not just primary, feelings');
 assert.equal((await search([range('emotion','fear',1,100)])).total,0,'expired feelings are not active');assert.equal((await search([range('emotion','sadness',0,0)])).total,100,'absent feeling is zero');
 const combined=[range('need','hunger',20,80),range('skill','empathy',30,60),range('attribute','reasoning',45,65),range('skill','cooking',0,55)];
 r=await search(combined);expectNames(r,Array.from({length:11},(_,i)=>45+i));assert.equal(r.sims[0].matches.find(m=>m.field==='cooking').value,45);assert.equal(r.sims[0].matches.find(m=>m.field==='empathy').value,55);
 r=await search([range('need','hunger',10,90),range('need','social',40,50)]);expectNames(r,Array.from({length:11},(_,i)=>50+i));
 const goals=[{...range('ambition','career',80,100),text:'music'}];assert.equal((await search(goals)).total,0,'text and progress cannot match different goals');
 expectNames(await search([{...range('ambition','hobby',80,90),text:'MUSIC'}]),Array.from({length:11},(_,i)=>10+i));
 assert.equal((await search([{...range('ambition','any',0,100),text:'%'}])).total,0,'goal text is literal, not a LIKE wildcard');
 expectNames(await search([{category:'relationship',field:'married'}]),[0,1]);expectNames(await search([{category:'relationship',field:'dating'}]),[2,3]);expectNames(await search([{category:'relationship',field:'divorced'}]),[4]);
 assert.equal((await search([{category:'relationship',field:'single'}])).total,96);expectNames(await search([{category:'relationship',field:'conflict'}]),[0,6]);expectNames(await search([{category:'relationship',field:'romantic_interest'}]),[5]);
 expectNames(await search([{category:'relationship',field:'close_friend'}]),[5]);
 for(const field of ['appearance','reputation','recognition','popularity','ambition','prosociality']){
  const matches=await search([range('attribute',field,0,100)]);
  for(const p of matches.sims){const stored=db.prepare('SELECT * FROM lw_sims WHERE id=?').get(p.id),computed=socialAttributes({...stored,state:JSON.parse(stored.state)});assert.equal(p.matches[0].value,Math.round(computed[field]*100),field+' must agree with the profile');}
 }
 expectNames(await search([range('attribute','reputation',66,66)]),[0]);expectNames(await search([range('attribute','popularity',50,50)]),[0]);
 assert.equal((await search([range('attribute','appearance',0,100)])).total,98,'children have no adult appearance score');
 expectNames(await search([range('need','romantic_affection',35,35)]),[99]);expectNames(await search([range('need','romantic_affection',0,0)]),[98]);
 expectNames(await search([range('attribute','extraversion',80,85)]),[80,81,82,83,84,85]);
 r=await search([range('need','hunger',20,80)],{limit:'18',offset:'36'});assert.equal(r.total,61);expectNames(r,Array.from({length:18},(_,i)=>56+i));
 assert.equal(r.sims[0].state,undefined);assert.equal(r.sims[0].profile,undefined,'search cards do not ship whole histories');
 const outsiders=await query(combined,{},'vsession='+createSession('outsider'));assert.equal(outsiders.status,404);
 for(const rules of [[range('need','hunger',90,10)],[range('skill','cooking',-1,100)],[range('skill','cooking',0,101)],[range('skill','cooking','10',30)],[range('skill',"cooking') OR 1=1 --",0,100)],Array.from({length:13},()=>range('need','hunger',0,100))])assert.equal((await query(rules)).status,400);
 assert.equal((await fetch(url+'?filters=not-json',{headers:{cookie}})).status,400);
 console.log('PASS: full-population filters, scales, secondary/expired emotions, same-goal matching, relationship semantics, reputation parity, age caps, pagination, invalid input and authorization.');
 if(process.argv.includes('--browser')){
  const {chromium}=await import('playwright');browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:1050}});await context.addCookies([{name:'vsession',value:session,url:base}]);
  await context.addInitScript(()=>{localStorage.setItem('viv_living_display','en');localStorage.setItem('viv_tts',JSON.stringify({prepare:false,autoplay:false,innerVoice:false,musicOn:false}));});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/#/cast?w='+worldId);await page.locator('[data-resident]').first().waitFor();assert.equal(await page.locator('[data-resident]').count(),18);
  await page.locator('#lw-explore-advanced summary').click();
  await page.locator('[data-add-filter="need"]').click();await page.locator('#lw-rule-1-field').selectOption('hunger');await page.locator('#lw-rule-1-min').fill('20');await page.locator('#lw-rule-1-max').fill('80');
  await page.waitForFunction(()=>document.querySelector('#lw-explore-total').textContent==='61 of 100 Sims');
  await page.locator('#lw-explore-next').click();await page.waitForFunction(()=>document.querySelector('#lw-explore-page').textContent==='19–36 / 61');
  await page.locator('[data-add-filter="skill"]').click();await page.locator('#lw-rule-2-min').fill('30');await page.locator('#lw-rule-2-max').fill('60');
  await page.waitForFunction(()=>document.querySelector('#lw-explore-total').textContent==='31 of 100 Sims');assert.equal(await page.locator('#lw-explore-page').textContent(),'1–18 / 31');
  await page.locator('[data-add-filter="attribute"]').click();await page.locator('#lw-rule-3-field').selectOption('reasoning');await page.locator('#lw-rule-3-min').fill('45');await page.locator('#lw-rule-3-max').fill('55');
  await page.waitForFunction(()=>document.querySelector('#lw-explore-total').textContent==='11 of 100 Sims');assert.equal(await page.locator('.lw-resident-matches').count(),11);assert.equal(await page.locator('.lw-match').count(),33);
  await page.locator('#lw-explore-advanced summary').click();assert.equal(await page.locator('#lw-explore-chips [data-remove-filter]').count(),3);await page.locator('#lw-explore-chips [data-remove-filter="3"]').click();await page.waitForFunction(()=>document.querySelector('#lw-explore-total').textContent==='31 of 100 Sims');
  await page.locator('#lw-explore-advanced summary').click();await page.locator('#lw-rule-2-min').fill('90');await page.locator('#lw-explore-error').waitFor({state:'visible'});assert.equal(await page.locator('[data-resident]').count(),0);await page.locator('#lw-rule-2-min').fill('30');await page.waitForFunction(()=>document.querySelector('#lw-explore-total').textContent==='31 of 100 Sims');
  await page.locator('[data-add-filter="emotion"]').click();await page.locator('#lw-rule-4-field').selectOption('anger');await page.locator('#lw-rule-4-min').fill('45');await page.waitForFunction(()=>document.querySelector('#lw-explore-total').textContent==='26 of 100 Sims');
  const artifacts=path.join(root,'artifacts/expanded-world');fs.mkdirSync(artifacts,{recursive:true});await page.screenshot({path:path.join(artifacts,'explorer-filters-desktop.png')});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile page has no horizontal overflow');assert.ok(await page.locator('.lw-filter-rule').evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth)));
  await page.locator('#lw-explore-show-results').click();assert.equal(await page.locator('#lw-explore-advanced').getAttribute('open'),null);await page.locator('.lw-resident-card').first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,'explorer-filters-mobile.png')});
  await page.setViewportSize({width:320,height:740});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'narrow phone has no horizontal overflow');await page.setViewportSize({width:390,height:844});
  await page.locator('#lw-explore-reset').click();await page.waitForFunction(()=>document.querySelector('#lw-explore-total').textContent==='100 of 100 Sims');assert.equal(await page.locator('#lw-explore-chips button').count(),0);
  await page.locator('#lw-explore-advanced summary').click();await page.locator('[data-add-filter="ambition"]').click();await page.locator('#lw-rule-5-text').fill('impossible-unmodeled-goal');await page.locator('.lw-explorer-no-results').waitFor();await page.locator('#lw-empty-reset').click();await page.waitForFunction(()=>document.querySelector('#lw-explore-total').textContent==='100 of 100 Sims');
  assert.deepEqual(errors,[]);console.log('PASS: browser filter builder, matched badges, pagination reset, collapsed removable chips, range errors, empty states and 390px mobile layout.');
 }
 assert.equal(JSON.stringify(db.prepare('SELECT seconds,version FROM lw_worlds WHERE world_id=?').get(worldId)),before);assert.equal(db.prepare('SELECT count(*) n FROM lw_journal').get().n,journalBefore);
 console.log('PASS: browsing preserves simulation time, version and journals.');
}catch(e){console.error(logs);throw e;}
finally{await browser?.close();if(server){server.kill('SIGTERM');await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));}closeOpenSims();db.close();fs.rmSync(scratch,{recursive:true,force:true});}
