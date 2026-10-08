// An accepted exchange means participation, not necessarily warmth or agreement.
// Used by needs, affect and PERMA so the same encounter cannot reward and hurt
// the same person through contradictory classifications.
export function socialImpact(event,simId){
 const f=event.facts,c=f.category;
 if(f.outcome!=='accepted')return {warmth:0,feeling:null,quality:'declined'};
 const response=f.responseStyle;
 if(response&&event.participants?.[0]===simId&&response.style.endsWith('destructive'))
   return {warmth:-.025,feeling:'disappointment',quality:'hurt'};
 if(['argue','provoke','undermine','gossip'].includes(c))return {warmth:-.035,feeling:'anger',quality:'conflict'};
 if(['set_boundary','debate','challenge'].includes(c))return {warmth:0,feeling:'contemplation',quality:'mixed'};
 if(['reconcile','apologize'].includes(c))return {warmth:.04,feeling:'relief',quality:'repair'};
 return {warmth:['offer_help','comfort','check_in','confide','deep_talk'].includes(c)?.12:c==='greet'?.025:.07,feeling:'affection',quality:'warm'};
}
