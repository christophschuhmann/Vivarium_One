// Same original W100 formula as pinned Open Sims percentile.py. No check grants
// consent, job credentials, a new physical action or money from nowhere.
import { rng } from "../random.js";
import { JOBS, ATTRIBUTE_LABELS } from "./catalog.js";
const bound = (n, low = 1, high = 99) =>
  Math.max(low, Math.min(high, roundEven(n)));
export function roundEven(n) {
  const l = Math.floor(n);
  return n - l === 0.5 ? (l % 2 ? l + 1 : l) : Math.round(n);
}
export function prepareCapabilities(p, seed) {
  const draw = rng(seed + ":aptitudes:" + p.profile.seed_key),
    big = p.state.psychology.big_five;
  if (p.state.aptitudes?.version !== 1) {
    const bias = {
        reasoning: big.openness,
        coordination: big.conscientiousness,
        presence: big.extraversion,
        resolve: big.conscientiousness,
        perception: big.openness,
        stamina: 1 - big.neuroticism,
        strength: 0.5,
      },
      ageFactor =
        p.age < 6
          ? 0.45
          : p.age < 12
            ? 0.7
            : p.age < 18
              ? 0.85
              : p.age >= 75
                ? 0.9
                : 1;
    const attributes = Object.fromEntries(
      Object.keys(ATTRIBUTE_LABELS).map((k) => [
        k,
        bound(
          (31 + 22 * bias[k] + Math.floor(draw() * 30)) * ageFactor,
          10,
          85,
        ),
      ]),
    );
    p.state.aptitudes = {
      version: 1,
      attributes,
      social_skills: Object.fromEntries(
        ["humor", "charm", "empathy", "persuasion", "teamwork", "resolve"].map(
          (k) => [
            k,
            bound(
              23 +
                attributes[k === "resolve" ? "resolve" : "presence"] * 0.35 +
                draw() * 26,
              15,
              85,
            ),
          ],
        ),
      ),
      last_check: null,
      origin: "initialized_capabilities_not_retrospective_achievements",
    };
  }
  p.state.skills ||= {};
  const role = JOBS[p.profile.job];
  if (role && p.state.skills[role.skill] == null)
    p.state.skills[role.skill] = Math.max(
      role.minimum,
      Math.min(0.85, 0.25 + draw() * 0.5),
    );
  for (const k of [
    "craft",
    "cooking",
    "analysis",
    "care",
    "gardening",
    "retail",
    "response",
    "administration",
    "fitness",
    "music",
    "teaching",
    "service",
  ])
    p.state.skills[k] = Math.max(
      0,
      Math.min(
        1,
        Number.isFinite(p.state.skills[k])
          ? p.state.skills[k]
          : 0.08 + draw() * 0.15,
      ),
    );
  p.state.credentials ||= [];
  if (role?.credential && !p.state.credentials.includes(role.credential))
    p.state.credentials.push(role.credential);
  return p.state.aptitudes;
}
export function check(
  p,
  event,
  {
    skill = "craft",
    attribute = "reasoning",
    difficulty = 0,
    social = false,
    seed = 73,
  } = {},
) {
  const apt = p.state.aptitudes,
    skillRating = social
      ? apt.social_skills[skill] || 45
      : bound(20 + 75 * (p.state.skills[skill] ?? 0.22), 15, 95),
    attributeRating = apt.attributes[attribute] || 50;
  const pressure = roundEven(
      20 * Math.max(p.state.needs.fatigue || 0, p.state.needs.hunger || 0) +
        8 * (p.state.needs.thirst || 0),
    ),
    modifier = bound(difficulty, -25, 30),
    threshold = bound(
      0.65 * skillRating + 0.35 * attributeRating + 9 - pressure - modifier,
      5,
      95,
    ),
    roll =
      1 +
      Math.floor(
        rng(
          seed + ":W100:" + p.profile.seed_key + ":" + event.id + ":" + skill,
        )() * 100,
      ),
    grade =
      roll <= Math.max(1, Math.floor(threshold / 5))
        ? "excellent"
        : roll <= threshold
          ? "success"
          : roll >= 100 - Math.max(1, Math.floor((100 - threshold) / 6))
            ? "setback"
            : "mixed";
  const result = {
    task: event.facts.action || event.facts.category || event.type,
    skill,
    skill_rating: skillRating,
    attribute,
    attribute_rating: attributeRating,
    pressure,
    difficulty_modifier: modifier,
    threshold,
    roll,
    grade,
    at: event.end,
    eventId: event.id,
  };
  p.state.aptitudes.last_check = result;
  (event.facts.checks ||= {})[p.id] = result;
  return result;
}
export function train(p, skill, seconds, event, time) {
  const gain = Math.min(0.025, (Math.max(0, seconds) / 3600) * 0.003);
  p.state.skills[skill] = Math.min(1, (p.state.skills[skill] || 0.1) + gain);
  p.state.skill_evidence ||= {};
  p.state.skill_evidence[skill] = { eventId: event.id, at: time, seconds };
}
