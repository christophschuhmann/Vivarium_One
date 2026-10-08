// Public information is projected from actual public events. Private balances,
// diagnoses, doubts and unproven suspects never become a newspaper headline.
import { rng } from "../random.js";
import { addFeeling } from "../cognition.js";
import { rows, rowsFor, put, touch, balance, transfer, post } from "./store.js";
import {
  fundsOf,
  ownAccount,
  flow,
  householdOf,
  householdForecast,
} from "./economy.js";
import {
  ACTIVITIES,
  ITEMS,
  JOBS,
  estimatedNet,
  calendarDate,
} from "./catalog.js";
import { check, train } from "./percentile.js";
export const CRIME_TYPES = {
  theft: "Diebstahl",
  burglary: "Einbruch",
  robbery: "Raub",
  fraud: "Betrugsverdacht",
  violence: "Gewaltvorfall",
  illegal_trade: "Verdacht auf illegalen Handel",
  exploitation: "Ausbeutung",
};
export const SUBSTANCE_TYPES = {
  alcohol: { label: "Alkohol", cost: 450, hazard: 0.025 },
  tobacco: { label: "Tabak", cost: 650, hazard: 0.04 },
  other: { label: "other risky substance", cost: 1200, hazard: 0.075 },
  cannabis: {label:"cannabis-related risk",cost:1400,hazard:.04},
  opioids: {label:"opioid-related risk, including illicit fentanyl exposure",cost:3500,hazard:.13},
  cocaine: {label:"cocaine-related risk",cost:4500,hazard:.095},
  sedatives: {label:"sedative misuse",cost:1800,hazard:.08},
};
const clamp = (n) => Math.max(0, Math.min(1, n));
const actor = (d) =>
  [...d.people.values()].find((p) => p.age >= 18) || [...d.people.values()][0];
export function publicNews(
  d,
  event,
  { title, body, topic = "town", placeId = null } = {},
) {
  if (event.facts.private) throw new Error("Private event cannot be published");
  return put(
    d,
    "news",
    {
      title: String(title).slice(0, 180),
      body: String(body || event.description).slice(0, 1800),
      topic,
      placeId: placeId || event.location_id,
      at: event.end,
      sourceEventIds: [event.id],
      factual: true,
      author: "Lindenstädter Rundblick",
      correctionOf: null,
    },
    { ownerId: null },
  );
}
export function civicFestival(d, time, emit, { costCents = 30000 } = {}) {
  const city = rows(d, "institution").find((i) => i.payload.key === "city");
  if (
    !Number.isSafeInteger(costCents) ||
    costCents < 10000 ||
    costCents > 200000 ||
    balance(d, fundsOf(d).city) - costCents < city.payload.reserve
  )
    return {
      ok: false,
      reason: "Verfügbares Festbudget nach geschützter Reserve reicht nicht",
    };
  const p = actor(d),
    e = emit("city_festival", p, time, {
      public: true,
      costCents,
      endsAt: time + 6 * 3600,
    });
  if (
    !transfer(d, fundsOf(d).city, fundsOf(d).external, costCents, {
      key: { kind: "festival", eventId: e.id },
      at: time,
      eventId: e.id,
      kind: "civic_event_cost",
    }).ok
  )
    throw new Error("Festival funds changed");
  d.calendar.payload.festival = {
    eventId: e.id,
    startsAt: time,
    endsAt: time + 6 * 3600,
    locationId: d.calendar.payload.venues.garden.rooms[0],
    free: true,
  };
  touch(d, d.calendar);
  e.description =
    "Die Stadt finanziert einen offenen Nachbarschaftsnachmittag aus dem verfügbaren Haushalt. Der Eintritt ist frei; niemand muss teilnehmen.";
  publicNews(d, e, {
    title: "Gemeinsam im Park: offener Nachbarschaftsnachmittag",
    topic: "community",
    placeId: d.calendar.payload.festival.locationId,
  });
  return { ok: true, eventId: e.id };
}
export function donate(d, p, amount, time, emit, { publicly = false } = {}) {
  if (
    p.age < 18 ||
    !Number.isSafeInteger(amount) ||
    amount < 100 ||
    amount > 1000000 ||
    balance(d, ownAccount(d, p)) < amount + 10000
  )
    return {
      ok: false,
      reason:
        "Freiwillige Spende muss aus eigenen verfügbaren Mitteln gedeckt sein",
    };
  const e = emit("donation", p, time, {
    amountCents: amount,
    public: publicly,
    private: !publicly,
  });
  transfer(d, ownAccount(d, p), fundsOf(d).social, amount, {
    key: { kind: "donation", eventId: e.id },
    at: time,
    eventId: e.id,
    kind: "donation",
  });
  flow(p, time, "donation", -amount);
  e.description =
    p.name +
    " unterstützt freiwillig den Hilfsfonds. Der Beitrag ist tatsächlich gebucht und erkauft keine Freundschaft.";
  if (publicly)
    publishClaim(d, p, e, {
      dimension: "helpfulness",
      value: 0.12,
      statement: p.name + " hat den Hilfsfonds unterstützt.",
    });
  return { ok: true, eventId: e.id };
}
export function publishClaim(
  d,
  p,
  event,
  {
    dimension = "helpfulness",
    value = 0.1,
    statement,
    verified = true,
    audience = [],
  } = {},
) {
  const c = put(
    d,
    "claim",
    {
      subjectId: p.id,
      dimension,
      value: Math.max(-1, Math.min(1, value)),
      confidence: verified ? 0.9 : 0.45,
      verified,
      public: !!event.facts.public,
      audience: [
        ...new Set([
          p.id,
          ...audience,
          ...event.participants,
          ...(event.witnesses || []),
        ]),
      ],
      sourceEventId: event.id,
      at: event.end,
      expiresAt: event.end + 30 * 86400,
      statement: statement || event.description,
      correctionOf: null,
    },
    { ownerId: p.id },
  );
  for (const id of c.payload.audience) {
    const observer = d.people.get(id);
    if (observer) {
      observer.state.economy.knownClaims = [
        ...observer.state.economy.knownClaims,
        c.id,
      ].slice(-24);
    }
  }
  return c;
}
export function reputationFor(
  d,
  p,
  viewerId = null,
  time = d.calendar.payload.lastMinute,
) {
  const claims = rowsFor(d, "claim", "subjectId", p.id).filter(
      (c) =>
        c.payload.subjectId === p.id &&
        c.payload.expiresAt > time &&
        (c.payload.public || c.payload.audience.includes(viewerId || p.id)) &&
        !c.payload.retracted,
    ),
    ownItems = d.items.filter(
      (i) =>
        i.payload.ownerId === p.id &&
        i.payload.publiclyDisplayed &&
        !i.payload.stolen,
    ),
    visible = ownItems.reduce(
      (n, i) =>
        n +
        (ITEMS.find((x) => x.id === i.payload.catalogId)?.maxCents > 100000
          ? 0.08
          : 0.03),
      0,
    );
  return {
    helpfulness: clamp(
      0.5 +
        claims
          .filter((c) => c.payload.dimension === "helpfulness")
          .reduce(
            (n, c) => n + c.payload.value * c.payload.confidence * 0.4,
            0,
          ),
    ),
    reliability: clamp(
      0.5 +
        claims
          .filter((c) => c.payload.dimension === "reliability")
          .reduce(
            (n, c) => n + c.payload.value * c.payload.confidence * 0.4,
            0,
          ),
    ),
    visibleStatus: clamp(visible),
    recognition: Math.min(
      1,
      claims.filter((c) => c.payload.public && c.payload.value > 0).length *
        0.06,
    ),
    sources: claims.slice(-12).map((c) => ({
      id: c.id,
      statement: c.payload.statement,
      verified: c.payload.verified,
      confidence: c.payload.confidence,
      eventId: c.payload.sourceEventId,
    })),
    note: "Sichtbarer Besitz, Anerkennung und Verlässlichkeit sind getrennt. Kontostand ist kein sozialer Status.",
  };
}
export function rumorExchange(d, a, b, event) {
  if (
    event.facts.outcome !== "accepted" ||
    event.facts.private ||
    !["gossip", "small_talk", "deep_talk", "check_in"].includes(
      event.facts.category,
    )
  )
    return;
  const known = a.state.economy.knownClaims
    .map((id) => d.entities.get(id))
    .filter(
      (c) =>
        c &&
        c.kind === "claim" &&
        !c.payload.retracted &&
        c.payload.expiresAt > event.end &&
        !b.state.economy.knownClaims.includes(c.id) &&
        (c.payload.public || c.payload.audience.includes(b.id)),
    );
  const c = known[0];
  if (!c) return;
  const derived = put(
    d,
    "claim",
    {
      ...c.payload,
      public: false,
      verified: false,
      confidence: c.payload.confidence * 0.65,
      audience: [b.id],
      sourceEventId: event.id,
      hearsaySourceId: c.id,
      at: event.end,
      statement: "Ich habe von " + a.name + " gehört: " + c.payload.statement,
    },
    { ownerId: b.id },
  );
  b.state.economy.knownClaims = b.state.economy.knownClaims
    .concat(derived.id)
    .slice(-24);
  event.facts.heardClaim = { claimId: derived.id, unverified: true };
}
export function requestSupport(d, p, time, emit, { kind = "counseling" } = {}) {
  if(!["counseling","therapy","coaching"].includes(kind))return {ok:false,reason:"Choose counseling, therapy or coaching."};
  if (p.age < 18)
    return {
      ok: false,
      reason:
        "Betreuung Minderjähriger erfolgt über die zuständigen Bezugspersonen, ohne Erwachsenenmodule",
    };
  if (p.state.economy.health.supportPlanId)
    return { ok: true, planId: p.state.economy.health.supportPlanId };
  const e = emit("support_plan_accepted", p, time, { private: true, kind }),
    plan = put(
      d,
      "health_plan",
      {
        simId: p.id,
        kind,
        status: "active",
        voluntary: true,
        startedAt: time,
        nextAt: time + 3600,
        sessions: 0,
        costPerSessionCents: kind==="coaching"?5000:5500,
        payer:kind==="coaching"?"personal":"health_fund",
        sourceEventId: e.id,
        locationId: d.calendar.payload.venues.support.rooms[1],
      },
      { ownerId: p.id },
    );
  p.state.economy.health.supportPlanId = plan.id;
  e.description =
    p.name +
    " nimmt freiwillig eine Beratung an. Unterstützung, Zugang und ein tatsächlicher Termin werden vereinbart; es gibt keine sofortige Heilung.";
  return { ok: true, planId: plan.id };
}
export function supportedCare(d, p, event, duration) {
  const plan = d.entities.get(p.state.economy.health.supportPlanId);
  if (
    !plan ||
    plan.payload.status !== "active" ||
    p.state.location_id !== plan.payload.locationId ||
    event.end < plan.payload.nextAt
  )
    return false;
  const staffed = [...d.contracts.values()].some((c) =>
      /nurse|physician|counsel|psycholog|therapist|doctor/i.test(c.payload.job),
    ),
    cost = plan.payload.costPerSessionCents;
  const payer=plan.payload.payer==="personal"?ownAccount(d,p):fundsOf(d).health;
  if (!staffed || balance(d, payer) < cost) {
    event.facts.support = { waiting: true };
    return false;
  }
  transfer(d, payer, fundsOf(d).external, cost, {
    key: { kind: "care_session", eventId: event.id },
    at: event.end,
    eventId: event.id,
    kind: "funded_care",
  });
  plan.payload.sessions++;
  if(p.state.socialDynamics){p.state.socialDynamics.communicationPractice=Math.min(.2,p.state.socialDynamics.communicationPractice+.008);if(plan.payload.kind==="coaching"){const five=p.state.psychology.big_five;five.conscientiousness=Math.min(.95,five.conscientiousness+.0005);}}
  plan.payload.nextAt = event.end + 3 * 86400;
  touch(d, plan);
  for (const s of Object.values(p.state.economy.health.substances)) {
    s.dependence = Math.max(0, s.dependence - 0.035);
    s.supportedSince = event.end;
  }
  p.state.needs.comfort = Math.max(0, p.state.needs.comfort - 0.12);
  addFeeling(p, "hope_enthusiasm_optimism", 0.35, event.end, {
    kind: "received_support",
    text: "Eine wirkliche Beratung eröffnet einen nächsten Schritt.",
    evidence_id: event.id,
  });
  event.description =
    p.name +
    " nimmt einen tatsächlich finanzierten Beratungstermin wahr. Ein kleiner nächster Schritt wird vereinbart.";
  event.facts.support = {
    planId: plan.id,
    session: plan.payload.sessions,
    costCents: cost,
    instantCure: false,
    kind:plan.payload.kind,payer:plan.payload.payer||"health_fund",communicationPracticeGain:p.state.socialDynamics?.communicationPractice!=null?.008:0,
  };
  if(p.state.life){for(const c of p.state.life.conditions){c.managed=true;c.severity=Math.max(.04,c.severity-.025);}p.state.life.agency=Math.min(1,p.state.life.agency+.02);}
  return true;
}
// Adult-only, non-graphic abstract risk episodes. No drug doses, procurement
// methods, crime instructions, sexual acts, or adult criminal roles for minors.
export function substanceUse(d, p, type, time, emit, { consent = false } = {}) {
  const spec = SUBSTANCE_TYPES[type];
  if (p.age < 18 || !spec || !consent)
    return {
      ok: false,
      reason: "Nur ausdrücklich angenommene, abstrahierte Erwachsenenhandlung",
    };
  const health = p.state.economy.health,
    current = health.substances[type] || {
      exposures: 0,
      dependence: 0,
      craving: 0,
      abstinentDays: 0,
      lastUseAt: null,
    };
  if (current.lastUseAt != null && time - current.lastUseAt < 86400)
    return {
      ok: false,
      reason: "Tageslimit dieser abstrakten Risikosimulation",
    };
  if (balance(d, ownAccount(d, p)) < spec.cost)
    return {
      ok: false,
      reason:
        "Keine verfügbaren eigenen Mittel; Unterstützung bleibt erreichbar",
    };
  const e = emit("adult_health_risk", p, time, {
    type,
    private: true,
    costCents: spec.cost,
  });
  transfer(d, ownAccount(d, p), fundsOf(d).external, spec.cost, {
    key: { kind: "adult_risk_cost", eventId: e.id },
    at: time,
    eventId: e.id,
    kind: "adult_consumption",
  });
  flow(p, time, "adult_consumption", -spec.cost);
  const resilience = p.state.aptitudes.attributes.resolve / 100,
    disposition =
      0.3 +
      0.4 * p.state.psychology.big_five.neuroticism +
      0.3 * (1 - resilience),
    draw = rng(d.town.world.seed + ":risk:" + e.id),
    chance =
      spec.hazard * (1 + Math.min(8, current.exposures) * 0.22) * disposition;
  current.exposures++;
  if (draw() < chance) current.dependence = clamp(current.dependence + 0.08);
  current.lastUseAt = time;
  current.craving = clamp(current.dependence * 0.6);
  current.abstinentDays = 0;
  health.substances[type] = current;
  e.description =
    p.name +
    " erlebt eine abstrahierte gesundheitliche Risikosituation (" +
    spec.label +
    "). Folgen entwickeln sich individuell; Hilfsangebote bleiben verfügbar.";
  e.facts.healthChange = {
    exposures: current.exposures,
    dependence: current.dependence,
    medicalDiagnosis: false,
  };
  return { ok: true, eventId: e.id };
}
export function crimeEpisode(d, p, type, time, emit) {
  if (p.age < 18 || !CRIME_TYPES[type] || !p.state.economy.criminalRole)
    return { ok: false, reason: "Keine zulässige erwachsene Konfliktrolle" };
  const candidates = [...d.people.values()].filter(
      (q) =>
        q.id !== p.id &&
        q.age >= 18 &&
        (!p.state.economy.criminalRole.gangId ||
          q.state.economy.criminalRole?.gangId !==
            p.state.economy.criminalRole.gangId) &&
        q.state.location_id === p.state.location_id &&
        !["sleep", "toilet", "shower"].includes(q.state.action?.kind),
    ),
    victim = candidates[0];
  if (!victim)
    return {
      ok: false,
      reason:
        "Kein konkreter erreichbarer Beteiligter; kein erfundener Vorfall",
    };
  const e = emit(
      "crime_incident",
      p,
      time,
      { kind: type, private: true, abstract: true },
      [victim.id],
    ),
    result = check(p, e, {
      skill: type === "fraud" ? "analysis" : "craft",
      attribute: "coordination",
      difficulty: 15,
      seed: d.town.world.seed,
    }),
    successful = ["excellent", "success"].includes(result.grade),
    amount =
      successful && ["theft", "robbery", "fraud", "burglary"].includes(type)
        ? Math.min(3000, Math.max(0, balance(d, ownAccount(d, victim)) - 2000))
        : 0;
  if (amount)
    transfer(d, ownAccount(d, victim), ownAccount(d, p), amount, {
      key: { kind: "crime_loss", eventId: e.id },
      at: time,
      eventId: e.id,
      kind: "unlawful_transfer",
    });
  e.facts.lossCents = amount;
  e.facts.successful = successful;
  e.description =
    "Ein nicht grafisch dargestellter " +
    CRIME_TYPES[type] +
    "-Vorfall betrifft " +
    victim.name +
    ". Der Vorfall und die unsicheren Wahrnehmungen werden getrennt behandelt.";
  const c = put(
    d,
    "case",
    {
      kind: type,
      victimId: victim.id,
      actorId: p.id,
      reported: false,
      status: "unreported",
      lossCents: amount,
      incidentEventId: e.id,
      createdAt: time,
      evidence: [],
      suspectKnown: false,
      investigatorId: null,
      judgment: null,
    },
    { ownerId: victim.id },
  );
  victim.state.economy.threats.push({
    kind: "experienced_crime",
    probability: 1,
    sourceEventId: e.id,
    caseId: c.id,
    options: ["report", "support"],
  });
  addFeeling(victim, "fear", 0.4, time, {
    kind: "actual_incident",
    text: "Ein realer Vorfall verunsichert mich.",
    evidence_id: e.id,
  });
  return { ok: true, caseId: c.id, eventId: e.id };
}
export function reportCase(d, p, c, time, emit) {
  if (c.payload.victimId !== p.id || c.payload.status !== "unreported")
    return {
      ok: false,
      reason: "Nur der tatsächlich betroffene Sim kann diesen Fall melden",
    };
  const e = emit("incident_report", p, time, { caseId: c.id, private: true });
  c.payload.reported = true;
  c.payload.reportEventId = e.id;
  c.payload.status = "reported";
  c.payload.evidence = [
    {
      kind: "direct_victim_report",
      sourceEventId: e.id,
      confidence: 0.75,
      identifiesActor:
        !!p.relations[c.payload.actorId] &&
        !["burglary", "fraud"].includes(c.payload.kind),
    },
  ];
  c.payload.suspectKnown = c.payload.evidence.some((x) => x.identifiesActor);
  touch(d, c);
  e.description =
    p.name +
    " meldet einen tatsächlich erlebten Vorfall. Die Wache hat jetzt die Aussage, kennt aber keine privaten Gedanken und erhält keinen automatischen Schuldspruch.";
  return { ok: true };
}
export function communityDaily(d, time, emit) {
  const day = Math.floor(time / 86400);
  if (d.calendar.payload.lastCommunityDay === day) return;
  d.calendar.payload.lastCommunityDay = day;
  const draw = rng(d.town.world.seed + ":town-events:" + day),
    p = actor(d),
    weather = draw() < 0.22 ? "rain" : "clear";
  d.calendar.payload.weather = { type: weather, at: time };
  d.calendar.payload.regionalDemandFactor = 0.85 + draw() * 0.3;
  d.market.payload.supplyFactor = draw() < 0.06 ? 0.6 : 1;
  touch(d, d.market);
  touch(d, d.calendar);
  const e = emit("public_day", p, time, {
    public: true,
    weather,
    supplyFactor: d.market.payload.supplyFactor,
  });
  e.description =
    "Der neue Tag bringt " +
    (weather === "rain"
      ? "Regen und mehr Innenaktivitäten"
      : "ruhiges Wetter") +
    ". " +
    (d.market.payload.supplyFactor < 1
      ? "Die bestätigte Lieferung fällt kleiner aus; vorhandene Vorräte und günstigere Alternativen werden wichtiger."
      : "Der Stadtmarkt meldet seine reguläre Lieferung.");
  publicNews(d, e, {
    title:
      weather === "rain"
        ? "Ein Regentag in Lindenstadt"
        : "Heute in Lindenstadt",
    topic: "daily",
  });
  // Firms refresh declared, funded vacancies, not an unlimited hiring faucet.
  for (const firm of d.firms.values()) {
    const spec = JOBS[firm.payload.role];
    if (!spec) continue;
    const current = [...d.contracts.values()].filter(
        (c) => c.payload.firmId === firm.id,
      ).length,
      capacity = Math.max(firm.payload.capacity, Math.ceil(d.people.size / 80)),
      affordable = Math.floor(
        balance(d, firm.payload.accountId) / Math.max(1, spec.gross * 1.2),
      ),
      slots = Math.min(Math.max(0, capacity - current), affordable);
    const listing = d.jobs.find(
      (j) => j.payload.firmId === firm.id && !j.payload.holiday,
    );
    if (
      listing &&
      (listing.payload.expiresAt <= time || listing.payload.slots !== slots)
    ) {
      listing.payload.slots = slots;
      listing.payload.expiresAt = time + 30 * 86400;
      listing.payload.updatedAt = time;
      touch(d, listing);
    }
  }
  if (day % 7 === 5 && draw() < 0.45) civicFestival(d, time, emit);
  for (const sim of d.people.values()) {
    if (sim.age < 18) {
      sim.state.economy.health.substances = {};
      delete sim.state.economy.criminalRole;
      delete sim.state.economy.adultService;
      continue;
    }
    const health = sim.state.economy.health;
    if (!health.riskDisposition)
      health.riskDisposition = {
        version: 1,
        voluntaryAdultHabit:
          rng(d.town.world.seed + ":adult-habit:" + sim.profile.seed_key)() <
          0.06,
        source: "initialized_adult_background",
      };
    for (const [type, s] of Object.entries(health.substances)) {
      if (time - (s.lastUseAt || 0) >= 86400) {
        s.abstinentDays++;
        s.craving = clamp(
          s.dependence * (1 + 0.08 * Math.min(5, s.abstinentDays)),
        );
        if (s.supportedSince) s.dependence = Math.max(0, s.dependence - 0.003);
        if (s.craving > 0.25) {
          sim.state.needs.comfort = clamp(sim.state.needs.comfort + 0.025);
          sim.state.economy.threats = sim.state.economy.threats.filter(
            (t) => t.kind !== "health_pressure",
          );
          sim.state.economy.threats.push({
            kind: "health_pressure",
            probability: s.dependence,
            source: "own_recorded_health_experiences",
            options: ["counseling", "trusted_contact"],
          });
        }
      }
    }
    sim.state.economy.reputation = reputationFor(d, sim, sim.id, time);
  }
  // Bounded public news/rumor caches; the full canonical sources stay in journal.
  const news = rows(d, "news").sort((a, b) => b.payload.at - a.payload.at);
  for (const n of news.slice(90)) {
    d.entities.delete(n.id);
    d.groups.get("news").delete(n.id);
    d.deletedEntities.add(n.id);
    d.dirtyEntities.delete(n.id);
  }
  for (const c of rows(d, "claim"))
    if (c.payload.expiresAt < time - 86400) {
      d.entities.delete(c.id);
      d.groups.get("claim").delete(c.id);
      d.deletedEntities.add(c.id);
      d.dirtyEntities.delete(c.id);
    }
}
export function reviewCases(d, time, emit) {
  let reviewed = 0;
  for (const c of rows(d, "case").sort(
    (a, b) => (a.payload.lastReviewedAt || 0) - (b.payload.lastReviewedAt || 0),
  ))
    if (
      c.payload.reported &&
      ["reported", "investigating"].includes(c.payload.status)
    ) {
      if (reviewed >= 3) break;
      const police = [...d.people.values()].find(
        (q) =>
          q.age >= 18 &&
          q.profile.job === "Police" &&
          q.state.location_id === q.profile.workplace_id &&
          q.state.action?.kind === "work",
      );
      if (!police) continue;
      const x = c.payload;
      reviewed++;
      x.lastReviewedAt = time;
      touch(d, c);
      if (!x.investigatorId) {
        x.investigatorId = police.id;
        x.status = "investigating";
        const event = emit("case_review", police, time, {
          caseId: c.id,
          private: true,
        });
        event.description =
          police.name +
          " prüft eine dokumentierte Aussage. Ein Ermittlungsfall ist noch keine bewiesene Schuld.";
        x.reviewEventId = event.id;
        touch(d, c);
        if (x.suspectKnown) {
          const suspect = d.people.get(x.actorId),
            accepts =
              suspect.age >= 18 &&
              suspect.state.location_id &&
              !["sleep", "toilet", "shower"].includes(
                suspect.state.action?.kind,
              ) &&
              rng(d.town.world.seed + ":accountability:" + c.id)() <
                suspect.state.psychology.big_five.conscientiousness * 0.25;
          if (accepts) {
            const admission = emit(
              "voluntary_accountability",
              suspect,
              time,
              { caseId: c.id, private: true, remote: true },
              [police.id],
            );
            admission.description =
              suspect.name +
              " nimmt selbst Kontakt zur Wache auf und übernimmt ausdrücklich Verantwortung für den eigenen dokumentierten Vorfall.";
            x.evidence.push({
              kind: "voluntary_admission",
              sourceEventId: admission.id,
              confidence: 1,
              identifiesActor: true,
            });
            touch(d, c);
          }
        }
      } else if (
        time - x.createdAt >= 7 * 86400 &&
        x.suspectKnown &&
        x.evidence.some((e) => e.kind === "voluntary_admission")
      ) {
        const event = emit(
          "civil_resolution",
          police,
          time,
          { caseId: c.id, private: true },
          [x.victimId, x.actorId],
        );
        event.description =
          "Ein fiktives Verfahren klärt den dokumentierten Fall und ordnet Hilfe und Wiedergutmachung an. Tatsächliche Zahlungen bleiben vom verfügbaren Geld abhängig.";
        x.status = "resolved";
        x.judgment = {
          at: time,
          eventId: event.id,
          basis: x.evidence,
          fictional: true,
        };
        const culprit = d.people.get(x.actorId),
          paid = Math.min(x.lossCents, balance(d, ownAccount(d, culprit)));
        if (paid)
          transfer(
            d,
            ownAccount(d, culprit),
            ownAccount(d, d.people.get(x.victimId)),
            paid,
            {
              key: { kind: "restitution", caseId: c.id },
              at: time,
              eventId: event.id,
              kind: "restitution",
            },
          );
        x.unpaidRestitutionCents = x.lossCents - paid;
        publishClaim(d, culprit, event, {
          dimension: "reliability",
          value: -0.6,
          statement:
            "Ein eigener tatsächlich dokumentierter Vorfall wurde im fiktiven Verfahren geklärt.",
          verified: true,
          audience: [police.id, x.victimId],
        });
        touch(d, c);
      }
    }
  for (const c of rows(d, "case"))
    if (
      c.payload.status === "investigating" &&
      time - c.payload.createdAt >= 30 * 86400 &&
      !c.payload.evidence.some((e) => e.kind === "voluntary_admission")
    ) {
      const victim = d.people.get(c.payload.victimId),
        e = emit("case_inconclusive", victim, time, {
          caseId: c.id,
          private: true,
        });
      c.payload.status = "closed_inconclusive";
      c.payload.closedAt = time;
      c.payload.conclusionEventId = e.id;
      touch(d, c);
      e.description =
        "Der dokumentierte Fall wird ohne ausreichenden Beleg für eine persönliche Schuld abgeschlossen. Schutz und Unterstützung bleiben möglich; es entstehen kein automatischer Strafruf und kein erfundener Schuldspruch.";
    }
}
export function communityMinute(d, time, emit) {
  const hour = Math.floor(time / 3600);
  if (
    (time / 3600) % 24 >= 8 &&
    (time / 3600) % 24 < 16 &&
    d.calendar.payload.lastCaseHour !== hour
  ) {
    d.calendar.payload.lastCaseHour = hour;
    touch(d, d.calendar);
    reviewCases(d, time, emit);
  }

  if ((time / 3600) % 24 < 18 || (time / 3600) % 24 > 21) return;
  const day = Math.floor(time / 86400);
  for (const p of d.people.values()) {
    if (
      p.age < 18 ||
      !p.state.location_id ||
      ["sleep", "work", "toilet", "shower"].includes(p.state.action?.kind)
    )
      continue;
    const firstRiskCheck = p.state.economy.lastRiskDay !== day;
    p.state.economy.lastRiskDay = day;
    const health = p.state.economy.health,
      draw = rng(
        d.town.world.seed + ":risk-day:" + p.profile.seed_key + ":" + day,
      );
    if (
      firstRiskCheck &&
      health.riskDisposition?.voluntaryAdultHabit &&
      draw() < 0.2 &&
      !health.supportPlanId
    )
      substanceUse(d, p, "alcohol", time, emit, { consent: true });
    if (
      firstRiskCheck &&
      Object.values(health.substances).some((s) => s.dependence > 0.15) &&
      draw() < 0.35
    )
      requestSupport(d, p, time, emit);

    if (
      p.state.economy.criminalRole &&
      p.state.economy.lastCrimeDay !== day &&
      rng(
        d.town.world.seed + ":crime-day:" + p.profile.seed_key + ":" + day,
      )() < 0.04
    ) {
      const result = crimeEpisode(
        d,
        p,
        p.state.economy.criminalRole.kind,
        time,
        emit,
      );
      if (result.ok) p.state.economy.lastCrimeDay = day;
    }
    for (const c of rows(d, "case"))
      if (
        c.payload.victimId === p.id &&
        c.payload.status === "unreported" &&
        time - c.payload.createdAt > 3600
      )
        reportCase(d, p, c, time, emit);
  }
}
export function readPublicNews(d, p, event) {
  if (
    p.age < 12 ||
    !["read", "leisure_read_for_fun", "leisure_market_library"].includes(
      event.facts.action,
    )
  )
    return;
  const latest = rows(d, "news")
    .filter((n) => n.payload.at <= event.end)
    .sort((a, b) => b.payload.at - a.payload.at)[0];
  if (
    !latest ||
    (p.state.economy.knownNews || []).some((n) => n.id === latest.id) ||
    rng(
      d.town.world.seed +
        ":news-reading:" +
        p.profile.seed_key +
        ":" +
        event.id,
    )() > 0.3
  )
    return;
  p.state.economy.knownNews = (p.state.economy.knownNews || [])
    .concat({
      id: latest.id,
      title: latest.payload.title,
      body: latest.payload.body,
      sourceEventIds: latest.payload.sourceEventIds,
      readEventId: event.id,
      at: event.end,
      editorial: latest.payload.editorial || null,
      editorialIsCommentary: true,
    })
    .slice(-8);
  event.facts.newsRead = {
    id: latest.id,
    title: latest.payload.title,
    publicSources: latest.payload.sourceEventIds,
  };
  event.description =
    p.name +
    " liest den öffentlichen Rundblick: " +
    latest.payload.title +
    ". Persönliche Konten und unbewiesene Verdächtigungen stehen dort nicht.";
}
export function laborAndSupplyEvents(d, time, emit) {
  const day = Math.floor(time / 86400);
  if (d.calendar.payload.lastLaborDay === day) return;
  d.calendar.payload.lastLaborDay = day;
  touch(d, d.calendar);
  for (const offer of Object.values(d.market.payload.offers)) {
    offer.basePriceCents ??= offer.priceCents;
    const shortage = Math.max(
      0,
      1 - offer.stock / Math.max(1, d.people.size * 2),
    );
    offer.priceCents = Math.round(offer.basePriceCents * (1 + shortage * 0.2));
  }
  touch(d, d.market);
  for (const firm of d.firms.values()) {
    if (firm.payload.publicFund) continue;
    const workers = [...d.contracts.values()].filter(
        (c) => c.payload.firmId === firm.id,
      ),
      monthly = workers.reduce(
        (n, c) => n + c.payload.grossMonthlyCents * 1.2,
        0,
      ),
      liquid = balance(d, firm.payload.accountId);
    firm.payload.runwayMonths = monthly ? liquid / monthly : null;
    touch(d, firm);
    if (
      !workers.length ||
      liquid >= monthly * 0.15 ||
      day - (firm.payload.lastRestructureDay ?? -90) < 30
    )
      continue;
    const contract = workers.find(
      (c) => (c.payload.pendingGrossCents || 0) > 0,
    );
    if (!contract) continue;
    const p = d.people.get(contract.payload.simId),
      e = emit("employment_notice", p, time, {
        firmId: firm.id,
        contractId: contract.id,
        private: true,
        reason: "actual_insufficient_employer_funds",
      });
    contract.payload.status = "ended_due_funding";
    contract.payload.endedAt = time;
    touch(d, contract);
    d.contracts.delete(p.id);
    firm.payload.lastRestructureDay = day;
    firm.payload.capacity = Math.max(0, firm.payload.capacity - 1);
    touch(d, firm);
    p.state.economy.previousJob = p.profile.job;
    p.state.economy.employmentId = null;
    p.profile.job = "Unemployed";
    p.profile.workplace_id = null;
    p.profile.facility = null;
    p.state.career = { ...p.state.career, job: "Unemployed" };
    e.description =
      p.name +
      " erhält wegen der tatsächlich unzureichenden Arbeitgebermittel eine Vertragsmitteilung. Bereits verdiente Lohnansprüche bleiben bestehen; Stellenbörse und Beratung werden zu konkreten nächsten Möglichkeiten.";
    addFeeling(p, "doubt", 0.45, time, {
      kind: "actual_employment_notice",
      text: "Eine echte Mitteilung verändert meine wirtschaftliche Sicherheit.",
      evidence_id: e.id,
    });
  }
}
