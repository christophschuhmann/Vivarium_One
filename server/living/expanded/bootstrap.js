// Add current, explicitly initialized resources. Never invent past paid wages,
// completed skills, witnessed crimes or secretly known financial information.
import { initializeEducation } from "./education.js";
import { initializeCare } from "./care.js";
import { economicDraft } from "./economy.js";
import { db, j, pj, uid } from "../../db.js";
import { rng } from "../random.js";
import { searchAssets } from "../library.js";
import {
  account,
  put,
  transfer,
  post,
  touch,
  commitEconomy,
  loadEconomy,
  EXPANDED_VERSION,
} from "./store.js";
import { JOBS, estimatedNet, calendarDate } from "./catalog.js";
import { prepareCapabilities } from "./percentile.js";
const venues = {
  hotel:["Maple Street Inn · fictional","small town hotel inn reception lobby",["Reception","Guest services"],["desk","table","sofa","shop_counter"]],
  carehome: ["Seniorenhaus Lindenblick", "nursing home senior care residential supportive", ["Wohnbereich", "Gemeinschaftsküche", "Pflegestützpunkt", "Bewohnerzimmer", "Garten"], ["sofa", "table", "desk", "bed", "fridge", "bookshelf", "sink"]],
  police: [
    "Polizeiwache",
    "police station civic safety",
    ["Empfang", "Einsatzbüro", "Besprechung"],
    ["desk", "fire_station", "bench"],
  ],
  office: [
    "Kontor am Markt",
    "office coworking business",
    ["Arbeitsraum", "Konferenzraum"],
    ["desk", "townhall_desk", "table"],
  ],
  workshop: [
    "Handwerkshof",
    "carpentry repair workshop industrial",
    ["Werkstatt", "Materialraum"],
    ["workbench", "desk", "table"],
  ],
  studio: [
    "Atelierhaus",
    "art studio illustration creative",
    ["Gemeinschaftsatelier", "Projektraum"],
    ["desk", "easel", "table"],
  ],
  shop: [
    "Stadtmarkt",
    "grocery supermarket shopping affordable",
    ["Markthalle", "Budgetmarkt", "Feinkost"],
    ["shop_counter", "fridge", "table"],
  ],
  gym: [
    "Bewegungshaus",
    "fitness gym training sport",
    ["Trainingsraum", "Kursraum"],
    ["gym_station", "desk", "bench"],
  ],
  pool: [
    "Stadtbad",
    "swimming pool indoor public",
    ["Schwimmhalle", "Umkleide"],
    ["pool_marker", "desk", "bench"],
  ],
  cinema: [
    "Lichtspielhaus",
    "cinema movie theater",
    ["Foyer", "Kinosaal"],
    ["sofa", "table", "shop_counter"],
  ],
  shelter: [
    "Brückenhaus",
    "homeless shelter social housing support",
    ["Beratung", "Gemeinschaftsküche", "Schlafraum"],
    ["bed", "fridge", "sink", "table", "sofa", "desk"],
  ],
  industrial: [
    "Alter Güterhof",
    "industrial warehouse abandoned exterior",
    ["Lagerhalle", "Industriehof", "Seitenpassage"],
    ["desk", "bench", "table"],
  ],
  support: [
    "Beratungszentrum",
    "community health support addiction counseling",
    ["Empfang", "Beratung", "Gruppenraum"],
    ["desk", "sofa", "table"],
  ],
  camp: [
    "Wiesenlager",
    "adult temporary homeless camp park outdoor shelter",
    ["Überdachter Treffpunkt", "Geschützte Schlafstelle"],
    ["bench", "bed", "table", "sink"],
  ],
  employment: [
    "Haus der Chancen",
    "employment job center training",
    ["Stellenberatung", "Lernwerkstatt"],
    ["desk", "bookshelf", "table"],
  ],
};
export function addExpandedPlaces(town) {
  const bennington=pj(town.world.rules,{}).scenario?.id==="bennington";
  const additions = [],
    city = [...town.places.values()].find((p) => p.kind === "city"),
    near =
      [...town.places.values()].find((p) => p.kind === "street") ||
      [...town.places.values()].find((p) => p.kind === "neighborhood");
  const edge = (from, to, seconds = 30) => {
    for (const [a, b] of [
      [from, to],
      [to, from],
    ]) {
      db.prepare("INSERT OR IGNORE INTO lw_edges VALUES (?,?,?,?)").run(
        town.world.world_id,
        a,
        b,
        seconds,
      );
      if (!town.graph.has(a)) town.graph.set(a, []);
      if (!town.graph.get(a).some((e) => e.id === b))
        town.graph.get(a).push({ id: b, seconds });
    }
  };
  const add = (
    id,
    parent,
    name,
    kind,
    purpose,
    affordances,
    capacity = 100,
    landmark = 0,
  ) => {
    if (town.places.has(id)) return town.places.get(id);
    const p = {
      id,
      world_id: town.world.world_id,
      parent_id: parent,
      name:bennington?englishPlaceName(name):name,
      kind,
      purpose,
      affordances,
      capacity,
      asset_id: searchAssets(purpose)[0]?.id || null,
      x: 0,
      y: 0,
      anchored: 0,
      landmark,
    };
    db.prepare("INSERT INTO lw_places VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      p.id,
      p.world_id,
      p.parent_id,
      p.name,
      p.kind,
      p.purpose,
      p.asset_id,
      p.x,
      p.y,
      p.capacity,
      p.anchored,
      p.landmark,
      j(p.affordances),
    );
    town.places.set(id, p);
    additions.push(p);
    return p;
  };
  const neighborhood = add(
    town.world.world_id + "_expanded_market_neighborhood",
    city.id,
    "Marktbogen",
    "neighborhood",
    "walkable town market neighborhood civic services community buildings",
    [],
    500,
  );
  const street = add(
    neighborhood.id + "_street",
    neighborhood.id,
    "Marktbogen · Ringstraße",
    "street",
    "town street shopping neighborhood connected civic services",
    [],
    500,
  );
  edge(near.id, street.id, 120);
  edge(neighborhood.id, street.id, 30);
  const result = {};
  for (const [key, [name, purpose, names, objects]] of Object.entries(venues)) {
    const building = add(
      town.world.world_id + "_expanded_" + key,
      street.id,
      name,
      "building",
      purpose,
      [],
      200,
      ["police", "shelter", "employment", "carehome"].includes(key) ? 1 : 0,
    );
    if (building.parent_id !== street.id) {
      building.parent_id = street.id;
      db.prepare("UPDATE lw_places SET parent_id=? WHERE id=?").run(
        street.id,
        building.id,
      );
    }
    edge(street.id, building.id, 30);
    result[key] = { building: building.id, rooms: {} };
    for (let i = 0; i < names.length; i++) {
      const p = add(
        building.id + "_room" + i,
        building.id,
        name + " · " + names[i],
        "room",
        purpose + " " + names[i],
        objects,
        key === "shelter" ? 80 : 150,
      );
      edge(building.id, p.id);
      result[key].rooms[i] = p.id;
    }
    const bath = add(
      building.id + "_bath",
      building.id,
      name + " · Toiletten",
      "room",
      "public bathroom restroom toilet",
      ["carehome", "shelter"].includes(key)?["toilet", "sink", "shower"]:["toilet", "sink"],
      4,
    );
    edge(building.id, bath.id);
    result[key].bath = bath.id;
  }
  for (const [key, pattern] of Object.entries({
    school: "Schule",
    library: "Bibliothek",
    daycare: "Kindergarten",
    campus: "Campus & Labor",
    townhall: "Rathaus",
    clinic: "Praxis",
    fire: "Feuerwache",
    garden: "Park",
    cafe: "Café & Läden",
    bakery: "Café & Läden",
  })) {
    const b = [...town.places.values()].find(
        (p) => p.kind === "building" && (p.id === town.world.world_id+"_l_"+({garden:"park",bakery:"cafe"}[key]||key) || p.name === pattern),
      ),
      main =
        b &&
        [...town.places.values()].find(
          (p) => p.parent_id === b.id && p.kind === "room",
        );
    if (b && main)
      result[key] = {
        building: b.id,
        rooms: { 0: main.id },
        bath: [...town.places.values()].find(
          (p) => p.parent_id === b.id && p.purpose.includes("bathroom"),
        )?.id,
      };
  }
  // Real vacancies: distinct dwelling units with rooms and graph paths.
  const homes = [...town.places.values()].filter(
    (p) => p.kind === "building" && p.purpose.includes("residential"),
  );
  const empty = [];
  for (let i = 0; i < Math.max(2, Math.ceil(homes.length * 0.06)); i++) {
    const house = add(
      town.world.world_id + "_vacancy_" + i,
      near.id,
      "Freie Wohnung · " + (i + 1),
      "building",
      "small residential family house exterior",
      [],
      6,
    );
    edge(near.id, house.id, 45);
    const rooms = {};
    for (const [key, name, purpose, objects] of [
      [
        "living",
        "Wohnzimmer",
        "cozy living room",
        ["sofa", "table", "desk", "bookshelf"],
      ],
      [
        "kitchen",
        "Küche",
        "family kitchen",
        ["fridge", "counter", "sink", "table"],
      ],
      ["bath", "Bad", "family bathroom", ["toilet", "shower", "sink"]],
      ["bed", "Schlafzimmer", "family bedroom", ["bed", "wardrobe", "desk"]],
    ]) {
      const p = add(
        house.id + "_" + key,
        house.id,
        name + " · Freie Wohnung " + (i + 1),
        "room",
        purpose,
        objects,
        key === "bath" ? 1 : 6,
      );
      edge(house.id, p.id, 15);
      rooms[key] = p.id;
    }
    empty.push({ buildingId: house.id, rooms });
  }
  return { venues: result, empty, additions };
}
export function initializeExpansion(town, { force = false } = {}) {
  if (!force && pj(town.world.rules, {}).expandedVersion === EXPANDED_VERSION)
    return null;
  const worldId = town.world.world_id,
    time = town.world.seconds,
    d = loadEconomy(worldId);
  if (d.accounts.size && pj(town.world.rules, {}).expandedVersion > 0) {
    const physical = addExpandedPlaces(town),
      calendar = [...d.entities.values()].find((e) => e.kind === "calendar");
    if (!calendar) throw new Error("Incomplete economic calendar");
    calendar.payload.venues = {
      ...calendar.payload.venues,
      ...physical.venues,
    };
    calendar.payload.version = EXPANDED_VERSION;
    touch(d, calendar);
    const eventId = uid("le_");
    for (const baby of town.people.filter((p) => p.age < 3)) {
      const caregiver = town.byId.get(baby.profile.family.parent_ids[0]),
        contract = d.entities.get(caregiver?.state.economy.employmentId);
      if (
        caregiver &&
        contract?.payload.status === "active" &&
        !caregiver.state.economy.parentalCare
      ) {
        caregiver.state.economy.parentalCare = {
          childId: baby.id,
          benefitCents: Math.min(
            180000,
            Math.max(
              90000,
              Math.round(
                estimatedNet(contract.payload.grossMonthlyCents) * 0.65,
              ),
            ),
          ),
          origin: "approved_current_care_extension",
          sourceEventId: eventId,
        };
        contract.payload.leave = "parental_care";
        touch(d, contract);
        db.prepare("UPDATE lw_sims SET state=? WHERE id=?").run(
          j(caregiver.state),
          caregiver.id,
        );
      }
    }
    commitEconomy(d);
    initializeEducation(town);
    const extended = economicDraft(town);
    initializeCare(extended);
    commitEconomy(extended);
    for (const p of town.people) {
      db.prepare("UPDATE lw_sims SET profile=?,state=?,household_id=? WHERE id=?").run(j(p.profile),j(p.state),p.household_id,p.id);
      for(const [to,r] of Object.entries(p.relations)) db.prepare("INSERT INTO lw_relations VALUES (?,?,?,?) ON CONFLICT(world_id,from_id,to_id) DO UPDATE SET payload=excluded.payload").run(worldId,p.id,to,j(r));
    }
    const description =
      "Die Erweiterungsregeln werden für den aktuellen Zeitpunkt ergänzt. Geschützte Wohnhilfe und bestätigte Betreuungspausen stehen zur Verfügung; Konten, bereits verdiente Löhne, Protokolle und Weltzeit bleiben erhalten.";
    db.prepare("INSERT INTO lw_events VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
      eventId,
      worldId,
      null,
      time,
      time,
      null,
      "expansion_rules_updated",
      j(town.people.map((p) => p.id)),
      j({ version: EXPANDED_VERSION, coverage: "current_rules_update" }),
      description,
      "expanded_migration",
    );
    for (const p of town.people)
      db.prepare("INSERT INTO lw_journal VALUES (?,?,?,?,?,?,?)").run(
        p.id,
        eventId,
        time,
        "initialization",
        description,
        "Eine aktuelle Ergänzung; keine nachträglich erfundene Erfahrung.",
        1,
      );
    // The updated care/education draft was committed above.
    db.prepare(
      "UPDATE lw_worlds SET rules=?,version=version+1 WHERE world_id=?",
    ).run(
      j({ ...pj(town.world.rules, {}), expandedVersion: EXPANDED_VERSION }),
      worldId,
    );
    return {
      worldId,
      upgraded: true,
      addedLocations: physical.additions.length,
    };
  }
  if (d.accounts.size)
    throw new Error(
      "Partial economic initialization requires repair, not a second seed.",
    );
  const physical = addExpandedPlaces(town),
    population = town.people.length;
  const calendar = put(d, "calendar", {
    version: 1,
    initializedAt: time,
    lastMinute: time,
    lastDay: Math.floor(time / 86400) - 1,
    lastMonth: null,
    lastNewsDay: -1,
    holidays: [{ start: "2026-10-12", end: "2026-10-25" }],
    monthSummaries: {},
    fictionalRules: true,
  });
  const openingEvent = {
    id: uid("le_"),
    world_id: worldId,
    start: time,
    end: time,
    type: "initialization_resources",
    location_id: null,
    participants: [],
    facts: {
      coverage: "initialized_background",
      newCurrentResources: true,
      noRetrospectiveTransactions: true,
    },
    description:
      "Aktuelle Konten, Verträge, Fähigkeiten und Stadtangebote wurden als Ausgangszustand ergänzt. Vergangene Ereignisse bleiben erhalten.",
    source: "expanded_initialization",
  };
  const initial = (a, n) => {
    if (!Number.isSafeInteger(n) || n < 0)
      throw new Error("Bad initial endowment");
    if (n)
      transfer(d, funds.external, a.id, n, {
        key: { kind: "opening", accountId: a.id },
        at: time,
        eventId: openingEvent.id,
        kind: "initial_endowment",
        metadata: { coverage: "initialized_current_resources" },
      });
    return a.id;
  };
  const funds = {};
  for (const [key, name, amount] of [
    ["external", "Außenwirtschaft / ausgewiesene Ausgangsmittel", 0],
    ["city", "Stadthaushalt", population * 250000],
    ["region", "Regionaler Dienstefonds", population * 300000],
    ["health", "Kranken- & Pflegefonds", population * 120000],
    ["social", "Sozialversicherung & Unterstützung", population * 150000],
    ["bank", "Kreditfonds", population * 250000],
  ]) {
    const institution = put(d, "institution", {
      key,
      name,
      serviceBudget: 0,
      reserve: key === "city" ? population * 90000 : 0,
      monthlyGrant:
        key === "city"
          ? population * 42000
          : key === "region"
            ? population * 60000
            : key === "health"
              ? population * 22000
              : 0,
      annualGranted: {},
      capability: key === "bank" ? "funded_lending" : "public_service",
    });
    const a = account(d, key, institution.id, {
      overdraft: key === "external" ? 100000000000000 : 0,
      metadata: { name, outsideWorld: key === "external" },
    });
    funds[key] = a.id;
    institution.payload.accountId = a.id;
    touch(d, institution);
    if (key !== "external") initial(a, amount);
  }
  calendar.payload.funds = funds;
  calendar.payload.venues = physical.venues;
  calendar.payload.externalFlowPolicy =
    "Explicit finite monthly regional grants and outside customer orders; all flows have counterpostings.";
  touch(d, calendar);
  const adultHouseholds = new Map();
  for (const p of town.people) {
    if (!adultHouseholds.has(p.household_id))
      adultHouseholds.set(p.household_id, []);
    adultHouseholds.get(p.household_id).push(p);
    prepareCapabilities(p, town.world.seed);
  }
  const houseRows = [],
    houseByOriginal = new Map(),
    strata = [
      "financially_struggling",
      "lower_middle",
      "middle",
      "upper",
      "very_wealthy",
    ];
  for (const [originalId, members] of adultHouseholds) {
    const draw = rng(town.world.seed + ":economy-house:" + originalId),
      v = draw(),
      stratum =
        v < 0.1
          ? strata[0]
          : v < 0.45
            ? strata[1]
            : v < 0.9
              ? strata[2]
              : v < 0.98
                ? strata[3]
                : strata[4],
      adults = members.filter((p) => p.age >= 18),
      guardian = adults[0] || members[0],
      home = guardian.profile.home;
    const joint = account(d, "household", null, {
        metadata: { name: "Gemeinsames Haushaltskonto" },
      }),
      h = put(
        d,
        "household",
        {
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
        },
        { ownerId: originalId },
      );
    joint.owner_id = h.id;
    d.dirtyAccounts.add(joint.id);
    initial(
      joint,
      stratum === strata[0]
        ? members.length * 2000
        : stratum === strata[1]
          ? members.length * 10000
          : members.length * 35000,
    );
    const rent = Math.round(
        (40000 + members.length * 9000) *
          (stratum === "upper" ? 1.25 : stratum === "very_wealthy" ? 1.6 : 1),
      ),
      property = put(
        d,
        "property",
        {
          buildingId: originalId,
          rooms: home,
          capacity: Math.max(2, members.length + 1),
          rentCents: rent,
          valueCents: Math.round(rent * 240),
          ownerId: null,
          residents: [h.id],
          condition: 0.8,
          listed: false,
          mortgageId: null,
        },
        { ownerId: null },
      );
    h.payload.propertyId = property.id;
    houseRows.push(h);
    houseByOriginal.set(originalId, h);
    touch(d, h);
    for (const p of members) {
      const isAdult = p.age >= 18,
        own = account(d, "personal", p.id, {
          metadata: {
            name:
              p.age < 18 ? "Ersparnisse & Taschengeld" : "Persönliches Konto",
          },
        }),
        saved = isAdult
          ? stratum === strata[0]
            ? 5000 + Math.round(draw() * 20000)
            : stratum === strata[1]
              ? 100000 + Math.round(draw() * 200000)
              : stratum === strata[2]
                ? 500000 + Math.round(draw() * 1500000)
                : stratum === strata[3]
                  ? 5000000 + Math.round(draw() * 15000000)
                  : 50000000 + Math.round(draw() * 100000000)
          : p.age < 3
            ? 0
            : Math.round(draw() * 12000);
      initial(own, saved);
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
          partTime: false,
        },
        threats: [],
        reputation: {
          competence: 0.5,
          helpfulness: 0.5,
          reliability: 0.5,
          visibleStatus: 0,
          notoriety: 0,
        },
        health: { version: 1, substances: {}, supportPlanId: null },
        knownClaims: [],
        lastJobSearch: -1,
        privacy: {
          shareIncomeWithHousehold: isAdult,
          bankBalancePrivate: true,
        },
        guardianPermission:
          p.age >= 15 && p.age < 18 && guardian.age >= 18 && draw() < 0.5,
        subscriptions: [],
        goalEvidence: [],
      };
      p.state.social_cognition = {
        version: 1,
        contacts: {},
        metabeliefs: {},
        lastContext: null,
      };
      const date = calendarDate(time),
        birthdayDraw = rng(town.world.seed + ":birthday:" + p.profile.seed_key),
        month = Math.floor(birthdayDraw() * 12),
        day = 1 + Math.floor(birthdayDraw() * 28),
        notYet =
          month > date.getUTCMonth() ||
          (month === date.getUTCMonth() && day > date.getUTCDate());
      p.profile.birthDate = new Date(
        Date.UTC(date.getUTCFullYear() - p.age - (notYet ? 1 : 0), month, day),
      )
        .toISOString()
        .slice(0, 10);
      p.profile.economyOrigin = "initialized_current_resources";
    }
  }
  // Ownership is separate from residence. A minority own a second dwelling;
  // a housing institution is a real funded counterparty for the others.
  const housing = put(d, "institution", {
    key: "housing",
    name: "Wohnraumgenossenschaft",
    properties: [],
    accountId: null,
  });
  housing.payload.accountId = initial(
    account(d, "housing", housing.id, {
      metadata: { name: housing.payload.name },
    }),
    population * 100000,
  );
  touch(d, housing);
  const wealthy = town.people.filter(
    (p) =>
      p.age >= 18 &&
      ["upper", "very_wealthy"].includes(
        houseByOriginal.get(p.household_id).payload.stratum,
      ),
  );
  for (const h of houseRows) {
    const p = d.entities.get(h.payload.propertyId),
      adults = h.payload.members
        .map((id) => town.byId.get(id))
        .filter((p) => p.age >= 18),
      self = adults[0],
      draw = rng(town.world.seed + ":tenure:" + h.payload.originalId),
      owned =
        self &&
        (["upper", "very_wealthy"].includes(h.payload.stratum) ||
          (h.payload.stratum === "middle" && draw() < 0.35));
    p.payload.ownerId = owned
      ? self.id
      : wealthy.length && draw() < 0.3
        ? wealthy[Math.floor(draw() * wealthy.length)].id
        : housing.id;
    p.owner_id = p.payload.ownerId;
    if (!owned) {
      const lease = put(
        d,
        "lease",
        {
          propertyId: p.id,
          householdId: h.id,
          landlordId: p.payload.ownerId,
          rentCents: p.payload.rentCents,
          depositCents: p.payload.rentCents * 2,
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
      h.payload.leaseId = lease.id;
    } else p.payload.rentCents = 0;
    touch(d, p);
    touch(d, h);
  }
  for (const vacancy of physical.empty) {
    const owner =
      wealthy[
        houseRows.length
          ? physical.empty.indexOf(vacancy) % Math.max(1, wealthy.length)
          : 0
      ]?.id || housing.id;
    put(
      d,
      "property",
      {
        ...vacancy,
        capacity: 6,
        rentCents: 43000,
        valueCents: 18000000,
        ownerId: owner,
        residents: [],
        condition: 0.75,
        listed: true,
        listing: "rent",
        mortgageId: null,
      },
      { ownerId: owner },
    );
  }
  const firms = new Map();
  for (const [job, spec] of Object.entries(JOBS)) {
    if (spec.holiday) continue;
    const venue = physical.venues[spec.venue] || physical.venues.office,
      employer = put(d, "firm", {
        name:
          { Police: "Polizeidienst", Mayor: "Stadtverwaltung" }[job] ||
          job + (pj(town.world.rules,{}).scenario?.id==="bennington"?" · Bennington":" · Lindenstadt"),
        role: job,
        workplaceId: venue.rooms[0],
        accountId: null,
        publicFund: spec.fund || null,
        impressions: {},
        capacity: 0,
        orders: [],
        revenueModel: spec.fund
          ? "public_budget"
          : spec.venue === "shop" ||
              spec.venue === "cafe" ||
              spec.venue === "bakery"
            ? "consumer_sales"
            : "regional_orders",
      });
    const a = account(d, "business", employer.id, {
      metadata: { name: employer.payload.name },
    });
    employer.payload.accountId = initial(a, population * 30000 + 1000000);
    touch(d, employer);
    firms.set(job, employer);
  }
  const employ = (p, role, { origin = "initialized_contract" } = {}) => {
    const firm = firms.get(role),
      spec = JOBS[role],
      h = houseByOriginal.get(p.household_id),
      factor =
        h.payload.stratum === "financially_struggling"
          ? 0.85
          : h.payload.stratum === "lower_middle"
            ? 0.9
            : 1;
    const contract = put(
      d,
      "employment",
      {
        simId: p.id,
        firmId: firm.id,
        job: role,
        grossMonthlyCents: Math.round(spec.gross * factor),
        skill: spec.skill,
        status: "active",
        hoursPerDay: 8,
        daysPerWeek: 5,
        startedAt: time,
        origin,
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
      buildingId: physical.venues[spec.venue].building,
      rooms: {
        hall: firm.payload.workplaceId,
        wc: physical.venues[spec.venue].bath,
      },
      economicWorkplace: true,
    };
    p.state.career = {
      ...p.state.career,
      job: role,
      task: "Carry out " + role.toLowerCase() + " duties",
      skill: spec.skill,
      pay_factor: 1,
      schedule_start: 8 * 3600,
    };
    p.state.skills[spec.skill]=Math.max(p.state.skills[spec.skill]||0,spec.minimum);
    if(spec.credential&&!p.state.credentials.includes(spec.credential))p.state.credentials.push(spec.credential);
    firm.payload.capacity++;
    touch(d, firm);
    return contract;
  };
  for (const p of town.people) {
    if (
      p.age < 18 ||
      p.profile.job === "Retired" ||
      p.profile.job === "Student"
    )
      continue;
    const draw = rng(town.world.seed + ":employment:" + p.profile.seed_key),
      role = JOBS[p.profile.job] ? p.profile.job : "Office analyst";
    if (p.biography_mode === "procedural" && draw() < 0.1) {
      p.state.economy.previousJob = role;
      p.profile.job = "Unemployed";
      p.profile.workplace_id = null;
      p.profile.facility = null;
      p.state.career = {
        ...p.state.career,
        job: "Unemployed",
        skill: JOBS[role].skill,
        schedule_start: 0,
      };
    } else employ(p, role);
  }
  // Actual staffed services, drawn from adults with explicitly initialized
  // qualifications. Old authored occupations are never silently rewritten.
  const procedural = town.people.filter(
    (p) => p.age >= 21 && p.age < 66 && p.profile.job !== "Student" && p.biography_mode === "procedural",
  );
  for (const role of ["Police", "Mayor", "Firefighter", "Nurse"]) {
    if (!procedural.length) break;
    const p = procedural.shift(),
      old = d.entities.get(p.state.economy.employmentId);
    if (old) {
      old.payload.status = "ended_at_initialization";
      touch(d, old);
      const oldFirm = d.entities.get(old.payload.firmId);
      oldFirm.payload.capacity--;
      touch(d, oldFirm);
    }
    p.state.skills[JOBS[role].skill] = Math.max(
      p.state.skills[JOBS[role].skill],
      JOBS[role].minimum,
    );
    if (
      JOBS[role].credential &&
      !p.state.credentials.includes(JOBS[role].credential)
    )
      p.state.credentials.push(JOBS[role].credential);
    employ(p, role);
  }
  for (const h of houseRows) {
    const baby = h.payload.members
      .map((id) => town.byId.get(id))
      .find((p) => p.age < 3);
    if (baby) {
      const caregiver = town.byId.get(baby.profile.family.parent_ids[0]),
        contract = d.entities.get(caregiver?.state.economy.employmentId);
      if (caregiver && contract) {
        caregiver.state.economy.parentalCare = {
          childId: baby.id,
          benefitCents: Math.min(
            180000,
            Math.max(
              90000,
              Math.round(
                estimatedNet(contract.payload.grossMonthlyCents) * 0.65,
              ),
            ),
          ),
          origin: "initialized_approved_parental_care",
        };
        contract.payload.leave = "parental_care";
        touch(d, contract);
      }
    }
  }
  for (const [role, firm] of firms) {
    const spec = JOBS[role];
    put(
      d,
      "job",
      {
        firmId: firm.id,
        title: role,
        skill: spec.skill,
        minimumSkill: spec.minimum,
        credential: spec.credential || null,
        grossMonthlyCents: spec.gross,
        estimatedNetCents: estimatedNet(spec.gross),
        workplaceId: firm.payload.workplaceId,
        slots: Math.max(1, Math.ceil(population / 100)),
        ageMin: spec.minAge || 18,
        hoursPerDay: 8,
        safe: true,
        holiday: false,
        expiresAt: time + 30 * 86400,
        createdAt: time,
        public: true,
      },
      { ownerId: firm.id },
    );
  }
  const helperFirm = firms.get("Retail assistant");
  put(
    d,
    "job",
    {
      firmId: helperFirm.id,
      title: "Holiday helper",
      skill: "retail",
      minimumSkill: 0.15,
      credential: null,
      grossMonthlyCents: 100000,
      estimatedNetCents: 85000,
      workplaceId: helperFirm.payload.workplaceId,
      slots: Math.max(1, Math.ceil(population / 80)),
      ageMin: 15,
      ageMax: 17,
      hoursPerDay: 4,
      safe: true,
      holiday: true,
      expiresAt: time + 365 * 86400,
      createdAt: time,
      public: true,
    },
    { ownerId: helperFirm.id },
  );
  const grocer = put(d, "market", {
    key: "groceries",
    name: "Stadtmarkt",
    firmId: firms.get("Retail assistant").id,
    offers: {
      basic: {
        priceCents: 320,
        stock: population * 8,
        quality: 0.65,
        vat: 0.07,
      },
      standard: {
        priceCents: 500,
        stock: population * 6,
        quality: 0.8,
        vat: 0.07,
      },
      premium: {
        priceCents: 900,
        stock: population * 2,
        quality: 0.86,
        vat: 0.07,
      },
    },
    lastRestockDay: Math.floor(time / 86400),
    supplyFactor: 1,
  });
  calendar.payload.marketId = grocer.id;
  calendar.payload.housingInstitutionId = housing.id;
  touch(d, calendar);
  for (const p of town.people.filter((p) => p.age >= 18)) {
    const h = houseByOriginal.get(p.household_id),
      draw = rng(town.world.seed + ":items:" + p.profile.seed_key);
    if (
      h.payload.stratum === "very_wealthy" &&
      !p.state.credentials.includes("driving_license")
    )
      p.state.credentials.push("driving_license");
    if (draw() < 0.6)
      put(
        d,
        "item",
        {
          catalogId:
            h.payload.stratum === "very_wealthy"
              ? "sports_car"
              : p.profile.interests.includes("music")
                ? "instrument"
                : "used_laptop",
          ownerId: p.id,
          locationId: p.profile.home.living,
          condition: 0.75,
          publiclyDisplayed: false,
          origin: "initialized_possession",
          loanedTo: null,
          stolen: false,
          emotionalValue: 0.3 + draw() * 0.5,
        },
        { ownerId: p.id },
      );
  }
  // Gangs are optional initialized adult networks, never inferred from poverty, ethnicity or minor age.
  const gangCandidates = town.people
    .filter(
      (p) => p.age >= 18 && p.age < 66 && p.biography_mode === "procedural",
    )
    .sort(
      (a, b) =>
        rng(town.world.seed + ":gang-rank:" + a.profile.seed_key)() -
        rng(town.world.seed + ":gang-rank:" + b.profile.seed_key)(),
    );
  if (population >= 50 && gangCandidates.length >= 2) {
    const members = gangCandidates.slice(
        0,
        Math.min(5, Math.max(2, Math.ceil(population * 0.01))),
      ),
      gang = put(d, "gang", {
        name: "Güterhof-Kreis",
        members: members.map((p) => p.id),
        locationId: physical.venues.industrial.rooms[0],
        origin: "initialized_adult_conflict_background",
        activities: [
          "theft",
          "fraud",
          "illegal_trade",
          "robbery",
          "violence",
          "exploitation",
        ],
        notAllContactsAreCriminal: true,
      });
    for (const [i, p] of members.entries())
      p.state.economy.criminalRole = {
        gangId: gang.id,
        kind: i % 2 ? "fraud" : "theft",
        privateBackground: true,
      };
  }
  commitEconomy(d);
  initializeEducation(town);
  const extended = economicDraft(town);
  initializeCare(extended);
  commitEconomy(extended);
  openingEvent.participants = town.people.map((p) => p.id);
  db.prepare("INSERT INTO lw_events VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
    openingEvent.id,
    worldId,
    null,
    time,
    time,
    null,
    openingEvent.type,
    j(openingEvent.participants),
    j(openingEvent.facts),
    openingEvent.description,
    openingEvent.source,
  );
  for (const p of town.people) {
    db.prepare("INSERT INTO lw_journal VALUES (?,?,?,?,?,?,?)").run(
      p.id,
      openingEvent.id,
      time,
      "initialization",
      openingEvent.description,
      "Dies ist mein aktueller Ausgangszustand, keine nachträglich erfundene erlebte Geschichte.",
      1,
    );
    db.prepare("UPDATE lw_sims SET profile=?,state=?,household_id=? WHERE id=?").run(j(p.profile),j(p.state),p.household_id,p.id);
    for (const [to,r] of Object.entries(p.relations)) db.prepare("INSERT INTO lw_relations VALUES (?,?,?,?) ON CONFLICT(world_id,from_id,to_id) DO UPDATE SET payload=excluded.payload").run(worldId,p.id,to,j(r));
  }
  // Original and additive care drafts have already been committed.
  db.prepare(
    "UPDATE lw_worlds SET rules=?,version=version+1 WHERE world_id=?",
  ).run(
    j({ ...pj(town.world.rules, {}), expandedVersion: EXPANDED_VERSION }),
    worldId,
  );
  return {
    worldId,
    accounts: d.accounts.size,
    households: houseRows.length,
    addedLocations: physical.additions.length,
  };
}

function englishPlaceName(name){const names={"Seniorenhaus Lindenblick":"Maple Haven Residential Care","Polizeiwache":"Bennington Community Police","Kontor am Markt":"Main Street Cooperative Offices","Handwerkshof":"Green Mountain Repair Works","Atelierhaus":"Willow Arts Studio","Stadtmarkt":"Benmont Community Market","Bewegungshaus":"Green Ridge Fitness","Stadtbad":"Community Pool","Lichtspielhaus":"Catamount Picture House","Brückenhaus":"Turning Leaf Shelter","Alter Güterhof":"Old Freight Yard · fictional","Beratungszentrum":"Willow Counseling & Coaching","Wiesenlager":"Riverside Temporary Camp","Haus der Chancen":"Bennington Career Center","Marktbogen":"Benmont Commons","Ringstraße":"Benmont Avenue","Wohnbereich":"Living area","Gemeinschaftsküche":"Shared kitchen","Pflegestützpunkt":"Care station","Bewohnerzimmer":"Resident room","Garten":"Garden","Empfang":"Reception","Einsatzbüro":"Operations office","Besprechung":"Meeting room","Arbeitsraum":"Workroom","Konferenzraum":"Conference room","Werkstatt":"Workshop","Materialraum":"Supplies","Gemeinschaftsatelier":"Shared studio","Projektraum":"Project room","Markthalle":"Market hall","Budgetmarkt":"Budget groceries","Feinkost":"Specialty groceries","Trainingsraum":"Training room","Kursraum":"Classroom","Schwimmhalle":"Pool hall","Umkleide":"Changing room","Kinosaal":"Screening room","Beratung":"Counseling room","Schlafraum":"Bedroom","Lagerhalle":"Warehouse","Industriehof":"Industrial yard","Seitenpassage":"Side passage","Gruppenraum":"Group room","Überdachter Treffpunkt":"Covered meeting place","Geschützte Schlafstelle":"Sheltered sleeping place","Stellenberatung":"Job advice","Lernwerkstatt":"Learning room","Toiletten":"Restrooms"};for(const [a,b] of Object.entries(names))name=name.replaceAll(a,b);return name;}
