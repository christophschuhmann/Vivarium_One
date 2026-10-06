import { db } from "../../db.js";
import { rng } from "../random.js";
import { addFeeling } from "../cognition.js";
import {
  loadEconomy,
  rows,
  put,
  touch,
  balance,
  post,
  transfer,
  ownerAccount,
  account,
  assertEconomicIntegrity,
} from "./store.js";
import {
  JOBS,
  POLICY,
  ACTIVITIES,
  ITEMS,
  incomeTax,
  estimatedNet,
  calendarDate,
  monthKey,
} from "./catalog.js";
const cents = (n) => Math.max(0, Math.round(n));
export function economicDraft(town) {
  const d = loadEconomy(town.world.world_id);
  d.calendar = rows(d, "calendar")[0];
  if (!d.calendar) return null;
  d.people = town.byId;
  d.town = town;
  d.accountFunctions = { account };
  d.households = new Map(
    rows(d, "household")
      .filter((h) => h.payload.status !== "merged")
      .map((h) => [h.id, h]),
  );
  d.contracts = new Map(
    rows(d, "employment")
      .filter((e) => e.payload.status === "active")
      .map((e) => [e.payload.simId, e]),
  );
  d.properties = new Map(rows(d, "property").map((e) => [e.id, e]));
  d.jobs = rows(d, "job");
  d.firms = new Map(rows(d, "firm").map((e) => [e.id, e]));
  d.items = rows(d, "item");
  d.invoices = rows(d, "invoice").filter((e) => e.payload.status !== "paid");
  d.loans = rows(d, "loan");
  d.market = d.entities.get(d.calendar.payload.marketId);
  return d;
}
export const householdOf = (d, p) =>
  d.households.get(p.state.economy?.householdId);
export const fundsOf = (d) => d.calendar.payload.funds;
export const ownAccount = (d, p) => p.state.economy.personalAccountId;
export function householdCash(d, h) {
  return (
    balance(d, h.payload.jointAccountId) +
    h.payload.members
      .filter((id) => h.payload.sharedBy.includes(id))
      .reduce((n, id) => n + balance(d, ownAccount(d, d.people.get(id))), 0)
  );
}
export function householdSpendable(d, h) {
  return (
    balance(d, h.payload.jointAccountId) +
    h.payload.sharedBy.reduce(
      (n, id) =>
        n + Math.max(0, balance(d, ownAccount(d, d.people.get(id))) - 2000),
      0,
    )
  );
}
export function jointFunds(d, h, amount, time, emit) {
  let missing = amount - balance(d, h.payload.jointAccountId);
  if (missing <= 0) return true;
  if (
    h.payload.sharedBy.reduce(
      (n, id) =>
        n + Math.max(0, balance(d, ownAccount(d, d.people.get(id))) - 2000),
      0,
    ) < missing
  )
    return false;
  for (const id of h.payload.sharedBy) {
    const p = d.people.get(id);
    if (!p) continue;
    const available = Math.max(0, balance(d, ownAccount(d, p)) - 2000),
      take = Math.min(available, missing);
    if (!take) continue;
    const e = emit(
      "household_contribution",
      p,
      time,
      { householdId: h.id, amountCents: take, private: true },
      [],
      p.state.location_id,
    );
    e.description =
      p.name +
      " trägt " +
      (take / 100).toFixed(2) +
      " € zu den gemeinsam vereinbarten Haushaltskosten bei.";
    transfer(d, ownAccount(d, p), h.payload.jointAccountId, take, {
      key: { kind: "joint_contribution", eventId: e.id },
      at: time,
      eventId: e.id,
      kind: "internal_household_transfer",
    });
    missing -= take;
    if (missing <= 0) return true;
  }
  return false;
}
export function flow(p, time, kind, amount) {
  const key = monthKey(time),
    f = (p.state.economy.monthlyFlows[key] ||= {
      incomeCents: 0,
      spendingCents: 0,
      kindTotals: {},
    });
  if (amount > 0) f.incomeCents += amount;
  else f.spendingCents -= amount;
  f.kindTotals[kind] = (f.kindTotals[kind] || 0) + amount;
  const keys = Object.keys(p.state.economy.monthlyFlows).sort();
  while (keys.length > 18) delete p.state.economy.monthlyFlows[keys.shift()];
}
export function householdForecast(d, h, time) {
  const members = h.payload.members
      .map((id) => d.people.get(id))
      .filter(Boolean),
    adults = members.filter((p) => p.age >= 18),
    income = adults.reduce(
      (n, p) =>
        n +
        (p.state.economy.parentalCare
          ? p.state.economy.parentalCare.benefitCents
          : d.contracts.get(p.id)
            ? estimatedNet(d.contracts.get(p.id).payload.grossMonthlyCents)
            : p.profile.job === "Retired"
              ? p.state.economy.pensionCents || 120000
              : p.state.economy.approvedBenefitCents || 0),
      0,
    ),
    lease = d.entities.get(h.payload.leaseId),
    rent = lease?.payload.status === "active" ? lease.payload.rentCents : 0,
    loans = d.loans
      .filter(
        (l) =>
          members.some((p) => p.id === l.payload.borrowerId) &&
          l.payload.status === "active",
      )
      .reduce((n, l) => n + l.payload.paymentCents, 0),
    subscriptions = rows(d, "subscription")
      .filter(
        (s) =>
          s.payload.status === "active" &&
          members.some((p) => p.id === s.payload.simId),
      )
      .reduce((n, s) => n + s.payload.monthlyCents, 0),
    cost =
      rent +
      h.payload.budget.utilities +
      h.payload.budget.foodTarget +
      loans +
      subscriptions,
    available = balance(d, h.payload.jointAccountId),
    arrears = d.invoices
      .filter(
        (i) => i.payload.householdId === h.id && i.payload.status !== "paid",
      )
      .reduce((n, i) => n + i.payload.remainingCents, 0),
    margin = income - cost;
  return {
    at: time,
    incomeCents: income,
    fixedCents: rent + h.payload.budget.utilities + loans + subscriptions,
    foodCents: h.payload.budget.foodTarget,
    costCents: cost,
    marginCents: margin,
    availableCents: available,
    arrearsCents: arrears,
    days7Cents: available + Math.round((margin * 7) / 30) - arrears,
    days30Cents: available + margin - arrears,
    days90Cents: available + margin * 3 - arrears,
    assumptions:
      "Only confirmed contracts and approved support. Nominal monthly projection is not a promise of immediate cash.",
  };
}
export function isHoliday(d, time) {
  const date = calendarDate(time).toISOString().slice(0, 10);
  return d.calendar.payload.holidays.some(
    (h) => date >= h.start && date <= h.end,
  );
}
export function commuteSeconds(town, from, to) {
  if (from === to) return 0;
  const distance = new Map([[from, 0]]),
    queue = [from];
  for (let i = 0; i < queue.length; i++)
    for (const edge of town.graph.get(queue[i]) || []) {
      const n = distance.get(queue[i]) + edge.seconds;
      if (distance.has(edge.id)) continue;
      distance.set(edge.id, n);
      queue.push(edge.id);
      if (edge.id === to) return n;
    }
  return null;
}
export function jobAssessment(d, p, listing, time) {
  const x = listing.payload,
    firm = d.firms.get(x.firmId),
    skill = p.state.skills[x.skill] || 0,
    reasons = [];
  if (x.slots < 1 || time >= x.expiresAt)
    reasons.push("Stelle nicht mehr frei");
  if (p.age < x.ageMin || (x.ageMax != null && p.age > x.ageMax))
    reasons.push("Altersvoraussetzung");
  if (
    x.holiday &&
    (p.age < 15 ||
      p.age >= 18 ||
      !x.safe ||
      x.hoursPerDay > 4 ||
      !isHoliday(d, time) ||
      !p.state.economy.guardianPermission)
  )
    reasons.push("Sicherer Ferienjob mit bestätigter Zustimmung erforderlich");
  if (skill < x.minimumSkill)
    reasons.push("Fertigkeit noch unter der Anforderung");
  if (x.credential && !p.state.credentials.includes(x.credential))
    reasons.push("Qualifikation fehlt");
  if (x.estimatedNetCents < p.state.economy.expectations.minimumNetCents)
    reasons.push("Entspricht nicht der eigenen Einkommenserwartung");
  const impression = firm?.payload.impressions[p.id];
  if (
    impression &&
    impression.score < 0.2 &&
    impression.confidence >= 0.6 &&
    time - impression.at < 30 * 86400
  )
    reasons.push("Belegte frühere negative Erfahrung bei dieser Firma");
  // Employers see only public, sufficiently supported claims, never private
  // reputation values, bank balances, ethnicity, beliefs or hidden thoughts.
  const adverse = rows(d, "claim").filter(
    (c) =>
      c.payload.subjectId === p.id &&
      c.payload.public &&
      c.payload.verified &&
      c.payload.dimension === "reliability" &&
      c.payload.value < -0.5 &&
      c.payload.confidence >= 0.8 &&
      c.payload.expiresAt > time,
  );
  if (adverse.length)
    reasons.push("Aktueller belegter öffentlicher Zuverlässigkeitsvorfall");
  const route = commuteSeconds(d.town, p.profile.home.living, x.workplaceId);
  if (route === null || route > p.state.economy.expectations.maxCommuteSeconds)
    reasons.push("Arbeitsweg entspricht nicht der eigenen Erwartung");
  const previous = d.contracts.get(p.id);
  if (previous?.payload.job === x.title)
    reasons.push("Bereits in dieser Stelle beschäftigt");
  return {
    eligible: !reasons.length,
    reasons,
    skill,
    requiredSkill: x.minimumSkill,
    estimatedNetCents: x.estimatedNetCents,
    score:
      (skill - x.minimumSkill) * 0.6 +
      (p.state.economy.expectations.preferredSkill === x.skill ? 0.2 : 0) +
      x.estimatedNetCents / 1000000,
  };
}
export function applyForJob(d, p, listing, time, emit) {
  const assessment = jobAssessment(d, p, listing, time),
    e = emit("job_application", p, time, {
      listingId: listing.id,
      firmId: listing.payload.firmId,
      assessment,
      private: true,
    });
  p.state.economy.lastApplicationEventId = e.id;
  if (!assessment.eligible) {
    e.description =
      p.name +
      " erhält auf die Bewerbung eine begründete Absage: " +
      assessment.reasons.join("; ") +
      ".";
    return { ok: false, ...assessment, eventId: e.id };
  }
  const x = listing.payload,
    old = d.contracts.get(p.id),
    firm = d.firms.get(x.firmId);
  if (old) {
    old.payload.status = "ended";
    old.payload.endedAt = time;
    touch(d, old);
  }
  const contract = put(
    d,
    "employment",
    {
      simId: p.id,
      firmId: firm.id,
      job: x.title,
      grossMonthlyCents: x.grossMonthlyCents,
      skill: x.skill,
      status: "active",
      hoursPerDay: x.hoursPerDay,
      daysPerWeek: 5,
      startedAt: time,
      origin: "accepted_application",
      sourceEventId: e.id,
      pendingGrossCents: 0,
      workRemainder: 0,
      workedByDay: {},
      lastPaidMonth: null,
      holiday: x.holiday,
      holidayDaysByYear: {},
    },
    { ownerId: p.id },
  );
  d.contracts.set(p.id, contract);
  p.state.economy.employmentId = contract.id;
  x.slots--;
  touch(d, listing);
  if (!x.holiday) {
    p.profile.job = x.title;
    p.profile.workplace_id = x.workplaceId;
    const spec = JOBS[x.title],
      venue = d.calendar.payload.venues[spec.venue];
    p.profile.facility = {
      buildingId: venue.building,
      rooms: { hall: x.workplaceId, wc: venue.bath },
      economicWorkplace: true,
    };
    p.state.career = {
      ...p.state.career,
      job: x.title,
      skill: x.skill,
      schedule_start: 8 * 3600,
    };
  }
  firm.payload.impressions[p.id] = {
    score: 0.5,
    confidence: 0.5,
    at: time,
    eventIds: [e.id],
    basis: "Actual application, not knowledge of private motives",
  };
  touch(d, firm);
  e.facts.result = "hired";
  e.facts.contractId = contract.id;
  e.description =
    p.name +
    " bekommt die Stelle " +
    x.title +
    ": " +
    (x.grossMonthlyCents / 100).toFixed(0) +
    " € vereinbarter Monatsbruttolohn. Das Geld wird erst durch tatsächliche Arbeit verdient.";
  return { ok: true, contractId: contract.id, eventId: e.id };
}
export function accrueWork(d, p, event, seconds) {
  const contract = d.contracts.get(p.id);
  if (!contract) return false;
  const x = contract.payload,
    firm = d.firms.get(x.firmId);
  if (p.state.location_id !== firm.payload.workplaceId || x.status !== "active")
    return false;
  const day = Math.floor(event.end / 86400),
    date = calendarDate(event.end),
    year = String(date.getUTCFullYear());
  if (date.getUTCDay() === 0 || date.getUTCDay() === 6) return false;
  if (
    x.holiday &&
    (p.age < 15 ||
      p.age >= 18 ||
      !isHoliday(d, event.end) ||
      !p.state.economy.guardianPermission ||
      (Object.keys(x.holidayDaysByYear?.[year] || {}).length >= 20 &&
        !x.holidayDaysByYear?.[year]?.[day]))
  )
    return false;
  const used = x.workedByDay[day] || 0,
    allowed = Math.max(0, Math.min(seconds, x.hoursPerDay * 3600 - used));
  if (!allowed) return false;
  const denominator = x.hoursPerDay * 3600 * 21,
    numerator = x.grossMonthlyCents * allowed + (x.workRemainder || 0),
    earned = Math.floor(numerator / denominator);
  x.workRemainder = numerator % denominator;
  x.workedByDay[day] = used + allowed;
  for (const key of Object.keys(x.workedByDay))
    if (+key < day - 35) delete x.workedByDay[key];
  if (x.holiday) {
    x.holidayDaysByYear ||= {};
    (x.holidayDaysByYear[year] ||= {})[day] = true;
  }
  x.pendingGrossCents += earned;
  p.state.economy.pendingGrossCents = x.pendingGrossCents;
  p.state.economy.paidWorkSeconds += allowed;
  touch(d, contract);
  event.facts.earnedGrossCents = earned;
  event.facts.employmentId = contract.id;
  const grade = event.facts.checks?.[p.id]?.grade,
    prior = firm.payload.impressions[p.id] || {
      score: 0.5,
      confidence: 0.4,
      eventIds: [],
    };
  firm.payload.impressions[p.id] = {
    score: Math.max(
      0,
      Math.min(
        1,
        prior.score * 0.92 +
          ({ excellent: 0.95, success: 0.75, mixed: 0.5, setback: 0.25 }[
            grade
          ] || 0.55) *
            0.08,
      ),
    ),
    confidence: Math.min(0.9, prior.confidence + 0.02),
    eventIds: prior.eventIds.concat(event.id).slice(-8),
    at: event.end,
    basis: "Own observed work results",
  };
  touch(d, firm);
  // Productive outside orders are bounded actual trade with other towns; not
  // free municipal money. Consumer-facing firms earn from customer purchases.
  if (firm.payload.revenueModel === "regional_orders") {
    const demand = d.calendar.payload.regionalDemandFactor ?? 1,
      receipt = cents(earned * 1.4 * demand);
    transfer(d, fundsOf(d).external, firm.payload.accountId, receipt, {
      key: { kind: "regional_order", eventId: event.id },
      at: event.end,
      eventId: event.id,
      kind: "outside_customer_order",
      metadata: {
        actualWorkSeconds: allowed,
        declaredBoundary: "regional customers outside simulated town",
      },
    });
  }
  return true;
}
export function newInvoice(
  d,
  p,
  h,
  kind,
  amount,
  creditorAccountId,
  time,
  emit,
  extra = {},
) {
  const e = emit("invoice_issued", p, time, {
    kind,
    amountCents: amount,
    private: true,
    ...extra,
  });
  e.description =
    p.name +
    " hat eine fällige Verpflichtung: " +
    kind +
    " · " +
    (amount / 100).toFixed(2) +
    " €.";
  const invoice = put(
    d,
    "invoice",
    {
      simId: p.id,
      householdId: h?.id || null,
      kind,
      amountCents: amount,
      remainingCents: amount,
      creditorAccountId,
      debtorAccountId: h ? h.payload.jointAccountId : ownAccount(d, p),
      status: "due",
      dueAt: time,
      sourceEventId: e.id,
      lastAttemptDay: -1,
      ...extra,
    },
    { ownerId: h?.id || p.id },
  );
  d.invoices.push(invoice);
  return invoice;
}
export function payInvoice(d, invoice, time, emit) {
  const x = invoice.payload;
  if (x.status === "paid") return true;
  const p = d.people.get(x.simId),
    h = d.households.get(x.householdId);
  if (!p) return false;
  if (h) jointFunds(d, h, x.remainingCents, time, emit);
  const available = Math.max(0, balance(d, x.debtorAccountId)),
    amount = Math.min(available, x.remainingCents);
  if (!amount) {
    const e = emit("bill_payment_deferred", p, time, {
      invoiceId: invoice.id,
      remainingCents: x.remainingCents,
      private: true,
    });
    e.description =
      p.name +
      " kann die tatsächliche fällige Rechnung " +
      x.kind +
      " heute noch nicht bezahlen und muss Hilfe oder eine neue Absprache suchen.";
    x.lastAttemptDay = Math.floor(time / 86400);
    touch(d, invoice);
    return false;
  }
  const e = emit("bill_payment", p, time, {
    invoiceId: invoice.id,
    kind: x.kind,
    amountCents: amount,
    private: true,
  });
  e.description =
    p.name + " bezahlt " + (amount / 100).toFixed(2) + " € für " + x.kind + ".";
  const previousPaid = x.amountCents - x.remainingCents;
  const vat = x.vatRate
    ? Math.round((previousPaid + amount) / (1 + x.vatRate)) -
      Math.round(previousPaid / (1 + x.vatRate))
    : amount;
  const contribution =
    x.kind === "self_employment_tax_and_social" ? x.socialCents || 0 : 0;
  const levy = (fraction) =>
    Math.round(
      ((previousPaid + amount) * contribution * fraction) / x.amountCents,
    ) - Math.round((previousPaid * contribution * fraction) / x.amountCents);
  const health = levy(0.45),
    social = levy(0.55);
  const result = post(
    d,
    [
      { accountId: x.debtorAccountId, amount: -amount },
      { accountId: x.creditorAccountId, amount: vat - health - social },
      ...(contribution
        ? [
            { accountId: fundsOf(d).health, amount: health },
            { accountId: fundsOf(d).social, amount: social },
          ]
        : []),
      ...(x.vatRate
        ? [{ accountId: fundsOf(d).region, amount: amount - vat }]
        : []),
    ],
    {
      key: { kind: "bill_payment", eventId: e.id },
      at: time,
      eventId: e.id,
      kind: x.kind,
      metadata: { invoiceId: invoice.id },
    },
  );
  if (!result.ok) throw new Error("Reserved invoice funds changed");
  x.remainingCents -= amount;
  x.status = x.remainingCents ? "partly_paid" : "paid";
  x.lastAttemptDay = Math.floor(time / 86400);
  x.lastPaymentEventId = e.id;
  touch(d, invoice);
  flow(p, time, x.kind, -amount);
  if (x.leaseId) {
    const lease = d.entities.get(x.leaseId);
    lease.payload.arrearsCents = Math.max(
      0,
      lease.payload.arrearsCents - amount,
    );
    touch(d, lease);
    const owner = d.people.get(lease.payload.landlordId);
    if (owner) {
      flow(owner, time, "rent_income", amount);
      owner.state.economy.rentalReceivedCents =
        (owner.state.economy.rentalReceivedCents || 0) + amount;
    }
  }
  if (x.loanId) {
    const loan = d.entities.get(x.loanId),
      interest = Math.min(
        amount,
        Math.max(0, (x.interestCents || 0) - (x.interestPaidCents || 0)),
      ),
      principal = Math.min(loan.payload.principalCents, amount - interest);
    x.interestPaidCents = (x.interestPaidCents || 0) + interest;
    loan.payload.principalCents -= principal;
    if (!loan.payload.principalCents) loan.payload.status = "paid";
    touch(d, loan);
  }
  if (x.status === "paid")
    addFeeling(p, "relief", 0.3, time, {
      kind: "financial_event",
      text: "Eine wirkliche fällige Rechnung ist bezahlt.",
      evidence_id: e.id,
    });
  return x.status === "paid";
}
export function payroll(d, contract, time, emit) {
  const x = contract.payload,
    p = d.people.get(x.simId);
  if (!p || !x.pendingGrossCents) return;
  const firm = d.firms.get(x.firmId),
    gross = x.pendingGrossCents,
    social = Math.round(gross * POLICY.employee_social_rate),
    employerSocial = Math.round(gross * POLICY.employer_social_rate),
    tax = incomeTax(gross),
    net = gross - social - tax,
    total = gross + employerSocial;
  const sequence = (x.payrollSequence || 0) + 1;
  if (firm.payload.publicFund) {
    const fund = fundsOf(d)[firm.payload.publicFund];
    transfer(d, fund, firm.payload.accountId, total, {
      key: {
        kind: "funded_payroll",
        contractId: contract.id,
        sequence,
        month: monthKey(time),
      },
      at: time,
      kind: "public_staff_budget",
    });
  }
  const e = emit("salary_due", p, time, {
    grossCents: gross,
    netCents: net,
    employmentId: contract.id,
    private: true,
  });
  const paid = post(
    d,
    [
      { accountId: firm.payload.accountId, amount: -total },
      { accountId: ownAccount(d, p), amount: net },
      { accountId: fundsOf(d).city, amount: Math.round(tax * 0.15) },
      { accountId: fundsOf(d).region, amount: tax - Math.round(tax * 0.15) },
      {
        accountId: fundsOf(d).health,
        amount: Math.round((social + employerSocial) * 0.45),
      },
      {
        accountId: fundsOf(d).social,
        amount:
          social +
          employerSocial -
          Math.round((social + employerSocial) * 0.45),
      },
    ],
    {
      key: {
        kind: "payroll",
        contractId: contract.id,
        sequence,
        month: monthKey(time),
      },
      at: time,
      eventId: e.id,
      kind: "payroll",
      metadata: {
        grossCents: gross,
        taxCents: tax,
        employeeSocialCents: social,
        employerSocialCents: employerSocial,
        actualEarned: true,
      },
    },
  );
  if (paid.ok && !paid.duplicate) {
    x.payrollSequence = sequence;
    const year = String(calendarDate(time).getUTCFullYear());
    p.state.economy.earnedYear[year] ||= {
      grossCents: 0,
      taxCents: 0,
      socialCents: 0,
      netCents: 0,
    };
    const y = p.state.economy.earnedYear[year];
    y.grossCents += gross;
    y.taxCents += tax;
    y.socialCents += social;
    y.netCents += net;
    p.state.economy.wageArrearsCents = 0;
    e.description =
      p.name +
      " erhält " +
      (net / 100).toFixed(2) +
      " € Nettolohn für tatsächlich geleistete Arbeit. " +
      ((social + employerSocial + tax) / 100).toFixed(2) +
      " € gehen getrennt an die zuständigen Fonds.";
    x.pendingGrossCents = 0;
    p.state.economy.pendingGrossCents = 0;
    x.lastPaidMonth = monthKey(time);
    flow(p, time, "salary", net);
    addFeeling(p, "relief", 0.35, time, {
      kind: "financial_event",
      text: "Der tatsächliche Lohn ist eingegangen.",
      evidence_id: e.id,
    });
  } else {
    e.description =
      p.name +
      " wartet weiter auf " +
      (net / 100).toFixed(2) +
      " € verdienten Nettolohn; dem Arbeitgeber fehlen die Mittel.";
    e.facts.status = "arrears";
    p.state.economy.wageArrearsCents = net;
  }
  touch(d, contract);
}
export function issueLoan(
  d,
  p,
  {
    amountCents,
    months = 12,
    lenderId = null,
    purpose = "personal",
    annualRate = 0.08,
    consent = false,
  },
  time,
  emit,
) {
  if (
    p.age < 18 ||
    !consent ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 10000 ||
    amountCents > 5000000 ||
    !Number.isInteger(months) ||
    months < 1 ||
    months > 120 ||
    !Number.isFinite(annualRate) ||
    annualRate < 0 ||
    annualRate > 0.3
  )
    return {
      ok: false,
      reason: "Loan requires an adult, explicit acceptance and bounded terms",
    };
  const h = householdOf(d, p),
    f = householdForecast(d, h, time),
    i = annualRate / 12,
    payment = cents(
      i
        ? (amountCents * i) / (1 - Math.pow(1 + i, -months))
        : amountCents / months,
    ),
    net = d.contracts.get(p.id)
      ? estimatedNet(d.contracts.get(p.id).payload.grossMonthlyCents)
      : p.state.economy.pensionCents ||
        p.state.economy.approvedBenefitCents ||
        0;
  if (payment > net * 0.2 || f.marginCents < payment)
    return {
      ok: false,
      reason:
        "Unbezahlbare Rate; Hilfe oder günstigere Alternative statt neuer Schulden",
    };
  let lenderAccount = fundsOf(d).bank;
  if (lenderId) {
    const lender = d.people.get(lenderId);
    if (
      !lender ||
      lender.age < 18 ||
      !p.relations[lenderId] ||
      p.relations[lenderId].trust < 0.5 ||
      !lender.relations[p.id] ||
      lender.relations[p.id].trust < 0.5
    )
      return {
        ok: false,
        reason: "A personal loan requires a known willing adult lender",
      };
    lenderAccount = ownAccount(d, lender);
    if (balance(d, lenderAccount) < amountCents + 200000)
      return { ok: false, reason: "Lender protects their own reserve" };
  }
  if (balance(d, lenderAccount) < amountCents)
    return { ok: false, reason: "Tatsächlicher Kreditfonds reicht nicht" };
  const e = emit(
    "loan_accepted",
    p,
    time,
    { amountCents, months, paymentCents: payment, purpose, private: true },
    lenderId ? [lenderId] : [],
  );
  const result = transfer(d, lenderAccount, ownAccount(d, p), amountCents, {
    key: { kind: "loan_disbursement", eventId: e.id },
    at: time,
    eventId: e.id,
    kind: "loan_principal",
  });
  if (!result.ok) return { ok: false, reason: "Kreditfonds nicht gedeckt" };
  const loan = put(
    d,
    "loan",
    {
      borrowerId: p.id,
      lenderId,
      lenderAccountId: lenderAccount,
      originalPrincipalCents: amountCents,
      principalCents: amountCents,
      annualRate,
      months,
      paymentCents: payment,
      startedAt: time,
      status: "active",
      missedMonths: 0,
      sourceEventId: e.id,
      purpose,
      lastDueMonth: monthKey(time),
    },
    { ownerId: p.id },
  );
  d.loans.push(loan);
  e.description =
    p.name +
    " akzeptiert einen finanzierten Kredit von " +
    (amountCents / 100).toFixed(0) +
    " € mit " +
    (payment / 100).toFixed(2) +
    " € Monatsrate. Auszahlung und neue Schuld gleichen sich im Nettovermögen aus.";
  return { ok: true, loanId: loan.id };
}
export function buyItem(d, p, itemId, time, emit) {
  const spec = ITEMS.find((i) => i.id === itemId);
  if (!spec) return { ok: false, reason: "Unknown item" };
  const price = cents((spec.minCents + spec.maxCents) / 2),
    reserve =
      p.age >= 18
        ? Math.min(
            100000,
            householdForecast(d, householdOf(d, p), time).fixedCents,
          )
        : 0;
  if (
    (p.age < 18 && /(?:_car$|^workstation$|^business_tools$)/.test(itemId)) ||
    ["trophy", "adaptive", "project"].includes(itemId)
  )
    return {
      ok: false,
      reason:
        "Erfordert einen belegten Erfolg, Versorgung oder eigene Herstellung; kein käuflicher Nachweis",
    };
  if (balance(d, ownAccount(d, p)) < price + reserve)
    return {
      ok: false,
      reason: "Nicht finanzierbar ohne die Grundversorgung zu verdrängen",
    };
  const e = emit("item_purchase", p, time, {
      catalogId: itemId,
      priceCents: price,
      private: true,
    }),
    vat = price - cents(price / 1.19),
    seller = d.firms.get(d.market.payload.firmId);
  post(
    d,
    [
      { accountId: ownAccount(d, p), amount: -price },
      { accountId: seller.payload.accountId, amount: price - vat },
      { accountId: fundsOf(d).region, amount: vat },
    ],
    {
      key: { kind: "item_purchase", eventId: e.id },
      at: time,
      eventId: e.id,
      kind: "item_purchase",
      metadata: { vatCents: vat },
    },
  );
  const item = put(
    d,
    "item",
    {
      catalogId: itemId,
      ownerId: p.id,
      locationId: p.state.location_id || p.profile.home.living,
      condition: 1,
      publiclyDisplayed: false,
      loanedTo: null,
      stolen: false,
      emotionalValue: 0.5,
      sourceEventId: e.id,
    },
    { ownerId: p.id },
  );
  d.items.push(item);
  flow(p, time, "item_purchase", -price);
  e.description =
    p.name + " kauft " + spec.name + " für " + (price / 100).toFixed(2) + " €.";
  return { ok: true, itemId: item.id };
}
export function shopping(d, h, time, emit, { force = false } = {}) {
  const day = Math.floor(time / 86400),
    members = h.payload.members.map((id) => d.people.get(id)).filter(Boolean),
    buyer = members.find((p) => p.age >= 18);
  if (!buyer || (!force && h.payload.lastShoppingDay === day)) return false;
  const stock = Object.values(h.payload.food)
    .filter(Number.isFinite)
    .slice(0, 3)
    .reduce((a, b) => a + b, 0);
  if (!force && stock >= members.length * 3) return false;
  const f = householdForecast(d, h, time),
    tier =
      f.marginCents > 80000 &&
      ["upper", "very_wealthy"].includes(h.payload.stratum)
        ? "premium"
        : f.days30Cents < 100000
          ? "basic"
          : "standard",
    offers = d.market.payload.offers,
    candidates = [
      tier,
      ...["basic", "standard", "premium"].filter((t) => t !== tier),
    ].filter((t) => offers[t].stock > 0),
    chosen = candidates.find(
      (t) =>
        offers[t].priceCents * Math.min(members.length, offers[t].stock) <=
        householdSpendable(d, h),
    );
  if (!chosen) {
    buyer.state.economy.foodShortage = true;
    return false;
  }
  const offer = offers[chosen],
    portions = Math.min(
      members.length * 6,
      offer.stock,
      Math.floor(householdSpendable(d, h) / offer.priceCents),
    ),
    cost = portions * offer.priceCents;
  if (!portions || !jointFunds(d, h, cost, time, emit)) return false;
  const e = emit("grocery_purchase", buyer, time, {
      householdId: h.id,
      tier: chosen,
      portions,
      costCents: cost,
      private: true,
    }),
    net = cents(cost / (1 + offer.vat)),
    retailer = d.firms.get(d.market.payload.firmId);
  post(
    d,
    [
      { accountId: h.payload.jointAccountId, amount: -cost },
      { accountId: retailer.payload.accountId, amount: net },
      { accountId: fundsOf(d).region, amount: cost - net },
    ],
    {
      key: { kind: "groceries", eventId: e.id },
      at: time,
      eventId: e.id,
      kind: "groceries",
      metadata: { portions, tier: chosen, vatCents: cost - net },
    },
  );
  offer.stock -= portions;
  h.payload.food[chosen] += portions;
  h.payload.food.lastStockDay = day;
  h.payload.lastShoppingDay = day;
  touch(d, h);
  touch(d, d.market);
  buyer.state.economy.foodShortage = false;
  flow(buyer, time, "groceries", -cost);
  e.description =
    buyer.name +
    " kauft " +
    portions +
    " Portionen (" +
    chosen +
    ") für " +
    (cost / 100).toFixed(2) +
    " €. Der Vorrat wird erst beim tatsächlichen Essen verbraucht.";
  return true;
}
export function consumeFood(d, p, event, time) {
  const h = householdOf(d, p),
    carried = p.state.economy.carriedFood;
  if (carried?.portions > 0 && time - carried.packedAt < 86400) {
    carried.portions--;
    event.facts.food = {
      tier: carried.tier,
      consumedPortions: 1,
      carried: true,
      sourceEventId: carried.sourceEventId,
      chargedAgain: false,
    };
    p.state.economy.foodShortage = false;
    return true;
  }
  if (carried && time - carried.packedAt >= 86400) carried.portions = 0;
  const atHome = Object.values(p.profile.home).includes(p.state.location_id);
  let tier = atHome
    ? ["premium", "standard", "basic"].find((k) => h.payload.food[k] >= 1)
    : null;
  if (!tier && atHome) {
    shopping(d, h, time, d.emit, { force: true });
    tier = ["standard", "basic", "premium"].find((k) => h.payload.food[k] >= 1);
  }
  if (tier) {
    h.payload.food[tier]--;
    touch(d, h);
    event.facts.food = {
      householdId: h.id,
      tier,
      consumedPortions: 1,
      chargedAgain: false,
    };
    p.state.economy.foodShortage = false;
    return true;
  }
  const foodVenue = d.town.places.get(p.state.location_id);
  if (
    foodVenue?.purpose.includes("cafe") &&
    balance(d, ownAccount(d, p)) >= 500
  ) {
    const firm = [...d.firms.values()].find((f) => f.payload.role === "Chef"),
      net = Math.round(500 / 1.07);
    post(
      d,
      [
        { accountId: ownAccount(d, p), amount: -500 },
        { accountId: firm.payload.accountId, amount: net },
        { accountId: fundsOf(d).region, amount: 500 - net },
      ],
      {
        key: { kind: "served_meal", eventId: event.id },
        at: time,
        eventId: event.id,
        kind: "served_meal",
      },
    );
    p.state.economy.foodShortage = false;
    event.facts.food = { served: true, consumedPortions: 1, costCents: 500 };
    flow(p, time, "served_meal", -500);
    return true;
  }
  // Actual free supported meal, financed by the social fund and served at a
  // reachable shelter/community kitchen; no imaginary unlimited fridge.
  const shelter = d.calendar.payload.venues.shelter;
  if (
    Object.values(shelter.rooms).includes(p.state.location_id) &&
    balance(d, fundsOf(d).social) >= 250
  ) {
    transfer(
      d,
      fundsOf(d).social,
      d.firms.get(d.market.payload.firmId).payload.accountId,
      250,
      {
        key: { kind: "supported_meal", eventId: event.id },
        at: time,
        eventId: event.id,
        kind: "supported_meal",
      },
    );
    p.state.economy.foodShortage = false;
    event.facts.food = {
      supported: true,
      consumedPortions: 1,
      chargedToSim: false,
    };
    return true;
  }
  p.state.economy.foodShortage = true;
  event.facts.food = { consumedPortions: 0, unavailable: true };
  return false;
}
export function monthlyEconomy(d, time, emit) {
  const key = monthKey(time);
  if (d.calendar.payload.lastMonth === key) return;
  const initial = d.calendar.payload.lastMonth === null,
    date = calendarDate(time),
    days = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate(),
    fraction = initial ? (days - date.getUTCDate() + 1) / days : 1;
  d.calendar.payload.lastMonth = key;
  touch(d, d.calendar);
  for (const institution of rows(d, "institution")) {
    const x = institution.payload;
    if (x.monthlyGrant) {
      const year = String(date.getUTCFullYear()),
        already = x.annualGranted[year] || 0,
        grant = Math.max(
          0,
          Math.min(
            cents(x.monthlyGrant * fraction),
            x.monthlyGrant * 12 - already,
          ),
        );
      x.annualGranted[year] = already + grant;
      touch(d, institution);
      transfer(d, fundsOf(d).external, x.accountId, grant, {
        key: {
          kind: "regional_grant",
          institutionId: institution.id,
          month: key,
        },
        at: time,
        kind: "declared_regional_grant",
        metadata: { finiteGrantCents: grant, fraction },
      });
    }
  }
  for (const contract of rows(d, "employment"))
    payroll(d, contract, time, emit);
  for (const p of d.people.values())
    if (p.age >= 18) {
      const h = householdOf(d, p),
        retired = p.profile.job === "Retired",
        unemployed = !d.contracts.has(p.id) && p.profile.job !== "Student";
      if (p.state.economy.parentalCare) {
        const amount = cents(
            p.state.economy.parentalCare.benefitCents * fraction,
          ),
          e = emit("parental_care_support", p, time, {
            amountCents: amount,
            private: true,
          });
        const paid = transfer(d, fundsOf(d).social, ownAccount(d, p), amount, {
          key: { kind: "approved_parental_care", simId: p.id, month: key },
          at: time,
          eventId: e.id,
          kind: "parental_care_support",
        });
        e.description =
          p.name +
          (paid.ok
            ? " erhält die bewilligte Unterstützung für tatsächliche Betreuung des kleinen Kindes."
            : " wartet auf die bewilligte Betreuungsunterstützung.");
        if (paid.ok) flow(p, time, "parental_care_support", amount);
        continue;
      }
      if (retired || unemployed) {
        const eligible =
          retired ||
          (householdCash(d, h) < 600000 &&
            householdForecast(d, h, time).incomeCents <
              150000 * h.payload.members.length);
        const full = retired
          ? p.state.economy.pensionCents || 120000
          : eligible
            ? 90000
            : 0;
        if (retired) p.state.economy.pensionCents = full;
        else p.state.economy.approvedBenefitCents = full;
        if (full) {
          const e = emit("support_payment", p, time, {
            kind: retired ? "pension" : "approved_support",
            amountCents: cents(full * fraction),
            private: true,
          });
          const result = transfer(
            d,
            fundsOf(d).social,
            ownAccount(d, p),
            cents(full * fraction),
            {
              key: {
                kind: retired ? "pension" : "approved_support",
                simId: p.id,
                month: key,
              },
              at: time,
              eventId: e.id,
              kind: retired ? "pension" : "approved_support",
            },
          );
          e.description =
            p.name +
            (result.ok
              ? " erhält " +
                ((full * fraction) / 100).toFixed(2) +
                " € " +
                (retired ? "Rente" : "geprüfte Unterstützung") +
                "."
              : " wartet auf die zugesagte Unterstützung, weil dem Fonds Mittel fehlen.");
          if (result.ok)
            flow(
              p,
              time,
              retired ? "pension" : "support",
              cents(full * fraction),
            );
        }
      }
    }
  for (const h of d.households.values()) {
    const p =
        h.payload.members
          .map((id) => d.people.get(id))
          .find((p) => p?.age >= 18) || d.people.get(h.payload.members[0]),
      lease = d.entities.get(h.payload.leaseId);
    if (lease?.payload.status === "active") {
      const amount = cents(lease.payload.rentCents * fraction),
        landlordAccount =
          ownerAccount(d, lease.payload.landlordId, "personal") ||
          ownerAccount(d, lease.payload.landlordId, "housing");
      newInvoice(d, p, h, "rent", amount, landlordAccount.id, time, emit, {
        leaseId: lease.id,
        period: key,
      });
      lease.payload.arrearsCents += amount;
      lease.payload.nextDueMonth = key;
      touch(d, lease);
    }
    newInvoice(
      d,
      p,
      h,
      "utilities",
      cents(h.payload.budget.utilities * fraction),
      fundsOf(d).external,
      time,
      emit,
      { period: key },
    );
    for (const child of h.payload.members
      .map((id) => d.people.get(id))
      .filter((p) => p.age >= 6 && p.age < 18)) {
      const giver = h.payload.members
          .map((id) => d.people.get(id))
          .find((p) => p.age >= 18),
        amount = cents(
          (child.age < 10 ? 1500 : child.age < 14 ? 2500 : 4000) * fraction,
        );
      if (giver && balance(d, ownAccount(d, giver)) > amount + 10000) {
        const e = emit(
          "pocket_money",
          child,
          time,
          { amountCents: amount, private: true },
          [giver.id],
        );
        transfer(d, ownAccount(d, giver), ownAccount(d, child), amount, {
          key: { kind: "pocket_money", childId: child.id, month: key },
          at: time,
          eventId: e.id,
          kind: "internal_family_transfer",
        });
        e.description =
          child.name +
          " bekommt " +
          (amount / 100).toFixed(2) +
          " € Taschengeld von " +
          giver.name +
          ".";
      }
    }
  }
  for (const loan of d.loans.filter(
    (l) => l.payload.status === "active" && l.payload.lastDueMonth !== key,
  )) {
    const x = loan.payload,
      p = d.people.get(x.borrowerId),
      interest = cents((x.principalCents * x.annualRate) / 12),
      amount = Math.min(x.paymentCents, x.principalCents + interest);
    newInvoice(
      d,
      p,
      null,
      "loan_payment",
      amount,
      x.lenderAccountId,
      time,
      emit,
      { loanId: loan.id, interestCents: interest, period: key },
    );
    x.lastDueMonth = key;
    touch(d, loan);
  }
  for (const p of d.people.values())
    if (p.age >= 18 && (p.state.economy.selfEmploymentIncomeCents || 0) > 0) {
      const income = p.state.economy.selfEmploymentIncomeCents,
        payment =
          incomeTax(income) +
          Math.round(
            income *
              (POLICY.employee_social_rate + POLICY.employer_social_rate),
          );
      newInvoice(
        d,
        p,
        null,
        "self_employment_tax_and_social",
        payment,
        fundsOf(d).region,
        time,
        emit,
        {
          period: key,
          declaredSelfEmploymentCents: income,
          socialCents: Math.round(
            income *
              (POLICY.employee_social_rate + POLICY.employer_social_rate),
          ),
        },
      );
      p.state.economy.selfEmploymentIncomeCents = 0;
    }
  for (const p of d.people.values())
    if ((p.state.economy.rentalReceivedCents || 0) > 0) {
      const received = p.state.economy.rentalReceivedCents,
        cost = p.state.economy.rentalCostsCents || 0,
        profit = Math.max(0, received - cost),
        salary = d.contracts.get(p.id)?.payload.grossMonthlyCents || 0,
        tax = Math.max(0, incomeTax(salary + profit) - incomeTax(salary));
      if (tax)
        newInvoice(
          d,
          p,
          null,
          "rental_income_tax",
          tax,
          fundsOf(d).region,
          time,
          emit,
          { taxableRentalProfitCents: profit },
        );
      p.state.economy.rentalReceivedCents = 0;
      p.state.economy.rentalCostsCents = 0;
    }
}
export function refreshOwnResources(d, time) {
  const pending = new Map();
  for (const c of rows(d, "employment"))
    pending.set(
      c.payload.simId,
      (pending.get(c.payload.simId) || 0) + (c.payload.pendingGrossCents || 0),
    );
  for (const p of d.people.values()) {
    p.state.economy.cashCents = balance(d, ownAccount(d, p));
    p.state.economy.pendingGrossCents = pending.get(p.id) || 0;
    if (p.age >= 18)
      p.state.economy.householdForecast = householdForecast(
        d,
        householdOf(d, p),
        time,
      );
  }
}
export function economicMinute(d, time, emit) {
  if (!d) return;
  for (const subscription of rows(d, "subscription")) {
    const x = subscription.payload;
    if (x.status !== "active" || x.nextDueAt > time) continue;
    const p = d.people.get(x.simId),
      due = x.nextDueAt;
    const invoice = newInvoice(
      d,
      p,
      null,
      "membership",
      x.monthlyCents,
      x.sellerAccountId,
      time,
      emit,
      {
        subscriptionId: subscription.id,
        period: String(due),
        vatRate: x.vatRate || 0,
      },
    );
    x.lastDueMonth = monthKey(time);
    x.nextDueAt = due + 30 * 86400;
    x.lastInvoiceId = invoice.id;
    touch(d, subscription);
    payInvoice(d, invoice, time, emit);
  }

  if (!d) return;
  d.emit = emit;
  const day = Math.floor(time / 86400),
    hour = (time / 3600) % 24,
    date = calendarDate(time);
  monthlyEconomy(d, time, emit);
  if (d.calendar.payload.lastDay !== day) {
    d.calendar.payload.lastDay = day;
    touch(d, d.calendar);
    const market = d.market.payload,
      quantity = Math.round(d.people.size * 3 * (market.supplyFactor || 1));
    for (const [tier, offer] of Object.entries(market.offers)) {
      const count = Math.max(
          0,
          Math.round(
            quantity * (tier === "basic" ? 2 : tier === "standard" ? 1.6 : 0.5),
          ) - offer.stock,
        ),
        cost = cents(count * offer.priceCents * 0.55),
        retailer = d.firms.get(market.firmId);
      if (
        transfer(d, retailer.payload.accountId, fundsOf(d).external, cost, {
          key: { kind: "wholesale_supply", marketId: d.market.id, tier, day },
          at: time,
          kind: "wholesale_purchase",
        }).ok
      )
        offer.stock += count;
    }
    market.lastRestockDay = day;
    touch(d, d.market);
    for (const h of d.households.values()) {
      if (day - h.payload.food.lastStockDay > 5) {
        h.payload.food.basic = Math.floor(h.payload.food.basic * 0.6);
        h.payload.food.standard = Math.floor(h.payload.food.standard * 0.5);
        h.payload.food.premium = Math.floor(h.payload.food.premium * 0.3);
        h.payload.food.lastStockDay = day;
        touch(d, h);
      }
    }
  }
  for (const invoice of d.invoices)
    if (
      invoice.payload.status !== "paid" &&
      invoice.payload.dueAt <= time &&
      invoice.payload.lastAttemptDay !== day
    )
      payInvoice(d, invoice, time, emit);
  if (hour >= 8 && hour < 20) {
    for (const h of d.households.values()) {
      shopping(d, h, time, emit);
      const f = householdForecast(d, h, time);
      h.payload.forecasts = f;
      touch(d, h);
      for (const id of h.payload.members) {
        const p = d.people.get(id);
        p.state.economy.householdForecast = f;
        p.state.economy.cashCents = balance(d, ownAccount(d, p));
        p.state.economy.threats = (p.state.economy.threats || []).filter(
          (t) => !["cash_shortfall", "food_shortage"].includes(t.kind),
        );
        if (
          p.age >= 18 &&
          f.days30Cents + Math.max(0, balance(d, ownAccount(d, p)) - 2000) < 0
        )
          p.state.economy.threats.push({
            kind: "cash_shortfall",
            probability: Math.min(
              0.95,
              0.35 + Math.abs(f.days30Cents) / Math.max(1, f.costCents),
            ),
            expectedAt: time + 30 * 86400,
            source: "own_confirmed_budget",
            amountCents: -f.days30Cents,
            options: [
              "job_market",
              "housing_market",
              "support",
              "free_leisure",
            ],
          });
        if (p.state.economy.foodShortage)
          p.state.economy.threats.push({
            kind: "food_shortage",
            probability: 1,
            source: "actual_empty_stock",
            options: ["supported_meal", "ask_help"],
          });
      }
    }
  }
  // Job search once per eligible day, not an O(population²) social scan.
  if (
    hour >= 9 &&
    hour < 18 &&
    date.getUTCDay() !== 0 &&
    date.getUTCDay() !== 6
  )
    for (const p of d.people.values()) {
      if (
        p.state.economy.parentalCare ||
        p.age < 15 ||
        p.age >= 66 ||
        p.state.economy.lastJobSearch === day ||
        !p.state.location_id ||
        ["sleep", "toilet", "shower"].includes(p.state.action?.kind)
      )
        continue;
      const current = d.contracts.get(p.id),
        seek =
          !current ||
          p.state.economy.wageArrearsCents > 0 ||
          (p.state.economy.threats.some((t) => t.kind === "cash_shortfall") &&
            day % 3 === 0);
      if (!seek || (p.age < 18 && !isHoliday(d, time))) continue;
      p.state.economy.lastJobSearch = day;
      const candidates = d.jobs
        .map((job) => ({ job, assessment: jobAssessment(d, p, job, time) }))
        .filter((x) => x.assessment.eligible)
        .sort((a, b) => b.assessment.score - a.assessment.score)
        .slice(0, 5);
      if (candidates.length) applyForJob(d, p, candidates[0].job, time, emit);
      else if (p.age >= 18) {
        const e = emit("job_search", p, time, {
          result: "no_matching_offer",
          private: true,
        });
        e.description =
          p.name +
          " prüft Stellenanzeigen. Noch passt keine freie Stelle zu Fähigkeiten, Nachweisen und eigenen Erwartungen; Weiterbildung und Beratung bleiben Möglichkeiten.";
        p.state.goal = {
          kind: "read",
          destination: p.profile.home.living,
          expires: time + 7200,
          reason:
            "Ich möchte eine fehlende Fertigkeit für passende Arbeit ausbauen.",
          source: "procedural_economy",
        };
      }
    }
  d.calendar.payload.lastMinute = time;
  touch(d, d.calendar);
  assertEconomicIntegrity(d);
}
export function economicContext(p) {
  return p.state.economy
    ? {
        cashCents: p.state.economy.cashCents,
        ownPendingGrossCents: p.state.economy.pendingGrossCents,
        householdForecast:
          p.age >= 18 ? p.state.economy.householdForecast : undefined,
        ownThreats: p.state.economy.threats,
        ownReadPublicNews: p.state.economy.knownNews || [],
        jobExpectations: p.state.economy.expectations,
        disclaimer:
          "Only own or jointly disclosed resources; projected income is not cash and never supplies consent",
      }
    : null;
}
