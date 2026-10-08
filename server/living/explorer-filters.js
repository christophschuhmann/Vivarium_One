// Read-only, world-scoped filtering. Every predicate runs before pagination.
// Paths and SQL expressions come only from this catalog; input values are bound.
import fs from 'node:fs';
import {httpErr} from '../auth.js';

const entries = object => Object.entries(object).map(([id,label])=>({id,label}));
const emotions = JSON.parse(fs.readFileSync(new URL('../../vendor/open-sims/living_world/data/emotion_taxonomy.json',import.meta.url))).emotions;
const excluded = new Set(['intoxication_altered_states_of_consciousness','pleasure_ecstasy','malevolence_malice']);
export const explorerCatalog = {
  maxRules:12,
  categories:[
    {id:'emotion',label:'Feelings',hint:'Intensity now, including secondary feelings. 0 means this feeling is absent.',fields:emotions.filter(e=>!excluded.has(e.id)).map(e=>({id:e.id,label:e.label}))},
    {id:'need',label:'Needs',hint:'Unmet need: 0 = satisfied, 100 = urgent. Social warmth and romantic affection are separate.',fields:entries({hunger:'Hunger',thirst:'Thirst',bladder:'Bladder',fatigue:'Rest',hygiene:'Hygiene',social:'Social warmth',fun:'Fun',comfort:'Comfort',romantic_affection:'Romantic affection'})},
    {id:'attribute',label:'Attributes',hint:'Current values, 0–100. Reputation reflects known evidence; popularity reflects warm, trusting contacts. Appearance applies to adults only.',fields:entries({appearance:'Attractiveness · adults',reputation:'Reputation',recognition:'Public recognition',popularity:'Popularity',ambition:'Ambition drive',prosociality:'Prosocial tendency',reasoning:'Reasoning',coordination:'Coordination',presence:'Presence',resolve:'Resolve',perception:'Perception',stamina:'Stamina',strength:'Strength',openness:'Openness',conscientiousness:'Conscientiousness',extraversion:'Extraversion',agreeableness:'Agreeableness',neuroticism:'Emotional sensitivity'})},
    {id:'skill',label:'Skills',hint:'Current proficiency, 0–100. Occupational skills and social skills use the same display scale here.',fields:entries({teaching:'Teaching',craft:'Craft & design',gardening:'Gardening',cooking:'Cooking',retail:'Retail',care:'Care',response:'Emergency response',administration:'Administration',analysis:'Analysis & technology',fitness:'Fitness',service:'Service',music:'Music',humor:'Humor',charm:'Making contact',empathy:'Empathy',persuasion:'Persuasion',teamwork:'Teamwork',resolve:'Setting boundaries'})},
    {id:'relationship',label:'Relationships',hint:'Partnership status and current social ties. Single can be combined with friendship or conflict. A romantic interest is not an established partnership.',fields:entries({single:'Single · no current partner',married:'Married',dating:'Partnered · not married',divorced:'Divorced · currently unpartnered',close_friend:'Has a close friend',conflict:'Has a tense or hostile relationship',romantic_interest:'Has a romantic interest'})},
    {id:'ambition',label:'Ambitions',hint:'Find a long-term goal by theme, words in its title and progress. These conditions must match the same goal; progress includes initial background.',fields:entries({any:'Any long-term ambition',career:'Career',learning:'Learning',hobby:'Interests & hobbies',care:'Caring for others',community:'Community',mastery:'Mastery & practice',create:'Creating something',stability:'A dependable life'})}
  ]
};
const catalog = new Map(explorerCatalog.categories.map(c=>[c.id,new Map(c.fields.map(f=>[f.id,f]))]));
const bad = message => {throw httpErr(400,'BAD_EXPLORER_FILTER',message);};
export function parseExplorerFilters(raw){
  if(raw===undefined||raw==='')return [];
  if(typeof raw!=='string'||raw.length>8192)bad('The search is too large. Use up to 12 filters.');
  let rules;try{rules=JSON.parse(raw);}catch{bad('The search filters could not be read.');}
  if(!Array.isArray(rules)||rules.length>explorerCatalog.maxRules)bad('Use up to 12 search filters.');
  return rules.map(r=>{
    if(!r||typeof r!=='object'||!catalog.get(r.category)?.has(r.field))bad('Choose a supported filter and field.');
    if(r.category==='relationship')return {category:r.category,field:r.field};
    const {min=0,max=100,text=''}=r;
    if(typeof min!=='number'||typeof max!=='number'||!Number.isFinite(min)||!Number.isFinite(max)||min<0||max>100||min>max)bad('Each range must run from a lower to a higher value between 0 and 100.');
    if(typeof text!=='string'||text.length>100)bad('Ambition search text must be at most 100 characters.');
    return {category:r.category,field:r.field,min,max,...(r.category==='ambition'?{text:text.trim()}:{})};
  });
}
const json = path => `json_extract(s.state,'$.${path}')`;
const score = path => `round(100*${json(path)})`;
const bounded = expr => `min(1,max(0,${expr}))`;
const partner = `EXISTS(SELECT 1 FROM lw_sims partner WHERE partner.world_id=s.world_id AND partner.id=json_extract(s.profile,'$.family.partner_id') AND json_extract(partner.profile,'$.family.partner_id')=s.id)`;
const married = `EXISTS(SELECT 1 FROM lw_sims partner WHERE partner.world_id=s.world_id AND partner.id=json_extract(s.profile,'$.family.partner_id') AND json_extract(partner.profile,'$.family.partner_id')=s.id AND (json_extract(s.profile,'$.family.relationship_status')='married' OR json_extract(partner.profile,'$.family.relationship_status')='married'))`;
const relationship = {
  single:`NOT ${partner}`,married,dating:`(${partner} AND NOT ${married})`,
  divorced:`(NOT ${partner} AND json_extract(s.profile,'$.family.relationship_status')='divorced')`,
  close_friend:`EXISTS(SELECT 1 FROM lw_relations r WHERE r.world_id=s.world_id AND r.from_id=s.id AND (json_extract(r.payload,'$.layers.friendship.status')='established' OR json_extract(r.payload,'$.closeness')>=.5) AND json_extract(r.payload,'$.trust')>=.45 AND coalesce(json_extract(r.payload,'$.tension'),0)<.5)`,
  conflict:`EXISTS(SELECT 1 FROM lw_relations r WHERE r.world_id=s.world_id AND r.from_id=s.id AND (json_extract(r.payload,'$.kind')='Enemy' OR json_extract(r.payload,'$.layers.rivalry.status')='hostile' OR json_extract(r.payload,'$.tension')>=.55))`,
  romantic_interest:`EXISTS(SELECT 1 FROM lw_relations r JOIN lw_sims other ON other.id=r.to_id AND other.world_id=s.world_id WHERE r.world_id=s.world_id AND r.from_id=s.id AND json_extract(r.payload,'$.attraction')>=.35 AND coalesce(json_extract(r.payload,'$.layers.romance.status'),'none')!='ended' AND ((s.age>=18 AND other.age>=18) OR (s.age BETWEEN 14 AND 17 AND other.age BETWEEN 14 AND 17 AND abs(s.age-other.age)<=1)))`
};
const socialKeys = new Set(['appearance','ambition','prosociality']);
const bigFive = new Set(['openness','conscientiousness','extraversion','agreeableness','neuroticism']);
const socialSkills = new Set(['humor','charm','empathy','persuasion','teamwork','resolve']);

export function compileExplorerFilters(raw,worldId){
  const rules=parseExplorerFilters(raw),where=[],args=[],selections=[],selectionArgs=[];
  let cte='',joins='',prefixArgs=[];
  if(rules.some(r=>r.category==='attribute'&&['reputation','recognition','popularity'].includes(r.field))){
    // Aggregate once for the whole world, rather than querying every resident's
    // claims/contacts separately. Same evidence policy as socialAttributes().
    cte=`WITH explorer_claims AS (SELECT json_extract(e.payload,'$.subjectId') subject,
      sum(CASE WHEN json_extract(e.payload,'$.dimension')='helpfulness' THEN json_extract(e.payload,'$.value')*json_extract(e.payload,'$.confidence')*.4 ELSE 0 END) helpful,
      sum(CASE WHEN json_extract(e.payload,'$.dimension')='reliability' THEN json_extract(e.payload,'$.value')*json_extract(e.payload,'$.confidence')*.4 ELSE 0 END) reliable,
      sum(CASE WHEN json_extract(e.payload,'$.public') AND json_extract(e.payload,'$.value')>0 THEN 1 ELSE 0 END)*.06 recognition
      FROM lw_economy_entities e JOIN lw_worlds w ON w.world_id=e.world_id WHERE e.world_id=? AND e.kind='claim' AND json_extract(e.payload,'$.expiresAt')>w.seconds AND NOT coalesce(json_extract(e.payload,'$.retracted'),0) AND (json_extract(e.payload,'$.public') OR EXISTS(SELECT 1 FROM json_each(e.payload,'$.audience') WHERE value=json_extract(e.payload,'$.subjectId'))) GROUP BY subject),
      explorer_contacts AS (SELECT to_id,count(*) known,sum(CASE WHEN json_extract(payload,'$.closeness')>=.5 AND json_extract(payload,'$.trust')>=.45 AND coalesce(json_extract(payload,'$.tension'),0)<.5 THEN 1 ELSE 0 END) liked FROM lw_relations WHERE world_id=? GROUP BY to_id) `;
    prefixArgs=[worldId,worldId];joins=' LEFT JOIN explorer_claims ec ON ec.subject=s.id LEFT JOIN explorer_contacts et ON et.to_id=s.id';
  }
  const expressions={
    reputation:`round(50*(${bounded('.5+coalesce(ec.helpful,0)')}+${bounded('.5+coalesce(ec.reliable,0)')}))`,
    recognition:'round(100*min(1,coalesce(ec.recognition,0)))',popularity:'round(100.0*et.liked/nullif(et.known,0))'
  };
  for(const [i,r] of rules.entries()){
    let expr,params=[];
    if(r.category==='emotion'){
      expr=`round(100*coalesce((SELECT max(json_extract(e.value,'$.intensity')) FROM json_each(s.state,'$.affect.states') e WHERE json_extract(e.value,'$.id')=? AND (json_extract(e.value,'$.expires_at') IS NULL OR json_extract(e.value,'$.expires_at')>(SELECT seconds FROM lw_worlds WHERE world_id=s.world_id))),0))`;params=[r.field];
      if(r.field==='sexual_lust')where.push('s.age>=18');
    }else if(r.category==='need'){
      // Preserve the engine's age safety caps even when reading a legacy save.
      expr=r.field==='romantic_affection'?`round(100*CASE WHEN s.age<14 THEN 0 WHEN s.age<18 THEN min(.35,${json('needs.romantic_affection')}) ELSE ${json('needs.romantic_affection')} END)`:score('needs.'+r.field);
    }else if(r.category==='attribute'){
      expr=expressions[r.field]||(socialKeys.has(r.field)?score('socialDynamics.'+r.field):bigFive.has(r.field)?score('psychology.big_five.'+r.field):`round(${json('aptitudes.attributes.'+r.field)})`);
      if(r.field==='appearance')where.push('s.age>=18');
    }else if(r.category==='skill')expr=socialSkills.has(r.field)?`round(${json('aptitudes.social_skills.'+r.field)})`:score('skills.'+r.field);
    else if(r.category==='relationship')expr=relationship[r.field];
    else {
      const conditions=[],goalArgs=[];
      if(r.field!=='any'){conditions.push("json_extract(a.value,'$.kind')=?");goalArgs.push(r.field);}
      if(r.text){conditions.push("instr(lower(coalesce(json_extract(a.value,'$.title'),'')||' '||coalesce(json_extract(a.value,'$.title_de'),'')),lower(?))>0");goalArgs.push(r.text);}
      conditions.push("round(100*json_extract(a.value,'$.progress')) BETWEEN ? AND ?");goalArgs.push(r.min,r.max);
      // Select the same matching goal used by the predicate, never a different
      // ambition that happens to have the requested progress.
      expr=`(SELECT json_object('title',coalesce(json_extract(a.value,'$.title_de'),json_extract(a.value,'$.title'),json_extract(a.value,'$.kind')),'value',round(100*json_extract(a.value,'$.progress'))) FROM json_each(s.state,'$.psychology.ambitions') a WHERE ${conditions.join(' AND ')} ORDER BY json_extract(a.value,'$.progress') DESC LIMIT 1)`;params=goalArgs;
    }
    where.push(r.category==='relationship'?`(${expr})`:r.category==='ambition'?`${expr} IS NOT NULL`:`${expr} BETWEEN ? AND ?`);
    args.push(...params,...(['relationship','ambition'].includes(r.category)?[]:[r.min,r.max]));
    selections.push(`${expr} AS explorer_${i}`);selectionArgs.push(...params);
  }
  return {rules,where,args,cte,joins,prefixArgs,selections,selectionArgs};
}
export function explorerMatches(row,rules){
  return rules.map((r,i)=>{
    const raw=row['explorer_'+i];delete row['explorer_'+i];
    const goal=r.category==='ambition'&&raw?JSON.parse(raw):null;
    return {category:r.category,field:r.field,label:catalog.get(r.category).get(r.field).label,value:r.category==='relationship'?null:goal?goal.value:raw,...(goal?{title:goal.title}:{}),unit:r.category==='need'?'urgency':r.category==='emotion'?'intensity':r.category==='ambition'?'progress':'score'};
  });
}
