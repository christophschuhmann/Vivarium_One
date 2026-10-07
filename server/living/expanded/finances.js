// Financial reports use actual signed, balanced account legs. Internal transfers,
// loans and restricted deposits are not wages or consumption. Never expose a
// housemate's private account merely because they share a kitchen.
import { db, pj } from "../../db.js";
import { balance, rows } from "./store.js";
import { householdOf, householdForecast, ownAccount } from "./economy.js";
import { calendarDate, estimatedNet } from "./catalog.js";
import { addFeeling } from "../cognition.js";
import { recordExperience } from "../wellbeing.js";
export const MONEY_LABELS = {
  payroll: "Ausgezahlter Nettolohn",
  salary: "Nettolohn",
  rent: "Kaltmiete",
  utilities: "Nebenkosten",
  food_purchase: "Lebensmittel",
  groceries: "Lebensmittel",
  membership: "Mitgliedschaften",
  leisure_purchase: "Freizeit",
  leisure: "Freizeit",
  item_purchase: "Besondere Anschaffungen",
  loan_payment: "Kreditraten",
  rent_income: "Mieteinnahmen",
  rental_income_tax: "Steuer auf Mietgewinn",
  voluntary_gift: "Geschenke & Hilfe",
  pension: "Rente",
  approved_support: "Bewilligte Unterstützung",
  social_benefit: "Bewilligte Unterstützung",
  parental_care_benefit: "Betreuungsleistung",
  maintenance: "Instandhaltung",
  donation: "Freiwillige Spenden",
  care_copayment: "Eigenanteil Pflege",
  self_employment_tax_and_social: "Steuern & Sozialabgaben",
};
Object.assign(MONEY_LABELS, {
  served_meal: "Mahlzeit im Café",
  activity_fee: "Freizeitangebote",
  transport: "Fahrkarten",
  parental_care_support: "Bestätigte Betreuungsleistung",
  social_support: "Bewilligte Unterstützung",
  care_copayment: "Eigenanteil Pflege",
});
const internal = new Set([
  "internal_household_transfer",
  "internal_family_transfer",
  "restricted_deposit_transfer",
  "housing_deposit_return",
  "deposit_return",
  "restricted_deposit_return",
  "initial_endowment",
  "opening_balance",
  "newcomer_opening",
]);
const financing = new Set([
  "loan_principal",
  "loan_repayment",
  "property_purchase",
  "property_sale",
  "mortgage_purchase",
  "mortgage_principal",
]);
const clock = (date) => Math.round((date - Date.UTC(2026, 8, 21)) / 1000);
export function financialPeriods(time) {
  const now = calendarDate(time),
    y = now.getUTCFullYear(),
    m = now.getUTCMonth();
  return {
    previous: {
      start: clock(Date.UTC(y, m - 1, 1)),
      end: clock(Date.UTC(y, m, 1)),
      key: new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 7),
    },
    current: {
      start: clock(Date.UTC(y, m, 1)),
      end: time + 1,
      key: now.toISOString().slice(0, 7),
    },
    next: {
      start: clock(Date.UTC(y, m + 1, 1)),
      end: clock(Date.UTC(y, m + 2, 1)),
      key: new Date(Date.UTC(y, m + 1, 1)).toISOString().slice(0, 7),
    },
  };
}
function category(tx) {
  if (
    internal.has(tx.kind) ||
    /initial|endowment|opening|deposit/.test(tx.kind)
  )
    return "transfer";
  if (financing.has(tx.kind)) return "financing";
  if (tx.kind === "payroll") return "payroll";
  return tx.kind;
}
export function monthStatement(
  d,
  p,
  period,
  { scope = "combined", offset = 0, limit = 60 } = {},
) {
  const h = householdOf(d, p),
    accountIds =
      scope === "personal"
        ? [ownAccount(d, p)]
        : scope === "household"
          ? [h.payload.jointAccountId]
          : [ownAccount(d, p), h.payload.jointAccountId];
  const placeholders = accountIds.map(() => "?").join(",");
  const txs = db
    .prepare(
      `SELECT t.id,t.at,t.kind,t.metadata,sum(l.amount_cents) amount_cents FROM lw_money_transactions t JOIN lw_money_legs l ON l.transaction_id=t.id AND l.world_id=t.world_id WHERE t.world_id=? AND t.at>=? AND t.at<? AND l.account_id IN (${placeholders}) GROUP BY t.id ORDER BY t.at DESC,t.rowid DESC`,
    )
    .all(d.worldId, period.start, period.end, ...accountIds)
    .map((t) => ({
      ...t,
      metadata: pj(t.metadata, {}),
      category: category(t),
    }));
  const groups = new Map();
  let income = 0,
    spending = 0,
    transferIn = 0,
    transferOut = 0,
    financingIn = 0,
    financingOut = 0,
    gross = 0,
    tax = 0,
    social = 0;
  for (const tx of txs) {
    const n = tx.amount_cents;
    if (!n) continue;
    if (tx.category === "transfer") {
      if (n > 0) transferIn += n;
      else transferOut -= n;
      continue;
    }
    if (tx.category === "financing") {
      if (n > 0) financingIn += n;
      else financingOut -= n;
      continue;
    }
    const key = tx.category + (n > 0 ? ":income" : ":spending");
    const row = groups.get(key) || {
      kind: tx.category,
      label:
        MONEY_LABELS[tx.category] ||
        "Sonstige belegte Buchungen · " + tx.category,
      direction: n > 0 ? "income" : "spending",
      amountCents: 0,
      count: 0,
    };
    row.amountCents += Math.abs(n);
    row.count++;
    groups.set(key, row);
    if (n > 0) income += n;
    else spending -= n;
    if (tx.kind === "payroll" && n > 0) {
      gross += tx.metadata.grossCents || 0;
      tax += tx.metadata.taxCents || 0;
      social += tx.metadata.employeeSocialCents || 0;
    }
  }
  const earliest = db
    .prepare("SELECT min(at) at FROM lw_money_transactions WHERE world_id=?")
    .get(d.worldId).at;
  return {
    key: period.key,
    start: period.start,
    end: period.end,
    scope,
    incomeCents: income,
    spendingCents: spending,
    netCents: income - spending,
    transferInCents: transferIn,
    transferOutCents: transferOut,
    financingInCents: financingIn,
    financingOutCents: financingOut,
    payroll: {
      grossCents: gross,
      taxCents: tax,
      employeeSocialCents: social,
      netCents: gross - tax - social,
    },
    categories: [...groups.values()].sort(
      (a, b) => b.amountCents - a.amountCents,
    ),
    transactionCount: txs.length,
    transactions: txs
      .slice(offset, offset + limit)
      .map((t) => ({
        id: t.id,
        at: t.at,
        kind: t.kind,
        label:
          MONEY_LABELS[t.kind] ||
          (t.category === "transfer"
            ? "Interne / gebundene Mittel"
            : t.category === "financing"
              ? "Finanzierung / Vermögensänderung"
              : "Sonstige Buchung · " + t.kind),
        amountCents: t.amount_cents,
        classification: t.category,
        invoiceId: t.metadata.invoiceId || null,
      })),
    offset,
    limit,
    coverage:
      earliest == null || earliest >= period.end
        ? "no_recorded_history"
        : earliest > period.start
          ? "partial_month"
          : "recorded_period",
    coverageNote:
      "Ausgewertet werden nur tatsächlich gespeicherte Buchungen. Startvermögen ist kein verdientes Monatseinkommen; vor Simulationsbeginn werden keine Ausgaben erfunden.",
  };
}
export function financialOutlook(d, p, time) {
  const h = householdOf(d, p),
    f = householdForecast(d, h, time),
    members = h.payload.members,
    ids = new Set(members),
    lease = d.entities.get(h.payload.leaseId);
  const loans = d.loans.filter(
    (l) => ids.has(l.payload.borrowerId) && l.payload.status === "active",
  );
  const subscriptions = rows(d, "subscription").filter(
    (s) => ids.has(s.payload.simId) && s.payload.status === "active",
  );
  const careCosts = members.reduce(
    (n, id) => n + (d.people.get(id).state.careSupport?.monthlyCopayCents || 0),
    0,
  );
  const reserve = Math.max(0, h.payload.budget.irregularReserve || 0);
  const rowsOut = [
    {
      kind: "rent",
      label: "Kaltmiete",
      amountCents:
        lease?.payload.status === "active" ? lease.payload.rentCents : 0,
      certainty: "contract",
    },
    {
      kind: "utilities",
      label: "Nebenkosten inklusive vereinfachter Heizkosten",
      amountCents: h.payload.budget.utilities,
      certainty: "estimate",
    },
    {
      kind: "food",
      label: "Lebensmittelbudget",
      amountCents: h.payload.budget.foodTarget,
      certainty: "plan",
    },
    {
      kind: "loan",
      label: "Vereinbarte Kreditraten",
      amountCents: loans.reduce((n, l) => n + l.payload.paymentCents, 0),
      certainty: "contract",
    },
    {
      kind: "membership",
      label: "Aktive Mitgliedschaften",
      amountCents: subscriptions.reduce(
        (n, s) => n + s.payload.monthlyCents,
        0,
      ),
      certainty: "contract",
    },
    {
      kind: "care",
      label: "Vereinbarter Pflege-Eigenanteil",
      amountCents: careCosts,
      certainty: "plan",
    },
  ];
  const costs = rowsOut.reduce((n, r) => n + r.amountCents, 0),
    liquid =
      balance(d, ownAccount(d, p)) + balance(d, h.payload.jointAccountId);
  const target = Math.max(50000, Math.round(costs * 2));
  const incomes = members
    .map((id) => {
      const q = d.people.get(id),
        c = d.contracts.get(id),
        allowed =
          id === p.id || q.state.economy.privacy.shareIncomeWithHousehold;
      if (q.age < 18 || !allowed) return null;
      const amount =
        q.state.economy.parentalCare?.benefitCents ||
        (c && !c.payload.leave
          ? estimatedNet(c.payload.grossMonthlyCents)
          : q.state.economy.pensionCents ||
            q.state.economy.approvedBenefitCents ||
            0);
      return {
        simId: id,
        name: q.name,
        label: q.state.economy.parentalCare
          ? "Betreuungsleistung"
          : c
            ? "Erwarteter Nettolohn"
            : q.profile.job === "Retired"
              ? "Rente"
              : "Bewilligte Unterstützung",
        amountCents: amount,
        certainty: c ? "requires_actual_work_and_funded_payroll" : "approved",
      };
    })
    .filter(Boolean);
  const expectedIncome = incomes.reduce((n, r) => n + r.amountCents, 0),
    projected = liquid + expectedIncome - costs - f.arrearsCents - reserve;
  return {
    month: financialPeriods(time).next.key,
    expenseRows: rowsOut,
    incomeRows: incomes,
    incomeCents: expectedIncome,
    expensesCents: costs,
    reserveContributionCents: reserve,
    plannedOutflowCents: costs + reserve,
    arrearsCents: f.arrearsCents,
    liquidCents: liquid,
    projectedCents: projected,
    targetReserveCents: target,
    reserveCoveredCents: Math.min(target, Math.max(0, liquid)),
    marginCents: expectedIncome - costs - reserve,
    security:
      projected < 0
        ? "shortfall"
        : liquid < reserve || projected < 50000
          ? "tight"
          : "buffered",
    scopeNote:
      "Prognose für den Haushalt; heutige Liquidität nur eigenes und gemeinsames Konto. Private Konten anderer bleiben privat. Einkommen ist kein garantierter Zahlungseingang; Rücklagen sind ein Plan, keine bereits gebuchte Ausgabe.",
  };
}
export function financialReport(d, p, time, options = {}) {
  const periods = financialPeriods(time);
  return {
    previous: monthStatement(d, p, periods.previous, options),
    current: monthStatement(d, p, periods.current, options),
    next: financialOutlook(d, p, time),
    lastAppraisal: p.state.economy.financialAppraisal || null,
  };
}
export function financialAppraisals(
  d,
  time,
  emit,
  { force = false, householdId = null } = {},
) {
  const day = Math.floor(time / 86400);
  for (const p of d.people.values()) {
    if (
      p.age < 18 ||
      (householdId && p.state.economy.householdId !== householdId) ||
      (!force && p.state.economy.financialAppraisal?.day === day)
    )
      continue;
    const outlook = financialOutlook(d, p, time);
    const review = emit("financial_review", p, time, {
      security: outlook.security,
      projectedCents: outlook.projectedCents,
      reserveTargetCents: outlook.targetReserveCents,
      private: true,
    });
    const text =
      outlook.security === "shortfall"
        ? "Mein aktueller Plan zeigt eine Finanzierungslücke. Ich möchte Hilfe, passende Arbeit oder geringere Kosten prüfen."
        : outlook.security === "tight"
          ? "Mein Plan ist knapp gedeckt. Für Ungeplantes möchte ich Schritt für Schritt einen Puffer bilden."
          : "Mein aktueller Plan hat einen Puffer. Das gibt mir etwas Ruhe, auch wenn künftige Einnahmen unsicher bleiben.";
    review.description = p.name + " prüft die eigene finanzielle Lage. " + text;
    p.state.economy.financialAppraisal = {
      day,
      at: time,
      security: outlook.security,
      projectedCents: outlook.projectedCents,
      text,
      sourceEventId: review.id,
    };
    const feeling =
      outlook.security === "shortfall"
        ? "fear"
        : outlook.security === "tight"
          ? "doubt"
          : "relief";
    addFeeling(
      p,
      feeling,
      outlook.security === "shortfall"
        ? 0.34
        : outlook.security === "tight"
          ? 0.22
          : 0.2,
      time,
      { kind: "own_financial_projection", evidence_id: review.id, text },
      { ttl: 86400, key: "financial:outlook" },
    );
    // Security changes P; money by itself never creates meaningful relationships
    // or personal worth. A buffer is neither a diagnosis nor automatic happiness.
    recordExperience(
      p,
      review,
      time,
      "financial_review",
      {
        P:
          outlook.security === "shortfall"
            ? -0.009
            : outlook.security === "tight"
              ? -0.003
              : 0.005,
        E: outlook.security === "shortfall" ? -0.002 : 0,
      },
      text,
    );
  }
}
