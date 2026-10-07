// First-person explanations use ONLY my state, known roles and my recorded
// encounter. Never inspect another Sim's thoughts, needs, finances or intentions.
export const SOCIAL_ACTION_LABELS = {
  greet: 'Greeting', small_talk: 'Everyday conversation', share_interest: 'Conversation about shared interests',
  offer_help: 'Offer of support', ask_help: 'Request for help', ask_advice: 'Request for advice',
  tell_joke: 'Joke', compliment: 'Compliment', apologize: 'Apology', check_in: 'Checking in',
  confide: 'Attempt at a confidential conversation', invite_activity: 'Invitation to do something together',
  celebrate: 'Attempt to share a happy moment', play_together: 'Suggestion to play together', coordinate_work: 'Work coordination',
  set_boundary: 'Conversation about a personal boundary', gossip: 'Sharing unverified rumors',
  reconcile: 'Attempt to reconcile', comfort: 'Offer of comfort', deep_talk: 'Personal conversation',
  argue: 'Disagreement over different expectations', debate: 'Discussion of differing opinions',
  teen_romantic_talk: 'Gentle conversation about an age-appropriate crush', teen_date: 'Harmless, age-appropriate date',
  adult_private_intimacy: 'Wish for a private, affectionate moment between adults', flirt: 'Gentle flirting',
  ask_date: 'Invitation to a date', express_affection: 'Expression of affection', phone_call: 'Phone call',
  ask_favor: 'Request for a favor', collaborate_project: 'Conversation about a shared idea',
  share_news: 'Sharing news', make_plans: 'Making plans together', invite_to_dinner: 'Invitation to dinner',
  tell_story: 'Storytelling', tease: 'Playful teasing', challenge: 'Suggestion of a friendly contest',
  persuade: 'Attempt to persuade', provoke: 'Provocative remark', undermine: 'Criticism of shared work',
};
const topicLabels = { family: 'Family & home life', school: 'Learning & school life', work: 'Work & collaboration', leisure: 'Leisure & social encounters', negotiation: 'Wishes & agreements', romance: 'Closeness & personal boundaries', public: 'Public encounter' };
const romantic = new Set(['flirt','ask_date','express_affection','teen_date','teen_romantic_talk','adult_private_intimacy']);

// Store small, factual context rather than a growing prose model at each tick.
export function encounterMemory(event, context, witness = false) {
  return {
    category: event.facts?.category, outcome: event.facts?.outcome,
    initiatorId: event.participants?.[0] || null, witness,
    remote: !!event.facts?.remote, audience: context.publicAudience || 0,
    context: { ...context },
  };
}
export function socialEvidenceLabel(source) {
  const [category, outcome] = (source.observed || '').split(' ');
  return `Contact: ${SOCIAL_ACTION_LABELS[category] || 'Recorded encounter'} · ${outcome === 'accepted' ? 'Contact accepted' : outcome === 'declined' ? 'Contact declined' : 'Outcome not recorded in detail'}`;
}
export function socialPerspective(p, subject, context, probability, memory = {}, sources = []) {
  const name = subject.name, category = memory.category, declined = memory.outcome === 'declined';
  const witness = !!memory.witness, ownBid = memory.initiatorId === p.id;
  const hasDirection = !!memory.initiatorId;
  const latest = sources.at(-1);
  const observation = sources.length
    ? `${socialEvidenceLabel(latest)}. ${witness ? 'I only witnessed part of this encounter; I was not one of the people involved.' : hasDirection ? ownBid ? 'I initiated the contact.' : `${name} initiated the contact.` : 'This older note does not record who initiated the contact.'}${memory.remote ? ' We spoke by phone, so I could not see facial expressions or what was happening in the room.' : ''}`
    : 'There is no personal encounter recorded as evidence yet. These expectations are based on the relationship I know and the situation.';
  let variants = {
    support: `${name} may be seeking connection or offering support; a friendly exchange could be a clue, but it is not proof.`,
    obligation: `${name} may want to clarify an appointment, a task, or how responsibilities are shared.`,
    criticism: `${name} may be unhappy about something specific. That does not mean they reject me as a person.`,
    romance: `${name} may want gentle, voluntary closeness. Friendliness alone says little about that and is not consent.`,
    unknown: `${name} may have an entirely different reason. I do not have enough information to understand it yet.`,
  };
  let nextStep = 'I could ask, “What matters to you right now? Would you like to talk, or work something out together?”';
  if (context.isChild) {
    variants.support = `${name} may want to listen, spend time with me, or help me try something on my own. An outing would be nice, but it has not been agreed to.`;
    variants.obligation = `${name} may want to talk about our schedule or a manageable task. I can ask what is expected and where I need help.`;
    nextStep = 'I could say, “I’d like to spend time with you. Are we talking about a plan, or something I need to do?”';
  } else if (context.isParent) {
    variants.support = `${name} may want reassurance, attention, or support while still wanting to do something independently.`;
    variants.obligation = `${name} may want more say or a clear, fair agreement. Independence and closeness do not have to conflict.`;
    nextStep = 'I could ask, “What would you like to decide for yourself, and where would you like my help?”';
  } else if (context.partner) {
    variants.support = `${name} may want time together or someone to listen openly. An everyday arrangement may also be a request for some relief.`;
    variants.obligation = `${name} may want to coordinate tasks, appointments, or shared expenses. I do not yet know what arrangement would feel fair to both of us.`;
    nextStep = 'I could ask, “Do you need closeness, a little relief, or a concrete plan right now? What would help today?”';
  } else if (context.topic === 'work') {
    variants.support = `${name} may appreciate my contribution or want to help with a difficult step at work.`;
    variants.obligation = context.explicitManager
      ? `${name} may want to clarify an assignment or priority as a manager I know. That does not mean a reprimand or promotion is coming.`
      : `${name} may want to coordinate a shared work task. A coworker’s request is not automatically an order.`;
    variants.criticism = `${name} may want to give feedback on one part of the work; this guess says little about my overall performance.`;
    nextStep = 'I could ask, “Which task comes first, what will you take on, and where do you need my help?”';
  } else if (context.topic === 'school') {
    variants.support = `${name} may want to solve a question together, include me in a game, or spend time with me after school.`;
    variants.obligation = `${name} may want to clarify a school assignment or group arrangement. I can ask for a fair share of the work.`;
    nextStep = 'I could ask, “Should we work on the assignment together, or would you rather tell me what happened first?”';
  } else if (context.topic === 'negotiation') {
    nextStep = 'I could ask, “What would feel fair to you? I’ll also explain what I can do and where my limits are.”';
  }
  // Direction matters: my invitation/help request is NOT proof of their wish.
  if (ownBid && ['ask_help','ask_advice','ask_favor'].includes(category)) {
    variants.support = `${name} may be willing to respond to my request. Agreeing to talk does not mean the help has already been provided.`;
    variants.obligation = `${name} may first want to discuss the effort, timing, and their own limits with me.`;
    nextStep = 'I could say exactly what help I need and ask, “Which part can you manage, and when?”';
  } else if (ownBid && ['offer_help','comfort'].includes(category)) {
    variants.support = `${name} may understand my offer as a gesture of care. Only they can say whether the support is right for them.`;
    nextStep = 'I could ask, “Would you like me to listen or do something specific? You can also say no to my offer.”';
  } else if (!ownBid && hasDirection && category === 'ask_help') {
    variants.support = `${name} may trust me enough to ask for help. The request’s full scope and reason are not yet clear.`;
    nextStep = 'I could ask, “What exactly do you need? I’ll be honest about what I can take on.”';
  }
  // Nuance depends on the actual kind of exchange, not on gender, appearance,
  // income class or an invented hidden motive. Acceptance is scoped to this bid.
  if (category === 'apologize' || category === 'reconcile') {
    variants.support = `${name} may want to address the strain between us. Talking is a start, but trust and forgiveness still take time.`;
    variants.obligation = `${name} may want something specific to change the next time this happens, rather than only kind words.`;
    nextStep = 'I could explain what hurt me, acknowledge my part, and ask, “What can we do differently next time?”';
  } else if (category === 'set_boundary') {
    variants.support = `${name} may want respectful contact where the boundary they stated is taken seriously.`;
    variants.obligation = `${name} may want to clarify what is and is not possible today. A boundary does not prove a lack of affection.`;
    nextStep = 'I could restate the boundary I heard and explain what I can do, without trying to negotiate it away.';
  } else if (category === 'confide' || category === 'deep_talk') {
    variants.support = `${name} may want understanding and careful listening. A personal conversation is not permission to share what was said.`;
    nextStep = 'I could ask, “Would you like me just to listen or help look for a solution? What would you like to keep between us?”';
  } else if (category === 'gossip') {
    variants.support = `${name} may be seeking connection through sharing stories. I do not want to build a sense of belonging at an absent person’s expense.`;
    variants.criticism = `${name} may be expressing frustration or telling a one-sided story. That does not make the claim true.`;
    nextStep = 'I could ask, “Did you experience that yourself, or only hear about it?” and avoid repeating unverified claims as facts.';
  } else if (category === 'tease' || category === 'tell_joke') {
    variants.support = `${name} may be looking for playful familiarity. Agreeing to talk does not tell me whether the joke felt good to both of us.`;
    variants.criticism = `${name} may have understood the remark differently than I intended. I can check its impact without assuming hurt or amusement.`;
    nextStep = 'I could ask kindly, “Was that funny for you too, or did I go too far?” and take any boundary seriously.';
  } else if (['invite_activity','invite_to_dinner','make_plans'].includes(category)) {
    variants.support = `${name} may welcome spending time together. That does not imply romantic interest or mean a meeting has already happened.`;
    variants.obligation = `${name} may want to clarify timing, effort, or cost. A suitable plan needs to work for both of us.`;
    nextStep = 'I could suggest a specific, affordable option and ask, “Does that work for you, or would another time be better?”';
  } else if (category === 'debate') {
    variants.support = `${name} may want to engage seriously with my point of view. Disagreement does not rule out respect.`;
    variants.criticism = `${name} may disagree with an argument without rejecting me as a person.`;
    nextStep = 'I could restate the other person’s strongest point in my own words and ask whether I understood it correctly.';
  } else if (['argue','provoke','undermine'].includes(category)) {
    variants.criticism = `${name} may feel overlooked, treated unfairly, or misunderstood in this situation. I cannot know which, if any, is the real reason.`;
    nextStep = 'I could first clarify the specific disagreement, describe my feelings without blame, and suggest a pause if we are both too tense.';
  } else if (category === 'share_interest' || category === 'collaborate_project') {
    variants.support = `${name} may enjoy sharing ideas with me. A shared interest does not tell us how much time either of us wants to spend on it.`;
    nextStep = 'I could ask, “What appeals to you most about it? Would you like to try something small together first?”';
  }
  if (witness) {
    variants.support = 'The people involved may be looking for support or a friendly exchange. That does not mean they want contact with me.';
    variants.obligation = 'The people involved may be coordinating something. That does not tell me whether a task involves me.';
    variants.criticism = 'The people involved may disagree. I do not know what started it or the full history.';
    variants.unknown = 'There may be another reason that I could not identify as an observer.';
  }
  const agePair = (p.age >= 18 && context.otherAge >= 18) || (p.age >= 14 && p.age < 18 && context.otherAge >= 14 && context.otherAge < 18 && Math.abs(p.age-context.otherAge)<=1);
  const kin = context.role?.some(r => /mutter|vater|schwester|bruder|tochter|sohn|cous|enkel|tante|onkel|groß|oma|opa|mother|father|sister|brother|daughter|son|grandchild|granddaughter|grandson|aunt|uncle|grandmother|grandfather|grandma|grandpa|niece|nephew/iu.test(r));
  // Under 14: no romance. 14–17: only mild nonsexual romance with <=1 year gap.
  // No sexual scenarios or adult/minor romance are generated by this prose layer.
  const alternatives = Object.entries(probability || {}).filter(([key,n]) => n > .01 && (key !== 'romance' || (agePair && !kin && !witness))).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([kind,n])=>({kind,probability:n,text:variants[kind] || variants.unknown}));
  let interpretation = alternatives[0]?.text || variants.unknown;
  const needs = p.state.needs || {}, selfLens = [];
  if (needs.hunger > .7) selfLens.push('Hunger makes it harder for me to be patient. I may need a short break before I read a remark as an attack.');
  if (needs.fatigue > .7) selfLens.push('Tiredness can make neutral words sound harsher to me. My impression is not evidence of bad intentions.');
  const affect = p.state.affect?.states || [];
  if (affect.some(e => ['fear','distress','anger'].includes(e.id) && e.intensity > .55)) selfLens.push('I feel tense right now and am more alert to possible rejection. Asking a question may help separate my feelings from what I observed.');
  if ((p.state.psychology?.big_five?.neuroticism || 0) > .65 && !selfLens.length) selfLens.push('I worry about misunderstandings easily. I want to check my first interpretation before reacting to it.');
  if (p.state.economy?.financialAppraisal?.security==='shortfall' || p.state.economy?.threats?.some(t => t.kind === 'cash_shortfall' && t.probability > .5)) selfLens.push('My worries about money can make a request feel like one more burden. I want to explain what I can manage instead of assuming bad intentions.');
  if ((context.tension || 0) > .35) selfLens.push('The strain I know about shapes my expectations. An earlier difficulty does not determine how this conversation will go.');
  const unknowns = [ 'I do not have direct access to the other person’s actual thoughts or intentions.', 'Agreeing to talk is neither a completed task nor a lasting commitment.' ];
  if (category === 'gossip') unknowns.push('Rumors are not verified facts; I should check their source before repeating them.');
  if (witness) unknowns.push('I do not know the full conversation or the people’s private history.');
  let audience = memory.audience > 0 ? 'Others were present. I can discuss personal matters in a calm, voluntary conversation; I do not know how the listeners interpreted what was said.' : null;
  if (memory.remote) audience = 'On a phone call, I can ask whether the other person has privacy instead of guessing what is happening in their room.';
  if (declined) {
    interpretation = 'This request for contact was declined. This specific boundary is clear; the reason and their openness to different contact later remain unknown.';
    nextStep = romantic.has(category) ? 'I respect the no and will not pressure them for closeness. No one has to explain a rejection.' : 'I will give them space and accept the answer. If an essential task remains, I can look for another solution or support later.';
  }
  if (witness) { interpretation = 'I observed an encounter. My interpretations concern what I could see, not an offer or interest directed at me.'; nextStep = 'I can wait or ask whether support is wanted without intruding on a private conversation.'; }
  const myWish = p.profile.social?.wish || p.state.current_desire || 'I want a clear and respectful exchange.';
  let metabelief = null;
  if (!witness && sources.length) {
    metabelief = ownBid
      ? `Because I initiated the contact, ${name} may have noticed that I wanted ${['ask_help','ask_advice','ask_favor'].includes(category) ? 'support' : ['offer_help','comfort'].includes(category) ? 'to help' : romantic.has(category) ? 'voluntary closeness' : 'contact or coordination'}. I do not know whether that is how it came across; I could state what I want more clearly.`
      : hasDirection
        ? `${name} may have understood my response as a ${declined ? 'boundary for this contact' : 'willingness to have this conversation'}. That does not tell them how much time or help I can offer; I can explain that myself.`
        : `I do not know what impression ${name} formed of me from that earlier contact. I can say clearly what I want today instead of assuming I know.`;
  }
  return {romanceAllowed:agePair && !kin && !witness, contextLabel:topicLabels[context.topic] || 'Encounter', observation, interpretation, alternatives, myWish, selfLens:selfLens.slice(0,2), unknowns, nextStep, audience, metabelief, evidenceAt:latest?.at ?? null};
}
export function perspectiveThought(brief) {
  return [brief.interpretation, brief.alternatives.find(a=>a.text!==brief.interpretation)?.text, brief.selfLens[0], brief.audience, brief.nextStep].filter(Boolean).join(' ');
}
