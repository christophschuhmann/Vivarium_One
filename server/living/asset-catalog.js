import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {DATA_DIR} from '../db.js';
export const assetRoot=path.resolve(process.env.VIV_ASSET_LIBRARY||path.join(DATA_DIR,'hf-asset-library'));
let catalog,stamp;const pending=new Map();let active=0;const queue=[];
function connection(){const file=path.join(assetRoot,'catalog.sqlite');if(!fs.existsSync(file))return null;const next=fs.statSync(file).mtimeMs;if(next!==stamp){catalog?.close();catalog=new Database(file,{readonly:true});stamp=next;}return catalog;}
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
export function emotionAsset(id,emotion){const entry=catalogEntry(id);if(!entry||entry.kind!=='character')return id;const mapped=({joy:'joyful',contentment:'joyful',anger:'angry',distress:'sad',grief:'sad',doubt:'worried',fear:'afraid',fatigue_exhaustion:'tired',hope:'joyful',longing:'sad',pride:'proud',surprise:'surprised'})[emotion]||emotion||'neutral';return connection().prepare('SELECT id FROM assets WHERE identity_id=? AND emotion=? AND style=? LIMIT 1').get(entry.identity_id,mapped,entry.style)?.id||id;}
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
