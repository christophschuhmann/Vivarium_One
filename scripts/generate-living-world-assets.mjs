// Resumable HyprLab batch. Explicit model; at most 20 simultaneous generation calls.
// Run: VIV_IMAGE_PYTHON=/path/to/python-with-Pillow-and-NumPy node --env-file=.env scripts/generate-living-world-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { operatorKey } from '../server/byok.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const library=path.join(root,'assets/living-world-library');
const plan=JSON.parse(fs.readFileSync(path.join(library,'generation-plan.json'),'utf8'));
const apiKey=operatorKey('hyprlab');
if(!apiKey)throw new Error('HyprLab credential missing. Configure it before running this batch.');
if(plan.model!=='nano-banana-2-lite')throw new Error('This batch must use nano-banana-2-lite.');
const python=process.env.VIV_IMAGE_PYTHON || 'python3';
const maxParallel=Math.min(20,Math.max(1,Number(process.env.VIV_IMAGE_CONCURRENCY || plan.concurrency || 20)));
const only=new Set(process.argv.slice(2));
const jobs=plan.jobs.filter(j=>!only.size||only.has(j.id));
const journal=path.join(library,'generation-log.jsonl');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let next=0,done=0,failed=0,inflight=0,peak=0,skipped=0;
const refs=new Map();
function atomicJSON(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp-'+process.pid;fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n');fs.renameSync(temp,file);}
function log(record){fs.appendFileSync(journal,JSON.stringify({at:new Date().toISOString(),...record})+'\n');console.log(JSON.stringify(record));}
function referenceData(ref){if(refs.has(ref.file))return refs.get(ref.file);const bytes=fs.readFileSync(path.join(library,ref.file));const mime=bytes[0]===0xff?'image/jpeg':bytes.subarray(1,4).toString()==='PNG'?'image/png':'image/webp';const uri='data:'+mime+';base64,'+bytes.toString('base64');refs.set(ref.file,uri);return uri;}
async function normalize(input,output,kind){return new Promise((resolve,reject)=>{const child=spawn(python,[path.join(root,'scripts/normalize-library-image.py'),input,output,kind]);let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>{if(code!==0)return reject(new Error('Image verification failed: '+err.slice(-350)));try{resolve(JSON.parse(out));}catch(e){reject(e);}});});}
async function run(job){
 const sidecar=path.join(library,job.sidecar),output=path.join(library,job.file);
 let previous={};try{previous=JSON.parse(fs.readFileSync(sidecar,'utf8'));}catch{}
 if(previous.status==='complete'&&fs.existsSync(output)){
  const bytes=fs.readFileSync(output);if(createHash('sha256').update(bytes).digest('hex')===previous.sha256){done++;skipped++;return;}
 }
 const attempts=previous.attempts || [], started=new Date().toISOString();
 for(let attempt=1;attempt<=3;attempt++){
  const begin=Date.now();const record={number:attempts.length+1,started_at:new Date().toISOString(),prompt:job.prompt};attempts.push(record);
  atomicJSON(sidecar,{...job,status:'generating',started_at:started,attempts});
  try{
   const body={model:'nano-banana-2-lite',prompt:job.prompt,image_input:job.reference_images.map(referenceData),aspect_ratio:job.aspect_ratio,response_format:'b64_json',output_format:'png'};
   inflight++;peak=Math.max(peak,inflight);
   let response;try{response=await fetch(plan.endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},body:JSON.stringify(body),signal:AbortSignal.timeout(300000)});}finally{inflight--;}
   if(!response.ok){const text=(await response.text()).replaceAll(apiKey,'[redacted]').slice(0,400);throw Object.assign(new Error(`HyprLab ${response.status}: ${text}`),{status:response.status,retry:response.status===429||response.status>=500});}
   const data=await response.json(),item=data.data?.[0];let bytes;
   if(item?.b64_json)bytes=Buffer.from(item.b64_json,'base64');
   else if(item?.url){if(!item.url.startsWith('https://'))throw new Error('Provider returned a non-HTTPS image URL');const download=await fetch(item.url,{signal:AbortSignal.timeout(60000)});if(!download.ok)throw Object.assign(new Error(`Image download ${download.status}`),{retry:true});bytes=Buffer.from(await download.arrayBuffer());}
   else throw new Error('Provider returned no image.');
   fs.mkdirSync(path.dirname(output),{recursive:true});const raw=output+'.provider.tmp';fs.writeFileSync(raw,bytes);
   let info;try{info=await normalize(raw,output,job.kind);}finally{fs.rmSync(raw,{force:true});}
   record.status='complete';record.elapsed_ms=Date.now()-begin;
   const result={...job,...info,status:'complete',generated_at:new Date().toISOString(),elapsed_ms:Date.now()-begin,attempts,response_usage:data.usage||null,provider_payload_sha256:createHash('sha256').update(bytes).digest('hex'),png_normalization:'Decoded provider image once and saved losslessly as PNG; no resizing or content changes.',estimated_cost_usd:plan.estimated_price_per_image_usd,api_request:{model:body.model,prompt:body.prompt,aspect_ratio:body.aspect_ratio,response_format:body.response_format,output_format:body.output_format,image_input:job.reference_images.map(r=>({file:r.file,sha256:r.sha256,transport:'base64 data URI'}))},review_status:'awaiting_visual_review'};
   atomicJSON(sidecar,result);done++;log({event:'complete',id:job.id,done,total:jobs.length,elapsed_ms:result.elapsed_ms,width:info.width,height:info.height,active_generation_calls:inflight});return;
  }catch(error){
   record.status='failed';record.elapsed_ms=Date.now()-begin;record.error=String(error.message).replaceAll(apiKey,'[redacted]');
   const retry=attempt<3&&(error.retry||/fetch failed|timeout|aborted/i.test(record.error));
   atomicJSON(sidecar,{...job,status:retry?'retrying':'failed',attempts,error:record.error});
   log({event:retry?'retry':'failed',id:job.id,attempt,error:record.error});
   if(!retry){failed++;return;}await sleep(3000*2**(attempt-1)+Math.random()*2000);
  }
 }
}
log({event:'start',model:plan.model,jobs:jobs.length,concurrency:maxParallel});
await Promise.all(Array.from({length:maxParallel},async()=>{while(next<jobs.length){const job=jobs[next++];await run(job);}}));
const runSummary={finished_at:new Date().toISOString(),model:plan.model,requested:jobs.length,completed:done,failed,skipped_existing_complete:skipped,peak_parallel_generation_calls:peak,max_parallel_generation_calls:maxParallel,estimated_new_successful_cost_usd:Number(((done-skipped)*plan.estimated_price_per_image_usd).toFixed(4)),actual_cost_usd:null,price_note:'Estimate based on the user-provided unit price. Actual cost is not returned by this provider.'};
const runId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid;
atomicJSON(path.join(library,'generation-runs',runId+'.json'),runSummary);
const allRecords=plan.jobs.map(j=>JSON.parse(fs.readFileSync(path.join(library,j.sidecar),'utf8')));
const completedRecords=allRecords.filter(r=>r.status==='complete');
const historicPeaks=fs.readFileSync(journal,'utf8').trim().split('\n').map(line=>JSON.parse(line)).filter(r=>r.event==='finished').map(r=>r.peak_parallel_generation_calls);
atomicJSON(path.join(library,'generation-summary.json'),{...runSummary,requested:plan.jobs.length,completed:completedRecords.length,failed:allRecords.filter(r=>r.status==='failed').length,pending:allRecords.filter(r=>!['complete','failed'].includes(r.status)).length,peak_parallel_generation_calls:Math.max(peak,...historicPeaks),estimated_successful_library_cost_usd:Number((completedRecords.length*plan.estimated_price_per_image_usd).toFixed(4)),last_run:runId});
log({event:'finished',completed:done,failed,peak_parallel_generation_calls:peak});
process.exit(failed?1:0);
