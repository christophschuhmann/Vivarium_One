// Actual ledger, uncertain admission, observed education and funded care.
// Everything runs in an isolated database; no live or paid-provider calls.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const scratch = fs.mkdtempSync(
  path.join(os.tmpdir(), "vivarium-finance-care-"),
);
process.env.VIV_DATA_DIR = scratch;
const { db, j } = await import("../server/db.js");
const { createTown, loadTown, advanceTown } =
  await import("../server/living/engine.js");
const { closeOpenSims } = await import("../server/living/open_sims.js");
const E = await import("../server/living/expanded/economy.js"),
  S = await import("../server/living/expanded/store.js"),
  F = await import("../server/living/expanded/finances.js"),
  C = await import("../server/living/expanded/care.js"),
  D = await import("../server/living/expanded/education.js"),
  H = await import("../server/living/expanded/housing.js"),
  A = await import("../server/living/expanded/applications.js");
const { rng } = await import("../server/living/random.js");
const user = { id: "finance-care-test" };
db.prepare(
  "INSERT INTO users(id,email,display_name,created_at) VALUES (?,?,?,?)",
).run(user.id, "care@test", "Care", new Date().toISOString());
let seq = 0;
const events = [];
const emitFor =
  (d) =>
  (type, p, time, facts = {}, others = []) => {
    const e = {
      id: "care_fixture_" + ++seq,
      world_id: d.worldId,
      type,
      start: time,
      end: time,
      location_id: p.state.location_id,
      participants: [p.id, ...others],
      facts,
      description: "",
      journal: [],
    };
    events.push(e);
    return e;
  };
const balanceSnapshot = (d) =>
  JSON.stringify([...d.accounts].map(([id, a]) => [id, a.balance_cents]));
try {
  const { worldId } = await createTown(user, { population: 50, seed: 73 });
  let town = loadTown(worldId),
    d = E.economicDraft(town),
    emit = emitFor(d);
  d.emit = emit;
  assert.equal(d.calendar.payload.careVersion, 2);
  const plans = S.rows(d, "care_plan");
  assert.ok(plans.some((x) => x.payload.mode === "residential"));
  assert.ok(plans.filter((x) => x.payload.mode === "home_family").length >= 2);
  for (const plan of plans) {
    const p = d.people.get(plan.payload.simId);
    assert.ok(p.age >= 75);
    for (const id of plan.payload.caregiverIds) {
      const carer = d.people.get(id);
      assert.ok(carer.age >= 18);
      assert.ok(carer.profile.family.parent_ids.includes(p.id));
    }
    assert.match(D.activityStatus(p, town).label, /Pflege/);
  }
  const balanceInit = balanceSnapshot(d),
    careCount = plans.length;
  C.initializeCare(d);
  D.initializeEducation(town);
  assert.equal(balanceSnapshot(d), balanceInit);
  assert.equal(S.rows(d, "care_plan").length, careCount);
  for (const p of town.people)
    for (const e of p.profile.education.history) {
      if (e.kind === "kindergarten") assert.equal(e.grade, null);
      if (e.status !== "completed") assert.equal(e.qualification, null);
    }
  const p = town.people
    .filter(
      (q) =>
        q.age >= 25 &&
        q.age < 60 &&
        !q.state.economy.parentalCare &&
        !q.state.careSupport &&
        !D.currentEducation(q),
    )
    .sort(
      (a, b) =>
        F.financialOutlook(d, a, 27000).liquidCents -
        F.financialOutlook(d, b, 27000).liquidCents,
    )[0];
  const h = E.householdOf(d, p),
    own = E.ownAccount(d, p),
    joint = h.payload.jointAccountId,
    external = E.fundsOf(d).external;
  assert.equal(
    F.financialReport(d, p, 27000).previous.coverage,
    "no_recorded_history",
  );
  const at = 86400 + 36000;
  function post(legs, kind, metadata = {}) {
    assert.ok(
      S.post(d, legs, {
        key: { kind: "finance_fixture", serial: ++seq },
        at,
        kind,
        metadata,
      }).ok,
    );
  }
  post(
    [
      { accountId: external, amount: -10000 },
      { accountId: own, amount: 7000 },
      { accountId: E.fundsOf(d).city, amount: 1000 },
      { accountId: E.fundsOf(d).health, amount: 2000 },
    ],
    "payroll",
    { grossCents: 10000, taxCents: 1000, employeeSocialCents: 2000 },
  );
  post(
    [
      { accountId: own, amount: -1000 },
      { accountId: joint, amount: 1000 },
    ],
    "internal_household_transfer",
  );
  for (let i = 0; i < 80; i++)
    post(
      [
        { accountId: own, amount: -10 },
        { accountId: external, amount: 10 },
      ],
      "groceries",
    );
  post(
    [
      { accountId: external, amount: -5000 },
      { accountId: own, amount: 5000 },
    ],
    "loan_principal",
  );
  const deposit = S.account(d, "deposit", h.id, { balanceCents: 0 });
  post(
    [
      { accountId: own, amount: -500 },
      { accountId: deposit.id, amount: 500 },
    ],
    "restricted_deposit_transfer",
  );
  db.transaction(() => S.commitEconomy(d))();
  d = E.economicDraft(town);
  emit = emitFor(d);
  d.emit = emit;
  const october = (Date.UTC(2026, 9, 5) - Date.UTC(2026, 8, 21)) / 1000;
  const statement = F.financialReport(d, p, october).previous;
  assert.equal(statement.incomeCents, 7000);
  assert.equal(statement.spendingCents, 800);
  assert.equal(statement.payroll.netCents, 7000);
  assert.equal(statement.financingInCents, 5000);
  assert.equal(statement.transferOutCents, 500);
  assert.equal(
    statement.categories.find((x) => x.kind === "groceries").count,
    80,
  );
  assert.equal(statement.transactions.length, 60);
  assert.ok(statement.transactionCount > 80);
  assert.equal(statement.coverage, "partial_month");
  const personal = F.monthStatement(
    d,
    p,
    F.financialPeriods(october).previous,
    { scope: "personal" },
  );
  assert.equal(personal.transferOutCents, 1500);
  const second = F.monthStatement(d, p, F.financialPeriods(october).previous, {
    offset: 60,
  });
  assert.ok(second.transactions.length > 0);
  assert.ok(
    !statement.transactions.some((a) =>
      second.transactions.some((b) => a.id === b.id),
    ),
  );
  const beforeReserve = balanceSnapshot(d);
  h.payload.budget.irregularReserve = 1000000; // Explicit plan fixture, not a payment.
  d.households.get(h.id).payload.budget.irregularReserve = 1000000;
  F.financialAppraisals(d, 27000, emit, { force: true });
  assert.equal(balanceSnapshot(d), beforeReserve);
  assert.equal(p.state.economy.financialAppraisal.security, "shortfall");
  assert.ok(
    p.state.wellbeing.evidence.some(
      (x) => x.channel === "financial_review" && x.delta.P < 0,
    ),
  );
  assert.ok(p.state.affect.states.some((x) => x.id === "fear"));
  const singlePlan = S.rows(d, "care_plan").find(
      (x) => x.payload.mode === "residential",
    ),
    resident = d.people.get(singlePlan.payload.simId),
    oldHome = singlePlan.payload.previousHome.living,
    oldProperty = [...d.properties.values()].find((x) =>
      Object.values(x.payload.rooms || {}).includes(oldHome),
    );
  assert.ok(!oldProperty.payload.listed);
  assert.ok(
    Object.values(singlePlan.payload.previousHome).includes(
      resident.state.location_id,
    ),
    "care migration never teleports",
  );
  resident.state.location_id = resident.profile.home.living;
  resident.state.action = null;
  H.housingDaily(d, 13 * 3600, emit);
  if (!singlePlan.payload.previousHouseholdId)
    assert.ok(
      oldProperty.payload.listed,
      "old flat only released after actual departure",
    );
  else
    assert.ok(!oldProperty.payload.listed, "remaining family keeps its home");
  const homePlan = S.rows(d, "care_plan").find(
      (x) => x.payload.mode === "home_family",
    ),
    patient = d.people.get(homePlan.payload.simId),
    carer = d.people.get(homePlan.payload.caregiverIds[0]);
  carer.state.economy.activeElderCareTargetId = patient.id;
  patient.state.action = null;
  patient.state.needs.social = 0.8;
  const remote = carer.state.location_id;
  carer.state.location_id = null;
  const event = emit("action", carer, 18 * 3600, {
    action: "leisure_expanded_elder_care",
  });
  assert.equal(C.completeFamilyCare(d, carer, event, 900), false);
  assert.equal(patient.state.needs.social, 0.8);
  carer.state.location_id = patient.state.location_id;
  assert.ok(C.completeFamilyCare(d, carer, event, 900));
  assert.ok(patient.state.needs.social < 0.8);
  assert.equal(homePlan.payload.familyCareSeconds, 900);
  assert.ok(
    patient.state.wellbeing.evidence.some(
      (x) => x.channel === "received_elder_care",
    ),
  );
  carer.state.location_id = remote;
  const healthBefore = S.balance(d, E.fundsOf(d).health);
  C.careMinute(d, 14 * 3600, emit);
  assert.ok(S.balance(d, E.fundsOf(d).health) < healthBefore);
  assert.ok(
    events.some(
      (x) => x.type === "professional_care_visit" && x.facts.mealDelivered,
    ),
  );
  assert.ok(
    d.invoices.some((x) => x.payload.kind === "care_copayment") ||
      S.rows(d, "invoice").some((x) => x.payload.kind === "care_copayment"),
  );
  const child = town.people.find((q) => q.age >= 6 && q.age < 10),
    course = D.currentEducation(child);
  assert.ok(course);
  course.endDate = "2026-09-20";
  D.educationDaily(d, 27000, emit);
  assert.equal(
    course.status,
    "enrolled",
    "elapsed date alone never earns a diploma",
  );
  const learn = emit("action", child, 28000, { action: "school_day" });
  D.completeStudy(child, learn, 50 * 3600);
  D.educationDaily(d, 86400 + 27000, emit);
  assert.equal(course.status, "completed");
  assert.equal(D.currentEducation(child).kind, "secondary");
  p.state.economy.parentalCare = null;
  p.state.careSupport = null;
  p.profile.education.currentId = null;
  p.state.skills.retail = 0.95;
  p.state.economy.expectations.minimumNetCents = 0;
  p.state.economy.expectations.maxCommuteSeconds = 100000;
  const base = d.jobs.find(
    (x) => x.payload.skill === "retail" && !x.payload.holiday,
  );
  assert.ok(base);
  base.payload.minimumSkill = 0.2;
  base.payload.expiresAt = 1e8;
  base.payload.credential = null;
  base.payload.title = "Fixture retail opportunity";
  const firm = d.firms.get(base.payload.firmId);
  firm.payload.impressions ||= {};
  firm.payload.impressions[p.id] = {
    score: 0.85,
    confidence: 0.9,
    at: 27000,
    eventIds: [],
  };
  const high = A.jobChance(p, base.payload, firm, 27000).probability;
  p.state.skills.retail = 0.3;
  const low = A.jobChance(p, base.payload, firm, 27000).probability;
  assert.ok(high > low);
  p.state.skills.retail = 0.95;
  firm.payload.impressions[p.id].score = 0.2;
  assert.ok(A.jobChance(p, base.payload, firm, 27000).probability < high);
  firm.payload.impressions[p.id].score = 0.85;
  let declinedListing;
  for (let i = 0; i < 1000; i++) {
    const id = base.id + "_decline_" + i,
      assessment = E.jobAssessment(d, p, base, 27000);
    assert.ok(assessment.eligible, assessment.reasons.join(";"));
    const roll =
      Math.floor(
        rng(town.world.seed + ":application:job:" + p.id + ":" + id + ":0")() *
          100,
      ) + 1;
    if (roll > Math.floor(assessment.probability * 100)) {
      declinedListing = S.put(d, "job", { ...base.payload }, { id });
      break;
    }
  }
  const contractBefore = p.state.economy.employmentId,
    cashBefore = balanceSnapshot(d),
    workplaceBefore = p.profile.workplace_id;
  const denied = E.applyForJob(d, p, declinedListing, 27000, emit);
  assert.equal(denied.ok, false);
  assert.equal(denied.status, "declined");
  assert.equal(p.state.economy.employmentId, contractBefore);
  assert.equal(p.profile.workplace_id, workplaceBefore);
  assert.equal(balanceSnapshot(d), cashBefore);
  const count = p.state.economy.applications.length;
  assert.equal(E.applyForJob(d, p, declinedListing, 27060, emit).ok, false);
  assert.equal(
    p.state.economy.applications.length,
    count,
    "repeat click does not reroll or generate new record",
  );
  const vacancy = [...d.properties.values()].find(
    (x) => x.payload.listed && x.payload.capacity >= h.payload.members.length,
  );
  assert.ok(vacancy);
  const homeBefore = h.payload.propertyId,
    leaseBefore = h.payload.leaseId;
  const impossible = H.applyForHousing(
    d,
    p,
    { ...vacancy, payload: { ...vacancy.payload, capacity: 0 } },
    27000,
    emit,
  );
  assert.equal(impossible.ok, false);
  assert.equal(h.payload.propertyId, homeBefore);
  assert.equal(h.payload.leaseId, leaseBefore);
  assert.equal(balanceSnapshot(d), cashBefore);

  // Known income disclosure is independent of permission to inspect savings.
  const partnered = [...d.households.values()].find(
    (x) =>
      x.payload.members.filter((id) => d.people.get(id).age >= 18).length >= 2,
  );
  const adults = partnered.payload.members
      .map((id) => d.people.get(id))
      .filter((q) => q.age >= 18),
    observer = adults[0],
    other = adults[1];
  const openForecast = E.householdForecast(d, partnered, 27000, {
    observerId: observer.id,
  });
  other.state.economy.privacy.shareIncomeWithHousehold = false;
  const privateForecast = E.householdForecast(d, partnered, 27000, {
    observerId: observer.id,
  });
  assert.ok(privateForecast.incomeCents <= openForecast.incomeCents);
  assert.ok(
    !F.financialOutlook(d, observer, 27000).incomeRows.some(
      (x) => x.simId === other.id,
    ),
  );
  const outsiders = town.people.filter(
      (q) => q.age >= 18 && q.state.economy.householdId !== partnered.id,
    ),
    outsideBefore = outsiders.map((q) => q.state.wellbeing.evidence.length);
  F.financialAppraisals(d, 30000, emit, {
    force: true,
    householdId: partnered.id,
  });
  assert.deepEqual(
    outsiders.map((q) => q.state.wellbeing.evidence.length),
    outsideBefore,
    "a paused household decision does not fabricate unrelated budget reviews",
  );
  // Daily care accrual sums to exactly the agreed calendar-month charge.
  let coverageCost = 0;
  homePlan.payload.lastServiceDay = -1;
  homePlan.payload.lastDeferralDay = -1;
  homePlan.payload.accrualMonth = null;
  patient.state.location_id = patient.profile.home.living;
  for (let day = 1; day <= 31; day++) {
    const time = (Date.UTC(2026, 9, day, 14) - Date.UTC(2026, 8, 21)) / 1000;
    C.careMinute(d, time, emit);
    coverageCost += events
      .filter(
        (x) =>
          x.type === "professional_care_visit" &&
          x.facts.carePlanId === homePlan.id &&
          x.start === time,
      )
      .reduce((n, x) => n + x.facts.copayCents, 0);
  }
  assert.equal(
    coverageCost,
    homePlan.payload.monthlyCopayCents,
    "31-day month must not overcharge 31/30 of the care budget",
  );

  // An affordable, qualified housing bid may still be declined by its W100.
  const rentOffer = {
    ...vacancy.payload,
    rentCents: 10000,
    listed: true,
    residents: [],
  };
  let housingBid;
  for (let i = 0; i < 1000; i++) {
    const id = vacancy.id + "_decline_fixture_" + i,
      candidate = { id, payload: rentOffer },
      assessment = H.housingAssessment(d, p, candidate, 27000, {
        support: true,
      });
    assert.ok(assessment.eligible, assessment.reasons.join(";"));
    const roll =
      Math.floor(
        rng(
          town.world.seed + ":application:housing:" + p.id + ":" + id + ":0",
        )() * 100,
      ) + 1;
    if (roll > Math.floor(assessment.probability * 100)) {
      housingBid = S.put(d, "property", { ...rentOffer }, { id });
      break;
    }
  }
  const housingMoney = balanceSnapshot(d),
    housingLease = h.payload.leaseId,
    housingHome = h.payload.propertyId;
  const housingResult = H.applyForHousing(d, p, housingBid, 27000, emit, {
    support: true,
  });
  assert.equal(housingResult.status, "declined");
  assert.equal(balanceSnapshot(d), housingMoney);
  assert.equal(h.payload.leaseId, housingLease);
  assert.equal(h.payload.propertyId, housingHome);
  S.assertEconomicIntegrity(d);
  const money = balanceSnapshot(d),
    seconds = town.world.seconds;
  db.transaction(() => S.commitEconomy(d))();
  for (const q of town.people)
    db.prepare("UPDATE lw_sims SET profile=?,state=? WHERE id=?").run(
      j(q.profile),
      j(q.state),
      q.id,
    );
  const loaded = loadTown(worldId);
  assert.equal(loaded.world.seconds, seconds);
  assert.equal(
    balanceSnapshot(E.economicDraft(loaded)),
    money,
    "reload never reseeds money",
  );

  // Real engine selection must allow (not merely describe) the new actions.
  const live = await createTown(user, { population: 50, seed: 73 }),
    liveTown = loadTown(live.worldId),
    liveDraft = E.economicDraft(liveTown);
  const familyPlan = S.rows(liveDraft, "care_plan").find(
      (x) => x.payload.mode === "home_family",
    ),
    familyPatient = liveTown.byId.get(familyPlan.payload.simId),
    familyCarer = liveTown.byId.get(familyPlan.payload.caregiverIds[0]);
  for (const q of [familyCarer, familyPatient]) {
    q.state.action = null;
    q.state.route = null;
    q.state.goal = null;
    for (const key of Object.keys(q.state.needs)) q.state.needs[key] = 0.15;
    q.state.location_id = familyPatient.profile.home.living;
    db.prepare("UPDATE lw_sims SET state=?,location_id=? WHERE id=?").run(
      j(q.state),
      q.state.location_id,
      q.id,
    );
  }
  db.prepare("UPDATE lw_worlds SET seconds=? WHERE world_id=?").run(
    17 * 3600,
    live.worldId,
  );
  await advanceTown(user, live.worldId, { minutes: 30, story: false });
  const actualCare = db
    .prepare(
      "SELECT facts FROM lw_events WHERE world_id=? AND type='action_completed' AND json_extract(facts,'$.action')='leisure_expanded_elder_care'",
    )
    .all(live.worldId);
  assert.ok(actualCare.length, "actual engine must complete family care");
  const residential = S.rows(liveDraft, "care_plan").find(
      (x) => x.payload.mode === "residential",
    ),
    rSim = liveTown.byId.get(residential.payload.simId);
  assert.equal(E.householdOf(liveDraft, rSim).payload.members.length, 1);
  if (residential.payload.previousHouseholdId)
    assert.ok(
      !liveDraft.households
        .get(residential.payload.previousHouseholdId)
        .payload.members.includes(rSim.id),
    );
  const schoolPerson = liveTown.people.find(
    (q) =>
      q.age >= 18 &&
      q.age < 30 &&
      !q.state.careSupport &&
      !q.state.economy.parentalCare,
  );
  const campus = [...liveTown.places.values()].find(
    (x) => x.kind === "room" && x.purpose.includes("campus"),
  );
  const enrollment = {
    id: "observed-student-fixture",
    kind: "university",
    institution: "Universität Lindenstadt",
    field: "Analyse",
    skill: "analysis",
    status: "enrolled",
    startDate: "2026-09-01",
    endDate: "2029-07-31",
    observedHours: 0,
  };
  schoolPerson.profile.education.history.push(enrollment);
  schoolPerson.profile.education.currentId = enrollment.id;
  schoolPerson.profile.workplace_id = campus.id;
  schoolPerson.state.action = null;
  schoolPerson.state.route = null;
  schoolPerson.state.goal = null;
  schoolPerson.state.location_id = campus.id;
  for (const key of Object.keys(schoolPerson.state.needs))
    schoolPerson.state.needs[key] = 0.15;
  db.prepare(
    "UPDATE lw_sims SET profile=?,state=?,location_id=? WHERE id=?",
  ).run(
    j(schoolPerson.profile),
    j(schoolPerson.state),
    campus.id,
    schoolPerson.id,
  );
  db.prepare("UPDATE lw_worlds SET seconds=? WHERE world_id=?").run(
    8 * 3600,
    live.worldId,
  );
  await advanceTown(user, live.worldId, { minutes: 60, story: false });
  assert.ok(
    db
      .prepare(
        "SELECT count(*) n FROM lw_events WHERE world_id=? AND type='action_completed' AND json_extract(facts,'$.action')='leisure_expanded_study'",
      )
      .get(live.worldId).n,
    "actual engine must complete enrolled adult study",
  );
  // Actual engine step exercises all new minute hooks at 500 residents.
  const large = await createTown(user, { population: 500, seed: 74 });
  assert.ok(
    loadTown(large.worldId).people.some(
      (q) => D.activityStatus(q).kind === "study",
    ),
    "new towns include actual university students",
  );
  const started = performance.now();
  await advanceTown(user, large.worldId, { minutes: 10, story: false });
  assert.equal(loadTown(large.worldId).people.length, 500);
  fs.mkdirSync("artifacts/expanded-world", { recursive: true });
  fs.writeFileSync(
    "artifacts/expanded-world/finance-care-review.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        providerCalls: 0,
        checks: [
          "calendar-month ledger and pagination",
          "gross/net without double deductions",
          "internal transfers/loans/deposits separated",
          "reserve affects emotion and PERMA, no payment",
          "care costs, actual presence and vacancy release",
          "dated and observed education",
          "probabilistic employment refusal, cooldown, preserved contract",
          "housing refusal preserves cash and lease",
          "idempotent reload",
          "500 residents actual ten-minute tick",
        ],
        largeTickMs: Math.round(performance.now() - started),
      },
      null,
      2,
    ) + "\n",
  );
  console.log("PASS finances, education, applications and care");
} finally {
  closeOpenSims();
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
}
