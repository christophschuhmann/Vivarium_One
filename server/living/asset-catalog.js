import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {DATA_DIR} from '../db.js';
export const assetRoot=path.resolve(process.env.VIV_ASSET_LIBRARY||path.join(DATA_DIR,'hf-asset-library'));
let catalog,stamp,characterPool;const pending=new Map();let active=0;const queue=[];
function connection(){const file=path.join(assetRoot,'catalog.sqlite');if(!fs.existsSync(file))return null;const next=fs.statSync(file).mtimeMs;if(next!==stamp){catalog?.close();catalog=new Database(file,{readonly:true});stamp=next;characterPool=null;}return catalog;}
export function catalogEntry(id){return connection()?.prepare('SELECT * FROM assets WHERE id=?').get(id)||null;}
export function catalogStats(){const c=connection();return c?{count:c.prepare('SELECT count(*) n FROM assets').get().n,characters:c.prepare("SELECT count(*) n FROM assets WHERE kind='character'").get().n,identities:c.prepare("SELECT count(DISTINCT identity_id) n FROM assets WHERE kind='character'").get().n,sources:c.prepare('SELECT repo,revision FROM sources').all()}: {count:0,characters:0,identities:0,sources:[]};}
export function catalogSearch(query='',{kind='background',age,gender,heritage,style,emotion,limit=24,offset=0,excludeIdentities=[]}={}){
 const c=connection();if(!c)return [];
 const where=['a.kind=?'],args=[kind];
 if(age!==undefined&&Number.isFinite(Number(age))){where.push('a.age_min<=? AND a.age_max>=?');args.push(Number(age),Number(age));}
 for(const [col,value] of [['gender',gender],['ethnicity',heritage],['style',style],['emotion',emotion]])if(value){where.push(`a.${col}=?`);args.push(({white:'white_caucasian',black:'african_american',latino:'latino',japanese:'japanese',indian:'indian'})[value]||value);}
 excludeIdentities=excludeIdentities.slice(0,10000);
 if(excludeIdentities.length){where.push(`a.identity_id NOT IN (${excludeIdentities.map(()=>'?').join(',')})`);args.push(...excludeIdentities.slice(0,10000));}
 const tokens=[...new Set(String(query).match(/[\p{L}\p{N}]+/gu)||[])].slice(0,16),search=tokens.map(t=>'"'+t+'"').join(' OR ');
 if(search){where.push('asset_search MATCH ?');args.push(search);}
 const sql=`SELECT a.*,${search?'bm25(asset_search,0,2,1,1)':'0'} rank FROM assets a ${search?'JOIN asset_search ON asset_search.id=a.id':''} WHERE ${where.join(' AND ')} ORDER BY ${search?'rank,':''}a.id LIMIT ? OFFSET ?`;
 return c.prepare(sql).all(...args,Math.max(1,Math.min(50,Number(limit)||24)),Math.max(0,Number(offset)||0)).map(r=>({id:r.id,identityId:r.identity_id,title:r.title,caption:{en:r.caption},kind:r.kind,ageRange:r.age_min===null?null:[r.age_min,r.age_max],gender:r.gender,heritage:r.ethnicity,style:r.style,emotion:r.emotion,score:-r.rank,source:{repo:r.repo,revision:r.revision},metadata:JSON.parse(r.metadata)}));
}
// Auto casting uses base portraits, not every job/outfit row (which biased the
// first 50 results toward a few young identities). Image ages are source metadata,
// not facial age estimates. Never cross an adult/minor boundary to fill a gap.
const heritageNames={white:'white_caucasian',black:'african_american'};
export function characterCandidates({age,gender,heritage,limit=50}={}){
 const c=connection();if(!c)return [];
 characterPool??=c.prepare("SELECT * FROM assets WHERE kind='character' AND emotion='neutral' AND id LIKE '%-neutral'").all().map(r=>({...r,metadata:JSON.parse(r.metadata)}));
 let pool=characterPool.filter(r=>r.gender===gender&&r.age_min<=age&&r.age_max>=age);
 const sameHeritage=pool.filter(r=>r.ethnicity===(heritageNames[heritage]||heritage));
 if(sameHeritage.length)pool=sameHeritage;
 const distance=r=>Math.abs((Number.isFinite(r.metadata.age_years)?r.metadata.age_years:(r.age_min+r.age_max)/2)-age);
 pool.sort((a,b)=>distance(a)-distance(b)||a.id.localeCompare(b.id));
 if(!pool.length)return [];
 // Allow variety among equally close portraits; broad age bins are only a guard.
 const tolerance=age<18?0:age<30?1:2,closest=distance(pool[0]);
 return pool.filter(r=>distance(r)<=closest+tolerance).slice(0,limit).map(r=>({id:r.id,identityId:r.identity_id,kind:r.kind,ageRange:[r.age_min,r.age_max],imageAge:r.metadata.age_years,gender:r.gender,heritage:r.ethnicity,emotion:'neutral',style:r.style,caption:{en:r.caption},metadata:r.metadata}));
}
export function neutralAsset(id){
 const entry=catalogEntry(id);if(!entry||entry.kind!=='character')return id;
 if(entry.emotion==='neutral')return id;
 return connection().prepare("SELECT id FROM assets WHERE identity_id=? AND emotion='neutral' AND style=? ORDER BY CASE WHEN id LIKE '%-neutral' THEN 0 ELSE 1 END,id LIMIT 1").get(entry.identity_id,entry.style)?.id||id;
}
export function emotionAsset(id,affect,presentation=null){
 const base=neutralAsset(id),entry=catalogEntry(base);if(!entry||entry.kind!=='character')return base;
 // Calm satisfaction, hope and a low-intensity positive feeling do not mean
// laughter. Unknown/missing expression variants always fall back to neutral.
 if(presentation?.manner==='friendly_composure'&&(affect?.updated_at??Infinity)<presentation.until)return base;
 const states=typeof affect==='string'?[{id:affect,intensity:1}]:affect?.states||[];
 const expressions={joy:'joyful',mirth:'joyful',elation:'joyful',amusement:'joyful',anger:'angry',annoyance:'annoyed',impatience_and_irritability:'annoyed',distress:'sad',grief:'sad',sadness:'sad',fear:'afraid',disgust:'disgust',pain:'pain',thankfulness_gratitude:'grateful'};
 const eligible=states.filter(e=>expressions[e.id]&&Number(e.intensity)>=(expressions[e.id]==='joyful'?.8:.5)).sort((a,b)=>b.intensity-a.intensity);
 const mapped=expressions[eligible[0]?.id];if(!mapped)return base;
 return connection().prepare('SELECT id FROM assets WHERE identity_id=? AND emotion=? AND style=? ORDER BY id LIMIT 1').get(entry.identity_id,mapped,entry.style)?.id||base;
}
export function cachedAssetFile(id,variant='preview'){const r=catalogEntry(id);if(!r||!['full','preview','sprite'].includes(variant))return null;const file=path.join(assetRoot,'cache',r.id+'-'+r.sha256.slice(0,12)+'--'+variant+'.png');return fs.existsSync(file)?file:null;}
export async function materializeAsset(id,variant='preview'){
 if(!catalogEntry(id)||!['full','preview','sprite'].includes(variant))return null;
 const cached=cachedAssetFile(id,variant);if(cached)return cached;
 const key=id+':'+variant;if(pending.has(key))return pending.get(key);
 const promise=(async()=>{if(active>=3)await new Promise(resolve=>queue.push(resolve));active++;
  try{const {stdout}=await promisify(execFile)(process.env.VIV_PYTHON_BIN||(fs.existsSync(new URL('../../.venv/bin/python',import.meta.url))?new URL('../../.venv/bin/python',import.meta.url).pathname:'python3'),[new URL('../../scripts/materialize-hf-asset.py',import.meta.url).pathname,'--root',assetRoot,'--id',id,'--variant',variant],{timeout:90000,maxBuffer:20000});return stdout.trim().split('\n').at(-1);}
  finally{active--;queue.shift()?.();pending.delete(key);}
 })();pending.set(key,promise);return promise;
}
export function externalLibraryEntries(ids){return [...ids].map(catalogEntry).filter(Boolean).map(r=>({id:r.id,kind:r.kind,title:r.title,caption:{en:r.caption},age_range_years:r.age_min==null?undefined:[r.age_min,r.age_max],gender:r.gender,heritage:r.ethnicity,sfw:true,sha256:r.sha256,source:{repo:r.repo,revision:r.revision},license:connection().prepare('SELECT license FROM sources WHERE repo=?').get(r.repo)?.license,external:true}));}
