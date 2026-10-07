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
  payroll: "Net pay",
  salary: "Net pay",
  rent: "Base rent",
  utilities: "Utilities",
  food_purchase: "Groceries",
  groceries: "Groceries",
  membership: "Memberships",
  leisure_purchase: "Leisure",
  leisure: "Leisure",
  item_purchase: "Special purchases",
  loan_payment: "Loan payments",
  rent_income: "Rental income",
  rental_income_tax: "Tax on rental income",
  voluntary_gift: "Gifts & support",
  pension: "Pension",
  approved_support: "Approved support",
  social_benefit: "Approved support",
  parental_care_benefit: "Care benefit",
  maintenance: "Maintenance",
  donation: "Voluntary donations",
  care_copayment: "Care copayment",
  self_employment_tax_and_social: "Taxes & social contributions",
};
Object.assign(MONEY_LABELS, {
  served_meal: "Café meal",
  activity_fee: "Leisure activities",
  transport: "Travel tickets",
  parental_care_support: "Confirmed care support",
  social_support: "Approved support",
  care_copayment: "Care copayment",
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
        "Other documented transactions · " + tx.category,
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
            ? "Internal / restricted funds"
            : t.category === "financing"
              ? "Financing / asset change"
              : "Other transaction · " + t.kind),
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
      "Only transactions actually recorded are included. Starting assets are not earned monthly income, and no spending is invented for time before the simulation began.",
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
      label: "Base rent",
      amountCents:
        lease?.payload.status === "active" ? lease.payload.rentCents : 0,
      certainty: "contract",
    },
    {
      kind: "utilities",
      label: "Utilities, including estimated heating costs",
      amountCents: h.payload.budget.utilities,
      certainty: "estimate",
    },
    {
      kind: "food",
      label: "Grocery budget",
      amountCents: h.payload.budget.foodTarget,
      certainty: "plan",
    },
    {
      kind: "loan",
      label: "Agreed loan payments",
      amountCents: loans.reduce((n, l) => n + l.payload.paymentCents, 0),
      certainty: "contract",
    },
    {
      kind: "membership",
      label: "Active memberships",
      amountCents: subscriptions.reduce(
        (n, s) => n + s.payload.monthlyCents,
        0,
      ),
      certainty: "contract",
    },
    {
      kind: "care",
      label: "Agreed care copayment",
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
        grossCents: c && !c.payload.leave && !q.state.economy.parentalCare ? c.payload.grossMonthlyCents : null,
        deductionsCents: c && !c.payload.leave && !q.state.economy.parentalCare ? c.payload.grossMonthlyCents - amount : null,
        label: q.state.economy.parentalCare
          ? "Care benefit"
          : c
            ? "Expected net pay"
            : q.profile.job === "Retired"
              ? "Pension"
              : "Approved support",
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
      "Household forecast; current liquid funds include only personal and shared accounts. Other people’s accounts remain private. Income is not guaranteed to arrive, and reserves are a plan rather than a recorded expense.",
  };
}
export function financialReport(d, p, time, options = {}) {
  const periods = financialPeriods(time);
  const outlook=financialOutlook(d,p,time),h=householdOf(d,p),members=h.payload.members.length;
  const equivalence=Math.sqrt(Math.max(1,members)),equivalizedCents=Math.round(outlook.incomeCents/equivalence);
  const currency=JSON.parse(d.town.world.rules||'{}').currency||'EUR',referenceCents=currency==='USD'?300000:250000;
  const ratio=equivalizedCents/referenceCents;
  const bands=[[.4,'Lower low-income'],[.6,'Middle low-income'],[.8,'Upper low-income'],[1,'Lower middle-income'],[1.25,'Middle-income'],[1.75,'Upper middle-income'],[2.5,'Lower high-income'],[4,'Middle high-income'],[8,'Upper high-income'],[Infinity,'Exceptionally high-income']];
  return {
    incomeClass:{label:bands.find(([ceiling])=>ratio<ceiling)[1],ratio,monthlyHouseholdNetCents:outlook.incomeCents,members,equivalence,equivalizedCents,referenceCents,currency,basis:'Expected household net income divided by the square root of household size. Income depends on actual paid work and approved support. These are game bands relative to a stated design reference, not official US or German social classes. Wealth, debt, liquid reserves and social reputation are separate.'},
    previous: monthStatement(d, p, periods.previous, options),
    current: monthStatement(d, p, periods.current, options),
    next: outlook,
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
        ? "My current plan shows a funding gap. I want to look into support, suitable work, or lower costs."
        : outlook.security === "tight"
          ? "My plan is just about covered. I want to build a buffer for unexpected costs, step by step."
          : "My current plan has a buffer. That gives me some peace of mind, even though future income remains uncertain.";
    review.description = p.name + " reviews their financial situation. " + text;
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
