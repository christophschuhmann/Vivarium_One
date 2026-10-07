import { passingJobFixture } from "./application-fixture.mjs";
// Calendar/financial lifecycle checks use isolated, explicitly declared fixtures.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "expanded-lifecycle-"));
process.env.VIV_DATA_DIR = scratch;
const { db, j } = await import("../server/db.js");
const { createTown, loadTown, insertEvent, advanceTown, stateDiff } =
  await import("../server/living/engine.js");
const { closeOpenSims } = await import("../server/living/open_sims.js");
const E = await import("../server/living/expanded/economy.js"),
  S = await import("../server/living/expanded/store.js"),
  L = await import("../server/living/expanded/life.js"),
  C = await import("../server/living/expanded/community.js"),
  H = await import("../server/living/expanded/households.js"),
  W = await import("../server/living/wellbeing.js");
const { initializeExpansion } =
  await import("../server/living/expanded/bootstrap.js");
const { DUTIES, calendarDate } =
  await import("../server/living/expanded/catalog.js");
const user = { id: "lifecycle" };
db.prepare(
  "INSERT INTO users(id,email,display_name,created_at) VALUES (?,?,?,?)",
).run(user.id, "lifecycle@test", "Lifecycle", new Date().toISOString());
let serial = 0;
const emitFor =
  (d) =>
  (type, p, time, facts = {}, others = []) => ({
    id: "lifecycle_" + ++serial,
    world_id: d.worldId,
    start: time,
    end: time,
    location_id: p.state.location_id,
    type,
    participants: [p.id, ...others],
    witnesses: [],
    facts,
    description: "Expliziter isolierter Testfall",
    source: "test_fixture",
  });
try {
  const { worldId } = await createTown(user, { population: 100, seed: 73 }),
    town = loadTown(worldId),
    d = E.economicDraft(town),
    emit = emitFor(d);
  d.emit = emit;
  const p = town.people.find(
      (p) =>
        p.age >= 18 &&
        d.contracts.has(p.id) &&
        !p.state.economy.parentalCare &&
        E.householdForecast(d, E.householdOf(d, p), 27000).marginCents > 20000,
    ),
    own = E.ownAccount(d, p),
    h = E.householdOf(d, p);
  assert.ok(p);
  const initialTotal = [...d.accounts.values()].reduce(
    (n, a) => n + a.balance_cents,
    0,
  );
  // A monthly membership charges once on acceptance and at its actual 30-day due date.
  const joined = L.buyMembership(d, p, "gym_member", 27000, emit);
  assert.ok(joined.ok);
  const sub = d.entities.get(joined.subscriptionId),
    seller = sub.payload.sellerAccountId,
    initialSeller = S.balance(d, seller),
    tax = S.balance(d, E.fundsOf(d).region),
    net = Math.round(sub.payload.monthlyCents / 1.19),
    due = sub.payload.nextDueAt;
  E.economicMinute(d, due, emit);
  const invoice = d.entities.get(sub.payload.lastInvoiceId);
  assert.equal(invoice.payload.status, "paid");
  assert.equal(invoice.payload.amountCents, sub.payload.monthlyCents);
  assert.ok(
    S.balance(d, E.fundsOf(d).region) >= tax + sub.payload.monthlyCents - net,
  );
  const count = S.rows(d, "invoice").filter(
    (i) => i.payload.subscriptionId === sub.id,
  ).length;
  E.economicMinute(d, due, emit);
  assert.equal(
    S.rows(d, "invoice").filter((i) => i.payload.subscriptionId === sub.id)
      .length,
    count,
  );
  // Two earnings/settlements in one month never erase a newly earned claim as a duplicate.
  const contract = d.contracts.get(p.id);
  p.state.location_id = d.firms.get(
    contract.payload.firmId,
  ).payload.workplaceId;
  const work = emit("action_completed", p, 36000, { action: "work" });
  E.accrueWork(d, p, work, 1800, 36000);
  let gross = contract.payload.pendingGrossCents;
  assert.ok(gross);
  E.payroll(d, contract, 36000, emit);
  const paid = S.balance(d, own);
  E.accrueWork(
    d,
    p,
    emit("action_completed", p, 40000, { action: "work" }),
    1800,
    40000,
  );
  assert.ok(contract.payload.pendingGrossCents);
  E.payroll(d, contract, 40000, emit);
  assert.ok(S.balance(d, own) > paid);
  assert.equal(contract.payload.pendingGrossCents, 0);
  // An outstanding installment pays interest only once across partial payments.
  const loan = E.issueLoan(
    d,
    p,
    { amountCents: 10000, months: 12, consent: true },
    41000,
    emit,
  );
  assert.ok(loan.ok);
  const debt = d.entities.get(loan.loanId),
    inv = E.newInvoice(
      d,
      p,
      null,
      "loan_payment",
      1000,
      debt.payload.lenderAccountId,
      41001,
      emit,
      { loanId: debt.id, interestCents: 100 },
    );
  S.transfer(d, own, E.fundsOf(d).external, S.balance(d, own) - 50, {
    key: { kind: "fixture_liquidity_shock" },
    at: 41001,
    kind: "declared_test_shock",
  });
  E.payInvoice(d, inv, 41001, emit);
  assert.equal(inv.payload.interestPaidCents, 50);
  assert.equal(debt.payload.principalCents, 10000);
  S.transfer(d, E.fundsOf(d).external, own, 950, {
    key: { kind: "fixture_restore" },
    at: 41002,
    kind: "declared_test_capital",
  });
  E.payInvoice(d, inv, 41002, emit);
  assert.equal(inv.payload.interestPaidCents, 100);
  assert.equal(debt.payload.principalCents, 9100);
  // A verified public source can affect hiring; private/unverified gossip cannot.
  const claim = C.publishClaim(
    d,
    p,
    emit("public_accountability", p, 42000, { public: true }),
    { dimension: "reliability", value: -0.6 },
  );
  assert.equal(claim.payload.value, -0.6);
  const listing = d.jobs.find(
    (x) => x.payload.title !== p.profile.job && !x.payload.holiday,
  );
  p.state.skills[listing.payload.skill] = 1;
  p.state.credentials.push(...[listing.payload.credential].filter(Boolean));
  p.state.economy.expectations.minimumNetCents = 0;
  assert.ok(
    E.jobAssessment(d, p, listing, 42000).reasons.some((x) =>
      /öffentlicher|documented public reliability incident/.test(x),
    ),
  );
  claim.payload.public = false;
  assert.ok(
    !E.jobAssessment(d, p, listing, 42000).reasons.some((x) =>
      /öffentlicher|documented public reliability incident/.test(x),
    ),
  );
  // Youth holiday contracts end on the actual eighteenth birthday, keeping earned wages.
  const teen = town.people.find((q) => q.age >= 14 && q.age < 18),
    date = calendarDate(86400);
  teen.age = 17;
  teen.profile.birthDate = new Date(
    Date.UTC(date.getUTCFullYear() - 18, date.getUTCMonth(), date.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
  const holiday = S.put(
    d,
    "employment",
    {
      simId: teen.id,
      firmId: listing.payload.firmId,
      job: "Holiday helper",
      status: "active",
      holiday: true,
      hoursPerDay: 4,
      pendingGrossCents: 1234,
    },
    { ownerId: teen.id },
  );
  d.contracts.set(teen.id, holiday);
  teen.state.economy.employmentId = holiday.id;
  L.lifeDaily(d, 86400, emit);
  assert.equal(teen.age, 18);
  assert.equal(holiday.payload.status, "ended_at_adult_birthday");
  assert.equal(holiday.payload.pendingGrossCents, 1234);
  assert.ok(!d.contracts.has(teen.id));
  // A care task is source-bound and can be rescheduled without resetting progress.
  const row = DUTIES.find((r) => r.title.toLowerCase().includes("müll"));
  h.payload.taskState = {
    trash: 1,
    dirt: 1,
    laundry: 1,
    fixtures: ["washing_machine"],
    pet: false,
  };
  const task = L.assignObligation(d, p, row, 90000, emit);
  assert.ok(task.ok);
  const obligation = d.entities.get(task.obligationId);
  obligation.payload.status = "needs_reschedule";
  obligation.payload.progress = 0.4;
  assert.ok(L.rescheduleObligation(d, p, obligation, 93000, emit).ok);
  assert.equal(obligation.payload.progress, 0.4);
  assert.equal(obligation.payload.status, "accepted");
  // Adult-only risks have an actual victim and evidence; weak reputation is never a crime.
  const offender = town.people.find((q) => q.age >= 18 && q.id !== p.id);
  offender.state.location_id = p.state.location_id;
  offender.state.economy.criminalRole = { kind: "theft" };
  const incident = C.crimeEpisode(d, offender, "theft", 95000, emit);
  assert.ok(incident.ok);
  const c = d.entities.get(incident.caseId),
    victim = town.byId.get(c.payload.victimId);
  assert.ok(victim.age >= 18);
  assert.ok(C.reportCase(d, victim, c, 96000, emit).ok);
  assert.equal(c.payload.status, "reported");
  assert.equal(c.payload.judgment, null);
  // A report is actually reviewed while an employed officer is on duty, never at midnight by magic.
  const officer = town.people.find((q) => q.profile.job === "Police");
  assert.ok(officer);
  officer.state.location_id = officer.profile.workplace_id;
  officer.state.action = { kind: "work" };
  C.reviewCases(d, 97000, emit);
  assert.equal(c.payload.status, "investigating");
  assert.equal(c.payload.investigatorId, officer.id);
  assert.equal(c.payload.judgment, null);
  // Rent credit is created once only after actual vacancy; it refunds actual paid money.
  const { housingDaily } = await import("../server/living/expanded/housing.js"),
    ended = S.rows(d, "lease").find(
      (x) => x.payload.status === "active" && x.payload.rentCents > 0,
    ),
    eh = d.households.get(ended.payload.householdId),
    ep = d.people.get(eh.payload.sharedBy[0]),
    amount = ended.payload.rentCents,
    period = calendarDate(97000).toISOString().slice(0, 7);
  S.transfer(d, E.fundsOf(d).external, eh.payload.jointAccountId, amount, {
    key: { kind: "fixture_funded_rent" },
    at: 96000,
    kind: "declared_test_capital",
  });
  const creditor =
      S.ownerAccount(d, ended.payload.landlordId, "personal") ||
      S.ownerAccount(d, ended.payload.landlordId, "housing"),
    rent = E.newInvoice(d, ep, eh, "rent", amount, creditor.id, 96000, emit, {
      leaseId: ended.id,
      period,
    });
  E.payInvoice(d, rent, 96000, emit);
  assert.equal(rent.payload.status, "paid");
  ended.payload.status = "ended";
  ended.payload.endedAt = 96000;
  for (const id of eh.payload.members)
    d.people.get(id).state.location_id =
      d.calendar.payload.venues.office.rooms[0];
  eh.payload.lastHousingDay = null;
  const jointBefore = S.balance(d, eh.payload.jointAccountId);
  housingDaily(d, 97000, emit);
  assert.ok(rent.payload.creditCents > 0);
  assert.equal(
    S.balance(d, eh.payload.jointAccountId) - jointBefore,
    rent.payload.creditCents,
  );
  const once = S.balance(d, eh.payload.jointAccountId);
  eh.payload.lastHousingDay = null;
  housingDaily(d, 97000, emit);
  assert.equal(S.balance(d, eh.payload.jointAccountId), once);
  // The compact journal splice preserves both directions of the actual rotating history.
  const ring = Array.from({ length: 128 }, (_, i) => ({
      id: "event_" + i,
      value: i,
    })),
    rotated = [
      ...ring.slice(17),
      ...Array.from({ length: 17 }, (_, i) => ({ id: "new_" + i })),
    ],
    patch = stateDiff(ring, rotated)[0];
  assert.equal(patch.op, "array_shift_append");
  assert.deepEqual(
    [...ring.slice(patch.removed.length), ...patch.added],
    rotated,
  );
  assert.deepEqual(
    [
      ...patch.removed,
      ...rotated.slice(0, rotated.length - patch.added.length),
    ],
    ring,
  );
  // A loan of an item needs each explicit permission and actual return restores access.
  const { lendItem, returnItem } =
      await import("../server/living/expanded/leisure.js"),
    item = S.put(
      d,
      "item",
      {
        ownerId: p.id,
        catalogId: "used_laptop",
        condition: 1,
        loanedTo: null,
        locationId: p.state.location_id,
      },
      { ownerId: p.id },
    );
  offender.state.location_id = p.state.location_id;
  p.relations[offender.id] = { trust: 0.9 };
  assert.equal(lendItem(d, p, item, offender, 98000, emit).ok, false);
  assert.ok(
    lendItem(d, p, item, offender, 98000, emit, {
      consent: true,
      targetConsent: true,
    }).ok,
  );
  assert.equal(item.payload.ownerId, p.id);
  assert.equal(item.payload.loanedTo, offender.id);
  assert.ok(returnItem(d, offender, item, 98001, emit).ok);
  assert.equal(item.payload.loanedTo, null);
  // Archived paused-chat contributions remain removable while real activity remains.
  const before = structuredClone(p);
  for (let i = 0; i < 150; i++)
    W.recordExperience(
      p,
      { id: "chat_" + i, conversationChannel: "inner" },
      100000 + i,
      "reflection",
      { P: 0.001, R: 0.001 },
      "Eigener Dialog",
    );
  for (let i = 0; i < 150; i++)
    W.recordExperience(
      p,
      { id: "actual_" + i },
      100200 + i,
      "activity",
      { E: 0.001, M: 0.001 },
      "Tatsächliche Tätigkeit",
    );
  assert.ok(
    Object.values(p.state.wellbeing.historyDays).some(
      (day) => day.conversation_inner,
    ),
  );
  W.removeWellbeingSources(
    p,
    new Set(Array.from({ length: 150 }, (_, i) => "chat_" + i)),
    100500,
    { conversationChannel: "inner" },
  );
  assert.ok(
    Object.values(p.state.wellbeing.historyDays).every(
      (day) => !day.conversation_inner,
    ),
  );
  assert.ok(
    p.state.wellbeing.evidence.some((e) => e.eventId.startsWith("actual_")),
  );
  assert.equal(
    [...d.accounts.values()].reduce((n, a) => n + a.balance_cents, 0),
    initialTotal,
  );
  S.assertEconomicIntegrity(d);
  // Upgrade a copy of current expansion rules without reseeding money, resetting clock or history.
  const ledgerBefore = db
      .prepare("SELECT * FROM lw_economy_accounts WHERE world_id=? ORDER BY id")
      .all(worldId),
    clock = town.world.seconds,
    oldEvents = db
      .prepare("SELECT count(*) n FROM lw_events WHERE world_id=?")
      .get(worldId).n;
  db.prepare(
    "UPDATE lw_worlds SET rules=json_set(rules,'$.expandedVersion',1) WHERE world_id=?",
  ).run(worldId);
  db.transaction(() => initializeExpansion(loadTown(worldId)))();
  assert.deepEqual(
    db
      .prepare("SELECT * FROM lw_economy_accounts WHERE world_id=? ORDER BY id")
      .all(worldId),
    ledgerBefore,
  );
  assert.equal(loadTown(worldId).world.seconds, clock);
  assert.ok(
    db.prepare("SELECT count(*) n FROM lw_events WHERE world_id=?").get(worldId)
      .n > oldEvents,
  );
  assert.equal(initializeExpansion(loadTown(worldId)), null);
  // A voluntary household agreement needs all adults, capacity, reciprocal trust; no teleport/savings seizure.
  const fresh = E.economicDraft(loadTown(worldId)),
    pairs = [...fresh.households.values()].filter(
      (h) => h.payload.members.length <= 2,
    ),
    a = pairs.sort(
      (a, b) => a.payload.members.length - b.payload.members.length,
    )[0],
    b = [...fresh.households.values()].find(
      (h) =>
        h.id !== a.id &&
        fresh.properties.get(h.payload.propertyId).payload.capacity >=
          h.payload.members.length + a.payload.members.length,
    );
  assert.ok(b);
  const ap = fresh.people.get(a.payload.sharedBy[0]),
    bp = fresh.people.get(b.payload.sharedBy[0]);
  ap.relations[bp.id] = { trust: 0.9 };
  bp.relations[ap.id] = { trust: 0.9 };
  const am = fresh.people.get(ap.id).state.location_id,
    privateBefore = S.balance(fresh, E.ownAccount(fresh, ap));
  assert.equal(
    H.joinHouseholds(fresh, ap, bp, 27000, emitFor(fresh), {
      consentingAdultIds: [ap.id],
    }).ok,
    false,
  );
  assert.ok(
    H.joinHouseholds(fresh, ap, bp, 27000, emitFor(fresh), {
      consentingAdultIds: [...a.payload.sharedBy, ...b.payload.sharedBy],
    }).ok,
  );
  assert.equal(ap.state.location_id, am);
  assert.equal(S.balance(fresh, E.ownAccount(fresh, ap)), privateBefore);
  assert.equal(ap.state.economy.householdId, b.id);
  S.assertEconomicIntegrity(fresh);
  // A real holiday application produces routed youth work and bounded earned wages.
  const small = await createTown(user, { population: 50, seed: 73 }),
    tt = loadTown(small.worldId),
    td = E.economicDraft(tt),
    te = emitFor(td),
    y = tt.people.find((q) => q.age >= 15 && q.age < 18),
    when = Math.floor(
      (Date.UTC(2026, 9, 12, 9) - Date.UTC(2026, 8, 21)) / 1000,
    );
  assert.ok(y);
  y.state.economy.guardianPermission = true;
  y.state.skills.retail = 0.8;
  y.state.economy.expectations.minimumNetCents = 15000;
  const listingYouth = td.jobs.find((x) => x.payload.holiday);
  assert.ok(E.applyForJob(td, y, passingJobFixture(td, y, listingYouth, when, E, S), when, te).ok);
  for (const q of tt.people)
    db.prepare("UPDATE lw_sims SET state=?,profile=? WHERE id=?").run(
      j(q.state),
      j(q.profile),
      q.id,
    );
  db.transaction(() => S.commitEconomy(td))();
  db.prepare("UPDATE lw_worlds SET seconds=? WHERE world_id=?").run(
    when,
    small.worldId,
  );
  for (let i = 0; i < 5; i++)
    await advanceTown(user, small.worldId, { minutes: 60, story: false });
  const afterYouth = E.economicDraft(loadTown(small.worldId)),
    yc = afterYouth.contracts.get(y.id);
  assert.ok(
    yc.payload.pendingGrossCents > 0,
    "Holiday work must earn an actual wage entitlement",
  );
  assert.ok(Object.values(yc.payload.workedByDay).every((s) => s <= 4 * 3600));
  const { foodDestination } =
    await import("../server/living/expanded/index.js");
  const hungry = afterYouth.people.get(
      [...afterYouth.contracts.keys()].find(
        (id) => afterYouth.people.get(id).age >= 18,
      ),
    ),
    hh = E.householdOf(afterYouth, hungry);
  hh.payload.food = { basic: 0, standard: 0, premium: 0 };
  for (const id of [
    hh.payload.jointAccountId,
    ...hh.payload.sharedBy.map((id) =>
      E.ownAccount(afterYouth, afterYouth.people.get(id)),
    ),
  ])
    S.transfer(
      afterYouth,
      id,
      E.fundsOf(afterYouth).external,
      S.balance(afterYouth, id),
      {
        key: { kind: "fixture_meal_shortage", id },
        at: when,
        kind: "declared_test_shock",
      },
    );
  hungry.state.economy.carriedFood = null;
  hungry.state.needs.hunger = 0.9;
  const target = foodDestination(
    afterYouth,
    hungry,
    when,
    afterYouth.calendar.payload.venues.shop.rooms[0],
  );
  assert.equal(target, afterYouth.calendar.payload.venues.shelter.rooms[1]);
  const { abstractAdultService } =
    await import("../server/living/expanded/adult-services.js");
  const child = tt.people.find((q) => q.age < 18);
  assert.equal(
    abstractAdultService(td, y, child, when, te, {
      workerConsent: true,
      clientConsent: true,
    }).ok,
    false,
  );
  console.log(
    "PASS calendar memberships/VAT, partial interest, repeated earned payroll, public evidence/hiring, youth birthday contract boundary, task rescheduling, sourced adult cases, selective archived PERMA clearing, non-destructive migration, voluntary household merging.",
  );
} finally {
  closeOpenSims();
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
}
