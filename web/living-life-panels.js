/* Dedicated personal finances and education views; loaded before town-life rendering. */
"use strict";
function exGameDate(seconds) {
  return new Date(Date.UTC(2026, 8, 21) + seconds * 1000).toLocaleDateString(
    "de-DE",
  );
}
function exMonthName(key) {
  return new Date(key + "-01T12:00:00Z").toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });
}
function exBudgetRows(rows) {
  return rows
    .map(
      (x) =>
        `<div class="ex-line"><span>${exExplain(x.label, { rent: "cold_rent", utilities: "warm_rent", food: "need", loan: "credit", membership: "projection", care: "care_insurance", payroll: "net" }[x.kind] || "projection")}<small>${esc({ contract: "Vereinbart", estimate: "Geschätzt", plan: "Geplant", requires_actual_work_and_funded_payroll: "Erfordert tatsächliche Arbeit und finanzierte Auszahlung", approved: "Bewilligt" }[x.certainty] || "")}</small></span><b>${money(x.amountCents)}</b></div>`,
    )
    .join("");
}
function exStatementHtml(s) {
  return `<div class="ex-stats"><div><small>${exExplain("Eingegangene Einnahmen", "net")}</small><b>${money(s.incomeCents)}</b></div><div><small>Bezahlte Ausgaben ${exInfo("liquidity")}</small><b>${money(s.spendingCents)}</b></div><div><small>Ergebnis ohne Vermögensverschiebungen ${exInfo("liquidity")}</small><b class="${s.netCents < 0 ? "ex-negative" : "ex-positive"}">${money(s.netCents)}</b></div><div><small>Belegte Buchungen</small><b>${s.transactionCount}</b></div></div>${s.coverage !== "recorded_period" ? `<p class="ex-note">${s.coverage === "no_recorded_history" ? "Für diesen Monat gibt es noch keine gespeicherten Buchungen." : "Dieser Monat ist erst ab Simulationsbeginn dokumentiert; die Übersicht ist daher unvollständig."} Es werden keine früheren Gehälter oder Ausgaben erfunden.</p>` : ""}<div class="ex-grid">${[
    "income",
    "spending",
  ]
    .map(
      (dir) =>
        `<section class="ex-card"><h3>${dir === "income" ? "Einnahmen" : "Ausgaben"} nach Kategorien</h3>${
          s.categories
            .filter((c) => c.direction === dir)
            .map(
              (c) =>
                `<div class="ex-line"><span>${exExplain(c.label, c.kind === "payroll" ? "net" : c.kind === "rent" ? "cold_rent" : c.kind === "utilities" ? "warm_rent" : c.kind === "care_copayment" ? "care_insurance" : c.kind === "loan_payment" ? "credit" : "liquidity")}<small>${c.count} tatsächliche ${c.count === 1 ? "Buchung" : "Buchungen"}</small></span><b>${money(c.amountCents)}</b></div>`,
            )
            .join("") ||
          "<p>Noch keine belegten Zahlungen in diesem Bereich.</p>"
        }</section>`,
    )
    .join(
      "",
    )}</div>${s.payroll.grossCents ? `<section class="ex-card"><h3>So wurde der ausgezahlte Lohn berechnet</h3><div class="ex-budget"><div><span>${exExplain("Bruttolohn", "gross")}</span><b>${money(s.payroll.grossCents)}</b></div><div><span>Fiktive Einkommensteuer ${exInfo("gross")}</span><b>− ${money(s.payroll.taxCents)}</b></div><div><span>${exExplain("Arbeitnehmer-Sozialabgaben", "social_insurance")}</span><b>− ${money(s.payroll.employeeSocialCents)}</b></div><div><span>${exExplain("Ausgezahltes Netto", "net")}</span><b>${money(s.payroll.netCents)}</b></div></div><p class="ex-muted">Die Abzüge erklären den Nettolohn. Sie werden nicht noch einmal als Ausgabe vom Netto abgezogen.</p></section>` : ""}<details><summary>Überweisungen, Kautionen und Finanzierung gesondert ${exInfo("deposit")}</summary><div class="ex-budget"><div><span>Interne / gebundene Mittel eingegangen</span><b>${money(s.transferInCents)}</b></div><div><span>Interne / gebundene Mittel abgegangen</span><b>${money(s.transferOutCents)}</b></div><div><span>Finanzierung / Vermögen eingegangen ${exInfo("credit")}</span><b>${money(s.financingInCents)}</b></div><div><span>Finanzierung / Vermögen abgegangen</span><b>${money(s.financingOutCents)}</b></div></div><p>Überweisungen zwischen eigenem und gemeinsamem Konto ergeben in der kombinierten Sicht null. Startvermögen und Kredite sind kein verdientes Einkommen.</p></details><details class="ex-transactions"><summary>Einzelbuchungen (${s.transactionCount})</summary>${s.transactions.map((t) => `<div class="ex-line"><span>${esc(t.label)}<small>${exGameDate(t.at)} · ${esc(t.classification === "transfer" ? "Mittelverschiebung" : t.classification === "financing" ? "Finanzierung / Vermögen" : "Zahlung")}</small></span><b class="${t.amountCents < 0 ? "ex-negative" : ""}">${money(t.amountCents)}</b></div>`).join("") || "<p>Keine Buchungen.</p>"}${s.offset > 0 ? '<button class="btn btn-soft small" data-ex-ledger-page="' + Math.max(0, s.offset - s.limit) + '">← Vorherige Buchungen</button> ' : ""}${s.offset + s.limit < s.transactionCount ? '<button class="btn btn-soft small" data-ex-ledger-page="' + (s.offset + s.limit) + '">Weitere Buchungen →</button>' : ""}<small>${s.transactionCount ? "Angezeigt " + (s.offset + 1) + "–" + Math.min(s.offset + s.limit, s.transactionCount) + ". " : ""}${esc(s.coverageNote)}</small></details>`;
}
let exFinancePeriod = "previous",
  exFinanceScope = "combined",
  exFinanceReport = null;
function exFinanceHtml(r) {
  const report = exFinanceReport || r.finances,
    f = report.next,
    s = report[exFinancePeriod];
  return `<div class="ex-section-heading"><div><small>KLARER PLAN · ECHTE BUCHUNGEN</small><h2>Finanzen ${exInfo("liquidity")}</h2><p>${esc(r.household.name)} · ${r.household.members.map((m) => esc(m.name)).join(", ")}</p></div></div><section class="ex-card"><h3>Monatsrückblick</h3><div class="ex-filter-row"><label>Zeitraum<select id="ex-finance-period"><option value="previous" ${exFinancePeriod === "previous" ? "selected" : ""}>Letzter Monat · ${exMonthName(report.previous.key)}</option><option value="current" ${exFinancePeriod === "current" ? "selected" : ""}>Aktueller Monat · ${exMonthName(report.current.key)} bisher</option></select></label><label>Konten<select id="ex-finance-scope">${[
    ["combined", "Eigenes + gemeinsames Konto"],
    ["personal", "Nur eigenes Konto"],
    ["household", "Nur gemeinsames Konto"],
  ]
    .map(
      ([id, label]) =>
        `<option value="${id}" ${exFinanceScope === id ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select></label></div>${exStatementHtml(s)}</section><div class="ex-grid"><section class="ex-card"><h3>Nächster Monat · ${exMonthName(f.month)} ${exInfo("projection")}</h3><h4>Erwartete Einnahmen ${exInfo("net")}</h4>${exBudgetRows(f.incomeRows)}<div class="ex-line"><span>Erwartete Einnahmen insgesamt</span><b>${money(f.incomeCents)}</b></div><h4>Voraussichtliche Ausgaben</h4>${exBudgetRows(f.expenseRows)}<div class="ex-line"><span>Voraussichtliche Monatskosten</span><b>${money(f.expensesCents)}</b></div><div class="ex-line"><span>Geplante Rücklage ${exInfo("reserve")}</span><b>${money(f.reserveContributionCents)}</b></div><div class="ex-line"><span>Geplanter monatlicher Spielraum ${exInfo("projection")}</span><b class="${f.marginCents < 0 ? "ex-negative" : "ex-positive"}">${money(f.marginCents)}</b></div></section><section class="ex-card"><h3>Reserve & Sicherheit ${exInfo("reserve")}</h3><div class="ex-budget"><div><span>Heute zugänglich ${exInfo("liquidity")}</span><b>${money(f.liquidCents)}</b></div><div><span>Bestehende offene Forderungen ${exInfo("arrears")}</span><b>${money(f.arrearsCents)}</b></div><div><span>Zielpuffer · zwei Monatskosten</span><b>${money(f.targetReserveCents)}</b></div><div><span>Durch heutige Mittel abgedeckt</span><b>${money(f.reserveCoveredCents)}</b></div><div><span>Prognose nach Kosten und Rücklagenplanung ${exInfo("projection")}</span><b class="${f.projectedCents < 0 ? "ex-negative" : ""}">${money(f.projectedCents)}</b></div></div>${r.sim.age >= 18 ? `<form id="ex-reserve-form"><label>Monatlich für Ungeplantes einplanen (€)<input id="ex-reserve" type="number" min="0" max="10000" step="1" required value="${f.reserveContributionCents / 100}"></label><button class="btn btn-teal small" type="submit">Rücklagenplan speichern</button></form>` : "<p>Die Haushaltskosten werden von den erwachsenen Bezugspersonen geplant. Das eigene Taschengeld bleibt im persönlichen Konto sichtbar.</p>"}<p class="ex-muted">${esc(f.scopeNote)}</p><div class="ex-note"><b>Wie ich meine Lage gerade erlebe ${exInfo("emotion")}</b><p>${esc(report.lastAppraisal?.text || "Die nächste persönliche Budgetprüfung findet beim Zeitfortschritt statt.")}</p><small>Eine tatsächlich dokumentierte Einschätzung verändert Gefühle und PERMA moderat. Geld allein erzeugt weder Sinn noch gute Beziehungen. ${exInfo("perma")}</small></div></section></div><section class="ex-card"><h3>Verträge & offene Rechnungen</h3>${r.loans
    .filter((l) => l.borrowerId === r.sim.id && l.status === "active")
    .map(
      (l) =>
        `<p>Restschuld ${money(l.principalCents)} · monatliche Rate ${money(l.paymentCents)} ${exInfo("credit")}</p>`,
    )
    .join(
      "",
    )}${r.invoices.map((i) => `<div class="ex-line"><span>${esc({ rent: "Kaltmiete", utilities: "Nebenkosten", loan_payment: "Kreditrate", membership: "Mitgliedschaft", care_copayment: "Pflege-Eigenanteil" }[i.kind] || i.kind)} · offen ${money(i.remainingCents)} ${exInfo("arrears")}</span>${exButton("pay_invoice", i.id, "Bezahlen", !i.remainingCents)}</div>`).join("") || "<p>Keine offenen Rechnungen.</p>"}${r.sim.age >= 18 ? '<button class="btn btn-soft small" id="ex-loan-plan">Finanzierten Kredit prüfen</button> <button class="btn btn-soft small" id="ex-household-join">Gemeinsamen Haushalt prüfen</button>' : ""}</section>`;
}
function exApplicationHistory(r, kind) {
  const apps = (r.applications || []).filter((a) => a.kind === kind);
  return apps.length
    ? `<section class="ex-card"><h3>Meine bisherigen Bewerbungen ${exInfo("application")}</h3>${apps.map((a) => `<div class="ex-line"><span>${esc(a.targetName || "Bewerbung")}<small>${exGameDate(a.at)} · ${a.status === "accepted" ? "Zusage" : "Absage"} · W100 ${a.roll} / Chance ${Math.floor(a.probability * 100)}%</small><small>${esc(a.reason)}</small></span></div>`).join("")}</section>`
    : "";
}
function exEducationHtml(r) {
  const e = r.education,
    c = r.care,
    s = e.status,
    contract = r.employment;
  return `<div class="ex-section-heading"><small>MEIN WEG · MEINE MÖGLICHKEITEN</small><h2>Arbeit & Bildung ${exInfo("education")}</h2></div><div class="ex-grid"><section class="ex-card"><h3>Aktuell: ${esc(s.label)} ${exInfo("status")}</h3><p>${esc(contract?.firmName || s.placeName || (s.kind === "unemployed" ? "Ich suche eine passende Stelle." : "Zurzeit kein Arbeitsvertrag."))}</p>${contract ? `<div class="ex-probs"><span>${money(contract.grossMonthlyCents)} brutto ${exInfo("gross")}</span><span>ca. ${money(contract.estimatedNetCents)} netto ${exInfo("net")}</span><span>${contract.hoursPerDay} Stunden am Arbeitstag</span></div>${contract.leave ? '<p class="ex-note">Der Vertrag ruht während der vereinbarten Betreuungspause.</p>' : ""}<p>Bereits tatsächlich geleistete bezahlte Arbeit: ${Math.round(e.careerHours * 10) / 10} Stunden.</p>` : ""}${e.current ? `<div class="ex-note"><b>${esc(e.current.institution)}</b><p>${esc(e.current.field)} · geplant bis ${esc(e.current.endDate)}</p><small>${Math.round(e.studyHours * 10) / 10} beobachtete Lernstunden seit Simulationsbeginn. ${e.current.completionPending ? "Für den Abschluss fehlen noch dokumentierte Lernstunden oder Anwesenheit." : ""}</small></div>` : ""}${r.sim.age >= 18 && r.sim.age < 66 && !c.received ? '<button class="btn btn-teal small" data-ex-open-tab="jobs">Passende Stellen ansehen →</button>' : c.received ? '<button class="btn btn-teal small" data-ex-open-tab="finances">Kosten & Unterstützung ansehen →</button>' : '<button class="btn btn-teal small" data-ex-open-tab="leisure">Freizeit & nächste Schritte →</button>'}</section><section class="ex-card"><h3>${r.sim.age >= 66 || c.received ? "Was mich weiter interessiert" : "Berufliche Wünsche & Entwicklung"} ${exInfo("goal")}</h3>${e.ambitions.map((g) => exMeter(g.title_de || g.title || g.kind, g.progress || 0, 1, "goal")).join("") || "<p>Ein passender Arbeitsalltag und eine gute Versorgung sind momentan wichtiger als ein neuer Karriereschritt.</p>"}<details><summary>Fertigkeiten für nächste Schritte ${exInfo("skill")}</summary>${r.skills.map((x) => exMeter(x.name, x.value)).join("")}</details><p>Erlebtes Gelingen kann stärken, was ich mir selbst zutraue: Selbstwirksamkeit ${exInfo("self_efficacy")}.</p><p class="ex-muted">Ein Bildungsabschluss ergänzt Können. Ein hohes Vermögen ersetzt weder praktische Fertigkeiten noch eine nötige Berufszulassung.</p></section></div><section class="ex-card"><h3>Mein Bildungsweg ${exInfo("education")}</h3><p class="ex-muted">Einträge „Ausgangsbiografie“ sind plausible prozedurale Ergänzungen. Sie behaupten keine tatsächlich simulierte Anwesenheit in früheren Jahren.</p><ol class="ex-timeline">${e.history.map((x) => `<li><div class="ex-timeline-top"><b>${esc({ kindergarten: "Kindergarten", primary: "Grundschule", secondary: "Weiterführende Schule", university: "Hochschule", vocational: "Berufsausbildung" }[x.kind] || x.kind)}</b><span class="ex-chip">${esc({ completed: "Abgeschlossen", enrolled: "Derzeit eingeschrieben", unverified: "Abschluss nicht nachgewiesen" }[x.status] || x.status)}</span></div><p>${esc(x.institution)} · ${esc(x.town)}</p><p>${esc(x.field)}</p><small>${esc(x.startDate)} – ${esc(x.actualCompletedAt != null ? exGameDate(x.actualCompletedAt) : x.endDate)} · ${x.sourceEventId ? "Tatsächlich dokumentiert" : "Ausgangsbiografie"}</small><p>${x.qualification ? `Abschluss: ${esc(x.qualification)}` : `Geplanter Abschluss: ${esc(x.plannedQualification || "kein formaler Abschluss")}`} ${x.grade != null ? "· Ergebnis " + x.grade.toLocaleString("de-DE") + " " + exInfo("grade") : ""}</p></li>`).join("") || "<li>Noch keine Bildungsstation. Bei Kleinkindern beginnt der Weg später.</li>"}</ol><details><summary>Berufliche Nachweise & Arbeitsverträge</summary><p>${esc(e.note || "")}</p><p>${(e.credentials || []).map((x) => esc(x)).join(" · ") || "Noch keine besonderen Berufsnachweise."}</p>${e.employmentHistory.map((x) => `<div class="ex-line"><span>${esc(x.firmName || "Früherer Betrieb")}<small>${esc(x.role || x.title || "Arbeitsvertrag")} · ${esc(x.status === "active" ? "aktiv" : "beendet")} · ${x.startedAt != null ? exGameDate(x.startedAt) : "Ausgangsvertrag"}</small></span></div>`).join("")}</details></section>${c.received || c.given.length ? `<section class="ex-card"><h3>Pflege & Familienbetreuung ${exInfo("care")}</h3>${c.received ? `<p><b>${c.received.mode === "residential" ? "Wohnen im Seniorenhaus Lindenblick" : "Unterstützung zu Hause"}</b> · ${c.received.level === "high" ? "erhöhter" : "moderater"} Unterstützungsbedarf ${exInfo("care_insurance")}</p><p>Vereinbarter Eigenanteil: ${money(c.received.monthlyCopayCents)} im Spielmonat · finanzierte Leistung: ${money(c.received.monthlyInsuranceCents)}.</p><p>${c.received.caregivers.length ? "Vereinbarte Angehörige: " + c.received.caregivers.map((q) => esc(q.name)).join(", ") : "Die vereinbarte professionelle Versorgung erfolgt durch einen finanzierten externen Pflegedienst."}</p><small>${c.received.lastFamilyEventId ? "Zuletzt durch Angehörige unterstützt: " + exGameDate(c.received.lastFamilyDay * 86400) + ". " : ""}${c.received.lastServiceEventId ? "Letzte professionelle Leistung: " + exGameDate(c.received.lastServiceDay * 86400) : "Eine professionelle Leistung wird erst nach tatsächlicher Durchführung dokumentiert."}</small>` : ""}${c.given.length ? `<h4>Ich unterstütze meine Familie</h4>${c.given.map((q) => `<div class="ex-line"><span>${esc(q.name)}<small>Vereinbarter Besuch am frühen Abend · Unterstützung benötigt reale Anwesenheit, Zeit und Kraft.</small></span><button class="btn btn-soft small" data-ex-social-profile="${esc(q.id)}">Profil</button><button class="btn btn-teal small" data-ex-social-play="${esc(q.id)}">Szene</button></div>`).join("")}<p>Professionelle Hilfe ergänzt die Familie. Bei Hunger und starker Erschöpfung wird ein Besuch verschoben; aus fehlender Zeit folgt keine automatische Schuld.</p>` : ""}<p class="ex-muted">${esc(c.note)}</p></section>` : ""}${
    r.children?.filter((q) => q.age >= 15).length
      ? `<section class="ex-card"><h3>Ferienjobs meiner Kinder</h3>${r.children
          .filter((q) => q.age >= 15)
          .map(
            (q) =>
              `<div class="ex-line"><span>${esc(q.name)} · 15–17 Jahre<small>Nur Ferien · höchstens vier Stunden pro Tag · sichere Stellen</small></span><button class="btn btn-soft small" data-ex-guardian="${q.id}" data-enabled="${!q.holidayPermission}">${q.holidayPermission ? "Erlaubnis widerrufen" : "Erlaubnis prüfen"}</button></div>`,
          )
          .join("")}</section>`
      : ""
  }${exApplicationHistory(r, "job")}`;
}
