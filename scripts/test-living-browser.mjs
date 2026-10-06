// Browser integration with an isolated server and fixture provider catalog.
// Creates its own database and a tiny music fixture; never targets production.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import Database from 'better-sqlite3';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'vivarium-browser-'));
const children=[];let browser;
async function port(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
const gamePort=await port(),musicPort=await port(),base=`http://127.0.0.1:${gamePort}`;
const music=path.join(scratch,'music-library');fs.mkdirSync(path.join(music,'indices'),{recursive:true});fs.mkdirSync(path.join(music,'tars'));
// The audio fixture remains separate from the real downloaded collection.
const audio=Buffer.alloc(8192,1);fs.writeFileSync(path.join(music,'tars/fixture.tar'),audio);
fs.writeFileSync(path.join(music,'README.md'),'Isolated test music, no production assets.');
fs.writeFileSync(path.join(music,'audio-index.json'),JSON.stringify({schema_version:1,shards:[{file:'tars/fixture.tar',bytes:audio.length}],tracks:{1:{tar:'tars/fixture.tar',offset:0,bytes:audio.length}}}));
const metadata=new Database(path.join(music,'indices/rpg_metadata.db'));
metadata.exec(`CREATE TABLE tracks(row_id INTEGER PRIMARY KEY,title,subset,tags_text,mood_text,score_average,play_count,upvote_count,duration_seconds,music_whisper_caption,audio_url,has_singing,evoked_emotions,nsfw_overall_label);CREATE TABLE genre_situations(row_id,genre_key,genre_name,situations);`);
metadata.prepare('INSERT INTO tracks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(1,'Fixture quiet home piano','test','piano calm','peaceful',8,0,0,180,'quiet library peaceful study piano morning home cosy calm','','no','calm','likely_sfw');
metadata.prepare('INSERT INTO genre_situations VALUES (?,?,?,?)').run(1,'modern_realistic','Modern realistic',JSON.stringify(['quiet library peaceful study piano morning home cosy calm']));metadata.close();
const env={...process.env,VIV_DATA_DIR:scratch,VIV_HOST:'127.0.0.1',MOCK_PROVIDERS:'0',PORT:String(gamePort),MUSIC_API_URL:`http://127.0.0.1:${musicPort}`,MUSIC_PORT:String(musicPort),MUSIC_DATA_DIR:music,MUSIC_CONTROL_TOKEN:'fixture-control-token',HYPRLAB_API_KEY:'fixture-central-key',OPENROUTER_API_KEY:''};
execFileSync(process.execPath,[path.join(root,'scripts/seed_demo.js')],{cwd:root,env,stdio:'pipe'});
const dbURL=pathToFileURL(path.join(root,'server/db.js')).href;
execFileSync(process.execPath,['--input-type=module','-e',`import {db,setSetting} from ${JSON.stringify(dbURL)};setSetting('local_owner_user_id',db.prepare("SELECT id FROM users WHERE email='demo@vivarium.local'").get().id);db.prepare("UPDATE users SET credit_balance=0 WHERE role='player'").run();db.close();`],{cwd:root,env});
execFileSync(process.execPath,['--input-type=module','-e',`import {db} from ${JSON.stringify(dbURL)};import {encryptSecret} from ${JSON.stringify(pathToFileURL(path.join(root,'server/byok.js')).href)};db.prepare("UPDATE users SET hypr_key=?,or_enabled=1 WHERE email='demo@vivarium.local'").run(encryptSecret('fixture-personal-key'));db.close();`],{cwd:root,env});
const preload=path.join(scratch,'provider-fixture.mjs');
fs.writeFileSync(preload,`import fs from 'node:fs';const real=globalThis.fetch;const models=JSON.parse(fs.readFileSync(${JSON.stringify(path.join(root,'config/hyprlab_models.json'))})).models;globalThis.fetch=async(url,opts)=>{const u=new URL(url);if(u.hostname!=='api.hyprlab.io')return real(url,opts);if(u.pathname.endsWith('/models'))return Response.json({data:models});const b=JSON.parse(opts.body),messages=b.messages||[],system=messages[0]?.content||'',ctx=JSON.parse(messages.at(-1)?.content||'{}');let content;if(system.includes('fictional biographies'))content={biographies:ctx.people.map(p=>({id:p.id,text:p.existing+' Ein freundlicher Nachbar mit sorgfältig entwickelten Motiven, prägenden Erinnerungen und guten Gründen für den Alltag.'}))};else if(system.includes('Living World Storyteller')){const first=ctx.events.find(e=>e.participants.includes(ctx.owned[0]));content={story:'Ein freundlicher Morgen.',thoughts:ctx.owned.map(id=>({simId:id,eventId:ctx.events.find(e=>e.participants.includes(id)).id,text:'Ich freue mich auf die Begegnungen des Tages.',confidence:.7})),narration:[{speaker:ctx.owned[0],eventId:first.id,locationId:first.location_id,mode:'speech',text:'Guten Morgen!',emotion:'friendly'}]};}else if(system.includes('Living World director'))content={reply:'Ich kann den Anker der ersten Figur lösen.',actions:[{type:'set_anchor',kind:'sim',id:ctx.viewedSims[0].id,enabled:false}]};else content={reply:'Danke für die Frage. Ich freue mich auf einen ruhigen Tag.',thought:'Eine freundliche Frage tut gut.',mood:'hopeful'};return Response.json({choices:[{message:{content:JSON.stringify(content)}}],usage:{prompt_tokens:100,completion_tokens:100}});};`);
function start(args){const child=spawn(process.execPath,args,{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']});let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',data=>logs=(logs+data).slice(-5000));children.push(child);return ()=>logs;}
const gameLogs=start(['--import',preload,'server/index.js']);start(['server/music_server.js']);
async function ready(url){for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('Fixture server did not start: '+gameLogs());}
try {
 await Promise.all([ready(base),ready(env.MUSIC_API_URL+'/api/stats')]);
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await context.addInitScript(()=>localStorage.setItem('viv_tts',JSON.stringify({prepare:false,autoplay:false,innerVoice:false,musicOn:false})));
 const login=await context.request.post(base+'/api/auth/login',{data:{email:'demo@vivarium.local',password:'alice-and-bob'}});assert.equal(login.status(),200);
 const created=await context.request.post(base+'/api/living/towns',{data:{population:500,title:'Browser town',seed:73}});assert.equal(created.status(),200);const world=(await created.json()).worldId;
 const snapshot=async()=> (await context.request.get(base+'/api/living/worlds/'+world)).json();
 await page.goto(base+'/living.html?world='+world);await page.locator('#stage-root').waitFor();await page.locator('.lw-minimap .lnode').first().waitFor();assert.ok(page.url().includes('#/stage'));
 assert.ok(await page.locator('.stage-char').count()>0);assert.ok(await page.locator('img,svg image').count()<=100);
 await page.locator('#pl').click();await page.locator('#lw-picker-map .lnode').first().waitFor();assert.ok(await page.locator('img,svg image').count()<=100);await page.locator('.modal-bg .x').click();
 await page.locator('.stage-char').first().click();await page.locator('.mind-cols').waitFor();assert.equal(await page.locator('#lw-stats').count(),1);
 const before=await snapshot();await page.locator('#iv-in').fill('Wie geht es dir heute?');await page.locator('#iv-send').click();await page.locator('#iv-log').getByText('Danke für die Frage.',{exact:false}).waitFor();assert.equal((await snapshot()).simulation.seconds,before.simulation.seconds);
 await page.locator('#lw-talk').click();await page.locator('#lw-talk-input').fill('Erzähl mir etwas über deine Wünsche.');await page.locator('#lw-talk-send').click();await page.locator('#lw-talk-log').getByText('Danke für die Frage.',{exact:false}).waitFor();assert.equal((await snapshot()).simulation.seconds,before.simulation.seconds);
 await page.locator('.modal-bg').last().locator('.x').click();await page.locator('#lw-stats').click();await page.locator('#lw-journal .attr').first().waitFor();assert.ok(await page.locator('.lw-stat progress').count()>=8);await page.locator('#lw-close-profile').click();
 await page.locator('#intervene').click();await page.locator('#iv-text').fill('Ein freundlicher Brief kommt an.');await page.locator('#iv-go').click();await page.locator('#veil .thinking-veil').waitFor({state:'hidden'});assert.equal((await snapshot()).simulation.seconds,before.simulation.seconds+60);assert.ok(await page.locator('#storylines').getByText('Guten Morgen!',{exact:false}).count()>0);
 await page.locator('#gm-chip').click();await page.locator('#gmc-in').fill('Ändere den Erzählfokus.');await page.locator('#gmc-send').click();await page.locator('.gmc-card [data-apply]').waitFor();const anchoredBefore=(await snapshot()).anchors.sims.length;await page.locator('.gmc-card [data-apply]').click();await page.getByText('✓ Applied',{exact:true}).waitFor();assert.equal((await snapshot()).anchors.sims.length,anchoredBefore-1);await page.locator('.gmc-x').click();
 await page.goto(base+'/#/atlas?w='+world);await page.locator('#lw-atlas .lnode').first().waitFor();
 const overview=await (await context.request.get(base+'/api/living/worlds/'+world+'/graph')).json(),neighborhood=overview.nodes.find(n=>n.kind==='neighborhood');await page.locator(`#lw-atlas [data-id="${neighborhood.id}"]`).click();await page.waitForFunction(()=>document.querySelector('#lw-atlas [data-level]')?.textContent.includes('Häuser'));
 const expanded=await (await context.request.get(base+'/api/living/worlds/'+world+'/graph?focus='+neighborhood.id+'&depth=1')).json(),house=expanded.nodes.find(n=>n.kind==='building'&&!n.landmark);
 await page.locator(`#lw-atlas [data-id="${house.id}"]`).click();await page.waitForFunction(()=>document.querySelector('#lw-atlas [data-level]')?.textContent.includes('Räume'));assert.ok(await page.locator('img,svg image').count()<=100);
 assert.ok(await page.locator('#lw-atlas .lw-coarse').count()>0);await page.locator('#lw-atlas [data-up]').click();await page.waitForFunction(()=>document.querySelector('#lw-atlas [data-level]')?.textContent.includes('Häuser'));await page.locator('#lw-atlas [data-up]').click();await page.waitForFunction(()=>document.querySelector('#lw-atlas [data-level]')?.textContent.includes('Nachbarschaften'));
 await page.goto(base+'/#/cast?w='+world);await page.locator('#lw-browse').click();await page.locator('#lw-sim-list .cast-tile').first().waitFor();assert.equal(await page.locator('#lw-sim-list .cast-tile').count(),12);await page.locator('#lw-next').click();await page.waitForFunction(()=>document.querySelector('#lw-count')?.textContent.includes('13–24'));assert.ok(await page.locator('img,svg image').count()<=100);await page.locator('.modal-bg .x').click();
 await page.goto(base+'/#/stage?w='+world);await page.locator('.lw-minimap .lnode').first().waitFor();await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await page.locator('img,svg image').count()<=100);assert.deepEqual(errors,[]);
 console.log('PASS isolated original stage and sprites, mind and Stats, paused private/talk conversations, intervention narration and clock commit, original GM reviewed anchor changes, 500-Sim hierarchical atlas, paginated cast, image budget and mobile layout');
 await context.close();
}finally{
 await browser?.close();await Promise.all(children.map(child=>new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);try{process.kill(-child.pid,'SIGTERM');}catch{}setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}resolve();},2000).unref();})));fs.rmSync(scratch,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
