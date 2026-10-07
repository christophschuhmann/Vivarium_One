// Player-facing summaries. Reputation is evidence-based; popularity describes
// known relationships, not a person's worth or access to private bank balances.
import {db} from './schema.js';
const clamp=n=>Math.max(0,Math.min(1,n));
export function socialAttributes(p,reputation=null){
 if(!reputation){
  // Read the same currently known claims as the detailed view; a once-daily
  // simulation cache must not make the Mind panel lag behind a new encounter.
  const claims=db.prepare("SELECT e.payload FROM lw_economy_entities e JOIN lw_worlds w ON w.world_id=e.world_id WHERE e.world_id=? AND e.kind='claim' AND json_extract(e.payload,'$.subjectId')=? AND json_extract(e.payload,'$.expiresAt')>w.seconds AND NOT coalesce(json_extract(e.payload,'$.retracted'),0) AND (json_extract(e.payload,'$.public') OR EXISTS(SELECT 1 FROM json_each(e.payload,'$.audience') WHERE value=?)) ORDER BY e.rowid").all(p.world_id,p.id,p.id).map(x=>JSON.parse(x.payload));
  const value=dimension=>clamp(.5+claims.filter(c=>c.dimension===dimension).reduce((n,c)=>n+c.value*c.confidence*.4,0));
  reputation={helpfulness:value('helpfulness'),reliability:value('reliability'),recognition:Math.min(1,claims.filter(c=>c.public&&c.value>0).length*.06),sources:claims.slice(-12)};
 }
 const incoming=db.prepare("SELECT count(*) n,sum(CASE WHEN json_extract(payload,'$.closeness')>=.5 AND json_extract(payload,'$.trust')>=.45 AND coalesce(json_extract(payload,'$.tension'),0)<.5 THEN 1 ELSE 0 END) liked FROM lw_relations WHERE world_id=? AND to_id=?").get(p.world_id,p.id);
 return {appearance:p.age>=18?p.state.socialDynamics?.appearance??null:null,
  reputation:clamp(((reputation.helpfulness??.5)+(reputation.reliability??.5))/2),
  recognition:reputation.recognition||0,popularity:incoming.n?(incoming.liked||0)/incoming.n:null,
  likedBy:incoming.liked||0,knownBy:incoming.n,evidenceCount:reputation.sources?.length||0,
  ambition:p.state.socialDynamics?.ambition??.5,prosociality:p.state.socialDynamics?.prosociality??.5,
  note:'Popularity is the share of known contacts with a warm, trusting relationship. Reputation starts at 50 without evidence. Recognition grows through public reports of actual deeds; it is separate from wealth.'};
}
