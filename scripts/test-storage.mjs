import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "vivarium-storage-"));
process.env.VIV_DATA_DIR = scratch;
process.env.MOCK_PROVIDERS = "1";
globalThis.fetch = async () =>
  Response.json({
    ready: true,
    available_tracks: 2580,
    engine: "test fixture",
  });
const { db, ASSET_DIR, setSetting } = await import("../server/db.js");
const { saveAsset, assetPath } = await import("../server/assets.js");
const { createSession } = await import("../server/auth.js");
const { isolatedRequest } = await import("../server/byok.js");
const { buildWorldManifest, importWorldManifest } =
  await import("../server/world_io.js");
const { default: Fastify } = await import("fastify");
const { default: cookie } = await import("@fastify/cookie");
const { default: multipart } = await import("@fastify/multipart");
const { default: apiRoutes } = await import("../server/routes/api.js");
const { default: storageRoutes } = await import("../server/routes/storage.js");
const app = Fastify();
app.addHook("onRequest", (req, reply, done) => isolatedRequest(done));
await app.register(cookie);
await app.register(multipart);
await app.register(apiRoutes);
await app.register(storageRoutes);
function user(id) {
  db.prepare(
    "INSERT INTO users(id,email,display_name,email_verified_at,created_at) VALUES (?,?,?,?,?)",
  ).run(
    id,
    id + "@test.local",
    id,
    new Date().toISOString(),
    new Date().toISOString(),
  );
  return { id };
}
const alice = user("alice"),
  bob = user("bob");
const ac = "vsession=" + createSession(alice.id),
  bc = "vsession=" + createSession(bob.id);
const inject = (method, url, payload, session = ac) =>
  app.inject({
    method,
    url,
    headers: { cookie: session },
    ...(payload ? { payload } : {}),
  });
try {
  let result = await inject("POST", "/api/worlds", { title: "Original" });
  assert.equal(result.statusCode, 200);
  const world = result.json().world;
  const pixels = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvV0AAAAASUVORK5CYII=",
    "base64",
  );
  const image = saveAsset({
    userId: alice.id,
    worldId: world.id,
    kind: "cover",
    buffer: pixels,
    mime: "image/png",
    prompt: "test cover",
  });
  db.prepare("UPDATE worlds SET cover_asset_id=? WHERE id=?").run(
    image.id,
    world.id,
  );
  const score = saveAsset({
    userId: alice.id,
    worldId: world.id,
    kind: "music",
    buffer: Buffer.from("fixture music"),
    mime: "audio/mpeg",
  });
  db.prepare("UPDATE worlds SET current_music=? WHERE id=?").run(
    JSON.stringify({ url: "/api/assets/" + score.id }),
    world.id,
  );
  fs.writeFileSync(assetPath(image) + "_w320.jpg", Buffer.alloc(32));
  result = await inject("DELETE", "/api/storage/assets/" + image.id, {
    confirm: image.id,
  });
  assert.equal(result.statusCode, 409);
  result = await inject(
    "POST",
    "/api/storage/assets/" + image.id + "/duplicate",
    {},
    bc,
  );
  assert.equal(result.statusCode, 404);
  result = await inject(
    "POST",
    "/api/storage/assets/export",
    { ids: [image.id] },
    bc,
  );
  assert.equal(result.statusCode, 404);
  result = await inject("GET", "/api/storage", null, bc);
  assert.equal(result.json().assets.count, 0);
  assert.equal(result.json().worlds.length, 0);
  result = await inject(
    "POST",
    "/api/storage/music/manage",
    { action: "remove-library", confirm: "DELETE MUSIC LIBRARY" },
    bc,
  );
  assert.equal(result.statusCode, 403);
  result = await inject(
    "POST",
    "/api/storage/assets/" + image.id + "/duplicate",
    {},
  );
  assert.equal(result.statusCode, 200);
  const duplicate = result.json().asset;
  result = await inject("POST", "/api/storage/assets/export", {
    ids: [image.id, duplicate.id],
  });
  assert.equal(result.statusCode, 200);
  let link = await inject("POST", "/api/storage/assets/export-link", {
    ids: [image.id, duplicate.id],
  });
  assert.equal(link.statusCode, 200);
  const exportUrl = link.json().url;
  assert.equal((await inject("GET", exportUrl, null, bc)).statusCode, 404);
  assert.equal((await inject("GET", exportUrl)).statusCode, 200);
  const zip = path.join(scratch, "assets.zip");
  fs.writeFileSync(zip, result.rawPayload);
  const names = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" });
  assert.ok(names.includes(image.file));
  assert.ok(names.includes(duplicate.id + ".json"));
  assert.ok(names.includes("manifest.json"));
  result = await inject("POST", `/api/worlds/${world.id}/duplicate`, {
    title: "Independent copy",
  });
  assert.equal(result.statusCode, 200);
  const copyId = result.json().worldId;
  const copy = db.prepare("SELECT * FROM worlds WHERE id=?").get(copyId);
  assert.notEqual(copy.cover_asset_id, image.id);
  const copyAsset = db
    .prepare("SELECT * FROM assets WHERE id=?")
    .get(copy.cover_asset_id);
  assert.notEqual(copyAsset.file, image.file);
  assert.deepEqual(fs.readFileSync(assetPath(copyAsset)), pixels);
  const copiedMusic = JSON.parse(copy.current_music).url.split("/").pop();
  assert.notEqual(copiedMusic, score.id);
  assert.ok(
    db
      .prepare("SELECT * FROM assets WHERE id=? AND world_id=?")
      .get(copiedMusic, copyId),
  );
  const legacy = importWorldManifest(
    alice,
    buildWorldManifest(world.id),
    null,
    { reuseAssets: true },
  );
  result = await inject("DELETE", "/api/worlds/" + world.id);
  assert.equal(result.statusCode, 200);
  assert.ok(fs.existsSync(assetPath(copyAsset)));
  assert.ok(fs.existsSync(assetPath(image)));
  const legacyManifest = buildWorldManifest(legacy.worldId);
  assert.ok(legacyManifest.assets.some((asset) => asset.id === image.id));
  result = await inject("GET", `/api/worlds/${legacy.worldId}/export/zip`);
  assert.equal(result.statusCode, 200);
  const worldZip = path.join(scratch, "world.zip");
  fs.writeFileSync(worldZip, result.rawPayload);
  assert.ok(
    execFileSync("unzip", ["-Z1", worldZip], { encoding: "utf8" }).includes(
      image.file,
    ),
  );
  const unpacked = path.join(scratch, "restore");
  fs.mkdirSync(unpacked);
  execFileSync("unzip", ["-q", worldZip, "-d", unpacked]);
  const restored = importWorldManifest(
    alice,
    JSON.parse(fs.readFileSync(path.join(unpacked, "manifest.json"))),
    path.join(unpacked, "assets"),
  );
  assert.equal(restored.missingAssetBinaries, 0);
  result = await inject("DELETE", "/api/worlds/" + legacy.worldId);
  assert.equal(result.statusCode, 200);
  result = await inject("DELETE", "/api/storage/assets/" + image.id, {
    confirm: "wrong",
  });
  assert.equal(result.statusCode, 400);
  result = await inject("DELETE", "/api/storage/assets/" + image.id, {
    confirm: image.id,
  });
  assert.equal(result.statusCode, 200);
  assert.ok(result.json().freedBytes >= pixels.length + 32);
  assert.ok(!fs.existsSync(assetPath(image)));
  assert.ok(!fs.existsSync(assetPath(image) + "_w320.jpg"));
  assert.ok(fs.existsSync(assetPath(copyAsset)));
  result = await inject("GET", "/api/storage/assets?unused=1");
  assert.ok(result.json().assets.some((a) => a.id === duplicate.id));
  assert.ok(result.json().assets.every((a) => a.usedBy.length === 0));
  result = await inject("GET", "/api/storage");
  assert.equal(result.statusCode, 200);
  assert.equal(result.json().projects.count, 2);
  assert.equal(result.json().music.canManage, false);
  assert.ok(result.json().assets.bytes >= pixels.length * 3);
  setSetting("local_owner_user_id", alice.id);
  result = await inject("GET", "/api/storage");
  assert.equal(result.json().music.canManage, true);
  process.env.MUSIC_READ_ONLY = "1";
  result = await inject("GET", "/api/storage");
  assert.equal(result.json().music.readOnly, true);
  assert.equal(result.json().music.managed, false);
  result = await inject("POST", "/api/storage/music/manage", {
    action: "remove-library",
    confirm: "DELETE MUSIC LIBRARY",
  });
  assert.equal(result.statusCode, 409);
  assert.equal(result.json().code, "READ_ONLY_MUSIC");
  delete process.env.MUSIC_READ_ONLY;
  console.log(
    "PASS ownership, protected referenced assets, asset ZIP and duplication, independent scenario copying, shared-branch survival, ZIP restore, thumbnail cleanup and storage accounting",
  );
} finally {
  await app.close();
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
}
