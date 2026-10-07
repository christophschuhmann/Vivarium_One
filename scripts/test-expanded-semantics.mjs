import { passingJobFixture } from "./application-fixture.mjs";
// Semantic invariants across money, perception, physical actions and snapshots.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "expanded-invariants-"));
process.env.VIV_DATA_DIR = scratch;
process.env.VIV_SECRET = "expanded-test-only";
const { db, j } = await import("../server/db.js"),
  { createTown, loadTown, advanceTown, busy, insertEvent } =
    await import("../server/living/engine.js"),
  { closeOpenSims } = await import("../server/living/open_sims.js");
const E = await import("../server/living/expanded/economy.js"),
  S = await import("../server/living/expanded/store.js"),
  H = await import("../server/living/expanded/housing.js"),
  T = await import("../server/living/expanded/tom.js"),
  L = await import("../server/living/expanded/leisure.js"),
  C = await import("../server/living/expanded/community.js"),
  W = await import("../server/living/wellbeing.js");
const { buildWorldManifest, importWorldManifest } =
    await import("../server/world_io.js"),
  { createSession } = await import("../server/auth.js"),
  { default: Fastify } = await import("fastify"),
  { default: cookie } = await import("@fastify/cookie"),
  { default: expandedRoutes } = await import("../server/routes/expanded.js");
const user = { id: "expanded-semantic" };
db.prepare(
  "INSERT INTO users(id,email,display_name,created_at,credit_balance) VALUES (?,?,?,?,?)",
).run(
  user.id,
  "semantic@test",
  "Semantic",
  new Date().toISOString(),
  999999999,
);
const second = { id: "other" };
db.prepare(
  "INSERT INTO users(id,email,display_name,created_at) VALUES (?,?,?,?)",
).run(second.id, "other@test", "Other", new Date().toISOString());
let serial = 0;
const emitFor =
  (d) =>
  (type, p, time, facts = {}, others = []) => ({
    id: "fixture_" + ++serial,
    world_id: d.worldId,
    type,
    start: time,
    end: time,
    location_id: p.state.location_id,
    participants: [p.id, ...others],
    facts,
    description: "Ein ausdrücklich angelegter Testfall.",
    journal: [],
    source: "test_fixture",
  });
const app = Fastify();
await app.register(cookie);
let newsMode = "valid";
await app.register(expandedRoutes, {
  newsModel: async (messages) => {
    assert.ok(messages[1].content.includes("publicFacts"));
    assert.ok(!messages[1].content.includes("personalAccountId"));
    if (newsMode === "invalid")
      throw new SyntaxError("Unterminated JSON fixture");
    return {
      json: {
        commentary:
          "Ein verlässlicher Rundblick hilft dabei, die bekannte Lage gemeinsam einzuordnen. Dies ist eine Meinung zu den berichteten Fakten, keine weitere Entscheidung und keine Vorhersage.",
      },
      usage: { prompt_tokens: 0, completion_tokens: 0 },
      rawUsd: 0,
      provider: "test_fixture",
    };
  },
});
const auth = "vsession=" + createSession(user.id),
  request = (method, url, payload, cookie = auth) =>
    app.inject({ method, url, payload, headers: { cookie } });
let assertions = 0;
const ok = (v, msg) => {
  assert.ok(v, msg);
  assertions++;
};
try {
  const { worldId } = await createTown(user, { population: 50, seed: 73 });
  let town = loadTown(worldId),
    d = E.economicDraft(town),
    emit = emitFor(d);
  d.emit = emit;
  const time = town.world.seconds,
    adult = town.people.find(
      (p) =>
        p.age >= 18 && d.contracts.has(p.id) && !p.state.economy.parentalCare,
    ),
    child = town.people.find((p) => p.age < 18),
    other = town.people.find((p) => p.age >= 18 && p.id !== adult.id),
    h = E.householdOf(d, adult);
  // Ledger idempotence, strict cents, world isolation and exact conservation.
  const sum = () =>
    [...d.accounts.values()].reduce((n, a) => n + a.balance_cents, 0);
  assert.equal(sum(), 0);
  const opts = { key: { kind: "repeat" }, at: time, kind: "test_fixture" },
    before = S.balance(d, E.ownAccount(d, adult));
  ok(
    S.transfer(d, E.ownAccount(d, adult), E.ownAccount(d, other), 100, opts).ok,
  );
  ok(
    S.transfer(d, E.ownAccount(d, adult), E.ownAccount(d, other), 100, opts)
      .duplicate,
  );
  assert.equal(S.balance(d, E.ownAccount(d, adult)), before - 100);
  assert.equal(sum(), 0);
  assert.throws(() =>
    S.transfer(d, E.ownAccount(d, adult), "foreign_account", 1, {
      ...opts,
      key: "foreign",
    }),
  );
  assert.throws(() =>
    S.transfer(d, E.ownAccount(d, adult), E.ownAccount(d, other), 0.5, {
      ...opts,
      key: "fraction",
    }),
  );
  const snap = JSON.stringify([...d.accounts.values()]);
  ok(
    !S.transfer(d, E.ownAccount(d, adult), E.ownAccount(d, other), before + 1, {
      ...opts,
      key: "failed",
    }).ok,
  );
  assert.equal(JSON.stringify([...d.accounts.values()]), snap);
  // Work earns a capped entitlement at the actual workplace; no idle income.
  const contract = d.contracts.get(adult.id),
    firm = d.firms.get(contract.payload.firmId);
  adult.state.location_id = firm.payload.workplaceId;
  let event = emit("action_completed", adult, 9 * 3600, {
    action: "work",
    durationSeconds: 3600,
  });
  ok(E.accrueWork(d, adult, event, 3600));
  const earned = contract.payload.pendingGrossCents;
  ok(earned > 0);
  event = emit("action_completed", adult, 10 * 3600, { action: "work" });
  E.accrueWork(d, adult, event, 24 * 3600);
  assert.equal(
    contract.payload.workedByDay[0],
    contract.payload.hoursPerDay * 3600,
  );
  event = emit("action_completed", adult, 11 * 3600, { action: "work" });
  ok(!E.accrueWork(d, adult, event, 3600));
  adult.state.location_id = adult.profile.home.living;
  ok(
    !E.accrueWork(
      d,
      adult,
      emit("action_completed", adult, 12 * 3600, { action: "work" }),
      3600,
    ),
  );
  const cashBeforePay = S.balance(d, E.ownAccount(d, adult));
  E.payroll(d, contract, 12 * 3600, emit);
  ok(S.balance(d, E.ownAccount(d, adult)) > cashBeforePay);
  assert.equal(contract.payload.pendingGrossCents, 0);
  assert.equal(sum(), 0);
  const tx = d.transactions.find((t) => t.kind === "payroll");
  ok(tx && tx.legs.reduce((n, l) => n + l.amount, 0) === 0);
  ok(
    tx.metadata.employeeSocialCents > 0 && tx.metadata.employerSocialCents > 0,
  );
  const cashPaid = S.balance(d, E.ownAccount(d, adult));
  E.payroll(d, contract, 12 * 3600, emit);
  assert.equal(S.balance(d, E.ownAccount(d, adult)), cashPaid);
  // Candidates must match own expectations and skills; private or unverified
  // reputation is never a hidden hiring penalty. Firm evidence is independent.
  const job = d.jobs.find(
    (j) => j.payload.title !== adult.profile.job && !j.payload.holiday,
  );
  adult.state.skills[job.payload.skill] = 1;
  adult.state.economy.expectations = {
    minimumNetCents: 0,
    maxCommuteSeconds: 14400,
    preferredSkill: job.payload.skill,
  };
  if (job.payload.credential)
    adult.state.credentials.push(job.payload.credential);
  ok(E.jobAssessment(d, adult, job, time).eligible);
  adult.state.economy.expectations.minimumNetCents =
    job.payload.estimatedNetCents + 1;
  ok(!E.jobAssessment(d, adult, job, time).eligible);
  adult.state.economy.expectations.minimumNetCents = 0;
  adult.state.skills[job.payload.skill] = job.payload.minimumSkill - 0.01;
  ok(!E.jobAssessment(d, adult, job, time).eligible);
  adult.state.skills[job.payload.skill] = 1;
  const employer = d.firms.get(job.payload.firmId);
  employer.payload.impressions[adult.id] = {
    score: 0.1,
    confidence: 0.8,
    at: time,
    eventIds: ["own_actual_bad_work"],
  };
  ok(
    E.jobAssessment(d, adult, job, time).reasons.some((x) =>
      /dieser Firma|this employer/i.test(x),
    ),
  );
  employer.payload.impressions[adult.id] = {
    score: 0.6,
    confidence: 0.8,
    at: time,
    eventIds: [],
  };
  adult.state.economy.reputation.reliability = 0;
  const rumor = S.put(d, "claim", {
    subjectId: adult.id,
    dimension: "reliability",
    value: -0.9,
    confidence: 1,
    verified: false,
    public: true,
    expiresAt: time + 86400,
    audience: [],
    at: time,
  });
  ok(E.jobAssessment(d, adult, job, time).eligible);
  rumor.payload.verified = true;
  ok(!E.jobAssessment(d, adult, job, time).eligible);
  rumor.payload.verified = false;
  const hired = E.applyForJob(d, adult, passingJobFixture(d, adult, job, time, E, S), time, emit);
  ok(hired.ok);
  ok(adult.profile.workplace_id === job.payload.workplaceId);
  assert.equal(sum(), 0);
  // Supported housing is physically traversed and deposits remain restricted.
  d = E.economicDraft(loadTown(worldId));
  emit = emitFor(d);
  d.emit = emit;
  const vacancy = [...d.properties.values()].find((p) => p.payload.listed),
    mover = [...d.people.values()].find(
      (p) =>
        p.age >= 18 &&
        !E.householdOf(d, p).payload.members.includes(
          vacancy.payload.ownerId,
        ) &&
        E.householdOf(d, p).payload.members.length <= vacancy.payload.capacity,
    ),
    oldLocation = mover.state.location_id,
    house = E.householdOf(d, mover);
  const moved = H.moveHousehold(d, house, vacancy, time, emit, {
    support: true,
  });
  ok(moved.ok);
  assert.equal(mover.state.location_id, oldLocation);
  ok(mover.profile.home.living === vacancy.payload.rooms.living);
  const lease = d.entities.get(moved.leaseId);
  ok(lease.payload.depositHeldCents > 0);
  assert.equal(
    S.balance(d, lease.payload.depositAccountId),
    lease.payload.depositHeldCents,
  );
  assert.equal(
    [...d.accounts.values()].reduce((n, a) => n + a.balance_cents, 0),
    0,
  );
  // No remote fridge, no repeated charge, no imaginary meal relief.
  d = E.economicDraft(loadTown(worldId));
  emit = emitFor(d);
  d.emit = emit;
  const eater = d.people.get(adult.id);
  eater.state.location_id = d.calendar.payload.venues.office.rooms[0];
  delete eater.state.economy.carriedFood;
  ok(
    !E.consumeFood(
      d,
      eater,
      emit("action_completed", eater, time, { action: "eat" }),
      time,
    ),
  );
  eater.state.economy.carriedFood = {
    portions: 1,
    tier: "basic",
    packedAt: time,
    sourceEventId: "actual_packed_fixture",
  };
  const count = d.transactions.length;
  ok(
    E.consumeFood(
      d,
      eater,
      emit("action_completed", eater, time, { action: "eat" }),
      time,
    ),
  );
  assert.equal(d.transactions.length, count);
  assert.equal(eater.state.economy.carriedFood.portions, 0);
  // A funded loan changes liquidity and debt by the same principal, not wealth.
  const borrower = [...d.people.values()].find(
    (p) =>
      p.age >= 18 &&
      E.householdForecast(d, E.householdOf(d, p), time).marginCents > 50000,
  );
  ok(borrower);
  const oldCash = S.balance(d, E.ownAccount(d, borrower)),
    loan = E.issueLoan(
      d,
      borrower,
      { amountCents: 10000, months: 12, consent: true },
      time,
      emit,
    );
  ok(loan.ok);
  assert.equal(
    S.balance(d, E.ownAccount(d, borrower)) -
      d.entities.get(loan.loanId).payload.principalCents,
    oldCash,
  );
  ok(
    !E.issueLoan(
      d,
      borrower,
      { amountCents: 10000, months: 12, annualRate: Infinity, consent: true },
      time,
      emit,
    ).ok,
  );
  ok(
    !E.issueLoan(
      d,
      d.people.get(child.id),
      { amountCents: 10000, months: 12, consent: true },
      time,
      emit,
    ).ok,
  );
  S.assertEconomicIntegrity(d);
  // First-person probabilities and second-order views never read hidden minds.
  const a = d.people.get(adult.id),
    b = d.people.get(other.id),
    encounter = emit(
      "social",
      a,
      time,
      { category: "small_talk", outcome: "accepted" },
      [b.id],
    );
  const p1 = T.predict(a, b, d.town, encounter);
  b.state.economy.cashCents = 1e12;
  b.state.thought = "A secret";
  b.state.psychology.big_five.neuroticism = 0;
  b.state.economy.threats = [{ kind: "hidden" }];
  assert.deepEqual(T.predict(a, b, d.town, encounter), p1);
  T.observeSocial(d, d.town, a, b, encounter);
  const p2 = T.predict(a, b, d.town, encounter);
  ok(p2.sourceRefs.some((s) => s.eventId === encounter.id));
  assert.equal(Object.keys(a.state.social_cognition.metabeliefs).length, 1);
  ok(Object.values(p2.probabilities).reduce((n, x) => n + x, 0) > 0.999999);
  ok(p2.probabilities.unknown > 0);
  const adultState = JSON.stringify(d.people.get(child.id).state.economy);
  ok(
    !C.substanceUse(d, d.people.get(child.id), "alcohol", time, emit, {
      consent: true,
    }).ok,
  );
  ok(!C.crimeEpisode(d, d.people.get(child.id), "theft", time, emit).ok);
  assert.equal(
    JSON.stringify(d.people.get(child.id).state.economy),
    adultState,
  );
  // More than 128 positive sources do not erase earlier days. Full source
  // journals remain durable; score history uses bounded calendar aggregates.
  const well = structuredClone(a);
  delete well.state.wellbeing;
  well.state.affect = { states: [] };
  well.state.needs = Object.fromEntries(
    Object.keys(well.state.needs).map((k) => [k, 0]),
  );
  W.projectWellbeing(well, time);
  for (let i = 0; i < 300; i++)
    W.recordExperience(
      well,
      { id: "perma_" + i, description: "Ein eigener Beitrag" },
      time + Math.floor(i / 150) * 86400,
      "fixture",
      { R: 0.01 },
      "Eigene tatsächliche Erfahrung",
    );
  assert.equal(well.state.wellbeing.evidence.length, 128);
  ok(Object.keys(well.state.wellbeing.historyDays).length);
  W.projectWellbeing(well, time + 86400);
  ok(
    well.state.wellbeing.scores.R > 0.64,
    "Two supported days survive an evidence-ring rotation",
  );
  // Atomic failure/cancellation includes fiscal postings, jobs, duties and news.
  const unchanged = () => {
    const m = buildWorldManifest(worldId);
    delete m.exported_at;
    return j(m);
  };
  const beforeFail = unchanged();
  await assert.rejects(
    advanceTown(user, worldId, {
      minutes: 5,
      story: true,
      modelCall: async () => ({ content: "not JSON" }),
    }),
  );
  assert.equal(unchanged(), beforeFail);
  const controller = new AbortController();
  await assert.rejects(
    advanceTown(user, worldId, {
      minutes: 5,
      story: true,
      signal: controller.signal,
      modelCall: async () => {
        controller.abort();
        return { content: "{}" };
      },
    }),
  );
  assert.equal(unchanged(), beforeFail);
  // Complete exports remap every account/contract/leg and reject corruption.
  const copied = importWorldManifest(user, buildWorldManifest(worldId), null),
    copy = E.economicDraft(loadTown(copied.worldId));
  ok(copy.accounts.size === E.economicDraft(loadTown(worldId)).accounts.size);
  ok(
    [...copy.accounts.keys()].every(
      (id) => !E.economicDraft(loadTown(worldId)).accounts.has(id),
    ),
  );
  assert.equal(
    [...copy.accounts.values()].reduce((n, a) => n + a.balance_cents, 0),
    0,
  );
  await advanceTown(user, copied.worldId, { minutes: 1, story: false });
  const tampered = buildWorldManifest(worldId);
  tampered.living.lw_economy_accounts[1].balance_cents++;
  const worldsBefore = db.prepare("SELECT count(*) n FROM worlds").get().n;
  assert.throws(() => importWorldManifest(user, tampered, null), /balance/);
  assert.equal(
    db.prepare("SELECT count(*) n FROM worlds").get().n,
    worldsBefore,
  );
  const url = "/api/living/worlds/" + worldId;
  let response = await request("GET", url + "/economy");
  assert.equal(response.statusCode, 200, response.body);
  const overview = response.json();
  ok(overview.person.mind.wellbeing && overview.person.attributes.length === 7);
  response = await request("POST", url + "/economy/actions", {
    kind: "expectations",
    simId: adult.id,
    expectedVersion: overview.version,
    minimumNetCents: 120000,
    maxCommuteSeconds: 1800,
  });
  assert.equal(response.statusCode, 200, response.body);
  response = await request("POST", url + "/economy/actions", {
    kind: "expectations",
    simId: adult.id,
    expectedVersion: overview.version,
    minimumNetCents: 100000,
    maxCommuteSeconds: 1800,
  });
  assert.equal(response.statusCode, 409);
  const noConsentBefore = unchanged();
  response = await request("POST", url + "/economy/actions", {
    kind: "loan",
    simId: adult.id,
    expectedVersion: overview.version + 1,
    amountCents: 10000,
    months: 12,
    consent: false,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, false);
  assert.equal(response.json().version, overview.version + 1);
  assert.equal(unchanged(), noConsentBefore);
  // A malformed model commentary must release the lock and preserve the complete snapshot.
  const nd = E.economicDraft(loadTown(worldId)),
    np = nd.people.get(adult.id),
    ne = emitFor(nd)("public_weather_fixture", np, nd.town.world.seconds, {
      public: true,
    });
  ne.description =
    "Für diese isolierte Stadt wurde eine milde öffentliche Wetterlage als Testereignis festgelegt.";
  const publicNews = C.publicNews(nd, ne, {
    title: "Belegte Test-Wetterlage",
    body: ne.description,
  });
  db.transaction(() => {
    insertEvent(ne, []);
    S.commitEconomy(nd);
  })();
  newsMode = "invalid";
  const newsBefore = unchanged();
  response = await request(
    "POST",
    url + "/news/" + publicNews.id + "/commentary",
    { expectedVersion: overview.version + 1 },
  );
  assert.equal(response.statusCode, 502);
  assert.equal(unchanged(), newsBefore);
  assert.equal(busy.has(worldId), false);
  newsMode = "valid";
  response = await request(
    "POST",
    url + "/news/" + publicNews.id + "/commentary",
    { expectedVersion: overview.version + 1 },
  );
  assert.equal(response.statusCode, 200);
  const annotated = E.economicDraft(loadTown(worldId)).entities.get(
    publicNews.id,
  );
  assert.equal(annotated.payload.body, publicNews.payload.body);
  assert.equal(
    annotated.payload.editorialStatus,
    "labelled_commentary_not_new_fact",
  );
  const otherCookie = "vsession=" + createSession(second.id);
  assert.equal(
    (await request("GET", url + "/economy", null, otherCookie)).statusCode,
    404,
  );
  busy.add(worldId);
  assert.equal(
    (
      await request("POST", url + "/economy/actions", {
        kind: "support",
        simId: adult.id,
        expectedVersion: overview.version + 1,
      })
    ).statusCode,
    409,
  );
  busy.delete(worldId);
  console.log(
    "PASS",
    assertions,
    "expanded semantic checks plus exact money/payroll, qualified hiring and reputational privacy, physical housing/deposits, real meals, funded debt, uncertain private ToM, adult-only risk, PERMA calendar memory, whole-tick rollback, complete import isolation/corruption rejection, authenticated API/version locks.",
  );
} finally {
  await app.close();
  closeOpenSims();
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
}
