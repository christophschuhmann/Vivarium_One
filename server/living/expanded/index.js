import { adultServicesMinute } from "./adult-services.js";
import { DUTIES } from "./catalog.js";
import path from "node:path";
import { db, j, pj } from "../../db.js";
import { initializeExpansion } from "./bootstrap.js";
import {
  EXPANDED_VERSION,
  commitEconomy,
  assertEconomicIntegrity,
  rows,
  touch,
  put,
  balance,
  transfer,
} from "./store.js";
import {
  economicDraft,
  economicMinute,
  accrueWork,
  consumeFood,
  refreshOwnResources,
  householdOf,
  ownAccount,
  fundsOf,
  householdForecast,
  householdSpendable,
  isHoliday,
} from "./economy.js";
import { housingDaily, propertyMaintenance } from "./housing.js";
import {
  assignObligation,
  lifeDaily,
  installExpandedActions,
  selectExpandedAction,
  expandedActionAllowed,
  completedExpandedAction,
} from "./life.js";
import {
  communityDaily,
  communityMinute,
  supportedCare,
  rumorExchange,
  publishClaim,
  readPublicNews,
  laborAndSupplyEvents,
} from "./community.js";
import {
  installLeisureActions,
  marketActionAllowed,
  completeMarketAction,
  nativeAccess,
  completeNative,
  startMobility,
} from "./leisure.js";
import { observeSocial, decorateSocial, predict } from "./tom.js";
import { check, train } from "./percentile.js";
import { normalizeRomance } from "../romance.js";
import { rng } from "../random.js";
import { socialDestination } from "../social.js";
import { addFeeling } from "../cognition.js";
import { recordExperience } from "../wellbeing.js";
export {
  initializeExpansion,
  economicDraft,
  commitEconomy,
  refreshOwnResources,
};
export const installActions = (c) =>
  installLeisureActions(installExpandedActions(c));
export function actionAllowed(d, p, kind, placeId, time) {
  return !d
    ? !/^leisure_(expanded|market)_/.test(kind)
    : expandedActionAllowed(d, p, kind) &&
        !(kind === "eat" && !canEat(d, p, placeId, time)) &&
        marketActionAllowed(d, p, kind, time, placeId) &&
        nativeAccess(d, p, kind, time, placeId) &&
        !(
          kind === "work" &&
          (!d.contracts.has(p.id) ||
            p.state.economy.parentalCare ||
            (time / 3600) % 24 < 8 ||
            (time / 3600) % 24 >= 16 ||
            Math.floor(time / 86400) % 7 >= 5 ||
            (d.contracts.get(p.id).payload.workedByDay[
              Math.floor(time / 86400)
            ] || 0) >=
              d.contracts.get(p.id).payload.hoursPerDay * 3600)
        );
}
export function expandedMinute(d, time, emit) {
  if (!d) return;
  d.emit = emit;
  communityDaily(d, time, emit);
  economicMinute(d, time, emit);
  laborAndSupplyEvents(d, time, emit);
  lifeDaily(d, time, emit);
  housingDaily(d, time, emit);
  propertyMaintenance(d, time, emit);
  communityMinute(d, time, emit);
  adultServicesMinute(d, time, emit);
  for (const p of d.people.values()) {
    normalizeRomance(p);
    const threat = p.state.economy.threats.find(
      (t) => t.kind === "cash_shortfall" || t.kind === "health_pressure",
    );
    if (threat && p.state.economy.lastWorryAt + 3600 < time) {
      p.state.economy.lastWorryAt = time;
      addFeeling(p, "doubt", Math.min(0.45, threat.probability * 0.4), time, {
        kind: "own_grounded_threat",
        text: "Meine belegte Lage braucht einen nächsten Schritt.",
        evidence_id: threat.sourceEventId || null,
      });
    }
    p.state.economy.lastWorryAt ??= time;
  }
}
export function expandedDestination(d, p, time) {
  if (!d) return null;
  const hour = (time / 3600) % 24;
  const children = householdOf(d, p)
    .payload.members.map((id) => d.people.get(id))
    .filter(
      (q) =>
        q.age < 3 &&
        q.profile.family.parent_ids.includes(p.id) &&
        q.state.location_id &&
        Object.values(p.profile.home).includes(q.state.location_id),
    );
  const child = children.sort(
    (a, b) =>
      Math.max(...Object.values(b.state.needs)) -
      Math.max(...Object.values(a.state.needs)),
  )[0];
  if (
    p.age >= 18 &&
    child &&
    Math.max(
      child.state.needs.hunger,
      child.state.needs.thirst,
      child.state.needs.hygiene,
      child.state.needs.bladder,
      child.state.needs.social,
      child.state.needs.fun,
      child.state.needs.comfort,
    ) > 0.45 &&
    p.state.needs.fatigue < 0.85
  ) {
    p.state.economy.infantCareTargetId = child.id;
    return child.state.location_id;
  }
  delete p.state.economy.infantCareTargetId;
  if (hour < 7 || hour >= 22) return null;
  const contract = d.contracts.get(p.id);
  if (
    p.age >= 18 &&
    contract &&
    !p.state.economy.parentalCare &&
    !contract.payload.holiday &&
    Math.floor(time / 86400) % 7 < 5 &&
    hour >= 8 &&
    hour < 16
  )
    return null;
  if (
    p.age >= 3 &&
    p.age < 18 &&
    isHoliday(d, time) &&
    hour >= 8 &&
    hour < 14
  ) {
    return contract?.payload.holiday &&
      p.state.economy.guardianPermission &&
      hour >= 10
      ? d.firms.get(contract.payload.firmId).payload.workplaceId
      : p.profile.home.living;
  }
  if (
    p.age < 18 &&
    p.profile.workplace_id &&
    Math.floor(time / 86400) % 7 < 5 &&
    hour >= 8 &&
    hour < 14
  )
    return null;
  const plan = d.entities.get(p.state.economy.health.supportPlanId);
  if (
    plan?.payload.status === "active" &&
    time >= plan.payload.nextAt &&
    hour >= 9 &&
    hour < 18
  ) {
    p.state.economy.supportDue = true;
    return plan.payload.locationId;
  }
  if (p.state.economy.foodShortage && p.state.needs.hunger > 0.7)
    return ["basic", "standard", "premium"].some(
      (k) => householdOf(d, p).payload.food[k] > 0,
    )
      ? p.profile.home.kitchen
      : d.calendar.payload.venues.shelter.rooms[1];
  if (socialDestination(d.town, p, time)) return null;
  const task = rows(d, "obligation").find(
    (o) =>
      o.payload.assigneeId === p.id &&
      o.payload.status === "accepted" &&
      !(o.payload.nextAttemptAt > time),
  );
  if (task && hour >= 15 && hour < 20) return task.payload.destinationId;
  if (p.age >= 18 && p.state.economy.criminalRole && hour >= 18 && hour < 20)
    return hour < 19
      ? d.calendar.payload.venues.industrial.rooms[0]
      : d.calendar.payload.venues.cafe.rooms[0];
  return null;
}
export function chooseExpandedAction(d, p, time) {
  if (!d) return null;
  const plan = d.entities.get(p.state.economy.health.supportPlanId);
  if (
    plan?.payload.status === "active" &&
    time >= plan.payload.nextAt &&
    p.state.location_id === plan.payload.locationId
  )
    return "leisure_expanded_supported_care";
  return selectExpandedAction(d, p, time);
}
export function expandedDuration(d, p, kind, defaultDuration) {
  if (kind === "leisure_expanded_obligation")
    return (
      d.entities.get(p.state.economy.activeObligationId)?.payload
        .durationSeconds || defaultDuration
    );
  return defaultDuration;
}
export function completeExpanded(d, p, event, duration) {
  if (!d) return { ok: true };
  const kind = event.facts.action;
  if (kind === "leisure_expanded_infant_care") {
    const child = d.people.get(p.state.economy.infantCareTargetId);
    if (
      p.age < 18 ||
      !child ||
      child.age >= 3 ||
      !child.profile.family.parent_ids.includes(p.id) ||
      child.state.location_id !== p.state.location_id
    )
      return { ok: false };
    event.participants.push(child.id);
    event.facts.care = { targetId: child.id, actualDurationSeconds: duration };
    if (child.state.needs.hunger > 0.45) {
      const fed = consumeFood(d, child, event, event.end);
      event.facts.care.fed = fed;
      if (fed)
        child.state.needs.hunger = Math.max(0, child.state.needs.hunger - 0.6);
      else p.state.economy.foodShortage = true;
    }
    child.state.needs.thirst = Math.max(0, child.state.needs.thirst - 0.5);
    child.state.needs.bladder = Math.max(0, child.state.needs.bladder - 0.5);
    child.state.needs.hygiene = Math.max(0, child.state.needs.hygiene - 0.4);
    for (const key of ["social", "comfort", "fun"])
      child.state.needs[key] = Math.max(0, child.state.needs[key] - 0.3);
    child.state.thought = "Meine Bezugsperson kümmert sich gerade um mich.";
    event.description =
      p.name +
      " nimmt sich tatsächlich Zeit für " +
      child.name +
      ": Nähe, Trinken und altersgerechte Versorgung" +
      (event.facts.care.fed
        ? " mit einer realen Mahlzeit"
        : event.facts.care.fed === false
          ? "; für die Mahlzeit werden noch Lebensmittel benötigt"
          : "") +
      ".";
    train(p, "care", duration, event, event.end);
    recordExperience(
      child,
      event,
      event.end,
      "received_care",
      { P: 0.004, R: 0.01, M: 0.003 },
      "Tatsächlich von der eigenen Bezugsperson versorgt.",
    );
    return { ok: true };
  }
  if (kind === "eat") return { ok: consumeFood(d, p, event, event.end) };
  if (kind === "leisure_expanded_supported_care")
    return { ok: supportedCare(d, p, event, duration) };
  if (kind.startsWith("leisure_market_"))
    return { ok: completeMarketAction(d, p, event, duration) };
  if (kind === "leisure_expanded_holiday_work")
    return { ok: accrueWork(d, p, event, duration) };
  if (kind.startsWith("leisure_expanded_")) {
    const result = completedExpandedAction(d, p, event, duration, event.end);
    if (result?.failed) return { ok: false };
    if (event.facts.professionalWork) accrueWork(d, p, event, duration);
    if (event.facts.obligation?.progress === 1)
      recordExperience(
        p,
        event,
        event.end,
        "obligation",
        { E: 0.008, M: 0.006, A: 0.012 },
        "Eine freiwillig angenommene Aufgabe wurde wirklich abgeschlossen.",
      );
    return { ok: true, ...result };
  }
  if (!completeNative(d, p, event, duration)) return { ok: false };
  readPublicNews(d, p, event);
  if (
    kind === "school_day" &&
    p.age >= 6 &&
    p.age < 18 &&
    p.state.economy.lastHomeworkDay !== Math.floor(event.end / 86400)
  ) {
    p.state.economy.lastHomeworkDay = Math.floor(event.end / 86400);
    p.state.economy.schoolworkToday = { sourceEventId: event.id, progress: 0 };
    assignObligation(
      d,
      p,
      DUTIES.find((r) => r.id === "A031"),
      event.end,
      d.emit,
    );
  }
  if (kind === "work") {
    const contract = d.contracts.get(p.id);
    if (!contract) return { ok: false };
    check(p, event, {
      skill: contract.payload.skill,
      attribute: "reasoning",
      seed: d.town.world.seed,
    });
    return { ok: accrueWork(d, p, event, duration) };
  }
  if (kind === "leisure_expanded_holiday_work")
    return { ok: accrueWork(d, p, event, duration) };
  return { ok: true };
}
export function finalizedSocial(d, town, event) {
  if (!d) return;
  decorateSocial(d, town, event);
  const [a, b] = event.participants.map((id) => town.byId.get(id));
  if (!a || !b) return;
  for (const [p, o] of [
    [a, b],
    [b, a],
  ]) {
    const skill = ["argue", "set_boundary"].includes(event.facts.category)
      ? "resolve"
      : ["persuade", "ask_favor"].includes(event.facts.category)
        ? "persuasion"
        : "empathy";
    check(p, event, {
      skill,
      attribute: "presence",
      social: true,
      seed: town.world.seed,
    });
    observeSocial(d, town, p, o, event);
  }
  for (const id of event.witnesses || []) {
    const p = town.byId.get(id);
    if (p) observeSocial(d, town, p, a, event, { witness: true });
  }
  rumorExchange(d, a, b, event);
  if (
    event.facts.category === "invite_to_dinner" &&
    event.facts.outcome === "accepted"
  ) {
    a.state.economy.hostingPlan = {
      guestId: b.id,
      sourceEventId: event.id,
      expiresAt: event.end + 86400,
    };
    b.state.goal = {
      kind: "relax",
      destination: a.profile.home.living,
      expires: event.end + 4 * 3600,
      reason:
        "Ich habe die Einladung freiwillig angenommen und gehe über vorhandene Wege dorthin.",
      source: "accepted_invitation",
    };
  }
  // Material help requires an actual request, known trust, willingness, and
  // a bounded gift from an adult's own available balance. W100 never consents.
  if (
    event.facts.category === "ask_help" &&
    event.facts.outcome === "accepted" &&
    a.age >= 18 &&
    b.age >= 18 &&
    a.state.economy.foodShortage &&
    b.relations[a.id]?.trust > 0.5 &&
    balance(d, ownAccount(d, b)) > 200000
  ) {
    const amount = 1500,
      r = transfer(d, ownAccount(d, b), ownAccount(d, a), amount, {
        key: { kind: "accepted_material_help", eventId: event.id },
        at: event.end,
        eventId: event.id,
        kind: "voluntary_gift",
      });
    if (r.ok) {
      event.facts.actualGiftCents = amount;
      event.description +=
        " Die angenommene Hilfe umfasst tatsächlich 15 € für die Versorgung.";
    }
  }
}
export async function upgradeExpanded(loadTown) {
  const pending = db
    .prepare(
      "SELECT world_id FROM lw_worlds WHERE coalesce(json_extract(rules,'$.expandedVersion'),0)<?",
    )
    .all(EXPANDED_VERSION);
  if (!pending.length) return { worlds: 0 };
  const backup = path.join(
    path.dirname(db.name),
    "before-expanded-" + Date.now() + ".db",
  );
  await db.backup(backup);
  const results = db.transaction(() =>
    pending.map((row) => initializeExpansion(loadTown(row.world_id))),
  )();
  return { worlds: results.length, backup };
}

export function prepareSocialProposal(d, town, event) {
  if (!d) return;
  const [a, b] = event.participants.map((id) => town.byId.get(id));
  if (!a || !b) return;
  event.facts.anticipatedViews = Object.fromEntries(
    [
      [a, b],
      [b, a],
    ].map(([p, o]) => {
      const view = predict(p, o, town, event);
      return [
        p.id,
        {
          probabilities: view.probabilities,
          thought: view.thought,
          sourceRefs: view.sourceRefs,
          perspective: "own uncertain expectation before response",
        },
      ];
    }),
  );
}

export function packMeal(d, p, from, destination, time, emit) {
  if (
    !d ||
    !Object.values(p.profile.home).includes(from) ||
    Object.values(p.profile.home).includes(destination) ||
    (p.state.economy.carriedFood?.portions || 0) > 0
  )
    return;
  const h = householdOf(d, p),
    tier = ["standard", "basic", "premium"].find((k) => h.payload.food[k] >= 1);
  if (!tier) return;
  h.payload.food[tier]--;
  touch(d, h);
  const e = emit("packed_meal", p, time, {
    householdId: h.id,
    tier,
    portions: 1,
    private: true,
  });
  e.description =
    p.name +
    " nimmt eine tatsächlich vorhandene Portion für den Weg zur Schule, Arbeit oder zum Ausflug mit.";
  p.state.economy.carriedFood = {
    tier,
    portions: 1,
    packedAt: time,
    sourceEventId: e.id,
  };
}

function canEat(d, p, placeId, time) {
  const carry = p.state.economy.carriedFood;
  if (carry?.portions > 0 && time - carry.packedAt < 86400) return true;
  const h = householdOf(d, p);
  if (
    Object.values(p.profile.home).includes(placeId) &&
    (["basic", "standard", "premium"].some((k) => h.payload.food[k] > 0) ||
      householdSpendable(d, h) >= d.market.payload.offers.basic.priceCents)
  )
    return true;
  if (
    Object.values(d.calendar.payload.venues.shelter.rooms).includes(placeId) &&
    balance(d, fundsOf(d).social) >= 250
  )
    return true;
  return (
    d.town.places.get(placeId)?.purpose.includes("cafe") &&
    balance(d, ownAccount(d, p)) >= 500
  );
}

export function foodDestination(d, p, time, fallback) {
  if (!d || canEat(d, p, fallback, time)) return fallback;
  p.state.economy.foodShortage = true;
  const h = householdOf(d, p);
  if (
    ["basic", "standard", "premium"].some((k) => h.payload.food[k] > 0) ||
    householdSpendable(d, h) >= d.market.payload.offers.basic.priceCents
  )
    return p.profile.home.kitchen;
  return p.age >= 18 && balance(d, fundsOf(d).social) >= 250
    ? d.calendar.payload.venues.shelter.rooms[1]
    : p.profile.home.kitchen;
}
export { startMobility };
