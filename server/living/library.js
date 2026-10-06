import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {DATA_DIR} from '../db.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const libraryRoot=path.resolve(process.env.VIV_LIVING_LIBRARY || path.join(root,'assets/living-world-library'));
let entries;
export function library() {
  if(entries)return entries;
  const file=path.join(libraryRoot,'manifest.json');
  entries=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)).entries:bundledLibrary();
  const imported=path.join(DATA_DIR,'living-imports','manifest.json');
  if(fs.existsSync(imported)){const known=new Set(entries.map(e=>e.id));for(const e of JSON.parse(fs.readFileSync(imported)).entries)if(!known.has(e.id))entries.push({...e,imported:true});}
  return entries;
}
const words=text=>String(text || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
export function searchAssets(query,{kind='background',age,gender,heritage,limit=5}={}) {
  const docs=library().filter(e=>e.kind===kind && (kind!=='character'||(e.gender===gender && age>=e.age_range_years?.[0] && age<=e.age_range_years?.[1] && e.sfw===true)));
  const tokens=[...new Set(words(query))],counts=new Map(),rows=docs.map(e=>{const w=words([e.title,e.caption?.en,e.caption?.de,...e.tags || []].join(' ')),tf=new Map();for(const token of w)tf.set(token,(tf.get(token)||0)+1);for(const token of tf.keys())counts.set(token,(counts.get(token)||0)+1);return {e,tf,length:w.length};});
  const avg=rows.reduce((n,r)=>n+r.length,0)/(rows.length||1);
  return rows.map(({e,tf,length})=>({id:e.id,title:e.title,caption:e.caption,kind:e.kind,ageRange:e.age_range_years,gender:e.gender,heritage:e.heritage,
    score:tokens.reduce((n,t)=>{const f=tf.get(t)||0,df=counts.get(t)||0;return n+Math.log(1+(rows.length-df+.5)/(df+.5))*f*2.2/(f+1.2*(.25+.75*length/(avg||1)));},0)+(heritage&&e.heritage===heritage?5:0)})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,Math.max(1,Math.min(5,limit)));
}
export function assetFile(id,variant='preview') {
  const entry=library().find(e=>e.id===id);if(!entry)return null;
  if(entry.bundled){const relative=variant==='sprite'?entry.bundledSprite:entry.file;if(!relative)return null;const base=path.join(root,'assets'),file=path.resolve(base,relative);return file.startsWith(base+path.sep)&&fs.existsSync(file)?file:null;}
  const imported=path.join(DATA_DIR,'living-imports',entry.id+'--'+variant+'.png');if(entry.imported&&fs.existsSync(imported))return imported;
  if(variant==='sprite'&&entry.kind==='character'){
    const sprite=path.join(DATA_DIR,'living-library',entry.id+'.png');return fs.existsSync(sprite)?sprite:fs.existsSync(imported)?imported:null;
  }
  const relative=variant==='preview'?entry.preview || entry.file:entry.file;
  const filename=path.resolve(libraryRoot,relative);
  if(!filename.startsWith(libraryRoot+path.sep)||!fs.existsSync(filename))return null;
  return filename;
}
export function libraryDigest(){return createHash('sha256').update(JSON.stringify(library().map(e=>[e.id,e.sha256]))).digest('hex');}

export function libraryBundle(ids){return library().filter(e=>ids.has(e.id)).map(({imported,...e})=>({...e,bundleVariants:['full','preview',...(e.kind==='character'?['sprite']:[])].filter(v=>assetFile(e.id,v))}));}
export function copyLibraryBundle(entries,directory){fs.mkdirSync(directory,{recursive:true});for(const e of entries)for(const variant of e.bundleVariants){const source=assetFile(e.id,variant);if(source)fs.copyFileSync(source,path.join(directory,'lw-'+e.id+'--'+variant+'.png'));}}
export function restoreLibraryBundle(entries,directory){if(!directory)return;const target=path.join(DATA_DIR,'living-imports');fs.mkdirSync(target,{recursive:true});const manifest=path.join(target,'manifest.json'),previous=fs.existsSync(manifest)?JSON.parse(fs.readFileSync(manifest)).entries:[];const combined=new Map(previous.map(e=>[e.id,e]));for(const e of entries){if(!/^[a-zA-Z0-9_-]{1,160}$/.test(e.id))throw new Error('Invalid library ID in bundle');for(const v of e.bundleVariants || [])if(['full','preview','sprite'].includes(v)){const source=path.join(directory,'lw-'+e.id+'--'+v+'.png');if(fs.existsSync(source))fs.copyFileSync(source,path.join(target,e.id+'--'+v+'.png'));}combined.set(e.id,e);}fs.writeFileSync(manifest,JSON.stringify({entries:[...combined.values()]}));entriesCacheReset();}
function entriesCacheReset(){entries=undefined;}

function bundledLibrary(){const directory=path.join(root,'assets/locations'),backgrounds=fs.existsSync(directory)?fs.readdirSync(directory).filter(f=>/\.(png|jpg)$/.test(f)).map(file=>({id:'bundled-'+file.replace(/\.[^.]+$/,''),kind:'background',title:file.replace(/[_-]/g,' ').replace(/\.[^.]+$/,''),file:'locations/'+file,bundled:true,caption:{en:file.replace(/[_-]/g,' ').replace(/\.[^.]+$/,'')},tags:[]})):[];for(const [name,gender] of [['alice','female'],['bob','male']])backgrounds.push({id:'bundled-'+name,kind:'character',title:name,file:'characters/'+name+'_everyday.png',bundledSprite:'cutouts/'+name+'_everyday.png',bundled:true,age_range_years:[18,65],gender,heritage:'white',sfw:true,caption:{en:'adult '+gender+' casual everyday clothes'}});return backgrounds;}
