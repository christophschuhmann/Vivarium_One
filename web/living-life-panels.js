/* Dedicated personal finances and education views; loaded before town-life rendering. */
"use strict";
function exGameDate(seconds) {
  return new Date(Date.UTC(2026, 8, 21) + seconds * 1000).toLocaleDateString(
    getLang()==="en"?"en-US":"de-DE",
  );
}
function exMonthName(key) {
  return new Date(key + "-01T12:00:00Z").toLocaleDateString(getLang()==="en"?"en-US":"de-DE", {
    month: "long",
    year: "numeric",
  });
}
function exBudgetRows(rows) {
  return rows
    .map(
      (x) =>
        `<div class="ex-line"><span>${exExplain(x.label, { rent: "cold_rent", utilities: "warm_rent", food: "need", loan: "credit", membership: "projection", care: "care_insurance", payroll: "net" }[x.kind] || "projection")}<small>${esc({ contract: "Agreed", estimate: "Estimated", plan: "Planned", requires_actual_work_and_funded_payroll: "Requires actual work and funded payroll", approved: "Approved" }[x.certainty] || "")}</small></span><b>${money(x.amountCents)}</b></div>`,
    )
    .join("");
}
function exStatementHtml(s) {
  return `<div class="ex-stats"><div><small>${exExplain("Income received", "net")}</small><b>${money(s.incomeCents)}</b></div><div><small>Paid expenses ${exInfo("liquidity")}</small><b>${money(s.spendingCents)}</b></div><div><small>Net result, excluding asset transfers ${exInfo("liquidity")}</small><b class="${s.netCents < 0 ? "ex-negative" : "ex-positive"}">${money(s.netCents)}</b></div><div><small>Documented transactions</small><b>${s.transactionCount}</b></div></div>${s.coverage !== "recorded_period" ? `<p class="ex-note">${s.coverage === "no_recorded_history" ? "There are no recorded transactions for this month yet." : "This month is documented only from the start of the simulation, so this summary is incomplete."} No earlier income or spending is invented.</p>` : ""}<div class="ex-grid">${[
    "income",
    "spending",
  ]
    .map(
      (dir) =>
        `<section class="ex-card"><h3>${dir === "income" ? "Income" : "Spending"} by category</h3>${
          s.categories
            .filter((c) => c.direction === dir)
            .map(
              (c) =>
                `<div class="ex-line"><span>${exExplain(c.label, c.kind === "payroll" ? "net" : c.kind === "rent" ? "cold_rent" : c.kind === "utilities" ? "warm_rent" : c.kind === "care_copayment" ? "care_insurance" : c.kind === "loan_payment" ? "credit" : "liquidity")}<small>${c.count} actual ${c.count === 1 ? "transaction" : "transactions"}</small></span><b>${money(c.amountCents)}</b></div>`,
            )
            .join("") ||
          "<p>No verified payments in this category yet.</p>"
        }</section>`,
    )
    .join(
      "",
    )}</div>${s.payroll.grossCents ? `<section class="ex-card"><h3>How your paid wages were calculated</h3><div class="ex-budget"><div><span>${exExplain("Gross pay", "gross")}</span><b>${money(s.payroll.grossCents)}</b></div><div><span>Fictional income tax ${exInfo("gross")}</span><b>− ${money(s.payroll.taxCents)}</b></div><div><span>${exExplain("Employee social insurance", "social_insurance")}</span><b>− ${money(s.payroll.employeeSocialCents)}</b></div><div><span>${exExplain("Net pay", "net")}</span><b>${money(s.payroll.netCents)}</b></div></div><p class="ex-muted">These deductions explain your net pay. They are not deducted a second time as expenses.</p></section>` : ""}<details><summary>Transfers, deposits, and financing shown separately ${exInfo("deposit")}</summary><div class="ex-budget"><div><span>Internal / restricted funds received</span><b>${money(s.transferInCents)}</b></div><div><span>Internal / restricted funds paid out</span><b>${money(s.transferOutCents)}</b></div><div><span>Financing / assets received ${exInfo("credit")}</span><b>${money(s.financingInCents)}</b></div><div><span>Financing / assets paid out</span><b>${money(s.financingOutCents)}</b></div></div><p>Transfers between personal and shared accounts cancel out in the combined view. Starting assets and loans are not earned income.</p></details><details class="ex-transactions"><summary>Transactions (${s.transactionCount})</summary>${s.transactions.map((t) => `<div class="ex-line"><span>${esc(t.label)}<small>${exGameDate(t.at)} · ${esc(t.classification === "transfer" ? "Transfer" : t.classification === "financing" ? "Financing / asset movement" : "Payment")}</small></span><b class="${t.amountCents < 0 ? "ex-negative" : ""}">${money(t.amountCents)}</b></div>`).join("") || "<p>No transactions.</p>"}${s.offset > 0 ? '<button class="btn btn-soft small" data-ex-ledger-page="' + Math.max(0, s.offset - s.limit) + '">← Previous transactions</button> ' : ""}${s.offset + s.limit < s.transactionCount ? '<button class="btn btn-soft small" data-ex-ledger-page="' + (s.offset + s.limit) + '">More transactions →</button>' : ""}<small>${s.transactionCount ? "Showing " + (s.offset + 1) + "–" + Math.min(s.offset + s.limit, s.transactionCount) + ". " : ""}${esc(s.coverageNote)}</small></details>`;
}
let exFinancePeriod = "previous",
  exFinanceScope = "combined",
  exFinanceReport = null;
function exFinanceHtml(r) {
  livingCurrency=r.currency||"EUR";
  const report = exFinanceReport || r.finances,
    f = report.next,
    s = report[exFinancePeriod];
  return `<div class="ex-section-heading"><div><small>CLEAR PLAN · REAL TRANSACTIONS</small><h2>Finances ${exInfo("liquidity")}</h2><p>${esc(r.household.name)} · ${r.household.members.map((m) => esc(m.name)).join(", ")}</p></div></div>${report.incomeClass?`<section class="ex-card"><h3>${esc(report.incomeClass.label)} ${exInfo("income_class")}</h3><p>Expected household net income ${money(report.incomeClass.monthlyHouseholdNetCents)} ÷ √${report.incomeClass.members} people = <b>${money(report.incomeClass.equivalizedCents)}</b> per equivalent person.</p><p>${Math.round(report.incomeClass.ratio*100)}% of the stated game reference (${money(report.incomeClass.referenceCents)} per month).</p><small>${esc(report.incomeClass.basis)}</small></section>`:""}<section class="ex-card"><h3>Monthly statement</h3><div class="ex-filter-row"><label>Period<select id="ex-finance-period"><option value="previous" ${exFinancePeriod === "previous" ? "selected" : ""}>Previous month · ${exMonthName(report.previous.key)}</option><option value="current" ${exFinancePeriod === "current" ? "selected" : ""}>Current month · ${exMonthName(report.current.key)} so far</option></select></label><label>Accounts<select id="ex-finance-scope">${[
    ["combined", "Personal + shared accounts"],
    ["personal", "Personal account only"],
    ["household", "Shared account only"],
  ]
    .map(
      ([id, label]) =>
        `<option value="${id}" ${exFinanceScope === id ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select></label></div>${exStatementHtml(s)}</section><div class="ex-grid"><section class="ex-card"><h3>Next month · ${exMonthName(f.month)} ${exInfo("projection")}</h3><h4>Expected income ${exInfo("net")}</h4>${exBudgetRows(f.incomeRows)}<div class="ex-line"><span>Total expected income</span><b>${money(f.incomeCents)}</b></div><h4>Projected expenses</h4>${exBudgetRows(f.expenseRows)}<div class="ex-line"><span>Projected monthly costs</span><b>${money(f.expensesCents)}</b></div><div class="ex-line"><span>Planned reserve contribution ${exInfo("reserve")}</span><b>${money(f.reserveContributionCents)}</b></div><div class="ex-line"><span>Projected monthly margin ${exInfo("projection")}</span><b class="${f.marginCents < 0 ? "ex-negative" : "ex-positive"}">${money(f.marginCents)}</b></div></section><section class="ex-card"><h3>Reserve & security ${exInfo("reserve")}</h3><div class="ex-budget"><div><span>Available today ${exInfo("liquidity")}</span><b>${money(f.liquidCents)}</b></div><div><span>Existing outstanding balances ${exInfo("arrears")}</span><b>${money(f.arrearsCents)}</b></div><div><span>Target buffer · two months of costs</span><b>${money(f.targetReserveCents)}</b></div><div><span>Covered by current funds</span><b>${money(f.reserveCoveredCents)}</b></div><div><span>Forecast after expenses and reserve contribution ${exInfo("projection")}</span><b class="${f.projectedCents < 0 ? "ex-negative" : ""}">${money(f.projectedCents)}</b></div></div>${r.sim.age >= 18 ? `<form id="ex-reserve-form"><label>Set aside monthly for unexpected costs (€)<input id="ex-reserve" type="number" min="0" max="10000" step="1" required value="${f.reserveContributionCents / 100}"></label><button class="btn btn-teal small" type="submit">Save reserve plan</button></form>` : "<p>Household costs are planned by adult guardians. Your own allowance remains visible in your personal account.</p>"}<p class="ex-muted">${esc(f.scopeNote)}</p><div class="ex-note"><b>How I feel about my situation right now ${exInfo("emotion")}</b><p>${esc(report.lastAppraisal?.text || "The next personal budget review will take place as time advances.")}</p><small>A documented appraisal can moderately affect emotions and PERMA. Money alone creates neither meaning nor good relationships. ${exInfo("perma")}</small></div></section></div><section class="ex-card"><h3>Agreements & outstanding bills</h3>${r.loans
    .filter((l) => l.borrowerId === r.sim.id && l.status === "active")
    .map(
      (l) =>
        `<p>Remaining balance ${money(l.principalCents)} · monthly payment ${money(l.paymentCents)} ${exInfo("credit")}</p>`,
    )
    .join(
      "",
    )}${r.invoices.map((i) => `<div class="ex-line"><span>${esc({ rent: "Base rent", utilities: "Utilities", loan_payment: "Loan payment", membership: "Membership", care_copayment: "Care copayment" }[i.kind] || i.kind)} · due ${money(i.remainingCents)} ${exInfo("arrears")}</span>${exButton("pay_invoice", i.id, "Pay", !i.remainingCents)}</div>`).join("") || "<p>No outstanding bills.</p>"}${r.sim.age >= 18 ? '<button class="btn btn-soft small" id="ex-loan-plan">Review loan options</button> <button class="btn btn-soft small" id="ex-household-join">Review shared household</button>' : ""}</section>`;
}
function exApplicationHistory(r, kind) {
  const apps = (r.applications || []).filter((a) => a.kind === kind);
  return apps.length
    ? `<section class="ex-card"><h3>My past applications ${exInfo("application")}</h3>${apps.map((a) => `<div class="ex-line"><span>${esc(a.targetName || "Application")}<small>${exGameDate(a.at)} · ${a.status === "accepted" ? "Accepted" : "Declined"} · W100 ${a.roll} / Chance ${Math.floor(a.probability * 100)}%</small><small>${esc(a.reason)}</small></span></div>`).join("")}</section>`
    : "";
}
function exEducationHtml(r) {
  const e = r.education,
    c = r.care,
    s = e.status,
    contract = r.employment;
  return `<div class="ex-section-heading"><small>MY PATH · MY OPPORTUNITIES</small><h2>Work & education ${exInfo("education")}</h2></div><div class="ex-grid"><section class="ex-card"><h3>Current: ${esc(s.label)} ${exInfo("status")}</h3><p>${esc(contract?.firmName || s.placeName || (s.kind === "unemployed" ? "I am looking for a suitable job." : "No current employment contract."))}</p>${r.workplace?`<p>${esc(r.workplace.name)}</p><button class="btn btn-teal small" data-workplace-scene="${esc(r.workplace.id)}">Visit workplace →</button>`:""}${contract ? `<div class="ex-probs"><span>${money(contract.grossMonthlyCents)} gross ${exInfo("gross")}</span><span>approx. ${money(contract.estimatedNetCents)} net ${exInfo("net")}</span><span>${contract.hoursPerDay} hours per workday</span></div>${contract.leave ? '<p class="ex-note">The contract is paused during the agreed caregiving leave.</p>' : ""}<p>Paid work actually completed: ${Math.round(e.careerHours * 10) / 10} hours.</p>` : ""}${e.current ? `<div class="ex-note"><b>${esc(e.current.institution)}</b><p>${esc(e.current.field)} · planned through ${esc(e.current.endDate)}</p><small>${Math.round(e.studyHours * 10) / 10} observed study hours since the simulation began. ${e.current.completionPending ? "Documented study hours or attendance are still needed to complete the program." : ""}</small></div>` : ""}${r.sim.age >= 18 && r.sim.age < 66 && !c.received ? '<button class="btn btn-teal small" data-ex-open-tab="jobs">View suitable jobs →</button>' : c.received ? '<button class="btn btn-teal small" data-ex-open-tab="finances">View costs & support →</button>' : '<button class="btn btn-teal small" data-ex-open-tab="leisure">Leisure & next steps →</button>'}</section><section class="ex-card"><h3>${r.sim.age >= 66 || c.received ? "What I am still interested in" : "Career goals & development"} ${exInfo("goal")}</h3>${e.ambitions.map((g) => exMeter(g.title_de || g.title || g.kind, g.progress || 0, 1, "goal")).join("") || "<p>A suitable work routine and good care matter more right now than a new career step.</p>"}<details><summary>Skills for future steps ${exInfo("skill")}</summary>${r.skills.map((x) => exMeter(x.name, x.value)).join("")}</details><p>Success can strengthen what I believe I can do: self-efficacy ${exInfo("self_efficacy")}.</p><p class="ex-muted">A qualification complements your abilities. Wealth does not replace practical skills or a required professional license.</p></section></div><section class="ex-card"><h3>My education ${exInfo("education")}</h3><p class="ex-muted">Entries marked “background biography” are plausible procedural additions. They do not claim that attendance in earlier years was actually simulated.</p><ol class="ex-timeline">${e.history.map((x) => `<li><div class="ex-timeline-top"><b>${esc({ kindergarten: "Kindergarten", primary: "Primary school", secondary: "Secondary school", university: "University", vocational: "Vocational training" }[x.kind] || x.kind)}</b><span class="ex-chip">${esc({ completed: "Completed", enrolled: "Currently enrolled", unverified: "Qualification not verified" }[x.status] || x.status)}</span></div><p>${esc(x.institution)} · ${esc(x.town)}</p><p>${esc(x.field)}</p><small>${esc(x.startDate)} – ${esc(x.actualCompletedAt != null ? exGameDate(x.actualCompletedAt) : x.endDate)} · ${x.sourceEventId ? "Actually documented" : "Background biography"}</small><p>${x.qualification ? `Qualification: ${esc(x.qualification)}` : `Expected qualification: ${esc(x.plannedQualification || "no formal qualification")}`} ${x.grade != null ? "· Grade " + x.grade.toLocaleString(getLang()==="en"?"en-US":"de-DE") + " " + esc(x.gradeScale||"") + " " + exInfo("grade") : ""}</p></li>`).join("") || "<li>No education history yet. It begins later for very young children.</li>"}</ol><details><summary>Professional credentials & employment</summary><p>${esc(e.note || "")}</p><p>${(e.credentials || []).map((x) => esc(x)).join(" · ") || "No special professional credentials yet."}</p>${e.employmentHistory.map((x) => `<div class="ex-line"><span>${esc(x.firmName || "Previous employer")}<small>${esc(x.role || x.title || "Employment contract")} · ${esc(x.status === "active" ? "active" : "ended")} · ${x.startedAt != null ? exGameDate(x.startedAt) : "Background contract"}</small></span></div>`).join("")}</details></section>${c.received || c.given.length ? `<section class="ex-card"><h3>Care & family support ${exInfo("care")}</h3>${c.received ? `<p><b>${c.received.mode === "residential" ? "Living at Lindenblick Senior Home" : "Support at home"}</b> · ${c.received.level === "high" ? "elevated" : "moderate"} support needs ${exInfo("care_insurance")}</p><p>Agreed copayment: ${money(c.received.monthlyCopayCents)} for the simulation month · funded care: ${money(c.received.monthlyInsuranceCents)}.</p><p>${c.received.caregivers.length ? "Agreed family caregivers: " + c.received.caregivers.map((q) => esc(q.name)).join(", ") : "Agreed professional care is provided by a funded external care service."}</p><small>${c.received.lastFamilyEventId ? "Last supported by family: " + exGameDate(c.received.lastFamilyDay * 86400) + ". " : ""}${c.received.lastServiceEventId ? "Last professional service: " + exGameDate(c.received.lastServiceDay * 86400) : "Professional care is recorded only after it has actually been delivered."}</small>` : ""}${c.given.length ? `<h4>I support my family</h4>${c.given.map((q) => `<div class="ex-line"><span>${esc(q.name)}<small>Agreed early-evening visit · support requires being there, time, and energy.</small></span><button class="btn btn-soft small" data-ex-social-profile="${esc(q.id)}">Profile</button><button class="btn btn-teal small" data-ex-social-play="${esc(q.id)}">Play scene</button></div>`).join("")}<p>Professional care complements family support. A visit is postponed if someone is hungry or severely exhausted; lack of time does not create automatic blame.</p>` : ""}<p class="ex-muted">${esc(c.note)}</p></section>` : ""}${
    r.children?.filter((q) => q.age >= 15).length
      ? `<section class="ex-card"><h3>My children’s holiday jobs</h3>${r.children
          .filter((q) => q.age >= 15)
          .map(
            (q) =>
              `<div class="ex-line"><span>${esc(q.name)} · ages 15–17<small>School holidays only · no more than four hours per day · safe jobs</small></span><button class="btn btn-soft small" data-ex-guardian="${q.id}" data-enabled="${!q.holidayPermission}">${q.holidayPermission ? "Revoke permission" : "Review permission"}</button></div>`,
          )
          .join("")}</section>`
      : ""
  }${exApplicationHistory(r, "job")}`;
}
