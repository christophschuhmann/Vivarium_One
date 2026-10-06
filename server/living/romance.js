import fs from 'node:fs';
import {rng} from './random.js';
export const ROMANCE_POLICY=JSON.parse(fs.readFileSync(new URL('../../config/living_social_policy.json',import.meta.url)));
const policy=ROMANCE_POLICY.romantic_need;
export function romanticCap(age){return !Number.isFinite(age)||age<policy.teen_min_age?0:age<policy.adult_min_age?policy.teen_cap:1;}
// HARD AGE RULE: under 14 always zero; ages 14–17 never exceed 0.35.
// A need value cannot authorize an interaction, consent, or adult/minor romance.
// Teen dates/talk are a separate nonsexual category: both 14–17, age gap <=1.
export function normalizeRomance(p,{seed=73}={}){
 const needs=p.state.needs,cap=romanticCap(p.age);
 const value=Number.isFinite(needs.romantic_affection)?needs.romantic_affection:cap?(.08+rng(seed+':romantic-need:'+(p.profile?.seed_key||p.seed_key||p.id))()*.16):0;
 needs.romantic_affection=Math.max(0,Math.min(cap,value));
 if(p.age<18&&p.state.affect?.states){
   p.state.affect.states=p.state.affect.states.filter(e=>e.id!=='sexual_lust'&&(p.age>=14||e.id!=='infatuation'));
   for(const e of p.state.affect.states)if(e.id==='infatuation'){e.intensity=Math.min(policy.teen_cap,e.intensity);for(const component of e.components||[])component.intensity=Math.min(policy.teen_cap,component.intensity);}
   if(!p.state.affect.states.some(e=>e.id===p.state.affect.primary)){p.state.affect.primary=p.state.affect.states[0]?.id||null;p.state.mood=p.state.affect.states[0]?.label_de||'ruhig';}
 }
 return needs.romantic_affection;
}
export function growRomanticNeed(p){normalizeRomance(p);p.state.needs.romantic_affection=Math.min(romanticCap(p.age),p.state.needs.romantic_affection+(p.age>=18?.00045:p.age>=14?.0001:0));}
export function romanticContext(p){return {ageBand:p.age<14?'child':p.age<18?'teen':'adult',needCap:romanticCap(p.age),sexualInteractionsAllowed:p.age>=18,teenRomance:p.age>=14&&p.age<18?{allowedCategories:ROMANCE_POLICY.teen_categories,maxAgeGap:1,nonsexualOnly:true}:null,adultDesireThreshold:policy.adult_desire_threshold,adultIntimacyThreshold:policy.adult_intimacy_threshold};}
export const ROMANCE_INSTRUCTIONS='Social warmth and romantic affection are separate. Under 14 romantic affection is always zero and no romance is allowed. Ages 14–17 may ONLY have innocent teen dates or romantic conversation with another 14–17-year-old no more than one year apart. NEVER depict, suggest, or simulate sexual acts, erotic thoughts, desire or sexualized descriptions involving anyone under 18; NEVER pair a minor romantically with an adult. Adult desire and private intimacy are 18+ only, unrelated, explicitly consensual, without minor witnesses; describe private adult intimacy non-explicitly. A need, attraction or successful check never grants consent.';
// Defense in depth for generated prose. Structural age/consent gates in the
// worker remain authoritative; forbidden text is rejected before persistence.
export function assertMinorSafeText(people,text){
 if(text&&typeof text==='object'){
   const prose=[];const collect=(value,key)=>{if(typeof value==='string'&&['reply','thought','story','text','reason'].includes(key))prose.push(value);else if(value&&typeof value==='object')for(const [k,v] of Object.entries(value))collect(v,k);};collect(text,'');text=prose.join('\n');
 }
 if(people.some(p=>p.age<18)&&/\b(sex(?:uell\w*|ual\w*|uelle\w*|uality|ualisiert\w*)?|erotik\w*|erotisch\w*|erotic\w*|begehren|geschlechtsverkehr|orgasmus\w*|orgasm\w*|porn\w*|masturb\w*|sexual_lust)\b/i.test(text))throw Object.assign(new Error('Die Modellantwort überschreitet die altersgerechten Grenzen. Der Schritt wurde nicht gespeichert.'),{statusCode:502,code:'AGE_BOUNDARY'});
}

export function normalizeImportedRomance(db,worldId){
 const people=new Map();
 for(const row of db.prepare('SELECT id,age,profile,state,biography FROM lw_sims WHERE world_id=?').all(worldId)){
   const p={...row,profile:JSON.parse(row.profile),state:JSON.parse(row.state)};normalizeRomance(p);
   assertMinorSafeText([p],{reply:p.biography,thought:p.state.thought,text:p.state.dialogue});people.set(p.id,p);
   db.prepare('UPDATE lw_sims SET state=? WHERE id=?').run(JSON.stringify(p.state),p.id);
 }
 for(const p of people.values()){
   const partnerId=p.profile.family?.partner_id;if(!partnerId)continue;const other=people.get(partnerId);
   if(!other)throw new Error('Import enthält eine Partnerschaft ohne passende Person in dieser Welt.');
   if((p.age<18||other.age<18)&&!(p.age>=14&&p.age<18&&other.age>=14&&other.age<18&&Math.abs(p.age-other.age)<=1))throw new Error('Import enthält eine unzulässige Alterskombination für eine Partnerschaft.');
 }
 // A stored romance layer is also subject to age rules, even when no partner
 // ID or recent social event exists in the imported snapshot.
 for(const row of db.prepare('SELECT from_id,to_id,payload FROM lw_relations WHERE world_id=?').all(worldId)){
   const a=people.get(row.from_id),b=people.get(row.to_id),r=JSON.parse(row.payload),romance=r.layers?.romance;
   if(!a||!b)throw new Error('Import enthält eine Beziehung ohne passende Personen in dieser Welt.');
   if((a.age<18||b.age<18)&&romance&&(romance.score>0||!['none','unknown',null,undefined].includes(romance.status))){
     if(!(a.age>=14&&a.age<18&&b.age>=14&&b.age<18&&Math.abs(a.age-b.age)<=1))throw new Error('Import enthält eine unzulässige Alterskombination in einer Romantikbeziehung.');
     romance.score=Math.max(0,Math.min(policy.teen_cap,Number(romance.score)||0));db.prepare('UPDATE lw_relations SET payload=? WHERE world_id=? AND from_id=? AND to_id=?').run(JSON.stringify(r),worldId,row.from_id,row.to_id);
   }
 }
 // Imported snapshots cannot bypass age gates by preserving already forbidden
 // social categories. This runs inside the import transaction; rejection rolls
 // the new world back rather than altering the imported factual history.
 for(const e of db.prepare("SELECT participants,facts,description FROM lw_events WHERE world_id=? AND type='social'").iterate(worldId)){
   const participants=JSON.parse(e.participants).map(id=>people.get(id)).filter(Boolean),f=JSON.parse(e.facts),minor=participants.some(p=>p.age<18);
   if(minor&&['flirt','ask_date','express_affection','adult_private_intimacy'].includes(f.category))throw new Error('Import enthält eine Erwachsenen-Romantikkategorie mit Minderjährigen.');
   if(ROMANCE_POLICY.teen_categories.includes(f.category)&&(participants.length!==2||participants.some(p=>p.age<14||p.age>=18)||Math.abs(participants[0].age-participants[1].age)>1))throw new Error('Import enthält eine unzulässige Alterskombination für Jugendromantik.');
   assertMinorSafeText(participants,e.description);
 }
}
