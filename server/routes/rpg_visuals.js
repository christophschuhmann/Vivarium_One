import fs from 'node:fs';
import {db,j} from '../db.js';
import {requireUser,requireVerified,httpErr} from '../auth.js';
import {saveAsset,matte} from '../assets.js';
import {catalogSearch,catalogStats,catalogEntry,materializeAsset} from '../living/asset-catalog.js';
import {visualCandidates} from '../rpg-library.js';
export default async function visualRoutes(app){
 app.get('/api/visuals/library',async req=>{requireUser(req);const q=req.query||{};return {stats:catalogStats(),items:catalogSearch(q.q||'',{...q,age:q.age||undefined,gender:q.gender||undefined,heritage:q.heritage||undefined,emotion:q.emotion||undefined,kind:q.kind==='character'?'character':'background',limit:24})};});
 app.post('/api/visuals/candidates',async req=>{requireUser(req);return {items:visualCandidates(req.body?.kind==='character'?'character':'background',req.body?.spec||{},5)};});
 app.post('/api/visuals/plan',async req=>{requireUser(req);const plan=req.body?.plan||{};return {items:[...(plan.characters||[]).slice(0,12).map((spec,i)=>({key:'character:'+i,kind:'character',spec,items:visualCandidates('character',spec,5)})),...(plan.locations||[]).slice(0,24).map((spec,i)=>({key:'background:'+i,kind:'background',spec,items:visualCandidates('background',spec,5)}))]};});
 app.get('/api/visuals/library/:id',async(req,reply)=>{requireUser(req);if(!catalogEntry(req.params.id))throw httpErr(404,'NOT_FOUND','Image not found.');const file=await materializeAsset(req.params.id,['full','sprite'].includes(req.query?.variant)?req.query.variant:'preview');if(!file)throw httpErr(404,'NOT_FOUND','Image unavailable.');return reply.header('Cache-Control','private, max-age=86400').type('image/png').send(fs.createReadStream(file));});
 app.post('/api/visuals/upload',async req=>{
  const u=requireVerified(req),part=await req.file({limits:{fileSize:10*1024*1024}});if(!part)throw httpErr(400,'NO_FILE','Choose an image.');
  if(!['image/png','image/jpeg','image/webp'].includes(part.mimetype))throw httpErr(400,'BAD_IMAGE','Choose a PNG, JPEG or WebP image.');
  const buffer=await part.toBuffer();if(part.file.truncated)throw httpErr(413,'TOO_LARGE','Images must be under 10 MB.');
  // Decode in Pillow before accepting bytes, even for backgrounds; rejects spoofed MIME/files.
  let cut;try{cut=await matte(buffer);}catch{throw httpErr(400,'BAD_IMAGE','This image could not be decoded.');}
  const kind=req.query?.kind==='character'?'portrait':'background';
  const a=saveAsset({userId:u.id,kind,buffer,mime:part.mimetype,meta:{uploaded:true}});
  if(kind==='portrait'){const c=saveAsset({userId:u.id,kind:'cutout',buffer:cut,mime:'image/png',meta:{portrait:a.id}});db.prepare('UPDATE assets SET meta=? WHERE id=?').run(j({uploaded:true,cutoutId:c.id}),a.id);}
  return {uploadId:a.id};
 });
}
