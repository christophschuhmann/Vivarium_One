// World-scoped durable resources. All money is integer cents, every posting is
// balanced, and an expansion draft commits INSIDE the ordinary atomic tick.
import { db, j, pj, uid } from "../../db.js";
import "../schema.js";
export const EXPANDED_VERSION = 5;
export const EXPANDED_TABLES = [
  "lw_economy_accounts",
  "lw_economy_entities",
  "lw_money_transactions",
  "lw_money_legs",
];
db.exec(`
CREATE TABLE IF NOT EXISTS lw_economy_accounts(id TEXT PRIMARY KEY,world_id TEXT NOT NULL REFERENCES lw_worlds(world_id) ON DELETE CASCADE,owner_id TEXT,kind TEXT NOT NULL,balance_cents INTEGER NOT NULL,overdraft_cents INTEGER NOT NULL DEFAULT 0,metadata TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS lw_accounts_owner ON lw_economy_accounts(world_id,owner_id,kind);
CREATE TABLE IF NOT EXISTS lw_economy_entities(id TEXT PRIMARY KEY,world_id TEXT NOT NULL REFERENCES lw_worlds(world_id) ON DELETE CASCADE,kind TEXT NOT NULL,owner_id TEXT,payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS lw_entities_kind_owner ON lw_economy_entities(world_id,kind,owner_id);
CREATE TABLE IF NOT EXISTS lw_money_transactions(id TEXT PRIMARY KEY,world_id TEXT NOT NULL REFERENCES lw_worlds(world_id) ON DELETE CASCADE,idempotency_key TEXT NOT NULL,at INTEGER NOT NULL,event_id TEXT,kind TEXT NOT NULL,metadata TEXT NOT NULL,UNIQUE(world_id,idempotency_key));
CREATE INDEX IF NOT EXISTS lw_money_time ON lw_money_transactions(world_id,at,id);
CREATE TABLE IF NOT EXISTS lw_money_legs(id TEXT PRIMARY KEY,world_id TEXT NOT NULL REFERENCES lw_worlds(world_id) ON DELETE CASCADE,transaction_id TEXT NOT NULL REFERENCES lw_money_transactions(id) ON DELETE CASCADE,account_id TEXT NOT NULL REFERENCES lw_economy_accounts(id) ON DELETE CASCADE,amount_cents INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS lw_money_account ON lw_money_legs(world_id,account_id,transaction_id);
`);
export const knownKinds = new Set([
  "household",
  "property",
  "lease",
  "firm",
  "job",
  "employment",
  "invoice",
  "loan",
  "item",
  "subscription",
  "obligation",
  "news",
  "claim",
  "case",
  "gang",
  "institution",
  "market",
  "calendar",
  "health_plan",
  "care_plan",
  "application",
]);
const existingKey = db.prepare(
  "SELECT id FROM lw_money_transactions WHERE world_id=? AND idempotency_key=?",
);
export function loadEconomy(worldId) {
  const accounts = new Map(
    db
      .prepare("SELECT * FROM lw_economy_accounts WHERE world_id=?")
      .all(worldId)
      .map((a) => [a.id, { ...a, metadata: pj(a.metadata, {}) }]),
  );
  const entities = new Map(
    db
      .prepare("SELECT * FROM lw_economy_entities WHERE world_id=?")
      .all(worldId)
      .map((e) => [e.id, { ...e, payload: pj(e.payload, {}) }]),
  );
  const groups = new Map();
  for (const e of entities.values()) {
    if (!groups.has(e.kind)) groups.set(e.kind, new Map());
    groups.get(e.kind).set(e.id, e);
  }
  return {
    worldId,
    accounts,
    entities,
    groups,
    dirtyAccounts: new Set(),
    dirtyEntities: new Set(),
    deletedEntities: new Set(),
    transactions: [],
    keys: new Set(),
  };
}
export function rows(d, kind) {
  return [...(d.groups.get(kind)?.values() || [])];
}
export function put(
  d,
  kind,
  payload,
  { id = uid("ee_"), ownerId = null } = {},
) {
  if (!knownKinds.has(kind))
    throw new Error("Unknown economic entity kind: " + kind);
  const e = { id, world_id: d.worldId, kind, owner_id: ownerId, payload };
  d.entities.set(id, e);
  if (!d.groups.has(kind)) d.groups.set(kind, new Map());
  d.groups.get(kind).set(id, e);
  d.dirtyEntities.add(id);
  return e;
}
export function touch(d, e) {
  if (d.entities.get(e.id) !== e) throw new Error("Foreign economic entity");
  d.dirtyEntities.add(e.id);
  return e;
}
export function account(
  d,
  kind,
  ownerId,
  { balance = 0, overdraft = 0, metadata = {} } = {},
) {
  if (
    !Number.isSafeInteger(balance) ||
    !Number.isSafeInteger(overdraft) ||
    overdraft < 0
  )
    throw new Error("Invalid account amounts");
  const a = {
    id: uid("ea_"),
    world_id: d.worldId,
    owner_id: ownerId,
    kind,
    balance_cents: balance,
    overdraft_cents: overdraft,
    metadata,
  };
  d.accounts.set(a.id, a);
  d.dirtyAccounts.add(a.id);
  return a;
}
export function ownerAccount(d, ownerId, kind = "personal") {
  return [...d.accounts.values()].find(
    (a) => a.owner_id === ownerId && a.kind === kind,
  );
}
export function balance(d, id) {
  return d.accounts.get(id)?.balance_cents || 0;
}
export function post(
  d,
  legs,
  { key, at, eventId = null, kind, metadata = {} },
) {
  const encoded = j(key);
  if (d.keys.has(encoded) || existingKey.get(d.worldId, encoded))
    return { ok: true, duplicate: true };
  if (
    !legs.length ||
    !legs.every(
      (l) => d.accounts.has(l.accountId) && Number.isSafeInteger(l.amount),
    ) ||
    legs.reduce((n, l) => n + l.amount, 0) !== 0
  )
    throw new Error("Invalid/unbalanced/cross-world money posting");
  const net = new Map();
  for (const l of legs)
    net.set(l.accountId, (net.get(l.accountId) || 0) + l.amount);
  for (const [id, amount] of net) {
    const a = d.accounts.get(id),
      next = a.balance_cents + amount;
    if (!Number.isSafeInteger(next))
      throw new Error("Money exceeds safe integer range");
    if (next < -a.overdraft_cents)
      return { ok: false, reason: "insufficient_funds", accountId: id };
  }
  const tx = {
    id: uid("et_"),
    world_id: d.worldId,
    idempotency_key: encoded,
    at,
    event_id: eventId,
    kind,
    metadata,
    legs: [...net]
      .filter(([, n]) => n)
      .map(([accountId, amount]) => ({ id: uid("el_"), accountId, amount })),
  };
  for (const [id, amount] of net) {
    d.accounts.get(id).balance_cents += amount;
    d.dirtyAccounts.add(id);
  }
  d.transactions.push(tx);
  d.keys.add(encoded);
  return { ok: true, transactionId: tx.id };
}
export function transfer(d, from, to, amount, options) {
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new Error("Amounts must be nonnegative integer cents");
  if (!amount) return { ok: true, zero: true };
  return post(
    d,
    [
      { accountId: from, amount: -amount },
      { accountId: to, amount },
    ],
    options,
  );
}
export function commitEconomy(d) {
  // The caller owns the enclosing DB transaction and optimistic world version.
  const upAccount = db.prepare(
    "INSERT INTO lw_economy_accounts VALUES (@id,@world_id,@owner_id,@kind,@balance_cents,@overdraft_cents,@metadata) ON CONFLICT(id) DO UPDATE SET balance_cents=excluded.balance_cents,overdraft_cents=excluded.overdraft_cents,metadata=excluded.metadata",
  );
  const upEntity = db.prepare(
    "INSERT INTO lw_economy_entities VALUES (@id,@world_id,@kind,@owner_id,@payload) ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id,payload=excluded.payload",
  );
  for (const id of d.dirtyAccounts) {
    const a = d.accounts.get(id);
    upAccount.run({ ...a, metadata: j(a.metadata) });
  }
  for (const id of d.dirtyEntities) {
    const e = d.entities.get(id);
    upEntity.run({ ...e, payload: j(e.payload) });
  }
  for (const tx of d.transactions) {
    db.prepare("INSERT INTO lw_money_transactions VALUES (?,?,?,?,?,?,?)").run(
      tx.id,
      tx.world_id,
      tx.idempotency_key,
      tx.at,
      tx.event_id,
      tx.kind,
      j(tx.metadata),
    );
    for (const leg of tx.legs)
      db.prepare("INSERT INTO lw_money_legs VALUES (?,?,?,?,?)").run(
        leg.id,
        d.worldId,
        tx.id,
        leg.accountId,
        leg.amount,
      );
  }
  for (const id of d.deletedEntities)
    db.prepare("DELETE FROM lw_economy_entities WHERE world_id=? AND id=?").run(
      d.worldId,
      id,
    );
}
export function assertEconomicIntegrity(d) {
  for (const a of d.accounts.values())
    if (
      !Number.isSafeInteger(a.balance_cents) ||
      a.balance_cents < -a.overdraft_cents
    )
      throw new Error("Account invariant violated");
  for (const tx of d.transactions)
    if (tx.legs.reduce((n, l) => n + l.amount, 0) !== 0)
      throw new Error("Unbalanced ledger");
  for (const e of d.entities.values())
    if (e.world_id !== d.worldId) throw new Error("Cross-world entity");
  return true;
}
