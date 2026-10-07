import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "vivarium-expanded-"));
process.env.VIV_DATA_DIR = scratch;
const { db, j } = await import("../server/db.js");
const { createTown, loadTown, advanceTown } =
  await import("../server/living/engine.js");
const { closeOpenSims, openSimsCatalog } =
  await import("../server/living/open_sims.js");
const {
  economicDraft,
  jobAssessment,
  applyForJob,
  ownAccount,
  householdOf,
  householdForecast,
  payroll,
  consumeFood,
  issueLoan,
} = await import("../server/living/expanded/economy.js");
const { rows, balance, transfer, commitEconomy, assertEconomicIntegrity } =
  await import("../server/living/expanded/store.js");
const { predict } = await import("../server/living/expanded/tom.js");
const { substanceUse, crimeEpisode } =
  await import("../server/living/expanded/community.js");
const user = { id: "expanded-test" };
db.prepare(
  "INSERT INTO users(id,email,display_name,created_at,credit_balance) VALUES (?,?,?,?,?)",
).run(user.id, "exp@test", "Expansion", new Date().toISOString(), 999999999);
const emitFor =
  (d) =>
  (type, p, time, facts = {}, others = []) => ({
    id: "fixture_" + Math.random(),
    world_id: d.worldId,
    type,
    start: time,
    end: time,
    location_id: p.state.location_id,
    participants: [p.id, ...others],
    facts,
    description: "",
    journal: [],
  });
try {
  const { worldId } = await createTown(user, { population: 20, seed: 73 });
  let town = loadTown(worldId),
    d = economicDraft(town),
    emit = emitFor(d);
  d.emit = emit;
  assert.ok(d);
  assert.equal(
    [...d.accounts.values()].reduce((n, a) => n + a.balance_cents, 0),
    0,
  );
  assertEconomicIntegrity(d);
  const adult = town.people.find((p) => p.age >= 18 && d.contracts.has(p.id)),
    other = town.people.find((p) => p.age >= 18 && p.id !== adult.id),
    minor = town.people.find((p) => p.age < 18);
  assert.ok(minor);
  const before = JSON.stringify([...d.accounts.values()]);
  const result = transfer(
    d,
    ownAccount(d, adult),
    ownAccount(d, other),
    balance(d, ownAccount(d, adult)) + 1,
    {
      key: { kind: "failed_fixture" },
      at: town.world.seconds,
      kind: "fixture",
    },
  );
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify([...d.accounts.values()]), before);
  const e = {
    id: "own_encounter",
    end: town.world.seconds,
    location_id: adult.state.location_id,
    facts: { category: "small_talk" },
    participants: [adult.id, other.id],
  };
  const prior = predict(adult, other, town, e);
  other.state.economy.cashCents = 1e12;
  other.state.thought = "private different thought";
  other.state.social_cognition.contacts = {};
  assert.deepEqual(predict(adult, other, town, e), prior);
  assert.ok(
    Math.abs(
      Object.values(prior.probabilities).reduce((a, b) => a + b, 0) - 1,
    ) < 1e-12,
  );
  assert.ok(prior.probabilities.unknown > 0);
  assert.equal(
    substanceUse(d, minor, "alcohol", town.world.seconds, emit, {
      consent: true,
    }).ok,
    false,
  );
  minor.state.economy.criminalRole = { kind: "theft" };
  assert.equal(
    crimeEpisode(d, minor, "theft", town.world.seconds, emit).ok,
    false,
  );
  delete minor.state.economy.criminalRole;
  const listing = d.jobs.find(
    (x) => !x.payload.holiday && x.payload.title !== adult.profile.job,
  );
  adult.state.skills[listing.payload.skill] = 0;
  assert.ok(
    jobAssessment(d, adult, listing, town.world.seconds).reasons.some(x=>/Fertigkeit noch unter der Anforderung|Skill .*below the requirement/i.test(x)),
  );
  await advanceTown(user, worldId, { minutes: 5, story: false });
  town = loadTown(worldId);
  d = economicDraft(town);
  assertEconomicIntegrity(d);
  assert.equal(
    [...d.accounts.values()].reduce((n, a) => n + a.balance_cents, 0),
    0,
  );
  assert.ok(rows(d, "news").length);
  assert.ok(rows(d, "obligation").length);
  assert.equal(town.world.seconds, 27300);
  assert.ok(
    town.people.every(
      (p) =>
        p.state.aptitudes?.attributes &&
        p.state.economy &&
        p.state.social_cognition,
    ),
  );
  for (let i = 0; i < 6; i++)
    await advanceTown(user, worldId, { minutes: 60, story: false });
  town = loadTown(worldId);
  d = economicDraft(town);
  assertEconomicIntegrity(d);
  assert.ok(rows(d, "employment").some((c) => c.payload.pendingGrossCents > 0));
  console.log(
    "PASS expanded: balanced resources; rollback-safe failure; actual work; public news; duties; first-person ToM isolation; age-safe risk guards.",
  );
} finally {
  closeOpenSims();
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
}
