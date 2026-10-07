// Lifecycle suites need a successful application to exercise the resulting
// contract. Declare a separate fixture vacancy with a reproducible passing roll;
// production probabilities are untouched, and refusal behavior is tested apart.
import { rng } from "../server/living/random.js";
const APPLICATION_COOLDOWN = 7 * 86400;
export function passingJobFixture(d, p, listing, time, E, S) {
  for (let i = 0; i < 1000; i++) {
    const id = listing.id + "_success_fixture_" + i;
    const assessment = E.jobAssessment(d, p, listing, time);
    const roll =
      Math.floor(
        rng(
          d.town.world.seed +
            ":application:job:" +
            p.id +
            ":" +
            id +
            ":" +
            Math.floor(time / APPLICATION_COOLDOWN),
        )() * 100,
      ) + 1;
    if (assessment.eligible && roll <= Math.floor(assessment.probability * 100))
      return S.put(d, "job", structuredClone(listing.payload), { id });
  }
  throw new Error("No eligible successful fixture");
}
