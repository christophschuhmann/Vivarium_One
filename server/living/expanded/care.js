// Support need is a fictional individualized state, never a diagnosis inferred
// for every older person. Family care requires adult agreement and actual shared
// presence/time. Professional service is explicitly funded external provision.
import { rng } from "../random.js";
import { calendarDate } from "./catalog.js";
import { put, rows, touch, balance, transfer, account } from "./store.js";
import {
  householdOf,
  ownAccount,
  fundsOf,
  newInvoice,
  payInvoice,
  consumeFood,
} from "./economy.js";
import { addFeeling } from "../cognition.js";
import { recordExperience } from "../wellbeing.js";
import { train } from "./percentile.js";
function separateResidentialHousehold(d, plan) {
  const p = d.people.get(plan.payload.simId);
  if (plan.payload.mode !== "residential") return;
  const old = householdOf(d, p),
    members = old.payload.members;
  if (members.length > 1) {
    const own = put(
      d,
      "household",
      {
        members: [p.id],
        sharedBy: [p.id],
        propertyId: null,
        leaseId: null,
        stratum: old.payload.stratum,
        food: {
          basic: 0,
          standard: 0,
          premium: 0,
          lastStockDay: Math.floor(d.town.world.seconds / 86400),
        },
        budget: { utilities: 0, foodTarget: 6000, irregularReserve: 0 },
        housingStatus: "residential_care",
        goals: [],
        origin: "agreed_residential_care_household",
      },
      { ownerId: p.id },
    );
    const joint = account(d, "household", own.id);
    own.payload.jointAccountId = joint.id;
    touch(d, own);
    d.households.set(own.id, own);
    old.payload.members = members.filter((id) => id !== p.id);
    old.payload.sharedBy = old.payload.sharedBy.filter((id) => id !== p.id);
    old.payload.budget.foodTarget = Math.round(
      (old.payload.budget.foodTarget * old.payload.members.length) /
        members.length,
    );
    touch(d, old);
    p.state.economy.householdId = own.id;
    plan.payload.householdId = own.id;
    plan.payload.previousHouseholdId = old.id;
    touch(d, plan);
  }
  p.household_id = p.state.careSupport.buildingId;
}
export function initializeCare(d) {
  const town = d.town,
    venue = d.calendar.payload.venues.carehome;
  if (!venue || d.calendar.payload.careVersion === 2) return;
  if (rows(d, "care_plan").length) {
    for (const plan of rows(d, "care_plan"))
      separateResidentialHousehold(d, plan);
    d.calendar.payload.careVersion = 2;
    touch(d, d.calendar);
    return;
  }
  const elderly = town.people
    .filter((p) => p.age >= 75 && p.biography_mode === "procedural")
    .sort(
      (a, b) =>
        rng(town.world.seed + ":care-choice:" + a.profile.seed_key)() -
        rng(town.world.seed + ":care-choice:" + b.profile.seed_key)(),
    );
  const selected = elderly.slice(
    0,
    Math.min(elderly.length, Math.max(3, Math.ceil(elderly.length * 0.3))),
  );
  for (const [i, p] of selected.entries()) {
    const homeMode = i % 3 !== 0,
      h = householdOf(d, p);
    let caregivers = [];
    if (homeMode) {
      const eligible = town.people.filter(
        (q) =>
          q.age >= 25 &&
          q.age < 66 &&
          q.biography_mode === "procedural" &&
          q.profile.family.partner_id !== p.id &&
          p.profile.family.partner_id !== q.id &&
          !(q.relations[p.id]?.attraction > 0.2) &&
          p.age - q.age >= 18 &&
          !q.state.economy.parentalCare &&
          !town.people.some(
            (child) =>
              child.age < 3 && child.profile.family.parent_ids.includes(q.id),
          ) &&
          !q.state.economy.elderCareTargets?.length,
      );
      const children = eligible.filter((q) =>
        q.profile.family.parent_ids.includes(p.id),
      );
      const candidate =
        children[0] ||
        eligible
          .filter((q) => (q.profile.family.parent_ids || []).length < 2)
          .sort(
            (a, b) =>
              Number(b.name.split(" ").at(-1) === p.name.split(" ").at(-1)) -
                Number(a.name.split(" ").at(-1) === p.name.split(" ").at(-1)) ||
              a.id.localeCompare(b.id),
          )[0];
      if (candidate) {
        caregivers = [candidate.id];
        if (!candidate.profile.family.parent_ids.includes(p.id)) {
          candidate.profile.family.parent_ids.push(p.id);
          candidate.profile.family.backgroundOrigin =
            "procedural_care_family_supplement";
        }
        for (const [a, b] of [
          [p, candidate],
          [candidate, p],
        ]) {
          a.relations[b.id] ||= {
            closeness: 0.6,
            trust: 0.65,
            tension: 0.08,
            attraction: 0,
            background: {
              contexts: ["Family"],
              origin: "procedural_current_family_background",
            },
          };
          a.relations[b.id].background ||= { contexts: [] };
          a.relations[b.id].background.contexts = [
            ...new Set(
              (a.relations[b.id].background.contexts || []).concat("Family"),
            ),
          ];
        }
        candidate.state.economy.elderCareTargets = (
          candidate.state.economy.elderCareTargets || []
        ).concat(p.id);
      }
    }
    const mode = caregivers.length ? "home_family" : "residential";
    const plan = put(
      d,
      "care_plan",
      {
        simId: p.id,
        householdId: h.id,
        mode,
        caregiverIds: caregivers,
        level: i % 3 === 0 ? "high" : "moderate",
        status: "active",
        consent: true,
        startedAt: town.world.seconds,
        origin: "initialized_current_support_agreement",
        monthlyCopayCents: mode === "residential" ? 60000 : 16000,
        monthlyInsuranceCents: mode === "residential" ? 180000 : 35000,
        lastServiceDay: -1,
        lastFamilyDay: -1,
        serviceCarry: 0,
        copayCarry: 0,
        locationId:
          mode === "residential" ? venue.rooms[0] : p.profile.home.living,
      },
      { ownerId: p.id },
    );
    p.state.careSupport = {
      planId: plan.id,
      level: plan.payload.level,
      mode,
      caregiverIds: caregivers,
      consent: true,
      monthlyCopayCents: plan.payload.monthlyCopayCents,
      buildingId:
        mode === "residential"
          ? venue.building
          : town.places.get(p.profile.home.living).parent_id,
    };
    if (mode === "residential") {
      plan.payload.previousHome = { ...p.profile.home };
      p.profile.home = {
        living: venue.rooms[0],
        kitchen: venue.rooms[1],
        bath: venue.bath,
        bed: venue.rooms[3],
      };
      p.state.goal = {
        kind: "relax",
        destination: venue.rooms[0],
        expires: town.world.seconds + 86400,
        reason:
          "Ich ziehe aufgrund einer bestätigten Vereinbarung ins Pflegeheim und gehe tatsächlich dorthin.",
        source: "approved_care_move",
      };
      if (h.payload.members.length === 1) {
        const lease = d.entities.get(h.payload.leaseId);
        if (lease) {
          lease.payload.status = "ended_for_care_move";
          lease.payload.endedAt = town.world.seconds;
          touch(d, lease);
        }
        h.payload.budget.utilities = 0;
        h.payload.budget.foodTarget = 0;
        h.payload.housingStatus = "residential_care";
        touch(d, h);
        const property = d.properties.get(h.payload.propertyId);
        if (property) {
          property.payload.residents = property.payload.residents.filter(
            (id) => id !== h.id,
          );
          property.payload.listed = false;
          property.payload.pendingVacancyHouseholdId = h.id;
          touch(d, property);
        }
      }
    }
  }
  for (const plan of rows(d, "care_plan"))
    separateResidentialHousehold(d, plan);
  d.calendar.payload.careVersion = 2;
  touch(d, d.calendar);
}
export function careDestination(d, p, time) {
  const hour = (time / 3600) % 24;
  if (p.state.careSupport?.level === "high")
    return hour >= 7 && hour < 21 ? p.profile.home.living : null;
  const targetIds = p.state.economy.elderCareTargets || [];
  delete p.state.economy.activeElderCareTargetId;
  if (
    hour < 17 ||
    hour >= 20 ||
    p.age < 18 ||
    p.state.needs.fatigue > 0.8 ||
    p.state.needs.hunger > 0.8
  )
    return null;
  for (const id of targetIds) {
    const target = d.people.get(id),
      plan = target && d.entities.get(target.state.careSupport?.planId);
    if (
      !plan ||
      plan.payload.lastFamilyDay === Math.floor(time / 86400) ||
      !plan.payload.consent ||
      !target.state.location_id ||
      ["sleep", "toilet", "shower"].includes(target.state.action?.kind)
    )
      continue;
    p.state.economy.activeElderCareTargetId = id;
    return target.state.location_id;
  }
  return null;
}
export function careAction(d, p, time) {
  const id = p.state.economy.activeElderCareTargetId,
    target = d.people.get(id),
    plan = target && d.entities.get(target.state.careSupport?.planId);
  return plan &&
    p.age >= 18 &&
    plan.payload.caregiverIds.includes(p.id) &&
    plan.payload.lastFamilyDay !== Math.floor(time / 86400) &&
    !["sleep", "toilet", "shower"].includes(target.state.action?.kind) &&
    target.state.location_id === p.state.location_id &&
    plan.payload.consent &&
    (time / 3600) % 24 >= 17 &&
    (time / 3600) % 24 < 20
    ? "leisure_expanded_elder_care"
    : null;
}
export function completeFamilyCare(d, p, event, duration) {
  const target = d.people.get(p.state.economy.activeElderCareTargetId),
    plan = target && d.entities.get(target.state.careSupport?.planId);
  if (
    p.age < 18 ||
    !plan ||
    !plan.payload.consent ||
    !plan.payload.caregiverIds.includes(p.id) ||
    p.state.location_id !== target.state.location_id ||
    ["sleep", "toilet", "shower"].includes(target.state.action?.kind)
  )
    return false;
  event.participants.push(target.id);
  event.facts.care = {
    targetId: target.id,
    actualDurationSeconds: duration,
    provider: "family",
  };
  const fed =
    target.state.needs.hunger > 0.5
      ? consumeFood(d, target, event, event.end)
      : false;
  if (fed)
    target.state.needs.hunger = Math.max(0, target.state.needs.hunger - 0.5);
  for (const key of ["social", "comfort", "hygiene"])
    target.state.needs[key] = Math.max(0, target.state.needs[key] - 0.22);
  plan.payload.lastFamilyDay = Math.floor(event.end / 86400);
  plan.payload.lastFamilyEventId = event.id;
  plan.payload.familyCareSeconds =
    (plan.payload.familyCareSeconds || 0) + duration;
  touch(d, plan);
  p.state.needs.fatigue = Math.min(1, p.state.needs.fatigue + 0.04);
  event.description = `${p.name} nimmt sich tatsächlich ${Math.round(duration / 60)} Minuten für ${target.name}: zuhören, im Alltag helfen und die gewünschte Unterstützung abstimmen${fed ? " sowie eine vorhandene Mahlzeit bereitstellen" : ""}.`;
  train(p, "care", duration, event, event.end);
  for (const [a, b] of [
    [p, target],
    [target, p],
  ]) {
    const r = a.relations[b.id];
    if (r) {
      r.closeness = Math.min(1, (r.closeness || 0.4) + 0.006);
      r.trust = Math.min(1, (r.trust || 0.4) + 0.003);
    }
    addFeeling(a, "affection", 0.27, event.end, {
      kind: "experienced_family_care",
      evidence_id: event.id,
      text: event.description,
    });
  }
  recordExperience(
    target,
    event,
    event.end,
    "received_elder_care",
    { P: 0.007, R: 0.012, M: 0.004 },
    "Gewünschte Unterstützung von einer tatsächlich anwesenden Bezugsperson erhalten.",
  );
  recordExperience(
    p,
    event,
    event.end,
    "given_elder_care",
    { R: 0.009, M: 0.009, E: 0.003 },
    "Tatsächlich betreut; sinnvolle Nähe kostet zugleich eigene Zeit und Kraft.",
  );
  return true;
}
export function careMinute(d, time, emit) {
  const hour = (time / 3600) % 24,
    day = Math.floor(time / 86400);
  for (const plan of rows(d, "care_plan")) {
    const x = plan.payload,
      p = d.people.get(x.simId);
    if (!p || x.status !== "active" || !x.consent) continue;
    if (
      hour < 13 ||
      hour >= 19 ||
      x.lastServiceDay === day ||
      !p.state.location_id ||
      !Object.values(p.profile.home).includes(p.state.location_id) ||
      ["toilet", "shower"].includes(p.state.action?.kind)
    )
      continue;
    const date = calendarDate(time),
      period = date.toISOString().slice(0, 7),
      days = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      ).getUTCDate();
    if (x.accrualMonth !== period) {
      x.accrualMonth = period;
      x.serviceCarry = 0;
      x.copayCarry = 0;
      touch(d, plan);
    }
    const insurance = Math.floor(
        (x.monthlyInsuranceCents + x.serviceCarry) / days,
      ),
      copay = Math.floor((x.monthlyCopayCents + x.copayCarry) / days);
    if (balance(d, fundsOf(d).health) < insurance) {
      if (x.lastDeferralDay !== day) {
        const ev = emit("care_service_waiting", p, time, {
          carePlanId: plan.id,
          private: true,
        });
        ev.description =
          p.name +
          " wartet auf die vereinbarte Pflegeleistung: Der zuständige Fonds muss die Finanzierung klären.";
        x.lastDeferralDay = day;
        touch(d, plan);
      }
      continue;
    }
    const ev = emit("professional_care_visit", p, time, {
      carePlanId: plan.id,
      provider: "declared_external_care_service",
      actualLocationId: p.state.location_id,
      insuranceCents: insurance,
      copayCents: copay,
      private: true,
    });
    if (
      !transfer(d, fundsOf(d).health, fundsOf(d).external, insurance, {
        key: { kind: "care_service", eventId: ev.id },
        at: time,
        eventId: ev.id,
        kind: "funded_care_service",
        metadata: { carePlanId: plan.id },
      }).ok
    )
      continue;
    const invoice = newInvoice(
      d,
      p,
      householdOf(d, p),
      "care_copayment",
      copay,
      fundsOf(d).external,
      time,
      emit,
      { carePlanId: plan.id, period: String(day) },
    );
    payInvoice(d, invoice, time, emit);
    x.serviceCarry = (x.monthlyInsuranceCents + x.serviceCarry) % days;
    x.copayCarry = (x.monthlyCopayCents + x.copayCarry) % days;
    x.lastServiceDay = day;
    x.lastServiceEventId = ev.id;
    touch(d, plan);
    // An explicitly financed provider brings an actual meal and assistance.
    // No fictional unseen Sim is teleported into the room or credited with wages.
    ev.facts.mealDelivered = true;
    ev.facts.mealPortions = 3;
    const household = householdOf(d, p);
    household.payload.food.basic += 2;
    household.payload.food.lastStockDay = day;
    touch(d, household);
    // One delivered portion is eaten now; two real portions remain for later
    // meals, so residential care does not leave a dependent resident fasting.
    for (const [key, amount] of [
      ["hunger", 0.55],
      ["thirst", 0.5],
      ["hygiene", 0.35],
      ["comfort", 0.25],
      ["social", 0.2],
    ])
      p.state.needs[key] = Math.max(0, p.state.needs[key] - amount);
    ev.description = `${p.name} erhält vor Ort eine vereinbarte, finanzierte Pflegeleistung mit einer gelieferten Mahlzeit und Alltagshilfe. Der externe Pflegedienst ist eine ausgewiesene Dienstleistung außerhalb der aktiven Sim-Bevölkerung.`;
    addFeeling(p, "relief", 0.3, time, {
      kind: "received_professional_care",
      evidence_id: ev.id,
      text: ev.description,
    });
    recordExperience(
      p,
      ev,
      time,
      "professional_care",
      { P: 0.007, R: 0.004 },
      "Eine tatsächlich finanzierte und vor Ort erbrachte Unterstützungsleistung.",
    );
  }
}
export function careView(d, p) {
  const plan = d.entities.get(p.state.careSupport?.planId);
  const given = (p.state.economy.elderCareTargets || [])
    .map((id) => d.people.get(id))
    .filter(Boolean)
    .map((q) => ({ id: q.id, name: q.name, locationId: q.state.location_id }));
  return {
    received: plan
      ? {
          ...plan.payload,
          id: plan.id,
          caregivers: plan.payload.caregiverIds.map((id) => ({
            id,
            name: d.people.get(id)?.name,
          })),
        }
      : null,
    given,
    note: "Unterstützungsstufen und Beiträge sind vereinfachte Spielregeln, keine amtlichen Pflegegrade. Ein Pflegebedarf lässt Fähigkeiten, Würde und eigene Wünsche bestehen.",
  };
}
