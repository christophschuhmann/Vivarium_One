import assert from 'node:assert/strict';
import {repairThoughtCoverage} from '../server/living/story-coverage.js';
const ids=['sim-A','sim-B'],events=[{id:'event-A',participants:['sim-A'],description:'A begins her work.',type:'arrival'},{id:'event-B',participants:['sim-B'],description:'B arrives at the bakery.',type:'arrival'}],people=ids.map(id=>({id,name:id,age:25,thought:'I want to do my work well.'}));
const a={simId:'sim-A',eventId:'event-A',text:'I hope my work goes smoothly.'},b={simId:'sim-B',eventId:'event-B',text:'I am ready for my shift at the bakery.'};
let calls=0,meters=0;const options={ids,events,people,parse:JSON.parse,onCall:()=>meters++};
const valid={story:'A normal morning.',thoughts:[a,b]};assert.strictEqual(await repairThoughtCoverage(valid,{...options,call:()=>{throw Error('No call needed');}}),valid);
// Captured failure shape: an event ID in the simId field and no eventId at all.
const malformed={story:'Preserve this story.',thoughts:[a,{simId:'event-B',text:b.text}]};
const repaired=await repairThoughtCoverage(malformed,{...options,call:async messages=>{calls++;const p=JSON.parse(messages[1].content);assert.equal(p.sims.length,1);assert.equal(p.sims[0].simId,'sim-B');assert.equal(p.sims[0].allowedEvents[0].eventId,'event-B');return {content:JSON.stringify({thoughts:[b]})};}});
assert.equal(calls,1);assert.equal(meters,1);assert.equal(repaired.story,malformed.story);assert(repaired.thoughts.includes(a));assert(repaired.thoughts.some(t=>t.eventId==='event-B'&&t.simId==='sim-B'));
for(const thought of [{...b,eventId:'event-A'},{...b,simId:'sim-A'},{...b,eventId:'made-up'},{...b,text:'x'}]){
 let attempts=0;await assert.rejects(()=>repairThoughtCoverage(malformed,{...options,call:async()=>{attempts++;return {content:JSON.stringify({thoughts:[thought]})};}}),e=>e.code==='STORY_PERSPECTIVE_INCOMPLETE'&&e.diagnostics.missingSimIds[0]==='sim-B');assert.equal(attempts,1);
}
await assert.rejects(()=>repairThoughtCoverage(malformed,{...options,assertSafe:()=>{throw Error('age safety validation');},call:async()=>({content:JSON.stringify({thoughts:[b]})})}),/age safety/);
console.log('PASS complete batches untouched; malformed event/Sim IDs repaired once; existing story preserved; fabricated/foreign/unwitnessed/short entries rejected; age safety retained');
