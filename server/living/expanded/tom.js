// Probabilistic FIRST-PERSON social models. Never read another Sim's private
// thoughts, expectations, balances, health, goals or hidden affect as evidence.
import { rng } from "../random.js";
import { relationshipLabels } from "../relationship-labels.js";
import { SOCIAL_CATALOG } from "./catalog.js";
import { rows, put, touch } from "./store.js";
const names = {
  support: "Hilfe oder freundlicher Kontakt",
  obligation: "Aufgabe oder Abstimmung",
  criticism: "Kritik oder Unzufriedenheit",
  romance: "Freiwilliges romantisches Interesse",
  unknown: "Ein anderer, noch unbekannter Anlass",
};
const positive = new Set([
  "offer_help",
  "comfort",
  "check_in",
  "reconcile",
  "apologize",
  "compliment",
  "celebrate",
]);
const negative = new Set(["argue", "provoke", "undermine", "gossip"]);
const romantic = new Set([
  "flirt",
  "ask_date",
  "express_affection",
  "teen_date",
  "teen_romantic_talk",
  "adult_private_intimacy",
]);
const topics = [
  "family",
  "school",
  "work",
  "leisure",
  "negotiation",
  "romance",
  "public",
];
export function encounterContext(p, other, town, event = { facts: {} }) {
  const r = p.relations[other.id] || {},
    role = relationshipLabels(p, other, r, town.byId),
    venue = town.places.get(event.location_id || p.state.location_id),
    family =
      (p.profile.family.parent_ids || []).includes(other.id) ||
      (other.profile.family?.parent_ids || []).includes(p.id) ||
      role.some((s) =>
        /Familie|Mutter|Vater|Schwester|Bruder|Oma|Groß|Enkel|Ehe|Tochter|Sohn|Tante|Onkel|Cousin/.test(
          s,
        ),
      );
  const professional =
    p.age >= 18 &&
    other.age >= 18 &&
    p.profile.workplace_id === venue?.id &&
    other.profile.workplace_id === venue?.id;
  const topic = romantic.has(event.facts.category)
    ? "romance"
    : professional
      ? "work"
      : family
        ? "family"
        : venue?.purpose.includes("school") ||
            venue?.purpose.includes("kindergarten")
          ? "school"
          : r.background?.contexts?.includes("Coworker") ||
              role.some((x) => /Kolleg|Arbeitskontakt/.test(x))
            ? "work"
            : ["ask_favor", "persuade", "set_boundary", "make_plans"].includes(
                  event.facts.category,
                )
              ? "negotiation"
              : "leisure";
  const explicitManager =
      other.profile.publicRoles?.supervises?.includes(p.id) || false,
    relation = p.relations[other.id] || {};
  return {
    topic,
    role,
    explicitManager,
    trust: relation.trust ?? 0.4,
    tension: relation.tension || 0,
    knownAttraction: relation.attraction || 0,
    otherAge: other.age,
    ownAge: p.age,
    publicAudience: (event.witnesses || []).length,
    venueId: venue?.id || null,
    sourceEventId: event.id || null,
  };
}
function contextThought(p, other, context, probability, event) {
  const ownChild = p.profile.family.parent_ids?.includes(other.id),
    ownParent = other.profile.family.parent_ids?.includes(p.id),
    school = context.topic === "school",
    work = context.topic === "work",
    partner = p.profile.family.partner_id === other.id,
    needs = p.state.needs;
  let variants = {
    support:
      "sucht einen freundlichen Kontakt oder möchte Unterstützung anbieten",
    obligation: "möchte etwas im Alltag mit mir abstimmen",
    criticism: "könnte mit einer konkreten Sache unzufrieden sein",
    romance: "könnte freiwillige Nähe wünschen",
    unknown: "hat einen anderen Anlass, den ich noch nicht kenne",
  };
  if (ownChild)
    variants = {
      ...variants,
      support:
        "möchte vielleicht mit mir spielen, zuhören oder mir bei einer Aufgabe helfen",
      obligation:
        "möchte vielleicht eine kleine Aufgabe oder unseren Tagesplan mit mir besprechen",
      criticism:
        "könnte eine offene Absprache ansprechen; ein Gespräch ist noch kein Ausschimpfen",
    };
  if (ownParent)
    variants = {
      ...variants,
      support:
        "möchte vielleicht gemeinsame Zeit oder Unterstützung bei einem eigenen Versuch",
      obligation:
        "möchte vielleicht eine eigene Entscheidung oder eine faire Absprache aushandeln",
      criticism:
        "könnte sich über einen zu schnellen Übergang oder zu wenig Freiraum ärgern",
    };
  if (school)
    variants = {
      ...variants,
      support:
        "möchte vielleicht eine Frage gemeinsam lösen oder nach der Schule etwas spielen",
      obligation:
        "möchte vielleicht die tatsächliche Lernaufgabe mit mir aufteilen",
      criticism:
        "könnte einen bestimmten Fehler oder eine schwierige Gruppenabsprache meinen",
    };
  if (work)
    variants = {
      ...variants,
      support:
        "möchte vielleicht meinen konkreten Beitrag anerkennen oder Unterstützung anbieten",
      obligation: context.explicitManager
        ? "möchte vielleicht einen neuen Auftrag oder eine Priorität klären"
        : "möchte vielleicht einen gemeinsamen Arbeitsschritt abgleichen",
      criticism:
        "könnte zu einem beobachteten Arbeitsschritt Rückmeldung geben",
    };
  if (partner)
    variants = {
      ...variants,
      support:
        "möchte vielleicht einen ruhigen Moment zu zweit oder ein offenes Gespräch",
      obligation:
        "möchte vielleicht unsere Aufgaben, Termine oder gemeinsame Ausgaben abstimmen",
      criticism:
        "könnte einen unerfüllten Wunsch ansprechen; ich weiß noch nicht welchen",
      romance:
        "könnte freiwillige liebevolle Nähe wünschen, ohne dadurch weitere Zustimmung vorauszusetzen",
    };
  if (p.age >= 66)
    variants.support =
      "möchte vielleicht konkrete Hilfe anbieten oder meine Erfahrung hören; ich kann selbst sagen, was ich brauche";
  const sorted = Object.entries(probability).sort((a, b) => b[1] - a[1]);
  let text =
    other.name +
    " " +
    variants[sorted[0][0]] +
    ". Eine weitere Möglichkeit: " +
    variants[sorted[1][0]] +
    ". Ich kann nachfragen, statt meine Deutung als Tatsache zu behandeln.";
  if (Math.max(needs.fatigue, needs.hunger) > 0.7)
    text +=
      " Meine eigene Müdigkeit oder mein Hunger könnte den Eindruck zusätzlich färben.";
  if (context.publicAudience)
    text +=
      " Andere können nur den hörbaren Teil mitbekommen; Privates kann ich auf später vertagen.";
  if (event.facts.outcome === "declined" && romantic.has(event.facts.category))
    text =
      "Die Grenze ist heute ausgesprochen. Ich respektiere sie; der Grund bleibt unbekannt und ist kein Anlass, weiter zu drängen.";
  return text;
}
function priors(p, context) {
  const big = p.state.psychology.big_five,
    stress = Math.max(
      0,
      ...(p.state.affect?.states || [])
        .filter((e) => ["fear", "distress", "anger"].includes(e.id))
        .map((e) => e.intensity),
    ),
    uncertainty = 1 - context.trust;
  const alpha = {
    support: 1.6 + context.trust * 2 + big.agreeableness,
    obligation: context.explicitManager
      ? 3
      : context.topic === "school"
        ? 2.5
        : context.topic === "family"
          ? 1.7
          : 1,
    criticism: 0.6 + big.neuroticism * 1.4 + stress + context.tension * 2,
    romance: 0,
    unknown: 2 + uncertainty,
  };
  // Adult/teen romance has exactly the same age/kin constraints as actions.
  // Gender, ethnicity and a third person's private attraction are NOT priors.
  const familyRole = context.role.some((r) =>
      /Mutter|Vater|Schwester|Bruder|Tochter|Sohn|Cous|Enkel|Tante|Onkel|Groß/.test(
        r,
      ),
    ),
    safePair =
      (p.age >= 18 && context.otherAge >= 18) ||
      (p.age >= 14 &&
        p.age < 18 &&
        context.otherAge >= 14 &&
        context.otherAge < 18 &&
        Math.abs(p.age - context.otherAge) <= 1);
  if (safePair && !familyRole)
    alpha.romance =
      context.topic === "romance"
        ? 1.3 + context.knownAttraction
        : Math.max(0.1, context.knownAttraction * 0.8);
  if (context.publicAudience) alpha.unknown += 0.4;
  return alpha;
}
function probabilities(alpha) {
  const entries = Object.entries(alpha),
    sum = entries.reduce((n, [, v]) => n + Math.max(0, v), 0) || 1;
  return Object.fromEntries(entries.map(([k, v]) => [k, Math.max(0, v) / sum]));
}
function prune(p, time) {
  const c = p.state.social_cognition;
  c.contacts ||= {};
  for (const contact of Object.values(c.contacts)) {
    const order = Object.values(contact.topics || {}).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
    contact.topics = Object.fromEntries(
      order.slice(0, 3).map((x) => [x.topic, x]),
    );
  }
  const contacts = Object.entries(c.contacts).sort(
    (a, b) => b[1].updatedAt - a[1].updatedAt,
  );
  c.contacts = Object.fromEntries(contacts.slice(0, 24));
  c.metabeliefs = Object.fromEntries(
    Object.entries(c.metabeliefs || {})
      .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
      .slice(0, 1),
  );
}
export function predict(p, other, town, event) {
  const context = encounterContext(p, other, town, event),
    prior = priors(p, context),
    stored =
      p.state.social_cognition.contacts?.[other.id]?.topics?.[context.topic],
    at = event.end ?? town.world.seconds,
    alpha = { ...prior };
  if (stored) {
    const decay = Math.pow(
      0.5,
      Math.max(0, at - stored.updatedAt) / (3 * 86400),
    );
    for (const key of Object.keys(alpha))
      alpha[key] +=
        Math.max(0, (stored.alpha[key] || 0) - (stored.prior[key] || 0)) *
        decay;
  }
  const probability = probabilities(alpha),
    ranked = Object.entries(probability).sort((a, b) => b[1] - a[1]),
    thought = contextThought(p, other, context, probability, event);
  return {
    subjectId: other.id,
    subjectName: other.name,
    context,
    topic: context.topic,
    prior,
    alpha,
    probabilities: probability,
    thought,
    certainty: Math.min(0.85, ranked[0][1]),
    sourceRefs: stored?.sourceRefs?.slice(-6) || [],
    kind: "subjective_hypothesis_not_other_mind",
    explanations: {
      character: "Eigene Persönlichkeit und bekannte Beziehung",
      situation: "Eigener Kontaktkontext und wahrnehmbares Publikum",
      evidence: "Nur eigene gehörte oder beobachtete Aussagen",
    },
  };
}
export function observeSocial(
  d,
  town,
  p,
  other,
  event,
  { witness = false } = {},
) {
  const c = p.state.social_cognition,
    before = predict(p, other, town, event),
    alpha = { ...before.alpha },
    category = event.facts.category,
    outcome = event.facts.outcome,
    quality = event.facts.checks?.[p.id]?.grade,
    weight = witness
      ? 0.4
      : { excellent: 1.2, success: 1, mixed: 0.7, setback: 0.5 }[quality] || 1;
  if (outcome === "declined") {
    alpha.unknown += weight;
    alpha.obligation += 0.25 * weight;
  } else if (positive.has(category)) {
    alpha.support += 1.6 * weight;
  } else if (negative.has(category)) {
    alpha.criticism += 1.6 * weight;
  } else if (romantic.has(category) && alpha.romance > 0) {
    alpha.romance += 1.5 * weight;
  } else if (
    [
      "coordinate_work",
      "make_plans",
      "persuade",
      "ask_help",
      "ask_favor",
    ].includes(category)
  ) {
    alpha.obligation += weight;
  } else alpha.support += 0.5 * weight;
  const prior = before.prior;
  for (const key of Object.keys(alpha))
    alpha[key] = Math.min(prior[key] + 8, alpha[key]);
  const source = {
    eventId: event.id,
    at: event.end,
    modality: witness
      ? "nearby_observation"
      : event.facts.remote
        ? "telephone"
        : "direct",
    reliability: witness
      ? 0.45
      : { excellent: 0.9, success: 0.85, mixed: 0.65, setback: 0.5 }[quality] ||
        0.85,
    observed: category + " " + outcome,
    publicAudience: (event.witnesses || []).length,
  };
  const previous = c.contacts[other.id] || {
    subjectId: other.id,
    subjectName: other.name,
    topics: {},
  };
  previous.updatedAt = event.end;
  previous.knownRoles = before.context.role;
  previous.topics[before.topic] = {
    topic: before.topic,
    prior,
    alpha,
    probabilities: probabilities(alpha),
    updatedAt: event.end,
    sourceRefs: (previous.topics[before.topic]?.sourceRefs || [])
      .concat(source)
      .slice(-8),
    thought: contextThought(
      p,
      other,
      before.context,
      probabilities(alpha),
      event,
    ),
  };
  c.contacts[other.id] = previous;
  // One second-order model from my own spoken bid + observed response. No
  // traversal to other.state.social_cognition and no nested infinite recursion.
  if (!witness)
    c.metabeliefs = {
      [other.id]: {
        subjectId: other.id,
        at: event.end,
        eventId: event.id,
        depth: 2,
        confidence: 0.45,
        text:
          "Vielleicht denkt " +
          other.name +
          ", ich möchte " +
          (category === "ask_help"
            ? "Unterstützung"
            : romantic.has(category)
              ? "freiwillige Nähe"
              : negative.has(category)
                ? "eine Grenze oder Unzufriedenheit ausdrücken"
                : "einen Kontakt oder eine Abstimmung") +
          ". Die tatsächliche Vorstellung kenne ich nicht.",
      },
    };
  c.lastContext = {
    at: event.end,
    eventId: event.id,
    topic: before.topic,
    audience: before.context.publicAudience,
  };
  prune(p, event.end);
  event.facts.socialViews ||= {};
  event.facts.socialViews[p.id] = {
    before: before.probabilities,
    after: previous.topics[before.topic].probabilities,
    thought: previous.topics[before.topic].thought,
    source,
    meta: c.metabeliefs[other.id] || null,
  };
  if (
    d &&
    !witness &&
    event.facts.outcome === "accepted" &&
    positive.has(category)
  ) {
    const helper = town.byId.get(
      event.participants[category === "ask_help" ? 1 : 0],
    );
    const target = helper.id === p.id ? other : p;
    event.facts.claimIds ||= {};
    const oldClaim = d.entities.get(event.facts.claimIds[helper.id]);
    const claim =
      oldClaim ||
      put(
        d,
        "claim",
        {
          subjectId: helper.id,
          dimension: "helpfulness",
          value: 0.1,
          confidence: 0.8,
          verified: true,
          public:
            !event.facts.private &&
            (event.witnesses || []).length > 0 &&
            !Object.values(helper.profile.home).includes(event.location_id),
          audience: [p.id, other.id, ...(event.witnesses || [])],
          sourceEventId: event.id,
          at: event.end,
          expiresAt: event.end + 30 * 86400,
          statement:
            helper.name +
            " hat einen tatsächlich erlebten freundlichen Beitrag geleistet.",
        },
        { ownerId: target.id },
      );
    event.facts.claimIds[helper.id] = claim.id;
    p.state.economy.knownClaims.push(claim.id);
    p.state.economy.knownClaims = p.state.economy.knownClaims.slice(-24);
  }
}
function predictText(probability) {
  const sorted = Object.entries(probability).sort((a, b) => b[1] - a[1]);
  return (
    "Ich vermute " +
    names[sorted[0][0]].toLowerCase() +
    "; " +
    names[sorted[1][0]].toLowerCase() +
    " bleibt eine mögliche Alternative."
  );
}
// Runtime guards for authored situations. A catalog entry is a potential
// episode, never proof that its trigger actually happened.
export function socialEpisodeEligible(row, p, other, town, event, d) {
  const context = encounterContext(p, other, town, event),
    words = (row.title + " " + row.context + " " + row.trigger).toLowerCase(),
    place = town.places.get(event.location_id),
    category = event.facts.category;
  if (row.catalog === "duties" || row.catalog === "expectations") return false;
  if (
    row.catalog === "romance" &&
    (p.age < 18 ||
      other.age < 18 ||
      (!romantic.has(category) &&
        ![
          "set_boundary",
          "argue",
          "reconcile",
          "apologize",
          "deep_talk",
        ].includes(category)))
  )
    return false;
  if (
    row.catalog === "romance" &&
    context.role.some((r) =>
      /Mutter|Vater|Bruder|Schwester|Cous|Enkel|Tochter|Sohn|Tante|Onkel/.test(
        r,
      ),
    )
  )
    return false;
  if (
    /eltern.*kinder/.test(words) &&
    !(
      (p.profile.family.parent_ids || []).includes(other.id) ||
      (other.profile.family.parent_ids || []).includes(p.id)
    )
  )
    return false;
  if (
    /geschwister/.test(words) &&
    !context.role.some((r) => /Bruder|Schwester/.test(r))
  )
    return false;
  if (
    /groß|oma|opa|enkel/.test(words) &&
    !context.role.some((r) => /Groß|Enkel/.test(r))
  )
    return false;
  if (
    /teen|jugend/.test(words) &&
    !((p.age >= 12 && p.age < 18) || (other.age >= 12 && other.age < 18))
  )
    return false;
  if (
    /kinder|kindheit/.test(row.context.toLowerCase()) &&
    !(p.age < 12 || other.age < 12)
  )
    return false;
  if (
    /arbeit|beruf|team|chef|schicht|kolleg/.test(words) &&
    context.topic !== "work"
  )
    return false;
  if (
    /chef|vorgesetzt|führung/.test(words) &&
    !context.explicitManager &&
    !p.profile.publicRoles?.supervises?.includes(other.id)
  )
    return false;
  if (
    /schule|lehrkraft|klassen|unterricht|schul/.test(words) &&
    !place?.purpose.includes("school")
  )
    return false;
  if (
    /date|flirt|annäherung|zärtlich|romantik/.test(words) &&
    !romantic.has(category)
  )
    return false;
  if (
    /partnerschaft|paar|gemeinsam.*zusammen|ehe/.test(
      row.context.toLowerCase(),
    ) &&
    p.profile.family.partner_id !== other.id
  )
    return false;
  if (
    /lieh|geliehen|leihen/.test(words) &&
    !d?.items.some(
      (i) =>
        (i.payload.ownerId === p.id && i.payload.loanedTo === other.id) ||
        (i.payload.ownerId === other.id && i.payload.loanedTo === p.id),
    )
  )
    return false;
  if (
    /rückzahlung|kredit|schuld/.test(words) &&
    !d?.loans.some(
      (l) =>
        [p.id, other.id].includes(l.payload.borrowerId) &&
        l.payload.status === "active",
    )
  )
    return false;
  if (
    /haushaltsbudget|geld|rechnung|miete/.test(words) &&
    !event.facts.financialRequest &&
    !p.state.economy?.threats.length
  )
    return false;
  if (
    /musik|lärm/.test(words) &&
    ![p, other].some((s) =>
      /music|instrument|karaoke/.test(s.state.action?.kind || ""),
    )
  )
    return false;
  if (
    /aufgaben|aufräum|ordnung|pflicht|hausaufgab/.test(words) &&
    !rows(d, "obligation").some(
      (o) =>
        [p.id, other.id].includes(o.payload.assigneeId) &&
        ["accepted", "working"].includes(o.payload.status),
    ) &&
    !["coordinate_work", "make_plans", "ask_help"].includes(category)
  )
    return false;
  if (
    /geburtstag/.test(words) &&
    ![p, other].some((s) => s.state.birthdayToday)
  )
    return false;
  if (
    /krank|pflege|gesund|arzt/.test(words) &&
    !rows(d, "health_plan").some(
      (h) =>
        [p.id, other.id].includes(h.payload.simId) &&
        h.payload.status === "active",
    ) &&
    context.topic !== "work"
  )
    return false;
  if (/trennung/.test(words) && !event.facts.relationshipDecision) return false;
  if (
    /positive/.test(row.tone.toLowerCase()) &&
    (negative.has(category) || event.facts.outcome !== "accepted")
  )
    return false;
  if (
    row.tone === "Konflikt" &&
    !negative.has(category) &&
    event.facts.outcome !== "declined"
  )
    return false;
  return true;
}
export function decorateSocial(d, town, event) {
  const [a, b] = event.participants.map((id) => town.byId.get(id));
  if (!a || !b) return;
  const candidates = SOCIAL_CATALOG.filter((row) =>
    socialEpisodeEligible(row, a, b, town, event, d),
  );
  if (!candidates.length) return;
  const draw = rng(
      town.world.seed +
        ":episode:" +
        a.profile.seed_key +
        ":" +
        b.profile.seed_key +
        ":" +
        event.end,
    ),
    history = a.state.social_cognition.recentCatalogIds || [],
    ranked = candidates
      .map((row) => ({
        row,
        score: (history.includes(row.id) ? -0.7 : 0) + draw(),
      }))
      .sort((x, y) => y.score - x.score),
    row = ranked[0].row;
  event.facts.catalog = {
    id: row.id,
    title: row.title,
    context: row.context,
    contextValidated: true,
    selectedAs: "introduced_conversation_topic_not_proof_of_catalog_trigger",
    primitive: event.facts.category,
    actualOutcome: event.facts.outcome,
  };
  event.description +=
    " Gesprächsthema: " +
    row.title.replace(/ · (Kooperation|Konflikt)$/, "") +
    ".";
  a.state.social_cognition.recentCatalogIds = history.concat(row.id).slice(-12);
  b.state.social_cognition.recentCatalogIds = (
    b.state.social_cognition.recentCatalogIds || []
  )
    .concat(row.id)
    .slice(-12);
}
export function socialMindContext(p) {
  const c = p.state.social_cognition;
  if (!c) return null;
  return {
    perspective:
      "Own uncertain expectations; never private knowledge of the other Sim",
    contacts: Object.values(c.contacts)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8),
    secondOrder: Object.values(c.metabeliefs || {}).slice(0, 1),
    lastContext: c.lastContext,
  };
}
export function expectationBias(p, otherId, category) {
  const contact = p.state.social_cognition?.contacts?.[otherId];
  if (!contact) return 0;
  const newest = Object.values(contact.topics).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    )[0],
    pr = newest?.probabilities || {};
  return positive.has(category)
    ? (pr.criticism || 0) * 0.18 + (pr.support || 0) * 0.12
    : negative.has(category)
      ? (p.state.psychology.big_five.neuroticism || 0.5) *
        (pr.criticism || 0) *
        0.08
      : 0;
}
