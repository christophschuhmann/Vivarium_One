/* One durable score per room. Music changes neither simulation time nor Sim state.
 * Search is lazy; scenes load a single track. Manual choices win over late searches.
 */
import { db, pj, j } from "../db.js";
import { searchMusicCandidates } from "../music_client.js";
const pending = new Map();
export function locationMusicQuery(place) {
  const context = String(place.purpose || "").toLowerCase();
  const choices = [
    [
      /gym|fitness|sport|swimming/,
      "energetic bright instrumental rhythmic workout",
    ],
    [/cinema|theater/, "gentle cinematic atmospheric instrumental"],
    [
      /warehouse|alley|abandoned|industrial/,
      "subtle moody urban ambient instrumental",
    ],
    [/workshop|craft/, "focused warm acoustic steady instrumental"],
    [/university|lecture/, "curious thoughtful light instrumental study"],
    [/bedroom|nursery|sleep/, "gentle warm ambient piano quiet restful home"],
    [/bath|toilet/, "light calm minimal instrumental"],
    [
      /school|classroom|study|campus|laboratory/,
      "curious focused light instrumental piano study",
    ],
    [/library|reading/, "quiet contemplative piano library reading"],
    [/park|garden|forest/, "peaceful acoustic nature outdoors"],
    [/beach|sea/, "relaxed sunny acoustic coastal breeze"],
    [
      /cafe|restaurant|kitchen/,
      "warm inviting soft jazz acoustic everyday conversation",
    ],
    [/police|fire|hospital|care/, "calm reassuring understated instrumental"],
    [
      /street|shop|market/,
      "lively friendly town stroll light upbeat instrumental",
    ],
  ];
  return (
    choices.find(([pattern]) => pattern.test(context))?.[1] ||
    "warm cosy peaceful instrumental everyday life"
  );
}
export function rememberedMusic(worldId, locationId) {
  return (
    db
      .prepare(
        "SELECT music FROM lw_place_music WHERE world_id=? AND location_id=?",
      )
      .get(worldId, locationId)?.music || null
  );
}
export async function proposeMusic(place, query, source = "automatic") {
  const candidates = await searchMusicCandidates({
    query,
    field: "bm25_caption",
  });
  if (!candidates.length) return null;
  return {
    ...candidates[0],
    query,
    candidates,
    source,
    selected_at: new Date().toISOString(),
    location_id: place.id,
  };
}
export function commitMusic(worldId, locationId, music, previous) {
  // Compare-and-swap keeps a user's intervening selection, including during an LLM tick.
  if (previous === null)
    db.prepare(
      "INSERT INTO lw_place_music VALUES (?,?,?) ON CONFLICT(location_id) DO NOTHING",
    ).run(worldId, locationId, j(music));
  else
    db.prepare(
      "UPDATE lw_place_music SET music=? WHERE world_id=? AND location_id=? AND music=?",
    ).run(j(music), worldId, locationId, previous);
  return pj(rememberedMusic(worldId, locationId), null);
}
export async function ensureLocationMusic(worldId, place, query) {
  const previous = rememberedMusic(worldId, place.id);
  if (previous && !query) return pj(previous, null);
  const key = worldId + "|" + place.id + "|" + (query || "");
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    const music = await proposeMusic(
      place,
      query || locationMusicQuery(place),
      query ? "manual_query" : "automatic",
    );
    return music
      ? commitMusic(worldId, place.id, music, previous)
      : pj(rememberedMusic(worldId, place.id), null);
  })();
  pending.set(key, task);
  try {
    return await task;
  } finally {
    pending.delete(key);
  }
}
