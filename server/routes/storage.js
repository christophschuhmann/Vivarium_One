// Player storage tools. Every scenario and asset operation checks account ownership.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { db, DATA_DIR, ASSET_DIR, getSetting, uid, pj } from '../db.js';
import { requireUser, requireVerified, requireAdmin, httpErr } from '../auth.js';
import { assetPath, saveAsset } from '../assets.js';
import { buildWorldManifest, assetIdsIn } from '../world_io.js';
import { MUSIC_API } from '../music_client.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const musicDirectory=()=>process.env.MUSIC_DATA_DIR || path.join(DATA_DIR,'music-library');
export function directoryBytes(directory) {
  let bytes=0,files=0;
  if(!fs.existsSync(directory))return {bytes,files};
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})) {
    const filename=path.join(directory,entry.name);
    if(entry.isDirectory()) {const size=directoryBytes(filename);bytes+=size.bytes;files+=size.files;}
    else if(entry.isFile()) {bytes+=fs.statSync(filename).size;files++;}
  }
  return {bytes,files};
}
function physicalBytes(asset) {
  const filename=assetPath(asset);let bytes=0;
  if(fs.existsSync(filename))bytes+=fs.statSync(filename).size;
  for(const name of fs.readdirSync(ASSET_DIR))if(name.startsWith(asset.file+'_w'))bytes+=fs.statSync(path.join(ASSET_DIR,name)).size;
  return bytes;
}
function referenceMap(user) {
  const map=new Map();
  for(const world of db.prepare('SELECT id,title FROM worlds WHERE user_id=?').all(user.id)) {
    const manifest=buildWorldManifest(world.id);
    for(const id of assetIdsIn({...manifest,assets:[]})) {
      if(!map.has(id))map.set(id,[]);
      map.get(id).push({id:world.id,title:world.title});
    }
  }
  return map;
}
function ownAsset(user,id) {
  const asset=db.prepare('SELECT * FROM assets WHERE id=? AND user_id=?').get(id,user.id);
  if(!asset)throw httpErr(404,'NOT_FOUND','Asset not found.');
  return asset;
}
function sharedAllowed(req,user) {
  if(getSetting('local_owner_user_id')===user.id)return true;
  try {requireAdmin(req);return true;}catch{return false;}
}
async function zip(reply,title,fill) {
  const base=path.join(DATA_DIR,'tmp_storage');fs.mkdirSync(base,{recursive:true});
  const work=fs.mkdtempSync(path.join(base,'export-'));
  try {
    const {cwd,args}=await fill(work);
    const target=path.join(work,'export.zip');
    await new Promise((resolve,reject)=> {
      const child=spawn('zip',['-q','-0',target,...args],{cwd,stdio:['ignore','ignore','pipe']});let error='';
      child.stderr.on('data',data=>error+=data);child.once('error',reject);
      child.once('close',code=>code===0?resolve():reject(new Error('ZIP export failed: '+error.slice(-200))));
    });
    const stream=fs.createReadStream(target);
    const clean=()=>fs.rmSync(work,{recursive:true,force:true});stream.once('close',clean);stream.once('error',clean);
    reply.header('Content-Disposition',`attachment; filename="${title}.zip"`).header('Content-Length',fs.statSync(target).size).type('application/zip');
    return reply.send(stream);
  } catch(error) {fs.rmSync(work,{recursive:true,force:true});throw error;}
}

export default async function storageRoutes(app) {
  const exports=new Map();
  app.get('/api/storage',async req=> {
    const user=requireUser(req),owned=db.prepare('SELECT * FROM assets WHERE user_id=?').all(user.id);
    const references=referenceMap(user),sizes=new Map(owned.map(asset=>[asset.id,physicalBytes(asset)]));
    const assetsBytes=[...sizes.values()].reduce((a,b)=>a+b,0);
    const unused=owned.filter(asset=>!references.has(asset.id));
    const worlds=db.prepare('SELECT id,title,tick_index,status FROM worlds WHERE user_id=? ORDER BY updated_at DESC').all(user.id).map(world=> {
      const manifest=buildWorldManifest(world.id);
      return {...world,assets:manifest.assets.length,assetBytes:manifest.assets.reduce((sum,asset)=>sum+(sizes.get(asset.id)||0),0),projectBytes:Buffer.byteLength(JSON.stringify({...manifest,assets:[]}))};
    });
    const volume=fs.statfsSync(DATA_DIR);
    let music={ready:false};
    try {const result=await fetch(MUSIC_API+'/api/stats',{signal:AbortSignal.timeout(1200)});if(result.ok)music=await result.json();}catch{}
    const library=directoryBytes(musicDirectory());
    return {assets:{count:owned.length,bytes:assetsBytes,unusedCount:unused.length,unusedBytes:unused.reduce((n,a)=>n+sizes.get(a.id),0)},worlds,
      projects:{count:worlds.length,bytes:worlds.reduce((n,w)=>n+w.projectBytes,0)},
      music:{...music,...library,canManage:sharedAllowed(req,user),managed:!!process.env.MUSIC_CONTROL_TOKEN},
      assetLibrary:directoryBytes(process.env.VIV_LIVING_LIBRARY || path.join(ROOT,'assets/living-world-library')),
      database:{bytes:fs.statSync(path.join(DATA_DIR,'vivarium.db')).size},
      volume:{totalBytes:volume.blocks*volume.bsize,freeBytes:volume.bavail*volume.bsize},
      note:'Scenario media totals can overlap for older shared branches. Account asset totals count each file once.'};
  });
  app.get('/api/storage/assets',async req=> {
    const user=requireUser(req),references=referenceMap(user);
    const query=req.query||{},offset=Math.max(0,Number(query.offset)||0),limit=Math.min(100,Math.max(1,Number(query.limit)||30));
    const all=db.prepare('SELECT * FROM assets WHERE user_id=? ORDER BY created_at DESC').all(user.id)
      .filter(a=>(!query.kind||a.kind===query.kind)&&(!query.worldId||a.world_id===query.worldId)&&(query.unused!=='1'||!references.has(a.id)));
    return {total:all.length,offset,limit,assets:all.slice(offset,offset+limit).map(a=>({id:a.id,kind:a.kind,mime:a.mime,file:a.file,createdAt:a.created_at,
      bytes:physicalBytes(a),missing:!fs.existsSync(assetPath(a)),usedBy:references.get(a.id)||[],worldId:a.world_id}))};
  });
  app.post('/api/storage/assets/:id/duplicate',async req=> {
    const user=requireVerified(req),asset=ownAsset(user,req.params.id);
    if(!fs.existsSync(assetPath(asset)))throw httpErr(409,'MISSING_FILE','The asset file is missing.');
    const copy=saveAsset({userId:user.id,kind:asset.kind,prompt:asset.prompt,buffer:fs.readFileSync(assetPath(asset)),mime:asset.mime,meta:{...pj(asset.meta,{}),copiedFrom:asset.id}});
    return {ok:true,asset:{id:copy.id,file:copy.file}};
  });
  app.delete('/api/storage/assets/:id',async req=> {
    const user=requireVerified(req),asset=ownAsset(user,req.params.id);
    if(req.body?.confirm!==asset.id)throw httpErr(400,'CONFIRM_REQUIRED','Confirm the asset ID before deleting.');
    if(referenceMap(user).has(asset.id))throw httpErr(409,'ASSET_IN_USE','A scenario or saved scene still uses this asset. Export or delete the scenario first.');
    const bytes=physicalBytes(asset);
    db.prepare('DELETE FROM assets WHERE id=? AND user_id=?').run(asset.id,user.id);
    fs.rmSync(assetPath(asset),{force:true});
    for(const name of fs.readdirSync(ASSET_DIR))if(name.startsWith(asset.file+'_w'))fs.rmSync(path.join(ASSET_DIR,name),{force:true});
    return {ok:true,freedBytes:bytes};
  });
  const exportAssets=async(req,reply)=> {
    const user=requireUser(req);
    const ticket=req.query?.ticket?exports.get(req.query.ticket):null;
    if(req.query?.ticket&&(!ticket||ticket.userId!==user.id||ticket.expires<Date.now()))throw httpErr(404,'NOT_FOUND','The export link expired. Select your assets again.');
    const ids=ticket?.ids || req.body?.ids || (typeof req.query?.ids==='string'?req.query.ids.split(','):null);
    if(!Array.isArray(ids)||ids.length<1||ids.length>1000||ids.some(id=>typeof id!=='string'))throw httpErr(400,'BAD_IDS','Choose between 1 and 1000 assets.');
    const assets=[...new Set(ids)].map(id=>ownAsset(user,id));
    if(assets.some(a=>!fs.existsSync(assetPath(a))))throw httpErr(409,'MISSING_FILE','A selected asset file is missing.');
    return zip(reply,'vivarium-assets',async work=> {
      fs.mkdirSync(path.join(work,'assets'));
      for(const asset of assets) {fs.copyFileSync(assetPath(asset),path.join(work,'assets',path.basename(asset.file)));fs.writeFileSync(path.join(work,'assets',asset.id+'.json'),JSON.stringify(asset,null,2));}
      fs.writeFileSync(path.join(work,'manifest.json'),JSON.stringify({format:'vivarium-assets',version:1,assets},null,2));
      return {cwd:work,args:['-r','assets','manifest.json']};
    });
  };
  app.post('/api/storage/assets/export-link',async req=> {
    const user=requireUser(req),ids=req.body?.ids;
    if(!Array.isArray(ids)||ids.length<1||ids.length>1000||ids.some(id=>typeof id!=='string'))throw httpErr(400,'BAD_IDS','Choose between 1 and 1000 assets.');
    for(const id of ids)ownAsset(user,id);
    for(const [key,ticket] of exports)if(ticket.expires<Date.now())exports.delete(key);
    if(exports.size>=1000)exports.delete(exports.keys().next().value);
    const ticket=uid('export_');exports.set(ticket,{userId:user.id,ids:[...new Set(ids)],expires:Date.now()+600000});
    return {url:'/api/storage/assets/export?ticket='+ticket};
  });
  app.post('/api/storage/assets/export',exportAssets);app.get('/api/storage/assets/export',exportAssets);
  const exportMusic=async(req,reply)=> {
    const user=requireUser(req);if(!sharedAllowed(req,user))throw httpErr(403,'FORBIDDEN','Only the local installation owner or operator can manage the shared music library.');
    const root=musicDirectory();if(!fs.existsSync(path.join(root,'audio-index.json')))throw httpErr(404,'NO_LIBRARY','The music library has not been downloaded.');
    return zip(reply,'vivarium-music-library',async()=>({cwd:root,args:['-r','README.md','indices','tars','audio-index.json']}));
  };
  app.post('/api/storage/music/export',exportMusic);app.get('/api/storage/music/export',exportMusic);
  app.post('/api/storage/music/manage',async req=> {
    const user=requireVerified(req);if(!sharedAllowed(req,user))throw httpErr(403,'FORBIDDEN','Only the local installation owner or operator can manage the shared music library.');
    const action=req.body?.action;
    if(!['rebuild-cache','remove-library'].includes(action))throw httpErr(400,'BAD_ACTION','Unknown music action.');
    if(action==='remove-library'&&req.body?.confirm!=='DELETE MUSIC LIBRARY')throw httpErr(400,'CONFIRM_REQUIRED','Confirm deletion of the shared music library.');
    if(!process.env.MUSIC_CONTROL_TOKEN)throw httpErr(409,'UNMANAGED_MUSIC','Start Vivarium with npm start to enable shared library management.');
    const result=await fetch(MUSIC_API+'/api/maintenance',{method:'POST',headers:{'Content-Type':'application/json','X-Vivarium-Music-Control':process.env.MUSIC_CONTROL_TOKEN},body:JSON.stringify({action}),signal:AbortSignal.timeout(120000)});
    if(!result.ok)throw httpErr(503,'MUSIC_MAINTENANCE_FAILED','Music maintenance failed. Check the local music service.');
    return await result.json();
  });
}
