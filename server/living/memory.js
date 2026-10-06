import {db} from './schema.js';
const columns='e.id,substr(e.description,1,1000) description,substr(j.interpretation,1,600) interpretation,j.channel,j.observed_at,j.confidence';
export function recall(simId,query){
 const recent=db.prepare('SELECT '+columns+' FROM lw_journal j JOIN lw_events e ON e.id=j.event_id WHERE j.sim_id=? ORDER BY j.observed_at DESC,j.rowid DESC LIMIT 2').all(simId);
 const terms=[...new Set(String(query).toLowerCase().match(/[\p{L}]{4,}/gu) || [])].slice(0,8);if(!terms.length)return recent;
 const related=db.prepare('SELECT '+columns+' FROM lw_memory m JOIN lw_journal j ON j.rowid=m.rowid JOIN lw_events e ON e.id=j.event_id WHERE lw_memory MATCH ? AND j.sim_id=? ORDER BY bm25(lw_memory),j.observed_at DESC LIMIT 3').all(terms.map(t=>'"'+t+'"').join(' OR '),simId);
 return [...new Map([...recent,...related].map(e=>[e.id,e])).values()];
}
