// Extend the current town without reseeding existing accounts, contracts or
// memories. New residents receive explicitly initialized current resources.
import { initializeEducation } from "./education.js";
import { db, j, uid } from "../../db.js";
import { rng } from "../random.js";
import { economicDraft } from "./economy.js";
import { account, put, touch, transfer, commitEconomy, rows } from "./store.js";
import { JOBS, calendarDate } from "./catalog.js";
import { prepareCapabilities } from "./percentile.js";
export function initializeNewPopulation(town) {
  const newcomers = town.people.filter((p) => !p.state.economy);
  if (!newcomers.length) return;
  const d = economicDraft(town);
  if (!d) throw new Error("Economic town not initialized");
  initializeEducation(town);
  const time = town.world.seconds,
    event = {
      id: uid("le_"),
      world_id: d.worldId,
      start: time,
      end: time,
      location_id: null,
      type: "initialization_resources",
      participants: newcomers.map((p) => p.id),
      facts: { coverage: "initialized_current_resources", newPopulation: true },
      description:
        "Neu hinzugezogene Sims erhalten ausdrücklich angelegte aktuelle Konten, Wohnverträge und Fähigkeiten. Die bestehenden Haushalte und Ereignisse bleiben erhalten.",
      source: "expanded_initialization",
    },
    funds = d.calendar.payload.funds,
    opening = (a, amount) => {
      transfer(d, funds.external, a.id, amount, {
        key: { kind: "newcomer_opening", accountId: a.id },
        at: time,
        eventId: event.id,
        kind: "initial_endowment",
      });
      return a.id;
    },
    group = new Map();
  for (const p of newcomers) {
    if (!group.has(p.household_id)) group.set(p.household_id, []);
    group.get(p.household_id).push(p);
  }
  const housing = rows(d, "institution").find(
    (i) => i.payload.key === "housing",
  );
  for (const [originalId, members] of group) {
    const adults = members.filter((p) => p.age >= 18),
      guardian = adults[0] || members[0],
      draw = rng(town.world.seed + ":new-household:" + originalId),
      stratum = draw() < 0.12 ? "financially_struggling" : "middle",
      joint = account(d, "household", null, {
        metadata: { name: "Gemeinsames Haushaltskonto" },
      }),
      h = put(d, "household", {
        originalId,
        members: members.map((p) => p.id),
        jointAccountId: joint.id,
        sharedBy: adults.map((p) => p.id),
        propertyId: null,
        leaseId: null,
        stratum,
        food: {
          basic: members.length * 4,
          standard: members.length * 2,
          premium: 0,
          lastStockDay: Math.floor(time / 86400),
        },
        housingStatus: "housed",
        budget: {
          utilities: 11000 + members.length * 2800,
          foodTarget: members.length * 18000,
          subscriptions: 0,
          irregularReserve: 5000,
        },
        forecasts: {},
        lastShoppingDay: -1,
        goals: [{ kind: "emergency_fund", targetCents: 250000, progress: 0 }],
      });
    joint.owner_id = h.id;
    opening(joint, members.length * (stratum === "middle" ? 35000 : 2000));
    const building = town.places.get(guardian.profile.home.living).parent_id,
      rent = 40000 + members.length * 9000,
      property = put(
        d,
        "property",
        {
          buildingId: building,
          rooms: { ...guardian.profile.home },
          capacity: members.length + 2,
          rentCents: rent,
          valueCents: rent * 240,
          ownerId: housing.id,
          residents: [h.id],
          condition: 0.75,
          listed: false,
          mortgageId: null,
        },
        { ownerId: housing.id },
      ),
      lease = put(
        d,
        "lease",
        {
          propertyId: property.id,
          householdId: h.id,
          landlordId: housing.id,
          rentCents: rent,
          depositCents: rent * 2,
          depositHeldCents: 0,
          status: "active",
          startedAt: time,
          nextDueMonth: null,
          arrearsCents: 0,
          missedMonths: 0,
          evictionStage: "none",
          noticeAt: null,
        },
        { ownerId: h.id },
      );
    h.payload.propertyId = property.id;
    h.payload.leaseId = lease.id;
    touch(d, h);
    for (const p of members) {
      prepareCapabilities(p, town.world.seed);
      const own = account(d, "personal", p.id, {
        metadata: { name: p.name + " · privat" },
      });
      opening(
        own,
        p.age >= 18
          ? stratum === "middle"
            ? 500000 + Math.round(draw() * 1500000)
            : 5000 + Math.round(draw() * 20000)
          : p.age < 3
            ? 0
            : Math.round(draw() * 12000),
      );
      p.state.economy = {
        version: 1,
        householdId: h.id,
        personalAccountId: own.id,
        employmentId: null,
        pendingGrossCents: 0,
        paidWorkSeconds: 0,
        earnedYear: {},
        monthlyFlows: {},
        expectations: {
          minimumNetCents:
            p.age < 18
              ? 15000
              : Math.max(
                  85000,
                  Math.round(
                    (rent +
                      h.payload.budget.utilities +
                      h.payload.budget.foodTarget) /
                      Math.max(1, adults.length),
                  ),
                ),
          preferredSkill: p.state.career?.skill || "analysis",
          maxCommuteSeconds: 3600,
        },
        threats: [],
        reputation: {
          helpfulness: 0.5,
          reliability: 0.5,
          visibleStatus: 0,
          recognition: 0,
        },
        health: { version: 1, substances: {}, supportPlanId: null },
        knownClaims: [],
        lastJobSearch: -1,
        privacy: {
          shareIncomeWithHousehold: p.age >= 18,
          bankBalancePrivate: true,
        },
        guardianPermission: false,
        subscriptions: [],
        goalEvidence: [],
      };
      p.state.social_cognition = { version: 1, contacts: {}, metabeliefs: {} };
      const date = calendarDate(time),
        month = Math.floor(draw() * 12),
        day = 1 + Math.floor(draw() * 28),
        notYet =
          month > date.getUTCMonth() ||
          (month === date.getUTCMonth() && day > date.getUTCDate());
      p.profile.birthDate = new Date(
        Date.UTC(date.getUTCFullYear() - p.age - (notYet ? 1 : 0), month, day),
      )
        .toISOString()
        .slice(0, 10);
      if (
        p.age >= 18 &&
        !["Retired", "Student", "Unemployed"].includes(p.profile.job)
      ) {
        const requested = JOBS[p.profile.job] ? p.profile.job : "Office analyst",
          role = d.calendar.payload.venues[JOBS[requested].venue] ? requested : JOBS[requested].family || "Office analyst",
          spec = JOBS[role],
          firm = rows(d, "firm").find((f) => f.payload.role === role) || rows(d,"firm").find(f=>f.payload.role===(JOBS[role].family||"Office analyst")),
          venue = d.calendar.payload.venues[spec.venue],
          contract = put(
            d,
            "employment",
            {
              simId: p.id,
              firmId: firm.id,
              job: role,
              grossMonthlyCents: spec.gross,
              skill: spec.skill,
              status: "active",
              hoursPerDay: 8,
              daysPerWeek: 5,
              startedAt: time,
              origin: "initialized_newcomer_contract",
              pendingGrossCents: 0,
              workRemainder: 0,
              workedByDay: {},
              lastPaidMonth: null,
              holiday: false,
            },
            { ownerId: p.id },
          );
        p.state.economy.employmentId = contract.id;
        p.profile.job = role;
        p.profile.workplace_id = firm.payload.workplaceId;
        p.profile.facility = {
          buildingId: venue.building,
          rooms: { hall: firm.payload.workplaceId, wc: venue.bath },
          economicWorkplace: true,
        };
        p.state.career = { ...p.state.career, job: role, skill: spec.skill,task:"Carry out "+role.toLowerCase()+" duties" };
        p.state.skills[spec.skill]=Math.max(p.state.skills[spec.skill]||0,spec.minimum);
        if(spec.credential&&!p.state.credentials.includes(spec.credential))p.state.credentials.push(spec.credential);
        firm.payload.capacity++;
        touch(d, firm);
      }
      db.prepare("UPDATE lw_sims SET profile=?,state=? WHERE id=?").run(
        j(p.profile),
        j(p.state),
        p.id,
      );
    }
  }
  for (const key of ["city", "region", "health", "social", "bank"]) {
    const inst = rows(d, "institution").find((i) => i.payload.key === key),
      per = {
        city: 250000,
        region: 300000,
        health: 120000,
        social: 150000,
        bank: 250000,
      }[key];
    transfer(
      d,
      funds.external,
      inst.payload.accountId,
      newcomers.length * per,
      {
        key: {
          kind: "new_population_public_capital",
          institutionId: inst.id,
          eventId: event.id,
        },
        at: time,
        eventId: event.id,
        kind: "declared_initial_service_capital",
      },
    );
    if (key === "city") inst.payload.reserve += newcomers.length * 90000;
    if (inst.payload.monthlyGrant)
      inst.payload.monthlyGrant =
        town.people.length * { city: 42000, region: 60000, health: 22000 }[key];
    touch(d, inst);
  }
  db.prepare("INSERT INTO lw_events VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
    event.id,
    event.world_id,
    null,
    time,
    time,
    null,
    event.type,
    j(event.participants),
    j(event.facts),
    event.description,
    event.source,
  );
  for (const p of newcomers)
    db.prepare("INSERT INTO lw_journal VALUES (?,?,?,?,?,?,?)").run(
      p.id,
      event.id,
      time,
      "initialization",
      event.description,
      "Aktueller Ausgangszustand; keine erfundenen historischen Geldflüsse.",
      1,
    );
  commitEconomy(d);
}
