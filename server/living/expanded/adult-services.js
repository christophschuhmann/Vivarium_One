// HARD SAFETY BOUNDARY: this optional abstract adult service never applies to
// anyone under 18, never involves minor witnesses, and never narrates sexual
// acts. Poverty, romance need, relationship trust and W100 do NOT give consent.
import { rng } from "../random.js";
import { rows, balance, post } from "./store.js";
import { ownAccount, fundsOf, flow } from "./economy.js";
// Explicit family identities/layers are authoritative, including remote ancestors.
// Shared housing, wealth and age never infer or erase kinship.
function related(d, a, b) {
  const ancestors = (p) => {
    const found = new Set(),
      queue = [p];
    for (let i = 0; i < queue.length && i < 64; i++)
      for (const id of queue[i].profile?.family?.parent_ids || []) {
        if (found.has(id)) continue;
        found.add(id);
        const parent = d.people.get(id);
        if (parent) queue.push(parent);
      }
    return found;
  };
  const aa = ancestors(a),
    bb = ancestors(b),
    r = a.relations?.[b.id],
    family = r?.layers?.family?.status;
  return (
    aa.has(b.id) ||
    bb.has(a.id) ||
    [...aa].some((id) => bb.has(id)) ||
    (family && !["none", "unknown"].includes(family)) ||
    /parent|child|sibling|grand|cousin|aunt|uncle|nephew|niece|family|mutter|vater|tochter|sohn|bruder|schwester|tante|onkel|enkel|cousine?/i.test(
      (r?.kind || "") + " " + (r?.background?.label || ""),
    )
  );
}
export function abstractAdultService(
  d,
  worker,
  client,
  time,
  emit,
  { workerConsent = false, clientConsent = false, feeCents = 5000 } = {},
) {
  if (
    !worker ||
    !client ||
    worker.id === client.id ||
    worker.age < 18 ||
    client.age < 18 ||
    !workerConsent ||
    !clientConsent ||
    !worker.state.economy.adultService?.workerOptIn ||
    !client.state.economy.adultService?.clientOptIn ||
    related(d, worker, client) ||
    related(d, client, worker) ||
    !Number.isSafeInteger(feeCents) ||
    feeCents < 1000 ||
    feeCents > 20000
  )
    return {
      ok: false,
      reason:
        "Zwei unabhängige ausdrücklich zustimmende Erwachsene mit eigener freiwilliger Rollenwahl erforderlich",
    };
  const location = worker.state.location_id,
    occupants = [...d.people.values()].filter(
      (p) => p.state.location_id === location,
    ),
    place = d.town.places.get(location);
  if (
    !location ||
    client.state.location_id !== location ||
    [worker, client].some(
      (p) =>
        ["sleep", "toilet", "shower", "work"].includes(p.state.action?.kind) ||
        p.state.needs.comfort > 0.7 ||
        p.state.needs.fatigue > 0.7 ||
        time - (p.state.economy.lastSubstanceAt ?? -86400) < 14400,
    ) ||
    occupants.length !== 2 ||
    !Object.values(worker.profile.home).includes(location) ||
    place?.kind !== "room"
  )
    return {
      ok: false,
      reason:
        "Tatsächlicher privater Kontakt ohne weitere Anwesende erforderlich",
    };
  if (
    SimTimeGap(worker, time) < 86400 ||
    balance(d, ownAccount(d, client)) < feeCents + 50000
  )
    return {
      ok: false,
      reason:
        "Eigener Abstand, Rückzug und geschützte Grundversorgung haben Vorrang",
    };
  const e = emit(
      "adult_service_accounting",
      worker,
      time,
      {
        private: true,
        adultOnly: true,
        nonExplicit: true,
        workerConsent: true,
        clientConsent: true,
        feeCents,
      },
      [client.id],
    ),
    net = Math.round(feeCents / 1.19);
  const paid = post(
    d,
    [
      { accountId: ownAccount(d, client), amount: -feeCents },
      { accountId: ownAccount(d, worker), amount: net },
      { accountId: fundsOf(d).region, amount: feeCents - net },
    ],
    {
      key: { kind: "adult_service", eventId: e.id },
      at: time,
      eventId: e.id,
      kind: "adult_service",
      metadata: { vatCents: feeCents - net, nonExplicit: true },
    },
  );
  if (!paid.ok) throw new Error("Adult service payment changed");
  flow(client, time, "adult_service", -feeCents);
  flow(worker, time, "self_employment", net);
  worker.state.economy.selfEmploymentIncomeCents =
    (worker.state.economy.selfEmploymentIncomeCents || 0) + net;
  worker.state.economy.adultService.lastAt = time;
  client.state.economy.adultService.lastAt = time;
  e.description =
    worker.name +
    " und " +
    client.name +
    " schließen einen freiwillig vereinbarten privaten Erwachsenen-Dienstleistungstermin ab. Nur Zustimmung und tatsächliche Abrechnung werden protokolliert; intime Einzelheiten bleiben unbeschrieben.";
  return { ok: true, eventId: e.id };
}
function SimTimeGap(p, time) {
  return time - (p.state.economy.adultService?.lastAt ?? -86400);
}
export function adultServicesMinute(d, time, emit) {
  if ((time / 3600) % 24 < 18 || (time / 3600) % 24 >= 21) return;
  for (const worker of d.people.values()) {
    if (
      worker.age < 18 ||
      !worker.state.economy.adultService?.workerOptIn ||
      !worker.state.location_id ||
      ["sleep", "toilet", "shower", "work"].includes(worker.state.action?.kind)
    )
      continue;
    const client = [...d.people.values()].find(
      (c) =>
        c.id !== worker.id &&
        c.age >= 18 &&
        c.state.economy.adultService?.clientOptIn &&
        c.state.location_id === worker.state.location_id &&
        !["sleep", "toilet", "shower", "work"].includes(c.state.action?.kind),
    );
    if (
      !client ||
      [...d.people.values()].filter(
        (q) => q.state.location_id === worker.state.location_id,
      ).length !== 2 ||
      !Object.values(worker.profile.home).includes(worker.state.location_id)
    )
      continue;
    const day = Math.floor(time / 86400);
    if (worker.state.economy.adultService.lastProposalDay === day) continue;
    worker.state.economy.adultService.lastProposalDay = day;
    const willing = (p) =>
      Math.max(p.state.needs.comfort, p.state.needs.fatigue) < 0.7 &&
      !Object.values(p.state.economy.health.substances).some(
        (s) => s.lastUseAt != null && time - s.lastUseAt < 4 * 3600,
      ) &&
      rng(
        d.town.world.seed + ":adult-consent:" + p.profile.seed_key + ":" + day,
      )() < 0.7;
    const workerConsent = willing(worker),
      clientConsent = willing(client),
      proposal = emit(
        "adult_service_proposal",
        worker,
        time,
        { private: true, adultOnly: true, workerConsent, clientConsent },
        [client.id],
      );
    proposal.description =
      worker.name +
      " und " +
      client.name +
      (workerConsent && clientConsent
        ? " stimmen einem konkreten privaten Erwachsenen-Termin ausdrücklich zu."
        : " besprechen einen privaten Erwachsenen-Termin; eine eigene Grenze wird respektiert und es findet kein Termin statt.");
    if (workerConsent && clientConsent)
      abstractAdultService(d, worker, client, time, emit, {
        workerConsent,
        clientConsent,
      });
  }
}
