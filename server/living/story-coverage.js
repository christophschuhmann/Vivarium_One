// Repair only missing personal perspectives, once, against explicitly supplied
// witnessed events. Never infer an identity from malformed IDs or substitute a
// procedural thought while claiming it was narrated by the model.
export function validPersonalThought(thought, owned, events) {
  const event = events.get(thought?.eventId);
  return owned.has(thought?.simId) && (event?.participants.includes(thought.simId) || event?.witnesses?.includes(thought.simId))
    && typeof thought.text === 'string' && thought.text.trim().length >= 8;
}
export async function repairThoughtCoverage(output, { ids, events, people, call, parse, onCall = () => {}, assertSafe = () => {} }) {
  const byEvent = new Map(events.map(e => [e.id, e])), owned = new Set(ids);
  const initial = Array.isArray(output.thoughts) ? output.thoughts : [];
  const covered = new Set(initial.filter(t => validPersonalThought(t, owned, byEvent)).map(t => t.simId));
  const missing = ids.filter(id => !covered.has(id));
  if (!missing.length) return output;
  const sims = missing.map(id => {
    const p = people.find(p => p.id === id), witnessed = events.filter(e => e.participants.includes(id) || e.witnesses?.includes(id));
    const selected = [...new Map([...witnessed.filter(e => e.type === 'intervention').slice(-1), ...witnessed.slice(-3)].map(e => [e.id, e])).values()];
    return { simId: id, name: p.name, age: p.age, biography: p.biography?.slice(0, 800), needs: p.needs, thought: p.thought, currentDesire: p.currentDesire,
      emotions: p.emotions?.states?.map(e => ({ id: e.id, intensity: e.intensity })),
      allowedEvents: selected.map(e => ({ eventId: e.id, description: e.description.slice(0, 2000), observation: e.participants.includes(id) ? 'participant' : 'witness only; other people’s private motives are unknown' })) };
  });
  const response = await call([
    { role: 'system', content: 'Repair incomplete personal perspectives from a fictional life-simulation response. Return strict JSON {thoughts:[{simId,eventId,text,confidence}]}, exactly one entry for EVERY supplied Sim. Copy simId verbatim and copy eventId from that Sim’s allowedEvents. These fields are different IDs; never put an event ID in simId. Write one or two sentences of emotionally plausible first-person subjective interpretation in English, grounded in the supplied event. Preserve uncertainty: witnessing an event does not reveal private motives. Do not invent actions, change facts, generate sexual content, or sexualize minors. No tools, prose outside JSON, or other fields.' },
    { role: 'user', content: JSON.stringify({ sims }) },
  ]);
  onCall(response);
  const repaired = parse(response.content);assertSafe(repaired);
  const allowed = new Set(missing), suppliedEvents = new Map(sims.flatMap(s => s.allowedEvents.map(e => [s.simId + ':' + e.eventId, true])));
  const thoughts = (Array.isArray(repaired?.thoughts) ? repaired.thoughts : []).filter(t => validPersonalThought(t, allowed, byEvent) && suppliedEvents.has(t.simId + ':' + t.eventId));
  const remaining = missing.filter(id => !thoughts.some(t => t.simId === id));
  if (remaining.length) throw Object.assign(new Error(`The Storyteller still omitted a valid perspective for ${remaining.length} Sim(s) after one repair attempt. This simulation slice was not saved. Please retry or choose another language model.`), {
    code: 'STORY_PERSPECTIVE_INCOMPLETE', statusCode: 502, diagnostics: { missingSimIds: remaining, repairAttempts: 1 },
  });
  return { ...output, thoughts: [...initial, ...thoughts] };
}
