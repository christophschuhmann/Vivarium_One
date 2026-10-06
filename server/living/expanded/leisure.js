import { ACTIVITIES, ITEMS } from "./catalog.js";
import { rows, put, touch, balance, post } from "./store.js";
import {
  ownAccount,
  fundsOf,
  householdOf,
  householdForecast,
  flow,
} from "./economy.js";
import { train, check } from "./percentile.js";
const locationKey = {
  walk: "garden",
  park_play: "garden",
  garden: "garden",
  home_game: "home",
  home_meal: "home",
  invite_dinner: "home",
  library: "employment",
  coffee: "cafe",
  cafe_food: "cafe",
  takeaway: "cafe",
  restaurant: "cafe",
  cinema: "cinema",
  swim: "pool",
  gym_dropin: "gym",
  gym_member: "gym",
  sports_club: "gym",
  music_lesson: "campus",
  museum: "campus",
  concert: "campus",
  craft: "studio",
  gaming: "home",
  bike: "garden",
  bus: "employment",
  transit_pass: "employment",
  car_trip: "garden",
  weekend_trip: "garden",
  charity: "shelter",
  course: "employment",
  haircut: "shop",
  birthday: "home",
  repair_service: "workshop",
  therapy: "support",
};
const field = (id) =>
  /music|concert/.test(id)
    ? "music"
    : /gym|sport|swim|bike|jog/.test(id)
      ? "fitness"
      : /craft|repair/.test(id)
        ? "craft"
        : /course|library|gaming/.test(id)
          ? "analysis"
          : "service";
const ownerItem = (d, p, re) =>
  d.items.find(
    (i) =>
      ((i.payload.ownerId === p.id && !i.payload.loanedTo) ||
        i.payload.loanedTo === p.id) &&
      !i.payload.stolen &&
      i.payload.condition > 0.1 &&
      re.test(i.payload.catalogId),
  );
export function installLeisureActions(catalog) {
  for (const a of ACTIVITIES) {
    if (/member|pass|club|^therapy$|^bus$|^car_trip$|^weekend_trip$/.test(a.id))
      continue;
    catalog.actions["leisure_market_" + a.id] = {
      label: a.name,
      thought: "Ich nehme mir Zeit für " + a.name + ".",
      object_kinds: [],
      duration: 1800,
      relief: { fun: 0.18, comfort: 0.1 },
    };
  }
  return catalog;
}
export function leisureDestination(d, p, id) {
  if (
    ["birthday", "gaming", "home_game", "home_meal", "invite_dinner"].includes(
      id,
    )
  )
    return p.profile.home.living;
  const key =
    locationKey[id] ||
    (/park|outdoor|run|walk/.test(id)
      ? "garden"
      : /library/.test(id)
        ? "employment"
        : "cafe");
  return d.calendar.payload.venues[key]?.rooms[0] || p.profile.home.living;
}
export function leisureAccess(d, p, id, time) {
  const spec = ACTIVITIES.find((a) => a.id === id);
  if (!spec) return { ok: false, reason: "Unbekanntes Angebot" };
  if ((time / 3600) % 24 < 7 || (time / 3600) % 24 >= 22)
    return { ok: false, reason: "Außerhalb der Öffnungszeit" };
  if (p.age < 6)
    return {
      ok: false,
      reason: "Freizeit für kleine Kinder erfolgt mit Bezugspersonen",
    };
  if (p.age < 12 && /bus|bike|weekend_trip/.test(id))
    return {
      ok: false,
      reason: "Begleiteter Ausflug mit Bezugsperson erforderlich",
    };
  if (
    p.age < 18 &&
    /date|car|repair_service|weekend_trip|gym_member|sports_club|transit_pass/.test(
      id,
    )
  )
    return { ok: false, reason: "Erwachsenenangebot" };
  if (/gaming/.test(id) && !ownerItem(d, p, /laptop|gaming_pc|console/))
    return {
      ok: false,
      reason: "Ein nutzbarer eigener oder geliehener Rechner fehlt",
    };
  if (id === "bike" && !ownerItem(d, p, /bike/))
    return { ok: false, reason: "Kein zugängliches fahrtüchtiges Rad" };
  if (
    id === "car_trip" &&
    (!ownerItem(d, p, /car/) ||
      !p.state.credentials.includes("driving_license"))
  )
    return {
      ok: false,
      reason: "Fahrberechtigung und Fahrzeugzugang erforderlich",
    };
  if (
    id === "invite_dinner" &&
    (!p.state.economy.hostingPlan ||
      p.state.economy.hostingPlan.expiresAt < time ||
      d.people.get(p.state.economy.hostingPlan.guestId)?.state.location_id !==
        p.state.location_id)
  )
    return {
      ok: false,
      reason:
        "Eine tatsächlich angenommene Einladung und anwesender Gast fehlen",
    };
  if (
    id === "home_meal" &&
    !["basic", "standard", "premium"].some(
      (k) => householdOf(d, p).payload.food[k] >= 1,
    )
  )
    return { ok: false, reason: "Kein tatsächlicher Haushaltsvorrat" };
  if (id === "birthday" && !p.state.birthdayToday)
    return {
      ok: false,
      reason: "Kein heutiger Geburtstag oder bestätigter Festplan",
    };
  if (
    id === "repair_service" &&
    !d.items.some(
      (i) => i.payload.ownerId === p.id && i.payload.condition < 0.65,
    )
  )
    return {
      ok: false,
      reason: "Kein tatsächlicher reparaturbedürftiger Gegenstand",
    };
  if (id === "therapy" && !p.state.economy.health.supportPlanId)
    return { ok: false, reason: "Beratungstermin noch nicht vereinbart" };
  if (
    id === "charity" &&
    !rows(d, "obligation").some(
      (o) => o.payload.targetId && o.payload.status === "accepted",
    )
  )
    return { ok: false, reason: "Noch kein konkret angenommener Hilfsbedarf" };
  const sub = rows(d, "subscription").find(
      (s) =>
        s.payload.simId === p.id &&
        s.payload.status === "active" &&
        (!s.payload.lastInvoiceId ||
          d.entities.get(s.payload.lastInvoiceId)?.payload.status === "paid") &&
        ((/gym/.test(id) && /gym/.test(s.payload.activityId)) ||
          (id === "bus" && s.payload.activityId === "transit_pass")),
    ),
    free =
      spec.minCents === 0 ||
      !!sub ||
      ["home_meal", "invite_dinner"].includes(id),
    cost = free ? 0 : Math.round((spec.minCents + spec.maxCents) / 2),
    reserve =
      p.age >= 18
        ? Math.min(
            50000,
            householdForecast(d, householdOf(d, p), time).fixedCents,
          )
        : 0;
  if (balance(d, ownAccount(d, p)) < cost + reserve && cost)
    return {
      ok: false,
      reason: "Nicht bezahlbar ohne die eigene Grundversorgung zu verdrängen",
      costCents: cost,
    };
  return {
    ok: true,
    costCents: cost,
    spec,
    subscriptionId: sub?.id || null,
    locationId: leisureDestination(d, p, id),
    free,
  };
}
export function marketActionAllowed(d, p, kind, time, placeId) {
  if (!kind.startsWith("leisure_market_")) return true;
  const access = leisureAccess(d, p, kind.slice(15), time);
  return access.ok && access.locationId === placeId;
}
export function completeMarketAction(d, p, event, duration) {
  const id = event.facts.action.slice(15),
    a = leisureAccess(d, p, id, event.end);
  if (!a.ok || a.locationId !== p.state.location_id) {
    event.facts.failure = a.reason || "Ort nicht erreicht";
    return false;
  }
  const seller =
    [...d.firms.values()].find(
      (f) => f.payload.workplaceId === p.state.location_id,
    ) || d.firms.get(d.market.payload.firmId);
  if (a.costCents) {
    const net = Math.round(a.costCents / 1.19),
      r = post(
        d,
        [
          { accountId: ownAccount(d, p), amount: -a.costCents },
          { accountId: seller.payload.accountId, amount: net },
          { accountId: fundsOf(d).region, amount: a.costCents - net },
        ],
        {
          key: { kind: "activity_fee", eventId: event.id },
          at: event.end,
          eventId: event.id,
          kind: "activity_fee",
          metadata: { activityId: id, vatCents: a.costCents - net },
        },
      );
    if (!r.ok) return false;
    flow(p, event.end, "activity", -a.costCents);
  }
  if (id === "home_meal" || id === "invite_dinner") {
    const h = householdOf(d, p),
      count = id === "invite_dinner" ? 2 : 1,
      tier = ["standard", "basic", "premium"].find(
        (k) => h.payload.food[k] >= count,
      );
    if (!tier) return false;
    h.payload.food[tier] -= count;
    touch(d, h);
    event.facts.food = { consumedPortions: count, tier, chargedAgain: false };
    p.state.needs.hunger = Math.max(0, p.state.needs.hunger - 0.55);
    if (count === 2) {
      const guest = d.people.get(p.state.economy.hostingPlan.guestId);
      guest.state.needs.hunger = Math.max(0, guest.state.needs.hunger - 0.55);
      event.participants.push(guest.id);
      event.facts.sharedMealActual = true;
    }
  }
  if (["coffee", "cafe_food", "takeaway", "restaurant"].includes(id)) {
    if (id !== "coffee")
      p.state.needs.hunger = Math.max(0, p.state.needs.hunger - 0.55);
    else p.state.needs.thirst = Math.max(0, p.state.needs.thirst - 0.15);
    event.facts.food = {
      served: true,
      consumedPortions: id === "coffee" ? 0 : 1,
      costCents: a.costCents,
    };
  }
  const skill = field(id);
  if (/course|lesson|craft|swim|gym|bike|gaming/.test(id)) {
    check(p, event, {
      skill,
      attribute: "coordination",
      seed: d.town.world.seed,
    });
    train(p, skill, duration, event, event.end);
  }
  if (id === "repair_service") {
    const item = d.items.find(
      (i) => i.payload.ownerId === p.id && i.payload.condition < 0.65,
    );
    item.payload.condition = 0.9;
    touch(d, item);
  }
  event.facts.activity = {
    id,
    name: a.spec.name,
    costCents: a.costCents,
    free: a.free,
    subscriptionId: a.subscriptionId,
    actualDurationSeconds: duration,
  };
  event.description =
    p.name +
    " nimmt sich tatsächlich Zeit für " +
    a.spec.name +
    (a.costCents
      ? " und bezahlt " + (a.costCents / 100).toFixed(2) + " €."
      : ". Der Zugang ist kostenlos.");
  return true;
}
export function planLeisure(d, p, id, time) {
  if (id === "therapy") {
    const plan = d.entities.get(p.state.economy.health.supportPlanId);
    if (!plan) return { ok: false, reason: "Zuerst Beratung vereinbaren" };
    p.state.goal = {
      kind: "leisure_expanded_supported_care",
      destination: plan.payload.locationId,
      expires: time + 86400,
      reason: "Ich nehme meinen vereinbarten Beratungstermin wahr.",
      source: "own_care_plan",
    };
    return { ok: true };
  }
  const a = leisureAccess(d, p, id, time);
  if (!a.ok) return a;
  if (["bus", "car_trip", "weekend_trip"].includes(id)) {
    p.state.economy.mobilityPlan = {
      activityId: id,
      destination: a.locationId,
      expiresAt: time + 4 * 3600,
    };
    p.state.goal = {
      kind: "relax",
      destination: a.locationId,
      expires: time + 4 * 3600,
      reason:
        "Ich plane eine tatsächliche Fahrt auf einer vorhandenen Verbindung.",
      source: "own_mobility_plan",
    };
    return { ok: true, costCents: a.costCents, locationId: a.locationId };
  }
  p.state.goal = {
    kind: "leisure_market_" + id,
    destination: a.locationId,
    expires: time + 4 * 3600,
    reason: "Ich möchte " + a.spec.name + " wahrnehmen.",
    source: "own_leisure_plan",
  };
  return { ok: true, costCents: a.costCents, locationId: a.locationId };
}
export function lendItem(
  d,
  p,
  item,
  target,
  time,
  emit,
  { gift = false, consent = false, targetConsent = false } = {},
) {
  if (
    !consent ||
    !targetConsent ||
    p.id === target?.id ||
    item.payload.ownerId !== p.id ||
    item.payload.stolen ||
    item.payload.loanedTo ||
    !target ||
    p.state.location_id !== target.state.location_id ||
    !p.relations[target.id] ||
    p.relations[target.id].trust < 0.4
  )
    return {
      ok: false,
      reason:
        "Zugänglicher eigener Gegenstand, tatsächlicher Kontakt und freiwilliges Vertrauen erforderlich",
    };
  if (
    target.age < 18 &&
    /car|business_tools|workstation/.test(item.payload.catalogId)
  )
    return { ok: false, reason: "Nicht altersgerechter Gegenstand" };
  const e = emit(
    gift ? "item_gift" : "item_loan",
    p,
    time,
    { itemId: item.id, targetId: target.id, private: true },
    [target.id],
  );
  if (gift) {
    item.payload.ownerId = target.id;
    item.owner_id = target.id;
  } else item.payload.loanedTo = target.id;
  item.payload.permissionEventId = e.id;
  item.payload.locationId = target.state.location_id;
  touch(d, item);
  e.description =
    p.name +
    (gift ? " schenkt " : " leiht ") +
    target.name +
    " " +
    ITEMS.find((s) => s.id === item.payload.catalogId)?.name +
    ". Der tatsächliche Zugang und die Zustimmung werden vermerkt.";
  return { ok: true };
}

export function returnItem(d, p, item, time, emit) {
  const owner = d.people.get(item.payload.ownerId);
  if (
    item.payload.loanedTo !== p.id ||
    !owner ||
    p.state.location_id !== owner.state.location_id
  )
    return {
      ok: false,
      reason:
        "Nur die ausleihende Person kann den Gegenstand bei tatsächlichem Kontakt zurückgeben",
    };
  const e = emit(
    "item_return",
    p,
    time,
    { itemId: item.id, ownerId: owner.id, private: true },
    [owner.id],
  );
  item.payload.loanedTo = null;
  item.payload.locationId = owner.state.location_id;
  item.payload.returnEventId = e.id;
  touch(d, item);
  e.description =
    p.name +
    " gibt den tatsächlich geliehenen Gegenstand an " +
    owner.name +
    " zurück.";
  return { ok: true };
}

const nativePaid = {
  leisure_work_out: "gym_dropin",
  leisure_swim: "swim",
  leisure_see_live_music: "concert",
  leisure_visit_museum: "museum",
};
export function nativeOffer(d, p, kind, placeId) {
  if (
    kind === "leisure_watch_movie" &&
    placeId === d.calendar.payload.venues.cinema.rooms[0]
  )
    return "cinema";
  return nativePaid[kind] || null;
}
export function nativeAccess(d, p, kind, time, placeId) {
  const id = nativeOffer(d, p, kind, placeId);
  if (!id) return true;
  const a = leisureAccess(d, p, id, time);
  return a.ok && a.locationId === placeId;
}
export function completeNative(d, p, event, duration) {
  const id = nativeOffer(d, p, event.facts.action, p.state.location_id);
  if (!id) return true;
  const original = event.facts.action;
  event.facts.action = "leisure_market_" + id;
  const ok = completeMarketAction(d, p, event, duration);
  event.facts.action = original;
  return ok;
}
export function startMobility(d, p, from, to, time, emit) {
  const plan = p.state.economy.mobilityPlan;
  if (!plan || plan.destination !== to || plan.expiresAt < time) return null;
  const a = leisureAccess(d, p, plan.activityId, time);
  if (!a.ok) {
    delete p.state.economy.mobilityPlan;
    return null;
  }
  const e = emit("transport_ticket", p, time, {
    activityId: plan.activityId,
    costCents: a.costCents,
    from,
    destination: to,
    private: true,
  });
  if (a.costCents) {
    const r = post(
      d,
      [
        { accountId: ownAccount(d, p), amount: -a.costCents },
        { accountId: fundsOf(d).external, amount: a.costCents },
      ],
      {
        key: { kind: "transport_ticket", eventId: e.id },
        at: time,
        eventId: e.id,
        kind: "transport",
      },
    );
    if (!r.ok) return null;
    flow(p, time, "transport", -a.costCents);
  }
  e.description =
    p.name +
    " beginnt eine tatsächlich geplante " +
    (plan.activityId === "bus" ? "Busfahrt" : "Fahrt") +
    " auf einer vorhandenen Verbindung" +
    (a.costCents ? " mit bezahltem Zugang." : " mit gültigem Zugang.");
  delete p.state.economy.mobilityPlan;
  return {
    kind:
      plan.activityId === "bus"
        ? "public_bus"
        : plan.activityId === "car_trip"
          ? "permitted_vehicle"
          : "public_transport",
    ticketEventId: e.id,
  };
}
