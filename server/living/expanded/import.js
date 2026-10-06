import { db, j, pj } from "../../db.js";
import { economicDraft } from "./economy.js";
import { rows, assertEconomicIntegrity, knownKinds } from "./store.js";
import { initializeExpansion } from "./bootstrap.js";
export function validateExpandedImport(town) {
  let d = economicDraft(town);
  if (!d) {
    if (
      town.people.some((p) => p.state.economy?.personalAccountId) ||
      db
        .prepare("SELECT 1 FROM lw_economy_accounts WHERE world_id=?")
        .get(town.world.world_id)
    )
      throw new Error("Incomplete economy snapshot");
    town.world.rules = j({ ...pj(town.world.rules, {}), expandedVersion: 0 });
    initializeExpansion(town);
    return;
  }
  assertEconomicIntegrity(d);
  const ids = new Set([
      town.world.world_id,
      ...town.places.keys(),
      ...town.byId.keys(),
      ...d.accounts.keys(),
      ...d.entities.keys(),
    ]),
    eventIds = new Set(
      db
        .prepare("SELECT id FROM lw_events WHERE world_id=?")
        .all(d.worldId)
        .map((e) => e.id),
    );
  for (const a of d.accounts.values()) {
    if (a.owner_id && !ids.has(a.owner_id))
      throw new Error("Foreign account owner");
    if (
      a.overdraft_cents &&
      !(
        a.kind === "external" &&
        a.metadata.outsideWorld &&
        d.entities.get(a.owner_id)?.payload.key === "external"
      )
    )
      throw new Error("Unsupported account overdraft");
    const sum = db
      .prepare(
        "SELECT coalesce(sum(amount_cents),0) total FROM lw_money_legs WHERE world_id=? AND account_id=?",
      )
      .get(d.worldId, a.id).total;
    if (sum !== a.balance_cents)
      throw new Error("Account balance does not match the actual ledger");
  }
  const sums = db
    .prepare(
      "SELECT transaction_id,sum(amount_cents) total FROM lw_money_legs WHERE world_id=? GROUP BY transaction_id HAVING total<>0",
    )
    .all(d.worldId);
  if (sums.length) throw new Error("Unbalanced imported transaction");
  for (const tx of db
    .prepare("SELECT * FROM lw_money_transactions WHERE world_id=?")
    .all(d.worldId))
    if (tx.event_id && !eventIds.has(tx.event_id))
      throw new Error("Foreign transaction event");
  for (const e of d.entities.values()) {
    if (!knownKinds.has(e.kind)) throw new Error("Unknown economic entity");
    if (e.owner_id && !ids.has(e.owner_id))
      throw new Error("Foreign economic entity owner");
    for (const [key, value] of Object.entries(e.payload)) {
      if (
        [
          "accountId",
          "jointAccountId",
          "personalAccountId",
          "propertyId",
          "collateralPropertyId",
          "leaseId",
          "firmId",
          "workplaceId",
          "borrowerId",
          "lenderId",
          "lenderAccountId",
          "creditorAccountId",
          "debtorAccountId",
          "simId",
          "assigneeId",
          "targetId",
          "issuerId",
          "buildingId",
          "depositAccountId",
          "ownerId",
          "landlordId",
          "victimId",
          "actorId",
          "investigatorId",
          "locationId",
          "householdId",
        ].includes(key) &&
        value !== null &&
        value !== undefined &&
        !ids.has(value)
      )
        throw new Error("Foreign economic reference " + key);
      if (
        ["members", "sharedBy", "residents", "audience"].includes(key) &&
        (!Array.isArray(value) || value.some((id) => !ids.has(id)))
      )
        throw new Error("Foreign group member");
    }
    if (e.payload.rooms)
      for (const id of Object.values(e.payload.rooms))
        if (!town.places.has(id)) throw new Error("Foreign property room");
    if (e.kind === "calendar") {
      for (const id of Object.values(e.payload.funds || {}))
        if (!d.accounts.has(id)) throw new Error("Foreign public fund");
      for (const venue of Object.values(e.payload.venues || {})) {
        if (!town.places.has(venue.building))
          throw new Error("Foreign public venue");
        for (const id of [
          ...Object.values(venue.rooms || {}),
          venue.bath,
        ].filter(Boolean))
          if (!town.places.has(id)) throw new Error("Foreign venue room");
      }
    }
    if (
      e.kind === "employment" &&
      e.payload.holiday &&
      e.payload.status === "active" &&
      (!e.payload.holiday ||
        e.payload.hoursPerDay > 4 ||
        town.byId.get(e.payload.simId)?.age < 15 ||
        town.byId.get(e.payload.simId)?.age >= 18)
    )
      throw new Error("Unsafe holiday employment");
    if (
      e.kind === "case" &&
      [e.payload.actorId].some((id) => town.byId.get(id)?.age < 18)
    )
      throw new Error("Underage adult-conflict role");
  }
  for (const p of town.people) {
    if (
      !d.accounts.has(p.state.economy?.personalAccountId) ||
      !d.households.has(p.state.economy?.householdId)
    )
      throw new Error("Incomplete personal resources");
    if (d.accounts.get(p.state.economy.personalAccountId).owner_id !== p.id)
      throw new Error("Wrong personal account owner");
    if (
      p.age < 18 &&
      (p.state.economy.criminalRole ||
        p.state.economy.adultService?.workerOptIn ||
        p.state.economy.adultService?.clientOptIn ||
        Object.keys(p.state.economy.health?.substances || {}).length)
    )
      throw new Error("Underage adult risk state");
    for (const contact of Object.values(
      p.state.social_cognition?.contacts || {},
    ))
      if (!town.byId.has(contact.subjectId))
        throw new Error("Foreign social perspective");
  }
}
