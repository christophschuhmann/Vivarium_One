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
const env={...process.env,VIV_DATA_DIR:scratch,VIV_HOST:'127.0.0.1',MOCK_PROVIDERS:'1',PORT:String(gamePort),MUSIC_API_URL:`http://127.0.0.1:${musicPort}`,MUSIC_PORT:String(musicPort),MUSIC_DATA_DIR:music,MUSIC_CONTROL_TOKEN:'fixture-control-token',HYPRLAB_API_KEY:'fixture-central-key',OPENROUTER_API_KEY:''};
execFileSync(process.execPath,[path.join(root,'scripts/seed_demo.js')],{cwd:root,env,stdio:'pipe'});
const dbURL=pathToFileURL(path.join(root,'server/db.js')).href;
execFileSync(process.execPath,['--input-type=module','-e',`import {db,setSetting} from ${JSON.stringify(dbURL)};setSetting('local_owner_user_id',db.prepare("SELECT id FROM users WHERE email='demo@vivarium.local'").get().id);db.prepare("UPDATE users SET credit_balance=0 WHERE role='player'").run();db.close();`],{cwd:root,env});
const preload=path.join(scratch,'provider-fixture.mjs');
fs.writeFileSync(preload,`import fs from 'node:fs';const real=globalThis.fetch;const models=JSON.parse(fs.readFileSync(${JSON.stringify(path.join(root,'config/hyprlab_models.json'))})).models;globalThis.fetch=(url,opts)=>new URL(url).hostname==='api.hyprlab.io'&&new URL(url).pathname.endsWith('/models')?Promise.resolve(Response.json({data:models})):real(url,opts);`);
function start(args){const child=spawn(process.execPath,args,{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']});let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',data=>logs=(logs+data).slice(-5000));children.push(child);return ()=>logs;}
const gameLogs=start(['--import',preload,'server/index.js']);start(['server/music_server.js']);
async function ready(url){for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('Fixture server did not start: '+gameLogs());}
try {
 await Promise.all([ready(base),ready(env.MUSIC_API_URL+'/api/stats')]);
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 let r=await context.request.post(base+'/api/auth/login',{data:{email:'demo@vivarium.local',password:'alice-and-bob'}});assert.equal(r.status(),200);
 await page.goto(base);await page.locator('#home-c .world-grid').waitFor();
 await page.evaluate(()=>accountModal());await page.locator('[data-settings-tab="ai"]').click();
 await page.locator('[data-key="hyprlab"]').fill('test-personal-only-hyprlab');
 await page.locator('[data-save-models]').click();await page.locator('[data-save-result]').filter({hasText:'Saved.'}).waitFor();
 r=await context.request.get(base+'/api/provider/settings');let settings=await r.json();assert.equal(settings.active,true);assert.equal(settings.keys.openrouter.configured,false);assert.ok(Object.values(settings.roles).every(role=>role.provider==='hyprlab'));
 assert.equal(await page.locator('[data-model="image"] option').count(),53);assert.equal(await page.locator('[data-model="tts"] option').count(),14);
 await page.locator('[data-model="tts"]').selectOption('eleven-v3');await page.locator('[data-eleven-voice]').waitFor({state:'visible'});assert.equal(await page.locator('[data-eleven-voice]').inputValue(),'JBFqnCBsd6RMkjVDRZzb');
 await page.locator('[data-save-models]').click();await page.locator('[data-save-result]').filter({hasText:'Saved.'}).waitFor();
 await page.locator('[data-model="tts"]').selectOption('gemini-3.8-flash-tts');await page.locator('[data-save-models]').click();await page.locator('[data-save-result]').filter({hasText:'Saved.'}).waitFor();
 await page.locator('[data-settings-tab="storage"]').click();await page.getByRole('heading',{name:'Storage & scenarios'}).waitFor();
 assert.equal(await page.locator('.storage-metrics article').count(),4);
 const summary=await (await context.request.get(base+'/api/storage')).json();assert.equal(summary.projects.count,1);assert.ok(summary.assets.count>10);
 page.once('dialog',dialog=>dialog.accept('Browser independent copy'));await page.locator('[data-duplicate-world]').first().click();await page.getByText('Browser independent copy',{exact:true}).waitFor();
 const copiedSummary=await (await context.request.get(base+'/api/storage')).json();assert.equal(copiedSummary.projects.count,2);assert.ok(copiedSummary.assets.count>summary.assets.count);
 await page.locator('[data-select-asset]').first().check();const assetDownloadEvent=page.waitForEvent('download');await page.locator('[data-export-assets]').click();const assetDownload=await assetDownloadEvent;assert.equal(await assetDownload.failure(),null);assert.ok(assetDownload.suggestedFilename().endsWith('.zip'));
 const downloadEvent=page.waitForEvent('download');await page.locator('.storage-row a[download]').first().click();const download=await downloadEvent;assert.ok(download.suggestedFilename().endsWith('.zip'));assert.equal(await download.failure(),null);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/vivarium-storage-mobile.png',fullPage:true});
 const overflow=await page.locator('.settings-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+2);assert.equal(overflow,false);
 await page.keyboard.press('Escape');assert.equal(await page.locator('.settings-dialog').count(),0);
 const foundMusic=await (await context.request.post(base+'/api/music/search',{data:{query:'quiet library peaceful study piano',genre:'modern_realistic'}})).json();assert.ok(foundMusic.candidates.length);const track=foundMusic.candidates[0];
 r=await context.request.head(base+track.url);assert.equal(r.status(),200);assert.ok(Number(r.headers()['content-length'])>1000);
 r=await context.request.get(base+track.url,{headers:{Range:'bytes=0-1023'}});assert.equal(r.status(),206);assert.equal((await r.body()).length,1024);
 const world=summary.worlds[0],before=await (await context.request.get(base+'/api/worlds/'+world.id)).json();
 r=await context.request.post(base+'/api/worlds/'+world.id+'/ticks',{data:{timeDelta:'+5m',chapter:{animate:false}}});const events=await r.text();assert.ok(events.includes('event: done'),events);assert.ok(!events.includes('event: error'),events);
 const after=await (await context.request.get(base+'/api/worlds/'+world.id)).json();assert.equal(after.world.tick_index,before.world.tick_index+1);assert.equal(Date.parse(after.world.sim_time)-Date.parse(before.world.sim_time),300000);assert.ok(after.world.current_music);
 assert.deepEqual(errors,[]);
 r=await context.request.get(base+'/api/storage/music/export');assert.equal(r.status(),200);const archive=path.join(scratch,'music.zip');fs.writeFileSync(archive,await r.body());assert.ok(execFileSync('unzip',['-Z1',archive],{encoding:'utf8'}).includes('audio-index.json'));
 r=await context.request.post(base+'/api/storage/music/manage',{data:{action:'rebuild-cache'}});assert.equal(r.status(),200);assert.equal((await r.json()).ready,true);
 r=await context.request.post(env.MUSIC_API_URL+'/api/maintenance',{data:{action:'remove-library'}});assert.equal(r.status(),403);
 r=await context.request.post(base+'/api/storage/music/manage',{data:{action:'remove-library',confirm:'DELETE MUSIC LIBRARY'}});assert.equal(r.status(),200);assert.equal(fs.existsSync(music),false);
 r=await context.request.get(base+'/api/music/status');assert.equal((await r.json()).ready,false);
 r=await context.request.post(base+'/api/music/search',{data:{query:'quiet home'}});assert.equal(r.status(),503);
 console.log('PASS shared music ZIP, cache rebuild, protected maintenance, isolated library deletion and graceful offline search');
 console.log('PASS main Save with only HyprLab, live catalog classification, storage UI, independent copy and ZIP, 390px mobile layout, keyboard close, real music proxy HEAD/range, isolated five-minute tick with automatic score');
 await context.close();
} catch(error){console.error(error);throw error;} finally {
 await browser?.close();
 await Promise.all(children.map(child=>new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);try{process.kill(-child.pid,'SIGTERM');}catch{}setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}resolve();},2000).unref();})));
 fs.rmSync(scratch,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
