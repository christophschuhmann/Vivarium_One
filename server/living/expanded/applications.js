// Applications are actual records, not guaranteed contracts. Deterministic
// review windows prevent rerolling the same bid; only relevant disclosed facts
// count. Wealth never buys professional skill and is never an employer secret.
import { rng } from "../random.js";
import { put } from "./store.js";
import { addFeeling } from "../cognition.js";
import { recordExperience } from "../wellbeing.js";
export const APPLICATION_COOLDOWN = 7 * 86400;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function jobChance(p, x, firm, time) {
  const skill = p.state.skills[x.skill] || 0,
    impression = firm?.payload.impressions?.[p.id];
  const documented =
    impression &&
    impression.confidence >= 0.6 &&
    time - impression.at < 30 * 86400
      ? impression.score - 0.5
      : 0;
  const education = (p.profile.education?.history || []).filter(
    (e) => e.status === "completed" && e.skill === x.skill,
  );
  const educationFit = education.length
    ? Math.max(...education.map((e) => e.gradeScale?.startsWith("GPA") ? (e.grade ?? 2.5)/4 : (4 - (e.grade || 3)) / 3))
    : 0;
  const communication =
    (p.state.aptitudes?.social_skills?.teamwork || 40) / 100;
  const competition = Math.min(0.16, 0.08 / Math.max(1, x.slots));
  return {
    probability: clamp(
      0.53 +
        clamp(skill - x.minimumSkill, 0, 0.65) * 0.43 +
        documented * 0.24 +
        educationFit * 0.09 +
        (communication - 0.4) * 0.12 -
        competition,
      0.15,
      0.95,
    ),
    factors: [
      {
        label: "Praktisches Können über der Mindestanforderung",
        value: Math.round((skill - x.minimumSkill) * 100),
      },
      {
        label: "Passender dokumentierter Bildungsweg",
        value: education.length ? "vorhanden" : "nicht zusätzlich belegt",
      },
      {
        label: "Eigene belegte Erfahrung dieser Firma",
        value:
          documented > 0 ? "positiv" : documented < 0 ? "belastet" : "neutral",
      },
      { label: "Offene Plätze und Konkurrenz", value: x.slots },
    ],
  };
}
export function latestApplication(p, kind, targetId) {
  return (p.state.economy.applications || []).findLast(
    (a) => a.kind === kind && a.targetId === targetId,
  );
}
export function decideApplication(
  d,
  p,
  kind,
  targetId,
  time,
  assessment,
  emit,
) {
  const previous = latestApplication(p, kind, targetId);
  if (previous && time - previous.at < APPLICATION_COOLDOWN)
    return {
      ok: false,
      status: "cooldown",
      reason:
        "Diese Bewerbung wurde bereits geprüft. Frühestens nach sieben Tagen ist eine erneute Bewerbung möglich.",
      application: previous,
      eventId: previous.sourceEventId,
    };
  const probability = assessment.eligible ? assessment.probability || 0.5 : 0;
  const roll =
    Math.floor(
      rng(
        d.town.world.seed +
          ":application:" +
          kind +
          ":" +
          p.id +
          ":" +
          targetId +
          ":" +
          Math.floor(time / APPLICATION_COOLDOWN),
      )() * 100,
    ) + 1;
  const accepted = assessment.eligible && roll <= Math.floor(probability * 100);
  const reason = accepted
    ? "Die Bewerbung wurde nach Prüfung angenommen."
    : assessment.eligible
      ? "Die Voraussetzungen passen, doch diesmal kommt kein Vertrag zustande. Andere Bewerbungen und die Bewertung des Auftretens lassen Spielraum."
      : (assessment.reasons || []).join("; ");
  const e = emit(kind + "_application", p, time, {
    targetId,
    probability,
    roll,
    accepted,
    private: true,
  });
  e.description = `${p.name} bewirbt sich ${kind === "job" ? "auf eine Stelle" : "um eine Wohnung"}: ${reason}`;
  const entry = {
    kind,
    targetId,
    at: time,
    status: accepted ? "accepted" : "declined",
    probability,
    roll,
    reason,
    factors: assessment.factors || [],
    sourceEventId: e.id,
  };
  const entity = put(
    d,
    "application",
    { ...entry, simId: p.id },
    { ownerId: p.id },
  );
  entry.id = entity.id;
  p.state.economy.applications = (p.state.economy.applications || [])
    .concat(entry)
    .slice(-24);
  addFeeling(
    p,
    accepted ? "hope_enthusiasm_optimism" : "disappointment",
    accepted ? 0.32 : 0.25,
    time,
    { kind: "application_result", evidence_id: e.id, text: reason },
    { ttl: 3600 },
  );
  recordExperience(
    p,
    e,
    time,
    "application",
    { P: accepted ? 0.006 : -0.005, A: accepted ? 0.004 : 0 },
    accepted
      ? "Eine echte Zusage eröffnet eine Möglichkeit."
      : "Eine konkrete Bewerbung war erfolglos; dies bewertet nicht den Wert der Person.",
  );
  return {
    ok: accepted,
    status: entry.status,
    reason,
    application: entry,
    eventId: e.id,
    event: e,
  };
}
