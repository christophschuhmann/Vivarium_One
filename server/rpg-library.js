import fs from 'node:fs';
import {db,pj,j} from './db.js';
import {getAsset,importAssetFile,assetPath} from './assets.js';
import {catalogSearch,catalogEntry,characterCandidates,catalogVariants,materializeAsset,neutralAsset} from './living/asset-catalog.js';
import {visualChoice} from './visual-choice.js';
function adopt(asset,user,world,kind){if(!asset||asset.user_id!==user.id||asset.world_id&&asset.world_id!==world.id||asset.kind!==kind)throw error('Choose one of your own uploaded images.');return asset.world_id?asset:importAssetFile({userId:user.id,worldId:world.id,kind,filePath:assetPath(asset),mime:asset.mime,meta:pj(asset.meta,{})});}
const error=message=>Object.assign(new Error(message),{statusCode:422,code:'LIBRARY_SELECTION_REQUIRED'});
const sex=p=>p.gender||(/^she\b|\bwoman\b|\bfemale\b/i.test(p.pronouns||p.appearance||'')?'female':/^he\b|\bman\b|\bmale\b/i.test(p.pronouns||p.appearance||'')?'male':undefined);
export function visualCandidates(kind,spec={},limit=5){
  const query=kind==='character'?[spec.appearance,spec.outfit].filter(Boolean).join(' '):[spec.name,spec.description].filter(Boolean).join(' ');
  const age=Number(spec.age),gender=sex(spec);
  if(kind==='background'){
    const text=query.toLowerCase(),fantasy=/fantasy|medieval|sorcer|wizard|castle|magic|dragon/.test(text),scifi=/spaceship|space station|science fiction|futuristic|cyberpunk/.test(text);
    const categories=[['bookshop|bookstore','bookshop bookstore'],['bedroom|guest room','bedroom guest room'],['reading room|library','library reading room'],['bathroom|washroom','bathroom washroom'],['street|road','street road'],['kitchen','kitchen'],['living room','living room'],['park|garden','park garden'],['beach|seashore','beach shore']];
    const category=categories.find(([re])=>new RegExp(re).test(text));
    const pool=[...catalogSearch(query,{kind,limit:50}),...(category?catalogSearch(category[1],{kind,limit:50}):[])].filter((a,i,all)=>all.findIndex(b=>b.id===a.id)===i);
    const ranked=pool.filter(a=>fantasy||scifi||!/^Fantasy|^Science fiction/i.test(a.style||'')).map(a=>{
      const caption=(a.caption.en+' '+a.style).toLowerCase();let rank=a.score||0;
      if(category)rank+=new RegExp(category[0]).test(caption)?12:-15;
      if(category?.[1]==='street road')rank+=/street_scenes|cities_streets|urban_outdoors/.test(a.metadata?.primary_class||'')?15:-15;
      if(fantasy)rank+=/fantasy|historical/i.test(a.style)?8:-8;
      else if(scifi)rank+=/science fiction/i.test(a.style)?8:-8;
      else rank+=/modern|contemporary/i.test(a.style)?3:0;
      if(/vermont|american|usa|united states/.test(text))rank+=/north american/.test(caption)?8:/scandinavian|japanese|mediterranean|african|south asian|andean/.test(caption)?-5:0;
      if(/autumn|fall/.test(text))rank+=/autumn|fall/.test(caption)?5:/snow|winter/.test(caption)?-8:0;
      return {...a,score:rank};
    }).sort((a,b)=>b.score-a.score);
    return ranked.slice(0,limit);
  }
  if(!Number.isFinite(age))return [];
  const close=gender?characterCandidates({age,gender,limit:50}):['female','male'].flatMap(g=>characterCandidates({age,gender:g,limit:25}));
  const ranked=catalogSearch(query,{kind,age,gender,emotion:'neutral',limit:50});
  return close.map(c=>({...c,score:ranked.find(r=>r.identityId===c.identityId)?.score||0})).sort((a,b)=>b.score-a.score).slice(0,limit);
}
async function ownedAsset(user,world,entry,variant,kind,ownerRef){
  const existing=db.prepare("SELECT * FROM assets WHERE user_id=? AND world_id=? AND kind=? AND json_extract(meta,'$.libraryId')=? ORDER BY created_at DESC LIMIT 1").get(user.id,world.id,kind,entry.id);
  if(existing&&fs.existsSync(assetPath(existing)))return existing;
  const file=await materializeAsset(entry.id,variant);if(!file)throw error('This library image could not be loaded. Choose another image.');
  return importAssetFile({userId:user.id,worldId:world.id,kind,ownerRef,prompt:entry.caption,filePath:file,mime:'image/png',meta:{libraryId:entry.id,identityId:entry.identity_id,expression:entry.emotion,source:{repo:entry.repo,revision:entry.revision},selection:'existing library image'}});
}
export async function libraryPortrait(user,world,spec){
  const choice=visualChoice(),row=spec.ownerRef?db.prepare('SELECT base_profile FROM characters WHERE id=? AND world_id=?').get(spec.ownerRef,world.id):null;
  const profile={...pj(row?.base_profile,{}),...spec};
  if(choice.uploadId){const original=getAsset(choice.uploadId),portrait=adopt(original,user,world,'portrait'),cutout=adopt(getAsset(pj(original.meta,{}).cutoutId),user,world,'cutout');const outfits=[{name:'everyday',portrait_asset_id:portrait.id,cutout_asset_id:cutout.id,emotion:'neutral'}];db.prepare('UPDATE assets SET meta=? WHERE id=?').run(j({...pj(portrait.meta,{}),outfits,cutoutId:cutout.id}),portrait.id);return {portrait,cutout,outfits};}
  const reference=spec.refAssetId?getAsset(spec.refAssetId):null;
  const referenceId=reference&&reference.user_id===user.id?pj(reference.meta,{}).libraryId:null;
  const id=choice.assetId||referenceId||visualCandidates('character',profile,1)[0]?.id;
  const entry=catalogEntry(neutralAsset(id));
  if(!entry||entry.kind!=='character')throw error('No matching character image is available. Choose one from the library, upload a file, or confirm generation.');
  const age=Number(profile.age);if(Number.isFinite(age)&&(age<entry.age_min||age>entry.age_max))throw error('This character template does not match the character’s age. Please choose an age-appropriate image.');
  const portrait=await ownedAsset(user,world,entry,'full','portrait',spec.ownerRef),cutout=await ownedAsset(user,world,entry,'sprite','cutout',spec.ownerRef);
  const outfits=[{name:spec.outfitName||'everyday',portrait_asset_id:portrait.id,cutout_asset_id:cutout.id,emotion:'neutral',libraryId:entry.id}];
  for(const variant of catalogVariants(entry.identity_id,entry.style).filter(e=>e.id!==entry.id&&['sad','annoyed','angry','afraid','joyful','grateful'].includes(e.emotion)).slice(0,6)){
    const p=await ownedAsset(user,world,variant,'full','portrait',spec.ownerRef),c=await ownedAsset(user,world,variant,'sprite','cutout',spec.ownerRef);
    outfits.push({name:'everyday · '+variant.emotion,portrait_asset_id:p.id,cutout_asset_id:c.id,emotion:variant.emotion,libraryId:variant.id});
  }
  db.prepare('UPDATE assets SET meta=? WHERE id=?').run(j({...pj(portrait.meta,{}),outfits,cutoutId:cutout.id}),portrait.id);
  return {portrait,cutout,outfits,source:'library'};
}
export async function libraryBackground(user,world,location){
  const choice=visualChoice();let bg;
  if(choice.uploadId){bg=adopt(getAsset(choice.uploadId),user,world,'background');}
  else{const entry=catalogEntry(choice.assetId||visualCandidates('background',location,1)[0]?.id);if(!entry||entry.kind!=='background')throw error('Choose a background from the library or upload a file.');bg=await ownedAsset(user,world,entry,'full','background',location.id);}
  if(location.id)db.prepare('UPDATE locations SET background_asset_id=? WHERE id=? AND world_id=?').run(bg.id,location.id,world.id);
  return bg;
}
