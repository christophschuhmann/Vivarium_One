// A household is a voluntary cost-sharing agreement, not a romantic contract.
// Joining never supplies sexual consent, takes a child's savings or teleports.
import { rows, touch, balance, transfer } from "./store.js";
import { householdOf } from "./economy.js";
export function joinHouseholds(
  d,
  p,
  target,
  time,
  emit,
  { consentingAdultIds = [] } = {},
) {
  const from = householdOf(d, p),
    to = target && householdOf(d, target),
    property = to && d.properties.get(to.payload.propertyId);
  if (
    p.age < 18 ||
    !target ||
    target.age < 18 ||
    !from ||
    !to ||
    from.id === to.id ||
    !property ||
    to.payload.housingStatus !== "housed"
  )
    return {
      ok: false,
      reason:
        "Zwei eigenständige Haushalte mit erwachsenen Bezugspersonen und einem realen Zuhause erforderlich",
    };
  const adults = [...from.payload.members, ...to.payload.members].filter(
      (id) => d.people.get(id).age >= 18,
    ),
    consents = new Set(consentingAdultIds);
  if (adults.some((id) => !consents.has(id)))
    return {
      ok: false,
      reason:
        "Alle erwachsenen Haushaltsmitglieder müssen der Kosten- und Wohnabsprache ausdrücklich zustimmen",
    };
  if (
    !p.relations[target.id] ||
    p.relations[target.id].trust < 0.5 ||
    property.payload.capacity <
      from.payload.members.length + to.payload.members.length
  )
    return {
      ok: false,
      reason: "Gegenseitiges Vertrauen und ausreichend Wohnraum erforderlich",
    };
  // Check the receiver's perspective as well as the proposing Sim's trust.
  if (!target.relations[p.id] || target.relations[p.id].trust < 0.5)
    return {
      ok: false,
      reason: "Das Gegenüber möchte diese Haushaltsbindung noch nicht eingehen",
    };
  const e = emit(
    "households_joined",
    p,
    time,
    {
      fromHouseholdId: from.id,
      toHouseholdId: to.id,
      consentingAdultIds: adults,
      private: true,
    },
    [...new Set([...from.payload.members, ...to.payload.members])].filter(
      (id) => id !== p.id,
    ),
  );
  const moved = from.payload.members.slice(),
    old = d.properties.get(from.payload.propertyId),
    lease = d.entities.get(from.payload.leaseId);
  if (lease) {
    lease.payload.status = "ended";
    lease.payload.endedAt = time;
    lease.payload.householdId = to.id;
    lease.payload.originalHouseholdId = from.id;
    touch(d, lease);
  }
  if (old) {
    old.payload.residents = old.payload.residents.filter(
      (id) => id !== from.id,
    );
    old.payload.pendingVacancyHouseholdId = to.id;
    old.payload.listed = false;
    touch(d, old);
  }
  const amount = balance(d, from.payload.jointAccountId);
  transfer(d, from.payload.jointAccountId, to.payload.jointAccountId, amount, {
    key: { kind: "agreed_household_merge", eventId: e.id },
    at: time,
    eventId: e.id,
    kind: "internal_household_transfer",
  });
  for (const invoice of rows(d, "invoice"))
    if (
      invoice.payload.householdId === from.id &&
      invoice.payload.status !== "paid"
    ) {
      invoice.payload.householdId = to.id;
      invoice.payload.debtorAccountId = to.payload.jointAccountId;
      touch(d, invoice);
    }
  for (const key of ["basic", "standard", "premium"])
    to.payload.food[key] += from.payload.food[key] || 0;
  to.payload.members.push(...moved);
  to.payload.sharedBy.push(...from.payload.sharedBy);
  to.payload.budget.utilities = 11000 + to.payload.members.length * 2800;
  to.payload.budget.foodTarget = to.payload.members.length * 18000;
  to.payload.housingStatus = "moving";
  to.payload.movingSince = time;
  for (const id of moved) {
    const q = d.people.get(id);
    q.household_id = property.payload.buildingId;
    q.profile.home = { ...property.payload.rooms };
    q.state.economy.householdId = to.id;
    q.state.goal = {
      kind: "relax",
      destination: q.profile.home.living,
      expires: time + 86400,
      reason:
        "Die gemeinsame Wohn- und Kostenabsprache ist angenommen; ich gehe tatsächlich dorthin.",
      source: "accepted_household_agreement",
    };
  }
  for (const o of rows(d, "obligation"))
    if (
      moved.includes(o.payload.assigneeId) &&
      o.payload.householdId === from.id
    ) {
      o.payload.householdId = to.id;
      if (!["work", "care"].includes(o.payload.operator))
        o.payload.destinationId = property.payload.rooms.living;
      touch(d, o);
    }
  from.payload.members = [];
  from.payload.sharedBy = [];
  from.payload.status = "merged";
  from.payload.mergedIntoId = to.id;
  from.payload.food = { basic: 0, standard: 0, premium: 0 };
  touch(d, from);
  touch(d, to);
  d.households.delete(from.id);
  e.description =
    p.name +
    " und " +
    target.name +
    " vereinbaren mit allen erwachsenen Beteiligten einen gemeinsamen Haushalt. Vereinbarte Vorräte, gemeinsame Kosten und offene Verpflichtungen werden zusammengeführt; private Konten, Familienbeziehungen und tatsächliche Wege bleiben getrennt.";
  return { ok: true, householdId: to.id };
}
