// Isolated music service + actual routes/engine. No live API calls or production DB.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const scratch = fs.mkdtempSync(
  path.join(os.tmpdir(), "vivarium-location-music-"),
);
process.env.VIV_DATA_DIR = scratch;
process.env.VIV_SECRET = "test-location-music";
process.env.MUSIC_API_URL = "http://music-fixture.invalid";
const realFetch = globalThis.fetch;
let searches = 0,
  release = null,
  hold = false,
  fail = false;
globalThis.fetch = async (url, opts) => {
  assert.equal(new URL(url).hostname, "music-fixture.invalid");
  searches++;
  if (hold) {
    hold = false;
    await new Promise((r) => (release = r));
  }
  if (fail) throw Error("fixture unavailable");
  return Response.json({
    results: [
      {
        row_id: 1,
        title: "Piano",
        available: true,
        music_whisper_caption: "calm",
        has_singing: "no",
        duration_seconds: 30,
      },
    ],
  });
};
const { db } = await import("../server/living/schema.js");
const { createTown, loadTown, advanceTown } =
  await import("../server/living/engine.js");
const { closeOpenSims } = await import("../server/living/open_sims.js");
const { encryptSecret, withPrincipal, isolatedRequest } =
  await import("../server/byok.js");
const { createSession } = await import("../server/auth.js");
const { locationMusicQuery, rememberedMusic } =
  await import("../server/living/music.js");
const { buildWorldManifest, importWorldManifest } =
  await import("../server/world_io.js");
const { default: Fastify } = await import("fastify"),
  { default: cookie } = await import("@fastify/cookie");
const { default: livingRoutes } = await import("../server/routes/living.js"),
  { default: apiRoutes } = await import("../server/routes/api.js");
for (const id of ["alice", "bob"])
  db.prepare(
    "INSERT INTO users(id,email,display_name,email_verified_at,created_at,hypr_key,or_enabled) VALUES (?,?,?,?,?,?,1)",
  ).run(
    id,
    id + "@local",
    id,
    new Date().toISOString(),
    new Date().toISOString(),
    encryptSecret("fixture-only-key"),
  );
const user = db.prepare("SELECT * FROM users WHERE id='alice'").get(),
  app = Fastify();
app.addHook("onRequest", (req, reply, done) => isolatedRequest(done));
await app.register(cookie);
await app.register(livingRoutes);
await app.register(apiRoutes);
const sessions = {
  alice: "vsession=" + createSession("alice"),
  bob: "vsession=" + createSession("bob"),
};
const request = (url, payload = {}, who = "alice") =>
  app.inject({
    method: "POST",
    url,
    headers: { cookie: sessions[who] },
    payload,
  });
try {
  const { worldId } = await createTown(user, { population: 10, seed: 73 }),
    town = loadTown(worldId),
    room = town.people[0].location_id,
    url = `/api/living/worlds/${worldId}/places/${room}/music`;
  assert.notEqual(
    locationMusicQuery({ purpose: "bedroom" }),
    locationMusicQuery({ purpose: "shopping street" }),
  );
  const results = await Promise.all(
    Array.from({ length: 6 }, () => request(url)),
  );
  assert.equal(searches, 1);
  assert.ok(results.every((r) => r.statusCode === 200));
  const first = results[0].json().music;
  assert.ok(first.query && first.candidates.length);
  assert.equal(
    (await request(url)).json().music.selected_at,
    first.selected_at,
  );
  assert.equal(searches, 1);
  assert.equal(loadTown(worldId).world.seconds, town.world.seconds);
  assert.equal(loadTown(worldId).world.version, town.world.version);
  assert.equal((await request(url, {}, "bob")).statusCode, 404);
  assert.equal((await request(url, { query: "" })).statusCode, 400);
  assert.equal(
    (
      await request(
        `/api/living/worlds/${worldId}/places/${town.people[0].household_id}/music`,
      )
    ).statusCode,
    404,
  );
  // A late search cannot replace a newer manual choice.
  hold = true;
  const racing = request(url, { query: "warm jazz" });
  while (!release) await new Promise((r) => setTimeout(r, 5));
  const chosen = await request(`/api/worlds/${worldId}/music-choice`, {
    locationId: room,
    music: first,
    query: "my manual piano",
    candidates: first.candidates,
  });
  assert.equal(chosen.statusCode, 200);
  release();
  await racing;
  assert.equal(
    JSON.parse(rememberedMusic(worldId, room)).query,
    "my manual piano",
  );
  // Storyteller selections are scoped to currently occupied rooms and committed with the tick.
  const stable = town.people[0],
    stableState = structuredClone(stable.state);
  stableState.action = {
    kind: "sleep",
    started: town.world.seconds,
    until: town.world.seconds + 1800,
  };
  stableState.needs.fatigue = 0.8;
  stableState.route = null;
  db.prepare("UPDATE lw_sims SET state=? WHERE id=?").run(
    JSON.stringify(stableState),
    stable.id,
  );
  let proposalPlace = null;
  await withPrincipal(user, () =>
    advanceTown(user, worldId, {
      minutes: 1,
      story: true,
      modelCall: async (messages) => {
        const c = JSON.parse(messages[1].content);
        const currentPlace = c.sims.find(
          (p) => town.places.get(p.location)?.kind === "room",
        )?.location;
        proposalPlace ||= currentPlace;
        return {
          content: JSON.stringify({
            story: "Eine tatsächliche Szene.",
            thoughts: c.owned.map((id) => ({
              simId: id,
              eventId: c.events.find((e) => e.participants.includes(id)).id,
              text: "Ich denke über diesen tatsächlich erlebten Moment nach.",
              confidence: 0.6,
            })),
            music: [
              {
                locationId: currentPlace,
                query: "thoughtful instrumental evening",
              },
              { locationId: "foreign", query: "must reject" },
            ],
          }),
        };
      },
    }),
  );
  assert.equal(
    JSON.parse(rememberedMusic(worldId, proposalPlace)).source,
    "storyteller",
  );
  const count = searches;
  await request(`/api/living/worlds/${worldId}/places/${proposalPlace}/music`);
  assert.equal(searches, count);
  const before = rememberedMusic(worldId, proposalPlace),
    clock = loadTown(worldId).world;
  fail = true;
  await withPrincipal(user, () =>
    advanceTown(user, worldId, {
      minutes: 1,
      story: true,
      modelCall: async (messages) => {
        const c = JSON.parse(messages[1].content);
        return {
          content: JSON.stringify({
            thoughts: c.owned.map((id) => ({
              simId: id,
              eventId: c.events.find((e) => e.participants.includes(id)).id,
              text: "Ich denke über diesen tatsächlich erlebten Moment nach.",
              confidence: 0.6,
            })),
            music: [
              {
                locationId: c.sims.find(
                  (p) => town.places.get(p.location)?.kind === "room",
                )?.location,
                query: "unavailable new score",
              },
            ],
          }),
        };
      },
    }),
  );
  fail = false;
  assert.equal(
    rememberedMusic(worldId, proposalPlace),
    before,
    "failed retrieval preserves durable music",
  );
  assert.equal(loadTown(worldId).world.version, clock.version + 1);
  const manifest = buildWorldManifest(worldId),
    copy = importWorldManifest(user, manifest, null),
    copied = db
      .prepare("SELECT * FROM lw_place_music WHERE world_id=?")
      .all(copy.worldId);
  assert.equal(copied.length, manifest.living.lw_place_music.length);
  assert.ok(
    copied.every((r) =>
      JSON.parse(r.music).location_id
        ? r.location_id === JSON.parse(r.music).location_id
        : true,
    ),
  );
  assert.ok(
    copied.every((r) =>
      db
        .prepare("SELECT 1 FROM lw_places WHERE id=? AND world_id=?")
        .get(r.location_id, copy.worldId),
    ),
  );
  fs.mkdirSync("artifacts/expanded-world", { recursive: true });
  fs.writeFileSync(
    "artifacts/expanded-world/location-music-review.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        isolatedDatabase: true,
        paidProviderCalls: 0,
        durableLocationSelection: true,
        concurrentSearchDeduplication: true,
        newerManualChoiceWins: true,
        storytellerScopeChecked: true,
        failedSearchKeepsTrack: true,
        worldClockPreserved: true,
        accessIsolation: true,
        exportAndCopyRemap: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS durable per-location query/music, deduplication, manual race, scoped storyteller change, failure fallback, access isolation and export/import.",
  );
} finally {
  globalThis.fetch = realFetch;
  await app.close();
  closeOpenSims();
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
}
